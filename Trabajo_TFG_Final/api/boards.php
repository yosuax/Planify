<?php
// api/boards.php
require_once 'config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true);
$userId = $_GET['userId'] ?? ($data['userId'] ?? null);

if (!$userId) {
    echo json_encode(['error' => 'No autorizado']);
    exit;
}

if ($action === 'get') {
    // Obtener todos los tableros del usuario (creados o donde sea colaborador)
    $stmt = $pdo->prepare("
        SELECT t.* FROM tableros t 
        LEFT JOIN tablero_usuarios tu ON t.id = tu.tablero_id
        WHERE t.created_by = ? OR tu.usuario_id = ?
        GROUP BY t.id
    ");
    $stmt->execute([$userId, $userId]);
    $boards = $stmt->fetchAll();

    foreach ($boards as &$board) {
        $board['starred'] = (bool)$board['starred'];
        
        // Cargar miembros
        $stmt = $pdo->prepare("SELECT u.id, u.usuario as name, u.email FROM usuarios u JOIN tablero_usuarios tu ON u.id = tu.usuario_id WHERE tu.tablero_id = ?");
        $stmt->execute([$board['id']]);
        $board['members'] = $stmt->fetchAll();
        
        // Cargar columnas
        $stmt = $pdo->prepare("SELECT * FROM columnas WHERE tablero_id = ? ORDER BY order_index ASC");
        $stmt->execute([$board['id']]);
        $columns = $stmt->fetchAll();
        
        foreach ($columns as &$col) {
            // Cargar tareas
            $stmt = $pdo->prepare("SELECT * FROM tareas WHERE columna_id = ? ORDER BY order_index ASC");
            $stmt->execute([$col['id']]);
            $cards = $stmt->fetchAll();
            
            foreach ($cards as &$card) {
                // Cargar checklist
                $stmt = $pdo->prepare("SELECT * FROM tareas_checklist WHERE tarea_id = ?");
                $stmt->execute([$card['id']]);
                $cl = $stmt->fetchAll();
                foreach($cl as &$citem) {
                    $citem['done'] = (bool)$citem['done'];
                }
                $card['checklist'] = $cl;
            }
            $col['cards'] = $cards;
        }
        $board['columns'] = $columns;
    }
    echo json_encode(['success' => true, 'boards' => $boards]);
} 
elseif ($action === 'save') {
    // Guardar lista completa de tableros (simplificado: borra y recrea para este prototipo, 
    // o maneja un sync. Dado que el frontend asume que guarda todo el array, hacemos un guardado masivo).
    if (!isset($data['boards'])) {
        echo json_encode(['error' => 'No boards provided']);
        exit;
    }
    
    $pdo->beginTransaction();
    try {
        // En un entorno real se haría un upsert. Por simplicidad de la migración del localStorage,
        // vamos a borrar los tableros del usuario y recrearlos (o actualizarlos si existen).
        foreach ($data['boards'] as $b) {
            // Upsert Tablero
            $stmt = $pdo->prepare("INSERT INTO tableros (id, title, description, color, starred, created_by) 
                                   VALUES (?, ?, ?, ?, ?, ?) 
                                   ON DUPLICATE KEY UPDATE title=?, description=?, color=?, starred=?");
            $stmt->execute([
                $b['id'], $b['title'], $b['description'] ?? '', $b['color'], (int)$b['starred'], $userId,
                $b['title'], $b['description'] ?? '', $b['color'], (int)$b['starred']
            ]);
            
            // Upsert Miembros (simplificado: ignoramos aquí para evitar borrar colaboradores)
            
            // Upsert Columnas
            $colOrder = 0;
            foreach ($b['columns'] as $c) {
                $stmt = $pdo->prepare("INSERT INTO columnas (id, tablero_id, title, type, order_index) 
                                       VALUES (?, ?, ?, ?, ?) 
                                       ON DUPLICATE KEY UPDATE title=?, type=?, order_index=?");
                $stmt->execute([
                    $c['id'], $b['id'], $c['title'], $c['type'], $colOrder,
                    $c['title'], $c['type'], $colOrder
                ]);
                $colOrder++;
                
                // Upsert Tareas
                $cardOrder = 0;
                foreach ($c['cards'] as $card) {
                    $stmt = $pdo->prepare("INSERT INTO tareas (id, columna_id, title, description, priority, due_date, tag, order_index) 
                                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                           ON DUPLICATE KEY UPDATE columna_id=?, title=?, description=?, priority=?, due_date=?, tag=?, order_index=?");
                    $dueDate = empty($card['dueDate']) ? null : $card['dueDate'];
                    $stmt->execute([
                        $card['id'], $c['id'], $card['title'], $card['description'] ?? '', $card['priority'] ?? 'medium', $dueDate, $card['tag'] ?? '', $cardOrder,
                        $c['id'], $card['title'], $card['description'] ?? '', $card['priority'] ?? 'medium', $dueDate, $card['tag'] ?? '', $cardOrder
                    ]);
                    $cardOrder++;
                    
                    // Upsert Checklist (borrar y recrear por simplicidad)
                    $stmt = $pdo->prepare("DELETE FROM tareas_checklist WHERE tarea_id = ?");
                    $stmt->execute([$card['id']]);
                    if (!empty($card['checklist'])) {
                        foreach ($card['checklist'] as $cl) {
                            $stmt = $pdo->prepare("INSERT INTO tareas_checklist (tarea_id, text, done) VALUES (?, ?, ?)");
                            $stmt->execute([$card['id'], $cl['text'], (int)$cl['done']]);
                        }
                    }
                }
            }
        }
        $pdo->commit();
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => $e->getMessage()]);
    }
}
elseif ($action === 'activity') {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->prepare("SELECT * FROM actividad WHERE usuario_id = ? ORDER BY ts DESC LIMIT 60");
        $stmt->execute([$userId]);
        echo json_encode(['success' => true, 'activity' => $stmt->fetchAll()]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO actividad (id, usuario_id, text, ts) VALUES (?, ?, ?, ?)");
        $id = uniqid();
        $stmt->execute([$id, $userId, $data['text'], time() * 1000]);
        echo json_encode(['success' => true]);
    }
}
?>
