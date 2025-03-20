/**
 * Correctifs pour TradePulse - Problèmes d'interface
 * Créé le 20/03/2025
 * Ce script corrige les problèmes d'affichage du logo et du titre de portefeuille
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log("Initialisation des correctifs d'interface TradePulse...");
    
    // Correction pour le logo TRADEPULSE (problème du T manquant)
    fixLogoDisplay();
    
    // Correction pour le titre de portefeuille trop haut
    fixPortfolioTitlePosition();
    
    // Amélioration des transitions entre les types de portefeuille
    enhancePortfolioTabsTransition();
    
    // Surveillance des changements d'URL pour mettre à jour l'interface
    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.type) {
            updatePortfolioUI(event.state.type);
        }
    });
    
    console.log("Correctifs d'interface TradePulse initialisés avec succès.");
});

/**
 * Corrige l'affichage du logo TRADEPULSE
 */
function fixLogoDisplay() {
    const logoContainer = document.querySelector('.logo-container');
    const logo = document.querySelector('.logo-container .logo');
    
    if (!logoContainer || !logo) {
        console.warn("Éléments du logo non trouvés");
        return;
    }
    
    console.log("Application des correctifs pour le logo...");
    
    // Assurer que le logo est bien visible avec le T
    logoContainer.style.overflow = 'visible';
    logoContainer.style.minWidth = '200px';
    
    // Ajouter un petit espace avant le T
    logo.style.paddingLeft = '5px';
    logo.style.position = 'relative';
    logo.style.zIndex = '10';
    
    // Vérifier si le texte est bien "TRADEPULSE" et non "RADEPULSE"
    if (logo.textContent === 'RADEPULSE') {
        console.log("Correction du texte du logo de RADEPULSE à TRADEPULSE");
        logo.textContent = 'TRADEPULSE';
    }
}

/**
 * Corrige la position du titre du portefeuille
 */
function fixPortfolioTitlePosition() {
    const titleSection = document.querySelector('.page-title-section');
    const portfolioTitle = document.getElementById('portfolioTitle');
    
    if (!titleSection || !portfolioTitle) {
        console.warn("Éléments du titre de portefeuille non trouvés");
        return;
    }
    
    console.log("Application des correctifs pour le titre de portefeuille...");
    
    // Ajouter plus d'espace au-dessus de la section de titre
    titleSection.style.marginTop = '40px';
    titleSection.style.paddingTop = '20px';
    titleSection.style.marginBottom = '30px';
    titleSection.style.clear = 'both';
    
    // Améliorer la visibilité du titre
    portfolioTitle.style.fontSize = '2.2rem';
    portfolioTitle.style.letterSpacing = '2px';
    portfolioTitle.style.marginBottom = '15px';
    portfolioTitle.style.display = 'block';
    portfolioTitle.style.width = '100%';
    portfolioTitle.style.textAlign = 'center';
    portfolioTitle.style.position = 'relative';
    portfolioTitle.style.zIndex = '2';
}

/**
 * Améliore les transitions entre les onglets de portefeuille
 */
