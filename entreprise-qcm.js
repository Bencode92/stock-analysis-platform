/**
 * entreprise-qcm.js
 * Gestion du questionnaire interactif pour le choix de forme juridique d'entreprise
 */

// Gestionnaire de formulaire - gère la navigation entre les sections
const FormManager = {
    currentSection: 1,
    totalSections: 6, // Mise à jour pour le nouveau questionnaire à 6 sections
    
    init: function() {
        this.setupEventListeners();
        this.updateProgressBar(1);
        this.setupConditionalDisplays();
    },
    
    // Met à jour la barre de progression
    updateProgressBar: function(section) {
        const progressBar = document.getElementById('progress-bar');
        if (!progressBar) return;
        
        const percentage = (section / this.totalSections) * 100;
        progressBar.style.width = `${percentage}%`;
        
        // Mettre à jour le texte de progression
        const progressText = document.getElementById('progress-text');
        if (progressText) {
            progressText.textContent = `Étape ${section} sur ${this.totalSections}`;
        }
    },
    
    // Affiche une section spécifique et masque les autres
    showSection: function(sectionNumber) {
        for (let i = 1; i <= this.totalSections + 1; i++) {
            const section = document.getElementById(`section${i}`);
            if (section) {
                section.style.display = i === sectionNumber ? 'block' : 'none';
            }
        }
        
        this.currentSection = sectionNumber;
        this.updateProgressBar(sectionNumber <= this.totalSections ? sectionNumber : this.totalSections);
        
        // Faire défiler vers le haut
        window.scrollTo(0, 0);
    },
    
    // Configure les écouteurs d'événements pour les boutons de navigation
    setupEventListeners: function() {
        // Boutons de navigation
        const nextStep1 = document.getElementById('next1');
        const nextStep2 = document.getElementById('next2');
        const nextStep3 = document.getElementById('next3');
        const nextStep4 = document.getElementById('next4');
        const nextStep5 = document.getElementById('next5');
        const prevStep2 = document.getElementById('prev2');
        const prevStep3 = document.getElementById('prev3');
        const prevStep4 = document.getElementById('prev4');
        const prevStep5 = document.getElementById('prev5');
        const prevStep6 = document.getElementById('prev6');
        const submitBtn = document.getElementById('submit-btn');
        
        // Navigation entre sections
        if (nextStep1) nextStep1.addEventListener('click', () => this.navigateToSection(1, 2));
        if (nextStep2) nextStep2.addEventListener('click', () => this.navigateToSection(2, 3));
        if (nextStep3) nextStep3.addEventListener('click', () => this.navigateToSection(3, 4));
        if (nextStep4) nextStep4.addEventListener('click', () => this.navigateToSection(4, 5));
        if (nextStep5) nextStep5.addEventListener('click', () => this.navigateToSection(5, 6));
        
        if (prevStep2) prevStep2.addEventListener('click', () => this.navigateToSection(2, 1));
        if (prevStep3) prevStep3.addEventListener('click', () => this.navigateToSection(3, 2));
        if (prevStep4) prevStep4.addEventListener('click', () => this.navigateToSection(4, 3));
        if (prevStep5) prevStep5.addEventListener('click', () => this.navigateToSection(5, 4));
        if (prevStep6) prevStep6.addEventListener('click', () => this.navigateToSection(6, 5));
        
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                DataCollector.collectSection6Data();
                StorageManager.saveProgress();
                this.showSection(7); // Afficher les résultats (section 7)
                ResultsManager.generateResults();
            });
        }
        
        // Écouteurs pour les boutons d'options
        const optionButtons = document.querySelectorAll('.option-btn');
        optionButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Trouver le groupe de boutons
                const group = this.closest('.option-group');
                const isMultiSelect = group.getAttribute('data-multi-select') === 'true';
                
                if (!isMultiSelect) {
                    // Désélectionner tous les boutons du groupe
                    const buttonsInGroup = group.querySelectorAll('.option-btn');
                    buttonsInGroup.forEach(btn => btn.classList.remove('selected'));
                }
                
                // Basculer la sélection pour ce bouton
                this.classList.toggle('selected');
                
                // Si temps réel activé, mettre à jour la comparaison
                if (window.realTimeComparison) {
                    ResultsManager.generateQuickComparison();
                }
            });
        });
        
        // Écouteurs pour les champs dynamiques
        this.setupDynamicFields();
        
        // Écouteurs pour les mises à jour en temps réel
        this.setupRealTimeUpdates();
    },
    
    // Navigue entre les sections avec collecte de données
    navigateToSection: function(fromSection, toSection) {
        // Collecter les données de la section actuelle
        if (typeof DataCollector[`collectSection${fromSection}Data`] === 'function') {
            DataCollector[`collectSection${fromSection}Data`]();
        }
        StorageManager.saveProgress();
        
        // Si on navigue vers l'étape 3 (équipe) depuis l'étape 2, vérifier si équipe est nécessaire
        if (fromSection === 2 && toSection === 3) {
            const profilValue = this.getSelectedOptionValue('#section2 .option-btn[data-value]');
            if (profilValue === 'solo') {
                // Sauter l'étape équipe si entrepreneur solo
                toSection = 4;
            }
        }
        
        this.showSection(toSection);
        
        // Mise à jour en temps réel si activée
        if (window.realTimeComparison) {
            ResultsManager.generateQuickComparison();
        }
    },
    
    // Récupère la valeur d'un bouton d'option sélectionné
    getSelectedOptionValue: function(selector) {
        const selectedButton = document.querySelector(`${selector}.selected`);
        return selectedButton ? selectedButton.getAttribute('data-value') : null;
    },
    
    // Configuration des affichages conditionnels
    setupConditionalDisplays: function() {
        // Gestion des sections conditionnelles selon le type de projet
        const profilButtons = document.querySelectorAll('#section2 .option-btn[data-value]');
        profilButtons.forEach(button => {
            button.addEventListener('click', this.toggleEquipeSection);
        });
    },
    
    // Configure les champs qui dépendent d'autres champs
    setupDynamicFields: function() {
        // Exemple: champs qui dépendent du type d'activité
        const activityTypeSelect = document.getElementById('activite-type');
        if (activityTypeSelect) {
            activityTypeSelect.addEventListener('change', function() {
                const typeActivite = this.value;
                const seuilsDiv = document.getElementById('seuils-info');
                
                if (seuilsDiv) {
                    let seuilValue = 0;
                    switch(typeActivite) {
                        case 'bic-vente':
                        case 'artisanale':
                            seuilValue = 203100; // Nouveau seuil 2025
                            break;
                        case 'bic-service':
                        case 'bnc':
                            seuilValue = 81500; // Nouveau seuil 2025
                            break;
                        case 'agricole':
                            seuilValue = 95000;
                            break;
                    }
                    
                    if (seuilValue > 0) {
                        seuilsDiv.innerHTML = `<p class="text-sm text-blue-300 mt-2">Plafond de CA: ${seuilValue.toLocaleString('fr-FR')} € pour ce type d'activité</p>`;
                        seuilsDiv.style.display = 'block';
                    } else {
                        seuilsDiv.style.display = 'none';
                    }
                }
            });
        }
    },
    
    // Affiche/masque les sections d'équipe selon le profil
    toggleEquipeSection: function() {
        const value = this.getAttribute('data-value');
        const multiAssociesSection = document.getElementById('multi-associes-section');
        const repartitionCapitalSection = document.getElementById('repartition-capital-section');
        const investisseursSection = document.getElementById('investisseurs-section');
        
        if (value === 'solo') {
            if (multiAssociesSection) multiAssociesSection.style.display = 'none';
            if (repartitionCapitalSection) repartitionCapitalSection.style.display = 'none';
            if (investisseursSection) investisseursSection.style.display = 'none';
        } else if (value === 'investisseurs') {
            if (multiAssociesSection) multiAssociesSection.style.display = 'block';
            if (repartitionCapitalSection) repartitionCapitalSection.style.display = 'block';
            if (investisseursSection) investisseursSection.style.display = 'block';
        } else {
            if (multiAssociesSection) multiAssociesSection.style.display = 'block';
            if (repartitionCapitalSection) repartitionCapitalSection.style.display = 'block';
            if (investisseursSection) investisseursSection.style.display = 'none';
        }
    },
    
    // Configure les mises à jour en temps réel
    setupRealTimeUpdates: function() {
        // Activer la comparaison en temps réel
        window.realTimeComparison = true;
        
        // Ajouter des écouteurs sur les champs importants
        const keyFields = [
            'tmi-actuel', 'activite-type', 'ca-year1', 'ca-year3', 
            'taux-marge', 'besoin-revenus-immediats', 'caution-bancaire'
        ];
        
        keyFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                const eventType = field.type === 'checkbox' ? 'change' : 'input';
                field.addEventListener(eventType, function() {
                    if (window.realTimeComparison) {
                        // Mettre à jour l'affichage du tableau comparatif en temps réel
                        ResultsManager.generateQuickComparison();
                    }
                });
            }
        });
    }
};

