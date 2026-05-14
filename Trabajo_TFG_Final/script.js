/* ══════════════════════════════════════════════════
   PLANIFY — script.js  (TFG completo - FINAL)
   Unificación de lógica Frontend + Backend PHP
   ══════════════════════════════════════════════════ */

"use strict";

/* ─── BASE DE DATOS — API PHP ─────────────────── */
const DB = {
    // Sesión en LocalStorage (persiste entre recargas)
    getSession: () => {
        try {
            return JSON.parse(localStorage.getItem("planify_session"));
        } catch {
            return null;
        }
    },
    setSession: (u) => {
        localStorage.setItem("planify_session", JSON.stringify({
            userId: u.id,
            user: u,
            loginAt: Date.now()
        }));
    },
    clearSession: () => localStorage.removeItem("planify_session"),

    // API Boards
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

    // API Activity
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

    // API Chat
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

    // API Usuarios
    getUsers: async () => {
        const res = await fetch(`api/auth.php?action=users`);
        const data = await res.json();
        return data.success ? data.users : [];
    }
};

/* ─── UTILS ────────────────────────────────────── */
const el = (id) => document.getElementById(id);
const uid_gen = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const initials = (n) => (n || "U").trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const fmtDate = (d) => (d ? new Date(d + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const timeAgo = (ts) => {
    if(!ts) return "";
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
const setIfExists = (id, val, attr = "textContent") => {
    const e = el(id);
    if (e) e[attr] = val;
};

/* ─── ESTADO GLOBAL ─── */
const S = {
    user: null,
    boards: [],
    curBoardId: null,
    curCardId: null,
    curChatRoom: null,
    selColor: "#469f8a",
    selTag: "",
    detTag: "",

    get board() {
        return this.boards.find((b) => String(b.id) === String(this.curBoardId)) || null;
    },
    get card() {
        if (!this.board || !this.curCardId) return null;
        for (const col of this.board.columns) {
            const c = col.cards.find((c) => String(c.id) === String(this.curCardId));
            if (c) return { card: c, col };
        }
        return null;
    }
};

/* ─── ARRANQUE ─── */
document.addEventListener("DOMContentLoaded", async () => {
    // Si estamos en index.html, manejar animaciones de login
    const loginContainer = document.querySelector(".container");
    const btnSignIn = document.getElementById("btn-sign-in");
    const btnSignUp = document.getElementById("btn-sign-up");
    if (btnSignIn && btnSignUp) {
        btnSignIn.addEventListener("click", () => loginContainer.classList.remove("toggle"));
        btnSignUp.addEventListener("click", () => loginContainer.classList.add("toggle"));
        return; // No arrancar app en index.html
    }

    // Si estamos en app.html, arrancar aplicación
    if (el("app-wrapper")) {
        const sess = DB.getSession();
        if (sess && sess.user) {
            await bootApp(sess.user);
        } else {
            window.location.href = "index.html";
        }
    }
});

async function bootApp(user) {
    S.user = user;
    S.boards = await DB.getBoards(user.id);
    await renderSidebar();
    await showView("home");
    document.addEventListener("keydown", globalKeys);
}

function globalKeys(e) {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === "Escape") closeAllModals();
    if (e.key === "b") showView("home");
}

/* ─── UI CORE ─── */
async function renderSidebar() {
    const u = S.user;
    setIfExists("sb-avatar", initials(u.name || u.usuario));
    setIfExists("topbar-avatar", initials(u.name || u.usuario));
    setIfExists("sb-username", u.name || u.usuario || "Usuario");
    setIfExists("sb-userrole", u.plan === "premium" ? "Plan Premium" : "Plan Free");
    setIfExists("sb-plan-badge", u.plan === "premium" ? "⭐ Premium" : "Free");

    // Lista tableros sidebar
    const list = el("sb-boards");
    if (list) {
        list.innerHTML = "";
        S.boards.forEach((b) => {
            const btn = document.createElement("button");
            btn.className = "sidebar-board-item" + (String(S.curBoardId) === String(b.id) ? " active" : "");
            btn.innerHTML = `<span class="board-dot" style="background:${b.color}"></span><span>${esc(b.title)}</span>`;
            btn.onclick = () => openBoard(b.id);
            list.appendChild(btn);
        });
    }

    // Chat badge
    let unread = 0; // (Simulado por ahora, o podrías pedirlo a la API)
    const badge = el("nav-chat-badge");
    if (badge) {
        badge.style.display = unread ? "block" : "none";
        badge.textContent = unread;
    }
}

async function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));

    const viewMap = { home: "view-home", board: "view-board", chat: "view-chat", activity: "view-activity", members: "view-members", settings: "view-settings" };
    const navMap = { home: "nav-home", chat: "nav-chat", activity: "nav-activity", members: "nav-members", settings: "nav-settings" };

    const viewEl = el(viewMap[name]); if (viewEl) viewEl.classList.add("active");
    const navEl = el(navMap[name]); if (navEl) navEl.classList.add("active");

    const crumb = el("breadcrumb");
    if (crumb) {
        if (name === "board") {
            crumb.innerHTML = `<span onclick=\"showView('home')\" style=\"cursor:pointer;color:var(--text3)\">Tableros</span> <span>/</span> <span>${esc(S.board?.title)}</span>`;
        } else {
            const labels = { home: "Mis tableros", chat: "Chat de equipo", activity: "Actividad reciente", members: "Miembros del equipo", settings: "Ajustes de perfil" };
            crumb.textContent = labels[name] || "";
        }
    }

    if (name === "home") renderHome();
    if (name === "board") renderKanban();
    if (name === "chat") await renderChat();
    if (name === "activity") await renderActivity();
    if (name === "members") await renderMembers();
    if (name === "settings") renderSettings();

    if (window.innerWidth <= 900) el("sidebar")?.classList.remove("open");
    const starBtn = el("btn-star-board");
    if (starBtn) starBtn.style.display = name === "board" ? "flex" : "none";
}

