<?php

$dataFile = 'latency_data.csv';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => '无效的请求方法，只接受 POST。']);
    exit;
}

$jsonPayload = file_get_contents('php://input');
$data = json_decode($jsonPayload, true);

if (json_last_error() !== JSON_ERROR_NONE ||
    !isset($data['processorModel'], $data['deviceInfo'], $data['testResults']) ||
    empty(trim($data['processorModel']))
) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => '提交的数据格式错误或缺少必要字段。']);
    exit;
}

try {
    $timestamp = (new DateTime("now", new DateTimeZone("Asia/Tokyo")))->format(DateTime::ATOM);

    $processorModel = htmlspecialchars(trim($data['processorModel']), ENT_QUOTES, 'UTF-8');
    $deviceInfo = htmlspecialchars(trim($data['deviceInfo']), ENT_QUOTES, 'UTF-8');
    
    $testResults = trim($data['testResults']);
    if (!preg_match('/^\[(\[[\d\.]+,[\d\.]+\],?)*\]$/', $testResults)) {
         throw new Exception('测试结果数据格式不合法。');
    }

    $newRow = [
        $timestamp,
        $processorModel,
        $deviceInfo,
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
