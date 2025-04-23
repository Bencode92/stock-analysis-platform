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
            "reduction": 0.50,  // Réduction de 50% sur les charges sociales la première année
            "duree_mois": 12    // Durée de l'exonération en mois
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
     * @param {number} tmiActuel - Taux marginal d'imposition actuel (optionnel)
     * @return {number} Montant de l'impôt sur le revenu
     */
    calculerIR: function(revenuImposable, formeSociale, tmiActuel = null) {
        // Si un TMI est fourni directement, on peut faire un calcul simplifié
        if (tmiActuel !== null && tmiActuel > 0) {
            return revenuImposable * (tmiActuel / 100);
        }
        
        // Logique pour les abattements spécifiques
        let abattement = 0;
        
        if (formeSociale === 'micro-entreprise') {
            // Abattement forfaitaire selon nature d'activité
            const typeActivite = formeSociale.typeActivite || 'liberal';
            abattement = this.getAbattementMicro(typeActivite);
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
     * Vérifie si un CA dépasse le plafond micro-entreprise pour un type d'activité donné
     * @param {number} ca - Chiffre d'affaires en euros
     * @param {string} typeActivite - Type d'activité
     * @return {boolean} Vrai si le CA dépasse le plafond
     */
    depassePlafondMicro: function(ca, typeActivite) {
        const plafonds = this.getBaremeFiscal().micro_entreprise.plafonds;
        let plafondApplicable = 0;
        
        if (typeActivite === 'bic-vente') {
            plafondApplicable = plafonds.commercial;
        } else if (typeActivite === 'bic-service') {
            plafondApplicable = plafonds.service;
        } else {
            plafondApplicable = plafonds.liberal;
        }
        
        return ca > plafondApplicable;
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
     * @param {number} tmiActuel - Taux marginal d'imposition si option IR
     * @return {number} Montant de l'impôt sur les dividendes
     */
    calculerImpotDividendes: function(dividendes, optionIR = false, tmiActuel = null) {
        const bareme = this.getBaremeFiscal().dividendes;
        
        if (optionIR) {
            // Option IR avec abattement de 40%
            const montantImposable = dividendes * (1 - 0.4);
            
            if (tmiActuel !== null) {
                // Utiliser le TMI fourni
                return montantImposable * (tmiActuel / 100);
            } else {
                // Calcul par tranches
                return this.calculerIR(montantImposable, 'standard');
            }
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
            tmi: params.tmi || null,
            fraisReels: params.fraisReels || null,
            acrePremAnnee: params.acrePremAnnee || false,
            tauxMarge: params.tauxMarge || 35,
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
            simulation.chargesSociales = this.calculerChargesSociales(revenuAnnuel, regimeSocial, parametres.acrePremAnnee);
            
            // Si forme est micro-entreprise et frais réels fournis, comparer les deux régimes
            if (forme.id === 'micro-entreprise' && parametres.fraisReels) {
                const typeActivite = params.typeActivite || 'liberal';
                const abattementForfaitaire = this.getAbattementMicro(typeActivite);
                const revenuImposableForfaitaire = revenuAnnuel * (1 - abattementForfaitaire);
                const revenuImposableReel = revenuAnnuel - parametres.fraisReels;
                
                // Déterminer le plus avantageux
                const impotForfaitaire = this.calculerIR(revenuImposableForfaitaire, 'standard', parametres.tmi);
                const impotReel = this.calculerIR(revenuImposableReel, 'standard', parametres.tmi);
                
                // Stocker les deux calculs pour comparaison
                simulation.comparaisonRegimes = {
                    forfaitaire: {
                        revenuImposable: revenuImposableForfaitaire,
                        impot: impotForfaitaire,
                        abattement: revenuAnnuel * abattementForfaitaire
                    },
                    reel: {
                        revenuImposable: revenuImposableReel,
                        impot: impotReel,
                        fraisDeductibles: parametres.fraisReels
                    },
                    difference: impotForfaitaire - impotReel,
                    regimeOptimal: impotReel < impotForfaitaire ? 'réel' : 'micro'
                };
                
                // Utiliser le régime optimal pour la simulation
                simulation.impot = simulation.comparaisonRegimes.regimeOptimal === 'réel' ? 
                    impotReel : impotForfaitaire;
            } else {
                // Calcul standard de l'IR
                simulation.impot = this.calculerIR(revenuAnnuel - simulation.chargesSociales, forme.id, parametres.tmi);
            }
            
            simulation.revenueNet = revenuAnnuel - simulation.impot - simulation.chargesSociales;
            
            // Détails pour affichage
            simulation.detailsCalcul = {
                revenuImposable: revenuAnnuel - simulation.chargesSociales,
                tauxImpositionMoyen: Math.round((simulation.impot / revenuAnnuel) * 100),
                tauxPrelevementsSociaux: Math.round((simulation.chargesSociales / revenuAnnuel) * 100),
                ratioNetBrut: Math.round((simulation.revenueNet / revenuAnnuel) * 100),
                acrePremAnnee: parametres.acrePremAnnee
            };
        } else {
            // Cas de l'IS (SARL, SAS, SASU, etc.)
            
            // 1. Calcul du bénéfice en fonction du taux de marge
            const benefice = revenuAnnuel * (parametres.tauxMarge / 100);
            
            // 2. Calcul de l'IS sur ce bénéfice
            simulation.impotSociete = this.calculerIS(benefice);
            
            // 3. Répartition salaire/dividendes selon paramètres
            const ratioSalaire = parametres.ratioSalaire / 100;
            const ratioDividendes = parametres.ratioDividendes / 100;
            
            const salaireMax = benefice - simulation.impotSociete;
            const salaire = Math.min(salaireMax, benefice * ratioSalaire);
            const dividendes = Math.max(0, (benefice - simulation.impotSociete - salaire) * ratioDividendes);
            
            // 4. Calcul des charges sur le salaire
            simulation.chargesSalariales = this.calculerChargesSociales(salaire, regimeSocial, parametres.acrePremAnnee);
            simulation.impotSalaire = this.calculerIR(salaire - simulation.chargesSalariales, 'salaire', parametres.tmi);
            
            // 5. Calcul de l'impôt sur les dividendes (PFU 30%)
            // En fonction du TMI, on choisit la meilleure option entre PFU et IR+abattement
            const optionIR = parametres.tmi ? parametres.tmi < 30 : false;
            simulation.impotDividendes = this.calculerImpotDividendes(dividendes, optionIR, parametres.tmi);
            
            // Impôt total
            simulation.impot = simulation.impotSalaire + simulation.impotDividendes + simulation.impotSociete;
            
            // Revenu net
            simulation.revenueNet = salaire - simulation.chargesSalariales - simulation.impotSalaire + dividendes - simulation.impotDividendes;
            
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
                optionDividendes: optionIR ? 'IR avec abattement 40%' : 'PFU 30%',
                acrePremAnnee: parametres.acrePremAnnee
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
            ca: []
        };
        
        let ca = params.caSimulation || 50000;
        const croissanceAnnuelle = 1.2; // +20% par an
        let tauxMarge = params.tauxMarge || 35;
        const ameliorationMarge = 1.05; // +5% par an sur la marge
        
        for (let annee = 1; annee <= annees; annee++) {
            resultats.annees.push(`Année ${annee}`);
            resultats.ca.push(ca);
            
            // Simulation avec ACRE uniquement la première année
            const aAcre = annee === 1 && params.acrePremAnnee;
            
            // Simuler l'impact fiscal pour cette année
            const simulation = this.simulerImpactFiscal(forme, ca, {
                ...params,
                acrePremAnnee: aAcre,
                tauxMarge: tauxMarge
            });
            
            resultats.revenuNet.push(simulation.revenueNet);
            resultats.impots.push(simulation.impot);
            resultats.chargesSociales.push(simulation.chargesSociales || simulation.chargesSalariales || 0);
            
            // Croissance pour l'année suivante
            ca *= croissanceAnnuelle;
            tauxMarge = Math.min(70, tauxMarge * ameliorationMarge); // Plafonné à 70%
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
    
    // Vérification du CA numérique pour la micro-entreprise
    if (userResponses.chiffreAffaires && typeof userResponses.chiffreAffaires === 'number') {
        const plafondBIC = 188700;
        const plafondServices = 77700;
        let plafondApplicable = 0;
        
        if (userResponses.typeActivite === 'bic-vente') {
            plafondApplicable = plafondBIC;
        } else {
            plafondApplicable = plafondServices; // Services ou liberal (BNC)
        }
        
        if (userResponses.chiffreAffaires > plafondApplicable) {
            fails.push({
                formeId: 'micro-entreprise',
                code: 'CA_TROP_ELEVE',
                message: `Le chiffre d'affaires prévu de ${userResponses.chiffreAffaires.toLocaleString('fr-FR')}€ dépasse le plafond de ${plafondApplicable.toLocaleString('fr-FR')}€ pour une micro-entreprise.`,
                details: `Le régime micro-entreprise est limité à ${plafondBIC.toLocaleString('fr-FR')}€ pour la vente et ${plafondServices.toLocaleString('fr-FR')}€ pour les services et professions libérales.`
            });
        }
    } else if (userResponses.chiffreAffaires === 'eleve') {
        // Compatibilité avec l'ancien format
        fails.push({
            formeId: 'micro-entreprise',
            code: 'CA_TROP_ELEVE',
            message: 'Le chiffre d\'affaires prévu dépasse les plafonds autorisés pour une micro-entreprise.',
            details: 'Le régime micro-entreprise est limité à 188 700€ pour la vente et 77 700€ pour les services et professions libérales.'
        });
    }
    
    // Vérifications pour les activités réglementées et ordres professionnels
    if (userResponses.activiteReglementee || userResponses.ordresProfessionnels) {
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'ACTIVITE_REGLEMENTEE',
                message: 'Cette forme juridique n\'est pas optimale pour une activité réglementée ou une profession avec ordre professionnel.',
                details: 'Ces activités nécessitent généralement une structure plus formelle et des garanties spécifiques.'
            });
        });
        
        // Cas particulier des professions avec ordre professionnel
        if (userResponses.ordresProfessionnels) {
            // Structures non adaptées aux ordres professionnels
            ['sas', 'sarl', 'sa'].forEach(forme => {
                fails.push({
                    formeId: forme,
                    code: 'ORDRE_PROFESSIONNEL',
                    message: 'Cette structure standard n\'est pas adaptée aux professions avec ordre professionnel.',
                    details: 'Les professions avec ordre professionnel requièrent souvent des structures spécifiques comme SEL ou SCP.'
                });
            });
        }
    }
    
    // Vérifications pour les projets avec investisseurs
    if (userResponses.profilEntrepreneur === 'investisseurs') {
        ['micro-entreprise', 'ei', 'eurl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'BESOIN_INVESTISSEURS',
                message: 'Cette forme juridique ne permet pas d\'accueillir des investisseurs externes.',
                details: 'Pour attirer des investisseurs, privilégiez des structures comme la SAS, SASU ou SA.'
            });
        });
        
        // Distinction selon le type d'investisseurs (nouvelle fonctionnalité)
        if (userResponses.typeInvestisseurs && userResponses.typeInvestisseurs.includes('vc')) {
            // Les VCs préfèrent les SAS
            ['sarl', 'sasu'].forEach(forme => {
                fails.push({
                    formeId: forme,
                    code: 'INVESTISSEURS_VC',
                    message: 'Cette structure n\'est généralement pas privilégiée par les fonds d\'investissement.',
                    details: 'Les capital-risqueurs (VCs) préfèrent généralement la forme SAS qui offre plus de flexibilité.'
                });
            });
        }
    }
    
    // Vérifications pour la protection patrimoniale
    if (userResponses.protectionPatrimoine) {
        // La protection est maintenant une valeur binaire
        ['snc', 'sci', 'scp', 'scm', 'sccv'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'PROTECTION_REQUISE',
                message: 'La responsabilité des associés n\'est pas suffisamment limitée.',
                details: 'Vous avez indiqué que la protection de votre patrimoine personnel est importante.'
            });
        });
        
        // Si l'utilisateur a déjà un bien immobilier, risque de saisie
        if (userResponses.bienImmobilier) {
            ['ei'].forEach(forme => {
                fails.push({
                    formeId: forme,
                    code: 'BIEN_IMMOBILIER',
                    message: 'Risque pour votre bien immobilier personnel.',
                    details: 'Vous possédez un bien immobilier. Cette structure pourrait l\'exposer en cas de difficultés.'
                });
            });
        }
    }
    
    // Vérifications pour le besoin de revenus immédiats
    if (userResponses.besoinRevenusImmediats) {
        ['sasu', 'sas', 'sarl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'REVENUS_IMMEDIATS',
                message: 'Cette structure n\'est pas idéale pour des revenus immédiats.',
                details: 'Ces structures nécessitent une trésorerie suffisante pour payer les charges avant de pouvoir verser des salaires réguliers.'
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
    
    // Vérification de compatibilité avec le TMI (nouveau)
    if (userResponses.tmiActuel >= 41) {
        // TMI élevé incompatible avec structures IR sans option IS
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'TMI_ELEVE',
                message: `Votre TMI élevé (${userResponses.tmiActuel}%) rend cette structure fiscalement défavorable.`,
                details: 'Avec ce TMI, une structure soumise à l\'IS serait généralement plus avantageuse fiscalement.'
            });
        });
    }
    
    // Vérification de compatibilité avec les besoins de levée de fonds
    if (userResponses.montantLevee && userResponses.montantLevee > 50000) {
        ['micro-entreprise', 'ei', 'eurl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'LEVEE_FONDS',
                message: `Votre besoin de lever ${userResponses.montantLevee.toLocaleString('fr-FR')}€ est incompatible avec cette structure.`,
                details: 'Pour une levée de fonds significative, privilégiez une SAS qui facilite l\'entrée d\'investisseurs au capital.'
            });
        });
    }
    
    // Vérification de compatibilité JEI (incompatible avec IR)
    if (userResponses.aideJei) {
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'JEI_INCOMPATIBLE',
                message: 'Le statut JEI n\'est pas compatible avec cette structure.',
                details: 'Le statut Jeune Entreprise Innovante (JEI) nécessite une société soumise à l\'IS.'
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
            if (raison === 'ORDRE_PROFESSIONNEL') {
                alternatives = formesJuridiques.filter(f => 
                    (f.categorie && f.categorie.includes('Libérale')) || 
                    (f.id && f.id.includes('sel')) ||
                    (f.id && f.id.includes('scp'))
                ).slice(0, 2);
            } else {
                alternatives = formesJuridiques.filter(f => 
                    (f.categorie && f.categorie.includes('Libérale') && f.responsabilite && f.responsabilite.includes('Limitée')) ||
                    (f.id && ['eurl', 'sasu'].includes(f.id))
                ).slice(0, 2);
            }
            break;
            
        case 'CA_TROP_ELEVE':
            alternatives = formesJuridiques.filter(f => 
                f.id === 'eurl' || f.id === 'sasu'
            );
            break;
            
        case 'BESOIN_INVESTISSEURS':
        case 'INVESTISSEURS_VC':
        case 'LEVEE_FONDS':
            if (raison === 'INVESTISSEURS_VC') {
                // Spécifiquement pour les VCs
                alternatives = formesJuridiques.filter(f => 
                    f.id === 'sas'
                );
            } else {
                // Pour les autres types d'investisseurs
                alternatives = formesJuridiques.filter(f => 
                    f.leveeFonds === 'Oui'
                ).slice(0, 2);
            }
            break;
            
        case 'PROTECTION_REQUISE':
        case 'BIEN_IMMOBILIER':
            alternatives = formesJuridiques.filter(f => 
                f.protectionPatrimoine === 'Oui' && ['sarl', 'sas', 'sasu', 'eurl'].includes(f.id)
            ).slice(0, 2);
            break;
            
        case 'REVENUS_IMMEDIATS':
            alternatives = formesJuridiques.filter(f => 
                f.id === 'micro-entreprise' || f.id === 'ei'
            );
            break;
            
        case 'ACTIVITE_AGRICOLE':
            alternatives = formesJuridiques.filter(f => 
                f.categorie && f.categorie.includes('Agricole')
            );
            break;
            
        case 'TMI_ELEVE':
            alternatives = formesJuridiques.filter(f => 
                f.fiscalite === 'IS' || (f.fiscaliteOption === 'Oui' && f.fiscalite.includes('IR ou IS'))
            ).slice(0, 2);
            break;
            
        case 'JEI_INCOMPATIBLE':
            alternatives = formesJuridiques.filter(f => 
                f.fiscalite === 'IS'
            ).slice(0, 2);
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