// === GESTIONNAIRE DE RECHERCHE DE VILLE ===
// Système de recherche de ville avec auto-complétion et sélection de type de logement

class VilleSearchManager {
    constructor() {
        this.villesData = null;
        this.selectedVille = null;
        this.selectedPiece = 'T2'; // Par défaut T2
        this.manualMode = false;
        
        this.init();
    }
    
    async init() {
        console.log('🏠 Initialisation du gestionnaire de recherche de ville...');
        
        // Charger les données des villes
        await this.loadVillesData();
        
        // Initialiser les événements
        this.initEvents();
        
        console.log('✅ VilleSearchManager initialisé avec', this.villesData?.villes?.length || 0, 'villes');
    }
    
    async loadVillesData() {
        try {
            console.log('📊 Chargement des données des villes...');
            
            // ✅ CORRECTION : Chemin vers le dossier data/
            const response = await fetch('./data/villes-data.json');
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            this.villesData = await response.json();
            console.log('✅ Données des villes chargées:', this.villesData.meta || 'Base de données complète');
            console.log(`🏠 ${this.villesData.villes.length} villes disponibles`);
            
        } catch (error) {
            console.warn('⚠️ Erreur lors du chargement des données des villes:', error.message);
            console.log('🔄 Utilisation des données de test...');
            
            // Données de test si le fichier n'est pas trouvé
            this.villesData = {
                villes: [
                    {
                        nom: "Lyon",
                        departement: "69",
                        pieces: {
                            "T1": {prix_m2: 6912, loyer_m2: 19.18},
                            "T2": {prix_m2: 4567, loyer_m2: 17.92},
                            "T3": {prix_m2: 3970, loyer_m2: 14.50},
                            "T4": {prix_m2: 3660, loyer_m2: 14.50},
                            "T5": {prix_m2: 3286, loyer_m2: 14.50}
                        }
                    },
                    {
                        nom: "Paris 10e Arrondissement",
                        departement: "75",
                        pieces: {
                            "T1": {prix_m2: 11945, loyer_m2: 32.08},
                            "T2": {prix_m2: 9315, loyer_m2: 32.08},
                            "T3": {prix_m2: 7895, loyer_m2: 28.76}
                        }
                    },
                    {
                        nom: "Marseille",
                        departement: "13",
                        pieces: {
                            "T1": {prix_m2: 7452, loyer_m2: 19.22},
                            "T2": {prix_m2: 5290, loyer_m2: 19.22},
                            "T3": {prix_m2: 4647, loyer_m2: 17.43},
                            "T4": {prix_m2: 4375, loyer_m2: 17.43}
                        }
                    },
                    {
                        nom: "Toulouse",
                        departement: "31",
                        pieces: {
                            "T1": {prix_m2: 7946, loyer_m2: 15.92},
                            "T2": {prix_m2: 4629, loyer_m2: 15.92},
                            "T3": {prix_m2: 3525, loyer_m2: 12.34},
                            "T4": {prix_m2: 3237, loyer_m2: 12.34},
                            "T5": {prix_m2: 2761, loyer_m2: 12.34}
                        }
                    },
                    {
                        nom: "Nice",
                        departement: "06",
                        pieces: {
                            "T1": {prix_m2: 6712, loyer_m2: 19.68},
                            "T2": {prix_m2: 5935, loyer_m2: 19.68},
                            "T3": {prix_m2: 4838, loyer_m2: 16.60},
                            "T4": {prix_m2: 4241, loyer_m2: 16.60}
                        }
                    },
                    {
                        nom: "Nantes",
                        departement: "44",
                        pieces: {
                            "T1": {prix_m2: 7893, loyer_m2: 16.21},
                            "T2": {prix_m2: 4280, loyer_m2: 16.21},
                            "T3": {prix_m2: 3572, loyer_m2: 13.40},
                            "T4": {prix_m2: 3226, loyer_m2: 13.40},
                            "T5": {prix_m2: 3000, loyer_m2: 13.40}
                        }
                    }
                ],
                meta: {
                    total_villes: 6,
                    note: "Données de test - Erreur de chargement du fichier principal : " + error.message
                }
            };
        }
    }
    
