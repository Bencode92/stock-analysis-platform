// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 3.0 - Mai 2025 - Restructuré avec factorisation et optimisation

// Classe pour les simulations fiscales des différents statuts juridiques
class SimulationsFiscales {
    
    /**
     * Vérifie si FiscalUtils est disponible et le charge si nécessaire
     * @private
     */
    static _checkFiscalUtils() {
        // Si FiscalUtils est déjà disponible, l'utiliser
        if (window.FiscalUtils) {
            return;
        }
        
        // Sinon, utiliser des implémentations basiques inline
        console.warn("FiscalUtils n'est pas disponible - utilisation des fonctions internes de secours");
        
        window.FiscalUtils = {
            // Fonction simplifiée pour calculer l'IR
            calculIR: (revenuImposable, tmi = 30, modeProgressif = false) => {
                if (!modeProgressif) {
                    return Math.round(revenuImposable * tmi / 100);
                }
                
                // Version simplifiée du calcul progressif
                const tranches = [
                    { limite: 11294, taux: 0 },
                    { limite: 28797, taux: 11 },
                    { limite: 82341, taux: 30 },
                    { limite: 177106, taux: 41 },
                    { limite: Infinity, taux: 45 }
                ];
                
                let impot = 0;
                let tranchePrecedente = 0;
                
                for (const tranche of tranches) {
                    const montantTranche = Math.min(
                        Math.max(0, revenuImposable - tranchePrecedente),
                        tranche.limite - tranchePrecedente
                    );
                    
                    impot += montantTranche * (tranche.taux / 100);
                    tranchePrecedente = tranche.limite;
                    
                    if (revenuImposable <= tranche.limite) break;
                }
                
                return Math.round(impot);
            },
            
            // Fonction simplifiée pour calculer l'IS
            calculIS: (resultat) => {
                const seuilReduit = 42500;
                if (resultat <= seuilReduit) {
                    return { 
                        montant: Math.round(resultat * 0.15),
                        taux: 15,
                        detail: { tauxReduit: Math.round(resultat * 0.15), tauxNormal: 0 }
                    };
                } else {
                    const isReduit = Math.round(seuilReduit * 0.15);
                    const isNormal = Math.round((resultat - seuilReduit) * 0.25);
                    
                    return {
                        montant: isReduit + isNormal,
                        taux: Math.round((isReduit + isNormal) / resultat * 100),
                        detail: { tauxReduit: isReduit, tauxNormal: isNormal }
                    };
                }
            },
            
            // Fonction simplifiée pour calculer le PFU
            calculPFU: (dividendes) => {
                const tauxIR = 12.8;
                const tauxPS = 17.2;
                
                return {
                    total: Math.round(dividendes * 0.3),
                    ir: Math.round(dividendes * tauxIR / 100),
                    prelevementsSociaux: Math.round(dividendes * tauxPS / 100),
                    tauxEffectif: 30
                };
            },
            
            // Fonction simplifiée pour calculer les charges TNS
            calculChargesTNS: (revenu, taux = 45) => Math.round(revenu * taux / 100),
            
            // Fonction simplifiée pour calculer les charges salariales
            calculChargesSalariees: (salaire) => {
                const tauxPatronal = 0.55;
                const tauxSalarial = 0.22;
                
                return {
                    chargesPatronales: Math.round(salaire * tauxPatronal),
                    chargesSalariales: Math.round(salaire * tauxSalarial),
                    salaireNet: salaire - Math.round(salaire * tauxSalarial)
                };
            },
            
            // Fonction pour optimiser la répartition salaire/dividendes
            optimiserRepartition: (resultat, tmi, typeEntreprise) => {
                // Optimisation simplifiée - test par pas de 10%
                const options = [];
                
                for (let ratio = 0; ratio <= 1; ratio += 0.1) {
                    const salaire = Math.round(resultat * ratio);
                    const resultatApres = resultat - salaire;
                    
                    // Calculer l'IS
                    const is = Math.round(resultatApres * (resultatApres <= 42500 ? 0.15 : 0.25));
                    const resultatApresIS = resultatApres - is;
                    
                    // Calculer les charges selon le régime
                    let chargesSociales, salaireNet;
                    
                    if (['SASU', 'SAS', 'SA', 'SELAS'].includes(typeEntreprise)) {
                        // Régime assimilé salarié
                        chargesSociales = Math.round(salaire * 0.77); // approximation
                        salaireNet = salaire - Math.round(salaire * 0.22);
                    } else {
                        // Régime TNS
                        chargesSociales = Math.round(salaire * 0.45);
                        salaireNet = salaire - chargesSociales;
                    }
                    
                    // IR et PFU
                    const ir = Math.round(salaireNet * tmi / 100);
                    const salaireNetApresIR = salaireNet - ir;
                    
                    const pfu = Math.round(resultatApresIS * 0.3);
                    const dividendesNets = resultatApresIS - pfu;
                    
                    // Net total
                    const revenuNetTotal = salaireNetApresIR + dividendesNets;
                    
                    options.push({
                        ratioSalaire: ratio,
                        salaire,
                        dividendesBruts: resultatApresIS,
                        revenuNetTotal,
                        taux: revenuNetTotal / resultat * 100,
                        detail: {
                            salaire,
                            charges: chargesSociales,
                            salaireNet,
                            ir,
                            salaireNetApresIR,
                            resultatApres,
                            is,
                            resultatApresIS,
                            pfu,
                            dividendesNets
                        }
                    });
                }
                
                // Trouver l'option optimale
                return options.reduce((best, current) => 
                    current.revenuNetTotal > best.revenuNetTotal ? current : best, options[0]);
            }
        };
    }
    
