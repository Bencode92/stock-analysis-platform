/**
 * ui-enhancements.js
 * Scripts d'amélioration de l'expérience utilisateur pour TradePulse
 */

class UiEnhancer {
    constructor() {
        this.initPageTransitions();
        this.initTooltips();
        this.initRippleEffect();
        this.attachEventListeners();
        this.pageLoaded();
    }

    /**
     * Initialise les transitions entre les pages
     */
    initPageTransitions() {
        // Créer l'élément de transition de page
        if (!document.querySelector('.page-transition')) {
            const transitionElement = document.createElement('div');
            transitionElement.className = 'page-transition';
            const transitionInner = document.createElement('div');
            transitionInner.className = 'page-transition-inner';
            transitionElement.appendChild(transitionInner);
            document.body.appendChild(transitionElement);
        }

        // Intercepter tous les clics sur les liens pour ajouter des transitions
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.href.startsWith(window.location.origin) && 
                !link.hasAttribute('data-no-transition') && 
                !e.ctrlKey && !e.metaKey) {
                
                e.preventDefault();
                this.navigateTo(link.href);
            }
        });

        // Gérer les événements d'historique du navigateur
        window.addEventListener('popstate', () => {
            this.showPageTransition(false);
        });
    }

    /**
     * Initialise les tooltips sur la barre latérale
     */
    initTooltips() {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            // Vérifier si le tooltip existe déjà
            if (!item.querySelector('.tooltip')) {
                const tooltip = document.createElement('span');
                tooltip.className = 'tooltip';
                tooltip.textContent = item.getAttribute('title') || '';
                item.appendChild(tooltip);
                
                // S'assurer que l'attribut title ne crée pas un tooltip natif
                if (item.hasAttribute('title')) {
                    item.setAttribute('data-original-title', item.getAttribute('title'));
                    item.removeAttribute('title');
                }
            }
        });
    }

    /**
     * Initialise l'effet d'ondulation au clic
     */
    initRippleEffect() {
        // Ajouter la classe ripple à tous les éléments qui devraient avoir l'effet
        const rippleElements = document.querySelectorAll('.nav-item, .news-tab, .start-button, button:not([data-no-ripple]), .search-button');
        
        rippleElements.forEach(element => {
            if (!element.classList.contains('ripple')) {
                element.classList.add('ripple');
                
                element.addEventListener('click', (e) => {
                    const rect = element.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    const ripple = document.createElement('span');
                    ripple.className = 'ripple-effect';
                    ripple.style.left = x + 'px';
                    ripple.style.top = y + 'px';
                    
                    element.appendChild(ripple);
                    
                    setTimeout(() => {
                        ripple.remove();
                    }, 600);
                });
            }
        });
    }

    /**
     * Attache les écouteurs d'événements pour les interactions
     */
    attachEventListeners() {
        // Ajouter la classe d'effet de pression aux boutons
        const buttons = document.querySelectorAll('a.start-button, button, .search-button, .news-tab');
        buttons.forEach(button => {
            button.classList.add('button-press');
        });
        
        // Ajouter l'effet de focus amélioré aux éléments interactifs
        const focusElements = document.querySelectorAll('input, select, textarea, a, button');
        focusElements.forEach(el => {
            el.classList.add('focus-effect');
        });
        
        // Mettre à jour l'état actif de la navigation
        this.updateActiveNavItem();
    }

    /**
     * Met à jour l'élément de navigation actif en fonction de l'URL actuelle
     */
    updateActiveNavItem() {
        const currentPath = window.location.pathname;
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            const link = item.getAttribute('href');
            if (!link) return;
            
            // Extraire le chemin du lien
            const linkPath = new URL(link, window.location.origin).pathname;
            
            // Si le lien correspond à la page actuelle (ou à l'index)
            if (currentPath === linkPath || 
                (currentPath === '/' && linkPath.includes('index.html')) ||
                (currentPath.includes(linkPath) && linkPath !== '/')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Affiche l'animation de transition de page
     * @param {boolean} navigate - Si vrai, naviguer vers la nouvelle URL après l'animation
     * @param {string} url - L'URL vers laquelle naviguer (si navigate est vrai)
     */
    showPageTransition(navigate = true, url = '') {
        const transitionElement = document.querySelector('.page-transition');
        if (!transitionElement) return;
        
        transitionElement.classList.add('active');
        
        if (navigate) {
            setTimeout(() => {
                window.location.href = url;
            }, 400); // Correspond à la durée de la transition CSS
        } else {
            setTimeout(() => {
                transitionElement.classList.remove('active');
            }, 600);
        }
    }

    /**
     * Navigue vers une nouvelle URL avec une transition
     * @param {string} url - L'URL vers laquelle naviguer
     */
    navigateTo(url) {
        this.showPageTransition(true, url);
    }

    /**
     * Exécute les animations de chargement de page
     */
    pageLoaded() {
        // Masquer l'animation de transition une fois la page chargée
        setTimeout(() => {
            const transitionElement = document.querySelector('.page-transition');
            if (transitionElement) {
                transitionElement.classList.remove('active');
            }
        }, 200);
        
        // Ajouter la classe de changement d'état à certains éléments pour l'animation
        const animateElements = document.querySelectorAll('.news-card, .event-card');
        let delay = 100;
        
        animateElements.forEach(element => {
            setTimeout(() => {
                element.classList.add('state-change');
                setTimeout(() => {
                    element.classList.remove('state-change');
                }, 500);
            }, delay);
            delay += 100;
        });
    }

    /**
     * Affiche une animation de succès pour une action importante
     * @param {HTMLElement} element - L'élément sur lequel afficher l'animation
     */
    showSuccessAnimation(element) {
        if (!element) return;
        
        element.classList.add('success-animation', 'completed');
        
        setTimeout(() => {
            element.classList.remove('completed');
        }, 1500);
    }

    /**
     * Met à jour une barre de progression
     * @param {string} selector - Sélecteur CSS de la barre de progression
     * @param {number} percentage - Pourcentage de progression (0-100)
     */
    updateProgressBar(selector, percentage) {
        const progressBar = document.querySelector(selector);
        if (!progressBar) return;
        
        progressBar.style.width = `${percentage}%`;
        
        // Ajouter une animation de pulsation lorsque la progression est terminée
        if (percentage >= 100) {
            progressBar.parentElement.classList.add('updating');
            setTimeout(() => {
                progressBar.parentElement.classList.remove('updating');
            }, 1000);
        }
    }
}

// Initialiser les améliorations d'interface utilisateur au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.uiEnhancer = new UiEnhancer();
});

// Support pour les transitions préchargées en cas de navigation directe
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (!window.uiEnhancer) {
            window.uiEnhancer = new UiEnhancer();
        }
    }, 1);
}
