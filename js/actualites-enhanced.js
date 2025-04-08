/**
 * Améliorations UX pour la page Actualités
 * Ce script gère les interactions améliorées pour la page Actualités
 */

// Module principal des améliorations d'Actualités
const ActualitesEnhancer = (function() {
    // Stockage des états et configurations
    const state = {
        layoutMode: 'default', // default, compact, expanded
        themesPeriod: 'weekly', // weekly, monthly, quarterly
        activeFilters: {
            category: 'all',
            impact: 'all',
            country: 'all',
            sentiment: 'all'
        },
        sidebarStatus: {
            leftVisible: true,
            rightVisible: true
        }
    };
    
    /**
     * Initialise toutes les améliorations
     */
    function init() {
        // Attendre que le DOM soit chargé
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Initialisation des améliorations UX pour Actualités');
            
            // Créer la structure du layout à 3 colonnes
            setupLayout();
            
            // Initialiser les sidebars des marchés
            setupMarketSidebars();
            
            // Initialiser les filtres
            setupFilters();
            
            // Initialiser les thèmes dominants
            setupThemesDominants();
            
            // Initialiser le brief stratégique
            setupBriefStrategique();
            
            // Améliorer l'affichage des actualités
            enhanceNewsDisplay();
            
            // Gérer le bouton "Voir plus"
            setupLoadMoreButton();
            
            // Restaurer les préférences utilisateur
            loadUserPreferences();
            
            // Initialiser la détection des dimensions d'écran
            handleResponsiveLayout();
            
            // Détecter les changements de redimensionnement
            window.addEventListener('resize', handleResponsiveLayout);
        });
    }
    
    /**
     * Configure la mise en page principale à 3 colonnes
     */
    function setupLayout() {
        // Sélectionner le conteneur principal
        const mainContainer = document.querySelector('.main-container');
        if (!mainContainer) return;
        
        // Créer le conteneur d'actualités
        const actualitesContainer = document.createElement('div');
        actualitesContainer.className = 'actualites-container';
        
        // Déplacer tous les enfants dans un div temporaire
        const tempContent = document.createElement('div');
        while (mainContainer.firstChild) {
            tempContent.appendChild(mainContainer.firstChild);
        }
        
        // Créer la sidebar gauche
        const leftSidebar = document.createElement('div');
        leftSidebar.className = 'actualites-sidebar left';
        actualitesContainer.appendChild(leftSidebar);
        
        // Créer le conteneur principal
        const actualitesMain = document.createElement('div');
        actualitesMain.className = 'actualites-main';
        actualitesContainer.appendChild(actualitesMain);
        
        // Créer la sidebar droite
        const rightSidebar = document.createElement('div');
        rightSidebar.className = 'actualites-sidebar right';
        actualitesContainer.appendChild(rightSidebar);
        
        // Remettre le contenu temporaire dans le conteneur principal
        actualitesMain.appendChild(tempContent);
        
        // Ajouter le conteneur d'actualités au conteneur principal
        mainContainer.appendChild(actualitesContainer);
        
        // Ajouter des boutons de bascule pour chaque sidebar sur les petits écrans
        addSidebarToggles();
    }
    
    /**
     * Configure les sidebars des marchés
     */
    function setupMarketSidebars() {
        // Récupérer les infos d'horloge du market-clock-left
        const leftClockContainer = document.getElementById('market-clock-left');
        const leftMarketItems = leftClockContainer ? Array.from(leftClockContainer.querySelectorAll('.market-item')) : [];
        
        // Récupérer les infos d'horloge du market-clock-right
        const rightClockContainer = document.getElementById('market-clock-right');
        const rightMarketItems = rightClockContainer ? Array.from(rightClockContainer.querySelectorAll('.market-item')) : [];
        
        // Créer les panels pour les marchés globaux (gauche)
        createMarketPanel('Marchés Globaux', 'fas fa-globe', leftMarketItems, '.actualites-sidebar.left');
        
        // Créer les panels pour les marchés Europe/Amérique (droite)
        createMarketPanel('Marchés Europe/Amérique', 'fas fa-landmark', rightMarketItems, '.actualites-sidebar.right');
    }
    
    /**
     * Crée un panel de marchés dans une sidebar
     */
    function createMarketPanel(title, icon, marketItems, targetSelector) {
        const sidebar = document.querySelector(targetSelector);
        if (!sidebar) return;
        
        // Créer le panel
        const panel = document.createElement('div');
        panel.className = 'marches-panel';
        
        // Créer l'en-tête
        const header = document.createElement('div');
        header.className = 'marches-panel-header';
        
        const headerTitle = document.createElement('div');
        headerTitle.className = 'marches-panel-title';
        headerTitle.innerHTML = `<i class="${icon}"></i> ${title}`;
        
        header.appendChild(headerTitle);
        panel.appendChild(header);
        
        // Créer le contenu
        const content = document.createElement('div');
        content.className = 'marches-panel-content';
        
        // Ajouter les éléments de marché
        if (marketItems.length > 0) {
            marketItems.forEach(item => {
                const marketName = item.querySelector('.market-name')?.textContent || 'Marché';
                const marketDesc = item.querySelector('.market-desc')?.textContent || '';
                const marketHours = item.querySelector('.market-hours')?.textContent || '';
                const isOpen = item.classList.contains('open');
                const isPreMarket = item.classList.contains('pre-market');
                
                const marketItem = document.createElement('div');
                marketItem.className = 'marche-item';
                
                const status = document.createElement('div');
                status.className = `marche-status ${isOpen ? 'open' : isPreMarket ? 'pre-market' : 'closed'}`;
                
                const info = document.createElement('div');
                info.className = 'marche-info';
                info.innerHTML = `
                    <h4>${marketName}</h4>
                    <p>${marketDesc}</p>
                    <span class="marche-hours">${marketHours}</span>
                `;
                
                marketItem.appendChild(status);
                marketItem.appendChild(info);
                
                content.appendChild(marketItem);
            });
        } else {
            // Données de démonstration si aucun élément n'est disponible
            const demoMarkets = [
                { name: 'NYSE', desc: 'New York Stock Exchange', hours: '15:30 - 22:00', status: 'open' },
                { name: 'NASDAQ', desc: 'NASDAQ', hours: '15:30 - 22:00', status: 'open' },
                { name: 'LSE', desc: 'London Stock Exchange', hours: '09:00 - 17:30', status: 'open' },
                { name: 'Euronext', desc: 'Paris, Amsterdam, Brussels', hours: '09:00 - 17:30', status: 'open' }
            ];
            
            demoMarkets.forEach(market => {
                const marketItem = document.createElement('div');
                marketItem.className = 'marche-item';
                
                const status = document.createElement('div');
                status.className = `marche-status ${market.status}`;
                
                const info = document.createElement('div');
                info.className = 'marche-info';
                info.innerHTML = `
                    <h4>${market.name}</h4>
                    <p>${market.desc}</p>
                    <span class="marche-hours">${market.hours}</span>
                `;
                
                marketItem.appendChild(status);
                marketItem.appendChild(info);
                
                content.appendChild(marketItem);
            });
        }
        
        panel.appendChild(content);
        sidebar.prepend(panel);
    }
    
    /**
     * Configure les filtres
     */
    function setupFilters() {
        // Récupérer tous les filtres existants
        const filters = document.querySelectorAll('#category-filters button, #sentiment-select, #impact-select, #country-select');
        
        // Ajouter une nouvelle classe pour la stylisation
        filters.forEach(filter => {
            if (filter.tagName === 'BUTTON') {
                filter.classList.add('filter-btn');
            } else if (filter.tagName === 'SELECT') {
                filter.classList.add('filter-select');
            }
        });
        
        // Ajouter la logique pour les filtres
        const categoryButtons = document.querySelectorAll('#category-filters button');
        categoryButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Supprimer la classe active de tous les boutons
                categoryButtons.forEach(btn => btn.classList.remove('filter-active'));
                // Ajouter la classe active au bouton cliqué
                this.classList.add('filter-active');
                
                // Mettre à jour l'état
                state.activeFilters.category = this.dataset.category;
                
                // Sauvegarder les préférences
                saveUserPreferences();
                
                // Appliquer les filtres
                applyFilters();
            });
        });
        
        // Pour les selects
        const selects = document.querySelectorAll('#sentiment-select, #impact-select, #country-select');
        selects.forEach(select => {
            select.addEventListener('change', function() {
                // Mettre à jour l'état
                state.activeFilters[this.id.replace('-select', '')] = this.value;
                
                // Sauvegarder les préférences
                saveUserPreferences();
                
                // Appliquer les filtres
                applyFilters();
            });
        });
        
        // Wrap les filtres dans un conteneur pour le style
        const categoryFilters = document.getElementById('category-filters');
        const sentimentSelect = document.getElementById('sentiment-select');
        const impactSelect = document.getElementById('impact-select');
        const countrySelect = document.getElementById('country-select');
        
        if (categoryFilters && sentimentSelect && impactSelect && countrySelect) {
            // Créer le conteneur de filtres
            const filtersRow = document.createElement('div');
            filtersRow.className = 'filters-row';
            
            // Créer le groupe de filtres de catégorie
            const categoryGroup = document.createElement('div');
            categoryGroup.className = 'filter-group';
            categoryGroup.appendChild(categoryFilters);
            
            // Créer le groupe de filtres avancés
            const advancedGroup = document.createElement('div');
            advancedGroup.className = 'filter-group';
            advancedGroup.appendChild(sentimentSelect);
            advancedGroup.appendChild(impactSelect);
            advancedGroup.appendChild(countrySelect);
            
            // Ajouter les groupes au conteneur
            filtersRow.appendChild(categoryGroup);
            filtersRow.appendChild(advancedGroup);
            
            // Remplacer les filtres existants
            const parentElement = categoryFilters.parentElement;
            parentElement.insertBefore(filtersRow, categoryFilters);
        }
    }
    
    /**
     * Configure les thèmes dominants
     */
    function setupThemesDominants() {
        // Trouver le conteneur de sélection de période
        const periodSelector = document.querySelector('.period-selector');
        if (!periodSelector) return;
        
        // Ajouter des écouteurs d'événements aux boutons de période
        const periodButtons = periodSelector.querySelectorAll('.period-btn');
        periodButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Supprimer la classe active de tous les boutons
                periodButtons.forEach(btn => btn.classList.remove('active'));
                
                // Ajouter la classe active au bouton cliqué
                this.classList.add('active');
                
                // Mettre à jour l'état
                state.themesPeriod = this.dataset.period;
                
                // Sauvegarder les préférences
                saveUserPreferences();
                
                // Implémenter la logique pour changer la période des thèmes
                // (Normalement, cela ferait un appel API - ici, c'est juste pour la démo)
                updateThemesData(state.themesPeriod);
            });
        });
        
        // Simuler l'initialisation des données des thèmes
        updateThemesData(state.themesPeriod);
    }
    
    /**
     * Met à jour les données des thèmes (simulation)
     */
    function updateThemesData(period) {
        console.log(`Mise à jour des thèmes pour la période: ${period}`);
        // Cette fonction ne fait rien de réel, mais pourrait être utilisée pour rafraîchir
        // les thèmes dominants via un appel API en fonction de la période sélectionnée
    }
    
    /**
     * Configure le brief stratégique
     */
    function setupBriefStrategique() {
        // Trouver le conteneur du brief
        const briefHeader = document.getElementById('briefToggleHeader');
        const briefContent = document.getElementById('briefContent');
        const toggleBtn = document.querySelector('.brief-toggle-btn');
        
        if (!briefHeader || !briefContent || !toggleBtn) return;
        
        // Ajouter un écouteur d'événements pour le toggle
        briefHeader.addEventListener('click', function() {
            const isHidden = briefContent.classList.contains('hidden');
            
            if (isHidden) {
                briefContent.classList.remove('hidden');
                toggleBtn.querySelector('.brief-btn-text').textContent = 'Réduire le résumé';
                toggleBtn.querySelector('.brief-icon-toggle').classList.remove('fa-chevron-down');
                toggleBtn.querySelector('.brief-icon-toggle').classList.add('fa-chevron-up');
            } else {
                briefContent.classList.add('hidden');
                toggleBtn.querySelector('.brief-btn-text').textContent = 'Afficher le résumé';
                toggleBtn.querySelector('.brief-icon-toggle').classList.remove('fa-chevron-up');
                toggleBtn.querySelector('.brief-icon-toggle').classList.add('fa-chevron-down');
            }
        });
    }
    
    /**
     * Améliore l'affichage des actualités
     */
    function enhanceNewsDisplay() {
        // Identifier les conteneurs d'actualités
        const criticalNews = document.getElementById('critical-news-container');
        const importantNews = document.getElementById('important-news-container');
        const recentNews = document.getElementById('recent-news');
        
        if (!criticalNews || !importantNews || !recentNews) return;
        
        // Appliquer les nouveaux styles aux actualités critiques
        Array.from(criticalNews.children).forEach(newsItem => {
            if (newsItem.classList.contains('loading-state')) return;
            newsItem.classList.add('critical-news-item');
        });
        
        // Observer les changements dans le DOM pour appliquer les améliorations aux nouveaux éléments
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Élément HTML
                            if (node.parentNode === criticalNews) {
                                node.classList.add('critical-news-item');
                            }
                        }
                    });
                }
            });
        });
        
        // Observer les trois conteneurs d'actualités
        observer.observe(criticalNews, { childList: true });
        observer.observe(importantNews, { childList: true });
        observer.observe(recentNews, { childList: true });
    }
    
    /**
     * Configure le bouton "Voir plus"
     */
    function setupLoadMoreButton() {
        // Trouver le bouton "Voir plus"
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (!loadMoreBtn) return;
        
        // Ajouter la classe CSS
        loadMoreBtn.classList.add('load-more-btn');
        
        // Créer un conteneur pour le centrage
        const container = document.createElement('div');
        container.className = 'load-more-container';
        
        // Remplacer le bouton par le conteneur + bouton
        loadMoreBtn.parentNode.replaceChild(container, loadMoreBtn);
        container.appendChild(loadMoreBtn);
    }
    
    /**
     * Ajoute des boutons pour basculer les sidebars sur les petits écrans
     */
    function addSidebarToggles() {
        // Créer les boutons de bascule
        const leftToggle = document.createElement('button');
        leftToggle.className = 'sidebar-toggle left';
        leftToggle.innerHTML = '<i class="fas fa-chart-line"></i>';
        
        const rightToggle = document.createElement('button');
        rightToggle.className = 'sidebar-toggle right';
        rightToggle.innerHTML = '<i class="fas fa-chart-line"></i>';
        
        // Ajouter les boutons au conteneur
        document.body.appendChild(leftToggle);
        document.body.appendChild(rightToggle);
        
        // Ajouter les écouteurs d'événements
        leftToggle.addEventListener('click', function() {
            const leftSidebar = document.querySelector('.actualites-sidebar.left');
            
            if (leftSidebar) {
                state.sidebarStatus.leftVisible = !state.sidebarStatus.leftVisible;
                
                if (state.sidebarStatus.leftVisible) {
                    leftSidebar.style.display = 'block';
                    leftToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                } else {
                    leftSidebar.style.display = 'none';
                    leftToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                }
                
                // Sauvegarder les préférences
                saveUserPreferences();
            }
        });
        
        rightToggle.addEventListener('click', function() {
            const rightSidebar = document.querySelector('.actualites-sidebar.right');
            
            if (rightSidebar) {
                state.sidebarStatus.rightVisible = !state.sidebarStatus.rightVisible;
                
                if (state.sidebarStatus.rightVisible) {
                    rightSidebar.style.display = 'block';
                    rightToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                } else {
                    rightSidebar.style.display = 'none';
                    rightToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                }
                
                // Sauvegarder les préférences
                saveUserPreferences();
            }
        });
    }
    
    /**
     * Gère l'adaptation du layout en fonction de la taille de l'écran
     */
    function handleResponsiveLayout() {
        const width = window.innerWidth;
        const leftSidebar = document.querySelector('.actualites-sidebar.left');
        const rightSidebar = document.querySelector('.actualites-sidebar.right');
        const leftToggle = document.querySelector('.sidebar-toggle.left');
        const rightToggle = document.querySelector('.sidebar-toggle.right');
        
        if (width < 992) { // Petit écran
            // Cacher les sidebars par défaut
            if (leftSidebar) leftSidebar.style.display = 'none';
            if (rightSidebar) rightSidebar.style.display = 'none';
            
            // Afficher les boutons de bascule
            if (leftToggle) leftToggle.style.display = 'block';
            if (rightToggle) rightToggle.style.display = 'block';
            
            // Mettre à jour l'état
            state.sidebarStatus.leftVisible = false;
            state.sidebarStatus.rightVisible = false;
        } else { // Grand écran
            // Afficher les sidebars
            if (leftSidebar) leftSidebar.style.display = 'block';
            if (rightSidebar) rightSidebar.style.display = 'block';
            
            // Cacher les boutons de bascule
            if (leftToggle) leftToggle.style.display = 'none';
            if (rightToggle) rightToggle.style.display = 'none';
            
            // Mettre à jour l'état
            state.sidebarStatus.leftVisible = true;
            state.sidebarStatus.rightVisible = true;
        }
    }
    
    /**
     * Applique les filtres aux actualités
     */
    function applyFilters() {
        const { category, impact, country, sentiment } = state.activeFilters;
        
        console.log(`Filtres appliqués: catégorie=${category}, impact=${impact}, pays=${country}, sentiment=${sentiment}`);
        
        // La logique de filtrage réelle peut être implémentée ici
        // C'est habituellement géré par le système existant via des classes CSS
    }
    
    /**
     * Sauvegarde les préférences utilisateur
     */
    function saveUserPreferences() {
        try {
            const preferences = {
                layoutMode: state.layoutMode,
                themesPeriod: state.themesPeriod,
                activeFilters: state.activeFilters,
                sidebarStatus: state.sidebarStatus
            };
            
            localStorage.setItem('actualites_preferences', JSON.stringify(preferences));
        } catch (error) {
            console.warn('Impossible de sauvegarder les préférences:', error);
        }
    }
    
    /**
     * Charge les préférences utilisateur
     */
    function loadUserPreferences() {
        try {
            const savedPrefs = localStorage.getItem('actualites_preferences');
            
            if (savedPrefs) {
                const preferences = JSON.parse(savedPrefs);
                
                // Restaurer l'état
                state.layoutMode = preferences.layoutMode || 'default';
                state.themesPeriod = preferences.themesPeriod || 'weekly';
                state.activeFilters = preferences.activeFilters || { category: 'all', impact: 'all', country: 'all', sentiment: 'all' };
                state.sidebarStatus = preferences.sidebarStatus || { leftVisible: true, rightVisible: true };
                
                // Appliquer les préférences
                applyPreferences();
            }
        } catch (error) {
            console.warn('Impossible de charger les préférences:', error);
        }
    }
    
    /**
     * Applique les préférences utilisateur
     */
    function applyPreferences() {
        // Appliquer la période des thèmes
        const periodButtons = document.querySelectorAll('.period-btn');
        periodButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === state.themesPeriod);
        });
        
        // Appliquer les filtres
        const categoryButtons = document.querySelectorAll('#category-filters button');
        categoryButtons.forEach(btn => {
            btn.classList.toggle('filter-active', btn.dataset.category === state.activeFilters.category);
        });
        
        const sentimentSelect = document.getElementById('sentiment-select');
        if (sentimentSelect) sentimentSelect.value = state.activeFilters.sentiment;
        
        const impactSelect = document.getElementById('impact-select');
        if (impactSelect) impactSelect.value = state.activeFilters.impact;
        
        const countrySelect = document.getElementById('country-select');
        if (countrySelect) countrySelect.value = state.activeFilters.country;
        
        // Appliquer les filtres
        applyFilters();
    }
    
    // Exposer l'API publique
    return {
        init: init
    };
})();

// Initialiser les améliorations
ActualitesEnhancer.init();
