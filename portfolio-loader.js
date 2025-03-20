/**
 * Module de chargement et d'affichage des portefeuilles générés
 * Intègre les portefeuilles générés automatiquement dans l'interface TradePulse
 */

class PortfolioManager {
    constructor() {
        this.portfolios = null;
        this.lastUpdate = null;
        this.containerSelector = '.portfolio-container';
        this.loadingSelector = '.portfolio-loading';
        this.errorSelector = '.portfolio-error';
    }

    /**
     * Initialise le gestionnaire de portefeuilles
     */
    async init() {
        try {
            // Afficher l'indicateur de chargement
            this.showLoading(true);
            
            // Charger les données des portefeuilles
            await this.loadPortfolios();
            
            // Rendre les portefeuilles dans l'interface
            this.renderPortfolios();
            
            // Ajouter les interactions
            this.setupInteractions();
            
            // Masquer l'indicateur de chargement
            this.showLoading(false);
            
            console.log('✅ Portefeuilles chargés avec succès');
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation des portefeuilles:', error);
            this.showError('Une erreur est survenue lors du chargement des portefeuilles. Veuillez réessayer plus tard.');
            this.showLoading(false);
        }
    }

    /**
     * Charge les données des portefeuilles depuis le fichier JSON
     */
    async loadPortfolios() {
        try {
            const timestamp = new Date().getTime(); // Éviter le cache du navigateur
            const response = await fetch(`portefeuilles.json?_=${timestamp}`);
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            this.portfolios = await response.json();
            this.lastUpdate = new Date();
            
            // Stocker en local pour l'accès hors ligne
            localStorage.setItem('tradepulse_portfolios', JSON.stringify(this.portfolios));
            localStorage.setItem('tradepulse_portfolios_update', this.lastUpdate.toISOString());
            
            // Mettre à jour l'affichage de la dernière mise à jour dans l'interface
            const updateTimeElement = document.getElementById('portfolioUpdateTime');
            if (updateTimeElement) {
                updateTimeElement.textContent = this.formatDate(this.lastUpdate);
            }
            
            return this.portfolios;
        } catch (error) {
            console.warn('⚠️ Impossible de charger portefeuilles.json, tentative de récupération depuis le localStorage...');
            
            // Tentative de récupération depuis le stockage local
            const cachedPortfolios = localStorage.getItem('tradepulse_portfolios');
            const cachedUpdate = localStorage.getItem('tradepulse_portfolios_update');
            
            if (cachedPortfolios) {
                this.portfolios = JSON.parse(cachedPortfolios);
                this.lastUpdate = cachedUpdate ? new Date(cachedUpdate) : new Date();
                console.log('📋 Portefeuilles récupérés depuis le cache');
                return this.portfolios;
            }
            
            // Si aucune donnée n'est disponible, générer des portefeuilles par défaut
            this.portfolios = this.getDefaultPortfolios();
            this.lastUpdate = new Date();
            
            return this.portfolios;
        }
    }

    /**
     * Génère des portefeuilles par défaut en cas d'erreur
     */
    getDefaultPortfolios() {
        return {
            "Agressif": {
                "Actions": {
                    "Apple": "15%",
                    "Tesla": "10%",
                    "Nvidia": "15%"
                },
                "Crypto": {
                    "Bitcoin": "15%",
                    "Ethereum": "10%"
                },
                "ETF": {
                    "ARK Innovation ETF": "15%",
                    "SPDR S&P 500 ETF": "10%"
                }
            },
            "Modéré": {
                "Actions": {
                    "Microsoft": "15%",
                    "Alphabet": "10%",
                    "Johnson & Johnson": "10%"
                },
                "Obligations": {
                    "US Treasury 10Y": "15%",
                    "Corporate Bonds AAA": "15%"
                },
                "ETF": {
                    "Vanguard Total Stock Market ETF": "20%",
                    "iShares Core MSCI EAFE ETF": "15%"
                }
            },
            "Stable": {
                "Actions": {
                    "Procter & Gamble": "10%",
                    "Coca-Cola": "10%",
                    "McDonald's": "10%"
                },
                "Obligations": {
                    "US Treasury 30Y": "25%",
                    "Municipal Bonds AAA": "15%"
                },
                "ETF": {
                    "Vanguard High Dividend Yield ETF": "15%",
                    "SPDR Gold Shares": "15%"
                }
            }
        };
    }