/* ─── HOME ─── */
function renderHome() {
    const h = new Date().getHours();
    const greet = h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
    const greetEl = el("home-greeting");
    if (greetEl) greetEl.textContent = `¡${greet}, ${(S.user.name || S.user.usuario || "").split(" ")[0]}!`;

    const grid = el("boards-grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!S.boards.length) {
        grid.innerHTML = `<div class=\"empty-state\" style=\"grid-column:1/-1\"><i class='bx bx-table'></i><p>Aún no tienes tableros. ¡Crea el primero!</p></div>`;
    } else {
        S.boards.forEach((b) => {
            let total = 0, done = 0;
            b.columns.forEach((c, i) => {
                total += c.cards.length;
                if (i === b.columns.length - 1) done += c.cards.length;
            });
            const div = document.createElement("div");
            div.className = "board-card";
            div.innerHTML = `
                <div class=\"board-card-header\" style=\"background:${b.color}\">
                    <button class=\"board-card-star${b.starred ? " active" : ""}\" onclick=\"toggleStar(event,'${b.id}')\">
                        <i class='bx bx${b.starred ? "s" : ""}-star'></i>
                    </button>
                </div>
                <div class=\"board-card-body\">
                    <div class=\"board-card-name\">${esc(b.title)}</div>
                    <div class=\"board-card-meta\">
                        <span><i class='bx bx-table'></i> ${b.columns.length} col</span>
                        <span><i class='bx bx-check-circle'></i> ${done}/${total}</span>
                    </div>
                </div>`;
            div.onclick = (e) => { if (!e.target.closest(".board-card-star")) openBoard(b.id); };
            grid.appendChild(div);
        });
    }
    // Botón crear
    const newBtn = document.createElement("div");
    newBtn.className = "board-card-new";
    newBtn.innerHTML = `<i class='bx bx-plus'></i> Nuevo tablero`;
    newBtn.onclick = openCreateBoard;
    grid.appendChild(newBtn);
}

async function toggleStar(e, boardId) {
    e.stopPropagation();
    const b = S.boards.find((b) => String(b.id) === String(boardId));
    if (b) {
        b.starred = !b.starred;
        await saveBoards();
        renderHome();
    }
}

