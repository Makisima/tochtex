<?php
declare(strict_types=1);

namespace TochTex\Delivery;

use RuntimeException;
use Throwable;

/**
 * Работа с публичным API ПЭК.
 * Документация: https://pecom.ru/business/developers/api_public/
 */
class PekApi
{
    private array $config;
    private string $logPath;

    public function __construct(array $config)
    {
        if (empty($config['enabled'])) {
            throw new RuntimeException('ПЭК отключён в конфигурации');
        }
        if (empty($config['api_url']) || empty($config['default_town'])) {
            throw new RuntimeException('Не заданы api_url или default_town для ПЭК');
        }
        $this->config  = $config;
        $this->logPath = $config['log_path'] ?? '';
    }

    /**
     * Расчёт доставки.
     *
     * @param string $toId        ID города доставки
     * @param array  $places      [['l','w','h','weight','oversized'?], ...]
     *                            l/w/h в МЕТРАХ, weight в кг
     * @param bool   $withDeliver true = доставка до адреса, false = самовывоз
     * @return array
     */
    public function calculate(string $toId, array $places, bool $withDeliver = false): array
    {
        if (empty($places)) {
            return $this->error('Не переданы параметры груза');
        }

        foreach ($places as &$p) {
            if (!isset($p['l'], $p['w'], $p['h'], $p['weight'])) {
                return $this->error('Некорректные параметры груза');
            }
            $p['l']      = (float)$p['l'];
            $p['w']      = (float)$p['w'];
            $p['h']      = (float)$p['h'];
            $p['weight'] = (float)$p['weight'];
            $p['volume'] = isset($p['volume']) ? (float)$p['volume'] : round($p['l'] * $p['w'] * $p['h'], 4);

            // Автодетект негабарита: любое измерение > 1.2 м или вес > 80 кг
            if (!isset($p['oversized'])) {
                $p['oversized'] = ($p['l'] > 1.2 || $p['w'] > 1.2 || $p['h'] > 1.2 || $p['weight'] > 80);
            } else {
                $p['oversized'] = (bool)$p['oversized'];
            }
        }
        unset($p);

        // ==== Кэш ====
        $cacheKey = $this->cacheKey($toId, $places, $withDeliver);
        $cached = $this->cacheGet($cacheKey);
        if ($cached !== null) {
            $cached['cached'] = true;
            return $cached;
        }

        $fromId = (string)$this->config['default_town'];
        $url    = $this->config['api_url'] . '?' . $this->buildParams($fromId, $toId, $places);

        $t0  = microtime(true);
        $raw = $this->sendRequest($url);
        $ms  = (int)round((microtime(true) - $t0) * 1000);

        if ($raw === null) {
            $this->log('TIMEOUT', $toId, $places, $ms, null);
            return $this->error('Сервис расчёта временно недоступен. Позвоните: +7 (939) 440-40-01');
        }

        $result = $this->parseResponse($raw, $withDeliver);

        // Логируем успех/ошибку
        $this->log(
            $result['success'] ? 'OK' : 'ERROR',
            $toId,
            $places,
            $ms,
            $result['success'] ? $result['cost_total'] : $result['error']
        );

        // Кэшируем только успех
        if ($result['success']) {
            $this->cacheSet($cacheKey, $result);
        }

        $result['cached'] = false;
        return $result;
    }

    private function buildParams(string $fromId, string $toId, array $places): string
    {
        $parts = [];
        foreach ($places as $i => $p) {
            $values = [
                $p['l'], $p['w'], $p['h'], $p['volume'],
                $p['weight'], $p['oversized'] ? '1' : '0', '0',
            ];
            foreach ($values as $v) {
                $parts[] = 'places[' . $i . '][]=' . urlencode((string)$v);
            }
        }

        $parts[] = 'take[town]='  . urlencode($fromId);
        $parts[] = 'take[tent]=0';
        $parts[] = 'take[gidro]=0';
        $parts[] = 'take[manip]=0';

        $parts[] = 'deliver[town]='  . urlencode($toId);
        $parts[] = 'deliver[tent]=0';
        $parts[] = 'deliver[gidro]=0';
        $parts[] = 'deliver[manip]=0';

        $parts[] = 'plombir=0';
        $parts[] = 'strah=0';
        $parts[] = 'ashan=0';
        $parts[] = 'night=0';
        $parts[] = 'pal=0';

        return implode('&', $parts);
    }

    private function sendRequest(string $url): ?string
    {
        $ctx = stream_context_create([
            'http' => [
                'timeout'       => (int)($this->config['timeout'] ?? 8),
                'user_agent'    => 'TochTex/1.0 (+https://tochtex.ru)',
                'ignore_errors' => true,
            ],
        ]);

        $raw = @file_get_contents($url, false, $ctx);
        return ($raw === false || $raw === '') ? null : $raw;
    }

