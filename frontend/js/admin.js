document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;

  if (user.role !== "admin") {
    alert("Acesso restrito a administradores.");
    window.location.href = "/kanban.html";
    return;
  }

  document.getElementById("userName").textContent = user.full_name;
  renderNav(user);

  document.getElementById("formNewUser").addEventListener("submit", createUser);
  document.getElementById("formResetPassword").addEventListener("submit", resetPassword);

  loadUsers();
  loadDeleted();
});

async function loadUsers() {
  try {
    const users = await api("/api/auth/users");
    renderUsers(users);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderUsers(users) {
  const container = document.getElementById("usersTable");
  const me = getUser();

  let html = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Nome</th>
          <th>Usuário</th>
          <th>Perfil</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  users.forEach((u) => {
    const statusClass = u.is_active ? "badge-active" : "badge-inactive";
    const statusText = u.is_active ? "Ativo" : "Inativo";

    html += `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.full_name)}</td>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>
          <select onchange="changeRole(${u.id}, this.value)" style="padding:0.35rem 0.5rem;border-radius:6px;border:1px solid #cbd5e1">
            <option value="criacao" ${u.role === "criacao" ? "selected" : ""}>Criação</option>
            <option value="operador" ${u.role === "operador" ? "selected" : ""}>Operador</option>
            <option value="atendente" ${u.role === "atendente" ? "selected" : ""}>Atendente</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="estoque" ${u.role === "estoque" ? "selected" : ""}>Estoque</option>
          </select>
        </td>
        <td><span class="badge-role ${statusClass}">${statusText}</span></td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" onclick="toggleUser(${u.id})">
            ${u.is_active ? "Desativar" : "Ativar"}
          </button>
          <button class="btn btn-sm btn-warning" onclick="openResetModal(${u.id}, '${escapeHtml(u.username)}')">
            Alterar senha
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

async function changeRole(userId, newRole) {
  if (!confirm(`Alterar o perfil deste usuário para "${newRole}"?`)) {
    loadUsers(); // reverte o select visual
    return;
  }
  try {
    await api(`/api/auth/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    showToast("Perfil atualizado!");
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
    loadUsers();
  }
}

async function loadDeleted() {
  try {
    const orders = await api("/api/orders/deleted/list");
    renderDeleted(orders);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderDeleted(orders) {
  const container = document.getElementById("deletedTable");
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `<p class="empty-state">Nenhum pedido excluído.</p>`;
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Nº Pedido</th>
          <th>Cliente</th>
          <th>Status (antes)</th>
          <th>Excluído em</th>
          <th>Excluído por</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
  `;

  orders.forEach((o) => {
    html += `
      <tr>
        <td><strong>#${escapeHtml(o.numero_pedido)}</strong></td>
        <td>${escapeHtml(o.nome_cliente)}</td>
        <td>${escapeHtml(o.status)}</td>
        <td>${formatDate(o.deleted_at)}</td>
        <td>${escapeHtml(o.deleted_by_name || "—")}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="restoreOrder(${o.id})">Restaurar</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

async function restoreOrder(orderId) {
  if (!confirm("Restaurar esta OS? Ela voltará ao Kanban no status em que estava.")) return;
  try {
    await api(`/api/orders/${orderId}/restore`, { method: "POST" });
    showToast("OS restaurada!");
    loadDeleted();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function formatDate(iso) {
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

async function createUser(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    showToast("Usuário criado com sucesso!");
    form.reset();
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleUser(userId) {
  if (!confirm("Confirma alterar o status deste usuário?")) return;
  try {
    await api(`/api/auth/users/${userId}/toggle`, { method: "PATCH" });
    showToast("Status atualizado!");
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openResetModal(userId, username) {
  document.getElementById("resetUserId").value = userId;
  document.getElementById("resetUsername").textContent = username;
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  openModal("modalResetPassword");
}

async function resetPassword(e) {
  e.preventDefault();

  const userId = document.getElementById("resetUserId").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword.length < 3) {
    showToast("A senha deve ter pelo menos 3 caracteres", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("As senhas não coincidem", "error");
    return;
  }

  try {
    await api(`/api/auth/users/${userId}/password`, {
      method: "PATCH",
      body: JSON.stringify({ new_password: newPassword }),
    });
    showToast("Senha alterada com sucesso!");
    closeModal("modalResetPassword");
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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}