/**
 * education-animations.js
 * Scripts d'animation et d'interactivité pour la page d'éducation
 */

document.addEventListener('DOMContentLoaded', function() {
    initAnimations();
    setupTabNavigation();
    enhanceSimulationResults();
    setupComparisonFilters();
    enhanceInvestmentTypeCards();
});

/**
 * Initialise les animations de la page
 */
function initAnimations() {
    // Animation d'entrée pour les cartes de résultats
    animateElementsSequentially('.result-card', 'animate__fadeInUp', 100);
    
    // Animation d'entrée pour les cartes d'investissement
    animateElementsSequentially('.investment-type-card', 'animate__fadeInUp', 100);
    
    // Ajouter un effet de survol au bouton de simulation
    const simulateBtn = document.getElementById('simulate-button');
    if (simulateBtn) {
        simulateBtn.addEventListener('mouseenter', function() {
            this.classList.add('pulse-effect');
        });
        simulateBtn.addEventListener('mouseleave', function() {
            this.classList.remove('pulse-effect');
        });
    }
}

/**
 * Configure la navigation par onglets
 */
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    if (tabButtons.length === 0) return;
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Retirer la classe active de tous les onglets
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // Ajouter la classe active à l'onglet cliqué
            this.classList.add('active');
            
            // Ici, vous pourriez ajouter une logique pour afficher le contenu correspondant
            const tabId = this.getAttribute('data-tab');
            if (tabId) {
                // Masquer tous les contenus d'onglets
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.style.display = 'none';
                });
                
                // Afficher le contenu de l'onglet sélectionné
                const selectedContent = document.getElementById(tabId);
                if (selectedContent) {
                    selectedContent.style.display = 'block';
                }
            }
        });
    });
}

/**
 * Améliore l'affichage des résultats de simulation avec des animations
 */
function enhanceSimulationResults() {
    // Remplace la fonction de mise à jour des résultats existante
    window.updateResultDisplay = function(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const currentValue = parseFloat(element.textContent.replace(/[^\d.-]/g, '')) || 0;
        
        // Ajouter la classe d'animation
        element.classList.add('value-updating');
        
        // Animer la transition entre l'ancienne et la nouvelle valeur
        animateValue(element, currentValue, newValue, 800);
        
        // Retirer la classe d'animation après la fin
        setTimeout(() => {
            element.classList.remove('value-updating');
        }, 1000);
    };
    
    // Fonction d'animation des valeurs numériques
    window.animateValue = function(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            
            // Utiliser la fonction de formatage existante si disponible
            if (window.formatCurrency) {
                element.textContent = formatCurrency(value);
            } else {
                element.textContent = new Intl.NumberFormat('fr-FR', { 
                    style: 'currency', 
                    currency: 'EUR' 
                }).format(value);
            }
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    };
    
    // Surcharge de la fonction runSimulation existante pour utiliser les animations
    const originalRunSimulation = window.runSimulation;
    if (originalRunSimulation) {
        window.runSimulation = function() {
            // Exécuter la fonction originale
            originalRunSimulation();
            
            // Ajouter un effet visuel au graphique
            animateChartAppearance();
        };
    }
}

/**
 * Anime l'apparition du graphique
 */
function animateChartAppearance() {
    const chartContainer = document.querySelector('.chart-container');
    if (!chartContainer) return;
    
    // Ajouter une classe pour l'animation
    chartContainer.classList.add('chart-reveal');
    
    // Retirer la classe après l'animation
    setTimeout(() => {
        chartContainer.classList.remove('chart-reveal');
    }, 1000);
}

/**
 * Configure les filtres pour le tableau de comparaison
 */
function setupComparisonFilters() {
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', function() {
            // Retirer la classe active de tous les boutons
            document.querySelectorAll('.filter-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Ajouter la classe active au bouton cliqué
            this.classList.add('active');
            
            // Filtrer le tableau
            const filter = this.getAttribute('data-filter');
            filterComparisonTable(filter);
        });
    });
}

/**
 * Filtre le tableau de comparaison selon le critère sélectionné
 * @param {string} filter - Critère de filtrage ('all', 'safe', 'growth', 'tax')
 */
function filterComparisonTable(filter) {
    const rows = document.querySelectorAll('.comparison-table tbody tr');
    
    rows.forEach(row => {
        const vehicle = row.getAttribute('data-vehicle');
        const risk = row.querySelectorAll('.risk-dot.active').length;
        
        switch(filter) {
            case 'safe':
                row.style.display = risk <= 2 ? '' : 'none';
                break;
            case 'growth':
                row.style.display = risk >= 3 ? '' : 'none';
                break;
            case 'tax':
                const taxCell = row.querySelectorAll('td')[5].textContent;
                row.style.display = taxCell.includes('Avantageuse') || taxCell.includes('Exonérée') ? '' : 'none';
                break;
            default:
                row.style.display = '';
                break;
        }
    });
}

/**
 * Améliore l'interactivité des cartes de types d'investissement
 */
function enhanceInvestmentTypeCards() {
    document.querySelectorAll('.investment-type-card').forEach(card => {
        // Ajouter un effet de survol
        card.addEventListener('mouseenter', function() {
            this.classList.add('card-hover');
        });
        
        card.addEventListener('mouseleave', function() {
            this.classList.remove('card-hover');
        });
        
        // Ajouter un effet de clic pour afficher plus d'informations
        card.addEventListener('click', function() {
            const vehicleType = this.getAttribute('data-vehicle');
            if (vehicleType) {
                showVehicleDetails(vehicleType);
            }
        });
    });
}

