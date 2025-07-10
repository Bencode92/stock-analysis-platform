/**
 * themes-visualizer.js v4.2 - Gestionnaire des thèmes dominants Investor-Grade
 * UX optimisée: vue 3 périodes sans momentum
 */

const ThemesVisualizer = {
    // Configuration
    periods: ['weekly', 'monthly', 'quarterly'],
    activePeriod: null, // Changé: affiche toutes les périodes
    themesData: null,
    loadStartTime: 0,
    showTopOnly: false,
    searchQuery: '',
    
    // Couleurs finance cohérentes
    colors: {
        positive: '#2ecc71',
        negative: '#e74c3c', 
        neutral: '#95a5a6',
        activity: '#00d8ff',
        background: 'linear-gradient(135deg, #0d1117 0%, #0b1321 100%)'
    },

    // Initialisation
    init: function() {
        console.log('🎯 Initialisation ThemesVisualizer v4.2 - Vue 3 périodes');
        this.loadStartTime = performance.now();
        this.loadThemesData();
        this.setupEventListeners();
        this.setupSearch();
        this.setupAccessibility();
    },

    // Chargement des données avec métriques
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

    // Détection format avec fallback intelligent
    detectFormat: function(data) {
        this.isCompactFormat = !!(data.periods && data.axisMax && data.config_version);
        console.log(`📊 Format: ${this.isCompactFormat ? 'Compact v4.2' : 'Legacy'}`);
    },

    // Configuration des événements - MODIFIÉ: plus de sélecteur de période
    setupEventListeners: function() {
        // Toggle Top 10 / Tous
        this.createTopToggle();
        
        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'i') this.showDebugInfo();
            if (e.key === 'Escape') this.closeAllTooltips();
        });
    },

    // Création du toggle Top 10 / Tous - MODIFIÉ: positionnement
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

    // Configuration de la recherche
    setupSearch: function() {
        const searchContainer = document.querySelector('.themes-dominant-container h2');
        if (!searchContainer) return;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Rechercher thèmes...';
        searchInput.className = 'theme-search';
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderThemes();
        });
        
        searchContainer.appendChild(searchInput);
    },

    // Configuration accessibilité
    setupAccessibility: function() {
        document.querySelectorAll('.theme-list').forEach(list => {
            list.setAttribute('role', 'list');
            list.setAttribute('aria-label', 'Liste des thèmes dominants');
        });
    },

    // Rendu principal - MODIFIÉ
    renderThemes: function() {
        if (!this.themesData || !this.isCompactFormat) return;
        
        this.renderAxis('macroeconomie', 'Macroéconomie', '📈');
        this.renderAxis('fundamentals', 'Fondamentaux', '🔢');
        this.renderAxis('secteurs', 'Secteurs', '🏭');
        this.renderAxis('regions', 'Régions', '🌍');
    },

    // NOUVEAU: Rendu d'un axe avec 3 périodes
    renderAxis: function(axisId, axisTitle, icon) {
        const container = document.getElementById(`${axisId}-themes`);
        if (!container) return;
        
        // Structure 3 colonnes
        container.innerHTML = `
            <div class="axis-header">
                <span class="axis-icon">${icon}</span>
                <span class="axis-title">${axisTitle}</span>
            </div>
            <div class="periods-grid">
                <div class="period-column" data-period="weekly">
                    <h4 class="period-title">Hebdomadaire</h4>
                    <ul class="theme-list" id="${axisId}-weekly"></ul>
                </div>
                <div class="period-column" data-period="monthly">
                    <h4 class="period-title">Mensuel</h4>
                    <ul class="theme-list" id="${axisId}-monthly"></ul>
                </div>
                <div class="period-column" data-period="quarterly">
                    <h4 class="period-title">Trimestriel</h4>
                    <ul class="theme-list" id="${axisId}-quarterly"></ul>
                </div>
            </div>
        `;
        
        // Rendu de chaque période
        this.periods.forEach(period => {
            this.renderPeriodThemes(axisId, period);
        });
    },

    // NOUVEAU: Rendu des thèmes pour une période
    renderPeriodThemes: function(axisId, period) {
        const periodData = this.themesData.periods[period];
        const axisMax = this.themesData.axisMax[period];
        
        if (!periodData || !axisMax) return;
        
        const axisThemes = periodData[axisId === 'macroeconomie' ? 'macroeconomics' : 
                                     axisId === 'secteurs' ? 'sectors' : 
                                     axisId];
        
        if (!axisThemes) return;
        
        const container = document.getElementById(`${axisId}-${period}`);
        if (!container) return;
        
        // Tri et filtrage
        let sortedThemes = this.sortThemesByCount(axisThemes, period);
        
        // Filtrage par recherche
        if (this.searchQuery) {
            sortedThemes = sortedThemes.filter(([name]) => 
                name.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // Limite Top 10 si activée
        if (this.showTopOnly) {
            sortedThemes = sortedThemes.slice(0, 10);
        }
        
        // Rendu des thèmes
        sortedThemes.forEach(([themeName, themeData]) => {
            const themeElement = this.createPeriodTheme(themeName, themeData, period, axisMax[axisId]);
            container.appendChild(themeElement);
        });
        
        // Animation
        this.animateThemeAppearance(container);
    },

    // NOUVEAU: Création d'un thème pour une période spécifique
    createPeriodTheme: function(themeName, themeData, period, maxCount) {
        const periodIndex = this.periods.indexOf(period);
        const count = themeData.c[periodIndex];
        const [positivePct, negativePct, neutralPct] = themeData.s;
        const headlines = themeData.h || [];
        
        // Calculs
        const sentiment = this.getDominantSentimentFromArray([positivePct, negativePct, neutralPct]);
        const barWidth = Math.round((count / maxCount) * 100);
        const displayWidth = Math.max(6, barWidth);
        
        // Création élément
        const themeElement = document.createElement('li');
        themeElement.className = `theme-item ${sentiment}`;
        themeElement.setAttribute('role', 'listitem');
        themeElement.setAttribute('tabindex', '0');
        
        themeElement.innerHTML = `
            <div class="theme-content">
                <div class="theme-bar">
                    <div class="theme-progress ${sentiment}" style="width: ${displayWidth}%"></div>
                </div>
                <span class="theme-name">${this.capitalizeFirstLetter(themeName)}</span>
                <span class="theme-count">${count}</span>
            </div>
            ${headlines.length > 0 ? this.createTooltip(themeName, themeData, headlines) : ''}
        `;
        
        // Event listeners
        if (headlines.length > 0) {
            this.setupThemeInteractions(themeElement);
        }
        
        return themeElement;
    },

    // NOUVEAU: Création tooltip simplifiée
    createTooltip: function(themeName, themeData, headlines) {
        const [positivePct, negativePct, neutralPct] = themeData.s;
        
        return `
            <div class="theme-tooltip" role="tooltip">
                <div class="tooltip-header">
                    <strong>${this.capitalizeFirstLetter(themeName)}</strong>
                    <span class="tooltip-close">×</span>
                </div>
                <div class="tooltip-content">
                    <div class="headlines-section">
                        <h4>Derniers titres</h4>
                        ${headlines.map(([title]) => `
                            <div class="headline-item">
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
                            <span class="positive">${positivePct}%</span>
                            <span class="neutral">${neutralPct}%</span>
                            <span class="negative">${negativePct}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // MODIFIÉ: Tri simplifié par count
    sortThemesByCount: function(axisThemes, period) {
        const periodIndex = this.periods.indexOf(period);
        
        return Object.entries(axisThemes)
            .map(([name, data]) => {
                const count = data.c ? data.c[periodIndex] : 0;
                return [name, data, count];
            })
            .filter(([, , count]) => count > 0)
            .sort((a, b) => b[2] - a[2]);
    },

    // Configuration interactions thème
    setupThemeInteractions: function(themeElement) {
        themeElement.addEventListener('click', () => {
            const tooltip = themeElement.querySelector('.theme-tooltip');
            if (tooltip) this.toggleTooltip(tooltip);
        });
        
        const closeBtn = themeElement.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tooltip = themeElement.querySelector('.theme-tooltip');
                if (tooltip) this.closeTooltip(tooltip);
            });
        }
    },

    // Gestion tooltips
    toggleTooltip: function(tooltip) {
        const isOpen = tooltip.classList.contains('open');
        this.closeAllTooltips();
        
        if (!isOpen) {
            tooltip.classList.add('open');
            tooltip.setAttribute('aria-hidden', 'false');
        }
    },

    closeTooltip: function(tooltip) {
        tooltip.classList.remove('open');
        tooltip.setAttribute('aria-hidden', 'true');
    },

    closeAllTooltips: function() {
        document.querySelectorAll('.theme-tooltip.open').forEach(tooltip => {
            this.closeTooltip(tooltip);
        });
    },

    // Animation d'apparition
    animateThemeAppearance: function(container) {
        const items = container.querySelectorAll('.theme-item');
        
        items.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(8px)';
            
            requestAnimationFrame(() => {
                item.style.transition = `all 0.3s ease ${index * 30}ms`;
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            });
        });
    },

    // Sentiment dominant depuis array
    getDominantSentimentFromArray: function(sentimentArray) {
        if (!sentimentArray || sentimentArray.length < 3) return 'neutral';
        
        const [positive, negative, neutral] = sentimentArray;
        
        if (positive > negative && positive > neutral) return 'positive';
        if (negative > positive && negative > neutral) return 'negative';
        return 'neutral';
    },

    // État d'erreur
    renderErrorState: function() {
        const containers = ['macroeconomie-themes', 'secteurs-themes', 'regions-themes', 'fundamentals-themes'];
        
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <div class="error-title">Erreur de chargement</div>
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
            element.textContent = date.toLocaleString('fr-FR', { 
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }
    },

    // Métriques performance
    logPerformanceMetrics: function(loadTime) {
        if (!this.themesData) return;
        
        const dataSize = JSON.stringify(this.themesData).length;
        
        console.log(`📊 Performance Metrics:
        ⏱️  Load Time: ${loadTime}ms
        📦 Data Size: ${(dataSize / 1024).toFixed(1)}KB  
        🎯 Format: v4.2 - 3 périodes
        🔍 Search: ${this.searchQuery || 'None'}
        📋 Filter: ${this.showTopOnly ? 'Top 10' : 'All'}`);
    },

    // Debug info
    showDebugInfo: function() {
        if (!this.themesData) return;
        
        console.table({
            version: '4.2-3periods',
            format: this.isCompactFormat ? 'Compact' : 'Legacy',
            searchQuery: this.searchQuery || 'None',
            showTopOnly: this.showTopOnly,
            dataSize: `${(JSON.stringify(this.themesData).length / 1024).toFixed(1)}KB`
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
    console.log('🎯 ThemesVisualizer v4.2 - Vue 3 périodes activée');
});

// Exposition globale
window.ThemesVisualizer = ThemesVisualizer;