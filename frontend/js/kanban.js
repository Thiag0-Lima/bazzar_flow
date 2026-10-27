const COLUMNS = [
  { key: "fechamento",        title: "Fechamento" },
  { key: "aguardando_inicio", title: "Aguardando Início" },
  { key: "criacao",           title: "Criação" },
  { key: "prod_ana",          title: "Prod. Papelaria" },
  { key: "prod_fellipe",      title: "Prod. Comunicação visual" },
  { key: "prod_atendimento",  title: "Prod. Atendimento" },
  { key: "prod_retirada",     title: "Prod. Retirada" },
  { key: "embalagem",         title: "Embalagem" },
  { key: "pronto",            title: "Pronto p/ Retirada" },
];

const TRANSITIONS = {
  atendente: {
    fechamento: ["aguardando_inicio", "prod_atendimento", "prod_ana", "prod_fellipe"],
    aguardando_inicio: ["prod_atendimento", "prod_ana", "prod_fellipe"],
    prod_atendimento: ["embalagem", "prod_ana"],
    prod_retirada: ["embalagem"],
    embalagem: ["pronto"],
  },
  criacao: {
    fechamento: ["criacao"],
    aguardando_inicio: ["criacao"],
    criacao: ["prod_ana", "prod_fellipe", "prod_atendimento"],
  },
  operador: {
    aguardando_inicio: ["prod_ana", "prod_fellipe"],
    prod_ana: ["prod_fellipe", "prod_atendimento", "criacao", "prod_retirada"],
    prod_fellipe: ["prod_ana", "prod_atendimento", "criacao", "prod_retirada"],
    prod_atendimento: ["prod_ana", "prod_fellipe", "criacao", "prod_retirada"],
    prod_retirada: ["prod_ana", "prod_fellipe", "prod_atendimento", "criacao"],
  },
  admin: {},
};

  const STATUS_LABEL = {
  fechamento: "Fechamento",
  aguardando_inicio: "Aguardando Início",
  criacao: "Criação",
  prod_ana: "Prod. Papelaria",
  prod_fellipe: "Prod. Comunicação visual",
  prod_atendimento: "Prod. Atendimento",
  prod_retirada: "Prod. Retirada",
  embalagem: "Embalagem",
  pronto: "Pronto p/ Retirada",
  entregue: "Entregue",
};

let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  currentUser = requireAuth();
  if (!currentUser) return;

  document.getElementById("userName").textContent = currentUser.full_name;
  renderNav(currentUser);

  // Nova OS: atendente, criação e admin
  if (["atendente", "criacao", "admin"].includes(currentUser.role)) {
    const btn = document.getElementById("btnNewOrder");
    if (btn) {
      btn.style.display = "inline-flex";
      btn.addEventListener("click", () => openModal("modalNew"));
    }
  }

  const form = document.getElementById("formNewOrder");
  if (form) form.addEventListener("submit", createOrder);

  const search = document.getElementById("searchInput");
  if (search) search.addEventListener("input", debounce(loadKanban, 350));

  loadKanban();

  applyKanbanLayout(localStorage.getItem("kanbanLayout") || "vertical");

  if (typeof connectWS === "function") {
    connectWS((msg) => {
      if (msg.type === "order_updated" || msg.type === "order_created") {
        loadKanban();
      }
    });
  }
});

function emptyBoardData() {
  return {
    fechamento: [],
    aguardando_inicio: [],
    criacao: [],
    prod_ana: [],
    prod_fellipe: [],
    prod_atendimento: [],
    prod_retirada: [],
    embalagem: [],
    pronto: [],
  };
}

