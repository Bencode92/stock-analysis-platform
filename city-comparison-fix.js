// Voici les corrections à appliquer dans city-comparison.js

// CORRECTION 1: Remplacer la méthode addTargetModeUI() (environ ligne 108)
// par celle-ci qui place correctement l'élément info-message DANS #target-mode-options:

addTargetModeUI() {
    // Vérifier si déjà ajouté
    if (document.getElementById('target-mode-section')) return;
    
    const comparisonInfo = document.querySelector('#city-comparison-panel .comparison-info');
    if (!comparisonInfo) return;
    
    const targetSection = document.createElement('div');
    targetSection.id = 'target-mode-section';
    targetSection.className = 'target-mode-section mt-4 p-4 bg-black/30 rounded-lg';
    targetSection.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" id="target-mode-toggle" class="mr-3">
                <span class="font-medium">Mode objectif de cash-flow</span>
            </label>
            <span class="badge badge-primary">Nouveau</span>
        </div>
        
        <div class="text-sm text-gray-400 mb-3">
            <i class="fas fa-info-circle mr-1"></i>
            <span id="mode-description">
                Quand cette option est décochée, l'outil privilégie le revenu locatif net le plus élevé.
            </span>
        </div>
        
        <div id="target-mode-options" class="hidden mt-4 space-y-3">
            <div class="grid grid-2 gap-4">
                <div class="form-group">
                    <label class="form-label text-sm">Cash-flow mensuel souhaité</label>
                    <div class="form-input-wrapper">
                        <input type="number" id="target-cashflow-input" class="form-input" value="1000" step="100">
                        <span class="form-addon-text">€/mois</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label text-sm">Nombre de biens</label>
                    <select id="target-properties-count" class="form-input">
                        <option value="1">1 bien</option>
                        <option value="2">2 biens</option>
                        <option value="3">3 biens</option>
                        <option value="4">4 biens</option>
                        <option value="5">5 biens</option>
                    </select>
                </div>
            </div>
            
            <!-- IMPORTANT: L'élément info-message est maintenant DANS #target-mode-options -->
            <div class="info-message text-sm">
                <i class="fas fa-info-circle mr-2"></i>
                <span id="target-info-text">Le système calculera la surface nécessaire dans chaque ville pour atteindre 1000€/mois.</span>
            </div>
        </div>
    `;
    
    comparisonInfo.insertAdjacentElement('afterend', targetSection);
    
    // Événements
    document.getElementById('target-mode-toggle').addEventListener('change', (e) => {
        this.targetMode = e.target.checked;
        document.getElementById('target-mode-options').classList.toggle('hidden', !this.targetMode);
        
        // Mise à jour de la description
        const description = document.getElementById('mode-description');
        if (this.targetMode) {
            description.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Mode activé : l\'outil privilégie le cash-flow mensuel le plus élevé.';
        } else {
            description.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Mode désactivé : l\'outil privilégie le revenu locatif net le plus élevé.';
        }
        
        const btnLaunch = document.getElementById('btn-launch-comparison');
        if (btnLaunch) {
            btnLaunch.innerHTML = this.targetMode 
                ? '<i class="fas fa-bullseye"></i> Calculer investissement nécessaire'
                : '<i class="fas fa-rocket"></i> Lancer la comparaison';
        }
    });
    
    document.getElementById('target-cashflow-input').addEventListener('input', (e) => {
        this.targetCashflow = parseFloat(e.target.value) || 0;
        // CORRECTION: Utiliser getElementById au lieu de querySelector
        const infoText = document.getElementById('target-info-text');
        if (infoText) {
            infoText.textContent = `Le système calculera la surface nécessaire dans chaque ville pour atteindre ${this.targetCashflow}€/mois.`;
        }
    });
    
    document.getElementById('target-properties-count').addEventListener('change', (e) => {
        this.numberOfProperties = parseInt(e.target.value);
    });
}


// CORRECTION 2: Ajouter vérification dans la méthode calculateOptimalInvestment()
// pour vérifier que chercheSurfaceObjectifCashflow existe bien:

async calculateOptimalInvestment(ville, type, pieceData, targetCashflow) {
    const originalPrixM2 = this.simulateur.params.communs.prixM2;
    const originalLoyerM2 = this.simulateur.params.communs.loyerM2;
    
    this.simulateur.params.communs.prixM2 = pieceData.prix_m2;
    this.simulateur.params.communs.loyerM2 = pieceData.loyer_m2;
    
    try {
        // VÉRIFICATION IMPORTANTE: S'assurer que la méthode existe
        if (!this.simulateur.chercheSurfaceObjectifCashflow) {
            console.error('❌ La méthode chercheSurfaceObjectifCashflow n\'existe pas dans le simulateur');
            console.log('📋 Méthodes disponibles:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.simulateur)).filter(m => m.startsWith('cherche')));
            
            // Fallback : utiliser une approche manuelle
            return this.calculateOptimalInvestmentManual(ville, type, pieceData, targetCashflow);
        }
        
        // Utiliser la nouvelle méthode chercheSurfaceObjectifCashflow pour les deux modes
        const resultClassique = this.simulateur.chercheSurfaceObjectifCashflow('classique', targetCashflow);
        const resultEncheres = this.simulateur.chercheSurfaceObjectifCashflow('encheres', targetCashflow);
        
        // Déterminer le meilleur mode et résultat
        let bestResult = null;
        let mode = '';
        
        if (!resultClassique && !resultEncheres) {
            console.log(`⚠️ Aucune solution pour ${ville.nom} - ${type} avec objectif ${targetCashflow}€/mois`);
            return null;
        }
        
        if (!resultClassique) {
            bestResult = resultEncheres;
            mode = 'encheres';
        } else if (!resultEncheres) {
            bestResult = resultClassique;
            mode = 'classique';
        } else {
            // Comparer les rendements
            if (resultEncheres.rendementNet > resultClassique.rendementNet) {
                bestResult = resultEncheres;
                mode = 'encheres';
            } else {
                bestResult = resultClassique;
                mode = 'classique';
            }
        }
        
        if (!bestResult) return null;
        
        // Construire le résultat formaté
        return {
            ville: ville.nom,
            departement: ville.departement,
            type: type,
            mode: mode,
            surface: Math.round(bestResult.surface),
            prixAchat: bestResult.prixAchat,
            coutTotal: bestResult.coutTotal,
            apportNecessaire: bestResult.coutTotal * 0.1,
            apportTotal: bestResult.coutTotal * 0.1 * this.numberOfProperties,
            mensualite: bestResult.mensualite,
            loyerNet: bestResult.loyerNet,
            cashFlow: bestResult.cashFlow,
            rendement: bestResult.rendementNet
        };
        
    } catch (error) {
        console.error('❌ Erreur dans calculateOptimalInvestment:', error);
        return null;
    } finally {
        // Restaurer les paramètres originaux
        this.simulateur.params.communs.prixM2 = originalPrixM2;
        this.simulateur.params.communs.loyerM2 = originalLoyerM2;
    }
}

// AJOUT: Méthode de fallback manuel si chercheSurfaceObjectifCashflow n'existe pas
calculateOptimalInvestmentManual(ville, type, pieceData, targetCashflow) {
    console.log('⚠️ Utilisation de la méthode manuelle pour', ville.nom, type);
    
    // Recherche binaire pour trouver la surface optimale
    let minSurface = 20;
    let maxSurface = 120;
    let bestResult = null;
    let bestMode = '';
    let iterations = 0;
    const maxIterations = 20;
    
    while (maxSurface - minSurface > 0.5 && iterations < maxIterations) {
        iterations++;
        const testSurface = (minSurface + maxSurface) / 2;
        
        // Tester avec cette surface
        const resultClassique = this.simulateur.calculeTout(testSurface, 'classique');
        const resultEncheres = this.simulateur.calculeTout(testSurface, 'encheres');
        
        let closestResult = null;
        let mode = '';
        
        // Choisir le résultat avec le meilleur cash-flow
        if (resultClassique && resultEncheres) {
            if (Math.abs(resultClassique.cashFlow - targetCashflow) < Math.abs(resultEncheres.cashFlow - targetCashflow)) {
                closestResult = resultClassique;
                mode = 'classique';
            } else {
                closestResult = resultEncheres;
                mode = 'encheres';
            }
        } else if (resultClassique) {
            closestResult = resultClassique;
            mode = 'classique';
        } else if (resultEncheres) {
            closestResult = resultEncheres;
            mode = 'encheres';
        }
        
        if (closestResult) {
            if (closestResult.cashFlow >= targetCashflow) {
                // On a trouvé une solution viable, essayer plus petit
                bestResult = closestResult;
                bestMode = mode;
                maxSurface = testSurface;
            } else {
                // Il faut plus grand
                minSurface = testSurface;
            }
        } else {
            break; // Aucune solution viable
        }
    }
    
    if (!bestResult) {
        console.log(`❌ Aucune solution trouvée pour ${ville.nom} ${type}`);
        return null;
    }
    
    console.log(`✅ Solution trouvée: ${bestMode} - ${bestResult.surface.toFixed(1)}m² - CF: ${bestResult.cashFlow.toFixed(0)}€/mois`);
    
    return {
        ville: ville.nom,
        departement: ville.departement,
        type: type,
        mode: bestMode,
        surface: Math.round(bestResult.surface),
        prixAchat: bestResult.prixAchat,
        coutTotal: bestResult.coutTotal,
        apportNecessaire: bestResult.coutTotal * 0.1,
        apportTotal: bestResult.coutTotal * 0.1 * this.numberOfProperties,
        mensualite: bestResult.mensualite,
        loyerNet: bestResult.loyerNet,
        cashFlow: bestResult.cashFlow,
        rendement: bestResult.rendementNet
    };
}