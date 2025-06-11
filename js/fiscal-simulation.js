// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 3.7 - Correction CSG non déductible : séparation cash/base imposable

// Constantes pour les taux de charges sociales
const TAUX_CHARGES = {
    TNS: 0.30,                   // TNS = 30% du BRUT
    SALARIAL: 0.22,              // Charges salariales assimilé salarié
    PATRONAL_BASE: 0.45,         // Charges patronales base (PME)
    PATRONAL_MOYEN: 0.55,        // Charges patronales moyennes
    PATRONAL_MAX: 0.65           // Charges patronales max (grandes entreprises)
};

// CSG non déductible (2,4%) + CRDS (0,5%) = 2,9%
const TAUX_CSG_NON_DEDUCTIBLE = 0.029;

// Configuration des statuts pour la gestion des associés
const STATUTS_ASSOCIATES_CONFIG = {
    // Statuts strictement unipersonnels (maxAssociates = 1)
    'micro': { maxAssociates: 1, defaultAssociates: 1, label: "Micro-entreprise" },
    'ei': { maxAssociates: 1, defaultAssociates: 1, label: "Entreprise Individuelle" },
    'eurl': { maxAssociates: 1, defaultAssociates: 1, label: "EURL" },
    'eurlIS': { maxAssociates: 1, defaultAssociates: 1, label: "EURL à l'IS" },
    'sasu': { maxAssociates: 1, defaultAssociates: 1, label: "SASU" },
    
    // Statuts pluripersonnels (maxAssociates = null ou > 1)
    'sarl': { maxAssociates: 100, defaultAssociates: 2, minAssociates: 2, label: "SARL" },
    'sas': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SAS" },
    'sa': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SA", note: "Min. 7 actionnaires si cotée" },
    'snc': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SNC" },
    'sci': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SCI" },
    'selarl': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SELARL" },
    'selas': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SELAS" },
    'sca': { maxAssociates: null, defaultAssociates: 2, minAssociates: 2, label: "SCA", note: "1 commandité + 3 commanditaires min." }
};

// ========== FONCTIONS UTILITAIRES ==========

// Fonction utilitaire pour calculer le salaire brut selon le régime social
function calculerSalaireBrut(resultatEntreprise, tauxRemuneration, isTNS) {
    if (isTNS) {
        // TNS : pas de charges patronales, ratio direct
        return Math.round(resultatEntreprise * tauxRemuneration);
    } else {
        // Assimilé salarié : on déduit les charges patronales
        const TAUX_PATRONAL = 0.55; // 55% de charges patronales
        return Math.round(resultatEntreprise * tauxRemuneration / (1 + TAUX_PATRONAL));
    }
}

// Garder l'ancienne fonction pour compatibilité
function calculerSalaireBrutMax(resultatDisponible, tauxChargesPatronales = TAUX_CHARGES.PATRONAL_MOYEN) {
    return resultatDisponible / (1 + tauxChargesPatronales);
}

// Fonction pour ajuster la rémunération selon les contraintes
function ajusterRemuneration(remunerationSouhaitee, resultatDisponible, tauxCharges = 0.55) {
    const coutTotal = remunerationSouhaitee * (1 + tauxCharges);
    
    if (coutTotal > resultatDisponible) {
        return Math.floor(resultatDisponible / (1 + tauxCharges));
    }
    
    return remunerationSouhaitee;
}

// Fonction pour calculer l'IS avec barème progressif
function calculerISProgressif(resultat) {
    if (resultat <= 0) return 0;
    
    let is = 0;
    
    // Première tranche : 15% jusqu'à 42 500€
    if (resultat <= 42500) {
        is = resultat * 0.15;
    } else {
        // 15% sur les premiers 42 500€
        is = 42500 * 0.15;
        // 25% sur le reste
        is += (resultat - 42500) * 0.25;
    }
    
    return Math.round(is);
}

// -------------------------------------------------------
// NOUVEAU: Fallback local si la librairie externe n'est pas chargée
function choisirFiscaliteDividendesLocal(divBruts, tmiPct = 30) {
    const pfu = divBruts * 0.30;                     // PFU 30 %
    const prog = divBruts * 0.60 * (tmiPct/100)      // IR progressif après abattement 40%
                 + divBruts * 0.172;                 // Prélèvements sociaux
    return (prog < pfu)
        ? { total: Math.round(prog), methode:'PROGRESSIF', economie: Math.round(pfu-prog) }
        : { total: Math.round(pfu),  methode:'PFU',        economie:0 };
}

// Fallback local pour calculer la TMI
function calculerTMI(revenuImposable) {
    if (revenuImposable <= 11497) return 0;
    if (revenuImposable <= 26037) return 11;
    if (revenuImposable <= 74545) return 30;
    if (revenuImposable <= 160336) return 41;
    return 45;
}

// NOUVEAU : Fonction de calcul progressif de l'IR en fallback (toujours utilisée)
function calculateProgressiveIRFallback(revenuImposable) {
    const tranches = [
        { max: 11497, taux: 0 },      // 0% jusqu'à 11 497€
        { max: 26037, taux: 0.11 },   // 11% jusqu'à 26 037€
        { max: 74545, taux: 0.30 },   // 30% jusqu'à 74 545€
        { max: 160336, taux: 0.41 },  // 41% jusqu'à 160 336€
        { max: Infinity, taux: 0.45 } // 45% au-delà
    ];
    
    let impot = 0;
    let resteImposable = revenuImposable;
    
    for (let i = 0; i < tranches.length; i++) {
        const tranche = tranches[i];
        const minTranche = i === 0 ? 0 : tranches[i-1].max;
        const maxTranche = tranche.max;
        
        if (resteImposable > 0) {
            const montantDansTranche = Math.min(resteImposable, maxTranche - minTranche);
            impot += montantDansTranche * tranche.taux;
            resteImposable -= montantDansTranche;
        }
    }
    
    return Math.round(impot);
}
// -------------------------------------------------------

