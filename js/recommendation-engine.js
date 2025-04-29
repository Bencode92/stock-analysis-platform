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

// Règles de scoring configurables
const scoringRules = [
    // Règles pour la protection du patrimoine
    {
        id: 'essential_patrimony_protection',
        description: 'Protection du patrimoine essentielle',
        condition: answers => answers.patrimony_protection === 'essential',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    // ... Autres règles de scoring (non modifiées) ...
];
window.scoringRules = scoringRules;

class RecommendationEngine {
    constructor() {
        console.log("Initialisation du RecommendationEngine");
        
        // Version améliorée du constructeur - ne plante plus immédiatement
        if (!window.legalStatuses) {
            console.warn("`window.legalStatuses` n'est pas encore disponible - le moteur sera initialisé plus tard");
            // Ne pas lever d'erreur ici, juste signaler
            return;
        }
        
        // Si legalStatuses est disponible, initialiser le moteur
        this.initializeEngine();
    }
    
    // Nouvelle méthode pour initialiser une fois que les données sont disponibles
    initializeEngine() {
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
        
        // Vérifier que le moteur est correctement initialisé
        if (!this.filteredStatuses && window.legalStatuses) {
            console.log("Initialisation tardive du moteur de recommandation");
            this.initializeEngine();
        }
        
        // Si toujours pas initialisé, impossible de calculer
        if (!this.filteredStatuses) {
            console.error("Impossible de calculer les recommandations: moteur non initialisé");
            return [];
        }
        
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
        // S'assurer que filteredStatuses est disponible
        this.filteredStatuses = window.legalStatuses ? {...window.legalStatuses} : {};
        this.scores = {};
        this.weightedScores = {};
        this.incompatibles = [];
        this.auditTrail = {
            exclusions: [],
            weightingRules: [],
            scores: {}
        };
    }

    // ... Reste des méthodes de la classe (non modifiées) ...
}
window.RecommendationEngine = RecommendationEngine;

// Méthode statique create pour initialiser le moteur de manière asynchrone
RecommendationEngine.create = function() {
    return new Promise((resolve, reject) => {
        const waitForLegalStatuses = () => {
            if (window.legalStatuses) {
                try {
                    const engine = new RecommendationEngine();
                    
                    // Si le moteur n'a pas pu être initialisé, attendre l'événement
                    if (!engine.filteredStatuses) {
                        console.log("RecommendationEngine créé mais pas encore initialisé, attente de l'événement legalStatusesLoaded");
                        document.addEventListener('legalStatusesLoaded', () => {
                            engine.initializeEngine();
                            window.recommendationEngine = engine;
                            resolve(engine);
                        }, { once: true });
                    } else {
                        window.recommendationEngine = engine;
                        resolve(engine);
                    }
                } catch (error) {
                    reject(error);
                }
            } else {
                console.log("Attente du chargement de legal-status-data.js...");
                
                // Écouter l'événement de chargement
                document.addEventListener('legalStatusesLoaded', () => {
                    try {
                        console.log("Événement legalStatusesLoaded détecté, création du moteur");
                        const engine = new RecommendationEngine();
                        engine.initializeEngine();
                        window.recommendationEngine = engine;
                        resolve(engine);
                    } catch (error) {
                        reject(error);
                    }
                }, { once: true });
                
                // Mettre un timeout au cas où l'événement ne serait jamais déclenché
                setTimeout(() => {
                    if (!window.legalStatuses) {
                        reject(new Error("Timeout: window.legalStatuses n'a pas été chargé dans le délai imparti"));
                    } else {
                        waitForLegalStatuses();
                    }
                }, 5000);
            }
        };
        
        waitForLegalStatuses();
    });
};

// Fonction de création d'instance compatible avec l'ancien code
window.createRecommendationEngine = function() {
    return RecommendationEngine.create();
};

// Compatibilité avec l'ancien système - Définir les objets nécessaires dans window
window.FormeJuridiqueDB = {
    structures: window.legalStatuses ? Object.values(window.legalStatuses) : [],
    getById: function(id) {
        return window.legalStatuses ? window.legalStatuses[id] : null;
    }
};

window.ScoringEngine = {
    SCORE_MAX: 100,
    calculerScore: function(forme, userResponses) {
        // Logique simplifiée qui sera remplacée par le vrai calcul dans RecommendationEngine
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

// NOUVEAU: Ajouter le pont de compatibilité pour l'ancien système
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

// Exposer la classe et une instance de manière synchrone
try {
    // Rendre la classe disponible globalement (déjà fait plus haut)
    window.RecommendationEngine = RecommendationEngine;
    window.scoringRules = scoringRules;
    console.log("Classe RecommendationEngine exposée avec succès");
    
    // NE PAS créer d'instance immédiatement - ce sera fait de manière asynchrone
    window.engineLoadingCompleted = true;
} catch (e) {
    console.error("Erreur lors de l'exposition du moteur de recommandation:", e);
}

// Déclencher l'événement une seule fois, à la fin du fichier
// après que tout soit chargé et disponible
console.log("Déclenchement de l'événement recommendationEngineReady depuis la fin du fichier");
document.dispatchEvent(new CustomEvent('recommendationEngineReady'));
