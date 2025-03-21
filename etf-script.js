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
    let currentEtfCategory = 'top50'; // 'top50', 'bonds', 'shortterm'
    
    // Initialiser les onglets alphabet
    initAlphabetTabs();
    
    // Initialiser les sélecteurs de marché
    initMarketSelector();
    
    // Initialiser les sélecteurs de catégorie ETF
    initEtfCategorySelector();
    
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
     * Initialise les sélecteurs de catégorie ETF
     */
    function initEtfCategorySelector() {
        const top50Button = document.getElementById('category-top50');
        const bondsButton = document.getElementById('category-bonds');
        const shorttermButton = document.getElementById('category-shortterm');
        
        if (top50Button) {
            top50Button.addEventListener('click', function() {
                switchEtfCategory('top50');
            });
        }
        
        if (bondsButton) {
            bondsButton.addEventListener('click', function() {
                switchEtfCategory('bonds');
            });
        }
        
        if (shorttermButton) {
            shorttermButton.addEventListener('click', function() {
                switchEtfCategory('shortterm');
            });
        }
        
        // Initial setup of visibility
        updateEtfCategoryUI();
    }
    
    /**
     * Switch to a different ETF category and update UI
     */
    function switchEtfCategory(category) {
        if (currentEtfCategory !== category) {
            currentEtfCategory = category;
            updateEtfCategoryUI();
        }
    }
    
    /**
     * Update UI based on selected ETF category
     */
    function updateEtfCategoryUI() {
        // Update category buttons state
        const categoryButtons = document.querySelectorAll('.market-btn');
        categoryButtons.forEach(btn => {
            const btnCategory = btn.getAttribute('data-category');
            btn.classList.toggle('active', btnCategory === currentEtfCategory);
        });
        
        // Update title based on category
        const titleElement = document.getElementById('market-title');
        if (titleElement) {
            if (currentEtfCategory === 'top50') {
                titleElement.textContent = 'TOP 50 ETF';
            } else if (currentEtfCategory === 'bonds') {
                titleElement.textContent = 'TOP ETF Obligations';
            } else if (currentEtfCategory === 'shortterm') {
                titleElement.textContent = 'TOP ETF Court Terme';
            }
        }
        
        // Show/hide relevant sections
        const topEtfSection = document.querySelector('.top-etf-section');
        const topBondSection = document.querySelector('.top-bond-section');
        const topShortTermSection = document.querySelector('.top-short-term-section');
        
        if (topEtfSection && topBondSection && topShortTermSection) {
            topEtfSection.style.display = currentEtfCategory === 'top50' ? 'block' : 'none';
            topBondSection.style.display = currentEtfCategory === 'bonds' ? 'block' : 'none';
            topShortTermSection.style.display = currentEtfCategory === 'shortterm' ? 'block' : 'none';
        }
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
     * Charge les données d'ETFs depuis le fichier JSON unique
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
            // Utiliser le fichier ETF JSON unique
            const url = `data/etf.json`;
            
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            
            console.log(`🔍 Chargement des données depuis ${url}${cacheBuster}`);
            
            const response = await fetch(`${url}${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            // Charger les données
            const rawData = await response.json();
            
            // Assigner les données chargées
            etfsData = rawData;
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(etfsData.meta.timestamp || Date.now());
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            etfsData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Afficher une notification si les données sont périmées
            if (etfsData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            // Afficher les données
            renderEtfsData();
            renderTopEtfTables();
            renderTopShortTermTable();
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
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('etfs-loading');
            showElement('etfs-error');
        }
    }

    /**
     * Affiche les données des TOP ETF et TOP ETF Obligations
     */
    function renderTopEtfTables() {
        try {
            // Vérifier si les données sont disponibles
            if (!etfsData.top50_etfs || !etfsData.top_bond_etfs) {
                console.warn("Les données TOP ETF ne sont pas disponibles");
                return;
            }
            
            // Récupérer les éléments du DOM
            const topEtfBody = document.getElementById('top-etf-body');
            const topBondBody = document.getElementById('top-bond-body');
            
            if (!topEtfBody || !topBondBody) {
                console.warn("Les éléments du DOM pour les TOP ETF ne sont pas disponibles");
                return;
            }
            
            // Vider les conteneurs
            topEtfBody.innerHTML = '';
            topBondBody.innerHTML = '';
            
            // Afficher tous les TOP 50 ETF (sans limite)
            const topEtfs = etfsData.top50_etfs;
            topEtfs.forEach(etf => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="font-medium">${etf.name || etf.focus || '-'}</td>
                    <td class="${etf.ytd.includes('-') ? 'negative' : 'positive'}">${etf.ytd || '-'}</td>
                    <td class="${etf.one_month.includes('-') ? 'negative' : 'positive'}">${etf.one_month || '-'}</td>
                    <td class="${etf.one_year.includes('-') ? 'negative' : 'positive'}">${etf.one_year || '-'}</td>
                `;
                topEtfBody.appendChild(row);
            });
            
            // Afficher tous les TOP ETF Obligations (sans limite)
            const topBondEtfs = etfsData.top_bond_etfs;
            topBondEtfs.forEach(etf => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="font-medium">${etf.name || etf.focus || '-'}</td>
                    <td class="${etf.ytd.includes('-') ? 'negative' : 'positive'}">${etf.ytd || '-'}</td>
                    <td class="${etf.one_month.includes('-') ? 'negative' : 'positive'}">${etf.one_month || '-'}</td>
                    <td class="${etf.one_year.includes('-') ? 'negative' : 'positive'}">${etf.one_year || '-'}</td>
                `;
                topBondBody.appendChild(row);
            });
            
            console.log(`Rendu de ${topEtfs.length} TOP ETF et ${topBondEtfs.length} TOP ETF Obligations`);
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des TOP ETF:', error);
        }
    }
    
    /**
     * Affiche les données des ETF court terme
     */
    function renderTopShortTermTable() {
        try {
            // Vérifier si les données sont disponibles
            if (!etfsData.top_short_term_etfs) {
                console.warn("Les données TOP ETF court terme ne sont pas disponibles");
                return;
            }
            
            // Récupérer l'élément du DOM
            const topShortTermBody = document.getElementById('top-short-term-body');
            
            if (!topShortTermBody) {
                console.warn("L'élément DOM pour les TOP ETF court terme n'est pas disponible");
                return;
            }
            
            // Vider le conteneur
            topShortTermBody.innerHTML = '';
            
            // Si pas de données, afficher un message
            if (etfsData.top_short_term_etfs.length === 0) {
                topShortTermBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center py-4 text-gray-400">
                            <i class="fas fa-info-circle mr-2"></i>
                            Aucun ETF court terme disponible
                        </td>
                    </tr>
                `;
                return;
            }
            
            // Afficher tous les ETF court terme
            etfsData.top_short_term_etfs.forEach(etf => {
                const row = document.createElement('tr');
                
                // Détermine les classes CSS pour les valeurs numériques
                const oneMonthClass = etf.oneMonth && parseFloat(etf.oneMonth) < 0 ? 'negative' : 'positive';
                const oneYearClass = etf.oneYear && parseFloat(etf.oneYear) < 0 ? 'negative' : 'positive';
                
                // Format avec % pour l'affichage
                const oneMonthDisplay = etf.oneMonth ? etf.oneMonth + '%' : '-';
                const oneYearDisplay = etf.oneYear ? etf.oneYear + '%' : '-';
                
                // Structure HTML adapté au tableau des ETF court terme
                row.innerHTML = `
                    <td class="font-medium">${etf.name || '-'}</td>
                    <td class="${oneMonthClass}">${oneMonthDisplay}</td>
                    <td>${etf.category || '-'}</td>
                    <td>1</td>
                    <td>${etf.ytd ? etf.ytd + '%' : '-'}</td>
                    <td>${etf.category || '-'}</td>
                    <td>1</td>
                `;
                
                topShortTermBody.appendChild(row);
            });
            
            console.log(`Rendu de ${etfsData.top_short_term_etfs.length} TOP ETF court terme`);
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des TOP ETF court terme:', error);
            
            // Afficher un message d'erreur dans le tableau
            const topShortTermBody = document.getElementById('top-short-term-body');
            if (topShortTermBody) {
                topShortTermBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center py-4 text-red-400">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            Erreur lors du chargement des données ETF court terme
                        </td>
                    </tr>
                `;
            }
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