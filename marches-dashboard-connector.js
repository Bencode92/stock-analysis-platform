/**
 * marches-dashboard-connector.js
 * Script pour afficher les indices principaux et les top performers dans le dashboard
 */

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page dashboard
    if (!window.location.pathname.includes('dashboard.html') && 
        !window.location.pathname.endsWith('/')) return;
    
    console.log('Initialisation du connecteur marches-dashboard...');
    
    // Fonction principale pour récupérer les données
    async function fetchMarketData() {
        try {
            // Récupérer les données depuis le fichier JSON
            const response = await fetch('data/markets.json');
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Mise à jour des indices principaux
            updateMainIndices(data);
            
            // Création et mise à jour des top performers
            createTopPerformers(data);
            
            console.log('Données des marchés mises à jour avec succès');
        } catch (error) {
            console.error('Erreur lors de la récupération des données:', error);
        }
    }
    
    // Mettre à jour les indices principaux (S&P 500, NASDAQ, CAC 40)
    function updateMainIndices(data) {
        // Extraire les données des indices
        let sp500 = findIndexByName(data, 'S&P 500');
        let nasdaq = findIndexByName(data, 'NASDAQ');
        let cac40 = findIndexByName(data, 'CAC 40');
        
        console.log('Indices principaux trouvés:', { sp500, nasdaq, cac40 });
        
        // Mise à jour des éléments DOM
        updateMarketWidget(sp500, nasdaq, cac40);
    }
    
    // Fonction pour trouver un indice par son nom
    function findIndexByName(data, indexName) {
        if (!data || !data.indices) return null;
        
        // Chercher dans toutes les régions
        const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
        
        for (const region of regions) {
            if (!data.indices[region]) continue;
            
            const found = data.indices[region].find(index => 
                index.index_name && index.index_name.includes(indexName));
            
            if (found) return found;
        }
        
        return null;
    }
    
    // Mise à jour de la section des marchés dans le dashboard
    function updateMarketWidget(sp500, nasdaq, cac40) {
        // Identifier et mettre à jour les éléments pour S&P 500
        if (sp500) {
            updateIndex('S&P 500', sp500.value, sp500.changePercent);
        }
        
        // Identifier et mettre à jour les éléments pour NASDAQ
        if (nasdaq) {
            updateIndex('NASDAQ', nasdaq.value, nasdaq.changePercent);
        }
        
        // Identifier et mettre à jour les éléments pour CAC 40
        if (cac40) {
            updateIndex('CAC 40', cac40.value, cac40.changePercent);
        }
    }
    
    // Fonction pour mettre à jour un indice spécifique
    function updateIndex(name, value, changePercent) {
        // Obtenir tous les blocs de marché
        const marketBlocks = document.querySelectorAll('#markets-widget .bg-\\[\\#011E34\\].bg-opacity-70.p-4.rounded-lg');
        
        // Parcourir chaque bloc et trouver celui contenant le nom de l'indice
        for (const block of marketBlocks) {
            const titleElement = block.querySelector('.font-medium');
            if (titleElement && titleElement.textContent === name) {
                // Mise à jour de la valeur
                const valueElement = block.querySelector('.text-2xl.font-bold');
                if (valueElement) valueElement.textContent = value;
                
                // Mise à jour de la variation
                const variationElement = block.querySelector('.text-sm');
                if (variationElement) {
                    const isPositive = !changePercent.includes('-');
                    variationElement.textContent = changePercent;
                    variationElement.className = isPositive 
                        ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                        : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
                }
                
                // Supprimer les valeurs d'ouverture, haut, bas
                const detailsGrid = block.querySelector('.grid');
                if (detailsGrid) {
                    detailsGrid.innerHTML = '';
                }
                
                break;
            }
        }
    }
    
    // Fonction pour extraire les top performers
    function getTopPerformers(data) {
        if (!data || !data.indices) return { topGainers: [], topLosers: [] };
        
        // Collecter tous les indices de toutes les régions
        const allIndices = [];
        const regions = ['europe', 'north-america', 'latin-america', 'asia', 'other'];
        
        regions.forEach(region => {
            if (data.indices[region] && data.indices[region].length) {
                allIndices.push(...data.indices[region]);
            }
        });
        
        // Préparer les indices avec des valeurs numériques pour les classements
        const preparedIndices = allIndices
            .filter(index => index && index.changePercent && index.index_name && index.country)
            .map(index => {
                // Extraire la valeur numérique du pourcentage
                const percentStr = index.changePercent;
                const percentValue = parseFloat(percentStr.replace(/[^\d.-]/g, ''));
                
                return {
                    name: index.index_name,
                    country: index.country,
                    changePercent: index.changePercent,
                    numericChange: percentValue || 0
                };
            });
        
        // Trier pour obtenir les top 3 hausses
        const topGainers = [...preparedIndices]
            .sort((a, b) => b.numericChange - a.numericChange)
            .slice(0, 3);
        
        // Trier pour obtenir les top 3 baisses
        const topLosers = [...preparedIndices]
            .sort((a, b) => a.numericChange - b.numericChange)
            .slice(0, 3);
        
        return { topGainers, topLosers };
    }
    
    // Fonction pour créer et mettre à jour les top performers
    function createTopPerformers(data) {
        // Extraire les top performers
        const { topGainers, topLosers } = getTopPerformers(data);
        
        console.log('Top performers trouvés:', { topGainers, topLosers });
        
        // Vérifier si la section existe déjà et la créer si nécessaire
        let topPerformersSection = document.getElementById('top-performers-section');
        
        if (!topPerformersSection) {
            // Obtenir l'élément parent (section marché)
            const marketsWidget = document.getElementById('markets-widget');
            if (!marketsWidget) {
                console.error("Section des marchés non trouvée");
                return;
            }
            
            // Créer la nouvelle section
            topPerformersSection = document.createElement('div');
            topPerformersSection.id = 'top-performers-section';
            topPerformersSection.className = 'mt-6';
            
            // Ajouter le titre "Top Performers"
            const title = document.createElement('div');
            title.className = 'flex justify-between items-center p-4 border-b border-neon-green border-opacity-20';
            title.innerHTML = `
                <h3 class="text-neon-green font-semibold text-lg">Top Performers du jour</h3>
                <div class="text-sm text-white text-opacity-70">Var %</div>
            `;
            
            // Créer le conteneur pour les top gainers et losers
            const container = document.createElement('div');
            container.className = 'p-5 grid grid-cols-1 md:grid-cols-2 gap-4';
            
            // Créer la section des top gainers
            const gainersSection = document.createElement('div');
            gainersSection.className = 'glassmorphism p-4 rounded-lg';
            gainersSection.innerHTML = `
                <div class="mb-3 font-medium text-neon-green">
                    <i class="fas fa-arrow-up mr-2"></i> Top 3 Hausses
                </div>
                <div id="top-gainers-list" class="space-y-3"></div>
            `;
            
            // Créer la section des top losers
            const losersSection = document.createElement('div');
            losersSection.className = 'glassmorphism p-4 rounded-lg';
            losersSection.innerHTML = `
                <div class="mb-3 font-medium text-red-400">
                    <i class="fas fa-arrow-down mr-2"></i> Top 3 Baisses
                </div>
                <div id="top-losers-list" class="space-y-3"></div>
            `;
            
            // Assembler les éléments
            container.appendChild(gainersSection);
            container.appendChild(losersSection);
            
            topPerformersSection.appendChild(title);
            topPerformersSection.appendChild(container);
            
            // Ajouter la section au widget des marchés
            marketsWidget.appendChild(topPerformersSection);
        }
        
        // Maintenant, mettre à jour les listes avec les données
        updateTopPerformersList('top-gainers-list', topGainers, true);
        updateTopPerformersList('top-losers-list', topLosers, false);
    }
    
    // Fonction pour mettre à jour une liste de top performers
    function updateTopPerformersList(listId, performers, isGainers) {
        const listElement = document.getElementById(listId);
        if (!listElement) return;
        
        // Vider la liste
        listElement.innerHTML = '';
        
        // Ajouter chaque performer
        performers.forEach(performer => {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center p-2 bg-black bg-opacity-20 rounded';
            
            const isPositive = !performer.changePercent.includes('-');
            const changeClass = isPositive ? 'trend-up' : 'trend-down';
            
            item.innerHTML = `
                <div>
                    <div class="font-medium">${performer.name}</div>
                    <div class="text-xs text-white text-opacity-70">${performer.country || ''}</div>
                </div>
                <div class="font-bold ${changeClass}">${performer.changePercent}</div>
            `;
            
            listElement.appendChild(item);
        });
    }
    
    // Exécuter la fonction au chargement
    fetchMarketData();
    
    // Rafraîchir les données toutes les 5 minutes
    setInterval(fetchMarketData, 5 * 60 * 1000);
});