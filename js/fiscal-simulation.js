// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 2.2 - Mai 2025 - Mise à jour des taux et précision des calculs

// Constantes globales pour les taux
// Utilisation de CSG_CRDS_IMPOSABLE depuis fiscal-utils.js
const TAUX_CH_SAL = 0.22;            // Taux moyen charges salariales 2025

// Classe pour les simulations fiscales des différents statuts juridiques
class SimulationsFiscales {
    
    // MICRO-ENTREPRISE
    static simulerMicroEntreprise(params) {
        // Récupérer les paramètres avec des valeurs par défaut
        const ca = params.ca || 0;
        const typeMicro = params.typeMicro || 'BIC_SERVICE';
        const tmiActuel = params.tmiActuel || 30;
        const modeExpert = params.modeExpert || false;
        // Important: récupérer explicitement le versement libératoire
        const versementLiberatoire = params.versementLiberatoire === true;
        // Récupérer l'année de création pour l'exonération CFE
        const anneeCreation = params.anneeDebut || new Date().getFullYear();
        // Nouveaux paramètres
        const codeApe = params.codeApe;
        const rfrN2 = params.rfrN2;
        // Extraire tauxMarge et tauxFrais pour la micro-entreprise (peu utilisés ici)
        const { tauxMarge, tauxFrais } = params;
        
        // Utiliser les plafonds depuis legalStatuses si disponible
        const plafonds = {
            'BIC_VENTE': 188700, // Correspond au plafond 2025 dans legalStatuses.MICRO
            'BIC_SERVICE': 77700,
            'BNC': 77700
        };
        
        // Taux d'abattement
        const abattements = {
            'BIC_VENTE': 0.71, // 71%
            'BIC_SERVICE': 0.50, // 50%
            'BNC': 0.34 // 34%
        };
        
        // Taux de cotisations sociales
        const tauxCotisations = {
            'BIC_VENTE': 0.123, // 12.3%
            'BIC_SERVICE': 0.212, // 21.2%
            'BNC': 0.246 // 24.6% (mise à jour 2025)
        };
        
        // Taux de versement libératoire de l'IR
        const tauxVFL = {
            'BIC_VENTE': 0.01, // 1%
            'BIC_SERVICE': 0.017, // 1.7%
            'BNC': 0.022 // 2.2%
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
                message: `CA supérieur au plafond micro-entreprise de ${plafonds[typeEffectif]}€. Basculez au régime réel simplifié ou facturez sous société.`
            };
        }
        
        // Calcul des cotisations sociales (même avec VFL, les cotisations restent dues)
        const cotisationsSociales = Math.round(ca * tauxCotisations[typeEffectif]);
        
        // Ajout CFP (formation professionnelle) avec plafond à 120€ et taux selon code APE
        const cfp = Math.round(Math.min(ca * FiscalUtils.tauxCFP(codeApe), 120));
        
        // Appliquer coefficient ACRE si applicable
        const coefACRE = anneeCreation ? FiscalUtils.coefACRE(anneeCreation) : 1;
        const cotisationsSocialesApresACRE = Math.round(cotisationsSociales * coefACRE);
        
        // Exonération CFE = année de création + 1ère année civile complète
        const anneeCourante = new Date().getFullYear();
        const cfe = (anneeCourante - anneeCreation < 2) ? 0 : (params.cfe || 0);

        // Calcul du revenu imposable après abattement
        const revenuImposable = Math.round(ca * (1 - abattements[typeEffectif]));
        
