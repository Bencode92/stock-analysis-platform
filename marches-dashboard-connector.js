/**
 * Script pour connecter les données des marchés au dashboard
 * Ce fichier doit être inclus dans marches.html et dashboard.html
 */

// Namespace pour le partage de données
const TradePulse = window.TradePulse || {};

// Fonction pour stocker les données des marchés dans localStorage
TradePulse.storeMarketData = function(marketData) {
    localStorage.setItem('tradepulse_market_data', JSON.stringify({
        timestamp: new Date().toISOString(),
        trends: marketData.trends || {},
        topPerformers: marketData.topPerformers || {},
        regions: marketData.regions || {},
        majorIndices: marketData.majorIndices || {}
    }));
};

// Fonction pour récupérer les données des marchés du localStorage
TradePulse.getMarketData = function() {
    const data = localStorage.getItem('tradepulse_market_data');
    return data ? JSON.parse(data) : null;
};

// Fonction pour exporter les données de marches.html
TradePulse.exportMarketData = function() {
    // Initialiser l'objet de données
    const marketData = {
        timestamp: new Date().toISOString(),
        trends: {},
        topPerformers: {
            daily: {
                best: [],
                worst: []
            }
        },
        regions: {
            europe: [],
            northAmerica: [],
            asia: [],
            latinAmerica: [],
            other: []
        },
        majorIndices: {}
    };

    // Récupérer les tendances par région
    const regions = ['europe', 'north-america', 'asia', 'latin-america', 'other'];
    regions.forEach(region => {
        const trendElement = document.getElementById(`${region}-trend`);
        if (trendElement) {
            // Déterminer la tendance à partir de la classe
            let trend = 'neutral';
            if (trendElement.classList.contains('positive')) {
                trend = 'positive';
            } else if (trendElement.classList.contains('negative')) {
                trend = 'negative';
            }
            
            // Normaliser le nom de la région pour l'objet
            const normalizedRegion = region.replace('-', '');
            marketData.trends[normalizedRegion] = trend;
        }
    });

    // Récupérer les top performers
    ['daily-top', 'daily-bottom'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            const items = container.querySelectorAll('.performer-item');
            const targetArray = containerId === 'daily-top' 
                ? marketData.topPerformers.daily.best 
                : marketData.topPerformers.daily.worst;
            
            items.forEach(item => {
                const nameElement = item.querySelector('.performer-name');
                const countryElement = item.querySelector('.performer-country');
                const valueElement = item.querySelector('.performer-value');
                
                if (nameElement && valueElement) {
                    targetArray.push({
                        index_name: nameElement.textContent,
                        country: countryElement ? countryElement.textContent : '',
                        changePercent: valueElement.textContent,
                        trend: valueElement.classList.contains('positive') ? 'positive' : 'negative'
                    });
                }
            });
        }
    });

    // Récupérer les valeurs des principaux indices boursiers
    // Structure pour associer les indices aux sélecteurs d'éléments dans la page
    const majorIndicesMapping = [
        {
            name: "S&P 500 INDEX",
            selectors: {
                row: '#sp500-row', 
                value: '.market-value',
                change: '.market-value',
                ytd: '.market-ytd'
            }
        },
        {
            name: "NASDAQ Composite",
            selectors: {
                row: '#nasdaq-row',
                value: '.market-value',
                change: '.market-value',
                ytd: '.market-ytd'
            }
        },
        {
            name: "CAC 40",
            selectors: {
                row: '#cac40-row',
                value: '.market-value',
                change: '.market-value',
                ytd: '.market-ytd'
            }
        },
        {
            name: "DOW JONES INDUSTRIAL",
            selectors: {
                row: '#dow-row',
                value: '.market-value',
                change: '.market-value',
                ytd: '.market-ytd'
            }
        }
    ];

    // Alternative: extraire directement des cellules du tableau
    const extractIndicesFromTable = () => {
        // Chercher dans toutes les tables contenant des données d'indices
        const tables = document.querySelectorAll('.market-overview-grid, .data-table');
        
        tables.forEach(table => {
            // Parcourir chaque ligne du tableau
            const rows = table.querySelectorAll('tr, .market-index-col');
            
            rows.forEach(row => {
                const nameElement = row.querySelector('.market-index-name');
                if (!nameElement) return;
                
                const name = nameElement.textContent.trim();
                
                // Extraire les valeurs si disponibles
                const valueElement = row.querySelector('.market-value, td:nth-child(3)');
                const changeElement = row.querySelector('.market-value:first-of-type, .negative, .positive, td:nth-child(4)');
                const ytdElement = row.querySelector('.market-ytd, td:nth-child(5)');
                
                if (name && (valueElement || changeElement)) {
                    marketData.majorIndices[name] = {
                        value: valueElement ? valueElement.textContent.trim() : '',
                        changePercent: changeElement ? changeElement.textContent.trim() : '',
                        ytdChange: ytdElement ? ytdElement.textContent.trim() : '',
                        trend: changeElement && !changeElement.classList.contains('negative') ? 'positive' : 'negative'
                    };
                }
            });
        });
        
        // Si on n'a aucun indice, essayer une autre approche
        if (Object.keys(marketData.majorIndices).length === 0) {
            // Capturer spécifiquement les indices clés qui sont sur la page dashboard
            const keyIndices = [
                {name: "S&P 500", selector: "S&P 500 INDEX"},
                {name: "NASDAQ", selector: "NASDAQ Composite"},
                {name: "CAC 40", selector: "CAC 40"},
                {name: "DOW JONES", selector: "DOW JONES INDUSTRIAL"}
            ];
            
            keyIndices.forEach(index => {
                // Trouver tous les éléments contenant le nom de l'indice
                const elements = document.querySelectorAll(`*:not(script):not(style):contains('${index.selector}')`);
                
                elements.forEach(el => {
                    // Chercher à proximité pour trouver des valeurs numériques
                    const parent = el.closest('div, tr, td');
                    if (!parent) return;
                    
                    // Extraire des valeurs si elles ressemblent à des nombres ou pourcentages
                    const textContent = parent.textContent;
                    const valueMatch = textContent.match(/[\d\s,.]+/);
                    const percentMatch = textContent.match(/[+-]?[\d,.]+\s*%/);
                    
                    if (valueMatch || percentMatch) {
                        marketData.majorIndices[index.name] = {
                            value: valueMatch ? valueMatch[0].trim() : '',
                            changePercent: percentMatch ? percentMatch[0].trim() : '',
                            trend: percentMatch && !percentMatch[0].includes('-') ? 'positive' : 'negative'
                        };
                    }
                });
            });
        }
    };
    
    // Exécuter l'extraction
    extractIndicesFromTable();

    // Recherche directe par ID des indices principaux pour le dashboard
    const dashboardIndices = [
        {name: "S&P 500", valueId: "sp500-value", changeId: "sp500-change"},
        {name: "NASDAQ", valueId: "nasdaq-value", changeId: "nasdaq-change"},
        {name: "CAC 40", valueId: "cac40-value", changeId: "cac40-change"}
    ];
    
    dashboardIndices.forEach(index => {
        // Si on trouve un élément direct avec ces IDs, on le privilégie
        const valueEl = document.getElementById(index.valueId);
        const changeEl = document.getElementById(index.changeId);
        
        if (valueEl || changeEl) {
            marketData.majorIndices[index.name] = {
                value: valueEl ? valueEl.textContent.trim() : '',
                changePercent: changeEl ? changeEl.textContent.trim() : '',
                trend: changeEl && changeEl.classList.contains('positive') ? 'positive' : 'negative'
            };
        }
    });

    // Stocker les données
    TradePulse.storeMarketData(marketData);
    
    console.log('Données des marchés exportées vers le dashboard', marketData);
    return marketData;
};

