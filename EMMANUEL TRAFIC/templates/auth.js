/**
 * AUTH — Emmanuel Trafic (clé fixe, pas de dépendance au chemin URL)
 */
const APP_ID = 'EMMANUEL_TRAFIC';
const STORAGE_KEY = `EMMANUEL_USERS_${APP_ID}`;
const SESSION_KEY = `EMMANUEL_SESSION_${APP_ID}`;
const IS_HTTP = window.location.protocol.startsWith('http');
const LOGIN_URL = IS_HTTP ? '/login' : 'login.html';
const HOME_URL = IS_HTTP ? '/' : 'index.html';

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

const auth = {
  init() {
    let users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(users)) users = [];
    if (!users.find(u => u.username === 'admin')) {
      users.push({
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        question: 'Système',
        answer: 'Origine'
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    }
  },

  signup(username, password, question, answer) {
    const name = (username || '').trim();
    if (!name || !password) return { success: false, msg: 'Identifiant et mot de passe requis.' };
    if (password.length < 4) return { success: false, msg: 'Mot de passe : 4 caractères minimum.' };
    let users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    if (users.find(u => u.username.toLowerCase() === name.toLowerCase())) {
      return { success: false, msg: 'Cet utilisateur existe déjà.' };
    }
    users.push({ username: name, password, question, answer, role: 'user' });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    } catch {
      return { success: false, msg: 'Stockage navigateur bloqué.' };
    }
    return { success: true };
  },

  login(username, password) {
    const name = (username || '').trim();
    let users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    const user = users.find(
      u => u.username.toLowerCase() === name.toLowerCase() && u.password === password
    );
    if (!user) return { success: false, msg: 'Identifiants incorrects.' };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      return { success: false, msg: 'Stockage navigateur bloqué.' };
    }
    return { success: true, user };
  },

  getQuestion(username) {
    const users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    const user = users.find(u => u.username.toLowerCase() === (username || '').toLowerCase());
    return user ? user.question : null;
  },

  resetPassword(username, answer, newPassword) {
    let users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    const idx = users.findIndex(
      u => u.username.toLowerCase() === (username || '').toLowerCase() &&
           u.answer.toLowerCase() === (answer || '').toLowerCase()
    );
    if (idx === -1) return false;
    users[idx].password = newPassword;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    return true;
  },

  getCurrentUser() {
    const u = safeParse(localStorage.getItem(SESSION_KEY), null);
    return u && u.username ? u : null;
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = LOGIN_URL;
  },

  checkAccess() {
    const onLogin = window.location.pathname.includes('login');
    if (!this.getCurrentUser() && !onLogin) {
      window.location.href = LOGIN_URL;
    }
    if (this.getCurrentUser() && onLogin) {
      window.location.href = HOME_URL;
    }
  },

  getAllUsers() {
    return safeParse(localStorage.getItem(STORAGE_KEY), []).filter(u => u.role !== 'admin');
  },

  deleteUser(username) {
    let users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    users = users.filter(u => u.username !== username);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  },

  updateUserPassword(username, newPassword) {
    let users = safeParse(localStorage.getItem(STORAGE_KEY), []);
    const idx = users.findIndex(u => u.username === username);
    if (idx !== -1) {
      users[idx].password = newPassword;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    }
  }
};

auth.init();
