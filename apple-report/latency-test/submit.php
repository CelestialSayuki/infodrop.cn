<?php
session_start();

$dataFile = 'latency_data.csv';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => '无效的请求方法，只接受 POST。']);
    exit;
}

$jsonPayload = file_get_contents('php://input');
$data = json_decode($jsonPayload, true);

if (
    empty($data['token']) ||
    empty($_SESSION['token']) ||
    !hash_equals($_SESSION['token'], $data['token'])
) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => '提交无效或已过期，请刷新页面重试。']);
    exit;
}

if (
    json_last_error() !== JSON_ERROR_NONE ||
    !isset($data['processorModel'], $data['deviceInfo'], $data['testResults']) ||
    empty(trim($data['processorModel']))
) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => '提交的数据格式错误或缺少必要字段。']);
    exit;
}

unset($_SESSION['token']);

try {
    $processorModel = $data['processorModel'];
    $deviceInfo = $data['deviceInfo'];
    $testResults = $data['testResults'];
    $timestamp = date('c');

    function sanitizeForCsv($field) {
        $field = trim($field);
        if (in_array(substr($field, 0, 1), ['=', '+', '-', '@'])) {
            $field = "'" . $field;
        }
        return $field;
    }

    $newRow = [
        $timestamp,
        sanitizeForCsv($processorModel),
        sanitizeForCsv($deviceInfo),
        $testResults
    ];

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => '数据准备失败: ' . $e->getMessage()]);
    exit;
}

try {
    $writeHeader = !file_exists($dataFile);

    $fileHandle = @fopen($dataFile, 'a');
    if ($fileHandle === false) {
        throw new Exception('无法打开数据文件进行写入，请检查文件权限。');
    }

    if (flock($fileHandle, LOCK_EX)) {
        if ($writeHeader) {
            $header = ['Timestamp', 'ProcessorModel', 'DeviceInfo', 'TestResults'];
            fputcsv($fileHandle, $header);
        }
        
        fputcsv($fileHandle, $newRow);

        flock($fileHandle, LOCK_UN);
    } else {
        throw new Exception('无法获取文件锁。');
    }

    fclose($fileHandle);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => '服务器错误：' . $e->getMessage()]);
    exit;
}

http_response_code(200);
echo json_encode(['status' => 'success', 'message' => '数据提交成功！']);

?>
