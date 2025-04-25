/**
 * Moteur de résultats - Génère les recommandations de formes juridiques
 * Utilise le fiscal-simulation.js existant pour les calculs fiscaux
 * Version 2025
 */

import questionnaireData from './question-data.js';

class ResultsEngine {
    constructor() {
        this.results = {};
        this.userResponses = {};
        this.formesJuridiques = questionnaireData.formesJuridiques;
        this.filtersRules = questionnaireData.filtersRules;
    }

    /**
     * Génère les résultats basés sur les réponses de l'utilisateur
     * @param {Object} userResponses - Réponses de l'utilisateur
     * @returns {Object} Résultats générés
     */
    generateResults(userResponses) {
        this.userResponses = userResponses;
        
        // Vérifier que le module fiscal-simulation.js est disponible
        if (!window.SimulationsFiscales || !window.checkHardFails) {
            console.error("Module fiscal-simulation.js non disponible");
            this.displayError("Le module de calcul fiscal n'est pas disponible");
            return null;
        }
        
        // 1. Appliquer les règles d'exclusion (filtres primaires)
        const exclusions = window.checkHardFails(this.adaptResponsesFormat(userResponses));
        
        // 2. Calculer les scores pour chaque forme juridique
        const scoredForms = this.calculateScores(exclusions);
        
        // 3. Grouper les résultats par niveau de compatibilité
        const groupedResults = this.groupResultsByCompatibility(scoredForms);
        
        // 4. Enregistrer les résultats
        this.results = groupedResults;
        
        // 5. Afficher les résultats
        this.displayResults(groupedResults);
        
        return groupedResults;
    }
    
    /**
     * Adapte le format des réponses pour le module fiscal-simulation.js
     * @param {Object} responses - Réponses au format du nouveau questionnaire
     * @returns {Object} Réponses au format attendu par fiscal-simulation.js
     * @private
     */
    adaptResponsesFormat(responses) {
        // Créer un nouvel objet pour les réponses adaptées
        const adapted = {};
        
        // Mapper les champs du nouveau format vers l'ancien
        const fieldMapping = {
            'tmi-actuel': 'tmiActuel',
            'autres-revenus': 'autresRevenusSalaries',
            'horizon-projet': 'horizonProjet',
            'revenu-annee1': 'revenuAnnee1',
            'revenu-annee3': 'revenuAnnee3',
            'protection-patrimoine': 'bienImmobilier',
            'structure-equipe': 'profilEntrepreneur',
            'type-investisseurs': 'typeInvestisseurs',
            'type-activite': 'typeActivite',
            'activite-reglementee': 'activiteReglementee',
            'ordre-professionnel': 'ordreProessionnel',
            'risques-pro': 'risqueResponsabilite',
            'regime-tva': 'regimeTva',
            'ca-previsionnel': 'chiffreAffaires',
            'taux-marge': 'tauxMarge',
            'besoin-revenus-immediats': 'besoinRevenusImmediats',
            'caution-bancaire': 'cautionBancaire',
            'montant-levee': 'montantLevee',
            'preference-remuneration': 'preferenceRemuneration'
        };

        // Mapper les valeurs du nouveau format vers l'ancien
        Object.entries(fieldMapping).forEach(([newField, oldField]) => {
            if (responses[newField] !== undefined) {
                adapted[oldField] = responses[newField];
            }
        });
        
        // Gérer les cas spéciaux
        
        // 1. Type d'investisseurs (conversion from checkbox group to array)
        if (responses['type-investisseurs']) {
            adapted.typeInvestisseurs = [];
            Object.entries(responses['type-investisseurs']).forEach(([key, value]) => {
                if (value === true) {
                    adapted.typeInvestisseurs.push(key);
                }
            });
        }
        
        // 2. Aides et dispositifs
        adapted.aides = [];
        if (responses['aide-acre']) {
            adapted.aides.push('acre');
        }
        if (responses['aide-jei']) {
            adapted.aides.push('jei');
        }
        if (responses['aide-cir']) {
            adapted.aides.push('cir');
        }
        
        // Définir des valeurs par défaut pour les champs manquants
        if (!adapted.tauxMarge) {
            adapted.tauxMarge = 35;
        }
        
        return adapted;
    }
    
