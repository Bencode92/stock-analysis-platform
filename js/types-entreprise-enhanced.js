/**
 * Simulateur de forme juridique d'entreprise - VERSION AMÉLIORÉE
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire, avec une analyse multidimensionnelle.
 * Améliorations: analyse sectorielle, facteurs discriminants, plan d'évolution, explication transparente
 * Dernière mise à jour : Avril 2025 - Information vérifiées pour la législation en vigueur
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log("Initialisation du simulateur de forme juridique amélioré...");
    
    // Base de données des formes juridiques mise à jour avec données vérifiées 2025
    const formesJuridiques = [
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
            inconvenients: 'Plafond CA (188 700 € vente ou 77 700 € services), abattement forfaitaire au lieu de déduction réelle',
            casConseille: 'Début d\'activité, test',
            casDeconseille: 'Développement ambitieux',
            transmission: 'Non',
            plafondCA: '188 700 € (vente/hébergement) ou 77 700 € (services/libérales)',
            maxRevenue: 188700, // Nouvelle propriété pour les filtres
            allowsInvestment: false, // Nouvelle propriété pour les filtres
            compatibleWithRegulated: false, // Nouvelle propriété pour les filtres
            allowsIPProtection: false, // Nouvelle propriété pour les filtres
            exitStrategies: ['Cessation'], // Nouvelle propriété pour les filtres
            growth: 1, // Note de 1 à 5 pour possibilité de croissance
            adminComplexity: 1, // Note de 1 à 5 pour complexité administrative
            icone: 'fa-rocket',
            // Nouvelles propriétés pour les dimensions
            dimensionScores: {
                fiscal: 3, // 1-5
                operational: 5, // 1-5
                patrimonial: 3, // 1-5
                growth: 1 // 1-5
            }
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
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: false,
            allowsIPProtection: false,
            exitStrategies: ['Cessation'],
            growth: 2,
            adminComplexity: 2,
            icone: 'fa-user',
            dimensionScores: {
                fiscal: 2,
                operational: 4,
                patrimonial: 2,
                growth: 2
            }
        },
        {
            id: 'eurl',
            nom: 'EURL',
            categorie: 'Commerciale',
            associes: '1',
            capital: 'Libre (1€ suffit)',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
            fiscalite: 'IR (IS option)',
            fiscaliteOption: 'Oui (option IS limitée à 5 exercices)',
            regimeSocial: 'TNS obligatoire',
            protectionPatrimoine: 'Oui',
            chargesSociales: 'Sur bénéfices ou rémunération',
            fiscal: 'Oui, selon IS/IR',
            regimeTVA: 'Oui',
            publicationComptes: 'Oui',
            formalites: 'Standard',
            activite: 'Toutes sauf réglementées',
            leveeFonds: 'Non',
            entreeAssocies: 'Oui',
            profilOptimal: 'Entrepreneur solo voulant société',
            avantages: 'Responsabilité limitée, souplesse',
            inconvenients: 'Formalisme, coût',
            casConseille: 'PME, activité récurrente',
            casDeconseille: 'Projet risqué seul',
            transmission: 'Oui',
            plafondCA: 'Aucun plafond',
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['Transmission', 'Cession'],
            growth: 3,
            adminComplexity: 3,
            icone: 'fa-building',
            dimensionScores: {
                fiscal: 4,
                operational: 3,
                patrimonial: 4,
                growth: 3
            }
        },
        {
            id: 'sasu',
            nom: 'SASU',
            categorie: 'Commerciale',
            associes: '1',
            capital: 'Libre (1€ suffit)',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
            fiscalite: 'IS (IR option 5 ans)',
            fiscaliteOption: 'Oui (option IR limitée à 5 exercices)',
            regimeSocial: 'Assimilé salarié obligatoire',
            protectionPatrimoine: 'Oui',
            chargesSociales: 'Sur rémunération (pas de cotisation chômage)',
            fiscal: 'Oui, selon IS/IR',
            regimeTVA: 'Oui',
            publicationComptes: 'Oui',
            formalites: 'Standard',
            activite: 'Toutes sauf réglementées',
            leveeFonds: 'Oui',
            entreeAssocies: 'Oui',
            profilOptimal: 'Entrepreneur solo voulant flexibilité',
            avantages: 'Souplesse statutaire, protection sociale',
            inconvenients: 'Charges sociales élevées',
            casConseille: 'Start-up, levée de fonds',
            casDeconseille: 'Projets à très faibles revenus ou où les charges sociales doivent être minimisées',
            transmission: 'Oui',
            plafondCA: 'Aucun plafond (taux IS réduit à 15% sur les premiers 42 500€ de bénéfices si CA < 10M€)',
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['Cession', 'IPO', 'Transmission'],
            growth: 5,
            adminComplexity: 3,
            icone: 'fa-chart-line',
            dimensionScores: {
                fiscal: 4,
                operational: 3,
                patrimonial: 5,
                growth: 5
            }
        },
        {
            id: 'sarl',
            nom: 'SARL',
            categorie: 'Commerciale',
            associes: '2-100',
            capital: 'Libre (1€ suffit)',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
            fiscalite: 'IS (IR option 5 ans)',
            fiscaliteOption: 'Oui (option IR limitée à 5 exercices)',
            regimeSocial: 'TNS si gérant majoritaire, Assimilé salarié si gérant minoritaire/égalitaire',
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
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['Transmission', 'Cession'],
            growth: 4,
            adminComplexity: 4,
            icone: 'fa-users',
            dimensionScores: {
                fiscal: 3,
                operational: 3,
                patrimonial: 4,
                growth: 3
            }
        },
        {
            id: 'sas',
            nom: 'SAS',
            categorie: 'Commerciale',
            associes: '2+',
            capital: 'Libre (1€ suffit)',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
            fiscalite: 'IS (IR option 5 ans)',
            fiscaliteOption: 'Oui (option IR limitée à 5 exercices)',
            regimeSocial: 'Assimilé salarié (pas de cotisation chômage)',
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
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['Cession', 'IPO', 'Transmission'],
            growth: 5,
            adminComplexity: 4,
            icone: 'fa-rocket',
            dimensionScores: {
                fiscal: 4,
                operational: 2,
                patrimonial: 5,
                growth: 5
            }
        },
        {
            id: 'sa',
            nom: 'SA',
            categorie: 'Commerciale',
            associes: '2 (non cotée), 7 (cotée)',
            capital: '37 000 €',
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
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['IPO', 'Cession', 'Transmission'],
            growth: 5,
            adminComplexity: 5,
            icone: 'fa-chart-bar',
            dimensionScores: {
                fiscal: 3,
                operational: 1,
                patrimonial: 5,
                growth: 5
            }
        },
        {
            id: 'sci',
            nom: 'SCI',
            categorie: 'Civile',
            associes: '2+',
            capital: 'Libre',
            responsabilite: 'Indéfinie mais non solidaire (sauf clause contraire)',
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
            plafondCA: 'Aucun plafond (fiscalité à l\'IR par défaut, option IS possible sans restriction CA)',
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: false,
            allowsIPProtection: false,
            exitStrategies: ['Transmission'],
            growth: 2,
            adminComplexity: 3,
            icone: 'fa-home',
            dimensionScores: {
                fiscal: 4,
                operational: 2,
                patrimonial: 2,
                growth: 2
            }
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
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: true,
            allowsIPProtection: false,
            exitStrategies: ['Transmission'],
            growth: 2,
            adminComplexity: 3,
            icone: 'fa-briefcase',
            dimensionScores: {
                fiscal: 2,
                operational: 3,
                patrimonial: 1,
                growth: 2
            }
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
            inconvenients: 'Pas de CA propre',
            casConseille: 'Mutualisation moyens',
            casDeconseille: 'Activité commerciale',
            transmission: 'Non',
            plafondCA: 'Aucun plafond',
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: true,
            allowsIPProtection: false,
            exitStrategies: ['Transmission'],
            growth: 1,
            adminComplexity: 3,
            icone: 'fa-users-cog',
            dimensionScores: {
                fiscal: 2,
                operational: 3,
                patrimonial: 1,
                growth: 1
            }
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
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: false,
            allowsIPProtection: false,
            exitStrategies: ['Cessation'],
            growth: 3,
            adminComplexity: 4,
            icone: 'fa-building',
            dimensionScores: {
                fiscal: 3,
                operational: 2,
                patrimonial: 1,
                growth: 3
            }
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
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: false,
            allowsIPProtection: false,
            exitStrategies: ['Transmission'],
            growth: 3,
            adminComplexity: 3,
            icone: 'fa-handshake',
            dimensionScores: {
                fiscal: 3,
                operational: 3,
                patrimonial: 1,
                growth: 2
            }
        },
        {
            id: 'sca',
            nom: 'SCA',
            categorie: 'Commerciale',
            associes: '2+',
            capital: '37 000 €',
            responsabilite: 'Commandités: indéfinie, commanditaires: limitée',
            fiscalite: 'IS',
            fiscaliteOption: 'Non',
            regimeSocial: 'Assimilé salarié',
            protectionPatrimoine: 'Oui (commanditaires)',
            chargesSociales: 'Sur rémunération',
            fiscal: 'Oui',
            regimeTVA: 'Oui',
            publicationComptes: 'Oui',
            formalites: 'Complexes',
            activite: 'Grandes entreprises',
            leveeFonds: 'Oui',
            entreeAssocies: 'Oui',
            profilOptimal: 'Levée de fonds, structure complexe',
            avantages: 'Accès capital, souplesse',
            inconvenients: 'Complexité, coût',
            casConseille: 'Grande entreprise, levée de fonds',
            casDeconseille: 'Petite structure',
            transmission: 'Oui',
            plafondCA: 'Aucun plafond',
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['IPO', 'Cession'],
            growth: 5,
            adminComplexity: 5,
            icone: 'fa-balance-scale',
            dimensionScores: {
                fiscal: 3,
                operational: 1,
                patrimonial: 4,
                growth: 5
            }
        },
        {
            id: 'selarl',
            nom: 'SELARL',
            categorie: 'Libérale',
            associes: '2+',
            capital: 'Libre',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
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
            plafondCA: 'Aucun plafond (régime IS obligatoire)',
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['Transmission', 'Cession'],
            growth: 4,
            adminComplexity: 4,
            icone: 'fa-user-md',
            dimensionScores: {
                fiscal: 3,
                operational: 2,
                patrimonial: 4,
                growth: 4
            }
        },
        {
            id: 'selas',
            nom: 'SELAS',
            categorie: 'Libérale',
            associes: '2+',
            capital: 'Libre',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
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
            plafondCA: 'Aucun plafond (régime IS obligatoire)',
            maxRevenue: Infinity,
            allowsInvestment: true,
            compatibleWithRegulated: true,
            allowsIPProtection: true,
            exitStrategies: ['Transmission', 'Cession'],
            growth: 4,
            adminComplexity: 4,
            icone: 'fa-user-md',
            dimensionScores: {
                fiscal: 3,
                operational: 2,
                patrimonial: 5,
                growth: 4
            }
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
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: false,
            allowsIPProtection: false,
            exitStrategies: ['Transmission'],
            growth: 3,
            adminComplexity: 3,
            icone: 'fa-seedling',
            dimensionScores: {
                fiscal: 3,
                operational: 3,
                patrimonial: 3,
                growth: 3
            }
        },
        {
            id: 'earl',
            nom: 'EARL',
            categorie: 'Agricole',
            associes: '1-10',
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
            plafondCA: 'Aucun plafond (régime IR/IS selon option sans seuil CA)',
            maxRevenue: Infinity,
            allowsInvestment: false,
            compatibleWithRegulated: false,
            allowsIPProtection: false,
            exitStrategies: ['Transmission'],
            growth: 3,
            adminComplexity: 3,
            icone: 'fa-tractor',
            dimensionScores: {
                fiscal: 3,
                operational: 3,
                patrimonial: 4,
                growth: 3
            }
        }
    ];

    // AMÉLIORATION: Base de connaissances des profils sectoriels
    const sectorProfiles = {
        "tech_startup": {
            name: "Startup technologique",
            recommended: ["sas", "sasu"],
            avoid: ["micro-entreprise", "ei", "sci", "scm"],
            keyFactors: ["Levée de fonds", "Croissance rapide", "Protection IP"],
            specificQuestions: ["Prévoyez-vous de déposer des brevets?", "Envisagez-vous des stock-options pour vos collaborateurs?"],
            criteriaWeights: {
                fiscal: 0.2,
                operational: 0.1,
                patrimonial: 0.2,
                growth: 0.5
            },
            evolutionPlan: [
                {
                    timeframe: "Démarrage",
                    options: ["micro-entreprise", "sasu"],
                    reasoning: "Valider le concept avec structure légère ou préparer levée de fonds"
                },
                {
                    timeframe: "Développement",
                    options: ["sas"],
                    reasoning: "Intégrer des investisseurs, recruter, scaler"
                },
                {
                    timeframe: "Maturité",
                    options: ["sa"],
                    reasoning: "Possible introduction en bourse ou cession"
                }
            ]
        },
        "artisan": {
            name: "Artisanat traditionnel",
            recommended: ["micro-entreprise", "ei", "eurl"],
            avoid: ["sa", "sas", "sci"],
            keyFactors: ["Simplicité administrative", "Charges réduites", "Transmission patrimoniale"],
            specificQuestions: ["Avez-vous besoin du statut d'artisan?", "Envisagez-vous de transmettre votre activité?"],
            criteriaWeights: {
                fiscal: 0.3,
                operational: 0.4,
                patrimonial: 0.2,
                growth: 0.1
            },
            evolutionPlan: [
                {
                    timeframe: "Démarrage",
                    options: ["micro-entreprise"],
                    reasoning: "Tester l'activité avec minimum de charges et de formalités"
                },
                {
                    timeframe: "Développement",
                    options: ["eurl", "ei"],
                    reasoning: "Structure plus adaptée au développement/recrutement"
                },
                {
                    timeframe: "Transmission",
                    options: ["eurl", "sarl"],
                    reasoning: "Facilite la transmission familiale ou la cession"
                }
            ]
        },
        "ecommerce": {
            name: "E-commerce & Vente en ligne",
            recommended: ["eurl", "sasu", "sarl"],
            avoid: ["micro-entreprise", "sci"],
            keyFactors: ["Gestion de stocks", "Logistique", "Scalabilité"],
            specificQuestions: ["Quel volume de ventes annuel visez-vous?", "Prévoyez-vous de l'import/export?"],
            criteriaWeights: {
                fiscal: 0.3,
                operational: 0.2,
                patrimonial: 0.2,
                growth: 0.3
            },
            evolutionPlan: [
                {
                    timeframe: "Test de marché",
                    options: ["micro-entreprise"],
                    reasoning: "Tester la viabilité du concept"
                },
                {
                    timeframe: "Croissance initiale",
                    options: ["eurl", "sasu"],
                    reasoning: "Gestion de la TVA et meilleure crédibilité fournisseurs"
                },
                {
                    timeframe: "Expansion",
                    options: ["sas", "sarl"],
                    reasoning: "Structure adaptée à la croissance et aux partenariats internationaux"
                }
            ]
        },
        "liberal_profession": {
            name: "Profession libérale",
            recommended: ["eurl", "selarl", "selas"],
            avoid: ["micro-entreprise", "sci", "sa"],
            keyFactors: ["Réglementation professionnelle", "Indépendance", "Fiscalité"],
            specificQuestions: ["Votre profession est-elle réglementée?", "Souhaitez-vous vous associer à terme?"],
            criteriaWeights: {
                fiscal: 0.3,
                operational: 0.2,
                patrimonial: 0.4,
                growth: 0.1
            },
            evolutionPlan: [
                {
                    timeframe: "Installation",
                    options: ["ei", "micro-entreprise"],
                    reasoning: "Démarrage avec structure légère (selon réglementation)"
                },
                {
                    timeframe: "Développement de clientèle",
                    options: ["eurl", "scp"],
                    reasoning: "Structure adaptée à l'exercice individuel établi"
                },
                {
                    timeframe: "Association",
                    options: ["selarl", "selas"],
                    reasoning: "Structure optimale pour l'exercice en groupe"
                }
            ]
        },
        "real_estate": {
            name: "Immobilier & Construction",
            recommended: ["sci", "sccv", "sarl", "sas"],
            avoid: ["micro-entreprise", "ei"],
            keyFactors: ["Fiscalité immobilière", "Patrimoine", "Financement"],
            specificQuestions: ["S'agit-il de gestion locative ou de promotion?", "Est-ce un patrimoine familial?"],
            criteriaWeights: {
                fiscal: 0.4,
                operational: 0.1,
                patrimonial: 0.4,
                growth: 0.1
            },
            evolutionPlan: [
                {
                    timeframe: "Premier investissement",
                    options: ["sci"],
                    reasoning: "Optimisation fiscale et patrimoniale"
                },
                {
                    timeframe: "Développement",
                    options: ["sci", "sccv"],
                    reasoning: "Structure adaptée aux opérations plus importantes"
                },
                {
                    timeframe: "Professionnalisation",
                    options: ["sas", "sarl"],
                    reasoning: "Pour activité commerciale de promotion/gestion"
                }
            ]
        },
        "consulting": {
            name: "Conseil & Freelance",
            recommended: ["micro-entreprise", "eurl", "sasu"],
            avoid: ["sa", "snc", "sci"],
            keyFactors: ["Simplicité", "Optimisation fiscale", "Image"],
            specificQuestions: ["Quel niveau de chiffre d'affaires prévoyez-vous?", "Travaillerez-vous avec de grands comptes?"],
            criteriaWeights: {
                fiscal: 0.4,
                operational: 0.3,
                patrimonial: 0.1,
                growth: 0.2
            },
            evolutionPlan: [
                {
                    timeframe: "Lancement",
                    options: ["micro-entreprise"],
                    reasoning: "Test de l'activité avec simplicité maximale"
                },
                {
                    timeframe: "Développement",
                    options: ["eurl", "sasu"],
                    reasoning: "Optimisation fiscale et sociale, meilleure crédibilité"
                },
                {
                    timeframe: "Expansion",
                    options: ["sas", "sarl"],
                    reasoning: "Structure pour intégrer de nouveaux consultants ou créer des offres"
                }
            ]
        },
        "retail": {
            name: "Commerce de détail",
            recommended: ["eurl", "sarl", "sas"],
            avoid: ["micro-entreprise", "sci"],
            keyFactors: ["Local commercial", "Stocks", "Personnel"],
            specificQuestions: ["Prévoyez-vous d'embaucher rapidement?", "Avez-vous besoin d'un bail commercial?"],
            criteriaWeights: {
                fiscal: 0.2,
                operational: 0.4,
                patrimonial: 0.2,
                growth: 0.2
            },
            evolutionPlan: [
                {
                    timeframe: "Lancement",
                    options: ["eurl", "ei"],
                    reasoning: "Structure adaptée aux contraintes du commerce physique"
                },
                {
                    timeframe: "Développement",
                    options: ["sarl", "sas"],
                    reasoning: "Pour l'embauche et le développement commercial"
                },
                {
                    timeframe: "Expansion",
                    options: ["sas"],
                    reasoning: "Pour multi-boutiques ou franchise"
                }
            ]
        },
        "restaurant": {
            name: "Restauration & Food",
            recommended: ["eurl", "sarl", "sas"],
            avoid: ["micro-entreprise", "sci"],
            keyFactors: ["Personnel", "Investissement initial", "Réglementation"],
            specificQuestions: ["Combien d'employés prévoyez-vous?", "Est-ce un concept susceptible de se développer?"],
            criteriaWeights: {
                fiscal: 0.2,
                operational: 0.4,
                patrimonial: 0.1,
                growth: 0.3
            },
            evolutionPlan: [
                {
                    timeframe: "Concept test (food truck)",
                    options: ["micro-entreprise", "ei"],
                    reasoning: "Tester le concept avec un investissement limité"
                },
                {
                    timeframe: "Restaurant établi",
                    options: ["sarl", "eurl"],
                    reasoning: "Structure adaptée à la restauration traditionnelle"
                },
                {
                    timeframe: "Développement",
                    options: ["sas"],
                    reasoning: "Pour multiple établissements ou franchise"
                }
            ]
        }
    };

    // AMÉLIORATION: Variables pour stocker les réponses utilisateur avec de nouveaux champs
    let userResponses = {
        // Données de base
        profilEntrepreneur: null, // solo, famille, associes, investisseurs
        protectionPatrimoine: 3,  // 1-5
        typeActivite: null,       // commerciale, liberale, artisanale, agricole
        activiteReglementee: false,
        chiffreAffaires: null,    // faible, moyen, eleve
        
        // Données améliorées
        secteurActivite: null,    // NOUVEAU: tech_startup, artisan, ecommerce, etc.
        nombreAssociesActifs: 1,  // NOUVEAU: nombre d'associés opérationnels
        nombreInvestisseurs: 0,   // NOUVEAU: nombre d'investisseurs passifs
        proprieteIntellectuelle: false, // NOUVEAU: besoin de protection PI
        strategieSortie: null,    // NOUVEAU: transmission, cession, IPO
        horizonDeveloppement: 3,  // NOUVEAU: années avant développement significatif
        
        // Données fiscales et structure
        objectifs: [],
        objectifsPriorite: [],
        remuneration: null,
        risque: 3,
        regimeFiscal: null,
        regimeSocial: null,
        
        // Critères pondérés
        criteresImportance: {
            simplicite: 1,
            cout: 1,
            credibilite: 1,
            protection: 1,
            fiscalite: 1,
            croissance: 1
        }
    };

    // FONCTION PRINCIPALE AMÉLIORÉE: Analyse les formes juridiques selon l'approche multidimensionnelle
    function analyzeBusinessForm(responses) {
        console.log("Analyse des formes juridiques avec le nouvel algorithme...");
        
        // 1. Appliquer d'abord des filtres éliminatoires absolus
        let eligibleForms = formesJuridiques.filter(form => {
            // Filtres bloquants
            
            // Dépassement de CA pour micro-entreprise
            if (responses.chiffreAffaires === 'eleve' && form.id === 'micro-entreprise') {
                console.log("Forme exclue (CA): " + form.nom);
                return false;
            }
            
            // Besoin de levée de fonds mais structure incompatible
            if (responses.profilEntrepreneur === 'investisseurs' && form.allowsInvestment === false) {
                console.log("Forme exclue (investisseurs): " + form.nom);
                return false;
            }
            
            // Activité réglementée avec structure incompatible
            if (responses.activiteReglementee && form.compatibleWithRegulated === false) {
                console.log("Forme exclue (activité réglementée): " + form.nom);
                return false;
            }
            
            // Besoin de protection propriété intellectuelle
            if (responses.proprieteIntellectuelle && form.allowsIPProtection === false) {
                console.log("Forme exclue (PI): " + form.nom);
                return false;
            }
            
            // Structure incompatible avec le nombre d'associés
            if (responses.nombreAssociesActifs > 1 && form.associes === '1') {
                console.log("Forme exclue (associés): " + form.nom);
                return false;
            }
            
            // Stratégie de sortie incompatible
            if (responses.strategieSortie && !form.exitStrategies.includes(responses.strategieSortie)) {
                console.log("Forme exclue (stratégie sortie): " + form.nom);
                return false;
            }
            
            return true;
        });
        
        console.log(`${eligibleForms.length} formes juridiques éligibles après filtres stricts`);
        
        // 2. Calculer les scores multidimensionnels
        const results = eligibleForms.map(form => {
            // Calculer les scores par dimension
            const dimensionScores = {
                fiscal: calculateFiscalFit(form, responses),
                operational: calculateOperationalFit(form, responses),
                patrimonial: calculatePatrimonialFit(form, responses),
                growth: calculateGrowthFit(form, responses)
            };
            
            // Calculer le score global pondéré selon les préférences utilisateur
            const weights = getWeightsByUserProfile(responses);
            
            // Score pondéré global
            const weightedScore = (
                dimensionScores.fiscal * weights.fiscal +
                dimensionScores.operational * weights.operational +
                dimensionScores.patrimonial * weights.patrimonial +
                dimensionScores.growth * weights.growth
            ) / (weights.fiscal + weights.operational + weights.patrimonial + weights.growth);
            
            // Déterminer le niveau de compatibilité
            let compatibility;
            if (weightedScore >= 4.2) {
                compatibility = 'RECOMMANDÉ';
            } else if (weightedScore >= 3.5) {
                compatibility = 'COMPATIBLE';
            } else if (weightedScore >= 2.5) {
                compatibility = 'PEU ADAPTÉ';
            } else {
                compatibility = 'DÉCONSEILLÉ';
            }
            
            // Construire l'explication personnalisée
            const explanation = generateExplanation(form, dimensionScores, weights, responses);
            
            return {
                form: form,
                dimensionScores: dimensionScores,
                weightedScore: weightedScore,
                compatibility: compatibility,
                explanation: explanation,
                evolutionPlan: generateEvolutionPlan(form, responses)
            };
        });
        
        // 3. Trier par score pondéré
        results.sort((a, b) => b.weightedScore - a.weightedScore);
        
        return results;
    }
    
    // AMÉLIORATION: Calcul du score fiscal
    function calculateFiscalFit(form, responses) {
        let score = 0;
        
        // Base: score intrinsèque de la forme
        score += form.dimensionScores.fiscal * 0.5; // 50% du score provient de la qualité fiscale intrinsèque
        
        // Régime fiscal préféré
        if (responses.regimeFiscal === 'ir' && form.fiscalite.includes('IR')) {
            score += 1;
        } else if (responses.regimeFiscal === 'is' && form.fiscalite.includes('IS')) {
            score += 1;
        } else if (responses.regimeFiscal === 'flexible' && form.fiscaliteOption === 'Oui') {
            score += 1.5; // Bonus pour la flexibilité
        }
        
        // TMI élevée et IS avantageux
        if (responses.chiffreAffaires === 'eleve' && form.fiscalite.includes('IS')) {
            score += 0.5;
        }
        
        // Objectif fiscal explicite
        if (responses.objectifs.includes('fiscalite')) {
            // Trouver la priorité de l'objectif fiscal
            const fiscalPriority = responses.objectifsPriorite.find(obj => obj.valeur === 'fiscalite')?.priorite || 3;
            
            // Bonus selon la priorité (1 = priorité maximale)
            if (fiscalPriority === 1 && form.fiscaliteOption === 'Oui') {
                score += 1.5;
            } else if (fiscalPriority === 2 && form.fiscaliteOption === 'Oui') {
                score += 1;
            } else if (fiscalPriority === 3 && form.fiscaliteOption === 'Oui') {
                score += 0.5;
            }
        }
        
        // Normaliser le score sur 5
        return Math.min(5, score);
    }
    
    // AMÉLIORATION: Calcul du score opérationnel
    function calculateOperationalFit(form, responses) {
        let score = 0;
        
        // Base: score intrinsèque de la forme
        score += form.dimensionScores.operational * 0.5; // 50% du score provient de la qualité opérationnelle intrinsèque
        
        // Simplicité administrative
        if (responses.objectifs.includes('simplicite')) {
            const simplicityBonus = 5 - form.adminComplexity; // Plus c'est simple, plus le bonus est grand
            score += simplicityBonus * 0.5;
        }
        
        // Adéquation au secteur
        if (responses.secteurActivite && sectorProfiles[responses.secteurActivite]) {
            const sectorProfile = sectorProfiles[responses.secteurActivite];
            
            // Recommandé pour ce secteur
            if (sectorProfile.recommended.includes(form.id)) {
                score += 1.5;
            }
            
            // À éviter pour ce secteur
            if (sectorProfile.avoid.includes(form.id)) {
                score -= 2;
            }
        }
        
        // Activité réglementée
        if (responses.activiteReglementee && form.compatibleWithRegulated) {
            score += 1;
        }
        
        // Nombre d'associés
        if (responses.nombreAssociesActifs > 1) {
            // Vérifier si la structure est adaptée aux multi-associés
            if (form.associes !== '1') {
                // Bonus selon le niveau d'adaptation
                if (form.id === 'sarl' || form.id === 'sas') {
                    score += 1;
                } else if (form.id === 'snc' || form.id === 'scp') {
                    score += 0.5;
                }
            }
        }
        
        // Normaliser le score sur 5
        return Math.min(5, Math.max(1, score));
    }
    
    // AMÉLIORATION: Calcul du score patrimonial
    function calculatePatrimonialFit(form, responses) {
        let score = 0;
        
        // Base: score intrinsèque de la forme
        score += form.dimensionScores.patrimonial * 0.6; // 60% du score provient de la qualité patrimoniale intrinsèque
        
        // Protection patrimoniale
        if (responses.protectionPatrimoine >= 4 && form.protectionPatrimoine === 'Oui') {
            score += 1.5;
        } else if (responses.protectionPatrimoine <= 2 && form.protectionPatrimoine === 'Non') {
            // L'utilisateur se soucie peu de la protection, donc absence de protection n'est pas pénalisante
            score += 0.5;
        } else if (responses.protectionPatrimoine >= 4 && form.protectionPatrimoine === 'Non') {
            // Protection importante mais forme inadaptée
            score -= 2;
        }
        
        // Objectif protection
        if (responses.objectifs.includes('protection')) {
            const protectionPriority = responses.objectifsPriorite.find(obj => obj.valeur === 'protection')?.priorite || 3;
            
            if (protectionPriority === 1 && form.protectionPatrimoine === 'Oui') {
                score += 1.5;
            } else if (protectionPriority === 1 && form.protectionPatrimoine === 'Non') {
                score -= 3; // Forte pénalité si objectif principal
            }
        }
        
        // Stratégie de transmission/sortie
        if (responses.strategieSortie === 'Transmission' && form.transmission === 'Oui') {
            score += 1;
        }
        
        // Normaliser le score sur 5
        return Math.min(5, Math.max(1, score));
    }
    
    // AMÉLIORATION: Calcul du score de croissance
    function calculateGrowthFit(form, responses) {
        let score = 0;
        
        // Base: score intrinsèque de la forme
        score += form.dimensionScores.growth * 0.6; // 60% du score provient de la capacité intrinsèque de croissance
        
        // Objectif croissance
        if (responses.objectifs.includes('croissance')) {
            const growthPriority = responses.objectifsPriorite.find(obj => obj.valeur === 'croissance')?.priorite || 3;
            
            if (growthPriority === 1) {
                // Capacité de levée de fonds cruciale
                if (form.leveeFonds === 'Oui') {
                    score += 1.5;
                } else {
                    score -= 2; // Forte pénalité
                }
            } else if (growthPriority === 2) {
                // Important mais pas critique
                if (form.leveeFonds === 'Oui') {
                    score += 1;
                } else {
                    score -= 1;
                }
            }
        }
        
        // Investisseurs
        if (responses.nombreInvestisseurs > 0) {
            if (form.allowsInvestment) {
                score += 1;
                
                // Bonus supplémentaire pour les formes les plus adaptées
                if (form.id === 'sas' || form.id === 'sa') {
                    score += 0.5;
                }
            } else {
                score -= 2; // Pénalité forte si besoin d'investisseurs
            }
        }
        
        // Horizon de développement court
        if (responses.horizonDeveloppement <= 2 && form.growth >= 4) {
            score += 1; // Bonus pour les structures permettant une croissance rapide
        }
        
        // Normaliser le score sur 5
        return Math.min(5, Math.max(1, score));
    }
    
    // AMÉLIORATION: Déterminer les pondérations selon profil utilisateur et objectifs
    function getWeightsByUserProfile(responses) {
        // Pondérations par défaut
        let weights = {
            fiscal: 1,
            operational: 1,
            patrimonial: 1,
            growth: 1
        };
        
        // Ajuster selon secteur d'activité
        if (responses.secteurActivite && sectorProfiles[responses.secteurActivite]) {
            const sectorWeights = sectorProfiles[responses.secteurActivite].criteriaWeights;
            weights = {...sectorWeights};
        }
        
        // Ajuster selon objectifs prioritaires
        responses.objectifsPriorite.forEach(obj => {
            if (obj.priorite === 1) { // Priorité principale
                switch(obj.valeur) {
                    case 'fiscalite':
                        weights.fiscal *= 2;
                        break;
                    case 'simplicite':
                    case 'economie':
                        weights.operational *= 2;
                        break;
                    case 'protection':
                        weights.patrimonial *= 2;
                        break;
                    case 'croissance':
                        weights.growth *= 2;
                        break;
                }
            } else if (obj.priorite === 2) { // Priorité secondaire
                switch(obj.valeur) {
                    case 'fiscalite':
                        weights.fiscal *= 1.5;
                        break;
                    case 'simplicite':
                    case 'economie':
                        weights.operational *= 1.5;
                        break;
                    case 'protection':
                        weights.patrimonial *= 1.5;
                        break;
                    case 'croissance':
                        weights.growth *= 1.5;
                        break;
                }
            }
        });
        
        return weights;
    }
    
    // NOUVELLE FONCTION: Génération d'explication personnalisée
    function generateExplanation(form, dimensionScores, weights, responses) {
        let explanation = [];
        
        // 1. Forces principales
        explanation.push({
            title: "Points forts pour votre situation",
            content: []
        });
        
        // Trouver les dimensions les plus fortes
        const sortedDimensions = Object.entries(dimensionScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2); // Prendre les 2 meilleures dimensions
        
        sortedDimensions.forEach(([dimension, score]) => {
            if (score >= 4) { // Seulement les vraies forces (score ≥ 4)
                switch(dimension) {
                    case 'fiscal':
                        explanation[0].content.push(
                            `<strong>Fiscalité adaptée</strong>: ${form.fiscalite} ${form.fiscaliteOption === 'Oui' ? 'avec options flexibles' : ''} `
                        );
                        break;
                    case 'operational':
                        explanation[0].content.push(
                            `<strong>Facilité opérationnelle</strong>: ${form.formalites === 'Très simplifiées' ? 'Formalités simplifiées et gestion légère' : 'Structures et processus adaptés à votre activité'}`
                        );
                        break;
                    case 'patrimonial':
                        explanation[0].content.push(
                            `<strong>Protection patrimoniale</strong>: ${form.protectionPatrimoine === 'Oui' ? 'Séparation efficace entre patrimoines professionnel et personnel' : 'Structure adaptée à vos besoins de protection'}`
                        );
                        break;
                    case 'growth':
                        explanation[0].content.push(
                            `<strong>Potentiel de croissance</strong>: ${form.leveeFonds === 'Oui' ? 'Permet d\'accueillir des investisseurs et de lever des fonds' : 'Adaptée à vos objectifs de développement'}`
                        );
                        break;
                }
            }
        });
        
        // Si objectifs précis, ajouter des explications spécifiques
        if (responses.objectifs.length > 0) {
            const priorityObjective = responses.objectifsPriorite.find(obj => obj.priorite === 1)?.valeur;
            
            if (priorityObjective) {
                switch(priorityObjective) {
                    case 'simplicite':
                        if (form.formalites.includes('simplifiées')) {
                            explanation[0].content.push(
                                `<strong>Simplicité administrative</strong>: Répond à votre besoin principal de gestion allégée avec ${form.formalites}`
                            );
                        }
                        break;
                    case 'fiscalite':
                        explanation[0].content.push(
                            `<strong>Optimisation fiscale</strong>: ${form.fiscaliteOption === 'Oui' ? 'Flexibilité fiscale permettant de s\'adapter à l\'évolution de votre situation' : 'Régime fiscal avantageux dans votre cas'}`
                        );
                        break;
                    case 'protection':
                        if (form.protectionPatrimoine === 'Oui') {
                            explanation[0].content.push(
                                `<strong>Sécurité patrimoniale</strong>: Répond parfaitement à votre priorité de protection avec ${form.responsabilite}`
                            );
                        }
                        break;
                    case 'croissance':
                        if (form.leveeFonds === 'Oui') {
                            explanation[0].content.push(
                                `<strong>Structure évolutive</strong>: Parfaitement adaptée à vos ambitions de croissance avec possibilité d'entrée d'investisseurs`
                            );
                        }
                        break;
                }
            }
        }
        
        // 2. Points d'attention
        explanation.push({
            title: "Points d'attention",
            content: []
        });
        
        // Identifier les dimensions faibles
        const weakDimensions = Object.entries(dimensionScores)
            .filter(([_, score]) => score < 3);
        
        weakDimensions.forEach(([dimension, score]) => {
            switch(dimension) {
                case 'fiscal':
                    explanation[1].content.push(
                        `<strong>Fiscalité</strong>: ${form.fiscalite} peut être moins optimale pour votre situation`
                    );
                    break;
                case 'operational':
                    explanation[1].content.push(
                        `<strong>Complexité administrative</strong>: ${form.formalites === 'Complexes' ? 'Formalités plus lourdes nécessitant un accompagnement' : 'Structure administrative à considérer'}`
                    );
                    break;
                case 'patrimonial':
                    if (form.protectionPatrimoine === 'Non' && responses.protectionPatrimoine > 3) {
                        explanation[1].content.push(
                            `<strong>Protection limitée</strong>: Responsabilité ${form.responsabilite} – prudence nécessaire`
                        );
                    }
                    break;
                case 'growth':
                    if (form.leveeFonds === 'Non' && responses.nombreInvestisseurs > 0) {
                        explanation[1].content.push(
                            `<strong>Limitations pour la croissance</strong>: Structure peu adaptée à l'entrée d'investisseurs`
                        );
                    }
                    break;
            }
        });
        
        // Ajouter des alertes spécifiques selon cas particuliers
        if (form.id === 'micro-entreprise' && responses.chiffreAffaires === 'moyen') {
            explanation[1].content.push(
                `<strong>Attention au plafond</strong>: Vous approchez des limites de CA (${form.plafondCA}) – prévoir une évolution`
            );
        }
        
        if (form.id === 'sasu' && responses.chiffreAffaires === 'faible') {
            explanation[1].content.push(
                `<strong>Charges sociales élevées</strong>: Structure potentiellement coûteuse pour un faible CA`
            );
        }
        
        // Si pas de points d'attention identifiés
        if (explanation[1].content.length === 0) {
            explanation[1].content.push("Pas de points d'attention majeurs identifiés pour votre situation");
        }
        
        // 3. Comparaison avec alternatives
        explanation.push({
            title: "Pourquoi cette forme vs alternatives",
            content: []
        });
        
        // Identifier les formes "proches" mais moins adaptées
        let alternatives = [];
        
        if (form.id === 'micro-entreprise') {
            alternatives.push({
                name: 'EURL',
                advantage: 'plus simple et moins coûteuse',
                limitation: 'plafond de chiffre d\'affaires'
            });
        } else if (form.id === 'eurl') {
            alternatives.push({
                name: 'Micro-entreprise',
                advantage: 'offre une meilleure protection et pas de plafond de CA',
                limitation: 'formalités plus importantes'
            });
            alternatives.push({
                name: 'SASU',
                advantage: 'couverture sociale TNS souvent plus économique',
                limitation: 'régime fiscal moins flexible'
            });
        } else if (form.id === 'sasu') {
            alternatives.push({
                name: 'EURL',
                advantage: 'statut social assimilé salarié plus protecteur',
                limitation: 'charges sociales plus élevées'
            });
            alternatives.push({
                name: 'SAS',
                advantage: 'reste adaptée même en tant qu\'entrepreneur solo',
                limitation: 'SAS nécessite au moins 2 associés'
            });
        } else if (form.id === 'sarl') {
            alternatives.push({
                name: 'SAS',
                advantage: 'statut plus traditionnel et encadré juridiquement',
                limitation: 'moins de flexibilité statutaire'
            });
        } else if (form.id === 'sas') {
            alternatives.push({
                name: 'SARL',
                advantage: 'meilleure flexibilité statutaire et attractivité pour investisseurs',
                limitation: 'formalisme plus important'
            });
        }
        
        // Ajouter les comparaisons à l'explication
        alternatives.forEach(alt => {
            explanation[2].content.push(
                `<strong>Vs ${alt.name}</strong>: La ${form.nom} est ${alt.advantage} malgré ${alt.limitation}`
            );
        });
        
        // Si pas d'alternatives pertinentes identifiées
        if (explanation[2].content.length === 0) {
            const bestAlternative = form.id === 'sasu' ? 'SAS' : 
                                    form.id === 'eurl' ? 'SARL' : 
                                    form.id === 'micro-entreprise' ? 'EI' : 'autre structure';
            
            explanation[2].content.push(
                `La ${form.nom} se distingue de ${bestAlternative} par sa meilleure adéquation globale à votre projet`
            );
        }
        
        return explanation;
    }
    
    // NOUVELLE FONCTION: Génération de plan d'évolution
    function generateEvolutionPlan(form, responses) {
        const evolutionPlan = [];
        
        // 1. Utiliser plan sectoriel si disponible
        if (responses.secteurActivite && sectorProfiles[responses.secteurActivite]) {
            return sectorProfiles[responses.secteurActivite].evolutionPlan;
        }
        
        // 2. Sinon, générer un plan personnalisé selon la forme actuelle
        
        // Cas Micro-entreprise
        if (form.id === 'micro-entreprise') {
            evolutionPlan.push({
                timeframe: "Démarrage",
                options: ["micro-entreprise"],
                reasoning: "Simplicité et coûts réduits pour valider votre concept"
            });
            
            evolutionPlan.push({
                timeframe: "Quand votre CA approche 50-70% du plafond",
                options: ["eurl", "sasu"],
                reasoning: "Anticiper le changement de structure avant d'atteindre les limites"
            });
            
            if (responses.nombreAssociesActifs > 1 || responses.objectifs.includes('croissance')) {
                evolutionPlan.push({
                    timeframe: "Développement",
                    options: ["sarl", "sas"],
                    reasoning: "Structure adaptée à plusieurs associés ou à la croissance"
                });
            }
        } 
        // Cas EURL
        else if (form.id === 'eurl') {
            evolutionPlan.push({
                timeframe: "Phase actuelle",
                options: ["eurl"],
                reasoning: "Structure adaptée à votre situation présente"
            });
            
            if (responses.nombreAssociesActifs > 1 || responses.objectifs.includes('croissance')) {
                evolutionPlan.push({
                    timeframe: "En cas d'association ou développement",
                    options: ["sarl", "sas"],
                    reasoning: "Transformation simple vers une structure multi-associés"
                });
            }
        }
        // Cas SASU
        else if (form.id === 'sasu') {
            evolutionPlan.push({
                timeframe: "Phase actuelle",
                options: ["sasu"],
                reasoning: "Structure optimale pour l'entrepreneur individuel avec statut protecteur"
            });
            
            if (responses.objectifs.includes('croissance')) {
                evolutionPlan.push({
                    timeframe: "Développement et levée de fonds",
                    options: ["sas"],
                    reasoning: "Passage simple à la SAS pour accueillir des associés/investisseurs"
                });
            }
        }
        // Cas SARL/SAS/SA
        else if (['sarl', 'sas', 'sa'].includes(form.id)) {
            evolutionPlan.push({
                timeframe: "Structure actuelle",
                options: [form.id],
                reasoning: "Adaptée à votre stade de développement"
            });
            
            if (form.id === 'sarl' && responses.objectifs.includes('croissance')) {
                evolutionPlan.push({
                    timeframe: "Expansion significative",
                    options: ["sas"],
                    reasoning: "Meilleure structure pour levée de fonds et croissance accélérée"
                });
            }
            
            if (form.id === 'sas' && responses.strategieSortie === 'IPO') {
                evolutionPlan.push({
                    timeframe: "Préparation introduction en bourse",
                    options: ["sa"],
                    reasoning: "Structure nécessaire pour la cotation en bourse"
                });
            }
        }
        // Cas autres structures
        else {
            evolutionPlan.push({
                timeframe: "Structure actuelle",
                options: [form.id],
                reasoning: `La ${form.nom} est adaptée à votre activité spécifique`
            });
            
            // Structure de secours générique
            evolutionPlan.push({
                timeframe: "En cas d'évolution majeure",
                options: ["Consulter un expert"],
                reasoning: "Un changement de statut nécessitera une analyse personnalisée"
            });
        }
        
        return evolutionPlan;
    }
    
    // NOUVELLE FONCTION: Déterminer si la complexité nécessite une validation expert
    function needsExpertValidation(responses, result) {
        const COMPLEXITY_THRESHOLD = 3.5; // Seuil de complexité sur 5
        let complexityScore = 0;
        
        // Facteurs augmentant la complexité
        if (responses.activiteReglementee) complexityScore += 1;
        if (responses.nombreAssociesActifs > 2) complexityScore += 0.5;
        if (responses.nombreInvestisseurs > 0) complexityScore += 0.5;
        if (responses.proprieteIntellectuelle) complexityScore += 0.5;
        if (responses.chiffreAffaires === 'eleve') complexityScore += 0.5;
        
        // Secteurs complexes
        if (['tech_startup', 'real_estate', 'liberal_profession'].includes(responses.secteurActivite)) {
            complexityScore += 1;
        }
        
        // Structures complexes
        if (['sa', 'sca', 'selas', 'selarl'].includes(result.form.id)) {
            complexityScore += 1;
        }
        
        return complexityScore >= COMPLEXITY_THRESHOLD;
    }

    // Fonctions de collecte des données du formulaire
    
    // Collecte Section 1: Base améliorée pour recueillir secteur d'activité
    function collectSection1Data() {
        const selectedProfile = document.querySelector('#section1 .option-btn.selected');
        if (selectedProfile) {
            userResponses.profilEntrepreneur = selectedProfile.getAttribute('data-value');
        }
        
        userResponses.protectionPatrimoine = parseInt(document.getElementById('patrimoine-slider').value);
        
        // NOUVEAU: Collecter le secteur d'activité
        const selectedSector = document.querySelector('#secteur-activite .option-btn.selected');
        if (selectedSector) {
            userResponses.secteurActivite = selectedSector.getAttribute('data-value');
        }
    }
    
    // Collecte Section 2: Ajout des questions sur propriété intellectuelle
    function collectSection2Data() {
        const selectedActivity = document.querySelector('#section2 .option-btn.selected:first-of-type');
        if (selectedActivity) {
            userResponses.typeActivite = selectedActivity.getAttribute('data-value');
        }
        
        userResponses.activiteReglementee = document.getElementById('activite-reglementee').checked;
        
        const selectedCA = document.querySelector('#section2 .option-btn.selected:nth-of-type(2)');
        if (selectedCA) {
            userResponses.chiffreAffaires = selectedCA.getAttribute('data-value');
        }
        
        // NOUVEAU: Collecter le besoin en propriété intellectuelle
        const needsIP = document.getElementById('propriete-intellectuelle');
        if (needsIP) {
            userResponses.proprieteIntellectuelle = needsIP.checked;
        }
    }
    
    // Collecte Section 3: Priorités d'objectifs avec poids
    function collectSection3Data() {
        // Collecte des objectifs améliorée pour priorités
        userResponses.objectifs = [];
        userResponses.objectifsPriorite = [];
        
        // Utiliser multiSelectionOrder pour déterminer la priorité
        multiSelectionOrder.forEach((objValue, index) => {
            userResponses.objectifs.push(objValue);
            userResponses.objectifsPriorite.push({
                valeur: objValue,
                priorite: index + 1
            });
        });
        
        const selectedRemuneration = document.querySelector('#section3 .option-btn.selected:not([data-multi])');
        if (selectedRemuneration) {
            userResponses.remuneration = selectedRemuneration.getAttribute('data-value');
        }
        
        // NOUVEAU: Nombre d'associés actifs et investisseurs
        const associesActifs = document.getElementById('associes-actifs');
        if (associesActifs) {
            userResponses.nombreAssociesActifs = parseInt(associesActifs.value) || 1;
        }
        
        const investisseurs = document.getElementById('investisseurs');
        if (investisseurs) {
            userResponses.nombreInvestisseurs = parseInt(investisseurs.value) || 0;
        }
    }
    
    // Collecte Section 4: Horizon et stratégie de sortie
    function collectSection4Data() {
        userResponses.risque = parseInt(document.getElementById('risque-slider').value);
        
        const selectedFiscal = document.querySelector('#section4 .option-btn.selected:first-of-type');
        if (selectedFiscal) {
            userResponses.regimeFiscal = selectedFiscal.getAttribute('data-value');
        }
        
        const selectedRegimeSocial = document.querySelector('#section4 .option-btn.selected:nth-of-type(2)');
        if (selectedRegimeSocial) {
            userResponses.regimeSocial = selectedRegimeSocial.getAttribute('data-value');
        }
        
        // NOUVEAU: Stratégie de sortie et horizon
        const selectedSortie = document.querySelector('#strategie-sortie .option-btn.selected');
        if (selectedSortie) {
            userResponses.strategieSortie = selectedSortie.getAttribute('data-value');
        }
        
        const horizonDev = document.getElementById('horizon-developpement');
        if (horizonDev) {
            userResponses.horizonDeveloppement = parseInt(horizonDev.value) || 3;
        }
    }
    
    // AMÉLIORATION MAJEURE: Génération des résultats avec le nouvel algorithme
    function generateResults() {
        console.log("Génération des résultats avec l'algorithme amélioré...");
        console.log("Données utilisateur:", userResponses);
        
        // Analyser les formes juridiques avec le nouvel algorithme
        const results = analyzeBusinessForm(userResponses);
        
        // Grouper les résultats par compatibilité
        const resultatsRecommandes = results.filter(r => r.compatibility === 'RECOMMANDÉ');
        const resultatsCompatibles = results.filter(r => r.compatibility === 'COMPATIBLE');
        const resultatsPeuAdaptes = results.filter(r => r.compatibility === 'PEU ADAPTÉ');
        const resultatsDeconseilles = results.filter(r => r.compatibility === 'DÉCONSEILLÉ');
        
        console.log(`Résultats: ${resultatsRecommandes.length} recommandés, ${resultatsCompatibles.length} compatibles`);
        
        // Regrouper pour affichage (sans les déconseillés)
        const resultatsAffichage = [...resultatsRecommandes, ...resultatsCompatibles, ...resultatsPeuAdaptes].slice(0, 3);
        
        // Afficher les résultats avec les nouvelles explications
        displayEnhancedResults(resultatsAffichage);
        
        // Préparer les données du tableau comparatif
        prepareComparatifTable(formesJuridiques);
        
        return {
            recommandes: resultatsRecommandes,
            compatibles: resultatsCompatibles,
            peuAdaptes: resultatsPeuAdaptes,
            deconseilles: resultatsDeconseilles
        };
    }
    
    // Fonction d'affichage améliorée avec explications et plan d'évolution
    function displayEnhancedResults(results) {
        const resultsContainer = document.getElementById('results-container');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        // 1. Informations générales et contexte
        const infoContainer = document.createElement('div');
        infoContainer.classList.add('bg-blue-900', 'bg-opacity-20', 'p-4', 'rounded-lg', 'mb-6', 'text-sm');
        infoContainer.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-info-circle text-green-400 mt-1 mr-3"></i>
                <div>
                    <p class="mb-2">Les informations juridiques présentées sont à jour selon la législation française en vigueur (avril 2025).</p>
                    <p>Les recommandations sont personnalisées selon votre profil, votre secteur et vos priorités.</p>
                </div>
            </div>
        `;
        resultsContainer.appendChild(infoContainer);
        
        // 2. Bouton de recalcul rapide
        const recalculContainer = document.createElement('div');
        recalculContainer.classList.add('flex', 'justify-center', 'mb-8');
        
        const recalculBtn = document.createElement('button');
        recalculBtn.classList.add('border', 'border-green-400', 'text-green-400', 'hover:bg-green-900', 'hover:bg-opacity-30', 'font-semibold', 'py-2', 'px-4', 'rounded-lg', 'transition', 'flex', 'items-center');
        recalculBtn.innerHTML = '<i class="fas fa-sliders-h mr-2"></i> Ajuster les paramètres sans tout recommencer';
        
        recalculBtn.addEventListener('click', function() {
            showSection(3); // Revenir à l'étape des objectifs
        });
        
        recalculContainer.appendChild(recalculBtn);
        resultsContainer.appendChild(recalculContainer);
        
        // 3. Affichage des résultats avec distinction principal/secondaires
        if (results.length > 0) {
            // Meilleure recommandation - mise en avant spéciale
            const primaryResult = results[0];
            createPrimaryResultCard(primaryResult, resultsContainer);
            
            // Séparateur visuel
            if (results.length > 1) {
                const toggleContainer = document.createElement('div');
                toggleContainer.id = "show-more-results";
                toggleContainer.classList.add('results-toggle', 'my-8', 'text-center');
                toggleContainer.innerHTML = `
                    <button class="bg-blue-900 bg-opacity-30 hover:bg-opacity-50 text-white py-2 px-4 rounded-lg transition flex items-center mx-auto">
                        <i class="fas fa-chevron-down mr-2"></i> Voir les autres options compatibles
                    </button>
                `;
                resultsContainer.appendChild(toggleContainer);
                
                // Container pour résultats secondaires
                const secondaryContainer = document.createElement('div');
                secondaryContainer.id = "secondary-results";
                secondaryContainer.classList.add('secondary-results', 'hidden');
                
                // Ajout des résultats secondaires
                for (let i = 1; i < results.length; i++) {
                    createSecondaryResultCard(results[i], secondaryContainer);
                }
                
                resultsContainer.appendChild(secondaryContainer);
                
                // Event listener pour afficher/masquer les résultats secondaires
                document.querySelector('#show-more-results button').addEventListener('click', function() {
                    const secondaryResults = document.getElementById('secondary-results');
                    secondaryResults.classList.toggle('hidden');
                    this.innerHTML = secondaryResults.classList.contains('hidden') 
                        ? '<i class="fas fa-chevron-down mr-2"></i> Voir les autres options compatibles'
                        : '<i class="fas fa-chevron-up mr-2"></i> Masquer les autres options';
                });
            }
        } else {
            // Aucun résultat compatible
            resultsContainer.innerHTML += `
                <div class="text-center py-10">
                    <div class="mb-4">
                        <i class="fas fa-exclamation-triangle text-yellow-400 text-4xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Aucune forme juridique parfaitement adaptée</h3>
                    <p class="mb-4">Votre situation présente des spécificités qui nécessitent une analyse personnalisée.</p>
                    <button id="restart-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition">
                        <i class="fas fa-redo mr-2"></i> Recommencer la simulation
                    </button>
                </div>
            `;
        }
        
        // 4. NOUVELLE FONCTIONNALITÉ: Plan d'évolution stratégique
        if (results.length > 0) {
            createEvolutionPlanSection(results[0], resultsContainer);
        }
        
        // 5. NOUVELLE FONCTIONNALITÉ: Section de validation par expert si nécessaire
        if (results.length > 0 && needsExpertValidation(userResponses, results[0])) {
            createExpertValidationSection(resultsContainer);
        }
    }
    
    // Fonction pour créer la carte du résultat principal
    function createPrimaryResultCard(result, container) {
        const scorePercentage = Math.min(100, Math.round((result.weightedScore / 5) * 100));
        const forme = result.form;
        
        // Définir les classes et textes selon la compatibilité
        let compatibiliteClass, compatibiliteIcon;
        
        switch(result.compatibility) {
            case 'RECOMMANDÉ':
                compatibiliteClass = 'bg-green-500 text-gray-900';
                compatibiliteIcon = 'fa-check-circle';
                break;
            case 'COMPATIBLE':
                compatibiliteClass = 'bg-yellow-500 text-gray-900';
                compatibiliteIcon = 'fa-exclamation-circle';
                break;
            case 'PEU ADAPTÉ':
                compatibiliteClass = 'bg-yellow-600 text-gray-900';
                compatibiliteIcon = 'fa-minus-circle';
                break;
            default:
                compatibiliteClass = 'bg-gray-500 text-gray-900';
                compatibiliteIcon = 'fa-question-circle';
        }
        
        const resultCard = document.createElement('div');
        resultCard.classList.add('result-card', 'primary-result', 'p-6', 'mb-8');
        setTimeout(() => {
            resultCard.classList.add('visible');
        }, 300);
        
        // Badge "Recommandé"
        if (result.compatibility === 'RECOMMANDÉ') {
            resultCard.innerHTML += `
                <div class="recommended-badge">
                    <i class="fas fa-star mr-1"></i> Recommandé pour vous
                </div>
            `;
        }
        
        // Score et informations de base
        resultCard.innerHTML += `
            <div class="result-match p-5 bg-blue-900 bg-opacity-40 rounded-xl mb-4">
                <div class="match-percentage ${compatibiliteClass}">
                    <i class="fas ${compatibiliteIcon} mr-1"></i>
                    ${scorePercentage}%
                </div>
                <div class="absolute top-5 right-20 ${compatibiliteClass} py-1 px-3 rounded-full text-sm font-bold">
                    ${result.compatibility}
                </div>
                <h4 class="text-xl font-bold mb-3 flex items-center">
                    <i class="fas ${forme.icone || 'fa-building'} text-green-400 mr-3 text-2xl"></i>
                    ${forme.nom}
                </h4>
                <p class="opacity-80 mb-4">${forme.profilOptimal}</p>
                <div class="match-indicator mt-3">
                    <div class="match-fill" style="width: ${scorePercentage}%"></div>
                </div>
                <div class="flex justify-between text-sm mt-1 opacity-80">
                    <div>Adéquation à votre profil</div>
                    <div>Score: ${result.weightedScore.toFixed(1)}/5</div>
                </div>
            </div>
        `;
        
        // AMÉLIORATION: Scores dimensionnels avec graphique radar
        resultCard.innerHTML += `
            <div class="mb-6">
                <h5 class="font-semibold text-green-400 mb-3">Analyse multidimensionnelle</h5>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <canvas id="radar-chart-${forme.id}" width="200" height="200"></canvas>
                    </div>
                    <div class="flex flex-col justify-center">
                        <div class="mb-2">
                            <span class="inline-block w-3 h-3 bg-blue-400 rounded-full mr-2"></span>
                            <span class="font-medium">Fiscal: </span>
                            <span class="text-blue-400 font-semibold">${result.dimensionScores.fiscal.toFixed(1)}/5</span>
                        </div>
                        <div class="mb-2">
                            <span class="inline-block w-3 h-3 bg-green-400 rounded-full mr-2"></span>
                            <span class="font-medium">Opérationnel: </span>
                            <span class="text-green-400 font-semibold">${result.dimensionScores.operational.toFixed(1)}/5</span>
                        </div>
                        <div class="mb-2">
                            <span class="inline-block w-3 h-3 bg-yellow-400 rounded-full mr-2"></span>
                            <span class="font-medium">Patrimonial: </span>
                            <span class="text-yellow-400 font-semibold">${result.dimensionScores.patrimonial.toFixed(1)}/5</span>
                        </div>
                        <div>
                            <span class="inline-block w-3 h-3 bg-red-400 rounded-full mr-2"></span>
                            <span class="font-medium">Croissance: </span>
                            <span class="text-red-400 font-semibold">${result.dimensionScores.growth.toFixed(1)}/5</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Explication détaillée et personnalisée
        resultCard.innerHTML += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h5 class="font-semibold text-green-400 mb-3">${result.explanation[0].title}</h5>
                    <ul class="feature-list space-y-3">
                        ${result.explanation[0].content.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                    
                    <h5 class="font-semibold text-yellow-400 mt-4 mb-3">${result.explanation[1].title}</h5>
                    <ul class="feature-list space-y-3">
                        ${result.explanation[1].content.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
                <div>
                    <h5 class="font-semibold text-green-400 mb-3">Caractéristiques principales</h5>
                    <ul class="feature-list space-y-3">
                        <li><i class="fas fa-users text-blue-400"></i> <span class="font-medium">Associés:</span> ${forme.associes}</li>
                        <li><i class="fas fa-shield-alt text-blue-400"></i> <span class="font-medium">Responsabilité:</span> ${forme.responsabilite}</li>
                        <li><i class="fas fa-percentage text-blue-400"></i> <span class="font-medium">Fiscalité:</span> ${forme.fiscalite}</li>
                        <li><i class="fas fa-user-tie text-blue-400"></i> <span class="font-medium">Régime social:</span> ${forme.regimeSocial}</li>
                        <li><i class="fas fa-coins text-blue-400"></i> <span class="font-medium">Capital:</span> ${forme.capital}</li>
                        <li><i class="fas fa-file-alt text-blue-400"></i> <span class="font-medium">Formalités:</span> ${forme.formalites}</li>
                    </ul>
                    
                    <h5 class="font-semibold text-blue-400 mt-4 mb-3">${result.explanation[2].title}</h5>
                    <ul class="feature-list space-y-3">
                        ${result.explanation[2].content.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        container.appendChild(resultCard);
        
        // Initialiser le graphique radar
        setTimeout(() => {
            const ctx = document.getElementById(`radar-chart-${forme.id}`).getContext('2d');
            new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Fiscal', 'Opérationnel', 'Patrimonial', 'Croissance'],
                    datasets: [{
                        label: forme.nom,
                        data: [
                            result.dimensionScores.fiscal,
                            result.dimensionScores.operational,
                            result.dimensionScores.patrimonial,
                            result.dimensionScores.growth
                        ],
                        backgroundColor: 'rgba(0, 255, 135, 0.2)',
                        borderColor: 'rgba(0, 255, 135, 1)',
                        pointBackgroundColor: 'rgba(0, 255, 135, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(0, 255, 135, 1)'
                    }]
                },
                options: {
                    scale: {
                        ticks: {
                            beginAtZero: true,
                            max: 5,
                            stepSize: 1
                        }
                    },
                    maintainAspectRatio: false
                }
            });
        }, 500);
    }
    
    // Fonction pour créer les cartes des résultats secondaires
    function createSecondaryResultCard(result, container) {
        const scorePercentage = Math.min(100, Math.round((result.weightedScore / 5) * 100));
        const forme = result.form;
        
        let compatibiliteClass;
        switch(result.compatibility) {
            case 'RECOMMANDÉ':
                compatibiliteClass = 'bg-green-500 text-gray-900';
                break;
            case 'COMPATIBLE':
                compatibiliteClass = 'bg-yellow-500 text-gray-900';
                break;
            case 'PEU ADAPTÉ':
                compatibiliteClass = 'bg-yellow-600 text-gray-900';
                break;
            default:
                compatibiliteClass = 'bg-gray-500 text-gray-900';
        }
        
        const resultCard = document.createElement('div');
        resultCard.classList.add('result-card', 'p-6', 'mb-6');
        setTimeout(() => {
            resultCard.classList.add('visible');
        }, 300);
        
        // Version simplifiée pour résultats secondaires
        resultCard.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h4 class="text-xl font-bold flex items-center">
                    <i class="fas ${forme.icone || 'fa-building'} text-green-400 mr-3"></i>
                    ${forme.nom}
                </h4>
                <span class="${compatibiliteClass} py-1 px-3 rounded-full text-sm font-bold">
                    ${result.compatibility}
                </span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h5 class="font-semibold text-green-400 mb-3">Forces pour votre projet</h5>
                    <ul class="feature-list space-y-2">
                        ${result.explanation[0].content.slice(0, 2).map(item => `<li>${item}</li>`).join('')}
                    </ul>
                    
                    <h5 class="font-semibold text-yellow-400 mt-4 mb-3">Points d'attention</h5>
                    <ul class="feature-list space-y-2">
                        ${result.explanation[1].content.slice(0, 2).map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
                <div>
                    <h5 class="font-semibold text-green-400 mb-3">Caractéristiques clés</h5>
                    <ul class="feature-list space-y-2">
                        <li><i class="fas fa-users text-blue-400"></i> <span class="font-medium">Associés:</span> ${forme.associes}</li>
                        <li><i class="fas fa-shield-alt text-blue-400"></i> <span class="font-medium">Responsabilité:</span> ${forme.responsabilite}</li>
                        <li><i class="fas fa-percentage text-blue-400"></i> <span class="font-medium">Fiscalité:</span> ${forme.fiscalite}</li>
                    </ul>
                    
                    <div class="mt-4">
                        <h5 class="font-semibold text-blue-400 mb-2">Adéquation à votre profil</h5>
                        <div class="match-indicator">
                            <div class="match-fill" style="width: ${scorePercentage}%"></div>
                        </div>
                        <div class="text-right text-sm mt-1 opacity-80">
                            Score: ${result.weightedScore.toFixed(1)}/5
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(resultCard);
    }
    
    // NOUVELLE FONCTION: Créer la section du plan d'évolution
    function createEvolutionPlanSection(result, container) {
        const evolutionPlan = result.evolutionPlan;
        
        if (!evolutionPlan || evolutionPlan.length === 0) return;
        
        const evolutionSection = document.createElement('div');
        evolutionSection.classList.add('bg-blue-900', 'bg-opacity-20', 'p-6', 'rounded-xl', 'mb-8');
        
        evolutionSection.innerHTML = `
            <h4 class="text-xl font-bold text-green-400 mb-4 flex items-center">
                <i class="fas fa-road mr-3"></i>
                Plan d'évolution stratégique
            </h4>
            <p class="mb-6">Voici comment votre structure juridique pourrait évoluer au fil du développement de votre projet :</p>
            
            <div class="relative">
                <!-- Timeline vertical -->
                <div class="absolute top-0 bottom-0 left-8 w-1 bg-blue-800 z-0"></div>
                
                <!-- Timeline steps -->
                <div class="space-y-8 relative z-10">
                    ${evolutionPlan.map((phase, index) => `
                        <div class="flex">
                            <div class="flex-shrink-0 w-16 h-16 flex items-center justify-center z-10 mr-4">
                                <div class="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-blue-900 font-bold">
                                    ${index + 1}
                                </div>
                            </div>
                            <div class="bg-blue-900 bg-opacity-40 rounded-lg p-4 flex-grow">
                                <h5 class="font-semibold text-green-400">${phase.timeframe}</h5>
                                <div class="mt-2">
                                    <div class="flex flex-wrap gap-2 mb-2">
                                        ${phase.options.map(option => `
                                            <span class="inline-block px-3 py-1 rounded-full text-sm
                                                ${option === result.form.id ? 'bg-green-500 text-gray-900 font-semibold' : 'bg-blue-800 text-white'}">
                                                ${option}
                                            </span>
                                        `).join('')}
                                    </div>
                                    <p class="opacity-90">${phase.reasoning}</p>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="mt-6 text-sm bg-blue-900 bg-opacity-40 p-4 rounded-lg">
                <p class="flex items-start">
                    <i class="fas fa-info-circle text-blue-400 mr-2 mt-1"></i>
                    Ce plan d'évolution est indicatif et devra être adapté selon les performances réelles de votre activité et l'évolution de la législation.
                </p>
            </div>
        `;
        
        container.appendChild(evolutionSection);
    }
    
    // NOUVELLE FONCTION: Créer la section de validation par expert
    function createExpertValidationSection(container) {
        const validationSection = document.createElement('div');
        validationSection.className = 'expert-validation bg-red-900 bg-opacity-20 p-6 rounded-xl mt-8 border border-red-800';
        
        validationSection.innerHTML = `
            <h4 class="text-xl font-bold flex items-center mb-4">
                <i class="fas fa-user-tie text-red-400 mr-3"></i>
                Votre cas mérite une analyse experte
            </h4>
            <p class="mb-4">Votre situation présente des spécificités qui pourraient bénéficier d'une analyse approfondie par un expert-comptable ou un juriste spécialisé.</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
                <div class="bg-blue-900 bg-opacity-40 p-4 rounded-lg">
                    <h5 class="font-semibold text-yellow-400 mb-2 flex items-center">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        Facteurs de complexité identifiés
                    </h5>
                    <ul class="space-y-2">
                        ${userResponses.activiteReglementee ? 
                            '<li class="flex items-start"><i class="fas fa-check text-yellow-400 mr-2 mt-1"></i> Activité réglementée</li>' : ''}
                        ${userResponses.nombreAssociesActifs > 2 ? 
                            '<li class="flex items-start"><i class="fas fa-check text-yellow-400 mr-2 mt-1"></i> Structure multi-associés</li>' : ''}
                        ${userResponses.nombreInvestisseurs > 0 ? 
                            '<li class="flex items-start"><i class="fas fa-check text-yellow-400 mr-2 mt-1"></i> Présence d\'investisseurs extérieurs</li>' : ''}
                        ${userResponses.proprieteIntellectuelle ? 
                            '<li class="flex items-start"><i class="fas fa-check text-yellow-400 mr-2 mt-1"></i> Enjeux de propriété intellectuelle</li>' : ''}
                        ${['tech_startup', 'real_estate', 'liberal_profession'].includes(userResponses.secteurActivite) ? 
                            '<li class="flex items-start"><i class="fas fa-check text-yellow-400 mr-2 mt-1"></i> Secteur d\'activité complexe</li>' : ''}
                    </ul>
                </div>
                
                <div class="bg-blue-900 bg-opacity-40 p-4 rounded-lg">
                    <h5 class="font-semibold text-green-400 mb-2 flex items-center">
                        <i class="fas fa-lightbulb mr-2"></i>
                        Les bénéfices d'une consultation experte
                    </h5>
                    <ul class="space-y-2">
                        <li class="flex items-start">
                            <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
                            Optimisation fiscale personnalisée
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
                            Conseils sur la rédaction des statuts
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
                            Analyse des spécificités sectorielles
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
                            Stratégie patrimoniale à long terme
                        </li>
                    </ul>
                </div>
            </div>
            
            <button id="request-expert" class="mt-5 bg-red-600 hover:bg-red-500 text-white font-semibold py-3 px-6 rounded-lg transition flex items-center mx-auto">
                <i class="fas fa-calendar-check mr-2"></i>
                Demander une consultation avec un expert
            </button>
        `;
        
        container.appendChild(validationSection);
        
        // Event listener pour le bouton de demande d'expert
        document.getElementById('request-expert')?.addEventListener('click', function() {
            alert("Cette fonctionnalité permettrait de mettre en relation avec un expert-comptable ou un avocat spécialisé. Elle sera disponible prochainement.");
        });
    }
    
    // Initialiser les composants et événements de l'interface utilisateur
    initializeUIComponents();
    
    function initializeUIComponents() {
        // Gestionnaires d'événements existants pour les boutons d'option, les sliders, etc.
        // Ici, on ajouterait également les gestionnaires pour les nouveaux champs (secteur d'activité, etc.)
        
        // Boutons de navigation
        const nextStep1 = document.getElementById('next1');
        if (nextStep1) {
            nextStep1.addEventListener('click', function() {
                collectSection1Data();
                saveProgress();
                showSection(2);
            });
        }
        
        const nextStep2 = document.getElementById('next2');
        if (nextStep2) {
            nextStep2.addEventListener('click', function() {
                collectSection2Data();
                saveProgress();
                showSection(3);
            });
        }
        
        const nextStep3 = document.getElementById('next3');
        if (nextStep3) {
            nextStep3.addEventListener('click', function() {
                collectSection3Data();
                saveProgress();
                showSection(4);
            });
        }
        
        const prevStep2 = document.getElementById('prev2');
        if (prevStep2) {
            prevStep2.addEventListener('click', function() {
                showSection(1);
            });
        }
        
        const prevStep3 = document.getElementById('prev3');
        if (prevStep3) {
            prevStep3.addEventListener('click', function() {
                showSection(2);
            });
        }
        
        const prevStep4 = document.getElementById('prev4');
        if (prevStep4) {
            prevStep4.addEventListener('click', function() {
                showSection(3);
            });
        }
        
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', function() {
                collectSection4Data();
                saveProgress();
                showSection(5);
                generateResults();
            });
        }
        
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', function(e) {
                e.preventDefault();
                resetSimulation();
            });
        }
        
        // Autres initialisations...
        updateProgressBar(0); // Initialiser la barre de progression
    }
    
    // Mise à jour de la barre de progression
    function updateProgressBar(step) {
        const progressBar = document.getElementById('progress-bar');
        const progressPercentage = document.getElementById('progress-percentage');
        const timeEstimate = document.getElementById('time-estimate');
        
        if (!progressBar || !progressPercentage || !timeEstimate) return;
        
        // Calculer le pourcentage de progression
        const percentage = Math.min(100, Math.round((step / 4) * 100));
        
        // Mettre à jour la barre
        progressBar.style.width = `${percentage}%`;
        progressPercentage.textContent = `${percentage}% complété`;
        
        // Mettre à jour l'estimation de temps
        const remainingTime = 5 - Math.round((percentage / 100) * 5);
        timeEstimate.textContent = `Temps estimé: ${remainingTime} minute${remainingTime > 1 ? 's' : ''} restante${remainingTime > 1 ? 's' : ''}`;
    }
    
    // Réinitialiser la simulation
    function resetSimulation() {
        // Réinitialiser les réponses de l'utilisateur
        userResponses = {
            profilEntrepreneur: null,
            protectionPatrimoine: 3,
            typeActivite: null,
            activiteReglementee: false,
            chiffreAffaires: null,
            secteurActivite: null,
            nombreAssociesActifs: 1,
            nombreInvestisseurs: 0,
            proprieteIntellectuelle: false,
            strategieSortie: null,
            horizonDeveloppement: 3,
            objectifs: [],
            objectifsPriorite: [],
            remuneration: null,
            risque: 3,
            regimeFiscal: null,
            regimeSocial: null,
            criteresImportance: {
                simplicite: 1,
                cout: 1,
                credibilite: 1,
                protection: 1,
                fiscalite: 1,
                croissance: 1
            }
        };
        
        // Réinitialiser l'UI
        document.querySelectorAll('.option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
        
        if (document.getElementById('patrimoine-slider')) {
            document.getElementById('patrimoine-slider').value = 3;
        }
        
        if (document.getElementById('risque-slider')) {
            document.getElementById('risque-slider').value = 3;
        }
        
        if (document.getElementById('activite-reglementee')) {
            document.getElementById('activite-reglementee').checked = false;
        }
        
        // Réinitialiser l'ordre de sélection des objectifs
        multiSelectionOrder = [];
        multiSelectionCount = 0;
        
        // Effacer les badges de priorité
        document.querySelectorAll('.priority-badge').forEach(badge => badge.remove());
        
        // Réinitialiser l'affichage des objectifs
        if (document.getElementById('objectif-count')) {
            document.getElementById('objectif-count').textContent = 'Sélectionnez jusqu'à 3 objectifs principaux (0/3)';
            document.getElementById('objectif-count').classList.remove('text-red-400');
        }
        
        // Retourner à la première section
        showSection(1);
        
        // Effacer le localStorage
        localStorage.removeItem('entreprise-form-progress');
        
        // Mise à jour de la barre de progression
        updateProgressBar(0);
    }
    
    // Voir si nous avons des données sauvegardées
    const savedData = loadProgress();
    if (savedData) {
        userResponses = savedData;
        // On pourrait pré-remplir le formulaire ici si nécessaire
        console.log("Données utilisateur chargées depuis la sauvegarde");
    }
    
    // AMÉLIORATION: Fonction pour sauvegarder les réponses dans localStorage
    function saveProgress() {
        localStorage.setItem('entreprise-form-progress', JSON.stringify(userResponses));
    }
    
    // AMÉLIORATION: Fonction pour charger les réponses depuis localStorage
    function loadProgress() {
        const saved = localStorage.getItem('entreprise-form-progress');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Erreur lors du chargement des données sauvegardées:", e);
                return null;
            }
        }
        return null;
    }
    
    console.log("Simulateur de forme juridique amélioré initialisé avec succès!");
});
