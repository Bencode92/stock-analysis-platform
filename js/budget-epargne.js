/**
 * budget-epargne.js - Module de gestion du budget et de l'épargne
 * Ce module gère la génération de l'interface et des calculs pour la section Budget & Épargne
 * TradePulse Finance Intelligence Platform
 * 
 * Version 3.0 - Intégration système Budget × Quantités pour plus de réalisme
 * Version 2.0 - Ajout accessibilité complète et transparence des formules
 
 */
// Variable-sentinelle globale pour empêcher la double initialisation
if (!window.__budgetPlannerInitialized__) {
    window.__budgetPlannerInitialized__ = false;
}
// =================================
// ÉTAT GLOBAL BUDGET ANALYSIS
// =================================
window.budgetAnalysisState = {
    isFirstAnalysis: true,
    isVisible: false,
    isAnalyzing: false
};
/**
 * Affiche l'analyse budget avec animation
 * @param {HTMLElement} button - Le bouton qui a déclenché l'action
 */
function showBudgetAnalysis(button = null) {
    const resultsContainer = document.getElementById('budget-results');
    
    // Si déjà visible, ne rien faire
    if (!resultsContainer || window.budgetAnalysisState.isVisible) {
        return;
    }
    
    console.log('🎯 Affichage de l\'analyse budget');
    
    // 1. Affichage avec Tailwind
    resultsContainer.classList.remove('hidden');
    setTimeout(() => {
        resultsContainer.style.opacity = '1';
        resultsContainer.style.transform = 'translateY(0)';
    }, 50);
    
    // 2. Mise à jour du bouton
    if (button && window.budgetAnalysisState.isFirstAnalysis) {
        button.innerHTML = '<i class="fas fa-chart-line mr-2"></i>Mettre à jour l\'analyse';
        button.style.background = 'linear-gradient(135deg, #10B981, #059669)';
        button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    }
    
    // 3. Scroll fluide
    setTimeout(() => {
        resultsContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start'
        });
    }, 300);
    
    // 4. Marquer comme visible
    window.budgetAnalysisState.isVisible = true;
    window.budgetAnalysisState.isFirstAnalysis = false;
}
/**
 * Convertit une chaîne en nombre en gérant les formats français
 */
function toNumber(raw) {
    if (!raw || typeof raw !== 'string') return 0;
    
    let cleaned = raw
        .trim()
        .replace(/[\s\u00A0\u2009]/g, '')    // espaces insécables
        .replace(/[€$£¥]/g, '');            // monnaies
    
    // point + virgule → le point est sûrement un séparateur de milliers
    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '');
    } else {
        const first = cleaned.indexOf('.');
        const last  = cleaned.lastIndexOf('.');
        if (first !== -1 && first !== last) cleaned = cleaned.replace(/\./g, '');
    }
    
    cleaned = cleaned.replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// 👉 AJOUT : Anti-rafraîchissement : exécute fn après un délai d'inactivité
function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

// 👉 AJOUT : Vérifie que les 3 champs clés ne sont pas vides
function champsOK() {
    return ['simulation-budget-loyer', 'revenu-mensuel-input']
           .every(id => document.getElementById(id).value.trim() !== '');
}
// Configuration des catégories de dépenses avec valeurs par défaut
const EXPENSE_CATEGORIES = {
    'vie-courante': {
        title: 'Dépenses de la vie courante',
        icon: '🏠',
        color: '#3B82F6',
        items: [
            {
                id: 'alimentation',
                name: 'Alimentation (courses)',
                defaultAmount: 100,
                defaultQuantity: 4,
                unit: 'fois/mois',
                description: 'Courses alimentaires'
            },
            {
                id: 'transport',
                name: 'Transports (essence, métro...)',
                defaultAmount: 75,
                defaultQuantity: 2,
                unit: 'pleins/mois',
                description: 'Carburant et transports'
            },
            {
                id: 'factures',
                name: 'Factures (électricité, eau...)',
                defaultAmount: 150,
                defaultQuantity: 1,
                unit: 'fois/mois',
                description: 'Charges fixes du logement'
            },
            {
                id: 'abonnements',
                name: 'Téléphone / Internet',
                defaultAmount: 80,
                defaultQuantity: 1,
                unit: 'fois/mois',
                description: 'Forfaits téléphoniques et internet'
            }
        ]
    },
    'loisirs': {
        title: 'Loisirs & plaisirs',
        icon: '🎉',
        color: '#10B981',
        items: [
            {
                id: 'restaurants',
                name: 'Restaurants & cafés',
                defaultAmount: 25,
                defaultQuantity: 6,
                unit: 'sorties/mois',
                description: 'Sorties restaurants et cafés'
            },
            {
                id: 'shopping',
                name: 'Shopping & achats plaisir',
                defaultAmount: 50,
                defaultQuantity: 2,
                unit: 'fois/mois',
                description: 'Achats non essentiels'
            },
            {
                id: 'abos-loisirs',
                name: 'Netflix, Spotify...',
                defaultAmount: 15,
                defaultQuantity: 2,
                unit: 'abonnements',
                description: 'Abonnements divertissement'
            },
            {
                id: 'voyages',
                name: 'Voyages & week-ends',
                defaultAmount: 200,
                defaultQuantity: 1,
                unit: 'fois/mois',
                description: 'Vacances et escapades'
            }
        ]
    }
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser l'onglet Budget
    initBudgetPlanner();
});

/**
 * Gestionnaire d'accessibilité clavier
 */
const KeyboardManager = {
    /**
     * Initialise la navigation clavier pour tous les éléments interactifs
     */
    init() {
        this.setupTabNavigation();
        this.setupFocusManagement();
        this.setupAriaAttributes();
    },

    /**
     * Configure la navigation par onglets
     */
    setupTabNavigation() {
        // Boutons de vue (Détaillé/Simplifié)
        document.querySelectorAll('[role="tab"]').forEach(tab => {
            tab.addEventListener('keydown', (e) => {
                if ([' ', 'Enter'].includes(e.key)) {
                    e.preventDefault();
                    tab.click();
                }
                // Navigation fléchée entre onglets
                if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    this.navigateTabs(tab, e.key === 'ArrowRight');
                }
            });
        });

        // Inputs avec Enter pour validation
        document.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    analyserBudget();
                    this.showFeedback('Budget analysé');
                }
            });
        });

        // Boutons avec feedback vocal
        document.querySelectorAll('button').forEach(button => {
            button.addEventListener('focus', () => {
                this.announceElement(button);
            });
        });
    },

    /**
     * Navigation entre onglets avec flèches
     */
    navigateTabs(currentTab, isNext) {
        const tabs = [...document.querySelectorAll('[role="tab"]')];
        const currentIndex = tabs.indexOf(currentTab);
        const nextIndex = isNext 
            ? (currentIndex + 1) % tabs.length 
            : (currentIndex - 1 + tabs.length) % tabs.length;
        
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
    },

    /**
     * Gestion du focus visible
     */
    setupFocusManagement() {
        // Focus visible sur tous les éléments interactifs
        const focusableElements = [
            'button', 'input', 'select', '[role="tab"]', '[tabindex]'
        ].join(',');

        document.querySelectorAll(focusableElements).forEach(el => {
            // Focus visible
            el.classList.add('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-400', 'focus:ring-opacity-50');
            
            // Skip links pour navigation rapide
            if (el.id) {
                el.setAttribute('data-skip-target', el.id);
            }
        });
    },

    /**
     * Configuration des attributs ARIA
     */
    setupAriaAttributes() {
        // Titres et descriptions
        const sections = [
            { id: 'simulation-budget-loyer', label: 'Loyer mensuel', desc: 'Montant du loyer ou crédit immobilier' },
            { id: 'simulation-budget-quotidien', label: 'Dépenses quotidiennes', desc: 'Alimentation, transport, factures' },
            { id: 'simulation-budget-extra', label: 'Loisirs et sorties', desc: 'Restaurants, shopping, voyages' },
            { id: 'simulation-budget-invest', label: 'Épargne automatique', desc: 'Investissement mensuel programmé' }
        ];

        sections.forEach(section => {
            const element = document.getElementById(section.id);
            if (element) {
                element.setAttribute('aria-label', section.label);
                element.setAttribute('aria-describedby', `${section.id}-desc`);
                
                // Créer description cachée pour lecteurs d'écran
                const desc = document.createElement('div');
                desc.id = `${section.id}-desc`;
                desc.className = 'sr-only';
                desc.textContent = section.desc;
                element.parentNode.insertBefore(desc, element.nextSibling);
            }
        });

        // Région live pour les résultats
        const resultsContainer = document.getElementById('budget-advice');
        if (resultsContainer) {
            resultsContainer.setAttribute('aria-live', 'polite');
            resultsContainer.setAttribute('aria-atomic', 'true');
        }
    },

    /**
     * Annonce vocale pour lecteurs d'écran
     */
    announceElement(element) {
        const announcement = element.getAttribute('aria-label') || 
                           element.textContent || 
                           element.title || 
                           'Élément interactif';
        
        // Annonce discrète via aria-live
        this.showFeedback(announcement, true);
    },

    /**
     * Feedback visuel et vocal
     */
    showFeedback(message, isScreenReaderOnly = false) {
        const feedback = document.createElement('div');
        feedback.setAttribute('aria-live', 'assertive');
        feedback.className = isScreenReaderOnly ? 'sr-only' : 'fixed top-4 right-4 bg-blue-600 text-white px-3 py-2 rounded z-50 text-sm';
        feedback.textContent = message;
        
        document.body.appendChild(feedback);
        
        setTimeout(() => feedback.remove(), isScreenReaderOnly ? 100 : 2000);
    }
};

/**
 * Gestionnaire des info-bulles de formules
 */
const FormulaTooltips = {
    /**
     * Base de données des formules
     */
    formulas: {
        'simulation-taux-epargne': {
            title: 'Taux d\'épargne',
            formula: 'Taux = (Épargne possible ÷ Revenu total) × 100',
            explanation: 'Indique le pourcentage de vos revenus que vous parvenez à épargner. Un taux optimal se situe entre 15% et 25%.',
            example: 'Ex: 400€ épargne ÷ 3000€ revenu = 13,3%'
        },
        'simulation-epargne-possible': {
            title: 'Épargne possible',
            formula: 'Épargne = Revenus - (Loyer + Vie courante + Loisirs + Épargne auto + Variables)',
            explanation: 'Montant restant après toutes vos dépenses. C\'est votre capacité d\'épargne additionnelle.',
            example: 'Ex: 3000€ - 2600€ dépenses = 400€'
        },
        'budget-score': {
            title: 'Score budget',
            formula: 'Score = Base(3) + Bonus/Malus selon critères',
            explanation: 'Évaluation de 1 à 5 basée sur vos ratios financiers.',
            criteria: [
                'Taux épargne < 5% : -1 point',
                'Taux épargne > 20% : +1 point', 
                'Loyer > 33% revenus : -1 point',
                'Loyer < 25% revenus : +1 point'
            ]
        },
        'temps-objectif': {
            title: 'Temps pour objectif',
            formula: 'Temps = Montant objectif ÷ Épargne mensuelle',
            explanation: 'Durée nécessaire pour atteindre votre objectif au rythme d\'épargne actuel.',
            example: 'Ex: 5000€ ÷ 400€/mois = 12,5 mois'
        }
    },

    /**
     * Initialise les info-bulles
     */
    init() {
        Object.keys(this.formulas).forEach(elementId => {
            this.attachTooltip(elementId);
        });
    },

    /**
     * Attache une info-bulle à un élément
     */
    attachTooltip(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Ajouter indicateur visuel
        const indicator = document.createElement('span');
        indicator.className = 'ml-1 text-blue-400 cursor-help text-xs';
        indicator.innerHTML = '<i class="fas fa-calculator"></i>';
        indicator.setAttribute('aria-label', 'Voir la formule de calcul');
        indicator.setAttribute('tabindex', '0');

        // Événements
        ['mouseenter', 'focus'].forEach(event => {
            indicator.addEventListener(event, () => this.showTooltip(elementId, indicator));
        });
        
        ['mouseleave', 'blur'].forEach(event => {
            indicator.addEventListener(event, () => this.hideTooltip());
        });

        // Support tactile pour mobile
        indicator.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.toggleTooltip(elementId, indicator);
        });

        // Gestion clavier
        indicator.addEventListener('keydown', (e) => {
            if ([' ', 'Enter'].includes(e.key)) {
                e.preventDefault();
                this.toggleTooltip(elementId, indicator);
            }
        });

        // Insérer l'indicateur
        element.parentNode.insertBefore(indicator, element.nextSibling);
    },

    /**
     * Affiche l'info-bulle
     */
    showTooltip(elementId, triggerElement) {
        this.hideTooltip(); // Masquer les autres

        const formula = this.formulas[elementId];
        const tooltip = document.createElement('div');
        tooltip.id = 'formula-tooltip';
        
        // Responsive design
        const isMobile = window.innerWidth < 768;
        tooltip.className = isMobile 
            ? 'fixed inset-x-4 bottom-4 z-50 p-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-sm text-white transform-none'
            : 'absolute z-50 p-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-sm text-white max-w-xs sm:max-w-sm transform -translate-x-1/2 mt-2';
        
        tooltip.innerHTML = `
            <div class="font-semibold text-blue-400 mb-2 flex items-center">
                <i class="fas fa-formula mr-2"></i>
                ${formula.title}
            </div>
            <div class="mb-2">
                <strong class="text-green-400">Formule :</strong><br>
                <code class="text-green-300 text-xs">${formula.formula}</code>
            </div>
            <div class="mb-2 text-gray-300">
                ${formula.explanation}
            </div>
            ${formula.example ? `
                <div class="text-blue-300 text-xs">
                    <strong>Exemple :</strong> ${formula.example}
                </div>
            ` : ''}
            ${formula.criteria ? `
                <div class="mt-2">
                    <strong class="text-orange-400">Critères :</strong>
                    <ul class="text-xs mt-1 space-y-1">
                        ${formula.criteria.map(c => `<li>• ${c}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            <div class="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
                <kbd>Échap</kbd> pour fermer
            </div>
        `;

        // Positionner la tooltip (seulement si pas mobile)
        if (!isMobile) {
            const rect = triggerElement.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) + 'px';
            tooltip.style.top = rect.bottom + window.scrollY + 'px';
        }

        // Ajouter au DOM
        document.body.appendChild(tooltip);

        // Ajuster si hors écran (desktop seulement)
        if (!isMobile) {
            const tooltipRect = tooltip.getBoundingClientRect();
            if (tooltipRect.right > window.innerWidth) {
                tooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
            }
            if (tooltipRect.left < 0) {
                tooltip.style.left = '10px';
            }
        }

        // Gestion clavier globale
        document.addEventListener('keydown', this.handleTooltipKeyboard);
    },

    /**
     * Masque l'info-bulle
     */
    hideTooltip() {
        const existing = document.getElementById('formula-tooltip');
        if (existing) {
            existing.remove();
            document.removeEventListener('keydown', this.handleTooltipKeyboard);
        }
    },

    /**
     * Toggle l'info-bulle
     */
    toggleTooltip(elementId, triggerElement) {
        const existing = document.getElementById('formula-tooltip');
        if (existing) {
            this.hideTooltip();
        } else {
            this.showTooltip(elementId, triggerElement);
        }
    },

    /**
     * Gestion clavier pour les tooltips
     */
    handleTooltipKeyboard: function(e) {
        if (e.key === 'Escape') {
            FormulaTooltips.hideTooltip();
        }
    }
};