    /**
     * Calcule les scores pour chaque forme juridique
     * @param {Array} exclusions - Liste des exclusions
     * @returns {Array} Formes juridiques avec leurs scores
     * @private
     */
    calculateScores(exclusions) {
        const results = [];
        
        // Parcourir chaque forme juridique
        this.formesJuridiques.forEach(forme => {
            // Vérifier si la forme est exclue
            const excluded = exclusions.some(exclusion => exclusion.formeId === forme.id);
            
            if (excluded) {
                // Ajouter aux résultats avec compatibilité INCOMPATIBLE
                const exclusionDetails = exclusions.filter(exc => exc.formeId === forme.id);
                results.push({
                    formeId: forme.id,
                    forme: forme,
                    score: 0,
                    scoreCriteresStructurels: 0,
                    scoreObjectifs: 0,
                    compatibilite: 'INCOMPATIBLE',
                    details: [],
                    exclusionDetails: exclusionDetails
                });
            } else {
                // Calculer le score avec le moteur existant
                try {
                    const scoreResult = window.ScoringEngine.calculerScore(forme, this.adaptResponsesFormat(this.userResponses));
                    
                    // Ajouter la simulation financière
                    const simulation = window.SimulationsFiscales.simulerImpactFiscal(forme, this.userResponses['ca-previsionnel'] || 50000, {
                        ratioSalaire: 50,  // Valeurs par défaut
                        ratioDividendes: 50,
                        tmiActuel: this.userResponses['tmi-actuel'] || 30,
                        tauxMarge: this.userResponses['taux-marge'] || 35,
                        typeActivite: this.userResponses['type-activite'] || 'bic-service'
                    });
                    
                    results.push({
                        ...scoreResult,
                        simulation: simulation
                    });
                } catch (error) {
                    console.error(`Erreur de calcul pour ${forme.id}:`, error);
                    
                    // Ajouter un résultat par défaut en cas d'erreur
                    results.push({
                        formeId: forme.id,
                        forme: forme,
                        score: forme.baseScore || 0,
                        compatibilite: 'NON ÉVALUÉ',
                        details: ['Erreur lors du calcul de score'],
                        error: true
                    });
                }
            }
        });
        
        return results;
    }
    
    /**
     * Groupe les résultats par niveau de compatibilité
     * @param {Array} scoredForms - Formes juridiques avec leurs scores
     * @returns {Object} Résultats groupés par niveau de compatibilité
     * @private
     */
    groupResultsByCompatibility(scoredForms) {
        const recommended = scoredForms.filter(r => r.compatibilite === 'RECOMMANDÉ').sort((a, b) => b.score - a.score);
        const compatible = scoredForms.filter(r => r.compatibilite === 'COMPATIBLE').sort((a, b) => b.score - a.score);
        const lessAdapted = scoredForms.filter(r => r.compatibilite === 'PEU ADAPTÉ').sort((a, b) => b.score - a.score);
        const notRecommended = scoredForms.filter(r => r.compatibilite === 'DÉCONSEILLÉ').sort((a, b) => b.score - a.score);
        const incompatible = scoredForms.filter(r => r.compatibilite === 'INCOMPATIBLE');
        const notEvaluated = scoredForms.filter(r => r.compatibilite === 'NON ÉVALUÉ');
        
        // Toutes les formes triées par score
        const all = [...recommended, ...compatible, ...lessAdapted, ...notRecommended, ...incompatible, ...notEvaluated];
        
        // Top 3 formes pour l'affichage principal
        const top3 = [...recommended, ...compatible, ...lessAdapted].slice(0, 3);
        
        return {
            all,
            top3,
            recommended,
            compatible,
            lessAdapted,
            notRecommended,
            incompatible,
            notEvaluated
        };
    }
    