// MODIFIÉ : Helper pour calculer les dividendes IS avec optimisation fiscale
function calculerDividendesIS(resultatApresIS, partAssocie, capitalDetenu, isTNS = false, isGerantMajoritaire = false, tmiActuel = 30, revenuImposable = 0) {
    const dividendesBrutsSociete = Math.max(0, resultatApresIS);
    const dividendesBrutsAssocie = Math.floor(dividendesBrutsSociete * partAssocie);
    
    let cotTNSDiv = 0;
    if (isTNS && isGerantMajoritaire && dividendesBrutsAssocie > 0) {
        if (window.FiscalUtils) {
            cotTNSDiv = window.FiscalUtils.cotTNSDividendes(dividendesBrutsAssocie, capitalDetenu);
        } else {
            const baseTNSDiv = Math.max(0, dividendesBrutsAssocie - 0.10 * capitalDetenu);
            cotTNSDiv = Math.floor(baseTNSDiv * TAUX_CHARGES.TNS);
        }
    }
    
    // NOUVEAU : Choix optimal entre PFU et barème progressif avec fallback
    let prelevementForfaitaire = 0;
    let methodeDividendes = '';
    let economieMethode = 0;
    
    if (dividendesBrutsAssocie > 0) {
        let divTax;
        if (window.FiscalUtils?.choisirFiscaliteDividendes) {
            divTax = window.FiscalUtils.choisirFiscaliteDividendes(
                dividendesBrutsAssocie, tmiActuel, revenuImposable);
        } else {
            divTax = choisirFiscaliteDividendesLocal(dividendesBrutsAssocie, tmiActuel);
        }
        prelevementForfaitaire = divTax.total;
        methodeDividendes = divTax.methode;
        economieMethode = divTax.economie;
    }
    
    const dividendesNets = dividendesBrutsAssocie - prelevementForfaitaire - cotTNSDiv;
    
    return {
        dividendesBrutsSociete,
        dividendesBrutsAssocie,
        cotTNSDiv,
        prelevementForfaitaire,
        dividendesNets,
        capitalDetenu,
        methodeDividendes,     // NOUVEAU
        economieMethode        // NOUVEAU
    };
}

// ========== CLASSE PRINCIPALE ==========

class SimulationsFiscales {
    
    /**
     * Normalise les paramètres d'associés selon le type de statut
     * @param {Object} params - Paramètres d'entrée
     * @param {string} statutType - Type de statut juridique
     * @returns {Object} Paramètres normalisés
     */
    static normalizeAssociatesParams(params, statutType) {
        const config = STATUTS_ASSOCIATES_CONFIG[statutType];
        if (!config) return params;
        
        // Copier les params pour ne pas modifier l'original
        const normalizedParams = { ...params };
        
        // Si statut unipersonnel, forcer à 1 associé / 100%
        if (config.maxAssociates === 1) {
            normalizedParams.nbAssocies = 1;
            normalizedParams.partAssocie = 1;
            normalizedParams.partAssociePct = 100;
            return normalizedParams;
        }
        
        // Pour les statuts pluripersonnels, utiliser les valeurs fournies ou les défauts
        if (!normalizedParams.nbAssocies || normalizedParams.nbAssocies < 1) {
            normalizedParams.nbAssocies = config.defaultAssociates;
        }
        
        // Si pas de part spécifiée, calculer une répartition égale
        if (normalizedParams.partAssocie === undefined || normalizedParams.partAssocie === null) {
            if (normalizedParams.partAssociePct !== undefined) {
                normalizedParams.partAssocie = normalizedParams.partAssociePct / 100;
            } else {
                // Répartition égale par défaut
                normalizedParams.partAssocie = 1 / normalizedParams.nbAssocies;
                normalizedParams.partAssociePct = 100 / normalizedParams.nbAssocies;
            }
        } else if (normalizedParams.partAssociePct === undefined) {
            normalizedParams.partAssociePct = normalizedParams.partAssocie * 100;
        }
        
        // Unifier les noms de paramètres
        if (normalizedParams.partPresident !== undefined) {
            normalizedParams.partAssocie = normalizedParams.partPresident;
            delete normalizedParams.partPresident;
        }
        if (normalizedParams.partPDG !== undefined) {
            normalizedParams.partAssocie = normalizedParams.partPDG;
            delete normalizedParams.partPDG;
        }
        if (normalizedParams.partAssociePrincipal !== undefined) {
            normalizedParams.partAssocie = normalizedParams.partAssociePrincipal;
            delete normalizedParams.partAssociePrincipal;
        }
        
        return normalizedParams;
    }
    
    // MICRO-ENTREPRISE
    static simulerMicroEntreprise(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'micro');
        const { ca, typeMicro = 'BIC', modeExpert = true, versementLiberatoire = false } = normalizedParams;
        
        // Utiliser les plafonds depuis legalStatuses si disponible
        const plafonds = {
            'BIC_VENTE': 188700,
            'BIC_SERVICE': 77700,
            'BNC': 77700
        };
        
        // Taux d'abattement
        const abattements = {
            'BIC_VENTE': 0.71,
            'BIC_SERVICE': 0.50,
            'BNC': 0.34
        };
        
        // Taux de cotisations sociales
        const tauxCotisations = {
            'BIC_VENTE': 0.123,
            'BIC_SERVICE': 0.212,
            'BNC': 0.246
        };
        
        // Taux de versement fiscal libératoire (VFL)
        const tauxVFL = {
            'BIC_VENTE': 0.01,
            'BIC_SERVICE': 0.017,
            'BNC': 0.022
        };
        
