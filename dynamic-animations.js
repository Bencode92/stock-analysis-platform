/**
 * Script d'animations dynamiques pour améliorer l'interface utilisateur
 */

document.addEventListener('DOMContentLoaded', function() {
    // Améliorer les transitions d'éléments
    enhanceElementTransitions();

    // Ajouter des effets aux boutons de marché
    enhanceMarketButtons();

    // Ajouter des effets à la barre de recherche
    enhanceSearchBar();

    // Ajouter animation d'entrée pour les tableaux
    animateTableEntrance();
    
    // Ajouter une option pour réduire les animations (accessibilité)
    addReducedMotionToggle();
});

/**
 * Améliore les transitions d'affichage/masquage des éléments
 */
function enhanceElementTransitions() {
    // Remplacer les fonctions d'origine du script liste-script.js
    if (window.showElement) {
        const originalShowElement = window.showElement;
        window.showElement = function(id) {
            const element = document.getElementById(id);
            if (element) {
                // D'abord masquer avec opacité 0
                element.style.opacity = '0';
                element.classList.remove('hidden');

                // Forcer un reflow
                void element.offsetWidth;

                // Puis animer l'apparition
                element.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                element.style.transform = 'translateY(20px)';

                setTimeout(() => {
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                }, 50);
            } else {
                // Fallback sur la fonction originale si l'élément n'est pas trouvé
                originalShowElement(id);
            }
        };
    }

    if (window.hideElement) {
        const originalHideElement = window.hideElement;
        window.hideElement = function(id) {
            const element = document.getElementById(id);
            if (element) {
                // Animer la disparition
                element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                element.style.opacity = '0';
                element.style.transform = 'translateY(-10px)';

                // Puis masquer complètement
                setTimeout(() => {
                    element.classList.add('hidden');
                    element.style.transform = '';

                    // Certains éléments nécessitent une réinitialisation complète
                    if (id === 'indices-container' || id === 'indices-loading') {
                        setTimeout(() => {
                            element.style = '';
                        }, 100);
                    }
                }, 300);
            } else {
                // Fallback sur la fonction originale si l'élément n'est pas trouvé
                originalHideElement(id);
            }
        };
    }
}

/**
 * Ajoute des effets aux boutons de marché
 */
function enhanceMarketButtons() {
    // Ajouter un effet de pulsation lors du clic
    const marketButtons = document.querySelectorAll('.market-btn');
    marketButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Animation de pulsation au clic
            this.style.animation = 'none';
            void this.offsetWidth; // Force reflow
            this.style.animation = 'pulse 0.5s ease-out';

            // Effet d'onde
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            ripple.style.position = 'absolute';
            ripple.style.borderRadius = '50%';
            ripple.style.backgroundColor = 'rgba(0, 255, 135, 0.2)';
            ripple.style.transform = 'scale(0)';
            ripple.style.animation = 'ripple-effect 0.6s linear';
            ripple.style.width = '100%';
            ripple.style.height = '100%';
            ripple.style.left = '0';
            ripple.style.top = '0';

            this.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 700);
        });
    });
}

/**
 * Ajoute des effets à la barre de recherche
 */
function enhanceSearchBar() {
    const searchInput = document.getElementById('stock-search');
    const searchWrapper = searchInput?.closest('.search-wrapper');

    if (searchWrapper) {
        // Ajouter l'indicateur de focus
        const indicator = document.createElement('div');
        indicator.classList.add('search-focus-indicator');
        searchWrapper.appendChild(indicator);

        // Ajouter une classe pour l'icône de recherche
        const searchIcon = searchWrapper.querySelector('i.fa-search');
        if (searchIcon) {
            searchIcon.classList.add('search-icon');
        }
        
        // Améliorer l'effet de clear
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) {
            clearBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Empêcher la perte de focus
                
                // Ajouter une animation de disparition
                searchInput.style.transition = 'transform 0.2s ease';
                searchInput.style.transform = 'scale(0.98)';
                
                setTimeout(() => {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                    searchInput.style.transform = 'scale(1)';
                }, 100);
            });
        }
    }
}

/**
 * Anime l'entrée des tableaux
 */
