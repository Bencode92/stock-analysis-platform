/**
 * Module de visualisation de l'historique des portefeuilles
 * Permet de consulter les versions précédentes des portefeuilles
 */

class PortfolioHistoryViewer {
    constructor() {
        this.historyContainer = document.querySelector('.portfolio-history-container');
        this.currentPortfolio = null;
        this.historyData = [];
        this.selectedHistoryIndex = 0;
        this.activePortfolioType = 'agressif'; // Type de portefeuille actif par défaut
        this.showOnlyHistorical = true; // Afficher uniquement le portefeuille historique
    }

    /**
     * Initialise le visualiseur d'historique
     */
    async init() {
        // Afficher le chargement
        this.showLoading(true);
        
        try {
            // Déterminer le type de portefeuille actif depuis l'URL
            this.activePortfolioType = this.getActivePortfolioType();
            console.log('Type de portefeuille actif pour l\'historique:', this.activePortfolioType);
            
            // Charger l'index des portefeuilles historiques
            console.log('Chargement de l\'index des portefeuilles historiques...');
            const response = await fetch('data/portfolio_history/index.json');
            
            if (!response.ok) {
                console.error('Erreur HTTP lors du chargement de l\'index:', response.status);
                throw new Error(`Impossible de charger l'index historique: ${response.status}`);
            }
            
            this.historyData = await response.json();
            console.log(`${this.historyData.length} entrées historiques trouvées`);
            
            // Trier par date (du plus récent au plus ancien)
            this.historyData.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Charger le portefeuille actuel pour comparaison (même si on ne l'affiche pas)
            const currentResponse = await fetch('portefeuilles.json');
            if (currentResponse.ok) {
                this.currentPortfolio = await currentResponse.json();
                console.log('Portefeuille actuel chargé avec succès');
            } else {
                console.warn('Avertissement: Impossible de charger le portefeuille actuel');
                // Ce n'est pas critique car on ne va pas l'afficher
            }
            
            // Rendre l'interface
            this.renderHistoryInterface();
        } catch (error) {
            console.error('Erreur lors du chargement de l\'historique:', error);
            this.showError(`Impossible de charger l'historique des portefeuilles: ${error.message}`);
        }
        
        this.showLoading(false);
    }

    /**
     * Récupère le type de portefeuille actif depuis l'URL ou l'état de l'interface
     */
    getActivePortfolioType() {
        // Chercher dans l'URL
        const urlParams = new URLSearchParams(window.location.search);
        const typeParam = urlParams.get('type');
        
        if (typeParam) {
            return this.normalizePortfolioType(typeParam);
        }
        
        // Chercher dans l'interface (onglet actif)
        const activeTab = document.querySelector('.portfolio-tab.active');
        if (activeTab && activeTab.dataset.target) {
            return activeTab.dataset.target.replace('portfolio-', '');
        }
        
        return 'agressif'; // Valeur par défaut
    }

    /**
     * Normalise le type de portefeuille (enlève les accents, minuscules)
     */
    normalizePortfolioType(type) {
        if (!type) return 'agressif';
        
        return type.toString().toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
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
            <div class="history-comparison${this.showOnlyHistorical ? ' historical-only' : ''}">
                ${!this.showOnlyHistorical ? `
                <div class="current-portfolio">
                    <h3>Portefeuille actuel</h3>
                    <div id="current-portfolio-container"></div>
                </div>
                ` : ''}
                <div class="historical-portfolio">
                    <h3>Portefeuille historique</h3>
                    <div id="historical-portfolio-container"></div>
                </div>
            </div>
        `;
        
        this.historyContainer.innerHTML = html;
        
        // Ajouter du CSS pour la classe historical-only
        if (!document.querySelector('#historical-only-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'historical-only-style';
            styleEl.textContent = `
                .history-comparison.historical-only .historical-portfolio {
                    width: 100%;
                    max-width: 100%;
                }
            `;
            document.head.appendChild(styleEl);
        }
        
        // Ajouter les événements
        const selector = this.historyContainer.querySelector('.history-selector');
        const compareBtn = this.historyContainer.querySelector('.btn-compare');
        
        compareBtn.addEventListener('click', () => {
            this.selectedHistoryIndex = parseInt(selector.value);
            this.loadHistoricalPortfolio();
        });
        
        // Charger le premier portefeuille historique par défaut
        this.loadHistoricalPortfolio();
    }

    /**
     * Charge le portefeuille historique sélectionné
     */
    async loadHistoricalPortfolio() {
        const historicalContainer = document.getElementById('historical-portfolio-container');
        if (!historicalContainer) {
            console.error('Conteneur historique non trouvé');
            return;
        }
        
        // Afficher l'indicateur de chargement
        historicalContainer.innerHTML = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'portfolio-history-loading';
        loadingDiv.style.display = 'flex';
        historicalContainer.appendChild(loadingDiv);
        
        try {
            // Charger le portefeuille historique sélectionné
            const historyItem = this.historyData[this.selectedHistoryIndex];
            console.log('Chargement du fichier historique:', historyItem.file);
            
            // Mettre à jour le type de portefeuille actif (au cas où il aurait changé)
            this.activePortfolioType = this.getActivePortfolioType();
            
            const response = await fetch(`data/portfolio_history/${historyItem.file}`);
            
            if (!response.ok) {
                console.error('Erreur HTTP:', response.status);
                throw new Error(`Impossible de charger ${historyItem.file} (Status: ${response.status})`);
            }
            
            const historyDataRaw = await response.text();
            console.log('Données brutes reçues, taille:', historyDataRaw.length);
            
            let historyData;
            try {
                historyData = JSON.parse(historyDataRaw);
                console.log('Structure des données historiques:', Object.keys(historyData));
            } catch (parseError) {
                console.error('Erreur lors du parsing JSON:', parseError);
                throw new Error(`Format JSON invalide: ${parseError.message}`);
            }
            
            // Vérifier la structure correcte du fichier
            if (!historyData.portfolios) {
                console.error('Structure JSON incorrecte - pas de clé "portfolios"');
                throw new Error('Format de fichier historique incorrect');
            }
            
            const historicalPortfolio = historyData.portfolios;
            
            // Afficher uniquement le portefeuille historique du type sélectionné
            this.displayPortfolio('historical-portfolio-container', historicalPortfolio, this.activePortfolioType);
            
            // Si on affiche également le portefeuille actuel, le faire et comparer
            if (!this.showOnlyHistorical && this.currentPortfolio) {
                const currentContainer = document.getElementById('current-portfolio-container');
                if (currentContainer) {
                    this.displayPortfolio('current-portfolio-container', this.currentPortfolio, this.activePortfolioType);
                    this.highlightDifferences(this.currentPortfolio, historicalPortfolio, this.activePortfolioType);
                }
            }
            
        } catch (error) {
            console.error('Erreur lors du chargement du portefeuille historique:', error);
            historicalContainer.innerHTML = `<div class="error-message">Erreur lors du chargement de la comparaison: ${error.message}</div>`;
        }
    }

    /**
     * Affiche un portefeuille dans un conteneur
     * @param {string} containerId - ID du conteneur HTML
     * @param {object} portfolio - Données du portefeuille
     * @param {string} activeType - Type de portefeuille à afficher (agressif, modere, stable)
     */
    displayPortfolio(containerId, portfolio, activeType) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Conteneur #${containerId} non trouvé`);
            return;
        }
        
