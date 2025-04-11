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
        fraisCourtage = 0, // NOUVEAU: Frais de courtage
        typeGarantie = 'caution',
        assuranceSurCapitalInitial = false,
        periodicite = 'mensuel', // NOUVEAU: Périodicité des remboursements
        differeMois = 0 // NOUVEAU: Différé d'amortissement
    }) {
        this.capital = capital;
        this.tauxMensuel = tauxAnnuel / 100 / 12;
        this.dureeMois = dureeMois;
        this.assuranceMensuelle = assuranceAnnuelle / 100 / 12;
        this.indemnitesMois = indemnitesMois;
        this.assuranceSurCapitalInitial = assuranceSurCapitalInitial;
        
        // Stockage de l'assurance fixe sur capital initial pour éviter la confusion
        this.assuranceMensuelleFixe = this.assuranceSurCapitalInitial ? 
            capital * this.assuranceMensuelle : null;

        // Frais annexes
        this.fraisDossier = fraisDossier;
        this.fraisTenueCompte = fraisTenueCompte;
        this.fraisCourtage = fraisCourtage; // NOUVEAU
        
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
        
        // NOUVEAU: Gestion de la périodicité
        this.periodicite = periodicite;
        this.facteurPeriodicite = 1; // Par défaut mensuel
        if (periodicite === 'trimestriel') {
            this.facteurPeriodicite = 3;
            this.tauxMensuel = tauxAnnuel / 100 / 4; // Taux trimestriel
        } else if (periodicite === 'annuel') {
            this.facteurPeriodicite = 12;
            this.tauxMensuel = tauxAnnuel / 100; // Taux annuel
        }
        
        // NOUVEAU: Gestion du différé d'amortissement
        this.differeMois = differeMois;
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
        comparerScenarios = false // NOUVEAU: Option pour comparer avec/sans remboursement anticipé
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
        let dureeReelle = 0;
        
        // Suivi avant remboursement anticipé
        let interetsAvantRembours = 0;
        let mensualitesAvantRembours = 0;
        
        // NOUVEAU: Conservation des données sans remboursement anticipé pour comparaison
        let tableauSansAnticipe = [];
        let mensualiteSansAnticipe = mensualite;
        let capitalRestantSansAnticipe = this.capital;
        let tauxMensuelSansAnticipe = this.tauxMensuel;
        let totalInteretsSansAnticipe = 0;
        let totalAssuranceSansAnticipe = 0;
        let totalCapitalAmortiSansAnticipe = 0;
        let dureeReelleSansAnticipe = 0;
        
        // Remplacer la boucle for par une boucle while pour mieux gérer le remboursement anticipé
        let mois = 1;
        // Limite de sécurité (150% de la durée initiale pour éviter les boucles infinies)
        let maxMois = Math.ceil(this.dureeMois * 1.5);
        
        while ((capitalRestant > 0 || (comparerScenarios && capitalRestantSansAnticipe > 0)) && mois <= maxMois) {
            // Calculs pour scénario avec remboursement anticipé
            if (capitalRestant > 0) {
                let interets = capitalRestant * tauxMensuel;
                
                // Calcul de l'assurance selon le mode (capital initial ou restant dû)
                let assurance = this.assuranceSurCapitalInitial ? 
                    (this.assuranceMensuelleFixe || capitalInitial * assuranceMensuelle) : 
                    capitalRestant * assuranceMensuelle;
                
                // Gestion du différé d'amortissement
                let capitalAmorti = 0;
                if (mois <= this.differeMois) {
                    // En période de différé, on ne rembourse que les intérêts
                    capitalAmorti = 0;
                } else {
                    // Période normale, remboursement du capital
                    capitalAmorti = mensualite - interets;
                }
                
                // Calculs avant remboursement anticipé
                if (moisAnticipe && mois < moisAnticipe) {
                    interetsAvantRembours += interets;
                    mensualitesAvantRembours += (mensualite + assurance);
                }
                
                // Réinjection de capital (remboursement anticipé partiel)
                if (moisAnticipe && mois === moisAnticipe) {
                    capitalRestant -= remboursementAnticipe;
                    
                    // Appliquer d'abord le nouveau taux si spécifié
                    if (nouveauTaux !== null) {
                        tauxMensuel = nouveauTaux / 100 / 12;
                        
                        // Ajuster le taux en fonction de la périodicité
                        if (this.periodicite === 'trimestriel') {
                            tauxMensuel = nouveauTaux / 100 / 4;
                        } else if (this.periodicite === 'annuel') {
                            tauxMensuel = nouveauTaux / 100;
                        }
                    }
                    
                    // Déterminer le comportement selon le mode de remboursement
                    if (modeRemboursement === 'duree') {
                        // Recalculer la nouvelle durée à mensualité constante
                        const nouvelleDuree = Math.log(1 - (capitalRestant * tauxMensuel) / mensualite) / Math.log(1 + tauxMensuel);
                        this.dureeMois = Math.ceil(nouvelleDuree);
                    } else if (modeRemboursement === 'mensualite') {
                        // Recalculer la nouvelle mensualité pour durée restante
                        const dureeRestante = this.dureeMois - mois;
                        mensualite = capitalRestant * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeRestante));
                    }
                }
                
                capitalRestant -= capitalAmorti;
                if (capitalRestant < 0) capitalRestant = 0;
                
                totalInterets += interets;
                totalAssurance += assurance;
                totalCapitalAmorti += capitalAmorti;
                dureeReelle = mois;
                
                // Remplissage du tableau d'amortissement
                tableau.push({
                    mois,
                    capital: capitalAmorti.toFixed(2),
                    interets: interets.toFixed(2),
                    assurance: assurance.toFixed(2),
                    mensualite: (mensualite + assurance).toFixed(2),
                    capitalRestant: capitalRestant.toFixed(2)
                });
            }
            
            // Calculs pour scénario sans remboursement anticipé (si option activée)
            if (comparerScenarios && capitalRestantSansAnticipe > 0) {
                let interetsSansAnticipe = capitalRestantSansAnticipe * tauxMensuelSansAnticipe;
                
                // Calcul de l'assurance sans remboursement anticipé
                let assuranceSansAnticipe = this.assuranceSurCapitalInitial ? 
                    (this.assuranceMensuelleFixe || capitalInitial * assuranceMensuelle) : 
                    capitalRestantSansAnticipe * assuranceMensuelle;
                
                // Gestion du différé d'amortissement pour scénario sans anticipé
                let capitalAmortiSansAnticipe = 0;
                if (mois <= this.differeMois) {
                    capitalAmortiSansAnticipe = 0;
                } else {
                    capitalAmortiSansAnticipe = mensualiteSansAnticipe - interetsSansAnticipe;
                }
                
                capitalRestantSansAnticipe -= capitalAmortiSansAnticipe;
                if (capitalRestantSansAnticipe < 0) capitalRestantSansAnticipe = 0;
                
                totalInteretsSansAnticipe += interetsSansAnticipe;
                totalAssuranceSansAnticipe += assuranceSansAnticipe;
                totalCapitalAmortiSansAnticipe += capitalAmortiSansAnticipe;
                dureeReelleSansAnticipe = mois;
                
                // Remplissage du tableau d'amortissement sans remboursement anticipé
                tableauSansAnticipe.push({
                    mois,
                    capital: capitalAmortiSansAnticipe.toFixed(2),
                    interets: interetsSansAnticipe.toFixed(2),
                    assurance: assuranceSansAnticipe.toFixed(2),
                    mensualite: (mensualiteSansAnticipe + assuranceSansAnticipe).toFixed(2),
                    capitalRestant: capitalRestantSansAnticipe.toFixed(2)
                });
            }
            
            mois++;
        }
        
        // Calcul des indemnités de remboursement anticipé avec plafond légal
        let indemnites = 0;
        if (remboursementAnticipe > 0 && moisAnticipe) {
            // Calcul avec la formule standard
            const indemniteStandard = remboursementAnticipe * tauxMensuel * this.indemnitesMois;
            
            // Calcul des plafonds légaux
            const plafond3Pourcent = remboursementAnticipe * 0.03;
            const plafond6Mois = mensualite * 6;
            
            // Application du minimum entre la formule standard et les plafonds légaux
            indemnites = Math.min(indemniteStandard, Math.min(plafond3Pourcent, plafond6Mois));
        }
        
        // Calcul des économies réalisées avec le remboursement anticipé
        const dureeInitiale = this.dureeMois;
        
        // Calcul du montant total payé
        const montantTotal = totalInterets + totalAssurance + totalCapitalAmorti;
        
        // Total des frais annexes
        const totalFrais = this.fraisDossier + this.fraisTenueCompte + this.fraisGarantie + this.fraisCourtage;
        
        // Coût global (tout compris)
        const coutGlobalTotal = montantTotal + indemnites + totalFrais;
        
        // Calcul du TAEG approximatif
        const tauxEffectifAnnuel = ((Math.pow((coutGlobalTotal / this.capital), (12 / dureeReelle)) - 1) * 12) * 100;
        
        // Valeurs pour comparaison des scénarios
        let montantTotalSansAnticipe = 0;
        let coutGlobalTotalSansAnticipe = 0;
        let economieRealisee = 0;
        let pourcentageEconomie = 0;
        
        if (comparerScenarios) {
            montantTotalSansAnticipe = totalInteretsSansAnticipe + totalAssuranceSansAnticipe + totalCapitalAmortiSansAnticipe;
            coutGlobalTotalSansAnticipe = montantTotalSansAnticipe + totalFrais;
            economieRealisee = coutGlobalTotalSansAnticipe - coutGlobalTotal;
            pourcentageEconomie = (economieRealisee / coutGlobalTotalSansAnticipe) * 100;
        }
        
        return {
            tableau,
            mensualiteInitiale: mensualite.toFixed(2),
            indemnites: indemnites.toFixed(2),
            totalInterets: totalInterets.toFixed(2),
            totalAssurance: totalAssurance.toFixed(2),
            totalCapitalAmorti: totalCapitalAmorti.toFixed(2),
            capitalInitial: this.capital.toFixed(2),
            totalPaye: montantTotal.toFixed(2),
            dureeReelle,
            dureeInitiale,
            taeg: tauxEffectifAnnuel.toFixed(2),
            totalFrais: totalFrais.toFixed(2),
            coutGlobalTotal: coutGlobalTotal.toFixed(2),
            // Données pour comparaison
            comparerScenarios,
            tableauSansAnticipe: comparerScenarios ? tableauSansAnticipe : null,
            dureeReelleSansAnticipe: comparerScenarios ? dureeReelleSansAnticipe : null,
            totalInteretsSansAnticipe: comparerScenarios ? totalInteretsSansAnticipe.toFixed(2) : null,
            totalAssuranceSansAnticipe: comparerScenarios ? totalAssuranceSansAnticipe.toFixed(2) : null,
            coutGlobalTotalSansAnticipe: comparerScenarios ? coutGlobalTotalSansAnticipe.toFixed(2) : null,
            economieRealisee: comparerScenarios ? economieRealisee.toFixed(2) : null,
            pourcentageEconomie: comparerScenarios ? pourcentageEconomie.toFixed(2) : null,
            // Infos du remboursement
            remboursementAnticipe,
            moisAnticipe,
            nouveauTaux,
            modeRemboursement,
            periodicite: this.periodicite,
            differeMois: this.differeMois
        };
    }
    
    /**
     * Calcule le Taux Annuel Effectif Global selon la formule réglementaire
     * @param {Object} result - Résultat de la simulation
     * @returns {number} TAEG en pourcentage
     */
    calculerTaegReel(result) {
        // Cette fonction utiliserait une méthode itérative (comme Newton-Raphson)
        // pour résoudre l'équation: Σ(CFᵢ / (1 + TAEG)^(tᵢ/365)) = 0
        // où CFᵢ sont les flux de trésorerie (négatif pour l'emprunt, positifs pour les remboursements)
        // et tᵢ est le temps en jours depuis le début du prêt

        // Version simplifiée pour l'exemple
        return this.calculerTaegApproximatif(result);
    }
    
    /**
     * Calcule une approximation du TAEG
     * @param {Object} result - Résultat de la simulation
     * @returns {number} TAEG approximatif en pourcentage
     */
    calculerTaegApproximatif(result) {
        const { coutGlobalTotal, dureeReelle, capitalInitial } = result;
        // Formule: ((coût total / capital) ^ (12/durée en mois) - 1) * 12 * 100
        return ((Math.pow((parseFloat(coutGlobalTotal) / parseFloat(capitalInitial)), (12 / dureeReelle)) - 1) * 12) * 100;
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
    const earlyRepaymentMonthSlider = document.getElementById('early-repayment-month-slider');
    const earlyRepaymentMonthValue = document.getElementById('early-repayment-month-value');
    const newInterestRateSlider = document.getElementById('new-interest-rate-slider');
    const newInterestRateValue = document.getElementById('new-interest-rate-value');
    const penaltyMonthsSlider = document.getElementById('penalty-months-slider');
    const penaltyMonthsValue = document.getElementById('penalty-months-value');
    const calculateLoanButton = document.getElementById('calculate-loan-button');
    const exportPdfButton = document.getElementById('export-pdf');
    const compareScenarios = document.getElementById('compare-scenarios');

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
    
    if (earlyRepaymentMonthSlider && earlyRepaymentMonthValue) {
        earlyRepaymentMonthSlider.addEventListener('input', function() {
            earlyRepaymentMonthValue.textContent = this.value;
        });
    }
    
    if (newInterestRateSlider && newInterestRateValue) {
        newInterestRateSlider.addEventListener('input', function() {
            newInterestRateValue.textContent = `${this.value}%`;
        });
    }
    
    if (penaltyMonthsSlider && penaltyMonthsValue) {
        penaltyMonthsSlider.addEventListener('input', function() {
            penaltyMonthsValue.textContent = `${this.value} mois`;
        });
    }

    // Gestion du mode de remboursement anticipé
    const modeDuree = document.getElementById('mode-duree');
    const modeMensualite = document.getElementById('mode-mensualite');
    const remboursementMode = document.getElementById('remboursement-mode');
    
    if (modeDuree && modeMensualite && remboursementMode) {
        modeDuree.addEventListener('click', function() {
            modeDuree.classList.add('active', 'text-green-400');
            modeMensualite.classList.remove('active', 'text-green-400');
            modeMensualite.classList.add('text-gray-300');
            remboursementMode.value = 'duree';
        });
        
        modeMensualite.addEventListener('click', function() {
            modeMensualite.classList.add('active', 'text-green-400');
            modeDuree.classList.remove('active', 'text-green-400');
            modeDuree.classList.add('text-gray-300');
            remboursementMode.value = 'mensualite';
        });
    }

    // Fonction pour calculer et afficher les résultats
    function calculateLoan() {
        // Récupération des paramètres de base
        const loanAmount = parseFloat(document.getElementById('loan-amount').value);
        const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
        const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
        const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
        const earlyRepaymentAmount = parseFloat(document.getElementById('early-repayment-amount').value);
        const earlyRepaymentMonth = parseInt(document.getElementById('early-repayment-month-slider').value);
        const newInterestRate = parseFloat(document.getElementById('new-interest-rate-slider').value);
        const penaltyMonths = parseInt(document.getElementById('penalty-months-slider').value);
        
        // Récupération des frais annexes
        const fraisDossier = parseFloat(document.getElementById('frais-dossier')?.value || 2000);
        const fraisTenueCompte = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710);
        const fraisCourtage = parseFloat(document.getElementById('frais-courtage')?.value || 0);
        
        // Récupération des frais de garantie (valeur saisie ou calculée)
        const fraisGarantieInput = document.getElementById('frais-garantie');
        let fraisGarantie = null;
        if (fraisGarantieInput) {
            fraisGarantie = fraisGarantieInput.value ? 
                parseFloat(fraisGarantieInput.value) : 
                (fraisGarantieInput.dataset.autoValue ? parseFloat(fraisGarantieInput.dataset.autoValue) : null);
        }
        
        // Récupération des autres paramètres
        const typeGarantie = document.getElementById('type-garantie')?.value || 'caution';
        const assuranceSurCapitalInitial = document.getElementById('assurance-capital-initial')?.checked || false;
        const remboursementMode = document.getElementById('remboursement-mode')?.value || 'duree';
        const periodicite = document.getElementById('periodicite')?.value || 'mensuel';
        const differeMois = parseInt(document.getElementById('differe-amortissement')?.value || 0);
        const comparerScenarios = document.getElementById('compare-scenarios')?.checked || false;

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
            fraisCourtage: fraisCourtage,
            typeGarantie: typeGarantie,
            assuranceSurCapitalInitial: assuranceSurCapitalInitial,
            periodicite: periodicite,
            differeMois: differeMois
        });

        // Calcul du tableau d'amortissement
        const result = simulator.tableauAmortissement({
            remboursementAnticipe: earlyRepaymentAmount,
            moisAnticipe: earlyRepaymentMonth,
            nouveauTaux: newInterestRate,
            modeRemboursement: remboursementMode,
            comparerScenarios: comparerScenarios
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
        
        if (totalFeesElement) totalFeesElement.textContent = formatMontant(result.totalFrais);
        if (taegElement) taegElement.textContent = result.taeg + '%';
        if (coutGlobalElement) coutGlobalElement.textContent = formatMontant(result.coutGlobalTotal);

        // Affichage de la comparaison
        const comparisonTable = document.getElementById('comparison-table');
        const comparisonTableBody = document.getElementById('comparison-table-body');
        
        if (comparisonTable && comparisonTableBody && comparerScenarios) {
            comparisonTable.classList.remove('hidden');
            comparisonTableBody.innerHTML = '';
            
            // Ajouter les lignes de comparaison
            const comparisons = [
                {
                    label: 'Durée totale',
                    sans: `${result.dureeReelleSansAnticipe} mois`,
                    avec: `${result.dureeReelle} mois`,
                    diff: `${result.dureeReelleSansAnticipe - result.dureeReelle} mois`
                },
                {
                    label: 'Total des intérêts',
                    sans: formatMontant(result.totalInteretsSansAnticipe),
                    avec: formatMontant(result.totalInterets),
                    diff: formatMontant(parseFloat(result.totalInteretsSansAnticipe) - parseFloat(result.totalInterets))
                },
                {
                    label: 'Total assurance',
                    sans: formatMontant(result.totalAssuranceSansAnticipe),
                    avec: formatMontant(result.totalAssurance),
                    diff: formatMontant(parseFloat(result.totalAssuranceSansAnticipe) - parseFloat(result.totalAssurance))
                },
                {
                    label: 'Coût global',
                    sans: formatMontant(result.coutGlobalTotalSansAnticipe),
                    avec: formatMontant(result.coutGlobalTotal),
                    diff: formatMontant(result.economieRealisee)
                },
                {
                    label: 'Économie réalisée',
                    sans: '-',
                    avec: formatMontant(result.economieRealisee),
                    diff: `${result.pourcentageEconomie}%`
                }
            ];
            
            // Remplir le tableau
            comparisons.forEach(item => {
                const tr = document.createElement('tr');
                tr.classList.add('bg-blue-800', 'bg-opacity-10');
                tr.innerHTML = `
                    <td class="px-3 py-2 font-medium">${item.label}</td>
                    <td class="px-3 py-2 text-right">${item.sans}</td>
                    <td class="px-3 py-2 text-right">${item.avec}</td>
                    <td class="px-3 py-2 text-right font-medium text-green-400">${item.diff}</td>
                `;
                comparisonTableBody.appendChild(tr);
            });
        } else if (comparisonTable) {
            comparisonTable.classList.add('hidden');
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
            if (parseInt(row.mois) === earlyRepaymentMonth) {
                tr.classList.add('bg-green-900', 'bg-opacity-20');
            } else {
                tr.classList.add(i % 2 === 0 ? 'bg-blue-800' : 'bg-blue-900', 'bg-opacity-10');
            }
            
            tr.innerHTML = `
                <td class="px-3 py-2">${row.mois}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.mensualite)}</td>
                <td class="px-3 py-2 text-right">${formatMontant(row.capital)}</td>
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
        updateSavingsSummary(result);
    }
    
    // Fonction pour ajouter un résumé des économies
    function updateSavingsSummary(result) {
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
        
        // Calculer le pourcentage d'économies sur les intérêts
        const totalInterets = parseFloat(result.totalInterets);
        const totalInteretsInitial = result.comparerScenarios ? parseFloat(result.totalInteretsSansAnticipe) : totalInterets;
        const economieInterets = result.comparerScenarios ? totalInteretsInitial - totalInterets : 0;
        const pourcentageEconomieInterets = (economieInterets / totalInteretsInitial) * 100;
        
        // Construction du contenu en fonction du mode comparaison
        let content = `
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
        `;
        
        // Ajouter les infos de remboursement anticipé si pertinent
        if (result.remboursementAnticipe > 0) {
            content += `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Remboursement anticipé de ${formatMontant(result.remboursementAnticipe)} au mois ${result.moisAnticipe}</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Indemnités de remboursement anticipé: ${formatMontant(result.indemnites)} 
                    (plafonnées légalement à 6 mois d'intérêts ou 3% du capital remboursé)</span>
                </li>
            `;
            
            // Ajouter les infos d'économies si en mode comparaison
            if (result.comparerScenarios) {
                content += `
                    <li class="flex items-start">
                        <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                        <span>Vous économisez ${formatMontant(result.economieRealisee)} (${result.pourcentageEconomie}% du coût total)</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                        <span>Réduction de la durée du prêt de ${result.dureeReelleSansAnticipe - result.dureeReelle} mois</span>
                    </li>
                `;
            }
        }
        
        // Ajouter les infos générales
        content += `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>TAEG approximatif: ${result.taeg}%</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Frais annexes: ${formatMontant(result.totalFrais)}</span>
                </li>
            </ul>
        `;
        
        savingsSummary.innerHTML = content;
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
        
        // Données pour la comparaison si activée
        const capitalDataSansAnticipe = [];
        const interestDataSansAnticipe = [];
        
        // Échantillonnage des données pour le graphique (une donnée tous les 3 mois)
        const sampleRate = Math.max(1, Math.floor(result.tableau.length / 40));
        
        for (let i = 0; i < result.tableau.length; i += sampleRate) {
            const row = result.tableau[i];
            labels.push(`Mois ${row.mois}`);
            capitalData.push(parseFloat(row.capitalRestant));
            
            // Calcul cumulatif des intérêts et assurances
            let cumulativeInterest = 0;
            let cumulativeInsurance = 0;
            
            for (let j = 0; j <= i; j++) {
                cumulativeInterest += parseFloat(result.tableau[j].interets);
                cumulativeInsurance += parseFloat(result.tableau[j].assurance);
            }
            
            interestData.push(cumulativeInterest);
            insuranceData.push(cumulativeInsurance);
        }
        
        // Si comparaison activée, ajouter les données du scénario sans remboursement anticipé
        if (result.comparerScenarios && result.tableauSansAnticipe) {
            // Utiliser la même fréquence d'échantillonnage
            for (let i = 0; i < result.tableauSansAnticipe.length; i += sampleRate) {
                if (i < result.tableauSansAnticipe.length) {
                    const row = result.tableauSansAnticipe[i];
                    capitalDataSansAnticipe.push(parseFloat(row.capitalRestant));
                    
                    // Calcul cumulatif des intérêts
                    let cumulativeInterestSansAnticipe = 0;
                    
                    for (let j = 0; j <= i && j < result.tableauSansAnticipe.length; j++) {
                        cumulativeInterestSansAnticipe += parseFloat(result.tableauSansAnticipe[j].interets);
                    }
                    
                    interestDataSansAnticipe.push(cumulativeInterestSansAnticipe);
                }
            }
        }
        
        // Ajout des frais annexes sous forme de point de départ
        const feesData = Array(labels.length).fill(0);
        feesData[0] = parseFloat(result.totalFrais);
        
        // Création des datasets
        const datasets = [
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
        ];
        
        // Ajouter les datasets de comparaison si activé
        if (result.comparerScenarios) {
            datasets.push({
                label: 'Capital restant (sans RA)',
                data: capitalDataSansAnticipe,
                borderColor: 'rgba(52, 211, 153, 0.5)',
                borderDash: [5, 5],
                fill: false,
                tension: 0.4
            });
            
            datasets.push({
                label: 'Intérêts cumulés (sans RA)',
                data: interestDataSansAnticipe,
                borderColor: 'rgba(239, 68, 68, 0.5)',
                borderDash: [5, 5],
                fill: false,
                tension: 0.4
            });
        }
        
        // Création du graphique
        loanChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
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
        const earlyRepaymentMonth = parseInt(document.getElementById('early-repayment-month-slider').value);
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
    
    // Mise à jour des frais de garantie en fonction du type sélectionné
    const typeGarantie = document.getElementById('type-garantie');
    const fraisGarantieInput = document.getElementById('frais-garantie');
    const loanAmountInput = document.getElementById('loan-amount');
    
    function updateGarantieEstimation() {
        if (typeGarantie && fraisGarantieInput && loanAmountInput) {
            const capital = parseFloat(loanAmountInput.value);
            const type = typeGarantie.value;
            
            let fraisEstimes;
            switch(type) {
                case 'hypotheque':
                    fraisEstimes = Math.max(capital * 0.015, 800); // Min 800€
                    break;
                case 'ppd':
                    fraisEstimes = Math.max(capital * 0.01, 500); // Min 500€
                    break;
                case 'caution':
                default:
                    fraisEstimes = capital * 0.013709; // Crédit Logement
            }
            
            fraisGarantieInput.placeholder = fraisEstimes.toFixed(2) + " €";
            if (!fraisGarantieInput.value) {
                fraisGarantieInput.dataset.autoValue = fraisEstimes;
            }
        }
    }
    
    if (typeGarantie) {
        typeGarantie.addEventListener('change', updateGarantieEstimation);
    }
    
    if (loanAmountInput) {
        loanAmountInput.addEventListener('change', updateGarantieEstimation);
        loanAmountInput.addEventListener('input', updateGarantieEstimation);
    }
    
    // Export PDF
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', function() {
            // Créer une zone pour l'export PDF
            const element = document.createElement('div');
            element.className = 'pdf-export bg-white text-black p-8';
            document.body.appendChild(element);
            
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
                    <div>
                        <p class="font-bold">TAEG approximatif:</p>
                        <p>${document.getElementById('taeg')?.textContent || "N/A"}</p>
                    </div>
                    <div>
                        <p class="font-bold">Coût global:</p>
                        <p>${document.getElementById('cout-global')?.textContent || "N/A"}</p>
                    </div>
                </div>
            `;
            
            // Ajouter les infos de remboursement anticipé
            element.innerHTML += `
                <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                    <h3 class="font-bold mb-2">Remboursement anticipé</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="font-bold">Montant remboursé par anticipation:</p>
                            <p>${document.getElementById('early-repayment-amount').value} €</p>
                        </div>
                        <div>
                            <p class="font-bold">Mois du remboursement:</p>
                            <p>${document.getElementById('early-repayment-month-slider').value}</p>
                        </div>
                        <div>
                            <p class="font-bold">Taux après renégociation:</p>
                            <p>${document.getElementById('new-interest-rate-slider').value}%</p>
                        </div>
                        <div>
                            <p class="font-bold">Indemnités (mois):</p>
                            <p>${document.getElementById('penalty-months-slider').value} mois</p>
                        </div>
                        <div>
                            <p class="font-bold">Mode de remboursement:</p>
                            <p>${document.getElementById('remboursement-mode').value === 'duree' ? 'Réduction de durée' : 'Réduction de mensualité'}</p>
                        </div>
                        <div>
                            <p class="font-bold">Périodicité:</p>
                            <p>${document.getElementById('periodicite').options[document.getElementById('periodicite').selectedIndex].text}</p>
                        </div>
                        <div>
                            <p class="font-bold">Différé:</p>
                            <p>${document.getElementById('differe-amortissement').value} mois</p>
                        </div>
                    </div>
                </div>
            `;
            
            // Ajouter les frais annexes
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
                            <p class="font-bold">Frais de courtage:</p>
                            <p>${document.getElementById('frais-courtage').value} €</p>
                        </div>
                        <div>
                            <p class="font-bold">Frais de tenue de compte:</p>
                            <p>${document.getElementById('frais-tenue-compte').value} €</p>
                        </div>
                        <div>
                            <p class="font-bold">Type de garantie:</p>
                            <p>${document.getElementById('type-garantie').options[document.getElementById('type-garantie').selectedIndex].text}</p>
                        </div>
                        <div>
                            <p class="font-bold">Assurance sur capital initial:</p>
                            <p>${document.getElementById('assurance-capital-initial').checked ? 'Oui' : 'Non'}</p>
                        </div>
                    </div>
                </div>
            `;
            
            // Ajouter les économies réalisées si elles existent
            const savingsSummary = document.getElementById('savings-summary');
            if (savingsSummary) {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border-l-4 border-green-500 bg-green-50 pl-4">
                        <h3 class="font-bold mb-2 text-green-700">Économies réalisées</h3>
                        <div class="text-sm">
                            ${savingsSummary.innerHTML.replace(/class=\\\"[^\\\"]*\\\"/g, '').replace(/<i[^>]*><\\/i>/g, '•')}
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
    
    // Calculer les résultats initiaux au chargement de la page si les éléments nécessaires existent
    if (document.getElementById('loan-amount') && document.getElementById('interest-rate-slider')) {
        // Initialiser l'estimation des frais de garantie
        updateGarantieEstimation();
        // Calculer les résultats
        calculateLoan();
    }
});
