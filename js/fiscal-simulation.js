/**
 * fiscal-simulation.js
 * Module dédié aux barèmes fiscaux et aux calculs de simulation pour le simulateur de forme juridique
 * Ce fichier contient la logique de calcul fiscal et d'évaluation des incompatibilités
 * Dernière mise à jour : Avril 2025
 */

// Barèmes fiscaux par année - facilement modifiables pour suivre l'évolution législative
const baremesFiscaux = {
    "2025": {
        "IR": {
            "tranches": [
                { "jusqu_a": 10777, "taux": 0 },
                { "jusqu_a": 27478, "taux": 0.11 },
                { "jusqu_a": 78570, "taux": 0.30 },
                { "jusqu_a": 168994, "taux": 0.41 },
                { "jusqu_a": Infinity, "taux": 0.45 }
            ]
        },
        "IS": {
            "taux_reduit": { "jusqu_a": 42500, "taux": 0.15 },
            "taux_normal": 0.25
        },
        "cotisations": {
            "TNS": { 
                "taux_moyen": 0.45,
                "retraite": 0.17,
                "maladie": 0.13,
                "allocations_familiales": 0.03,
                "csg_crds": 0.09,
                "formation": 0.01,
                "autres": 0.02
            },
            "assimile_salarie": { 
                "part_salariale": 0.22,
                "part_patronale": 0.42,
                "total": 0.64
            }
        },
        "micro_entreprise": {
            "abattements": {
                "commercial": 0.71,
                "service": 0.50,
                "liberal": 0.34
            },
            "charges_sociales": {
                "commercial": 0.12,
                "service": 0.22,
                "liberal": 0.22
            },
            "plafonds": {
                "commercial": 188700,
                "service": 77700,
                "liberal": 77700
            }
        },
        "dividendes": {
            "pfu": 0.30,
            "abattement_40": true  // Abattement de 40% si option IR au lieu du PFU
        },
        "acre": {
            "reduction": 0.5,  // Réduction de 50% sur les charges sociales la première année
            "duree_mois": 12   // Durée de l'exonération en mois
        }
    }
};

/**
 * Objet principal pour les simulations fiscales
 * Contient toutes les méthodes pour calculer l'impôt et les charges sociales
 */
