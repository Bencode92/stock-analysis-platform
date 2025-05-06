// fiscal-simulation.js - Moteur de calcul fiscal pour le simulateur
// Version 1.0 - Mai 2025

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
}

// Exposer la classe au niveau global
window.SimulationsFiscales = SimulationsFiscales;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    console.log("Module SimulationsFiscales chargé et disponible globalement");
    // Déclencher un événement pour signaler que les simulations fiscales sont prêtes
    document.dispatchEvent(new CustomEvent('simulationsFiscalesReady'));
});