    /**
     * Affiche ou masque l'indicateur de chargement
     */
    showLoading(show) {
        const loadingEl = document.querySelector(this.loadingSelector);
        if (loadingEl) {
            loadingEl.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        const errorEl = document.querySelector(this.errorSelector);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    /**
     * Rend les portefeuilles dans l'interface utilisateur
     */
    renderPortfolios() {
        const container = document.querySelector(this.containerSelector);
        if (!container || !this.portfolios) return;
        
        // Vérifier si les tabs existent déjà (s'ils ont été définis dans le HTML)
        let tabsContainer = container.querySelector('.portfolio-tabs');
        const contentContainer = document.createElement('div');
        contentContainer.className = 'portfolio-content';
        
        // Si les tabs n'existent pas, créer le conteneur
        if (!tabsContainer) {
            // Créer les onglets pour chaque type de portefeuille
            tabsContainer = document.createElement('div');
            tabsContainer.className = 'portfolio-tabs';
            
            // Ajouter la date de mise à jour
            const updateInfo = document.createElement('div');
            updateInfo.className = 'portfolio-update-info';
            updateInfo.innerHTML = `
                <i class="fas fa-sync-alt"></i>
                <span>Dernière mise à jour: ${this.formatDate(this.lastUpdate)}</span>
            `;
            container.appendChild(updateInfo);
            
            // Créer les onglets pour chaque type de portefeuille
            Object.keys(this.portfolios).forEach((portfolioType, index) => {
                // Créer l'onglet
                const tab = document.createElement('button');
                tab.className = `portfolio-tab ${index === 0 ? 'active' : ''}`;
                tab.dataset.target = `portfolio-${portfolioType.toLowerCase()}`;
                tab.innerHTML = `
                    <span class="tab-icon">
                        ${this.getPortfolioIcon(portfolioType)}
                    </span>
                    <span class="tab-text">${portfolioType}</span>
                `;
                tabsContainer.appendChild(tab);
            });
            
            container.appendChild(tabsContainer);
        } else {
            // Si les tabs existent déjà, les utiliser tels quels
            const existingTabs = tabsContainer.querySelectorAll('.portfolio-tab');
            if (existingTabs.length === 0) {
                // Aucun onglet trouvé, créer les onglets
                Object.keys(this.portfolios).forEach((portfolioType, index) => {
                    const tab = document.createElement('button');
                    tab.className = `portfolio-tab ${index === 0 ? 'active' : ''}`;
                    tab.dataset.target = `portfolio-${portfolioType.toLowerCase()}`;
                    tab.innerHTML = `
                        <span class="tab-icon">
                            ${this.getPortfolioIcon(portfolioType)}
                        </span>
                        <span class="tab-text">${portfolioType}</span>
                    `;
                    tabsContainer.appendChild(tab);
                });
            }
        }
        
        // Créer le contenu pour chaque portefeuille
        Object.keys(this.portfolios).forEach((portfolioType, index) => {
            // Créer le contenu du portefeuille
            const content = document.createElement('div');
            content.className = `portfolio-panel ${index === 0 ? 'active' : ''}`;
            content.id = `portfolio-${portfolioType.toLowerCase()}`;
            
            // Générer les graphiques et tableaux pour ce portefeuille
            content.innerHTML = this.generatePortfolioContent(portfolioType, this.portfolios[portfolioType]);
            
            contentContainer.appendChild(content);
        });
        
        // Vider le conteneur de contenu existant
        const existingContent = container.querySelector('.portfolio-content');
        if (existingContent) {
            container.removeChild(existingContent);
        }
        
        // Ajouter le nouveau conteneur de contenu
        container.appendChild(contentContainer);
        
        // Initialiser les graphiques
        this.initCharts();
    }

    /**
     * Génère l'icône correspondant au type de portefeuille
     */
    getPortfolioIcon(portfolioType) {
        switch(portfolioType.toLowerCase()) {
            case 'agressif':
                return '<i class="fas fa-rocket"></i>';
            case 'modéré':
                return '<i class="fas fa-balance-scale"></i>';
            case 'stable':
                return '<i class="fas fa-shield-alt"></i>';
            default:
                return '<i class="fas fa-chart-pie"></i>';
        }
    }

    /**
     * Génère le contenu HTML pour un portefeuille spécifique
     */
    generatePortfolioContent(portfolioType, portfolio) {
        // Déterminer les couleurs et styles basés sur le type
        let typeColor, typeClass;
        
        if (portfolioType.toLowerCase() === 'agressif') {
            typeColor = '#FF7B00';
            typeClass = 'agressif';
        } else if (portfolioType.toLowerCase() === 'modéré') {
            typeColor = '#00FF87';
            typeClass = 'modere';
        } else {
            typeColor = '#00B2FF';
            typeClass = 'stable';
        }
        
        // Calculer les répartitions par catégorie
        const categoryAllocation = this.calculateCategoryAllocation(portfolio);
        
        // Générer la description du portefeuille
        const description = this.getPortfolioDescription(portfolioType);
        
        // Compter le nombre total d'actifs
        const totalAssets = Object.values(portfolio).reduce((sum, category) => {
            return sum + Object.keys(category).length;
        }, 0);
        
        // Génération du graphique coloré selon le type
        const chartHTML = `
            <div class="portfolio-chart-container">
                <canvas id="chart-${portfolioType.toLowerCase()}" width="300" height="300"></canvas>
            </div>
        `;
        
        let html = `
            <div class="portfolio-header">
                <h2>${portfolioType}</h2>
                <div class="portfolio-meta">
                    <span class="portfolio-asset-count">
                        <i class="fas fa-cubes"></i> ${totalAssets} actifs
                    </span>
                </div>
            </div>
            <div class="portfolio-description">
                <p>${description}</p>
            </div>
            <div class="portfolio-overview">
                ${chartHTML}
                <div class="portfolio-allocation">
                    <h3>Répartition par catégorie</h3>
                    <ul class="category-allocation">
        `;
        
        // Ajouter la répartition par catégorie
        Object.keys(categoryAllocation).forEach(category => {
            const percentage = categoryAllocation[category];
            html += `
                <li>
                    <span class="category-name">${category}</span>
                    <div class="allocation-bar">
                        <div class="allocation-fill" style="width: ${percentage}; background-color: ${this.getCategoryColor(category, typeClass)}"></div>
                    </div>
                    <span class="allocation-value">${percentage}</span>
                </li>
            `;
        });
        
        html += `
                    </ul>
                </div>
            </div>
        `;
        
        // Ajouter des tableaux détaillés par catégorie
        html += '<div class="portfolio-details">';
        
        Object.keys(portfolio).forEach(category => {
            const assets = portfolio[category];
            
            // Ne montrer que les catégories non vides
            if (Object.keys(assets).length === 0) return;
            
            html += `
                <div class="portfolio-category">
                    <h3>${category}</h3>
                    <table class="assets-table">
                        <thead>
                            <tr>
                                <th>Actif</th>
                                <th>Allocation</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            Object.keys(assets).forEach(asset => {
                html += `
                    <tr>
                        <td>${asset}</td>
                        <td><span class="asset-allocation">${assets[asset]}</span></td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Ajouter des boutons d'action avec la classe de type appropriée
        html += `
            <div class="portfolio-actions">
                <button class="btn-download ${typeClass}" data-portfolio="${portfolioType}">
                    <i class="fas fa-download"></i> Télécharger
                </button>
                <button class="btn-share" data-portfolio="${portfolioType}">
                    <i class="fas fa-share-alt"></i> Partager
                </button>
            </div>
        `;
        
        return html;
    }

    /**
     * Calcule la répartition par catégorie d'un portefeuille
     */
    calculateCategoryAllocation(portfolio) {
        const allocation = {};
        
        Object.keys(portfolio).forEach(category => {
            const assets = portfolio[category];
            const categoryTotal = Object.values(assets).reduce((sum, value) => {
                // Convertir les pourcentages en nombres
                const numValue = parseFloat(value.replace('%', ''));
                return sum + numValue;
            }, 0);
            
            allocation[category] = categoryTotal.toFixed(1) + '%';
        });
        
        return allocation;
    }

    /**
     * Retourne une couleur pour une catégorie d'actifs, adaptée au type de portefeuille
     */
    getCategoryColor(category, typeClass) {
        // Couleurs de base
        const colors = {
            'Actions': '#4e79a7',
            'Obligations': '#f28e2c',
            'ETF': '#e15759',
            'Crypto': '#76b7b2',
            'Or': '#59a14f',
            'Matières premières': '#edc949',
            'Immobilier': '#af7aa1',
            'Cash': '#ff9da7'
        };
        
        // Si un type de portefeuille est spécifié, personnaliser les couleurs
        if (typeClass) {
            const typeColors = {
                'agressif': {
                    'Actions': '#ff7b00',
                    'Crypto': '#ff9e44',
                    'ETF': '#ffb266'
                },
                'modere': {
                    'Actions': '#00ff87',
                    'Obligations': '#4dffa8',
                    'ETF': '#80ffbf'
                },
                'stable': {
                    'Actions': '#00b2ff',
                    'Obligations': '#66cfff',
                    'ETF': '#99e0ff'
                }
            };
            
            if (typeColors[typeClass] && typeColors[typeClass][category]) {
                return typeColors[typeClass][category];
            }
        }
        
        return colors[category] || '#9c755f';
    }

    /**
     * Retourne une description pour chaque type de portefeuille
     */
    getPortfolioDescription(portfolioType) {
        switch(portfolioType.toLowerCase()) {
            case 'agressif':
                return 'Ce portefeuille vise une croissance maximale en privilégiant des actifs à forte volatilité et à haut potentiel. Idéal pour les investisseurs avec une tolérance élevée au risque et un horizon de placement long.';
            case 'modéré':
                return 'Ce portefeuille équilibré combine croissance et protection du capital. Il s\'adresse aux investisseurs qui recherchent une appréciation de leur capital à moyen terme tout en limitant la volatilité.';
            case 'stable':
                return 'Ce portefeuille défensif privilégie la préservation du capital et les revenus réguliers. Il convient aux investisseurs prudents ou proches de la retraite, cherchant à minimiser les fluctuations de leur portefeuille.';
            default:
                return 'Ce portefeuille est généré automatiquement en fonction des conditions de marché actuelles et des dernières actualités financières.';
        }
    }

    /**
     * Initialise les graphiques pour chaque portefeuille
     */
    initCharts() {
        if (!window.Chart) {
            console.warn('Chart.js n\'est pas disponible. Les graphiques ne seront pas affichés.');
            return;
        }
        
        Object.keys(this.portfolios).forEach(portfolioType => {
            const portfolio = this.portfolios[portfolioType];
            const ctx = document.getElementById(`chart-${portfolioType.toLowerCase()}`);
            
            if (!ctx) return;
            
            // Définir les palettes de couleurs selon le type de portefeuille
            let colorPalette;
            switch(portfolioType.toLowerCase()) {
                case 'agressif':
                    colorPalette = [
                        '#FF7B00', '#FF8F29', '#FFA352', '#FFB77A',
                        '#FFCBA3', '#FFE0CC', '#CC6300', '#994A00'
                    ];
                    break;
                case 'modéré':
                    colorPalette = [
                        '#00FF87', '#33FF9C', '#66FFAA', '#99FFB8',
                        '#B3FFC7', '#CCFFD6', '#00CC6A', '#00994F'
                    ];
                    break;
                case 'stable':
                    colorPalette = [
                        '#00B2FF', '#33C0FF', '#66CDFF', '#99DBFF',
                        '#B3E3FF', '#CCE7FF', '#008FCC', '#006C99'
                    ];
                    break;
                default:
                    colorPalette = [
                        '#4e79a7', '#f28e2c', '#e15759', '#76b7b2',
                        '#59a14f', '#edc949', '#af7aa1', '#ff9da7'
                    ];
            }
            
            // Préparer les données pour le graphique
            const categories = Object.keys(portfolio);
            const data = [];
            const labels = [];
            const colors = [];
            
            categories.forEach((category, index) => {
                const assets = portfolio[category];
                const categoryTotal = Object.values(assets).reduce((sum, value) => {
                    const numValue = parseFloat(value.replace('%', ''));
                    return sum + numValue;
                }, 0);
                
                if (categoryTotal > 0) {
                    data.push(categoryTotal);
                    labels.push(category);
                    colors.push(colorPalette[index % colorPalette.length]);
                }
            });
            
            // Créer le graphique en camembert
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            display: true,
                            position: 'right',
                            labels: {
                                color: function(context) {
                                    // Utiliser la couleur correspondante du type de portefeuille
                                    if (portfolioType.toLowerCase() === 'agressif') {
                                        return '#FF7B00';
                                    } else if (portfolioType.toLowerCase() === 'modéré') {
                                        return '#00FF87';
                                    } else {
                                        return '#00B2FF';
                                    }
                                },
                                font: {
                                    size: 12,
                                    family: "'Inter', sans-serif"
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(tooltipItem) {
                                    const value = tooltipItem.raw;
                                    const label = tooltipItem.label;
                                    return `${label}: ${value}%`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateScale: true,
                        animateRotate: true,
                        duration: 2000,
                        easing: 'easeOutQuart'
                    }
                }
            });
        });
    }

    /**
     * Configure les interactions utilisateur
     */
    setupInteractions() {
        // Gérer les clics sur les onglets
        document.querySelectorAll('.portfolio-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Désactiver tous les onglets et panneaux
                document.querySelectorAll('.portfolio-tab, .portfolio-panel').forEach(el => {
                    el.classList.remove('active');
                });
                
                // Activer l'onglet cliqué
                tab.classList.add('active');
                
                // Activer le panneau correspondant
                const targetPanel = document.getElementById(tab.dataset.target);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
                
                // Mettre à jour les couleurs selon le type de portefeuille
                const portfolioType = tab.dataset.target.replace('portfolio-', '');
                this.updatePortfolioColors(portfolioType);
                
                // Effet de transition sur le conteneur
                const container = document.querySelector('.portfolio-container');
                if (container) {
                    container.classList.add('transitioning');
                    setTimeout(() => {
                        container.classList.remove('transitioning');
                    }, 500);
                }
                
                // Mettre à jour l'URL sans recharger la page
                const newUrl = this.updateQueryStringParameter(window.location.href, 'type', portfolioType);
                history.pushState({ type: portfolioType }, '', newUrl);
                
                // Mettre à jour le titre de la page
                const titleElement = document.getElementById('portfolioTitle');
                if (titleElement) {
                    titleElement.textContent = `PORTEFEUILLE ${portfolioType.toUpperCase()}`;
                }
            });
        });
        
        // Gérer les clics sur le bouton de téléchargement
        document.querySelectorAll('.btn-download').forEach(button => {
            button.addEventListener('click', () => {
                const portfolioType = button.dataset.portfolio;
                this.downloadPortfolio(portfolioType);
            });
        });
        
        // Gérer les clics sur le bouton de partage
        document.querySelectorAll('.btn-share').forEach(button => {
            button.addEventListener('click', () => {
                const portfolioType = button.dataset.portfolio;
                this.sharePortfolio(portfolioType);
            });
        });
    }
    