        // Déterminer le type de Micro
        let typeEffectif;
        if (typeMicro === 'BIC_VENTE' || typeMicro === 'vente') {
            typeEffectif = 'BIC_VENTE';
        } else if (typeMicro === 'BIC_SERVICE' || typeMicro === 'BIC' || typeMicro === 'service') {
            typeEffectif = 'BIC_SERVICE';
        } else {
            typeEffectif = 'BNC';
        }
        
        // Vérifier si le CA dépasse le plafond
        if (ca > plafonds[typeEffectif]) {
            return {
                compatible: false,
                message: `CA supérieur au plafond micro-entreprise de ${plafonds[typeEffectif]}€`
            };
        }
        
        // Calcul des cotisations sociales
        const cotisationsSociales = Math.round(ca * tauxCotisations[typeEffectif]);
        
        // Calcul du revenu imposable après abattement
        const revenuImposable = Math.round(ca * (1 - abattements[typeEffectif]));
        
        // NOUVEAU : Calcul automatique de la TMI
        const tmiReel = window.FiscalUtils 
            ? window.FiscalUtils.getTMI(revenuImposable)
            : calculerTMI(revenuImposable);
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        
        if (versementLiberatoire) {
            impotRevenu = Math.round(ca * tauxVFL[typeEffectif]);
        } else {
            // Toujours utiliser le calcul progressif
            if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(revenuImposable);
            } else {
                impotRevenu = calculateProgressiveIRFallback(revenuImposable);
            }
        }
        
        // Calcul du revenu net après impôt
        const revenuNetApresImpot = ca - cotisationsSociales - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'Micro-entreprise',
            typeMicro: typeEffectif,
            abattement: abattements[typeEffectif] * 100 + '%',
            revenuImposable: revenuImposable,
            cotisationsSociales: cotisationsSociales,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100,
            versementLiberatoire: versementLiberatoire,
            modeExpert: true, // Toujours en mode expert
            tmiReel: tmiReel,
            // Infos associés (toujours 1 pour micro)
            nbAssocies: 1,
            partAssocie: 1,
            partAssociePct: 100
        };
    }
    
    // ENTREPRISE INDIVIDUELLE AU RÉGIME RÉEL - CORRIGÉ
    static simulerEI(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'ei');
        const { ca, tauxMarge = 0.3, modeExpert = true } = normalizedParams;
        
        // Calcul du bénéfice avant cotisations
        const beneficeAvantCotisations = Math.round(ca * tauxMarge);
        
        // Utiliser la fonction utilitaire pour calculer les cotisations TNS
        let cotisationsSociales;
        if (window.FiscalUtils) {
            cotisationsSociales = window.FiscalUtils.cotisationsTNSSurBenefice(beneficeAvantCotisations);
        } else {
            cotisationsSociales = Math.round(beneficeAvantCotisations * TAUX_CHARGES.TNS);
        }
        
        // Portion de CSG non déductible que l'on doit ré-ajouter
        const csgNonDeductible = Math.round(beneficeAvantCotisations * TAUX_CSG_NON_DEDUCTIBLE);
        
        // NOUVEAU : Séparer cash et base imposable
        const cashAvantIR = beneficeAvantCotisations - cotisationsSociales;
        const baseImposableIR = cashAvantIR + csgNonDeductible;
        
        // NOUVEAU : Calcul automatique de la TMI
        const tmiReel = window.FiscalUtils 
            ? window.FiscalUtils.getTMI(baseImposableIR)
            : calculerTMI(baseImposableIR);
        
        // MODIFIÉ : Toujours utiliser le calcul progressif
        let impotRevenu;
        if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(baseImposableIR);
        } else {
            impotRevenu = calculateProgressiveIRFallback(baseImposableIR);
        }
        
        // Calcul du revenu net après impôt
        const revenuNetApresImpot = cashAvantIR - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'Entreprise Individuelle',
            tauxMarge: tauxMarge * 100 + '%',
            beneficeAvantCotisations: beneficeAvantCotisations,
            cotisationsSociales: cotisationsSociales,
            csgNonDeductible: csgNonDeductible,
            cashAvantIR: cashAvantIR,                    // NOUVEAU
            baseImposableIR: baseImposableIR,            // NOUVEAU
            beneficeApresCotisations: cashAvantIR,       // Pour compatibilité temporaire
            beneficeImposable: baseImposableIR,          // Pour clarté
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100,
            tmiReel: tmiReel,
            modeExpert: true, // Toujours en mode expert
            // Infos associés (toujours 1 pour EI)
            nbAssocies: 1,
            partAssocie: 1,
            partAssociePct: 100
        };
    }
    
    // EURL - CORRIGÉ
    static simulerEURL(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'eurl');
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, optionIS = false, modeExpert = true, capitalSocial = 1 } = normalizedParams;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Simulation selon le régime d'imposition
        if (!optionIS) {
            // Régime IR (transparence fiscale) - CORRIGÉ
            const baseCalculTNS = resultatEntreprise;
            
            let cotisationsSociales;
            if (window.FiscalUtils) {
                cotisationsSociales = window.FiscalUtils.cotisationsTNSSurBenefice(baseCalculTNS);
            } else {
                cotisationsSociales = Math.round(baseCalculTNS * TAUX_CHARGES.TNS);
            }
            
            // Portion de CSG non déductible 
            const csgNonDeductible = Math.round(resultatEntreprise * TAUX_CSG_NON_DEDUCTIBLE);
            
            // NOUVEAU : Séparer cash et base imposable
            const cashAvantIR = resultatEntreprise - cotisationsSociales;
            const baseImposableIR = cashAvantIR + csgNonDeductible;
            
            // NOUVEAU : Calcul automatique de la TMI
            const tmiReel = window.FiscalUtils 
                ? window.FiscalUtils.getTMI(baseImposableIR)
                : calculerTMI(baseImposableIR);
            
            // MODIFIÉ : Toujours utiliser le calcul progressif
            let impotRevenu;
            if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(baseImposableIR);
            } else {
                impotRevenu = calculateProgressiveIRFallback(baseImposableIR);
            }
            
            const revenuNetApresImpot = cashAvantIR - impotRevenu;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "EURL à l'IR",
                tauxMarge: tauxMarge * 100 + '%',
                resultatAvantRemuneration: resultatEntreprise,
                remuneration: resultatEntreprise,
                resultatApresRemuneration: 0,
                cotisationsSociales: cotisationsSociales,
                csgNonDeductible: csgNonDeductible,
                cashAvantIR: cashAvantIR,                    // NOUVEAU
                baseImposableIR: baseImposableIR,            // NOUVEAU
                beneficeImposable: baseImposableIR,          // Pour clarté
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                revenuNetTotal: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100,
                baseCalculTNS: baseCalculTNS,
                tmiReel: tmiReel,
                modeExpert: true, // Toujours en mode expert
                // Infos associés
                nbAssocies: 1,
                partAssocie: 1,
                partAssociePct: 100
            };
        } else {
            // Régime IS - CORRIGÉ : utiliser la nouvelle fonction
            const remunerationSouhaitee = calculerSalaireBrut(resultatEntreprise, tauxRemuneration, true); // true = TNS
            
            const remuneration = ajusterRemuneration(remunerationSouhaitee, resultatEntreprise, 0.30);
            
            let cotisationsSociales;
            if (window.FiscalUtils) {
                cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(remuneration);
            } else {
                cotisationsSociales = Math.round(remuneration * TAUX_CHARGES.TNS);
            }
            
            const coutRemunerationEntreprise = remuneration + cotisationsSociales;
            const resultatApresRemuneration = resultatEntreprise - coutRemunerationEntreprise;
            const ratioEffectif = coutRemunerationEntreprise / resultatEntreprise;
            
            const remunerationNetteSociale = remuneration - cotisationsSociales;
            
            // NOUVEAU : Calcul automatique de la TMI
            const tmiReel = window.FiscalUtils 
                ? window.FiscalUtils.getTMI(remunerationNetteSociale)
                : calculerTMI(remunerationNetteSociale);
            
            // MODIFIÉ : Toujours utiliser le calcul progressif
            let impotRevenu;
            if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(remunerationNetteSociale);
            } else {
                impotRevenu = calculateProgressiveIRFallback(remunerationNetteSociale);
            }
            
            // CORRIGÉ : Utiliser directement le calcul progressif de l'IS
            const is = calculerISProgressif(resultatApresRemuneration);
            
            const resultatApresIS = resultatApresRemuneration - is;
            
            // MODIFIÉ : Utiliser le helper avec le TMI calculé et le revenu imposable
            const dividendesInfo = calculerDividendesIS(
                resultatApresIS, 
                1, // EURL = 1 associé
                capitalSocial,
                true, // TNS
                true,  // Toujours majoritaire en EURL
                tmiReel, // TMI calculé
                remunerationNetteSociale // Revenu imposable
            );
            
            const revenuNetSalaire = remunerationNetteSociale - impotRevenu;
            const revenuNetTotal = revenuNetSalaire + dividendesInfo.dividendesNets;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "EURL à l'IS",
                tauxMarge: tauxMarge * 100 + '%',
                resultatAvantRemuneration: resultatEntreprise,
                remuneration: remuneration,
                resultatApresRemuneration: resultatApresRemuneration,
                cotisationsSociales: cotisationsSociales,
                remunerationNetteSociale: remunerationNetteSociale,
                impotRevenu: impotRevenu,
                revenuNetSalaire: revenuNetSalaire,
                is: is,
                resultatApresIS: resultatApresIS,
                dividendes: dividendesInfo.dividendesBrutsAssocie,
                cotTNSDiv: dividendesInfo.cotTNSDiv,
                prelevementForfaitaire: dividendesInfo.prelevementForfaitaire,
                dividendesNets: dividendesInfo.dividendesNets,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100,
                resultatEntreprise: resultatEntreprise,
                ratioEffectif: ratioEffectif,
                tmiReel: tmiReel,
                modeExpert: true, // Toujours en mode expert
                // NOUVEAU : Ajout des infos d'optimisation
                methodeDividendes: dividendesInfo.methodeDividendes,
                economieMethode: dividendesInfo.economieMethode,
                // Infos associés
                nbAssocies: 1,
                partAssocie: 1,
                partAssociePct: 100
            };
        }
    }
    
    // SASU
    static simulerSASU(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'sasu');
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, modeExpert = true, secteur = "Tous", taille = "<50" } = normalizedParams;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // CORRIGÉ : utiliser la nouvelle fonction
        const remunerationSouhaitee = calculerSalaireBrut(resultatEntreprise, tauxRemuneration, false); // false = Assimilé salarié
        
        const remuneration = ajusterRemuneration(remunerationSouhaitee, resultatEntreprise, 0.55);
        
        let chargesPatronales, chargesSalariales;
        if (window.FiscalUtils) {
            const charges = window.FiscalUtils.calculChargesSalariales(remuneration, { secteur, taille });
            chargesPatronales = charges.patronales;
            chargesSalariales = charges.salariales;
        } else {
            chargesPatronales = Math.round(remuneration * TAUX_CHARGES.PATRONAL_MOYEN);
            chargesSalariales = Math.round(remuneration * TAUX_CHARGES.SALARIAL);
        }
        
        const coutTotalEmployeur = remuneration + chargesPatronales;
        const resultatApresRemuneration = resultatEntreprise - coutTotalEmployeur;
        const ratioEffectif = coutTotalEmployeur / resultatEntreprise;
        
        const salaireNet = remuneration - chargesSalariales;
        
        // NOUVEAU : Calcul automatique de la TMI
        const tmiReel = window.FiscalUtils 
            ? window.FiscalUtils.getTMI(salaireNet)
            : calculerTMI(salaireNet);
        
        // MODIFIÉ : Toujours utiliser le calcul progressif
        let impotRevenu;
        if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(salaireNet);
        } else {
            impotRevenu = calculateProgressiveIRFallback(salaireNet);
        }
        
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // CORRIGÉ : Utiliser directement le calcul progressif de l'IS
        const is = calculerISProgressif(resultatApresRemuneration);
        
        const resultatApresIS = resultatApresRemuneration - is;
        
        // MODIFIÉ : Utiliser le helper avec le TMI calculé
        const dividendesInfo = calculerDividendesIS(
            resultatApresIS,
            1, // SASU = 1 associé
            0, // Pas de capital minimum significatif
            false, // Pas TNS
            false,  // Pas de gérant majoritaire
            tmiReel, // TMI calculé
            salaireNet // Revenu imposable
        );
        
        const revenuNetTotal = salaireNetApresIR + dividendesInfo.dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SASU',
            tauxMarge: tauxMarge * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            chargesPatronales: chargesPatronales,
            coutTotalEmployeur: coutTotalEmployeur,
            chargesSalariales: chargesSalariales,
            salaireNet: salaireNet,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            revenuNetSalaire: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendes: dividendesInfo.dividendesBrutsAssocie,
            prelevementForfaitaire: dividendesInfo.prelevementForfaitaire,
            dividendesNets: dividendesInfo.dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            secteur: secteur,
            taille: taille,
            ratioEffectif: ratioEffectif,
            modeExpert: true, // Toujours en mode expert
            tmiReel: tmiReel,
            // NOUVEAU : Ajout des infos d'optimisation
            methodeDividendes: dividendesInfo.methodeDividendes,
            economieMethode: dividendesInfo.economieMethode,
            // Infos associés
            nbAssocies: 1,
            partAssocie: 1,
            partAssociePct: 100
        };
    }

    // SARL avec gestion des associés
    static simulerSARL(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'sarl');
        
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            gerantMajoritaire = true,
            nbAssocies = normalizedParams.nbAssocies,
            partAssocie = normalizedParams.partAssocie,
            partAssociePct = normalizedParams.partAssociePct,
            modeExpert = true,
            capitalSocial = 1,
            secteur = "Tous",
            taille = "<50"
        } = normalizedParams;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Régime social différent selon que le gérant est majoritaire ou non
        let cotisationsSociales = 0;
        let salaireNet = 0;
        let resultatApresRemuneration = 0;
        let remuneration = 0;
        let ratioEffectif = 0;
        let remunerationNetteSociale = 0;
        
        if (gerantMajoritaire) {
            // Gérant majoritaire = TNS - CORRIGÉ
            const remunerationSouhaitee = calculerSalaireBrut(resultatEntreprise, tauxRemuneration, true); // true = TNS
            
            remuneration = ajusterRemuneration(remunerationSouhaitee, resultatEntreprise, 0.30);
            
            if (window.FiscalUtils) {
                cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(remuneration);
            } else {
                cotisationsSociales = Math.round(remuneration * TAUX_CHARGES.TNS);
            }
            salaireNet = remuneration - cotisationsSociales;
            remunerationNetteSociale = salaireNet;
            const coutRemunerationEntreprise = remuneration + cotisationsSociales;
            resultatApresRemuneration = resultatEntreprise - coutRemunerationEntreprise;
            ratioEffectif = coutRemunerationEntreprise / resultatEntreprise;
        } else {
            // Gérant minoritaire = assimilé salarié - CORRIGÉ
            const remunerationSouhaitee = calculerSalaireBrut(resultatEntreprise, tauxRemuneration, false); // false = Assimilé salarié
            
            remuneration = ajusterRemuneration(remunerationSouhaitee, resultatEntreprise, 0.55);
            
            let chargesPatronales, chargesSalariales;
            if (window.FiscalUtils) {
                const charges = window.FiscalUtils.calculChargesSalariales(remuneration, { secteur, taille });
                chargesPatronales = charges.patronales;
                chargesSalariales = charges.salariales;
                cotisationsSociales = chargesPatronales + chargesSalariales;
            } else {
                chargesPatronales = Math.round(remuneration * TAUX_CHARGES.PATRONAL_MOYEN);
                chargesSalariales = Math.round(remuneration * TAUX_CHARGES.SALARIAL);
                cotisationsSociales = chargesPatronales + chargesSalariales;
            }
            salaireNet = remuneration - chargesSalariales;
            remunerationNetteSociale = salaireNet;
            const coutTotalEmployeur = remuneration + chargesPatronales;
            resultatApresRemuneration = resultatEntreprise - coutTotalEmployeur;
            ratioEffectif = coutTotalEmployeur / resultatEntreprise;
        }
        
        // NOUVEAU : Calcul automatique de la TMI
        const tmiReel = window.FiscalUtils 
            ? window.FiscalUtils.getTMI(salaireNet)
            : calculerTMI(salaireNet);
        
        // MODIFIÉ : Toujours utiliser le calcul progressif
        let impotRevenu;
        if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(salaireNet);
        } else {
            impotRevenu = calculateProgressiveIRFallback(salaireNet);
        }
        
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // CORRIGÉ : Utiliser directement le calcul progressif de l'IS
        const is = calculerISProgressif(resultatApresRemuneration);
        
        const resultatApresIS = resultatApresRemuneration - is;
        
        // MODIFIÉ : Utiliser le helper avec le TMI calculé
        const capitalDetenu = capitalSocial * partAssocie;
        const dividendesInfo = calculerDividendesIS(
            resultatApresIS,
            partAssocie,
            capitalDetenu,
            gerantMajoritaire, // TNS si gérant majoritaire
            gerantMajoritaire,  // Cotisations sur dividendes si majoritaire
            tmiReel, // TMI calculé
            salaireNet // Revenu imposable
        );
        
        const revenuNetTotal = salaireNetApresIR + dividendesInfo.dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SARL',
            tauxMarge: tauxMarge * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            cotisationsSociales: cotisationsSociales,
            salaireNet: salaireNet,
            remunerationNetteSociale: remunerationNetteSociale,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            revenuNetSalaire: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            
            // Informations détaillées sur les dividendes
            dividendesBrutsSociete: dividendesInfo.dividendesBrutsSociete,
            dividendesGerant: dividendesInfo.dividendesBrutsAssocie,
            dividendes: dividendesInfo.dividendesBrutsAssocie,
            capitalDetenu: capitalDetenu,
            cotTNSDiv: dividendesInfo.cotTNSDiv,
            prelevementForfaitaire: dividendesInfo.prelevementForfaitaire,
            dividendesNets: dividendesInfo.dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            tmiReel: tmiReel,
            modeExpert: true, // Toujours en mode expert
            
            // NOUVEAU : Ajout des infos d'optimisation
            methodeDividendes: dividendesInfo.methodeDividendes,
            economieMethode: dividendesInfo.economieMethode,
            
            // Informations sur les associés
            nbAssocies: nbAssocies,
            partAssocie: partAssocie,
            partAssociePct: partAssociePct,
            
            // Autres infos
            gerantMajoritaire: gerantMajoritaire,
            secteur: secteur,
            taille: taille,
            ratioEffectif: ratioEffectif
        };
    }

    // SAS avec gestion des associés
    static simulerSAS(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'sas');
        
        const { 
            nbAssocies = normalizedParams.nbAssocies,
            partAssocie = normalizedParams.partAssocie,
            partAssociePct = normalizedParams.partAssociePct
        } = normalizedParams;
        
        // Simuler comme une SASU
        const resultSASU = this.simulerSASU(normalizedParams);
        
        if (!resultSASU.compatible) {
            return resultSASU;
        }
        
        // MODIFIÉ : Utiliser le helper avec le TMI calculé de SASU
        const dividendesInfo = calculerDividendesIS(
            resultSASU.resultatApresIS,
            partAssocie,
            0, // Pas de capital minimum significatif
            false, // Pas TNS
            false,  // Pas de gérant majoritaire
            resultSASU.tmiReel, // TMI calculé par SASU
            resultSASU.salaireNet // Revenu imposable
        );
        
        // Recalculer le revenu net total
        const revenuNetTotal = resultSASU.salaireNetApresIR + dividendesInfo.dividendesNets;
        
        return {
            ...resultSASU,
            typeEntreprise: 'SAS',
            
            // Informations complètes
            dividendesSociete: dividendesInfo.dividendesBrutsSociete,
            dividendesPresident: dividendesInfo.dividendesBrutsAssocie,
            dividendes: dividendesInfo.dividendesBrutsAssocie,
            prelevementForfaitaire: dividendesInfo.prelevementForfaitaire,
            dividendesNets: dividendesInfo.dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / normalizedParams.ca) * 100,
            
            // NOUVEAU : Ajout des infos d'optimisation
            methodeDividendes: dividendesInfo.methodeDividendes,
            economieMethode: dividendesInfo.economieMethode,
            
            // Informations sur les associés
            nbAssocies: nbAssocies,
            partAssocie: partAssocie,
            partAssociePct: partAssociePct
        };
    }

    // SA avec gestion des associés
    static simulerSA(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'sa');
        const { capitalInvesti = 37000, partAssocie = normalizedParams.partAssocie } = normalizedParams;
        
        // Vérifier si le capital minimum est respecté
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // Simuler comme une SAS avec les params normalisés
        const resultSAS = this.simulerSAS(normalizedParams);
        
        if (!resultSAS.compatible) {
            return resultSAS;
        }
        
        // Ajouter le coût du CAC
        const coutCAC = 5000;
        const resultatApresCAC = Math.max(0, resultSAS.resultatApresRemuneration - coutCAC);
        
        // CORRIGÉ : Utiliser directement le calcul progressif de l'IS
        const is = calculerISProgressif(resultatApresCAC);
        
        const resultatApresIS = Math.max(0, resultatApresCAC - is);
        
        // MODIFIÉ : Utiliser le helper avec le TMI calculé de SAS
        const dividendesInfo = calculerDividendesIS(
            resultatApresIS,
            partAssocie,
            capitalInvesti * partAssocie,
            false,
            false,
            resultSAS.tmiReel, // TMI calculé par SAS
            resultSAS.salaireNet // Revenu imposable
        );
        
        const revenuNetTotal = resultSAS.salaireNetApresIR + dividendesInfo.dividendesNets;
        
        return {
            ...resultSAS,
            typeEntreprise: 'SA',
            coutCAC: coutCAC,
            is: is,
            dividendesNets: dividendesInfo.dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / normalizedParams.ca) * 100,
            
            // NOUVEAU : Ajout des infos d'optimisation
            methodeDividendes: dividendesInfo.methodeDividendes,
            economieMethode: dividendesInfo.economieMethode,
            
            // S'assurer que les infos d'associés sont présentes
            nbAssocies: normalizedParams.nbAssocies,
            partAssocie: partAssocie,
            partAssociePct: normalizedParams.partAssociePct
        };
    }

    // SNC avec transparence fiscale
    static simulerSNC(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'snc');
        
        const { 
            ca, 
            tauxMarge = 0.3, 
            nbAssocies = normalizedParams.nbAssocies,
            partAssocie = normalizedParams.partAssocie,
            partAssociePct = normalizedParams.partAssociePct,
            modeExpert = true 
        } = normalizedParams;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Stocker le résultat total avant répartition
        const resultatEntrepriseSociete = resultatEntreprise;
        
        // Part du bénéfice pour l'associé
        const beneficeAssociePrincipal = Math.floor(resultatEntreprise * partAssocie);
        
        // Cotisations sociales TNS
        let cotisationsSociales;
        if (window.FiscalUtils) {
            cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(beneficeAssociePrincipal);
        } else {
            cotisationsSociales = Math.round(beneficeAssociePrincipal * TAUX_CHARGES.TNS);
        }
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeAssociePrincipal - cotisationsSociales;
        
        // NOUVEAU : Calcul automatique de la TMI
        const tmiReel = window.FiscalUtils 
            ? window.FiscalUtils.getTMI(beneficeApresCotisations)
            : calculerTMI(beneficeApresCotisations);
        
        // MODIFIÉ : Toujours utiliser le calcul progressif
        let impotRevenu;
        if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(beneficeApresCotisations);
        } else {
            impotRevenu = calculateProgressiveIRFallback(beneficeApresCotisations);
        }
        
        // Revenu net après impôt
        const revenuNetApresImpot = beneficeApresCotisations - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SNC',
            tauxMarge: tauxMarge * 100 + '%',
            
            // Résultats société ET associé
            resultatEntrepriseSociete: resultatEntrepriseSociete,
            resultatEntreprise: resultatEntreprise,
            beneficeAssociePrincipal: beneficeAssociePrincipal,
            
            cotisationsSociales: cotisationsSociales,
            beneficeApresCotisations: beneficeApresCotisations,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            revenuNetTotal: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100,
            tmiReel: tmiReel,
            modeExpert: true, // Toujours en mode expert
            
            // Informations sur les associés
            nbAssocies: nbAssocies,
            partAssocie: partAssocie,
            partAssociePct: partAssociePct
        };
    }

    // SCI avec gestion de la transparence fiscale
    static simulerSCI(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'sci');
        
        const { 
            revenuLocatif = 50000,
            chargesDeductibles = 10000,
            optionIS = false,
            partAssocie = normalizedParams.partAssocie,
            nbAssocies = normalizedParams.nbAssocies,
            partAssociePct = normalizedParams.partAssociePct,
            modeExpert = true,
            typeLocation = "nue",
            valeurBien = 300000,
            tauxAmortissement = 0.02,
            dureeDetention = 15
        } = normalizedParams;
        
        // Pour une SCI, on travaille avec des revenus locatifs plutôt qu'un CA
        const ca = revenuLocatif;
        
        // Location meublée = obligatoire IS si >10% du CA
        const locationMeublee = typeLocation === "meublee";
        const isObligatoire = locationMeublee;
        
        // Choix du régime fiscal
        const optionISEffective = optionIS || isObligatoire;
        
        // Résultat fiscal = revenus locatifs - charges déductibles
        const resultatFiscal = revenuLocatif - chargesDeductibles;
        
        // Part du résultat fiscal pour l'associé
        const resultatFiscalAssocie = Math.floor(resultatFiscal * partAssocie);
        
        // Calcul de l'amortissement (uniquement en IS)
        const amortissementAnnuel = optionISEffective ? Math.round(valeurBien * tauxAmortissement) : 0;
        const resultatApresAmortissement = Math.max(0, resultatFiscal - amortissementAnnuel);
        
        // Avertissement location meublée sans IS
        const avertissementMeublee = locationMeublee && !optionISEffective ? 
            "Attention: La location meublée en SCI à l'IR peut être requalifiée en activité commerciale. L'option IS est généralement obligatoire." : "";
        
        // Avantage fiscal amortissement
        const avantageAmortissement = optionISEffective ? Math.round(amortissementAnnuel * 0.25) : 0;
        
        if (!optionISEffective) {
            // Régime IR par défaut - Revenus fonciers pour les associés
            
            // Prélèvements sociaux (17.2% pour 2025)
            const tauxPrelevementsSociaux = 0.172;
            const prelevementsSociaux = Math.round(Math.max(0, resultatFiscalAssocie) * tauxPrelevementsSociaux);
            
            // Calculer la CSG déductible (6.8%)
            const tauxCSGDeductible = 0.068;
            const csgDeductible = Math.round(resultatFiscalAssocie * tauxCSGDeductible);
            
            // Base imposable après déduction CSG
            const baseImposableIR = Math.max(0, resultatFiscalAssocie - csgDeductible);
            
            // NOUVEAU : Calcul automatique de la TMI
            const tmiReel = window.FiscalUtils 
                ? window.FiscalUtils.getTMI(baseImposableIR)
                : calculerTMI(baseImposableIR);
            
            // Toujours utiliser le calcul progressif pour l'IR
            let impotRevenu;
            
            if (window.FiscalUtils && window.FiscalUtils.calculateProgressiveIR) {
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(baseImposableIR);
            } else {
                impotRevenu = calculateProgressiveIRFallback(baseImposableIR);
            }
            
            // Revenu net après impôt et prélèvements sociaux
            const revenuNetApresImpot = Math.max(0, resultatFiscalAssocie - impotRevenu - prelevementsSociaux);
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "SCI à l'IR",
                typeLocation: typeLocation,
                revenuLocatif: revenuLocatif,
                chargesDeductibles: chargesDeductibles,
                resultatFiscal: resultatFiscal,
                resultatFiscalAssocie: resultatFiscalAssocie,
                partAssociePrincipal: partAssocie, // Pour compatibilité
                nombreAssocies: nbAssocies, // Pour compatibilité
                prelevementsSociaux: prelevementsSociaux,
                csgDeductible: csgDeductible,
                baseImposableIR: baseImposableIR,
                tmiReel: tmiReel,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                revenuNetTotal: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100,
                amortissementPossible: false,
                avertissementMeublee: avertissementMeublee,
                modeExpert: true, // Toujours en mode expert
                
                // Infos standardisées
                nbAssocies: nbAssocies,
                partAssocie: partAssocie,
                partAssociePct: partAssociePct
            };
        } else {
            // Option IS
            
            // CORRIGÉ : Utiliser directement le calcul progressif de l'IS
            const is = calculerISProgressif(resultatApresAmortissement);
            
            // Résultat après IS
            const resultatApresIS = resultatApresAmortissement - is;
            
            // Pour la SCI à l'IS, on considère un revenu imposable basé sur les dividendes
            // Le TMI sera calculé à partir de ce montant
            const revenuImposableEstime = Math.floor(resultatApresIS * partAssocie);
            const tmiReel = window.FiscalUtils 
                ? window.FiscalUtils.getTMI(revenuImposableEstime)
                : calculerTMI(revenuImposableEstime);
            
            // MODIFIÉ : Utiliser le helper avec le TMI calculé
            const dividendesInfo = calculerDividendesIS(
                resultatApresIS,
                partAssocie,
                0, // Pas de capital significatif en SCI
                false,
                false,
                tmiReel, // TMI calculé
                revenuImposableEstime // Revenu imposable estimé
            );
            
            // Message explicatif si meublée
            const infoLocationMeublee = locationMeublee ? 
                "L'option IS permet d'amortir le bien meublé, ce qui réduit l'imposition à court terme." : 
                "Attention: l'option IS est généralement défavorable pour une SCI en location nue (impossible de revenir à l'IR).";
            
            // Total économie sur durée d'amortissement
            const economieAmortissementDuree = avantageAmortissement * dureeDetention;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "SCI à l'IS",
                typeLocation: typeLocation,
                revenuLocatif: revenuLocatif,
                chargesDeductibles: chargesDeductibles,
                valeurBien: valeurBien,
                amortissementAnnuel: amortissementAnnuel,
                resultatFiscal: resultatFiscal,
                resultatApresAmortissement: resultatApresAmortissement,
                is: is,
                resultatApresIS: resultatApresIS,
                dividendesBruts: dividendesInfo.dividendesBrutsSociete,
                dividendesAssocie: dividendesInfo.dividendesBrutsAssocie,
                dividendes: dividendesInfo.dividendesBrutsAssocie,
                prelevementForfaitaire: dividendesInfo.prelevementForfaitaire,
                dividendesNets: dividendesInfo.dividendesNets,
                revenuNetApresImpot: dividendesInfo.dividendesNets,
                revenuNetTotal: dividendesInfo.dividendesNets,
                ratioNetCA: (dividendesInfo.dividendesNets / ca) * 100,
                avantageAmortissement: avantageAmortissement,
                economieAmortissementDuree: economieAmortissementDuree,
                amortissementPossible: true,
                infoLocationMeublee: infoLocationMeublee,
                partAssociePrincipal: partAssocie, // Pour compatibilité
                nombreAssocies: nbAssocies, // Pour compatibilité
                tmiReel: tmiReel,
                modeExpert: true, // Toujours en mode expert
                
                // NOUVEAU : Ajout des infos d'optimisation
                methodeDividendes: dividendesInfo.methodeDividendes,
                economieMethode: dividendesInfo.economieMethode,
                
                // Infos standardisées
                nbAssocies: nbAssocies,
                partAssocie: partAssocie,
                partAssociePct: partAssociePct
            };
        }
    }

    // SELARL basé sur SARL
    static simulerSELARL(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'selarl');
        
        // Force gérant majoritaire pour les professions libérales
        const result = this.simulerSARL({...normalizedParams, gerantMajoritaire: true, typeEntreprise: 'SELARL'});
        if (result.compatible) {
            result.typeEntreprise = 'SELARL';
        }
        return result;
    }

    // SELAS basé sur SAS
    static simulerSELAS(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'selas');
        
        const result = this.simulerSAS(normalizedParams);
        if (result.compatible) {
            result.typeEntreprise = 'SELAS';
        }
        return result;
    }

    // SCA basé sur SARL avec particularités
    static simulerSCA(params) {
        // Normaliser les paramètres
        const normalizedParams = this.normalizeAssociatesParams(params, 'sca');
        const { capitalInvesti = 37000 } = normalizedParams;
        
        // Vérifier le capital minimum
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SCA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // Réutiliser une grande partie du code de la SARL avec gérant majoritaire
        const result = this.simulerSARL({...normalizedParams, gerantMajoritaire: true});
        if (result.compatible) {
            result.typeEntreprise = 'SCA';
            result.noteAssocies = "Simulation pour un commandité. Les commanditaires ont une fiscalité différente.";
        }
        return result;
    }
}

