<?php

session_start();
header('Content-Type: application/json; charset=utf-8');

try {
    $key = random_bytes(32);

    $_SESSION['encryption_key'] = $key;
    echo json_encode(['key' => base64_encode($key)]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => '密钥生成失败: ' . $e->getMessage()]);
}
?>
