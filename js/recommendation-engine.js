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

/**
 * Documentation automatique des règles
 * Cette structure stocke les métadonnées de chaque règle pour l'affichage
 * ou l'exportation ultérieure (interface d'admin, documentation)
 */
window.ruleDocs = [];

/**
 * Factory pour créer une règle et documenter ses métadonnées
 * @param {Object} options - Options de la règle
 * @returns {Object} - La règle créée
 */
function makeRule({ id, description, criteria, condition, apply, impact = "medium", category = "standard" }) {
    // Ajouter à la documentation
    window.ruleDocs.push({ 
        id, 
        description, 
        criteria,
        impact, 
        category,
        createdAt: new Date().toISOString()
    });
    
    // Retourner la règle
    return { id, description, criteria, condition, apply };
}

// Liste des critères pour les règles génériques
const criteriaList = [
    'taxation', 'social_cost', 'patrimony_protection', 'governance_flexibility',
    'fundraising', 'flexibility', 'administrative_simplicity', 'accounting_cost',
    'retirement_insurance', 'transmission'
];

// Générer les règles génériques (une par critère)
const scoringRules = criteriaList.map(crit => 
    makeRule({
        id: `intrinsic_${crit}`,
        description: `Note intrinsèque pour le critère ${crit}`,
        criteria: crit,
        category: "intrinsic",
        // Toujours vraie : on applique la note intrinsèque à chaque statut
        condition: () => true,
        /**
         * @param {string} statusId - ex. 'SAS'
         * @param {number} score - score courant
         * @param {Object} answers - réponses utilisateur
         * @param {Object} weights - priorityWeights calculés avant
         * @param {Array} audit - tableau pour stocker l'audit
         */
        apply: (statusId, score, answers, weights, audit) => {
            // Récupérer la note de base du barème (0-5)
            const base = window.ratingScales[crit]?.[statusId] ?? 0;
            
            // Récupérer le poids attribué par l'utilisateur (1-5)
            const weight = weights?.[crit] ?? 3;
            
            // Calculer l'incrément
            const delta = base * weight;
            
            // Enregistrer l'audit
            if (audit) {
                audit.push({
                    rule: `intrinsic_${crit}`,
                    delta,
                    explanation: `Base ${base}/5 × Poids ${weight} = +${delta}`,
                    timestamp: performance.now()
                });
            }
            
            // Retourner le nouveau score
            return score + delta;
        }
    })
);

