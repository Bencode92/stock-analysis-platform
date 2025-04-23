/**
 * Simulateur de forme juridique d'entreprise
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: pondération adaptative, incompatibilités, transparence scoring, recalcul rapide, simulation fiscale
 * Dernière mise à jour : Avril 2025 - Information vérifiées pour la législation en vigueur
 */

document.addEventListener('DOMContentLoaded', function() {
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
            icone: 'fa-building'
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
            icone: 'fa-chart-line'
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
            icone: 'fa-users'
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
            icone: 'fa-rocket'
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
            icone: 'fa-chart-bar'
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
            icone: 'fa-briefcase'
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
            icone: 'fa-users-cog'
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
            icone: 'fa-building'
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
            icone: 'fa-handshake'
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
            icone: 'fa-balance-scale'
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
            icone: 'fa-user-md'
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
            icone: 'fa-user-md'
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
            icone: 'fa-seedling'
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
            icone: 'fa-tractor'
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
        },
        {
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
            activite: 'Activité d\'intérêt public',
            leveeFonds: 'Non',
            entreeAssocies: 'Modéré',
            profilOptimal: 'Partenariats public-privé',
            avantages: 'Mutualisation, intérêt public',
            inconvenients: 'Complexité',
            casConseille: 'Partenariats public-privé',
            casDeconseille: 'Activité commerciale isolée',
            transmission: 'Oui',
            plafondCA: 'Aucun plafond',
            icone: 'fa-university'
        }
    ];

    // Variables pour stocker les réponses de l'utilisateur
    let userResponses = {
        profilEntrepreneur: null,
        protectionPatrimoine: 3,
        typeActivite: null,
        activiteReglementee: false,
        chiffreAffaires: null,
        objectifs: [],
        objectifsPriorite: [], // AMÉLIORATION: Ordre de priorité des objectifs
        remuneration: null,
        risque: 3,
        regimeFiscal: null,
        regimeSocial: null // AMÉLIORATION: Ajout du régime social préféré
    };

    // Score maximal possible pour le calcul des pourcentages
    const SCORE_MAX_POSSIBLE = 150;

    // Sélectionner tous les éléments du DOM nécessaires
    const sections = document.querySelectorAll('.question-section');
    const progressSteps = document.querySelectorAll('.progress-step');
    const optionButtons = document.querySelectorAll('.option-btn');
    const patrimoineSlider = document.getElementById('patrimoine-slider');
    const risqueSlider = document.getElementById('risque-slider');
    const checkboxReglementee = document.getElementById('activite-reglementee');
    const objectifCount = document.getElementById('objectif-count');
    const multiButtons = document.querySelectorAll('[data-multi="true"]');
    
    // Boutons de navigation
    const nextStep1 = document.getElementById('next1');
    const nextStep2 = document.getElementById('next2');
    const nextStep3 = document.getElementById('next3');
    const prevStep2 = document.getElementById('prev2');
    const prevStep3 = document.getElementById('prev3');
    const prevStep4 = document.getElementById('prev4');
    const submitBtn = document.getElementById('submit-btn');
    const restartBtn = document.getElementById('restart-btn');
    const compareBtn = document.getElementById('compare-btn');
    const hideComparatifBtn = document.getElementById('hide-comparatif');
    
    // Conteneurs
    const resultsContainer = document.getElementById('results-container');
    const comparatifComplet = document.getElementById('comparatif-complet');
    const comparatifTableBody = document.getElementById('comparatif-table-body');

    // Mettre à jour la date du jour
    const lastUpdateDate = document.getElementById('lastUpdateDate');
    if (lastUpdateDate) {
        const now = new Date();
        const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
        lastUpdateDate.textContent = now.toLocaleDateString('fr-FR', options);
    }

    // Mettre à jour l'horloge de marché
    function updateMarketClock() {
        const marketTime = document.getElementById('marketTime');
        if (marketTime) {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            marketTime.textContent = `${hours}:${minutes}:${seconds}`;
        }
    }

    // Initialiser l'horloge
    updateMarketClock();
    setInterval(updateMarketClock, 1000);

    // Gestion des sections du formulaire
    function showSection(sectionNumber) {
        sections.forEach((section, index) => {
            section.classList.remove('active');
            section.classList.add('hidden');
            
            progressSteps[index].classList.remove('active', 'completed');
        });
        
        sections[sectionNumber - 1].classList.remove('hidden');
        sections[sectionNumber - 1].classList.add('active');
        
        // Mettre à jour les étapes de progression
        progressSteps[sectionNumber - 1].classList.add('active');
        
        for (let i = 0; i < sectionNumber - 1; i++) {
            progressSteps[i].classList.add('completed');
        }
        
        // Scroll vers le haut
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Gestion des boutons d'option simples
    optionButtons.forEach(button => {
        if (!button.hasAttribute('data-multi')) {
            button.addEventListener('click', function() {
                // Désélectionner tous les boutons du même groupe
                const parentDiv = this.parentElement;
                parentDiv.querySelectorAll('.option-btn').forEach(btn => {
                    btn.classList.remove('selected');
                });
                
                // Sélectionner ce bouton
                this.classList.add('selected');
            });
        }
    });

    // AMÉLIORATION: Gestion améliorée des boutons d'options multiples avec priorité
    let multiSelectionCount = 0;
    let multiSelectionOrder = []; // Pour suivre l'ordre de sélection
    
    multiButtons.forEach(button => {
        button.addEventListener('click', function() {
            const objValue = this.getAttribute('data-value');
            
            if (this.classList.contains('selected')) {
                // Désélection d'un objectif
                this.classList.remove('selected');
                multiSelectionCount--;
                
                // Mettre à jour l'ordre de sélection
                const index = multiSelectionOrder.indexOf(objValue);
                if (index > -1) {
                    multiSelectionOrder.splice(index, 1);
                }
                
                // Mettre à jour l'affichage des priorités
                updateObjectifPriorities();
                
                objectifCount.textContent = `Sélectionnez jusqu'à 3 objectifs principaux (${multiSelectionCount}/3)`;
                objectifCount.classList.remove('text-red-400');
            } else if (multiSelectionCount < 3) {
                // Sélection d'un nouvel objectif
                this.classList.add('selected');
                multiSelectionCount++;
                
                // Ajouter à l'ordre de sélection
                multiSelectionOrder.push(objValue);
                
                // Mettre à jour l'affichage des priorités
                updateObjectifPriorities();
                
                objectifCount.textContent = `Sélectionnez jusqu'à 3 objectifs principaux (${multiSelectionCount}/3)`;
                
                if (multiSelectionCount === 3) {
                    objectifCount.classList.add('text-red-400');
                }
            } else {
                // Afficher un message d'erreur
                objectifCount.textContent = "Maximum 3 objectifs ! Désélectionnez-en un pour changer.";
                objectifCount.classList.add('text-red-400');
            }
        });
    });

    // AMÉLIORATION: Mise à jour des priorités affichées
    function updateObjectifPriorities() {
        // Retirer toutes les badges de priorité existantes
        document.querySelectorAll('.priority-badge').forEach(badge => badge.remove());
        
        // Ajouter des badges de priorité aux objectifs sélectionnés
        multiSelectionOrder.forEach((objValue, index) => {
            const button = document.querySelector(`.option-btn[data-value="${objValue}"]`);
            if (button && button.classList.contains('selected')) {
                let badge = document.createElement('div');
                badge.classList.add('priority-badge', 'absolute', 'top-2', 'right-2', 'bg-green-500', 'text-gray-900', 'rounded-full', 'w-6', 'h-6', 'flex', 'items-center', 'justify-center', 'text-xs', 'font-bold');
                badge.innerHTML = (index + 1);
                button.style.position = 'relative'; // Assurer que le bouton est en position relative
                button.appendChild(badge);
            }
        });
    }

    // Gestion du checkbox d'activité réglementée
    checkboxReglementee.addEventListener('change', function() {
        userResponses.activiteReglementee = this.checked;
    });

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

    // Gestion des boutons de navigation
    nextStep1.addEventListener('click', function() {
        collectSection1Data();
        saveProgress();
        showSection(2);
    });

    nextStep2.addEventListener('click', function() {
        collectSection2Data();
        saveProgress();
        showSection(3);
    });

    nextStep3.addEventListener('click', function() {
        collectSection3Data();
        saveProgress();
        showSection(4);
    });

    prevStep2.addEventListener('click', function() {
        showSection(1);
    });

    prevStep3.addEventListener('click', function() {
        showSection(2);
    });

    prevStep4.addEventListener('click', function() {
        showSection(3);
    });

    submitBtn.addEventListener('click', function() {
        collectSection4Data();
        saveProgress();
        showSection(5);
        generateResults();
    });

    restartBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetSimulation();
    });

    compareBtn.addEventListener('click', function(e) {
        e.preventDefault();
        showComparatifComplet();
    });

    hideComparatifBtn.addEventListener('click', function(e) {
        e.preventDefault();
        hideComparatifComplet();
    });

    // Collecter les données de chaque section
    function collectSection1Data() {
        const selectedProfile = document.querySelector('#section1 .option-btn.selected');
        if (selectedProfile) {
            userResponses.profilEntrepreneur = selectedProfile.getAttribute('data-value');
        }
        
        userResponses.protectionPatrimoine = parseInt(patrimoineSlider.value);
    }

    function collectSection2Data() {
        const selectedActivity = document.querySelector('#section2 .option-btn.selected:first-of-type');
        if (selectedActivity) {
            userResponses.typeActivite = selectedActivity.getAttribute('data-value');
        }
        
        userResponses.activiteReglementee = checkboxReglementee.checked;
        
        const selectedCA = document.querySelector('#section2 .option-btn.selected:nth-of-type(2)');
        if (selectedCA) {
            userResponses.chiffreAffaires = selectedCA.getAttribute('data-value');
        }
    }

    function collectSection3Data() {
        // AMÉLIORATION: Collecter objectifs avec priorité
        userResponses.objectifs = [];
        userResponses.objectifsPriorite = [];
        
        // Utiliser l'ordre de sélection pour déterminer la priorité
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
    }

    function collectSection4Data() {
        userResponses.risque = parseInt(risqueSlider.value);
        
        const selectedFiscal = document.querySelector('#section4 .option-btn.selected:first-of-type');
        if (selectedFiscal) {
            userResponses.regimeFiscal = selectedFiscal.getAttribute('data-value');
        }
        
        const selectedRegimeSocial = document.querySelector('#section4 .option-btn.selected:nth-of-type(2)');
        if (selectedRegimeSocial) {
            userResponses.regimeSocial = selectedRegimeSocial.getAttribute('data-value');
        }
    }

    // AMÉLIORATION MAJEURE: Ajout d'un objet pour les simulations fiscales
    const simulationsFiscales = {
        calculerIR: function(revenuAnnuel, formeSociale) {
            // Logique simplifiée pour démonstration
            let abattement = 0;
            
            if (formeSociale === 'micro-entreprise') {
                // Abattement forfaitaire selon nature d'activité (on prend 34% par défaut)
                abattement = 0.34;
            }
            
            const revenuImposable = revenuAnnuel * (1 - abattement);
            
            // Barème IR 2025 simplifié
            let impot = 0;
            if (revenuImposable <= 10777) impot = 0;
            else if (revenuImposable <= 27478) impot = (revenuImposable - 10777) * 0.11;
            else if (revenuImposable <= 78570) impot = (revenuImposable - 27478) * 0.30 + 1837;
            else if (revenuImposable <= 168994) impot = (revenuImposable - 78570) * 0.41 + 17195;
            else impot = (revenuImposable - 168994) * 0.45 + 54196;
            
            return impot;
        },
        
        calculerIS: function(benefice) {
            // Taux IS 2025
            if (benefice <= 42500) {
                return benefice * 0.15;
            } else {
                return 42500 * 0.15 + (benefice - 42500) * 0.25;
            }
        },
        
        calculerChargesSociales: function(revenu, regimeSocial) {
            if (regimeSocial === 'TNS' || regimeSocial.includes('TNS')) {
                // Taux moyen charges TNS (simplifié)
                return revenu * 0.45;
            } else if (regimeSocial === 'Assimilé salarié' || regimeSocial.includes('salarié')) {
                // Part salariale + patronale (simplifié)
                return revenu * 0.82;
            }
            return revenu * 0.65; // Taux par défaut
        },
        
        // Fonction principale à appeler
        simulerImpactFiscal: function(forme, revenuAnnuel) {
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
            
            // Calculer les charges
            simulation.chargesSociales = this.calculerChargesSociales(revenuAnnuel, regimeSocial);
            
            // Calculer l'impôt
            if (regimeFiscal === 'IR') {
                simulation.impot = this.calculerIR(revenuAnnuel - simulation.chargesSociales, forme.id);
                simulation.revenueNet = revenuAnnuel - simulation.impot - simulation.chargesSociales;
            } else {
                // Pour IS, calcul simplifié: 
                // 1. On calcule le bénéfice (80% du revenu)
                const benefice = revenuAnnuel * 0.8;
                // 2. On calcule l'IS sur ce bénéfice
                simulation.impotSociete = this.calculerIS(benefice);
                // 3. On distribue 50% en salaire et 50% en dividendes
                const salaire = revenuAnnuel * 0.5;
                const dividendes = benefice - simulation.impotSociete - salaire;
                
                // 4. On calcule l'IR sur le salaire et les charges sociales
                simulation.chargesSalariales = this.calculerChargesSociales(salaire, regimeSocial);
                simulation.impotSalaire = this.calculerIR(salaire - simulation.chargesSalariales, 'salaire');
                
                // 5. On calcule l'IR sur les dividendes (PFU 30%)
                simulation.impotDividendes = dividendes * 0.3;
                
                // Impôt total
                simulation.impot = simulation.impotSalaire + simulation.impotDividendes;
                
                // Revenu net
                simulation.revenueNet = salaire - simulation.chargesSalariales - simulation.impotSalaire + dividendes - simulation.impotDividendes;
                
                // Ajouter détails IS pour affichage
                simulation.impotDetails = {
                    is: simulation.impotSociete,
                    salaire: salaire,
                    dividendes: dividendes,
                    impotSalaire: simulation.impotSalaire,
                    impotDividendes: simulation.impotDividendes
                };
            }
            
            return simulation;
        }
    };

    // NOUVELLE FONCTION: Obtenir des alternatives recommandées en cas d'incompatibilité
    function getAlternativesRecommandees(formeId, raison) {
        let alternatives = [];
        
        if (formeId === 'micro-entreprise' && raison === 'activiteReglementee') {
            alternatives = formesJuridiques.filter(f => 
                (f.categorie.includes('Libérale') && f.responsabilite.includes('Limitée')) ||
                ['eurl', 'sasu'].includes(f.id)
            ).slice(0, 2);
        } else if (formeId === 'micro-entreprise' && raison === 'caEleve') {
            alternatives = formesJuridiques.filter(f => 
                f.id === 'eurl' || f.id === 'sasu'
            );
        } else if (raison === 'leveeFonds') {
            alternatives = formesJuridiques.filter(f => 
                f.leveeFonds === 'Oui'
            ).slice(0, 2);
        } else if (raison === 'protection' && formeId.includes('sc')) {
            alternatives = formesJuridiques.filter(f => 
                f.protectionPatrimoine === 'Oui' && ['sarl', 'sas', 'sasu'].includes(f.id)
            ).slice(0, 2);
        }
        
        return alternatives;
    }

    // AMÉLIORATION MAJEURE: Génération des résultats avec coefficients dynamiques et incompatibilités absolues
    function generateResults() {
        // NOUVELLE AMÉLIORATION: Définir des coefficients adaptés aux priorités de l'utilisateur
        let coefficients = {
            profilEntrepreneur: 1,
            protectionPatrimoine: 1,
            typeActivite: 1,
            chiffreAffaires: 1,
            objectifs: 1,
            remuneration: 1,
            risque: 1,
            regimeFiscal: 1,
            regimeSocial: 1
        };
        
        // Ajuster les coefficients selon les priorités et réponses
        userResponses.objectifsPriorite.forEach(obj => {
            if (obj.priorite === 1) {
                // Priorité 1 = coefficient x3
                if (obj.valeur === 'protection') coefficients.protectionPatrimoine = 3;
                if (obj.valeur === 'croissance') coefficients.leveeFonds = 3;
                if (obj.valeur === 'simplicite') coefficients.simplicite = 3;
                if (obj.valeur === 'fiscalite') coefficients.regimeFiscal = 3;
                if (obj.valeur === 'credibilite') coefficients.profilEntrepreneur = 2;
            } else if (obj.priorite === 2) {
                // Priorité 2 = coefficient x2
                if (obj.valeur === 'protection') coefficients.protectionPatrimoine = 2;
                if (obj.valeur === 'croissance') coefficients.leveeFonds = 2;
                if (obj.valeur === 'simplicite') coefficients.simplicite = 2;
                if (obj.valeur === 'fiscalite') coefficients.regimeFiscal = 2;
            }
        });
        
        // Protection patrimoniale très importante = facteur bloquant
        const facteursBlocants = [];
        if (userResponses.protectionPatrimoine >= 5) {
            facteursBlocants.push({
                critere: 'protectionPatrimoine',
                message: 'La protection du patrimoine est une priorité absolue'
            });
        }
        
        // Initialiser la liste des formes incompatibles
        let formesIncompatibles = [];

        // Calculer les scores pour chaque forme juridique
        const results = formesJuridiques.map(forme => {
            // Initialiser les scores par catégorie pour l'équilibre 60/40
            let scoreCriteresStructurels = 0;
            let scoreObjectifs = 0;
            
            let score = 0;
            let details = [];
            let scoreDetails = {}; // Pour l'affichage du détail des scores
            let incompatibilites = [];
            let incompatibiliteMajeure = false;

            // PARTIE STRUCTURELLE (60%)
            
            // Profil entrepreneur
            if (userResponses.profilEntrepreneur === 'solo' && forme.associes === '1') {
                const points = 20 * coefficients.profilEntrepreneur;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté aux entrepreneurs individuels');
                scoreDetails.profilEntrepreneur = {
                    points: points,
                    label: 'Adapté aux entrepreneurs individuels'
                };
            } else if (userResponses.profilEntrepreneur === 'famille' && forme.profilOptimal.includes('familiale')) {
                const points = 20 * coefficients.profilEntrepreneur;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Idéal pour les projets familiaux');
                scoreDetails.profilEntrepreneur = {
                    points: points,
                    label: 'Idéal pour les projets familiaux'
                };
            } else if (userResponses.profilEntrepreneur === 'associes' && parseInt(forme.associes.split('-')[0]) > 1) {
                const points = 20 * coefficients.profilEntrepreneur;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté à plusieurs associés');
                scoreDetails.profilEntrepreneur = {
                    points: points,
                    label: 'Adapté à plusieurs associés'
                };
            } else if (userResponses.profilEntrepreneur === 'investisseurs' && forme.leveeFonds === 'Oui') {
                const points = 20 * coefficients.profilEntrepreneur;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Permet la levée de fonds');
                scoreDetails.profilEntrepreneur = {
                    points: points,
                    label: 'Permet la levée de fonds'
                };
            } else if (userResponses.profilEntrepreneur === 'investisseurs' && forme.leveeFonds === 'Non') {
                // INCOMPATIBILITÉ: Besoin de lever des fonds avec structure qui ne le permet pas
                score -= 40;
                scoreCriteresStructurels -= 40;
                details.push('⚠️ Impossible de lever des fonds significatifs');
                scoreDetails.profilEntrepreneur = {
                    points: -40,
                    label: '⚠️ Impossible de lever des fonds significatifs'
                };
                
                incompatibilites.push({
                    raison: 'leveeFonds',
                    message: 'Cette forme ne permet pas la levée de fonds',
                    alternatives: getAlternativesRecommandees(forme.id, 'leveeFonds')
                });
                
                if (userResponses.objectifs.includes('croissance')) {
                    incompatibiliteMajeure = true;
                }
            } else {
                scoreDetails.profilEntrepreneur = {
                    points: 0,
                    label: 'Profil entrepreneur non optimal'
                };
            }

            // Protection patrimoine
            if (userResponses.protectionPatrimoine >= 4 && forme.protectionPatrimoine === 'Oui') {
                const points = 15 * coefficients.protectionPatrimoine;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Bonne protection du patrimoine personnel');
                scoreDetails.protectionPatrimoine = {
                    points: points,
                    label: 'Bonne protection du patrimoine personnel'
                };
            } else if (userResponses.protectionPatrimoine >= 4 && forme.protectionPatrimoine === 'Non') {
                // INCOMPATIBILITÉ: Besoin de protection avec structure qui ne le permet pas
                score -= 25 * coefficients.protectionPatrimoine;
                scoreCriteresStructurels -= 25 * coefficients.protectionPatrimoine;
                details.push('⚠️ Ne protège pas suffisamment votre patrimoine personnel');
                scoreDetails.protectionPatrimoine = {
                    points: -25 * coefficients.protectionPatrimoine,
                    label: '⚠️ Ne protège pas suffisamment votre patrimoine'
                };
                
                incompatibilites.push({
                    raison: 'protection',
                    message: 'Ne protège pas suffisamment votre patrimoine personnel',
                    alternatives: getAlternativesRecommandees(forme.id, 'protection')
                });
                
                // Si protection est un facteur bloquant, c'est une incompatibilité majeure
                if (facteursBlocants.some(f => f.critere === 'protectionPatrimoine')) {
                    incompatibiliteMajeure = true;
                }
            } else if (userResponses.protectionPatrimoine <= 2 && forme.protectionPatrimoine === 'Non') {
                const points = 5;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Protection patrimoniale moins essentielle pour vous');
                scoreDetails.protectionPatrimoine = {
                    points: points,
                    label: 'Protection patrimoniale moins essentielle pour vous'
                };
            } else {
                scoreDetails.protectionPatrimoine = {
                    points: 0,
                    label: 'Protection du patrimoine peu adaptée'
                };
            }

            // Type d'activité
            if (userResponses.typeActivite === 'liberale' && forme.categorie.includes('Libérale')) {
                const points = 15 * coefficients.typeActivite;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté aux professions libérales');
                scoreDetails.typeActivite = {
                    points: points,
                    label: 'Adapté aux professions libérales'
                };
            } else if (userResponses.typeActivite === 'commerciale' && forme.categorie.includes('Commerciale')) {
                const points = 15 * coefficients.typeActivite;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté aux activités commerciales');
                scoreDetails.typeActivite = {
                    points: points,
                    label: 'Adapté aux activités commerciales'
                };
            } else if (userResponses.typeActivite === 'artisanale' && forme.categorie.includes('Commerciale')) {
                const points = 15 * coefficients.typeActivite;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté aux activités artisanales');
                scoreDetails.typeActivite = {
                    points: points,
                    label: 'Adapté aux activités artisanales'
                };
            } else if (userResponses.typeActivite === 'agricole' && forme.categorie.includes('Agricole')) {
                const points = 20 * coefficients.typeActivite;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Spécifiquement conçu pour l\'agriculture');
                scoreDetails.typeActivite = {
                    points: points,
                    label: 'Spécifiquement conçu pour l\'agriculture'
                };
            } else if (userResponses.typeActivite === 'agricole' && !forme.categorie.includes('Agricole')) {
                // Incompatibilité pour activité agricole avec forme non adaptée
                score -= 30;
                scoreCriteresStructurels -= 30;
                details.push('⚠️ Non adapté à l\'activité agricole');
                scoreDetails.typeActivite = {
                    points: -30,
                    label: '⚠️ Non adapté à l\'activité agricole'
                };
                incompatibiliteMajeure = true;
            } else {
                scoreDetails.typeActivite = {
                    points: 0,
                    label: 'Type d\'activité peu adapté'
                };
            }

            // AMÉLIORATION: Activité réglementée - Incompatibilités majeures
            if (userResponses.activiteReglementee) {
                if (forme.categorie.includes('Libérale') || forme.activite.includes('libérales réglementées')) {
                    const points = 15; // Bonus augmenté
                    score += points;
                    scoreCriteresStructurels += points;
                    details.push('Parfaitement adapté aux activités réglementées');
                    scoreDetails.activiteReglementee = {
                        points: points,
                        label: 'Parfaitement adapté aux activités réglementées'
                    };
                } else if (['micro-entreprise', 'ei'].includes(forme.id)) {
                    score -= 80; // Forte pénalité rendant incompatible
                    scoreCriteresStructurels -= 80;
                    details.push('⚠️ INCOMPATIBLE avec une activité réglementée');
                    scoreDetails.activiteReglementee = {
                        points: -80,
                        label: '⚠️ INCOMPATIBLE avec une activité réglementée'
                    };
                    
                    incompatibilites.push({
                        raison: 'activiteReglementee',
                        message: 'Cette forme juridique ne convient pas pour les activités réglementées',
                        alternatives: getAlternativesRecommandees(forme.id, 'activiteReglementee')
                    });
                    
                    incompatibiliteMajeure = true;
                }
            }

            // Chiffre d'affaires
            if (userResponses.chiffreAffaires === 'faible' && forme.id === 'micro-entreprise') {
                const points = 15;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté aux petits volumes d\'activité');
                scoreDetails.chiffreAffaires = {
                    points: points,
                    label: 'Adapté aux petits volumes d\'activité'
                };
            } else if (userResponses.chiffreAffaires === 'eleve' && ['sarl', 'sas', 'sasu', 'sa'].includes(forme.id)) {
                const points = 15;
                score += points;
                scoreCriteresStructurels += points;
                details.push('Adapté aux volumes d\'activité importants');
                scoreDetails.chiffreAffaires = {
                    points: points,
                    label: 'Adapté aux volumes d\'activité importants'
                };
            } else if (userResponses.chiffreAffaires === 'eleve' && forme.id === 'micro-entreprise') {
                score -= 50; // Pénalité augmentée pour incompatibilité
                scoreCriteresStructurels -= 50;
                details.push('⚠️ DÉPASSEMENT probable des plafonds de CA');
                scoreDetails.chiffreAffaires = {
                    points: -50,
                    label: '⚠️ DÉPASSEMENT probable des plafonds de CA'
                };
                
                incompatibilites.push({
                    raison: 'caEleve',
                    message: 'Votre CA prévisionnel dépassera probablement les plafonds autorisés',
                    alternatives: getAlternativesRecommandees(forme.id, 'caEleve')
                });
                
                incompatibiliteMajeure = true;
            } else {
                scoreDetails.chiffreAffaires = {
                    points: 0,
                    label: 'Volume d\'activité compatible'
                };
            }

            // PARTIE OBJECTIFS (40%)
            
            // AMÉLIORATION: Objectifs avec pondération selon priorité
            if (userResponses.objectifsPriorite.length > 0) {
                userResponses.objectifsPriorite.forEach(obj => {
                    let points = 0;
                    let label = '';
                    
                    // Pondération selon priorité
                    const pointsBase = obj.priorite === 1 ? 15 : (obj.priorite === 2 ? 10 : 5);
                    
                    if (obj.valeur === 'simplicite' && forme.formalites.includes('simplifiées')) {
                        points = pointsBase;
                        label = 'Formalités administratives simplifiées';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                    } else if (obj.valeur === 'economie' && !forme.formalites.includes('Complexes')) {
                        points = pointsBase;
                        label = 'Coûts de fonctionnement raisonnables';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                    } else if (obj.valeur === 'fiscalite' && forme.fiscaliteOption === 'Oui') {
                        points = pointsBase;
                        label = 'Options fiscales flexibles';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                    } else if (obj.valeur === 'protection' && forme.protectionPatrimoine === 'Oui') {
                        points = pointsBase;
                        label = 'Bonne protection patrimoniale';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                    } else if (obj.valeur === 'croissance' && forme.leveeFonds === 'Oui') {
                        points = pointsBase;
                        label = 'Favorise la croissance et le développement';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                    } else if (obj.valeur === 'croissance' && forme.leveeFonds === 'Non' && obj.priorite === 1) {
                        // Pénalité plus forte si objectif principal
                        points = -30;
                        label = '⚠️ Incompatible avec vos objectifs de croissance';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                        
                        if (obj.priorite === 1) {
                            incompatibiliteMajeure = true;
                        }
                    } else if (obj.valeur === 'credibilite' && forme.publicationComptes === 'Oui') {
                        points = pointsBase;
                        label = 'Image professionnelle auprès des partenaires';
                        score += points;
                        scoreObjectifs += points;
                        details.push(label);
                    }
                    
                    // Stocker le détail du score pour cet objectif
                    scoreDetails[`objectif_${obj.valeur}`] = {
                        points: points,
                        label: label || 'Objectif non adapté',
                        priorite: obj.priorite
                    };
                });
            }

            // Rémunération
            if (userResponses.remuneration === 'salaire' && forme.regimeSocial.includes('salarié')) {
                const points = 10;
                score += points;
                scoreObjectifs += points;
                details.push('Permet une rémunération par salaire');
                scoreDetails.remuneration = {
                    points: points,
                    label: 'Permet une rémunération par salaire'
                };
            } else if (userResponses.remuneration === 'dividendes' && forme.fiscal.includes('Oui')) {
                const points = 10;
                score += points;
                scoreObjectifs += points;
                details.push('Facilite la distribution de dividendes');
                scoreDetails.remuneration = {
                    points: points,
                    label: 'Facilite la distribution de dividendes'
                };
            } else if (userResponses.remuneration === 'mixte' && forme.fiscal.includes('Oui') && forme.regimeSocial.includes('salarié')) {
                const points = 10;
                score += points;
                scoreObjectifs += points;
                details.push('Permet une rémunération mixte salaire/dividendes');
                scoreDetails.remuneration = {
                    points: points,
                    label: 'Permet une rémunération mixte salaire/dividendes'
                };
            } else if (userResponses.remuneration === 'mixte' && (!forme.fiscal.includes('Oui') || !forme.regimeSocial.includes('salarié'))) {
                // Incompatibilité pour rémunération mixte
                score -= 15;
                scoreObjectifs -= 15;
                details.push('⚠️ Ne permet pas une rémunération mixte');
                scoreDetails.remuneration = {
                    points: -15,
                    label: '⚠️ Ne permet pas une rémunération mixte'
                };
            } else {
                scoreDetails.remuneration = {
                    points: 0,
                    label: 'Mode de rémunération peu adapté'
                };
            }

            // Risque
            if (userResponses.risque <= 2 && forme.responsabilite.includes('Limitée')) {
                const points = 10;
                score += points;
                scoreObjectifs += points;
                details.push('Limitation des risques personnels');
                scoreDetails.risque = {
                    points: points,
                    label: 'Limitation des risques personnels'
                };
            } else if (userResponses.risque <= 2 && !forme.responsabilite.includes('Limitée')) {
                // Incompatibilité pour aversion au risque
                score -= 20;
                scoreObjectifs -= 20;
                details.push('⚠️ Responsabilité étendue incompatible avec votre profil prudent');
                scoreDetails.risque = {
                    points: -20,
                    label: '⚠️ Responsabilité étendue incompatible avec votre profil prudent'
                };
            } else if (userResponses.risque >= 4 && forme.responsabilite.includes('Indéfinie')) {
                const points = 5;
                score += points;
                scoreObjectifs += points;
                details.push('Vous acceptez une part de risque plus importante');
                scoreDetails.risque = {
                    points: points,
                    label: 'Vous acceptez une part de risque plus importante'
                };
            } else {
                scoreDetails.risque = {
                    points: 0,
                    label: 'Niveau de risque acceptable'
                };
            }

            // Régime fiscal
            if (userResponses.regimeFiscal === 'ir' && forme.fiscalite.includes('IR')) {
                const points = 10 * coefficients.regimeFiscal;
                score += points;
                scoreObjectifs += points;
                details.push('Fiscalité sur le revenu (IR) adaptée à vos besoins');
                scoreDetails.regimeFiscal = {
                    points: points,
                    label: 'Fiscalité IR adaptée à vos besoins'
                };
            } else if (userResponses.regimeFiscal === 'is' && forme.fiscalite.includes('IS')) {
                const points = 10 * coefficients.regimeFiscal;
                score += points;
                scoreObjectifs += points;
                details.push('Impôt sur les sociétés (IS) adapté à vos besoins');
                scoreDetails.regimeFiscal = {
                    points: points,
                    label: 'Fiscalité IS adaptée à vos besoins'
                };
            } else if (userResponses.regimeFiscal === 'flexible' && forme.fiscaliteOption === 'Oui') {
                const points = 15 * coefficients.regimeFiscal;
                score += points;
                scoreObjectifs += points;
                details.push('Options fiscales flexibles selon vos besoins');
                scoreDetails.regimeFiscal = {
                    points: points,
                    label: 'Options fiscales flexibles selon vos besoins'
                };
            } else if (userResponses.regimeFiscal && userResponses.regimeFiscal !== 'flexible' && !forme.fiscalite.includes(userResponses.regimeFiscal.toUpperCase())) {
                // Incompatibilité régime fiscal
                const points = -10 * coefficients.regimeFiscal;
                score += points;
                scoreObjectifs += points;
                details.push('⚠️ Régime fiscal non compatible avec vos préférences');
                scoreDetails.regimeFiscal = {
                    points: points,
                    label: '⚠️ Régime fiscal non compatible'
                };
            } else {
                scoreDetails.regimeFiscal = {
                    points: 0,
                    label: 'Régime fiscal peu adapté'
                };
            }

            // AMÉLIORATION: Régime social
            if (userResponses.regimeSocial === 'tns' && forme.regimeSocial.includes('TNS')) {
                const points = 10;
                score += points;
                scoreObjectifs += points;
                details.push('Régime social des indépendants (TNS) adapté');
                scoreDetails.regimeSocial = {
                    points: points,
                    label: 'Régime TNS adapté à vos préférences'
                };
            } else if (userResponses.regimeSocial === 'salarie' && forme.regimeSocial.includes('salarié')) {
                const points = 10;
                score += points;
                scoreObjectifs += points;
                details.push('Régime assimilé salarié adapté à vos préférences');
                scoreDetails.regimeSocial = {
                    points: points,
                    label: 'Régime assimilé salarié adapté'
                };
            } else if (userResponses.regimeSocial && !forme.regimeSocial.includes(userResponses.regimeSocial === 'tns' ? 'TNS' : 'salarié')) {
                score -= 15; // Pénalité pour incompatibilité
                scoreObjectifs -= 15;
                details.push('⚠️ Régime social non compatible avec vos préférences');
                scoreDetails.regimeSocial = {
                    points: -15,
                    label: '⚠️ Régime social incompatible'
                };
            } else {
                scoreDetails.regimeSocial = {
                    points: 0,
                    label: 'Pas de préférence de régime social'
                };
            }

            // Calcul final avec pondération structurel/objectifs (60/40)
            const scoreOriginal = score;
            
            // On normalise les scores sur 100 points chacun
            const maxScoreStructurel = 100;
            const maxScoreObjectifs = 100;
            
            const scoreStructurelNormalise = Math.min(100, (scoreCriteresStructurels / maxScoreStructurel) * 100);
            const scoreObjectifsNormalise = Math.min(100, (scoreObjectifs / maxScoreObjectifs) * 100);
            
            // On applique la pondération 60/40
            const scorePondere = (scoreStructurelNormalise * 0.6) + (scoreObjectifsNormalise * 0.4);
            
            // On ramène à l'échelle SCORE_MAX_POSSIBLE
            score = Math.round((scorePondere / 100) * SCORE_MAX_POSSIBLE);
            
            // Si incompatibilité majeure, on met un score très négatif
            if (incompatibiliteMajeure) {
                score = -100;
            }

            // Déterminer la catégorie de compatibilité
            let compatibilite;
            if (incompatibiliteMajeure) {
                compatibilite = 'INCOMPATIBLE';
            } else if (score < 0) {
                compatibilite = 'DÉCONSEILLÉ';
            } else if (score / SCORE_MAX_POSSIBLE < 0.60) {
                compatibilite = 'PEU ADAPTÉ';
            } else if (score / SCORE_MAX_POSSIBLE < 0.85) {
                compatibilite = 'COMPATIBLE';
            } else {
                compatibilite = 'RECOMMANDÉ';
            }

            // Retourner l'objet avec les scores calculés et les détails
            return {
                forme: forme,
                score: score,
                scoreOriginal: scoreOriginal,
                scoreCriteresStructurels: scoreCriteresStructurels,
                scoreObjectifs: scoreObjectifs,
                details: details,
                scoreDetails: scoreDetails,
                compatibilite: compatibilite,
                incompatibilites: incompatibilites,
                incompatibiliteMajeure: incompatibiliteMajeure
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
        displayResults(resultatsAffichage, resultatsIncompatibles);
        
        // Préparer les données du tableau comparatif complet
        prepareComparatifTable(formesJuridiques);
        
        // Retourner tous les résultats pour référence
        return {
            recommandes: resultatsRecommandes,
            compatibles: resultatsCompatibles,
            peuAdaptes: resultatsPeuAdaptes,
            deconseilles: resultatsDeconseilles,
            incompatibles: resultatsIncompatibles
        };
    }

    // AMÉLIORATION MAJEURE: Fonction pour afficher les formes juridiques incompatibles
    function displayIncompatibilites(incompatibles) {
        if (incompatibles.length === 0) return '';
        
        const container = document.createElement('div');
        container.className = 'bg-red-900 bg-opacity-20 p-6 rounded-xl mt-8 border border-red-800';
        
        container.innerHTML = `
            <h4 class="text-xl font-bold text-red-400 mb-4">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                Formes juridiques déconseillées
            </h4>
            <p class="mb-4">Ces statuts présentent des incompatibilités majeures avec votre profil :</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        // Limiter à 4 incompatibilités maximum pour ne pas surcharger l'affichage
        incompatibles.slice(0, 4).forEach(result => {
            const forme = result.forme;
            
            let incompHtml = `
                <div class="p-4 bg-blue-900 bg-opacity-30 rounded-lg">
                    <h5 class="font-bold flex items-center text-red-300">
                        <i class="fas ${forme.icone || 'fa-building'} text-red-400 mr-2"></i>
                        ${forme.nom}
                    </h5>
                    <ul class="mt-2 space-y-1">
            `;
            
            result.incompatibilites.forEach(incomp => {
                incompHtml += `<li class="text-red-300 flex items-start">
                    <i class="fas fa-times text-red-400 mr-2 mt-1"></i> 
                    <span>${incomp.message}</span>
                </li>`;
                
                if (incomp.alternatives && incomp.alternatives.length > 0) {
                    incompHtml += `
                        <li class="text-green-400 mt-2 flex items-start">
                            <i class="fas fa-arrow-right text-green-400 mr-2 mt-1"></i>
                            <span>Alternatives recommandées: 
                                ${incomp.alternatives.map(alt => alt.nom).join(', ')}
                            </span>
                        </li>
                    `;
                }
            });
            
            incompHtml += `
                    </ul>
                </div>
            `;
            
            container.querySelector('.grid').innerHTML += incompHtml;
        });
        
        container.innerHTML += `</div>`;
        
        return container;
    }

    // AMÉLIORATION MAJEURE: Création d'une matrice de comparaison
    function createComparisonMatrix(results) {
        const criteres = [
            { id: 'protection', label: 'Protection patrimoniale', icon: 'fa-shield-alt' },
            { id: 'simplicite', label: 'Simplicité administrative', icon: 'fa-feather' },
            { id: 'fiscalite', label: 'Optimisation fiscale', icon: 'fa-percentage' },
            { id: 'croissance', label: 'Capacité de croissance', icon: 'fa-rocket' },
            { id: 'remuneration', label: 'Mode de rémunération', icon: 'fa-money-bill-wave' },
            { id: 'ca', label: 'Adaptabilité au CA prévu', icon: 'fa-chart-line' }
        ];
        
        const container = document.createElement('div');
        container.className = 'mt-10 overflow-x-auto';
        
        container.innerHTML = `
            <h4 class="text-xl font-bold text-green-400 mb-4 flex items-center">
                <i class="fas fa-table mr-3"></i>
                Matrice de comparaison
            </h4>
            <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg mb-4 text-sm">
                <p>Ce tableau permet de comparer visuellement les formes juridiques sur les critères essentiels :</p>
                <div class="flex items-center mt-2 space-x-4">
                    <div class="flex items-center"><span class="inline-block w-4 h-4 bg-green-500 rounded-full mr-2"></span> Optimal</div>
                    <div class="flex items-center"><span class="inline-block w-4 h-4 bg-yellow-500 rounded-full mr-2"></span> Acceptable</div>
                    <div class="flex items-center"><span class="inline-block w-4 h-4 bg-red-500 rounded-full mr-2"></span> Inadapté</div>
                </div>
            </div>
            <table class="w-full border-collapse bg-blue-900 bg-opacity-10 rounded-lg overflow-hidden">
                <thead>
                    <tr class="bg-blue-900 bg-opacity-40">
                        <th class="p-3 text-left">Critère</th>
        `;
        
        // Ajouter les entêtes de colonnes (formes juridiques)
        results.forEach(result => {
            container.querySelector('thead tr').innerHTML += `
                <th class="p-3 text-center">
                    <div class="flex flex-col items-center">
                        <i class="fas ${result.forme.icone || 'fa-building'} text-green-400 mb-1 text-lg"></i>
                        <span>${result.forme.nom}</span>
                    </div>
                </th>
            `;
        });
        
        container.querySelector('table').innerHTML += `
                </thead>
                <tbody>
        `;
        
        // Ajouter les lignes de comparaison
        criteres.forEach(critere => {
            let rowHtml = `
                <tr>
                    <td class="p-3 border-b border-gray-700 bg-blue-900 bg-opacity-20">
                        <div class="flex items-center">
                            <i class="fas ${critere.icon} text-green-400 mr-2"></i>
                            <span>${critere.label}</span>
                        </div>
                    </td>
            `;
            
            // Pour chaque forme juridique, déterminer la compatibilité pour ce critère
            results.forEach(result => {
                const forme = result.forme;
                let compatibility = '';
                let bgColor = '';
                let icon = '';
                
                // Logique pour déterminer la compatibilité selon le critère
                switch(critere.id) {
                    case 'protection':
                        if (forme.protectionPatrimoine === 'Oui') {
                            compatibility = 'Optimal';
                            bgColor = 'bg-green-900 bg-opacity-20';
                            icon = '<i class="fas fa-check text-green-400"></i>';
                        } else {
                            compatibility = 'Inadapté';
                            bgColor = 'bg-red-900 bg-opacity-20';
                            icon = '<i class="fas fa-times text-red-400"></i>';
                        }
                        break;
                    case 'simplicite':
                        if (forme.formalites.includes('simplifiées')) {
                            compatibility = 'Optimal';
                            bgColor = 'bg-green-900 bg-opacity-20';
                            icon = '<i class="fas fa-check text-green-400"></i>';
                        } else if (forme.formalites.includes('Complexes')) {
                            compatibility = 'Inadapté';
                            bgColor = 'bg-red-900 bg-opacity-20';
                            icon = '<i class="fas fa-times text-red-400"></i>';
                        } else {
                            compatibility = 'Acceptable';
                            bgColor = 'bg-yellow-900 bg-opacity-20';
                            icon = '<i class="fas fa-minus text-yellow-400"></i>';
                        }
                        break;
                    case 'fiscalite':
                        if (forme.fiscaliteOption === 'Oui') {
                            compatibility = 'Optimal';
                            bgColor = 'bg-green-900 bg-opacity-20';
                            icon = '<i class="fas fa-check text-green-400"></i>';
                        } else {
                            compatibility = 'Acceptable';
                            bgColor = 'bg-yellow-900 bg-opacity-20';
                            icon = '<i class="fas fa-minus text-yellow-400"></i>';
                        }
                        break;
                    case 'croissance':
                        if (forme.leveeFonds === 'Oui') {
                            compatibility = 'Optimal';
                            bgColor = 'bg-green-900 bg-opacity-20';
                            icon = '<i class="fas fa-check text-green-400"></i>';
                        } else {
                            compatibility = 'Inadapté';
                            bgColor = 'bg-red-900 bg-opacity-20';
                            icon = '<i class="fas fa-times text-red-400"></i>';
                        }
                        break;
                    case 'remuneration':
                        if (forme.regimeSocial.includes('salarié') && forme.fiscal.includes('Oui')) {
                            compatibility = 'Optimal';
                            bgColor = 'bg-green-900 bg-opacity-20';
                            icon = '<i class="fas fa-check text-green-400"></i>';
                        } else if (forme.regimeSocial.includes('salarié') || forme.fiscal.includes('Oui')) {
                            compatibility = 'Acceptable';
                            bgColor = 'bg-yellow-900 bg-opacity-20';
                            icon = '<i class="fas fa-minus text-yellow-400"></i>';
                        } else {
                            compatibility = 'Limité';
                            bgColor = 'bg-red-900 bg-opacity-20';
                            icon = '<i class="fas fa-times text-red-400"></i>';
                        }
                        break;
                    case 'ca':
                        if (forme.id === 'micro-entreprise') {
                            compatibility = 'Limité par plafond';
                            bgColor = 'bg-yellow-900 bg-opacity-20';
                            icon = '<i class="fas fa-minus text-yellow-400"></i>';
                        } else {
                            compatibility = 'Sans limite';
                            bgColor = 'bg-green-900 bg-opacity-20';
                            icon = '<i class="fas fa-check text-green-400"></i>';
                        }
                        break;
                }
                
                rowHtml += `
                    <td class="p-3 text-center border-b border-gray-700 ${bgColor}">
                        ${icon}
                        <div class="text-xs mt-1">${compatibility}</div>
                    </td>
                `;
            });
            
            rowHtml += `</tr>`;
            container.querySelector('tbody').innerHTML += rowHtml;
        });
        
        container.querySelector('table').innerHTML += `</tbody>`;
        
        return container;
    }

    // AMÉLIORATION MAJEURE: Ajout de la simulation fiscale
    function createFiscalSimulation(results) {
        const container = document.createElement('div');
        container.className = 'bg-blue-900 bg-opacity-30 p-6 rounded-xl mt-8';
        
        container.innerHTML = `
            <h4 class="text-xl font-bold text-green-400 mb-4 flex items-center">
                <i class="fas fa-calculator mr-3"></i>
                Simulation fiscale et sociale
            </h4>
            <p class="mb-4">Estimez l'impact fiscal et social de votre choix en fonction de votre revenu annuel prévisionnel.</p>
            
            <div class="flex flex-wrap items-center gap-4 mb-4">
                <label class="mr-2 whitespace-nowrap">Revenu annuel estimé :</label>
                <input type="number" id="revenu-simulation" class="bg-blue-900 bg-opacity-50 border border-gray-600 rounded px-3 py-2 w-36" placeholder="ex: 50000" min="1000" max="500000" step="1000" value="50000">
                <button id="calculer-simulation" class="bg-green-500 hover:bg-green-400 text-gray-900 px-4 py-2 rounded flex items-center">
                    <i class="fas fa-play mr-2"></i> Simuler
                </button>
            </div>
            
            <div id="resultats-simulation" class="hidden mt-4"></div>
            
            <div class="text-sm mt-4 bg-blue-900 bg-opacity-40 p-3 rounded-lg flex items-start">
                <i class="fas fa-info-circle text-blue-300 mr-2 mt-1"></i>
                <div>
                    <p>Cette simulation est donnée à titre indicatif et se base sur les barèmes 2025 simplifiés. Consultez un expert-comptable pour une analyse précise adaptée à votre situation.</p>
                </div>
            </div>
        `;
        
        return container;
    }

    // AMÉLIORATION: Affichage des résultats avec les nouvelles fonctionnalités
    function displayResults(results, incompatibles) {
        resultsContainer.innerHTML = '';
        
        // 1. AMÉLIORATION: Ajouter le bouton de recalcul rapide
        const infoContainer = document.createElement('div');
        infoContainer.classList.add('bg-blue-900', 'bg-opacity-20', 'p-4', 'rounded-lg', 'mb-6', 'text-sm');
        infoContainer.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-info-circle text-green-400 mt-1 mr-3"></i>
                <div>
                    <p class="mb-2">Les informations juridiques présentées sont à jour selon la législation française en vigueur (avril 2025).</p>
                    <p>Les recommandations sont personnalisées selon votre profil et vos priorités.</p>
                </div>
            </div>
        `;
        resultsContainer.appendChild(infoContainer);
        
        const recalculContainer = document.createElement('div');
        recalculContainer.classList.add('flex', 'justify-center', 'mb-8');
        
        const recalculBtn = document.createElement('button');
        recalculBtn.classList.add('border', 'border-green-400', 'text-green-400', 'hover:bg-green-900', 'hover:bg-opacity-30', 'font-semibold', 'py-2', 'px-4', 'rounded-lg', 'transition', 'flex', 'items-center');
        recalculBtn.innerHTML = '<i class="fas fa-sliders-h mr-2"></i> Ajuster les paramètres sans tout recommencer';
        
        recalculBtn.addEventListener('click', function() {
            // Revenir à l'étape des objectifs
            showSection(3);
        });
        
        recalculContainer.appendChild(recalculBtn);
        resultsContainer.appendChild(recalculContainer);
        
        // 2. Afficher les résultats recommandés
        results.forEach((result, index) => {
            const scorePercentage = Math.min(100, Math.round((result.score / SCORE_MAX_POSSIBLE) * 100));
            const forme = result.forme;
            
            // Définir les classes et textes selon la compatibilité
            let compatibiliteClass, compatibiliteIcon;
            
            switch(result.compatibilite) {
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
                case 'DÉCONSEILLÉ':
                    compatibiliteClass = 'bg-red-500 text-gray-900';
                    compatibiliteIcon = 'fa-times-circle';
                    break;
                default:
                    compatibiliteClass = 'bg-gray-500 text-gray-900';
                    compatibiliteIcon = 'fa-question-circle';
            }
            
            const resultCard = document.createElement('div');
            resultCard.classList.add('result-card', 'p-6', 'mb-8');
            setTimeout(() => {
                resultCard.classList.add('visible');
            }, index * 300);
            
            // AMÉLIORATION: Affichage du score sur un total et catégorie de compatibilité
            const scoreAbsolu = `${result.score}/${SCORE_MAX_POSSIBLE}`;
            
            resultCard.innerHTML = `
                <div class="result-match p-5 bg-blue-900 bg-opacity-40 rounded-xl mb-4">
                    <div class="match-percentage ${compatibiliteClass}">
                        <i class="fas ${compatibiliteIcon} mr-1"></i>
                        ${scorePercentage}%
                    </div>
                    <div class="absolute top-5 right-20 ${compatibiliteClass} py-1 px-3 rounded-full text-sm font-bold">
                        ${result.compatibilite}
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
                        <div>Score: ${scoreAbsolu}</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h5 class="font-semibold text-green-400 mb-3">Points forts</h5>
                        <ul class="feature-list">
                            ${result.details.filter(d => !d.includes('⚠️')).map(detail => `<li><i class="fas fa-check text-green-400"></i> ${detail}</li>`).join('')}
                        </ul>
                        
                        ${result.details.some(d => d.includes('⚠️')) ? 
                            `<h5 class="font-semibold text-red-400 mt-4 mb-3">Points d'attention</h5>
                            <ul class="feature-list">
                                ${result.details.filter(d => d.includes('⚠️')).map(detail => `<li><i class="fas fa-exclamation-triangle text-red-400"></i> ${detail.replace('⚠️ ', '')}</li>`).join('')}
                            </ul>` : ''}
                    </div>
                    <div>
                        <h5 class="font-semibold text-green-400 mb-3">Caractéristiques</h5>
                        <ul class="feature-list">
                            <li><i class="fas fa-users text-blue-400"></i> Associés: ${forme.associes}</li>
                            <li><i class="fas fa-shield-alt text-blue-400"></i> Responsabilité: ${forme.responsabilite}</li>
                            <li><i class="fas fa-percentage text-blue-400"></i> Fiscalité: ${forme.fiscalite}</li>
                            <li><i class="fas fa-user-tie text-blue-400"></i> Régime social: ${forme.regimeSocial}</li>
                            ${forme.plafondCA ? `<li><i class="fas fa-chart-line text-blue-400"></i> Plafond CA: ${forme.plafondCA}</li>` : ''}
                        </ul>
                    </div>
                </div>
                
                <div class="border-t border-gray-700 mt-6 pt-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h5 class="font-semibold text-green-400 mb-3">Quand choisir cette forme ?</h5>
                            <p>${forme.casConseille}</p>
                        </div>
                        <div>
                            <h5 class="font-semibold text-red-400 mb-3">Quand éviter cette forme ?</h5>
                            <p>${forme.casDeconseille}</p>
                        </div>
                    </div>
                </div>
                
                <!-- AMÉLIORATION: Bouton pour voir le détail du calcul -->
                <div class="mt-4">
                    <button class="text-green-400 text-sm underline detail-score-btn">
                        Pourquoi ce choix ? Voir le détail du calcul
                    </button>
                    <div class="score-details hidden mt-3 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-sm"></div>
                </div>
            `;
            
            resultsContainer.appendChild(resultCard);
            
            // Ajouter l'event listener pour afficher les détails du score
            const detailBtn = resultCard.querySelector('.detail-score-btn');
            const detailsContainer = resultCard.querySelector('.score-details');
            
            detailBtn.addEventListener('click', function() {
                if (detailsContainer.classList.contains('hidden')) {
                    // Générer le HTML des détails du score
                    let detailsHTML = '<h6 class="font-semibold mb-2">Détail du calcul :</h6><ul class="space-y-1">';
                    
                    // Critères structurels (60%)
                    detailsHTML += '<li class="font-semibold text-blue-400 mt-3">Critères structurels (60%)</li>';
                    
                    // Parcourir les détails de score
                    for (const [key, detail] of Object.entries(result.scoreDetails)) {
                        // Exclure les objectifs pour les traiter séparément
                        if (!key.startsWith('objectif_')) {
                            const pointsClass = detail.points > 0 ? 'text-green-400' : (detail.points < 0 ? 'text-red-400' : 'text-gray-400');
                            const pointsSign = detail.points > 0 ? '+' : '';
                            detailsHTML += `<li class="flex justify-between pl-3">
                                <span>${detail.label}</span>
                                <span class="${pointsClass}">${pointsSign}${detail.points} pts</span>
                            </li>`;
                        }
                    }
                    
                    // Objectifs (40%)
                    detailsHTML += '<li class="font-semibold text-blue-400 mt-3">Objectifs & préférences (40%)</li>';
                    
                    // Parcourir les objectifs
                    for (const [key, detail] of Object.entries(result.scoreDetails)) {
                        if (key.startsWith('objectif_')) {
                            const pointsClass = detail.points > 0 ? 'text-green-400' : (detail.points < 0 ? 'text-red-400' : 'text-gray-400');
                            const pointsSign = detail.points > 0 ? '+' : '';
                            const prioriteLabel = detail.priorite ? ` (priorité ${detail.priorite})` : '';
                            detailsHTML += `<li class="flex justify-between pl-3">
                                <span>${detail.label}${prioriteLabel}</span>
                                <span class="${pointsClass}">${pointsSign}${detail.points} pts</span>
                            </li>`;
                        }
                    }
                    
                    // Score structurel et objectifs
                    detailsHTML += `
                        <li class="flex justify-between font-semibold border-t border-gray-700 mt-2 pt-2">
                            <span>Score critères structurels (60%)</span>
                            <span>${result.scoreCriteresStructurels} pts</span>
                        </li>
                        <li class="flex justify-between font-semibold">
                            <span>Score objectifs (40%)</span>
                            <span>${result.scoreObjectifs} pts</span>
                        </li>
                    `;
                    
                    // Score total pondéré
                    detailsHTML += `<li class="flex justify-between font-semibold border-t border-gray-700 mt-2 pt-2">
                        <span>Score total pondéré</span>
                        <span>${result.score} pts</span>
                    </li>`;
                    
                    detailsHTML += '</ul>';
                    
                    detailsContainer.innerHTML = detailsHTML;
                    detailsContainer.classList.remove('hidden');
                    detailBtn.textContent = 'Masquer le détail du calcul';
                } else {
                    detailsContainer.classList.add('hidden');
                    detailBtn.textContent = 'Pourquoi ce choix ? Voir le détail du calcul';
                }
            });
        });
        
        // 3. AMÉLIORATION: Ajouter la matrice de comparaison visuelle
        if (results.length > 1) {
            const matrixContainer = createComparisonMatrix(results);
            resultsContainer.appendChild(matrixContainer);
        }
        
        // 4. AMÉLIORATION: Afficher la section de simulation fiscale
        const simulationContainer = createFiscalSimulation(results);
        resultsContainer.appendChild(simulationContainer);
        
        // 5. AMÉLIORATION: Afficher les formes incompatibles si présentes
        if (incompatibles && incompatibles.length > 0) {
            const incompatiblesContainer = displayIncompatibilites(incompatibles);
            resultsContainer.appendChild(incompatiblesContainer);
        }
        
        // 6. Ajouter l'event listener pour la simulation fiscale
        document.getElementById('calculer-simulation').addEventListener('click', function() {
            const revenu = parseFloat(document.getElementById('revenu-simulation').value);
            const resultatDiv = document.getElementById('resultats-simulation');
            
            if (isNaN(revenu) || revenu < 1000) {
                resultatDiv.innerHTML = '<p class="text-red-400">Veuillez entrer un revenu valide (minimum 1000€).</p>';
                resultatDiv.classList.remove('hidden');
                return;
            }
            
            // Calculer pour les formes juridiques recommandées
            let simulationsHTML = '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">';
            
            results.forEach(result => {
                const sim = simulationsFiscales.simulerImpactFiscal(result.forme, revenu);
                
                // Déterminer le ratio net/brut en pourcentage
                const ratioNetBrut = Math.round((sim.revenueNet / revenu) * 100);
                
                simulationsHTML += `
                    <div class="bg-blue-900 bg-opacity-40 p-4 rounded-lg">
                        <h5 class="font-bold mb-2 flex items-center">
                            <i class="fas ${result.forme.icone || 'fa-building'} text-green-400 mr-2"></i>
                            ${result.forme.nom}
                        </h5>
                        <div class="text-xs mb-3">Régime: ${sim.regimeFiscal} / ${sim.regimeSocial}</div>
                        <ul class="space-y-2 text-sm">
                            ${sim.regimeSocial ? `<li><span class="opacity-70">Charges sociales:</span> ${Math.round(sim.chargesSociales).toLocaleString('fr-FR')} €</li>` : ''}
                            <li><span class="opacity-70">Impôt total:</span> ${Math.round(sim.impot).toLocaleString('fr-FR')} €</li>
                            ${sim.impotDetails ? `
                                <li class="pl-3 text-xs opacity-80">
                                    <span>• IS: ${Math.round(sim.impotDetails.is).toLocaleString('fr-FR')} €</span><br>
                                    <span>• Salaire: ${Math.round(sim.impotDetails.salaire).toLocaleString('fr-FR')} €</span><br>
                                    <span>• Dividendes: ${Math.round(sim.impotDetails.dividendes).toLocaleString('fr-FR')} €</span>
                                </li>
                            ` : ''}
                            <li class="border-t border-gray-700 pt-2 font-semibold">
                                <span>Revenu net:</span> ${Math.round(sim.revenueNet).toLocaleString('fr-FR')} €
                            </li>
                        </ul>
                        <div class="mt-3">
                            <div class="text-xs mb-1 flex justify-between">
                                <span>Taux de conservation</span>
                                <span class="font-medium">${ratioNetBrut}%</span>
                            </div>
                            <div class="h-2 bg-gray-700 rounded overflow-hidden">
                                <div class="h-full bg-green-400" style="width: ${ratioNetBrut}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            simulationsHTML += '</div>';
            resultatDiv.innerHTML = simulationsHTML;
            resultatDiv.classList.remove('hidden');
        });
    }

    // Préparer le tableau comparatif complet
    function prepareComparatifTable(formes) {
        comparatifTableBody.innerHTML = '';
        
        formes.forEach(forme => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="p-3 border-b border-gray-700">
                    <div class="font-semibold">${forme.nom}</div>
                    <div class="text-sm opacity-80">${forme.categorie}</div>
                </td>
                <td class="p-3 border-b border-gray-700">${forme.associes}</td>
                <td class="p-3 border-b border-gray-700">${forme.capital}</td>
                <td class="p-3 border-b border-gray-700">${forme.responsabilite}</td>
                <td class="p-3 border-b border-gray-700">
                    ${forme.fiscalite}
                    ${forme.fiscaliteOption === 'Oui' ? '<div class="text-xs text-green-400">Option possible</div>' : ''}
                </td>
                <td class="p-3 border-b border-gray-700">${forme.regimeSocial}</td>
                <td class="p-3 border-b border-gray-700">${forme.avantages}</td>
                <td class="p-3 border-b border-gray-700">${forme.inconvenients}</td>
            `;
            
            comparatifTableBody.appendChild(row);
        });
    }

    // Afficher le tableau comparatif complet
    function showComparatifComplet() {
        resultsContainer.parentElement.style.display = 'none';
        comparatifComplet.classList.remove('hidden');
    }

    // Cacher le tableau comparatif complet
    function hideComparatifComplet() {
        resultsContainer.parentElement.style.display = 'block';
        comparatifComplet.classList.add('hidden');
    }

    // Réinitialiser la simulation
    function resetSimulation() {
        // Réinitialiser les réponses
        userResponses = {
            profilEntrepreneur: null,
            protectionPatrimoine: 3,
            typeActivite: null,
            activiteReglementee: false,
            chiffreAffaires: null,
            objectifs: [],
            objectifsPriorite: [],
            remuneration: null,
            risque: 3,
            regimeFiscal: null,
            regimeSocial: null
        };
        
        // Réinitialiser localStorage
        localStorage.removeItem('entreprise-form-progress');
        
        // Réinitialiser les sélections
        optionButtons.forEach(button => {
            button.classList.remove('selected');
        });
        
        // Réinitialiser les sliders
        patrimoineSlider.value = 3;
        risqueSlider.value = 3;
        
        // Réinitialiser le checkbox
        checkboxReglementee.checked = false;
        
        // Réinitialiser le compteur d'objectifs
        multiSelectionCount = 0;
        multiSelectionOrder = [];
        objectifCount.textContent = "Sélectionnez jusqu'à 3 objectifs principaux";
        objectifCount.classList.remove('text-red-400');
        
        // Retirer les badges de priorité
        document.querySelectorAll('.priority-badge').forEach(badge => badge.remove());
        
        // Afficher la première section
        showSection(1);
        
        // Cacher le comparatif s'il est visible
        hideComparatifComplet();
    }

    // AMÉLIORATION: Ajouter une question sur le régime social à la section 4
    function addRegimeSocialQuestion() {
        // Vérifier si la question existe déjà
        if (document.getElementById('regime-social-question')) return;
        
        const section4 = document.getElementById('section4');
        if (!section4) return;
        
        // Créer la nouvelle question
        const questionCard = document.createElement('div');
        questionCard.id = 'regime-social-question';
        questionCard.className = 'question-card p-6 mt-6';
        questionCard.innerHTML = `
            <h3 class="text-xl font-bold text-green-400 mb-4">9. Quel régime social préférez-vous ?</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <button class="option-btn flex flex-col items-center p-6 rounded-xl bg-blue-900 bg-opacity-30" data-value="tns">
                    <i class="fas fa-user-tie text-3xl mb-3 text-green-400"></i>
                    <span class="font-semibold text-lg">Indépendant (TNS)</span>
                    <span class="text-sm opacity-80 mt-2 text-center">Charges sociales calculées sur les bénéfices</span>
                </button>
                
                <button class="option-btn flex flex-col items-center p-6 rounded-xl bg-blue-900 bg-opacity-30" data-value="salarie">
                    <i class="fas fa-id-card text-3xl mb-3 text-green-400"></i>
                    <span class="font-semibold text-lg">Assimilé salarié</span>
                    <span class="text-sm opacity-80 mt-2 text-center">Protection sociale similaire aux salariés (hors chômage pour SASU/SAS)</span>
                </button>
            </div>
        `;
        
        // Insérer la question avant le bouton de navigation
        const navButtons = section4.querySelector('.flex.justify-between');
        section4.insertBefore(questionCard, navButtons);
        
        // Initialiser les événements pour les nouveaux boutons
        const newButtons = questionCard.querySelectorAll('.option-btn');
        newButtons.forEach(button => {
            button.addEventListener('click', function() {
                newButtons.forEach(btn => btn.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    }

    // AMÉLIORATION: Charger les données sauvegardées et initialiser
    function init() {
        // Ajouter la question sur le régime social
        addRegimeSocialQuestion();
        
        // Charger les données sauvegardées si elles existent
        const savedData = loadProgress();
        if (savedData) {
            // Demander à l'utilisateur s'il veut restaurer sa session
            const restoreContainer = document.createElement('div');
            restoreContainer.className = 'fixed top-0 left-0 right-0 bg-green-900 bg-opacity-90 text-white p-3 z-[200] flex justify-between items-center';
            restoreContainer.innerHTML = `
                <div>
                    <i class="fas fa-history mr-2"></i> 
                    Une simulation précédente a été trouvée. Souhaitez-vous la restaurer ?
                </div>
                <div>
                    <button id="restore-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 px-3 py-1 rounded mr-2">
                        Restaurer
                    </button>
                    <button id="ignore-btn" class="border border-white hover:bg-black hover:bg-opacity-30 text-white px-3 py-1 rounded">
                        Ignorer
                    </button>
                </div>
            `;
            
            document.body.prepend(restoreContainer);
            
            document.getElementById('restore-btn').addEventListener('click', function() {
                userResponses = savedData;
                restoreContainer.remove();
                // Restaurer la dernière étape avant résultats
                showSection(4);
            });
            
            document.getElementById('ignore-btn').addEventListener('click', function() {
                localStorage.removeItem('entreprise-form-progress');
                restoreContainer.remove();
            });
        }
    }

    // Initialiser les fonctionnalités améliorées
    init();

    // Initialisation du sélecteur de thème (si présent)
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const darkIcon = document.getElementById('dark-icon');
    const lightIcon = document.getElementById('light-icon');
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', function() {
            document.body.classList.toggle('dark');
            
            if (document.body.classList.contains('dark')) {
                darkIcon.style.display = 'block';
                lightIcon.style.display = 'none';
            } else {
                darkIcon.style.display = 'none';
                lightIcon.style.display = 'block';
            }
        });
    }
});
