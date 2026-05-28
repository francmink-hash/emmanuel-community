const STORAGE_KEYS = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  projects: 'projects',
  debts: 'debts'
};

const META_KEYS = {
  profiles: 'ef_profiles',
  active: 'ef_activeProfileId'
};

const SESSION_KEY = 'ef_activeProfileId_session';
const CHART_INSTANCES = {};
window.addEventListener('DOMContentLoaded', () => {
  initPage();
});

function initPage() {
  const page = document.body.dataset.page;
  if (!page) return;

  const activeProfileId = getActiveProfileId();
  if (page !== 'login' && !activeProfileId) {
    window.location.href = 'login.html';
    return;
  }

  if (page === 'login') {
    initLoginPage();
    return;
  }

  initHeaderProfile();

  if (page === 'dashboard') {
    renderDashboard();
  } else if (page === 'transactions') {
    initTransactionPage();
  } else if (page === 'accounts') {
    renderAccountsPage();
  } else if (page === 'projects') {
    renderProjectsPage();
  } else if (page === 'debts') {
    renderDebtsPage();
  }
}

function getActiveProfileId() {
  return localStorage.getItem(META_KEYS.active) || sessionStorage.getItem(SESSION_KEY) || null;
}

function setActiveProfileId(id, retain) {
  if (!id) return;
  if (retain) {
    localStorage.setItem(META_KEYS.active, id);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, id);
    localStorage.removeItem(META_KEYS.active);
  }
}

function clearActiveProfileId() {
  localStorage.removeItem(META_KEYS.active);
  sessionStorage.removeItem(SESSION_KEY);
}

function getProfileKey(key) {
  const profileId = getActiveProfileId();
  return profileId ? `ef_${profileId}_${key}` : null;
}

function loadData(key) {
  const profileKey = getProfileKey(key);
  if (!profileKey) return [];
  try {
    return JSON.parse(localStorage.getItem(profileKey) || '[]');
  } catch (error) {
    return [];
  }
}

function saveData(key, data) {
  const profileKey = getProfileKey(key);
  if (!profileKey) return;
  localStorage.setItem(profileKey, JSON.stringify(data));
}

function loadProfileMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEYS.profiles) || '[]');
  } catch (error) {
    return [];
  }
}

function saveProfileMeta(profiles) {
  localStorage.setItem(META_KEYS.profiles, JSON.stringify(profiles));
}

function getCurrentProfile() {
  const activeId = getActiveProfileId();
  if (!activeId) return null;
  return loadProfileMeta().find(profile => profile.id === activeId) || null;
}

function hashPassword(password) {
  try {
    return btoa(password);
  } catch (error) {
    return password;
  }
}

function verifyPassword(profile, password) {
  return profile && typeof password === 'string' && password.length > 0 && profile.passwordHash === hashPassword(password);
}

function createProfile(username, password, retainSession) {
  const profiles = loadProfileMeta();
  if (profiles.some(profile => profile.username.toLowerCase() === username.toLowerCase())) {
    showToast('Ce nom de profil existe déjà. Choisissez un autre nom.', 'error');
    return null;
  }

  const id = uid();
  profiles.push({
    id,
    username,
    passwordHash: hashPassword(password),
    retain: Boolean(retainSession)
  });
  saveProfileMeta(profiles);
  setActiveProfileId(id, retainSession);
  return id;
}

function initLoginPage() {
  if (getActiveProfileId()) {
    window.location.href = 'index.html';
    return;
  }

  const profiles = loadProfileMeta();
  renderLoginProfiles(profiles);

  const createForm = document.getElementById('create-profile-form');
  if (!createForm) return;

  createForm.addEventListener('submit', event => {
    event.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const retain = document.getElementById('login-retain').checked;
    if (!username || !password) {
      showToast('Veuillez renseigner un nom et un mot de passe.', 'error');
      return;
    }
    const profileId = createProfile(username, password, retain);
    if (!profileId) return;
    window.location.href = 'index.html';
  });
}

