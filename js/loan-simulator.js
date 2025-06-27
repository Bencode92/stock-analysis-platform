// Fichier JS pour simulateur de dette avec options dynamiques et PTZ intégré
class LoanSimulator {
    constructor({ 
        capital, 
        tauxAnnuel, 
        dureeMois, 
        assuranceAnnuelle = 0, 
        indemnitesMois = 12,
        fraisDossier = 2000,
        fraisTenueCompte = 710,
        fraisGarantie = null,
        typeGarantie = 'caution',
        assuranceSurCapitalInitial = false
    }) {
        this.capital = capital;
        this.tauxMensuel = tauxAnnuel / 100 / 12;
        this.dureeMois = dureeMois;
        this.assuranceMensuelle = assuranceAnnuelle / 100 / 12;
        this.indemnitesMois = indemnitesMois;
        this.assuranceSurCapitalInitial = assuranceSurCapitalInitial;

        // Frais annexes
        this.fraisDossier = fraisDossier;
        this.fraisTenueCompte = fraisTenueCompte;
        
        // Calcul des frais de garantie selon le type
        let fraisCalcules;
        switch(typeGarantie) {
            case 'hypotheque':
                fraisCalcules = Math.max(capital * 0.015, 800); // Min 800€
                break;
            case 'ppd':
                fraisCalcules = Math.max(capital * 0.01, 500); // Min 500€
                break;
            case 'caution':
            default:
                fraisCalcules = capital * 0.013709; // Crédit Logement
        }
        this.fraisGarantie = fraisGarantie !== null ? fraisGarantie : fraisCalcules;
    }
    
    calculerMensualite() {
        const { capital, tauxMensuel, dureeMois } = this;
        return capital * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMois));
    }
    
    tableauAmortissement({ 
        remboursementAnticipe = 0, 
        moisAnticipe = null, 
        nouveauTaux = null,
        moisRenegociation = null, // Nouveau paramètre pour le mois de renégociation
        modeRemboursement = 'duree', // 'duree' ou 'mensualite'
        moisAReduire = 0, // Nombre de mois à réduire directement
        // Nouveau paramètre pour gérer plusieurs remboursements anticipés
        remboursementsAnticipes = [],
        // Nouveau paramètre pour rendre la renégociation optionnelle
        appliquerRenegociation = true
    }) {
        let mensualite = this.calculerMensualite();
        let capitalRestant = this.capital;
        let tableau = [];
        let tauxMensuel = this.tauxMensuel;
        let assuranceMensuelle = this.assuranceMensuelle;
        let totalInterets = 0;
        let totalAssurance = 0;
        let totalCapitalAmorti = 0;
        let capitalInitial = this.capital;
        let indemnites = 0;
        
        // Gestion de la rétrocompatibilité : si remboursementAnticipe et moisAnticipe sont fournis,
        // nous les ajoutons à remboursementsAnticipes s'ils ne sont pas déjà inclus
        if (remboursementAnticipe > 0 && moisAnticipe !== null) {
            // On vérifie si un remboursement à ce mois existe déjà
            const remboursementExistant = remboursementsAnticipes.find(r => r.mois === moisAnticipe);
            if (!remboursementExistant) {
                remboursementsAnticipes.push({
                    montant: remboursementAnticipe,
                    mois: moisAnticipe,
                    nouveauTaux: nouveauTaux
                });
            }
        }
        
        // ✅ CORRECTION APPLIQUÉE : Supprimer la double déduction
        // Définir la durée finale en fonction du mode (valeur initiale simple)
        let dureeFinale = this.dureeMois;
        
        // ❌ SUPPRIMÉ : Le bloc de pré-déduction totalReductions qui causait la double déduction
        // La logique de réduction de durée sera gérée uniquement dans la boucle
        
        // Suivi avant remboursement anticipé
        let interetsAvantRembours = 0;
        let mensualitesAvantRembours = 0;
        
        for (let mois = 1; mois <= dureeFinale; mois++) {
            // Vérifier si on applique le nouveau taux de renégociation à ce mois
            if (appliquerRenegociation && moisRenegociation !== null && mois === moisRenegociation && nouveauTaux !== null) {
                tauxMensuel = nouveauTaux / 100 / 12;
                
                // Recalculer la mensualité avec le nouveau taux
                mensualite = capitalRestant * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -(dureeFinale - mois + 1)));
            }
            
            let interets = capitalRestant * tauxMensuel;
            
            // Calcul de l'assurance selon le mode (capital initial ou restant dû)
            let assurance = this.assuranceSurCapitalInitial ? 
                capitalInitial * assuranceMensuelle : 
                capitalRestant * assuranceMensuelle;
            
            let capitalAmorti = mensualite - interets;
            
            // Calculs avant remboursement anticipé
            if (remboursementsAnticipes.some(r => r.mois > mois)) {
                interetsAvantRembours += interets;
                mensualitesAvantRembours += (mensualite + assurance);
            }
            
            // Vérifier s'il y a un remboursement anticipé pour ce mois
            const remboursementCourant = remboursementsAnticipes.find(r => r.mois === mois);
            
            if (remboursementCourant) {
                // ✅ CORRECTION MAINTENUE : Gestion du cas montant = 0 pour raccourcissement durée
                // ► Cas 1 : simple raccourcissement de durée (montant = 0)
                if (remboursementCourant.montant === 0 &&
                    modeRemboursement === 'duree' &&
                    remboursementCourant.moisAReduire > 0) {

                    // ✅ UNIQUE ENDROIT de modification de dureeFinale
                    // 1) on réduit la durée restante
                    const resteAvant = dureeFinale - mois + 1;
                    const resteApres = Math.max(1, resteAvant - remboursementCourant.moisAReduire);
                    dureeFinale -= remboursementCourant.moisAReduire;

                    // 2) on recalcule la nouvelle mensualité (plus élevée)
                    mensualite = capitalRestant * tauxMensuel /
                                 (1 - Math.pow(1 + tauxMensuel, -resteApres));

                    // 3) on mémorise pour le tableau (facultatif)
                    capitalAmorti = 0;             // pas de versement ponctuel
                }
                /* Cas 2 : remboursement partiel/classique */
                else if (remboursementCourant.montant > 0) {
                    // Calcul des indemnités de remboursement anticipé
                    const indemniteStandard = remboursementCourant.montant * tauxMensuel * this.indemnitesMois;
                    const plafond3Pourcent = remboursementCourant.montant * 0.03;
                    const plafond6Mois = mensualite * 6;
                    const indemnitesCourantes = Math.min(indemniteStandard, Math.min(plafond3Pourcent, plafond6Mois));
                    indemnites += indemnitesCourantes;
                    
                    // Vérification pour remboursement total
                    if (capitalRestant <= remboursementCourant.montant) {
                        // C'est un remboursement total
                        tableau.push({
                            mois,
                            interets,
                            capitalAmorti: capitalRestant,
                            assurance,
                            mensualite: capitalRestant + interets + assurance,
                            capitalRestant: 0,
                            remboursementAnticipe: capitalRestant,
                            indemnites: indemnitesCourantes
                        });
                        
                        totalInterets += interets;
                        totalAssurance += assurance;
                        totalCapitalAmorti += capitalRestant;
                        
                        capitalRestant = 0;
                        break; // On sort de la boucle car le prêt est soldé
                    } else {
                        // Remboursement partiel
                        capitalRestant -= remboursementCourant.montant;
                        
                        // Appliquer le nouveau taux si spécifié
                        if (remboursementCourant.nouveauTaux !== null && remboursementCourant.nouveauTaux !== undefined) {
                            tauxMensuel = remboursementCourant.nouveauTaux / 100 / 12;
                        }
                        
                        // Recalculer la mensualité selon le mode
                        if (modeRemboursement === 'mensualite') {
                            // Mode mensualité: on garde la même durée mais on réduit la mensualité
                            mensualite = capitalRestant * tauxMensuel / 
                                (1 - Math.pow(1 + tauxMensuel, -(this.dureeMois - mois + 1)));
                        }
                        // Pour le mode durée, on garde la même mensualité
                    }
                }
            }
            
            capitalRestant -= capitalAmorti;
            if (capitalRestant < 0) capitalRestant = 0;
            
            totalInterets += interets;
            totalAssurance += assurance;
            totalCapitalAmorti += capitalAmorti;
            
            tableau.push({
                mois,
                interets: interets,
                capitalAmorti,
                assurance,
                mensualite: mensualite + assurance,
                capitalRestant,
                remboursementAnticipe: remboursementCourant ? remboursementCourant.montant : 0,
                indemnites: remboursementCourant ? (indemnites / remboursementsAnticipes.length) : 0  // Répartition des indemnités
            });
            
            if (capitalRestant <= 0) break;
        }
        
        // MODIFICATION : Ne calculer les indemnités que s'il y a effectivement des remboursements anticipés
        // Indemnités pour le mode durée si aucun remboursement anticipé n'est défini
        if (modeRemboursement === 'duree' && remboursementsAnticipes.length > 0 && indemnites === 0) {
            // Pour le mode durée, estimer le capital qui serait remboursé pour les mois réduits
            // pour calculer les indemnités
            const capitalEstime = mensualite * moisAReduire * 0.8; // Estimation approximative (80% de la mensualité * nb mois)
            const indemniteStandard = capitalEstime * tauxMensuel * this.indemnitesMois;
            const plafond3Pourcent = capitalEstime * 0.03;
            const plafond6Mois = mensualite * 6;
            indemnites = Math.min(indemniteStandard, Math.min(plafond3Pourcent, plafond6Mois));
        }
        
        // Calcul des économies réalisées avec le remboursement anticipé
        const dureeInitiale = this.dureeMois;
        const dureeReelle = tableau.length;
        const mensualiteInitiale = this.calculerMensualite() + 
            (this.assuranceSurCapitalInitial ? this.capital * this.assuranceMensuelle : this.capital * this.assuranceMensuelle);
        const economiesMensualites = (dureeInitiale - dureeReelle) * mensualiteInitiale;
        const economiesInterets = (capitalInitial * this.tauxMensuel * dureeInitiale) - totalInterets;
        
        // Calcul du TAEG approximatif (sans les frais annexes pour l'instant)
        const montantTotal = tableau.reduce((sum, l) => sum + l.mensualite, 0);
        const tauxEffectifAnnuel = ((Math.pow((montantTotal / this.capital), (12 / dureeReelle)) - 1) * 12) * 100;
        
        // Total des frais annexes
        const totalFrais = this.fraisDossier + this.fraisTenueCompte + this.fraisGarantie;
        
        // Coût global (tout compris)
        const coutGlobalTotal = montantTotal + indemnites + totalFrais;
        
        // Vérification si le prêt est soldé avant terme
        const pretSoldeAvantTerme = dureeReelle < dureeInitiale;
        const gainTemps = dureeInitiale - dureeReelle;
        
        return {
            tableau,
            mensualiteInitiale,
            indemnites,
            totalInterets,
            totalAssurance,
            totalCapitalAmorti,
            capitalInitial,
            totalPaye: montantTotal + indemnites,
            dureeReelle,
            dureeInitiale,
            economiesMensualites,
            economiesInterets,
            interetsAvantRembours,
            mensualitesAvantRembours,
            taeg: tauxEffectifAnnuel,
            totalFrais,
            coutGlobalTotal,
            moisAReduire,
            pretSoldeAvantTerme,
            gainTemps,
            remboursementsAnticipes,
            moisRenegociation, // Ajout du mois de renégociation dans le résultat
            appliquerRenegociation // Ajout de l'état de la renégociation dans le résultat
        };
    }
}

