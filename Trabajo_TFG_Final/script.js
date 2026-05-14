/* ══════════════════════════════════════════════════
   PLANIFY — script.js  (TFG completo)
   Auth toggle + App completa (Kanban, Chat, etc.)
══════════════════════════════════════════════════ */

"use strict";

/* ─── AUTH TOGGLE (index.html) ─────────────────── */
const container = document.querySelector(".container");
const btnSignIn = document.getElementById("btn-sign-in");
const btnSignUp = document.getElementById("btn-sign-up");

if (btnSignIn && btnSignUp) {
    btnSignIn.addEventListener("click", () => container.classList.remove("toggle"));
    btnSignUp.addEventListener("click", () => container.classList.add("toggle"));

    // Plan card click
    document.querySelectorAll(".plan-card").forEach((card) => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".plan-card").forEach((c) => c.classList.remove("active"));
            card.classList.add("active");
        });
    });

    // Mostrar mensajes de error procedentes del PHP
    const errMsgs = {
        campos: "Por favor, rellena todos los campos.",
        credenciales: "Usuario o contraseña incorrectos.",
        email: "El formato del correo no es válido.",
        password: "La contraseña debe tener al menos 6 caracteres.",
        existe: "Ese usuario o correo ya está registrado.",
        bbdd: "Error al guardar los datos. Inténtalo de nuevo.",
        session: "Error de sesión. Vuelve a iniciar sesión.",
    };
    const params = new URLSearchParams(window.location.search);
    const errKey = params.get("error");
    const form = params.get("form");
    if (errKey && errMsgs[errKey]) {
        if (form === "registro") container.classList.add("toggle");
        const alert = document.createElement("div");
        alert.style.cssText = "background:#ffe0e0;border:1.5px solid #e53e3e;color:#c53030;padding:.6rem 1rem;border-radius:7px;font-size:.82rem;margin-bottom:.5rem;text-align:center";
        alert.textContent = errMsgs[errKey];
        const targetForm = form === "registro"
            ? document.querySelector(".sign-up")
            : document.querySelector(".sign-in");
        if (targetForm) {
            const btn = targetForm.querySelector("button[type=submit]");
            if (btn) targetForm.insertBefore(alert, btn);
            setTimeout(() => alert.remove(), 5000);
        }
        history.replaceState(null, "", window.location.pathname);
    }
}

