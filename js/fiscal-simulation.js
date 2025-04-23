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
            // NOUVELLE SECTION: Plafonds actualisés 2025
            "plafonds": {
                "achat_revente": 188700,
                "prestation_service": 77700,
                "liberal": 77700
            }
        },
        "dividendes": {
            "pfu": 0.30,
            "abattement_40": true  // Abattement de 40% si option IR au lieu du PFU
        },
        // NOUVELLE SECTION: Coefficients de frais réels moyens par secteur
        "coefFraisReelsMoyens": {
            "commercial": 0.55,  // 55% du CA en moyenne pour les frais
            "service": 0.35,     // 35% du CA en moyenne pour les services
            "artisanal": 0.50,   // 50% du CA en moyenne pour les artisans
            "liberal": 0.30,     // 30% du CA en moyenne pour les professions libérales
            "agricole": 0.65     // 65% du CA en moyenne pour l'agriculture
        },
        // NOUVELLE SECTION: ACRE (Aide à la Création et à la Reprise d'Entreprise)
        "ACRE": {
            "exoneration": {
                "annee1": 0.50,  // Exonération de 50% la première année
                "annee2": 0.25,  // Exonération de 25% la deuxième année
                "annee3": 0.10   // Exonération de 10% la troisième année
            },
            "duree_mois": 12     // Durée d'application en mois
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
     * Calcule les charges sociales selon le régime social
     * @param {number} revenu - Le revenu en euros
     * @param {string} regimeSocial - Le régime social (TNS ou Assimilé salarié)
     * @param {Object} params - Paramètres additionnels (ACRE, etc.)
     * @return {number} Montant des charges sociales
     */
    calculerChargesSociales: function(revenu, regimeSocial, params = {}) {
        const bareme = this.getBaremeFiscal().cotisations;
        
        // Facteur de réduction ACRE si applicable
        let facteurReduction = 1;
        if (params.premiereAnnee && params.ACRE) {
            facteurReduction = 1 - this.getBaremeFiscal().ACRE.exoneration.annee1;
        } else if (params.deuxiemeAnnee && params.ACRE) {
            facteurReduction = 1 - this.getBaremeFiscal().ACRE.exoneration.annee2;
        } else if (params.troisiemeAnnee && params.ACRE) {
            facteurReduction = 1 - this.getBaremeFiscal().ACRE.exoneration.annee3;
        }
        
        if (regimeSocial === 'TNS' || regimeSocial.includes('TNS')) {
            // Taux moyen charges TNS avec réduction ACRE si applicable
            return revenu * bareme.TNS.taux_moyen * facteurReduction;
        } else if (regimeSocial === 'Assimilé salarié' || regimeSocial.includes('salarié')) {
            // Part salariale + patronale avec réduction ACRE si applicable
            return revenu * bareme.assimile_salarie.total * facteurReduction;
        }
        
        // Taux par défaut
        return revenu * 0.65 * facteurReduction;
    },
    
    /**
     * Calcule l'impôt sur les dividendes
     * @param {number} dividendes - Le montant des dividendes en euros
     * @param {boolean} optionIR - Si vrai, utilise l'option IR sinon PFU
     * @return {number} Montant de l'impôt sur les dividendes
     */
    calculerImpotDividendes: function(dividendes, optionIR = false) {
        const bareme = this.getBaremeFiscal().dividendes;
        
        if (optionIR) {
            // Option IR avec abattement de 40%
            const montantImposable = dividendes * (1 - 0.4);
            return this.calculerIR(montantImposable, 'standard');
        } else {
            // Prélèvement Forfaitaire Unique (flat tax)
            return dividendes * bareme.pfu;
        }
    },
    
    /**
     * NOUVELLE MÉTHODE: Compare le régime micro-entreprise vs réel simplifié
     * @param {number} chiffreAffaires - Le CA annuel en euros
     * @param {string} natureActivite - Type d'activité (commercial, service, etc.)
     * @param {Object} params - Paramètres (charges réelles déclarées, etc.)
     * @return {Object} Résultat détaillé de la comparaison
     */
    comparerMicroVsReel: function(chiffreAffaires, natureActivite, params = {}) {
        const bareme = this.getBaremeFiscal();
        
        // Conversion du type d'activité pour correspondre au barème
        let typeActiviteNormalise = 'service'; // par défaut
        if (natureActivite === 'commerciale') typeActiviteNormalise = 'commercial';
        else if (natureActivite === 'liberale') typeActiviteNormalise = 'liberal';
        else if (natureActivite === 'artisanale') typeActiviteNormalise = 'artisanal';
        
        // Vérifier si le CA est sous le plafond micro
        const plafondMicro = (typeActiviteNormalise === 'commercial' || typeActiviteNormalise === 'artisanal') 
            ? bareme.micro_entreprise.plafonds.achat_revente 
            : bareme.micro_entreprise.plafonds.prestation_service;
        
        if (chiffreAffaires > plafondMicro) {
            return {
                eligible: false,
                message: `Le chiffre d'affaires dépasse le plafond micro-entreprise de ${plafondMicro.toLocaleString('fr-FR')} €`,
                regimeConseille: 'réel obligatoire'
            };
        }
        
        // Calcul pour régime micro
        const abattementForfaitaire = bareme.micro_entreprise.abattements[typeActiviteNormalise] || 0.5;
        const chargesMicro = chiffreAffaires * bareme.micro_entreprise.charges_sociales[typeActiviteNormalise];
        const beneficeMicro = chiffreAffaires * (1 - abattementForfaitaire);
        const impotMicro = this.calculerIR(beneficeMicro, 'micro-entreprise');
        const revenuNetMicro = chiffreAffaires - chargesMicro - impotMicro;
        
        // Calcul pour régime réel simplifié
        const fraisReelsMoyens = params.fraisReels || (chiffreAffaires * bareme.coefFraisReelsMoyens[typeActiviteNormalise]);
        const beneficeReel = chiffreAffaires - fraisReelsMoyens;
        const chargesReel = this.calculerChargesSociales(beneficeReel, 'TNS', params);
        const impotReel = this.calculerIR(beneficeReel - chargesReel, 'standard');
        const revenuNetReel = beneficeReel - chargesReel - impotReel;
        
        // Calculer le seuil de rentabilité (point de bascule entre micro et réel)
        let seuilRentabilite = this.calculerSeuilRentabilite(typeActiviteNormalise, params);
        
        const difference = revenuNetReel - revenuNetMicro;
        const regimeConseille = difference > 0 ? 'réel simplifié' : 'micro-entreprise';
        
        return {
            eligible: true,
            revenuNetMicro,
            revenuNetReel,
            difference: Math.abs(difference),
            regimeConseille,
            seuilRentabilite,
            detailsMicro: {
                abattementForfaitaire,
                chargesSociales: chargesMicro,
                beneficeImposable: beneficeMicro,
                impot: impotMicro
            },
            detailsReel: {
                fraisReels: fraisReelsMoyens,
                beneficeImposable: beneficeReel,
                chargesSociales: chargesReel,
                impot: impotReel
            },
            // Pour l'affichage du tableau de sensibilité
            projectionSelonCA: this.genererTableauSensibilite(typeActiviteNormalise, params)
        };
    },
    
    /**
     * NOUVELLE MÉTHODE: Calcule le seuil de rentabilité entre micro et réel
     * @param {string} typeActivite - Type d'activité normalisé
     * @param {Object} params - Paramètres additionnels
     * @return {number} Seuil de CA à partir duquel le réel devient plus intéressant
     */
    calculerSeuilRentabilite: function(typeActivite, params = {}) {
        const bareme = this.getBaremeFiscal();
        
        // Méthode approximative basée sur les coefficients moyens
        // Dans un cas réel, il faudrait utiliser une méthode plus précise avec itération
        const abattementForfaitaire = bareme.micro_entreprise.abattements[typeActivite] || 0.5;
        const chargesMicroTaux = bareme.micro_entreprise.charges_sociales[typeActivite] || 0.22;
        const fraisReelsTaux = bareme.coefFraisReelsMoyens[typeActivite] || 0.4;
        
        // Calcul du seuil approximatif (à affiner selon les tranches d'IR)
        const seuilApprox = 15000 / (abattementForfaitaire - fraisReelsTaux);
        
        return Math.max(5000, Math.min(seuilApprox, 70000));
    },
    
    /**
     * NOUVELLE MÉTHODE: Génère un tableau de sensibilité pour différents CA
     * @param {string} typeActivite - Type d'activité normalisé 
     * @param {Object} params - Paramètres additionnels
     * @return {Array} Tableau de comparaison pour différents niveaux de CA
     */
    genererTableauSensibilite: function(typeActivite, params = {}) {
        // Niveaux de CA à comparer
        const niveauxCA = [30000, 60000, 90000];
        const resultats = [];
        
        for (const ca of niveauxCA) {
            const comparaison = this.comparerMicroVsReel(ca, typeActivite, params);
            if (comparaison.eligible) {
                resultats.push({
                    ca,
                    netMicro: Math.round(comparaison.revenuNetMicro),
                    netReel: Math.round(comparaison.revenuNetReel),
                    difference: Math.round(comparaison.difference),
                    regimeConseille: comparaison.regimeConseille
                });
            }
        }
        
        return resultats;
    },
    
    /**
     * NOUVELLE MÉTHODE: Simule l'impact de l'ACRE sur plusieurs années
     * @param {number} revenuAnnuel - Le revenu annuel de base
     * @param {string} regimeSocial - Le régime social (TNS ou Assimilé salarié)
     * @return {Object} Projection sur 3 ans avec et sans ACRE
     */
    simulerImpactACRE: function(revenuAnnuel, regimeSocial) {
        const bareme = this.getBaremeFiscal();
        const acreExo = bareme.ACRE.exoneration;
        
        const chargesNormales = this.calculerChargesSociales(revenuAnnuel, regimeSocial);
        
        // Calcul avec ACRE sur 3 ans
        const chargesAnnee1 = chargesNormales * (1 - acreExo.annee1);
        const chargesAnnee2 = chargesNormales * (1 - acreExo.annee2);
        const chargesAnnee3 = chargesNormales * (1 - acreExo.annee3);
        
        // Calcul des économies réalisées
        const economieAnnee1 = chargesNormales - chargesAnnee1;
        const economieAnnee2 = chargesNormales - chargesAnnee2;
        const economieAnnee3 = chargesNormales - chargesAnnee3;
        const economieTotal = economieAnnee1 + economieAnnee2 + economieAnnee3;
        
        return {
            sansACRE: {
                annee1: chargesNormales,
                annee2: chargesNormales,
                annee3: chargesNormales,
                total: chargesNormales * 3
            },
            avecACRE: {
                annee1: chargesAnnee1,
                annee2: chargesAnnee2,
                annee3: chargesAnnee3,
                total: chargesAnnee1 + chargesAnnee2 + chargesAnnee3
            },
            economie: {
                annee1: economieAnnee1,
                annee2: economieAnnee2,
                annee3: economieAnnee3,
                total: economieTotal
            },
            pourcentageEconomie: (economieTotal / (chargesNormales * 3)) * 100
        };
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
            premiereAnnee: params.premiereAnnee || false,
            deuxiemeAnnee: params.deuxiemeAnnee || false,
            troisiemeAnnee: params.troisiemeAnnee || false,
            ACRE: params.premiereAnnee || params.deuxiemeAnnee || params.troisiemeAnnee || false,
            natureActivite: params.natureActivite || 'service',
            fraisReels: params.fraisReels || null,
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
        
        // NOUVELLE SECTION: Si micro-entreprise, calculer comparaison micro vs réel
        if (forme.id === 'micro-entreprise') {
            simulation.microComparaison = this.comparerMicroVsReel(
                revenuAnnuel, 
                parametres.natureActivite, 
                {
                    fraisReels: parametres.fraisReels,
                    premiereAnnee: parametres.premiereAnnee,
                    ACRE: parametres.ACRE
                }
            );
        }
        
        // NOUVELLE SECTION: Simulation ACRE si applicable
        if (parametres.ACRE) {
            simulation.impactACRE = this.simulerImpactACRE(revenuAnnuel, regimeSocial);
        }
        
        // Calcul différent selon le régime fiscal
        if (regimeFiscal === 'IR') {
            // Cas de l'IR (entreprise individuelle, EURL à l'IR, etc.)
            simulation.chargesSociales = this.calculerChargesSociales(revenuAnnuel, regimeSocial, parametres);
            simulation.impot = this.calculerIR(revenuAnnuel - simulation.chargesSociales, forme.id);
            simulation.revenueNet = revenuAnnuel - simulation.impot - simulation.chargesSociales;
            
            // Détails pour affichage
            simulation.detailsCalcul = {
                revenuImposable: revenuAnnuel - simulation.chargesSociales,
                tauxImpositionMoyen: Math.round((simulation.impot / revenuAnnuel) * 100),
                tauxPrelevementsSociaux: Math.round((simulation.chargesSociales / revenuAnnuel) * 100),
                ratioNetBrut: Math.round((simulation.revenueNet / revenuAnnuel) * 100)
            };
        } else {
            // Cas de l'IS (SARL, SAS, SASU, etc.)
            
            // 1. Calcul du bénéfice (hypothèse: 80% du revenu)
            const benefice = revenuAnnuel * 0.8;
            
            // 2. Calcul de l'IS sur ce bénéfice
            simulation.impotSociete = this.calculerIS(benefice);
            
            // 3. Répartition salaire/dividendes selon paramètres
            const ratioSalaire = parametres.ratioSalaire / 100;
            const ratioDividendes = parametres.ratioDividendes / 100;
            
            const salaire = Math.min(benefice - simulation.impotSociete, revenuAnnuel * ratioSalaire);
            const dividendes = Math.max(0, (benefice - simulation.impotSociete - salaire) * ratioDividendes);
            
            // 4. Calcul des charges sur le salaire avec ACRE si applicable
            simulation.chargesSalariales = this.calculerChargesSociales(salaire, regimeSocial, parametres);
            simulation.impotSalaire = this.calculerIR(salaire - simulation.chargesSalariales, 'salaire');
            
            // 5. Calcul de l'impôt sur les dividendes (PFU 30%)
            simulation.impotDividendes = this.calculerImpotDividendes(dividendes);
            
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
                ratioNetBrut: Math.round((simulation.revenueNet / revenuAnnuel) * 100)
            };
        }
        
        // NOUVELLE SECTION: Projection pluriannuelle
        if (parametres.afficherProjection) {
            simulation.projectionPlurianuelle = {
                annee1: {...simulation},
                annee2: this.simulerImpactFiscal(forme, revenuAnnuel * 1.1, {...parametres, premiereAnnee: false, deuxiemeAnnee: parametres.premiereAnnee}),
                annee3: this.simulerImpactFiscal(forme, revenuAnnuel * 1.2, {...parametres, premiereAnnee: false, deuxiemeAnnee: false, troisiemeAnnee: parametres.premiereAnnee})
            };
        }
        
        return simulation;
    }
};

