/**
 * immo-ui-fixes.js - Corrections d'interface pour le simulateur immobilier
 * Corrige les problèmes d'affichage et améliore l'expérience utilisateur
 */

class ImmoUIFixes {
    constructor() {
        this.init();
    }
    
    init() {
        console.log('🎨 Initialisation des corrections d\'interface...');
        
        // Attendre que le DOM soit chargé
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.applyFixes());
        } else {
            this.applyFixes();
        }
    }
    
    applyFixes() {
        this.fixCalculationModeSelection();
        this.improveFormSpacing();
        this.enhanceVilleSelection();
        this.addAnimations();
        this.optimizePerformance();
        
        console.log('✅ Corrections d\'interface appliquées');
    }
    
    /**
     * Corrige la sélection du mode de calcul
     */
    fixCalculationModeSelection() {
        const calculationOptions = document.querySelectorAll('.calculation-option');
        const radioInputs = document.querySelectorAll('input[name="calculation-mode"]');
        
        if (calculationOptions.length === 0) {
            console.log('ℹ️ Aucune option de calcul trouvée, application des corrections de base...');
            this.applyBasicModeCalculationFixes();
            return;
        }
        
        // Gestion du clic sur les options
        calculationOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                // Retirer la sélection de toutes les options
                calculationOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Ajouter la sélection à l'option cliquée
                option.classList.add('selected');
                
                // Cocher le radio correspondant
                const radio = option.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    
                    // Déclencher l'événement change pour la compatibilité
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                // Animation de feedback
                option.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    option.style.transform = '';
                }, 150);
            });
        });
        
        // Gestion du changement de radio directement
        radioInputs.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    calculationOptions.forEach(opt => opt.classList.remove('selected'));
                    const parentOption = e.target.closest('.calculation-option');
                    if (parentOption) {
                        parentOption.classList.add('selected');
                    }
                }
            });
        });
    }
    
    /**
     * Applique des corrections de base pour le mode de calcul si les nouveaux styles ne sont pas présents
     */
    applyBasicModeCalculationFixes() {
        // Rechercher les éléments du mode de calcul existant
        const modeRadios = document.querySelectorAll('input[name="calculation-mode"]');
        
        if (modeRadios.length > 0) {
            modeRadios.forEach(radio => {
                const parent = radio.closest('label') || radio.parentElement;
                if (parent) {
                    // Améliorer l'espacement et l'affichage
                    parent.style.display = 'block';
                    parent.style.marginBottom = '1rem';
                    parent.style.padding = '1rem';
                    parent.style.borderRadius = '0.5rem';
                    parent.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                    parent.style.backgroundColor = 'rgba(1, 42, 74, 0.3)';
                    parent.style.cursor = 'pointer';
                    parent.style.transition = 'all 0.3s ease';
                    
                    // Événements hover
                    parent.addEventListener('mouseenter', () => {
                        parent.style.borderColor = 'rgba(0, 255, 135, 0.3)';
                        parent.style.backgroundColor = 'rgba(0, 255, 135, 0.05)';
                    });
                    
                    parent.addEventListener('mouseleave', () => {
                        if (!radio.checked) {
                            parent.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            parent.style.backgroundColor = 'rgba(1, 42, 74, 0.3)';
                        }
                    });
                    
                    // État sélectionné
                    radio.addEventListener('change', () => {
                        // Réinitialiser tous les parents
                        modeRadios.forEach(r => {
                            const p = r.closest('label') || r.parentElement;
                            if (p && !r.checked) {
                                p.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                p.style.backgroundColor = 'rgba(1, 42, 74, 0.3)';
                            }
                        });
                        
                        // Appliquer le style sélectionné
                        if (radio.checked) {
                            parent.style.borderColor = 'var(--primary-color)';
                            parent.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
                        }
                    });
                }
            });
        }
    }
    
    /**
     * Améliore l'espacement des formulaires
     */
    improveFormSpacing() {
        // Ajouter des classes d'amélioration
        const formGroups = document.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.classList.add('improved-spacing');
            // Assurer un espacement minimum
            if (!group.style.marginBottom || parseInt(group.style.marginBottom) < 24) {
                group.style.marginBottom = '2rem';
            }
        });
        
        // Améliorer l'affichage des tooltips
        const tooltips = document.querySelectorAll('.info-tooltip, [title]');
        tooltips.forEach(tooltip => {
            tooltip.addEventListener('mouseenter', (e) => this.showTooltip(e));
            tooltip.addEventListener('mouseleave', (e) => this.hideTooltip(e));
        });
        
        // Améliorer l'espacement des cartes
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            if (!card.style.marginBottom || parseInt(card.style.marginBottom) < 32) {
                card.style.marginBottom = '2rem';
            }
        });
    }
    
    /**
     * Améliore la sélection de ville
     */
    enhanceVilleSelection() {
        const villeSearch = document.getElementById('ville-search');
        const pieceButtons = document.querySelectorAll('.piece-btn');
        
        // Améliorer l'affichage de la recherche de ville
        if (villeSearch) {
            const container = villeSearch.closest('.search-container');
            
            villeSearch.addEventListener('focus', () => {
                if (container) {
                    container.classList.add('focused');
                }
            });
            
            villeSearch.addEventListener('blur', () => {
                if (container) {
                    container.classList.remove('focused');
                }
            });
            
            // Améliorer l'accessibilité
            villeSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    villeSearch.blur();
                    const suggestions = document.getElementById('ville-suggestions');
                    if (suggestions) {
                        suggestions.style.display = 'none';
                    }
                }
            });
        }
        
        // Améliorer la sélection des types de logement
        pieceButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Animation de sélection
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 150);
            });
            
            // Améliorer l'accessibilité
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    btn.click();
                }
            });
        });
    }
    
    /**
     * Ajoute des animations
     */
    addAnimations() {
        // Animation d'apparition pour les éléments
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    // Observer une seule fois
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        // Observer les cartes et sections importantes
        const elementsToAnimate = document.querySelectorAll('.card, .ville-info-selected, .results-card');
        elementsToAnimate.forEach(el => {
            if (el.getBoundingClientRect().top > window.innerHeight) {
                observer.observe(el);
            } else {
                // Déjà visible, animer immédiatement
                el.classList.add('fade-in-up');
            }
        });
    }
    
    /**
     * Affiche un tooltip amélioré
     */
    showTooltip(e) {
        const element = e.target;
        const tooltipText = element.getAttribute('title') || 
                           element.getAttribute('data-tooltip') ||
                           element.querySelector('[title]')?.getAttribute('title');
        
        if (!tooltipText) return;
        
        // Supprimer l'attribut title pour éviter le tooltip natif
        if (element.hasAttribute('title')) {
            element.setAttribute('data-original-title', element.getAttribute('title'));
            element.removeAttribute('title');
        }
        
        // Créer un tooltip personnalisé
        if (!element.querySelector('.custom-tooltip')) {
            const customTooltip = document.createElement('div');
            customTooltip.className = 'custom-tooltip';
            customTooltip.textContent = tooltipText;
            
            // Positionner le tooltip
            element.style.position = 'relative';
            element.appendChild(customTooltip);
            
            // Animation d'apparition
            setTimeout(() => {
                customTooltip.style.opacity = '1';
            }, 10);
        }
    }
    
    /**
     * Cache un tooltip
     */
    hideTooltip(e) {
        const element = e.target;
        const customTooltip = element.querySelector('.custom-tooltip');
        
        if (customTooltip) {
            customTooltip.style.opacity = '0';
            setTimeout(() => {
                if (customTooltip.parentNode) {
                    customTooltip.remove();
                }
            }, 200);
        }
        
        // Restaurer l'attribut title original
        const originalTitle = element.getAttribute('data-original-title');
        if (originalTitle) {
            element.setAttribute('title', originalTitle);
            element.removeAttribute('data-original-title');
        }
    }
    
    /**
     * Optimise la performance d'affichage
     */
    optimizePerformance() {
        // Débounce pour les événements de redimensionnement
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.adjustLayoutForScreen();
            }, 250);
        });
        
        // Ajustement initial
        this.adjustLayoutForScreen();
    }
    
    /**
     * Ajuste la mise en page selon la taille d'écran
     */
    adjustLayoutForScreen() {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        const container = document.querySelector('.container');
        
        if (container) {
            // Supprimer toutes les classes de layout
            container.classList.remove('mobile-layout', 'tablet-layout', 'desktop-layout');
            
            // Ajouter la classe appropriée
            if (isMobile) {
                container.classList.add('mobile-layout');
            } else if (isTablet) {
                container.classList.add('tablet-layout');
            } else {
                container.classList.add('desktop-layout');
            }
        }
        
        // Ajuster les grids pour mobile
        if (isMobile) {
            const grids = document.querySelectorAll('.grid-2');
            grids.forEach(grid => {
                grid.style.gridTemplateColumns = '1fr';
                grid.style.gap = '1rem';
            });
        }
    }
    
    /**
     * Ajoute des améliorations d'accessibilité
     */
    enhanceAccessibility() {
        // Améliorer la navigation au clavier
        const interactiveElements = document.querySelectorAll('button, input, select, textarea, [tabindex]');
        
        interactiveElements.forEach(element => {
            // Assurer que les éléments focusables ont un outline visible
            element.addEventListener('focus', () => {
                if (!element.style.outline || element.style.outline === 'none') {
                    element.style.outline = '2px solid var(--primary-color)';
                    element.style.outlineOffset = '2px';
                }
            });
            
            element.addEventListener('blur', () => {
                if (element.style.outline === '2px solid var(--primary-color)') {
                    element.style.outline = '';
                    element.style.outlineOffset = '';
                }
            });
        });
        
        // Améliorer les labels et descriptions
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
                const label = document.querySelector(`label[for="${input.id}"]`);
                if (label) {
                    input.setAttribute('aria-labelledby', label.id || `label-${input.id}`);
                    if (!label.id) {
                        label.id = `label-${input.id}`;
                    }
                }
            }
        });
    }
    
    /**
     * Gestion des états de chargement
     */
    addLoadingStates() {
        const simulateButton = document.getElementById('btn-simulate');
        
        if (simulateButton) {
            // Sauvegarder le texte original
            const originalText = simulateButton.innerHTML;
            
            simulateButton.addEventListener('click', () => {
                // État de chargement
                simulateButton.classList.add('loading-state');
                simulateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcul en cours...';
                simulateButton.disabled = true;
                
                // Réinitialiser après un délai (sera remplacé par la vraie logique)
                setTimeout(() => {
                    simulateButton.classList.remove('loading-state');
                    simulateButton.innerHTML = originalText;
                    simulateButton.disabled = false;
                }, 2000);
            });
        }
    }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    window.immoUIFixes = new ImmoUIFixes();
});