/**
 * Gestionnaire des détails du score budget
 */
const ScoreDetails = {
    /**
     * Initialise le panneau de détails
     */
    init() {
        this.createDetailsPanel();
    },

    /**
     * Crée le panneau de détails du score
     */
    createDetailsPanel() {
        const scoreContainer = document.querySelector('.budget-score-circle')?.parentNode;
        if (!scoreContainer) return;

        // Bouton toggle
        const toggleButton = document.createElement('button');
        toggleButton.id = 'toggle-score-details';
        toggleButton.className = 'mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center';
        toggleButton.setAttribute('aria-expanded', 'false');
        toggleButton.innerHTML = `
            <i class="fas fa-chevron-down mr-1" id="details-chevron"></i>
            Détails du calcul
        `;

        // Panneau de détails
        const detailsPanel = document.createElement('div');
        detailsPanel.id = 'score-details-panel';
        detailsPanel.className = 'mt-3 p-3 bg-blue-800 bg-opacity-20 rounded-lg text-xs hidden';
        detailsPanel.setAttribute('aria-hidden', 'true');

        // Événement toggle
        toggleButton.addEventListener('click', () => {
            this.toggleDetails(toggleButton, detailsPanel);
        });

        // Ajouter au DOM
        scoreContainer.appendChild(toggleButton);
        scoreContainer.appendChild(detailsPanel);
    },

    /**
     * Toggle l'affichage des détails
     */
    toggleDetails(button, panel) {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        const chevron = document.getElementById('details-chevron');

        if (isExpanded) {
            // Fermer
            panel.classList.add('hidden');
            panel.setAttribute('aria-hidden', 'true');
            button.setAttribute('aria-expanded', 'false');
            chevron.className = 'fas fa-chevron-down mr-1';
        } else {
            // Ouvrir
            panel.classList.remove('hidden');
            panel.setAttribute('aria-hidden', 'false');
            button.setAttribute('aria-expanded', 'true');
            chevron.className = 'fas fa-chevron-up mr-1';
            
            // Mettre à jour le contenu
            this.updateDetailsContent(panel);
        }
    },

    /**
     * Met à jour le contenu des détails
     */
    updateDetailsContent(panel) {
        // Récupérer les données actuelles du budget
        const revenuMensuel = parseFloat(document.getElementById('revenu-mensuel-input')?.value) || 0;
        const loyer = toNumber(document.getElementById('simulation-budget-loyer').value);
        const tauxEpargne = parseFloat(document.getElementById('simulation-taux-epargne')?.textContent?.replace('%', '')) || 0;
        
        const ratioLogement = revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0;
        
        // Calculer les points
        let scoreBreakdown = [
            { label: 'Score de base', points: 3, reason: 'Point de départ standard' }
        ];

        if (tauxEpargne < 5) {
            scoreBreakdown.push({ label: 'Taux d\'épargne faible', points: -1, reason: `${tauxEpargne.toFixed(1)}% < 5%` });
        } else if (tauxEpargne >= 20) {
            scoreBreakdown.push({ label: 'Excellent taux d\'épargne', points: 1, reason: `${tauxEpargne.toFixed(1)}% ≥ 20%` });
        }

        if (ratioLogement > 33) {
            scoreBreakdown.push({ label: 'Logement trop cher', points: -1, reason: `${ratioLogement.toFixed(1)}% > 33%` });
        } else if (ratioLogement <= 25) {
            scoreBreakdown.push({ label: 'Logement bien maîtrisé', points: 1, reason: `${ratioLogement.toFixed(1)}% ≤ 25%` });
        }

        const totalScore = scoreBreakdown.reduce((sum, item) => sum + item.points, 0);
        const finalScore = Math.max(1, Math.min(5, totalScore));

        // Générer le HTML
        const html = `
            <h6 class="font-medium text-blue-400 mb-2">Calcul détaillé du score</h6>
            <div class="space-y-2">
                ${scoreBreakdown.map(item => `
                    <div class="flex justify-between items-center">
                        <span class="text-gray-300">${item.label}</span>
                        <div class="text-right">
                            <span class="${item.points > 0 ? 'text-green-400' : item.points < 0 ? 'text-red-400' : 'text-blue-400'}">
                                ${item.points > 0 ? '+' : ''}${item.points} pt
                            </span>
                            <div class="text-gray-500 text-xs">${item.reason}</div>
                        </div>
                    </div>
                `).join('')}
                <div class="border-t border-blue-700 pt-2 mt-2">
                    <div class="flex justify-between items-center font-medium">
                        <span class="text-white">Score final</span>
                        <span class="text-blue-400">${finalScore}/5</span>
                    </div>
                </div>
            </div>
        `;

        panel.innerHTML = html;
    }
};

/**
 * Génère l'interface HTML pour les sections de dépenses avec système montant × quantité
 */
function generateExpenseSectionsHTML() {
    let html = '<div id="dynamic-expenses-container">';
    
    Object.keys(EXPENSE_CATEGORIES).forEach(categoryKey => {
        const category = EXPENSE_CATEGORIES[categoryKey];
        
        html += `
            <div class="expense-category mb-6">
                <div class="category-header flex items-center justify-between mb-4">
                    <h5 class="text-lg font-semibold flex items-center">
                        <span class="mr-2">${category.icon}</span>
                        ${category.title}
                    </h5>
                    <div class="category-total">
                        <span id="total-${categoryKey}" class="text-xl font-bold" style="color: ${category.color}">
                            0€
                        </span>
                    </div>
                </div>
                
                <div class="category-progress mb-4">
                    <div class="progress-bar bg-blue-800 bg-opacity-20 rounded-full h-2">
                        <div id="progress-${categoryKey}" 
                             class="progress-fill h-full rounded-full transition-all duration-500" 
                             style="background-color: ${category.color}; width: 0%">
                        </div>
                    </div>
                    <div class="progress-label text-sm text-gray-400 mt-1">
                        <span id="percentage-${categoryKey}">0%</span> du budget total
                    </div>
                </div>
                
                <div class="expenses-list bg-blue-800 bg-opacity-20 p-4 rounded-lg space-y-3">
                    ${generateCategoryItemsHTML(categoryKey, category.items)}
                </div>
                
                <div class="category-actions mt-3 text-right">
                    <button onclick="resetCategoryToDefaults('${categoryKey}')" 
                            class="btn-reset text-sm text-blue-400 hover:text-blue-300 transition">
                        <i class="fas fa-undo mr-1"></i>
                        Réinitialiser aux valeurs par défaut
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

/**
 * Génère les éléments d'une catégorie avec système montant × quantité
 */
function generateCategoryItemsHTML(categoryKey, items) {
    return items.map(item => `
        <div class="expense-item flex items-center justify-between">
            <div class="expense-info flex-1">
                <label class="expense-label font-medium">${item.name}</label>
                <div class="expense-description text-xs text-gray-400 mt-1">
                    ${item.description}
                </div>
            </div>
            
            <div class="expense-controls flex items-center space-x-2">
                <div class="amount-input flex items-center">
                    <input type="number" 
                           id="amount-${item.id}" 
                           value="${item.defaultAmount}"
                           min="0"
                           step="1"
                           class="w-16 p-1 text-sm rounded bg-blue-900 bg-opacity-30 border border-blue-700 text-white text-center">
                    <span class="text-sm text-gray-300 ml-1">€</span>
                </div>
                
                <span class="text-gray-400">×</span>
                
                <div class="quantity-input flex items-center">
                    <input type="number" 
                           id="quantity-${item.id}" 
                           value="${item.defaultQuantity}"
                           min="0"
                           step="1"
                           class="w-12 p-1 text-sm rounded bg-blue-900 bg-opacity-30 border border-blue-700 text-white text-center">
                    <span class="text-xs text-gray-400 ml-1 w-20">${item.unit}</span>
                </div>
                
                <span class="text-gray-400">=</span>
                
                <div class="total-display">
                    <span id="total-${item.id}" class="font-bold text-green-400">
                        ${item.defaultAmount * item.defaultQuantity}€
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Initialise les écouteurs pour les sections de dépenses avec système montant × quantité
 */
function initFixedExpenseSections() {
    // Ajouter les écouteurs pour tous les champs
    Object.keys(EXPENSE_CATEGORIES).forEach(categoryKey => {
        const category = EXPENSE_CATEGORIES[categoryKey];
        
        category.items.forEach(item => {
            const amountInput = document.getElementById(`amount-${item.id}`);
            const quantityInput = document.getElementById(`quantity-${item.id}`);
            
            if (amountInput && quantityInput) {
                // 🔄 MODIF : Debounce sur 'input', immédiat sur 'change'
                const updateWithDebounce = debounce(() => updateItemTotal(item.id), 250);
                
                amountInput.addEventListener('input', updateWithDebounce);
                amountInput.addEventListener('change', () => updateItemTotal(item.id));
                
                quantityInput.addEventListener('input', updateWithDebounce);
                quantityInput.addEventListener('change', () => updateItemTotal(item.id));
            }
        });
    });
    
    // Calculer les totaux initiaux
    updateAllTotals();
}

/**
 * Met à jour le total d'un élément de dépense
 */
function updateItemTotal(itemId) {
    const amountInput = document.getElementById(`amount-${itemId}`);
    const quantityInput = document.getElementById(`quantity-${itemId}`);
    const totalDisplay = document.getElementById(`total-${itemId}`);
    
    if (!amountInput || !quantityInput || !totalDisplay) return;
    
    // ✅ CORRECTION : parseFloat → toNumber
    const amount = toNumber(amountInput.value);
    const quantity = toNumber(quantityInput.value);
    const total = amount * quantity;
    
    // ✅ AMÉLIORATION : Formatage français
    totalDisplay.textContent = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2
    }).format(total);
    
    // Mettre à jour le total de la catégorie
    const categoryKey = findCategoryByItemId(itemId);
    if (categoryKey) {
        updateCategoryTotal(categoryKey);
    }
    
    // Mettre à jour l'analyse globale du budget
    if (typeof analyserBudget === 'function') {
        analyserBudget();
    }
}

/**
 * Met à jour le total d'une catégorie - VERSION CORRIGÉE
 */
function updateCategoryTotal(categoryKey) {
    const category = EXPENSE_CATEGORIES[categoryKey];
    if (!category) return 0;
    
    let total = 0;
    
    category.items.forEach(item => {
        const amountInput = document.getElementById(`amount-${item.id}`);
        const quantityInput = document.getElementById(`quantity-${item.id}`);
        
        if (amountInput && quantityInput) {
            // ✅ CORRECTION : parseFloat → toNumber
            const amount = toNumber(amountInput.value);
            const quantity = toNumber(quantityInput.value);
            total += amount * quantity;
        }
    });
    
    // ✅ MISE À JOUR DE L'AFFICHAGE DU TOTAL DE CATÉGORIE
    const categoryTotalElement = document.getElementById(`total-${categoryKey}`);
    if (categoryTotalElement) {
        categoryTotalElement.textContent = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2
        }).format(total);
    }
    
    // ✅ MISE À JOUR DE LA BARRE DE PROGRESSION
    updateCategoryProgressBar(categoryKey, total);
    
    // ✅ RETOUR OBLIGATOIRE
    return total;
} 

