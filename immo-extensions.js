/**
 * immo-extensions.js - Extensions pour le simulateur d'investissement immobilier
 * 
 * Ce script contient toutes les améliorations pour le simulateur :
 * 1. Optimisation de l'algorithme de recherche
 * 2. Calculs fiscaux avancés
 * 3. Scénarios de sortie/revente
 * 4. Améliorations d'interface utilisateur
 * 
 * Version 1.0 - Mai 2025
 */

// Module principal d'extensions pour le simulateur immobilier
const ImmoExtensions = (function() {
    // Référence au simulateur principal
    let simulateur = null;

    // Configuration des seuils pour les indicateurs visuels
    const SEUILS = {
        rentabilite: {
            bon: 7,    // >7% = bon
            moyen: 4    // 4-7% = moyen, <4% = mauvais
        },
        cashflow: {
            bon: 200,   // >200€ = bon
            moyen: 50    // 50-200€ = moyen, <50€ = mauvais
        }
    };

    // Initialisation du module
    function initialiser(simulateurInstance) {
        console.log("Initialisation des extensions du simulateur immobilier");
        simulateur = simulateurInstance;

        // Initialiser le régime fiscal par défaut s'il n'existe pas
        if (!simulateur.params.fiscalite.regimeFiscal) {
            simulateur.params.fiscalite.regimeFiscal = 'micro-foncier';
        }

        // Étendre le simulateur avec les nouvelles méthodes
        etendreSimulateur();
        
        // Ajouter les styles CSS nécessaires
        ajouterStyles();
        
        // Ajouter les éléments d'interface
        ajouterElementsInterface();
        
        // Ajouter les écouteurs d'événements
        ajouterEcouteursEvenements();
        
        // Étendre la fonction d'affichage des résultats
        etendreAffichageResultats();
        
        console.log("Extensions du simulateur initialisées avec succès");
        return true;
    }

    // Étend le simulateur avec de nouvelles méthodes
    function etendreSimulateur() {
        if (!simulateur) return;

        // 1. Optimisation de l'algorithme de recherche
        SimulateurImmo.prototype.chercheSurfaceOptimisee = function(mode) {
            let min = this.params.base.surfaceMin || this.defaults.surfaceMin;
            let max = this.params.base.surfaceMax || this.defaults.surfaceMax;
            const precision = 0.1; // Précision en m²
            
            // Vérifier les cas limites
            if (!this.calculerViabilite(min, mode)) {
                return null; // Même la surface minimale n'est pas viable
            }
            
            // Si la surface maximale est viable, pas besoin de recherche
            if (this.calculerViabilite(max, mode)) {
                return this.calculeTout(max, mode);
            }
            
            // Recherche dichotomique
            while (max - min > precision) {
                const mid = (min + max) / 2;
                if (this.calculerViabilite(mid, mode)) {
                    min = mid; // La solution est dans la moitié supérieure
                } else {
                    max = mid; // La solution est dans la moitié inférieure
                }
            }
            
            return this.calculeTout(min, mode);
        };

        // Remplacer la méthode simuler pour utiliser l'algorithme optimisé
        const simulerOriginal = simulateur.simuler;
        simulateur.simuler = function() {
            // Utiliser chercheSurfaceOptimisee au lieu de chercheSurfaceDesc
            const resultatsClassique = this.chercheSurfaceOptimisee('classique');
            const resultatsEncheres = this.chercheSurfaceOptimisee('encheres');
            
            // Stocker les résultats
            this.params.resultats.classique = resultatsClassique;
            this.params.resultats.encheres = resultatsEncheres;
            
            return {
                classique: resultatsClassique,
                encheres: resultatsEncheres
            };
        };

        // 2. Calculs fiscaux avancés
        SimulateurImmo.prototype.calculerImpactFiscalAvecRegime = function(revenuFoncier, interetsEmprunt, charges, regimeFiscal) {
            // S'assurer que toutes les valeurs sont des nombres valides
            revenuFoncier = Number(revenuFoncier) || 0;
            interetsEmprunt = Number(interetsEmprunt) || 0;
            charges = Number(charges) || 0;
            
            // Logging pour débogage
            console.log("Calcul fiscal:", {
                revenuFoncier, 
                interetsEmprunt, 
                charges, 
                regimeFiscal
            });
            
            let revenusImposables = 0;
            let abattement = 0;
            let chargesDeduites = 0;
            let amortissement = 0;
            
            switch(regimeFiscal) {
                case 'micro-foncier':
                    // Abattement forfaitaire de 30%
                    abattement = revenuFoncier * 0.3;
                    revenusImposables = Math.max(0, revenuFoncier - abattement);
                    break;
                    
                case 'reel-foncier':
                    // Déduction des intérêts et charges réelles
                    chargesDeduites = interetsEmprunt + charges;
                    revenusImposables = Math.max(0, revenuFoncier - chargesDeduites);
                    break;
                    
                case 'lmnp-micro':
                    // Abattement forfaitaire de 50%
                    abattement = revenuFoncier * 0.5;
                    revenusImposables = Math.max(0, revenuFoncier - abattement);
                    break;
                    
                case 'lmnp-reel':
                    // Déduction des charges et amortissements
                    try {
                        amortissement = this.calculerAmortissementAnnuel(regimeFiscal);
                    } catch (e) {
                        console.warn("Erreur dans le calcul d'amortissement:", e);
                        amortissement = 0;
                    }
                    chargesDeduites = interetsEmprunt + charges + amortissement;
                    revenusImposables = Math.max(0, revenuFoncier - chargesDeduites);
                    break;
                    
                default:
                    // Micro-foncier par défaut
                    abattement = revenuFoncier * 0.3;
                    revenusImposables = Math.max(0, revenuFoncier - abattement);
            }
            
            const impot = this.calculerImpot(revenusImposables);
            
            // Log du résultat
            console.log("Résultat fiscal:", {
                revenuFoncier,
                abattement,
                chargesDeduites,
                amortissement,
                revenusImposables,
                impot
            });
            
            return {
                revenuFoncier,
                abattement,
                chargesDeduites,
                amortissement,
                revenusImposables,
                impot,
                revenuNet: revenuFoncier - impot
            };
        };

        SimulateurImmo.prototype.calculerImpot = function(revenuImposable) {
            if (revenuImposable <= 0) return 0;
            
            const tauxMarginal = this.params.fiscalite.tauxMarginalImpot / 100;
            const tauxPS = this.params.fiscalite.tauxPrelevementsSociaux / 100;
            
            return revenuImposable * (tauxMarginal + tauxPS);
        };

        SimulateurImmo.prototype.calculerAmortissementAnnuel = function(regime) {
            if (regime !== 'lmnp-reel') return 0;
            
            const modeActuel = this.modeActuel || 'classique';
            
            // Vérifier que les résultats existent
            if (!this.params.resultats || !this.params.resultats[modeActuel]) {
                return 0;
            }
            
            const prixAchat = this.params.resultats[modeActuel].prixAchat || 0;
            const partTerrain = 0.15; // 15% pour le terrain (non amortissable)
            const partConstruction = 1 - partTerrain;
            const tauxAmortissement = 0.025; // 2.5% par an (40 ans)
            
            return prixAchat * partConstruction * tauxAmortissement;
        };

        // NOUVEAU: Connecter les calculs fiscaux avec le régime sélectionné
        const originalCalculeTout = SimulateurImmo.prototype.calculeTout;
        SimulateurImmo.prototype.calculeTout = function(surface, mode) {
            // Appeler la fonction originale d'abord
            const res = originalCalculeTout.call(this, surface, mode);
            
            // Mémoriser le mode actuel pour d'autres calculs
            this.modeActuel = mode;

            try {
                // Afficher le résultat original pour débogage
                console.log(`Résultat original (${mode}):`, {
                    loyerBrut: res.loyerBrut,
                    loyerNet: res.loyerNet,
                    loyerApresVacance: res.loyerApresVacance,
                    loyerM2: res.loyerM2,
                    surface: res.surface,
                    cashFlow: res.cashFlow
                });
                
                // Recalculer l'impact fiscal avec le régime choisi
                const regime = this.params.fiscalite.regimeFiscal || 'micro-foncier';
                
                // Calcul des charges déductibles annuelles
                const charges = (res.taxeFonciere || 0) + 
                            (res.assurancePNO || 0) + 
                            (res.chargesNonRecuperables || 0) + 
                            (res.entretienAnnuel || 0);
                
                // CORRECTION MAJEURE ICI: le revenu foncier est le loyer BRUT ANNUEL, pas les loyers nets
                // C'est le loyer total AVANT déduction de la vacance et des charges
                // Le simulateur l'a déjà calculé: c'est loyerBrut annualisé
                const revenuAnnuel = (res.loyerBrut || 0) * 12;
                
                // Intérêts d'emprunt de la première année
                const interets = res.interetsAnnee1 || 0;
                
                const fiscal = this.calculerImpactFiscalAvecRegime(
                    revenuAnnuel,     // Revenus bruts AVANT vacance
                    interets,         // Intérêts de la première année
                    charges,          // Charges déductibles
                    regime            // Régime fiscal sélectionné
                );

                // Remplacer l'impact fiscal calculé (positif = économie, négatif = impôt à payer)
                res.impactFiscal = -fiscal.impot; // Inverser le signe pour cohérence avec le reste du code
                
                // Recalculer la rentabilité nette
                res.rendementNet = this.calculerRendementNet(
                    revenuAnnuel,
                    charges,
                    res.impactFiscal,
                    res.coutTotal || 1 // Éviter division par zéro
                );

                // Stocker les détails pour l'affichage
                res.fiscalDetail = fiscal;
                
                // Vérifier que le cashflow est calculé correctement
                if (typeof res.cashFlow !== 'number') {
                    console.warn("CashFlow invalide:", res.cashFlow);
                    res.cashFlow = 0;
                }
                
                // Log des résultats fiscaux finaux
                console.log(`Résultats fiscaux (${mode}):`, {
                    revenuFoncier: fiscal.revenuFoncier,
                    revenusImposables: fiscal.revenusImposables,
                    impot: fiscal.impot,
                    impactFiscal: res.impactFiscal,
                    cashFlow: res.cashFlow,
                    cashFlowApresImpot: res.cashFlow + (res.impactFiscal / 12)
                });
                
            } catch (e) {
                console.error("Erreur dans le calcul fiscal:", e);
                // En cas d'erreur, on crée un objet fiscal par défaut
                res.fiscalDetail = {
                    revenuFoncier: (res.loyerBrut || 0) * 12,
                    revenusImposables: 0,
                    impot: 0
                };
                res.impactFiscal = 0;
            }
            
            return res;
        };

        // 3. Scénarios de sortie/revente
        SimulateurImmo.prototype.calculerScenarioRevente = function(investissement, nbAnnees, tauxAppreciationAnnuel) {
            const prixAchat = investissement.prixAchat || 0;
            const fraisAcquisition = (investissement.coutTotal || 0) - prixAchat;
            const cashFlowAnnuel = (investissement.cashFlow || 0) * 12;
            
            // Calcul de la valeur future
            const facteurAppreciation = Math.pow(1 + tauxAppreciationAnnuel/100, nbAnnees);
            const valeurRevente = prixAchat * facteurAppreciation;
            
            // Coûts de revente (7% en moyenne)
            const tauxFraisRevente = 7;
            const fraisRevente = valeurRevente * (tauxFraisRevente/100);
            
            // Plus-value brute
            const plusValueBrute = valeurRevente - prixAchat;
            
            // Calcul de la fiscalité sur plus-value
            // Abattement pour durée de détention (IR: 6% par an de la 6e à la 21e année, exonération après 22 ans)
            // (PS: 1.65% par an de la 6e à la 21e, puis 9% par an, exonération après 30 ans)
            let abattementIR = 0;
            let abattementPS = 0;
            
            if (nbAnnees >= 6) {
                // IR
                if (nbAnnees >= 22) {
                    abattementIR = 100;
                } else {
                    abattementIR = Math.min((nbAnnees - 5) * 6, 96);
                }
                
                // PS
                if (nbAnnees >= 30) {
                    abattementPS = 100;
                } else if (nbAnnees >= 22) {
                    abattementPS = 34 + (nbAnnees - 21) * 9;
                } else {
                    abattementPS = Math.min((nbAnnees - 5) * 1.65, 26.4);
                }
            }
            
            // Calcul de l'impôt sur la plus-value
            const plusValueImposableIR = plusValueBrute * (1 - abattementIR/100);
            const plusValueImposablePS = plusValueBrute * (1 - abattementPS/100);
            
            const tauxIR = 19; // Taux fixe d'imposition sur les plus-values immobilières
            const tauxPS = this.params.fiscalite.tauxPrelevementsSociaux || 17.2;
            
            const impotPlusValueIR = plusValueImposableIR * (tauxIR/100);
            const impotPlusValuePS = plusValueImposablePS * (tauxPS/100);
            const impotPlusValueTotal = impotPlusValueIR + impotPlusValuePS;
            
            // Résultat net après impôt
            const resultatNetApresImpot = valeurRevente - fraisRevente - impotPlusValueTotal - (investissement.coutTotal || 0);
            
            // Calcul du TRI (approximation)
            const fluxTresorerie = [-(investissement.coutTotal || 0)];
            
            // Flux annuels
            for (let i = 1; i < nbAnnees; i++) {
                fluxTresorerie.push(cashFlowAnnuel);
            }
            
            // Dernier flux inclut la revente
            fluxTresorerie.push(cashFlowAnnuel + valeurRevente - fraisRevente - impotPlusValueTotal);
            
            // Calcul simplifié du TRI
            let tri;
            try {
                tri = calculTRIApproximation(fluxTresorerie);
            } catch (e) {
                console.error("Erreur dans le calcul du TRI:", e);
                tri = 0;
            }
            
            const multipleInvestissement = investissement.coutTotal !== 0 ? 
                resultatNetApresImpot / investissement.coutTotal : 0;
            
            return {
                prixAchat,
                valeurRevente,
                plusValueBrute,
                fraisRevente,
                impotPlusValue: {
                    ir: impotPlusValueIR,
                    ps: impotPlusValuePS,
                    total: impotPlusValueTotal
                },
                abattements: {
                    ir: abattementIR,
                    ps: abattementPS
                },
                resultatNet: resultatNetApresImpot,
                tri: tri * 100, // En pourcentage
                multipleInvestissement: multipleInvestissement,
                fluxTresorerie: fluxTresorerie
            };
        };
    }

    // Fonction utilitaire pour calculer le TRI
    function calculTRIApproximation(flux) {
        let guess = 0.1; // Estimation initiale à 10%
        const precision = 0.0001;
        const maxIterations = 100;
        
        for (let i = 0; i < maxIterations; i++) {
            let npv = 0;
            let derivee = 0;
            
            for (let j = 0; j < flux.length; j++) {
                npv += flux[j] / Math.pow(1 + guess, j);
                derivee -= j * flux[j] / Math.pow(1 + guess, j + 1);
            }
            
            if (Math.abs(npv) < precision) {
                return guess;
            }
            
            // Protection contre division par zéro
            if (derivee === 0) return guess;
            
            // Mise à jour de l'estimation (méthode de Newton)
            guess = guess - npv / derivee;
            
            // Vérification que guess reste dans des limites raisonnables
            if (guess < -0.99) guess = -0.99;
            if (guess > 100) guess = 100;
        }
        
        return guess; // Retourner la meilleure approximation trouvée
    }

    // Ajoute les styles CSS nécessaires
    function ajouterStyles() {
        const styles = `
            /* Styles pour les indicateurs visuels */
            .indicateur-bon {
                background-color: rgba(16, 185, 129, 0.2);
                color: #10B981;
                border: 1px solid rgba(16, 185, 129, 0.5);
                padding: 0.25rem 0.75rem;
                border-radius: 9999px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                margin-right: 0.5rem;
            }
            
            .indicateur-moyen {
                background-color: rgba(245, 158, 11, 0.2);
                color: #F59E0B;
                border: 1px solid rgba(245, 158, 11, 0.5);
                padding: 0.25rem 0.75rem;
                border-radius: 9999px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                margin-right: 0.5rem;
            }
            
            .indicateur-mauvais {
                background-color: rgba(239, 68, 68, 0.2);
                color: #EF4444;
                border: 1px solid rgba(239, 68, 68, 0.5);
                padding: 0.25rem 0.75rem;
                border-radius: 9999px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                margin-right: 0.5rem;
            }
            
            .indicateur-icon {
                margin-right: 0.5rem;
                font-size: 0.9rem;
            }
            
            /* Styles pour le récapitulatif des hypothèses */
            .recap-hypotheses {
                background-color: rgba(1, 42, 74, 0.8);
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 1.5rem;
                border: 1px solid rgba(255, 255, 255, 0.1);
                animation: fadeIn 0.5s ease-in-out;
            }
            
            .recap-hypotheses h3 {
                font-size: 1.1rem;
                margin-bottom: 0.75rem;
                color: var(--primary-color);
                display: flex;
                align-items: center;
            }
            
            .recap-hypotheses h3 i {
                margin-right: 0.5rem;
            }
            
            .recap-hypotheses-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                gap: 0.75rem;
            }
            
            .recap-item {
                background: rgba(255, 255, 255, 0.05);
                padding: 0.5rem 0.75rem;
                border-radius: 4px;
                font-size: 0.9rem;
                display: flex;
                flex-direction: column;
            }
            
            .recap-label {
                font-size: 0.8rem;
                opacity: 0.7;
                margin-bottom: 0.25rem;
            }
            
            .recap-value {
                font-weight: 600;
            }
            
            /* Styles pour les scénarios de sortie */
            .scenario-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
                padding-bottom: 0.5rem;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .scenario-title {
                font-size: 1.2rem;
                font-weight: 600;
                color: var(--primary-color);
            }
            
            .scenario-badge {
                background-color: rgba(0, 255, 135, 0.1);
                color: var(--primary-color);
                padding: 0.25rem 0.75rem;
                border-radius: 9999px;
                font-size: 0.9rem;
                font-weight: 600;
            }
            
            /* Styles pour les onglets fiscaux */
            .fiscal-tabs {
                display: flex;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 1rem;
            }
            
            .fiscal-tab {
                padding: 0.75rem 1.25rem;
                font-size: 0.9rem;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.7);
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: all 0.2s ease;
            }
            
            .fiscal-tab.active {
                color: var(--primary-color);
                border-bottom-color: var(--primary-color);
            }
            
            .fiscal-tab:hover {
                color: var(--primary-color);
            }
            
            .fiscal-content {
                display: none;
            }
            
            .fiscal-content.active {
                display: block;
                animation: fadeIn 0.3s ease-in-out;
            }
            
            /* Styles pour la section fiscale */
            .fiscal-info {
                margin-top: 1.5rem;
                padding-top: 1rem;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .fiscal-info h4 {
                font-size: 1rem;
                font-weight: 600;
                margin-bottom: 0.75rem;
                color: var(--primary-color);
            }
            
            .fiscal-badge {
                display: inline-block;
                padding: 0.25rem 0.5rem;
                background-color: rgba(0, 255, 135, 0.1);
                color: var(--primary-color);
                border-radius: 4px;
                font-size: 0.8rem;
                font-weight: 600;
                margin-left: 0.5rem;
            }
            
            /* Ajout pour mettre en évidence les explications fiscales */
            .fiscal-explanation {
                background-color: rgba(0, 255, 135, 0.05);
                border: 1px solid rgba(0, 255, 135, 0.1);
                border-radius: 4px;
                padding: 0.5rem;
                margin-top: 0.5rem;
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.8);
            }
            
            /* Styles pour les cartes de régime fiscal */
            .regime-cards-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 1rem;
            }
            
            .regime-card {
                background-color: rgba(1, 42, 74, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 0.75rem;
                padding: 1rem;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
                outline: none;
            }
            
            .regime-card:hover {
                border-color: var(--primary-color);
                box-shadow: 0 5px 15px rgba(0, 255, 135, 0.1);
                transform: translateY(-2px);
            }
            
            .regime-card.active,
            .regime-card[aria-checked="true"] {
                border-color: var(--primary-color);
                box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.3);
                background-color: rgba(0, 255, 135, 0.1);
            }
            
            .regime-card h4 {
                font-size: 1.1rem;
                font-weight: 600;
                margin: 0.5rem 0;
            }
            
            .regime-card p {
                margin: 0;
            }
            
            .regime-badge {
                position: absolute;
                top: 0.5rem;
                right: 0.5rem;
                font-size: 0.65rem;
                font-weight: 600;
                padding: 0.15rem 0.4rem;
                border-radius: 9999px;
                background-color: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.7);
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'immo-extensions-styles';
        styleElement.innerHTML = styles;
        document.head.appendChild(styleElement);
    }

    // Ajoute les éléments d'interface nécessaires
    function ajouterElementsInterface() {
        // 1. Ajouter la sélection du régime fiscal
        ajouterSelectionRegimeFiscal();
        
        // 2. Ajouter la section pour les scénarios de sortie
        ajouterSectionScenarios();
    }

    // Ajoute le sélecteur de régime fiscal
    function ajouterSelectionRegimeFiscal() {
        // Vérifier si le conteneur approprié existe
        const advancedParams = document.getElementById('advanced-params');
        if (!advancedParams || document.getElementById('regime-fiscal-cards')) return;
        
        // Créer une nouvelle section pour le régime fiscal
        const sectionFiscale = document.createElement('div');
        sectionFiscale.className = 'card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all mt-4';
        sectionFiscale.id = 'fiscal-regime-card';
        sectionFiscale.innerHTML = `
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-file-invoice-dollar"></i>
                </div>
                <h2 class="card-title">Régime fiscal</h2>
            </div>
            
            <div class="card-body p-4">
                <p class="mb-3">Choisissez un régime fiscal pour calculer l'impact sur votre investissement:</p>
                
                <div id="regime-fiscal-cards" class="regime-cards-grid mt-3">
                    <!-- Régimes personnels -->
                    <div class="regime-card" data-regime="micro-foncier" role="radio" tabindex="0" aria-checked="true">
                        <i class="fas fa-home text-lg text-green-400"></i>
                        <h4>Micro-foncier</h4>
                        <p class="text-sm opacity-75">Abattement 30%</p>
                        <span class="regime-badge">Déclar° 2044</span>
                    </div>
                    
                    <div class="regime-card" data-regime="reel-foncier" role="radio" tabindex="0" aria-checked="false">
                        <i class="fas fa-file-invoice-dollar text-lg text-blue-400"></i>
                        <h4>Réel foncier</h4>
                        <p class="text-sm opacity-75">Charges réelles</p>
                        <span class="regime-badge">Déclar° 2044</span>
                    </div>
                    
                    <div class="regime-card" data-regime="lmnp-micro" role="radio" tabindex="0" aria-checked="false">
                        <i class="fas fa-couch text-lg text-yellow-400"></i>
                        <h4>LMNP micro-BIC</h4>
                        <p class="text-sm opacity-75">Abattement 50%</p>
                        <span class="regime-badge">Déclar° 2042-C-PRO</span>
                    </div>
                    
                    <div class="regime-card" data-regime="lmnp-reel" role="radio" tabindex="0" aria-checked="false">
                        <i class="fas fa-calculator text-lg text-purple-400"></i>
                        <h4>LMNP réel</h4>
                        <p class="text-sm opacity-75">Charges + amort.</p>
                        <span class="regime-badge">BIC</span>
                    </div>
                </div>
                
                <!-- Champ caché pour maintenir la compatibilité -->
                <select id="regime-fiscal" class="form-input hidden">
                    <option value="micro-foncier" selected>Micro-foncier (abattement 30%)</option>
                    <option value="reel-foncier">Régime réel foncier</option>
                    <option value="lmnp-micro">LMNP micro-BIC (abattement 50%)</option>
                    <option value="lmnp-reel">LMNP réel avec amortissements</option>
                </select>
            </div>
        `;
        
        // Ajouter à la suite des paramètres avancés (après le conteneur)
        advancedParams.parentNode.insertBefore(sectionFiscale, advancedParams.nextSibling);
        
        // Initialiser les écouteurs d'événements
        initialiserEvenementsRegimeCards();
    }

    // Initialise les écouteurs d'événements pour les cartes de régime fiscal
    function initialiserEvenementsRegimeCards() {
        const regimeFiscalCards = document.getElementById('regime-fiscal-cards');
        const regimeFiscalSelect = document.getElementById('regime-fiscal');
        
        if (!regimeFiscalCards || !simulateur) return;
        
        // Initialiser l'état actif selon la valeur actuelle
        if (simulateur.params.fiscalite.regimeFiscal) {
            const regimeActuel = simulateur.params.fiscalite.regimeFiscal;
            const cardActive = regimeFiscalCards.querySelector(`.regime-card[data-regime="${regimeActuel}"]`);
            if (cardActive) {
                // Désactiver toutes les cartes
                regimeFiscalCards.querySelectorAll('.regime-card').forEach(card => {
                    card.classList.remove('active');
                    card.setAttribute('aria-checked', 'false');
                });
                
                // Activer la carte sélectionnée
                cardActive.classList.add('active');
                cardActive.setAttribute('aria-checked', 'true');
            }
        }
        
        // Gérer les clics sur les cartes
        regimeFiscalCards.addEventListener('click', e => {
            const card = e.target.closest('.regime-card');
            if (!card) return;
            
            // Récupérer le régime sélectionné
            const regimeSelectionne = card.dataset.regime;
            
            // Désactiver toutes les cartes
            regimeFiscalCards.querySelectorAll('.regime-card').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-checked', 'false');
            });
            
            // Activer la carte cliquée
            card.classList.add('active');
            card.setAttribute('aria-checked', 'true');
            
            // Mettre à jour le select caché
            if (regimeFiscalSelect) {
                regimeFiscalSelect.value = regimeSelectionne;
            }
            
            // Mettre à jour le paramètre dans le simulateur
            simulateur.params.fiscalite.regimeFiscal = regimeSelectionne;
            
            // Recalculer si des résultats existent déjà
            if (simulateur.params.resultats.classique && simulateur.params.resultats.encheres) {
                // Afficher un toast pour indiquer que le calcul est en cours
                if (typeof window.afficherToast === 'function') {
                    window.afficherToast("Calcul en cours avec le nouveau régime fiscal...", 'info');
                }
                
                // Recalculer après une courte pause pour l'effet visuel
                setTimeout(() => {
                    // Recalculer avec le nouveau régime
                    simulateur.params.resultats.classique = simulateur.calculeTout(
                        simulateur.params.resultats.classique.surface, 'classique');
                    simulateur.params.resultats.encheres = simulateur.calculeTout(
                        simulateur.params.resultats.encheres.surface, 'encheres');
                    
                    // Mettre à jour l'affichage des résultats fiscaux
                    mettreAJourAffichageFiscal();
                    
                    // Mettre à jour les indicateurs
                    ajouterIndicateursVisuels(simulateur.params.resultats);
                    
                    // Afficher un message de confirmation
                    if (typeof window.afficherToast === 'function') {
                        window.afficherToast(`Régime fiscal mis à jour: ${card.querySelector('h4').textContent}`, 'success');
                    }
                }, 300);
            }
        });
        
        // Support clavier pour l'accessibilité
        regimeFiscalCards.addEventListener('keydown', e => {
            const card = e.target.closest('.regime-card');
            if (!card) return;
            
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    }

    // Ajoute la section pour les scénarios de revente
    function ajouterSectionScenarios() {
        // Vérifier si le conteneur existe et si la section n'est pas déjà présente
        const resultsContainer = document.getElementById('results');
        if (!resultsContainer || document.getElementById('scenarios-card')) return;
        
        // Créer l'élément
        const scenariosCard = document.createElement('div');
        scenariosCard.className = 'card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg transition-all mt-4';
        scenariosCard.id = 'scenarios-card';
        scenariosCard.innerHTML = `
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-chart-line"></i>
                </div>
                <h2 class="card-title">Projections de revente</h2>
            </div>
            
            <div class="grid grid-2">
                <div class="form-group">
                    <label class="form-label">Horizon de sortie</label>
                    <select id="horizon-revente" class="form-input">
                        <option value="5">5 ans</option>
                        <option value="10">10 ans</option>
                        <option value="15">15 ans</option>
                        <option value="20" selected>20 ans</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Appréciation annuelle</label>
                    <div class="form-addon">
                        <input type="number" id="appreciation-annuelle" class="form-input" value="2" step="0.1">
                        <span class="form-addon-text">%</span>
                    </div>
                </div>
            </div>
            
            <button id="btn-calculer-scenarios" class="btn btn-primary mt-4">
                <i class="fas fa-calculator"></i> Calculer les projections
            </button>
            
            <div id="resultats-scenarios" class="mt-4" style="display: none;">
                <!-- Les résultats seront affichés ici -->
            </div>
        `;
        
        // Ajouter au conteneur de résultats
        resultsContainer.appendChild(scenariosCard);
    }

    // Ajoute le récapitulatif des hypothèses
    function ajouterRecapHypotheses(resultats) {
        if (!resultats || !resultats.params) return;
        
        // Créer ou récupérer le conteneur
        let recapContainer = document.getElementById('recap-hypotheses');
        if (!recapContainer) {
            recapContainer = document.createElement('div');
            recapContainer.id = 'recap-hypotheses';
            recapContainer.className = 'recap-hypotheses';
            
            // Insérer au début des résultats
            const resultsContainer = document.getElementById('results');
            if (resultsContainer) {
                resultsContainer.insertBefore(recapContainer, resultsContainer.firstChild);
            }
        }
        
        // Récupérer le régime fiscal actuel
        const regimeFiscal = simulateur.params.fiscalite.regimeFiscal || 'micro-foncier';
        let regimeLabel = '';
        
        switch(regimeFiscal) {
            case 'micro-foncier': regimeLabel = 'Micro-foncier (abattement 30%)'; break;
            case 'reel-foncier': regimeLabel = 'Régime réel foncier'; break;
            case 'lmnp-micro': regimeLabel = 'LMNP micro-BIC (abattement 50%)'; break;
            case 'lmnp-reel': regimeLabel = 'LMNP réel avec amortissements'; break;
            default: regimeLabel = 'Micro-foncier';
        }
        
        // Remplir avec les paramètres actuels
        const params = resultats.params;
        recapContainer.innerHTML = `
            <h3><i class="fas fa-info-circle"></i> Hypothèses de la simulation</h3>
            <div class="recap-hypotheses-grid">
                <div class="recap-item">
                    <span class="recap-label">Apport</span>
                    <span class="recap-value">${formaterMontant(params.base.apport)}</span>
                </div>
                <div class="recap-item">
                    <span class="recap-label">Taux d'emprunt</span>
                    <span class="recap-value">${params.base.taux}% sur ${params.base.duree} ans</span>
                </div>
                <div class="recap-item">
                    <span class="recap-label">Prix marché</span>
                    <span class="recap-value">${params.communs.prixM2} €/m²</span>
                </div>
                <div class="recap-item">
                    <span class="recap-label">Loyer</span>
                    <span class="recap-value">${params.communs.loyerM2} €/m²/mois</span>
                </div>
                <div class="recap-item">
                    <span class="recap-label">Vacance locative</span>
                    <span class="recap-value">${params.communs.vacanceLocative}%</span>
                </div>
                <div class="recap-item">
                    <span class="recap-label">Surface max calculée</span>
                    <span class="recap-value">${resultats.classique.surface.toFixed(1)} m²</span>
                </div>
                <div class="recap-item recap-item-regime">
                    <span class="recap-label">Régime fiscal</span>
                    <span class="recap-value">${regimeLabel}</span>
                </div>
            </div>
        `;
    }

    // Ajoute des indicateurs visuels aux résultats
    function ajouterIndicateursVisuels(resultats) {
        if (!resultats || !resultats.classique || !resultats.encheres) return;
        
        // Créer ou récupérer les conteneurs
        const containers = {
            classique: document.getElementById('classique-indicateurs') || creerConteneurIndicateurs('classique'),
            encheres: document.getElementById('encheres-indicateurs') || creerConteneurIndicateurs('encheres')
        };
        
        // Vider les conteneurs
        containers.classique.innerHTML = '';
        containers.encheres.innerHTML = '';
        
        // Ajouter les indicateurs pour l'achat classique
        const rendementClassique = isNaN(resultats.classique.rendementNet) ? 0 : resultats.classique.rendementNet;
        const cashflowClassique = isNaN(resultats.classique.cashFlow) ? 0 : resultats.classique.cashFlow;
        
        containers.classique.appendChild(
            creerIndicateur('Rentabilité', 
                rendementClassique.toFixed(2) + '%', 
                getClasseIndicateur(rendementClassique, SEUILS.rentabilite),
                'chart-line')
        );
        
        containers.classique.appendChild(
            creerIndicateur('Cash-flow', 
                formaterMontant(cashflowClassique) + '/mois', 
                getClasseIndicateur(cashflowClassique, SEUILS.cashflow),
                'wallet')
        );
        
        // Ajouter les indicateurs pour la vente aux enchères
        const rendementEncheres = isNaN(resultats.encheres.rendementNet) ? 0 : resultats.encheres.rendementNet;
        const cashflowEncheres = isNaN(resultats.encheres.cashFlow) ? 0 : resultats.encheres.cashFlow;
        
        containers.encheres.appendChild(
            creerIndicateur('Rentabilité', 
                rendementEncheres.toFixed(2) + '%', 
                getClasseIndicateur(rendementEncheres, SEUILS.rentabilite),
                'chart-line')
        );
        
        containers.encheres.appendChild(
            creerIndicateur('Cash-flow', 
                formaterMontant(cashflowEncheres) + '/mois', 
                getClasseIndicateur(cashflowEncheres, SEUILS.cashflow),
                'wallet')
        );
    }

    // Crée un conteneur pour les indicateurs
    function creerConteneurIndicateurs(prefix) {
        const container = document.createElement('div');
        container.id = `${prefix}-indicateurs`;
        container.className = 'flex gap-2 mt-3';
        
        // Trouver le bon emplacement pour insérer le conteneur
        const parentElement = document.querySelector(`.results-card:has(#${prefix}-budget-max) .results-body`);
        if (parentElement) {
            parentElement.appendChild(container);
        }
        
        return container;
    }

    // Crée un indicateur visuel
    function creerIndicateur(label, valeur, classe, icone) {
        const indicateur = document.createElement('div');
        indicateur.className = `indicateur-${classe}`;
        indicateur.innerHTML = `
            <span class="indicateur-icon"><i class="fas fa-${icone}"></i></span>
            <span>${valeur}</span>
        `;
        indicateur.title = label;
        
        return indicateur;
    }

    // Détermine la classe d'un indicateur selon sa valeur
    function getClasseIndicateur(valeur, seuils) {
        if (valeur >= seuils.bon) return 'bon';
        if (valeur >= seuils.moyen) return 'moyen';
        return 'mauvais';
    }

    // Formate un montant en euros
    function formaterMontant(montant, decimales = 0) {
        // Protection contre les NaN et valeurs non numériques
        if (typeof montant !== 'number' || isNaN(montant)) {
            montant = 0;
        }
        
        // Si la fonction existe déjà, l'utiliser
        if (window.formaterMontant && typeof window.formaterMontant === 'function') {
            return window.formaterMontant(montant, decimales);
        }
        
        // Sinon, utiliser notre propre implémentation
        try {
            return new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales
            }).format(montant);
        } catch (e) {
            // Fallback simple en cas d'erreur
            return montant.toFixed(decimales) + ' €';
        }
    }

    // Fonction pour formater un montant mensuel
    function formaterMontantMensuel(montant) {
        // Protection contre les NaN et valeurs non numériques
        if (typeof montant !== 'number' || isNaN(montant)) {
            montant = 0;
        }
        
        if (window.formaterMontantMensuel && typeof window.formaterMontantMensuel === 'function') {
            return window.formaterMontantMensuel(montant);
        }
        return formaterMontant(montant) + '/mois';
    }

    // Étend la fonction d'affichage des résultats
    function etendreAffichageResultats() {
        // Récupérer la fonction d'origine
        const afficherResultatsOriginal = window.afficherResultats;
        
        // Si la fonction existe, l'étendre
        if (typeof afficherResultatsOriginal === 'function') {
            window.afficherResultats = function(resultats) {
                // Appeler d'abord la fonction originale
                afficherResultatsOriginal(resultats);
                
                // Ajouter nos extensions
                ajouterRecapHypotheses(resultats);
                ajouterIndicateursVisuels(resultats);
                
                // Ajouter l'affichage fiscal
                mettreAJourAffichageFiscal();
            };
        }
    }

    // Ajoute les écouteurs d'événements
    function ajouterEcouteursEvenements() {
        // Écouteur pour le calcul des scénarios
        const btnCalculerScenarios = document.getElementById('btn-calculer-scenarios');
        if (btnCalculerScenarios) {
            btnCalculerScenarios.addEventListener('click', function() {
                if (!simulateur) return;
                
                const horizon = parseInt(document.getElementById('horizon-revente').value);
                const appreciation = parseFloat(document.getElementById('appreciation-annuelle').value);
                
                // Calculer les scénarios
                const resultatsClassique = simulateur.calculerScenarioRevente(
                    simulateur.params.resultats.classique, horizon, appreciation);
                    
                const resultatsEncheres = simulateur.calculerScenarioRevente(
                    simulateur.params.resultats.encheres, horizon, appreciation);
                
                // Afficher les résultats
                afficherResultatsScenarios(resultatsClassique, resultatsEncheres, horizon);
            });
        }
        
        // Écouteur pour le régime fiscal
        const regimeFiscalSelect = document.getElementById('regime-fiscal');
        if (regimeFiscalSelect) {
            regimeFiscalSelect.addEventListener('change', function() {
                if (!simulateur) return;
                
                // Mettre à jour le paramètre
                simulateur.params.fiscalite.regimeFiscal = this.value;
                
                // Si des résultats existent déjà, recalculer avec le nouveau régime
                if (simulateur.params.resultats.classique && simulateur.params.resultats.encheres) {
                    // Recalculer pour les deux modes
                    simulateur.params.resultats.classique = simulateur.calculeTout(
                        simulateur.params.resultats.classique.surface, 'classique');
                    simulateur.params.resultats.encheres = simulateur.calculeTout(
                        simulateur.params.resultats.encheres.surface, 'encheres');
                    
                    // Mettre à jour l'affichage fiscal
                    mettreAJourAffichageFiscal();
                    
                    // Mettre à jour les indicateurs visuels
                    ajouterIndicateursVisuels(simulateur.params.resultats);
                    
                    // Feedback visuel
                    if (window.afficherToast && typeof window.afficherToast === 'function') {
                        window.afficherToast(`Régime fiscal mis à jour : ${this.options[this.selectedIndex].text}`, 'success');
                    }
                }
            });
        }
    }

    // Affiche les résultats des scénarios de revente
    function afficherResultatsScenarios(resultatsClassique, resultatsEncheres, horizon) {
        const container = document.getElementById('resultats-scenarios');
        if (!container) return;
        
        // Afficher le conteneur
        container.style.display = 'block';
        
        // Formater les résultats
        container.innerHTML = `
            <div class="scenario-header">
                <div class="scenario-title">Résultats à ${horizon} ans</div>
                <div class="scenario-badge">Appréciation: ${document.getElementById('appreciation-annuelle').value}%/an</div>
            </div>
            
            <div class="grid grid-2">
                <div class="results-card">
                    <div class="results-header">
                        <h3 class="card-title"><i class="fas fa-home mr-2"></i> Achat Classique</h3>
                    </div>
                    <div class="results-body">
                        <table class="comparison-table">
                            <tr>
                                <td>Prix d'achat initial</td>
                                <td>${formaterMontant(resultatsClassique.prixAchat)}</td>
                            </tr>
                            <tr>
                                <td>Valeur de revente estimée</td>
                                <td class="highlight">${formaterMontant(resultatsClassique.valeurRevente)}</td>
                            </tr>
                            <tr>
                                <td>Plus-value brute</td>
                                <td>${formaterMontant(resultatsClassique.plusValueBrute)}</td>
                            </tr>
                            <tr>
                                <td>Frais de revente</td>
                                <td>${formaterMontant(resultatsClassique.fraisRevente)}</td>
                            </tr>
                            <tr>
                                <td>Impôt sur la plus-value</td>
                                <td>${formaterMontant(resultatsClassique.impotPlusValue.total)}</td>
                            </tr>
                            <tr>
                                <td>Résultat net</td>
                                <td class="highlight">${formaterMontant(resultatsClassique.resultatNet)}</td>
                            </tr>
                            <tr>
                                <td>TRI (Taux de Rendement Interne)</td>
                                <td class="highlight">${resultatsClassique.tri.toFixed(2)}%</td>
                            </tr>
                            <tr>
                                <td>Multiple d'investissement</td>
                                <td>${resultatsClassique.multipleInvestissement.toFixed(2)}x</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <div class="results-card">
                    <div class="results-header">
                        <h3 class="card-title"><i class="fas fa-gavel mr-2"></i> Vente aux Enchères</h3>
                    </div>
                    <div class="results-body">
                        <table class="comparison-table">
                            <tr>
                                <td>Prix d'achat initial</td>
                                <td>${formaterMontant(resultatsEncheres.prixAchat)}</td>
                            </tr>
                            <tr>
                                <td>Valeur de revente estimée</td>
                                <td class="highlight">${formaterMontant(resultatsEncheres.valeurRevente)}</td>
                            </tr>
                            <tr>
                                <td>Plus-value brute</td>
                                <td>${formaterMontant(resultatsEncheres.plusValueBrute)}</td>
                            </tr>
                            <tr>
                                <td>Frais de revente</td>
                                <td>${formaterMontant(resultatsEncheres.fraisRevente)}</td>
                            </tr>
                            <tr>
                                <td>Impôt sur la plus-value</td>
                                <td>${formaterMontant(resultatsEncheres.impotPlusValue.total)}</td>
                            </tr>
                            <tr>
                                <td>Résultat net</td>
                                <td class="highlight">${formaterMontant(resultatsEncheres.resultatNet)}</td>
                            </tr>
                            <tr>
                                <td>TRI (Taux de Rendement Interne)</td>
                                <td class="highlight">${resultatsEncheres.tri.toFixed(2)}%</td>
                            </tr>
                            <tr>
                                <td>Multiple d'investissement</td>
                                <td>${resultatsEncheres.multipleInvestissement.toFixed(2)}x</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        // Faire défiler vers les résultats
        container.scrollIntoView({ behavior: 'smooth' });
    }

    // Met à jour l'affichage des informations fiscales
    function mettreAJourAffichageFiscal() {
        if (!simulateur || !simulateur.params.resultats) return;
        
        const resultats = {
            classique: simulateur.params.resultats.classique,
            encheres: simulateur.params.resultats.encheres
        };
        
        if (!resultats.classique || !resultats.encheres) return;
        
        const regimeFiscal = simulateur.params.fiscalite.regimeFiscal || 'micro-foncier';
        let regimeLabel = '';
        
        switch(regimeFiscal) {
            case 'micro-foncier': regimeLabel = 'Micro-foncier (abattement 30%)'; break;
            case 'reel-foncier': regimeLabel = 'Régime réel foncier'; break;
            case 'lmnp-micro': regimeLabel = 'LMNP micro-BIC (abattement 50%)'; break;
            case 'lmnp-reel': regimeLabel = 'LMNP réel avec amortissements'; break;
            default: regimeLabel = 'Micro-foncier';
        }
        
        // Mettre à jour les éléments fiscaux pour l'achat classique
        mettreAJourElementsFiscauxParMode('classique', resultats.classique, regimeLabel);
        
        // Mettre à jour les éléments fiscaux pour la vente aux enchères
        mettreAJourElementsFiscauxParMode('encheres', resultats.encheres, regimeLabel);
        
        // Mettre à jour le récapitulatif des hypothèses si présent
        const recapContainer = document.getElementById('recap-hypotheses');
        if (recapContainer) {
            const regimeElement = recapContainer.querySelector('.recap-item-regime');
            
            if (regimeElement) {
                regimeElement.querySelector('.recap-value').textContent = regimeLabel;
            } else {
                const newRegimeElement = document.createElement('div');
                newRegimeElement.className = 'recap-item recap-item-regime';
                newRegimeElement.innerHTML = `
                    <span class="recap-label">Régime fiscal</span>
                    <span class="recap-value">${regimeLabel}</span>
                `;
                recapContainer.querySelector('.recap-hypotheses-grid').appendChild(newRegimeElement);
            }
        }
    }

    // Fonction auxiliaire pour mettre à jour les éléments fiscaux par mode
    function mettreAJourElementsFiscauxParMode(mode, resultats, regimeLabel) {
        // S'assurer que les résultats sont valides
        if (!resultats || !resultats.fiscalDetail) {
            console.warn(`Données fiscales manquantes pour le mode ${mode}`);
            return;
        }
        
        // Sécuriser les données fiscales pour éviter les NaN
        const fiscal = {
            revenuFoncier: Number(resultats.fiscalDetail.revenuFoncier) || 0,
            abattement: Number(resultats.fiscalDetail.abattement) || 0,
            chargesDeduites: Number(resultats.fiscalDetail.chargesDeduites) || 0,
            amortissement: Number(resultats.fiscalDetail.amortissement) || 0,
            revenusImposables: Number(resultats.fiscalDetail.revenusImposables) || 0,
            impot: Number(resultats.fiscalDetail.impot) || 0
        };
        
        // Sécuriser l'impact fiscal
        const impactFiscal = Number(resultats.impactFiscal) || 0;
        
        // Sécuriser le cashflow
        const cashFlow = Number(resultats.cashFlow) || 0;
        const cashFlowApresImpot = cashFlow + (impactFiscal / 12);
        
        // Vérifier si les éléments DOM existent
        const fiscalInfo = document.getElementById(`${mode}-fiscal-info`);
        
        // Créer une explanation basée sur le régime fiscal
        let explanation = '';
        switch(regimeLabel.split(' ')[0]) {
            case 'Micro-foncier':
                explanation = `Avec le régime micro-foncier, un abattement forfaitaire de 30% est appliqué sur les loyers bruts. 
                Seuls 70% des revenus locatifs sont soumis à l'impôt sur le revenu et aux prélèvements sociaux.`;
                break;
            case 'Régime':
                explanation = `Le régime réel permet de déduire toutes les charges réelles (intérêts d'emprunt, taxe foncière, etc.) 
                des revenus locatifs. Il est généralement plus avantageux quand les charges dépassent 30% des loyers.`;
                break;
            case 'LMNP':
                if (regimeLabel.includes('micro-BIC')) {
                    explanation = `Le régime LMNP micro-BIC offre un abattement forfaitaire de 50% sur les loyers des locations meublées. 
                    C'est souvent plus avantageux que le micro-foncier pour une location nue.`;
                } else {
                    explanation = `Le LMNP au réel permet de déduire l'amortissement du bien (généralement sur 20-30 ans), 
                    ce qui réduit considérablement l'impôt, voire permet de ne pas en payer pendant plusieurs années.`;
                }
                break;
        }
        
        // Si l'élément n'existe pas, le créer
        if (!fiscalInfo) {
            // Trouver le conteneur de résultats
            const resultsCard = document.querySelector(`.results-card:has(#${mode}-budget-max) .results-body`);
            if (!resultsCard) return;
            
            // Créer un nouveau div pour les informations fiscales
            const fiscalDiv = document.createElement('div');
            fiscalDiv.className = 'fiscal-info mt-4';
            fiscalDiv.id = `${mode}-fiscal-info`;
            fiscalDiv.innerHTML = `
                <h4>
                    Impact fiscal
                    <span class="fiscal-badge">${regimeLabel}</span>
                </h4>
                <div class="fiscal-explanation">
                    ${explanation}
                </div>
                <table class="comparison-table">
                    <tr>
                        <td>Revenu foncier annuel</td>
                        <td>${formaterMontant(fiscal.revenuFoncier)}</td>
                    </tr>
                    ${fiscal.abattement > 0 ? `
                    <tr>
                        <td>Abattement forfaitaire</td>
                        <td>- ${formaterMontant(fiscal.abattement)}</td>
                    </tr>
                    ` : ''}
                    ${fiscal.chargesDeduites > 0 ? `
                    <tr>
                        <td>Charges déductibles</td>
                        <td>- ${formaterMontant(fiscal.chargesDeduites)}</td>
                    </tr>
                    ` : ''}
                    ${fiscal.amortissement > 0 ? `
                    <tr>
                        <td>Amortissement</td>
                        <td>- ${formaterMontant(fiscal.amortissement)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td>Revenu imposable</td>
                        <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.revenusImposables)}</td>
                    </tr>
                    <tr>
                        <td>Impact fiscal annuel</td>
                        <td id="${mode}-impact-fiscal" class="${impactFiscal >= 0 ? 'positive' : 'negative'}">
                            ${formaterMontant(impactFiscal)}
                        </td>
                    </tr>
                    <tr>
                        <td>Cash-flow après impôt</td>
                        <td id="${mode}-cashflow-apres-impot" class="${cashFlowApresImpot >= 0 ? 'positive' : 'negative'}">
                            ${formaterMontantMensuel(cashFlowApresImpot)}
                        </td>
                    </tr>
                </table>
            `;
            
            // Ajouter à la carte de résultats
            resultsCard.appendChild(fiscalDiv);
        } else {
            // Si l'élément existe, mettre à jour son contenu
            fiscalInfo.querySelector('h4 .fiscal-badge').textContent = regimeLabel;
            
            // Mettre à jour l'explication
            const explanationElem = fiscalInfo.querySelector('.fiscal-explanation');
            if (explanationElem) {
                explanationElem.innerHTML = explanation;
            } else {
                const newExplanation = document.createElement('div');
                newExplanation.className = 'fiscal-explanation';
                newExplanation.innerHTML = explanation;
                fiscalInfo.insertBefore(newExplanation, fiscalInfo.querySelector('table'));
            }
            
            const table = fiscalInfo.querySelector('table');
            table.innerHTML = `
                <tr>
                    <td>Revenu foncier annuel</td>
                    <td>${formaterMontant(fiscal.revenuFoncier)}</td>
                </tr>
                ${fiscal.abattement > 0 ? `
                <tr>
                    <td>Abattement forfaitaire</td>
                    <td>- ${formaterMontant(fiscal.abattement)}</td>
                </tr>
                ` : ''}
                ${fiscal.chargesDeduites > 0 ? `
                <tr>
                    <td>Charges déductibles</td>
                    <td>- ${formaterMontant(fiscal.chargesDeduites)}</td>
                </tr>
                ` : ''}
                ${fiscal.amortissement > 0 ? `
                <tr>
                    <td>Amortissement</td>
                    <td>- ${formaterMontant(fiscal.amortissement)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td>Revenu imposable</td>
                    <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.revenusImposables)}</td>
                </tr>
                <tr>
                    <td>Impact fiscal annuel</td>
                    <td id="${mode}-impact-fiscal" class="${impactFiscal >= 0 ? 'positive' : 'negative'}">
                        ${formaterMontant(impactFiscal)}
                    </td>
                </tr>
                <tr>
                    <td>Cash-flow après impôt</td>
                    <td id="${mode}-cashflow-apres-impot" class="${cashFlowApresImpot >= 0 ? 'positive' : 'negative'}">
                        ${formaterMontantMensuel(cashFlowApresImpot)}
                    </td>
                </tr>
            `;
        }
    }

    // Exposer les fonctions publiques
    return {
        initialiser: initialiser
    };
})();

// Initialisation automatique au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Attendre que le simulateur principal soit initialisé
    const checkSimulateur = setInterval(function() {
        if (window.simulateur && window.simulateur instanceof SimulateurImmo) {
            clearInterval(checkSimulateur);
            ImmoExtensions.initialiser(window.simulateur);
            console.log("Extensions du simulateur immobilier initialisées");
        }
    }, 100);
    
    // Délai maximum de 5 secondes
    setTimeout(function() {
        clearInterval(checkSimulateur);
        console.warn("Délai d'attente dépassé pour l'initialisation des extensions");
    }, 5000);
});
