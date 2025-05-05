// comparatif-status.js - Script pour afficher le tableau comparatif des statuts juridiques

/**
 * Initialisation du comparatif des statuts juridiques
 */
function initComparatifStatuts() {
    console.log('Initialisation du comparatif des statuts');
    
    // Récupérer le conteneur
    const container = document.getElementById('comparatif-container');
    if (!container) {
        console.error('Conteneur du comparatif non trouvé');
        return;
    }
    
    // Afficher un indicateur de chargement
    container.innerHTML = `
        <div class="text-center p-4">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mb-2"></div>
            <p>Chargement du comparatif...</p>
        </div>
    `;
    
    // Vérifier si les données des statuts juridiques sont disponibles
    if (!window.legalStatuses) {
        console.error('Données des statuts juridiques non disponibles');
        container.innerHTML = `
            <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg">
                <p class="text-center">Erreur: Impossible de charger les données des statuts juridiques.</p>
            </div>
        `;
        return;
    }
    
    // Obtenir les filtres
    const filterCriteria = document.getElementById('filter-criteria');
    const compareSpecific = document.getElementById('compare-specific');
    
    // Ajouter les écouteurs d'événements aux filtres
    if (filterCriteria) {
        filterCriteria.addEventListener('change', updateComparatifTable);
    }
    
    if (compareSpecific) {
        compareSpecific.addEventListener('change', updateComparatifTable);
    }
    
    // Générer et afficher le tableau
    updateComparatifTable();
}

/**
 * Mettre à jour le tableau comparatif en fonction des filtres
 */
function updateComparatifTable() {
    const container = document.getElementById('comparatif-container');
    if (!container) return;
    
    // Récupérer les valeurs des filtres
    const filterCriteria = document.getElementById('filter-criteria')?.value || 'all';
    const compareSpecific = document.getElementById('compare-specific')?.value || 'all';
    
    // Filtrer les statuts à afficher
    let statusesToShow = Object.keys(window.legalStatuses);
    
    if (compareSpecific !== 'all') {
        statusesToShow = compareSpecific.split(',');
    }
    
    // Construire le tableau HTML
    const tableHTML = buildComparativeTable(statusesToShow, filterCriteria);
    
    // Afficher le tableau
    container.innerHTML = tableHTML;
    
    // Initialiser les tooltips si nécessaire
    initTooltips();
}

/**
 * Construire le tableau HTML comparatif
 * @param {Array} statusIds - IDs des statuts à afficher
 * @param {string} filterCriteria - Critère de filtrage
 * @returns {string} HTML du tableau
 */