// Gestionnaire de collecte des données utilisateur
const DataCollector = {
    // Section 1: Profil du porteur
    collectSection1Data: function() {
        userResponses.nationalite = this.getSelectValue('nationalite');
        userResponses.residenceFiscale = this.getSelectValue('residence-fiscale');
        userResponses.regimeMatrimonial = this.getSelectValue('regime-matrimonial');
        userResponses.situationPro = this.getSelectedOptionValue('#section1 .option-btn[data-value]');
        userResponses.tmiActuel = parseInt(this.getSelectValue('tmi-actuel') || 0);
    },
    
    // Section 2: Profil de l'entreprise
    collectSection2Data: function() {
        userResponses.horizonProjet = this.getSelectedOptionValue('#section2 .option-btn[data-value^="court"], #section2 .option-btn[data-value^="moyen"], #section2 .option-btn[data-value^="long"]');
        userResponses.transmission = this.getSelectedOptionValue('#section2 .option-btn[data-value^="revente"], #section2 .option-btn[data-value^="transmission"]');
        userResponses.besoinProtectionChomage = this.getSelectedOptionValue('#section2 .option-btn[data-value="oui"]') !== null;
        
        // Profil d'entrepreneur (solo, équipe, investisseurs)
        userResponses.profilEntrepreneur = this.getSelectedOptionValue('#section2 .option-btn[data-value="solo"], #section2 .option-btn[data-value="equipe"], #section2 .option-btn[data-value="investisseurs"]');
    },
    
    // Section 3: Équipe
    collectSection3Data: function() {
        // Si section équipe est affichée
        if (userResponses.profilEntrepreneur !== 'solo') {
            userResponses.nombreAssocies = this.getInputValue('nombre-associes', 'number');
            userResponses.capitalPart = this.getInputValue('capital-part', 'number');
            
            // Type d'investisseurs si applicable
            if (userResponses.profilEntrepreneur === 'investisseurs') {
                userResponses.typeInvestisseurs = [];
                if (document.getElementById('invest-business-angels') && document.getElementById('invest-business-angels').checked) {
                    userResponses.typeInvestisseurs.push('business-angels');
                }
                if (document.getElementById('invest-vc') && document.getElementById('invest-vc').checked) {
                    userResponses.typeInvestisseurs.push('vc');
                }
                if (document.getElementById('invest-crowdfunding') && document.getElementById('invest-crowdfunding').checked) {
                    userResponses.typeInvestisseurs.push('crowdfunding');
                }
            }
        }
    },
    
    // Section 4: Activité
    collectSection4Data: function() {
        userResponses.activiteType = this.getSelectValue('activite-type');
        userResponses.activiteReglementee = document.getElementById('activite-reglementee') ? document.getElementById('activite-reglementee').checked : false;
        userResponses.caYear1 = this.getInputValue('ca-year1', 'number');
        userResponses.caYear3 = this.getInputValue('ca-year3', 'number');
        userResponses.tauxMarge = this.getInputValue('taux-marge', 'number');
    },
    
    // Section 5: Financement
    collectSection5Data: function() {
        userResponses.besoinRevenusImmediats = document.getElementById('besoin-revenus-immediats') ? document.getElementById('besoin-revenus-immediats').checked : false;
        userResponses.cautionBancaire = document.getElementById('caution-bancaire') ? document.getElementById('caution-bancaire').checked : false;
        userResponses.risqueImpaye = this.getSelectValue('risque-impaye');
        userResponses.besoinFinancement = this.getInputValue('besoin-financement', 'number');
    },
    
    // Section 6: Fiscalité
    collectSection6Data: function() {
        userResponses.optimisationFiscale = this.getSelectedOptionValue('#section6 .option-btn[data-value^="optimisation"]');
        userResponses.importanceProtectionPatrimoine = this.getSelectValue('importance-protection-patrimoine');
        userResponses.previsionBenefices = this.getInputValue('prevision-benefices', 'number');
        userResponses.preferenceRemuneration = this.getSelectedOptionValue('#section6 .option-btn[data-value^="dividendes"], #section6 .option-btn[data-value^="salaire"]');
    },
    
    // Méthodes utilitaires
    getSelectValue: function(id) {
        const select = document.getElementById(id);
        return select ? select.value : null;
    },
    
    getInputValue: function(id, type = 'string') {
        const input = document.getElementById(id);
        if (!input) return type === 'number' ? 0 : '';
        
        return type === 'number' ? parseFloat(input.value || 0) : input.value;
    },
    
    getSelectedOptionValue: function(selector) {
        const selected = document.querySelector(`${selector}.selected`);
        return selected ? selected.getAttribute('data-value') : null;
    }
};

