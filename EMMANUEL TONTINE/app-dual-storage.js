/*
 * app-dual-storage.js — EMMANUEL TONTINE
 * Stockage double : API locale (localhost) ↔ localStorage isolé (internet)
 */

let isLocalhost = false;
let useLocalStorage = true;

function detectEnvironment() {
    const hostname = window.location.hostname;
    isLocalhost = (hostname === 'localhost' || hostname === '127.0.0.1');
    useLocalStorage = !isLocalhost;
    console.log(`[DualStorage] Mode: ${isLocalhost ? 'LOCAL (API fichier JSON)' : 'INTERNET (localStorage)'}`);
}

// ── API (mode local) ──────────────────────────────────────────────────────────

async function loadDataFromAPI() {
    try {
        const res = await fetch('/api/data-tontine');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } catch (e) {
        console.error('[DualStorage] Erreur chargement API:', e);
        return null;
    }
}

async function saveDataToAPI(data) {
    try {
        const res = await fetch('/api/data-tontine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        console.log('[DualStorage] Données sauvegardées dans data-tontine.json');
        return true;
    } catch (e) {
        console.error('[DualStorage] Erreur sauvegarde API:', e);
        return false;
    }
}

// ── localStorage isolé par utilisateur (mode internet) ───────────────────────

// Lit le username brut depuis la SESSION_KEY de auth.js sans passer par auth
// pour éviter tout risque de lecture d'une session écrasée par un autre utilisateur.
function getRawUsername() {
    // SESSION_KEY dans auth.js = `EMMANUEL_SESSION_${APP_NAME}`
    // On parcourt toutes les clés du localStorage pour trouver celle qui correspond.
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('EMMANUEL_SESSION_')) {
            try {
                const session = JSON.parse(localStorage.getItem(k));
                if (session && session.username) return session.username;
            } catch (e) { /* clé corrompue, on continue */ }
        }
    }
    return null;
}

// Clé strictement unique par username exact : "tontine_data_admin", "tontine_data_admin2", etc.
// La casse originale est préservée pour garantir l'unicité même entre "Admin" et "admin2".
function getUserStorageKey() {
    const username = getRawUsername();
    if (username) {
        // On normalise uniquement les espaces (remplacés par _), la casse reste intacte
        return 'tontine_data_' + username.replace(/\s+/g, '_');
    }
    return 'tontine_data_default';
}

// Structure plate identique à celle du serveur — une seule clé par utilisateur
function loadDataFromLocalStorage() {
    try {
        const key = getUserStorageKey();
        const raw = localStorage.getItem(key);
        if (raw) {
            const data = JSON.parse(raw);
            console.log('[DualStorage] Données chargées depuis localStorage, clé:', key);
            return data;
        }
    } catch (e) {
        console.error('[DualStorage] Erreur chargement localStorage:', e);
    }
    return null;
}

function saveDataToLocalStorage(data) {
    try {
        const key = getUserStorageKey();
        localStorage.setItem(key, JSON.stringify(data));
        console.log('[DualStorage] Données sauvegardées dans localStorage, clé:', key);
        return true;
    } catch (e) {
        console.error('[DualStorage] Erreur sauvegarde localStorage:', e);
        return false;
    }
}

// ── Structure de données par défaut ──────────────────────────────────────────

function defaultData() {
    return {
        nomAsso: '', explicationAsso: '',
        sessionActuelle: 1, reunionActuelle: 1,
        membres: [], comptabilite: {}, depenses: [], reunionsHistorique: [],
        config_caisses: [], config_amendes: [],
        reglement_interieur: "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur."
    };
}

// ── Chargement principal ──────────────────────────────────────────────────────

