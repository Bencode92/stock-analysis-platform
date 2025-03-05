// StockPro - Application d'analyse d'actions en temps réel
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const searchInput = document.getElementById('stockSearch');
    const searchBtn = document.getElementById('searchBtn');
    const timeBtns = document.querySelectorAll('.time-btn');
    const currentPrice = document.querySelector('.current-price');
    const priceChange = document.querySelector('.price-change');
    const stockInfoTitle = document.querySelector('.stock-info h2');
    const exchangeElement = document.querySelector('.exchange');
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span');
    
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
    let stockData = null; // Stockage des données actuelles pour l'action
    let tvReadyCallbacks = []; // Callbacks pour l'initialisation de TradingView
    let isTvReady = false; // Indique si TradingView est prêt
    
    // Liste des actions populaires pour suggestion
    const popularStocks = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'BRK.B'
    ];
    
    // Initialisation
    function init() {
        // Charger les données en temps réel pour Apple
        fetchRealTimeData(currentSymbol);
        
        // Initialiser le graphique TradingView
        initTradingViewWidget();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Afficher les suggestions de stocks populaires
        showPopularStocksSuggestions();
        
        // Mettre à jour l'heure de marché
        updateMarketTime();
        
        // Mettre à jour régulièrement l'heure et les données
        setInterval(updateMarketTime, 1000);
        setInterval(() => fetchRealTimeData(currentSymbol), 60000); // Rafraîchir toutes les minutes
    }
    
    // Afficher des suggestions de stocks populaires sous la barre de recherche
    function showPopularStocksSuggestions() {
        const searchContainer = document.querySelector('.search-container');
        
        if (!document.querySelector('.stock-suggestions')) {
            const suggestionsDiv = document.createElement('div');
            suggestionsDiv.className = 'stock-suggestions';
            suggestionsDiv.innerHTML = '<span>Populaires: </span>';
            
            popularStocks.forEach(symbol => {
                const stockLink = document.createElement('a');
                stockLink.href = '#';
                stockLink.textContent = symbol;
                stockLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    searchStock(symbol);
                });
                suggestionsDiv.appendChild(stockLink);
            });
            
            searchContainer.parentNode.insertBefore(suggestionsDiv, searchContainer.nextSibling);
            
            // Ajouter un style CSS pour les suggestions
            const style = document.createElement('style');
            style.textContent = `
                .stock-suggestions {
                    padding: 5px 20px;
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .stock-suggestions span {
                    margin-right: 5px;
                }
                .stock-suggestions a {
                    color: var(--primary-color);
                    margin-right: 10px;
                    text-decoration: none;
                }
                .stock-suggestions a:hover {
                    text-decoration: underline;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Bouton de recherche
        searchBtn.addEventListener('click', function() {
            const symbol = searchInput.value.trim().toUpperCase();
            if (symbol) {
                searchStock(symbol);
            }
        });
        
        // Recherche à la pression de Entrée
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const symbol = searchInput.value.trim().toUpperCase();
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
                updateTradingViewInterval(currentTimeRange);
                
                // Mettre à jour les performances pour refléter la période sélectionnée
                if (stockData) {
                    updatePerformanceBars(stockData);
                }
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
    
    // Chercher et afficher les données pour un nouveau titre
    function searchStock(symbol) {
        // Vérifier si le symbole est différent du symbole actuel
        if (currentSymbol !== symbol) {
            currentSymbol = symbol;
            
            // Mettre à jour l'affichage du symbole dans le champ de recherche
            searchInput.value = symbol;
            
            // Récupérer les données pour ce symbole
            fetchRealTimeData(symbol);
            
            // Mettre à jour le graphique TradingView avec le nouveau symbole
            updateTradingViewSymbol(symbol);
            
            console.log(`Recherche effectuée pour: ${symbol}, avec plage temporelle: ${currentTimeRange}`);
        }
    }
    
    // Mettre à jour le symbole dans TradingView
    function updateTradingViewSymbol(symbol) {
        if (tradingViewWidget && isTvReady) {
            // Construire la chaîne du symbole avec le bon préfixe de bourse
            const fullSymbol = `${getExchangePrefix(symbol)}:${symbol}`;
            tradingViewWidget.chart().setSymbol(fullSymbol, function() {
                console.log(`Symbole TradingView mis à jour: ${fullSymbol}`);
            });
        } else {
            // Si TradingView n'est pas encore prêt, ajouter à la file d'attente
            tvReadyCallbacks.push(() => {
                const fullSymbol = `${getExchangePrefix(symbol)}:${symbol}`;
                tradingViewWidget.chart().setSymbol(fullSymbol);
            });
        }
    }
    
    // Mettre à jour l'intervalle de temps dans TradingView
    function updateTradingViewInterval(timeRange) {
        if (tradingViewWidget && isTvReady) {
            const interval = getIntervalFromTimeRange(timeRange);
            tradingViewWidget.chart().setResolution(interval, function() {
                console.log(`Intervalle TradingView mis à jour: ${interval}`);
            });
        } else {
            // Si TradingView n'est pas encore prêt, ajouter à la file d'attente
            tvReadyCallbacks.push(() => {
                const interval = getIntervalFromTimeRange(timeRange);
                tradingViewWidget.chart().setResolution(interval);
            });
        }
    }
    
    // Récupérer les données en temps réel
    async function fetchRealTimeData(symbol) {
        try {
            // Dans une implémentation réelle avec Puppeteer, nous ferions:
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
            
            // Pour cette démo, nous utilisons des données simulées
            stockData = await getSimulatedStockData(symbol);
            
            // Mettre à jour l'interface utilisateur
            updateUI(stockData);
            
        } catch (error) {
            console.error('Erreur lors de la récupération des données:', error);
            showErrorMessage(`Impossible de récupérer les données pour ${symbol}. Veuillez réessayer.`);
        }
    }
    
    // Afficher un message d'erreur
    function showErrorMessage(message) {
        alert(message); // Pour cette démo, un simple alert suffira
    }
    
    // Simuler des données de stock pour la démo
    async function getSimulatedStockData(symbol) {
        // Ajouter un peu de variation aléatoire pour simuler des mises à jour en temps réel
        const randomFactor = Math.random() * 0.02 - 0.01; // -1% à +1%
        
        // Données préconfigurées pour les titres populaires
        const stocksData = {
            'AAPL': {
                basePrice: 189.97,
                name: 'Apple Inc.',
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
            },
            'MSFT': {
                basePrice: 428.73,
                name: 'Microsoft Corporation',
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
            },
            'GOOGL': {
                basePrice: 149.82,
                name: 'Alphabet Inc.',
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
            },
            'AMZN': {
                basePrice: 178.75,
                name: 'Amazon.com Inc.',
                volume: '35.6M',
                marketCap: '1.86T',
                peRatio: '60.8',
                dividend: '0.00%',
                dayChange: 2.15,
                weekChange: 3.27,
                monthChange: 5.70,
                threeMonthChange: 10.23,
                yearChange: 18.92,
                exchange: 'NASDAQ'
            },
            'TSLA': {
                basePrice: 175.34,
                name: 'Tesla Inc.',
                volume: '85.3M',
                marketCap: '558B',
                peRatio: '50.2',
                dividend: '0.00%',
                dayChange: -1.25,
                weekChange: -3.78,
                monthChange: -6.20,
                threeMonthChange: 8.45,
                yearChange: -15.30,
                exchange: 'NASDAQ'
            },
            'META': {
                basePrice: 485.58,
                name: 'Meta Platforms Inc.',
                volume: '15.7M',
                marketCap: '1.24T',
                peRatio: '27.5',
                dividend: '0.00%',
                dayChange: 1.85,
                weekChange: 2.67,
                monthChange: 7.90,
                threeMonthChange: 14.35,
                yearChange: 45.20,
                exchange: 'NASDAQ'
            },
            'BRK.B': {
                basePrice: 408.83,
                name: 'Berkshire Hathaway Inc.',
                volume: '3.2M',
                marketCap: '890B',
                peRatio: '8.7',
                dividend: '0.00%',
                dayChange: 0.35,
                weekChange: 1.20,
                monthChange: 2.80,
                threeMonthChange: 5.75,
                yearChange: 15.40,
                exchange: 'NYSE'
            },
            'NVDA': {
                basePrice: 875.28,
                name: 'NVIDIA Corporation',
                volume: '57.2M',
                marketCap: '2.15T',
                peRatio: '73.4',
                dividend: '0.04%',
                dayChange: 3.25,
                weekChange: 7.80,
                monthChange: 12.50,
                threeMonthChange: 35.75,
                yearChange: 218.40,
                exchange: 'NASDAQ'
            },
            'JPM': {
                basePrice: 187.42,
                name: 'JPMorgan Chase & Co.',
                volume: '8.5M',
                marketCap: '541B',
                peRatio: '11.6',
                dividend: '2.31%',
                dayChange: -0.72,
                weekChange: -1.85,
                monthChange: 1.35,
                threeMonthChange: 5.80,
                yearChange: 24.30,
                exchange: 'NYSE'
            },
            'V': {
                basePrice: 279.56,
                name: 'Visa Inc.',
                volume: '5.8M',
                marketCap: '598B',
                peRatio: '32.5',
                dividend: '0.69%',
                dayChange: 0.67,
                weekChange: 1.25,
                monthChange: 3.85,
                threeMonthChange: 8.60,
                yearChange: 13.50,
                exchange: 'NYSE'
            },
            // Actions française - Euronext Paris
            'OR.PA': {
                basePrice: 408.15,
                name: 'L\'Oréal S.A.',
                volume: '0.3M',
                marketCap: '219B',
                peRatio: '38.4',
                dividend: '1.27%',
                dayChange: 0.85,
                weekChange: 2.15,
                monthChange: 3.45,
                threeMonthChange: 7.25,
                yearChange: 12.50,
                exchange: 'EURONEXT'
            },
            'BNP.PA': {
                basePrice: 64.74,
                name: 'BNP Paribas S.A.',
                volume: '1.5M',
                marketCap: '74B',
                peRatio: '9.8',
                dividend: '4.65%',
                dayChange: -0.35,
                weekChange: -1.20,
                monthChange: 2.80,
                threeMonthChange: 5.40,
                yearChange: 18.30,
                exchange: 'EURONEXT'
            },
            'AIR.PA': {
                basePrice: 142.94,
                name: 'Airbus SE',
                volume: '0.8M',
                marketCap: '112B',
                peRatio: '26.3',
                dividend: '1.58%',
                dayChange: 1.20,
                weekChange: 2.65,
                monthChange: 4.35,
                threeMonthChange: 8.75,
                yearChange: 14.20,
                exchange: 'EURONEXT'
            }
        };
        
        // Si nous avons des données préconfigurées pour ce symbole
        if (stocksData[symbol]) {
            const stockInfo = stocksData[symbol];
            const basePrice = stockInfo.basePrice;
            const currentPriceValue = basePrice * (1 + randomFactor);
            const priceChangeValue = currentPriceValue - basePrice;
            const priceChangePercent = (priceChangeValue / basePrice) * 100;
            
            return {
                symbol: symbol,
                name: stockInfo.name,
                price: currentPriceValue.toFixed(2),
                change: priceChangeValue.toFixed(2),
                changePercent: priceChangePercent.toFixed(2),
                open: (basePrice * 0.998).toFixed(2),
                previousClose: (basePrice * 0.995).toFixed(2),
                dayHigh: (currentPriceValue * 1.005).toFixed(2),
                dayLow: (currentPriceValue * 0.995).toFixed(2),
                volume: stockInfo.volume,
                marketCap: stockInfo.marketCap,
                peRatio: stockInfo.peRatio,
                dividend: stockInfo.dividend,
                dayChange: stockInfo.dayChange,
                weekChange: stockInfo.weekChange,
                monthChange: stockInfo.monthChange,
                threeMonthChange: stockInfo.threeMonthChange,
                yearChange: stockInfo.yearChange,
                exchange: stockInfo.exchange
            };
        } else {
            // Génération aléatoire pour les symboles inconnus
            const basePrice = 100 + Math.random() * 900;
            const currentPriceValue = basePrice * (1 + randomFactor);
            const priceChangeValue = currentPriceValue - basePrice;
            const priceChangePercent = (priceChangeValue / basePrice) * 100;
            
            // Déterminer si c'est une action française (se termine par .PA)
            const isEuronext = symbol.endsWith('.PA');
            
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
                exchange: isEuronext ? 'EURONEXT' : getExchangePrefix(symbol)
            };
        }
    }
    
    // Mettre à jour l'interface utilisateur avec les données reçues
    function updateUI(stockData) {
        // Mise à jour du titre et info de l'action
        stockInfoTitle.textContent = `${stockData.name} (${stockData.symbol})`;
        exchangeElement.textContent = stockData.exchange;
        
        // Mise à jour du logo (si possible)
        try {
            const logoElement = document.querySelector('.company-logo');
            if (logoElement) {
                // Nettoyer le nom de l'entreprise pour l'URL du logo
                const companyName = stockData.name.toLowerCase().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
                logoElement.src = `https://logo.clearbit.com/${companyName}.com`;
                logoElement.onerror = function() {
                    this.src = `https://via.placeholder.com/40x40?text=${stockData.symbol}`;
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
        
        // Appliquer les classes CSS pour les couleurs
        if (changeValue >= 0) {
            priceChange.classList.remove('negative');
            priceChange.classList.add('positive');
        } else {
            priceChange.classList.remove('positive');
            priceChange.classList.add('negative');
        }
        
        // Mise à jour des métriques avec coloration
        updateMetricWithColor(openPrice, stockData.open, parseFloat(stockData.open) - parseFloat(stockData.previousClose));
        updateMetricWithColor(prevClose, stockData.previousClose);
        updateMetricWithColor(dayHigh, stockData.dayHigh, parseFloat(stockData.dayHigh) - parseFloat(stockData.price));
        updateMetricWithColor(dayLow, stockData.dayLow, parseFloat(stockData.dayLow) - parseFloat(stockData.price));
        
        // Métriques sans coloration
        if (volume) volume.textContent = stockData.volume;
        if (marketCap) marketCap.textContent = stockData.marketCap;
        if (peRatio) peRatio.textContent = stockData.peRatio;
        if (dividend) dividend.textContent = stockData.dividend;
        
        // Mise à jour des performances en fonction de la période sélectionnée
        updatePerformanceBars(stockData);
    }
    
    // Mettre à jour une métrique avec coloration
    function updateMetricWithColor(element, value, changeValue = null) {
        if (!element) return;
        
        // Formater avec le symbole $ si c'est un prix
        if (typeof value === 'string' && !value.includes('%')) {
            element.textContent = value.startsWith('$') ? value : `$${value}`;
        } else {
            element.textContent = value;
        }
        
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
    function updatePerformanceBars(stockData) {
        // Mettre à jour les barres de performances selon la plage de temps sélectionnée
        let selectedPerformanceValue;
        
        switch (currentTimeRange) {
            case '1D':
                selectedPerformanceValue = stockData.dayChange;
                break;
            case '1W':
                selectedPerformanceValue = stockData.weekChange;
                break;
            case '1M':
                selectedPerformanceValue = stockData.monthChange;
                break;
            case '3M':
                selectedPerformanceValue = stockData.threeMonthChange;
                break;
            case '1Y':
            case 'ALL':
                selectedPerformanceValue = stockData.yearChange;
                break;
            default:
                selectedPerformanceValue = stockData.dayChange;
        }
        
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
            
            // Appliquer les classes CSS pour les couleurs
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
        if (container) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        }
        isTvReady = false;
    }
    
    // Initialiser le graphique TradingView
    function initTradingViewWidget() {
        // Nettoyer le conteneur
        destroyTradingViewWidget();
        
        // Construire la chaîne du symbole avec le bon préfixe de bourse
        const fullSymbol = `${getExchangePrefix(currentSymbol)}:${currentSymbol}`;
        
        // Widget TradingView pour le graphique principal
        tradingViewWidget = new TradingView.widget({
            "container_id": "tradingview-chart",
            "width": "100%",
            "height": "100%",
            "symbol": fullSymbol,
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
            "save_image": false,
            // Important: Gérer le changement de symbole dans le widget TradingView
            "symbol_change": true,
            "symbol_search": true,
            "overrides": {
                "mainSeriesProperties.showCountdown": true,
                "paneProperties.background": "#131722",
                "paneProperties.vertGridProperties.color": "#363c4e",
                "paneProperties.horzGridProperties.color": "#363c4e",
                "symbolWatermarkProperties.transparency": 90,
                "scalesProperties.textColor" : "#AAA"
            }
        });
        
        // Attendre que le widget soit chargé pour attacher des écouteurs d'événements
        tradingViewWidget.onChartReady(() => {
            console.log('TradingView chart is ready');
            isTvReady = true;
            
            // Attacher l'écouteur d'événements pour le changement de symbole
            tradingViewWidget.chart().onSymbolChanged().subscribe(null, (symbolData) => {
                if (symbolData) {
                    // Extraire le symbole sans préfixe d'échange
                    const symbolParts = symbolData.name.split(':');
                    const cleanSymbol = symbolParts.length > 1 ? symbolParts[1] : symbolData.name;
                    
                    // Ne mettre à jour que si le symbole a réellement changé
                    if (cleanSymbol !== currentSymbol) {
                        currentSymbol = cleanSymbol;
                        searchInput.value = cleanSymbol;
                        
                        // Mettre à jour les données
                        fetchRealTimeData(cleanSymbol);
                        
                        console.log(`Symbole modifié depuis TradingView: ${cleanSymbol}`);
                    }
                }
            });
            
            // Exécuter les callbacks en attente
            tvReadyCallbacks.forEach(callback => callback());
            tvReadyCallbacks = [];
        });
    }
    
    // Obtenir le préfixe d'échange pour TradingView
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
    
    // Convertir la plage de temps en intervalle TradingView
    function getIntervalFromTimeRange(timeRange) {
        switch (timeRange) {
            case '1D': return '5';      // 5 minutes
            case '1W': return '60';     // 60 minutes (1 heure)
            case '1M': return 'D';      // Daily (1 jour)
            case '3M': return 'D';      // Daily (1 jour)
            case '1Y': return 'W';      // Weekly (1 semaine)
            case 'ALL': return 'M';     // Monthly (1 mois)
            default: return 'D';        // Daily par défaut
        }
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
    
    // Démarrer l'application
    init();
});