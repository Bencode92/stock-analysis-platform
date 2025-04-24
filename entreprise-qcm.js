/**
 * entreprise-qcm.js
 * Gestion du questionnaire interactif pour le choix de forme juridique d'entreprise
 * Version restructurée - Avril 2025
 */

// Éviter les initialisations multiples
window.entrepriseQCMInitialized = window.entrepriseQCMInitialized || false;

// Constantes fiscales (France 2024-2025)
const TRANCHES_IMPOT = [
    { min: 0, max: 11294, taux: 0 },
    { min: 11294, max: 28787, taux: 0.11 },
    { min: 28787, max: 82341, taux: 0.30 },
    { min: 82341, max: 177106, taux: 0.41 },
    { min: 177106, max: Infinity, taux: 0.45 }
];

// Seuils fiscaux pour les différents régimes
const SEUILS_FISCAUX = {
    'bic-vente': 203100,  // Nouveau seuil 2025
    'bic-service': 81500, // Nouveau seuil 2025
    'bnc': 81500,         // Nouveau seuil 2025
    'artisanale': 203100, // Nouveau seuil 2025
    'agricole': 95000     // Valeur de l'ancien code
};

// Exposer les constantes globalement pour que types-entreprise.js puisse y accéder
window.TRANCHES_IMPOT = TRANCHES_IMPOT;
window.SEUILS_FISCAUX = SEUILS_FISCAUX;

// Assurons-nous que le StorageManager existe
if (typeof window.StorageManager === 'undefined') {
    window.StorageManager = {
        saveProgress: function() {
            // Sauvegarde les réponses dans localStorage
            localStorage.setItem('entreprise-form-progress', JSON.stringify(window.userResponses));
        },
        loadProgress: function() {
            // Charge les réponses depuis localStorage
            const savedData = localStorage.getItem('entreprise-form-progress');
            if (savedData) {
                window.userResponses = JSON.parse(savedData);
                return true;
            }
            return false;
        }
    };
}

// Vérification des incompatibilités majeures (hardFails)
window.checkHardFails = function(userResponses) {
    const fails = [];
    
    // Vérifier les seuils de CA pour la micro-entreprise
    if (userResponses.activiteType && userResponses.caYear1) {
        const seuilMax = SEUILS_FISCAUX[userResponses.activiteType] || 0;
        
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

// Vérifier si une forme juridique a une incompatibilité majeure
window.hasHardFail = function(formeId, failsList) {
    return failsList.some(fail => fail.formeId === formeId);
};

// Utilitaires pour les calculs fiscaux, partagés entre les modules
window.UtilitairesFiscaux = {
    // Calcule le taux marginal d'imposition pour un revenu donné
    calculerTauxMarginal: function(revenuImposable) {
        for (let i = TRANCHES_IMPOT.length - 1; i >= 0; i--) {
            if (revenuImposable > TRANCHES_IMPOT[i].min) {
                return TRANCHES_IMPOT[i].taux * 100;
            }
        }
        return 0;
    },
    
    // Formate un montant en euros
    formaterMontant: function(montant, decimales = 0) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: decimales
        }).format(montant);
    },
    
    // Calcule l'impôt sur le revenu selon le barème progressif
    calculerImpot: function(revenuImposable) {
        let impot = 0;
        
        for (let i = 1; i < TRANCHES_IMPOT.length; i++) {
            const tranche = TRANCHES_IMPOT[i];
            const tranchePrecedente = TRANCHES_IMPOT[i-1];
            
            if (revenuImposable > tranchePrecedente.max) {
                const montantImposableDansTranche = Math.min(revenuImposable, tranche.max) - tranchePrecedente.max;
                impot += montantImposableDansTranche * tranche.taux;
            }
        }
        
        return Math.round(impot * 100) / 100;
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
    
    // Section 6: Fiscalité (si présente)
    collectSection6Data: function() {
        if (document.getElementById('section6')) {
            userResponses.optimisationFiscale = this.getSelectedOptionValue('#section6 .option-btn[data-value^="optimisation"]');
            userResponses.importanceProtectionPatrimoine = this.getSelectValue('importance-protection-patrimoine');
            userResponses.previsionBenefices = this.getInputValue('prevision-benefices', 'number');
            userResponses.preferenceRemuneration = this.getSelectedOptionValue('#section6 .option-btn[data-value^="dividendes"], #section6 .option-btn[data-value^="salaire"]');
        }
    },
    
    // Collecte toutes les données du formulaire
    collectAllData: function() {
        for (let i = 1; i <= 6; i++) {
            if (typeof this[`collectSection${i}Data`] === 'function') {
                this[`collectSection${i}Data`]();
            }
        }
        return window.userResponses;
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
if (typeof window.ResultsManager === 'undefined') {
    window.ResultsManager = {};
}

// API publique pour types-entreprise.js
window.EntrepriseQCM = {
    collectUserData: function() {
        return DataCollector.collectAllData();
    },
    validateForm: function() {
        return true; // Let types-entreprise.js handle validation
    },
    checkCompatibility: window.checkHardFails,
    getSelectedValue: function(selector) {
        return DataCollector.getSelectedOptionValue(selector);
    },
    utilFiscaux: window.UtilitairesFiscaux
};

// Exposer DataCollector globalement
window.DataCollector = DataCollector;

// IMPORTANT: Ce fichier ne gère plus la navigation - utilisez types-entreprise.js
console.log("entreprise-qcm.js chargé - Fonctions fiscales et de collecte de données disponibles");