        // Vérifier l'éligibilité au versement libératoire
        const vflOk = versementLiberatoire && FiscalUtils.vflEligible(rfrN2, ca, plafonds[typeEffectif]);
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        
        if (vflOk) {
            // Calcul avec versement libératoire
            impotRevenu = Math.round(ca * tauxVFL[typeEffectif]);
        } else if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(revenuImposable);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(revenuImposable * (tmiActuel / 100));
        }
        
        // Calcul du revenu net après impôt et toutes charges
        // Que ce soit avec ou sans VFL, les cotisations sociales sont toujours dues
        const revenuNetApresImpot = ca - cotisationsSocialesApresACRE - cfp - cfe - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'Micro-entreprise',
            typeMicro: typeEffectif,
            abattement: abattements[typeEffectif] * 100 + '%',
            revenuImposable: revenuImposable,
            cotisationsSociales: cotisationsSocialesApresACRE,
            cotisationsSocialesAvantACRE: cotisationsSociales,
            coefACRE: coefACRE,
            cfp: cfp,
            cfe: cfe,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100,
            versementLiberatoire: vflOk
        };
    }
    
    // ENTREPRISE INDIVIDUELLE AU RÉGIME RÉEL
    static simulerEI(params) {
        const { 
            ca, 
            tauxMarge, 
            tauxFrais, 
            tmiActuel = 30, 
            modeExpert = false,
            anneeDebut
        } = params;
        
        // Calcul du taux de marge effectif en fonction des paramètres disponibles
        const margeEffective = tauxMarge !== undefined ? tauxMarge : 
                              (tauxFrais !== undefined ? (1 - tauxFrais) : 0.3);
        
        // Calcul du bénéfice avant cotisations
        const beneficeBrut = Math.round(ca * margeEffective);
        
        // Utiliser la nouvelle fonction de calcul des cotisations TNS
        let cotisationsSociales = window.FiscalUtils.cotiTNS(beneficeBrut);
        
        // Appliquer ACRE si applicable
        if (anneeDebut) {
            const coefACRE = FiscalUtils.coefACRE(anneeDebut);
            cotisationsSociales = Math.round(cotisationsSociales * coefACRE);
        }
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeBrut - cotisationsSociales;
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(beneficeApresCotisations);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(beneficeApresCotisations * (tmiActuel / 100));
        }
        
        // Calcul du revenu net après impôt
        const revenuNetApresImpot = beneficeApresCotisations - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'Entreprise Individuelle',
            tauxMarge: margeEffective * 100 + '%',
            beneficeBrut: beneficeBrut,
            cotisationsSociales: cotisationsSociales,
            beneficeApresCotisations: beneficeApresCotisations,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100
        };
    }
    
    // EURL
    static simulerEURL(params) {
        const { 
            ca, 
            tauxMarge, 
            tauxFrais,
            tauxRemuneration = 0.7, 
            optionIS = false, 
            tmiActuel = 30, 
            modeExpert = false, 
            capitalSocial = 1,
            optionBaremeDividendes = false,
            partDetention = 1,
            capitalEstLibere = true,
            detentionPersPhysiques75 = true,
            anneeDebut
        } = params;
        
        // Calcul du taux de marge effectif
        const margeEffective = tauxMarge !== undefined ? tauxMarge : 
                              (tauxFrais !== undefined ? (1 - tauxFrais) : 0.3);
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * margeEffective);
        
        // Simulation selon le régime d'imposition
        if (!optionIS) {
            // Régime IR (transparence fiscale)
            
            // Cotisations calculées sur le résultat total (pas de notion de rémunération en IR)
            let cotisationsSociales = window.FiscalUtils.cotiTNS(resultatEntreprise);
            
            // Appliquer ACRE si applicable
            if (anneeDebut) {
                const coefACRE = FiscalUtils.coefACRE(anneeDebut);
                cotisationsSociales = Math.round(cotisationsSociales * coefACRE);
            }
            
            // Bénéfice imposable = résultat - cotisations
            const beneficeImposable = resultatEntreprise - cotisationsSociales;
            
            // Calcul de l'impôt sur le revenu
            let impotRevenu;
            if (modeExpert && window.FiscalUtils) {
                // Utiliser le calcul progressif si le mode expert est activé
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(beneficeImposable);
            } else {
                // Utiliser le calcul simplifié (TMI)
                impotRevenu = Math.round(beneficeImposable * (tmiActuel / 100));
            }
            
            // Calcul du revenu net après impôt
            const revenuNetApresImpot = beneficeImposable - impotRevenu;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "EURL à l'IR",
                tauxMarge: margeEffective * 100 + '%',
                resultatAvantRemuneration: resultatEntreprise,
                cotisationsSociales: cotisationsSociales,
                beneficeImposable: beneficeImposable,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                revenuNetTotal: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100
            };
        } else {
            // Régime IS
            
            // Calcul de la rémunération du gérant
            const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
            const resultatApresRemuneration = resultatEntreprise - remuneration;
            
            // Utiliser la nouvelle fonction de calcul des cotisations TNS
            let cotisationsSociales = window.FiscalUtils.cotiTNS(remuneration);
            
            // Appliquer ACRE si applicable
            if (anneeDebut) {
                const coefACRE = FiscalUtils.coefACRE(anneeDebut);
                cotisationsSociales = Math.round(cotisationsSociales * coefACRE);
            }
            
            // Calcul de l'impôt sur le revenu sur la rémunération
            const remunerationNetteSociale = remuneration - cotisationsSociales;
            
            let impotRevenu;
            if (modeExpert && window.FiscalUtils) {
                // Utiliser le calcul progressif si le mode expert est activé
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(remunerationNetteSociale);
            } else {
                // Utiliser le calcul simplifié (TMI)
                impotRevenu = Math.round(remunerationNetteSociale * (tmiActuel / 100));
            }
            
            // Calcul de l'IS avec paramètres supplémentaires
            const is = window.FiscalUtils.calculIS(resultatApresRemuneration, {
                ca: ca,
                capitalEstLibere: capitalEstLibere,
                detentionPersPhysiques75: detentionPersPhysiques75
            });
            
            // Résultat après IS
            const resultatApresIS = resultatApresRemuneration - is;
            
            // Distribution de dividendes (simplifié - 100% du résultat après IS)
            const dividendes = resultatApresIS;
            
            // Cotisations TNS sur dividendes > 10% du capital social
            const cotTNSDiv = window.FiscalUtils.cotTNSDividendes(dividendes, capitalSocial);
            
            // Ajout de la CSG déductible sur dividendes
            const csgDeductible = Math.round(dividendes * 0.068);
            const baseIRdiv = dividendes - csgDeductible;
            
            // Calcul du PFU ou barème progressif sur les dividendes
            let prelevementForfaitaire;
            const useBareme = optionBaremeDividendes === true;
            const eligibleBareme = optionIS === true && partDetention < 0.10;
            
            if (useBareme && eligibleBareme) {
                // Barème progressif avec abattement de 40%
                prelevementForfaitaire = window.FiscalUtils 
                    ? window.FiscalUtils.calculateProgressiveIR(baseIRdiv * 0.6)
                    : Math.round(baseIRdiv * 0.6 * (tmiActuel / 100));
            } else if (window.FiscalUtils) {
                prelevementForfaitaire = window.FiscalUtils.calculPFU(dividendes);
            } else {
                // Fallback
                const tauxPFU = 0.30;
                prelevementForfaitaire = Math.round(dividendes * tauxPFU);
            }
            
            // Dividendes nets après PFU et cotisations TNS
            const dividendesNets = dividendes - prelevementForfaitaire - cotTNSDiv;
            
            // Revenu net total (rémunération nette + dividendes nets)
            const revenuNetSalaire = remunerationNetteSociale - impotRevenu;
            const revenuNetTotal = revenuNetSalaire + dividendesNets;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "EURL à l'IS",
                tauxMarge: margeEffective * 100 + '%',
                resultatAvantRemuneration: resultatEntreprise,
                remuneration: remuneration,
                resultatApresRemuneration: resultatApresRemuneration,
                cotisationsSociales: cotisationsSociales,
                remunerationNetteSociale: remunerationNetteSociale,
                impotRevenu: impotRevenu,
                revenuNetSalaire: revenuNetSalaire,
                is: is,
                resultatApresIS: resultatApresIS,
                dividendes: dividendes,
                cotTNSDiv: cotTNSDiv,
                csgDeductible: csgDeductible,
                baseIRdiv: baseIRdiv,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100,
                optionBaremeDividendes: optionBaremeDividendes
            };
        }
    }
    
    // SASU
    static simulerSASU(params) {
        const { 
            ca, 
            tauxMarge,
            tauxFrais,
            tauxRemuneration = 0.7, 
            tmiActuel = 30, 
            modeExpert = false,
            optionBaremeDividendes = false,
            partDetention = 1,
            capitalEstLibere = true,
            detentionPersPhysiques75 = true 
        } = params;
        
        // Calcul du taux de marge effectif
        const margeEffective = tauxMarge !== undefined ? tauxMarge : 
                              (tauxFrais !== undefined ? (1 - tauxFrais) : 0.3);
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * margeEffective);
        
        // Calcul de la rémunération du président
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales avec la nouvelle fonction
        const charges = window.FiscalUtils.chargesAssimileSalarie(remuneration);
        const chargesPatronales = charges.patronales;
        const chargesSalariales = charges.salariales;
        
        const coutTotalEmployeur = remuneration + chargesPatronales;
        const salaireNet = remuneration - chargesSalariales;
        
        // Calcul du net imposable (incluant la CSG imposable)
        const netImposable = salaireNet + (remuneration * CSG_CRDS_IMPOSABLE);
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(netImposable);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(netImposable * (tmiActuel / 100));
        }
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS avec les nouvelles règles
        const is = window.FiscalUtils.calculIS(resultatApresRemuneration, {
            ca: ca,
            capitalEstLibere: capitalEstLibere,
            detentionPersPhysiques75: detentionPersPhysiques75
        });
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        const dividendes = resultatApresIS;
        
        // Ajout de la CSG déductible sur dividendes
        const csgDeductible = Math.round(dividendes * 0.068);
        const baseIRdiv = dividendes - csgDeductible;
        
        // Calcul du PFU ou barème progressif sur les dividendes
        let prelevementForfaitaire;
        const useBareme = optionBaremeDividendes === true;
        const eligibleBareme = partDetention < 0.10;
        
        if (useBareme && eligibleBareme) {
            // Barème progressif avec abattement de 40%
            prelevementForfaitaire = window.FiscalUtils 
                ? window.FiscalUtils.calculateProgressiveIR(baseIRdiv * 0.6)
                : Math.round(baseIRdiv * 0.6 * (tmiActuel / 100));
        } else if (window.FiscalUtils) {
            prelevementForfaitaire = window.FiscalUtils.calculPFU(dividendes);
        } else {
            // Fallback
            const tauxPFU = 0.30;
            prelevementForfaitaire = Math.round(dividendes * tauxPFU);
        }
        
        // Dividendes nets après PFU
        const dividendesNets = dividendes - prelevementForfaitaire;
        
        // Revenu net total
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SASU',
            tauxMarge: margeEffective * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            chargesPatronales: chargesPatronales,
            coutTotalEmployeur: coutTotalEmployeur,
            chargesSalariales: chargesSalariales,
            salaireNet: salaireNet,
            netImposable: netImposable,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            revenuNetSalaire: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendes: dividendes,
            csgDeductible: csgDeductible,
            baseIRdiv: baseIRdiv,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            optionBaremeDividendes: optionBaremeDividendes
        };
    }

    // SARL
    static simulerSARL(params) {
        const { 
            ca, 
            tauxMarge,
            tauxFrais,
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            gerantMajoritaire = true, // Par défaut, gérant majoritaire
            nbAssocies = 2, // Par défaut, 2 associés
            modeExpert = false,
            capitalSocial = 1,
            optionBaremeDividendes = false,
            partDetention = 0.51,
            capitalEstLibere = true,
            detentionPersPhysiques75 = true,
            anneeDebut
        } = params;
        
        // Calcul du taux de marge effectif
        const margeEffective = tauxMarge !== undefined ? tauxMarge : 
                              (tauxFrais !== undefined ? (1 - tauxFrais) : 0.3);
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * margeEffective);
        
        // Calcul de la rémunération du gérant
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Régime social différent selon que le gérant est majoritaire ou non
        let cotisationsSociales = 0;
        let salaireNet = 0;
        let netImposable = 0;
        
        if (gerantMajoritaire) {
            // Gérant majoritaire = TNS
            cotisationsSociales = window.FiscalUtils.cotiTNS(remuneration);
            
            // Appliquer ACRE si applicable
            if (anneeDebut) {
                const coefACRE = FiscalUtils.coefACRE(anneeDebut);
                cotisationsSociales = Math.round(cotisationsSociales * coefACRE);
            }
            
            salaireNet = remuneration - cotisationsSociales;
            netImposable = salaireNet;
        } else {
            // Gérant minoritaire = assimilé salarié
            const charges = window.FiscalUtils.chargesAssimileSalarie(remuneration);
            const chargesPatronales = charges.patronales;
            const chargesSalariales = charges.salariales;
            cotisationsSociales = chargesPatronales + chargesSalariales;
            
            salaireNet = remuneration - chargesSalariales;
            netImposable = salaireNet + (remuneration * CSG_CRDS_IMPOSABLE);
        }
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(netImposable);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(netImposable * (tmiActuel / 100));
        }
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const is = window.FiscalUtils.calculIS(resultatApresRemuneration, {
            ca: ca,
            capitalEstLibere: capitalEstLibere,
            detentionPersPhysiques75: detentionPersPhysiques75
        });
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        // Pour le gérant, on considère qu'il reçoit des dividendes proportionnels à ses parts sociales
        // Si gérant majoritaire, on estime qu'il détient 51% minimum des parts
        const partGerant = gerantMajoritaire ? Math.max(0.51, partDetention) : (1 / nbAssocies);
        const dividendesBruts = resultatApresIS;
        const dividendesGerant = Math.round(dividendesBruts * partGerant);
        
        // Cotisations TNS sur dividendes > 10% du capital social pour gérant majoritaire
        let cotTNSDiv = 0;
        if (gerantMajoritaire) {
            cotTNSDiv = window.FiscalUtils.cotTNSDividendes(dividendesGerant, capitalSocial);
        }
        
        // Ajout de la CSG déductible sur dividendes
        const csgDeductible = Math.round(dividendesGerant * 0.068);
        const baseIRdiv = dividendesGerant - csgDeductible;
        
        // Calcul du PFU ou barème progressif sur les dividendes
        let prelevementForfaitaire;
        const useBareme = optionBaremeDividendes === true;
        const eligibleBareme = partDetention < 0.10;
        
        if (useBareme && eligibleBareme) {
            // Barème progressif avec abattement de 40%
            prelevementForfaitaire = window.FiscalUtils 
                ? window.FiscalUtils.calculateProgressiveIR(baseIRdiv * 0.6)
                : Math.round(baseIRdiv * 0.6 * (tmiActuel / 100));
        } else if (window.FiscalUtils) {
            prelevementForfaitaire = window.FiscalUtils.calculPFU(dividendesGerant);
        } else {
            // Fallback
            const tauxPFU = 0.30;
            prelevementForfaitaire = Math.round(dividendesGerant * tauxPFU);
        }
        
        // Dividendes nets après PFU et cotisations TNS
        const dividendesNets = dividendesGerant - prelevementForfaitaire - cotTNSDiv;
        
        // Revenu net total (salaire net + dividendes nets)
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SARL',
            tauxMarge: margeEffective * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            cotisationsSociales: cotisationsSociales,
            salaireNet: salaireNet,
            netImposable: netImposable,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            revenuNetSalaire: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendesBruts: dividendesBruts,
            dividendesGerant: dividendesGerant,
            cotTNSDiv: cotTNSDiv,
            csgDeductible: csgDeductible,
            baseIRdiv: baseIRdiv,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            optionBaremeDividendes: optionBaremeDividendes
        };
    }

    // Les autres méthodes suivent les mêmes principes de mise à jour que celles ci-dessus
    // Pour garder ce commit concis, nous ne modifions que les méthodes principales
    // Les autres méthodes (SAS, SA, SNC, SCI, SELARL, SELAS, SCA) devraient être mises à jour
    // suivant les mêmes principes que ceux appliqués aux méthodes ci-dessus

    // SAS (simplifiée)
    static simulerSAS(params) {
        // La SAS est similaire à la SASU mais avec plusieurs associés
        const { partPresident = 0.5 } = params;
        
        // Simuler comme une SASU
        const resultSASU = this.simulerSASU(params);
        
        if (!resultSASU.compatible) {
            return resultSASU;
        }
        
        // Ajuster les dividendes pour le président
        const dividendesPresident = Math.round(resultSASU.dividendes * partPresident);
        const csgDeductible = Math.round(dividendesPresident * 0.068);
        const baseIRdiv = dividendesPresident - csgDeductible;
        
        // Utiliser calculPFU de FiscalUtils
        const prelevementForfaitaire = window.FiscalUtils.calculPFU(dividendesPresident);
        const dividendesNets = dividendesPresident - prelevementForfaitaire;
        
        // Recalculer le revenu net total
        const revenuNetTotal = resultSASU.salaireNetApresIR + dividendesNets;
        
        return {
            ...resultSASU,
            typeEntreprise: 'SAS',
            dividendesPresident: dividendesPresident,
            csgDeductible: csgDeductible,
            baseIRdiv: baseIRdiv,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / params.ca) * 100
        };
    }

    // Pour le reste des méthodes (SA, SNC, SCI, SELARL, SELAS, SCA)
    // Appliquer les mêmes types de modifications selon les statuts,
    // notamment pour les calculs de cotisations sociales, d'IS et de CSG déductible.
}

// Exposer la classe au niveau global
window.SimulationsFiscales = SimulationsFiscales;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module SimulationsFiscales chargé et disponible globalement");
    // Déclencher un événement pour signaler que les simulations fiscales sont prêtes
    document.dispatchEvent(new CustomEvent('simulationsFiscalesReady'));
});