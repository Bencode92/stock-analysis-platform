// recommendation-engine.js - Analyse des réponses et génération de recommandations

import { legalStatuses } from './legal-status-data.js';

class RecommendationEngine {
    constructor() {
        this.answers = {};
        this.filteredStatuses = {};
        this.scores = {};
        this.weightedScores = {};
        this.priorityWeights = {};
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
    }

    /**
     * Calculer les recommandations basées sur les réponses
     * @param {Object} answers - Les réponses au questionnaire
     */
    calculateRecommendations(answers) {
        this.answers = answers;
        
        // Réinitialiser les résultats
        this.filteredStatuses = {...legalStatuses};
        this.scores = {};
        this.weightedScores = {};
        this.auditTrail = {
            exclusions: [],
            weightingRules: [],
            scores: {}
        };
        
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
        
        return recommendations;
    }

    /**
     * Appliquer les filtres d'exclusion pour éliminer certains statuts
     */
    applyExclusionFilters() {
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
        
        // 3. Capital < 1€ → SA exclue
        if (parseFloat(this.answers.available_capital) < 1) {
            this.excludeStatus('SA', "Capital insuffisant pour SA (min. 37 000€)");
        }
        
        // 4. Souhait assimilé-salarié → EI/EIRL/MICRO/EURL/SNC exclues
        if (this.answers.social_regime === 'assimilated_employee') {
            this.excludeStatuses(['EI', 'EIRL', 'MICRO', 'SNC'], "Souhait de régime assimilé salarié uniquement");
        }
        
        // 5. Âge < 18 ans → sociétés commerciales exclues (sauf si émancipé)
        if (this.answers.age === 'minor' && !this.answers.emancipated_minor) {
            this.excludeStatuses(['SARL', 'EURL', 'SAS', 'SASU', 'SA', 'SNC'], "Âge inférieur à 18 ans");
        }
        
        // 6. Instruments d'intéressement → EI/EIRL/MICRO/SNC exclues
        if (this.answers.sharing_instruments && 
            this.answers.sharing_instruments.length > 0 && 
            (this.answers.sharing_instruments.includes('bspce') || 
             this.answers.sharing_instruments.includes('aga') ||
             this.answers.sharing_instruments.includes('stock_options'))) {
            this.excludeStatuses(['EI', 'EIRL', 'MICRO', 'SNC'], "Instruments d'intéressement prévus (BSPCE, AGA, stock-options)");
        }
        
        // 7. CA > seuils micro → Micro exclue
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
        
        console.log('Statuts après filtres:', Object.keys(this.filteredStatuses));
    }
    
