<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// ==== 1. Конфигурация (вне public_html) ====
$config_path = __DIR__ . '/../config.php';
if (!file_exists($config_path)) {
    error_log('[send.php] config.php not found');
    http_response_code(500);
    exit('Ошибка конфигурации. Позвоните: +7 (939) 440-40-01.');
}
$config = require $config_path;

// ==== 2. PHPMailer ====
$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    error_log('[send.php] PHPMailer not installed');
    http_response_code(500);
    exit('Ошибка сервера. Позвоните: +7 (939) 440-40-01.');
}
require $autoload;

// ==== 3. Утилита очистки ====
function clean(string $value, int $max = 2000): string
{
    $value = trim($value);
    if (mb_strlen($value) > $max) {
        $value = mb_substr($value, 0, $max);
    }
    return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

// ==== 4. Rate limiting (файловый, 3 заявки в минуту с одного IP) ====
function checkRateLimit(string $ip, int $maxRequests = 3, int $windowSeconds = 60): bool
{
    $dir = sys_get_temp_dir() . '/tochtex_rate';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    if (!is_dir($dir) || !is_writable($dir)) {
        error_log('[send.php] Rate limit dir not writable');
        return true;
    }

    $file = $dir . '/' . md5($ip);
    $now  = time();

    $data = [];
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if ($raw !== false) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $data = $decoded;
            }
        }
    }

    $data = array_filter($data, static fn($t) => ($now - (int)$t) < $windowSeconds);

    if (count($data) >= $maxRequests) {
        return false;
    }

    $data[] = $now;
    @file_put_contents($file, json_encode(array_values($data)), LOCK_EX);
    return true;
}

// ==== 5. Отправка в Telegram (cURL, без библиотек) ====
function sendTelegram(string $text, array $config): bool
{
    if (empty($config['tg_bot_token']) || empty($config['tg_chat_id'])) {
        error_log('[send.php] TG: token or chat_id not configured');
        return false;
    }

    $url = 'https://api.telegram.org/bot' . $config['tg_bot_token'] . '/sendMessage';
    $payload = http_build_query([
        'chat_id'                  => $config['tg_chat_id'],
        'text'                     => $text,
        'parse_mode'               => 'HTML',
        'disable_web_page_preview' => true,
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err      = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        error_log('[send.php] TG cURL: ' . $err);
        return false;
    }
    if ($httpCode >= 200 && $httpCode < 300) {
        return true;
    }
    error_log('[send.php] TG HTTP ' . $httpCode . ': ' . $response);
    return false;
}

// ==== 6. Приём данных ====
$name    = clean($_POST['name']    ?? '', 200);
$phone   = clean($_POST['phone']   ?? '', 50);
$email   = clean($_POST['email']   ?? '', 200);
$service = clean($_POST['service'] ?? '', 200);
$message = clean($_POST['message'] ?? '', 5000);

// ==== 7. Honeypot ====
if (!empty($_POST['website'] ?? '')) {
    header('Location: thanks.html');
    exit;
}

// ==== 8. Rate limiting по IP ====
$client_ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!checkRateLimit($client_ip)) {
    http_response_code(429);
    exit('Слишком много заявок. Попробуйте через минуту или позвоните: +7 (939) 440-40-01.');
}

// ==== 9. Валидация обязательных полей ====
if ($name === '' || $phone === '') {
    http_response_code(400);
    exit('Ошибка: имя и телефон обязательны.');
}

// ==== 10. Проверка согласия 152-ФЗ ====
if (empty($_POST['privacy_consent'])) {
    http_response_code(400);
    exit('Необходимо согласие на обработку персональных данных.');
}

// ==== 11. Валидация email ====
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    exit('Ошибка: некорректный email.');
}

// ==== 12. Обработка файла ====
$attachment_path = null;
$attachment_name = null;
$attachment_size = 0;

