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
        throw new Exception('在 IOService 文件中找不到 AppleANS 控制器信息块。');
    }
    $controller_block = $controller_matches[1];
    $patterns = [
        'model' => '/"Model Number"\s*=\s*"([^"]+)"/',
        'firmware' => '/"Firmware Revision"\s*=\s*"([^"]+)"/',
        'serial_number' => '/"Serial Number"\s*=\s*"([^"]+)"/'
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
        if (preg_match('/"cell-type"\s*=\s*(\d+)/', $characteristics_block, $matches)) {
            $cell_type_map = [1 => 'SLC', 2 => 'MLC', 3 => 'TLC', 4 => 'QLC'];
            $info['cell_type_id'] = (int)$matches[1];
            $info['cell_type'] = $cell_type_map[$info['cell_type_id']] ?? '未知 (' . $info['cell_type_id'] . ')';
        }
    }
    return $info;
}

function parse_asptool_data(string $content): array {
    $data = [
        'bands' => [
            'total' => 0, 'user' => 0, 'intermediate' => 0, 'skinny' => 0, 'utility' => 0
        ],
        'capacity_bytes_new' => 0,
        'bad_blocks' => [],
        'partition_health' => []
    ];

    $bytesPerPage = 0; $pagesPerVBlock = 0; $numVBlocks = 0;
    if (preg_match('/bytesPerPage:\s*(\d+)/', $content, $m)) $bytesPerPage = (float)$m[1];
    if (preg_match('/pagesPerVirtualBlock:\s*(\d+)/', $content, $m)) $pagesPerVBlock = (float)$m[1];
    if (preg_match('/numVirtualBlocks:\s*(\d+)/', $content, $m)) $numVBlocks = (float)$m[1];

    if ($bytesPerPage > 0 && $pagesPerVBlock > 0 && $numVBlocks > 0) {
        $data['capacity_bytes_new'] = $bytesPerPage * $pagesPerVBlock * $numVBlocks;
    }

    if (preg_match('/numBands:\s*(\d+)/', $content, $m)) {
        $data['bands']['total'] = (int)$m[1];
        if (preg_match('/^band:\s+0\s+Utility Band/m', $content)) {
            $data['bands']['utility'] = 1;
        }
        
        $partition_starts = [];
        preg_match_all('/(USER|INTERMEDIATE|SKINNY) PARTITION:\s*band:\s*(\d+)/s', $content, $matches, PREG_SET_ORDER);
        foreach ($matches as $match) {
            $partition_starts[strtoupper($match[1])] = (int)$match[2];
        }
        
        $last_band_num = $data['bands']['utility'];
        if (isset($partition_starts['INTERMEDIATE'])) {
            $next_start = $partition_starts['USER'] ?? $data['bands']['total'];
            $data['bands']['intermediate'] = $next_start - $partition_starts['INTERMEDIATE'];
            $last_band_num += $data['bands']['intermediate'];
        }
        if (isset($partition_starts['SKINNY'])) {
             $next_start = $partition_starts['USER'] ?? $data['bands']['total'];
             $data['bands']['skinny'] = $next_start - $partition_starts['SKINNY'];
             $last_band_num += $data['bands']['skinny'];
        }
        $data['bands']['user'] = $data['bands']['total'] - $last_band_num;

    } else {
        $total = 0;
        $partitions = ['USER', 'SKINNY', 'INTERMEDIATE'];
        foreach ($partitions as $p) {
            if (preg_match('/====\s*' . $p . '\s*PARTITION\s*====\s*(\d+)\s*bands/s', $content, $m)) {
                $count = (int)$m[1];
                $data['bands'][strtolower($p)] = $count;
                $total += $count;
            }
        }
        $data['bands']['total'] = $total;
    }
    
    if (preg_match('/Grown Bad Blocks Count:\s*(\d+)/', $content, $matches)) {
        $data['bad_blocks']['grown'] = (int)$matches[1];
    }
    if (preg_match('/Factory Bad Blocks Count:\s*(\d+)/', $content, $matches)) {
        $data['bad_blocks']['factory'] = (int)$matches[1];
    }

    $partitions_for_health = ['USER PARTITION', 'SKINNY PARTITION', 'INTERMEDIATE PARTITION'];
    foreach ($partitions_for_health as $partition_name) {
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

    $asptool_content = file_get_contents($_FILES['asptool_file']['tmp_name']);
    $ioservice_content = file_get_contents($_FILES['ioservice_file']['tmp_name']);

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
            bands_total INTEGER,
            bands_user INTEGER,
            bands_intermediate INTEGER,
            bands_skinny INTEGER,
            bands_utility INTEGER,
            total_capacity_bytes_new INTEGER,
            data_hash TEXT NOT NULL UNIQUE
        )
    ");
    
    $data_hash = hash('sha256', implode('|', [
        $ioservice_data['serial_number'] ?? 'N/A',
        $asptool_data['capacity_bytes_new'] ?? 0,
        $asptool_data['bands']['total'] ?? 0
    ]));

    $stmt = $pdo->prepare("
        INSERT OR IGNORE INTO disk_uploads (
            timestamp, device_model, serial_number, firmware, manufacturer, cell_type,
            bands_total, bands_user, bands_intermediate, bands_skinny, bands_utility,
            total_capacity_bytes_new, data_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->execute([
        date('Y-m-d H:i:s'),
        $ioservice_data['model'] ?? null,
        $ioservice_data['serial_number'] ?? null,
        $ioservice_data['firmware'] ?? null,
        $ioservice_data['manufacturer'] ?? null,
        $ioservice_data['cell_type'] ?? null,
        $asptool_data['bands']['total'] ?? 0,
        $asptool_data['bands']['user'] ?? 0,
        $asptool_data['bands']['intermediate'] ?? 0,
        $asptool_data['bands']['skinny'] ?? 0,
        $asptool_data['bands']['utility'] ?? 0,
        $asptool_data['capacity_bytes_new'] ?? 0,
        $data_hash
    ]);

    $html = "<strong>✅ 数据解析成功！</strong><br><br>";
    $html .= "<h3>磁盘信息</h3>";
    $html .= "<strong>型号:</strong> " . htmlspecialchars($ioservice_data['model'] ?? '未知') . "<br>";
    $html .= "<strong>厂商:</strong> " . htmlspecialchars($ioservice_data['manufacturer'] ?? '未知') . "<br>";
    $html .= "<strong>颗粒:</strong> " . htmlspecialchars($ioservice_data['cell_type'] ?? '未知') . "<br>";
    
    if (!empty($asptool_data['bad_blocks']) || !empty($asptool_data['partition_health'])) {
        $html .= "<h3>健康与寿命</h3>";
        $html .= "<strong>出厂坏块数:</strong> " . ($asptool_data['bad_blocks']['factory'] ?? '未找到') . "<br>";
        $html .= "<strong>增长坏块数:</strong> " . ($asptool_data['bad_blocks']['grown'] ?? '未找到') . "<br>";
        foreach($asptool_data['partition_health'] as $name => $health) {
            $html .= "<strong>" . htmlspecialchars(str_replace(' PARTITION', '', $name)) . " 剩余寿命:</strong> " . $health['health_percent'] . "% (" . $health['avg_cycles'] . "/" . $health['eol_cycles'] . ")<br>";
        }
    }

    $html .= "<h3>Band 数量</h3>";
    $html .= "<strong>总计:</strong> " . $asptool_data['bands']['total'] . "<br>";
    $html .= "<strong>User:</strong> " . $asptool_data['bands']['user'] . "<br>";
    $html .= "<strong>Intermediate:</strong> " . $asptool_data['bands']['intermediate'] . "<br>";
    $html .= "<strong>Skinny:</strong> " . $asptool_data['bands']['skinny'] . "<br>";
    $html .= "<strong>Utility:</strong> " . $asptool_data['bands']['utility'] . "<br>";
    $html .= "<h3>计算出的物理容量</h3>";
    $html .= "<strong>总容量:</strong> " . format_bytes_human_readable($asptool_data['capacity_bytes_new']) . "<br>";
    
    send_json_response(true, $html);

} catch (Exception $e) {
    error_log("Disk Upload Error: " . $e->getMessage() . " in file " . $e->getFile() . " on line " . $e->getLine());
    $httpCode = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
    $userMessage = ($httpCode >= 400 && $httpCode < 500) ? $e->getMessage() : '服务器遇到内部错误。';
    send_json_response(false, '处理失败: ' . $userMessage, $httpCode);
}

ob_end_flush();
?>