function animateTableEntrance() {
    // Animer l'entrée des tableaux quand ils deviennent visibles
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const rows = entry.target.querySelectorAll('tr');
                    rows.forEach((row, index) => {
                        row.style.animationDelay = `${0.05 * index}s`;
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        // Observer tous les tableaux
        document.querySelectorAll('.data-table').forEach(table => {
            observer.observe(table);
        });
    }

    // Observer l'entrée des cartes
    const stockCards = document.querySelectorAll('.stock-card');
    stockCards.forEach((card, index) => {
        card.style.animationDelay = `${0.05 * index}s`;
    });
    
    // Ajouter un effet spécial pour les headers fixes lors du défilement
    addStickyHeaderEffect();
}

/**
 * Ajoute un effet de header sticky lors du défilement
 */
function addStickyHeaderEffect() {
    const tables = document.querySelectorAll('.data-table');
    
    tables.forEach(table => {
        const header = table.querySelector('thead');
        if (header) {
            // Créer un wrapper pour la table si nécessaire
            const wrapper = table.closest('.overflow-x-auto');
            
            if (wrapper) {
                wrapper.addEventListener('scroll', function() {
                    const scrollTop = this.scrollTop;
                    if (scrollTop > 0) {
                        header.classList.add('sticky-header');
                        header.style.top = `${scrollTop}px`;
                        header.style.zIndex = '5';
                        header.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                    } else {
                        header.classList.remove('sticky-header');
                        header.style.boxShadow = 'none';
                    }
                });
            }
        }
    });
}

/**
 * Ajoute une option pour réduire les animations (accessibilité)
 */
function addReducedMotionToggle() {
    // Ajouter un bouton dans le header pour activer/désactiver les animations
    const headerRight = document.querySelector('.header-right');
    
    if (headerRight) {
        // Vérifier si l'utilisateur a une préférence pour les animations réduites
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        // Créer le toggle
        const motionToggle = document.createElement('button');
        motionToggle.className = 'motion-toggle ripple';
        motionToggle.setAttribute('aria-label', 'Activer/désactiver les animations');
        motionToggle.innerHTML = '<i class="fas fa-film"></i>';
        motionToggle.style.marginRight = '15px';
        motionToggle.style.background = 'transparent';
        motionToggle.style.border = 'none';
        motionToggle.style.color = 'var(--accent-color)';
        motionToggle.style.fontSize = '16px';
        motionToggle.style.cursor = 'pointer';
        motionToggle.style.padding = '8px';
        motionToggle.title = 'Activer/désactiver les animations';
        
        // Vérifier s'il y a une préférence déjà sauvegardée
        const savedPref = localStorage.getItem('reduced-motion');
        const isReduced = savedPref === 'true' || prefersReducedMotion;
        
        // Appliquer l'état initial
        if (isReduced) {
            document.body.classList.add('reduced-motion');
            motionToggle.innerHTML = '<i class="fas fa-film-slash"></i>';
        }
        
        // Ajouter l'événement de bascule
        motionToggle.addEventListener('click', () => {
            document.body.classList.toggle('reduced-motion');
            const isNowReduced = document.body.classList.contains('reduced-motion');
            
            // Mettre à jour l'icône
            motionToggle.innerHTML = isNowReduced 
                ? '<i class="fas fa-film-slash"></i>' 
                : '<i class="fas fa-film"></i>';
                
            // Sauvegarder la préférence
            localStorage.setItem('reduced-motion', isNowReduced);
            
            // Ajouter un effet visuel de confirmation
            const tooltip = document.createElement('div');
            tooltip.textContent = isNowReduced ? 'Animations réduites' : 'Animations activées';
            tooltip.style.position = 'fixed';
            tooltip.style.top = '80px';
            tooltip.style.right = '20px';
            tooltip.style.backgroundColor = 'var(--accent-color)';
            tooltip.style.color = 'var(--background-color)';
            tooltip.style.padding = '8px 12px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '14px';
            tooltip.style.zIndex = '1000';
            tooltip.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateY(-10px)';
            tooltip.style.transition = 'all 0.3s ease';
            
            document.body.appendChild(tooltip);
            
            // Animer l'apparition puis la disparition
            setTimeout(() => {
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateY(0)';
                
                setTimeout(() => {
                    tooltip.style.opacity = '0';
                    tooltip.style.transform = 'translateY(-10px)';
                    
                    setTimeout(() => {
                        tooltip.remove();
                    }, 300);
                }, 2000);
            }, 10);
        });
        
        // Insérer avant la barre de recherche
        headerRight.insertBefore(motionToggle, headerRight.firstChild);
    }
}

// Définir une animation pour le keyframe ripple-effect
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes ripple-effect {
    0% { transform: scale(0); opacity: 1; }
    100% { transform: scale(4); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
    }
}

.sticky-header {
    position: relative;
    background-color: var(--card-header);
    transition: box-shadow 0.3s ease;
}
`;
document.head.appendChild(styleSheet);