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
            // (Code existant pour calculer les scores selon différents critères)
            // ...

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
        
        // Ajouter les éléments d'interface pour afficher les résultats
        // Le code existant pour l'affichage des résultats...
    }

    /**
     * Affiche les formes juridiques incompatibles
     */
    function displayIncompatibilites(incompatibles) {
        if (incompatibles.length === 0) return '';
        
        // Le code existant pour afficher les incompatibilités...
    }

    /**
     * Prépare le tableau comparatif complet
     */
    function prepareComparatifTable(formesJuridiques) {
        if (!comparatifTableBody) return;
        
        // Le code existant pour préparer le tableau comparatif...
    }

    /**
     * Affiche le tableau comparatif complet
     */
    function showComparatifComplet() {
        if (!comparatifComplet) return;
        
        // Le code existant pour afficher le tableau comparatif...
    }

    /**
     * Cache le tableau comparatif complet
     */
    function hideComparatifComplet() {
        if (!comparatifComplet) return;
        
        // Le code existant pour cacher le tableau comparatif...
    }
});
