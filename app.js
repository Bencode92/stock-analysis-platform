// FinanceAI - Application d'analyse d'actions et ETF
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const stockSymbolInput = document.getElementById('stockSymbol');
    const searchBtn = document.getElementById('searchBtn');
    const stockTags = document.querySelectorAll('.stock-tag');
    const watchlistBody = document.getElementById('watchlistBody');
    const emptyWatchlist = document.getElementById('emptyWatchlist');
    const watchlistTable = document.getElementById('watchlistTable');
    const refreshBtn = document.getElementById('refreshBtn');
    const stockDetailSection = document.getElementById('stockDetailSection');
    const watchlistSection = document.getElementById('watchlistSection');
    const backBtn = document.getElementById('backBtn');
    const addToWatchlistBtn = document.getElementById('addToWatchlistBtn');
    const messageModal = document.getElementById('messageModal');
    const modalMessage = document.getElementById('modalMessage');
    const closeModal = document.querySelector('.close-modal');
    const timeBtns = document.querySelectorAll('.time-btn');
    
    // État de l'application
    let watchlist = [];
    let currentStock = null;
    let chart = null;

    // Initialisation
    function init() {
        // Charger la watchlist depuis le stockage local
        loadWatchlist();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
    }
    
    // Configurer tous les écouteurs d'événements
    function setupEventListeners() {
        // Recherche
        searchBtn.addEventListener('click', function() {
            searchStock(stockSymbolInput.value.trim());
        });
        
        stockSymbolInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchStock(stockSymbolInput.value.trim());
            }
        });
        
        // Tags de stocks populaires
        stockTags.forEach(tag => {
            tag.addEventListener('click', function(e) {
                e.preventDefault();
                const symbol = this.getAttribute('data-symbol');
                searchStock(symbol);
            });
        });
        
        // Bouton de rafraîchissement
        refreshBtn.addEventListener('click', function() {
            refreshWatchlist();
        });
        
        // Bouton retour
        backBtn.addEventListener('click', function() {
            showWatchlistView();
        });
        
        // Ajouter à la watchlist
        addToWatchlistBtn.addEventListener('click', function() {
            if (currentStock) {
                addToWatchlist(currentStock);
            }
        });
        
        // Sélecteur de période pour le graphique
        timeBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                timeBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                const timeRange = this.getAttribute('data-range');
                if (currentStock) {
                    updatePriceChart(currentStock.symbol, timeRange);
                }
            });
        });
        
        // Fermeture du modal
        closeModal.addEventListener('click', function() {
            messageModal.style.display = 'none';
        });
        
        window.addEventListener('click', function(e) {
            if (e.target === messageModal) {
                messageModal.style.display = 'none';
            }
        });
    }
    
    // Charger la watchlist depuis le stockage local
    function loadWatchlist() {
        const savedWatchlist = localStorage.getItem('watchlist');
        if (savedWatchlist) {
            watchlist = JSON.parse(savedWatchlist);
            updateWatchlistTable();
        }
        
        toggleEmptyWatchlistMessage();
    }
    
    // Sauvegarder la watchlist dans le stockage local
    function saveWatchlist() {
        localStorage.setItem('watchlist', JSON.stringify(watchlist));
        toggleEmptyWatchlistMessage();
    }
    
    // Basculer entre les vues de liste et de détail
    function showWatchlistView() {
        stockDetailSection.classList.add('hidden');
        watchlistSection.classList.remove('hidden');
    }
    
    function showStockDetailView() {
        watchlistSection.classList.add('hidden');
        stockDetailSection.classList.remove('hidden');
    }
    
    // Afficher un message modal
    function showMessage(message) {
        modalMessage.textContent = message;
        messageModal.style.display = 'flex';
    }
    
    // Formater un nombre comme une devise
    function formatCurrency(value) {
        if (value === undefined || value === null) return '--';
        
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2
        }).format(value);
    }
    
    // Rafraîchir les données de la watchlist
    async function refreshWatchlist() {
        if (watchlist.length === 0) {
            showMessage('Votre liste de suivi est vide.');
            return;
        }
        
        showMessage('Actualisation des données...');
        
        try {
            // Pour chaque action dans la watchlist, mettre à jour les données
            const updatedWatchlist = [];
            
            for (const stock of watchlist) {
                const updatedStock = await fetchRealTimeStockData(stock.symbol);
                updatedWatchlist.push(updatedStock);
            }
            
            watchlist = updatedWatchlist;
            updateWatchlistTable();
            saveWatchlist();
            
            showMessage('Données actualisées avec succès.');
        } catch (error) {
            console.error('Erreur lors de l\'actualisation des données:', error);
            showMessage('Erreur lors de l\'actualisation. Veuillez réessayer.');
        }
    }
    
    // Mise à jour du tableau de watchlist
    function updateWatchlistTable() {
        watchlistBody.innerHTML = '';
        
        watchlist.forEach(stock => {
            const row = document.createElement('tr');
            
            const changeClass = stock.change >= 0 ? 'gain' : 'loss';
            const changeIcon = stock.change >= 0 ? '<i class="fas fa-caret-up"></i>' : '<i class="fas fa-caret-down"></i>';
            
            row.innerHTML = `
                <td><strong>${stock.symbol}</strong></td>
                <td>${stock.name}</td>
                <td>${formatCurrency(stock.price)}</td>
                <td class="${changeClass}">${changeIcon} ${stock.change.toFixed(2)}%</td>
                <td class="${stock.oneMonthChange >= 0 ? 'gain' : 'loss'}">${stock.oneMonthChange.toFixed(2)}%</td>
                <td class="${stock.threeMonthChange >= 0 ? 'gain' : 'loss'}">${stock.threeMonthChange.toFixed(2)}%</td>
                <td class="${stock.sixMonthChange >= 0 ? 'gain' : 'loss'}">${stock.sixMonthChange.toFixed(2)}%</td>
                <td class="actions-cell">
                    <button class="icon-btn view-btn" data-symbol="${stock.symbol}"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn delete-btn" data-symbol="${stock.symbol}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            
            watchlistBody.appendChild(row);
        });
        
        // Ajouter les écouteurs d'événements aux boutons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const symbol = e.currentTarget.getAttribute('data-symbol');
                fetchStockDetails(symbol);
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const symbol = e.currentTarget.getAttribute('data-symbol');
                removeFromWatchlist(symbol);
            });
        });
    }
    
    // Basculer l'affichage du message de watchlist vide
    function toggleEmptyWatchlistMessage() {
        if (watchlist.length === 0) {
            emptyWatchlist.classList.remove('hidden');
            watchlistTable.classList.add('hidden');
        } else {
            emptyWatchlist.classList.add('hidden');
            watchlistTable.classList.remove('hidden');
        }
    }
    
    // Ajouter une action à la watchlist
    function addToWatchlist(stockData) {
        const existingIndex = watchlist.findIndex(item => item.symbol === stockData.symbol);
        
        if (existingIndex !== -1) {
            // Mettre à jour les données existantes
            watchlist[existingIndex] = stockData;
            showMessage(`${stockData.symbol} a été mis à jour dans votre liste de suivi.`);
        } else {
            // Ajouter une nouvelle entrée
            watchlist.push(stockData);
            showMessage(`${stockData.symbol} a été ajouté à votre liste de suivi.`);
        }
        
        saveWatchlist();
        updateWatchlistTable();
    }
    
    // Supprimer une action de la watchlist
    function removeFromWatchlist(symbol) {
        watchlist = watchlist.filter(stock => stock.symbol !== symbol);
        saveWatchlist();
        updateWatchlistTable();
        
        showMessage(`${symbol} a été retiré de votre liste de suivi.`);
    }
    
    // Rechercher une action par son symbole
    function searchStock(symbol) {
        if (!symbol) {
            showMessage('Veuillez entrer un symbole boursier valide.');
            return;
        }
        
        fetchStockDetails(symbol);
    }
    
    // Récupérer les détails d'une action
    async function fetchStockDetails(symbol) {
        showMessage(`Recherche des informations pour ${symbol}...`);
        
        try {
            // Récupérer les données financières en temps réel
            const stockData = await fetchRealTimeStockData(symbol);
            currentStock = stockData;
            
            // Afficher les détails
            displayStockDetails(stockData);
        } catch (error) {
            console.error('Erreur lors de la récupération des détails:', error);
            showMessage(`Impossible de trouver des informations pour ${symbol}. Veuillez vérifier le symbole.`);
        }
    }
    
    // Récupérer les données financières en temps réel via Puppeteer
    async function fetchRealTimeStockData(symbol) {
        // Note: Dans une implémentation réelle, cette fonction utiliserait Puppeteer MCP
        // pour extraire les données de Yahoo Finance ou une autre source financière
        
        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Normaliser le symbole
        const normalizedSymbol = symbol.toUpperCase();
        
        // Données de démonstration pour les symboles courants
        const demoStocks = {
            'AAPL': {
                symbol: 'AAPL',
                name: 'Apple Inc.',
                price: 189.45,
                change: 1.25,
                oneMonthChange: 5.32,
                threeMonthChange: 12.78,
                sixMonthChange: 18.45,
                open: 187.20,
                high: 190.12,
                low: 186.95,
                volume: '42.8M',
                marketCap: '2.95T',
                peRatio: '31.2',
                dividend: '0.51%',
                fiftyTwoWeekHigh: 198.23,
                fiftyTwoWeekLow: 159.78,
                sector: 'Technologie',
                industry: 'Électronique grand public',
                description: 'Apple Inc. conçoit, fabrique et commercialise des smartphones, ordinateurs personnels, tablettes, wearables et accessoires. La société vend également divers services connexes.'
            },
            'MSFT': {
                symbol: 'MSFT',
                name: 'Microsoft Corporation',
                price: 428.73,
                change: -0.30,
                oneMonthChange: 3.18,
                threeMonthChange: 8.92,
                sixMonthChange: 22.67,
                open: 430.10,
                high: 432.45,
                low: 427.30,
                volume: '18.2M',
                marketCap: '3.18T',
                peRatio: '36.4',
                dividend: '0.73%',
                fiftyTwoWeekHigh: 438.25,
                fiftyTwoWeekLow: 309.35,
                sector: 'Technologie',
                industry: 'Logiciel - Infrastructure',
                description: 'Microsoft Corporation développe, licencie et vend des logiciels, du matériel, des services, des solutions et du contenu numérique. La société opère à travers trois segments: Productivity and Business Processes, Intelligent Cloud et More Personal Computing.'
            },
            'GOOGL': {
                symbol: 'GOOGL',
                name: 'Alphabet Inc.',
                price: 149.82,
                change: 1.02,
                oneMonthChange: -2.14,
                threeMonthChange: 5.43,
                sixMonthChange: 11.26,
                open: 148.50,
                high: 150.32,
                low: 147.95,
                volume: '23.4M',
                marketCap: '1.87T',
                peRatio: '25.8',
                dividend: '0.00%',
                fiftyTwoWeekHigh: 153.78,
                fiftyTwoWeekLow: 115.35,
                sector: 'Communication',
                industry: 'Services Internet - Content',
                description: 'Alphabet Inc. fournit divers produits et plateformes aux États-Unis, en Europe, au Moyen-Orient, en Afrique, en Asie-Pacifique, au Canada et en Amérique latine. Elle opère à travers Google Services, Google Cloud et Other Bets.'
            },
            'SPY': {
                symbol: 'SPY',
                name: 'SPDR S&P 500 ETF Trust',
                price: 516.97,
                change: 0.17,
                oneMonthChange: 3.25,
                threeMonthChange: 6.78,
                sixMonthChange: 14.32,
                open: 515.80,
                high: 518.45,
                low: 514.60,
                volume: '67.3M',
                marketCap: 'N/A',
                peRatio: 'N/A',
                dividend: '1.34%',
                fiftyTwoWeekHigh: 520.12,
                fiftyTwoWeekLow: 425.34,
                sector: 'ETF',
                industry: 'Large Cap Blend',
                description: 'Le SPDR S&P 500 ETF Trust est un fonds négocié en bourse conçu pour suivre l\'indice Standard & Poor\'s 500. Cet ETF vise à fournir des résultats d\'investissement qui correspondent généralement au prix et au rendement de l\'indice S&P 500.'
            }
        };
        
        // Vérifier si nous avons des données pour ce symbole
        if (demoStocks[normalizedSymbol]) {
            return demoStocks[normalizedSymbol];
        }
        
        // Si nous n'avons pas de données pour ce symbole, génération aléatoire
        try {
            // Génération de données pour un titre non préenregistré
            return {
                symbol: normalizedSymbol,
                name: `${normalizedSymbol} Corp.`,
                price: parseFloat((Math.random() * 500 + 10).toFixed(2)),
                change: parseFloat((Math.random() * 8 - 4).toFixed(2)),
                oneMonthChange: parseFloat((Math.random() * 15 - 7).toFixed(2)),
                threeMonthChange: parseFloat((Math.random() * 25 - 10).toFixed(2)),
                sixMonthChange: parseFloat((Math.random() * 40 - 15).toFixed(2)),
                open: parseFloat((Math.random() * 500 + 10).toFixed(2)),
                high: parseFloat((Math.random() * 500 + 20).toFixed(2)),
                low: parseFloat((Math.random() * 500 + 5).toFixed(2)),
                volume: `${Math.floor(Math.random() * 50)}M`,
                marketCap: `${(Math.random() * 100 + 1).toFixed(1)}B`,
                peRatio: `${(Math.random() * 50 + 5).toFixed(1)}`,
                dividend: `${(Math.random() * 5).toFixed(2)}%`,
                fiftyTwoWeekHigh: parseFloat((Math.random() * 600 + 50).toFixed(2)),
                fiftyTwoWeekLow: parseFloat((Math.random() * 400 + 10).toFixed(2)),
                sector: getRandomSector(),
                industry: getRandomIndustry(),
                description: `${normalizedSymbol} est une entreprise qui opère dans divers marchés mondiaux.`
            };
        } catch (error) {
            throw new Error(`Impossible de trouver des données pour ${symbol}`);
        }
    }
    
    // Fonctions utilitaires pour les données aléatoires
    function getRandomSector() {
        const sectors = ['Technologie', 'Finance', 'Santé', 'Consommation', 'Industrie', 'Énergie', 'Matériaux', 'Services', 'Immobilier', 'Utilités'];
        return sectors[Math.floor(Math.random() * sectors.length)];
    }
    
    function getRandomIndustry() {
        const industries = ['Logiciel', 'Matériel informatique', 'Banque', 'Assurance', 'Pharmaceutique', 'Biotechnologie', 'Commerce de détail', 'Alimentation', 'Aérospatiale', 'Automobile', 'Pétrole et gaz', 'Produits chimiques', 'Télécommunications', 'Médias', 'Immobilier commercial', 'Électricité', 'Eau'];
        return industries[Math.floor(Math.random() * industries.length)];
    }
    
    // Afficher les détails d'une action
    function displayStockDetails(stockData) {
        // Mise à jour du titre
        document.getElementById('stockDetailName').textContent = `${stockData.name} (${stockData.symbol})`;
        
        // Mise à jour du prix et de la variation
        document.getElementById('currentPrice').textContent = formatCurrency(stockData.price);
        const priceChange = document.getElementById('priceChange');
        priceChange.textContent = `${stockData.change >= 0 ? '+' : ''}${stockData.change.toFixed(2)}%`;
        priceChange.className = stockData.change >= 0 ? 'price-change positive' : 'price-change negative';
        
        // Mise à jour des métriques clés
        document.getElementById('openPrice').textContent = formatCurrency(stockData.open);
        document.getElementById('dayHigh').textContent = formatCurrency(stockData.high);
        document.getElementById('dayLow').textContent = formatCurrency(stockData.low);
        document.getElementById('volume').textContent = stockData.volume;
        document.getElementById('marketCap').textContent = stockData.marketCap;
        document.getElementById('peRatio').textContent = stockData.peRatio;
        document.getElementById('dividend').textContent = stockData.dividend;
        document.getElementById('fiftyTwoWeekHigh').textContent = formatCurrency(stockData.fiftyTwoWeekHigh);
        
        // Mise à jour des méta-informations
        document.getElementById('stockMeta').innerHTML = `
            <p><strong>Secteur:</strong> ${stockData.sector}</p>
            <p><strong>Industrie:</strong> ${stockData.industry}</p>
            <p>${stockData.description}</p>
        `;
        
        // Mise à jour du graphique
        updatePriceChart(stockData.symbol, '1M');
        
        // Afficher la vue détaillée
        showStockDetailView();
    }
    
    // Mettre à jour le graphique de prix
    function updatePriceChart(symbol, timeRange) {
        // Simuler des données historiques pour le graphique
        const historicalData = getHistoricalPriceData(symbol, timeRange);
        
        // Formatter les données pour Chart.js
        const labels = historicalData.map(item => item.date);
        const prices = historicalData.map(item => item.price);
        
        // Détruire le graphique existant s'il y en a un
        if (chart) {
            chart.destroy();
        }
        
        // Créer un nouveau graphique
        const ctx = document.getElementById('priceChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Prix de ${symbol}`,
                    data: prices,
                    borderColor: '#2e7dd1',
                    backgroundColor: 'rgba(46, 125, 209, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Générer des données historiques pour un titre
    function getHistoricalPriceData(symbol, timeRange) {
        // Normaliser le symbole
        const normalizedSymbol = symbol.toUpperCase();
        
        // Calculer le nombre de jours selon la plage de temps
        let days;
        switch (timeRange) {
            case '1M': days = 30; break;
            case '3M': days = 90; break;
            case '6M': days = 180; break;
            case '1Y': days = 365; break;
            case '5Y': days = 1825; break;
            default: days = 30;
        }
        
        // Générer des données de prix aléatoires
        const prices = [];
        let basePrice;
        let volatility;
        
        // Définir le prix de base et la volatilité selon le symbole
        switch (normalizedSymbol) {
            case 'AAPL':
                basePrice = 150;
                volatility = 0.01;
                break;
            case 'MSFT':
                basePrice = 350;
                volatility = 0.008;
                break;
            case 'GOOGL':
                basePrice = 125;
                volatility = 0.012;
                break;
            case 'SPY':
                basePrice = 450;
                volatility = 0.005;
                break;
            default:
                basePrice = currentStock ? currentStock.price / 2 : 100;
                volatility = 0.015;
        }
        
        // Simuler une tendance générale
        const trend = (Math.random() * 0.002) - 0.0005; // Légère tendance aléatoire
        
        let currentPrice = basePrice;
        const today = new Date();
        
        for (let i = days; i >= 0; i--) {
            const date = new Date();
            date.setDate(today.getDate() - i);
            
            // Simuler un mouvement de prix avec une composante de tendance
            const change = (Math.random() - 0.5) * 2 * volatility + trend;
            currentPrice = Math.max(0.1, currentPrice * (1 + change));
            
            prices.push({
                date: date.toISOString().split('T')[0],
                price: parseFloat(currentPrice.toFixed(2))
            });
        }
        
        return prices;
    }

    // Lancer l'initialisation
    init();
});
