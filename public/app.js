// ===== SplitEasy - App =====

const API = {
  async request(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    return data;
  },
  // Auth
  register: (body) => API.request('/api/register', { method: 'POST', body }),
  login: (body) => API.request('/api/login', { method: 'POST', body }),
  logout: () => API.request('/api/logout', { method: 'POST' }),
  me: () => API.request('/api/me'),
  searchUsers: (q) => API.request(`/api/users/search?q=${encodeURIComponent(q)}`),
  // Groups
  getGroups: () => API.request('/api/groups'),
  createGroup: (body) => API.request('/api/groups', { method: 'POST', body }),
  getGroup: (id) => API.request(`/api/groups/${id}`),
  addMember: (id, body) => API.request(`/api/groups/${id}/members`, { method: 'POST', body }),
  // Expenses
  getExpenses: (id) => API.request(`/api/groups/${id}/expenses`),
  addExpense: (id, body) => API.request(`/api/groups/${id}/expenses`, { method: 'POST', body }),
  deleteExpense: (id) => API.request(`/api/expenses/${id}`, { method: 'DELETE' }),
  // Balances
  getBalances: (id) => API.request(`/api/groups/${id}/balances`),
  settle: (id, body) => API.request(`/api/groups/${id}/settle`, { method: 'POST', body }),
  getSettlements: (id) => API.request(`/api/groups/${id}/settlements`),
  deleteSettlement: (id) => API.request(`/api/settlements/${id}`, { method: 'DELETE' }),
  batchDeleteExpenses: (ids) => API.request('/api/expenses/batch-delete', { method: 'POST', body: { ids } }),
  // Members
  removeMember: (groupId, userId) => API.request(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  // Dashboard
  getDashboardSummary: () => API.request('/api/dashboard/summary'),
};

// ===== STATE =====
const state = {
  user: null,
  groups: [],
  currentGroup: null,
  currentGroupExpenses: [],
  currentGroupBalances: null,
  currentGroupSettlements: [],
  activeTab: 'expenses',
  expenseMonthFilter: 'all',
  pollingTimer: null,
};

// ===== UTILS =====
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function getInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

function getExpenseEmoji(desc) {
  const d = desc.toLowerCase();
  if (d.includes('comida') || d.includes('almoço') || d.includes('jantar') || d.includes('restaurante') || d.includes('lanche')) return '🍽️';
  if (d.includes('uber') || d.includes('taxi') || d.includes('transporte') || d.includes('gasolina') || d.includes('combustível')) return '🚗';
  if (d.includes('mercado') || d.includes('supermercado') || d.includes('compras')) return '🛒';
  if (d.includes('bar') || d.includes('cerveja') || d.includes('bebida') || d.includes('drink')) return '🍺';
  if (d.includes('cinema') || d.includes('filme') || d.includes('show') || d.includes('ingresso')) return '🎬';
  if (d.includes('hotel') || d.includes('hospedagem') || d.includes('airbnb')) return '🏨';
  if (d.includes('viagem') || d.includes('passagem') || d.includes('voo') || d.includes('avião')) return '✈️';
  if (d.includes('aluguel') || d.includes('moradia') || d.includes('casa')) return '🏠';
  if (d.includes('internet') || d.includes('wifi') || d.includes('celular') || d.includes('telefone')) return '📱';
  if (d.includes('luz') || d.includes('energia') || d.includes('água') || d.includes('gás') || d.includes('conta')) return '💡';
  if (d.includes('farmácia') || d.includes('remédio') || d.includes('saúde') || d.includes('médico')) return '💊';
  if (d.includes('roupa') || d.includes('shopping') || d.includes('sapato')) return '👕';
  if (d.includes('presente') || d.includes('gift')) return '🎁';
  if (d.includes('café') || d.includes('coffee')) return '☕';
  if (d.includes('pizza')) return '🍕';
  return '💳';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== ROUTER =====
function navigate(hash) {
  window.location.hash = hash;
}

function getRoute() {
  const hash = window.location.hash.slice(1) || '';
  if (hash.startsWith('group/')) {
    return { page: 'group', id: hash.split('/')[1] };
  }
  return { page: hash || 'dashboard' };
}

// ===== RENDER ENGINE =====
const app = document.getElementById('app');

function render(html) {
  app.innerHTML = html;
}

// ===== VIEWS =====

function renderLoading() {
  render(`<div class="loading-page"><div class="spinner"></div></div>`);
}

function renderLogin() {
  render(`
    <div class="auth-container">
      <div class="auth-brand">
        <span class="logo">💸</span>
        <h1>SplitEasy</h1>
        <p>Divida despesas sem complicação</p>
      </div>
      <div class="auth-card">
        <h2>Entrar</h2>
        <div id="auth-error"></div>
        <form id="login-form">
          <div class="form-group">
            <label for="login-username">Usuário ou Email</label>
            <input type="text" id="login-username" placeholder="seu_usuario" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="login-password">Senha</label>
            <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="login-btn">Entrar</button>
        </form>
        <div class="auth-footer">
          Não tem conta? <a href="#register">Criar conta</a>
        </div>
      </div>
    </div>
  `);

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    try {
      const user = await API.login({
        username: $('#login-username').value.trim(),
        password: $('#login-password').value,
      });
      state.user = user;
      showToast(`Bem-vindo, ${user.username}! 👋`);
      navigate('dashboard');
    } catch (err) {
      $('#auth-error').innerHTML = `<div class="form-error">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}

function renderRegister() {
  render(`
    <div class="auth-container">
      <div class="auth-brand">
        <span class="logo">💸</span>
        <h1>SplitEasy</h1>
        <p>Divida despesas sem complicação</p>
      </div>
      <div class="auth-card">
        <h2>Criar Conta</h2>
        <div id="auth-error"></div>
        <form id="register-form">
          <div class="form-group">
            <label for="reg-username">Usuário</label>
            <input type="text" id="reg-username" placeholder="seu_usuario" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="reg-email">Email</label>
            <input type="email" id="reg-email" placeholder="voce@email.com" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="reg-password">Senha</label>
            <input type="password" id="reg-password" placeholder="Mínimo 4 caracteres" autocomplete="new-password" required minlength="4">
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="reg-btn">Criar Conta</button>
        </form>
        <div class="auth-footer">
          Já tem conta? <a href="#login">Entrar</a>
        </div>
      </div>
    </div>
  `);

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#reg-btn');
    btn.disabled = true;
    btn.textContent = 'Criando...';
    try {
      const user = await API.register({
        username: $('#reg-username').value.trim(),
        email: $('#reg-email').value.trim(),
        password: $('#reg-password').value,
      });
      state.user = user;
      showToast('Conta criada com sucesso! 🎉');
      navigate('dashboard');
    } catch (err) {
      $('#auth-error').innerHTML = `<div class="form-error">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Criar Conta';
    }
  });
}

