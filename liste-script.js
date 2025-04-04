/**
 * liste-script.js - Script pour afficher les actions du NASDAQ Composite et DJ STOXX 600
 * Données mises à jour régulièrement par GitHub Actions
 * Version améliorée avec chargement dynamique des données par marché
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
    
    // Charger les données globales
    loadGlobalData();
    
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
            // MODIFICATION: Chargement du fichier JSON en fonction du marché sélectionné
            // Utiliser le fichier complet pour les données principales
            const url = `data/lists.json`;
            
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des données principales depuis ${url}${cacheBuster}`);
            const response = await fetch(`${url}${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            // Charger les données
            const rawData = await response.json();
            
            // Vérifier explicitement si les données du marché demandé sont disponibles
            if (!rawData[currentMarket]) {
                console.error(`Données pour le marché ${currentMarket} non disponibles dans le fichier JSON`);
                throw new Error(`Données pour le marché ${currentMarket} non disponibles`);
            }
            
            // Sélectionner les données en fonction du marché
            const marketData = rawData[currentMarket];
            
            // S'assurer que toutes les régions existent dans les données
            stocksData = {
                indices: marketData.indices || {},
                meta: marketData.meta || {}
            };
            
            // Maintenant, charger les top performers spécifiques au marché sélectionné
            // NOUVELLE FONCTIONNALITÉ: Chargement des top performers depuis un fichier séparé
            const topPerformersUrl = currentMarket === 'nasdaq' 
                ? 'data/top_nasdaq_performers.json' 
                : 'data/top_stoxx_performers.json';
            
            console.log(`🔍 Chargement des top performers depuis ${topPerformersUrl}${cacheBuster}`);
            const topResponse = await fetch(`${topPerformersUrl}${cacheBuster}`);
            
            if (topResponse.ok) {
                const topData = await topResponse.json();
                stocksData.top_performers = {
                    daily: topData.daily || {},
                    ytd: topData.ytd || {}
                };
                console.log(`✅ Top performers de ${currentMarket.toUpperCase()} chargés avec succès`);
            } else {
                console.warn(`⚠️ Impossible de charger les top performers depuis ${topPerformersUrl}`);
                // Utiliser les top performers du fichier principal comme fallback
                stocksData.top_performers = marketData.top_performers || null;
            }
            
            // DÉDUPLICATION AMÉLIORÉE: Si le top_performers existe, dédupliquer toutes les listes
            if (stocksData.top_performers) {
                // Utiliser la fonction améliorée si disponible
                const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                
                if (stocksData.top_performers.daily) {
                    // Déduplication stricte basée uniquement sur le nom
                    stocksData.top_performers.daily.best = dedupFunction(stocksData.top_performers.daily.best || []);
                    stocksData.top_performers.daily.worst = dedupFunction(stocksData.top_performers.daily.worst || []);
                    
                    // Filtrer les variations extrêmes
                    stocksData.top_performers.daily.best = filterExtremeVariations(stocksData.top_performers.daily.best, 'change', true);
                    stocksData.top_performers.daily.worst = filterExtremeVariations(stocksData.top_performers.daily.worst, 'change', false);
                    
                    // Compléter si nécessaire pour avoir 10 éléments
                    ensureAtLeastTenItems(stocksData.top_performers.daily.best, currentMarket);
                    ensureAtLeastTenItems(stocksData.top_performers.daily.worst, currentMarket);
                }
                
                if (stocksData.top_performers.ytd) {
                    // Déduplication stricte basée uniquement sur le nom
                    stocksData.top_performers.ytd.best = dedupFunction(stocksData.top_performers.ytd.best || []);
                    stocksData.top_performers.ytd.worst = dedupFunction(stocksData.top_performers.ytd.worst || []);
                    
                    // Filtrer les variations extrêmes
                    stocksData.top_performers.ytd.best = filterExtremeVariations(stocksData.top_performers.ytd.best, 'ytd', true);
                    stocksData.top_performers.ytd.worst = filterExtremeVariations(stocksData.top_performers.ytd.worst, 'ytd', false);
                    
                    // Compléter si nécessaire pour avoir 10 éléments
                    ensureAtLeastTenItems(stocksData.top_performers.ytd.best, currentMarket);
                    ensureAtLeastTenItems(stocksData.top_performers.ytd.worst, currentMarket);
                }
            }
            
            // Stocker les données pour le classement global
            if (currentMarket === 'nasdaq') {
                globalData.nasdaq = stocksData;
            } else {
                globalData.stoxx = stocksData;
            }
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(stocksData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            stocksData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Récupérer les informations de pagination si présentes
            if (stocksData.meta && stocksData.meta.pagination) {
                currentPage = stocksData.meta.pagination.currentPage || 1;
                totalPages = stocksData.meta.pagination.totalPages || 1;
                console.log(`📄 Pagination ${currentMarket}: page ${currentPage}/${totalPages}`);
                updatePaginationUI();
            } else if (currentMarket === 'stoxx') {
                // STOXX devrait toujours avoir des informations de pagination
                console.warn("⚠️ Informations de pagination manquantes pour STOXX, utilisation des valeurs par défaut");
                currentPage = 1;
                totalPages = Math.max(1, Math.ceil((stocksData.meta.count || 600) / 100));
                updatePaginationUI();
            }
            
            // Afficher une notification si les données sont périmées
            if (stocksData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            // Afficher les données
            renderStocksData();
            lastUpdate = new Date();
            
            // Mettre à jour le top 10
            updateTopTenStocks(stocksData);
            
            // Mettre à jour le top 10 global si les deux ensembles de données sont disponibles
            if (globalData.nasdaq && globalData.stoxx) {
                updateGlobalTopTen();
            }
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
     * @param {Array} stocks 
     * @returns {Array} stocks dédupliqués
     */
    function dedupStocks(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Déléguer à la fonction dedupStocksByName
        return dedupStocksByName(stocks);
    }
    
    /**
     * Déduplique les actions de manière plus approfondie en utilisant tous les attributs
     * @param {Array} stocks 
     * @returns {Array} stocks dédupliqués
     */
    function dedupStocksThoroughly(stocks) {
        if (!stocks || !Array.isArray(stocks)) return [];
        
        // Déléguer à la fonction dedupStocksByName
        return dedupStocksByName(stocks);
    }
    
    /**
     * Charge les données pour le Top 10 global
     */
    async function loadGlobalData() {
        try {
            // MODIFICATION: Toujours charger directement le fichier global_top_performers.json
            console.log("🔍 Chargement des données du top 10 global...");
            const globalResponse = await fetch('data/global_top_performers.json');
            
            if (globalResponse.ok) {
                const globalData = await globalResponse.json();
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
            } else {
                console.log("⚠️ Fichier global_top_performers.json non trouvé, fallback sur la combinaison manuelle");
            }
            
            // Sinon, charger les données de lists.json qui contient tout
            const listsResponse = await fetch('data/lists.json');
            if (listsResponse.ok) {
                const combinedData = await listsResponse.json();
                if (combinedData.nasdaq && combinedData.stoxx) {
                    // Utilisation des données combinées du fichier JSON, avec déduplication
                    if (combinedData.combined && combinedData.combined.top_performers) {
                        const combined = combinedData.combined;
                        
                        // Déduplication des données combinées
                        // Utiliser la fonction améliorée si disponible
                        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                        
                        if (combined.top_performers.daily) {
                            combined.top_performers.daily.best = dedupFunction(combined.top_performers.daily.best || []);
                            combined.top_performers.daily.worst = dedupFunction(combined.top_performers.daily.worst || []);
                            
                            // Filtrer les variations extrêmes
                            combined.top_performers.daily.best = filterExtremeVariations(combined.top_performers.daily.best, 'change', true);
                            combined.top_performers.daily.worst = filterExtremeVariations(combined.top_performers.daily.worst, 'change', false);
                        }
                        
                        if (combined.top_performers.ytd) {
                            combined.top_performers.ytd.best = dedupFunction(combined.top_performers.ytd.best || []);
                            combined.top_performers.ytd.worst = dedupFunction(combined.top_performers.ytd.worst || []);
                            
                            // Filtrer les variations extrêmes
                            combined.top_performers.ytd.best = filterExtremeVariations(combined.top_performers.ytd.best, 'ytd', true);
                            combined.top_performers.ytd.worst = filterExtremeVariations(combined.top_performers.ytd.worst, 'ytd', false);
                        }
                        
                        // Utiliser directement les données combinées
                        updateGlobalTopTen({
                            daily: combined.top_performers.daily,
                            ytd: combined.top_performers.ytd
                        });
                        return;
                    }
                    
                    // Fallback: construire les données nasdaq et stoxx
                    globalData.nasdaq = {
                        indices: combinedData.nasdaq.indices,
                        top_performers: combinedData.nasdaq.top_performers,
                        meta: combinedData.nasdaq.meta
                    };
                    
                    globalData.stoxx = {
                        indices: combinedData.stoxx.indices,
                        top_performers: combinedData.stoxx.top_performers,
                        meta: combinedData.stoxx.meta
                    };
                    
                    // Mettre à jour le top 10 global si les deux ensembles de données sont disponibles
                    updateGlobalTopTen();
                }
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données globales:', error);
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
                        // Dédupliquer les stocks par nom plutôt que par tous les attributs
                        const uniqueStocks = dedupStocksByName(stocks);
                        
                        // Trier les actions par nom
                        const sortedStocks = [...uniqueStocks].sort((a, b) => {
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
     * Met à jour le top 10 des actions
     */
    function updateTopTenStocks(data) {
        // Vérifier d'abord si les données et top_performers existent
        if (!data || !data.top_performers) {
            console.warn("🔄 Création des top performers depuis les indices...");
            
            // Si top_performers n'existe pas, on va les créer à partir des indices
            if (data && data.indices) {
                // Récupérer toutes les actions de tous les indices
                const allStocks = [];
                Object.values(data.indices).forEach(letterStocks => {
                    if (Array.isArray(letterStocks)) {
                        allStocks.push(...letterStocks);
                    }
                });
                
                // Initialiser les top performers (créer la structure si elle n'existe pas)
                if (!data.top_performers) {
                    data.top_performers = {
                        daily: {
                            best: [],
                            worst: []
                        },
                        ytd: {
                            best: [],
                            worst: []
                        }
                    };
                }
                
                // Créer les top performers
                if (allStocks.length > 0) {
                    console.log(`📊 Génération des tops à partir de ${allStocks.length} actions`);
                    
                    // Trier par performance quotidienne puis prendre les 10 premiers/derniers
                    const stocksWithChangeValue = allStocks
                        .filter(stock => stock.change && stock.change !== '-' && !isNaN(parsePercentage(stock.change)))
                        .map(stock => ({
                            ...stock,
                            changeValue: parsePercentage(stock.change)
                        }));
                    
                    // Filtrer les variations extrêmes
                    const filteredDailyGainers = stocksWithChangeValue.filter(stock => stock.changeValue < 100);
                    const filteredDailyLosers = stocksWithChangeValue.filter(stock => stock.changeValue > -100);
                    
                    const dailyBest = [...filteredDailyGainers]
                        .sort((a, b) => b.changeValue - a.changeValue)
                        .slice(0, 10);
                    
                    const dailyWorst = [...filteredDailyLosers]
                        .sort((a, b) => a.changeValue - b.changeValue)
                        .slice(0, 10);
                    
                    // Trier par YTD puis prendre les 10 premiers/derniers
                    const stocksWithYtdValue = allStocks
                        .filter(stock => stock.ytd && stock.ytd !== '-' && !isNaN(parsePercentage(stock.ytd)))
                        .map(stock => ({
                            ...stock,
                            ytdValue: parsePercentage(stock.ytd)
                        }));
                    
                    // Filtrer les variations extrêmes pour YTD
                    const filteredYtdGainers = stocksWithYtdValue.filter(stock => stock.ytdValue < 100);
                    const filteredYtdLosers = stocksWithYtdValue.filter(stock => stock.ytdValue > -100);
                    
                    const ytdBest = [...filteredYtdGainers]
                        .sort((a, b) => b.ytdValue - a.ytdValue)
                        .slice(0, 10);
                    
                    const ytdWorst = [...filteredYtdLosers]
                        .sort((a, b) => a.ytdValue - b.ytdValue)
                        .slice(0, 10);
                    
                    // Utiliser la fonction améliorée si disponible
                    const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
                    
                    // Mettre à jour les listes
                    data.top_performers.daily.best = dedupFunction(dailyBest);
                    data.top_performers.daily.worst = dedupFunction(dailyWorst);
                    data.top_performers.ytd.best = dedupFunction(ytdBest);
                    data.top_performers.ytd.worst = dedupFunction(ytdWorst);
                }
            }
        }
        
        // Maintenant on peut essayer de travailler avec les top_performers
        if (!data || !data.top_performers) {
            console.error("❌ Impossible de créer ou récupérer les top performers");
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
            
            renderTopTenCards('top-daily-gainers', displayStocks, 'change', currentMarket);
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
            
            renderTopTenCards('top-daily-losers', displayStocks, 'change', currentMarket);
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
            
            renderTopTenCards('top-ytd-gainers', displayStocks, 'ytd', currentMarket);
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
            
            renderTopTenCards('top-ytd-losers', displayStocks, 'ytd', currentMarket);
        }
    }
    
    /**
     * Met à jour le top 10 global directement à partir des données pré-combinées
     * @param {Object} globalData
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
                renderTopTenCards('top-global-gainers', filteredGainers, 'change', 'global');
            }
            
            if (globalData.daily && globalData.daily.worst) {
                const uniqueLosers = dedupFunction(globalData.daily.worst);
                // Filtrer les variations extrêmes
                const filteredLosers = filterExtremeVariations(uniqueLosers, 'change', false);
                renderTopTenCards('top-global-losers', filteredLosers, 'change', 'global');
            }
            
            if (globalData.ytd && globalData.ytd.best) {
                const uniqueYtdGainers = dedupFunction(globalData.ytd.best);
                // Filtrer les variations extrêmes
                const filteredYtdGainers = filterExtremeVariations(uniqueYtdGainers, 'ytd', true);
                renderTopTenCards('top-global-ytd-gainers', filteredYtdGainers, 'ytd', 'global');
            }
            
            if (globalData.ytd && globalData.ytd.worst) {
                const uniqueYtdLosers = dedupFunction(globalData.ytd.worst);
                // Filtrer les variations extrêmes
                const filteredYtdLosers = filterExtremeVariations(uniqueYtdLosers, 'ytd', false);
                renderTopTenCards('top-global-ytd-losers', filteredYtdLosers, 'ytd', 'global');
            }
            
            return;
        }
        
        console.log("⚠️ Données globales pré-combinées non disponibles, combinaison manuelle...");
        
        // Sinon, combiner manuellement les données
        if (!window.globalData && (!this.globalData || !this.globalData.nasdaq || !this.globalData.stoxx)) {
            // Si nous n'avons pas de données globales, utiliser les données stockées 
            // dans la variable globalData (scope parent)
            if (!this.globalData || !this.globalData.nasdaq || !this.globalData.stoxx) {
                console.error("Données globales manquantes pour le Top 10 combiné");
                return;
            }
        }
        
        // À ce stade, nous utilisons soit le globalData passé en paramètre, soit celui du scope parent
        const data = globalData || this.globalData;
        
        // S'assurer que les deux sources de données sont disponibles
        if (!data.nasdaq || !data.nasdaq.top_performers || !data.stoxx || !data.stoxx.top_performers) {
            console.error("Données NASDAQ ou STOXX manquantes");
            return;
        }

        // Fusionner les données YTD
        let combinedYtdGainers = [];
        let combinedYtdLosers = [];
        let combinedDailyGainers = [];
        let combinedDailyLosers = [];
        
        // Ajouter les données NASDAQ
        if (data.nasdaq.top_performers && data.nasdaq.top_performers.ytd) {
            // Ajouter la source aux données
            const nasdaqBest = (data.nasdaq.top_performers.ytd.best || []).map(stock => ({
                ...stock,
                market: 'NASDAQ',
                marketIcon: '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            }));
            
            const nasdaqWorst = (data.nasdaq.top_performers.ytd.worst || []).map(stock => ({
                ...stock,
                market: 'NASDAQ',
                marketIcon: '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            }));
            
            combinedYtdGainers = [...combinedYtdGainers, ...nasdaqBest];
            combinedYtdLosers = [...combinedYtdLosers, ...nasdaqWorst];
        }
        
        // Ajouter les données STOXX
        if (data.stoxx.top_performers && data.stoxx.top_performers.ytd) {
            // Ajouter la source aux données
            const stoxxBest = (data.stoxx.top_performers.ytd.best || []).map(stock => ({
                ...stock,
                market: 'STOXX',
                marketIcon: '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            const stoxxWorst = (data.stoxx.top_performers.ytd.worst || []).map(stock => ({
                ...stock,
                market: 'STOXX',
                marketIcon: '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            combinedYtdGainers = [...combinedYtdGainers, ...stoxxBest];
            combinedYtdLosers = [...combinedYtdLosers, ...stoxxWorst];
        }
        
        // Ajouter les données quotidiennes NASDAQ
        if (data.nasdaq.top_performers && data.nasdaq.top_performers.daily) {
            const nasdaqDailyBest = (data.nasdaq.top_performers.daily.best || []).map(stock => ({
                ...stock,
                market: 'NASDAQ',
                marketIcon: '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            }));
            
            const nasdaqDailyWorst = (data.nasdaq.top_performers.daily.worst || []).map(stock => ({
                ...stock,
                market: 'NASDAQ',
                marketIcon: '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            }));
            
            combinedDailyGainers = [...combinedDailyGainers, ...nasdaqDailyBest];
            combinedDailyLosers = [...combinedDailyLosers, ...nasdaqDailyWorst];
        }
        
        // Ajouter les données quotidiennes STOXX
        if (data.stoxx.top_performers && data.stoxx.top_performers.daily) {
            const stoxxDailyBest = (data.stoxx.top_performers.daily.best || []).map(stock => ({
                ...stock,
                market: 'STOXX',
                marketIcon: '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            const stoxxDailyWorst = (data.stoxx.top_performers.daily.worst || []).map(stock => ({
                ...stock,
                market: 'STOXX',
                marketIcon: '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            }));
            
            combinedDailyGainers = [...combinedDailyGainers, ...stoxxDailyBest];
            combinedDailyLosers = [...combinedDailyLosers, ...stoxxDailyWorst];
        }
        
        // Dédupliquer toutes les listes combinées par nom
        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
        combinedYtdGainers = dedupFunction(combinedYtdGainers);
        combinedYtdLosers = dedupFunction(combinedYtdLosers);
        combinedDailyGainers = dedupFunction(combinedDailyGainers);
        combinedDailyLosers = dedupFunction(combinedDailyLosers);
        
        // Filtrer les variations extrêmes
        combinedYtdGainers = filterExtremeVariations(combinedYtdGainers, 'ytd', true);
        combinedYtdLosers = filterExtremeVariations(combinedYtdLosers, 'ytd', false);
        combinedDailyGainers = filterExtremeVariations(combinedDailyGainers, 'change', true);
        combinedDailyLosers = filterExtremeVariations(combinedDailyLosers, 'change', false);
        
        // Trier et préparer les données YTD
        if (combinedYtdGainers.length > 0) {
            // Convertir les valeurs en nombre pour le tri
            combinedYtdGainers = combinedYtdGainers.map(stock => {
                // Nettoyer la valeur YTD et la convertir en nombre
                const ytdValue = parsePercentage(stock.ytd);
                return {
                    ...stock,
                    ytdValue
                };
            });
            
            // Trier par YTD décroissant (plus hautes performances en premier)
            combinedYtdGainers.sort((a, b) => b.ytdValue - a.ytdValue);
            
            // Prendre les 10 meilleurs
            const top10Global = combinedYtdGainers.slice(0, 10);
            
            // Afficher le top 10 global
            renderTopTenCards('top-global-ytd-gainers', top10Global, 'ytd', 'global');
        }
        
        if (combinedYtdLosers.length > 0) {
            // Convertir les valeurs en nombre pour le tri
            combinedYtdLosers = combinedYtdLosers.map(stock => {
                // Nettoyer la valeur YTD et la convertir en nombre
                const ytdValue = parsePercentage(stock.ytd);
                return {
                    ...stock,
                    ytdValue
                };
            });
            
            // Trier par YTD croissant (plus basses performances en premier)
            combinedYtdLosers.sort((a, b) => a.ytdValue - b.ytdValue);
            
            // Prendre les 10 pires
            const bottom10Global = combinedYtdLosers.slice(0, 10);
            
            // Afficher le bottom 10 global
            renderTopTenCards('top-global-ytd-losers', bottom10Global, 'ytd', 'global');
        }
        
        // Trier et préparer les données quotidiennes
        if (combinedDailyGainers.length > 0) {
            // Convertir les valeurs en nombre pour le tri
            combinedDailyGainers = combinedDailyGainers.map(stock => {
                // Nettoyer la valeur de changement et la convertir en nombre
                const changeValue = parsePercentage(stock.change);
                return {
                    ...stock,
                    changeValue
                };
            });
            
            // Trier par changement décroissant (plus hautes performances en premier)
            combinedDailyGainers.sort((a, b) => b.changeValue - a.changeValue);
            
            // Prendre les 10 meilleurs
            const top10DailyGlobal = combinedDailyGainers.slice(0, 10);
            
            // Afficher le top 10 global
            renderTopTenCards('top-global-gainers', top10DailyGlobal, 'change', 'global');
        }
        
        if (combinedDailyLosers.length > 0) {
            // Convertir les valeurs en nombre pour le tri
            combinedDailyLosers = combinedDailyLosers.map(stock => {
                // Nettoyer la valeur de changement et la convertir en nombre
                const changeValue = parsePercentage(stock.change);
                return {
                    ...stock,
                    changeValue
                };
            });
            
            // Trier par changement croissant (plus basses performances en premier)
            combinedDailyLosers.sort((a, b) => a.changeValue - b.changeValue);
            
            // Prendre les 10 pires
            const bottom10DailyGlobal = combinedDailyLosers.slice(0, 10);
            
            // Afficher le bottom 10 global
            renderTopTenCards('top-global-losers', bottom10DailyGlobal, 'change', 'global');
        }
    }
    
    /**
     * Convertit le volume en nombre pour le tri
     */
    function parseVolumeToNumber(volumeStr) {
        if (!volumeStr || volumeStr === '-') return
 0;
        
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
     * Fonction améliorée pour afficher les cartes du top 10 avec un meilleur design
     */
    function renderTopTenCards(containerId, stocks, valueField, marketSource) {
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
        
        // Assurer la déduplication absolue des stocks par nom
        const dedupFunction = window.dedupFix?.dedupStocksStrict || dedupStocksByName;
        const uniqueStocks = dedupFunction(stocks);
        
        // Créer les cartes pour chaque action (jusqu'à 10)
        const displayStocks = uniqueStocks.slice(0, 10);
        
        // Assurer qu'il y a 10 éléments
        ensureAtLeastTenItems(displayStocks, marketSource === 'global' ? 'mixed' : marketSource, valueField === 'ytd');
        
        displayStocks.forEach((stock, index) => {
            // Déterminer le signe et la classe pour la valeur
            let value = stock[valueField] || '-';
            let valueClass = 'positive';
            
            if (value.includes('-')) {
                valueClass = 'negative';
            }
            
            // Déterminer l'icône du marché
            let marketIcon = '';
            if (marketSource === 'global') {
                marketIcon = stock.marketIcon || '';
            } else {
                marketIcon = stock.marketIcon || '';
            }
            
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
            
            card.innerHTML = `
                <div class="rank ${rankBg} ${rankStyle} ${glowEffect}">#${index + 1}</div>
                <div class="stock-info ${specialClass}">
                    <div class="stock-name">${stock.symbol || stock.name.split(' ')[0] || '-'} ${marketIcon}</div>
                    <div class="stock-fullname">${stock.name || '-'}</div>
                </div>
                <div class="stock-performance ${valueClass}">
                    ${value}
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
    
    /**
     * Fonction pour parser un pourcentage en nombre
     */
    function parsePercentage(percentStr) {
        if (!percentStr || percentStr === '-') return 0;
        
        // Remplacer les virgules par des points pour les décimales
        let cleanStr = percentStr.replace(',', '.');
        
        // Supprimer les symboles +, %, etc.
        cleanStr = cleanStr.replace(/[+%]/g, '');
        
        // Gérer les nombres négatifs qui pourraient être entre parenthèses
        if (cleanStr.includes('(') && cleanStr.includes(')')) {
            cleanStr = cleanStr.replace(/[\(\)]/g, '');
            cleanStr = '-' + cleanStr;
        }
        
        // Parser en nombre
        const value = parseFloat(cleanStr);
        return isNaN(value) ? 0 : value;
    }
});