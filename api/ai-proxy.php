<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

// HTTPS-безопасные cookies
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', '1');
}
ini_set('session.cookie_httponly', '1');
ini_set('session.use_strict_mode', '1');

session_start();

// ============================================================
// 8.47: CORS whitelist
// ============================================================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $allowed_patterns = [
        '#^https://(www\.)?tochtex\.ru$#i',
        '#^https://[a-z0-9\-]+\.website\.yandexcloud\.net$#i',
        '#^http://localhost(:\d+)?$#i',
        '#^http://127\.0\.0\.1(:\d+)?$#i',
    ];
    $ok = false;
    foreach ($allowed_patterns as $p) {
        if (preg_match($p, $origin)) { $ok = true; break; }
    }
    if (!$ok) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Forbidden origin']);
        exit;
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

const FALLBACK_TEXT = 'Олег ушёл на обед. Перезвоните нам: +7 (939) 440-40-01 или оставьте заявку: https://tochtex.ru/index.html#contact';

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function error_out(string $userMsg, int $code = 200): void
{
    json_out(['reply' => $userMsg], $code);
}

// ============================================================
// 1. Конфиг
// ============================================================
$config_paths = [
    __DIR__ . '/../../config.php',
    __DIR__ . '/../config.php',
    __DIR__ . '/config.php',
];
$config = null;
foreach ($config_paths as $path) {
    if (file_exists($path)) { $config = require $path; break; }
}
if (!is_array($config)) {
    error_log('[ai-proxy] config.php not found');
    error_out(FALLBACK_TEXT);
}

// ============================================================
// 2. Input
// ============================================================
$raw = file_get_contents('php://input');
$input = json_decode((string)$raw, true);
if (!is_array($input)) {
    error_out('Некорректный запрос.');
}

$action = (string)($input['action'] ?? 'chat');

// ============================================================
// 3. Очистка чата
// ============================================================
if ($action === 'clear') {
    unset($_SESSION['ai_history']);
    json_out(['ok' => true]);
}

// ============================================================
// 4. Rate limit (10 запросов/мин)
// ============================================================
function checkRateLimit(string $ip, int $max = 10, int $window = 60): bool
{
    $dir = sys_get_temp_dir() . '/tochtex_ai_rate';
    if (!is_dir($dir)) { @mkdir($dir, 0700, true); }
    if (!is_dir($dir) || !is_writable($dir)) return true;
    
    $file = $dir . '/' . md5($ip);
    $now  = time();
    $data = [];
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if ($raw !== false) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) { $data = $decoded; }
        }
    }
    $data = array_filter($data, static fn($t) => ($now - (int)$t) < $window);
    if (count($data) >= $max) { return false; }
    $data[] = $now;
    @file_put_contents($file, json_encode(array_values($data)), LOCK_EX);
    return true;
}

$client_ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!checkRateLimit($client_ip)) {
    error_out('Слишком много запросов. Попробуйте через минуту или позвоните: +7 (939) 440-40-01.');
}

// ============================================================
// 5. Вопрос
// ============================================================
$user_message = trim((string)($input['message'] ?? ''));
if ($user_message === '' || mb_strlen($user_message) > 2000) {
    error_out('Пустой или слишком длинный вопрос.');
}

// ============================================================
// 6. Серверная капча
// ============================================================
function make_captcha(): array
{
    $a = random_int(2, 9);
    $b = random_int(2, 9);
    return ['q' => "Сколько будет $a + $b?", 'a' => (string)($a + $b)];
}

if (empty($_SESSION['captcha_passed'])) {
    $answer = isset($input['captcha_answer']) ? trim((string)$input['captcha_answer']) : null;

    if ($answer === null || $answer === '') {
        if (empty($_SESSION['captcha_expected'])) {
            $c = make_captcha();
            $_SESSION['captcha_question'] = $c['q'];
            $_SESSION['captcha_expected'] = $c['a'];
        }
        json_out([
            'captcha_required' => true,
            'question'         => $_SESSION['captcha_question'],
        ]);
    }

    if (hash_equals((string)($_SESSION['captcha_expected'] ?? ''), $answer)) {
        $_SESSION['captcha_passed'] = true;
        unset($_SESSION['captcha_expected'], $_SESSION['captcha_question']);
    } else {
        $c = make_captcha();
        $_SESSION['captcha_question'] = $c['q'];
        $_SESSION['captcha_expected'] = $c['a'];
        json_out([
            'captcha_required' => true,
            'question'         => $c['q'],
            'error'            => 'Неверный ответ. Попробуйте ещё раз.',
        ]);
    }
}