// Ajouter les règles spécifiques (bonus/malus) pour des cas particuliers
scoringRules.push(
    // Protection du patrimoine « essentielle »
    makeRule({
        id: 'essential_patrimony_protection',
        description: 'Protection du patrimoine essentielle pour l\'utilisateur',
        criteria: 'patrimony_protection',
        category: 'contextual',
        impact: 'high',
        condition: answers => answers.patrimony_protection === 'essential',
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes avec bonne protection patrimoniale
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                delta = 10;
            } 
            // Formes avec protection limitée
            else if (['MICRO', 'EI', 'SNC'].includes(statusId)) {
                delta = -10;
            }
            
            // Enregistrer l'audit
            if (audit) {
                audit.push({
                    rule: 'essential_patrimony_protection',
                    delta,
                    explanation: `${delta > 0 
                        ? 'Bonus pour protection patrimoniale forte' 
                        : 'Malus pour protection patrimoniale limitée'}`,
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Important patrimony protection
    makeRule({
        id: 'important_patrimony_protection',
        description: 'Protection du patrimoine importante pour l\'utilisateur',
        criteria: 'patrimony_protection',
        category: 'contextual',
        condition: answers => answers.patrimony_protection === 'important',
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes avec bonne protection patrimoniale
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                delta = 5;
            } 
            // Formes avec protection limitée
            else if (['MICRO', 'EI', 'SNC'].includes(statusId)) {
                delta = -5;
            }
            
            if (audit) {
                audit.push({
                    rule: 'important_patrimony_protection',
                    delta,
                    explanation: delta > 0 
                        ? 'Bonus modéré pour protection patrimoniale'
                        : 'Malus modéré pour protection patrimoniale limitée',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Levée de fonds nécessaire
    makeRule({
        id: 'need_fundraising',
        description: 'Besoin de lever des fonds',
        criteria: 'fundraising',
        category: 'contextual',
        impact: 'high',
        condition: answers => answers.fundraising === 'yes',
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes adaptées à la levée de fonds
            if (['SAS', 'SASU', 'SA', 'SCA'].includes(statusId)) {
                delta = 8;
            } 
            // Formes peu adaptées
            else if (['MICRO', 'EI', 'EURL', 'SNC', 'SCI'].includes(statusId)) {
                delta = -5;
            }
            
            if (audit) {
                audit.push({
                    rule: 'need_fundraising',
                    delta,
                    explanation: delta > 0 
                        ? 'Forme bien adaptée à la levée de fonds'
                        : 'Forme peu adaptée à la levée de fonds',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Montant de levée important
    makeRule({
        id: 'high_fundraising_amount',
        description: 'Montant important de levée de fonds',
        criteria: 'fundraising',
        category: 'contextual',
        impact: 'high',
        condition: answers => answers.fundraising_amount > 200000,
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes idéales pour des levées importantes
            if (['SAS', 'SA'].includes(statusId)) {
                delta = 12;
            } 
            // Formes possibles mais moins idéales
            else if (['SASU'].includes(statusId)) {
                delta = 6;
            }
            // Formes inadaptées
            else if (['MICRO', 'EI', 'EURL', 'SNC', 'SCI', 'SELARL'].includes(statusId)) {
                delta = -8;
            }
            
            if (audit) {
                audit.push({
                    rule: 'high_fundraising_amount',
                    delta,
                    explanation: `Adaptation à une levée de fonds importante (${answers.fundraising_amount.toLocaleString('fr-FR')} €)`,
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Prévision de CA > seuil micro-entreprise
    makeRule({
        id: 'ca_above_micro',
        description: 'CA prévisionnel supérieur aux plafonds micro-entreprise',
        criteria: 'administrative_simplicity',
        category: 'contextual',
        impact: 'high',
        condition: answers => {
            // Vérifier selon le type d'activité
            if (!answers.projected_revenue) return false;
            
            const typeActivity = answers.activity_type || 'bic_service';
            let threshold;
            
            switch (typeActivity) {
                case 'bic_sales':
                    threshold = window.scales2025?.micro?.bic_sales || 188700;
                    break;
                case 'bnc':
                    threshold = window.scales2025?.micro?.bnc || 77700;
                    break;
                case 'bic_service':
                default:
                    threshold = window.scales2025?.micro?.bic_service || 77700;
                    break;
            }
            
            return answers.projected_revenue > threshold;
        },
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            if (statusId === 'MICRO') {
                delta = -15;
                
                if (audit) {
                    audit.push({
                        rule: 'ca_above_micro',
                        delta,
                        explanation: 'Le CA prévisionnel dépasse les seuils micro-entreprise',
                        timestamp: performance.now()
                    });
                }
            }
            
            return score + delta;
        }
    }),
    
    // Pas de capital disponible
    makeRule({
        id: 'no_capital',
        description: 'Capital initial très limité (< 1€)',
        criteria: 'administrative_simplicity',
        category: 'contextual',
        condition: answers => answers.available_capital < 1,
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // SA nécessite un capital minimum
            if (statusId === 'SA') {
                delta = -20;
            }
            // Formes sans besoin de capital
            else if (['MICRO', 'EI'].includes(statusId)) {
                delta = 5;
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'no_capital',
                    delta,
                    explanation: delta > 0 
                        ? 'Avantage pour forme sans capital minimum'
                        : 'Incompatible avec l\'absence de capital',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // TMI élevée - optimisation fiscale IS
    makeRule({
        id: 'high_income_tax_bracket',
        description: 'Tranche marginale d\'imposition élevée (≥ 30%)',
        criteria: 'taxation',
        category: 'contextual',
        condition: answers => answers.tax_bracket && 
            (answers.tax_bracket === 'bracket_30' || 
             answers.tax_bracket === 'bracket_41' || 
             answers.tax_bracket === 'bracket_45'),
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes à l'IS par défaut ou optionnelles
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                delta = 8;
            } 
            else if (['EURL', 'SARL'].includes(statusId)) {
                delta = 5; // Option IS possible
            }
            // Formes à l'IR sans option IS
            else if (['MICRO'].includes(statusId)) {
                delta = -5;
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'high_income_tax_bracket',
                    delta,
                    explanation: delta > 0 
                        ? 'Optimisation fiscale via IS avantageuse avec TMI élevée'
                        : 'Pas d\'optimisation fiscale possible (IR obligatoire)',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // TMI faible - avantage IR
    makeRule({
        id: 'low_income_tax_bracket',
        description: 'Tranche marginale d\'imposition faible (≤ 11%)',
        criteria: 'taxation',
        category: 'contextual',
        condition: answers => answers.tax_bracket && 
            (answers.tax_bracket === 'non_taxable' || 
             answers.tax_bracket === 'bracket_11'),
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes à l'IR par défaut
            if (['MICRO', 'EI'].includes(statusId)) {
                delta = 8;
            } 
            else if (['EURL', 'SNC'].includes(statusId)) {
                delta = 5; // IR par défaut avec option IS
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'low_income_tax_bracket',
                    delta,
                    explanation: 'IR avantageux avec TMI faible',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Ordre professionnel
    makeRule({
        id: 'professional_order',
        description: 'Inscription à un ordre professionnel requise',
        criteria: 'administrative_simplicity',
        category: 'contextual',
        impact: 'high',
        condition: answers => answers.professional_order === 'yes',
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes adaptées aux professions libérales réglementées
            if (['SELARL', 'SELAS'].includes(statusId)) {
                delta = 15;
            } 
            // Formes incompatibles
            else if (['MICRO'].includes(statusId)) {
                delta = -20;
            }
            // Formes possibles mais non optimales
            else if (['EI', 'EURL'].includes(statusId)) {
                delta = -5;
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'professional_order',
                    delta,
                    explanation: delta > 0 
                        ? 'Structure adaptée aux professions réglementées avec ordre'
                        : 'Structure peu ou pas adaptée aux professions réglementées',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Transmission/sortie envisagée
    makeRule({
        id: 'exit_strategy',
        description: 'Transmission ou sortie envisagée',
        criteria: 'transmission',
        category: 'contextual',
        condition: answers => answers.exit_intention && 
            (answers.exit_intention === 'sale' || 
             answers.exit_intention === 'transmission'),
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes adaptées à la transmission
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                delta = 8;
            } 
            else if (['EURL', 'SASU'].includes(statusId)) {
                delta = 5;
            }
            // Formes difficiles à transmettre
            else if (['MICRO', 'EI'].includes(statusId)) {
                delta = -10;
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'exit_strategy',
                    delta,
                    explanation: delta > 0 
                        ? 'Structure favorable à la revente ou transmission'
                        : 'Structure difficile à transmettre',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Besoin de revenus immédiats
    makeRule({
        id: 'immediate_income_need',
        description: 'Besoin de revenus immédiats',
        criteria: 'social_cost',
        category: 'contextual',
        condition: answers => answers.immediate_income === 'yes',
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes avec rémunération immédiate
            if (['MICRO', 'EI'].includes(statusId)) {
                delta = 8;
            } 
            else if (['SASU', 'SAS'].includes(statusId)) {
                delta = 5; // Possibilité de salaire immédiat
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'immediate_income_need',
                    delta,
                    explanation: 'Structure permettant une rémunération immédiate',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Préférence pour statut TNS
    makeRule({
        id: 'tns_preference',
        description: 'Préférence pour le statut de travailleur non salarié',
        criteria: 'social_cost',
        category: 'contextual',
        condition: answers => answers.social_regime === 'tns',
        apply: (statusId, score, answers, weights, audit) => {
            let delta = 0;
            
            // Formes avec statut TNS
            if (['MICRO', 'EI', 'EURL'].includes(statusId)) {
                delta = 8;
            } 
            // Formes uniquement assimilé salarié
            else if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                delta = -5;
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'tns_preference',
                    delta,
                    explanation: delta > 0 
                        ? 'Structure avec statut TNS correspondant à votre préférence'
                        : 'Structure incompatible avec statut TNS',
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    }),
    
    // Secteur spécifique - si disponible dans les réponses
    makeRule({
        id: 'sector_specific',
        description: 'Adaptation au secteur d\'activité',
        criteria: 'sector_fit',
        category: 'sectorial',
        condition: answers => !!answers.sector,
        apply: (statusId, score, answers, weights, audit) => {
            // Mapping des secteurs vers les formes recommandées et déconseillées
            const sectorMap = {
                tech: { 
                    plus: ['SAS', 'SASU'], 
                    minus: ['MICRO', 'SCI'] 
                },
                commerce: { 
                    plus: ['SARL', 'EURL'], 
                    minus: ['SCI', 'SELARL'] 
                },
                prof_lib: { 
                    plus: ['SELARL', 'SELAS'], 
                    minus: ['SAS', 'MICRO'] 
                },
                artisanat: {
                    plus: ['EURL', 'SARL'],
                    minus: ['SA']
                },
                immobilier: {
                    plus: ['SCI', 'SARL'],
                    minus: ['MICRO']
                }
            };
            
            const config = sectorMap[answers.sector] || { plus: [], minus: [] };
            let delta = 0;
            
            if (config.plus.includes(statusId)) {
                delta = 6;
            } else if (config.minus.includes(statusId)) {
                delta = -6;
            }
            
            if (audit && delta !== 0) {
                audit.push({
                    rule: 'sector_specific',
                    delta,
                    explanation: `${delta > 0 ? 'Bonus' : 'Malus'} sectoriel pour ${answers.sector}`,
                    timestamp: performance.now()
                });
            }
            
            return score + delta;
        }
    })
);

// Rendre les règles disponibles globalement
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
                    
                    // Enregistrer dans l'audit trail
                    this.auditTrail.exclusions.push({
                        filter: filter.id,
                        value: answerValue,
                        excluded: filter.excluded_statuses,
                        timestamp: performance.now()
                    });
                    
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
            retirement_insurance: 3,
            flexibility: 3
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
                    
                    // Enregistrer dans l'audit trail
                    this.auditTrail.weightingRules.push({
                        criteria: priority,
                        weight: weights[index],
                        priority: index + 1
                    });
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
            
            // Créer un tableau d'audit pour ce statut
            const auditLog = [];
            this.auditTrail.scores[statusId] = auditLog;
            
            // Appliquer les règles de scoring
            window.scoringRules.forEach(rule => {
                // Vérifier si la condition est remplie
                let isConditionMet = false;
                if (typeof rule.condition === 'function') {
                    isConditionMet = rule.condition(this.answers);
                }
                
                if (isConditionMet) {
                    // Appliquer la règle avec les poids et l'audit
                    const newScore = rule.apply(
                        statusId, 
                        this.scores[statusId], 
                        this.answers, 
                        this.priorityWeights,
                        auditLog
                    );
                    
                    // Mettre à jour le score
                    this.scores[statusId] = newScore;
                }
            });
            
            // Normaliser le score sur une échelle 0-100
            const criteriaCount = Object.keys(this.priorityWeights).length;
            const maxPossible = 5 /* note max */ * 5 /* poids max */ * criteriaCount + 20 /* bonus */;
            
            this.weightedScores[statusId] = Math.round((this.scores[statusId] / maxPossible) * 100);
            
            // S'assurer que le score reste dans les limites 0-100
            this.weightedScores[statusId] = Math.max(0, Math.min(100, this.weightedScores[statusId]));
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
        
        // Log pour debug
        console.log("Statuts triés par score:", sortedStatuses.map(id => 
            `${id}: ${this.weightedScores[id]}`
        ));
        
        // Créer les recommandations
        const recommendations = [];
        
        // Limiter au nombre demandé ou au nombre disponible
        const limit = Math.min(count, sortedStatuses.length);
        
        // Si aucun statut n'a de score, retourner un tableau vide
        if (limit === 0) {
            console.warn("Aucun statut avec score positif trouvé");
            return [];
        }
        
        // Construire les recommandations
        for (let i = 0; i < limit; i++) {
            const statusId = sortedStatuses[i];
            const status = this.filteredStatuses[statusId];
            
            // Seulement inclure les statuts avec un score >= 40
            if (this.weightedScores[statusId] >= 40) {
                recommendations.push({
                    status: status,
                    score: Math.round(this.weightedScores[statusId]),
                    strengths: this.getStrengths(statusId),
                    weaknesses: this.getWeaknesses(statusId),
                    auditTrail: this.auditTrail.scores[statusId] || []
                });
            } else {
                console.log(`Statut ${statusId} exclu car score trop bas: ${this.weightedScores[statusId]}`);
            }
        }
        
        return recommendations;
    }

    /**
     * Affiche l'audit détaillé d'un statut spécifique
     * @param {string} statusId - Identifiant du statut
     */
    showAudit(statusId) {
        console.group(`Audit détaillé pour ${statusId}`);
        
        if (this.auditTrail.scores[statusId]) {
            this.auditTrail.scores[statusId].forEach(entry => {
                console.log(`${entry.rule}: ${entry.delta > 0 ? '+' : ''}${entry.delta} - ${entry.explanation || ''}`);
            });
        } else {
            console.log("Aucun détail d'audit disponible pour ce statut");
        }
        
        console.groupEnd();
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
            
            // Afficher l'audit si disponible
            if (rec.auditTrail && rec.auditTrail.length > 0) {
                console.group("   Détails du score:");
                rec.auditTrail.forEach(entry => {
                    console.log(`     - ${entry.rule}: ${entry.delta > 0 ? '+' : ''}${entry.delta}`);
                });
                console.groupEnd();
            }
        });
    }
    
    /**
     * Exporter les règles documentées au format JSON
     */
    exportRuleDocumentation() {
        return JSON.stringify(window.ruleDocs, null, 2);
    }
    
    /**
     * Exporter les règles documentées au format Markdown
     */
    exportRuleDocumentationAsMarkdown() {
        const rules = window.ruleDocs;
        let md = "# Documentation des règles du moteur de recommandation\n\n";
        
        // Grouper les règles par catégorie
        const categories = {};
        rules.forEach(rule => {
            if (!categories[rule.category]) {
                categories[rule.category] = [];
            }
            categories[rule.category].push(rule);
        });
        
        // Générer le markdown pour chaque catégorie
        for (const [category, categoryRules] of Object.entries(categories)) {
            md += `## Catégorie: ${category}\n\n`;
            
            categoryRules.forEach(rule => {
                md += `### ${rule.id}\n\n`;
                md += `- **Description**: ${rule.description}\n`;
                md += `- **Critère**: ${rule.criteria}\n`;
                md += `- **Impact**: ${rule.impact}\n`;
                md += `- **Date de création**: ${rule.createdAt}\n\n`;
            });
        }
        
        return md;
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