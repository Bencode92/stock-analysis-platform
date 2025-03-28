/**
 * crypto-script.js - Script pour afficher les données des cryptomonnaies
 * Données mises à jour régulièrement par GitHub Actions
 * Ajout de support pour les top 10 hausses/baisses sur 24h et 7j
 */

document.addEventListener('DOMContentLoaded', function() {
    // Variables globales pour stocker les données
    let cryptoData = {
        indices: {},
        meta: {
            source: 'CoinMarketCap',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Données des deux marchés pour le classement global
    let globalData = {
        all: null,
        top100: null
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // Variables pour le rechargement automatique
    const AUTO_REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // 2 heures en millisecondes
    let autoRefreshTimer = null;
    let nextRefreshTime = null;
    
    // État pour le marché actuel
    let currentMarket = 'all'; // 'all' ou 'top100'
    
    // Créer dynamiquement les sections HTML pour toutes les lettres
    createAlphabetSections();
    
    // Initialiser les onglets alphabet
    initAlphabetTabs();
    
    // Initialiser les sélecteurs de marché
    initMarketSelector();
    
    // Initialiser la barre de recherche
    initSearchFunctionality();
    
    // Mettre à jour l'horloge du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser le thème
    initTheme();
    
    // Premier chargement des données
    loadCryptoData();
    
    // Démarrer le rechargement automatique
    startAutoRefresh();
    
    // Ajouter les gestionnaires d'événements
    document.getElementById('retry-button')?.addEventListener('click', function() {
        hideElement('indices-error');
        showElement('indices-loading');
        loadCryptoData(true);
    });
    
    /**
     * Démarre le rechargement automatique
     */
    function startAutoRefresh() {
        // Arrêter le timer précédent si existant
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
        }
        
        // Configurer le prochain temps de rechargement
        nextRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL);
        
        // Créer un élément pour afficher le temps restant (s'il n'existe pas déjà)
        let refreshInfoElement = document.getElementById('refresh-info');
        if (!refreshInfoElement) {
            refreshInfoElement = document.createElement('div');
            refreshInfoElement.id = 'refresh-info';
            refreshInfoElement.classList.add('text-sm', 'text-gray-400', 'mt-2');
            
            // Ajouter au DOM à côté de la dernière mise à jour
            const lastUpdateElement = document.getElementById('last-update-time');
            if (lastUpdateElement && lastUpdateElement.parentNode) {
                lastUpdateElement.parentNode.appendChild(refreshInfoElement);
            }
        }
        
        // Mettre à jour le compteur toutes les minutes
        const updateRefreshCounter = () => {
            if (!nextRefreshTime) return;
            
            const now = new Date();
            const timeRemaining = nextRefreshTime - now;
            
            if (timeRemaining <= 0) {
                // C'est l'heure de recharger
                refreshInfoElement.textContent = "Actualisation en cours...";
                loadCryptoData(true);
                return;
            }
            
            // Calculer les heures/minutes restantes
            const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
            const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
            
            // Afficher le temps restant
            refreshInfoElement.textContent = `Prochaine actualisation dans ${hours}h ${minutes}min`;
        };
        
        // Mettre à jour immédiatement puis toutes les minutes
        updateRefreshCounter();
        const counterInterval = setInterval(updateRefreshCounter, 60 * 1000);
        
        // Configurer l'intervalle principal pour recharger les données
        autoRefreshTimer = setInterval(() => {
            loadCryptoData(true);
            nextRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL);
        }, AUTO_REFRESH_INTERVAL);
    }
    
    /**
     * Crée dynamiquement les sections HTML pour toutes les lettres de l'alphabet
     */
    function createAlphabetSections() {
        const indicesContainer = document.getElementById('indices-container');
        if (!indicesContainer) return;
        
        const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
        
        // Vérifier si les sections existent déjà
        const existingSections = {};
        alphabet.forEach(letter => {
            existingSections[letter] = document.getElementById(`${letter}-indices`) !== null;
        });
        
        // Créer les sections manquantes
        alphabet.forEach(letter => {
            if (!existingSections[letter]) {
                // Créer le conteneur pour cette lettre
                const sectionDiv = document.createElement('div');
                sectionDiv.id = `${letter}-indices`;
                sectionDiv.className = 'region-content hidden';
                
                // Créer la table et l'en-tête
                sectionDiv.innerHTML = `
                    <div class="overflow-x-auto">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>NOM</th>
                                    <th>SYMBOLE</th>
                                    <th>PRIX</th>
                                    <th>% 1H</th>
                                    <th>% 24H</th>
                                    <th>% 7D</th>
                                    <th>VOLUME</th>
                                    <th>MARKET CAPITALISATION</th>
                                </tr>
                            </thead>
                            <tbody id="${letter}-indices-body"></tbody>
                        </table>
                    </div>
                `;
                
                // Ajouter au conteneur principal
                indicesContainer.appendChild(sectionDiv);
            }
        });
    }
    
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
        const allButton = document.getElementById('market-all');
        const top100Button = document.getElementById('market-top100');
        
        allButton?.addEventListener('click', function() {
            if (currentMarket !== 'all') {
                // Mettre à jour l'état
                currentMarket = 'all';
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadCryptoData(true);
            }
        });
        
        top100Button?.addEventListener('click', function() {
            if (currentMarket !== 'top100') {
                // Mettre à jour l'état
                currentMarket = 'top100';
                
                // Mettre à jour l'interface
                updateMarketUI();
                
                // Charger les données
                loadCryptoData(true);
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
     * Met à jour l'interface en fonction du marché sélectionné
     */
    function updateMarketUI() {
        // Mettre à jour les boutons de marché
        const allButton = document.getElementById('market-all');
        const top100Button = document.getElementById('market-top100');
        
        if (allButton && top100Button) {
            allButton.classList.toggle('active', currentMarket === 'all');
            top100Button.classList.toggle('active', currentMarket === 'top100');
        }
        
        // Mettre à jour le titre de la page
        const titleElement = document.getElementById('market-title');
        if (titleElement) {
            titleElement.textContent = currentMarket === 'all' 
                ? 'Cryptomonnaies' 
                : 'Top 100 Cryptomonnaies';
        }
        
        // Mettre à jour le lien source
        const sourceLink = document.getElementById('source-link');
        if (sourceLink) {
            const link = 'https://coinmarketcap.com/fr/';
            sourceLink.innerHTML = `Sources: <a href="${link}" target="_blank" class="text-green-400 hover:underline">CoinMarketCap</a>`;
        }
    }
    
    /**
     * Charge les données des cryptomonnaies depuis le fichier JSON approprié
     */
    async function loadCryptoData(forceRefresh = false) {
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
            // Charger depuis crypto_lists.json
            const url = `data/crypto_lists.json`;
            
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des données depuis ${url}${cacheBuster}`);
            const response = await fetch(`${url}${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            // Charger les données
            const rawData = await response.json();
            console.log("Données chargées:", rawData);
            
            // Récupérer toutes les cryptomonnaies de toutes les sources possibles
            const allCoins = [
                ...(rawData.all_coins || []),
                ...(rawData.categories?.main || []),
                ...(rawData.most_visited || []),
                ...(rawData.categories?.top_gainers_24h || []),
                ...(rawData.categories?.top_losers_24h || []),
                ...(rawData.categories?.top_gainers_7d || []),
                ...(rawData.categories?.top_losers_7d || [])
            ];
            
            // Supprimer les doublons en utilisant le symbole comme identifiant unique
            const uniqueSymbols = new Set();
            const uniqueCoins = [];
            
            allCoins.forEach(coin => {
                if (coin.symbol && !uniqueSymbols.has(coin.symbol)) {
                    uniqueSymbols.add(coin.symbol);
                    uniqueCoins.push(coin);
                }
            });
            
            console.log(`🔢 Nombre de cryptomonnaies uniques trouvées: ${uniqueCoins.length}`);
            
            // Organisation des données en indices par lettre alphabétique
            cryptoData.indices = organizeByLetter(uniqueCoins);
            
            // Mettre à jour le compte total des cryptomonnaies
            const totalCryptos = Object.values(cryptoData.indices).reduce((total, cryptos) => total + cryptos.length, 0);
            
            // Adaptation des top performers
            cryptoData.top_performers = {
                daily: {
                    best: rawData.categories?.top_gainers_24h || [],
                    worst: rawData.categories?.top_losers_24h || []
                },
                ytd: {
                    best: rawData.categories?.top_gainers_7d || [],
                    worst: rawData.categories?.top_losers_7d || []
                }
            };
            
            // Métadonnées
            cryptoData.meta = rawData.meta || {};
            cryptoData.meta.count = totalCryptos;
            
            // Stocker les données pour le classement global
            if (currentMarket === 'all') {
                globalData.all = cryptoData;
            } else {
                globalData.top100 = cryptoData;
            }
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(cryptoData.meta.timestamp || cryptoData.meta.lastUpdated);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            cryptoData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Afficher une notification si les données sont périmées
            if (cryptoData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            // Afficher les données
            renderCryptoData();
            lastUpdate = new Date();
            
            // Mettre à jour le top 10
            updateTopTenCrypto(cryptoData);
            
            // Afficher une notification pour indiquer la réussite du chargement
            showNotification('Données mises à jour avec succès', 'success');
            
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            showElement('indices-error');
            hideElement('indices-loading');
            hideElement('indices-container');
            
            // Tenter de charger des données de démo
            loadDemoData();
        } finally {
            // Réinitialiser l'état
            isLoading = false;
        }
    }
    
    /**
     * Organise les cryptos par lettre initiale
     */
    function organizeByLetter(coins) {
        const result = {};
        const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
        
        // Initialiser chaque lettre avec un tableau vide
        alphabet.forEach(letter => {
            result[letter] = [];
        });
        
        // Répartir les cryptos par lettre
        coins.forEach(coin => {
            const name = coin.name || "";
            if (name) {
                const firstLetter = name[0].toLowerCase();
                if (alphabet.includes(firstLetter)) {
                    // Adapter la structure de la crypto pour correspondre aux attentes de l'interface
                    const adaptedCoin = {
                        name: coin.name,
                        symbol: coin.symbol,
                        last: coin.price,
                        change_1h: coin.change_1h,    // Ajout du changement sur 1h
                        change: coin.change_24h,
                        ytd: coin.change_7d,
                        volume: coin.volume_24h,
                        marketCap: coin.market_cap
                    };
                    result[firstLetter].push(adaptedCoin);
                }
            }
        });
        
        return result;
    }
    
    /**
     * Charge des données de démo en cas d'erreur
     */
    function loadDemoData() {
        console.log('🔄 Chargement des données de démo...');
        
        // Créer quelques cryptos de démo
        const demoCryptos = [
            { name: "Bitcoin", symbol: "BTC", last: "$62,150.25", change_1h: "+0.5%", change: "+1.2%", volume: "$28.5B", marketCap: "$1.25T", ytd: "+45.8%" },
            { name: "Ethereum", symbol: "ETH", last: "$3,340.18", change_1h: "+0.8%", change: "+2.5%", volume: "$15.2B", marketCap: "$401.8B", ytd: "+32.9%" },
            { name: "Binance Coin", symbol: "BNB", last: "$567.32", change_1h: "-0.2%", change: "-0.8%", volume: "$1.9B", marketCap: "$86.5B", ytd: "+18.6%" },
            { name: "Solana", symbol: "SOL", last: "$146.75", change_1h: "+1.1%", change: "+5.3%", volume: "$3.1B", marketCap: "$65.2B", ytd: "+123.4%" },
            { name: "Cardano", symbol: "ADA", last: "$0.65", change_1h: "-0.4%", change: "-1.2%", volume: "$780M", marketCap: "$22.9B", ytd: "-12.5%" },
            { name: "Avalanche", symbol: "AVAX", last: "$35.25", change_1h: "+0.7%", change: "+2.5%", volume: "$520M", marketCap: "$13.2B", ytd: "+42.8%" }
        ];
        
        // Organiser par lettre
        const demoByLetter = {};
        "abcdefghijklmnopqrstuvwxyz".split('').forEach(letter => {
            demoByLetter[letter] = [];
        });
        
        // Ajouter les cryptos par lettre
        demoCryptos.forEach(crypto => {
            const firstLetter = crypto.name.charAt(0).toLowerCase();
            if (demoByLetter[firstLetter]) {
                demoByLetter[firstLetter].push(crypto);
            }
        });
        
        // Construire le jeu de données de démo
        cryptoData = {
            indices: demoByLetter,
            top_performers: {
                daily: {
                    best: [demoCryptos[3], demoCryptos[1], demoCryptos[5]],
                    worst: [demoCryptos[4], demoCryptos[2]]
                },
                ytd: {
                    best: [demoCryptos[3], demoCryptos[5], demoCryptos[0]],
                    worst: [demoCryptos[4]]
                }
            },
            meta: {
                source: "Données de démonstration",
                timestamp: new Date().toISOString(),
                count: demoCryptos.length
            }
        };
        
        // Afficher les données de démo
        renderCryptoData();
        updateTopTenCrypto(cryptoData);
        
        // Afficher une notification
        showNotification('Utilisation de données de démonstration', 'warning');
    }
    
    /**
     * Affiche les données des cryptomonnaies dans l'interface
     */
    function renderCryptoData() {
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(cryptoData.meta.timestamp || cryptoData.meta.lastUpdated);
            
            let formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // Ajouter un indicateur si les données sont périmées
            if (cryptoData.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Mettre à jour le titre de la page
            document.getElementById('crypto-count').textContent = cryptoData.meta.count || 0;
            
            // Générer le HTML pour chaque lettre
            const alphabet = "abcdefghijklmnopqrstuvwxyz".split('');
            
            alphabet.forEach(letter => {
                const cryptos = cryptoData.indices[letter] || [];
                const tableBody = document.getElementById(`${letter}-indices-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas de cryptomonnaies, afficher un message
                    if (cryptos.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="8" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune cryptomonnaie disponible pour cette lettre
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Trier les cryptos par nom
                        const sortedCryptos = [...cryptos].sort((a, b) => {
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        
                        // Remplir avec les données
                        sortedCryptos.forEach(crypto => {
                            const row = document.createElement('tr');
                            
                            // Déterminer la classe CSS pour les valeurs (positif/négatif)
                            const change1hClass = crypto.change_1h && crypto.change_1h.includes('-') ? 'negative' : 'positive';
                            const changeClass = crypto.change && crypto.change.includes('-') ? 'negative' : 'positive';
                            const ytdClass = crypto.ytd && crypto.ytd.includes('-') ? 'negative' : 'positive';
                            
                            // Création de la ligne avec la structure correcte
                            row.innerHTML = `
                                <td class="font-medium">${crypto.name || '-'}</td>
                                <td>${crypto.symbol || '-'}</td>
                                <td>${crypto.last || '-'}</td>
                                <td class="${change1hClass}">${crypto.change_1h || '-'}</td>
                                <td class="${changeClass}">${crypto.change || '-'}</td>
                                <td class="${ytdClass}">${crypto.ytd || '-'}</td>
                                <td>${crypto.volume || '-'}</td>
                                <td>${crypto.marketCap || '-'}</td>
                            `;
                            
                            tableBody.appendChild(row);
                        });
                    }
                }
            });
            
            // Mettre à jour les top performers
            if (cryptoData.top_performers) {
                updateTopPerformers(cryptoData.top_performers);
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
     * Met à jour le top 10 des cryptomonnaies
     */
    function updateTopTenCrypto(data) {
        if (!data || !data.top_performers) return;
        
        const topPerformers = data.top_performers;
        
        // Mise à jour du top 10 Hausse quotidienne
        if (topPerformers.daily && topPerformers.daily.best) {
            renderTopTenCards('top-daily-gainers', topPerformers.daily.best.slice(0, 10), 'change_24h', currentMarket);
        }
        
        // Mise à jour du top 10 Baisse quotidienne
        if (topPerformers.daily && topPerformers.daily.worst) {
            renderTopTenCards('top-daily-losers', topPerformers.daily.worst.slice(0, 10), 'change_24h', currentMarket);
        }
        
        // Mise à jour du top 10 Hausse 7 jours
        if (topPerformers.ytd && topPerformers.ytd.best) {
            renderTopTenCards('top-ytd-gainers', topPerformers.ytd.best.slice(0, 10), 'change_7d', currentMarket);
        }
        
        // Mise à jour du top 10 Baisse 7 jours
        if (topPerformers.ytd && topPerformers.ytd.worst) {
            renderTopTenCards('top-ytd-losers', topPerformers.ytd.worst.slice(0, 10), 'change_7d', currentMarket);
        }
    }
    
    /**
     * Fonction pour afficher les cartes du top 10 avec un design attrayant
     */
    function renderTopTenCards(containerId, cryptos, valueField, marketSource) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!cryptos || cryptos.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Créer les cartes pour chaque cryptomonnaie (jusqu'à 10)
        const displayCryptos = cryptos.slice(0, 10);
        
        displayCryptos.forEach((crypto, index) => {
            // Déterminer le signe et la classe pour la valeur
            // Support pour les deux formats de données possibles
            let value = crypto[valueField] || crypto.change_7d || crypto.change || crypto.ytd || '-';
            let valueClass = 'positive';
            
            if (value.includes('-')) {
                valueClass = 'negative';
            }
            
            // Déterminer l'icône du marché
            let marketIcon = '';
            if (marketSource === 'global') {
                marketIcon = crypto.marketIcon || '';
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
                    <div class="stock-name">${crypto.symbol || crypto.name?.split(' ')[0] || '-'} ${marketIcon}</div>
                    <div class="stock-fullname">${crypto.name || '-'}</div>
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
    function updateTopPerformersHTML(containerId, cryptos, valueField) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si pas de données, afficher un message
        if (!cryptos || cryptos.length === 0) {
            container.innerHTML = `
                <div class="flex justify-center items-center py-4 text-gray-400">
                    <i class="fas fa-info-circle mr-2"></i>
                    Aucune donnée disponible
                </div>
            `;
            return;
        }
        
        // Adaptation du champ de valeur selon le format
        const getDisplayValue = (crypto, field) => {
            return crypto[field] || crypto.change_7d || crypto.change || crypto.ytd || '-';
        };
        
        // Générer le HTML pour chaque cryptomonnaie
        cryptos.forEach((crypto, i) => {
            const row = document.createElement('div');
            row.className = 'performer-row';
            
            const displayValue = getDisplayValue(crypto, valueField);
            const valueClass = displayValue.includes('-') ? 'negative' : 'positive';
            
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${crypto.name || ""}</div>
                    <div class="performer-country">${crypto.symbol || ""}</div>
                </div>
                <div class="performer-value ${valueClass}">
                    ${displayValue}
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
        const searchInput = document.getElementById('crypto-search');
        const clearButton = document.getElementById('clear-search');
        const searchInfo = document.getElementById('search-info');
        const searchCount = document.getElementById('search-count');
        const alphabetTabs = document.querySelectorAll('.region-tab');
        
        if (!searchInput || !clearButton) return;
        
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
                    
                    const cryptoName = row.cells[0].textContent.toLowerCase();
                    const cryptoSymbol = row.cells[1].textContent.toLowerCase();
                    
                    if (cryptoName.includes(searchTerm) || cryptoSymbol.includes(searchTerm)) {
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
            } else if (type === 'success') {
                notification.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
                notification.style.borderLeft = '3px solid var(--accent-color)';
                notification.style.color = 'var(--accent-color)';
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