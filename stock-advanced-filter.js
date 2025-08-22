/**
 * stock-advanced-filter.js - Système avancé de filtrage et analyse des stocks
 */

class StockAnalysisSystem {
    constructor() {
        this.stocks = [];
        this.filteredStocks = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.sortField = 'change';
        this.sortDirection = 'desc';
        this.activeFilters = {
            search: '',
            sectors: [],
            performance: null,
            marketCap: []
        };
        
        this.init();
    }
    
    async init() {
        await this.loadStockData();
        this.setupEventListeners();
        this.updateDisplay();
    }
    
    async loadStockData() {
        try {
            // Charger depuis le fichier JSON
            const response = await fetch('data/stocks.json');
            const data = await response.json();
            
            // Structure compatible avec votre système existant
            this.stocks = data.stocks || [];
            this.metadata = data.meta || {};
            
            this.filteredStocks = [...this.stocks];
            this.updateStatistics();
        } catch (error) {
            console.error('Erreur chargement données:', error);
            // Données de fallback si nécessaire
            this.loadFallbackData();
        }
    }
    
    loadFallbackData() {
        // Charger depuis d'autres sources si data/stocks.json n'existe pas
        this.stocks = [];
        this.filteredStocks = [];
    }
    
    setupEventListeners() {
        // Recherche avec debounce
        const searchInput = document.getElementById('stock-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.handleSearch(e.target.value), 300);
            });
        }
        
        // Filtres de secteur
        document.querySelectorAll('#sector-filters .filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => this.toggleSectorFilter(e.target));
        });
        
        // Filtres de performance
        document.querySelectorAll('#performance-filters .filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => this.togglePerformanceFilter(e.target));
        });
        
        // Filtres de capitalisation
        document.querySelectorAll('#cap-filters .filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => this.toggleCapFilter(e.target));
        });
        
        // Tri des colonnes
        document.querySelectorAll('th[data-sort]').forEach(header => {
            header.addEventListener('click', (e) => {
                const field = e.currentTarget.dataset.sort;
                this.handleSort(field);
            });
        });
        
        // Pagination
        document.getElementById('prev-page')?.addEventListener('click', () => this.changePage(-1));
        document.getElementById('next-page')?.addEventListener('click', () => this.changePage(1));
    }
    
    handleSearch(query) {
        this.activeFilters.search = query.toLowerCase();
        this.applyFilters();
        this.showSearchSuggestions(query);
    }
    
    showSearchSuggestions(query) {
        const suggestionsDiv = document.getElementById('search-suggestions');
        if (!suggestionsDiv) return;
        
        if (query.length < 2) {
            suggestionsDiv.classList.add('hidden');
            return;
        }
        
        const matches = this.stocks.filter(stock => 
            stock.name.toLowerCase().includes(query.toLowerCase()) ||
            stock.symbol.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
        
        if (matches.length > 0) {
            suggestionsDiv.innerHTML = matches.map(stock => {
                const changeClass = stock.changePercent >= 0 ? 'positive' : 'negative';
                const changeSign = stock.changePercent >= 0 ? '+' : '';
                
                return `
                    <div class="p-3 hover:bg-gray-800 cursor-pointer flex justify-between items-center" 
                         onclick="stockSystem.selectStock('${stock.symbol}')">
                        <div>
                            <span class="font-semibold">${stock.symbol}</span>
                            <span class="text-gray-400 ml-2">${stock.name}</span>
                        </div>
                        <span class="${changeClass}">
                            ${changeSign}${stock.changePercent.toFixed(2)}%
                        </span>
                    </div>
                `;
            }).join('');
            suggestionsDiv.classList.remove('hidden');
        } else {
            suggestionsDiv.classList.add('hidden');
        }
    }
    
    selectStock(symbol) {
        const searchInput = document.getElementById('stock-search');
        if (searchInput) {
            searchInput.value = symbol;
            this.handleSearch(symbol);
        }
        document.getElementById('search-suggestions')?.classList.add('hidden');
    }
    
    toggleSectorFilter(chip) {
        const sector = chip.dataset.sector;
        
        if (sector === 'all') {
            document.querySelectorAll('#sector-filters .filter-chip').forEach(c => {
                c.classList.remove('active');
            });
            chip.classList.add('active');
            this.activeFilters.sectors = [];
        } else {
            document.querySelector('[data-sector="all"]').classList.remove('active');
            
            chip.classList.toggle('active');
            if (chip.classList.contains('active')) {
                this.activeFilters.sectors.push(sector);
            } else {
                this.activeFilters.sectors = this.activeFilters.sectors.filter(s => s !== sector);
            }
            
            if (this.activeFilters.sectors.length === 0) {
                document.querySelector('[data-sector="all"]').classList.add('active');
            }
        }
        
        this.applyFilters();
    }
    
    togglePerformanceFilter(chip) {
        document.querySelectorAll('#performance-filters .filter-chip').forEach(c => {
            c.classList.remove('active');
        });
        
        if (this.activeFilters.performance === chip.dataset.perf) {
            this.activeFilters.performance = null;
        } else {
            chip.classList.add('active');
            this.activeFilters.performance = chip.dataset.perf;
        }
        
        this.applyFilters();
    }
    
    toggleCapFilter(chip) {
        chip.classList.toggle('active');
        const cap = chip.dataset.cap;
        
        if (chip.classList.contains('active')) {
            this.activeFilters.marketCap.push(cap);
        } else {
            this.activeFilters.marketCap = this.activeFilters.marketCap.filter(c => c !== cap);
        }
        
        this.applyFilters();
    }
    
    applyFilters() {
        this.filteredStocks = this.stocks.filter(stock => {
            // Filtre de recherche
            if (this.activeFilters.search) {
                const searchMatch = 
                    stock.name.toLowerCase().includes(this.activeFilters.search) ||
                    stock.symbol.toLowerCase().includes(this.activeFilters.search);
                if (!searchMatch) return false;
            }
            
            // Filtre de secteur
            if (this.activeFilters.sectors.length > 0) {
                if (!this.activeFilters.sectors.includes(stock.sector)) return false;
            }
            
            // Filtre de capitalisation
            if (this.activeFilters.marketCap.length > 0) {
                const cap = this.getMarketCapCategory(stock.marketCap);
                if (!this.activeFilters.marketCap.includes(cap)) return false;
            }
            
            return true;
        });
        
        // Appliquer les filtres de performance
        if (this.activeFilters.performance) {
            switch (this.activeFilters.performance) {
                case 'gainers':
                    this.filteredStocks = this.filteredStocks
                        .filter(s => s.changePercent > 0)
                        .sort((a, b) => b.changePercent - a.changePercent)
                        .slice(0, 20);
                    break;
                case 'losers':
                    this.filteredStocks = this.filteredStocks
                        .filter(s => s.changePercent < 0)
                        .sort((a, b) => a.changePercent - b.changePercent)
                        .slice(0, 20);
                    break;
                case 'volume':
                    this.filteredStocks = this.filteredStocks
                        .sort((a, b) => b.volume - a.volume)
                        .slice(0, 20);
                    break;
                case 'volatility':
                    this.filteredStocks = this.filteredStocks
                        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                        .slice(0, 20);
                    break;
            }
        }
        
        this.currentPage = 1;
        this.updateDisplay();
    }
    
    getMarketCapCategory(marketCap) {
        if (marketCap >= 10000000000) return 'large';
        if (marketCap >= 2000000000) return 'mid';
        return 'small';
    }
    
    handleSort(field) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'desc';
        }
        
        this.filteredStocks.sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (this.sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        this.updateDisplay();
    }
    
    changePage(direction) {
        const totalPages = Math.ceil(this.filteredStocks.length / this.itemsPerPage);
        this.currentPage = Math.max(1, Math.min(totalPages, this.currentPage + direction));
        this.updateDisplay();
    }
    
    updateDisplay() {
        this.renderTable();
        this.updatePagination();
        this.updateTopPerformers();
        this.updateStatistics();
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
                    <td colspan="8" class="px-4 py-8 text-center text-gray-400">
                        <i class="fas fa-search mb-2 text-2xl"></i>
                        <p>Aucun résultat trouvé</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = pageStocks.map(stock => {
            const changeClass = stock.changePercent >= 0 ? 'positive' : 'negative';
            const changeSign = stock.changePercent >= 0 ? '+' : '';
            
            return `
                <tr class="border-t border-gray-700 hover:bg-gray-800/50 transition-colors">
                    <td class="px-4 py-3 font-semibold">${stock.symbol}</td>
                    <td class="px-4 py-3">${stock.name}</td>
                    <td class="px-4 py-3">
                        <span class="stock-sector-badge sector-${stock.sector}">
                            ${this.getSectorName(stock.sector)}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-right font-medium">$${stock.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-right ${changeClass}">
                        ${changeSign}${stock.changePercent.toFixed(2)}%
                    </td>
                    <td class="px-4 py-3 text-right">${this.formatVolume(stock.volume)}</td>
                    <td class="px-4 py-3 text-right">${this.formatMarketCap(stock.marketCap)}</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="stockSystem.viewStockDetails('${stock.symbol}')" 
                                class="px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors">
                            <i class="fas fa-chart-line"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Mise à jour des indicateurs
        document.getElementById('showing-start').textContent = Math.min(start + 1, this.filteredStocks.length);
        document.getElementById('showing-end').textContent = Math.min(end, this.filteredStocks.length);
        document.getElementById('total-results').textContent = this.filteredStocks.length;
    }
    
    updatePagination() {
        const totalPages = Math.ceil(this.filteredStocks.length / this.itemsPerPage);
        const pageNumbers = document.getElementById('page-numbers');
        
        if (pageNumbers) {
            let pages = [];
            for (let i = Math.max(1, this.currentPage - 2); i <= Math.min(totalPages, this.currentPage + 2); i++) {
                pages.push(i);
            }
            
            pageNumbers.innerHTML = pages.map(page => `
                <button class="px-3 py-2 ${page === this.currentPage ? 'bg-green-500/30 text-green-400' : 'bg-gray-800'} 
                        rounded hover:bg-gray-700" onclick="stockSystem.goToPage(${page})">
                    ${page}
                </button>
            `).join('');
        }
        
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;
    }
    
    goToPage(page) {
        this.currentPage = page;
        this.updateDisplay();
    }
    
    updateTopPerformers() {
        const gainers = [...this.stocks]
            .filter(s => s.changePercent > 0)
            .sort((a, b) => b.changePercent - a.changePercent)
            .slice(0, 5);
        
        const losers = [...this.stocks]
            .filter(s => s.changePercent < 0)
            .sort((a, b) => a.changePercent - b.changePercent)
            .slice(0, 5);
        
        const gainersList = document.getElementById('top-gainers-list');
        if (gainersList) {
            gainersList.innerHTML = gainers.map(stock => `
                <div class="flex justify-between items-center p-2 hover:bg-gray-800/50 rounded cursor-pointer"
                     onclick="stockSystem.viewStockDetails('${stock.symbol}')">
                    <div>
                        <span class="font-semibold">${stock.symbol}</span>
                        <span class="text-sm text-gray-400 ml-2">${stock.name}</span>
                    </div>
                    <span class="positive">+${stock.changePercent.toFixed(2)}%</span>
                </div>
            `).join('');
        }
        
        const losersList = document.getElementById('top-losers-list');
        if (losersList) {
            losersList.innerHTML = losers.map(stock => `
                <div class="flex justify-between items-center p-2 hover:bg-gray-800/50 rounded cursor-pointer"
                     onclick="stockSystem.viewStockDetails('${stock.symbol}')">
                    <div>
                        <span class="font-semibold">${stock.symbol}</span>
                        <span class="text-sm text-gray-400 ml-2">${stock.name}</span>
                    </div>
                    <span class="negative">${stock.changePercent.toFixed(2)}%</span>
                </div>
            `).join('');
        }
    }
    
    updateStatistics() {
        const topGainer = [...this.stocks].sort((a, b) => b.changePercent - a.changePercent)[0];
        const topLoser = [...this.stocks].sort((a, b) => a.changePercent - b.changePercent)[0];
        const topVolume = [...this.stocks].sort((a, b) => b.volume - a.volume)[0];
        
        if (topGainer) {
            document.getElementById('top-gainer').textContent = `+${topGainer.changePercent.toFixed(2)}%`;
            document.getElementById('top-gainer-name').textContent = topGainer.symbol;
        }
        
        if (topLoser) {
            document.getElementById('top-loser').textContent = `${topLoser.changePercent.toFixed(2)}%`;
            document.getElementById('top-loser-name').textContent = topLoser.symbol;
        }
        
        if (topVolume) {
            document.getElementById('top-volume').textContent = this.formatVolume(topVolume.volume);
            document.getElementById('top-volume-name').textContent = topVolume.symbol;
        }
        
        const activeStocks = this.stocks.filter(s => s.volume > 10000000).length;
        document.getElementById('active-stocks').textContent = activeStocks;
        document.getElementById('total-stocks').textContent = this.stocks.length;
        document.getElementById('stocks-count').textContent = this.stocks.length;
        document.getElementById('last-update').textContent = 
            this.metadata.timestamp ? new Date(this.metadata.timestamp).toLocaleString('fr-FR') : 
            new Date().toLocaleString('fr-FR');
    }
    
    viewStockDetails(symbol) {
        // Navigation vers la page de détail
        window.location.href = `stock-detail.html?symbol=${symbol}`;
    }
    
    getSectorName(sector) {
        const sectorNames = {
            tech: 'Technologie',
            finance: 'Finance',
            health: 'Santé',
            energy: 'Énergie',
            consumer: 'Consommation',
            industrial: 'Industrie',
            materials: 'Matériaux',
            utilities: 'Services publics',
            realestate: 'Immobilier',
            communication: 'Communication'
        };
        return sectorNames[sector] || sector;
    }
    
    formatVolume(volume) {
        if (volume >= 1000000000) return (volume / 1000000000).toFixed(1) + 'B';
        if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
        if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
        return volume.toString();
    }
    
    formatMarketCap(cap) {
        if (cap >= 1000000000000) return '$' + (cap / 1000000000000).toFixed(1) + 'T';
        if (cap >= 1000000000) return '$' + (cap / 1000000000).toFixed(1) + 'B';
        if (cap >= 1000000) return '$' + (cap / 1000000).toFixed(1) + 'M';
        return '$' + cap;
    }
}

// Initialiser le système au chargement de la page
let stockSystem;
document.addEventListener('DOMContentLoaded', () => {
    stockSystem = new StockAnalysisSystem();
});
