let currentUser = null;
let canManage = false;
let itemsCache = [];

document.addEventListener("DOMContentLoaded", () => {
  currentUser = requireAuth();
  if (!currentUser) return;

  document.getElementById("userName").textContent = currentUser.full_name;
  renderNav(currentUser);

  canManage = ["admin", "estoque"].includes(currentUser.role);
  if (canManage) {
    const tabCad = document.getElementById("tabCad");
    const tabMov = document.getElementById("tabMov");
    if (tabCad) tabCad.style.display = "inline-block";
    if (tabMov) tabMov.style.display = "inline-block";
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById("panel-" + btn.dataset.tab);
      if (panel) panel.classList.add("active");

      if (btn.dataset.tab === "itens") loadItems();
      if (btn.dataset.tab === "solicitacoes") loadRequests();
      if (btn.dataset.tab === "movimentos") loadMovements();
      if (btn.dataset.tab === "cadastro") {
        loadCategories();
        fillItemSelects();
      }
      if (btn.dataset.tab === "solicitar") fillItemSelects();
    });
  });

  const searchItem = document.getElementById("searchItem");
  if (searchItem) {
    searchItem.addEventListener("input", debounce(loadItems, 300));
  }

  const filterCat = document.getElementById("filterCategoria");
  if (filterCat) {
    filterCat.addEventListener("change", loadItems);
  }

  const formRequest = document.getElementById("formRequest");
  if (formRequest) formRequest.addEventListener("submit", submitRequest);

  const formCat = document.getElementById("formCat");
  if (formCat) formCat.addEventListener("submit", createCategory);

  const formItem = document.getElementById("formItem");
  if (formItem) formItem.addEventListener("submit", createItem);

  const formAdjust = document.getElementById("formAdjust");
  if (formAdjust) formAdjust.addEventListener("submit", adjustStock);

  const formEditItem = document.getElementById("formEditItem");
  if (formEditItem) formEditItem.addEventListener("submit", saveEditItem);

  loadFilterCategories();
  loadItems();
});

