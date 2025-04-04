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
     * Fonction utilitaire pour normaliser les types de portefeuille (enlever les accents)
     */
    normalizePortfolioType(type) {
        // Normaliser en retirant les accents et en minuscules
        return type.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
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
                "Commentaire": "Ce portefeuille vise une croissance maximale en privilégiant des actifs à forte volatilité et à haut potentiel. Idéal pour les investisseurs avec une tolérance élevée au risque et un horizon de placement long.",
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
                "Commentaire": "Ce portefeuille équilibré combine croissance et protection du capital. Il s'adresse aux investisseurs qui recherchent une appréciation de leur capital à moyen terme tout en limitant la volatilité.",
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
                "Commentaire": "Ce portefeuille défensif privilégie la préservation du capital et les revenus réguliers. Il convient aux investisseurs prudents ou proches de la retraite, cherchant à minimiser les fluctuations de leur portefeuille.",
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
                
                // Standardiser les ID pour éviter les problèmes d'accent
                const normalizedType = this.normalizePortfolioType(portfolioType);
                tab.dataset.target = `portfolio-${normalizedType}`;
                tab.dataset.originalType = portfolioType; // Garder le type original
                
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
                    
                    // Standardiser les ID pour éviter les problèmes d'accent
                    const normalizedType = this.normalizePortfolioType(portfolioType);
                    tab.dataset.target = `portfolio-${normalizedType}`;
                    tab.dataset.originalType = portfolioType; // Garder le type original
                    
                    tab.innerHTML = `
                        <span class="tab-icon">
                            ${this.getPortfolioIcon(portfolioType)}
                        </span>
                        <span class="tab-text">${portfolioType}</span>
                    `;
                    tabsContainer.appendChild(tab);
                });
            } else {
                // Mettre à jour les onglets existants avec les data-original-type
                existingTabs.forEach(tab => {
                    const targetType = tab.dataset.target.replace('portfolio-', '');
                    tab.dataset.originalType = this.getOriginalType(targetType);
                });
            }
        }
        
        // Créer le contenu pour chaque portefeuille
        Object.keys(this.portfolios).forEach((portfolioType, index) => {
            // Créer le contenu du portefeuille
            const content = document.createElement('div');
            content.className = `portfolio-panel ${index === 0 ? 'active' : ''}`;
            
            // Standardiser les ID pour éviter les problèmes d'accent
            const normalizedType = this.normalizePortfolioType(portfolioType);
            content.id = `portfolio-${normalizedType}`;
            
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
     * Récupère le type original à partir du type normalisé
     */
    getOriginalType(normalizedType) {
        // Correspondance entre les types normalisés et originaux
        const typeMap = {
            'agressif': 'Agressif',
            'modere': 'Modéré',
            'stable': 'Stable'
        };
        
        return typeMap[normalizedType] || normalizedType;
    }

    /**
     * Génère l'icône correspondant au type de portefeuille
     */
    getPortfolioIcon(portfolioType) {
        switch(this.normalizePortfolioType(portfolioType)) {
            case 'agressif':
                return '<i class="fas fa-rocket"></i>';
            case 'modere':
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
        const normalizedType = this.normalizePortfolioType(portfolioType);
        
        if (normalizedType === 'agressif') {
            typeColor = '#FF7B00';
            typeClass = 'agressif';
        } else if (normalizedType === 'modere') {
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
        
        // Récupérer le commentaire du JSON (ou utiliser la description par défaut si non disponible)
        // S'assurer que le commentaire est traité comme une chaîne de caractères
        let portfolioComment = "";
        if (typeof portfolio["Commentaire"] === "string") {
            portfolioComment = portfolio["Commentaire"];
        } else {
            portfolioComment = description;
        }
        
        // Compter le nombre total d'actifs (en excluant le champ Commentaire)
        const totalAssets = Object.keys(portfolio).reduce((sum, key) => {
            if (key !== "Commentaire" && typeof portfolio[key] === 'object') {
                return sum + Object.keys(portfolio[key]).length;
            }
            return sum;
        }, 0);
        
        // Génération du graphique coloré selon le type
        const chartHTML = `
            <div class="portfolio-chart-container">
                <canvas id="chart-${normalizedType}" width="300" height="300"></canvas>
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
        `;
        
        // Ajouter la section d'explication améliorée avec un design plus moderne
        html += `
            <div class="portfolio-explanation">
                <div class="explanation-header">
                    <i class="fas fa-lightbulb"></i>
                    <span>Stratégie d'investissement</span>
                </div>
                <div class="explanation-content">
                    <div class="insight-quote">
                        <i class="fas fa-quote-left quote-icon"></i>
                        ${this.formatComment(portfolioComment)}
                        <i class="fas fa-quote-right quote-icon right-quote"></i>
                    </div>
                    <div class="insight-decorator">
                        <span class="insight-line"></span>
                        <span class="insight-dot"></span>
                        <span class="insight-line"></span>
                    </div>
                </div>
            </div>
        `;
        
        html += `
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
            // Ignorer le champ Commentaire
            if (category === "Commentaire") return;
            
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
     * Formate le commentaire pour mettre en évidence les informations importantes
     */
    formatComment(comment) {
        if (!comment || typeof comment !== 'string') return '';
        
        // Mettre en évidence les mots-clés importants
        return comment
            .replace(/\b(croissance|hausse|baisse|performance|volatilité|rendement|secteur|tendance)\b/gi, '<span class="highlight-point">$1</span>')
            .replace(/\b(\+\d+%|-\d+%|\d+%)\b/g, '<span class="highlight-point">$1</span>');
    }

    /**
     * Calcule la répartition par catégorie d'un portefeuille
     */
    calculateCategoryAllocation(portfolio) {
        const allocation = {};
        
        Object.keys(portfolio).forEach(category => {
            // Ignorer le champ Commentaire
            if (category === "Commentaire") return;
            
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
        const normalizedType = this.normalizePortfolioType(portfolioType);
        
        switch(normalizedType) {
            case 'agressif':
                return 'Ce portefeuille vise une croissance maximale en privilégiant des actifs à forte volatilité et à haut potentiel. Idéal pour les investisseurs avec une tolérance élevée au risque et un horizon de placement long.';
            case 'modere':
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
            const normalizedType = this.normalizePortfolioType(portfolioType);
            const ctx = document.getElementById(`chart-${normalizedType}`);
            
            if (!ctx) {
                console.warn(`Élément canvas non trouvé pour ${normalizedType}`);
                return;
            }
            
            // Définir les palettes de couleurs selon le type de portefeuille
            let colorPalette;
            switch(normalizedType) {
                case 'agressif':
                    colorPalette = [
                        '#FF7B00', '#FF8F29', '#FFA352', '#FFB77A',
                        '#FFCBA3', '#FFE0CC', '#CC6300', '#994A00'
                    ];
                    break;
                case 'modere':
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
                // Ignorer le champ Commentaire
                if (category === "Commentaire") return;
                
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
                                    if (normalizedType === 'agressif') {
                                        return '#FF7B00';
                                    } else if (normalizedType === 'modere') {
                                        return '#00FF87';
                                    } else {
                                        return '#00B2FF';
                                    }
                                },
                                font: {
                                    size: 11, // Réduire la taille de police des légendes
                                    family: "'Inter', sans-serif"
                                },
                                padding: 8 // Réduire le padding des étiquettes
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
                    },
                    layout: {
                        padding: {
                            left: 0,
                            right: 0,
                            top: 0,
                            bottom: 0
                        }
                    }
                }
            });
        });
    }

    /**
     * Configure les interactions utilisateur
     */
    setupInteractions() {
        console.log('Configuration des interactions des onglets de portefeuille');
        
        // Gérer les clics sur les onglets
        document.querySelectorAll('.portfolio-tab').forEach(tab => {
            console.log('Onglet trouvé:', tab.dataset.target);
            
            tab.addEventListener('click', () => {
                console.log('Clic sur onglet:', tab.dataset.target);
                
                // Désactiver tous les onglets et panneaux
                document.querySelectorAll('.portfolio-tab, .portfolio-panel').forEach(el => {
                    el.classList.remove('active');
                });
                
                // Activer l'onglet cliqué
                tab.classList.add('active');
                
                // Activer le panneau correspondant
                const targetPanel = document.getElementById(tab.dataset.target);
                if (targetPanel) {
                    console.log('Panneau cible trouvé:', tab.dataset.target);
                    targetPanel.classList.add('active');
                } else {
                    console.error('Panneau cible non trouvé:', tab.dataset.target);
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
                    // Utiliser le type original (avec accents) s'il est disponible
                    const originalType = tab.dataset.originalType || portfolioType;
                    titleElement.textContent = `PORTEFEUILLE ${originalType.toUpperCase()}`;
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
        console.log('Mise à jour des couleurs pour le type:', type);
        // Mettre à jour les variables CSS selon le type
        const normalizedType = this.normalizePortfolioType(type);
        
        if (normalizedType === 'agressif') {
            document.documentElement.style.setProperty('--accent-color', 'var(--aggressive-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--aggressive-glow)');
        } else if (normalizedType === 'modere') {
            document.documentElement.style.setProperty('--accent-color', 'var(--moderate-color)');
            document.documentElement.style.setProperty('--accent-glow', 'var(--moderate-glow)');
        } else if (normalizedType === 'stable') {
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
     * Génère et télécharge un PDF du portefeuille
     */
    downloadPortfolio(portfolioType) {
        if (!this.portfolios || !this.portfolios[portfolioType]) return;
        
        // Vérifier que jsPDF est disponible
        if (!window.jspdf || !window.html2canvas) {
            console.error('Les bibliothèques jsPDF ou html2canvas ne sont pas chargées');
            this.showNotification('Erreur lors de la génération du PDF', 'error');
            return;
        }
        
        // Créer un élément temporaire pour générer le PDF
        const tempElement = document.createElement('div');
        tempElement.className = 'pdf-container';
        tempElement.style.width = '210mm'; // Format A4
        tempElement.style.padding = '15mm';
        tempElement.style.backgroundColor = '#071629'; // Fond bleu foncé
        tempElement.style.color = 'white';
        tempElement.style.fontFamily = "'Inter', sans-serif";
        tempElement.style.position = 'absolute';
        tempElement.style.left = '-9999px'; // Hors de la vue
        tempElement.style.top = '0';
        
        // Récupérer les données du portefeuille
        const portfolioData = this.portfolios[portfolioType];
        const normalizedType = this.normalizePortfolioType(portfolioType);
        
        // Déterminer la couleur d'accentuation selon le type de portefeuille
        let accentColor;
        if (normalizedType === 'agressif') {
            accentColor = '#FF7B00'; // Orange
        } else if (normalizedType === 'modere') {
            accentColor = '#00FF87'; // Vert
        } else {
            accentColor = '#00B2FF'; // Bleu
        }
        
        // Préparer la description du portefeuille
        const description = this.getPortfolioDescription(portfolioType);
        
        // Récupérer le commentaire du portefeuille
        let portfolioComment = "";
        if (typeof portfolioData["Commentaire"] === "string") {
            portfolioComment = portfolioData["Commentaire"];
        } else {
            portfolioComment = description;
        }
        
        // Préparer la date actuelle
        const now = new Date();
        const formattedDate = now.toLocaleDateString('fr-FR') + ' à ' + 
                          now.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
        
        // Générer le contenu HTML du PDF
        tempElement.innerHTML = `
            <div style="text-align: center; margin-bottom: 30px;">
                <div style="width: 40px; height: 40px; background-color: ${accentColor}; border-radius: 50%; margin: 0 auto 15px;"></div>
                <h1 style="font-size: 28px; font-weight: 900; margin: 0; letter-spacing: 1px; color: white;">TRADEPULSE</h1>
                <p style="font-size: 14px; color: rgba(255,255,255,0.7); margin: 5px 0 30px;">POWERED BY PERPLEXITY AI</p>
                
                <h2 style="font-size: 24px; color: ${accentColor}; margin: 30px 0; text-transform: uppercase;">PORTEFEUILLE ${portfolioType.toUpperCase()}</h2>
                
                <p style="font-size: 16px; line-height: 1.5; color: rgba(255,255,255,0.9); margin: 0 auto 30px; max-width: 650px; text-align: center;">
                    ${description}
                </p>

                <div style="border-left: 4px solid ${accentColor}; background-color: rgba(255,255,255,0.05); padding: 15px; text-align: left; margin: 20px 0 30px; border-radius: 6px;">
                    <h3 style="color: ${accentColor}; font-size: 18px; margin-bottom: 10px;">Analyse du marché</h3>
                    <p style="font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.9); margin: 0;">
                        ${portfolioComment}
                    </p>
                </div>
                
                <p style="font-size: 14px; color: rgba(255,255,255,0.6); margin: 20px 0 40px;">
                    Généré le ${formattedDate}
                </p>
            </div>
        `;
        
        // Créer un tableau de style moderne avec les colonnes alignées exactement comme dans l'image
        tempElement.innerHTML += `
            <div style="width: 100%; overflow: hidden; margin-bottom: 40px;">
                <!-- En-têtes de colonne avec le style exact de l'image -->
                <div style="display: flex; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="flex: 3; text-align: left; color: ${accentColor}; font-size: 16px; font-weight: bold;">INSTRUMENT</div>
                    <div style="flex: 1; text-align: left; color: ${accentColor}; font-size: 16px; font-weight: bold;">SYMBOLE</div>
                    <div style="flex: 1; text-align: left; color: ${accentColor}; font-size: 16px; font-weight: bold;">TYPE</div>
                    <div style="flex: 1; text-align: right; color: ${accentColor}; font-size: 16px; font-weight: bold;">ALLOCATION</div>
                </div>
        `;
        
        // Parcourir toutes les catégories et actifs pour les ajouter au tableau
        let assets = [];
        
        // Transformer les données de portefeuille en un tableau d'actifs
        Object.keys(portfolioData).forEach(category => {
            // Ignorer le champ Commentaire
            if (category === "Commentaire") return;
            
            const categoryAssets = portfolioData[category];
            Object.keys(categoryAssets).forEach(asset => {
                // Déterminer le symbole
                let symbol = this.getAssetSymbol(asset, category);
                
                assets.push({
                    name: asset,
                    symbol: symbol,
                    type: category,
                    allocation: categoryAssets[asset]
                });
            });
        });
        
        // Trier les actifs par allocation (du plus grand au plus petit)
        assets.sort((a, b) => {
            const allocationA = parseFloat(a.allocation.replace('%', ''));
            const allocationB = parseFloat(b.allocation.replace('%', ''));
            return allocationB - allocationA;
        });
        
        // Ajouter chaque actif au tableau avec l'alignement exact
        assets.forEach(asset => {
            const allocation = asset.allocation;
            const allocValue = parseFloat(allocation.replace('%', ''));
            
            // Déterminer la couleur de l'allocation selon sa valeur
            let allocColor;
            if (allocValue >= 15) {
                allocColor = accentColor;
            } else if (allocValue >= 10) {
                allocColor = accentColor + 'CC'; // 80% d'opacité
            } else {
                allocColor = accentColor + '99'; // 60% d'opacité
            }
            
            tempElement.innerHTML += `
                <div style="display: flex; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 12px 0;">
                    <div style="flex: 3; text-align: left; color: white; font-size: 14px;">${asset.name}</div>
                    <div style="flex: 1; text-align: left; color: rgba(255,255,255,0.8); font-size: 14px;">${asset.symbol}</div>
                    <div style="flex: 1; text-align: left; color: rgba(255,255,255,0.8); font-size: 14px;">${asset.type}</div>
                    <div style="flex: 1; text-align: right; color: ${allocColor}; font-weight: bold; font-size: 14px;">${allocation}</div>
                </div>
            `;
        });
        
        // Fermer la div du tableau
        tempElement.innerHTML += `
            </div>
            
            <div style="margin-top: 40px; text-align: center; font-size: 12px; color: rgba(255,255,255,0.5);">
                <p>Ce document est généré à titre informatif uniquement. Ne constitue pas un conseil en investissement.</p>
                <p>TradePulse © ${new Date().getFullYear()} | Données fournies par Perplexity AI</p>
            </div>
        `;
        
        // Ajouter l'élément temporaire au document
        document.body.appendChild(tempElement);
        
        // Afficher une notification de chargement
        this.showNotification('Génération du PDF en cours...', 'info');
        
        // Utiliser html2canvas pour convertir l'élément en image
        html2canvas(tempElement, {
            scale: 2, // Meilleure qualité
            useCORS: true,
            backgroundColor: '#071629'
        }).then(canvas => {
            // Créer un PDF avec jsPDF
            const pdf = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            // Dimensions de la page A4 en mm
            const pageWidth = 210;
            const pageHeight = 297;
            
            // Obtenir les dimensions du canvas
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            
            // Calculer les dimensions pour le PDF
            let pdfWidth = pageWidth;
            let pdfHeight = pdfWidth / ratio;
            
            // Si l'image est plus grande que la page, créer plusieurs pages
            let position = 0;
            
            if (pdfHeight <= pageHeight) {
                // Si l'image tient sur une seule page
                pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pdfWidth, pdfHeight);
            } else {
                // Si l'image est plus grande que la page, la diviser en plusieurs pages
                while (position < imgHeight) {
                    pdf.addImage(
                        canvas.toDataURL('image/jpeg', 1.0),
                        'JPEG',
                        0,
                        -position,
                        pdfWidth,
                        pdfHeight
                    );
                    position += pageHeight;
                    
                    if (position < imgHeight) {
                        pdf.addPage();
                    }
                }
            }
            
            // Télécharger le PDF
            pdf.save(`tradepulse-portfolio-${normalizedType}.pdf`);
            
            // Afficher une notification de succès
            this.showNotification(`Portefeuille ${portfolioType} téléchargé avec succès`, 'success');
            
            // Supprimer l'élément temporaire
            document.body.removeChild(tempElement);
        }).catch(error => {
            console.error('Erreur lors de la génération du PDF:', error);
            this.showNotification('Erreur lors de la génération du PDF', 'error');
            document.body.removeChild(tempElement);
        });
    }

    /**
     * Fonction utilitaire pour obtenir un symbole boursier pour un actif
     * À personnaliser selon vos données réelles
     */
    getAssetSymbol(assetName, category) {
        // Mapping des noms d'actifs vers leurs symboles
        const symbolMap = {
            'Apple': 'AAPL',
            'Microsoft': 'MSFT',
            'Amazon.com': 'AMZN',
            'NVIDIA Corporation': 'NVDA',
            'Nvidia': 'NVDA',
            'Tesla': 'TSLA',
            'Alphabet': 'GOOGL',
            'Meta Platforms': 'META',
            'Johnson & Johnson': 'JNJ',
            'Procter & Gamble': 'PG',
            'Coca-Cola': 'KO',
            'McDonald\'s': 'MCD',
            'Bitcoin ETF': 'BTCQ',
            'Ethereum ETF': 'ETHQ',
            'ARK Innovation ETF': 'ARKK',
            'SPDR S&P 500 ETF': 'SPY',
            'Vanguard Total Stock Market ETF': 'VTI',
            'iShares Core MSCI EAFE ETF': 'IEFA',
            'Vanguard High Dividend Yield ETF': 'VYM',
            'SPDR Gold Shares': 'GLD',
            'Shopify': 'SHOP',
            'Apple Inc.': 'AAPL',
            'Tesla, Inc.': 'TSLA',
            'Amazon.com, Inc.': 'AMZN',
            'ARK Innovation ETF': 'ARKK',
            'Bitcoin ETF': 'BTCQ',
            'Shopify Inc.': 'SHOP'
        };
        
        // Extraire le nom de l'entreprise des noms d'actifs contenant "Inc." ou d'autres suffixes
        const simpleName = assetName.split(' Inc.')[0].split(' Corporation')[0].trim();
        
        // Vérifier si le nom de l'actif existe dans notre mapping
        if (symbolMap[simpleName]) {
            return symbolMap[simpleName];
        }
        
        if (symbolMap[assetName]) {
            return symbolMap[assetName];
        }
        
        // Si non trouvé, créer un symbole générique basé sur le nom
        // Par exemple, pour "US Treasury 10Y", retourner "UST10Y"
        if (category === 'Obligations') {
            if (assetName.includes('Treasury')) {
                return 'UST' + assetName.match(/\d+Y/)?.[0] || '10Y';
            } else if (assetName.includes('Corporate')) {
                return 'CORP' + assetName.match(/[A-Z]{3}/)?.[0] || 'AAA';
            } else if (assetName.includes('Municipal')) {
                return 'MUNI' + assetName.match(/[A-Z]{3}/)?.[0] || 'AAA';
            }
        }
        
        // Pour les cryptos sans ETF dans le nom
        if (category === 'Crypto' && !assetName.includes('ETF')) {
            if (assetName === 'Bitcoin') return 'BTC';
            if (assetName === 'Ethereum') return 'ETH';
        }
        
        // Par défaut, prendre les premières lettres du nom
        // Par exemple "Apple Inc." deviendrait "APPL"
        const words = simpleName.split(' ');
        if (words.length === 1) {
            // Un seul mot, prendre les 4 premières lettres
            return words[0].substring(0, 4).toUpperCase();
        } else {
            // Plusieurs mots, prendre la première lettre de chaque mot (max 4 lettres)
            return words.slice(0, 4).map(word => word[0]).join('').toUpperCase();
        }
    }

    /**
     * Partage un portefeuille
     */
    sharePortfolio(portfolioType) {
        if (!this.portfolios || !this.portfolios[portfolioType]) return;
        
        // Créer un texte de partage
        const shareText = `TradePulse - Portefeuille ${portfolioType}\n\n`;
        let portfolioText = '';
        
        // Ajouter le commentaire du portefeuille
        if (this.portfolios[portfolioType]["Commentaire"]) {
            portfolioText += `${this.portfolios[portfolioType]["Commentaire"]}\n\n`;
        }
        
        Object.keys(this.portfolios[portfolioType]).forEach(category => {
            // Ignorer le champ Commentaire
            if (category === "Commentaire") return;
            
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
    console.log('Initialisation du gestionnaire de portefeuilles');
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