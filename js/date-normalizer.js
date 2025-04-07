/**
 * date-normalizer.js
 * Utilitaire de normalisation des dates pour le filtrage d'événements
 */

// Fonction de normalisation des dates
window.DateNormalizer = {
    /**
     * Normalise une chaîne de date au format DD/MM/YYYY
     * Gère les espaces, les formats courts, etc.
     * @param {string} dateStr - Chaîne de date à normaliser
     * @returns {string} - Date normalisée au format DD/MM/YYYY
     */
    normalize: function(dateStr) {
        if (!dateStr) return '';
        
        // Supprimer les espaces et autres caractères indésirables
        dateStr = dateStr.trim().replace(/\s+/g, '');
        
        // Vérifier si la date est au format DD/MM/YYYY
        const dateParts = dateStr.split('/');
        if (dateParts.length !== 3) return dateStr; // Format non reconnu
        
        // Normaliser chaque partie (jour/mois/année)
        const day = dateParts[0].padStart(2, '0');
        const month = dateParts[1].padStart(2, '0');
        const year = dateParts[2].length === 2 ? '20' + dateParts[2] : dateParts[2];
        
        // Retourner la date normalisée
        return `${day}/${month}/${year}`;
    },
    
    /**
     * Obtient la date du jour au format normalisé DD/MM/YYYY
     * @returns {string} - Date du jour normalisée
     */
    getTodayFormatted: function() {
        const today = new Date();
        return [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear()
        ].join('/');
    },
    
    /**
     * Compare deux dates au format chaîne DD/MM/YYYY après normalisation
     * @param {string} date1 - Première date à comparer
     * @param {string} date2 - Seconde date à comparer
     * @returns {boolean} - True si les dates sont égales après normalisation
     */
    areEqual: function(date1, date2) {
        const normalizedDate1 = this.normalize(date1);
        const normalizedDate2 = this.normalize(date2);
        
        // Logger pour le débogage
        console.log(`[DATE MATCH] ${normalizedDate1} == ${normalizedDate2} ➜ ${normalizedDate1 === normalizedDate2}`);
        
        return normalizedDate1 === normalizedDate2;
    },
    
    /**
     * Vérifie si une date est dans la semaine en cours
     * @param {string} dateStr - Date à vérifier au format DD/MM/YYYY
     * @returns {boolean} - True si la date est dans la semaine en cours
     */
    isCurrentWeek: function(dateStr) {
        const normalizedDate = this.normalize(dateStr);
        if (!normalizedDate) return false;
        
        // Convertir en objet Date
        const dateParts = normalizedDate.split('/');
        const dateObj = new Date(dateParts[2], parseInt(dateParts[1]) - 1, dateParts[0]);
        
        // Obtenir la date de début de la semaine courante
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Dimanche comme début de semaine
        startOfWeek.setHours(0, 0, 0, 0);
        
        // Obtenir la date de fin de la semaine courante
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Samedi comme fin de semaine
        endOfWeek.setHours(23, 59, 59, 999);
        
        // Vérifier si la date est dans l'intervalle
        return dateObj >= startOfWeek && dateObj <= endOfWeek;
    }
};

// Exécuter un test rapide au chargement
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Chargement de date-normalizer.js');
    
    // Test rapide de normalisation
    console.log('Test de normalisation:');
    const testDates = [
        '1/4/2025',
        '01/4/2025',
        '1/04/2025',
        ' 01 / 04 / 2025 ',
        '01/04/25'
    ];
    
    testDates.forEach(date => {
        console.log(`${date} -> ${window.DateNormalizer.normalize(date)}`);
    });
    
    console.log('Date du jour:', window.DateNormalizer.getTodayFormatted());
});
