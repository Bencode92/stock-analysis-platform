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
    const chartSection = document.querySelector('.chart-section');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    
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
    let isFullscreen = false; // Indique si le graphique est en plein écran
    let lastTradingViewData = null; // Dernières données récupérées depuis TradingView
    
    // Liste des actions populaires pour suggestion
    const popularStocks = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'BRK.B'
    ];
    
    // Initialisation
    function init() {
        // Initialiser le graphique TradingView (avant de récupérer les données)
        initTradingViewWidget();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Afficher les suggestions de stocks populaires
        showPopularStocksSuggestions();
        
        // Mettre à jour l'heure de marché
        updateMarketTime();
        
        // Mettre à jour régulièrement l'heure et les données
        setInterval(updateMarketTime, 1000);
        setInterval(syncDataFromTradingView, 10000); // Rafraîchir toutes les 10 secondes
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
                
                // Mettre à jour les performances après un court délai
                setTimeout(() => {
                    syncDataFromTradingView();
                }, 300);
            });
        });
        
        // Bouton plein écran
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
            
            // Créer un bouton de sortie du mode plein écran
            const exitBtn = document.createElement('button');
            exitBtn.className = 'fullscreen-exit-btn';
            exitBtn.textContent = 'Quitter le plein écran';
            exitBtn.addEventListener('click', toggleFullscreen);
            chartSection.appendChild(exitBtn);
        }
        
        // Écouteur pour la touche Échap pour quitter le mode plein écran
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isFullscreen) {
                toggleFullscreen();
            }
        });
    }
    
    // Basculer en mode plein écran
    function toggleFullscreen() {
        if (!isFullscreen) {
            // Passer en mode plein écran
            chartSection.classList.add('fullscreen-chart');
            fullscreenBtn.textContent = 'Quitter le plein écran';
            
            // Recharger le widget TradingView pour qu'il s'adapte à la nouvelle taille
            if (isTvReady) {
                tradingViewWidget.resize(window.innerWidth, window.innerHeight - 60);
            }
            
            isFullscreen = true;
        } else {
            // Quitter le mode plein écran
            chartSection.classList.remove('fullscreen-chart');
            fullscreenBtn.textContent = 'Agrandir le graphique';
            
            // Recharger le widget TradingView pour qu'il s'adapte à la taille normale
            if (isTvReady) {
                setTimeout(() => {
                    tradingViewWidget.resize();
                }, 100);
            }
            
            isFullscreen = false;
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
            
            // Mettre à jour le graphique TradingView avec le nouveau symbole
            updateTradingViewSymbol(symbol);
            
            // Les données seront récupérées automatiquement depuis TradingView
            // après le chargement du graphique
            console.log(`Recherche effectuée pour: ${symbol}, avec plage temporelle: ${currentTimeRange}`);
        }
    }
    
    // Récupérer les données directement depuis TradingView
    function syncDataFromTradingView() {
        if (!tradingViewWidget || !isTvReady) return;
        
        try {
            // Obtenir le symbole actuel de TradingView
            let symbolInfo = tradingViewWidget.chart().symbolInfo();
            if (!symbolInfo) return;
            
            // Extraire les données de symbole propres (sans le préfixe d'échange)
            const symbolParts = symbolInfo.name.split(':');
            const cleanSymbol = symbolParts.length > 1 ? symbolParts[1] : symbolInfo.name;
            const exchange = symbolParts.length > 1 ? symbolParts[0] : getExchangePrefix(cleanSymbol);
            
            // Utiliser la méthode d'accès aux données de prix de TradingView
            tradingViewWidget.activeChart().getTradesSubscription().getLastDailyBarCloseTime((lastClose) => {
                tradingViewWidget.activeChart().getTradesSubscription().getMarkPrice((currentPrice) => {
                    if (!currentPrice) {
                        console.log('Impossible de récupérer le prix actuel depuis TradingView');
                        return;
                    }
                    
                    // Obtenir les données supplémentaires via des méthodes alternatives
                    const symbolDetails = tradingViewWidget.activeChart().getSymbolInfo();
                    
                    // Créer un objet avec les données récupérées de TradingView
                    const tradingViewData = {
                        symbol: cleanSymbol,
                        name: symbolDetails?.description || getCompanyName(cleanSymbol),
                        exchange: exchange,
                        price: currentPrice.toFixed(2),
                        previousClose: lastClose ? lastClose.toFixed(2) : getSimulatedValue(cleanSymbol, 'previousClose')
                    };
                    
                    // Compléter les données manquantes
                    completeTradingViewData(tradingViewData, cleanSymbol);
                    
                    // Mettre à jour l'UI avec ces données
                    updateUIFromTradingView(tradingViewData);
                    
                    // Sauvegarder les dernières données pour référence future
                    lastTradingViewData = tradingViewData;
                });
            });
        } catch (error) {
            console.error('Erreur lors de la récupération des données depuis TradingView:', error);
            // En cas d'erreur, utiliser des données simulées comme fallback
            fallbackToSimulatedData(currentSymbol);
        }
    }
    
    // Compléter les données manquantes avec des données simulées
    function completeTradingViewData(tradingViewData, symbol) {
        if (!tradingViewData) return null;
        
        // Calcul du changement de prix basé sur le prix précédent
        const prevClose = parseFloat(tradingViewData.previousClose || 0);
        const currentPrice = parseFloat(tradingViewData.price || 0);
        let changeValue = 0;
        let changePercent = 0;
        
        if (prevClose > 0 && currentPrice > 0) {
            changeValue = currentPrice - prevClose;
            changePercent = (changeValue / prevClose) * 100;
            tradingViewData.change = changeValue.toFixed(2);
            tradingViewData.changePercent = changePercent.toFixed(2);
        } else {
            // Si les valeurs ne sont pas disponibles, utiliser des valeurs simulées
            tradingViewData.change = getSimulatedValue(symbol, 'change');
            tradingViewData.changePercent = getSimulatedValue(symbol, 'changePercent');
        }
        
        // Compléter les autres métriques
        tradingViewData.open = getSimulatedValue(symbol, 'open');
        tradingViewData.dayHigh = getSimulatedValue(symbol, 'dayHigh');
        tradingViewData.dayLow = getSimulatedValue(symbol, 'dayLow');
        tradingViewData.volume = getSimulatedValue(symbol, 'volume');
        tradingViewData.marketCap = getSimulatedValue(symbol, 'marketCap');
        tradingViewData.peRatio = getSimulatedValue(symbol, 'peRatio');
        tradingViewData.dividend = getSimulatedValue(symbol, 'dividend');
        
        // Données de performance
        tradingViewData.dayChange = parseFloat(changePercent.toFixed(2)) || getSimulatedPerformance(symbol, 'dayChange');
        tradingViewData.weekChange = getSimulatedPerformance(symbol, 'weekChange');
        tradingViewData.monthChange = getSimulatedPerformance(symbol, 'monthChange');
        tradingViewData.threeMonthChange = getSimulatedPerformance(symbol, 'threeMonthChange');
        tradingViewData.yearChange = getSimulatedPerformance(symbol, 'yearChange');
        
        return tradingViewData;
    }
    
    // Obtenir une valeur simulée à partir des données préconfigurées
    function getSimulatedValue(symbol, field) {
        // Référence de données préconfigurées pour les valeurs simulées
        const stocksData = {
            'AAPL': {
                basePrice: 189.97,
                name: 'Apple Inc.',
                open: '188.85',
                previousClose: '188.45',
                dayHigh: '190.23',
                dayLow: '187.68',
                volume: '42.8M',
                marketCap: '2.95T',
                peRatio: '31.2',
                dividend: '0.51%'
            },
            'MSFT': {
                basePrice: 428.73,
                name: 'Microsoft Corporation',
                open: '426.50',
                previousClose: '425.35',
                dayHigh: '430.25',
                dayLow: '425.10',
                volume: '18.5M',
                marketCap: '3.18T',
                peRatio: '36.4',
                dividend: '0.73%'
            },
            'GOOGL': {
                basePrice: 149.82,
                name: 'Alphabet Inc.',
                open: '148.90',
                previousClose: '148.45',
                dayHigh: '150.75',
                dayLow: '148.30',
                volume: '23.2M',
                marketCap: '1.87T',
                peRatio: '25.8',
                dividend: '0.00%'
            }
            // Autres stocks peuvent être ajoutés ici
        };
        
        // Si le symbole est dans nos données préconfigurées, utiliser ces valeurs
        if (stocksData[symbol] && stocksData[symbol][field] !== undefined) {
            return stocksData[symbol][field];
        }
        
        // Sinon, générer des valeurs raisonnables en fonction du champ demandé
        // Ceci est une simulation pour la démo
        const basePrice = lastTradingViewData?.price || 100;
        
        switch (field) {
            case 'open':
                return (parseFloat(basePrice) * 0.998).toFixed(2);
            case 'previousClose':
                return (parseFloat(basePrice) * 0.995).toFixed(2);
            case 'dayHigh':
                return (parseFloat(basePrice) * 1.005).toFixed(2);
            case 'dayLow':
                return (parseFloat(basePrice) * 0.995).toFixed(2);
            case 'volume':
                return `${Math.floor(Math.random() * 100)}M`;
            case 'marketCap':
                return `${Math.floor(Math.random() * 1000)}B`;
            case 'peRatio':
                return (15 + Math.random() * 20).toFixed(1);
            case 'dividend':
                return `${(Math.random() * 3).toFixed(2)}%`;
            case 'change':
                return (parseFloat(basePrice) * 0.005 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2);
            case 'changePercent':
                return (0.5 * (Math.random() > 0.5 ? 1 : -1)).toFixed(2);
            default:
                return '0';
        }
    }
    
    // Obtenir des performances simulées pour les différentes périodes
    function getSimulatedPerformance(symbol, period) {
        // Performance préconfigurées
        const performanceData = {
            'AAPL': {
                dayChange: 0.81,
                weekChange: 2.45,
                monthChange: 5.32,
                threeMonthChange: 12.78,
                yearChange: 18.45
            },
            'MSFT': {
                dayChange: 0.12,
                weekChange: 1.85,
                monthChange: 4.25,
                threeMonthChange: 9.35,
                yearChange: 22.67
            },
            'GOOGL': {
                dayChange: 1.02,
                weekChange: -0.45,
                monthChange: -2.14,
                threeMonthChange: 5.43,
                yearChange: 11.26
            },
            'AMZN': {
                dayChange: 2.15,
                weekChange: 3.27,
                monthChange: 5.70,
                threeMonthChange: 10.23,
                yearChange: 18.92
            }
            // Ajoutez d'autres symboles au besoin
        };
        
        // Si le symbole est dans nos données préconfigurées, utiliser ces valeurs
        if (performanceData[symbol] && performanceData[symbol][period] !== undefined) {
            return performanceData[symbol][period];
        }
        
        // Générer des performances aléatoires mais réalistes en fonction de la période
        switch (period) {
            case 'dayChange':
                return parseFloat((Math.random() * 3 - 1).toFixed(2));
            case 'weekChange':
                return parseFloat((Math.random() * 6 - 2).toFixed(2));
            case 'monthChange':
                return parseFloat((Math.random() * 10 - 3).toFixed(2));
            case 'threeMonthChange':
                return parseFloat((Math.random() * 20 - 5).toFixed(2));
            case 'yearChange':
                return parseFloat((Math.random() * 40 - 10).toFixed(2));
            default:
                return 0;
        }
    }
    
    // En cas d'erreur, fallback sur les données simulées
    function fallbackToSimulatedData(symbol) {
        console.log('Utilisation de données simulées pour', symbol);
        
        // Créer des données simulées
        const simulatedData = {
            symbol: symbol,
            name: getCompanyName(symbol),
            exchange: getExchangePrefix(symbol),
            price: getSimulatedValue(symbol, 'price') || '100.00',
            change: getSimulatedValue(symbol, 'change'),
            changePercent: getSimulatedValue(symbol, 'changePercent'),
            open: getSimulatedValue(symbol, 'open'),
            previousClose: getSimulatedValue(symbol, 'previousClose'),
            dayHigh: getSimulatedValue(symbol, 'dayHigh'),
            dayLow: getSimulatedValue(symbol, 'dayLow'),
            volume: getSimulatedValue(symbol, 'volume'),
            marketCap: getSimulatedValue(symbol, 'marketCap'),
            peRatio: getSimulatedValue(symbol, 'peRatio'),
            dividend: getSimulatedValue(symbol, 'dividend'),
            dayChange: getSimulatedPerformance(symbol, 'dayChange'),
            weekChange: getSimulatedPerformance(symbol, 'weekChange'),
            monthChange: getSimulatedPerformance(symbol, 'monthChange'),
            threeMonthChange: getSimulatedPerformance(symbol, 'threeMonthChange'),
            yearChange: getSimulatedPerformance(symbol, 'yearChange')
        };
        
        // Mettre à jour l'interface utilisateur avec ces données
        updateUIFromTradingView(simulatedData);
    }
    
    // Mettre à jour l'interface utilisateur avec les données de TradingView
    function updateUIFromTradingView(tvData) {
        if (!tvData) return;
        
        // Mise à jour du titre et info de l'action
        stockInfoTitle.textContent = `${tvData.name} (${tvData.symbol})`;
        exchangeElement.textContent = tvData.exchange;
        
        // Mise à jour du logo (si possible)
        try {
            const logoElement = document.querySelector('.company-logo');
            if (logoElement) {
                // Nettoyer le nom de l'entreprise pour l'URL du logo
                const companyName = tvData.name.toLowerCase().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
                logoElement.src = `https://logo.clearbit.com/${companyName}.com`;
                logoElement.onerror = function() {
                    this.src = `https://via.placeholder.com/40x40?text=${tvData.symbol}`;
                };
            }
        } catch (error) {
            console.log('Erreur lors de la mise à jour du logo', error);
        }
        
        // Mise à jour du prix et de la variation
        currentPrice.textContent = `$${tvData.price}`;
        
        const changeValue = parseFloat(tvData.change);
        const changeText = `${changeValue >= 0 ? '+' : ''}${tvData.change} (${changeValue >= 0 ? '+' : ''}${tvData.changePercent}%)`;
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
        const openVal = tvData.open ? parseFloat(tvData.open) : 0;
        const prevCloseVal = tvData.previousClose ? parseFloat(tvData.previousClose) : 0;
        const dayHighVal = tvData.dayHigh ? parseFloat(tvData.dayHigh) : 0;
        const dayLowVal = tvData.dayLow ? parseFloat(tvData.dayLow) : 0;
        const priceVal = tvData.price ? parseFloat(tvData.price) : 0;
        
        updateMetricWithColor(openPrice, tvData.open, openVal - prevCloseVal);
        updateMetricWithColor(prevClose, tvData.previousClose);
        updateMetricWithColor(dayHigh, tvData.dayHigh, dayHighVal - priceVal);
        updateMetricWithColor(dayLow, tvData.dayLow, dayLowVal - priceVal);
        
        // Métriques sans coloration
        if (volume) volume.textContent = tvData.volume;
        if (marketCap) marketCap.textContent = tvData.marketCap;
        if (peRatio) peRatio.textContent = tvData.peRatio;
        if (dividend) dividend.textContent = tvData.dividend;
        
        // Mise à jour des performances en fonction de la période sélectionnée
        updatePerformanceBars(tvData);
    }
    
    // Mettre à jour le symbole dans TradingView
    function updateTradingViewSymbol(symbol) {
        if (tradingViewWidget && isTvReady) {
            // Construire la chaîne du symbole avec le bon préfixe de bourse
            const fullSymbol = `${getExchangePrefix(symbol)}:${symbol}`;
            tradingViewWidget.chart().setSymbol(fullSymbol, function() {
                console.log(`Symbole TradingView mis à jour: ${fullSymbol}`);
                // Attendre un moment pour que les données soient chargées, puis synchroniser
                setTimeout(syncDataFromTradingView, 1000);
            });
        } else {
            // Si TradingView n'est pas encore prêt, ajouter à la file d'attente
            tvReadyCallbacks.push(() => {
                const fullSymbol = `${getExchangePrefix(symbol)}:${symbol}`;
                tradingViewWidget.chart().setSymbol(fullSymbol);
                // Attendre un moment pour que les données soient chargées, puis synchroniser
                setTimeout(syncDataFromTradingView, 1000);
            });
        }
    }
    
    // Mettre à jour l'intervalle de temps dans TradingView
    function updateTradingViewInterval(timeRange) {
        if (tradingViewWidget && isTvReady) {
            const interval = getIntervalFromTimeRange(timeRange);
            tradingViewWidget.chart().setResolution(interval, function() {
                console.log(`Intervalle TradingView mis à jour: ${interval}`);
                // Rafraîchir les données après un changement d'intervalle
                setTimeout(syncDataFromTradingView, 500);
            });
        } else {
            // Si TradingView n'est pas encore prêt, ajouter à la file d'attente
            tvReadyCallbacks.push(() => {
                const interval = getIntervalFromTimeRange(timeRange);
                tradingViewWidget.chart().setResolution(interval);
                // Rafraîchir les données après un changement d'intervalle
                setTimeout(syncDataFromTradingView, 500);
            });
        }
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
    function updatePerformanceBars(data) {
        // Mettre à jour les barres de performances
        updatePerformanceBar('day', data.dayChange);
        updatePerformanceBar('week', data.weekChange);
        updatePerformanceBar('month', data.monthChange);
        updatePerformanceBar('three-months', data.threeMonthChange);
        updatePerformanceBar('year', data.yearChange);
        
        // Mettre en évidence la période actuellement sélectionnée
        const selectedPeriod = getPerformancePeriodFromTimeRange(currentTimeRange);
        if (selectedPeriod) {
            const items = document.querySelectorAll('.performance-item');
            items.forEach(item => {
                if (item.classList.contains(`${selectedPeriod}-performance`)) {
                    item.style.fontWeight = 'bold';
                    item.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                } else {
                    item.style.fontWeight = 'normal';
                    item.style.backgroundColor = 'transparent';
                }
            });
        }
    }
    
    // Obtenir la période de performance correspondant à l'intervalle de temps
    function getPerformancePeriodFromTimeRange(timeRange) {
        switch (timeRange) {
            case '1D': return 'day';
            case '1W': return 'week';
            case '1M': return 'month';
            case '3M': return 'three-months';
            case '1Y': return 'year';
            case 'ALL': return 'year';
            default: return null;
        }
    }
    
    // Mettre à jour une barre de performance spécifique
    function updatePerformanceBar(period, changeValue) {
        const performanceValue = document.querySelector(`.${period}-performance .performance-value`);
        const performanceBar = document.querySelector(`.${period}-performance .performance-bar`);
        
        if (!performanceValue || !performanceBar || changeValue === undefined) return;
        
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
                        
                        // Synchroniser les données depuis TradingView
                        syncDataFromTradingView();
                        
                        console.log(`Symbole modifié depuis TradingView: ${cleanSymbol}`);
                    }
                }
            });
            
            // Exécuter les callbacks en attente
            tvReadyCallbacks.forEach(callback => callback());
            tvReadyCallbacks = [];
            
            // Synchroniser les données initiales
            syncDataFromTradingView();
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