/**
 * Met à jour la barre de progression d'une catégorie
 */
function updateCategoryProgressBar(categoryKey, total) {
    const loyer = parseFloat(document.getElementById('simulation-budget-loyer')?.value) || 3000;
    const percentage = loyer > 0 ? (total / loyer * 100) : 0;
    
    const progressBar = document.getElementById(`progress-${categoryKey}`);
    const progressLabel = document.getElementById(`percentage-${categoryKey}`);
    
    if (progressBar) {
        progressBar.style.width = `${Math.min(percentage, 100)}%`;
    }
    
    if (progressLabel) {
        progressLabel.textContent = `${percentage.toFixed(1)}%`;
    }
}

/**
 * Trouve la catégorie d'un élément par son ID
 */
function findCategoryByItemId(itemId) {
    for (const [categoryKey, category] of Object.entries(EXPENSE_CATEGORIES)) {
        if (category.items.some(item => item.id === itemId)) {
            return categoryKey;
        }
    }
    return null;
}

/**
 * Remet une catégorie aux valeurs par défaut
 */
function resetCategoryToDefaults(categoryKey) {
    const category = EXPENSE_CATEGORIES[categoryKey];
    if (!category) return;
    
    category.items.forEach(item => {
        const amountInput = document.getElementById(`amount-${item.id}`);
        const quantityInput = document.getElementById(`quantity-${item.id}`);
        
        if (amountInput) amountInput.value = item.defaultAmount;
        if (quantityInput) quantityInput.value = item.defaultQuantity;
        
        updateItemTotal(item.id);
    });
    
    // Animation de confirmation
    const categoryElement = document.querySelector(`#total-${categoryKey}`).closest('.expense-category');
    if (categoryElement) {
        categoryElement.style.transform = 'scale(1.02)';
        categoryElement.style.transition = 'transform 0.2s ease';
        setTimeout(() => {
            categoryElement.style.transform = 'scale(1)';
        }, 200);
    }
}

/**
 * Met à jour tous les totaux
 */
function updateAllTotals() {
    Object.keys(EXPENSE_CATEGORIES).forEach(categoryKey => {
        updateCategoryTotal(categoryKey);
    });
}

/**
 * NOUVELLE VERSION des fonctions updateTotalVieCourante et updateTotalLoisirs 
 * Compatible avec le système montant × quantité
 */
function updateTotalVieCourante() {
    return updateCategoryTotal('vie-courante');
}

function updateTotalLoisirs() {
    return updateCategoryTotal('loisirs');
}

/**
 * Initialise et génère le contenu de l'onglet Budget
 */
function initBudgetPlanner() {
    // Vérifier que le container existe
    const budgetPlanner = document.getElementById('budget-planner');
    if (!budgetPlanner) {
        console.error('❌ Container #budget-planner non trouvé');
        return;
    }
    
    // 🛡️ Garde-fou : on ne construit l'UI qu'une seule fois
    if (window.__budgetPlannerInitialized__) {
        console.log('Budget Planner déjà initialisé, mise à jour uniquement');
        // ❌ SUPPRIMÉ : Plus d'analyse automatique lors de la réinitialisation
        // if (typeof analyserBudget === 'function') analyserBudget();
        return;
    }
    window.__budgetPlannerInitialized__ = true;
    console.log('Initialisation du Budget Planner...');
    
    // Vider le contenu actuel
    budgetPlanner.innerHTML = '';
    
    // Créer le conteneur pour Budget & Épargne
    let budgetGrid = document.createElement('div');
    budgetGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-6 mt-8';
    
    // Ajouter le conteneur à l'onglet Budget
    budgetPlanner.appendChild(budgetGrid);
    
    // Ajouter les styles d'accessibilité ET les styles pour le système montant × quantité
    addAccessibilityStyles();
    addQuantitySystemStyles();
    
    // Générer l'interface Budget & Épargne
    generateBudgetInterface(budgetGrid);
    
    // Initialiser les écouteurs d'événements
    initBudgetListeners();
    
    // ❌ DÉSACTIVÉ : Analyse automatique au chargement
    // L'analyse se déclenchera uniquement au premier clic utilisateur
    // setTimeout(() => {
    //     analyserBudget();
    // }, 500);
    
    console.log('✅ Budget Planner initialisé - En attente du premier clic utilisateur');
}

/**
 * Ajoute les styles CSS pour le système montant × quantité
 */
