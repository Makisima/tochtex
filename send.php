<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// ==== 1. Конфигурация (вне public_html) ====
$config_path = __DIR__ . '/../config.php';
if (!file_exists($config_path)) {
    error_log('[send.php] config.php not found');
    http_response_code(500);
    exit('Ошибка конфигурации. Позвоните: +7 (903) 002-18-83.');
}
$config = require $config_path;

// ==== 2. PHPMailer ====
$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    error_log('[send.php] PHPMailer not installed');
    http_response_code(500);
    exit('Ошибка сервера. Позвоните: +7 (903) 002-18-83.');
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

// ==== 4. Приём данных ====
$name    = clean($_POST['name']    ?? '', 200);
$phone   = clean($_POST['phone']   ?? '', 50);
$email   = clean($_POST['email']   ?? '', 200);
$service = clean($_POST['service'] ?? '', 200);
$message = clean($_POST['message'] ?? '', 5000);

// ==== 5. Honeypot: боты заполняют скрытое поле, люди — нет ====
if (!empty($_POST['website'] ?? '')) {
    // Молча имитируем успех, чтобы бот не понял, что его отсеяли
    header('Location: thanks.html');
    exit;
}

// ==== 6. Валидация обязательных полей ====
if ($name === '' || $phone === '') {
    http_response_code(400);
    exit('Ошибка: имя и телефон обязательны.');
}

// ==== 7. Проверка согласия 152-ФЗ ====
if (empty($_POST['privacy_consent'])) {
    http_response_code(400);
    exit('Необходимо согласие на обработку персональных данных.');
}

// ==== 8. Валидация email ====
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    exit('Ошибка: некорректный email.');
}

// ==== 9. Обработка файла ====
$attachment_path = null;
$attachment_name = null;
$attachment_size = 0;

if (isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        exit('Ошибка загрузки файла. Позвоните: +7 (903) 002-18-83.');
    }

    // Лимит 30 МБ (в пределах лимита Beget 75 МБ)
    if ($file['size'] > 30 * 1024 * 1024) {
        http_response_code(400);
        exit('Файл слишком большой (макс. 30 МБ).');
    }

    // Проверка MIME через finfo
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowed_mimes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/acad',
        'image/vnd.dwg',
        'image/vnd.dxf',
        'application/dxf',
        'application/octet-stream', // некоторые DXF/DWG определяются так
    ];

    if (!in_array($mime, $allowed_mimes, true)) {
        http_response_code(400);
        exit('Недопустимый тип файла. Разрешены: DXF, DWG, PDF, JPG, PNG.');
    }

    // Проверка расширения
    $orig_name = basename($file['name']);
    $ext = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));
    if (!in_array($ext, ['dxf', 'dwg', 'pdf', 'jpg', 'jpeg', 'png'], true)) {
        http_response_code(400);
        exit('Недопустимое расширение файла.');
    }

    // Санитизация имени (path traversal, непечатные символы)
    $orig_name = preg_replace('/[^\w\s\.\-\(\)\[\]]/u', '_', $orig_name);
    $orig_name = mb_substr($orig_name, 0, 200);

    $attachment_path = $file['tmp_name'];
    $attachment_name = $orig_name;
    $attachment_size = $file['size'];
}

// ==== 10. Тело письма ====
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

// ==== 11. Отправка через PHPMailer ====
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

    // Явное удаление tmp-файла (152-ФЗ). PHP удалил бы его сам,
    // но для аудита — фиксируем явно.
    if ($attachment_path && file_exists($attachment_path)) {
        @unlink($attachment_path);
    }

    header('Location: thanks.html');
    exit;

} catch (Exception $e) {
    error_log('[send.php] Mail send failed: ' . $mail->ErrorInfo);
    http_response_code(500);
    echo 'Ошибка отправки. Позвоните: +7 (903) 002-18-83.';
    exit;
}
