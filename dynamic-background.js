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
    }
}

/**
 * Anime l'entrée des tableaux
 */
function animateTableEntrance() {
    // Animer l'entrée des tableaux quand ils deviennent visibles
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

    // Observer l'entrée des cartes
    const stockCards = document.querySelectorAll('.stock-card');
    stockCards.forEach((card, index) => {
        card.style.animationDelay = `${0.05 * index}s`;
    });
}

// Définir une animation pour le keyframe ripple-effect
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes ripple-effect {
    0% { transform: scale(0); opacity: 1; }
    100% { transform: scale(4); opacity: 0; }
}
`;
document.head.appendChild(styleSheet);