function addQuantitySystemStyles() {
    if (document.getElementById('quantity-system-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'quantity-system-styles';
    styleEl.textContent = `
        /* ===== CONTENEUR PRINCIPAL ===== */
        #dynamic-expenses-container {
            margin-top: 1rem;
        }

        /* ===== CATÉGORIES DE DÉPENSES ===== */
        .expense-category {
            background: rgba(30, 58, 138, 0.15);
            border: 1px solid rgba(59, 130, 246, 0.2);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            transition: all 0.3s ease;
        }

        .expense-category:hover {
            background: rgba(30, 58, 138, 0.25);
            border-color: rgba(59, 130, 246, 0.3);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        /* ===== EN-TÊTE DE CATÉGORIE ===== */
        .category-header {
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 1rem;
            margin-bottom: 1rem;
        }

        .category-header h5 {
            color: #E5E7EB;
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
        }

        .category-total {
            text-align: right;
        }

        .category-total span {
            font-size: 1.5rem;
            font-weight: 700;
            text-shadow: 0 0 10px currentColor;
        }

        /* ===== BARRES DE PROGRESSION ===== */
        .category-progress {
            margin: 1rem 0;
        }

        .progress-bar {
            height: 8px;
            background: rgba(30, 64, 175, 0.3);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }

        .progress-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }

        .progress-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .progress-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 0.5rem;
            font-size: 0.875rem;
        }

        /* ===== LISTE DES DÉPENSES ===== */
        .expenses-list {
            background: rgba(30, 64, 175, 0.15);
            border: 1px solid rgba(59, 130, 246, 0.15);
            border-radius: 8px;
            padding: 1rem;
        }

        /* ===== ÉLÉMENTS DE DÉPENSE ===== */
        .expense-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.2s ease;
        }

        .expense-item:last-child {
            border-bottom: none;
        }

        .expense-item:hover {
            background: rgba(59, 130, 246, 0.1);
            border-radius: 6px;
            padding-left: 0.5rem;
            padding-right: 0.5rem;
            margin: 0 -0.5rem;
        }

        /* ===== INFO DÉPENSE ===== */
        .expense-info {
            flex: 1;
            min-width: 0;
        }

        .expense-label {
            color: #F3F4F6;
            font-weight: 500;
            font-size: 0.95rem;
        }

        .expense-description {
            color: #9CA3AF;
            font-size: 0.8rem;
            margin-top: 0.25rem;
            font-style: italic;
        }

        /* ===== CONTRÔLES DE DÉPENSE ===== */
        .expense-controls {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-shrink: 0;
        }

        .amount-input, .quantity-input {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }

        .expense-controls input {
            background: rgba(30, 64, 175, 0.4);
            border: 1px solid rgba(59, 130, 246, 0.4);
            border-radius: 6px;
            color: #F3F4F6;
            font-weight: 500;
            text-align: center;
            transition: all 0.2s ease;
            font-size: 0.9rem;
        }

        .expense-controls input:focus {
            outline: none;
            border-color: #34D399;
            box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.2);
            background: rgba(16, 185, 129, 0.1);
        }

        .expense-controls input:hover {
            border-color: rgba(59, 130, 246, 0.6);
            background: rgba(30, 64, 175, 0.5);
        }

        /* Largeurs spécifiques */
        .amount-input input {
            width: 4rem;
            padding: 0.5rem 0.25rem;
        }

        .quantity-input input {
            width: 3rem;
            padding: 0.5rem 0.25rem;
        }

        /* ===== SÉPARATEURS ET LABELS ===== */
        .expense-controls > span {
            color: #9CA3AF;
            font-weight: 500;
            font-size: 1rem;
        }

        .quantity-input span {
            color: #6B7280;
            font-size: 0.75rem;
            width: 5rem;
            text-align: left;
            white-space: nowrap;
        }

        /* ===== AFFICHAGE DU TOTAL ===== */
        .total-display {
            min-width: 4rem;
            text-align: right;
        }

        .total-display span {
            color: #34D399;
            font-weight: 700;
            font-size: 1rem;
            text-shadow: 0 0 8px rgba(52, 211, 153, 0.3);
        }

        /* ===== ACTIONS DE CATÉGORIE ===== */
        .category-actions {
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .btn-reset {
            background: none;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.875rem;
        }

        .btn-reset:hover {
            background: rgba(59, 130, 246, 0.1);
            color: #60A5FA !important;
            transform: translateX(-2px);
        }

        /* ===== RESPONSIVE DESIGN ===== */
        @media (max-width: 768px) {
            .expense-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }
            
            .expense-controls {
                width: 100%;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            
            .amount-input, .quantity-input {
                flex-direction: column;
                text-align: center;
                gap: 0.25rem;
            }
            
            .quantity-input span {
                width: auto;
                text-align: center;
            }
            
            .total-display {
                width: 100%;
                text-align: center;
                order: -1;
                margin-bottom: 0.5rem;
            }
            
            .total-display span {
                font-size: 1.25rem;
            }
        }

        /* ===== ANIMATIONS D'APPARITION ===== */
        .expense-category {
            animation: fadeInUp 0.6s ease forwards;
            opacity: 0;
            transform: translateY(20px);
        }

        .expense-category:nth-child(1) { animation-delay: 0.1s; }
        .expense-category:nth-child(2) { animation-delay: 0.2s; }
        .expense-category:nth-child(3) { animation-delay: 0.3s; }

        @keyframes fadeInUp {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(styleEl);
}

/**
 * Ajoute les styles CSS d'accessibilité
 */
function addAccessibilityStyles() {
    if (document.getElementById('budget-accessibility-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'budget-accessibility-styles';
    styleEl.textContent = `
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
        
        .focus\\:outline-none:focus {
            outline: 2px solid transparent;
            outline-offset: 2px;
        }
        
        .focus\\:ring-2:focus {
            --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
            --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
            box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
        }
        
        .focus\\:ring-blue-400:focus {
            --tw-ring-opacity: 1;
            --tw-ring-color: rgb(96 165 250 / var(--tw-ring-opacity));
        }
        
        .focus\\:ring-opacity-50:focus {
            --tw-ring-opacity: 0.5;
        }
        
        /* Styles pour les animations réduites */
        @media (prefers-reduced-motion: reduce) {
            * {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }
        
        /* Styles pour le contraste élevé */
        @media (prefers-contrast: high) {
            #formula-tooltip {
                border: 2px solid white !important;
                background-color: black !important;
                color: white !important;
            }
        }
    `;
    document.head.appendChild(styleEl);
}

/**
 * Génère l'interface utilisateur pour la section Budget & Épargne
 * @param {HTMLElement} container - Le conteneur où ajouter l'interface
 */
function generateBudgetInterface(container) {
    // Créer la première colonne - Saisie du budget
    const budgetInputCol = document.createElement('div');
    budgetInputCol.className = 'bg-blue-900 bg-opacity-20 p-6 rounded-lg';
    budgetInputCol.innerHTML = `
        <h4 class="text-xl font-semibold mb-4 flex items-center">
            <i class="fas fa-wallet text-blue-400 mr-2"></i>
            Budget Mensuel & Épargne
        </h4>
        
        <!-- Mode d'affichage avec ARIA complet -->
        <div class="mb-4 flex items-center justify-between">
            <span class="text-xs text-gray-400 mr-2 hidden sm:inline">Mode d'affichage:</span>
            <div class="flex items-center bg-blue-800 bg-opacity-30 rounded-md overflow-hidden w-full sm:w-auto" 
                 role="tablist" 
                 aria-label="Mode d'affichage du budget">
                <button id="view-detailed" 
                        class="flex-1 sm:flex-none py-2 px-3 text-xs font-medium text-blue-400 bg-blue-900 bg-opacity-30 selected"
                        role="tab" 
                        aria-selected="true" 
                        aria-controls="detailed-view"
                        tabindex="0">
                    <span class="hidden sm:inline">Détaillé</span>
                    <span class="sm:hidden" aria-hidden="true">📊</span>
                </button>
                <button id="view-simple" 
                        class="flex-1 sm:flex-none py-2 px-3 text-xs font-medium text-gray-300"
                        role="tab" 
                        aria-selected="false" 
                        aria-controls="simple-view"
                        tabindex="-1">
                    <span class="hidden sm:inline">Simplifié</span>
                    <span class="sm:hidden" aria-hidden="true">📝</span>
                </button>
            </div>
        </div>
        
        <!-- Entrées de budget -->
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Loyer / Crédit immobilier
                <span class="ml-1 text-blue-400 cursor-help" title="Votre dépense mensuelle pour votre logement (loyer ou mensualité de crédit).">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-loyer" value="800" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <!-- Vue détaillée - NOUVEAU SYSTÈME MONTANT × QUANTITÉ -->
        <div id="detailed-view" class="mb-6">
            <!-- Le contenu sera généré automatiquement par generateExpenseSectionsHTML() -->
        </div>
        
        <!-- Vue simplifiée -->
        <div id="simple-view" style="display: none;" class="mb-6">
            <div class="mb-4">
                <label class="block mb-2 text-sm font-medium text-gray-300">
                    Vie courante : alimentation, transports, factures...
                    <span class="ml-1 text-blue-400 cursor-help" title="Exemples : courses, électricité, essence, carte de métro, forfait téléphonique, etc.">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <input type="number" id="simulation-budget-quotidien" value="800" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
            </div>
            
            <div class="mb-4">
                <label class="block mb-2 text-sm font-medium text-gray-300">
                    Plaisirs & sorties : restaus, shopping, voyages...
                    <span class="ml-1 text-blue-400 cursor-help" title="Exemples : ciné, resto, bar, week-end, shopping, Netflix, Spotify, etc.">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <input type="number" id="simulation-budget-extra" value="400" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
            </div>
        </div>
        
        <div class="mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Épargne ou investissement automatique
                <span class="ml-1 text-blue-400 cursor-help" title="Exemples : Livret A, PEL, virement programmé sur un PEA, assurance-vie, etc.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="simulation-budget-invest" value="200" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <!-- NOUVELLE SECTION: Dépenses détaillées personnalisables -->
        <div class="mt-6">
            <div class="flex items-center justify-between mb-3">
                <label class="text-sm font-medium text-gray-300 flex items-center">
                    <i class="fas fa-receipt text-blue-400 mr-2"></i>
                    Dépenses variables (optionnel)
                    <span class="ml-1 text-blue-400 cursor-help" title="Ajoutez vos dépenses récurrentes spécifiques pour un budget plus précis">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <span class="text-xs text-blue-400 depense-total">(Total: 0 €)</span>
            </div>
            <div id="depenses-detaillees" class="space-y-3 mt-2">
                <!-- Les lignes de dépenses s'ajouteront ici dynamiquement -->
            </div>
            <button id="ajouter-depense" class="mt-3 py-2 px-3 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded-md flex items-center transition-colors">
                <i class="fas fa-plus-circle mr-2"></i> Ajouter une dépense variable
            </button>
        </div>
        
        <!-- NOUVELLE SECTION: Objectif d'épargne -->
        <div class="mt-5 p-3 bg-blue-800 bg-opacity-30 rounded-lg">
            <label class="flex items-center text-sm font-medium text-gray-300 mb-2">
                <i class="fas fa-bullseye text-blue-400 mr-2"></i>
                Objectif d'épargne
                <span class="ml-1 text-blue-400 cursor-help" title="Définissez un montant cible à atteindre grâce à votre épargne mensuelle">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <input type="number" id="objectif-epargne" placeholder="Ex: 5000" value="5000" min="0" class="bg-blue-900 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full text-sm">
                    <p class="text-xs text-gray-400 mt-1">Montant cible (€)</p>
                </div>
                <div>
                    <select id="objectif-type" class="bg-blue-900 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full text-sm">
                        <option value="vacances">Vacances</option>
                        <option value="achat">Gros achat</option>
                        <option value="urgence">Fond d'urgence</option>
                        <option value="apport">Apport immobilier</option>
                        <option value="autre">Autre projet</option>
                    </select>
                    <p class="text-xs text-gray-400 mt-1">Type d'objectif</p>
                </div>
            </div>
            <div id="temps-objectif" class="mt-3 text-center p-2 bg-blue-900 bg-opacity-20 rounded text-sm hidden">
                <!-- Temps nécessaire pour atteindre l'objectif -->
            </div>
        </div>
        
        <div class="mt-4 mb-4">
            <label class="block mb-2 text-sm font-medium text-gray-300">
                Revenu mensuel estimé
                <span class="ml-1 text-blue-400 cursor-help" title="Votre revenu mensuel net après impôts.">
                    <i class="fas fa-info-circle"></i>
                </span>
            </label>
            <input type="number" id="revenu-mensuel-input" value="3000" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
        </div>
        
        <button id="simulate-budget-button" class="w-full mt-6 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-blue-500/30 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center">
            <i class="fas fa-calculator mr-2"></i> 
            Analyser mon budget
        </button>
        
        <!-- Bouton d'export PDF -->
        <button id="export-budget-pdf" class="w-full mt-3 py-2 px-4 bg-transparent border border-blue-500 text-blue-400 font-medium rounded-lg hover:bg-blue-900 hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center">
            <i class="fas fa-file-export mr-2"></i> 
            Exporter en PDF
        </button>
    `;
    
// Créer la deuxième colonne - Résultats du budget
const budgetResultsCol = document.createElement('div');
budgetResultsCol.id = 'budget-results';
budgetResultsCol.className = 'bg-blue-900 bg-opacity-20 p-6 rounded-lg hidden';
budgetResultsCol.innerHTML = `
    <h4 class="text-xl font-semibold mb-4 flex items-center">
        <i class="fas fa-piggy-bank text-blue-400 mr-2"></i>
        Analyse du budget
    </h4>
    
    <!-- Score global du budget -->
    <div class="mb-5 bg-blue-800 bg-opacity-30 p-3 rounded-lg flex items-center">
        <div class="w-16 h-16 rounded-full bg-blue-900 bg-opacity-50 flex items-center justify-center mr-4 budget-score-circle">
            <span id="budget-score" class="text-2xl font-bold text-blue-400">3</span>
        </div>
        <div>
            <h5 class="font-medium text-white">Score budget</h5>
            <p class="text-sm text-gray-300" id="budget-score-description">Budget équilibré</p>
            <div class="w-full bg-blue-900 h-2 rounded-full mt-1 overflow-hidden">
                <div id="budget-score-bar" class="h-full bg-blue-400" style="width: 60%"></div>
            </div>
        </div>
    </div>
    
<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
        <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-revenu-mensuel">3 000,00 €</p>
        <p class="text-gray-400 text-sm">Revenu mensuel</p>
    </div>
    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
        <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-depenses-totales">2 600,00 €</p>
        <p class="text-gray-400 text-sm">Dépenses totales</p>
    </div>
    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
        <p class="text-blue-400 text-2xl font-bold mb-1" id="simulation-taux-epargne">13,3%</p>
        <p class="text-gray-400 text-sm">Taux d'épargne</p>
    </div>
    
    <!-- NOUVELLES TUILES -->
    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
        <p class="text-green-400 text-2xl font-bold mb-1" id="simulation-epargne-possible">200,00 €</p>
        <p class="text-gray-400 text-sm">Épargne possible</p>
    </div>
    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
        <p class="text-cyan-400 text-2xl font-bold mb-1" id="simulation-epargne-auto">200,00 €</p>
        <p class="text-gray-400 text-sm">Épargne automatique</p>
    </div>
    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
        <p class="text-emerald-400 text-2xl font-bold mb-1" id="simulation-epargne-totale">400,00 €</p>
        <p class="text-gray-400 text-sm">Épargne totale</p>
    </div>
</div>
        
        <div class="chart-container mb-6">
            <canvas id="budget-chart"></canvas>
        </div>
        
        <!-- Nouveau: Graphique d'évolution sur 12 mois -->
        <div class="chart-container mb-6">
            <h5 class="text-sm font-medium text-blue-400 mb-3 flex items-center">
                <i class="fas fa-chart-line mr-2"></i>
                Projection d'épargne sur 12 mois
            </h5>
            <canvas id="evolution-chart"></canvas>
        </div>
        
        <div id="budget-advice" class="bg-blue-900 bg-opacity-20 p-4 rounded-lg border-l-4 border-blue-400">
            <h5 class="text-blue-400 font-medium flex items-center mb-2">
                <i class="fas fa-lightbulb mr-2"></i>
                Conseils budgétaires
            </h5>
            <div class="advice-score bg-blue-900 bg-opacity-20 text-blue-400 inline-block px-2 py-1 rounded text-sm font-medium mb-2">
                Évaluation: 3/5
            </div>
            <ul class="advice-list text-sm text-gray-300 space-y-1 pl-4">
                <li>Un taux d'épargne optimal se situe généralement entre 15% et 25% de vos revenus.</li>
                <li>Vos dépenses de logement représentent environ 30% de votre budget, ce qui est raisonnable.</li>
                <li>Envisagez d'automatiser votre épargne pour atteindre plus facilement vos objectifs.</li>
            </ul>
        </div>
        
        <!-- Résumé final avec recommandations d'investissement -->
        <div id="budget-summary" class="mt-5 bg-green-900 bg-opacity-10 p-4 rounded-lg border-l-4 border-green-400">
            <h5 class="text-green-400 font-medium flex items-center mb-3">
                <i class="fas fa-check-double mr-2"></i>
                Recommandations personnalisées
            </h5>
            <div id="budget-recommendations" class="text-sm text-gray-300">
                <!-- Généré dynamiquement -->
            </div>
        </div>
    `;
    
    // Ajouter les deux colonnes au conteneur
    container.appendChild(budgetInputCol);
    container.appendChild(budgetResultsCol);
    
    // Injecter le HTML du nouveau système dans la vue détaillée
    const detailedView = document.getElementById('detailed-view');
    if (detailedView) {
        detailedView.innerHTML = generateExpenseSectionsHTML();
    }
    
    // Initialiser les graphiques
    initBudgetChart();
    initEvolutionChart();
    
    // Ajouter une première dépense détaillée par défaut pour l'exemple
    addDetailedExpense('Café', 2.5, 20);

    // Initialiser le système montant × quantité
    setTimeout(() => {
        initFixedExpenseSections();
        updateAllTotals();
    }, 200);
}

/**
 * Ajoute une nouvelle ligne de dépense détaillée
 * @param {string} nom - Nom de la dépense (optionnel)
 * @param {number} prix - Prix unitaire (optionnel)
 * @param {number} quantite - Nombre d'unités (optionnel)
 */
function addDetailedExpense(nom = '', prix = '', quantite = '') {
    const container = document.getElementById('depenses-detaillees');
    const index = container.children.length;
    const line = document.createElement('div');
    line.className = "grid grid-cols-7 gap-2 items-center depense-ligne";
    
    line.innerHTML = `
        <input type="text" placeholder="Nom" value="${nom}" class="depense-nom col-span-3 p-2 text-sm rounded bg-blue-800 bg-opacity-50 text-white border border-blue-700" />
        <input type="number" placeholder="Prix" value="${prix}" class="depense-prix col-span-1 p-2 text-sm rounded bg-blue-800 bg-opacity-50 text-white border border-blue-700" />
        <span class="text-center text-gray-400">×</span>
        <input type="number" placeholder="Qté" value="${quantite}" class="depense-qte col-span-1 p-2 text-sm rounded bg-blue-800 bg-opacity-50 text-white border border-blue-700" />
        <button class="depense-supprimer p-1 text-red-400 hover:bg-red-900 hover:bg-opacity-20 rounded transition-colors">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(line);
    
    // Ajouter les écouteurs d'événements à la nouvelle ligne
    const inputs = line.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('change', function() {
            updateDetailedExpensesTotal();
            analyserBudget();
        });
    });
    
    // Écouteur pour le bouton de suppression
    const deleteBtn = line.querySelector('.depense-supprimer');
    deleteBtn.addEventListener('click', function() {
        line.remove();
        updateDetailedExpensesTotal();
        analyserBudget();
    });
    
    // Mettre à jour le total
    updateDetailedExpensesTotal();
}

/**
 * Met à jour le total des dépenses détaillées
 */
function updateDetailedExpensesTotal() {
    let total = 0;
    const lignes = document.querySelectorAll('.depense-ligne');
    
    lignes.forEach(ligne => {
        // ✅ CORRECTION : parseFloat → toNumber pour le prix
        const prix = toNumber(ligne.querySelector('.depense-prix').value);
        // ✅ CORRECTION : parseInt → toNumber pour la quantité (cohérence)
        const quantite = toNumber(ligne.querySelector('.depense-qte').value);
        total += prix * quantite;
    });
    
    // Mettre à jour l'affichage du total
    const totalElement = document.querySelector('.depense-total');
    if (totalElement) {
        totalElement.textContent = `(Total: ${total.toLocaleString('fr-FR')} €)`;
    }
    
    return total;
}

/**
 * Initialise le graphique du budget
 */
function initBudgetChart() {
    const ctx = document.getElementById('budget-chart');
    if (!ctx) return;
    
    const data = {
        labels: ['Loyer', 'Vie courante', 'Loisirs', 'Épargne auto', 'Dépenses variables', 'Épargne possible'],
        datasets: [{
            data: [800, 800, 400, 200, 0, 400],
            backgroundColor: [
                'rgba(255, 99, 132, 0.7)',
                'rgba(54, 162, 235, 0.7)',
                'rgba(255, 206, 86, 0.7)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(153, 102, 255, 0.7)',
                'rgba(255, 159, 64, 0.7)'
            ],
            borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)',
                'rgba(255, 159, 64, 1)'
            ],
            borderWidth: 1
        }]
    };
    
    window.budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', 
                                currency: 'EUR' 
                            }).format(context.raw);
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Initialise le graphique d'évolution sur 12 mois
 */