function buildComparativeTable(statusIds, filterCriteria) {
    // Définir les critères à afficher selon le filtre
    const allCriteria = {
        structure: [
            { id: 'categorie', label: 'Catégorie', info: 'Type de structure (commerciale, civile, libérale)' },
            { id: 'associes', label: 'Associés', info: 'Nombre minimum/maximum d\'associés requis' },
            { id: 'capital', label: 'Capital social', info: 'Montant minimum requis et règles de libération' },
            { id: 'responsabilite', label: 'Responsabilité', info: 'Étendue de la responsabilité des associés' }
        ],
        fiscal: [
            { id: 'fiscalite', label: 'Régime fiscal', info: 'Imposition par défaut (IR ou IS)' },
            { id: 'fiscaliteOption', label: 'Option fiscale', info: 'Possibilité de choisir un autre régime' },
            { id: 'fiscal', label: 'Dividendes', info: 'Régime fiscal des dividendes' },
            { id: 'regimeTVA', label: 'TVA', info: 'Régime de TVA applicable' }
        ],
        social: [
            { id: 'regimeSocial', label: 'Régime social', info: 'Statut social du dirigeant' },
            { id: 'protectionPatrimoine', label: 'Protection patrimoine', info: 'Protection du patrimoine personnel' },
            { id: 'chargesSociales', label: 'Charges sociales', info: 'Base de calcul et taux des charges sociales' }
        ],
        creation: [
            { id: 'formalites', label: 'Formalités', info: 'Complexité des démarches de création' },
            { id: 'activite', label: 'Activités', info: 'Types d\'activités adaptées à cette forme juridique' },
            { id: 'profilOptimal', label: 'Profil optimal', info: 'Profil d\'entrepreneur adapté à cette forme' }
        ],
        gestion: [
            { id: 'publicationComptes', label: 'Publication comptes', info: 'Obligation de publier les comptes annuels' },
            { id: 'leveeFonds', label: 'Levée de fonds', info: 'Facilité pour lever des fonds' },
            { id: 'entreeAssocies', label: 'Entrée associés', info: 'Facilité pour faire entrer de nouveaux associés' },
            { id: 'transmission', label: 'Transmission', info: 'Facilité de transmission de l\'entreprise' }
        ]
    };
    
    // Sélectionner les critères à afficher
    let criteriasToShow = [];
    if (filterCriteria === 'all') {
        Object.values(allCriteria).forEach(criteriaGroup => {
            criteriasToShow = [...criteriasToShow, ...criteriaGroup];
        });
    } else {
        criteriasToShow = allCriteria[filterCriteria] || [];
    }
    
    // Construire l'en-tête du tableau
    let tableHTML = `
        <div class="overflow-x-auto">
            <table class="w-full border-collapse">
                <thead>
                    <tr class="bg-blue-900 bg-opacity-50">
                        <th class="p-3 text-left border-b border-gray-700">Critère</th>
    `;
    
    // Ajouter les colonnes pour chaque statut
    statusIds.forEach(statusId => {
        const status = window.legalStatuses[statusId];
        if (status) {
            tableHTML += `
                <th class="p-3 text-center border-b border-gray-700">
                    <div class="flex flex-col items-center">
                        <span class="text-green-400 mb-1"><i class="fas ${status.logo || 'fa-building'}"></i></span>
                        <span>${status.shortName}</span>
                    </div>
                </th>
            `;
        }
    });
    
    tableHTML += `
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Ajouter les lignes pour chaque critère
    criteriasToShow.forEach((criteria, index) => {
        const isEven = index % 2 === 0;
        tableHTML += `
            <tr class="${isEven ? 'bg-blue-900 bg-opacity-20' : 'bg-blue-900 bg-opacity-10'}">
                <td class="p-3 border-b border-gray-800">
                    <div class="flex items-center">
                        <span>${criteria.label}</span>
                        <span class="tooltip ml-1 text-gray-400 text-xs cursor-help" data-tooltip="${criteria.info}">
                            <i class="fas fa-info-circle"></i>
                        </span>
                    </div>
                </td>
        `;
        
        // Ajouter les données pour chaque statut
        statusIds.forEach(statusId => {
            const status = window.legalStatuses[statusId];
            if (status) {
                const value = status[criteria.id] || '-';
                tableHTML += `
                    <td class="p-3 text-center border-b border-gray-800">${value}</td>
                `;
            }
        });
        
        tableHTML += `
            </tr>
        `;
    });
    
    tableHTML += `
                </tbody>
            </table>
        </div>
        <div class="text-right mt-4 text-sm text-gray-400">
            <p>Informations à jour pour l'année 2025</p>
        </div>
    `;
    
    return tableHTML;
}

/**
 * Initialiser les tooltips
 */
function initTooltips() {
    // Si vous avez besoin d'une bibliothèque de tooltips, vous pouvez l'initialiser ici
    // Par exemple avec Tippy.js ou autre
    // Pour l'instant, nous utilisons un système simple basé sur le survol
    
    const tooltips = document.querySelectorAll('.tooltip');
    tooltips.forEach(tooltip => {
        tooltip.addEventListener('mouseenter', function() {
            const text = this.getAttribute('data-tooltip');
            
            // Créer le tooltip
            const tooltipElement = document.createElement('div');
            tooltipElement.className = 'absolute z-50 bg-gray-900 text-white p-2 rounded text-xs max-w-xs';
            tooltipElement.textContent = text;
            tooltipElement.style.bottom = '100%';
            tooltipElement.style.left = '0';
            tooltipElement.style.marginBottom = '5px';
            
            // Ajouter le tooltip
            this.style.position = 'relative';
            this.appendChild(tooltipElement);
        });
        
        tooltip.addEventListener('mouseleave', function() {
            // Supprimer le tooltip
            const tooltipElement = this.querySelector('div');
            if (tooltipElement) {
                tooltipElement.remove();
            }
        });
    });
}

// Écouter les changements d'onglet pour initialiser le comparatif quand nécessaire
document.addEventListener('DOMContentLoaded', function() {
    // Sélectionner les onglets
    const tabItems = document.querySelectorAll('.tab-item');
    
    // Ajouter un écouteur d'événement à chaque onglet
    tabItems.forEach((tab) => {
        tab.addEventListener('click', function() {
            if (this.textContent.trim() === 'Comparatif des statuts') {
                // Initialiser le comparatif lorsque l'onglet correspondant est cliqué
                setTimeout(() => {
                    initComparatifStatuts();
                }, 100);
            }
        });
    });
});