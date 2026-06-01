/*
 * app-dual-storage.js
 * Module de stockage double pour l'application TONTINE
 * Permet de basculer entre localStorage (mode internet) et API serveur (mode localhost)
 */

// Détection de l'environnement
let isLocalhost = false;
let useLocalStorage = true;

function detectEnvironment() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // Détecte si on est sur localhost (peu importe le port)
    // Si c'est localhost ou 127.0.0.1, on utilise l'API
    isLocalhost = (hostname === 'localhost' || hostname === '127.0.0.1');
    useLocalStorage = !isLocalhost;
    
    console.log(`[Dual Storage] Environnement détecté: ${isLocalhost ? 'LOCAL (API)' : 'INTERNET (localStorage)'}`);
    console.log(`[Dual Storage] Hostname: ${hostname}, Port: ${port}`);
}

// Charger les données depuis l'API (mode local)
async function loadDataFromAPI() {
    try {
        const response = await fetch('/api/data-tontine');
        if (!response.ok) {
            throw new Error('Erreur de chargement depuis l\'API');
        }
        const data = await response.json();
        console.log('[Dual Storage] Données chargées depuis l\'API:', data);
        return data;
    } catch (error) {
        console.error('[Dual Storage] Erreur de chargement depuis l\'API:', error);
        return null;
    }
}

// Sauvegarder les données vers l'API (mode local)
async function saveDataToAPI(data) {
    try {
        const response = await fetch('/api/data-tontine', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Erreur de sauvegarde vers l\'API');
        }
        
        const result = await response.json();
        console.log('[Dual Storage] Données sauvegardées vers l\'API:', result);
        return true;
    } catch (error) {
        console.error('[Dual Storage] Erreur de sauvegarde vers l\'API:', error);
        return false;
    }
}

// Charger les données depuis localStorage (mode internet)
function loadDataFromLocalStorage() {
    try {
        const data = {
            nomAsso: JSON.parse(localStorage.getItem('apbmData')) || {
                nomAsso: '',
                explicationAsso: '',
                sessionActuelle: 1,
                reunionActuelle: 1,
                membres: [],
                comptabilite: {},
                depenses: [],
                reunionsHistorique: []
            },
            config_caisses: JSON.parse(localStorage.getItem('config_caisses')) || [],
            config_amendes: JSON.parse(localStorage.getItem('config_amendes')) || [],
            reglement_interieur: localStorage.getItem('reglement_interieur') || "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur."
        };
        console.log('[Dual Storage] Données chargées depuis localStorage:', data);
        return data;
    } catch (error) {
        console.error('[Dual Storage] Erreur de chargement depuis localStorage:', error);
        return null;
    }
}

// Sauvegarder les données vers localStorage (mode internet)
function saveDataToLocalStorage(data) {
    try {
        if (data.nomAsso) {
            localStorage.setItem('apbmData', JSON.stringify(data.nomAsso));
        }
        if (data.config_caisses) {
            localStorage.setItem('config_caisses', JSON.stringify(data.config_caisses));
        }
        if (data.config_amendes) {
            localStorage.setItem('config_amendes', JSON.stringify(data.config_amendes));
        }
        if (data.reglement_interieur) {
            localStorage.setItem('reglement_interieur', data.reglement_interieur);
        }
        console.log('[Dual Storage] Données sauvegardées vers localStorage');
        return true;
    } catch (error) {
        console.error('[Dual Storage] Erreur de sauvegarde vers localStorage:', error);
        return false;
    }
}

// Fonction principale de chargement des données
async function loadDualStorageData() {
    detectEnvironment();
    
    let data;
    if (isLocalhost) {
        data = await loadDataFromAPI();
    } else {
        data = loadDataFromLocalStorage();
    }
    
    if (data) {
        // Appliquer les données aux variables globales
        if (typeof associationData !== 'undefined') {
            // Si data.nomAsso est un objet (ancienne structure), l'utiliser directement
            // Sinon, reconstruire l'objet depuis les champs plats
            if (data.nomAsso && typeof data.nomAsso === 'object' && !data.nomAsso.nomAsso) {
                // Structure plate du serveur
                associationData.nomAsso = data.nomAsso || '';
                associationData.explicationAsso = data.explicationAsso || '';
                associationData.sessionActuelle = data.sessionActuelle || 1;
                associationData.reunionActuelle = data.reunionActuelle || 1;
                associationData.membres = data.membres || [];
                associationData.comptabilite = data.comptabilite || {};
                associationData.depenses = data.depenses || [];
                associationData.reunionsHistorique = data.reunionsHistorique || [];
            } else if (data.nomAsso && typeof data.nomAsso === 'object') {
                // Ancienne structure imbriquée
                Object.assign(associationData, data.nomAsso);
            }
        }
        if (typeof configCaisses !== 'undefined' && data.config_caisses) {
            configCaisses.length = 0;
            configCaisses.push(...data.config_caisses);
        }
        if (typeof configAmendes !== 'undefined' && data.config_amendes) {
            configAmendes.length = 0;
            configAmendes.push(...data.config_amendes);
        }
        if (typeof reglementInterieur !== 'undefined' && data.reglement_interieur) {
            reglementInterieur = data.reglement_interieur;
        }
        
        // Déclencher un événement personnalisé pour indiquer que les données sont chargées
        const event = new CustomEvent('dataLoaded', { detail: data });
        document.dispatchEvent(event);
    }
    
    return data;
}

