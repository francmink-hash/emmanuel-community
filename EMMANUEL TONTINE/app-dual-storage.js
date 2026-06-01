/**
 * DUAL-STORAGE MODULE FOR EMMANUEL TONTINE
 * Détecte automatiquement l'environnement et bascule entre :
 * - API (localhost:8080 avec serveur) → lit/écrit data-tontine.json via API
 * - localStorage (Vercel/Internet) → lit/écrit dans le localStorage du navigateur
 */

// Détection de l'environnement
let isLocalhost = false;
let useLocalStorage = true;

function detectEnvironment() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // Détecte si on est sur localhost:8080
    isLocalhost = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '8080';
    useLocalStorage = !isLocalhost;
    
    console.log(`[Dual Storage] Environnement détecté: ${isLocalhost ? 'LOCAL (API)' : 'INTERNET (localStorage)'}`);
    console.log(`[Dual Storage] Hostname: ${hostname}, Port: ${port}`);
}

// Charger les données depuis l'API (mode local)
async function loadDataFromAPI() {
    try {
        const response = await fetch('/api/data-tontine');
        if (response.ok) {
            const data = await response.json();
            console.log('[Dual Storage] Données chargées depuis l\'API:', data);
            return data;
        } else {
            console.error('[Dual Storage] Erreur API:', response.status);
            return null;
        }
    } catch (e) {
        console.error('[Dual Storage] Erreur lors du chargement API:', e);
        return null;
    }
}

// Sauvegarder les données via l'API (mode local)
async function saveDataToAPI(data) {
    try {
        const response = await fetch('/api/data-tontine', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            console.log('[Dual Storage] Données sauvegardées via l\'API');
            return true;
        } else {
            console.error('[Dual Storage] Erreur sauvegarde API:', response.status);
            return false;
        }
    } catch (e) {
        console.error('[Dual Storage] Erreur lors de la sauvegarde API:', e);
        return false;
    }
}

// Charger les données depuis localStorage (mode Internet)
function loadDataFromLocalStorage() {
    try {
        const data = {
            nomAsso: localStorage.getItem('apbmData') ? JSON.parse(localStorage.getItem('apbmData')) : {
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
        
        // Fusionner les données principales
        if (typeof localStorage.getItem('apbmData') === 'string') {
            data.nomAsso = JSON.parse(localStorage.getItem('apbmData'));
        }
        
        console.log('[Dual Storage] Données chargées depuis localStorage');
        return data;
    } catch (e) {
        console.error('[Dual Storage] Erreur lors du chargement localStorage:', e);
        return null;
    }
}

// Sauvegarder les données dans localStorage (mode Internet)
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
        console.log('[Dual Storage] Données sauvegardées dans localStorage');
        return true;
    } catch (e) {
        console.error('[Dual Storage] Erreur lors de la sauvegarde localStorage:', e);
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
        if (typeof associationData !== 'undefined' && data.nomAsso) {
            Object.assign(associationData, data.nomAsso);
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
    }
    
    return data;
}

// Fonction principale de sauvegarde des données
async function saveDualStorageData() {
    detectEnvironment();
    
    const data = {
        nomAsso: typeof associationData !== 'undefined' ? associationData : null,
        config_caisses: typeof configCaisses !== 'undefined' ? configCaisses : [],
        config_amendes: typeof configAmendes !== 'undefined' ? configAmendes : [],
        reglement_interieur: typeof reglementInterieur !== 'undefined' ? reglementInterieur : null
    };
    
    let success;
    if (isLocalhost) {
        success = await saveDataToAPI(data);
    } else {
        success = saveDataToLocalStorage(data);
    }
    
    return success;
}

// Override des fonctions de sauvegarde existantes
let originalSauvegarder = null;
let originalSauvegarderCaisses = null;
let originalSauvegarderAmendes = null;
let originalSauvegarderReglement = null;

// Initialisation du dual storage
async function initializeDualStorage() {
    detectEnvironment();
    
    // Charger les données
    await loadDualStorageData();
    
    // Attendre que app.js soit chargé pour override les fonctions
    setTimeout(() => {
        if (typeof window.sauvegarder === 'function') {
            originalSauvegarder = window.sauvegarder;
        }
        if (typeof window.sauvegarderCaisses === 'function') {
            originalSauvegarderCaisses = window.sauvegarderCaisses;
        }
        if (typeof window.sauvegarderAmendes === 'function') {
            originalSauvegarderAmendes = window.sauvegarderAmendes;
        }
        if (typeof window.sauvegarderReglement === 'function') {
            originalSauvegarderReglement = window.sauvegarderReglement;
        }
        
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
    document.addEventListener('DOMContentLoaded', initializeDualStorage);
} else {
    initializeDualStorage();
}

// Exporter les fonctions pour usage externe
window.dualStorage = {
    isLocalhost: () => isLocalhost,
    useLocalStorage: () => useLocalStorage,
    loadData: loadDualStorageData,
    saveData: saveDualStorageData
};
