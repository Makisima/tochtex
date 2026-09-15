<?php
// Получаем данные из формы
$name = htmlspecialchars(trim($_POST['name'] ?? ''));
$phone = htmlspecialchars(trim($_POST['phone'] ?? ''));
$email = htmlspecialchars(trim($_POST['email'] ?? ''));
$service = htmlspecialchars(trim($_POST['service'] ?? ''));
$message = htmlspecialchars(trim($_POST['message'] ?? ''));

// Проверяем обязательные поля
if (empty($name) || empty($phone)) {
    http_response_code(400);
    echo 'Ошибка: имя и телефон обязательны для заполнения.';
    exit;
}

// Обработка прикреплённого файла
$file_info = 'не прикреплён';
if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $file_name = $_FILES['file']['name'];
    $file_size = round($_FILES['file']['size'] / 1024, 1) . ' KB';
    $file_info = "$file_name ($file_size)";
}

// Формируем тело письма
$subject = 'Новая заявка с сайта tochtex.ru';
$body  = "Имя: $name\n";
$body .= "Телефон: $phone\n";
$body .= "Email: " . ($email ?: 'не указан') . "\n";
$body .= "Услуга: " . ($service ?: 'не выбрана') . "\n";
$body .= "Файл: $file_info\n";
$body .= "\nСообщение:\n" . ($message ?: 'не указано') . "\n";

// Заголовки письма
$headers  = "From: no-reply@tochtex.ru\r\n";
$headers .= "Reply-To: " . ($email ?: 'sale@tochtex.ru') . "\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

// Отправляем письмо
$to = 'sale@tochtex.ru';
$mail_sent = mail($to, $subject, $body, $headers);

if ($mail_sent) {
    header('Location: thanks.html');
    exit;
} else {
    http_response_code(500);
    echo 'Ошибка при отправке письма. Позвоните: +7 (903) 002-18-83.';
}
?>