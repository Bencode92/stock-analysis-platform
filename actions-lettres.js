/**
 * Actions par lettres - Script dédié
 * Se connecte aux données JSON existantes et ajoute la fonctionnalité "Détails"
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const DATA_FILES = {
        US: 'data/stocks_us.json',
        EUROPE: 'data/stocks_europe.json', 
        ASIA: 'data/stocks_asia.json'
    };
    
    let allStocks = [];
    let filteredStocks = [];
    let searchTerm = '';
    
    // Initialisation
    initInterface();
    loadAllData();
    
    function initInterface() {
        // Recherche
        const searchInput = document.getElementById('stock-search');
        const clearButton = document.getElementById('clear-search');
        
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                searchTerm = this.value.toLowerCase();
                if (clearButton) clearButton.style.opacity = searchTerm ? '1' : '0';
                filterAndDisplay();
            });
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', function() {
                if (searchInput) searchInput.value = '';
                searchTerm = '';
                this.style.opacity = '0';
                filterAndDisplay();
            });
        }
        
        // Onglets alphabet
        document.querySelectorAll('.region-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.region-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                const letter = this.getAttribute('data-region');
                showLetterSection(letter);
            });
        });
    }
    
    async function loadAllData() {
        showLoading();
        
        try {
            const responses = await Promise.all([
                fetch(DATA_FILES.US).then(r => r.json()).catch(() => null),
                fetch(DATA_FILES.EUROPE).then(r => r.json()).catch(() => null),
                fetch(DATA_FILES.ASIA).then(r => r.json()).catch(() => null)
            ]);
            
            allStocks = [];
            let latestTimestamp = null;
            
            // Traiter chaque région
            responses.forEach((data, index) => {
                if (!data) return;
                
                const region = ['US', 'EUROPE', 'ASIA'][index];
                
                if (data.timestamp) {
                    const ts = new Date(data.timestamp);
                    latestTimestamp = latestTimestamp ? 
                        (ts > latestTimestamp ? ts : latestTimestamp) : ts;
                }
                
                if (data.stocks) {
                    data.stocks.forEach(stock => {
                        allStocks.push(normalizeStock(stock, region));
                    });
                }
            });
            
            // Trier par nom
            allStocks.sort((a, b) => a.name.localeCompare(b.name));
            
            // Mettre à jour l'interface
            updateStockCount();
            updateLastUpdate(latestTimestamp);
            
            // Afficher les données
            filterAndDisplay();
            hideLoading();
            
        } catch (error) {
            console.error('Erreur chargement:', error);
            showError();
        }
    }
    
    function normalizeStock(stock, region) {
        // Déterminer data_exchange basé sur les données existantes
        let dataExchange = 'Boursorama'; // par défaut
        
        if (stock.data_exchange) {
            dataExchange = stock.data_exchange;
        } else if (stock.resolved_symbol && stock.resolved_symbol !== stock.ticker) {
            dataExchange = stock.resolved_symbol;
        } else if (stock.data_mic) {
            dataExchange = stock.data_mic;
        }
        
        return {
            name: stock.name || stock.ticker || '',
            ticker: stock.ticker || stock.symbol || '',
            region: region,
            country: stock.country || '',
            exchange: stock.exchange || '',
            data_exchange: dataExchange,
            sector: stock.sector || '',
            price: stock.price || 0,
            change_percent: stock.change_percent || 0,
            perf_ytd: stock.perf_ytd || 0,
            open: stock.open || 0,
            high: stock.high || 0,
            low: stock.low || 0,
            volume: stock.volume || 0,
            market_cap: stock.market_cap || 0,
            dividend_yield: stock.dividend_yield || 0,
            volatility_3y: stock.volatility_3y || 0,
            range_52w: stock.range_52w || '',
            dividends_history: stock.dividends_history || [],
            last_updated: stock.last_updated || new Date().toISOString()
        };
    }
    
    function filterAndDisplay() {
        // Filtrer par recherche
        if (searchTerm) {
            filteredStocks = allStocks.filter(stock => 
                stock.name.toLowerCase().includes(searchTerm) ||
                stock.ticker.toLowerCase().includes(searchTerm)
            );
            
            // Mettre à jour compteur recherche
            const searchCount = document.getElementById('search-count');
            const searchInfo = document.getElementById('search-info');
            if (searchCount && searchInfo) {
                searchCount.textContent = filteredStocks.length;
                searchInfo.classList.remove('hidden');
            }
        } else {
            filteredStocks = [...allStocks];
            const searchInfo = document.getElementById('search-info');
            if (searchInfo) searchInfo.classList.add('hidden');
        }
        
        // Afficher par lettres
        renderByLetters();
    }
    
    function renderByLetters() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        
        for (let letter of alphabet) {
            const stocks = filteredStocks.filter(stock => 
                stock.name.toLowerCase().startsWith(letter)
            );
            
            renderLetterTable(letter, stocks);
        }
    }
    
    function renderLetterTable(letter, stocks) {
        const tbody = document.getElementById(`${letter}-indices-body`);
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (stocks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4 text-gray-400">
                        <i class="fas fa-info-circle mr-2"></i>
                        ${searchTerm ? 'Aucun résultat pour cette recherche' : 'Aucune action disponible'}
                    </td>
                </tr>
            `;
            return;
        }
        
        stocks.forEach(stock => {
            // Ligne principale
            const row = document.createElement('tr');
            row.className = 'tp-row hover:bg-white/5 transition-colors';
            
            const changeClass = stock.change_percent < 0 ? 'negative' : 'positive';
            const ytdClass = stock.perf_ytd < 0 ? 'negative' : 'positive';
            
            const regionIcon = getRegionIcon(stock.region);
            const exDivIcon = hasUpcomingDividend(stock.dividends_history) ? '<span title="Ex-dividende sous 7 jours">💸</span>' : '';
            
            row.innerHTML = `
                <td>
                    <div class="font-semibold">${stock.name} ${regionIcon} ${exDivIcon}</div>
                    <div class="text-xs opacity-70 mt-1">
                        <span class="inline-block px-2 py-[2px] rounded-md mr-1 text-xs" style="border:1px solid var(--card-border); background: rgba(0,255,135,0.1);">${stock.region}</span>
                        ${stock.country}
                        ${stock.data_exchange ? `<span class="inline-block px-2 py-[2px] rounded-md text-xs ml-1" style="border:1px solid var(--card-border); background: rgba(255,255,255,.04);">${stock.data_exchange}</span>` : ''}
                    </div>
                </td>
                <td class="text-right">${formatNumber(stock.price)}</td>
                <td class="text-right ${changeClass}">${formatPercent(stock.change_percent)}</td>
                <td class="text-right">${formatNumber(stock.open)}</td>
                <td class="text-right">${formatNumber(stock.high)}</td>
                <td class="text-right">${formatNumber(stock.low)}</td>
                <td class="text-right ${ytdClass}">${formatPercent(stock.perf_ytd)}</td>
                <td class="text-right">${formatVolume(stock.volume)}</td>
                <td class="text-right">
                    <button class="action-button tp-details-btn" data-key="${stock.name}|${stock.ticker}">
                        Détails ▾
                    </button>
                </td>
            `;
            
            // Ligne détails (cachée par défaut)
            const detailsRow = document.createElement('tr');
            detailsRow.className = 'tp-details hidden';
            detailsRow.setAttribute('data-for', `${stock.name}|${stock.ticker}`);
            
            const ttmDividend = calculateTTMDividend(stock.dividends_history);
            const lastDiv = stock.dividends_history[0];
            
            detailsRow.innerHTML = `
                <td colspan="9" style="background:rgba(255,255,255,0.04); border-left: 3px solid var(--accent-color);">
                    <div class="grid lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 gap-6 p-6">
                        <div>
                            <div class="text-xs opacity-70 mb-3 font-semibold text-green-400">📊 PROFIL</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-70">Ticker:</span> <b>${stock.ticker}</b></div>
                                <div><span class="opacity-70">Secteur:</span> ${stock.sector}</div>
                                <div><span class="opacity-70">Cotation:</span> ${stock.exchange}</div>
                                <div><span class="opacity-70">Source:</span> ${stock.data_exchange}</div>
                                <div><span class="opacity-70">Pays:</span> ${stock.country}</div>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs opacity-70 mb-3 font-semibold text-blue-400">💰 PRIX</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-70">Dernier:</span> <b>${formatNumber(stock.price)}</b></div>
                                <div><span class="opacity-70">Ouverture:</span> ${formatNumber(stock.open)}</div>
                                <div><span class="opacity-70">Plus haut:</span> ${formatNumber(stock.high)}</div>
                                <div><span class="opacity-70">Plus bas:</span> ${formatNumber(stock.low)}</div>
                                <div><span class="opacity-70">Volume:</span> ${formatVolume(stock.volume)}</div>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs opacity-70 mb-3 font-semibold text-yellow-400">📈 PERFORMANCES</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-70">Jour:</span> <span class="${changeClass}">${formatPercent(stock.change_percent)}</span></div>
                                <div><span class="opacity-70">YTD:</span> <span class="${ytdClass}">${formatPercent(stock.perf_ytd)}</span></div>
                                <div><span class="opacity-70">Volatilité 3Y:</span> ${formatPercent(stock.volatility_3y)}</div>
                                <div><span class="opacity-70">Cap. boursière:</span> ${formatMarketCap(stock.market_cap)}</div>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs opacity-70 mb-3 font-semibold text-purple-400">💸 DIVIDENDES</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-70">Rendement:</span> <b>${formatPercent(stock.dividend_yield)}</b></div>
                                <div><span class="opacity-70">TTM:</span> ${formatNumber(ttmDividend)}</div>
                                ${lastDiv ? `<div><span class="opacity-70">Dernier:</span> ${formatNumber(lastDiv.amount)} (${formatDate(lastDiv.ex_date)})</div>` : '<div class="opacity-50">Aucun dividende</div>'}
                                <div class="text-xs opacity-50 mt-2">MAJ: ${formatDateTime(stock.last_updated)}</div>
                            </div>
                        </div>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
            tbody.appendChild(detailsRow);
        });
        
        // Connecter les boutons détails
        wireDetailsButtons();
    }
    
    function wireDetailsButtons() {
        document.querySelectorAll('.tp-details-btn').forEach(btn => {
            btn.onclick = function() {
                const key = this.dataset.key;
                const detailsRow = document.querySelector(`.tp-details[data-for="${CSS.escape(key)}"]`);
                if (!detailsRow) return;
                
                detailsRow.classList.toggle('hidden');
                this.textContent = detailsRow.classList.contains('hidden') ? 'Détails ▾' : 'Masquer ▴';
            };
        });
    }
    
    function showLetterSection(letter) {
        if (letter === 'all') {
            document.querySelectorAll('.region-content').forEach(content => {
                content.classList.remove('hidden');
            });
        } else {
            document.querySelectorAll('.region-content').forEach(content => {
                content.classList.add('hidden');
            });
            const targetSection = document.getElementById(`${letter}-indices`);
            if (targetSection) targetSection.classList.remove('hidden');
        }
    }
    
    // Utilitaires
    function getRegionIcon(region) {
        const icons = {
            US: '<i class="fas fa-flag-usa text-xs ml-1 text-blue-400" title="US"></i>',
            EUROPE: '<i class="fas fa-globe-europe text-xs ml-1 text-green-400" title="Europe"></i>',
            ASIA: '<i class="fas fa-globe-asia text-xs ml-1 text-red-400" title="Asie"></i>'
        };
        return icons[region] || '';
    }
    
    function hasUpcomingDividend(dividends) {
        if (!dividends || dividends.length === 0) return false;
        const nextDiv = dividends[0];
        if (!nextDiv.ex_date) return false;
        
        const exDate = new Date(nextDiv.ex_date);
        const today = new Date();
        const diffDays = Math.ceil((exDate - today) / (1000 * 60 * 60 * 24));
        
        return diffDays >= 0 && diffDays <= 7;
    }
    
    function calculateTTMDividend(dividends) {
        if (!dividends || dividends.length === 0) return 0;
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        return dividends
            .filter(div => new Date(div.ex_date) > oneYearAgo)
            .reduce((sum, div) => sum + (div.amount || 0), 0);
    }
    
    function formatNumber(num) {
        if (!num && num !== 0) return '–';
        return Number(num).toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    function formatPercent(num) {
        if (!num && num !== 0) return '–';
        const sign = num > 0 ? '+' : '';
        return `${sign}${Number(num).toFixed(2)}%`;
    }
    
    function formatVolume(vol) {
        if (!vol || vol === 0) return '–';
        return Number(vol).toLocaleString('fr-FR');
    }
    
    function formatMarketCap(cap) {
        if (!cap || cap === 0) return '–';
        const billion = cap / 1e9;
        if (billion >= 1) {
            return `${billion.toFixed(1)}Md`;
        }
        const million = cap / 1e6;
        return `${million.toFixed(0)}M`;
    }
    
    function formatDate(dateStr) {
        if (!dateStr) return '–';
        return new Date(dateStr).toLocaleDateString('fr-FR');
    }
    
    function formatDateTime(dateStr) {
        if (!dateStr) return '–';
        return new Date(dateStr).toLocaleString('fr-FR');
    }
    
    // Interface
    function showLoading() {
        document.getElementById('indices-loading')?.classList.remove('hidden');
        document.getElementById('indices-container')?.classList.add('hidden');
        document.getElementById('indices-error')?.classList.add('hidden');
    }
    
    function hideLoading() {
        document.getElementById('indices-loading')?.classList.add('hidden');
        document.getElementById('indices-container')?.classList.remove('hidden');
    }
    
    function showError() {
        document.getElementById('indices-loading')?.classList.add('hidden');
        document.getElementById('indices-error')?.classList.remove('hidden');
    }
    
    function updateStockCount() {
        const countEl = document.getElementById('stocks-count');
        if (countEl) countEl.textContent = allStocks.length;
    }
    
    function updateLastUpdate(timestamp) {
        const updateEl = document.getElementById('last-update-time');
        if (updateEl && timestamp) {
            updateEl.textContent = timestamp.toLocaleString('fr-FR');
        }
    }
});
