<?php
header('Access-control-allow-origin: *');
header('Content-type: application/json; charset=utf-8');
header('Access-control-allow-methods: POST, OPTIONS');
header('Access-control-allow-headers: Content-type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

ob_start();

function send_json_response(bool $success, string $message, ?array $data = null) {
    ob_clean();
    http_response_code(200);
    
    $response = ['success' => $success, 'message' => $message];
    if ($data !== null) {
        $response = array_merge($response, $data);
    }
    
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

function load_maps(): array {
    $maps = ['chip_model' => [], 'device_to_chip' => [], 'device_id_to_name' => []];
    $map_files = [
        'chip_model' => __DIR__ . '/chip_model_map.json',
        'device_to_chip' => __DIR__ . '/device_to_chip_map.json',
        'device_id_to_name' => __DIR__ . '/device_id_to_name_map.json'
    ];
    foreach ($map_files as $key => $path) {
        if (file_exists($path)) { $maps[$key] = json_decode(file_get_contents($path), true); }
    }
    if (!empty($maps['chip_model'])) {
        $processed_map = [];
        foreach ($maps['chip_model'] as $chip_info) {
            $processed_map[strtoupper($chip_info['chipModel'])] = ['cpuModel' => $chip_info['cpuModel'], 'isLegacy' => $chip_info['isLegacy']];
        }
        $maps['chip_model'] = $processed_map;
    }
    return $maps;
}

function parse_voltage_states_default(string $hex_data, bool $isLegacy): array {
    $all_forks = [];
    $current_fork = [];
    $last_freq = 0.0;
    
    $binary_data = hex2bin($hex_data);
    $data_length = strlen($binary_data);
    $freq_divisor = $isLegacy ? 1000000 : 1000;

    for ($i = 0; $i < $data_length; $i += 8) {
        if ($i + 8 > $data_length) continue;
        
        $chunk = substr($binary_data, $i, 8);
        $unpacked = unpack('V2', $chunk);
        if ($unpacked === false) continue;
        
        $freq_mhz = round($unpacked[1] / $freq_divisor, 2);
        
        if ($freq_mhz > 0 && $freq_mhz < $last_freq) {
            if (!empty($current_fork)) { $all_forks[] = $current_fork; }
            $current_fork = [];
            $last_freq = 0.0;
        }
        
        if ($freq_mhz > 0) {
            $voltage_mv = ($unpacked[2] === 4294967295) ? 'N/A' : $unpacked[2];
            $current_fork[] = ['freq_mhz' => $freq_mhz, 'voltage_mv' => $voltage_mv];
            $last_freq = $freq_mhz;
        }
    }

    if (!empty($current_fork)) { $all_forks[] = $current_fork; }

    return $all_forks;
}

function parse_voltage_states_gpu(string $hex_data): array {
    $all_data_points = [];
    $binary_data = hex2bin($hex_data);
    $data_length = strlen($binary_data);
    $freq_divisor = 1000000;

    for ($i = 0; $i < $data_length; $i += 8) {
        if ($i + 8 > $data_length) continue;
        
        $chunk = substr($binary_data, $i, 8);
        $unpacked = unpack('V2', $chunk);
        if ($unpacked === false) continue;
        
        $freq_mhz = round($unpacked[1] / $freq_divisor, 2);
        
        if ($freq_mhz > 0) {
            $voltage_mv = ($unpacked[2] === 4294967295) ? 'N/A' : $unpacked[2];
            $all_data_points[] = ['freq_mhz' => $freq_mhz, 'voltage_mv' => $voltage_mv];
        }
    }

    if (empty($all_data_points)) {
        return [];
    }

    $fork_a = [];
    $fork_b = [];
    $pre_split_data = [];
    $crossover_mode = false;
    $next_is_a = true;

    foreach ($all_data_points as $point) {
        if (!$crossover_mode) {
            $last_point = empty($fork_a) ? null : end($fork_a);

            if ($last_point === null ||
                ($point['freq_mhz'] > $last_point['freq_mhz'] && $point['voltage_mv'] > $last_point['voltage_mv']))
            {
                if ($last_point !== null) {
                    $pre_split_data[] = $last_point;
                }
                $fork_a[] = $point;
            } else {
                $crossover_mode = true;
                
                $fork_b = $pre_split_data;
                $fork_b[] = $point;
                
                $peak_point = end($fork_a);
                $history_before_pre_peak = empty($pre_split_data) ? [] : array_slice($pre_split_data, 0, -1);
                $fork_a = array_merge($history_before_pre_peak, [$peak_point]);

                $next_is_a = true;
            }
        } else {
            if ($next_is_a) {
                $fork_a[] = $point;
            } else {
                $fork_b[] = $point;
            }
            $next_is_a = !$next_is_a;
        }
    }

    return array_filter([$fork_a, $fork_b], fn($fork) => !empty($fork));
}

function parse_voltage_states_ane(string $hex_data): array {
    $all_forks = [];
    $current_fork = [];
    $last_freq = 0.0;
    
    $binary_data = hex2bin($hex_data);
    $data_length = strlen($binary_data);
    $freq_divisor = 1000000;

    for ($i = 0; $i < $data_length; $i += 8) {
        if ($i + 8 > $data_length) continue;
        
        $chunk = substr($binary_data, $i, 8);
        $unpacked = unpack('V2', $chunk);
        if ($unpacked === false) continue;
        
        $freq_mhz = round($unpacked[1] / $freq_divisor, 2);
        
        if ($freq_mhz > 0 && $freq_mhz < $last_freq) {
            if (!empty($current_fork)) { $all_forks[] = $current_fork; }
            $current_fork = [];
            $last_freq = 0.0;
        }
        
        if ($freq_mhz > 0) {
            $voltage_mv = ($unpacked[2] === 4294967295) ? 'N/A' : $unpacked[2];
            $current_fork[] = ['freq_mhz' => $freq_mhz, 'voltage_mv' => $voltage_mv];
            $last_freq = $freq_mhz;
        }
    }

    if (!empty($current_fork)) { $all_forks[] = $current_fork; }

    return $all_forks;
}

function parse_voltage_states(string $hex_data, bool $isLegacy, string $core_type): array {
    if ($core_type === 'gpu_dvfs') {
        return parse_voltage_states_gpu($hex_data);
    } elseif ($core_type === 'ane_dvfs') {
        return parse_voltage_states_ane($hex_data);
    } else {
        return parse_voltage_states_default($hex_data, $isLegacy);
    }
}

function extract_data_from_ioservice(string $content): array {
    $data = [];
    $patterns = [
        'chip_identifier' => '/\"compatible\"\s*=\s*<\"pmgr\d+,([^"]+)\">/',
        'device'          => '/\"compatible\"\s*=\s*<\"([a-zA-Z0-9,]+AP)\",\"([^\"]+)\",\"AppleARM\">/',
        'voltage-states1-sram' => '/\"voltage-states1-sram\"\s*=\s*<([a-fA-F0-9]+)>/',
        'voltage-states5-sram' => '/\"voltage-states5-sram\"\s*=\s*<([a-fA-F0-9]+)>/',
        'voltage-states8'      => '/\"voltage-states8\"\s*=\s*<([a-fA-F0-9]+)>/',
        'voltage-states9'      => '/\"voltage-states9\"\s*=\s*<([a-fA-F0-9]+)>/',
    ];
    foreach ($patterns as $key => $pattern) {
        if (preg_match($pattern, $content, $matches)) {
            $data[$key] = ($key === 'device') ? $matches[2] : $matches[1];
        }
    }
    return $data;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('无效的请求方法', 405);
    if (!isset($_FILES['dvfs_data_file']) || $_FILES['dvfs_data_file']['error'] !== UPLOAD_ERR_OK) throw new Exception('文件上传失败', 400);

    $file = $_FILES['dvfs_data_file'];

    $max_size = 50 * 1024 * 1024;
    if ($file['size'] > $max_size) {
        throw new Exception('文件过大，最大允许 50MB。', 400);
    }

    $file_extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($file_extension !== 'txt') {
        throw new Exception('文件类型无效，仅允许上传 .txt 文件。', 400);
    }

    $maps = load_maps();
    if (empty($maps['chip_model']) || empty($maps['device_to_chip']) || empty($maps['device_id_to_name'])) throw new Exception('一个或多个映射文件 (JSON) 丢失或格式错误。', 500);

    $content = file_get_contents($_FILES['dvfs_data_file']['tmp_name']);
    $extracted_info = extract_data_from_ioservice($content);

    if (empty($extracted_info['chip_identifier'])) throw new Exception('无法提取芯片标识符。', 400);
    if (empty($extracted_info['device'])) throw new Exception('无法提取设备型号。', 400);
    
    $chip_identifier_upper = strtoupper($extracted_info['chip_identifier']);
    $device_model_id = $extracted_info['device'];
    
    $device_name = $maps['device_id_to_name'][$device_model_id] ?? $device_model_id;

    $chip_details = $maps['chip_model'][$chip_identifier_upper] ?? null;
    if ($chip_details === null) throw new Exception("未知的芯片标识符: {$extracted_info['chip_identifier']}", 400);
    
    $chip_name = $chip_details['cpuModel'];
    $is_legacy = $chip_details['isLegacy'];

    if (strpos($chip_name, '/') !== false) {
        $specific_chip_name = $maps['device_to_chip'][$device_model_id] ?? null;
        if ($specific_chip_name === null) throw new Exception("无法为设备 {$device_name} 确定精确芯片型号。", 400);
        $chip_name = $specific_chip_name;
    }

    $core_type_mapping = [
        'voltage-states1-sram' => 'e_core_dvfs',
        'voltage-states5-sram' => 'p_core_dvfs',
        'voltage-states8'      => 'ane_dvfs',
        'voltage-states9'      => 'gpu_dvfs'
    ];
    
    $all_parsed_forks = [];
    $max_forks = 0;

    foreach ($core_type_mapping as $key => $db_column) {
        if (isset($extracted_info[$key])) {
            $forks = parse_voltage_states($extracted_info[$key], $is_legacy, $db_column);
            if (!empty($forks)) {
                $all_parsed_forks[$db_column] = $forks;
                if (count($forks) > $max_forks) {
                    $max_forks = count($forks);
                }
            }
        }
    }
    
    if ($max_forks == 0) {
        throw new Exception('文件有效，但未找到任何DVFS核心状态数据，已跳过保存。', 400);
    }
    
    $db_path = __DIR__ . '/processed_data.sqlite';
    $pdo = new PDO('sqlite:' . $db_path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("CREATE TABLE IF NOT EXISTS dvfs_uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, chip TEXT, device TEXT, e_core_dvfs TEXT, p_core_dvfs TEXT, ane_dvfs TEXT, gpu_dvfs TEXT, data_hash TEXT NOT NULL UNIQUE)");
    $stmt = $pdo->prepare("INSERT OR IGNORE INTO dvfs_uploads (timestamp, chip, device, e_core_dvfs, p_core_dvfs, ane_dvfs, gpu_dvfs, data_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    
    $inserted_hashes = [];

    for ($i = 0; $i < $max_forks; $i++) {
        $dvfs_data_for_this_row = [];

        foreach ($core_type_mapping as $db_column) {
            $forks = $all_parsed_forks[$db_column] ?? [];
            $dvfs_data_for_this_row[$db_column] = isset($forks[$i]) ? json_encode($forks[$i]) : null;
        }

        if (count(array_filter($dvfs_data_for_this_row)) == 0) continue;

        $data_signature_parts = ["chip:{$chip_name}", "device:{$device_name}"];
        foreach($dvfs_data_for_this_row as $db_column => $json_data) {
            if ($json_data !== null) {
                $data_signature_parts[] = "{$db_column}:{$json_data}";
            }
        }
        $data_hash = hash('sha256', implode('|', $data_signature_parts));

        $stmt->execute([
            date('Y-m-d H:i:s'), $chip_name, $device_name,
            $dvfs_data_for_this_row['e_core_dvfs'], $dvfs_data_for_this_row['p_core_dvfs'],
            $dvfs_data_for_this_row['ane_dvfs'], $dvfs_data_for_this_row['gpu_dvfs'],
            $data_hash
        ]);

        $inserted_hashes[] = $data_hash;
    }
    
    $final_message = "<strong>✅ 数据解析成功！</strong><br>设备型号: ".htmlspecialchars($device_name)."<br>芯片型号: " . htmlspecialchars($chip_name);
    
    send_json_response(true, $final_message, ['hashes' => $inserted_hashes]);

} catch (Exception $e) {
    error_log(
        "DVFS Upload Error: " . $e->getMessage() .
        " in file " . $e->getFile() .
        " on line " . $e->getLine()
    );
    
    $httpCode = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
    $userMessage = '处理失败：服务器遇到错误。如果问题持续存在，请联系管理员。';
    if ($httpCode >= 400 && $httpCode < 500) {
        $userMessage = '处理失败：' . $e->getMessage();
    }
    
    send_json_response(false, $userMessage, null);
}

ob_end_flush();
?>
