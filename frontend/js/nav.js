/* function renderNav(user) {
  const nav = document.getElementById("navLinks");
  if (!nav) return;

  let links = `
    <a href="/kanban.html">Kanban</a>
    <a href="/balcao.html">Balcão</a>
    <a href="/historico.html">Histórico</a>
  `;

  if (user.role === "admin") {
    links += `<a href="/admin.html">Admin</a>`;
  }

  links += `<button class="btn btn-outline btn-sm" onclick="logout()">Sair</button>`;
  nav.innerHTML = links;

  // marca o link ativo
  const path = window.location.pathname;
  nav.querySelectorAll("a").forEach(a => {
    if (a.getAttribute("href") === path) {
      a.classList.add("active");
    }
  });
} */

function renderNav(user) {
  const nav = document.getElementById("navLinks");
  if (!nav) return;

  let links = `
    <a href="/kanban.html">Kanban</a>
    <a href="/balcao.html">Balcão</a>
    <a href="/historico.html">Histórico</a>
    <a href="/estoque.html">Estoque</a>
  `;

  if (user && user.role === "admin") {
    links += `<a href="/admin.html">Admin</a>`;
  }

  links += `<button class="btn btn-outline btn-sm" onclick="logout()">Sair</button>`;
  nav.innerHTML = links;

  const path = window.location.pathname;
  nav.querySelectorAll("a").forEach((a) => {
    if (a.getAttribute("href") === path) {
      a.classList.add("active");
    }
  });

  startHeaderClock();
}

function startHeaderClock() {
  const el = document.getElementById("headerClock");
  if (!el) return;

  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  tick();
  if (window.__clockInterval) clearInterval(window.__clockInterval);
  window.__clockInterval = setInterval(tick, 1000);
}