function openCreateBoard() {
    S.selColor = "#469f8a";
    el("cb-name").value = "";
    el("cb-desc").value = "";
    el("cb-members").value = "";
    document.querySelectorAll("#cb-color-picker .color-dot").forEach((d) => d.classList.toggle("sel", d.dataset.color === S.selColor));
    openModal("modal-create-board");
    setTimeout(() => el("cb-name").focus(), 80);
}

async function createBoard() {
    const name = el("cb-name").value.trim();
    if (!name) { toast("El nombre es obligatorio", "error"); return; }
    const board = {
        id: uid_gen(),
        title: name,
        description: el("cb-desc").value.trim(),
        color: S.selColor,
        starred: false,
        members: [],
        columns: [
            { id: uid_gen(), title: "Por hacer", type: "todo", cards: [] },
            { id: uid_gen(), title: "En proceso", type: "inprog", cards: [] },
            { id: uid_gen(), title: "Finalizada", type: "done", cards: [] }
        ],
        createdAt: Date.now()
    };
    S.boards.push(board);
    await saveBoards();
    await DB.addActivity(S.user.id, `Tablero <strong>"${name}"</strong> creado`);
    closeModal("modal-create-board");
    await renderSidebar();
    openBoard(board.id);
    toast(`Tablero "${name}" creado`, "success");
}

/* ─── KANBAN ─── */
function openBoard(boardId) {
    S.curBoardId = boardId;
    showView("board");
}

function renderKanban() {
    const board = S.board;
    if (!board) return;

    const kanban = el("kanban-board");
    if (!kanban) return;
    kanban.innerHTML = "";

    board.columns.forEach((col) => kanban.appendChild(buildCol(col)));

    const addBtn = document.createElement("button");
    addBtn.className = "add-col-btn";
    addBtn.innerHTML = `<i class='bx bx-plus'></i> Añadir columna`;
    addBtn.onclick = openAddColumn;
    kanban.appendChild(addBtn);

    setIfExists("board-title", board.title);
    const starBtn = el("btn-star-board");
    if (starBtn) {
        starBtn.innerHTML = board.starred ? "<i class='bx bxs-star' style='color:#d69e2e'></i>" : "<i class='bx bx-star'></i>";
    }
    initDnD();
}

function buildCol(col) {
    const div = document.createElement("div");
    div.className = `kanban-col col-${col.type || "todo"}`;
    div.dataset.colId = col.id;
    div.innerHTML = `
        <div class="col-header">
            <span class="col-header-dot"></span>
            <span class="col-title" contenteditable="true" onblur=\"renameCol('${col.id}',this.textContent)\">${esc(col.title)}</span>
            <span class="col-count">${col.cards.length}</span>
            <div class="col-actions">
                <button onclick=\"openAddTask('${col.id}')\"><i class='bx bx-plus'></i></button>
                <button onclick=\"deleteCol('${col.id}')\"><i class='bx bx-trash'></i></button>
            </div>
        </div>
        <div class="col-cards" id="cards-${col.id}" data-col="${col.id}"></div>
        <button class="add-task-btn" onclick=\"openAddTask('${col.id}')\"><i class='bx bx-plus'></i> Añadir tarea</button>`;
    
    const cardsCont = div.querySelector(".col-cards");
    col.cards.forEach((card) => cardsCont.appendChild(buildCard(card, col.id)));
    return div;
}

