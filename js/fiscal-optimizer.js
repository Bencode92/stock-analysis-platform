/**
 * fiscal-optimizer.js - Module de simulation patrimoniale complète
 * Ce module gère toute la logique de simulation fiscale, calcul de dépenses et allocation d'actifs
 * TradePulse Finance Intelligence Platform
 * 
 * Version 2.0 - Ajout des plafonds PER reportables N-1/N-2/N-3
 */

// Structure principale du module (Pattern Module pour encapsulation)
const PatrimoineSimulator = (function() {
    // Constantes fiscales (France 2024-2025)
    const TRANCHES_IMPOT = [
        { min: 0, max: 11294, taux: 0 },
        { min: 11294, max: 28787, taux: 0.11 },
        { min: 28787, max: 82341, taux: 0.30 },
        { min: 82341, max: 177106, taux: 0.41 },
        { min: 177106, max: Infinity, taux: 0.45 }
    ];

    // AMÉLIORATION 1: Plafonds PER conformes à la réglementation
    // Basé sur le PASS 2024 (46 368 €)
    const PASS_REF = 46368;                       // PASS de référence (2024)
    const PLAFOND_PER_MIN = Math.round(PASS_REF * 0.10);     // 4 637 € (10% d'un PASS - plancher)
    const PLAFOND_PER_MAX = Math.round(PASS_REF * 0.10 * 8); // 37 094 € (10% de 8 PASS - plafond)
    
    // AMÉLIORATION 2: Charges par type de revenu
    const CHARGES_PAR_TYPE = {
        salarie: 0.22,      // ~22% pour un salarié
        independant: 0.45,  // ~45% pour un TNS
        dividendes: 0.172,  // 17.2% prélèvements sociaux sur revenus du capital
        microEntrepreneur: {
            service: 0.22,    // Services BNC
            commercial: 0.123, // Activités commerciales
            artisanal: 0.123  // Activités artisanales
        }
    };

    // Configuration par défaut
    const CONFIG_DEFAUT = {
        typeRevenu: 'salarie',      // Salarié par défaut
        taux_charges: CHARGES_PAR_TYPE.salarie,
        per_pourcentage: 0.10,     // 10% du brut
        nbParts: 1,                // Quotient familial (1 part par défaut)
        budget: {
            loyer: 0,           // loyer/crédit mensuel
            quotidien: 0,       // dépenses courantes
            extra: 0,            // loisirs, sorties, etc.
            investAuto: 0        // investissement automatique
        },
        allocation: {
            etf: 0.40,             // 40% en ETF
            assuranceVie: 0.25,    // 25% en assurance-vie
            scpi: 0.15,            // 15% en SCPI
            crypto: 0.10,          // 10% en crypto
            autres: 0.10           // 10% en autres (cash, etc.)
        },
        // Plafonds PER non utilisés des années précédentes
        perPlafondsReportables: {
            n1: 0,  // plafond restant de N-1
            n2: 0,  // plafond restant de N-2
            n3: 0   // plafond restant de N-3 (dernière année avant péremption)
        }
    };

    // État interne du simulateur
    let state = {
        revenuBrut: 0,
        typeRevenu: CONFIG_DEFAUT.typeRevenu,
        tauxCharges: CONFIG_DEFAUT.taux_charges,
        perPourcentage: CONFIG_DEFAUT.per_pourcentage,
        nbParts: CONFIG_DEFAUT.nbParts,
        budget: {...CONFIG_DEFAUT.budget},
        allocation: {...CONFIG_DEFAUT.allocation},
        perPlafondsReportables: {...CONFIG_DEFAUT.perPlafondsReportables},
        resultats: {
            // Section fiscalité
            netImposableSansPER: 0,
            netImposableAvecPER: 0,
            perVersement: 0,
            perDeductible: 0,
            perNonDeductible: 0,    // Part du versement au-delà des plafonds
            impotSansPER: 0,
            impotAvecPER: 0,
            gainFiscal: 0,
            netDispoSansPER: 0,
            netDispoAvecPER: 0,
            patrimoineGlobal: 0,
            
            // Taux moyens d'imposition
            tauxMoyenSansPER: 0,
            tauxMoyenAvecPER: 0,
            
            // Infos spécifiques PER (plafonds)
            plafondPERActuel: 0,       // Plafond de l'année N (hors reports)
            plafondPERTotalDispo: 0,   // N + N-1 + N-2 + N-3
            perUtilisationParAnnee: {  // Répartition du versement par année
                n3: 0,
                n2: 0,
                n1: 0,
                n: 0
            },
            perPlafondsRestants: {     // Plafonds restants après versement
                n3: 0,
                n2: 0,
                n1: 0,
                n: 0
            },
            
            // Section budget
            depensesTotales: 0,
            epargneTotale: 0,
            tauxEpargne: 0,
            
            // Section allocation
            montantDispo: 0,
            allocations: {
                etf: 0,
                assuranceVie: 0,
                scpi: 0,
                crypto: 0,
                autres: 0
            }
        }
    };

    /**
     * Réinitialise l'état avec les valeurs par défaut
     */
    function resetState() {
        state.typeRevenu = CONFIG_DEFAUT.typeRevenu;
        state.tauxCharges = CONFIG_DEFAUT.taux_charges;
        state.perPourcentage = CONFIG_DEFAUT.per_pourcentage;
        state.nbParts = CONFIG_DEFAUT.nbParts;
        state.budget = {...CONFIG_DEFAUT.budget};
        state.allocation = {...CONFIG_DEFAUT.allocation};
        state.perPlafondsReportables = {...CONFIG_DEFAUT.perPlafondsReportables};
    }

    /**
     * Calcule l'impôt sur le revenu selon les tranches progressives
     * Prend en compte le quotient familial (nombre de parts)
     * @param {number} revenuImposable - Revenu net imposable
     * @param {number} nbParts - Nombre de parts fiscales (défaut: state.nbParts)
     * @returns {number} Montant de l'impôt
     */
    function calculerImpot(revenuImposable, nbParts = null) {
        const parts = nbParts || state.nbParts || 1;
        const revenuParPart = revenuImposable / parts;
        let impotParPart = 0;
        
        for (let i = 1; i < TRANCHES_IMPOT.length; i++) {
            const tranche = TRANCHES_IMPOT[i];
            const tranchePrecedente = TRANCHES_IMPOT[i-1];
            
            if (revenuParPart > tranchePrecedente.max) {
                const montantImposableDansTranche = Math.min(revenuParPart, tranche.max) - tranchePrecedente.max;
                impotParPart += montantImposableDansTranche * tranche.taux;
            }
        }
        
        // L'impôt total = impôt par part × nombre de parts
        const impotTotal = impotParPart * parts;
        return Math.round(impotTotal * 100) / 100;
    }

    /**
     * Détermine le taux de charges sociales en fonction du type de revenu
     * @param {string} typeRevenu - Type de revenu
     * @param {string} sousType - Sous-type pour microentrepreneur
     * @returns {number} Taux de charges sociales
     */
    function getTauxCharges(typeRevenu, sousType = null) {
        if (typeRevenu === 'microEntrepreneur' && sousType) {
            return CHARGES_PAR_TYPE.microEntrepreneur[sousType] || CHARGES_PAR_TYPE.microEntrepreneur.service;
        }
        
        return CHARGES_PAR_TYPE[typeRevenu] || CHARGES_PAR_TYPE.salarie;
    }

    /**
     * Récupère le taux marginal d'imposition (TMI) pour un revenu donné
     * Prend en compte le quotient familial
     * @param {number} revenuImposable - Revenu imposable
     * @returns {number} Taux marginal d'imposition en pourcentage
     */
    function getTauxMarginal(revenuImposable) {
        const nbParts = state.nbParts || 1;
        const revenuParPart = revenuImposable / nbParts;
        
        for (let i = TRANCHES_IMPOT.length - 1; i >= 0; i--) {
            if (revenuParPart > TRANCHES_IMPOT[i].min) {
                return TRANCHES_IMPOT[i].taux * 100; // Retourne en %
            }
        }
        return 0;
    }

    /**
     * Calcule les plafonds PER disponibles pour l'année N
     * Inclut le plancher et le plafond légal + les reports N-1/N-2/N-3
     * @param {number} revenuProNet - Revenus professionnels nets (après charges & frais)
     * @param {Object} plafondsReportables - Plafonds restants N-1 / N-2 / N-3
     * @returns {Object} { plafondN, plafondsParAnnee, totalDisponible }
     */
    function calculerPlafondsPER(revenuProNet, plafondsReportables = null) {
        const reportables = plafondsReportables || state.perPlafondsReportables;
        
        // Plafond théorique de l'année N : 10% des revenus pro nets
        const plafondTheorique = revenuProNet * 0.10;
        
        // Application du plancher et du plafond légal
        // Le plafond PER est le MAX entre le plancher et MIN(10% revenus, plafond max)
        const plafondN = Math.max(
            PLAFOND_PER_MIN,
            Math.min(plafondTheorique, PLAFOND_PER_MAX)
        );
        
        // Plafonds par année (avec sécurisation >= 0)
        const plafondsParAnnee = {
            n3: Math.max(reportables.n3 || 0, 0),
            n2: Math.max(reportables.n2 || 0, 0),
            n1: Math.max(reportables.n1 || 0, 0),
            n:  plafondN
        };
        
        // Total disponible = somme de tous les plafonds
        const totalDisponible = Object.values(plafondsParAnnee)
            .reduce((a, b) => a + b, 0);
        
        return { plafondN, plafondsParAnnee, totalDisponible };
    }

    /**
     * Répartit un versement PER sur les plafonds disponibles
     * Consommation FIFO : N-3 d'abord (le plus ancien), puis N-2, N-1, N
     * @param {number} montant - Versement PER total
     * @param {Object} plafondsParAnnee - { n3, n2, n1, n }
     * @returns {Object} { utilisation, perDeductible, perNonDeductible }
     */
    function allouerVersementPER(montant, plafondsParAnnee) {
        const ordre = ['n3', 'n2', 'n1', 'n']; // FIFO : on consomme l'ancien d'abord
        const utilisation = { n3: 0, n2: 0, n1: 0, n: 0 };
        
        let restant = montant;
        
        for (const annee of ordre) {
            if (restant <= 0) break;
            
            const dispo = plafondsParAnnee[annee] || 0;
            if (dispo <= 0) continue; // Ex: N-3 déjà consommé → dispo = 0
            
            const utilise = Math.min(restant, dispo);
            utilisation[annee] = utilise;
            restant -= utilise;
        }
        
        const perDeductible = montant - restant;  // Part qui rentre dans les plafonds
        const perNonDeductible = restant;         // Part au-delà des plafonds
        
        return { utilisation, perDeductible, perNonDeductible };
    }

    /**
     * Calcule un versement PER optimal pour sortir de la tranche marginale actuelle
     * @param {number} revenuImposable - Revenu net imposable avant PER
     * @param {Object} plafondsReportables - Plafonds N-1 / N-2 / N-3
     * @returns {Object} { versementOptimal, nouvelleTMI, allocationParAnnee, economieImpot }
     */
    function calculerVersementOptimalPourChangerTranche(revenuImposable, plafondsReportables = null) {
        const reportables = plafondsReportables || state.perPlafondsReportables;
        const nbParts = state.nbParts || 1;
        const revenuParPart = revenuImposable / nbParts;
        
        const { plafondsParAnnee, totalDisponible } = calculerPlafondsPER(revenuImposable, reportables);
        
        // Trouver la tranche actuelle
        let trancheIndex = 0;
        for (let i = 0; i < TRANCHES_IMPOT.length; i++) {
            if (revenuParPart > TRANCHES_IMPOT[i].min) {
                trancheIndex = i;
            }
        }
        
        // Déjà dans la tranche à 0% => pas d'optimisation
        if (trancheIndex === 0) {
            return {
                versementOptimal: 0,
                nouvelleTMI: 0,
                ancienneTMI: 0,
                allocationParAnnee: { n3: 0, n2: 0, n1: 0, n: 0 },
                totalPlafondDisponible: totalDisponible,
                economieImpot: 0,
                message: "Vous êtes déjà dans la tranche à 0%, pas besoin de versement PER pour optimisation fiscale."
            };
        }
        
        const trancheCourante = TRANCHES_IMPOT[trancheIndex];
        const ancienneTMI = trancheCourante.taux * 100;
        
        // On veut ramener le revenu PAR PART sous le MIN de la tranche courante
        const seuilSortieTranche = trancheCourante.min;
        const montantParPartNecessaire = Math.max(0, revenuParPart - seuilSortieTranche);
        const montantTotalNecessaire = montantParPartNecessaire * nbParts;
        
        // Le versement optimal est le MIN entre ce qu'il faut et ce qui est disponible
        const versementOptimal = Math.min(montantTotalNecessaire, totalDisponible);
        
        // Répartition du versement sur les plafonds
        const { utilisation, perDeductible } = allouerVersementPER(versementOptimal, plafondsParAnnee);
        
        // Calcul de la nouvelle TMI
        const nouveauRevenuImposable = revenuImposable - perDeductible;
        const nouvelleTMI = getTauxMarginal(nouveauRevenuImposable);
        
        // Calcul de l'économie d'impôt
        const impotAvant = calculerImpot(revenuImposable);
        const impotApres = calculerImpot(nouveauRevenuImposable);
        const economieImpot = impotAvant - impotApres;
        
        return {
            versementOptimal: Math.round(versementOptimal),
            nouvelleTMI,
            ancienneTMI,
            allocationParAnnee: utilisation,
            totalPlafondDisponible: totalDisponible,
            economieImpot: Math.round(economieImpot),
            message: versementOptimal < montantTotalNecessaire 
                ? `Plafond insuffisant pour sortir complètement de la tranche ${ancienneTMI}%. Versement max: ${Math.round(totalDisponible).toLocaleString('fr-FR')} €`
                : `En versant ${Math.round(versementOptimal).toLocaleString('fr-FR')} €, vous passez de la TMI ${ancienneTMI}% à ${nouvelleTMI}%.`
        };
    }

    /**
     * Calcule la simulation fiscale complète
     * @param {Object} params - Paramètres de la simulation
     * @returns {Object} Résultats détaillés de la simulation fiscale
     */
    function calculerSimulationFiscale(params = {}) {
        // Mise à jour de l'état avec les paramètres reçus
        state.revenuBrut = params.revenuBrut || state.revenuBrut;
        state.typeRevenu = params.typeRevenu || state.typeRevenu;
        state.tauxCharges = params.tauxCharges || getTauxCharges(state.typeRevenu, params.sousType);
        state.perPourcentage = params.perPourcentage || state.perPourcentage;
        state.nbParts = params.nbParts || state.nbParts || 1;
        
        // Mise à jour des plafonds reportables si fournis
        if (params.plafondsReportables) {
            state.perPlafondsReportables = {
                n1: params.plafondsReportables.n1 || 0,
                n2: params.plafondsReportables.n2 || 0,
                n3: params.plafondsReportables.n3 || 0
            };
        }
        
        // Revenu professionnel net (approximation)
        const revenuProNet = state.revenuBrut * (1 - state.tauxCharges);
        
        // Pour le moment, on assimile revenu imposable global = revenu pro net
        const netImposableSansPER = revenuProNet;
        
        // Plafonds PER N + reports N-1/N-2/N-3
        const { plafondN, plafondsParAnnee, totalDisponible } = 
            calculerPlafondsPER(revenuProNet, state.perPlafondsReportables);
        
        // Versement PER demandé
        const perVersement = state.revenuBrut * state.perPourcentage;
        
        // Répartition du versement sur les plafonds disponibles (FIFO)
        const { utilisation, perDeductible, perNonDeductible } = 
            allouerVersementPER(perVersement, plafondsParAnnee);
        
        // Revenu imposable après déduction PER
        const netImposableAvecPER = netImposableSansPER - perDeductible;
        
        // Calcul des plafonds restants après versement
        const plafondsRestants = {};
        Object.keys(plafondsParAnnee).forEach(annee => {
            plafondsRestants[annee] = Math.max(0, 
                (plafondsParAnnee[annee] || 0) - (utilisation[annee] || 0)
            );
        });
        
        // Calculs d'impôts selon les tranches (avec quotient familial)
        const impotSansPER = calculerImpot(netImposableSansPER);
        const impotAvecPER = calculerImpot(netImposableAvecPER);
        const gainFiscal = impotSansPER - impotAvecPER;
        
        // Calculs nets après impôts
        const netDispoSansPER = netImposableSansPER - impotSansPER;
        const netDispoAvecPER = netImposableAvecPER - impotAvecPER;
        const patrimoineGlobal = netDispoAvecPER + perVersement;
        
        // Taux moyens d'imposition
        const tauxMoyenSansPER = netImposableSansPER > 0 ? (impotSansPER / netImposableSansPER) * 100 : 0;
        const tauxMoyenAvecPER = netImposableAvecPER > 0 ? (impotAvecPER / netImposableAvecPER) * 100 : 0;
        
        // Mise à jour des résultats
        Object.assign(state.resultats, {
            netImposableSansPER,
            netImposableAvecPER,
            perVersement,
            perDeductible,
            perNonDeductible,
            impotSansPER,
            impotAvecPER,
            gainFiscal,
            netDispoSansPER,
            netDispoAvecPER,
            patrimoineGlobal,
            tauxMoyenSansPER,
            tauxMoyenAvecPER,
            plafondPERActuel: plafondN,
            plafondPERTotalDispo: totalDisponible,
            perUtilisationParAnnee: utilisation,
            perPlafondsRestants: plafondsRestants
        });
        
        return state.resultats;
    }

    /**
     * Calcule le budget et les dépenses
     * @param {Object} params - Paramètres du budget
     * @returns {Object} Résultats détaillés du budget
     */
    function calculerBudget(params = {}) {
        // Mise à jour du budget avec les paramètres reçus
        if (params.loyer) state.budget.loyer = params.loyer;
        if (params.quotidien) state.budget.quotidien = params.quotidien;
        if (params.extra) state.budget.extra = params.extra;
        if (params.investAuto) state.budget.investAuto = params.investAuto;
        
        // Calcul des dépenses mensuelles totales
        const depensesTotales = Object.values(state.budget).reduce((a, b) => a + b, 0);
        
        // Calcul du disponible mensuel à épargner (basé sur le net avec PER)
        const revenumensuel = state.resultats.netDispoAvecPER / 12;
        const epargneTotale = revenumensuel - depensesTotales;
        
        // Taux d'épargne (pourcentage du revenu mensuel)
        const tauxEpargne = revenumensuel > 0 ? (epargneTotale / revenumensuel) * 100 : 0;
        
        // Mise à jour des résultats
        Object.assign(state.resultats, {
            depensesTotales,
            epargneTotale,
            tauxEpargne,
            montantDispo: epargneTotale > 0 ? epargneTotale : 0
        });
        
        return {
            depensesTotales,
            epargneTotale,
            tauxEpargne
        };
    }

    /**
     * Calcule l'allocation d'actifs optimale
     * @param {Object} params - Paramètres d'allocation
     * @returns {Object} Allocation détaillée
     */
    function calculerAllocation(params = {}) {
        // Mise à jour de l'allocation avec les paramètres reçus
        if (params.etf) state.allocation.etf = params.etf;
        if (params.assuranceVie) state.allocation.assuranceVie = params.assuranceVie;
        if (params.scpi) state.allocation.scpi = params.scpi;
        if (params.crypto) state.allocation.crypto = params.crypto;
        if (params.autres) state.allocation.autres = params.autres;
        
        // Normalisation des pourcentages (s'assurer que la somme = 100%)
        const total = Object.values(state.allocation).reduce((a, b) => a + b, 0);
        if (total !== 1) {
            Object.keys(state.allocation).forEach(key => {
                state.allocation[key] = state.allocation[key] / total;
            });
        }
        
        // Calcul des montants selon l'allocation
        const allocations = {};
        Object.keys(state.allocation).forEach(key => {
            allocations[key] = state.resultats.montantDispo * state.allocation[key];
        });
        
        // Mise à jour des résultats
        state.resultats.allocations = allocations;
        
        return allocations;
    }

    /**
     * Exécute la simulation patrimoniale complète
     * @param {Object} params - Tous les paramètres de simulation
     * @returns {Object} Résultats complets de la simulation
     */
    function simulerPatrimoine(params = {}) {
        // Exécution séquentielle des trois modules
        calculerSimulationFiscale(params);
        calculerBudget(params.budget);
        calculerAllocation(params.allocation);
        
        // Persistance des résultats (optionnel)
        if (params.sauvegarder) {
            sauvegarderResultats();
        }
        
        return state.resultats;
    }

    /**
     * Sauvegarde les résultats dans le localStorage
     */
    function sauvegarderResultats() {
        try {
            localStorage.setItem('tradepulse_simulation', JSON.stringify({
                parametres: {
                    revenuBrut: state.revenuBrut,
                    typeRevenu: state.typeRevenu,
                    tauxCharges: state.tauxCharges,
                    perPourcentage: state.perPourcentage,
                    nbParts: state.nbParts,
                    budget: state.budget,
                    allocation: state.allocation,
                    perPlafondsReportables: state.perPlafondsReportables
                },
                resultats: state.resultats,
                timestamp: Date.now()
            }));
            console.log('✅ Résultats sauvegardés');
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde:', error);
            return false;
        }
    }

    /**
     * Charge les résultats précédents depuis le localStorage
     * @returns {Object|null} Données chargées ou null si aucune
     */
    function chargerResultats() {
        try {
            const savedData = localStorage.getItem('tradepulse_simulation');
            if (!savedData) return null;
            
            const parsed = JSON.parse(savedData);
            
            // Mise à jour de l'état avec les données sauvegardées
            state.revenuBrut = parsed.parametres.revenuBrut;
            state.typeRevenu = parsed.parametres.typeRevenu || 'salarie';
            state.tauxCharges = parsed.parametres.tauxCharges;
            state.perPourcentage = parsed.parametres.perPourcentage;
            state.nbParts = parsed.parametres.nbParts || 1;
            state.budget = parsed.parametres.budget;
            state.allocation = parsed.parametres.allocation;
            state.perPlafondsReportables = parsed.parametres.perPlafondsReportables || {...CONFIG_DEFAUT.perPlafondsReportables};
            state.resultats = parsed.resultats;
            
            return parsed;
        } catch (error) {
            console.error('❌ Erreur lors du chargement des résultats:', error);
            return null;
        }
    }

    /**
     * Exporter le "graphe d'allocation" pour affichage
     * @returns {Object} Données pour le graphique
     */
    function exporterDataGraphique() {
        return {
            fiscal: {
                labels: ['Sans PER', 'Avec PER'],
                datasets: [
                    {
                        label: 'Impôt payé',
                        data: [state.resultats.impotSansPER, state.resultats.impotAvecPER],
                        backgroundColor: 'rgba(255, 99, 132, 0.7)'
                    },
                    {
                        label: 'Net disponible',
                        data: [state.resultats.netDispoSansPER, state.resultats.netDispoAvecPER],
                        backgroundColor: 'rgba(75, 192, 192, 0.7)'
                    },
                    {
                        label: 'PER',
                        data: [0, state.resultats.perVersement],
                        backgroundColor: 'rgba(153, 102, 255, 0.7)'
                    }
                ]
            },
            budget: {
                labels: ['Loyer', 'Quotidien', 'Extra', 'Invest. Auto', 'Épargne'],
                data: [
                    state.budget.loyer,
                    state.budget.quotidien,
                    state.budget.extra,
                    state.budget.investAuto,
                    state.resultats.epargneTotale
                ],
                colors: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(255, 205, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(54, 162, 235, 0.7)'
                ]
            },
            allocation: {
                labels: Object.keys(state.allocation).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
                data: Object.values(state.resultats.allocations),
                colors: [
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(255, 205, 86, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(201, 203, 207, 0.7)'
                ]
            }
        };
    }

    /**
     * Retourne les constantes PER pour usage externe
     * @returns {Object} Constantes des plafonds PER
     */
    function getConstantesPER() {
        return {
            PASS_REF,
            PLAFOND_PER_MIN,
            PLAFOND_PER_MAX
        };
    }

    // API publique du module
    return {
        calculerSimulationFiscale,
        calculerBudget,
        calculerAllocation,
        simulerPatrimoine,
        sauvegarderResultats,
        chargerResultats,
        resetState,
        exporterDataGraphique,
        getTauxMarginal,
        calculerPlafondsPER,
        allouerVersementPER,
        calculerVersementOptimalPourChangerTranche,
        getConstantesPER,
        // Exporter l'état actuel (pour inspection et debugging)
        getState: () => ({...state})
    };
})();

// Fonction de calcul initiale (pour compatibilité avec l'exemple donné)
function calculerFiscalite() {
    // Récupérer les valeurs du formulaire
    const brut = parseFloat(document.getElementById("brut-annuel").value);
    const charges = parseFloat(document.getElementById("taux-charges").value) / 100;
    const perPct = parseFloat(document.getElementById("per-pourcentage").value) / 100;
    
    // Récupérer le type de revenu s'il existe dans le formulaire
    const typeRevenuSelect = document.getElementById("type-revenu");
    const typeRevenu = typeRevenuSelect ? typeRevenuSelect.value : 'salarie';
    
    // Récupérer le sous-type de microentrepreneur si applicable
    const sousTypeSelect = document.getElementById("sous-type-micro");
    const sousType = (typeRevenu === 'microEntrepreneur' && sousTypeSelect) ? sousTypeSelect.value : null;
    
    // Récupérer le nombre de parts si disponible
    const nbPartsInput = document.getElementById("nb-parts");
    const nbParts = nbPartsInput ? parseFloat(nbPartsInput.value) || 1 : 1;
    
    // Récupérer les plafonds reportables si disponibles
    const plafondsReportables = {
        n1: parseFloat(document.getElementById("plafond-n1")?.value) || 0,
        n2: parseFloat(document.getElementById("plafond-n2")?.value) || 0,
        n3: parseFloat(document.getElementById("plafond-n3")?.value) || 0
    };

    // Déléguer le calcul au module
    const resultats = PatrimoineSimulator.calculerSimulationFiscale({
        revenuBrut: brut,
        typeRevenu: typeRevenu,
        sousType: sousType,
        tauxCharges: charges,
        perPourcentage: perPct,
        nbParts: nbParts,
        plafondsReportables: plafondsReportables
    });

    // Affichage des résultats
    document.getElementById("impot-sans-per").textContent = `${resultats.impotSansPER.toLocaleString('fr-FR')} €`;
    document.getElementById("impot-avec-per").textContent = `${resultats.impotAvecPER.toLocaleString('fr-FR')} €`;
    document.getElementById("gain-fiscal").textContent = `${resultats.gainFiscal.toLocaleString('fr-FR')} €`;
    document.getElementById("net-sans-per").textContent = `${resultats.netDispoSansPER.toLocaleString('fr-FR')} €`;
    document.getElementById("net-avec-per").textContent = `${resultats.netDispoAvecPER.toLocaleString('fr-FR')} €`;
    document.getElementById("patrimoine-total").textContent = `${resultats.patrimoineGlobal.toLocaleString('fr-FR')} €`;
    
    // Afficher les taux moyens d'imposition si les éléments existent
    const tauxMoyenSansPER = document.getElementById("taux-moyen-sans-per");
    const tauxMoyenAvecPER = document.getElementById("taux-moyen-avec-per");
    
    if (tauxMoyenSansPER) tauxMoyenSansPER.textContent = `${resultats.tauxMoyenSansPER.toFixed(2)}%`;
    if (tauxMoyenAvecPER) tauxMoyenAvecPER.textContent = `${resultats.tauxMoyenAvecPER.toFixed(2)}%`;
    
    // Afficher le montant PER déductible vs versé si l'élément existe
    const perDeductibleElement = document.getElementById("per-deductible");
    if (perDeductibleElement) {
        const perVersement = resultats.perVersement;
        const perDeductible = resultats.perDeductible;
        
        perDeductibleElement.textContent = `${perDeductible.toLocaleString('fr-FR')} € / ${perVersement.toLocaleString('fr-FR')} €`;
        
        // Si le PER est plafonné, afficher un message d'alerte
        const perAlerte = document.getElementById("per-alerte");
        if (perAlerte) {
            if (perDeductible < perVersement) {
                const constantes = PatrimoineSimulator.getConstantesPER();
                perAlerte.textContent = `⚠️ Attention: Votre versement PER dépasse le plafond de déductibilité. Part non déductible: ${resultats.perNonDeductible.toLocaleString('fr-FR')} €`;
                perAlerte.style.display = "block";
            } else {
                perAlerte.style.display = "none";
            }
        }
    }
    
    // Afficher les détails des plafonds si les éléments existent
    const plafondActuelElement = document.getElementById("plafond-actuel");
    const plafondTotalElement = document.getElementById("plafond-total");
    
    if (plafondActuelElement) plafondActuelElement.textContent = `${resultats.plafondPERActuel.toLocaleString('fr-FR')} €`;
    if (plafondTotalElement) plafondTotalElement.textContent = `${resultats.plafondPERTotalDispo.toLocaleString('fr-FR')} €`;

    // Mise à jour du tableau récapitulatif des taux si disponible
    const recapCharges = document.getElementById("recap-charges");
    const recapMarginal = document.getElementById("recap-marginal");
    
    if (recapCharges) recapCharges.textContent = `${(charges * 100).toFixed(1)}%`;
    if (recapMarginal) recapMarginal.textContent = `${PatrimoineSimulator.getTauxMarginal(resultats.netImposableSansPER).toFixed(1)}%`;

    // Si des visualisations graphiques sont présentes
    if (document.getElementById('tax-comparison-chart')) {
        updateTaxComparisonChart(resultats);
    }
}

// NOUVELLE FONCTION: Estimation simplifiée pour l'optimisation fiscale
function estimerNetImposable(salaireBrut, tauxDeduction = 0.281) {
    return salaireBrut * (1 - tauxDeduction);
}

// NOUVELLE FONCTION: Taux de déduction par statut
function getTauxDeductionParStatut(statut) {
    switch (statut) {
        case 'fonctionnaire': return 0.24;
        case 'cadre': return 0.30;
        case 'salarie':
        default: return 0.281;
    }
}

// NOUVELLE FONCTION: Générer une synthèse simplifiée pour le PER
function genererSynthesePER(salaireBrut, statut = 'salarie', plafondsReportables = null) {
    const tauxDeduction = getTauxDeductionParStatut(statut);
    const netImposable = estimerNetImposable(salaireBrut, tauxDeduction);
    
    // Utiliser la nouvelle fonction de calcul des plafonds
    const reportables = plafondsReportables || { n1: 0, n2: 0, n3: 0 };
    const { plafondN, plafondsParAnnee, totalDisponible } = 
        PatrimoineSimulator.calculerPlafondsPER(netImposable, reportables);
    
    const tmi = PatrimoineSimulator.getTauxMarginal(netImposable);
    const economie = plafondN * (tmi / 100);
    const constantes = PatrimoineSimulator.getConstantesPER();
    
    // Calcul du versement optimal pour changer de tranche
    const optimisation = PatrimoineSimulator.calculerVersementOptimalPourChangerTranche(netImposable, reportables);

    return {
        tmi: tmi,
        plafondVersement: plafondN,
        plafondTotal: totalDisponible,
        economieImpot: economie,
        netImposable: netImposable,
        versementOptimal: optimisation.versementOptimal,
        economieOptimale: optimisation.economieImpot,
        nouvelleTMI: optimisation.nouvelleTMI,
        messageHTML: `
            <div class="bg-blue-900 bg-opacity-20 p-5 rounded-lg my-4">
                <h3 class="text-lg font-bold text-green-400 mb-3">Synthèse de votre situation PER</h3>
                <p>Avec un salaire brut annuel de <span class="font-semibold text-white">${salaireBrut.toLocaleString('fr-FR')} €</span> :</p>
                
                <div class="bg-blue-800 bg-opacity-30 p-3 rounded-lg my-3">
                    <p class="flex justify-between mb-2">
                        <span>Votre TMI est de</span> 
                        <span class="font-semibold text-white">${tmi} %</span>
                    </p>
                    <p class="flex justify-between">
                        <span>Le PER est</span> 
                        <span class="font-semibold ${tmi >= 30 ? 'text-green-400' : 'text-blue-300'}">${tmi >= 30 ? 'très intéressant' : 'potentiellement intéressant'}</span>
                    </p>
                </div>
                
                <div class="mt-3">
                    <p class="flex justify-between mb-2">
                        <span>Plafond PER année N</span>
                        <span class="font-semibold text-green-400">${plafondN.toLocaleString('fr-FR')} €</span>
                    </p>
                    ${totalDisponible > plafondN ? `
                    <p class="flex justify-between mb-2">
                        <span>Plafond total (avec reports N-1/N-2/N-3)</span>
                        <span class="font-semibold text-green-400">${totalDisponible.toLocaleString('fr-FR')} €</span>
                    </p>
                    ` : ''}
                    <p class="flex justify-between mb-2">
                        <span>Économie d'impôt (versement max)</span>
                        <span class="font-semibold text-green-400">${economie.toLocaleString('fr-FR')} €</span>
                    </p>
                </div>
                
                ${optimisation.versementOptimal > 0 && optimisation.versementOptimal < plafondN ? `
                <div class="bg-purple-900 bg-opacity-30 p-3 rounded-lg my-3 border-l-4 border-purple-400">
                    <h4 class="font-bold text-purple-300 mb-2"><i class="fas fa-chart-line mr-2"></i>Versement optimal (changement de tranche)</h4>
                    <p class="flex justify-between mb-1">
                        <span>Versement pour passer à ${optimisation.nouvelleTMI}%</span>
                        <span class="font-semibold text-purple-300">${optimisation.versementOptimal.toLocaleString('fr-FR')} €</span>
                    </p>
                    <p class="flex justify-between">
                        <span>Économie d'impôt</span>
                        <span class="font-semibold text-purple-300">${optimisation.economieImpot.toLocaleString('fr-FR')} €</span>
                    </p>
                </div>
                ` : ''}
                
                <div class="bg-gray-800 bg-opacity-50 p-3 rounded-lg my-3 text-sm">
                    <p class="text-gray-400 mb-1">
                        <i class="fas fa-info-circle mr-1"></i> 
                        Plafonds 2024 : min ${constantes.PLAFOND_PER_MIN.toLocaleString('fr-FR')} € / max ${constantes.PLAFOND_PER_MAX.toLocaleString('fr-FR')} €
                    </p>
                    <p class="text-gray-400">
                        <i class="fas fa-history mr-1"></i> 
                        Les plafonds non utilisés sont reportables sur 3 ans (N-1, N-2, N-3)
                    </p>
                </div>
                
                <div class="bg-green-900 bg-opacity-20 p-3 rounded border-l-4 border-green-400 mt-4">
                    <p><i class="fas fa-lightbulb text-green-400 mr-2"></i> <strong>À savoir :</strong> Votre PER reste bloqué jusqu'à la retraite, sauf exceptions dont l'achat de votre résidence principale.</p>
                </div>
            </div>
        `
    };
}

// NOUVELLE FONCTION: Afficher la synthèse PER
function afficherSynthesePER() {
    const brutInput = document.getElementById('salaire-brut-simple');
    if (!brutInput) return;
    
    const brut = parseFloat(brutInput.value);
    if (!brut || brut <= 0) {
        // Afficher un message d'erreur
        const resultatElement = document.getElementById('resultat-synthese');
        if (resultatElement) {
            resultatElement.innerHTML = `
                <div class="bg-red-900 bg-opacity-20 p-3 rounded border-l-4 border-red-400 mt-4">
                    <p><i class="fas fa-exclamation-triangle text-red-400 mr-2"></i> Veuillez entrer un salaire brut annuel valide.</p>
                </div>
            `;
        }
        return;
    }
    
    const statutSelect = document.getElementById('statut-simple');
    const statut = statutSelect ? statutSelect.value : 'salarie';
    
    // Récupérer les plafonds reportables si les champs existent
    const plafondsReportables = {
        n1: parseFloat(document.getElementById('plafond-n1-simple')?.value) || 0,
        n2: parseFloat(document.getElementById('plafond-n2-simple')?.value) || 0,
        n3: parseFloat(document.getElementById('plafond-n3-simple')?.value) || 0
    };
    
    const synthese = genererSynthesePER(brut, statut, plafondsReportables);
    
    // Afficher la synthèse
    const resultatElement = document.getElementById('resultat-synthese');
    if (resultatElement) {
        resultatElement.innerHTML = synthese.messageHTML;
        
        // Optionnel: mise à jour du formulaire principal si présent
        const brutPrincipal = document.getElementById('brut-annuel');
        const perPourcentage = document.getElementById('per-pourcentage');
        
        if (brutPrincipal) brutPrincipal.value = brut;
        if (perPourcentage) perPourcentage.value = '10'; // 10% par défaut
        
        // Scroll jusqu'aux résultats
        resultatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Met à jour le graphique de comparaison fiscale si existant
 */
function updateTaxComparisonChart(resultats) {
    const ctx = document.getElementById('tax-comparison-chart');
    if (!ctx) return;
    
    const data = PatrimoineSimulator.exporterDataGraphique().fiscal;
    
    if (!window.taxComparisonChart) {
        window.taxComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: data.datasets
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Comparaison avec et sans PER'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += new Intl.NumberFormat('fr-FR', { 
                                    style: 'currency', 
                                    currency: 'EUR' 
                                }).format(context.raw);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('fr-FR', { 
                                    style: 'currency', 
                                    currency: 'EUR',
                                    maximumFractionDigits: 0
                                }).format(value);
                            }
                        }
                    }
                }
            }
        });
    } else {
        // Mise à jour des données seulement
        window.taxComparisonChart.data.datasets = data.datasets;
        window.taxComparisonChart.update();
    }
}

// Exporter le module pour utilisation externe
window.PatrimoineSimulator = PatrimoineSimulator;

// Exporter les nouvelles fonctions
window.genererSynthesePER = genererSynthesePER;
window.afficherSynthesePER = afficherSynthesePER;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-analyser-per');
    if (btn) {
        btn.addEventListener('click', afficherSynthesePER);
    }
});
