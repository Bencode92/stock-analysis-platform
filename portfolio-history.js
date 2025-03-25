/**
 * Module de visualisation de l'historique des portefeuilles
 * Permet de consulter et comparer les versions précédentes des portefeuilles
 */

class PortfolioHistoryViewer {
    constructor() {
        this.historyContainer = document.querySelector('.portfolio-history-container');
        this.currentPortfolio = null;
        this.historyData = [];
        this.selectedHistoryIndex = 0;
    }

    /**
     * Initialise le visualiseur d'historique
     */
    async init() {
        // Afficher le chargement
        this.showLoading(true);
        
        try {
            // Charger l'index des portefeuilles historiques
            const response = await fetch('data/portfolio_history/index.json');
            if (!response.ok) throw new Error('Impossible de charger l\'index historique');
            
            this.historyData = await response.json();
            
            // Trier par date (du plus récent au plus ancien)
            this.historyData.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Charger le portefeuille actuel pour comparaison
            const currentResponse = await fetch('portefeuilles.json');
            if (currentResponse.ok) {
                this.currentPortfolio = await currentResponse.json();
            }
            
            // Rendre l'interface
            this.renderHistoryInterface();
        } catch (error) {
            console.error('Erreur lors du chargement de l\'historique:', error);
            this.showError('Impossible de charger l\'historique des portefeuilles.');
        }
        
        this.showLoading(false);
    }

    /**
     * Rend l'interface principale de l'historique
     */
    renderHistoryInterface() {
        if (!this.historyData || this.historyData.length === 0) {
            this.historyContainer.innerHTML = '<div class="empty-history">Aucun historique disponible</div>';
            return;
        }

        let html = `
            <div class="history-controls">
                <h3>Sélectionnez une version antérieure à comparer</h3>
                <select class="history-selector">
                    ${this.historyData.map((item, index) => {
                        const date = new Date(item.date);
                        const formattedDate = new Intl.DateTimeFormat('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        }).format(date);
                        
                        return `<option value="${index}">${formattedDate} (${this.getRelativeTime(date)})</option>`;
                    }).join('')}
                </select>
                <button class="btn-compare">Comparer</button>
            </div>
            <div class="history-comparison">
                <div class="current-portfolio">
                    <h3>Portefeuille actuel</h3>
                    <div id="current-portfolio-container"></div>
                </div>
                <div class="historical-portfolio">
                    <h3>Portefeuille historique</h3>
                    <div id="historical-portfolio-container"></div>
                </div>
            </div>
        `;
        
        this.historyContainer.innerHTML = html;
        
        // Ajouter les événements
        const selector = this.historyContainer.querySelector('.history-selector');
        const compareBtn = this.historyContainer.querySelector('.btn-compare');
        
        compareBtn.addEventListener('click', () => {
            this.selectedHistoryIndex = parseInt(selector.value);
            this.loadAndComparePortfolios();
        });
        
        // Charger la première comparaison par défaut
        this.loadAndComparePortfolios();
    }

    /**
     * Charge et compare les portefeuilles sélectionnés
     */
    async loadAndComparePortfolios() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'portfolio-history-loading';
        loadingDiv.textContent = 'Chargement de la comparaison...';
        
        const historicalContainer = document.getElementById('historical-portfolio-container');
        historicalContainer.innerHTML = '';
        historicalContainer.appendChild(loadingDiv);
        