if (isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        exit('Ошибка загрузки файла. Позвоните: +7 (939) 440-40-01.');
    }

    if (!is_uploaded_file($file['tmp_name'])) {
        error_log('[send.php] is_uploaded_file failed');
        http_response_code(400);
        exit('Ошибка загрузки файла.');
    }

    if ($file['size'] > 30 * 1024 * 1024) {
        http_response_code(400);
        exit('Файл слишком большой (макс. 30 МБ).');
    }

    $orig_name = basename($file['name']);
    $ext = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));

    $ext_to_mimes = [
        'pdf'  => ['application/pdf'],
        'jpg'  => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'png'  => ['image/png'],
        'dxf'  => ['image/vnd.dxf', 'application/dxf', 'application/x-dxf', 'application/octet-stream', 'text/plain'],
        'dwg'  => ['image/vnd.dwg', 'application/acad', 'application/x-autocad', 'application/octet-stream'],
        'step' => ['application/step', 'application/x-step', 'application/octet-stream', 'text/plain'],
        'stp'  => ['application/step', 'application/x-step', 'application/octet-stream', 'text/plain'],
    ];

    if (!isset($ext_to_mimes[$ext])) {
        http_response_code(400);
        exit('Недопустимое расширение файла. Разрешены: DXF, DWG, STEP, STP, PDF, JPG, PNG.');
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mime, $ext_to_mimes[$ext], true)) {
        error_log("[send.php] MIME mismatch: ext=$ext, mime=$mime, name=$orig_name");
        http_response_code(400);
        exit('Недопустимый тип файла. Разрешены: DXF, DWG, STEP, STP, PDF, JPG, PNG.');
    }

    $orig_name = preg_replace('/[^\w\s\.\-\(\)\[\]]/u', '_', $orig_name);
    $orig_name = mb_substr($orig_name, 0, 200);

    $attachment_path = $file['tmp_name'];
    $attachment_name = $orig_name;
    $attachment_size = $file['size'];
}

// ==== 13. Тело письма ====
$subject = 'Новая заявка с сайта tochtex.ru';

$body  = "Новая заявка с сайта tochtex.ru\n";
$body .= "=====================================\n\n";
$body .= "Имя:             $name\n";
$body .= "Телефон:         $phone\n";
$body .= "Email:           " . ($email ?: 'не указан') . "\n";
$body .= "Услуга:          " . ($service ?: 'не выбрана') . "\n";
$body .= "Согласие 152-ФЗ: получено\n";
if ($attachment_name) {
    $body .= "Файл:            $attachment_name (" . round($attachment_size / 1024, 1) . " КБ)\n";
} else {
    $body .= "Файл:            не прикреплён\n";
}
$body .= "\nСообщение:\n";
$body .= ($message ?: '(не указано)') . "\n\n";
$body .= "=====================================\n";
$body .= "IP:    " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";
$body .= "Время: " . date('Y-m-d H:i:s') . "\n";

// ==== 14. Уведомление в Telegram ====
// $name/$phone/$email/$message уже прошли через clean() (htmlspecialchars),
// значит безопасны для parse_mode=HTML.
$tgText  = "🔥 <b>Новая заявка с сайта</b>\n\n";
$tgText .= "<b>Имя:</b> {$name}\n";
$tgText .= "<b>Телефон:</b> {$phone}\n";
$tgText .= "<b>Email:</b> " . ($email ?: 'не указан') . "\n";
$tgText .= "<b>Услуга:</b> " . ($service ?: 'не выбрана') . "\n";
$tgText .= "<b>Сообщение:</b> " . ($message ?: '(не указано)') . "\n";
if ($attachment_name) {
    $tgText .= "<b>Файл:</b> {$attachment_name} (" . round($attachment_size / 1024, 1) . " КБ) — см. письмо\n";
}
$tgText .= "\n<i>IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . " · " . date('d.m.Y H:i') . "</i>";

$tgSent = sendTelegram($tgText, $config);

// ==== 15. Отправка email через PHPMailer ====
$mailSent = false;
$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host       = $config['smtp_host'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $config['smtp_user'];
    $mail->Password   = $config['smtp_pass'];
    $mail->SMTPSecure = $config['smtp_secure'];
    $mail->Port       = $config['smtp_port'];
    $mail->CharSet    = 'UTF-8';
    $mail->Encoding   = 'base64';

    $mail->setFrom($config['from_email'], $config['from_name']);
    $mail->addAddress($config['to_email'], 'Менеджер ТочТех');
    if ($email !== '') {
        $mail->addReplyTo($email, $name);
    }

    $mail->Subject = $subject;
    $mail->Body    = $body;
    $mail->isHTML(false);

    if ($attachment_path && $attachment_name) {
        $mail->addAttachment($attachment_path, $attachment_name);
    }

    $mail->send();
    $mailSent = true;

} catch (Exception $e) {
    error_log('[send.php] Mail send failed: ' . $mail->ErrorInfo);

} finally {
    if ($attachment_path && file_exists($attachment_path)) {
        @unlink($attachment_path);
    }
}

// ==== 16. Итог: успех, если сработал хотя бы один канал ====
if ($mailSent || $tgSent) {
    header('Location: thanks.html');
    exit;
}

error_log('[send.php] ALL channels failed: mail=' . ($mailSent ? '1' : '0') . ', tg=' . ($tgSent ? '1' : '0'));
http_response_code(500);
echo 'Ошибка отправки. Позвоните: +7 (939) 440-40-01.';
exit;