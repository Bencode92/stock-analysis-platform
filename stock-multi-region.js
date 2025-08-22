/**
 * stock-multi-region.js - Système de filtrage multi-régions pour les actions
 * Gère les actions US, Europe et Asie depuis 3 fichiers CSV distincts
 */

class StockMultiRegionSystem {
    constructor() {
        this.stocksData = {
            us: [],
            europe: [],
            asia: []
        };
        this.currentRegion = 'us'; // 'us', 'europe', 'asia'
        this.allStocks = []; // Stocks combinés pour la recherche globale
        this.filteredStocks = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        
        this.activeFilters = {
            search: '',
            sectors: [],
            performance: null
        };
        
        this.init();
    }
    
    async init() {
        await this.loadAllRegionsData();
        this.setupEventListeners();
        this.setupRegionSelector();
        this.updateDisplay();
    }
    
    async loadAllRegionsData() {
        try {
            // Charger les 3 fichiers CSV en parallèle
            const [usData, europeData, asiaData] = await Promise.all([
                this.loadCSVData('data/Actions_US.csv', 'us'),
                this.loadCSVData('data/Actions_Europe.csv', 'europe'),
                this.loadCSVData('data/Actions_Asie.csv', 'asia')
            ]);
            
            // Combiner toutes les données pour la recherche globale
            this.allStocks = [
                ...this.stocksData.us,
                ...this.stocksData.europe,
                ...this.stocksData.asia
            ];
            
            // Initialiser avec la région US par défaut
            this.switchRegion('us');
            
            console.log(`✅ Données chargées: ${this.stocksData.us.length} US, ${this.stocksData.europe.length} Europe, ${this.stocksData.asia.length} Asie`);
            
        } catch (error) {
            console.error('Erreur chargement données multi-régions:', error);
            // Fallback vers des données JSON si CSV non disponible
            await this.loadJSONFallback();
        }
    }
    