// ============================================================
// 7. История из $_SESSION
// ============================================================
if (!isset($_SESSION['ai_history']) || !is_array($_SESSION['ai_history'])) {
    $_SESSION['ai_history'] = [];
}

$messages = [['role' => 'system', 'text' => $config['system_prompt'] ?? '']];
foreach (array_slice($_SESSION['ai_history'], -8) as $m) {
    if (isset($m['role'], $m['text'])) {
        $messages[] = ['role' => $m['role'], 'text' => (string)$m['text']];
    }
}
$messages[] = ['role' => 'user', 'text' => $user_message];

// ============================================================
// 8. SSL verify
// ============================================================
$host = (string)($_SERVER['HTTP_HOST'] ?? '');
$is_local = (bool)preg_match('#^(localhost|127\.0\.0\.1)(:\d+)?$#i', $host);
$ssl_verify = !$is_local;

// ============================================================
// 9. Вызов ИИ
// ============================================================
function call_yandex(array $config, array $messages, bool $ssl_verify): ?string
{
    $payload = [
        'modelUri'          => $config['yandex']['model_uri'] ?? '',
        'completionOptions' => [
            'stream'      => false,
            'temperature' => 0.3,
            'maxTokens'   => 300,
        ],
        'messages' => $messages,
    ];

    $ch = curl_init('https://llm.api.cloud.yandex.net/foundationModels/v1/completion');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Api-Key ' . ($config['yandex']['api_key'] ?? ''),
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => $ssl_verify,
        CURLOPT_SSL_VERIFYHOST => $ssl_verify ? 2 : 0,
    ]);

    $t0 = microtime(true);
    $resp = curl_exec($ch);
    $dt = round(microtime(true) - $t0, 2);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    $text = null;
    $text_len = 0;
    if ($resp !== false) {
        $d = json_decode($resp, true);
        $text = $d['result']['alternatives'][0]['message']['text'] ?? null;
        if ($text !== null) { $text_len = strlen((string)$text); }
    }

    error_log('[ai-proxy/timing] http=' . $httpCode . ' time=' . $dt . 's text_len=' . $text_len);

    if ($resp === false) {
        error_log('[ai-proxy/yandex] cURL: ' . $err);
        return null;
    }
    if ($httpCode !== 200) {
        error_log('[ai-proxy/yandex] HTTP ' . $httpCode . ': ' . substr((string)$resp, 0, 500));
        return null;
    }
    if ($text === null || trim((string)$text) === '') {
        error_log('[ai-proxy/yandex] 200 но пустой text. Raw: ' . substr((string)$resp, 0, 500));
        return null;
    }

    return $text;
}

$provider = (string)($config['ai_provider'] ?? 'yandex');
$bot_text = null;

switch ($provider) {
    case 'yandex':
        $bot_text = call_yandex($config, $messages, $ssl_verify);
        break;
    case 'local':
        error_log('[ai-proxy/local] not implemented yet');
        break;
}

if (!$bot_text || trim($bot_text) === '') {
    error_out(FALLBACK_TEXT);
}

// ============================================================
// 10. Сохраняем историю
// ============================================================
$_SESSION['ai_history'][] = ['role' => 'user',      'text' => $user_message];
$_SESSION['ai_history'][] = ['role' => 'assistant', 'text' => $bot_text];
if (count($_SESSION['ai_history']) > 20) {
    $_SESSION['ai_history'] = array_slice($_SESSION['ai_history'], -20);
}

// ============================================================
// 11. Финальный ответ JSON
// ============================================================
json_out(['reply' => $bot_text]);