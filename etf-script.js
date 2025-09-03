/**
 * etf-script.js - Script principal pour la page ETF avec Top 10 et fonctionnalités complètes
 * Similaire à liste-script.js mais adapté aux ETFs
 * v1.2 - Amélioration alignement tag spéculatif
 */

document.addEventListener('DOMContentLoaded', function() {
    // État global ETF
    let etfsData = {
        all: [],
        filtered: [],
        currentType: 'all',
        searchQuery: '',
        topPerformers: {
            daily: { best: [], worst: [] },
            ytd: { best: [], worst: [] }
        }
    };
    
    // État pour le Top 10
    let topFilters = {
        type: 'GLOBAL',
        direction: 'up',
        timeframe: 'daily'
    };
    
    // Mise à jour de l'horloge
    function updateMarketTime() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        document.getElementById('marketTime').textContent = `${hours}:${minutes}:${seconds}`;
    }
    setInterval(updateMarketTime, 1000);
    updateMarketTime();
    
    // Chargement des données CSV
    async function loadETFData() {
        try {
            showElement('indices-loading');
            
            const [etfsRes, bondsRes] = await Promise.all([
                fetch('data/combined_etfs.csv').then(r => r.text()).catch(() => ''),
                fetch('data/combined_bonds.csv').then(r => r.text()).catch(() => '')
            ]);
            
            const etfs = etfsRes ? Papa.parse(etfsRes, { 
                header: true, 
                dynamicTyping: true,
                skipEmptyLines: true 
            }).data : [];
            
            const bonds = bondsRes ? Papa.parse(bondsRes, { 
                header: true, 
                dynamicTyping: true,
                skipEmptyLines: true 
            }).data : [];
            
            // Combiner et nettoyer
            etfsData.all = [...etfs, ...bonds]
                .filter(row => row && Object.keys(row).length > 1)
                .map(normalizeETFData);
            
            etfsData.filtered = etfsData.all;
            
            // Calculer les top performers
            calculateTopPerformers();
            
            // Render initial
            renderTopTenETFs();
            renderETFData();
            
        } catch (error) {
            console.error('Erreur:', error);
            showElement('indices-error');
        } finally {
            hideElement('indices-loading');
        }
    }
    
    // Normaliser les données ETF - VERSION AMÉLIORÉE avec fallbacks
    function normalizeETFData(etf) {
        return {
            ...etf,
            ticker: etf.ticker || etf.symbol || '-',
            name: etf.name || etf.objective?.slice(0, 60) || '-',

            // fallbacks dataset
            ter: parseFloat(etf.total_expense_ratio ?? etf.expense_ratio ?? etf.ter ?? 0),
            aum: parseFloat(etf.aum_usd ?? etf.aum ?? etf.net_assets ?? 0),
            price: parseFloat(etf.last_close ?? etf.last ?? etf.price ?? 0),

            return_1d: parseFloat(etf.daily_change_pct ?? etf.return_1d ?? etf.change ?? 0),
            return_ytd: parseFloat(etf.ytd_return_pct ?? etf.return_ytd ?? etf.ytd ?? 0),
            return_1y: parseFloat(etf.one_year_return_pct ?? etf.return_1y ?? etf.perf_1y ?? 0),
            return_3y: parseFloat(etf.return_3y ?? etf.perf_3y ?? 0),

            volatility: parseFloat(etf.vol_3y_pct ?? etf.volatility ?? etf.vol_1y ?? 0),
            sharpe_ratio: parseFloat(etf.sharpe_ratio ?? etf.sharpe ?? 0),
            dividend_yield: parseFloat(etf.yield_ttm ?? etf.dividend_yield ?? 0),

            // pour le tag spéculatif
            etf_type: etf.etf_type || '',
            leverage: (etf.leverage !== '' && etf.leverage !== undefined) ? Number(etf.leverage) : null,

            type: getETFType(etf)
        };
    }
    
    // Calculer les top performers
    function calculateTopPerformers() {
        // Trier pour daily best/worst
        const sortedDaily = [...etfsData.all].sort((a, b) => b.return_1d - a.return_1d);
        etfsData.topPerformers.daily.best = sortedDaily.slice(0, 10);
        etfsData.topPerformers.daily.worst = sortedDaily.slice(-10).reverse();
        
        // Trier pour YTD best/worst
        const sortedYTD = [...etfsData.all].sort((a, b) => b.return_ytd - a.return_ytd);
        etfsData.topPerformers.ytd.best = sortedYTD.slice(0, 10);
        etfsData.topPerformers.ytd.worst = sortedYTD.slice(-10).reverse();
    }
    
    // Helper pour détecter si ETF spéculatif
    function isSpeculative(e) {
        const t = String(e.etf_type || '').toLowerCase();
        const lev = Number(e.leverage);
        return t.includes('inverse') || t.includes('leverag') || (Number.isFinite(lev) && lev !== 0);
    }
    
    // Render Top 10 ETFs - VERSION AVEC MEILLEUR ALIGNEMENT
    function renderTopTenETFs() {
        const container = document.querySelector('#top-global-container .stock-cards-container');
        if (!container) return;

        // Filtrer par type si nécessaire
        let data = etfsData.all;
        if (topFilters.type !== 'GLOBAL') {
            const want = topFilters.type.toLowerCase();
            data = data.filter(etf => (etf.type || '').toLowerCase() === want);
        }

        // Trier selon metric active
        const perfKey = topFilters.timeframe === 'daily' ? 'return_1d' : 'return_ytd';
        const sorted = [...data].sort((a, b) =>
            topFilters.direction === 'up' ? (b[perfKey] - a[perfKey]) : (a[perfKey] - b[perfKey])
        );
        const topData = sorted.slice(0, 10);

        container.innerHTML = '';

        topData.forEach((etf, index) => {
            const main = topFilters.timeframe === 'daily' ? etf.return_1d : etf.return_ytd;
            const sub = topFilters.timeframe === 'daily' ? etf.return_ytd : etf.return_1d;
            const valueClass = main >= 0 ? 'positive' : 'negative';

            let rankBg = '';
            if (index === 0) rankBg = 'bg-amber-500';
            else if (index === 1) rankBg = 'bg-gray-300';
            else if (index === 2) rankBg = 'bg-amber-700';

            const specTag = isSpeculative(etf) ? 
                `<span class="ter-badge" style="display: inline-flex; align-items: center; margin-left: 8px; vertical-align: middle;">⚠ spéculatif</span>` : '';

            const card = document.createElement('div');
            card.className = 'stock-card';
            card.innerHTML = `
                <div class="rank ${rankBg}">#${index + 1}</div>
                <div class="stock-info">
                    <div class="stock-name" style="display: flex; align-items: center;">
                        <span>${etf.ticker}</span>
                        ${specTag}
                    </div>
                    <div class="stock-fullname" title="${etf.name}">${etf.name}</div>
                    <div class="text-xs opacity-60 mt-1">
                        <span class="text-[11px] opacity-70">
                            ${topFilters.timeframe === 'daily' ? 'YTD' : 'Jour'} ${formatPercent(sub)}
                        </span>
                    </div>
                </div>
                <div class="stock-performance ${valueClass}">
                    ${formatPercent(main)}
                </div>
            `;
            container.appendChild(card);
        });

        if (!topData.length) {
            container.innerHTML = '<div class="text-center text-gray-400 py-4">Aucune donnée disponible</div>';
        }

        // hint dynamique
        const hint = document.getElementById('hint-text');
        if (hint) hint.textContent = `Top ${topFilters.direction === 'up' ? 'hausses' : 'baisses'} — ${topFilters.timeframe === 'daily' ? 'Jour' : 'YTD'}`;
    }
    
    // Render table complète
    function renderETFData() {
        const tbody = document.getElementById('etf-table-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        const data = filterETFs();
        
        // Mise à jour compteurs
        document.getElementById('etfs-count').textContent = data.length;
        document.getElementById('last-update-time').textContent = new Date().toLocaleString('fr-FR');
        
        // Limiter à 200 pour performance
        data.slice(0, 200).forEach((etf, idx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="py-2 px-3">
                    <div class="font-medium">${etf.ticker}</div>
                    <div class="text-xs opacity-70 mt-1">${etf.name}</div>
                </td>
                <td class="text-right"><span class="ter-badge">${formatNumber(etf.ter)}%</span></td>
                <td class="text-right"><span class="aum-badge">${formatAUM(etf.aum)}</span></td>
                <td class="text-right">${formatNumber(etf.price, 2)}€</td>
                <td class="text-right ${getColorClass(etf.return_1d)}">${formatPercent(etf.return_1d)}</td>
                <td class="text-right ${getColorClass(etf.return_ytd)}">${formatPercent(etf.return_ytd)}</td>
                <td class="text-right ${getColorClass(etf.return_1y)}">${formatPercent(etf.return_1y)}</td>
                <td class="text-right">${formatNumber(etf.volatility)}%</td>
                <td class="text-right">${formatNumber(etf.sharpe_ratio, 2)}</td>
                <td class="text-right">${formatNumber(etf.dividend_yield)}%</td>
                <td class="text-center">
                    <button type="button" onclick="toggleDetailsRow(this, ${idx})" 
                            class="action-button details-toggle" 
                            aria-expanded="false">
                        <i class="fas fa-chevron-down" aria-hidden="true"></i>
                    </button>
                </td>
            `;
            
            const detailsRow = document.createElement('tr');
            detailsRow.className = 'details-row hidden';
            detailsRow.id = `details-${idx}`;
            detailsRow.innerHTML = `
                <td colspan="11">
                    <div class="grid md:grid-cols-3 gap-6 p-4">
                        <div>
                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Informations</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-60">ISIN:</span> <strong>${etf.isin || '–'}</strong></div>
                                <div><span class="opacity-60">Type:</span> ${etf.type}</div>
                                <div><span class="opacity-60">Réplication:</span> ${etf.replication || '–'}</div>
                                <div><span class="opacity-60">Devise:</span> ${etf.currency || 'EUR'}</div>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Performances</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-60">1 mois:</span> <span class="${getColorClass(etf.return_1m)}">${formatPercent(etf.return_1m)}</span></div>
                                <div><span class="opacity-60">3 mois:</span> <span class="${getColorClass(etf.return_3m)}">${formatPercent(etf.return_3m)}</span></div>
                                <div><span class="opacity-60">3 ans:</span> <span class="${getColorClass(etf.return_3y)}">${formatPercent(etf.return_3y)}</span></div>
                                <div><span class="opacity-60">5 ans:</span> <span class="${getColorClass(etf.return_5y)}">${formatPercent(etf.return_5y)}</span></div>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Risques</div>
                            <div class="space-y-1 text-sm">
                                <div><span class="opacity-60">Max Drawdown:</span> <span class="negative">${formatPercent(etf.max_drawdown)}</span></div>
                                <div><span class="opacity-60">Tracking Error:</span> ${formatNumber(etf.tracking_error)}%</div>
                                <div><span class="opacity-60">Beta:</span> ${formatNumber(etf.beta, 2)}</div>
                                <div><span class="opacity-60">R²:</span> ${formatNumber(etf.r_squared, 2)}</div>
                            </div>
                        </div>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
            tbody.appendChild(detailsRow);
        });
        
        // Afficher le tableau
        hideElement('indices-loading');
        hideElement('indices-error');
        showElement('indices-container');
    }
    
    // Filtrage
    function filterETFs() {
        let filtered = etfsData.all;
        
        // Filtre par type (onglets du bas)
        const activeTab = document.querySelector('.region-tab.active');
        const filterType = activeTab?.dataset.type || 'all';
        
        if (filterType !== 'all') {
            filtered = filtered.filter(etf => etf.type === filterType);
        }
        
        // Filtre par recherche
        if (etfsData.searchQuery) {
            const query = etfsData.searchQuery.toLowerCase();
            filtered = filtered.filter(etf => 
                String(etf.ticker).toLowerCase().includes(query) ||
                String(etf.name).toLowerCase().includes(query) ||
                String(etf.isin || '').toLowerCase().includes(query)
            );
        }
        
        // Tri par AUM décroissant
        filtered.sort((a, b) => b.aum - a.aum);
        
        return filtered;
    }
    
    // Déterminer le type d'ETF
    function getETFType(etf) {
        const name = String(etf.name || '').toLowerCase();
        const type = String(etf.type || '').toLowerCase();
        
        if (name.includes('bond') || type.includes('bond') || name.includes('obligation')) return 'bonds';
        if (name.includes('commodity') || name.includes('gold') || name.includes('oil') || name.includes('matière')) return 'commodity';
        if (name.includes('sector') || name.includes('technology') || name.includes('health')) return 'sector';
        if (name.includes('emerging') || name.includes('europe') || name.includes('asia')) return 'geographic';
        return 'equity';
    }
    
    // Toggle détails
    window.toggleDetailsRow = function(button, idx) {
        const detailsRow = document.getElementById(`details-${idx}`);
        if (!detailsRow) return;
        
        const isOpen = !detailsRow.classList.contains('hidden');
        
        // Fermer tous les autres
        document.querySelectorAll('.details-row').forEach(row => {
            row.classList.add('hidden');
        });
        document.querySelectorAll('.details-toggle').forEach(btn => {
            btn.setAttribute('aria-expanded', 'false');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        });
        
        // Toggle celui-ci
        if (!isOpen) {
            detailsRow.classList.remove('hidden');
            button.setAttribute('aria-expanded', 'true');
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
        }
    };
    
    // Formatage
    function formatNumber(val, decimals = 2) {
        if (!val && val !== 0) return '-';
        return parseFloat(val).toFixed(decimals);
    }
    
    function formatAUM(val) {
        if (!val) return '-';
        const num = parseFloat(val);
        if (num >= 1000) return (num / 1000).toFixed(1) + 'B€';
        return num.toFixed(0) + 'M€';
    }
    
    function formatPercent(val) {
        if (!val && val !== 0) return '-';
        const num = parseFloat(val);
        return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
    }
    
    function getColorClass(val) {
        const num = parseFloat(val);
        if (isNaN(num)) return '';
        return num >= 0 ? 'positive' : 'negative';
    }
    
    // Utility
    function showElement(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }
    
    function hideElement(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    }
    
    // Event listeners
    
    // Top 10 - Boutons de type
    document.querySelectorAll('.tp-regions .seg-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tp-regions .seg-btn').forEach(b => 
                b.setAttribute('aria-selected', 'false'));
            this.setAttribute('aria-selected', 'true');
            
            topFilters.type = this.dataset.type;
            document.getElementById('top-scope-label').textContent = 
                this.textContent.trim().toUpperCase();
            
            renderTopTenETFs();
        });
    });
    
    // Top 10 - Boutons direction/timeframe
    document.querySelectorAll('.tp-filters .pill').forEach(pill => {
        pill.addEventListener('click', function() {
            const dir = this.dataset.dir;
            const frame = this.dataset.frame;
            
            if (dir) {
                document.querySelectorAll('.pill[data-dir]').forEach(p => 
                    p.setAttribute('aria-selected', 'false'));
                this.setAttribute('aria-selected', 'true');
                topFilters.direction = dir;
            } else if (frame) {
                document.querySelectorAll('.pill[data-frame]').forEach(p => 
                    p.setAttribute('aria-selected', 'false'));
                this.setAttribute('aria-selected', 'true');
                topFilters.timeframe = frame;
            }
            
            renderTopTenETFs();
        });
    });
    
    // Onglets de type (table complète)
    document.querySelectorAll('.region-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.region-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            renderETFData();
        });
    });
    
    // Recherche
    const searchInput = document.getElementById('etf-search');
    const clearButton = document.getElementById('clear-search');
    
    searchInput?.addEventListener('input', function() {
        etfsData.searchQuery = this.value;
        clearButton.style.opacity = this.value ? '1' : '0';
        renderETFData();
    });
    
    clearButton?.addEventListener('click', function() {
        searchInput.value = '';
        etfsData.searchQuery = '';
        this.style.opacity = '0';
        renderETFData();
    });
    
    // Retry
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadETFData();
    });
    
    // Theme toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', function() {
        document.body.classList.toggle('dark');
        document.body.classList.toggle('light');
        document.documentElement.classList.toggle('dark');
        
        const darkIcon = document.getElementById('dark-icon');
        const lightIcon = document.getElementById('light-icon');
        
        if (document.body.classList.contains('dark')) {
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
            localStorage.setItem('theme', 'dark');
        } else {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
            localStorage.setItem('theme', 'light');
        }
    });
    
    // Initialiser le thème
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
        document.documentElement.classList.remove('dark');
        document.getElementById('dark-icon').style.display = 'none';
        document.getElementById('light-icon').style.display = 'block';
    }
    
    // Exposer les données pour le module MC
    window.ETFData = {
        getData: () => etfsData.all,
        refresh: loadETFData
    };
    
    // Charger les données au démarrage
    loadETFData();
});

console.log('✅ ETF Script v1.2 - Alignement tag spéculatif amélioré');