    // MICRO-ENTREPRISE
    static simulerMicroEntreprise(params) {
        const { ca, typeMicro = 'BIC', tmiActuel = 30, modeProgressif = false } = params;
        
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
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
            'BNC': 0.212 // 21.2%
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
        
        // Calcul de l'impôt sur le revenu (avec mode progressif ou simplifié)
        const impotRevenu = window.FiscalUtils.calculIR(revenuImposable, tmiActuel, modeProgressif);
        
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
            modeProgressif: modeProgressif
        };
    }
    
    // ENTREPRISE INDIVIDUELLE AU RÉGIME RÉEL
    static simulerEI(params) {
        const { ca, tauxMarge = 0.3, tmiActuel = 30, modeProgressif = false } = params;
        
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
        // Calcul du bénéfice avant cotisations
        const beneficeAvantCotisations = Math.round(ca * tauxMarge);
        
        // Calcul des cotisations sociales TNS
        const cotisationsSociales = window.FiscalUtils.calculChargesTNS(beneficeAvantCotisations);
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeAvantCotisations - cotisationsSociales;
        
        // Calcul de l'impôt sur le revenu (avec mode progressif ou simplifié)
        const impotRevenu = window.FiscalUtils.calculIR(beneficeApresCotisations, tmiActuel, modeProgressif);
        
        // Calcul du revenu net après impôt
        const revenuNetApresImpot = beneficeApresCotisations - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'Entreprise Individuelle',
            tauxMarge: tauxMarge * 100 + '%',
            beneficeAvantCotisations: beneficeAvantCotisations,
            cotisationsSociales: cotisationsSociales,
            beneficeApresCotisations: beneficeApresCotisations,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100,
            modeProgressif: modeProgressif
        };
    }
    
    // EURL
    static simulerEURL(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            optionIS = false, 
            tmiActuel = 30,
            modeProgressif = false,
            optimiser = false 
        } = params;
        
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Simulation selon le régime d'imposition
        if (!optionIS) {
            // Régime IR (transparence fiscale)
            
            // Calcul de la rémunération du gérant
            const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
            const resultatApresRemuneration = resultatEntreprise - remuneration;
            
            // Cotisations sociales TNS
            const cotisationsSociales = window.FiscalUtils.calculChargesTNS(remuneration);
            
            // Bénéfice imposable (remuneration + résultat après rémunération)
            const beneficeImposable = remuneration - cotisationsSociales + resultatApresRemuneration;
            
            // Calcul de l'impôt sur le revenu (avec mode progressif ou simplifié)
            const impotRevenu = window.FiscalUtils.calculIR(beneficeImposable, tmiActuel, modeProgressif);
            
            // Calcul du revenu net après impôt
            const revenuNetApresImpot = beneficeImposable - impotRevenu;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'EURL à l\\'IR',
                tauxMarge: tauxMarge * 100 + '%',
                resultatAvantRemuneration: resultatEntreprise,
                remuneration: remuneration,
                resultatApresRemuneration: resultatApresRemuneration,
                cotisationsSociales: cotisationsSociales,
                beneficeImposable: beneficeImposable,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                revenuNetTotal: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100,
                modeProgressif: modeProgressif
            };
            
        } else {
            // Régime IS - Optimisation possible
            if (optimiser) {
                // Utiliser l'algorithme d'optimisation
                const optimisation = window.FiscalUtils.optimiserRepartition(resultatEntreprise, tmiActuel, 'EURL');
                
                return {
                    compatible: true,
                    ca: ca,
                    typeEntreprise: 'EURL à l\\'IS (optimisée)',
                    tauxMarge: tauxMarge * 100 + '%',
                    resultatEntreprise: resultatEntreprise,
                    ratioOptimal: optimisation.ratioSalaire,
                    remuneration: optimisation.detail.salaire,
                    cotisationsSociales: optimisation.detail.charges,
                    remunerationNetteSociale: optimisation.detail.salaireNet,
                    impotRevenu: optimisation.detail.ir,
                    revenuNetSalaire: optimisation.detail.salaireNetApresIR,
                    resultatApresRemuneration: optimisation.detail.resultatApres,
                    is: optimisation.detail.is,
                    resultatApresIS: optimisation.detail.resultatApresIS,
                    dividendes: optimisation.detail.resultatApresIS,
                    prelevementForfaitaire: optimisation.detail.pfu,
                    dividendesNets: optimisation.detail.dividendesNets,
                    revenuNetTotal: optimisation.revenuNetTotal,
                    ratioNetCA: (optimisation.revenuNetTotal / ca) * 100,
                    ratioNetResultat: optimisation.taux,
                    modeProgressif: modeProgressif,
                    optimisation: true
                };
            }
            
            // Simulation standard sans optimisation
            // Calcul de la rémunération du gérant
            const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
            const resultatApresRemuneration = resultatEntreprise - remuneration;
            
            // Calcul des cotisations sociales TNS
            const cotisationsSociales = window.FiscalUtils.calculChargesTNS(remuneration);
            
            // Calcul de l'impôt sur le revenu sur la rémunération
            const remunerationNetteSociale = remuneration - cotisationsSociales;
            const impotRevenu = window.FiscalUtils.calculIR(remunerationNetteSociale, tmiActuel, modeProgressif);
            
            // Revenu net sur la partie salaire
            const revenuNetSalaire = remunerationNetteSociale - impotRevenu;
            
            // Calcul de l'IS
            const isDetails = window.FiscalUtils.calculIS(resultatApresRemuneration);
            const is = isDetails.montant;
            
            // Résultat après IS
            const resultatApresIS = resultatApresRemuneration - is;
            
            // Distribution de dividendes (simplifié - 100% du résultat après IS)
            const dividendes = resultatApresIS;
            
            // Calcul du PFU sur les dividendes
            const pfuDetails = window.FiscalUtils.calculPFU(dividendes);
            const prelevementForfaitaire = pfuDetails.total;
            
            // Dividendes nets après PFU
            const dividendesNets = dividendes - prelevementForfaitaire;
            
            // Revenu net total
            const revenuNetTotal = revenuNetSalaire + dividendesNets;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'EURL à l\\'IS',
                tauxMarge: tauxMarge * 100 + '%',
                resultatEntreprise: resultatEntreprise,
                remuneration: remuneration,
                cotisationsSociales: cotisationsSociales,
                remunerationNetteSociale: remunerationNetteSociale,
                impotRevenu: impotRevenu,
                revenuNetSalaire: revenuNetSalaire,
                resultatApresRemuneration: resultatApresRemuneration,
                is: is,
                resultatApresIS: resultatApresIS,
                dividendes: dividendes,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100,
                modeProgressif: modeProgressif,
                optimisation: false
            };
        }
    }
    
    // SASU
    static simulerSASU(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            modeProgressif = false,
            optimiser = false 
        } = params;
        
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Si optimisation demandée
        if (optimiser) {
            // Utiliser l'algorithme d'optimisation
            const optimisation = window.FiscalUtils.optimiserRepartition(resultatEntreprise, tmiActuel, 'SASU');
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'SASU (optimisée)',
                tauxMarge: tauxMarge * 100 + '%',
                resultatEntreprise: resultatEntreprise,
                ratioOptimal: optimisation.ratioSalaire,
                remuneration: optimisation.detail.salaire,
                chargesPatronales: optimisation.detail.charges * 0.7, // approximation
                chargesSalariales: optimisation.detail.charges * 0.3, // approximation
                salaireNet: optimisation.detail.salaireNet,
                impotRevenu: optimisation.detail.ir,
                salaireNetApresIR: optimisation.detail.salaireNetApresIR,
                resultatApresRemuneration: optimisation.detail.resultatApres,
                is: optimisation.detail.is,
                resultatApresIS: optimisation.detail.resultatApresIS,
                dividendes: optimisation.detail.resultatApresIS,
                prelevementForfaitaire: optimisation.detail.pfu,
                dividendesNets: optimisation.detail.dividendesNets,
                revenuNetTotal: optimisation.revenuNetTotal,
                ratioNetCA: (optimisation.revenuNetTotal / ca) * 100,
                ratioNetResultat: optimisation.taux,
                modeProgressif: modeProgressif,
                optimisation: true
            };
        }
        
        // Simulation standard sans optimisation
        // Calcul de la rémunération du président
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales avec FiscalUtils
        const chargesSociales = window.FiscalUtils.calculChargesSalariees(remuneration);
        const chargesPatronales = chargesSociales.chargesPatronales;
        const coutTotalEmployeur = remuneration + chargesPatronales;
        const chargesSalariales = chargesSociales.chargesSalariales;
        const salaireNet = chargesSociales.salaireNet;
        
        // Calcul de l'impôt sur le revenu
        const impotRevenu = window.FiscalUtils.calculIR(salaireNet, tmiActuel, modeProgressif);
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const isDetails = window.FiscalUtils.calculIS(resultatApresRemuneration);
        const is = isDetails.montant;
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        const dividendes = resultatApresIS;
        
        // Calcul du PFU sur les dividendes
        const pfuDetails = window.FiscalUtils.calculPFU(dividendes);
        const prelevementForfaitaire = pfuDetails.total;
        
        // Dividendes nets après PFU
        const dividendesNets = dividendes - prelevementForfaitaire;
        
        // Revenu net total
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
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
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendes: dividendes,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            modeProgressif: modeProgressif,
            optimisation: false
        };
    }

    // SARL (avec optimisation possible)
    static simulerSARL(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            gerantMajoritaire = true,
            nbAssocies = 2,
            modeProgressif = false,
            optimiser = false
        } = params;
        
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Si optimisation demandée
        if (optimiser) {
            // Algorithme d'optimisation (similaire à SASU/EURL selon le régime du gérant)
            const typeOptimisation = gerantMajoritaire ? 'EURL' : 'SASU';
            const optimisation = window.FiscalUtils.optimiserRepartition(resultatEntreprise, tmiActuel, typeOptimisation);
            
            // Ajuster les dividendes selon la part du gérant
            const partGerant = gerantMajoritaire ? 0.51 : (1 / nbAssocies);
            const dividendesGerant = Math.round(optimisation.detail.resultatApresIS * partGerant);
            const pfuGerant = Math.round(dividendesGerant * 0.3);
            const dividendesNetsGerant = dividendesGerant - pfuGerant;
            
            // Revenu net total ajusté
            const revenuNetTotal = optimisation.detail.salaireNetApresIR + dividendesNetsGerant;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'SARL (optimisée)',
                tauxMarge: tauxMarge * 100 + '%',
                gerantMajoritaire: gerantMajoritaire,
                resultatEntreprise: resultatEntreprise,
                ratioOptimal: optimisation.ratioSalaire,
                remuneration: optimisation.detail.salaire,
                cotisationsSociales: optimisation.detail.charges,
                salaireNet: optimisation.detail.salaireNet,
                impotRevenu: optimisation.detail.ir,
                salaireNetApresIR: optimisation.detail.salaireNetApresIR,
                resultatApresRemuneration: optimisation.detail.resultatApres,
                is: optimisation.detail.is,
                resultatApresIS: optimisation.detail.resultatApresIS,
                dividendesBruts: optimisation.detail.resultatApresIS,
                partGerant: partGerant,
                dividendesGerant: dividendesGerant,
                prelevementForfaitaire: pfuGerant,
                dividendesNetsGerant: dividendesNetsGerant,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100,
                modeProgressif: modeProgressif,
                optimisation: true
            };
        }
        
        // Simulation standard sans optimisation
        // Calcul de la rémunération du gérant
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Régime social différent selon que le gérant est majoritaire ou non
        let cotisationsSociales = 0;
        let salaireNet = 0;
        
        if (gerantMajoritaire) {
            // Gérant majoritaire = TNS
            cotisationsSociales = window.FiscalUtils.calculChargesTNS(remuneration);
            salaireNet = remuneration - cotisationsSociales;
        } else {
            // Gérant minoritaire = assimilé salarié
            const chargesSociales = window.FiscalUtils.calculChargesSalariees(remuneration);
            cotisationsSociales = chargesSociales.chargesPatronales + chargesSociales.chargesSalariales;
            salaireNet = chargesSociales.salaireNet;
        }
        
        // Calcul de l'impôt sur le revenu
        const impotRevenu = window.FiscalUtils.calculIR(salaireNet, tmiActuel, modeProgressif);
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const isDetails = window.FiscalUtils.calculIS(resultatApresRemuneration);
        const is = isDetails.montant;
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        const partGerant = gerantMajoritaire ? 0.51 : (1 / nbAssocies);
        const dividendesBruts = resultatApresIS;
        const dividendesGerant = Math.round(dividendesBruts * partGerant);
        
        // Calcul du PFU sur les dividendes
        const pfuDetails = window.FiscalUtils.calculPFU(dividendesGerant);
        const prelevementForfaitaire = pfuDetails.total;
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesGerant - prelevementForfaitaire;
        
        // Revenu net total
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SARL',
            tauxMarge: tauxMarge * 100 + '%',
            gerantMajoritaire: gerantMajoritaire,
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            cotisationsSociales: cotisationsSociales,
            salaireNet: salaireNet,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendesBruts: dividendesBruts,
            partGerant: partGerant,
            dividendesGerant: dividendesGerant,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            modeProgressif: modeProgressif,
            optimisation: false
        };
    }

    // SAS (avec optimisation possible)
    static simulerSAS(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            nbAssocies = 2,
            partPresident = 0.5,
            modeProgressif = false,
            optimiser = false
        } = params;
        
        // Réutiliser la logique de SASU avec ajustement pour la part des dividendes
        const resultats = this.simulerSASU({
            ca, 
            tauxMarge, 
            tauxRemuneration, 
            tmiActuel,
            modeProgressif,
            optimiser
        });
        
        // Ajuster les dividendes selon la part du président
        if (resultats.compatible) {
            resultats.typeEntreprise = 'SAS' + (optimiser ? ' (optimisée)' : '');
            resultats.nbAssocies = nbAssocies;
            resultats.partPresident = partPresident;
            
            // Ajuster uniquement les dividendes (le salaire reste le même)
            if (optimiser) {
                const dividendesPresident = Math.round(resultats.dividendes * partPresident);
                const pfuPresident = Math.round(dividendesPresident * 0.3);
                const dividendesNetsPresident = dividendesPresident - pfuPresident;
                
                resultats.dividendesPresident = dividendesPresident;
                resultats.prelevementForfaitairePresident = pfuPresident;
                resultats.dividendesNetsPresident = dividendesNetsPresident;
                resultats.revenuNetTotal = resultats.salaireNetApresIR + dividendesNetsPresident;
                resultats.ratioNetCA = (resultats.revenuNetTotal / ca) * 100;
            } else {
                const dividendesPresident = Math.round(resultats.dividendes * partPresident);
                const pfuPresident = Math.round(dividendesPresident * 0.3);
                const dividendesNetsPresident = dividendesPresident - pfuPresident;
                
                resultats.dividendesPresident = dividendesPresident;
                resultats.prelevementForfaitairePresident = pfuPresident;
                resultats.dividendesNetsPresident = dividendesNetsPresident;
                resultats.revenuNetTotal = resultats.salaireNetApresIR + dividendesNetsPresident;
                resultats.ratioNetCA = (resultats.revenuNetTotal / ca) * 100;
            }
        }
        
        return resultats;
    }

    // SA (avec optimisation possible)
    static simulerSA(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            partPDG = 0.3,
            capitalInvesti = 37000,
            modeProgressif = false,
            optimiser = false
        } = params;
        
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
        // Vérifier si le capital minimum requis est respecté
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Coût supplémentaire: rémunération du commissaire aux comptes (forfait simplifié)
        const coutCAC = 5000;
        const resultatAvantCAC = resultatEntreprise;
        const resultatApresCAC = resultatAvantCAC - coutCAC;
        
        // Si optimisation demandée
        if (optimiser) {
            // Utiliser l'algorithme d'optimisation (similaire à SASU)
            const optimisation = window.FiscalUtils.optimiserRepartition(resultatApresCAC, tmiActuel, 'SA');
            
            // Ajuster les dividendes selon la part du PDG
            const dividendesPDG = Math.round(optimisation.detail.resultatApresIS * partPDG);
            const pfuPDG = Math.round(dividendesPDG * 0.3);
            const dividendesNetsPDG = dividendesPDG - pfuPDG;
            
            // Revenu net total ajusté
            const revenuNetTotal = optimisation.detail.salaireNetApresIR + dividendesNetsPDG;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'SA (optimisée)',
                tauxMarge: tauxMarge * 100 + '%',
                resultatEntreprise: resultatEntreprise,
                coutCAC: coutCAC,
                resultatApresCAC: resultatApresCAC,
                ratioOptimal: optimisation.ratioSalaire,
                remuneration: optimisation.detail.salaire,
                chargesPatronales: optimisation.detail.charges * 0.7, // approximation
                chargesSalariales: optimisation.detail.charges * 0.3, // approximation
                salaireNet: optimisation.detail.salaireNet,
                impotRevenu: optimisation.detail.ir,
                salaireNetApresIR: optimisation.detail.salaireNetApresIR,
                resultatApresRemuneration: optimisation.detail.resultatApres,
                is: optimisation.detail.is,
                resultatApresIS: optimisation.detail.resultatApresIS,
                dividendesBruts: optimisation.detail.resultatApresIS,
                partPDG: partPDG,
                dividendesPDG: dividendesPDG,
                prelevementForfaitaire: pfuPDG,
                dividendesNetsPDG: dividendesNetsPDG,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100,
                modeProgressif: modeProgressif,
                optimisation: true
            };
        }
        
        // Simulation standard sans optimisation
        // Calcul de la rémunération du PDG
        const remuneration = Math.round(resultatApresCAC * tauxRemuneration);
        const resultatApresRemuneration = resultatApresCAC - remuneration;
        
        // Calcul des charges sociales
        const chargesSociales = window.FiscalUtils.calculChargesSalariees(remuneration);
        const chargesPatronales = chargesSociales.chargesPatronales;
        const coutTotalEmployeur = remuneration + chargesPatronales;
        const chargesSalariales = chargesSociales.chargesSalariales;
        const salaireNet = chargesSociales.salaireNet;
        
        // Calcul de l'impôt sur le revenu
        const impotRevenu = window.FiscalUtils.calculIR(salaireNet, tmiActuel, modeProgressif);
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const isDetails = window.FiscalUtils.calculIS(resultatApresRemuneration);
        const is = isDetails.montant;
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes (hypothèse: 70% du résultat distribué)
        const tauxDistribution = 0.7;
        const dividendesBruts = Math.round(resultatApresIS * tauxDistribution);
        const dividendesPDG = Math.round(dividendesBruts * partPDG);
        
        // Calcul du PFU sur les dividendes
        const pfuDetails = window.FiscalUtils.calculPFU(dividendesPDG);
        const prelevementForfaitaire = pfuDetails.total;
        
        // Dividendes nets après PFU
        const dividendesNetsPDG = dividendesPDG - prelevementForfaitaire;
        
        // Revenu net total
        const revenuNetTotal = salaireNetApresIR + dividendesNetsPDG;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SA',
            tauxMarge: tauxMarge * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            coutCAC: coutCAC,
            resultatApresCAC: resultatApresCAC,
            remuneration: remuneration,
            chargesPatronales: chargesPatronales,
            coutTotalEmployeur: coutTotalEmployeur,
            chargesSalariales: chargesSalariales,
            salaireNet: salaireNet,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            tauxDistribution: tauxDistribution * 100 + '%',
            dividendesBruts: dividendesBruts,
            partPDG: partPDG,
            dividendesPDG: dividendesPDG,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNetsPDG: dividendesNetsPDG,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            modeProgressif: modeProgressif,
            optimisation: false
        };
    }

    // Autres méthodes existantes (SNC, SCI, SELARL, SELAS, SCA) à compléter de la même manière
    // ...

    /**
     * Comparer plusieurs statuts juridiques avec les mêmes paramètres
     * @param {Object} params - Paramètres communs
     * @param {Array} statuts - Tableau des statuts à comparer
     * @param {boolean} modeProgressif - Utiliser le calcul progressif de l'IR
     * @param {boolean} optimiser - Optimiser les ratios rémunération/dividendes
     * @returns {Array} - Résultats comparatifs triés par revenu net
     */
    static comparerStatuts(params, statuts = [], modeProgressif = false, optimiser = false) {
        // Vérifier/charger FiscalUtils
        this._checkFiscalUtils();
        
        const resultats = [];
        
        // Statuts par défaut si non spécifiés
        if (!statuts || statuts.length === 0) {
            statuts = ['micro', 'ei', 'eurl', 'eurlIS', 'sasu', 'sarl', 'sas'];
        }
        
        // Pour chaque statut demandé, exécuter la simulation correspondante
        for (const statut of statuts) {
            try {
                let resultat;
                
                switch (statut.toLowerCase()) {
                    case 'micro':
                        resultat = this.simulerMicroEntreprise({...params, modeProgressif});
                        break;
                    case 'ei':
                        resultat = this.simulerEI({...params, modeProgressif});
                        break;
                    case 'eurl':
                        resultat = this.simulerEURL({...params, optionIS: false, modeProgressif, optimiser});
                        break;
                    case 'eurlis':
                        resultat = this.simulerEURL({...params, optionIS: true, modeProgressif, optimiser});
                        break;
                    case 'sasu':
                        resultat = this.simulerSASU({...params, modeProgressif, optimiser});
                        break;
                    case 'sarl':
                        resultat = this.simulerSARL({...params, modeProgressif, optimiser});
                        break;
                    case 'sas':
                        resultat = this.simulerSAS({...params, modeProgressif, optimiser});
                        break;
                    case 'sa':
                        resultat = this.simulerSA({...params, modeProgressif, optimiser});
                        break;
                    // Ajouter d'autres cas au besoin
                }
                
                if (resultat && resultat.compatible) {
                    resultats.push(resultat);
                }
                
            } catch (e) {
                console.error(`Erreur lors de la simulation pour ${statut}:`, e);
            }
        }
        
        // Trier les résultats par revenu net décroissant
        return resultats.sort((a, b) => b.revenuNetTotal - a.revenuNetTotal);
    }
}

// Exposer la classe au niveau global
window.SimulationsFiscales = SimulationsFiscales;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module SimulationsFiscales v3.0 chargé avec optimisation");
    
    // Déclencher un événement pour signaler que les simulations fiscales sont prêtes
    document.dispatchEvent(new CustomEvent('simulationsFiscalesReady'));
});