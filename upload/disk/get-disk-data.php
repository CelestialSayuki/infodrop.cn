<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

ob_start();

if (!isset($_SESSION['encryption_key'])) {
    ob_clean();
    http_response_code(400);
    echo json_encode(['error' => '错误：加密密钥不存在或已过期，请刷新页面重试。']);
    exit;
}

$key = $_SESSION['encryption_key'];
unset($_SESSION['encryption_key']);

function get_nominal_gb(float $bytes): int {
    $gb = $bytes / 1e9;
    $sizes_gb = [64, 128, 256, 512, 1000, 2000, 4000, 8000];
    $closest_size = $sizes_gb[0];
    foreach ($sizes_gb as $size) {
        if (abs($gb - $size) < abs($gb - $closest_size)) {
            $closest_size = $size;
        }
    }
    return (int)$closest_size;
}

$db_path = __DIR__ . '/disk_data.sqlite';

try {
    if (!file_exists($db_path)) {
        throw new Exception('数据库文件不存在。', 503);
    }

    $pdo = new PDO('sqlite:' . $db_path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->query("SELECT * FROM disk_uploads ORDER BY total_capacity_bytes_new ASC, timestamp DESC");
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $summary = [
        'total_submissions' => count($results),
        'manufacturers' => [],
        'cell_types' => [],
        'capacity_distribution' => []
    ];
    
    $capacity_data = [];
    foreach ($results as $row) {
        if (!empty($row['manufacturer'])) {
            $summary['manufacturers'][$row['manufacturer']] = ($summary['manufacturers'][$row['manufacturer']] ?? 0) + 1;
        }
        if (!empty($row['cell_type'])) {
            $summary['cell_types'][$row['cell_type']] = ($summary['cell_types'][$row['cell_type']] ?? 0) + 1;
        }

        $bytes = (float)$row['total_capacity_bytes_new'];
        if ($bytes > 0) {
            $nominal_gb = get_nominal_gb($bytes);
            if (!isset($capacity_data[$nominal_gb])) {
                $capacity_data[$nominal_gb] = [];
            }
            $capacity_data[$nominal_gb][] = (string)$bytes;
        }
    }
    
    ksort($capacity_data);
    foreach ($capacity_data as $gb => $bytes_array) {
        $value_counts = array_count_values($bytes_array);
        ksort($value_counts, SORT_NUMERIC);
        $summary['capacity_distribution'][$gb] = [
            'total_samples' => count($bytes_array),
            'distribution'  => $value_counts
        ];
    }


    $final_payload = [
        'summary' => $summary,
        'rows' => $results
    ];

    $plaintext = json_encode($final_payload, JSON_UNESCAPED_UNICODE);
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

    ob_clean();
    echo json_encode($response_payload);

} catch (Exception $e) {
    ob_clean();
    http_response_code(500);
    echo json_encode(['error' => '服务器错误: ' . $e->getMessage()]);
}

ob_end_flush();
?>
