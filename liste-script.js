/**
 * liste-script.js - Script pour afficher les actions du NASDAQ Composite et DJ STOXX 600
 * Données mises à jour régulièrement par GitHub Actions
 * Version améliorée avec chargement dynamique des données par marché et sélection multi-régions
 * Ajout de panneaux détails extensibles pour chaque action
 * MODIFIÉ: Section A→Z indépendante des filtres Top 10
 * AJOUT: Filtres région, pays et secteur pour la section A→Z
 * v1.1: Intégration du payout ratio dans les métriques détaillées
 * v1.2: Fix recherche - fermeture systématique des détails ouverts
 * v1.3: Fix définitif - ne jamais réafficher les details-row lors du clear
 * v1.4: Changement des labels "Rendement" → "Dividende TTM" et "Payout" → "Payout TTM"
 * v1.5: Affichage des valeurs dividend_yield_ttm et payout_ratio_ttm depuis les JSON
 */

// ===== v8.4: Auto Comparator (multi-criteria scoring) =====
const AutoComparator = {
    // Metrics used for scoring (label, getter, higherIsBetter)
    METRICS: [
        { key: 'quality_score', get: s => s.quality_score, hib: true },
        { key: 'buffett_score', get: s => s.buffett_score, hib: true },
        { key: 'change', get: s => parseFloat(String(s.change||'').replace(',','.').replace('%','').replace('+','')), hib: true },
        { key: 'ytd', get: s => parseFloat(String(s.ytd||'').replace(',','.').replace('%','').replace('+','')), hib: true },
        { key: 'perf_1y', get: s => parseFloat(String(s.perf_1y||'').replace(',','.').replace('%','').replace('+','')), hib: true },
        { key: 'perf_3y', get: s => parseFloat(String(s.perf_3y||'').replace(',','.').replace('%','').replace('+','')), hib: true },
        { key: 'pe_ratio', get: s => s.pe_ratio, hib: false },
        { key: 'roe', get: s => s.roe, hib: true },
        { key: 'de_ratio', get: s => s.de_ratio, hib: false },
        { key: 'fcf_yield', get: s => s.fcf_yield, hib: true },
        { key: 'dividend_yield', get: s => parseFloat(String(s.dividend_yield_ttm||s.dividend_yield||'').replace(',','.').replace('%','').replace('+','')), hib: true },
        { key: 'volatility_3y', get: s => parseFloat(String(s.volatility_3y||'').replace(',','.').replace('%','').replace('+','')), hib: false },
        { key: 'max_drawdown_3y', get: s => parseFloat(String(s.max_drawdown_3y||'').replace(',','.').replace('%','').replace('+','')), hib: false },
    ],

    // Get all stocks from current loaded data (across all letters)
    getAllStocks() {
        const stocks = [];
        const data = window.stocksDataUnfiltered || window.stocksData;
        console.log('[AutoComp] getAllStocks data:', data ? 'found' : 'NULL', 'indices keys:', data?.indices ? Object.keys(data.indices).length : 0);
        if (!data?.indices) {
            // Fallback: pull from window._stockMap which is populated during table render
            if (window._stockMap) {
                console.log('[AutoComp] Fallback to _stockMap:', Object.keys(window._stockMap).length);
                return Object.values(window._stockMap);
            }
            return stocks;
        }
        Object.values(data.indices).forEach(letterStocks => {
            (letterStocks || []).forEach(s => stocks.push(s));
        });
        console.log('[AutoComp] Total stocks:', stocks.length);
        return stocks;
    },

    getUniqueValues(stocks, field) {
        const set = new Set();
        stocks.forEach(s => {
            const v = s[field];
            if (v) set.add(v);
        });
        return [...set].sort();
    },

    // Compute percentile score for each stock based on the pool
    computeScores(pool) {
        const scores = pool.map(() => ({ totalPct: 0, validMetrics: 0 }));

        this.METRICS.forEach(metric => {
            const values = pool.map(s => {
                const v = metric.get(s);
                return (v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : null;
            });
            const valid = values.map((v, i) => ({ v, i })).filter(x => x.v != null);
            if (valid.length < 2) return; // Skip metric if not enough data

            // Sort by value
            valid.sort((a, b) => metric.hib ? a.v - b.v : b.v - a.v);
            // Assign percentile (0 = worst, 100 = best)
            valid.forEach((x, rank) => {
                const pct = (rank / (valid.length - 1)) * 100;
                scores[x.i].totalPct += pct;
                scores[x.i].validMetrics++;
            });
        });

        return scores.map(s => s.validMetrics > 0 ? Math.round(s.totalPct / s.validMetrics) : 0);
    },

    runAutoCompare() {
        const region = document.getElementById('auto-region')?.value || '';
        const sector = document.getElementById('auto-sector')?.value || '';
        const industry = document.getElementById('auto-industry')?.value || '';
        const country = document.getElementById('auto-country')?.value || '';
        const topN = parseInt(document.getElementById('auto-top-n')?.value) || 5;

        const all = this.getAllStocks();
        let pool = all.filter(s => {
            if (region && s.region !== region) return false;
            if (sector && s.sector !== sector) return false;
            if (industry && s.industry !== industry) return false;
            if (country && s.country !== country) return false;
            return true;
        });

        const resultDiv = document.getElementById('auto-result-info');
        if (pool.length === 0) {
            if (resultDiv) resultDiv.innerHTML = '<span style="color:#f44336;">Aucune action ne correspond</span>';
            return;
        }
        if (pool.length < 2) {
            if (resultDiv) resultDiv.innerHTML = '<span style="color:#ff9800;">Au moins 2 actions requises</span>';
            return;
        }

        // Compute scores
        const scores = this.computeScores(pool);
        const ranked = pool.map((s, i) => ({ stock: s, score: scores[i] }))
                           .sort((a, b) => b.score - a.score)
                           .slice(0, Math.min(topN, 5)); // max 5 for the comparator

        // Show preview
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.6);margin-bottom:6px;">
                    ${pool.length} actions analysées · Top ${ranked.length} :
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${ranked.map(r => `<span style="padding:4px 10px;border-radius:12px;background:rgba(0,255,135,0.1);border:1px solid rgba(0,255,135,0.3);color:#00FF87;font-size:0.75rem;font-weight:700;">${r.stock.ticker} <span style="opacity:0.6;font-weight:500;">${r.score}/100</span></span>`).join('')}
                </div>
            `;
        }

        // Load top into the main comparator
        StockComparator.selected.clear();
        ranked.forEach(r => StockComparator.selected.set(r.stock.ticker, r.stock));
        StockComparator.renderBar();

        // Open the comparison modal
        setTimeout(() => StockComparator.openModal(), 200);
    },

    openPanel() {
        // Remove existing panel if any
        document.getElementById('auto-compare-panel')?.remove();

        const all = this.getAllStocks();
        const regions = ['US', 'EUROPE', 'ASIA'];
        const sectors = this.getUniqueValues(all, 'sector');
        const industries = this.getUniqueValues(all, 'industry');
        const countries = this.getUniqueValues(all, 'country');

        const panel = document.createElement('div');
        panel.id = 'auto-compare-panel';
        panel.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;
            background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
            display:flex;align-items:center;justify-content:center;padding:20px;`;
        panel.addEventListener('click', (e) => { if (e.target === panel) panel.remove(); });

        panel.innerHTML = `
            <div style="background:#0a1929;border:1px solid rgba(0,255,135,0.3);border-radius:14px;
                max-width:560px;width:100%;padding:24px;box-shadow:0 16px 48px rgba(0,0,0,0.6);">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;">
                    <div>
                        <h2 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;display:flex;align-items:center;">
                            <i class="fas fa-magic" style="color:#00FF87;margin-right:8px;"></i>
                            Comparaison automatique
                        </h2>
                        <p style="color:rgba(255,255,255,0.5);font-size:0.72rem;margin:4px 0 0 0;">
                            Sélectionnez vos critères. L'algo analyse ${all.length} actions et trouve les meilleures sur 13 métriques.
                        </p>
                    </div>
                    <button onclick="document.getElementById('auto-compare-panel').remove()"
                        style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.2rem;padding:0 8px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div>
                        <label style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;display:block;margin-bottom:4px;">Région</label>
                        <select id="auto-region" onchange="AutoComparator.updateCount()" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.82rem;">
                            <option value="">Toutes</option>
                            ${regions.map(r => `<option value="${r}">${r}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;display:block;margin-bottom:4px;">Pays</label>
                        <select id="auto-country" onchange="AutoComparator.updateCount()" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.82rem;">
                            <option value="">Tous</option>
                            ${countries.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;display:block;margin-bottom:4px;">Secteur</label>
                        <select id="auto-sector" onchange="AutoComparator.updateCount()" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.82rem;">
                            <option value="">Tous</option>
                            ${sectors.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;display:block;margin-bottom:4px;">Industrie</label>
                        <select id="auto-industry" onchange="AutoComparator.updateCount()" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.82rem;">
                            <option value="">Toutes</option>
                            ${industries.map(i => `<option value="${i}">${i}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-size:0.65rem;color:rgba(255,255,255,0.5);text-transform:uppercase;display:block;margin-bottom:4px;">Top à comparer</label>
                    <select id="auto-top-n" style="padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.82rem;width:100px;">
                        <option value="3">Top 3</option>
                        <option value="5" selected>Top 5</option>
                    </select>
                </div>

                <div id="auto-result-info" style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px;min-height:60px;">
                    <span style="color:rgba(255,255,255,0.4);font-size:0.75rem;">Sélectionnez des critères puis cliquez "Analyser"</span>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="document.getElementById('auto-compare-panel').remove()"
                        style="padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.5);font-size:0.82rem;cursor:pointer;">
                        Annuler
                    </button>
                    <button onclick="AutoComparator.runAutoCompare()"
                        style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#00FF87,#00d672);color:#000;font-size:0.85rem;font-weight:700;cursor:pointer;">
                        <i class="fas fa-bolt" style="margin-right:4px;"></i>Analyser & Comparer
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
    },

    updateCount() {
        const region = document.getElementById('auto-region')?.value || '';
        const sector = document.getElementById('auto-sector')?.value || '';
        const industry = document.getElementById('auto-industry')?.value || '';
        const country = document.getElementById('auto-country')?.value || '';

        const all = this.getAllStocks();
        const pool = all.filter(s => {
            if (region && s.region !== region) return false;
            if (sector && s.sector !== sector) return false;
            if (industry && s.industry !== industry) return false;
            if (country && s.country !== country) return false;
            return true;
        });

        const resultDiv = document.getElementById('auto-result-info');
        if (resultDiv) {
            const color = pool.length >= 2 ? '#00FF87' : pool.length === 1 ? '#ff9800' : '#f44336';
            resultDiv.innerHTML = `<div style="font-size:0.85rem;color:${color};font-weight:600;">${pool.length} action${pool.length > 1 ? 's' : ''} correspond${pool.length > 1 ? 'ent' : ''} aux critères</div><div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:4px;">Cliquez "Analyser" pour calculer les scores et lancer la comparaison.</div>`;
        }
    }
};

// ===== v8.3: Stock Comparator =====
const StockComparator = {
    MAX: 5,
    selected: new Map(), // ticker → stock object

    isSelected(ticker) { return this.selected.has(ticker); },

    toggle(stock) {
        if (this.selected.has(stock.ticker)) {
            this.selected.delete(stock.ticker);
        } else {
            if (this.selected.size >= this.MAX) {
                alert(`Maximum ${this.MAX} actions à comparer`);
                return false;
            }
            this.selected.set(stock.ticker, stock);
        }
        this.renderBar();
        return true;
    },

    clear() {
        this.selected.clear();
        this.renderBar();
        // Uncheck all checkboxes
        document.querySelectorAll('.compare-checkbox').forEach(cb => cb.checked = false);
    },

    remove(ticker) {
        this.selected.delete(ticker);
        const cb = document.querySelector(`.compare-checkbox[data-ticker="${ticker}"]`);
        if (cb) cb.checked = false;
        this.renderBar();
    },

    renderBar() {
        let bar = document.getElementById('comparator-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'comparator-bar';
            bar.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:9998;
                background:rgba(10,25,41,0.97);backdrop-filter:blur(12px);
                border-top:2px solid #00FF87;padding:14px 24px;
                display:flex;align-items:center;gap:16px;flex-wrap:wrap;
                box-shadow:0 -8px 24px rgba(0,0,0,0.4);transition:transform 0.3s;`;
            document.body.appendChild(bar);
        }

        if (this.selected.size === 0) {
            bar.style.transform = 'translateY(100%)';
            return;
        }

        bar.style.transform = 'translateY(0)';
        const items = [...this.selected.values()];
        bar.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <i class="fas fa-balance-scale" style="color:#00FF87;font-size:1rem;"></i>
                <span style="color:#fff;font-weight:700;font-size:0.85rem;">Comparateur ${this.selected.size}/${this.MAX}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1;">
                ${items.map(s => `
                    <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:14px;
                        background:rgba(0,255,135,0.1);border:1px solid rgba(0,255,135,0.3);color:#fff;font-size:0.78rem;">
                        <strong style="color:#00FF87;">${s.ticker}</strong>
                        <span style="opacity:0.7;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name}</span>
                        <button onclick="StockComparator.remove('${s.ticker}')"
                            style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;padding:0;font-size:0.7rem;">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>
                `).join('')}
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="StockComparator.clear()"
                    style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
                        background:transparent;color:rgba(255,255,255,0.5);font-size:0.78rem;cursor:pointer;">
                    <i class="fas fa-trash" style="margin-right:4px;"></i>Vider
                </button>
                <button onclick="StockComparator.openModal()" ${this.selected.size < 2 ? 'disabled' : ''}
                    style="padding:8px 18px;border-radius:8px;border:none;
                        background:${this.selected.size >= 2 ? 'linear-gradient(135deg,#00FF87,#00d672)' : 'rgba(0,255,135,0.2)'};
                        color:#000;font-weight:700;font-size:0.85rem;cursor:${this.selected.size >= 2 ? 'pointer' : 'not-allowed'};
                        opacity:${this.selected.size >= 2 ? '1' : '0.5'};">
                    <i class="fas fa-bolt" style="margin-right:4px;"></i>Comparer
                </button>
            </div>
        `;
    },

    openModal() {
        if (this.selected.size < 2) return;
        const stocks = [...this.selected.values()];

        // Helper: parse percentage strings like "+12.34 %" → 12.34
        const parsePct = (v) => {
            if (v == null) return null;
            const s = String(v).replace(',','.').replace('%','').replace('+','').trim();
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
        };
        const parseNum = (v) => {
            if (v == null) return null;
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };

        // Define rows: { label, getValue, format, higherIsBetter }
        const rows = [
            { section: 'SCORES' },
            { label: 'Quality', get: s => parseNum(s.quality_score), format: (v, s) => `${s?.quality_grade || '–'} <span style="opacity:0.5;">(${v != null ? Math.round(v) : '–'})</span>`, higherIsBetter: true },
            { label: 'Value', get: s => parseNum(s.buffett_score), format: (v, s) => `${s?.buffett_grade || '–'} <span style="opacity:0.5;">(${v != null ? Math.round(v) : '–'})</span>`, higherIsBetter: true },

            { section: 'PERFORMANCE' },
            { label: 'Var % jour', get: s => parsePct(s.change), format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '–', higherIsBetter: true },
            { label: 'YTD', get: s => parsePct(s.ytd), format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '–', higherIsBetter: true },
            { label: '1 an', get: s => parsePct(s.perf_1y), format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '–', higherIsBetter: true },
            { label: '3 ans', get: s => parsePct(s.perf_3y), format: v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '–', higherIsBetter: true },

            { section: 'FONDAMENTAUX' },
            { label: 'PE Ratio', get: s => parseNum(s.pe_ratio), format: v => v != null ? v.toFixed(1) : '–', higherIsBetter: false },
            { label: 'ROE', get: s => parseNum(s.roe), format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: true },
            { label: 'D/E Ratio', get: s => parseNum(s.de_ratio), format: v => v != null ? v.toFixed(2) : '–', higherIsBetter: false },
            { label: 'FCF Yield', get: s => parseNum(s.fcf_yield), format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: true },
            { label: 'Beta', get: s => parseNum(s.beta), format: v => v != null ? v.toFixed(2) : '–', neutral: true },

            { section: 'DIVIDENDE' },
            { label: 'Div TTM', get: s => parsePct(s.dividend_yield_ttm || s.dividend_yield), format: v => v != null ? v.toFixed(2) + '%' : '–', higherIsBetter: true },
            { label: 'Payout', get: s => parsePct(s.payout_ratio), format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: false },

            { section: 'RISQUE' },
            { label: 'Volatilité 3Y', get: s => parsePct(s.volatility_3y), format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: false },
            { label: 'Drawdown max 3Y', get: s => parsePct(s.max_drawdown_3y), format: v => v != null ? v.toFixed(1) + '%' : '–', higherIsBetter: false },
        ];

        // Build modal HTML
        const headerRow = `
            <tr>
                <th style="padding:14px;text-align:left;background:rgba(255,255,255,0.04);min-width:140px;"></th>
                ${stocks.map(s => `
                    <th style="padding:14px;text-align:center;background:rgba(0,255,135,0.05);border-left:1px solid rgba(255,255,255,0.06);min-width:160px;">
                        <div style="color:#00FF87;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;">${s.ticker}</div>
                        <div style="color:#fff;font-size:0.78rem;font-weight:500;margin-top:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name || ''}</div>
                        <div style="color:rgba(255,255,255,0.4);font-size:0.65rem;margin-top:2px;">${s.region || ''} · ${s.sector || ''}</div>
                    </th>
                `).join('')}
            </tr>
        `;

        // Track win/loss counts per stock
        const wins = new Array(stocks.length).fill(0);
        const losses = new Array(stocks.length).fill(0);

        const dataRows = rows.map(r => {
            if (r.section) {
                return `<tr><td colspan="${stocks.length + 1}" style="padding:12px 14px 6px 14px;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;color:#00FF87;font-weight:700;border-top:1px solid rgba(255,255,255,0.06);">${r.section}</td></tr>`;
            }
            // Compute values
            const values = stocks.map(s => r.get(s));
            const valid = values.filter(v => v != null);
            let bestIdx = -1, worstIdx = -1;
            if (valid.length >= 2 && !r.neutral) {
                const max = Math.max(...valid), min = Math.min(...valid);
                if (max !== min) {
                    bestIdx = values.indexOf(r.higherIsBetter ? max : min);
                    worstIdx = values.indexOf(r.higherIsBetter ? min : max);
                    if (bestIdx >= 0) wins[bestIdx]++;
                    if (worstIdx >= 0) losses[worstIdx]++;
                }
            }
            const cells = stocks.map((s, i) => {
                const v = values[i];
                let bg = '', color = '#fff', weight = '500';
                if (i === bestIdx) { bg = 'rgba(76,175,80,0.15)'; color = '#4caf50'; weight = '700'; }
                else if (i === worstIdx) { bg = 'rgba(244,67,54,0.1)'; color = '#f44336'; weight = '600'; }
                return `<td style="padding:10px 14px;text-align:center;background:${bg};color:${color};font-weight:${weight};font-family:'JetBrains Mono',monospace;font-size:0.85rem;border-left:1px solid rgba(255,255,255,0.06);">${r.format(v, s)}</td>`;
            }).join('');
            return `<tr><td style="padding:10px 14px;color:rgba(255,255,255,0.6);font-size:0.78rem;">${r.label}</td>${cells}</tr>`;
        }).join('');

        // Compute global score on 100: ((wins - losses) / total_criteria + 1) / 2 * 100
        // Or simpler: (wins / (wins+losses)) * 100, with neutral when no participation
        const totalCriteria = wins.map((w, i) => w + losses[i]);
        const scores100 = wins.map((w, i) => {
            const total = totalCriteria[i];
            if (total === 0) return 50; // No data → neutral
            return Math.round((w / total) * 100);
        });

        // Find unique winner (highest score, no tie)
        const maxScore = Math.max(...scores100);
        const winnersCount = scores100.filter(s => s === maxScore).length;
        const winnerIdx = winnersCount === 1 ? scores100.indexOf(maxScore) : -1;

        // Score row at bottom
        const scoreCells = stocks.map((s, i) => {
            const score = scores100[i];
            const isWinner = i === winnerIdx;
            const scoreColor = score >= 70 ? '#4caf50' : score >= 50 ? '#ff9800' : '#f44336';
            const bg = isWinner ? 'linear-gradient(135deg,rgba(0,255,135,0.2),rgba(0,255,135,0.05))' : 'rgba(255,255,255,0.02)';
            return `<td style="padding:18px 14px;text-align:center;background:${bg};border-left:1px solid rgba(255,255,255,0.06);border-top:2px solid ${isWinner ? '#00FF87' : 'rgba(255,255,255,0.08)'};vertical-align:middle;">
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
                    <div style="display:flex;align-items:baseline;gap:2px;justify-content:center;">
                        <span style="font-family:'JetBrains Mono',monospace;font-size:1.7rem;font-weight:800;color:${isWinner ? '#00FF87' : scoreColor};line-height:1;">${score}</span>
                        <span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">/100</span>
                    </div>
                    ${isWinner ? '<div style="font-size:0.7rem;color:#00FF87;font-weight:700;letter-spacing:1px;">GAGNANT</div>' : `<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);font-family:'JetBrains Mono',monospace;">${wins[i]} gagne · ${losses[i]} perd</div>`}
                </div>
            </td>`;
        }).join('');
        const scoreRow = `<tr><td style="padding:18px 14px;color:#00FF87;font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-top:2px solid rgba(0,255,135,0.3);vertical-align:middle;">Score global</td>${scoreCells}</tr>`;

        const modal = document.createElement('div');
        modal.id = 'comparator-modal';
        modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;
            background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
            display:flex;align-items:center;justify-content:center;padding:20px;`;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.innerHTML = `
            <div style="background:#0a1929;border:1px solid rgba(0,255,135,0.3);border-radius:16px;
                max-width:1200px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,0.6);">
                <div style="position:sticky;top:0;background:#0a1929;padding:18px 24px;border-bottom:1px solid rgba(255,255,255,0.06);
                    display:flex;align-items:flex-start;justify-content:space-between;z-index:1;">
                    <div style="display:flex;flex-direction:column;align-items:flex-start;">
                        <h2 style="color:#fff;font-size:1.2rem;font-weight:700;margin:0;line-height:1.2;display:flex;align-items:center;">
                            <i class="fas fa-balance-scale" style="color:#00FF87;margin-right:8px;"></i>
                            Comparateur d'actions
                        </h2>
                        <p style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin:6px 0 0 0;">
                            Vert = meilleure valeur · Rouge = pire valeur
                        </p>
                    </div>
                    <button onclick="document.getElementById('comparator-modal').remove()"
                        style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1.4rem;padding:4px 12px;align-self:flex-start;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding:0 24px 24px 24px;overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>${headerRow}</thead>
                        <tbody>${dataRows}${scoreRow}</tbody>
                    </table>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }
};

// ===== v8.1: Watchlist + Saved Searches + CSV Export =====
const StockUserPrefs = {
    LS_WATCHLIST: 'tp_watchlist_v1',
    LS_SAVED_SEARCHES: 'tp_saved_searches_v1',

    // ── Watchlist ──
    getWatchlist() {
        try { return JSON.parse(localStorage.getItem(this.LS_WATCHLIST) || '[]'); }
        catch { return []; }
    },
    isInWatchlist(ticker) { return this.getWatchlist().includes(ticker); },
    toggleWatchlist(ticker) {
        const list = this.getWatchlist();
        const idx = list.indexOf(ticker);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(ticker);
        localStorage.setItem(this.LS_WATCHLIST, JSON.stringify(list));
        this.updateWatchlistCount();
        return idx < 0; // true if added
    },
    updateWatchlistCount() {
        const el = document.getElementById('watchlist-count');
        if (el) el.textContent = this.getWatchlist().length;
    },

    // ── Saved Searches ──
    getSavedSearches() {
        try { return JSON.parse(localStorage.getItem(this.LS_SAVED_SEARCHES) || '[]'); }
        catch { return []; }
    },
    saveSearch(name) {
        if (!name || !name.trim()) return;
        const searches = this.getSavedSearches();
        const config = {
            name: name.trim(),
            quality: [..._advFilters.quality],
            value: [..._advFilters.value],
            divMin: _advFilters.divMin,
            peMax: _advFilters.peMax,
            beta: _advFilters.beta,
            eps: _advFilters.eps,
            timestamp: Date.now()
        };
        // Remove existing with same name
        const idx = searches.findIndex(s => s.name === config.name);
        if (idx >= 0) searches.splice(idx, 1);
        searches.unshift(config);
        // Keep max 10
        if (searches.length > 10) searches.pop();
        localStorage.setItem(this.LS_SAVED_SEARCHES, JSON.stringify(searches));
        this.refreshSavedSearchesUI();
    },
    deleteSearch(name) {
        const searches = this.getSavedSearches().filter(s => s.name !== name);
        localStorage.setItem(this.LS_SAVED_SEARCHES, JSON.stringify(searches));
        this.refreshSavedSearchesUI();
    },
    loadSearch(name) {
        const search = this.getSavedSearches().find(s => s.name === name);
        if (!search) return;
        // Reset first
        _advFilters.quality = new Set(search.quality || []);
        _advFilters.value = new Set(search.value || []);
        _advFilters.divMin = search.divMin;
        _advFilters.peMax = search.peMax;
        _advFilters.beta = search.beta;
        _advFilters.eps = search.eps;
        // Update UI
        document.querySelectorAll('.grade-filter-btn').forEach(b => {
            const grade = b.dataset.grade;
            const onclick = b.getAttribute('onclick') || '';
            const type = onclick.includes("'quality'") ? 'quality' : 'value';
            b.classList.toggle('active', _advFilters[type].has(grade));
        });
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        setVal('filter-div-min', _advFilters.divMin);
        setVal('filter-pe-max', _advFilters.peMax);
        setVal('filter-beta', _advFilters.beta);
        setVal('filter-eps', _advFilters.eps);
        // Open advanced filters panel if hidden
        document.getElementById('az-advanced-filters')?.classList.remove('hidden');
        applyAdvancedFilters();
    },
    refreshSavedSearchesUI() {
        const container = document.getElementById('saved-searches-list');
        if (!container) return;
        const searches = this.getSavedSearches();
        if (searches.length === 0) {
            container.innerHTML = '<div style="font-size:0.7rem;opacity:0.4;padding:8px;">Aucune recherche sauvegardée</div>';
            return;
        }
        container.innerHTML = '';
        searches.forEach(s => {
            // Build a summary of the saved filters
            const parts = [];
            if (s.quality?.length) parts.push('Q:' + s.quality.join(''));
            if (s.value?.length) parts.push('V:' + s.value.join(''));
            if (s.divMin) parts.push('Div≥' + s.divMin + '%');
            if (s.peMax) parts.push('PE≤' + s.peMax);
            if (s.beta) parts.push('β:' + s.beta);
            if (s.eps) parts.push('EPS+');
            const summary = parts.join(' · ') || 'Aucun filtre';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:stretch;border-radius:6px;background:rgba(255,255,255,0.03);margin-bottom:6px;font-size:0.78rem;overflow:hidden;';

            const loadBtn = document.createElement('div');
            loadBtn.style.cssText = 'flex:1;padding:8px 10px;cursor:pointer;color:#fff;';
            loadBtn.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-bookmark" style="color:#00FF87;font-size:0.65rem;"></i>
                    <span style="font-weight:600;">${s.name}</span>
                </div>
                <div style="font-size:0.65rem;opacity:0.5;margin-top:2px;margin-left:14px;">${summary}</div>
            `;
            loadBtn.onmouseover = () => loadBtn.style.background = 'rgba(0,255,135,0.1)';
            loadBtn.onmouseout = () => loadBtn.style.background = 'transparent';
            loadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                StockUserPrefs.loadSearch(s.name);
                // Close panel after a short delay
                setTimeout(() => {
                    document.getElementById('saved-searches-panel')?.classList.add('hidden');
                }, 100);
            });

            const delBtn = document.createElement('button');
            delBtn.style.cssText = 'background:rgba(244,67,54,0.05);border:none;color:#f44336;cursor:pointer;padding:0 12px;font-size:0.85rem;border-left:1px solid rgba(255,255,255,0.06);';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = 'Supprimer cette recherche';
            delBtn.onmouseover = () => delBtn.style.background = 'rgba(244,67,54,0.2)';
            delBtn.onmouseout = () => delBtn.style.background = 'rgba(244,67,54,0.05)';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                StockUserPrefs.deleteSearch(s.name);
            });

            row.appendChild(loadBtn);
            row.appendChild(delBtn);
            container.appendChild(row);
        });
    },

    // CSV export removed (API license restriction)

    // ── Show only watchlist toggle ──
    showWatchlistOnly: false,
    toggleWatchlistView() {
        this.showWatchlistOnly = !this.showWatchlistOnly;
        const btn = document.getElementById('watchlist-toggle-btn');
        if (btn) {
            btn.classList.toggle('active');
            btn.style.background = this.showWatchlistOnly ? 'rgba(255,215,0,0.15)' : 'transparent';
            btn.style.borderColor = this.showWatchlistOnly ? '#ffd700' : 'rgba(255,255,255,0.1)';
            btn.style.color = this.showWatchlistOnly ? '#ffd700' : 'rgba(255,255,255,0.6)';
        }
        if (window.filterAZStocks) window.filterAZStocks();
    },

    init() {
        this.updateWatchlistCount();
        this.refreshSavedSearchesUI();
    }
};