async function loadKanban() {
  try {
    const q = (document.getElementById("searchInput")?.value || "").trim();
    let data;

    if (q) {
      const orders = await api(`/api/orders/?q=${encodeURIComponent(q)}`);
      data = emptyBoardData();
      orders.forEach((o) => {
        if (data[o.status]) data[o.status].push(o);
      });
    } else {
      data = await api("/api/orders/kanban");
    }

    renderKanban(data);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderKanban(data) {
  const board = document.getElementById("kanbanBoard");
  if (!board) {
    console.error("kanbanBoard não existe no HTML");
    return;
  }

  board.innerHTML = "";

  if (typeof COLUMNS === "undefined" || !COLUMNS.length) {
    console.error("COLUMNS não definido");
    return;
  }

  data = data || {};

  for (let i = 0; i < COLUMNS.length; i++) {
    const col = COLUMNS[i];
    const orders = Array.isArray(data[col.key]) ? data[col.key] : [];

    const column = document.createElement("div");
    column.className = "column";
    column.dataset.status = col.key;

    const header = document.createElement("div");
    header.className = "column-header";
    header.innerHTML =
      "<span>" +
      col.title +
      '</span><span class="count">' +
      orders.length +
      "</span>";
    column.appendChild(header);

    const body = document.createElement("div");
    body.className = "column-body";
    body.id = "col-" + col.key;

    // --- Drag & drop (obrigatório para não aparecer o bloqueio) ---
    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      body.style.background = "#cbd5e1";
    });

    body.addEventListener("dragleave", (e) => {
      if (!body.contains(e.relatedTarget)) {
        body.style.background = "";
      }
    });

    body.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      body.style.background = "";

      try {
        const raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;

        const payload = JSON.parse(raw);
        const targetStatus = col.key;
        if (payload.from === targetStatus) return;

        const allowed = getPossibleMoves(payload.from) || [];
        if (
          currentUser.role !== "admin" &&
          !allowed.includes(targetStatus)
        ) {
          showToast(
            "Você não tem permissão para mover para esta coluna",
            "error"
          );
          return;
        }

        await moveOrder(payload.id, targetStatus);
      } catch (err) {
        showToast(err.message || "Erro ao mover pedido", "error");
      }
    });

    // --- Cards ---
    if (orders.length === 0) {
      body.innerHTML =
        '<div class="empty-state" style="padding:1rem;font-size:12px">Nenhum item</div>';
    } else {
      for (let j = 0; j < orders.length; j++) {
        const order = orders[j];
        try {
          if (typeof createCard === "function") {
            body.appendChild(createCard(order, col.key));
          } else {
            const card = document.createElement("div");
            card.className = "card";
            card.innerHTML =
              '<div class="numero">#' +
              (order.numero_pedido || "") +
              "</div>" +
              '<div class="cliente">' +
              (order.nome_cliente || "") +
              "</div>";
            body.appendChild(card);
          }
        } catch (err) {
          console.error("Erro card", err);
          const card = document.createElement("div");
          card.className = "card";
          card.textContent = "#" + (order.numero_pedido || "?");
          body.appendChild(card);
        }
      }
    }

    column.appendChild(body);
    board.appendChild(column);
  }

  // Restaura vertical/horizontal (não force vertical)
  if (typeof applyKanbanLayout === "function") {
    applyKanbanLayout(localStorage.getItem("kanbanLayout") || "vertical");
  }

  console.log("RENDER OK — colunas:", board.children.length);
}

function getPossibleMoves(currentStatus) {
  if (currentUser.role === "admin") {
    return COLUMNS.map((c) => c.key).filter((k) => k !== currentStatus);
  }
  const map = TRANSITIONS[currentUser.role] || {};
  return map[currentStatus] || [];
}

