/**
 * TradePulse - Script simplifié pour affichage des actions avec détails
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const AZ_FILES = {
        US: 'data/stocks_us.json',
        EUROPE: 'data/stocks_europe.json',
        ASIA: 'data/stocks_asia.json',
    };
    
    const SCOPE_TO_FILES = {
        GLOBAL: ['US','EUROPE','ASIA'],
        US: ['US'],
        EUROPE: ['EUROPE'],
        ASIA: ['ASIA'],
    };
    
    let stocksData = [];
    let currentScope = 'GLOBAL';
    let searchTerm = '';
    
    // Initialisation
    initInterface();
    loadAllStocks();
    
    function initInterface() {
        // Initialiser la recherche
        const searchInput = document.getElementById('stock-search');
        const clearButton = document.getElementById('clear-search');
        
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                searchTerm = this.value.toLowerCase();
                clearButton.style.opacity = searchTerm ? '1' : '0';
                filterAndRender();
            });
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', function() {
                searchInput.value = '';
                searchTerm = '';
                this.style.opacity = '0';
                filterAndRender();
            });
        }
        
        // Initialiser les onglets alphabet
        document.querySelectorAll('.region-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.region-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                const letter = this.getAttribute('data-region');
                showLetterSection(letter);
            });
        });
        
        // Initialiser les sélecteurs de scope
        initScopeButtons();
        
        // Initialiser le thème
        initTheme();
        
        // Mettre à jour l'horloge
        updateMarketTime();
        setInterval(updateMarketTime, 1000);
    }
    
    function initScopeButtons() {
        const buttons = document.querySelectorAll('[data-scope]');
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const scope = this.dataset.scope;
                if (scope !== currentScope) {
                    currentScope = scope;
                    updateScopeUI();
                    loadAllStocks();
                }
            });
        });
    }
    
    function updateScopeUI() {
        document.querySelectorAll('[data-scope]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scope === currentScope);
        });
        
        const label = document.getElementById('top-scope-label');
        if (label) label.textContent = currentScope;
    }
    
    async function loadAllStocks() {
        const regions = SCOPE_TO_FILES[currentScope] || ['US','EUROPE','ASIA'];
        const urls = regions.map(r => AZ_FILES[r]);
        
        showLoading();
        
        try {
            const responses = await Promise.all(
                urls.map(url => fetch(url).then(r => r.json()).catch(() => null))
            );
            
            stocksData = [];
            let latestTimestamp = null;
            
            responses.forEach((data, i) => {
                if (!data) return;
                
                const region = regions[i];
                if (data.timestamp) {
                    const ts = new Date(data.timestamp);
                    latestTimestamp = latestTimestamp ? 
                        (ts > latestTimestamp ? ts : latestTimestamp) : ts;
                }
                
                if (data.stocks) {
                    data.stocks.forEach(stock => {
                        stocksData.push(normalizeStock(stock, region));
                    });
                }
            });
            
            // Trier par nom
            stocksData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            // Mettre à jour les infos
            updateStockCount();
            updateLastUpdate(latestTimestamp);
            
            // Afficher les données
            renderAllStocks();
            hideLoading();
            
        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            showError();
        }
    }
    
    function normalizeStock(stock, region) {
        return {
            name: stock.name || stock.ticker || '',
            ticker: stock.ticker || stock.symbol || '',
            region: region || 'GLOBAL',
            country: stock.country || '',
            exchange: stock.exchange || '',
            data_exchange: stock.data_exchange || stock.resolved_symbol || 'N/A',
            price: stock.price || stock.last || 0,
            change_percent: stock.change_percent || 0,
            perf_ytd: stock.perf_ytd || 0,
            volume: stock.volume || 0,
            open: stock.open || 0,
            high: stock.high || 0,
            low: stock.low || 0,
            market_cap: stock.market_cap || 0,
            sector: stock.sector || '',
            dividend_yield: stock.dividend_yield || 0,
            volatility_3y: stock.volatility_3y || 0,
            range_52w: stock.range_52w || '',
            dividends_history: stock.dividends_history || [],
            last_updated: stock.last_updated || new Date().toISOString()
        };
    }
    
    function renderAllStocks() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        
        for (let letter of alphabet) {
            const stocks = stocksData.filter(s => 
                s.name.toLowerCase().startsWith(letter) &&
                (searchTerm === '' || s.name.toLowerCase().includes(searchTerm))
            );
            
            renderLetterSection(letter, stocks);
        }
    }
    
    function renderLetterSection(letter, stocks) {
        const tbody = document.getElementById(`${letter}-indices-body`);
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (stocks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4 text-gray-400">
                        <i class="fas fa-info-circle mr-2"></i>
                        Aucune action disponible
                    </td>
                </tr>
            `;
            return;
        }
        
        stocks.forEach(stock => {
            const row = createStockRow(stock);
            const detailsRow = createDetailsRow(stock);
            
            tbody.appendChild(row);
            tbody.appendChild(detailsRow);
        });
        
        wireDetailsButtons();
    }
    
    function createStockRow(stock) {
        const row = document.createElement('tr');
        row.className = 'tp-row hover:bg-white/5 transition-colors';
        
        const changeClass = stock.change_percent < 0 ? 'negative' : 'positive';
        const ytdClass = stock.perf_ytd < 0 ? 'negative' : 'positive';
        
        const regionIcon = {
            US: '<i class="fas fa-flag-usa text-xs ml-1 text-blue-400" title="US"></i>',
            EUROPE: '<i class="fas fa-globe-europe text-xs ml-1 text-green-400" title="Europe"></i>',
            ASIA: '<i class="fas fa-globe-asia text-xs ml-1 text-red-400" title="Asie"></i>'
        }[stock.region] || '';
        
        // Vérifier dividende imminent
        const exDivSoon = checkExDividendSoon(stock.dividends_history);
        
        row.innerHTML = `
            <td>
                <div class="font-semibold">${stock.name} ${regionIcon} ${exDivSoon ? '<span title="Ex-dividende sous 7 jours">💸</span>' : ''}</div>
                <div class="text-xs opacity-70 mt-1">
                    <span class="inline-block px-2 py-[2px] rounded-md mr-1" style="border:1px solid var(--card-border); background: rgba(0,255,135,0.1);">${stock.region}</span>
                    ${stock.country}
                    ${stock.data_exchange ? `<span class="inline-block px-2 py-[2px] rounded-md text-[11px] font-medium ml-1" style="border:1px solid var(--card-border); background: rgba(255,255,255,.04);">${stock.data_exchange}</span>` : ''}
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
        
        return row;
    }
    
    function createDetailsRow(stock) {
        const row = document.createElement('tr');
        row.className = 'tp-details hidden';
        row.setAttribute('data-for', `${stock.name}|${stock.ticker}`);
        
        const lastDiv = stock.dividends_history.length > 0 ? 
            stock.dividends_history[0] : null;
        
        const ttmDividend = calculateTTMDividend(stock.dividends_history);
        const dividendYield = stock.dividend_yield || 
            (ttmDividend && stock.price ? (ttmDividend / stock.price * 100) : 0);
        
        row.innerHTML = `
            <td colspan="9" style="background:rgba(255,255,255,0.04); border-left: 3px solid var(--accent-color);">
                <div class="grid lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 gap-6 p-6">
                    <div>
                        <div class="text-xs opacity-70 mb-3 font-semibold text-green-400">📊 PROFIL & MARCHÉ</div>
                        <div class="space-y-1 text-sm">
                            <div><span class="opacity-70">Ticker:</span> <b>${stock.ticker || '–'}</b></div>
                            <div><span class="opacity-70">Secteur:</span> ${stock.sector || '–'}</div>
                            <div><span class="opacity-70">Cotation:</span> ${stock.exchange || '–'}</div>
                            <div><span class="opacity-70">Source données:</span> ${stock.data_exchange || '–'}</div>
                            <div><span class="opacity-70">Région:</span> ${stock.region}</div>
                            <div><span class="opacity-70">Pays:</span> ${stock.country || '–'}</div>
                        </div>
                    </div>
                    <div>
                        <div class="text-xs opacity-70 mb-3 font-semibold text-blue-400">💰 PRIX & VOLUMES</div>
                        <div class="space-y-1 text-sm">
                            <div><span class="opacity-70">Dernier:</span> <b>${formatNumber(stock.price)}</b></div>
                            <div><span class="opacity-70">Ouverture:</span> ${formatNumber(stock.open)}</div>
                            <div><span class="opacity-70">Plus haut:</span> ${formatNumber(stock.high)}</div>
                            <div><span class="opacity-70">Plus bas:</span> ${formatNumber(stock.low)}</div>
                            <div><span class="opacity-70">Volume:</span> ${formatVolume(stock.volume)}</div>
                            <div><span class="opacity-70">Cap. boursière:</span> ${formatMarketCap(stock.market_cap)}</div>
                        </div>
                    </div>
                    <div>
                        <div class="text-xs opacity-70 mb-3 font-semibold text-yellow-400">📈 PERFORMANCES</div>
                        <div class="space-y-1 text-sm">
                            <div><span class="opacity-70">Variation jour:</span> <span class="${stock.change_percent < 0 ? 'negative' : 'positive'}">${formatPercent(stock.change_percent)}</span></div>
                            <div><span class="opacity-70">Performance YTD:</span> <span class="${stock.perf_ytd < 0 ? 'negative' : 'positive'}">${formatPercent(stock.perf_ytd)}</span></div>
                            <div><span class="opacity-70">Volatilité 3Y:</span> ${formatPercent(stock.volatility_3y)}</div>
                            <div><span class="opacity-70">Range 52s:</span> ${stock.range_52w || '–'}</div>
                        </div>
                    </div>
                    <div>
                        <div class="text-xs opacity-70 mb-3 font-semibold text-purple-400">💸 DIVIDENDES</div>
                        <div class="space-y-1 text-sm">
                            <div><span class="opacity-70">Rendement:</span> <b>${formatPercent(dividendYield)}</b></div>
                            <div><span class="opacity-70">TTM:</span> ${formatNumber(ttmDividend) || '–'}</div>
                            ${lastDiv ? `<div><span class="opacity-70">Dernier:</span> ${formatNumber(lastDiv.amount)} (${formatDate(lastDiv.ex_date)})</div>` : '<div class="opacity-50">Aucun dividende</div>'}
                            <div class="text-xs opacity-50 mt-2">MAJ: ${formatDateTime(stock.last_updated)}</div>
                        </div>
                    </div>
                </div>
            </td>
        `;
        
        return row;
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
    
    function filterAndRender() {
        renderAllStocks();
        
        // Mettre à jour le compteur de recherche
        const searchInfo = document.getElementById('search-info');
        const searchCount = document.getElementById('search-count');
        
        if (searchTerm && searchInfo && searchCount) {
            const count = stocksData.filter(s => 
                s.name.toLowerCase().includes(searchTerm)
            ).length;
            
            searchCount.textContent = count;
            searchInfo.classList.remove('hidden');
        } else if (searchInfo) {
            searchInfo.classList.add('hidden');
        }
    }
    
    // Utilitaires de formatage
    function formatNumber(num) {
        if (!num || num === 0) return '–';
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
    
    function checkExDividendSoon(dividends) {
        if (!dividends || dividends.length === 0) return false;
        const nextDiv = dividends[0];
        if (!nextDiv.ex_date) return false;
        
        const exDate = new Date(nextDiv.ex_date);
        const today = new Date();
        const diffTime = exDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
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
    
    // Interface utilities
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
        if (countEl) countEl.textContent = stocksData.length;
    }
    
    function updateLastUpdate(timestamp) {
        const updateEl = document.getElementById('last-update-time');
        if (updateEl && timestamp) {
            updateEl.textContent = timestamp.toLocaleString('fr-FR');
        }
    }
    
    function updateMarketTime() {
        const timeEl = document.getElementById('marketTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('fr-FR');
        }
    }
    
    function initTheme() {
        const themeBtn = document.getElementById('theme-toggle-btn');
        const darkIcon = document.getElementById('dark-icon');
        const lightIcon = document.getElementById('light-icon');
        
        if (!themeBtn) return;
        
        themeBtn.addEventListener('click', function() {
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            document.documentElement.classList.toggle('dark');
            
            const isDark = document.body.classList.contains('dark');
            darkIcon.style.display = isDark ? 'block' : 'none';
            lightIcon.style.display = isDark ? 'none' : 'block';
            
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }
});
