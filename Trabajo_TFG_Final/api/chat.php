<?php
// api/chat.php
require_once 'config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true);

if ($action === 'get') {
    $roomId = $_GET['roomId'] ?? '';
    if (!$roomId) {
        echo json_encode(['success' => true, 'messages' => []]);
        exit;
    }
    
    $stmt = $pdo->prepare("
        SELECT c.*, u.usuario as senderName 
        FROM chat_mensajes c 
        JOIN usuarios u ON c.sender_id = u.id 
        WHERE c.tablero_id = ? 
        ORDER BY c.ts ASC
    ");
    $stmt->execute([$roomId]);
    echo json_encode(['success' => true, 'messages' => $stmt->fetchAll()]);
} 
elseif ($action === 'send') {
    $roomId = $data['roomId'] ?? '';
    $senderId = $data['senderId'] ?? '';
    $text = $data['text'] ?? '';
    
    if (!$roomId || !$senderId || !$text) {
        echo json_encode(['error' => 'Faltan datos']);
        exit;
    }
    
    $id = uniqid();
    $ts = time() * 1000;
    
    $stmt = $pdo->prepare("INSERT INTO chat_mensajes (id, tablero_id, sender_id, text, ts) VALUES (?, ?, ?, ?, ?)");
    if ($stmt->execute([$id, $roomId, $senderId, $text, $ts])) {
        echo json_encode(['success' => true, 'msg' => [
            'id' => $id,
            'senderId' => $senderId,
            'text' => $text,
            'ts' => $ts
        ]]);
    } else {
        echo json_encode(['error' => 'Error al guardar mensaje']);
    }
}
?>