function initEvolutionChart() {
    const ctx = document.getElementById('evolution-chart');
    if (!ctx) return;
    
    const labels = Array.from({ length: 12 }, (_, i) => `Mois ${i + 1}`);
    const dataPoints = labels.map((_, i) => (i + 1) * 400); // Basé sur une épargne de 400€/mois
    
    window.evolutionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Épargne cumulée',
                data: dataPoints,
                borderColor: 'rgb(59, 130, 246)',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.2)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', 
                                currency: 'EUR',
                                maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', 
                                currency: 'EUR' 
                            }).format(context.raw);
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Initialise les écouteurs d'événements pour le module budget
 */
function initBudgetListeners() {
    // Ajouter un écouteur au bouton d'analyse du budget
    const budgetButton = document.getElementById('simulate-budget-button');
    if (budgetButton) {
        budgetButton.addEventListener('click', () => {
            console.log('👆 Clic sur bouton analyse budget');
            
            // Si pas encore visible, l'afficher d'abord
            if (!window.budgetAnalysisState.isVisible) {
                showBudgetAnalysis(budgetButton);
            }
            
            // Puis lancer l'analyse
            analyserBudget();
        });
    }
    
    // === CHAMPS STANDARDS (avec debounce) ===
    const standardInputs = [
        'simulation-budget-loyer',
        'simulation-budget-quotidien',
        'simulation-budget-extra',
        'revenu-mensuel-input',
        'simulation-budget-invest'   // Épargne/investissement automatique
    ];
    
    standardInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            // Exécution immédiate quand on quitte le champ
            input.addEventListener('change', analyserBudget);
        }
    });
    // === CHAMPS CRITIQUES (réactivité maximale) ===
    const criticalInputs = [
        'objectif-epargne',           // Objectif d'épargne
        'objectif-type'               // Type d'objectif
    ];
    
    criticalInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            // Multi-événements pour réactivité maximale (SANS debounce)
            ['input', 'keyup', 'change', 'blur'].forEach(eventType => {
                input.addEventListener(eventType, () => {
                    // Petite optimisation : éviter les recalculs identiques
                    const currentValue = input.value;
                    if (input.lastCalculatedValue !== currentValue) {
                        input.lastCalculatedValue = currentValue;
                        analyserBudget();
                    }
                });
            });
        }
    });
    
    // Écouteurs pour les boutons de vue
    const viewDetailed = document.getElementById('view-detailed');
    const viewSimple = document.getElementById('view-simple');
    const detailedView = document.getElementById('detailed-view');
    const simpleView = document.getElementById('simple-view');
    
    if (viewDetailed && viewSimple && detailedView && simpleView) {
        viewDetailed.addEventListener('click', function() {
            // Mise à jour ARIA
            viewDetailed.setAttribute('aria-selected', 'true');
            viewDetailed.setAttribute('tabindex', '0');
            viewSimple.setAttribute('aria-selected', 'false');
            viewSimple.setAttribute('tabindex', '-1');
            
            viewDetailed.classList.add('selected');
            viewDetailed.classList.add('text-blue-400');
            viewDetailed.classList.add('bg-blue-900');
            viewDetailed.classList.add('bg-opacity-30');
            viewSimple.classList.remove('selected');
            viewSimple.classList.remove('text-blue-400');
            viewSimple.classList.remove('bg-blue-900');
            viewSimple.classList.remove('bg-opacity-30');
            
            detailedView.style.display = 'block';
            simpleView.style.display = 'none';
            
            // Synchronisation des totaux avec le nouveau système
            updateAllTotals();
        });
        
        viewSimple.addEventListener('click', function() {
            // Mise à jour ARIA
            viewSimple.setAttribute('aria-selected', 'true');
            viewSimple.setAttribute('tabindex', '0');
            viewDetailed.setAttribute('aria-selected', 'false');
            viewDetailed.setAttribute('tabindex', '-1');
            
            viewSimple.classList.add('selected');
            viewSimple.classList.add('text-blue-400');
            viewSimple.classList.add('bg-blue-900');
            viewSimple.classList.add('bg-opacity-30');
            viewDetailed.classList.remove('selected');
            viewDetailed.classList.remove('text-blue-400');
            viewDetailed.classList.remove('bg-blue-900');
            viewDetailed.classList.remove('bg-opacity-30');
            
            detailedView.style.display = 'none';
            simpleView.style.display = 'block';
        });
    }
    
// Ajouter un écouteur spécial pour le revenu mensuel pour ajuster les valeurs suggérées
const revenuInput = document.getElementById('revenu-mensuel-input');
if (revenuInput) {
}
    
    // Écouteur pour le bouton d'ajout de dépense
    const addButton = document.getElementById('ajouter-depense');
    if (addButton) {
        addButton.addEventListener('click', function() {
            addDetailedExpense();
        });
    }
    
    // Écouteur pour le bouton d'export PDF
    const exportButton = document.getElementById('export-budget-pdf');
    if (exportButton) {
        exportButton.addEventListener('click', exportBudgetToPDF);
    }
    
    // Initialiser le système montant × quantité
    setTimeout(() => {
        initFixedExpenseSections();
    }, 200);
    
    // Initialiser l'accessibilité
    KeyboardManager.init();
    
    // Initialiser les info-bulles
    FormulaTooltips.init();
    
    // Initialiser les détails du score
    ScoreDetails.init();
    
    // Notification d'initialisation
    setTimeout(() => {
        KeyboardManager.showFeedback('Module budget avec système montant × quantité initialisé', true);
    }, 500);
    
    // 🐛 DEBUG : Vérifier que les event listeners sont bien attachés
    console.log('✅ Budget listeners initialisés avec réactivité différenciée');
}

/**
 * Ajuste les valeurs par défaut en fonction du revenu
 * @param {number} revenu - Le revenu mensuel
 */
function ajusterValeursParDefaut(revenu) {
    // Ne rien faire si le revenu est inférieur à 500€
    if (revenu < 500) return;
    
    // Calculer des fourchettes raisonnables basées sur le revenu
    const loyerSuggere = Math.round(revenu * 0.3); // ~30% du revenu pour le logement
    
    // Ajuster les valeurs par défaut du nouveau système
    Object.keys(EXPENSE_CATEGORIES).forEach(categoryKey => {
        const category = EXPENSE_CATEGORIES[categoryKey];
        category.items.forEach(item => {
            let nouveauMontant = item.defaultAmount;
            
            // Ajuster selon le type de dépense et le revenu
            if (categoryKey === 'vie-courante') {
                nouveauMontant = Math.round(item.defaultAmount * (revenu / 3000));
            } else if (categoryKey === 'loisirs') {
                nouveauMontant = Math.round(item.defaultAmount * (revenu / 3000) * 0.8);
            }
            
            const amountInput = document.getElementById(`amount-${item.id}`);
            if (amountInput) {
                amountInput.value = nouveauMontant;
                updateItemTotal(item.id);
            }
        });
    });
    
    // Mettre à jour les autres champs
    document.getElementById('simulation-budget-loyer').value = loyerSuggere;
   const investSuggere = Math.round(revenu * 0.1); // Calcul gardé pour référence
    
    // Analyser le budget avec les nouvelles valeurs
    analyserBudget();
}

// ===== EXPORT PDF BUDGET =====

// Variables globales pour PDF
let currentBudgetData = {};

// Fonction principale d'export
function exportBudgetToPDF() {
    console.log('🚀 Début export PDF');
    
    // Vérifier que l'analyse a été faite
    const scoreElement = document.getElementById('budget-score');
    if (!scoreElement || scoreElement.textContent === '--' || scoreElement.textContent === '') {
        alert('⚠️ Veuillez d\'abord analyser votre budget avant d\'exporter le PDF.');
        return;
    }

    // Afficher loader
    const exportBtn = document.getElementById('export-budget-pdf');
    if (!exportBtn) {
        console.error('❌ Bouton export non trouvé');
        return;
    }
    
    const originalText = exportBtn.innerHTML;
    exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Génération PDF...';
    exportBtn.disabled = true;

    // Délai pour laisser l'UI se mettre à jour
    setTimeout(() => {
        let template = null;
        try {
            console.log('📝 Construction du template PDF');
            template = buildPDFTemplate(); // ✅ Récupérer le template retourné
            
            console.log('⚙️ Configuration html2pdf');
            const options = {
                margin: [10, 10, 10, 10],
                filename: generatePDFFilename(),
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2,
                    useCORS: true,
                    backgroundColor: null, // ✅ CHANGÉ : null au lieu de '#ffffff'
                    logging: false
                },
                jsPDF: { 
                    unit: 'mm', 
                    format: 'a4', 
                    orientation: 'portrait'
                },
                pagebreak: { 
                    mode: ['avoid-all', 'css', 'legacy'],
                    before: '.page-break-before',
                    after: '.page-break-after'
                }
            };

            console.log('📄 Génération du PDF...');
            
            html2pdf()
                .set(options)
                .from(template) // ✅ Utiliser le template retourné
                .save()
                .then(() => {
                    console.log('✅ PDF généré avec succès');
                    
                    // ✅ NOUVEAU : Nettoyer le DOM
                    if (template && template.parentNode) {
                        template.parentNode.removeChild(template);
                    }
                    
                    exportBtn.innerHTML = '<i class="fas fa-check mr-2"></i>PDF téléchargé !';
                    setTimeout(() => {
                        exportBtn.innerHTML = originalText;
                        exportBtn.disabled = false;
                    }, 2000);
                })
                .catch(error => {
                    console.error('❌ Erreur génération PDF:', error);
                    
                    // ✅ NOUVEAU : Nettoyer même en cas d'erreur
                    if (template && template.parentNode) {
                        template.parentNode.removeChild(template);
                    }
                    
                    alert('Erreur lors de la génération du PDF. Vérifiez la console.');
                    exportBtn.innerHTML = originalText;
                    exportBtn.disabled = false;
                });
                
        } catch (error) {
            console.error('❌ Erreur construction PDF:', error);
            
            // ✅ NOUVEAU : Nettoyer même en cas d'erreur de construction
            if (template && template.parentNode) {
                template.parentNode.removeChild(template);
            }
            
            alert('Erreur lors de la construction du PDF. Vérifiez la console.');
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }
    }, 100);
}

/**
 * Construction du template principal - VERSION CORRIGÉE
 * ✅ Problème résolu : Élément capturable par html2canvas
 */
function buildPDFTemplate() {
    // ✅ NOUVEAU : Créer un clone hors-flux au lieu d'utiliser l'élément DOM
    const template = document.createElement('div');
    template.className = 'pdf-container';
    template.id = 'pdf-export-template';
    
    console.log('🏗️ Construction des sections PDF');
    
    // Construire chaque section
    template.appendChild(buildPdfHeader());
    template.appendChild(buildPdfHero());
    // ❌ SUPPRIMÉ : template.appendChild(buildPdfCharts()); // Retire les graphiques indésirables
    template.appendChild(buildPdfDetailsTable());
    template.appendChild(buildPdfObjective());
    template.appendChild(buildPdfRecommendations());
    
    // Page 2
    const page2 = document.createElement('div');
    page2.className = 'page-break-before';
    page2.appendChild(buildPdfFormulas());
    page2.appendChild(buildPdfFooter());
    template.appendChild(page2);
    
    console.log('✅ Template construit:', template.innerHTML.length, 'caractères');
    
    // 🎯 CORRECTION PRINCIPALE : Élément dans le viewport mais invisible
    Object.assign(template.style, {
        position: 'fixed',           // ✅ Dans le viewport (pas absolute)
        left: '0',                   // ✅ Coordonnées visibles (pas -9999px)
        top: '0',                    // ✅ html2canvas peut capturer
        width: '210mm',              // Format A4 standard
        height: 'auto',              // Hauteur automatique selon contenu
        minHeight: '297mm',          // Hauteur A4 minimum
        opacity: '0',                // ✅ Invisible visuellement
        pointerEvents: 'none',       // ✅ Pas d'interaction utilisateur
        zIndex: '-9999',             // ✅ Derrière tous les autres éléments
        backgroundColor: 'white',    // ✅ Fond blanc pour contraste
        color: 'black',              // ✅ Texte noir pour lisibilité
        padding: '20px',             // Marges internes
        boxSizing: 'border-box',     // Inclure padding dans les dimensions
        fontFamily: 'Arial, sans-serif', // Police standard pour PDF
        fontSize: '12px',            // Taille lisible
        lineHeight: '1.4',           // Espacement des lignes
        overflow: 'hidden',          // Éviter les débordements
        transformOrigin: 'top left', // Point d'origine pour transformations
        transform: 'scale(1)'        // Échelle normale (ajustable si besoin)
    });
    
    // ✅ NOUVEAU : Ajouter au DOM pour rendu html2canvas
    document.body.appendChild(template);
    
    // ✅ DEBUG : Vérifier que le template est bien construit
    if (template.innerHTML.length === 0) {
        console.error('❌ Template PDF vide ! Vérifiez les fonctions de construction.');
    } else {
        console.log('✅ Template PDF prêt pour capture :', {
            width: template.offsetWidth,
            height: template.offsetHeight,
            sections: template.children.length
        });
    }
    
    // ✅ NOUVEAU : Retourner le template créé
    return template;
}

