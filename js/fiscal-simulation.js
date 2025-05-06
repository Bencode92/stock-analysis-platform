// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 2.0 - Mai 2025 - Étendu avec tous les statuts juridiques

// Classe pour les simulations fiscales des différents statuts juridiques
class SimulationsFiscales {
    
    // MICRO-ENTREPRISE
    static simulerMicroEntreprise(params) {
        const { ca, typeMicro = 'BIC', tmiActuel = 30 } = params;
        
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
        
        // Calcul de l'impôt sur le revenu (simplifié - taux marginal * revenu imposable)
        const impotRevenu = Math.round(revenuImposable * (tmiActuel / 100));
        
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
            ratioNetCA: (revenuNetApresImpot / ca) * 100
        };
    }
    
    // ENTREPRISE INDIVIDUELLE AU RÉGIME RÉEL
    static simulerEI(params) {
        const { ca, tauxMarge = 0.3, tmiActuel = 30 } = params;
        
        // Calcul du bénéfice avant cotisations (simplifié - CA * taux de marge)
        const beneficeAvantCotisations = Math.round(ca * tauxMarge);
        
        // Taux de cotisations sociales pour les TNS (simplifié - environ 45% du bénéfice)
        const tauxCotisationsTNS = 0.45;
        const cotisationsSociales = Math.round(beneficeAvantCotisations * tauxCotisationsTNS);
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeAvantCotisations - cotisationsSociales;
        
        // Calcul de l'impôt sur le revenu (simplifié - taux marginal * bénéfice)
        const impotRevenu = Math.round(beneficeApresCotisations * (tmiActuel / 100));
        
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
            ratioNetCA: (revenuNetApresImpot / ca) * 100
        };
    }
    
    // EURL
    static simulerEURL(params) {
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, optionIS = false, tmiActuel = 30 } = params;
        
        // Calcul du résultat de l'entreprise (simplifié - CA * taux de marge)
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du gérant
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Simulation selon le régime d'imposition
        if (!optionIS) {
            // Régime IR (transparence fiscale)
            
            // Taux de cotisations sociales pour les TNS (simplifié - environ 45% de la rémunération)
            const tauxCotisationsTNS = 0.45;
            const cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
            
            // Bénéfice imposable (remuneration + résultat après rémunération)
            const beneficeImposable = remuneration - cotisationsSociales + resultatApresRemuneration;
            
            // Calcul de l'impôt sur le revenu (simplifié - taux marginal * bénéfice imposable)
            const impotRevenu = Math.round(beneficeImposable * (tmiActuel / 100));
            
            // Calcul du revenu net après impôt
            const revenuNetApresImpot = beneficeImposable - impotRevenu;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'EURL à l\'IR',
                tauxMarge: tauxMarge * 100 + '%',
                resultatAvantRemuneration: resultatEntreprise,
                remuneration: remuneration,
                resultatApresRemuneration: resultatApresRemuneration,
                cotisationsSociales: cotisationsSociales,
                beneficeImposable: beneficeImposable,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                revenuNetTotal: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100
            };
        } else {
            // Régime IS
            
            // Taux de cotisations sociales pour les TNS (simplifié - environ 45% de la rémunération)
            const tauxCotisationsTNS = 0.45;
            const cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
            
            // Calcul de l'impôt sur le revenu sur la rémunération
            const remunerationNetteSociale = remuneration - cotisationsSociales;
            const impotRevenu = Math.round(remunerationNetteSociale * (tmiActuel / 100));
            
            // Calcul de l'IS
            const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25; // Taux réduit jusqu'à 42 500€
            const is = Math.round(resultatApresRemuneration * tauxIS);
            
            // Résultat après IS
            const resultatApresIS = resultatApresRemuneration - is;
            
            // Distribution de dividendes (simplifié - 100% du résultat après IS)
            const dividendes = resultatApresIS;
            
            // Calcul du PFU sur les dividendes (30%)
            const tauxPFU = 0.30;
            const prelevementForfaitaire = Math.round(dividendes * tauxPFU);
            
            // Dividendes nets après PFU
            const dividendesNets = dividendes - prelevementForfaitaire;
            
            // Revenu net total (rémunération nette + dividendes nets)
            const revenuNetSalaire = remunerationNetteSociale - impotRevenu;
            const revenuNetTotal = revenuNetSalaire + dividendesNets;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'EURL à l\'IS',
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
                dividendes: dividendes,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100
            };
        }
    }
    
    // SASU
    static simulerSASU(params) {
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, tmiActuel = 30 } = params;
        
        // Calcul du résultat de l'entreprise (simplifié - CA * taux de marge)
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du président
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales (environ 80-85% pour un assimilé salarié)
        // Hypothèse simplifiée: 55% de charges patronales, 22% de charges salariales
        const tauxChargesPatronales = 0.55;
        const tauxChargesSalariales = 0.22;
        
        const chargesPatronales = Math.round(remuneration * tauxChargesPatronales);
        const coutTotalEmployeur = remuneration + chargesPatronales;
        
        const chargesSalariales = Math.round(remuneration * tauxChargesSalariales);
        const salaireNet = remuneration - chargesSalariales;
        
        // Calcul de l'impôt sur le revenu (simplifié - taux marginal * salaire net)
        const impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25; // Taux réduit jusqu'à 42 500€
        const is = Math.round(resultatApresRemuneration * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes (simplifié - 100% du résultat après IS)
        const dividendes = resultatApresIS;
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendes * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendes - prelevementForfaitaire;
        
        // Revenu net total (salaire net + dividendes nets)
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
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }

    // SARL (nouveau)
    static simulerSARL(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            gerantMajoritaire = true, // Par défaut, gérant majoritaire
            nbAssocies = 2 // Par défaut, 2 associés
        } = params;
        
        // Calcul du résultat de l'entreprise (simplifié - CA * taux de marge)
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du gérant
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Régime social différent selon que le gérant est majoritaire ou non
        let cotisationsSociales = 0;
        let salaireNet = 0;
        
        if (gerantMajoritaire) {
            // Gérant majoritaire = TNS (même calcul que pour EURL)
            const tauxCotisationsTNS = 0.45;
            cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
            salaireNet = remuneration - cotisationsSociales;
        } else {
            // Gérant minoritaire = assimilé salarié (même calcul que pour SASU)
            const tauxChargesPatronales = 0.55;
            const tauxChargesSalariales = 0.22;
            
            const chargesPatronales = Math.round(remuneration * tauxChargesPatronales);
            const coutTotalEmployeur = remuneration + chargesPatronales;
            
            const chargesSalariales = Math.round(remuneration * tauxChargesSalariales);
            salaireNet = remuneration - chargesSalariales;
            
            cotisationsSociales = chargesPatronales + chargesSalariales;
        }
        
        // Calcul de l'impôt sur le revenu (simplifié - taux marginal * salaire net)
        const impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25; // Taux réduit jusqu'à 42 500€
        const is = Math.round(resultatApresRemuneration * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes (simplifié - 100% du résultat après IS)
        // Pour le gérant, on considère qu'il reçoit des dividendes proportionnels à ses parts sociales
        // Si gérant majoritaire, on estime qu'il détient 51% minimum des parts
        const partGerant = gerantMajoritaire ? 0.51 : (1 / nbAssocies);
        const dividendesBruts = resultatApresIS;
        const dividendesGerant = Math.round(dividendesBruts * partGerant);
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendesGerant * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesGerant - prelevementForfaitaire;
        
        // Revenu net total (salaire net + dividendes nets)
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SARL',
            tauxMarge: tauxMarge * 100 + '%',
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
            dividendesGerant: dividendesGerant,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }

    // SAS (nouveau)
    static simulerSAS(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            nbAssocies = 2, // Par défaut, 2 associés
            partPresident = 0.5 // Par défaut, le président détient 50% des parts
        } = params;
        
        // La simulation est très similaire à celle de SASU, mais avec répartition des dividendes
        // entre plusieurs associés

        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du président
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales (environ 80-85% pour un assimilé salarié)
        const tauxChargesPatronales = 0.55;
        const tauxChargesSalariales = 0.22;
        
        const chargesPatronales = Math.round(remuneration * tauxChargesPatronales);
        const coutTotalEmployeur = remuneration + chargesPatronales;
        
        const chargesSalariales = Math.round(remuneration * tauxChargesSalariales);
        const salaireNet = remuneration - chargesSalariales;
        
        // Calcul de l'impôt sur le revenu
        const impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
        const is = Math.round(resultatApresRemuneration * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        // Le président reçoit une part des dividendes selon son % d'actions
        const dividendesBruts = resultatApresIS;
        const dividendesPresident = Math.round(dividendesBruts * partPresident);
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendesPresident * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesPresident - prelevementForfaitaire;
        
        // Revenu net total (salaire net + dividendes nets)
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SAS',
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
            dividendesBruts: dividendesBruts,
            dividendesPresident: dividendesPresident,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }

    // SA (nouveau)
    static simulerSA(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            partPDG = 0.3, // Par défaut, le PDG détient 30% des parts
            capitalInvesti = 37000 // Capital minimum d'une SA
        } = params;
        
        // Vérifier si le capital minimum requis est respecté
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du PDG
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales (environ 80-85% pour un assimilé salarié)
        const tauxChargesPatronales = 0.55;
        const tauxChargesSalariales = 0.22;
        
        const chargesPatronales = Math.round(remuneration * tauxChargesPatronales);
        const coutTotalEmployeur = remuneration + chargesPatronales;
        
        const chargesSalariales = Math.round(remuneration * tauxChargesSalariales);
        const salaireNet = remuneration - chargesSalariales;
        
        // Calcul de l'impôt sur le revenu
        const impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Coût supplémentaire: rémunération du commissaire aux comptes (forfait simplifié)
        const coutCAC = 5000;
        const resultatApresCAC = resultatApresRemuneration - coutCAC;
        
        // Calcul de l'IS
        const tauxIS = resultatApresCAC <= 42500 ? 0.15 : 0.25;
        const is = Math.round(resultatApresCAC * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresCAC - is;
        
        // Distribution de dividendes (hypothèse: 70% du résultat distribué)
        const tauxDistribution = 0.7;
        const dividendesBruts = Math.round(resultatApresIS * tauxDistribution);
        const dividendesPDG = Math.round(dividendesBruts * partPDG);
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendesPDG * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesPDG - prelevementForfaitaire;
        
        // Revenu net total (salaire net + dividendes nets)
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SA',
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
            coutCAC: coutCAC,
            resultatApresCAC: resultatApresCAC,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendesBruts: dividendesBruts,
            dividendesPDG: dividendesPDG,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }

    // SNC (nouveau)
    static simulerSNC(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tmiActuel = 30,
            nbAssocies = 2, // Par défaut, 2 associés
            partAssociePrincipal = 0.5 // Part de l'associé principal
        } = params;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // En SNC, le résultat est imposé directement chez les associés (transparence fiscale)
        // Pas d'IS, mais IR sur la part de bénéfice de chaque associé
        
        // Part du bénéfice pour l'associé principal
        const beneficeAssociePrincipal = Math.round(resultatEntreprise * partAssociePrincipal);
        
        // Cotisations sociales TNS (~ 45%)
        const tauxCotisationsTNS = 0.45;
        const cotisationsSociales = Math.round(beneficeAssociePrincipal * tauxCotisationsTNS);
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeAssociePrincipal - cotisationsSociales;
        
        // Impôt sur le revenu
        const impotRevenu = Math.round(beneficeApresCotisations * (tmiActuel / 100));
        
        // Revenu net après impôt
        const revenuNetApresImpot = beneficeApresCotisations - impotRevenu;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SNC',
            tauxMarge: tauxMarge * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            beneficeAssociePrincipal: beneficeAssociePrincipal,
            cotisationsSociales: cotisationsSociales,
            beneficeApresCotisations: beneficeApresCotisations,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100
        };
    }

    // SCI (nouveau)
    static simulerSCI(params) {
        const { 
            revenuLocatif = 50000, // Par défaut, revenu locatif de 50000€
            chargesDeductibles = 10000, // Par défaut, charges déductibles de 10000€
            tmiActuel = 30,
            optionIS = false, // Par défaut, IR (pas d'option IS)
            partAssociePrincipal = 0.5 // Part de l'associé principal
        } = params;
        
        // Pour une SCI, on travaille avec des revenus locatifs plutôt qu'un CA
        const ca = revenuLocatif;
        
        // Résultat fiscal = revenus locatifs - charges déductibles
        const resultatFiscal = revenuLocatif - chargesDeductibles;
        
        // Part du résultat fiscal pour l'associé principal
        const resultatFiscalAssocie = Math.round(resultatFiscal * partAssociePrincipal);
        
        if (!optionIS) {
            // Régime IR par défaut - Revenus fonciers pour les associés
            // Pas de cotisations sociales sur les revenus fonciers
            
            // Prélèvements sociaux (17.2% pour 2025)
            const tauxPrelevementsSociaux = 0.172;
            const prelevementsSociaux = Math.round(resultatFiscalAssocie * tauxPrelevementsSociaux);
            
            // Impôt sur le revenu
            const impotRevenu = Math.round(resultatFiscalAssocie * (tmiActuel / 100));
            
            // Revenu net après impôt et prélèvements sociaux
            const revenuNetApresImpot = resultatFiscalAssocie - impotRevenu - prelevementsSociaux;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'SCI à l\'IR',
                revenuLocatif: revenuLocatif,
                chargesDeductibles: chargesDeductibles,
                resultatFiscal: resultatFiscal,
                resultatFiscalAssocie: resultatFiscalAssocie,
                prelevementsSociaux: prelevementsSociaux,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100
            };
        } else {
            // Option IS (généralement défavorable pour une SCI qui ne fait que de la location nue)
            
            // Calcul de l'IS
            const tauxIS = resultatFiscal <= 42500 ? 0.15 : 0.25;
            const is = Math.round(resultatFiscal * tauxIS);
            
            // Résultat après IS
            const resultatApresIS = resultatFiscal - is;
            
            // Distribution de dividendes (100% du résultat après IS)
            const dividendesBruts = resultatApresIS;
            const dividendesAssocie = Math.round(dividendesBruts * partAssociePrincipal);
            
            // Calcul du PFU sur les dividendes (30%)
            const tauxPFU = 0.30;
            const prelevementForfaitaire = Math.round(dividendesAssocie * tauxPFU);
            
            // Dividendes nets après PFU
            const dividendesNets = dividendesAssocie - prelevementForfaitaire;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: 'SCI à l\'IS',
                revenuLocatif: revenuLocatif,
                chargesDeductibles: chargesDeductibles,
                resultatFiscal: resultatFiscal,
                is: is,
                resultatApresIS: resultatApresIS,
                dividendesBruts: dividendesBruts,
                dividendesAssocie: dividendesAssocie,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetApresImpot: dividendesNets,
                ratioNetCA: (dividendesNets / ca) * 100
            };
        }
    }

    // SELARL (nouveau)
    static simulerSELARL(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            gerantMajoritaire = true // Par défaut, gérant majoritaire
        } = params;
        
        // La SELARL fonctionne de manière similaire à la SARL, mais est destinée aux professions libérales
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du gérant
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Régime social selon que le gérant est majoritaire ou non
        let cotisationsSociales = 0;
        let salaireNet = 0;
        
        if (gerantMajoritaire) {
            // Gérant majoritaire = TNS
            const tauxCotisationsTNS = 0.45;
            cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
            salaireNet = remuneration - cotisationsSociales;
        } else {
            // Gérant minoritaire = assimilé salarié
            const tauxChargesPatronales = 0.55;
            const tauxChargesSalariales = 0.22;
            
            const chargesPatronales = Math.round(remuneration * tauxChargesPatronales);
            const coutTotalEmployeur = remuneration + chargesPatronales;
            
            const chargesSalariales = Math.round(remuneration * tauxChargesSalariales);
            salaireNet = remuneration - chargesSalariales;
            
            cotisationsSociales = chargesPatronales + chargesSalariales;
        }
        
        // Impôt sur le revenu
        const impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
        const is = Math.round(resultatApresRemuneration * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes (simplifié - 100% du résultat après IS)
        const dividendesBruts = resultatApresIS;
        const partGerant = gerantMajoritaire ? 0.51 : 0.49;
        const dividendesGerant = Math.round(dividendesBruts * partGerant);
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendesGerant * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesGerant - prelevementForfaitaire;
        
        // Revenu net total (salaire net + dividendes nets)
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SELARL',
            tauxMarge: tauxMarge * 100 + '%',
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
            dividendesGerant: dividendesGerant,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }

    // SELAS (nouveau)
    static simulerSELAS(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            partPresident = 0.51 // Par défaut, le président détient 51% des parts
        } = params;
        
        // La SELAS fonctionne de manière similaire à la SAS, mais est destinée aux professions libérales
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du président
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales (environ 80-85% pour un assimilé salarié)
        const tauxChargesPatronales = 0.55;
        const tauxChargesSalariales = 0.22;
        
        const chargesPatronales = Math.round(remuneration * tauxChargesPatronales);
        const coutTotalEmployeur = remuneration + chargesPatronales;
        
        const chargesSalariales = Math.round(remuneration * tauxChargesSalariales);
        const salaireNet = remuneration - chargesSalariales;
        
        // Impôt sur le revenu
        const impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
        const is = Math.round(resultatApresRemuneration * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        const dividendesBruts = resultatApresIS;
        const dividendesPresident = Math.round(dividendesBruts * partPresident);
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendesPresident * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesPresident - prelevementForfaitaire;
        
        // Revenu net total (salaire net + dividendes nets)
        const revenuNetTotal = salaireNetApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SELAS',
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
            dividendesBruts: dividendesBruts,
            dividendesPresident: dividendesPresident,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }

    // SCA (nouveau)
    static simulerSCA(params) {
        const { 
            ca, 
            tauxMarge = 0.3, 
            tauxRemuneration = 0.7, 
            tmiActuel = 30,
            partCommandite = 0.3, // Par défaut, commandité détient 30% des parts
            capitalInvesti = 37000 // Capital minimum d'une SCA = celui d'une SA
        } = params;
        
        // Vérifier si le capital minimum requis est respecté
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SCA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // La SCA combine des éléments de SNC (pour les commandités) et de SA (pour les commanditaires)
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du gérant commandité
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Régime TNS pour le commandité (similaire à SNC)
        const tauxCotisationsTNS = 0.45;
        const cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
        const remunerationNette = remuneration - cotisationsSociales;
        
        // Impôt sur le revenu
        const impotRevenu = Math.round(remunerationNette * (tmiActuel / 100));
        
        // Rémunération nette après IR
        const remunerationNetteApresIR = remunerationNette - impotRevenu;
        
        // Calcul de l'IS
        const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
        const is = Math.round(resultatApresRemuneration * tauxIS);
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes (70% du résultat après IS)
        const tauxDistribution = 0.7;
        const dividendesBruts = Math.round(resultatApresIS * tauxDistribution);
        const dividendesCommandite = Math.round(dividendesBruts * partCommandite);
        
        // Calcul du PFU sur les dividendes (30%)
        const tauxPFU = 0.30;
        const prelevementForfaitaire = Math.round(dividendesCommandite * tauxPFU);
        
        // Dividendes nets après PFU
        const dividendesNets = dividendesCommandite - prelevementForfaitaire;
        
        // Revenu net total (rémunération nette + dividendes nets)
        const revenuNetTotal = remunerationNetteApresIR + dividendesNets;
        
        return {
            compatible: true,
            ca: ca,
            typeEntreprise: 'SCA',
            tauxMarge: tauxMarge * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            cotisationsSociales: cotisationsSociales,
            remunerationNette: remunerationNette,
            impotRevenu: impotRevenu,
            remunerationNetteApresIR: remunerationNetteApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendesBruts: dividendesBruts,
            dividendesCommandite: dividendesCommandite,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100
        };
    }
}

// Exposer la classe au niveau global
window.SimulationsFiscales = SimulationsFiscales;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module SimulationsFiscales chargé et disponible globalement");
    // Déclencher un événement pour signaler que les simulations fiscales sont prêtes
    document.dispatchEvent(new CustomEvent('simulationsFiscalesReady'));
});
