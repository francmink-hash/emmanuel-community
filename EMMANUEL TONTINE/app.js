/**
 * APP.JS — EMMANUEL TONTINE
 * Moteur de données 100% dynamique. Rien n'est écrit en dur.
 * Toute la configuration est pilotée par l'Administrateur via localStorage.
 *
 * STRUCTURE LOCALSTORAGE :
 *   apbmData            → données de l'association (membres, sessions, comptabilité)
 *   config_caisses      → tableau des caisses créées par l'admin
 *   config_amendes      → tableau des infractions (financières ou en nature)
 *   reglement_interieur → texte du règlement rédigé par l'admin
 *
 * TYPES DE CAISSES :
 *   'fixe'      → cotisation identique chaque réunion (ex: 5 000 FCFA)
 *   'evolutive' → cotisation = base + (réunion-1) × incrément
 *                 Une session = ensemble de réunions (durée = nombre de membres)
 *   'parts'     → le membre choisit librement son nombre de parts ;
 *                 montant = partsChoisies × valeurPart
 *                 partsChoisies est stocké dans membre.parts[caisseId]
 */

// ─────────────────────────────────────────────
// 1. DONNÉES PRINCIPALES DE L'ASSOCIATION
// ─────────────────────────────────────────────
let associationData = JSON.parse(localStorage.getItem(getAdminKey('apbmData'))) || {
    nomAsso: '',          // Vide par défaut — l'admin doit le saisir
    explicationAsso: '',  // Explication libre (ex: lignée, famille) sous le nom
    sessionActuelle: 1,
    reunionActuelle: 1,
    membres: [],
    comptabilite: {},      // Totaux par caisse, calculés dynamiquement
    depenses: [],          // Historique des dépenses enregistrées
    reunionsHistorique: [] // Historique des réunions mensuelles avec PV attaché
};

// Garde-fous de migration (données existantes)
if (!associationData.nomAsso)        associationData.nomAsso = '';
if (!associationData.explicationAsso) associationData.explicationAsso = '';
if (!associationData.sessionActuelle) associationData.sessionActuelle = 1;
if (!associationData.reunionActuelle) associationData.reunionActuelle = 1;
if (!associationData.membres)         associationData.membres = [];
if (!associationData.comptabilite)    associationData.comptabilite = {};
if (!associationData.depenses)        associationData.depenses = [];
if (!associationData.reunionsHistorique) associationData.reunionsHistorique = [];

// ─────────────────────────────────────────────
// 2. MODULE 1 — CONFIGURATION DES CAISSES
//    Chaque caisse : { id, nom, type, cotisation, base, increment, valeurPart }
//    type : 'fixe' | 'evolutive' | 'parts'
//    Si evolutive : { base, increment }
//    Si parts     : { valeurPart } — le membre choisit son nombre de parts
//    
//    DURÉE D'UNE SESSION = NOMBRE DE RÉUNIONS = NOMBRE DE MEMBRES
//    L'incrément se calcule par réunion (reunion 1, reunion 2, ... jusqu'au nombre de membres)
// ─────────────────────────────────────────────
// Aucune caisse par défaut — l'Admin crée chaque caisse manuellement via config.html
let configCaisses = JSON.parse(localStorage.getItem(getAdminKey('config_caisses'))) || [];

// ─────────────────────────────────────────────
// 3. MODULE 2 — CONFIGURATION DES AMENDES HYBRIDES
//    Chaque amende : { id, libelle, typeAmende, valeur }
//    typeAmende : 'financier' | 'nature'
//    valeur : montant (number) si financier, description (string) si nature
// ─────────────────────────────────────────────
// Aucune amende par défaut — l'Admin crée chaque infraction manuellement via config.html
let configAmendes = JSON.parse(localStorage.getItem(getAdminKey('config_amendes'))) || [];

// ─────────────────────────────────────────────
// 4. MODULE 3 — RÈGLEMENT INTÉRIEUR
//    Texte libre rédigé par l'admin, affiché en lecture seule pour les membres
// ─────────────────────────────────────────────
let reglementInterieur = localStorage.getItem(getAdminKey('reglement_interieur')) ||
    "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur.";

// ─────────────────────────────────────────────
// 5. FONCTIONS DE PERSISTANCE
// ─────────────────────────────────────────────
// Les clés JSONBin sont stockées côté serveur dans .env. Le client appelle
// l'endpoint local `/api/jsonbin` pour lire/écrire la bin de manière sécurisée.
const JSONBIN_API = '/api/jsonbin';
let sharedDataCache = null;

function getCurrentAdminId() {
    if (typeof auth === 'undefined') return 'default';
    const currentUser = auth.getCurrentUser();
    return currentUser ? currentUser.username : 'default';
}

function getAdminKey(baseKey) {
    const adminId = getCurrentAdminId();
    return `${adminId}_${baseKey}`;
}

function isSyncAdmin() {
    if (typeof auth === 'undefined') return false;
    const currentUser = auth.getCurrentUser();
    return currentUser && currentUser.role === 'Administrateur' && currentUser.syncMode === true;
}

function buildSharedDataRecord() {
    return {
        associationData,
        configCaisses,
        configAmendes,
        reglementInterieur,
        tontinePaiements: JSON.parse(localStorage.getItem(getAdminKey('TONTINE_PAIEMENTS'))) || [],
        tontineMur: JSON.parse(localStorage.getItem(getAdminKey('TONTINE_MUR'))) || []
    };
}

