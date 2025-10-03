<?php
define('PENDING_CHANGES_DIR', __DIR__ . '/pending-changes');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => '错误：只允许 POST 请求。']);
    exit;
}

$json_payload = file_get_contents('php://input');

$data = json_decode($json_payload, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['message' => '请求无效，无法解析 JSON 数据。']);
    exit;
}

if (empty($data['source']) || !isset($data['changes']) || !is_array($data['changes']) || empty($data['changes'])) {
    http_response_code(400);
    echo json_encode(['message' => '请求无效，缺少必要的 source 或 changes 数据。']);
    exit;
}

try {
    if (!is_dir(PENDING_CHANGES_DIR)) {
        if (!mkdir(PENDING_CHANGES_DIR, 0777, true)) {
             throw new Exception('无法创建用于保存修改的目录，请检查服务器权限。');
        }
    }

    $timestamp = gmdate('Y-m-d\TH-i-s\Z');
    $filename = $timestamp . '_changes.json';
    $filePath = PENDING_CHANGES_DIR . '/' . $filename;
    $fileContent = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if (file_put_contents($filePath, $fileContent) === false) {
        throw new Exception('无法将修改写入文件，请检查服务器权限。');
    }

    http_response_code(200);
    echo json_encode([
        'message' => '修改已成功提交审核！感谢您的贡献。',
        'fileName' => $filename
    ]);

} catch (Exception $e) {
    error_log('处理提交时发生错误: ' . $e->getMessage()); 
    http_response_code(500);
    echo json_encode(['message' => '服务器内部错误，提交失败。']);
}
