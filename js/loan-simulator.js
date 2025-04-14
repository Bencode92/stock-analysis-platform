// Fichier JS pour simulateur de dette avec options dynamiques
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
        modeRemboursement = 'duree', // 'duree' ou 'mensualite'
        moisAReduire = 0 // Nouveau paramètre pour le nombre de mois à réduire directement
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
        
        // Définir la durée finale en fonction du mode
        let dureeFinale = this.dureeMois;
        if (modeRemboursement === 'duree' && moisAReduire > 0) {
            dureeFinale = Math.max(1, this.dureeMois - moisAReduire);
        }
        
        // Suivi avant remboursement anticipé
        let interetsAvantRembours = 0;
        let mensualitesAvantRembours = 0;
        
        for (let mois = 1; mois <= dureeFinale; mois++) {
            let interets = capitalRestant * tauxMensuel;
            
            // Calcul de l'assurance selon le mode (capital initial ou restant dû)
            let assurance = this.assuranceSurCapitalInitial ? 
                capitalInitial * assuranceMensuelle : 
                capitalRestant * assuranceMensuelle;
            
            let capitalAmorti = mensualite - interets;
            
            // Calculs avant remboursement anticipé
            if (moisAnticipe && mois < moisAnticipe) {
                interetsAvantRembours += interets;
                mensualitesAvantRembours += (mensualite + assurance);
            }
            
            // Traitement différent selon le mode
            if (modeRemboursement === 'mensualite' && moisAnticipe && mois === moisAnticipe) {
                // Mode mensualité: réduction du capital restant par le montant remboursé
                capitalRestant -= remboursementAnticipe;
                
                // Appliquer le nouveau taux si spécifié
                if (nouveauTaux !== null) {
                    tauxMensuel = nouveauTaux / 100 / 12;
                }
                
                // Recalculer la mensualité pour la même durée restante
                mensualite = capitalRestant * tauxMensuel / 
                    (1 - Math.pow(1 + tauxMensuel, -(this.dureeMois - mois + 1)));
            }
            // Note: Pour le mode durée, on n'a pas besoin d'ajustement ici car on a déjà réduit dureeFinale
            
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
            });
            
            if (capitalRestant <= 0) break;
        }
        
        // Indemnités de remboursement anticipé avec plafond légal
        let indemnites = 0;
        if (modeRemboursement === 'mensualite' && remboursementAnticipe > 0 && moisAnticipe) {
            // Calcul standard pour le mode mensualité
            const indemniteStandard = remboursementAnticipe * tauxMensuel * this.indemnitesMois;
            const plafond3Pourcent = remboursementAnticipe * 0.03;
            const plafond6Mois = mensualite * 6;
            indemnites = Math.min(indemniteStandard, Math.min(plafond3Pourcent, plafond6Mois));
        } else if (modeRemboursement === 'duree' && moisAReduire > 0) {
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
            moisAReduire  // Nouveau champ retourné
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
    
    // Nouvelles références pour les sections de mode de remboursement
    const modeDureeBtn = document.getElementById('mode-duree');
    const modeMensualiteBtn = document.getElementById('mode-mensualite');
    const sectionDuree = document.getElementById('section-reduire-duree');
    const sectionMensualite = document.getElementById('section-reduire-mensualite');
    
    // Nouvelle référence pour les sliders de chaque mode
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
    
    if (insuranceRateSlider && insuranceRateValue) {
        insuranceRateSlider.addEventListener('input', function() {
            insuranceRateValue.textContent = `${this.value}%`;
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
    
    // Gestion du changement de mode de remboursement
    if (modeDureeBtn && modeMensualiteBtn && sectionDuree && sectionMensualite) {
        modeDureeBtn.addEventListener('click', function() {
            document.getElementById('remboursement-mode').value = 'duree';
            modeDureeBtn.classList.add('active');
            modeMensualiteBtn.classList.remove('active');
            sectionDuree.classList.remove('hidden');
            sectionMensualite.classList.add('hidden');
        });
        
        modeMensualiteBtn.addEventListener('click', function() {
            document.getElementById('remboursement-mode').value = 'mensualite';
            modeMensualiteBtn.classList.add('active');
            modeDureeBtn.classList.remove('active');
            sectionMensualite.classList.remove('hidden');
            sectionDuree.classList.add('hidden');
        });
    }

    // Fonction pour calculer et afficher les résultats
    function calculateLoan() {
        const loanAmount = parseFloat(document.getElementById('loan-amount').value);
        const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
        const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
        const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
        const newInterestRate = parseFloat(document.getElementById('new-interest-rate-slider').value);
        
        // Récupérer les nouveaux paramètres
        const fraisDossier = parseFloat(document.getElementById('frais-dossier')?.value || 2000);
        const fraisTenueCompte = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710);
        
        // Récupérer les frais de garantie (valeur saisie ou calculée)
        const fraisGarantieInput = document.getElementById('frais-garantie');
        let fraisGarantie = null;
        if (fraisGarantieInput) {
            fraisGarantie = fraisGarantieInput.value ? 
                parseFloat(fraisGarantieInput.value) : 
                (fraisGarantieInput.dataset.autoValue ? parseFloat(fraisGarantieInput.dataset.autoValue) : null);
        }
        
        const typeGarantie = document.getElementById('type-garantie')?.value || 'caution';
        const assuranceSurCapitalInitial = document.getElementById('assurance-capital-initial')?.checked || false;
        
        // Récupérer le mode de remboursement (durée ou mensualité)
        const modeRemboursement = document.getElementById('remboursement-mode')?.value || 'duree';
        
        // Variables pour stocker les valeurs du remboursement anticipé
        let earlyRepaymentAmount = 0;
        let earlyRepaymentMonth = 0;
        let penaltyMonths = 0;
        let moisAReduire = 0;
        
        // Récupération des valeurs en fonction du mode de remboursement actif
        if (modeRemboursement === 'duree') {
            // Pour le mode durée, on utilise le nombre de mois à réduire
            moisAReduire = parseInt(document.getElementById('reduction-duree-mois')?.value || 12);
            earlyRepaymentMonth = parseInt(document.getElementById('early-repayment-month-slider-duree').value);
            penaltyMonths = parseInt(document.getElementById('penalty-months-slider-duree').value);
            
            // Rétrocompatibilité - Si reduction-duree-mois n'existe pas, utiliser l'ancien champ
            if (!document.getElementById('reduction-duree-mois')) {
                moisAReduire = parseInt(loanDurationYears * 12 * 0.2); // Par défaut, réduction de 20% de la durée
            }
        } else {
            // Mode mensualité inchangé
            earlyRepaymentAmount = parseFloat(document.getElementById('early-repayment-amount-mensualite').value);
            earlyRepaymentMonth = parseInt(document.getElementById('early-repayment-month-slider-mensualite').value);
            penaltyMonths = parseInt(document.getElementById('penalty-months-slider-mensualite').value);
        }

        // Création du simulateur
        const simulator = new LoanSimulator({
            capital: loanAmount,
            tauxAnnuel: interestRate,
            dureeMois: loanDurationYears * 12,
            assuranceAnnuelle: insuranceRate,
            indemnitesMois: penaltyMonths,
            fraisDossier: fraisDossier,
            fraisTenueCompte: fraisTenueCompte,
            fraisGarantie: fraisGarantie,
            typeGarantie: typeGarantie,
            assuranceSurCapitalInitial: assuranceSurCapitalInitial
        });

        // Calcul du tableau d'amortissement avec les nouveaux paramètres
        const result = simulator.tableauAmortissement({
            remboursementAnticipe: earlyRepaymentAmount,
            moisAnticipe: earlyRepaymentMonth,
            nouveauTaux: newInterestRate,
            modeRemboursement: modeRemboursement,
            moisAReduire: moisAReduire
        });

        // Mise à jour des résultats
        document.getElementById('monthly-payment').textContent = formatMontant(result.mensualiteInitiale);
        document.getElementById('total-interest').textContent = formatMontant(result.totalInterets);
        document.getElementById('early-repayment-penalty').textContent = formatMontant(result.indemnites);
        document.getElementById('total-cost').textContent = formatMontant(result.totalPaye);
        
        // Mise à jour des nouveaux résultats
        const totalFeesElement = document.getElementById('total-fees');
        const taegElement = document.getElementById('taeg');
        const coutGlobalElement = document.getElementById('cout-global');
        const ratioCoutElement = document.getElementById('ratio-cout');
        
        if (totalFeesElement) totalFeesElement.textContent = formatMontant(result.totalFrais);
        if (taegElement) taegElement.textContent = result.taeg.toFixed(2) + '%';
        if (coutGlobalElement) coutGlobalElement.textContent = formatMontant(result.coutGlobalTotal);
        if (ratioCoutElement) {
            const ratioCout = (result.coutGlobalTotal / loanAmount).toFixed(3);
            ratioCoutElement.textContent = ratioCout;
        }

        // Génération du tableau d'amortissement
        const tableBody = document.getElementById('amortization-table');
        tableBody.innerHTML = '';

        // Limiter le tableau aux 120 premières lignes pour des raisons de performance
        const displayRows = Math.min(result.tableau.length, 120);
        
        for (let i = 0; i < displayRows; i++) {
            const row = result.tableau[i];
            const tr = document.createElement('tr');
            
            // Marquage différent pour le mois de remboursement anticipé
            if (row.mois === earlyRepaymentMonth) {
                tr.classList.add('bg-green-900', 'bg-opacity-20');
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

        // Génération du graphique
        updateChart(result, earlyRepaymentMonth);
        
        // Ajouter un résumé des économies
        updateSavingsSummary(result, modeRemboursement);
        
        // Affichage du tableau de comparaison si l'option est cochée
        updateComparisonTable(result, modeRemboursement);
    }
    
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
                    <td class="px-3 py-2 text-right ${modeRemboursement === 'mensualite' ? 'text-green-400' : 'text-gray-400'}\">${formatMontant(baseResult.mensualiteInitiale - result.tableau[result.tableau.length - 1].mensualite)}</td>
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
        // Rechercher ou créer la section de résumé
        let savingsSummary = document.getElementById('savings-summary');
        
        if (!savingsSummary) {
            savingsSummary = document.createElement('div');
            savingsSummary.id = 'savings-summary';
            savingsSummary.className = 'bg-blue-900 bg-opacity-20 p-4 rounded-lg border-l-4 border-green-400 mt-6';
            
            // Ajouter après le graphique
            const chartContainer = document.querySelector('.chart-container');
            chartContainer.after(savingsSummary);
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
        
        // Mettre à jour le contenu
        savingsSummary.innerHTML = `
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
                </li>
            </ul>
        `;
    }

    // Graphique d'amortissement
    let loanChart;
    
    function updateChart(result, earlyRepaymentMonth) {
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
        
        // Marquer visuellement le remboursement anticipé
        const remboursementIndex = Math.floor(earlyRepaymentMonth / sampleRate);
        
        if (remboursementIndex < labels.length) {
            // Ajouter une ligne verticale pour indiquer le remboursement anticipé
            const dataset = loanChart.data.datasets[0];
            dataset.pointBackgroundColor = dataset.data.map((value, index) => 
                index === remboursementIndex ? 'rgba(52, 211, 153, 1)' : 'transparent'
            );
            dataset.pointRadius = dataset.data.map((value, index) => 
                index === remboursementIndex ? 5 : 0
            );
            loanChart.update();
        }
    }

    // Événement de clic sur le bouton de calcul
    if (calculateLoanButton) {
        calculateLoanButton.addEventListener('click', calculateLoan);
    }
    
    // Export PDF
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', function() {
            // Créer une zone pour l'export PDF
            const element = document.createElement('div');
            element.className = 'pdf-export bg-white text-black p-8';
            document.body.appendChild(element);
            
            // Récupérer le mode actif
            const modeRemboursement = document.getElementById('remboursement-mode')?.value || 'duree';
            
            // Récupérer les valeurs selon le mode
            let moisAReduire, earlyRepaymentAmount, earlyRepaymentMonth, penaltyMonths;
            
            if (modeRemboursement === 'duree') {
                moisAReduire = document.getElementById('reduction-duree-mois')?.value || 12;
                earlyRepaymentMonth = document.getElementById('early-repayment-month-slider-duree').value;
                penaltyMonths = document.getElementById('penalty-months-slider-duree').value;
            } else {
                earlyRepaymentAmount = document.getElementById('early-repayment-amount-mensualite').value;
                earlyRepaymentMonth = document.getElementById('early-repayment-month-slider-mensualite').value;
                penaltyMonths = document.getElementById('penalty-months-slider-mensualite').value;
            }
            
            // En-tête du PDF
            element.innerHTML = `
                <div class="text-center mb-6">
                    <h1 class="text-2xl font-bold mb-2">Tableau d'amortissement du prêt</h1>
                    <p class="text-gray-600">Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <p class="font-bold">Montant emprunté:</p>
                        <p>${document.getElementById('loan-amount').value} €</p>
                    </div>
                    <div>
                        <p class="font-bold">Taux d'intérêt:</p>
                        <p>${document.getElementById('interest-rate-slider').value}%</p>
                    </div>
                    <div>
                        <p class="font-bold">Durée:</p>
                        <p>${document.getElementById('loan-duration-slider').value} ans</p>
                    </div>
                    <div>
                        <p class="font-bold">Assurance:</p>
                        <p>${document.getElementById('insurance-rate-slider').value}%</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <p class="font-bold">Mensualité:</p>
                        <p>${document.getElementById('monthly-payment').textContent}</p>
                    </div>
                    <div>
                        <p class="font-bold">Total des intérêts:</p>
                        <p>${document.getElementById('total-interest').textContent}</p>
                    </div>
                    <div>
                        <p class="font-bold">Indemnités de remb. anticipé:</p>
                        <p>${document.getElementById('early-repayment-penalty').textContent}</p>
                    </div>
                    <div>
                        <p class="font-bold">Coût total du crédit:</p>
                        <p>${document.getElementById('total-cost').textContent}</p>
                    </div>
                </div>
            `;
            
            // Ajouter les infos de remboursement anticipé
            if (modeRemboursement === 'duree') {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                        <h3 class="font-bold mb-2">Remboursement anticipé (mode: Réduction de durée)</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="font-bold">Nombre de mois à réduire:</p>
                                <p>${moisAReduire} mois</p>
                            </div>
                            <div>
                                <p class="font-bold">Mois du remboursement:</p>
                                <p>${earlyRepaymentMonth}</p>
                            </div>
                            <div>
                                <p class="font-bold">Taux après renégociation:</p>
                                <p>${document.getElementById('new-interest-rate-slider').value}%</p>
                            </div>
                            <div>
                                <p class="font-bold">Indemnités (mois):</p>
                                <p>${penaltyMonths} mois</p>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                        <h3 class="font-bold mb-2">Remboursement anticipé (mode: Réduction de mensualité)</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="font-bold">Montant remboursé par anticipation:</p>
                                <p>${earlyRepaymentAmount} €</p>
                            </div>
                            <div>
                                <p class="font-bold">Mois du remboursement:</p>
                                <p>${earlyRepaymentMonth}</p>
                            </div>
                            <div>
                                <p class="font-bold">Taux après renégociation:</p>
                                <p>${document.getElementById('new-interest-rate-slider').value}%</p>
                            </div>
                            <div>
                                <p class="font-bold">Indemnités (mois):</p>
                                <p>${penaltyMonths} mois</p>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // Ajouter les frais annexes si disponibles
            if (document.getElementById('frais-dossier')) {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                        <h3 class="font-bold mb-2">Frais annexes</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="font-bold">Frais de dossier:</p>
                                <p>${document.getElementById('frais-dossier').value} €</p>
                            </div>
                            <div>
                                <p class="font-bold">Frais de garantie:</p>
                                <p>${document.getElementById('frais-garantie').value || document.getElementById('frais-garantie').placeholder} €</p>
                            </div>
                            <div>
                                <p class="font-bold">Frais de tenue de compte:</p>
                                <p>${document.getElementById('frais-tenue-compte').value} €</p>
                            </div>
                            <div>
                                <p class="font-bold">Type de garantie:</p>
                                <p>${document.getElementById('type-garantie')?.options[document.getElementById('type-garantie').selectedIndex]?.text || "Caution"}</p>
                            </div>
                            <div>
                                <p class="font-bold">TAEG approximatif:</p>
                                <p>${document.getElementById('taeg')?.textContent || "N/A"}</p>
                            </div>
                            <div>
                                <p class="font-bold">Coût global:</p>
                                <p>${document.getElementById('cout-global')?.textContent || "N/A"}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // Ajouter les économies réalisées si elles existent
            const savingsSummary = document.getElementById('savings-summary');
            if (savingsSummary) {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border-l-4 border-green-500 bg-green-50 pl-4">
                        <h3 class="font-bold mb-2 text-green-700">Économies réalisées</h3>
                        <div class="text-sm">
                            ${savingsSummary.innerHTML.replace(/class=\"[^\\\"]*\\\"/g, '').replace(/<i[^>]*><\\/i>/g, '•')}
                        </div>
                    </div>
                `;
            }
            
            // Copie du tableau
            const tableContainer = document.createElement('div');
            tableContainer.innerHTML = `
                <h2 class="text-xl font-bold mb-4">Tableau d'amortissement</h2>
                <table class="min-w-full border border-gray-300">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="px-3 py-2 text-left border">Mois</th>
                            <th class="px-3 py-2 text-right border">Mensualité</th>
                            <th class="px-3 py-2 text-right border">Capital</th>
                            <th class="px-3 py-2 text-right border">Intérêts</th>
                            <th class="px-3 py-2 text-right border">Assurance</th>
                            <th class="px-3 py-2 text-right border">Capital restant</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${document.getElementById('amortization-table').innerHTML}
                    </tbody>
                </table>
            `;
            
            // Remplacer les classes de couleur Tailwind pour le PDF
            tableContainer.querySelectorAll('tr').forEach(row => {
                row.className = '';
                row.querySelectorAll('td').forEach(cell => {
                    cell.className = 'px-3 py-2 text-right border';
                });
                
                // Première cellule alignée à gauche
                if (row.querySelector('td')) {
                    row.querySelector('td').className = 'px-3 py-2 text-left border';
                }
            });
            
            element.appendChild(tableContainer);
            
            // Options pour html2pdf
            const options = {
                margin: 10,
                filename: 'tableau-amortissement.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };
            
            // Générer le PDF
            html2pdf().from(element).set(options).save().then(() => {
                // Suppression de l'élément temporaire après génération
                element.remove();
            });
        });
    }
    
    // Synchroniser les valeurs entre les modes
    function syncModeValues() {
        // Du mode durée vers le mode mensualité
        document.getElementById('early-repayment-amount-mensualite').value = document.getElementById('early-repayment-amount-duree').value;
        document.getElementById('early-repayment-month-slider-mensualite').value = document.getElementById('early-repayment-month-slider-duree').value;
        document.getElementById('early-repayment-month-value-mensualite').textContent = document.getElementById('early-repayment-month-value-duree').textContent;
        document.getElementById('penalty-months-slider-mensualite').value = document.getElementById('penalty-months-slider-duree').value;
        document.getElementById('penalty-months-value-mensualite').textContent = document.getElementById('penalty-months-value-duree').textContent;
        
        // Du mode mensualité vers le mode durée
        document.getElementById('early-repayment-amount-duree').addEventListener('input', function() {
            document.getElementById('early-repayment-amount-mensualite').value = this.value;
        });
        document.getElementById('early-repayment-month-slider-duree').addEventListener('input', function() {
            document.getElementById('early-repayment-month-slider-mensualite').value = this.value;
            document.getElementById('early-repayment-month-value-mensualite').textContent = this.value;
        });
        document.getElementById('penalty-months-slider-duree').addEventListener('input', function() {
            document.getElementById('penalty-months-slider-mensualite').value = this.value;
            document.getElementById('penalty-months-value-mensualite').textContent = `${this.value} mois`;
        });
        
        // Du mode mensualité vers le mode durée
        document.getElementById('early-repayment-amount-mensualite').addEventListener('input', function() {
            document.getElementById('early-repayment-amount-duree').value = this.value;
        });
        document.getElementById('early-repayment-month-slider-mensualite').addEventListener('input', function() {
            document.getElementById('early-repayment-month-slider-duree').value = this.value;
            document.getElementById('early-repayment-month-value-duree').textContent = this.value;
        });
        document.getElementById('penalty-months-slider-mensualite').addEventListener('input', function() {
            document.getElementById('penalty-months-slider-duree').value = this.value;
            document.getElementById('penalty-months-value-duree').textContent = `${this.value} mois`;
        });
    }
    
    // Calculer les résultats initiaux au chargement de la page
    if (document.getElementById('loan-amount')) {
        // Initialiser la synchronisation des valeurs entre les modes
        setTimeout(syncModeValues, 500);
        
        // Lancer le calcul initial
        setTimeout(calculateLoan, 1000);
    }
});