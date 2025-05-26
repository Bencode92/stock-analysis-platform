/**
 * city-comparison.js - Comparateur multi-villes pour l'investissement immobilier
 * Permet de comparer jusqu'à 10 villes simultanément
 * Inclut le mode objectif de cash-flow
 * 
 * v2.1 - Correction du critère de sélection selon le mode
 */

class CityComparator {
    constructor(simulateur) {
        this.simulateur = simulateur || window.simulateur || new window.SimulateurImmo();
        this.selectedCities = new Map();
        this.maxCities = 10;
        this.villesData = null;
        
        // Mode objectif cash-flow
        this.targetMode = false;
        this.targetCashflow = 1000;
        this.numberOfProperties = 1;
        
        this.init();
    }
    
    async init() {
        console.log('🏙️ Initialisation du comparateur multi-villes...');
        
        // Charger les données des villes
        await this.loadVillesData();
        
        // Bouton d'activation
        const btnCompare = document.getElementById('btn-compare-cities');
        btnCompare?.addEventListener('click', () => this.togglePanel());
        
        // Recherche multi-villes
        const searchInput = document.getElementById('multi-city-search');
        searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        searchInput?.addEventListener('focus', () => this.showSuggestions());
        
        // Bouton de comparaison
        document.getElementById('btn-launch-comparison')?.addEventListener('click', () => this.runComparison());
        
        // Fermer suggestions au clic ailleurs
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#multi-city-search') && !e.target.closest('#multi-city-suggestions')) {
                this.hideSuggestions();
            }
        });
    }
    
    async loadVillesData() {
        try {
            console.log('📊 Chargement des données des villes pour le comparateur...');
            
            // Essayer d'utiliser les données du villeSearchManager si disponibles
            if (window.villeSearchManager && window.villeSearchManager.villesData) {
                this.villesData = window.villeSearchManager.villesData;
                console.log('✅ Données récupérées depuis villeSearchManager');
            } else {
                // Sinon charger directement
                const response = await fetch('./data/villes-data.json');
                if (!response.ok) {
                    throw new Error(`Erreur HTTP: ${response.status}`);
                }
                this.villesData = await response.json();
                console.log('✅ Données chargées depuis le fichier');
            }
            
            console.log(`🏠 ${this.villesData.villes.length} villes disponibles pour la comparaison`);
            
        } catch (error) {
            console.warn('⚠️ Erreur lors du chargement des données:', error);
            // Données de test minimales
            this.villesData = {
                villes: [
                    {
                        nom: "Lyon",
                        departement: "69",
                        pieces: {
                            "T1": {prix_m2: 6912, loyer_m2: 19.18},
                            "T2": {prix_m2: 4567, loyer_m2: 17.92},
                            "T3": {prix_m2: 3970, loyer_m2: 14.50}
                        }
                    },
                    {
                        nom: "Paris 10e Arrondissement",
                        departement: "75",
                        pieces: {
                            "T1": {prix_m2: 11945, loyer_m2: 32.08},
                            "T2": {prix_m2: 9315, loyer_m2: 32.08}
                        }
                    }
                ]
            };
        }
    }
    
    togglePanel() {
        const panel = document.getElementById('city-comparison-panel');
        if (panel) {
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                panel.classList.add('fade-in');
                // Réinitialiser la recherche
                document.getElementById('multi-city-search').value = '';
                this.hideSuggestions();
                this.addTargetModeUI();
                
                // Synchroniser les paramètres au moment de l'ouverture
                console.log('🔄 Synchronisation des paramètres avec le simulateur principal');
                if (window.simulateur && window.simulateur.params) {
                    console.log('📊 Paramètres actuels du simulateur:', window.simulateur.params);
                }
            }
        }
    }
    
    addTargetModeUI() {
        // Vérifier si déjà ajouté
        if (document.getElementById('target-mode-section')) return;
        
        const comparisonInfo = document.querySelector('#city-comparison-panel .comparison-info');
        if (!comparisonInfo) return;
        
        const targetSection = document.createElement('div');
        targetSection.id = 'target-mode-section';
        targetSection.className = 'target-mode-section mt-4 p-4 bg-black/30 rounded-lg';
        targetSection.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="target-mode-toggle" class="mr-3">
                    <span class="font-medium">Mode objectif de cash-flow</span>
                </label>
                <span class="badge badge-primary">Nouveau</span>
            </div>
            
            <div class="text-sm text-gray-400 mb-3">
                <i class="fas fa-info-circle mr-1"></i>
                <span id="mode-description">
                    Quand cette option est décochée, l'outil privilégie le revenu locatif net le plus élevé.
                </span>
            </div>
            
            <div id="target-mode-options" class="hidden mt-4 space-y-3">
                <div class="grid grid-2 gap-4">
                    <div class="form-group">
                        <label class="form-label text-sm">Cash-flow mensuel souhaité</label>
                        <div class="form-input-wrapper">
                            <input type="number" id="target-cashflow-input" class="form-input" value="1000" step="100">
                            <span class="form-addon-text">€/mois</span>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label text-sm">Nombre de biens</label>
                        <select id="target-properties-count" class="form-input">
                            <option value="1">1 bien</option>
                            <option value="2">2 biens</option>
                            <option value="3">3 biens</option>
                            <option value="4">4 biens</option>
                            <option value="5">5 biens</option>
                        </select>
                    </div>
                </div>
                
                <div class="info-message text-sm">
                    <i class="fas fa-info-circle mr-2"></i>
                    Le système calculera la surface nécessaire dans chaque ville pour atteindre ${this.targetCashflow}€/mois.
                </div>
            </div>
        `;
        
        comparisonInfo.insertAdjacentElement('afterend', targetSection);
        
        // Événements
        document.getElementById('target-mode-toggle').addEventListener('change', (e) => {
            this.targetMode = e.target.checked;
            document.getElementById('target-mode-options').classList.toggle('hidden', !this.targetMode);
            
            // Mise à jour de la description
            const description = document.getElementById('mode-description');
            if (this.targetMode) {
                description.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Mode activé : l\'outil privilégie le cash-flow mensuel le plus élevé.';
            } else {
                description.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Mode désactivé : l\'outil privilégie le revenu locatif net le plus élevé.';
            }
            
            const btnLaunch = document.getElementById('btn-launch-comparison');
            if (btnLaunch) {
                btnLaunch.innerHTML = this.targetMode 
                    ? '<i class="fas fa-bullseye"></i> Calculer investissement nécessaire'
                    : '<i class="fas fa-rocket"></i> Lancer la comparaison';
            }
        });
        
        document.getElementById('target-cashflow-input').addEventListener('input', (e) => {
            this.targetCashflow = parseFloat(e.target.value) || 0;
            document.querySelector('#target-mode-options .info-message').innerHTML = 
                `<i class="fas fa-info-circle mr-2"></i>Le système calculera la surface nécessaire dans chaque ville pour atteindre ${this.targetCashflow}€/mois.`;
        });
        
        document.getElementById('target-properties-count').addEventListener('change', (e) => {
            this.numberOfProperties = parseInt(e.target.value);
        });
    }
    
    handleSearch(searchTerm) {
        if (!this.villesData || !searchTerm || searchTerm.length < 2) {
            this.hideSuggestions();
            return;
        }
        
        const matches = this.villesData.villes.filter(ville =>
            ville.nom.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !this.selectedCities.has(ville.nom) // Ne pas afficher les villes déjà sélectionnées
        ).slice(0, 8);
        
        this.displaySuggestions(matches);
    }
    
    displaySuggestions(villes) {
        const container = document.getElementById('multi-city-suggestions');
        if (!container) return;
        
        if (villes.length === 0) {
            container.innerHTML = `
                <div class="ville-suggestion" style="opacity: 0.6; cursor: default;">
                    <div class="ville-info">
                        <div class="ville-nom">Aucun résultat trouvé</div>
                    </div>
                </div>
            `;
            container.style.display = 'block';
            return;
        }
        
        container.innerHTML = villes.map(ville => {
            const types = Object.keys(ville.pieces);
            const prices = Object.values(ville.pieces).map(p => p.prix_m2);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            
            return `
                <div class="ville-suggestion" data-ville='${JSON.stringify(ville).replace(/'/g, '&apos;')}'>
                    <div class="ville-info">
                        <div class="ville-nom">${ville.nom}</div>
                        <div class="ville-dept">Département ${ville.departement}</div>
                    </div>
                    <div class="ville-types-info">
                        <div class="ville-types-count">${types.length} types</div>
                        <div style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">
                            ${minPrice.toLocaleString()}€ - ${maxPrice.toLocaleString()}€/m²
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.style.display = 'block';
        
        // Attacher les événements
        container.querySelectorAll('.ville-suggestion').forEach(el => {
            if (!el.textContent.includes('Aucun résultat')) {
                el.addEventListener('click', () => {
                    const ville = JSON.parse(el.dataset.ville.replace(/&apos;/g, "'"));
                    this.addCity(ville);
                });
            }
        });
    }
    
    showSuggestions() {
        const container = document.getElementById('multi-city-suggestions');
        const searchInput = document.getElementById('multi-city-search');
        if (container && searchInput.value.length >= 2) {
            this.handleSearch(searchInput.value);
        }
    }
    
    hideSuggestions() {
        const container = document.getElementById('multi-city-suggestions');
        if (container) container.style.display = 'none';
    }
    
    addCity(ville) {
        if (this.selectedCities.size >= this.maxCities) {
            // Afficher un message plus élégant
            const toast = document.createElement('div');
            toast.className = 'toast toast-warning';
            toast.innerHTML = `
                <div class="toast-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="toast-content">Maximum ${this.maxCities} villes peuvent être comparées</div>
            `;
            document.getElementById('toast-container')?.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
            return;
        }
        
        if (this.selectedCities.has(ville.nom)) {
            return;
        }
        
        this.selectedCities.set(ville.nom, ville);
        this.updateCityDisplay();
        
        // Réinitialiser la recherche
        document.getElementById('multi-city-search').value = '';
        this.hideSuggestions();
    }
    
    removeCity(cityName) {
        this.selectedCities.delete(cityName);
        this.updateCityDisplay();
    }
    
    updateCityDisplay() {
        const container = document.getElementById('city-chips');
        const countEl = document.getElementById('city-count');
        const btnLaunch = document.getElementById('btn-launch-comparison');
        
        if (countEl) countEl.textContent = this.selectedCities.size;
        if (btnLaunch) btnLaunch.disabled = this.selectedCities.size === 0;
        
        if (container) {
            if (this.selectedCities.size === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="width: 100%; text-align: center; padding: 2rem; opacity: 0.5;">
                        <i class="fas fa-city" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                        <p style="margin: 0;">Aucune ville sélectionnée</p>
                    </div>
                `;
            } else {
                container.innerHTML = Array.from(this.selectedCities.entries()).map(([nom, ville]) => `
                    <div class="city-chip">
                        ${nom}
                        <span class="remove-chip" data-city="${nom}">
                            <i class="fas fa-times"></i>
                        </span>
                    </div>
                `).join('');
                
                // Attacher les événements de suppression
                container.querySelectorAll('.remove-chip').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeCity(el.dataset.city);
                    });
                });
            }
        }
    }
    
    /**
     * Utilisation des paramètres du simulateur principal
     * au lieu de collecter depuis le DOM
     */
    collectCurrentParams() {
        // Vérifier d'abord si le simulateur principal existe et a des paramètres
        if (window.simulateur && window.simulateur.params) {
            console.log('✅ Utilisation des paramètres du simulateur principal');
            
            // Récupérer TOUS les paramètres directement du simulateur
            const params = {
                // Paramètres de base
                apport: window.simulateur.params.base.apport,
                taux: window.simulateur.params.base.taux,
                duree: window.simulateur.params.base.duree,
                calculationMode: window.simulateur.params.base.calculationMode || 'loyer-mensualite',
                pourcentApportMin: window.simulateur.params.base.pourcentApportMin || 10,
                
                // Paramètres communs
                prixM2: window.simulateur.params.communs.prixM2,
                loyerM2: window.simulateur.params.communs.loyerM2,
                fraisBancairesDossier: window.simulateur.params.communs.fraisBancairesDossier,
                fraisBancairesCompte: window.simulateur.params.communs.fraisBancairesCompte,
                fraisGarantie: window.simulateur.params.communs.fraisGarantie,
                taxeFonciere: window.simulateur.params.communs.taxeFonciere,
                vacanceLocative: window.simulateur.params.communs.vacanceLocative,
                travauxM2: window.simulateur.params.communs.travauxM2,
                useFixedTravauxPercentage: window.simulateur.params.communs.useFixedTravauxPercentage,
                entretienAnnuel: window.simulateur.params.communs.entretienAnnuel,
                assurancePNO: window.simulateur.params.communs.assurancePNO,
                
                // Paramètres achat classique
                publiciteFonciere: window.simulateur.params.classique.publiciteFonciere,
                droitsMutation: window.simulateur.params.classique.droitsMutation,
                securiteImmobiliere: window.simulateur.params.classique.securiteImmobiliere,
                emolumentsVente: window.simulateur.params.classique.emolumentsVente,
                formalites: window.simulateur.params.classique.formalites,
                debours: window.simulateur.params.classique.debours,
                commissionImmo: window.simulateur.params.classique.commissionImmo,
                
                // Paramètres vente aux enchères
                droitsEnregistrement: window.simulateur.params.encheres.droitsEnregistrement,
                coefMutation: window.simulateur.params.encheres.coefMutation,
                emolumentsPoursuivant1: window.simulateur.params.encheres.emolumentsPoursuivant1,
                emolumentsPoursuivant2: window.simulateur.params.encheres.emolumentsPoursuivant2,
                emolumentsPoursuivant3: window.simulateur.params.encheres.emolumentsPoursuivant3,
                emolumentsPoursuivant4: window.simulateur.params.encheres.emolumentsPoursuivant4,
                honorairesAvocatCoef: window.simulateur.params.encheres.honorairesAvocatCoef,
                honorairesAvocatTVA: window.simulateur.params.encheres.honorairesAvocatTVA,
                publiciteFonciereEncheres: window.simulateur.params.encheres.publiciteFonciereEncheres,
                fraisFixes: window.simulateur.params.encheres.fraisFixes,
                avocatEnchere: window.simulateur.params.encheres.avocatEnchere,
                suiviDossier: window.simulateur.params.encheres.suiviDossier,
                cautionPourcent: window.simulateur.params.encheres.cautionPourcent,
                cautionRestituee: window.simulateur.params.encheres.cautionRestituee
            };
            
            console.log('📊 Paramètres synchronisés:', params);
            return params;
        }
        
        // FALLBACK: Si pas de simulateur principal, collecter depuis le DOM
        console.log('⚠️ Simulateur principal non trouvé, collecte depuis le DOM');
        
        // Code de fallback pour collecter depuis le DOM (identique à avant)
        return this.collectParamsFromDOM();
    }
    
    collectParamsFromDOM() {
        // Paramètres de base
        const formData = {
            apport: parseFloat(document.getElementById('apport')?.value) || 20000,
            taux: parseFloat(document.getElementById('taux')?.value) || 3.5,
            duree: parseFloat(document.getElementById('duree')?.value) || 20,
            calculationMode: document.querySelector('input[name="calculation-mode"]:checked')?.value || 'loyer-mensualite',
            pourcentApportMin: parseFloat(document.getElementById('pourcent-apport')?.value) || 10,
            prixM2: parseFloat(document.getElementById('prix-m2-marche')?.value) || 2000,
            loyerM2: parseFloat(document.getElementById('loyer-m2')?.value) || 12
        };
        
        // Paramètres communs avancés COMPLETS
        const advancedParams = {
            fraisBancairesDossier: parseFloat(document.getElementById('frais-bancaires-dossier')?.value) || 900,
            fraisBancairesCompte: parseFloat(document.getElementById('frais-bancaires-compte')?.value) || 150,
            fraisGarantie: parseFloat(document.getElementById('frais-garantie')?.value) || 1.3709,
            taxeFonciere: parseFloat(document.getElementById('taxe-fonciere')?.value) || 0,
            vacanceLocative: parseFloat(document.getElementById('vacance-locative')?.value) || 0,
            travauxM2: parseFloat(document.getElementById('travaux-m2')?.value) || 400,
            useFixedTravauxPercentage: document.getElementById('travaux-mode-percentage')?.checked ?? true,
            entretienAnnuel: parseFloat(document.getElementById('entretien-annuel')?.value) || 0.5,
            assurancePNO: parseFloat(document.getElementById('assurance-pno')?.value) || 250
        };
        
        // Paramètres achat classique
        const classiqueParams = {
            publiciteFonciere: parseFloat(document.getElementById('publicite-fonciere')?.value) || 0.72,
            droitsMutation: parseFloat(document.getElementById('droits-mutation')?.value) || 5.81,
            securiteImmobiliere: parseFloat(document.getElementById('securite-immobiliere')?.value) || 0.10,
            emolumentsVente: parseFloat(document.getElementById('emoluments-vente')?.value) || 1.12,
            formalites: parseFloat(document.getElementById('formalites')?.value) || 0.28,
            debours: parseFloat(document.getElementById('debours')?.value) || 0.13,
            commissionImmo: parseFloat(document.getElementById('commission-immo')?.value) || 4
        };
        
        // Paramètres vente aux enchères
        const encheresParams = {
            droitsEnregistrement: parseFloat(document.getElementById('droits-enregistrement')?.value) || 5.70,
            coefMutation: parseFloat(document.getElementById('coef-mutation')?.value) || 2.37,
            emolumentsPoursuivant1: parseFloat(document.getElementById('emoluments-poursuivant-1')?.value) || 7,
            emolumentsPoursuivant2: parseFloat(document.getElementById('emoluments-poursuivant-2')?.value) || 3,
            emolumentsPoursuivant3: parseFloat(document.getElementById('emoluments-poursuivant-3')?.value) || 2,
            emolumentsPoursuivant4: parseFloat(document.getElementById('emoluments-poursuivant-4')?.value) || 1,
            honorairesAvocatCoef: parseFloat(document.getElementById('honoraires-avocat-coef')?.value) || 0.25,
            honorairesAvocatTVA: parseFloat(document.getElementById('honoraires-avocat-tva')?.value) || 20,
            publiciteFonciereEncheres: parseFloat(document.getElementById('publicite-fonciere-encheres')?.value) || 0.10,
            fraisFixes: parseFloat(document.getElementById('frais-fixes')?.value) || 50,
            avocatEnchere: parseFloat(document.getElementById('avocat-enchere')?.value) || 300,
            suiviDossier: parseFloat(document.getElementById('suivi-dossier')?.value) || 1200,
            cautionPourcent: parseFloat(document.getElementById('caution-pourcent')?.value) || 5,
            cautionRestituee: document.getElementById('caution-restituee')?.checked ?? true
        };
        
        // Fusionner tous les paramètres
        return { 
            ...formData, 
            ...advancedParams,
            ...classiqueParams,
            ...encheresParams
        };
    }
    
    async runComparison() {
        if (this.targetMode) {
            await this.runTargetModeComparison();
        } else {
            await this.runNormalComparison();
        }
    }
    
    async runNormalComparison() {
        console.log('🚀 Lancement de la comparaison multi-villes...');
        
        const btnLaunch = document.getElementById('btn-launch-comparison');
        if (btnLaunch) {
            btnLaunch.disabled = true;
            btnLaunch.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcul en cours...';
        }
        
        try {
            const results = [];
            const pieceType = document.getElementById('comparison-piece-type')?.value || 'T3';
            const params = this.collectCurrentParams();
            
            // Vérifier que le simulateur existe
            if (!this.simulateur) {
                console.error('❌ Simulateur non initialisé');
                throw new Error('Simulateur non disponible');
            }
            
            // Charger les paramètres dans le simulateur
            this.simulateur.chargerParametres(params);
            
            console.log('📊 Paramètres chargés:', params);
            console.log('🏙️ Villes à comparer:', this.selectedCities.size);
            console.log('🎯 Mode objectif cash-flow:', this.targetMode ? 'Activé' : 'Désactivé (privilégie le loyer net)');
            
            for (const [nom, ville] of this.selectedCities) {
                const types = pieceType === 'all' ? Object.keys(ville.pieces) : [pieceType];
                
                for (const type of types) {
                    if (!ville.pieces[type]) continue;
                    
                    try {
                        const result = await this.simulateForCity(ville, type);
                        if (result) {
                            results.push({
                                ville: nom,
                                type: type,
                                departement: ville.departement,
                                ...result
                            });
                        }
                    } catch (err) {
                        console.error(`Erreur simulation ${nom} ${type}:`, err);
                    }
                }
            }
            
            // Tri selon le mode choisi
            const optimiseCashFlow = document.getElementById('target-mode-toggle')?.checked ?? false;
            results.sort((a, b) => 
                optimiseCashFlow ? b.cashFlow - a.cashFlow 
                                 : b.loyerNetMensuel - a.loyerNetMensuel
            );
            
            console.log('✅ Résultats obtenus:', results.length);
            console.log('📊 Critère de tri:', optimiseCashFlow ? 'Cash-flow' : 'Loyer net');
            
            // Afficher les résultats
            this.displayResults(results);
            
        } catch (error) {
            console.error('❌ Erreur lors de la comparaison:', error);
            const container = document.getElementById('comparison-results-container') || this.createResultsContainer();
            container.innerHTML = `
                <div class="comparison-results">
                    <div class="info-message" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);">
                        <div class="text-lg text-red-400 mr-3">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div>
                            <h4 class="font-medium mb-1">Erreur lors de la simulation</h4>
                            <p class="text-sm opacity-90">${error.message || 'Une erreur inattendue s\'est produite'}</p>
                        </div>
                    </div>
                </div>
            `;
        } finally {
            if (btnLaunch) {
                btnLaunch.disabled = false;
                btnLaunch.innerHTML = '<i class="fas fa-rocket"></i> Lancer la comparaison';
            }
        }
    }
    
    async runTargetModeComparison() {
        console.log('🎯 Mode objectif cash-flow activé');
        
        const btnLaunch = document.getElementById('btn-launch-comparison');
        if (btnLaunch) {
            btnLaunch.disabled = true;
            btnLaunch.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcul en cours...';
        }
        
        try {
            const results = [];
            const targetPerProperty = this.targetCashflow / this.numberOfProperties;
            const params = this.collectCurrentParams();
            const pieceType = document.getElementById('comparison-piece-type')?.value || 'T3';
            
            this.simulateur.chargerParametres(params);
            
            for (const [nom, ville] of this.selectedCities) {
                const types = pieceType === 'all' ? Object.keys(ville.pieces) : [pieceType];
                
                for (const type of types) {
                    if (!ville.pieces[type]) continue;
                    
                    const result = await this.calculateOptimalInvestment(ville, type, ville.pieces[type], targetPerProperty);
                    if (result) {
                        results.push(result);
                    }
                }
            }
            
            // Trier par apport nécessaire
            results.sort((a, b) => a.apportTotal - b.apportTotal);
            
            this.displayTargetResults(results);
            
        } finally {
            if (btnLaunch) {
                btnLaunch.disabled = false;
                btnLaunch.innerHTML = '<i class="fas fa-bullseye"></i> Calculer investissement nécessaire';
            }
        }
    }
    
    async calculateOptimalInvestment(ville, type, pieceData, targetCashflow) {
        const originalPrixM2 = this.simulateur.params.communs.prixM2;
        const originalLoyerM2 = this.simulateur.params.communs.loyerM2;
        
        this.simulateur.params.communs.prixM2 = pieceData.prix_m2;
        this.simulateur.params.communs.loyerM2 = pieceData.loyer_m2;
        
        try {
            // Utiliser la nouvelle méthode chercheSurfaceObjectifCashflow pour les deux modes
            const resultClassique = this.simulateur.chercheSurfaceObjectifCashflow('classique', targetCashflow);
            const resultEncheres = this.simulateur.chercheSurfaceObjectifCashflow('encheres', targetCashflow);
            
            // Déterminer le meilleur mode et résultat
            let bestResult = null;
            let mode = '';
            
            if (!resultClassique && !resultEncheres) {
                return null; // Aucune solution trouvée
            }
            
            if (!resultClassique) {
                bestResult = resultEncheres;
                mode = 'encheres';
            } else if (!resultEncheres) {
                bestResult = resultClassique;
                mode = 'classique';
            } else {
                // Comparer les cash-flows (ils devraient être proches du target)
                // On choisit celui avec le meilleur rendement ou la plus petite surface
                if (resultEncheres.rendementNet > resultClassique.rendementNet) {
                    bestResult = resultEncheres;
                    mode = 'encheres';
                } else {
                    bestResult = resultClassique;
                    mode = 'classique';
                }
            }
            
            if (!bestResult) return null;
            
            // Construire le résultat formaté
            return {
                ville: ville.nom,
                departement: ville.departement,
                type: type,
                mode: mode,
                surface: Math.round(bestResult.surface),
                prixAchat: bestResult.prixAchat,
                coutTotal: bestResult.coutTotal,
                apportNecessaire: bestResult.coutTotal * 0.1,
                apportTotal: bestResult.coutTotal * 0.1 * this.numberOfProperties,
                mensualite: bestResult.mensualite,
                loyerNet: bestResult.loyerNet,
                cashFlow: bestResult.cashFlow,
                rendement: bestResult.rendementNet
            };
            
        } finally {
            this.simulateur.params.communs.prixM2 = originalPrixM2;
            this.simulateur.params.communs.loyerM2 = originalLoyerM2;
        }
    }
    
    displayTargetResults(results) {
        const container = document.getElementById('comparison-results-container') || this.createResultsContainer();
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="comparison-results">
                    <div class="info-message">
                        <i class="fas fa-exclamation-circle text-yellow-400 mr-3"></i>
                        <div>
                            <h4>Aucune solution trouvée</h4>
                            <p class="text-sm opacity-90">L'objectif de ${this.targetCashflow}€/mois ne peut être atteint avec les villes sélectionnées.</p>
                        </div>
                    </div>
                </div>
            `;
            container.style.display = 'block';
            return;
        }
        
        container.innerHTML = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-bullseye"></i>
                    </div>
                    <h2 class="card-title">Investissement nécessaire pour ${this.targetCashflow}€/mois</h2>
                </div>
                
                <div class="comparison-results">
                    <div class="mb-4 text-center">
                        <span class="badge badge-primary">Stratégie : ${this.numberOfProperties} bien${this.numberOfProperties > 1 ? 's' : ''}</span>
                        <span class="ml-2 text-sm opacity-70">Objectif par bien : ${Math.round(this.targetCashflow / this.numberOfProperties)}€/mois</span>
                    </div>
                    
                    <div class="city-results-grid">
                        ${results.slice(0, 3).map((r, i) => `
                            <div class="result-card ${i === 0 ? 'winner' : ''} fade-in-up" style="animation-delay: ${i * 0.1}s;">
                                <h4>
                                    <i class="fas fa-map-marker-alt"></i>
                                    ${r.ville} - ${r.type}
                                </h4>
                                <p class="text-sm opacity-70 mb-2">Département ${r.departement}</p>
                                
                                <span class="badge ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}">
                                    ${r.mode === 'encheres' ? '⚖️ Enchères' : '🏠 Classique'}
                                </span>
                                
                                <div class="stats-grid mt-3">
                                    <div class="stat-item">
                                        <p class="stat-value">${this.formatMontant(r.apportTotal)}</p>
                                        <p class="stat-label">Apport total</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value">${r.surface * this.numberOfProperties}m²</p>
                                        <p class="stat-label">Surface totale</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value">+${Math.round(r.cashFlow)}€</p>
                                        <p class="stat-label">Cash-flow/bien</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value">${r.rendement.toFixed(1)}%</p>
                                        <p class="stat-label">Rendement</p>
                                    </div>
                                </div>
                                
                                <details class="mt-3">
                                    <summary class="cursor-pointer text-primary-color text-sm">
                                        <i class="fas fa-info-circle mr-1"></i>Détails par bien
                                    </summary>
                                    <div class="mt-2 p-2 bg-black/30 rounded text-sm">
                                        <div>Surface : ${r.surface}m²</div>
                                        <div>Prix : ${this.formatMontant(r.prixAchat)}</div>
                                        <div>Apport : ${this.formatMontant(r.apportNecessaire)}</div>
                                        <div>Mensualité : ${this.formatMontant(r.mensualite)}</div>
                                    </div>
                                </details>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${results.length > 3 ? `
                        <details class="mt-4">
                            <summary class="cursor-pointer text-primary-color">
                                <i class="fas fa-chevron-down mr-2"></i>Voir toutes les options
                            </summary>
                            <table class="comparison-table mt-2">
                                <thead>
                                    <tr>
                                        <th>Ville</th>
                                        <th>Type</th>
                                        <th>Apport total</th>
                                        <th>Surface/bien</th>
                                        <th>Cash-flow</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${results.slice(3).map(r => `
                                        <tr>
                                            <td>${r.ville}</td>
                                            <td>${r.type}</td>
                                            <td>${this.formatMontant(r.apportTotal)}</td>
                                            <td>${r.surface}m²</td>
                                            <td class="text-green-400">+${Math.round(r.cashFlow)}€</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
        
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    createResultsContainer() {
        // Vérifier si le conteneur existe déjà
        let container = document.getElementById('comparison-results-container');
        if (container) return container;
        
        // Créer le conteneur juste après le panel de comparaison
        container = document.createElement('div');
        container.id = 'comparison-results-container';
        container.className = 'mt-4';
        
        // L'insérer après le panel de comparaison
        const panel = document.getElementById('city-comparison-panel');
        if (panel && panel.parentNode) {
            panel.parentNode.insertBefore(container, panel.nextSibling);
        } else {
            // Fallback si le panel n'est pas trouvé
            const parent = document.querySelector('.container');
            if (parent) parent.appendChild(container);
        }
        
        return container;
    }
    
    /**
     * MODIFICATION PRINCIPALE: Choix du critère selon le mode
     */
    async simulateForCity(ville, type) {
        const pieceData = ville.pieces[type];
        if (!pieceData) return null;
        
        // Sauvegarder les paramètres actuels
        const originalPrixM2 = this.simulateur.params.communs.prixM2;
        const originalLoyerM2 = this.simulateur.params.communs.loyerM2;
        
        // Mettre à jour avec les données de la ville
        this.simulateur.params.communs.prixM2 = pieceData.prix_m2;
        this.simulateur.params.communs.loyerM2 = pieceData.loyer_m2;
        
        try {
            // Déterminer le critère de sélection
            const optimiseCashFlow = document.getElementById('target-mode-toggle')?.checked ?? false;
            
            // Simuler pour les deux modes
            const classique = this.simulateur.chercheSurfaceDesc('classique');
            const encheres = this.simulateur.chercheSurfaceDesc('encheres');
            
            // Afficher les détails de debug
            console.log(`📊 ${ville.nom} - ${type}:`);
            console.log(`  Prix/m²: ${pieceData.prix_m2}€, Loyer/m²: ${pieceData.loyer_m2}€`);
            console.log(`  Classique: ${classique ? `surface=${classique.surface.toFixed(1)}m², loyer=${classique.loyerNet.toFixed(0)}€, cashFlow=${classique.cashFlow.toFixed(0)}€` : 'Aucune solution'}`);
            console.log(`  Enchères: ${encheres ? `surface=${encheres.surface.toFixed(1)}m², loyer=${encheres.loyerNet.toFixed(0)}€, cashFlow=${encheres.cashFlow.toFixed(0)}€` : 'Aucune solution'}`);
            console.log(`  Critère: ${optimiseCashFlow ? 'Cash-flow' : 'Loyer net'}`);
            
            // Sélection du meilleur selon le critère
            let best = null;
            let mode = '';
            
            if (!classique && !encheres) {
                console.warn(`⚠️ Aucune solution viable pour ${ville.nom} ${type}`);
                return null;
            }
            
            if (!classique) {
                best = encheres;
                mode = 'encheres';
            } else if (!encheres) {
                best = classique;
                mode = 'classique';
            } else {
                // MODIFICATION: Choix selon le critère
                if (optimiseCashFlow) {
                    // Mode cash-flow : on garde le meilleur cash-flow
                    if (encheres.cashFlow > classique.cashFlow) {
                        best = encheres;
                        mode = 'encheres';
                    } else {
                        best = classique;
                        mode = 'classique';
                    }
                    console.log(`  ✅ Sélectionné (cash-flow): ${mode} avec ${best.cashFlow.toFixed(0)}€/mois`);
                } else {
                    // Mode loyer : on garde le meilleur loyer net
                    if (encheres.loyerNet > classique.loyerNet) {
                        best = encheres;
                        mode = 'encheres';
                    } else {
                        best = classique;
                        mode = 'classique';
                    }
                    console.log(`  ✅ Sélectionné (loyer): ${mode} avec ${best.loyerNet.toFixed(0)}€/mois`);
                }
            }
            
            if (!best) return null;
            
            return {
                mode: mode,
                surface: best.surface,
                prixAchat: best.prixAchat,
                loyerNetMensuel: best.loyerNet,
                loyerNetAnnuel: best.loyerNet * 12,
                cashFlow: best.cashFlow,
                cashFlowAnnuel: best.cashFlow * 12,
                rendement: best.rendementNet,
                prixM2: pieceData.prix_m2,
                loyerM2: pieceData.loyer_m2,
                mensualite: best.mensualite,
                coutTotal: best.coutTotal
            };
            
        } finally {
            // Restaurer les paramètres originaux
            this.simulateur.params.communs.prixM2 = originalPrixM2;
            this.simulateur.params.communs.loyerM2 = originalLoyerM2;
        }
    }
    
    displayResults(results) {
        const container = document.getElementById('comparison-results-container') || this.createResultsContainer();
        
        if (!results || results.length === 0) {
            container.innerHTML = `
                <div class="comparison-results">
                    <button class="close-panel" onclick="document.getElementById('comparison-results-container').innerHTML = ''; document.getElementById('comparison-results-container').style.display = 'none';" style="position: absolute; top: 1rem; right: 1rem;">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="info-message">
                        <div class="text-lg text-yellow-400 mr-3">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                        <div>
                            <h4 class="font-medium mb-1">Aucun résultat trouvé</h4>
                            <p class="text-sm opacity-90">Vérifiez vos paramètres ou essayez d'autres villes.</p>
                        </div>
                    </div>
                </div>
            `;
            container.style.display = 'block';
            return;
        }
        
        const top3 = results.slice(0, 3);
        const optimiseCashFlow = document.getElementById('target-mode-toggle')?.checked ?? false;
        
        container.innerHTML = `
            <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all" style="position: relative;">
                <button class="close-panel" onclick="document.getElementById('comparison-results-container').innerHTML = ''; document.getElementById('comparison-results-container').style.display = 'none';">
                    <i class="fas fa-times"></i>
                </button>
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <h2 class="card-title">Résultats de la comparaison</h2>
                </div>
                
                <div class="comparison-results">
                    <h3 style="text-align: center; margin-bottom: 1rem;">
                        🏆 Top 3 des meilleures opportunités
                    </h3>
                    <p style="text-align: center; margin-bottom: 2rem; color: var(--text-muted);">
                        <i class="fas fa-info-circle mr-1"></i>
                        Classement par : <strong>${optimiseCashFlow ? 'Cash-flow mensuel' : 'Loyer net mensuel'}</strong>
                    </p>
                    
                    <div class="city-results-grid">
                        ${top3.map((r, i) => `
                            <div class="result-card ${i === 0 ? 'winner' : ''} fade-in-up" style="animation-delay: ${i * 0.1}s;">
                                <h4>
                                    <i class="fas fa-map-marker-alt"></i>
                                    ${r.ville} - ${r.type}
                                </h4>
                                <p class="text-sm" style="color: var(--text-muted); margin-bottom: 1rem;">
                                    Département ${r.departement}
                                </p>
                                
                                <span class="badge ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}">
                                    ${r.mode === 'encheres' ? '⚖️ Enchères' : '🏠 Classique'}
                                </span>
                                
                                <div class="stats-grid">
                                    <div class="stat-item ${!optimiseCashFlow ? 'highlight' : ''}">
                                        <p class="stat-value">${Math.round(r.loyerNetMensuel)}€</p>
                                        <p class="stat-label">Loyer net/mois</p>
                                    </div>
                                    <div class="stat-item ${optimiseCashFlow ? 'highlight' : ''} ${r.cashFlow >= 0 ? 'positive' : 'negative'}">
                                        <p class="stat-value">
                                            ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
                                        </p>
                                        <p class="stat-label">Cash-flow</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value">${r.surface.toFixed(0)}m²</p>
                                        <p class="stat-label">Surface</p>
                                    </div>
                                    <div class="stat-item">
                                        <p class="stat-value">${r.rendement.toFixed(2)}%</p>
                                        <p class="stat-label">Rendement</p>
                                    </div>
                                </div>
                                
                                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                    <div style="display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--text-muted);">
                                        <span>Prix: ${(r.prixAchat/1000).toFixed(0)}k€</span>
                                        <span>${r.prixM2}€/m²</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${results.length > 3 ? `
                        <div class="comparison-summary-table" style="margin-top: 2rem;">
                            <details>
                                <summary style="cursor: pointer; color: var(--primary-color); margin-bottom: 1rem;">
                                    <i class="fas fa-chevron-down mr-2"></i>
                                    Voir tous les résultats (${results.length} simulations)
                                </summary>
                                <table class="comparison-table">
                                    <thead>
                                        <tr>
                                            <th>Ville</th>
                                            <th>Type</th>
                                            <th>Mode</th>
                                            <th ${!optimiseCashFlow ? 'class="highlight"' : ''}>Loyer net/mois</th>
                                            <th ${optimiseCashFlow ? 'class="highlight"' : ''}>Cash-flow</th>
                                            <th>Rendement</th>
                                            <th>Prix</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${results.slice(3).map((r, idx) => `
                                            <tr>
                                                <td class="city-name-cell">${r.ville}</td>
                                                <td>${r.type}</td>
                                                <td>
                                                    <span class="badge ${r.mode === 'encheres' ? 'badge-accent' : 'badge-primary'}" style="font-size: 0.75rem;">
                                                        ${r.mode === 'encheres' ? 'Enchères' : 'Classique'}
                                                    </span>
                                                </td>
                                                <td style="text-align: right; font-weight: 600;" ${!optimiseCashFlow ? 'class="highlight"' : ''}>${Math.round(r.loyerNetMensuel)}€</td>
                                                <td style="text-align: right; font-weight: 600;" class="${r.cashFlow >= 0 ? 'positive' : 'negative'} ${optimiseCashFlow ? 'highlight' : ''}">
                                                    ${r.cashFlow >= 0 ? '+' : ''}${Math.round(r.cashFlow)}€
                                                </td>
                                                <td style="text-align: right;">${r.rendement.toFixed(2)}%</td>
                                                <td style="text-align: right;">${(r.prixAchat/1000).toFixed(0)}k€</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </details>
                        </div>
                    ` : ''}
                    
                    <div class="info-message" style="margin-top: 2rem;">
                        <div class="text-lg text-blue-400 mr-3">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <div>
                            <h4 class="font-medium mb-1">Paramètres utilisés</h4>
                            <p class="text-sm opacity-90">
                                Apport: ${this.formatMontant(this.simulateur.params.base.apport)} • 
                                Taux: ${this.simulateur.params.base.taux}% • 
                                Durée: ${this.simulateur.params.base.duree} ans • 
                                Mode: ${this.simulateur.params.base.calculationMode === 'cashflow-positif' ? 'Cash-flow positif' : 'Loyer ≥ Mensualité'}
                            </p>
                            <p class="text-sm opacity-70 mt-1">
                                <i class="fas fa-filter mr-1"></i>
                                Critère de sélection : <strong>${optimiseCashFlow ? 'Cash-flow maximal' : 'Loyer net maximal'}</strong>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter un peu de CSS pour le highlight
        const style = document.createElement('style');
        style.textContent = `
            .stat-item.highlight {
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 8px;
            }
            th.highlight, td.highlight {
                background: rgba(59, 130, 246, 0.1) !important;
            }
        `;
        if (!document.head.querySelector('#comparison-highlight-style')) {
            style.id = 'comparison-highlight-style';
            document.head.appendChild(style);
        }
        
        container.style.display = 'block';
        
        // Scroll vers les résultats (avec un petit décalage)
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }, 100);
    }
    
    formatMontant(montant) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(montant);
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que le simulateur soit chargé
    const initComparator = () => {
        if (window.SimulateurImmo) {
            // Créer une instance du simulateur si elle n'existe pas
            if (!window.simulateur) {
                window.simulateur = new window.SimulateurImmo();
                console.log('✅ Instance SimulateurImmo créée');
            }
            
            window.cityComparator = new CityComparator(window.simulateur);
            console.log('✅ Comparateur multi-villes initialisé');
        } else {
            // Réessayer après un court délai
            setTimeout(initComparator, 500);
        }
    };
    
    initComparator();
});
