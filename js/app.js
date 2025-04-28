// app.js - Fichier principal d'initialisation du simulateur de forme juridique

import QuestionManager from './question-manager.js';
import { legalStatuses } from './legal-status-data.js';

// Fonction d'initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Mettre à jour la date de dernière mise à jour
    updateLastUpdateDate();
    
    // Initialiser directement le moteur de recommandation avec réessai
    initRecommendationEngine();
    
    // Initialiser les événements de l'interface
    initUIEvents();
    
    // Initialiser le gestionnaire de questions après un court délai
    // pour s'assurer que le moteur de recommandation est prêt
    setTimeout(() => {
        initQuestionManager();
    }, 300);
});

/**
 * Initialiser le moteur de recommandation avec mécanisme de réessai
 */
function initRecommendationEngine() {
    // Vérifier si RecommendationEngine est disponible
    if (window.RecommendationEngine) {
        window.recommendationEngine = new window.RecommendationEngine();
        console.log("Moteur de recommandation initialisé avec succès");
        
        // Notifier que le moteur est prêt
        document.dispatchEvent(new CustomEvent('recommendationEngineReady'));
        
        // Créer des ponts de compatibilité avec l'ancien système
        createCompatibilityBridges();
        
        return true;
    } else {
        console.warn("RecommendationEngine n'est pas encore disponible, réessai dans 200ms");
        setTimeout(initRecommendationEngine, 200);
        return false;
    }
}

/**
 * Créer des ponts de compatibilité avec l'ancien système
 */