// 1. Header
function buildPdfHeader() {
    const div = document.createElement('div');
    div.className = 'pdf-header avoid-break';
    
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 24px; font-weight: 900; color: #059669;">
                TRADEPULSE
            </div>
            <div style="text-align: center;">
                <h1 style="margin: 0; color: #1f2937; font-size: 20px;">Analyse de mon budget</h1>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                    Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
                </div>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
                TradePulse v4.8
            </div>
        </div>
    `;
    
    return div;
}

// 2. Hero section
function buildPdfHero() {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-hero avoid-break';
    
    // Récupération sécurisée des données
    const revenuInput = document.getElementById('simulation-revenu-mensuel');
    const revenu = revenuInput ? parseFloat(revenuInput.value) || 0 : 0;
    
    const depensesElement = document.querySelector('#simulation-depenses-totales');
    const depensesText = depensesElement ? depensesElement.textContent : '0';
    const depenses = parseFloat(depensesText.replace(/[^\d.-]/g, '')) || 0;
    
    const epargneElement = document.querySelector('#simulation-epargne-totale');
    const epargneText = epargneElement ? epargneElement.textContent : '0';
    const epargne = parseFloat(epargneText.replace(/[^\d.-]/g, '')) || 0;
    
    const scoreElement = document.getElementById('budget-score');
    const score = scoreElement ? scoreElement.textContent : '--';
    
    const scoreDescElement = document.getElementById('budget-score-description');
    const scoreDesc = scoreDescElement ? scoreDescElement.textContent : 'Analyse effectuée';
    
    // Calculer le taux d'épargne
    const tauxEpargne = revenu > 0 ? ((epargne / revenu) * 100).toFixed(1) : '0';
    
    wrap.innerHTML = `
        <h2 style="color: #059669; margin-bottom: 15px; text-align: center; font-size: 18px;">
            📊 Résumé de votre situation financière
        </h2>
        
        <table class="pdf-table">
            <thead>
                <tr>
                    <th>Revenu mensuel net</th>
                    <th>Dépenses totales</th>
                    <th>Épargne disponible</th>
                    <th>Taux d'épargne</th>
                    <th>Score budget</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="text-align: center; font-weight: 600;">
                        ${formatCurrencyPDF(revenu)}
                    </td>
                    <td style="text-align: center; font-weight: 600;">
                        ${formatCurrencyPDF(depenses)}
                    </td>
                    <td style="text-align: center; font-weight: 600; color: #059669;">
                        ${formatCurrencyPDF(epargne)}
                    </td>
                    <td style="text-align: center; font-weight: 600; color: #059669;">
                        ${tauxEpargne}%
                    </td>
                    <td style="text-align: center; font-size: 18px; font-weight: bold; color: #059669;">
                        ${score}/5
                    </td>
                </tr>
            </tbody>
        </table>
        
        <p style="text-align: center; font-style: italic; margin-top: 12px; color: #374151; font-size: 14px;">
            <strong>${scoreDesc}</strong>
        </p>
        
        <div style="text-align: center; margin-top: 15px; padding: 10px; background: rgba(5, 150, 105, 0.1); border-radius: 8px;">
            <p style="margin: 0; color: #059669; font-weight: 600;">
                ${generateSummaryText(revenu, depenses, epargne, parseFloat(tauxEpargne))}
            </p>
        </div>
    `;
    
    return wrap;
}

// 3. Graphiques
function buildPdfCharts() {
    const box = document.createElement('div');
    box.className = 'avoid-break';
    box.style.marginTop = '25px';
    
    const title = document.createElement('h3');
    title.textContent = '📈 Visualisation du budget';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    box.appendChild(title);
    
    const chartsContainer = document.createElement('div');
    chartsContainer.style.cssText = 'display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap;';
    
    let chartAdded = false;
    
    // Graphique doughnut
    const budgetChart = document.getElementById('budget-chart');
    if (budgetChart) {
        try {
            const donutData = budgetChart.toDataURL('image/png', 1.0);
            if (donutData && donutData !== 'data:,') {
                const container = document.createElement('div');
                container.className = 'chart-container-pdf';
                
                const img = document.createElement('img');
                img.src = donutData;
                img.alt = 'Répartition des postes de dépenses';
                
                const label = document.createElement('p');
                label.textContent = 'Répartition des dépenses';
                label.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 8px; font-weight: 500;';
                
                container.appendChild(img);
                container.appendChild(label);
                chartsContainer.appendChild(container);
                chartAdded = true;
            }
        } catch (e) {
            console.warn('Impossible de capturer le graphique budget:', e);
        }
    }
    
    // Graphique évolution
    const evolutionChart = document.getElementById('evolution-chart');
    if (evolutionChart) {
        try {
            const lineData = evolutionChart.toDataURL('image/png', 1.0);
            if (lineData && lineData !== 'data:,') {
                const container = document.createElement('div');
                container.className = 'chart-container-pdf';
                
                const img = document.createElement('img');
                img.src = lineData;
                img.alt = 'Projection d\'épargne sur 12 mois';
                
                const label = document.createElement('p');
                label.textContent = 'Projection épargne 12 mois';
                label.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 8px; font-weight: 500;';
                
                container.appendChild(img);
                container.appendChild(label);
                chartsContainer.appendChild(container);
                chartAdded = true;
            }
        } catch (e) {
            console.warn('Impossible de capturer le graphique évolution:', e);
        }
    }
    
    if (!chartAdded) {
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'width: 100%; text-align: center; padding: 40px; color: #6b7280; border: 2px dashed #e5e7eb; border-radius: 8px;';
        placeholder.innerHTML = '<p>📊 Graphiques non disponibles pour cette session</p>';
        chartsContainer.appendChild(placeholder);
    }
    
    box.appendChild(chartsContainer);
    return box;
}

// 4. Tableau détaillé
function buildPdfDetailsTable() {
    const container = document.createElement('div');
    container.className = 'avoid-break';
    container.style.marginTop = '25px';
    
    const title = document.createElement('h3');
    title.textContent = '📋 Analyse détaillée par poste';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    container.appendChild(title);
    
    const table = document.createElement('table');
    table.className = 'pdf-table';
    
    table.innerHTML = `
        <thead>
            <tr>
                <th>Poste de dépense</th>
                <th style="text-align: right;">Montant</th>
                <th style="text-align: right;">% du revenu</th>
                <th style="text-align: center;">Évaluation</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    const revenuInput = document.getElementById('simulation-revenu-mensuel');
    const revenu = revenuInput ? parseFloat(revenuInput.value) || 0 : 0;
    
    // Récupération des données de budget
    const postes = [
        {
            label: 'Loyer / Crédit immobilier',
            value: getInputValue('simulation-budget-loyer'),
            type: 'loyer'
        },
        {
            label: 'Alimentation',
            value: getInputValue('simulation-budget-alimentation'),
            type: 'alimentation'
        },
        {
            label: 'Transport',
            value: getInputValue('simulation-budget-transport'),
            type: 'transport'
        },
        {
            label: 'Factures & charges',
            value: getInputValue('simulation-budget-factures'),
            type: 'factures'
        },
        {
            label: 'Loisirs & sorties',
            value: getTotalLoisirsPDF(),
            type: 'loisirs'
        },
        {
            label: 'Dépenses variables',
            value: getTotalVariablesPDF(),
            type: 'variables'
        },
        {
            label: 'Épargne automatique',
            value: getInputValue('simulation-budget-invest'),
            type: 'epargne'
        }
    ];
    
    let totalDepenses = 0;
    
    postes.forEach(poste => {
        const pct = revenu > 0 ? ((poste.value / revenu) * 100).toFixed(1) : '0';
        const evaluation = evaluateExpensePDF(poste.type, poste.value, revenu);
        
        if (poste.type !== 'epargne') {
            totalDepenses += poste.value;
        }
        
        const row = document.createElement('tr');
        const bgColor = poste.type === 'epargne' ? 'background-color: #f0fdf4;' : '';
        
        row.innerHTML = `
            <td style="${bgColor}">${poste.label}</td>
            <td style="text-align: right; font-weight: 600; ${bgColor}">${formatCurrencyPDF(poste.value)}</td>
            <td style="text-align: right; ${bgColor}">${pct}%</td>
            <td style="text-align: center; ${bgColor}">${evaluation}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Ligne de total
    const totalRow = document.createElement('tr');
    totalRow.style.cssText = 'background-color: #f9fafb; font-weight: bold; border-top: 2px solid #059669;';
    const totalPct = revenu > 0 ? ((totalDepenses / revenu) * 100).toFixed(1) : '0';
    
    totalRow.innerHTML = `
        <td><strong>TOTAL DÉPENSES</strong></td>
        <td style="text-align: right;"><strong>${formatCurrencyPDF(totalDepenses)}</strong></td>
        <td style="text-align: right;"><strong>${totalPct}%</strong></td>
        <td style="text-align: center;"><strong>${totalPct > 90 ? '🚨' : totalPct > 80 ? '⚠️' : '✅'}</strong></td>
    `;
    tbody.appendChild(totalRow);
    
    container.appendChild(table);
    return container;
}

// 5. Objectif
function buildPdfObjective() {
    const objectifElement = document.getElementById('temps-objectif');
    
    if (!objectifElement || objectifElement.classList.contains('hidden')) {
        return document.createElement('div');
    }
    
    const container = document.createElement('div');
    container.className = 'objective-pdf avoid-break';
    
    const title = document.createElement('h4');
    title.textContent = '🎯 Votre objectif d\'épargne';
    title.style.cssText = 'color: #1e40af; margin-bottom: 10px; font-size: 14px;';
    container.appendChild(title);
    
    // Récupérer le contenu de l'objectif
    const objectifContent = objectifElement.innerHTML;
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = objectifContent;
    container.appendChild(contentDiv);
    
    return container;
}

// 6. Recommandations
function buildPdfRecommendations() {
    const container = document.createElement('div');
    container.className = 'recommendation-pdf avoid-break';
    
    const title = document.createElement('h3');
    title.textContent = '💡 Conseils personnalisés';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    container.appendChild(title);
    
    // Générer des conseils basés sur les données
    const revenu = getInputValue('simulation-revenu-mensuel');
    const loyer = getInputValue('simulation-budget-loyer');
    const epargne = parseFloat(document.querySelector('#simulation-epargne-totale')?.textContent?.replace(/[^\d.-]/g, '')) || 0;
    
    const conseils = generateRecommendationsPDF(revenu, loyer, epargne);
    
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style-type: disc; margin-left: 20px; line-height: 1.6;';
    
    conseils.forEach(conseil => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${conseil.icon}</strong> ${conseil.text}`;
        li.style.marginBottom = '8px';
        ul.appendChild(li);
    });
    
    container.appendChild(ul);
    
    // Lien vers les simulateurs
    const linkSection = document.createElement('div');
    linkSection.style.cssText = 'margin-top: 15px; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;';
    linkSection.innerHTML = `
        <p style="margin: 0; font-size: 12px; color: #1e40af;">
            <strong>💡 Pour aller plus loin :</strong> Utilisez nos simulateurs d'investissement (PEA, Assurance-vie, PER) 
            et notre calculateur de prêt immobilier sur TradePulse.
        </p>
    `;
    container.appendChild(linkSection);
    
    return container;
}

// 7. Formules (Page 2)
function buildPdfFormulas() {
    const container = document.createElement('div');
    container.className = 'formulas-pdf avoid-break';
    
    const title = document.createElement('h3');
    title.textContent = '📐 Méthodes de calcul et références';
    title.style.cssText = 'color: #059669; margin-bottom: 15px; font-size: 16px;';
    container.appendChild(title);
    
    container.innerHTML += `
        <div style="margin-bottom: 20px;">
            <h4 style="color: #374151; font-size: 14px; margin-bottom: 8px;">Formules utilisées</h4>
            <ul style="list-style-type: disc; margin-left: 20px; line-height: 1.5;">
                <li><strong>Taux d'épargne :</strong> (Revenus - Dépenses totales) ÷ Revenus × 100</li>
                <li><strong>Score budget :</strong> Algorithme TradePulse basé sur les ratios recommandés</li>
                <li><strong>Projection 12 mois :</strong> Épargne mensuelle × 12 (sans intérêts composés)</li>
                <li><strong>Capacité d'investissement :</strong> Épargne - Fonds d'urgence (3-6 mois de charges)</li>
            </ul>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4 style="color: #374151; font-size: 14px; margin-bottom: 8px;">Seuils d'évaluation (normes françaises)</h4>
            <ul style="list-style-type: disc; margin-left: 20px; line-height: 1.5;">
                <li><strong>Loyer/Crédit :</strong> ≤ 25% (optimal), ≤ 33% (recommandé), > 33% (risqué)</li>
                <li><strong>Alimentation :</strong> ≤ 12% (économe), ≤ 18% (standard), > 18% (élevé)</li>
                <li><strong>Transport :</strong> ≤ 15% (raisonnable), > 20% (revoir)</li>
                <li><strong>Loisirs :</strong> ≤ 10% (équilibré), ≤ 15% (modéré), > 15% (excessif)</li>
                <li><strong>Épargne :</strong> ≥ 20% (excellent), ≥ 10% (bon), < 10% (à améliorer)</li>
            </ul>
        </div>
        
        <div>
            <h4 style="color: #374151; font-size: 14px; margin-bottom: 8px;">Paramètres saisis</h4>
            <p style="font-size: 11px; color: #6b7280;">
                Revenu mensuel : ${formatCurrencyPDF(getInputValue('simulation-revenu-mensuel'))}<br>
                Loyer : ${formatCurrencyPDF(getInputValue('simulation-budget-loyer'))}<br>
                Analyse effectuée le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
            </p>
        </div>
    `;
    
    return container;
}

