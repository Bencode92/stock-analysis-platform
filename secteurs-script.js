/**
 * secteurs-script.js - Scripts pour la page des secteurs boursiers
 * Organisé par région (Europe/US) plutôt que par catégorie de secteur
 */

document.addEventListener('DOMContentLoaded', function() {
    // Ajouter un indicateur de debug dans la console
    console.log('🔍 Initialisation de la page des secteurs boursiers');
    
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
     * Ajoute les étiquettes VAR % et YTD au-dessus des valeurs
     */
    function addDataLabels() {
        // Sélectionner toutes les cellules de secteurs
        const sectorCols = document.querySelectorAll('.sector-col');
        console.log('🔍 Nombre de secteurs trouvés:', sectorCols.length);
        
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
     * Initialise les onglets de région
     */
    function initRegionTabs() {
        const tabs = document.querySelectorAll('.region-tab');
        console.log('🔍 Onglets de région trouvés:', tabs.length);
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Mettre à jour les onglets actifs
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Afficher le contenu correspondant
                const region = this.getAttribute('data-region');
                console.log('🔍 Région sélectionnée:', region);
                
                const contents = document.querySelectorAll('.region-content');
                
                contents.forEach(content => {
                    content.classList.add('hidden');
                });
                
                const selectedContent = document.getElementById(`${region}-sectors`);
                if (selectedContent) {
                    selectedContent.classList.remove('hidden');
                } else {
                    console.error(`❌ Contenu pour la région ${region} non trouvé!`);
                }
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
        console.log('🔍 Début du chargement des données sectorielles');
        
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
            
            console.log('✅ Données JSON récupérées avec succès');
            
            // Charger les données
            const rawData = await response.json();
            
            // Log pour déboguer
            console.log('🔍 Données brutes reçues:', {
                nbSectors: Object.values(rawData.sectors).reduce((acc, curr) => acc + curr.length, 0),
                timestamp: rawData.meta.timestamp
            });
            
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
            
            // Log du nombre de secteurs par catégorie
            for (const [category, sectors] of Object.entries(sectorsData.sectors)) {
                console.log(`🔍 Catégorie ${category}: ${sectors.length} secteurs`);
            }
            
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
     * Affiche les données de secteurs dans l'interface, organisées par région
     */
    function renderSectorsData() {
        try {
            console.log('🔍 Début du rendu des données sectorielles');
            
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
            
            // Préparer les données par région
            const regionData = {
                "europe": [],
                "us": []
            };
            
            // Regrouper tous les secteurs par région
            for (const [category, sectors] of Object.entries(sectorsData.sectors)) {
                sectors.forEach(sector => {
                    // Log pour déboguer
                    console.log(`🔍 Traitement de secteur: ${sector.name}, Source: ${sector.source}, Région: ${sector.region}`);
                    
                    // Classer précisément par le nom de l'indice
                    if (sector.name && (sector.name.includes("Stoxx Europe 600") || sector.name.includes("STOXX Europe 600"))) {
                        regionData.europe.push({...sector, category});
                        console.log(`✅ Classé dans EUROPE: ${sector.name}`);
                    } 
                    else if (sector.name && sector.name.includes("NASDAQ US")) {
                        regionData.us.push({...sector, category});
                        console.log(`✅ Classé dans US: ${sector.name}`);
                    }
                    // Classement de fallback par source ou région explicite
                    else if (sector.region === "Europe" || sector.source === "Les Echos") {
                        regionData.europe.push({...sector, category});
                        console.log(`✅ Classé dans EUROPE (fallback): ${sector.name}`);
                    } 
                    else if (sector.region === "US" || sector.source === "Boursorama") {
                        regionData.us.push({...sector, category});
                        console.log(`✅ Classé dans US (fallback): ${sector.name}`);
                    }
                });
            }
            
            // Ajoutez un log pour vérifier la répartition finale
            console.log(`📊 Nombre de secteurs pour l'Europe: ${regionData.europe.length}`);
            console.log(`📊 Nombre de secteurs pour les US: ${regionData.us.length}`);
            
            // Générer le HTML pour chaque région
            for (const [region, sectors] of Object.entries(regionData)) {
                const tableBody = document.getElementById(`${region}-sectors-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas de secteurs, afficher un message
                    if (sectors.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="5" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                        console.warn(`⚠️ Aucun secteur trouvé pour la région ${region}`);
                    } else {
                        // Trier les secteurs par nom
                        const sortedSectors = [...sectors].sort((a, b) => {
                            return (a.name || "").localeCompare(b.name || "");
                        });
                        
                        // Remplir avec les données
                        sortedSectors.forEach(sector => {
                            const row = document.createElement('tr');
                            
                            // Déterminer la classe CSS pour les valeurs (positif/négatif)
                            const changeClass = sector.changePercent && sector.changePercent.includes('-') ? 'negative' : 'positive';
                            const ytdClass = sector.ytdChange && sector.ytdChange.includes('-') ? 'negative' : 'positive';
                            
                            // Création de la ligne avec la structure correcte
                            row.innerHTML = `
                                <td>${sector.name || '-'}</td>
                                <td>${sector.value || '-'}</td>
                                <td class="${changeClass}">${sector.changePercent || '-'}</td>
                                <td class="${ytdClass}">${sector.ytdChange || '-'}</td>
                                <td>
                                    <button class="p-1 px-3 rounded bg-green-400 bg-opacity-10 text-green-400 text-xs">Voir</button>
                                </td>
                            `;
                            
                            tableBody.appendChild(row);
                        });
                        
                        console.log(`✅ Tableau ${region} rempli avec ${sortedSectors.length} secteurs`);
                    }
                } else {
                    console.error(`❌ Tableau body non trouvé pour la région ${region}`);
                }
            }
            
            // Mettre à jour l'aperçu des secteurs
            updateSectorOverview(regionData);
            
            // Calculer et afficher les top performers
            updateTopPerformers(regionData);
            
            // Masquer le loader et afficher les données
            hideElement('sectors-loading');
            hideElement('sectors-error');
            showElement('sectors-container');
            
            console.log('✅ Rendu des données terminé avec succès');
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
            hideElement('sectors-loading');
            showElement('sectors-error');
        }
    }
    
    /**
     * Met à jour l'aperçu des secteurs
     */
    function updateSectorOverview(regionData) {
        try {
            console.log('🔍 Mise à jour de l\'aperçu des secteurs...');
            
            // Europe - STOXX 600
            updateSectorOverviewRegion('europe', [
                { name: 'Énergie', category: 'energy', selector: '.sector-col[data-sector="energy"], [data-sector="energy"]' },
                { name: 'Finance', category: 'financials', selector: '.sector-col[data-sector="financials"], [data-sector="financials"]' },
                { name: 'Technologie', category: 'information-technology', selector: '.sector-col[data-sector="technology"], [data-sector="technology"]' },
                { name: 'Santé', category: 'healthcare', selector: '.sector-col[data-sector="healthcare"], [data-sector="healthcare"]' }
            ], regionData.europe);
            
            // USA - NASDAQ US
            updateSectorOverviewRegion('us', [
                { name: 'Énergie', category: 'energy', selector: '.sector-col[data-sector="energy-us"], [data-sector="energy-us"]' },
                { name: 'Finance', category: 'financials', selector: '.sector-col[data-sector="financials-us"], [data-sector="financials-us"]' },
                { name: 'Technologie', category: 'information-technology', selector: '.sector-col[data-sector="technology-us"], [data-sector="technology-us"]' },
                { name: 'Santé', category: 'healthcare', selector: '.sector-col[data-sector="healthcare-us"], [data-sector="healthcare-us"]' }
            ], regionData.us);
            
            console.log('✅ Mise à jour de l\'aperçu des secteurs terminée');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'aperçu des secteurs:', error);
        }
    }
    
    /**
     * Met à jour une région spécifique de l'aperçu des secteurs
     */
    function updateSectorOverviewRegion(regionName, sectorsInfo, sectorsList) {
        sectorsInfo.forEach(sectorInfo => {
            try {
                console.log(`🔍 Recherche de l'élément pour ${sectorInfo.name} (${regionName}) avec sélecteur: ${sectorInfo.selector}`);
                
                // Trouver l'élément dans le DOM
                const container = document.querySelector(sectorInfo.selector);
                if (!container) {
                    console.warn(`⚠️ Élément non trouvé pour le sélecteur: ${sectorInfo.selector}`);
                    // Essayer un sélecteur plus simple
                    const simpleSelector = `[data-sector="${sectorInfo.category}"]`;
                    const containerAlternative = document.querySelector(simpleSelector);
                    if (containerAlternative) {
                        console.log(`✅ Élément trouvé avec le sélecteur alternatif: ${simpleSelector}`);
                        updateSectorElement(containerAlternative, sectorInfo, sectorsList, regionName);
                    }
                    return;
                }
                
                updateSectorElement(container, sectorInfo, sectorsList, regionName);
                
            } catch (error) {
                console.error(`❌ Erreur lors de la mise à jour de ${sectorInfo.name}:`, error);
            }
        });
    }
    
    /**
     * Met à jour un élément de secteur avec les bonnes données
     */
    function updateSectorElement(container, sectorInfo, sectorsList, regionName) {
        // Filtrer tous les secteurs de la catégorie
        const sectorsInCategory = sectorsList.filter(s => s.category === sectorInfo.category);
        console.log(`🔍 Secteurs trouvés pour ${sectorInfo.name} (${regionName}): ${sectorsInCategory.length}`);
        
        // Si on n'a pas trouvé de secteurs dans cette catégorie
        if (sectorsInCategory.length === 0) {
            console.warn(`⚠️ Aucun secteur trouvé pour: ${sectorInfo.name} dans la région ${regionName}`);
            
            // Afficher un message dans l'interface
            const nameElement = container.querySelector('.sector-name');
            const valueElement = container.querySelector('.sector-value');
            const ytdElement = container.querySelector('.sector-ytd');
            
            if (nameElement) nameElement.textContent = sectorInfo.name;
            if (valueElement) {
                valueElement.textContent = 'N/A';
                valueElement.className = 'sector-value';
            }
            if (ytdElement) {
                ytdElement.textContent = 'N/A';
                ytdElement.className = 'sector-ytd';
            }
            return;
        }
        
        // Prendre le premier secteur pour l'affichage (ou faire une moyenne)
        const sector = sectorsInCategory[0];
        console.log(`✅ Utilisation du secteur ${sector.name} pour l'affichage`);
        
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
    }
    
    /**
     * Calcule et affiche les top performers
     */
    function updateTopPerformers(regionData) {
        try {
            // Collecter tous les secteurs dans une liste plate
            const allSectors = [...regionData.europe, ...regionData.us];
            
            // Si pas assez de secteurs, ne rien faire
            if (allSectors.length < 3) {
                console.warn('⚠️ Pas assez de secteurs pour calculer les top performers');
                return;
            }
            
            // Fonction pour extraire la valeur numérique d'un pourcentage
            function extractPercentageValue(percentStr) {
                if (!percentStr) return 0;
                const value = percentStr.replace(/[^0-9\-\.,]/g, '').replace(',', '.');
                return parseFloat(value) || 0;
            }
            
            // Préparer les secteurs avec des valeurs numériques pour les classements
            const preparedSectors = allSectors.map(sector => {
                const changePercentValue = extractPercentageValue(sector.changePercent);
                const ytdChangeValue = extractPercentageValue(sector.ytdChange);
                
                return {
                    ...sector,
                    changePercentValue,
                    ytdChangeValue
                };
            });
            
            // Filtrer les secteurs sans données numériques valides
            const validSectors = preparedSectors.filter(
                sector => !isNaN(sector.changePercentValue) && !isNaN(sector.ytdChangeValue)
            );
            
            console.log(`🔍 Secteurs valides pour le top performers: ${validSectors.length}`);
            
            // Obtenir les tops et flops pour var%
            const topDaily = [...validSectors].sort((a, b) => b.changePercentValue - a.changePercentValue).slice(0, 3);
            const bottomDaily = [...validSectors].sort((a, b) => a.changePercentValue - b.changePercentValue).slice(0, 3);
            
            // Obtenir les tops et flops pour YTD
            const topYTD = [...validSectors].sort((a, b) => b.ytdChangeValue - a.ytdChangeValue).slice(0, 3);
            const bottomYTD = [...validSectors].sort((a, b) => a.ytdChangeValue - b.ytdChangeValue).slice(0, 3);
            
            // Mettre à jour le HTML
            updateTopPerformersHTML('daily-top', topDaily);
            updateTopPerformersHTML('daily-bottom', bottomDaily);
            updateTopPerformersHTML('ytd-top', topYTD);
            updateTopPerformersHTML('ytd-bottom', bottomYTD);
            
            console.log('✅ Top performers mis à jour');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour des top performers:', error);
        }
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
            
            // Obtenir la région au format d'affichage
            const regionDisplay = sector.region === "Europe" ? "STOXX Europe 600" : 
                                 sector.region === "US" ? "NASDAQ US" : 
                                 sector.source === "Les Echos" ? "STOXX Europe 600" : "NASDAQ US";
            
            row.innerHTML = `
                <div class="performer-info">
                    <div class="performer-index">${sector.name}</div>
                    <div class="performer-region">${regionDisplay}</div>
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
        } else {
            console.warn(`⚠️ Élément avec id '${id}' non trouvé`);
        }
    }
    
    function hideElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add('hidden');
        } else {
            console.warn(`⚠️ Élément avec id '${id}' non trouvé`);
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