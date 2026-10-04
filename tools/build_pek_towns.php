<?php
$sourceUrl = 'https://pecom.ru/ru/calc/towns.php';
$out = __DIR__ . '/../public_html/data/pek_towns.json';

$raw = file_get_contents($sourceUrl);
if (!$raw) exit("Не скачался towns.php\n");
$raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);

$d = json_decode($raw, true);
if (!is_array($d)) exit("JSON не парсится\n");

$towns = [];
foreach ($d as $region => $cities) {
    if (!is_array($cities)) continue;
    foreach ($cities as $id => $name) {
        $towns[] = ['id' => (string)$id, 'name' => (string)$name, 'region' => (string)$region];
    }
}
usort($towns, fn($a, $b) => strcmp($a['region'], $b['region']) ?: strcmp($a['name'], $b['name']));

$result = [
    'meta' => ['source' => $sourceUrl, 'updated' => date('Y-m-d'), 'count' => count($towns)],
    'default_town_id' => '-240722',
    'default_town_name' => 'Рязань',
    'towns' => $towns,
];

$json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$bytes = file_put_contents($out, $json, LOCK_EX);
if ($bytes === false) exit("Не записалось\n");
echo "OK: " . count($towns) . " пунктов, $bytes байт\n";
