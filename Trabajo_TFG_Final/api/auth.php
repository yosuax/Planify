<?php
// api/auth.php
require_once 'config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true);

if ($action === 'register') {
    if (!$data || !isset($data['usuario']) || !isset($data['email']) || !isset($data['password'])) {
        echo json_encode(['error' => 'Faltan datos']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE usuario = ? OR email = ?");
    $stmt->execute([$data['usuario'], $data['email']]);
    if ($stmt->fetch()) {
        echo json_encode(['error' => 'Usuario o email ya registrados']);
        exit;
    }
    
    $hash = password_hash($data['password'], PASSWORD_DEFAULT);
    $plan = $data['plan'] ?? 'free';
    
    $stmt = $pdo->prepare("INSERT INTO usuarios (usuario, email, password, nombre, plan) VALUES (?, ?, ?, ?, ?)");
    if ($stmt->execute([$data['usuario'], $data['email'], $hash, $data['usuario'], $plan])) {
        $id = $pdo->lastInsertId();
        echo json_encode(['success' => true, 'user' => [
            'id' => $id,
            'usuario' => $data['usuario'],
            'email' => $data['email'],
            'name' => $data['usuario'],
            'plan' => $plan
        ]]);
    } else {
        echo json_encode(['error' => 'Error al registrar']);
    }
} elseif ($action === 'login') {
    if (!$data || !isset($data['usuario']) || !isset($data['password'])) {
        echo json_encode(['error' => 'Faltan datos']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE usuario = ? OR email = ?");
    $stmt->execute([$data['usuario'], $data['usuario']]);
    $user = $stmt->fetch();
    
    if ($user && password_verify($data['password'], $user['password'])) {
        echo json_encode(['success' => true, 'user' => [
            'id' => $user['id'],
            'usuario' => $user['usuario'],
            'email' => $user['email'],
            'name' => $user['nombre'],
            'plan' => $user['plan']
        ]]);
    } else {
        echo json_encode(['error' => 'Usuario o contraseña incorrectos']);
    }
} elseif ($action === 'users') {
    $stmt = $pdo->query("SELECT id, usuario, email, nombre as name, plan FROM usuarios");
    $users = $stmt->fetchAll();
    echo json_encode(['success' => true, 'users' => $users]);
} else {
    echo json_encode(['error' => 'Acción no válida']);
}
?>
