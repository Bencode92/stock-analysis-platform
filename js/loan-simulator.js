// Fichier JS pour simulateur de dette avec options dynamiques
class LoanSimulator {
    constructor({ 
        capital, 
        tauxAnnuel, 
        dureeMois, 
        assuranceAnnuelle = 0, 
        indemnitesMoisDuree = 3,
        indemnitesMoisMensualite = 3,
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
        this.indemnitesMoisDuree = indemnitesMoisDuree;
        this.indemnitesMoisMensualite = indemnitesMoisMensualite;
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
    
    calculerMensualite(capitalRestant, tauxMensuel, dureeMoisRestants) {
        return capitalRestant * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMoisRestants));
    }
    
    tableauAmortissement({ 
        remboursementAnticipeDuree = 0, 
        moisAnticipeDuree = null,
        appliquerDuree = false,
        remboursementAnticipeMensualite = 0,
        moisAnticipeMensualite = null,
        appliquerMensualite = false,
        nouveauTaux = null
    }) {
        let mensualite = this.calculerMensualite(this.capital, this.tauxMensuel, this.dureeMois);
        let capitalRestant = this.capital;
        let tableau = [];
        let tauxMensuel = this.tauxMensuel;
        let assuranceMensuelle = this.assuranceMensuelle;
        let totalInterets = 0;
        let totalAssurance = 0;
        let totalCapitalAmorti = 0;
        let capitalInitial = this.capital;
        let dureeTotale = this.dureeMois;
        
        // Total des indemnités de remboursement anticipé
        let indemnitesDuree = 0;
        let indemnitesMensualite = 0;
        
        for (let mois = 1; mois <= dureeTotale; mois++) {
            // Réinjection de capital (remboursement anticipé mode durée)
            if (appliquerDuree && moisAnticipeDuree && mois === moisAnticipeDuree && remboursementAnticipeDuree > 0) {
                // Calcul des indemnités avec la formule standard
                const indemniteStandard = remboursementAnticipeDuree * tauxMensuel * this.indemnitesMoisDuree;
                
                // Calcul des plafonds légaux
                const plafond3Pourcent = remboursementAnticipeDuree * 0.03;
                const plafond6Mois = mensualite * 6;
                
                // Application du minimum entre la formule standard et les plafonds légaux
                indemnitesDuree = Math.min(indemniteStandard, Math.min(plafond3Pourcent, plafond6Mois));
                
                // Réduction du capital restant dû
                capitalRestant = Math.max(0, capitalRestant - remboursementAnticipeDuree);
                
                // Note: en mode durée, on garde la même mensualité, la durée va diminuer
            }
            
            // Réinjection de capital (remboursement anticipé mode mensualité)
            if (appliquerMensualite && moisAnticipeMensualite && mois === moisAnticipeMensualite && remboursementAnticipeMensualite > 0) {
                // Calcul des indemnités avec la formule standard
                const indemniteStandard = remboursementAnticipeMensualite * tauxMensuel * this.indemnitesMoisMensualite;
                
                // Calcul des plafonds légaux
                const plafond3Pourcent = remboursementAnticipeMensualite * 0.03;
                const plafond6Mois = mensualite * 6;
                
                // Application du minimum entre la formule standard et les plafonds légaux
                indemnitesMensualite = Math.min(indemniteStandard, Math.min(plafond3Pourcent, plafond6Mois));
                
                // Réduction du capital restant dû
                capitalRestant = Math.max(0, capitalRestant - remboursementAnticipeMensualite);
                
                // En mode mensualité, on recalcule la mensualité pour la durée restante
                const dureeMoisRestants = dureeTotale - mois + 1;
                mensualite = this.calculerMensualite(capitalRestant, tauxMensuel, dureeMoisRestants);
            }
            
            // Si le nouveau taux est défini et c'est après le premier remboursement anticipé
            if (nouveauTaux !== null && 
                ((appliquerDuree && moisAnticipeDuree && mois > moisAnticipeDuree) ||
                 (appliquerMensualite && moisAnticipeMensualite && mois > moisAnticipeMensualite))) {
                
                // Application du nouveau taux
                if (tauxMensuel !== nouveauTaux / 100 / 12) {
                    tauxMensuel = nouveauTaux / 100 / 12;
                    
                    // Recalcul de la mensualité avec le nouveau taux
                    if (appliquerMensualite) {
                        const dureeMoisRestants = dureeTotale - mois + 1;
                        mensualite = this.calculerMensualite(capitalRestant, tauxMensuel, dureeMoisRestants);
                    }
                }
            }
            
            // Calcul des intérêts, de l'assurance et du capital amorti
            let interets = capitalRestant * tauxMensuel;
            
            // Calcul de l'assurance selon le mode (capital initial ou restant dû)
            let assurance = this.assuranceSurCapitalInitial ? 
                capitalInitial * assuranceMensuelle : 
                capitalRestant * assuranceMensuelle;
            
            let capitalAmorti = mensualite - interets;
            
            // Mise à jour du capital restant
            capitalRestant = Math.max(0, capitalRestant - capitalAmorti);
            
            // Mise à jour des totaux
            totalInterets += interets;
            totalAssurance += assurance;
            totalCapitalAmorti += capitalAmorti;
            
            // Ajout de la ligne au tableau d'amortissement
            tableau.push({
                mois,
                interets: interets,
                capitalAmorti,
                assurance,
                mensualite: mensualite + assurance,
                capitalRestant,
                rembAnticipeDuree: appliquerDuree && mois === moisAnticipeDuree ? remboursementAnticipeDuree : 0,
                rembAnticipeMensualite: appliquerMensualite && mois === moisAnticipeMensualite ? remboursementAnticipeMensualite : 0
            });
            
            // Si le prêt est totalement remboursé, on sort de la boucle
            if (capitalRestant <= 0) break;
        }
        
        // Calcul du TAEG approximatif (sans les frais annexes pour l'instant)
        const montantTotal = tableau.reduce((sum, l) => sum + l.mensualite, 0);
        const tauxEffectifAnnuel = ((Math.pow((montantTotal / this.capital), (12 / tableau.length)) - 1) * 12) * 100;
        
        // Total des frais annexes
        const totalFrais = this.fraisDossier + this.fraisTenueCompte + this.fraisGarantie;
        
        // Total des indemnités
        const totalIndemnites = indemnitesDuree + indemnitesMensualite;
        
        // Coût global (tout compris)
        const coutGlobalTotal = montantTotal + totalIndemnites + totalFrais;
        
        // Résumé des économies réalisées
        const dureeReelle = tableau.length;
        const economiesMois = this.dureeMois - dureeReelle;
        const mensualiteInitiale = this.calculerMensualite(this.capital, this.tauxMensuel, this.dureeMois) + 
            (this.assuranceSurCapitalInitial ? this.capital * this.assuranceMensuelle : this.capital * this.assuranceMensuelle);
        const mensualiteFinale = tableau[tableau.length - 1].mensualite;
        const economiesMensualites = (mensualiteInitiale - mensualiteFinale) > 0 ? (mensualiteInitiale - mensualiteFinale) : 0;
        
        return {
            tableau,
            mensualiteInitiale,
            mensualiteFinale,
            indemnitesDuree,
            indemnitesMensualite,
            totalIndemnites,
            totalInterets,
            totalAssurance,
            totalCapitalAmorti,
            capitalInitial,
            totalPaye: montantTotal + totalIndemnites,
            dureeReelle,
            dureeInitiale: this.dureeMois,
            economiesMois,
            economiesMensualites,
            taeg: tauxEffectifAnnuel,
            totalFrais,
            coutGlobalTotal
        };
    }
}

