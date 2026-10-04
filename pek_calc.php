<?php
declare(strict_types=1);

use TochTex\Delivery\PekApi;

header('Content-Type: application/json; charset=utf-8');
mb_internal_encoding('UTF-8');

// ==== Content-Length ====
$maxLen = 100_000;
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxLen) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Слишком большой запрос'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==== Конфиг ====
$config_path = __DIR__ . '/../config.php';
if (!file_exists($config_path)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Ошибка конфигурации. Позвоните: +7 (939) 440-40-01'], JSON_UNESCAPED_UNICODE);
    exit;
}
$config = require $config_path;

$pekConfig = $config['delivery']['providers']['pek'] ?? null;
if (!$pekConfig || empty($pekConfig['enabled'])) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'Сервис расчёта недоступен'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==== Метод ====
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==== Rate limit: 10 расчётов / минуту с IP ====
function checkRateLimit(string $ip, int $max = 10, int $window = 60): bool
{
    $dir = sys_get_temp_dir() . '/tochtex_pek_rate';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (!is_dir($dir) || !is_writable($dir)) {
        error_log('[pek_calc] rate dir not writable');
        return true;
    }

    $file = $dir . '/' . md5($ip);
    $now  = time();

    $fp = @fopen($file, 'c+');
    if (!$fp) return true;

    @flock($fp, LOCK_EX);

    $raw = stream_get_contents($fp);
    $data = [];
    if ($raw !== false && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $data = $decoded;
    }

    $data = array_filter($data, static fn($t) => ($now - (int)$t) < $window);
    $ok = count($data) < $max;

    if ($ok) {
        $data[] = $now;
        @ftruncate($fp, 0);
        @rewind($fp);
        @fwrite($fp, json_encode(array_values($data)));
    }

    @flock($fp, LOCK_UN);
    @fclose($fp);

    return $ok;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!checkRateLimit($ip)) {
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'error'   => 'Слишком много запросов. Подождите минуту или позвоните: +7 (939) 440-40-01',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==== Приём данных ====
$input = file_get_contents('php://input');
$data  = json_decode($input, true);
if (!is_array($data)) $data = $_POST;

$toId        = isset($data['to_id']) ? (string)$data['to_id'] : '';
$placesRaw   = $data['places'] ?? null;
$withDeliver = !empty($data['with_deliver']);

// ==== Валидация города ====
if ($toId === '' || !preg_match('/^-?\d+$/', $toId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Некорректный город доставки'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ==== Валидация мест ====
if (is_string($placesRaw)) $placesRaw = json_decode($placesRaw, true);
if (!is_array($placesRaw) || empty($placesRaw)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Не переданы параметры груза'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (count($placesRaw) > 20) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Слишком много мест (макс. 20). Позвоните: +7 (939) 440-40-01'], JSON_UNESCAPED_UNICODE);
    exit;
}

$places = [];
foreach ($placesRaw as $p) {
    $l      = isset($p['l'])      ? (float)$p['l']      : 0;
    $w      = isset($p['w'])      ? (float)$p['w']      : 0;
    $h      = isset($p['h'])      ? (float)$p['h']      : 0;
    $weight = isset($p['weight']) ? (float)$p['weight'] : 0;

    if ($l <= 0 || $w <= 0 || $h <= 0 || $weight <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Габариты и вес должны быть больше нуля'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($l > 12 || $w > 12 || $h > 12 || $weight > 20000) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error'   => 'Слишком большой груз для онлайн-расчёта. Позвоните: +7 (939) 440-40-01',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $places[] = [
        'l'      => $l,
        'w'      => $w,
        'h'      => $h,
        'weight' => $weight,
        'oversized' => isset($p['oversized']) ? (bool)$p['oversized'] : null,
    ];
}

// ==== Вызов API ====
require __DIR__ . '/pek_api.php';

try {
    $api    = new PekApi($pekConfig);
    $result = $api->calculate($toId, $places, $withDeliver);

    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    error_log('[pek_calc] json_encode error: ' . $e->getMessage());
    http_response_code(500);
    echo '{"success":false,"error":"Ошибка кодирования ответа"}';
} catch (Throwable $e) {
    error_log('[pek_calc] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Ошибка расчёта. Позвоните: +7 (939) 440-40-01',
    ], JSON_UNESCAPED_UNICODE);
}