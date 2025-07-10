/**
 * themes-visualizer.js v4.1 - Gestionnaire des thèmes dominants Investor-Grade
 * UX optimisée: lecture en Z, chips, sparklines compactes, accessibilité complète
 */

const ThemesVisualizer = {
    // Configuration
    periods: ['weekly', 'monthly', 'quarterly'],
    activePeriod: 'weekly',
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
        console.log('🎯 Initialisation ThemesVisualizer v4.1 - Investor-Grade UX');
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
        console.log(`📊 Format: ${this.isCompactFormat ? 'Compact v4.1' : 'Legacy'}`);
    },

    // Configuration des événements
    setupEventListeners: function() {
        // Boutons de période
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.changePeriod(e.target.dataset.period);
            });
        });

        // Toggle Top 10 / Tous
        this.createTopToggle();
        
        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'i') this.showDebugInfo();
            if (e.key === 'Escape') this.closeAllTooltips();
        });
    },

    // Création du toggle Top 10 / Tous
    createTopToggle: function() {
        const periodSelector = document.querySelector('.period-selector');
        if (!periodSelector) return;
        
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
        
        periodSelector.appendChild(topToggle);
    },

    // Configuration de la recherche
    setupSearch: function() {
        const searchContainer = document.querySelector('.themes-dominant-container h2');
        if (!searchContainer) return;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search themes...';
        searchInput.className = 'theme-search';
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderThemes();
        });
        
        searchContainer.appendChild(searchInput);
    },

    // Configuration accessibilité
    setupAccessibility: function() {
        // Ajouter les rôles ARIA
        document.querySelectorAll('.theme-list').forEach(list => {
            list.setAttribute('role', 'list');
            list.setAttribute('aria-label', 'Liste des thèmes dominants');
        });
    },

    // Changement de période avec transition
    changePeriod: function(period) {
        if (!this.periods.includes(period)) return;
        
        const previousPeriod = this.activePeriod;
        this.activePeriod = period;
        
        // Mise à jour UI boutons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        
        // Transition fluide
        this.animateTransition();
        this.renderThemes();
        
        console.log(`🔄 Période: ${previousPeriod} → ${period}`);
    },

    // Animation de transition performante
    animateTransition: function() {
        const containers = document.querySelectorAll('.theme-list');
        containers.forEach(container => {
            container.style.opacity = '0.6';
            container.style.transform = 'translateY(4px)';
            
            requestAnimationFrame(() => {
                container.style.transition = 'all 0.2s ease';
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
            });
        });
    },

    // Rendu principal avec format detection
    renderThemes: function() {
        if (!this.themesData) return;
        
        if (this.isCompactFormat) {
            this.renderThemesCompact();
        } else {
            this.renderThemesLegacy();
        }
    },

    // Rendu format compact optimisé
    renderThemesCompact: function() {
        const themes = this.themesData.periods[this.activePeriod];
        const axisMax = this.themesData.axisMax[this.activePeriod];
        
        if (!themes || !axisMax) return;
        
        // Rendu avec légendes
        this.renderThemeAxisWithLegend('macroeconomie', 'Macroeconomics', themes.macroeconomics, axisMax.macroeconomics, '📈');
        this.renderThemeAxisWithLegend('fundamentals', 'Fundamentals', themes.fundamentals, axisMax.fundamentals, '🔢');
        this.renderThemeAxisWithLegend('secteurs', 'Sectors', themes.sectors, axisMax.sectors, '🏭');
        this.renderThemeAxisWithLegend('regions', 'Regions', themes.regions, axisMax.regions, '🌍');
    },

    // Rendu axe avec légende investor-grade
    renderThemeAxisWithLegend: function(axis, title, axisThemes, maxCount, icon) {
        const container = document.getElementById(`${axis}-themes`);
        if (!container || !axisThemes) {
            this.renderEmptyState(container, axis);
            return;
        }
        
        // Ajouter la légende si pas déjà présente
        this.addAxisLegend(container, title, icon);
        
        // Tri et filtrage
        let sortedThemes = this.sortThemesByRelevance(axisThemes);
        
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
        
        // Vider le container (conserver la légende)
        const existingItems = container.querySelectorAll('.theme-item');
        existingItems.forEach(item => item.remove());
        
        // Rendu des thèmes
        sortedThemes.forEach(([themeName, themeData]) => {
            const themeElement = this.createInvestorGradeTheme(themeName, themeData, maxCount);
            container.appendChild(themeElement);
        });
        
        // Animation d'apparition performante
        this.animateThemeAppearance(container);
        
        // Footer avec actions
        this.addAxisFooter(container, axis, sortedThemes.length);
    },

    // Ajout légende axe
    addAxisLegend: function(container, title, icon) {
        if (container.querySelector('.axis-legend')) return;
        
        const legend = document.createElement('div');
        legend.className = 'axis-legend';
        legend.innerHTML = `
            <div class="legend-header">
                <span class="legend-icon">${icon}</span>
                <span class="legend-title">${title}</span>
            </div>
            <div class="legend-help">
                <span class="legend-item">📊 Weekly mentions</span>
                <span class="legend-item">🔄 MoM change</span>
            </div>
        `;
        
        container.insertBefore(legend, container.firstChild);
    },

    // Création thème investor-grade avec lecture en Z
    createInvestorGradeTheme: function(themeName, themeData, maxCount) {
        const [weeklyCount, monthlyCount, quarterlyCount] = themeData.c;
        const [positivePct, negativePct, neutralPct] = themeData.s;
        const momentum = themeData.m || 0;
        const headlines = themeData.h || [];
        
        // Calculs UX
        const sentiment = this.getDominantSentimentFromArray([positivePct, negativePct, neutralPct]);
        const barWidth = Math.round((weeklyCount / maxCount) * 100);
        const minWidth = 6;
        const displayWidth = Math.max(minWidth, barWidth);
        
        // Détection tendances
        const isSurging = momentum > 50;
        const isDropping = momentum < -30;
        
        // Création élément avec accessibilité
        const themeElement = document.createElement('li');
        themeElement.className = `theme-item ${sentiment}`;
        themeElement.setAttribute('role', 'listitem');
        themeElement.setAttribute('tabindex', '0');
        themeElement.setAttribute('aria-label', 
            `${themeName} - ${weeklyCount} weekly mentions, ${momentum > 0 ? '+' : ''}${momentum}% MoM change, ${sentiment} sentiment`
        );
        
        if (isSurging) themeElement.classList.add('surging');
        if (isDropping) themeElement.classList.add('dropping');
        
        // HTML structure optimisée (lecture en Z)
        themeElement.innerHTML = `
            <div class="theme-layout">
                <!-- Colonne 1: Barre + Count -->
                <div class="col-activity">
                    <div class="theme-bar">
                        <div class="theme-progress ${sentiment}" style="width: ${displayWidth}%"></div>
                    </div>
                    <span class="count chip" title="Weekly mentions">${weeklyCount}</span>
                </div>
                
                <!-- Colonne 2: Nom + Sparkline -->
                <div class="col-name">
                    <span class="theme-name">${this.capitalizeFirstLetter(themeName)}</span>
                    <div class="theme-sparkline">
                        ${this.renderCompactSparkline([quarterlyCount, monthlyCount, weeklyCount])}
                    </div>
                </div>
                
                <!-- Colonne 3: Momentum + Action -->
                <div class="col-momentum">
                    ${momentum !== 0 ? `<span class="momentum chip ${momentum > 0 ? 'up' : 'down'}" title="MoM change">${momentum > 0 ? '+' : ''}${momentum}%</span>` : ''}
                    <button class="info-btn" aria-label="View ${themeName} details" title="View details">
                        <i class="fas fa-ellipsis-h"></i>
                    </button>
                </div>
            </div>
            
            <!-- Tooltip riche -->
            ${headlines.length > 0 ? `
                <div class="theme-tooltip" role="tooltip">
                    <div class="tooltip-header">
                        <strong>${this.capitalizeFirstLetter(themeName)}</strong>
                        <span class="tooltip-close">×</span>
                    </div>
                    <div class="tooltip-content">
                        <div class="headlines-section">
                            <h4>Latest Headlines</h4>
                            ${headlines.map(([title, url]) => `
                                <div class="headline-item">
                                    ${title.length > 60 ? title.substring(0, 60) + '...' : title}
                                </div>
                            `).join('')}
                        </div>
                        <div class="sentiment-section">
                            <h4>Sentiment Distribution</h4>
                            <div class="sentiment-bar">
                                <span class="positive" style="width:${positivePct}%" title="Positive: ${positivePct}%"></span>
                                <span class="neutral" style="width:${neutralPct}%" title="Neutral: ${neutralPct}%"></span>
                                <span class="negative" style="width:${negativePct}%" title="Negative: ${negativePct}%"></span>
                            </div>
                        </div>
                        <div class="stats-section">
                            <small>📊 Total mentions: ${weeklyCount + monthlyCount + quarterlyCount}</small>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
        
        // Event listeners pour interaction
        this.setupThemeInteractions(themeElement);
        
        return themeElement;
    },

    // Sparkline compacte 24x12px
    renderCompactSparkline: function(values) {
        if (values.every(v => v === 0)) return '<span class="no-data">—</span>';
        
        const h = 12, w = 24;
        const max = Math.max(...values);
        if (max === 0) return '<span class="no-data">—</span>';
        
        const points = values.map((v, i) => `${i * w/2},${h - (h * v/max)}`).join(' ');
        
        return `
            <svg class="mini-sparkline" width="${w}" height="${h}" aria-label="Trend: ${values.join('/')}" title="Quarterly → Monthly → Weekly">
                <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>
        `;
    },

    // Configuration interactions thème
    setupThemeInteractions: function(themeElement) {
        const infoBtn = themeElement.querySelector('.info-btn');
        const tooltip = themeElement.querySelector('.theme-tooltip');
        
        if (infoBtn && tooltip) {
            // Clic bouton info
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTooltip(tooltip);
            });
            
            // Fermeture tooltip
            const closeBtn = tooltip.querySelector('.tooltip-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.closeTooltip(tooltip);
                });
            }
        }
        
        // Accessibilité clavier
        themeElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (tooltip) this.toggleTooltip(tooltip);
            }
        });
    },

    // Gestion tooltips
    toggleTooltip: function(tooltip) {
        const isOpen = tooltip.classList.contains('open');
        
        // Fermer tous les autres tooltips
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

    // Animation d'apparition optimisée
    animateThemeAppearance: function(container) {
        const items = container.querySelectorAll('.theme-item');
        
        items.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(8px)';
            
            requestAnimationFrame(() => {
                item.style.transition = `all 0.3s ease ${index * 40}ms`;
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            });
        });
    },

    // Footer avec actions
    addAxisFooter: function(container, axis, themeCount) {
        // Supprimer ancien footer
        const oldFooter = container.querySelector('.axis-footer');
        if (oldFooter) oldFooter.remove();
        
        const footer = document.createElement('div');
        footer.className = 'axis-footer';
        footer.innerHTML = `
            <div class="footer-stats">
                <span class="theme-count-display">${themeCount} themes</span>
                <span class="period-display">${this.activePeriod}</span>
            </div>
            <div class="footer-actions">
                <button class="action-btn" onclick="ThemesVisualizer.exportAxisData('${axis}')" title="Export data">
                    <i class="fas fa-download"></i>
                </button>
                <button class="action-btn" onclick="ThemesVisualizer.showAdvancedAnalysis('${axis}')" title="Advanced analysis">
                    <i class="fas fa-chart-line"></i>
                </button>
            </div>
        `;
        
        container.appendChild(footer);
    },

    // Tri par pertinence optimisé
    sortThemesByRelevance: function(axisThemes) {
        return Object.entries(axisThemes)
            .map(([name, data]) => {
                let score = 0;
                
                if (this.isCompactFormat && data.c) {
                    const weeklyCount = data.c[0] || 0;
                    const momentum = Math.abs(data.m || 0);
                    const sentimentBonus = this.calculateSentimentBonus(data.s);
                    
                    score = weeklyCount + (momentum * 0.3) + sentimentBonus;
                } else {
                    score = typeof data === 'object' && 'count' in data ? data.count : 
                           (typeof data === 'number' ? data : 0);
                }
                
                return [name, data, score];
            })
            .sort((a, b) => b[2] - a[2])
            .filter(([, , score]) => score > 0);
    },

    // Bonus sentiment pour tri
    calculateSentimentBonus: function(sentimentArray) {
        if (!sentimentArray || sentimentArray.length < 3) return 0;
        
        const [positive, negative, neutral] = sentimentArray;
        return (positive > 70 ? 2 : 0) + (negative > 70 ? 2 : 0);
    },

    // Sentiment dominant depuis array
    getDominantSentimentFromArray: function(sentimentArray) {
        if (!sentimentArray || sentimentArray.length < 3) return 'neutral';
        
        const [positive, negative, neutral] = sentimentArray;
        
        if (positive > negative && positive > neutral) return 'positive';
        if (negative > positive && negative > neutral) return 'negative';
        return 'neutral';
    },

    // État vide stylé
    renderEmptyState: function(container, axis) {
        if (!container) return;
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">No ${axis} themes</div>
                <div class="empty-subtitle">for this period</div>
            </div>
        `;
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
                        <div class="error-title">Loading Error</div>
                        <button class="retry-btn" onclick="ThemesVisualizer.loadThemesData()">
                            <i class="fas fa-redo"></i> Retry
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
        const analysisCount = this.themesData.analysisCount || 0;
        
        console.log(`📊 Performance Metrics:
        ⏱️  Load Time: ${loadTime}ms
        📦 Data Size: ${(dataSize / 1024).toFixed(1)}KB  
        📄 Articles: ${analysisCount}
        🎯 Format: ${this.isCompactFormat ? 'Compact' : 'Legacy'}
        🔍 Search: ${this.searchQuery || 'None'}
        📋 Filter: ${this.showTopOnly ? 'Top 10' : 'All'}`);
    },

    // Actions d'export
    exportAxisData: function(axis) {
        console.log(`📤 Export data for axis: ${axis}`);
        // TODO: Implémenter export CSV/JSON
    },

    // Analyse avancée
    showAdvancedAnalysis: function(axis) {
        console.log(`📈 Advanced analysis for axis: ${axis}`);
        // TODO: Implémenter analyse avancée
    },

    // Debug info
    showDebugInfo: function() {
        if (!this.themesData) return;
        
        console.table({
            version: '4.1-investor-grade',
            format: this.isCompactFormat ? 'Compact' : 'Legacy',
            activePeriod: this.activePeriod,
            searchQuery: this.searchQuery || 'None',
            showTopOnly: this.showTopOnly,
            dataSize: `${(JSON.stringify(this.themesData).length / 1024).toFixed(1)}KB`
        });
    },

    // Utilitaires
    capitalizeFirstLetter: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1).replace(/_/g, ' ');
    },

    // Fallback legacy (compatibilité)
    renderThemesLegacy: function() {
        console.warn('⚠️ Legacy format detected - limited functionality');
        // Code legacy simplifié...
    }
};

// Auto-initialisation
document.addEventListener('DOMContentLoaded', function() {
    ThemesVisualizer.init();
    console.log('🎯 ThemesVisualizer v4.1 - Investor-Grade UX Ready');
});

// Exposition globale
window.ThemesVisualizer = ThemesVisualizer;