// Initialisation immédiate si le DOM est déjà chargé
if (document.readyState !== 'loading') {
    window.immoUIFixes = new ImmoUIFixes();
}

// Export pour compatibilité
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImmoUIFixes;
}

// Fonctions utilitaires globales
window.ImmoUIUtils = {
    /**
     * Force le recalcul du layout
     */
    recalculateLayout() {
        if (window.immoUIFixes) {
            window.immoUIFixes.adjustLayoutForScreen();
        }
    },
    
    /**
     * Réinitialise les animations
     */
    resetAnimations() {
        const animatedElements = document.querySelectorAll('.fade-in-up');
        animatedElements.forEach(el => {
            el.classList.remove('fade-in-up');
            setTimeout(() => el.classList.add('fade-in-up'), 100);
        });
    },
    
    /**
     * Active le mode debug pour voir les corrections appliquées
     */
    debugMode(enable = true) {
        if (enable) {
            document.documentElement.style.setProperty('--debug-border', '1px solid red');
            console.log('🐛 Mode debug activé - bordures rouges sur les éléments corrigés');
        } else {
            document.documentElement.style.removeProperty('--debug-border');
            console.log('🐛 Mode debug désactivé');
        }
    }
};

console.log('🚀 ImmoUIFixes initialisé avec succès');
