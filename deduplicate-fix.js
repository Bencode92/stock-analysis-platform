/**
 * Script de déduplication pour les listes d'actions
 * Ce fichier corrige les problèmes de doublons dans les top 10 performers
 */

/**
 * Déduplication améliorée des actions basée uniquement sur le nom
 * Cette fonction est plus stricte que celle du fichier principal
 * @param {Array} stocks Liste d'actions à dédupliquer
 * @returns {Array} Liste dédupliquée
 */
function dedupStocksStrict(stocks) {
    if (!stocks || !Array.isArray(stocks)) return [];
    
    // Utiliser un Map pour garder uniquement la première occurrence de chaque nom
    const uniqueStocks = new Map();
    
    stocks.forEach(stock => {
        // Utiliser uniquement le nom comme clé unique
        const key = stock.name;
        
        if (!uniqueStocks.has(key)) {
            uniqueStocks.set(key, stock);
        }
    });
    
    return Array.from(uniqueStocks.values());
}

/**
 * Filtre les variations extrêmes (>=100% ou <=-100%)
 * @param {Array} stocks Liste d'actions
 * @param {string} field Champ contenant la variation (change ou ytd)
 * @param {boolean} isGainer Si true, filtre les hausses, sinon les baisses
 * @returns {Array} Liste filtrée
 */
function filterExtremeVariations(stocks, field = 'change', isGainer = true) {
    if (!stocks || !Array.isArray(stocks)) return [];
    
    return stocks.filter(stock => {
        const value = parsePercentage(stock[field]);
        
        if (isGainer) {
            // Pour les hausses, exclure les valeurs >= 100%
            return value < 100;
        } else {
            // Pour les baisses, exclure les valeurs <= -100%
            return value > -100;
        }
    });
}

/**
 * S'assure qu'une liste contient exactement 10 éléments
 * Complète avec des éléments supplémentaires si nécessaire
 * @param {Array} stocks Liste d'actions (potentiellement incomplète)
 * @param {Array} allStocks Liste complète où puiser des actions supplémentaires
 * @param {string} field Champ à utiliser pour le tri (ex: 'change', 'ytd')
 * @param {boolean} isGainer True pour les hausses, false pour les baisses
 * @returns {Array} Liste complétée à 10 éléments
 */
function ensureTopTen(stocks, allStocks, field, isGainer) {
    // Si après déduplication nous avons moins de 10 éléments
    if (stocks.length < 10) {
        // Créer un ensemble des noms déjà présents pour éviter les doublons
        const existingNames = new Set(stocks.map(s => s.name));
        
        // Fonction pour parser un pourcentage en nombre
        const parsePercentage = (percentStr) => {
            if (!percentStr || percentStr === '-') return 0;
            
            // Remplacer les virgules par des points pour les décimales
            let cleanStr = percentStr.replace(',', '.');
            
            // Supprimer les symboles +, %, etc.
            cleanStr = cleanStr.replace(/[+%]/g, '');
            
            // Gérer les nombres négatifs qui pourraient être entre parenthèses
            if (cleanStr.includes('(') && cleanStr.includes(')')) {
                cleanStr = cleanStr.replace(/[\(\)]/g, '');
                cleanStr = '-' + cleanStr;
            }
            
            // Parser en nombre
            const value = parseFloat(cleanStr);
            return isNaN(value) ? 0 : value;
        };
        
        // Filtrer et trier les stocks additionnels
        let additionalStocks = allStocks
            .filter(s => !existingNames.has(s.name) && s[field] && s[field] !== '-')
            .map(s => ({...s, sortValue: parsePercentage(s[field])}));
        
        // Filtrer les variations extrêmes
        if (isGainer) {
            additionalStocks = additionalStocks.filter(s => s.sortValue < 100);
        } else {
            additionalStocks = additionalStocks.filter(s => s.sortValue > -100);
        }
        
        // Trier selon le critère
        if (isGainer) {
            additionalStocks.sort((a, b) => b.sortValue - a.sortValue);
        } else {
            additionalStocks.sort((a, b) => a.sortValue - b.sortValue);
        }
        
        // Compléter jusqu'à 10
        const neededStocks = 10 - stocks.length;
        return [...stocks, ...additionalStocks.slice(0, neededStocks)];
    }
    
    return stocks;
}

/**
 * Parser une chaîne de pourcentage en nombre
 * @param {string} percentStr Chaîne représentant un pourcentage
 * @returns {number} Valeur numérique
 */
function parsePercentage(percentStr) {
    if (!percentStr || percentStr === '-') return 0;
    
    // Remplacer les virgules par des points pour les décimales
    let cleanStr = percentStr.replace(',', '.');
    
    // Supprimer les symboles +, %, etc.
    cleanStr = cleanStr.replace(/[+%]/g, '');
    
    // Gérer les nombres négatifs qui pourraient être entre parenthèses
    if (cleanStr.includes('(') && cleanStr.includes(')')) {
        cleanStr = cleanStr.replace(/[\(\)]/g, '');
        cleanStr = '-' + cleanStr;
    }
    
    // Parser en nombre
    const value = parseFloat(cleanStr);
    return isNaN(value) ? 0 : value;
}

/**
 * Génère un placeholder pour compléter une liste
 * @param {number} index Numéro du placeholder (pour le nom)
 * @param {string} market Le marché ('NASDAQ' ou 'STOXX')
 * @param {boolean} isUp Si true, tendance positive, sinon négative
 * @returns {Object} Objet placeholder
 */
function generatePlaceholder(index, market, isUp = true) {
    return {
        symbol: "",
        name: `Stock Placeholder ${index}`,
        last: "-",
        change: isUp ? "+0.00%" : "-0.00%",
        open: "-",
        high: "-",
        low: "-",
        ytd: isUp ? "+0.00%" : "-0.00%",
        volume: "0",
        trend: isUp ? "neutral" : "neutral",
        link: "#",
        market: market,
        marketIcon: market === 'NASDAQ' 
            ? '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            : '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
    };
}

// Exporter les fonctions pour qu'elles soient disponibles dans le script principal
window.dedupFix = {
    dedupStocksStrict,
    ensureTopTen,
    generatePlaceholder,
    filterExtremeVariations
};

console.log('Script de déduplication amélioré chargé avec succès');
