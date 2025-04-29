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

// Utilisation des variables globales au lieu des imports
// const { legalStatuses, exclusionFilters, ratingScales } = window;

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
    {
        id: 'high_risk_activity_ei_micro',
        description: 'Activité à risque élevé pour EI/MICRO',
        condition: answers => answers.high_professional_risk === 'yes',
        apply: (statusId, score) => {
            if (['EI', 'MICRO'].includes(statusId)) {
                return score - 1;
            } else if (statusId === 'EIRL') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    
    // Règles pour la simplicité administrative
    {
        id: 'high_revenue_small_structures',
        description: 'CA élevé pour petites structures',
        condition: answers => parseFloat(answers.projected_revenue) > 100000,
        apply: (statusId, score) => {
            if (['EI', 'MICRO'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'low_revenue_complex_structures',
        description: 'Faible CA pour structures complexes',
        condition: answers => parseFloat(answers.projected_revenue) < 50000,
        apply: (statusId, score) => {
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'high_revenue_complex_structures',
        description: 'CA élevé pour structures complexes',
        condition: answers => parseFloat(answers.projected_revenue) > 300000,
        apply: (statusId, score) => {
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'accounting_complexity_simple',
        description: 'Préférence pour comptabilité simple',
        condition: answers => answers.accounting_complexity === 'simple',
        apply: (statusId, score) => {
            if (['SAS', 'SA'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'accounting_outsourced_micro',
        description: 'Comptabilité externalisée pour micro',
        condition: answers => answers.accounting_complexity === 'outsourced',
        apply: (statusId, score) => {
            if (statusId === 'MICRO') {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    
    // Règles pour l'optimisation fiscale
    {
        id: 'high_tmi_ir_malus',
        description: 'TMI élevée défavorable pour IR',
        condition: answers => ['bracket_41', 'bracket_45'].includes(answers.tax_bracket),
        apply: (statusId, score) => {
            if (['EI', 'MICRO', 'SNC'].includes(statusId)) {
                return score - 1.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'high_tmi_is_bonus',
        description: 'TMI élevée favorable pour IS',
        condition: answers => ['bracket_41', 'bracket_45'].includes(answers.tax_bracket),
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'low_tmi_micro_bonus',
        description: 'TMI faible favorable pour micro',
        condition: answers => ['non_taxable', 'bracket_11'].includes(answers.tax_bracket),
        apply: (statusId, score) => {
            if (statusId === 'MICRO') {
                return score + 1;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'dividend_preference_is',
        description: 'Préférence dividendes favorable pour IS',
        condition: answers => answers.remuneration_preference === 'dividends',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'salary_preference_ir',
        description: 'Préférence salaire favorable pour IR',
        condition: answers => answers.remuneration_preference === 'salary',
        apply: (statusId, score) => {
            if (['EI', 'MICRO'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'innovation_devices_bonus',
        description: 'Dispositifs innovation (JEI/CIR/CII)',
        condition: answers => answers.jei_cir_cii && answers.jei_cir_cii.length > 0,
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    
    // Règles pour les charges sociales
    {
        id: 'tns_preference_bonus',
        description: 'Préférence TNS favorable',
        condition: answers => answers.social_regime === 'tns',
        apply: (statusId, score) => {
            if (['EI', 'EIRL', 'MICRO', 'EURL', 'SARL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'employee_preference_bonus',
        description: 'Préférence assimilé salarié favorable',
        condition: answers => answers.social_regime === 'assimilated_employee',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'low_income_micro_bonus',
        description: 'Faibles revenus favorables pour micro',
        condition: answers => parseFloat(answers.income_objective_year1) < 1500,
        apply: (statusId, score) => {
            if (statusId === 'MICRO') {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'high_income_assimile_malus',
        description: 'Revenus élevés défavorables pour assimilé salarié',
        condition: answers => parseFloat(answers.income_objective_year1) > 5000,
        apply: (statusId, score) => {
            if (['SASU', 'SAS'].includes(statusId)) {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'acre_bonus',
        description: 'Bonus ACRE',
        condition: answers => answers.acre === 'yes',
        apply: (statusId, score) => {
            return score + 0.5;
        },
        criteria: 'social_charges'
    },
    
    // Règles pour la capacité de financement
    {
        id: 'fundraising_sas_sa_bonus',
        description: 'Levée de fonds favorable pour SAS/SASU/SA',
        condition: answers => answers.fundraising === 'yes',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                return score + 1.5;
            } else if (['SARL', 'EURL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    {
        id: 'sharing_instruments_bonus',
        description: 'Instruments de partage favorables pour SAS/SASU/SA',
        condition: answers => answers.sharing_instruments && answers.sharing_instruments.length > 0,
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    {
        id: 'investors_ei_micro_malus',
        description: 'Structure avec investisseurs défavorable pour EI/MICRO',
        condition: answers => answers.team_structure === 'investors',
        apply: (statusId, score) => {
            if (['EI', 'EIRL', 'MICRO', 'SNC'].includes(statusId)) {
                return score - 2;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    
    // Règles pour la transmission
    {
        id: 'sale_exit_bonus',
        description: 'Sortie par vente favorable pour sociétés',
        condition: answers => answers.exit_intention === 'sale',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'transmission'
    },
    {
        id: 'transmission_exit_bonus',
        description: 'Sortie par transmission favorable pour sociétés',
        condition: answers => answers.exit_intention === 'transmission',
        apply: (statusId, score) => {
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'transmission'
    },
    {
        id: 'family_transmission_sarl_bonus',
        description: 'Transmission familiale favorable pour SARL',
        condition: answers => answers.family_transmission === 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SARL') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'transmission'
    }
];

class RecommendationEngine {
    constructor() {
        console.log("Initialisation du RecommendationEngine");
        this.answers = {};
        this.filteredStatuses = {};
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

    /**
     * Appliquer les filtres d'exclusion pour éliminer certains statuts
     */
    applyExclusionFilters() {
        // Appliquer les filtres déclaratifs
        this.applyDeclarativeFilters();
        
        // Appliquer les filtres spécifiques
        this.applySpecificFilters();
        
        console.log('Statuts après filtres:', Object.keys(this.filteredStatuses));
    }
    
    /**
     * Appliquer les filtres d'exclusion déclaratifs définis dans legal-status-data.js
     */
    applyDeclarativeFilters() {
        window.exclusionFilters.forEach(filter => {
            // Vérifier si le filtre s'applique à la réponse
            let shouldExclude = false;
            
            if (typeof filter.condition === 'string') {
                // Condition simple (valeur exacte)
                shouldExclude = this.answers[filter.id] === filter.condition;
            } else if (typeof filter.condition === 'function') {
                // Condition fonction (comparaison complexe)
                try {
                    shouldExclude = filter.condition(this.answers[filter.id]);
                } catch (e) {
                    console.error(`Erreur dans le filtre ${filter.id}:`, e);
                }
            }
            
            // Vérifier si une tolérance est applicable
            if (shouldExclude && filter.tolerance_condition && this.answers[filter.tolerance_condition]) {
                shouldExclude = false;
            }
            
            // Si la condition est remplie, exclure les statuts spécifiés
            if (shouldExclude) {
                this.excludeStatuses(
                    filter.excluded_statuses,
                    filter.tolerance_message || `Exclusion par règle: ${filter.id}`
                );
            }
        });
    }
    
    /**
     * Appliquer les filtres d'exclusion spécifiques (cas particuliers)
     */
    applySpecificFilters() {
        // 1. Activité relevant d'un ordre → Micro-entreprise & SNC exclues
        if (this.answers.professional_order === 'yes') {
            this.excludeStatuses(['MICRO', 'SNC'], "Activité relevant d'un ordre professionnel");
        }
        
        // 2. Structure solo → EI & EURL/MICRO conservées, autres exclues
        if (this.answers.team_structure === 'solo') {
            Object.keys(this.filteredStatuses).forEach(statusId => {
                if (!['EI', 'EIRL', 'MICRO', 'EURL', 'SASU'].includes(statusId)) {
                    this.excludeStatus(statusId, "Structure solo - un seul associé");
                }
            });
        }
        
        // 3. CA > seuils micro → Micro exclue
        if (this.answers.projected_revenue) {
            const revenue = parseFloat(this.answers.projected_revenue);
            let microThreshold = this.thresholds2025.micro.bic_service; // Par défaut
            
            // Déterminer le seuil applicable selon l'activité
            if (this.answers.activity_type === 'bic_sales') {
                microThreshold = this.thresholds2025.micro.bic_sales;
            } else if (this.answers.activity_type === 'bnc') {
                microThreshold = this.thresholds2025.micro.bnc;
            }
            
            if (revenue > microThreshold) {
                this.excludeStatus('MICRO', `CA prévisionnel (${revenue}€) supérieur au seuil micro (${microThreshold}€)`);
            }
        }
        
        // 4. Levée de fonds → EI/MICRO/SNC exclues
        if (this.answers.fundraising === 'yes') {
            this.excludeStatuses(['EI', 'MICRO', 'SNC'], "Besoin de lever des fonds");
        }
    }
    
    /**
     * Trouve des alternatives pour un statut exclu et une raison donnée
     * @param {string} statusId - Identifiant du statut exclu
     * @param {string} reason - Raison de l'exclusion
     * @returns {Object|null} - Suggestion d'alternative ou null
     */
    findAlternativeSuggestion(statusId, reason) {
        // Convertir la raison en code pour correspondance
        const reasonCode = this.getReasonCode(reason);
        
        if (this.alternativeSuggestions[statusId] && 
            this.alternativeSuggestions[statusId][reasonCode]) {
            return this.alternativeSuggestions[statusId][reasonCode];
        }
        
        // Alternative générique si pas de correspondance spécifique
        return {
            alternatives: this.getGenericAlternatives(statusId),
            explanation: "Consultez les autres formes juridiques recommandées qui évitent cette contrainte"
        };
    }

    /**
     * Convertit une raison textuelle en code pour correspondance
     * @param {string} reason - Raison d'exclusion en texte
     * @returns {string} - Code de raison standardisé
     */
    getReasonCode(reason) {
        // Extraire un code à partir de la description
        if (reason.includes("CA") && reason.includes("seuil")) return "ca-depasse-seuil";
        if (reason.includes("ordre professionnel")) return "ordre-professionnel";
        if (reason.includes("fonds")) return "fundraising";
        if (reason.includes("patrimoine")) return "protection-patrimoine";
        if (reason.includes("risque")) return "risque-eleve";
        
        // Créer un slug à partir du texte
        return reason.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 30);
    }

    /**
     * Retourne des alternatives génériques selon le type de statut
     * @param {string} statusId - Identifiant du statut
     * @returns {Array} - Liste d'alternatives possibles
     */
    getGenericAlternatives(statusId) {
        const alternatives = {
            'MICRO': ['EI', 'EURL'],
            'EI': ['MICRO', 'EURL'],
            'EURL': ['SASU', 'SARL'],
            'SASU': ['EURL', 'SAS'],
            'SARL': ['EURL', 'SAS'],
            'SAS': ['SASU', 'SARL'],
            'SNC': ['SARL', 'SAS'],
            'SCI': ['SARL', 'SAS'],
            'SELARL': ['SELAS'],
            'SELAS': ['SELARL']
        };
        
        return alternatives[statusId] || ['EURL', 'SASU'];
    }
    
    /**
     * Exclure un statut juridique
     */
    excludeStatus(statusId, reason) {
        if (this.filteredStatuses[statusId]) {
            const status = this.filteredStatuses[statusId];
            
            // Trouver une suggestion d'alternative
            const suggestion = this.findAlternativeSuggestion(statusId, reason);
            
            // Stocker dans les incompatibilités
            this.incompatibles.push({
                id: statusId,
                name: status.name,
                shortName: status.shortName,
                status: status,
                reason: reason,
                suggestion: suggestion,
                compatibilite: 'INCOMPATIBLE'
            });
            
            delete this.filteredStatuses[statusId];
            
            // Journaliser l'exclusion avec l'alternative
            this.auditTrail.exclusions.push({
                status_id: statusId,
                reason: reason,
                alternative: suggestion ? suggestion.explanation : null
            });
        }
    }
    
    /**
     * Exclure plusieurs statuts juridiques
     */
    excludeStatuses(statusIds, reason) {
        statusIds.forEach(statusId => {
            this.excludeStatus(statusId, reason);
        });
    }

    /**
     * Calculer les poids à appliquer pour chaque critère basé sur les priorités
     */
    calculatePriorityWeights() {
        // Par défaut, tous les critères ont un poids de 1
        const defaultWeights = {
            patrimony_protection: 1,
            administrative_simplicity: 1,
            taxation_optimization: 1,
            social_charges: 1,
            fundraising_capacity: 1,
            credibility: 1,
            governance_flexibility: 1,
            transmission: 1
        };
        
        this.priorityWeights = {...defaultWeights};
        
        // Si les priorités ont été définies
        if (this.answers.priorities && this.answers.priorities.length > 0) {
            // Mapping des IDs de priorité vers les critères
            const priorityMapping = {
                taxation: 'taxation_optimization',
                social_cost: 'social_charges',
                patrimony_protection: 'patrimony_protection',
                governance_flexibility: 'governance_flexibility',
                fundraising: 'fundraising_capacity',
                transmission: 'transmission',
                admin_simplicity: 'administrative_simplicity',
                accounting_cost: 'administrative_simplicity',
                retirement_insurance: 'social_charges'
            };
            
            // Poids selon le rang (1er = 5, 2e = 4, 3e = 3)
            const rankWeights = [5, 4, 3];
            
            // Appliquer les poids selon les priorités
            this.answers.priorities.forEach((priorityId, index) => {
                if (index < 3) { // Limiter à 3 priorités
                    const criteriaKey = priorityMapping[priorityId];
                    if (criteriaKey) {
                        this.priorityWeights[criteriaKey] = rankWeights[index];
                        
                        // Journaliser la règle de pondération
                        this.auditTrail.weightingRules.push({
                            priority: priorityId,
                            rank: index + 1,
                            criteria: criteriaKey,
                            weight: rankWeights[index]
                        });
                    }
                }
            });
        }
        
        console.log('Poids des priorités:', this.priorityWeights);
    }

    /**
     * Calculer les scores pour chaque statut juridique
     */
    calculateScores() {
        const statuses = Object.keys(this.filteredStatuses);
        
        // Pour chaque statut
        statuses.forEach(statusId => {
            // Initialiser le score
            this.scores[statusId] = 0;
            this.weightedScores[statusId] = 0;
            this.auditTrail.scores[statusId] = {};
            
            const status = this.filteredStatuses[statusId];
            const metrics = status.key_metrics;
            
            // Critères et leurs scores
            const criteriaScores = {
                patrimony_protection: this.calculateCriteriaScore('patrimony_protection', statusId, metrics),
                administrative_simplicity: this.calculateCriteriaScore('administrative_simplicity', statusId, metrics),
                taxation_optimization: this.calculateCriteriaScore('taxation_optimization', statusId, metrics),
                social_charges: this.calculateCriteriaScore('social_charges', statusId, metrics),
                fundraising_capacity: this.calculateCriteriaScore('fundraising_capacity', statusId, metrics),
                credibility: metrics.credibility || 3,
                governance_flexibility: metrics.governance_flexibility || 3,
                transmission: this.calculateCriteriaScore('transmission', statusId, metrics)
            };
            
            // Calculer le score total (non pondéré)
            let totalScore = 0;
            let totalWeightedScore = 0;
            let totalWeight = 0;
            
            for (const [criterion, score] of Object.entries(criteriaScores)) {
                const weight = this.priorityWeights[criterion] || 1;
                totalScore += score;
                totalWeightedScore += score * weight;
                totalWeight += weight;
                
                // Journaliser les scores
                this.auditTrail.scores[statusId][criterion] = {
                    raw_score: score,
                    weight: weight,
                    weighted_score: score * weight
                };
            }
            
            this.scores[statusId] = totalScore;
            
            // Normaliser le score pondéré (sur 100)
            this.weightedScores[statusId] = totalWeightedScore / totalWeight * 20;
        });
        
        console.log('Scores pondérés:', this.weightedScores);
    }
    
    /**
     * Calculer le score pour un critère donné en utilisant les règles applicables
     */
    calculateCriteriaScore(criteria, statusId, metrics) {
        // Score de base à partir des métriques du statut
        let score = metrics[criteria] || 3;
        
        // Appliquer toutes les règles correspondant au critère
        const appliedRules = [];
        
        scoringRules
            .filter(rule => rule.criteria === criteria)
            .forEach(rule => {
                // Vérifier si la règle s'applique selon les réponses
                if (rule.condition(this.answers)) {
                    // Calculer le nouveau score
                    const newScore = rule.apply(statusId, score);
                    
                    // Si la règle a modifié le score, l'enregistrer
                    if (newScore !== score) {
                        appliedRules.push({
                            id: rule.id,
                            description: rule.description,
                            impact: newScore - score
                        });
                        
                        // Mettre à jour le score
                        score = newScore;
                    }
                }
            });
        
        // Stocker les règles appliquées dans l'audit trail
        if (appliedRules.length > 0) {
            if (!this.auditTrail.scores[statusId]) {
                this.auditTrail.scores[statusId] = {};
            }
            if (!this.auditTrail.scores[statusId][criteria]) {
                this.auditTrail.scores[statusId][criteria] = {};
            }
            
            this.auditTrail.scores[statusId][criteria].applied_rules = appliedRules;
        }
        
        // Limiter le score entre 0 et 5
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Méthode pour expliquer les décisions du moteur de recommandation
     */
    explainRecommendation(statusId) {
        if (!this.auditTrail.scores[statusId]) {
            return "Aucune explication disponible";
        }
        
        let explanation = `Explication pour ${this.filteredStatuses[statusId].name} (${statusId}):\n\n`;
        
        // Expliquer les scores par critère
        for (const [criterion, data] of Object.entries(this.auditTrail.scores[statusId])) {
            explanation += `${criterion}: ${data.raw_score}/5 (poids: ${data.weight})\n`;
            
            if (data.applied_rules && data.applied_rules.length) {
                explanation += "  Règles appliquées:\n";
                data.applied_rules.forEach(rule => {
                    const impact = rule.impact > 0 ? `+${rule.impact}` : rule.impact;
                    explanation += `  - ${rule.description} (${impact})\n`;
                });
            }
        }
        
        // Score final
        explanation += `\nScore final: ${Math.round(this.weightedScores[statusId])}/100\n`;
        
        return explanation;
    }

    /**
     * Génère des stratégies personnalisées pour un statut juridique selon le profil
     * @param {string} statusId - Identifiant du statut juridique
     * @returns {Array} - Liste des stratégies personnalisées
     */
    generateContextualStrategies(statusId) {
        const status = this.filteredStatuses[statusId];
        if (!status) return [];
        
        const strategies = [];
        
        // Stratégies spécifiques par forme juridique
        if (statusId === 'MICRO') {
            strategies.push({
                title: "Optimisation de la trésorerie",
                description: "Profitez de l'absence de TVA sous le seuil de franchise pour améliorer votre trésorerie.",
                icon: "fa-coins"
            });
            
            if (this.answers.tax_bracket === 'non_taxable' || this.answers.tax_bracket === 'bracket_11') {
                strategies.push({
                    title: "Option versement libératoire",
                    description: "Avec votre TMI faible, le versement libératoire de l'impôt est très avantageux.",
                    icon: "fa-percent"
                });
            }
            
            strategies.push({
                title: "Surveillance des seuils",
                description: `Suivez votre CA pour ne pas dépasser les seuils (${this.thresholds2025.micro.bic_sales}€/vente, ${this.thresholds2025.micro.bic_service}€/services).`,
                icon: "fa-chart-line"
            });
        } 
        else if (statusId === 'EURL') {
            if (this.answers.tax_bracket === 'bracket_41' || this.answers.tax_bracket === 'bracket_45') {
                strategies.push({
                    title: "Option IS recommandée",
                    description: "Avec votre TMI élevée, l'IS avec taux réduit à 15% est fiscal-optimisant.",
                    icon: "fa-balance-scale"
                });
            }
            
            strategies.push({
                title: "Charges déductibles",
                description: "Optimisez vos charges réelles déductibles, contrairement au forfait micro-entreprise.",
                icon: "fa-receipt"
            });
        }
        else if (statusId === 'SASU' || statusId === 'SAS') {
            strategies.push({
                title: "Optimisation salaire/dividendes",
                description: "Répartissez judicieusement entre salaire et dividendes selon votre TMI et vos besoins de trésorerie.",
                icon: "fa-percentage"
            });
            
            if (this.answers.fundraising === 'yes') {
                strategies.push({
                    title: "Préparation à la levée de fonds",
                    description: "Préparez une documentation adaptée et des statuts optimisés pour les investisseurs.",
                    icon: "fa-hand-holding-usd"
                });
            }
        }
        
        // Stratégies basées sur les priorités utilisateur
        const priorities = this.answers.priorities || [];
        if (priorities.includes('patrimony_protection')) {
            if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) {
                strategies.push({
                    title: "Renforcement de la protection patrimoniale",
                    description: "Envisagez une assurance RC Pro complémentaire pour une protection maximale.",
                    icon: "fa-shield-alt"
                });
            }
        }
        
        // Stratégies liées aux aides et dispositifs
        if (this.answers.acre === 'yes') {
            strategies.push({
                title: "Exonérations ACRE",
                description: "Profitez de l'exonération partielle de charges sociales pendant la première année.",
                icon: "fa-star"
            });
        }
        
        if (priorities.includes('taxation_optimization') && ['SASU', 'SAS'].includes(statusId)) {
            strategies.push({
                title: "Taux réduit IS",
                description: "Optimisez votre rémunération pour bénéficier du taux IS réduit à 15% jusqu'à 42 500€.",
                icon: "fa-piggy-bank"
            });
        }
        
        return strategies;
    }

    /**
     * Génère le HTML pour afficher les stratégies contextuelles
     * @param {string} statusId - Identifiant du statut
     * @returns {string} - HTML pour les stratégies
     */
    renderContextualStrategies(statusId) {
        const strategies = this.generateContextualStrategies(statusId);
        if (strategies.length === 0) return '';
        
        const status = this.filteredStatuses[statusId];
        
        let html = `
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-6">
            <h4 class="font-semibold text-green-400 mb-4">
                <i class="fas fa-lightbulb mr-2"></i>
                Stratégies optimales pour votre ${status.name}
            </h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        strategies.forEach(strategy => {
            html += `
            <div class="bg-blue-800 bg-opacity-20 p-4 rounded-lg hover:bg-opacity-30 transition">
                <div class="flex items-start">
                    <div class="bg-green-900 bg-opacity-30 rounded-full p-3 mr-3">
                        <i class="fas ${strategy.icon} text-green-400"></i>
                    </div>
                    <div>
                        <h5 class="font-semibold mb-1">${strategy.title}</h5>
                        <p class="text-sm text-gray-300">${strategy.description}</p>
                    </div>
                </div>
            </div>
            `;
        });
        
        html += `
            </div>
        </div>
        `;
        
        return html;
    }

    /**
     * Obtenir les meilleures recommandations (top N)
     */
    getTopRecommendations(count = 3) {
        // Vérifier qu'il y a au moins un statut disponible
        if (Object.keys(this.filteredStatuses).length === 0) {
            console.error("Aucun statut disponible après application des filtres");
            return [];
        }
        
        // Trier les statuts par score pondéré décroissant
        const sortedStatuses = Object.keys(this.weightedScores)
            .sort((a, b) => this.weightedScores[b] - this.weightedScores[a]);
        
        // Prendre les N premiers
        const topN = Math.min(count, sortedStatuses.length);
        const topStatuses = sortedStatuses.slice(0, topN);
        
        // Construire les objets de recommandation avec catégorisation
        return topStatuses.map((statusId, index) => {
            const score = Math.round(this.weightedScores[statusId]);
            
            // Catégoriser selon le score
            let compatibilite = 'PEU ADAPTÉ';
            if (score >= 80) {
                compatibilite = 'RECOMMANDÉ';
            } else if (score >= 65) {
                compatibilite = 'COMPATIBLE';
            } else if (score < 45) {
                compatibilite = 'DÉCONSEILLÉ';
            }
            
            return {
                rank: index + 1,
                id: statusId,
                name: this.filteredStatuses[statusId].name,
                shortName: this.filteredStatuses[statusId].shortName,
                score: score,
                status: this.filteredStatuses[statusId],
                strengths: this.getStrengths(statusId),
                weaknesses: this.getWeaknesses(statusId),
                compatibilite: compatibilite,
                scoreCriteresStructurels: Math.round(score * 0.6), // Approximation pour compatibilité
                scoreObjectifs: Math.round(score * 0.4), // Approximation pour compatibilité
                scoreDetails: {
                    pourcentage: score
                },
                explanation: this.explainRecommendation(statusId)
            };
        });
    }

    /**
     * Obtenir les forces d'un statut juridique pour le profil
     */
    getStrengths(statusId) {
        const strengths = [];
        const status = this.filteredStatuses[statusId];
        
        // Ajouter les forces spécifiques au profil
        if (statusId === 'MICRO' && this.answers.administrative_simplicity) {
            strengths.push("Simplicité administrative maximale (pas de comptabilité complexe)");
        }
        
        if (['SASU', 'SAS'].includes(statusId) && this.answers.governance_flexibility) {
            strengths.push("Grande liberté statutaire et souplesse de gouvernance");
        }
        
        if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId) && this.answers.patrimony_protection === 'essential') {
            strengths.push("Protection complète du patrimoine personnel");
        }
        
        if (['SASU', 'SAS'].includes(statusId) && this.answers.social_regime === 'assimilated_employee') {
            strengths.push("Statut d'assimilé salarié avec protection sociale complète");
        }
        
        // Avantages fiscaux spécifiques
        if ((['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) && 
            ['bracket_41', 'bracket_45'].includes(this.answers.tax_bracket)) {
            strengths.push("Optimisation fiscale avec l'IS à 15% jusqu'à 42 500€ de bénéfices");
        }
        
        if (statusId === 'MICRO' && this.answers.projected_revenue < 50000) {
            strengths.push("Régime fiscal avantageux avec abattement forfaitaire sur le chiffre d'affaires");
        }
        
        // Si pas assez de forces spécifiques, compléter avec des forces génériques
        if (strengths.length < 3 && status.advantages) {
            for (const advantage of status.advantages) {
                if (strengths.length < 3 && !strengths.some(s => s.toLowerCase().includes(advantage.toLowerCase()))) {
                    strengths.push(advantage);
                }
            }
        }
        
        return strengths.slice(0, 3); // Limiter à 3 forces
    }

    /**
     * Obtenir les faiblesses d'un statut juridique pour le profil
     */
    getWeaknesses(statusId) {
        const weaknesses = [];
        const status = this.filteredStatuses[statusId];
        
        // Ajouter les faiblesses spécifiques au profil
        if (['EI', 'MICRO'].includes(statusId) && this.answers.high_professional_risk === 'yes') {
            weaknesses.push("Responsabilité illimitée risquée pour votre activité à risque élevé");
        }
        
        if (['EI', 'MICRO', 'EIRL'].includes(statusId) && this.answers.fundraising === 'yes') {
            weaknesses.push("Difficultés pour lever des fonds ou attirer des investisseurs");
        }
        
        if (['SAS', 'SASU', 'SA'].includes(statusId) && this.answers.projected_revenue < 30000) {
            weaknesses.push("Coûts de gestion potentiellement élevés par rapport au chiffre d'affaires");
        }
        
        if (statusId === 'MICRO' && this.answers.projected_revenue > 0.7 * this.thresholds2025.micro.bic_service) {
            weaknesses.push("Risque de dépassement des seuils du régime micro-entrepreneur");
        }
        
        // Faiblesses fiscales spécifiques
        if (['EI', 'MICRO'].includes(statusId) && ['bracket_41', 'bracket_45'].includes(this.answers.tax_bracket)) {
            weaknesses.push("Imposition à l'IR potentiellement défavorable avec votre TMI élevée");
        }
        
        if ((['SASU', 'SAS'].includes(statusId)) && this.answers.social_regime === 'tns') {
            weaknesses.push("Ne correspond pas à votre préférence pour le régime TNS");
        }
        
        // Si pas assez de faiblesses spécifiques, compléter avec des faiblesses génériques
        if (weaknesses.length < 3 && status.disadvantages) {
            for (const disadvantage of status.disadvantages) {
                if (weaknesses.length < 3 && !weaknesses.some(w => w.toLowerCase().includes(disadvantage.toLowerCase()))) {
                    weaknesses.push(disadvantage);
                }
            }
        }
        
        return weaknesses.slice(0, 3); // Limiter à 3 faiblesses
    }

    /**
     * Afficher les résultats dans l'interface
     */
    displayResults(recommendations) {
        console.log("Affichage des résultats:", recommendations);
        // Récupérer les conteneurs
        const resultsContainer = document.getElementById('results-container');
        const questionContainer = document.getElementById('question-container');
        
        if (!resultsContainer) {
            console.error('Conteneur de résultats non trouvé');
            return;
        }
        
        // Masquer le conteneur de questions et afficher celui des résultats
        if (questionContainer) questionContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        if (recommendations.length === 0) {
            resultsContainer.innerHTML = `
                <div class="bg-red-900 bg-opacity-20 p-8 rounded-xl text-center mb-8">
                    <div class="text-6xl text-red-400 mb-4"><i class="fas fa-exclamation-circle"></i></div>
                    <h2 class="text-2xl font-bold mb-4">Aucun statut juridique correspondant</h2>
                    <p class="mb-6">Vos critères semblent incompatibles. Essayez d'assouplir certaines exigences et refaites le test.</p>
                    <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
                        <i class="fas fa-redo mr-2"></i> Refaire le test
                    </button>
                </div>
            `;
            
            document.getElementById('restart-btn').addEventListener('click', () => {
                location.reload();
            });
            
            return;
        }
        
        // Créer le contenu des résultats
        let resultsHTML = `
            <div class="results-container">
                <div class="text-center mb-10">
                    <h2 class="text-3xl font-bold mb-3">Votre statut juridique recommandé</h2>
                    <p class="text-lg text-gray-300">Basé sur vos réponses, voici les formes juridiques les plus adaptées à votre projet</p>
                </div>
                
                <div class="recommendation-cards">
        `;
        
        // Carte pour chaque recommandation
        recommendations.forEach((recommendation, index) => {
            const status = recommendation.status;
            const isMainRecommendation = index === 0;
            
            resultsHTML += `
                <div class="recommendation-card ${isMainRecommendation ? 'main-recommendation' : ''} bg-opacity-60 bg-blue-900 rounded-xl overflow-hidden mb-8 border ${isMainRecommendation ? 'border-green-400' : 'border-gray-700'}">
                    <!-- En-tête -->
                    <div class="p-6 flex items-center border-b border-gray-700 ${isMainRecommendation ? 'bg-green-900 bg-opacity-30' : ''}">
                        <div class="h-16 w-16 rounded-full bg-opacity-30 ${isMainRecommendation ? 'bg-green-800' : 'bg-blue-800'} flex items-center justify-center text-3xl mr-5">
                            <i class="fas ${status.logo || 'fa-building'} ${isMainRecommendation ? 'text-green-400' : 'text-gray-300'}"></i>
                        </div>
                        <div class="flex-grow">
                            <div class="flex justify-between items-center">
                                <h3 class="text-2xl font-bold">${status.name}</h3>
                                <div class="score-badge ${isMainRecommendation ? 'bg-green-500 text-gray-900' : 'bg-blue-700'} px-3 py-1 rounded-full text-sm font-medium">
                                    Score: ${recommendation.score}/100
                                </div>
                            </div>
                            <p class="text-gray-400 mt-1">
                                ${isMainRecommendation ? 'Recommandation principale' : `Alternative ${index}`}
                            </p>
                        </div>
                    </div>
                    
                    <!-- Contenu -->
                    <div class="p-6">
                        <p class="mb-5">${status.description}</p>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Forces -->
                            <div>
                                <h4 class="font-semibold mb-2 flex items-center text-green-400">
                                    <i class="fas fa-check-circle mr-2"></i> Points forts
                                </h4>
                                <ul class="space-y-2">
                                    ${recommendation.strengths.map(strength => `
                                        <li class="flex items-start">
                                            <i class="fas fa-plus-circle text-green-400 mt-1 mr-2"></i>
                                            <span>${strength}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                            
                            <!-- Faiblesses -->
                            <div>
                                <h4 class="font-semibold mb-2 flex items-center text-red-400">
                                    <i class="fas fa-exclamation-circle mr-2"></i> Points d'attention
                                </h4>
                                <ul class="space-y-2">
                                    ${recommendation.weaknesses.map(weakness => `
                                        <li class="flex items-start">
                                            <i class="fas fa-minus-circle text-red-400 mt-1 mr-2"></i>
                                            <span>${weakness}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Boutons d'action -->
                        <div class="mt-6 flex justify-end">
                            <button class="details-btn bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg mr-3" data-status-id="${status.shortName}">
                                <i class="fas fa-info-circle mr-2"></i> Plus de détails
                            </button>
                            ${isMainRecommendation ? `
                                <button class="download-btn bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-4 py-2 rounded-lg">
                                    <i class="fas fa-file-download mr-2"></i> Télécharger le PDF
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Ajouter les stratégies contextuelles pour la recommandation principale
        if (recommendations.length > 0) {
            resultsHTML += this.renderContextualStrategies(recommendations[0].id);
        }
        
        // Afficher les incompatibilités
        resultsHTML += this.displayIncompatibilities(this.incompatibles);
        
        // Fermer les conteneurs
        resultsHTML += `
                </div>
                
                <div class="text-center mt-10">
                    <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
                        <i class="fas fa-redo mr-2"></i> Refaire le test
                    </button>
                    <button id="compare-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-6 py-3 rounded-lg ml-4">
                        <i class="fas fa-balance-scale mr-2"></i> Comparer les statuts
                    </button>
                </div>
            </div>
        `;
        
        // Injecter le HTML dans le conteneur
        resultsContainer.innerHTML = resultsHTML;
        
        // Attacher les événements
        document.getElementById('restart-btn').addEventListener('click', () => {
            location.reload();
        });
        
        document.getElementById('compare-btn').addEventListener('click', () => {
            this.showComparisonTable(recommendations);
        });
        
        // Événements pour les boutons de détails
        document.querySelectorAll('.details-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const statusId = btn.dataset.statusId;
                this.showStatusDetails(recommendations.find(r => r.status.shortName === statusId));
            });
        });
        
        // Événement pour le bouton de téléchargement PDF
        const downloadBtn = document.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                alert('Fonctionnalité de téléchargement PDF à implémenter');
                // this.generatePDF(recommendations[0]);
            });
        }
    }

    /**
     * Affiche les statuts juridiques incompatibles avec suggestions alternatives
     * @param {Array} incompatibles - Liste des statuts incompatibles
     * @returns {string} - HTML pour l'affichage des incompatibilités
     */
    displayIncompatibilities(incompatibles) {
        if (!incompatibles || incompatibles.length === 0) return '';
        
        let html = `
            <div class="mt-8 mb-6">
                <h3 class="text-xl font-bold text-red-400 mb-4 flex items-center">
                    <i class="fas fa-exclamation-triangle mr-2"></i> 
                    Formes juridiques incompatibles avec votre profil
                </h3>
                <div class="bg-blue-900 bg-opacity-20 p-4 rounded-xl">
                    <p class="mb-4">Les structures suivantes présentent des incompatibilités avec vos critères :</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        // Regrouper les incompatibilités par forme juridique
        const incompatibilitiesByForm = {};
        
        incompatibles.forEach(inc => {
            if (!incompatibilitiesByForm[inc.id]) {
                incompatibilitiesByForm[inc.id] = {
                    form: inc.status,
                    reasons: [],
                    suggestions: []
                };
            }
            
            // Ajouter la raison si nouvelle
            if (!incompatibilitiesByForm[inc.id].reasons.some(r => r === inc.reason)) {
                incompatibilitiesByForm[inc.id].reasons.push(inc.reason);
            }
            
            // Ajouter la suggestion si nouvelle et non déjà présente
            if (inc.suggestion && !incompatibilitiesByForm[inc.id].suggestions.some(
                s => s.explanation === inc.suggestion.explanation
            )) {
                incompatibilitiesByForm[inc.id].suggestions.push(inc.suggestion);
            }
        });
        
        // Générer le HTML pour chaque forme incompatible
        Object.values(incompatibilitiesByForm).forEach(item => {
            html += `
                <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                    <h4 class="font-semibold text-red-400 mb-2">${item.form.name}</h4>
                    <ul class="text-sm">
            `;
            
            item.reasons.forEach(reason => {
                html += `<li class="mb-1 flex items-start">
                    <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                    <span>${reason}</span>
                </li>`;
            });
            
            // Ajouter les suggestions alternatives
            if (item.suggestions.length > 0) {
                html += `<li class="mt-3 pt-2 border-t border-red-800"></li>`;
                
                item.suggestions.forEach(suggestion => {
                    html += `
                        <li class="mt-2 flex items-start">
                            <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-1"></i>
                            <span><strong>Alternative :</strong> ${suggestion.explanation}</span>
                        </li>
                    `;
                });
            }
            
            html += `
                    </ul>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        return html;
    }

    /**
     * Afficher les détails d'un statut juridique
     */
    showStatusDetails(recommendation) {
        if (!recommendation) return;
        
        const status = recommendation.status;
        const resultsContainer = document.getElementById('results-container');
        
        const detailsHTML = `
            <div class="status-details">
                <div class="mb-4">
                    <button id="back-to-results" class="text-blue-400 hover:text-blue-300 flex items-center">
                        <i class="fas fa-arrow-left mr-2"></i> Retour aux résultats
                    </button>
                </div>
                
                <div class="bg-blue-900 bg-opacity-60 rounded-xl overflow-hidden border border-gray-700 mb-8">
                    <!-- En-tête -->
                    <div class="p-6 border-b border-gray-700 flex items-center">
                        <div class="h-16 w-16 rounded-full bg-blue-800 bg-opacity-50 flex items-center justify-center text-3xl mr-5">
                            <i class="fas ${status.logo || 'fa-building'} text-green-400"></i>
                        </div>
                        <div>
                            <h2 class="text-2xl font-bold">${status.name} (${status.shortName})</h2>
                            <p class="text-gray-400">${status.description}</p>
                        </div>
                    </div>
                    
                    <!-- Contenu détaillé -->
                    <div class="p-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <!-- Création -->
                            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                                <h3 class="text-lg font-semibold mb-3 flex items-center text-green-400">
                                    <i class="fas fa-file-signature mr-2"></i> Création
                                </h3>
                                <ul class="space-y-2">
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Processus:</span>
                                        <span>${status.creation?.process || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Coût:</span>
                                        <span>${status.creation?.cost || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Délai:</span>
                                        <span>${status.creation?.time || 'Non spécifié'}</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <!-- Fiscalité -->
                            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                                <h3 class="text-lg font-semibold mb-3 flex items-center text-green-400">
                                    <i class="fas fa-file-invoice-dollar mr-2"></i> Fiscalité
                                </h3>
                                <ul class="space-y-2">
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Régime:</span>
                                        <span>${status.fiscalite || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Options:</span>
                                        <span>${status.fiscaliteOption || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Détails:</span>
                                        <span>${status.fiscal || 'Non spécifié'}</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <!-- Social -->
                            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                                <h3 class="text-lg font-semibold mb-3 flex items-center text-green-400">
                                    <i class="fas fa-user-shield mr-2"></i> Régime social
                                </h3>
                                <ul class="space-y-2">
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Régime:</span>
                                        <span>${status.regimeSocial || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Taux:</span>
                                        <span>${status.chargesSociales || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Protections:</span>
                                        <span>${status.social?.protections || 'Non spécifié'}</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <!-- Comptabilité -->
                            <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                                <h3 class="text-lg font-semibold mb-3 flex items-center text-green-400">
                                    <i class="fas fa-calculator mr-2"></i> Comptabilité
                                </h3>
                                <ul class="space-y-2">
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Complexité:</span>
                                        <span>${status.accounting?.complexity || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Exigences:</span>
                                        <span>${status.accounting?.requirements || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Coûts:</span>
                                        <span>${status.accounting?.costs || 'Non spécifié'}</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Avantages et inconvénients -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                            <!-- Avantages -->
                            <div>
                                <h3 class="text-lg font-semibold mb-3 flex items-center text-green-400">
                                    <i class="fas fa-plus-circle mr-2"></i> Avantages
                                </h3>
                                <ul class="space-y-2">
                                    ${status.advantages ? status.advantages.map(advantage => `
                                        <li class="flex items-start">
                                            <i class="fas fa-check text-green-400 mt-1 mr-2"></i>
                                            <span>${advantage}</span>
                                        </li>
                                    `).join('') : '<li>Non spécifié</li>'}
                                </ul>
                            </div>
                            
                            <!-- Inconvénients -->
                            <div>
                                <h3 class="text-lg font-semibold mb-3 flex items-center text-red-400">
                                    <i class="fas fa-minus-circle mr-2"></i> Inconvénients
                                </h3>
                                <ul class="space-y-2">
                                    ${status.disadvantages ? status.disadvantages.map(disadvantage => `
                                        <li class="flex items-start">
                                            <i class="fas fa-times text-red-400 mt-1 mr-2"></i>
                                            <span>${disadvantage}</span>
                                        </li>
                                    `).join('') : '<li>Non spécifié</li>'}
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Pour qui -->
                        <div class="mt-8">
                            <h3 class="text-lg font-semibold mb-3 flex items-center text-blue-400">
                                <i class="fas fa-user-check mr-2"></i> Adapté pour
                            </h3>
                            <ul class="space-y-2">
                                ${status.suitable_for ? status.suitable_for.map(profile => `
                                    <li class="flex items-start">
                                        <i class="fas fa-angle-right text-blue-400 mt-1 mr-2"></i>
                                        <span>${profile}</span>
                                    </li>
                                `).join('') : '<li>Non spécifié</li>'}
                            </ul>
                        </div>
                        
                        <!-- Explications du score (nouveau) -->
                        <div class="mt-8 bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                            <h3 class="text-lg font-semibold mb-3 flex items-center text-blue-400">
                                <i class="fas fa-chart-bar mr-2"></i> Détail du score
                            </h3>
                            <pre class="whitespace-pre-wrap text-sm">${recommendation.explanation || 'Aucune explication disponible'}</pre>
                        </div>
                    </div>
                </div>
                
                <!-- Stratégies optimales -->
                ${this.renderContextualStrategies(recommendation.id)}
                
                <!-- Bouton d'action -->
                <div class="text-center mt-8">
                    <button id="back-to-results-bottom" class="bg-blue-700 hover:bg-blue-600 text-white px-5 py-2 rounded-lg">
                        <i class="fas fa-arrow-left mr-2"></i> Retour aux résultats
                    </button>
                    <button id="download-details" class="bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-5 py-2 rounded-lg ml-4">
                        <i class="fas fa-file-download mr-2"></i> Télécharger cette fiche
                    </button>
                </div>
            </div>
        `;
        
        resultsContainer.innerHTML = detailsHTML;
        
        // Attacher les événements de retour
        document.getElementById('back-to-results').addEventListener('click', () => {
            this.displayResults(this.getTopRecommendations(3));
        });
        
        document.getElementById('back-to-results-bottom').addEventListener('click', () => {
            this.displayResults(this.getTopRecommendations(3));
        });
        
        document.getElementById('download-details').addEventListener('click', () => {
            alert('Fonctionnalité de téléchargement de fiche à implémenter');
        });
    }

    /**
     * Afficher un tableau comparatif des statuts recommandés
     */
    showComparisonTable(recommendations) {
        const resultsContainer = document.getElementById('results-container');
        
        const comparisonHTML = `
            <div class="comparison-table">
                <div class="mb-4">
                    <button id="back-to-results" class="text-blue-400 hover:text-blue-300 flex items-center">
                        <i class="fas fa-arrow-left mr-2"></i> Retour aux résultats
                    </button>
                </div>
                
                <h2 class="text-2xl font-bold mb-6 text-center">Tableau comparatif des statuts recommandés</h2>
                
                <div class="overflow-x-auto">
                    <table class="w-full bg-blue-900 bg-opacity-50 rounded-lg border border-gray-700">
                        <thead>
                            <tr class="bg-blue-800 bg-opacity-70 text-left">
                                <th class="py-3 px-4 border-b border-gray-700">Critère</th>
                                ${recommendations.map(r => `
                                    <th class="py-3 px-4 border-b border-gray-700">
                                        ${r.status.name} (${r.status.shortName})
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Protection du patrimoine -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Protection du patrimoine</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${this.getStarRating(r.status.key_metrics.patrimony_protection)}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Régime fiscal -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Régime fiscal</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${r.status.fiscalite || '-'}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Régime social -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Régime social</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${r.status.regimeSocial || '-'}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Coût des charges sociales -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Charges sociales</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${this.getInverseStarRating(5 - r.status.key_metrics.social_charges)}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Complexité administrative -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Simplicité administrative</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${this.getStarRating(r.status.key_metrics.administrative_simplicity)}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Crédibilité -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Crédibilité</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${this.getStarRating(r.status.key_metrics.credibility)}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Capacité à lever des fonds -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Capacité à lever des fonds</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${this.getStarRating(r.status.key_metrics.fundraising_capacity)}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Transmission -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Facilité de transmission</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${this.getStarRating(r.status.key_metrics.transmission)}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Coût comptable -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Coût comptable annuel</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${r.status.accounting?.costs || '-'}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Capital minimum -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Capital minimum</td>
                                ${recommendations.map(r => {
                                    let capital = '-';
                                    if (r.status.shortName === 'SA') {
                                        capital = '37 000€';
                                    } else if (['SAS', 'SASU', 'SARL', 'EURL'].includes(r.status.shortName)) {
                                        capital = '1€';
                                    } else {
                                        capital = 'Aucun';
                                    }
                                    return `<td class="py-3 px-4 border-b border-gray-700">${capital}</td>`;
                                }).join('')}
                            </tr>
                            
                            <!-- Score global -->
                            <tr class="bg-blue-800 bg-opacity-30">
                                <td class="py-3 px-4 border-b border-gray-700 font-bold">Score global</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700 font-bold text-green-400">
                                        ${r.score}/100
                                    </td>
                                `).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <!-- Légende -->
                <div class="mt-4 text-sm text-gray-400">
                    <p class="flex items-center">
                        <span class="mr-2">Évaluation :</span>
                        <span class="text-green-400 mr-1">★★★★★</span> Excellent
                        <span class="mx-2">|</span>
                        <span class="text-green-400 mr-1">★★★★☆</span> Très bien
                        <span class="mx-2">|</span>
                        <span class="text-green-400 mr-1">★★★☆☆</span> Bien
                        <span class="mx-2">|</span>
                        <span class="text-green-400 mr-1">★★☆☆☆</span> Moyen
                        <span class="mx-2">|</span>
                        <span class="text-green-400 mr-1">★☆☆☆☆</span> Faible
                    </p>
                </div>
                
                <!-- Bouton d'action -->
                <div class="text-center mt-8">
                    <button id="back-to-results-bottom" class="bg-blue-700 hover:bg-blue-600 text-white px-5 py-2 rounded-lg">
                        <i class="fas fa-arrow-left mr-2"></i> Retour aux résultats
                    </button>
                    <button id="download-comparison" class="bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-5 py-2 rounded-lg ml-4">
                        <i class="fas fa-file-download mr-2"></i> Télécharger ce comparatif
                    </button>
                </div>
            </div>
        `;
        
        resultsContainer.innerHTML = comparisonHTML;
        
        // Attacher les événements de retour
        document.getElementById('back-to-results').addEventListener('click', () => {
            this.displayResults(recommendations);
        });
        
        document.getElementById('back-to-results-bottom').addEventListener('click', () => {
            this.displayResults(recommendations);
        });
        
        document.getElementById('download-comparison').addEventListener('click', () => {
            alert('Fonctionnalité de téléchargement du comparatif à implémenter');
        });
    }
    
    /**
     * Obtenir la notation en étoiles pour un score
     */
    getStarRating(score) {
        const fullStars = Math.floor(score);
        const emptyStars = 5 - fullStars;
        
        return `${'<i class="fas fa-star text-green-400"></i>'.repeat(fullStars)}${'<i class="far fa-star text-gray-500"></i>'.repeat(emptyStars)}`;
    }
    
    /**
     * Obtenir la notation en étoiles inversée pour un score
     */
    getInverseStarRating(score) {
        const fullStars = Math.floor(score);
        const emptyStars = 5 - fullStars;
        
        return `${'<i class="fas fa-star text-red-400"></i>'.repeat(fullStars)}${'<i class="far fa-star text-gray-500"></i>'.repeat(emptyStars)}`;
    }

    /**
     * Générer un PDF avec le résultat de la simulation
     */
    generatePDF(recommendation) {
        // Cette fonction pourrait être implémentée avec une bibliothèque comme jsPDF
        alert('Fonctionnalité d\'export PDF à implémenter');
    }
}

// Compatibilité avec l'ancien système - Définir les objets nécessaires dans window
window.FormeJuridiqueDB = {
    structures: Object.values(window.legalStatuses),
    getById: function(id) {
        return window.legalStatuses[id];
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
    // Rendre la classe disponible globalement
    window.RecommendationEngine = RecommendationEngine;
    window.scoringRules = scoringRules;
    console.log("Classe RecommendationEngine exposée avec succès");
    
    // Signaler explicitement que le moteur est prêt
    document.dispatchEvent(new CustomEvent('recommendationEngineReady'));
    console.log("Événement 'recommendationEngineReady' déclenché");
    
    window.engineLoadingCompleted = true;
} catch (e) {
    console.error("Erreur lors de l'exposition du moteur de recommandation:", e);
}
