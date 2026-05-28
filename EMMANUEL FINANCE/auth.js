/**
 * AUTH SYSTEM — EMMANUEL FINANCE
 * Principe : autonomie totale, cloisonnement étanche par utilisateur.
 *
 * Chaque utilisateur possède son propre espace de données dans localStorage.
 * Les clés de données sont préfixées par l'ID de profil unique :
 *   ef_<profileId>_accounts
 *   ef_<profileId>_transactions
 *   ef_<profileId>_categories
 *   ef_<profileId>_projects
 *   ef_<profileId>_debts
 *
 * app.js lit getActiveProfileId() pour construire ces clés.
 * auth.js garantit que getActiveProfileId() retourne toujours
 * le bon profileId UUID lié à l'utilisateur connecté.
 */

const APP_NAME   = window.location.pathname.split('/').slice(-2, -1)[0] || 'APP';
const STORAGE_KEY = `EMMANUEL_USERS_${APP_NAME.replace(/ /g, '_')}`;
const SESSION_KEY = `EMMANUEL_SESSION_${APP_NAME.replace(/ /g, '_')}`;

// Clés partagées avec app.js (ne pas modifier ces noms)
const EF_PROFILES_KEY = 'ef_profiles';
const EF_ACTIVE_KEY   = 'ef_activeProfileId';

const auth = {

    // ── Initialisation : admin par défaut ──────────────────────────
    init() {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        if (!users.find(u => u.username === 'admin')) {
            users.push({
                username: 'admin',
                password: 'admin123',
                role:     'admin',
                question: 'Système',
                answer:   'Origine'
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
        }
    },

    // ── Inscription ────────────────────────────────────────────────
    signup(username, password, question, answer) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return { success: false, msg: 'Cet utilisateur existe déjà.' };
        }
        users.push({ username, password, question, answer, role: 'user' });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
        return { success: true };
    },

    // ── Connexion ──────────────────────────────────────────────────
    // Synchronise le profileId UUID de app.js avec la session auth.
    // Garantit que loadData() / saveData() de app.js lisent les bonnes clés.
    login(username, password) {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const user  = users.find(u => u.username === username && u.password === password);
        if (!user) return { success: false, msg: 'Identifiants incorrects.' };

        // 1. Sauvegarder la session auth
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));

        // 2. Synchroniser avec le système de profils de app.js
        //    Chercher ou créer un profil app.js pour cet utilisateur
        let profiles = JSON.parse(localStorage.getItem(EF_PROFILES_KEY)) || [];
        let profile  = profiles.find(p => p.username.toLowerCase() === username.toLowerCase());

        if (!profile) {
            // Créer un nouveau profil avec un ID stable basé sur le username
            // On utilise le username comme ID pour garantir la stabilité entre sessions
            const profileId = 'user_' + username.toLowerCase().replace(/\s+/g, '_');
            profile = {
                id:           profileId,
                username:     username,
                passwordHash: btoa(password),
                retain:       true
            };
            profiles.push(profile);
            localStorage.setItem(EF_PROFILES_KEY, JSON.stringify(profiles));
        }

        // 3. Activer ce profil pour app.js
        localStorage.setItem(EF_ACTIVE_KEY, profile.id);

        return { success: true, user };
    },

    // ── Récupération de mot de passe ───────────────────────────────
    getQuestion(username) {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const user  = users.find(u => u.username === username);
        return user ? user.question : null;
    },

    resetPassword(username, answer, newPassword) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const idx = users.findIndex(
            u => u.username === username &&
                 u.answer.toLowerCase() === answer.toLowerCase()
        );
        if (idx === -1) return false;

        users[idx].password = newPassword;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));

        // Mettre à jour le hash dans ef_profiles pour cohérence
        let profiles = JSON.parse(localStorage.getItem(EF_PROFILES_KEY)) || [];
        const pIdx   = profiles.findIndex(
            p => p.username.toLowerCase() === username.toLowerCase()
        );
        if (pIdx !== -1) {
            profiles[pIdx].passwordHash = btoa(newPassword);
            localStorage.setItem(EF_PROFILES_KEY, JSON.stringify(profiles));
        }

        return true;
    },

    // ── Session ────────────────────────────────────────────────────
    getCurrentUser() {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
    },

    logout() {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EF_ACTIVE_KEY);
        window.location.href = 'login.html';
    },

    checkAccess() {
        if (!this.getCurrentUser() && !window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    },

    // ── Outils admin (gestion des comptes depuis index.html) ───────
    getAllUsers() {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        return users.filter(u => u.role !== 'admin');
    },

    deleteUser(username) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        users = users.filter(u => u.username !== username);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));

        // Supprimer aussi le profil app.js associé
        let profiles = JSON.parse(localStorage.getItem(EF_PROFILES_KEY)) || [];
        profiles = profiles.filter(
            p => p.username.toLowerCase() !== username.toLowerCase()
        );
        localStorage.setItem(EF_PROFILES_KEY, JSON.stringify(profiles));
    },

    updateUserPassword(username, newPassword) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const idx = users.findIndex(u => u.username === username);
        if (idx !== -1) {
            users[idx].password = newPassword;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
        }

        // Mettre à jour le hash dans ef_profiles
        let profiles = JSON.parse(localStorage.getItem(EF_PROFILES_KEY)) || [];
        const pIdx   = profiles.findIndex(
            p => p.username.toLowerCase() === username.toLowerCase()
        );
        if (pIdx !== -1) {
            profiles[pIdx].passwordHash = btoa(newPassword);
            localStorage.setItem(EF_PROFILES_KEY, JSON.stringify(profiles));
        }
    }
};

auth.init();
