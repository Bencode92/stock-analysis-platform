// StockPro - Application d'analyse d'actions en temps réel
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const searchInput = document.getElementById('stockSearch');
    const searchBtn = document.getElementById('searchBtn');
    const currentPrice = document.querySelector('.current-price');
    const priceChange = document.querySelector('.price-change');
    const stockInfoTitle = document.querySelector('.stock-info h2');
    const exchangeElement = document.querySelector('.exchange');
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span');
    const aiAnalysisContent = document.getElementById('ai-analysis-content');
    const currentTimeElement = document.getElementById('current-time');
    const updateTimeElement = document.querySelector('.update-time');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const stocksTableBody = document.getElementById('stocks-tbody');
    const bullishSectorsContainer = document.getElementById('bullishSectors');
    const bearishSectorsContainer = document.getElementById('bearishSectors');
    const portfolioTableBody = document.getElementById('portfolioTableBody');
    const portfolioChartCanvas = document.getElementById('portfolioChart');
    
    // Métriques
    const openPrice = document.getElementById('open-price');
    const prevClose = document.getElementById('prev-close');
    const dayHigh = document.getElementById('day-high');
    const dayLow = document.getElementById('day-low');
    const volume = document.getElementById('volume');
    const marketCap = document.getElementById('market-cap');
    const peRatio = document.getElementById('pe-ratio');
    const dividend = document.getElementById('dividend');
    
    // Variables globales
    let currentSymbol = 'AAPL'; // Par défaut on affiche Apple
    let stockData = null; // Stockage des données actuelles pour l'action
    let widget = null; // Instance du widget TradingView
    let allStocksData = {}; // Pour stocker les données de toutes les actions
    let portfolioChart = null; // Pour stocker l'instance du graphique Chart.js
    let sectorData = {}; // Pour stocker les données des secteurs
    let portfolioData = {}; // Pour stocker les données du portefeuille recommandé
    
    // Liste des actions populaires pour suggestion
    const popularStocks = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'BRK.B',
        'WMT', 'JNJ', 'PG', 'UNH', 'HD', 'BAC', 'KO', 'INTC', 'DIS', 'CSCO'
    ];
    
    // Initialisation
    function init() {
        // Initialiser le graphique TradingView
        initTradingViewChart();
        
        // Initialiser le tableau des actions
        initStocksList();
        
        // Charger les données en temps réel pour Apple
        fetchStockData(currentSymbol);
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Mettre à jour l'heure de marché
        updateMarketTime();
        
        // Configurer le mode plein écran
        setupFullscreenMode();
        
        // Initialiser le graphique du portefeuille
        initPortfolioChart();
        
        // Charger les données des secteurs
        loadSectorData();
        
        // Charger les données du portefeuille recommandé
        loadPortfolioData();
        
        // Mettre à jour régulièrement l'heure et les données
        setInterval(updateMarketTime, 1000);
        setInterval(() => fetchStockData(currentSymbol, false), 60000); // Rafraîchir toutes les minutes
    }
    
    // Initialiser les données du tableau des actions
    function initStocksList() {
        // Charger et afficher les données pour toutes les actions populaires
        loadAllStocksData();
    }
    
    // Charger les données pour toutes les actions populaires
    async function loadAllStocksData() {
        // Afficher un indicateur de chargement dans le tableau
        if (stocksTableBody) {
            stocksTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px;">
                        <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid rgba(28, 118, 255, 0.3); border-top-color: var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <p style="margin-top: 10px;">Chargement des données...</p>
                    </td>
                </tr>
            `;
        }
        
        // Créer un tableau pour stocker toutes les promesses de requêtes
        const promises = [];
        
        // Pour chaque action populaire, créer une promesse pour récupérer les données
        popularStocks.forEach(symbol => {
            promises.push(
                fetchSimulatedStockData(symbol)
                    .then(data => {
                        allStocksData[symbol] = data;
                        return data;
                    })
                    .catch(error => {
                        console.error(`Erreur lors de la récupération des données pour ${symbol}:`, error);
                        return null;
                    })
            );
        });
        
        // Attendre que toutes les promesses soient résolues
        await Promise.all(promises);
        
        // Afficher les données dans le tableau
        updateStocksTable();
    }
    
    // Mettre à jour le tableau des actions avec les données disponibles
    function updateStocksTable() {
        if (!stocksTableBody) return;
        
        // Trier les actions par capitalisation boursière (du plus grand au plus petit)
        const sortedStocks = Object.values(allStocksData).sort((a, b) => {
            // Convertir la capitalisation boursière en nombre pour le tri
            const capA = convertMarketCapToNumber(a.marketCap);
            const capB = convertMarketCapToNumber(b.marketCap);
            return capB - capA;
        });
        
        // Générer le HTML pour chaque ligne du tableau
        let tableHtml = '';
        sortedStocks.forEach((stock, index) => {
            const isPositiveDay = parseFloat(stock.changePercent) >= 0;
            const isPositiveWeek = parseFloat(stock.performance.weekChange) >= 0;
            
            tableHtml += `
                <tr data-symbol="${stock.symbol}" class="${stock.symbol === currentSymbol ? 'selected-stock' : ''}">
                    <td>${index + 1}</td>
                    <td>
                        <div class="stock-name">
                            <img class="stock-icon" src="https://logo.clearbit.com/${stock.name.toLowerCase().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}.com" 
                                 onerror="this.src='https://via.placeholder.com/24x24?text=${stock.symbol.charAt(0)}'">
                            <span class="stock-symbol">${stock.symbol}</span>
                            <span class="stock-fullname">${stock.name.split(' ')[0]}</span>
                        </div>
                    </td>
                    <td>$${typeof stock.price === 'number' ? stock.price.toFixed(2) : stock.price}</td>
                    <td class="${isPositiveDay ? 'positive' : 'negative'}">${isPositiveDay ? '+' : ''}${stock.changePercent}%</td>
                    <td class="${isPositiveWeek ? 'positive' : 'negative'}">${isPositiveWeek ? '+' : ''}${stock.performance.weekChange}%</td>
                    <td>${stock.volume}</td>
                    <td>${stock.marketCap}</td>
                </tr>
            `;
        });
        
        if (stocksTableBody) {
            stocksTableBody.innerHTML = tableHtml;
            
            // Ajouter des écouteurs d'événements pour chaque ligne
            document.querySelectorAll('#stocks-tbody tr').forEach(row => {
                row.addEventListener('click', function() {
                    const symbol = this.getAttribute('data-symbol');
                    if (symbol) {
                        searchStock(symbol);
                        
                        // Mettre à jour la classe selected-stock
                        document.querySelectorAll('#stocks-tbody tr').forEach(r => {
                            r.classList.remove('selected-stock');
                        });
                        this.classList.add('selected-stock');
                    }
                });
            });
        }
    }
    
    // Convertir la capitalisation boursière en nombre pour le tri
    function convertMarketCapToNumber(marketCap) {
        if (!marketCap) return 0;
        
        const value = parseFloat(marketCap.replace(/[^0-9.]/g, ''));
        const unit = marketCap.slice(-1).toUpperCase();
        
        switch (unit) {
            case 'T': return value * 1000000000000;
            case 'B': return value * 1000000000;
            case 'M': return value * 1000000;
            case 'K': return value * 1000;
            default: return value;
        }
    }
    
    // Initialiser le graphique TradingView
    function initTradingViewChart() {
        const chartContainer = document.getElementById('tradingview-chart');
        
        if (chartContainer) {
            widget = new TradingView.widget({
                container_id: 'tradingview-chart',
                symbol: 'NASDAQ:AAPL',
                interval: 'D',
                timezone: 'Europe/Paris',
                theme: 'dark',
                style: '1',
                locale: 'fr',
                toolbar_bg: '#0a0a14', // Couleur de fond pour le toolbar (noir avec nuance bleue)
                enable_publishing: false,
                allow_symbol_change: true,
                save_image: true,
                hide_side_toolbar: false,
                studies: [
                    "MASimple@tv-basicstudies",
                    "RSI@tv-basicstudies"
                ],
                studies_overrides: {
                    "volume.volume.color.0": "#ff2c2c", // Rouge pour le volume négatif
                    "volume.volume.color.1": "#12ff56", // Vert pour le volume positif
                },
                disabled_features: [
                    "header_symbol_search",
                    "symbol_search_hot_key"
                ],
                enabled_features: [
                    "use_localstorage_for_settings"
                ],
                overrides: {
                    // Couleurs de fond et de grille
                    "paneProperties.background": "#0a0a14", // Noir avec nuance bleue
                    "paneProperties.vertGridProperties.color": "rgba(28, 48, 80, 0.2)", // Bleu très foncé
                    "paneProperties.horzGridProperties.color": "rgba(28, 48, 80, 0.2)", // Bleu très foncé
                    
                    // Couleurs des chandeliers
                    "mainSeriesProperties.candleStyle.upColor": "#12ff56", // Vert vif
                    "mainSeriesProperties.candleStyle.downColor": "#ff2c2c", // Rouge vif
                    "mainSeriesProperties.candleStyle.wickUpColor": "#12ff56", // Vert vif
                    "mainSeriesProperties.candleStyle.wickDownColor": "#ff2c2c", // Rouge vif
                    "mainSeriesProperties.candleStyle.borderUpColor": "#12ff56", // Vert vif
                    "mainSeriesProperties.candleStyle.borderDownColor": "#ff2c2c", // Rouge vif
                    
                    // Barre de volume
                    "volumePaneSize": "medium",
                    
                    // Accentuation de couleurs
                    "scalesProperties.lineColor": "#1c3050", // Bleu foncé
                    "scalesProperties.textColor": "#8894a8", // Gris bleuté
                    
                    // Surlignement
                    "mainSeriesProperties.areaStyle.color1": "rgba(28, 118, 255, 0.2)", // Bleu primaire avec alpha
                    "mainSeriesProperties.areaStyle.color2": "rgba(28, 118, 255, 0.05)", // Bleu primaire avec alpha plus faible
                    "mainSeriesProperties.areaStyle.linecolor": "#1c76ff", // Bleu primaire
                }
            });
            
            // Attendre que le widget soit prêt
            widget.onChartReady(function() {
                console.log("TradingView chart ready");
                
                // Écouter le changement de symbole
                widget.chart().onSymbolChanged().subscribe(null, function(symbolData) {
                    const newSymbol = symbolData.ticker.split(':')[1];
                    console.log("Symbol changed to:", newSymbol);
                    if (newSymbol !== currentSymbol) {
                        searchStock(newSymbol);
                    }
                });
            });
        }
    }
    
    // Initialiser le graphique du portefeuille en camembert
    function initPortfolioChart() {
        if (!portfolioChartCanvas) return;
        
        // Configuration du graphique en camembert
        const data = {
            // Labels provisoires, seront remplacés par les données réelles
            labels: ['Actions', 'ETF', 'Crypto'],
            datasets: [{
                data: [60, 30, 10], // Valeurs provisoires
                backgroundColor: [
                    '#ffffff', // Blanc pour les actions
                    '#cccccc', // Gris clair pour les ETF
                    '#888888'  // Gris foncé pour les crypto
                ],
                borderColor: '#0a0a14', // Couleur de fond de la plateforme
                borderWidth: 1
            }]
        };
        
        // Options du graphique
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#e0e0e0', // Couleur du texte pour les labels
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map(function(label, i) {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    
                                    return {
                                        text: `${label} (${data.datasets[0].data[i]}%)`,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: isNaN(data.datasets[0].data[i]) || meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value}%`;
                        }
                    }
                }
            }
        };
        
        // Créer le graphique
        portfolioChart = new Chart(portfolioChartCanvas, {
            type: 'pie',
            data: data,
            options: options
        });
    }
    
    // Charger les données des secteurs
    function loadSectorData() {
        // Simulation des données de secteurs
        sectorData = {
            bullish: [
                {
                    name: "Automobile & VE",
                    reason: "La décision de la Maison Blanche concernant le report des droits de douane a un impact positif direct sur les constructeurs automobiles, particulièrement ceux investis dans les véhicules électriques."
                },
                {
                    name: "Technologie",
                    reason: "Les résultats attendus de sociétés comme Broadcom et le développement continu de l'IA poussent le secteur vers le haut, malgré les tensions sino-américaines."
                },
                {
                    name: "Énergie renouvelable",
                    reason: "Les initiatives de transition énergétique continuent de favoriser les entreprises du secteur, particulièrement dans le contexte des tensions géopolitiques actuelles."
                }
            ],
            bearish: [
                {
                    name: "Obligations",
                    reason: "La hausse historique des rendements obligataires européens indique une pression à la baisse sur les prix des obligations, impactant les détenteurs d'obligations à long terme."
                },
                {
                    name: "Immobilier",
                    reason: "La hausse des taux d'intérêt et l'incertitude concernant les décisions de la BCE exercent une pression sur le secteur immobilier, particulièrement sensible aux variations de taux."
                },
                {
                    name: "Importateurs chinois",
                    reason: "Les tensions commerciales croissantes entre les États-Unis et la Chine menacent les entreprises fortement dépendantes des importations chinoises, créant de l'incertitude pour leurs modèles d'approvisionnement."
                }
            ]
        };
        
        // Mise à jour de l'affichage des secteurs
        updateSectorsDisplay();
    }
    
    // Charger les données du portefeuille recommandé
    function loadPortfolioData() {
        // Simulation des données du portefeuille
        portfolioData = [
            {
                name: "Tesla, Inc.",
                symbol: "TSLA",
                type: "stock",
                allocation: 15,
                reason: "Bénéficie directement du report des droits de douane avec une forte présence sur le marché européen et chinois. Le secteur automobile et VE est haussier."
            },
            {
                name: "NVIDIA Corporation",
                symbol: "NVDA",
                type: "stock",
                allocation: 18,
                reason: "Leader dans les puces IA avec des résultats exceptionnels. Profite de la tendance haussière du secteur technologique malgré les tensions commerciales."
            },
            {
                name: "Microsoft Corporation",
                symbol: "MSFT",
                type: "stock",
                allocation: 12,
                reason: "Position dominante dans le cloud et l'IA, moins impacté par les tensions sino-américaines grâce à sa diversification géographique."
            },
            {
                name: "Vestas Wind Systems",
                symbol: "VWS.CO",
                type: "stock",
                allocation: 8,
                reason: "Leader mondial de l'énergie éolienne, bénéficiant de la tendance favorable aux énergies renouvelables et des initiatives de transition énergétique."
            },
            {
                name: "Invesco Solar ETF",
                symbol: "TAN",
                type: "etf",
                allocation: 10,
                reason: "Exposition au secteur de l'énergie solaire, profitant de la tendance positive du secteur des énergies renouvelables."
            },
            {
                name: "Global X Autonomous & Electric Vehicles ETF",
                symbol: "DRIV",
                type: "etf",
                allocation: 12,
                reason: "Exposition diversifiée au secteur des VE et de la conduite autonome, bénéficiant des décisions favorables sur les droits de douane."
            },
            {
                name: "ARK Innovation ETF",
                symbol: "ARKK",
                type: "etf",
                allocation: 10,
                reason: "Exposition aux entreprises disruptives dans les secteurs de la technologie et de l'innovation, alignée avec les tendances haussières identifiées."
            },
            {
                name: "Bitcoin",
                symbol: "BTC",
                type: "crypto",
                allocation: 10,
                reason: "Valeur refuge numérique dans un contexte de tensions géopolitiques et d'incertitude sur les marchés obligataires traditionnels."
            },
            {
                name: "Ethereum",
                symbol: "ETH",
                type: "crypto",
                allocation: 5,
                reason: "Bénéficie du développement croissant des applications décentralisées et du potentiel d'adoption des technologies blockchain."
            }
        ];
        
        // Mise à jour de l'affichage du portefeuille
        updatePortfolioDisplay();
    }
    
    // Mise à jour de l'affichage des secteurs
    function updateSectorsDisplay() {
        if (!bullishSectorsContainer || !bearishSectorsContainer) return;
        
        // Construire le HTML pour les secteurs haussiers
        let bullishHTML = '';
        sectorData.bullish.forEach(sector => {
            bullishHTML += `
                <div class="sector-item">
                    <div class="sector-name">${sector.name} <i class="fas fa-arrow-up"></i></div>
                    <div class="sector-reason">${sector.reason}</div>
                </div>
            `;
        });
        
        // Construire le HTML pour les secteurs baissiers
        let bearishHTML = '';
        sectorData.bearish.forEach(sector => {
            bearishHTML += `
                <div class="sector-item">
                    <div class="sector-name">${sector.name} <i class="fas fa-arrow-down"></i></div>
                    <div class="sector-reason">${sector.reason}</div>
                </div>
            `;
        });
        
        // Mise à jour des conteneurs
        bullishSectorsContainer.innerHTML = bullishHTML;
        bearishSectorsContainer.innerHTML = bearishHTML;
    }
    
    // Mise à jour de l'affichage du portefeuille
    function updatePortfolioDisplay() {
        if (!portfolioTableBody || !portfolioChart) return;
        
        // Construire le HTML pour le tableau du portefeuille
        let tableHTML = '';
        portfolioData.forEach(asset => {
            tableHTML += `
                <tr>
                    <td>${asset.name} (${asset.symbol})</td>
                    <td><span class="asset-type ${asset.type}">${asset.type.toUpperCase()}</span></td>
                    <td class="allocation">${asset.allocation}%</td>
                    <td class="rationale">${asset.reason}</td>
                </tr>
            `;
        });
        
        // Mise à jour du tableau
        portfolioTableBody.innerHTML = tableHTML;
        
        // Préparation des données pour le graphique en camembert
        // Regrouper par type d'actif
        const stocksTotal = portfolioData.filter(asset => asset.type === 'stock').reduce((sum, asset) => sum + asset.allocation, 0);
        const etfTotal = portfolioData.filter(asset => asset.type === 'etf').reduce((sum, asset) => sum + asset.allocation, 0);
        const cryptoTotal = portfolioData.filter(asset => asset.type === 'crypto').reduce((sum, asset) => sum + asset.allocation, 0);
        
        // Mise à jour du graphique
        portfolioChart.data.labels = ['Actions', 'ETF', 'Crypto'];
        portfolioChart.data.datasets[0].data = [stocksTotal, etfTotal, cryptoTotal];
        portfolioChart.update();
    }
    
    // Configurer le mode plein écran
    function setupFullscreenMode() {
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
            
            // Créer un bouton pour quitter le plein écran
            const exitButton = document.createElement('button');
            exitButton.className = 'fullscreen-exit-btn';
            exitButton.id = 'exit-fullscreen';
            exitButton.innerHTML = '<i class="fas fa-compress-alt"></i> Quitter';
            exitButton.addEventListener('click', toggleFullscreen);
            
            const chartSection = document.querySelector('#chart-tab');
            if (chartSection) {
                chartSection.appendChild(exitButton);
            }
            
            // Écouter la touche Échap
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && document.querySelector('.fullscreen-chart')) {
                    toggleFullscreen();
                }
            });
        }
    }
    
    // Basculer le mode plein écran
    function toggleFullscreen() {
        const chartTab = document.querySelector('#chart-tab');
        const exitButton = document.getElementById('exit-fullscreen');
        
        if (chartTab) {
            chartTab.classList.toggle('fullscreen-chart');
            
            if (chartTab.classList.contains('fullscreen-chart')) {
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                document.body.style.overflow = 'hidden'; // Empêcher le défilement
                
                // Redimensionner le graphique
                if (widget) {
                    widget.resize();
                }
            } else {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
                document.body.style.overflow = ''; // Rétablir le défilement
                
                // Redimensionner le graphique
                if (widget) {
                    widget.resize();
                }
            }
        }
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Bouton de recherche
        if (searchBtn) {
            searchBtn.addEventListener('click', function() {
                const symbol = searchInput.value.trim().toUpperCase();
                if (symbol) {
                    searchStock(symbol);
                }
            });
        }
        
        // Recherche à la pression de Entrée
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    const symbol = searchInput.value.trim().toUpperCase();
                    if (symbol) {
                        searchStock(symbol);
                    }
                }
            });
        }
        
        // Navigation par onglets
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Désactiver tous les onglets
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Activer l'onglet sélectionné
                const tabId = this.getAttribute('data-tab');
                this.classList.add('active');
                document.getElementById(`${tabId}-tab`).classList.add('active');
                
                // Si c'est l'onglet du graphique, redimensionner TradingView
                if (tabId === 'chart' && widget) {
                    setTimeout(() => widget.resize(), 100);
                }
            });
        });
        
        // Filtre des actions
        const filterButtons = document.querySelectorAll('.filter-btn');
        
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Désactiver tous les filtres
                filterButtons.forEach(btn => btn.classList.remove('active'));
                
                // Activer le filtre sélectionné
                this.classList.add('active');
                
                // Appliquer le filtre
                const filter = this.getAttribute('data-filter');
                filterStocks(filter);
            });
        });
        
        // Boutons de période (1J, 1S, 1M, etc.)
        const timeButtons = document.querySelectorAll('.time-btn');
        
        timeButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Désactiver tous les boutons
                timeButtons.forEach(btn => btn.classList.remove('active'));
                
                // Activer le bouton sélectionné
                this.classList.add('active');
                
                // Changer l'intervalle du graphique
                if (widget) {
                    const range = this.getAttribute('data-range');
                    let interval = 'D';
                    
                    switch(range) {
                        case '1D': interval = '15'; break;
                        case '1W': interval = 'D'; break;
                        case '1M': interval = 'W'; break;
                        case '3M': interval = 'W'; break;
                        case '1Y': interval = 'M'; break;
                        case 'ALL': interval = 'M'; break;
                    }
                    
                    widget.chart().setResolution(interval);
                }
            });
        });
        
        // Ajouter des écouteurs pour les boutons "Voir détails" dans les recommandations
        document.querySelectorAll('.view-details-btn').forEach(button => {
            button.addEventListener('click', function() {
                const symbol = this.getAttribute('data-symbol');
                if (symbol) {
                    // Cacher la section portefeuille
                    const portfolioSection = document.getElementById('recommended-portfolio');
                    if (portfolioSection) portfolioSection.classList.add('hidden');
                    
                    // Cacher les actualités
                    const newsSection = document.getElementById('breaking-news');
                    if (newsSection) newsSection.classList.add('hidden');
                    
                    // Cacher l'analyse sectorielle
                    const sectorsSection = document.getElementById('sectors-analysis');
                    if (sectorsSection) sectorsSection.classList.add('hidden');
                    
                    // Afficher les détails du titre
                    const detailSection = document.getElementById('stockDetailSection');
                    if (detailSection) detailSection.classList.remove('hidden');
                    
                    // Rechercher le titre
                    searchStock(symbol);
                }
            });
        });
        
        // Bouton Retour dans les détails d'action
        const backButton = document.getElementById('backBtn');
        if (backButton) {
            backButton.addEventListener('click', function() {
                // Cacher les détails du titre
                const detailSection = document.getElementById('stockDetailSection');
                if (detailSection) detailSection.classList.add('hidden');
                
                // Afficher la section portefeuille
                const portfolioSection = document.getElementById('recommended-portfolio');
                if (portfolioSection) portfolioSection.classList.remove('hidden');
                
                // Afficher les actualités
                const newsSection = document.getElementById('breaking-news');
                if (newsSection) newsSection.classList.remove('hidden');
                
                // Afficher l'analyse sectorielle
                const sectorsSection = document.getElementById('sectors-analysis');
                if (sectorsSection) sectorsSection.classList.remove('hidden');
            });
        }
    }
    
    // Filtrer les actions selon le critère sélectionné
    function filterStocks(filter) {
        if (!allStocksData || Object.keys(allStocksData).length === 0) return;
        
        let filteredStocks;
        
        switch(filter) {
            case 'trending':
                // Actions les plus populaires (par volume)
                filteredStocks = Object.values(allStocksData).sort((a, b) => {
                    const volumeA = convertVolumeToNumber(a.volume);
                    const volumeB = convertVolumeToNumber(b.volume);
                    return volumeB - volumeA;
                });
                break;
                
            case 'gainers':
                // Actions en plus forte hausse
                filteredStocks = Object.values(allStocksData).sort((a, b) => {
                    return parseFloat(b.changePercent) - parseFloat(a.changePercent);
                }).filter(stock => parseFloat(stock.changePercent) > 0);
                break;
                
            case 'losers':
                // Actions en plus forte baisse
                filteredStocks = Object.values(allStocksData).sort((a, b) => {
                    return parseFloat(a.changePercent) - parseFloat(b.changePercent);
                }).filter(stock => parseFloat(stock.changePercent) < 0);
                break;
                
            case 'watchlist':
            default:
                // Ma liste (par défaut, toutes les actions par capitalisation boursière)
                filteredStocks = Object.values(allStocksData).sort((a, b) => {
                    const capA = convertMarketCapToNumber(a.marketCap);
                    const capB = convertMarketCapToNumber(b.marketCap);
                    return capB - capA;
                });
                break;
        }
        
        // Générer le HTML pour le tableau
        let tableHtml = '';
        
        if (filteredStocks.length === 0) {
            tableHtml = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px;">
                        Aucune donnée disponible pour ce filtre.
                    </td>
                </tr>
            `;
        } else {
            filteredStocks.forEach((stock, index) => {
                const isPositiveDay = parseFloat(stock.changePercent) >= 0;
                const isPositiveWeek = parseFloat(stock.performance.weekChange) >= 0;
                
                tableHtml += `
                    <tr data-symbol="${stock.symbol}" class="${stock.symbol === currentSymbol ? 'selected-stock' : ''}">
                        <td>${index + 1}</td>
                        <td>
                            <div class="stock-name">
                                <img class="stock-icon" src="https://logo.clearbit.com/${stock.name.toLowerCase().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}.com" 
                                     onerror="this.src='https://via.placeholder.com/24x24?text=${stock.symbol.charAt(0)}'">
                                <span class="stock-symbol">${stock.symbol}</span>
                                <span class="stock-fullname">${stock.name.split(' ')[0]}</span>
                            </div>
                        </td>
                        <td>$${typeof stock.price === 'number' ? stock.price.toFixed(2) : stock.price}</td>
                        <td class="${isPositiveDay ? 'positive' : 'negative'}">${isPositiveDay ? '+' : ''}${stock.changePercent}%</td>
                        <td class="${isPositiveWeek ? 'positive' : 'negative'}">${isPositiveWeek ? '+' : ''}${stock.performance.weekChange}%</td>
                        <td>${stock.volume}</td>
                        <td>${stock.marketCap}</td>
                    </tr>
                `;
            });
        }
        
        if (stocksTableBody) {
            stocksTableBody.innerHTML = tableHtml;
            
            // Ajouter des écouteurs d'événements pour chaque ligne
            document.querySelectorAll('#stocks-tbody tr').forEach(row => {
                row.addEventListener('click', function() {
                    const symbol = this.getAttribute('data-symbol');
                    if (symbol) {
                        searchStock(symbol);
                        
                        // Mettre à jour la classe selected-stock
                        document.querySelectorAll('#stocks-tbody tr').forEach(r => {
                            r.classList.remove('selected-stock');
                        });
                        this.classList.add('selected-stock');
                    }
                });
            });
        }
    }
    
    // Convertir le volume en nombre pour le tri
    function convertVolumeToNumber(volume) {
        if (!volume) return 0;
        
        const value = parseFloat(volume.replace(/[^0-9.]/g, ''));
        const unit = volume.slice(-1).toUpperCase();
        
        switch (unit) {
            case 'B': return value * 1000000000;
            case 'M': return value * 1000000;
            case 'K': return value * 1000;
            default: return value;
        }
    }
    
    // Mettre à jour l'heure de marché
    function updateMarketTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        if(currentTimeElement) currentTimeElement.textContent = timeStr;
        
        // Mettre à jour également l'heure de la source des données
        const dateTimeStr = now.toLocaleDateString('fr-FR') + ' ' + timeStr;
        if(updateTimeElement) updateTimeElement.textContent = dateTimeStr;
        
        // Vérifier si le marché français (Euronext) est ouvert
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayOfWeek = now.getDay(); // 0 = dimanche, 6 = samedi
        
        // Marché français: ouvert de 9h00 à 17h30, du lundi au vendredi
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isBeforeOpen = hour < 9;
        const isAfterClose = hour > 17 || (hour === 17 && minute >= 30);
        
        const isMarketOpen = !isWeekend && !isBeforeOpen && !isAfterClose;
        
        // Mettre à jour l'indicateur et le texte
        if (marketIndicator && marketStatusText) {
            if (isMarketOpen) {
                marketIndicator.classList.remove('red');
                marketIndicator.classList.add('green');
                marketStatusText.textContent = 'Marché ouvert';
            } else {
                marketIndicator.classList.remove('green');
                marketIndicator.classList.add('red');
                marketStatusText.textContent = 'Marché fermé';
            }
        }
    }
    
    // Chercher et afficher les données pour un nouveau titre
    function searchStock(symbol) {
        // Vérifier si le symbole est différent du symbole actuel
        if (currentSymbol !== symbol) {
            currentSymbol = symbol;
            
            // Mettre à jour l'affichage du symbole dans le champ de recherche
            if (searchInput) searchInput.value = symbol;
            
            // Mettre à jour le graphique TradingView
            updateTradingViewSymbol(symbol);
            
            // Marquer la ligne correspondante dans le tableau
            document.querySelectorAll('#stocks-tbody tr').forEach(row => {
                if (row.getAttribute('data-symbol') === symbol) {
                    row.classList.add('selected-stock');
                } else {
                    row.classList.remove('selected-stock');
                }
            });
            
            // Si les données sont déjà disponibles, les utiliser
            if (allStocksData[symbol]) {
                updateUI(allStocksData[symbol]);
            } else {
                // Sinon, récupérer les données
                fetchStockData(symbol, true);
            }
            
            console.log(`Recherche effectuée pour: ${symbol}`);
        }
    }
    
    // Mettre à jour le symbole sur TradingView
    function updateTradingViewSymbol(symbol) {
        if (widget) {
            // Déterminer l'échange pour le préfixe TradingView
            let exchange = 'NASDAQ';
            
            if (symbol.endsWith('.PA')) {
                exchange = 'EURONEXT';
                // Nettoyer le symbole pour TradingView (sans .PA)
                symbol = symbol.replace('.PA', '');
            } else {
                exchange = getExchangePrefix(symbol);
            }
            
            const tvSymbol = `${exchange}:${symbol}`;
            
            console.log(`Setting TradingView symbol to: ${tvSymbol}`);
            
            widget.setSymbol(tvSymbol, 'D', function() {
                console.log("Symbol updated to:", tvSymbol);
            });
        }
    }
    
    // Récupérer les données de stock
    async function fetchStockData(symbol, updateTable = true) {
        try {
            // Afficher un indicateur de chargement dans l'onglet d'analyse
            if (aiAnalysisContent) {
                aiAnalysisContent.innerHTML = `
                    <div class="ai-status">
                        <div class="ai-loader">
                            <div class="spinner"></div>
                        </div>
                        <div class="ai-message">Analyse en cours...</div>
                    </div>`;
            }
            
            // Pour cette démo, utiliser des données simulées
            const stockData = await fetchSimulatedStockData(symbol);
            
            // Mettre à jour l'interface utilisateur
            updateUI(stockData);
            
            // Stocker les données pour référence future
            allStocksData[symbol] = stockData;
            
            // Mettre à jour le tableau si nécessaire
            if (updateTable) {
                updateStocksTable();
            }
            
        } catch (error) {
            console.error('Erreur lors de la récupération des données:', error);
            if (aiAnalysisContent) {
                aiAnalysisContent.innerHTML = '<p>Erreur lors de la récupération des données. Veuillez réessayer.</p>';
            }
        }
    }
    
    // Simuler la récupération de données (pour la démo)
    async function fetchSimulatedStockData(symbol) {
        return new Promise((resolve) => {
            // Simuler un temps de chargement
            setTimeout(() => {
                const data = getSimulatedStockData(symbol);
                resolve(data);
            }, 300); // Délai aléatoire entre 300ms et 1s
        });
    }
    
    // Générer des données simulées pour un symbole
    function getSimulatedStockData(symbol) {
        // Données préconfigurées pour les titres populaires
        const stocksData = {
            'AAPL': {
                symbol: "AAPL",
                name: "Apple Inc.",
                exchange: "NASDAQ",
                price: 189.97,
                change: 1.52,
                changePercent: 0.81,
                open: 188.45,
                previousClose: 188.45,
                dayHigh: 190.23,
                dayLow: 187.68,
                volume: "42.8M",
                marketCap: "2.95T",
                peRatio: 31.2,
                dividend: "0.51%",
                performance: {
                    dayChange: 0.81,
                    weekChange: 2.45,
                    monthChange: 5.32,
                    threeMonthChange: 12.78,
                    yearChange: 18.45
                },
                analysis: {
                    sentiment: "positif",
                    overview: "Apple Inc. est un leader mondial de la technologie, spécialisé dans les produits électroniques grand public, les logiciels et les services en ligne. L'entreprise maintient une position dominante dans son secteur, avec des produits phares comme l'iPhone, l'iPad, les Mac et les services comme Apple Music et Apple TV+.",
                    riskLevel: "faible",
                    technicalAnalysis: "L'action AAPL montre une tendance haussière soutenue avec un support solide autour de 180$. Les moyennes mobiles 50 et 200 jours confirment une configuration technique positive, avec un RSI qui n'indique pas de surachat excessif.",
                    fundamentalAnalysis: "Apple présente des fondamentaux solides avec un bilan robuste et une trésorerie importante. Ses marges bénéficiaires restent parmi les meilleures du secteur technologique, et la diversification vers les services contribue à améliorer la récurrence des revenus.",
                    recommendation: "Les perspectives d'Apple restent positives à long terme grâce à un écosystème solide et une fidélité client exceptionnelle. L'action constitue une base solide pour un portefeuille diversifié.",
                    keyFactors: [
                        "Cycle de renouvellement de l'iPhone 15",
                        "Croissance du segment des services",
                        "Développements en réalité augmentée",
                        "Expansion sur les marchés émergents"
                    ],
                    news: [
                        {
                            title: "Apple annonce un nouveau MacBook Pro avec une puce avancée",
                            source: "Bloomberg",
                            time: "Il y a 32 minutes"
                        },
                        {
                            title: "Les actions d'Apple montent suite à des prévisions positives sur les ventes d'iPhone",
                            source: "CNBC",
                            time: "Il y a 1 heure"
                        },
                        {
                            title: "Apple continue de renforcer ses investissements dans l'IA",
                            source: "Financial Times",
                            time: "Il y a 3 heures"
                        }
                    ]
                }
            },
            'MSFT': {
                symbol: "MSFT",
                name: "Microsoft Corporation",
                exchange: "NASDAQ",
                price: 428.73,
                change: 0.51,
                changePercent: 0.12,
                open: 426.50,
                previousClose: 425.35,
                dayHigh: 430.25,
                dayLow: 425.10,
                volume: "18.5M",
                marketCap: "3.18T",
                peRatio: 36.4,
                dividend: "0.73%",
                performance: {
                    dayChange: 0.12,
                    weekChange: 1.85,
                    monthChange: 4.25,
                    threeMonthChange: 9.35,
                    yearChange: 22.67
                },
                analysis: {
                    sentiment: "positif",
                    overview: "Microsoft est un leader mondial des logiciels, du cloud computing et des services technologiques. Sous la direction de Satya Nadella, l'entreprise a réussi une transformation remarquable en se concentrant sur le cloud et l'intelligence artificielle.",
                    riskLevel: "faible",
                    technicalAnalysis: "MSFT présente une tendance haussière de long terme. Les indicateurs techniques montrent une forte dynamique avec des supports solides. Le titre évolue confortablement au-dessus de ses moyennes mobiles principales.",
                    fundamentalAnalysis: "Microsoft affiche une croissance robuste de ses revenus et bénéfices, notamment grâce à Azure et aux services cloud. La transition vers un modèle d'abonnement pour Office 365 a considérablement amélioré la stabilité des revenus.",
                    recommendation: "Microsoft représente un investissement de haute qualité avec des perspectives de croissance solides dans le cloud et l'IA. La position dominante de l'entreprise dans le secteur B2B offre une sécurité supplémentaire.",
                    keyFactors: [
                        "Croissance d'Azure et du cloud computing",
                        "Intégration de l'IA dans les produits Microsoft",
                        "Développement de la division gaming (Xbox)",
                        "Innovations en informatique quantique"
                    ],
                    news: [
                        {
                            title: "Microsoft investit 1,5 milliard de dollars dans une entreprise d'IA au Moyen-Orient",
                            source: "Reuters",
                            time: "Il y a 2 heures"
                        },
                        {
                            title: "Les résultats trimestriels de Microsoft dépassent les attentes grâce au cloud",
                            source: "Wall Street Journal",
                            time: "Il y a 1 jour"
                        },
                        {
                            title: "Microsoft annonce de nouvelles fonctionnalités IA pour Office 365",
                            source: "TechCrunch",
                            time: "Il y a 2 jours"
                        }
                    ]
                }
            },
            'GOOGL': {
                symbol: "GOOGL",
                name: "Alphabet Inc. (Google)",
                exchange: "NASDAQ",
                price: 149.82,
                change: 1.52,
                changePercent: 1.02,
                open: 148.90,
                previousClose: 148.45,
                dayHigh: 150.75,
                dayLow: 148.30,
                volume: "23.2M",
                marketCap: "1.87T",
                peRatio: 25.8,
                dividend: "0.00%",
                performance: {
                    dayChange: 1.02,
                    weekChange: -0.45,
                    monthChange: -2.14,
                    threeMonthChange: 5.43,
                    yearChange: 11.26
                },
                analysis: {
                    sentiment: "positif",
                    overview: "Alphabet (Google) domine le marché de la recherche en ligne et de la publicité numérique. L'entreprise investit massivement dans l'IA, le cloud computing et les technologies de pointe via ses nombreuses filiales et projets.",
                    riskLevel: "modéré",
                    technicalAnalysis: "L'action GOOGL montre une tendance haussière à long terme avec quelques signes de consolidation à court terme. Le support à 145$ semble solide, et le titre reste au-dessus de sa moyenne mobile à 200 jours.",
                    fundamentalAnalysis: "Alphabet maintient une croissance constante de ses revenus publicitaires tout en développant des secteurs comme le cloud. Sa position dominante dans la recherche en ligne lui confère un avantage concurrentiel durable.",
                    recommendation: "Malgré les risques réglementaires, Alphabet reste un acteur incontournable du secteur technologique avec de solides perspectives de croissance dans l'IA et le cloud.",
                    keyFactors: [
                        "Développements en IA et machine learning",
                        "Croissance de Google Cloud",
                        "Pressions réglementaires antitrust",
                        "Diversification des revenus au-delà de la publicité"
                    ],
                    news: [
                        {
                            title: "Google présente sa nouvelle génération de modèles d'IA",
                            source: "The Verge",
                            time: "Il y a 5 heures"
                        },
                        {
                            title: "Google Cloud annonce un partenariat majeur avec une entreprise de santé",
                            source: "CNBC",
                            time: "Il y a 1 jour"
                        },
                        {
                            title: "L'UE lance une nouvelle enquête sur les pratiques de Google",
                            source: "Financial Times",
                            time: "Il y a 3 jours"
                        }
                    ]
                }
            }
        };
        
        // Si le symbole est dans nos données préconfigurées, utiliser ces valeurs
        if (stocksData[symbol]) {
            return stocksData[symbol];
        }
        
        // Sinon, générer des données aléatoires mais réalistes
        const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
        const rand = () => (Math.sin(seed * 9999) + 1) / 2;
        
        const price = (50 + rand() * 950).toFixed(2);
        const changePercent = (rand() * 10 - 5).toFixed(2);
        const change = (price * changePercent / 100).toFixed(2);
        const open = (price * (1 - rand() * 0.02)).toFixed(2);
        const prevClose = (price * (1 - changePercent / 100)).toFixed(2);
        const dayHigh = (price * (1 + rand() * 0.02)).toFixed(2);
        const dayLow = (price * (1 - rand() * 0.03)).toFixed(2);
        
        const volume = `${Math.floor(rand() * 100)}M`;
        const marketCap = `${(rand() * 100 > 95) ? ((rand() * 3).toFixed(2) + 'T') : ((rand() * 300).toFixed(2) + 'B')}`;
        const peRatio = (10 + rand() * 40).toFixed(1);
        const dividend = `${(rand() * 4).toFixed(2)}%`;
        
        const weekChange = (rand() * 12 - 6).toFixed(2);
        const monthChange = (rand() * 20 - 10).toFixed(2);
        const threeMonthChange = (rand() * 30 - 15).toFixed(2);
        const yearChange = (rand() * 40 - 20).toFixed(2);
        
        const sentiment = rand() > 0.6 ? "positif" : (rand() > 0.3 ? "neutre" : "négatif");
        const riskLevel = rand() > 0.7 ? "faible" : (rand() > 0.4 ? "modéré" : "élevé");
        
        return {
            symbol: symbol,
            name: getCompanyName(symbol),
            exchange: getExchangePrefix(symbol),
            price: parseFloat(price),
            change: parseFloat(change),
            changePercent: parseFloat(changePercent),
            open: parseFloat(open),
            previousClose: parseFloat(prevClose),
            dayHigh: parseFloat(dayHigh),
            dayLow: parseFloat(dayLow),
            volume: volume,
            marketCap: marketCap,
            peRatio: parseFloat(peRatio),
            dividend: dividend,
            performance: {
                dayChange: parseFloat(changePercent),
                weekChange: parseFloat(weekChange),
                monthChange: parseFloat(monthChange),
                threeMonthChange: parseFloat(threeMonthChange),
                yearChange: parseFloat(yearChange)
            },
            analysis: {
                sentiment: sentiment,
                overview: `${symbol} est une entreprise opérant dans son secteur d'activité principal. L'entreprise se positionne sur son marché face à ses concurrents directs.`,
                riskLevel: riskLevel,
                technicalAnalysis: `L'analyse technique de ${symbol} montre des tendances de prix qui peuvent indiquer des mouvements futurs en fonction du contexte de marché actuel.`,
                fundamentalAnalysis: `Les fondamentaux de ${symbol} incluent sa structure financière, ses revenus et sa position concurrentielle dans son secteur.`,
                recommendation: `Compte tenu des conditions actuelles du marché et des performances spécifiques de ${symbol}, les investisseurs pourraient envisager d'évaluer cette action dans le cadre d'une stratégie d'investissement diversifiée.`,
                keyFactors: [
                    "Performance du secteur",
                    "Innovations et développement produit",
                    "Contexte macroéconomique",
                    "Positionnement concurrentiel"
                ],
                news: [
                    {
                        title: `${symbol} annonce de nouveaux développements stratégiques`,
                        source: "Reuters",
                        time: "Il y a 1 jour"
                    },
                    {
                        title: `Résultats trimestriels pour ${symbol}`,
                        source: "Bloomberg",
                        time: "Il y a 3 jours"
                    },
                    {
                        title: `Analyse sectorielle incluant ${symbol}`,
                        source: "Financial Times",
                        time: "Il y a 5 jours"
                    }
                ]
            }
        };
    }
    
    // Générer aléatoirement des données pour tous les titres populaires
    function generateRandomDataForAllStocks() {
        const result = {};
        popularStocks.forEach(symbol => {
            result[symbol] = getSimulatedStockData(symbol);
        });
        return result;
    }
    
    // Mettre à jour l'interface utilisateur avec les données reçues
    function updateUI(data) {
        if (!data) return;
        
        // Mise à jour du titre de la section détail
        const stockDetailName = document.getElementById('stockDetailName');
        if (stockDetailName) {
            stockDetailName.textContent = `${data.name} (${data.symbol})`;
        }
        
        // Mise à jour du logo (si possible)
        try {
            const logoElement = document.querySelector('.company-logo');
            if (logoElement) {
                // Nettoyer le nom de l'entreprise pour l'URL du logo
                const companyName = data.name.toLowerCase().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
                logoElement.src = `https://logo.clearbit.com/${companyName}.com`;
                logoElement.onerror = function() {
                    this.src = `https://via.placeholder.com/40x40?text=${data.symbol.charAt(0)}`;
                };
            }
        } catch (error) {
            console.log('Erreur lors de la mise à jour du logo', error);
        }
        
        // Formater les valeurs numériques si nécessaires
        const priceValue = typeof data.price === 'number' ? data.price.toFixed(2) : data.price;
        const changeValue = typeof data.change === 'number' ? data.change.toFixed(2) : data.change;
        const changePercentValue = typeof data.changePercent === 'number' ? data.changePercent.toFixed(2) : data.changePercent;
        
        // Mise à jour du prix et de la variation
        if (currentPrice) {
            currentPrice.textContent = `$${priceValue}`;
        }
        
        // Déterminer si la variation est positive ou négative
        const isPositive = parseFloat(changeValue) >= 0;
        const changeText = `${isPositive ? '+' : ''}${changeValue} (${isPositive ? '+' : ''}${changePercentValue}%)`;
        
        if (priceChange) {
            priceChange.textContent = changeText;
            
            // Appliquer les classes CSS pour les couleurs
            if (isPositive) {
                priceChange.classList.remove('negative');
                priceChange.classList.add('positive');
            } else {
                priceChange.classList.remove('positive');
                priceChange.classList.add('negative');
            }
        }
        
        // Mise à jour des métriques avec coloration
        updateMetricWithColor(openPrice, data.open, parseFloat(data.open) - parseFloat(data.previousClose));
        updateMetricWithColor(prevClose, data.previousClose);
        updateMetricWithColor(dayHigh, data.dayHigh, parseFloat(data.dayHigh) - parseFloat(data.price));
        updateMetricWithColor(dayLow, data.dayLow, parseFloat(data.dayLow) - parseFloat(data.price));
        
        // Métriques sans coloration
        if (volume) volume.textContent = data.volume;
        if (marketCap) marketCap.textContent = data.marketCap;
        if (peRatio) peRatio.textContent = data.peRatio;
        if (dividend) dividend.textContent = data.dividend;
        
        // Mise à jour des performances
        updatePerformanceBars(data.performance);
        
        // Mise à jour de l'analyse OpenAI
        updateAIAnalysis(data.analysis);
        
        // Mise à jour des actualités
        updateNews(data.analysis.news);
    }
    
    // Mettre à jour l'affichage de l'analyse OpenAI
    function updateAIAnalysis(analysis) {
        if (!aiAnalysisContent || !analysis) return;
        
        const sentimentClass = analysis.sentiment === 'positif' ? 'positive-trend' : 
                              analysis.sentiment === 'négatif' ? 'negative-trend' : 
                              'neutral-trend';
        
        const riskClass = analysis.riskLevel === 'faible' ? 'positive-trend' : 
                         analysis.riskLevel === 'élevé' ? 'negative-trend' : 
                         'neutral-trend';
        
        // Construire le HTML pour l'analyse
        const html = `
            <div class="ai-section">
                <div class="ai-heading">Aperçu de l'entreprise</div>
                <div class="ai-text">${analysis.overview}</div>
            </div>
            
            <div class="ai-section">
                <div class="ai-heading">Analyse technique</div>
                <div class="ai-text">${analysis.technicalAnalysis}</div>
            </div>
            
            <div class="ai-section">
                <div class="ai-heading">Analyse fondamentale</div>
                <div class="ai-text">${analysis.fundamentalAnalysis}</div>
            </div>
            
            <div class="ai-metrics">
                <div class="ai-metric">
                    <span class="ai-metric-label">Sentiment de marché</span>
                    <span class="ai-metric-value ${sentimentClass}">${analysis.sentiment.charAt(0).toUpperCase() + analysis.sentiment.slice(1)}</span>
                </div>
                
                <div class="ai-metric">
                    <span class="ai-metric-label">Niveau de risque</span>
                    <span class="ai-metric-value ${riskClass}">${analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}</span>
                </div>
            </div>
            
            <div class="ai-section">
                <div class="ai-heading">Facteurs clés à surveiller</div>
                <ul>
                    ${analysis.keyFactors.map(factor => `<li>${factor}</li>`).join('')}
                </ul>
            </div>
            
            <div class="ai-recommendation">
                ${analysis.recommendation}
            </div>
        `;
        
        aiAnalysisContent.innerHTML = html;
    }
    
    // Mettre à jour les actualités
    function updateNews(news) {
        const newsContainer = document.getElementById('news-container');
        if (!newsContainer || !news || !Array.isArray(news)) return;
        
        // Construire le HTML pour les actualités
        const newsHtml = news.map(item => `
            <article class="news-item">
                <div class="news-meta">
                    <span class="news-source">${item.source}</span>
                    <span class="news-time">${item.time}</span>
                </div>
                <h4 class="news-title">${item.title}</h4>
            </article>
        `).join('');
        
        newsContainer.innerHTML = newsHtml;
    }
    
    // Mettre à jour une métrique avec coloration
    function updateMetricWithColor(element, value, changeValue = null) {
        if (!element) return;
        
        // Formater avec le symbole $ si c'est un prix et si c'est un nombre
        const formattedValue = typeof value === 'number' ? `$${value.toFixed(2)}` : 
                              (typeof value === 'string' && !value.includes('%') && !value.includes('$')) ? 
                              `$${value}` : value;
        
        element.textContent = formattedValue;
        
        // Si un changeValue est fourni, appliquer la coloration
        if (changeValue !== null) {
            if (changeValue > 0) {
                element.classList.remove('negative');
                element.classList.add('positive');
            } else if (changeValue < 0) {
                element.classList.remove('positive');
                element.classList.add('negative');
            } else {
                element.classList.remove('positive', 'negative');
            }
        } else {
            // Supprimer les classes de coloration si aucun changement n'est spécifié
            element.classList.remove('positive', 'negative');
        }
    }
    
    // Mettre à jour les barres de performance
    function updatePerformanceBars(performance) {
        if (!performance) return;
        
        // Jour
        updatePerformanceBar('day', performance.dayChange);
        
        // Semaine
        updatePerformanceBar('week', performance.weekChange);
        
        // Mois
        updatePerformanceBar('month', performance.monthChange);
        
        // 3 Mois
        updatePerformanceBar('three-months', performance.threeMonthChange);
        
        // Année
        updatePerformanceBar('year', performance.yearChange);
    }
    
    // Mettre à jour une barre de performance spécifique
    function updatePerformanceBar(period, changeValue) {
        const performanceValue = document.querySelector(`.${period}-performance .performance-value`);
        const performanceBar = document.querySelector(`.${period}-performance .performance-bar`);
        
        if (performanceValue && performanceBar && changeValue !== undefined) {
            // S'assurer que changeValue est un nombre
            const numericChange = typeof changeValue === 'string' ? parseFloat(changeValue) : changeValue;
            
            performanceValue.textContent = `${numericChange >= 0 ? '+' : ''}${numericChange}%`;
            
            // Appliquer les classes CSS pour les couleurs
            if (numericChange >= 0) {
                performanceValue.classList.remove('negative');
                performanceValue.classList.add('positive');
                performanceBar.classList.remove('negative');
                performanceBar.classList.add('positive');
            } else {
                performanceValue.classList.remove('positive');
                performanceValue.classList.add('negative');
                performanceBar.classList.remove('positive');
                performanceBar.classList.add('negative');
            }
            
            // Calculer la largeur de la barre (max 100%)
            const width = Math.min(Math.abs(numericChange) * 5, 100);
            performanceBar.style.width = `${width}%`;
        }
    }
    
    // Obtenir le préfixe d'échange pour un symbole
    function getExchangePrefix(symbol) {
        // Si c'est une action française (se termine par .PA)
        if (symbol.endsWith('.PA')) {
            return 'EURONEXT';
        }
        
        // Liste plus complète de symboles pour les bourses principales
        const exchangeMap = {
            // Symboles NASDAQ (pour les 100 principales)
            'AAPL': 'NASDAQ', 'MSFT': 'NASDAQ', 'AMZN': 'NASDAQ', 'GOOGL': 'NASDAQ', 'GOOG': 'NASDAQ',
            'META': 'NASDAQ', 'NVDA': 'NASDAQ', 'TSLA': 'NASDAQ', 'AVGO': 'NASDAQ', 'PEP': 'NASDAQ',
            'COST': 'NASDAQ', 'CSCO': 'NASDAQ', 'TMUS': 'NASDAQ', 'ADBE': 'NASDAQ', 'CMCSA': 'NASDAQ',
            'TXN': 'NASDAQ', 'INTC': 'NASDAQ', 'QCOM': 'NASDAQ', 'AMD': 'NASDAQ', 'INTU': 'NASDAQ',
            'AMGN': 'NASDAQ', 'HON': 'NASDAQ', 'SBUX': 'NASDAQ', 'GILD': 'NASDAQ', 'ADI': 'NASDAQ',
            'MDLZ': 'NASDAQ', 'AMAT': 'NASDAQ', 'ISRG': 'NASDAQ', 'REGN': 'NASDAQ', 'NFLX': 'NASDAQ',
            
            // Symboles NYSE (pour certaines principales)
            'JPM': 'NYSE', 'V': 'NYSE', 'JNJ': 'NYSE', 'UNH': 'NYSE', 'HD': 'NYSE',
            'PG': 'NYSE', 'XOM': 'NYSE', 'BAC': 'NYSE', 'MA': 'NYSE', 'DIS': 'NYSE',
            'CVX': 'NYSE', 'MRK': 'NYSE', 'KO': 'NYSE', 'PFE': 'NYSE', 'T': 'NYSE',
            'WMT': 'NYSE', 'VZ': 'NYSE', 'CRM': 'NYSE', 'ABT': 'NYSE', 'ORCL': 'NYSE',
            
            // Classes d'actions spéciales
            'BRK.A': 'NYSE', 'BRK.B': 'NYSE'
        };
        
        // Retourner le préfixe d'échange si connu, sinon NYSE par défaut
        return exchangeMap[symbol] || 'NYSE';
    }
    
    // Obtenir le nom d'une entreprise basé sur son symbole
    function getCompanyName(symbol) {
        // Si c'est une action française (se termine par .PA)
        if (symbol.endsWith('.PA')) {
            const baseName = symbol.replace('.PA', '');
            return `${baseName} S.A.`;
        }
        
        // Liste plus complète de noms d'entreprises
        const companies = {
            // NASDAQ
            'AAPL': 'Apple Inc.',
            'MSFT': 'Microsoft Corporation',
            'AMZN': 'Amazon.com Inc.',
            'GOOGL': 'Alphabet Inc. (Class A)',
            'GOOG': 'Alphabet Inc. (Class C)',
            'META': 'Meta Platforms Inc.',
            'NVDA': 'NVIDIA Corporation',
            'TSLA': 'Tesla Inc.',
            'AVGO': 'Broadcom Inc.',
            'PEP': 'PepsiCo Inc.',
            'COST': 'Costco Wholesale Corporation',
            'CSCO': 'Cisco Systems Inc.',
            'TMUS': 'T-Mobile US Inc.',
            'ADBE': 'Adobe Inc.',
            'CMCSA': 'Comcast Corporation',
            'NFLX': 'Netflix Inc.',
            'INTC': 'Intel Corporation',
            'AMD': 'Advanced Micro Devices, Inc.',
            
            // NYSE
            'JPM': 'JPMorgan Chase & Co.',
            'V': 'Visa Inc.',
            'JNJ': 'Johnson & Johnson',
            'UNH': 'UnitedHealth Group Inc.',
            'HD': 'Home Depot Inc.',
            'PG': 'Procter & Gamble Co.',
            'XOM': 'Exxon Mobil Corporation',
            'BAC': 'Bank of America Corp.',
            'MA': 'Mastercard Inc.',
            'DIS': 'Walt Disney Co.',
            'WMT': 'Walmart Inc.',
            'KO': 'Coca-Cola Company',
            
            // Classes d'actions spéciales
            'BRK.A': 'Berkshire Hathaway Inc. (Class A)',
            'BRK.B': 'Berkshire Hathaway Inc. (Class B)',
            
            // Actions françaises (Euronext Paris)
            'OR.PA': 'L\'Oréal S.A.',
            'BNP.PA': 'BNP Paribas S.A.',
            'AIR.PA': 'Airbus SE',
            'MC.PA': 'LVMH Moët Hennessy Louis Vuitton SE',
            'SAN.PA': 'Sanofi S.A.',
            'CS.PA': 'AXA S.A.',
            'BN.PA': 'Danone S.A.',
            'CAP.PA': 'Capgemini SE'
        };
        
        return companies[symbol] || `${symbol} Corp.`;
    }
    
    // Interroger Perplexity pour l'analyse sectorielle (simulation)
    async function queryPerplexityForSectorAnalysis() {
        // Dans un environnement réel, vous devriez interroger l'API Perplexity ici
        // Pour cette démo, nous utilisons simplement les données statiques
        console.log("Interrogation de Perplexity pour l'analyse sectorielle...");
        return sectorData;
    }
    
    // Ajouter une classe CSS pour indiquer la ligne sélectionnée dans le tableau
    const style = document.createElement('style');
    style.textContent = `
        .selected-stock {
            background-color: rgba(28, 118, 255, 0.15) !important;
            position: relative;
        }
        .selected-stock:after {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background-color: var(--primary-color);
        }
        
        /* Animation pour le chargement */
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    // Démarrer l'application
    init();
});