// Fonction pour mettre à jour le dashboard avec les données des marchés
TradePulse.updateDashboardMarkets = function() {
    const marketData = TradePulse.getMarketData();
    if (!marketData) return;
    
    // Mettre à jour les tendances par région (si applicable)
    if (marketData.trends) {
        for (const [region, trend] of Object.entries(marketData.trends)) {
            const trendElement = document.getElementById(`${region}-trend-indicator`);
            if (trendElement) {
                // Réinitialiser les classes
                trendElement.classList.remove('positive', 'negative', 'neutral');
                // Ajouter la classe appropriée
                trendElement.classList.add(trend);
                // Mettre à jour l'icône
                let icon = '↔';
                if (trend === 'positive') icon = '↑';
                if (trend === 'negative') icon = '↓';
                trendElement.innerHTML = icon;
            }
        }
    }
    
    // Mettre à jour les valeurs des indices majeurs
    if (marketData.majorIndices) {
        // Mapping entre les noms des indices dans les données et les IDs dans le dashboard
        const indicesMapping = {
            "S&P 500": {valueId: "dashboard-sp500-value", changeId: "dashboard-sp500-change"},
            "NASDAQ": {valueId: "dashboard-nasdaq-value", changeId: "dashboard-nasdaq-change"},
            "CAC 40": {valueId: "dashboard-cac40-value", changeId: "dashboard-cac40-change"}
        };
        
        for (const [indexName, indexData] of Object.entries(marketData.majorIndices)) {
            const mapping = indicesMapping[indexName];
            if (!mapping) continue;
            
            const valueElement = document.getElementById(mapping.valueId);
            const changeElement = document.getElementById(mapping.changeId);
            
            if (valueElement && indexData.value) {
                valueElement.textContent = indexData.value;
            }
            
            if (changeElement && indexData.changePercent) {
                changeElement.textContent = indexData.changePercent;
                // Mettre à jour la classe selon la tendance
                changeElement.classList.remove('positive', 'negative');
                changeElement.classList.add(indexData.trend || 'neutral');
            }
        }
    }
    
    console.log('Dashboard mis à jour avec les données des marchés');
};

// Exporter l'objet TradePulse
window.TradePulse = TradePulse;
