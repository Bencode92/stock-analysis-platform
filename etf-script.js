/**
 * etf-script.js - Script pour afficher les ETF mondiaux, américains et européens
 * Données mises à jour régulièrement par GitHub Actions
 */

document.addEventListener('DOMContentLoaded', function() {
    // Variables globales pour stocker les données
    let etfsData = {
        indices: {},
        meta: {
            source: 'Boursorama/JustETF',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // État pour le marché actuel et la pagination
    let currentMarket = 'world'; // 'world', 'us', ou 'eu'
    let currentPage = 1;
    let totalPages = 1;
    let currentCategory = 'all'; // filtre de catégorie actif
    
    // Initialiser les onglets alphabet
    initAlphabetTabs();
    
    // Initialiser les sélecteurs de marché
    initMarketSelector();
    
    // Initialiser la pagination
    initPagination();
    
    // Initialiser les filtres de catégorie
    initCategoryFilters();
    
    // Initialiser la barre de recherche (gérée par le script inline dans le HTML)
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Premier chargement des données
    loadEtfsData();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('etfs-error');
        showElement('etfs-loading');
        loadEtfsData(true);
    });
    
    /**
     * Initialise les onglets alphabet
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
                
                if (letter === 'all') {
                    // Afficher toutes les sections
                    contents.forEach(content => {
                        content.classList.remove('hidden');
                    });
                } else {
                    // Afficher uniquement la section pour cette lettre
                    document.getElementById(`${letter}-etfs`)?.classList.remove('hidden');
                }
            });
        });
    }
    
    /**
     * Initialise les sélecteurs de marché
     */
    function initMarketSelector() {
        const worldButton = document.getElementById('market-world');
        const usButton = document.getElementById('market-us');
        const euButton = document.getElementById('market-eu');
        
        worldButton?.addEventListener('click', function() {
            if (currentMarket !== 'world') {
                // Mettre à jour l'état
                currentMarket = 'world';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadEtfsData(true);
            }
        });
        
        usButton?.addEventListener('click', function() {
            if (currentMarket !== 'us') {
                // Mettre à jour l'état
                currentMarket = 'us';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadEtfsData(true);
            }
        });
        
        euButton?.addEventListener('click', function() {
            if (currentMarket !== 'eu') {
                // Mettre à jour l'état
                currentMarket = 'eu';
                currentPage = 1;
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadEtfsData(true);
            }
        });
    }
    
    /**
     * Initialise les filtres de catégorie
     */
    function initCategoryFilters() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Mettre à jour l'état actif
                filterButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                currentCategory = this.getAttribute('data-category');
                
                // Appliquer le filtre aux données actuellement affichées
                applyFilters();
            });
        });
    }
    
    /**
     * Applique les filtres actuels (catégorie) aux données
     */
    function applyFilters() {
        const allRows = document.querySelectorAll('table.data-table tbody tr');
        
        allRows.forEach(row => {
            if (row.cells.length <= 1) return; // Ignorer les lignes spéciales
            
            if (currentCategory === 'all') {
                row.style.display = '';
            } else {
                const categoryCell = row.cells[1]; // Colonne de catégorie
                if (categoryCell && categoryCell.textContent.toLowerCase().includes(currentCategory)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
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
                loadEtfsData(true);
            }
        });
        
        nextButton?.addEventListener('click', function() {
            if (currentPage < totalPages) {
                currentPage++;
                updatePaginationUI();
                loadEtfsData(true);
            }
        });
    }
    
    /**
     * Met à jour l'interface en fonction du marché sélectionné
     */
    function updateMarketUI() {
        // Mettre à jour les boutons de marché
        const worldButton = document.getElementById('market-world');
        const usButton = document.getElementById('market-us');
        const euButton = document.getElementById('market-eu');
        
        if (worldButton && usButton && euButton) {
            worldButton.classList.toggle('active', currentMarket === 'world');
            usButton.classList.toggle('active', currentMarket === 'us');
            euButton.classList.toggle('active', currentMarket === 'eu');
        }
        
        // Mettre à jour le titre de la page
        const titleElement = document.getElementById('market-title');
        if (titleElement) {
            if (currentMarket === 'world') {
                titleElement.textContent = 'ETF Mondiaux';
            } else if (currentMarket === 'us') {
                titleElement.textContent = 'ETF Américains';
            } else if (currentMarket === 'eu') {
                titleElement.textContent = 'ETF Européens';
            }
        }
        
        // Mettre à jour le lien source
        const sourceLink = document.getElementById('source-link');
        if (sourceLink) {
            let justEtfLink = 'https://www.justetf.com/';
            if (currentMarket === 'us') {
                justEtfLink = 'https://www.justetf.com/us/';
            } else if (currentMarket === 'eu') {
                justEtfLink = 'https://www.justetf.com/en/';
            }
            
            sourceLink.innerHTML = `Sources: <a href="https://www.boursorama.com/bourse/trackers/" target="_blank" class="text-green-400 hover:underline">Boursorama</a>, <a href="${justEtfLink}" target="_blank" class="text-green-400 hover:underline">JustETF</a>`;
        }
        
        // Afficher/masquer la pagination si nécessaire
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) {
            if (totalPages > 1) {
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
    }
    
    /**
     * Charge les données d'ETFs depuis le fichier JSON approprié
     */
    async function loadEtfsData(forceRefresh = false) {
        // Éviter les chargements multiples simultanés
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        
        // Afficher le loader
        showElement('etfs-loading');
        hideElement('etfs-error');
        hideElement('etfs-container');
        
        try {
            // Déterminer le fichier à charger selon le marché et la page
            let url;
            if (currentMarket === 'world') {
                url = `data/etfs_world.json`;
            } else if (currentMarket === 'us') {
                url = `data/etfs_us.json`;
            } else {
                url = `data/etfs_eu.json`;
            }
            
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des données depuis ${url}${cacheBuster}`);
            
            // Simuler un délai pour le développement - À SUPPRIMER EN PRODUCTION
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // À remplacer par un vrai appel fetch quand les données seront disponibles
            // const response = await fetch(`${url}${cacheBuster}`);
            
            // Simulation de données pour le développement - À REMPLACER PAR LE FETCH CI-DESSUS
            const mockData = generateMockData();
            
            // if (!response.ok) {
            //     throw new Error(`Erreur de chargement: ${response.status}`);
            // }
            
            // Charger les données
            // const rawData = await response.json();
            const rawData = mockData; // Remplacer par la ligne ci-dessus en production
            
            // S'assurer que toutes les régions existent dans les données
            etfsData = {
                indices: rawData.indices || {},
                top_performers: rawData.top_performers || null,
                meta: rawData.meta || {}
            };
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(etfsData.meta.timestamp || Date.now());
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            etfsData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Récupérer les informations de pagination si présentes
            if (etfsData.meta.pagination) {
                currentPage = etfsData.meta.pagination.currentPage || 1;
                totalPages = etfsData.meta.pagination.totalPages || 1;
                
                // Mettre à jour l'interface de pagination
                updatePaginationUI();
            }
            
            // Afficher une notification si les données sont périmées
            if (etfsData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\\'une heure', 'warning');
            }
            
            // Afficher les données
            renderEtfsData();
            lastUpdate = new Date();
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            showElement('etfs-error');
            hideElement('etfs-loading');
            hideElement('etfs-container');
        } finally {
            // Réinitialiser l'état
            isLoading = false;
        }
    }
    
    /**
     * Génère des données de test pour le développement
     */
    function generateMockData() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
        const categories = ['Actions', 'Obligations', 'Matières premières', 'Multi-actifs', 'Sectoriels', 'Thématiques'];
        const providers = ['iShares', 'Vanguard', 'SPDR', 'Lyxor', 'Amundi', 'Invesco', 'WisdomTree', 'UBS'];
        
        const mockData = {
            indices: {},
            top_performers: {
                daily: {
                    best: [
                        { name: 'Lyxor MSCI Water ESG', symbol: 'WATL', change: '+3,45%', ytd: '+12,38%' },
                        { name: 'iShares Gold Producers', symbol: 'SPGP', change: '+2,87%', ytd: '+8,79%' },
                        { name: 'WisdomTree Cloud Computing', symbol: 'WCLD', change: '+2,53%', ytd: '+14,62%' }
                    ],
                    worst: [
                        { name: 'VanEck Vectors Oil Services', symbol: 'OIH', change: '-3,21%', ytd: '-7,14%' },
                        { name: 'iShares MSCI Brazil', symbol: 'EWZ', change: '-2,75%', ytd: '-5,42%' },
                        { name: 'Invesco Solar ETF', symbol: 'TAN', change: '-2,34%', ytd: '-9,85%' }
                    ]
                },
                ytd: {
                    best: [
                        { name: 'ARK Innovation ETF', symbol: 'ARKK', change: '+0,75%', ytd: '+28,43%' },
                        { name: 'iShares Semiconductor ETF', symbol: 'SOXX', change: '+1,24%', ytd: '+26,18%' },
                        { name: 'Invesco QQQ Trust', symbol: 'QQQ', change: '+0,92%', ytd: '+22,75%' }
                    ],
                    worst: [
                        { name: 'iShares MSCI Turkey ETF', symbol: 'TUR', change: '-0,87%', ytd: '-18,62%' },
                        { name: 'VanEck Vectors Russia', symbol: 'RSX', change: '-1,35%', ytd: '-15,24%' },
                        { name: 'iShares MSCI Chile ETF', symbol: 'ECH', change: '-0,65%', ytd: '-12,73%' }
                    ]
                }
            },
            meta: {
                count: 250,
                timestamp: new Date().toISOString(),
                source: 'Mock Data Generator'
            }
        };
        
        // Générer des données pour chaque lettre
        alphabet.forEach(letter => {
            const itemCount = Math.floor(Math.random() * 10) + 1; // 1-10 items par lettre
            mockData.indices[letter] = [];
            
            for (let i = 0; i < itemCount; i++) {
                const category = categories[Math.floor(Math.random() * categories.length)];
                const provider = providers[Math.floor(Math.random() * providers.length)];
                const price = (Math.random() * 100 + 10).toFixed(2);
                const change = ((Math.random() * 6) - 3).toFixed(2);
                const ytd = ((Math.random() * 30) - 15).toFixed(2);
                const assets = Math.floor(Math.random() * 10000) + 100;
                const ratio = (Math.random() * 0.75 + 0.1).toFixed(2);
                
                mockData.indices[letter].push({
                    name: `${provider} ${letter.toUpperCase()}${i+1} ${category}`,
                    category: category,
                    provider: provider,
                    last: `${price} €`,
                    change: change > 0 ? `+${change}%` : `${change}%`,
                    ytd: ytd > 0 ? `+${ytd}%` : `${ytd}%`,
                    assets: `${assets} M€`,
                    ratio: `${ratio}%`
                });
            }
        });
        
        return mockData;
    }
    
    /**
     * Affiche les données d'ETF dans l'interface
     */
    function renderEtfsData() {
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(etfsData.meta.timestamp);
            
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
            if (etfsData.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Mettre à jour le compteur d'ETF
            document.getElementById('etfs-count').textContent = etfsData.meta.count || 0;
            
            // Générer le HTML pour chaque lettre
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const etfs = etfsData.indices[letter] || [];
                const tableBody = document.getElementById(`${letter}-etfs-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas d'ETF, afficher un message
                    if (etfs.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="8" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucun ETF disponible pour cette lettre
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Trier les ETF par nom
                        const sortedEtfs = [...etfs].sort((a, b) => {
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        
                        // Remplir avec les données
                        sortedEtfs.forEach(etf => {
                            const row = document.createElement('tr');
                            
                            // Déterminer la classe CSS pour les valeurs (positif/négatif)
                            const changeClass = etf.change && etf.change.includes('-') ? 'negative' : 'positive';
                            const ytdClass = etf.ytd && etf.ytd.includes('-') ? 'negative' : 'positive';
                            
                            // Création de la ligne avec la structure correcte
                            row.innerHTML = `
                                <td class="font-medium">${etf.name || '-'}</td>
                                <td>${etf.category || '-'}</td>
                                <td>${etf.provider || '-'}</td>
                                <td>${etf.last || '-'}</td>
                                <td class="${changeClass}">${etf.change || '-'}</td>
                                <td class="${ytdClass}">${etf.ytd || '-'}</td>
                                <td>${etf.assets || '-'}</td>
                                <td>${etf.ratio || '-'}</td>
                            `;
                            
                            tableBody.appendChild(row);
                        });
                    }
                }
            });
            
            // Mettre à jour les top performers
            if (etfsData.top_performers) {
                updateTopPerformers(etfsData.top_performers);
            }
            
            // Masquer le loader et afficher les données
            hideElement('etfs-loading');
            hideElement('etfs-error');
            showElement('etfs-container');
            
            // Appliquer les filtres actuels
            applyFilters();
            
        } catch (error) {
            console.error('❌ Erreur lors de l\\'affichage des données:', error);
            hideElement('etfs-loading');
            showElement('etfs-error');
        }
    }
    
    /**
     * Met à jour les top performers
     */
    function updateTopPerformers(topPerformersData) {
        if (!topPerformersData) return;
        
        // Mettre à jour les top/bottom performers journaliers
        if (topPerformersData.daily) {
            updateTopPerformersHTML('daily-top', topPerformersData.daily.best, 'change');
            updateTopPerformersHTML('daily-bottom', topPerformersData.daily.worst, 'change');
        }
        
        // Mettre à jour les top/bottom performers YTD
        if (topPerformersData.ytd) {
            updateTopPerformersHTML('ytd-top', topPerformersData.ytd.best, 'ytd');
            updateTopPerformersHTML('ytd-bottom', topPerformersData.ytd.worst, 'ytd');
        }
    }
    
    /**
     * Met à jour le HTML pour une section de top performers
     */
    function updateTopPerformersHTML(containerId, etfs, valueField) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!etfs || etfs.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Générer le HTML pour chaque ETF
        etfs.forEach((etf, i) => {
            const row = document.createElement('div');
            row.className = 'performer-row';
            
            const valueClass = (etf[valueField] || "").includes('-') ? 'negative' : 'positive';
            
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${etf.name || ""}</div>
                    <div class="performer-country">${etf.symbol || ""}</div>
                </div>
                <div class="performer-value ${valueClass}">
                    ${etf[valueField] || "-"}
                </div>
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