async function loadDualStorageData() {
    detectEnvironment();

    let data = isLocalhost ? await loadDataFromAPI() : loadDataFromLocalStorage();
    if (!data) data = defaultData();

    // Injecter dans les variables globales de app.js
    if (typeof associationData !== 'undefined') {
        associationData.nomAsso            = data.nomAsso            || '';
        associationData.explicationAsso    = data.explicationAsso    || '';
        associationData.sessionActuelle    = data.sessionActuelle    || 1;
        associationData.reunionActuelle    = data.reunionActuelle    || 1;
        associationData.membres            = data.membres            || [];
        associationData.comptabilite       = data.comptabilite       || {};
        associationData.depenses           = data.depenses           || [];
        associationData.reunionsHistorique = data.reunionsHistorique || [];
    }
    if (typeof configCaisses !== 'undefined') {
        configCaisses.length = 0;
        configCaisses.push(...(data.config_caisses || []));
    }
    if (typeof configAmendes !== 'undefined') {
        configAmendes.length = 0;
        configAmendes.push(...(data.config_amendes || []));
    }
    if (typeof reglementInterieur !== 'undefined') {
        reglementInterieur = data.reglement_interieur || '';
    }

    document.dispatchEvent(new CustomEvent('dataLoaded', { detail: data }));
    return data;
}

// ── Sauvegarde principale ─────────────────────────────────────────────────────

async function saveDualStorageData() {
    detectEnvironment();

    const data = {
        nomAsso:            typeof associationData !== 'undefined' ? (associationData.nomAsso            || '') : '',
        explicationAsso:    typeof associationData !== 'undefined' ? (associationData.explicationAsso    || '') : '',
        sessionActuelle:    typeof associationData !== 'undefined' ? (associationData.sessionActuelle    || 1)  : 1,
        reunionActuelle:    typeof associationData !== 'undefined' ? (associationData.reunionActuelle    || 1)  : 1,
        membres:            typeof associationData !== 'undefined' ? (associationData.membres            || []) : [],
        comptabilite:       typeof associationData !== 'undefined' ? (associationData.comptabilite       || {}) : {},
        depenses:           typeof associationData !== 'undefined' ? (associationData.depenses           || []) : [],
        reunionsHistorique: typeof associationData !== 'undefined' ? (associationData.reunionsHistorique || []) : [],
        config_caisses:     typeof configCaisses    !== 'undefined' ? configCaisses                            : [],
        config_amendes:     typeof configAmendes    !== 'undefined' ? configAmendes                            : [],
        reglement_interieur: typeof reglementInterieur !== 'undefined'
            ? reglementInterieur
            : "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur."
    };

    return isLocalhost ? saveDataToAPI(data) : saveDataToLocalStorage(data);
}

// ── Patch des fonctions de sauvegarde de app.js ───────────────────────────────
// Exécuté de façon SYNCHRONE — aucun setTimeout, aucune fenêtre de vulnérabilité

function patchSaveFunctions() {
    detectEnvironment();

    window.sauvegarder = async function() {
        await saveDualStorageData();
    };

    window.sauvegarderCaisses = async function() {
        await saveDualStorageData();
    };

    window.sauvegarderAmendes = async function() {
        await saveDualStorageData();
    };

    window.sauvegarderReglement = async function(texte) {
        reglementInterieur = texte;
        await saveDualStorageData();
    };

    console.log('[DualStorage] Fonctions de sauvegarde patchées (synchrone).');
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function initializeDualStorage() {
    patchSaveFunctions();       // 1. Patch immédiat et synchrone
    await loadDualStorageData(); // 2. Chargement des données
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDualStorage);
} else {
    initializeDualStorage();
}

// ── Téléchargement JSON (admin) ───────────────────────────────────────────────

window.downloadJsonData = async function() {
    try {
        const res = await fetch('/api/data-tontine');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'data-tontine.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } catch (e) {
        console.error('[DualStorage] Erreur téléchargement:', e);
        alert('Erreur lors du téléchargement du fichier JSON');
    }
};

// ── API publique ──────────────────────────────────────────────────────────────

window.dualStorage = {
    loadData:        loadDualStorageData,
    saveData:        saveDualStorageData,
    isLocalhost:     () => isLocalhost,
    getUserKey:      getUserStorageKey
};
