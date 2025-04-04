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
                console.log("Données de thèmes chargées:", data);
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
        console.log(`Rendu des thèmes pour la période ${this.activePeriod}:`, themes);
        
        // Rendu pour chaque axe
        this.renderThemeAxis('macroeconomie', themes.macroeconomics);
        this.renderThemeAxis('secteurs', themes.sectors);
        this.renderThemeAxis('regions', themes.regions);
    },

    // Rendu pour un axe spécifique (macroéconomie, secteurs, régions)
    renderThemeAxis: function(axis, axisThemes) {
        const container = document.getElementById(`${axis}-themes`);
        if (!container) return;
        
        container.innerHTML = '';
        
        // Vérifier si axisThemes est défini
        if (!axisThemes) {
            console.warn(`Aucun thème trouvé pour l'axe ${axis}`);
            return;
        }
        
        // Tri des thèmes par nombre d'occurrences
        const sortedThemes = Object.entries(axisThemes)
            .sort(([,a], [,b]) => {
                // Comparer les comptes qu'ils soient sous forme de nombre ou d'objet
                const countA = typeof a === 'object' && 'count' in a ? a.count : (typeof a === 'number' ? a : 0);
                const countB = typeof b === 'object' && 'count' in b ? b.count : (typeof b === 'number' ? b : 0);
                return countB - countA;
            });
            // Ne pas limiter le nombre de thèmes
        
        // Afficher tous les thèmes avec un compteur > 0
        const displayableThemes = sortedThemes.filter(([,themeData]) => {
            const count = typeof themeData === 'object' && 'count' in themeData ? 
                themeData.count : (typeof themeData === 'number' ? themeData : 0);
            return count > 0;
        });
        
        console.log(`Thèmes à afficher pour ${axis}:`, displayableThemes.length);
        
        // Trouver le compte maximum pour l'échelle des barres
        const maxCount = displayableThemes.length > 0 ? 
            (typeof displayableThemes[0][1] === 'object' && 'count' in displayableThemes[0][1] ? 
                displayableThemes[0][1].count : 
                (typeof displayableThemes[0][1] === 'number' ? displayableThemes[0][1] : 0)) : 0;
        
        displayableThemes.forEach(([themeName, themeData]) => {
            // Extraire les données selon la structure (objet complet ou juste un nombre)
            const isFullObject = typeof themeData === 'object' && themeData !== null;
            const count = isFullObject && 'count' in themeData ? themeData.count : (typeof themeData === 'number' ? themeData : 0);
            const sentimentDist = isFullObject && 'sentiment_distribution' in themeData ? themeData.sentiment_distribution : null;
            const sentiment = this.getDominantSentiment(sentimentDist);
            const summary = isFullObject && 'gpt_summary' in themeData ? themeData.gpt_summary : null;
            
            // Hack pour garantir que articles existe
            const articles = isFullObject && Array.isArray(themeData.articles) ? themeData.articles : [];
            
            // Créer l'élément de la liste
            const themeElement = document.createElement('li');
            themeElement.className = 'theme-item';
            
            // Créer le contenu de base (qui est toujours présent)
            let html = `
                <div class="theme-header">
                    <span class="theme-name">${this.capitalizeFirstLetter(themeName)}</span>
                    <span class="sentiment-indicator ${sentiment}"></span>
                    <span class="theme-count">${count}</span>
                </div>
                <div class="theme-bar">
                    <div class="theme-progress" style="width: ${this.calculateProgressWidth(count, maxCount)}%"></div>
                </div>
            `;
            
            // Ajouter l'infobulle si disponible
            if (isFullObject) {
                html += `
                    <div class="theme-tooltip">
                        <p>${summary || `Thème lié à ${themeName} avec ${count} mentions.`}</p>
                `;
                
                if (sentimentDist) {
                    html += `
                        <div class="sentiment-distribution">
                            <span class="positive" style="width:${sentimentDist.positive || 0}%"></span>
                            <span class="neutral" style="width:${sentimentDist.neutral || 0}%"></span>
                            <span class="negative" style="width:${sentimentDist.negative || 0}%"></span>
                        </div>
                    `;
                }
                
                html += `</div>`;
            }
            
            themeElement.innerHTML = html;
            
            // Ajouter l'élément au conteneur
            container.appendChild(themeElement);
        });
    },

    // Calcul de la largeur de la barre de progression proportionnelle
    calculateProgressWidth: function(count, maxCount) {
        if (maxCount <= 0) return 0;
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