<?php
declare(strict_types=1);

mb_internal_encoding('UTF-8');

$towns_url = 'https://pecom.ru/ru/calc/towns.php';
$calc_url  = 'http://calc.pecom.ru/bitrix/components/pecom/calc/ajax.php';

echo "=== Скачиваю towns.php ===\n";
$ctx = stream_context_create(['http' => ['timeout' => 15, 'user_agent' => 'TochTex/1.0']]);
$raw = @file_get_contents($towns_url, false, $ctx);
if ($raw === false || $raw === '') { exit("Ошибка: не удалось скачать towns.php\n"); }
$raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
echo 'Размер: ' . strlen($raw) . " байт\n";

$data = json_decode($raw, true);
if (!is_array($data)) { exit("Ошибка: towns.php не парсится\n"); }
echo 'Регионов: ' . count($data) . "\n";

$ryazan = null; $moscow = null;
foreach ($data as $region => $cities) {
    if (!is_array($cities)) continue;
    foreach ($cities as $id => $name) {
        if ($name === 'Рязань' && $ryazan === null) $ryazan = (string)$id;
        if ($name === 'Москва' && $moscow === null) $moscow = (string)$id;
    }
}
echo "Рязань ID: " . ($ryazan ?? 'НЕ НАЙДЕНА') . "\n";
echo "Москва ID: " . ($moscow ?? 'НЕ НАЙДЕНА') . "\n\n";

if (!$ryazan || !$moscow) { exit("Стоп: не найден один из городов\n"); }

$parts = [];
foreach (['0.5','0.4','0.3','0.06','10','0','0'] as $v) {
    $parts[] = 'places[0][]=' . urlencode($v);
}
$parts[] = 'take[town]=' . urlencode($ryazan);
$parts[] = 'take[tent]=0'; $parts[] = 'take[gidro]=0'; $parts[] = 'take[manip]=0';
$parts[] = 'deliver[town]=' . urlencode($moscow);
$parts[] = 'deliver[tent]=0'; $parts[] = 'deliver[gidro]=0'; $parts[] = 'deliver[manip]=0';
$parts[] = 'plombir=0'; $parts[] = 'strah=0'; $parts[] = 'ashan=0'; $parts[] = 'night=0'; $parts[] = 'pal=0';

$url = $calc_url . '?' . implode('&', $parts);
echo "=== URL запроса ===\n$url\n\n";

echo "=== Запрос к API ===\n";
$ctx2 = stream_context_create(['http' => ['timeout' => 10, 'user_agent' => 'TochTex/1.0', 'ignore_errors' => true]]);
$t0 = microtime(true);
$resp = @file_get_contents($url, false, $ctx2);
$dt = round((microtime(true) - $t0) * 1000);

if ($resp === false) { exit("Ошибка: запрос не прошёл\n"); }
echo "Время: {$dt} мс\n";
echo 'Длина: ' . strlen($resp) . " байт\n\n";

echo "=== RAW ответ (первые 3000 байт) ===\n";
echo substr($resp, 0, 3000) . "\n\n";

echo "=== Попытка распарсить ===\n";
$normalized = str_replace("'", '"', $resp);
$decoded = json_decode($normalized, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    echo 'json_decode не сработал: ' . json_last_error_msg() . "\n";
} else {
    print_r($decoded);
}