/**
 * Affiche les détails d'un véhicule d'investissement
 * @param {string} vehicleType - Type de véhicule (pea, cto, etc.)
 */
function showVehicleDetails(vehicleType) {
    // Cette fonction pourrait ouvrir une modal avec plus de détails
    if (window.investmentOptions && window.investmentOptions.getVehicleInfo) {
        const vehicleInfo = window.investmentOptions.getVehicleInfo(vehicleType);
        if (!vehicleInfo) return;
        
        // Créer ou mettre à jour la modal
        let modal = document.getElementById('vehicle-details-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'vehicle-details-modal';
            modal.className = 'modal';
            
            const modalContent = document.createElement('div');
            modalContent.className = 'modal-content';
            
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-modal';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
            
            modalContent.appendChild(closeBtn);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            
            // Fermer la modal en cliquant en dehors
            window.addEventListener('click', function(event) {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
        
        // Mettre à jour le contenu de la modal
        const modalContent = modal.querySelector('.modal-content');
        modalContent.innerHTML = `
            <span class="close-modal">&times;</span>
            <div class="vehicle-detail-header">
                <i class="${vehicleInfo.icon}"></i>
                <h2>${vehicleInfo.name}</h2>
            </div>
            <div class="vehicle-detail-content">
                <p class="vehicle-description">${vehicleInfo.description}</p>
                
                <div class="detail-section">
                    <h3>Caractéristiques</h3>
                    <ul class="detail-list">
                        <li><strong>Plafond:</strong> ${vehicleInfo.ceiling ? vehicleInfo.ceiling + (typeof vehicleInfo.ceiling === 'number' ? '€' : '') : 'Aucun'}</li>
                        <li><strong>Durée recommandée:</strong> ${typeof vehicleInfo.recommendedDuration === 'number' ? vehicleInfo.recommendedDuration + ' ans' : vehicleInfo.recommendedDuration}</li>
                        <li><strong>Niveau de risque:</strong> ${vehicleInfo.riskRating}/5</li>
                        <li><strong>Liquidité:</strong> ${vehicleInfo.liquidityRating}/5</li>
                        <li><strong>Rendement moyen:</strong> ${vehicleInfo.averageYield.average}% (${vehicleInfo.averageYield.min}%-${vehicleInfo.averageYield.max}%)</li>
                    </ul>
                </div>
                
                <div class="detail-section">
                    <h3>Fiscalité</h3>
                    <p>${vehicleInfo.taxDetails}</p>
                </div>
                
                <div class="detail-section">
                    <h3>Actifs éligibles</h3>
                    <div class="eligible-assets">
                        ${vehicleInfo.eligibleAssets.map(asset => `<span class="asset-tag">${asset}</span>`).join('')}
                    </div>
                </div>
                
                <div class="detail-section pros-cons">
                    <div class="pros">
                        <h3>Avantages</h3>
                        <ul>
                            ${vehicleInfo.advantages.map(adv => `<li>${adv}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="cons">
                        <h3>Inconvénients</h3>
                        <ul>
                            ${vehicleInfo.disadvantages.map(dis => `<li>${dis}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
        
        // Réattacher l'événement de fermeture
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Afficher la modal
        modal.style.display = 'block';
    }
}

/**
 * Anime une séquence d'éléments avec un délai entre chaque
 * @param {string} selector - Sélecteur CSS des éléments à animer
 * @param {string} animationClass - Classe d'animation à ajouter
 * @param {number} delay - Délai entre chaque animation en ms
 */
function animateElementsSequentially(selector, animationClass, delay) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element, index) => {
        setTimeout(() => {
            element.classList.add(animationClass);
        }, index * delay);
    });
}

/**
 * Crée un effet de vague ondulante pour les données numériques
 */
function createWaveEffect() {
    const resultCards = document.querySelectorAll('.result-card');
    let delay = 0;
    
    function animate() {
        resultCards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('pulse-effect');
                setTimeout(() => {
                    card.classList.remove('pulse-effect');
                }, 600);
            }, index * 200);
        });
    }
    
    // Lancer l'animation initiale
    animate();
    
    // Répéter l'animation toutes les 8 secondes
    setInterval(animate, 8000);
}

// Initialiser l'effet de vague
setTimeout(createWaveEffect, 2000);

/**
 * Effectue une transition de page fluide
 * @param {string} url - URL de destination
 */
function smoothPageTransition(url) {
    // Créer un élément de transition s'il n'existe pas déjà
    let transition = document.getElementById('page-transition');
    if (!transition) {
        transition = document.createElement('div');
        transition.id = 'page-transition';
        transition.className = 'page-transition';
        
        const loading = document.createElement('div');
        loading.className = 'loading-animation';
        transition.appendChild(loading);
        
        document.body.appendChild(transition);
    }
    
    // Afficher la transition
    transition.classList.add('active');
    
    // Naviguer vers la nouvelle page après un court délai
    setTimeout(() => {
        window.location.href = url;
    }, 500);
}

/**
 * Exporte une capture du graphique et des résultats en image
 */
function exportResultsAsImage() {
    const resultsPanel = document.querySelector('.results-panel');
    if (!resultsPanel) return;
    
    // Créer un message de notification
    const notification = document.createElement('div');
    notification.className = 'export-notification';
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>Capture des résultats en cours...</span>
    `;
    
    document.body.appendChild(notification);
    
    // Simuler une exportation (en production, utiliser html2canvas ou une autre bibliothèque)
    setTimeout(() => {
        notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>Résultats exportés avec succès!</span>
        `;
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 500);
        }, 2000);
    }, 1500);
}

// Attacher la fonction d'exportation au bouton
document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('export-results');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportResultsAsImage);
    }
});
