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
            moyen: 4   // 4-7% = moyen, <4% = mauvais
        },
        cashflow: {
            bon: 200,  // >200€ = bon
            moyen: 50  // 50-200€ = moyen, <50€ = mauvais
        }
    };
    
    // ===============================================================
    // HELPER CALCUL PLUS-VALUE 2025
    // ===============================================================
    
    /**
     * Helper générique – Calcul de la plus-value (règles 2025)
     */
    function calculerImpotPlusValueSelonRegime({
        regime,
        prixAchat,
        valeurRevente,
        fraisAcq,
        nbAnnees,
        amortissementAnnuel,
        tauxIS = 25,
        exonerationType = null
    }) {
        // Exonérations totales
        if (exonerationType === 'main_residence') {
            return { impot: 0, baseImposable: {}, detail: { reason: 'Résidence principale'} };
        }

        // RÉGIMES PERSONNES PHYSIQUES & LMNP
        if (['micro-foncier','reel-foncier','lmnp-micro','lmnp-reel'].includes(regime)) {
            const fraisMajores = Math.max(fraisAcq, prixAchat * 0.075);
            const travauxMajores = nbAnnees >= 5 ? prixAchat * 0.15 : 0;

            let prixMajore = prixAchat + fraisMajores + travauxMajores;

            // Réforme 2025 : ré-intégration amortissements LMNP réel
            if (regime === 'lmnp-reel') {
                prixMajore -= amortissementAnnuel * nbAnnees;
            }

            const pvBrute = Math.max(0, valeurRevente - prixMajore);

            // Abattements de durée – IR & PS
            const abattIR = nbAnnees <= 5 ? 0
                           : nbAnnees <= 21 ? (nbAnnees - 5) * 6
                           : nbAnnees === 22 ? 100 : 100;

            const abattPS = nbAnnees <= 5 ? 0
                           : nbAnnees <= 21 ? (nbAnnees - 5) * 1.65
                           : nbAnnees === 22 ? 28
                           : nbAnnees <= 30 ? Math.min(28 + (nbAnnees - 22) * 9, 100)
                           : 100;

            const baseIR = pvBrute * (1 - abattIR / 100);
            const basePS = pvBrute * (1 - abattPS / 100);

            // Surtaxe 2025 avec décote officielle
            let surtaxe = 0;
            if (baseIR > 50_000) {
                surtaxe = Math.min(
                    baseIR * 0.06 - Math.max(0, baseIR - 150_000) * 0.04,
                    baseIR * 0.06
                );
            }

            return {
                impot: baseIR * 0.19 + basePS * 0.172 + surtaxe,
                baseImposable: { IR: baseIR, PS: basePS },
                detail: { pvBrute, prixMajore, abattIR, abattPS, surtaxe }
            };
        }

        // RÉGIMES IS
        if (regime.endsWith('-is')) {
            // Valeur comptable : terrain ≈ 20% non amortissable
            const valeurTerrain = prixAchat * 0.20;
            const amortCumule = amortissementAnnuel * nbAnnees;
            const valeurComptable = Math.max(valeurTerrain, prixAchat - amortCumule);

            const baseIS = Math.max(0, valeurRevente - valeurComptable);

            // Barème 15% jusqu'à 42 500€, puis 25%
            const impotIS = baseIS <= 42_500
                ? baseIS * 0.15
                : 42_500 * 0.15 + (baseIS - 42_500) * 0.25;

            return {
                impot: impotIS,
                baseImposable: { IS: baseIS },
                detail: { valeurComptable, amortCumule }
            };
        }

        // Par défaut
        return { impot: 0, baseImposable: {}, detail: {} };
    }
    
    // Initialisation du module
    function initialiser(simulateurInstance) {
        console.log("Initialisation des extensions du simulateur immobilier");
        simulateur = simulateurInstance;
        
        // Initialiser le régime fiscal par défaut s'il n'existe pas
        if (!simulateur.params.fiscalite.regimeFiscal) {
            simulateur.params.fiscalite.regimeFiscal = 'micro-foncier';
        }
        
        // Initialiser le taux d'IS par défaut s'il n'existe pas
        if (!simulateur.params.fiscalite.tauxIS) {
            simulateur.params.fiscalite.tauxIS = 25; // 25% par défaut
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
    
    // Étend le simulateur avec les nouvelles méthodes
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
            
            // Calculer l'amortissement pour tous les régimes qui peuvent l'utiliser
            try {
                amortissement = this.calculerAmortissementAnnuel(regimeFiscal);
            } catch (e) {
                console.warn("Erreur dans le calcul d'amortissement:", e);
                amortissement = 0;
            }

            // NOUVEAU BLOC SWITCH FOURNI PAR L'UTILISATEUR
            switch (regimeFiscal) {
                /* ------------------------------------------------------------------ */
                case 'micro-foncier':
                    // Abattement forfaitaire de 30 %
                    // Revenu imposable = loyers bruts  –  30 %
                    abattement        = revenuFoncier * 0.30;
                    revenusImposables = Math.max(0, revenuFoncier - abattement);
                    break;

                /* ------------------------------------------------------------------ */
                case 'reel-foncier':
                    // Déduction des intérêts et charges réelles
                    // Revenu imposable = loyers bruts  –  (intérêts + charges)
                    chargesDeduites   = interetsEmprunt + charges;
                    revenusImposables = Math.max(0, revenuFoncier - chargesDeduites);
                    break;

                /* ------------------------------------------------------------------ */
                case 'lmnp-micro':
                    // Abattement forfaitaire de 50 % (micro-BIC)
                    // Revenu imposable = loyers bruts  –  50 %
                    abattement        = revenuFoncier * 0.50;
                    revenusImposables = Math.max(0, revenuFoncier - abattement);
                    break;

                /* ------------------------------------------------------------------ */
                case 'lmnp-reel':
                case 'lmp-reel':
                    // Déduction des charges réelles **et** des amortissements
                    // Revenu imposable = loyers bruts  –  (intérêts + charges + amortissements)
                    chargesDeduites   = interetsEmprunt + charges + amortissement;
                    revenusImposables = Math.max(0, revenuFoncier - chargesDeduites);
                    break;

                /* ------------------------------------------------------------------ */
                case 'sci-is':   // SCI, SAS ou SARL imposée à l'IS
                case 'sas-is':
                case 'sarl-is':
                    // À l'IS, on calcule un **résultat fiscal société**
                    const resultatIS = revenuFoncier - (interetsEmprunt + charges + amortissement);
                    
                    // On utilise le taux d'IS paramétré dans le simulateur 
                    const tauxIS = this.params.fiscalite.tauxIS / 100 || 0.25;
                    const impotIS = Math.max(0, resultatIS) * tauxIS;
                    
                    // Retourner un format compatible avec le reste du code
                    return {
                        type: 'IS',
                        revenuFoncier: revenuFoncier,
                        resultatFiscalSociete: resultatIS,
                        abattement: 0,
                        chargesDeduites: interetsEmprunt + charges + amortissement,
                        amortissement: amortissement,
                        revenusImposables: Math.max(0, resultatIS),
                        impot: impotIS,
                        revenuNet: revenuFoncier - impotIS,
                        tauxIS: tauxIS * 100
                    };

                /* ------------------------------------------------------------------ */
                default:
                    // Par défaut on se contente du revenu foncier net
                    revenusImposables = Math.max(0, revenuFoncier);
            }
            
            // Calcul de l'impôt (pour les régimes IR)
            const baseIR = revenusImposables * (this.params.fiscalite.tauxMarginalImpot / 100);
            const basePS = revenusImposables * (this.params.fiscalite.tauxPrelevementsSociaux / 100);
            const impot = baseIR + basePS; // signe positif = impôt à payer
            
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
                revenuNet: revenuFoncier - impot,
                type: 'IR'
            };
        };

        SimulateurImmo.prototype.calculerImpot = function(revenuImposable) {
            if (revenuImposable <= 0) return 0;
            
            const tauxMarginal = this.params.fiscalite.tauxMarginalImpot / 100;
            const tauxPS = this.params.fiscalite.tauxPrelevementsSociaux / 100;
            
            return revenuImposable * (tauxMarginal + tauxPS);
        };

        // ===============================================================
        // MÉTHODE CALCULER SCÉNARIO REVENTE 2025
        // ===============================================================
        SimulateurImmo.prototype.calculerScenarioRevente = function(investissement, nbAnnees, tauxAppreciationAnnuel) {
            const prixAchat = investissement.prixAchat || 0;
            const coutTotal = investissement.coutTotal || 0;
            const fraisAcquisition = coutTotal - prixAchat;
            const apportInitial = this.params.base.apport || 0;
            const montantEmprunte = coutTotal - apportInitial;
            const cashFlowMensuel = (investissement.cashFlow || 0);
            const cashFlowAnnuel = cashFlowMensuel * 12;
            
            // Récupérer le régime fiscal actuel
            const regime = this.params.fiscalite?.regimeFiscal || 
                           document.querySelector('input[name="regime-fiscal"]:checked')?.value || 
                           'reel-foncier';
            const tauxIS = this.params.fiscalite?.tauxIS || 25;
            
            // Calcul de la valeur future
            const facteurAppreciation = Math.pow(1 + tauxAppreciationAnnuel/100, nbAnnees);
            const valeurRevente = prixAchat * facteurAppreciation;
            
            // Frais de revente (10%)
            const tauxFraisRevente = 10;
            const fraisRevente = valeurRevente * (tauxFraisRevente/100);
            
            // Calcul plus-value via helper 2025
            const amortissementAnnuel = this.calculerAmortissementAnnuel(regime);
            
            const resPV = calculerImpotPlusValueSelonRegime({
                regime,
                prixAchat,
                valeurRevente,
                fraisAcq: fraisAcquisition,
                nbAnnees,
                amortissementAnnuel,
                tauxIS
            });

            const impotPlusValueTotal = resPV.impot;
            
            // Extraction des détails
            const plusValueBrute = resPV.detail.pvBrute || Math.max(0, valeurRevente - prixAchat - fraisAcquisition);
            const prixAcquisitionMajore = resPV.detail.prixMajore || prixAchat + fraisAcquisition;
            const abattementIR = resPV.detail.abattIR || 0;
            const abattementPS = resPV.detail.abattPS || 0;
            const surtaxe = resPV.detail.surtaxe || 0;
            
            // Calcul des impôts détaillés
            let impotPlusValueIR = 0;
            let impotPlusValuePS = 0;
            
            if (regime.endsWith('-is')) {
                impotPlusValueIR = impotPlusValueTotal;
                impotPlusValuePS = 0;
            } else {
                const baseIR = resPV.baseImposable.IR || 0;
                const basePS = resPV.baseImposable.PS || 0;
                impotPlusValueIR = baseIR * 0.19;
                impotPlusValuePS = basePS * 0.172;
            }
            
            // Capital restant dû
            const capitalRestantDu = calculerCapitalRestantDu(
                montantEmprunte,
                this.params.base.taux / 100,
                this.params.base.duree * 12,
                nbAnnees * 12
            );
            
            // Frais de remboursement anticipé
            const tauxMensuel = (this.params.base.taux / 100) / 12;
            const fraRemboursementAnticipe = Math.min(
                capitalRestantDu * 0.02,
                capitalRestantDu * tauxMensuel * 6
            );
            
            // Cash-flows cumulés
            const cashFlowsCumules = cashFlowAnnuel * nbAnnees;
            
            // Valeur nette après revente
            const valeurNetteRevente = valeurRevente - fraisRevente - impotPlusValueTotal - capitalRestantDu - fraRemboursementAnticipe;
            
            // Gain total
            const gainTotal = valeurNetteRevente + cashFlowsCumules - apportInitial;
            
            // Multiple sur apport
            const multipleInvestissement = apportInitial > 0 ? 
                (apportInitial + gainTotal) / apportInitial : 0;
            
            // Calcul du TRI
            const fluxTresorerie = [];
            fluxTresorerie.push(-apportInitial);
            
            for (let i = 1; i < nbAnnees; i++) {
                fluxTresorerie.push(cashFlowAnnuel);
            }
            
            fluxTresorerie.push(cashFlowAnnuel + valeurNetteRevente);
            
            let tri;
            try {
                tri = calculTRINewtonRaphson(fluxTresorerie);
            } catch (e) {
                console.error("Erreur TRI:", e);
                tri = 0;
            }
            
            return {
                prixAchat,
                valeurRevente,
                prixAcquisitionMajore,
                plusValueBrute,
                plusValueBruteSansMajoration: valeurRevente - prixAchat,
                fraisRevente,
                impotPlusValue: {
                    ir: impotPlusValueIR,
                    ps: impotPlusValuePS,
                    surtaxe: surtaxe,
                    total: impotPlusValueTotal
                },
                abattements: {
                    ir: abattementIR,
                    ps: abattementPS
                },
                capitalRestantDu,
                fraRemboursementAnticipe,
                valeurNetteRevente,
                cashFlowsCumules,
                gainTotal,
                resultatNet: gainTotal,
                tri: tri * 100,
                multipleInvestissement,
                fluxTresorerie,
                regime,
                detailPlusValue: resPV
            };
        };
        
        // ===============================================================
        // MÉTHODE CALCULER AMORTISSEMENT ANNUEL
        // ===============================================================
        SimulateurImmo.prototype.calculerAmortissementAnnuel = function(regime) {
            if (!['lmnp-reel', 'sci-is'].includes(regime)) return 0;
            
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
    }
    
    // ===============================================================
    // FONCTIONS UTILITAIRES POUR CAPITAL ET TRI
    // ===============================================================
    
    // Calcule le capital restant dû
    function calculerCapitalRestantDu(montantEmprunte, tauxAnnuel, dureeEnMois, moisEcoules) {
        if (montantEmprunte <= 0 || moisEcoules >= dureeEnMois) return 0;
        
        const tauxMensuel = tauxAnnuel / 12;
        const mensualite = (montantEmprunte * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -dureeEnMois));
        
        let capitalRestant = montantEmprunte;
        for (let i = 0; i < moisEcoules && i < dureeEnMois; i++) {
            const interets = capitalRestant * tauxMensuel;
            const principal = mensualite - interets;
            capitalRestant -= principal;
            if (capitalRestant < 0) capitalRestant = 0;
        }
        
        return capitalRestant;
    }

    // Calcul du TRI avec Newton-Raphson
    function calculTRINewtonRaphson(flux) {
        const hasPositive = flux.some(f => f > 0);
        const hasNegative = flux.some(f => f < 0);
        
        if (!hasPositive || !hasNegative) {
            return 0;
        }
        
        let tri = 0.1;
        const precision = 0.00001;
        const maxIterations = 100;
        
        for (let i = 0; i < maxIterations; i++) {
            let van = 0;
            let derivee = 0;
            
            for (let j = 0; j < flux.length; j++) {
                const diviseur = Math.pow(1 + tri, j);
                van += flux[j] / diviseur;
                
                if (j > 0) {
                    derivee -= (j * flux[j]) / Math.pow(1 + tri, j + 1);
                }
            }
            
            if (Math.abs(van) < precision) {
                return tri;
            }
            
            if (Math.abs(derivee) < 0.0001) {
                tri = tri > 0 ? tri * 0.5 : -0.1;
                continue;
            }
            
            const delta = van / derivee;
            const nouveauTri = tri - delta * 0.7;
            
            if (nouveauTri < -0.99) {
                tri = -0.99;
            } else if (nouveauTri > 10) {
                tri = 10;
            } else {
                tri = nouveauTri;
            }
            
            if (i > 20 && Math.abs(delta) > 1) {
                tri = 0.1 * Math.random() - 0.05;
            }
        }
        
        return tri;
    }

    // Alias pour compatibilité
    function calculTRIApproximation(flux) {
        return calculTRINewtonRaphson(flux);
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
            
            /* Styles spécifiques pour les cartes de régime IS */
            .regime-card-is {
                background-color: rgba(47, 35, 74, 0.7);
            }
            
            .regime-card-is.active,
            .regime-card-is[aria-checked="true"] {
                background-color: rgba(139, 92, 246, 0.15);
                border-color: rgba(139, 92, 246, 0.8);
                box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.3);
            }
            
            /* Style pour le champ de Taux d'IS */
            #taux-is-container {
                padding: 1rem;
                margin-top: 1rem;
                background-color: rgba(47, 35, 74, 0.3);
                border-radius: 0.5rem;
                border: 1px solid rgba(139, 92, 246, 0.2);
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
    // NOUVELLE VÉRIFICATION : Si l'impact fiscal est désactivé, ne rien faire
    if (window.disableFiscalImpact) {
        console.log('🚫 Sélection de régime fiscal désactivée (impact fiscal désactivé)');
        return;
    }
    
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
                    
                    <!-- Régimes sociétés -->
                    <div class="regime-card regime-card-is" data-regime="sci-is" role="radio" tabindex="0" aria-checked="false">
                        <i class="fas fa-building text-lg text-red-400"></i>
                        <h4>SCI à l'IS</h4>
                        <p class="text-sm opacity-75">Société civile</p>
                        <span class="regime-badge">IS</span>
                    </div>
                    
                    <div class="regime-card regime-card-is" data-regime="sas-is" role="radio" tabindex="0" aria-checked="false">
                        <i class="fas fa-landmark text-lg text-indigo-400"></i>
                        <h4>SAS</h4>
                        <p class="text-sm opacity-75">Société par actions</p>
                        <span class="regime-badge">IS</span>
                    </div>
                    
                    <div class="regime-card regime-card-is" data-regime="sarl-is" role="radio" tabindex="0" aria-checked="false">
                        <i class="fas fa-briefcase text-lg text-orange-400"></i>
                        <h4>SARL</h4>
                        <p class="text-sm opacity-75">Société à resp. limitée</p>
                        <span class="regime-badge">IS</span>
                    </div>
                </div>
                
                <!-- Champ pour le taux d'IS (masqué par défaut) -->
                <div id="taux-is-container" style="display: none;">
                    <label class="form-label">Taux d'IS (sociétés)</label>
                    <div class="form-addon">
                        <input type="number" id="taux-is" class="form-input" value="25" min="15" max="33" step="0.1">
                        <span class="form-addon-text">%</span>
                    </div>
                    <span class="form-help">Taux d'impôt sur les sociétés (utilisé pour SCI, SAS, SARL à l'IS)</span>
                </div>
                
                <!-- Champ caché pour maintenir la compatibilité -->
                <select id="regime-fiscal" class="form-input hidden">
                    <option value="micro-foncier" selected>Micro-foncier (abattement 30%)</option>
                    <option value="reel-foncier">Régime réel foncier</option>
                    <option value="lmnp-micro">LMNP micro-BIC (abattement 50%)</option>
                    <option value="lmnp-reel">LMNP réel avec amortissements</option>
                    <option value="sci-is">SCI à l'IS</option>
                    <option value="sas-is">SAS (IS)</option>
                    <option value="sarl-is">SARL (IS)</option>
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
        const tauxISContainer = document.getElementById('taux-is-container');
        
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
                
                // Afficher/masquer le taux IS selon le régime
                if (tauxISContainer) {
                    tauxISContainer.style.display = regimeActuel.endsWith('-is') ? 'block' : 'none';
                }
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
            
            // Afficher/masquer le taux IS selon le régime
            if (tauxISContainer) {
                tauxISContainer.style.display = regimeSelectionne.endsWith('-is') ? 'block' : 'none';
            }
            
            // Mettre à jour le paramètre dans le simulateur
            simulateur.params.fiscalite.regimeFiscal = regimeSelectionne;
            
            // Mettre à jour le taux d'IS si applicable
            if (regimeSelectionne.endsWith('-is')) {
                const tauxISInput = document.getElementById('taux-is');
                if (tauxISInput) {
                    simulateur.params.fiscalite.tauxIS = parseFloat(tauxISInput.value) || 25;
                }
            }
            
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
        
        // Écouteur pour le champ de taux IS
        const tauxISInput = document.getElementById('taux-is');
        if (tauxISInput) {
            tauxISInput.addEventListener('change', () => {
                // Mettre à jour le taux d'IS dans le simulateur
                simulateur.params.fiscalite.tauxIS = parseFloat(tauxISInput.value) || 25;
                
                // Recalculer si un régime IS est sélectionné et des résultats existent
                const regimeActuel = simulateur.params.fiscalite.regimeFiscal;
                if (regimeActuel && regimeActuel.endsWith('-is') && 
                    simulateur.params.resultats.classique && simulateur.params.resultats.encheres) {
                    // Afficher un toast
                    if (typeof window.afficherToast === 'function') {
                        window.afficherToast("Mise à jour du taux d'IS...", 'info');
                    }
                    
                    // Recalculer
                    setTimeout(() => {
                        simulateur.params.resultats.classique = simulateur.calculeTout(
                            simulateur.params.resultats.classique.surface, 'classique');
                        simulateur.params.resultats.encheres = simulateur.calculeTout(
                            simulateur.params.resultats.encheres.surface, 'encheres');
                        
                        mettreAJourAffichageFiscal();
                        ajouterIndicateursVisuels(simulateur.params.resultats);
                        
                        if (typeof window.afficherToast === 'function') {
                            window.afficherToast(`Taux d'IS mis à jour: ${tauxISInput.value}%`, 'success');
                        }
                    }, 300);
                }
            });
        }
        
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
            case 'sci-is': regimeLabel = 'SCI à l\'IS'; break;
            case 'sas-is': regimeLabel = 'SAS (IS)'; break;
            case 'sarl-is': regimeLabel = 'SARL (IS)'; break;
            default: regimeLabel = 'Micro-foncier';
        }
        
        // Afficher le taux d'IS pour les régimes concernés
        let tauxISInfo = '';
        if (regimeFiscal.endsWith('-is')) {
            tauxISInfo = ` - Taux IS: ${simulateur.params.fiscalite.tauxIS || 25}%`;
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
                    <span class="recap-value">${regimeLabel}${tauxISInfo}</span>
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
                
                // Mettre à jour l'affichage des cartes si présentes
                const cards = document.querySelectorAll('.regime-card');
                if (cards.length > 0) {
                    cards.forEach(card => {
                        const isActive = card.dataset.regime === this.value;
                        card.classList.toggle('active', isActive);
                        card.setAttribute('aria-checked', isActive ? 'true' : 'false');
                    });
                }
                
                // Afficher/masquer le taux IS selon le régime
                const tauxISContainer = document.getElementById('taux-is-container');
                if (tauxISContainer) {
                    tauxISContainer.style.display = this.value.endsWith('-is') ? 'block' : 'none';
                }
                
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

    // Affiche les résultats des scénarios de revente MISE À JOUR
    function afficherResultatsScenarios(resultatsClassique, resultatsEncheres, horizon) {
        const container = document.getElementById('resultats-scenarios');
        if (!container) return;
        
        container.style.display = 'block';
        
        // Helper pour formater les pourcentages
        const formatPct = (val) => val ? `${val.toFixed(1)}%` : '0%';
        
        container.innerHTML = `
            <div class="scenario-header">
                <div class="scenario-title">Résultats à ${horizon} ans</div>
                <div class="scenario-badge">Appréciation: ${document.getElementById('appreciation-annuelle').value}%/an</div>
            </div>
            
            <div class="grid grid-2">
                ${['Classique', 'Enchères'].map((mode, idx) => {
                    const res = idx === 0 ? resultatsClassique : resultatsEncheres;
                    const icon = idx === 0 ? 'home' : 'gavel';
                    const title = idx === 0 ? 'Achat Classique' : 'Vente aux Enchères';
                    
                    return `
                    <div class="results-card">
                        <div class="results-header">
                            <h3 class="card-title"><i class="fas fa-${icon} mr-2"></i> ${title}</h3>
                        </div>
                        <div class="results-body">
                            <table class="comparison-table">
                                <tr>
                                    <td>Prix d'achat initial</td>
                                    <td>${formaterMontant(res.prixAchat)}</td>
                                </tr>
                                <tr>
                                    <td>Valeur de revente estimée</td>
                                    <td class="highlight">${formaterMontant(res.valeurRevente)}</td>
                                </tr>
                                <tr>
                                    <td>Plus-value brute (sans majoration)</td>
                                    <td>${formaterMontant(res.plusValueBruteSansMajoration)}</td>
                                </tr>
                                <tr class="border-t border-gray-600">
                                    <td colspan="2" class="text-sm text-blue-400">Calcul fiscal de la plus-value</td>
                                </tr>
                                <tr>
                                    <td class="pl-4">Prix d'acquisition majoré</td>
                                    <td>${formaterMontant(res.prixAcquisitionMajore)}</td>
                                </tr>
                                <tr>
                                    <td class="pl-4">Plus-value imposable</td>
                                    <td>${formaterMontant(res.plusValueBrute)}</td>
                                </tr>
                                <tr>
                                    <td class="pl-4">Abattements (IR: ${formatPct(res.abattements.ir)}, PS: ${formatPct(res.abattements.ps)})</td>
                                    <td>${res.abattements.ir >= 100 ? 'Exonéré IR' : 'Partiel'}</td>
                                </tr>
                                <tr>
                                    <td class="pl-4">Impôt total plus-value</td>
                                    <td>${formaterMontant(res.impotPlusValue.total)}</td>
                                </tr>
                                ${res.impotPlusValue.surtaxe > 0 ? `
                                <tr>
                                    <td class="pl-6">dont surtaxe 2025</td>
                                    <td>${formaterMontant(res.impotPlusValue.surtaxe)}</td>
                                </tr>
                                ` : ''}
                                <tr class="border-t border-gray-600">
                                    <td>Frais de revente (10%)</td>
                                    <td>${formaterMontant(res.fraisRevente)}</td>
                                </tr>
                                <tr>
                                    <td>Capital restant dû</td>
                                    <td>${formaterMontant(res.capitalRestantDu)}</td>
                                </tr>
                                <tr>
                                    <td>Indemnités remb. anticipé</td>
                                    <td>${formaterMontant(res.fraRemboursementAnticipe)}</td>
                                </tr>
                                <tr class="border-t border-gray-600">
                                    <td>Cash-flows cumulés (${horizon} ans)</td>
                                    <td class="positive">${formaterMontant(res.cashFlowsCumules)}</td>
                                </tr>
                                <tr>
                                    <td>Gain total net</td>
                                    <td class="highlight ${res.gainTotal >= 0 ? 'positive' : 'negative'}">
                                        ${formaterMontant(res.gainTotal)}
                                    </td>
                                </tr>
                                <tr>
                                    <td>TRI (Taux de Rendement Interne)</td>
                                    <td class="highlight">${res.tri.toFixed(2)}%</td>
                                </tr>
                                <tr>
                                    <td>Multiple sur apport (${formaterMontant(simulateur.params.base.apport || 20000)})</td>
                                    <td>${res.multipleInvestissement.toFixed(2)}x</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
            
            <div class="info-message mt-4">
                <div class="text-lg text-blue-400 mr-3">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div>
                    <h4 class="font-medium mb-1">Calcul fiscal 2025 conforme</h4>
                    <p class="text-sm opacity-90">
                        ${resultatsClassique.regime === 'lmnp-reel' ? 
                            'LMNP réel : réintégration des amortissements<br>' : ''}
                        ${resultatsClassique.regime.endsWith('-is') ? 
                            'Régime IS : barème progressif (15%/25%)<br>' : ''}
                        Prix d'acquisition majoré = Prix + frais notaire (7.5%) + travaux (15% après 5 ans)<br>
                        Abattements selon durée de détention (exonération IR à 22 ans, PS à 30 ans)<br>
                        Surtaxe 2025 avec décote progressive au-delà de 50k€
                    </p>
                </div>
            </div>
        `;
        
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
            case 'sci-is': regimeLabel = `SCI à l'IS (${simulateur.params.fiscalite.tauxIS || 25}%)`; break;
            case 'sas-is': regimeLabel = `SAS (IS ${simulateur.params.fiscalite.tauxIS || 25}%)`; break;
            case 'sarl-is': regimeLabel = `SARL (IS ${simulateur.params.fiscalite.tauxIS || 25}%)`; break;
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
            impot: Number(resultats.fiscalDetail.impot) || 0,
            type: resultats.fiscalDetail.type || 'IR',
            tauxIS: resultats.fiscalDetail.tauxIS || (simulateur.params.fiscalite.tauxIS || 25)
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
        if (fiscal.type === 'IS') {
            explanation = `En régime d'imposition à l'IS (Impôt sur les Sociétés), le résultat fiscal de la société est taxé directement 
                au taux d'IS de ${fiscal.tauxIS}%. Les amortissements sont déductibles, ce qui réduit l'assiette fiscale.`;
        } else {
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
                        <td>${fiscal.type === 'IS' ? 'Résultat fiscal société' : 'Revenu imposable'}</td>
                        <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.revenusImposables)}</td>
                    </tr>
                    <tr>
                        <td>${fiscal.type === 'IS' ? `Impôt société (${fiscal.tauxIS}%)` : 'Impact fiscal annuel'}</td>
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
                    <td>${fiscal.type === 'IS' ? 'Résultat fiscal société' : 'Revenu imposable'}</td>
                    <td id="${mode}-revenu-imposable">${formaterMontant(fiscal.revenusImposables)}</td>
                </tr>
                <tr>
                    <td>${fiscal.type === 'IS' ? `Impôt société (${fiscal.tauxIS}%)` : 'Impact fiscal annuel'}</td>
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
        
        // NOUVEAU : Mettre à jour les valeurs en bas de la carte
        // Calculer le cash-flow après impôt
        const cashFlowApresImpotMensuel = (Number(resultats.cashFlow) || 0) + ((Number(resultats.impactFiscal) || 0) / 12);
        const cashFlowApresImpotAnnuel = cashFlowApresImpotMensuel * 12;

        // Méthode simple et directe : utiliser l'ID existant pour le cash-flow
        const cashflowElement = document.getElementById(`${mode}-cashflow`);
        if (cashflowElement) {
            // Mettre à jour la valeur mensuelle
            cashflowElement.textContent = `${cashFlowApresImpotMensuel >= 0 ? '' : ''}${Math.round(cashFlowApresImpotMensuel)} €/mois`;
            cashflowElement.className = cashFlowApresImpotMensuel >= 0 ? 'positive' : 'negative';
        }

        // Mettre à jour le cash-flow annuel dans le tableau comparatif si présent
        const cashflowAnnuelElement = document.getElementById(`comp-${mode}-cashflow-annuel`);
        if (cashflowAnnuelElement) {
            const strongElement = cashflowAnnuelElement.querySelector('strong') || cashflowAnnuelElement;
            strongElement.textContent = formaterMontant(cashFlowApresImpotAnnuel);
        }

        // Alternative : chercher dans la structure connue des résultats
        const resultsFooter = document.querySelector(`.results-card:has(#${mode}-budget-max) .results-footer`);
        if (resultsFooter && !cashflowElement) {
            const cashflowContainer = Array.from(resultsFooter.querySelectorAll('div')).find(div => {
                const label = div.querySelector('.results-label');
                return label && label.textContent === 'Cash-flow';
            });
            
            if (cashflowContainer) {
                const valueDiv = cashflowContainer.querySelector('div:not(.results-label)');
                if (valueDiv) {
                    valueDiv.textContent = `${cashFlowApresImpotMensuel >= 0 ? '' : ''}${Math.round(cashFlowApresImpotMensuel)} €/mois`;
                    valueDiv.className = cashFlowApresImpotMensuel >= 0 ? 'positive' : 'negative';
                }
            }
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
