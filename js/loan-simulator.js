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
        
        // Définir la durée finale en fonction du mode
        let dureeFinale = this.dureeMois;
        if (modeRemboursement === 'duree' && moisAReduire > 0) {
            dureeFinale = Math.max(1, this.dureeMois - moisAReduire);
        }
        
        // Suivi avant remboursement anticipé
        let interetsAvantRembours = 0;
        let mensualitesAvantRembours = 0;
        
        // Seuil minimum pour les remboursements anticipés (10% du capital initial ou 1000€)
        const seuilMinimum = Math.max(1000, capitalInitial * 0.10);
        
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
                // Afficher un avertissement si le montant est inférieur au seuil minimum,
                // mais appliquer quand même le remboursement
                if (remboursementCourant.montant < seuilMinimum) {
                    console.warn(`Remboursement au mois ${mois}: montant ${remboursementCourant.montant}€ inférieur au seuil recommandé (${seuilMinimum}€) mais appliqué quand même.`);
                }
                
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
        
        // Indemnités pour le mode durée si aucun remboursement anticipé n'est défini
        if (modeRemboursement === 'duree' && moisAReduire > 0 && indemnites === 0) {
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
            
            // Récupérer les nouveaux paramètres
            const fraisDossier = parseFloat(document.getElementById('frais-dossier')?.value || 2000);
            const fraisTenueCompte = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710);
            
            // Récupérer les frais de garantie (valeur saisie ou calculée)
            const fraisGarantieInput = document.getElementById('frais-garantie');
            let fraisGarantie = null;
            if (fraisGarantieInput) {
                if (fraisGarantieInput.value && fraisGarantieInput.value.trim() !== '') {
                    fraisGarantie = parseFloat(fraisGarantieInput.value);
                } else {
                    // Calculer automatiquement si vide
                    fraisGarantie = Math.round(loanAmount * 0.013709);
                    // Mettre la valeur directement dans le champ au lieu du placeholder
                    fraisGarantieInput.value = fraisGarantie;
                }
            }
            
            const typeGarantie = document.getElementById('type-garantie')?.value || 'caution';
            const assuranceSurCapitalInitial = document.getElementById('assurance-capital-initial')?.checked || false;
            
            // Récupérer le mode de remboursement (durée ou mensualité)
            const modeRemboursement = document.getElementById('remboursement-mode')?.value || 'duree';
            
            // Variables pour stocker les valeurs du remboursement anticipé
            let moisAReduire = 0;
            
            // Récupération des valeurs en fonction du mode de remboursement actif
            if (modeRemboursement === 'duree') {
                // Pour le mode durée, on utilise le nombre de mois à réduire
                const reductionDureeMois = document.getElementById('reduction-duree-mois');
                moisAReduire = reductionDureeMois ? parseInt(reductionDureeMois.value || 12) : 12;
            }
            
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

            // Calcul du tableau d'amortissement avec les nouveaux paramètres
            const result = simulator.tableauAmortissement({
                nouveauTaux: newInterestRate,
                moisRenegociation: renegotiationMonth,
                modeRemboursement: modeRemboursement,
                moisAReduire: moisAReduire,
                remboursementsAnticipes: remboursementsAnticipes,
                appliquerRenegociation: applyRenegotiation // Ajout du paramètre pour rendre la renégociation optionnelle
            });

            console.log("Résultats calculés:", result);

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
        // Rechercher ou créer la section de résumé
        let savingsSummary = document.getElementById('savings-summary');
        
        if (!savingsSummary) {
            savingsSummary = document.createElement('div');
            savingsSummary.id = 'savings-summary';
            savingsSummary.className = 'bg-blue-900 bg-opacity-20 p-4 rounded-lg border-l-4 border-green-400 mt-6';
            
            // Ajouter après le graphique
            const chartContainer = document.querySelector('.chart-container');
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
            
            // Récupérer la valeur du mois de renégociation et l'état de la case à cocher
            const renegotiationMonth = document.getElementById('renegotiation-month-slider').value;
            const applyRenegotiation = document.getElementById('apply-renegotiation')?.checked || false;
            
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
            
            // Ajouter les infos de renégociation
            element.innerHTML += `
                <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                    <h3 class="font-bold mb-2">Options avancées</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="font-bold">Nouveau taux après renégociation:</p>
                            <p>${document.getElementById('new-interest-rate-slider').value}%</p>
                        </div>
                        <div>
                            <p class="font-bold">Mois de la renégociation:</p>
                            <p>${renegotiationMonth}</p>
                        </div>
                        <div>
                            <p class="font-bold">Appliquer la renégociation:</p>
                            <p>${applyRenegotiation ? 'Oui' : 'Non'}</p>
                        </div>
                    </div>
                </div>
            `;
            
            // Ajouter la section des remboursements anticipés multiples
            if (window.storedRepayments && window.storedRepayments.length > 0) {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                        <h3 class="font-bold mb-2">Remboursements anticipés configurés (${window.storedRepayments.length})</h3>
                        <table class="w-full border-collapse border border-gray-300">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="border border-gray-300 p-2 text-left">Mois</th>
                                    <th class="border border-gray-300 p-2 text-left">Mode</th>
                                    <th class="border border-gray-300 p-2 text-right">Montant/Durée</th>
                                    <th class="border border-gray-300 p-2 text-right">Indemnités</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                // Trier les remboursements par mois
                const sortedRepayments = [...window.storedRepayments].sort((a, b) => a.mois - b.mois);
                
                sortedRepayments.forEach(repayment => {
                    element.innerHTML += `
                        <tr>
                            <td class="border border-gray-300 p-2">${repayment.mois}</td>
                            <td class="border border-gray-300 p-2">${repayment.mode === 'duree' ? 'Réduction durée' : 'Réduction mensualité'}</td>
                            <td class="border border-gray-300 p-2 text-right">${
                                repayment.mode === 'duree' 
                                    ? `${repayment.moisAReduire} mois` 
                                    : formatMontant(repayment.montant)
                            }</td>
                            <td class="border border-gray-300 p-2 text-right">${repayment.indemnitesMois} mois</td>
                        </tr>
                    `;
                });
                
                element.innerHTML += `
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                // Si pas de remboursements multiples, afficher le remboursement simple
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
                                    <p class="font-bold">Indemnités (mois):</p>
                                    <p>${penaltyMonths} mois</p>
                                </div>
                            </div>
                        </div>
                    `;
                }
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
                                <p>${document.getElementById('type-garantie')?.options?.[document.getElementById('type-garantie').selectedIndex]?.text || "Caution"}</p>
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
                            ${savingsSummary.innerHTML.replace(/class=\"[^\"]*\"/g, '').replace(/<i[^>]*><\/i>/g, '•')}
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
    
    // Modification de la partie d'ajout des remboursements anticipés pour enlever la restriction sur le montant minimum
    document.addEventListener('DOMContentLoaded', function() {
        // ... Code existant ...
        
        // Gestion des remboursements anticipés multiples
        const addRepaymentBtn = document.getElementById('add-repayment-btn');
        const repaymentsList = document.getElementById('repayments-list');
        let repaymentsCount = 0;
        
        // Remboursements anticipés stockés
        window.storedRepayments = window.storedRepayments || [];
        
        if (addRepaymentBtn && repaymentsList) {
            addRepaymentBtn.addEventListener('click', function() {
                const mode = document.getElementById('remboursement-mode').value;
                let repayment = {};
                let montant = 0;
                
                // Calculer le seuil minimum (10% du capital initial ou 1000€)
                const loanAmount = parseFloat(document.getElementById('loan-amount').value);
                const seuilMinimum = Math.max(1000, loanAmount * 0.10);
                
                if (mode === 'duree') {
                    // Mode durée: estimer le montant à partir des mois à réduire
                    const moisAReduire = parseInt(document.getElementById('reduction-duree-mois').value);
                    // Estimation du montant à partir du nombre de mois (approximatif)
                    const tauxMensuel = parseFloat(document.getElementById('interest-rate-slider').value) / 100 / 12;
                    const dureeMois = parseInt(document.getElementById('loan-duration-slider').value) * 12;
                    const mensualite = loanAmount * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMois));
                    
                    montant = mensualite * moisAReduire * 0.8; // 80% de la mensualité * nb mois (approximation)
                    
                    // Mettre à jour le champ caché pour la compatibilité
                    document.getElementById('early-repayment-amount-duree').value = montant.toString();
                    
                    repayment = {
                        id: 'repayment-' + (++repaymentsCount),
                        mode: 'duree',
                        moisAReduire: moisAReduire,
                        mois: parseInt(document.getElementById('early-repayment-month-slider-duree').value),
                        indemnitesMois: parseInt(document.getElementById('penalty-months-slider-duree').value),
                        montant: montant // Ajout du montant estimé pour vérification
                    };
                } else {
                    montant = parseFloat(document.getElementById('early-repayment-amount-mensualite').value);
                    const totalRepayment = document.getElementById('total-repayment')?.checked || false;
                    
                    repayment = {
                        id: 'repayment-' + (++repaymentsCount),
                        mode: 'mensualite',
                        montant: montant,
                        mois: parseInt(document.getElementById('early-repayment-month-slider-mensualite').value),
                        indemnitesMois: parseInt(document.getElementById('penalty-months-slider-mensualite').value),
                        isRemboursementTotal: totalRepayment // Nouvelle propriété
                    };
                }
                
                // Afficher un message d'information si le montant est inférieur au seuil recommandé
                const alertElement = document.getElementById('min-threshold-alert');
                const thresholdElement = document.getElementById('min-threshold-amount');
                
                if (montant < seuilMinimum && alertElement && thresholdElement) {
                    // Mettre à jour le montant dans le message
                    thresholdElement.textContent = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(seuilMinimum);
                    
                    // Afficher l'alerte comme un simple rappel, pas comme une erreur bloquante
                    alertElement.classList.remove('hidden');
                    // Faire disparaître l'alerte après 5 secondes
                    setTimeout(() => {
                        alertElement.classList.add('hidden');
                    }, 5000);
                    
                    // Style visuel pour l'alerte, mais on continue quand même
                    this.classList.add('bg-amber-500', 'hover:bg-amber-400');
                    setTimeout(() => {
                        this.classList.remove('bg-amber-500', 'hover:bg-amber-400');
                        this.classList.add('bg-green-500', 'hover:bg-green-400');
                    }, 1000);
                }
                
                // Ajouter au tableau des remboursements (on ajoute TOUJOURS le remboursement, quelle que soit sa valeur)
                window.storedRepayments.push(repayment);
                
                // Mettre à jour l'affichage
                updateRepaymentsList();
                
                // Réinitialiser la case à cocher de remboursement total
                if (document.getElementById('total-repayment')) {
                    document.getElementById('total-repayment').checked = false;
                    const notice = document.getElementById('total-repayment-notice');
                    if (notice) notice.classList.add('hidden');
                }
                
                // Déclencher automatiquement le calcul
                document.getElementById('calculate-loan-button').click();
            });
            
            // Fonctions de gestion des repayments
            window.toggleRepaymentDetails = function(id) {
                const item = document.getElementById(id);
                if (item) {
                    item.classList.toggle('expanded');
                }
            };
            
            window.removeRepayment = function(id) {
                window.storedRepayments = window.storedRepayments.filter(r => r.id !== id);
                updateRepaymentsList();
                
                // Recalculer après suppression
                if (document.getElementById('calculate-loan-button')) {
                    document.getElementById('calculate-loan-button').click();
                }
            };
            
            // Fonction pour mettre à jour la liste des remboursements anticipés
            function updateRepaymentsList() {
                if (!repaymentsList) return;
                
                repaymentsList.innerHTML = '';
                
                if (window.storedRepayments.length === 0) {
                    repaymentsList.innerHTML = '<p class="text-sm text-gray-400 italic">Aucun remboursement anticipé configuré. Utilisez le formulaire ci-dessous pour en ajouter.</p>';
                    return;
                }
                
                // Trier les remboursements par mois
                window.storedRepayments.sort((a, b) => a.mois - b.mois);
                
                window.storedRepayments.forEach(repayment => {
                    const repaymentItem = document.createElement('div');
                    repaymentItem.id = repayment.id;
                    repaymentItem.className = 'repayment-item';
                    
                    let headerContent = '';
                    if (repayment.mode === 'duree') {
                        headerContent = `<strong>Mois ${repayment.mois}</strong> - Réduction de ${repayment.moisAReduire} mois`;
                    } else {
                        const totalText = repayment.isRemboursementTotal ? ' (Remboursement total)' : '';
                        headerContent = `<strong>Mois ${repayment.mois}</strong> - ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(repayment.montant)}${totalText}`;
                    }
                    
                    repaymentItem.innerHTML = `
                        <div class="repayment-item-header" onclick="toggleRepaymentDetails('${repayment.id}')">
                            <div>${headerContent}</div>
                            <div>
                                <button class="remove-repayment" onclick="event.stopPropagation(); removeRepayment('${repayment.id}')">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="repayment-item-body">
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <div><span class="text-gray-400">Mode:</span> ${repayment.mode === 'duree' ? 'Réduction de durée' : 'Réduction de mensualité'}</div>
                                <div><span class="text-gray-400">Mois:</span> ${repayment.mois}</div>
                                ${repayment.mode === 'duree' ? 
                                    `<div><span class="text-gray-400">Mois à réduire:</span> ${repayment.moisAReduire}</div>` : 
                                    `<div><span class="text-gray-400">Montant:</span> ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(repayment.montant)}</div>`
                                }
                                <div><span class="text-gray-400">Indemnités:</span> ${repayment.indemnitesMois} mois</div>
                                ${repayment.isRemboursementTotal ? 
                                    `<div class="col-span-2 mt-2 text-green-400"><i class="fas fa-check-circle mr-1"></i> Ce remboursement soldera intégralement votre prêt</div>` : 
                                    ''
                                }
                            </div>
                        </div>
                    `;
                    
                    repaymentsList.appendChild(repaymentItem);
                });
            }
            
            // Initialisation de la liste
            updateRepaymentsList();
        }
    });
    
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
