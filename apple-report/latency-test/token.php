<?php
session_start();

if (empty($_SESSION['token'])) {
    $_SESSION['token'] = bin2hex(random_bytes(32));
}

header('Content-Type: application/json');
echo json_encode(['token' => $_SESSION['token']]);
?>
