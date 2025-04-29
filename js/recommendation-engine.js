// recommendation-engine.js - Analyse des réponses et génération de recommandations

// Gestionnaire d'erreurs spécifique pour ce fichier
window.addEventListener('error', (e) => {
    if (e.filename.includes('recommendation-engine.js')) {
        console.error('Erreur bloquante dans recommendation-engine.js', e);
    }
}, true);

// Logs de débogage pour traquer le chargement
console.log("Chargement du recommendation-engine.js commencé");
window.engineLoadingStarted = true;

// Les règles de scoring configurables sont définies globalement
const scoringRules = [
    // Règles pour la protection du patrimoine...
    // (règles existantes inchangées)
];
window.scoringRules = scoringRules;

class RecommendationEngine {
    constructor() {
        console.log("Initialisation du RecommendationEngine");
        
        // Transformer le constructeur en une Promise si legalStatuses n'est pas disponible
        if (!window.legalStatuses) {
            console.warn("legalStatuses pas encore disponible, attente asynchrone...");
            
            return new Promise((resolve, reject) => {
                // Timeout de secours (5 secondes)
                const timeout = setTimeout(() => {
                    reject(new Error("legalStatuses toujours vide après 5 secondes"));
                }, 5000);
                
                // On se branche sur l'événement déclenché à la fin de legal-status-data.js
                document.addEventListener('legalStatusesLoaded', () => {
                    clearTimeout(timeout);
                    if (window.legalStatuses) {
                        console.log("legalStatuses est maintenant disponible, création d'une vraie instance");
                        // On relance le constructeur qui fonctionnera cette fois
                        resolve(new RecommendationEngine());
                    } else {
                        reject(new Error("legalStatuses est toujours indéfini après l'événement legalStatusesLoaded"));
                    }
                }, { once: true }); // once: true pour éviter des doublons d'écouteurs
            });
        }
        
        // Sinon, construction normale
        this.answers = {};
        this.filteredStatuses = {...window.legalStatuses};
        this.scores = {};
        this.weightedScores = {};
        this.priorityWeights = {};
        this.incompatibles = [];
        this.auditTrail = {
            exclusions: [],
            weightingRules: [],
            scores: {}
        };
        
        // Paramètres des seuils pour 2025
        this.thresholds2025 = {
            micro: {
                bic_sales: 188700,
                bic_service: 77700,
                bnc: 77700
            },
            is_reduced_rate_limit: 42500
        };
        
        // Cache pour la mémoïsation
        this.memoizedResults = {};
        
        // Dictionnaire des alternatives pour chaque cas d'incompatibilité
        this.alternativeSuggestions = {
            'MICRO': {
                'ca-depasse-seuil': {
                    alternatives: ['EURL', 'SASU'], 
                    explanation: "Optez pour une EURL ou SASU permettant des volumes d'activité plus importants"
                },
                'ordre-professionnel': {
                    alternatives: ['SELARL', 'SELAS'],
                    explanation: "Choisissez une structure adaptée aux professions réglementées comme une SELARL ou SELAS"
                },
                'fundraising': {
                    alternatives: ['SAS', 'SASU'],
                    explanation: "Pour lever des fonds, privilégiez une SAS ou SASU qui facilitent l'entrée d'investisseurs"
                }
            },
            'EI': {
                'protection-patrimoine': {
                    alternatives: ['EURL', 'SASU'],
                    explanation: "Privilégiez une EURL ou SASU qui offrent une meilleure protection patrimoniale"
                },
                'levee-fonds': {
                    alternatives: ['SASU', 'SAS'],
                    explanation: "Pour lever des fonds, une SASU ou SAS est beaucoup plus adaptée"
                }
            },
            'SNC': {
                'risque-eleve': {
                    alternatives: ['SARL', 'SAS'],
                    explanation: "Pour limiter les risques personnels, préférez une SARL ou SAS avec responsabilité limitée"
                }
            }
        };
        console.log("RecommendationEngine initialisé avec succès");
    }

    /**
     * Calculer les recommandations basées sur les réponses
     * @param {Object} answers - Les réponses au questionnaire
     */
    calculateRecommendations(answers) {
        console.log("Début du calcul des recommandations", answers);
        // Mémoïsation - vérifier si les résultats sont déjà en cache
        const answersKey = JSON.stringify(answers);
        if (this.memoizedResults[answersKey]) {
            console.log('Résultats récupérés du cache');
            return this.memoizedResults[answersKey];
        }
        
        this.answers = answers;
        
        // Réinitialiser les résultats
        this.resetResults();
        
        // Appliquer les filtres d'exclusion
        this.applyExclusionFilters();
        
        // Calculer les poids des priorités
        this.calculatePriorityWeights();
        
        // Calculer les scores pour chaque statut juridique
        this.calculateScores();
        
        // Obtenir les recommandations finales (top 3)
        const recommendations = this.getTopRecommendations(3);
        
        // Afficher les résultats
        this.displayResults(recommendations);
        
        // Mémoïsation - stocker les résultats en cache
        this.memoizedResults[answersKey] = recommendations;
        
        console.log("Fin du calcul des recommandations", recommendations);
        return recommendations;
    }
    