function renderLoginProfiles(profiles) {
  const container = document.getElementById('existing-profiles');
  container.innerHTML = '';
  if (!container) return;

  if (!profiles.length) {
    container.innerHTML = '<p class="text-gray-400">Aucun profil enregistré. Créez un compte pour commencer.</p>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'space-y-4';
  wrapper.innerHTML = `
    <div>
      <label for="profile-select" class="block text-sm font-medium text-gray-700">Profil existant</label>
      <select id="profile-select" class="mt-2 block w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
        <option value="">Choisir un profil</option>
      </select>
    </div>
    <div>
      <label for="existing-password" class="block text-sm font-medium text-gray-700">Mot de passe</label>
      <input id="existing-password" type="password" autocomplete="current-password" class="mt-2 block w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="••••••••" />
    </div>
    <button id="existing-login-button" type="button" class="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500">Se connecter</button>
  `;
  container.appendChild(wrapper);

  const select = container.querySelector('#profile-select');
  profiles.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = `${profile.username} — ${profile.retain ? 'session persistante' : 'session temporaire'}`;
    select.appendChild(option);
  });

  const loginButton = container.querySelector('#existing-login-button');
  if (loginButton) {
    loginButton.addEventListener('click', () => {
      const selectedId = select.value;
      const passwordField = container.querySelector('#existing-password');
      const password = passwordField ? passwordField.value.trim() : '';
      if (!selectedId) {
        showToast('Veuillez sélectionner un profil.', 'error');
        return;
      }
      const profile = profiles.find(p => p.id === selectedId);
      loginProfile(profile, password);
    });
  }
}

function loginProfile(profile, passwordInput) {
  if (!profile) {
    showToast('Profil introuvable.', 'error');
    return;
  }

  const password = typeof passwordInput === 'string' ? passwordInput : prompt(`Mot de passe pour ${profile.username}`);
  if (password === null || password === undefined) return;

  const cleanPassword = password.trim();
  if (!cleanPassword) {
    showToast('Veuillez saisir un mot de passe.', 'error');
    return;
  }

  if (!verifyPassword(profile, cleanPassword)) {
    showToast('Mot de passe incorrect', 'error');
    return;
  }

  setActiveProfileId(profile.id, profile.retain);
  window.location.href = 'index.html';
}

