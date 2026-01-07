/**
 * marches-script.js - Version compatible Twelve Data avec corrections majeures
 * Les données sont mises à jour régulièrement par GitHub Actions
 * 
 * v4 - AJOUT: Support 52W (performance 52 semaines glissantes)
 * v3 - AJOUT: Colonne Composition avec modal holdings (comme secteurs)
 * v2 - FIX: Correction des sélecteurs CSS pour l'aperçu des marchés
 */

document.addEventListener('DOMContentLoaded', function() {
    // Variables globales pour stocker les données
    let indicesData = {
        indices: {
            europe: [],
            "north-america": [],
            "latin-america": [],
            asia: [],
            other: []
        },
        meta: {
            source: 'Twelve Data',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Cache pour les holdings ETF
    let etfHoldingsData = null;
    let holdingsLoadPromise = null;
    
    // Mapping des aliases pour l'aperçu des marchés (ETF → Indices)
    // Utilisé pour trouver les indices dans les données JSON
    const OVERVIEW_ALIASES = {
        'europe': {
            'germany':     [/Germany/i, /Allemagne/i, /DAX/i, /EWG/i],
            'france':      [/France/i, /CAC/i, /EWQ/i],
            'uk':          [/United Kingdom/i, /Royaume/i, /FTSE/i, /EWU/i],
            'switzerland': [/Switzerland/i, /Suisse/i, /EWL/i],
            'europe':      [/Europe ETF/i, /VGK/i, /Vanguard FTSE Europe/i],
            'spain':       [/Spain/i, /Espagne/i, /EWP/i],
            'italy':       [/Italy/i, /Italie/i, /EWI/i],
        },
        'north-america': {
            'sp500':    [/S&P\s*500/i, /SPY/i, /SPDR S&P/i],
            'dowjones': [/Dow\s*Jones/i, /DIA/i, /SPDR Dow/i],
            'nasdaq':   [/NASDAQ/i, /QQQ/i, /Invesco QQQ/i],
            'canada':   [/Canada/i, /EWC/i],
            'vix':      [/VIX/i, /Volatility/i, /VXX/i],
        },
        'latin-america': {
            'brazil':    [/Brazil/i, /Brésil/i, /EWZ/i],
            'mexico':    [/Mexico/i, /Mexique/i, /EWW/i],
            'chile':     [/Chile/i, /Chili/i, /ECH/i],
            'argentina': [/Argentina/i, /Argentine/i, /ARGT/i, /MERVAL/i],
        },
        'asia': {
            'china':     [/China/i, /Chine/i, /FXI/i, /MCHI/i],
            'japan':     [/Japan/i, /Japon/i, /EWJ/i, /NIKKEI/i],
            'india':     [/India/i, /Inde/i, /INDA/i, /SENSEX/i],
            'taiwan':    [/Taiwan/i, /Taïwan/i, /EWT/i],
            'hongkong':  [/Hong Kong/i, /EWH/i, /HANG SENG/i],
            'korea':     [/Korea/i, /Corée/i, /EWY/i],
        },
        'other': {
            'southafrica': [/South\s*Africa/i, /Afrique du Sud/i, /EZA/i],
            'australia':   [/Australia/i, /Australie/i, /EWA/i],
            'israel':      [/Israel/i, /Israël/i, /EIS/i],
            'turkey':      [/Turkey/i, /Turquie/i, /TUR/i],
        }
    };
    
    // Mapping de normalisation des pays - ÉTENDU
    const COUNTRY_NORMALIZATION = {
        // Amérique Latine
        'Mexico': 'Mexique',
        'Mexique': 'Mexique',
        'Chilie': 'Chili',
        'Chile': 'Chili',
        'Chili': 'Chili',
        'Brazil': 'Brésil',
        'Brésil': 'Brésil',
        'Argentina': 'Argentine',
        'Argentine': 'Argentine',
        
        // Amérique du Nord
        'Etats-Unis': 'États-Unis',
        'United States': 'États-Unis',
        'États-Unis': 'États-Unis',
        'Canada': 'Canada',
        
        // Europe
        'France': 'France',
        'Germany': 'Allemagne',
        'Allemagne': 'Allemagne',
        'Italy': 'Italie',
        'Italie': 'Italie',
        'Spain': 'Espagne',
        'Espagne': 'Espagne',
        'Netherlands': 'Pays-Bas',
        'Pays-Bas': 'Pays-Bas',
        'Switzerland': 'Suisse',
        'Suisse': 'Suisse',
        'Sweden': 'Suède',
        'Suède': 'Suède',
        'Royaume Uni': 'Royaume-Uni',
        'United Kingdom': 'Royaume-Uni',
        'Royaume-Uni': 'Royaume-Uni',
        'Zone Euro': 'Zone Euro',
        'Europe': 'Europe',
        
        // Asie
        'Japan': 'Japon',
        'Japon': 'Japon',
        'China': 'Chine',
        'Chine': 'Chine',
        'India': 'Inde',
        'Inde': 'Inde',
        'Taiwan': 'Taïwan',
        'Taïwan': 'Taïwan',
        'Hong Kong': 'Hong Kong',
        'Singapore': 'Singapour',
        'Singapour': 'Singapour',
        'South Korea': 'Corée du Sud',
        'Corée du Sud': 'Corée du Sud',
        'Asie': 'Asie',
        
        // Autres
        'Saudi Arabia': 'Arabie Saoudite',
        'Arabie Saoudite': 'Arabie Saoudite',
        'South Africa': 'Afrique du Sud',
        'Afrique du Sud': 'Afrique du Sud',
        'Israel': 'Israël',
        'Israël': 'Israël',
        'Turkey': 'Turquie',
        'Turquie': 'Turquie',
        'Australia': 'Australie',
        'Australie': 'Australie'
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // Initialiser les onglets de région
    initRegionTabs();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Ajouter les étiquettes VAR % et YTD
    addDataLabels();
    
    // Premier chargement des données
    loadIndicesData();
    
    // Charger les holdings en arrière-plan
    loadETFHoldings();
    
    // Ajouter les styles CSS pour la modal holdings
    injectHoldingsStyles();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadIndicesData(true);
    });
    
    /**
     * Injecte les styles CSS pour la modal holdings
     */
    function injectHoldingsStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .holdings-modal-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(4px);
                z-index: 9998;
                animation: fadeIn 0.2s ease;
            }
            
            .holdings-modal {
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                width: min(600px, 90vw);
                max-height: 80vh;
                background: linear-gradient(180deg, rgba(15, 40, 65, 0.98) 0%, rgba(10, 25, 45, 0.98) 100%);
                color: #e5e7eb;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
                z-index: 9999;
                animation: modalSlideIn 0.3s ease;
                border: 1px solid rgba(34, 197, 94, 0.2);
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translate(-50%, -40%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }
            
            .holdings-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.2);
                border-radius: 12px 12px 0 0;
            }
            
            .holdings-modal-title {
                font-weight: 600;
                font-size: 1.1rem;
            }
            
            .holdings-close {
                width: 32px;
                height: 32px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: transparent;
                color: rgba(255, 255, 255, 0.7);
                font-size: 1.2rem;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .holdings-close:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.2);
                color: white;
            }
            
            .holdings-modal-body {
                padding: 20px;
                max-height: calc(80vh - 80px);
                overflow-y: auto;
            }
            
            .holdings-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            
            .holding-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                margin-bottom: 8px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.05);
                transition: all 0.2s;
            }
            
            .holding-item:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(34, 197, 94, 0.2);
            }
            
            .holding-info {
                flex: 1;
            }
            
            .holding-name {
                font-weight: 500;
                margin-bottom: 2px;
            }
            
            .holding-symbol {
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.6);
            }
            
            .holding-weight {
                font-weight: 700;
                font-size: 1.1rem;
                color: var(--accent-color);
                min-width: 60px;
                text-align: right;
            }
            
            .holdings-meta {
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.5);
                display: flex;
                justify-content: space-between;
            }
            
            .btn-holdings {
                font-size: 0.75rem;
                padding: 3px 10px;
                border: 1px solid rgba(34, 197, 94, 0.3);
                border-radius: 6px;
                background: rgba(34, 197, 94, 0.08);
                color: var(--accent-color);
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
            }
            
            .btn-holdings:hover {
                background: rgba(34, 197, 94, 0.15);
                border-color: rgba(34, 197, 94, 0.5);
                transform: translateY(-1px);
            }
            
            .btn-holdings.disabled {
                background: rgba(107, 114, 128, 0.08);
                border-color: rgba(107, 114, 128, 0.35);
                color: #6b7280;
                cursor: not-allowed;
                pointer-events: none;
                opacity: 0.95;
            }
            
            .btn-holdings.disabled:hover {
                transform: none;
            }
            
            .holdings-loading {
                text-align: center;
                padding: 40px;
                color: rgba(255, 255, 255, 0.5);
            }
            
            .holdings-error {
                text-align: center;
                padding: 40px;
                color: #ef4444;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Vérifie si un ETF a des holdings
     */
    function hasHoldings(symbol) {
        return !!(
            etfHoldingsData &&
            etfHoldingsData.etfs &&
            etfHoldingsData.etfs[symbol] &&
            Array.isArray(etfHoldingsData.etfs[symbol].holdings) &&
            etfHoldingsData.etfs[symbol].holdings.length > 0
        );
    }
    
    /**
     * Applique l'état activé/désactivé à un bouton holdings
     */
    function applyHoldingsState(btn, symbol) {
        if (!etfHoldingsData) {
            loadETFHoldings().then(() => applyHoldingsState(btn, symbol));
            return;
        }
        
        if (hasHoldings(symbol)) {
            btn.classList.remove('disabled');
            btn.disabled = false;
            btn.setAttribute('aria-disabled', 'false');
            btn.textContent = 'Composition';
            btn.title = `Voir la composition de ${symbol}`;
        } else {
            btn.classList.add('disabled');
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.textContent = 'Pas de données';
            btn.title = `Aucune donnée de composition disponible pour ${symbol}`;
        }
    }
    
    /**
     * Met à jour tous les boutons holdings de la page
     */
    function updateAllHoldingsButtons() {
        document.querySelectorAll('.btn-holdings[data-symbol]').forEach(btn => {
            applyHoldingsState(btn, btn.dataset.symbol);
        });
    }
    
    /**
     * Charge le fichier consolidé des holdings ETF
     */
    async function loadETFHoldings() {
        if (holdingsLoadPromise) return holdingsLoadPromise;
        
        holdingsLoadPromise = fetch('data/etf_holdings.json')
            .then(response => {
                if (!response.ok) throw new Error('Holdings file not found');
                return response.json();
            })
            .then(data => {
                etfHoldingsData = data;
                console.log(`Holdings chargés: ${Object.keys(data.etfs || {}).length} ETFs`);
                updateAllHoldingsButtons();
                return data;
            })
            .catch(error => {
                console.warn('Holdings non disponibles:', error);
                updateAllHoldingsButtons();
                return null;
            });
        
        return holdingsLoadPromise;
    }
    
    /**
     * Affiche la modal avec les holdings d'un ETF
     */
    async function showHoldingsModal(index) {
        await loadETFHoldings();
        
        const symbol = index.symbol;
        const etfData = etfHoldingsData?.etfs?.[symbol];
        
        let content = '';
        
        if (!etfHoldingsData) {
            content = '<div class="holdings-error">Holdings non disponibles (fichier manquant)</div>';
        } else if (!etfData) {
            content = '<div class="holdings-error">Aucune donnée de composition pour cet ETF</div>';
        } else if (!etfData.holdings || etfData.holdings.length === 0) {
            content = '<div class="holdings-error">Liste des holdings vide</div>';
        } else {
            const holdingsList = etfData.holdings.map((h, idx) => {
                const weight = h.weight != null ? (h.weight * 100).toFixed(2) + '%' : '—';
                const name = h.name || 'N/A';
                const ticker = h.symbol ? `(${h.symbol})` : '';
                const country = h.country ? ` • ${h.country}` : '';
                
                return `
                    <li class="holding-item">
                        <div class="holding-info">
                            <div class="holding-name">${idx + 1}. ${name}</div>
                            <div class="holding-symbol">${ticker}${country}</div>
                        </div>
                        <div class="holding-weight">${weight}</div>
                    </li>
                `;
            }).join('');
            
            const totalWeight = etfData.top_weight || 
                               (etfData.holdings.reduce((sum, h) => sum + (h.weight || 0), 0) * 100).toFixed(1);
            
            content = `
                <ul class="holdings-list">
                    ${holdingsList}
                </ul>
                <div class="holdings-meta">
                    <span>Top ${etfData.holdings.length} positions = ${totalWeight}%</span>
                    <span>${etfData.as_of ? `MAJ: ${etfData.as_of}` : ''}</span>
                </div>
            `;
        }
        
        const modalHtml = `
            <div class="holdings-modal-wrapper">
                <div class="holdings-modal-backdrop"></div>
                <div class="holdings-modal">
                    <div class="holdings-modal-header">
                        <div class="holdings-modal-title">
                            ${index.index_name || index.country}
                            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-top: 2px">
                                Composition ${symbol}
                            </div>
                        </div>
                        <button class="holdings-close">×</button>
                    </div>
                    <div class="holdings-modal-body">
                        ${content}
                    </div>
                </div>
            </div>
        `;
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper);
        
        const closeModal = () => {
            wrapper.querySelector('.holdings-modal').style.animation = 'modalSlideIn 0.3s ease reverse';
            wrapper.querySelector('.holdings-modal-backdrop').style.animation = 'fadeIn 0.2s ease reverse';
            setTimeout(() => wrapper.remove(), 300);
        };
        
        wrapper.querySelector('.holdings-close').onclick = closeModal;
        wrapper.querySelector('.holdings-modal-backdrop').onclick = closeModal;
        
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * Convertit un pourcentage string en nombre
     * Retourne null si valeur vide/invalide (important pour 52W)
     */
    function parsePercentToNumber(pct) {
        if (pct == null || pct === '' || pct === '—') return null;
        const s = String(pct).replace('%','').replace(/\s/g,'').replace(',', '.');
        const m = s.match(/-?\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
    }
    
    /**
     * Convertit une valeur string en nombre
     */
    function toNumber(val) {
        if (val == null) return null;
        const s = String(val).replace(/\s/g,'').replace(/,/g,'.');
        const m = s.match(/-?\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
    }
    
    /**
     * Formate un nombre en pourcentage FR
     * Affiche "—" si null
     */
    function formatPercent(n) {
        if (n == null || isNaN(n)) return '—';
        const sign = n > 0 ? '+' : '';
        return `${sign}${new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(n)}%`;
    }
    
    /**
     * Normalise un enregistrement de données
     * Gère w52_num avec préservation de null si historique insuffisant
     */
    function normalizeRecord(rec) {
        const r = {...rec};
        r.country = COUNTRY_NORMALIZATION[r.country] || r.country;
        
        // Utiliser les valeurs numériques du JSON si disponibles
        if ('value_num' in r && 'change_num' in r && 'ytd_num' in r) {
            r.value_num = r.value_num;
            r.change_num = r.change_num;
            r.ytd_num = r.ytd_num;
            
            // 52W : utiliser w52_num du JSON si disponible
            if ('w52_num' in r) {
                r.w52_num = r.w52_num;  // Peut être null si historique insuffisant
            } else {
                r.w52_num = parsePercentToNumber(r.w52Change);
            }
        } else {
            // Fallback : parser les valeurs formatées
            r.value_num = toNumber(r.value);
            r.change_num = parsePercentToNumber(r.changePercent);
            r.ytd_num = parsePercentToNumber(r.ytdChange);
            r.w52_num = parsePercentToNumber(r.w52Change);
        }
        
        // CRITIQUE: Garder null si le backend renvoie null (historique insuffisant)
        if (r.w52_num === 0 && (r.w52Change == null || r.w52Change === '' || r.w52Change === '—')) {
            r.w52_num = null;
        }
        
        r.trend = r.change_num > 0 ? 'up' : r.change_num < 0 ? 'down' : 'flat';
        return r;
    }
    
    /**
     * Réorganise les indices par pays dans les bonnes régions
     */
    function rebalanceRegionsByCountry() {
        const REGION_BY_COUNTRY = {
            'Mexique': 'latin-america',
            'Chili': 'latin-america',
            'Brésil': 'latin-america',
            'Argentine': 'latin-america',
            'Canada': 'north-america',
            'États-Unis': 'north-america',
            'France': 'europe',
            'Allemagne': 'europe',
            'Italie': 'europe',
            'Suisse': 'europe',
            'Pays-Bas': 'europe',
            'Espagne': 'europe',
            'Suède': 'europe',
            'Royaume-Uni': 'europe',
            'Zone Euro': 'europe',
            'Europe': 'europe',
            'Japon': 'asia',
            'Chine': 'asia',
            'Inde': 'asia',
            'Taïwan': 'asia',
            'Corée du Sud': 'asia',
            'Hong Kong': 'asia',
            'Singapour': 'asia',
            'Asie': 'asia',
            'Turquie': 'other',
            'Arabie Saoudite': 'other',
            'Australie': 'other',
            'Afrique du Sud': 'other',
            'Israël': 'other'
        };
        
        const buckets = {
            europe: [],
            'north-america': [],
            'latin-america': [],
            asia: [],
            other: []
        };
        
        const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
        
        for (const region of regions) {
            for (const rec of indicesData.indices[region]) {
                const country = rec.country;
                const target = REGION_BY_COUNTRY[country] || region;
                buckets[target].push(rec);
            }
        }
        
        indicesData.indices = buckets;
        console.log('Réorganisation des indices par pays effectuée');
    }
    
    /**
     * Trouve un indice par alias avec regex - VERSION CORRIGÉE
     */
    function findIndexByAlias(region, dataIndexKey) {
        const patterns = OVERVIEW_ALIASES[region]?.[dataIndexKey] || [];
        
        let found = (indicesData.indices[region] || []).find(idx =>
            patterns.some(rx => 
                rx.test(idx.index_name || '') || 
                rx.test(idx.country || '') ||
                rx.test(idx.symbol || '')
            )
        );
        
        if (!found) {
            const allRegions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
            for (const r of allRegions) {
                found = (indicesData.indices[r] || []).find(idx =>
                    patterns.some(rx => 
                        rx.test(idx.index_name || '') || 
                        rx.test(idx.country || '') ||
                        rx.test(idx.symbol || '')
                    )
                );
                if (found) break;
            }
        }
        
        return found;
    }
    
    /**
     * Crée une cellule de tableau de manière sécurisée
     */
    function createTableCell(text, className) {
        const td = document.createElement('td');
        if (className) td.className = className;
        td.textContent = text ?? '—';
        return td;
    }
    
    /**
     * Ajoute les étiquettes VAR % et YTD au-dessus des valeurs
     */
    function addDataLabels() {
        const indexCols = document.querySelectorAll('.market-index-col');
        
        indexCols.forEach(col => {
            const dataContainer = col.querySelector('.market-index-data');
            if (dataContainer && !col.querySelector('.market-index-labels')) {
                const labelsContainer = document.createElement('div');
                labelsContainer.className = 'market-index-labels';
                labelsContainer.style.display = 'flex';
                labelsContainer.style.justifyContent = 'space-between';
                labelsContainer.style.fontSize = '0.7rem';
                labelsContainer.style.color = 'rgba(255, 255, 255, 0.5)';
                labelsContainer.style.marginBottom = '2px';
                
                labelsContainer.innerHTML = `
                    <div style="min-width: 62px; text-align: right;">VAR %</div>
                    <div style="min-width: 62px; text-align: right;">YTD / 52W</div>
                `;
                
                col.insertBefore(labelsContainer, dataContainer);
            }
        });
    }
    
    /**
     * Initialise les onglets de région
     */
    function initRegionTabs() {
        const tabs = document.querySelectorAll('.region-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                const region = this.getAttribute('data-region');
                const contents = document.querySelectorAll('.region-content');
                
                contents.forEach(content => {
                    content.classList.add('hidden');
                });
                
                document.getElementById(`${region}-indices`)?.classList.remove('hidden');
            });
        });
    }
    
    /**
     * Charge les données d'indices depuis le fichier JSON
     */
    async function loadIndicesData(forceRefresh = false) {
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        
        showElement('indices-loading');
        hideElement('indices-error');
        hideElement('indices-container');
        
        try {
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            const response = await fetch(`data/markets.json${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            const rawData = await response.json();
            
            ['europe', 'north-america', 'latin-america', 'asia', 'other'].forEach(region => {
                indicesData.indices[region] = (rawData.indices[region] || []).map(normalizeRecord);
            });
            
            rebalanceRegionsByCountry();
            
            indicesData.meta = rawData.meta;
            
            const dataTimestamp = new Date(indicesData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000;
            
            indicesData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            if (indicesData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            renderIndicesData();
            lastUpdate = new Date();
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            showElement('indices-error');
            hideElement('indices-loading');
            hideElement('indices-container');
        } finally {
            isLoading = false;
        }
    }
    
    /**
     * Affiche les données d'indices dans l'interface
     */
    function renderIndicesData() {
        try {
            const timestamp = new Date(indicesData.meta.timestamp);
            const formattedDate = new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'long',
                timeStyle: 'medium',
                timeZone: 'Europe/Paris'
            }).format(timestamp);
            
            document.getElementById('last-update-time').textContent = 
                formattedDate + (indicesData.meta.isStale ? ' (anciennes données)' : '');
            
            const sourceLink = document.querySelector('a[href*="boursorama"]');
            if (sourceLink && indicesData.meta.source) {
                sourceLink.textContent = indicesData.meta.source;
            }
            
            const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
            
            regions.forEach(region => {
                const indices = indicesData.indices[region] || [];
                const tableBody = document.getElementById(`${region}-indices-body`);
                
                if (tableBody) {
                    tableBody.innerHTML = '';
                    
                    if (indices.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="6" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        const sortedIndices = [...indices].sort((a, b) => {
                            if (a.country !== b.country) {
                                return (a.country || "").localeCompare(b.country || "");
                            }
                            return (a.index_name || "").localeCompare(b.index_name || "");
                        });
                        
                        sortedIndices.forEach(index => {
                            const tr = document.createElement('tr');
                            
                            const changeClass = index.change_num < -0.01 ? 'negative' : 
                                              index.change_num > 0.01 ? 'positive' : 'neutral';
                            const ytdClass = index.ytd_num < -0.01 ? 'negative' : 
                                           index.ytd_num > 0.01 ? 'positive' : 'neutral';
                            
                            // Classe pour 52W (peut être null)
                            const w52Class = (index.w52_num == null) ? 'neutral' :
                                           index.w52_num < -0.01 ? 'negative' :
                                           index.w52_num > 0.01 ? 'positive' : 'neutral';
                            
                            tr.appendChild(createTableCell(index.country, 'font-medium'));
                            
                            // Cellule Libellé avec bouton Composition
                            const nameTd = document.createElement('td');
                            const nameContainer = document.createElement('div');
                            nameContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px;';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = index.index_name || '—';
                            nameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                            nameContainer.appendChild(nameSpan);
                            
                            // Bouton Composition
                            if (index.symbol) {
                                const btnHoldings = document.createElement('button');
                                btnHoldings.className = 'btn-holdings';
                                btnHoldings.textContent = 'Composition';
                                btnHoldings.dataset.symbol = index.symbol;
                                btnHoldings.onclick = (e) => {
                                    e.stopPropagation();
                                    showHoldingsModal(index);
                                };
                                applyHoldingsState(btnHoldings, index.symbol);
                                nameContainer.appendChild(btnHoldings);
                            }
                            
                            nameTd.appendChild(nameContainer);
                            tr.appendChild(nameTd);
                            
                            tr.appendChild(createTableCell(index.value));
                            tr.appendChild(createTableCell(formatPercent(index.change_num), changeClass));
                            tr.appendChild(createTableCell(formatPercent(index.ytd_num), ytdClass));
                            
                            // Nouvelle colonne 52W
                            const w52Text = index.w52_num == null ? '—' : formatPercent(index.w52_num);
                            const w52Td = createTableCell(w52Text, w52Class);
                            
                            // Tooltip pour 52W
                            if (index.w52_ref_date) {
                                w52Td.title = `Base 52W: ${index.w52_ref_date}`;
                            } else if (index.w52_num == null) {
                                w52Td.title = 'Historique insuffisant (< 12 mois)';
                            }
                            
                            tr.appendChild(w52Td);
                            
                            tableBody.appendChild(tr);
                        });
                    }
                    
                    updateRegionSummary(region, indices);
                }
            });
            
            updateTopPerformers();
            updateMarketOverview();
            
            if (window.attachTableSorters) {
                window.attachTableSorters();
            }
            
            hideElement('indices-loading');
            hideElement('indices-error');
            showElement('indices-container');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('indices-loading');
            showElement('indices-error');
        }
    }
    
    /**
     * Met à jour l'aperçu des marchés mondiaux - VERSION CORRIGÉE
     */
    function updateMarketOverview() {
        try {
            console.log('Mise à jour de l\'aperçu des marchés mondiaux...');
            
            updateMarketOverviewRegion('europe', [
                { key: 'germany',     display: 'Allemagne',   selector: '[data-index="germany"]' },
                { key: 'france',      display: 'France',      selector: '[data-index="france"]' },
                { key: 'uk',          display: 'Royaume-Uni', selector: '[data-index="uk"]' },
                { key: 'switzerland', display: 'Suisse',      selector: '[data-index="switzerland"]' },
                { key: 'europe',      display: 'Europe',      selector: '[data-index="europe"]' },
            ]);
            
            updateMarketOverviewRegion('north-america', [
                { key: 'sp500',    display: 'S&P 500',    selector: '[data-index="sp500"]' },
                { key: 'dowjones', display: 'DOW JONES',  selector: '[data-index="dowjones"]' },
                { key: 'canada',   display: 'Canada',     selector: '[data-index="canada"]' },
                { key: 'vix',      display: 'VIX',        selector: '[data-index="vix"]' },
            ]);
            
            updateMarketOverviewRegion('latin-america', [
                { key: 'brazil',    display: 'Brésil',    selector: '[data-index="brazil"]' },
                { key: 'mexico',    display: 'Mexique',   selector: '[data-index="mexico"]' },
                { key: 'chile',     display: 'Chili',     selector: '[data-index="chile"]' },
                { key: 'argentina', display: 'Argentine', selector: '[data-index="argentina"]' },
            ]);
            
            updateMarketOverviewRegion('asia', [
                { key: 'china',  display: 'Chine',   selector: '[data-index="china"]' },
                { key: 'japan',  display: 'Japon',   selector: '[data-index="japan"]' },
                { key: 'india',  display: 'Inde',    selector: '[data-index="india"]' },
                { key: 'taiwan', display: 'Taïwan',  selector: '[data-index="taiwan"]' },
            ]);
            
            updateMarketOverviewRegion('other', [
                { key: 'southafrica', display: 'Afrique du Sud', selector: '[data-index="southafrica"]' },
                { key: 'australia',   display: 'Australie',      selector: '[data-index="australia"]' },
                { key: 'israel',      display: 'Israël',         selector: '[data-index="israel"]' },
                { key: 'turkey',      display: 'Turquie',        selector: '[data-index="turkey"]' },
            ]);
            
            console.log('Mise à jour de l\'aperçu des marchés terminée');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'aperçu des marchés:', error);
        }
    }
    
    /**
     * Met à jour une région spécifique de l'aperçu des marchés
     * Inclut maintenant le chip 52W
     */
    function updateMarketOverviewRegion(region, indicesInfo) {
        indicesInfo.forEach(indexInfo => {
            try {
                const container = document.querySelector(indexInfo.selector);
                if (!container) {
                    console.warn(`Élément non trouvé: ${indexInfo.selector}`);
                    return;
                }
                
                const index = findIndexByAlias(region, indexInfo.key);
                if (!index) {
                    console.warn(`Indice non trouvé pour clé: ${indexInfo.key} dans ${region}`);
                    return;
                }
                
                console.log(`✅ Trouvé ${indexInfo.key}: ${index.index_name} (${index.change_num}%, YTD ${index.ytd_num}%, 52W ${index.w52_num}%)`);
                
                const nameElement = container.querySelector('.market-index-name');
                const valueElement = container.querySelector('.market-value');
                const ytdElement = container.querySelector('.market-ytd');
                const w52Element = container.querySelector('.market-w52');
                
                if (nameElement) {
                    nameElement.textContent = indexInfo.display || index.country || indexInfo.key;
                }
                
                if (valueElement) {
                    valueElement.textContent = formatPercent(index.change_num);
                    valueElement.className = 'market-value ' + 
                        (index.change_num == null ? 'neutral' :
                         index.change_num < -0.01 ? 'negative' : 
                         index.change_num > 0.01 ? 'positive' : 'neutral');
                }
                
                if (ytdElement) {
                    ytdElement.textContent = `YTD ${formatPercent(index.ytd_num)}`;
                    ytdElement.className = 'market-ytd ' + 
                        (index.ytd_num == null ? '' :
                         index.ytd_num < -0.01 ? 'negative' : 
                         index.ytd_num > 0.01 ? 'positive' : 'neutral');
                }
                
                // Mise à jour du chip 52W
                if (w52Element) {
                    w52Element.textContent = index.w52_num == null ? '52W —' : `52W ${formatPercent(index.w52_num)}`;
                    w52Element.className = 'market-w52 ' + 
                        (index.w52_num == null ? '' :
                         index.w52_num < -0.01 ? 'negative' : 
                         index.w52_num > 0.01 ? 'positive' : 'neutral');
                    w52Element.title = index.w52_num == null ? 'Historique insuffisant (< 12 mois)' : '52W glissant';
                }
                
            } catch (error) {
                console.error(`Erreur lors de la mise à jour de ${indexInfo.key}:`, error);
            }
        });
    }
    
    /**
     * Met à jour le résumé des indices pour une région donnée
     */
    function updateRegionSummary(region, indices) {
        const trendElement = document.getElementById(`${region}-trend`);
        
        if (!trendElement) return;
        
        if (!indices.length) {
            trendElement.innerHTML = '';
            return;
        }
        
        const avgChange = indices.reduce((sum, idx) => 
            sum + (idx.change_num || 0), 0) / Math.max(1, indices.length);
        
        let trendClass = Math.abs(avgChange) <= 0.01 ? 'neutral' : 
                        (avgChange > 0 ? 'positive' : 'negative');
        
        trendElement.className = `text-sm ${trendClass}`;
        trendElement.innerHTML = trendClass === 'positive' ? '<i class="fas fa-arrow-up"></i>' :
                                trendClass === 'negative' ? '<i class="fas fa-arrow-down"></i>' :
                                '<i class="fas fa-arrows-alt-h"></i>';
    }
    
    /**
     * Calcule et affiche les top performers (daily, YTD et 52W)
     */
    function updateTopPerformers() {
        const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
        const allIndices = regions.flatMap(r => indicesData.indices[r] || []);
        
        if (allIndices.length < 3) return;
        
        // Trier par variation quotidienne
        const byDaily = [...allIndices].sort((a, b) => 
            (b.change_num - a.change_num) || (b.ytd_num - a.ytd_num)
        );
        
        // Trier par YTD
        const byYTD = [...allIndices].sort((a, b) => 
            (b.ytd_num - a.ytd_num) || (b.change_num - a.change_num)
        );
        
        // Trier par 52W (exclure les null)
        const w52Only = allIndices.filter(idx => Number.isFinite(idx.w52_num));
        const byW52 = [...w52Only].sort((a, b) => 
            (b.w52_num - a.w52_num) || (b.ytd_num - a.ytd_num)
        );
        
        // Daily top/bottom
        updateTopPerformersHTML('daily-top', byDaily.slice(0, 3), 'change_num');
        updateTopPerformersHTML('daily-bottom', byDaily.slice(-3).reverse(), 'change_num');
        
        // YTD top/bottom
        updateTopPerformersHTML('ytd-top', byYTD.slice(0, 3), 'ytd_num');
        updateTopPerformersHTML('ytd-bottom', byYTD.slice(-3).reverse(), 'ytd_num');
        
        // 52W top/bottom
        updateTopPerformersHTML('w52-top', byW52.slice(0, 3), 'w52_num');
        updateTopPerformersHTML('w52-bottom', byW52.slice(-3).reverse(), 'w52_num');
    }
    
    /**
     * Met à jour le HTML pour une section de top performers
     */
    function updateTopPerformersHTML(containerId, items, field) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<div class="performer-row" style="opacity: 0.5; justify-content: center;">Aucune donnée</div>';
            return;
        }
        
        items.forEach(idx => {
            const val = idx[field] ?? 0;
            const css = val < -0.01 ? 'negative' : val > 0.01 ? 'positive' : 'neutral';
            
            const row = document.createElement('div');
            row.className = 'performer-row';
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${idx.index_name || ''}</div>
                    <div class="performer-country">${idx.country || ''}</div>
                </div>
                <div class="performer-value ${css}">${formatPercent(val)}</div>
            `;
            
            container.appendChild(row);
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
        let notification = document.querySelector('.notification-popup');
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'notification-popup';
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 15px 25px;
                border-radius: 4px;
                z-index: 1000;
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.3s, transform 0.3s;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            `;
            
            if (type === 'warning') {
                notification.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                notification.style.borderLeft = '3px solid #FFC107';
                notification.style.color = '#FFC107';
            } else {
                notification.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                notification.style.borderLeft = '3px solid var(--accent-color)';
                notification.style.color = 'var(--text-color)';
            }
            
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
            
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(20px)';
                
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
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            document.documentElement.classList.toggle('dark');
            
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
    }
    
    // Expose data globally for search
    window.indicesData = indicesData;
});
