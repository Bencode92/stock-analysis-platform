/**
 * liste-script.js - Script pour afficher les actions du NASDAQ Composite et DJ STOXX 600
 * Données mises à jour régulièrement par GitHub Actions
 */

document.addEventListener('DOMContentLoaded', function() {
    // Variables globales pour stocker les données
    let stocksData = {
        indices: {},
        meta: {
            source: 'Boursorama',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // État pour le marché actuel et la pagination
    let currentMarket = 'nasdaq'; // 'nasdaq' ou 'stoxx'
    let currentPage = 1;
    let totalPages = 1;
    
    // Initialiser les onglets alphabet
    initAlphabetTabs();
    
    // Initialiser les sélecteurs de marché
    initMarketSelector();
    
    // Initialiser la pagination
    initPagination();
    
    // Initialiser la barre de recherche
    initSearchFunctionality();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Premier chargement des données
    loadStocksData();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadStocksData(true);
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
                
                document.getElementById(`${letter}-indices`)?.classList.remove('hidden');
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
    }
    
    /**
     * Charge les données d'actions depuis le fichier JSON approprié
     */
    async function loadStocksData(forceRefresh = false) {
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
            // Déterminer le fichier à charger selon le marché et la page
            let url;
            if (currentMarket === 'nasdaq') {
                url = `data/lists.json`;
            } else {
                url = `data/stoxx_page_${currentPage}.json`;
            }
            
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des données depuis ${url}${cacheBuster}`);
            const response = await fetch(`${url}${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            // Charger les données
            const rawData = await response.json();
            
            // S'assurer que toutes les régions existent dans les données
            stocksData = {
                indices: rawData.indices || {},
                top_performers: rawData.top_performers || null,
                meta: rawData.meta || {}
            };
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(stocksData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            stocksData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Récupérer les informations de pagination si présentes
            if (stocksData.meta.pagination) {
                currentPage = stocksData.meta.pagination.currentPage || 1;
                totalPages = stocksData.meta.pagination.totalPages || 1;
                
                // Mettre à jour l'interface de pagination
                updatePaginationUI();
            }
            
            // Afficher une notification si les données sont périmées
            if (stocksData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            // Afficher les données
            renderStocksData();
            lastUpdate = new Date();
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            showElement('indices-error');
            hideElement('indices-loading');
            hideElement('indices-container');
        } finally {
            // Réinitialiser l'état
            isLoading = false;
        }
    }
    
    /**
     * Affiche les données d'actions dans l'interface
     */
    function renderStocksData() {
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
                            <td colspan="8" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune action disponible pour cette lettre
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Trier les actions par nom
                        const sortedStocks = [...stocks].sort((a, b) => {
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        
                        // Remplir avec les données
                        sortedStocks.forEach(stock => {
                            const row = document.createElement('tr');
                            
                            // Déterminer la classe CSS pour les valeurs (positif/négatif)
                            const changeClass = stock.change && stock.change.includes('-') ? 'negative' : 'positive';
                            const ytdClass = stock.ytd && stock.ytd.includes('-') ? 'negative' : 'positive';
                            
                            // Création de la ligne avec la structure correcte
                            row.innerHTML = `
                                <td class="font-medium">${stock.name || '-'}</td>
                                <td>${stock.last || '-'}</td>
                                <td class="${changeClass}">${stock.change || '-'}</td>
                                <td>${stock.open || '-'}</td>
                                <td>${stock.high || '-'}</td>
                                <td>${stock.low || '-'}</td>
                                <td class="${ytdClass}">${stock.ytd || '-'}</td>
                                <td>${stock.volume || '-'}</td>
                            `;
                            
                            tableBody.appendChild(row);
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
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('indices-loading');
            showElement('indices-error');
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
        
        // Générer le HTML pour chaque action
        stocks.forEach((stock, i) => {
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
        function showAllStocks() {
            // Si la pagination est active (STOXX), on ne peut pas tout montrer
            if (currentMarket === 'stoxx') {
                // Afficher une notification
                showNotification('La vue "TOUS" n\'est pas disponible pour ce marché en raison de la pagination.', 'warning');
                return;
            }
            
            // Afficher toutes les régions
            const regionContents = document.querySelectorAll('.region-content');
            regionContents.forEach(content => {
                content.classList.remove('hidden');
            });
            
            // Rendre visibles toutes les lignes qui étaient cachées par la recherche
            const allRows = document.querySelectorAll('table tbody tr');
            allRows.forEach(row => {
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
                const rows = tableBody.querySelectorAll('tr');
                
                rows.forEach(row => {
                    // Ne pas rechercher dans les lignes vides ou messages
                    if (row.cells.length <= 1) return;
                    
                    const stockName = row.cells[0].textContent.toLowerCase();
                    
                    if (stockName.includes(searchTerm)) {
                        // Marquer cette ligne comme résultat de recherche
                        row.classList.add('search-highlight');
                        row.classList.remove('hidden');
                        row.style.display = '';
                        regionResults++;
                        totalResults++;
                        foundInRegions.add(letter);
                    } else {
                        // Masquer cette ligne
                        row.classList.remove('search-highlight');
                        row.classList.add('hidden');
                        row.style.display = 'none';
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
                            <td colspan="8" class="no-results">
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
        function clearSearch() {
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
                
                // Réinitialiser toutes les lignes
                const rows = tableBody.querySelectorAll('tr');
                rows.forEach(row => {
                    row.classList.remove('search-highlight', 'hidden');
                    row.style.display = '';
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
