// StockPro - Application d'analyse d'actions en temps réel (Apple)
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const searchInput = document.getElementById('stockSearch');
    const searchBtn = document.getElementById('searchBtn');
    const timeBtns = document.querySelectorAll('.time-btn');
    const currentPrice = document.querySelector('.current-price');
    const priceChange = document.querySelector('.price-change');
    const stockInfoTitle = document.querySelector('.stock-info h2');
    
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
    let currentTimeRange = '1W'; // Par défaut on affiche 1 semaine
    let tradingViewWidget = null;
    
    // Initialisation
    function init() {
        // Charger les données en temps réel pour Apple
        fetchRealTimeData(currentSymbol);
        
        // Initialiser le graphique TradingView
        initTradingViewChart();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Mettre à jour l'heure de marché
        updateMarketTime();
        
        // Mettre à jour régulièrement l'heure et les données
        setInterval(updateMarketTime, 1000);
        setInterval(() => fetchRealTimeData(currentSymbol), 60000); // Rafraîchir toutes les minutes
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Bouton de recherche
        searchBtn.addEventListener('click', function() {
            const symbol = searchInput.value.trim();
            if (symbol) {
                searchStock(symbol);
            }
        });
        
        // Recherche à la pression de Entrée
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const symbol = searchInput.value.trim();
                if (symbol) {
                    searchStock(symbol);
                }
            }
        });
        
        // Sélecteurs de période
        timeBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                timeBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                currentTimeRange = this.getAttribute('data-range');
                updateTradingViewChart(currentSymbol, currentTimeRange);
            });
        });
    }
    
    // Mettre à jour l'heure de marché
    function updateMarketTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        document.querySelector('.market-time').textContent = timeStr;
        
        // Mettre à jour également l'heure de la source des données
        const dateTimeStr = now.toLocaleDateString('fr-FR') + ' ' + timeStr;
        const updateTimeElement = document.querySelector('.update-time');
        if (updateTimeElement) {
            updateTimeElement.textContent = dateTimeStr;
        }
    }
    
    // Chercher et afficher les données pour un nouveau titre
    function searchStock(symbol) {
        currentSymbol = symbol.toUpperCase();
        fetchRealTimeData(currentSymbol);
        
        // Mettre à jour le graphique TradingView
        if (tradingViewWidget) {
            destroyTradingViewWidget();
        }
        initTradingViewChart();
    }
    
    // Récupérer les données en temps réel via Puppeteer (simulé pour cette démo)
    async function fetchRealTimeData(symbol) {
        try {
            // Dans une implémentation réelle, nous utiliserions Puppeteer pour scraper Yahoo Finance
            // Exemple de code Puppeteer (qui serait exécuté côté serveur) :
            /*
            await puppeteer_navigate({
                url: `https://finance.yahoo.com/quote/${symbol}`
            });
            
            const stockPrice = await puppeteer_evaluate({
                script: `
                    document.querySelector('[data-field="regularMarketPrice"]').textContent
                `
            });
            
            const priceChangePercent = await puppeteer_evaluate({
                script: `
                    document.querySelector('[data-field="regularMarketChangePercent"]').textContent
                `
            });
            */
            
            // Pour cette démo, nous utilisons des données simulées pour Apple
            const stockData = await getSimulatedStockData(symbol);
            
            // Mettre à jour l'interface utilisateur
            updateUI(stockData);
            
        } catch (error) {
            console.error('Erreur lors de la récupération des données:', error);
        }
    }
    
    // Simuler des données de stock pour la démo
    async function getSimulatedStockData(symbol) {
        // Ajouter un peu de variation aléatoire pour simuler des mises à jour en temps réel
        const randomFactor = Math.random() * 0.02 - 0.01; // -1% à +1%
        
        // Données préconfigurées pour Apple
        if (symbol === 'AAPL') {
            const basePrice = 189.97;
            const currentPriceValue = basePrice * (1 + randomFactor);
            const priceChangeValue = currentPriceValue - basePrice;
            const priceChangePercent = (priceChangeValue / basePrice) * 100;
            
            return {
                symbol: 'AAPL',
                name: 'Apple Inc.',
                price: currentPriceValue.toFixed(2),
                change: priceChangeValue.toFixed(2),
                changePercent: priceChangePercent.toFixed(2),
                open: (basePrice * 0.998).toFixed(2),
                previousClose: (basePrice * 0.995).toFixed(2),
                dayHigh: (currentPriceValue * 1.005).toFixed(2),
                dayLow: (currentPriceValue * 0.995).toFixed(2),
                volume: '42.8M',
                marketCap: '2.95T',
                peRatio: '31.2',
                dividend: '0.51%',
                dayChange: 0.81,
                weekChange: 2.45,
                monthChange: 5.32,
                threeMonthChange: 12.78,
                yearChange: 18.45,
                exchange: 'NASDAQ'
            };
        } else if (symbol === 'MSFT') {
            const basePrice = 428.73;
            const currentPriceValue = basePrice * (1 + randomFactor);
            const priceChangeValue = currentPriceValue - basePrice;
            const priceChangePercent = (priceChangeValue / basePrice) * 100;
            
            return {
                symbol: 'MSFT',
                name: 'Microsoft Corporation',
                price: currentPriceValue.toFixed(2),
                change: priceChangeValue.toFixed(2),
                changePercent: priceChangePercent.toFixed(2),
                open: (basePrice * 0.998).toFixed(2),
                previousClose: (basePrice * 0.995).toFixed(2),
                dayHigh: (currentPriceValue * 1.005).toFixed(2),
                dayLow: (currentPriceValue * 0.995).toFixed(2),
                volume: '18.5M',
                marketCap: '3.18T',
                peRatio: '36.4',
                dividend: '0.73%',
                dayChange: 0.12,
                weekChange: 1.85,
                monthChange: 4.25,
                threeMonthChange: 9.35,
                yearChange: 22.67,
                exchange: 'NASDAQ'
            };
        } else if (symbol === 'GOOGL') {
            const basePrice = 149.82;
            const currentPriceValue = basePrice * (1 + randomFactor);
            const priceChangeValue = currentPriceValue - basePrice;
            const priceChangePercent = (priceChangeValue / basePrice) * 100;
            
            return {
                symbol: 'GOOGL',
                name: 'Alphabet Inc.',
                price: currentPriceValue.toFixed(2),
                change: priceChangeValue.toFixed(2),
                changePercent: priceChangePercent.toFixed(2),
                open: (basePrice * 0.998).toFixed(2),
                previousClose: (basePrice * 0.995).toFixed(2),
                dayHigh: (currentPriceValue * 1.005).toFixed(2),
                dayLow: (currentPriceValue * 0.995).toFixed(2),
                volume: '23.2M',
                marketCap: '1.87T',
                peRatio: '25.8',
                dividend: '0.00%',
                dayChange: 1.02,
                weekChange: -0.45,
                monthChange: -2.14,
                threeMonthChange: 5.43,
                yearChange: 11.26,
                exchange: 'NASDAQ'
            };
        } else {
            // Génération aléatoire pour d'autres symboles
            const basePrice = 100 + Math.random() * 900;
            const currentPriceValue = basePrice * (1 + randomFactor);
            const priceChangeValue = currentPriceValue - basePrice;
            const priceChangePercent = (priceChangeValue / basePrice) * 100;
            
            return {
                symbol: symbol,
                name: getCompanyName(symbol),
                price: currentPriceValue.toFixed(2),
                change: priceChangeValue.toFixed(2),
                changePercent: priceChangePercent.toFixed(2),
                open: (basePrice * 0.998).toFixed(2),
                previousClose: (basePrice * 0.995).toFixed(2),
                dayHigh: (currentPriceValue * 1.005).toFixed(2),
                dayLow: (currentPriceValue * 0.995).toFixed(2),
                volume: `${Math.floor(Math.random() * 100)}M`,
                marketCap: `${(Math.random() * 1000).toFixed(2)}B`,
                peRatio: `${(Math.random() * 50 + 5).toFixed(1)}`,
                dividend: `${(Math.random() * 5).toFixed(2)}%`,
                dayChange: parseFloat((Math.random() * 5 - 2).toFixed(2)),
                weekChange: parseFloat((Math.random() * 8 - 3).toFixed(2)),
                monthChange: parseFloat((Math.random() * 15 - 5).toFixed(2)),
                threeMonthChange: parseFloat((Math.random() * 25 - 10).toFixed(2)),
                yearChange: parseFloat((Math.random() * 40 - 15).toFixed(2)),
                exchange: 'NYSE'
            };
        }
    }
    
    // Mettre à jour l'interface utilisateur avec les données reçues
    function updateUI(stockData) {
        // Mise à jour du titre et info de l'action
        stockInfoTitle.textContent = `${stockData.name} (${stockData.symbol})`;
        document.querySelector('.exchange').textContent = stockData.exchange;
        
        // Mise à jour du logo (si possible)
        try {
            const logoElement = document.querySelector('.company-logo');
            if (logoElement) {
                logoElement.src = `https://logo.clearbit.com/${stockData.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '')}.com`;
                logoElement.onerror = function() {
                    this.src = 'https://via.placeholder.com/40x40?text=' + stockData.symbol;
                };
            }
        } catch (error) {
            console.log('Erreur lors de la mise à jour du logo', error);
        }
        
        // Mise à jour du prix et de la variation
        currentPrice.textContent = `$${stockData.price}`;
        
        const changeValue = parseFloat(stockData.change);
        const changeText = `${changeValue >= 0 ? '+' : ''}${stockData.change} (${changeValue >= 0 ? '+' : ''}${stockData.changePercent}%)`;
        priceChange.textContent = changeText;
        
        if (changeValue >= 0) {
            priceChange.classList.remove('negative');
            priceChange.classList.add('positive');
        } else {
            priceChange.classList.remove('positive');
            priceChange.classList.add('negative');
        }
        
        // Mise à jour des métriques
        if (openPrice) openPrice.textContent = `$${stockData.open}`;
        if (prevClose) prevClose.textContent = `$${stockData.previousClose}`;
        if (dayHigh) dayHigh.textContent = `$${stockData.dayHigh}`;
        if (dayLow) dayLow.textContent = `$${stockData.dayLow}`;
        if (volume) volume.textContent = stockData.volume;
        if (marketCap) marketCap.textContent = stockData.marketCap;
        if (peRatio) peRatio.textContent = stockData.peRatio;
        if (dividend) dividend.textContent = stockData.dividend;
        
        // Mise à jour des performances
        updatePerformanceBars(stockData);
    }
    
    // Mettre à jour les barres de performance
    function updatePerformanceBars(stockData) {
        // Jour
        updatePerformanceBar('day', stockData.dayChange);
        
        // Semaine
        updatePerformanceBar('week', stockData.weekChange);
        
        // Mois
        updatePerformanceBar('month', stockData.monthChange);
        
        // 3 Mois
        updatePerformanceBar('three-months', stockData.threeMonthChange);
        
        // Année
        updatePerformanceBar('year', stockData.yearChange);
    }
    
    // Mettre à jour une barre de performance spécifique
    function updatePerformanceBar(period, changeValue) {
        const performanceValue = document.querySelector(`.${period}-performance .performance-value`);
        const performanceBar = document.querySelector(`.${period}-performance .performance-bar`);
        
        if (performanceValue && performanceBar) {
            performanceValue.textContent = `${changeValue >= 0 ? '+' : ''}${changeValue}%`;
            
            if (changeValue >= 0) {
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
            const width = Math.min(Math.abs(changeValue) * 5, 100);
            performanceBar.style.width = `${width}%`;
        }
    }
    
    // Nettoyer le widget TradingView existant
    function destroyTradingViewWidget() {
        const container = document.getElementById('tradingview-chart');
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    }
    
    // Initialiser le graphique TradingView
    function initTradingViewChart() {
        // Nettoyer le conteneur
        destroyTradingViewWidget();
        
        // Widget TradingView pour le graphique principal
        tradingViewWidget = new TradingView.widget({
            "container_id": "tradingview-chart",
            "width": "100%",
            "height": "100%",
            "symbol": `${getExchangePrefix(currentSymbol)}:${currentSymbol}`,
            "interval": getIntervalFromTimeRange(currentTimeRange),
            "timezone": "Europe/Paris",
            "theme": "dark",
            "style": "1",
            "locale": "fr",
            "toolbar_bg": "#1e1e1e",
            "enable_publishing": false,
            "withdateranges": true,
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "studies": [
                "RSI@tv-basicstudies",
                "MAExp@tv-basicstudies",
                "MACD@tv-basicstudies"
            ],
            "hide_top_toolbar": false,
            "hide_legend": false,
            "save_image": false
        });
    }
    
    // Mettre à jour le graphique TradingView avec le symbole et la plage de temps spécifiés
    function updateTradingViewChart(symbol, timeRange) {
        // Détruire et recréer le widget avec les nouveaux paramètres
        if (tradingViewWidget) {
            destroyTradingViewWidget();
        }
        
        // Widget TradingView pour le graphique principal
        tradingViewWidget = new TradingView.widget({
            "container_id": "tradingview-chart",
            "width": "100%",
            "height": "100%",
            "symbol": `${getExchangePrefix(symbol)}:${symbol}`,
            "interval": getIntervalFromTimeRange(timeRange),
            "timezone": "Europe/Paris",
            "theme": "dark",
            "style": "1",
            "locale": "fr",
            "toolbar_bg": "#1e1e1e",
            "enable_publishing": false,
            "withdateranges": true,
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "studies": [
                "RSI@tv-basicstudies",
                "MAExp@tv-basicstudies",
                "MACD@tv-basicstudies"
            ],
            "hide_top_toolbar": false,
            "hide_legend": false,
            "save_image": false
        });
    }
    
    // Obtenir le préfixe d'échange pour TradingView
    function getExchangePrefix(symbol) {
        // Par défaut, on utilise NASDAQ pour les actions connues, NYSE pour les autres
        const knownSymbols = {
            'AAPL': 'NASDAQ',
            'MSFT': 'NASDAQ',
            'GOOGL': 'NASDAQ',
            'GOOG': 'NASDAQ',
            'AMZN': 'NASDAQ',
            'META': 'NASDAQ',
            'TSLA': 'NASDAQ',
            'NVDA': 'NASDAQ',
            'NFLX': 'NASDAQ',
            'INTC': 'NASDAQ',
            'CSCO': 'NASDAQ',
            'ADBE': 'NASDAQ',
            'PYPL': 'NASDAQ',
            'CMCSA': 'NASDAQ',
            'PEP': 'NASDAQ',
            'COST': 'NASDAQ',
            'AVGO': 'NASDAQ',
            'TXN': 'NASDAQ',
            'QCOM': 'NASDAQ',
            'TMUS': 'NASDAQ',
            'SBUX': 'NASDAQ',
            'AMGN': 'NASDAQ',
            'CHTR': 'NASDAQ',
            'INTU': 'NASDAQ',
            'ISRG': 'NASDAQ',
            'MDLZ': 'NASDAQ',
            'GILD': 'NASDAQ',
            'BKNG': 'NASDAQ',
            'ADI': 'NASDAQ',
            'ADP': 'NASDAQ',
            'REGN': 'NASDAQ',
            'BIIB': 'NASDAQ',
            'FISV': 'NASDAQ',
            'ATVI': 'NASDAQ',
            'JD': 'NASDAQ',
            'ILMN': 'NASDAQ',
            'VRTX': 'NASDAQ',
            'LRCX': 'NASDAQ',
            'MU': 'NASDAQ',
            'CSX': 'NASDAQ',
            'ALGN': 'NASDAQ',
            'ADSK': 'NASDAQ',
            'MNST': 'NASDAQ',
            'IDXX': 'NASDAQ',
            'WDAY': 'NASDAQ',
            'CDNS': 'NASDAQ',
            'MAR': 'NASDAQ',
            'MELI': 'NASDAQ',
            'ORLY': 'NASDAQ',
        };
        
        return knownSymbols[symbol] || 'NYSE';
    }
    
    // Convertir la plage de temps en intervalle TradingView
    function getIntervalFromTimeRange(timeRange) {
        switch (timeRange) {
            case '1D': return '5';      // 5 minutes
            case '1W': return '60';     // 60 minutes
            case '1M': return 'D';      // Daily
            case '3M': return 'D';      // Daily
            case '1Y': return 'W';      // Weekly
            case 'ALL': return 'M';     // Monthly
            default: return 'D';        // Daily par défaut
        }
    }
    
    // Obtenir le nom d'une entreprise basé sur son symbole
    function getCompanyName(symbol) {
        const companies = {
            'AAPL': 'Apple Inc.',
            'MSFT': 'Microsoft Corporation',
            'GOOGL': 'Alphabet Inc.',
            'GOOG': 'Alphabet Inc.',
            'AMZN': 'Amazon.com Inc.',
            'META': 'Meta Platforms Inc.',
            'TSLA': 'Tesla Inc.',
            'NVDA': 'NVIDIA Corporation',
            'BRK.A': 'Berkshire Hathaway Inc.',
            'JPM': 'JPMorgan Chase & Co.',
            'V': 'Visa Inc.',
            'JNJ': 'Johnson & Johnson',
            'WMT': 'Walmart Inc.',
            'PG': 'Procter & Gamble Co.',
            'MA': 'Mastercard Inc.',
            'UNH': 'UnitedHealth Group Inc.',
            'HD': 'Home Depot Inc.',
            'BAC': 'Bank of America Corp.',
            'DIS': 'Walt Disney Co.',
            'PFE': 'Pfizer Inc.',
            'XOM': 'Exxon Mobil Corporation'
        };
        
        return companies[symbol] || `${symbol} Corp.`;
    }
    
    // Démarrer l'application
    init();
});
