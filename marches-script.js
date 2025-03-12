/**
 * marches-script.js
 * 
 * Ce script extrait les données des indices boursiers internationaux depuis Boursorama
 * et les affiche dans le tableau de bord TradePulse
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const BOURSORAMA_URL = 'https://www.boursorama.com/bourse/indices/internationaux';
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes en millisecondes
    
    // Cache des données
    let marketIndicesCache = {
        data: null,
        timestamp: null
    };
    
    // Variables globales
    let indicesData = {};
    
    // Initialiser les onglets de région
    initRegionTabs();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Charger les données
    loadIndicesData();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('refresh-data').addEventListener('click', function() {
        this.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i> Chargement...';
        this.disabled = true;
        
        // Forcer le rafraîchissement des données
        marketIndicesCache.timestamp = null;
        loadIndicesData().finally(() => {
            this.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Rafraîchir';
            this.disabled = false;
        });
    });
    
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadIndicesData();
    });
    
    /**
     * Initialise les onglets de région
     */
    function initRegionTabs() {
        const tabs = document.querySelectorAll('.region-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Mettre à jour les onglets actifs
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher le contenu correspondant
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
     * Charge les données d'indices depuis Boursorama ou du cache
     */
    async function loadIndicesData() {
        try {
            // Afficher le loader
            showElement('indices-loading');
            hideElement('indices-error');
            hideElement('indices-container');
            
            // Vérifier le cache
            const now = Date.now();
            if (marketIndicesCache.data && marketIndicesCache.timestamp && 
                now - marketIndicesCache.timestamp < CACHE_DURATION) {
                console.log('Utilisation des données en cache');
                indicesData = marketIndicesCache.data;
                renderIndicesData();
                return;
            }
            
            // Utiliser Brave Search API ou une autre méthode pour contourner les restrictions CORS
            // Note: Nous allons simuler l'extraction des données ici
            
            console.log('Extraction des données depuis Boursorama...');
            
            // Comme nous sommes dans le navigateur sans serveur, nous utilisons un proxy CORS
            // Vous pouvez remplacer ceci par un proxy CORS de votre choix
            const proxyUrl = 'https://corsproxy.io/?';
            const response = await fetch(proxyUrl + encodeURIComponent(BOURSORAMA_URL));
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const html = await response.text();
            
            // Analyser le HTML avec DOMParser (méthode sûre côté client)
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extraire les données
            const indices = [];
            const rows = doc.querySelectorAll('table.c-table tbody tr');
            
            rows.forEach(row => {
                try {
                    // Extraire les données de chaque colonne
                    const name = row.querySelector('.c-table__cell--name')?.textContent.trim();
                    const value = row.querySelector('.c-table__cell--value')?.textContent.trim();
                    const change = row.querySelector('.c-table__cell--variation')?.textContent.trim();
                    const changePercent = row.querySelector('.c-table__cell--variation-percent')?.textContent.trim();
                    const opening = row.querySelector('.c-table__cell--open')?.textContent.trim();
                    const high = row.querySelector('.c-table__cell--high')?.textContent.trim();
                    const low = row.querySelector('.c-table__cell--low')?.textContent.trim();
                    
                    // Déterminer la tendance (hausse ou baisse)
                    const isDown = row.querySelector('.c-table__cell--variation-percent')?.classList.contains('c-table__cell--down');
                    const trend = isDown ? 'down' : 'up';
                    
                    // Extraire le ticker/symbole (dans l'URL)
                    const linkElement = row.querySelector('.c-table__cell--name a');
                    const href = linkElement?.getAttribute('href') || '';
                    const tickerMatch = href.match(/([^\/]+)$/);
                    const ticker = tickerMatch ? tickerMatch[1] : '';
                    
                    if (name && value) {
                        indices.push({
                            name,
                            ticker,
                            value,
                            change,
                            changePercent,
                            opening,
                            high,
                            low,
                            trend
                        });
                    }
                } catch (err) {
                    console.error('Erreur lors de l\'extraction d\'une ligne:', err);
                }
            });
            
            // Grouper les indices par régions
            const groupedIndices = {
                europe: indices.filter(index => 
                    index.name.includes('CAC') || 
                    index.name.includes('DAX') || 
                    index.name.includes('FTSE') ||
                    index.name.includes('STOXX') ||
                    index.name.includes('AEX') ||
                    index.name.includes('IBEX') ||
                    index.name.includes('SMI')
                ),
                us: indices.filter(index => 
                    index.name.includes('DOW') || 
                    index.name.includes('S&P') || 
                    index.name.includes('NASDAQ') ||
                    index.name.includes('NYSE')
                ),
                asia: indices.filter(index => 
                    index.name.includes('NIKKEI') || 
                    index.name.includes('HANG') || 
                    index.name.includes('SSE') ||
                    index.name.includes('BSE') ||
                    index.name.includes('KOSPI')
                ),
                other: indices.filter(index => 
                    !index.name.includes('CAC') && 
                    !index.name.includes('DAX') && 
                    !index.name.includes('FTSE') &&
                    !index.name.includes('STOXX') &&
                    !index.name.includes('AEX') &&
                    !index.name.includes('IBEX') &&
                    !index.name.includes('SMI') &&
                    !index.name.includes('DOW') && 
                    !index.name.includes('S&P') && 
                    !index.name.includes('NASDAQ') &&
                    !index.name.includes('NYSE') &&
                    !index.name.includes('NIKKEI') && 
                    !index.name.includes('HANG') && 
                    !index.name.includes('SSE') &&
                    !index.name.includes('BSE') &&
                    !index.name.includes('KOSPI')
                )
            };
            
            // Ajouter des métadonnées
            indicesData = {
                indices: groupedIndices,
                meta: {
                    source: 'Boursorama',
                    url: BOURSORAMA_URL,
                    timestamp: new Date().toISOString(),
                    count: indices.length
                }
            };
            
            // Mettre en cache
            marketIndicesCache = {
                data: indicesData,
                timestamp: Date.now()
            };
            
            // Rendre les données dans l'interface
            renderIndicesData();
            
            console.log(`✅ Extraction réussie: ${indices.length} indices récupérés`);
        } catch (error) {
            console.error('Erreur lors de l\'extraction des indices:', error);
            
            // En cas d'erreur, tenter d'utiliser le cache même s'il est expiré
            if (marketIndicesCache.data) {
                console.log('Utilisation du cache expiré suite à une erreur');
                indicesData = marketIndicesCache.data;
                renderIndicesData();
                showNotification('Les données affichées ne sont peut-être pas à jour', 'warning');
            } else {
                // Si pas de cache disponible, afficher l'erreur
                hideElement('indices-loading');
                showElement('indices-error');
            }
        }
    }
    
    /**
     * Affiche les données d'indices dans l'interface
     */
    function renderIndicesData() {
        if (!indicesData?.indices) {
            showElement('indices-error');
            hideElement('indices-loading');
            return;
        }
        
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(indicesData.meta.timestamp);
            const formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Générer le HTML pour chaque région
            const regions = ['europe', 'us', 'asia', 'other'];
            
            regions.forEach(region => {
                const indices = indicesData.indices[region] || [];
                const tableBody = document.getElementById(`${region}-indices-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Remplir avec les données
                    indices.forEach(index => {
                        const row = document.createElement('tr');
                        
                        row.innerHTML = `
                            <td class="font-medium">${index.name}</td>
                            <td>${index.value || '-'}</td>
                            <td class="${index.trend === 'down' ? 'negative' : 'positive'}">$ {index.change || '-'}</td>
                            <td class="${index.trend === 'down' ? 'negative' : 'positive'}">$ {index.changePercent || '-'}</td>
                            <td>${index.opening || '-'}</td>
                            <td>${index.high || '-'}</td>
                            <td>${index.low || '-'}</td>
                        `;
                        
                        tableBody.appendChild(row);
                    });
                    
                    // Mettre à jour le résumé
                    updateRegionSummary(region, indices);
                }
            });
            
            // Masquer le loader et afficher les données
            hideElement('indices-loading');
            hideElement('indices-error');
            showElement('indices-container');
            
        } catch (error) {
            console.error('Erreur lors de l\'affichage des données:', error);
            hideElement('indices-loading');
            showElement('indices-error');
        }
    }
    
    /**
     * Met à jour le résumé des indices pour une région donnée
     */
    function updateRegionSummary(region, indices) {
        const summaryContainer = document.getElementById(`${region}-indices-summary`);
        const trendElement = document.getElementById(`${region}-trend`);
        
        if (!summaryContainer || !trendElement || !indices.length) return;
        
        // Compter les indices en hausse et en baisse
        const upCount = indices.filter(index => index.trend === 'up').length;
        const downCount = indices.filter(index => index.trend === 'down').length;
        
        // Déterminer la tendance générale
        const overallTrend = upCount >= downCount ? 'up' : 'down';
        trendElement.className = overallTrend === 'up' ? 'text-sm positive' : 'text-sm negative';
        trendElement.innerHTML = overallTrend === 'up' ? 
            '<i class="fas fa-arrow-up"></i>' : 
            '<i class="fas fa-arrow-down"></i>';
        
        // Sélectionner les indices importants pour cette région
        let importantIndices = [];
        
        switch (region) {
            case 'europe':
                importantIndices = indices.filter(index => 
                    index.name.includes('CAC 40') || 
                    index.name.includes('DAX') || 
                    index.name.includes('FTSE 100') ||
                    index.name.includes('EURO STOXX 50')
                );
                break;
            case 'us':
                importantIndices = indices.filter(index => 
                    index.name.includes('DOW') || 
                    index.name.includes('S&P 500') || 
                    index.name.includes('NASDAQ') ||
                    index.name.includes('RUSSELL')
                );
                break;
            case 'asia':
                importantIndices = indices.filter(index => 
                    index.name.includes('NIKKEI') || 
                    index.name.includes('HANG SENG') || 
                    index.name.includes('SSE') ||
                    index.name.includes('KOSPI')
                );
                break;
            case 'other':
                importantIndices = indices.filter(index => 
                    index.name.includes('BOVESPA') || 
                    index.name.includes('TSX') || 
                    index.name.includes('ASX') ||
                    index.name.includes('RTS')
                );
                break;
        }
        
        // Limiter à 4 indices
        importantIndices = importantIndices.slice(0, 4);
        
        // Si nous n'avons pas 4 indices, prendre les premiers
        while (importantIndices.length < 4 && indices.length > importantIndices.length) {
            const remainingIndices = indices.filter(index => !importantIndices.includes(index));
            importantIndices.push(remainingIndices[0]);
        }
        
        // Générer le HTML
        summaryContainer.innerHTML = '';
        
        importantIndices.forEach(index => {
            const div = document.createElement('div');
            div.innerHTML = `
                <div class="font-medium">${index.name}</div>
                <div class="${index.trend === 'down' ? 'negative' : 'positive'}">$ {index.changePercent || '-'}</div>
            `;
            summaryContainer.appendChild(div);
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
        
        themeToggleBtn.addEventListener('click', function() {
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
     * Fonction pour simuler des données en cas d'échec
     * (Utilisée en dernier recours si l'extraction échoue et qu'il n'y a pas de cache)
     */
    function generateFallbackData() {
        const fallbackData = {
            indices: {
                europe: [
                    {
                        name: "CAC 40",
                        value: "8 201,05",
                        change: "+5,68",
                        changePercent: "+0,07%",
                        opening: "8 195,37",
                        high: "8 205,05",
                        low: "8 154,95",
                        trend: "up"
                    },
                    {
                        name: "DAX",
                        value: "18 384,35",
                        change: "+21,98",
                        changePercent: "+0,12%",
                        opening: "18 362,37",
                        high: "18 401,72",
                        low: "18 315,20",
                        trend: "up"
                    },
                    {
                        name: "FTSE 100",
                        value: "8 174,30",
                        change: "-16,24",
                        changePercent: "-0,20%",
                        opening: "8 190,54",
                        high: "8 195,98",
                        low: "8 163,10",
                        trend: "down"
                    }
                ],
                us: [
                    {
                        name: "DOW JONES",
                        value: "39 375,87",
                        change: "+125,69",
                        changePercent: "+0,32%",
                        opening: "39 250,18",
                        high: "39 427,42",
                        low: "39 217,31",
                        trend: "up"
                    },
                    {
                        name: "S&P 500",
                        value: "5 219,93",
                        change: "+29,05",
                        changePercent: "+0,56%",
                        opening: "5 190,88",
                        high: "5 225,07",
                        low: "5 186,47",
                        trend: "up"
                    },
                    {
                        name: "NASDAQ",
                        value: "16 384,45",
                        change: "+130,27",
                        changePercent: "+0,80%",
                        opening: "16 254,18",
                        high: "16 402,28",
                        low: "16 231,52",
                        trend: "up"
                    }
                ],
                asia: [
                    {
                        name: "NIKKEI 225",
                        value: "38 120,01",
                        change: "-257,36",
                        changePercent: "-0,67%",
                        opening: "38 377,37",
                        high: "38 450,42",
                        low: "38 097,25",
                        trend: "down"
                    },
                    {
                        name: "HANG SENG",
                        value: "17 184,56",
                        change: "-321,35",
                        changePercent: "-1,84%",
                        opening: "17 505,91",
                        high: "17 532,78",
                        low: "17 156,23",
                        trend: "down"
                    },
                    {
                        name: "SSE COMPOSITE",
                        value: "3 042,26",
                        change: "-18,57",
                        changePercent: "-0,61%",
                        opening: "3 060,83",
                        high: "3 067,94",
                        low: "3 039,47",
                        trend: "down"
                    }
                ],
                other: [
                    {
                        name: "BOVESPA",
                        value: "127 156,87",
                        change: "+435,21",
                        changePercent: "+0,34%",
                        opening: "126 721,66",
                        high: "127 304,28",
                        low: "126 587,53",
                        trend: "up"
                    },
                    {
                        name: "TSX",
                        value: "21 984,55",
                        change: "+32,67",
                        changePercent: "+0,15%",
                        opening: "21 951,88",
                        high: "22 015,63",
                        low: "21 932,47",
                        trend: "up"
                    },
                    {
                        name: "ASX 200",
                        value: "7 789,42",
                        change: "+14,36",
                        changePercent: "+0,18%",
                        opening: "7 775,06",
                        high: "7 793,21",
                        low: "7 768,94",
                        trend: "up"
                    }
                ]
            },
            meta: {
                source: "Boursorama (données simulées)",
                url: BOURSORAMA_URL,
                timestamp: new Date().toISOString(),
                count: 12
            }
        };
        
        return fallbackData;
    }
});