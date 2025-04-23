/**
 * Simulateur de forme juridique d'entreprise
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Base de données des formes juridiques (à partir du fichier CSV fourni, avec corrections)
    const formesJuridiques = [
        {
            id: 'micro-entreprise',
            nom: 'Micro-entreprise',
            categorie: 'Commerciale/Civile',
            associes: '1',
            capital: 'Aucun',
            responsabilite: 'Limitée aux biens affectés à l\'activité professionnelle',
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
            capital: 'Libre (1€ suffit)',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
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
            fiscaliteOption: 'Oui',
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
            plafondCA: 'Aucun plafond (régime réel obligatoire si CA > 188 700 €/77 700 €)',
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
            id: 'sci',
            nom: 'SCI',
            categorie: 'Civile',
            associes: '2+',
            capital: 'Libre',
            responsabilite: 'Indéfinie pour les associés gérants',
            fiscalite: 'IR (IS option)',
            fiscaliteOption: 'Oui',
            regimeSocial: 'TNS pour gérants associés',
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
            id: 'earl',
            nom: 'EARL',
            categorie: 'Agricole',
            associes: '1-10',
            capital: 'Minimum 7 500 €',
            responsabilite: 'Limitée aux apports sauf faute de gestion',
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
        remuneration: null,
        risque: 3,
        regimeFiscal: null
    };

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

    // Gestion des boutons d'options multiples (max 3)
    let multiSelectionCount = 0;
    multiButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.classList.contains('selected')) {
                this.classList.remove('selected');
                multiSelectionCount--;
                objectifCount.textContent = `Sélectionnez jusqu'à 3 objectifs principaux (${multiSelectionCount}/3)`;
                objectifCount.classList.remove('text-red-400');
            } else if (multiSelectionCount < 3) {
                this.classList.add('selected');
                multiSelectionCount++;
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

    // Gestion du checkbox d'activité réglementée
    checkboxReglementee.addEventListener('change', function() {
        userResponses.activiteReglementee = this.checked;
    });

    // Gestion des boutons de navigation
    nextStep1.addEventListener('click', function() {
        collectSection1Data();
        showSection(2);
    });

    nextStep2.addEventListener('click', function() {
        collectSection2Data();
        showSection(3);
    });

    nextStep3.addEventListener('click', function() {
        collectSection3Data();
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
        const selectedActivity = document.querySelector('#section2 .option-btn.selected[data-value]');
        if (selectedActivity) {
            userResponses.typeActivite = selectedActivity.getAttribute('data-value');
        }
        
        userResponses.activiteReglementee = checkboxReglementee.checked;
        
        const selectedCA = document.querySelector('#section2 .option-btn.selected[data-value]');
        if (selectedCA) {
            userResponses.chiffreAffaires = selectedCA.getAttribute('data-value');
        }
    }

    function collectSection3Data() {
        userResponses.objectifs = [];
        const selectedObjectifs = document.querySelectorAll('#section3 .option-btn.selected[data-multi="true"]');
        selectedObjectifs.forEach(obj => {
            userResponses.objectifs.push(obj.getAttribute('data-value'));
        });
        
        const selectedRemuneration = document.querySelector('#section3 .option-btn.selected:not([data-multi])');
        if (selectedRemuneration) {
            userResponses.remuneration = selectedRemuneration.getAttribute('data-value');
        }
    }

    function collectSection4Data() {
        userResponses.risque = parseInt(risqueSlider.value);
        
        const selectedFiscal = document.querySelector('#section4 .option-btn.selected');
        if (selectedFiscal) {
            userResponses.regimeFiscal = selectedFiscal.getAttribute('data-value');
        }
    }

    // Génération des résultats
    function generateResults() {
        // Calculer les scores pour chaque forme juridique
        const results = formesJuridiques.map(forme => {
            let score = 0;
            let details = [];

            // Profil entrepreneur
            if (userResponses.profilEntrepreneur === 'solo' && forme.associes === '1') {
                score += 20;
                details.push('Adapté aux entrepreneurs individuels');
            } else if (userResponses.profilEntrepreneur === 'famille' && forme.profilOptimal.includes('familiale')) {
                score += 20;
                details.push('Idéal pour les projets familiaux');
            } else if (userResponses.profilEntrepreneur === 'associes' && parseInt(forme.associes.split('-')[0]) > 1) {
                score += 20;
                details.push('Adapté à plusieurs associés');
            } else if (userResponses.profilEntrepreneur === 'investisseurs' && forme.leveeFonds === 'Oui') {
                score += 20;
                details.push('Permet la levée de fonds');
            }

            // Protection patrimoine
            if (userResponses.protectionPatrimoine >= 4 && forme.protectionPatrimoine === 'Oui') {
                score += 15;
                details.push('Bonne protection du patrimoine personnel');
            } else if (userResponses.protectionPatrimoine <= 2 && forme.protectionPatrimoine === 'Non') {
                score += 5;
                details.push('Protection patrimoniale moins essentielle pour vous');
            }

            // Type d'activité
            if (userResponses.typeActivite === 'liberale' && forme.categorie.includes('Libérale')) {
                score += 15;
                details.push('Adapté aux professions libérales');
            } else if (userResponses.typeActivite === 'commerciale' && forme.categorie.includes('Commerciale')) {
                score += 15;
                details.push('Adapté aux activités commerciales');
            } else if (userResponses.typeActivite === 'artisanale' && forme.categorie.includes('Commerciale')) {
                score += 15;
                details.push('Adapté aux activités artisanales');
            } else if (userResponses.typeActivite === 'agricole' && forme.categorie.includes('Agricole')) {
                score += 20;
                details.push('Spécifiquement conçu pour l\'agriculture');
            }

            // Activité réglementée
            if (userResponses.activiteReglementee && forme.categorie.includes('Libérale')) {
                score += 10;
                details.push('Adapté aux activités réglementées');
            }

            // Chiffre d'affaires
            if (userResponses.chiffreAffaires === 'faible' && forme.id === 'micro-entreprise') {
                score += 15;
                details.push('Adapté aux petits volumes d\'activité');
            } else if (userResponses.chiffreAffaires === 'eleve' && ['sarl', 'sas', 'sasu'].includes(forme.id)) {
                score += 15;
                details.push('Adapté aux volumes d\'activité importants');
            }

            // Objectifs
            if (userResponses.objectifs.includes('simplicite') && forme.formalites.includes('simplifiées')) {
                score += 10;
                details.push('Formalités administratives simplifiées');
            }
            
            if (userResponses.objectifs.includes('economie') && !forme.formalites.includes('Complexes')) {
                score += 10;
                details.push('Coûts de fonctionnement raisonnables');
            }
            
            if (userResponses.objectifs.includes('fiscalite') && forme.fiscaliteOption === 'Oui') {
                score += 10;
                details.push('Options fiscales flexibles');
            }
            
            if (userResponses.objectifs.includes('protection') && forme.protectionPatrimoine === 'Oui') {
                score += 10;
                details.push('Bonne protection patrimoniale');
            }
            
            if (userResponses.objectifs.includes('croissance') && forme.leveeFonds === 'Oui') {
                score += 10;
                details.push('Favorise la croissance et le développement');
            }
            
            if (userResponses.objectifs.includes('credibilite') && forme.publicationComptes === 'Oui') {
                score += 10;
                details.push('Image professionnelle auprès des partenaires');
            }

            // Rémunération
            if (userResponses.remuneration === 'salaire' && forme.regimeSocial.includes('salarié')) {
                score += 10;
                details.push('Permet une rémunération par salaire');
            } else if (userResponses.remuneration === 'dividendes' && forme.fiscal.includes('Oui')) {
                score += 10;
                details.push('Facilite la distribution de dividendes');
            } else if (userResponses.remuneration === 'mixte' && forme.fiscal.includes('Oui') && forme.regimeSocial.includes('salarié')) {
                score += 10;
                details.push('Permet une rémunération mixte salaire/dividendes');
            }

            // Risque
            if (userResponses.risque <= 2 && forme.responsabilite.includes('Limitée')) {
                score += 10;
                details.push('Limitation des risques personnels');
            } else if (userResponses.risque >= 4 && forme.responsabilite.includes('Indéfinie')) {
                score += 5;
                details.push('Vous acceptez une part de risque plus importante');
            }

            // Régime fiscal
            if (userResponses.regimeFiscal === 'ir' && forme.fiscalite.includes('IR')) {
                score += 10;
                details.push('Fiscalité sur le revenu (IR) adaptée à vos besoins');
            } else if (userResponses.regimeFiscal === 'is' && forme.fiscalite.includes('IS')) {
                score += 10;
                details.push('Impôt sur les sociétés (IS) adapté à vos besoins');
            } else if (userResponses.regimeFiscal === 'flexible' && forme.fiscaliteOption === 'Oui') {
                score += 15;
                details.push('Options fiscales flexibles selon vos besoins');
            }

            // Retourner l'objet avec le score calculé et les détails
            return {
                forme: forme,
                score: score,
                details: details
            };
        });

        // Trier les résultats par score
        results.sort((a, b) => b.score - a.score);

        // Afficher les 3 premières formes juridiques recommandées
        displayResults(results.slice(0, 3));
        
        // Préparer les données du tableau comparatif complet
        prepareComparatifTable(formesJuridiques);
    }

    // Affichage des résultats
    function displayResults(results) {
        resultsContainer.innerHTML = '';
        
        results.forEach((result, index) => {
            const scorePercentage = Math.min(100, Math.round(result.score / 1.5));
            const forme = result.forme;
            
            const resultCard = document.createElement('div');
            resultCard.classList.add('result-card', 'p-6', 'mb-8');
            setTimeout(() => {
                resultCard.classList.add('visible');
            }, index * 300);
            
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
            `;
            
            resultsContainer.appendChild(resultCard);
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
            remuneration: null,
            risque: 3,
            regimeFiscal: null
        };
        
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
        objectifCount.textContent = "Sélectionnez jusqu'à 3 objectifs principaux";
        objectifCount.classList.remove('text-red-400');
        
        // Afficher la première section
        showSection(1);
        
        // Cacher le comparatif s'il est visible
        hideComparatifComplet();
    }

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
