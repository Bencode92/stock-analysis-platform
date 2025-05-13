// Extrait corrigé de fiscal-guide.js
function setupSectorOptions() {
    // Trouver les sélecteurs
    const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
    const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
    console.log("Éléments trouvés:", !!secteurSelect, !!tailleSelect);
    
    // Initialiser immédiatement au chargement
    if (secteurSelect && tailleSelect) {
        // Définir les valeurs normalisées
        const secteurValue = secteurSelect.value === "Par défaut" ? "Tous" : secteurSelect.value;
        const tailleValue = tailleSelect.value === "Par défaut" ? "<50" : tailleSelect.value;
        
        window.sectorOptions = {
            secteur: secteurValue,
            taille: tailleValue,
            isDefault: secteurSelect.value === "Par défaut" && tailleSelect.value === "Par défaut"
        };
        
        console.log("Options sectorielles initiales:", window.sectorOptions);
        
        // Ajouter le gestionnaire d'événement pour secteur
        secteurSelect.addEventListener('change', function() {
            const newSecteur = this.value === "Par défaut" ? "Tous" : this.value;
            
            window.sectorOptions = {
                secteur: newSecteur,
                taille: window.sectorOptions.taille,
                isDefault: this.value === "Par défaut" && tailleSelect.value === "Par défaut"
            };
            
            console.log("Options sectorielles mises à jour:", window.sectorOptions);
            
            // Fermer tout modal de détail ouvert
            const openModal = document.querySelector('.detail-modal');
            if (openModal) {
                openModal.remove();
                console.log("Modal de détail fermé pour mise à jour sectorielle");
            }
            
            // Déclencher l'événement de changement
            document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
                detail: window.sectorOptions 
            }));
            
            // Ajouter un effet visuel de mise à jour
            const resultsContainer = document.getElementById('sim-results');
            if (resultsContainer) {
                resultsContainer.classList.add('updating');
                setTimeout(() => resultsContainer.classList.remove('updating'), 500);
            }
            
            // Force une nouvelle comparaison
            runComparison();
        });
        
        // Même logique pour le sélecteur de taille
        tailleSelect.addEventListener('change', function() {
            const newTaille = this.value === "Par défaut" ? "<50" : this.value;
            
            window.sectorOptions = {
                secteur: window.sectorOptions.secteur,
                taille: newTaille,
                isDefault: secteurSelect.value === "Par défaut" && this.value === "Par défaut"
            };
            
            // Même logique que pour le secteur...
            console.log("Options sectorielles mises à jour:", window.sectorOptions);
            
            // Fermer tout modal de détail ouvert
            const openModal = document.querySelector('.detail-modal');
            if (openModal) openModal.remove();
            
            // Déclencher l'événement
            document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { 
                detail: window.sectorOptions 
            }));
            
            // Effet visuel
            const resultsContainer = document.getElementById('sim-results');
            if (resultsContainer) {
                resultsContainer.classList.add('updating');
                setTimeout(() => resultsContainer.classList.remove('updating'), 500);
            }
            
            // Nouvelle comparaison
            runComparison();
        });
    } else {
        // Si les sélecteurs n'existent pas, utiliser des valeurs par défaut
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50",
            isDefault: true
        };
        console.log("Options sectorielles par défaut créées:", window.sectorOptions);
    }
}

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
        const secteurValue = secteurSelect.value === "Par défaut" ? "Tous" : secteurSelect.value;
        const tailleValue = tailleSelect.value === "Par défaut" ? "<50" : tailleSelect.value;
        
        window.sectorOptions = {
            secteur: secteurValue,
            taille: tailleValue,
            isDefault: secteurSelect.value === "Par défaut" && tailleSelect.value === "Par défaut"
        };
        console.log("runComparison: Synchronisation des options sectorielles:", window.sectorOptions);
    } else if (!window.sectorOptions) {
        // Valeurs par défaut si non définies
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50",
            isDefault: true
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
}

// Ajouter à la fin du fichier
document.addEventListener('sectorOptionsChanged', function(e) {
    console.log("ÉVÉNEMENT: Paramètres sectoriels modifiés:", e.detail);
    
    // Mettre à jour tout modal de détail actuellement affiché
    const detailModal = document.querySelector('.detail-modal');
    if (detailModal) {
        const statutId = detailModal.getAttribute('data-statut');
        if (statutId && window.latestSimulationResults) {
            // Forcer la fermeture du modal actuel
            detailModal.remove();
            
            // Recréer avec les nouvelles données après le recalcul
            setTimeout(() => {
                if (window.latestSimulationResults) {
                    showCalculationDetails(statutId, window.latestSimulationResults);
                }
            }, 200);
        }
    }
});