function buildCard(card, colId) {
    const div = document.createElement("div");
    div.className = "task-card";
    div.draggable = true;
    div.dataset.cardId = card.id;
    div.dataset.colId = colId;
    
    const overdue = isOverdue(card.dueDate);
    const soon = !overdue && isSoon(card.dueDate);
    const done = (card.checklist || []).filter(i => i.done).length;
    const total = (card.checklist || []).length;

    div.innerHTML = `
        ${card.tag ? `<span class=\"task-tag\" style=\"background:var(--primary)\">${esc(card.tag)}</span>` : ""}
        <div class=\"task-title\">${esc(card.title)}</div>
        <div class=\"task-footer\">
            <span class=\"task-priority prio-${card.priority}\">${card.priority === "high" ? "🔴 Alta" : card.priority === "low" ? "🟢 Baja" : "🟡 Media"}</span>
            <div style=\"display:flex;gap:.4rem\">
                ${total ? `<span><i class='bx bx-list-check'></i> ${done}/${total}</span>` : ""}
                ${card.dueDate ? `<span class=\"task-due ${overdue ? "overdue" : soon ? "soon" : ""}\"><i class='bx bx-calendar'></i> ${fmtDate(card.dueDate)}</span>` : ""}
            </div>
        </div>`;
    div.onclick = () => openCardDetail(card.id);
    return div;
}

async function renameCol(id, name) {
    const c = S.board.columns.find(c => String(c.id) === String(id));
    if (c && name.trim()) {
        c.title = name.trim();
        await saveBoards();
    }
}

async function deleteCol(id) {
    if (!confirm("¿Eliminar columna?")) return;
    S.board.columns = S.board.columns.filter(c => String(c.id) !== String(id));
    await saveBoards();
    renderKanban();
}

let _addTaskColId = null;
function openAddTask(colId) {
    _addTaskColId = colId;
    el("task-title-input").value = "";
    el("task-desc-input").value = "";
    openModal("modal-add-task");
}

async function addTask() {
    const title = el("task-title-input").value.trim();
    if (!title) return;
    const col = S.board.columns.find(c => String(c.id) === String(_addTaskColId));
    if (!col) return;
    const card = { id: uid_gen(), title, description: el("task-desc-input").value, priority: "medium", checklist: [], createdAt: Date.now() };
    col.cards.push(card);
    await saveBoards();
    closeModal("modal-add-task");
    renderKanban();
}

function openCardDetail(id) {
    S.curCardId = id;
    const res = S.card; if (!res) return;
    el("det-title").textContent = res.card.title;
    el("det-desc").value = res.card.description || "";
    openModal("modal-card-detail");
}

async function saveCardDetail() {
    const res = S.card; if (!res) return;
    res.card.description = el("det-desc").value;
    await saveBoards();
    closeModal("modal-card-detail");
    renderKanban();
}

/* ─── DRAG & DROP ─── */
function initDnD() {
    const cards = document.querySelectorAll(".task-card");
    const zones = document.querySelectorAll(".col-cards");
    cards.forEach(c => {
        c.ondragstart = () => { c.classList.add("dragging"); };
        c.ondragend = () => { c.classList.remove("dragging"); };
    });
    zones.forEach(z => {
        z.ondragover = e => { e.preventDefault(); z.classList.add("drag-over"); };
        z.ondragleave = () => z.classList.remove("drag-over");
        z.ondrop = async () => {
            z.classList.remove("drag-over");
            const cardEl = document.querySelector(".dragging");
            if (!cardEl) return;
            const cardId = cardEl.dataset.cardId;
            const srcColId = cardEl.dataset.colId;
            const tgtColId = z.dataset.col;
            if (srcColId === tgtColId) return;
            
            const srcCol = S.board.columns.find(c => String(c.id) === String(srcColId));
            const tgtCol = S.board.columns.find(c => String(c.id) === String(tgtColId));
            const cardIdx = srcCol.cards.findIndex(c => String(c.id) === String(cardId));
            const [card] = srcCol.cards.splice(cardIdx, 1);
            tgtCol.cards.push(card);
            
            await saveBoards();
            renderKanban();
        };
    });
}

/* ─── CHAT ─── */
async function renderChat() {
    const rooms = el("chat-rooms");
    if (!rooms) return;
    rooms.innerHTML = "";
    
    if (!S.boards.length) {
        rooms.innerHTML = `<div class=\"empty-state\"><i class='bx bx-chat'></i><p>Crea un tablero para habilitar el chat.</p></div>`;
        return;
    }

    for (const b of S.boards) {
        const msgs = await DB.getMessages(b.id);
        const last = msgs[msgs.length - 1];
        const div = document.createElement("div");
        div.className = "chat-room" + (String(S.curChatRoom) === String(b.id) ? " active" : "");
        div.innerHTML = `
            <div class=\"chat-room-icon\"><i class='bx bx-group'></i></div>
            <div class=\"chat-room-info\">
                <div class=\"chat-room-name\">${esc(b.title)}</div>
                <div class=\"chat-room-preview\">${last ? esc(last.text.slice(0, 30)) : "Sin mensajes"}</div>
            </div>`;
        div.onclick = () => openChatRoom(b.id);
        rooms.appendChild(div);
    }
    if (S.curChatRoom) await loadChatMessages(S.curChatRoom);
}