// Extension du ResultsManager pour la comparaison en temps réel
if (typeof ResultsManager === 'undefined') {
    window.ResultsManager = {};
}

ResultsManager.generateQuickComparison = function() {
    // Récupérer la div pour la comparaison rapide
    const quickComparisonDiv = document.getElementById('quick-comparison');
    if (!quickComparisonDiv) return;
    
    // Collecter les données de toutes les sections visibles
    for (let i = 1; i <= FormManager.currentSection; i++) {
        if (typeof DataCollector[`collectSection${i}Data`] === 'function') {
            DataCollector[`collectSection${i}Data`]();
        }
    }
    
    // Formes juridiques à comparer en temps réel (les plus courantes)
    const quickForms = ['micro-entreprise', 'ei', 'eurl', 'sasu', 'sarl'];
    const formDetails = [];
    
    // Calculer un score simplifié pour chaque forme
    quickForms.forEach(formId => {
        if (typeof FormeJuridiqueDB === 'undefined' || !FormeJuridiqueDB.getById) return;
        
        const forme = FormeJuridiqueDB.getById(formId);
        if (!forme) return;
        
        // Vérifier les incompatibilités majeures
        let incompatible = false;
        if (typeof window.checkHardFails === 'function' && typeof window.hasHardFail === 'function') {
            incompatible = window.hasHardFail(formId, window.checkHardFails(userResponses));
        }
        
        formDetails.push({
            id: formId,
            nom: forme.nom,
            compatible: !incompatible,
            fiscalite: forme.fiscalite,
            regimeSocial: forme.regimeSocial,
            responsabilite: forme.responsabilite
        });
    });
    
    // Générer le HTML du tableau comparatif
    let html = `
    <h3 class="text-lg font-bold text-green-400 mb-3">Aperçu comparatif en temps réel</h3>
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-blue-900 bg-opacity-30">
                <th class="p-2 text-left">Forme juridique</th>
                <th class="p-2 text-center">Compatibilité</th>
                <th class="p-2 text-left">Fiscalité</th>
                <th class="p-2 text-left">Régime social</th>
                <th class="p-2 text-left">Responsabilité</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    formDetails.forEach(form => {
        html += `
        <tr class="${form.compatible ? '' : 'opacity-50'}">
            <td class="p-2 font-medium">${form.nom}</td>
            <td class="p-2 text-center">
                ${form.compatible 
                    ? '<i class="fas fa-check-circle text-green-400"></i>' 
                    : '<i class="fas fa-times-circle text-red-400"></i>'}
            </td>
            <td class="p-2">${form.fiscalite}</td>
            <td class="p-2">${form.regimeSocial}</td>
            <td class="p-2">${form.responsabilite.substring(0, 25)}...</td>
        </tr>
        `;
    });
    
    html += `
        </tbody>
    </table>
    <p class="text-xs mt-2 opacity-70">Ce tableau se met à jour automatiquement à chaque réponse.</p>
    `;
    
    quickComparisonDiv.innerHTML = html;
    quickComparisonDiv.style.display = 'block';
};

// Référence à la base de données des formes juridiques (définie dans types-entreprise.js)
// Ne pas dupliquer la base de données ici pour éviter les problèmes de mise à jour

// Fonctions utilitaires pour vérifier les incompatibilités (utilisées par ResultsManager.generateQuickComparison)
// Ces fonctions proviennent de types-entreprise.js mais doivent être accessibles ici

// Vérification des incompatibilités majeures (hardFails)
if (typeof window.checkHardFails === 'undefined') {
    window.checkHardFails = function(userResponses) {
        const fails = [];
        
        // Vérifier les seuils de CA pour la micro-entreprise
        if (userResponses.activiteType && userResponses.caYear1) {
            const seuilsMax = {
                'bic-vente': 203100,  // Nouveau seuil 2025
                'bic-service': 81500, // Nouveau seuil 2025
                'bnc': 81500,         // Nouveau seuil 2025
                'artisanale': 203100, // Nouveau seuil 2025
                'agricole': 95000     // Valeur de l'ancien code
            };
            
            const seuilMax = seuilsMax[userResponses.activiteType] || 0;
            
            if (userResponses.caYear1 > seuilMax) {
                fails.push({
                    formeId: 'micro-entreprise',
                    code: 'ca-depasse-seuil',
                    message: `CA prévu (${userResponses.caYear1.toLocaleString('fr-FR')}€) > seuil micro (${seuilMax.toLocaleString('fr-FR')}€)`,
                    details: 'Régime micro-entreprise impossible'
                });
            }
        }
        
        // Vérifier les incompatibilités avec les profils multi-associés
        if (userResponses.profilEntrepreneur === 'equipe' || userResponses.profilEntrepreneur === 'investisseurs') {
            ['micro-entreprise', 'ei', 'eurl', 'sasu'].forEach(formeId => {
                fails.push({
                    formeId: formeId,
                    code: 'structure-mono-associe',
                    message: 'Structure limitée à un seul associé',
                    details: 'Incompatible avec une équipe ou des investisseurs'
                });
            });
        }
        
        // Vérifier les incompatibilités avec activités réglementées
        if (userResponses.activiteReglementee) {
            fails.push({
                formeId: 'micro-entreprise',
                code: 'activite-reglementee',
                message: 'Peu adaptée aux activités réglementées',
                details: 'Limitations pour certaines professions réglementées'
            });
        }
        
        return fails;
    };
}

// Vérifier si une forme juridique a une incompatibilité majeure
if (typeof window.hasHardFail === 'undefined') {
    window.hasHardFail = function(formeId, failsList) {
        return failsList.some(fail => fail.formeId === formeId);
    };
}

// Mettre à jour les seuils fiscaux pour 2025
const seuils = {
    'bic-vente': 203100,  // Nouveau seuil 2025
    'bic-service': 81500, // Nouveau seuil 2025
    'bnc': 81500,         // Nouveau seuil 2025
    'artisanale': 203100, // Nouveau seuil 2025
    'agricole': 95000     // Valeur de l'ancien code
};

// Initialiser le gestionnaire de formulaire quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que userResponses existe
    if (typeof window.userResponses === 'undefined') {
        window.userResponses = {};
    }
    
    // Initialiser le gestionnaire de formulaire
    FormManager.init();
    
    // Afficher la première section
    FormManager.showSection(1);
});
