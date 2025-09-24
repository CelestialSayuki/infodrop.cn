<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['encryption_key'])) {
    http_response_code(400);
    echo json_encode(['error' => '错误：加密密钥不存在或已过期，请刷新页面重试。']);
    exit;
}

$key = $_SESSION['encryption_key'];
unset($_SESSION['encryption_key']);

$db_path = __DIR__ . '/processed_data.sqlite';

try {
    if (!file_exists($db_path)) {
        $empty_data = json_encode(['p_core_dvfs' => [], 'e_core_dvfs' => [], 'gpu_dvfs' => [], 'ane_dvfs' => []]);
        $cipher = 'aes-256-gcm';
        $iv_length = 12;
        $iv = openssl_random_pseudo_bytes($iv_length);
        $tag = "";
        $encrypted_data = openssl_encrypt($empty_data, $cipher, $key, OPENSSL_RAW_DATA, $iv, $tag);
        echo json_encode([
            'ciphertext' => base64_encode($encrypted_data),
            'iv' => base64_encode($iv),
            'tag' => base64_encode($tag)
        ]);
        exit;
    }

    $pdo = new PDO('sqlite:' . $db_path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->query("SELECT chip, device, build, e_core_dvfs, p_core_dvfs, ane_dvfs, gpu_dvfs FROM dvfs_uploads ORDER BY timestamp DESC");
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $final_chart_data = [];
    $core_types = ['p_core_dvfs', 'e_core_dvfs', 'gpu_dvfs', 'ane_dvfs'];

    foreach ($core_types as $core_type) {
        $grouped_data = [];
        foreach ($results as $row) {
            if (empty($row[$core_type])) {
                continue;
            }

            $dvfs_points = json_decode($row[$core_type], true);
            $valid_points = array_filter($dvfs_points, function($point) {
                return isset($point['freq_mhz'], $point['voltage_mv']) && is_numeric($point['voltage_mv']);
            });
            $echarts_data = array_map(function($point) {
                return [(float)$point['freq_mhz'], (float)$point['voltage_mv']];
            }, $valid_points);
            
            if (empty($echarts_data)) continue;

            $chip = (!empty($row['chip']) && $row['chip'] !== 'N/A') ? $row['chip'] : '未知芯片';
            $device = (!empty($row['device']) && $row['device'] !== 'N/A') ? $row['device'] : '未知设备';
            $build = (!empty($row['build']) && $row['build'] !== 'N/A') ? $row['build'] : '未知版本';

            $grouping_key = $chip . '|' . json_encode($echarts_data);

            if (!isset($grouped_data[$grouping_key])) {
                $grouped_data[$grouping_key] = [
                    'chip'    => $chip,
                    'devices' => [],
                    'builds'  => [],
                    'data'    => $echarts_data
                ];
            }
            $grouped_data[$grouping_key]['devices'][$device] = true;
            $grouped_data[$grouping_key]['builds'][$build] = true;
        }
        
        $series_list = [];
        foreach($grouped_data as $group) {
             $series_list[] = [
                'chip'    => $group['chip'],
                'devices' => implode(', ', array_keys($group['devices'])),
                'builds'  => implode(', ', array_keys($group['builds'])),
                'data'    => $group['data'],
             ];
        }
        $parse_chip = function($chip_name) {
            $series = '';
            $generation = 0;
            $tier_str = '';
            if (preg_match('/^([AM])(\d+)\s*(Pro|Max|Ultra|X|Z)?/i', $chip_name, $matches)) {
                $series = strtoupper($matches[1]);
                $generation = (int)$matches[2];
                $tier_str = isset($matches[3]) ? $matches[3] : '';
            }
            return [$series, $generation, $tier_str];
        };
        $tier_rank = [
            'Ultra' => 6,
            'Max'   => 5,
            'Pro'   => 4,
            'Z'     => 3,
            'X'     => 2,
            ''      => 1,
        ];
        usort($series_list, function($a, $b) use ($parse_chip, $tier_rank) {
            list($a_series, $a_gen, $a_tier) = $parse_chip($a['chip']);
            list($b_series, $b_gen, $b_tier) = $parse_chip($b['chip']);
            if ($a_series !== $b_series) {
                if ($a_series === 'A') return -1;
                if ($b_series === 'A') return 1;
            }
            if ($a_gen !== $b_gen) {
                return $b_gen <=> $a_gen;
            }
            $a_rank = $tier_rank[$a_tier] ?? 0;
            $b_rank = $tier_rank[$b_tier] ?? 0;
            if ($a_rank !== $b_rank) {
                return $b_rank <=> $a_rank;
            }
            return $a['chip'] <=> $b['chip'];
        });
        $final_chart_data[$core_type] = $series_list;
    }

    $plaintext = json_encode($final_chart_data, JSON_UNESCAPED_UNICODE);
    $cipher = 'aes-256-gcm';
    $iv_length = 12;
    $iv = openssl_random_pseudo_bytes($iv_length);
    $tag = "";
    $encrypted_data = openssl_encrypt($plaintext, $cipher, $key, OPENSSL_RAW_DATA, $iv, $tag);
    $response_payload = [
        'ciphertext' => base64_encode($encrypted_data),
        'iv' => base64_encode($iv),
        'tag' => base64_encode($tag)
    ];

    echo json_encode($response_payload);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => '服务器错误: ' . $e->getMessage()]);
}
?>