// Fonction principale de sauvegarde des données
async function saveDualStorageData() {
    detectEnvironment();
    
    // Structure plate attendue par le serveur
    const data = {
        nomAsso: typeof associationData !== 'undefined' ? (associationData.nomAsso || '') : '',
        explicationAsso: typeof associationData !== 'undefined' ? (associationData.explicationAsso || '') : '',
        sessionActuelle: typeof associationData !== 'undefined' ? (associationData.sessionActuelle || 1) : 1,
        reunionActuelle: typeof associationData !== 'undefined' ? (associationData.reunionActuelle || 1) : 1,
        membres: typeof associationData !== 'undefined' ? (associationData.membres || []) : [],
        comptabilite: typeof associationData !== 'undefined' ? (associationData.comptabilite || {}) : {},
        depenses: typeof associationData !== 'undefined' ? (associationData.depenses || []) : [],
        reunionsHistorique: typeof associationData !== 'undefined' ? (associationData.reunionsHistorique || []) : [],
        config_caisses: typeof configCaisses !== 'undefined' ? configCaisses : [],
        config_amendes: typeof configAmendes !== 'undefined' ? configAmendes : [],
        reglement_interieur: typeof reglementInterieur !== 'undefined' ? reglementInterieur : "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur."
    };
    
    let success;
    if (isLocalhost) {
        success = await saveDataToAPI(data);
    } else {
        success = saveDataToLocalStorage(data);
    }
    
    return success;
}

// Initialisation du dual storage
function initializeDualStorage() {
    console.log('[Dual Storage] Initialisation...');
    
    // Sauvegarder les fonctions originales
    const originalSauvegarder = window.sauvegarder;
    const originalSauvegarderCaisses = window.sauvegarderCaisses;
    const originalSauvegarderAmendes = window.sauvegarderAmendes;
    const originalSauvegarderReglement = window.sauvegarderReglement;
    
    // Attendre que app.js soit chargé
    setTimeout(() => {
        detectEnvironment();
        
        // Override sauvegarder
        window.sauvegarder = async function() {
            if (useLocalStorage) {
                // Mode localStorage : utiliser la fonction originale
                if (originalSauvegarder) {
                    originalSauvegarder();
                } else {
                    localStorage.setItem('apbmData', JSON.stringify(associationData));
                }
            } else {
                // Mode API : sauvegarder via API
                await saveDualStorageData();
            }
        };
        
        // Override sauvegarderCaisses
        window.sauvegarderCaisses = async function() {
            if (useLocalStorage) {
                if (originalSauvegarderCaisses) {
                    originalSauvegarderCaisses();
                } else {
                    localStorage.setItem('config_caisses', JSON.stringify(configCaisses));
                }
            } else {
                await saveDualStorageData();
            }
        };
        
        // Override sauvegarderAmendes
        window.sauvegarderAmendes = async function() {
            if (useLocalStorage) {
                if (originalSauvegarderAmendes) {
                    originalSauvegarderAmendes();
                } else {
                    localStorage.setItem('config_amendes', JSON.stringify(configAmendes));
                }
            } else {
                await saveDualStorageData();
            }
        };
        
        // Override sauvegarderReglement
        window.sauvegarderReglement = async function(texte) {
            reglementInterieur = texte;
            if (useLocalStorage) {
                if (originalSauvegarderReglement) {
                    originalSauvegarderReglement(texte);
                } else {
                    localStorage.setItem('reglement_interieur', texte);
                }
            } else {
                await saveDualStorageData();
            }
        };
        
        console.log('[Dual Storage] Fonctions de sauvegarde override avec succès');
    }, 100);
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initializeDualStorage();
        // Charger les données automatiquement au démarrage
        await loadDualStorageData();
    });
} else {
    (async () => {
        await initializeDualStorage();
        // Charger les données automatiquement au démarrage
        await loadDualStorageData();
    })();
}

// Fonction pour télécharger le fichier JSON (pour admin2)
window.downloadJsonData = async function() {
    try {
        const response = await fetch('/api/data-tontine');
        if (!response.ok) {
            throw new Error('Erreur de téléchargement depuis l\'API');
        }
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data-tontine.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Dual Storage] Fichier data-tontine.json téléchargé avec succès');
    } catch (error) {
        console.error('[Dual Storage] Erreur de téléchargement:', error);
        alert('Erreur lors du téléchargement du fichier JSON');
    }
};

// Exporter les fonctions pour usage externe
window.dualStorage = {
    loadData: loadDualStorageData,
    saveData: saveDualStorageData,
    detectEnvironment: detectEnvironment,
    isLocalhost: () => isLocalhost
};