// ===== FILTROS =====
async function loadFilterCategories() {
  try {
    const cats = await api("/api/stock/categories");
    const sel = document.getElementById("filterCategoria");
    if (!sel) return;
    sel.innerHTML =
      `<option value="">Todas</option>` +
      cats
        .filter((c) => c.ativo)
        .map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`)
        .join("");
  } catch (e) {
    showToast(e.message, "error");
  }
}

function limparFiltrosItens() {
  const search = document.getElementById("searchItem");
  const filter = document.getElementById("filterCategoria");
  if (search) search.value = "";
  if (filter) filter.value = "";
  loadItems();
}

// ===== ITENS (lista + agrupamento) =====
async function loadItems() {
  const q = (document.getElementById("searchItem")?.value || "").trim();
  const catId = document.getElementById("filterCategoria")?.value || "";

  const params = [];
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  if (catId) params.push(`categoria_id=${catId}`);
  const url = "/api/stock/items" + (params.length ? "?" + params.join("&") : "");

  try {
    const items = await api(url);
    itemsCache = items;

    if (!items.length) {
      document.getElementById("itemsTable").innerHTML =
        `<p class="empty-state">Nenhum item encontrado</p>`;
      return;
    }

    const agrupar = !catId;
    let html = "";

    if (agrupar) {
      const grupos = {};
      items.forEach((i) => {
        const key = i.categoria_nome || "Sem categoria";
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(i);
      });

      Object.keys(grupos)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .forEach((catNome) => {
          html += `
            <h3 style="margin:1.25rem 0 .5rem;font-size:1rem;color:#1e40af;border-bottom:2px solid #e2e8f0;padding-bottom:.35rem">
              ${esc(catNome)}
              <small style="color:#64748b;font-weight:500">(${grupos[catNome].length})</small>
            </h3>
            ${renderItemsTable(grupos[catNome])}
          `;
        });
    } else {
      html = renderItemsTable(items);
    }

    document.getElementById("itemsTable").innerHTML = html;
  } catch (e) {
    showToast(e.message, "error");
  }
}

function renderItemsTable(items) {
  let html = `<table><thead><tr>
    <th>Nome</th>
    <th>Un</th>
    <th>Qtd</th>
    <th>Mín</th>
    <th>Status</th>
    ${canManage ? "<th>Ações</th>" : ""}
  </tr></thead><tbody>`;

  items.forEach((i) => {
    const st = statusClass(i.status);
    let actions = "";
    if (canManage) {
      actions = `
        <td>
          <button class="btn btn-sm btn-outline" onclick="openEditItem(${i.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteItem(${i.id}, '${esc(i.nome).replace(/'/g, "\\'")}')">Excluir</button>
        </td>`;
    }

    html += `<tr class="${st.row}">
      <td>
        <strong>${esc(i.nome)}</strong>
        ${i.sku ? ` <small>(${esc(i.sku)})</small>` : ""}
      </td>
      <td>${esc(i.unidade)}</td>
      <td><strong>${i.quantidade}</strong></td>
      <td>${i.minimo}</td>
      <td><span class="${st.badge}">${statusLabel(i.status)}</span></td>
      ${actions}
    </tr>`;
  });

  html += `</tbody></table>`;
  return html;
}

// ===== EDITAR / EXCLUIR ITEM =====
async function openEditItem(id) {
  const item = itemsCache.find((x) => x.id === id);
  if (!item) {
    showToast("Item não encontrado", "error");
    return;
  }

  try {
    const cats = await api("/api/stock/categories");
    document.getElementById("editItemCat").innerHTML = cats
      .filter((c) => c.ativo)
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === item.categoria_id ? "selected" : ""}>${esc(c.nome)}</option>`
      )
      .join("");

    document.getElementById("editItemId").value = item.id;
    document.getElementById("editItemNome").value = item.nome;
    document.getElementById("editItemSku").value = item.sku || "";
    document.getElementById("editItemUn").value = item.unidade;
    document.getElementById("editItemMin").value = item.minimo;
    document.getElementById("editItemObs").value = item.observacao || "";
    openModal("modalEditItem");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function saveEditItem(e) {
  e.preventDefault();
  const id = document.getElementById("editItemId").value;
  try {
    await api(`/api/stock/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        categoria_id: Number(document.getElementById("editItemCat").value),
        nome: document.getElementById("editItemNome").value.trim(),
        sku: document.getElementById("editItemSku").value.trim() || null,
        unidade: document.getElementById("editItemUn").value.trim(),
        minimo: Number(document.getElementById("editItemMin").value) || 0,
        observacao: document.getElementById("editItemObs").value.trim() || null,
      }),
    });
    showToast("Item atualizado");
    closeModal("modalEditItem");
    loadItems();
    fillItemSelects();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteItem(id, nome) {
  if (!confirm(`Excluir o item "${nome}"? Ele sairá da lista (o histórico permanece).`)) return;
  try {
    await api(`/api/stock/items/${id}`, { method: "DELETE" });
    showToast("Item excluído");
    loadItems();
    fillItemSelects();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ===== SELECTS DE ITENS =====
async function fillItemSelects() {
  try {
    const items = await api("/api/stock/items");
    const opts = items
      .map(
        (i) =>
          `<option value="${i.id}">${esc(i.nome)} (${i.quantidade} ${esc(i.unidade)})</option>`
      )
      .join("");
    ["reqItem", "adjItem"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts || `<option value="">Nenhum item</option>`;
    });
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ===== SOLICITAÇÕES =====
async function submitRequest(e) {
  e.preventDefault();
  try {
    await api("/api/stock/requests", {
      method: "POST",
      body: JSON.stringify({
        item_id: Number(document.getElementById("reqItem").value),
        quantidade: Number(document.getElementById("reqQty").value),
        motivo: document.getElementById("reqMotivo").value.trim(),
      }),
    });
    showToast("Solicitação enviada!");
    e.target.reset();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function loadRequests() {
  try {
    const rows = await api("/api/stock/requests");
    let html = `<table><thead><tr>
      <th>Data</th><th>Item</th><th>Qtd</th><th>Solicitante</th><th>Motivo</th><th>Status</th><th>Ações</th>
    </tr></thead><tbody>`;

    if (!rows.length) {
      html += `<tr><td colspan="7">Nenhuma solicitação</td></tr>`;
    }

    rows.forEach((r) => {
      let actions = "";
      if (r.status === "pendente" && canManage) {
        actions += `<button class="btn btn-sm btn-success" onclick="approveReq(${r.id})">Aprovar</button> `;
        actions += `<button class="btn btn-sm btn-danger" onclick="rejectReq(${r.id})">Negar</button> `;
      }
      if (
        r.status === "pendente" &&
        (r.solicitado_por === currentUser.id || canManage)
      ) {
        actions += `<button class="btn btn-sm btn-outline" onclick="cancelReq(${r.id})">Cancelar</button>`;
      }

      html += `<tr>
        <td>${fmt(r.created_at)}</td>
        <td>${esc(r.item_nome)}</td>
        <td>${r.quantidade}</td>
        <td>${esc(r.solicitante_nome)}</td>
        <td>${esc(r.motivo)}</td>
        <td>${r.status}</td>
        <td>${actions || "—"}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    document.getElementById("requestsTable").innerHTML = html;
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function approveReq(id) {
  if (!confirm("Aprovar e dar baixa no estoque?")) return;
  try {
    await api(`/api/stock/requests/${id}/approve`, {
      method: "POST",
      body: "{}",
    });
    showToast("Aprovada!");
    loadRequests();
    loadItems();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function rejectReq(id) {
  const motivo = prompt("Motivo da recusa (opcional):") || "";
  try {
    await api(`/api/stock/requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ motivo }),
    });
    showToast("Negada");
    loadRequests();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function cancelReq(id) {
  if (!confirm("Cancelar solicitação?")) return;
  try {
    await api(`/api/stock/requests/${id}/cancel`, { method: "POST" });
    showToast("Cancelada");
    loadRequests();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ===== CATEGORIAS =====
async function loadCategories() {
  try {
    const cats = await api("/api/stock/categories");
    const list = document.getElementById("catList");
    if (!list) return;

    list.innerHTML =
      cats
        .map((c) => {
          const status = c.ativo
            ? ""
            : ' <em style="color:#b91c1c">(inativa)</em>';
          let btns = "";
          if (canManage) {
            if (c.ativo) {
              btns = `
                <button class="btn btn-sm btn-outline" onclick="editCategory(${c.id}, '${esc(c.nome).replace(/'/g, "\\'")}')">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCategory(${c.id}, '${esc(c.nome).replace(/'/g, "\\'")}')">Excluir</button>
              `;
            } else {
              btns = `
                <button class="btn btn-sm btn-success" onclick="reactivateCategory(${c.id})">Reativar</button>
              `;
            }
          }
          return `<div style="display:flex;gap:.5rem;align-items:center;margin:.35rem 0;flex-wrap:wrap">
            <span>• ${esc(c.nome)}${status}</span> ${btns}
          </div>`;
        })
        .join("") || "Nenhuma";

    // select de novo item: só ativas
    const opts = cats
      .filter((c) => c.ativo)
      .map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`)
      .join("");
    const itemCat = document.getElementById("itemCat");
    if (itemCat) itemCat.innerHTML = opts;
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function reactivateCategory(id) {
  try {
    await api(`/api/stock/categories/${id}/reactivate`, { method: "POST" });
    // se não tiver a rota reactivate, use:
    // await api(`/api/stock/categories/${id}`, { method: "PATCH", body: JSON.stringify({ ativo: true }) });
    showToast("Categoria reativada");
    loadCategories();
    loadFilterCategories();
    loadItems();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function createCategory(e) {
  e.preventDefault();
  try {
    await api("/api/stock/categories", {
      method: "POST",
      body: JSON.stringify({ nome: document.getElementById("catNome").value }),
    });
    showToast("Categoria criada");
    document.getElementById("catNome").value = "";
    loadCategories();
    loadFilterCategories();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function editCategory(id, nomeAtual) {
  const nome = prompt("Novo nome da categoria:", nomeAtual);
  if (!nome || !nome.trim()) return;
  try {
    await api(`/api/stock/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ nome: nome.trim() }),
    });
    showToast("Categoria atualizada");
    loadCategories();
    loadFilterCategories();
    loadItems();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteCategory(id, nome) {
  if (!confirm(`Excluir/desativar a categoria "${nome}"?`)) return;
  try {
    const res = await api(`/api/stock/categories/${id}`, { method: "DELETE" });
    showToast(res.message || "Categoria removida");
    loadCategories();
    loadFilterCategories();
    loadItems();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ===== CADASTRO DE ITEM / AJUSTE =====
async function createItem(e) {
  e.preventDefault();
  try {
    await api("/api/stock/items", {
      method: "POST",
      body: JSON.stringify({
        categoria_id: Number(document.getElementById("itemCat").value),
        nome: document.getElementById("itemNome").value.trim(),
        sku: document.getElementById("itemSku").value.trim() || null,
        unidade: document.getElementById("itemUn").value.trim() || "un",
        quantidade: Number(document.getElementById("itemQtd").value) || 0,
        minimo: Number(document.getElementById("itemMin").value) || 0,
      }),
    });
    showToast("Item cadastrado");
    e.target.reset();
    document.getElementById("itemUn").value = "un";
    loadItems();
    fillItemSelects();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function adjustStock(e) {
  e.preventDefault();
  const itemId = document.getElementById("adjItem").value;
  try {
    await api(`/api/stock/items/${itemId}/adjust`, {
      method: "POST",
      body: JSON.stringify({
        tipo: document.getElementById("adjTipo").value,
        quantidade: Number(document.getElementById("adjQtd").value),
        motivo: document.getElementById("adjMotivo").value.trim(),
      }),
    });
    showToast("Estoque ajustado");
    e.target.reset();
    loadItems();
    fillItemSelects();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function loadMovements() {
  try {
    const rows = await api("/api/stock/movements");
    let html = `<table><thead><tr>
      <th>Data</th><th>Item</th><th>Tipo</th><th>Antes</th><th>Depois</th><th>Delta</th><th>Usuário</th><th>Motivo</th>
    </tr></thead><tbody>`;
    rows.forEach((m) => {
      html += `<tr>
        <td>${fmt(m.created_at)}</td>
        <td>${esc(m.item_nome)}</td>
        <td>${m.tipo}</td>
        <td>${m.qtd_anterior}</td>
        <td>${m.qtd_nova}</td>
        <td>${m.qtd_delta}</td>
        <td>${esc(m.user_name)}</td>
        <td>${esc(m.motivo)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    document.getElementById("movementsTable").innerHTML = html;
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ===== HELPERS =====
function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t || "";
  return d.innerHTML;
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function statusLabel(status) {
  const map = {
    zerado: "Zerado",
    urgente: "Urgente",
    baixo: "Baixo",
    atencao: "Atenção",
    ok: "Ok",
  };
  return map[status] || status || "Ok";
}

function statusClass(status) {
  const s = status || "ok";
  return {
    row: `stock-${s}`,
    badge: `badge-${s}`,
  };
}

// ===== EXPORTAÇÃO =====
async function exportEstoqueExcel() {
  try {
    const items = await api("/api/stock/items");
    if (!items.length) {
      showToast("Nenhum item para exportar", "error");
      return;
    }

    const headers = [
      "Categoria",
      "Nome",
      "SKU",
      "Unidade",
      "Quantidade",
      "Mínimo",
      "Status",
      "Observação",
    ];

    const rows = items.map((i) => [
      i.categoria_nome || "",
      i.nome || "",
      i.sku || "",
      i.unidade || "",
      i.quantidade,
      i.minimo,
      statusLabel(i.status),
      (i.observacao || "").replace(/"/g, '""'),
    ]);

    // Agrupa visualmente no CSV ordenando por categoria + nome
    rows.sort((a, b) => {
      const c = String(a[0]).localeCompare(String(b[0]), "pt-BR");
      return c !== 0 ? c : String(a[1]).localeCompare(String(b[1]), "pt-BR");
    });

    let csv = headers.join(";") + "\n";
    rows.forEach((row) => {
      csv += row.map((cell) => `"${cell}"`).join(";") + "\n";
    });

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `estoque_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Excel gerado com sucesso!");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function exportEstoquePDF() {
  try {
    const items = await api("/api/stock/items");
    if (!items.length) {
      showToast("Nenhum item para exportar", "error");
      return;
    }

    // Agrupa por categoria
    const grupos = {};
    items.forEach((i) => {
      const key = i.categoria_nome || "Sem categoria";
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(i);
    });

    let bodyHtml = "";
    Object.keys(grupos)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach((cat) => {
        bodyHtml += `<h2 style="margin:18px 0 8px;font-size:14px;color:#1e40af">${esc(cat)}</h2>`;
        bodyHtml += `<table>
          <thead>
            <tr>
              <th>Nome</th><th>SKU</th><th>Un</th><th>Qtd</th><th>Mín</th><th>Status</th>
            </tr>
          </thead>
          <tbody>`;
        grupos[cat].forEach((i) => {
          bodyHtml += `<tr>
            <td>${esc(i.nome)}</td>
            <td>${esc(i.sku || "—")}</td>
            <td>${esc(i.unidade)}</td>
            <td>${i.quantidade}</td>
            <td>${i.minimo}</td>
            <td>${statusLabel(i.status)}</td>
          </tr>`;
        });
        bodyHtml += `</tbody></table>`;
      });

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Estoque – Bazzar Flow</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; color: #0f172a; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .meta { color: #64748b; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Controle de Estoque – Bazzar Flow</h1>
          <p class="meta">Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          ${bodyHtml}
          <script>window.onload = () => window.print();<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  } catch (err) {
    showToast(err.message, "error");
  }
}