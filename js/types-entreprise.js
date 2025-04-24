/**
 * Simulateur de forme juridique d'entreprise - Version améliorée 2025
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: progression du général au particulier, questions qualitatives précises,
 * scoring pondéré contextuel, détection des incompatibilités, simulation pluriannuelle.
 * Dernière mise à jour : Avril 2025 - Information vérifiées pour la législation en vigueur
 */

document.addEventListener('DOMContentLoaded', function() {
    // ===== MODULE 1: BASE DE DONNÉES DES FORMES JURIDIQUES =====
    const FormeJuridiqueDB = {
        // Base de données des formes juridiques mise à jour avec données vérifiées 2025
        structures: [
            {
                id: 'micro-entreprise',
                nom: 'Micro-entreprise',
                categorie: 'Commerciale/Civile',
                associes: '1',
                capital: 'Aucun',
                responsabilite: 'Limitée au patrimoine professionnel (réforme 2022)',
                fiscalite: 'IR',
                fiscaliteOption: 'Non',
                regimeSocial: 'TNS',
                protectionPatrimoine: 'Oui (depuis 2022)',
                chargesSociales: 'Simplifiées',
                fiscal: 'Non applicable (pas de distribution, IR sur bénéfices)',
                regimeTVA: 'Franchise en base (TVA uniquement si dépassement seuils)',
                publicationComptes: 'Non',
                formalites: 'Très simplifiées',
                activite: 'Toutes sauf réglementées',
                leveeFonds: 'Non',
                entreeAssocies: 'Non',
                profilOptimal: 'Entrepreneur solo',
                avantages: 'Simplicité, coût réduit',
                inconvenients: 'Plafond CA (203 100 € vente ou 81 500 € services), abattement forfaitaire au lieu de déduction réelle',
                casConseille: 'Début d\'activité, test',
                casDeconseille: 'Développement ambitieux',
                transmission: 'Non',
                plafondCA: '203 100 € (vente/hébergement) ou 81 500 € (services/libérales)',
                icone: 'fa-rocket'
            },
            {
                id: 'ei',
                nom: 'Entreprise Individuelle (EI)',
                categorie: 'Commerciale/Civile',
                associes: '1',
                capital: 'Aucun',
                responsabilite: 'Limitée au patrimoine professionnel (réforme 2022)',
                fiscalite: 'IR',
                fiscaliteOption: 'Non',
                regimeSocial: 'TNS',
                protectionPatrimoine: 'Oui (depuis 2022)',
                chargesSociales: 'Sur bénéfices',
                fiscal: 'Non applicable (pas de distribution, IR sur bénéfices)',
                regimeTVA: 'Oui',
                publicationComptes: 'Non',
                formalites: 'Très simplifiées',
                activite: 'Toutes sauf réglementées',
                leveeFonds: 'Non',
                entreeAssocies: 'Non',
                profilOptimal: 'Entrepreneur solo',
                avantages: 'Simplicité, coût réduit',
                inconvenients: 'Peu de protection en cas de faute de gestion',
                casConseille: 'Artisan, commerçant',
                casDeconseille: 'Projet à risque élevé',
                transmission: 'Non',
                plafondCA: 'Aucun plafond',
                icone: 'fa-user'
            },
            {
                id: 'eurl',
                nom: 'EURL',
                categorie: 'Commerciale',
                associes: '1',
                capital: '1€ minimum',
                responsabilite: 'Limitée aux apports',
                fiscalite: 'IR ou IS',
                fiscaliteOption: 'Oui',
                regimeSocial: 'TNS ou Assimilé salarié',
                protectionPatrimoine: 'Oui',
                chargesSociales: 'Sur rémunération',
                fiscal: 'Dividendes possibles',
                regimeTVA: 'Oui',
                publicationComptes: 'Oui',
                formalites: 'Modérées',
                activite: 'Toutes',
                leveeFonds: 'Limité',
                entreeAssocies: 'Possible',
                profilOptimal: 'Entrepreneur solo cherchant séparation patrimoine',
                avantages: 'Protection du patrimoine personnel, flexibilité fiscale',
                inconvenients: 'Formalisme, coûts de création',
                casConseille: 'Activité avec risques',
                casDeconseille: 'Petit CA sans risque',
                transmission: 'Oui',
                plafondCA: 'Aucun plafond',
                icone: 'fa-shield-alt'
            },
            {
                id: 'sasu',
                nom: 'SASU',
                categorie: 'Commerciale',
                associes: '1',
                capital: '1€ minimum',
                responsabilite: 'Limitée aux apports',
                fiscalite: 'IS',
                fiscaliteOption: 'Non',
                regimeSocial: 'Assimilé salarié',
                protectionPatrimoine: 'Oui',
                chargesSociales: 'Sur rémunération',
                fiscal: 'Dividendes possibles',
                regimeTVA: 'Oui',
                publicationComptes: 'Oui',
                formalites: 'Modérées',
                activite: 'Toutes',
                leveeFonds: 'Oui',
                entreeAssocies: 'Facile',
                profilOptimal: 'Entrepreneur solo cherchant statut salarié',
                avantages: 'Protection sociale du régime général, flexibilité statutaire',
                inconvenients: 'IS obligatoire, charges sociales élevées',
                casConseille: 'Salaire élevé, levée de fonds',
                casDeconseille: 'Petit CA',
                transmission: 'Oui',
                plafondCA: 'Aucun plafond',
                icone: 'fa-chart-line'
            },
            {
               id: 'sarl',
            nom: 'SARL',
              categorie: 'Commerciale',
          associes: '2-100',
  capital: '37 000 € (50% libéré à la constitution, solde dans les 5 ans)',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS (IR option 5 ans)',
  fiscaliteOption: 'Oui',
  regimeSocial: 'TNS (gérant majoritaire), Assimilé salarié (gérant minoritaire/égalitaire)',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Selon statut gérant',
  fiscal: 'Oui, selon IS/IR',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Toutes sauf réglementées',
  leveeFonds: 'Limité',
  entreeAssocies: 'Modéré',
  profilOptimal: 'PME familiale',
  avantages: 'Encadrement légal, sécurité',
  inconvenients: 'Moins flexible que SAS',
        casConseille: 'PME, activité familiale',
             casDeconseille: 'Start-up, levée de fonds',
           transmission: 'Oui',
           plafondCA: 'Aucun plafond',
           icone: 'fa-briefcase'
},              
             {
  id: 'sas',
  nom: 'SAS',
  categorie: 'Commerciale',
  associes: '2+',
  capital: '37 000 € (50% libéré à la constitution, solde dans les 5 ans)',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS (IR option 5 ans)',
  fiscaliteOption: 'Oui',
  regimeSocial: 'Assimilé salarié',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Sur rémunération',
  fiscal: 'Oui, selon IS/IR',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Toutes sauf réglementées',
  leveeFonds: 'Oui',
  entreeAssocies: 'Oui',
  profilOptimal: 'Start-up, investisseurs',
  avantages: 'Souplesse, levée de fonds',
  inconvenients: 'Charges sociales élevées',
  casConseille: 'Start-up, levée de fonds',
  casDeconseille: 'Professions réglementées',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-lightbulb'
},
              {
  id: 'sa',
  nom: 'SA',
  categorie: 'Commerciale',
  associes: '2 (non cotée), 7 (cotée)',
  capital: '37 000 € (50% libéré à la constitution, solde dans les 5 ans)',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS',
  fiscaliteOption: 'Non',
  regimeSocial: 'Assimilé salarié',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Sur rémunération',
  fiscal: 'Oui',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Complexes',
  activite: 'Grandes entreprises',
  leveeFonds: 'Oui',
  entreeAssocies: 'Oui',
  profilOptimal: 'Grands groupes, cotation',
  avantages: 'Accès capital, crédibilité',
  inconvenients: 'Complexité, coût',
  casConseille: 'Grande entreprise, cotation',
  casDeconseille: 'Petite structure',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-building'
},
            {
  id: 'sci',
  nom: 'SCI',
  categorie: 'Civile',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Indéfinie',
  fiscalite: 'IR (IS option)',
  fiscaliteOption: 'Oui',
  regimeSocial: 'TNS ou assimilé salarié',
  protectionPatrimoine: 'Non',
  chargesSociales: 'Selon statut',
  fiscal: 'Non concerné',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Gestion immobilière',
  leveeFonds: 'Non',
  entreeAssocies: 'Oui',
  profilOptimal: 'Gestion patrimoine immobilier',
  avantages: 'Transmission, souplesse',
  inconvenients: 'Responsabilité indéfinie',
  casConseille: 'Gestion immobilière',
  casDeconseille: 'Activité commerciale',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-home'
}, 
             {
  id: 'scp',
  nom: 'SCP',
  categorie: 'Civile',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Indéfinie et solidaire',
  fiscalite: 'IR',
  fiscaliteOption: 'Non',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Non',
  chargesSociales: 'Sur bénéfices',
  fiscal: 'Non concerné',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Professions libérales',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Professions libérales réglementées',
  avantages: 'Mutualisation moyens',
  inconvenients: 'Responsabilité indéfinie',
  casConseille: 'Professions libérales',
  casDeconseille: 'Activité commerciale',
  transmission: 'Non',
  plafondCA: 'Aucun plafond',
  icone: 'fa-briefcase-medical'
},
            {
  id: 'scm',
  nom: 'SCM',
  categorie: 'Civile',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Indéfinie',
  fiscalite: 'IR',
  fiscaliteOption: 'Non',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Non',
  chargesSociales: 'Sur bénéfices',
  fiscal: 'Non concerné',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Professions libérales',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Professions libérales mutualisant moyens',
  avantages: 'Mutualisation moyens',
  inconvenients: 'Pas de chiffre d'affaires propre',
  casConseille: 'Mutualisation moyens',
  casDeconseille: 'Activité commerciale',
  transmission: 'Non',
  plafondCA: 'Aucun plafond',
  icone: 'fa-tools'
},
             {
  id: 'sccv',
  nom: 'SCCV',
  categorie: 'Civile',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Indéfinie',
  fiscalite: 'IS',
  fiscaliteOption: 'Non',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Non',
  chargesSociales: 'Sur bénéfices',
  fiscal: 'Non concerné',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Construction vente immobilière',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Promotion immobilière',
  avantages: 'Fiscalité avantageuse',
  inconvenients: 'Responsabilité indéfinie',
  casConseille: 'Promotion immobilière',
  casDeconseille: 'Activité commerciale',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-hammer'
},
            {
  id: 'snc',
  nom: 'SNC',
  categorie: 'Commerciale',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Indéfinie et solidaire',
  fiscalite: 'IR (IS option)',
  fiscaliteOption: 'Oui',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Non',
  chargesSociales: 'Sur bénéfices',
  fiscal: 'Oui, selon IS/IR',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Toutes sauf réglementées',
  leveeFonds: 'Non',
  entreeAssocies: 'Difficile',
  profilOptimal: 'Confiance entre associés',
  avantages: 'Simplicité, confidentialité',
  inconvenients: 'Responsabilité lourde',
  casConseille: 'Activité familiale, confiance',
  casDeconseille: 'Projet risqué',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-users'
},
            {
  id: 'selarl',
  nom: 'SELARL',
  categorie: 'Libérale',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS',
  fiscaliteOption: 'Non',
  regimeSocial: 'TNS ou assimilé salarié',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Selon statut',
  fiscal: 'Oui',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Professions libérales réglementées',
  leveeFonds: 'Oui',
  entreeAssocies: 'Oui',
  profilOptimal: 'Professions libérales',
  avantages: 'Responsabilité limitée, souplesse',
  inconvenients: 'Formalisme',
  casConseille: 'Professions libérales',
  casDeconseille: 'Activité commerciale',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-user-md'
},
            {
  id: 'selas',
  nom: 'SELAS',
  categorie: 'Libérale',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS',
  fiscaliteOption: 'Non',
  regimeSocial: 'Assimilé salarié',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Sur rémunération',
  fiscal: 'Oui',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Professions libérales réglementées',
  leveeFonds: 'Oui',
  entreeAssocies: 'Oui',
  profilOptimal: 'Professions libérales',
  avantages: 'Souplesse statutaire',
  inconvenients: 'Charges sociales élevées',
  casConseille: 'Professions libérales',
  casDeconseille: 'Activité commerciale',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-stethoscope'
},
            {
  id: 'gaec',
  nom: 'GAEC',
  categorie: 'Agricole',
  associes: '2-10',
  capital: 'Libre',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IR',
  fiscaliteOption: 'Non',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Sur bénéfices',
  fiscal: 'Non concerné',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Activité agricole',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Exploitations agricoles collectives',
  avantages: 'Mutualisation moyens',
  inconvenients: 'Spécifique agriculture',
  casConseille: 'Exploitation agricole',
  casDeconseille: 'Hors agriculture',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-tractor'
},
            {
  id: 'earl',
  nom: 'EARL',
  categorie: 'Agricole',
  associes: '1+',
  capital: 'Libre',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IR (IS option)',
  fiscaliteOption: 'Oui',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Oui',
  chargesSociales: 'Sur bénéfices',
  fiscal: 'Non concerné',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Activité agricole',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Exploitations agricoles',
  avantages: 'Responsabilité limitée',
  inconvenients: 'Spécifique agriculture',
  casConseille: 'Exploitation agricole',
  casDeconseille: 'Hors agriculture',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-seedling'
},
            {
  id: 'gie',
  nom: 'GIE',
  categorie: 'Autre',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Selon statuts',
  fiscalite: 'IS ou IR',
  fiscaliteOption: 'Oui',
  regimeSocial: 'Selon statuts',
  protectionPatrimoine: 'Selon statuts',
  chargesSociales: 'Selon statuts',
  fiscal: 'Selon statuts',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Mutualisation moyens',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Entreprises souhaitant mutualiser',
  avantages: 'Mutualisation, flexibilité',
  inconvenients: 'Responsabilité selon statuts',
  casConseille: 'Mutualisation moyens',
  casDeconseille: 'Activité commerciale isolée',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-network-wired'
},    {
  id: 'gip',
  nom: 'GIP',
  categorie: 'Autre',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Selon statuts',
  fiscalite: 'IS ou IR',
  fiscaliteOption: 'Oui',
  regimeSocial: 'Selon statuts',
  protectionPatrimoine: 'Selon statuts',
  chargesSociales: 'Selon statuts',
  fiscal: 'Selon statuts',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Complexes',
  activite: 'Activité d'intérêt public',
  leveeFonds: 'Non',
  entreeAssocies: 'Modéré',
  profilOptimal: 'Partenariats public-privé',
  avantages: 'Mutualisation, intérêt public',
  inconvenients: 'Complexité',
  casConseille: 'Partenariats public-privé',
  casDeconseille: 'Activité commerciale isolée',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-handshake'
},{
  id: 'sca',
  nom: 'SCA',
  categorie: 'Commerciale',
  associes: '2+ (au moins deux associés)',
  capital: '37 000 € (5 commanditaires minimum)',
  responsabilite: 'Commandités (responsabilité illimitée) et commanditaires (responsabilité limitée à l'apport)',
  fiscalite: 'IS',
  fiscaliteOption: 'Non',
  regimeSocial: 'Assimilé salarié (commandité)',
  protectionPatrimoine: 'Non',
  chargesSociales: 'Sur rémunération',
  fiscal: 'Oui',
  regimeTVA: 'Oui',
  publicationComptes: 'Oui',
  formalites: 'Complexe',
  activite: 'Grandes entreprises uniquement',
  leveeFonds: 'Oui, levée de fonds possible',
  entreeAssocies: 'Oui',
  profilOptimal: 'Petite ou grande structure nécessitant une levée de fonds',
  avantages: 'Accès au capital, complexité, adapté aux grandes entreprises et parfois aux petites structures',
  inconvenients: 'Complexité, grande exigence administrative',
  casConseille: 'Petite ou grande structure nécessitant une levée de fonds',
  casDeconseille: 'Structures recherchant la simplicité',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  icone: 'fa-university'
}
            
        ],
        
        // Méthodes d'accès aux données
        getById: function(id) {
            return this.structures.find(forme => forme.id === id);
        },
        
        getCompatibleForms: function(criteres) {
            return this.structures.filter(forme => {
                // Filtrer les formes compatibles avec les critères
                if (criteres.associes && criteres.associes !== forme.associes) return false;
                // Autres critères de filtrage
                return true;
            });
        }
    };

    // Rendre FormeJuridiqueDB global pour entreprise-qcm.js
    window.FormeJuridiqueDB = FormeJuridiqueDB;

    // ===== MODULE 2: SYSTÈME DE SCORING CONTEXTUEL =====
    const ScoringEngine = {
        // Score maximal possible pour le calcul des pourcentages - augmenté pour plus de nuance
        SCORE_MAX: 200,
        
        // Pondérations de base pour les critères d'évaluation
        ponderation: {
            tmiActuel: 1.5,
            horizonProjet: 1.5,
            profilEntrepreneur: 1.5,
            typeActivite: 2.0,
            chiffreAffaires: 2.0,
            tauxMarge: 1.3,
            besoinRevenusImmediats: 1.5,
            cautionBancaire: 1.2,
            montantLevee: 1.0,
            regimeFiscal: 1.0,
            regimeSocial: 1.0,
            transmission: 0.8
        },
        
        /**
         * Ajuste les coefficients en fonction du contexte utilisateur
         */
        ajusterCoefficients: function(userResponses) {
            let coefficients = {...this.ponderation};
            
            // Facteurs d'ajustement contextuel
            // Par exemple: TMI élevé = plus d'importance à l'optimisation fiscale
            if (userResponses.tmiActuel >= 30) {
                coefficients.regimeFiscal = 2.5;
            }
            
            // Besoins de revenus immédiats = plus d'importance au salariat
            if (userResponses.besoinRevenusImmediats) {
                coefficients.besoinRevenusImmediats = 2.5;
            }
            
            // Bien immobilier existant = plus d'importance à la protection patrimoniale
            if (userResponses.bienImmobilier) {
                coefficients.cautionBancaire = 2.0;
            }
            
            // Levée de fonds importante = statut juridique adapté
            if (userResponses.montantLevee > 50000) {
                coefficients.montantLevee = 2.5;
            }
            
            // Marges faibles = plus attention aux charges sociales
            if (userResponses.tauxMarge < 20) {
                coefficients.tauxMarge = 2.0;
            }
            
            return coefficients;
        },
        
        /**
         * Calcule le score pour une forme juridique selon un profil utilisateur
         */
        calculerScore: function(forme, userResponses) {
            // Initialiser les scores par catégorie pour l'équilibre 60/40
            let scoreCriteresStructurels = 0;
            let scoreObjectifs = 0;
            
            let score = 0;
            let details = [];
            let scoreDetails = {}; // Pour l'affichage du détail des scores
            let incompatibilites = [];
            let incompatibiliteMajeure = false;

            // Récupérer les coefficients ajustés au contexte
            const coefficients = this.ajusterCoefficients(userResponses);

            // Vérifier si cette forme a une incompatibilité majeure
            if (window.hasHardFail(forme.id, window.checkHardFails(userResponses))) {
                // Si oui, score très bas et on l'indique comme incompatible
                incompatibiliteMajeure = true;
                
                // Récupérer les détails des incompatibilités
                incompatibilites = window.checkHardFails(userResponses)
                    .filter(fail => fail.formeId === forme.id);
            }
            
            // PARTIE STRUCTURELLE (60%)
            
            // TMI actuelle et fiscalité
            if (userResponses.tmiActuel <= 11 && forme.fiscalite === 'IR') {
                scoreCriteresStructurels += 20 * coefficients.tmiActuel;
                details.push('TMI faible: avantage fiscal avec régime IR');
            } else if (userResponses.tmiActuel >= 30 && forme.fiscalite === 'IS') {
                scoreCriteresStructurels += 20 * coefficients.tmiActuel;
                details.push('TMI élevée: optimisation via IS recommandée');
            } else if (userResponses.tmiActuel >= 30 && forme.fiscaliteOption === 'Oui') {
                scoreCriteresStructurels += 15 * coefficients.tmiActuel;
                details.push('TMI élevée: option fiscale avantageuse');
            }
            
            // Horizon projet
            if (userResponses.horizonProjet === 'court' && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels += 15 * coefficients.horizonProjet;
                details.push('Structure idéale pour projet à court terme');
            } else if (userResponses.horizonProjet === 'moyen' && 
                      (forme.id === 'eurl' || forme.id === 'sasu')) {
                scoreCriteresStructurels += 15 * coefficients.horizonProjet;
                details.push('Structure adaptée à un développement sur 3-5 ans');
            } else if (userResponses.horizonProjet === 'long' && 
                      (forme.id === 'sas' || forme.id === 'sarl' || forme.id === 'sa')) {
                scoreCriteresStructurels += 15 * coefficients.horizonProjet;
                details.push('Structure pérenne pour projet à long terme');
            }
            
            // Profil entrepreneur
            if (userResponses.profilEntrepreneur === 'solo' && forme.associes === '1') {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Forme adaptée aux entrepreneurs solos');
            } else if (userResponses.profilEntrepreneur === 'associes' && parseInt(forme.associes) > 1) {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Forme adaptée aux projets avec associés');
            } else if (userResponses.profilEntrepreneur === 'famille' && forme.id.includes('sarl')) {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Forme particulièrement adaptée aux projets familiaux');
            } else if (userResponses.profilEntrepreneur === 'investisseurs' && forme.leveeFonds === 'Oui') {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Structure idéale pour accueillir des investisseurs');
            }
            
            // Type d'activité et réglementation
            if (userResponses.typeActivite && forme.activite.includes(userResponses.typeActivite)) {
                scoreCriteresStructurels += 15 * coefficients.typeActivite;
                details.push(`Adapté aux activités ${userResponses.typeActivite}s`);
            }
            
            if (userResponses.activiteReglementee && userResponses.ordreProessionnel) {
                if (forme.id.includes('sel')) {
                    scoreCriteresStructurels += 25;
                    details.push('Structure spécifique pour professions réglementées avec ordre');
                } else if (forme.id === 'micro-entreprise') {
                    scoreCriteresStructurels -= 50; // Forte pénalité
                    details.push('Incompatible avec ordre professionnel');
                }
            } else if (userResponses.activiteReglementee && forme.id !== 'micro-entreprise') {
                scoreCriteresStructurels += 15;
                details.push('Compatible avec activité réglementée');
            }
            
            // Chiffre d'affaires et marge
            const seuils = {
                'bic-vente': 203100,
                'bic-service': 81500,
                'bnc': 81500,
                'artisanale': 203100,
                'agricole': 95000
            };
            
            const seuil = seuils[userResponses.typeActivite] || 81500;
            
            if (userResponses.chiffreAffaires < seuil * 0.7 && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels += 20 * coefficients.chiffreAffaires;
                details.push('CA compatible avec régime micro-entreprise');
            } else if (userResponses.chiffreAffaires >= seuil && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels -= 50; // Incompatibilité forte
                details.push('CA trop élevé pour régime micro-entreprise');
                
                // Ajouter une incompatibilité majeure
                if (!incompatibiliteMajeure) {
                    incompatibiliteMajeure = true;
                    incompatibilites.push({
                        code: 'ca-depasse-seuil',
                        message: `Le CA prévu (${userResponses.chiffreAffaires.toLocaleString('fr-FR')}€) dépasse le seuil micro-entreprise (${seuil.toLocaleString('fr-FR')}€)`,
                        details: 'Régime réel obligatoire'
                    });
                }
            } else if (userResponses.chiffreAffaires >= seuil && 
                      (forme.id === 'eurl' || forme.id === 'sasu' || forme.id === 'ei')) {
                scoreCriteresStructurels += 15 * coefficients.chiffreAffaires;
                details.push('Structure adaptée à ce niveau de CA');
            } else if (userResponses.chiffreAffaires >= seuil * 2 && 
                      (forme.id === 'sas' || forme.id === 'sarl' || forme.id === 'sa')) {
                scoreCriteresStructurels += 20 * coefficients.chiffreAffaires;
                details.push('Structure idéale pour les CA élevés');
            }
            
            // PARTIE OBJECTIFS (40%)
            
            // Marge brute
            if (userResponses.tauxMarge < 15) {
                // Marges faibles = avantage aux formes avec charges sociales plus faibles
                if (forme.id === 'micro-entreprise') {
                    scoreObjectifs += 15 * coefficients.tauxMarge;
                    details.push('Charges forfaitaires avantageuses avec marge faible');
                } else if (forme.id === 'sasu' || forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs -= 10 * coefficients.tauxMarge;
                    details.push('Charges sociales élevées avec marge faible');
                }
            } else if (userResponses.tauxMarge > 40) {
                // Marges élevées = avantage aux formes avec fiscalité optimisée
                if (forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui') {
                    scoreObjectifs += 15 * coefficients.tauxMarge;
                    details.push('Optimisation fiscale intéressante avec marge élevée');
                }
            }
            
            // Besoin de revenus immédiats
            if (userResponses.besoinRevenusImmediats) {
                if (forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs += 20 * coefficients.besoinRevenusImmediats;
                    details.push('Permet une rémunération immédiate par salaire');
                } else if (forme.id === 'micro-entreprise') {
                    scoreObjectifs += 15 * coefficients.besoinRevenusImmediats;
                    details.push('Versement immédiat du CA après prélèvements forfaitaires');
                } else if (forme.fiscalite === 'IS' && !forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs -= 10 * coefficients.besoinRevenusImmediats;
                    details.push('Moins adapté aux besoins de rémunération immédiate');
                }
            }
            
            // Protection patrimoniale et caution bancaire
            if (userResponses.cautionBancaire || userResponses.bienImmobilier) {
                if (forme.protectionPatrimoine === 'Oui') {
                    scoreObjectifs += 25 * coefficients.cautionBancaire;
                    details.push('Protection patrimoniale complète, idéale avec caution bancaire');
                } else if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
                    if (userResponses.bienImmobilier) {
                        scoreObjectifs -= 20 * coefficients.cautionBancaire;
                        details.push('Protection limitée pour votre patrimoine immobilier');
                    } else {
                        scoreObjectifs -= 10;
                        details.push('Protection patrimoniale partielle depuis 2022');
                    }
                }
            }
            
            // Montant de levée de fonds
            if (userResponses.montantLevee > 50000) {
                if (forme.leveeFonds === 'Oui') {
                    scoreObjectifs += 20 * coefficients.montantLevee;
                    details.push('Structure adaptée à la levée de fonds envisagée');
                } else {
                    scoreObjectifs -= 15 * coefficients.montantLevee;
                    details.push('Structure peu adaptée à la levée de fonds');
                }
            }
            
            // Type d'investisseurs
            if (userResponses.typeInvestisseurs && userResponses.typeInvestisseurs.includes && userResponses.typeInvestisseurs.includes('vc') && forme.id === 'sas') {
                scoreObjectifs += 15;
                details.push('Structure privilégiée par les fonds de capital-risque');
            } else if (userResponses.typeInvestisseurs && userResponses.typeInvestisseurs.includes && userResponses.typeInvestisseurs.includes('business-angels') && 
                      (forme.id === 'sas' || forme.id === 'sasu')) {
                scoreObjectifs += 10;
                details.push('Structure appréciée des business angels');
            }
            
            // Aides et dispositifs spécifiques
            if (userResponses.aides && userResponses.aides.includes && userResponses.aides.includes('jei') && forme.fiscalite === 'IS') {
                scoreObjectifs += 15;
                details.push('Éligible au statut JEI');
            }
            
            if (userResponses.aides && userResponses.aides.includes && userResponses.aides.includes('cir') && 
               (forme.id !== 'micro-entreprise' && forme.id !== 'ei')) {
                scoreObjectifs += 10;
                details.push('Structure compatible avec CIR/CII');
            }
            
            // Transmission/sortie
            if (userResponses.transmission === 'revente' && 
               (forme.id === 'sas' || forme.id === 'sa')) {
                scoreObjectifs += 15 * coefficients.transmission;
                details.push('Structure favorable à la revente future');
            } else if (userResponses.transmission === 'transmission' && 
                      (forme.id === 'sarl' || forme.id.includes('ei'))) {
                scoreObjectifs += 10 * coefficients.transmission;
                details.push('Structure adaptée à la transmission familiale');
            }
            
            // Régime fiscal préféré
            if (userResponses.regimeFiscal === 'ir' && forme.fiscalite === 'IR') {
                scoreObjectifs += 15 * coefficients.regimeFiscal;
                details.push('Correspond à votre préférence pour l\'IR');
            } else if (userResponses.regimeFiscal === 'is' && forme.fiscalite === 'IS') {
                scoreObjectifs += 15 * coefficients.regimeFiscal;
                details.push('Correspond à votre préférence pour l\'IS');
            } else if (userResponses.regimeFiscal === 'flexible' && forme.fiscaliteOption === 'Oui') {
                scoreObjectifs += 20 * coefficients.regimeFiscal;
                details.push('Offre la flexibilité fiscale souhaitée');
            }
            
            // Régime social préféré
            if (userResponses.regimeSocial === 'tns' && forme.regimeSocial.includes('TNS')) {
                scoreObjectifs += 15 * coefficients.regimeSocial;
                details.push('Correspond à votre préférence pour le statut TNS');
            } else if (userResponses.regimeSocial === 'salarie' && forme.regimeSocial.includes('salarié')) {
                scoreObjectifs += 15 * coefficients.regimeSocial;
                details.push('Correspond à votre préférence pour le statut assimilé-salarié');
            }
            
            // Score total
            score = scoreCriteresStructurels + scoreObjectifs;
            
            // Stocker les scores détaillés pour l'affichage
            scoreDetails = {
                criteres: scoreCriteresStructurels,
                objectifs: scoreObjectifs,
                total: score,
                pourcentage: Math.round((score / this.SCORE_MAX) * 100)
            };

            // Déterminer la catégorie de compatibilité
            let compatibilite;
            if (incompatibiliteMajeure) {
                compatibilite = 'INCOMPATIBLE';
                score = -100; // Score très négatif pour les incompatibles
            } else if (score < 0) {
                compatibilite = 'DÉCONSEILLÉ';
            } else if (score / this.SCORE_MAX < 0.60) {
                compatibilite = 'PEU ADAPTÉ';
            } else if (score / this.SCORE_MAX < 0.85) {
                compatibilite = 'COMPATIBLE';
            } else {
                compatibilite = 'RECOMMANDÉ';
            }
            
            return {
                forme: forme,
                score: score,
                scoreOriginal: score,
                scoreCriteresStructurels: scoreCriteresStructurels,
                scoreObjectifs: scoreObjectifs,
                details: details,
                scoreDetails: scoreDetails,
                compatibilite: compatibilite,
                incompatibilites: incompatibilites,
                incompatibiliteMajeure: incompatibiliteMajeure
            };
        }
    };

    /* 
     * NOTE: Les fonctions de vérification des incompatibilités (checkHardFails et hasHardFail)
     * ont été déplacées dans entreprise-qcm.js pour réduire la taille de ce fichier
     */

    // ===== MODULE 5: GESTIONNAIRE DES RÉSULTATS =====
    const ResultsManager = {
        // Options de simulation avancées
        simulationParams: {
            ratioSalaire: 50,
            ratioDividendes: 50,
            capitalSocial: 10000,
            capitalLibere: 100,
            caSimulation: 50000,
            fraisReels: 35,
            acreActif: true,
            afficherProjection: false
        },
        
        // Initialisation
        init: function() {
            // Initialisation des paramètres avancés
            this.initAdvancedParams();
            
            // Écouteurs d'événements pour les paramètres
            const applyParamsButton = document.getElementById('apply-params');
            if (applyParamsButton) {
                applyParamsButton.addEventListener('click', this.applyAdvancedParams.bind(this));
            }
        },
        
        // Initialisation des paramètres avancés
        initAdvancedParams: function() {
            const ratioSalaireValue = document.getElementById('ratio-salaire-value');
            const ratioDividendesValue = document.getElementById('ratio-dividendes-value');
            const capitalSocialInput = document.getElementById('capital-social');
            const capitalLibereValue = document.getElementById('capital-libere-value');
            const caSimulationInput = document.getElementById('ca-simulation');
            const fraisReelsInput = document.getElementById('frais-reels');
            const acreCheckbox = document.getElementById('acre-checkbox');
            
            if (ratioSalaireValue) ratioSalaireValue.textContent = `${this.simulationParams.ratioSalaire}%`;
            if (ratioDividendesValue) ratioDividendesValue.textContent = `${this.simulationParams.ratioDividendes}%`;
            if (capitalSocialInput) capitalSocialInput.value = this.simulationParams.capitalSocial;
            if (capitalLibereValue) capitalLibereValue.textContent = `${this.simulationParams.capitalLibere}%`;
            if (caSimulationInput) caSimulationInput.value = this.simulationParams.caSimulation;
            if (fraisReelsInput) fraisReelsInput.value = this.simulationParams.fraisReels;
            if (acreCheckbox) acreCheckbox.checked = this.simulationParams.acreActif;
            
            // Mise à jour du ratio salaire/dividendes
            const ratioSalaireSlider = document.getElementById('ratio-salaire');
            if (ratioSalaireSlider) {
                ratioSalaireSlider.addEventListener('input', this.updateRatioValues.bind(this));
            }
            
            // Mise à jour du capital libéré
            const capitalLibereSlider = document.getElementById('capital-libere');
            if (capitalLibereSlider) {
                capitalLibereSlider.addEventListener('input', this.updateCapitalLibereValue.bind(this));
            }
        },
        
        // Mise à jour des valeurs du ratio salaire/dividendes
        updateRatioValues: function() {
            const ratioSalaireSlider = document.getElementById('ratio-salaire');
            const ratioDividendesValue = document.getElementById('ratio-dividendes-value');
            const ratioSalaireValue = document.getElementById('ratio-salaire-value');
            
            if (!ratioSalaireSlider || !ratioDividendesValue || !ratioSalaireValue) return;
            
            const ratioSalaire = parseInt(ratioSalaireSlider.value);
            const ratioDividendes = 100 - ratioSalaire;
            
            ratioSalaireValue.textContent = `${ratioSalaire}%`;
            ratioDividendesValue.textContent = `${ratioDividendes}%`;
        },
        
        // Mise à jour de la valeur du capital libéré
        updateCapitalLibereValue: function() {
            const capitalLibereSlider = document.getElementById('capital-libere');
            const capitalLibereValue = document.getElementById('capital-libere-value');
            
            if (!capitalLibereSlider || !capitalLibereValue) return;
            
            const value = parseInt(capitalLibereSlider.value);
            capitalLibereValue.textContent = `${value}%`;
        },
        
        // Appliquer les paramètres avancés
        applyAdvancedParams: function() {
            const ratioSalaireSlider = document.getElementById('ratio-salaire');
            const capitalSocialInput = document.getElementById('capital-social');
            const capitalLibereSlider = document.getElementById('capital-libere');
            const caSimulationInput = document.getElementById('ca-simulation');
            const fraisReelsInput = document.getElementById('frais-reels');
            const acreCheckbox = document.getElementById('acre-checkbox');
            const projectionsCheckbox = document.getElementById('projections-pluriannuelles');
            
            if (!ratioSalaireSlider || !capitalSocialInput || !capitalLibereSlider || !caSimulationInput) return;
            
            this.simulationParams.ratioSalaire = parseInt(ratioSalaireSlider.value);
            this.simulationParams.ratioDividendes = 100 - this.simulationParams.ratioSalaire;
            this.simulationParams.capitalSocial = parseInt(capitalSocialInput.value);
            this.simulationParams.capitalLibere = parseInt(capitalLibereSlider.value);
            this.simulationParams.caSimulation = parseInt(caSimulationInput.value);
            
            if (fraisReelsInput) {
                this.simulationParams.fraisReels = parseInt(fraisReelsInput.value);
            }
            
            if (acreCheckbox) {
                this.simulationParams.acreActif = acreCheckbox.checked;
            }
            
            if (projectionsCheckbox) {
                this.simulationParams.afficherProjection = projectionsCheckbox.checked;
            }
            
            // Récupérer le type d'activité depuis les réponses sauvegardées
            this.simulationParams.natureActivite = userResponses.typeActivite;
            
            // Recalculer les résultats avec les nouveaux paramètres
            this.generateResults();
            
            // Notification à l'utilisateur
            const notification = document.createElement('div');
            notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
            notification.textContent = 'Paramètres appliqués et résultats recalculés';
            document.body.appendChild(notification);
            
            // Disparaitre après 3 secondes
            setTimeout(() => {
                notification.remove();
            }, 3000);
        },
        
        // Génére les résultats
        generateResults: function(customParams) {
            const resultsContainer = document.getElementById('results-container');
            if (!resultsContainer) return;
            
            // Vérifier si le module fiscal est chargé
            if (!window.checkHardFails || !window.SimulationsFiscales) {
                console.error('Module fiscal-simulation.js non chargé');
                alert('Erreur: Module de simulation fiscale non disponible.');
                return;
            }
            
            // Si des paramètres personnalisés sont fournis, les utiliser
            if (customParams) {
                Object.assign(this.simulationParams, customParams);
            }
            
            // Afficher l'indicateur de chargement
            resultsContainer.innerHTML = `
                <div class="flex justify-center items-center py-10">
                    <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-400"></div>
                </div>
            `;
            
            // Calculer les scores pour chaque forme juridique
            const results = FormeJuridiqueDB.structures.map(forme => {
                // Calculer le score avec le moteur de scoring amélioré
                const scoreResult = ScoringEngine.calculerScore(forme, userResponses);
                
                // Ajouter la simulation financière
                const simulation = window.SimulationsFiscales.simulerImpactFiscal(forme, this.simulationParams.caSimulation, {
                    ratioSalaire: this.simulationParams.ratioSalaire,
                    ratioDividendes: this.simulationParams.ratioDividendes,
                    capitalSocial: this.simulationParams.capitalSocial,
                    capitalLibere: this.simulationParams.capitalLibere,
                    fraisReels: this.simulationParams.fraisReels,
                    acreActif: this.simulationParams.acreActif,
                    tmiActuel: userResponses.tmiActuel,
                    tauxMarge: userResponses.tauxMarge,
                    typeActivite: userResponses.typeActivite
                });
                
                return {
                    ...scoreResult,
                    simulation: simulation
                };
            });

            // Grouper les résultats
            const resultatsRecommandes = results.filter(r => r.compatibilite === 'RECOMMANDÉ');
            const resultatsCompatibles = results.filter(r => r.compatibilite === 'COMPATIBLE');
            const resultatsPeuAdaptes = results.filter(r => r.compatibilite === 'PEU ADAPTÉ');
            const resultatsDeconseilles = results.filter(r => r.compatibilite === 'DÉCONSEILLÉ');
            const resultatsIncompatibles = results.filter(r => r.compatibilite === 'INCOMPATIBLE');

            // Trier chaque groupe par score
            resultatsRecommandes.sort((a, b) => b.score - a.score);
            resultatsCompatibles.sort((a, b) => b.score - a.score);
            resultatsPeuAdaptes.sort((a, b) => b.score - a.score);
            resultatsDeconseilles.sort((a, b) => b.score - a.score);
            resultatsIncompatibles.sort((a, b) => b.score - a.score);

            // Regrouper pour affichage principal (sans les incompatibles)
            const resultatsAffichage = [...resultatsRecommandes, ...resultatsCompatibles, ...resultatsPeuAdaptes].slice(0, 3);

            // Afficher les résultats
            this.displayResults(resultatsAffichage, resultatsIncompatibles);
            
            // Préparer les données du tableau comparatif complet
            this.prepareComparatifTable(FormeJuridiqueDB.structures);
            
            // Rendre visible les boutons d'export
            const exportButtons = document.getElementById('export-buttons');
            if (exportButtons) {
                exportButtons.style.display = 'flex';
            }
            
            // Déclencher un événement pour signaler que les résultats sont chargés
            document.dispatchEvent(new CustomEvent('resultsLoaded'));
            
            // Retourner tous les résultats pour référence
            return {
                recommandes: resultatsRecommandes,
                compatibles: resultatsCompatibles,
                peuAdaptes: resultatsPeuAdaptes,
                deconseilles: resultatsDeconseilles,
                incompatibles: resultatsIncompatibles
            };
        }
    };
    
    // Variables globales
    window.userResponses = {};

    // Initialiser les modules lorsque le DOM est chargé
    document.addEventListener('DOMContentLoaded', function() {
        // Ne pas initialiser FormManager ici - géré par entreprise-qcm.js
        // Rendre FormeJuridiqueDB disponible globalement
        window.FormeJuridiqueDB = FormeJuridiqueDB;
    });
});