// Global helpers for inline onclick
window.toggleStarFor = function(ticker, btn) {
    const added = StockUserPrefs.toggleWatchlist(ticker);
    const icon = btn.querySelector('i');
    if (added) {
        icon.className = 'fas fa-star';
        btn.style.color = '#ffd700';
    } else {
        icon.className = 'far fa-star';
        btn.style.color = 'rgba(255,255,255,0.3)';
    }
};

window.promptSaveSearch = function() {
    const name = prompt('Nom de la recherche :');
    if (name) StockUserPrefs.saveSearch(name);
};

// v8.3: Comparator helpers
window.escapeHtmlAttr = function(s) {
    return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};

window.toggleCompareFor = function(checkbox, ticker) {
    const stock = (window._stockMap || {})[ticker];
    if (!stock) return;
    const ok = StockComparator.toggle(stock);
    if (!ok) checkbox.checked = false;
};

// ===== v8.0: Advanced filters state =====
const _advFilters = { quality: new Set(), value: new Set(), divMin: null, peMax: null, beta: null, eps: null };

function toggleGradeFilter(btn, type) {
    const grade = btn.dataset.grade;
    const set = _advFilters[type];
    if (set.has(grade)) { set.delete(grade); btn.classList.remove('active'); }
    else { set.add(grade); btn.classList.add('active'); }
    // Don't auto-apply — wait for "Rechercher" button click
}

