/**
 * Simulateur de forme juridique d'entreprise - Version améliorée 2025
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: progression du général au particulier, questions qualitatives précises,
 * scoring pondéré contextuel, détection des incompatibilités, simulation pluriannuelle.
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

    // Variables pour stocker les réponses de l'utilisateur - Structure améliorée
    let userResponses = {
        // Section 1: Profil & Horizon Personnel
        tmiActuel: 30, // Tranche marginale d'imposition actuelle (%)
        autresRevenusSalaries: false,
        horizonProjet: 'moyen', // court, moyen, long
        revenuAnnee1: 30000,
        revenuAnnee3: 50000,
        bienImmobilier: false,
        
        // Section 2: Équipe & Gouvernance
        profilEntrepreneur: null, // solo, famille, associes, investisseurs
        typeInvestisseurs: [], // business-angels, vc, crowdfunding
        
        // Section 3: Nature de l'activité
        typeActivite: null, // bic-vente, bic-service, bnc, artisanale, agricole
        activiteReglementee: false,
        ordreProessionnel: false,
        risqueResponsabilite: false,
        besoinAssurance: false,
        
        // Section 4: Volumétrie et finances
        chiffreAffaires: null, // Valeur numérique précise
        tauxMarge: 35, // en pourcentage
        besoinRevenusImmediats: false,
        cautionBancaire: false,
        montantLevee: 0,
        preferenceRemuneration: 'mixte', // salaire, dividendes, mixte, flexible
        aides: [], // acre, jei, cir
        transmission: null, // revente, transmission
        regimeFiscal: null, // ir, is, flexible, optimisation
        regimeSocial: null // tns, salarie, equilibre
    };

    // Paramètres avancés pour les simulations
    let parametresAvances = {
        ratioSalaire: 50,
        ratioDividendes: 50,
        capitalSocial: 10000,
        capitalLibere: 100,
        caSimulation: 50000,
        fraisReels: 35, // Pourcentage des frais réels pour comparaison micro vs réel
        acreActif: true  // ACRE appliqué ou non dans les simulations
    };

    // Score maximal possible pour le calcul des pourcentages - augmenté pour plus de nuance
    const SCORE_MAX_POSSIBLE = 200;

    // Sélectionner tous les éléments du DOM nécessaires
    const sections = document.querySelectorAll('.question-section');
    const progressSteps = document.querySelectorAll('.progress-step');
    const optionButtons = document.querySelectorAll('.option-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    
    // Nouveaux champs d'entrée
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
    
    // Paramètres avancés
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
    const fraisReelsInput = document.getElementById('frais-reels');
    const acreCheckbox = document.getElementById('acre-checkbox');
    const projectionsCheckbox = document.getElementById('projections-pluriannuelles');
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
        
        // Nouveau: Gestion des sections d'investisseurs conditionnelles
        const profilButtons = document.querySelectorAll('.option-btn[data-value]');
        const investisseursSection = document.getElementById('investisseurs-section');

        if (profilButtons && investisseursSection) {
            profilButtons.forEach(button => {
                button.addEventListener('click', function() {
                    if (this.getAttribute('data-value') === 'investisseurs') {
                        investisseursSection.style.display = 'block';
                    } else {
                        investisseursSection.style.display = 'none';
                    }
                });
            });
        }
        
        // Gestion du taux de marge
        if (tauxMargeSlider && tauxMargeValue) {
            tauxMargeSlider.addEventListener('input', function() {
                tauxMargeValue.textContent = `${this.value}%`;
                userResponses.tauxMarge = parseInt(this.value);
            });
        }
        
        // Gestion des checkboxes
        if (checkboxReglementee) {
            checkboxReglementee.addEventListener('change', function() {
                userResponses.activiteReglementee = this.checked;
            });
        }
        
        if (ordreProCheckbox) {
            ordreProCheckbox.addEventListener('change', function() {
                userResponses.ordreProessionnel = this.checked;
            });
        }
        
        if (besoinsRevenusCheckbox) {
            besoinsRevenusCheckbox.addEventListener('change', function() {
                userResponses.besoinRevenusImmediats = this.checked;
            });
        }
        
        if (cautionBancaireCheckbox) {
            cautionBancaireCheckbox.addEventListener('change', function() {
                userResponses.cautionBancaire = this.checked;
            });
        }
        
        if (bienImmobilierCheckbox) {
            bienImmobilierCheckbox.addEventListener('change', function() {
                userResponses.bienImmobilier = this.checked;
            });
        }
        
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
        
        // Événements pour paramètres avancés
        if (advancedParamsToggle) {
            advancedParamsToggle.addEventListener('click', toggleAdvancedParams);
        }
        
        if (ratioSalaireSlider) {
            ratioSalaireSlider.addEventListener('input', updateRatioValues);
        }
        
        if (capitalLibereSlider) {
            capitalLibereSlider.addEventListener('input', updateCapitalLibereValue);
        }
        
        if (fraisReelsInput) {
            fraisReelsInput.addEventListener('input', function() {
                parametresAvances.fraisReels = parseInt(this.value);
            });
        }
        
        if (acreCheckbox) {
            acreCheckbox.addEventListener('change', function() {
                parametresAvances.acreActif = this.checked;
            });
        }
        
        if (applyParamsButton) {
            applyParamsButton.addEventListener('click', applyAdvancedParams);
        }
        
        // AMÉLIORATION: Affichage des détails de calcul
        const showCalculationDetails = document.getElementById('show-calculation-details');
        if (showCalculationDetails) {
            showCalculationDetails.addEventListener('change', function() {
                document.dispatchEvent(new CustomEvent('toggleCalculationDetails', {
                    detail: { visible: this.checked }
                }));
            });
        }
        
        // Exportation
        if (exportPdfButton) {
            exportPdfButton.addEventListener('click', exportToPdf);
        }
        
        if (exportExcelButton) {
            exportExcelButton.addEventListener('click', exportToExcel);
        }
        
        // Toggle résultats secondaires
        if (showMoreResults) {
            showMoreResults.addEventListener('click', function() {
                secondaryResults.classList.toggle('hidden');
                const icon = this.querySelector('i');
                if (icon) {
                    if (secondaryResults.classList.contains('hidden')) {
                        icon.classList.remove('fa-chevron-up');
                        icon.classList.add('fa-chevron-down');
                        this.querySelector('span').textContent = 'Voir les autres options compatibles';
                    } else {
                        icon.classList.remove('fa-chevron-down');
                        icon.classList.add('fa-chevron-up');
                        this.querySelector('span').textContent = 'Masquer les autres options';
                    }
                }
            });
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
        
        if (fraisReelsInput) {
            fraisReelsInput.value = parametresAvances.fraisReels;
        }
        
        if (acreCheckbox) {
            acreCheckbox.checked = parametresAvances.acreActif;
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
        
        if (fraisReelsInput) {
            parametresAvances.fraisReels = parseInt(fraisReelsInput.value);
        }
        
        if (acreCheckbox) {
            parametresAvances.acreActif = acreCheckbox.checked;
        }
        
        if (projectionsCheckbox) {
            parametresAvances.afficherProjection = projectionsCheckbox.checked;
        }
        
        // Récupérer le type d'activité depuis les réponses sauvegardées
        parametresAvances.natureActivite = userResponses.typeActivite;
        
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
                ['Forme juridique', 'Score', 'Compatibilité', 'Fiscalité', 'Régime social', 'Protection', 'Capital', 'Revenu net estimé'],
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
        showSection(1);
    }

    /**
     * Collecte les données de la section 1 : Profil & Horizon Personnel
     */
    function collectSection1Data() {
        // TMI actuelle
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
        if (revenuAnnee1Input) {
            userResponses.revenuAnnee1 = parseInt(revenuAnnee1Input.value);
        }
        
        if (revenuAnnee3Input) {
            userResponses.revenuAnnee3 = parseInt(revenuAnnee3Input.value);
        }
        
        // Bien immobilier
        if (bienImmobilierCheckbox) {
            userResponses.bienImmobilier = bienImmobilierCheckbox.checked;
        }
    }

    /**
     * Collecte les données de la section 2 : Équipe & Gouvernance
     */
    function collectSection2Data() {
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
    }

    /**
     * Collecte les données de la section 3 : Nature de l'activité
     */
    function collectSection3Data() {
        // Type d'activité
        const typeActiviteSelect = document.getElementById('activite-type');
        if (typeActiviteSelect) {
            userResponses.typeActivite = typeActiviteSelect.value;
        }
        
        // Activité réglementée
        if (checkboxReglementee) {
            userResponses.activiteReglementee = checkboxReglementee.checked;
        }
        
        // Ordre professionnel
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
    }

    /**
     * Collecte les données de la section 4 : Volumétrie et finances
     */
    function collectSection4Data() {
        // Chiffre d'affaires prévisionnel
        if (caPrevisionnelInput) {
            userResponses.chiffreAffaires = parseInt(caPrevisionnelInput.value);
        }
        
        // Taux de marge
        if (tauxMargeSlider) {
            userResponses.tauxMarge = parseInt(tauxMargeSlider.value);
        }
        
        // Besoin de revenus immédiats
        if (besoinsRevenusCheckbox) {
            userResponses.besoinRevenusImmediats = besoinsRevenusCheckbox.checked;
        }
        
        // Caution bancaire
        if (cautionBancaireCheckbox) {
            userResponses.cautionBancaire = cautionBancaireCheckbox.checked;
        }
        
        // Montant de levée
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

    /**
     * Génère les résultats en fonction des réponses
     */
    function generateResults(customParams) {
        // Vérifier si le module fiscal est chargé
        if (!window.checkHardFails || !window.SimulationsFiscales) {
            console.error('Module fiscal-simulation.js non chargé');
            alert('Erreur: Module de simulation fiscale non disponible.');
            return;
        }
        
        // Si des paramètres personnalisés sont fournis, les utiliser
        if (customParams) {
            Object.assign(parametresAvances, customParams);
        }
        
        // Vérifier d'abord les incompatibilités majeures
        const hardFails = window.checkHardFails(userResponses);
        
        // Définir des coefficients adaptés aux priorités de l'utilisateur
        let coefficients = {
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
        };
        
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
        
        // Protection patrimoniale très importante = facteur bloquant
        const facteursBlocants = [];
        if (userResponses.cautionBancaire && userResponses.bienImmobilier) {
            facteursBlocants.push({
                critere: 'protectionPatrimoine',
                message: 'Protection du patrimoine essentielle (bien immobilier + caution bancaire)'
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
                'bic-vente': 188700,
                'bic-service': 77700,
                'bnc': 77700,
                'artisanale': 188700,
                'agricole': 95000
            };
            
            const seuil = seuils[userResponses.typeActivite] || 77700;
            
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
            
            // Marge brute
            if (userResponses.tauxMarge < 15) {
                // Marges faibles = avantage aux formes avec charges sociales plus faibles
                if (forme.id === 'micro-entreprise') {
                    scoreCriteresStructurels += 15 * coefficients.tauxMarge;
                    details.push('Charges forfaitaires avantageuses avec marge faible');
                } else if (forme.id === 'sasu' || forme.regimeSocial.includes('salarié')) {
                    scoreCriteresStructurels -= 10 * coefficients.tauxMarge;
                    details.push('Charges sociales élevées avec marge faible');
                }
            } else if (userResponses.tauxMarge > 40) {
                // Marges élevées = avantage aux formes avec fiscalité optimisée
                if (forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui') {
                    scoreCriteresStructurels += 15 * coefficients.tauxMarge;
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
            if (userResponses.typeInvestisseurs.includes('vc') && forme.id === 'sas') {
                scoreObjectifs += 15;
                details.push('Structure privilégiée par les fonds de capital-risque');
            } else if (userResponses.typeInvestisseurs.includes('business-angels') && 
                      (forme.id === 'sas' || forme.id === 'sasu')) {
                scoreObjectifs += 10;
                details.push('Structure appréciée des business angels');
            }
            
            // Aides et dispositifs spécifiques
            if (userResponses.aides.includes('jei') && forme.fiscalite === 'IS') {
                scoreObjectifs += 15;
                details.push('Éligible au statut JEI');
            }
            
            if (userResponses.aides.includes('cir') && 
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
                capitalLibere: parametresAvances.capitalLibere,
                fraisReels: parametresAvances.fraisReels,
                acreActif: parametresAvances.acreActif,
                tmiActuel: userResponses.tmiActuel,
                tauxMarge: userResponses.tauxMarge,
                typeActivite: userResponses.typeActivite
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
     * Version améliorée avec 3 niveaux de présentation
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
        
        // Ajouter le tableau comparatif des régimes fiscaux (IR vs IS)
        htmlPrimary += renderTaxRegimeComparison(recommended.forme, parametresAvances.caSimulation, userResponses.tauxMarge);
        
        // Ajouter la simulation salaire/dividendes
        htmlPrimary += renderSalaryDividendSimulation(recommended.forme, parametresAvances.caSimulation, userResponses.tauxMarge);
        
        // Ajouter la projection pluriannuelle si activée
        if (parametresAvances.afficherProjection) {
            htmlPrimary += renderMultiYearSimulation(recommended.forme, parametresAvances.caSimulation, userResponses.tauxMarge);
        }
        
        // Ajouter les stratégies optimales pour cette forme juridique
        htmlPrimary += renderOptimalStrategies(recommended.forme, userResponses);
        
        // Ajouter les autres résultats si disponibles comme "challengers crédibles"
        let secondaryHtml = '';
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
        
        // Gérer les onglets d'années si la projection est active
        if (parametresAvances.afficherProjection) {
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
        
        // Déclencher un événement pour indiquer que les résultats sont chargés
        document.dispatchEvent(new CustomEvent('resultsLoaded'));
    }

    /**
     * Affiche les formes juridiques incompatibles
     * Version améliorée avec solution de repli
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
                        raisons: [],
                        solution: getSolutionDeRepli(forme.id, inc.code)
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
    }

    /**
     * Renvoie une solution de repli adaptée selon le type d'incompatibilité
     */
    function getSolutionDeRepli(formeId, codeErreur) {
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

    /**
     * Génère un tableau comparatif IR vs IS
     */
    function renderTaxRegimeComparison(forme, caSimulation, tauxMarge) {
        // Calculer le bénéfice (revenu imposable avant impôt)
        const benefice = caSimulation * (tauxMarge / 100);
        
        // Calculer les résultats pour l'IR
        const irResult = {
            tauxEffectif: 30, // Valeur par défaut
            netApreesImpot: Math.round(benefice * 0.7) // Estimation simplifiée
        };
        
        // Calculer les résultats pour l'IS
        const isResult = {
            tauxIS: benefice <= 42500 ? 15 : 25,
            netApreesImpot: Math.round(benefice * (benefice <= 42500 ? 0.85 : 0.75)) // Estimation simplifiée
        };
        
        // Déterminer le régime le plus avantageux
        const irMeilleur = irResult.netApreesImpot > isResult.netApreesImpot;
        const difference = Math.abs(irResult.netApreesImpot - isResult.netApreesImpot);
        
        return `
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
            <h4 class="font-semibold text-green-400 mb-3">Comparaison des régimes fiscaux IR vs IS</h4>
            
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="text-left p-2">Critère</th>
                            <th class="text-left p-2">IR (Impôt sur le Revenu)</th>
                            <th class="text-left p-2">IS (Impôt sur les Sociétés)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="border-b border-gray-700">
                            <td class="p-2">Imposition des bénéfices</td>
                            <td class="p-2">Barème progressif (TMI: ${irResult.tauxEffectif}%)</td>
                            <td class="p-2">${isResult.tauxIS}% ${isResult.tauxIS === 15 ? '(taux réduit PME)' : ''}</td>
                        </tr>
                        <tr class="border-b border-gray-700">
                            <td class="p-2">Montant net après impôt</td>
                            <td class="p-2 ${irMeilleur ? 'text-green-400 font-semibold' : ''}">${irResult.netApreesImpot.toLocaleString('fr-FR')} €</td>
                            <td class="p-2 ${!irMeilleur ? 'text-green-400 font-semibold' : ''}">${isResult.netApreesImpot.toLocaleString('fr-FR')} €</td>
                        </tr>
                        <tr class="border-b border-gray-700">
                            <td class="p-2">Charges sociales</td>
                            <td class="p-2">Sur la totalité du bénéfice</td>
                            <td class="p-2">Uniquement sur la rémunération</td>
                        </tr>
                        <tr class="border-b border-gray-700">
                            <td class="p-2">Flexibilité de rémunération</td>
                            <td class="p-2">Limitée (prélèvements personnels)</td>
                            <td class="p-2">Élevée (salaire + dividendes)</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="mt-4 p-3 ${irMeilleur ? 'bg-green-900' : 'bg-blue-900'} bg-opacity-30 rounded-lg">
                <p class="flex items-center">
                    <i class="fas fa-info-circle mr-2 ${irMeilleur ? 'text-green-400' : 'text-blue-400'}"></i>
                    <span>
                        <strong>Pour votre situation actuelle:</strong> 
                        Le régime ${irMeilleur ? 'IR semble plus avantageux' : 'IS semble plus avantageux'} 
                        fiscalement (différence de ${difference.toLocaleString('fr-FR')} €).
                        ${forme.fiscaliteOption === 'Oui' ? 
                            `<strong class="text-green-400">Votre forme juridique (${forme.nom}) vous permet de choisir entre les deux régimes.</strong>` : 
                            ''}
                    </span>
                </p>
            </div>
        </div>`;
    }

    /**
     * Génère une simulation comparative de répartition salaire/dividendes
     */
    function renderSalaryDividendSimulation(forme, caSimulation, tauxMarge) {
        // Vérifier si la forme juridique permet les dividendes
        if (forme.fiscalite !== 'IS' && !forme.fiscaliteOption === 'Oui') {
            return ''; // Ne pas afficher pour les formes qui ne permettent pas la distribution de dividendes
        }
        
        // Calculer le bénéfice (revenu imposable avant impôt)
        const benefice = caSimulation * (tauxMarge / 100);
        
        // Créer les données pour plusieurs scénarios
        const scenarios = [
            { salaire: 100, dividendes: 0 },
            { salaire: 75, dividendes: 25 },
            { salaire: 50, dividendes: 50 },
            { salaire: 25, dividendes: 75 },
            { salaire: 0, dividendes: 100 }
        ];
        
        // Générer les résultats pour chaque scénario
        const results = scenarios.map(scenario => {
            const salaireAmount = benefice * (scenario.salaire / 100);
            const dividendesAmount = benefice * (scenario.dividendes / 100);
            
            // Calculs simplifiés
            const chargesSalaire = salaireAmount * 0.45; // ~45% de charges sur salaire
            const impotSalaire = salaireAmount * 0.1; // ~10% d'impôt sur le salaire (approximation)
            
            const impotSociete = dividendesAmount * 0.25; // 25% d'IS
            const chargesDividendes = (dividendesAmount - impotSociete) * 0.172; // 17.2% de prélèvements sociaux sur dividendes nets d'IS
            const impotDividendes = (dividendesAmount - impotSociete) * 0.12; // ~12% d'impôt sur dividendes (approximation PFU - prélèvements sociaux)
            
            const totalCharges = chargesSalaire + chargesDividendes;
            const totalImpots = impotSalaire + impotSociete + impotDividendes;
            const netTotal = salaireAmount + dividendesAmount - totalCharges - totalImpots;
            
            return {
                ...scenario,
                netTotal: Math.round(netTotal),
                charges: Math.round(totalCharges),
                impots: Math.round(totalImpots)
            };
        });
        
        // Trouver le scénario optimal
        const maxNet = Math.max(...results.map(r => r.netTotal));
        const optimalScenario = results.find(r => r.netTotal === maxNet);
        
        return `
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
            <h4 class="font-semibold text-green-400 mb-3">Impact de la répartition salaire/dividendes</h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h5 class="font-medium mb-2">Simulation sur un bénéfice de ${Math.round(benefice).toLocaleString('fr-FR')} €</h5>
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="text-left p-2">Répartition</th>
                                <th class="text-right p-2">Charges</th>
                                <th class="text-right p-2">Impôts</th>
                                <th class="text-right p-2">Revenu net</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.map(r => `
                            <tr class="border-b border-gray-700 ${r.netTotal === maxNet ? 'bg-green-900 bg-opacity-20' : ''}">
                                <td class="p-2">${r.salaire}% / ${r.dividendes}%</td>
                                <td class="p-2 text-right">${r.charges.toLocaleString('fr-FR')} €</td>
                                <td class="p-2 text-right">${r.impots.toLocaleString('fr-FR')} €</td>
                                <td class="p-2 text-right font-semibold ${r.netTotal === maxNet ? 'text-green-400' : ''}">${r.netTotal.toLocaleString('fr-FR')} €</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="bg-blue-800 bg-opacity-40 p-4 rounded-lg">
                    <h5 class="font-medium text-green-400 mb-3">Stratégie optimale pour votre situation</h5>
                    <div class="mb-4">
                        <div class="text-xl font-bold">${optimalScenario.salaire}% salaire / ${optimalScenario.dividendes}% dividendes</div>
                        <div class="text-sm text-gray-400 mt-1">Revenu net estimé: ${optimalScenario.netTotal.toLocaleString('fr-FR')} €</div>
                    </div>
                    
                    <div class="mb-4">
                        <h6 class="font-medium mb-1">Pourquoi cette répartition ?</h6>
                        <ul class="text-sm">
                            ${optimalScenario.salaire === 100 ? 
                                '<li class="mb-1">• Votre TMI actuelle est faible, privilégiez le salaire</li>' : 
                                ''}
                            ${optimalScenario.dividendes === 100 ? 
                                '<li class="mb-1">• Charges sociales très élevées sur salaire, privilégiez les dividendes</li>' : 
                                ''}
                            ${optimalScenario.salaire > 0 && optimalScenario.dividendes > 0 ? 
                                '<li class="mb-1">• Une répartition mixte optimise votre fiscalité globale</li>' : 
                                ''}
                            <li class="mb-1">• Cette répartition réduit votre pression fiscale et sociale</li>
                        </ul>
                    </div>
                    
                    <div>
                        <h6 class="font-medium mb-1">Considérations importantes</h6>
                        <ul class="text-sm">
                            <li class="mb-1">• Protection sociale plus faible avec dividendes</li>
                            <li class="mb-1">• Besoin d'une trésorerie suffisante pour les dividendes</li>
                            <li class="mb-1">• Impact différent sur votre crédit immobilier futur</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Génère une simulation pluriannuelle
     */
    function renderMultiYearSimulation(forme, caSimulation, tauxMarge) {
        // Définir progression de CA sur 3 ans
        const caYear1 = caSimulation;
        const caYear2 = Math.round(caSimulation * 1.2); // +20%
        const caYear3 = Math.round(caYear2 * 1.2); // +20% supplémentaire
        
        // Calculer les résultats pour chaque année (version simplifiée)
        const resultYear1 = simulateYearResult(forme, caYear1, tauxMarge, true); // ACRE 1ère année
        const resultYear2 = simulateYearResult(forme, caYear2, tauxMarge, false);
        const resultYear3 = simulateYearResult(forme, caYear3, tauxMarge, false);
        
        return `
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
            <h4 class="font-semibold text-green-400 mb-3">Projection sur 3 ans</h4>
            
            <div class="year-tabs flex border-b border-gray-700 mb-4">
                <div class="year-tab active px-4 py-2 cursor-pointer" data-year="1">Année 1</div>
                <div class="year-tab px-4 py-2 cursor-pointer" data-year="2">Année 2</div>
                <div class="year-tab px-4 py-2 cursor-pointer" data-year="3">Année 3</div>
            </div>
            
            <div class="year-content active" id="year-content-1">
                <h5 class="font-medium mb-2">Année 1 ${resultYear1.acre ? '<span class="acre-badge"><i class="fas fa-star"></i> ACRE</span>' : ''}</h5>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Chiffre d'affaires</div>
                        <div class="text-xl font-semibold">${caYear1.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Charges sociales</div>
                        <div class="text-xl font-semibold">${resultYear1.charges.toLocaleString('fr-FR')} €</div>
                        ${resultYear1.acre ? '<div class="text-xs text-green-400">Réduction ACRE appliquée (-50%)</div>' : ''}
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Impôts</div>
                        <div class="text-xl font-semibold">${resultYear1.impots.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Revenu net</div>
                        <div class="text-xl font-semibold text-green-400">${resultYear1.net.toLocaleString('fr-FR')} €</div>
                    </div>
                </div>
            </div>
            
            <div class="year-content hidden" id="year-content-2">
                <h5 class="font-medium mb-2">Année 2</h5>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Chiffre d'affaires</div>
                        <div class="text-xl font-semibold">${caYear2.toLocaleString('fr-FR')} €</div>
                        <div class="text-xs text-green-400">+20% vs année 1</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Charges sociales</div>
                        <div class="text-xl font-semibold">${resultYear2.charges.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Impôts</div>
                        <div class="text-xl font-semibold">${resultYear2.impots.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Revenu net</div>
                        <div class="text-xl font-semibold text-green-400">${resultYear2.net.toLocaleString('fr-FR')} €</div>
                    </div>
                </div>
            </div>
            
            <div class="year-content hidden" id="year-content-3">
                <h5 class="font-medium mb-2">Année 3</h5>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Chiffre d'affaires</div>
                        <div class="text-xl font-semibold">${caYear3.toLocaleString('fr-FR')} €</div>
                        <div class="text-xs text-green-400">+44% vs année 1</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Charges sociales</div>
                        <div class="text-xl font-semibold">${resultYear3.charges.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Impôts</div>
                        <div class="text-xl font-semibold">${resultYear3.impots.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <div class="text-xs text-gray-400">Revenu net</div>
                        <div class="text-xl font-semibold text-green-400">${resultYear3.net.toLocaleString('fr-FR')} €</div>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 pt-4 border-t border-gray-700">
                <h5 class="font-medium mb-2">Résumé sur 3 ans</h5>
                <div class="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div class="text-sm text-gray-400">Année 1</div>
                        <div class="font-semibold text-lg">${resultYear1.net.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div>
                        <div class="text-sm text-gray-400">Année 2</div>
                        <div class="font-semibold text-lg">${resultYear2.net.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div>
                        <div class="text-sm text-gray-400">Année 3</div>
                        <div class="font-semibold text-lg">${resultYear3.net.toLocaleString('fr-FR')} €</div>
                    </div>
                </div>
                <div class="mt-2 text-center">
                    <div class="text-sm text-gray-400">Total sur 3 ans</div>
                    <div class="font-semibold text-xl text-green-400">${(resultYear1.net + resultYear2.net + resultYear3.net).toLocaleString('fr-FR')} €</div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Fonction utilitaire pour la simulation annuelle
     */
    function simulateYearResult(forme, ca, tauxMarge, withAcre) {
        const benefice = ca * (tauxMarge / 100);
        let charges = 0;
        let impots = 0;
        
        // Calculer charges selon le type de structure
        if (forme.id === 'micro-entreprise') {
            // Micro-entreprise: taux forfaitaire
            const tauxChargesMicro = forme.fiscalite === 'IR' ? 0.22 : 0.22; // Pour simplifier, même taux
            charges = ca * tauxChargesMicro * (withAcre ? 0.5 : 1); // Réduction ACRE si applicable
            impots = (ca * 0.66 - charges) * 0.15; // Abattement 34% et TMI estimée à 15%
        } else if (forme.regimeSocial.includes('TNS')) {
            // TNS: charges sur bénéfice
            charges = benefice * 0.45 * (withAcre ? 0.5 : 1); // Réduction ACRE si applicable
            impots = (benefice - charges) * 0.2; // TMI estimée à 20%
        } else {
            // Assimilé salarié: split salaire/dividendes selon paramètres
            const salaireRatio = parametresAvances.ratioSalaire / 100;
            const dividendesRatio = parametresAvances.ratioDividendes / 100;
            
            const salaire = benefice * salaireRatio;
            const dividendes = benefice * dividendesRatio;
            
            charges = salaire * 0.45; // Charges sur salaire
            
            // IS sur bénéfice non distribué
            const is = dividendes * 0.25;
            
            // Prélèvements sociaux et impôt sur dividendes
            const chargesDividendes = dividendes * (1 - 0.25) * 0.172;
            const impotDividendes = dividendes * (1 - 0.25) * 0.12;
            
            // Impôt sur le salaire
            const impotSalaire = (salaire - charges) * 0.15;
            
            charges += chargesDividendes;
            impots = is + impotDividendes + impotSalaire;
        }
        
        return {
            ca: ca,
            benefice: Math.round(benefice),
            charges: Math.round(charges),
            impots: Math.round(impots),
            net: Math.round(benefice - charges - impots),
            acre: withAcre
        };
    }

    /**
     * Génère une liste de stratégies optimales pour la forme juridique
     */
    function renderOptimalStrategies(forme, profile) {
        // Déterminer les stratégies selon le profil et la forme juridique
        const strategies = [];
        
        // Stratégies spécifiques selon la forme juridique
        if (forme.id === 'micro-entreprise') {
            strategies.push({
                name: "Optimisation du régime micro",
                description: "Maximisez votre rentabilité en restant sous les seuils",
                impact: "Économie potentielle: jusqu'à 30% en charges et impôts",
                steps: [
                    "Suivez attentivement votre CA pour rester sous le seuil",
                    "Optimisez vos dépenses professionnelles non déductibles",
                    "Anticipez la sortie du régime micro si CA en croissance"
                ]
            });
        } else if (forme.id === 'eurl') {
            strategies.push({
                name: "Optimisation fiscale IR/IS",
                description: "Utilisez le régime fiscal le plus avantageux",
                impact: "Économie potentielle: 5 000€ à 10 000€ par an",
                steps: [
                    "Démarrez à l'IR et passez à l'IS quand votre TMI augmente",
                    "Répartissez judicieusement entre salaire et dividendes",
                    "Utilisez la flexibilité fiscale pour optimiser vos prélèvements"
                ]
            });
        } else if (forme.id === 'sasu') {
            strategies.push({
                name: "Stratégie salaire/dividendes",
                description: "Optimisez votre rémunération pour réduire la pression fiscale",
                impact: "Économie potentielle: jusqu'à 15% sur votre revenu net",
                steps: [
                    "Fixez un salaire modéré mais suffisant pour la protection sociale",
                    "Complétez avec des dividendes moins chargés socialement",
                    "Adaptez la répartition chaque année selon vos résultats"
                ]
            });
        }
        
        // Stratégies génériques
        if (profile.aides.includes('acre')) {
            strategies.push({
                name: "Stratégie ACRE",
                description: "Profitez de l'exonération de charges la première année",
                impact: "Économie année 1: environ 50% sur vos charges sociales",
                steps: [
                    "Maximisez votre revenu la première année pour optimiser l'ACRE",
                    "Anticipez la fin de l'exonération dans votre trésorerie",
                    "Consultez un expert-comptable pour vérifier votre éligibilité"
                ]
            });
        }
        
        if (profile.tauxMarge > 30) {
            strategies.push({
                name: "Optimisation forte marge",
                description: "Stratégie adaptée à votre activité à forte valeur ajoutée",
                impact: "Optimisation globale de votre rémunération nette",
                steps: [
                    "Structurez votre rémunération pour maîtriser les charges",
                    "Investissez dans des actifs professionnels déductibles",
                    "Pensez à la rémunération différée (PEE, PERCO, assurance-vie)"
                ]
            });
        }
        
        if (profile.chiffreAffaires > 70000) {
            strategies.push({
                name: "Stratégie CA élevé",
                description: "Optimisez votre structure face à un volume d'activité important",
                impact: "Sécurisation et optimisation de votre activité",
                steps: [
                    "Mettez en place une comptabilité rigoureuse",
                    "Anticipez les seuils de TVA et les obligations comptables",
                    "Prévoyez une évolution de structure si croissance continue"
                ]
            });
        }
        
        // Limiter à 2 stratégies maximum pour l'affichage
        const displayedStrategies = strategies.slice(0, 2);
        
        if (displayedStrategies.length === 0) {
            return ''; // Ne rien afficher s'il n'y a pas de stratégies
        }
        
        return `
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
            <h4 class="font-semibold text-green-400 mb-3">Stratégies optimales pour ${forme.nom}</h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${displayedStrategies.map(strategy => `
                <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                    <h5 class="font-medium text-green-400 mb-2">${strategy.name}</h5>
                    <p class="text-sm mb-2">${strategy.description}</p>
                    <ul class="text-sm">
                        ${strategy.steps.map(step => `<li class="flex items-start mb-1">
                            <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                            <span>${step}</span>
                        </li>`).join('')}
                    </ul>
                    <div class="mt-2 pt-2 border-t border-gray-700">
                        <div class="text-sm">${strategy.impact}</div>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>`;
    }

    // Écouter les évènements pour les détails de calcul
    document.addEventListener('toggleCalculationDetails', function(e) {
        const scoreDetails = document.querySelectorAll('.score-details');
        
        scoreDetails.forEach(detail => {
            if (e.detail.visible) {
                detail.classList.remove('hidden');
            } else {
                detail.classList.add('hidden');
            }
        });
    });
});
