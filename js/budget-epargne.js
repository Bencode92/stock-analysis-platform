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
import { exportBudgetToPDF, activateExportButton, createExportButton } from './budget-pdf.js';
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
            },
            {
                id: 'mutuelle',
                name: 'Mutuelle / Santé',
                defaultAmount: 50,
                defaultQuantity: 1,
                unit: 'fois/mois',
                description: 'Complémentaire santé et frais médicaux'
            },
            {
                id: 'assurances',
                name: 'Assurances (habitation, auto...)',
                defaultAmount: 60,
                defaultQuantity: 1,
                unit: 'fois/mois',
                description: 'Assurance habitation, auto, responsabilité civile'
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
        const investAuto = toNumber(document.getElementById('simulation-budget-invest')?.value);
        const loisirs = updateCategoryTotal ? updateCategoryTotal('loisirs') : 0;

        const ratioLogement = revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0;
        const ratioLoisirs = revenuMensuel > 0 ? (loisirs / revenuMensuel) * 100 : 0;

        // Calculer les points — 5 critères
        let scoreBreakdown = [
            { label: 'Score de base', points: 3, reason: 'Point de départ standard' }
        ];

        // 1. Taux d'épargne
        if (tauxEpargne < 5) {
            scoreBreakdown.push({ label: 'Taux d\'épargne faible', points: -1, reason: `${tauxEpargne.toFixed(1)}% < 5%` });
        } else if (tauxEpargne >= 20) {
            scoreBreakdown.push({ label: 'Excellent taux d\'épargne', points: 1, reason: `${tauxEpargne.toFixed(1)}% ≥ 20%` });
        }

        // 2. Ratio logement
        if (ratioLogement > 33) {
            scoreBreakdown.push({ label: 'Logement trop cher', points: -1, reason: `${ratioLogement.toFixed(1)}% > 33%` });
        } else if (ratioLogement <= 25) {
            scoreBreakdown.push({ label: 'Logement bien maîtrisé', points: 1, reason: `${ratioLogement.toFixed(1)}% ≤ 25%` });
        }

        // 3. Ratio loisirs
        if (ratioLoisirs <= 15) {
            scoreBreakdown.push({ label: 'Loisirs maîtrisés', points: 1, reason: `${ratioLoisirs.toFixed(1)}% ≤ 15%` });
        } else if (ratioLoisirs > 30) {
            scoreBreakdown.push({ label: 'Loisirs excessifs', points: -1, reason: `${ratioLoisirs.toFixed(1)}% > 30%` });
        }

        // 4. Épargne automatique
        if (investAuto > 0) {
            scoreBreakdown.push({ label: 'Épargne automatique active', points: 1, reason: `${investAuto.toLocaleString('fr-FR')} €/mois programmé` });
        }

        // 5. Règle 50/30/20 (calculée ici aussi)
        const vieCourante = updateCategoryTotal ? updateCategoryTotal('vie-courante') : 0;
        const pctBesoins = revenuMensuel > 0 ? ((loyer + vieCourante) / revenuMensuel) * 100 : 0;
        const pctEpargne = tauxEpargne;
        const ecart = (Math.abs(pctBesoins - 50) + Math.abs(ratioLoisirs + (revenuMensuel > 0 ? (updateDetailedExpensesTotal() / revenuMensuel * 100) : 0) - 30) + Math.abs(pctEpargne - 20)) / 3;
        if (ecart < 5) {
            scoreBreakdown.push({ label: 'Proche de la règle 50/30/20', points: 1, reason: `Écart moyen ${ecart.toFixed(0)} pts` });
        } else if (ecart > 15) {
            scoreBreakdown.push({ label: 'Loin de la règle 50/30/20', points: -1, reason: `Écart moyen ${ecart.toFixed(0)} pts` });
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
            <div class="grid grid-cols-3 gap-3">
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
                <div>
                    <input type="number" id="objectif-taux" placeholder="1.5" value="1.5" min="0" max="15" step="0.1" class="bg-blue-900 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full text-sm">
                    <p class="text-xs text-gray-400 mt-1">Taux placement (%/an)</p>
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

    <!-- Jauge 50/30/20 (remplie dynamiquement) -->
    <div id="budget-503020" class="mb-6 p-4 bg-blue-800 bg-opacity-30 rounded-lg hidden"></div>

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
        'objectif-type',              // Type d'objectif
        'objectif-taux'               // Taux de placement
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
    
    // Mettre à jour le score budget (enrichi 5 critères + 50/30/20)
    updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales, extra, epargneAuto, quotidien, totalDepensesVariables, epargneTotale);

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
    const tauxAnnuel = parseFloat(document.getElementById('objectif-taux')?.value) || 0;
    const tempsObjectifElement = document.getElementById('temps-objectif');

    if (!tempsObjectifElement || objectifMontant <= 0 || epargneMensuelle <= 0) {
        if (tempsObjectifElement) tempsObjectifElement.classList.add('hidden');
        return;
    }

    // Calculer le nombre de mois nécessaires AVEC intérêts composés
    let moisNecessaires;
    const moisSansInteret = Math.ceil(objectifMontant / epargneMensuelle);

    if (tauxAnnuel > 0) {
        // Formule FV annuité : FV = PMT × ((1+r)^n - 1) / r
        // On résout pour n : n = ln(1 + objectif × r / PMT) / ln(1 + r)
        const rMensuel = Math.pow(1 + tauxAnnuel / 100, 1/12) - 1;
        moisNecessaires = Math.ceil(Math.log(1 + objectifMontant * rMensuel / epargneMensuelle) / Math.log(1 + rMensuel));
    } else {
        moisNecessaires = moisSansInteret;
    }

    const moisGagnes = moisSansInteret - moisNecessaires;
    
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
    
    // Info gain de temps grâce aux intérêts
    const gainInfo = (tauxAnnuel > 0 && moisGagnes > 0)
        ? `<div class="text-xs text-green-400 mt-1"><i class="fas fa-chart-line mr-1"></i>Grâce au placement à ${tauxAnnuel}%/an, vous gagnez <strong>${moisGagnes} mois</strong> vs épargne sans intérêts</div>`
        : '';

    // Mettre à jour l'affichage
    tempsObjectifElement.innerHTML = `
        <div class="flex items-center">
            <i class="${icone} text-blue-400 mr-2"></i>
            <span>À ce rythme, vous atteindrez votre objectif de
            <strong class="text-blue-400">${objectifMontant.toLocaleString('fr-FR')} €</strong>
            en <strong class="text-blue-400">${tempsFormate}</strong></span>
        </div>
        ${gainInfo}
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
function updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales, loisirs, epargneAuto, vieCourante, depensesVariables, epargneTotale) {
    let score = 3; // Score de base
    const scoreElement = document.getElementById('budget-score');
    const descriptionElement = document.getElementById('budget-score-description');
    const barreElement = document.getElementById('budget-score-bar');
    const cercleElement = document.querySelector('.budget-score-circle');

    if (!scoreElement || !descriptionElement || !barreElement || !cercleElement) return;

    // === RÈGLE 50/30/20 ===
    const besoins = loyer + vieCourante; // Charges fixes + vie courante
    const envies = loisirs + depensesVariables; // Loisirs + variables
    const epargne = epargneTotale; // Auto + libre

    const pctBesoins = revenuMensuel > 0 ? (besoins / revenuMensuel) * 100 : 0;
    const pctEnvies = revenuMensuel > 0 ? (envies / revenuMensuel) * 100 : 0;
    const pctEpargne = revenuMensuel > 0 ? (epargne / revenuMensuel) * 100 : 0;

    // Écart moyen vs la norme 50/30/20 (directionnel : pénalise seulement les mauvais écarts)
    const ecartBesoins = Math.max(0, pctBesoins - 50);  // mal si au dessus de 50%
    const ecartEnvies = Math.max(0, pctEnvies - 30);    // mal si au dessus de 30%
    const ecartEpargne = Math.max(0, 20 - pctEpargne);  // mal si en dessous de 20%
    const ecart503020 = (ecartBesoins + ecartEnvies + ecartEpargne) / 3;

    // === SCORE 5 CRITÈRES ===
    const ratioLogement = revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0;
    const ratioLoisirs = revenuMensuel > 0 ? (loisirs / revenuMensuel) * 100 : 0;

    // 1. Taux d'épargne
    if (tauxEpargne < 5) score--;
    else if (tauxEpargne >= 20) score++;

    // 2. Ratio logement
    if (ratioLogement > 33) score--;
    else if (ratioLogement <= 25) score++;

    // 3. Ratio loisirs
    if (ratioLoisirs <= 15) score++;
    else if (ratioLoisirs > 30) score--;

    // 4. Épargne automatique active
    if (epargneAuto > 0) score++;

    // 5. Respect de la règle 50/30/20
    if (ecart503020 < 5) score++;
    else if (ecart503020 > 15) score--;

    // Override si déficitaire ou excellent
    if (depensesTotales > revenuMensuel) {
        score = 1;
    }

    score = Math.max(1, Math.min(5, score));

    // Description
    const descriptions = {
        1: 'Budget déficitaire',
        2: 'Budget tendu',
        3: 'Budget équilibré',
        4: 'Budget optimisé',
        5: 'Budget excellent'
    };

    // Mettre à jour l'affichage du score
    scoreElement.textContent = score;
    descriptionElement.textContent = descriptions[score];

    // Barre de progression
    barreElement.style.width = `${(score / 5) * 100}%`;

    // Couleurs
    cercleElement.classList.remove('bg-red-900', 'bg-orange-900', 'bg-blue-900', 'bg-green-900');
    barreElement.classList.remove('bg-red-400', 'bg-orange-400', 'bg-blue-400', 'bg-green-400');
    scoreElement.classList.remove('text-red-400', 'text-orange-400', 'text-blue-400', 'text-green-400');

    if (score <= 2) {
        cercleElement.classList.add('bg-red-900'); barreElement.classList.add('bg-red-400'); scoreElement.classList.add('text-red-400');
    } else if (score === 3) {
        cercleElement.classList.add('bg-blue-900'); barreElement.classList.add('bg-blue-400'); scoreElement.classList.add('text-blue-400');
    } else {
        cercleElement.classList.add('bg-green-900'); barreElement.classList.add('bg-green-400'); scoreElement.classList.add('text-green-400');
    }

    // === JAUGE 50/30/20 ===
    const jaugeContainer = document.getElementById('budget-503020');
    if (!jaugeContainer) return;

    // lowerIsBetter: true pour Besoins/Envies (dépenser moins = bien), false pour Épargne (épargner plus = bien)
    const barHTML = (label, pct, norm, color, emoji, lowerIsBetter) => {
        const clamped = Math.min(pct, 100);
        const diff = pct - norm;
        const diffLabel = diff > 0 ? `+${diff.toFixed(0)}` : diff.toFixed(0);

        // Logique directionnelle :
        // Besoins/Envies : en dessous = bien, au dessus = mal
        // Épargne : au dessus = bien, en dessous = mal
        let isGood, isOk;
        if (lowerIsBetter) {
            isGood = diff <= 0;           // en dessous ou égal = bien
            isOk = diff > 0 && diff <= 5; // légèrement au dessus = ok
        } else {
            isGood = diff >= 0;           // au dessus ou égal = bien
            isOk = diff < 0 && diff >= -5; // légèrement en dessous = ok
        }

        const diffColor = isGood ? 'text-green-400' : isOk ? 'text-yellow-400' : 'text-red-400';
        const statusIcon = isGood ? '✅' : isOk ? '⚠️' : '❌';

        return `
            <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-medium text-gray-200">${emoji} ${label}</span>
                    <div class="text-right">
                        <span class="text-lg font-bold text-white">${pct.toFixed(0)}%</span>
                        <span class="text-sm ${diffColor} ml-2">${statusIcon} ${diffLabel} vs ${norm}%</span>
                    </div>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-3 relative">
                    <div class="${color} rounded-full h-3 transition-all" style="width: ${clamped}%"></div>
                    <div class="absolute top-0 h-3 border-r-2 border-white border-opacity-60" style="left: ${norm}%"></div>
                </div>
            </div>`;
    };

    const ecartColor = ecart503020 < 5 ? 'text-green-400 bg-green-900' : ecart503020 < 10 ? 'text-yellow-400 bg-yellow-900' : 'text-red-400 bg-red-900';

    jaugeContainer.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h6 class="text-sm font-semibold text-white flex items-center">
                <i class="fas fa-chart-pie text-blue-400 mr-2"></i> Règle 50 / 30 / 20
            </h6>
            <span class="text-xs font-semibold px-2 py-1 rounded ${ecartColor} bg-opacity-30">
                Écart moyen : ${ecart503020.toFixed(0)} pts
            </span>
        </div>
        ${barHTML('Besoins', pctBesoins, 50, 'bg-blue-500', '🏠', true)}
        ${barHTML('Envies', pctEnvies, 30, 'bg-yellow-500', '🎉', true)}
        ${barHTML('Épargne', pctEpargne, 20, 'bg-green-500', '💰', false)}
        <p class="text-xs text-gray-500 mt-2">Besoins = loyer + vie courante · Envies = loisirs + variables · Épargne = auto + libre</p>
    `;
    jaugeContainer.classList.remove('hidden');
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

    // Taux de placement pour la projection (lié à l'objectif)
    const tauxAnnuel = parseFloat(document.getElementById('objectif-taux')?.value) || 0;
    const rMensuel = tauxAnnuel > 0 ? Math.pow(1 + tauxAnnuel / 100, 1/12) - 1 : 0;

    // Projection exponentielle : FV = PMT × ((1+r)^n - 1) / r
    const dataPoints = Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        if (rMensuel > 0) {
            return Math.round(epargneMensuelle * ((Math.pow(1 + rMensuel, n) - 1) / rMensuel));
        }
        return n * epargneMensuelle; // fallback linéaire si taux = 0
    });

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
