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

// Формируем тело письма
$subject = 'Новая заявка с сайта tochtex.ru';
$body = "Имя: $name\n";
$body .= "Телефон: $phone\n";
$body .= "Email: " . ($email ?: 'не указан') . "\n";
$body .= "Услуга: " . ($service ?: 'не выбрана') . "\n";
$body .= "Сообщение:\n" . ($message ?: 'не указано') . "\n";

// Заголовки письма
$headers = "From: no-reply@tochtex.ru\r\n";
$headers .= "Reply-To: " . ($email ?: 'mmatveev02@mail.ru') . "\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

// Отправляем письмо
$to = 'mmatveev02@mail.ru';
$mail_sent = mail($to, $subject, $body, $headers);

// Перенаправляем на страницу благодарности
if ($mail_sent) {
    header('Location: thanks.html');
    exit;
} else {
    // Если письмо не отправилось, покажем ошибку
    http_response_code(500);
    echo 'Ошибка при отправке письма. Попробуйте позвонить по телефону +7 (903) 002-18-83.';
}
?>