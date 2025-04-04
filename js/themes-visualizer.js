// Gestionnaire des thèmes dominants
const ThemesVisualizer = {
    // Périodes disponibles
    periods: ['weekly', 'monthly', 'quarterly'],
    activePeriod: 'weekly',
    themesData: null,

    // Initialisation
    init: function() {
        this.loadThemesData();
        this.setupEventListeners();
    },

    // Chargement des données
    loadThemesData: function() {
        fetch('data/themes.json')
            .then(response => response.json())
            .then(data => {
                this.themesData = data;
                this.renderThemes();
                this.updateLastUpdated();
            })
            .catch(error => {
                console.error('Erreur lors du chargement des thèmes:', error);
                // Fallback à des données de démo si nécessaire
            });
    },

    // Configuration des écouteurs d'événements
    setupEventListeners: function() {
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const period = e.target.dataset.period;
                this.changePeriod(period);
            });
        });
    },

    // Changement de période
    changePeriod: function(period) {
        if (this.periods.includes(period)) {
            this.activePeriod = period;
            
            // Mise à jour de l'UI
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.period === period);
            });
            
            this.renderThemes();
        }
    },

    // Rendu des thèmes
    renderThemes: function() {
        if (!this.themesData) return;
        
        const themes = this.themesData.themes[this.activePeriod];
        
        // Rendu pour chaque axe
        this.renderThemeAxis('macroeconomie', themes.macroeconomie);
        this.renderThemeAxis('secteurs', themes.secteurs);
        this.renderThemeAxis('regions', themes.regions);
    },

    // Rendu pour un axe spécifique (macroéconomie, secteurs, régions)
    renderThemeAxis: function(axis, axisThemes) {
        const container = document.getElementById(`${axis}-themes`);
        if (!container) return;
        
        container.innerHTML = '';
        
        // Tri des thèmes par nombre d'occurrences
        const sortedThemes = Object.entries(axisThemes)
            .sort(([,a], [,b]) => b.count - a.count)
            .slice(0, 5); // Limiter aux 5 premiers
        
        sortedThemes.forEach(([themeName, themeData]) => {
            // Calculer le sentiment dominant
            const sentiment = this.getDominantSentiment(themeData.sentiment_distribution);
            
            // Créer l'élément de la liste
            const themeElement = document.createElement('li');
            themeElement.className = 'theme-item';
            themeElement.innerHTML = `
                <div class="theme-header">
                    <span class="theme-name">${this.capitalizeFirstLetter(themeName)}</span>
                    <span class="sentiment-indicator ${sentiment}"></span>
                    <span class="theme-count">${themeData.count}</span>
                </div>
                <div class="theme-bar">
                    <div class="theme-progress" style="width: ${this.calculateProgressWidth(themeData.count, sortedThemes[0][1].count)}%"></div>
                </div>
                <div class="theme-tooltip">
                    <p>${themeData.gpt_summary || `Thème lié à ${themeName} avec ${themeData.count} mentions.`}</p>
                    <div class="sentiment-distribution">
                        <span class="positive" style="width:${themeData.sentiment_distribution?.positive || 0}%"></span>
                        <span class="neutral" style="width:${themeData.sentiment_distribution?.neutral || 0}%"></span>
                        <span class="negative" style="width:${themeData.sentiment_distribution?.negative || 0}%"></span>
                    </div>
                </div>
            `;
            
            // Ajouter l'élément au conteneur
            container.appendChild(themeElement);
        });
    },

    // Calcul de la largeur de la barre de progression proportionnelle
    calculateProgressWidth: function(count, maxCount) {
        return Math.max(5, Math.round((count / maxCount) * 100));
    },

    // Détermination du sentiment dominant
    getDominantSentiment: function(sentimentDist) {
        if (!sentimentDist) return 'neutral';
        
        const { positive, negative, neutral } = sentimentDist;
        
        if (positive > negative && positive > neutral) return 'positive';
        if (negative > positive && negative > neutral) return 'negative';
        return 'neutral';
    },

    // Mise à jour de la date de dernière mise à jour
    updateLastUpdated: function() {
        const element = document.getElementById('themes-last-updated');
        if (element && this.themesData) {
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

    // Utilitaire pour capitaliser la première lettre
    capitalizeFirstLetter: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', function() {
    ThemesVisualizer.init();
});