async function openChatRoom(id) {
    S.curChatRoom = id;
    const board = S.boards.find(b => String(b.id) === String(id));
    setIfExists("chat-room-name", board?.title || "Chat");
    await loadChatMessages(id);
    renderChat();
}

async function loadChatMessages(id) {
    const cont = el("chat-messages");
    if (!cont) return;
    const msgs = await DB.getMessages(id);
    cont.innerHTML = "";
    msgs.forEach(m => {
        const own = String(m.sender_id) === String(S.user.id);
        const div = document.createElement("div");
        div.className = "chat-msg" + (own ? " own" : "");
        div.innerHTML = `
            <div class=\"avatar sm\">${initials(m.senderName)}</div>
            <div>
                <div class=\"chat-bubble\">
                    <div class=\"chat-bubble-meta\"><span>${esc(m.senderName)}</span><span>${timeAgo(m.ts)}</span></div>
                    ${esc(m.text)}
                </div>
            </div>`;
        cont.appendChild(div);
    });
    cont.scrollTop = cont.scrollHeight;
}

async function sendChatMsg() {
    const input = el("chat-input");
    const text = input.value.trim();
    if (!text || !S.curChatRoom) return;
    await DB.addMessage(S.curChatRoom, { senderId: S.user.id, text });
    input.value = "";
    await loadChatMessages(S.curChatRoom);
}

/* ─── ACTIVIDAD ─── */
async function renderActivity() {
    const list = el("activity-list");
    if (!list) return;
    const items = await DB.getActivity(S.user.id);
    list.innerHTML = "";
    if (!items.length) {
        list.innerHTML = `<div class=\"empty-state\"><i class='bx bx-history'></i><p>No hay actividad.</p></div>`;
        return;
    }
    items.forEach(i => {
        const div = document.createElement("div");
        div.className = "activity-item";
        div.innerHTML = `<div class=\"activity-icon\"><i class='bx bx-bolt-circle'></i></div><div><div class=\"activity-text\">${i.text}</div><div class=\"activity-time\">${timeAgo(i.ts)}</div></div>`;
        list.appendChild(div);
    });
}

/* ─── MIEMBROS ─── */
async function renderMembers() {
    const grid = el("members-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const users = await DB.getUsers();
    users.forEach(u => {
        const div = document.createElement("div");
        div.className = "member-card";
        div.innerHTML = `<div class=\"avatar lg\">${initials(u.name || u.usuario)}</div><div class=\"member-name\">${esc(u.name || u.usuario)}</div><div class=\"member-role\">${u.email}</div><span class=\"member-plan ${u.plan}\">${u.plan}</span>`;
        grid.appendChild(div);
    });
}

/* ─── AJUSTES ─── */
function renderSettings() {
    setIfExists("set-name", S.user.name || S.user.usuario, "value");
    setIfExists("set-email", S.user.email, "value");
}

/* ─── PERSISTENCIA HELPERS ─── */
async function saveBoards() {
    await DB.saveBoards(S.user.id, S.boards);
    await renderSidebar();
}

function openModal(id) { el(id)?.classList.remove("hidden"); }
function closeModal(id) { el(id)?.classList.add("hidden"); }
function closeAllModals() { document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden")); }
function logout() { DB.clearSession(); window.location.href = "index.html"; }
function toast(m, t) { alert(m); } // Implementación simple para TFG