    private function parseResponse(string $raw, bool $withDeliver): array
    {
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return $this->error('Некорректный ответ сервиса');
        }

        // Стоимость перевозки (auto)
        $costAuto = null;
        if (isset($data['auto']) && is_array($data['auto']) && isset($data['auto'][2]) && is_numeric($data['auto'][2])) {
            $costAuto = (float)$data['auto'][2];
        }

        // Забор (take)
        $costTake = null;
        if (isset($data['take']) && is_array($data['take']) && isset($data['take'][2]) && is_numeric($data['take'][2])) {
            $costTake = (float)$data['take'][2];
        }

        // Доставка (deliver)
        $costDeliver = null;
        if (isset($data['deliver']) && is_array($data['deliver']) && isset($data['deliver'][2]) && is_numeric($data['deliver'][2])) {
            $costDeliver = (float)$data['deliver'][2];
        }

        $period = isset($data['periods_days']) && is_string($data['periods_days'])
            ? $data['periods_days']
            : null;

        // Обработка error (даже при наличии auto)
        $apiErrors = [];
        if (!empty($data['error']) && is_array($data['error'])) {
            foreach ($data['error'] as $e) {
                if (!is_string($e)) continue;
                // Игнорируем ошибки про авиа — мы его не используем
                if (mb_stripos($e, 'авиа') !== false) continue;
                $apiErrors[] = $e;
            }
        }

        // Если auto нет — перевозка невозможна
        if ($costAuto === null) {
            $err = $apiErrors ? implode('; ', $apiErrors) : 'Автоперевозка по этому направлению недоступна';
            return $this->error($err);
        }

        // Если есть серьёзные ошибки (не про авиа) — предупреждаем, но продолжаем
        $warning = $apiErrors ? implode('; ', $apiErrors) : null;

        // Итог
        $total = $costAuto + ($costTake ?? 0);
        if ($withDeliver) {
            $total += $costDeliver ?? 0;
        }

        return [
            'success'      => true,
            'cost_auto'    => $costAuto,
            'cost_take'    => $costTake,
            'cost_deliver' => $withDeliver ? $costDeliver : null,
            'cost_total'   => round($total, 2),
            'period'       => $period,
            'warning'      => $warning,
            'error'        => null,
            'cached'       => false,
        ];
    }

    // ==== Кэш ====
    private function cacheKey(string $toId, array $places, bool $withDeliver): string
    {
        return md5($toId . '|' . serialize($places) . '|' . ($withDeliver ? '1' : '0'));
    }

    private function cacheDir(): string
    {
        $dir = sys_get_temp_dir() . '/tochtex_pek_cache';
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        return $dir;
    }

    private function cacheGet(string $key): ?array
    {
        $dir = $this->cacheDir();
        if (!is_dir($dir) || !is_writable($dir)) return null;

        $ttl  = (int)($this->config['cache_ttl'] ?? 300);
        $file = $dir . '/' . $key . '.json';

        if (!file_exists($file)) return null;
        if ((time() - filemtime($file)) > $ttl) {
            @unlink($file);
            return null;
        }

        $raw = @file_get_contents($file);
        if ($raw === false) return null;
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    private function cacheSet(string $key, array $data): void
    {
        $dir = $this->cacheDir();
        if (!is_dir($dir) || !is_writable($dir)) return;
        $file = $dir . '/' . $key . '.json';
        @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }

    // ==== Лог ====
    private function log(string $status, string $toId, array $places, int $ms, $extra): void
    {
        if ($this->logPath === '') return;

        $dir = dirname($this->logPath);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        if (!is_dir($dir) || !is_writable($dir)) return;

        $totalWeight = 0;
        foreach ($places as $p) {
            $totalWeight += (float)($p['weight'] ?? 0);
        }

        $line = sprintf(
            "[%s] %s to=%s places=%d weight=%.1f ms=%d cost=%s\n",
            date('Y-m-d H:i:s'),
            $status,
            $toId,
            count($places),
            $totalWeight,
            $ms,
            is_scalar($extra) ? (string)$extra : json_encode($extra, JSON_UNESCAPED_UNICODE)
        );

        @file_put_contents($this->logPath, $line, FILE_APPEND | LOCK_EX);
    }

    private function error(string $msg): array
    {
        return [
            'success'      => false,
            'cost_auto'    => null,
            'cost_take'    => null,
            'cost_deliver' => null,
            'cost_total'   => null,
            'period'       => null,
            'warning'      => null,
            'error'        => $msg,
            'cached'       => false,
        ];
    }
}