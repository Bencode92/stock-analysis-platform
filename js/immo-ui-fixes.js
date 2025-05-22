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
        this.fixExistingRadioButtons();
        
        console.log('✅ Corrections d\'interface appliquées');
    }
    
    /**
     * Corrige la sélection du mode de calcul existant
     */
    fixExistingRadioButtons() {
        // Corriger les boutons radio existants
        const existingRadios = document.querySelectorAll('input[name="calculation-mode"]');
        const existingLabels = document.querySelectorAll('label[for*="mode-"]');
        
        existingRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Retirer les styles de tous les labels
                existingLabels.forEach(label => {
                    const btn = label.querySelector('.option-btn');
                    if (btn) {
                        btn.style.backgroundColor = 'rgba(1, 42, 74, 0.5)';
                        btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        btn.style.color = 'rgba(255, 255, 255, 0.9)';
                    }
                });
                
                // Appliquer le style au label sélectionné
                const selectedLabel = document.querySelector(`label[for="${e.target.id}"]`);
                if (selectedLabel) {
                    const btn = selectedLabel.querySelector('.option-btn');
                    if (btn) {
                        btn.style.backgroundColor = 'rgba(0, 255, 135, 0.15)';
                        btn.style.borderColor = 'var(--primary-color)';
                        btn.style.color = 'var(--primary-color)';
                        btn.style.boxShadow = '0 0 0 2px rgba(0, 255, 135, 0.3)';
                    }
                }
            });
            
            // Appliquer le style initial si le radio est coché
            if (radio.checked) {
                radio.dispatchEvent(new Event('change'));
            }
        });
    }
    
    /**
     * Corrige la sélection du mode de calcul
     */
    fixCalculationModeSelection() {
        const calculationOptions = document.querySelectorAll('.calculation-option');
        const radioInputs = document.querySelectorAll('input[name="calculation-mode"]');
        
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
     * Améliore l'espacement des formulaires
     */
    improveFormSpacing() {
        // Ajouter des classes d'amélioration
        const formGroups = document.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.classList.add('improved-spacing');
        });
        
        // Améliorer l'affichage des tooltips
        const tooltips = document.querySelectorAll('.info-tooltip');
        tooltips.forEach(tooltip => {
            tooltip.addEventListener('mouseenter', this.showTooltip);
            tooltip.addEventListener('mouseleave', this.hideTooltip);
        });
        
        // Corriger l'espacement des éléments qui se chevauchent
        this.fixOverlappingElements();
    }
    
    /**
     * Corrige les éléments qui se chevauchent
     */
    fixOverlappingElements() {
        // Corriger le mode de calcul existant
        const existingModeSection = document.querySelector('.flex.flex-col.gap-3');
        if (existingModeSection) {
            existingModeSection.style.gap = '1rem';
            
            const modeOptions = existingModeSection.querySelectorAll('.flex.items-center.cursor-pointer');
            modeOptions.forEach(option => {
                option.style.padding = '1rem';
                option.style.marginBottom = '0.5rem';
                option.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                option.style.borderRadius = '0.5rem';
                option.style.minHeight = '80px';
                option.style.alignItems = 'flex-start';
            });
        }
        
        // Améliorer l'espacement des descriptions
        const descriptions = document.querySelectorAll('.text-sm.opacity-80');
        descriptions.forEach(desc => {
            desc.style.lineHeight = '1.4';
            desc.style.marginTop = '0.5rem';
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
            villeSearch.addEventListener('focus', () => {
                const container = villeSearch.closest('.search-container');
                if (container) {
                    container.classList.add('focused');
                }
            });
            
            villeSearch.addEventListener('blur', () => {
                const container = villeSearch.closest('.search-container');
                if (container) {
                    container.classList.remove('focused');
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
                }
            });
        }, observerOptions);
        
        // Observer les cartes et sections
        const elementsToAnimate = document.querySelectorAll('.card, .ville-info-selected');
        elementsToAnimate.forEach(el => observer.observe(el));
    }
    
    /**
     * Affiche un tooltip amélioré
     */
    showTooltip(e) {
        const tooltip = e.target;
        const rect = tooltip.getBoundingClientRect();
        
        // Créer un tooltip personnalisé si nécessaire
        if (!tooltip.querySelector('.custom-tooltip')) {
            const customTooltip = document.createElement('div');
            customTooltip.className = 'custom-tooltip';
            customTooltip.textContent = tooltip.getAttribute('title') || tooltip.getAttribute('data-tooltip');
            tooltip.appendChild(customTooltip);
        }
    }
    
    /**
     * Cache un tooltip
     */
    hideTooltip(e) {
        const customTooltip = e.target.querySelector('.custom-tooltip');
        if (customTooltip) {
            customTooltip.remove();
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
    }
    
    /**
     * Ajuste la mise en page selon la taille d'écran
     */
    adjustLayoutForScreen() {
        const isMobile = window.innerWidth < 768;
        const container = document.querySelector('.container');
        
        if (container) {
            if (isMobile) {
                container.classList.add('mobile-layout');
            } else {
                container.classList.remove('mobile-layout');
            }
        }
    }
    
    /**
     * Corrige les problèmes spécifiques d'affichage
     */
    fixSpecificDisplayIssues() {
        // Corriger les problèmes de z-index
        const sidebar = document.querySelector('.sidebar');
        const header = document.querySelector('.main-header');
        const suggestions = document.querySelector('.ville-suggestions');
        
        if (sidebar) sidebar.style.zIndex = '100';
        if (header) header.style.zIndex = '50';
        if (suggestions) suggestions.style.zIndex = '1000';
        
        // Corriger la largeur des conteneurs
        const modeInfoBanner = document.querySelector('.mode-info-banner');
        if (modeInfoBanner) {
            modeInfoBanner.style.marginBottom = '2rem';
        }
        
        // Améliorer la lisibilité
        const descriptions = document.querySelectorAll('.calculation-description, .text-sm.opacity-80');
        descriptions.forEach(desc => {
            desc.style.wordWrap = 'break-word';
            desc.style.hyphens = 'auto';
        });
    }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    window.immoUIFixes = new ImmoUIFixes();
    
    // Appliquer aussi les corrections spécifiques
    if (window.immoUIFixes) {
        window.immoUIFixes.fixSpecificDisplayIssues();
        window.immoUIFixes.optimizePerformance();
    }
});

// Export pour compatibilité
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImmoUIFixes;
}

// Fonction utilitaire pour forcer la correction
window.forceUIFix = function() {
    if (window.immoUIFixes) {
        window.immoUIFixes.applyFixes();
        console.log('🔧 Corrections d\'interface forcées');
    }
};
