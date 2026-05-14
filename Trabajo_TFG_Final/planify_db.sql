CREATE DATABASE IF NOT EXISTS planify_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE planify_db;

-- Tabla usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id        INT          NOT NULL AUTO_INCREMENT,
    usuario   VARCHAR(80)  NOT NULL UNIQUE,
    email     VARCHAR(180) NOT NULL UNIQUE,
    password  VARCHAR(255) NOT NULL,          -- Siempre almacenado con password_hash()
    nombre    VARCHAR(120) DEFAULT NULL,
    plan      ENUM('free','premium') NOT NULL DEFAULT 'free',
    creado_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_usuario ON usuarios (usuario);
CREATE INDEX idx_email   ON usuarios (email);

-- Tabla tableros
CREATE TABLE IF NOT EXISTS tableros (
    id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#469f8a',
    starred TINYINT(1) DEFAULT 0,
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para colaboradores (tablero_usuarios)
CREATE TABLE IF NOT EXISTS tablero_usuarios (
    tablero_id VARCHAR(36) NOT NULL,
    usuario_id INT NOT NULL,
    PRIMARY KEY (tablero_id, usuario_id),
    FOREIGN KEY (tablero_id) REFERENCES tableros(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla columnas
CREATE TABLE IF NOT EXISTS columnas (
    id VARCHAR(36) NOT NULL,
    tablero_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) DEFAULT 'todo',
    order_index INT DEFAULT 0,
    PRIMARY KEY (id),
    FOREIGN KEY (tablero_id) REFERENCES tableros(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla tareas
CREATE TABLE IF NOT EXISTS tareas (
    id VARCHAR(36) NOT NULL,
    columna_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    due_date DATE DEFAULT NULL,
    tag VARCHAR(50) DEFAULT '',
    order_index INT DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (columna_id) REFERENCES columnas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla tareas_checklist
CREATE TABLE IF NOT EXISTS tareas_checklist (
    id INT AUTO_INCREMENT NOT NULL,
    tarea_id VARCHAR(36) NOT NULL,
    text VARCHAR(255) NOT NULL,
    done TINYINT(1) DEFAULT 0,
    PRIMARY KEY (id),
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla chat_mensajes
CREATE TABLE IF NOT EXISTS chat_mensajes (
    id VARCHAR(36) NOT NULL,
    tablero_id VARCHAR(36) NOT NULL,
    sender_id INT NOT NULL,
    text TEXT NOT NULL,
    ts BIGINT NOT NULL,
    read_status TINYINT(1) DEFAULT 0,
    PRIMARY KEY (id),
    FOREIGN KEY (tablero_id) REFERENCES tableros(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla actividad
CREATE TABLE IF NOT EXISTS actividad (
    id VARCHAR(36) NOT NULL,
    usuario_id INT NOT NULL,
    text TEXT NOT NULL,
    ts BIGINT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;