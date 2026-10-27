let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  currentUser = requireAuth();
  if (!currentUser) return;

  // Só atendente e admin devem acessar o balcão
  if (!["atendente", "admin"].includes(currentUser.role)) {
    alert("Acesso restrito ao setor de balcão.");
    window.location.href = "/kanban.html";
    return;
  }

  document.getElementById("userName").textContent = currentUser.full_name;
  renderNav(currentUser);

  document.getElementById("formDeliver").addEventListener("submit", confirmDeliver);
  document.getElementById("searchInput").addEventListener("input", debounce(loadBalcao, 350));
  

  loadBalcao();
  connectWS((msg) => {
    if (msg.type === "order_updated" || msg.type === "order_created") {
      loadBalcao();
    }
  });
});

async function loadBalcao() {
  try {
    const q = document.getElementById("searchInput").value.trim();
    let url = "/api/orders/?status=pronto";
    if (q) url += `&q=${encodeURIComponent(q)}`;

    const orders = await api(url);
    renderBalcao(orders);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderBalcao(orders) {
  const container = document.getElementById("balcaoList");
  container.innerHTML = "";

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <h3>Nenhum material pronto para retirada</h3>
        <p>Quando a produção finalizar, os itens aparecerão aqui.</p>
      </div>`;
    return;
  }

  // Ordena: vermelho primeiro, depois amarelo, verde, cinza
  const priority = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3 };
  orders.sort((a, b) => (priority[a.aging_color] ?? 9) - (priority[b.aging_color] ?? 9));

  orders.forEach((order) => {
    const card = document.createElement("div");
    card.className = `balcao-card ${order.aging_color ? "aging-" + order.aging_color : ""}`;

    const agingBadge = order.aging_days != null
      ? `<span class="badge-aging badge-${order.aging_color}">${order.aging_days} dia(s) na prateleira</span>`
      : `<span class="badge-aging badge-cinza">Aguardando notificação</span>`;

    const notifiedInfo = order.notified_at
      ? `<div class="meta">Notificado em: <strong>${formatDate(order.notified_at)}</strong></div>`
      : `<div class="meta" style="color:#b45309">Cliente ainda não notificado</div>`;

    card.innerHTML = `
    <h3>#${escapeHtml(order.numero_pedido)}</h3>
    <div class="meta"><strong>${escapeHtml(order.nome_cliente)}</strong></div>
    <div class="meta">CPF/CNPJ: ${escapeHtml(order.cpf_cnpj)}</div>
    <div class="meta">${escapeHtml(order.descricao)}</div>
    ${notifiedInfo}
    ${agingBadge}
    <div class="actions-row">
        ${!order.notified_at
        ? `<button class="btn btn-warning btn-sm" onclick="notifyClient(${order.id})">Notificar Cliente</button>`
        : ""}
        <button class="btn btn-success btn-sm" onclick="openDeliverModal(${order.id})">Registrar Retirada</button>
        <button class="btn btn-outline btn-sm" onclick="showLogs(${order.id}, '${escapeHtml(order.numero_pedido)}')">Histórico</button>
    </div>
    `;
    container.appendChild(card);
  });
}

async function notifyClient(orderId) {
  if (!confirm("Confirma o registro de notificação ao cliente?")) return;
  try {
    await api(`/api/orders/${orderId}/notify`, { method: "POST" });
    showToast("Cliente notificado! Contagem de Aging iniciada.");
    loadBalcao();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openDeliverModal(orderId) {
  document.getElementById("deliverOrderId").value = orderId;
  document.getElementById("deliveredTo").value = "";
  fillDeliverNow();
  openModal("modalDeliver");
}

async function confirmDeliver(e) {
  e.preventDefault();
  const orderId = document.getElementById("deliverOrderId").value;
  const deliveredTo = document.getElementById("deliveredTo").value.trim();
  let deliveredAt = document.getElementById("deliveredAt").value; // "YYYY-MM-DDTHH:mm"

  if (!deliveredTo) {
    showToast("Informe quem retirou o material.", "error");
    return;
  }

  // Envia horário de Brasília como texto local (sem converter para UTC)
  const payload = {
    delivered_to: deliveredTo,
    delivered_at: deliveredAt ? `${deliveredAt}:00` : null,
  };

  try {
    await api(`/api/orders/${orderId}/deliver`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("OS finalizada com sucesso!");
    closeModal("modalDeliver");
    loadBalcao();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

async function showLogs(orderId, numeroPedido) {
  document.getElementById("logsTitle").textContent = `Histórico – OS #${numeroPedido}`;
  document.getElementById("logsContent").innerHTML = "Carregando...";
  openModal("modalLogs");

  try {
    const logs = await api(`/api/orders/${orderId}/logs`);
    renderLogs(logs);
  } catch (err) {
    document.getElementById("logsContent").innerHTML = `<p style="color:#b91c1c">${err.message}</p>`;
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
  logs.forEach(log => {
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

function fillDeliverNow() {
  const el = document.getElementById("deliveredAt");
  if (!el) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  el.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}