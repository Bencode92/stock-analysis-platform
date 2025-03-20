/**
 * secteurs-script.js - Scripts pour la page des secteurs boursiers
 * Basé sur la structure de marches-script.js mais adapté pour les données sectorielles
 */

document.addEventListener('DOMContentLoaded', function() {
    // Variables globales pour stocker les données
    let sectorsData = {
        sectors: {
            "energy": [],
            "materials": [],
            "industrials": [],
            "consumer-discretionary": [],
            "consumer-staples": [],
            "healthcare": [],
            "financials": [],
            "information-technology": [],
            "communication-services": [],
            "utilities": [],
            "real-estate": []
        },
        meta: {
            sources: ["Les Echos", "Boursorama"],
            timestamp: null,
            count: 0,
            isStale: false
        }
    };
    
    // Mapping des catégories pour les onglets d'affichage
    const categoryMapping = {
        "energy": "energy",
        "materials": "materials",
        "industrials": "industrials",
        "consumer-discretionary": "consumer", 
        "consumer-staples": "consumer",
        "healthcare": "healthcare",
        "financials": "financials",
        "information-technology": "technology",
        "communication-services": "technology",
        "utilities": "utilities",
        "real-estate": "real-estate"
    };
    
    // Mapping des libellés des catégories
    const categoryLabels = {
        "energy": "Énergie",
        "materials": "Matériaux",
        "industrials": "Industrie",
        "consumer-discretionary": "Consommation Discrétionnaire",
        "consumer-staples": "Consommation de Base",
        "healthcare": "Santé",
        "financials": "Finance",
        "information-technology": "Technologie",
        "communication-services": "Communication",
        "utilities": "Services Publics",
        "real-estate": "Immobilier"
    };
    
    // Mapping des régions pour l'affichage
    const regionLabels = {
        "Europe": "STOXX Europe 600",
        "US": "S&P 500 Sectors"
    };
    
    // État du scraper
    let isLoading = false;
    let lastUpdate = null;
    
    // Initialiser les onglets de secteurs
    initSectorTabs();
    
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
     * Ajoute les étiquettes VAR % et YTD au-dessus des valeurs
     */
    function addDataLabels() {
        // Sélectionner toutes les cellules de secteurs
        const sectorCols = document.querySelectorAll('.sector-col');
        
        sectorCols.forEach(col => {
            const dataContainer = col.querySelector('.sector-data');
            if (dataContainer) {
                // Créer le conteneur pour les étiquettes
                const labelsContainer = document.createElement('div');
                labelsContainer.className = 'sector-index-labels';
                labelsContainer.style.display = 'flex';
                labelsContainer.style.justifyContent = 'space-between';
                labelsContainer.style.fontSize = '0.7rem';
                labelsContainer.style.color = 'rgba(255, 255, 255, 0.5)';
                labelsContainer.style.marginBottom = '2px';
                
                // Créer les étiquettes
                labelsContainer.innerHTML = `
                    <div style="min-width: 62px; text-align: right;">VAR %</div>
                    <div style="min-width: 62px; text-align: right;">YTD</div>
                `;
                
                // Insérer les étiquettes avant les données
                col.insertBefore(labelsContainer, dataContainer);
            }
        });
    }
    
    /**
     * Initialise les onglets de secteurs
     */
    function initSectorTabs() {
        const tabs = document.querySelectorAll('.sector-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Mettre à jour les onglets actifs
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher le contenu correspondant
                const category = this.getAttribute('data-category');
                const contents = document.querySelectorAll('.sector-content');
                
                contents.forEach(content => {
                    content.classList.add('hidden');
                });
                
                document.getElementById(`${category}-sectors`)?.classList.remove('hidden');
            });
        });
    }
    
    /**
     * Charge les données de secteurs depuis le fichier JSON
     */
    async function loadSectorsData(forceRefresh = false) {
        // Éviter les chargements multiples simultanés
        if (isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        isLoading = true;
        
        // Afficher le loader
        showElement('sectors-loading');
        hideElement('sectors-error');
        hideElement('sectors-container');
        
        try {
            // Récupérer les données depuis le fichier JSON
            // Pour éviter le cache du navigateur en cas de forceRefresh
            const cacheBuster = forceRefresh ? `?t=${Date.now()}` : '';
            const response = await fetch(`data/sectors.json${cacheBuster}`);
            
            if (!response.ok) {
                throw new Error(`Erreur de chargement: ${response.status}`);
            }
            
            // Charger les données
            const rawData = await response.json();
            
            // S'assurer que toutes les catégories existent dans les données
            sectorsData = {
                sectors: {
                    "energy": rawData.sectors.energy || [],
                    "materials": rawData.sectors.materials || [],
                    "industrials": rawData.sectors.industrials || [],
                    "consumer-discretionary": rawData.sectors["consumer-discretionary"] || [],
                    "consumer-staples": rawData.sectors["consumer-staples"] || [],
                    "healthcare": rawData.sectors.healthcare || [],
                    "financials": rawData.sectors.financials || [],
                    "information-technology": rawData.sectors["information-technology"] || [],
                    "communication-services": rawData.sectors["communication-services"] || [],
                    "utilities": rawData.sectors.utilities || [],
                    "real-estate": rawData.sectors["real-estate"] || []
                },
                meta: rawData.meta
            };
            
            // Vérifier la fraîcheur des données
            const dataTimestamp = new Date(sectorsData.meta.timestamp);
            const now = new Date();
            const dataAge = now - dataTimestamp;
            const MAX_DATA_AGE = 60 * 60 * 1000; // 1 heure en millisecondes
            
            // Marquer les données comme périmées si plus vieilles que MAX_DATA_AGE
            sectorsData.meta.isStale = dataAge > MAX_DATA_AGE;
            
            // Afficher une notification si les données sont périmées
            if (sectorsData.meta.isStale) {
                showNotification('Les données affichées datent de plus d\'une heure', 'warning');
            }
            
            // Afficher les données
            renderSectorsData();
            lastUpdate = new Date();
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            showElement('sectors-error');
            hideElement('sectors-loading');
            hideElement('sectors-container');
        } finally {
            // Réinitialiser l'état
            isLoading = false;
        }
    }
    
    /**
     * Affiche les données de secteurs dans l'interface
     */
    function renderSectorsData() {
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(sectorsData.meta.timestamp);
            
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
            if (sectorsData.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            document.getElementById('last-update-time').textContent = formattedDate;
            
            // Créer un mapping pour regrouper les secteurs par onglet d'affichage
            const displayCategories = {
                "energy": [],
                "financials": [],
                "technology": [],
                "healthcare": [],
                "consumer": [],
                "industrials": [],
                "materials": [],
                "utilities": [],
                "real-estate": []
            };
            
            // Regrouper les secteurs par catégorie d'affichage
            for (const [category, sectors] of Object.entries(sectorsData.sectors)) {
                const displayCategory = categoryMapping[category] || "other";
                if (displayCategories[displayCategory]) {
                    sectors.forEach(sector => {
                        // Ajouter la catégorie d'origine comme information supplémentaire
                        sector.originalCategory = category;
                        sector.categoryLabel = categoryLabels[category] || category;
                        displayCategories[displayCategory].push(sector);
                    });
                }
            }
            
            // Générer le HTML pour chaque catégorie d'affichage
            for (const [displayCategory, sectors] of Object.entries(displayCategories)) {
                const tableBody = document.getElementById(`${displayCategory}-sectors-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas de secteurs, afficher un message
                    if (sectors.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="6" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette catégorie
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Trier les secteurs par région puis par nom
                        const sortedSectors = [...sectors].sort((a, b) => {
                            // D'abord trier par région
                            if (a.region !== b.region) {
                                return (a.region || "").localeCompare(b.region || "");
                            }
                            
                            // Ensuite par nom de secteur
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        
                        // Remplir avec les données
                        sortedSectors.forEach(sector => {
                            const row = document.createElement('tr');
                            
                            // Déterminer la classe CSS pour les valeurs (positif/négatif)
                            const changeClass = sector.changePercent && sector.changePercent.includes('-') ? 'negative' : 'positive';
                            const ytdClass = sector.ytdChange && sector.ytdChange.includes('-') ? 'negative' : 'positive';
                            
                            // Obtenir le libellé de la région
                            const regionLabel = regionLabels[sector.region] || sector.region;
                            
                            // Création de la ligne avec la structure correcte
                            row.innerHTML = `
                                <td class="font-medium">${regionLabel || '-'}</td>
                                <td>${sector.categoryLabel || sector.name || '-'}</td>
                                <td>${sector.value || '-'}</td>
                                <td class="${changeClass}">${sector.changePercent || '-'}</td>
                                <td class="${ytdClass}">${sector.ytdChange || '-'}</td>
                                <td>
                                    <button class="p-1 px-3 rounded bg-green-400 bg-opacity-10 text-green-400 text-xs">Voir</button>
                                </td>
                            `;
                            
                            tableBody.appendChild(row);
                        });
                    }
                }
            }
            
            // Mettre à jour l'aperçu des secteurs
            updateSectorOverview();
            
            // Calculer et afficher les top performers
            updateTopPerformers();
            
            // Masquer le loader et afficher les données
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
                { name: 'Énergie', category: 'energy', selector: '.sector-col[data-sector="energy"]' },
                { name: 'Finance', category: 'financials', selector: '.sector-col[data-sector="financials"]' },
                { name: 'Technologie', category: 'information-technology', selector: '.sector-col[data-sector="technology"]' },
                { name: 'Santé', category: 'healthcare', selector: '.sector-col[data-sector="healthcare"]' }
            ]);
            
            // USA - S&P 500 Sectors
            updateSectorOverviewRegion('us', [
                { name: 'Énergie', category: 'energy', selector: '.sector-col[data-sector="energy-us"]' },
                { name: 'Finance', category: 'financials', selector: '.sector-col[data-sector="financials-us"]' },
                { name: 'Technologie', category: 'information-technology', selector: '.sector-col[data-sector="technology-us"]' },
                { name: 'Santé', category: 'healthcare', selector: '.sector-col[data-sector="healthcare-us"]' }
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
                // Trouver l'élément dans le DOM
                const container = document.querySelector(sectorInfo.selector);
                if (!container) {
                    console.warn(`Élément non trouvé pour le sélecteur: ${sectorInfo.selector}`);
                    return;
                }
                
                // Trouver le secteur correspondant dans les données
                const sector = findSectorByNameAndRegion(sectorInfo.category, region);
                if (!sector) {
                    console.warn(`Secteur non trouvé: ${sectorInfo.name} dans la région ${region}`);
                    return;
                }
                
                // Mettre à jour les valeurs
                const nameElement = container.querySelector('.sector-name');
                const valueElement = container.querySelector('.sector-value');
                const ytdElement = container.querySelector('.sector-ytd');
                
                if (nameElement) {
                    nameElement.textContent = sectorInfo.name;
                }
                
                if (valueElement) {
                    valueElement.textContent = sector.changePercent || '0,00 %';
                    valueElement.className = 'sector-value ' + (sector.changePercent && sector.changePercent.includes('-') ? 'negative' : 'positive');
                }
                
                if (ytdElement) {
                    ytdElement.textContent = sector.ytdChange || '0,00 %';
                    ytdElement.className = 'sector-ytd ' + (sector.ytdChange && sector.ytdChange.includes('-') ? 'negative' : 'positive');
                }
            } catch (error) {
                console.error(`Erreur lors de la mise à jour de ${sectorInfo.name}:`, error);
            }
        });
    }
    
    /**
     * Trouve un secteur par son nom de catégorie et sa région
     */
    function findSectorByNameAndRegion(category, displayRegion) {
        const regionMapping = {
            'europe': 'Europe',
            'us': 'US'
        };
        
        const targetRegion = regionMapping[displayRegion] || displayRegion;
        
        // Chercher dans la catégorie spécifiée
        if (sectorsData.sectors[category]) {
            const sector = sectorsData.sectors[category].find(s => 
                s.region && s.region.includes(targetRegion)
            );
            
            if (sector) return sector;
        }
        
        // Si non trouvé, chercher dans toutes les catégories (fallback)
        for (const [cat, sectors] of Object.entries(sectorsData.sectors)) {
            if (cat !== category) {
                const sector = sectors.find(s => 
                    s.region && s.region.includes(targetRegion)
                );
                
                if (sector) return sector;
            }
        }
        
        return null;
    }
    
    /**
     * Calcule et affiche les top performers
     */
    function updateTopPerformers() {
        // Collecter tous les secteurs dans une liste plate
        const allSectors = [];
        
        for (const [category, sectors] of Object.entries(sectorsData.sectors)) {
            if (sectors && sectors.length) {
                sectors.forEach(sector => {
                    // Ajouter la catégorie comme information
                    sector.category = category;
                    sector.categoryLabel = categoryLabels[category] || category;
                    allSectors.push(sector);
                });
            }
        }
        
        // Si pas assez de secteurs, ne rien faire
        if (allSectors.length < 3) {
            return;
        }
        
        // Préparer les secteurs avec des valeurs numériques pour les classements
        const preparedSectors = allSectors.map(sector => {
            // Fonction pour extraire la valeur numérique d'un pourcentage
            function extractPercentageValue(percentStr) {
                if (!percentStr) return 0;
                // Enlever le symbole % et autres caractères, conserver seulement les chiffres, le point et le signe -
                const value = percentStr.replace(/[^0-9\\\\\-\\\\\\\\.]/g, '').replace(',', '.');
                return parseFloat(value) || 0;
            }
            
            const changePercentValue = extractPercentageValue(sector.changePercent);
            const ytdChangeValue = extractPercentageValue(sector.ytdChange);
            
            return {
                ...sector,
                changePercentValue,
                ytdChangeValue
            };
        });
        
        // Filtrer les secteurs sans données numériques valides
        const filteredSectors = preparedSectors.filter(
            sector => !isNaN(sector.changePercentValue) && !isNaN(sector.ytdChangeValue)
        );
        
        // Obtenir les tops et flops pour var%
        const topDaily = [...filteredSectors].sort((a, b) => b.changePercentValue - a.changePercentValue).slice(0, 3);
        const bottomDaily = [...filteredSectors].sort((a, b) => a.changePercentValue - b.changePercentValue).slice(0, 3);
        
        // Obtenir les tops et flops pour YTD
        const topYTD = [...filteredSectors].sort((a, b) => b.ytdChangeValue - a.ytdChangeValue).slice(0, 3);
        const bottomYTD = [...filteredSectors].sort((a, b) => a.ytdChangeValue - b.ytdChangeValue).slice(0, 3);
        
        // Mettre à jour le HTML
        updateTopPerformersHTML('daily-top', topDaily);
        updateTopPerformersHTML('daily-bottom', bottomDaily);
        updateTopPerformersHTML('ytd-top', topYTD);
        updateTopPerformersHTML('ytd-bottom', bottomYTD);
    }
    
    /**
     * Met à jour le HTML pour une section de top performers
     */
    function updateTopPerformersHTML(containerId, sectors) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Générer le HTML pour chaque secteur
        sectors.forEach(sector => {
            const row = document.createElement('div');
            row.className = 'performer-row';
            
            const valueField = containerId.includes('ytd') ? 'ytdChange' : 'changePercent';
            const valueClass = (sector[valueField] || "").includes('-') ? 'negative' : 'positive';
            
            // Obtenir le libellé de la région
            const regionLabel = regionLabels[sector.region] || sector.region;
            
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${sector.categoryLabel || sector.name || ""}</div>
                    <div class="performer-region">${regionLabel || ""}</div>
                </div>
                <div class="performer-value ${valueClass}">
                    ${sector[valueField] || "-"}
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