function createCompatibilityBridges() {
    // Compatibilité avec l'ancien système - FormeJuridiqueDB
    window.FormeJuridiqueDB = {
        structures: Object.values(legalStatuses),
        getById: function(id) {
            return legalStatuses[id];
        }
    };
    
    // Compatibilité avec l'ancien système - ScoringEngine
    window.ScoringEngine = {
        SCORE_MAX: 100,
        calculerScore: function(forme, userResponses) {
            // Utiliser le nouveau moteur pour calculer le score
            if (window.recommendationEngine) {
                // Convertir les données au format attendu par l'ancien système
                const results = window.recommendationEngine.getTopRecommendations(3);
                const matchingResult = results.find(r => r.id === forme.id);
                
                if (matchingResult) {
                    return {
                        formeId: forme.id,
                        forme: forme,
                        score: matchingResult.score || 85,
                        scoreCriteresStructurels: Math.round(matchingResult.score * 0.6),
                        scoreObjectifs: Math.round(matchingResult.score * 0.4),
                        compatibilite: matchingResult.score > 80 ? 'RECOMMANDÉ' : 
                                     matchingResult.score > 60 ? 'COMPATIBLE' : 
                                     matchingResult.score > 40 ? 'PEU ADAPTÉ' : 'DÉCONSEILLÉ',
                        details: matchingResult.strengths || ['Adapté à votre profil'],
                        scoreDetails: { pourcentage: matchingResult.score }
                    };
                }
            }
            
            // Fallback en cas d'échec
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
    
    // Compatibilité avec l'ancien système - SimulationsFiscales
    window.SimulationsFiscales = {
        simulerImpactFiscal: function(forme, caSimulation, params) {
            // Logique simplifiée pour la simulation fiscale
            // Cette fonction pourrait être améliorée pour utiliser de vrais calculs
            const tauxMarge = params?.tauxMarge || 35;
            const benefice = caSimulation * (tauxMarge / 100);
            
            let tauxCharges = 0.25; // Par défaut
            
            // Ajuster selon le type d'activité
            if (params?.typeActivite === 'bic-vente') {
                tauxCharges = 0.22;
            } else if (params?.typeActivite === 'bnc') {
                tauxCharges = 0.27;
            }
            
            // Ajuster selon le régime social
            if (forme.regimeSocial.includes('TNS')) {
                tauxCharges = tauxCharges * 0.9; // 10% de réduction pour les TNS
            }
            
            // Calcul des charges et impôts
            const chargesSociales = benefice * tauxCharges;
            const impot = (benefice - chargesSociales) * (forme.fiscalite === 'IS' ? 0.25 : 0.30);
            const revenueNet = benefice - chargesSociales - impot;
            
            return {
                chargesSociales: chargesSociales,
                impot: impot,
                revenueNet: revenueNet
            };
        }
    };
    
    // Ajouter un pont pour la méthode d'affichage des résultats de l'ancien système
    window.ResultsManager = {
        // Pont vers la méthode de la nouvelle version
        generateResults: function(customParams) {
            if (window.recommendationEngine && window.userResponses) {
                // Effectuer le calcul des recommandations
                const recommendations = window.recommendationEngine.calculateRecommendations(window.userResponses);
                return recommendations;
            } else {
                console.error("Le moteur de recommandation ou les réponses utilisateur ne sont pas disponibles");
                return [];
            }
        },
        
        // Méthode de compatibilité pour l'affichage des résultats
        displayResults: function(results) {
            const resultsContainer = document.getElementById('results-container');
            if (!resultsContainer || !results || results.length === 0) {
                console.error("Impossible d'afficher les résultats: conteneur ou résultats manquants");
                return;
            }
            
            // Récupérer la recommandation principale
            const recommendation = results[0];
            
            // Générer le HTML pour l'affichage des résultats
            let html = `
                <div class="result-card primary-result visible p-6 mb-6 relative">
                    <div class="recommended-badge">Recommandé</div>
                    <h3 class="text-2xl font-bold text-green-400 mb-3">${recommendation.name || recommendation.status.name}</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p class="text-lg mb-3">Score de compatibilité: <strong class="text-green-400">${recommendation.score}%</strong></p>
                            
                            <div class="match-indicator mb-4">
                                <div class="match-fill" style="width: ${recommendation.score}%;"></div>
                            </div>
                            
                            <h4 class="font-semibold mb-2">Caractéristiques principales</h4>
                            <ul class="feature-list">
                                <li><i class="fas fa-users text-green-400"></i> <strong>Associés:</strong> ${recommendation.status.associes}</li>
                                <li><i class="fas fa-coins text-green-400"></i> <strong>Capital:</strong> ${recommendation.status.capital}</li>
                                <li><i class="fas fa-shield-alt text-green-400"></i> <strong>Responsabilité:</strong> ${recommendation.status.responsabilite}</li>
                                <li><i class="fas fa-percentage text-green-400"></i> <strong>Fiscalité:</strong> ${recommendation.status.fiscalite}</li>
                                <li><i class="fas fa-id-card text-green-400"></i> <strong>Régime social:</strong> ${recommendation.status.regimeSocial}</li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 class="font-semibold mb-2">Points forts pour votre profil</h4>
                            <ul class="feature-list">
            `;
            
            // Ajouter les points forts
            recommendation.strengths.forEach(strength => {
                html += `<li><i class="fas fa-check text-green-400"></i> ${strength}</li>`;
            });
            
            html += `
                            </ul>
                            
                            <h4 class="font-semibold mt-4 mb-2">Points de vigilance</h4>
                            <ul class="feature-list">
            `;
            
            // Ajouter les points de vigilance
            recommendation.weaknesses.forEach(weakness => {
                html += `<li><i class="fas fa-exclamation-circle text-yellow-400"></i> ${weakness}</li>`;
            });
            
            html += `
                            </ul>
                        </div>
                    </div>
                </div>
            `;
            
            // Ajouter les alternatives (secondaires)
            if (results.length > 1) {
                html += `
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-medal text-blue-400 mr-2"></i>
                        Autres options compatibles
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                `;
                
                // Ajouter chaque alternative
                results.slice(1).forEach(result => {
                    html += `
                        <div class="result-card visible p-5 relative">
                            <h3 class="text-xl font-bold text-green-400 mb-2">${result.name || result.status.name}</h3>
                            <p class="mb-2">Compatibilité: <strong>${result.score}%</strong></p>
                            
                            <div class="match-indicator mb-3">
                                <div class="match-fill" style="width: ${result.score}%;"></div>
                            </div>
                            
                            <h4 class="font-semibold text-sm mb-2">Points clés</h4>
                            <ul class="text-sm">
                                <li><strong>Fiscalité:</strong> ${result.status.fiscalite}</li>
                                <li><strong>Régime social:</strong> ${result.status.regimeSocial}</li>
                    `;
                    
                    // Ajouter un point fort si disponible
                    if (result.strengths && result.strengths.length > 0) {
                        html += `<li><strong>Points forts:</strong> ${result.strengths[0]}</li>`;
                    }
                    
                    html += `
                            </ul>
                        </div>
                    `;
                });
                
                html += `</div>`;
            }
            
            // Ajouter le contenu au conteneur de résultats
            resultsContainer.innerHTML = html;
            
            // Rendre les boutons d'export visibles
            const exportButtons = document.getElementById('export-buttons');
            if (exportButtons) {
                exportButtons.style.display = 'flex';
            }
            
            // Notifier que les résultats sont chargés
            document.dispatchEvent(new CustomEvent('resultsLoaded'));
        }
    };
    
    // Compatibilité avec l'ancien système - vérifications critères d'exclusion
    window.checkHardFails = function(forme, userResponses) {
        // Cette fonction est utilisée par l'ancien système pour vérifier 
        // les critères d'exclusion. On retourne un tableau vide par défaut.
        return [];
    };
}

/**
 * Initialiser le gestionnaire de questions
 */
function initQuestionManager() {
    // Créer une instance du gestionnaire de questions
    window.questionManager = new QuestionManager();
    
    // Initialiser l'application
    window.questionManager.init();
}

/**
 * Mettre à jour la date de dernière mise à jour
 */
function updateLastUpdateDate() {
    const lastUpdateDateElement = document.getElementById('lastUpdateDate');
    if (lastUpdateDateElement) {
        // Mettre la date actuelle formatée
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = currentDate.getFullYear();
        
        lastUpdateDateElement.textContent = `${day}/${month}/${year}`;
    }
    
    // Mettre à jour l'horloge du marché
    updateMarketClock();
}

/**
 * Mettre à jour l'horloge du marché
 */
function updateMarketClock() {
    const marketTimeElement = document.getElementById('marketTime');
    if (marketTimeElement) {
        // Mettre à jour l'heure toutes les secondes
        setInterval(() => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            
            marketTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
            
            // Mettre à jour l'état du marché (simplifié)
            updateMarketStatus(now);
        }, 1000);
    }
}

/**
 * Mettre à jour l'état du marché
 */
function updateMarketStatus(now) {
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span:not(.market-time)');
    
    if (marketIndicator && marketStatusText) {
        // Heures d'ouverture du marché (9h-17h30 en semaine)
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const isMarketHours = now.getHours() >= 9 && (now.getHours() < 17 || (now.getHours() === 17 && now.getMinutes() <= 30));
        
        if (!isWeekend && isMarketHours) {
            // Marché ouvert
            marketIndicator.className = 'market-indicator green';
            marketStatusText.textContent = 'Marché ouvert';
        } else {
            // Marché fermé
            marketIndicator.className = 'market-indicator';
            marketIndicator.style.backgroundColor = '#777';
            marketStatusText.textContent = 'Marché fermé';
        }
    }
}

/**
 * Initialiser les événements de l'interface
 */
function initUIEvents() {
    // Basculer le thème (clair/sombre)
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const darkIcon = document.getElementById('dark-icon');
    const lightIcon = document.getElementById('light-icon');
    
    if (themeToggleBtn && darkIcon && lightIcon) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            
            darkIcon.classList.toggle('hidden');
            lightIcon.classList.toggle('hidden');
            
            // Enregistrer la préférence dans le localStorage
            const isDarkMode = document.body.classList.contains('dark');
            localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
        });
        
        // Appliquer le thème enregistré
        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode) {
            const isDarkMode = savedDarkMode === 'true';
            document.body.classList.toggle('dark', isDarkMode);
            document.body.classList.toggle('light', !isDarkMode);
            
            darkIcon.classList.toggle('hidden', !isDarkMode);
            lightIcon.classList.toggle('hidden', isDarkMode);
        }
    }

    // Gestion des onglets horizontaux
    const tabItems = document.querySelectorAll('.tab-item');
    
    if (tabItems.length > 0) {
        tabItems.forEach(tab => {
            tab.addEventListener('click', () => {
                // Désactiver tous les onglets
                tabItems.forEach(t => t.classList.remove('active'));
                
                // Activer l'onglet cliqué
                tab.classList.add('active');
                
                // Ici, vous pourriez ajouter la logique pour changer le contenu affiché
                // en fonction de l'onglet sélectionné
            });
        });
    }
}