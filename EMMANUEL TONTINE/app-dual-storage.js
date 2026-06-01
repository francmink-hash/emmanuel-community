/**
 * DUAL-STORAGE MODULE FOR EMMANUEL TONTINE
 * Handles switching between LocalStorage (admin) and JSON file (admin2)
 */

let useJsonStorage = false;
let jsonData = null;

function detectStorageType() {
    try {
        const sessionKey = `EMMANUEL_SESSION_${window.location.pathname.split('/').slice(-2, -1)[0].replace(/ /g, '_')}`;
        const sessionData = JSON.parse(localStorage.getItem(sessionKey));
        useJsonStorage = sessionData && sessionData.storageType === 'json';
    } catch (e) {
        useJsonStorage = false;
    }
}

async function loadJsonData() {
    try {
        const response = await fetch('data-tontine.json');
        if (response.ok) {
            jsonData = await response.json();
            return jsonData;
        }
    } catch (e) {
        console.warn('Impossible de charger data-tontine.json, utilisation des données par défaut');
    }
    return null;
}

function downloadJsonData() {
    const dataToExport = {
        nomAsso: associationData.nomAsso,
        explicationAsso: associationData.explicationAsso,
        sessionActuelle: associationData.sessionActuelle,
        reunionActuelle: associationData.reunionActuelle,
        membres: associationData.membres,
        comptabilite: associationData.comptabilite,
        depenses: associationData.depenses,
        reunionsHistorique: associationData.reunionsHistorique,
        config_caisses: configCaisses,
        config_amendes: configAmendes,
        reglement_interieur: reglementInterieur
    };
    
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-tontine.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Override save functions for admin2
const originalSauvegarder = window.sauvegarder;
const originalSauvegarderCaisses = window.sauvegarderCaisses;
const originalSauvegarderAmendes = window.sauvegarderAmendes;
const originalSauvegarderReglement = window.sauvegarderReglement;

// Initialize dual storage
async function initializeDualStorage() {
    detectStorageType();
    
    if (useJsonStorage) {
        const loadedJson = await loadJsonData();
        if (loadedJson) {
            // Override data initialization
            if (typeof associationData !== 'undefined') {
                associationData.nomAsso = loadedJson.nomAsso || '';
                associationData.explicationAsso = loadedJson.explicationAsso || '';
                associationData.sessionActuelle = loadedJson.sessionActuelle || 1;
                associationData.reunionActuelle = loadedJson.reunionActuelle || 1;
                associationData.membres = loadedJson.membres || [];
                associationData.comptabilite = loadedJson.comptabilite || {};
                associationData.depenses = loadedJson.depenses || [];
                associationData.reunionsHistorique = loadedJson.reunionsHistorique || [];
            }
            if (typeof configCaisses !== 'undefined') {
                configCaisses.length = 0;
                configCaisses.push(...(loadedJson.config_caisses || []));
            }
            if (typeof configAmendes !== 'undefined') {
                configAmendes.length = 0;
                configAmendes.push(...(loadedJson.config_amendes || []));
            }
            if (typeof reglementInterieur !== 'undefined') {
                reglementInterieur = loadedJson.reglement_interieur || "Le règlement intérieur de l'association n'a pas encore été rédigé par l'Administrateur.";
            }
            
            // Override save functions to trigger download
            window.sauvegarder = function() {
                if (useJsonStorage) {
                    console.log('Mode JSON: Les modifications seront sauvegardées via téléchargement du fichier JSON');
                    // Show notification for admin2
                    if (document.getElementById('json-save-notification')) {
                        document.getElementById('json-save-notification').style.display = 'block';
                    }
                } else {
                    originalSauvegarder();
                }
            };
            
            window.sauvegarderCaisses = function() {
                if (useJsonStorage) {
                    console.log('Mode JSON: Les caisses seront sauvegardées via téléchargement');
                } else {
                    originalSauvegarderCaisses();
                }
            };
            
            window.sauvegarderAmendes = function() {
                if (useJsonStorage) {
                    console.log('Mode JSON: Les amendes seront sauvegardées via téléchargement');
                } else {
                    originalSauvegarderAmendes();
                }
            };
            
            window.sauvegarderReglement = function(texte) {
                reglementInterieur = texte;
                if (useJsonStorage) {
                    console.log('Mode JSON: Le règlement sera sauvegardé via téléchargement');
                } else {
                    originalSauvegarderReglement(texte);
                }
            };
        }
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDualStorage);
} else {
    initializeDualStorage();
}