// Exposer la classe au niveau global
window.SimulationsFiscales = SimulationsFiscales;

// Exposer les utilitaires
window.TAUX_CHARGES = TAUX_CHARGES;
window.calculerSalaireBrut = calculerSalaireBrut; // NOUVEAU
window.calculerSalaireBrutMax = calculerSalaireBrutMax;
window.ajusterRemuneration = ajusterRemuneration;
window.calculerDividendesIS = calculerDividendesIS;
window.calculerISProgressif = calculerISProgressif; // NOUVEAU
window.STATUTS_ASSOCIATES_CONFIG = STATUTS_ASSOCIATES_CONFIG;
window.calculateProgressiveIRFallback = calculateProgressiveIRFallback; // Exposer la fonction

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module SimulationsFiscales chargé (v3.7 - Correction CSG non déductible)");
    // Déclencher un événement pour signaler que les simulations fiscales sont prêtes
    document.dispatchEvent(new CustomEvent('simulationsFiscalesReady', {
        detail: {
            version: '3.7',
            features: ['normalizeAssociatesParams', 'calculerDividendesIS', 'STATUTS_ASSOCIATES_CONFIG', 'optimisationFiscaleDividendes', 'calculTMIAutomatique', 'calculProgressifIRActif', 'CSGNonDeductible', 'calculerSalaireBrut', 'calculerISProgressif', 'cashVsBaseImposable']
        }
    }));
});
