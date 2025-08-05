<?php
header('Content-Type: application/json; charset=utf-8');

$db_path = __DIR__ . '/processed_data.sqlite';

try {
    if (!file_exists($db_path)) {
        echo json_encode(['p_core_dvfs' => [], 'e_core_dvfs' => [], 'gpu_dvfs' => [], 'ane_dvfs' => []]);
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
        $final_chart_data[$core_type] = $series_list;
    }

    echo json_encode($final_chart_data, JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => '服务器错误: ' . $e->getMessage()]);
}
?>
