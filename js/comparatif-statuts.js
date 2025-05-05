/**
 * comparatif-statuts.js - Tableau comparatif des formes juridiques
 * À inclure dans la page "Comparatif des statuts"
 */

(function() {
    // Injecter le CSS nécessaire pour le tableau
    function injectCSS() {
        const style = document.createElement('style');
        style.textContent = `
            /* Conteneur principal */
            .comparatif-container {
                max-width: 100%;
                overflow-x: auto;
                font-family: 'Inter', sans-serif;
                color: #E6E6E6;
            }

            /* En-tête */
            .comparatif-header {
                margin-bottom: 1.5rem;
            }

            .comparatif-title {
                font-size: 1.75rem;
                font-weight: 700;
                margin-bottom: 0.75rem;
                color: #00FF87;
            }

            .comparatif-description {
                color: rgba(230, 230, 230, 0.8);
                margin-bottom: 1.5rem;
                line-height: 1.5;
            }

            /* Filtres */
            .comparatif-filters {
                display: flex;
                flex-wrap: wrap;
                gap: 1rem;
                margin-bottom: 1.5rem;
                align-items: flex-end;
            }

            .filter-group {
                flex: 1;
                min-width: 200px;
            }

            .filter-label {
                display: block;
                margin-bottom: 0.5rem;
                color: rgba(230, 230, 230, 0.7);
                font-size: 0.875rem;
            }

            .criteria-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                gap: 0.5rem;
            }

            .criteria-button {
                padding: 0.5rem 0.75rem;
                border-radius: 0.375rem;
                font-size: 0.875rem;
                cursor: pointer;
                background-color: rgba(1, 42, 74, 0.5);
                border: 1px solid rgba(0, 255, 135, 0.2);
                color: rgba(230, 230, 230, 0.8);
                transition: all 0.2s ease;
            }

            .criteria-button:hover {
                border-color: rgba(0, 255, 135, 0.4);
                background-color: rgba(1, 42, 74, 0.7);
            }

            .criteria-button.active {
                background-color: rgba(0, 255, 135, 0.15);
                border-color: rgba(0, 255, 135, 0.7);
                color: #00FF87;
            }

            .search-input {
                width: 100%;
                padding: 0.625rem 1rem;
                border-radius: 0.375rem;
                border: 1px solid rgba(1, 42, 74, 0.8);
                background-color: rgba(1, 42, 74, 0.5);
                color: #E6E6E6;
                transition: all 0.2s ease;
            }

            .search-input:focus {
                outline: none;
                border-color: rgba(0, 255, 135, 0.5);
                box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.2);
            }

            /* Tableau */
            .comparatif-table-container {
                border-radius: 0.75rem;
                border: 1px solid rgba(1, 42, 74, 0.8);
                overflow: hidden;
                background-color: rgba(1, 42, 74, 0.3);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }

            .comparatif-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
            }

            .comparatif-table th {
                padding: 1rem;
                background-color: rgba(1, 22, 39, 0.8);
                font-weight: 600;
                color: #00FF87;
                font-size: 0.875rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                border-bottom: 1px solid rgba(1, 42, 74, 0.8);
                position: sticky;
                top: 0;
                z-index: 10;
            }

            .comparatif-table td {
                padding: 0.875rem 1rem;
                border-bottom: 1px solid rgba(1, 42, 74, 0.5);
                font-size: 0.875rem;
                vertical-align: middle;
            }

            .comparatif-table tr:last-child td {
                border-bottom: none;
            }

            .comparatif-table tr:nth-child(odd) {
                background-color: rgba(1, 42, 74, 0.2);
            }

            .comparatif-table tr:hover {
                background-color: rgba(0, 255, 135, 0.05);
            }

            /* Cellules spécifiques */
            .statut-cell {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .statut-icon {
                width: 2.5rem;
                height: 2.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background-color: rgba(1, 42, 74, 0.5);
                color: #00FF87;
                font-size: 1rem;
            }

            .statut-info {
                display: flex;
                flex-direction: column;
            }

            .statut-name {
                font-weight: 600;
                color: #E6E6E6;
            }

            .statut-fullname {
                font-size: 0.75rem;
                color: rgba(230, 230, 230, 0.6);
                max-width: 180px;
            }

            /* État du chargement */
            .loading-state {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 200px;
                flex-direction: column;
                gap: 1rem;
            }

            .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(0, 255, 135, 0.3);
                border-radius: 50%;
                border-top-color: #00FF87;
                animation: spin 1s ease-in-out infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* Légende et notes */
            .comparatif-notes {
                margin-top: 1.5rem;
                padding: 1rem;
                border-radius: 0.5rem;
                background-color: rgba(1, 42, 74, 0.3);
                font-size: 0.875rem;
            }

            .notes-title {
                font-weight: 600;
                color: #00FF87;
                margin-bottom: 0.5rem;
            }

            .notes-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 0.5rem;
                margin-bottom: 0.75rem;
            }

            .notes-item {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .notes-term {
                color: #00FF87;
                font-weight: 500;
            }

            .notes-disclaimer {
                font-style: italic;
                color: rgba(230, 230, 230, 0.6);
                font-size: 0.8125rem;
                text-align: center;
                margin-top: 0.75rem;
            }

            /* Responsive */
            @media (max-width: 768px) {
                .comparatif-filters {
                    flex-direction: column;
                }
                
                .criteria-buttons {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .statut-icon {
                    width: 2rem;
                    height: 2rem;
                    font-size: 0.875rem;
                }
                
                .comparatif-table th, 
                .comparatif-table td {
                    padding: 0.75rem 0.5rem;
                    font-size: 0.75rem;
                }
                
                .notes-list {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Fonction principale pour créer le tableau comparatif
    function createComparatifTable(containerId) {
        // S'assurer que le conteneur existe
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Conteneur #${containerId} non trouvé`);
            return;
        }

        // Injecter le CSS
        injectCSS();

        // Créer la structure HTML de base
        container.innerHTML = `
            <div class="comparatif-container">
                <div class="comparatif-header">
                    <h2 class="comparatif-title">Comparatif des formes juridiques 2025</h2>
                    <p class="comparatif-description">
                        Tableau comparatif des principales caractéristiques des différentes formes juridiques en France.
                        Utilisez les filtres ci-dessous pour personnaliser l'affichage selon vos besoins.
                    </p>
                    
                    <div class="comparatif-filters">
                        <div class="filter-group">
                            <label class="filter-label">Filtrer par critères:</label>
                            <div class="criteria-buttons" id="criteria-buttons">
                                <!-- Les boutons seront générés ici -->
                            </div>
                        </div>
                        
                        <div class="filter-group" style="max-width: 300px;">
                            <label class="filter-label">Rechercher:</label>
                            <input type="text" id="search-input" class="search-input" placeholder="Rechercher un statut...">
                        </div>
                    </div>
                </div>
                
                <div class="comparatif-table-container">
                    <table class="comparatif-table" id="comparatif-table">
                        <thead>
                            <tr id="table-headers">
                                <!-- Les en-têtes seront générés ici -->
                            </tr>
                        </thead>
                        <tbody id="table-body">
                            <!-- Les données seront générées ici -->
                        </tbody>
                    </table>
                </div>
                
                <div class="comparatif-notes">
                    <h3 class="notes-title">Notes explicatives</h3>
                    <div class="notes-list">
                        <div class="notes-item">
                            <span class="notes-term">IR</span> - Impôt sur le Revenu
                        </div>
                        <div class="notes-item">
                            <span class="notes-term">IS</span> - Impôt sur les Sociétés
                        </div>
                        <div class="notes-item">
                            <span class="notes-term">TNS</span> - Travailleur Non Salarié
                        </div>
                        <div class="notes-item">
                            <span class="notes-term">CA</span> - Chiffre d'Affaires
                        </div>
                    </div>
                    <p class="notes-disclaimer">
                        Les informations présentées sont à jour pour l'année 2025. Pour plus de détails ou pour une 
                        recommandation personnalisée, utilisez notre simulateur.
                    </p>
                </div>
            </div>
        `;

        // Afficher l'état de chargement initial
        const tableBody = document.getElementById('table-body');
        tableBody.innerHTML = `
            <tr>
                <td colspan="10">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Chargement des données...</p>
                    </div>
                </td>
            </tr>
        `;

        // Définir les critères de comparaison
        const criteria = [
            { id: 'all', label: 'Tous les critères' },
            { id: 'basic', label: 'Critères de base' },
            { id: 'fiscal', label: 'Aspects fiscaux' },
            { id: 'social', label: 'Aspects sociaux' },
            { id: 'creation', label: 'Création et gestion' }
        ];

        // Générer les boutons de critère
        const criteriaButtons = document.getElementById('criteria-buttons');
        criteria.forEach(criterion => {
            const button = document.createElement('button');
            button.className = 'criteria-button' + (criterion.id === 'all' ? ' active' : '');
            button.setAttribute('data-criterion', criterion.id);
            button.textContent = criterion.label;
            criteriaButtons.appendChild(button);
        });

        // Variables pour le filtrage
        let selectedCriterion = 'all';
        let searchTerm = '';

        // Charger et afficher les données
        loadStatutData();

        // Ajouter les écouteurs d'événements pour le filtrage
        document.querySelectorAll('.criteria-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.criteria-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                selectedCriterion = button.getAttribute('data-criterion');
                updateTable();
            });
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            updateTable();
        });

        // Fonction pour charger les données des statuts
        function loadStatutData() {
            // Essayer d'obtenir les données depuis window.legalStatuses
            if (window.legalStatuses) {
                renderTable(window.legalStatuses);
            } else {
                // Si pas disponible, attendre un peu et réessayer
                console.log("Les données legalStatuses ne sont pas encore disponibles, tentative dans 500ms...");
                setTimeout(() => {
                    if (window.legalStatuses) {
                        renderTable(window.legalStatuses);
                    } else {
                        // Si toujours pas disponible, afficher un message d'erreur
                        tableBody.innerHTML = `
                            <tr>
                                <td colspan="10">
                                    <div class="loading-state">
                                        <p style="color: #FF6B6B;">
                                            <i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
                                            Impossible de charger les données des statuts juridiques.
                                        </p>
                                        <button id="retry-load" style="
                                            padding: 0.5rem 1rem;
                                            background-color: rgba(0, 255, 135, 0.2);
                                            border: 1px solid rgba(0, 255, 135, 0.5);
                                            color: #00FF87;
                                            border-radius: 0.375rem;
                                            cursor: pointer;
                                            margin-top: 0.5rem;
                                        ">Réessayer</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                        document.getElementById('retry-load').addEventListener('click', loadStatutData);
                    }
                }, 500);
            }
        }

        // Fonction pour obtenir les propriétés à afficher selon le critère sélectionné
        function getColumnsForCriterion(criterion) {
            switch (criterion) {
                case 'basic':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'associes', label: 'Nombre d\'associés' },
                        { key: 'capital', label: 'Capital social' },
                        { key: 'responsabilite', label: 'Responsabilité' }
                    ];
                case 'fiscal':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'fiscalite', label: 'Régime fiscal' },
                        { key: 'fiscaliteOption', label: 'Option fiscale' },
                        { key: 'regimeTVA', label: 'Régime TVA' }
                    ];
                case 'social':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'regimeSocial', label: 'Régime social' },
                        { key: 'chargesSociales', label: 'Charges sociales' },
                        { key: 'protectionPatrimoine', label: 'Protection patrimoine' }
                    ];
                case 'creation':
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'formalites', label: 'Formalités' },
                        { key: 'publicationComptes', label: 'Publication comptes' },
                        { key: 'plafondCA', label: 'Plafond CA' }
                    ];
                default: // 'all'
                    return [
                        { key: 'name', label: 'Statut' },
                        { key: 'associes', label: 'Nombre d\'associés' },
                        { key: 'capital', label: 'Capital social' },
                        { key: 'responsabilite', label: 'Responsabilité' },
                        { key: 'fiscalite', label: 'Régime fiscal' },
                        { key: 'regimeSocial', label: 'Régime social' }
                    ];
            }
        }

        // Fonction pour filtrer les statuts en fonction du terme de recherche
        function filterStatuts(statuts, term) {
            if (!term) return Object.values(statuts);
            
            return Object.values(statuts).filter(statut => {
                return statut.name.toLowerCase().includes(term) || 
                       statut.shortName.toLowerCase().includes(term) ||
                       (statut.description && statut.description.toLowerCase().includes(term));
            });
        }

        // Fonction principale pour mettre à jour le tableau
        function updateTable() {
            if (!window.legalStatuses) return;
            
            // Obtenir les colonnes à afficher
            const columns = getColumnsForCriterion(selectedCriterion);
            
            // Mettre à jour les en-têtes du tableau
            const tableHeaders = document.getElementById('table-headers');
            tableHeaders.innerHTML = columns.map(col => 
                `<th>${col.label}</th>`
            ).join('');
            
            // Filtrer les statuts
            const filteredStatuts = filterStatuts(window.legalStatuses, searchTerm);
            
            // Générer les lignes du tableau
            const tableBody = document.getElementById('table-body');
            
            if (filteredStatuts.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="${columns.length}" style="text-align: center; padding: 2rem;">
                            Aucun statut ne correspond à votre recherche.
                        </td>
                    </tr>
                `;
                return;
            }
            
            tableBody.innerHTML = filteredStatuts.map(statut => {
                let row = '<tr>';
                
                columns.forEach(column => {
                    if (column.key === 'name') {
                        // Style spécial pour la cellule du nom
                        row += `
                            <td>
                                <div class="statut-cell">
                                    <div class="statut-icon">
                                        <i class="fas ${statut.logo || 'fa-building'}"></i>
                                    </div>
                                    <div class="statut-info">
                                        <span class="statut-name">${statut.shortName}</span>
                                        <span class="statut-fullname">${statut.name}</span>
                                    </div>
                                </div>
                            </td>
                        `;
                    } else {
                        // Style normal pour les autres cellules
                        row += `<td>${statut[column.key] || 'Non spécifié'}</td>`;
                    }
                });
                
                row += '</tr>';
                return row;
            }).join('');
        }

        // Fonction de rendu initial du tableau
        function renderTable(data) {
            updateTable();
        }
    }

    // Démarrer lorsque le DOM est chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createComparatifTable('comparatif-container');
        });
    } else {
        createComparatifTable('comparatif-container');
    }
})();