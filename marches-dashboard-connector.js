/**
 * marches-dashboard-connector.js - Version simplifiée
 * Script permettant de connecter les données des marchés de marches.html à dashboard.html
 * Se concentre uniquement sur les prix et variations journalières du S&P 500, NASDAQ et CAC 40
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
            
            // Chercher et mettre à jour S&P 500
            updateSP500(marketData);
            
            // Chercher et mettre à jour NASDAQ
            updateNASDAQ(marketData);
            
            // Chercher et mettre à jour CAC 40
            updateCAC40(marketData);
            
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
            }
        };
    }
    
    // Mettre à jour S&P 500
    function updateSP500(data) {
        let sp500Data = null;
        
        // Chercher dans les données north-america
        if (data && data.indices && data.indices['north-america']) {
            sp500Data = data.indices['north-america'].find(
                index => index.index_name && index.index_name.includes('S&P 500')
            );
        }
        
        // Si des données ont été trouvées, mettre à jour le dashboard
        if (sp500Data) {
            console.log('Mise à jour du S&P 500:', sp500Data);
            
            // Mettre à jour le prix
            const priceElements = document.querySelectorAll('#markets-widget .font-medium:nth-child(1) + .text-2xl');
            if (priceElements && priceElements.length > 0) {
                priceElements[0].textContent = sp500Data.value;
            } else {
                // Essayer une autre approche si le sélecteur ne fonctionne pas
                updateIndexByName('S&P 500', sp500Data);
            }
            
            // Mettre à jour la variation
            updateVariation('S&P 500', sp500Data.changePercent);
        }
    }
    
    // Mettre à jour NASDAQ
    function updateNASDAQ(data) {
        let nasdaqData = null;
        
        // Chercher dans les données north-america
        if (data && data.indices && data.indices['north-america']) {
            nasdaqData = data.indices['north-america'].find(
                index => index.index_name && index.index_name.includes('NASDAQ Composite')
            );
        }
        
        // Si des données ont été trouvées, mettre à jour le dashboard
        if (nasdaqData) {
            console.log('Mise à jour du NASDAQ:', nasdaqData);
            
            // Mettre à jour le prix
            const priceElements = document.querySelectorAll('#markets-widget .font-medium:nth-child(2) + .text-2xl');
            if (priceElements && priceElements.length > 0) {
                priceElements[0].textContent = nasdaqData.value;
            } else {
                // Essayer une autre approche si le sélecteur ne fonctionne pas
                updateIndexByName('NASDAQ', nasdaqData);
            }
            
            // Mettre à jour la variation
            updateVariation('NASDAQ', nasdaqData.changePercent);
        }
    }
    
    // Mettre à jour CAC 40
    function updateCAC40(data) {
        let cacData = null;
        
        // Chercher dans les données europe
        if (data && data.indices && data.indices.europe) {
            cacData = data.indices.europe.find(
                index => index.index_name && index.index_name.includes('CAC 40')
            );
        }
        
        // Si des données ont été trouvées, mettre à jour le dashboard
        if (cacData) {
            console.log('Mise à jour du CAC 40:', cacData);
            
            // Mettre à jour le prix
            const priceElements = document.querySelectorAll('#markets-widget .font-medium:nth-child(3) + .text-2xl');
            if (priceElements && priceElements.length > 0) {
                priceElements[0].textContent = cacData.value;
            } else {
                // Essayer une autre approche si le sélecteur ne fonctionne pas
                updateIndexByName('CAC 40', cacData);
            }
            
            // Mettre à jour la variation
            updateVariation('CAC 40', cacData.changePercent);
        }
    }
    
    // Approche alternative pour mettre à jour les indices par nom
    function updateIndexByName(indexName, indexData) {
        // Chercher l'élément contenant le nom de l'indice
        const marketBlocks = document.querySelectorAll('#markets-widget .bg-\\[\\#011E34\\].bg-opacity-70.p-4.rounded-lg');
        
        for (const block of marketBlocks) {
            const titleElement = block.querySelector('.font-medium');
            if (titleElement && titleElement.textContent === indexName) {
                // Trouver l'élément de prix dans ce bloc
                const priceElement = block.querySelector('.text-2xl.font-bold');
                if (priceElement) {
                    priceElement.textContent = indexData.value;
                }
                
                // On a trouvé et mis à jour, on peut sortir
                return;
            }
        }
        
        // Si on arrive ici, on n'a pas trouvé l'élément - essayons une dernière approche
        console.log(`Recherche directe de l'élément pour ${indexName}`);
        
        const allPriceElements = document.querySelectorAll('#markets-widget .text-2xl.font-bold');
        const allLabelElements = document.querySelectorAll('#markets-widget .font-medium');
        
        // Essayer de trouver l'indice par son nom et mettre à jour le prix correspondant
        for (let i = 0; i < allLabelElements.length; i++) {
            if (allLabelElements[i].textContent === indexName && i < allPriceElements.length) {
                allPriceElements[i].textContent = indexData.value;
                return;
            }
        }
    }
    
    // Mettre à jour la variation en pourcentage
    function updateVariation(indexName, changePercent) {
        const marketBlocks = document.querySelectorAll('#markets-widget .bg-\\[\\#011E34\\].bg-opacity-70.p-4.rounded-lg');
        
        for (const block of marketBlocks) {
            const titleElement = block.querySelector('.font-medium');
            if (titleElement && titleElement.textContent === indexName) {
                // Trouver l'élément de variation dans ce bloc
                const variationElement = block.querySelector('.text-sm');
                if (variationElement) {
                    // Déterminer si la variation est positive ou négative
                    const isPositive = !changePercent.includes('-');
                    
                    // Mettre à jour la valeur et la classe CSS
                    variationElement.textContent = changePercent;
                    variationElement.className = isPositive 
                        ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                        : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
                }
                
                // On a trouvé et mis à jour, on peut sortir
                return;
            }
        }
        
        // Approche alternative si la première méthode échoue
        const variationElements = document.querySelectorAll('#markets-widget .text-sm');
        const labelElements = document.querySelectorAll('#markets-widget .font-medium');
        
        for (let i = 0; i < labelElements.length; i++) {
            if (labelElements[i].textContent === indexName) {
                // Chercher l'élément de variation associé
                for (let j = 0; j < variationElements.length; j++) {
                    // On vérifie si cet élément est proche de notre label
                    if (isNear(labelElements[i], variationElements[j])) {
                        const isPositive = !changePercent.includes('-');
                        variationElements[j].textContent = changePercent;
                        variationElements[j].className = isPositive 
                            ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                            : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
                        return;
                    }
                }
            }
        }
    }
    
    // Utilitaire pour vérifier si deux éléments sont proches dans le DOM
    function isNear(elem1, elem2) {
        // On regarde si les deux éléments partagent le même parent
        return elem1.parentNode === elem2.parentNode || 
               elem1.parentNode === elem2.parentNode.parentNode ||
               elem1.parentNode.parentNode === elem2.parentNode;
    }
    
    // Approche directe pour mettre à jour tous les indices
    function directUpdateAllIndices(marketData) {
        // Essayer d'extraire les données pour les 3 indices principaux
        let sp500, nasdaq, cac40;
        
        if (marketData && marketData.indices) {
            // Rechercher S&P 500 et NASDAQ dans North America
            if (marketData.indices['north-america']) {
                sp500 = marketData.indices['north-america'].find(i => 
                    i.index_name && i.index_name.includes('S&P 500'));
                nasdaq = marketData.indices['north-america'].find(i => 
                    i.index_name && i.index_name.includes('NASDAQ'));
            }
            
            // Rechercher CAC 40 dans Europe
            if (marketData.indices.europe) {
                cac40 = marketData.indices.europe.find(i => 
                    i.index_name && i.index_name.includes('CAC 40'));
            }
        }
        
        console.log("Données récupérées:", {sp500, nasdaq, cac40});
        
        // Cibler directement les valeurs dans le DOM et les mettre à jour
        
        // 1. S&P 500
        if (sp500) {
            // Prix
            const sp500PriceElement = document.querySelector('#markets-widget > div > div:nth-child(1) > div:nth-child(3)');
            if (sp500PriceElement) sp500PriceElement.textContent = sp500.value;
            
            // Variation
            const sp500VarElement = document.querySelector('#markets-widget > div > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)');
            if (sp500VarElement) {
                sp500VarElement.textContent = sp500.changePercent;
                const isPositive = !sp500.changePercent.includes('-');
                sp500VarElement.className = isPositive 
                    ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                    : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
            }
        }
        
        // 2. NASDAQ
        if (nasdaq) {
            // Prix
            const nasdaqPriceElement = document.querySelector('#markets-widget > div > div:nth-child(2) > div:nth-child(3)');
            if (nasdaqPriceElement) nasdaqPriceElement.textContent = nasdaq.value;
            
            // Variation
            const nasdaqVarElement = document.querySelector('#markets-widget > div > div:nth-child(2) > div:nth-child(1) > div:nth-child(2)');
            if (nasdaqVarElement) {
                nasdaqVarElement.textContent = nasdaq.changePercent;
                const isPositive = !nasdaq.changePercent.includes('-');
                nasdaqVarElement.className = isPositive 
                    ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                    : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
            }
        }
        
        // 3. CAC 40
        if (cac40) {
            // Prix
            const cac40PriceElement = document.querySelector('#markets-widget > div > div:nth-child(3) > div:nth-child(3)');
            if (cac40PriceElement) cac40PriceElement.textContent = cac40.value;
            
            // Variation
            const cac40VarElement = document.querySelector('#markets-widget > div > div:nth-child(3) > div:nth-child(1) > div:nth-child(2)');
            if (cac40VarElement) {
                cac40VarElement.textContent = cac40.changePercent;
                const isPositive = !cac40.changePercent.includes('-');
                cac40VarElement.className = isPositive 
                    ? 'text-sm trend-up px-2 py-0.5 rounded bg-green-900 bg-opacity-20'
                    : 'text-sm trend-down px-2 py-0.5 rounded bg-red-900 bg-opacity-20';
            }
        }
    }
    
    // Exécuter immédiatement la mise à jour
    updateMarketData();
    
    // Après 1 seconde, essayer une dernière fois avec l'approche directe
    setTimeout(() => {
        console.log("Tentative finale avec l'approche directe...");
        try {
            fetch('data/markets.json')
                .then(response => response.json())
                .then(data => directUpdateAllIndices(data))
                .catch(err => console.error("Erreur de l'approche directe:", err));
        } catch (e) {
            console.error("Impossible d'exécuter l'approche directe:", e);
        }
    }, 1000);
    
    // Rafraîchir périodiquement (toutes les 5 minutes)
    setInterval(updateMarketData, 5 * 60 * 1000);
});