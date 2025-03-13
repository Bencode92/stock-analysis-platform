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
        regions: marketData.regions || {}
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
        }
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

    // Stocker les données
    TradePulse.storeMarketData(marketData);
    
    console.log('Données des marchés exportées vers le dashboard', marketData);
    return marketData;
};

// Exporter l'objet TradePulse
window.TradePulse = TradePulse;
