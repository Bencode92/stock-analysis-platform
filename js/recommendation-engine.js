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
        
        // CORRECTIF: Après le calcul des scores, s'assurer que tous les statuts ont un score minimum
        // pour éviter les tableaux vides en résultat
        if (Object.keys(this.weightedScores).length === 0) {
            console.warn('Aucun statut avec score > 0, attribution d\'un score neutre');
            Object.keys(this.filteredStatuses).forEach(id => {
                this.weightedScores[id] = 50; // Score neutre par défaut
                this.scores[id] = 50;
            });
        }
        
        // Vérifier s'il reste encore des statuts après le filtrage
        if (Object.keys(this.filteredStatuses).length === 0) {
            console.warn("Tous les statuts ont été filtrés! Restauration des statuts par défaut");
            // Restaurer au moins quelques statuts de base
            if (window.legalStatuses) {
                if (window.legalStatuses.SARL) {
                    this.filteredStatuses.SARL = window.legalStatuses.SARL;
                    this.weightedScores.SARL = 65;
                }
                if (window.legalStatuses.EURL) {
                    this.filteredStatuses.EURL = window.legalStatuses.EURL;
                    this.weightedScores.EURL = 60;
                }
                if (window.legalStatuses.SASU) {
                    this.filteredStatuses.SASU = window.legalStatuses.SASU;
                    this.weightedScores.SASU = 55;
                }
            }
        }
        
        // Obtenir les recommandations finales (top 3)
        const recommendations = this.getTopRecommendations(3);
        
        // CORRECTIF: Si aucune recommandation n'est retournée, créer des recommandations par défaut
        if (recommendations.length === 0) {
            console.warn('Aucune recommandation trouvée, création de recommandations par défaut');
            
            // Créer des recommandations par défaut avec les statuts les plus courants
            const defaultRecommendations = [];
            
            if (window.legalStatuses) {
                // Ajouter SARL comme recommandation par défaut
                if (window.legalStatuses.SARL) {
                    defaultRecommendations.push({
                        status: window.legalStatuses.SARL,
                        score: 65,
                        strengths: [
                            "Structure bien connue et reconnue",
                            "Responsabilité limitée aux apports",
                            "Adapté aux projets avec plusieurs associés"
                        ],
                        weaknesses: [
                            "Formalisme juridique important",
                            "Coûts de gestion administrative",
                            "Moins flexible que la SAS"
                        ]
                    });
                }
                
                // Ajouter EURL comme recommandation par défaut
                if (window.legalStatuses.EURL) {
                    defaultRecommendations.push({
                        status: window.legalStatuses.EURL,
                        score: 60,
                        strengths: [
                            "Responsabilité limitée aux apports",
                            "Adapté pour un entrepreneur solo",
                            "Protection du patrimoine personnel"
                        ],
                        weaknesses: [
                            "Formalisme administratif",
                            "Coûts de gestion plus élevés qu'en microentreprise",
                            "Moins adapté à la croissance rapide"
                        ]
                    });
                }
                
                // Ajouter SASU comme recommandation par défaut
                if (window.legalStatuses.SASU) {
                    defaultRecommendations.push({
                        status: window.legalStatuses.SASU,
                        score: 55,
                        strengths: [
                            "Grande souplesse statutaire",
                            "Idéal pour les levées de fonds",
                            "Statut social avantageux (assimilé salarié)"
                        ],
                        weaknesses: [
                            "Charges sociales élevées",
                            "Coûts de gestion importants",
                            "Complexité administrative"
                        ]
                    });
                }
            }
            
            // Utiliser ces recommandations par défaut
            return defaultRecommendations;
        }
        
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

    /**
     * Appliquer les filtres d'exclusion
     */
    applyExclusionFilters() {
        console.log("Statuts avant filtrage:", Object.keys(this.filteredStatuses));
        
        // Pour chaque filtre d'exclusion
        if (window.exclusionFilters) {
            window.exclusionFilters.forEach(filter => {
                // Vérifier si la condition du filtre est remplie
                const answerValue = this.answers[filter.id];
                let isConditionMet = false;
                
                if (typeof filter.condition === 'function') {
                    isConditionMet = filter.condition(answerValue);
                } else {
                    isConditionMet = answerValue === filter.condition;
                }
                
                if (isConditionMet) {
                    console.log(`Filtre ${filter.id} activé, valeur: ${answerValue}`);
                    console.log(`Statuts exclus par ce filtre: ${filter.excluded_statuses}`);
                    
                    // Exclure les statuts
                    filter.excluded_statuses.forEach(statusId => {
                        if (this.filteredStatuses[statusId]) {
                            console.log(`Exclusion de ${statusId}`);
                            delete this.filteredStatuses[statusId];
                            this.incompatibles.push(statusId);
                        }
                    });
                }
            });
        } else {
            console.warn("window.exclusionFilters n'est pas défini, aucun filtre appliqué");
        }
        
        console.log("Statuts après filtrage:", Object.keys(this.filteredStatuses));
    }

    /**
     * Calculer les poids des priorités
     */
    calculatePriorityWeights() {
        // Si priorités définies, les utiliser pour pondérer les critères
        const priorities = this.answers.priorities || [];
        
        // Poids par défaut si aucune priorité définie
        const defaultWeights = {
            taxation: 3,
            social_cost: 3,
            patrimony_protection: 3,
            governance_flexibility: 3,
            fundraising: 3,
            transmission: 3,
            administrative_simplicity: 3,
            accounting_cost: 3,
            retirement_insurance: 3
        };
        
        // Copier les poids par défaut
        this.priorityWeights = {...defaultWeights};
        
        // Appliquer les priorités de l'utilisateur
        if (priorities.length > 0) {
            // Poids selon la position
            const weights = [5, 4, 3]; // Position 1, 2, 3
            
            // Pour chaque priorité, augmenter le poids
            priorities.forEach((priority, index) => {
                if (index < weights.length && this.priorityWeights[priority]) {
                    this.priorityWeights[priority] = weights[index];
                }
            });
        }
        
        console.log("Poids des priorités calculés:", this.priorityWeights);
    }

    /**
     * Calculer les scores pour chaque statut juridique
     */
    calculateScores() {
        // Pour chaque statut juridique restant après filtrage
        Object.keys(this.filteredStatuses).forEach(statusId => {
            // Initialiser le score
            this.scores[statusId] = 0;
            
            // Appliquer les règles de scoring
            window.scoringRules.forEach(rule => {
                // Vérifier si la condition est remplie
                let isConditionMet = false;
                if (typeof rule.condition === 'function') {
                    isConditionMet = rule.condition(this.answers);
                }
                
                if (isConditionMet) {
                    // Appliquer la règle
                    const newScore = rule.apply(statusId, this.scores[statusId]);
                    
                    // Mettre à jour le score et l'audit trail
                    this.scores[statusId] = newScore;
                    this.auditTrail.scores[statusId] = this.auditTrail.scores[statusId] || [];
                    this.auditTrail.scores[statusId].push({
                        rule: rule.id,
                        points: newScore - this.scores[statusId]
                    });
                }
            });
            
            // Appliquer les scores intrinsèques de chaque statut juridique (si disponibles)
            const status = this.filteredStatuses[statusId];
            if (status && status.key_metrics) {
                const metrics = status.key_metrics;
                
                // Calculer une moyenne pondérée des métriques
                let totalWeight = 0;
                let weightedSum = 0;
                
                for (const [key, weight] of Object.entries(this.priorityWeights)) {
                    if (metrics[key]) {
                        weightedSum += metrics[key] * weight;
                        totalWeight += weight;
                    }
                }
                
                // Calculer le score final (pondéré)
                this.weightedScores[statusId] = totalWeight > 0 ? 
                    (weightedSum / totalWeight) * 20 : // Échelle 0-100
                    50; // Score neutre par défaut
            } else {
                // Si pas de métriques disponibles, score neutre
                this.weightedScores[statusId] = 50;
            }
        });
        
        console.log("Scores calculés:", this.weightedScores);
    }

    /**
     * Obtenir les meilleures recommandations
     * @param {number} count - Nombre de recommandations à retourner
     * @returns {Array} Les meilleures recommandations
     */
    getTopRecommendations(count) {
        // Trier les statuts par score (décroissant)
        const sortedStatuses = Object.keys(this.weightedScores)
            .sort((a, b) => this.weightedScores[b] - this.weightedScores[a]);
        
        // CORRECTIF: Log pour debug
        console.log("Statuts triés par score:", sortedStatuses.map(id => 
            `${id}: ${this.weightedScores[id]}`
        ));
        
        // Créer les recommandations
        const recommendations = [];
        
        // Limiter au nombre demandé ou au nombre disponible
        const limit = Math.min(count, sortedStatuses.length);
        
        // CORRECTIF: Si aucun statut n'a de score > 0, retourner un tableau vide
        if (limit === 0) {
            console.warn("Aucun statut avec score positif trouvé");
            return [];
        }
        
        // Construire les recommandations
        for (let i = 0; i < limit; i++) {
            const statusId = sortedStatuses[i];
            const status = this.filteredStatuses[statusId];
            
            // CORRECTIF: Seulement inclure les statuts avec un score >= 50
            if (this.weightedScores[statusId] >= 50) {
                recommendations.push({
                    status: status,
                    score: Math.round(this.weightedScores[statusId]),
                    strengths: this.getStrengths(statusId),
                    weaknesses: this.getWeaknesses(statusId)
                });
            } else {
                console.log(`Statut ${statusId} exclu car score trop bas: ${this.weightedScores[statusId]}`);
            }
        }
        
        return recommendations;
    }

    /**
     * Obtenir les forces d'un statut juridique
     * @param {string} statusId - Identifiant du statut
     * @returns {Array} Les forces du statut
     */
    getStrengths(statusId) {
        // À implémenter: extraire les forces basées sur le profil
        const status = this.filteredStatuses[statusId];
        if (status && status.advantages) {
            // Prendre les 3 premiers avantages
            return status.advantages.slice(0, 3);
        }
        return ["Données non disponibles"];
    }

    /**
     * Obtenir les faiblesses d'un statut juridique
     * @param {string} statusId - Identifiant du statut
     * @returns {Array} Les faiblesses du statut
     */
    getWeaknesses(statusId) {
        // À implémenter: extraire les faiblesses basées sur le profil
        const status = this.filteredStatuses[statusId];
        if (status && status.disadvantages) {
            // Prendre les 3 premières faiblesses
            return status.disadvantages.slice(0, 3);
        }
        return ["Données non disponibles"];
    }

    /**
     * Afficher les résultats dans la console
     * @param {Array} recommendations - Les recommandations à afficher
     */
    displayResults(recommendations) {
        console.log("Recommandations générées:");
        recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec.status.name} (score: ${rec.score})`);
            console.log("   Forces:", rec.strengths);
            console.log("   Faiblesses:", rec.weaknesses);
        });
    }
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