// Formater les nombres en euros
function formatMontant(montant) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
}

// 🎨 NOUVELLE FONCTION HELPER POUR FORMATER L'AFFICHAGE DES REMBOURSEMENTS
function repaymentLabel(r) {
    if (r.montant && r.montant > 0) {
        return {
            html: `<i class="fas fa-euro-sign mr-1 text-emerald-400"></i>${formatMontant(r.montant)}`,
            cls: 'text-emerald-300'
        };
    }
    return {
        html: `<i class="fas fa-clock mr-1 text-amber-400"></i>– ${r.moisAReduire} mois`,
        cls: 'text-amber-300'
    };
}

// Mise à jour des valeurs des sliders
document.addEventListener('DOMContentLoaded', function() {
    // Références aux éléments HTML
    const interestRateSlider = document.getElementById('interest-rate-slider');
    const interestRateValue = document.getElementById('interest-rate-value');
    const loanDurationSlider = document.getElementById('loan-duration-slider');
    const loanDurationValue = document.getElementById('loan-duration-value');
    const insuranceRateSlider = document.getElementById('insurance-rate-slider');
    const insuranceRateValue = document.getElementById('insurance-rate-value');
    const newInterestRateSlider = document.getElementById('new-interest-rate-slider');
    const newInterestRateValue = document.getElementById('new-interest-rate-value');
    const calculateLoanButton = document.getElementById('calculate-loan-button');
    const exportPdfButton = document.getElementById('export-pdf');
    
    // Nouvelles références pour le mois de renégociation
    const renegotiationMonthSlider = document.getElementById('renegotiation-month-slider');
    const renegotiationMonthValue = document.getElementById('renegotiation-month-value');
    
    // Nouvelles références pour les sections de mode de remboursement
    const modeDureeBtn = document.getElementById('mode-duree');
    const modeMensualiteBtn = document.getElementById('mode-mensualite');
    const sectionDuree = document.getElementById('section-reduire-duree');
    const sectionMensualite = document.getElementById('section-reduire-mensualite');
    
    // Nouvelle référence pour la case "Appliquer la renégociation"
    const applyRenegotiationCheckbox = document.getElementById('apply-renegotiation');
    
    // Nouvelle référence pour les sliders de chaque mode
    const earlyRepaymentMonthSliderDuree = document.getElementById('early-repayment-month-slider-duree');
    const earlyRepaymentMonthValueDuree = document.getElementById('early-repayment-month-value-duree');
    const penaltyMonthsSliderDuree = document.getElementById('penalty-months-slider-duree');
    const penaltyMonthsValueDuree = document.getElementById('penalty-months-value-duree');
    
    const earlyRepaymentMonthSliderMensualite = document.getElementById('early-repayment-month-slider-mensualite');
    const earlyRepaymentMonthValueMensualite = document.getElementById('early-repayment-month-value-mensualite');
    const penaltyMonthsSliderMensualite = document.getElementById('penalty-months-slider-mensualite');
    const penaltyMonthsValueMensualite = document.getElementById('penalty-months-value-mensualite');

    // 🚀 NOUVEAU : Classes Tailwind pour gestion moderne des boutons
    const ACTIVE = ['text-green-400', 'bg-green-900', 'bg-opacity-30', 'transition-colors', 'duration-200'];
    const INACTIVE = ['text-white', 'transition-colors', 'duration-200'];

    /**
     * Passe un bouton en mode « actif » et l'autre en mode « inactif ».
     * @param {HTMLElement} on  – bouton à activer
     * @param {HTMLElement} off – bouton à désactiver
     */
    function switchModeButton(on, off) {
        // État actif
        on.classList.add(...ACTIVE);
        on.classList.remove(...INACTIVE);
        on.setAttribute('aria-pressed', 'true');

        // État inactif  
        off.classList.add(...INACTIVE);
        off.classList.remove(...ACTIVE);
        off.setAttribute('aria-pressed', 'false');
    }

    // ==========================================
    // 🚀 NOUVEAU : GESTION PTZ INTÉGRÉE
    // ==========================================
    
    // Variables PTZ avec debouncing
    let ptzCalculationTimeout;
    const enablePtzCheckbox = document.getElementById('enable-ptz');
    const ptzFields = document.getElementById('ptz-fields');
    const ptzDurationSlider = document.getElementById('ptz-duration-slider');
    const ptzDurationValue = document.getElementById('ptz-duration-value');
    const ptzAmountInput = document.getElementById('ptz-amount');

    // Fonction debounced pour recalculer
    function debouncedCalculateLoan() {
        clearTimeout(ptzCalculationTimeout);
        ptzCalculationTimeout = setTimeout(() => {
            if (document.getElementById('monthly-payment').textContent !== '0 €') {
                calculateLoan();
            }
        }, 300); // 300ms de délai
    }

    // Toggle des champs PTZ avec animation
    if (enablePtzCheckbox && ptzFields) {
        enablePtzCheckbox.addEventListener('change', function() {
            if (this.checked) {
                // Ouvrir avec animation
                ptzFields.classList.remove('hidden');
                ptzFields.style.maxHeight = '400px';
                ptzFields.style.opacity = '1';
                
                // Synchroniser durée max PTZ avec prêt principal
                const mainLoanDuration = parseInt(loanDurationSlider.value);
                ptzDurationSlider.max = mainLoanDuration;
                if (parseInt(ptzDurationSlider.value) > mainLoanDuration) {
                    ptzDurationSlider.value = mainLoanDuration;
                    ptzDurationValue.textContent = `${mainLoanDuration} ans`;
                }
            } else {
                // Fermer avec animation
                ptzFields.style.maxHeight = '0';
                ptzFields.style.opacity = '0';
                setTimeout(() => {
                    ptzFields.classList.add('hidden');
                }, 300);
            }
            
            debouncedCalculateLoan();
        });
    }

    // Slider durée PTZ
    if (ptzDurationSlider && ptzDurationValue) {
        ptzDurationSlider.addEventListener('input', function() {
            ptzDurationValue.textContent = `${this.value} ans`;
            debouncedCalculateLoan();
        });
    }

    // Input montant PTZ avec validation
    if (ptzAmountInput) {
        ptzAmountInput.addEventListener('input', function() {
            // Validation en temps réel
            validatePtzAmount();
            debouncedCalculateLoan();
        });
    }

    // Fonction de validation PTZ
    function validatePtzAmount() {
        const loanAmount = parseFloat(document.getElementById('loan-amount').value || 0);
        const ptzAmount = parseFloat(ptzAmountInput.value || 0);
        const validationMessage = document.getElementById('ptz-validation-message');
        
        if (ptzAmount > 0 && loanAmount > 0) {
            const maxPTZ = loanAmount * 0.4;
            const percentage = (ptzAmount / loanAmount * 100).toFixed(1);
            
            if (ptzAmount > maxPTZ) {
                validationMessage.textContent = `⚠️ Maximum autorisé: ${formatMontant(maxPTZ)} (40%)`;
                validationMessage.classList.remove('hidden');
                ptzAmountInput.classList.add('border-red-500');
                return false;
            } else if (ptzAmount > maxPTZ * 0.8) {
                validationMessage.textContent = `ℹ️ ${percentage}% du coût total (max 40%)`;
                validationMessage.classList.remove('hidden');
                validationMessage.classList.remove('text-red-400');
                validationMessage.classList.add('text-yellow-400');
                ptzAmountInput.classList.remove('border-red-500');
                return true;
            }
        }
        
        // Tout est OK
        validationMessage.classList.add('hidden');
        ptzAmountInput.classList.remove('border-red-500');
        return true;
    }

    // ==========================================
    // FIN SECTION PTZ
    // ==========================================

    // Fonction pour mettre à jour les valeurs maximales des sliders en fonction de la durée du prêt
    function updateSliderMaxValues() {
        try {
            const loanDurationYears = parseInt(loanDurationSlider.value);
            const loanDurationMonths = loanDurationYears * 12;
            
            // Mettre à jour le max du slider de mois de renégociation
            if (renegotiationMonthSlider) {
                renegotiationMonthSlider.max = loanDurationMonths;
                // Ajuster la valeur si elle dépasse le nouveau max
                if (parseInt(renegotiationMonthSlider.value) > loanDurationMonths) {
                    renegotiationMonthSlider.value = loanDurationMonths;
                    renegotiationMonthValue.textContent = loanDurationMonths;
                }
            }
            
            // Mettre à jour le max des sliders de mois de remboursement anticipé
            if (earlyRepaymentMonthSliderDuree) {
                earlyRepaymentMonthSliderDuree.max = loanDurationMonths;
                // Ajuster la valeur si elle dépasse le nouveau max
                if (parseInt(earlyRepaymentMonthSliderDuree.value) > loanDurationMonths) {
                    earlyRepaymentMonthSliderDuree.value = loanDurationMonths;
                    earlyRepaymentMonthValueDuree.textContent = loanDurationMonths;
                }
            }
            
            if (earlyRepaymentMonthSliderMensualite) {
                earlyRepaymentMonthSliderMensualite.max = loanDurationMonths;
                // Ajuster la valeur si elle dépasse le nouveau max
                if (parseInt(earlyRepaymentMonthSliderMensualite.value) > loanDurationMonths) {
                    earlyRepaymentMonthSliderMensualite.value = loanDurationMonths;
                    earlyRepaymentMonthValueMensualite.textContent = loanDurationMonths;
                }
            }

            // 🚀 NOUVEAU : Synchroniser durée max PTZ avec prêt principal
            if (enablePtzCheckbox?.checked && ptzDurationSlider) {
                ptzDurationSlider.max = loanDurationYears;
                if (parseInt(ptzDurationSlider.value) > loanDurationYears) {
                    ptzDurationSlider.value = loanDurationYears;
                    ptzDurationValue.textContent = `${loanDurationYears} ans`;
                }
            }
            
            console.log(`Valeurs max des sliders mises à jour : ${loanDurationMonths} mois`);
        } catch (error) {
            console.error("Erreur lors de la mise à jour des valeurs max des sliders:", error);
        }
    }

    // Mise à jour des affichages des sliders
    if (interestRateSlider && interestRateValue) {
        interestRateSlider.addEventListener('input', function() {
            interestRateValue.textContent = `${this.value}%`;
        });
    }
    
    if (loanDurationSlider && loanDurationValue) {
        loanDurationSlider.addEventListener('input', function() {
            loanDurationValue.textContent = `${this.value} ans`;
            // Mettre à jour les max des sliders quand la durée change
            updateSliderMaxValues();
        });
    }
    
    if (insuranceRateSlider && insuranceRateValue) {
        insuranceRateSlider.addEventListener('input', function() {
            insuranceRateValue.textContent = `${this.value}%`;
        });
    }
    
    // Gestion du slider du mois de renégociation
    if (renegotiationMonthSlider && renegotiationMonthValue) {
        renegotiationMonthSlider.addEventListener('input', function() {
            renegotiationMonthValue.textContent = this.value;
        });
    }
    
    // Gestion des sliders pour mode "durée"
    if (earlyRepaymentMonthSliderDuree && earlyRepaymentMonthValueDuree) {
        earlyRepaymentMonthSliderDuree.addEventListener('input', function() {
            earlyRepaymentMonthValueDuree.textContent = this.value;
        });
    }
    
    if (penaltyMonthsSliderDuree && penaltyMonthsValueDuree) {
        penaltyMonthsSliderDuree.addEventListener('input', function() {
            penaltyMonthsValueDuree.textContent = `${this.value} mois`;
        });
    }
    
    // Gestion des sliders pour mode "mensualité"
    if (earlyRepaymentMonthSliderMensualite && earlyRepaymentMonthValueMensualite) {
        earlyRepaymentMonthSliderMensualite.addEventListener('input', function() {
            earlyRepaymentMonthValueMensualite.textContent = this.value;
        });
    }
    
    if (penaltyMonthsSliderMensualite && penaltyMonthsValueMensualite) {
        penaltyMonthsSliderMensualite.addEventListener('input', function() {
            penaltyMonthsValueMensualite.textContent = `${this.value} mois`;
        });
    }
    
    if (newInterestRateSlider && newInterestRateValue) {
        newInterestRateSlider.addEventListener('input', function() {
            newInterestRateValue.textContent = `${this.value}%`;
        });
    }
    
    // 🚀 NOUVELLE GESTION MODERNE DES BOUTONS DE MODE
    if (modeDureeBtn && modeMensualiteBtn && sectionDuree && sectionMensualite) {

        // ► « Réduire la durée »
        modeDureeBtn.addEventListener('click', () => {
            document.getElementById('remboursement-mode').value = 'duree';
            switchModeButton(modeDureeBtn, modeMensualiteBtn);

            sectionDuree.classList.remove('hidden');
            sectionMensualite.classList.add('hidden');
        });

        // ► « Réduire la mensualité »
        modeMensualiteBtn.addEventListener('click', () => {
            document.getElementById('remboursement-mode').value = 'mensualite';
            switchModeButton(modeMensualiteBtn, modeDureeBtn);

            sectionMensualite.classList.remove('hidden');
            sectionDuree.classList.add('hidden');
        });

        // État initial (facultatif : au chargement de la page)
        switchModeButton(modeDureeBtn, modeMensualiteBtn);
    }
    
    // Ajout d'un écouteur pour la case à cocher "Appliquer la renégociation"
    if (applyRenegotiationCheckbox) {
        applyRenegotiationCheckbox.addEventListener('change', function() {
            // Recalculer lorsque la case est cochée/décochée
            calculateLoan();
        });
    }

    // Fonction pour calculer et afficher les résultats
    function calculateLoan() {
        try {
            console.log("Début du calcul du prêt...");
            
            const loanAmount = parseFloat(document.getElementById('loan-amount').value);
            const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
            const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
            const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
            const newInterestRate = parseFloat(document.getElementById('new-interest-rate-slider').value);
            const renegotiationMonth = parseInt(document.getElementById('renegotiation-month-slider').value);
            
            // Récupérer l'état de la case à cocher "Appliquer la renégociation"
            const applyRenegotiation = document.getElementById('apply-renegotiation')?.checked || false;
            
            // ==========================================
            // 🚀 NOUVEAU : GESTION PTZ AVEC VALIDATION RENFORCÉE
            // ==========================================
            const enablePTZ = document.getElementById('enable-ptz')?.checked || false;
            let ptzAmount = 0;
            let ptzDurationYears = 0;
            let ptzDurationMonths = 0;
            let mensualitePTZ = 0;
            let ptzValidationError = null;

            if (enablePTZ) {
                ptzAmount = parseFloat(document.getElementById('ptz-amount')?.value || 0);
                ptzDurationYears = parseInt(document.getElementById('ptz-duration-slider')?.value || 20);
                ptzDurationMonths = ptzDurationYears * 12;
                
                // Validations
                if (ptzAmount > 0) {
                    const maxPTZ = loanAmount * 0.4;
                    if (ptzAmount > maxPTZ) {
                        ptzValidationError = `Le PTZ ne peut dépasser 40% du coût total (maximum: ${formatMontant(maxPTZ)})`;
                    } else if (ptzDurationYears > loanDurationYears) {
                        ptzValidationError = `La durée du PTZ ne peut dépasser celle du prêt principal (${loanDurationYears} ans)`;
                    } else {
                        // Calcul mensualité PTZ (capital seulement, pas d'intérêts)
                        mensualitePTZ = ptzAmount / ptzDurationMonths;
                    }
                }
            }

            // Arrêter si erreur PTZ
            if (ptzValidationError) {
                alert(`⚠️ Erreur PTZ: ${ptzValidationError}`);
                return;
            }

            console.log('PTZ activé:', enablePTZ, 'Montant:', ptzAmount, 'Mensualité PTZ:', mensualitePTZ);
            // ==========================================
            // FIN SECTION PTZ CALCULS
            // ==========================================
            
            // Récupérer les nouveaux paramètres
            const fraisDossier = parseFloat(document.getElementById('frais-dossier')?.value || 2000);
            const fraisTenueCompte = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710);
            
            // MODIFICATION: Toujours recalculer les frais de garantie estimés
            const fraisGarantieInput = document.getElementById('frais-garantie');
            let fraisGarantie = null;
            if (fraisGarantieInput) {
                // Calculer automatiquement à chaque fois
                fraisGarantie = Math.round(loanAmount * 0.013709);
                // Mettre à jour la valeur dans le champ
                fraisGarantieInput.value = fraisGarantie;
            }
            
            const typeGarantie = document.getElementById('type-garantie')?.value || 'caution';
            const assuranceSurCapitalInitial = document.getElementById('assurance-capital-initial')?.checked || false;
            
            // Récupérer le mode de remboursement (durée ou mensualité)
            const modeRemboursement = document.getElementById('remboursement-mode')?.value || 'duree';
            
            // IMPORTANT: utiliser les remboursements stockés au lieu de créer un nouveau tableau vide
            // Cette ligne est la modification principale pour utiliser les remboursements multiples
            const remboursementsAnticipes = window.storedRepayments || [];
            
            console.log("Remboursements anticipés:", remboursementsAnticipes);
            console.log("Appliquer renégociation:", applyRenegotiation);
            
            // Appliquer le nouveau taux à tous les remboursements si spécifié
            if (newInterestRate && remboursementsAnticipes.length > 0) {
                remboursementsAnticipes.forEach(r => {
                    r.nouveauTaux = newInterestRate;
                });
            }

            // Création du simulateur
            const simulator = new LoanSimulator({
                capital: loanAmount,
                tauxAnnuel: interestRate,
                dureeMois: loanDurationYears * 12,
                assuranceAnnuelle: insuranceRate,
                indemnitesMois: penaltyMonthsSliderDuree ? parseInt(penaltyMonthsSliderDuree.value) : 3,
                fraisDossier: fraisDossier,
                fraisTenueCompte: fraisTenueCompte,
                fraisGarantie: fraisGarantie,
                typeGarantie: typeGarantie,
                assuranceSurCapitalInitial: assuranceSurCapitalInitial
            });

            // ✅ CORRECTION APPLIQUÉE : Suppression du paramètre moisAReduire
            const result = simulator.tableauAmortissement({
                nouveauTaux: newInterestRate,
                moisRenegociation: renegotiationMonth,
                modeRemboursement: modeRemboursement,
                // moisAReduire: moisAReduire,  ← LIGNE SUPPRIMÉE
                remboursementsAnticipes: remboursementsAnticipes,
                appliquerRenegociation: applyRenegotiation
            });

            console.log("Résultats calculés:", result);

            // ==========================================
            // 🚀 NOUVEAU : AFFICHAGE DES RÉSULTATS AVEC PTZ
            // ==========================================
            
            // Mensualité globale (prêt principal + PTZ)
            const mensualiteGlobale = result.mensualiteInitiale + mensualitePTZ;
            const mensualiteLabel = (enablePTZ && ptzAmount > 0) ? 'Mensualité globale' : 'Mensualité initiale';

            document.getElementById('monthly-payment').textContent = formatMontant(mensualiteGlobale);
            // Changer le label si nécessaire
            const monthlyPaymentLabel = document.querySelector('#monthly-payment').parentElement.querySelector('.result-label');
            if (monthlyPaymentLabel) {
                monthlyPaymentLabel.textContent = mensualiteLabel;
            }

            // Coût total (prêt principal + capital PTZ, sans intérêts PTZ)
            const totalCreditAvecPTZ = result.totalPaye + ptzAmount;
            document.getElementById('total-cost').textContent = formatMontant(totalCreditAvecPTZ);

            // Coût global et ratio
            const coutGlobalAvecPTZ = result.coutGlobalTotal + ptzAmount;
            const montantTotalEmprunte = loanAmount + ptzAmount;

            document.getElementById('cout-global').textContent = formatMontant(coutGlobalAvecPTZ);
            document.getElementById('ratio-cout').textContent = montantTotalEmprunte > 0 ? 
                (coutGlobalAvecPTZ / montantTotalEmprunte).toFixed(3) : '0.000';

            // Mise à jour du TAEG si PTZ inclus
            if (enablePTZ && ptzAmount > 0) {
                // Le TAEG doit être recalculé sur l'ensemble (approximation)
                const taegAjuste = result.taeg * (loanAmount / montantTotalEmprunte);
                document.getElementById('taeg').textContent = taegAjuste.toFixed(2) + '%';
            } else {
                document.getElementById('taeg').textContent = result.taeg.toFixed(2) + '%';
            }

            // ==========================================
            // FIN SECTION AFFICHAGE PTZ
            // ==========================================

            // Mise à jour des résultats standards
            document.getElementById('total-interest').textContent = formatMontant(result.totalInterets);
            document.getElementById('early-repayment-penalty').textContent = formatMontant(result.indemnites);
            
            // Mise à jour des nouveaux résultats
            const totalFeesElement = document.getElementById('total-fees');
            
            if (totalFeesElement) totalFeesElement.textContent = formatMontant(result.totalFrais);

            // Génération du tableau d'amortissement
            const tableBody = document.getElementById('amortization-table');
            tableBody.innerHTML = '';

            // Limiter le tableau aux 120 premières lignes pour des raisons de performance
            const displayRows = Math.min(result.tableau.length, 120);
            
            for (let i = 0; i < displayRows; i++) {
                const row = result.tableau[i];
                const tr = document.createElement('tr');
                
                // Marquage différent pour les mois de remboursement anticipé
                if (row.remboursementAnticipe > 0) {
                    tr.classList.add('bg-green-900', 'bg-opacity-20');
                } else if (i + 1 === result.moisRenegociation && result.appliquerRenegociation) {
                    // Mise en évidence du mois de renégociation uniquement si elle est appliquée
                    tr.classList.add('bg-blue-500', 'bg-opacity-20');
                } else {
                    tr.classList.add(i % 2 === 0 ? 'bg-blue-800' : 'bg-blue-900', 'bg-opacity-10');
                }
                
                tr.innerHTML = `
                    <td class="px-3 py-2">${row.mois}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(row.mensualite)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(row.capitalAmorti)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(row.interets)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(row.assurance)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(row.capitalRestant)}</td>
                `;
                
                tableBody.appendChild(tr);

                // ==========================================
                // 🚀 NOUVEAU : AFFICHAGE PTZ DANS TABLEAU AVEC LOGIQUE MODIFIÉE
                // ==========================================
                if (enablePTZ && ptzAmount > 0 && mensualitePTZ > 0) {
                    /* ── Début de l'insertion PTZ ───────────────────────────────────────── */
                    if (row.mois % 12 === 1) { // mois 1, 13, 25, …
                        // Année = 1 pour les mois 1-12, 2 pour 13-24, etc.
                        const anneePTZ = Math.floor((row.mois - 1) / 12) + 1;
                        const labelPTZ = `PTZ (Année ${anneePTZ})`;
                        
                        const monthsRemaining = Math.max(0, ptzDurationMonths - row.mois + 1);
                        const ptzCapitalRestant = Math.max(0, ptzAmount - (mensualitePTZ * (row.mois - 1)));
                        
                        if (monthsRemaining > 0 && ptzCapitalRestant > 0) {
                            const ptzRow = document.createElement('tr');
                            ptzRow.className = 'bg-amber-900 bg-opacity-10 border-l-4 border-amber-500';
                            ptzRow.innerHTML = `
                                <td class="px-3 py-2 text-amber-300">${labelPTZ}</td>
                                <td class="px-3 py-2 text-right text-amber-300">${formatMontant(mensualitePTZ)}</td>
                                <td class="px-3 py-2 text-right text-amber-300">${formatMontant(mensualitePTZ)}</td>
                                <td class="px-3 py-2 text-right text-gray-400">0 €</td>
                                <td class="px-3 py-2 text-right text-gray-400">0 €</td>
                                <td class="px-3 py-2 text-right text-amber-300">${formatMontant(ptzCapitalRestant)}</td>
                            `;
                            tableBody.appendChild(ptzRow);
                        }
                    }
                    /* ── Fin de l'insertion PTZ ─────────────────────────────────────────── */
                }
                // ==========================================
                // FIN SECTION TABLEAU PTZ
                // ==========================================
            }
            
            // Si le tableau est trop long, ajouter un message
            if (result.tableau.length > 120) {
                const trInfo = document.createElement('tr');
                trInfo.classList.add('bg-blue-900', 'bg-opacity-50');
                trInfo.innerHTML = `
                    <td colspan="6" class="px-3 py-2 text-center">
                        <i class="fas fa-info-circle mr-2"></i>
                        Affichage limité aux 120 premiers mois pour des raisons de performance.
                        Durée totale du prêt: ${result.dureeReelle} mois.
                    </td>
                `;
                tableBody.appendChild(trInfo);
            }

            // ==========================================
            // 🚀 NOUVEAU : ENCADRÉ RÉCAPITULATIF PTZ
            // ==========================================
            updatePtzSummary(enablePTZ, ptzAmount, mensualitePTZ, ptzDurationYears, loanDurationYears, montantTotalEmprunte);
            // ==========================================

            // Génération du graphique
            updateChart(result);
            
            // Ajouter un résumé des économies
            updateSavingsSummary(result, modeRemboursement);
            
            // Affichage du tableau de comparaison si l'option est cochée
            updateComparisonTable(result, modeRemboursement);
            
            return true;
        } catch (error) {
            console.error("Erreur lors du calcul:", error);
            alert("Une erreur s'est produite lors du calcul. Consultez la console pour plus de détails.");
            return false;
        }
    }

    // ==========================================
    // 🚀 NOUVEAU : FONCTION ENCADRÉ PTZ AVEC LIBELLÉ MODIFIÉ
    // ==========================================
    function updatePtzSummary(enablePTZ, ptzAmount, mensualitePTZ, ptzDurationYears, loanDurationYears, montantTotalEmprunte) {
        // Nettoyer l'ancien encadré
        const existingSummary = document.getElementById('ptz-summary');
        if (existingSummary) {
            existingSummary.remove();
        }

        if (enablePTZ && ptzAmount > 0) {
            const ptzSummary = document.createElement('div');
            ptzSummary.id = 'ptz-summary';
            ptzSummary.className = 'mb-6 p-4 bg-amber-900 bg-opacity-20 border border-amber-600 rounded-lg animate-fadeIn';
            
            // Calculs additionnels
            const pourcentageFinancement = ((ptzAmount / montantTotalEmprunte) * 100).toFixed(1);
            const finPTZ = ptzDurationYears;
            const finPretPrincipal = loanDurationYears;
            
            ptzSummary.innerHTML = `
                <div class="flex items-center justify-between mb-3">
                    <h5 class="text-amber-400 font-medium flex items-center">
                        <i class="fas fa-home mr-2"></i>
                        Détail du Prêt à Taux Zéro
                    </h5>
                    <span class="text-xs text-amber-300 bg-amber-900 bg-opacity-30 px-2 py-1 rounded">
                        ${pourcentageFinancement}% du financement
                    </span>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">${formatMontant(ptzAmount)}</p>
                        <p class="text-gray-400 text-sm">Capital PTZ</p>
                    </div>
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">${formatMontant(mensualitePTZ)}</p>
                        <p class="text-gray-400 text-sm">Mensualité PTZ</p>
                    </div>
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">${ptzDurationYears} ans</p>
                        <p class="text-gray-400 text-sm">Durée PTZ</p>
                    </div>
                    <div class="text-center">
                        <p class="text-amber-300 text-lg font-semibold">0%</p>
                        <p class="text-gray-400 text-sm">Taux PTZ</p>
                    </div>
                </div>
                
                <div class="bg-amber-900 bg-opacity-20 p-3 rounded text-sm">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div class="flex justify-between">
                            <span class="text-gray-300">Fin PTZ:</span>
                            <span class="text-amber-300">Année ${finPTZ}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Fin prêt principal:</span>
                            <span class="text-amber-300">Année ${finPretPrincipal}</span>
                        </div>
                    </div>
                    ${finPTZ !== finPretPrincipal ? 
                        `<div class="mt-2 text-xs text-yellow-300">
                            <i class="fas fa-exclamation-triangle mr-1"></i>
                            ${finPTZ > finPretPrincipal ? 
                                `Le PTZ continuera ${finPTZ - finPretPrincipal} an(s) après la fin du prêt principal` :
                                `Le prêt principal continuera ${finPretPrincipal - finPTZ} an(s) après la fin du PTZ`
                            }
                        </div>` : 
                        '<div class="mt-2 text-xs text-green-300"><i class="fas fa-check mr-1"></i>Les deux prêts se terminent en même temps</div>'
                    }
                </div>
            `;
            
            // Insérer après les résultats principaux
            const resultsContainer = document.querySelector('.grid.grid-cols-2.gap-4.mb-6');
            if (resultsContainer) {
                resultsContainer.parentNode.insertBefore(ptzSummary, resultsContainer.nextSibling);
            }
        }
    }
    // ==========================================
    // FIN FONCTION PTZ
    // ==========================================
    
    // Fonction pour mettre à jour le tableau de comparaison
    function updateComparisonTable(result, modeRemboursement) {
        const compareCheckbox = document.getElementById('compare-scenarios');
        const comparisonTable = document.getElementById('comparison-table');
        const comparisonTableBody = document.getElementById('comparison-table-body');
        
        if (compareCheckbox && comparisonTable && comparisonTableBody) {
            if (compareCheckbox.checked) {
                comparisonTable.classList.remove('hidden');
                
                // Calculer les mêmes paramètres sans remboursement anticipé
                const simulator = new LoanSimulator({
                    capital: result.capitalInitial,
                    tauxAnnuel: document.getElementById('interest-rate-slider').value,
                    dureeMois: result.dureeInitiale,
                    assuranceAnnuelle: document.getElementById('insurance-rate-slider').value,
                    fraisDossier: parseFloat(document.getElementById('frais-dossier')?.value || 2000),
                    fraisTenueCompte: parseFloat(document.getElementById('frais-tenue-compte')?.value || 710),
                    assuranceSurCapitalInitial: document.getElementById('assurance-capital-initial')?.checked || false
                });
                
                const baseResult = simulator.tableauAmortissement({});
                
                // Construire le tableau de comparaison
                comparisonTableBody.innerHTML = '';
                
                // Ligne pour la durée
                const trDuree = document.createElement('tr');
                trDuree.classList.add('bg-blue-800', 'bg-opacity-10');
                trDuree.innerHTML = `
                    <td class="px-3 py-2 font-medium">Durée du prêt</td>
                    <td class="px-3 py-2 text-right">${baseResult.dureeReelle} mois</td>
                    <td class="px-3 py-2 text-right">${result.dureeReelle} mois</td>
                    <td class="px-3 py-2 text-right text-green-400">-${baseResult.dureeReelle - result.dureeReelle} mois</td>
                `;
                comparisonTableBody.appendChild(trDuree);
                
                // Ligne pour le coût total
                const trCout = document.createElement('tr');
                trCout.classList.add('bg-blue-900', 'bg-opacity-10');
                trCout.innerHTML = `
                    <td class="px-3 py-2 font-medium">Coût total</td>
                    <td class="px-3 py-2 text-right">${formatMontant(baseResult.totalPaye)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(result.totalPaye)}</td>
                    <td class="px-3 py-2 text-right text-green-400">-${formatMontant(baseResult.totalPaye - result.totalPaye)}</td>
                `;
                comparisonTableBody.appendChild(trCout);
                
                // Ligne pour les intérêts
                const trInterets = document.createElement('tr');
                trInterets.classList.add('bg-blue-800', 'bg-opacity-10');
                trInterets.innerHTML = `
                    <td class="px-3 py-2 font-medium">Total des intérêts</td>
                    <td class="px-3 py-2 text-right">${formatMontant(baseResult.totalInterets)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(result.totalInterets)}</td>
                    <td class="px-3 py-2 text-right text-green-400">-${formatMontant(baseResult.totalInterets - result.totalInterets)}</td>
                `;
                comparisonTableBody.appendChild(trInterets);
                
                // Ligne pour les mensualités
                const trMensualite = document.createElement('tr');
                trMensualite.classList.add('bg-blue-900', 'bg-opacity-10');
                trMensualite.innerHTML = `
                    <td class="px-3 py-2 font-medium">Mensualité</td>
                    <td class="px-3 py-2 text-right">${formatMontant(baseResult.mensualiteInitiale)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(result.tableau[result.tableau.length - 1].mensualite)}</td>
                    <td class="px-3 py-2 text-right ${modeRemboursement === 'mensualite' ? 'text-green-400' : 'text-gray-400'}">
                    ${formatMontant(baseResult.mensualiteInitiale - result.tableau[result.tableau.length - 1].mensualite)}</td>
                `;
                comparisonTableBody.appendChild(trMensualite);
                
                // Ligne pour le TAEG
                const trTAEG = document.createElement('tr');
                trTAEG.classList.add('bg-blue-800', 'bg-opacity-10');
                trTAEG.innerHTML = `
                    <td class="px-3 py-2 font-medium">TAEG approximatif</td>
                    <td class="px-3 py-2 text-right">${baseResult.taeg.toFixed(2)}%</td>
                    <td class="px-3 py-2 text-right">${result.taeg.toFixed(2)}%</td>
                    <td class="px-3 py-2 text-right text-green-400">-${Math.max(0, (baseResult.taeg - result.taeg)).toFixed(2)}%</td>
                `;
                comparisonTableBody.appendChild(trTAEG);
                
                // Ligne pour les frais supplémentaires
                const trFrais = document.createElement('tr');
                trFrais.classList.add('bg-blue-900', 'bg-opacity-10');
                trFrais.innerHTML = `
                    <td class="px-3 py-2 font-medium">Frais supplémentaires</td>
                    <td class="px-3 py-2 text-right">0 €</td>
                    <td class="px-3 py-2 text-right">${formatMontant(result.indemnites)}</td>
                    <td class="px-3 py-2 text-right text-amber-400">+${formatMontant(result.indemnites)}</td>
                `;
                comparisonTableBody.appendChild(trFrais);
                
                // Ligne pour le coût global total
                const trCoutGlobal = document.createElement('tr');
                trCoutGlobal.classList.add('bg-green-900', 'bg-opacity-10', 'font-bold');
                trCoutGlobal.innerHTML = `
                    <td class="px-3 py-2">Coût global total</td>
                    <td class="px-3 py-2 text-right">${formatMontant(baseResult.coutGlobalTotal)}</td>
                    <td class="px-3 py-2 text-right">${formatMontant(result.coutGlobalTotal)}</td>
                    <td class="px-3 py-2 text-right text-green-400">-${formatMontant(baseResult.coutGlobalTotal - result.coutGlobalTotal)}</td>
                `;
                comparisonTableBody.appendChild(trCoutGlobal);
                
            } else {
                comparisonTable.classList.add('hidden');
            }
        }
    }
    
    // Fonction pour ajouter un résumé des économies
    function updateSavingsSummary(result, modeRemboursement) {
        // CORRECTION: Vérifier qu'on est bien dans l'onglet "Gestion de dette"
        const loanSimulatorTab = document.getElementById('loan-simulator');
        if (!loanSimulatorTab || loanSimulatorTab.style.display === 'none') {
            return; // Ne rien faire si on n'est pas dans l'onglet du simulateur de prêt
        }
        
        // Rechercher ou créer la section de résumé
        let savingsSummary = document.getElementById('savings-summary');
        
        if (!savingsSummary) {
            savingsSummary = document.createElement('div');
            savingsSummary.id = 'savings-summary';
            savingsSummary.className = 'bg-blue-900 bg-opacity-20 p-4 rounded-lg border-l-4 border-green-400 mt-6';
            
            // Ajouter après le graphique
            const chartContainer = loanSimulatorTab.querySelector('.chart-container');
            if (chartContainer) {
                chartContainer.after(savingsSummary);
            }
        }
        
        // Calculer le pourcentage d'économies
        const economiesPourcentage = ((result.economiesInterets / (result.totalInterets + result.economiesInterets)) * 100).toFixed(1);
        
        // Texte spécifique au mode de remboursement
        let modeText = '';
        if (modeRemboursement === 'duree') {
            modeText = `Réduction de la durée du prêt de ${result.dureeInitiale - result.dureeReelle} mois`;
        } else {
            const mensualiteInitiale = result.mensualiteInitiale;
            const mensualiteFinale = result.tableau[result.tableau.length - 1].mensualite;
            const difference = mensualiteInitiale - mensualiteFinale;
            modeText = `Réduction de la mensualité de ${formatMontant(difference)} (${formatMontant(mensualiteInitiale)} → ${formatMontant(mensualiteFinale)})`;
        }
        
        // Information sur la renégociation
        let renégociationText = '';
        if (result.appliquerRenegociation && result.moisRenegociation) {
            renégociationText = `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Renégociation au mois ${result.moisRenegociation} : taux passant de ${document.getElementById('interest-rate-slider').value}% à ${document.getElementById('new-interest-rate-slider').value}%</span>
                </li>
            `;
        } else if (result.moisRenegociation) {
            renégociationText = `
                <li class="flex items-start">
                    <i class="fas fa-times-circle text-amber-400 mr-2 mt-1"></i>
                    <span>Renégociation désactivée : le taux initial de ${document.getElementById('interest-rate-slider').value}% est conservé sur toute la durée du prêt</span>
                </li>
            `;
        }
        
        // Préparer le contenu HTML
        let htmlContent = `
            <h5 class="text-green-400 font-medium flex items-center mb-2">
                <i class="fas fa-piggy-bank mr-2"></i>
                Analyse complète du prêt
            </h5>
            <ul class="text-sm text-gray-300 space-y-2 pl-4">
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Coût total du crédit : ${formatMontant(result.coutGlobalTotal)} 
                    (capital + intérêts + assurance + frais)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Vous économisez ${formatMontant(result.economiesInterets)} d'intérêts (${economiesPourcentage}% du total)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>${modeText}</span>
                </li>
                ${renégociationText}`;
                
        // Affichage spécial pour le prêt soldé avant terme
        if (result.pretSoldeAvantTerme) {
            const gainTemps = result.gainTemps;
            const annees = Math.floor(gainTemps / 12);
            const mois = gainTemps % 12;
            
            let texteGain = '';
            if (annees > 0) {
                texteGain += `${annees} an${annees > 1 ? 's' : ''}`;
            }
            if (mois > 0) {
                texteGain += `${annees > 0 ? ' et ' : ''}${mois} mois`;
            }
            
            htmlContent += `
                <li class="flex items-start bg-green-900 bg-opacity-30 p-2 rounded-lg my-2">
                    <i class="fas fa-award text-green-400 mr-2 mt-1"></i>
                    <span><strong>Prêt soldé avant terme!</strong> Vous gagnez ${texteGain} sur la durée initiale.</span>
                </li>`;
        }
        
        // Ajouter les infos restantes
        htmlContent += `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Indemnités de remboursement anticipé: ${formatMontant(result.indemnites)} 
                    (plafonnées légalement à 6 mois d'intérêts ou 3% du capital remboursé)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>TAEG approximatif: ${result.taeg.toFixed(2)}%</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Frais annexes: ${formatMontant(result.totalFrais)}</span>
                </li>`;
        
        // Afficher les remboursements anticipés configurés
        if (result.remboursementsAnticipes && result.remboursementsAnticipes.length > 0) {
            htmlContent += `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Remboursements anticipés: ${result.remboursementsAnticipes.length}</span>
                </li>`;
        }
        
        htmlContent += `
            </ul>
        `;
        
        // Mettre à jour le contenu
        savingsSummary.innerHTML = htmlContent;
    }

    // Graphique d'amortissement
    let loanChart;
    
    function updateChart(result) {
        const ctx = document.getElementById('loan-chart')?.getContext('2d');
        if (!ctx) return;
        
        // Destruction du graphique existant s'il y en a un
        if (loanChart) {
            loanChart.destroy();
        }
        
        // Préparation des données pour le graphique
        const capitalData = [];
        const interestData = [];
        const insuranceData = [];
        const labels = [];
        
        // Échantillonnage des données pour le graphique (une donnée tous les 3 mois)
        const sampleRate = Math.max(1, Math.floor(result.tableau.length / 40));
        
        for (let i = 0; i < result.tableau.length; i += sampleRate) {
            const row = result.tableau[i];
            labels.push(`Mois ${row.mois}`);
            capitalData.push(row.capitalRestant);
            
            // Calcul cumulatif des intérêts et assurances
            let cumulativeInterest = 0;
            let cumulativeInsurance = 0;
            
            for (let j = 0; j <= i; j++) {
                cumulativeInterest += result.tableau[j].interets;
                cumulativeInsurance += result.tableau[j].assurance;
            }
            
            interestData.push(cumulativeInterest);
            insuranceData.push(cumulativeInsurance);
        }
        
        // Ajout des frais annexes sous forme de point de départ
        const feesData = Array(labels.length).fill(0);
        feesData[0] = result.totalFrais;
        
        // Création du graphique
        loanChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Capital restant',
                        data: capitalData,
                        borderColor: 'rgba(52, 211, 153, 1)',
                        backgroundColor: 'rgba(52, 211, 153, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Intérêts cumulés',
                        data: interestData,
                        borderColor: 'rgba(239, 68, 68, 0.8)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Assurance cumulée',
                        data: insuranceData,
                        borderColor: 'rgba(59, 130, 246, 0.8)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Frais annexes',
                        data: feesData,
                        borderColor: 'rgba(153, 102, 255, 1)',
                        backgroundColor: 'rgba(153, 102, 255, 0.1)',
                        fill: true,
                        pointRadius: feesData.map((v, i) => i === 0 ? 6 : 0),
                        pointBackgroundColor: 'rgba(153, 102, 255, 1)'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.8)'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatMontant(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            callback: function(value) {
                                return formatMontant(value);
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
        
        // Marquer visuellement les remboursements anticipés et la renégociation
        // Pour chaque remboursement anticipé dans result.remboursementsAnticipes
        if (result.remboursementsAnticipes && result.remboursementsAnticipes.length > 0) {
            result.remboursementsAnticipes.forEach(rembours => {
                const remboursementIndex = Math.floor(rembours.mois / sampleRate);
                
                if (remboursementIndex < labels.length) {
                    // Ajouter un point pour indiquer le remboursement anticipé
                    const dataset = loanChart.data.datasets[0];
                    dataset.pointBackgroundColor = dataset.pointBackgroundColor || Array(dataset.data.length).fill('transparent');
                    dataset.pointRadius = dataset.pointRadius || Array(dataset.data.length).fill(0);
                    
                    dataset.pointBackgroundColor[remboursementIndex] = 'rgba(52, 211, 153, 1)';
                    dataset.pointRadius[remboursementIndex] = 5;
                }
            });
            
            loanChart.update();
        }
        
        // Marquer le mois de renégociation sur le graphique seulement si la renégociation est appliquée
        if (result.moisRenegociation && result.appliquerRenegociation) {
            const renegotiationIndex = Math.floor(result.moisRenegociation / sampleRate);
            
            if (renegotiationIndex < labels.length) {
                // Ajouter un point pour indiquer la renégociation
                const dataset = loanChart.data.datasets[1]; // Dataset des intérêts
                dataset.pointBackgroundColor = dataset.pointBackgroundColor || Array(dataset.data.length).fill('transparent');
                dataset.pointRadius = dataset.pointRadius || Array(dataset.data.length).fill(0);
                
                dataset.pointBackgroundColor[renegotiationIndex] = 'rgba(59, 130, 246, 1)'; // Bleu pour la renégociation
                dataset.pointRadius[renegotiationIndex] = 5;
            }
        }
        
        loanChart.update();
    }

    // Événement de clic sur le bouton de calcul
    if (calculateLoanButton) {
        calculateLoanButton.addEventListener('click', calculateLoan);
    }
    
   
    
    // Définir une fonction pour vérifier le remboursement total
    window.checkTotalRepayment = function(montant) {
        try {
            const loanAmount = parseFloat(document.getElementById('loan-amount').value);
            const interestRate = parseFloat(document.getElementById('interest-rate-slider').value) / 100 / 12;
            const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
            const currentMonth = parseInt(document.getElementById('early-repayment-month-slider-mensualite').value);
            
            // Calcul approximatif du capital restant dû au mois du remboursement
            const mensualite = loanAmount * interestRate / (1 - Math.pow(1 + interestRate, -(loanDurationYears * 12)));
            let capitalRestant = loanAmount;
            
            for (let i = 1; i < currentMonth; i++) {
                const interetMois = capitalRestant * interestRate;
                capitalRestant -= (mensualite - interetMois);
            }
            
            // Vérification si le montant est proche du capital restant dû
            const notice = document.getElementById('total-repayment-notice');
            if (notice && montant >= capitalRestant * 0.95) { // Si le montant représente au moins 95% du capital restant
                notice.classList.remove('hidden');
            } else if (notice) {
                notice.classList.add('hidden');
            }
        } catch (error) {
            console.error("Erreur lors de la vérification du remboursement total:", error);
        }
    };
    
    // Synchroniser les valeurs entre les modes
    function syncModeValues() {
        try {
            // Créer les éléments manquants si nécessaire pour le mode durée
            if (!document.getElementById('early-repayment-amount-duree')) {
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.id = 'early-repayment-amount-duree';
                hiddenInput.value = '10000';
                document.body.appendChild(hiddenInput);
            }
            
            // Du mode durée vers le mode mensualité
            const earlyRepaymentAmountDuree = document.getElementById('early-repayment-amount-duree');
            const earlyRepaymentAmountMensualite = document.getElementById('early-repayment-amount-mensualite');
            
            if (earlyRepaymentAmountDuree && earlyRepaymentAmountMensualite) {
                earlyRepaymentAmountMensualite.value = earlyRepaymentAmountDuree.value;
            }
            
            // Synchroniser les sliders des mois
            const earlyRepaymentMonthSliderDuree = document.getElementById('early-repayment-month-slider-duree');
            const earlyRepaymentMonthValueDuree = document.getElementById('early-repayment-month-value-duree');
            const earlyRepaymentMonthSliderMensualite = document.getElementById('early-repayment-month-slider-mensualite');
            const earlyRepaymentMonthValueMensualite = document.getElementById('early-repayment-month-value-mensualite');
            
            if (earlyRepaymentMonthSliderDuree && earlyRepaymentMonthSliderMensualite && 
                earlyRepaymentMonthValueDuree && earlyRepaymentMonthValueMensualite) {
                
                earlyRepaymentMonthSliderMensualite.value = earlyRepaymentMonthSliderDuree.value;
                earlyRepaymentMonthValueMensualite.textContent = earlyRepaymentMonthValueDuree.textContent;
                
                // Écouter les changements
                earlyRepaymentMonthSliderDuree.addEventListener('input', function() {
                    earlyRepaymentMonthSliderMensualite.value = this.value;
                    earlyRepaymentMonthValueMensualite.textContent = this.value;
                });
                
                earlyRepaymentMonthSliderMensualite.addEventListener('input', function() {
                    earlyRepaymentMonthSliderDuree.value = this.value;
                    earlyRepaymentMonthValueDuree.textContent = this.value;
                });
            }
            
            // Synchroniser les sliders d'indemnités
            const penaltyMonthsSliderDuree = document.getElementById('penalty-months-slider-duree');
            const penaltyMonthsValueDuree = document.getElementById('penalty-months-value-duree');
            const penaltyMonthsSliderMensualite = document.getElementById('penalty-months-slider-mensualite');
            const penaltyMonthsValueMensualite = document.getElementById('penalty-months-value-mensualite');
            
            if (penaltyMonthsSliderDuree && penaltyMonthsSliderMensualite && 
                penaltyMonthsValueDuree && penaltyMonthsValueMensualite) {
                
                penaltyMonthsSliderMensualite.value = penaltyMonthsSliderDuree.value;
                penaltyMonthsValueMensualite.textContent = penaltyMonthsValueDuree.textContent;
                
                // Écouter les changements
                penaltyMonthsSliderDuree.addEventListener('input', function() {
                    penaltyMonthsSliderMensualite.value = this.value;
                    penaltyMonthsValueMensualite.textContent = `${this.value} mois`;
                });
                
                penaltyMonthsSliderMensualite.addEventListener('input', function() {
                    penaltyMonthsSliderDuree.value = this.value;
                    penaltyMonthsValueDuree.textContent = `${this.value} mois`;
                });
            }
        } catch (error) {
            console.error("Erreur lors de la synchronisation des modes:", error);
        }
    }

    // ==========================================
    // 🚀 NOUVEAU : GESTIONNAIRE D'ÉVÉNEMENT POUR AJOUTER UN REMBOURSEMENT
    // ==========================================
    const addRepaymentBtn = document.getElementById('add-repayment-btn');
    if (addRepaymentBtn) {
        addRepaymentBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const mode = document.getElementById('remboursement-mode').value;
            let newRepayment;

            if (mode === 'duree') {
                const moisAReduire = +document.getElementById('reduction-duree-mois').value;
                const mois = +document.getElementById('early-repayment-month-slider-duree').value;
                if (moisAReduire <= 0) {
                    document.getElementById('min-threshold-alert').classList.remove('hidden');
                    return;
                }
                newRepayment = { montant: 0, mois, moisAReduire };
            } else {
                const montant = +document.getElementById('early-repayment-amount-mensualite').value;
                const mois = +document.getElementById('early-repayment-month-slider-mensualite').value;
                if (montant <= 0) {
                    document.getElementById('min-threshold-alert').classList.remove('hidden');
                    return;
                }
                newRepayment = { montant, mois };
            }

            // Stocker le nouveau remboursement
            window.storedRepayments.push(newRepayment);

            // Rafraîchir l'UI et recalculer
            renderRepaymentsList();
            document.getElementById('min-threshold-alert').classList.add('hidden');
            calculateLoan();

            // Reset des champs de saisie pour éviter les doublons
            if (mode === 'mensualite') {
                document.getElementById('early-repayment-amount-mensualite').value = '';
            }
        });
    }

    // ==========================================
    // 🎨 NOUVELLE FONCTION POUR AFFICHER LA LISTE DES REMBOURSEMENTS AVEC UI AMÉLIORÉE
    // ==========================================
    function renderRepaymentsList() {
        const list = document.getElementById('repayments-list');
        if (!list) return;

        list.innerHTML = '';

        window.storedRepayments.forEach((r, idx) => {
            const { html, cls } = repaymentLabel(r);

            const item = document.createElement('div');
            item.className =
                'repayment-item flex items-center justify-between bg-blue-900 bg-opacity-15 rounded-lg px-3 py-2 mb-2 hover:bg-blue-800/30';

            // bloc gauche = libellé + sous-libellé
            const left = document.createElement('div');
            left.innerHTML = `
                <div class="font-medium ${cls}">${html}</div>
                <div class="text-xs text-gray-400">au mois ${r.mois}</div>
            `;

            // bouton suppression
            const remove = document.createElement('button');
            remove.className =
                'remove-repayment text-gray-400 hover:text-red-400 transition';
            remove.dataset.index = idx;
            remove.innerHTML = '<i class="fas fa-times"></i>';

            // assemblage
            item.appendChild(left);
            item.appendChild(remove);
            list.appendChild(item);
        });

        // listener « supprimer »
        list.querySelectorAll('.remove-repayment').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = +e.currentTarget.dataset.index;
                window.storedRepayments.splice(i, 1);
                renderRepaymentsList();
                calculateLoan();
            });
        });
    }

    // ==========================================
    // 🚀 NOUVEAU : BOUTON RÉINITIALISER TOUS LES REMBOURSEMENTS
    // ==========================================
    const resetRepaymentsBtn = document.getElementById('reset-repayments');
    if (resetRepaymentsBtn) {
        resetRepaymentsBtn.addEventListener('click', function() {
            window.storedRepayments = [];
            renderRepaymentsList();
            calculateLoan();
        });
    }
    
    // Calculer les résultats initiaux au chargement de la page
    if (document.getElementById('loan-amount')) {
        // Initialiser la mise à jour des valeurs max des sliders
        updateSliderMaxValues();
        
        // Initialiser la synchronisation des valeurs entre les modes
        setTimeout(syncModeValues, 500);
        
        // S'assurer que window.storedRepayments existe
        if (!window.storedRepayments) {
            window.storedRepayments = [];
        }
        
        // Lancer le calcul initial
        setTimeout(calculateLoan, 1000);
    }
});
// =================================================================
// NAVIGATION PTZ - Ajouté pour le lien depuis la section dette  
// =================================================================