async function renderDashboard() {
  renderLoading();
  let summary = { totalOwed: 0, totalOwe: 0, netBalance: 0 };
  try {
    [state.groups, summary] = await Promise.all([
      API.getGroups(),
      API.getDashboardSummary().catch(() => summary),
    ]);
  } catch { state.groups = []; }

  render(`
    <div class="app-layout">
      ${renderHeader()}
      <main class="app-content">
        <div class="dash-header">
          <h1>Olá, ${state.user.username} 👋</h1>
          <p>Gerencie suas despesas compartilhadas</p>
        </div>

        <div class="dash-stats">
          <div class="stat-card">
            <div class="stat-label">Grupos</div>
            <div class="stat-value">${state.groups.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Te devem</div>
            <div class="stat-value positive">${formatCurrency(summary.totalOwed)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Você deve</div>
            <div class="stat-value negative">${formatCurrency(summary.totalOwe)}</div>
          </div>
        </div>

        <div class="section-header">
          <h2>Seus Grupos</h2>
          <button class="btn btn-primary btn-sm" id="create-group-btn">＋ Novo Grupo</button>
        </div>

        ${state.groups.length === 0 ? `
          <div class="empty-state">
            <div class="icon">📂</div>
            <h3>Nenhum grupo ainda</h3>
            <p>Crie seu primeiro grupo para começar a dividir despesas com seus amigos!</p>
            <button class="btn btn-primary" id="create-group-btn-empty">＋ Criar Primeiro Grupo</button>
          </div>
        ` : `
          <div class="groups-grid">
            ${state.groups.map((g, i) => `
              <div class="group-card" data-id="${g.id}" style="animation-delay: ${i * 0.05}s">
                <div class="group-card-header">
                  <div class="group-emoji">${g.emoji || '💰'}</div>
                  <div>
                    <h3>${escapeHtml(g.name)}</h3>
                    <div class="group-meta">${g.member_count} membro${g.member_count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div class="group-card-footer">
                  <div class="group-total">Total: <strong>${formatCurrency(g.total_expenses || 0)}</strong></div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </main>
    </div>
  `);

  // Event listeners
  document.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', () => navigate('group/' + card.dataset.id));
  });

  const createBtn = $('#create-group-btn') || $('#create-group-btn-empty');
  if (createBtn) createBtn.addEventListener('click', showCreateGroupModal);

  const createBtnEmpty = $('#create-group-btn-empty');
  if (createBtnEmpty) createBtnEmpty.addEventListener('click', showCreateGroupModal);
}

