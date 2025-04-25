/**
 * Simulateur de forme juridique d'entreprise - Version améliorée 2025
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: progression du général au particulier, questions qualitatives précises,
 * scoring pondéré contextuel, détection des incompatibilités, simulation pluriannuelle.
 * Dernière mise à jour : Avril 2025 - Information vérifiées pour la législation en vigueur
 */

document.addEventListener('DOMContentLoaded', function() {
    // ===== MODULE 3: GESTION DES FORMULAIRES ET INTERFACES UTILISATEUR =====
    const FormManager = {
        // Variables pour le formulaire
        currentSection: 1,
        totalSections: 5,
        
        // Initialisation
        init: function() {
            this.setupEventListeners();
            this.updateProgressBar(1);
        },
        
        // Configuration des écouteurs d'événements
        setupEventListeners: function() {
            // Boutons de navigation
            const nextStep1 = document.getElementById('next1');
            const nextStep2 = document.getElementById('next2');
            const nextStep3 = document.getElementById('next3');
            const prevStep2 = document.getElementById('prev2');
            const prevStep3 = document.getElementById('prev3');
            const prevStep4 = document.getElementById('prev4');
            const submitBtn = document.getElementById('submit-btn');
            const restartBtn = document.getElementById('restart-btn');
            
            // Gestion des boutons d'option simples
            const optionButtons = document.querySelectorAll('.option-btn');
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
            
            // Navigation entre sections
            if (nextStep1) {
                nextStep1.addEventListener('click', () => {
                    DataCollector.collectSection1Data();
                    StorageManager.saveProgress();
                    this.showSection(2);
                });
            }
            
            if (nextStep2) {
                nextStep2.addEventListener('click', () => {
                    DataCollector.collectSection2Data();
                    StorageManager.saveProgress();
                    this.showSection(3);
                });
            }
            
            if (nextStep3) {
                nextStep3.addEventListener('click', () => {
                    DataCollector.collectSection3Data();
                    StorageManager.saveProgress();
                    this.showSection(4);
                });
            }
            
            if (prevStep2) {
                prevStep2.addEventListener('click', () => this.showSection(1));
            }
            
            if (prevStep3) {
                prevStep3.addEventListener('click', () => this.showSection(2));
            }
            
            if (prevStep4) {
                prevStep4.addEventListener('click', () => this.showSection(3));
            }
            
            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    DataCollector.collectSection4Data();
                    StorageManager.saveProgress();
                    this.showSection(5);
                    ResultsManager.generateResults();
                });
            }
            
            if (restartBtn) {
                restartBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.resetSimulation();
                });
            }
            
            // Autres écouteurs d'événements spécifiques aux paramètres avancés
            const advancedParamsToggle = document.getElementById('advanced-params-toggle');
            if (advancedParamsToggle) {
                advancedParamsToggle.addEventListener('click', this.toggleAdvancedParams);
            }
            
            // Écouteur pour les détails de calcul
            const showCalculationDetails = document.getElementById('show-calculation-details');
            if (showCalculationDetails) {
                showCalculationDetails.addEventListener('change', function() {
                    document.dispatchEvent(new CustomEvent('toggleCalculationDetails', {
                        detail: { visible: this.checked }
                    }));
                });
            }
        },
        
        // Afficher une section spécifique
        showSection: function(sectionNumber) {
            const sections = document.querySelectorAll('.question-section');
            const progressSteps = document.querySelectorAll('.progress-step');
            
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
            this.updateProgressBar(sectionNumber);
            
            // Scroll vers le haut
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            this.currentSection = sectionNumber;
        },
        
        // Mise à jour de la barre de progression
        updateProgressBar: function(currentStep) {
            const percentage = (currentStep / this.totalSections) * 100;
            const progressBar = document.getElementById('progress-bar');
            const progressPercentage = document.getElementById('progress-percentage');
            
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
                // Logique améliorée pour montrer la progression réelle
                const stepQuestionMapping = {
                    1: "1-3",  // Section 1: 3 questions
                    2: "4-5",  // Section 2: 2 questions
                    3: "6-7",  // Section 3: 2 questions
                    4: "8-9",  // Section 4: 2 questions
                    5: "9"     // Résultats
                };
                
                const questionText = stepQuestionMapping[currentStep] || "1";
                questionProgress.textContent = `Question${questionText.includes('-') ? 's' : ''} ${questionText} sur 9`;
            }
        },
        
        // Bascule les paramètres avancés
        toggleAdvancedParams: function() {
            const advancedParamsContent = document.getElementById('advanced-params-content');
            const iconElement = document.getElementById('params-toggle-icon');
            
            if (advancedParamsContent) {
                advancedParamsContent.classList.toggle('visible');
                
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
        },
        
        // Réinitialise la simulation
        resetSimulation: function() {
            userResponses = {
                // Section 1: Profil & Horizon Personnel
                tmiActuel: 30,
                autresRevenusSalaries: false,
                horizonProjet: 'moyen',
                revenuAnnee1: 30000,
                revenuAnnee3: 50000,
                bienImmobilier: false,
                
                // Section 2: Équipe & Gouvernance
                profilEntrepreneur: null,
                typeInvestisseurs: [],
                
                // Section 3: Nature de l'activité
                typeActivite: null,
                activiteReglementee: false,
                ordreProessionnel: false,
                risqueResponsabilite: false,
                besoinAssurance: false,
                
                // Section 4: Volumétrie et finances
                chiffreAffaires: null,
                tauxMarge: 35,
                besoinRevenusImmediats: false,
                cautionBancaire: false,
                montantLevee: 0,
                preferenceRemuneration: 'mixte',
                aides: [],
                transmission: null,
                regimeFiscal: null,
                regimeSocial: null
            };
            
            // Réinitialiser l'interface
            document.querySelectorAll('.option-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            // Réinitialiser les champs de saisie
            const tmiSelect = document.getElementById('tmi-actuel');
            const revenuAnnee1Input = document.getElementById('revenu-annee1');
            const revenuAnnee3Input = document.getElementById('revenu-annee3');
            const bienImmobilierCheckbox = document.getElementById('bien-immobilier');
            const checkboxReglementee = document.getElementById('activite-reglementee');
            const ordreProCheckbox = document.getElementById('ordre-professionnel');
            const caPrevisionnelInput = document.getElementById('ca-previsionnel');
            const tauxMargeSlider = document.getElementById('taux-marge');
            const tauxMargeValue = document.getElementById('taux-marge-value');
            const besoinsRevenusCheckbox = document.getElementById('besoin-revenus-immediats');
            const cautionBancaireCheckbox = document.getElementById('caution-bancaire');
            const montantLeveeInput = document.getElementById('montant-levee');
            
            // Réinitialiser les champs de saisie
            if (tmiSelect) tmiSelect.value = '30';
            if (revenuAnnee1Input) revenuAnnee1Input.value = '30000';
            if (revenuAnnee3Input) revenuAnnee3Input.value = '50000';
            if (bienImmobilierCheckbox) bienImmobilierCheckbox.checked = false;
            if (checkboxReglementee) checkboxReglementee.checked = false;
            if (ordreProCheckbox) ordreProCheckbox.checked = false;
            if (caPrevisionnelInput) caPrevisionnelInput.value = '75000';
            if (tauxMargeSlider) tauxMargeSlider.value = '35';
            if (tauxMargeValue) tauxMargeValue.textContent = '35%';
            if (besoinsRevenusCheckbox) besoinsRevenusCheckbox.checked = false;
            if (cautionBancaireCheckbox) cautionBancaireCheckbox.checked = false;
            if (montantLeveeInput) montantLeveeInput.value = '0';
            
            // Supprimer le localStorage
            localStorage.removeItem('entreprise-form-progress');
            
            // Retourner à la première section
            this.showSection(1);
        }
    };

    // ===== MODULE 4: COLLECTEUR DE DONNÉES DU FORMULAIRE =====
    const DataCollector = {
        /**
         * Collecte les données de la section 1 : Profil & Horizon Personnel
         */
        collectSection1Data: function() {
            // TMI actuelle
            const tmiSelect = document.getElementById('tmi-actuel');
            if (tmiSelect) {
                userResponses.tmiActuel = parseInt(tmiSelect.value);
            }
            
            // Autres revenus salariés
            const autresRevenusBtn = document.querySelector('#section1 .option-btn[data-value="oui"].selected');
            userResponses.autresRevenusSalaries = !!autresRevenusBtn;
            
            // Horizon du projet
            const horizonButtons = document.querySelectorAll('#section1 .option-btn[data-value^="court"], #section1 .option-btn[data-value^="moyen"], #section1 .option-btn[data-value^="long"]');
            horizonButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.horizonProjet = button.getAttribute('data-value');
                }
            });
            
            // Objectifs de revenus
            const revenuAnnee1Input = document.getElementById('revenu-annee1');
            const revenuAnnee3Input = document.getElementById('revenu-annee3');
            
            if (revenuAnnee1Input) {
                userResponses.revenuAnnee1 = parseInt(revenuAnnee1Input.value);
            }
            
            if (revenuAnnee3Input) {
                userResponses.revenuAnnee3 = parseInt(revenuAnnee3Input.value);
            }
            
            // Bien immobilier
            const bienImmobilierCheckbox = document.getElementById('bien-immobilier');
            if (bienImmobilierCheckbox) {
                userResponses.bienImmobilier = bienImmobilierCheckbox.checked;
            }
        },

        /**
         * Collecte les données de la section 2 : Équipe & Gouvernance
         */
        collectSection2Data: function() {
            // Profil entrepreneur
            const profilButtons = document.querySelectorAll('#section2 .option-btn[data-value]');
            profilButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.profilEntrepreneur = button.getAttribute('data-value');
                }
            });
            
            // Type d'investisseurs
            userResponses.typeInvestisseurs = [];
            const businessAngelsCheckbox = document.getElementById('invest-business-angels');
            const vcCheckbox = document.getElementById('invest-vc');
            const crowdfundingCheckbox = document.getElementById('invest-crowdfunding');
            
            if (businessAngelsCheckbox && businessAngelsCheckbox.checked) {
                userResponses.typeInvestisseurs.push('business-angels');
            }
            
            if (vcCheckbox && vcCheckbox.checked) {
                userResponses.typeInvestisseurs.push('vc');
            }
            
            if (crowdfundingCheckbox && crowdfundingCheckbox.checked) {
                userResponses.typeInvestisseurs.push('crowdfunding');
            }
        },

        /**
         * Collecte les données de la section 3 : Nature de l'activité
         */
        collectSection3Data: function() {
            // Type d'activité
            const typeActiviteSelect = document.getElementById('activite-type');
            if (typeActiviteSelect) {
                userResponses.typeActivite = typeActiviteSelect.value;
            }
            
            // Activité réglementée
            const checkboxReglementee = document.getElementById('activite-reglementee');
            if (checkboxReglementee) {
                userResponses.activiteReglementee = checkboxReglementee.checked;
            }
            
            // Ordre professionnel
            const ordreProCheckbox = document.getElementById('ordre-professionnel');
            if (ordreProCheckbox) {
                userResponses.ordreProessionnel = ordreProCheckbox.checked;
            }
            
            // Risques de responsabilité
            const risqueResponsabiliteCheckbox = document.getElementById('risque-responsabilite');
            if (risqueResponsabiliteCheckbox) {
                userResponses.risqueResponsabilite = risqueResponsabiliteCheckbox.checked;
            }
            
            // Besoin d'assurance
            const besoinAssuranceCheckbox = document.getElementById('besoin-assurance');
            if (besoinAssuranceCheckbox) {
                userResponses.besoinAssurance = besoinAssuranceCheckbox.checked;
            }
        },

        /**
         * Collecte les données de la section 4 : Volumétrie et finances
         */
        collectSection4Data: function() {
            // Chiffre d'affaires prévisionnel
            const caPrevisionnelInput = document.getElementById('ca-previsionnel');
            if (caPrevisionnelInput) {
                userResponses.chiffreAffaires = parseInt(caPrevisionnelInput.value);
            }
            
            // Taux de marge
            const tauxMargeSlider = document.getElementById('taux-marge');
            if (tauxMargeSlider) {
                userResponses.tauxMarge = parseInt(tauxMargeSlider.value);
            }
            
            // Besoin de revenus immédiats
            const besoinsRevenusCheckbox = document.getElementById('besoin-revenus-immediats');
            if (besoinsRevenusCheckbox) {
                userResponses.besoinRevenusImmediats = besoinsRevenusCheckbox.checked;
            }
            
            // Caution bancaire
            const cautionBancaireCheckbox = document.getElementById('caution-bancaire');
            if (cautionBancaireCheckbox) {
                userResponses.cautionBancaire = cautionBancaireCheckbox.checked;
            }
            
            // Montant de levée
            const montantLeveeInput = document.getElementById('montant-levee');
            if (montantLeveeInput) {
                userResponses.montantLevee = parseInt(montantLeveeInput.value);
            }
            
            // Préférence de rémunération
            const preferenceSelect = document.getElementById('preference-remuneration');
            if (preferenceSelect) {
                userResponses.preferenceRemuneration = preferenceSelect.value;
            }
            
            // Aides et dispositifs
            userResponses.aides = [];
            const acreCheckbox = document.getElementById('aide-acre');
            const jeiCheckbox = document.getElementById('aide-jei');
            const cirCheckbox = document.getElementById('aide-cir');
            
            if (acreCheckbox && acreCheckbox.checked) userResponses.aides.push('acre');
            if (jeiCheckbox && jeiCheckbox.checked) userResponses.aides.push('jei');
            if (cirCheckbox && cirCheckbox.checked) userResponses.aides.push('cir');
            
            // Transmission/sortie
            const sortieButtons = document.querySelectorAll('#section4 .option-btn[data-value^="revente"], #section4 .option-btn[data-value^="transmission"]');
            sortieButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.transmission = button.getAttribute('data-value');
                }
            });
            
            // Préférences fiscales et sociales
            const regimeFiscalSelect = document.getElementById('regime-fiscal-preference');
            const regimeSocialSelect = document.getElementById('regime-social-preference');
            
            if (regimeFiscalSelect) userResponses.regimeFiscal = regimeFiscalSelect.value;
            if (regimeSocialSelect) userResponses.regimeSocial = regimeSocialSelect.value;
        }
    };

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
            const results = window.FormeJuridiqueDB.structures.map(forme => {
                // Calculer le score avec le moteur de scoring amélioré
                const scoreResult = window.ScoringEngine.calculerScore(forme, userResponses);
                
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
            this.prepareComparatifTable(window.FormeJuridiqueDB.structures);
            
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
        },
        
        // Affiche les résultats
        displayResults: function(results, incompatibles) {
            const resultsContainer = document.getElementById('results-container');
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
                    restartForm.addEventListener('click', FormManager.resetSimulation.bind(FormManager));
                }
                
                return;
            }
            
            // Résultat principal (le premier comme recommandation principale)
            const recommended = results[0];
            
            // Calculer le score en pourcentage pour la visualisation
            const scorePercentage = Math.round((recommended.scoreDetails.pourcentage || 85));
            
            // Version améliorée avec badge "RECOMMANDÉ"
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
                                    <span>${this.simulationParams.caSimulation.toLocaleString('fr-FR')} €</span>
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
                                        <li>Score total: ${recommended.score} / ${window.ScoringEngine.SCORE_MAX}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Ajouter le tableau comparatif des régimes fiscaux (IR vs IS)
            htmlPrimary += this.renderTaxRegimeComparison(recommended.forme, this.simulationParams.caSimulation, userResponses.tauxMarge);
            
            // Ajouter la simulation salaire/dividendes
            htmlPrimary += this.renderSalaryDividendSimulation(recommended.forme, this.simulationParams.caSimulation, userResponses.tauxMarge);
            
            // Ajouter la projection pluriannuelle si activée
            if (this.simulationParams.afficherProjection) {
                htmlPrimary += this.renderMultiYearSimulation(recommended.forme, this.simulationParams.caSimulation, userResponses.tauxMarge);
            }
            
            // Ajouter les stratégies optimales pour cette forme juridique
            htmlPrimary += this.renderOptimalStrategies(recommended.forme, userResponses);
            
            // Ajouter les autres résultats si disponibles comme "challengers crédibles"
            let secondaryHtml = '';
            const showMoreResults = document.getElementById('show-more-results');
            const secondaryResults = document.getElementById('secondary-results');
            
            if (results.length > 1) {
                // Afficher le bouton pour montrer plus de résultats
                if (showMoreResults) {
                    showMoreResults.classList.remove('hidden');
                }
                
                // Titre pour les challengers
                secondaryHtml = `
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-medal text-blue-400 mr-2"></i>
                        Autres options compatibles
                    </h3>
                `;
                
                // Créer le contenu des résultats secondaires en grid
                secondaryHtml += '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
                
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
                    secondaryResults.classList.add('hidden'); // Caché par défaut
                }
            }
            
            // Ajouter les incompatibilités si présentes
            const incompatibilitesHtml = this.displayIncompatibilites(incompatibles);
            
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
            
            // Gérer les onglets d'années si la projection est active
            if (this.simulationParams.afficherProjection) {
                const yearTabs = document.querySelectorAll('.year-tab');
                const yearContents = document.querySelectorAll('.year-content');
                
                yearTabs.forEach(tab => {
                    tab.addEventListener('click', function() {
                        const year = this.getAttribute('data-year');
                        
                        // Désactiver tous les onglets et contenus
                        yearTabs.forEach(t => t.classList.remove('active'));
                        yearContents.forEach(c => c.classList.remove('active'));
                        
                        // Activer l'onglet cliqué et le contenu correspondant
                        this.classList.add('active');
                        document.getElementById(`year-content-${year}`).classList.add('active');
                    });
                });
            }
        },
        
        // Affiche les formes juridiques incompatibles
        displayIncompatibilites: function(incompatibles) {
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
                const forme = window.FormeJuridiqueDB.getById(inc.formeId);
                if (forme) {
                    if (!incompatibiliteParForme[forme.id]) {
                        incompatibiliteParForme[forme.id] = {
                            forme: forme,
                            raisons: [],
                            solution: this.getSolutionDeRepli(forme.id, inc.code)
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
                
                // Ajouter la solution de repli si disponible
                if (item.solution) {
                    html += `
                        <li class="mt-3 pt-2 border-t border-red-800 flex items-start">
                            <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-1"></i>
                            <span><strong>Alternative :</strong> ${item.solution}</span>
                        </li>
                    `;
                }
                
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
        },
        
        // Renvoie une solution de repli adaptée selon le type d'incompatibilité
        getSolutionDeRepli: function(formeId, codeErreur) {
            const solutions = {
                'micro-entreprise': {
                    'ca-depasse-seuil': 'Optez pour une EURL ou SASU permettant des volumes d\'activité plus importants',
                    'ordre-professionnel': 'Choisissez une SEL ou SELAS adaptée aux professions réglementées',
                    'investisseurs': 'Considérez une SAS pour accueillir des investisseurs'
                },
                'ei': {
                    'protection-patrimoine': 'Privilégiez une EURL qui offre une meilleure protection patrimoniale',
                    'levee-fonds': 'Optez pour une SAS ou SASU plus adaptée à la levée de fonds'
                },
                'sasu': {
                    'charges-elevees': 'Envisagez une EURL à l\'IR pour optimiser les charges sociales avec un CA faible',
                    'formalisme': 'Si la simplicité est prioritaire, considérez la micro-entreprise (si CA compatible)'
                }
            };
            
            return solutions[formeId] && solutions[formeId][codeErreur] 
                ? solutions[formeId][codeErreur] 
                : 'Consultez les autres formes recommandées dans les résultats';
        },
        
        // Prépare le tableau comparatif complet
        prepareComparatifTable: function(formesJuridiques) {
            const comparatifTableBody = document.getElementById('comparatif-table-body');
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
            
            // Configurer les boutons pour afficher/masquer le tableau
            const compareBtn = document.getElementById('compare-btn');
            const hideComparatifBtn = document.getElementById('hide-comparatif');
            const comparatifComplet = document.getElementById('comparatif-complet');
            const resultsContainer = document.getElementById('results-container');
            
            if (compareBtn && hideComparatifBtn && comparatifComplet && resultsContainer) {
                compareBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    resultsContainer.classList.add('hidden');
                    comparatifComplet.classList.remove('hidden');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                
                hideComparatifBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    comparatifComplet.classList.add('hidden');
                    resultsContainer.classList.remove('hidden');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            }
        },
        
        // Génère un tableau comparatif IR vs IS
        renderTaxRegimeComparison: function(forme, caSimulation, tauxMarge) {
            // Code pour le tableau comparatif IR vs IS
            // ...
        },
        
        // Génère une simulation comparative de répartition salaire/dividendes
        renderSalaryDividendSimulation: function(forme, caSimulation, tauxMarge) {
            // Code pour la simulation salaire/dividendes
            // ...
        },
        
        // Génère une projection pluriannuelle
        renderMultiYearSimulation: function(forme, caSimulation, tauxMarge) {
            // Code pour la projection pluriannuelle
            // ...
        },
        
        // Ajoute les stratégies optimales pour cette forme juridique
        renderOptimalStrategies: function(forme, userResponses) {
            // Code pour les stratégies optimales
            // ...
        }
    };

    // Initialisation du gestionnaire de stockage
    const StorageManager = {
        saveProgress: function() {
            localStorage.setItem('entreprise-form-progress', JSON.stringify(userResponses));
        },
        
        loadProgress: function() {
            const savedData = localStorage.getItem('entreprise-form-progress');
            if (savedData) {
                userResponses = JSON.parse(savedData);
                return true;
            }
            return false;
        }
    };

    // Initialisation
    let userResponses = {
        // Section 1: Profil & Horizon Personnel
        tmiActuel: 30,
        autresRevenusSalaries: false,
        horizonProjet: 'moyen',
        revenuAnnee1: 30000,
        revenuAnnee3: 50000,
        bienImmobilier: false,
        
        // Section 2: Équipe & Gouvernance
        profilEntrepreneur: null,
        typeInvestisseurs: [],
        
        // Section 3: Nature de l'activité
        typeActivite: null,
        activiteReglementee: false,
        ordreProessionnel: false,
        risqueResponsabilite: false,
        besoinAssurance: false,
        
        // Section 4: Volumétrie et finances
        chiffreAffaires: null,
        tauxMarge: 35,
        besoinRevenusImmediats: false,
        cautionBancaire: false,
        montantLevee: 0,
        preferenceRemuneration: 'mixte',
        aides: [],
        transmission: null,
        regimeFiscal: null,
        regimeSocial: null
    };
    
    // Charger les données sauvegardées
    if (StorageManager.loadProgress()) {
        console.log('Données chargées depuis localStorage');
    }
    
    // Initialiser les gestionnaires
    FormManager.init();
    ResultsManager.init();
});