function applyAdvancedFilters() {
    _advFilters.divMin = parseFloat(document.getElementById('filter-div-min')?.value) || null;
    _advFilters.peMax = parseFloat(document.getElementById('filter-pe-max')?.value) || null;
    _advFilters.beta = document.getElementById('filter-beta')?.value || null;
    _advFilters.eps = document.getElementById('filter-eps')?.value || null;

    // Update count badge
    let count = _advFilters.quality.size + _advFilters.value.size
        + (_advFilters.divMin ? 1 : 0) + (_advFilters.peMax ? 1 : 0)
        + (_advFilters.beta ? 1 : 0) + (_advFilters.eps ? 1 : 0);
    const badge = document.getElementById('az-advanced-count');
    if (badge) { badge.style.display = count > 0 ? 'inline' : 'none'; badge.textContent = count; }

    // v8.2: Update active filter chips
    renderActiveFilterChips();

    // Trigger the existing filter pipeline (exposed on window from DOMContentLoaded scope)
    if (window.filterAZStocks) window.filterAZStocks();
}

function renderActiveFilterChips() {
    const container = document.getElementById('active-filter-chips');
    if (!container) return;

    const chips = [];
    const colorMap = { A: '#4caf50', B: '#2196f3', C: '#ff9800', D: '#f44336' };

    // Quality grades
    [..._advFilters.quality].sort().forEach(g => {
        chips.push({ label: `Quality ${g}`, color: colorMap[g], type: 'quality', grade: g });
    });
    // Value grades
    [..._advFilters.value].sort().forEach(g => {
        chips.push({ label: `Value ${g}`, color: colorMap[g], type: 'value', grade: g });
    });
    // Other filters
    if (_advFilters.divMin) chips.push({ label: `Div ≥ ${_advFilters.divMin}%`, color: '#00FF87', type: 'divMin' });
    if (_advFilters.peMax) chips.push({ label: `PE ≤ ${_advFilters.peMax}`, color: '#00FF87', type: 'peMax' });
    if (_advFilters.beta) {
        const betaLabels = { low: 'Beta défensif', mid: 'Beta neutre', high: 'Beta agressif' };
        chips.push({ label: betaLabels[_advFilters.beta] || `Beta ${_advFilters.beta}`, color: '#00FF87', type: 'beta' });
    }
    if (_advFilters.eps) chips.push({ label: 'EPS Beats only', color: '#00FF87', type: 'eps' });

    if (chips.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <span style="font-size:0.65rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;align-self:center;">Filtres actifs:</span>
        ${chips.map(c => `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;
                background:${c.color}22;border:1px solid ${c.color}55;color:${c.color};font-size:0.72rem;font-weight:600;">
                ${c.label}
                <button onclick="removeFilterChip('${c.type}','${c.grade || ''}')"
                    style="background:none;border:none;color:${c.color};cursor:pointer;padding:0;font-size:0.7rem;line-height:1;opacity:0.7;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('')}
        <button onclick="resetAdvancedFilters()"
            style="margin-left:auto;padding:3px 10px;border-radius:12px;border:1px solid rgba(244,67,54,0.3);background:transparent;color:#f44336;font-size:0.65rem;cursor:pointer;align-self:center;">
            <i class="fas fa-times" style="margin-right:4px;"></i>Effacer tout
        </button>
    `;
}

window.removeFilterChip = function(type, grade) {
    if (type === 'quality' && grade) {
        _advFilters.quality.delete(grade);
        document.querySelector(`#filter-quality .grade-filter-btn[data-grade="${grade}"]`)?.classList.remove('active');
    } else if (type === 'value' && grade) {
        _advFilters.value.delete(grade);
        document.querySelector(`#filter-value .grade-filter-btn[data-grade="${grade}"]`)?.classList.remove('active');
    } else if (type === 'divMin') {
        _advFilters.divMin = null;
        const el = document.getElementById('filter-div-min'); if (el) el.value = '';
    } else if (type === 'peMax') {
        _advFilters.peMax = null;
        const el = document.getElementById('filter-pe-max'); if (el) el.value = '';
    } else if (type === 'beta') {
        _advFilters.beta = null;
        const el = document.getElementById('filter-beta'); if (el) el.value = '';
    } else if (type === 'eps') {
        _advFilters.eps = null;
        const el = document.getElementById('filter-eps'); if (el) el.value = '';
    }
    applyAdvancedFilters();
};

function resetAdvancedFilters() {
    _advFilters.quality.clear(); _advFilters.value.clear();
    _advFilters.divMin = null; _advFilters.peMax = null; _advFilters.beta = null; _advFilters.eps = null;
    document.querySelectorAll('.grade-filter-btn').forEach(b => b.classList.remove('active'));
    ['filter-div-min','filter-pe-max','filter-beta','filter-eps'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const badge = document.getElementById('az-advanced-count');
    if (badge) badge.style.display = 'none';
    applyAdvancedFilters(); // will call renderActiveFilterChips
}

function _passAdvancedFilter(stock) {
    // Quality grade filter
    if (_advFilters.quality.size > 0 && !_advFilters.quality.has(stock.quality_grade)) return false;
    // Value grade filter
    if (_advFilters.value.size > 0 && !_advFilters.value.has(stock.buffett_grade)) return false;
    // Dividend minimum
    if (_advFilters.divMin != null) {
        const div = parseFloat(String(stock.dividend_yield_ttm || stock.dividend_yield || '0').replace(',','.').replace('%','').replace('+',''));
        if (isNaN(div) || div < _advFilters.divMin) return false;
    }
    // PE maximum
    if (_advFilters.peMax != null) {
        const pe = stock.pe_ratio != null ? parseFloat(stock.pe_ratio) : null;
        if (pe == null || pe > _advFilters.peMax) return false;
    }
    // Beta range
    if (_advFilters.beta) {
        const beta = stock.beta != null ? parseFloat(stock.beta) : null;
        if (beta == null) return false;
        if (_advFilters.beta === 'low' && beta > 0.8) return false;
        if (_advFilters.beta === 'mid' && (beta < 0.8 || beta > 1.2)) return false;
        if (_advFilters.beta === 'high' && beta <= 1.2) return false;
    }
    // EPS beats only
    if (_advFilters.eps === 'beats') {
        const surp = stock.eps_surprise_avg_2q != null ? parseFloat(stock.eps_surprise_avg_2q) : null;
        if (surp == null || surp <= 0) return false;
    }
    return true;
}

// ===== v8.0: Column sorting state =====
let _sortCol = null;  // null = alphabetical, or column index
let _sortAsc = true;

// NOUVEAU: Fonction globale pour fermer tous les détails
function closeAllDetails() {
  document.querySelectorAll('tr.details-row').forEach(r => r.classList.add('hidden'));
  document.querySelectorAll('.details-toggle').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
    const ic = btn.querySelector('i');
    if (ic) { ic.classList.add('fa-chevron-down'); ic.classList.remove('fa-chevron-up'); }
  });
}

document.addEventListener('DOMContentLoaded', function() {
    // v8.1: Init user prefs (watchlist + saved searches)
    StockUserPrefs.init();

    // v8.0: Headers set directly in HTML — no dynamic rename needed
    const updateTableHeaders = () => {};
    
    // Observer pour gérer le contenu dynamique
    const headerObserver = new MutationObserver(() => {
        updateTableHeaders();
    });
    
    // Observer les changements dans les tableaux
    document.querySelectorAll('.region-content').forEach(content => {
        headerObserver.observe(content, { childList: true, subtree: true });
    });
    
    // Mise à jour initiale
    setTimeout(updateTableHeaders, 100);
    // ===== FIN DE LA MISE À JOUR DES LABELS =====
    
    // --- FICHIERS A→Z PAR RÉGION ---
    const AZ_FILES = {
        US:      'data/stocks_us.json',
        EUROPE:  'data/stocks_europe.json',
        ASIA:    'data/stocks_asia.json',
    };
    
    const SCOPE_TO_FILES = {
        GLOBAL:        ['US','EUROPE','ASIA'],
        US:            ['US'],
        EUROPE:        ['EUROPE'],
        ASIA:          ['ASIA'],
        US_EUROPE:     ['US','EUROPE'],
        US_ASIA:       ['US','ASIA'],
        EUROPE_ASIA:   ['EUROPE','ASIA'],
    };
    
    // NOUVEAU: Constante pour forcer GLOBAL sur la section A→Z
    const AZ_SCOPE = 'GLOBAL'; // Section A→Z toujours en mode GLOBAL (toutes régions)
    
    // Variables globales pour stocker les données
    let stocksData = {
        indices: {},
        meta: {
            source: 'TradePulse',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Données complètes non filtrées pour la section A→Z
    let stocksDataUnfiltered = null;
    
    // Données des deux marchés pour le classement global
    let globalData = {
        nasdaq: null,
        stoxx: null
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // État pour le marché actuel et la pagination
    let currentMarket = 'nasdaq'; // 'nasdaq' ou 'stoxx'
    let currentPage = 1;
    let totalPages = 1;
    
    // État pour la sélection multi-régions des Top 10
    let topScope = 'GLOBAL';                  // clé utilisée dans tops_overview.sets
    let selectedRegions = new Set(['GLOBAL']); // ensemble des boutons actifs (GLOBAL exclusif)
    const REGION_ORDER = ['US','EUROPE','ASIA']; // pour ordonner les combos
    const COMBO_MAP = {
      'US,EUROPE': 'US_EUROPE',
      'EUROPE,US': 'US_EUROPE',
      'US,ASIA': 'US_ASIA',
      'ASIA,US': 'US_ASIA',
      'EUROPE,ASIA': 'EUROPE_ASIA',
      'ASIA,EUROPE': 'EUROPE_ASIA'
    };
    
    // État pour les filtres A→Z (séparé du Top 10)
    let azSelectedRegions = new Set(['GLOBAL']);
    let azScope = 'GLOBAL';
    let azCountryFilter = '';
    let azSectorFilter = '';
    
    // Mapping pays par région
    const COUNTRIES_BY_REGION = {
        US: ['États-Unis', 'USA', 'United States'],
        EUROPE: ['Allemagne', 'France', 'Suisse', 'Pays-Bas', 'Royaume-Uni', 'Espagne', 'Italie', 'Belgique', 'Suède', 'Norvège', 'Danemark', 'Finlande', 'Autriche', 'Portugal', 'Irlande', 'Luxembourg'],
        ASIA: ['Chine', 'Japon', 'Corée', 'Taïwan', 'Inde', 'Singapour', 'Hong Kong', 'Malaisie', 'Thaïlande', 'Indonésie', 'Philippines', 'Vietnam']
    };
    
    // Liste des secteurs disponibles
    const AVAILABLE_SECTORS = [
        'Technologie', 'Finance', 'Santé', 'Industrie', 'Consommation', 'Énergie', 
        'Matériaux', 'Services publics', 'Immobilier', 'Télécommunications', 'Services'
    ];
    
    // Données des tops overview
    let topsOverview = null;
    
    // Initialiser les onglets alphabet
    initAlphabetTabs();
    
    // Initialiser les sélecteurs de marché
    initMarketSelector();
    
    // Initialiser la pagination
    initPagination();
    
    // Initialiser la barre de recherche
    initSearchFunctionality();
    
    // Initialiser les filtres A→Z
    initAZFilters();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Initialiser les boutons de sélection multi-régions
    wireScopeButtons();
    
    // MODIFIÉ: Forcer le chargement GLOBAL pour la section A→Z
    loadAZDataForCurrentSelection(false, true); // forceGlobal = true
    
    // Charger les données pour le marché sélectionné (NASDAQ/STOXX)
    loadStocksData();
    
    // Charger les données globales
    loadGlobalData();
    
    // Charger les données tops_overview.json
    loadTopsOverview();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadAZDataForCurrentSelection(true, true); // MODIFIÉ: forceGlobal = true
    });
    
    // Écouter les événements de changement de filtres depuis liste.html
    window.addEventListener('topFiltersChanged', function(event) {
        const detail = event.detail;
        console.log('Filtres changés:', detail);
        
        // Mettre à jour topScope si nécessaire
        const regions = detail.regions;
        if (regions.includes('GLOBAL')) {
            topScope = 'GLOBAL';
        } else if (regions.length === 1) {
            topScope = regions[0];
        } else if (regions.length === 2) {
            const ordered = regions.sort((a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
            topScope = COMBO_MAP[`${ordered[0]},${ordered[1]}`] || 'GLOBAL';
        }
        
        // MODIFIÉ: Ne recharger QUE les tops, PAS les données A→Z
        renderTop();
        // SUPPRIMÉ: loadAZDataForCurrentSelection(true);
    });
    
    /**
     * Initialise les filtres A→Z
     */
    function initAZFilters() {
        const azScopeBox = document.getElementById('az-scope');
        if (!azScopeBox) return;
        
        const btns = [...azScopeBox.querySelectorAll('.market-btn')];
        
        const updateAZButtonsUI = () => {
            btns.forEach(b => {
                const k = b.dataset.scope;
                b.classList.toggle('active', azSelectedRegions.has(k));
            });
        };
        
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.scope;
                
                // Même logique que Top 10
                if (key === 'GLOBAL') {
                    azSelectedRegions.clear();
                    azSelectedRegions.add('GLOBAL');
                } else {
                    if (azSelectedRegions.has('GLOBAL')) azSelectedRegions.delete('GLOBAL');
                    
                    if (azSelectedRegions.has(key)) {
                        azSelectedRegions.delete(key);
                    } else {
                        if (azSelectedRegions.size >= 2) {
                            showToast('Maximum 2 régions simultanément');
                            return;
                        }
                        azSelectedRegions.add(key);
                    }
                    
                    if (azSelectedRegions.size === 0) azSelectedRegions.add('GLOBAL');
                }
                
                updateAZButtonsUI();
                updateCountryDropdown();
                filterAZStocks();
            });
        });
        
        // Initialiser les dropdowns
        initSectorDropdown();
        
        // Filtres dropdown
        document.getElementById('az-country-filter')?.addEventListener('change', (e) => {
            azCountryFilter = e.target.value;
            filterAZStocks();
        });
        
        document.getElementById('az-sector-filter')?.addEventListener('change', (e) => {
            azSectorFilter = e.target.value;
            filterAZStocks();
        });
        
        // Initialisation
        updateCountryDropdown();
    }
    
    /**
     * Initialise le dropdown des secteurs
     */
    function initSectorDropdown() {
        const select = document.getElementById('az-sector-filter');
        if (!select) return;
        
        select.innerHTML = '<option value="">Tous secteurs</option>';
        
        // Récupérer les secteurs uniques depuis les données si disponibles
        if (stocksDataUnfiltered) {
            const sectors = new Set();
            Object.values(stocksDataUnfiltered.indices).forEach(letterStocks => {
                letterStocks.forEach(stock => {
                    if (stock.sector) sectors.add(stock.sector);
                });
            });
            
            [...sectors].sort().forEach(sector => {
                const option = document.createElement('option');
                option.value = sector;
                option.textContent = sector;
                select.appendChild(option);
            });
        } else {
            // Utiliser la liste par défaut
            AVAILABLE_SECTORS.forEach(sector => {
                const option = document.createElement('option');
                option.value = sector;
                option.textContent = sector;
                select.appendChild(option);
            });
        }
    }
    
    /**
     * Mettre à jour la liste de pays selon les régions
     */
    function updateCountryDropdown() {
        const select = document.getElementById('az-country-filter');
        if (!select) return;
        
        select.innerHTML = '<option value="">Tous pays</option>';
        
        const regions = azSelectedRegions.has('GLOBAL') 
            ? ['US', 'EUROPE', 'ASIA'] 
            : Array.from(azSelectedRegions);
        
        const countries = new Set();
        
        // Si on a les données, récupérer les pays réels
        if (stocksDataUnfiltered) {
            Object.values(stocksDataUnfiltered.indices).forEach(letterStocks => {
                letterStocks.forEach(stock => {
                    if (regions.includes(stock.region) && stock.country) {
                        countries.add(stock.country);
                    }
                });
            });
        } else {
            // Sinon utiliser le mapping par défaut
            regions.forEach(r => {
                COUNTRIES_BY_REGION[r]?.forEach(c => countries.add(c));
            });
        }
        
        [...countries].sort().forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            select.appendChild(option);
        });
    }
    
    /**
     * Filtrer les stocks A→Z
     */
    // v8.0: Exposed on window so global applyAdvancedFilters() can call it
    window.filterAZStocks = filterAZStocks;
    function filterAZStocks() {
        if (!stocksDataUnfiltered) return;
        
        const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
        let totalVisible = 0;
        
        // Créer les indices filtrés
        const filteredIndices = {};
        alphabet.forEach(l => filteredIndices[l] = []);
        
        // Appliquer les filtres
        Object.entries(stocksDataUnfiltered.indices).forEach(([letter, stocks]) => {
            stocks.forEach(stock => {
                let show = true;
                
                // Filtre région
                if (!azSelectedRegions.has('GLOBAL')) {
                    if (!azSelectedRegions.has(stock.region)) show = false;
                }
                
                // Filtre pays
                if (azCountryFilter && stock.country !== azCountryFilter) show = false;
                
                // Filtre secteur
                if (azSectorFilter && stock.sector !== azSectorFilter) show = false;

                // v8.0: Advanced filters
                if (show && !_passAdvancedFilter(stock)) show = false;

                // v8.1: Watchlist-only filter
                if (show && StockUserPrefs.showWatchlistOnly && !StockUserPrefs.isInWatchlist(stock.ticker)) show = false;

                if (show) {
                    filteredIndices[letter].push(stock);
                    totalVisible++;
                }
            });
        });
        
        // Mettre à jour stocksData avec les données filtrées
        stocksData = {
            ...stocksDataUnfiltered,
            indices: filteredIndices,
            meta: {
                ...stocksDataUnfiltered.meta,
                count: totalVisible
            }
        };
        window.stocksData = stocksData; // v8.1: expose for CSV export
        window.stocksDataUnfiltered = stocksDataUnfiltered; // v8.4: expose for AutoComparator
        
        // Mettre à jour le compteur
        const countElement = document.getElementById('az-filtered-count');
        if (countElement) {
            countElement.textContent = totalVisible;
        }
        
        // Re-render les données
        renderStocksData();
    }
    
    /**
     * Initialise les boutons de sélection multi-régions pour les Top 10
     * MODIFIÉ: Ne recharge plus les données A→Z
     */
    function wireScopeButtons() {
      const box = document.getElementById('top-scope');
      if (!box) return;
      const btns = [...box.querySelectorAll('.market-btn')];

      const updateButtonsUI = () => {
        // Active visuellement les bons boutons
        btns.forEach(b => {
          const k = b.dataset.scope;
          b.classList.toggle('active', selectedRegions.has(k));
        });
        // Met l'étiquette avec ordre cohérent
        const lab = document.getElementById('top-scope-label');
        if (lab) {
          if (selectedRegions.has('GLOBAL') || selectedRegions.size === 0) {
            lab.textContent = 'GLOBAL';
          } else {
            // Toujours ordonner selon REGION_ORDER pour le label
            const ordered = Array.from(selectedRegions).sort(
              (a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)
            );
            lab.textContent = ordered.join(' + ');
          }
        }
      };

      const computeTopKey = () => {
        if (selectedRegions.has('GLOBAL') || selectedRegions.size === 0) return 'GLOBAL';
        if (selectedRegions.size === 1) return Array.from(selectedRegions)[0];
        // 2 régions → clé combo
        const arr = Array.from(selectedRegions).sort(
          (a,b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)
        );
        const key = COMBO_MAP[`${arr[0]},${arr[1]}`] || COMBO_MAP[`${arr[1]},${arr[0]}`];
        if (!key) {
          console.warn(`Combo non trouvée: ${arr.join(',')}`);
          return 'GLOBAL'; // fallback
        }
        return key;
      };

      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.scope;

          if (key === 'GLOBAL') {
            // GLOBAL = exclusif
            selectedRegions.clear();
            selectedRegions.add('GLOBAL');
          } else {
            // Si GLOBAL était actif → on le retire
            if (selectedRegions.has('GLOBAL')) selectedRegions.delete('GLOBAL');

            // Toggle sur la région
            if (selectedRegions.has(key)) {
              selectedRegions.delete(key);
            } else {
              // Ajout avec limite 2
              if (selectedRegions.size >= 2) {
                // petit feedback visuel si on tente >2
                btn.classList.add('ring-2','ring-red-400');
                setTimeout(() => btn.classList.remove('ring-2','ring-red-400'), 400);
                showToast('Maximum 2 régions simultanément');
                return;
              }
              selectedRegions.add(key);
            }

            // Si plus rien de sélectionné → repasser en GLOBAL
            if (selectedRegions.size === 0) selectedRegions.add('GLOBAL');
          }

          updateButtonsUI();
          topScope = computeTopKey();
          renderTop(); // MODIFIÉ: recharge SEULEMENT les tops, PAS les données A→Z
          // SUPPRIMÉ: loadAZDataForCurrentSelection(true);
        });
      });

      // init
      updateButtonsUI();
      topScope = 'GLOBAL';
    }
    
    /**
     * Mini toast notification
     */
    function showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
    
    /**
     * Helpers de normalisation pour les données régionales
     */
    function pctToStr(x) {
        if (x == null || x === '-') return '-';
        const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : Number(x);
        if (!Number.isFinite(n)) return '-';
        const s = (n > 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + ' %';
        return s;
    }
    
    function numToStr(x, d = 2) {
        if (x == null || x === '-') return '-';
        const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : Number(x);
        return Number.isFinite(n) ? n.toLocaleString('fr-FR', {
            minimumFractionDigits: d,
            maximumFractionDigits: d
        }) : '-';
    }
    
    // --- NOUVEAU: Payout helpers ---
    function parsePctRaw(v){
      if (v == null || v === '-' || v === '') return NaN;
      return parseFloat(String(v)
        .replace('\u2212','-')         // minus unicode
        .replace(',', '.')
        .replace(/[+%\s]/g,'')
        .trim());
    }

    function computePayoutMeta(r){
      // multi-fallbacks possibles depuis les JSON
      const raw = parsePctRaw(
        r.payout_ratio ?? r.payout ?? r.dividend_payout_ratio ?? r.payout_ratio_ttm
      );
      if (!Number.isFinite(raw)) return { num: null, str: null, cls: '' };

      const sector = String(r.sector || '').toLowerCase();
      const isRE = sector.includes('immobili') || sector === 'real estate' ||
                   /reit/i.test(String(r.name||'')) || /reit/i.test(String(r.exchange||''));
      const val = Math.min(raw, isRE ? 400 : 200); // cap souple

      const cls =
        val < 30  ? 'payout-ok-strong' :
        val < 60  ? 'payout-ok'        :
        val < 80  ? 'payout-warn'      :
        val < 100 ? 'payout-high'      :
                    'payout-risk';

      return { 
        num: val, 
        str: val.toFixed(1).replace('.', ',') + ' %', // pas de signe
        cls 
      };
    }
    
    function normalizeRecord(r, fallbackRegion) {
        // On accepte {price,change_percent,perf_ytd,open,high,low,volume} ou {last,change,ytd,...}
        const name = r.name || r.ticker || '—';
        const ticker = r.ticker || r.symbol || '';
        const region = r.region || fallbackRegion || 'GLOBAL';
        const country = r.country || r.location || '';
        const last = r.last ?? r.price;
        const change = r.change ?? r.change_percent;
        const ytd = r.ytd ?? r.perf_ytd;
        
        // Déterminer l'icône du marché
        const marketIcon = {
            US: '<i class="fas fa-flag-usa text-xs ml-1 text-blue-400" title="US"></i>',
            EUROPE: '<i class="fas fa-globe-europe text-xs ml-1 text-green-400" title="Europe"></i>',
            ASIA: '<i class="fas fa-globe-asia text-xs ml-1 text-red-400" title="Asie"></i>'
        }[region] || '';
        
        // NOUVEAU: Calculer le payout depuis payout_ratio_ttm
        const payout = computePayoutMeta(r);
        
        // MODIFIÉ v1.5: Récupérer dividend_yield_ttm avec fallbacks
        const divTTMRaw = r.dividend_yield_ttm 
                     ?? r.dividend_yield_ttm_pct 
                     ?? r.dividend_yield     // fallback si pas de TTM
                     ?? r.dividend_yield_forward;
        
        return {
            name,
            ticker,
            region,
            country,
            last: numToStr(last),
            change: pctToStr(change),
            open: numToStr(r.open),
            high: numToStr(r.high),
            low: numToStr(r.low),
            ytd: pctToStr(ytd),
            volume: r.volume == null ? '-' : Number(r.volume).toLocaleString('fr-FR'),
            marketIcon,
            regionBadgeClass: `region-${region.toLowerCase()}`,
            exchange: r.exchange || null,
            data_exchange: r.data_exchange || 'Boursorama',
            sector: r.sector || null,
            volatility_3y: r.volatility_3y ? pctToStr(r.volatility_3y) : '-',
            // MODIFIÉ v1.5: Utiliser dividend_yield_ttm au lieu de dividend_yield
            dividend_yield_ttm: divTTMRaw != null ? pctToStr(divTTMRaw) : '-',
            dividend_yield: r.dividend_yield ? pctToStr(r.dividend_yield) : '-', // garder en backup
            market_cap: r.market_cap ? Number(r.market_cap).toLocaleString('fr-FR') : null,
            range_52w: r.range_52w || null,
            perf_1m: r.perf_1m ? pctToStr(r.perf_1m) : null,
            perf_3m: r.perf_3m ? pctToStr(r.perf_3m) : null,
            perf_1y: r.perf_1y ? pctToStr(r.perf_1y) : '-',
            perf_3y: r.perf_3y ? pctToStr(r.perf_3y) : '-',
            max_drawdown_3y: r.max_drawdown_3y ? pctToStr(r.max_drawdown_3y) : '-',
            // === Payout intégré ===
            payout_ratio: payout.str,          // "xx,x %"
            payout_ratio_num: payout.num,      // nombre
            payout_class: payout.cls,          // classe couleur
            // === v8.0: Enriched scores & fundamentals ===
            quality_score: r.quality_score ?? null,
            quality_grade: r.quality_grade || null,
            quality_subscores: r.quality_subscores || null,
            quality_profile: r.quality_profile || null,
            buffett_score: r.buffett_score ?? null,
            buffett_grade: r.buffett_grade || null,
            buffett_criteria: r.buffett_criteria || null,
            pe_ratio: r.pe_ratio ?? null,
            roe: r.roe ?? null,
            de_ratio: r.de_ratio ?? null,
            fcf_yield: r.fcf_yield ?? null,
            beta: r.beta ?? r.beta_capm ?? null,
            eps_surprise_avg_2q: r.eps_surprise_avg_2q ?? null,
            eps_beat_streak: r.eps_beat_streak ?? null,
            industry: r.industry || null,
        };
    }
    
    function dedupByNameTicker(arr) {
        const seen = new Set();
        return arr.filter(s => {
            const k = (s.name || '') + '|' + (s.ticker || '');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }
    
    /**
     * Charge les données A→Z basées sur la sélection régionale actuelle
     * MODIFIÉ: Accepte un paramètre forceGlobal pour toujours charger GLOBAL
     */
    async function loadAZDataForCurrentSelection(forceRefresh = false, forceGlobal = false) {
        // MODIFIÉ: Toujours utiliser GLOBAL pour la section A→Z
        const scope = forceGlobal ? 'GLOBAL' : AZ_SCOPE;
        const regions = SCOPE_TO_FILES[scope];
        const urls = regions.map(r => AZ_FILES[r]).filter(Boolean);
        const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
        
        // Éviter les chargements multiples simultanés
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        showElement('indices-loading');
        hideElement('indices-error');
        hideElement('indices-container');
        
        // Afficher quelles régions on charge (éviter l'accumulation de messages)
        const loadingText = document.querySelector('#indices-loading .loader');
        if (loadingText) {
            const parent = loadingText.parentElement;
            parent?.querySelector('.loading-msg')?.remove(); // Supprimer l'ancien message
            
            // MODIFIÉ: Message clair pour la section A→Z
            const loadingMessage = document.createElement('p');
            loadingMessage.className = 'loading-msg mt-4 text-sm text-gray-400';
            loadingMessage.textContent = `Chargement des données globales (US + Europe + Asie)...`;
            parent.appendChild(loadingMessage);
        }
        
        try {
            console.log(`🔍 Chargement A→Z GLOBAL (toutes régions)`);
            
            const payloads = await Promise.all(
                urls.map(u => 
                    fetch(u + cacheBuster)
                        .then(r => r.ok ? r.json() : Promise.reject(u))
                        .catch(err => {
                            console.error(`Erreur lors du chargement de ${u}:`, err);
                            return null;
                        })
                )
            );
            
            // Filtrer les payloads null
            const validPayloads = payloads.filter(p => p !== null);
            
            if (validPayloads.length === 0) {
                throw new Error('Aucune donnée disponible');
            }
            
            // Collecter toutes les données
            const all = [];
            let latestTs = null;
            
            validPayloads.forEach((data, i) => {
                const region = regions[i];
                
                // Récupérer le timestamp le plus récent
                if (data.timestamp) {
                    const ts = Date.parse(data.timestamp);
                    latestTs = latestTs ? Math.max(latestTs, ts) : ts;
                }
                
                // Supporter 2 formats de données
                if (data.indices) {
                    // Format A: { meta, indices: { a:[...], b:[...] } }
                    Object.values(data.indices).forEach(list => {
                        (list || []).forEach(r => all.push(normalizeRecord(r, region)));
                    });
                } else if (Array.isArray(data.stocks)) {
                    // Format B: { meta, stocks: [...] }
                    data.stocks.forEach(r => all.push(normalizeRecord(r, region)));
                }
            });
            
            // Dédup + tri + dispatch A→Z
            const uniq = dedupByNameTicker(all);
            const indices = {};
            'abcdefghijklmnopqrstuvwxyz'.split('').forEach(l => indices[l] = []);
            
            uniq.forEach(s => {
                const firstChar = (s.name || s.ticker || '').charAt(0).toLowerCase();
                if (indices[firstChar]) {
                    indices[firstChar].push(s);
                }
            });
            
            // Trier chaque lettre par nom
            Object.keys(indices).forEach(l => {
                indices[l].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            });
            
            // Calculer les statistiques par région
            const stats = {
                total: uniq.length,
                byRegion: {}
            };
            
            regions.forEach(r => {
                stats.byRegion[r] = uniq.filter(s => s.region === r).length;
            });
            
            // Sauvegarder les données non filtrées
            stocksDataUnfiltered = {
                indices,
                meta: {
                    source: 'TradePulse',
                    timestamp: latestTs ? new Date(latestTs).toISOString() : new Date().toISOString(),
                    count: stats.total,
                    isStale: false,
                    stats // Ajout des statistiques
                }
            };

            // Copier vers stocksData pour l'affichage initial
            stocksData = { ...stocksDataUnfiltered };
            // v8.4: expose globally for AutoComparator
            window.stocksDataUnfiltered = stocksDataUnfiltered;
            window.stocksData = stocksData;
            
            console.log(`✅ Section A→Z: ${stats.total} actions globales chargées`);
            
            // Afficher les statistiques dans l'UI
            const regionBreakdown = document.getElementById('region-breakdown');
            if (regionBreakdown) {
                regionBreakdown.textContent = Object.entries(stats.byRegion)
                    .map(([r, c]) => `${r}: ${c}`)
                    .join(' | ');
            }
            
            // Mettre à jour les dropdowns
            updateCountryDropdown();
            initSectorDropdown();
            
            // Mettre à jour le compteur filtré
            const countElement = document.getElementById('az-filtered-count');
            if (countElement) {
                countElement.textContent = stats.total;
            }
            
            // Afficher les données
            renderStocksData();
            lastUpdate = new Date();
            
        } catch (err) {
            console.error('❌ Erreur lors du chargement A→Z régions:', err);
            showElement('indices-error');
            hideElement('indices-loading');
        } finally {
            isLoading = false;
        }
    }
    
    /**
     * Charge les données tops_overview.json
     */
    async function loadTopsOverview() {
      try {
        console.log("🔍 Chargement des données tops_overview.json...");
        const response = await fetch('data/tops_overview.json');
        
        if (response.ok) {
          topsOverview = await response.json();
          console.log("✅ Données tops_overview chargées avec succès");
          renderTop();
        } else {
          console.warn("⚠️ Fichier tops_overview.json non trouvé");
        }
      } catch (error) {
        console.error('❌ Erreur lors du chargement de tops_overview:', error);
      }
    }
    
    /**
     * Affiche les tops depuis tops_overview.json
     * MODIFIÉ: Passe le trend (up/down) selon le filtre actif
     */
    function renderTop() {
      if (!topsOverview?.sets?.[topScope]) {
        console.warn(`Pas de données pour topScope: ${topScope}`);
        return;
      }
      
      const set = topsOverview.sets[topScope];
      
      // Mise à jour des 4 sections basées sur les filtres actifs
      const container = document.getElementById('top-global-container');
      if (!container) return;
      
      // Déterminer quelle vue afficher basée sur les filtres de la nouvelle barre
      const directionUp = document.querySelector('.pill[data-dir="up"][aria-selected="true"]');
      const timeframeDaily = document.querySelector('.pill[data-frame="daily"][aria-selected="true"]');
      
      let data;
      if (timeframeDaily) {
        data = directionUp ? set.day?.up : set.day?.down;
      } else {
        data = directionUp ? set.ytd?.up : set.ytd?.down;
      }
      
      const valueField = timeframeDaily ? 'change_percent' : 'perf_ytd';
      
      if (data) {
        // Passer le trend (up ou down) selon le filtre actif
        renderTopTenCardsInContainer(
          container, 
          data, 
          valueField, 
          'global',
          { trend: directionUp ? 'up' : 'down' }
        );
      }
    }
    
    /**
     * Render des cartes directement dans un container
     * MODIFIÉ: Accepte opts en paramètre supplémentaire
     */
    function renderTopTenCardsInContainer(containerEl, stocks, valueField, marketSource, opts = {}) {
        if (!containerEl) return;
        // Déléguer à la version robuste de renderTopTenCards avec opts
        renderTopTenCards(containerEl, stocks, valueField, marketSource, opts);
    }
    
    /**
     * Initialise les onglets alphabet
     * MODIFIÉ: Ferme tous les détails quand on change d'onglet
     */
    function initAlphabetTabs() {
        const tabs = document.querySelectorAll('.region-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Mettre à jour les onglets actifs
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher le contenu correspondant
                const letter = this.getAttribute('data-region');
                const contents = document.querySelectorAll('.region-content');
                
                contents.forEach(content => {
                    content.classList.add('hidden');
                });
                
                document.getElementById(`${letter}-indices`)?.classList.remove('hidden');
                
                // NOUVEAU: Fermer tous les détails quand on change d'onglet
                closeAllDetails();
            });
        });
    }
    
    /**
     * Initialise les sélecteurs de marché
     */
    function initMarketSelector() {
        const nasdaqButton = document.getElementById('market-nasdaq');
        const stoxxButton = document.getElementById('market-stoxx');
        
        nasdaqButton?.addEventListener('click', function() {
            if (currentMarket !== 'nasdaq') {
                // Mettre à jour l'état
                currentMarket = 'nasdaq';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadStocksData(true);
            }
        });
        
        stoxxButton?.addEventListener('click', function() {
            if (currentMarket !== 'stoxx') {
                // Mettre à jour l'état
                currentMarket = 'stoxx';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadStocksData(true);
            }
        });
        
        // Initialiser les onglets du top 10
        const topTabs = document.querySelectorAll('.top-tab-btn');
        if (topTabs) {
            topTabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    // Déterminer si c'est un groupe d'onglets de top global ou marché unique
                    const container = this.closest('.top-stocks-container');
                    if (!container) return;
                    
                    // Sélectionner uniquement les onglets du même groupe
                    const groupTabs = container.querySelectorAll('.top-tab-btn');
                    
                    // Mettre à jour l'état des onglets
                    groupTabs.forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Afficher le contenu correspondant
                    const index = this.getAttribute('data-index');
                    
                    // Si c'est un onglet du top global, utiliser un sélecteur spécifique
                    if (index.startsWith('global-')) {
                        const containers = document.querySelectorAll('#top-global-gainers, #top-global-losers, #top-global-ytd-gainers, #top-global-ytd-losers');
                        containers.forEach(content => {
                            content.classList.add('hidden');
                        });
                    } else {
                        // Pour les tops par marché
                        const containers = container.querySelectorAll('.top-stocks-content');
                        containers.forEach(content => {
                            content.classList.add('hidden');
                        });
                    }
                    
                    document.getElementById(`top-${index}`)?.classList.remove('hidden');
                });
            });
        }
    }
    
    /**
     * Initialise les boutons de pagination
     */
    function initPagination() {
        const prevButton = document.getElementById('prev-page');
        const nextButton = document.getElementById('next-page');
        
        prevButton?.addEventListener('click', function() {
            if (currentPage > 1) {
                currentPage--;
                updatePaginationUI();
                loadStocksData(true);
            }
        });
        
        nextButton?.addEventListener('click', function() {
            if (currentPage < totalPages) {
                currentPage++;
                updatePaginationUI();
                loadStocksData(true);
            }
        });
    }
    
    /**
     * Met à jour l'interface en fonction du marché sélectionné
     */
    function updateMarketUI() {
        // Mettre à jour les boutons de marché
        const nasdaqButton = document.getElementById('market-nasdaq');
        const stoxxButton = document.getElementById('market-stoxx');
        
        if (nasdaqButton && stoxxButton) {
            nasdaqButton.classList.toggle('active', currentMarket === 'nasdaq');
            stoxxButton.classList.toggle('active', currentMarket === 'stoxx');
        }
        
        // Mettre à jour le titre de la page
        const titleElement = document.getElementById('market-title');
        if (titleElement) {
            titleElement.textContent = currentMarket === 'nasdaq' 
                ? 'Actions NASDAQ Composite (États-Unis)' 
                : 'Actions DJ STOXX 600 (Europe)';
        }
        
        // Mettre à jour le lien source
        const sourceLink = document.getElementById('source-link');
        if (sourceLink) {
            const link = currentMarket === 'nasdaq'
                ? 'https://www.boursorama.com/bourse/actions/cotations/international/?international_quotation_az_filter%5Bcountry%5D=1&international_quotation_az_filter%5Bmarket%5D=%24COMPX'
                : 'https://www.boursorama.com/bourse/actions/cotations/international/?international_quotation_az_filter%5Bcountry%5D=EU&international_quotation_az_filter%5Bmarket%5D=2cSXXP';
            
            sourceLink.innerHTML = `Sources: <a href="${link}" target="_blank" class="text-green-400 hover:underline">Boursorama</a>`;
        }
        
        // Afficher/masquer la pagination selon le marché
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) {
            if (currentMarket === 'stoxx') {
                paginationContainer.classList.remove('hidden');
                updatePaginationUI();
            } else {
                paginationContainer.classList.add('hidden');
            }
        }
    }
    
    /**
     * Met à jour l'interface de pagination
     */
    function updatePaginationUI() {
        const currentPageElement = document.getElementById('current-page');
        const totalPagesElement = document.getElementById('total-pages');
        const prevButton = document.getElementById('prev-page');
        const nextButton = document.getElementById('next-page');
        
        if (currentPageElement) {
            currentPageElement.textContent = currentPage.toString();
        }
        
        if (totalPagesElement) {
            totalPagesElement.textContent = totalPages.toString();
        }
        
        if (prevButton) {
            prevButton.disabled = currentPage <= 1;
        }
        
        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }
        
        // Ajouter un log de débogage pour la pagination
        console.log(`Pagination mise à jour: Page ${currentPage}/${totalPages}, buttons: prev=${!prevButton?.disabled}, next=${!nextButton?.disabled}`);
    }
    
    /**
     * Charge les données d'actions depuis le fichier JSON approprié (pour les tops NASDAQ/STOXX)
     */
    async function loadStocksData(forceRefresh = false) {
        // Cette fonction reste pour charger les top performers NASDAQ/STOXX
        // Les données A→Z sont maintenant chargées par loadAZDataForCurrentSelection
        
        try {
            // Charger les top performers spécifiques au marché sélectionné
            const topPerformersUrl = currentMarket === 'nasdaq' 
                ? 'data/top_nasdaq_performers.json' 
                : 'data/top_stoxx_performers.json';
            
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des top performers depuis ${topPerformersUrl}${cacheBuster}`);
            const topResponse = await fetch(`${topPerformersUrl}${cacheBuster}`);
            
            if (topResponse.ok) {
                const topData = await topResponse.json();
                const topPerformers = {
                    daily: topData.daily || {},
                    ytd: topData.ytd || {}
                };
                console.log(`✅ Top performers de ${currentMarket.toUpperCase()} chargés avec succès`);
                
                // Utiliser la fonction améliorée si disponible
                const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                
                if (topPerformers.daily) {
                    topPerformers.daily.best = dedupFunction(topPerformers.daily.best || []);
                    topPerformers.daily.worst = dedupFunction(topPerformers.daily.worst || []);
                    
                    // Filtrer les variations extrêmes
                    topPerformers.daily.best = filterExtremeVariations(topPerformers.daily.best, 'change', true);
                    topPerformers.daily.worst = filterExtremeVariations(topPerformers.daily.worst, 'change', false);
                }
                
                if (topPerformers.ytd) {
                    topPerformers.ytd.best = dedupFunction(topPerformers.ytd.best || []);
                    topPerformers.ytd.worst = dedupFunction(topPerformers.ytd.worst || []);
                    
                    // Filtrer les variations extrêmes
                    topPerformers.ytd.best = filterExtremeVariations(topPerformers.ytd.best, 'ytd', true);
                    topPerformers.ytd.worst = filterExtremeVariations(topPerformers.ytd.worst, 'ytd', false);
                }
                
                // Mettre à jour le top 10 du marché sélectionné
                updateTopTenStocks({
                    top_performers: topPerformers,
                    meta: { timestamp: new Date().toISOString() }
                });
            } else {
                console.warn(`⚠️ Impossible de charger les top performers depuis ${topPerformersUrl}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des top performers:', error);
        }
    }
    
    /**
     * Filtre les variations extrêmes (>=+100% ou <=-100%)
     * @param {Array} stocks 
     * @param {string} field Le champ contenant la variation ('change' ou 'ytd')
     * @param {boolean} isGainer Si true, filtre les hausses extrêmes, sinon les baisses extrêmes
     * @returns {Array} Liste filtrée
     */
    function filterExtremeVariations(stocks, field, isGainer) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        return stocks.filter(stock => {
            const variationValue = parsePercentage(stock[field]);
            
            if (isGainer) {
                // Pour les hausses, exclure les valeurs >= 100%
                return variationValue < 100;
            } else {
                // Pour les baisses, exclure les valeurs <= -100%
                return variationValue > -100;
            }
        });
    }
    
    /**
     * Déduplique les actions en utilisant uniquement le nom
     * @param {Array} stocks 
     * @returns {Array} stocks dédupliqués
     */
    function dedupStocksByName(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Utiliser une Map pour garantir l'unicité par nom
        const uniqueStocks = new Map();
        
        stocks.forEach(stock => {
            // Utiliser uniquement le nom comme clé
            const name = stock.name || "";
            
            // Ne l'ajouter que s'il n'existe pas déjà
            if (!uniqueStocks.has(name)) {
                uniqueStocks.set(name, stock);
            }
        });
        
        // Convertir la Map en tableau et retourner
        return Array.from(uniqueStocks.values());
    }
    
    /**
     * S'assure qu'une liste contient au moins 10 éléments
     * en complétant avec des placeholders si nécessaire
     * @param {Array} stocks 
     * @param {string} market Le marché (nasdaq ou stoxx)
     * @param {boolean} isGainer Si true, tendance positive, sinon négative
     */
    function ensureAtLeastTenItems(stocks, market = 'nasdaq', isGainer = true) {
        // Si la liste a déjà 10 éléments ou plus, ne rien faire
        if (stocks.length >= 10) return;
        
        // Utiliser la fonction améliorée si disponible
        if (window.dedupFix?.generatePlaceholder) {
            const marketName = market.toUpperCase();
            
            // Générer des placeholders pour compléter jusqu'à 10
            const missingCount = 10 - stocks.length;
            for (let i = 0; i < missingCount; i++) {
                stocks.push(window.dedupFix.generatePlaceholder(stocks.length + 1, marketName, isGainer));
            }
            return;
        }
        
        // Fallback - Générer des placeholders pour compléter jusqu'à 10
        const missingCount = 10 - stocks.length;
        for (let i = 0; i < missingCount; i++) {
            stocks.push({
                name: `Stock ${stocks.length + 1}`,
                symbol: "",
                last: "-",
                change: isGainer ? "+0.00%" : "-0.00%",
                open: "-",
                high: "-",
                low: "-",
                ytd: isGainer ? "+0.00%" : "-0.00%",
                volume: "0",
                trend: isGainer ? "neutral" : "neutral",
                market: market.toUpperCase(),
                marketIcon: market === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            });
        }
    }
    
    /**
     * Déduplique les actions en utilisant le nom et le symbole
     */
    function dedupStocks(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Déléguer à la fonction dedupStocksByName
        return dedupStocksByName(stocks);
    }
    
    /**
     * Déduplique les actions de manière plus approfondie en utilisant tous les attributs
     */
    function dedupStocksThoroughly(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Déléguer à la fonction dedupStocksByName
        return dedupStocksByName(stocks);
    }
    
    /**
     * Charge les données pour le Top 10 global
     * PATCH 3: Correction de la variable response -> globalResponse
     */
    async function loadGlobalData() {
        try {
            // MODIFICATION: Toujours charger directement le fichier global_top_performers.json
            console.log("🔍 Chargement des données du top 10 global...");
            const globalResponse = await fetch('data/global_top_performers.json');
            
            if (globalResponse.ok) {
                const globalData = await globalResponse.json(); // FIX: globalResponse au lieu de response
                console.log("✅ Données du top 10 global chargées avec succès");
                
                // Déduplication des données globales
                // Utiliser la fonction améliorée si disponible
                const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                
                if (globalData.daily) {
                    globalData.daily.best = dedupFunction(globalData.daily.best || []);
                    globalData.daily.worst = dedupFunction(globalData.daily.worst || []);
                    
                    // Filtrer les variations extrêmes
                    globalData.daily.best = filterExtremeVariations(globalData.daily.best, 'change', true);
                    globalData.daily.worst = filterExtremeVariations(globalData.daily.worst, 'change', false);
                }
                
                if (globalData.ytd) {
                    globalData.ytd.best = dedupFunction(globalData.ytd.best || []);
                    globalData.ytd.worst = dedupFunction(globalData.ytd.worst || []);
                    
                    // Filtrer les variations extrêmes
                    globalData.ytd.best = filterExtremeVariations(globalData.ytd.best, 'ytd', true);
                    globalData.ytd.worst = filterExtremeVariations(globalData.ytd.worst, 'ytd', false);
                }
                
                updateGlobalTopTen(globalData);
                return;
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données globales:', error);
        }
    }
    
    /**
     * Toggle les détails d'une action - VERSION CORRIGÉE
     * NOUVEAU: N'ouvre QUE sur clic et ferme les autres
     */
    function toggleDetailsRow(button){
      const mainRow = button.closest('tr');
      if (!mainRow) return;

      // 💡 Le détail est TOUJOURS la ligne suivante
      const detailsRow = mainRow.nextElementSibling;
      if (!detailsRow || !detailsRow.classList.contains('details-row')) return;

      const isOpen = !detailsRow.classList.contains('hidden');

      // Fermer tous les autres détails ouverts (sécurité)
      document.querySelectorAll('tr.details-row:not(.hidden)').forEach(r => {
        r.classList.add('hidden');
        const btn = r.previousElementSibling?.querySelector('.details-toggle');
        if (btn){
          btn.setAttribute('aria-expanded','false');
          const ic = btn.querySelector('i');
          if (ic){ ic.classList.add('fa-chevron-down'); ic.classList.remove('fa-chevron-up'); }
        }
      });

      // Basculer celui-ci uniquement si il était fermé
      if (!isOpen){
        detailsRow.classList.remove('hidden');
        button.setAttribute('aria-expanded','true');
        const icon = button.querySelector('i');
        if (icon){ icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
      } else {
        detailsRow.classList.add('hidden');
        button.setAttribute('aria-expanded','false');
        const icon = button.querySelector('i');
        if (icon){ icon.classList.add('fa-chevron-down'); icon.classList.remove('fa-chevron-up'); }
      }
    }
    
    /**
     * Affiche les données d'actions dans l'interface
     */
    function renderStocksData() {
        // v8.0: Wire column header sorting after render
        setTimeout(() => {
            updateTableHeaders();
            const colMap = {'QUALITY':'quality','VALUE':'value','DIV TTM':'div','PE':'pe','VAR %':'var','YTD %':'ytd','1 ANS %':'1y'};
            document.querySelectorAll('.data-table thead th').forEach(th => {
                const key = colMap[th.textContent.trim()];
                if (!key) return;
                th.onclick = () => {
                    if (_sortCol === key) { _sortAsc = !_sortAsc; }
                    else { _sortCol = key; _sortAsc = false; } // Default descending
                    // Update header arrows
                    document.querySelectorAll('.data-table thead th .sort-arrow').forEach(a => a.remove());
                    th.insertAdjacentHTML('beforeend', `<span class="sort-arrow" style="margin-left:4px;font-size:0.6rem;">${_sortAsc ? '▲' : '▼'}</span>`);
                    renderStocksData();
                };
            });
        }, 60);
        
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(stocksData.meta.timestamp);
            
            // Ajuster l'heure pour le fuseau horaire français (UTC+1)
            timestamp.setHours(timestamp.getHours() + 1);
            
            let formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // Ajouter un indicateur si les données sont périmées
            if (stocksData.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Mettre à jour le titre de la page
            document.getElementById('stocks-count').textContent = stocksData.meta.count || 0;
            
            // Générer le HTML pour chaque lettre
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const stocks = stocksData.indices[letter] || [];
                const tableBody = document.getElementById(`${letter}-indices-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas d'actions, afficher un message
                    if (stocks.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="10" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune action disponible pour cette lettre
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Dédupliquer les stocks par nom plutôt que par tous les attributs
                        const uniqueStocks = dedupStocksByName(stocks);
                        
                        // v8.0: Sort by selected column or alphabetical
                        const _getNumeric = (s, col) => {
                            if (col === 'quality') return s.quality_score ?? -1;
                            if (col === 'value') return s.buffett_score ?? -1;
                            if (col === 'pe') return s.pe_ratio != null ? parseFloat(s.pe_ratio) : 9999;
                            if (col === 'div') {
                                const v = parseFloat(String(s.dividend_yield_ttm||s.dividend_yield||'0').replace(',','.').replace('%','').replace('+',''));
                                return isNaN(v) ? -1 : v;
                            }
                            if (col === 'var') return parseFloat(String(s.change||'0').replace(',','.').replace('%','').replace('+','')) || 0;
                            if (col === 'ytd') return parseFloat(String(s.ytd||'0').replace(',','.').replace('%','').replace('+','')) || 0;
                            if (col === '1y') return parseFloat(String(s.perf_1y||'0').replace(',','.').replace('%','').replace('+','')) || 0;
                            return 0;
                        };
                        const sortedStocks = [...uniqueStocks].sort((a, b) => {
                            if (!_sortCol) return (a.name || "").localeCompare(b.name || "");
                            const va = _getNumeric(a, _sortCol), vb = _getNumeric(b, _sortCol);
                            return _sortAsc ? va - vb : vb - va;
                        });
                        
                        // Remplir avec les données
                        sortedStocks.forEach(stock => {
                            const stockKey = `${stock.name||''}|${stock.ticker||''}`;
                            
                            // Ligne principale avec colonnes directement visibles
                            const row = document.createElement('tr');
                            row.setAttribute('data-region', stock.region);
                            row.setAttribute('data-country', stock.country || '');
                            row.setAttribute('data-sector', stock.sector || '');
                            row.className = 'border-b border-white/5 hover:bg-white/5 transition-colors';
                            
                            const changeClass = stock.change && stock.change.includes('-') ? 'negative' : 'positive';
                            const ytdClass = stock.ytd && stock.ytd.includes('-') ? 'negative' : 'positive';
                            const perf1yClass = stock.perf_1y && stock.perf_1y.includes('-') ? 'negative' : 'positive';
                            
                            // v8.0: Quality + Value grades + PE replacing Vol 3Y + Volume
                            const _qGrade = stock.quality_grade || '–';
                            const _qScore = stock.quality_score != null ? Math.round(stock.quality_score) : null;
                            const _vGrade = stock.buffett_grade || '–';
                            const _vScore = stock.buffett_score != null ? Math.round(stock.buffett_score) : null;
                            const _pe = stock.pe_ratio != null ? parseFloat(stock.pe_ratio).toFixed(1) : '–';
                            const _gradeColor = (g) => g === 'A' ? '#4caf50' : g === 'B' ? '#2196f3' : g === 'C' ? '#ff9800' : g === 'D' ? '#f44336' : 'rgba(255,255,255,0.3)';
                            const _gradeBg = (g) => g === 'A' ? 'rgba(76,175,80,0.15)' : g === 'B' ? 'rgba(33,150,243,0.15)' : g === 'C' ? 'rgba(255,152,0,0.15)' : g === 'D' ? 'rgba(244,67,54,0.15)' : 'rgba(255,255,255,0.05)';

                            // v8.1: Star button (watchlist)
                            const _starred = StockUserPrefs.isInWatchlist(stock.ticker);
                            const _starHTML = `<button onclick="event.stopPropagation();toggleStarFor('${stock.ticker}',this)"
                                style="background:none;border:none;cursor:pointer;padding:0 6px 0 0;color:${_starred ? '#ffd700' : 'rgba(255,255,255,0.25)'};font-size:0.75rem;"
                                title="${_starred ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                                <i class="${_starred ? 'fas' : 'far'} fa-star"></i>
                            </button>`;

                            // v8.3: Compare checkbox — store stock in global map for retrieval
                            window._stockMap = window._stockMap || {};
                            window._stockMap[stock.ticker] = stock;
                            const _checked = StockComparator.isSelected(stock.ticker);
                            const _checkboxHTML = `<input type="checkbox" class="compare-checkbox"
                                data-ticker="${stock.ticker}"
                                ${_checked ? 'checked' : ''}
                                onclick="event.stopPropagation();toggleCompareFor(this,'${stock.ticker}')"
                                title="Ajouter au comparateur"
                                style="margin-right:8px;cursor:pointer;accent-color:#00FF87;">`;

                            row.innerHTML = `
                                <td class="py-2 px-3">
                                    <div class="font-medium" style="display:flex;align-items:center;">${_checkboxHTML}${_starHTML}<span>${stock.name || '-'}</span> ${stock.marketIcon}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span class="px-2 py-0.5 rounded border border-white/10 mr-1 ${stock.regionBadgeClass}">${stock.region || 'GLOBAL'}</span>
                                        ${stock.country || ''}
                                        ${stock.exchange ? `<span class="ml-1 px-2 py-0.5 rounded border border-white/10">${stock.exchange}</span>` : ''}
                                    </div>
                                </td>
                                <td class="text-right">${stock.last || '-'}</td>
                                <td class="text-right ${changeClass}">${stock.change || '-'}</td>
                                <td class="text-right ${ytdClass}">${stock.ytd || '-'}</td>
                                <td class="text-right ${perf1yClass}">${stock.perf_1y || '-'}</td>
                                <td class="text-center" title="${_qScore != null ? 'Quality Score: ' + _qScore + '/100' : ''}">
                                    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.8rem;
                                        background:${_gradeBg(_qGrade)};color:${_gradeColor(_qGrade)};">${_qGrade}</span>
                                </td>
                                <td class="text-center" title="${_vScore != null ? 'Value Score: ' + _vScore + '/100' : ''}">
                                    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.8rem;
                                        background:${_gradeBg(_vGrade)};color:${_gradeColor(_vGrade)};">${_vGrade}</span>
                                </td>
                                <td class="text-right">${stock.dividend_yield_ttm || stock.dividend_yield || '-'}</td>
                                <td class="text-right">${_pe}</td>
                                <td class="text-center">
                                  <button type="button" onclick="toggleDetailsRow(this)"
                                          class="action-button details-toggle"
                                          aria-expanded="false" data-key="${stockKey}">
                                    <i class="fas fa-chevron-down" aria-hidden="true"></i>
                                  </button>
                                </td>
                            `;
                            
                            // Ligne de détails (cachée par défaut) - MODIFIÉ: Labels changés
                            const detailsRow = document.createElement('tr');
                            detailsRow.className = 'details-row hidden';
                            detailsRow.setAttribute('data-for', stockKey);
                            // v8.0: Enriched detail panel with Value Grade criteria + Quality subscores
                            const _qs = stock.quality_subscores || {};
                            const _bc = stock.buffett_criteria || [];
                            const _subBar = (label, val) => {
                                const v = val != null ? Math.round(val) : 0;
                                return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
                                    <span style="width:65px;font-size:0.65rem;opacity:0.6;">${label}</span>
                                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
                                        <div style="width:${v}%;height:100%;background:${v >= 70 ? '#4caf50' : v >= 40 ? '#ff9800' : '#f44336'};border-radius:3px;"></div>
                                    </div>
                                    <span style="font-size:0.65rem;font-family:monospace;width:28px;text-align:right;opacity:0.7;">${v}%</span>
                                </div>`;
                            };
                            const _checkIcon = (pass) => pass ? '<span style="color:#4caf50;">✓</span>' : '<span style="color:#f44336;">✗</span>';
                            const _criteriaNames = {
                                roe_consistent: 'ROE consistant',
                                roic_moat: 'ROIC moat',
                                leverage_safe: 'Levier safe',
                                cash_generation: 'Cash generation',
                                valuation_ok: 'Valorisation',
                                moat_expansion: 'Moat expansion'
                            };
                            const _epsS = stock.eps_surprise_avg_2q != null ? parseFloat(stock.eps_surprise_avg_2q).toFixed(1) : null;
                            const _epsBeat = stock.eps_beat_streak || 0;
                            const _beta = stock.beta != null ? parseFloat(stock.beta).toFixed(2) : null;
                            const _roe = stock.roe != null ? parseFloat(stock.roe).toFixed(1) : null;
                            const _de = stock.de_ratio != null ? parseFloat(stock.de_ratio).toFixed(2) : null;
                            const _fcfy = stock.fcf_yield != null ? parseFloat(stock.fcf_yield).toFixed(1) : null;

                            detailsRow.innerHTML = `
                                <td colspan="10" style="background:rgba(0,255,135,0.02); border-top: 1px solid var(--card-border);">
                                    <div class="grid md:grid-cols-3 gap-6 p-4">
                                        <div>
                                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Informations</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">Ticker:</span> <strong>${stock.ticker||'–'}</strong></div>
                                                <div><span class="opacity-60">Secteur:</span> ${stock.sector||'–'}</div>
                                                <div><span class="opacity-60">Source:</span> ${stock.data_exchange||'–'}</div>
                                                <div><span class="opacity-60">Cap. Marché:</span> ${stock.market_cap||'–'}</div>
                                            </div>
                                            <div class="text-xs opacity-60 mb-2 mt-4 uppercase tracking-wider">Performances</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">1 mois:</span> <span class="${stock.perf_1m && stock.perf_1m.includes('-') ? 'negative' : 'positive'}">${stock.perf_1m||'–'}</span></div>
                                                <div><span class="opacity-60">3 mois:</span> <span class="${stock.perf_3m && stock.perf_3m.includes('-') ? 'negative' : 'positive'}">${stock.perf_3m||'–'}</span></div>
                                                <div><span class="opacity-60">1 an:</span> <span class="${perf1yClass}">${stock.perf_1y||'–'}</span></div>
                                                <div><span class="opacity-60">YTD:</span> <span class="${ytdClass}">${stock.ytd||'–'}</span></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Quality Score ${_qScore != null ? `<span style="color:${_gradeColor(_qGrade)};font-weight:700;">${_qGrade} (${_qScore})</span>` : ''}</div>
                                            ${_subBar('Quality', _qs.quality)}
                                            ${_subBar('Safety', _qs.safety)}
                                            ${_subBar('Value', _qs.value)}
                                            ${_subBar('Growth', _qs.growth)}
                                            ${_subBar('Momentum', _qs.momentum)}
                                            <div class="text-xs opacity-60 mb-2 mt-4 uppercase tracking-wider">Value Grade ${_vScore != null ? `<span style="color:${_gradeColor(_vGrade)};font-weight:700;">${_vGrade} (${_vScore})</span>` : ''}</div>
                                            <div class="space-y-1 text-sm">
                                                ${_bc.length > 0 ? _bc.map(c => `<div>${_checkIcon(c.pass)} <span class="opacity-70">${_criteriaNames[c.name] || c.name}</span></div>`).join('') : '<div class="opacity-40">Données non disponibles</div>'}
                                            </div>
                                        </div>
                                        <div>
                                            <div class="text-xs opacity-60 mb-2 uppercase tracking-wider">Fondamentaux</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">PE Ratio:</span> ${_pe}</div>
                                                <div><span class="opacity-60">ROE:</span> ${_roe != null ? _roe + '%' : '–'}</div>
                                                <div><span class="opacity-60">D/E Ratio:</span> ${_de || '–'}</div>
                                                <div><span class="opacity-60">FCF Yield:</span> ${_fcfy != null ? _fcfy + '%' : '–'}</div>
                                                <div><span class="opacity-60">Div TTM:</span> ${stock.dividend_yield_ttm || stock.dividend_yield || '–'}</div>
                                                <div><span class="opacity-60">Payout:</span> <span class="${stock.payout_class}">${stock.payout_ratio || '–'}</span></div>
                                            </div>
                                            <div class="text-xs opacity-60 mb-2 mt-4 uppercase tracking-wider">Risque</div>
                                            <div class="space-y-1 text-sm">
                                                <div><span class="opacity-60">Beta:</span> ${_beta || '–'}</div>
                                                <div><span class="opacity-60">Volatilité 3Y:</span> ${stock.volatility_3y || '–'}</div>
                                                <div><span class="opacity-60">Drawdown max 3Y:</span> <span class="negative">${stock.max_drawdown_3y || '–'}</span></div>
                                                ${_epsS != null ? `<div><span class="opacity-60">EPS Surprise:</span> <span class="${parseFloat(_epsS) >= 0 ? 'positive' : 'negative'}">${_epsS}%</span>${_epsBeat > 1 ? ` <span style="font-size:0.7rem;opacity:0.5;">(${_epsBeat} beats)</span>` : ''}</div>` : ''}
                                                <div><span class="opacity-60">52 semaines:</span> ${stock.range_52w || '–'}</div>
                                                <div><span class="opacity-60">Volume:</span> ${stock.volume || '–'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            `;
                            
                            tableBody.appendChild(row);
                            tableBody.appendChild(detailsRow);
                        });
                    }
                }
            });
            
            // Mettre à jour les top performers
            if (stocksData.top_performers) {
                updateTopPerformers(stocksData.top_performers);
            }
            
            // Masquer le loader et afficher les données
            hideElement('indices-loading');
            hideElement('indices-error');
            showElement('indices-container');
            
            // NOUVEAU: Toujours fermer les détails après (re)rendu
            document.querySelectorAll('tr.details-row').forEach(r => r.classList.add('hidden'));
            document.querySelectorAll('.details-toggle').forEach(b => b.setAttribute('aria-expanded','false'));

            // exposer la fonction
            window.toggleDetailsRow = toggleDetailsRow;
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('indices-loading');
            showElement('indices-error');
        }
    }
    
    /**
     * Met à jour le top 10 des actions
     * MODIFIÉ: Passe trend aux appels renderTopTenCards
     */
    function updateTopTenStocks(data) {
        // Vérifier d'abord si les données et top_performers existent
        if (!data || !data.top_performers) {
            console.error("❌ Données top performers manquantes");
            return;
        }
        
        const topPerformers = data.top_performers;
        
        // Mise à jour du top 10 Hausse quotidienne
        if (topPerformers.daily && topPerformers.daily.best) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBest = dedupFunction(topPerformers.daily.best).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredBest = filterExtremeVariations(uniqueBest, 'change', true);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredBest.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, true);
            
            renderTopTenCards('top-daily-gainers', displayStocks, 'change', currentMarket, {trend: 'up'});
        }
        
        // Mise à jour du top 10 Baisse quotidienne
        if (topPerformers.daily && topPerformers.daily.worst) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueWorst = dedupFunction(topPerformers.daily.worst).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredWorst = filterExtremeVariations(uniqueWorst, 'change', false);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredWorst.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, false);
            
            renderTopTenCards('top-daily-losers', displayStocks, 'change', currentMarket, {trend: 'down'});
        }
        
        // Mise à jour du top 10 Hausse YTD
        if (topPerformers.ytd && topPerformers.ytd.best) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBestYtd = dedupFunction(topPerformers.ytd.best).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredBestYtd = filterExtremeVariations(uniqueBestYtd, 'ytd', true);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredBestYtd.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, true);
            
            renderTopTenCards('top-ytd-gainers', displayStocks, 'ytd', currentMarket, {trend: 'up'});
        }
        
        // Mise à jour du top 10 Baisse YTD
        if (topPerformers.ytd && topPerformers.ytd.worst) {
            // Déduplication par nom et ajout des attributs de marché
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueWorstYtd = dedupFunction(topPerformers.ytd.worst).map(stock => ({
                ...stock,
                market: currentMarket.toUpperCase(),
                marketIcon: currentMarket === 'nasdaq' 
                    ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                    : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            // Filtrer les variations extrêmes
            const filteredWorstYtd = filterExtremeVariations(uniqueWorstYtd, 'ytd', false);
            
            // S'assurer d'avoir 10 éléments
            const displayStocks = filteredWorstYtd.slice(0, 10);
            ensureAtLeastTenItems(displayStocks, currentMarket, false);
            
            renderTopTenCards('top-ytd-losers', displayStocks, 'ytd', currentMarket, {trend: 'down'});
        }
    }
    
    /**
     * Met à jour le top 10 global directement à partir des données pré-combinées
     * MODIFIÉ: Passe trend aux appels renderTopTenCards
     */
    function updateGlobalTopTen(globalData = null) {
        // Si nous avons des données globales pré-combinées, les utiliser directement
        if (globalData && globalData.daily && globalData.ytd) {
            console.log("✅ Utilisation des données globales pré-combinées");
            
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            
            if (globalData.daily && globalData.daily.best) {
                const uniqueGainers = dedupFunction(globalData.daily.best);
                // Filtrer les variations extrêmes
                const filteredGainers = filterExtremeVariations(uniqueGainers, 'change', true);
                renderTopTenCards('top-global-gainers', filteredGainers, 'change', 'global', {trend: 'up'});
            }
            
            if (globalData.daily && globalData.daily.worst) {
                const uniqueLosers = dedupFunction(globalData.daily.worst);
                // Filtrer les variations extrêmes
                const filteredLosers = filterExtremeVariations(uniqueLosers, 'change', false);
                renderTopTenCards('top-global-losers', filteredLosers, 'change', 'global', {trend: 'down'});
            }
            
            if (globalData.ytd && globalData.ytd.best) {
                const uniqueYtdGainers = dedupFunction(globalData.ytd.best);
                // Filtrer les variations extrêmes
                const filteredYtdGainers = filterExtremeVariations(uniqueYtdGainers, 'ytd', true);
                renderTopTenCards('top-global-ytd-gainers', filteredYtdGainers, 'ytd', 'global', {trend: 'up'});
            }
            
            if (globalData.ytd && globalData.ytd.worst) {
                const uniqueYtdLosers = dedupFunction(globalData.ytd.worst);
                // Filtrer les variations extrêmes
                const filteredYtdLosers = filterExtremeVariations(uniqueYtdLosers, 'ytd', false);
                renderTopTenCards('top-global-ytd-losers', filteredYtdLosers, 'ytd', 'global', {trend: 'down'});
            }
            
            return;
        }
    }
    
    /**
     * Convertit le volume en nombre pour le tri
     */
    function parseVolumeToNumber(volumeStr) {
        if (!volumeStr || volumeStr === '-') return 0;
        
        // Supprimer les espaces, les points et les virgules pour normaliser
        const cleanedStr = volumeStr.replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '');
        
        // Extraire les chiffres
        const matches = cleanedStr.match(/(\d+)/);
        if (matches && matches[1]) {
            return parseInt(matches[1], 10);
        }
        
        return 0;
    }
    
    /**
     * Parse percentage strings like "+4.25%" to number 4.25
     */
    function parsePercentage(value) {
        if (!value || value === '-') return 0;
        const str = String(value).replace(/[+%\s]/g, '').replace(',', '.');
        return parseFloat(str) || 0;
    }
    
    /**
     * Fonction améliorée pour afficher les cartes du top 10 avec un meilleur design
     * MODIFIÉ: Accepte opts pour gérer le trend (up/down) et forcer le signe/couleur
     */
    function renderTopTenCards(target, stocks, valueField, marketSource, opts = {}) {
        // target peut être un ID ou un Element
        let root = null;
        if (typeof target === 'string') {
            root = document.getElementById(target) || document.querySelector(target);
        } else {
            root = target;
        }
        if (!root) return;
        
        // Si on a un wrapper, prendre son .stock-cards-container ; sinon utiliser root
        let container = root.querySelector?.('.stock-cards-container') || root;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!stocks || stocks.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Assurer la déduplication absolue des stocks par nom
        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
        const uniqueStocks = dedupFunction(stocks);
        
        // Créer les cartes pour chaque action (jusqu'à 10)
        const displayStocks = uniqueStocks.slice(0, 10);
        
        // Assurer qu'il y a 10 éléments
        ensureAtLeastTenItems(displayStocks, marketSource === 'global' ? 'mixed' : marketSource, valueField === 'ytd' || valueField === 'perf_ytd');
        
        displayStocks.forEach((stock, index) => {
            // Déterminer le signe et la classe pour la valeur
            let value = stock[valueField] || stock.change || stock.ytd || '-';
            // Gérer les deux formats de champ
            if (valueField === 'change_percent' && !stock.change_percent && stock.change) {
                value = stock.change;
            }
            if (valueField === 'perf_ytd' && !stock.perf_ytd && stock.ytd) {
                value = stock.ytd;
            }
            
            // Convertir en string si c'est un nombre
            let text = typeof value === 'number' ? value.toFixed(2) + '%' : String(value);
            
            // Déterminer la classe de couleur
            let valueClass = /-/.test(text) ? 'negative' : 'positive';
            
            // NOUVEAU: Forcer le signe/couleur selon le filtre (up/down)
            if (opts.trend === 'down' && !/-/.test(text)) {
                // Si on affiche des baisses mais que la valeur n'a pas de signe négatif
                valueClass = 'negative';
                text = text.replace(/^\+?/, '-'); // Forcer le signe -
            } else if (opts.trend === 'up' && /^-/.test(text)) {
                // Si on affiche des hausses mais que la valeur a un signe négatif
                valueClass = 'positive';
                text = text.replace(/^-/, '+'); // Forcer le signe +
            } else if (opts.trend === 'up' && !text.startsWith('+') && !text.startsWith('-') && text !== '-') {
                // Ajouter le + si manquant pour les hausses
                text = '+' + text;
            }
            
            // Déterminer l'icône du marché et tag d'exchange pour l'Asie
            let marketIcon = stock.marketIcon || '';
            const exTag = stock.exchange && ['HK', 'TW', 'KR', 'IN', 'JP', 'SG'].includes(stock.exchange) 
                ? `<span class="ml-1 text-xs opacity-60">${stock.exchange}</span>` 
                : '';
            
            // Ajouter une animation subtile pour les 3 premiers
            let specialClass = '';
            let glowEffect = '';
            
            if (index < 3) {
                specialClass = 'top-performer';
                glowEffect = index === 0 ? 'glow-gold' : index === 1 ? 'glow-silver' : 'glow-bronze';
            }
            
            // Personnaliser le design en fonction du rang
            let rankStyle = '';
            let rankBg = '';
            
            if (index === 0) {
                rankBg = 'bg-amber-500'; // Or
                rankStyle = 'text-white';
            } else if (index === 1) {
                rankBg = 'bg-gray-300'; // Argent
                rankStyle = 'text-gray-800';
            } else if (index === 2) {
                rankBg = 'bg-amber-700'; // Bronze
                rankStyle = 'text-white';
            }
            
            // Créer la carte
            const card = document.createElement('div');
            card.className = 'stock-card';
            
            // Utiliser ticker si disponible, sinon symbole extrait du nom
            const ticker = stock.ticker || stock.symbol || stock.name?.split(' ')[0] || '-';
            
            card.innerHTML = `
                <div class="rank ${rankBg} ${rankStyle} ${glowEffect}">#${index + 1}</div>
                <div class="stock-info ${specialClass}">
                    <div class="stock-name">${ticker} ${marketIcon} ${exTag}</div>
                    <div class="stock-fullname" title="${stock.name || ''}">${stock.name || '-'}</div>
                </div>
                <div class="stock-performance ${valueClass}">
                    ${text}
                    ${index < 3 ? '<div class="trend-arrow"></div>' : ''}
                </div>
            `;
            
            container.appendChild(card);
        });
    }
    
    /**
     * Met à jour les top performers
     */
    function updateTopPerformers(topPerformersData) {
        if (!topPerformersData) return;
        
        // Mettre à jour les top/bottom performers journaliers
        if (topPerformersData.daily) {
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBest = dedupFunction(topPerformersData.daily.best || []);
            const uniqueWorst = dedupFunction(topPerformersData.daily.worst || []);
            
            // Filtrer les variations extrêmes
            const filteredBest = filterExtremeVariations(uniqueBest, 'change', true);
            const filteredWorst = filterExtremeVariations(uniqueWorst, 'change', false);
            
            updateTopPerformersHTML('daily-top', filteredBest, 'change');
            updateTopPerformersHTML('daily-bottom', filteredWorst, 'change');
        }
        
        // Mettre à jour les top/bottom performers YTD
        if (topPerformersData.ytd) {
            const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
            const uniqueBestYtd = dedupFunction(topPerformersData.ytd.best || []);
            const uniqueWorstYtd = dedupFunction(topPerformersData.ytd.worst || []);
            
            // Filtrer les variations extrêmes
            const filteredBestYtd = filterExtremeVariations(uniqueBestYtd, 'ytd', true);
            const filteredWorstYtd = filterExtremeVariations(uniqueWorstYtd, 'ytd', false);
            
            updateTopPerformersHTML('ytd-top', filteredBestYtd, 'ytd');
            updateTopPerformersHTML('ytd-bottom', filteredWorstYtd, 'ytd');
        }
    }
    
    /**
     * Met à jour le HTML pour une section de top performers
     */
    function updateTopPerformersHTML(containerId, stocks, valueField) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!stocks || stocks.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Déduplication absolue des stocks par nom
        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
        const uniqueStocks = dedupFunction(stocks);
        
        // Générer le HTML pour chaque action
        uniqueStocks.forEach((stock, i) => {
            const row = document.createElement('div');
            row.className = 'performer-row';
            
            const valueClass = (stock[valueField] || "").includes('-') ? 'negative' : 'positive';
            
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${stock.name || ""}</div>
                    <div class="performer-country">${stock.symbol || ""}</div>
                </div>
                <div class="performer-value ${valueClass}">
                    ${stock[valueField] || "-"}
                </div>
            `;
            
            container.appendChild(row);
        });
    }

    /**
     * Initialise la fonctionnalité de recherche
     * v1.3: Utilise la fonction globale closeAllDetails et corrige showAllStocks et clearSearch
     */
    function initSearchFunctionality() {
        // Éléments du DOM
        const searchInput = document.getElementById('stock-search');
        const clearButton = document.getElementById('clear-search');
        const searchInfo = document.getElementById('search-info');
        const searchCount = document.getElementById('search-count');
        const alphabetTabs = document.querySelectorAll('.region-tab');
        
        if (!searchInput || !clearButton) return;
        
        // Ajouter un onglet "Tous" au début des filtres alphabétiques si nécessaire
        const tabsContainer = document.querySelector('.region-tabs');
        if (tabsContainer && !document.querySelector('.region-tab[data-region="all"]')) {
            const allTab = document.createElement('div');
            allTab.className = 'region-tab all-results';
            allTab.setAttribute('data-region', 'all');
            allTab.textContent = 'TOUS';
            
            // Insérer au début
            tabsContainer.insertBefore(allTab, tabsContainer.firstChild);
            
            // Ajouter l'événement de clic
            allTab.addEventListener('click', function() {
                // Réinitialiser la recherche si active
                if (searchInput.value.trim() !== '') {
                    searchInput.value = '';
                    clearSearch();
                }
                
                // Mettre à jour les onglets actifs
                alphabetTabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher toutes les actions (en respectant la pagination)
                showAllStocks();
            });
        }
        
        // Fonction pour montrer toutes les actions (si possible)
        // MODIFIÉ: Ne réaffiche que les lignes principales
        function showAllStocks() {
            // Si la pagination est active (STOXX), on ne peut pas tout montrer
            if (currentMarket === 'stoxx') {
                // Afficher une notification
                showNotification('La vue "TOUS" n\'est pas disponible pour ce marché en raison de la pagination.', 'warning');
                return;
            }
            
            // NOUVEAU: Fermer tous les détails d'abord
            closeAllDetails();
            
            // Afficher toutes les régions
            const regionContents = document.querySelectorAll('.region-content');
            regionContents.forEach(content => {
                content.classList.remove('hidden');
            });
            
            // MODIFIÉ: Ne rendre visibles que les lignes principales (pas les details-row)
            document.querySelectorAll('table tbody tr:not(.details-row)').forEach(row => {
                row.classList.remove('hidden', 'search-highlight');
                row.style.display = '';
            });
        }
        
        // Recherche en temps réel
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            
            // Afficher/masquer le bouton d'effacement
            clearButton.style.opacity = searchTerm ? '1' : '0';
            
            // Effectuer la recherche
            if (searchTerm) {
                performSearch(searchTerm);
            } else {
                clearSearch();
            }
        });
        
        // Effacer la recherche
        clearButton.addEventListener('click', function() {
            searchInput.value = '';
            searchInput.focus();
            clearSearch();
        });
        
        // Fonction pour effectuer la recherche
        function performSearch(searchTerm) {
            // Utiliser la fonction globale closeAllDetails
            closeAllDetails();
            
            let totalResults = 0;
            let foundInRegions = new Set();
            
            // Sélectionner l'onglet "Tous" si présent
            const allTab = document.querySelector('.region-tab[data-region="all"]');
            if (allTab) {
                alphabetTabs.forEach(tab => tab.classList.remove('active'));
                allTab.classList.add('active');
            }
            
            // Parcourir toutes les régions et rechercher dans chaque tableau
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const tableBody = document.getElementById(`${letter}-indices-body`);
                if (!tableBody) return;
                
                let regionResults = 0;
                const rows = tableBody.querySelectorAll('tr:not(.details-row)');
                
                rows.forEach(row => {
                    // Ne pas rechercher dans les lignes vides ou messages
                    if (row.cells.length <= 1) return;
                    
                    const stockName = row.cells[0].textContent.toLowerCase();
                    
                    // Gérer la ligne de détails associée
                    const detailsRow = row.nextElementSibling;
                    const detailsBtn = row.querySelector('.details-toggle');
                    
                    if (stockName.includes(searchTerm)) {
                        // Marquer cette ligne comme résultat de recherche
                        row.classList.add('search-highlight');
                        row.classList.remove('hidden');
                        row.style.display = '';
                        regionResults++;
                        totalResults++;
                        foundInRegions.add(letter);
                        
                        // Garder les détails fermés par défaut
                        if (detailsRow && detailsRow.classList.contains('details-row')) {
                            detailsRow.classList.add('hidden');
                            if (detailsBtn) {
                                detailsBtn.setAttribute('aria-expanded','false');
                                const ic = detailsBtn.querySelector('i');
                                if (ic) { ic.classList.add('fa-chevron-down'); ic.classList.remove('fa-chevron-up'); }
                            }
                        }
                    } else {
                        // Masquer cette ligne ET ses détails
                        row.classList.remove('search-highlight');
                        row.classList.add('hidden');
                        row.style.display = 'none';
                        
                        // Masquer aussi la ligne de détails
                        if (detailsRow && detailsRow.classList.contains('details-row')) {
                            detailsRow.classList.add('hidden');
                        }
                        if (detailsBtn) {
                            detailsBtn.setAttribute('aria-expanded','false');
                            const ic = detailsBtn.querySelector('i');
                            if (ic) { ic.classList.add('fa-chevron-down'); ic.classList.remove('fa-chevron-up'); }
                        }
                    }
                });
                
                // Si pas de résultats dans cette région, ajouter un message
                if (regionResults === 0 && rows.length > 0) {
                    // Vérifier si un message existe déjà
                    let noResultsRow = tableBody.querySelector('.no-results-row');
                    if (!noResultsRow) {
                        noResultsRow = document.createElement('tr');
                        noResultsRow.className = 'no-results-row';
                        noResultsRow.innerHTML = `
                            <td colspan="9" class="no-results">
                                <i class="fas fa-search mr-2"></i>
                                Aucun résultat pour "${searchTerm}" dans cette section
                            </td>
                        `;
                        tableBody.appendChild(noResultsRow);
                    }
                } else {
                    // Supprimer les messages existants
                    const noResultsRow = tableBody.querySelector('.no-results-row');
                    if (noResultsRow) {
                        noResultsRow.remove();
                    }
                }
                
                // Afficher/masquer les régions en fonction des résultats
                const regionContent = document.getElementById(`${letter}-indices`);
                if (regionContent) {
                    if (regionResults > 0) {
                        regionContent.classList.remove('hidden');
                    } else {
                        regionContent.classList.add('hidden');
                    }
                }
            });
            
            // Mettre à jour le compteur de résultats
            searchCount.textContent = totalResults;
            searchInfo.classList.remove('hidden');
            
            // Actualiser les étiquettes des onglets
            alphabetTabs.forEach(tab => {
                const region = tab.getAttribute('data-region');
                if (region !== 'all') {
                    if (foundInRegions.has(region)) {
                        tab.classList.add('has-results');
                    } else {
                        tab.classList.remove('has-results');
                    }
                }
            });
            
            // Défiler vers le premier résultat si possible
            if (totalResults > 0) {
                const firstResult = document.querySelector('.search-highlight');
                if (firstResult) {
                    setTimeout(() => {
                        firstResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            }
        }
        
        // Fonction pour effacer la recherche
        // MODIFIÉ: Ne réaffiche que les lignes principales
        function clearSearch() {
            // Utiliser la fonction globale closeAllDetails
            closeAllDetails();
            
            // Réinitialiser le compteur
            searchInfo.classList.add('hidden');
            
            // Restaurer la visibilité normal des contenus
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const tableBody = document.getElementById(`${letter}-indices-body`);
                if (!tableBody) return;
                
                // Supprimer les messages de "pas de résultats"
                const noResultsRow = tableBody.querySelector('.no-results-row');
                if (noResultsRow) {
                    noResultsRow.remove();
                }
                
                // MODIFIÉ: Ne remettre en visibilité que les lignes principales
                const rows = tableBody.querySelectorAll('tr:not(.details-row)');
                rows.forEach(row => {
                    row.classList.remove('search-highlight', 'hidden');
                    row.style.display = '';
                });
                
                // S'assurer que les détails restent bien fermés
                tableBody.querySelectorAll('tr.details-row').forEach(dr => {
                    dr.classList.add('hidden');
                    dr.style.display = ''; // reset display sans ouvrir
                });
                tableBody.querySelectorAll('.details-toggle').forEach(btn => {
                    btn.setAttribute('aria-expanded','false');
                    const ic = btn.querySelector('i');
                    if (ic) { ic.classList.add('fa-chevron-down'); ic.classList.remove('fa-chevron-up'); }
                });
            });
            
            // Restaurer l'affichage normal des contenus de région
            // selon l'onglet actif
            const activeTab = document.querySelector('.region-tab.active');
            if (activeTab) {
                const activeRegion = activeTab.getAttribute('data-region');
                
                if (activeRegion === 'all') {
                    // Afficher toutes les régions
                    alphabet.forEach(letter => {
                        const regionContent = document.getElementById(`${letter}-indices`);
                        if (regionContent) {
                            regionContent.classList.remove('hidden');
                        }
                    });
                } else {
                    // Afficher uniquement la région active
                    alphabet.forEach(letter => {
                        const regionContent = document.getElementById(`${letter}-indices`);
                        if (regionContent) {
                            if (letter === activeRegion) {
                                regionContent.classList.remove('hidden');
                            } else {
                                regionContent.classList.add('hidden');
                            }
                        }
                    });
                }
            }
            
            // Enlever les marqueurs d'onglets "has-results"
            document.querySelectorAll('.region-tab.has-results').forEach(t => t.classList.remove('has-results'));
            
            // Masquer le bouton d'effacement
            clearButton.style.opacity = '0';
        }
        
        // Gérer les événements de clic sur les onglets alphabétiques
        alphabetTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Si une recherche est active, l'effacer
                if (searchInput.value.trim() !== '') {
                    searchInput.value = '';
                    clearSearch();
                }
            });
        });
        
        // Support pour la touche Echap pour effacer la recherche
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && searchInput.value.trim() !== '') {
                searchInput.value = '';
                clearSearch();
            }
        });
    }
    
    /**
     * Fonctions utilitaires
     */
    function showElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove('hidden');
        }
    }
    
    function hideElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add('hidden');
        }
    }
    
    function showNotification(message, type = 'info') {
        // Vérifier si une notification existe déjà
        let notification = document.querySelector('.notification-popup');
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'notification-popup';
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.padding = '15px 25px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '1000';
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            notification.style.transition = 'opacity 0.3s, transform 0.3s';
            
            if (type === 'warning') {
                notification.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                notification.style.borderLeft = '3px solid #FFC107';
                notification.style.color = '#FFC107';
            } else {
                notification.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
                notification.style.borderLeft = '3px solid var(--accent-color)';
                notification.style.color = 'var(--text-color)';
            }
            
            notification.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
            
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        
        // Animer la notification
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
            
            // Masquer automatiquement après 4 secondes
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(20px)';
                
                // Supprimer après la transition
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 4000);
        }, 100);
    }
    
    /**
     * Met à jour l'heure du marché
     */
    function updateMarketTime() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;
        
        const marketTimeElement = document.getElementById('marketTime');
        if (marketTimeElement) {
            marketTimeElement.textContent = timeStr;
        }
    }
    
    /**
     * Gestion du mode sombre/clair
     */
    function initTheme() {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const darkIcon = document.getElementById('dark-icon');
        const lightIcon = document.getElementById('light-icon');
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.remove('dark');
            document.body.classList.add('light');
            document.documentElement.classList.remove('dark');
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        } else {
            document.body.classList.add('dark');
            document.body.classList.remove('light');
            document.documentElement.classList.add('dark');
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        }
        
        themeToggleBtn?.addEventListener('click', function() {
            if (document.body.classList.contains('dark')) {
                document.body.classList.remove('dark');
                document.body.classList.add('light');
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
                darkIcon.style.display = 'none';
                lightIcon.style.display = 'block';
            } else {
                document.body.classList.add('dark');
                document.body.classList.remove('light');
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
                darkIcon.style.display = 'block';
                lightIcon.style.display = 'none';
            }
        });
    }
});