        container.innerHTML = '';
        
        if (!portfolio) {
            container.innerHTML = '<div class="error-message">Données de portefeuille non disponibles</div>';
            return;
        }
        
        // Normaliser le type actif pour la comparaison
        activeType = this.normalizePortfolioType(activeType);
        console.log(`Affichage du portefeuille de type: ${activeType}`);
        
        // Créer des tableaux pour les correspondances de types
        const typeMap = {
            'agressif': ['Agressif', 'agressif', 'AGRESSIF'],
            'modere': ['Modéré', 'modere', 'Modere', 'MODÉRÉ', 'MODERE'],
            'stable': ['Stable', 'stable', 'STABLE']
        };
        
        // Variables pour suivre si un portefeuille a été trouvé
        let portfolioFound = false;
        
        // Pour chaque type de portefeuille
        Object.keys(portfolio).forEach(portfolioType => {
            const normalizedType = this.normalizePortfolioType(portfolioType);
            console.log(`Vérification du type: ${portfolioType} (normalisé: ${normalizedType})`);
            
            // Trouver le type correspondant
            let matchesType = false;
            if (normalizedType === activeType) {
                matchesType = true;
            } else {
                // Vérifier dans les tableaux de correspondance
                for (const [key, values] of Object.entries(typeMap)) {
                    if (key === activeType && values.includes(portfolioType)) {
                        matchesType = true;
                        break;
                    }
                }
            }
            
            // Ne traiter que le type de portefeuille actif
            if (!matchesType) {
                return;
            }
            
            portfolioFound = true;
            console.log(`Portefeuille trouvé: ${portfolioType}`);
            
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
                if (!assets || Object.keys(assets).length === 0) return;
                
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
        
        // Si aucun portefeuille correspondant n'a été trouvé
        if (!portfolioFound) {
            container.innerHTML = `<div class="error-message">Portefeuille de type "${activeType}" non trouvé</div>`;
            console.error(`Aucun portefeuille de type "${activeType}" trouvé. Types disponibles:`, Object.keys(portfolio));
        }
    }

    /**
     * Met en évidence les différences entre deux portefeuilles
     * @param {object} current - Portefeuille actuel
     * @param {object} historical - Portefeuille historique
     * @param {string} activeType - Type de portefeuille actif
     */
    highlightDifferences(current, historical, activeType) {
        // Cette fonction est désactivée si on n'affiche que le portefeuille historique
        if (this.showOnlyHistorical) return;
        
        // Normaliser le type actif
        activeType = this.normalizePortfolioType(activeType);
        
        // Convertir les types pour faciliter la comparaison
        const typeMap = {
            'agressif': ['Agressif', 'agressif'],
            'modere': ['Modéré', 'modere', 'Modere'],
            'stable': ['Stable', 'stable']
        };
        
        // Trouver la clé correspondante dans chaque portefeuille
        let currentTypeKey = null;
        let historicalTypeKey = null;
        
        // Pour le portefeuille actuel
        for (const key in current) {
            if (typeMap[activeType] && (typeMap[activeType].includes(key) || this.normalizePortfolioType(key) === activeType)) {
                currentTypeKey = key;
                break;
            }
        }
        
        // Pour le portefeuille historique
        for (const key in historical) {
            if (typeMap[activeType] && (typeMap[activeType].includes(key) || this.normalizePortfolioType(key) === activeType)) {
                historicalTypeKey = key;
                break;
            }
        }
        
        if (!currentTypeKey || !historicalTypeKey) {
            console.error('Type de portefeuille non trouvé:', activeType);
            console.log('Clés disponibles dans portefeuille actuel:', Object.keys(current));
            console.log('Clés disponibles dans portefeuille historique:', Object.keys(historical));
            return;
        }
        
        // Parcourir tous les éléments d'allocation pour trouver les différences
        const allocationElements = document.querySelectorAll('.asset-allocation');
        
        allocationElements.forEach(element => {
            // Vérifier que l'élément existe et a un parent
            if (!element || !element.previousElementSibling) return;
            
            const assetNameElement = element.previousElementSibling;
            if (!assetNameElement) return;
            
            const assetName = assetNameElement.textContent;
            if (!assetName) return;
            
            const portfolioPanel = element.closest('.history-portfolio-panel');
            if (!portfolioPanel) return;
            
            const categoryElement = element.closest('.history-category');
            if (!categoryElement) return;
            
            const categoryTitleElement = categoryElement.querySelector('h5');
            if (!categoryTitleElement) return;
            
            const category = categoryTitleElement.textContent;
            if (!category) return;
            
            // Vérifier si la valeur est différente entre les deux portefeuilles
            const isInCurrentContainer = element.closest('#current-portfolio-container');
            
            try {
                let otherValue;
                
                if (isInCurrentContainer) {
                    // Élément du portefeuille actuel, chercher la valeur dans l'historique
                    otherValue = historical[historicalTypeKey][category] ? 
                                 historical[historicalTypeKey][category][assetName] : null;
                } else {
                    // Élément du portefeuille historique, chercher la valeur dans l'actuel
                    otherValue = current[currentTypeKey][category] ? 
                                 current[currentTypeKey][category][assetName] : null;
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
                        // Extraire les valeurs numériques pour la comparaison
                        const currentNum = parseFloat(currentValue.replace('%', '').trim());
                        const otherNum = parseFloat(otherValue.replace('%', '').trim());
                        const diff = currentNum - otherNum;
                        
                        tooltip.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
                    }
                    
                    element.appendChild(tooltip);
                }
            } catch (e) {
                console.warn('Erreur lors de la comparaison:', e);
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
