/**
 * marches-script.js - Version corrigée qui correspond à la structure de Boursorama
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
            source: 'Boursorama',
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Mapping des continents pour le tri
    const continentOrder = {
        // Europe
        "France": "europe", 
        "Allemagne": "europe", 
        "Royaume-Uni": "europe", 
        "Italie": "europe", 
        "Espagne": "europe", 
        "Suisse": "europe", 
        "Pays-Bas": "europe", 
        "Belgique": "europe", 
        "Autriche": "europe", 
        "Portugal": "europe", 
        "Irlande": "europe", 
        "Danemark": "europe",
        "Finlande": "europe", 
        "Norvège": "europe", 
        "Suède": "europe", 
        "Pologne": "europe", 
        "Zone Euro": "europe",
        
        // Amérique du Nord
        "États-Unis": "north-america", 
        "Canada": "north-america",
        
        // Amérique Latine
        "Brésil": "latin-america", 
        "Mexique": "latin-america",
        "Argentine": "latin-america", 
        "Chili": "latin-america", 
        "Colombie": "latin-america", 
        "Pérou": "latin-america",
        
        // Asie
        "Japon": "asia", 
        "Chine": "asia", 
        "Hong Kong": "asia", 
        "Taïwan": "asia",
        "Corée du Sud": "asia", 
        "Singapour": "asia", 
        "Inde": "asia", 
        "Indonésie": "asia",
        "Malaisie": "asia", 
        "Philippines": "asia", 
        "Thaïlande": "asia",
        
        // Océanie
        "Australie": "other", 
        "Nouvelle-Zélande": "other",
        
        // Moyen-Orient et Afrique
        "Israël": "other", 
        "Émirats Arabes Unis": "other", 
        "Qatar": "other", 
        "Afrique du Sud": "other", 
        "Maroc": "other"
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
    
    // Premier chargement des données
    loadIndicesData();
    
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
     * Charge les données d'indices depuis le fichier JSON
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
            // Récupérer les données depuis le fichier JSON
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            const response = await fetch(`data/markets.json${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            // Charger les données
            const rawData = await response.json();
            
            // S'assurer que toutes les régions existent dans les données
            // Utiliser directement les données comme elles sont déjà structurées
            indicesData = {
                indices: {
                    europe: rawData.indices.europe || [],
                    "north-america": rawData.indices["north-america"] || [],
                    "latin-america": rawData.indices["latin-america"] || [],
                    asia: rawData.indices.asia || [],
                    other: rawData.indices.other || []
                },
                meta: rawData.meta
            };
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(indicesData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            indicesData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Afficher une notification si les données sont périmées
            if (indicesData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            // Afficher les données
            renderIndicesData();
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
            const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
            
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
                            <td colspan="6" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Trier les indices par pays puis par nom d'indice
                        const sortedIndices = [...indices].sort((a, b) => {
                            // D'abord trier par pays
                            if (a.country !== b.country) {
                                return (a.country || "").localeCompare(b.country || "");
                            }
                            
                            // Ensuite par nom d'indice
                            return (a.index_name || "").localeCompare(b.index_name || "");
                        });
                        
                        // Remplir avec les données
                        sortedIndices.forEach(index => {
                            const row = document.createElement('tr');
                            
                            // Création de la ligne avec la structure correcte (comme sur Boursorama)
                            row.innerHTML = `
                                <td class="font-medium">${index.country || '-'}</td>
                                <td>${index.index_name || '-'}</td>
                                <td>${index.value || '-'}</td>
                                <td class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.changePercent || '-'}</td>
                                <td class="${index.ytdChange && index.ytdChange.includes('-') ? 'negative' : 'positive'}">${index.ytdChange || '-'}</td>
                                <td>
                                    <button class="p-1 px-3 rounded bg-green-400 bg-opacity-10 text-green-400 text-xs">Voir</button>
                                </td>
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
            console.error('❌ Erreur lors de l\'affichage des données:', error);
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
                    (index.index_name || "").includes('CAC 40') || 
                    (index.index_name || "").includes('DAX') || 
                    (index.index_name || "").includes('FTSE 100') ||
                    (index.index_name || "").includes('EURO STOXX 50')
                );
                break;
            case 'north-america':
                importantIndices = indices.filter(index => 
                    (index.index_name || "").includes('DOW') || 
                    (index.index_name || "").includes('S&P 500') || 
                    (index.index_name || "").includes('NASDAQ') ||
                    (index.index_name || "").includes('TSX')
                );
                break;
            case 'latin-america':
                importantIndices = indices.filter(index => 
                    (index.index_name || "").includes('BOVESPA') || 
                    (index.index_name || "").includes('IPC') || 
                    (index.index_name || "").includes('MERVAL') ||
                    (index.index_name || "").includes('IPSA')
                );
                break;
            case 'asia':
                importantIndices = indices.filter(index => 
                    (index.index_name || "").includes('NIKKEI') || 
                    (index.index_name || "").includes('HANG SENG') || 
                    (index.index_name || "").includes('SSE') ||
                    (index.index_name || "").includes('KOSPI')
                );
                break;
            case 'other':
                importantIndices = indices.filter(index => 
                    (index.index_name || "").includes('ASX') || 
                    (index.index_name || "").includes('TA 35') || 
                    (index.index_name || "").includes('QE Index') ||
                    (index.index_name || "").includes('FTSE/JSE')
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
                <div class="font-medium">${index.index_name || ""}</div>
                <div class="${index.trend === 'down' ? 'negative' : 'positive'}">
                    ${index.changePercent || '-'} 
                    ${index.ytdChange ? `/ ${index.ytdChange}` : ''}
                </div>
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