// Formater les nombres en euros
function formatMontant(montant) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
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
    
    // Checkboxes pour activer les remboursements
    const applyDureeCheckbox = document.getElementById('apply-duree');
    const applyMensualiteCheckbox = document.getElementById('apply-mensualite');
    
    // Références aux sliders de chaque mode
    const earlyRepaymentMonthSliderDuree = document.getElementById('early-repayment-month-slider-duree');
    const earlyRepaymentMonthValueDuree = document.getElementById('early-repayment-month-value-duree');
    const penaltyMonthsSliderDuree = document.getElementById('penalty-months-slider-duree');
    const penaltyMonthsValueDuree = document.getElementById('penalty-months-value-duree');
    
    const earlyRepaymentMonthSliderMensualite = document.getElementById('early-repayment-month-slider-mensualite');
    const earlyRepaymentMonthValueMensualite = document.getElementById('early-repayment-month-value-mensualite');
    const penaltyMonthsSliderMensualite = document.getElementById('penalty-months-slider-mensualite');
    const penaltyMonthsValueMensualite = document.getElementById('penalty-months-value-mensualite');

    // Mise à jour des affichages des sliders
    if (interestRateSlider && interestRateValue) {
        interestRateSlider.addEventListener('input', function() {
            interestRateValue.textContent = `${this.value}%`;
        });
    }
    
    if (loanDurationSlider && loanDurationValue) {
        loanDurationSlider.addEventListener('input', function() {
            loanDurationValue.textContent = `${this.value} ans`;
        });
    }
    
    if (insuranceRateSlider &&