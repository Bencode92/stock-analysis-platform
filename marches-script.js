/**
 * marches-script.js - Extraction directe des indices boursiers depuis Boursorama
 * Mise à jour automatique toutes les 15 minutes
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configuration globale
    const SCRAPER_CONFIG = {
        // URL source des données (Boursorama Indices Internationaux)
        sourceUrl: 'https://www.boursorama.com/bourse/indices/internationaux',
        
        // Liste de proxies CORS - on essaiera chacun jusqu'à ce qu'un fonctionne
        corsProxies: [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://thingproxy.freeboard.io/fetch/'
        ],
        
        // Intervalle de mise à jour (15 minutes en ms)
        updateInterval: 15 * 60 * 1000,
        
        // Structure des régions pour la classification des indices
        regions: {
            europe: [
                'CAC', 'DAX', 'FTSE', 'IBEX', 'MIB', 'AEX', 'BEL', 'SMI', 'ATX', 
                'OMX', 'OMXS', 'ISEQ', 'PSI', 'ATHEX', 'OSEBX', 'STOXX', 'EURO'
            ],
            us: [
                'DOW', 'S&P', 'NASDAQ', 'RUSSELL', 'CBOE', 'NYSE', 'AMEX'
            ],
            asia: [
                'NIKKEI', 'HANG SENG', 'SHANGHAI', 'SHENZHEN', 'KOSPI', 'SENSEX', 
                'BSE', 'TAIEX', 'STRAITS', 'JAKARTA', 'KLSE', 'KOSDAQ', 'ASX'
            ],
            other: [
                'MERVAL', 'BOVESPA', 'IPC', 'IPSA', 'COLCAP', 'BVLG', 'IBC', 'CASE', 
                'ISE', 'TA', 'QE', 'FTSE/JSE', 'MOEX', 'MSX30'
            ]
        }
    };
    
    // Variables globales pour stocker les données
    let indicesData = {
        indices: {
            europe: [],
            us: [],
            asia: [],
            other: []
        },
        meta: {
            source: 'Boursorama',
            url: SCRAPER_CONFIG.sourceUrl,
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    let updateTimer = null;
    let fetchSuccess = false;
    
    // Initialiser les onglets de région
    initRegionTabs();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Premier chargement des données
    loadIndicesData();
    
    // Configurer la mise à jour automatique
    setupAutoRefresh();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('refresh-data').addEventListener('click', function() {
        this.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i> Chargement...';
        this.disabled = true;
        
        loadIndicesData(true).finally(() => {
            this.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Rafraîchir';
            this.disabled = false;
        });
    });
    
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadIndicesData(true);
    });
    
    /**
     * Configure la mise à jour automatique
     */
    function setupAutoRefresh() {
        // Effacer l'ancien timer si existant
        if (updateTimer) {
            clearInterval(updateTimer);
        }
        
        // Créer un nouveau timer
        updateTimer = setInterval(() => {
            console.log('🔄 Mise à jour automatique des indices...');
            loadIndicesData();
        }, SCRAPER_CONFIG.updateInterval);
        
        console.log(`⏱️ Mise à jour automatique configurée toutes les ${SCRAPER_CONFIG.updateInterval / 60000} minutes`);
    }
    
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
     * Charge les données d'indices depuis Boursorama
     */
    async function loadIndicesData(forceRefresh = false) {
        // Éviter les chargements multiples simultanés
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        
        // Afficher le loader
        showElement('indices-loading');
        hideElement('indices-error');
        hideElement('indices-container');
        
        try {
            // Tenter de récupérer les données
            const success = await fetchIndicesData();
            
            if (success) {
                // Données récupérées avec succès
                indicesData.meta.isStale = false;
                renderIndicesData();
                lastUpdate = new Date();
                fetchSuccess = true;
            } else {
                // Échec de la récupération
                if (!fetchSuccess) {
                    // Aucune donnée précédente disponible
                    showElement('indices-error');
                    hideElement('indices-loading');
                    hideElement('indices-container');
                } else {
                    // On a des données précédentes
                    indicesData.meta.isStale = true;
                    renderIndicesData();
                    showNotification('Impossible de mettre à jour les données. Affichage des valeurs précédentes.', 'warning');
                }
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            
            if (fetchSuccess) {
                // On a des données précédentes
                indicesData.meta.isStale = true;
                renderIndicesData();
                showNotification('Impossible de mettre à jour les données. Affichage des valeurs précédentes.', 'warning');
            } else {
                showElement('indices-error');
                hideElement('indices-loading');
                hideElement('indices-container');
            }
        } finally {
            // Réinitialiser l'état
            isLoading = false;
        }
    }
    
    /**
     * Récupère les données des indices depuis Boursorama en essayant différents proxies CORS
     */
    async function fetchIndicesData() {
        console.log('🔄 Récupération des données depuis Boursorama...');
        
        // Essayer chaque proxy CORS jusqu'à ce qu'un fonctionne
        for (const corsProxy of SCRAPER_CONFIG.corsProxies) {
            try {
                console.log(`Tentative avec le proxy: ${corsProxy}`);
                const url = corsProxy + encodeURIComponent(SCRAPER_CONFIG.sourceUrl);
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    console.warn(`Erreur HTTP avec le proxy ${corsProxy}: ${response.status}`);
                    continue; // Essayer le prochain proxy
                }
                
                const html = await response.text();
                
                // Vérifier si nous avons récupéré du HTML valide
                if (!html || html.length < 1000 || !html.includes('<!DOCTYPE html>')) {
                    console.warn(`Réponse invalide du proxy ${corsProxy}`);
                    continue; // Essayer le prochain proxy
                }
                
                console.log(`✅ Proxy ${corsProxy} a fonctionné!`);
                
                // Parser le HTML
                const result = parseIndicesFromHTML(html);
                
                // Mettre à jour les méta-données
                indicesData.meta.timestamp = new Date().toISOString();
                indicesData.meta.count = 
                    indicesData.indices.europe.length + 
                    indicesData.indices.us.length + 
                    indicesData.indices.asia.length + 
                    indicesData.indices.other.length;
                
                console.log(`✅ Données récupérées avec succès: ${indicesData.meta.count} indices`);
                
                // Vérifier si nous avons des données
                if (indicesData.meta.count === 0) {
                    console.warn('⚠️ Aucun indice trouvé dans la page Boursorama');
                    return false;
                }
                
                return true;
            } catch (error) {
                console.warn(`❌ Erreur avec le proxy ${corsProxy}:`, error);
                // Continuer avec le prochain proxy
            }
        }
        
        console.error('❌ Tous les proxies CORS ont échoué');
        return false;
    }
    
    /**
     * Parse les indices depuis le HTML de Boursorama
     * Utilise une méthode simple et robuste pour extraire les données du tableau
     */
    function parseIndicesFromHTML(html) {
        try {
            // Réinitialiser les données
            indicesData.indices = {
                europe: [],
                us: [],
                asia: [],
                other: []
            };
            
            // Créer un DOM temporaire
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Trouver tous les tableaux dans la page
            const tables = doc.querySelectorAll('table');
            console.log(`Nombre de tableaux trouvés: ${tables.length}`);
            
            // Parcourir tous les tableaux pour trouver celui des indices
            let indicesTable = null;
            for (const table of tables) {
                // Vérifier si c'est le tableau des indices (contient des en-têtes typiques)
                const headers = table.querySelectorAll('th');
                const headerTexts = Array.from(headers).map(h => h.textContent.trim().toLowerCase());
                
                // Chercher des mots-clés typiques dans les en-têtes
                if (headerTexts.some(text => 
                    text.includes('indice') || 
                    text.includes('dernier') || 
                    text.includes('var') ||
                    text.includes('variation'))) {
                    indicesTable = table;
                    console.log('Table des indices trouvée!');
                    break;
                }
            }
            
            if (!indicesTable) {
                console.warn('Aucun tableau d\'indices trouvé dans la page');
                return false;
            }
            
            // Extraire les données des lignes
            const rows = indicesTable.querySelectorAll('tbody tr');
            console.log(`Nombre de lignes trouvées: ${rows.length}`);
            
            // Parcourir les lignes et extraire les données
            rows.forEach(row => {
                try {
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length >= 3) {
                        // Extraire le nom de l'indice (priorité au texte du lien)
                        const nameEl = row.querySelector('a');
                        let name = nameEl ? nameEl.textContent.trim() : '';
                        
                        // Si pas de lien, essayer la première ou deuxième cellule
                        if (!name && cells[0]) name = cells[0].textContent.trim();
                        if (!name && cells[1]) name = cells[1].textContent.trim();
                        
                        // Vérifier que c'est un nom d'indice valide
                        if (name && name.length > 1 && !name.match(/^\d+/)) {
                            // Trouver les cellules de valeur et variation
                            // On ne peut pas supposer des positions fixes, alors on cherche
                            // les cellules qui ressemblent à des nombres ou pourcentages
                            let value = '';
                            let change = '';
                            let opening = '';
                            
                            // Parcourir les cellules
                            for (let i = 1; i < cells.length; i++) {
                                const text = cells[i].textContent.trim();
                                
                                // Si c'est un pourcentage, c'est probablement la variation
                                if (text.includes('%') && !change) {
                                    change = text;
                                    continue;
                                }
                                
                                // Si c'est un nombre et qu'on n'a pas encore de valeur
                                if (text.match(/[0-9]/) && !value) {
                                    value = text;
                                    continue;
                                }
                                
                                // Si c'est un nombre et qu'on a déjà une valeur mais pas d'ouverture
                                if (text.match(/[0-9]/) && value && !opening) {
                                    opening = text;
                                    continue;
                                }
                            }
                            
                            // Ne créer l'indice que si on a au moins une valeur et idéalement une variation
                            if (value) {
                                // Déterminer la tendance (hausse/baisse)
                                const trend = change && change.includes('-') ? 'down' : 'up';
                                
                                // Créer l'objet indice
                                const index = {
                                    name,
                                    value,
                                    change: change || '',
                                    changePercent: change || '',
                                    opening: opening || '',
                                    high: '',
                                    low: '',
                                    trend
                                };
                                
                                // Classer l'indice dans la bonne région
                                classifyIndex(index);
                            }
                        }
                    }
                } catch (rowError) {
                    console.warn('Erreur lors du traitement d\'une ligne:', rowError);
                }
            });
            
            return true;
        } catch (error) {
            console.error('Erreur lors du parsing du HTML:', error);
            return false;
        }
    }
    
    /**
     * Classe un indice dans la bonne région
     */
    function classifyIndex(index) {
        // Convertir le nom en majuscules pour faciliter la comparaison
        const name = index.name.toUpperCase();
        
        // Vérifier chaque région
        for (const [region, keywords] of Object.entries(SCRAPER_CONFIG.regions)) {
            if (keywords.some(keyword => name.includes(keyword))) {
                indicesData.indices[region].push(index);
                return;
            }
        }
        
        // Par défaut, ajouter à "other"
        indicesData.indices.other.push(index);
    }
    
    /**
     * Affiche les données d'indices dans l'interface
     */
    function renderIndicesData() {
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(indicesData.meta.timestamp);
            let formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // Ajouter un indicateur si les données sont périmées
            if (indicesData.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Générer le HTML pour chaque région
            const regions = ['europe', 'us', 'asia', 'other'];
            
            regions.forEach(region => {
                const indices = indicesData.indices[region] || [];
                const tableBody = document.getElementById(`${region}-indices-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas d'indices, afficher un message
                    if (indices.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="7" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Remplir avec les données
                        indices.forEach(index => {
                            const row = document.createElement('tr');
                            
                            row.innerHTML = `
                                <td class="font-medium">${index.name}</td>
                                <td>${index.value || '-'}</td>
                                <td class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.change || '-'}</td>
                                <td class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.changePercent || '-'}</td>
                                <td>${index.opening || '-'}</td>
                                <td>${index.high || '-'}</td>
                                <td>${index.low || '-'}</td>
                            `;
                            
                            tableBody.appendChild(row);
                        });
                    }
                    
                    // Mettre à jour le résumé
                    updateRegionSummary(region, indices);
                }
            });
            
            // Masquer le loader et afficher les données
            hideElement('indices-loading');
            hideElement('indices-error');
            showElement('indices-container');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\\'affichage des données:', error);
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
        
        if (!summaryContainer || !trendElement) return;
        
        // Si pas d'indices, afficher un message
        if (!indices.length) {
            summaryContainer.innerHTML = `
                <div class="col-span-2 text-center text-gray-400">
                    Aucune donnée disponible
                </div>
            `;
            
            // Masquer la tendance
            trendElement.innerHTML = '';
            return;
        }
        
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
                <div class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.changePercent || '-'}</div>
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
});