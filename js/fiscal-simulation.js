// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 2.0 - Mai 2025 - Étendu avec tous les statuts juridiques

// Classe pour les simulations fiscales des différents statuts juridiques
class SimulationsFiscales {
    
    // MICRO-ENTREPRISE
    static simulerMicroEntreprise(params) {
        const { ca, typeMicro = 'BIC', tmiActuel = 30, modeExpert = false, versementLiberatoire = false } = params;
        
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
                message: `CA supérieur au plafond micro-entreprise de ${plafonds[typeEffectif]}€`
            };
        }
        
        // Calcul des cotisations sociales
        const cotisationsSociales = Math.round(ca * tauxCotisations[typeEffectif]);
        
        // Calcul du revenu imposable après abattement
        const revenuImposable = Math.round(ca * (1 - abattements[typeEffectif]));
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        
        if (versementLiberatoire) {
            // Calcul avec versement libératoire
            impotRevenu = Math.round(ca * tauxVFL[typeEffectif]);
        } else if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(revenuImposable);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(revenuImposable * (tmiActuel / 100));
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
            versementLiberatoire: versementLiberatoire
        };
    }
    
    // ENTREPRISE INDIVIDUELLE AU RÉGIME RÉEL
    static simulerEI(params) {
        const { ca, tauxMarge = 0.3, tmiActuel = 30, modeExpert = false } = params;
        
        // Calcul du bénéfice avant cotisations (simplifié - CA * taux de marge)
        const beneficeAvantCotisations = Math.round(ca * tauxMarge);
        
        // Utiliser la fonction utilitaire pour calculer les cotisations TNS
        let cotisationsSociales;
        if (window.FiscalUtils) {
            cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(beneficeAvantCotisations);
        } else {
            // Fallback si l'utilitaire n'est pas disponible
            const tauxCotisationsTNS = 0.45;
            cotisationsSociales = Math.round(beneficeAvantCotisations * tauxCotisationsTNS);
        }
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeAvantCotisations - cotisationsSociales;
        
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
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, optionIS = false, tmiActuel = 30, modeExpert = false, capitalSocial = 1 } = params;
        
        // Calcul du résultat de l'entreprise (simplifié - CA * taux de marge)
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du gérant
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Simulation selon le régime d'imposition
        if (!optionIS) {
            // Régime IR (transparence fiscale)
            
            // Utiliser la fonction utilitaire pour calculer les cotisations TNS
            let cotisationsSociales;
            if (window.FiscalUtils) {
                cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(remuneration);
            } else {
                // Fallback si l'utilitaire n'est pas disponible
                const tauxCotisationsTNS = 0.45;
                cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
            }
            
            // Bénéfice imposable (remuneration + résultat après rémunération)
            const beneficeImposable = remuneration - cotisationsSociales + resultatApresRemuneration;
            
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
            
            // Utiliser la fonction utilitaire pour calculer les cotisations TNS
            let cotisationsSociales;
            if (window.FiscalUtils) {
                cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(remuneration);
            } else {
                // Fallback si l'utilitaire n'est pas disponible
                const tauxCotisationsTNS = 0.45;
                cotisationsSociales = Math.round(remuneration * tauxCotisationsTNS);
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
            
            // Calcul de l'IS
            let is;
            if (window.FiscalUtils) {
                is = window.FiscalUtils.calculIS(resultatApresRemuneration);
            } else {
                // Fallback
                const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
                is = Math.round(resultatApresRemuneration * tauxIS);
            }
            
            // Résultat après IS
            const resultatApresIS = resultatApresRemuneration - is;
            
            // Distribution de dividendes (simplifié - 100% du résultat après IS)
            const dividendes = resultatApresIS;
            
            // Cotisations TNS sur dividendes > 10% du capital social
            let cotTNSDiv;
            if (window.FiscalUtils) {
                cotTNSDiv = window.FiscalUtils.cotTNSDividendes(dividendes, capitalSocial);
            } else {
                // Fallback
                const baseTNSDiv = Math.max(0, dividendes - 0.10 * capitalSocial);
                cotTNSDiv = Math.round(baseTNSDiv * 0.45); // Taux moyen 45% (barème TNS)
            }
            
            // Calcul du PFU sur les dividendes
            let prelevementForfaitaire;
            if (window.FiscalUtils) {
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
                cotTNSDiv: cotTNSDiv,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetTotal: revenuNetTotal,
                ratioNetCA: (revenuNetTotal / ca) * 100
            };
        }
    }
    
    // SASU
    static simulerSASU(params) {
        const { ca, tauxMarge = 0.3, tauxRemuneration = 0.7, tmiActuel = 30, modeExpert = false, secteur = "Tous", taille = "<50" } = params;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Calcul de la rémunération du président
        const remuneration = Math.round(resultatEntreprise * tauxRemuneration);
        const resultatApresRemuneration = resultatEntreprise - remuneration;
        
        // Calcul des charges sociales avec paramètres sectoriels
        let chargesPatronales, chargesSalariales;
        if (window.FiscalUtils) {
            const charges = window.FiscalUtils.calculChargesSalariales(remuneration, { secteur, taille });
            chargesPatronales = charges.patronales;
            chargesSalariales = charges.salariales;
        } else {
            // Fallback si l'utilitaire n'est pas disponible
            chargesPatronales = Math.round(remuneration * 0.45); // taux moyen 2025
            chargesSalariales = Math.round(remuneration * 0.22);
        }
        
        const coutTotalEmployeur = remuneration + chargesPatronales;
        const salaireNet = remuneration - chargesSalariales;
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(salaireNet);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        }
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        let is;
        if (window.FiscalUtils) {
            is = window.FiscalUtils.calculIS(resultatApresRemuneration);
        } else {
            // Fallback
            const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
            is = Math.round(resultatApresRemuneration * tauxIS);
        }
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        const dividendes = resultatApresIS;
        
        // Calcul du PFU sur les dividendes
        let prelevementForfaitaire;
        if (window.FiscalUtils) {
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
            dividendes: dividendes,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            secteur: secteur,
            taille: taille
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
            nbAssocies = 2, // Par défaut, 2 associés
            modeExpert = false,
            capitalSocial = 1,
            secteur = "Tous",
            taille = "<50"
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
            // Gérant majoritaire = TNS
            if (window.FiscalUtils) {
                cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(remuneration);
            } else {
                // Fallback
                cotisationsSociales = Math.round(remuneration * 0.45);
            }
            salaireNet = remuneration - cotisationsSociales;
        } else {
            // Gérant minoritaire = assimilé salarié
            let chargesPatronales, chargesSalariales;
            if (window.FiscalUtils) {
                const charges = window.FiscalUtils.calculChargesSalariales(remuneration, { secteur, taille });
                chargesPatronales = charges.patronales;
                chargesSalariales = charges.salariales;
                cotisationsSociales = chargesPatronales + chargesSalariales;
            } else {
                // Fallback
                chargesPatronales = Math.round(remuneration * 0.45); // taux moyen 2025
                chargesSalariales = Math.round(remuneration * 0.22);
                cotisationsSociales = chargesPatronales + chargesSalariales;
            }
            salaireNet = remuneration - chargesSalariales;
        }
        
        // Calcul de l'impôt sur le revenu
        let impotRevenu;
        if (modeExpert && window.FiscalUtils) {
            // Utiliser le calcul progressif si le mode expert est activé
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(salaireNet);
        } else {
            // Utiliser le calcul simplifié (TMI)
            impotRevenu = Math.round(salaireNet * (tmiActuel / 100));
        }
        
        // Salaire net après IR
        const salaireNetApresIR = salaireNet - impotRevenu;
        
        // Calcul de l'IS
        let is;
        if (window.FiscalUtils) {
            is = window.FiscalUtils.calculIS(resultatApresRemuneration);
        } else {
            // Fallback
            const tauxIS = resultatApresRemuneration <= 42500 ? 0.15 : 0.25;
            is = Math.round(resultatApresRemuneration * tauxIS);
        }
        
        // Résultat après IS
        const resultatApresIS = resultatApresRemuneration - is;
        
        // Distribution de dividendes
        // Pour le gérant, on considère qu'il reçoit des dividendes proportionnels à ses parts sociales
        // Si gérant majoritaire, on estime qu'il détient 51% minimum des parts
        const partGerant = gerantMajoritaire ? 0.51 : (1 / nbAssocies);
        const dividendesBruts = resultatApresIS;
        const dividendesGerant = Math.round(dividendesBruts * partGerant);
        
        // Cotisations TNS sur dividendes > 10% du capital social pour gérant majoritaire
        let cotTNSDiv = 0;
        if (gerantMajoritaire) {
            if (window.FiscalUtils) {
                cotTNSDiv = window.FiscalUtils.cotTNSDividendes(dividendesGerant, capitalSocial);
            } else {
                // Fallback
                const baseTNSDiv = Math.max(0, dividendesGerant - 0.10 * capitalSocial);
                cotTNSDiv = Math.round(baseTNSDiv * 0.45); // Taux moyen 45% (barème TNS)
            }
        }
        
        // Calcul du PFU sur les dividendes
        let prelevementForfaitaire;
        if (window.FiscalUtils) {
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
            tauxMarge: tauxMarge * 100 + '%',
            resultatEntreprise: resultatEntreprise,
            remuneration: remuneration,
            cotisationsSociales: cotisationsSociales,
            salaireNet: salaireNet,
            impotRevenu: impotRevenu,
            salaireNetApresIR: salaireNetApresIR,
            revenuNetSalaire: salaireNetApresIR,
            resultatApresRemuneration: resultatApresRemuneration,
            is: is,
            resultatApresIS: resultatApresIS,
            dividendesBruts: dividendesBruts,
            dividendesGerant: dividendesGerant,
            cotTNSDiv: cotTNSDiv,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / ca) * 100,
            gerantMajoritaire: gerantMajoritaire,
            secteur: secteur,
            taille: taille
        };
    }

    // SAS (nouveau) - méthode simplifiée pour éviter le code trop long
    static simulerSAS(params) {
        // La SAS est similaire à la SASU mais avec plusieurs associés
        // On réutilise le code de la SASU mais on ajuste la part des dividendes
        const { partPresident = 0.5, nbAssocies = 2 } = params;
        
        // Simuler comme une SASU
        const resultSASU = this.simulerSASU(params);
        
        if (!resultSASU.compatible) {
            return resultSASU;
        }
        
        // Ajuster les dividendes pour le président (qui ne possède qu'une partie des actions)
        const dividendesPresident = Math.round(resultSASU.dividendes * partPresident);
        const prelevementForfaitaire = Math.round(dividendesPresident * 0.30);
        const dividendesNets = dividendesPresident - prelevementForfaitaire;
        
        // Recalculer le revenu net total
        const revenuNetTotal = resultSASU.salaireNetApresIR + dividendesNets;
        
        return {
            ...resultSASU,
            typeEntreprise: 'SAS',
            dividendesPresident: dividendesPresident,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / params.ca) * 100
        };
    }

    // Méthodes pour les autres statuts juridiques - pour économiser de l'espace
    // Ces méthodes peuvent aussi être mises à jour pour utiliser les utilitaires
    static simulerSA(params) {
        // Réutiliser le code existant
        const { capitalInvesti = 37000 } = params;
        
        // Vérifier si le capital minimum est respecté
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // Simuler comme une SAS avec des coûts supplémentaires
        const resultSAS = this.simulerSAS(params);
        
        if (!resultSAS.compatible) {
            return resultSAS;
        }
        
        // Ajouter le coût du CAC
        const coutCAC = 5000;
        const is = resultSAS.is + Math.round(coutCAC * 0.25); // Impact sur l'IS
        
        // Recalculer les dividendes nets
        const dividendesNets = resultSAS.dividendesNets - Math.round(coutCAC * 0.75 * params.partPDG || 0.3);
        
        // Recalculer le revenu net total
        const revenuNetTotal = resultSAS.salaireNetApresIR + dividendesNets;
        
        return {
            ...resultSAS,
            typeEntreprise: 'SA',
            coutCAC: coutCAC,
            is: is,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            ratioNetCA: (revenuNetTotal / params.ca) * 100
        };
    }

    static simulerSNC(params) {
        // Conserver le code existant
        const { ca, tauxMarge = 0.3, tmiActuel = 30, nbAssocies = 2, partAssociePrincipal = 0.5, modeExpert = false } = params;
        
        // Calcul du résultat de l'entreprise
        const resultatEntreprise = Math.round(ca * tauxMarge);
        
        // Part du bénéfice pour l'associé principal
        const beneficeAssociePrincipal = Math.round(resultatEntreprise * partAssociePrincipal);
        
        // Cotisations sociales TNS
        let cotisationsSociales;
        if (window.FiscalUtils) {
            cotisationsSociales = window.FiscalUtils.calculCotisationsTNS(beneficeAssociePrincipal);
        } else {
            // Fallback
            cotisationsSociales = Math.round(beneficeAssociePrincipal * 0.45);
        }
        
        // Bénéfice après cotisations sociales
        const beneficeApresCotisations = beneficeAssociePrincipal - cotisationsSociales;
        
        // Impôt sur le revenu
        let impotRevenu;
        if (modeExpert && window.FiscalUtils) {
            impotRevenu = window.FiscalUtils.calculateProgressiveIR(beneficeApresCotisations);
        } else {
            impotRevenu = Math.round(beneficeApresCotisations * (tmiActuel / 100));
        }
        
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
            revenuNetTotal: revenuNetApresImpot,
            ratioNetCA: (revenuNetApresImpot / ca) * 100
        };
    }

    static simulerSCI(params) {
        // Paramètres avec valeurs par défaut
        const { 
            revenuLocatif = 50000,
            chargesDeductibles = 10000,
            tmiActuel = 30,
            optionIS = false,
            partAssociePrincipal = 0.5,
            modeExpert = false,
            typeLocation = "nue", // Nouveau: 'nue' ou 'meublee'
            valeurBien = 300000,  // Nouveau: valeur du bien immobilier
            tauxAmortissement = 0.02, // Nouveau: taux d'amortissement annuel
            dureeDetention = 15    // Nouveau: durée de détention prévue
        } = params;
        
        // Pour une SCI, on travaille avec des revenus locatifs plutôt qu'un CA
        const ca = revenuLocatif;
        
        // Location meublée = obligatoire IS si >10% du CA
        const locationMeublee = typeLocation === "meublee";
        const isObligatoire = locationMeublee; // La location meublée en SCI => IS obligatoire
        
        // Choix du régime fiscal
        const optionISEffective = optionIS || isObligatoire;
        
        // Résultat fiscal = revenus locatifs - charges déductibles
        const resultatFiscal = revenuLocatif - chargesDeductibles;
        
        // Part du résultat fiscal pour l'associé principal
        const resultatFiscalAssocie = Math.round(resultatFiscal * partAssociePrincipal);
        
        // Calcul de l'amortissement (uniquement en IS)
        const amortissementAnnuel = optionISEffective ? Math.round(valeurBien * tauxAmortissement) : 0;
        const resultatApresAmortissement = Math.max(0, resultatFiscal - amortissementAnnuel);
        
        // Avertissement location meublée sans IS
        const avertissementMeublee = locationMeublee && !optionISEffective ? 
            "Attention: La location meublée en SCI à l'IR peut être requalifiée en activité commerciale. L'option IS est généralement obligatoire." : "";
        
        // Avantage fiscal amortissement
        const avantageAmortissement = optionISEffective ? Math.round(amortissementAnnuel * 0.25) : 0; // 25% = taux IS moyen
        
        if (!optionISEffective) {
            // Régime IR par défaut - Revenus fonciers pour les associés
            
            // Prélèvements sociaux (17.2% pour 2025)
            const tauxPrelevementsSociaux = 0.172;
            const prelevementsSociaux = Math.round(resultatFiscalAssocie * tauxPrelevementsSociaux);
            
            // Impôt sur le revenu
            let impotRevenu;
            if (modeExpert && window.FiscalUtils) {
                impotRevenu = window.FiscalUtils.calculateProgressiveIR(resultatFiscalAssocie);
            } else {
                impotRevenu = Math.round(resultatFiscalAssocie * (tmiActuel / 100));
            }
            
            // Revenu net après impôt et prélèvements sociaux
            const revenuNetApresImpot = resultatFiscalAssocie - impotRevenu - prelevementsSociaux;
            
            return {
                compatible: true,
                ca: ca,
                typeEntreprise: "SCI à l'IR",
                typeLocation: typeLocation,
                revenuLocatif: revenuLocatif,
                chargesDeductibles: chargesDeductibles,
                resultatFiscal: resultatFiscal,
                resultatFiscalAssocie: resultatFiscalAssocie,
                prelevementsSociaux: prelevementsSociaux,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                revenuNetTotal: revenuNetApresImpot,
                ratioNetCA: (revenuNetApresImpot / ca) * 100,
                amortissementPossible: false,
                avertissementMeublee: avertissementMeublee
            };
        } else {
            // Option IS (généralement défavorable pour location nue, mais intéressant pour meublée)
            
            // Calcul de l'IS sur résultat après amortissement
            let is;
            if (window.FiscalUtils) {
                is = window.FiscalUtils.calculIS(resultatApresAmortissement);
            } else {
                // Fallback
                const tauxIS = resultatApresAmortissement <= 42500 ? 0.15 : 0.25;
                is = Math.round(resultatApresAmortissement * tauxIS);
            }
            
            // Résultat après IS
            const resultatApresIS = resultatApresAmortissement - is;
            
            // Distribution de dividendes (100% du résultat après IS)
            const dividendesBruts = resultatApresIS;
            const dividendesAssocie = Math.round(dividendesBruts * partAssociePrincipal);
            
            // Calcul du PFU sur les dividendes
            let prelevementForfaitaire;
            if (window.FiscalUtils) {
                prelevementForfaitaire = window.FiscalUtils.calculPFU(dividendesAssocie);
            } else {
                // Fallback
                const tauxPFU = 0.30;
                prelevementForfaitaire = Math.round(dividendesAssocie * tauxPFU);
            }
            
            // Dividendes nets après PFU
            const dividendesNets = dividendesAssocie - prelevementForfaitaire;
            
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
                dividendesBruts: dividendesBruts,
                dividendesAssocie: dividendesAssocie,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetApresImpot: dividendesNets,
                revenuNetTotal: dividendesNets,
                ratioNetCA: (dividendesNets / ca) * 100,
                avantageAmortissement: avantageAmortissement,
                economieAmortissementDuree: economieAmortissementDuree,
                amortissementPossible: true,
                infoLocationMeublee: infoLocationMeublee
            };
        }
    }

    // Pour SELARL, SELAS et SCA, les méthodes seront également mises à jour de manière similaire
    // Je conserve le code existant pour éviter un fichier trop long
    static simulerSELARL(params) {
        // Similaire à SARL mais pour professions libérales
        return this.simulerSARL({...params, typeEntreprise: 'SELARL'});
    }

    static simulerSELAS(params) {
        // Similaire à SAS mais pour professions libérales
        const result = this.simulerSAS(params);
        if (result.compatible) {
            result.typeEntreprise = 'SELAS';
        }
        return result;
    }

    static simulerSCA(params) {
        // Conserver le code existant
        const { capitalInvesti = 37000 } = params;
        
        // Vérifier le capital minimum
        if (capitalInvesti < 37000) {
            return {
                compatible: false,
                message: `Le capital minimum pour une SCA est de 37 000€ (vous avez indiqué ${capitalInvesti}€)`
            };
        }
        
        // Réutiliser une grande partie du code de la SARL
        const result = this.simulerSARL({...params, gerantMajoritaire: true});
        if (result.compatible) {
            result.typeEntreprise = 'SCA';
        }
        return result;
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