/**
 * Vérifie les incompatibilités majeures qui empêcheraient certaines formes juridiques
 * @param {Object} userResponses - Les réponses de l'utilisateur au questionnaire
 * @return {Array} - Liste des incompatibilités détectées
 */
function checkHardFails(userResponses) {
    const fails = [];
    
    // Vérifications pour la micro-entreprise
    if (userResponses.chiffreAffaires === 'eleve') {
        fails.push({
            formeId: 'micro-entreprise',
            code: 'CA_TROP_ELEVE',
            message: 'Le chiffre d\\'affaires prévu dépasse les plafonds autorisés pour une micro-entreprise.',
            details: 'Le régime micro-entreprise est limité à 77.700€ pour les services et professions libérales et 188.700€ pour le commerce/artisanat.'
        });
    }
    
    // Vérifications pour les activités réglementées
    if (userResponses.activiteReglementee) {
        ['micro-entreprise', 'ei'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'ACTIVITE_REGLEMENTEE',
                message: 'Cette forme juridique n\\'est pas optimale pour une activité réglementée nécessitant des diplômes spécifiques.',
                details: 'Les activités réglementées nécessitent généralement une structure plus formelle et complète.'
            });
        });
    }
    
    // Vérifications pour les projets avec investisseurs
    if (userResponses.profilEntrepreneur === 'investisseurs') {
        ['micro-entreprise', 'ei', 'eirl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'BESOIN_INVESTISSEURS',
                message: 'Cette forme juridique ne permet pas d\\'accueillir des investisseurs externes.',
                details: 'Pour attirer des investisseurs, privilégiez des structures comme la SAS, SASU ou SA.'
            });
        });
    }
    
    // Vérifications pour la protection patrimoniale comme priorité absolue
    if (userResponses.protectionPatrimoine >= 5) {
        ['snc', 'sci', 'scp', 'scm', 'sccv'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'PROTECTION_REQUISE',
                message: 'La responsabilité des associés n\\'est pas suffisamment limitée.',
                details: 'Vous avez indiqué que la protection de votre patrimoine personnel est une priorité absolue.'
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
                message: 'Cette forme juridique n\\'est pas adaptée aux activités agricoles.',
                details: 'Pour une activité agricole, privilégiez une structure spécifique comme le GAEC ou l\\'EARL.'
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
            alternatives = formesJuridiques.filter(f => 
                (f.categorie.includes('Libérale') && f.responsabilite.includes('Limitée')) ||
                ['eurl', 'sasu'].includes(f.id)
            ).slice(0, 2);
            break;
            
        case 'CA_TROP_ELEVE':
            alternatives = formesJuridiques.filter(f => 
                f.id === 'eurl' || f.id === 'sasu'
            );
            break;
            
        case 'BESOIN_INVESTISSEURS':
            alternatives = formesJuridiques.filter(f => 
                f.leveeFonds === 'Oui'
            ).slice(0, 2);
            break;
            
        case 'PROTECTION_REQUISE':
            alternatives = formesJuridiques.filter(f => 
                f.protectionPatrimoine === 'Oui' && ['sarl', 'sas', 'sasu', 'eurl'].includes(f.id)
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