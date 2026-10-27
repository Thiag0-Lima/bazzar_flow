let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  currentUser = requireAuth();
  if (!currentUser) return;

  document.getElementById("userName").textContent = currentUser.full_name;
  renderNav(currentUser);

  document
    .getElementById("searchQ")
    .addEventListener("input", debounce(loadHistorico, 400));

  loadHistorico();

  if (typeof connectWS === "function") {
    connectWS((msg) => {
      if (msg.type === "order_updated" || msg.type === "order_created") {
        loadHistorico();
      }
    });
  }
});

async function loadHistorico() {
  const q = document.getElementById("searchQ").value.trim();
  const dataInicio = document.getElementById("dataInicio").value;
  const dataFim = document.getElementById("dataFim").value;

  let url = "/api/orders/?status=entregue";
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (dataInicio) url += `&data_inicio=${dataInicio}`;
  if (dataFim) url += `&data_fim=${dataFim}`;

  try {
    const orders = await api(url);
    renderTable(orders);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderTable(orders) {
  const container = document.getElementById("resultado");

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Nenhum pedido encontrado</h3>
        <p>Ajuste os filtros ou aguarde novas entregas.</p>
      </div>`;
    return;
  }

  const isAdmin = currentUser && currentUser.role === "admin";

  let html = `
    <table>
      <thead>
        <tr>
          <th>Nº Pedido</th>
          <th>Cliente</th>
          <th>CPF/CNPJ</th>
          <th>Descrição</th>
          <th>Criado em</th>
          <th>Entregue em</th>
          <th>Retirado por</th>
          <th>Registrado por</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  orders.forEach((o) => {
    let acoes = `
      <button type="button" class="btn btn-outline btn-sm"
        onclick="showLogs(${o.id}, '${escapeHtml(o.numero_pedido)}')">
        Histórico
      </button>
    `;

    if (isAdmin) {
      acoes += `
        <button type="button" class="btn btn-sm btn-warning" style="margin-left:0.35rem"
          onclick="undoDeliver(${o.id}, '${String(o.numero_pedido).replace(/'/g, "\\'")}')">
          Desfazer entrega
        </button>
      `;
    }

    html += `
      <tr>
        <td><strong>#${escapeHtml(o.numero_pedido)}</strong></td>
        <td>${escapeHtml(o.nome_cliente)}</td>
        <td>${escapeHtml(o.cpf_cnpj)}</td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(o.descricao)}">
          ${escapeHtml(o.descricao)}
        </td>
        <td>${formatDate(o.created_at)}</td>
        <td>${formatDate(o.delivered_at)}</td>
        <td>${escapeHtml(o.delivered_to || "—")}</td>
        <td>${escapeHtml(o.delivered_by || "—")}</td>
        <td>${acoes}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function limparFiltros() {
  document.getElementById("searchQ").value = "";
  document.getElementById("dataInicio").value = "";
  document.getElementById("dataFim").value = "";
  loadHistorico();
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
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// ===== Histórico de movimentações =====
async function showLogs(orderId, numeroPedido) {
  document.getElementById("logsTitle").textContent = `Histórico – OS #${numeroPedido}`;
  document.getElementById("logsContent").innerHTML = "Carregando...";
  openModal("modalLogs");

  try {
    const logs = await api(`/api/orders/${orderId}/logs`);
    renderLogs(logs);
  } catch (err) {
    document.getElementById("logsContent").innerHTML =
      `<p style="color:#b91c1c">${err.message}</p>`;
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

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

async function exportExcel() {
  try {
    const q = document.getElementById("searchQ").value.trim();
    const dataInicio = document.getElementById("dataInicio").value;
    const dataFim = document.getElementById("dataFim").value;

    let url = "/api/orders/?status=entregue";
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (dataInicio) url += `&data_inicio=${dataInicio}`;
    if (dataFim) url += `&data_fim=${dataFim}`;

    const orders = await api(url);
    if (!orders || orders.length === 0) {
      showToast("Nenhum registro para exportar", "error");
      return;
    }

    // Cabeçalho CSV
    const headers = [
      "Nº Pedido",
      "Cliente",
      "CPF/CNPJ",
      "Descrição",
      "Criado em",
      "Entregue em",
      "Retirado por",
      "Registrado por"
    ];

    const rows = orders.map(o => [
      o.numero_pedido,
      o.nome_cliente,
      o.cpf_cnpj,
      (o.descricao || "").replace(/"/g, '""'),
      formatDate(o.created_at),
      formatDate(o.delivered_at),
      o.delivered_to || "",
      o.delivered_by || ""
    ]);

    let csv = headers.join(";") + "\n";
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(";") + "\n";
    });

    // BOM para Excel reconhecer UTF-8
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `historico_entregas_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    showToast("Arquivo Excel gerado com sucesso!");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function exportPDF() {
  const resultado = document.getElementById("resultado");
  if (!resultado.querySelector("table")) {
    showToast("Nenhum registro para exportar", "error");
    return;
  }

  // Abre janela de impressão só com a tabela
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Histórico de Entregas – Bazzar Flow</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p { color: #666; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
          th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Histórico de Entregas – Bazzar Flow</h1>
        <p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
        ${resultado.innerHTML.replace(/<button[^>]*>.*?<\/button>/gi, "")}
        <script>window.onload = () => { window.print(); }</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

async function undoDeliver(orderId, numero) {
  if (
    !confirm(
      `Desfazer a entrega da OS #${numero}?\nEla voltará para "Pronto p/ Retirada".`
    )
  ) {
    return;
  }
  try {
    await api(`/api/orders/${orderId}/undo-deliver`, { method: "POST" });
    showToast("Entrega desfeita. OS voltou para Pronto p/ Retirada.");
    loadHistorico();
  } catch (err) {
    showToast(err.message, "error");
  }
}