    /**
     * Met à jour les couleurs de l'interface selon le type de portefeuille
     */
    updatePortfolioColors(type) {
        // Mettre à jour les variables CSS selon le type
        if (type === 'agressif') {
            document.documentElement.style.setProperty('--accent-color', 'var(--aggressive-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--aggressive-glow)');
        } else if (type === 'modere') {
            document.documentElement.style.setProperty('--accent-color', 'var(--moderate-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--moderate-glow)');
        } else if (type === 'stable') {
            document.documentElement.style.setProperty('--accent-color', 'var(--stable-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--stable-glow)');
        }
        
        // Mettre à jour la bordure du conteneur
        const container = document.querySelector('.portfolio-container');
        if (container) {
            container.style.borderColor = `var(--accent-color)`;
        }
    }
    
    /**
     * Modifie les paramètres de l'URL
     */
    updateQueryStringParameter(uri, key, value) {
        const re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
        const separator = uri.indexOf('?') !== -1 ? "&" : "?";
        
        if (uri.match(re)) {
            return uri.replace(re, '$1' + key + "=" + value + '$2');
        } else {
            return uri + separator + key + "=" + value;
        }
    }

    /**
     * Télécharge un portefeuille au format JSON
     */
    downloadPortfolio(portfolioType) {
        if (!this.portfolios || !this.portfolios[portfolioType]) return;
        
        const portfolioData = this.portfolios[portfolioType];
        const jsonString = JSON.stringify(portfolioData, null, 2);
        const blob = new Blob([jsonString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `tradepulse-portfolio-${portfolioType.toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Afficher une notification de succès
        this.showNotification(`Portefeuille ${portfolioType} téléchargé avec succès`);
    }

    /**
     * Partage un portefeuille
     */
    sharePortfolio(portfolioType) {
        if (!this.portfolios || !this.portfolios[portfolioType]) return;
        
        // Créer un texte de partage
        const shareText = `TradePulse - Portefeuille ${portfolioType}\n\n`;
        let portfolioText = '';
        
        Object.keys(this.portfolios[portfolioType]).forEach(category => {
            const assets = this.portfolios[portfolioType][category];
            if (Object.keys(assets).length === 0) return;
            
            portfolioText += `${category}:\n`;
            Object.keys(assets).forEach(asset => {
                portfolioText += `- ${asset}: ${assets[asset]}\n`;
            });
            portfolioText += '\n';
        });
        
        // Si l'API Web Share est disponible, l'utiliser
        if (navigator.share) {
            navigator.share({
                title: `TradePulse - Portefeuille ${portfolioType}`,
                text: shareText + portfolioText,
                url: window.location.href
            }).catch(err => {
                console.warn('Erreur lors du partage:', err);
                this.copyToClipboard(shareText + portfolioText);
            });
        } else {
            // Sinon, copier dans le presse-papier
            this.copyToClipboard(shareText + portfolioText);
        }
    }

    /**
     * Copie un texte dans le presse-papier
     */
    copyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            // Afficher une notification
            this.showNotification('Portefeuille copié dans le presse-papier!');
        } catch (err) {
            console.error('Impossible de copier le texte:', err);
            this.showNotification('Impossible de copier le portefeuille', 'error');
        }
        
        document.body.removeChild(textarea);
    }

    /**
     * Affiche une notification
     */
    showNotification(message, type = 'success') {
        // Vérifier si l'élément de notification existe déjà
        let notification = document.querySelector('.tradepulse-notification');
        
        // Si non, le créer
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'tradepulse-notification';
            document.body.appendChild(notification);
        }
        
        // Définir le type et le message
        notification.className = `tradepulse-notification ${type}`;
        notification.textContent = message;
        
        // Afficher la notification
        notification.style.display = 'block';
        notification.style.opacity = '1';
        
        // La masquer après 3 secondes
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 500);
        }, 3000);
    }

    /**
     * Formate une date en chaîne lisible
     */
    formatDate(date) {
        if (!date) return 'Indisponible';
        
        try {
            return new Intl.DateTimeFormat('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch (e) {
            return date.toString();
        }
    }
}

// Initialiser le gestionnaire de portefeuilles quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    const portfolioManager = new PortfolioManager();
    window.portfolioManager = portfolioManager; // Rendre accessible globalement
    portfolioManager.init();

    // S'assurer que les styles mis à jour sont chargés
    if (!document.querySelector('link[href="portfolio-styles-updated.css"]')) {
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = 'portfolio-styles-updated.css';
        document.head.appendChild(styleLink);
    }
});