    /**
     * Exclure un statut juridique
     */
    excludeStatus(statusId, reason) {
        if (this.filteredStatuses[statusId]) {
            delete this.filteredStatuses[statusId];
            
            // Journaliser l'exclusion
            this.auditTrail.exclusions.push({
                status_id: statusId,
                reason: reason
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
                patrimony_protection: this.calculateProtectionScore(statusId, metrics),
                administrative_simplicity: this.calculateSimplicityScore(statusId, metrics),
                taxation_optimization: this.calculateTaxScore(statusId, metrics),
                social_charges: this.calculateSocialScore(statusId, metrics),
                fundraising_capacity: this.calculateFundraisingScore(statusId, metrics),
                credibility: metrics.credibility || 3,
                governance_flexibility: metrics.governance_flexibility || 3,
                transmission: this.calculateTransmissionScore(statusId, metrics)
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
     * Calculer le score de protection du patrimoine
     */
    calculateProtectionScore(statusId, metrics) {
        let score = metrics.patrimony_protection || 1;
        
        // Bonus si importance forte de la protection du patrimoine
        if (this.answers.patrimony_protection === 'essential' && ['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
            score += 1;
        }
        
        // Bonus pour EIRL en cas de risque professionnel élevé
        if (statusId === 'EIRL' && this.answers.high_professional_risk === 'yes') {
            score += 0.5;
        }
        
        // Malus pour l'EI et MICRO en cas de risque professionnel élevé
        if ((statusId === 'EI' || statusId === 'MICRO') && this.answers.high_professional_risk === 'yes') {
            score -= 1;
        }
        
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Calculer le score de simplicité administrative
     */
    calculateSimplicityScore(statusId, metrics) {
        let score = metrics.administrative_simplicity || 3;
        
        // Ajustement pour le CA prévisionnel
        if (this.answers.projected_revenue) {
            const revenue = parseFloat(this.answers.projected_revenue);
            
            // Pour les statuts simples, la simplicité se dégrade avec le CA élevé
            if (statusId === 'EI' || statusId === 'MICRO') {
                if (revenue > 100000) {
                    score -= 1;
                }
            }
            
            // Pour les structures plus complexes, la simplicité est plus adaptée aux gros CA
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                if (revenue < 50000) {
                    score -= 1; // Surcoût administratif pour un petit CA
                } else if (revenue > 300000) {
                    score += 0.5; // Pertinence accrue pour gros CA
                }
            }
        }
        
        // Ajustement en fonction de la préférence de complexité comptable
        if (this.answers.accounting_complexity) {
            if (this.answers.accounting_complexity === 'simple' && ['SAS', 'SA'].includes(statusId)) {
                score -= 1;
            } else if (this.answers.accounting_complexity === 'outsourced' && statusId === 'MICRO') {
                score -= 0.5; // Moins d'intérêt pour la micro si on externalise de toute façon
            }
        }
        
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Calculer le score fiscal
     */
    calculateTaxScore(statusId, metrics) {
        let score = metrics.taxation_optimization || 3;
        
        // Ajustement en fonction de la TMI
        if (this.answers.tax_bracket) {
            // Pour les statuts à l'IR (EI, MICRO), malus si TMI élevée
            if (['EI', 'MICRO', 'SNC'].includes(statusId) && 
                ['bracket_41', 'bracket_45'].includes(this.answers.tax_bracket)) {
                score -= 1.5;
            }
            
            // Pour les statuts à l'IS, bonus si TMI élevée
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId) && 
                ['bracket_41', 'bracket_45'].includes(this.answers.tax_bracket)) {
                score += 1;
            }
            
            // Avantage pour micro si TMI faible
            if (statusId === 'MICRO' && 
                ['non_taxable', 'bracket_11'].includes(this.answers.tax_bracket)) {
                score += 1;
            }
        }
        
        // Ajustement en fonction des préférences de rémunération
        if (this.answers.remuneration_preference) {
            if (this.answers.remuneration_preference === 'dividends' && 
                ['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                score += 0.5;
            }
            
            if (this.answers.remuneration_preference === 'salary' && 
                ['EI', 'MICRO'].includes(statusId)) {
                score += 0.5;
            }
        }
        
        // JEI/CIR/CII bonus pour statuts compatibles
        if (this.answers.jei_cir_cii && this.answers.jei_cir_cii.length > 0) {
            if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) {
                score += 0.5;
            }
        }
        
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Calculer le score sur les charges sociales
     */
    calculateSocialScore(statusId, metrics) {
        let score = metrics.social_charges || 3;
        
        // Ajustement en fonction du régime social souhaité
        if (this.answers.social_regime) {
            if (this.answers.social_regime === 'tns' && 
                ['EI', 'EIRL', 'MICRO', 'EURL', 'SARL'].includes(statusId)) {
                score += 1;
            }
            
            if (this.answers.social_regime === 'assimilated_employee' && 
                ['SASU', 'SAS', 'SA'].includes(statusId)) {
                score += 1;
            }
        }
        
        // Ajustement pour les revenus faibles
        if (this.answers.income_objective_year1) {
            const income = parseFloat(this.answers.income_objective_year1);
            
            if (income < 1500 && statusId === 'MICRO') {
                score += 1; // Le micro est avantageux pour les petits revenus
            }
            
            if (income > 5000 && ['SASU', 'SAS'].includes(statusId)) {
                score -= 0.5; // Les charges assimilé-salarié pèsent sur les gros revenus
            }
        }
        
        // ACRE bonus pour tous les statuts
        if (this.answers.acre === 'yes') {
            score += 0.5;
        }
        
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Calculer le score de capacité de financement
     */
    calculateFundraisingScore(statusId, metrics) {
        let score = metrics.fundraising_capacity || 1;
        
        // Bonus si levée de fonds envisagée
        if (this.answers.fundraising === 'yes') {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                score += 1.5;
            } else if (['SARL', 'EURL'].includes(statusId)) {
                score += 0.5;
            }
        }
        
        // Bonus pour les statuts compatibles avec les instruments de partage
        if (this.answers.sharing_instruments && this.answers.sharing_instruments.length > 0) {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                score += 1;
            }
        }
        
        // Malus pour les structures non adaptées aux investisseurs
        if (this.answers.team_structure === 'investors' && 
            ['EI', 'EIRL', 'MICRO', 'SNC'].includes(statusId)) {
            score -= 2;
        }
        
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Calculer le score de transmission
     */
    calculateTransmissionScore(statusId, metrics) {
        let score = metrics.transmission || 1;
        
        // Ajustement en fonction de l'intention de sortie
        if (this.answers.exit_intention) {
            if (this.answers.exit_intention === 'sale' && 
                ['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                score += 1;
            }
            
            if (this.answers.exit_intention === 'transmission') {
                if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                    score += 1;
                }
                
                // Bonus spécifique pour la transmission familiale
                if (this.answers.family_transmission === 'yes' && statusId === 'SARL') {
                    score += 0.5;
                }
            }
        }
        
        // Malus pour les structures difficiles à transmettre
        if (['EI', 'MICRO'].includes(statusId)) {
            score = Math.min(score, 2); // Plafonner le score
        }
        
        return Math.max(0, Math.min(5, score));
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
        
        // Construire les objets de recommandation
        return topStatuses.map((statusId, index) => {
            return {
                rank: index + 1,
                id: statusId,
                name: this.filteredStatuses[statusId].name,
                shortName: this.filteredStatuses[statusId].shortName,
                score: Math.round(this.weightedScores[statusId]),
                status: this.filteredStatuses[statusId],
                strengths: this.getStrengths(statusId),
                weaknesses: this.getWeaknesses(statusId)
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
        
        // Résumé des exclusions
        if (this.auditTrail.exclusions.length > 0) {
            resultsHTML += `
                <div class="bg-blue-900 bg-opacity-40 p-6 rounded-xl mb-8">
                    <h3 class="text-xl font-semibold mb-3 flex items-center">
                        <i class="fas fa-filter text-yellow-400 mr-2"></i> Statuts exclus de l'analyse
                    </h3>
                    <ul class="space-y-2">
                        ${this.auditTrail.exclusions.map(exclusion => `
                            <li class="flex items-start">
                                <i class="fas fa-times-circle text-red-400 mt-1 mr-2"></i>
                                <span>${exclusion.status_id || ''} - ${exclusion.reason}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }
        
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
                                        <span>${status.taxation?.system || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Options:</span>
                                        <span>${status.taxation?.options || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Détails:</span>
                                        <span>${status.taxation?.details || 'Non spécifié'}</span>
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
                                        <span>${status.social?.regime || 'Non spécifié'}</span>
                                    </li>
                                    <li class="flex items-start">
                                        <span class="font-medium w-28">Taux:</span>
                                        <span>${status.social?.rates || 'Non spécifié'}</span>
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
                    </div>
                </div>
                
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
                                        ${r.status.taxation?.system || '-'}
                                    </td>
                                `).join('')}
                            </tr>
                            
                            <!-- Régime social -->
                            <tr>
                                <td class="py-3 px-4 border-b border-gray-700 font-medium">Régime social</td>
                                ${recommendations.map(r => `
                                    <td class="py-3 px-4 border-b border-gray-700">
                                        ${r.status.social?.regime || '-'}
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
        alert('Fonctionnalité d\\'export PDF à implémenter');
    }
}

// Compatibilité avec l'ancien système - Définir les objets nécessaires dans window
window.FormeJuridiqueDB = {
    structures: Object.values(legalStatuses),
    getById: function(id) {
        return legalStatuses[id];
    }
};

window.ScoringEngine = {
    SCORE_MAX: 100,
    calculerScore: function(forme, userResponses) {
        // Logique simplifiée qui sera remplacée par le vrai calcul dans RecommendationEngine
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

// Rendre la classe disponible globalement pour le chargement non-ES6
window.RecommendationEngine = RecommendationEngine;

export default RecommendationEngine;