async function renderGroup() {
  const route = getRoute();
  renderLoading();

  try {
    state.currentGroup = await API.getGroup(route.id);
    state.currentGroupExpenses = await API.getExpenses(route.id);
    state.currentGroupBalances = await API.getBalances(route.id);
    state.currentGroupSettlements = await API.getSettlements(route.id);
  } catch (err) {
    showToast(err.message, 'error');
    navigate('dashboard');
    return;
  }

  const g = state.currentGroup;
  const bal = state.currentGroupBalances;
  const debts = bal ? bal.debts : [];
  const settlements = state.currentGroupSettlements;

  render(`
    <div class="app-layout">
      ${renderHeader()}
      <main class="app-content">
        <div class="group-detail-header">
          <button class="back-btn" id="back-btn">←</button>
          <div class="group-emoji">${g.emoji || '💰'}</div>
          <div>
            <h1>${escapeHtml(g.name)}</h1>
            <div class="meta">${g.members.length} membro${g.members.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div class="members-list">
          ${g.members.map(m => `
            <div class="member-chip" data-member-id="${m.id}">
              <div class="avatar" style="background:${m.avatar_color}">${getInitials(m.username)}</div>
              ${escapeHtml(m.username)}${m.id === state.user.id ? ' (você)' : ''}
              ${m.id !== state.user.id && g.created_by === state.user.id ? `<button class="member-remove-btn" data-user-id="${m.id}" title="Remover">✕</button>` : ''}
            </div>
          `).join('')}
          <button class="btn btn-ghost btn-sm" id="add-member-btn">＋ Adicionar</button>
        </div>

        ${debts.length > 0 ? `
          <div class="balance-summary-card">
            ${debts.map(d => {
    const isMe = d.from.id === state.user.id;
    const isToMe = d.to.id === state.user.id;
    return `
                <div class="debt-row ${isMe ? 'debt-mine' : ''}">
                  <div class="debt-users">
                    <div class="avatar avatar-sm" style="background:${d.from.avatar_color}">${getInitials(d.from.username)}</div>
                    <span class="debt-text">
                      <strong>${escapeHtml(d.from.username)}${isMe ? ' (você)' : ''}</strong>
                      deve
                      <strong>${formatCurrency(d.amount)}</strong>
                      para
                      <strong>${escapeHtml(d.to.username)}${isToMe ? ' (você)' : ''}</strong>
                    </span>
                  </div>
                  ${isMe ? `<button class="btn btn-primary btn-sm settle-btn" data-to="${d.to.id}" data-amount="${d.amount}">💰 Pagar</button>` : ''}
                </div>
              `;
  }).join('')}
            ${settlements.length > 0 ? `
              <details class="settlements-details">
                <summary>📋 ${settlements.length} acerto${settlements.length !== 1 ? 's' : ''} registrado${settlements.length !== 1 ? 's' : ''}</summary>
                <div class="settlements-list">
                  ${settlements.map(s => `
                    <div class="settlement-mini">
                      <span>💸 ${escapeHtml(s.from_username)} → ${escapeHtml(s.to_username)}: <strong>${formatCurrency(s.amount)}</strong></span>
                      <span class="settlement-date">${formatDate(s.date)}</span>
                      <button class="btn btn-ghost btn-xs settlement-delete-btn" data-id="${s.id}" title="Excluir">✕</button>
                    </div>
                  `).join('')}
                </div>
              </details>
            ` : ''}
          </div>
        ` : debts.length === 0 && state.currentGroupExpenses.length > 0 ? `
          <div class="balance-summary-card settled">
            <span>🎉 Tudo acertado! Não há dívidas pendentes.</span>
          </div>
        ` : ''}

        <div id="tab-content">
          ${renderExpensesTab()}
        </div>
      </main>
    </div>
  `);

  // Event listeners
  $('#back-btn').addEventListener('click', () => {
    state.activeTab = 'expenses';
    navigate('dashboard');
  });

  $('#add-member-btn').addEventListener('click', showAddMemberModal);

  // Remove member buttons
  $$('.member-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Remover este membro do grupo?')) {
        try {
          await API.removeMember(state.currentGroup.id, btn.dataset.userId);
          showToast('Membro removido');
          renderGroup();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  });

  // Settle buttons in header
  $$('.settle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSettleModal(btn.dataset.to, parseFloat(btn.dataset.amount));
    });
  });

  // Settlement delete buttons
  $$('.settlement-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Excluir este acerto?')) {
        try {
          await API.deleteSettlement(btn.dataset.id);
          showToast('Acerto excluído');
          renderGroup();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  });

  bindTabListeners();

  // Start polling
  startPolling();
}

function switchTab() {
  // Update tab button styles
  $$('.group-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === state.activeTab);
  });

  // Fade out, swap content, fade in
  const container = $('#tab-content');
  if (!container) return;

  container.style.opacity = '0';
  container.style.transform = 'translateY(8px)';

  setTimeout(() => {
    const tab = state.activeTab;
    container.innerHTML =
      tab === 'expenses' ? renderExpensesTab() :
        tab === 'balances' ? renderBalancesTab() :
          renderSettlementsTab();

    bindTabListeners();

    // Trigger fade in
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    });
  }, 150);
}

