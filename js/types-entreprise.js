/**
 * Simulateur de forme juridique d'entreprise
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: pondération adaptative, incompatibilités, transparence scoring, recalcul rapide
 */

document.addEventListener('DOMContentLoaded', function() {
    // Base de données des formes juridiques mise à jour avec données complètes
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
            protectionPatrimoine: 'Partielle',
            chargesSociales: 'Simplifiées',
            fiscal: 'Non applicable (bénéfices imposés à l\'IR, pas de dividendes)',
            regimeTVA: 'Franchise en base (TVA si dépassement seuils)',
            publicationComptes: 'Non',
            formalites: 'Très simplifiées',
            activite: 'Toutes sauf réglementées',
            leveeFonds: 'Non',
            entreeAssocies: 'Non',
            profilOptimal: 'Entrepreneur solo',
            avantages: 'Simplicité, coût réduit',
            inconvenients: 'Plafond CA (188 700 € vente ou 77 700 € services), pas de déduction de charges',
            casConseille: 'Début d\'activité, test',
            casDeconseille: 'Développement ambitieux',
            transmission: 'Possible mais moins souple que société',
            plafondCA: '188 700 € (vente/hébergement) ou 77 700 € (services/libérales)',
            icone: 'fa-rocket'
        },
        {
            id: 'ei',
            nom: 'Entreprise Individuelle (EI)',
            categorie: 'Commerciale/Civile',
            associes: '1',
            capital: 'Aucun',
            responsabilite: 'Limitée au patrimoine professionnel',
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
            inconvenients: 'Responsabilité, peu de protection',
            casConseille: 'Artisan, commerçant',
            casDeconseille: 'Projet à risque élevé',
            transmission: 'Possible mais moins souple que société',
            plafondCA: 'Aucun plafond',
            icone: 'fa-user'
        },
        {
            id: 'eurl',
            nom: 'EURL',
            categorie: 'Commerciale',
            associes: '1',
            capital: 'Libre',
            responsabilite: 'Limitée aux apports',
            fiscalite: 'IR (IS option)',
            fiscaliteOption: 'Oui',
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
            capital: '37 000 € (50% libéré à la création, solde sous 5 ans)',
            responsabilite: 'Limitée aux apports',
            fiscalite: 'IS (IR option 5 ans)',
            fiscaliteOption: 'Oui',
            regimeSocial: 'Assimilé salarié obligatoire',
            protectionPatrimoine: 'Oui',
            chargesSociales: 'Sur rémunération',
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
            casDeconseille: 'Projets où coûts et simplicité sont prioritaires (artisanat, solo)',
            transmission: 'Oui',
            plafondCA: 'Aucun plafond (taux IS réduit à 15% sur les premiers 42 500€ de bénéfices si CA < 10M€)',
            icone: 'fa-chart-line'
        },
        {
            id: 'sarl',
            nom: 'SARL',
            categorie: 'Commerciale',
            associes: '2-100',
            capital: '37 000 € (50% libéré à la création, solde sous 5 ans)',
            responsabilite: 'Limitée aux apports',
            fiscalite: 'IS (IR option 5 ans)',
            fiscaliteOption: 'Oui',
            regimeSocial: 'TNS si gérant majoritaire, assimilé salarié sinon',
            protectionPatrimoine: 'Oui',
            chargesSociales: 'Selon statut gérant',
            fiscal: 'Oui, selon IS/IR',
            regimeTVA: 'Oui',
            publicationComptes: 'Oui',
            formalites: 'Standard',
            activite: 'Toutes sauf réglementées',
            leveeFonds: 'Limité',
            entreeAssocies: 'Soumise à agrément obligatoire (contraignante)',
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
            capital: '37 000 € (50% libéré à la création, solde sous 5 ans)',
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
            icone: 'fa-rocket'
        },
        {
            id: 'sa',
            nom: 'SA',
            categorie: 'Commerciale',
            associes: '2 (non cotée), 7 (cotée)',
            capital: '37 000 € (50% libéré à la création, solde sous 5 ans)',
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
            inconvenients: 'Pas de chiffre d\'affaires propre',
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
            capital: '37 000 € (50% libéré à la création, solde sous 5 ans)',
            responsabilite: 'Commandités : indéfinie, commanditaires : limitée',
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
            plafondCA: 'Aucun plafond (régime IS obligatoire)',
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

    // AMÉLIORATION: Génération des résultats avec score transparent et incompatibilités
    function generateResults() {
        // Calculer les scores pour chaque forme juridique
        const results = formesJuridiques.map(forme => {
            let score = 0;
            let details = [];
            let scoreDetails = {}; // Pour l'affichage du détail des scores

            // Profil entrepreneur
            if (userResponses.profilEntrepreneur === 'solo' && forme.associes === '1') {
                score += 20;
                details.push('Adapté aux entrepreneurs individuels');
                scoreDetails.profilEntrepreneur = {
                    points: 20,
                    label: 'Adapté aux entrepreneurs individuels'
                };
            } else if (userResponses.profilEntrepreneur === 'famille' && forme.profilOptimal.includes('familiale')) {
                score += 20;
                details.push('Idéal pour les projets familiaux');
                scoreDetails.profilEntrepreneur = {
                    points: 20,
                    label: 'Idéal pour les projets familiaux'
                };
            } else if (userResponses.profilEntrepreneur === 'associes' && parseInt(forme.associes.split('-')[0]) > 1) {
                score += 20;
                details.push('Adapté à plusieurs associés');
                scoreDetails.profilEntrepreneur = {
                    points: 20,
                    label: 'Adapté à plusieurs associés'
                };
            } else if (userResponses.profilEntrepreneur === 'investisseurs' && forme.leveeFonds === 'Oui') {
                score += 20;
                details.push('Permet la levée de fonds');
                scoreDetails.profilEntrepreneur = {
                    points: 20,
                    label: 'Permet la levée de fonds'
                };
            } else {
                scoreDetails.profilEntrepreneur = {
                    points: 0,
                    label: 'Profil entrepreneur non optimal'
                };
            }

            // Protection patrimoine
            if (userResponses.protectionPatrimoine >= 4 && forme.protectionPatrimoine === 'Oui') {
                score += 15;
                details.push('Bonne protection du patrimoine personnel');
                scoreDetails.protectionPatrimoine = {
                    points: 15,
                    label: 'Bonne protection du patrimoine personnel'
                };
            } else if (userResponses.protectionPatrimoine <= 2 && forme.protectionPatrimoine === 'Non') {
                score += 5;
                details.push('Protection patrimoniale moins essentielle pour vous');
                scoreDetails.protectionPatrimoine = {
                    points: 5,
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
                score += 15;
                details.push('Adapté aux professions libérales');
                scoreDetails.typeActivite = {
                    points: 15,
                    label: 'Adapté aux professions libérales'
                };
            } else if (userResponses.typeActivite === 'commerciale' && forme.categorie.includes('Commerciale')) {
                score += 15;
                details.push('Adapté aux activités commerciales');
                scoreDetails.typeActivite = {
                    points: 15,
                    label: 'Adapté aux activités commerciales'
                };
            } else if (userResponses.typeActivite === 'artisanale' && forme.categorie.includes('Commerciale')) {
                score += 15;
                details.push('Adapté aux activités artisanales');
                scoreDetails.typeActivite = {
                    points: 15,
                    label: 'Adapté aux activités artisanales'
                };
            } else if (userResponses.typeActivite === 'agricole' && forme.categorie.includes('Agricole')) {
                score += 20;
                details.push('Spécifiquement conçu pour l\'agriculture');
                scoreDetails.typeActivite = {
                    points: 20,
                    label: 'Spécifiquement conçu pour l\'agriculture'
                };
            } else {
                scoreDetails.typeActivite = {
                    points: 0,
                    label: 'Type d\'activité peu adapté'
                };
            }

            // AMÉLIORATION: Activité réglementée - Pénalités & incompatibilités
            if (userResponses.activiteReglementee) {
                if (forme.categorie.includes('Libérale') || forme.activite.includes('libérales réglementées')) {
                    score += 10;
                    details.push('Adapté aux activités réglementées');
                    scoreDetails.activiteReglementee = {
                        points: 10,
                        label: 'Adapté aux activités réglementées'
                    };
                } else if (['micro-entreprise', 'ei'].includes(forme.id)) {
                    score -= 40; // Forte pénalité
                    details.push('⚠️ Incompatible avec une activité réglementée');
                    scoreDetails.activiteReglementee = {
                        points: -40,
                        label: '⚠️ Incompatible avec une activité réglementée'
                    };
                }
            }

            // Chiffre d'affaires
            if (userResponses.chiffreAffaires === 'faible' && forme.id === 'micro-entreprise') {
                score += 15;
                details.push('Adapté aux petits volumes d\'activité');
                scoreDetails.chiffreAffaires = {
                    points: 15,
                    label: 'Adapté aux petits volumes d\'activité'
                };
            } else if (userResponses.chiffreAffaires === 'eleve' && ['sarl', 'sas', 'sasu', 'sa'].includes(forme.id)) {
                score += 15;
                details.push('Adapté aux volumes d\'activité importants');
                scoreDetails.chiffreAffaires = {
                    points: 15,
                    label: 'Adapté aux volumes d\'activité importants'
                };
            } else if (userResponses.chiffreAffaires === 'eleve' && forme.id === 'micro-entreprise') {
                score -= 30; // Pénalité pour plafond CA
                details.push('⚠️ Plafonné en chiffre d\'affaires (risque de dépassement)');
                scoreDetails.chiffreAffaires = {
                    points: -30,
                    label: '⚠️ Plafonné en chiffre d\'affaires'
                };
            } else {
                scoreDetails.chiffreAffaires = {
                    points: 0,
                    label: 'Volume d\'activité compatible'
                };
            }

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
                        details.push(label);
                    } else if (obj.valeur === 'economie' && !forme.formalites.includes('Complexes')) {
                        points = pointsBase;
                        label = 'Coûts de fonctionnement raisonnables';
                        score += points;
                        details.push(label);
                    } else if (obj.valeur === 'fiscalite' && forme.fiscaliteOption === 'Oui') {
                        points = pointsBase;
                        label = 'Options fiscales flexibles';
                        score += points;
                        details.push(label);
                    } else if (obj.valeur === 'protection' && forme.protectionPatrimoine === 'Oui') {
                        points = pointsBase;
                        label = 'Bonne protection patrimoniale';
                        score += points;
                        details.push(label);
                    } else if (obj.valeur === 'croissance' && forme.leveeFonds === 'Oui') {
                        points = pointsBase;
                        label = 'Favorise la croissance et le développement';
                        score += points;
                        details.push(label);
                    } else if (obj.valeur === 'croissance' && forme.leveeFonds === 'Non') {
                        points = -20; // Pénalité pour incompatibilité
                        label = '⚠️ Limité pour vos objectifs de croissance';
                        score += points;
                        details.push(label);
                    } else if (obj.valeur === 'credibilite' && forme.publicationComptes === 'Oui') {
                        points = pointsBase;
                        label = 'Image professionnelle auprès des partenaires';
                        score += points;
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
                score += 10;
                details.push('Permet une rémunération par salaire');
                scoreDetails.remuneration = {
                    points: 10,
                    label: 'Permet une rémunération par salaire'
                };
            } else if (userResponses.remuneration === 'dividendes' && forme.fiscal.includes('Oui')) {
                score += 10;
                details.push('Facilite la distribution de dividendes');
                scoreDetails.remuneration = {
                    points: 10,
                    label: 'Facilite la distribution de dividendes'
                };
            } else if (userResponses.remuneration === 'mixte' && forme.fiscal.includes('Oui') && forme.regimeSocial.includes('salarié')) {
                score += 10;
                details.push('Permet une rémunération mixte salaire/dividendes');
                scoreDetails.remuneration = {
                    points: 10,
                    label: 'Permet une rémunération mixte salaire/dividendes'
                };
            } else {
                scoreDetails.remuneration = {
                    points: 0,
                    label: 'Mode de rémunération peu adapté'
                };
            }

            // Risque
            if (userResponses.risque <= 2 && forme.responsabilite.includes('Limitée')) {
                score += 10;
                details.push('Limitation des risques personnels');
                scoreDetails.risque = {
                    points: 10,
                    label: 'Limitation des risques personnels'
                };
            } else if (userResponses.risque >= 4 && forme.responsabilite.includes('Indéfinie')) {
                score += 5;
                details.push('Vous acceptez une part de risque plus importante');
                scoreDetails.risque = {
                    points: 5,
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
                score += 10;
                details.push('Fiscalité sur le revenu (IR) adaptée à vos besoins');
                scoreDetails.regimeFiscal = {
                    points: 10,
                    label: 'Fiscalité IR adaptée à vos besoins'
                };
            } else if (userResponses.regimeFiscal === 'is' && forme.fiscalite.includes('IS')) {
                score += 10;
                details.push('Impôt sur les sociétés (IS) adapté à vos besoins');
                scoreDetails.regimeFiscal = {
                    points: 10,
                    label: 'Fiscalité IS adaptée à vos besoins'
                };
            } else if (userResponses.regimeFiscal === 'flexible' && forme.fiscaliteOption === 'Oui') {
                score += 15;
                details.push('Options fiscales flexibles selon vos besoins');
                scoreDetails.regimeFiscal = {
                    points: 15,
                    label: 'Options fiscales flexibles selon vos besoins'
                };
            } else {
                scoreDetails.regimeFiscal = {
                    points: 0,
                    label: 'Régime fiscal peu adapté'
                };
            }

            // AMÉLIORATION: Régime social
            if (userResponses.regimeSocial === 'tns' && forme.regimeSocial.includes('TNS')) {
                score += 10;
                details.push('Régime social des indépendants (TNS) adapté');
                scoreDetails.regimeSocial = {
                    points: 10,
                    label: 'Régime TNS adapté à vos préférences'
                };
            } else if (userResponses.regimeSocial === 'salarie' && forme.regimeSocial.includes('salarié')) {
                score += 10;
                details.push('Régime assimilé salarié adapté à vos préférences');
                scoreDetails.regimeSocial = {
                    points: 10,
                    label: 'Régime assimilé salarié adapté'
                };
            } else if (userResponses.regimeSocial && !forme.regimeSocial.includes(userResponses.regimeSocial === 'tns' ? 'TNS' : 'salarié')) {
                score -= 15; // Pénalité pour incompatibilité
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

            // Retourner l'objet avec le score calculé et les détails
            return {
                forme: forme,
                score: score,
                details: details,
                scoreDetails: scoreDetails // AMÉLIORATION: Détails du score
            };
        });

        // Trier les résultats par score
        results.sort((a, b) => b.score - a.score);

        // Afficher les 3 premières formes juridiques recommandées
        displayResults(results.slice(0, 3));
        
        // Préparer les données du tableau comparatif complet
        prepareComparatifTable(formesJuridiques);
    }

    // AMÉLIORATION: Affichage des résultats avec plus de transparence et bouton de recalcul
    function displayResults(results) {
        resultsContainer.innerHTML = '';
        
        results.forEach((result, index) => {
            const scorePercentage = Math.min(100, Math.round((result.score / SCORE_MAX_POSSIBLE) * 100));
            const forme = result.forme;
            
            const resultCard = document.createElement('div');
            resultCard.classList.add('result-card', 'p-6', 'mb-8');
            setTimeout(() => {
                resultCard.classList.add('visible');
            }, index * 300);
            
            // AMÉLIORATION: Affichage du score sur un total
            const scoreAbsolu = `${result.score}/${SCORE_MAX_POSSIBLE}`;
            
            resultCard.innerHTML = `
                <div class="result-match p-5 bg-blue-900 bg-opacity-40 rounded-xl mb-4">
                    <div class="match-percentage">${scorePercentage}%</div>
                    <h4 class="text-xl font-bold mb-3 flex items-center">
                        <i class="fas ${forme.icone || 'fa-building'} text-green-400 mr-3 text-2xl"></i>
                        ${forme.nom}
                    </h4>
                    <p class="opacity-80 mb-4">${forme.profilOptimal}</p>
                    <div class="match-indicator mt-3">
                        <div class="match-fill" style="width: ${scorePercentage}%"></div>
                    </div>
                    <div class="text-right text-sm mt-1 opacity-80">Score: ${scoreAbsolu}</div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h5 class="font-semibold text-green-400 mb-3">Points forts</h5>
                        <ul class="feature-list">
                            ${result.details.map(detail => `<li><i class="fas fa-check text-green-400"></i> ${detail}</li>`).join('')}
                        </ul>
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
                    <h5 class="font-semibold text-green-400 mb-3">Points d'attention</h5>
                    <p>${forme.inconvenients}</p>
                    <p class="mt-3 text-sm opacity-80">Cas conseillé: ${forme.casConseille}</p>
                    <p class="text-sm opacity-80">Cas déconseillé: ${forme.casDeconseille}</p>
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
                    
                    // Parcourir les détails de score
                    for (const [key, detail] of Object.entries(result.scoreDetails)) {
                        const pointsClass = detail.points > 0 ? 'text-green-400' : (detail.points < 0 ? 'text-red-400' : 'text-gray-400');
                        const pointsSign = detail.points > 0 ? '+' : '';
                        detailsHTML += `<li class="flex justify-between">
                            <span>${detail.label}</span>
                            <span class="${pointsClass}">${pointsSign}${detail.points} pts</span>
                        </li>`;
                    }
                    
                    detailsHTML += `<li class="flex justify-between font-semibold border-t border-gray-700 mt-2 pt-2">
                        <span>Score total</span>
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
        
        // AMÉLIORATION: Ajouter le bouton de recalcul rapide
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
        resultsContainer.insertBefore(recalculContainer, resultsContainer.firstChild);
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
                    <span class="text-sm opacity-80 mt-2 text-center">Protection sociale similaire aux salariés</span>
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