const SimulationsFiscales = {
    /**
     * Obtient le barème fiscal pour une année donnée
     * @param {string} annee - L'année du barème à récupérer (défaut 2025)
     * @return {Object} Le barème fiscal pour l'année spécifiée
     */
    getBaremeFiscal: function(annee = "2025") {
        return baremesFiscaux[annee] || baremesFiscaux["2025"];
    },
    
    /**
     * Calcule l'impôt sur le revenu selon les tranches progressives
     * @param {number} revenuImposable - Le revenu imposable en euros
     * @param {string} formeSociale - La forme sociale pour appliquer les abattements spécifiques
     * @return {number} Montant de l'impôt sur le revenu
     */
    calculerIR: function(revenuImposable, formeSociale) {
        // Logique pour les abattements spécifiques
        let abattement = 0;
        
        if (formeSociale === 'micro-entreprise') {
            // Abattement forfaitaire selon nature d'activité (on prend 34% par défaut)
            abattement = 0.34;
        }
        
        const revenuImposableApresAbattement = revenuImposable * (1 - abattement);
        
        // Récupérer le barème IR actuel
        const bareme = this.getBaremeFiscal().IR;
        
        // Calcul par tranches
        let impot = 0;
        let revenuRestant = revenuImposableApresAbattement;
        let tranchePrecedente = 0;
        
        for (const tranche of bareme.tranches) {
            const montantDansLaTranche = Math.min(revenuRestant, tranche.jusqu_a - tranchePrecedente);
            
            if (montantDansLaTranche > 0) {
                impot += montantDansLaTranche * tranche.taux;
                revenuRestant -= montantDansLaTranche;
                tranchePrecedente = tranche.jusqu_a;
            }
            
            if (revenuRestant <= 0) break;
        }
        
        return impot;
    },
    
    /**
     * Calcule l'impact sur le TMI de l'utilisateur
     * @param {number} revenuActuel - Revenu imposable actuel de l'utilisateur
     * @param {number} revenuAdditionnel - Revenu additionnel à considérer
     * @param {number} tmiActuel - TMI actuel en pourcentage
     * @return {Object} Résultat avec impact IR et taux effectif
     */
    calculerImpactTMI: function(revenuActuel, revenuAdditionnel, tmiActuel) {
        // Calcul simplifié basé sur le TMI déclaré
        const impactIR = revenuAdditionnel * (tmiActuel / 100);
        
        // Calcul plus précis en utilisant les tranches
        const impotSansRevenuAdd = this.calculerIR(revenuActuel, 'standard');
        const impotAvecRevenuAdd = this.calculerIR(revenuActuel + revenuAdditionnel, 'standard');
        const impactReel = impotAvecRevenuAdd - impotSansRevenuAdd;
        
        // Taux effectif réel
        const tauxEffectifReel = (impactReel / revenuAdditionnel) * 100;
        
        return {
            impactIR: impactIR,
            impactReel: impactReel,
            tauxEffectif: tmiActuel,
            tauxEffectifReel: Math.round(tauxEffectifReel * 100) / 100
        };
    },
    
    /**
     * Calcule l'impôt sur les sociétés
     * @param {number} benefice - Le bénéfice imposable en euros
     * @return {number} Montant de l'impôt sur les sociétés
     */
    calculerIS: function(benefice) {
        const bareme = this.getBaremeFiscal().IS;
        
        if (benefice <= bareme.taux_reduit.jusqu_a) {
            return benefice * bareme.taux_reduit.taux;
        } else {
            return (bareme.taux_reduit.jusqu_a * bareme.taux_reduit.taux) + 
                   ((benefice - bareme.taux_reduit.jusqu_a) * bareme.taux_normal);
        }
    },
    
    /**
     * Obtient l'abattement forfaitaire micro-entreprise selon l'activité
     * @param {string} typeActivite - Le type d'activité (bic-vente, bic-service, bnc)
     * @return {number} Taux d'abattement forfaitaire
     */
    getAbattementMicro: function(typeActivite) {
        const abattements = this.getBaremeFiscal().micro_entreprise.abattements;
        
        if (typeActivite === 'bic-vente') {
            return abattements.commercial;
        } else if (typeActivite === 'bic-service') {
            return abattements.service;
        } else if (typeActivite === 'bnc') {
            return abattements.liberal;
        }
        
        // Par défaut, abattement le plus faible (libéral)
        return abattements.liberal;
    },
    
    /**
     * Obtient le plafond micro-entreprise selon l'activité
     * @param {string} typeActivite - Le type d'activité (bic-vente, bic-service, bnc)
     * @return {number} Plafond en euros
     */
    getPlafondMicro: function(typeActivite) {
        const plafonds = this.getBaremeFiscal().micro_entreprise.plafonds;
        
        if (typeActivite === 'bic-vente') {
            return plafonds.commercial;
        } else if (typeActivite === 'bic-service') {
            return plafonds.service;
        } else if (typeActivite === 'bnc') {
            return plafonds.liberal;
        }
        
        // Par défaut, plafond le plus restrictif
        return plafonds.service;
    },
    
    /**
     * Calcule les charges sociales selon le régime social, avec prise en compte ACRE
     * @param {number} revenu - Le revenu en euros
     * @param {string} regimeSocial - Le régime social (TNS ou Assimilé salarié)
     * @param {boolean} aAcre - Si le bénéfice de l'ACRE est applicable
     * @return {number} Montant des charges sociales
     */
    calculerChargesSociales: function(revenu, regimeSocial, aAcre = false) {
        const bareme = this.getBaremeFiscal().cotisations;
        const reductionAcre = aAcre ? (1 - this.getBaremeFiscal().acre.reduction) : 1.0;
        
        if (regimeSocial === 'TNS' || regimeSocial.includes('TNS')) {
            // Taux moyen charges TNS avec réduction ACRE si applicable
            return revenu * bareme.TNS.taux_moyen * reductionAcre;
        } else if (regimeSocial === 'Assimilé salarié' || regimeSocial.includes('salarié')) {
            // Part salariale + patronale avec réduction ACRE si applicable
            return revenu * bareme.assimile_salarie.total * reductionAcre;
        }
        
        // Taux par défaut
        return revenu * 0.65 * reductionAcre;
    },
    
    /**
     * Calcule l'impôt sur les dividendes
     * @param {number} dividendes - Le montant des dividendes en euros
     * @param {boolean} optionIR - Si vrai, utilise l'option IR sinon PFU
     * @param {number} tmiUtilisateur - TMI de l'utilisateur pour calcul option IR
     * @return {number} Montant de l'impôt sur les dividendes
     */
    calculerImpotDividendes: function(dividendes, optionIR = false, tmiUtilisateur = 30) {
        const bareme = this.getBaremeFiscal().dividendes;
        
        if (optionIR) {
            // Option IR avec abattement de 40%
            const montantImposable = dividendes * (1 - 0.4);
            // Utiliser directement le TMI pour une estimation plus précise
            if (tmiUtilisateur) {
                return montantImposable * (tmiUtilisateur / 100);
            }
            return this.calculerIR(montantImposable, 'standard');
        } else {
            // Prélèvement Forfaitaire Unique (flat tax)
            return dividendes * bareme.pfu;
        }
    },
    
    /**
     * Réalise une simulation fiscale complète pour une forme juridique
     * @param {Object} forme - L'objet représentant la forme juridique
     * @param {number} revenuAnnuel - Le revenu annuel en euros
     * @param {Object} params - Paramètres de simulation (répartition, etc.)
     * @return {Object} Résultat détaillé de la simulation
     */
    simulerImpactFiscal: function(forme, revenuAnnuel, params = {}) {
        // Paramètres de simulation avec valeurs par défaut
        const parametres = {
            ratioSalaire: params.ratioSalaire || 50,
            ratioDividendes: params.ratioDividendes || 50,
            fraisReels: params.fraisReels || 0,
            tmi: params.tmi || 30,
            acrePremAnnee: params.acrePremAnnee || false,
            ...params
        };
        
        const regimeFiscal = forme.fiscalite.includes('IR') ? 'IR' : 'IS';
        let regimeSocial = forme.regimeSocial.includes('TNS') ? 'TNS' : 'Assimilé salarié';
        
        // Gérer les cas particuliers
        if (forme.regimeSocial.includes('TNS') && forme.regimeSocial.includes('salarié')) {
            regimeSocial = 'Mixte (TNS ou Assimilé selon statut)';
        }
        
        let simulation = {
            revenuAnnuel: revenuAnnuel,
            regimeFiscal: regimeFiscal,
            regimeSocial: regimeSocial
        };
        
        // Calcul différent selon le régime fiscal
        if (regimeFiscal === 'IR') {
            // Cas de l'IR (entreprise individuelle, EURL à l'IR, etc.)
            
            // Appliquer ACRE si applicable
            simulation.chargesSociales = this.calculerChargesSociales(revenuAnnuel, regimeSocial, parametres.acrePremAnnee);
            
            // Cas particulier micro-entreprise avec comparaison forfait vs réel
            if (forme.id === 'micro-entreprise' && parametres.fraisReels) {
                const typeActivite = params.natureActivite || 'bic-service';
                const abattementForfaitaire = this.getAbattementMicro(typeActivite);
                
                // Calcul avec le forfait
                const revenuImposableForfaitaire = revenuAnnuel * (1 - abattementForfaitaire);
                const impotForfaitaire = this.calculerIR(revenuImposableForfaitaire, 'standard');
                
                // Calcul avec frais réels (supposons que les charges sociales sont déjà déduites)
                const fraisReelsValeur = revenuAnnuel * (parametres.fraisReels / 100);
                const revenuImposableReel = revenuAnnuel - fraisReelsValeur;
                const impotReel = this.calculerIR(revenuImposableReel, 'standard');
                
                // On prend le plus avantageux
                if (impotReel < impotForfaitaire) {
                    simulation.impot = impotReel;
                    simulation.comparaisonRegimes = {
                        forfaitaire: impotForfaitaire,
                        reel: impotReel,
                        gain: impotForfaitaire - impotReel,
                        regime: 'réel'
                    };
                } else {
                    simulation.impot = impotForfaitaire;
                    simulation.comparaisonRegimes = {
                        forfaitaire: impotForfaitaire,
                        reel: impotReel,
                        gain: 0,
                        regime: 'forfaitaire'
                    };
                }
            } else {
                // Calcul standard pour les autres formes à l'IR
                simulation.impot = this.calculerIR(revenuAnnuel - simulation.chargesSociales, forme.id);
            }
            
            simulation.revenueNet = revenuAnnuel - simulation.impot - simulation.chargesSociales;
            
            // Ajouter l'impact du TMI personnel
            if (parametres.tmi) {
                simulation.impactTMI = this.calculerImpactTMI(0, revenuAnnuel - simulation.chargesSociales, parametres.tmi);
            }
            
            // Détails pour affichage
            simulation.detailsCalcul = {
                revenuImposable: revenuAnnuel - simulation.chargesSociales,
                tauxImpositionMoyen: Math.round((simulation.impot / revenuAnnuel) * 100),
                tauxPrelevementsSociaux: Math.round((simulation.chargesSociales / revenuAnnuel) * 100),
                ratioNetBrut: Math.round((simulation.revenueNet / revenuAnnuel) * 100),
                aAcre: parametres.acrePremAnnee
            };
        } else {
            // Cas de l'IS (SARL, SAS, SASU, etc.)
            
            // 1. Calcul du bénéfice (utiliser le taux de marge du paramètre ou 80% par défaut)
            const tauxMarge = params.tauxMarge ? (params.tauxMarge / 100) : 0.8;
            const benefice = revenuAnnuel * tauxMarge;
            
            // 2. Calcul de l'IS sur ce bénéfice
            simulation.impotSociete = this.calculerIS(benefice);
            
            // 3. Répartition salaire/dividendes selon paramètres
            const ratioSalaire = parametres.ratioSalaire / 100;
            const ratioDividendes = parametres.ratioDividendes / 100;
            
            const salaire = Math.min(benefice - simulation.impotSociete, revenuAnnuel * ratioSalaire);
            const dividendes = Math.max(0, (benefice - simulation.impotSociete - salaire) * ratioDividendes);
            
            // 4. Calcul des charges sur le salaire avec ACRE si applicable
            simulation.chargesSalariales = this.calculerChargesSociales(salaire, regimeSocial, parametres.acrePremAnnee);
            simulation.impotSalaire = this.calculerIR(salaire - simulation.chargesSalariales, 'salaire');
            
            // 5. Calcul de l'impôt sur les dividendes avec le TMI si fourni
            const optionIR = parametres.tmi && parametres.tmi < 25; // Option IR si TMI favorable
            simulation.impotDividendes = this.calculerImpotDividendes(dividendes, optionIR, parametres.tmi);
            
            // Impôt total
            simulation.impot = simulation.impotSalaire + simulation.impotDividendes + simulation.impotSociete;
            
            // Revenu net
            simulation.revenueNet = salaire - simulation.chargesSalariales - simulation.impotSalaire + dividendes - simulation.impotDividendes;
            
            // Ajouter l'impact du TMI personnel sur le salaire
            if (parametres.tmi) {
                simulation.impactTMISalaire = this.calculerImpactTMI(0, salaire - simulation.chargesSalariales, parametres.tmi);
            }
            
            // Détails pour affichage
            simulation.detailsCalcul = {
                benefice: benefice,
                salaire: salaire,
                dividendes: dividendes,
                is: simulation.impotSociete,
                impotSalaire: simulation.impotSalaire,
                impotDividendes: simulation.impotDividendes,
                tauxISEffectif: Math.round((simulation.impotSociete / benefice) * 100),
                tauxImpositionGlobal: Math.round((simulation.impot / revenuAnnuel) * 100),
                ratioNetBrut: Math.round((simulation.revenueNet / revenuAnnuel) * 100),
                optionIR: optionIR,
                aAcre: parametres.acrePremAnnee
            };
        }
        
        return simulation;
    },
    
    /**
     * Simulation pluriannuelle des résultats financiers
     * @param {Object} forme - Forme juridique à simuler
     * @param {Object} params - Paramètres de simulation
     * @param {number} annees - Nombre d'années à simuler
     * @returns {Object} Résultats de simulation sur plusieurs années
     */
    simulationPluriannuelle: function(forme, params, annees = 3) {
        const resultats = {
            annees: [],
            revenuNet: [],
            impots: [],
            chargesSociales: [],
            tauxPrelevement: []
        };
        
        let ca = params.caSimulation || 50000; // CA initial
        const croissanceAnnuelle = params.croissanceAnnuelle || 1.2; // +20% par an par défaut
        
        for (let annee = 1; annee <= annees; annee++) {
            resultats.annees.push(`Année ${annee}`);
            
            // L'ACRE ne s'applique que la première année
            const aAcreAnnee = annee === 1 && params.acrePremAnnee;
            
            // Simuler l'impact fiscal pour cette année
            const simulation = this.simulerImpactFiscal(forme, ca, {
                ...params,
                acrePremAnnee: aAcreAnnee
            });
            
            resultats.revenuNet.push(Math.round(simulation.revenueNet));
            resultats.impots.push(Math.round(simulation.impot));
            resultats.chargesSociales.push(Math.round(simulation.chargesSociales || simulation.chargesSalariales || 0));
            
            // Taux de prélèvement global
            const prelevementTotal = simulation.impot + (simulation.chargesSociales || simulation.chargesSalariales || 0);
            resultats.tauxPrelevement.push(Math.round((prelevementTotal / ca) * 100));
            
            // Croissance pour l'année suivante
            ca *= croissanceAnnuelle;
        }
        
        return resultats;
    }
};