function enhancePortfolioTabsTransition() {
    const portfolioTabs = document.querySelectorAll('.portfolio-tab');
    
    if (portfolioTabs.length === 0) {
        console.warn("Onglets de portefeuille non trouvés");
        return;
    }
    
    console.log("Amélioration des transitions entre onglets de portefeuille...");
    
    // Améliorer l'apparence et le comportement des onglets
    portfolioTabs.forEach(tab => {
        // Ajouter des styles supplémentaires
        tab.style.padding = '12px 24px';
        tab.style.borderRadius = '6px';
        tab.style.fontWeight = '600';
        tab.style.transition = 'all 0.3s ease';
        
        // Modifier le comportement de clic pour une meilleure expérience
        tab.addEventListener('click', function(e) {
            // Cela remplace le gestionnaire d'événements original
            e.stopPropagation(); // Empêcher la propagation de l'événement
            
            const target = this.dataset.target;
            if (!target) return;
            
            // Récupérer le type de portefeuille
            const portfolioType = target.replace('portfolio-', '');
            
            // Mettre à jour l'interface
            updatePortfolioUI(portfolioType);
            
            // Mettre à jour l'URL sans recharger la page
            const newUrl = updateQueryStringParameter(window.location.href, 'type', portfolioType);
            history.pushState({ type: portfolioType }, '', newUrl);
            
            console.log(`Transition vers le portefeuille ${portfolioType} effectuée avec succès`);
        }, true); // Utilisation de la phase de capture pour être prioritaire
    });
    
    // Conteneur des onglets
    const tabsContainer = document.querySelector('.portfolio-toggles');
    if (tabsContainer) {
        tabsContainer.style.display = 'flex';
        tabsContainer.style.justifyContent = 'center';
        tabsContainer.style.gap = '15px';
        tabsContainer.style.margin = '20px 0 40px';
    }
}

/**
 * Fonction pour mettre à jour l'interface utilisateur lors du changement de portefeuille
 */
function updatePortfolioUI(portfolioType) {
    console.log(`Mise à jour de l'interface pour le portefeuille ${portfolioType}...`);
    
    // Normaliser le type pour la comparaison (enlever accents et mettre en minuscules)
    const normalizedType = normalizePortfolioType(portfolioType);
    
    // Mise à jour du titre
    const titleElement = document.getElementById('portfolioTitle');
    if (titleElement) {
        // Déterminer le titre en fonction du type
        let titleText = 'PORTEFEUILLE';
        if (normalizedType === 'agressif') {
            titleText += ' AGRESSIF';
            // Mise à jour des couleurs d'accent
            document.documentElement.style.setProperty('--accent-color', 'var(--aggressive-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--aggressive-glow)');
        } else if (normalizedType === 'modere') {
            titleText += ' MODÉRÉ';
            document.documentElement.style.setProperty('--accent-color', 'var(--moderate-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--moderate-glow)');
        } else if (normalizedType === 'stable') {
            titleText += ' STABLE';
            document.documentElement.style.setProperty('--accent-color', 'var(--stable-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--stable-glow)');
        }
        
        // Mettre à jour le texte du titre
        titleElement.textContent = titleText;
    }
    
    // Mise à jour des onglets
    const tabs = document.querySelectorAll('.portfolio-tab');
    tabs.forEach(tab => {
        const tabTarget = tab.dataset.target;
        if (!tabTarget) return;
        
        const tabType = tabTarget.replace('portfolio-', '');
        
        if (normalizePortfolioType(tabType) === normalizedType) {
            tab.classList.add('active');
            // Assurer la visibilité de l'onglet actif
            setTimeout(() => {
                tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }, 100);
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Mise à jour des panneaux
    const panels = document.querySelectorAll('.portfolio-panel');
    panels.forEach(panel => {
        if (panel.id === `portfolio-${normalizedType}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
    
    // Mise à jour de la bordure du conteneur
    const container = document.querySelector('.portfolio-container');
    if (container) {
        container.style.borderColor = `var(--accent-color)`;
    }
}

/**
 * Normalise un type de portefeuille pour la comparaison
 */
function normalizePortfolioType(type) {
    // Normaliser en retirant les accents et en minuscules
    return type.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Met à jour les paramètres d'URL
 */
function updateQueryStringParameter(uri, key, value) {
    const re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
    const separator = uri.indexOf('?') !== -1 ? "&" : "?";
    
    if (uri.match(re)) {
        return uri.replace(re, '$1' + key + "=" + value + '$2');
    } else {
        return uri + separator + key + "=" + value;
    }
}

// Application des correctifs immédiatement si le DOM est déjà chargé
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log("DOM déjà chargé, application immédiate des correctifs...");
    fixLogoDisplay();
    fixPortfolioTitlePosition();
    enhancePortfolioTabsTransition();
}