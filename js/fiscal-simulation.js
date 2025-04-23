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
            }
        },
        "dividendes": {
            "pfu": 0.30,
            "abattement_40": true  // Abattement de 40% si option IR au lieu du PFU
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
     * @return {number} Montant des charges sociales
     */
    calculerChargesSociales: function(revenu, regimeSocial) {
        const bareme = this.getBaremeFiscal().cotisations;
        
        if (regimeSocial === 'TNS' || regimeSocial.includes('TNS')) {
            // Taux moyen charges TNS
            return revenu * bareme.TNS.taux_moyen;
        } else if (regimeSocial === 'Assimilé salarié' || regimeSocial.includes('salarié')) {
            // Part salariale + patronale
            return revenu * bareme.assimile_salarie.total;
        }
        
        // Taux par défaut
        return revenu * 0.65;
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
            simulation.chargesSociales = this.calculerChargesSociales(revenuAnnuel, regimeSocial);
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
            
            // 4. Calcul des charges sur le salaire
            simulation.chargesSalariales = this.calculerChargesSociales(salaire, regimeSocial);
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
            message: 'Le chiffre d\'affaires prévu dépasse les plafonds autorisés pour une micro-entreprise.',
            details: 'Le régime micro-entreprise est limité à 77.700€ pour le commerce et 36.800€ pour les services et professions libérales.'
        });
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
    
    // Vérifications pour les projets avec investisseurs
    if (userResponses.profilEntrepreneur === 'investisseurs') {
        ['micro-entreprise', 'ei', 'eirl'].forEach(forme => {
            fails.push({
                formeId: forme,
                code: 'BESOIN_INVESTISSEURS',
                message: 'Cette forme juridique ne permet pas d\'accueillir des investisseurs externes.',
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
                message: 'La responsabilité des associés n\'est pas suffisamment limitée.',
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
                message: 'Cette forme juridique n\'est pas adaptée aux activités agricoles.',
                details: 'Pour une activité agricole, privilégiez une structure spécifique comme le GAEC ou l\'EARL.'
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