// 8. Footer
function buildPdfFooter() {
    const footer = document.createElement('div');
    footer.className = 'footer-pdf';
    
    footer.innerHTML = `
        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 20px;">
            <p style="margin-bottom: 8px; font-weight: 600;">
                ⚠️ Avertissement important
            </p>
            <p style="margin-bottom: 12px;">
                Cette analyse est fournie à titre informatif uniquement et ne constitue pas un conseil financier personnalisé.
                Les calculs sont basés sur les données que vous avez saisies et sur des moyennes statistiques.
            </p>
            <p style="margin-bottom: 12px;">
                Pour des décisions financières importantes, consultez un conseiller financier professionnel.
            </p>
            <div style="border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 15px;">
                <p style="margin: 0; font-weight: 600;">
                    © TradePulse ${new Date().getFullYear()} - Plateforme d'analyse financière
                </p>
                <p style="margin: 5px 0 0 0;">
                    🌐 Retour vers la plateforme : <strong>${window.location.origin}/simulation.html</strong>
                </p>
            </div>
        </div>
    `;
    
    return footer;
}

// ===== FONCTIONS UTILITAIRES =====

function formatCurrencyPDF(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? parseFloat(element.value) || 0 : 0;
}

function getTotalLoisirsPDF() {
    // Utiliser la fonction existante ou calculer
    if (typeof updateTotalLoisirs === 'function') {
        return updateTotalLoisirs();
    }
    return getInputValue('simulation-budget-loisirs-sorties') + 
           getInputValue('simulation-budget-loisirs-sport') + 
           getInputValue('simulation-budget-loisirs-autres');
}

function getTotalVariablesPDF() {
    // Utiliser la fonction existante ou calculer
    if (typeof updateDetailedExpensesTotal === 'function') {
        return updateDetailedExpensesTotal();
    }
    return getInputValue('simulation-budget-sante') + 
           getInputValue('simulation-budget-vetements') + 
           getInputValue('simulation-budget-autres');
}

function evaluateExpensePDF(type, amount, revenue) {
    if (revenue === 0) return '➖';
    
    const ratio = (amount / revenue) * 100;
    
    switch(type) {
        case 'loyer':
            if (ratio <= 25) return '<span class="eval-excellent">✅ Optimal</span>';
            if (ratio <= 33) return '<span class="eval-bon">⚠️ Correct</span>';
            return '<span class="eval-alerte">🚨 Trop élevé</span>';
        case 'alimentation':
            if (ratio <= 12) return '<span class="eval-excellent">✅ Économe</span>';
            if (ratio <= 18) return '<span class="eval-bon">⚠️ Standard</span>';
            return '<span class="eval-attention">🚨 Élevé</span>';
        case 'transport':
            if (ratio <= 15) return '<span class="eval-excellent">✅ Raisonnable</span>';
            if (ratio <= 20) return '<span class="eval-attention">⚠️ Modéré</span>';
            return '<span class="eval-alerte">🚨 À revoir</span>';
        case 'loisirs':
            if (ratio <= 10) return '<span class="eval-excellent">✅ Équilibré</span>';
            if (ratio <= 15) return '<span class="eval-bon">⚠️ Modéré</span>';
            return '<span class="eval-alerte">🚨 Excessif</span>';
        case 'epargne':
            if (ratio >= 20) return '<span class="eval-excellent">🏆 Excellent</span>';
            if (ratio >= 10) return '<span class="eval-bon">✅ Bon</span>';
            return '<span class="eval-attention">⚠️ À améliorer</span>';
        default:
            return '<span class="eval-bon">📊 Variable</span>';
    }
}

function generateSummaryText(revenu, depenses, epargne, tauxEpargne) {
    if (tauxEpargne >= 20) {
        return "Excellente gestion financière ! Votre capacité d'épargne vous ouvre de nombreuses opportunités d'investissement.";
    } else if (tauxEpargne >= 10) {
        return "Situation financière saine. Quelques optimisations pourraient augmenter votre capacité d'épargne.";
    } else if (tauxEpargne >= 5) {
        return "Marge de manœuvre limitée. Analysez vos postes de dépenses pour dégager plus d'épargne.";
    } else {
        return "Situation tendue. Il est urgent de revoir votre budget pour éviter les difficultés financières.";
    }
}

function generateRecommendationsPDF(revenu, loyer, epargne) {
    const conseils = [];
    const loyerRatio = revenu > 0 ? (loyer / revenu) * 100 : 0;
    const epargneRatio = revenu > 0 ? (epargne / revenu) * 100 : 0;
    
    // Conseils sur le loyer
    if (loyerRatio > 33) {
        conseils.push({
            icon: '🏠',
            text: 'Votre loyer est trop élevé (>33%). Envisagez un déménagement ou une colocation pour réduire ce poste.'
        });
    }
    
    // Conseils sur l'épargne
    if (epargneRatio < 10) {
        conseils.push({
            icon: '💰',
            text: 'Augmentez votre épargne en appliquant la règle 50/30/20 (50% besoins, 30% envies, 20% épargne).'
        });
    } else if (epargneRatio >= 20) {
        conseils.push({
            icon: '📈',
            text: 'Excellent taux d\'épargne ! Pensez à diversifier avec un PEA ou une assurance-vie.'
        });
    }
    
    // Conseils généraux
    conseils.push({
        icon: '📊',
        text: 'Tenez un budget mensuel et suivez vos dépenses pour identifier les postes d\'optimisation.'
    });
    
    if (epargne > 1000) {
        conseils.push({
            icon: '🎯',
            text: 'Constituez d\'abord un fonds d\'urgence (3-6 mois de charges) avant d\'investir.'
        });
    }
    
    return conseils;
}

function generatePDFFilename() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    return `TradePulse-Budget-${dateStr}-${timeStr}.pdf`;
}

// ===== INITIALISATION =====

// Créer et ajouter le bouton d'export
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initialisation export PDF budget');
    
    // Attendre que le DOM soit complètement chargé
    setTimeout(() => {
        // Vérifier les dépendances
        if (typeof html2pdf === 'undefined') {
            console.error('❌ html2pdf non chargé');
            return;
        }
        
        // Créer le bouton s'il n'existe pas
        let exportBtn = document.getElementById('export-budget-pdf');
        
        if (!exportBtn) {
            console.log('📝 Création du bouton export PDF');
            
            // Trouver où insérer le bouton
            const budgetAdvice = document.getElementById('budget-advice');
            const budgetResults = document.querySelector('#budget-planner .mt-8');
            const targetContainer = budgetAdvice || budgetResults;
            
            if (targetContainer) {
                exportBtn = document.createElement('button');
                exportBtn.id = 'export-budget-pdf';
                exportBtn.className = 'w-full mt-4 py-3 px-4 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-green-500/30 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center opacity-50 cursor-not-allowed';
                exportBtn.innerHTML = '<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF';
                exportBtn.disabled = true;
                exportBtn.title = 'Analysez d\'abord votre budget';
                
                targetContainer.appendChild(exportBtn);
                console.log('✅ Bouton export créé');
            } else {
                console.warn('⚠️ Container pour le bouton non trouvé');
            }
        }
        
        // Attacher l'event listener
        if (exportBtn) {
            exportBtn.removeEventListener('click', exportBudgetToPDF); // Éviter les doublons
            exportBtn.addEventListener('click', exportBudgetToPDF);
            console.log('✅ Event listener attaché');
        }
        
        // Vérifier le template
        const template = document.getElementById('budget-pdf-template');
        if (!template) {
            console.error('❌ Template PDF non trouvé dans le DOM');
        } else {
            console.log('✅ Template PDF trouvé');
        }
        
    }, 500);
});

// Fonction pour activer le bouton après analyse
function activateExportButton() {
    const exportBtn = document.getElementById('export-budget-pdf');
    if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        exportBtn.classList.add('hover:bg-green-400');
        exportBtn.title = 'Télécharger l\'analyse en PDF';
        console.log('✅ Bouton export activé');
    }
}

// Hook dans votre fonction d'analyse existante
// À ajouter dans showBudgetAnalysis() ou analyserBudget()
if (typeof window.showBudgetAnalysis === 'function') {
    const originalShowBudgetAnalysis = window.showBudgetAnalysis;
    window.showBudgetAnalysis = function(...args) {
        originalShowBudgetAnalysis.apply(this, args);
        activateExportButton();
    };
}
/**
 * Affiche une notification temporaire
 */
function showBudgetNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `
        fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white
        ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'}
        animate-fade-in
    `;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'} mr-2"></i>
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-suppression après 3 secondes
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Analyse le budget et met à jour les résultats - VERSION CORRIGÉE
 * L'investissement automatique est maintenant traité comme de l'épargne, pas une dépense
 */
function analyserBudget() {
    // Bloqueur : ne calculer que si la section est visible
    if (!window.budgetAnalysisState.isVisible) {
        console.log('⏸️ Analyse bloquée - Section non encore affichée');
        return;
    }
    
    console.log('🔄 Analyse du budget en cours...');
    
    if (!champsOK()) return; // empêche un calcul bancal
    
    // Récupérer les valeurs du budget
    const loyer = toNumber(document.getElementById('simulation-budget-loyer').value);
    let quotidien, extra;
    
    // Vérifier le mode d'affichage actif
    const isDetailed = document.getElementById('detailed-view').style.display !== 'none';
    
    if (isDetailed) {
        // En mode détaillé, utiliser le nouveau système montant × quantité
        quotidien = updateCategoryTotal('vie-courante');
        extra = updateCategoryTotal('loisirs');
    } else {
        // En mode simplifié, utiliser les valeurs directes
        quotidien = toNumber(document.getElementById('simulation-budget-quotidien').value);
        extra     = toNumber(document.getElementById('simulation-budget-extra').value);
    }
    
    const investAuto = toNumber(document.getElementById('simulation-budget-invest').value);
    
    // Récupérer le total des dépenses détaillées
    const totalDepensesVariables = updateDetailedExpensesTotal();
    
    // Récupérer le revenu mensuel saisi par l'utilisateur
    const revenuMensuel = toNumber(document.getElementById('revenu-mensuel-input').value);
    
    // ===== NOUVELLE LOGIQUE CORRIGÉE =====
    // 1. Dépenses "de consommation" (on retire l'épargne auto)
    const depensesConsommation = loyer + quotidien + extra + totalDepensesVariables;
    
    // 2. Épargne automatique (investissement programmé)
    const epargneAuto = investAuto;
    
    // 3. Épargne libre restante **après** l'épargne auto
    const epargneBrute = revenuMensuel - depensesConsommation - investAuto;
    const epargneLibre = Math.max(0, epargneBrute);
    const deficit = Math.min(0, epargneBrute);
    const epargneTotale = investAuto + epargneLibre;
    
    // 4. Totaux à afficher
    const depensesTotales = depensesConsommation;          // ↩️ on n'y met plus l'auto-invest
    const epargnePossible = epargneLibre;                  // ↩️ affichage "Épargne possible"
    const tauxEpargne = revenuMensuel > 0
          ? ((epargneAuto + epargneLibre) / revenuMensuel) * 100
          : 0;
    // ===== FIN NOUVELLE LOGIQUE =====
    
    // Formater les valeurs monétaires
    const formatter = new Intl.NumberFormat('fr-FR', { 
        style: 'currency', 
        currency: 'EUR',
        maximumFractionDigits: 2
    });
    
    // Mettre à jour l'affichage du budget
    document.getElementById('simulation-revenu-mensuel').textContent = formatter.format(revenuMensuel);
    document.getElementById('simulation-depenses-totales').textContent = formatter.format(depensesTotales);
    document.getElementById('simulation-epargne-possible').textContent = formatter.format(epargnePossible);
    document.getElementById('simulation-taux-epargne').textContent = tauxEpargne.toFixed(1) + '%';
    // ===== NOUVELLES TUILES ÉPARGNE =====
    document.getElementById('simulation-epargne-auto').textContent = formatter.format(epargneAuto);
    document.getElementById('simulation-epargne-totale').textContent = formatter.format(epargneTotale);
    
    // ===== APPELS CORRIGÉS =====
    // Mettre à jour le graphique
    updateBudgetChart(loyer, quotidien, extra, epargneAuto, totalDepensesVariables, epargneLibre);
    
    // Mettre à jour le graphique d'évolution (épargne totale)
    updateEvolutionChart(epargneAuto + epargneLibre);
    
    // Mise à jour des conseils budgétaires
    updateBudgetAdvice(loyer, quotidien, extra, epargneAuto, totalDepensesVariables, revenuMensuel, tauxEpargne);
    
    // Mise à jour du temps pour atteindre l'objectif d'épargne (épargne totale)
    updateObjectiveTime(epargneAuto + epargneLibre);
    
    // Mettre à jour le score budget
    updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales);
    
    // Mettre à jour les recommandations
    updateRecommendations(epargneLibre, tauxEpargne, epargneAuto);
}
/**
 * Met à jour le temps nécessaire pour atteindre l'objectif d'épargne
 * @param {number} epargneMensuelle - Montant d'épargne mensuelle possible
 */
