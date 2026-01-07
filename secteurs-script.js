/**
 * secteurs-script.js - Version avec libellés normalisés ET traduction FR
 * Utilise prioritairement les libellés display_fr du JSON
 * Garde la traduction française côté client pour flexibilité
 * Intègre l'affichage des holdings ETF depuis un fichier consolidé
 * + Support 52W (performance 52 semaines glissantes)
 */

document.addEventListener('DOMContentLoaded', function() {
    // === Localisation FR des libellés d'indices/ETF ===
    const LOCALE = (document.documentElement.lang || 'fr').startsWith('fr') ? 'fr' : 'en';
    
    // Remplacements "token → traduction". On ne touche pas aux marques (iShares, Invesco…)
    const FR_TOKENS = [
        [/Oil\s*&\s*Gas/i, 'Pétrole & Gaz'],
        [/Basic\s*Resources?/i, 'Ressources de base'],
        [/Materials?/i, 'Matériaux'],
        [/Construction\s*&\s*Materials?/i, 'Construction & Matériaux'],
        [/Industrials?/i, 'Industriels'],
        [/Industrial/i, 'Industriel'],
        [/Banks?/i, 'Banques'],
        [/Financial\s*Services?/i, 'Services financiers'],
        [/Finance/i, 'Finance'],
        [/Insurance/i, 'Assurances'],
        [/Real\s*Estate/i, 'Immobilier'],
        [/Utilities/i, 'Services publics'],
        [/Health\s*Care/i, 'Santé'],
        [/Pharmaceuticals?/i, 'Pharmaceutiques'],
        [/Biotechnolog(y|ies)/i, 'Biotechnologie'],
        [/Technology/i, 'Technologie'],
        [/Semiconductors?/i, 'Semi-conducteurs'],
        [/Media/i, 'Médias'],
        [/Telecommunications?/i, 'Télécommunications'],
        [/Communication\s*Services?/i, 'Communication'],
        [/Consumer\s*Discretionary/i, 'Consommation discrétionnaire'],
        [/Consumer\s*Staples/i, 'Consommation de base'],
        [/Food\s*&\s*Beverage/i, 'Alimentation & Boissons'],
        [/Retail/i, 'Distribution'],
        [/Transportation/i, 'Transports'],
        [/Internet/i, 'Internet'],
        [/Cybersecurity/i, 'Cybersécurité'],
        [/Smart\s*Grid\s*Infrastructure/i, 'Infrastructures réseaux intelligents'],
        [/AI\s*&\s*Robotics/i, 'IA & Robotique'],
        [/Artificial\s*Intelligence/i, 'Intelligence artificielle'],
        [/Automobiles?\s*&\s*(Parts|Components?|Equip(men)?t(ier)?s?)/i, 'Automobiles & Équipementiers'],
        [/Automobiles?/i, 'Automobiles'],
        [/Chemicals?/i, 'Chimie'],
        [/Autos?/i, 'Auto'],
        [/Technology\s*Dividend/i, 'Dividendes technologiques'],
        [/(Personal\s*&\s*Household\s*Goods|Household\s*&\s*Personal\s*Products?)/i, 'Biens personnels & ménagers'],
        [/Travel\s*&\s*Leisure/i, 'Voyages & Loisirs'],
        [/FinTech/i, 'FinTech'],
        [/FINTECH/i, 'FinTech'],
        [/BIOTECH/i, 'Biotech']
    ];
    
    // Traduit uniquement les morceaux sectoriels, conserve les marques/suffixes (UCITS ETF, ETF…)
    function translateSectorLabel(name, locale = 'fr') {
        if (!name || locale !== 'fr') return name;
        let out = String(name);
        for (const [re, fr] of FR_TOKENS) {
            out = out.replace(re, fr);
        }
        // Harmonise le "&"
        out = out.replace(/\s*&\s*/g, ' & ');
        return out;
    }
    
    // Variables globales pour stocker les données
    let sectorsData = {
        sectors: {
            "europe": [],
            "us": []
        },
        meta: {
            sources: ["STOXX", "Boursorama"],
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Cache pour les holdings ETF
    let etfHoldingsData = null;
    let holdingsLoadPromise = null;
    
    // Mapping des catégories sectorielles vers régions (pour l'aperçu uniquement)
    const SECTOR_MAPPINGS = {
        'energy': 'Énergie',
        'materials': 'Matériaux',
        'industrials': 'Industriels',
        'consumer-discretionary': 'Consommation discrétionnaire',
        'consumer-staples': 'Consommation de base',
        'healthcare': 'Santé',
        'financials': 'Finance',
        'information-technology': 'Technologie',
        'communication-services': 'Communication',
        'utilities': 'Services publics',
        'real-estate': 'Immobilier'
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
    loadSectorsData();
    
    // Charger les holdings en arrière-plan
    loadETFHoldings();
    
    // Ajouter les styles CSS pour la modal holdings
    injectHoldingsStyles();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('sectors-error');
        showElement('sectors-loading');
        loadSectorsData(true);
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
                margin-left: 10px;
                border: 1px solid rgba(34, 197, 94, 0.3);
                border-radius: 6px;
                background: rgba(34, 197, 94, 0.08);
                color: var(--accent-color);
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .btn-holdings:hover {
                background: rgba(34, 197, 94, 0.15);
                border-color: rgba(34, 197, 94, 0.5);
                transform: translateY(-1px);
            }
            
            .btn-holdings.disabled {
                background: rgba(107, 114, 128, 0.08);   /* gris neutre */
                border-color: rgba(107, 114, 128, 0.35);
                color: #6b7280;                          /* texte gris */
                cursor: not-allowed;
                pointer-events: none;                     /* INCliquable */
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
        // Si les holdings ne sont pas encore chargés, on attend puis on ré-applique
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
                // Mettre à jour tous les boutons après le chargement
                updateAllHoldingsButtons();
                return data;
            })
            .catch(error => {
                console.warn('Holdings non disponibles:', error);
                // Même en cas d'erreur, on met à jour les boutons pour les désactiver
                updateAllHoldingsButtons();
                return null;
            });
        
        return holdingsLoadPromise;
    }
    
    /**
     * Affiche la modal avec les holdings d'un ETF
     */
    async function showHoldingsModal(sector) {
        // S'assurer que les holdings sont chargés
        await loadETFHoldings();
        
        const symbol = sector.symbol;
        const etfData = etfHoldingsData?.etfs?.[symbol];
        
        // Créer le contenu HTML
        let content = '';
        
        if (!etfHoldingsData) {
            content = '<div class="holdings-error">Holdings non disponibles (fichier manquant)</div>';
        } else if (!etfData) {
            content = '<div class="holdings-error">Aucune donnée de composition pour cet ETF</div>';
        } else if (!etfData.holdings || etfData.holdings.length === 0) {
            content = '<div class="holdings-error">Liste des holdings vide</div>';
        } else {
            // Créer la liste des holdings
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
        
        // Créer la modal
        const modalHtml = `
            <div class="holdings-modal-wrapper">
                <div class="holdings-modal-backdrop"></div>
                <div class="holdings-modal">
                    <div class="holdings-modal-header">
                        <div class="holdings-modal-title">
                            ${sector.display_fr || sector.indexName || sector.name}
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
        
        // Gérer la fermeture
        const closeModal = () => {
            wrapper.querySelector('.holdings-modal').style.animation = 'modalSlideIn 0.3s ease reverse';
            wrapper.querySelector('.holdings-modal-backdrop').style.animation = 'fadeIn 0.2s ease reverse';
            setTimeout(() => wrapper.remove(), 300);
        };
        
        wrapper.querySelector('.holdings-close').onclick = closeModal;
        wrapper.querySelector('.holdings-modal-backdrop').onclick = closeModal;
        
        // Fermer avec Escape
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
        // Gère "55,400.00" ou "55 400,00"
        const s = String(val).replace(/\s/g,'').replace(/,/g,'.');
        const m = s.match(/-?\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
    }
    
    /**
     * Formate un nombre en pourcentage FR
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
     * Calcule la médiane d'un tableau de nombres
     * Plus robuste que la moyenne face aux valeurs extrêmes
     */
    function median(nums) {
        const arr = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
        const n = arr.length;
        if (!n) return null;
        const mid = Math.floor(n / 2);
        return n % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    }
    
    /**
     * Agrège les données d'une catégorie en calculant la médiane
     * des variations quotidiennes, YTD et 52W
     */
    function aggregateCategory(list, label = '') {
        const changes = list.map(s => s.change_num).filter(Number.isFinite);
        const ytds = list.map(s => s.ytd_num).filter(Number.isFinite);
        const w52s = list.map(s => s.w52_num).filter(Number.isFinite);
        
        const mChange = median(changes);
        const mYTD = median(ytds);
        const mW52 = w52s.length ? median(w52s) : null;
        
        // Debug log pour vérifier le calcul de la médiane
        console.debug('[MEDIAN]', label, {
            count: list.length,
            changes: changes,
            medianChange: mChange,
            ytds: ytds,
            medianYTD: mYTD,
            w52s: w52s,
            medianW52: mW52
        });
        
        return {
            change: mChange,
            ytd: mYTD,
            w52: mW52,
            count: list.length
        };
    }
    
    /**
     * Normalise un enregistrement de données
     */
    function normalizeRecord(rec, category) {
        const r = {...rec};
        r.category = category;
        
        // Utiliser les valeurs numériques du JSON si disponibles
        if ('value_num' in r && 'change_num' in r && 'ytd_num' in r) {
            // Les valeurs numériques sont déjà dans le JSON
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
            // Fallback : parser les valeurs formatées (ancienne méthode)
            r.value_num = toNumber(r.value);
            r.change_num = parsePercentToNumber(r.changePercent);
            r.ytd_num = parsePercentToNumber(r.ytdChange);
            r.w52_num = parsePercentToNumber(r.w52Change);
        }
        
        // CRITIQUE: Garder null si le backend renvoie null (historique insuffisant)
        // Ne pas convertir null en 0
        if (r.w52_num === 0 && (r.w52Change == null || r.w52Change === '' || r.w52Change === '—')) {
            r.w52_num = null;
        }
        
        r.trend = r.change_num > 0 ? 'up' : r.change_num < 0 ? 'down' : 'flat';
        
        // Fallback pour la région si non définie
        if (!r.region) {
            const n = (r.name || '').toLowerCase();
            r.region = n.includes('stoxx europe 600') ? 'Europe' : 'US';
        }
        
        return r;
    }
    
    /**
     * Créer une cellule de tableau de manière sécurisée
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
        const sectorCols = document.querySelectorAll('.sector-col');
        
        sectorCols.forEach(col => {
            const dataContainer = col.querySelector('.sector-data');
            if (dataContainer && !col.querySelector('.sector-index-labels')) {
                const labelsContainer = document.createElement('div');
                labelsContainer.className = 'sector-index-labels';
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
                
                document.getElementById(`${region}-sectors`)?.classList.remove('hidden');
            });
        });
    }
    
    /**
     * Charge les données de secteurs depuis le fichier JSON
     */
    async function loadSectorsData(forceRefresh = false) {
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        
        showElement('sectors-loading');
        hideElement('sectors-error');
        hideElement('sectors-container');
        
        // Ajouter la classe loading à l'aperçu
        const overviewContainer = document.getElementById('overview-container');
        if (overviewContainer) {
            overviewContainer.classList.add('loading');
        }
        
        try {
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            const response = await fetch(`data/sectors.json${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            const rawData = await response.json();
            
            // Réorganiser les données par région
            const europeData = [];
            const usData = [];
            
            // Traiter chaque catégorie de secteur
            for (const [category, sectors] of Object.entries(rawData.sectors)) {
                sectors.forEach(sector => {
                    const normalizedSector = normalizeRecord(sector, category);
                    
                    // Classifier par région
                    if (normalizedSector.region === "Europe") {
                        europeData.push(normalizedSector);
                    } else if (normalizedSector.region === "US") {
                        usData.push(normalizedSector);
                    }
                });
            }
            
            sectorsData = {
                sectors: {
                    europe: europeData,
                    us: usData
                },
                meta: rawData.meta
            };
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(sectorsData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure
            
            sectorsData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            if (sectorsData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            renderSectorsData();
            lastUpdate = new Date();
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            showElement('sectors-error');
            hideElement('sectors-loading');
            hideElement('sectors-container');
        } finally {
            isLoading = false;
        }
    }
    
    /**
     * Affiche les données de secteurs dans l'interface
     */
    function renderSectorsData() {
        try {
            // Mettre à jour l'horodatage avec le bon fuseau horaire
            const timestamp = new Date(sectorsData.meta.timestamp);
            const formattedDate = new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'long',
                timeStyle: 'medium',
                timeZone: 'Europe/Paris'
            }).format(timestamp);
            
            document.getElementById('last-update-time').textContent = 
                formattedDate + (sectorsData.meta.isStale ? ' (anciennes données)' : '');
            
            // Générer le HTML pour chaque région
            const regions = ['europe', 'us'];
            
            regions.forEach(region => {
                const sectors = sectorsData.sectors[region] || [];
                const tableBody = document.getElementById(`${region}-sectors-body`);
                
                if (tableBody) {
                    tableBody.innerHTML = '';
                    
                    if (sectors.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="5" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Tri par nom d'affichage
                        const sortedSectors = [...sectors].sort((a, b) => {
                            const labelA = a.display_fr || a.indexName || a.name || "";
                            const labelB = b.display_fr || b.indexName || b.name || "";
                            return labelA.localeCompare(labelB);
                        });
                        
                        sortedSectors.forEach(sector => {
                            const tr = document.createElement('tr');
                            
                            const changeClass = sector.change_num < -0.01 ? 'negative' : 
                                              sector.change_num > 0.01 ? 'positive' : 'neutral';
                            const ytdClass = sector.ytd_num < -0.01 ? 'negative' : 
                                           sector.ytd_num > 0.01 ? 'positive' : 'neutral';
                            
                            // Classe pour 52W (peut être null)
                            const w52Class = (sector.w52_num == null) ? 'neutral' :
                                           sector.w52_num < -0.01 ? 'negative' :
                                           sector.w52_num > 0.01 ? 'positive' : 'neutral';
                            
                            // Priorité : display_fr du JSON, puis traduction FR, puis fallback
                            const rawName = sector.name || '';  // nom complet ETF pour tooltip
                            let label = sector.display_fr;
                            
                            // Si pas de display_fr, traduire
                            if (!label && LOCALE === 'fr') {
                                label = translateSectorLabel(sector.indexName || rawName, LOCALE);
                            }
                            
                            // Fallback final
                            if (!label) {
                                label = sector.indexName || rawName;
                            }
                            
                            const nameTd = document.createElement('td');
                            
                            // Créer un conteneur pour le nom et le bouton
                            const nameContainer = document.createElement('div');
                            nameContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.style.fontWeight = '600';
                            nameSpan.textContent = label;
                            nameSpan.title = rawName;
                            
                            nameContainer.appendChild(nameSpan);
                            
                            // Ajouter le bouton Holdings si disponible
                            if (sector.symbol) {
                                const btnHoldings = document.createElement('button');
                                btnHoldings.className = 'btn-holdings';
                                btnHoldings.textContent = 'Composition';
                                btnHoldings.dataset.symbol = sector.symbol;  // Ajout du data-symbol
                                btnHoldings.onclick = (e) => {
                                    e.stopPropagation();
                                    showHoldingsModal(sector);
                                };
                                
                                // Applique l'état (gris/disabled si vide)
                                applyHoldingsState(btnHoldings, sector.symbol);
                                
                                nameContainer.appendChild(btnHoldings);
                            }
                            
                            nameTd.appendChild(nameContainer);
                            
                            tr.appendChild(nameTd);
                            tr.appendChild(createTableCell(sector.value));
                            tr.appendChild(createTableCell(formatPercent(sector.change_num), changeClass));
                            tr.appendChild(createTableCell(formatPercent(sector.ytd_num), ytdClass));
                            
                            // Nouvelle colonne 52W
                            const w52Text = sector.w52_num == null ? '—' : formatPercent(sector.w52_num);
                            const w52Td = createTableCell(w52Text, w52Class);
                            
                            // Tooltip pour 52W
                            if (sector.w52_ref_date) {
                                w52Td.title = `Base 52W: ${sector.w52_ref_date}`;
                            } else if (sector.w52_num == null) {
                                w52Td.title = 'Historique insuffisant (< 12 mois)';
                            }
                            
                            tr.appendChild(w52Td);
                            
                            tableBody.appendChild(tr);
                        });
                    }
                    
                    updateRegionSummary(region, sectors);
                }
            });
            
            updateTopPerformers();
            updateSectorOverview();
            
            // Rendre l'aperçu visible et retirer la classe loading
            const overviewContainer = document.getElementById('overview-container');
            if (overviewContainer) {
                overviewContainer.classList.remove('loading');
                overviewContainer.style.visibility = 'visible';
            }
            
            // Activer le tri sur toutes les tables après le rendu
            if (window.attachTableSorters) {
                window.attachTableSorters();
            }
            
            hideElement('sectors-loading');
            hideElement('sectors-error');
            showElement('sectors-container');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('sectors-loading');
            showElement('sectors-error');
        }
    }
    
    /**
     * Met à jour l'aperçu des secteurs
     */
    function updateSectorOverview() {
        try {
            console.log('Mise à jour de l\'aperçu des secteurs...');
            
            // Europe - STOXX 600
            updateSectorOverviewRegion('europe', [
                { category: 'energy', selector: '.sector-col[data-sector="energy"]' },
                { category: 'financials', selector: '.sector-col[data-sector="financials"]' },
                { category: 'information-technology', selector: '.sector-col[data-sector="technology"]' },
                { category: 'healthcare', selector: '.sector-col[data-sector="healthcare"]' }
            ]);
            
            // USA - NASDAQ
            updateSectorOverviewRegion('us', [
                { category: 'energy', selector: '.sector-col[data-sector="energy-us"]' },
                { category: 'financials', selector: '.sector-col[data-sector="financials-us"]' },
                { category: 'information-technology', selector: '.sector-col[data-sector="technology-us"]' },
                { category: 'healthcare', selector: '.sector-col[data-sector="healthcare-us"]' }
            ]);
            
            console.log('Mise à jour de l\'aperçu des secteurs terminée');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'aperçu des secteurs:', error);
        }
    }
    
    /**
     * Met à jour une région spécifique de l'aperçu des secteurs
     * Utilise la médiane pour agréger les valeurs de plusieurs ETFs
     */
    function updateSectorOverviewRegion(region, sectorsInfo) {
        sectorsInfo.forEach(sectorInfo => {
            try {
                const container = document.querySelector(sectorInfo.selector);
                if (!container) {
                    console.warn(`Élément non trouvé: ${sectorInfo.selector}`);
                    return;
                }
                
                // Récupère TOUS les ETFs de cette catégorie
                const list = (sectorsData.sectors[region] || [])
                    .filter(s => s.category === sectorInfo.category);
                
                if (!list.length) {
                    console.warn(`Aucun secteur trouvé: ${sectorInfo.category} dans ${region}`);
                    return;
                }
                
                // Calcule la médiane des variations jour, YTD et 52W
                const { change, ytd, w52, count } = aggregateCategory(list, `${region}/${sectorInfo.category}`);
                
                const nameElement = container.querySelector('.sector-name');
                const valueElement = container.querySelector('.sector-value');
                const ytdElement = container.querySelector('.sector-ytd');
                const w52Element = container.querySelector('.sector-w52');
                
                if (nameElement) {
                    // Pour l'aperçu, on garde les noms français simplifiés
                    nameElement.textContent = SECTOR_MAPPINGS[sectorInfo.category] || list[0].sector_fr || 'Secteur';
                }
                
                if (valueElement) {
                    valueElement.textContent = formatPercent(change);
                    valueElement.className = 'sector-value ' + 
                        (change == null ? 'neutral' :
                         change < -0.01 ? 'negative' : 
                         change > 0.01 ? 'positive' : 'neutral');
                }
                
                if (ytdElement) {
                    ytdElement.textContent = `YTD ${formatPercent(ytd)}`;
                    ytdElement.className = 'sector-ytd ' + 
                        (ytd == null ? '' :
                         ytd < -0.01 ? 'negative' : 
                         ytd > 0.01 ? 'positive' : 'neutral');
                    ytdElement.title = 'YTD glissant (médiane)';
                }
                
                // Mise à jour du chip 52W
                if (w52Element) {
                    w52Element.textContent = w52 == null ? '52W —' : `52W ${formatPercent(w52)}`;
                    w52Element.className = 'sector-w52 ' + 
                        (w52 == null ? '' :
                         w52 < -0.01 ? 'negative' : 
                         w52 > 0.01 ? 'positive' : 'neutral');
                    w52Element.title = w52 == null ? 'Historique insuffisant (< 12 mois)' : '52W glissant (médiane)';
                }
                
                // Ajoute un tooltip listant les ETFs contributifs
                if (count > 1) {
                    const etfNames = list.map(s => s.display_fr || s.indexName || s.name).join(' • ');
                    container.title = `Médiane de ${count} ETFs:\n${etfNames}`;
                } else if (list[0]) {
                    container.title = list[0].display_fr || list[0].indexName || list[0].name || '';
                }
                
            } catch (error) {
                console.error(`Erreur lors de la mise à jour de ${sectorInfo.category}:`, error);
            }
        });
    }
    
    /**
     * Met à jour le résumé des secteurs pour une région donnée
     */
    function updateRegionSummary(region, sectors) {
        const trendElement = document.getElementById(`${region === 'europe' ? 'europe' : 'us'}-trend`);
        
        if (!trendElement) return;
        
        if (!sectors.length) {
            trendElement.innerHTML = '';
            return;
        }
        
        // Calculer la moyenne des variations pour déterminer la tendance
        const avgChange = sectors.reduce((sum, s) => 
            sum + (s.change_num || 0), 0) / Math.max(1, sectors.length);
        
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
        const regions = ['europe', 'us'];
        const allSectors = regions.flatMap(r => sectorsData.sectors[r] || []);
        
        if (allSectors.length < 3) return;
        
        // Trier par variation quotidienne
        const byDaily = [...allSectors].sort((a, b) => 
            (b.change_num - a.change_num) || (b.ytd_num - a.ytd_num)
        );
        
        // Trier par YTD
        const byYTD = [...allSectors].sort((a, b) => 
            (b.ytd_num - a.ytd_num) || (b.change_num - a.change_num)
        );
        
        // Trier par 52W (exclure les null)
        const w52Only = allSectors.filter(s => Number.isFinite(s.w52_num));
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
        
        items.forEach(sector => {
            const val = sector[field] ?? 0;
            const css = val < -0.01 ? 'negative' : val > 0.01 ? 'positive' : 'neutral';
            
            // Déterminer la région d'affichage
            const regionDisplay = sector.indexFamily || 
                (sectorsData.sectors.europe.includes(sector) ? "STOXX Europe 600" : "NASDAQ US");
            
            // Priorité : display_fr du JSON, puis traduction FR, puis fallback
            const rawName = sector.name || '';
            let label = sector.display_fr;
            
            // Si pas de display_fr, traduire
            if (!label && LOCALE === 'fr') {
                label = translateSectorLabel(sector.indexName || rawName, LOCALE);
            }
            
            // Fallback final
            if (!label) {
                label = sector.indexName || rawName;
            }
            
            const row = document.createElement('div');
            row.className = 'performer-row';
            row.title = rawName; // nom complet ETF au survol
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${label}</div>
                    <div class="performer-region">${regionDisplay}</div>
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
    window.sectorsData = sectorsData;
});
