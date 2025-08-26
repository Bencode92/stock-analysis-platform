/**
 * secteurs-script.js - Version alignée avec marches-script.js
 * Scripts pour la page des secteurs boursiers avec UX améliorée
 */

document.addEventListener('DOMContentLoaded', function() {
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
    
    // Mapping des catégories sectorielles vers régions
    const SECTOR_MAPPINGS = {
        'energy': 'Énergie',
        'materials': 'Matériaux',
        'industrials': 'Industrie',
        'consumer-discretionary': 'Consommation Discrétionnaire',
        'consumer-staples': 'Consommation de Base',
        'healthcare': 'Santé',
        'financials': 'Finance',
        'information-technology': 'Technologie',
        'communication-services': 'Communication',
        'utilities': 'Services Publics',
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
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('sectors-error');
        showElement('sectors-loading');
        loadSectorsData(true);
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
    function normalizeRecord(rec, category) {
        const r = {...rec};
        r.category = category;
        r.value_num = toNumber(r.value);
        r.change_num = parsePercentToNumber(r.changePercent);
        r.ytd_num = parsePercentToNumber(r.ytdChange);
        r.trend = r.change_num > 0 ? 'up' : r.change_num < 0 ? 'down' : 'flat';
        
        // Normaliser le nom du secteur
        if (!r.displayName) {
            r.displayName = SECTOR_MAPPINGS[category] || r.name;
        }
        
        return r;
    }
    
    /**
     * Créer une cellule de tableau de manière sécurisée
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
                    
                    // Classifier par région basé sur le nom ou la source
                    if (normalizedSector.name && 
                        (normalizedSector.name.includes("Stoxx Europe 600") || 
                         normalizedSector.name.includes("STOXX Europe 600") ||
                         normalizedSector.source === "Les Echos")) {
                        europeData.push(normalizedSector);
                    } else if (normalizedSector.name && 
                               (normalizedSector.name.includes("NASDAQ US") || 
                                normalizedSector.source === "Boursorama")) {
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
                            <td colspan="4" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        const sortedSectors = [...sectors].sort((a, b) => {
                            return (a.displayName || "").localeCompare(b.displayName || "");
                        });
                        
                        sortedSectors.forEach(sector => {
                            const tr = document.createElement('tr');
                            
                            const changeClass = sector.change_num < -0.01 ? 'negative' : 
                                              sector.change_num > 0.01 ? 'positive' : 'neutral';
                            const ytdClass = sector.ytd_num < -0.01 ? 'negative' : 
                                           sector.ytd_num > 0.01 ? 'positive' : 'neutral';
                            
                            tr.appendChild(createTableCell(sector.displayName || sector.name));
                            tr.appendChild(createTableCell(sector.value));
                            tr.appendChild(createTableCell(formatPercent(sector.change_num), changeClass));
                            tr.appendChild(createTableCell(formatPercent(sector.ytd_num), ytdClass));
                            
                            tableBody.appendChild(tr);
                        });
                    }
                    
                    updateRegionSummary(region, sectors);
                }
            });
            
            updateTopPerformers();
            updateSectorOverview();
            
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
     */
    function updateSectorOverviewRegion(region, sectorsInfo) {
        sectorsInfo.forEach(sectorInfo => {
            try {
                const container = document.querySelector(sectorInfo.selector);
                if (!container) {
                    console.warn(`Élément non trouvé: ${sectorInfo.selector}`);
                    return;
                }
                
                const sector = (sectorsData.sectors[region] || [])
                    .find(s => s.category === sectorInfo.category);
                
                if (!sector) {
                    console.warn(`Secteur non trouvé: ${sectorInfo.category} dans ${region}`);
                    return;
                }
                
                const nameElement = container.querySelector('.sector-name');
                const valueElement = container.querySelector('.sector-value');
                const ytdElement = container.querySelector('.sector-ytd');
                
                if (nameElement) {
                    nameElement.textContent = SECTOR_MAPPINGS[sectorInfo.category] || sector.displayName;
                }
                
                if (valueElement) {
                    valueElement.textContent = formatPercent(sector.change_num);
                    valueElement.className = 'sector-value ' + 
                        (sector.change_num < -0.01 ? 'negative' : 
                         sector.change_num > 0.01 ? 'positive' : 'neutral');
                }
                
                if (ytdElement) {
                    ytdElement.textContent = `YTD ${formatPercent(sector.ytd_num)}`;
                    ytdElement.className = 'sector-ytd ' + 
                        (sector.ytd_num < -0.01 ? 'negative' : 
                         sector.ytd_num > 0.01 ? 'positive' : 'neutral');
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
     * Calcule et affiche les top performers
     */
    function updateTopPerformers() {
        const regions = ['europe', 'us'];
        const allSectors = regions.flatMap(r => sectorsData.sectors[r] || []);
        
        if (allSectors.length < 3) return;
        
        // Trier par variation quotidienne et YTD
        const byDaily = [...allSectors].sort((a, b) => 
            b.change_num - a.change_num || b.ytd_num - a.ytd_num
        );
        const byYTD = [...allSectors].sort((a, b) => 
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
        
        items.forEach(sector => {
            const val = sector[field] ?? 0;
            const css = val < -0.01 ? 'negative' : val > 0.01 ? 'positive' : 'neutral';
            
            // Déterminer la région d'affichage
            const regionDisplay = sectorsData.sectors.europe.includes(sector) ? "STOXX Europe 600" : "NASDAQ US";
            
            const row = document.createElement('div');
            row.className = 'performer-row';
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${sector.displayName || sector.name || ''}</div>
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
