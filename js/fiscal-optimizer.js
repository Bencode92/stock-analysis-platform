/**
 * fiscal-optimizer.js - Module de simulation patrimoniale complète
 * Ce module gère toute la logique de simulation fiscale, calcul de dépenses et allocation d'actifs
 * TradePulse Finance Intelligence Platform
 * 
 * Version 2.1 - Interface V1 "Les Échos" avec tableau comparatif 3 scénarios
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
        cadre: 0.25,        // ~25% pour un cadre (charges légèrement plus élevées)
        fonctionnaire: 0.17, // ~17% pour un fonctionnaire
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
     * @param {number} nbParts - Nombre de parts (optionnel, utilise state.nbParts par défaut)
     * @returns {number} Taux marginal d'imposition en pourcentage
     */
    function getTauxMarginal(revenuImposable, nbParts = null) {
        const parts = nbParts || state.nbParts || 1;
        const revenuParPart = revenuImposable / parts;
        
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
     * @param {number} nbParts - Nombre de parts fiscales (optionnel)
     * @returns {Object} { versementOptimal, nouvelleTMI, allocationParAnnee, economieImpot }
     */
    function calculerVersementOptimalPourChangerTranche(revenuImposable, plafondsReportables = null, nbParts = null) {
        const reportables = plafondsReportables || state.perPlafondsReportables;
        const parts = nbParts || state.nbParts || 1;
        const revenuParPart = revenuImposable / parts;
        
        const { plafondsParAnnee, totalDisponible } = calculerPlafondsPER(revenuImposable, reportables);
        
        // Trouver la tranche actuelle
        let trancheIndex = 0;
        for (let i = 0; i < TRANCHES_IMPOT.length; i++) {
            if (revenuParPart > TRANCHES_IMPOT[i].min) {
                trancheIndex = i;
            }
        }
        
        // Déjà dans la tranche à 0% ou 11% => pas d'optimisation intéressante
        if (trancheIndex <= 1) {
            return {
                versementOptimal: 0,
                nouvelleTMI: trancheIndex === 0 ? 0 : 11,
                ancienneTMI: trancheIndex === 0 ? 0 : 11,
                allocationParAnnee: { n3: 0, n2: 0, n1: 0, n: 0 },
                totalPlafondDisponible: totalDisponible,
                economieImpot: 0,
                peutChangerTranche: false,
                message: trancheIndex === 0 
                    ? "Vous êtes déjà dans la tranche à 0%, pas besoin de versement PER pour optimisation fiscale."
                    : "Vous êtes dans la tranche à 11%, descendre à 0% n'est généralement pas optimal."
            };
        }
        
        const trancheCourante = TRANCHES_IMPOT[trancheIndex];
        const ancienneTMI = trancheCourante.taux * 100;
        
        // On veut ramener le revenu PAR PART sous le MIN de la tranche courante
        const seuilSortieTranche = trancheCourante.min;
        const montantParPartNecessaire = Math.max(0, revenuParPart - seuilSortieTranche);
        const montantTotalNecessaire = montantParPartNecessaire * parts;
        
        // Le versement optimal est le MIN entre ce qu'il faut et ce qui est disponible
        const versementOptimal = Math.min(montantTotalNecessaire, totalDisponible);
        
        // Répartition du versement sur les plafonds
        const { utilisation, perDeductible } = allouerVersementPER(versementOptimal, plafondsParAnnee);
        
        // Calcul de la nouvelle TMI
        const nouveauRevenuImposable = revenuImposable - perDeductible;
        const nouvelleTMI = getTauxMarginal(nouveauRevenuImposable, parts);
        
        // Calcul de l'économie d'impôt
        const impotAvant = calculerImpot(revenuImposable, parts);
        const impotApres = calculerImpot(nouveauRevenuImposable, parts);
        const economieImpot = impotAvant - impotApres;
        
        const peutChangerTranche = versementOptimal >= montantTotalNecessaire;
        
        return {
            versementOptimal: Math.round(versementOptimal),
            nouvelleTMI,
            ancienneTMI,
            allocationParAnnee: utilisation,
            totalPlafondDisponible: totalDisponible,
            economieImpot: Math.round(economieImpot),
            peutChangerTranche,
            message: peutChangerTranche 
                ? `En versant ${Math.round(versementOptimal).toLocaleString('fr-FR')} €, vous passez de la TMI ${ancienneTMI}% à ${nouvelleTMI}%.`
                : `Plafond insuffisant pour sortir complètement de la tranche ${ancienneTMI}%. Versement max: ${Math.round(totalDisponible).toLocaleString('fr-FR')} €`
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
        state.perPourcentage = params.perPourcentage !== undefined ? params.perPourcentage : state.perPourcentage;
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

    /**
     * Retourne les tranches d'imposition pour usage externe
     * @returns {Array} Tranches d'imposition
     */
    function getTranchesImpot() {
        return [...TRANCHES_IMPOT];
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
        getTauxCharges,
        calculerImpot,
        calculerPlafondsPER,
        allouerVersementPER,
        calculerVersementOptimalPourChangerTranche,
        getConstantesPER,
        getTranchesImpot,
        // Exporter l'état actuel (pour inspection et debugging)
        getState: () => ({...state})
    };
})();

// ============================================================================
// FONCTIONS UI - Interface V1 "Les Échos"
// ============================================================================

/**
 * Fonction utilitaire de formatage des nombres
 */
function formatMontant(n) {
    return Math.round(n).toLocaleString('fr-FR');
}

/**
 * Fonction utilitaire de formatage des pourcentages
 */
function formatPct(n) {
    return `${n.toFixed(1)} %`;
}

/**
 * Lance un scénario de simulation PER indépendant
 * @param {Object} params - Paramètres du scénario
 * @returns {Object} Résultats de la simulation
 */
function runScenarioPER({ revenuBrut, statut, nbParts, plafondsReportables, perVersement }) {
    const tauxCharges = PatrimoineSimulator.getTauxCharges(statut);
    const perPourcentage = revenuBrut > 0 ? (perVersement / revenuBrut) : 0;
    
    // On ne reset pas le state global, on fait un calcul isolé
    const revenuProNet = revenuBrut * (1 - tauxCharges);
    const { plafondN, plafondsParAnnee, totalDisponible } = 
        PatrimoineSimulator.calculerPlafondsPER(revenuProNet, plafondsReportables);
    
    const { utilisation, perDeductible, perNonDeductible } = 
        PatrimoineSimulator.allouerVersementPER(perVersement, plafondsParAnnee);
    
    const netImposableSansPER = revenuProNet;
    const netImposableAvecPER = revenuProNet - perDeductible;
    
    const impotSansPER = PatrimoineSimulator.calculerImpot(netImposableSansPER, nbParts);
    const impotAvecPER = PatrimoineSimulator.calculerImpot(netImposableAvecPER, nbParts);
    
    return {
        revenuProNet,
        netImposableSansPER,
        netImposableAvecPER,
        impotSansPER,
        impotAvecPER,
        gainFiscal: impotSansPER - impotAvecPER,
        perVersement,
        perDeductible,
        perNonDeductible,
        plafondN,
        plafondTotal: totalDisponible,
        utilisation,
        plafondsParAnnee,
        tmiAvant: PatrimoineSimulator.getTauxMarginal(netImposableSansPER, nbParts),
        tmiApres: PatrimoineSimulator.getTauxMarginal(netImposableAvecPER, nbParts)
    };
}

/**
 * Affiche la synthèse PER V2 avec tableau comparatif 3 scénarios
 * Compatible avec l'interface V1 "Les Échos"
 */
function afficherSynthesePER() {
    // Récupération des éléments du DOM
    const brutInput = document.getElementById('salaire-brut-simple');
    const statutSelect = document.getElementById('statut-simple');
    const situationSelect = document.getElementById('situation-familiale');
    const n3Input = document.getElementById('plafond-n3-simple');
    const n2Input = document.getElementById('plafond-n2-simple');
    const n1Input = document.getElementById('plafond-n1-simple');
    const resultatElement = document.getElementById('resultat-synthese');
    const alerteN3 = document.getElementById('alerte-n3');

    if (!brutInput || !resultatElement) return;

    // Parsing des valeurs
    const brut = parseFloat(brutInput.value.replace(/\s/g, '').replace(',', '.'));
    
    if (!brut || brut <= 0) {
        resultatElement.innerHTML = `
            <div class="bg-red-900/30 border border-red-700 rounded-xl p-4 text-sm text-red-200">
                <p><i class="fas fa-exclamation-triangle mr-2"></i><strong>Erreur :</strong> veuillez saisir un salaire brut annuel valide.</p>
            </div>
        `;
        return;
    }

    const statut = statutSelect?.value || 'salarie';
    const nbParts = parseFloat(situationSelect?.value || '1');

    const plafondsReportables = {
        n3: parseFloat(n3Input?.value?.replace(/\s/g, '') || '0') || 0,
        n2: parseFloat(n2Input?.value?.replace(/\s/g, '') || '0') || 0,
        n1: parseFloat(n1Input?.value?.replace(/\s/g, '') || '0') || 0
    };

    // Mise à jour du state global pour les autres fonctions
    PatrimoineSimulator.calculerSimulationFiscale({
        revenuBrut: brut,
        typeRevenu: statut,
        nbParts: nbParts,
        perPourcentage: 0,
        plafondsReportables: plafondsReportables
    });

    // Alerte N-3 conditionnelle
    if (alerteN3) {
        alerteN3.classList.toggle('hidden', plafondsReportables.n3 <= 0);
    }

    // Calcul des données de base
    const tauxCharges = PatrimoineSimulator.getTauxCharges(statut);
    const revenuProNet = brut * (1 - tauxCharges);
    const { plafondN, plafondsParAnnee, totalDisponible } = 
        PatrimoineSimulator.calculerPlafondsPER(revenuProNet, plafondsReportables);

    // ========== SCÉNARIO 1 : SANS PER ==========
    const scenSansPER = runScenarioPER({
        revenuBrut: brut,
        statut,
        nbParts,
        plafondsReportables,
        perVersement: 0
    });

    const revenuImposable = scenSansPER.netImposableSansPER;
    const tmiAvant = scenSansPER.tmiAvant;
    const impotAvant = scenSansPER.impotSansPER;

    // ========== SCÉNARIO 2 : OPTIMAL (changement de tranche) ==========
    const optimisation = PatrimoineSimulator.calculerVersementOptimalPourChangerTranche(
        revenuImposable, 
        plafondsReportables,
        nbParts
    );
    
    const versementOptimal = optimisation.versementOptimal;
    let scenOptimal = scenSansPER;
    let impotOptimal = impotAvant;
    let tmiApresOptimal = tmiAvant;
    let economieOptimal = 0;

    if (versementOptimal > 0) {
        scenOptimal = runScenarioPER({
            revenuBrut: brut,
            statut,
            nbParts,
            plafondsReportables,
            perVersement: versementOptimal
        });
        impotOptimal = scenOptimal.impotAvecPER;
        tmiApresOptimal = scenOptimal.tmiApres;
        economieOptimal = impotAvant - impotOptimal;
    }

    // ========== SCÉNARIO 3 : MAXIMUM (tout le plafond) ==========
    const versementMax = totalDisponible;
    let scenMax = scenSansPER;
    let impotMax = impotAvant;
    let tmiApresMax = tmiAvant;
    let economieMax = 0;

    if (versementMax > 0) {
        scenMax = runScenarioPER({
            revenuBrut: brut,
            statut,
            nbParts,
            plafondsReportables,
            perVersement: versementMax
        });
        impotMax = scenMax.impotAvecPER;
        tmiApresMax = scenMax.tmiApres;
        economieMax = impotAvant - impotMax;
    }

    // Répartition sur les plafonds pour le scénario maximum
    const repartitionMax = scenMax.utilisation || { n3: 0, n2: 0, n1: 0, n: 0 };
    
    // Calcul du total des reports
    const totalReports = plafondsReportables.n1 + plafondsReportables.n2 + plafondsReportables.n3;

    // Récupération des constantes
    const constantes = PatrimoineSimulator.getConstantesPER();

    // ========== GÉNÉRATION DU HTML ==========
    const html = `
      <div class="space-y-6">

        <!-- SYNTHÈSE -->
        <div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5">
          <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span class="text-emerald-400">📊</span> Synthèse de votre situation
          </h3>
          <div class="grid md:grid-cols-3 gap-4 text-sm">
            <div class="bg-slate-800/50 rounded-lg p-3">
              <p class="text-slate-400 mb-1">Revenu imposable estimé</p>
              <p class="text-xl font-bold text-white">${formatMontant(revenuImposable)} €</p>
            </div>
            <div class="bg-slate-800/50 rounded-lg p-3">
              <p class="text-slate-400 mb-1">Taux marginal d'imposition</p>
              <p class="text-xl font-bold ${tmiAvant >= 30 ? 'text-orange-400' : 'text-white'}">${formatPct(tmiAvant)}</p>
            </div>
            <div class="bg-slate-800/50 rounded-lg p-3">
              <p class="text-slate-400 mb-1">Plafond PER total disponible</p>
              <p class="text-xl font-bold text-emerald-400">${formatMontant(totalDisponible)} €</p>
              ${totalReports > 0 ? `
              <p class="text-xs text-slate-400 mt-1">
                dont ${formatMontant(totalReports)} € de reports
              </p>
              ` : ''}
            </div>
          </div>
          
          ${nbParts > 1 ? `
          <div class="mt-3 text-xs text-slate-400">
            <i class="fas fa-users mr-1"></i> Foyer fiscal : ${nbParts} part${nbParts > 1 ? 's' : ''}
          </div>
          ` : ''}
        </div>

        <!-- COMPARATIF SCÉNARIOS -->
        <div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5">
          <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span class="text-emerald-400">📈</span> Comparatif des scénarios
          </h3>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm text-slate-200 border-collapse">
              <thead>
                <tr class="bg-slate-800/80 text-slate-300">
                  <th class="px-3 py-3 text-left font-semibold rounded-tl-lg">Scénario</th>
                  <th class="px-3 py-3 text-right font-semibold">Versement PER</th>
                  <th class="px-3 py-3 text-right font-semibold">Impôt</th>
                  <th class="px-3 py-3 text-right font-semibold">Économie</th>
                  <th class="px-3 py-3 text-right font-semibold rounded-tr-lg">TMI après</th>
                </tr>
              </thead>
              <tbody>
                <!-- Sans PER -->
                <tr class="border-t border-slate-700 hover:bg-slate-800/30">
                  <td class="px-3 py-3">
                    <span class="text-slate-400">Sans PER</span>
                  </td>
                  <td class="px-3 py-3 text-right text-slate-400">0 €</td>
                  <td class="px-3 py-3 text-right">${formatMontant(impotAvant)} €</td>
                  <td class="px-3 py-3 text-right text-slate-400">—</td>
                  <td class="px-3 py-3 text-right">${formatPct(tmiAvant)}</td>
                </tr>

                <!-- Optimal -->
                <tr class="border-t border-slate-700 hover:bg-slate-800/30 ${versementOptimal > 0 && optimisation.peutChangerTranche ? 'bg-purple-900/20' : ''}">
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-2">
                      ${optimisation.peutChangerTranche ? '<span class="text-purple-400">★</span>' : ''}
                      <span class="${optimisation.peutChangerTranche ? 'text-purple-300 font-medium' : 'text-slate-300'}">
                        Optimal
                      </span>
                    </div>
                    <div class="text-xs text-slate-500 mt-0.5">
                      ${versementOptimal > 0 
                        ? (optimisation.peutChangerTranche 
                            ? `Passer de ${formatPct(tmiAvant)} à ${formatPct(tmiApresOptimal)}` 
                            : 'Plafond insuffisant pour changer de tranche')
                        : 'Déjà en tranche basse'}
                    </div>
                  </td>
                  <td class="px-3 py-3 text-right ${optimisation.peutChangerTranche ? 'text-purple-300 font-medium' : ''}">${formatMontant(versementOptimal)} €</td>
                  <td class="px-3 py-3 text-right">${formatMontant(impotOptimal)} €</td>
                  <td class="px-3 py-3 text-right ${economieOptimal > 0 ? 'text-emerald-400 font-medium' : 'text-slate-400'}">
                    ${economieOptimal > 0 ? `${formatMontant(economieOptimal)} €` : '—'}
                  </td>
                  <td class="px-3 py-3 text-right">${formatPct(tmiApresOptimal)}</td>
                </tr>

                <!-- Maximum -->
                <tr class="border-t border-slate-700 hover:bg-slate-800/30 bg-emerald-900/10">
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-2">
                      <span class="text-emerald-400">⬆</span>
                      <span class="text-emerald-300 font-medium">Maximum</span>
                    </div>
                    <div class="text-xs text-slate-500 mt-0.5">Tout le plafond disponible</div>
                  </td>
                  <td class="px-3 py-3 text-right text-emerald-300 font-medium">${formatMontant(versementMax)} €</td>
                  <td class="px-3 py-3 text-right">${formatMontant(impotMax)} €</td>
                  <td class="px-3 py-3 text-right text-emerald-400 font-bold">${formatMontant(economieMax)} €</td>
                  <td class="px-3 py-3 text-right">${formatPct(tmiApresMax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <i class="fas fa-info-circle"></i>
            <span>Impôt de référence (sans PER) : <strong class="text-slate-200">${formatMontant(impotAvant)} €</strong></span>
          </div>
        </div>

        <!-- RÉPARTITION SUR LES PLAFONDS -->
        ${versementMax > 0 ? `
        <div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5">
          <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span class="text-emerald-400">📋</span> Répartition sur vos plafonds
            <span class="text-xs font-normal text-slate-400">(scénario maximum)</span>
          </h3>
          
          <p class="text-sm text-slate-300 mb-4">
            Si vous versez <span class="font-bold text-emerald-400">${formatMontant(versementMax)} €</span> sur votre PER :
          </p>
          
          <div class="space-y-3">
            ${repartitionMax.n3 > 0 || plafondsReportables.n3 > 0 ? `
            <div class="flex items-center justify-between p-2 rounded-lg ${repartitionMax.n3 > 0 ? 'bg-amber-900/20 border border-amber-700/50' : 'bg-slate-800/30'}">
              <div class="flex items-center gap-2">
                <span class="text-amber-400 text-xs">⚠️</span>
                <span class="text-slate-300">N-3</span>
                <span class="text-xs text-amber-400">(périme bientôt)</span>
              </div>
              <span class="font-medium ${repartitionMax.n3 > 0 ? 'text-amber-300' : 'text-slate-500'}">${formatMontant(repartitionMax.n3)} € / ${formatMontant(plafondsReportables.n3)} €</span>
            </div>
            ` : ''}
            
            ${repartitionMax.n2 > 0 || plafondsReportables.n2 > 0 ? `
            <div class="flex items-center justify-between p-2 rounded-lg bg-slate-800/30">
              <span class="text-slate-300">N-2</span>
              <span class="font-medium ${repartitionMax.n2 > 0 ? 'text-slate-200' : 'text-slate-500'}">${formatMontant(repartitionMax.n2)} € / ${formatMontant(plafondsReportables.n2)} €</span>
            </div>
            ` : ''}
            
            ${repartitionMax.n1 > 0 || plafondsReportables.n1 > 0 ? `
            <div class="flex items-center justify-between p-2 rounded-lg bg-slate-800/30">
              <span class="text-slate-300">N-1</span>
              <span class="font-medium ${repartitionMax.n1 > 0 ? 'text-slate-200' : 'text-slate-500'}">${formatMontant(repartitionMax.n1)} € / ${formatMontant(plafondsReportables.n1)} €</span>
            </div>
            ` : ''}
            
            <div class="flex items-center justify-between p-2 rounded-lg bg-emerald-900/20 border border-emerald-700/50">
              <div class="flex items-center gap-2">
                <span class="text-emerald-400">📅</span>
                <span class="text-slate-300">Année N (2024)</span>
              </div>
              <span class="font-medium text-emerald-300">${formatMontant(repartitionMax.n)} € / ${formatMontant(plafondN)} €</span>
            </div>
          </div>
          
          <div class="mt-4 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400">
            <i class="fas fa-lightbulb text-yellow-400 mr-1"></i>
            Les plafonds sont consommés du plus ancien au plus récent (N-3 → N-2 → N-1 → N)
          </div>
        </div>
        ` : ''}

        <!-- RECOMMANDATION -->
        ${plafondsReportables.n3 > 0 ? `
        <div class="bg-amber-900/20 border border-amber-600/50 rounded-2xl p-5">
          <h3 class="text-lg font-semibold text-amber-300 mb-2 flex items-center gap-2">
            <i class="fas fa-exclamation-triangle"></i> Recommandation urgente
          </h3>
          <p class="text-sm text-slate-200">
            Vous avez <strong class="text-amber-300">${formatMontant(plafondsReportables.n3)} €</strong> de plafond N-3 
            qui <strong>périme fin 2025</strong>. Versez au moins ce montant pour ne pas le perdre !
          </p>
        </div>
        ` : ''}

        <!-- INFOS -->
        <div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-5">
          <h3 class="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <i class="fas fa-info-circle"></i> Informations
          </h3>
          <div class="grid md:grid-cols-2 gap-3 text-xs text-slate-400">
            <div class="flex items-start gap-2">
              <i class="fas fa-calculator text-slate-500 mt-0.5"></i>
              <span>Plafonds 2024 : min <strong class="text-slate-300">${formatMontant(constantes.PLAFOND_PER_MIN)} €</strong> / max <strong class="text-slate-300">${formatMontant(constantes.PLAFOND_PER_MAX)} €</strong></span>
            </div>
            <div class="flex items-start gap-2">
              <i class="fas fa-history text-slate-500 mt-0.5"></i>
              <span>Les plafonds non utilisés sont reportables sur 3 ans</span>
            </div>
            <div class="flex items-start gap-2">
              <i class="fas fa-lock text-slate-500 mt-0.5"></i>
              <span>Épargne bloquée jusqu'à la retraite (sauf exceptions)</span>
            </div>
            <div class="flex items-start gap-2">
              <i class="fas fa-home text-slate-500 mt-0.5"></i>
              <span>Déblocage anticipé possible pour achat résidence principale</span>
            </div>
          </div>
        </div>

      </div>
    `;

    resultatElement.innerHTML = html;
    resultatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// Fonction legacy pour compatibilité
function calculerFiscalite() {
    const brut = parseFloat(document.getElementById("brut-annuel")?.value);
    const charges = parseFloat(document.getElementById("taux-charges")?.value) / 100;
    const perPct = parseFloat(document.getElementById("per-pourcentage")?.value) / 100;
    
    if (!brut) return;
    
    const typeRevenuSelect = document.getElementById("type-revenu");
    const typeRevenu = typeRevenuSelect ? typeRevenuSelect.value : 'salarie';
    
    const nbPartsInput = document.getElementById("nb-parts");
    const nbParts = nbPartsInput ? parseFloat(nbPartsInput.value) || 1 : 1;
    
    const plafondsReportables = {
        n1: parseFloat(document.getElementById("plafond-n1")?.value) || 0,
        n2: parseFloat(document.getElementById("plafond-n2")?.value) || 0,
        n3: parseFloat(document.getElementById("plafond-n3")?.value) || 0
    };

    const resultats = PatrimoineSimulator.calculerSimulationFiscale({
        revenuBrut: brut,
        typeRevenu: typeRevenu,
        tauxCharges: charges,
        perPourcentage: perPct,
        nbParts: nbParts,
        plafondsReportables: plafondsReportables
    });

    // Mise à jour des éléments DOM si présents
    const elements = {
        "impot-sans-per": `${formatMontant(resultats.impotSansPER)} €`,
        "impot-avec-per": `${formatMontant(resultats.impotAvecPER)} €`,
        "gain-fiscal": `${formatMontant(resultats.gainFiscal)} €`,
        "net-sans-per": `${formatMontant(resultats.netDispoSansPER)} €`,
        "net-avec-per": `${formatMontant(resultats.netDispoAvecPER)} €`,
        "patrimoine-total": `${formatMontant(resultats.patrimoineGlobal)} €`
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });

    if (document.getElementById('tax-comparison-chart')) {
        updateTaxComparisonChart(resultats);
    }
}

// Exporter le module pour utilisation externe
window.PatrimoineSimulator = PatrimoineSimulator;

// Exporter les fonctions UI
window.afficherSynthesePER = afficherSynthesePER;
window.runScenarioPER = runScenarioPER;
window.formatMontant = formatMontant;
window.formatPct = formatPct;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    // Bouton principal d'analyse
    const btnAnalyser = document.getElementById('btn-analyser-per');
    if (btnAnalyser) {
        btnAnalyser.addEventListener('click', afficherSynthesePER);
    }

    // Toggle pour les paramètres avancés
    const toggleAvance = document.getElementById('btn-toggle-avance');
    const blocAvance = document.getElementById('bloc-avance-per');
    if (toggleAvance && blocAvance) {
        toggleAvance.addEventListener('click', () => {
            blocAvance.classList.toggle('hidden');
            // Rotation du chevron
            const icon = toggleAvance.querySelector('.icon, .fa-chevron-down, .fa-chevron-up');
            if (icon) {
                icon.classList.toggle('rotate-180');
            }
        });
    }

    // Écoute des changements sur les inputs pour mise à jour en temps réel (optionnel)
    const inputsToWatch = ['salaire-brut-simple', 'situation-familiale', 'statut-simple'];
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                // Optionnel : recalcul automatique
                // afficherSynthesePER();
            });
        }
    });
});