/* ══════════════════════════════════════════════════
   BASE DE DATOS — PHP myadmin
══════════════════════════════════════════════════ */
const DB = {
    getSession: () => {
        try { return JSON.parse(localStorage.getItem("planify_session")); } catch { return null; }
    },
    setSession: (u) => localStorage.setItem("planify_session", JSON.stringify({ userId: u.id, user: u, loginAt: Date.now() })),
    clearSession: () => localStorage.removeItem("planify_session"),

    getBoards: async (uid) => {
        const res = await fetch(`api/boards.php?action=get&userId=${uid}`);
        const data = await res.json();
        return data.success ? data.boards : [];
    },
    saveBoards: async (uid, boards) => {
        await fetch(`api/boards.php?action=save&userId=${uid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boards })
        });
    },

    getActivity: async (uid) => {
        const res = await fetch(`api/boards.php?action=activity&userId=${uid}`);
        const data = await res.json();
        return data.success ? data.activity : [];
    },
    addActivity: async (uid, text) => {
        await fetch(`api/boards.php?action=activity&userId=${uid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
    },

    getMessages: async (roomId) => {
        const res = await fetch(`api/chat.php?action=get&roomId=${roomId}`);
        const data = await res.json();
        return data.success ? data.messages : [];
    },
    addMessage: async (roomId, msg) => {
        await fetch(`api/chat.php?action=send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, senderId: msg.senderId, text: msg.text })
        });
    },
};

/* ─── Utils ────────────────────────────────────── */
const uid_gen = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const esc = (s) =>
    String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
const initials = (n) =>
    n
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("");
const fmtDate = (d) => (d ? new Date(d + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "hace un momento";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
    const d = Math.floor(s / 86400);
    if (d < 7) return `hace ${d} día${d > 1 ? "s" : ""}`;
    return new Date(ts).toLocaleDateString("es-ES");
};
const isOverdue = (d) => d && new Date(d + "T23:59") < new Date();
const isSoon = (d) => {
    if (!d) return false;
    const diff = (new Date(d + "T23:59") - new Date()) / 86400000;
    return diff >= 0 && diff <= 3;
};

/* ══════════════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════════════ */
const S = {
    user: null,
    boards: [],
    curBoardId: null,
    curCardId: null,
    curChatRoom: null,
    selColor: "#469f8a",
    selPrio: "medium",
    selTag: "",

    get board() {
        return this.boards.find((b) => b.id === this.curBoardId) || null;
    },
    get card() {
        if (!this.board || !this.curCardId) return null;
        for (const col of this.board.columns) {
            const c = col.cards.find((c) => c.id === this.curCardId);
            if (c) return { card: c, col };
        }
        return null;
    },
};

/* ══════════════════════════════════════════════════
   ARRANQUE
══════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("app-wrapper")) return; // sólo en app.html

    const sess = DB.getSession();
    if (sess) {
        const user = sess.user;
        if (user) {
            bootApp(user);
            return;
        }
    }
    window.location.href = "index.html";
});

async function bootApp(user) {
    S.user = user;
    S.boards = await DB.getBoards(user.id);
    renderSidebar();
    showView("home");
    document.addEventListener("keydown", globalKeys);
}

function globalKeys(e) {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === "Escape") closeAllModals();
    if (e.key === "b") showView("home");
}

/* ══════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════ */
async function renderSidebar() {
    const u = S.user;
    // Avatar + nombre
    el("sb-avatar").textContent = initials(u.name || u.usuario || "U");
    el("sb-username").textContent = u.name || u.usuario || "Usuario";
    el("sb-userrole").textContent = u.plan === "premium" ? "Plan Premium" : "Plan Free";
    el("sb-plan-badge").textContent = u.plan === "premium" ? "⭐ Premium" : "Free";

    // Lista tableros
    const list = el("sb-boards");
    list.innerHTML = "";
    S.boards.forEach((b) => {
        const btn = document.createElement("button");
        btn.className = "sidebar-board-item" + (S.curBoardId === b.id ? " active" : "");
        btn.dataset.id = b.id;
        btn.innerHTML = `<span class="board-dot" style="background:${b.color}"></span><span>${esc(b.title)}</span>`;
        btn.onclick = () => openBoard(b.id);
        list.appendChild(btn);
    });

    // Chat: contar mensajes no leídos
    let unread = 0;
    for (const b of S.boards) {
        const msgs = await DB.getMessages(b.id);
        msgs.forEach((m) => {
            if (!m.read_status && m.sender_id != S.user.id) unread++;
        });
    }
    const badge = el("chat-badge");
    if (badge) {
        badge.textContent = unread || "";
        badge.style.display = unread ? "" : "none";
    }
}

const el = (id) => document.getElementById(id);

/* ══════════════════════════════════════════════════
   VISTAS
══════════════════════════════════════════════════ */
function showView(name, extra) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));

    const viewMap = {
        home: "view-home",
        board: "view-board",
        chat: "view-chat",
        activity: "view-activity",
        members: "view-members",
        settings: "view-settings",
    };
    const navMap = { home: "nav-home", chat: "nav-chat", activity: "nav-activity", members: "nav-members", settings: "nav-settings" };

    const viewEl = el(viewMap[name]);
    if (viewEl) viewEl.classList.add("active");
    const navEl = el(navMap[name]);
    if (navEl) navEl.classList.add("active");

    // Breadcrumb
    const crumb = el("breadcrumb");
    const labels = { home: "Mis tableros", board: S.board?.title || "Tablero", chat: "Chat", activity: "Actividad", members: "Miembros", settings: "Ajustes" };
    if (crumb)
        crumb.innerHTML =
            name === "board"
                ? `<span onclick="showView('home')" style="cursor:pointer;color:var(--text3)">Tableros</span> <span>/</span> <span>${esc(S.board?.title || "")}</span>`
                : `<span>${labels[name] || ""}</span>`;

    if (name === "home") renderHome();
    if (name === "board") renderKanban();
    if (name === "chat") renderChat();
    if (name === "activity") renderActivity();
    if (name === "members") renderMembers();
    if (name === "settings") renderSettings();

    document.querySelectorAll(".sidebar-board-item").forEach((i) => i.classList.toggle("active", i.dataset.id === S.curBoardId));
    if (window.innerWidth <= 900) el("sidebar")?.classList.remove("open");
}

/* ══════════════════════════════════════════════════
   HOME — TABLEROS
══════════════════════════════════════════════════ */
function renderHome() {
    // Saludo
    const h = new Date().getHours();
    const greet = h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
    const greetEl = el("home-greeting");
    if (greetEl) greetEl.textContent = `¡${greet}, ${(S.user.name || S.user.usuario || "").split(" ")[0]}!`;

    const grid = el("boards-grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!S.boards.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class='bx bx-table'></i><p>Aún no tienes tableros. ¡Crea el primero!</p></div>`;
    } else {
        S.boards.forEach((b) => {
            const total = b.columns.reduce((a, c) => a + c.cards.length, 0);
            const done = (b.columns[b.columns.length - 1]?.cards || []).length;
            const div = document.createElement("div");
            div.className = "board-card";
            div.innerHTML = `
                <div class="board-card-header" style="background:${b.color}">
                    <button class="board-card-star${b.starred ? " active" : ""}" onclick="toggleStar(event,'${b.id}')">
                        <i class='bx bx${b.starred ? "s" : ""}-star'></i>
                    </button>
                </div>
                <div class="board-card-body">
                    <div class="board-card-name">${esc(b.title)}</div>
                    <div class="board-card-meta">
                        <span><i class='bx bx-table'></i> ${b.columns.length} columnas</span>
                        <span><i class='bx bx-check-circle'></i> ${done}/${total} hechas</span>
                    </div>
                </div>`;
            div.addEventListener("click", (e) => {
                if (!e.target.closest(".board-card-star")) openBoard(b.id);
            });
            grid.appendChild(div);
        });
    }

    // Botón nuevo
    const newBtn = document.createElement("div");
    newBtn.className = "board-card-new";
    newBtn.innerHTML = `<i class='bx bx-plus'></i> Nuevo tablero`;
    newBtn.onclick = openCreateBoard;
    grid.appendChild(newBtn);
}

function toggleStar(e, boardId) {
    e.stopPropagation();
    const b = S.boards.find((b) => b.id === boardId);
    if (b) {
        b.starred = !b.starred;
        saveBoards();
        renderHome();
    }
}

/* ── Crear tablero ──────────────────────────────── */
function openCreateBoard() {
    S.selColor = "#469f8a";
    el("cb-name").value = "";
    el("cb-desc").value = "";
    el("cb-members").value = "";
    document.querySelectorAll("#cb-color-picker .color-dot").forEach((d) => d.classList.toggle("sel", d.dataset.color === S.selColor));
    openModal("modal-create-board");
    setTimeout(() => el("cb-name").focus(), 80);
}

function createBoard() {
    const name = el("cb-name").value.trim();
    if (!name) {
        toast("El nombre es obligatorio", "error");
        return;
    }
    const members = el("cb-members")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const board = {
        id: uid_gen(),
        title: name,
        description: el("cb-desc").value.trim(),
        color: S.selColor,
        starred: false,
        members,
        columns: [
            { id: uid_gen(), title: "Por hacer", type: "todo", cards: [] },
            { id: uid_gen(), title: "En proceso", type: "inprog", cards: [] },
            { id: uid_gen(), title: "Finalizada", type: "done", cards: [] },
        ],
        createdAt: Date.now(),
    };
    S.boards.push(board);
    saveBoards();
    DB.addActivity(S.user.id, `Tablero <strong>"${name}"</strong> creado`);
    closeModal("modal-create-board");
    renderSidebar();
    openBoard(board.id);
    toast(`Tablero "${name}" creado`, "success");
}

/* ══════════════════════════════════════════════════
   KANBAN
══════════════════════════════════════════════════ */
function openBoard(boardId) {
    S.curBoardId = boardId;
    showView("board");
    const btn = el("btn-star-board");
    const b = S.boards.find(x => x.id === boardId);
    if (btn && b) {
        btn.style.display = "";
        btn.innerHTML = `<i class='bx bx${b.starred ? "s" : ""}-star'></i>`;
    }
}

async function deleteCurrentBoard() {
    if (!S.curBoardId) return;
    if (!confirm("¿Estás seguro de que deseas eliminar este tablero? Todo su contenido se perderá para siempre.")) return;
    S.boards = S.boards.filter(b => b.id !== S.curBoardId);
    await DB.saveBoards(S.user.id, S.boards);
    S.curBoardId = null;
    toast("Tablero eliminado", "success");
    showView('home');
}

function toggleStarCurrent() {
    if (!S.curBoardId) return;
    const b = S.boards.find(x => x.id === S.curBoardId);
    if (b) {
        b.starred = !b.starred;
        saveBoards();
        const btn = el("btn-star-board");
        if (btn) btn.innerHTML = `<i class='bx bx${b.starred ? "s" : ""}-star'></i>`;
    }
}

function renderKanban() {
    const board = S.board;
    if (!board) return;

    const kanban = el("kanban-board");
    if (!kanban) return;
    kanban.innerHTML = "";

    board.columns.forEach((col) => kanban.appendChild(buildCol(col)));

    // Botón nueva columna
    const addBtn = document.createElement("button");
    addBtn.className = "add-col-btn";
    addBtn.innerHTML = `<i class='bx bx-plus'></i> Añadir columna`;
    addBtn.onclick = openAddColumn;
    kanban.appendChild(addBtn);

    initDnD();
}

function buildCol(col) {
    const div = document.createElement("div");
    div.className = `kanban-col col-${col.type || "todo"}`;
    div.dataset.colId = col.id;

    div.innerHTML = `
        <div class="col-header">
            <span class="col-header-dot"></span>
            <span class="col-title" contenteditable="true" spellcheck="false"
                  onblur="renameCol('${col.id}',this.textContent)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">${esc(col.title)}</span>
            <span class="col-count">${col.cards.length}</span>
            <div class="col-actions">
                <button class="col-action-btn" onclick="openAddTask('${col.id}')" title="Añadir tarea"><i class='bx bx-plus'></i></button>
                <button class="col-action-btn" onclick="deleteCol('${col.id}')" title="Eliminar columna"><i class='bx bx-trash'></i></button>
            </div>
        </div>
        <div class="col-cards" id="cards-${col.id}" data-col="${col.id}"></div>
        <button class="add-task-btn" onclick="openAddTask('${col.id}')"><i class='bx bx-plus'></i> Añadir tarea</button>`;

    const cardsCont = div.querySelector(`#cards-${col.id}`);
    col.cards.forEach((card) => cardsCont.appendChild(buildCard(card, col.id)));
    return div;
}

function buildCard(card, colId) {
    const div = document.createElement("div");
    div.className = "task-card";
    div.draggable = true;
    div.dataset.cardId = card.id;
    div.dataset.colId = colId;

    const tagColors = { "": "#469f8a", diseño: "#e53e3e", dev: "#3182ce", testing: "#d69e2e", docs: "#12c6a0", urgente: "#e53e3e" };
    const tagColor = tagColors[card.tag] || "#469f8a";
    const tagLabel = card.tag || "General";
    const overdue = isOverdue(card.dueDate);
    const soon = !overdue && isSoon(card.dueDate);
    const done = (card.checklist || []).filter((i) => i.done).length;
    const total = (card.checklist || []).length;

    div.innerHTML = `
        ${card.tag !== undefined ? `<span class="task-tag" style="background:${tagColor}">${tagLabel}</span>` : ""}
        <div class="task-title">${esc(card.title)}</div>
        ${card.description ? `<div class="task-desc">${esc(card.description)}</div>` : ""}
        <div class="task-footer">
            <span class="task-priority prio-${card.priority}">
                ${card.priority === "low" ? "🟢 Baja" : card.priority === "high" ? "🔴 Alta" : "🟡 Media"}
            </span>
            <div style="display:flex;gap:.4rem;align-items:center">
                ${total ? `<span style="font-size:.7rem;color:var(--text3)"><i class='bx bx-list-check'></i> ${done}/${total}</span>` : ""}
                ${card.dueDate ? `<span class="task-due${overdue ? " overdue" : soon ? " soon" : ""}"><i class='bx bx-calendar'></i>${fmtDate(card.dueDate)}</span>` : ""}
            </div>
        </div>
        ${total ? `<div class="task-checklist-bar"><div class="bar-track"><div class="bar-fill" style="width:${Math.round((done / total) * 100)}%"></div></div></div>` : ""}`;

    div.addEventListener("click", () => openCardDetail(card.id));
    return div;
}

/* ── Columnas ───────────────────────────────────── */
function openAddColumn() {
    el("col-name-input").value = "";
    openModal("modal-add-column");
    setTimeout(() => el("col-name-input").focus(), 80);
}
function addColumn() {
    const name = el("col-name-input").value.trim();
    if (!name) {
        toast("El nombre es obligatorio", "error");
        return;
    }
    const col = { id: uid_gen(), title: name, type: "todo", cards: [] };
    S.board.columns.push(col);
    saveBoards();
    closeModal("modal-add-column");
    renderKanban();
    toast(`Columna "${name}" añadida`, "success");
}
function renameCol(colId, name) {
    const col = S.board?.columns.find((c) => c.id === colId);
    if (col && name.trim()) {
        col.title = name.trim();
        saveBoards();
    }
}
function deleteCol(colId) {
    const col = S.board?.columns.find((c) => c.id === colId);
    if (!col) return;
    if (col.cards.length && !confirm(`¿Eliminar "${col.title}" con ${col.cards.length} tarea(s)?`)) return;
    S.board.columns = S.board.columns.filter((c) => c.id !== colId);
    saveBoards();
    renderKanban();
    toast("Columna eliminada", "info");
}

/* ── Tareas ─────────────────────────────────────── */
let _addTaskColId = null;
function openAddTask(colId) {
    _addTaskColId = colId;
    S.selPrio = "medium";
    S.selTag = "";
    ["task-title-input", "task-desc-input"].forEach((id) => (el(id).value = ""));
    el("task-due-input").value = "";
    el("task-priority-input").value = "medium";
    document.querySelectorAll("#tag-picker .color-dot").forEach((d) => d.classList.toggle("sel", d.dataset.tag === ""));
    openModal("modal-add-task");
    setTimeout(() => el("task-title-input").focus(), 80);
}
function addTask() {
    const title = el("task-title-input").value.trim();
    if (!title) {
        toast("El título es obligatorio", "error");
        return;
    }
    const col = S.board?.columns.find((c) => c.id === _addTaskColId);
    if (!col) return;
    const card = {
        id: uid_gen(),
        title,
        description: el("task-desc-input").value.trim(),
        priority: el("task-priority-input").value,
        dueDate: el("task-due-input").value,
        tag: S.selTag || "",
        checklist: [],
        createdAt: Date.now(),
    };
    col.cards.push(card);
    saveBoards();
    DB.addActivity(S.user.id, `Tarea <strong>"${title}"</strong> creada en <strong>${col.title}</strong>`);
    closeModal("modal-add-task");
    renderKanban();
    toast("Tarea creada ✓", "success");
}

/* ── Detalle de tarea ───────────────────────────── */
function openCardDetail(cardId) {
    S.curCardId = cardId;
    const res = S.card;
    if (!res) return;
    const { card, col } = res;

    el("det-title").textContent = card.title;
    el("det-desc").value = card.description || "";
    el("det-priority").value = card.priority;
    el("det-due").value = card.dueDate || "";

    // Tag picker detalle
    S.detTag = card.tag || "";
    document.querySelectorAll("#det-tag-picker .color-dot").forEach((d) => d.classList.toggle("sel", d.dataset.tag === (card.tag || "")));

    // Move col
    const moveCol = el("det-move-col");
    moveCol.innerHTML = S.board.columns.map((c) => `<option value="${c.id}"${c.id === col.id ? " selected" : ""}>${esc(c.title)}</option>`).join("");

    // Checklist
    renderDetChecklist(card.checklist || []);
    openModal("modal-card-detail");
}
function renderDetChecklist(items) {
    const cont = el("det-checklist");
    cont.innerHTML = "";
    items.forEach((item, i) => {
        const div = document.createElement("div");
        div.className = "checklist-item";
        div.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""} onchange="toggleCheck(${i})">
            <span class="${item.done ? "done" : ""}">${esc(item.text)}</span>
            <button onclick="removeCheck(${i})"><i class='bx bx-x'></i></button>`;
        cont.appendChild(div);
    });
}
function toggleCheck(i) {
    const c = S.card?.card;
    if (!c) return;
    c.checklist[i].done = !c.checklist[i].done;
    saveBoards();
    renderDetChecklist(c.checklist);
}
function removeCheck(i) {
    const c = S.card?.card;
    if (!c) return;
    c.checklist.splice(i, 1);
    saveBoards();
    renderDetChecklist(c.checklist);
}
function addCheckItem() {
    const input = el("det-check-input");
    const text = input.value.trim();
    if (!text) return;
    const c = S.card?.card;
    if (!c) return;
    c.checklist = c.checklist || [];
    c.checklist.push({ text, done: false });
    saveBoards();
    renderDetChecklist(c.checklist);
    input.value = "";
}
function saveCardDetail() {
    const res = S.card;
    if (!res) return;
    const { card } = res;
    card.title = el("det-title").textContent.trim() || card.title;
    card.description = el("det-desc").value.trim();
    card.priority = el("det-priority").value;
    card.dueDate = el("det-due").value;
    card.tag = S.detTag || "";
    saveBoards();
    DB.addActivity(S.user.id, `Tarea <strong>"${card.title}"</strong> actualizada`);
    closeModal("modal-card-detail");
    renderKanban();
    toast("Cambios guardados ✓", "success");
}
function moveCardToCol() {
    const res = S.card;
    if (!res) return;
    const { card, col: srcCol } = res;
    const tgtId = el("det-move-col").value;
    if (tgtId === srcCol.id) {
        toast("La tarea ya está en esa columna", "info");
        return;
    }
    const tgtCol = S.board.columns.find((c) => c.id === tgtId);
    if (!tgtCol) return;
    srcCol.cards = srcCol.cards.filter((c) => c.id !== card.id);
    tgtCol.cards.push(card);
    saveBoards();
    DB.addActivity(S.user.id, `Tarea <strong>"${card.title}"</strong> movida a <strong>${tgtCol.title}</strong>`);
    closeModal("modal-card-detail");
    renderKanban();
    toast(`Tarea movida a "${tgtCol.title}"`, "success");
}
function deleteCard() {
    const res = S.card;
    if (!res) return;
    if (!confirm(`¿Eliminar "${res.card.title}"?`)) return;
    res.col.cards = res.col.cards.filter((c) => c.id !== res.card.id);
    saveBoards();
    closeModal("modal-card-detail");
    renderKanban();
    toast("Tarea eliminada", "info");
}

/* ── Drag & Drop ────────────────────────────────── */
let _dragCardId = null,
    _dragSrcColId = null;
function initDnD() {
    document.querySelectorAll(".task-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
            _dragCardId = card.dataset.cardId;
            _dragSrcColId = card.dataset.colId;
            card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            document.querySelectorAll(".drag-placeholder").forEach((p) => p.remove());
            document.querySelectorAll(".kanban-col").forEach((c) => c.classList.remove("drag-over"));
        });
    });
    document.querySelectorAll(".col-cards").forEach((zone) => {
        zone.addEventListener("dragover", (e) => {
            e.preventDefault();
            zone.closest(".kanban-col").classList.add("drag-over");
            const after = getDragAfter(zone, e.clientY);
            const ph = document.querySelector(".drag-placeholder") || Object.assign(document.createElement("div"), { className: "drag-placeholder" });
            after ? zone.insertBefore(ph, after) : zone.appendChild(ph);
        });
        zone.addEventListener("dragleave", (e) => {
            if (!zone.contains(e.relatedTarget)) {
                zone.closest(".kanban-col")?.classList.remove("drag-over");
                document.querySelectorAll(".drag-placeholder").forEach((p) => p.remove());
            }
        });
        zone.addEventListener("drop", (e) => {
            e.preventDefault();
            const tgtColId = zone.dataset.col;
            document.querySelectorAll(".drag-placeholder").forEach((p) => p.remove());
            zone.closest(".kanban-col")?.classList.remove("drag-over");
            if (!_dragCardId) return;
            const after = getDragAfter(zone, e.clientY);
            moveCardDnD(_dragCardId, _dragSrcColId, tgtColId, after?.dataset?.cardId || null);
            _dragCardId = _dragSrcColId = null;
        });
    });
}
function getDragAfter(container, y) {
    const cards = [...container.querySelectorAll(".task-card:not(.dragging)")];
    return cards.reduce(
        (closest, el) => {
            const box = el.getBoundingClientRect();
            const off = y - box.top - box.height / 2;
            if (off < 0 && off > closest.off) return { off, el };
            return closest;
        },
        { off: Number.NEGATIVE_INFINITY },
    ).el;
}
function moveCardDnD(cardId, srcColId, tgtColId, afterCardId) {
    const src = S.board.columns.find((c) => c.id === srcColId);
    const tgt = S.board.columns.find((c) => c.id === tgtColId);
    if (!src || !tgt) return;
    const idx = src.cards.findIndex((c) => c.id === cardId);
    if (idx === -1) return;
    const [card] = src.cards.splice(idx, 1);
    if (afterCardId) {
        const ai = tgt.cards.findIndex((c) => c.id === afterCardId);
        tgt.cards.splice(ai, 0, card);
    } else tgt.cards.push(card);
    if (srcColId !== tgtColId) DB.addActivity(S.user.id, `Tarea <strong>"${card.title}"</strong> movida a <strong>${tgt.title}</strong>`);
    saveBoards();
    renderKanban();
}

/* ══════════════════════════════════════════════════
   CHAT
══════════════════════════════════════════════════ */
async function renderChat() {
    const rooms = el("chat-rooms");
    if (!rooms) return;
    rooms.innerHTML = "";
    for (const b of S.boards) {
        const msgs = await DB.getMessages(b.id);
        const last = msgs[msgs.length - 1];
        const div = document.createElement("div");
        div.className = "chat-room" + (S.curChatRoom === b.id ? " active" : "");
        div.innerHTML = `
            <div class="chat-room-icon"><i class='bx bx-group'></i></div>
            <div class="chat-room-info">
                <div class="chat-room-name">${esc(b.title)}</div>
                <div class="chat-room-preview">${last ? esc(last.text.slice(0, 30)) : "Sin mensajes"}</div>
            </div>
            <div class="chat-room-meta">
                <span class="chat-room-time">${last ? timeAgo(last.ts) : ""}</span>
            </div>`;
        div.onclick = () => openChatRoom(b.id);
        rooms.appendChild(div);
    }
    if (!S.boards.length) rooms.innerHTML = `<div class="empty-state"><i class='bx bx-chat'></i><p>Crea un tablero para tener un chat de equipo</p></div>`;
    if (S.curChatRoom) await loadChatMessages(S.curChatRoom);
}

async function openChatRoom(boardId) {
    S.curChatRoom = boardId;
    const board = S.boards.find((b) => b.id === boardId);
    el("chat-room-name").textContent = board?.title || "Chat";
    el("chat-members-info").textContent = `${board?.members?.length || 1} miembro(s)`;
    document.querySelectorAll(".chat-room").forEach((r) => r.classList.remove("active"));
    await loadChatMessages(boardId);
}

async function loadChatMessages(boardId) {
    const cont = el("chat-messages");
    if (!cont) return;
    const msgs = await DB.getMessages(boardId);
    cont.innerHTML = "";
    if (!msgs.length) {
        cont.innerHTML = `<div class="chat-empty"><i class='bx bx-message-rounded'></i><p>Sé el primero en escribir. ¡El equipo te espera!</p></div>`;
        return;
    }
    msgs.forEach((msg) => {
        const own = msg.sender_id == S.user.id;
        const senderName = msg.senderName || "Usuario";
        const div = document.createElement("div");
        div.className = "chat-msg" + (own ? " own" : "");
        div.innerHTML = `
            <div class="avatar sm">${initials(senderName)}</div>
            <div>
                <div class="chat-bubble">
                    <div class="chat-bubble-meta">
                        <span class="chat-bubble-name">${esc(senderName)}</span>
                        <span class="chat-bubble-time">${timeAgo(msg.ts)}</span>
                    </div>
                    ${esc(msg.text)}
                </div>
            </div>`;
        cont.appendChild(div);
    });
    cont.scrollTop = cont.scrollHeight;
}

async function sendChatMsg() {
    if (!S.curChatRoom) {
        toast("Selecciona un tablero primero", "error");
        return;
    }
    const ta = el("chat-input");
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) return;
    const msg = { senderId: S.user.id, text };
    await DB.addMessage(S.curChatRoom, msg);
    ta.value = "";
    await loadChatMessages(S.curChatRoom);
    toast("Mensaje enviado", "success");
}

/* ══════════════════════════════════════════════════
   ACTIVIDAD
══════════════════════════════════════════════════ */
function renderActivity() {
    const list = el("activity-list");
    if (!list) return;
    const items = DB.getActivity(S.user.id);
    list.innerHTML = "";
    if (!items.length) {
        list.innerHTML = `<div class="empty-state"><i class='bx bx-history'></i><p>No hay actividad reciente.</p></div>`;
        return;
    }
    items.forEach((item) => {
        const div = document.createElement("div");
        div.className = "activity-item";
        div.innerHTML = `<div class="activity-icon"><i class='bx bx-bolt-circle'></i></div>
            <div><div class="activity-text">${item.text}</div><div class="activity-time">${timeAgo(item.ts)}</div></div>`;
        list.appendChild(div);
    });
}

/* ══════════════════════════════════════════════════
   MIEMBROS
══════════════════════════════════════════════════ */
function renderMembers() {
    const grid = el("members-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const users = DB.getUsers();
    const shown = users.length ? users : [S.user];
    shown.forEach((u) => {
        const div = document.createElement("div");
        div.className = "member-card";
        div.innerHTML = `<div class="avatar lg">${initials(u.name || u.usuario || "U")}</div>
            <div class="member-name">${esc(u.name || u.usuario || "Usuario")}</div>
            <div class="member-role">${esc(u.email || "")}</div>
            <span class="member-plan ${u.plan || "free"}">${u.plan === "premium" ? "⭐ Premium" : "Free"}</span>`;
        grid.appendChild(div);
    });
    // Stats generales
    let total = 0;
    S.boards.forEach((b) => b.columns.forEach((c) => (total += c.cards.length)));
    const done = S.boards.reduce((a, b) => a + (b.columns[b.columns.length - 1]?.cards?.length || 0), 0);
    setIfExists("stat-boards", S.boards.length);
    setIfExists("stat-tasks", total);
    setIfExists("stat-done", done);
    setIfExists("stat-members", shown.length);
}

/* ══════════════════════════════════════════════════
   AJUSTES
══════════════════════════════════════════════════ */
function renderSettings() {
    setIfExists("set-name", S.user.name || S.user.usuario || "", "value");
    setIfExists("set-email", S.user.email || "", "value");
    setIfExists("set-plan-badge", S.user.plan === "premium" ? "⭐ Plan Premium activo" : "Plan Free activo");
}
function saveSettings() {
    const name = el("set-name")?.value.trim();
    const pass = el("set-pass")?.value;
    if (!name) {
        toast("El nombre no puede estar vacío", "error");
        return;
    }
    const users = DB.getUsers();
    const idx = users.findIndex((u) => u.id === S.user.id);
    const changes = { name, usuario: name };
    if (pass) {
        if (pass.length < 6) {
            toast("Mínimo 6 caracteres", "error");
            return;
        }
        changes.password = btoa(pass);
    }
    if (idx > -1) {
        users[idx] = { ...users[idx], ...changes };
        DB.saveUsers(users);
    }
    S.user = { ...S.user, ...changes };
    DB.setSession(S.user);
    renderSidebar();
    renderSettings();
    toast("Perfil actualizado ✓", "success");
}
function upgradePlan() {
    const users = DB.getUsers();
    const idx = users.findIndex((u) => u.id === S.user.id);
    S.user.plan = "premium";
    if (idx > -1) {
        users[idx].plan = "premium";
        DB.saveUsers(users);
    }
    DB.setSession(S.user);
    renderSidebar();
    renderSettings();
    toast("¡Plan Premium activado! 🎉", "success");
}

/* ══════════════════════════════════════════════════
   MODALES
══════════════════════════════════════════════════ */
function openModal(id) {
    el(id)?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}
function closeModal(id) {
    el(id)?.classList.add("hidden");
    document.body.style.overflow = "";
}
function closeAllModals() {
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => m.classList.add("hidden"));
    document.body.style.overflow = "";
}
function closeOnBg(e, id) {
    if (e.target.id === id) closeModal(id);
}

// Color picker tablero
document.addEventListener("click", (e) => {
    const dot = e.target.closest("#cb-color-picker .color-dot");
    if (dot) {
        document.querySelectorAll("#cb-color-picker .color-dot").forEach((d) => d.classList.remove("sel"));
        dot.classList.add("sel");
        S.selColor = dot.dataset.color;
    }

    const tag = e.target.closest("#tag-picker .color-dot");
    if (tag) {
        document.querySelectorAll("#tag-picker .color-dot").forEach((d) => d.classList.remove("sel"));
        tag.classList.add("sel");
        S.selTag = tag.dataset.tag || "";
    }

    const dtag = e.target.closest("#det-tag-picker .color-dot");
    if (dtag) {
        document.querySelectorAll("#det-tag-picker .color-dot").forEach((d) => d.classList.remove("sel"));
        dtag.classList.add("sel");
        S.detTag = dtag.dataset.tag || "";
    }
});

// Enter en inputs
document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
    if (!el("modal-create-board")?.classList.contains("hidden")) createBoard();
    else if (!el("modal-add-column")?.classList.contains("hidden")) addColumn();
    else if (!el("modal-add-task")?.classList.contains("hidden")) addTask();
});

// Chat enter
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && e.target.id === "chat-input") {
        e.preventDefault();
        sendChatMsg();
    }
});

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
const icons = { success: "bx-check-circle", error: "bx-x-circle", info: "bx-info-circle" };
function toast(msg, type = "info", dur = 3000) {
    const cont = el("toast-container") || document.body;
    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.innerHTML = `<i class='bx ${icons[type] || icons.info}'></i><span>${msg}</span>`;
    cont.appendChild(div);
    setTimeout(() => {
        div.classList.add("out");
        setTimeout(() => div.remove(), 250);
    }, dur);
}

/* ══════════════════════════════════════════════════
   PERSISTENCIA & HELPERS
══════════════════════════════════════════════════ */
async function saveBoards() {
    await DB.saveBoards(S.user.id, S.boards);
    renderSidebar();
}
function setIfExists(id, val, attr = "textContent") {
    const e = el(id);
    if (e) e[attr] = val;
}

function logout() {
    DB.clearSession();
    document.removeEventListener("keydown", globalKeys);
    window.location.href = "index.html";
}
function toggleMobileMenu() {
    el("sidebar")?.classList.toggle("open");
}
