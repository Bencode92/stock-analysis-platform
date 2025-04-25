/**
 * types-entreprise.js
 * Gestion du questionnaire et de l'affichage des résultats du simulateur de forme juridique
 * Ce fichier contient toute la logique d'interface utilisateur et de collecte des données
 * Dernière mise à jour : Avril 2025
 */

// Objet global pour stocker les réponses de l'utilisateur
let userResponses = {
    // Valeurs par défaut pour éviter les erreurs
    chiffreAffaires: 50000,
    tauxMarge: 0.3,
    tmiActuel: 30
};

// Gestionnaire du formulaire
const FormManager = {
    currentSection: 1,
    totalSections: 9, // Mis à jour pour inclure les nouvelles sections 1b et 3b
    
    // Initialisation
    init: function() {
        this.setupEventListeners();
        this.checkStoredProgress();
    },
    
    // Configuration des écouteurs d'événements
    setupEventListeners: function() {
        // Boutons de navigation entre sections
        const next1 = document.getElementById('next1');
        const next1b = document.getElementById('next1b');
        const prev1b = document.getElementById('prev1b');
        const next2 = document.getElementById('next2');
        const prev2 = document.getElementById('prev2');
        const next3 = document.getElementById('next3');
        const next3b = document.getElementById('next3b');
        const prev3 = document.getElementById('prev3');
        const prev3b = document.getElementById('prev3b');
        const next4 = document.getElementById('next4');
        const prev4 = document.getElementById('prev4');
        const next5 = document.getElementById('next5');
        const prev5 = document.getElementById('prev5');
        const calculerBtn = document.getElementById('calculer');
        const resetBtn = document.getElementById('reset');
        
        // Navigation entre les sections
        if (next1) {
            next1.addEventListener('click', () => {
                DataCollector.collectSection1Data();
                StorageManager.saveProgress();
                this.showSection('1b'); // Aller à la nouvelle section 1b au lieu de 2
            });
        }
        
        // Nouvelle section 1b
        if (next1b) {
            next1b.addEventListener('click', () => {
                DataCollector.collectSection1bData(); // Nouvelle méthode
                StorageManager.saveProgress();
                this.showSection(2);
            });
        }
        
        if (prev1b) {
            prev1b.addEventListener('click', () => this.showSection(1));
        }
        
        if (next2) {
            next2.addEventListener('click', () => {
                DataCollector.collectSection2Data();
                StorageManager.saveProgress();
                this.showSection(3);
            });
        }
        
        if (prev2) {
            prev2.addEventListener('click', () => this.showSection('1b')); // Retour à 1b au lieu de 1
        }
        
        if (next3) {
            next3.addEventListener('click', () => {
                DataCollector.collectSection3Data();
                StorageManager.saveProgress();
                this.showSection('3b'); // Aller à la nouvelle section 3b au lieu de 4
            });
        }
        
        // Nouvelle section 3b
        if (next3b) {
            next3b.addEventListener('click', () => {
                DataCollector.collectSection3bData(); // Nouvelle méthode
                StorageManager.saveProgress();
                this.showSection(4);
            });
        }
        
        if (prev3) {
            prev3.addEventListener('click', () => this.showSection(2));
        }
        
        if (prev3b) {
            prev3b.addEventListener('click', () => this.showSection(3));
        }
        
        if (next4) {
            next4.addEventListener('click', () => {
                DataCollector.collectSection4Data();
                StorageManager.saveProgress();
                this.showSection(5);
            });
        }
        
        if (prev4) {
            prev4.addEventListener('click', () => this.showSection('3b')); // Retour à 3b au lieu de 3
        }
        
        if (next5) {
            next5.addEventListener('click', () => {
                DataCollector.collectSection5Data();
                StorageManager.saveProgress();
                this.showSection(6);
            });
        }
        
        if (prev5) {
            prev5.addEventListener('click', () => this.showSection(4));
        }
        
        // Bouton de calcul final
        if (calculerBtn) {
            calculerBtn.addEventListener('click', () => {
                DataCollector.collectAllRemainingData();
                StorageManager.saveProgress();
                ResultsManager.showResults();
            });
        }
        
        // Bouton de réinitialisation
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Êtes-vous sûr de vouloir recommencer le questionnaire ?')) {
                    StorageManager.clearProgress();
                    window.location.reload();
                }
            });
        }
        
        // Rendu les boutons d'option cliquables
        document.querySelectorAll('.option-btn').forEach(button => {
            button.addEventListener('click', function() {
                // Récupérer le groupe de boutons (boutons dans le même conteneur)
                const parent = this.closest('.grid');
                if (parent) {
                    // Si dans un groupe avec attribut data-name (pour groupes spécifiques)
                    const groupName = this.getAttribute('data-name');
                    if (groupName) {
                        parent.querySelectorAll(`[data-name="${groupName}"]`).forEach(btn => {
                            btn.classList.remove('selected');
                        });
                    } else {
                        // Sinon, désélectionner tous les boutons du groupe
                        parent.querySelectorAll('.option-btn').forEach(btn => {
                            btn.classList.remove('selected');
                        });
                    }
                }
                
                // Ajouter la classe selected au bouton cliqué
                this.classList.add('selected');
                
                // Logique spécifique pour afficher/masquer des éléments supplémentaires
                // par exemple pour le régime matrimonial
                if (this.getAttribute('data-name') === 'est-marie') {
                    const regimeMatrimonialContainer = document.getElementById('regime-matrimonial-container');
                    if (regimeMatrimonialContainer) {
                        regimeMatrimonialContainer.style.display = 
                            this.getAttribute('data-value') === 'oui' ? 'block' : 'none';
                    }
                }
                
                // Si c'est le statut de porteur "demandeur d'emploi", présélectionner l'ACRE
                if (this.getAttribute('data-value') === 'demandeur-emploi') {
                    const acreCheckbox = document.getElementById('acre-checkbox');
                    if (acreCheckbox) acreCheckbox.checked = true;
                    
                    // Notification pour l'utilisateur
                    UIManager.showNotification('Vous êtes éligible à l\'ACRE en tant que demandeur d\'emploi');
                }
            });
        });
        
        // Gestion des sliders
        document.querySelectorAll('.range-slider').forEach(slider => {
            const range = slider.querySelector('input[type="range"]');
            const value = slider.querySelector('.range-value');
            
            if (range && value) {
                // Mettre à jour l'affichage lors du changement
                range.addEventListener('input', function() {
                    // Formater la valeur selon le type de slider
                    let displayValue = this.value;
                    
                    if (this.id === 'ca-range') {
                        displayValue = Number(this.value).toLocaleString('fr-FR') + ' €';
                    } else if (this.id === 'tmi-range' || this.id === 'marges-range') {
                        displayValue = this.value + '%';
                    }
                    
                    value.textContent = displayValue;
                });
                
                // Initialiser avec la valeur par défaut
                range.dispatchEvent(new Event('input'));
            }
        });
    },
    
    // Vérifier s'il y a des données stockées et restaurer la progression
    checkStoredProgress: function() {
        const savedResponses = StorageManager.loadProgress();
        
        if (savedResponses) {
            userResponses = savedResponses;
            this.prefillForm(userResponses);
            
            // Déterminer la dernière section visitée
            this.currentSection = userResponses.lastSection || 1;
            this.showSection(this.currentSection);
        } else {
            // Premier chargement
            this.showSection(1);
        }
    },
    
    // Afficher une section spécifique et masquer les autres
    showSection: function(sectionNumber) {
        // Convertir en nombre si c'est une chaîne numérique
        this.currentSection = isNaN(sectionNumber) ? sectionNumber : parseInt(sectionNumber);
        
        // Mettre à jour la dernière section dans les réponses
        userResponses.lastSection = this.currentSection;
        StorageManager.saveProgress();
        
        // Masquer toutes les sections
        document.querySelectorAll('.question-section').forEach(section => {
            section.classList.add('hidden');
        });
        
        // Afficher la section demandée
        const sectionToShow = document.getElementById('section' + this.currentSection);
        if (sectionToShow) {
            sectionToShow.classList.remove('hidden');
            
            // Faire défiler vers le haut
            window.scrollTo(0, 0);
        }
    },
    
    // Préremplir le formulaire avec les données sauvegardées
    prefillForm: function(data) {
        // Section 1
        if (data.typeActivite) {
            const button = document.querySelector(`.option-btn[data-value="${data.typeActivite}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.chiffreAffaires) {
            const slider = document.getElementById('ca-range');
            if (slider) slider.value = data.chiffreAffaires;
            
            // Déclencher l'événement input pour mettre à jour l'affichage
            slider.dispatchEvent(new Event('input'));
        }
        
        // Section 1b - Nouvelle section
        if (data.statutPorteur) {
            const button = document.querySelector(`.option-btn[data-value="${data.statutPorteur}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.estMarie !== undefined) {
            const button = document.querySelector(`.option-btn[data-name="est-marie"][data-value="${data.estMarie ? 'oui' : 'non'}"]`);
            if (button) {
                button.classList.add('selected');
                
                // Afficher/masquer le sélecteur de régime matrimonial
                const regimeMatrimonialContainer = document.getElementById('regime-matrimonial-container');
                if (regimeMatrimonialContainer) {
                    regimeMatrimonialContainer.style.display = data.estMarie ? 'block' : 'none';
                }
            }
        }
        
        if (data.regimeMatrimonial) {
            const select = document.getElementById('regime-matrimonial');
            if (select) select.value = data.regimeMatrimonial;
        }
        
        if (data.zoneImplantation) {
            const select = document.getElementById('zone-implantation');
            if (select) select.value = data.zoneImplantation;
        }
        
        if (data.aideRegionale) {
            const checkbox = document.getElementById('aide-regionale');
            if (checkbox) checkbox.checked = data.aideRegionale;
        }
        
        // Section 2
        if (data.profilEntrepreneur) {
            const button = document.querySelector(`.option-btn[data-value="${data.profilEntrepreneur}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.tauxMarge) {
            const slider = document.getElementById('marges-range');
            if (slider) slider.value = data.tauxMarge * 100;
            slider?.dispatchEvent(new Event('input'));
        }
        
        // Section 3
        if (data.besoinProtection) {
            const value = data.besoinProtection;
            document.querySelectorAll('.protection-option').forEach((option, index) => {
                if (index + 1 <= value) {
                    option.classList.add('selected');
                }
            });
        }
        
        if (data.besoinFinancement !== undefined) {
            const value = data.besoinFinancement ? 'oui' : 'non';
            const button = document.querySelector(`.option-btn[data-name="financement"][data-value="${value}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.montantLevee) {
            const input = document.getElementById('montant-levee');
            if (input) input.value = data.montantLevee;
        }
        
        // Section 3b - Nouvelle section
        if (data.embauche) {
            const select = document.getElementById('embauche-prevue');
            if (select) select.value = data.embauche;
        }
        
        if (data.timingRecrutement) {
            const select = document.getElementById('timing-recrutement');
            if (select) select.value = data.timingRecrutement;
        }
        
        if (data.apportBrevet) {
            const checkbox = document.getElementById('apport-brevet');
            if (checkbox) checkbox.checked = data.apportBrevet;
        }
        
        if (data.apportMateriel) {
            const checkbox = document.getElementById('apport-materiel');
            if (checkbox) checkbox.checked = data.apportMateriel;
        }
        
        if (data.garantieDecennale) {
            const checkbox = document.getElementById('garantie-decennale');
            if (checkbox) checkbox.checked = data.garantieDecennale;
        }
        
        if (data.rcpObligatoire) {
            const checkbox = document.getElementById('rcp-obligatoire');
            if (checkbox) checkbox.checked = data.rcpObligatoire;
        }
        
        if (data.multiEtablissements) {
            const checkbox = document.getElementById('multi-etablissements');
            if (checkbox) checkbox.checked = data.multiEtablissements;
        }
        
        if (data.structureHolding) {
            const checkbox = document.getElementById('structure-holding');
            if (checkbox) checkbox.checked = data.structureHolding;
        }
        
        if (data.entrepriseMission) {
            const checkbox = document.getElementById('entreprise-mission');
            if (checkbox) checkbox.checked = data.entrepriseMission;
        }
        
        if (data.statutEsus) {
            const checkbox = document.getElementById('statut-esus');
            if (checkbox) checkbox.checked = data.statutEsus;
        }
        
        // Section 4
        if (data.horizon) {
            const button = document.querySelector(`.option-btn[data-value="${data.horizon}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.prioriteSimplicite !== undefined) {
            const checkbox = document.getElementById('priorite-simplicite');
            if (checkbox) checkbox.checked = data.prioriteSimplicite;
        }
        
        if (data.prioriteOptimisationFiscale !== undefined) {
            const checkbox = document.getElementById('priorite-fiscalite');
            if (checkbox) checkbox.checked = data.prioriteOptimisationFiscale;
        }
        
        if (data.tmiActuel) {
            const slider = document.getElementById('tmi-range');
            if (slider) slider.value = data.tmiActuel;
            slider?.dispatchEvent(new Event('input'));
        }
        
        // Nouvelles questions dans Section 4
        if (data.preferenceDividendes) {
            const select = document.getElementById('preference-dividendes');
            if (select) select.value = data.preferenceDividendes;
        }
        
        if (data.protectionSociale) {
            const select = document.getElementById('protection-sociale');
            if (select) select.value = data.protectionSociale;
        }
        
        // Section 5
        if (data.ordreProessionnel !== undefined) {
            const value = data.ordreProessionnel ? 'oui' : 'non';
            const button = document.querySelector(`.option-btn[data-name="ordre"][data-value="${value}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.bienImmobilier !== undefined) {
            const value = data.bienImmobilier ? 'oui' : 'non';
            const button = document.querySelector(`.option-btn[data-name="bien-immobilier"][data-value="${value}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.cautionBancaire !== undefined) {
            const value = data.cautionBancaire ? 'oui' : 'non';
            const button = document.querySelector(`.option-btn[data-name="caution"][data-value="${value}"]`);
            if (button) button.classList.add('selected');
        }
        
        if (data.strategieSortie) {
            const button = document.querySelector(`.option-btn[data-value="${data.strategieSortie}"]`);
            if (button) button.classList.add('selected');
        }
    }
};

// Gestionnaire de collecte des données
const DataCollector = {
    // Collecter les données de la section 1
    collectSection1Data: function() {
        // Type d'activité
        const activityButtons = document.querySelectorAll('[data-value="commerciale"], [data-value="artisanale"], [data-value="liberale"], [data-value="service"]');
        activityButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.typeActivite = button.getAttribute('data-value');
                
                // Mapper sur le type BIC/BNC pour le barème micro
                if (['commerciale', 'artisanale'].includes(userResponses.typeActivite)) {
                    userResponses.typeMicro = 'BIC';
                } else {
                    userResponses.typeMicro = 'BNC';
                }
            }
        });
        
        // Chiffre d'affaires prévu
        const caSlider = document.getElementById('ca-range');
        if (caSlider) {
            userResponses.chiffreAffaires = parseInt(caSlider.value);
        }
    },
    
    // Collecter les données de la nouvelle section 1b
    collectSection1bData: function() {
        // Statut du porteur
        const statutButtons = document.querySelectorAll('[data-value="salarie"], [data-value="demandeur-emploi"], [data-value="autre"]');
        statutButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.statutPorteur = button.getAttribute('data-value');
            }
        });
        
        // Régime matrimonial
        const estMarieButtons = document.querySelectorAll('[data-name="est-marie"]');
        estMarieButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.estMarie = button.getAttribute('data-value') === 'oui';
            }
        });
        
        const regimeMatrimonialSelect = document.getElementById('regime-matrimonial');
        if (regimeMatrimonialSelect && userResponses.estMarie) {
            userResponses.regimeMatrimonial = regimeMatrimonialSelect.value;
        }
        
        // Localisation
        const zoneSelect = document.getElementById('zone-implantation');
        if (zoneSelect) {
            userResponses.zoneImplantation = zoneSelect.value;
        }
        
        const aideRegionaleCheckbox = document.getElementById('aide-regionale');
        if (aideRegionaleCheckbox) {
            userResponses.aideRegionale = aideRegionaleCheckbox.checked;
        }
    },
    
    // Collecter les données de la section 2
    collectSection2Data: function() {
        // Profil entrepreneur
        const profilButtons = document.querySelectorAll('[data-value="solo"], [data-value="associes"], [data-value="famille"], [data-value="investisseurs"]');
        profilButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.profilEntrepreneur = button.getAttribute('data-value');
            }
        });
        
        // Taux de marge
        const margesSlider = document.getElementById('marges-range');
        if (margesSlider) {
            userResponses.tauxMarge = parseInt(margesSlider.value) / 100;
        }
    },
    
    // Collecter les données de la section 3
    collectSection3Data: function() {
        // Niveau de protection patrimoniale
        const protectionOptions = document.querySelectorAll('.protection-option.selected');
        userResponses.besoinProtection = protectionOptions.length;
        
        // Besoin de financement
        const financementButtons = document.querySelectorAll('[data-name="financement"]');
        financementButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.besoinFinancement = button.getAttribute('data-value') === 'oui';
            }
        });
        
        // Montant de levée de fonds
        const montantInput = document.getElementById('montant-levee');
        if (montantInput && userResponses.besoinFinancement) {
            userResponses.montantLevee = parseInt(montantInput.value) || 0;
        } else {
            userResponses.montantLevee = 0;
        }
    },
    
    // Collecter les données de la nouvelle section 3b
    collectSection3bData: function() {
        // Ressources humaines
        const embaucheSelect = document.getElementById('embauche-prevue');
        const timingSelect = document.getElementById('timing-recrutement');
        
        if (embaucheSelect) userResponses.embauche = embaucheSelect.value;
        if (timingSelect) userResponses.timingRecrutement = timingSelect.value;
        
        // Apports spécifiques
        const apportBrevetCheckbox = document.getElementById('apport-brevet');
        const apportMaterielCheckbox = document.getElementById('apport-materiel');
        
        if (apportBrevetCheckbox) userResponses.apportBrevet = apportBrevetCheckbox.checked;
        if (apportMaterielCheckbox) userResponses.apportMateriel = apportMaterielCheckbox.checked;
        
        // Assurances
        const garantieDecennaleCheckbox = document.getElementById('garantie-decennale');
        const rcpObligatoireCheckbox = document.getElementById('rcp-obligatoire');
        
        if (garantieDecennaleCheckbox) userResponses.garantieDecennale = garantieDecennaleCheckbox.checked;
        if (rcpObligatoireCheckbox) userResponses.rcpObligatoire = rcpObligatoireCheckbox.checked;
        
        // Structure d'exploitation
        const multiEtablissementsCheckbox = document.getElementById('multi-etablissements');
        const structureHoldingCheckbox = document.getElementById('structure-holding');
        
        if (multiEtablissementsCheckbox) userResponses.multiEtablissements = multiEtablissementsCheckbox.checked;
        if (structureHoldingCheckbox) userResponses.structureHolding = structureHoldingCheckbox.checked;
        
        // RSE
        const entrepriseMissionCheckbox = document.getElementById('entreprise-mission');
        const statutEsusCheckbox = document.getElementById('statut-esus');
        
        if (entrepriseMissionCheckbox) userResponses.entrepriseMission = entrepriseMissionCheckbox.checked;
        if (statutEsusCheckbox) userResponses.statutEsus = statutEsusCheckbox.checked;
    },
    
    // Collecter les données de la section 4
    collectSection4Data: function() {
        // Horizon d'activité
        const horizonButtons = document.querySelectorAll('[data-value="court"], [data-value="moyen"], [data-value="long"]');
        horizonButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.horizon = button.getAttribute('data-value');
            }
        });
        
        // Priorités
        const simpliciteCheckbox = document.getElementById('priorite-simplicite');
        if (simpliciteCheckbox) {
            userResponses.prioriteSimplicite = simpliciteCheckbox.checked;
        }
        
        const fiscaliteCheckbox = document.getElementById('priorite-fiscalite');
        if (fiscaliteCheckbox) {
            userResponses.prioriteOptimisationFiscale = fiscaliteCheckbox.checked;
        }
        
        // TMI actuel
        const tmiSlider = document.getElementById('tmi-range');
        if (tmiSlider) {
            userResponses.tmiActuel = parseInt(tmiSlider.value);
        }
        
        // Nouvelles questions
        const preferenceDividendesSelect = document.getElementById('preference-dividendes');
        if (preferenceDividendesSelect) {
            userResponses.preferenceDividendes = preferenceDividendesSelect.value;
        }
        
        const protectionSocialeSelect = document.getElementById('protection-sociale');
        if (protectionSocialeSelect) {
            userResponses.protectionSociale = protectionSocialeSelect.value;
        }
    },
    
    // Collecter les données de la section 5
    collectSection5Data: function() {
        // Ordre professionnel
        const ordreButtons = document.querySelectorAll('[data-name="ordre"]');
        ordreButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.ordreProessionnel = button.getAttribute('data-value') === 'oui';
            }
        });
        
        // Bien immobilier
        const bienButtons = document.querySelectorAll('[data-name="bien-immobilier"]');
        bienButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.bienImmobilier = button.getAttribute('data-value') === 'oui';
            }
        });
        
        // Caution bancaire
        const cautionButtons = document.querySelectorAll('[data-name="caution"]');
        cautionButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.cautionBancaire = button.getAttribute('data-value') === 'oui';
            }
        });
        
        // Stratégie de sortie
        const strategieButtons = document.querySelectorAll('[data-value="aucune"], [data-value="transmission"], [data-value="revente"]');
        strategieButtons.forEach(button => {
            if (button.classList.contains('selected')) {
                userResponses.strategieSortie = button.getAttribute('data-value');
            }
        });
    },
    
    // Collecter toutes les données restantes (pour le bouton Calculer)
    collectAllRemainingData: function() {
        // Collecter les données des sections si pas déjà fait
        if (FormManager.currentSection <= 6) {
            this.collectSection5Data();
        }
        
        // Ajouter la date de simulation
        userResponses.dateSimulation = new Date().toISOString();
        userResponses.acreActif = userResponses.statutPorteur === 'demandeur-emploi'; // Auto-activation ACRE si éligible
    }
};

// Gestionnaire de stockage des données
const StorageManager = {
    storageKey: 'entreprise_simulator_progress',
    
    // Sauvegarder la progression
    saveProgress: function() {
        localStorage.setItem(this.storageKey, JSON.stringify(userResponses));
    },
    
    // Charger la progression
    loadProgress: function() {
        const saved = localStorage.getItem(this.storageKey);
        return saved ? JSON.parse(saved) : null;
    },
    
    // Effacer la progression
    clearProgress: function() {
        localStorage.removeItem(this.storageKey);
    }
};

// Gestionnaire de l'interface utilisateur
const UIManager = {
    // Afficher une notification temporaire
    showNotification: function(message, type = 'info', duration = 3000) {
        const notifContainer = document.createElement('div');
        notifContainer.className = `fixed bottom-4 right-4 ${type === 'error' ? 'bg-red-500' : 'bg-green-500'} text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity duration-300`;
        notifContainer.textContent = message;
        
        document.body.appendChild(notifContainer);
        
        // Disparaître après durée spécifiée
        setTimeout(() => {
            notifContainer.classList.add('opacity-0');
            setTimeout(() => {
                document.body.removeChild(notifContainer);
            }, 300);
        }, duration);
    },
    
    // Formater un nombre pour l'affichage
    formatNumber: function(number, currency = false) {
        const formatted = Number(number).toLocaleString('fr-FR');
        return currency ? formatted + ' €' : formatted;
    },
    
    // Créer un élément d'interface de manière programmative
    createElement: function(tag, className, textContent = '') {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = textContent;
        return element;
    }
};

// Gestionnaire des résultats
const ResultsManager = {
    // Afficher les résultats du simulateur
    showResults: function() {
        const resultsContainer = document.getElementById('results-container');
        const loadingContainer = document.getElementById('loading-container');
        const resultsContent = document.getElementById('results-content');
        
        if (!resultsContainer || !loadingContainer || !resultsContent) return;
        
        // Afficher le conteneur de résultats et le loader
        resultsContainer.classList.remove('hidden');
        loadingContainer.classList.remove('hidden');
        resultsContent.classList.add('hidden');
        
        // Faire défiler vers les résultats
        resultsContainer.scrollIntoView({behavior: 'smooth'});
        
        // Simuler un temps de chargement
        setTimeout(() => {
            // Masquer le loader et afficher les résultats
            loadingContainer.classList.add('hidden');
            resultsContent.classList.remove('hidden');
            
            // Générer les résultats
            this.generateResults(resultsContent);
        }, 1500);
    },
    
    // Générer le contenu des résultats
    generateResults: function(container) {
        // Vider le conteneur
        container.innerHTML = '';
        
        // Obtenir les résultats de la recommandation
        let formesRecommandees = [];
        
        try {
            formesRecommandees = getFormesRecommandees(userResponses);
        } catch (error) {
            console.error("Erreur lors du calcul des recommandations:", error);
            container.innerHTML = `
                <div class="p-6 bg-red-800 bg-opacity-30 rounded-lg">
                    <h3 class="text-xl font-bold text-red-400">Erreur lors du calcul</h3>
                    <p>Une erreur s'est produite lors du calcul des recommandations.</p>
                    <p class="text-xs mt-2">Détail technique : ${error.message}</p>
                </div>
            `;
            return;
        }
        
        // Créer le résumé des réponses
        const resumeEl = this.createResponseSummary();
        container.appendChild(resumeEl);
        
        // Afficher les 3 premières formes recommandées
        const topFormes = formesRecommandees.slice(0, 3);
        
        // S'il y a des formes recommandées
        if (topFormes.length > 0) {
            // Créer le titre
            const title = document.createElement('h3');
            title.className = "text-xl font-bold text-green-400 mt-8 mb-6";
            title.textContent = "Formes juridiques recommandées";
            container.appendChild(title);
            
            // Créer un conteneur pour les cartes
            const cardsContainer = document.createElement('div');
            cardsContainer.className = "grid grid-cols-1 md:grid-cols-3 gap-6";
            
            // Générer une carte pour chaque forme
            topFormes.forEach((item, index) => {
                const card = this.createFormeCard(item.forme, item.score, index);
                cardsContainer.appendChild(card);
                
                // Ajouter un gestionnaire d'événements pour afficher les détails
                card.addEventListener('click', () => {
                    this.showFormeDetails(item.forme.id);
                });
            });
            
            container.appendChild(cardsContainer);
            
            // Ajouter un bouton pour voir plus de formes juridiques
            const moreButton = document.createElement('button');
            moreButton.className = "mt-6 mx-auto block border border-green-400 text-green-400 hover:bg-green-900 hover:bg-opacity-30 font-semibold py-3 px-6 rounded-lg transition";
            moreButton.textContent = "Voir toutes les formes juridiques";
            moreButton.addEventListener('click', () => {
                this.showAllFormes(formesRecommandees);
            });
            
            container.appendChild(moreButton);
            
            // Vérifier les incompatibilités majeures
            const hardFails = checkHardFails(userResponses);
            if (hardFails && hardFails.length > 0) {
                this.displayIncompatibilities(hardFails, container);
            }
            
            // Ajouter des informations sur l'année fiscale
            const fiscalInfo = document.createElement('div');
            fiscalInfo.className = 'mt-8 p-4 bg-blue-900 bg-opacity-30 rounded-lg text-sm';
            fiscalInfo.innerHTML = `
                <p class="text-center">
                    <i class="fas fa-info-circle text-blue-400 mr-2"></i>
                    Les calculs sont basés sur les barèmes fiscaux et sociaux applicables en 2025.
                    <br>Les simulations sont réalisées à titre indicatif et ne constituent pas un conseil juridique ou fiscal.
                </p>
            `;
            container.appendChild(fiscalInfo);
        } else {
            // Aucune forme recommandée
            const noResults = document.createElement('div');
            noResults.className = "p-6 bg-red-800 bg-opacity-30 rounded-lg mt-8";
            noResults.innerHTML = `
                <h3 class="text-xl font-bold text-red-400">Aucune forme juridique compatible</h3>
                <p>Vos critères ne correspondent à aucune forme juridique disponible. Essayez d'ajuster vos réponses.</p>
            `;
            container.appendChild(noResults);
        }
    },
    
    // Créer une carte pour une forme juridique
    createFormeCard: function(forme, score, index) {
        // Déterminer la classe de la carte en fonction du score
        let cardClass = "p-6 rounded-xl cursor-pointer transition-transform transform hover:scale-105";
        if (index === 0) {
            cardClass += " bg-gradient-to-br from-green-900 to-green-800 border-2 border-green-400";
        } else {
            cardClass += " bg-blue-900 bg-opacity-40";
        }
        
        // Créer la carte
        const card = document.createElement('div');
        card.className = cardClass;
        
        // Ajouter le badge "Recommandée" pour la première forme
        let badgeHTML = '';
        if (index === 0) {
            badgeHTML = `<div class="absolute -top-3 -right-3 bg-green-500 text-gray-900 px-3 py-1 rounded-full text-xs font-bold">Recommandée</div>`;
        }
        
        // Icône en fonction de la forme
        let icon = 'fas fa-building';
        if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
            icon = 'fas fa-user-tie';
        } else if (forme.id === 'eurl' || forme.id === 'sasu') {
            icon = 'fas fa-user-shield';
        } else if (forme.id === 'scop' || forme.id === 'scic') {
            icon = 'fas fa-users';
        }
        
        // Générer les étiquettes de fiscalité et régime social
        const fiscaliteLabel = this.createLabel(forme.fiscalite, forme.fiscalite === 'IR' ? 'blue' : 'purple');
        const regimeSocialLabel = this.createLabel(forme.regimeSocial, forme.regimeSocial.includes('TNS') ? 'orange' : 'green');
        
        // Générer le contenu de la carte
        card.innerHTML = `
            <div class="relative">
                ${badgeHTML}
                <div class="flex mb-4">
                    <div class="h-12 w-12 rounded-full bg-blue-400 bg-opacity-20 flex items-center justify-center">
                        <i class="${icon} text-xl text-blue-400"></i>
                    </div>
                    <div class="ml-4 flex-1">
                        <h4 class="text-lg font-bold">${forme.nom}</h4>
                        <div class="flex flex-wrap gap-2 mt-1">
                            ${fiscaliteLabel}
                            ${regimeSocialLabel}
                        </div>
                    </div>
                    <div class="flex flex-col items-center">
                        <div class="text-2xl font-bold ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}">${score}%</div>
                        <div class="text-xs opacity-70">compatibilité</div>
                    </div>
                </div>
                <p class="text-sm opacity-80 line-clamp-3">${forme.description}</p>
                <div class="mt-4 text-center text-xs text-blue-400">Cliquer pour plus d'informations</div>
            </div>
        `;
        
        return card;
    },
    
    // Créer une étiquette (badge)
    createLabel: function(text, color = 'blue') {
        let colorClass = '';
        switch (color) {
            case 'blue':
                colorClass = 'bg-blue-800 bg-opacity-50 text-blue-400 border-blue-600';
                break;
            case 'green':
                colorClass = 'bg-green-800 bg-opacity-50 text-green-400 border-green-600';
                break;
            case 'orange':
                colorClass = 'bg-orange-800 bg-opacity-50 text-orange-400 border-orange-600';
                break;
            case 'purple':
                colorClass = 'bg-purple-800 bg-opacity-50 text-purple-400 border-purple-600';
                break;
            default:
                colorClass = 'bg-gray-800 bg-opacity-50 text-gray-400 border-gray-600';
        }
        
        return `<span class="text-xs px-2 py-1 rounded-full border ${colorClass}">${text}</span>`;
    },
    
    // Créer un résumé des réponses utilisateur
    createResponseSummary: function() {
        const summary = document.createElement('div');
        summary.className = "bg-blue-900 bg-opacity-30 p-6 rounded-xl";
        
        summary.innerHTML = `
            <h3 class="text-xl font-bold text-blue-400 mb-4">Récapitulatif de votre projet</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 class="font-semibold mb-2 text-blue-300">Profil et activité</h4>
                    <ul class="space-y-2">
                        <li><span class="opacity-70">Type d'activité :</span> ${this.getActivityLabel(userResponses.typeActivite)}</li>
                        <li><span class="opacity-70">Chiffre d'affaires prévu :</span> ${UIManager.formatNumber(userResponses.chiffreAffaires, true)}</li>
                        <li><span class="opacity-70">Projet :</span> ${userResponses.profilEntrepreneur === 'solo' ? 'Entrepreneur individuel' : userResponses.profilEntrepreneur === 'associes' ? 'Plusieurs associés' : userResponses.profilEntrepreneur === 'famille' ? 'Projet familial' : 'Avec investisseurs'}</li>
                        <li><span class="opacity-70">Marge envisagée :</span> ${Math.round(userResponses.tauxMarge * 100)}%</li>
                        ${userResponses.statutPorteur ? `<li><span class="opacity-70">Statut actuel :</span> ${this.getStatutLabel(userResponses.statutPorteur)}</li>` : ''}
                        ${userResponses.zoneImplantation ? `<li><span class="opacity-70">Implantation :</span> ${this.getZoneLabel(userResponses.zoneImplantation)}</li>` : ''}
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold mb-2 text-blue-300">Besoins et priorités</h4>
                    <ul class="space-y-2">
                        <li><span class="opacity-70">Priorité simplicité :</span> ${userResponses.prioriteSimplicite ? 'Oui' : 'Non'}</li>
                        <li><span class="opacity-70">Optimisation fiscale :</span> ${userResponses.prioriteOptimisationFiscale ? 'Oui' : 'Non'}</li>
                        <li><span class="opacity-70">Protection patrimoniale :</span> ${this.getProtectionLevel(userResponses.besoinProtection)}</li>
                        <li><span class="opacity-70">TMI actuel :</span> ${userResponses.tmiActuel}%</li>
                        ${userResponses.entrepriseMission ? `<li><span class="opacity-70">Entreprise à mission :</span> Oui</li>` : ''}
                        ${userResponses.statutEsus ? `<li><span class="opacity-70">Agrément ESUS visé :</span> Oui</li>` : ''}
                        ${userResponses.garantieDecennale ? `<li><span class="opacity-70">Garantie décennale :</span> Requise</li>` : ''}
                    </ul>
                </div>
            </div>
            <div class="mt-4 text-right">
                <button id="edit-responses" class="text-blue-400 hover:text-blue-300 text-sm">
                    <i class="fas fa-edit mr-1"></i> Modifier mes réponses
                </button>
            </div>
        `;
        
        // Ajouter un gestionnaire d'événements pour revenir au formulaire
        setTimeout(() => {
            const editButton = document.getElementById('edit-responses');
            if (editButton) {
                editButton.addEventListener('click', () => {
                    FormManager.showSection(1);
                    document.getElementById('results-container')?.classList.add('hidden');
                });
            }
        }, 0);
        
        return summary;
    },
    
    // Obtenir le libellé d'un type d'activité
    getActivityLabel: function(activity) {
        const labels = {
            'commerciale': 'Commerciale',
            'artisanale': 'Artisanale',
            'liberale': 'Libérale',
            'service': 'Prestation de service'
        };
        return labels[activity] || activity;
    },
    
    // Obtenir le libellé d'un statut de porteur
    getStatutLabel: function(statut) {
        const labels = {
            'salarie': 'Salarié',
            'demandeur-emploi': 'Demandeur d\'emploi',
            'autre': 'Autre statut'
        };
        return labels[statut] || statut;
    },
    
    // Obtenir le libellé d'une zone
    getZoneLabel: function(zone) {
        const labels = {
            'metropole': 'Métropole standard',
            'zfu': 'Zone Franche Urbaine (ZFU-TE)',
            'zrr': 'Zone de Revitalisation Rurale (ZRR)',
            'corse': 'Corse',
            'outre-mer': 'Départements d\'Outre-mer'
        };
        return labels[zone] || zone;
    },
    
    // Obtenir le niveau de protection patrimoniale
    getProtectionLevel: function(level) {
        switch (level) {
            case 0:
            case 1:
                return 'Faible';
            case 2:
            case 3:
                return 'Moyenne';
            case 4:
            case 5:
                return 'Forte';
            default:
                return 'Non définie';
        }
    },
    
    // Afficher les détails d'une forme juridique
    showFormeDetails: function(formeId) {
        // Récupérer les détails de la forme
        const formeDetails = getFormeDetails(formeId, userResponses);
        
        if (!formeDetails) {
            UIManager.showNotification("Impossible de charger les détails de cette forme juridique", "error");
            return;
        }
        
        const forme = formeDetails.forme;
        const incompatibilites = formeDetails.incompatibilites;
        const simulation = formeDetails.simulation;
        
        // Créer la modal
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4";
        
        // Créer le contenu de la modal avec un design amélioré
        const modalContent = document.createElement('div');
        modalContent.className = "bg-gray-900 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto";
        
        // Générer le contenu HTML
        modalContent.innerHTML = `
            <div class="relative">
                <div class="sticky top-0 z-10 bg-gray-800 rounded-t-xl p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 class="text-xl font-bold">${forme.nom}</h3>
                    <button class="close-modal text-gray-500 hover:text-gray-400">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <p class="text-gray-300 mb-6">${forme.description}</p>
                    
                    ${incompatibilites.length > 0 ? this.generateIncompatibiliteHTML(incompatibilites, formeDetails.alternatives) : ''}
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <h4 class="font-semibold text-lg text-green-400 mb-3">Points forts</h4>
                            <ul class="space-y-2">
                                ${forme.avantages.map(avantage => `
                                    <li class="flex">
                                        <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
                                        <span>${avantage}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                        <div>
                            <h4 class="font-semibold text-lg text-red-400 mb-3">Points faibles</h4>
                            <ul class="space-y-2">
                                ${forme.inconvenients.map(inconvenient => `
                                    <li class="flex">
                                        <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                                        <span>${inconvenient}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg">
                            <h4 class="font-semibold text-blue-400 mb-2">Fiscalité</h4>
                            <p class="text-lg">${forme.fiscalite}</p>
                            ${forme.fiscaliteOption !== 'Non' ? `<p class="text-sm opacity-70">Option ${forme.fiscaliteOption} possible</p>` : ''}
                        </div>
                        <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg">
                            <h4 class="font-semibold text-blue-400 mb-2">Régime social</h4>
                            <p class="text-lg">${forme.regimeSocial}</p>
                            <p class="text-sm opacity-70">Protection sociale ${forme.protectionSociale}</p>
                        </div>
                        <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg">
                            <h4 class="font-semibold text-blue-400 mb-2">Responsabilité</h4>
                            <p class="text-lg">${forme.responsabilite}</p>
                            <p class="text-sm opacity-70">Protection patrimoniale ${forme.protectionPatrimoine}</p>
                        </div>
                    </div>
                    
                    ${this.generateSpecificitesHTML(forme)}
                    
                    ${simulation ? this.generateSimulationHTML(simulation) : ''}
                    
                    <div class="mt-6">
                        <h4 class="font-semibold text-lg text-blue-400 mb-3">Création et gestion</h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-blue-900 bg-opacity-10 p-3 rounded-lg">
                                <p class="font-semibold">Création</p>
                                <p class="opacity-70">Démarches : ${forme.creation.demarches}</p>
                                <p class="opacity-70">Délai : ${forme.creation.delai}</p>
                                <p class="opacity-70">Coût : ${forme.creation.cout}</p>
                            </div>
                            <div class="bg-blue-900 bg-opacity-10 p-3 rounded-lg">
                                <p class="font-semibold">Fonctionnement</p>
                                <p class="opacity-70">Comptabilité : ${forme.fonctionnement.comptabilite}</p>
                                <p class="opacity-70">Formalisme : ${forme.fonctionnement.formalisme}</p>
                                <p class="opacity-70">Flexibilité : ${forme.fonctionnement.flexibilite}</p>
                            </div>
                            <div class="bg-blue-900 bg-opacity-10 p-3 rounded-lg">
                                <p class="font-semibold">Évolution</p>
                                <p class="opacity-70">Évolutivité : ${forme.evolutivite}</p>
                                <p class="opacity-70">Financement : ${forme.credit}</p>
                                <p class="opacity-70">Transmission : ${forme.transmission}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Ajouter un gestionnaire d'événements pour fermer la modal
        modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.closest('.close-modal')) {
                document.body.removeChild(modal);
            }
        });
        
        // Empêcher le défilement du corps
        document.body.style.overflow = 'hidden';
        
        // Restaurer le défilement lors de la fermeture
        modal.addEventListener('transitionend', function() {
            if (!document.body.contains(modal)) {
                document.body.style.overflow = '';
            }
        });
    },
    
    // Générer le HTML pour les spécificités de la forme
    generateSpecificitesHTML: function(forme) {
        // Vérifier quelles spécificités sont présentes
        const hasAvantagesZones = forme.zonesAvantageuses && forme.zonesAvantageuses.length > 0 && forme.zonesAvantageuses.some(z => z !== 'standard');
        const hasCompatibiliteSpecifique = forme.compatibleEsus || forme.compatibleMission || forme.compatibleHolding || forme.compatibleMultiEtablissements;
        const hasAutresSpecificites = forme.acreEligible || forme.compatibleDecennale || forme.compatibleApportPI;
        
        // Si aucune spécificité, ne pas afficher cette section
        if (!hasAvantagesZones && !hasCompatibiliteSpecifique && !hasAutresSpecificites) {
            return '';
        }
        
        // Construire le HTML
        let specificitesHTML = `
            <div class="mb-6">
                <h4 class="font-semibold text-lg text-blue-400 mb-3">Spécificités</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        // Avantages zones
        if (hasAvantagesZones) {
            specificitesHTML += `
                <div class="bg-blue-900 bg-opacity-10 p-3 rounded-lg">
                    <p class="font-semibold">Avantages fiscaux zones</p>
                    <ul class="mt-1">
                        ${forme.zonesAvantageuses.map(zone => {
                            if (zone === 'standard') return '';
                            return `<li class="flex items-center">
                                <i class="fas fa-map-marker-alt text-green-400 mr-2"></i>
                                ${zone === 'zfu' ? 'Zone Franche Urbaine (ZFU)' : 
                                   zone === 'zrr' ? 'Zone de Revitalisation Rurale (ZRR)' : 
                                   zone === 'outre-mer' ? 'Départements d\'Outre-mer' : zone}
                            </li>`;
                        }).filter(item => item !== '').join('')}
                    </ul>
                </div>
            `;
        }
        
        // Compatibilités spécifiques
        if (hasCompatibiliteSpecifique) {
            specificitesHTML += `
                <div class="bg-blue-900 bg-opacity-10 p-3 rounded-lg">
                    <p class="font-semibold">Compatibilités</p>
                    <ul class="mt-1">
                        ${forme.compatibleEsus ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Éligible agrément ESUS</li>` : ''}
                        ${forme.compatibleMission ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Compatible entreprise à mission</li>` : ''}
                        ${forme.compatibleHolding ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Structure holding possible</li>` : ''}
                        ${forme.compatibleMultiEtablissements ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Multi-établissements</li>` : ''}
                    </ul>
                </div>
            `;
        }
        
        // Autres spécificités
        if (hasAutresSpecificites) {
            specificitesHTML += `
                <div class="bg-blue-900 bg-opacity-10 p-3 rounded-lg">
                    <p class="font-semibold">Autres spécificités</p>
                    <ul class="mt-1">
                        ${forme.acreEligible ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Éligible ACRE (demandeur d'emploi)</li>` : ''}
                        ${forme.compatibleDecennale ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Compatible garantie décennale</li>` : ''}
                        ${forme.compatibleApportPI ? `<li class="flex items-center"><i class="fas fa-check text-green-400 mr-2"></i> Valorisation propriété intellectuelle</li>` : ''}
                        <li class="flex items-center">
                            <i class="fas fa-shield-alt text-blue-400 mr-2"></i>
                            Protection matrimoniale : ${forme.protectionMatrimoniale}
                        </li>
                    </ul>
                </div>
            `;
        }
        
        specificitesHTML += `
                </div>
            </div>
        `;
        
        return specificitesHTML;
    },
    
    // Générer le HTML pour la simulation financière
    generateSimulationHTML: function(simulation) {
        // Vérifier si la simulation est valide
        if (!simulation || !simulation.revenueNet) {
            return '';
        }
        
        // Formater les nombres
        const ca = UIManager.formatNumber(simulation.revenuAnnuel, true);
        const chargesSociales = UIManager.formatNumber(Math.round(simulation.chargesSociales), true);
        const impot = UIManager.formatNumber(Math.round(simulation.impot), true);
        const revenueNet = UIManager.formatNumber(Math.round(simulation.revenueNet), true);
        
        // Déterminer s'il y a des avantages spécifiques
        const hasAvantageACRE = simulation.avantagesACRE;
        const hasAvantageZone = simulation.avantagesZone;
        
        return `
            <div class="mt-6">
                <h4 class="font-semibold text-lg text-blue-400 mb-3">Simulation financière</h4>
                
                <div class="bg-blue-900 bg-opacity-20 p-4 rounded-lg mb-4">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-lg">Chiffre d'affaires</span>
                        <span class="text-xl font-bold">${ca}</span>
                    </div>
                    
                    <div class="space-y-3">
                        <div class="flex justify-between items-center text-sm">
                            <span class="opacity-70">Charges sociales</span>
                            <span class="font-medium text-red-400">- ${chargesSociales}</span>
                        </div>
                        
                        <div class="flex justify-between items-center text-sm">
                            <span class="opacity-70">Impôts</span>
                            <span class="font-medium text-red-400">- ${impot}</span>
                        </div>
                        
                        ${simulation.coutAssurances ? `
                            <div class="flex justify-between items-center text-sm">
                                <span class="opacity-70">Assurances professionnelles</span>
                                <span class="font-medium text-red-400">- ${UIManager.formatNumber(Math.round(simulation.coutAssurances), true)}</span>
                            </div>
                        ` : ''}
                        
                        <div class="border-t border-gray-700 pt-3 flex justify-between items-center">
                            <span class="font-medium">Revenu net</span>
                            <span class="text-lg font-bold text-green-400">${revenueNet}</span>
                        </div>
                    </div>
                </div>
                
                ${(hasAvantageACRE || hasAvantageZone) ? `
                    <div class="bg-green-900 bg-opacity-20 p-3 rounded-lg">
                        <h5 class="font-semibold text-green-400 mb-2">
                            <i class="fas fa-star mr-1"></i> Avantages spécifiques
                        </h5>
                        <ul class="space-y-1">
                            ${hasAvantageACRE ? `<li class="flex items-start">
                                <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                                <span>${simulation.avantagesACRE}</span>
                            </li>` : ''}
                            
                            ${hasAvantageZone ? `<li class="flex items-start">
                                <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                                <span>${simulation.avantagesZone}</span>
                            </li>` : ''}
                        </ul>
                    </div>
                ` : ''}
                
                <p class="text-xs opacity-70 mt-3">
                    <i class="fas fa-info-circle mr-1"></i>
                    Cette simulation est basée sur vos réponses et représente une estimation. 
                    Les montants réels peuvent varier en fonction de votre situation personnelle et professionnelle.
                </p>
            </div>
        `;
    },
    
    // Générer le HTML pour les incompatibilités
    generateIncompatibiliteHTML: function(incompatibilites, alternatives) {
        if (!incompatibilites || incompatibilites.length === 0) {
            return '';
        }
        
        let html = `
            <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg mb-6">
                <h4 class="font-semibold text-red-400 mb-2">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    Incompatibilités détectées
                </h4>
                <ul class="space-y-2">
        `;
        
        incompatibilites.forEach(incompatibilite => {
            html += `
                <li class="flex items-start">
                    <i class="fas fa-times-circle text-red-400 mr-2 mt-1"></i>
                    <span>${incompatibilite.message}</span>
                </li>
            `;
        });
        
        html += `</ul>`;
        
        // Ajouter des alternatives si disponibles
        if (alternatives && alternatives.length > 0) {
            html += `
                <div class="mt-3 pt-3 border-t border-red-800">
                    <p class="text-sm font-medium mb-2">Alternatives suggérées:</p>
                    <div class="flex flex-wrap gap-2">
            `;
            
            alternatives.forEach(alternative => {
                html += `
                    <button class="alternative-link px-2 py-1 text-sm rounded bg-red-800 bg-opacity-30 hover:bg-opacity-50 transition" 
                           data-forme-id="${alternative.id}">
                        ${alternative.nom}
                    </button>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        
        // Ajouter un délai pour permettre au DOM d'être mis à jour
        setTimeout(() => {
            document.querySelectorAll('.alternative-link').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation(); // Éviter de fermer la modal
                    const formeId = button.getAttribute('data-forme-id');
                    // Fermer la modal actuelle
                    const modal = button.closest('.fixed');
                    if (modal) {
                        document.body.removeChild(modal);
                    }
                    // Ouvrir la modal de la forme alternative
                    this.showFormeDetails(formeId);
                });
            });
        }, 0);
        
        return html;
    },
    
    // Afficher toutes les formes juridiques
    showAllFormes: function(formesRecommandees) {
        // Créer la modal
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4";
        
        // Créer le contenu de la modal
        const modalContent = document.createElement('div');
        modalContent.className = "bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto";
        
        // En-tête
        let contentHTML = `
            <div class="sticky top-0 z-10 bg-gray-800 rounded-t-xl p-4 border-b border-gray-700 flex justify-between items-center">
                <h3 class="text-xl font-bold">Toutes les formes juridiques</h3>
                <button class="close-modal text-gray-500 hover:text-gray-400">
                    <i class="fas fa-times text-lg"></i>
                </button>
            </div>
            
            <div class="p-6">
                <p class="mb-6">Classement des formes juridiques selon leur compatibilité avec votre projet:</p>
                
                <div class="space-y-3">
        `;
        
        // Ajouter toutes les formes juridiques
        formesRecommandees.forEach((item, index) => {
            const forme = item.forme;
            const score = item.score;
            const incompatible = item.incompatible;
            
            // Déterminer la classe de couleur pour le score
            let scoreColorClass = score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : score >= 30 ? 'text-orange-400' : 'text-red-400';
            
            // Générer les étiquettes de fiscalité et régime social
            const fiscaliteLabel = this.createLabel(forme.fiscalite, forme.fiscalite === 'IR' ? 'blue' : 'purple');
            const regimeSocialLabel = this.createLabel(forme.regimeSocial, forme.regimeSocial.includes('TNS') ? 'orange' : 'green');
            
            // Ligne pour chaque forme
            contentHTML += `
                <div class="forme-item p-4 rounded-lg ${incompatible ? 'bg-red-900 bg-opacity-20' : 'bg-blue-900 bg-opacity-20'} cursor-pointer hover:bg-opacity-30 transition" data-forme-id="${forme.id}">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <span class="text-lg font-medium mr-3">${index + 1}.</span>
                            <div>
                                <h4 class="font-semibold">${forme.nom}</h4>
                                <div class="flex flex-wrap gap-1 mt-1">
                                    ${fiscaliteLabel}
                                    ${regimeSocialLabel}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center">
                            ${incompatible ? `
                                <span class="text-red-400 text-sm mr-3">
                                    <i class="fas fa-exclamation-triangle mr-1"></i>
                                    Incompatible
                                </span>
                            ` : `
                                <span class="font-bold ${scoreColorClass} text-lg">${score}%</span>
                            `}
                            <i class="fas fa-chevron-right ml-3 text-gray-500"></i>
                        </div>
                    </div>
                </div>
            `;
        });
        
        contentHTML += `
                </div>
            </div>
        `;
        
        modalContent.innerHTML = contentHTML;
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Ajouter un gestionnaire d'événements pour fermer la modal
        modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.closest('.close-modal')) {
                document.body.removeChild(modal);
            }
        });
        
        // Ajouter un gestionnaire pour ouvrir les détails d'une forme
        setTimeout(() => {
            document.querySelectorAll('.forme-item').forEach(item => {
                item.addEventListener('click', () => {
                    const formeId = item.getAttribute('data-forme-id');
                    // Fermer cette modal
                    document.body.removeChild(modal);
                    // Ouvrir la modal de détails
                    this.showFormeDetails(formeId);
                });
            });
        }, 0);
        
        // Empêcher le défilement du corps
        document.body.style.overflow = 'hidden';
        
        // Restaurer le défilement lors de la fermeture
        modal.addEventListener('transitionend', function() {
            if (!document.body.contains(modal)) {
                document.body.style.overflow = '';
            }
        });
    },
    
    // Afficher les incompatibilités majeures
    displayIncompatibilities: function(incompatibilites, container) {
        if (!incompatibilites || incompatibilites.length === 0) return;
        
        // Créer un conteneur pour les incompatibilités
        const incompatibilitesContainer = document.createElement('div');
        incompatibilitesContainer.className = "mt-8 p-4 bg-red-900 bg-opacity-20 rounded-lg";
        
        // Contenu HTML
        incompatibilitesContainer.innerHTML = `
            <h4 class="text-lg font-bold text-red-400 mb-3">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                Incompatibilités identifiées
            </h4>
            <p class="mb-3">Certaines formes juridiques sont incompatibles avec vos réponses:</p>
            <ul class="space-y-2">
                ${incompatibilites.map(incompat => `
                    <li class="flex items-start">
                        <i class="fas fa-times-circle text-red-400 mr-2 mt-1"></i>
                        <div>
                            <span class="font-medium">${getFormeById(incompat.formeId)?.nom || incompat.formeId}</span>: 
                            <span class="opacity-80">${incompat.message}</span>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
        
        container.appendChild(incompatibilitesContainer);
    }
};

// Fonction pour obtenir les détails d'une forme avec simulation
function getFormeDetails(formeId, userResponses) {
    const forme = getFormeById(formeId);
    if (!forme) return null;
    
    // Obtenir les incompatibilités
    const incompatibilites = checkHardFails(userResponses)
        .filter(fail => fail.formeId === formeId);
    
    // Générer la simulation si compatible
    let simulation = null;
    if (incompatibilites.length === 0 && typeof SimulationsFiscales !== 'undefined') {
        simulation = SimulationsFiscales.simulerImpactFiscal(forme, userResponses.chiffreAffaires || 50000, {
            zoneImplantation: userResponses.zoneImplantation,
            statutPorteur: userResponses.statutPorteur,
            acreActif: userResponses.statutPorteur === 'demandeur-emploi',
            garantieDecennale: userResponses.garantieDecennale,
            rcpObligatoire: userResponses.rcpObligatoire,
            regimeMatrimonial: userResponses.regimeMatrimonial,
            preferenceDividendes: userResponses.preferenceDividendes,
            protectionSociale: userResponses.protectionSociale,
            tauxMarge: userResponses.tauxMarge || 0.3,
            tmiActuel: userResponses.tmiActuel || 30
        });
    }
    
    // Obtenir des alternatives
    const alternatives = [];
    
    // Basé sur chaque type d'incompatibilité, suggérer des alternatives appropriées
    if (incompatibilites.length > 0) {
        const reasons = incompatibilites.map(inc => inc.code);
        
        if (reasons.includes('CA_ELEVE') || reasons.includes('ca-micro')) {
            ['eurl', 'sasu', 'ei'].forEach(id => {
                const forme = getFormeById(id);
                if (forme) alternatives.push(forme);
            });
        } else if (reasons.includes('garantie-decennale')) {
            ['sarl', 'sasu', 'eurl'].forEach(id => {
                const forme = getFormeById(id);
                if (forme) alternatives.push(forme);
            });
        } else if (reasons.includes('HOLDING') || reasons.includes('structure-holding')) {
            ['sas', 'sa', 'sarl'].forEach(id => {
                const forme = getFormeById(id);
                if (forme) alternatives.push(forme);
            });
        } else if (reasons.includes('ESUS') || reasons.includes('esus-statut')) {
            ['scic', 'scop', 'sas'].forEach(id => {
                const forme = getFormeById(id);
                if (forme) alternatives.push(forme);
            });
        } else if (reasons.includes('MULTI_ETAB') || reasons.includes('multi-sites')) {
            ['sas', 'sarl', 'sa'].forEach(id => {
                const forme = getFormeById(id);
                if (forme) alternatives.push(forme);
            });
        } else if (reasons.includes('REGIME_MATRIMONIAL') || reasons.includes('regime-communaute')) {
            ['sasu', 'eurl', 'sarl'].forEach(id => {
                const forme = getFormeById(id);
                if (forme) alternatives.push(forme);
            });
        }
    }
    
    return {
        forme,
        incompatibilites,
        simulation,
        alternatives: Array.from(new Set(alternatives)) // Enlever les doublons
    };
}

// Initialiser le gestionnaire de formulaire au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    FormManager.init();
    
    // Initialiser les événements pour les élements déjà existants dans le DOM
    // Par exemple, les boutons d'option de section1
    document.querySelectorAll('.option-btn').forEach(button => {
        button.addEventListener('click', function() {
            const parent = this.closest('.grid');
            if (parent) {
                parent.querySelectorAll('.option-btn').forEach(btn => {
                    btn.classList.remove('selected');
                });
            }
            this.classList.add('selected');
        });
    });
    
    // Gestionnaire pour la sélection des niveaux de protection
    document.querySelectorAll('.protection-option').forEach((option, index) => {
        option.addEventListener('click', function() {
            const level = index + 1;
            document.querySelectorAll('.protection-option').forEach((opt, i) => {
                if (i < level) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
        });
    });
});
