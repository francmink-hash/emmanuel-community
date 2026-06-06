/**
 * AUTH SYSTEM - ANTIGRAVITY STYLE
 * Gestion multi-compte sécurisée via localStorage
 */

const APP_NAME = window.location.pathname.split('/').slice(-2, -1)[0] || 'APP';
const STORAGE_KEY = `EMMANUEL_USERS_${APP_NAME.replace(/ /g, '_')}`;
const SESSION_KEY = `EMMANUEL_SESSION_${APP_NAME.replace(/ /g, '_')}`;

const auth = {
    // Initialisation : Créer l'admin par défaut s'il n'existe pas
    init() {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        // Recherche insensible à la casse pour éviter les doublons
        const adminExists = users.find(u => u.username.toLowerCase() === 'admin');
        const syncAdminExists = users.find(u => u.username.toLowerCase() === 'admin2');
        
        if (!adminExists) {
            users.unshift({
                username: 'admin',
                password: 'admin123',
                role: 'Administrateur',
                accountStatus: 'Approuvé',
                question: 'Système',
                answer: 'Origine',
                syncMode: false
            });
        }

        if (!syncAdminExists) {
            users.unshift({
                username: 'admin2',
                password: 'admin456',
                role: 'Administrateur',
                accountStatus: 'Approuvé',
                question: 'Système',
                answer: 'Origine',
                syncMode: true
            });
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    },

    // Inscription
    signup(username, password, question, answer) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        if (users.find(u => u.username === username)) return { success: false, msg: "Cet utilisateur existe déjà." };

        // Si un administrateur est connecté et crée un compte, on l'approuve automatiquement
        const current = this.getCurrentUser && this.getCurrentUser();
        const createdByAdmin = current && current.role === 'Administrateur';
        const accountStatus = createdByAdmin ? 'Approuvé' : 'En attente';

        users.push({ 
            username, 
            password, 
            question, 
            answer, 
            role: 'user', 
            accountStatus: accountStatus,
            syncMode: false
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
        return { success: true };
    },

    // Connexion
    login(username, password) {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        // Recherche insensible à la casse pour matcher "admin", "Admin", "ADMIN", etc.
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (!user) {
            return { success: false, msg: "❌ Cet identifiant n'existe pas." };
        }

        if (user.password !== password) {
            return { success: false, msg: "❌ Mot de passe incorrect." };
        }

        // Vérification du statut (sauf pour l'admin)
        if (user.role !== 'Administrateur' && user.accountStatus !== 'Approuvé') {
            return { 
                success: false, 
                msg: "⌛ Votre compte est toujours en attente de validation par l'Administrateur." 
            };
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        if (user.role === 'Administrateur' && user.syncMode === true) {
            try {
                window.dispatchEvent(new Event('admin-sync-session-opened'));
            } catch (e) {
                console.warn('Impossible d\'événément dispatch admin-sync-session-opened', e);
            }
        }
        return { success: true, user };
    },

    forceLogin(user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    },

    // Récupération de mot de passe
    getQuestion(username) {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        return user ? user.question : null;
    },

    resetPassword(username, answer, newPassword) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const index = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase() && u.answer.toLowerCase() === answer.toLowerCase());
        
        if (index !== -1) {
            users[index].password = newPassword;
            const updatedUser = users[index];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
            return updatedUser; // Retourner l'utilisateur mis à jour
        }
        return null;
    },

    // Session
    getCurrentUser() {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
    },

    logout() {
        localStorage.removeItem(SESSION_KEY);
        window.location.href = 'login.html';
    },

    checkAccess() {
        const user = this.getCurrentUser();
        const isLogin = window.location.pathname.includes('login.html');
        if (!user && !isLogin) {
            window.location.href = 'login.html';
        }
    },

    checkAdmin() {
        const user = this.getCurrentUser();
        if (!user || user.role !== 'Administrateur') {
            // Redirection silencieuse — pas d'alerte, l'utilisateur lambda
            // ne doit jamais voir ces pages ni savoir qu'elles existent.
            window.location.href = 'index.html';
        }
    },

    // ADMIN TOOLS
    getAllUsers() {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        return users.filter(u => u.role !== 'Administrateur');
    },

    getPendingUsers() {
        const users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        return users.filter(u => u.role !== 'Administrateur' && u.accountStatus === 'En attente');
    },

    approveUser(username) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const index = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
        if (index !== -1) {
            users[index].accountStatus = 'Approuvé';
            localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
            return true;
        }
        return false;
    },

    deleteUser(username) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    },

    updateUserPassword(username, newPassword) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const index = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
        if (index !== -1) {
            users[index].password = newPassword;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
        }
    },

    migrateUser(oldUsername, newUsername) {
        let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const index = users.findIndex(u => u.username.toLowerCase() === oldUsername.toLowerCase());
        if (index !== -1) {
            users[index].username = newUsername;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
            return true;
        }
        return false;
    }
};

auth.init();