    initEvents() {
        const villeSearch = document.getElementById('ville-search');
        const suggestions = document.getElementById('ville-suggestions');
        const autreVilleCheckbox = document.getElementById('autre-ville-checkbox');
        
        if (!villeSearch) {
            console.error('❌ Élément ville-search non trouvé');
            return;
        }
        
        console.log('🔗 Initialisation des événements...');
        
        // Recherche de ville
        villeSearch.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });
        
        // Masquer suggestions si clic ailleurs
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                suggestions.style.display = 'none';
            }
        });
        
        // Mode manuel
        if (autreVilleCheckbox) {
            autreVilleCheckbox.addEventListener('change', (e) => {
                this.toggleManualMode(e.target.checked);
            });
        }
        
        console.log('✅ Événements initialisés');
    }
    
    handleSearch(searchTerm) {
        const suggestions = document.getElementById('ville-suggestions');
        
        if (!searchTerm || searchTerm.length < 2) {
            suggestions.style.display = 'none';
            return;
        }
        
        // Recherche dans les données
        const matches = this.villesData.villes.filter(ville =>
            ville.nom.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (matches.length > 0) {
            this.displaySuggestions(matches.slice(0, 8)); // Limiter à 8 résultats
            suggestions.style.display = 'block';
        } else {
            suggestions.style.display = 'none';
        }
    }
    
    displaySuggestions(villes) {
        const suggestions = document.getElementById('ville-suggestions');
        suggestions.innerHTML = '';
        
        villes.forEach(ville => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'ville-suggestion';
            
            const typesDisponibles = Object.keys(ville.pieces);
            const priceRange = this.getPriceRange(ville.pieces);
            
            suggestionDiv.innerHTML = `
                <div class="ville-info">
                    <div class="ville-nom">${ville.nom}</div>
                    <div class="ville-dept">Département ${ville.departement}</div>
                </div>
                <div class="ville-types-info">
                    <div class="ville-types-count">${typesDisponibles.length} types</div>
                    <div style="color: rgba(255,255,255,0.7);">${priceRange.min}€ - ${priceRange.max}€/m²</div>
                </div>
            `;
            
            suggestionDiv.addEventListener('click', () => {
                this.selectVille(ville);
            });
            
            suggestions.appendChild(suggestionDiv);
        });
    }
    
    getPriceRange(pieces) {
        const prices = Object.values(pieces).map(p => p.prix_m2);
        return {
            min: Math.min(...prices),
            max: Math.max(...prices)
        };
    }
    
    selectVille(ville) {
        console.log('🏙️ Ville sélectionnée:', ville.nom);
        
        this.selectedVille = ville;
        
        // Mettre à jour l'input de recherche
        const villeSearch = document.getElementById('ville-search');
        villeSearch.value = ville.nom;
        villeSearch.classList.add('ville-search-enhanced');
        
        // Masquer les suggestions
        document.getElementById('ville-suggestions').style.display = 'none';
        
        // Afficher les infos de la ville
        this.displayVilleInfo(ville);
        
        // Créer le sélecteur de pièces
        this.createPieceSelector(ville.pieces);
        
        // Mettre à jour les champs prix/loyer
        this.updatePriceFields();
    }
    
    displayVilleInfo(ville) {
        const infoDiv = document.getElementById('ville-selected-info');
        const nomSpan = document.getElementById('ville-nom');
        const deptSpan = document.getElementById('ville-dept');
        const typesSpan = document.getElementById('ville-types');
        
        if (nomSpan) nomSpan.textContent = ville.nom;
        if (deptSpan) deptSpan.textContent = ville.departement;
        if (typesSpan) typesSpan.textContent = Object.keys(ville.pieces).join(', ');
        
        if (infoDiv) {
            infoDiv.style.display = 'block';
            infoDiv.classList.add('fade-in');
        }
    }
    
    createPieceSelector(pieces) {
        const selector = document.getElementById('piece-selector');
        if (!selector) return;
        
        selector.innerHTML = '';
        
        Object.keys(pieces).forEach(pieceType => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `piece-btn ${pieceType === this.selectedPiece ? 'active' : ''}`;
            btn.textContent = pieceType;
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.selectPiece(pieceType, btn);
            });
            
            selector.appendChild(btn);
        });
    }
    
    selectPiece(pieceType, btnElement) {
        console.log('🏠 Type de logement sélectionné:', pieceType);
        
        this.selectedPiece = pieceType;
        
        // Mettre à jour les boutons
        document.querySelectorAll('.piece-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (btnElement) {
            btnElement.classList.add('active');
        }
        
        // Mettre à jour les champs
        this.updatePriceFields();
    }
    
    updatePriceFields() {
        if (!this.selectedVille || !this.selectedPiece) return;
        
        const pieceData = this.selectedVille.pieces[this.selectedPiece];
        if (!pieceData) return;
        
        const prixM2Input = document.getElementById('prix-m2-marche');
        const loyerM2Input = document.getElementById('loyer-m2');
        
        if (prixM2Input) {
            prixM2Input.value = pieceData.prix_m2;
            prixM2Input.classList.add('ville-search-enhanced');
        }
        
        if (loyerM2Input) {
            loyerM2Input.value = pieceData.loyer_m2;
            loyerM2Input.classList.add('ville-search-enhanced');
        }
        
        console.log('💰 Prix mis à jour:', {
            ville: this.selectedVille.nom,
            type: this.selectedPiece,
            prix_m2: pieceData.prix_m2,
            loyer_m2: pieceData.loyer_m2
        });
    }
    
    toggleManualMode(isManual) {
        console.log('🔧 Mode manuel:', isManual);
        
        this.manualMode = isManual;
        
        const prixM2Input = document.getElementById('prix-m2-marche');
        const loyerM2Input = document.getElementById('loyer-m2');
        const villeInfo = document.getElementById('ville-selected-info');
        const villeSearch = document.getElementById('ville-search');
        const container = document.querySelector('.container');
        
        if (isManual) {
            // Mode manuel: permettre la saisie libre
            if (prixM2Input) {
                prixM2Input.classList.remove('ville-search-enhanced', 'highlight-field');
                prixM2Input.classList.add('manual-mode');
            }
            if (loyerM2Input) {
                loyerM2Input.classList.remove('ville-search-enhanced', 'highlight-field');
                loyerM2Input.classList.add('manual-mode');
            }
            if (villeSearch) {
                villeSearch.classList.remove('ville-search-enhanced');
            }
            
            if (villeInfo) villeInfo.style.display = 'none';
            if (container) container.classList.add('manual-mode');
            
            this.selectedVille = null;
            
        } else {
            // Mode automatique: remettre en surbrillance
            if (prixM2Input) {
                prixM2Input.classList.remove('manual-mode');
                prixM2Input.classList.add('highlight-field');
            }
            if (loyerM2Input) {
                loyerM2Input.classList.remove('manual-mode');
                loyerM2Input.classList.add('highlight-field');
            }
            if (container) container.classList.remove('manual-mode');
            
            // Remettre à jour si une ville était sélectionnée
            if (this.selectedVille) {
                this.updatePriceFields();
                if (villeInfo) villeInfo.style.display = 'block';
            }
        }
    }
    
    // Méthode pour obtenir les données de la ville sélectionnée
    getSelectedVilleData() {
        if (!this.selectedVille || !this.selectedPiece || this.manualMode) return null;
        
        const pieceData = this.selectedVille.pieces[this.selectedPiece];
        if (!pieceData) return null;
        
        return {
            ville: this.selectedVille.nom,
            departement: this.selectedVille.departement,
            piece: this.selectedPiece,
            prix_m2: pieceData.prix_m2,
            loyer_m2: pieceData.loyer_m2,
            manual_mode: this.manualMode
        };
    }
    
    // Méthode pour obtenir les statistiques de la base de données
    getStats() {
        if (!this.villesData) return null;
        
        return {
            total_villes: this.villesData.villes.length,
            meta: this.villesData.meta || null,
            selected_ville: this.selectedVille?.nom || null,
            selected_piece: this.selectedPiece || null,
            manual_mode: this.manualMode
        };
    }
}

