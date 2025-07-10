/**
 * themes-visualizer.js v4.1 - Gestionnaire des thèmes dominants compact
 * Support format compact avec momentum, sparklines et performance optimisée
 */

const ThemesVisualizer = {
    // Périodes disponibles
    periods: ['weekly', 'monthly', 'quarterly'],
    activePeriod: 'weekly',
    themesData: null,
    loadStartTime: 0,

    // Initialisation
    init: function() {
        console.log('🚀 Initialisation ThemesVisualizer v4.1 (Format Compact)');
        this.loadStartTime = performance.now();
        this.loadThemesData();
        this.setupEventListeners();
    },

    // Chargement des données avec fallback automatique
    loadThemesData: function() {
        fetch('data/themes.json')
            .then(response => response.json())
            .then(data => {
                const loadTime = Math.round(performance.now() - this.loadStartTime);
                console.log(`✅ Données de thèmes chargées en ${loadTime}ms:`, data);
                
                this.themesData = data;
                this.detectFormat(data);
                this.renderThemes();
                this.updateLastUpdated();
                this.logPerformanceMetrics(loadTime);
            })
            .catch(error => {
                console.error('❌ Erreur lors du chargement des thèmes:', error);
                this.renderErrorState();
            });
    },

    // Détection automatique du format (legacy vs compact)
    detectFormat: function(data) {
        const isCompactFormat = data.periods && data.axisMax && data.config_version;
        console.log(`📊 Format détecté: ${isCompactFormat ? 'Compact v4.1' : 'Legacy'}`);
        
        if (!isCompactFormat) {
            console.warn('⚠️ Format legacy détecté, certaines fonctionnalités seront limitées');
        }
        
        this.isCompactFormat = isCompactFormat;
    },

    // Configuration des écouteurs d'événements
    setupEventListeners: function() {
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const period = e.target.dataset.period;
                this.changePeriod(period);
            });
        });

        // Event listener pour debug/monitoring
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'i') {
                this.showDebugInfo();
            }
        });
    },

    // Changement de période avec transition fluide
    changePeriod: function(period) {
        if (!this.periods.includes(period)) return;
        
        const previousPeriod = this.activePeriod;
        this.activePeriod = period;
        
        // Mise à jour de l'UI des boutons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        
        // Animation de transition
        this.animateTransition(previousPeriod, period);
        this.renderThemes();
        
        console.log(`🔄 Période changée: ${previousPeriod} → ${period}`);
    },

    // Animation de transition entre périodes
    animateTransition: function(from, to) {
        const containers = document.querySelectorAll('.theme-list');
        containers.forEach(container => {
            container.style.opacity = '0.7';
            container.style.transform = 'translateY(5px)';
            
            setTimeout(() => {
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
            }, 150);
        });
    },

    // Rendu des thèmes avec support format compact
    renderThemes: function() {
        if (!this.themesData) return;
        
        if (this.isCompactFormat) {
            this.renderThemesCompact();
        } else {
            this.renderThemesLegacy();
        }
    },

    // Rendu format compact v4.1
    renderThemesCompact: function() {
        const themes = this.themesData.periods[this.activePeriod];
        const axisMax = this.themesData.axisMax[this.activePeriod];
        
        if (!themes || !axisMax) {
            console.warn(`⚠️ Pas de données pour la période ${this.activePeriod}`);
            return;
        }
        
        console.log(`📈 Rendu thèmes compact pour ${this.activePeriod}:`, themes);
        
        // Rendu pour chaque axe avec les valeurs max précalculées
        this.renderThemeAxis('macroeconomie', themes.macroeconomics, axisMax.macroeconomics || 1);
        this.renderThemeAxis('fundamentals', themes.fundamentals, axisMax.fundamentals || 1);
        this.renderThemeAxis('secteurs', themes.sectors, axisMax.sectors || 1);
        this.renderThemeAxis('regions', themes.regions, axisMax.regions || 1);
    },

    // Rendu format legacy (fallback)
    renderThemesLegacy: function() {
        const themes = this.themesData.themes ? this.themesData.themes[this.activePeriod] : this.themesData[this.activePeriod];
        
        if (!themes) return;
        
        console.log(`📊 Rendu thèmes legacy pour ${this.activePeriod}:`, themes);
        
        // Rendu legacy sans axisMax (calcul dynamique)
        this.renderThemeAxis('macroeconomie', themes.macroeconomics);
        this.renderThemeAxis('secteurs', themes.sectors);  
        this.renderThemeAxis('regions', themes.regions);
    },

    // Rendu pour un axe spécifique (format compact optimisé)
    renderThemeAxis: function(axis, axisThemes, maxCount = null) {
        const container = document.getElementById(`${axis}-themes`);
        if (!container || !axisThemes) {
            this.renderEmptyState(container, axis);
            return;
        }
        
        container.innerHTML = '';
        
        // Calcul du maxCount si pas fourni (mode legacy)
        if (maxCount === null) {
            maxCount = this.calculateMaxCount(axisThemes);
        }
        
        // Tri intelligent des thèmes par pertinence
        const sortedThemes = this.sortThemesByRelevance(axisThemes);
        
        console.log(`🎯 Affichage ${sortedThemes.length} thèmes pour ${axis} (max: ${maxCount})`);
        
        // Rendu de chaque thème
        sortedThemes.forEach(([themeName, themeData]) => {
            const themeElement = this.createThemeElement(themeName, themeData, maxCount);
            container.appendChild(themeElement);
        });
        
        // Animation d'apparition échelonnée
        this.animateThemeAppearance(container);
    },

    // Tri intelligent par pertinence (count + momentum + sentiment)
    sortThemesByRelevance: function(axisThemes) {
        return Object.entries(axisThemes)
            .map(([name, data]) => {
                let score;
                
                if (this.isCompactFormat && data.c && data.m !== undefined) {
                    // Format compact: score = weekly_count + momentum_bonus + sentiment_bonus
                    const weeklyCount = data.c[0] || 0;
                    const momentum = data.m || 0;
                    const sentimentBonus = this.calculateSentimentBonus(data.s);
                    
                    score = weeklyCount + (Math.abs(momentum) * 0.3) + sentimentBonus;
                } else {
                    // Format legacy: score simple basé sur count
                    const count = typeof data === 'object' && 'count' in data ? data.count : 
                                 (typeof data === 'number' ? data : 0);
                    score = count;
                }
                
                return [name, data, score];
            })
            .sort((a, b) => b[2] - a[2]) // tri décroissant par score
            .filter(([, data, score]) => score > 0); // que les thèmes actifs
    },

    // Calcul bonus sentiment (plus de poids aux extrêmes)
    calculateSentimentBonus: function(sentimentArray) {
        if (!sentimentArray || sentimentArray.length < 3) return 0;
        
        const [positive, negative, neutral] = sentimentArray;
        const extremePositive = positive > 70 ? 2 : 0;
        const extremeNegative = negative > 70 ? 2 : 0;
        
        return extremePositive + extremeNegative;
    },

    // Création d'un élément thème avec toutes les fonctionnalités v4.1
    createThemeElement: function(themeName, themeData, maxCount) {
        const themeElement = document.createElement('li');
        themeElement.className = 'theme-item';
        
        if (this.isCompactFormat && themeData.c && themeData.s) {
            // Format compact v4.1
            return this.createCompactThemeElement(themeName, themeData, maxCount, themeElement);
        } else {
            // Format legacy
            return this.createLegacyThemeElement(themeName, themeData, maxCount, themeElement);
        }
    },

    // Création élément format compact avec toutes les nouvelles fonctionnalités
    createCompactThemeElement: function(themeName, themeData, maxCount, themeElement) {
        const [weeklyCount, monthlyCount, quarterlyCount] = themeData.c;
        const [positivePct, negativePct, neutralPct] = themeData.s;
        const momentum = themeData.m || 0;
        const headlines = themeData.h || [];
        
        // Déterminer le sentiment dominant
        const sentiment = this.getDominantSentimentFromArray([positivePct, negativePct, neutralPct]);
        
        // Calculer la largeur de la barre (basée sur weekly count)
        const barWidth = Math.max(5, Math.round((weeklyCount / maxCount) * 100));
        
        // Détection des tendances fortes
        const isSurging = momentum > 50;
        const isDropping = momentum < -30;
        const isStable = Math.abs(momentum) < 10;
        
        // Classes CSS dynamiques
        themeElement.className = `theme-item ${sentiment}`;
        if (isSurging) themeElement.classList.add('surging');
        if (isDropping) themeElement.classList.add('dropping');
        if (isStable) themeElement.classList.add('stable');
        
        // Construction HTML avancée
        themeElement.innerHTML = `
            <div class="theme-header">
                <span class="theme-name">${this.capitalizeFirstLetter(themeName)}</span>
                <div class="theme-indicators">
                    ${momentum !== 0 ? `<span class="momentum ${momentum > 0 ? 'up' : 'down'}" title="Momentum vs mois dernier">${momentum > 0 ? '+' : ''}${momentum}%</span>` : ''}
                    <span class="sentiment-indicator ${sentiment}" title="Sentiment: ${sentiment}"></span>
                    <span class="theme-count" title="Mentions cette semaine">${weeklyCount}</span>
                </div>
            </div>
            <div class="theme-bar">
                <div class="theme-progress ${sentiment}" style="width: ${barWidth}%"></div>
            </div>
            <div class="theme-sparkline" title="Évolution: Trimestre → Mois → Semaine">
                <span class="count-timeline">${quarterlyCount} → ${monthlyCount} → ${weeklyCount}</span>
                ${this.renderMiniSparkline([quarterlyCount, monthlyCount, weeklyCount])}
            </div>
            ${headlines.length > 0 ? `
                <div class="theme-tooltip">
                    <div class="headlines">
                        <div class="headlines-title">📰 Actualités récentes:</div>
                        ${headlines.map(([title, url]) => `
                            <div class="headline" title="${title}">
                                ${title.length > 60 ? title.substring(0, 60) + '...' : title}
                            </div>
                        `).join('')}
                    </div>
                    <div class="sentiment-distribution" title="Distribution sentiment">
                        <span class="positive" style="width:${positivePct}%" title="Positif: ${positivePct}%"></span>
                        <span class="neutral" style="width:${neutralPct}%" title="Neutre: ${neutralPct}%"></span>
                        <span class="negative" style="width:${negativePct}%" title="Négatif: ${negativePct}%"></span>
                    </div>
                    <div class="theme-stats">
                        <small>📊 Total période: ${weeklyCount + monthlyCount + quarterlyCount} mentions</small>
                    </div>
                </div>
            ` : ''}
        `;
        
        return themeElement;
    },

    // Rendu mini-sparkline SVG
    renderMiniSparkline: function(values) {
        if (values.every(v => v === 0)) return '';
        
        const max = Math.max(...values);
        if (max === 0) return '';
        
        const points = values.map((v, i) => `${i * 10},${20 - (v / max * 15)}`).join(' ');
        
        return `
            <svg class="mini-sparkline" width="30" height="20" viewBox="0 0 30 20">
                <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
            </svg>
        `;
    },

    // Création élément format legacy (compatibilité)
    createLegacyThemeElement: function(themeName, themeData, maxCount, themeElement) {
        const isFullObject = typeof themeData === 'object' && themeData !== null;
        const count = isFullObject && 'count' in themeData ? themeData.count : 
                     (typeof themeData === 'number' ? themeData : 0);
        const sentimentDist = isFullObject && 'sentiment_distribution' in themeData ? themeData.sentiment_distribution : null;
        const sentiment = this.getDominantSentiment(sentimentDist);
        
        const barWidth = this.calculateProgressWidth(count, maxCount);
        
        themeElement.className = `theme-item ${sentiment}`;
        themeElement.innerHTML = `
            <div class="theme-header">
                <span class="theme-name">${this.capitalizeFirstLetter(themeName)}</span>
                <span class="sentiment-indicator ${sentiment}"></span>
                <span class="theme-count">${count}</span>
            </div>
            <div class="theme-bar">
                <div class="theme-progress ${sentiment}" style="width: ${barWidth}%"></div>
            </div>
            ${sentimentDist ? `
                <div class="theme-tooltip">
                    <div class="sentiment-distribution">
                        <span class="positive" style="width:${sentimentDist.positive || 0}%"></span>
                        <span class="neutral" style="width:${sentimentDist.neutral || 0}%"></span>
                        <span class="negative" style="width:${sentimentDist.negative || 0}%"></span>
                    </div>
                </div>
            ` : ''}
        `;
        
        return themeElement;
    },

    // Animation d'apparition échelonnée
    animateThemeAppearance: function(container) {
        const items = container.querySelectorAll('.theme-item');
        items.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, index * 50);
        });
    },

    // État vide pour un axe
    renderEmptyState: function(container, axis) {
        if (!container) return;
        
        container.innerHTML = `
            <li class="theme-item empty-state">
                <div class="empty-message">
                    <i class="fas fa-info-circle"></i>
                    <span>Aucun thème ${axis} pour cette période</span>
                </div>
            </li>
        `;
    },

    // État d'erreur général
    renderErrorState: function() {
        const containers = ['macroeconomie-themes', 'secteurs-themes', 'regions-themes', 'fundamentals-themes'];
        
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = `
                    <li class="theme-item error-state">
                        <div class="error-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>Erreur de chargement</span>
                            <button onclick="ThemesVisualizer.loadThemesData()" class="retry-btn">
                                <i class="fas fa-redo"></i> Réessayer
                            </button>
                        </div>
                    </li>
                `;
            }
        });
    },

    // Calcul maxCount dynamique (mode legacy)
    calculateMaxCount: function(axisThemes) {
        const counts = Object.values(axisThemes).map(data => {
            if (typeof data === 'object' && 'count' in data) return data.count;
            if (typeof data === 'number') return data;
            return 0;
        });
        
        return Math.max(...counts, 1);
    },

    // Calcul largeur barre proportionnelle
    calculateProgressWidth: function(count, maxCount) {
        if (maxCount <= 0) return 5;
        return Math.max(5, Math.round((count / maxCount) * 100));
    },

    // Sentiment dominant depuis distribution object
    getDominantSentiment: function(sentimentDist) {
        if (!sentimentDist) return 'neutral';
        
        const { positive, negative, neutral } = sentimentDist;
        
        if (positive > negative && positive > neutral) return 'positive';
        if (negative > positive && negative > neutral) return 'negative';
        return 'neutral';
    },

    // Sentiment dominant depuis array [pos, neg, neu]
    getDominantSentimentFromArray: function(sentimentArray) {
        if (!sentimentArray || sentimentArray.length < 3) return 'neutral';
        
        const [positive, negative, neutral] = sentimentArray;
        
        if (positive > negative && positive > neutral) return 'positive';
        if (negative > positive && negative > neutral) return 'negative';
        return 'neutral';
    },

    // Mise à jour timestamp dernière actualisation
    updateLastUpdated: function() {
        const element = document.getElementById('themes-last-updated');
        if (element && this.themesData && this.themesData.lastUpdated) {
            const date = new Date(this.themesData.lastUpdated);
            element.textContent = date.toLocaleString('fr-FR', { 
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    },

    // Log métriques de performance
    logPerformanceMetrics: function(loadTime) {
        if (!this.themesData) return;
        
        const dataSize = JSON.stringify(this.themesData).length;
        const analysisCount = this.themesData.analysisCount || 0;
        const version = this.themesData.config_version || 'unknown';
        
        console.log(`📊 Métriques ThemesVisualizer v4.1:
        ⏱️  Temps chargement: ${loadTime}ms
        📦 Taille données: ${(dataSize / 1024).toFixed(1)}KB  
        📄 Articles analysés: ${analysisCount}
        🏷️  Version config: ${version}
        🎯 Format: ${this.isCompactFormat ? 'Compact' : 'Legacy'}
        📈 Périodes disponibles: ${this.periods.join(', ')}`);
    },

    // Debug info (Ctrl+I)
    showDebugInfo: function() {
        if (!this.themesData) return;
        
        const info = {
            version: '4.1-compact',
            format: this.isCompactFormat ? 'Compact' : 'Legacy',
            activePeriod: this.activePeriod,
            dataSize: `${(JSON.stringify(this.themesData).length / 1024).toFixed(1)}KB`,
            lastUpdated: this.themesData.lastUpdated,
            periodsAvailable: Object.keys(this.themesData.periods || {}),
            axisMaxValues: this.themesData.axisMax?.[this.activePeriod] || 'N/A'
        };
        
        console.table(info);
        console.log('📊 Données complètes:', this.themesData);
    },

    // Utilitaire capitalisation
    capitalizeFirstLetter: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1).replace(/_/g, ' ');
    }
};

// Auto-initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    ThemesVisualizer.init();
    
    // Monitoring performance global
    console.log('🎯 ThemesVisualizer v4.1 prêt - Format compact avec momentum, sparklines et animations');
});

// Exposition globale pour debug
window.ThemesVisualizer = ThemesVisualizer;