/**
 * Vérifie les incompatibilités majeures qui empêcheraient certaines formes juridiques
 * @param {Object} userResponses - Les réponses de l'utilisateur au questionnaire
 * @return {Array} - Liste des incompatibilités détectées
 */
function checkHardFails(userResponses) {
    const fails = [];
    
    // Vérifications pour la micro-entreprise basées sur le CA numérique
    if (userResponses.chiffreAffaires) {
        let plafondApplicable = 77700; // Par défaut service/libéral
        if (userResponses.typeActivite === 'bic-vente') {
            plafondApplicable = 188700;
        }
        
        if (userResponses.chiffreAffaires > plafondApplicable) {
            fails.push({
                formeId: 'micro-entreprise',
                code: 'CA_TROP_ELEVE',
                message: `Le chiffre d'affaires prévu (${userResponses.chiffreAffaires.toLocaleString('fr-FR')}€) dépasse le plafond applicable`,
                details: `Le régime micro-entreprise est limité à ${plafondApplicable.toLocaleString('fr-FR')}€ pour votre activité.`
            });
        }
    }
    
    // Vérifications pour les activités réglementées
    if (userResponses.activiteReglementee) {
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'ACTIVITE_REGLEMENTEE',
                message: 'Cette forme juridique n\'est pas optimale pour une activité réglementée nécessitant des diplômes spécifiques.',
                details: 'Les activités réglementées nécessitent généralement une structure plus formelle et complète.'
            });
        });
    }
    
    // Incompatibilité spécifique avec ordre professionnel
    if (userResponses.ordresProfessionnels) {
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'ORDRE_PROFESSIONNEL',
                message: 'Cette structure est généralement incompatible avec les professions réglementées nécessitant une inscription à un ordre professionnel',
                details: 'Les professions avec ordre professionnel requièrent souvent des structures spécifiques comme SEL ou SCP.'
            });
        });
    }
    
    // Vérifications pour les projets avec investisseurs
    if (userResponses.profilEntrepreneur === 'investisseurs') {
        ['micro-entreprise', 'ei', 'eirl', 'eurl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'BESOIN_INVESTISSEURS',
                message: 'Cette forme juridique ne permet pas d\'accueillir des investisseurs externes.',
                details: 'Pour attirer des investisseurs, privilégiez des structures comme la SAS, SASU ou SA.'
            });
        });
    }
    
    // Vérifications pour la protection patrimoniale 
    if (userResponses.protectionPatrimoine) {
        ['snc', 'sci', 'scp', 'scm', 'sccv'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'PROTECTION_REQUISE',
                message: 'La responsabilité des associés n\'est pas suffisamment limitée.',
                details: 'Vous avez indiqué que la protection de votre patrimoine personnel est importante.'
            });
        });
    }
    
    // Vérification TMI élevé avec structure IR
    if (userResponses.tmiActuel && userResponses.tmiActuel >= 41) {
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'TMI_ELEVE',
                message: 'Votre TMI élevé rend cette structure fiscalement défavorable',
                details: `Avec un TMI de ${userResponses.tmiActuel}%, une structure à l'IS serait généralement plus avantageuse.`
            });
        });
    }
    
    // Vérifications pour les activités agricoles
    if (userResponses.typeActivite === 'agricole') {
        // Tous les statuts qui ne sont pas adaptés à l'agriculture
        ['micro-entreprise', 'sas', 'sa', 'selarl', 'selas'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'ACTIVITE_AGRICOLE',
                message: 'Cette forme juridique n\'est pas adaptée aux activités agricoles.',
                details: 'Pour une activité agricole, privilégiez une structure spécifique comme le GAEC ou l\'EARL.'
            });
        });
    }
    
    // Vérifications pour levée de fonds importantes
    if (userResponses.montantLevee && userResponses.montantLevee > 100000) {
        ['micro-entreprise', 'ei', 'eirl', 'eurl', 'sarl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'LEVEE_IMPORTANTE',
                message: `Levée de fonds de ${userResponses.montantLevee.toLocaleString('fr-FR')}€ incompatible avec cette structure`,
                details: 'Pour des montants significatifs, privilégiez une SAS avec sa flexibilité statutaire.'
            });
        });
    }
    
    // Vérifications pour besoin de revenus immédiats
    if (userResponses.besoinRevenusImmediats) {
        ['sasu', 'sas'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'BESOIN_REVENUS_IMMEDIATS',
                message: 'Cette structure nécessite une trésorerie initiale pour les charges sociales',
                details: 'Pour percevoir des revenus dès le début, une micro-entreprise peut être plus adaptée.'
            });
        });
    }
    
    return fails;
}

