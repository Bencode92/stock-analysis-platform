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
                cleanStr = cleanStr.replace(/[\\(\\)]/g, '');
                cleanStr = '-' + cleanStr;
            }
            
            // Parser en nombre
            const value = parseFloat(cleanStr);
            return isNaN(value) ? 0 : value;
        };
        
        // Filtrer et trier les stocks additionnels
        const additionalStocks = allStocks
            .filter(s => !existingNames.has(s.name) && s[field] && s[field] !== '-')
            .map(s => ({...s, sortValue: parsePercentage(s[field])}));
        
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

// Exporter les fonctions pour qu'elles soient disponibles dans le script principal
window.dedupFix = {
    dedupStocksStrict,
    ensureTopTen
};

console.log('Script de déduplication chargé avec succès');
