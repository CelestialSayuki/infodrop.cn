<?php
header('Access-Control-Allow-Origin: *');
header('Content-type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

ob_start();

function send_json_response(bool $success, string $message, int $http_code = 200) {
    ob_clean();
    http_response_code($http_code);
    echo json_encode(['success' => $success, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function parse_ioservice_data(string $content): array {
    $info = [];

    if (!preg_match('/[+\-o\s]+AppleANS\w+Controller(?:@\d+)?\s*<class[^>]+>.*?\{(.+?"Controller Characteristics".+)\s*\}\s*/s', $content, $controller_matches)) {
        throw new Exception('在 IOService 文件中找不到 AppleANS 控制器信息块。请确认文件内容正确。');
    }
    $controller_block = $controller_matches[1];

    $patterns = [
        'model'           => '/"Model Number"\s*=\s*"([^"]+)"/',
        'firmware'        => '/"Firmware Revision"\s*=\s*"([^"]+)"/',
        'serial_number'   => '/"Serial Number"\s*=\s*"([^"]+)"/'
    ];

    foreach ($patterns as $key => $pattern) {
        if (preg_match($pattern, $controller_block, $matches)) {
            $info[$key] = trim($matches[1]);
        }
    }

    if (preg_match('/"Controller Characteristics"\s*=\s*\{([^}]+)\}/s', $controller_block, $char_matches)) {
        $characteristics_block = $char_matches[1];
        
        if (preg_match('/"vendor-name"\s*=\s*"([^"]+)"/', $characteristics_block, $matches)) {
            $info['manufacturer'] = trim($matches[1]);
        }
        if (preg_match('/"capacity"\s*=\s*(\d+)/', $characteristics_block, $matches)) {
            $info['capacity_bytes'] = (float)$matches[1];
            $info['capacity_nominal'] = format_capacity_nominal($info['capacity_bytes']);
        }
        if (preg_match('/"cell-type"\s*=\s*(\d+)/', $characteristics_block, $matches)) {
            $cell_type_map = [1 => 'SLC', 2 => 'MLC', 3 => 'TLC', 4 => 'QLC'];
            $info['cell_type_id'] = (int)$matches[1];
            $info['cell_type'] = $cell_type_map[$info['cell_type_id']] ?? '未知 (' . $info['cell_type_id'] . ')';
        }
    }
    
    return $info;
}

function format_capacity_nominal(float $bytes): string {
    $gb = $bytes / 1e9;
    $sizes_gb = [64, 128, 256, 512, 1000, 2000, 4000, 8000];
    $closest_size = $sizes_gb[0];
    foreach ($sizes_gb as $size) {
        if (abs($gb - $size) < abs($gb - $closest_size)) {
            $closest_size = $size;
        }
    }

    return ($closest_size >= 1000) ? ($closest_size / 1000) . ' TB' : $closest_size . ' GB';
}

function parse_asptool_data(string $content): array {
    $data = [
        'bad_blocks' => [],
        'partition_health' => [],
        'physical_capacity' => []
    ];

    if (preg_match('/Grown Bad Blocks Count:\s*(\d+)/', $content, $matches)) {
        $data['bad_blocks']['grown'] = (int)$matches[1];
    }
    if (preg_match('/Factory Bad Blocks Count:\s*(\d+)/', $content, $matches)) {
        $data['bad_blocks']['factory'] = (int)$matches[1];
    }

    $partitions = ['USER PARTITION', 'SKINNY PARTITION', 'INTERMEDIATE PARTITION'];
    foreach ($partitions as $partition_name) {
        $pattern = '/' . preg_quote($partition_name, '/') . '\s*:\s*Erase Cycles:\s*.*?Avg\s*\(\s*(\d+).*?\).*?EoL erase cycles:\s*\(\s*(\d+)\s*\)/s';
        if (preg_match($pattern, $content, $matches)) {
            $avg_cycles = (float)$matches[1];
            $eol_cycles = (float)$matches[2];
            $health_percent = ($eol_cycles > 0) ? (1 - ($avg_cycles / $eol_cycles)) * 100 : 100;
            $data['partition_health'][$partition_name] = [
                'avg_cycles' => $avg_cycles,
                'eol_cycles' => $eol_cycles,
                'health_percent' => round($health_percent, 3)
            ];
        }
    }
    
    $lines = explode("\n", $content);
    $current_partition = null;
    $found_sectors_flag = false;

    $sector_counts = [
        'USER PARTITION' => 0,
        'INTERMEDIATE PARTITION' => 0,
        'SKINNY PARTITION' => 0
    ];

    foreach ($lines as $line) {
        if (preg_match('/^={0,4}\s*(USER|INTERMEDIATE|SKINNY)\s*PARTITION\s*={0,4}:?$/', trim($line), $matches)) {
            $current_partition = $matches[1] . ' PARTITION';
        }
        if ($current_partition && preg_match('/Total Sectors:\s*(\d+)/', $line, $matches)) {
            $sector_counts[$current_partition] += (int)$matches[1];
            $found_sectors_flag = true;
        }
    }

    if ($found_sectors_flag) {
        $total_capacity_bytes = 0;
        foreach($sector_counts as $partition => $sectors) {
            $bytes = $sectors * 4096;
            $data['physical_capacity'][$partition] = [
                'sectors' => $sectors,
                'bytes' => $bytes,
                'human' => format_bytes_human_readable($bytes)
            ];
            $total_capacity_bytes += $bytes;
        }
        $data['physical_capacity']['Total'] = [
            'bytes' => $total_capacity_bytes,
            'human' => format_bytes_human_readable($total_capacity_bytes)
        ];
    } else {
        $bytes_per_page = 0;
        $pages_per_vblock = 0;
        $pages_per_vblock_slc = 0;

        if (preg_match('/bytesPerPage:\s*(\d+)/', $content, $matches)) {
            $bytes_per_page = (int)$matches[1];
        }
        if (preg_match('/pagesPerVirtualBlock:\s*(\d+)/', $content, $matches)) {
            $pages_per_vblock = (int)$matches[1];
        }
        if (preg_match('/pagesPerVirtualBlockSlc:\s*(\d+)/', $content, $matches)) {
            $pages_per_vblock_slc = (int)$matches[1];
        }

        if ($bytes_per_page > 0 && $pages_per_vblock > 0 && $pages_per_vblock_slc > 0) {
            
            $bytes_per_band_default = (float)$bytes_per_page * $pages_per_vblock;
            $bytes_per_band_slc = (float)$bytes_per_page * $pages_per_vblock_slc;
            
            $band_counts = [
                'USER PARTITION' => ['default' => 0, 'slc' => 0],
                'INTERMEDIATE PARTITION' => ['default' => 0, 'slc' => 0],
                'SKINNY PARTITION' => ['default' => 0, 'slc' => 0]
            ];
            
            $current_partition = null;
            $lines = explode("\n", $content);

            foreach ($lines as $line) {
                if (preg_match('/^={0,4}\s*(USER|INTERMEDIATE|SKINNY)\s*PARTITION\s*={0,4}:?$/', trim($line), $matches)) {
                    $current_partition = $matches[1] . ' PARTITION';
                }
                
                if ($current_partition && preg_match('/^\s*band:.*?\s+mode:(\d+)/', $line, $mode_matches)) {
                    if ($mode_matches[1] == 1) {
                        $band_counts[$current_partition]['slc']++;
                    } else {
                        $band_counts[$current_partition]['default']++;
                    }
                }
            }

            $total_capacity_bytes = 0;
            foreach($band_counts as $partition => $counts) {
                $bands_default = $counts['default'];
                $bands_slc = $counts['slc'];
                
                $bytes = ($bands_default * $bytes_per_band_default) + ($bands_slc * $bytes_per_band_slc);
                
                if ($bytes > 0) {
                     $data['physical_capacity'][$partition] = [
                        'sectors' => ($bytes > 0) ? $bytes / 4096 : 0,
                        'bytes' => $bytes,
                        'human' => format_bytes_human_readable($bytes)
                    ];
                    $total_capacity_bytes += $bytes;
                }
            }
            
            $data['physical_capacity']['Total'] = [
                'bytes' => $total_capacity_bytes,
                'human' => format_bytes_human_readable($total_capacity_bytes)
            ];
        }
    }
    return $data;
}

function format_bytes_human_readable(float $bytes): string {
    if ($bytes == 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    $i = floor(log($bytes, 1000));
    return round($bytes / (1000 ** $i), 2) . ' ' . $units[$i];
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('无效的请求方法', 405);
    if (!isset($_FILES['asptool_file']) || $_FILES['asptool_file']['error'] !== UPLOAD_ERR_OK) throw new Exception('asptool_snapshot 文件上传失败', 400);
    if (!isset($_FILES['ioservice_file']) || $_FILES['ioservice_file']['error'] !== UPLOAD_ERR_OK) throw new Exception('IOService 文件上传失败', 400);

    $asptool_file = $_FILES['asptool_file'];
    $ioservice_file = $_FILES['ioservice_file'];
    
    $max_size = 10 * 1024 * 1024;
    if ($asptool_file['size'] > $max_size || $ioservice_file['size'] > $max_size) {
        throw new Exception('文件过大，最大允许 10MB。', 400);
    }

    $allowed_extensions = ['txt', 'log'];
    if (!in_array(strtolower(pathinfo($asptool_file['name'], PATHINFO_EXTENSION)), $allowed_extensions) ||
        !in_array(strtolower(pathinfo($ioservice_file['name'], PATHINFO_EXTENSION)), $allowed_extensions)) {
        throw new Exception('文件类型无效，仅允许上传 .txt 或 .log 文件。', 400);
    }
    
    $asptool_content = file_get_contents($asptool_file['tmp_name']);
    $ioservice_content = file_get_contents($ioservice_file['tmp_name']);

    $asptool_data = parse_asptool_data($asptool_content);
    $ioservice_data = parse_ioservice_data($ioservice_content);

    $db_path = __DIR__ . '/disk_data.sqlite';
    $pdo = new PDO('sqlite:' . $db_path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS disk_uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            device_model TEXT,
            serial_number TEXT,
            firmware TEXT,
            manufacturer TEXT,
            cell_type TEXT,
            capacity_nominal_gb INTEGER,
            capacity_user_bytes INTEGER,
            capacity_intermediate_bytes INTEGER,
            capacity_skinny_bytes INTEGER,
            total_capacity_bytes INTEGER,
            data_hash TEXT NOT NULL UNIQUE
        )
    ");
    
    $data_to_hash = [
        $ioservice_data['serial_number'] ?? 'N/A',
        $asptool_data['physical_capacity']['USER PARTITION']['bytes'] ?? 0,
        $asptool_data['physical_capacity']['SKINNY PARTITION']['bytes'] ?? 0
    ];
    $data_hash = hash('sha256', implode('|', $data_to_hash));

    $stmt = $pdo->prepare("
        INSERT OR IGNORE INTO disk_uploads (
            timestamp, device_model, serial_number, firmware, manufacturer, cell_type,
            capacity_nominal_gb, capacity_user_bytes, capacity_intermediate_bytes,
            capacity_skinny_bytes, total_capacity_bytes, data_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    
    $nominal_cap_str = $ioservice_data['capacity_nominal'] ?? '0 GB';
    $nominal_cap_gb = (int)filter_var($nominal_cap_str, FILTER_SANITIZE_NUMBER_INT);
    if (strpos(strtoupper($nominal_cap_str), 'TB') !== false) {
        $nominal_cap_gb *= 1000;
    }

    $stmt->execute([
        date('Y-m-d H:i:s'),
        $ioservice_data['model'] ?? null,
        $ioservice_data['serial_number'] ?? null,
        $ioservice_data['firmware'] ?? null,
        $ioservice_data['manufacturer'] ?? null,
        $ioservice_data['cell_type'] ?? null,
        $nominal_cap_gb,
        $asptool_data['physical_capacity']['USER PARTITION']['bytes'] ?? 0,
        $asptool_data['physical_capacity']['INTERMEDIATE PARTITION']['bytes'] ?? 0,
        $asptool_data['physical_capacity']['SKINNY PARTITION']['bytes'] ?? 0,
        $asptool_data['physical_capacity']['Total']['bytes'] ?? 0,
        $data_hash
    ]);


    $html = "<strong>✅ 数据解析成功！</strong><br><br>";

    $html .= "<h3>磁盘信息</h3>";
    $html .= "<strong>型号:</strong> " . htmlspecialchars($ioservice_data['model'] ?? '未知') . "<br>";
    $html .= "<strong>固件版本:</strong> " . htmlspecialchars($ioservice_data['firmware'] ?? '未知') . "<br>";
    $html .= "<strong>厂商:</strong> " . htmlspecialchars($ioservice_data['manufacturer'] ?? '未知') . "<br>";
    $html .= "<strong>容量:</strong> " . htmlspecialchars($ioservice_data['capacity_nominal'] ?? '未知') . "<br>";
    $html .= "<strong>颗粒:</strong> " . htmlspecialchars($ioservice_data['cell_type'] ?? '未知') . "<br>";
    
    $html .= "<h3>健康与寿命</h3>";
    $html .= "<strong>出厂坏块数:</strong> " . ($asptool_data['bad_blocks']['factory'] ?? '未找到') . "<br>";
    $html .= "<strong>增长坏块数:</strong> " . ($asptool_data['bad_blocks']['grown'] ?? '未找到') . "<br>";
    foreach($asptool_data['partition_health'] as $name => $health) {
        $html .= "<strong>" . htmlspecialchars(str_replace(' PARTITION', '', $name)) . " 剩余寿命:</strong> " . $health['health_percent'] . "% (" . $health['avg_cycles'] . "/" . $health['eol_cycles'] . ")<br>";
    }
    
    $html .= "<h3>计算出的物理容量</h3>";
    foreach($asptool_data['physical_capacity'] as $name => $cap) {
        if ($name === 'Total' || $cap['bytes'] > 0) {
            $html .= "<strong>" . htmlspecialchars(str_replace(' PARTITION', '', $name)) . ":</strong> " . $cap['human'] . "<br>";
        }
    }

    send_json_response(true, $html);

} catch (Exception $e) {
    error_log("Disk Upload Error: " . $e->getMessage() . " in file " . $e->getFile() . " on line " . $e->getLine());
    $httpCode = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
    $userMessage = ($httpCode >= 400 && $httpCode < 500) ? $e->getMessage() : '服务器遇到内部错误。';
    send_json_response(false, '处理失败: ' . $userMessage, $httpCode);
}

ob_end_flush();
?>
