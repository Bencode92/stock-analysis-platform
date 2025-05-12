// Extrait corrigé de fiscal-guide.js
function setupSectorOptions() {
    // Code de débogage pour vérifier si les éléments sont trouvés
    const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
    const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
    console.log("Éléments trouvés:", !!secteurSelect, !!tailleSelect);
    if (secteurSelect) console.log("ID secteur:", secteurSelect.id);
    if (tailleSelect) console.log("ID taille:", tailleSelect.id);
    
    // CORRECTION MAJEURE: Initialiser les options sectorielles immédiatement au chargement
    if (secteurSelect && tailleSelect) {
        console.log("Initialisation des options sectorielles");
        
        // Initialisation immédiate des valeurs
        window.sectorOptions = {
            secteur: secteurSelect.value,
            taille: tailleSelect.value
        };
        console.log("Options sectorielles initiales:", window.sectorOptions);
        
        // CORRECTION: Force le rafraîchissement des valeurs actuelles dans window.sectorOptions
        document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
            detail: window.sectorOptions
        }));
        
        // Ajouter des écouteurs d'événements
        secteurSelect.addEventListener('change', function() {
            window.sectorOptions = {
                secteur: this.value,
                taille: tailleSelect.value
            };
            console.log("Options sectorielles mises à jour:", window.sectorOptions);
            
            // CORRECTION: Déclencher un événement personnalisé pour notifier du changement
            document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
                detail: window.sectorOptions
            }));
            
            // Force une comparaison complète après changement de secteur
            runComparison();
        });
        
        tailleSelect.addEventListener('change', function() {
            window.sectorOptions = {
                secteur: secteurSelect.value,
                taille: this.value
            };
            console.log("Options sectorielles mises à jour:", window.sectorOptions);
            
            // CORRECTION: Déclencher un événement personnalisé pour notifier du changement
            document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
                detail: window.sectorOptions
            }));
            
            // Force une comparaison complète après changement de taille
            runComparison();
        });
    } else {
        console.warn("Sélecteurs de secteur/taille non trouvés - paramètres sectoriels non disponibles");
        
        // CORRECTION: Définir des valeurs par défaut même si les sélecteurs ne sont pas trouvés
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50"
        };
        console.log("Options sectorielles par défaut créées:", window.sectorOptions);
    }
}

// AJOUT: Module d'écoute des événements sectoriels pour le débogage
document.addEventListener('sectorOptionsChanged', function(e) {
    console.log("ÉVÉNEMENT: Paramètres sectoriels modifiés:", e.detail);
    // Vérifier si les options ont bien été appliquées à la variable globale
    console.log("window.sectorOptions actuel:", window.sectorOptions);
});

// CORRECTION: Force la réinitialisation complète lors d'un changement d'onglet
function initFiscalSimulator() {
    console.log("Initialisation du simulateur fiscal simplifié...");
    
    // Attendre que SimulationsFiscales et FiscalUtils soient chargés
    const checkDependencies = setInterval(() => {
        if (window.SimulationsFiscales && window.FiscalUtils) {
            clearInterval(checkDependencies);
            console.log("Dépendances trouvées, configuration du simulateur...");
            
            // CORRECTION: Établir les options sectorielles AVANT la configuration du simulateur
            setupSectorOptions();
            setupSimulator();
        }
    }, 200);
}

// CORRECTION: Assurer la synchronisation des paramètres sectoriels avant chaque simulation
function runComparison() {
    // Récupérer les valeurs du formulaire
    const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
    const marge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
    const ratioSalaire = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;
    const tmi = parseFloat(document.getElementById('sim-tmi').value) || 30;
    
    // CORRECTION CRITIQUE: Toujours synchroniser les options sectorielles avant calcul
    const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
    const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
    
    if (secteurSelect && tailleSelect) {
        // Mise à jour forcée et synchronisée des options sectorielles
        window.sectorOptions = {
            secteur: secteurSelect.value,
            taille: tailleSelect.value
        };
        console.log("runComparison: Synchronisation des options sectorielles:", window.sectorOptions);
    } else if (!window.sectorOptions) {
        // Valeurs par défaut si non définies
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50"
        };
        console.log("runComparison: Options sectorielles par défaut:", window.sectorOptions);
    }
    
    // Récupérer les options avancées
    const modeExpert = true; // Toujours activé
    const useOptimalRatio = document.getElementById('use-optimal-ratio') && document.getElementById('use-optimal-ratio').checked;
    const useAvgChargeRate = document.getElementById('use-avg-charge-rate') && document.getElementById('use-avg-charge-rate').checked;
    const versementLiberatoire = document.getElementById('micro-vfl') && document.getElementById('micro-vfl').checked;
    const gerantMajoritaire = !(document.getElementById('sarl-gerant-minoritaire') && document.getElementById('sarl-gerant-minoritaire').checked);
    
    // Inclure les paramètres sectoriels directement dans les paramètres de base
    const params = {
        ca: ca,
        tauxMarge: useAvgChargeRate ? undefined : marge,
        tauxFrais: useAvgChargeRate ? (1 - marge) : undefined,
        tauxRemuneration: ratioSalaire,
        tmiActuel: tmi,
        modeExpert: modeExpert,
        gerantMajoritaire: gerantMajoritaire,
        // Forcer l'inclusion des paramètres sectoriels
        secteur: window.sectorOptions.secteur,
        taille: window.sectorOptions.taille
    };

    // Logging des paramètres pour débogage
    console.log("Paramètres complets:", params);
    console.log("Options sectorielles utilisées:", window.sectorOptions);
    
    // Reste de la fonction runComparison inchangé...
