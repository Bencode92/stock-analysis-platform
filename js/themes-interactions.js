/**
 * Gestion des interactions avancées pour les thèmes dominants
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialiser les interactions des thèmes dominants
    initThemeInteractions();
});

/**
 * Initialise les interactions pour les thèmes
 */
function initThemeInteractions() {
    // Récupérer tous les éléments de thème une fois qu'ils sont chargés
    const checkThemes = setInterval(() => {
        const themeItems = document.querySelectorAll('.theme-item');
        if (themeItems.length > 0) {
            clearInterval(checkThemes);
            setupThemeInteractions(themeItems);
        }
    }, 500);
}

/**
 * Configure les événements pour les thèmes
 */
function setupThemeInteractions(themeItems) {
    console.log(`Configuration des interactions pour ${themeItems.length} thèmes`);
    
    // Pour chaque élément de thème
    themeItems.forEach(themeItem => {
        // Trouver l'en-tête et l'infobulle
        const themeHeader = themeItem.querySelector('.theme-header');
        const tooltip = themeItem.querySelector('.theme-tooltip');
        
        if (!themeHeader || !tooltip) return;
        
        // État du thème (ouvert/fermé)
        let isOpen = false;
        
        // Fonction pour fermer tous les tooltips
        const closeAllTooltips = () => {
            document.querySelectorAll('.theme-item').forEach(item => {
                item.classList.remove('active');
            });
        };
        
        // Événement au clic sur l'en-tête du thème
        themeHeader.addEventListener('click', (e) => {
            e.stopPropagation(); // Empêcher la propagation
            
            // Fermer tous les tooltips d'abord
            closeAllTooltips();
            
            // Basculer l'état actif
            isOpen = !isOpen;
            if (isOpen) {
                themeItem.classList.add('active');
                
                // Positionner l'infobulle pour éviter qu'elle ne sorte de l'écran
                positionTooltip(tooltip, themeItem);
            } else {
                themeItem.classList.remove('active');
            }
        });
        
        // Fermer au clic en dehors
        document.addEventListener('click', (e) => {
            if (!themeItem.contains(e.target)) {
                themeItem.classList.remove('active');
                isOpen = false;
            }
        });
        
        // Améliorer le hover pour les mobiles
        themeItem.addEventListener('touchstart', (e) => {
            if (!themeItem.classList.contains('active')) {
                e.preventDefault();
                closeAllTooltips();
                themeItem.classList.add('active');
                isOpen = true;
                
                // Positionner l'infobulle
                positionTooltip(tooltip, themeItem);
            }
        });
    });
}

/**
 * Positionne intelligemment l'infobulle pour éviter qu'elle ne sorte de l'écran
 */
function positionTooltip(tooltip, themeItem) {
    if (!tooltip) return;
    
    // Réinitialiser d'abord les styles de position
    tooltip.style.left = '';
    tooltip.style.right = '';
    tooltip.style.top = '';
    
    // Obtenir les dimensions et positions
    const itemRect = themeItem.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Vérifier si l'infobulle sort à droite
    if (itemRect.left + tooltipRect.width > viewportWidth - 20) {
        tooltip.style.left = 'auto';
        tooltip.style.right = '0';
        
        // Ajuster la position de la flèche
        const arrow = tooltip.querySelector('.tooltip-arrow');
        if (arrow) {
            arrow.style.left = 'auto';
            arrow.style.right = '20px';
        }
    }
    
    // Vérifier si l'infobulle sort en bas
    if (itemRect.bottom + tooltipRect.height > viewportHeight - 20) {
        tooltip.style.top = 'auto';
        tooltip.style.bottom = '100%';
        tooltip.style.marginTop = '0';
        tooltip.style.marginBottom = '10px';
        
        // Inverser la flèche
        const arrow = tooltip.querySelector('.tooltip-arrow');
        if (arrow) {
            arrow.style.top = 'auto';
            arrow.style.bottom = '-8px';
            arrow.style.borderTop = '8px solid rgba(0, 255, 135, 0.3)';
            arrow.style.borderBottom = 'none';
        }
    }
}