function createCard(order, currentStatus) {
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = true;
  card.dataset.id = order.id;
  card.dataset.status = currentStatus;

  if (order.aging_color) {
    card.classList.add(`aging-${order.aging_color}`);
  }

  const p = prazoInfo(order.prazo);

  // Destinos permitidos
  let destinations = getPossibleMoves(currentStatus) || [];
  if (currentUser.role === "admin") {
    destinations = COLUMNS.map((c) => c.key).filter((k) => k !== currentStatus);
  }

  let moveControl = "";
  if (destinations.length > 0) {
    const options = destinations
      .map((k) => {
        const title =
          (COLUMNS.find((c) => c.key === k) || {}).title ||
          (STATUS_LABEL && STATUS_LABEL[k]) ||
          k;
        return `<option value="${k}">${title}</option>`;
      })
      .join("");

    moveControl = `
      <select class="move-select" onchange="onMoveSelect(this, ${order.id})">
        <option value="">Mover para…</option>
        ${options}
      </select>
    `;
  }

  let extraActions = "";
  if (currentUser.role === "admin") {
    extraActions += `
      <button type="button" class="btn btn-sm btn-danger"
        onclick="deleteOrder(${order.id}, '${escapeHtml(String(order.numero_pedido)).replace(/'/g, "\\'")}')">
        Excluir
      </button>
    `;
  }

  card.innerHTML = `
    <div class="numero">#${escapeHtml(order.numero_pedido)}</div>
    <div class="cliente">${escapeHtml(order.nome_cliente)}</div>
    <div class="desc">${escapeHtml(order.descricao)}</div>
    <div class="prazo-badge ${p.cls}" title="${p.label}">
      <strong>Prazo:</strong> ${p.text}
      <span class="prazo-tag">${p.label}</span>
    </div>
    <div class="card-actions">
      ${moveControl}
      ${extraActions}
    </div>
    <button type="button" class="btn-link"
      onclick="showLogs(${order.id}, '${escapeHtml(String(order.numero_pedido)).replace(/'/g, "\\'")}')"
      style="margin-top:0.4rem">
      Ver histórico
    </button>
  `;

card.addEventListener("dragstart", (e) => {
  e.dataTransfer.setData(
    "text/plain",
    JSON.stringify({ id: order.id, from: currentStatus })
  );
  e.dataTransfer.effectAllowed = "move";
  card.style.opacity = "0.5";
  card.classList.add("is-dragging");
});

card.addEventListener("dragend", () => {
  card.style.opacity = "1";
  card.classList.remove("is-dragging");
  document.querySelectorAll(".column-body").forEach((b) => {
    b.style.background = "";
  });
});

  return card;
}

async function onMoveSelect(selectEl, orderId) {
  const newStatus = selectEl.value;
  if (!newStatus) return;

  const title =
    (COLUMNS.find((c) => c.key === newStatus) || {}).title ||
    (STATUS_LABEL && STATUS_LABEL[newStatus]) ||
    newStatus;

  if (!confirm(`Mover esta OS para "${title}"?`)) {
    selectEl.value = "";
    return;
  }

  try {
    await moveOrder(orderId, newStatus);
  } catch (err) {
    showToast(err.message || "Erro ao mover", "error");
    selectEl.value = "";
  }
}