/**
 * Vérifie si une forme juridique spécifique a des incompatibilités majeures
 * @param {string} formeId - Identifiant de la forme juridique
 * @param {Array} hardFails - Liste des incompatibilités détectées
 * @return {boolean} - Vrai si la forme a une incompatibilité majeure
 */
function hasHardFail(formeId, hardFails) {
    return hardFails.some(fail => fail.formeId === formeId);
}

/**
 * Obtient des formes juridiques alternatives recommandées en cas d'incompatibilité
 * @param {string} formeId - Identifiant de la forme juridique incompatible
 * @param {string} raison - Code de la raison d'incompatibilité
 * @param {Array} formesJuridiques - Liste complète des formes juridiques disponibles
 * @return {Array} - Formes juridiques alternatives recommandées
 */
function getAlternativesRecommandees(formeId, raison, formesJuridiques) {
    let alternatives = [];
    
    switch(raison) {
        case 'ACTIVITE_REGLEMENTEE':
        case 'ORDRE_PROFESSIONNEL':
            alternatives = formesJuridiques.filter(f => 
                (f.categorie.includes('Libérale') && f.responsabilite.includes('Limitée')) ||
                ['eurl', 'sasu', 'selarl', 'selas'].includes(f.id)
            ).slice(0, 2);
            break;
            
        case 'CA_TROP_ELEVE':
            alternatives = formesJuridiques.filter(f => 
                f.id === 'eurl' || f.id === 'sasu'
            );
            break;
            
        case 'BESOIN_INVESTISSEURS':
        case 'LEVEE_IMPORTANTE':
            alternatives = formesJuridiques.filter(f => 
                f.leveeFonds === 'Oui'
            ).slice(0, 2);
            break;
            
        case 'PROTECTION_REQUISE':
            alternatives = formesJuridiques.filter(f => 
                f.protectionPatrimoine === 'Oui' && ['sarl', 'sas', 'sasu', 'eurl'].includes(f.id)
            ).slice(0, 2);
            break;
            
        case 'TMI_ELEVE':
            alternatives = formesJuridiques.filter(f => 
                f.fiscalite === 'IS' || f.fiscaliteOption === 'Oui'
            ).slice(0, 2);
            break;
            
        case 'BESOIN_REVENUS_IMMEDIATS':
            alternatives = formesJuridiques.filter(f => 
                f.id === 'micro-entreprise' || f.id === 'ei' || f.id === 'eurl'
            ).slice(0, 2);
            break;
            
        case 'ACTIVITE_AGRICOLE':
            alternatives = formesJuridiques.filter(f => 
                f.categorie.includes('Agricole')
            );
            break;
            
        default:
            // Par défaut, recommander des structures généralement souples
            alternatives = formesJuridiques.filter(f => 
                ['eurl', 'sasu', 'sarl'].includes(f.id)
            ).slice(0, 2);
    }
    
    return alternatives;
}

// Exporter les fonctions et objets pour utilisation dans types-entreprise.js
window.SimulationsFiscales = SimulationsFiscales;
window.checkHardFails = checkHardFails;
window.hasHardFail = hasHardFail;
window.getAlternativesRecommandees = getAlternativesRecommandees;