/**
 * marches-script.js - Version compatible Twelve Data avec corrections majeures
 * Les données sont mises à jour régulièrement par GitHub Actions
 * 
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
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadIndicesData(true);
    });
    
    /**
     * Convertit un pourcentage string en nombre
     */
    function parsePercentToNumber(pct) {
        if (pct == null) return 0;
        const s = String(pct).replace('%','').replace(/\s/g,'').replace(',', '.');
        const m = s.match(/-?\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : 0;
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
        if (n == null || isNaN(n)) return '-';
        const sign = n > 0 ? '+' : '';
        return `${sign}${new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(n)}%`;
    }
    
    /**
     * Normalise un enregistrement de données
     */
    function normalizeRecord(rec) {
        const r = {...rec};
        r.country = COUNTRY_NORMALIZATION[r.country] || r.country;
        r.value_num = toNumber(r.value);
        r.change_num = parsePercentToNumber(r.changePercent);
        r.ytd_num = parsePercentToNumber(r.ytdChange);
        r.trend = r.change_num > 0 ? 'up' : r.change_num < 0 ? 'down' : 'flat';
        return r;
    }
    
    /**
     * Réorganise les indices par pays dans les bonnes régions
     */
    function rebalanceRegionsByCountry() {
        const REGION_BY_COUNTRY = {
            // Amérique Latine
            'Mexique': 'latin-america',
            'Chili': 'latin-america',
            'Brésil': 'latin-america',
            'Argentine': 'latin-america',
            
            // Amérique du Nord
            'Canada': 'north-america',
            'États-Unis': 'north-america',
            
            // Europe
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
            
            // Asie
            'Japon': 'asia',
            'Chine': 'asia',
            'Inde': 'asia',
            'Taïwan': 'asia',
            'Corée du Sud': 'asia',
            'Hong Kong': 'asia',
            'Singapour': 'asia',
            'Asie': 'asia',
            
            // Autres
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
        
        // Reconstitue les seaux en fonction du pays normalisé
        for (const region of regions) {
            for (const rec of indicesData.indices[region]) {
                const country = rec.country; // Déjà normalisé
                const target = REGION_BY_COUNTRY[country] || region; // défaut = région d'origine
                buckets[target].push(rec);
            }
        }
        
        // Remplace les données par les nouveaux seaux
        indicesData.indices = buckets;
        
        console.log('Réorganisation des indices par pays effectuée');
    }
    
    /**
     * Trouve un indice par alias avec regex - VERSION CORRIGÉE
     * Cherche dans toutes les régions si nécessaire
     */
    function findIndexByAlias(region, dataIndexKey) {
        const patterns = OVERVIEW_ALIASES[region]?.[dataIndexKey] || [];
        
        // Chercher d'abord dans la région spécifiée
        let found = (indicesData.indices[region] || []).find(idx =>
            patterns.some(rx => 
                rx.test(idx.index_name || '') || 
                rx.test(idx.country || '') ||
                rx.test(idx.symbol || '')
            )
        );
        
        // Si pas trouvé, chercher dans toutes les régions
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
        td.textContent = text ?? '-';
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
                    <div style="min-width: 62px; text-align: right;">YTD</div>
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
            
            // Normaliser toutes les données
            ['europe', 'north-america', 'latin-america', 'asia', 'other'].forEach(region => {
                indicesData.indices[region] = (rawData.indices[region] || []).map(normalizeRecord);
            });
            
            // Réorganiser les indices par pays dans les bonnes régions
            rebalanceRegionsByCountry();
            
            indicesData.meta = rawData.meta;
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(indicesData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure
            
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
            // Mettre à jour l'horodatage avec le bon fuseau horaire
            const timestamp = new Date(indicesData.meta.timestamp);
            const formattedDate = new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'long',
                timeStyle: 'medium',
                timeZone: 'Europe/Paris'
            }).format(timestamp);
            
            document.getElementById('last-update-time').textContent = 
                formattedDate + (indicesData.meta.isStale ? ' (anciennes données)' : '');
            
            // Mettre à jour la source dynamiquement
            const sourceLink = document.querySelector('a[href*="boursorama"]');
            if (sourceLink && indicesData.meta.source) {
                sourceLink.textContent = indicesData.meta.source;
            }
            
            // Générer le HTML pour chaque région
            const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
            
            regions.forEach(region => {
                const indices = indicesData.indices[region] || [];
                const tableBody = document.getElementById(`${region}-indices-body`);
                
                if (tableBody) {
                    tableBody.innerHTML = '';
                    
                    if (indices.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="5" class="text-center py-4 text-gray-400">
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
                            
                            tr.appendChild(createTableCell(index.country, 'font-medium'));
                            tr.appendChild(createTableCell(index.index_name));
                            tr.appendChild(createTableCell(index.value));
                            tr.appendChild(createTableCell(formatPercent(index.change_num), changeClass));
                            tr.appendChild(createTableCell(formatPercent(index.ytd_num), ytdClass));
                            
                            tableBody.appendChild(tr);
                        });
                    }
                    
                    updateRegionSummary(region, indices);
                }
            });
            
            updateTopPerformers();
            updateMarketOverview();
            
            // Activer le tri sur toutes les tables après le rendu
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
     * Les sélecteurs correspondent maintenant aux attributs data-index du HTML
     */
    function updateMarketOverview() {
        try {
            console.log('Mise à jour de l\'aperçu des marchés mondiaux...');
            
            // Europe - sélecteurs corrigés pour correspondre au HTML
            updateMarketOverviewRegion('europe', [
                { key: 'germany',     display: 'Allemagne',   selector: '[data-index="germany"]' },
                { key: 'france',      display: 'France',      selector: '[data-index="france"]' },
                { key: 'uk',          display: 'Royaume-Uni', selector: '[data-index="uk"]' },
                { key: 'switzerland', display: 'Suisse',      selector: '[data-index="switzerland"]' },
                { key: 'europe',      display: 'Europe',      selector: '[data-index="europe"]' },
            ]);
            
            // Amérique du Nord
            updateMarketOverviewRegion('north-america', [
                { key: 'sp500',    display: 'S&P 500',    selector: '[data-index="sp500"]' },
                { key: 'dowjones', display: 'DOW JONES',  selector: '[data-index="dowjones"]' },
                { key: 'canada',   display: 'Canada',     selector: '[data-index="canada"]' },
                { key: 'vix',      display: 'VIX',        selector: '[data-index="vix"]' },
            ]);
            
            // Amérique Latine
            updateMarketOverviewRegion('latin-america', [
                { key: 'brazil',    display: 'Brésil',    selector: '[data-index="brazil"]' },
                { key: 'mexico',    display: 'Mexique',   selector: '[data-index="mexico"]' },
                { key: 'chile',     display: 'Chili',     selector: '[data-index="chile"]' },
                { key: 'argentina', display: 'Argentine', selector: '[data-index="argentina"]' },
            ]);
            
            // Asie
            updateMarketOverviewRegion('asia', [
                { key: 'china',  display: 'Chine',   selector: '[data-index="china"]' },
                { key: 'japan',  display: 'Japon',   selector: '[data-index="japan"]' },
                { key: 'india',  display: 'Inde',    selector: '[data-index="india"]' },
                { key: 'taiwan', display: 'Taïwan',  selector: '[data-index="taiwan"]' },
            ]);
            
            // Autres régions
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
     * Met à jour une région spécifique de l'aperçu des marchés - VERSION CORRIGÉE
     */
    function updateMarketOverviewRegion(region, indicesInfo) {
        indicesInfo.forEach(indexInfo => {
            try {
                const container = document.querySelector(indexInfo.selector);
                if (!container) {
                    console.warn(`Élément non trouvé: ${indexInfo.selector}`);
                    return;
                }
                
                // Utilise la clé pour chercher dans les aliases
                const index = findIndexByAlias(region, indexInfo.key);
                if (!index) {
                    console.warn(`Indice non trouvé pour clé: ${indexInfo.key} dans ${region}`);
                    return;
                }
                
                console.log(`✅ Trouvé ${indexInfo.key}: ${index.index_name} (${index.change_num}%, YTD ${index.ytd_num}%)`);
                
                const nameElement = container.querySelector('.market-index-name');
                const valueElement = container.querySelector('.market-value');
                const ytdElement = container.querySelector('.market-ytd');
                
                if (nameElement) {
                    nameElement.textContent = indexInfo.display || index.country || indexInfo.key;
                }
                
                if (valueElement) {
                    valueElement.textContent = formatPercent(index.change_num);
                    valueElement.className = 'market-value ' + 
                        (index.change_num < -0.01 ? 'negative' : 
                         index.change_num > 0.01 ? 'positive' : 'neutral');
                }
                
                if (ytdElement) {
                    ytdElement.textContent = `YTD ${formatPercent(index.ytd_num)}`;
                    ytdElement.className = 'market-ytd ' + 
                        (index.ytd_num < -0.01 ? 'negative' : 
                         index.ytd_num > 0.01 ? 'positive' : 'neutral');
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
        
        // Calculer la moyenne des variations pour déterminer la tendance
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
     * Calcule et affiche les top performers
     */
    function updateTopPerformers() {
        const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
        const allIndices = regions.flatMap(r => indicesData.indices[r] || []);
        
        if (allIndices.length < 3) return;
        
        // Trier par variation quotidienne et YTD
        const byDaily = [...allIndices].sort((a, b) => 
            b.change_num - a.change_num || b.ytd_num - a.ytd_num
        );
        const byYTD = [...allIndices].sort((a, b) => 
            b.ytd_num - a.ytd_num || b.change_num - a.change_num
        );
        
        updateTopPerformersHTML('daily-top', byDaily.slice(0, 3), 'change_num');
        updateTopPerformersHTML('daily-bottom', byDaily.slice(-3).reverse(), 'change_num');
        updateTopPerformersHTML('ytd-top', byYTD.slice(0, 3), 'ytd_num');
        updateTopPerformersHTML('ytd-bottom', byYTD.slice(-3).reverse(), 'ytd_num');
    }
    
    /**
     * Met à jour le HTML pour une section de top performers
     */
    function updateTopPerformersHTML(containerId, items, field) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
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