        try {
            // Charger le portefeuille historique sélectionné
            const historyItem = this.historyData[this.selectedHistoryIndex];
            const response = await fetch(`data/portfolio_history/${historyItem.file}`);
            
            if (!response.ok) throw new Error(`Impossible de charger ${historyItem.file}`);
            
            const historyData = await response.json();
            const historicalPortfolio = historyData.portfolios;
            
            // Afficher les deux portefeuilles côte à côte
            this.displayPortfolio('current-portfolio-container', this.currentPortfolio);
            this.displayPortfolio('historical-portfolio-container', historicalPortfolio);
            
            // Mettre en évidence les différences
            this.highlightDifferences(this.currentPortfolio, historicalPortfolio);
            
        } catch (error) {
            console.error('Erreur lors de la comparaison:', error);
            historicalContainer.innerHTML = '<div class="error-message">Erreur lors du chargement de la comparaison</div>';
        }
    }

    /**
     * Affiche un portefeuille dans un conteneur
     */
    displayPortfolio(containerId, portfolio) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        // Pour chaque type de portefeuille (Agressif, Modéré, Stable)
        Object.keys(portfolio).forEach(portfolioType => {
            const panel = document.createElement('div');
            panel.className = 'history-portfolio-panel';
            
            let html = `<h4>${portfolioType}</h4>`;
            
            // Commentaire
            if (portfolio[portfolioType].Commentaire) {
                html += `<div class="history-portfolio-comment">${portfolio[portfolioType].Commentaire}</div>`;
            }
            
            // Afficher les allocations par catégorie
            Object.keys(portfolio[portfolioType]).forEach(category => {
                if (category === 'Commentaire') return;
                
                const assets = portfolio[portfolioType][category];
                if (Object.keys(assets).length === 0) return;
                
                html += `
                    <div class="history-category">
                        <h5>${category}</h5>
                        <ul class="history-assets">
                            ${Object.entries(assets).map(([asset, allocation]) => 
                                `<li><span class="asset-name">${asset}</span>: <span class="asset-allocation">${allocation}</span></li>`
                            ).join('')}
                        </ul>
                    </div>
                `;
            });
            
            panel.innerHTML = html;
            container.appendChild(panel);
        });
    }

    /**
     * Met en évidence les différences entre deux portefeuilles
     */
    highlightDifferences(current, historical) {
        // Parcourir tous les éléments d'allocation pour trouver les différences
        const allocationElements = document.querySelectorAll('.asset-allocation');
        
        allocationElements.forEach(element => {
            const assetName = element.previousElementSibling.textContent;
            const portfolioPanel = element.closest('.history-portfolio-panel');
            const portfolioType = portfolioPanel.querySelector('h4').textContent;
            const category = element.closest('.history-category').querySelector('h5').textContent;
            
            // Vérifier si la valeur est différente entre les deux portefeuilles
            const isInCurrentContainer = element.closest('#current-portfolio-container');
            
            try {
                let otherValue;
                
                if (isInCurrentContainer) {
                    // Élément du portefeuille actuel, chercher la valeur dans l'historique
                    otherValue = historical[portfolioType][category][assetName];
                } else {
                    // Élément du portefeuille historique, chercher la valeur dans l'actuel
                    otherValue = current[portfolioType][category][assetName];
                }
                
                // Si la valeur n'existe pas dans l'autre portefeuille ou est différente
                if (!otherValue || otherValue !== element.textContent) {
                    element.classList.add('changed-allocation');
                    
                    // Ajouter une info-bulle pour montrer la différence
                    const currentValue = element.textContent;
                    const tooltip = document.createElement('span');
                    tooltip.className = 'allocation-tooltip';
                    
                    if (!otherValue) {
                        tooltip.textContent = isInCurrentContainer ? 'Nouvel actif' : 'Actif supprimé';
                    } else {
                        const diff = parseFloat(currentValue) - parseFloat(otherValue);
                        tooltip.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
                    }
                    
                    element.appendChild(tooltip);
                }
            } catch (e) {
                // Ignorer les erreurs si la structure ne correspond pas
            }
        });
    }

    /**
     * Calcule et renvoie un texte indiquant le temps relatif
     */
    getRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / 60000);
        
        if (diffMinutes < 60) {
            return `il y a ${diffMinutes} min`;
        }
        
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) {
            return `il y a ${diffHours} h`;
        }
        
        const diffDays = Math.floor(diffHours / 24);
        return `il y a ${diffDays} j`;
    }

    /**
     * Affiche ou masque l'indicateur de chargement
     */
    showLoading(show) {
        let loadingEl = document.querySelector('.portfolio-history-loading');
        if (!loadingEl && show) {
            loadingEl = document.createElement('div');
            loadingEl.className = 'portfolio-history-loading';
            this.historyContainer.appendChild(loadingEl);
        }
        
        if (loadingEl) {
            loadingEl.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'portfolio-history-error';
        errorEl.textContent = message;
        
        this.historyContainer.innerHTML = '';
        this.historyContainer.appendChild(errorEl);
    }
}

// Initialiser le visualiseur d'historique quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initialisation du visualiseur d\'historique des portefeuilles');
    const historyViewer = new PortfolioHistoryViewer();
    window.historyViewer = historyViewer; // Rendre accessible globalement
    historyViewer.init();
});