/**
 * Gestion du lien PTZ depuis la section Gestion de dette
 */
function initPTZNavigation() {
    document.addEventListener('click', (e) => {
        // Vérifier si on clique sur le lien PTZ
        const ptzLink = e.target.closest('#go-to-ptz');
        if (!ptzLink) return; // Pas le bon lien, on ignore
        
        e.preventDefault(); // Empêcher le comportement par défaut
        
        console.log('🎯 Clic PTZ détecté !'); // Pour debug
        
        // 1. Activer l'onglet PTZ
        const ptzTab = document.querySelector('[data-target="ptz-simulator"]');
        const ptzContent = document.getElementById('ptz-simulator');
        
        if (ptzTab && ptzContent) {
            // Désactiver tous les onglets
            document.querySelectorAll('.simulation-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.simulation-content').forEach(content => {
                content.style.display = 'none';
            });
            
            // Activer l'onglet PTZ
            ptzTab.classList.add('active');
            ptzContent.style.display = 'block';
            
            console.log('✅ Onglet PTZ activé !'); // Pour debug
            
            // 2. Scroll fluide après un petit délai
            setTimeout(() => {
                ptzContent.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                console.log('📜 Scroll vers PTZ !'); // Pour debug
            }, 200);
        } else {
            console.error('❌ Éléments PTZ non trouvés');
        }
    });
}

// Initialiser quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPTZNavigation);
} else {
    initPTZNavigation(); // DOM déjà prêt
}