function bindTabListeners() {
  const addExpBtn = $('#add-expense-btn');
  if (addExpBtn) addExpBtn.addEventListener('click', showAddExpenseModal);

  // Month filter pills
  $$('.month-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      state.expenseMonthFilter = pill.dataset.month;
      const container = $('#tab-content');
      if (container) {
        container.innerHTML = renderExpensesTab();
        bindTabListeners();
      }
    });
  });

  // Selection mode toggle
  const selectToggle = $('#select-mode-toggle');
  if (selectToggle) {
    selectToggle.addEventListener('change', () => {
      const show = selectToggle.checked;
      $$('.expense-checkbox').forEach(cb => cb.style.display = show ? 'block' : 'none');
      const bar = $('#batch-bar');
      if (bar) bar.style.display = show ? 'flex' : 'none';
      if (!show) {
        $$('.expense-checkbox').forEach(cb => cb.checked = false);
        updateSelectedCount();
      }
    });
  }

  // Select all
  const selectAll = $('#select-all');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      $$('.expense-checkbox').forEach(cb => cb.checked = selectAll.checked);
      updateSelectedCount();
    });
  }

  // Individual checkbox change
  $$('.expense-checkbox').forEach(cb => {
    cb.addEventListener('change', updateSelectedCount);
  });

  // Batch delete
  const batchBtn = $('#batch-delete-btn');
  if (batchBtn) {
    batchBtn.addEventListener('click', async () => {
      const ids = Array.from($$('.expense-checkbox:checked')).map(cb => cb.dataset.id);
      if (ids.length === 0) return showToast('Nenhuma despesa selecionada', 'error');
      if (!confirm(`Excluir ${ids.length} despesa${ids.length > 1 ? 's' : ''}?`)) return;

      try {
        await API.batchDeleteExpenses(ids);
        // Animate out
        ids.forEach(id => {
          const el = document.querySelector(`[data-expense-id="${id}"]`);
          if (el) {
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(-30px)';
            el.style.maxHeight = el.offsetHeight + 'px';
            setTimeout(() => {
              el.style.maxHeight = '0';
              el.style.padding = '0';
              el.style.margin = '0';
              el.style.overflow = 'hidden';
            }, 200);
            setTimeout(() => el.remove(), 400);
          }
        });
        // Update state
        state.currentGroupExpenses = state.currentGroupExpenses.filter(e => !ids.includes(e.id));
        showToast(`${ids.length} despesa${ids.length > 1 ? 's' : ''} excluída${ids.length > 1 ? 's' : ''}!`);
        // Refresh summary after animation
        setTimeout(() => {
          const container = $('#tab-content');
          if (container) {
            container.innerHTML = renderExpensesTab();
            bindTabListeners();
          }
        }, 500);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  $$('.settle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const to = btn.dataset.to;
      const amount = parseFloat(btn.dataset.amount);
      showSettleModal(to, amount);
    });
  });

  // Dynamic single expense delete (smooth fade-out)
  $$('.expense-delete .btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Excluir esta despesa?')) {
        const id = btn.dataset.id;
        try {
          await API.deleteExpense(id);
          // Animate removal
          const el = document.querySelector(`[data-expense-id="${id}"]`);
          if (el) {
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(-30px)';
            el.style.maxHeight = el.offsetHeight + 'px';
            setTimeout(() => {
              el.style.maxHeight = '0';
              el.style.padding = '0';
              el.style.margin = '0';
              el.style.overflow = 'hidden';
            }, 200);
            setTimeout(() => el.remove(), 400);
          }
          // Update state
          state.currentGroupExpenses = state.currentGroupExpenses.filter(exp => exp.id !== id);
          state.currentGroupBalances = await API.getBalances(state.currentGroup.id);
          showToast('Despesa excluída');
          // Refresh summary
          setTimeout(() => {
            const summary = document.querySelector('.month-summary');
            if (summary) {
              const filtered = state.expenseMonthFilter === 'all'
                ? state.currentGroupExpenses
                : state.currentGroupExpenses.filter(exp => getMonthKey(exp.date) === state.expenseMonthFilter);
              const total = filtered.reduce((s, exp) => s + exp.amount, 0);
              summary.innerHTML = `<span>${filtered.length} despesa${filtered.length !== 1 ? 's' : ''}</span><span class="month-total">Total: <strong>${formatCurrency(total)}</strong></span>`;
            }
          }, 400);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  });

  $$('.settlement-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Excluir este acerto?')) {
        try {
          await API.deleteSettlement(btn.dataset.id);
          showToast('Acerto excluído');
          renderGroup();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  });
}

function updateSelectedCount() {
  const count = $$('.expense-checkbox:checked').length;
  const el = $('#selected-count');
  if (el) el.textContent = `${count} selecionada${count !== 1 ? 's' : ''}`;
  const btn = $('#batch-delete-btn');
  if (btn) btn.disabled = count === 0;
}

function getMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return months[d.getMonth()] + ' ' + d.getFullYear();
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderExpensesTab() {
  const expenses = state.currentGroupExpenses;

  // Get unique months from expenses
  const monthsSet = new Map();
  expenses.forEach(e => {
    const key = getMonthKey(e.date);
    if (!monthsSet.has(key)) monthsSet.set(key, getMonthLabel(e.date));
  });
  const months = Array.from(monthsSet.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  // Filter expenses
  const filtered = state.expenseMonthFilter === 'all'
    ? expenses
    : expenses.filter(e => getMonthKey(e.date) === state.expenseMonthFilter);

  // Group by month
  const grouped = new Map();
  filtered.forEach(e => {
    const label = getMonthLabel(e.date);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(e);
  });

  // Calc month total
  const monthTotal = filtered.reduce((s, e) => s + e.amount, 0);

  return `
    <div class="actions-bar">
      <button class="btn btn-primary btn-sm" id="add-expense-btn">＋ Nova Despesa</button>
      <label class="select-mode-toggle"><input type="checkbox" id="select-mode-toggle"> Selecionar</label>
    </div>
    <div id="batch-bar" class="batch-bar" style="display:none">
      <label class="batch-check-all"><input type="checkbox" id="select-all"> Todos</label>
      <span id="selected-count">0 selecionadas</span>
      <button class="btn btn-danger btn-sm" id="batch-delete-btn">🗑️ Excluir Selecionadas</button>
    </div>
    ${expenses.length === 0 ? `
      <div class="empty-state">
        <div class="icon">🧾</div>
        <h3>Sem despesas ainda</h3>
        <p>Adicione a primeira despesa do grupo!</p>
      </div>
    ` : `
      <div class="month-filter">
        <button class="month-pill ${state.expenseMonthFilter === 'all' ? 'active' : ''}" data-month="all">Todos</button>
        ${months.map(([key, label]) => `
          <button class="month-pill ${state.expenseMonthFilter === key ? 'active' : ''}" data-month="${key}">${label.split(' ')[0].substring(0, 3)}</button>
        `).join('')}
      </div>
      <div class="month-summary">
        <span>${filtered.length} despesa${filtered.length !== 1 ? 's' : ''}</span>
        <span class="month-total">Total: <strong>${formatCurrency(monthTotal)}</strong></span>
      </div>
      <div class="expense-list">
        ${Array.from(grouped.entries()).map(([monthLabel, items]) => `
          ${state.expenseMonthFilter === 'all' ? `<div class="month-divider"><span>${monthLabel}</span></div>` : ''}
          ${items.map((e, i) => `
            <div class="expense-item" data-expense-id="${e.id}" style="animation-delay:${i * 0.04}s">
              <input type="checkbox" class="expense-checkbox" data-id="${e.id}" style="display:none">
              <div class="expense-icon">${getExpenseEmoji(e.description)}</div>
              <div class="expense-info">
                <h4>${escapeHtml(e.description)}</h4>
                <p>Pago por <strong>${escapeHtml(e.paid_by_name)}</strong> • ${formatDate(e.date)}</p>
              </div>
              <div class="expense-amount">
                <div class="amount">${formatCurrency(e.amount)}</div>
                <div class="split-info">${e.splits.length} pessoa${e.splits.length !== 1 ? 's' : ''}</div>
              </div>
              <div class="expense-delete">
                <button class="btn btn-ghost btn-sm" data-id="${e.id}" title="Excluir">🗑️</button>
              </div>
            </div>
          `).join('')}
        `).join('')}
      </div>
    `}
  `;
}

function renderBalancesTab() {
  const bal = state.currentGroupBalances;
  if (!bal) return '<div class="spinner"></div>';

  const debts = bal.debts;
  const myDebts = debts.filter(d => d.from.id === state.user.id);
  const owedToMe = debts.filter(d => d.to.id === state.user.id);

  return `
    ${debts.length === 0 ? `
      <div class="all-settled">
        <div class="icon">🎉</div>
        <h3>Tudo acertado!</h3>
        <p>Não há dívidas pendentes neste grupo.</p>
      </div>
    ` : `
      <div class="balance-cards">
        ${debts.map((d, i) => {
    const isMe = d.from.id === state.user.id;
    return `
            <div class="balance-card" style="animation-delay:${i * 0.06}s">
              <div class="balance-arrow">
                <div class="avatar" style="background:${d.from.avatar_color}">${getInitials(d.from.username)}</div>
                <div>
                  <div style="font-weight:600;font-size:0.9rem">${escapeHtml(d.from.username)}${d.from.id === state.user.id ? ' (você)' : ''}</div>
                </div>
                <span class="arrow">→</span>
                <div class="avatar" style="background:${d.to.avatar_color}">${getInitials(d.to.username)}</div>
                <div>
                  <div style="font-weight:600;font-size:0.9rem">${escapeHtml(d.to.username)}${d.to.id === state.user.id ? ' (você)' : ''}</div>
                </div>
              </div>
              <div class="balance-amount">${formatCurrency(d.amount)}</div>
              ${isMe ? `<button class="btn btn-primary settle-btn" data-to="${d.to.id}" data-amount="${d.amount}">Pagar</button>` : ''}
            </div>
          `;
  }).join('')}
      </div>
    `}
  `;
}

function renderSettlementsTab() {
  const settlements = state.currentGroupSettlements;
  return `
    ${settlements.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📋</div>
        <h3>Nenhum acerto ainda</h3>
        <p>Quando alguém pagar uma dívida, o registro aparecerá aqui.</p>
      </div>
    ` : `
      <div class="expense-list">
        ${settlements.map((s, i) => `
          <div class="settlement-item" style="animation-delay:${i * 0.04}s">
            <div class="settlement-icon">💸</div>
            <div class="settlement-info">
              <h4>${escapeHtml(s.from_username)} pagou para ${escapeHtml(s.to_username)}</h4>
              <p>${formatDate(s.date)}</p>
            </div>
            <div class="settlement-amount">${formatCurrency(s.amount)}</div>
            <div class="expense-delete">
              <button class="btn btn-ghost btn-sm settlement-delete-btn" data-id="${s.id}" title="Excluir">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function renderHeader() {
  return `
    <header class="app-header">
      <div class="header-left">
        <div class="header-logo" id="header-logo">
          <span class="icon">💸</span>
          SplitEasy
        </div>
      </div>
      <div class="header-right">
        <div class="user-badge">
          <div class="avatar" style="background:${state.user.avatar_color}">${getInitials(state.user.username)}</div>
          <span class="username-text">${escapeHtml(state.user.username)}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="logout-btn">Sair</button>
      </div>
    </header>
  `;
}

// ===== MODALS =====
function showModal(title, bodyHtml, footerHtml = '') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="btn btn-ghost btn-icon modal-close">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  return overlay;
}

function showCreateGroupModal() {
  const emojis = ['💰', '🏠', '✈️', '🍽️', '🎉', '🛒', '🎮', '⚽', '🏖️', '💼', '🎓', '❤️'];
  const body = `
    <form id="create-group-form">
      <div class="form-group">
        <label>Nome do Grupo</label>
        <input type="text" id="group-name" placeholder="Ex: Viagem Praia 2025" required>
      </div>
      <div class="form-group">
        <label>Emoji</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
          ${emojis.map((e, i) => `
            <button type="button" class="btn btn-secondary btn-icon emoji-pick ${i === 0 ? 'active' : ''}" 
              data-emoji="${e}" style="${i === 0 ? 'border-color:var(--accent-primary);background:var(--accent-primary-glow)' : ''}">${e}</button>
          `).join('')}
        </div>
        <input type="hidden" id="group-emoji" value="💰">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Criar Grupo</button>
    </form>
  `;

  const overlay = showModal('Novo Grupo', body);

  overlay.querySelectorAll('.emoji-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.emoji-pick').forEach(b => {
        b.style.borderColor = '';
        b.style.background = '';
        b.classList.remove('active');
      });
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.background = 'var(--accent-primary-glow)';
      btn.classList.add('active');
      overlay.querySelector('#group-emoji').value = btn.dataset.emoji;
    });
  });

  overlay.querySelector('#create-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.createGroup({
        name: overlay.querySelector('#group-name').value.trim(),
        emoji: overlay.querySelector('#group-emoji').value,
      });
      overlay.remove();
      showToast('Grupo criado! 🎉');
      renderDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showAddMemberModal() {
  const body = `
    <form id="add-member-form">
      <div class="form-group">
        <label>Username do membro</label>
        <input type="text" id="member-username" placeholder="Digite o username" required>
        <div id="user-search-results" style="margin-top:8px"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Adicionar ao Grupo</button>
    </form>
  `;

  const overlay = showModal('Adicionar Membro', body);
  let searchTimeout;

  overlay.querySelector('#member-username').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) {
      overlay.querySelector('#user-search-results').innerHTML = '';
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const users = await API.searchUsers(q);
        const existingIds = state.currentGroup.members.map(m => m.id);
        const filtered = users.filter(u => !existingIds.includes(u.id));
        overlay.querySelector('#user-search-results').innerHTML = filtered.map(u => `
          <div class="member-chip" style="cursor:pointer;margin-bottom:4px" data-username="${u.username}">
            <div class="avatar" style="background:${u.avatar_color}">${getInitials(u.username)}</div>
            ${escapeHtml(u.username)}
          </div>
        `).join('') || '<p style="font-size:0.8rem;color:var(--text-muted)">Nenhum usuário encontrado</p>';

        overlay.querySelectorAll('#user-search-results .member-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            overlay.querySelector('#member-username').value = chip.dataset.username;
            overlay.querySelector('#user-search-results').innerHTML = '';
          });
        });
      } catch { }
    }, 300);
  });

  overlay.querySelector('#add-member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.addMember(state.currentGroup.id, {
        username: overlay.querySelector('#member-username').value.trim(),
      });
      overlay.remove();
      showToast('Membro adicionado! 👤');
      renderGroup();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showAddExpenseModal() {
  const members = state.currentGroup.members;
  const today = new Date().toISOString().split('T')[0];

  const body = `
    <form id="add-expense-form">
      <div class="form-group">
        <label>Descrição</label>
        <input type="text" id="exp-desc" placeholder="Ex: Almoço no restaurante" required>
      </div>
      <div class="form-group">
        <label>Valor (R$)</label>
        <input type="number" id="exp-amount" placeholder="0.00" step="0.01" min="0.01" required>
      </div>
      <div class="form-group">
        <label>Quem pagou?</label>
        <select id="exp-paid-by">
          ${members.map(m => `
            <option value="${m.id}" ${m.id === state.user.id ? 'selected' : ''}>
              ${escapeHtml(m.username)}${m.id === state.user.id ? ' (você)' : ''}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Data</label>
        <input type="date" id="exp-date" value="${today}">
      </div>
      <div class="form-group">
        <label>Dividir como</label>
        <div class="split-toggle">
          <button type="button" class="active" data-split="equal">Igualmente</button>
          <button type="button" data-split="custom">Personalizado</button>
        </div>
      </div>
      <div id="custom-splits" style="display:none">
        <div class="custom-splits">
          ${members.map((m, idx) => `
            <div class="custom-split-row">
              <div class="avatar" style="background:${m.avatar_color}">${getInitials(m.username)}</div>
              <span class="member-name">${escapeHtml(m.username)}</span>
              <div class="split-input-wrapper">
                <span class="split-currency">R$</span>
                <input type="number" class="split-amount" data-user-id="${m.id}" data-idx="${idx}" placeholder="0.00" step="0.01" min="0">
              </div>
            </div>
          `).join('')}
        </div>
        <div id="split-remaining" class="split-remaining"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:var(--space-md)">Adicionar Despesa</button>
    </form>
  `;

  const overlay = showModal('Nova Despesa', body);
  let splitType = 'equal';

  // Dynamic split calculation
  function updateSplitRemaining() {
    const totalAmount = parseFloat(overlay.querySelector('#exp-amount').value) || 0;
    const inputs = overlay.querySelectorAll('.split-amount');
    let sumFilled = 0;
    let emptyInputs = [];

    inputs.forEach(input => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && input.value !== '') {
        sumFilled += val;
      } else {
        emptyInputs.push(input);
      }
    });

    const remaining = Math.round((totalAmount - sumFilled) * 100) / 100;

    // Auto-fill if exactly one input is empty
    if (emptyInputs.length === 1 && totalAmount > 0) {
      emptyInputs[0].value = remaining > 0 ? remaining.toFixed(2) : '0.00';
    }

    // Update remaining indicator
    const indicator = overlay.querySelector('#split-remaining');
    if (totalAmount > 0) {
      const actualSum = Array.from(inputs).reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
      const diff = Math.round((totalAmount - actualSum) * 100) / 100;
      if (Math.abs(diff) < 0.02) {
        indicator.innerHTML = '<span class="split-ok">✅ Valores conferem!</span>';
      } else if (diff > 0) {
        indicator.innerHTML = `<span class="split-warn">⚠️ Faltam ${formatCurrency(diff)}</span>`;
      } else {
        indicator.innerHTML = `<span class="split-error">❌ Excedeu ${formatCurrency(Math.abs(diff))}</span>`;
      }
    }
  }

  overlay.querySelectorAll('.split-amount').forEach(input => {
    input.addEventListener('input', () => {
      // Clear auto-filled inputs when user types in a different one
      const inputs = overlay.querySelectorAll('.split-amount');
      inputs.forEach(other => {
        if (other !== input && other !== document.activeElement) {
          // Don't clear if user explicitly set it
        }
      });
      // Find the other input that is NOT being edited and auto-fill it
      const totalAmount = parseFloat(overlay.querySelector('#exp-amount').value) || 0;
      const myVal = parseFloat(input.value) || 0;
      inputs.forEach(other => {
        if (other !== input) {
          const remaining = Math.round((totalAmount - myVal) * 100) / 100;
          other.value = remaining >= 0 ? remaining.toFixed(2) : '0.00';
        }
      });
      updateSplitRemaining();
    });
  });

  // Also update splits when total amount changes
  overlay.querySelector('#exp-amount').addEventListener('input', updateSplitRemaining);

  overlay.querySelectorAll('.split-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.split-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      splitType = btn.dataset.split;
      overlay.querySelector('#custom-splits').style.display = splitType === 'custom' ? 'block' : 'none';
      if (splitType === 'custom') updateSplitRemaining();
    });
  });

  overlay.querySelector('#add-expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(overlay.querySelector('#exp-amount').value);
    let splits = null;

    if (splitType === 'custom') {
      splits = [];
      overlay.querySelectorAll('.split-amount').forEach(input => {
        const val = parseFloat(input.value) || 0;
        if (val > 0) {
          splits.push({ user_id: input.dataset.userId, amount: val });
        }
      });
      const total = splits.reduce((s, sp) => s + sp.amount, 0);
      if (Math.abs(total - amount) > 0.02) {
        showToast(`A soma das divisões (${formatCurrency(total)}) não corresponde ao valor total (${formatCurrency(amount)})`, 'error');
        return;
      }
    }

    try {
      await API.addExpense(state.currentGroup.id, {
        description: overlay.querySelector('#exp-desc').value.trim(),
        amount,
        date: overlay.querySelector('#exp-date').value,
        paid_by: overlay.querySelector('#exp-paid-by').value,
        splits,
      });
      overlay.remove();
      showToast('Despesa adicionada! 💰');
      renderGroup();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showSettleModal(toUserId, amount) {
  const toUser = state.currentGroup.members.find(m => m.id === toUserId);
  if (!toUser) return;

  const body = `
    <form id="settle-form">
      <div style="text-align:center;margin-bottom:var(--space-lg)">
        <div style="display:flex;align-items:center;justify-content:center;gap:var(--space-md);margin-bottom:var(--space-md)">
          <div class="avatar avatar-lg" style="background:${state.user.avatar_color}">${getInitials(state.user.username)}</div>
          <span style="font-size:1.5rem">→</span>
          <div class="avatar avatar-lg" style="background:${toUser.avatar_color}">${getInitials(toUser.username)}</div>
        </div>
        <p style="color:var(--text-secondary)">Pagando para <strong>${escapeHtml(toUser.username)}</strong></p>
      </div>
      <div class="form-group">
        <label>Valor (R$)</label>
        <input type="number" id="settle-amount" value="${amount}" step="0.01" min="0.01" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Confirmar Pagamento</button>
    </form>
  `;

  const overlay = showModal('Acertar Conta', body);

  overlay.querySelector('#settle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.settle(state.currentGroup.id, {
        to_user: toUserId,
        amount: parseFloat(overlay.querySelector('#settle-amount').value),
      });
      overlay.remove();
      showToast('Pagamento registrado! ✅');
      renderGroup();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ===== POLLING =====
function startPolling() {
  stopPolling();
  state.pollingTimer = setInterval(async () => {
    if (!state.currentGroup) return;
    try {
      const [expenses, balances, settlements] = await Promise.all([
        API.getExpenses(state.currentGroup.id),
        API.getBalances(state.currentGroup.id),
        API.getSettlements(state.currentGroup.id),
      ]);

      const changed =
        JSON.stringify(expenses.map(e => e.id)) !== JSON.stringify(state.currentGroupExpenses.map(e => e.id)) ||
        JSON.stringify(settlements.map(s => s.id)) !== JSON.stringify(state.currentGroupSettlements.map(s => s.id));

      state.currentGroupExpenses = expenses;
      state.currentGroupBalances = balances;
      state.currentGroupSettlements = settlements;

      if (changed) {
        const tabContent = document.getElementById('tab-content');
        if (tabContent) {
          if (state.activeTab === 'expenses') tabContent.innerHTML = renderExpensesTab();
          if (state.activeTab === 'balances') tabContent.innerHTML = renderBalancesTab();
          if (state.activeTab === 'settlements') tabContent.innerHTML = renderSettlementsTab();
          rebindTabEvents();
        }
      }
    } catch { }
  }, 10000);
}

function stopPolling() {
  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }
}

function rebindTabEvents() {
  const addExpBtn = $('#add-expense-btn');
  if (addExpBtn) addExpBtn.addEventListener('click', showAddExpenseModal);

  $$('.settle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSettleModal(btn.dataset.to, parseFloat(btn.dataset.amount));
    });
  });

  $$('.expense-delete .btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Excluir esta despesa?')) {
        try {
          await API.deleteExpense(btn.dataset.id);
          showToast('Despesa excluída');
          renderGroup();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  });
}

// ===== HELPERS =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== ROUTER HANDLER =====
async function handleRoute() {
  stopPolling();
  const route = getRoute();

  if (!state.user) {
    try {
      state.user = await API.me();
    } catch {
      if (route.page === 'register') return renderRegister();
      return renderLogin();
    }
  }

  switch (route.page) {
    case 'login': renderLogin(); break;
    case 'register': renderRegister(); break;
    case 'group': renderGroup(); break;
    default: renderDashboard(); break;
  }
}

// ===== EVENT DELEGATION FOR HEADER =====
document.addEventListener('click', (e) => {
  if (e.target.id === 'logout-btn' || e.target.closest('#logout-btn')) {
    API.logout().then(() => {
      state.user = null;
      state.groups = [];
      stopPolling();
      navigate('login');
      showToast('Até logo! 👋', 'info');
    });
  }
  if (e.target.id === 'header-logo' || e.target.closest('#header-logo')) {
    state.activeTab = 'expenses';
    navigate('dashboard');
  }
});

// ===== INIT =====
window.addEventListener('hashchange', handleRoute);
handleRoute();
