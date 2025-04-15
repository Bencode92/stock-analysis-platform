/**
 * Script pour l'indexation et la recherche des villes par zone PTZ
 */

/**
 * Crée un index optimisé pour la recherche de villes par préfixe
 * @param {Object} citiesDB - Base de données des villes
 * @return {Object} Index optimisé
 */
function createCityIndex(citiesDB) {
    const index = {};
    
    // Parcourir toutes les zones
    for (const [zone, cities] of Object.entries(citiesDB)) {
        // Ajouter chaque ville à l'index
        cities.forEach(city => {
            // Normaliser le nom (retirer les accents, mettre en minuscules)
            const normalizedCity = city
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            
            // Indexer par préfixe (3 premières lettres)
            const prefix = normalizedCity.substring(0, 3);
            
            if (!index[prefix]) {
                index[prefix] = [];
            }
            
            // Stocker la ville et sa zone
            index[prefix].push({
                city: city,
                zone: zone,
                normalized: normalizedCity
            });
        });
    }
    
    return index;
}

/**
 * Recherche une ville dans l'index
 * @param {string} query - Requête de recherche
 * @param {Object} cityIndex - Index des villes
 * @return {Array} Résultats de recherche
 */
function searchCity(query, cityIndex) {
    // Normaliser la requête
    const normalizedQuery = query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    
    if (normalizedQuery.length < 2) return [];
    
    // Obtenir le préfixe pour l'index
    const prefix = normalizedQuery.substring(0, Math.min(3, normalizedQuery.length));
    const results = [];
    
    // Si le préfixe existe dans l'index
    if (cityIndex[prefix]) {
        // Filtrer les résultats qui correspondent à la requête
        cityIndex[prefix].forEach(item => {
            if (item.normalized.includes(normalizedQuery)) {
                // Vérifier si la ville commence par la requête (priorité plus élevée)
                const exactMatch = item.normalized === normalizedQuery;
                const startsWithMatch = item.normalized.startsWith(normalizedQuery);
                
                results.push({
                    city: item.city,
                    zone: item.zone,
                    exactMatch: exactMatch,
                    startsWithMatch: startsWithMatch
                });
            }
        });
    }
    
    // Trier les résultats : exactMatch > startsWithMatch > autres
    results.sort((a, b) => {
        if (a.exactMatch && !b.exactMatch) return -1;
        if (!a.exactMatch && b.exactMatch) return 1;
        if (a.startsWithMatch && !b.startsWithMatch) return -1;
        if (!a.startsWithMatch && b.startsWithMatch) return 1;
        return a.city.localeCompare(b.city);
    });
    
    // Limiter le nombre de résultats
    return results.slice(0, 10);
}

export { createCityIndex, searchCity };