// === INTÉGRATION AVEC LE SIMULATEUR EXISTANT ===

// Modifier la fonction de simulation existante
function integrateWithExistingSimulator() {
    // Attendre que le DOM soit chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', integrateWithExistingSimulator);
        return;
    }
    
    // Vérifier si le bouton de simulation existe
    const btnSimulate = document.getElementById('btn-simulate');
    if (!btnSimulate) {
        console.warn('⚠️ Bouton de simulation non trouvé');
        return;
    }
    
    // Sauvegarder la fonction de simulation originale si elle existe
    const originalSimulateFunction = window.simuler || function() {
        console.log('🔄 Fonction de simulation par défaut appelée');
    };
    
    // Créer une nouvelle fonction de simulation qui intègre les données de ville
    window.simulerAvecVilleData = function() {
        console.log('🚀 Lancement de la simulation avec données de ville...');
        
        const villeData = window.villeSearchManager?.getSelectedVilleData();
        
        if (villeData) {
            console.log('🏙️ Simulation avec données de ville:', villeData);
            
            // Afficher les informations dans les résultats
            const resultsSection = document.getElementById('results');
            if (resultsSection && !resultsSection.classList.contains('hidden')) {
                // Ajouter info sur la ville utilisée
                let villeInfo = document.getElementById('ville-used-info');
                if (!villeInfo) {
                    villeInfo = document.createElement('div');
                    villeInfo.id = 'ville-used-info';
                    villeInfo.className = 'info-message mb-4';
                    villeInfo.innerHTML = `
                        <div class="text-lg text-green-400 mr-3">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <div>
                            <h4 class="font-medium mb-1">Simulation basée sur les données de ${villeData.ville}</h4>
                            <p class="text-sm opacity-90">Type: ${villeData.piece} • Prix: ${villeData.prix_m2}€/m² • Loyer: ${villeData.loyer_m2}€/m²/mois</p>
                        </div>
                    `;
                    resultsSection.insertBefore(villeInfo, resultsSection.firstChild);
                }
            }
        } else {
            console.log('📝 Simulation avec données manuelles');
        }
        
        // Appeler la fonction de simulation originale
        return originalSimulateFunction();
    };
    
    // Remplacer la fonction de simulation
    window.simuler = window.simulerAvecVilleData;
    
    console.log('✅ Intégration avec le simulateur existant terminée');
}

// === INITIALISATION ===
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏠 Initialisation du système de recherche de ville...');
    
    // Initialiser le gestionnaire de recherche
    window.villeSearchManager = new VilleSearchManager();
    
    // Intégrer avec le simulateur existant
    integrateWithExistingSimulator();
    
    console.log('✅ Système de recherche de ville initialisé');
});

// === EXPORT POUR COMPATIBILITÉ ===
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VilleSearchManager };
}

// === FONCTIONS UTILITAIRES ===

// Fonction pour debug - afficher les stats
window.showVilleStats = function() {
    if (window.villeSearchManager) {
        console.table(window.villeSearchManager.getStats());
    }
};

// Fonction pour forcer la mise à jour des données
window.refreshVilleData = function() {
    if (window.villeSearchManager) {
        window.villeSearchManager.loadVillesData();
    }
};