    async loadCSVData(filepath, region) {
        try {
            const response = await fetch(filepath);
            const csvText = await response.text();
            
            // Parser le CSV avec Papa Parse (comme dans votre système ETF)
            const parseResult = Papa.parse(csvText, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                delimiter: ';' // Ajuster selon votre format
            });
            
            // Transformer et stocker les données
            this.stocksData[region] = parseResult.data.map(row => ({
                symbol: row.Symbol || row.Symbole,
                name: row.Name || row.Nom,
                sector: row.Sector || row.Secteur || 'N/A',
                price: parseFloat(row.Price || row.Prix || 0),
                changePercent: parseFloat(row.Change || row.Variation || 0),
                volume: parseInt(row.Volume || 0),
                marketCap: parseFloat(row.MarketCap || row.Capitalisation || 0),
                region: region,
                // Ajouter des métadonnées régionales
                currency: this.getRegionCurrency(region),
                exchange: this.getRegionExchange(region)
            }));
            
            return this.stocksData[region];
            
        } catch (error) {
            console.warn(`Impossible de charger ${filepath}, utilisation des données de secours`);
            return [];
        }
    }
    
    async loadJSONFallback() {
        // Charger depuis des fichiers JSON si CSV non disponibles
        try {
            const response = await fetch('data/stocks.json');
            const data = await response.json();
            
            // Distribuer les stocks par région selon un critère
            this.stocksData.us = data.stocks.filter(s => s.exchange === 'NYSE' || s.exchange === 'NASDAQ');
            this.stocksData.europe = data.stocks.filter(s => s.exchange === 'EURONEXT' || s.exchange === 'LSE');
            this.stocksData.asia = data.stocks.filter(s => s.exchange === 'TSE' || s.exchange === 'HKEX');
            
        } catch (error) {
            console.error('Impossible de charger les données de secours');
        }
    }
    
    setupRegionSelector() {
        // Créer les boutons de sélection de région (comme pour ETF)
        const selectorHTML = `
            <div class="region-selector mb-8">
                <h2 class="text-xl font-semibold mb-4">Sélectionner une région</h2>
                <div class="region-buttons flex gap-4">
                    <button class="region-btn active" data-region="us">
                        <i class="fas fa-flag-usa mr-2"></i>
                        États-Unis (${this.stocksData.us.length})
                    </button>
                    <button class="region-btn" data-region="europe">
                        <i class="fas fa-euro-sign mr-2"></i>
                        Europe (${this.stocksData.europe.length})
                    </button>
                    <button class="region-btn" data-region="asia">
                        <i class="fas fa-yen-sign mr-2"></i>
                        Asie (${this.stocksData.asia.length})
                    </button>
                    <button class="region-btn" data-region="all">
                        <i class="fas fa-globe mr-2"></i>
                        Toutes régions (${this.allStocks.length})
                    </button>
                </div>
            </div>
        `;
        
        // Insérer le sélecteur dans la page
        const container = document.querySelector('.search-container');
        if (container) {
            container.insertAdjacentHTML('beforebegin', selectorHTML);
        }
        
        // Ajouter les event listeners
        document.querySelectorAll('.region-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const region = btn.dataset.region;
                this.switchRegion(region);
                
                // Mettre à jour l'état actif des boutons
                document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    
    switchRegion(region) {
        this.currentRegion = region;
        this.currentPage = 1;
        
        // Charger les stocks de la région sélectionnée
        if (region === 'all') {
            this.filteredStocks = [...this.allStocks];
        } else {
            this.filteredStocks = [...this.stocksData[region]];
        }
        
        // Mettre à jour le titre
        this.updateRegionTitle(region);
        
        // Appliquer les filtres existants
        this.applyFilters();
        
        // Mettre à jour l'affichage
        this.updateDisplay();
        
        // Mettre à jour les top performers pour cette région
        this.updateRegionTopPerformers(region);
    }
    
    updateRegionTitle(region) {
        const titleElement = document.getElementById('market-title');
        if (titleElement) {
            const titles = {
                us: 'Actions États-Unis',
                europe: 'Actions Europe',
                asia: 'Actions Asie',
                all: 'Actions Mondiales'
            };
            titleElement.textContent = titles[region];
        }
        
        // Mettre à jour le compteur
        const countElement = document.getElementById('stocks-count');
        if (countElement) {
            const count = region === 'all' ? this.allStocks.length : this.stocksData[region].length;
            countElement.textContent = count;
        }
    }
    
    setupEventListeners() {
        // Recherche avec auto-complétion sur toutes les régions
        const searchInput = document.getElementById('stock-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 300);
            });
        }
        
        // Filtres (similaire au système ETF)
        this.setupFilters();
        
        // Tri et pagination
        this.setupSorting();
        this.setupPagination();
    }
    
    handleSearch(query) {
        this.activeFilters.search = query.toLowerCase();
        
        // Recherche dans toutes les régions pour les suggestions
        const suggestions = this.allStocks
            .filter(stock => 
                stock.name.toLowerCase().includes(query) ||
                stock.symbol.toLowerCase().includes(query)
            )
            .slice(0, 8)
            .map(stock => ({
                ...stock,
                displayRegion: this.getRegionFlag(stock.region)
            }));
        
        this.showSearchSuggestions(suggestions);
        this.applyFilters();
    }
    
    showSearchSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('search-suggestions');
        if (!suggestionsDiv) return;
        
        if (suggestions.length === 0) {
            suggestionsDiv.classList.add('hidden');
            return;
        }
        
        suggestionsDiv.innerHTML = suggestions.map(stock => `
            <div class="suggestion-item p-3 hover:bg-gray-800 cursor-pointer flex justify-between" 
                 onclick="stockSystem.selectStock('${stock.symbol}', '${stock.region}')">
                <div>
                    <span class="region-indicator">${stock.displayRegion}</span>
                    <span class="font-semibold ml-2">${stock.symbol}</span>
                    <span class="text-gray-400 ml-2">${stock.name}</span>
                </div>
                <span class="${stock.changePercent >= 0 ? 'positive' : 'negative'}">
                    ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%
                </span>
            </div>
        `).join('');
        
        suggestionsDiv.classList.remove('hidden');
    }
    
    selectStock(symbol, region) {
        // Basculer vers la région du stock sélectionné
        if (region && region !== this.currentRegion && region !== 'all') {
            this.switchRegion(region);
            document.querySelector(`[data-region="${region}"]`)?.click();
        }
        
        // Remplir la recherche
        const searchInput = document.getElementById('stock-search');
        if (searchInput) {
            searchInput.value = symbol;
            this.handleSearch(symbol);
        }
        
        document.getElementById('search-suggestions')?.classList.add('hidden');
    }
    
    applyFilters() {
        let stocks = this.currentRegion === 'all' ? 
            [...this.allStocks] : 
            [...this.stocksData[this.currentRegion]];
        
        // Appliquer le filtre de recherche
        if (this.activeFilters.search) {
            stocks = stocks.filter(stock =>
                stock.name.toLowerCase().includes(this.activeFilters.search) ||
                stock.symbol.toLowerCase().includes(this.activeFilters.search)
            );
        }
        
        // Appliquer les autres filtres (secteurs, performance, etc.)
        if (this.activeFilters.sectors.length > 0) {
            stocks = stocks.filter(stock => 
                this.activeFilters.sectors.includes(stock.sector)
            );
        }
        
        this.filteredStocks = stocks;
        this.currentPage = 1;
        this.updateDisplay();
    }
    
    updateDisplay() {
        this.renderTable();
        this.updatePagination();
        this.updateStatistics();
        this.updateTopPerformers();
    }
    
    renderTable() {
        const tbody = document.getElementById('stocks-table-body');
        if (!tbody) return;
        
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageStocks = this.filteredStocks.slice(start, end);
        
        if (pageStocks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-8 text-gray-400">
                        <i class="fas fa-search text-2xl mb-2"></i>
                        <p>Aucune action trouvée</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = pageStocks.map(stock => `
            <tr class="border-t border-gray-700 hover:bg-gray-800/50">
                <td class="px-4 py-3">
                    <span class="region-flag">${this.getRegionFlag(stock.region)}</span>
                    <span class="font-semibold ml-2">${stock.symbol}</span>
                </td>
                <td class="px-4 py-3">${stock.name}</td>
                <td class="px-4 py-3">${stock.sector}</td>
                <td class="px-4 py-3 text-right">
                    ${stock.currency || '$'}${stock.price.toFixed(2)}
                </td>
                <td class="px-4 py-3 text-right ${stock.changePercent >= 0 ? 'positive' : 'negative'}">
                    ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%
                </td>
                <td class="px-4 py-3 text-right">${this.formatVolume(stock.volume)}</td>
                <td class="px-4 py-3 text-right">${this.formatMarketCap(stock.marketCap)}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="stockSystem.viewDetails('${stock.symbol}')" 
                            class="px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">
                        <i class="fas fa-chart-line"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    updateRegionTopPerformers(region) {
        const stocks = region === 'all' ? this.allStocks : this.stocksData[region];
        
        // Top gainers et losers par région
        const gainers = [...stocks]
            .filter(s => s.changePercent > 0)
            .sort((a, b) => b.changePercent - a.changePercent)
            .slice(0, 10);
            
        const losers = [...stocks]
            .filter(s => s.changePercent < 0)
            .sort((a, b) => a.changePercent - b.changePercent)
            .slice(0, 10);
        
        this.displayTopPerformers(gainers, losers);
    }
    
    getRegionFlag(region) {
        const flags = {
            us: '🇺🇸',
            europe: '🇪🇺',
            asia: '🇯🇵',
            all: '🌍'
        };
        return flags[region] || '';
    }
    
    getRegionCurrency(region) {
        const currencies = {
            us: '$',
            europe: '€',
            asia: '¥'
        };
        return currencies[region] || '$';
    }
    
    getRegionExchange(region) {
        const exchanges = {
            us: 'NYSE/NASDAQ',
            europe: 'EURONEXT',
            asia: 'TSE/HKEX'
        };
        return exchanges[region] || 'GLOBAL';
    }
    
    // Méthodes utilitaires (identiques au système original)
    formatVolume(volume) {
        if (volume >= 1000000000) return (volume / 1000000000).toFixed(1) + 'B';
        if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
        if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
        return volume.toString();
    }
    
    formatMarketCap(cap) {
        if (cap >= 1000000000000) return (cap / 1000000000000).toFixed(1) + 'T';
        if (cap >= 1000000000) return (cap / 1000000000).toFixed(1) + 'B';
        if (cap >= 1000000) return (cap / 1000000).toFixed(1) + 'M';
        return cap.toString();
    }
    
    // ... autres méthodes nécessaires
}

// Initialisation avec Papa Parse pour le CSV
let stockSystem;
document.addEventListener('DOMContentLoaded', () => {
    // Charger Papa Parse si nécessaire
    if (typeof Papa === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js';
        script.onload = () => {
            stockSystem = new StockMultiRegionSystem();
        };
        document.head.appendChild(script);
    } else {
        stockSystem = new StockMultiRegionSystem();
    }
});
