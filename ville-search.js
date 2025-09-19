// ville-search.js - Gestion de la recherche de villes
(function() {
    'use strict';

    class VilleSearchManager {
        constructor() {
            this.selectedVilleData = null;
            this.onVilleSelected = null;
        }

        init() {
            const searchInput = document.getElementById('ville-search');
            const suggestionsDiv = document.getElementById('ville-suggestions');
            const villeInfo = document.getElementById('ville-selected-info');
            
            if (!searchInput) return;

            // Données de test - À remplacer par vos vraies données
            this.villesData = [
                { ville: "Paris", departement: "75", prix_m2: 10500, loyer_m2: 35, piece: "T2,T3,T4" },
                { ville: "Lyon", departement: "69", prix_m2: 4800, loyer_m2: 18, piece: "T1,T2,T3,T4" },
                { ville: "Marseille", departement: "13", prix_m2: 3200, loyer_m2: 15, piece: "T2,T3,T4,T5" },
                { ville: "Toulouse", departement: "31", prix_m2: 3500, loyer_m2: 14, piece: "T1,T2,T3,T4" },
                { ville: "Nice", departement: "06", prix_m2: 5200, loyer_m2: 20, piece: "Studio,T1,T2,T3" },
                { ville: "Nantes", departement: "44", prix_m2: 3800, loyer_m2: 13, piece: "T1,T2,T3,T4" },
                { ville: "Bordeaux", departement: "33", prix_m2: 4500, loyer_m2: 16, piece: "T1,T2,T3,T4" },
                { ville: "Lille", departement: "59", prix_m2: 3300, loyer_m2: 14, piece: "T1,T2,T3,T4" },
                { ville: "Strasbourg", departement: "67", prix_m2: 3600, loyer_m2: 13, piece: "T1,T2,T3,T4" },
                { ville: "Rennes", departement: "35", prix_m2: 3400, loyer_m2: 12, piece: "T1,T2,T3,T4" }
            ];

            // Gestion de la recherche
            searchInput.addEventListener('input', (e) => {
                const value = e.target.value.toLowerCase();
                if (value.length < 2) {
                    suggestionsDiv.style.display = 'none';
                    return;
                }

                const matches = this.villesData.filter(v => 
                    v.ville.toLowerCase().includes(value)
                );

                if (matches.length > 0) {
                    suggestionsDiv.innerHTML = matches.slice(0, 5).map(ville => 
                        `<div class="ville-suggestion" data-ville="${ville.ville}">
                            <span class="ville-name">${ville.ville}</span>
                            <span class="ville-dept">(${ville.departement})</span>
                            <span class="ville-price">${ville.prix_m2}€/m²</span>
                        </div>`
                    ).join('');
                    suggestionsDiv.style.display = 'block';
                } else {
                    suggestionsDiv.style.display = 'none';
                }
            });

            // Sélection d'une ville
            suggestionsDiv.addEventListener('click', (e) => {
                const suggestion = e.target.closest('.ville-suggestion');
                if (!suggestion) return;

                const villeName = suggestion.dataset.ville;
                const villeData = this.villesData.find(v => v.ville === villeName);
                
                if (villeData) {
                    this.selectVille(villeData);
                    searchInput.value = villeName;
                    suggestionsDiv.style.display = 'none';
                }
            });

            // Fermer les suggestions au clic ailleurs
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) {
                    suggestionsDiv.style.display = 'none';
                }
            });
        }

        selectVille(villeData) {
            this.selectedVilleData = villeData;
            
            // Mise à jour de l'affichage
            const villeInfo = document.getElementById('ville-selected-info');
            if (villeInfo) {
                document.getElementById('ville-nom').textContent = villeData.ville;
                document.getElementById('ville-dept').textContent = villeData.departement;
                document.getElementById('ville-types').textContent = villeData.piece;
                villeInfo.style.display = 'block';

                // Générer les boutons de type
                this.generateTypeButtons(villeData.piece);
            }

            // Mise à jour des champs cachés
            document.getElementById('propertyCity').value = villeData.ville;
            document.getElementById('propertyDepartment').value = villeData.departement;

            // Callback si défini
            if (this.onVilleSelected) {
                this.onVilleSelected(villeData);
            }
        }

        generateTypeButtons(types) {
            const pieceSelector = document.getElementById('piece-selector');
            if (!pieceSelector) return;

            const typesArray = types.split(',');
            pieceSelector.innerHTML = typesArray.map(type => 
                `<label class="piece-option">
                    <input type="radio" name="property-type" value="${type.toLowerCase()}">
                    <span class="piece-label">${type}</span>
                </label>`
            ).join('');

            // Sélectionner le premier par défaut
            const firstRadio = pieceSelector.querySelector('input[type="radio"]');
            if (firstRadio) {
                firstRadio.checked = true;
                document.getElementById('propertyType').value = firstRadio.value;
            }

            // Gérer les changements
            pieceSelector.addEventListener('change', (e) => {
                if (e.target.type === 'radio') {
                    document.getElementById('propertyType').value = e.target.value;
                }
            });
        }

        getSelectedVilleData() {
            return this.selectedVilleData;
        }
    }

    // Initialisation au chargement
    window.villeSearchManager = new VilleSearchManager();
    
    document.addEventListener('DOMContentLoaded', () => {
        window.villeSearchManager.init();
    });

})();