async function moveOrder(orderId, newStatus) {
  try {
    await api(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ new_status: newStatus }),
    });
    showToast("Status atualizado!");
    loadKanban();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function createOrder(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  // datetime-local → "YYYY-MM-DDTHH:mm:00" (Brasília, sem UTC)
  if (data.prazo) {
    data.prazo = data.prazo.length === 16 ? data.prazo + ":00" : data.prazo;
  }

  try {
    await api("/api/orders/", {
      method: "POST",
      body: JSON.stringify(data),
    });
    showToast("OS criada com sucesso!");
    closeModal("modalNew");
    form.reset();
    loadKanban();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== Histórico de movimentações =====
async function showLogs(orderId, numeroPedido) {
  const title = document.getElementById("logsTitle");
  const content = document.getElementById("logsContent");
  if (!title || !content) {
    showToast("Modal de histórico não encontrado", "error");
    return;
  }

  title.textContent = `Histórico – OS #${numeroPedido}`;
  content.innerHTML = "Carregando...";
  openModal("modalLogs");

  try {
    const logs = await api(`/api/orders/${orderId}/logs`);
    renderLogs(logs);
  } catch (err) {
    content.innerHTML = `<p style="color:#b91c1c">${err.message}</p>`;
  }
}

function renderLogs(logs) {
  const container = document.getElementById("logsContent");

  if (!logs || logs.length === 0) {
    container.innerHTML = "<p class='empty-state'>Nenhuma movimentação registrada.</p>";
    return;
  }

  const statusLabel = {
    "-": "Abertura",
    fechamento: "Fechamento",
    aguardando_inicio: "Aguardando Início",
    criacao: "Criação",
    prod_ana: "Prod. Papelaria",
    prod_fellipe: "Prod. Comunicação visual",
    prod_atendimento: "Prod. Atendimento",
    prod_retirada: "Prod. Retirada",
    embalagem: "Embalagem",
    pronto: "Pronto p/ Retirada",
    entregue: "Entregue",
  };

  let html = '<ul class="timeline">';
  logs.forEach((log) => {
    const from = statusLabel[log.from_status] || log.from_status;
    const to = statusLabel[log.to_status] || log.to_status;
    const time = new Date(log.timestamp).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    html += `
      <li class="timeline-item">
        <div class="time">${time}</div>
        <div class="action">${from} → ${to}</div>
        <div class="user">por ${escapeHtml(log.user_name || "—")}</div>
      </li>
    `;
  });
  html += "</ul>";
  container.innerHTML = html;
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function deleteOrder(orderId, numero) {
  if (!confirm(`Excluir a OS #${numero}? Ela sairá do fluxo e ficará no histórico de excluídos.`)) return;
  try {
    await api(`/api/orders/${orderId}`, { method: "DELETE" });
    showToast("OS excluída!");
    loadKanban();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function prazoInfo(prazoIso) {
  if (!prazoIso) {
    return { label: "Sem prazo", cls: "prazo-none", text: "—" };
  }
  try {
    const prazo = new Date(String(prazoIso).replace(" ", "T"));
    if (Number.isNaN(prazo.getTime())) {
      return { label: "Sem prazo", cls: "prazo-none", text: "—" };
    }
    const now = new Date();
    const diffMs = prazo - now;
    const diffD = diffMs / (1000 * 60 * 60 * 24);
    const text = prazo.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (diffMs < 0) return { label: "Vencido", cls: "prazo-vencido", text };
    if (diffD < 1) return { label: "Vence hoje", cls: "prazo-hoje", text };
    if (diffD <= 2) return { label: "Perto", cls: "prazo-perto", text };
    return { label: "No prazo", cls: "prazo-ok", text };
  } catch (e) {
    return { label: "Sem prazo", cls: "prazo-none", text: "—" };
  }
}

function applyKanbanLayout(mode) {
  const board = document.getElementById("kanbanBoard");
  const btn = document.getElementById("btnToggleLayout");
  if (!board) return;

  if (mode === "horizontal") {
    board.classList.add("layout-horizontal");
    if (btn) btn.textContent = "Visualização: Horizontal";
  } else {
    board.classList.remove("layout-horizontal");
    if (btn) btn.textContent = "Visualização: Vertical";
  }
  localStorage.setItem("kanbanLayout", mode);
}

function toggleKanbanLayout() {
  const current = localStorage.getItem("kanbanLayout") || "vertical";
  applyKanbanLayout(current === "vertical" ? "horizontal" : "vertical");
}

// no DOMContentLoaded, depois de montar a página:
applyKanbanLayout(localStorage.getItem("kanbanLayout") || "vertical");



let dragScrollTimer = null;

function stopDragScroll() {
  if (dragScrollTimer) {
    clearInterval(dragScrollTimer);
    dragScrollTimer = null;
  }
}

function startDragScroll() {
  stopDragScroll();
  dragScrollTimer = setInterval(() => {
    // nada: a velocidade é aplicada no dragover da window
  }, 50);
}

// Chamado continuamente enquanto arrasta
function onWindowDragOver(e) {
  const edge = 80; // px da borda
  const speed = 18;
  const y = e.clientY;
  const h = window.innerHeight;

  if (y < edge) {
    window.scrollBy(0, -speed);
  } else if (y > h - edge) {
    window.scrollBy(0, speed);
  }
}

// No DOMContentLoaded (uma vez):
document.addEventListener("dragover", onWindowDragOver);
document.addEventListener("dragend", stopDragScroll);
document.addEventListener("drop", stopDragScroll);


card.addEventListener("dragstart", (e) => {
  e.dataTransfer.setData(
    "text/plain",
    JSON.stringify({ id: order.id, from: currentStatus })
  );
  card.style.opacity = "0.5";
  startDragScroll();
});
card.addEventListener("dragend", () => {
  card.style.opacity = "1";
  stopDragScroll();
});