    /**
     * Affiche les résultats dans l'interface utilisateur
     * @param {Object} groupedResults - Résultats groupés par niveau de compatibilité
     * @private
     */
    displayResults(groupedResults) {
        const resultsContainer = document.getElementById('question-container');
        if (!resultsContainer) return;
        
        // Créer le contenu HTML des résultats
        const mainResult = groupedResults.top3.length > 0 ? groupedResults.top3[0] : null;
        
        if (!mainResult) {
            this.displayNoResults(resultsContainer);
            return;
        }
        
        // Créer le contenu HTML
        let html = `
            <div class="p-6 text-center">
                <h3 class="text-2xl font-bold text-green-400 mb-4">Votre forme juridique recommandée</h3>
                <p class="text-lg opacity-80 mb-8">Basé sur votre profil et vos réponses, voici la forme juridique qui correspond le mieux à vos besoins :</p>
            </div>
            
            <!-- Résultat principal -->
            <div class="result-card primary-result visible p-6 mb-6 relative">
                ${mainResult.compatibilite === 'RECOMMANDÉ' ? '<div class="recommended-badge">Recommandé</div>' : ''}
                <h3 class="text-2xl font-bold text-green-400 mb-3">${mainResult.forme.name}</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p class="text-lg mb-3">Score de compatibilité: <strong class="text-green-400">${Math.round(mainResult.score / window.ScoringEngine.SCORE_MAX * 100)}%</strong></p>
                        
                        <div class="match-indicator mb-4">
                            <div class="match-fill" style="width: ${Math.round(mainResult.score / window.ScoringEngine.SCORE_MAX * 100)}%;"></div>
                        </div>
                        
                        <h4 class="font-semibold mb-2">Caractéristiques principales</h4>
                        <ul class="feature-list">
                            ${Object.entries(mainResult.forme.details).map(([key, value]) => 
                                `<li><i class="fas fa-check text-green-400 mr-2"></i> <strong>${this.formatDetailKey(key)}:</strong> ${value}</li>`
                            ).join('')}
                        </ul>
                    </div>
                    <div>
                        <h4 class="font-semibold mb-2">Points forts pour votre profil</h4>
                        <ul class="feature-list">
                            ${mainResult.details.slice(0, 5).map(detail => 
                                `<li><i class="fas fa-check-circle text-green-400 mr-2"></i> ${detail}</li>`
                            ).join('')}
                        </ul>
                        
                        <h4 class="font-semibold mt-4 mb-2">Impact fiscal estimé</h4>
                        <div class="bg-blue-900 bg-opacity-30 p-3 rounded-lg">
                            <div class="flex justify-between mb-2">
                                <span>Revenu brut simulé:</span>
                                <span>${(mainResult.simulation?.revenuAnnuel || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span>Charges sociales:</span>
                                <span>${Math.round(mainResult.simulation?.chargesSociales || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span>Impôts:</span>
                                <span>${Math.round(mainResult.simulation?.impot || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                            <div class="flex justify-between font-semibold text-green-400">
                                <span>Revenu net estimé:</span>
                                <span>${Math.round(mainResult.simulation?.revenueNet || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter les résultats alternatifs si disponibles
        if (groupedResults.top3.length > 1) {
            html += `
                <h3 class="text-xl font-semibold mb-4 flex items-center">
                    <i class="fas fa-medal text-blue-400 mr-2"></i>
                    Autres options compatibles
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            `;
            
            groupedResults.top3.slice(1).forEach(result => {
                const resultScore = Math.round(result.score / window.ScoringEngine.SCORE_MAX * 100);
                
                html += `
                    <div class="result-card visible p-5 relative">
                        <h3 class="text-xl font-bold text-green-400 mb-2">${result.forme.name}</h3>
                        <p class="mb-2">Compatibilité: <strong>${resultScore}%</strong></p>
                        
                        <div class="match-indicator mb-3">
                            <div class="match-fill" style="width: ${resultScore}%;"></div>
                        </div>
                        
                        <h4 class="font-semibold text-sm mb-2">Points clés</h4>
                        <ul class="text-sm">
                            ${Object.entries(result.forme.details).slice(0, 2).map(([key, value]) => 
                                `<li><strong>${this.formatDetailKey(key)}:</strong> ${value}</li>`
                            ).join('')}
                            <li><strong>Points forts:</strong> ${result.details.slice(0, 2).join(', ')}</li>
                        </ul>
                        
                        <div class="mt-3 grid grid-cols-2 gap-2">
                            <div class="text-sm">
                                <div class="text-xs opacity-70">Charges</div>
                                <div>${Math.round(result.simulation?.chargesSociales || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                            <div class="text-sm">
                                <div class="text-xs opacity-70">Revenu net</div>
                                <div>${Math.round(result.simulation?.revenueNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`;
        }
        
        // Ajouter les formes incompatibles
        if (groupedResults.incompatible.length > 0) {
            html += this.renderIncompatibilities(groupedResults.incompatible);
        }
        
        // Ajouter un lien pour refaire la simulation
        html += `
            <div class="bg-blue-900 bg-opacity-20 p-6 rounded-xl mt-10">
                <h4 class="font-bold text-lg text-green-400 mb-3">Important</h4>
                <p class="mb-4">Ce simulateur fournit des indications générales basées sur vos réponses. Pour un conseil personnalisé et adapté à votre situation précise, il est recommandé de consulter un expert-comptable ou un avocat spécialisé.</p>
                
                <div class="flex flex-wrap gap-4 mt-6">
                    <a href="types-entreprise-v2.html" class="border border-green-400 text-green-400 hover:bg-green-900 hover:bg-opacity-30 font-semibold py-3 px-6 rounded-lg transition flex items-center">
                        <i class="fas fa-redo mr-2"></i> Recommencer la simulation
                    </a>
                </div>
            </div>
        `;
        
        // Injecter le HTML dans le conteneur
        resultsContainer.innerHTML = html;
    }
    
    /**
     * Affiche un message quand aucun résultat n'est disponible
     * @param {HTMLElement} container - Conteneur pour afficher le message
     * @private
     */
    displayNoResults(container) {
        container.innerHTML = `
            <div class="p-6 text-center">
                <h3 class="text-xl font-bold text-red-400 mb-4">Aucun résultat compatible trouvé</h3>
                <p class="mb-4">Vos critères ne correspondent à aucune forme juridique recommandée. Essayez de modifier vos réponses.</p>
                <a href="types-entreprise-v2.html" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition flex items-center mx-auto inline-flex">
                    <i class="fas fa-redo mr-2"></i> Recommencer la simulation
                </a>
            </div>
        `;
    }
    
    /**
     * Affiche un message d'erreur
     * @param {string} message - Message d'erreur à afficher
     * @private
     */
    displayError(message) {
        const container = document.getElementById('question-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="p-6 text-center">
                <h3 class="text-xl font-bold text-red-400 mb-4">Une erreur est survenue</h3>
                <p class="mb-4">${message}</p>
                <a href="types-entreprise-v2.html" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition flex items-center mx-auto inline-flex">
                    <i class="fas fa-redo mr-2"></i> Réessayer
                </a>
            </div>
        `;
    }
    
    /**
     * Génère le HTML pour les formes juridiques incompatibles
     * @param {Array} incompatibleForms - Formes juridiques incompatibles
     * @returns {string} HTML des incompatibilités
     * @private
     */
    renderIncompatibilities(incompatibleForms) {
        if (!incompatibleForms || incompatibleForms.length === 0) return '';
        
        let html = `
            <div class="mt-8 mb-6">
                <h3 class="text-xl font-bold text-red-400 mb-4 flex items-center">
                    <i class="fas fa-exclamation-triangle mr-2"></i> 
                    Formes juridiques incompatibles avec votre profil
                </h3>
                <div class="bg-blue-900 bg-opacity-20 p-4 rounded-xl">
                    <p class="mb-4">Les structures suivantes présentent des incompatibilités majeures avec vos critères :</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        // Regrouper par forme juridique
        const formesMap = new Map();
        
        incompatibleForms.forEach(item => {
            if (!formesMap.has(item.formeId)) {
                formesMap.set(item.formeId, {
                    forme: item.forme,
                    reasons: []
                });
            }
            
            // Ajouter les raisons d'exclusion si disponibles
            if (item.exclusionDetails && item.exclusionDetails.length > 0) {
                item.exclusionDetails.forEach(detail => {
                    // Éviter les doublons
                    if (!formesMap.get(item.formeId).reasons.some(r => r.code === detail.code)) {
                        formesMap.get(item.formeId).reasons.push({
                            code: detail.code,
                            message: detail.message
                        });
                    }
                });
            }
        });
        
        // Générer le HTML pour chaque forme
        formesMap.forEach(item => {
            html += `
                <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                    <h4 class="font-semibold text-red-400 mb-2">${item.forme.name}</h4>
                    <ul class="text-sm">
            `;
            
            // Afficher les raisons d'exclusion
            if (item.reasons.length > 0) {
                item.reasons.forEach(reason => {
                    html += `
                        <li class="mb-1 flex items-start">
                            <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                            <span>${reason.message}</span>
                        </li>
                    `;
                });
            } else {
                // Raison générique si aucune raison spécifique n'est disponible
                html += `
                    <li class="mb-1 flex items-start">
                        <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                        <span>Incompatible avec vos critères</span>
                    </li>
                `;
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
     * Formate une clé de détail pour l'affichage
     * @param {string} key - Clé à formater
     * @returns {string} Clé formatée
     * @private
     */
    formatDetailKey(key) {
        const keyMapping = {
            'associes': 'Associés',
            'capital': 'Capital',
            'responsabilite': 'Responsabilité',
            'regimeSocial': 'Régime social',
            'specificite': 'Spécificité'
        };
        
        return keyMapping[key] || this.capitalizeFirstLetter(key);
    }
    
    /**
     * Met en majuscule la première lettre d'une chaîne
     * @param {string} str - Chaîne à formater
     * @returns {string} - Chaîne formatée
     * @private
     */
    capitalizeFirstLetter(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

export default new ResultsEngine();