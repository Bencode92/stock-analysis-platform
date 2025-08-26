/**
 * marches-script.js - Version compatible Twelve Data avec corrections majeures
 * Les données sont mises à jour régulièrement par GitHub Actions
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
    const OVERVIEW_ALIASES = {
        'europe': {
            'CAC 40':       [/CAC\s*40/i, /France ETF/i],
            'DAX':          [/DAX/i, /Germany ETF/i],
            'FTSE 100':     [/FTSE\s*100/i, /United Kingdom ETF/i],
            'EURO STOXX 50':[/EURO\s*STOXX\s*50/i, /Europe 50/i, /SPDR EURO STOXX 50/i],
        },
        'north-america': {
            'S&P 500':         [/S&P\s*500/i, /SPDR S&P 500/i, /\bSPY\b/i],
            'DOW JONES':       [/Dow\s*Jones/i, /SPDR Dow Jones/i],
            'NASDAQ Composite':[/NASDAQ\s*(Composite|100)?/i, /\bQQQ\b/i, /Invesco QQQ/i],
            'VIX':             [/\bVIX\b/i, /Volatility/i, /iPath.*VIX/i],
        },
        'latin-america': {
            'BRAZIL': [/Brazil/i, /Brésil/i],
            'MEXICO': [/Mexico/i, /Mexique/i],
            'CHILE':  [/Chile/i, /Chili/i],
            'MERVAL': [/MERVAL/i, /Argentina/i, /Argentine/i, /Global X MSCI Argentina/i],
        },
        'asia': {
            'NIKKEI 225':       [/NIKKEI\s*225/i, /Japan ETF/i, /Japon/i],
            'HANG SENG':        [/HANG\s*SENG/i, /Hong Kong/i],
            'SHANGHAI':         [/SHANGHAI/i],
            'BSE SENSEX':       [/SENSEX/i, /India ETF/i, /Inde/i],
            'CSI (China)':      [/CSI\s*(100|300|500)/i, /China A-?Shares?/i, /Harvest CSI/i]
        },
        'other': {
            'South Africa': [/South\s*Africa/i, /Afrique du Sud/i],
            'Australia':    [/Australia/i, /Australie/i],
            'Israel':       [/Israel/i, /Israël/i],
            'Turkey':       [/Turkey/i, /Turquie/i, /Morocco/i, /Maroc/i]
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
     * Trouve un indice par alias avec regex
     */
    function findIndexByAlias(region, label) {
        const patterns = OVERVIEW_ALIASES[region]?.[label] || [];
        return (indicesData.indices[region] || []).find(idx =>
            patterns.some(rx => 
                rx.test(idx.index_name || '') || 
                rx.test(idx.country || '')
            )
        );
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
     * Met à jour l'aperçu des marchés mondiaux
     */
    function updateMarketOverview() {
        try {
            console.log('Mise à jour de l\'aperçu des marchés mondiaux...');
            
            // Europe
            updateMarketOverviewRegion('europe', [
                { label: 'CAC 40', selector: '.market-index-col[data-index="cac40"]' },
                { label: 'DAX', selector: '.market-index-col[data-index="dax"]' },
                { label: 'FTSE 100', selector: '.market-index-col[data-index="ftse100"]' },
                { label: 'EURO STOXX 50', selector: '.market-index-col[data-index="eurostoxx50"]' }
            ]);
            
            // Amérique du Nord
            updateMarketOverviewRegion('north-america', [
                { label: 'S&P 500', selector: '.market-index-col[data-index="sp500"]' },
                { label: 'DOW JONES', selector: '.market-index-col[data-index="dowjones"]' },
                { label: 'NASDAQ Composite', selector: '.market-index-col[data-index="nasdaq"]' },
                { label: 'VIX', selector: '.market-index-col[data-index="vix"]' }
            ]);
            
            // Amérique Latine - avec libellés français
            updateMarketOverviewRegion('latin-america', [
                { label: 'BRAZIL',  display: 'Brésil',    selector: '.market-index-col[data-index="brazil"]' },
                { label: 'MEXICO',  display: 'Mexique',   selector: '.market-index-col[data-index="mexico"]' },
                { label: 'CHILE',   display: 'Chili',     selector: '.market-index-col[data-index="chile"]'  },
                { label: 'MERVAL',  display: 'Argentine', selector: '.market-index-col[data-index="argentina"]' }
            ]);
            
            // Asie
            updateMarketOverviewRegion('asia', [
                { label: 'NIKKEI 225', selector: '.market-index-col[data-index="nikkei"]' },
                { label: 'HANG SENG', selector: '.market-index-col[data-index="hangseng"]' },
                { label: 'SHANGHAI', selector: '.market-index-col[data-index="shanghai"]' },
                { label: 'BSE SENSEX', selector: '.market-index-col[data-index="sensex"]' }
            ]);
            
            // Autres régions - avec libellés français
            updateMarketOverviewRegion('other', [
                { label: 'South Africa', display: 'Afrique du Sud', selector: '.market-index-col[data-index="southafrica"]' },
                { label: 'Australia',    display: 'Australie',      selector: '.market-index-col[data-index="australia"]'   },
                { label: 'Israel',       display: 'Israël',         selector: '.market-index-col[data-index="israel"]'      },
                { label: 'Turkey',       display: 'Turquie',        selector: '.market-index-col[data-index="morocco"]'     }
            ]);
            
            console.log('Mise à jour de l\'aperçu des marchés terminée');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'aperçu des marchés:', error);
        }
    }
    
    /**
     * Met à jour une région spécifique de l'aperçu des marchés
     */
    function updateMarketOverviewRegion(region, indicesInfo) {
        indicesInfo.forEach(indexInfo => {
            try {
                const container = document.querySelector(indexInfo.selector);
                if (!container) {
                    console.warn(`Élément non trouvé: ${indexInfo.selector}`);
                    return;
                }
                
                const index = findIndexByAlias(region, indexInfo.label);
                if (!index) {
                    console.warn(`Indice non trouvé: ${indexInfo.label} dans ${region}`);
                    return;
                }
                
                const nameElement = container.querySelector('.market-index-name');
                const valueElement = container.querySelector('.market-value');
                const ytdElement = container.querySelector('.market-ytd');
                
                if (nameElement) {
                    // Utilise le libellé FR si présent, sinon la clé technique
                    nameElement.textContent = indexInfo.display || indexInfo.label;
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
                console.error(`Erreur lors de la mise à jour de ${indexInfo.label}:`, error);
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
        
        // Sélectionner les indices importants avec les aliases
        const labels = Object.keys(OVERVIEW_ALIASES[region] || {});
        const importantIndices = labels.map(label => findIndexByAlias(region, label)).filter(Boolean);
        
        // Si pas assez d'indices importants, prendre les premiers
        while (importantIndices.length < 4 && indices.length > importantIndices.length) {
            const remainingIndices = indices.filter(idx => !importantIndices.includes(idx));
            if (remainingIndices.length > 0) {
                importantIndices.push(remainingIndices[0]);
            }
        }
        
        // Calculer la moyenne des variations pour déterminer la tendance
        const avgChange = importantIndices.reduce((sum, idx) => 
            sum + (idx.change_num || 0), 0) / Math.max(1, importantIndices.length);
        
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