    /**
     * Réinitialiser les résultats pour un nouveau calcul
     */
    resetResults() {
        // Vérifier à nouveau que window.legalStatuses est disponible
        if (!window.legalStatuses) {
            console.error("window.legalStatuses n'est pas disponible dans resetResults");
            throw new Error(
                "`window.legalStatuses` est introuvable – vérifie le chargement de legal-status-data.js"
            );
        }
        
        this.filteredStatuses = {...window.legalStatuses};
        this.scores = {};
        this.weightedScores = {};
        this.incompatibles = [];
        this.auditTrail = {
            exclusions: [],
            weightingRules: [],
            scores: {}
        };
    }

    // Le reste des méthodes de la classe reste inchangé
    // ...

    // (Insérez ici toutes les autres méthodes de la classe sans les modifier)
}

// Exposer la classe au niveau global
window.RecommendationEngine = RecommendationEngine;

// Fonction utilitaire pour créer une instance du moteur de manière sûre
window.createRecommendationEngine = function() {
    return new Promise((resolve, reject) => {
        try {
            const engineOrPromise = new RecommendationEngine();
            
            // Si le constructeur a retourné une Promise
            if (engineOrPromise instanceof Promise) {
                engineOrPromise
                    .then(engine => {
                        window.recommendationEngine = engine;
                        window.engineLoadingCompleted = true;
                        console.log("Moteur de recommandation instancié avec succès (asynchrone)");
                        document.dispatchEvent(new CustomEvent('recommendationEngineReady'));
                        resolve(engine);
                    })
                    .catch(error => {
                        console.error("Échec de la création du moteur:", error);
                        reject(error);
                    });
            } else {
                // Si le constructeur a retourné une instance directement
                window.recommendationEngine = engineOrPromise;
                window.engineLoadingCompleted = true;
                console.log("Moteur de recommandation instancié avec succès (synchrone)");
                document.dispatchEvent(new CustomEvent('recommendationEngineReady'));
                resolve(engineOrPromise);
            }
        } catch (e) {
            console.error("Erreur lors de la création du moteur:", e);
            reject(e);
        }
    });
};

// Compatibilité avec l'ancien système
window.FormeJuridiqueDB = {
    structures: window.legalStatuses ? Object.values(window.legalStatuses) : [],
    getById: function(id) {
        return window.legalStatuses ? window.legalStatuses[id] : null;
    }
};

window.ScoringEngine = {
    SCORE_MAX: 100,
    calculerScore: function(forme, userResponses) {
        // Pont de compatibilité vers le nouveau système
        if (window.recommendationEngine) {
            const engine = window.recommendationEngine;
            
            // Trouver la forme correspondante dans les statuts filtrés
            const statusId = Object.keys(engine.filteredStatuses).find(id => 
                engine.filteredStatuses[id].id === forme.id
            );
            
            if (statusId) {
                const score = Math.round(engine.weightedScores[statusId]);
                
                // Déterminer la compatibilité
                let compatibilite = 'PEU ADAPTÉ';
                if (score >= 80) compatibilite = 'RECOMMANDÉ';
                else if (score >= 65) compatibilite = 'COMPATIBLE';
                else if (score <= 25) compatibilite = 'DÉCONSEILLÉ';
                
                return {
                    formeId: forme.id,
                    forme: forme,
                    score: score,
                    scoreCriteresStructurels: Math.round(score * 0.6), // Approximation
                    scoreObjectifs: Math.round(score * 0.4), // Approximation
                    compatibilite: compatibilite,
                    details: engine.getStrengths(statusId),
                    scoreDetails: { pourcentage: score }
                };
            }
        }
        
        return {
            formeId: forme.id,
            forme: forme,
            score: 85,
            scoreCriteresStructurels: 55,
            scoreObjectifs: 30,
            compatibilite: 'RECOMMANDÉ',
            details: ['Adapté à votre profil', 'Avantage fiscal', 'Protection du patrimoine'],
            scoreDetails: { pourcentage: 85 }
        };
    }
};

window.SimulationsFiscales = {
    simulerImpactFiscal: function(forme, caSimulation, params) {
        // Logique simplifiée qui sera remplacée par le vrai calcul
        return {
            chargesSociales: caSimulation * 0.25,
            impot: caSimulation * 0.15,
            revenueNet: caSimulation * 0.6
        };
    }
};

window.ResultsManager = {
    // Pont vers la nouvelle méthode d'affichage
    generateResults: function(customParams) {
        if (window.recommendationEngine) {
            // Convertir les paramètres de l'ancien format vers le nouveau format si nécessaire
            const recommendations = window.recommendationEngine.calculateRecommendations(window.userResponses || {});
            return recommendations;
        } else {
            console.error("Le moteur de recommandation n'est pas disponible");
            return [];
        }
    },
    
    // Réutiliser la méthode d'affichage de la nouvelle version
    displayResults: function(results, incompatibles) {
        if (window.recommendationEngine) {
            window.recommendationEngine.displayResults(results);
        } else {
            console.error("La méthode d'affichage n'est pas disponible");
        }
    }
};

// Ne pas créer d'instance immédiatement - ça sera fait de manière asynchrone
console.log("Fin du chargement de recommendation-engine.js");
