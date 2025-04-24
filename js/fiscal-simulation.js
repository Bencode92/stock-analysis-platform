/**
 * fiscal-simulation.js
 * Module dédié aux barèmes fiscaux et aux calculs de simulation pour le simulateur de forme juridique
 * Ce fichier contient la logique de calcul fiscal, d'évaluation des incompatibilités et de scoring
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
            "versement_liberatoire": {
                "commercial": 0.01,
                "service": 0.017,
                "liberal": 0.022
            },
            "plafonds": {
                "BIC": 176200,
                "BNC": 72600,
                "TVA": 85800
            }
        },
        "dividendes": {
            "pfu": 0.30,
            "abattement_40": true  // Abattement de 40% si option IR au lieu du PFU
        }
    }
};

/**
 * Moteur de règles métier pour appliquer les exclusions et requis avant le scoring
 */
const BusinessRules = {
    // Fonction pour déterminer le seuil micro selon l'activité
    seuilMicro: function(activite) {
        const bareme = baremesFiscaux["2025"].micro_entreprise.plafonds;
        if (activite === 'bic-vente' || activite === 'artisanale') {
            return bareme.BIC; // Commerce/artisanat
        } else if (activite === 'bic-service' || activite === 'bnc') {
            return bareme.BNC; // Services/libéral
        }
        return bareme.BNC; // Valeur par défaut
    },
    
    // Règles métier centralisées
    rules: [
        // Règles de CA
        { 
            id: "ca-micro", 
            when: function(r) { return r.chiffreAffaires > this.seuilMicro(r.typeActivite); },
            exclude: ['micro-entreprise'],
            reason: "Chiffre d'affaires trop élevé pour le régime micro-entreprise"
        },
        // Règles d'activité réglementée
        { 
            id: "ordre-pro", 
            when: function(r) { return r.ordreProessionnel; },
            require: ['sel', 'selas', 'selarl'],
            exclude: ['micro-entreprise', 'ei'],
            reason: "Profession réglementée avec ordre professionnel"
        },
        // Règles d'équipe
        { 
            id: "multi-associes", 
            when: function(r) { return r.profilEntrepreneur === 'associes' || r.profilEntrepreneur === 'famille'; },
            exclude: ['micro-entreprise', 'ei', 'eurl', 'sasu'],
            reason: "Structure avec plusieurs associés nécessaire"
        },
        // Règles d'investisseurs
        { 
            id: "investisseurs", 
            when: function(r) { return r.profilEntrepreneur === 'investisseurs' || r.montantLevee > 50000; },
            exclude: ['micro-entreprise', 'ei', 'eurl'],
            prefer: ['sas', 'sasu'],
            reason: "Structure adaptée aux investisseurs externes nécessaire"
        },
        // Règles de protection patrimoniale
        { 
            id: "protection-patrimoine", 
            when: function(r) { return r.cautionBancaire && r.bienImmobilier; },
            exclude: ['micro-entreprise', 'ei'],
            reason: "Protection patrimoniale complète requise"
        }
    ],
    
    /**
     * Applique toutes les règles métier aux formes juridiques
     */
    applyRules: function(userResponses, formesJuridiques) {
        // Structures exclues et requises par les règles
        const excluded = new Set();
        const required = new Set();
        const preferred = new Set();
        const appliedRules = [];
        
        // Référence pour l'utilisation dans les callbacks
        const self = this;

        // Appliquer chaque règle
        this.rules.forEach(rule => {
            // Utiliser bind pour conserver le contexte
            if (rule.when.call(self, userResponses)) {
                // Traiter les exclusions
                if (rule.exclude) {
                    rule.exclude.forEach(formId => excluded.add(formId));
                }
                
                // Traiter les formes requises
                if (rule.require) {
                    rule.require.forEach(formId => required.add(formId));
                }
                
                // Traiter les formes préférées
                if (rule.prefer) {
                    rule.prefer.forEach(formId => preferred.add(formId));
                }
                
                // Enregistrer la règle appliquée
                appliedRules.push({
                    ruleId: rule.id,
                    reason: rule.reason
                });
            }
        });

        // Filtrer les formes juridiques
        const filteredForms = formesJuridiques.filter(form => {
            if (excluded.has(form.id)) return false;
            if (required.size > 0 && !required.has(form.id)) return false;
            return true;
        });

        return {
            filteredForms,
            excluded: Array.from(excluded),
            required: Array.from(required),
            preferred: Array.from(preferred),
            appliedRules
        };
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
     * @param {number} tmiActuel - Taux marginal d'imposition (optionnel)
     * @return {number} Montant de l'impôt sur le revenu
     */
    calculerIR: function(revenuImposable, formeSociale, tmiActuel = null) {
        // Si un TMI est fourni, utiliser une approche simplifiée
        if (tmiActuel !== null) {
            return revenuImposable * (tmiActuel / 100);
        }
        
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
     * Déterminer le TMI (taux marginal d'imposition) pour un revenu donné
     * @param {number} revenuImposable - Le revenu imposable en euros
     * @return {number} Taux marginal d'imposition (en pourcentage)
     */
    determinerTMI: function(revenuImposable) {
        const bareme = this.getBaremeFiscal().IR;
        
        for (let i = 0; i < bareme.tranches.length; i++) {
            if (revenuImposable <= bareme.tranches[i].jusqu_a) {
                return bareme.tranches[i].taux * 100;
            }
        }
        
        return bareme.tranches[bareme.tranches.length - 1].taux * 100;
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
     * @param {number} tmiActuel - Taux marginal d'imposition (optionnel)
     * @return {number} Montant de l'impôt sur les dividendes
     */
    calculerImpotDividendes: function(dividendes, optionIR = false, tmiActuel = null) {
        const bareme = this.getBaremeFiscal().dividendes;
        
        if (optionIR) {
            // Option IR avec abattement de 40%
            const montantImposable = dividendes * (1 - 0.4);
            return this.calculerIR(montantImposable, 'standard', tmiActuel);
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
            tmiActuel: params.tmiActuel || null,
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
            simulation.impot = this.calculerIR(revenuAnnuel - simulation.chargesSociales, forme.id, parametres.tmiActuel);
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
            simulation.impotSalaire = this.calculerIR(salaire - simulation.chargesSalariales, 'salaire', parametres.tmiActuel);
            
            // 5. Calcul de l'impôt sur les dividendes (PFU 30%)
            simulation.impotDividendes = this.calculerImpotDividendes(dividendes, false, parametres.tmiActuel);
            
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
    },
    
    /**
     * Simulation spécifique pour micro-entreprise avec prise en compte du TMI
     * @param {Object} params - Paramètres de simulation
     * @return {Object} Résultat détaillé de la simulation
     */
    simulerMicroEntreprise: function(params) {
        const {
            ca = 50000,
            typeMicro = 'BIC',
            tmiActuel = null
        } = params;
        
        const bareme = this.getBaremeFiscal().micro_entreprise;
        const plafond = typeMicro === 'BIC' ? bareme.plafonds.BIC : bareme.plafonds.BNC;
        
        // Vérifier le dépassement de plafond
        if (ca > plafond) {
            return {
                compatible: false,
                message: `CA supérieur au plafond Micro-${typeMicro} (${plafond} €)`
            };
        }
        
        // Calcul de l'abattement selon le type d'activité
        const typeActivite = typeMicro === 'BIC' ? 'commercial' : 'liberal';
        const tauxAbattement = bareme.abattements[typeActivite];
        const abattement = ca * tauxAbattement;
        const beneficeImposable = ca - abattement;
        
        // Charges sociales (forfaitaires)
        const cotisationsSociales = ca * bareme.charges_sociales[typeActivite];
        
        // Option versement libératoire pour TMI faible
        let impotRevenu = 0;
        let optionVersementLiberatoire = false;
        
        if (tmiActuel !== null && tmiActuel <= 11) {
            // Versement libératoire plus avantageux
            impotRevenu = ca * bareme.versement_liberatoire[typeActivite];
            optionVersementLiberatoire = true;
        } else {
            // IR classique sur le bénéfice après abattement
            impotRevenu = this.calculerIR(beneficeImposable, 'standard', tmiActuel);
        }
        
        // Revenu net après prélèvements
        const revenuNetApresImpot = ca - cotisationsSociales - impotRevenu;
        const tauxPrelevementGlobal = (cotisationsSociales + impotRevenu) / ca;
        
        // Avantages et inconvénients
        const avantages = [
            "Simplicité administrative",
            "Pas de comptabilité complexe",
            "Démarrage rapide d'activité"
        ];
        
        if (optionVersementLiberatoire) {
            avantages.push("Versement libératoire avantageux (TMI ≤ 11%)");
        } else {
            avantages.push(`Abattement forfaitaire important (${tauxAbattement * 100}%)`);
        }
        
        const inconvenients = [
            "Protection sociale minimale",
            "Plafond de chiffre d'affaires",
            "Responsabilité illimitée"
        ];
        
        return {
            compatible: true,
            ca: ca,
            cotisationsSociales: cotisationsSociales,
            abattement: abattement,
            beneficeImposable: beneficeImposable,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            tauxPrelevement: tauxPrelevementGlobal,
            optionVersementLiberatoire: optionVersementLiberatoire,
            avantages: avantages,
            inconvenients: inconvenients
        };
    },
    
    /**
     * Simulation spécifique pour Entreprise Individuelle
     * @param {Object} params - Paramètres de simulation
     * @return {Object} Résultat détaillé de la simulation
     */
    simulerEI: function(params) {
        const {
            ca = 50000,
            tauxMarge = 0.3,
            tmiActuel = null
        } = params;
        
        // Calcul du bénéfice
        const charges = ca * (1 - tauxMarge);
        const beneficeAvantCotisations = ca - charges;
        
        // Cotisations sociales TNS
        const cotisationsSociales = beneficeAvantCotisations * this.getBaremeFiscal().cotisations.TNS.taux_moyen;
        const beneficeImposable = beneficeAvantCotisations - cotisationsSociales;
        
        // Impôt sur le revenu
        const impotRevenu = this.calculerIR(beneficeImposable, 'standard', tmiActuel);
        const revenuNetApresImpot = beneficeImposable - impotRevenu;
        const tauxPrelevement = (cotisationsSociales + impotRevenu) / beneficeAvantCotisations;
        
        return {
            compatible: true,
            ca: ca,
            charges: charges,
            beneficeAvantCotisations: beneficeAvantCotisations,
            cotisationsSociales: cotisationsSociales,
            beneficeImposable: beneficeImposable,
            impotRevenu: impotRevenu,
            revenuNetApresImpot: revenuNetApresImpot,
            tauxPrelevement: tauxPrelevement,
            avantages: [
                "Déduction des charges réelles",
                "Comptabilité simplifiée sous certains seuils",
                "Protection sociale TNS complète"
            ],
            inconvenients: [
                "Responsabilité illimitée sur patrimoine personnel",
                "Imposition progressive à l'IR",
                "Formalisme comptable plus important que micro-entreprise"
            ]
        };
    },
    
    /**
     * Simulation spécifique pour EURL
     * @param {Object} params - Paramètres de simulation
     * @return {Object} Résultat détaillé de la simulation
     */
    simulerEURL: function(params) {
        const {
            ca = 50000,
            tauxMarge = 0.3,
            tauxRemuneration = 0.7,
            optionIS = false,
            tmiActuel = null,
            optionTNS = true
        } = params;
        
        // Calcul du résultat de la société
        const charges = ca * (1 - tauxMarge);
        const resultatAvantRemuneration = ca - charges;
        
        // Répartition rémunération/résultat selon option fiscale
        const remuneration = resultatAvantRemuneration * tauxRemuneration;
        const resultatApresSalaire = resultatAvantRemuneration - remuneration;
        
        // Charges sociales selon statut
        const bareme = this.getBaremeFiscal().cotisations;
        const tauxCotisations = optionTNS ? bareme.TNS.taux_moyen : bareme.assimile_salarie.total;
        const cotisationsSociales = remuneration * tauxCotisations;
        
        // Résultats selon option fiscale (IR ou IS)
        if (optionIS) {
            // EURL à l'IS
            const remunerationNetteCotis = remuneration - (optionTNS ? cotisationsSociales : (remuneration * bareme.assimile_salarie.part_salariale));
            const remunerationNetteIR = remunerationNetteCotis - this.calculerIR(remunerationNetteCotis, 'standard', tmiActuel);
            
            // IS sur résultat après rémunération
            const tauxIS = resultatApresSalaire <= this.getBaremeFiscal().IS.taux_reduit.jusqu_a ? 
                this.getBaremeFiscal().IS.taux_reduit.taux : this.getBaremeFiscal().IS.taux_normal;
            const is = resultatApresSalaire * tauxIS;
            const dividendesBruts = resultatApresSalaire - is;
            
            // Flat tax sur dividendes
            const prelevementForfaitaire = dividendesBruts * this.getBaremeFiscal().dividendes.pfu;
            const dividendesNets = dividendesBruts - prelevementForfaitaire;
            
            const revenuNetTotal = remunerationNetteIR + dividendesNets;
            const tauxPrelevement = 1 - (revenuNetTotal / resultatAvantRemuneration);
            
            return {
                compatible: true,
                optionIS: true,
                ca: ca,
                charges: charges,
                resultatAvantRemuneration: resultatAvantRemuneration,
                remuneration: remuneration,
                cotisationsSociales: cotisationsSociales,
                remunerationNetteCotis: remunerationNetteCotis,
                remunerationNetteIR: remunerationNetteIR,
                is: is,
                dividendesBruts: dividendesBruts,
                prelevementForfaitaire: prelevementForfaitaire,
                dividendesNets: dividendesNets,
                revenuNetTotal: revenuNetTotal,
                tauxPrelevement: tauxPrelevement,
                avantages: [
                    "Responsabilité limitée au capital social",
                    "Optimisation possible via arbitrage rémunération/dividendes",
                    optionTNS ? "Protection sociale TNS" : "Statut assimilé salarié"
                ],
                inconvenients: [
                    "Double imposition des dividendes (IS + Flat tax)",
                    "Formalisme juridique et comptable plus important",
                    "Coûts de constitution et de gestion plus élevés"
                ]
            };
        } else {
            // EURL à l'IR (transparence fiscale)
            const beneficeImposable = resultatAvantRemuneration - cotisationsSociales;
            const impotRevenu = this.calculerIR(beneficeImposable, 'standard', tmiActuel);
            const revenuNetApresImpot = beneficeImposable - impotRevenu;
            const tauxPrelevement = (cotisationsSociales + impotRevenu) / resultatAvantRemuneration;
            
            return {
                compatible: true,
                optionIS: false,
                ca: ca,
                charges: charges,
                resultatAvantRemuneration: resultatAvantRemuneration,
                cotisationsSociales: cotisationsSociales,
                beneficeImposable: beneficeImposable,
                impotRevenu: impotRevenu,
                revenuNetApresImpot: revenuNetApresImpot,
                tauxPrelevement: tauxPrelevement,
                avantages: [
                    "Responsabilité limitée au capital social",
                    "Transparence fiscale (pas de double imposition)",
                    "Protection sociale TNS complète"
                ],
                inconvenients: [
                    "Imposition progressive à l'IR",
                    "Formalisme juridique et comptable important",
                    "Moins flexible pour l'entrée d'investisseurs"
                ]
            };
        }
    },
    
    /**
     * Simulation spécifique pour SASU
     * @param {Object} params - Paramètres de simulation
     * @return {Object} Résultat détaillé de la simulation
     */
    simulerSASU: function(params) {
        const {
            ca = 50000,
            tauxMarge = 0.3,
            tauxRemuneration = 0.7,
            tmiActuel = null
        } = params;
        
        // Calcul du résultat de la société
        const charges = ca * (1 - tauxMarge);
        const resultatAvantRemuneration = ca - charges;
        
        // Répartition rémunération/dividendes
        const remuneration = resultatAvantRemuneration * tauxRemuneration;
        const resultatApresSalaire = resultatAvantRemuneration - remuneration;
        
        // Charges sociales assimilé salarié
        const bareme = this.getBaremeFiscal().cotisations.assimile_salarie;
        const chargesPatronales = remuneration * bareme.part_patronale;
        const chargesSalariales = remuneration * bareme.part_salariale;
        const remunerationNetteCotis = remuneration - chargesSalariales;
        
        // IR sur la rémunération
        const impotRevenu = this.calculerIR(remunerationNetteCotis, 'standard', tmiActuel);
        const remunerationNetteIR = remunerationNetteCotis - impotRevenu;
        
        // IS sur le résultat après rémunération
        const tauxIS = resultatApresSalaire <= this.getBaremeFiscal().IS.taux_reduit.jusqu_a ? 
            this.getBaremeFiscal().IS.taux_reduit.taux : this.getBaremeFiscal().IS.taux_normal;
        const is = resultatApresSalaire * tauxIS;
        const dividendesBruts = resultatApresSalaire - is;
        
        // Flat tax sur dividendes
        const prelevementForfaitaire = dividendesBruts * this.getBaremeFiscal().dividendes.pfu;
        const dividendesNets = dividendesBruts - prelevementForfaitaire;
        
        const revenuNetTotal = remunerationNetteIR + dividendesNets;
        const tauxPrelevement = 1 - (revenuNetTotal / resultatAvantRemuneration);
        
        // Optimisation selon TMI
        let optimisationConseillée = "";
        if (tmiActuel !== null) {
            if (tmiActuel >= 30) {
                optimisationConseillée = "Augmenter la part des dividendes (moins taxés à la flat tax 30% que la rémunération)";
            } else {
                optimisationConseillée = "Augmenter la part de la rémunération (moins taxée à l'IR que les dividendes avec flat tax)";
            }
        }
        
        return {
            compatible: true,
            ca: ca,
            charges: charges,
            resultatAvantRemuneration: resultatAvantRemuneration,
            remuneration: remuneration,
            chargesPatronales: chargesPatronales,
            chargesSalariales: chargesSalariales,
            remunerationNetteCotis: remunerationNetteCotis,
            remunerationNetteIR: remunerationNetteIR,
            is: is,
            dividendesBruts: dividendesBruts,
            prelevementForfaitaire: prelevementForfaitaire,
            dividendesNets: dividendesNets,
            revenuNetTotal: revenuNetTotal,
            tauxPrelevement: tauxPrelevement,
            optimisationConseillée: optimisationConseillée,
            avantages: [
                "Responsabilité limitée au capital social",
                "Statut d'assimilé salarié (meilleure protection sociale)",
                "Flexibilité pour l'entrée d'investisseurs et BSPCE possible"
            ],
            inconvenients: [
                "Double imposition des dividendes (IS + Flat tax)",
                "Charges sociales élevées sur la rémunération",
                "Formalisme juridique et comptable important"
            ]
        };
    },
    
    /**
     * Comparaison des différentes structures sur plusieurs années
     * @param {Object} params - Paramètres de simulation
     * @return {Object} Comparaison des différentes structures
     */
    comparerSurPlusieursAnnees: function(params) {
        const {
            caAnnee1,
            caAnnee3,
            tauxMarge,
            tmiActuel,
            typeMicro = 'BIC',
            tauxRemuneration = 0.7,
            horizon
        } = params;
        
        // Calculer les CA intermédiaires avec une progression linéaire
        const caAnnee2 = caAnnee1 + (caAnnee3 - caAnnee1) / 2;
        
        // Simulations pour chaque année
        const resultats = {
            annee1: {
                micro: this.simulerMicroEntreprise({ca: caAnnee1, typeMicro, tmiActuel}),
                ei: this.simulerEI({ca: caAnnee1, tauxMarge, tmiActuel}),
                eurl: this.simulerEURL({ca: caAnnee1, tauxMarge, tauxRemuneration, tmiActuel}),
                sasu: this.simulerSASU({ca: caAnnee1, tauxMarge, tauxRemuneration, tmiActuel})
            },
            annee2: {
                micro: this.simulerMicroEntreprise({ca: caAnnee2, typeMicro, tmiActuel}),
                ei: this.simulerEI({ca: caAnnee2, tauxMarge, tmiActuel}),
                eurl: this.simulerEURL({ca: caAnnee2, tauxMarge, tauxRemuneration, tmiActuel}),
                sasu: this.simulerSASU({ca: caAnnee2, tauxMarge, tauxRemuneration, tmiActuel})
            },
            annee3: {
                micro: this.simulerMicroEntreprise({ca: caAnnee3, typeMicro, tmiActuel}),
                ei: this.simulerEI({ca: caAnnee3, tauxMarge, tmiActuel}),
                eurl: this.simulerEURL({ca: caAnnee3, tauxMarge, tauxRemuneration, tmiActuel}),
                sasu: this.simulerSASU({ca: caAnnee3, tauxMarge, tauxRemuneration, tmiActuel})
            }
        };
        
        // Calculer les totaux cumulés sur 3 ans
        const cumulSur3Ans = {
            micro: {
                compatible: resultats.annee1.micro.compatible && resultats.annee2.micro.compatible && resultats.annee3.micro.compatible,
                revenuNetCumule: (resultats.annee1.micro.compatible ? resultats.annee1.micro.revenuNetApresImpot : 0) +
                                 (resultats.annee2.micro.compatible ? resultats.annee2.micro.revenuNetApresImpot : 0) +
                                 (resultats.annee3.micro.compatible ? resultats.annee3.micro.revenuNetApresImpot : 0)
            },
            ei: {
                revenuNetCumule: resultats.annee1.ei.revenuNetApresImpot + 
                                 resultats.annee2.ei.revenuNetApresImpot + 
                                 resultats.annee3.ei.revenuNetApresImpot
            },
            eurl: {
                revenuNetCumule: (resultats.annee1.eurl.optionIS ? resultats.annee1.eurl.revenuNetTotal : resultats.annee1.eurl.revenuNetApresImpot) + 
                                 (resultats.annee2.eurl.optionIS ? resultats.annee2.eurl.revenuNetTotal : resultats.annee2.eurl.revenuNetApresImpot) + 
                                 (resultats.annee3.eurl.optionIS ? resultats.annee3.eurl.revenuNetTotal : resultats.annee3.eurl.revenuNetApresImpot)
            },
            sasu: {
                revenuNetCumule: resultats.annee1.sasu.revenuNetTotal + 
                                 resultats.annee2.sasu.revenuNetTotal + 
                                 resultats.annee3.sasu.revenuNetTotal
            }
        };
        
        // Déterminer la structure la plus rentable sur 3 ans
        let structurePlusRentable = 'micro';
        let revenuMaxCumule = cumulSur3Ans.micro.compatible ? cumulSur3Ans.micro.revenuNetCumule : 0;
        
        if (cumulSur3Ans.ei.revenuNetCumule > revenuMaxCumule) {
            structurePlusRentable = 'ei';
            revenuMaxCumule = cumulSur3Ans.ei.revenuNetCumule;
        }
        
        if (cumulSur3Ans.eurl.revenuNetCumule > revenuMaxCumule) {
            structurePlusRentable = 'eurl';
            revenuMaxCumule = cumulSur3Ans.eurl.revenuNetCumule;
        }
        
        if (cumulSur3Ans.sasu.revenuNetCumule > revenuMaxCumule) {
            structurePlusRentable = 'sasu';
            revenuMaxCumule = cumulSur3Ans.sasu.revenuNetCumule;
        }
        
        // Adapter la recommandation selon l'horizon
        let recommandationHorizon = structurePlusRentable;
        if (horizon === 'court' && resultats.annee1.micro.compatible) {
            // Pour un horizon court, privilégier la simplicité si micro est compatible
            recommandationHorizon = 'micro';
        } else if (horizon === 'long' && (structurePlusRentable === 'eurl' || structurePlusRentable === 'sasu')) {
            // Pour un horizon long, privilégier les structures sociétaires plus pérennes
            recommandationHorizon = structurePlusRentable;
        }
        
        return {
            resultatsAnnuels: resultats,
            cumulSur3Ans: cumulSur3Ans,
            structurePlusRentable: structurePlusRentable,
            recommandationHorizon: recommandationHorizon
        };
    },
    
    /**
     * Calculer le score de compatibilité pour chaque structure juridique
     * @param {Object} params - Critères et préférences de l'utilisateur
     * @return {Object} Scores pour chaque structure juridique
     */
    calculerScoresStructures: function(params) {
        const {
            ca,
            tauxMarge,
            typeMicro = 'BIC',
            tmiActuel = 30,
            horizon = 'moyen',
            equipe = 'solo',
            investisseurs = false,
            besoinProtection = false,
            besoinFinancement = false,
            strategieSortie = 'aucune',
            preferenceSimplicite = false,
            preferenceOptimisationFiscale = false,
            caAnnee1,
            caAnnee3
        } = params;
        
        // Initialiser les scores
        const scores = {
            micro: 50,
            ei: 50,
            eurl: 50,
            eurlIS: 50,
            sasu: 50
        };
        
        // 1. Vérifier les seuils des régimes micro
        const baremesMicro = this.getBaremeFiscal().micro_entreprise.plafonds;
        if (typeMicro === 'BIC' && ca > baremesMicro.BIC) {
            scores.micro = preferenceSimplicite ? -40 : -20;
        } else if (typeMicro === 'BNC' && ca > baremesMicro.BNC) {
            scores.micro = preferenceSimplicite ? -40 : -20;
        }
        
        // 2. Impact du TMI
        if (tmiActuel <= 11) {
            // TMI faible avantage Micro et EURL IR
            scores.micro += 10;
            scores.ei += 5;
            scores.eurl += 10;
            scores.eurlIS -= 5;
            scores.sasu -= 5;
        } else if (tmiActuel >= 30) {
            // TMI élevé avantage structures à l'IS
            scores.micro -= 5;
            scores.ei -= 10;
            scores.eurl -= 5;
            scores.eurlIS += 10;
            scores.sasu += 15;
        }
        
        // 3. Impact de la marge
        if (tauxMarge < 0.15) {
            // Marge faible pénalise SASU (charges sociales élevées)
            scores.sasu -= 10;
        } else if (tauxMarge > 0.3) {
            // Marge élevée avantage structures permettant optimisation
            scores.eurlIS += 5;
            scores.sasu += 10;
        }
        
        // 4. Impact de l'horizon
        if (horizon === 'court') {
            // Horizon court favorise simplicité
            scores.micro += 15;
            scores.ei += 5;
            scores.sasu -= 5;
        } else if (horizon === 'long') {
            // Horizon long favorise structures pérennes
            scores.micro -= 5;
            scores.eurl += 5;
            scores.eurlIS += 10;
            scores.sasu += 15;
        }
        
        // 5. Équipe et investisseurs
        if (equipe === 'solo') {
            scores.micro += 5;
            scores.ei += 5;
        } else if (equipe === 'associes' || equipe === 'famille') {
            scores.micro = 0; // Incompatible
            scores.ei = 0; // Incompatible
            scores.eurl += 5;
            scores.eurlIS += 10;
            scores.sasu += 10;
        }
        
        if (investisseurs) {
            scores.micro -= 50; // Incompatible
            scores.ei -= 50; // Incompatible
            scores.eurl -= 10;
            scores.eurlIS += 10;
            scores.sasu += 20;
        }
        
        // 6. Besoin de protection patrimoniale
        if (besoinProtection) {
            scores.micro -= 30;
            scores.ei -= 30;
            scores.eurl += 10;
            scores.eurlIS += 10;
            scores.sasu += 10;
        }
        
        // 7. Financement
        if (besoinFinancement) {
            scores.micro -= 30;
            scores.ei -= 20;
            scores.eurl -= 5;
            scores.eurlIS += 5;
            scores.sasu += 20;
        }
        
        // 8. Stratégie de sortie
        if (strategieSortie === 'transmission') {
            scores.eurlIS += 10;
            scores.sasu += 5;
        } else if (strategieSortie === 'revente') {
            scores.micro -= 20;
            scores.ei -= 10;
            scores.sasu += 20;
        }
        
        // 9. Préférences
        if (preferenceSimplicite) {
            scores.micro += 20;
            scores.ei += 10;
            scores.eurl -= 5;
            scores.eurlIS -= 10;
            scores.sasu -= 15;
        }
        
        if (preferenceOptimisationFiscale) {
            scores.micro -= 10;
            scores.ei -= 5;
            scores.eurlIS += 15;
            scores.sasu += 20;
        }
        
        // 10. Evolution du CA
        if (caAnnee3 && caAnnee1 && caAnnee3 > caAnnee1 * 2) {
            // Forte croissance prévue
            scores.micro -= 10;
            scores.eurlIS += 5;
            scores.sasu += 10;
        }
        
        // 11. Plafond les scores entre 0 et 100
        for (const structure in scores) {
            scores[structure] = Math.max(0, Math.min(100, scores[structure]));
        }
        
        // Calculer les structures recommandées
        const scoreEntries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const structureIdeale = scoreEntries[0][0];
        const challengers = [scoreEntries[1][0], scoreEntries[2][0]];
        
        // Vérifier les incompatibilités
        const incompatibilites = [];
        
        if (typeMicro === 'BIC' && ca > baremesMicro.BIC && (structureIdeale === 'micro' || challengers.includes('micro'))) {
            incompatibilites.push({
                structure: 'micro',
                raison: `CA supérieur au seuil Micro-${typeMicro}`,
                solution: 'Opter pour EI au réel ou EURL'
            });
        } else if (typeMicro === 'BNC' && ca > baremesMicro.BNC && (structureIdeale === 'micro' || challengers.includes('micro'))) {
            incompatibilites.push({
                structure: 'micro',
                raison: `CA supérieur au seuil Micro-${typeMicro}`,
                solution: 'Opter pour EI au réel ou EURL'
            });
        }
        
        if ((equipe !== 'solo') && (structureIdeale === 'micro' || structureIdeale === 'ei' || 
            challengers.includes('micro') || challengers.includes('ei'))) {
            incompatibilites.push({
                structure: 'micro/ei',
                raison: 'Incompatible avec plusieurs associés',
                solution: 'Opter pour EURL ou SASU'
            });
        }
        
        if (investisseurs && (structureIdeale === 'micro' || structureIdeale === 'ei' || 
            structureIdeale === 'eurl' || challengers.includes('micro') || 
            challengers.includes('ei') || challengers.includes('eurl'))) {
            incompatibilites.push({
                structure: 'micro/ei/eurl',
                raison: 'Difficile pour attirer des investisseurs',
                solution: 'Opter pour SASU'
            });
        }
        
        return {
            scores: scores,
            structureIdeale: structureIdeale,
            challengers: challengers,
            incompatibilites: incompatibilites
        };
    }
};

/**
 * Vérifie les incompatibilités majeures qui empêcheraient certaines formes juridiques
 * Version améliorée utilisant le moteur de règles
 */
function checkHardFails(userResponses) {
    // Appliquer les règles métier (simulation pour obtenir les règles appliquées)
    // Note: la liste complète des formes n'est pas disponible ici, donc on utilise un tableau vide
    const rulesResult = BusinessRules.applyRules(userResponses, []);
    
    // Convertir les résultats au format attendu par le reste du code
    const fails = rulesResult.appliedRules.map(rule => {
        let formeIds = [];
        
        // Associer les bonnes formes exclues à chaque règle
        if (rule.ruleId === "ca-micro") formeIds = ['micro-entreprise'];
        else if (rule.ruleId === "ordre-pro") formeIds = ['micro-entreprise', 'ei'];
        else if (rule.ruleId === "investisseurs") formeIds = ['micro-entreprise', 'ei', 'eurl'];
        else if (rule.ruleId === "protection-patrimoine") formeIds = ['micro-entreprise', 'ei'];
        else if (rule.ruleId === "multi-associes") formeIds = ['micro-entreprise', 'ei', 'eurl', 'sasu'];
        
        // Créer un tableau d'échecs pour chaque forme concernée
        return formeIds.map(formeId => ({
            formeId: formeId,
            code: rule.ruleId,
            message: rule.reason,
            details: `Cette forme juridique n'est pas compatible avec vos besoins: ${rule.reason}`
        }));
    }).flat(); // Aplatir le tableau de tableaux
    
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
            
        case 'TMI_ELEVEE':
            alternatives = formesJuridiques.filter(f => 
                f.fiscalite.includes('IS') && ['sasu', 'sas', 'eurl'].includes(f.id)
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

/**
 * Génère une explication en langage naturel pour la forme juridique recommandée
 */
function generateNaturalExplanation(forme, userResponses, simulation) {
    // Détermine le niveau de compatibilité
    const score = simulation.scoreDetails ? simulation.scoreDetails.pourcentage : 85;
    const compatibilityLevel = score >= 90 ? "idéale" : 
                               score >= 75 ? "très bien adaptée" : "bien adaptée";
    
    // Templates d'explications par type de forme juridique
    const explanations = {
        'micro-entreprise': `La micro-entreprise est ${compatibilityLevel} pour votre projet car elle offre simplicité administrative et coûts réduits. ${userResponses.tmiActuel <= 11 ? "Avec votre TMI actuelle de " + userResponses.tmiActuel + "%, ce régime est particulièrement avantageux fiscalement." : ""} ${userResponses.chiffreAffaires < BusinessRules.seuilMicro(userResponses.typeActivite) * 0.7 ? "Votre CA prévisionnel est confortablement sous le plafond autorisé." : "Attention, votre CA prévisionnel s'approche du plafond, une évolution du statut pourrait être nécessaire à moyen terme."}`,
        
        'ei': `L'Entreprise Individuelle est ${compatibilityLevel} pour votre projet car elle combine simplicité et déduction des frais réels. ${userResponses.tauxMarge > 20 ? "Avec votre taux de marge de " + userResponses.tauxMarge + "%, vous pourrez optimiser votre fiscalité grâce à la déduction des frais réels." : ""} Depuis 2022, elle offre également une meilleure protection de votre patrimoine personnel.`,
        
        'eurl': `L'EURL est ${compatibilityLevel} pour votre projet car elle offre une protection patrimoniale complète tout en étant adaptée à un entrepreneur solo. ${userResponses.tmiActuel >= 30 ? "Avec votre TMI actuelle de " + userResponses.tmiActuel + "%, l'option IS de l'EURL pourrait vous permettre une optimisation fiscale significative." : "Sa flexibilité fiscale (IR ou IS au choix) vous permettra d'adapter votre régime à l'évolution de votre activité."}`,
        
        'sasu': `La SASU est ${compatibilityLevel} pour votre projet car elle combine protection patrimoniale et statut social avantageux. ${userResponses.tmiActuel >= 30 ? "Avec votre TMI actuelle de " + userResponses.tmiActuel + "%, la fiscalité IS vous permet d'optimiser votre rémunération via l'arbitrage salaire/dividendes." : ""} ${userResponses.montantLevee > 0 ? "Sa structure est particulièrement adaptée pour accueillir des investisseurs et faciliter les levées de fonds." : ""} Le statut d'assimilé-salarié vous offre également une meilleure protection sociale.`
    };
    
    // Explication par défaut si le template spécifique n'existe pas
    const explanation = explanations[forme.id] || 
        `La ${forme.nom} est ${compatibilityLevel} pour votre projet. Elle présente un bon équilibre entre protection juridique, optimisation fiscale et simplicité administrative pour votre situation.`;
    
    // Impact fiscal concret
    const fiscalImpact = `
        Avec un chiffre d'affaires annuel de ${simulation.simulation.revenuAnnuel.toLocaleString('fr-FR')} € 
        et un taux de marge de ${userResponses.tauxMarge}%, vous pouvez espérer un revenu net annuel 
        d'environ ${Math.round(simulation.simulation.revenueNet).toLocaleString('fr-FR')} € 
        après charges sociales (${Math.round(simulation.simulation.chargesSociales).toLocaleString('fr-FR')} €) 
        et impôts (${Math.round(simulation.simulation.impot).toLocaleString('fr-FR')} €).
    `;
    
    return {
        main: explanation,
        fiscal: fiscalImpact,
        tips: getFiscalOptimizationTips(forme, userResponses)
    };
}

/**
 * Fournit des conseils d'optimisation fiscale adaptés à la forme et au profil
 */
function getFiscalOptimizationTips(forme, userResponses) {
    if (forme.id === 'sasu' || (forme.id === 'eurl' && forme.fiscalite === 'IS')) {
        return `
            Optimisez votre fiscalité en ajustant la répartition entre salaire et dividendes. 
            ${userResponses.tmiActuel >= 30 ? "Avec votre TMI élevée, privilégiez les dividendes (PFU 30%) pour les revenus au-delà de vos besoins réguliers." : 
            "Avec votre TMI modérée, un équilibre 70% salaire / 30% dividendes pourrait être optimal."}
        `;
    } else if (forme.id === 'micro-entreprise') {
        return `
            ${userResponses.tmiActuel <= 11 ? "Avec votre TMI faible, le versement libératoire de l'impôt est particulièrement avantageux." : 
            "Surveillez régulièrement votre taux de charges réelles. Si elles dépassent l'abattement forfaitaire, envisagez de passer en EI au régime réel."}
        `;
    }
    return "";
}

// Fonction de compatibilité pour garder la cohérence avec l'ancien code
SimulationsFiscales.calculerStructureOptimale = function(profil) {
    // Adapter le format à la nouvelle méthode de calcul de scores
    const params = {
        ca: profil.ca || 50000,
        tauxMarge: profil.marges || 0.3,
        typeMicro: profil.activite || 'BIC',
        tmiActuel: profil.tmi || 30,
        horizon: profil.horizon || 'moyen',
        equipe: profil.profilEntrepreneur || 'solo',
        investisseurs: profil.profilEntrepreneur === 'investisseurs',
        besoinProtection: profil.protectionPatrimoine >= 4,
        besoinFinancement: profil.besoinFinancement,
        strategieSortie: profil.strategieSortie || 'aucune',
        preferenceSimplicite: profil.prioriteSimplicite,
        preferenceOptimisationFiscale: profil.prioriteOptimisationFiscale
    };
    
    return this.calculerScoresStructures(params);
};

// Exporter les fonctions et objets pour utilisation dans types-entreprise.js
window.SimulationsFiscales = SimulationsFiscales;
window.checkHardFails = checkHardFails;
window.hasHardFail = hasHardFail;
window.getAlternativesRecommandees = getAlternativesRecommandees;
window.BusinessRules = BusinessRules;
window.generateNaturalExplanation = generateNaturalExplanation;