function updateObjectiveTime(epargneMensuelle) {
    const objectifMontant = parseFloat(document.getElementById('objectif-epargne').value) || 0;
    const objectifType = document.getElementById('objectif-type').value;
    const tempsObjectifElement = document.getElementById('temps-objectif');
    
    if (!tempsObjectifElement || objectifMontant <= 0 || epargneMensuelle <= 0) {
        if (tempsObjectifElement) tempsObjectifElement.classList.add('hidden');
        return;
    }
    
    // Calculer le nombre de mois nécessaires
    const moisNecessaires = Math.ceil(objectifMontant / epargneMensuelle);
    
    // Formatage en années et mois si nécessaire
    let tempsFormate = '';
    if (moisNecessaires > 12) {
        const annees = Math.floor(moisNecessaires / 12);
        const moisRestants = moisNecessaires % 12;
        tempsFormate = `${annees} an${annees > 1 ? 's' : ''} et ${moisRestants} mois`;
    } else {
        tempsFormate = `${moisNecessaires} mois`;
    }
    
    // Icône selon le type d'objectif
    let icone = '';
    switch (objectifType) {
        case 'vacances': icone = 'fas fa-umbrella-beach'; break;
        case 'achat': icone = 'fas fa-shopping-cart'; break;
        case 'urgence': icone = 'fas fa-shield-alt'; break;
        case 'apport': icone = 'fas fa-home'; break;
        default: icone = 'fas fa-bullseye';
    }
    
    // Mettre à jour l'affichage
    tempsObjectifElement.innerHTML = `
        <div class="flex items-center">
            <i class="${icone} text-blue-400 mr-2"></i>
            <span>À ce rythme, vous atteindrez votre objectif de 
            <strong class="text-blue-400">${objectifMontant.toLocaleString('fr-FR')} €</strong> 
            en <strong class="text-blue-400">${tempsFormate}</strong></span>
        </div>
    `;
    
    tempsObjectifElement.classList.remove('hidden');
}

/**
 * Met à jour le score budget global
 * @param {number} tauxEpargne - Taux d'épargne en pourcentage
 * @param {number} loyer - Montant du loyer/crédit
 * @param {number} revenuMensuel - Revenu mensuel
 * @param {number} depensesTotales - Total des dépenses
 */
function updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales) {
    let score = 3; // Score de base moyen
    let description = 'Budget équilibré';
    const scoreElement = document.getElementById('budget-score');
    const descriptionElement = document.getElementById('budget-score-description');
    const barreElement = document.getElementById('budget-score-bar');
    const cercleElement = document.querySelector('.budget-score-circle');
    
    if (!scoreElement || !descriptionElement || !barreElement || !cercleElement) return;
    
    // Évaluer le taux d'épargne
    if (tauxEpargne < 5) {
        score--;
        description = 'Budget très tendu';
    } else if (tauxEpargne >= 20) {
        score++;
        description = 'Budget optimisé';
    }
    
    // Évaluer le ratio logement
    const ratioLogement = revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0;
    if (ratioLogement > 33) {
        score--;
    } else if (ratioLogement <= 25) {
        score++;
    }
    
    // Vérifier si les dépenses dépassent les revenus
    if (depensesTotales > revenuMensuel) {
        score = 1;
        description = 'Budget déficitaire';
    } else if (tauxEpargne >= 30) {
        score = 5;
        description = 'Budget excellent';
    }
    
    // Limiter le score entre 1 et 5
    score = Math.max(1, Math.min(5, score));
    
    // Mettre à jour l'affichage
    scoreElement.textContent = score;
    descriptionElement.textContent = description;
    
    // Mettre à jour la barre de progression (score sur 5 -> pourcentage)
    const pourcentage = (score / 5) * 100;
    barreElement.style.width = `${pourcentage}%`;
    
    // Mettre à jour la couleur selon le score
    cercleElement.classList.remove('bg-red-900', 'bg-orange-900', 'bg-blue-900', 'bg-green-900');
    barreElement.classList.remove('bg-red-400', 'bg-orange-400', 'bg-blue-400', 'bg-green-400');
    scoreElement.classList.remove('text-red-400', 'text-orange-400', 'text-blue-400', 'text-green-400');
    
    if (score <= 2) {
        cercleElement.classList.add('bg-red-900');
        barreElement.classList.add('bg-red-400');
        scoreElement.classList.add('text-red-400');
    } else if (score === 3) {
        cercleElement.classList.add('bg-blue-900');
        barreElement.classList.add('bg-blue-400');
        scoreElement.classList.add('text-blue-400');
    } else {
        cercleElement.classList.add('bg-green-900');
        barreElement.classList.add('bg-green-400');
        scoreElement.classList.add('text-green-400');
    }
}

/**
 * Met à jour les recommandations personnalisées
 * @param {number} epargnePossible - Montant d'épargne mensuelle possible
 * @param {number} tauxEpargne - Taux d'épargne en pourcentage
 * @param {number} investAuto - Montant déjà investi automatiquement
 */
function updateRecommendations(epargnePossible, tauxEpargne, investAuto) {
    const recommendationsElement = document.getElementById('budget-recommendations');
    if (!recommendationsElement) return;
    
    const recommendations = [];
    
    // Recommandation basée sur l'épargne
    if (epargnePossible > 0) {
        let vehiculeRecommande = '';
        let montantRecommande = 0;
        
        if (tauxEpargne < 10) {
            // Priorité à l'épargne de précaution
            vehiculeRecommande = 'Livret A';
            montantRecommande = Math.round(epargnePossible * 0.7);
            recommendations.push(`<p class="mb-2">Priorité à la sécurité: placez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> sur un ${vehiculeRecommande} jusqu'à constituer un fonds d'urgence de 3 mois de dépenses.</p>`);
        } else if (tauxEpargne >= 10 && tauxEpargne < 20) {
            // Mix entre sécurité et rendement
            vehiculeRecommande = 'PEA (ETF diversifiés)';
            montantRecommande = Math.round(epargnePossible * 0.6);
            recommendations.push(`<p class="mb-2">Équilibrez sécurité et rendement: investissez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> sur un ${vehiculeRecommande} pour profiter de la croissance à long terme.</p>`);
        } else {
            // Optimisation fiscale et rendement
            vehiculeRecommande = 'PEA + Assurance-vie';
            montantRecommande = Math.round(epargnePossible * 0.8);
            recommendations.push(`<p class="mb-2">Optimisez votre patrimoine: répartissez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> entre ${vehiculeRecommande} pour maximiser rendement et avantages fiscaux.</p>`);
        }
    } else {
        recommendations.push(`<p class="mb-2">Votre budget est actuellement déficitaire. Concentrez-vous sur la réduction de vos dépenses non essentielles.</p>`);
    }
    
    // Recommandation sur l'investissement automatique
    if (investAuto === 0 && epargnePossible > 100) {
        recommendations.push(`<p class="mb-2"><i class="fas fa-robot text-green-400 mr-1"></i> Mettez en place un <strong>versement automatique</strong> mensuel pour simplifier votre stratégie d'épargne.</p>`);
    } else if (investAuto > 0) {
        recommendations.push(`<p class="mb-2"><i class="fas fa-check text-green-400 mr-1"></i> Excellent! Votre investissement automatique de ${investAuto.toLocaleString('fr-FR')} €/mois vous permet de construire votre patrimoine régulièrement.</p>`);
    }
    
    // Recommandation sur la simulation d'investissement
    recommendations.push(`<p class="mb-2"><i class="fas fa-arrow-right text-green-400 mr-1"></i> <a href="#investment-simulator" class="text-green-400 hover:underline">Simulez l'évolution de vos investissements</a> sur le long terme dans l'onglet "Simulateur d'investissement".</p>`);
    
    // Mise à jour de l'élément
    recommendationsElement.innerHTML = recommendations.join('');
}

/**
 * Met à jour le graphique du budget
 */
function updateBudgetChart(loyer, quotidien, extra, investAuto, depensesVariables, epargne) {
    if (!window.budgetChart) return;
    
const d = window.budgetChart.data.datasets[0].data;
d[0] = loyer;
d[1] = quotidien; 
d[2] = extra;
d[3] = investAuto;          // ← Fini les "sauts" !
d[4] = depensesVariables;
d[5] = epargne;
window.budgetChart.update();
    }
/**
 * Met à jour le graphique d'évolution sur 12 mois
 * @param {number} epargneMensuelle - Montant d'épargne mensuelle
 */
function updateEvolutionChart(epargneMensuelle) {
    if (!window.evolutionChart) return;
    
    const dataPoints = Array.from({ length: 12 }, (_, i) => (i + 1) * epargneMensuelle);
    window.evolutionChart.data.datasets[0].data = dataPoints;
    window.evolutionChart.update();
}

/**
 * Moteur de règles dynamiques pour les conseils
 */
const BUDGET_RULES = [
    {
        id: 'epargne_critique',
        condition: (data) => data.tauxEpargne < 5,
        message: '🚨 Priorité absolue : constituez un fonds d\'urgence de 1000€ minimum',
        severity: 'danger',
        action: 'Réduisez vos dépenses non essentielles'
    },
    {
        id: 'logement_cher',
        condition: (data) => data.ratioLogement > 33,
        message: '🏠 Votre logement dépasse 33% de vos revenus',
        severity: 'warning',
        action: 'Envisagez un déménagement ou une colocation'
    },
    {
        id: 'epargne_excellente',
        condition: (data) => data.tauxEpargne > 20,
        message: '🎉 Excellent taux d\'épargne ! Optimisez maintenant',
        severity: 'success',
        action: 'Diversifiez vers PEA et Assurance-vie'
    },
    {
        id: 'loisirs_excessifs',
        condition: (data) => data.ratioLoisirs > 15,
        message: '🎭 Vos loisirs dépassent 15% de vos revenus',
        severity: 'info',
        action: 'Établissez un budget loisirs strict'
    },
    {
        id: 'auto_invest_manquant',
        condition: (data) => data.investAuto === 0 && data.epargnePossible > 100,
        message: '🤖 Automatisez votre épargne pour garantir vos objectifs',
        severity: 'info',
        action: 'Mettez en place un virement automatique'
    }
];

/**
 * Génère des conseils dynamiques basés sur les règles
 */
function getDynamicTips(budgetData) {
    return BUDGET_RULES
        .filter(rule => rule.condition(budgetData))
        .map(rule => ({
            message: rule.message,
            action: rule.action,
            severity: rule.severity,
            id: rule.id
        }));
}

/**
 * Met à jour les conseils budgétaires en fonction des données
 */
function updateBudgetAdvice(loyer, quotidien, extra, investAuto, depensesVariables, revenuMensuel, tauxEpargne) {
    const adviceElement = document.getElementById('budget-advice');
    const adviceList = document.querySelector('#budget-advice .advice-list');
    const adviceScore = document.querySelector('#budget-advice .advice-score');
    
    if (!adviceElement || !adviceList || !adviceScore) return;
    
    // Préparer les données pour le moteur de règles
    const budgetData = {
        tauxEpargne,
        ratioLogement: revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0,
        ratioLoisirs: revenuMensuel > 0 ? (extra / revenuMensuel) * 100 : 0,
        investAuto,
        epargnePossible: Math.max(0, revenuMensuel - (loyer + quotidien + extra + investAuto + depensesVariables))
    };
    
    // Générer les conseils dynamiques
    const dynamicTips = getDynamicTips(budgetData);
    
    // Calculer le score (gardez votre logique existante)
    let score = 3;
    if (tauxEpargne < 5) score--;
    if (budgetData.ratioLogement > 33) score--;
    if (tauxEpargne >= 20) score++;
    if (budgetData.ratioLogement <= 25) score++;
    score = Math.max(1, Math.min(5, score));
    
    // Mettre à jour l'affichage
    adviceScore.textContent = `Évaluation: ${score}/5`;
    
    // Afficher les conseils dynamiques avec style
    const conseilsHTML = dynamicTips.map(tip => {
        const colorClass = {
            danger: 'text-red-400',
            warning: 'text-orange-400',
            success: 'text-green-400',
            info: 'text-blue-400'
        }[tip.severity] || 'text-gray-300';
        
        return `
            <li class="mb-2">
                <span class="${colorClass} font-medium">${tip.message}</span>
                <br><span class="text-gray-400 text-xs ml-4">💡 ${tip.action}</span>
            </li>
        `;
    }).join('');
    
    adviceList.innerHTML = conseilsHTML || '<li>Votre budget semble équilibré.</li>';
    
    // Ajuster la couleur du score selon l'évaluation
    adviceScore.className = 'advice-score inline-block px-2 py-1 rounded text-sm font-medium mb-2';
    if (score >= 4) {
        adviceScore.classList.add('bg-green-900', 'bg-opacity-20', 'text-green-400');
    } else if (score <= 2) {
        adviceScore.classList.add('bg-red-900', 'bg-opacity-20', 'text-red-400');
    } else {
        adviceScore.classList.add('bg-blue-900', 'bg-opacity-20', 'text-blue-400');
    }
    }
/**
 * Fonction de nettoyage pour réinitialiser si nécessaire
 */
function resetBudgetPlanner() {
    window.__budgetPlannerInitialized__ = false;
    const container = document.getElementById('budget-planner');
    if (container) {
        container.innerHTML = '';
    }
    console.log('Budget Planner réinitialisé');
}
