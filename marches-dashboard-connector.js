/**
 * marches-dashboard-connector.js - Version améliorée
 * Script permettant de connecter les données des marchés de marches.html à dashboard.html
 * Comprend maintenant:
 * 1. Les prix et variations du S&P 500, NASDAQ et CAC 40
 * 2. Le Top 3 des hausses et baisses journalières
 * 3. Les tendances par région (flèches vertes/rouges/grises)
 */

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si nous sommes sur la page dashboard
    if (!window.location.pathname.includes('dashboard.html') && 
        !window.location.pathname.endsWith('/')) return;
    
    console.log('Initialisation du connecteur marches-dashboard...');
    
    // Fonction principale pour récupérer et mettre à jour les données de marché
    async function updateMarketData() {
        try {
            console.log('Récupération des données de marché...');
            
            // Tenter d'abord de récupérer depuis l'API ou le fichier JSON
            let marketData;
            try {
                const response = await fetch('data/markets.json');
                if (response.ok) {
                    marketData = await response.json();
                    console.log('Données de marché chargées depuis le fichier JSON');
                } else {
                    throw new Error('Impossible de charger markets.json');
                }
            } catch (error) {
                console.warn('Utilisation des données de secours (problème avec markets.json):', error);
                marketData = getBackupMarketData();
            }
            
            // Mise à jour des indices principaux
            updateMainIndices(marketData);
            
            // Mise à jour du Top 3 des hausses et baisses
            updateTopPerformers(marketData);
            
            // Mise à jour des tendances par région
            updateRegionTrends(marketData);
            
            console.log('Mise à jour des données de marché terminée');
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour des données de marché:', error);
        }
    }
    
    // Données de secours en cas d'échec
    function getBackupMarketData() {
        return {
            indices: {
                'north-america': [
                    {
                        index_name: 'S&P 500 INDEX',
                        value: '5,187.52',
                        changePercent: '+0.49 %'
                    },
                    {
                        index_name: 'NASDAQ Composite',
                        value: '16,342.15',
                        changePercent: '+1.22 %'
                    }
                ],
                'europe': [
                    {
                        index_name: 'CAC 40',
                        value: '8,052.21',
                        changePercent: '-0.35 %'
                    }
                ]
            },
            regionTrends: {
                'europe': 'up',
                'north-america': 'up',
                'asia': 'down',
                'latin-america': 'up',
                'other': 'down'
            },
            topPerformers: {
                daily: {
                    top: [
                        { name: 'BUENOS AIRES MERVAL', country: 'Argentine', value: '+5,25 %' },
                        { name: 'NASDAQ Korea Large Mid Cap', country: 'Corée du Sud', value: '+2,63 %' },
                        { name: 'CBOE VIX INDEX', country: 'États-Unis', value: '+2,52 %' }
                    ],
                    bottom: [
                        { name: 'NASDAQ New Zealand Large Mid Cap', country: 'Nouvelle-Zélande', value: '-1,90 %' },
                        { name: 'TAIEX', country: 'Taiwan', value: '-1,42 %' },
                        { name: 'NASDAQ South Africa Large Mid Cap', country: 'Afrique du Sud', value: '-1,24 %' }
                    ]
                }
            }
        };
    }
    
    // Mettre à jour les indices principaux (S&P 500, NASDAQ, CAC 40)
    function updateMainIndices(data) {
        // S&P 500
        updateIndexData(data, 'north-america', 'S&P 500 INDEX', 'S&P 500');
        
        // NASDAQ
        updateIndexData(data, 'north-america', 'NASDAQ Composite', 'NASDAQ');
        
        // CAC 40
        updateIndexData(data, 'europe', 'CAC 40', 'CAC 40');
    }
    
    // Fonction pour mettre à jour un indice spécifique
    function updateIndexData(data, region, sourceIndexName, targetIndexName) {
        let indexData = null;
        
        // Chercher l'indice dans les données
        if (data && data.indices && data.indices[region]) {
            indexData = data.indices[region].find(
                index => index.index_name && index.index_name.includes(sourceIndexName)
            );
        }
        
        // Si des données ont été trouvées, mettre à jour le dashboard
        if (indexData) {
            console.log(`Mise à jour de ${targetIndexName}:`, indexData);
            
            // Mettre à jour l'indice avec l'approche directe
            updateIndexPrice(targetIndexName, indexData.value);
            updateIndexVariation(targetIndexName, indexData.changePercent);
        }
    }
    
    // Approche directe pour mettre à jour le prix d'un indice
    function updateIndexPrice(indexName, value) {
        const marketBlocks = document.querySelectorAll('#markets-widget .bg-\\[\\#011E34\\].bg-opacity-70.p-4.rounded-lg');
        
        for (const block of marketBlocks) {
            const titleElement = block.querySelector('.font-medium');
            if (titleElement && titleElement.textContent === indexName) {
                // Trouver l'élément de prix dans ce bloc
                const priceElement = block.querySelector('.text-2xl.font-bold');
                if (priceElement) {
                    priceElement.textContent = value;
                    return;
                }
            }
        }
        
        // Méthode alternative si la première approche échoue
        switch(indexName) {
            case 'S&P 500':
                updateBySelector('#markets-widget > div > div:nth-child(1) > div.text-2xl.font-bold.mb-3', value);
                break;
            case 'NASDAQ':
                updateBySelector('#markets-widget > div > div:nth-child(2) > div.text-2xl.font-bold.mb-3', value);
                break;
            case 'CAC 40':
                updateBySelector('#markets-widget > div > div:nth-child(3) > div.text-2xl.font-bold.mb-3', value);
                break;
        }
    }
    
    // Mettre à jour la variation d'un indice
    function updateIndexVariation(indexName, changePercent) {
        const marketBlocks = document.querySelectorAll('#markets-widget .bg-\\[\\#011E34\\].bg-opacity-70.p-4.rounded-lg');
        
        for (const block of marketBlocks) {
            const titleElement = block.querySelector('.font-medium');
            if (titleElement && titleElement.textContent === indexName) {
                // Trouver l'élément de variation
                const variationElement = block.querySelector('.text-sm.trend-up, .text-sm.trend-down');
                if (variationElement) {
                    variationElement.textContent = changePercent;
                    // Appliquer la bonne classe en fonction du signe
                    const isPositive = !changePercent.includes('-');
                    variationElement.className = isPositive 
                        ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                        : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
                    return;
                }
            }
        }
        
        // Méthode alternative si la première approche échoue
        switch(indexName) {
            case 'S&P 500':
                updateBySelector('#markets-widget > div > div:nth-child(1) > div.flex.justify-between.mb-2 > div:nth-child(2)', 
                    changePercent, !changePercent.includes('-'));
                break;
            case 'NASDAQ':
                updateBySelector('#markets-widget > div > div:nth-child(2) > div.flex.justify-between.mb-2 > div:nth-child(2)', 
                    changePercent, !changePercent.includes('-'));
                break;
            case 'CAC 40':
                updateBySelector('#markets-widget > div > div:nth-child(3) > div.flex.justify-between.mb-2 > div:nth-child(2)', 
                    changePercent, !changePercent.includes('-'));
                break;
        }
    }
    
    // Helper pour mettre à jour un élément avec un sélecteur spécifique
    function updateBySelector(selector, value, isPositive = null) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = value;
            
            // Si nous devons aussi mettre à jour la classe (pour les variations)
            if (isPositive !== null) {
                element.className = isPositive 
                    ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                    : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
            }
            
            return true;
        }
        return false;
    }
    
    // Mettre à jour le Top 3 des hausses et baisses
    function updateTopPerformers(data) {
        // Vérifier si les données Top Performers existent
        if (!data.topPerformers || !data.topPerformers.daily) {
            console.warn("Données Top Performers manquantes");
            return;
        }
        
        // Créer ou mettre à jour la section Top Performers si elle n'existe pas encore
        ensureTopPerformersSection();
        
        // Mettre à jour les Top 3 hausses
        const topGainers = data.topPerformers.daily.top;
        if (topGainers && topGainers.length > 0) {
            const topGainersContainer = document.getElementById('top-gainers-container');
            if (topGainersContainer) {
                topGainersContainer.innerHTML = '';
                
                // Ajouter chaque gagnant
                topGainers.forEach(gainer => {
                    const gainElement = document.createElement('div');
                    gainElement.className = 'p-2 border-b border-white border-opacity-10 flex justify-between';
                    gainElement.innerHTML = `
                        <div>
                            <div class="font-medium">${gainer.name}</div>
                            <div class="text-xs text-gray-400">${gainer.country}</div>
                        </div>
                        <div class="text-green-400 font-bold">${gainer.value}</div>
                    `;
                    topGainersContainer.appendChild(gainElement);
                });
            }
        }
        
        // Mettre à jour les Top 3 baisses
        const topLosers = data.topPerformers.daily.bottom;
        if (topLosers && topLosers.length > 0) {
            const topLosersContainer = document.getElementById('top-losers-container');
            if (topLosersContainer) {
                topLosersContainer.innerHTML = '';
                
                // Ajouter chaque perdant
                topLosers.forEach(loser => {
                    const lossElement = document.createElement('div');
                    lossElement.className = 'p-2 border-b border-white border-opacity-10 flex justify-between';
                    lossElement.innerHTML = `
                        <div>
                            <div class="font-medium">${loser.name}</div>
                            <div class="text-xs text-gray-400">${loser.country}</div>
                        </div>
                        <div class="text-red-400 font-bold">${loser.value}</div>
                    `;
                    topLosersContainer.appendChild(lossElement);
                });
            }
        }
    }
    
    // Mettre à jour les tendances par région
    function updateRegionTrends(data) {
        // Vérifier si les données de tendances existent
        if (!data.regionTrends) {
            console.warn("Données de tendances par région manquantes");
            return;
        }
        
        // Créer ou mettre à jour la section des tendances si elle n'existe pas encore
        ensureRegionTrendsSection();
        
        // Mettre à jour chaque région
        for (const [region, trend] of Object.entries(data.regionTrends)) {
            // Convertir le nom de région technique en nom affichable
            const displayName = getRegionDisplayName(region);
            
            // Trouver ou créer l'élément pour cette région
            const trendElement = document.getElementById(`trend-${region}`);
            if (trendElement) {
                // Mettre à jour l'icône de tendance
                const iconElement = trendElement.querySelector('i');
                if (iconElement) {
                    // Réinitialiser les classes
                    iconElement.className = '';
                    
                    // Ajouter les classes selon la tendance
                    if (trend === 'up') {
                        iconElement.className = 'fas fa-arrow-up text-green-400';
                    } else if (trend === 'down') {
                        iconElement.className = 'fas fa-arrow-down text-red-400';
                    } else {
                        iconElement.className = 'fas fa-arrows-alt-h text-gray-400';
                    }
                }
            }
        }
    }
    
    // Convertir le nom technique de région en nom affichable
    function getRegionDisplayName(region) {
        const regionNames = {
            'europe': 'Europe',
            'north-america': 'Amérique du Nord',
            'asia': 'Asie',
            'latin-america': 'Amérique Latine',
            'other': 'Autres régions'
        };
        
        return regionNames[region] || region;
    }
    
    // Créer la section Top Performers si elle n'existe pas encore
    function ensureTopPerformersSection() {
        // Vérifier si la section existe déjà
        if (document.getElementById('market-top-performers')) {
            return;
        }
        
        // Trouver le conteneur des marchés pour y ajouter la section
        const marketsWidget = document.getElementById('markets-widget');
        if (!marketsWidget) {
            console.warn("Widget des marchés non trouvé, impossible d'ajouter Top Performers");
            return;
        }
        
        // Créer la section Top Performers
        const topPerformersSection = document.createElement('div');
        topPerformersSection.id = 'market-top-performers';
        topPerformersSection.className = 'mt-4 p-4 glassmorphism';
        
        // Ajouter le titre
        const title = document.createElement('div');
        title.className = 'text-neon-green font-semibold text-lg mb-3';
        title.textContent = 'Top Performers du jour';
        topPerformersSection.appendChild(title);
        
        // Créer la structure en colonnes pour hausses et baisses
        const columnsContainer = document.createElement('div');
        columnsContainer.className = 'grid grid-cols-2 gap-3';
        
        // Colonne des hausses
        const gainsColumn = document.createElement('div');
        gainsColumn.innerHTML = `
            <div class="mb-2 flex items-center">
                <i class="fas fa-arrow-up text-green-400 mr-2"></i>
                <span class="font-medium">Top 3 Hausse</span>
            </div>
            <div id="top-gainers-container" class="bg-[#011E34] bg-opacity-70 rounded-lg"></div>
        `;
        columnsContainer.appendChild(gainsColumn);
        
        // Colonne des baisses
        const lossesColumn = document.createElement('div');
        lossesColumn.innerHTML = `
            <div class="mb-2 flex items-center">
                <i class="fas fa-arrow-down text-red-400 mr-2"></i>
                <span class="font-medium">Top 3 Baisse</span>
            </div>
            <div id="top-losers-container" class="bg-[#011E34] bg-opacity-70 rounded-lg"></div>
        `;
        columnsContainer.appendChild(lossesColumn);
        
        // Ajouter les colonnes à la section
        topPerformersSection.appendChild(columnsContainer);
        
        // Ajouter la section au conteneur des marchés
        marketsWidget.appendChild(topPerformersSection);
    }
    
    // Créer la section des tendances par région si elle n'existe pas encore
    function ensureRegionTrendsSection() {
        // Vérifier si la section existe déjà
        if (document.getElementById('market-region-trends')) {
            return;
        }
        
        // Trouver le conteneur des marchés pour y ajouter la section
        const marketsWidget = document.getElementById('markets-widget');
        if (!marketsWidget) {
            console.warn("Widget des marchés non trouvé, impossible d'ajouter les tendances régionales");
            return;
        }
        
        // Créer la section des tendances par région
        const trendsSection = document.createElement('div');
        trendsSection.id = 'market-region-trends';
        trendsSection.className = 'mt-4 p-4 glassmorphism';
        
        // Ajouter le titre
        const title = document.createElement('div');
        title.className = 'text-neon-green font-semibold text-lg mb-3';
        title.textContent = 'Tendances par région';
        trendsSection.appendChild(title);
        
        // Créer la grille pour les régions
        const regionsContainer = document.createElement('div');
        regionsContainer.className = 'grid grid-cols-3 gap-3';
        
        // Ajouter chaque région
        const regions = ['europe', 'north-america', 'asia', 'latin-america', 'other'];
        regions.forEach(region => {
            const regionCard = document.createElement('div');
            regionCard.id = `trend-${region}`;
            regionCard.className = 'bg-[#011E34] bg-opacity-70 rounded-lg p-3 flex justify-between items-center';
            regionCard.innerHTML = `
                <span class="font-medium">${getRegionDisplayName(region)}</span>
                <i class="fas fa-arrows-alt-h text-gray-400"></i>
            `;
            regionsContainer.appendChild(regionCard);
        });
        
        // Ajouter la grille à la section
        trendsSection.appendChild(regionsContainer);
        
        // Ajouter la section au conteneur des marchés
        marketsWidget.appendChild(trendsSection);
    }
    
    // Extrait les tendances par région de la page marches.html
    function extractRegionTrends(data) {
        // Pour une mise en œuvre plus poussée, on pourrait inspecter 
        // les flèches dans la page marches.html ou utiliser une logique personnalisée
        // pour déterminer la tendance de chaque région
        
        // Pour le moment, nous utilisons une logique simplifiée basée sur les variations
        const trends = {};
        
        // Logique pour chaque région
        Object.keys(data.indices).forEach(region => {
            const indices = data.indices[region];
            if (!indices || indices.length === 0) return;
            
            // Compter les indices positifs et négatifs
            let positiveCount = 0;
            let negativeCount = 0;
            
            indices.forEach(index => {
                if (index.changePercent && index.changePercent.includes('-')) {
                    negativeCount++;
                } else if (index.changePercent) {
                    positiveCount++;
                }
            });
            
            // Déterminer la tendance en fonction de la majorité
            if (positiveCount > negativeCount) {
                trends[region] = 'up';
            } else if (negativeCount > positiveCount) {
                trends[region] = 'down';
            } else {
                trends[region] = 'neutral';
            }
        });
        
        return trends;
    }
    
    // Extraire le Top 3 des hausses et baisses journalières
    function extractTopPerformers(data) {
        // Rassembler tous les indices avec leurs variations
        const allIndices = [];
        
        Object.keys(data.indices).forEach(region => {
            const indices = data.indices[region] || [];
            indices.forEach(index => {
                if (index.index_name && index.changePercent) {
                    // Convertir la variation en nombre pour le tri
                    const percentValue = parseFloat(index.changePercent.replace(',', '.').replace(/[^-\d.]/g, ''));
                    
                    allIndices.push({
                        name: index.index_name,
                        value: index.changePercent,
                        percentValue: percentValue,
                        // Utiliser country s'il existe, sinon utiliser la région
                        country: index.country || getRegionDisplayName(region)
                    });
                }
            });
        });
        
        // Trier pour obtenir les tops et les flops
        allIndices.sort((a, b) => b.percentValue - a.percentValue);
        
        // Prendre les 3 premiers (hausses) et les 3 derniers (baisses)
        const top = allIndices.slice(0, 3);
        const bottom = allIndices.slice(-3).reverse();
        
        return {
            daily: {
                top: top,
                bottom: bottom
            }
        };
    }
    
    // Exécuter immédiatement la mise à jour
    updateMarketData();
    
    // Rafraîchir périodiquement (toutes les 5 minutes)
    setInterval(updateMarketData, 5 * 60 * 1000);
});