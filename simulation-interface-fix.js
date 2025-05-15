/**
 * Ce fichier contient la correction pour la fonction collecterDonneesFormulaire
 * qui provoque l'erreur "Cannot read properties of null"
 * 
 * Remplacez la fonction existante dans simulation-interface.js par cette version corrigée
 */

/**
 * Récupère toutes les valeurs du formulaire de façon sécurisée
 * @returns {Object} - Données du formulaire
 */
function collecterDonneesFormulaire() {
    // Fonction utilitaire pour récupérer une valeur de façon sécurisée
    const getValueSafely = (id, defaultValue = "") => {
        const element = document.getElementById(id);
        return element ? element.value : defaultValue;
    };
    
    // Fonction utilitaire pour récupérer l'état d'une case à cocher
    const getCheckedSafely = (id, defaultValue = false) => {
        const element = document.getElementById(id);
        return element ? element.checked : defaultValue;
    };
    
    const formData = {
        // Paramètres de base
        apport: getValueSafely('apport'),
        surface: getValueSafely('surface'),
        taux: getValueSafely('taux'),
        duree: getValueSafely('duree'),
        
        // Ajouter le paramètre d'apport minimum
        pourcentApportMin: getValueSafely('pourcent-apport', 10),
        
        // Paramètres de surface
        surfaceMax: getValueSafely('surface-max', 120),
        surfaceMin: getValueSafely('surface-min', 20),
        pasSurface: getValueSafely('pas-surface', 1),
        
        // Paramètres communs
        fraisBancairesDossier: getValueSafely('frais-bancaires-dossier'),
        fraisBancairesCompte: getValueSafely('frais-bancaires-compte'),
        fraisGarantie: getValueSafely('frais-garantie'),
        taxeFonciere: getValueSafely('taxe-fonciere'),
        vacanceLocative: getValueSafely('vacance-locative'),
        loyerM2: getValueSafely('loyer-m2'),
        travauxM2: getValueSafely('travaux-m2'),
        prixM2: getValueSafely('prix-m2-marche'),
        
        // Paramètres fiscaux (s'ils existent)
        tauxPrelevementsSociaux: getValueSafely('taux-prelevements-sociaux', 17.2),
        tauxMarginalImpot: getValueSafely('taux-marginal-impot', 30),
        deficitFoncier: getCheckedSafely('deficit-foncier', true),
        
        // Paramètres entretien et charges (s'ils existent)
        entretienAnnuel: getValueSafely('entretien-annuel', 0.5),
        assurancePNO: getValueSafely('assurance-pno', 250),
        chargesNonRecuperables: getValueSafely('charges-non-recuperables', 10),
        
        // Paramètres achat classique
        publiciteFonciere: getValueSafely('publicite-fonciere'),
        droitsMutation: getValueSafely('droits-mutation'),
        securiteImmobiliere: getValueSafely('securite-immobiliere'),
        emolumentsVente: getValueSafely('emoluments-vente'),
        formalites: getValueSafely('formalites'),
        debours: getValueSafely('debours'),
        commissionImmo: getValueSafely('commission-immo'),
        
        // Paramètres vente aux enchères
        droitsEnregistrement: getValueSafely('droits-enregistrement'),
        coefMutation: getValueSafely('coef-mutation'),
        emolumentsPoursuivant1: getValueSafely('emoluments-poursuivant-1'),
        emolumentsPoursuivant2: getValueSafely('emoluments-poursuivant-2'),
        emolumentsPoursuivant3: getValueSafely('emoluments-poursuivant-3'),
        emolumentsPoursuivant4: getValueSafely('emoluments-poursuivant-4'),
        honorairesAvocatCoef: getValueSafely('honoraires-avocat-coef'),
        honorairesAvocatTVA: getValueSafely('honoraires-avocat-tva'),
        publiciteFonciereEncheres: getValueSafely('publicite-fonciere-encheres'),
        fraisFixes: getValueSafely('frais-fixes'),
        avocatEnchere: getValueSafely('avocat-enchere'),
        suiviDossier: getValueSafely('suivi-dossier'),
        cautionPourcent: getValueSafely('caution-pourcent'),
        cautionRestituee: getCheckedSafely('caution-restituee')
    };
    
    // Mode de calcul des travaux
    const travauxModeElem = document.querySelector('input[name="travaux-mode"]:checked');
    if (travauxModeElem) {
        formData.useFixedTravauxPercentage = travauxModeElem.value === 'percentage';
    }
    
    // Régime fiscal
    const regimeFiscalElem = document.getElementById('regime-fiscal');
    if (regimeFiscalElem) {
        formData.regimeFiscal = regimeFiscalElem.value;
    }
    
    console.log("Données du formulaire collectées avec succès:", formData);
    return formData;
}