async function fetchSharedTontineData() {
    const response = await fetch(JSONBIN_API, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Lecture JSONBin impossible (${response.status})`);
    const body = await response.json();
    // Lorsque la proxy renvoie la structure JSONBin, elle contient "record"
    return body.record || body || {};
}

async function saveSharedTontineData(record) {
    const response = await fetch(JSONBIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
    });
    if (!response.ok) throw new Error(`Écriture JSONBin impossible (${response.status})`);
    return response.json();
}

async function loadSharedTontineData() {
    if (!isSyncAdmin()) return false;
    try {
        const record = await fetchSharedTontineData();
        sharedDataCache = record;

        associationData = record.associationData || associationData;
        // Ne remplacer les caisses que si JSONBin en a (éviter de perdre locales avec un array vide)
        if (record.configCaisses && record.configCaisses.length > 0) {
            configCaisses = record.configCaisses;
        }
        configAmendes = record.configAmendes || configAmendes;
        reglementInterieur = record.reglementInterieur || reglementInterieur;
        // Écrire une copie locale de secours *sauf* si des changements locaux
        // non synchronisés existent (flag JSONBIN_DIRTY). Cela permet à
        // l'admin en mode sync de continuer à travailler hors-ligne.
        const dirty = !!localStorage.getItem(getAdminKey('JSONBIN_DIRTY'));
        if (!dirty) {
            localStorage.setItem(getAdminKey('TONTINE_PAIEMENTS'), JSON.stringify(record.tontinePaiements || getTontinePayments()));
            localStorage.setItem(getAdminKey('TONTINE_MUR'), JSON.stringify(record.tontineMur || getTontineMur()));
            localStorage.setItem(getAdminKey('apbmData'), JSON.stringify(record.associationData || associationData));
            localStorage.setItem(getAdminKey('config_caisses'), JSON.stringify(configCaisses));
            localStorage.setItem(getAdminKey('config_amendes'), JSON.stringify(record.configAmendes || configAmendes));
            if (record.reglementInterieur) localStorage.setItem(getAdminKey('reglement_interieur'), record.reglementInterieur);
        }

        refreshSharedState();
        return true;
    } catch (err) {
        console.warn('Synchronisation JSONBin échouée :', err);
        return false;
    }
}

async function persistSharedData() {
    if (!isSyncAdmin()) return;
    try {
        sharedDataCache = buildSharedDataRecord();
        await saveSharedTontineData(sharedDataCache);
        // Si succès, effacer les marqueurs de sync pendante
        localStorage.removeItem(getAdminKey('JSONBIN_DIRTY'));
        localStorage.removeItem(getAdminKey('hasPendingSync'));
    } catch (err) {
        console.warn('Enregistrement JSONBin impossible :', err);
        // Marquer comme dirty / pending pour réessayer plus tard
        localStorage.setItem(getAdminKey('JSONBIN_DIRTY'), '1');
        localStorage.setItem(getAdminKey('hasPendingSync'), '1');
    }
}

function getTontinePayments() {
    if (isSyncAdmin() && sharedDataCache?.tontinePaiements) return sharedDataCache.tontinePaiements;
    return JSON.parse(localStorage.getItem(getAdminKey('TONTINE_PAIEMENTS'))) || [];
}

function saveTontinePayments(paiements) {
    // Toujours écrire localement (sauvegarde de secours)
    localStorage.setItem(getAdminKey('TONTINE_PAIEMENTS'), JSON.stringify(paiements));
    if (isSyncAdmin()) {
        sharedDataCache = sharedDataCache || {};
        sharedDataCache.tontinePaiements = paiements;
        if (!navigator.onLine) {
            localStorage.setItem(getAdminKey('hasPendingSync'), '1');
            localStorage.setItem(getAdminKey('JSONBIN_DIRTY'), '1');
        }
        persistSharedData();
    }
}

function getTontineMur() {
    if (isSyncAdmin() && sharedDataCache?.tontineMur) return sharedDataCache.tontineMur;
    return JSON.parse(localStorage.getItem(getAdminKey('TONTINE_MUR'))) || [];
}

function saveTontineMur(wallMessages) {
    // Toujours écrire localement (sauvegarde de secours)
    localStorage.setItem(getAdminKey('TONTINE_MUR'), JSON.stringify(wallMessages));
    if (isSyncAdmin()) {
        sharedDataCache = sharedDataCache || {};
        sharedDataCache.tontineMur = wallMessages;
        if (!navigator.onLine) {
            localStorage.setItem(getAdminKey('hasPendingSync'), '1');
            localStorage.setItem(getAdminKey('JSONBIN_DIRTY'), '1');
        }
        persistSharedData();
    }
}

function refreshSharedState() {
    try {
        if (typeof appliquerNomAsso === 'function') appliquerNomAsso();
        if (typeof loadConfig === 'function') loadConfig();
        if (typeof renderDashboardCaisses === 'function') renderDashboardCaisses();
        if (typeof renderWall === 'function') {
            wallMessages = getTontineMur();
            renderWall();
        }
        if (typeof renderPaiements === 'function') renderPaiements();
        if (typeof chargerFinances === 'function') chargerFinances();
    } catch (e) {
        console.warn('refreshSharedState', e);
    }
}

function sauvegarder() {
    if (!isSyncAdmin()) {
        // Toujours écrire localement avec clé admin-spécifique
        localStorage.setItem(getAdminKey('apbmData'), JSON.stringify(associationData));
    } else {
        sharedDataCache = sharedDataCache || {};
        sharedDataCache.associationData = associationData;
        persistSharedData();
    }
}

function sauvegarderCaisses() {
    if (!isSyncAdmin()) {
        // Toujours écrire localement avec clé admin-spécifique
        localStorage.setItem(getAdminKey('config_caisses'), JSON.stringify(configCaisses));
    } else {
        sharedDataCache = sharedDataCache || {};
        sharedDataCache.configCaisses = configCaisses;
        persistSharedData();
    }
}

function sauvegarderAmendes() {
    if (!isSyncAdmin()) {
        // Toujours écrire localement avec clé admin-spécifique
        localStorage.setItem(getAdminKey('config_amendes'), JSON.stringify(configAmendes));
    } else {
        sharedDataCache = sharedDataCache || {};
        sharedDataCache.configAmendes = configAmendes;
        persistSharedData();
    }
}

function sauvegarderReglement(texte) {
    reglementInterieur = texte;
    if (!isSyncAdmin()) {
        // Toujours écrire localement avec clé admin-spécifique
        localStorage.setItem(getAdminKey('reglement_interieur'), texte);
    } else {
        sharedDataCache = sharedDataCache || {};
        sharedDataCache.reglementInterieur = texte;
        persistSharedData();
    }
}

window.loadSharedTontineData = loadSharedTontineData;
window.getTontinePayments = getTontinePayments;
window.saveTontinePayments = saveTontinePayments;
window.getTontineMur = getTontineMur;
window.saveTontineMur = saveTontineMur;
window.isSyncAdmin = isSyncAdmin;
window.refreshSharedState = refreshSharedState;

window.addEventListener('load', () => {
    if (isSyncAdmin()) loadSharedTontineData();
});

// Réessayer la synchronisation automatique lorsque la connexion revient
window.addEventListener('online', () => {
    if (isSyncAdmin() && localStorage.getItem(getAdminKey('hasPendingSync'))) {
        persistSharedData();
    }
});

window.addEventListener('admin-sync-session-opened', async () => {
    if (!navigator.onLine || !isSyncAdmin()) return;
    
    // D'abord, charger les données depuis JSONBin
    const loaded = await loadSharedTontineData();
    
    // Si les données sont arrivées vides mais on a des caisses locales,
    // synchroniser les caisses locales vers JSONBin
    if (loaded && (!sharedDataCache?.configCaisses || sharedDataCache.configCaisses.length === 0) && configCaisses.length > 0) {
        persistSharedData();
    }
    
    // Si des changements sont en attente, envoyer
    if (localStorage.getItem(getAdminKey('hasPendingSync'))) {
        persistSharedData();
    }
});

// Tentative périodique de synchronisation si des changements locaux sont marqués dirty
setInterval(() => {
    if (navigator.onLine && isSyncAdmin() && localStorage.getItem(getAdminKey('JSONBIN_DIRTY'))) {
        persistSharedData();
    }
}, 60 * 1000); // toutes les 60s

// ─────────────────────────────────────────────
// 6. UTILITAIRES
// ─────────────────────────────────────────────
function formatAmount(value) {
    if (value === undefined || value === null) return '—';
    return Number(value).toLocaleString('fr-FR') + ' FCFA';
}

/**
 * Applique le nom et l'explication de l'association aux éléments correspondants du DOM.
 * Met à jour dynamiquement le titre et le sous-titre explicatif s'ils existent.
 * @returns {void}
 */
function appliquerNomAsso() {
    const nom = associationData.nomAsso || 'ASSOCIATION';
    document.querySelectorAll('.asso-name').forEach(el => el.textContent = nom);

    const explication = associationData.explicationAsso || '';
    const explicationDisplay = document.getElementById('asso-explication-display');
    if (explicationDisplay) {
        explicationDisplay.textContent = explication;
        explicationDisplay.style.display = explication ? 'block' : 'none';
    }
}

// ─────────────────────────────────────────────
// 7. MODULE 1 — GESTION DES CAISSES (CRUD)
// ─────────────────────────────────────────────

/**
 * Crée une nouvelle caisse
 * @param {string} nom
 * @param {string} type - 'fixe', 'evolutive' ou 'parts'
 * @param {number} base - montant de base (= cotisation si fixe, valeurPart si parts)
 * @param {number} increment - incrément par réunion (0 si fixe ou parts)
 * @param {boolean} [exclureCompta=false] - exclure de la comptabilité globale
 * @param {string} [periodicite='session'] - 'session' ou 'mensuelle' (non utilisé pour le calcul d'incrément)
 */
function creerCaisse(nom, type, base, increment, exclureCompta = false, periodicite = 'session', icone = '🏦') {
    const caisse = {
        id:          Date.now(),
        nom:         nom.trim(),
        type:        type,
        // Pour 'fixe' et 'evolutive' : cotisation = base
        cotisation:  type === 'parts' ? 0 : Number(base),
        base:        Number(base),
        increment:   type === 'evolutive' ? Number(increment) : 0,
        // Pour 'parts' : valeur d'une part
        valeurPart:  type === 'parts' ? Number(base) : 0,
        exclureCompta: !!exclureCompta,
        periodicite:  periodicite || 'session',
        icone:       icone || '🏦'
    };
    configCaisses.push(caisse);
    sauvegarderCaisses();
    associationData.comptabilite[caisse.id] = associationData.comptabilite[caisse.id] || 0;
    sauvegarder();
    return caisse;
}

/**
 * Modifie la cotisation d'une caisse existante
 */
function modifierCotisationCaisse(id, nouvelleBase, nouvelIncrement) {
    const caisse = configCaisses.find(c => c.id === id);
    if (!caisse) return;
    caisse.base = Number(nouvelleBase);
    caisse.cotisation = Number(nouvelleBase);
    caisse.increment = caisse.type === 'evolutive' ? Number(nouvelIncrement) : 0;
    sauvegarderCaisses();
}

/**
 * Supprime une caisse
 */
function supprimerCaisse(id) {
    configCaisses = configCaisses.filter(c => c.id !== id);
    sauvegarderCaisses();
}

/**
 * Calcule le montant dû pour une caisse à la réunion actuelle.
 * Une session = ensemble de réunions (durée = nombre de membres).
 * Pour les caisses de type 'parts', on passe le nombre de parts choisi.
 * @param {number} caisseId
 * @param {number} [nbParts=1] - utilisé uniquement si type === 'parts'
 */
function calculerCotisationCaisse(caisseId, nbParts) {
    const caisse = configCaisses.find(c => c.id === caisseId);
    if (!caisse) return 0;
    if (caisse.type === 'evolutive') {
        return caisse.base + ((associationData.reunionActuelle - 1) * caisse.increment);
    }
    if (caisse.type === 'parts') {
        const parts = Number(nbParts) || 1;
        return caisse.valeurPart * parts;
    }
    return caisse.cotisation;
}

/**
 * Retourne le nombre de parts choisies par un membre pour une caisse donnée.
 * Stocké dans membre.parts[caisseId]. Défaut : 1.
 */
function getPartsMembreCaisse(membre, caisseId) {
    if (!membre.parts) membre.parts = {};
    return membre.parts[caisseId] || 1;
}

/**
 * Enregistre le choix de parts d'un membre pour une caisse.
 * Calcule la cotisation en fonction de la réunion actuelle, mais la caisse est suivie par session.
 */
function setPartsMembreCaisse(membreId, caisseId, nbParts) {
    const membre = associationData.membres.find(m => m.id === membreId);
    const caisse = configCaisses.find(c => c.id === caisseId);
    if (!membre || !caisse || caisse.type !== 'parts') return;

    if (!membre.parts) membre.parts = {};
    membre.parts[caisseId] = Number(nbParts);

    // Mettre à jour la dette ouverte de cette caisse pour la session actuelle
    const motifSession = caisse.nom + ' — Session ' + associationData.sessionActuelle;
    const op = (membre.operations || []).find(
        o => o.destination === caisseId && o.statut === 'du' && o.motif === motifSession
    );
    if (op) {
        op.montant = calculerCotisationCaisse(caisseId, nbParts);
    }

    sauvegarder();
}

// ─────────────────────────────────────────────
// 8. MODULE 2 — GESTION DES AMENDES HYBRIDES (CRUD)
// ─────────────────────────────────────────────

/**
 * Crée une nouvelle infraction
 * @param {string} libelle
 * @param {string} typeAmende - 'financier' ou 'nature'
 * @param {number|string} valeur - montant si financier, description si nature
 * @param {number|string} [caisseId=null] - la caisse réceptrice si financier
 */
function creerAmende(libelle, typeAmende, valeur, caisseId = null, icone = '⚠️') {
    const amende = {
        id: Date.now(),
        libelle: libelle.trim(),
        typeAmende: typeAmende,
        valeur: typeAmende === 'financier' ? Number(valeur) : String(valeur).trim(),
        caisseId: typeAmende === 'financier' ? Number(caisseId) : null,
        icone: icone || '⚠️'
    };
    configAmendes.push(amende);
    sauvegarderAmendes();
    return amende;
}

/**
 * Supprime une infraction
 */
function supprimerAmende(id) {
    configAmendes = configAmendes.filter(a => a.id !== id);
    sauvegarderAmendes();
}

// ─────────────────────────────────────────────
// 9. GESTION DES MEMBRES
// ─────────────────────────────────────────────
function ajouterMembre(nom) {
    const uppercaseNom = nom.trim().toUpperCase();
    // Vérifier les doublons
    if (associationData.membres.find(m => m.nom === uppercaseNom)) {
        return; 
    }
    associationData.membres.push({
        id: uppercaseNom, // Le nom réel en majuscules devient l'identifiant unique
        nom: uppercaseNom,
        dateAdhesion: new Date(),
        operations: []
    });
    sauvegarder();
}

function inscrireMembre() {
    const input = document.getElementById('nouveau-membre');
    if (!input) return;
    const nom = input.value.trim();
    if (!nom) return alert('Le nom du membre est requis.');
    ajouterMembre(nom);
    input.value = '';
    if (typeof updateMembresUI === 'function') updateMembresUI();
    alert('Membre ' + nom + ' ajouté avec succès.');
}

function modifierMembre(id) {
    const membre = associationData.membres.find(m => m.id === id);
    if (!membre) return;

    const nouveauNom = prompt('Corriger le nom et prénom de ' + membre.nom + ' :', membre.nom);
    if (!nouveauNom) return;

    const uppercaseNom = nouveauNom.trim().toUpperCase();
    if (uppercaseNom === membre.nom) return;

    // Vérifier les doublons
    if (associationData.membres.find(m => m.nom === uppercaseNom)) {
        return alert('Ce nom est déjà utilisé par un autre membre.');
    }

    const ancienId = membre.id;
    
    // 1. Migration de l'ID opérationnel
    membre.id = uppercaseNom;
    membre.nom = uppercaseNom;

    // 2. Migration des identifiants de connexion (Cascade Update)
    if (typeof auth !== 'undefined' && auth.migrateUser) {
        auth.migrateUser(ancienId, uppercaseNom);
    }

    sauvegarder();
    updateMembresUI();
    alert('Membre mis à jour : ' + uppercaseNom);
}

function updateMembresUI() {
    const list   = document.getElementById('liste-membres');
    const select = document.getElementById('select-membre');
    const total  = document.getElementById('total-members');
    if (!list || !select || !total) return;

    total.textContent = '(' + associationData.membres.length + ' membres)';
    list.innerHTML = '';
    select.innerHTML = '<option value="">Sélectionner un membre...</option>';

    if (!associationData.membres.length) {
        list.innerHTML = '<li>Aucun membre inscrit pour le moment.</li>';
        return;
    }

    associationData.membres.forEach(m => {
        const dettes = (m.operations || []).filter(op => op.statut === 'du').length;
        const li = document.createElement('li');
        li.innerHTML = 
            '<div style="display:flex; justify-content:space-between; align-items:center; width:100%">' +
                '<span>' + m.nom + ' <span class="badge">' + dettes + ' dettes</span></span>' +
                '<button class="small secondary" onclick="event.stopPropagation(); modifierMembre(\'' + m.id + '\')" style="margin-left:10px">Modifier</button>' +
            '</div>';
        li.addEventListener('click', () => {
            select.value = m.id;
            if (typeof afficherBilan === 'function') afficherBilan();
        });
        list.appendChild(li);

        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nom;
        select.appendChild(opt);
    });
}

// ─────────────────────────────────────────────
// 10. BILAN MEMBRE (page membres.html)
// ─────────────────────────────────────────────
function afficherBilan() {
    const select = document.getElementById('select-membre');
    const bilan  = document.getElementById('bilan');
    if (!select || !bilan) return;

    const membre = associationData.membres.find(m => m.id.toString() === select.value);
    if (!membre) {
        bilan.innerHTML = '<p style="color:rgba(255,255,255,0.4); text-align:center; padding:1.5rem 0">Sélectionnez un membre pour afficher son historique.</p>';
        return;
    }

    const ops = membre.operations || [];
    
    // Récupérer le mois et la date de la réunion en cours
    const dateStr = associationData.lastSessionDate || new Date().toISOString().split('T')[0];
    const dateObj = new Date(dateStr);
    const currentMonth = dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const currentDate = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    let nonPayesHtml = '';
    let avancesHtml = '';
    let reglesHtml = '';

    let totalDu = 0;
    let totalRegle = 0;

    // ── 1. TRAITER CHAQUE CAISSE CONFIGURÉE (MÊME HORS COMPTA) ──
    configCaisses.forEach(c => {
        const isMensuelle = c.periodicite === 'mensuelle';
        const expected = c.type === 'parts'
            ? getPartsMembreCaisse(membre, c.id) * c.valeurPart
            : calculerCotisationCaisse(c.id);

        // Somme réglée pour cette caisse sur la session en cours (et réunion en cours si mensuelle)
        const paid = ops
            .filter(op => op.destination && op.destination.toString() === c.id.toString() && op.statut === 'regle' && op.session === associationData.sessionActuelle && (!isMensuelle || op.reunion === associationData.reunionActuelle))
            .reduce((sum, op) => sum + (Number(op.montant) || 0), 0);

        // Trouver l'index de la dette ouverte (si elle existe) dans ops pour le bouton "Régler"
        const opIdx = ops.findIndex(op => op.destination && op.destination.toString() === c.id.toString() && op.statut === 'du');

        const labelPeriode = isMensuelle ? ' (Mensuelle)' : ' (Session)';
        const labelExclue = c.exclureCompta ? ' <span style="color:#e67e22; font-size:0.7rem; font-weight:bold; background:rgba(230,126,34,0.15); padding:1px 5px; border-radius:4px;">🚫 Hors Compta</span>' : '';

        if (paid === 0) {
            // 🔴 CAS 1 : TOTALEMENT NON PAYÉ (Reste en Rouge)
            const reste = expected;
            if (!c.exclureCompta) totalDu += reste;

            const btnRegler = opIdx !== -1
                ? '<button class="small" style="background:#e74c3c; border-color:#e74c3c; color:#fff; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;" onclick="validerOperation(\'' + membre.id + '\',' + opIdx + ')">Régler</button>'
                : '';

            nonPayesHtml += '<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:12px 15px; border-radius:8px; margin-bottom:8px;">' +
                '<div style="text-align:left;">' +
                    '<strong style="color:#fff; display:block; font-size:0.9rem;">' + c.nom + labelPeriode + labelExclue + '</strong>' +
                    '<small style="color:rgba(255,255,255,0.5); font-size:0.75rem;">Attendu : ' + formatAmount(expected) + ' | Non cotisé</small>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<span style="color:#e74c3c; font-weight:bold;">Reste : ' + formatAmount(reste) + '</span>' +
                    btnRegler +
                '</div>' +
            '</li>';
        } else if (paid > 0 && paid < expected) {
            // 🟠 CAS 2 : PAIEMENT PARTIEL / AVANCE DE COTISATION (Déplacé en Orange)
            const reste = expected - paid;
            if (!c.exclureCompta) {
                totalDu += reste;
                totalRegle += paid;
            }

            const btnRegler = opIdx !== -1
                ? '<button class="small" style="background:#e67e22; border-color:#e67e22; color:#fff; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;" onclick="validerOperation(\'' + membre.id + '\',' + opIdx + ')">Régler Reste</button>'
                : '';

            avancesHtml += '<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); padding:10px 15px; border-radius:8px; margin-bottom:6px;">' +
                '<div style="text-align:left;">' +
                    '<strong style="color:#fff; display:block; font-size:0.9rem;">' + c.nom + labelPeriode + labelExclue + '</strong>' +
                    '<small style="color:rgba(255,255,255,0.4); font-size:0.75rem;">Attendu : ' + formatAmount(expected) + ' | Déjà Payé : ' + formatAmount(paid) + '</small>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<div style="display:flex; flex-direction:column; align-items:flex-end;">' +
                        '<span style="color:#e67e22; font-weight:bold; font-size:0.85rem;">Reste : ' + formatAmount(reste) + '</span>' +
                        '<span style="color:#e67e22; background:rgba(230,126,34,0.15); font-size:0.65rem; font-weight:bold; padding:1px 5px; border-radius:4px; margin-top:2px;">⚠️ Paiement Partiel</span>' +
                    '</div>' +
                    btnRegler +
                '</div>' +
            '</li>';
        } else if (paid === expected) {
            // 🟢 CAS 3 : TOTALEMENT PAYÉ (Vert en bas)
            if (!c.exclureCompta) totalRegle += paid;

            reglesHtml += '<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); padding:10px 15px; border-radius:8px; margin-bottom:6px;">' +
                '<div style="text-align:left;">' +
                    '<span style="color:rgba(255,255,255,0.85); display:block; font-size:0.9rem;">' + c.nom + labelPeriode + labelExclue + '</span>' +
                    '<small style="color:rgba(255,255,255,0.4); font-size:0.75rem;">Cotisation réglée en totalité</small>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<span style="color:#2ecc71; font-weight:700;">' + formatAmount(expected) + '</span>' +
                    '<span style="color:#2ecc71; background:rgba(46,204,113,0.15); font-size:0.72rem; font-weight:bold; padding:2px 8px; border-radius:10px;">✅ Réglé</span>' +
                '</div>' +
            '</li>';
        } else if (paid > expected) {
            // 🟠 CAS 4 : CRÉDIT / SURPLUS D\'AVANCE (Orange au milieu)
            if (!c.exclureCompta) totalRegle += paid;
            const surplus = paid - expected;

            avancesHtml += '<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); padding:10px 15px; border-radius:8px; margin-bottom:6px;">' +
                '<div style="text-align:left;">' +
                    '<strong style="color:#fff; display:block; font-size:0.9rem;">' + c.nom + labelPeriode + labelExclue + '</strong>' +
                    '<small style="color:rgba(255,255,255,0.4); font-size:0.75rem;">Attendu : ' + formatAmount(expected) + ' | Cotisé : ' + formatAmount(paid) + '</small>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<span style="color:#3498db; font-weight:700;">Avance : +' + formatAmount(surplus) + '</span>' +
                    '<span style="color:#3498db; background:rgba(52,152,219,0.15); font-size:0.72rem; font-weight:bold; padding:2px 8px; border-radius:10px;">➕ Avancé</span>' +
                '</div>' +
            '</li>';
        }
    });

    // ── 2. TRAITER LES AUTRES OPÉRATIONS (INFRACTIONS / AMENDES) ──
    ops.forEach((op, i) => {
        // Traiter uniquement les infractions/amendes (qui ont op.typeAmende défini)
        if (!op.typeAmende) return;

        const isNature = op.typeAmende === 'nature';

        if (op.statut === 'du') {
            if (!isNature) totalDu += Number(op.montant) || 0;

            const valeurAffichee = isNature
                ? '<span style="color:#f39c12; font-weight:700;">📦 ' + op.valeurNature + '</span>'
                : '<strong style="color:#e74c3c;">' + formatAmount(op.montant) + '</strong>';

            const btnRegler = '<button class="small" style="background:#e74c3c; border-color:#e74c3c; color:#fff; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;" onclick="validerOperation(\'' + membre.id + '\',' + i + ')">Régler</button>';

            nonPayesHtml += '<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:12px 15px; border-radius:8px; margin-bottom:8px;">' +
                '<div style="text-align:left;">' +
                    '<strong style="color:#fff; display:block; font-size:0.9rem;">' + op.motif + '</strong>' +
                    '<small style="color:rgba(255,255,255,0.5); font-size:0.75rem;">Sanction en retard</small>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<span>' + valeurAffichee + '</span>' +
                    btnRegler +
                '</div>' +
            '</li>';
        } else if (op.statut === 'regle') {
            if (!isNature) totalRegle += Number(op.montant) || 0;

            const valeurAffichee = isNature
                ? '<span style="color:#2ecc71; font-weight:700;">📦 ' + op.valeurNature + '</span>'
                : '<strong style="color:#2ecc71;">' + formatAmount(op.montant) + '</strong>';

            reglesHtml += '<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); padding:10px 15px; border-radius:8px; margin-bottom:6px;">' +
                '<div style="text-align:left;">' +
                    '<span style="color:rgba(255,255,255,0.85); display:block; font-size:0.9rem;">' + op.motif + '</span>' +
                    '<small style="color:rgba(255,255,255,0.4); font-size:0.75rem;">Réglé le : ' + new Date(op.dateReglement || op.date).toLocaleDateString('fr-FR') + '</small>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<span>' + valeurAffichee + '</span>' +
                    '<span style="color:#2ecc71; background:rgba(46,204,113,0.15); font-size:0.72rem; font-weight:bold; padding:2px 8px; border-radius:10px;">✅ Réglé</span>' +
                '</div>' +
            '</li>';
        }
    });

    // ── 3. AFFICHAGE DES VALEURS PAR DÉFAUT SI VIDE ──
    if (!nonPayesHtml) {
        nonPayesHtml = '<li style="color:rgba(255,255,255,0.4); text-align:center; padding:1rem 0; font-size:0.9rem;">🎉 Aucune cotisation en retard ! Tout est à jour.</li>';
    }
    if (!avancesHtml) {
        avancesHtml = '<li style="color:rgba(255,255,255,0.4); text-align:center; padding:1rem 0; font-size:0.9rem;">Aucune cotisation créditrice (avance) enregistrée.</li>';
    }
    if (!reglesHtml) {
        reglesHtml = '<li style="color:rgba(255,255,255,0.4); text-align:center; padding:1rem 0; font-size:0.9rem;">Aucun règlement enregistré pour le moment.</li>';
    }

    bilan.innerHTML =
        '<div class="summary-grid" style="margin-bottom:1.5rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">' +
            '<div class="summary-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px 15px; border-radius:10px; text-align:center;"><strong>Nom</strong><div style="color:#d4af37; font-weight:bold; font-size:1.1rem; margin-top:5px;">' + membre.nom + '</div></div>' +
            '<div class="summary-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px 15px; border-radius:10px; text-align:center;"><strong>Session</strong><div style="font-weight:bold; font-size:1.1rem; margin-top:5px; color:#3498db;">Session ' + associationData.sessionActuelle + '</div></div>' +
            '<div class="summary-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px 15px; border-radius:10px; text-align:center;"><strong>Mois</strong><div style="font-weight:bold; font-size:1.1rem; margin-top:5px; text-transform:capitalize; color:#9b59b6;">' + currentMonth + '</div></div>' +
            '<div class="summary-card" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px 15px; border-radius:10px; text-align:center;"><strong>Réunion du</strong><div style="font-weight:bold; font-size:0.95rem; margin-top:5px; color:#f1c40f;">' + currentDate + '</div></div>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:1.5rem; text-align:center;">' +
            '<div style="background:rgba(231,76,60,0.1); border:1px solid rgba(231,76,60,0.2); padding:10px; border-radius:8px;">' +
                '<span style="color:#e74c3c; font-size:0.8rem; text-transform:uppercase; font-weight:bold;">Total Reste à payer</span>' +
                '<div style="color:#e74c3c; font-size:1.25rem; font-weight:bold; margin-top:5px;">' + formatAmount(totalDu) + '</div>' +
            '</div>' +
            '<div style="background:rgba(46,204,113,0.1); border:1px solid rgba(46,204,113,0.2); padding:10px; border-radius:8px;">' +
                '<span style="color:#2ecc71; font-size:0.8rem; text-transform:uppercase; font-weight:bold;">Total Déjà Réglé</span>' +
                '<div style="color:#2ecc71; font-size:1.25rem; font-weight:bold; margin-top:5px;">' + formatAmount(totalRegle) + '</div>' +
            '</div>' +
        '</div>' +
        
        '<div style="display:flex; flex-direction:column; gap:20px; text-align:left;">' +
            // Section 1 : NON PAYÉ (En Rouge - Tout en haut)
            '<div style="background:rgba(231,76,60,0.04); border:1px solid rgba(231,76,60,0.12); border-radius:12px; padding:18px;">' +
                '<h3 style="color:#e74c3c; margin-top:0; margin-bottom:12px; font-size:1rem; border-bottom:1px solid rgba(231,76,60,0.1); padding-bottom:8px; display:flex; align-items:center; gap:6px;">🔴 NON PAYÉ (Dettes & Retards)</h3>' +
                '<ul style="margin:0; padding:0; list-style:none;">' + nonPayesHtml + '</ul>' +
            '</div>' +
            
            // Section 2 : AVANCES (En Orange - Au milieu)
            '<div style="background:rgba(230,126,34,0.04); border:1px solid rgba(230,126,34,0.12); border-radius:12px; padding:18px;">' +
                '<h3 style="color:#e67e22; margin-top:0; margin-bottom:12px; font-size:1rem; border-bottom:1px solid rgba(230,126,34,0.1); padding-bottom:8px; display:flex; align-items:center; gap:6px;">🟠 AVANCES (Cotisations créditrices)</h3>' +
                '<ul style="margin:0; padding:0; list-style:none;">' + avancesHtml + '</ul>' +
            '</div>' +
            
            // Section 3 : RÉGLÉ (En Vert - Tout en bas)
            '<div style="background:rgba(46,204,113,0.04); border:1px solid rgba(46,204,113,0.12); border-radius:12px; padding:18px;">' +
                '<h3 style="color:#2ecc71; margin-top:0; margin-bottom:12px; font-size:1rem; border-bottom:1px solid rgba(46,204,113,0.1); padding-bottom:8px; display:flex; align-items:center; gap:6px;">🟢 RÉGLÉ (À jour)</h3>' +
                '<ul style="margin:0; padding:0; list-style:none;">' + reglesHtml + '</ul>' +
            '</div>' +
        '</div>';
}

// ─────────────────────────────────────────────
// 11. SESSION — GÉNÉRATION DES DETTES
// ─────────────────────────────────────────────
function nouvelleReunion() {
    // Initialiser la réunion actuelle si elle n'existe pas
    if (!associationData.reunionActuelle) associationData.reunionActuelle = 1;

    if (!confirm('Passer à la réunion ' + (associationData.reunionActuelle + 1) + ' ? Les dettes mensuelles seront générées pour tous les membres.')) return;

    // Capture des paramètres de réunion mensuelle (si déclenché depuis config.html)
    const hostSelect = document.getElementById('session-host');
    const dateInput = document.getElementById('session-date');
    let host = '[Non renseigné]';
    let date = new Date().toISOString().split('T')[0];
    
    if (hostSelect && dateInput) {
        if (!hostSelect.value) {
            alert("Veuillez sélectionner un Membre d'Accueil pour la prochaine réunion.");
            return;
        }
        host = hostSelect.value;
        date = dateInput.value;
        associationData.lastSessionHost = host;
        associationData.lastSessionDate = date;
    }

    // Sauvegarder l'historique de la réunion précédente avant d'incrémenter
    const previousReunion = associationData.reunionActuelle;
    const previousHost = associationData.lastSessionHost || '[Non renseigné]';
    const previousDate = associationData.lastSessionDate || new Date().toISOString().split('T')[0];
    const previousPvKey = 'TONTINE_PV_REUNION_' + previousReunion;
    const previousPv = localStorage.getItem(previousPvKey) || null;

    const previousMetaKey = 'TONTINE_META_REUNION_' + previousReunion;
    let previousAttendees = [];
    try {
        const meta = JSON.parse(localStorage.getItem(previousMetaKey));
        if (meta && meta.attendees) previousAttendees = meta.attendees;
    } catch(e) {}

    // Ajouter à l'historique des réunions
    associationData.reunionsHistorique.push({
        reunionId: previousReunion,
        sessionId: associationData.sessionActuelle,
        host: previousHost,
        date: previousDate,
        pv: previousPv,
        attendees: previousAttendees,
        timestamp: new Date().toISOString()
    });

    associationData.reunionActuelle += 1;

    associationData.membres.forEach(membre => {
        if (!membre.operations) membre.operations = [];
        if (!membre.parts)      membre.parts = {};

        configCaisses.forEach(caisse => {
            // Pour les caisses à parts : utiliser le choix actuel du membre (défaut 1 part)
            const nbParts = caisse.type === 'parts' ? getPartsMembreCaisse(membre, caisse.id) : 1;
            const montant = calculerCotisationCaisse(caisse.id, nbParts);

            membre.operations.push({
                motif:       caisse.nom + ' — Réunion ' + associationData.reunionActuelle,
                montant:     montant,
                typeAmende:  'financier',
                destination: caisse.id,
                statut:      'du',
                date:        new Date(),
                // Mémoriser les parts pour traçabilité
                nbParts:     caisse.type === 'parts' ? nbParts : undefined
            });
        });
    });

    sauvegarder();
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof updateMembresUI === 'function') updateMembresUI();
    if (typeof loadConfig      === 'function') loadConfig();
    alert('Réunion Mensuelle ' + associationData.reunionActuelle + ' validée.\\nAccueilli par : ' + (associationData.lastSessionHost || 'Non défini') + '\\nDate : ' + (associationData.lastSessionDate || 'Non définie'));
}

// ─────────────────────────────────────────────
// 12. VALIDATION D'UNE OPÉRATION (Admin)
// ─────────────────────────────────────────────
function validerOperation(membreId, opIndex, montantRegle, isNature = false) {
    const membre = associationData.membres.find(m => m.id === membreId);
    if (!membre || !membre.operations[opIndex]) return;
    const op = membre.operations[opIndex];

    const montantAPayer = (montantRegle !== undefined && montantRegle !== "") ? Number(montantRegle) : op.montant;

    const now = new Date();

    if (isNature) {
        op.statut = 'regle';
        op.motif += ' (Payé en Nature)';
        op.dateReglement = now;
        op.timestampEnregistrement = now.toISOString();
        op.heureEnregistrement = now.toLocaleTimeString('fr-FR');
    } else if (montantAPayer >= op.montant) {
        op.statut = 'regle';
        op.dateReglement = now;
        op.timestampEnregistrement = now.toISOString();
        op.heureEnregistrement = now.toLocaleTimeString('fr-FR');
        // Créditer la caisse correspondante si financier
        if (op.typeAmende !== 'nature' && op.montant > 0) {
            const caisseId = op.destination;
            associationData.comptabilite[caisseId] = (associationData.comptabilite[caisseId] || 0) + op.montant;
        }
    } else {
        // Paiement partiel
        const reste = op.montant - montantAPayer;
        op.montant = montantAPayer;
        op.statut = 'regle';
        op.dateReglement = now;
        op.timestampEnregistrement = now.toISOString();
        op.heureEnregistrement = now.toLocaleTimeString('fr-FR');
        
        // Créditer la caisse
        if (op.typeAmende !== 'nature' && montantAPayer > 0) {
            const caisseId = op.destination;
            associationData.comptabilite[caisseId] = (associationData.comptabilite[caisseId] || 0) + montantAPayer;
        }

        // Créer une nouvelle dette pour le reste
        membre.operations.push({
            motif: op.motif + ' (Reste)',
            montant: reste,
            typeAmende: op.typeAmende,
            destination: op.destination,
            statut: 'du',
            date: new Date(),
            isPenalty: op.isPenalty,
            session: op.session,
            reunion: op.reunion
        });
    }

    sauvegarder();
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof updateMembresUI === 'function') updateMembresUI();
    if (typeof afficherBilan   === 'function') afficherBilan();
}

/**
 * Logique de calcul déductif pour la table de comptage
 */
window.updateCalculs = function(membreId) {
    const card = document.querySelector(`[data-membre-id="${membreId}"]`);
    if (!card) return;
    
    const deposit = Number(card.querySelector('.table-deposit').value) || 0;
    const inputs = card.querySelectorAll('.due-input');
    let allocated = 0;
    
    inputs.forEach(input => {
        const item = input.closest('.op-item');
        const natureToggle = item.querySelector('.toggle-nature');
        const isNature = natureToggle && natureToggle.checked;
        
        if (!isNature) {
            allocated += Number(input.value) || 0;
        }
        
        const due = Number(input.dataset.due);
        const paid = Number(input.value) || 0;
        const statusEl = item.querySelector('.line-status');
        
        if (isNature) {
            statusEl.textContent = "📦 Nature";
            statusEl.style.color = "#f39c12";
        } else if (paid < due) {
            statusEl.textContent = `Manque ${formatAmount(due - paid)}`;
            statusEl.style.color = "var(--danger)";
        } else {
            statusEl.textContent = "Prêt";
            statusEl.style.color = "#2ecc71";
        }
    });
    
    const remaining = deposit - allocated;
    const counter = card.querySelector('.remaining-counter');
    counter.textContent = `Reste: ${formatAmount(remaining)}`;
    counter.style.color = remaining < 0 ? 'var(--danger)' : 'var(--gold)';
};

/**
 * Applique une infraction (amende financière ou en nature) à un membre.
 * Enregistre l'infraction dans les opérations du membre avec un tag de pénalité.
 * @param {string} membreId - L'identifiant unique du membre.
 * @param {number} amendeId - L'identifiant unique de la configuration d'amende.
 * @returns {void}
 */
function appliquerInfraction(membreId, amendeId) {
    const membre = associationData.membres.find(m => m.id === membreId);
    const amende = configAmendes.find(a => a.id === amendeId);
    if (!membre || !amende) return;

    const isFin = amende.typeAmende === 'financier';
    const op = {
        motif:      amende.libelle,
        statut:     'du',
        typeAmende: amende.typeAmende,
        date:       new Date(),
        isPenalty:  true,
        session:    associationData.sessionActuelle || 1,
        reunion:    associationData.reunionActuelle || 1,
        montant:     isFin ? amende.valeur : 0,
        valeurNature: isFin ? undefined : amende.valeur,
        destination: isFin ? (amende.caisseId || 'amendes') : 'nature'
    };

    membre.operations.push(op);
    sauvegarder();
    if (typeof updateDashboard === 'function') updateDashboard();
}

// ─────────────────────────────────────────────
// 14. DASHBOARD ADMIN (page session.html)
//     Affiche tous les membres avec leurs dettes + boutons d'infraction
// ─────────────────────────────────────────────
function updateDashboard() {
    appliquerNomAsso();
    const container = document.getElementById('membres-session');
    if (!container) return;
    container.innerHTML = '';

    if (!associationData.membres.length) {
        container.innerHTML = '<p>Aucun membre inscrit. Ajoutez des membres depuis la page Membres.</p>';
        return;
    }

    associationData.membres.forEach(m => {
        const ops = m.operations || [];
        const opsHtml = ops.map((op, i) => {
            if (op.statut !== 'du') return ''; // On ne montre que les dettes à régler ici

            const isNature = op.typeAmende === 'nature';
            const safeId = m.id.toString().replace(/\s+/g, '_');
            const inputId = `input-${safeId}-${i}`;
            const toggleId = `toggle-${safeId}-${i}`;

            return `
                <li class="op-item due" style="display:flex; flex-direction:row; justify-content:space-between; align-items:center; gap:15px;">
                    <div style="flex:1">
                        <strong>${op.motif}</strong>
                        <div style="font-size:0.7rem; color:var(--muted)">Attendu: ${formatAmount(op.montant)}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="nature-toggle-box">
                            <input type="checkbox" id="${toggleId}" class="toggle-nature" onchange="updateCalculs('${m.id}')" ${isNature ? 'checked' : ''}>
                            <label for="${toggleId}">📦</label>
                        </div>
                        <input type="number" 
                               class="due-input" 
                               id="${inputId}" 
                               data-due="${op.montant}" 
                               value="${isNature ? 0 : op.montant}" 
                               oninput="updateCalculs('${m.id}')">
                        <div class="line-status" style="width:110px; font-size:0.75rem; text-align:right;">Prêt</div>
                        <button class="small" onclick="validerOperation('${m.id}', ${i}, document.getElementById('${inputId}').value, document.getElementById('${toggleId}').checked)">Régler</button>
                    </div>
                </li>`;
        }).join('') || '<li style="color:var(--muted); text-align:center; padding:10px;">Aucune dette en cours.</li>';

        const infractionsHtml = configAmendes.map(a =>
            '<button class="secondary small" onclick="appliquerInfraction(\'' + m.id + '\',' + a.id + ')">' +
            (a.typeAmende === 'nature' ? '📦 ' : '💸 ') + a.libelle + '</button>'
        ).join('');

        const dettesOuvertes = ops.filter(op => op.statut === 'du').length;

        container.innerHTML += `
            <div class="card" data-membre-id="${m.id}">
                <div style="display:grid; grid-template-columns:1fr; gap:15px; margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0">${m.nom}</h3>
                        <span class="badge ${dettesOuvertes > 0 ? 'due' : 'done'}">${dettesOuvertes} éléments à régler</span>
                    </div>
                    <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; border:1px solid rgba(212,175,55,0.2);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="font-size:0.75rem; color:var(--muted); font-weight:bold;">ARGENT SUR LA TABLE :</label>
                            <input type="number" class="table-deposit" placeholder="0 FCFA" oninput="updateCalculs('${m.id}')" style="max-width:120px; padding:5px; background:#111; border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:4px; text-align:right;">
                        </div>
                        <div class="remaining-counter" style="text-align:right; margin-top:8px; font-weight:bold; font-size:0.9rem; color:var(--gold);">Reste: 0 FCFA</div>
                    </div>
                </div>
                <ul class="op-list">
                    ${opsHtml}
                </ul>
                <div class="quick-actions" style="margin-top:1.5rem; display:flex; flex-wrap:wrap; gap:8px; border-top:1px solid var(--border); padding-top:15px;">
                    <span style="width:100%; font-size:0.7rem; color:var(--muted); margin-bottom:5px;">AJOUTER UNE INFRACTION :</span>
                    ${infractionsHtml}
                </div>
            </div>`;
    });
}

function getTotalCaisse(caisseId) {
    let sum = 0;
    associationData.membres.forEach(m => {
        (m.operations || []).forEach(op => {
            if (op.destination && op.destination.toString() === caisseId.toString() && op.statut === 'regle') {
                sum += Number(op.montant) || 0;
            }
        });
    });
    return sum;
}

function getTotalGlobal() {
    let sum = 0;
    configCaisses.forEach(c => {
        if (c.exclureCompta) return;
        sum += getTotalCaisse(c.id);
    });
    return sum;
}

// ─────────────────────────────────────────────
// 16. RÉACTIVITÉ GLOBALE & INITIALISATION
// ─────────────────────────────────────────────

// Mise à jour automatique si les données changent dans un autre onglet
window.addEventListener('storage', (e) => {
    if (e.key === 'apbmData') {
        try {
            const newData = JSON.parse(e.newValue);
            if (newData) {
                let changed = false;
                if (newData.nomAsso !== associationData.nomAsso) {
                    associationData.nomAsso = newData.nomAsso;
                    changed = true;
                }
                if (newData.explicationAsso !== associationData.explicationAsso) {
                    associationData.explicationAsso = newData.explicationAsso;
                    changed = true;
                }
                if (changed) {
                    appliquerNomAsso();
                }
            }
        } catch (err) {
            console.error("Erreur de synchronisation Tontine:", err);
        }
    }
});

// Application immédiate au chargement du script
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    appliquerNomAsso();
} else {
    document.addEventListener('DOMContentLoaded', appliquerNomAsso);
}

/* ══════════════════════════════════════════════════════
   LOGIQUE PARTAGÉE : TABLEAU DE VENTILATION DES FONDS
══════════════════════════════════════════════════════ */
function chargerFinances() {
    const selectMem = document.getElementById('select-membre-table');
    if(!selectMem) return;
    selectMem.innerHTML = '<option value="">— Sélectionner le membre —</option>';
    associationData.membres.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nom.toUpperCase();
        selectMem.appendChild(opt);
    });
    
    // On n'affiche rien par défaut
    renderVentilationRows('');
    afficherStatutMembre('');
}

function renderVentilationRows(membreId) {
    const container = document.getElementById('table-ventilation-rows');
    if(!container) return;

    if (!membreId) {
        container.innerHTML = '<div class="empty-state"><span>👤</span>Veuillez sélectionner un membre pour afficher ses restes à payer.</div>';
        return;
    }

    const membre = associationData.membres.find(m => m.id === membreId);
    if (!membre) return;

    if (!configCaisses.length && !configAmendes.length) {
        container.innerHTML = '<div class="empty-state"><span>🏦</span>Aucune caisse ni infraction configurée.</div>';
        return;
    }

    let html = '';
    const ops = membre.operations || [];

    // ── Bloc Caisses ──
    let caissesHtml = '';
    configCaisses.forEach(c => {
        const isMensuelle = c.periodicite === 'mensuelle';
        const parts = (membre.parts && membre.parts[c.id]) ? Number(membre.parts[c.id]) : 1;
        const expected = c.type === 'parts' ? parts * c.valeurPart : calculerCotisationCaisse(c.id, parts);
        
        // Somme réglée
        const paid = ops
            .filter(op => op.destination && op.destination.toString() === c.id.toString() && op.statut === 'regle' && op.session === associationData.sessionActuelle && (!isMensuelle || op.reunion === associationData.reunionActuelle))
            .reduce((sum, op) => sum + (Number(op.montant) || 0), 0);
            
        const resteAPayer = expected - paid;

        // MASQUER LA CAISSE SI ELLE EST SOLDÉE (resteAPayer <= 0)
        if (resteAPayer > 0) {
            const typeLabel = c.type === 'evolutive' ? 'Évolutive' : c.type === 'parts' ? 'Par parts' : 'Fixe';
            caissesHtml += `
                <div class="ventilation-row">
                    <div class="ventilation-row-info">
                        <strong>${c.icone || '🏦'} ${escHtml(c.nom)}</strong>
                        <small>${typeLabel} (Reste: <span style="color:var(--danger)">${formatAmount(resteAPayer)}</span>)</small>
                    </div>
                    <input type="number" class="ventilation-input table-ventilation-input"
                        data-caisse-id="${c.id}" data-caisse-nom="${escHtml(c.nom)}" data-is-nature="false"
                        placeholder="0" min="0" oninput="updateCalculsTable()">
                </div>`;
        }
    });
    if (caissesHtml) {
        html += '<div class="section-label">🏦 Caisses à régler</div>' + caissesHtml;
    }

    // ── Bloc Amendes ──
    let amendesHtml = '';
    configAmendes.forEach(a => {
        // Est-ce que le membre a cette amende en statut 'du' ?
        const isDue = ops.some(op => op.statut === 'du' && op.motif === a.libelle);
        
        // MASQUER L'AMENDE SI ELLE N'EST PAS DUES
        if (isDue) {
            const isNature = a.typeAmende === 'nature';
            const valeurAff = isNature ? '📦 ' + escHtml(String(a.valeur)) : formatAmount(a.valeur);
            amendesHtml += `
                <div class="amende-row" data-amende-id="${a.id}">
                    <div class="amende-row-info">
                        <strong>${a.icone || '⚠️'} ${escHtml(a.libelle)}</strong>
                        <small>Sanction : <span style="color:var(--danger)">${valeurAff}</span></small>
                    </div>
                    <div class="amende-controls">
                        ${isNature
                            ? `<label class="nature-toggle-wrap" title="Cocher = réglé en matériel">
                                   <input type="checkbox" class="toggle-nature-amende" data-amende-id="${a.id}" data-amende-libelle="${escHtml(a.libelle)}" onchange="onNatureToggle(this)">
                                   📦 Matériel fourni
                               </label>
                               <span class="nature-badge" id="badge-nature-${a.id}">✓ Réglé en nature</span>`
                            : `<label class="nature-toggle-wrap" title="Cocher = réglé en matériel">
                                   <input type="checkbox" class="toggle-nature-amende" data-amende-id="${a.id}" data-amende-libelle="${escHtml(a.libelle)}" onchange="onNatureToggle(this)">
                                   📦
                               </label>
                               <input type="number" class="ventilation-input table-ventilation-input"
                                   data-caisse-id="${a.caisseId || 'amendes'}" data-caisse-nom="${escHtml(a.libelle)}" data-is-nature="false" data-amende-id="${a.id}"
                                   placeholder="0" min="0" id="input-amende-${a.id}" oninput="updateCalculsTable()">
                               <span class="nature-badge" id="badge-nature-${a.id}">✓ Matériel</span>`
                        }
                    </div>
                </div>`;
        }
    });
    if (amendesHtml) {
        html += '<div class="section-label">⚖️ Pénalités & Infractions en attente</div>' + amendesHtml;
    }

    if (!html) {
        html = '<div class="empty-state"><span>✅</span><div style="color:#2ecc71; font-weight:bold; font-size:1rem; margin-top:10px;">Le membre est à jour de toutes ses cotisations et n\'a aucune dette.</div></div>';
    }

    container.innerHTML = html;
}

function afficherStatutMembre(membreId) {
    const panel = document.getElementById('membre-status-panel');
    if (!panel) return;
    
    if (!membreId) {
        panel.style.display = 'none';
        return;
    }

    const membre = associationData.membres.find(m => m.id === membreId);
    if (!membre) return;

    let totalResteAPayer = 0;
    let totalAvances = 0;
    const ops = membre.operations || [];

    // Calcul Caisses
    configCaisses.forEach(c => {
        const isMensuelle = c.periodicite === 'mensuelle';
        const parts = (membre.parts && membre.parts[c.id]) ? Number(membre.parts[c.id]) : 1;
        const expected = c.type === 'parts' ? parts * c.valeurPart : calculerCotisationCaisse(c.id, parts);
        const paid = ops
            .filter(op => op.destination && op.destination.toString() === c.id.toString() && op.statut === 'regle' && op.session === associationData.sessionActuelle && (!isMensuelle || op.reunion === associationData.reunionActuelle))
            .reduce((sum, op) => sum + (Number(op.montant) || 0), 0);
            
        const solde = expected - paid;
        if (solde > 0) totalResteAPayer += solde;
        if (solde < 0) totalAvances += Math.abs(solde);
    });

    // Amendes dues
    ops.filter(op => op.statut === 'du' && op.typeAmende === 'financier').forEach(op => {
        totalResteAPayer += Number(op.montant) || 0;
    });

    // Historique de la séance (Aujourd'hui)
    const today = new Date().toLocaleDateString('fr-FR');
    const opsAujourdhui = ops.filter(op => op.statut === 'regle' && new Date(op.date).toLocaleDateString('fr-FR') === today);

    const opsRecentes = opsAujourdhui.slice(-4).reverse();
    let historiqueHtml = '';
    if (opsRecentes.length > 0) {
        historiqueHtml = opsRecentes.map(op => {
            const mnt = op.typeAmende === 'nature' ? '📦 Nature' : formatAmount(op.montant);
            const heure = op.heureEnregistrement || new Date(op.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
            return `<div class="historique-item">
                        <span>[${heure}] ${escHtml(op.motif)}</span>
                        <strong>${mnt}</strong>
                    </div>`;
        }).join('');
    } else {
        historiqueHtml = '<div style="color:var(--muted); font-size:0.8rem; text-align:center;">Aucune opération de paiement aujourd\'hui.</div>';
    }

    panel.innerHTML = `
        <div class="status-panel-grid">
            <div class="status-col">
                <h4>🔴 Total à payer</h4>
                <div class="status-item">
                    <span>Session en cours :</span>
                    <span class="${totalResteAPayer > 0 ? 'text-danger' : 'text-success'}">${formatAmount(totalResteAPayer)}</span>
                </div>
            </div>
            <div class="status-col">
                <h4>🟢 Trop perçu</h4>
                <div class="status-item">
                    <span>Avances :</span>
                    <span class="${totalAvances > 0 ? 'text-success' : 'text-info'}">${formatAmount(totalAvances)}</span>
                </div>
            </div>
            <div class="status-col historique">
                <h4>🕒 Règlements d'aujourd'hui</h4>
                <div class="historique-list">
                    ${historiqueHtml}
                </div>
            </div>
        </div>
    `;
    panel.style.display = 'block';
}

function onNatureToggle(checkbox) {
    const amendeId  = checkbox.dataset.amendeId;
    const badge     = document.getElementById('badge-nature-' + amendeId);
    const inputCash = document.getElementById('input-amende-' + amendeId);

    if (checkbox.checked) {
        if (badge) badge.style.display = 'inline-block';
        if (inputCash) {
            inputCash.value    = '';
            inputCash.disabled = true;
            inputCash.style.opacity = '0.35';
        }
    } else {
        if (badge) badge.style.display = 'none';
        if (inputCash) {
            inputCash.disabled = false;
            inputCash.style.opacity = '1';
        }
    }
    updateCalculsTable();
}

function updateCalculsTable() {
    const inputArgent = document.getElementById('input-argent-table');
    if(!inputArgent) return;
    const depot = Number(inputArgent.value) || 0;
    let alloue = 0;
    document.querySelectorAll('.table-ventilation-input').forEach(input => {
        if (!input.disabled) alloue += Number(input.value) || 0;
    });

    const reste = depot - alloue;
    const counter = document.getElementById('reste-table');
    if(counter) {
        counter.textContent = 'Reste à répartir : ' + formatAmount(reste);
        counter.style.color = reste < 0 ? 'var(--danger)' : 'var(--gold)';
    }
}

function onMembreChange() {
    const membreId = document.getElementById('select-membre-table').value;
    renderVentilationRows(membreId);
    afficherStatutMembre(membreId);
    resetTableFields();
}

function resetTableFields() {
    const inputArgent = document.getElementById('input-argent-table');
    if(inputArgent) inputArgent.value = '';
    document.querySelectorAll('.table-ventilation-input').forEach(input => {
        input.value = ''; input.disabled = false; input.style.opacity = '1';
    });
    document.querySelectorAll('.toggle-nature-amende').forEach(cb => cb.checked = false);
    document.querySelectorAll('.nature-badge').forEach(b => b.style.display = 'none');
    updateCalculsTable();
}

function membreSuivant() {
    const select = document.getElementById('select-membre-table');
    if(!select) return;
    const idx = select.selectedIndex;
    if (idx < select.options.length - 1) {
        select.selectedIndex = idx + 1;
        onMembreChange(); // Déclenche le recalcul complet pour le suivant
    } else {
        alert('✅ Fin de la liste des membres. Tous les membres ont été traités.');
    }
}

function validerTouteLaTable() {
    const membreId = document.getElementById('select-membre-table').value;
    if (!membreId) return alert('Veuillez sélectionner un membre bénéficiaire.');

    const membre = associationData.membres.find(m => m.id === membreId);
    if (!membre) return alert('Membre introuvable.');

    if (!membre.operations) membre.operations = [];
    let totalVentile = 0;
    let nbNature = 0;

    document.querySelectorAll('.table-ventilation-input').forEach(input => {
        if (input.disabled) return;
        const montant = Number(input.value);
        if (montant > 0) {
            const caisseId  = input.dataset.caisseId;
            const caisseNom = input.dataset.caisseNom;
            const amendeId  = input.dataset.amendeId;

            const now = new Date();
            membre.operations.push({
                motif: 'Ventilation sur table — ' + caisseNom,
                montant: montant,
                typeAmende: 'financier',
                statut: 'regle',
                date: now,
                dateReglement: now,
                timestampEnregistrement: now.toISOString(),
                heureEnregistrement: now.toLocaleTimeString('fr-FR'),
                destination: caisseId,
                session: associationData.sessionActuelle || 1,
                reunion: associationData.reunionActuelle || 1
            });
            associationData.comptabilite[caisseId] = (associationData.comptabilite[caisseId] || 0) + montant;
            totalVentile += montant;

            // Clôture de l'amende associée
            if (amendeId && amendeId !== 'undefined') {
                const configA = configAmendes.find(a => a.id.toString() === amendeId);
                if (configA) {
                    const amendeOp = membre.operations.find(o => o.statut === 'du' && o.motif === configA.libelle);
                    if (amendeOp) amendeOp.statut = 'regle';
                }
            }
        }
    });

    document.querySelectorAll('.toggle-nature-amende:checked').forEach(cb => {
        const amendeId = cb.dataset.amendeId;
        const amendeLibelle = cb.dataset.amendeLibelle;
        const now = new Date();
        membre.operations.push({
            motif: amendeLibelle + ' (Réglé en Matériel/Nature)',
            montant: 0,
            typeAmende: 'nature',
            statut: 'regle',
            date: now,
            dateReglement: now,
            timestampEnregistrement: now.toISOString(),
            heureEnregistrement: now.toLocaleTimeString('fr-FR'),
            destination: 'nature'
        });
        nbNature++;
        
        // Clôture de l'amende associée
        const amendeOp = membre.operations.find(o => o.statut === 'du' && o.motif === amendeLibelle);
        if (amendeOp) amendeOp.statut = 'regle';
    });

    if (totalVentile === 0 && nbNature === 0) return alert('Aucun montant saisi et aucune amende en nature cochée.');

    sauvegarder();
    
    // Actualiser le bilan et filtrer le tableau sans passer au suivant
    renderVentilationRows(membreId);
    afficherStatutMembre(membreId);
    resetTableFields();

    let msg = '✅ Ventilation enregistrée pour ' + membre.nom;
    if (totalVentile > 0) msg += '\\n💵 Cash ventilé : ' + formatAmount(totalVentile);
    if (nbNature > 0)     msg += '\\n📦 Amendes en nature réglées : ' + nbNature;
    alert(msg);
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── MODULE SANCTIONS EN SÉANCE (session.html) ──

function chargerSanctionsUI() {
    const select = document.getElementById('select-membre-sanction');
    const container = document.getElementById('sanctions-buttons-container');
    if (!select || !container) return;

    // Remplir le sélecteur
    select.innerHTML = '<option value="">— Sélectionner le membre —</option>';
    associationData.membres.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.nom.toUpperCase();
        select.appendChild(opt);
    });

    // Générer les boutons
    if (configAmendes.length === 0) {
        container.innerHTML = '<div style="color:var(--muted); padding:10px;">Aucune amende configurée. Allez dans "Configuration" pour en créer.</div>';
    } else {
        container.innerHTML = configAmendes.map(a => {
            const isNature = a.typeAmende === 'nature';
            const label = isNature ? '📦 ' + escHtml(a.libelle) + ' (' + escHtml(String(a.valeur)) + ')' : '⚠️ ' + escHtml(a.libelle) + ' (' + formatAmount(a.valeur) + ')';
            return '<button class="btn-add" style="background:#e74c3c; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-size:0.8rem; cursor:pointer;" onclick="appliquerSanctionUI(\'' + a.id + '\')">' + label + '</button>';
        }).join('');
    }
}

function onSanctionMembreChange() {
    const select = document.getElementById('select-membre-sanction');
    const container = document.getElementById('sanctions-buttons-container');
    if (select.value) {
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}

function appliquerSanctionUI(amendeIdStr) {
    const amendeId = Number(amendeIdStr);
    const select = document.getElementById('select-membre-sanction');
    const membreId = select.value;
    if (!membreId) return alert('Veuillez sélectionner un membre.');

    const membre = associationData.membres.find(m => m.id === membreId);
    const amende = configAmendes.find(a => a.id === amendeId);
    if (!membre || !amende) return;

    // Utilise la logique de base
    appliquerInfraction(membreId, amendeId);

    alert('⚠️ Pénalité "' + amende.libelle + '" appliquée à ' + membre.nom + ' !');

    // Actualiser le tableau du haut si c'est le même membre
    const selectHaut = document.getElementById('select-membre-table');
    if (selectHaut && selectHaut.value === membreId) {
        if (typeof renderVentilationRows === 'function') renderVentilationRows(membreId);
        if (typeof afficherStatutMembre === 'function') afficherStatutMembre(membreId);
    }
    
    // Réinitialiser le sélecteur des sanctions
    select.value = '';
    onSanctionMembreChange();
}
