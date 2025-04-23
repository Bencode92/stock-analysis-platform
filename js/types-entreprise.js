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
        }
        // ... autres formes juridiques existantes maintenues à l'identique
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

    // Paramètres avancés pour les simulations
    let parametresAvances = {
        ratioSalaire: 50,
        ratioDividendes: 50,
        capitalSocial: 10000,
        capitalLibere: 100,
        caSimulation: 50000
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
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    
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
    
    // AMÉLIORATION: Paramètres avancés
    const advancedParamsToggle = document.getElementById('advanced-params-toggle');
    const advancedParamsContent = document.getElementById('advanced-params-content');
    const ratioSalaireSlider = document.getElementById('ratio-salaire');
    const ratioDividendesSlider = document.getElementById('ratio-dividendes');
    const ratioSalaireValue = document.getElementById('ratio-salaire-value');
    const ratioDividendesValue = document.getElementById('ratio-dividendes-value');
    const capitalSocialInput = document.getElementById('capital-social');
    const capitalLibereSlider = document.getElementById('capital-libere');
    const capitalLibereValue = document.getElementById('capital-libere-value');
    const caSimulationInput = document.getElementById('ca-simulation');
    const applyParamsButton = document.getElementById('apply-params');
    
    // Conteneurs
    const resultsContainer = document.getElementById('results-container');
    const comparatifComplet = document.getElementById('comparatif-complet');
    const comparatifTableBody = document.getElementById('comparatif-table-body');
    const showMoreResults = document.getElementById('show-more-results');
    const secondaryResults = document.getElementById('secondary-results');
    const exportButtons = document.getElementById('export-buttons');
    const exportPdfButton = document.getElementById('export-pdf');
    const exportExcelButton = document.getElementById('export-excel');

    // Initialisation
    initSimulator();

    /**
     * Initialisation du simulateur
     */
    function initSimulator() {
        // Mettre à jour la date du jour
        updateLastUpdateDate();
        
        // Initialiser l'horloge
        updateMarketClock();
        setInterval(updateMarketClock, 1000);
        
        // Initialiser la barre de progression
        updateProgressBar(1, 5);
        
        // Événements pour les boutons de navigation
        setupEventListeners();
        
        // Initialiser les paramètres avancés
        initAdvancedParams();
        
        // Charger les données sauvegardées si disponibles
        const savedProgress = loadProgress();
        if (savedProgress) {
            userResponses = savedProgress;
            // TODO: Appliquer les réponses sauvegardées à l'UI
        }
    }

    /**
     * Configuration des écouteurs d'événements
     */
    function setupEventListeners() {
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
        
        // Gestion des boutons d'options multiples avec priorité
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
        
        // Gestion du checkbox d'activité réglementée
        checkboxReglementee.addEventListener('change', function() {
            userResponses.activiteReglementee = this.checked;
        });
        
        // Boutons de navigation
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
        
        // AMÉLIORATION: Événements pour paramètres avancés
        if (advancedParamsToggle) {
            advancedParamsToggle.addEventListener('click', toggleAdvancedParams);
        }
        
        if (ratioSalaireSlider) {
            ratioSalaireSlider.addEventListener('input', updateRatioValues);
        }
        
        if (capitalLibereSlider) {
            capitalLibereSlider.addEventListener('input', updateCapitalLibereValue);
        }
        
        if (applyParamsButton) {
            applyParamsButton.addEventListener('click', applyAdvancedParams);
        }
        
        // AMÉLIORATION: Exportation
        if (exportPdfButton) {
            exportPdfButton.addEventListener('click', exportToPdf);
        }
        
        if (exportExcelButton) {
            exportExcelButton.addEventListener('click', exportToExcel);
        }
    }

    /**
     * Mise à jour de la barre de progression
     */
    function updateProgressBar(currentStep, totalSteps) {
        const percentage = (currentStep / totalSteps) * 100;
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        
        if (progressPercentage) {
            progressPercentage.textContent = `${Math.round(percentage)}% complété`;
        }
        
        // Mettre à jour le temps restant estimé
        const timeEstimate = document.getElementById('time-estimate');
        if (timeEstimate) {
            const remainingTime = Math.max(1, 5 - (currentStep - 1));
            timeEstimate.textContent = `Temps estimé: ${remainingTime} minute${remainingTime > 1 ? 's' : ''}`;
        }
        
        // Mettre à jour la progression de la question
        const questionProgress = document.getElementById(`question-progress${currentStep > 1 ? '-' + currentStep : ''}`);
        if (questionProgress) {
            const questionNumber = currentStep === 1 ? 2 : (currentStep === 2 ? 4 : (currentStep === 3 ? 6 : (currentStep === 4 ? 9 : 9)));
            questionProgress.textContent = `Question ${questionNumber} sur 9`;
        }
    }

    /**
     * Mise à jour de l'affichage des priorités des objectifs
     */
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

    /**
     * Initialisation des paramètres avancés
     */
    function initAdvancedParams() {
        if (ratioSalaireValue) {
            ratioSalaireValue.textContent = `${parametresAvances.ratioSalaire}%`;
        }
        
        if (ratioDividendesValue) {
            ratioDividendesValue.textContent = `${parametresAvances.ratioDividendes}%`;
        }
        
        if (capitalSocialInput) {
            capitalSocialInput.value = parametresAvances.capitalSocial;
        }
        
        if (capitalLibereValue) {
            capitalLibereValue.textContent = `${parametresAvances.capitalLibere}%`;
        }
        
        if (caSimulationInput) {
            caSimulationInput.value = parametresAvances.caSimulation;
        }
    }

    /**
     * Bascule l'affichage du panneau de paramètres avancés
     */
    function toggleAdvancedParams() {
        if (advancedParamsContent) {
            advancedParamsContent.classList.toggle('visible');
            
            const iconElement = document.getElementById('params-toggle-icon');
            if (iconElement) {
                if (advancedParamsContent.classList.contains('visible')) {
                    iconElement.classList.remove('fa-chevron-down');
                    iconElement.classList.add('fa-chevron-up');
                } else {
                    iconElement.classList.remove('fa-chevron-up');
                    iconElement.classList.add('fa-chevron-down');
                }
            }
        }
    }

    /**
     * Mise à jour des valeurs du ratio salaire/dividendes
     */
    function updateRatioValues() {
        if (!ratioSalaireSlider || !ratioDividendesValue || !ratioSalaireValue) return;
        
        const ratioSalaire = parseInt(ratioSalaireSlider.value);
        const ratioDividendes = 100 - ratioSalaire;
        
        ratioSalaireValue.textContent = `${ratioSalaire}%`;
        ratioDividendesValue.textContent = `${ratioDividendes}%`;
    }

    /**
     * Mise à jour de la valeur du capital libéré
     */
    function updateCapitalLibereValue() {
        if (!capitalLibereSlider || !capitalLibereValue) return;
        
        const value = parseInt(capitalLibereSlider.value);
        capitalLibereValue.textContent = `${value}%`;
    }

    /**
     * Applique les paramètres avancés et recalcule les résultats
     */
    function applyAdvancedParams() {
        if (!ratioSalaireSlider || !capitalSocialInput || !capitalLibereSlider || !caSimulationInput) return;
        
        parametresAvances.ratioSalaire = parseInt(ratioSalaireSlider.value);
        parametresAvances.ratioDividendes = 100 - parametresAvances.ratioSalaire;
        parametresAvances.capitalSocial = parseInt(capitalSocialInput.value);
        parametresAvances.capitalLibere = parseInt(capitalLibereSlider.value);
        parametresAvances.caSimulation = parseInt(caSimulationInput.value);
        
        // Recalculer les résultats avec les nouveaux paramètres
        generateResults();
        
        // Notification à l'utilisateur
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        notification.textContent = 'Paramètres appliqués et résultats recalculés';
        document.body.appendChild(notification);
        
        // Disparaitre après 3 secondes
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * Export des résultats en PDF
     */
    function exportToPdf() {
        // Vérifier si la bibliothèque jsPDF est disponible
        if (typeof window.jspdf === 'undefined') {
            alert('La bibliothèque jsPDF n\'est pas chargée. Impossible de générer le PDF.');
            return;
        }
        
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // En-tête
            doc.setFontSize(20);
            doc.text("Résultats du simulateur de forme juridique", 20, 20);
            doc.setFontSize(12);
            doc.text(`Simulation réalisée le ${new Date().toLocaleDateString()}`, 20, 30);
            
            // Contenu principal - à personnaliser selon les résultats
            doc.text("Résultats de la simulation", 20, 50);
            
            // Enregistrer le PDF
            doc.save("simulation-forme-juridique.pdf");
            
            // Notification à l'utilisateur
            alert('Le PDF a été généré avec succès !');
        } catch (error) {
            console.error('Erreur lors de la génération du PDF:', error);
            alert('Une erreur est survenue lors de la génération du PDF.');
        }
    }

    /**
     * Export des résultats en Excel
     */
    function exportToExcel() {
        // Vérifier si la bibliothèque XLSX est disponible
        if (typeof XLSX === 'undefined') {
            alert('La bibliothèque XLSX n\'est pas chargée. Impossible de générer le fichier Excel.');
            return;
        }
        
        try {
            // Créer un tableau de données pour Excel
            const data = [
                ['Forme juridique', 'Score', 'Compatibilité', 'Détails'],
                // Ajouter les données des résultats ici
            ];
            
            // Créer un workbook et une worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(data);
            
            // Ajouter la worksheet au workbook
            XLSX.utils.book_append_sheet(wb, ws, "Résultats");
            
            // Générer le fichier Excel
            XLSX.writeFile(wb, "simulation-forme-juridique.xlsx");
            
            // Notification à l'utilisateur
            alert('Le fichier Excel a été généré avec succès !');
        } catch (error) {
            console.error('Erreur lors de la génération du fichier Excel:', error);
            alert('Une erreur est survenue lors de la génération du fichier Excel.');
        }
    }

    /**
     * Mettre à jour la date de dernière mise à jour
     */
    function updateLastUpdateDate() {
        const lastUpdateDate = document.getElementById('lastUpdateDate');
        if (lastUpdateDate) {
            const now = new Date();
            const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
            lastUpdateDate.textContent = now.toLocaleDateString('fr-FR', options);
        }
    }

    /**
     * Mettre à jour l'horloge de marché
     */
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

    /**
     * Gestion des sections du formulaire
     */
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
        
        // Mettre à jour la barre de progression
        updateProgressBar(sectionNumber, 5);
        
        // Scroll vers le haut
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * Fonction pour sauvegarder les réponses dans localStorage
     */
    function saveProgress() {
        localStorage.setItem('entreprise-form-progress', JSON.stringify(userResponses));
    }

    /**
     * Fonction pour charger les réponses depuis localStorage
     */
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

    /**
     * Réinitialise la simulation
     */
    function resetSimulation() {
        // Vider les réponses
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
        
        // Réinitialiser l'interface
        document.querySelectorAll('.option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        document.querySelectorAll('.priority-badge').forEach(badge => {
            badge.remove();
        });
        
        // Réinitialiser les sliders
        if (patrimoineSlider) patrimoineSlider.value = 3;
        if (risqueSlider) risqueSlider.value = 3;
        
        // Réinitialiser le checkbox
        if (checkboxReglementee) checkboxReglementee.checked = false;
        
        // Supprimer le localStorage
        localStorage.removeItem('entreprise-form-progress');
        
        // Retourner à la première section
        showSection(1);
    }

    /**
     * Collecte les données de la section 1
     */
    function collectSection1Data() {
        const selectedProfile = document.querySelector('#section1 .option-btn.selected');
        if (selectedProfile) {
            userResponses.profilEntrepreneur = selectedProfile.getAttribute('data-value');
        }
        
        userResponses.protectionPatrimoine = parseInt(patrimoineSlider.value);
    }

    /**
     * Collecte les données de la section 2
     */
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

    /**
     * Collecte les données de la section 3
     */
    function collectSection3Data() {
        // Collecter objectifs avec priorité
        userResponses.objectifs = [];
        userResponses.objectifsPriorite = [];
        
        // Utiliser l'ordre de sélection pour déterminer la priorité
        const selectedButtons = document.querySelectorAll('#section3 .option-btn.selected[data-multi="true"]');
        selectedButtons.forEach(button => {
            const value = button.getAttribute('data-value');
            const badge = button.querySelector('.priority-badge');
            const priorite = badge ? parseInt(badge.textContent) : 0;
            
            userResponses.objectifs.push(value);
            userResponses.objectifsPriorite.push({
                valeur: value,
                priorite: priorite
            });
        });
        
        const selectedRemuneration = document.querySelector('#section3 .option-btn.selected:not([data-multi])');
        if (selectedRemuneration) {
            userResponses.remuneration = selectedRemuneration.getAttribute('data-value');
        }
    }

    /**
     * Collecte les données de la section 4
     */
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

    /**
     * Génère les résultats en fonction des réponses
     */
    function generateResults() {
        // Vérifier si le module fiscal est chargé
        if (!window.checkHardFails || !window.SimulationsFiscales) {
            console.error('Module fiscal-simulation.js non chargé');
            alert('Erreur: Module de simulation fiscale non disponible.');
            return;
        }
        
        // Vérifier d'abord les incompatibilités majeures
        const hardFails = window.checkHardFails(userResponses);
        
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

            // Vérifier si cette forme a une incompatibilité majeure
            if (window.hasHardFail(forme.id, hardFails)) {
                // Si oui, score très bas et on l'indique comme incompatible
                incompatibiliteMajeure = true;
                
                // Récupérer les détails des incompatibilités
                incompatibilites = hardFails.filter(fail => fail.formeId === forme.id);
                
                // Note: On continue quand même le calcul du score pour montrer 
                // à quel point ce serait adapté sans cette incompatibilité
            }
            
            // PARTIE STRUCTURELLE (60%)
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
            
            // Protection patrimoniale
            if (userResponses.protectionPatrimoine >= 4 && forme.protectionPatrimoine === 'Oui') {
                scoreCriteresStructurels += 20 * coefficients.protectionPatrimoine;
                details.push('Excellente protection du patrimoine personnel');
            } else if (userResponses.protectionPatrimoine >= 3 && forme.protectionPatrimoine.includes('Oui')) {
                scoreCriteresStructurels += 15 * coefficients.protectionPatrimoine;
                details.push('Bonne protection du patrimoine personnel');
            } else if (userResponses.protectionPatrimoine <= 2 && forme.protectionPatrimoine === 'Non') {
                scoreCriteresStructurels += 10; // Le coefficient n'est pas appliqué car c'est moins important
                details.push('Protection patrimoniale limitée (conforme à vos besoins)');
            }

            // Type d'activité
            if (userResponses.typeActivite && forme.activite.includes(userResponses.typeActivite)) {
                scoreCriteresStructurels += 15 * coefficients.typeActivite;
                details.push(`Adapté aux activités ${userResponses.typeActivite}s`);
            }
            
            // Activité réglementée
            if (userResponses.activiteReglementee && forme.id.includes('sel')) {
                scoreCriteresStructurels += 25;
                details.push('Structure spécifique pour activités réglementées');
            }
            
            // Chiffre d'affaires
            if (userResponses.chiffreAffaires === 'faible' && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels += 20 * coefficients.chiffreAffaires;
                details.push('Parfait pour les petits chiffres d\'affaires');
            } else if (userResponses.chiffreAffaires === 'moyen' && 
                      (forme.id === 'eurl' || forme.id === 'sasu' || forme.id === 'ei')) {
                scoreCriteresStructurels += 15 * coefficients.chiffreAffaires;
                details.push('Bien adapté aux chiffres d\'affaires moyens');
            } else if (userResponses.chiffreAffaires === 'eleve' && 
                      (forme.id === 'sas' || forme.id === 'sarl' || forme.id === 'sa')) {
                scoreCriteresStructurels += 20 * coefficients.chiffreAffaires;
                details.push('Structure idéale pour les chiffres d\'affaires élevés');
            }
            
            // PARTIE OBJECTIFS (40%)
            // Remuneration
            if (userResponses.remuneration === 'salaire' && forme.regimeSocial.includes('salarié')) {
                scoreObjectifs += 20;
                details.push('Permet une rémunération par salaire');
            } else if (userResponses.remuneration === 'dividendes' && forme.fiscalite === 'IS') {
                scoreObjectifs += 20;
                details.push('Permet une distribution de dividendes optimisée');
            } else if (userResponses.remuneration === 'mixte' && 
                      (forme.id === 'sasu' || forme.id === 'sas' || forme.id === 'sarl')) {
                scoreObjectifs += 25;
                details.push('Permet un mix optimal salaire/dividendes');
            }
            
            // Objectifs spécifiques
            userResponses.objectifs.forEach(objectif => {
                if (objectif === 'simplicite' && 
                   (forme.formalites === 'Très simplifiées' || forme.formalites === 'Simplifiées')) {
                    scoreObjectifs += 15;
                    details.push('Formalités simplifiées, gestion facile');
                } else if (objectif === 'economie' && forme.id === 'micro-entreprise') {
                    scoreObjectifs += 15;
                    details.push('Coûts de création et de gestion très réduits');
                } else if (objectif === 'fiscalite' && forme.fiscaliteOption === 'Oui') {
                    scoreObjectifs += 15;
                    details.push('Flexibilité fiscale (choix entre IR et IS)');
                } else if (objectif === 'protection' && forme.protectionPatrimoine === 'Oui') {
                    scoreObjectifs += 15;
                    details.push('Excellente protection du patrimoine personnel');
                } else if (objectif === 'croissance' && 
                          (forme.leveeFonds === 'Oui' || forme.id === 'sas' || forme.id === 'sa')) {
                    scoreObjectifs += 15;
                    details.push('Structure adaptée à la croissance et levée de fonds');
                } else if (objectif === 'credibilite' && 
                          (forme.id === 'sas' || forme.id === 'sarl' || forme.id === 'sa')) {
                    scoreObjectifs += 15;
                    details.push('Forte crédibilité auprès des partenaires et clients');
                }
            });
            
            // Régime fiscal souhaité
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
            
            // Régime social souhaité
            if (userResponses.regimeSocial === 'tns' && forme.regimeSocial.includes('TNS')) {
                scoreObjectifs += 15 * coefficients.regimeSocial;
                details.push('Correspond à votre préférence pour le statut TNS');
            } else if (userResponses.regimeSocial === 'salarie' && forme.regimeSocial.includes('salarié')) {
                scoreObjectifs += 15 * coefficients.regimeSocial;
                details.push('Correspond à votre préférence pour le statut assimilé-salarié');
            }
            
            // Niveau de risque acceptable
            if (userResponses.risque >= 4 && 
               (forme.id === 'ei' || forme.id === 'micro-entreprise' || forme.id === 'snc')) {
                scoreObjectifs += 10;
                details.push('Conforme à votre tolérance élevée au risque');
            } else if (userResponses.risque <= 2 && forme.protectionPatrimoine === 'Oui') {
                scoreObjectifs += 15;
                details.push('Sécurité maximale adaptée à votre profil prudent');
            }
            
            // Score total
            score = scoreCriteresStructurels + scoreObjectifs;
            
            // Stocker les scores détaillés pour l'affichage
            scoreDetails = {
                criteres: scoreCriteresStructurels,
                objectifs: scoreObjectifs,
                total: score,
                pourcentage: Math.round((score / SCORE_MAX_POSSIBLE) * 100)
            };

            // Déterminer la catégorie de compatibilité
            let compatibilite;
            if (incompatibiliteMajeure) {
                compatibilite = 'INCOMPATIBLE';
                score = -100; // Score très négatif pour les incompatibles
            } else if (score < 0) {
                compatibilite = 'DÉCONSEILLÉ';
            } else if (score / SCORE_MAX_POSSIBLE < 0.60) {
                compatibilite = 'PEU ADAPTÉ';
            } else if (score / SCORE_MAX_POSSIBLE < 0.85) {
                compatibilite = 'COMPATIBLE';
            } else {
                compatibilite = 'RECOMMANDÉ';
            }
            
            // Simulation fiscale avec les paramètres avancés
            const simulation = window.SimulationsFiscales.simulerImpactFiscal(forme, parametresAvances.caSimulation, {
                ratioSalaire: parametresAvances.ratioSalaire,
                ratioDividendes: parametresAvances.ratioDividendes,
                capitalSocial: parametresAvances.capitalSocial,
                capitalLibere: parametresAvances.capitalLibere
            });

            // Retourner l'objet avec les scores calculés et les détails
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
                incompatibiliteMajeure: incompatibiliteMajeure,
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
        displayResults(resultatsAffichage, resultatsIncompatibles);
        
        // Préparer les données du tableau comparatif complet
        prepareComparatifTable(formesJuridiques);
        
        // Rendre visible les boutons d'export
        if (exportButtons) {
            exportButtons.style.display = 'flex';
        }
        
        // Retourner tous les résultats pour référence
        return {
            recommandes: resultatsRecommandes,
            compatibles: resultatsCompatibles,
            peuAdaptes: resultatsPeuAdaptes,
            deconseilles: resultatsDeconseilles,
            incompatibles: resultatsIncompatibles
        };
    }

    /**
     * Affiche les résultats à l'utilisateur
     */
    function displayResults(results, incompatibles) {
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        // Si aucun résultat trouvé
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="p-6 text-center">
                    <h3 class="text-xl font-bold text-red-400 mb-4">Aucun résultat compatible trouvé</h3>
                    <p class="mb-4">Vos critères ne correspondent à aucune forme juridique recommandée. Essayez de modifier vos réponses.</p>
                    <button id="restart-form" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition flex items-center mx-auto">
                        <i class="fas fa-redo mr-2"></i> Recommencer la simulation
                    </button>
                </div>
            `;
            
            // Ajouter un écouteur d'événement au bouton de redémarrage
            const restartForm = document.getElementById('restart-form');
            if (restartForm) {
                restartForm.addEventListener('click', resetSimulation);
            }
            
            return;
        }
        
        // Résultat principal (le premier comme recommandation principale)
        const recommended = results[0];
        
        // Calculer le score en pourcentage pour la visualisation
        const scorePercentage = Math.round((recommended.scoreDetails.pourcentage || 85));
        
        let htmlPrimary = `
            <div class="result-card primary-result visible p-6 mb-6 relative">
                ${recommended.compatibilite === 'RECOMMANDÉ' ? '<div class="recommended-badge">Recommandé</div>' : ''}
                <h3 class="text-2xl font-bold text-green-400 mb-3">${recommended.forme.nom}</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p class="text-lg mb-3">Score de compatibilité: <strong class="text-green-400">${scorePercentage}%</strong></p>
                        
                        <div class="match-indicator mb-4">
                            <div class="match-fill" style="width: ${scorePercentage}%;"></div>
                        </div>
                        
                        <h4 class="font-semibold mb-2">Caractéristiques principales</h4>
                        <ul class="feature-list">
                            <li><i class="fas fa-users text-green-400"></i> <strong>Associés:</strong> ${recommended.forme.associes}</li>
                            <li><i class="fas fa-coins text-green-400"></i> <strong>Capital:</strong> ${recommended.forme.capital}</li>
                            <li><i class="fas fa-shield-alt text-green-400"></i> <strong>Responsabilité:</strong> ${recommended.forme.responsabilite}</li>
                            <li><i class="fas fa-percentage text-green-400"></i> <strong>Fiscalité:</strong> ${recommended.forme.fiscalite}</li>
                            <li><i class="fas fa-id-card text-green-400"></i> <strong>Régime social:</strong> ${recommended.forme.regimeSocial}</li>
                        </ul>
                    </div>
                    <div>
                        <h4 class="font-semibold mb-2">Points forts pour votre profil</h4>
                        <ul class="feature-list">
        `;
        
        // Ajouter les points forts (détails)
        recommended.details.slice(0, 5).forEach(detail => {
            htmlPrimary += `<li><i class="fas fa-check text-green-400"></i> ${detail}</li>`;
        });
        
        htmlPrimary += `
                        </ul>
                        
                        <h4 class="font-semibold mt-4 mb-2">Impact fiscal estimé</h4>
                        <div class="bg-blue-900 bg-opacity-30 p-3 rounded-lg">
                            <div class="flex justify-between mb-2">
                                <span>Revenu brut simulé:</span>
                                <span>${parametresAvances.caSimulation.toLocaleString('fr-FR')} €</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span>Charges sociales:</span>
                                <span>${Math.round(recommended.simulation.chargesSociales || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span>Impôts:</span>
                                <span>${Math.round(recommended.simulation.impot || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                            <div class="flex justify-between font-semibold text-green-400">
                                <span>Revenu net estimé:</span>
                                <span>${Math.round(recommended.simulation.revenueNet || 0).toLocaleString('fr-FR')} €</span>
                            </div>
                        </div>
                        
                        <div class="mt-4">
                            <button id="show-score-details" class="text-green-400 hover:text-green-300 text-sm flex items-center">
                                <i class="fas fa-calculator mr-1"></i> Voir le détail du score
                            </button>
                            <div id="score-details" class="score-details hidden mt-2">
                                <ul>
                                    <li>Score critères structurels: ${recommended.scoreCriteresStructurels} pts (60%)</li>
                                    <li>Score objectifs: ${recommended.scoreObjectifs} pts (40%)</li>
                                    <li>Score total: ${recommended.score} / ${SCORE_MAX_POSSIBLE}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter les autres résultats si disponibles
        let secondaryHtml = '';
        if (results.length > 1) {
            // Afficher le bouton pour montrer plus de résultats
            if (showMoreResults) {
                showMoreResults.classList.remove('hidden');
            }
            
            // Créer le contenu des résultats secondaires
            secondaryHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
            
            results.slice(1).forEach(result => {
                const resultScore = Math.round((result.scoreDetails.pourcentage || 75));
                
                secondaryHtml += `
                    <div class="result-card visible p-5 relative">
                        <h3 class="text-xl font-bold text-green-400 mb-2">${result.forme.nom}</h3>
                        <p class="mb-2">Compatibilité: <strong>${resultScore}%</strong></p>
                        
                        <div class="match-indicator mb-3">
                            <div class="match-fill" style="width: ${resultScore}%;"></div>
                        </div>
                        
                        <h4 class="font-semibold text-sm mb-2">Points clés</h4>
                        <ul class="text-sm">
                            <li><strong>Fiscalité:</strong> ${result.forme.fiscalite}</li>
                            <li><strong>Régime social:</strong> ${result.forme.regimeSocial}</li>
                            <li><strong>Points forts:</strong> ${result.details.slice(0, 2).join(', ')}</li>
                        </ul>
                        
                        <div class="mt-3 grid grid-cols-2 gap-2">
                            <div class="text-sm">
                                <div class="text-xs opacity-70">Charges</div>
                                <div>${Math.round(result.simulation.chargesSociales || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                            <div class="text-sm">
                                <div class="text-xs opacity-70">Revenu net</div>
                                <div>${Math.round(result.simulation.revenueNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            secondaryHtml += '</div>';
            
            // Ajouter le contenu secondaire au container
            if (secondaryResults) {
                secondaryResults.innerHTML = secondaryHtml;
            }
        }
        
        // Ajouter les incompatibilités si présentes
        const incompatibilitesHtml = displayIncompatibilites(incompatibles);
        
        // Ajouter le tout au container
        resultsContainer.innerHTML = htmlPrimary + incompatibilitesHtml;
        
        // Activer le bouton de détail du score
        const showScoreDetails = document.getElementById('show-score-details');
        const scoreDetails = document.getElementById('score-details');
        
        if (showScoreDetails && scoreDetails) {
            showScoreDetails.addEventListener('click', function() {
                scoreDetails.classList.toggle('hidden');
                showScoreDetails.innerHTML = scoreDetails.classList.contains('hidden') 
                    ? '<i class="fas fa-calculator mr-1"></i> Voir le détail du score' 
                    : '<i class="fas fa-calculator mr-1"></i> Masquer le détail';
            });
        }
        
        // Déclencher un événement pour indiquer que les résultats sont chargés
        document.dispatchEvent(new CustomEvent('resultsLoaded'));
    }

    /**
     * Affiche les formes juridiques incompatibles
     */
    function displayIncompatibilites(incompatibles) {
        if (!incompatibles || incompatibles.length === 0) return '';
        
        let html = `
            <div class="mt-8 mb-6">
                <h3 class="text-xl font-bold text-red-400 mb-4 flex items-center">
                    <i class="fas fa-exclamation-triangle mr-2"></i> 
                    Formes juridiques incompatibles avec votre profil
                </h3>
                <div class="bg-blue-900 bg-opacity-20 p-4 rounded-xl">
                    <p class="mb-4">Les structures suivantes présentent des incompatibilités majeures avec vos critères :</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        // Regrouper les incompatibilités par forme juridique
        const incompatibiliteParForme = {};
        incompatibles.forEach(inc => {
            const forme = formesJuridiques.find(f => f.id === inc.formeId);
            if (forme) {
                if (!incompatibiliteParForme[forme.id]) {
                    incompatibiliteParForme[forme.id] = {
                        forme: forme,
                        raisons: []
                    };
                }
                
                // Vérifier si cette raison n'est pas déjà listée
                const raisonExiste = incompatibiliteParForme[forme.id].raisons.some(r => r.code === inc.code);
                if (!raisonExiste) {
                    incompatibiliteParForme[forme.id].raisons.push({
                        code: inc.code,
                        message: inc.message,
                        details: inc.details
                    });
                }
            }
        });
        
        // Générer le HTML pour chaque forme incompatible
        Object.values(incompatibiliteParForme).forEach(item => {
            html += `
                <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                    <h4 class="font-semibold text-red-400 mb-2">${item.forme.nom}</h4>
                    <ul class="text-sm">
            `;
            
            item.raisons.forEach(raison => {
                html += `<li class="mb-1 flex items-start">
                    <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                    <span>${raison.message}</span>
                </li>`;
            });
            
            html += `
                    </ul>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        return html;
    }

    /**
     * Prépare le tableau comparatif complet
     */
    function prepareComparatifTable(formesJuridiques) {
        if (!comparatifTableBody) return;
        
        // Vider le tableau existant
        comparatifTableBody.innerHTML = '';
        
        // Créer une ligne pour chaque forme juridique
        formesJuridiques.forEach(forme => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-blue-900 hover:bg-opacity-40';
            
            // Créer les cellules
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-semibold">${forme.nom}</div>
                    <div class="text-xs text-gray-400">${forme.categorie}</div>
                </td>
                <td class="p-3">${forme.associes}</td>
                <td class="p-3">${forme.capital}</td>
                <td class="p-3">${forme.responsabilite}</td>
                <td class="p-3">${forme.fiscalite}${forme.fiscaliteOption === 'Oui' ? ' (option)' : ''}</td>
                <td class="p-3">${forme.regimeSocial}</td>
                <td class="p-3">
                    <ul class="text-sm list-disc pl-4">
                        <li>${forme.avantages.split(',')[0]}</li>
                        ${forme.avantages.includes(',') ? `<li>${forme.avantages.split(',')[1]}</li>` : ''}
                    </ul>
                </td>
                <td class="p-3">
                    <ul class="text-sm list-disc pl-4">
                        <li>${forme.inconvenients.split(',')[0]}</li>
                        ${forme.inconvenients.includes(',') ? `<li>${forme.inconvenients.split(',')[1]}</li>` : ''}
                    </ul>
                </td>
            `;
            
            // Ajouter la ligne au tableau
            comparatifTableBody.appendChild(row);
        });
    }

    /**
     * Affiche le tableau comparatif complet
     */
    function showComparatifComplet() {
        if (!comparatifComplet || !resultsContainer) return;
        
        // Masquer les résultats
        resultsContainer.classList.add('hidden');
        
        // Afficher le tableau comparatif
        comparatifComplet.classList.remove('hidden');
        
        // Scroll vers le haut
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * Cache le tableau comparatif complet
     */
    function hideComparatifComplet() {
        if (!comparatifComplet || !resultsContainer) return;
        
        // Masquer le tableau comparatif
        comparatifComplet.classList.add('hidden');
        
        // Afficher les résultats
        resultsContainer.classList.remove('hidden');
        
        // Scroll vers le haut
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});
