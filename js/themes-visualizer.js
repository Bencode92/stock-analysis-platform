/**
 * themes-visualizer.js v5.3 - Gestionnaire des thèmes avec sélecteur de période global
 * Affichage d'une seule période à la fois pour éviter la troncature
 */

const ThemesVisualizer = {
    // Configuration
    periods: ['weekly', 'monthly', 'quarterly'],
    activePeriod: 'weekly', // Période active par défaut
    themesData: null,
    loadStartTime: 0,
    showTopOnly: false,
    searchQuery: '',
    
    // Mapping des axes pour axisMax
    axisKeyMap: {
        'macroeconomie': 'macroeconomics',
        'secteurs': 'sectors',
        'regions': 'regions'
    },
    
    // Labels français pour les périodes
    periodLabels: {
        'weekly': 'Hebdomadaire',
        'monthly': 'Mensuel',
        'quarterly': 'Trimestriel'
    },

    // Initialisation
    init: function() {
        console.log('🎨 Initialisation ThemesVisualizer v5.3 - Sélecteur de période global');
        this.loadStartTime = performance.now();
        this.loadThemesData();
        this.setupEventListeners();
        this.setupSearch();
        this.setupAccessibility();
    },

    // Chargement des données
    loadThemesData: function() {
        fetch('data/themes.json')
            .then(response => response.json())
            .then(data => {
                const loadTime = Math.round(performance.now() - this.loadStartTime);
                console.log(`✅ Données chargées en ${loadTime}ms - Format: ${data.config_version || 'legacy'}`);
                
                this.themesData = data;
                this.detectFormat(data);
                this.renderThemes();
                this.updateLastUpdated();
                this.logPerformanceMetrics(loadTime);
            })
            .catch(error => {
                console.error('❌ Erreur chargement thèmes:', error);
                this.renderErrorState();
            });
    },

    // Détection du format
    detectFormat: function(data) {
        this.isCompactFormat = !!(data.periods && data.axisMax && data.config_version);
        console.log(`📊 Format détecté: ${this.isCompactFormat ? 'Compact v4.1+' : 'Legacy'}`);
    },

    // Configuration des événements
    setupEventListeners: function() {
        // Toggle Top 10
        this.createTopToggle();
        
        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'i') this.showDebugInfo();
            if (e.key === 'Escape') this.closeAllTooltips();
        });

        // Fermer tooltips au clic externe
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-item')) {
                this.closeAllTooltips();
            }
        });
    },

    // Création du toggle Top 10 moderne
    createTopToggle: function() {
        const headerContainer = document.querySelector('.themes-dominant-container h2');
        if (!headerContainer) return;
        
        const topToggle = document.createElement('button');
        topToggle.className = 'top-toggle-btn';
        topToggle.innerHTML = '<i class="fas fa-filter"></i> Top 10';
        topToggle.title = 'Afficher seulement les 10 thèmes principaux';
        
        topToggle.addEventListener('click', () => {
            this.showTopOnly = !this.showTopOnly;
            topToggle.innerHTML = this.showTopOnly ? 
                '<i class="fas fa-list"></i> Tous' : 
                '<i class="fas fa-filter"></i> Top 10';
            topToggle.title = this.showTopOnly ? 
                'Afficher tous les thèmes' : 
                'Afficher seulement les 10 thèmes principaux';
            this.renderThemes();
        });
        
        headerContainer.appendChild(topToggle);
    },

    // Configuration de la recherche moderne
    setupSearch: function() {
        const headerContainer = document.querySelector('.themes-dominant-container h2');
        if (!headerContainer) return;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Rechercher un thème...';
        searchInput.className = 'theme-search';
        
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderThemes();
            }, 300);
        });
        
        headerContainer.appendChild(searchInput);
    },

    // Accessibilité
    setupAccessibility: function() {
        document.querySelectorAll('.theme-list').forEach(list => {
            list.setAttribute('role', 'list');
            list.setAttribute('aria-label', 'Liste des thèmes dominants');
        });
    },

    // Rendu principal avec sélecteur global
    renderThemes: function() {
        if (!this.themesData || !this.isCompactFormat) return;
        
        // Créer le sélecteur de période global
        this.createGlobalPeriodSelector();
        
        this.renderAxis('macroeconomie', 'Macroéconomie', '📈');
        this.renderAxis('secteurs', 'Secteurs', '🏭');
        this.renderAxis('regions', 'Régions', '🌍');
    },

    // Création du sélecteur de période global
    createGlobalPeriodSelector: function() {
        const container = document.querySelector('.themes-dominant-container');
        if (!container || container.querySelector('.global-period-selector')) return;
        
        const selectorDiv = document.createElement('div');
        selectorDiv.className = 'global-period-selector';
        selectorDiv.innerHTML = `
            <div class="period-selector-global">
                ${this.periods.map(period => `
                    <button class="period-btn ${period === this.activePeriod ? 'active' : ''}" 
                            data-period="${period}">
                        ${this.periodLabels[period]}
                    </button>
                `).join('')}
            </div>
        `;
        
        // Insérer après le titre
        const h2 = container.querySelector('h2');
        h2.parentNode.insertBefore(selectorDiv, h2.nextSibling);
        
        // Event listeners
        selectorDiv.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.activePeriod = e.target.dataset.period;
                // Mettre à jour tous les boutons
                document.querySelectorAll('.period-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.period === this.activePeriod);
                });
                // Re-render tous les axes
                this.renderThemes();
            });
        });
    },

    // Rendu d'un axe sans sélecteur de période individuel
    renderAxis: function(axisId, axisTitle, icon) {
        const container = document.getElementById(`${axisId}-themes`);
        if (!container) return;
        
        // Structure sans sélecteur de période
        container.innerHTML = `
            <div class="axis-header">
                <span class="axis-icon">${icon}</span>
                <span class="axis-title">${axisTitle}</span>
            </div>
            <div class="theme-content-area">
                <ul class="theme-list" id="${axisId}-list"></ul>
            </div>
        `;
        
        // Rendu initial avec la période active globale
        this.renderAxisThemes(axisId, this.activePeriod);
    },

    // Rendu des thèmes pour un axe et une période
    renderAxisThemes: function(axisId, period) {
        const periodData = this.themesData.periods[period];
        const axisMax = this.themesData.axisMax[period];
        
        if (!periodData || !axisMax) return;
        
        // Utiliser le mapping pour obtenir la bonne clé
        const axisKey = this.axisKeyMap[axisId] || axisId;
        const axisThemes = periodData[axisKey];
        
        if (!axisThemes) return;
        
        const container = document.getElementById(`${axisId}-list`);
        if (!container) return;
        
        // Fermer tous les tooltips au rendu
        this.closeAllTooltips();
        
        // Obtenir le max pour cet axe
        const maxVal = axisMax[axisKey] || 1;
        
        // Tri et filtrage
        let sortedThemes = this.sortThemesByCount(axisThemes, period);
        
        // Filtrage par recherche
        if (this.searchQuery) {
            sortedThemes = sortedThemes.filter(([name]) => 
                name.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // Limite Top 10
        if (this.showTopOnly) {
            sortedThemes = sortedThemes.slice(0, 10);
        }
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Rendu des thèmes
        sortedThemes.forEach(([themeName, themeData]) => {
            const themeElement = this.createPeriodTheme(themeName, themeData, period, maxVal);
            container.appendChild(themeElement);
        });
    },

    // Création d'un thème avec nouveau système CSS
    createPeriodTheme: function(themeName, themeData, period, maxCount) {
        const periodIndex = this.periods.indexOf(period);
        const count = themeData.c[periodIndex];
        const [positivePct, negativePct, neutralPct] = themeData.s;
        const headlines = themeData.h || [];
        
        // Calculs
        const sentiment = this.getDominantSentimentFromArray([positivePct, negativePct, neutralPct]);
        const barWidth = Math.round((count / maxCount) * 100);
        const displayWidth = Math.max(8, barWidth); // Minimum 8% pour visibilité
        
        // Création élément
        const themeElement = document.createElement('li');
        themeElement.className = `theme-item ${sentiment}`;
        themeElement.setAttribute('role', 'listitem');
        themeElement.setAttribute('tabindex', '0');
        
        // Structure HTML
        themeElement.innerHTML = `
            <div class="theme-content">
                <div class="theme-bar">
                    <div class="theme-progress ${sentiment}"></div>
                </div>
                <span class="theme-name" title="${this.capitalizeFirstLetter(themeName)}">${this.capitalizeFirstLetter(themeName)}</span>
                <span class="theme-count">${count}</span>
            </div>
            ${headlines.length > 0 ? this.createTooltip(themeName, themeData, headlines) : ''}
        `;
        
        // IMPORTANT: Utiliser --pct au lieu de style inline
        const progressBar = themeElement.querySelector('.theme-progress');
        progressBar.style.setProperty('--pct', displayWidth + '%');
        
        // Event listeners
        if (headlines.length > 0) {
            this.setupThemeInteractions(themeElement);
        }
        
        return themeElement;
    },

    // Création du tooltip moderne
    createTooltip: function(themeName, themeData, headlines) {
        const [positivePct, negativePct, neutralPct] = themeData.s;
        
        return `
            <div class="theme-tooltip" role="tooltip" aria-hidden="true">
                <div class="tooltip-header">
                    <strong>${this.capitalizeFirstLetter(themeName)}</strong>
                    <span class="tooltip-close" aria-label="Fermer">×</span>
                </div>
                <div class="tooltip-content">
                    <div class="headlines-section">
                        <h4>Derniers titres</h4>
                        ${headlines.slice(0, 3).map(([title, url]) => `
                            <div class="headline-item" ${url ? `data-url="${url}"` : ''}>
                                ${title.length > 80 ? title.substring(0, 80) + '...' : title}
                            </div>
                        `).join('')}
                    </div>
                    <div class="sentiment-bar-container">
                        <div class="sentiment-bar">
                            <span class="positive" style="width:${positivePct}%" title="${positivePct}% positif"></span>
                            <span class="neutral" style="width:${neutralPct}%" title="${neutralPct}% neutre"></span>
                            <span class="negative" style="width:${negativePct}%" title="${negativePct}% négatif"></span>
                        </div>
                        <div class="sentiment-labels">
                            <span class="positive">Positif ${positivePct}%</span>
                            <span class="neutral">Neutre ${neutralPct}%</span>
                            <span class="negative">Négatif ${negativePct}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Tri par count
    sortThemesByCount: function(axisThemes, period) {
        const periodIndex = this.periods.indexOf(period);
        
        return Object.entries(axisThemes)
            .map(([name, data]) => {
                const count = data.c ? data.c[periodIndex] : 0;
                return [name, data, count];
            })
            .filter(([, , count]) => count > 0)
            .sort((a, b) => b[2] - a[2])
            .map(([name, data]) => [name, data]);
    },

    // Interactions thème
    setupThemeInteractions: function(themeElement) {
        // Click sur le thème
        themeElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tooltip-close')) {
                const tooltip = themeElement.querySelector('.theme-tooltip');
                if (tooltip) this.toggleTooltip(tooltip);
            }
        });
        
        // Fermeture du tooltip
        const closeBtn = themeElement.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tooltip = themeElement.querySelector('.theme-tooltip');
                if (tooltip) this.closeTooltip(tooltip);
            });
        }

        // Accessibilité clavier
        themeElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const tooltip = themeElement.querySelector('.theme-tooltip');
                if (tooltip) this.toggleTooltip(tooltip);
            }
        });
    },

    // Gestion tooltips
    toggleTooltip: function(tooltip) {
        const isOpen = tooltip.classList.contains('open');
        this.closeAllTooltips();
        
        if (!isOpen) {
            tooltip.classList.add('open');
            tooltip.setAttribute('aria-hidden', 'false');
            
            // Ajouter classe active au parent
            tooltip.closest('.theme-item').classList.add('active');
            
            // ✅ SUPPRIMÉ: Logique has-active-item retirée
            
            // Ajuster position si déborde
            requestAnimationFrame(() => {
                const rect = tooltip.getBoundingClientRect();
                if (rect.right > window.innerWidth - 20) {
                    tooltip.style.right = '0';
                    tooltip.style.left = 'auto';
                }
            });
        }
    },

    closeTooltip: function(tooltip) {
        tooltip.classList.remove('open');
        tooltip.setAttribute('aria-hidden', 'true');
        
        // Retirer classe active
        tooltip.closest('.theme-item')?.classList.remove('active');
        
        // ✅ SUPPRIMÉ: Logique has-active-item retirée
    },

    closeAllTooltips: function() {
        document.querySelectorAll('.theme-tooltip.open').forEach(tooltip => {
            this.closeTooltip(tooltip);
        });
    },

    // Sentiment dominant
    getDominantSentimentFromArray: function(sentimentArray) {
        if (!sentimentArray || sentimentArray.length < 3) return 'neutral';
        
        const [positive, negative, neutral] = sentimentArray;
        
        if (positive > negative && positive > neutral) return 'positive';
        if (negative > positive && negative > neutral) return 'negative';
        return 'neutral';
    },

    // État d'erreur
    renderErrorState: function() {
        const containers = ['macroeconomie-themes', 'secteurs-themes', 'regions-themes'];
        
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <div class="error-title">Erreur de chargement</div>
                        <div class="error-message">Impossible de charger les données</div>
                        <button class="retry-btn" onclick="ThemesVisualizer.loadThemesData()">
                            <i class="fas fa-redo"></i> Réessayer
                        </button>
                    </div>
                `;
            }
        });
    },

    // Mise à jour timestamp
    updateLastUpdated: function() {
        const element = document.getElementById('themes-last-updated');
        if (element && this.themesData && this.themesData.lastUpdated) {
            const date = new Date(this.themesData.lastUpdated);
            const formattedDate = date.toLocaleString('fr-FR', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit', 
                minute: '2-digit'
            });
            element.textContent = `Mise à jour: ${formattedDate}`;
        }
    },

    // Métriques performance
    logPerformanceMetrics: function(loadTime) {
        if (!this.themesData) return;
        
        const dataSize = JSON.stringify(this.themesData).length;
        const themeCount = Object.values(this.themesData.periods || {})
            .flatMap(period => Object.values(period))
            .flatMap(axis => Object.keys(axis)).length;
        
        console.log(`
📊 Performance Metrics v5.3:
⏱️  Load Time: ${loadTime}ms
📦 Data Size: ${(dataSize / 1024).toFixed(1)}KB  
🎯 Format: ${this.isCompactFormat ? 'Compact' : 'Legacy'}
📊 Themes: ${themeCount} total
🔍 Search: ${this.searchQuery || 'None'}
📋 Filter: ${this.showTopOnly ? 'Top 10' : 'All'}
📅 Active Period: ${this.activePeriod}`);
    },

    // Debug info
    showDebugInfo: function() {
        if (!this.themesData) return;
        
        console.table({
            version: '5.3-global-period-selector',
            format: this.isCompactFormat ? 'Compact' : 'Legacy',
            activePeriod: this.activePeriod,
            searchQuery: this.searchQuery || 'None',
            showTopOnly: this.showTopOnly,
            dataSize: `${(JSON.stringify(this.themesData).length / 1024).toFixed(1)}KB`,
            axisMax: this.themesData.axisMax
        });
    },

    // Utilitaires
    capitalizeFirstLetter: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1).replace(/_/g, ' ');
    }
};

// Auto-initialisation
document.addEventListener('DOMContentLoaded', function() {
    ThemesVisualizer.init();
});

// Exposition globale
window.ThemesVisualizer = ThemesVisualizer;