function exportProfileData() {
  const profile = getCurrentProfile();
  if (!profile) return;
  const payload = {
    profile: {
      id: profile.id,
      username: profile.username,
      retain: profile.retain
    },
    data: {
      accounts: loadData(STORAGE_KEYS.accounts),
      categories: loadData(STORAGE_KEYS.categories),
      transactions: loadData(STORAGE_KEYS.transactions),
      projects: loadData(STORAGE_KEYS.projects),
      debts: loadData(STORAGE_KEYS.debts)
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `epargne-franc-${profile.username}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  showToast('JSON exporté', 'success');
}

function logout() {
  const confirmSave = confirm('Voulez-vous sauvegarder vos données avant de quitter ?');
  if (confirmSave) {
    exportProfileData();
  }
  clearActiveProfileId();
  window.location.href = 'login.html';
}

function getProfileSessionLabel(profile) {
  if (!profile) return '';
  return profile.retain ? 'session persistante' : 'session temporaire';
}

function initHeaderProfile() {
  const currentProfile = getCurrentProfile();
  const profileLabel = document.getElementById('current-profile-name');
  if (profileLabel) {
    profileLabel.textContent = currentProfile
      ? `Profil actif : ${currentProfile.username} — ${getProfileSessionLabel(currentProfile)}`
      : 'Aucun profil actif';
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function parseAmount(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const cleaned = String(raw).trim().replace(/\s+/g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(value) {
  const amount = parseAmount(value);
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString('fr-FR');
}

function getBalances() {
  const transactions = loadData(STORAGE_KEYS.transactions);
  return transactions.reduce((acc, tx) => {
    const amount = parseAmount(tx.amount);
    const sign = tx.type === 'income' || tx.type === 'borrow' ? 1 : -1;
    acc[tx.accountId] = (acc[tx.accountId] || 0) + amount * sign;
    return acc;
  }, {});
}

function getTotals() {
  const transactions = loadData(STORAGE_KEYS.transactions);
  return transactions.reduce(
    (acc, tx) => {
      const amount = parseAmount(tx.amount);
      if (tx.type === 'income' || tx.type === 'borrow') acc.income += amount;
      else if (tx.type === 'expense' || tx.type === 'loan') acc.expense += amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );
}

function getCategoryTotals() {
  const transactions = loadData(STORAGE_KEYS.transactions);
  return transactions.reduce((acc, tx) => {
    if (!tx.categoryId) return acc;
    acc[tx.categoryId] = (acc[tx.categoryId] || 0) + parseAmount(tx.amount);
    return acc;
  }, {});
}

function calculateProjectEffort(project) {
  const target = Number(project.target) || 0;
  const today = new Date();
  const deadline = new Date(project.deadline);
  const remainingDays = Math.max(1, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)));
  return Math.ceil(target / remainingDays);
}

function calculateDebtSummary(debt) {
  const repayments = debt.repayments || [];
  const repaid = repayments.reduce((total, item) => total + Number(item.amount || 0), 0);
  return {
    total: Number(debt.amount || 0),
    repaid,
    remaining: Math.max(0, Number(debt.amount || 0) - repaid)
  };
}

function createAccount(event) {
  event.preventDefault();
  const name = document.getElementById('a-name').value.trim();
  const icon = document.getElementById('a-icon').value.trim() || '🏦';
  const color = document.getElementById('a-color').value || 'indigo';
  if (!name) return;

  const accounts = loadData(STORAGE_KEYS.accounts);
  accounts.push({ id: uid(), name, icon, color });
  saveData(STORAGE_KEYS.accounts, accounts);
  document.getElementById('a-name').value = '';
  document.getElementById('a-icon').value = '';
  showToast('✅ Compte ajouté', 'success');
  renderAccountsPage();
}

function createCategory(event) {
  event.preventDefault();
  const name = document.getElementById('c-name').value.trim();
  const icon = document.getElementById('c-icon').value.trim() || '🏷️';
  const group = document.getElementById('c-group').value;
  if (!name) return;

  const categories = loadData(STORAGE_KEYS.categories);
  categories.push({ id: uid(), name, icon, parent: group });
  saveData(STORAGE_KEYS.categories, categories);
  document.getElementById('c-name').value = '';
  document.getElementById('c-icon').value = '';
  showToast('✅ Catégorie ajoutée', 'success');
  renderAccountsPage();
}

function createProject(event) {
  event.preventDefault();
  const name = document.getElementById('p-name').value.trim();
  const target = Number(document.getElementById('p-target').value);
  const deadline = document.getElementById('p-deadline').value;
  const accountId = document.getElementById('p-account').value;
  if (!name || !target || !deadline || !accountId) return;

  const projects = loadData(STORAGE_KEYS.projects);
  projects.push({ id: uid(), name, target, deadline, accountId });
  saveData(STORAGE_KEYS.projects, projects);
  document.getElementById('p-name').value = '';
  document.getElementById('p-target').value = '';
  document.getElementById('p-deadline').value = '';
  renderProjectsPage();
  showToast('🚀 Projet créé', 'success');
}

function createDebt(event) {
  event.preventDefault();
  const type = document.getElementById('d-type').value;
  const name = document.getElementById('d-name').value.trim();
  const amount = Number(document.getElementById('d-amount').value);
  const date = document.getElementById('d-date').value;
  const accountId = document.getElementById('d-account').value;
  const context = document.getElementById('d-context').value.trim();
  if (!name || !amount || !date || !accountId) return;

  const debts = loadData(STORAGE_KEYS.debts);
  debts.push({ id: uid(), type, name, amount, date, accountId, context, repayments: [] });
  saveData(STORAGE_KEYS.debts, debts);
  document.getElementById('d-name').value = '';
  document.getElementById('d-amount').value = '';
  document.getElementById('d-date').value = '';
  document.getElementById('d-context').value = '';
  renderDebtsPage();
  showToast('🤝 Dette ajoutée', 'success');
}

function addRepayment(debtId) {
  const amountInput = document.getElementById(`rep-amount-${debtId}`);
  const dateInput = document.getElementById(`rep-date-${debtId}`);
  const noteInput = document.getElementById(`rep-note-${debtId}`);
  const amount = Number(amountInput.value);
  const date = dateInput.value;
  const note = noteInput.value.trim();
  if (!amount || !date) return;

  const debts = loadData(STORAGE_KEYS.debts);
  const debt = debts.find(d => d.id === debtId);
  if (!debt) return;

  debt.repayments = debt.repayments || [];
  debt.repayments.push({ id: uid(), amount, date, note });
  saveData(STORAGE_KEYS.debts, debts);
  renderDebtsPage();
  showToast('✅ Remboursement enregistré', 'success');
}

function initTransactionPage() {
  const filterText = document.getElementById('filter-text');
  filterText.addEventListener('input', renderTransactionsPage);
  document.getElementById('filter-account').addEventListener('change', renderTransactionsPage);
  document.getElementById('filter-type').addEventListener('change', renderTransactionsPage);
  document.getElementById('filter-category').addEventListener('change', renderTransactionsPage);

  populateTransactionFilters();
  renderTransactionsPage();
}

function populateTransactionFilters() {
  const accounts = loadData(STORAGE_KEYS.accounts);
  const categories = loadData(STORAGE_KEYS.categories);
  const accountSelect = document.getElementById('filter-account');
  const categorySelect = document.getElementById('filter-category');
  const transactionAccount = document.getElementById('transaction-account');
  const transactionCategory = document.getElementById('transaction-category');

  const accountOptions = '<option value="">Tous les comptes</option>' + accounts.map(acc => `<option value="${acc.id}">${acc.icon} ${acc.name}</option>`).join('');
  const categoryOptions = '<option value="">Toutes les catégories</option>' + categories.map(cat => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');

  if (accountSelect) accountSelect.innerHTML = accountOptions;
  if (categorySelect) categorySelect.innerHTML = categoryOptions;
  if (transactionAccount) transactionAccount.innerHTML = '<option value="">Choisir un compte</option>' + accounts.map(acc => `<option value="${acc.id}">${acc.icon} ${acc.name}</option>`).join('');
  if (transactionCategory) transactionCategory.innerHTML = '<option value="">Choisir une catégorie</option>' + categories.map(cat => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');
}

function setFilterPeriod(period) {
  window.currentFilterPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('bg-indigo-50', 'border-indigo-300', 'text-indigo-600', 'font-semibold'));
  if (period === 'all') document.getElementById('fp-all').classList.add('bg-indigo-50', 'border-indigo-300', 'text-indigo-600', 'font-semibold');
  else document.getElementById(`fp-${period}`).classList.add('bg-indigo-50', 'border-indigo-300', 'text-indigo-600', 'font-semibold');
  renderTransactionsPage();
}

function renderTransactionsPage() {
  const transactions = loadData(STORAGE_KEYS.transactions);
  const accounts = loadData(STORAGE_KEYS.accounts);
  const categories = loadData(STORAGE_KEYS.categories);
  let filtered = [...transactions];
  const period = window.currentFilterPeriod || 'all';
  if (period !== 'all') {
    const today = new Date();
    let startDate = new Date(today);
    if (period === 'month') startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (period === 'last') startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    else if (period === 'year') startDate = new Date(today.getFullYear(), 0, 1);
    filtered = filtered.filter(tx => new Date(tx.date) >= startDate);
  }

  const searchText = document.getElementById('filter-text').value.trim().toLowerCase();
  const accountFilter = document.getElementById('filter-account').value;
  const typeFilter = document.getElementById('filter-type').value;
  const categoryFilter = document.getElementById('filter-category').value;

  if (searchText) {
    filtered = filtered.filter(tx => tx.label.toLowerCase().includes(searchText));
  }
  if (accountFilter) filtered = filtered.filter(tx => tx.accountId === accountFilter);
  if (typeFilter) filtered = filtered.filter(tx => tx.type === typeFilter);
  if (categoryFilter) filtered = filtered.filter(tx => tx.categoryId === categoryFilter);

  const tbody = document.getElementById('transactions-body');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-10 text-center text-gray-400">Aucune transaction trouvée.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(tx => {
      const account = accounts.find(acc => acc.id === tx.accountId);
      const category = categories.find(cat => cat.id === tx.categoryId);
      return `
        <tr class="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
          <td class="px-4 py-4 font-medium text-gray-700">${formatDate(tx.date)}</td>
          <td class="px-4 py-4 text-gray-600">${tx.label}</td>
          <td class="px-4 py-4 text-gray-500">${account ? `${account.icon} ${account.name}` : '-'}</td>
          <td class="px-4 py-4 text-gray-500">${category ? `${category.icon} ${category.name}` : '-'}</td>
          <td class="px-4 py-4 text-right ${tx.type === 'income' || tx.type === 'borrow' ? 'text-emerald-600' : 'text-rose-600'}">${tx.type === 'expense' || tx.type === 'loan' ? '-' : ''}${formatCurrency(tx.amount)}</td>
        </tr>`;
    })
    .join('');
}

function createTransaction(type) {
  const label = document.getElementById('transaction-label').value.trim();
  const amount = parseAmount(document.getElementById('transaction-amount').value);
  const date = document.getElementById('transaction-date').value;
  const accountId = document.getElementById('transaction-account').value;
  const categoryId = document.getElementById('transaction-category').value;

  if (!label || !amount || !date || !accountId) {
    showToast('Veuillez remplir le libellé, le montant, la date et le compte.', 'error');
    return;
  }

  const transactions = loadData(STORAGE_KEYS.transactions);
  transactions.push({
    id: uid(),
    label,
    amount,
    date,
    accountId,
    categoryId,
    type
  });
  saveData(STORAGE_KEYS.transactions, transactions);

  document.getElementById('transaction-label').value = '';
  document.getElementById('transaction-amount').value = '';
  document.getElementById('transaction-date').value = '';
  document.getElementById('transaction-account').value = '';
  document.getElementById('transaction-category').value = '';

  showToast(type === 'income' ? '✅ Entrée enregistrée' : '✅ Sortie enregistrée', 'success');
  renderTransactionsPage();
}

function renderAccountsPage() {
  const accounts = loadData(STORAGE_KEYS.accounts);
  const categories = loadData(STORAGE_KEYS.categories);

  document.getElementById('accounts-count').textContent = `${accounts.length} compte(s)`;
  document.getElementById('categories-count').textContent = `${categories.length} catégorie(s)`;

  const accountList = document.getElementById('accounts-list');
  if (!accounts.length) {
    accountList.innerHTML = '<p class="text-gray-400">Aucun compte créé pour le moment.</p>';
  } else {
    const balances = getBalances();
    const colorMap = {
      indigo: '#e0e7ff',
      emerald: '#d1fae5',
      amber: '#fffbeb',
      rose: '#fff1f2',
      violet: '#f5f3ff',
      sky: '#eff6ff'
    };
    accountList.innerHTML = accounts
      .map(acc => {
        const bgColor = colorMap[acc.color] || '#e0e7ff';
        return `
          <div class="rounded-3xl border border-slate-100 p-4 bg-slate-50 flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style="background:${bgColor};">${acc.icon}</div>
              <div>
                <p class="font-semibold text-gray-900">${acc.name}</p>
                <p class="text-xs text-gray-500">Solde estimé : ${formatCurrency(balances[acc.id] || 0)}</p>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  const categoryList = document.getElementById('categories-list');
  if (!categories.length) {
    categoryList.innerHTML = '<p class="text-gray-400">Aucune catégorie définie.</p>';
  } else {
    categoryList.innerHTML = categories
      .map(cat => `
        <div class="rounded-3xl border border-slate-100 p-4 bg-slate-50 flex items-center justify-between gap-4">
          <div>
            <p class="font-semibold text-gray-900">${cat.icon} ${cat.name}</p>
            <p class="text-xs text-gray-500">${cat.parent}</p>
          </div>
        </div>`)
      .join('');
  }
}

function renderProjectsPage() {
  const projects = loadData(STORAGE_KEYS.projects);
  const accounts = loadData(STORAGE_KEYS.accounts);
  document.getElementById('projects-count').textContent = `${projects.length} projet(s)`;
  const accountSelect = document.getElementById('p-account');
  accountSelect.innerHTML = accounts.length
    ? accounts.map(acc => `<option value="${acc.id}">${acc.icon} ${acc.name}</option>`).join('')
    : '<option value="" disabled>Aucun compte disponible</option>';

  const list = document.getElementById('projects-list');
  if (!projects.length) {
    list.innerHTML = '<p class="text-gray-400">Aucun projet lancé.</p>';
    return;
  }
  list.innerHTML = projects
    .map(project => {
      const account = accounts.find(acc => acc.id === project.accountId);
      const daily = calculateProjectEffort(project);
      return `
        <div class="rounded-3xl border border-slate-100 p-5 bg-slate-50">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div>
              <p class="text-lg font-semibold text-gray-900">${project.name}</p>
              <p class="text-xs text-gray-500">${account ? `${account.icon} ${account.name}` : 'Compte non défini'}</p>
            </div>
            <span class="text-xs uppercase tracking-widest text-indigo-500">${formatDate(project.deadline)}</span>
          </div>
          <div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <div class="rounded-3xl bg-white border border-gray-100 p-4">
              <p class="font-semibold text-gray-900">Cible</p>
              <p>${formatCurrency(project.target)}</p>
            </div>
            <div class="rounded-3xl bg-white border border-gray-100 p-4">
              <p class="font-semibold text-gray-900">Effort quotidien</p>
              <p>${formatCurrency(daily)}</p>
            </div>
          </div>
        </div>`;
    })
    .join('');
}

function renderDebtsPage() {
  const debts = loadData(STORAGE_KEYS.debts);
  const accounts = loadData(STORAGE_KEYS.accounts);
  document.getElementById('debts-count').textContent = `${debts.length} dette(s)`;
  const accountSelect = document.getElementById('d-account');
  accountSelect.innerHTML = accounts.length
    ? accounts.map(acc => `<option value="${acc.id}">${acc.icon} ${acc.name}</option>`).join('')
    : '<option value="" disabled>Aucun compte disponible</option>';

  const list = document.getElementById('debts-list');
  if (!debts.length) {
    list.innerHTML = '<p class="text-gray-400">Aucune dette enregistrée.</p>';
    return;
  }

  list.innerHTML = debts
    .map(debt => {
      const account = accounts.find(acc => acc.id === debt.accountId);
      const summary = calculateDebtSummary(debt);
      return `
        <div class="rounded-3xl border border-slate-100 p-5 bg-slate-50">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <p class="font-semibold text-gray-900">${debt.name} (${debt.type === 'loan' ? 'Prêt' : 'Emprunt'})</p>
              <p class="text-xs text-gray-500">${account ? `${account.icon} ${account.name}` : 'Compte non défini'} • ${formatDate(debt.date)}</p>
            </div>
            <span class="text-xs uppercase tracking-widest text-indigo-500">Restant ${formatCurrency(summary.remaining)}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600 mb-4">
            <div class="rounded-3xl bg-white border border-gray-100 p-4">
              <p class="font-semibold text-gray-900">Montant</p>
              <p>${formatCurrency(summary.total)}</p>
            </div>
            <div class="rounded-3xl bg-white border border-gray-100 p-4">
              <p class="font-semibold text-gray-900">Remboursé</p>
              <p>${formatCurrency(summary.repaid)}</p>
            </div>
            <div class="rounded-3xl bg-white border border-gray-100 p-4">
              <p class="font-semibold text-gray-900">Restant</p>
              <p>${formatCurrency(summary.remaining)}</p>
            </div>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input id="rep-amount-${debt.id}" type="number" min="1" placeholder="Montant"
                class="rounded-2xl border border-gray-200 px-4 py-3 text-sm w-full" />
              <input id="rep-date-${debt.id}" type="date"
                class="rounded-2xl border border-gray-200 px-4 py-3 text-sm w-full" />
              <input id="rep-note-${debt.id}" type="text" placeholder="Note (facultatif)"
                class="rounded-2xl border border-gray-200 px-4 py-3 text-sm w-full" />
            </div>
            <button onclick="addRepayment('${debt.id}')" class="w-full md:w-auto px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-semibold transition">Ajouter remboursement</button>
          </div>
          ${debt.repayments && debt.repayments.length ? `
            <div class="mt-5 rounded-3xl bg-white border border-gray-100 p-4">
              <p class="text-sm font-semibold text-gray-900 mb-3">Historique des remboursements</p>
              <div class="space-y-2 text-sm text-gray-600">
                ${debt.repayments.map(rep => `
                  <div class="rounded-2xl bg-slate-50 p-3">
                    <p class="font-medium">${formatCurrency(rep.amount)} • ${formatDate(rep.date)}</p>
                    <p class="text-xs text-gray-500">${rep.note || 'Sans note'}</p>
                  </div>`).join('')}
              </div>
            </div>` : ''}
        </div>`;
    })
    .join('');
}

function renderDashboard() {
  const accounts = loadData(STORAGE_KEYS.accounts);
  const categories = loadData(STORAGE_KEYS.categories);
  const transactions = loadData(STORAGE_KEYS.transactions);
  const projects = loadData(STORAGE_KEYS.projects);
  const debts = loadData(STORAGE_KEYS.debts);

  document.getElementById('dashboard-accounts-count').textContent = accounts.length;
  document.getElementById('dashboard-categories-count').textContent = categories.length;
  document.getElementById('dashboard-projects-count').textContent = projects.length;
  document.getElementById('dashboard-debts-count').textContent = debts.length;
  document.getElementById('dashboard-total-balance').textContent = formatCurrency(Object.values(getBalances()).reduce((sum, value) => sum + value, 0));

  renderChartData(transactions, categories, accounts);
}

function cleanupChart(id) {
  if (CHART_INSTANCES[id]) {
    CHART_INSTANCES[id].destroy();
    CHART_INSTANCES[id] = null;
  }
}

function renderChartData(transactions, categories, accounts) {
  const chartFluxEl = document.getElementById('chart-flux');
  const chartCatEl = document.getElementById('chart-cat');
  const chartAccountsEl = document.getElementById('chart-accounts');

  if (chartFluxEl) {
    cleanupChart('flux');
    const grouped = { incomes: 0, expenses: 0 };
    transactions.forEach(tx => {
      const amount = parseAmount(tx.amount);
      if (tx.type === 'income' || tx.type === 'borrow') grouped.incomes += amount;
      else grouped.expenses += amount;
    });
    CHART_INSTANCES.flux = new Chart(chartFluxEl, {
      type: 'bar',
      data: {
        labels: ['Entrées', 'Sorties'],
        datasets: [{ data: [grouped.incomes, grouped.expenses], backgroundColor: ['#34d399', '#fb7185'] }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  if (chartCatEl) {
    cleanupChart('cat');
    const totals = getCategoryTotals();
    const labels = Object.keys(totals).map(id => {
      const cat = categories.find(c => c.id === id);
      return cat ? `${cat.icon} ${cat.name}` : 'Autre';
    });
    const data = Object.values(totals);
    CHART_INSTANCES.cat = new Chart(chartCatEl, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: ['#6366f1', '#f97316', '#34d399', '#38bdf8', '#a855f7'] }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  if (chartAccountsEl) {
    cleanupChart('accounts');
    const balances = getBalances();
    const labels = accounts.map(acc => `${acc.icon} ${acc.name}`);
    const data = accounts.map(acc => balances[acc.id] || 0);
    CHART_INSTANCES.accounts = new Chart(chartAccountsEl, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Solde par compte', data, backgroundColor: '#818cf8', borderColor: '#6366f1', fill: true, tension: 0.4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: value => formatCurrency(value) } } } }
    });
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-3 shadow-xl text-sm text-white';
  toast.style.background = type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#334155';
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
