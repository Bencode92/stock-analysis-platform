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
        assuranceSurCapitalInitial = false,
        typePret = 'amortissable' // NOUVEAU: 'amortissable', 'inFine' ou 'degressif'
    }) {
        this.capital = capital;
        this.tauxMensuel = tauxAnnuel / 100 / 12;
        this.dureeMois = dureeMois;
        this.assuranceMensuelle = assuranceAnnuelle / 100 / 12;
        this.indemnitesMois = indemnitesMois;
        this.assuranceSurCapitalInitial = assuranceSurCapitalInitial;
        this.typePret = typePret; // NOUVEAU

        // Frais annexes
        this.fraisDossier = fraisDossier;
        this.fraisTenueCompte = fraisTenueCompte;
        
        // MODIFIÉ: Calcul simplifié des frais de garantie (toujours 1,3709% du capital)
        const fraisCalcules = capital * 0.013709;
        this.fraisGarantie = fraisGarantie !== null ? fraisGarantie : fraisCalcules;
    }
    
    calculerMensualite() {
        const { capital, tauxMensuel, dureeMois, typePret } = this;
        
        // MODIFIÉ: Calcul différent selon le type de prêt
        if (typePret === 'inFine') {
            return capital * tauxMensuel; // Uniquement les intérêts
        } else if (typePret === 'degressif') {
            const amortissementFixe = capital / dureeMois;
            return amortissementFixe + (capital * tauxMensuel); // Première mensualité
        } else {
            // Prêt amortissable classique
            return capital * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMois));
        }
    }
    
    tableauAmortissement({ 
        remboursementAnticipe = 0, 
        moisAnticipe = null, 
        nouveauTaux = null,
        moisNouveauTaux = null, // NOUVEAU: mois d'application du nouveau taux (indépendant du remboursement)
        modeRemboursement = 'duree' // 'duree' ou 'mensualite'
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
        
        // Suivi avant remboursement anticipé
        let interetsAvantRembours = 0;
        let mensualitesAvantRembours = 0;
        
        for (let mois = 1; mois <= this.dureeMois; mois++) {
            // NOUVEAU: Changement de taux indépendant du remboursement anticipé
            if (moisNouveauTaux && mois === moisNouveauTaux && nouveauTaux !== null) {
                tauxMensuel = nouveauTaux / 100 / 12;
                
                // Recalculer la mensualité selon le type de prêt
                if (this.typePret === 'inFine') {
                    mensualite = capitalRestant * tauxMensuel;
                } else if (this.typePret === 'degressif') {
                    const amortissementFixe = capitalRestant / (this.dureeMois - mois + 1);
                    mensualite = amortissementFixe + (capitalRestant * tauxMensuel);
                } else {
                    // Prêt amortissable classique
                    mensualite = capitalRestant * tauxMensuel / 
                        (1 - Math.pow(1 + tauxMensuel, -(this.dureeMois - mois + 1)));
                }
            }
            
            let interets = capitalRestant * tauxMensuel;
            
            // Calcul de l'assurance selon le mode (capital initial ou restant dû)
            let assurance = this.assuranceSurCapitalInitial ? 
                capitalInitial * assuranceMensuelle : 
                capitalRestant * assuranceMensuelle;
            
            // Calcul du capital amorti selon le type de prêt
            let capitalAmorti;
            
            if (this.typePret === 'inFine') {
                if (mois < this.dureeMois) {
                    capitalAmorti = 0; // Pas d'amortissement avant l'échéance
                    mensualite = interets; // Seulement les intérêts
                } else {
                    capitalAmorti = capitalRestant; // Remboursement total du capital à l'échéance
                    mensualite = interets + capitalRestant;
                }
            } else if (this.typePret === 'degressif') {
                const amortissementFixe = capitalInitial / this.dureeMois;
                capitalAmorti = amortissementFixe;
                mensualite = amortissementFixe + interets;
            } else {
                // Prêt amortissable classique
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
                
                // Recalculer mensualité si mode mensualité (mais pas besoin de changer le taux ici)
                if (modeRemboursement === 'mensualite') {
                    // Recalculer la mensualité pour la durée restante selon le type de prêt
                    if (this.typePret === 'inFine') {
                        mensualite = capitalRestant * tauxMensuel;
                    } else if (this.typePret === 'degressif') {
                        // Recalculer l'amortissement fixe sur le capital restant et la durée restante
                        const amortissementFixe = capitalRestant / (this.dureeMois - mois + 1);
                        mensualite = amortissementFixe + (capitalRestant * tauxMensuel);
                    } else {
                        // Prêt amortissable classique
                        mensualite = capitalRestant * tauxMensuel / 
                            (1 - Math.pow(1 + tauxMensuel, -(this.dureeMois - mois + 1)));
                    }
                }
                // Si mode durée, on garde la même mensualité (on raccourcit la durée)
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
            });
            
            if (capitalRestant <= 0) break;
        }
        
        // Indemnités de remboursement anticipé avec plafond légal
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
    const earlyRepaymentMonthSlider = document.getElementById('early-repayment-month-slider');
    const earlyRepaymentMonthValue = document.getElementById('early-repayment-month-value');
    const newInterestRateSlider = document.getElementById('new-interest-rate-slider');
    const newInterestRateValue = document.getElementById('new-interest-rate-value');
    const penaltyMonthsSlider = document.getElementById('penalty-months-slider');
    const penaltyMonthsValue = document.getElementById('penalty-months-value');
    const calculateLoanButton = document.getElementById('calculate-loan-button');
    const exportPdfButton = document.getElementById('export-pdf');

    // Ajout d'éléments pour les nouvelles options
    // Création des éléments pour les options de remboursement anticipé
    const addPaymentOptionsSection = () => {
        const anticipatedSection = document.querySelector('.mt-8.mb-4.pt-6.border-t.border-blue-800');
        
        if (anticipatedSection) {
            // Ajouter l'option de mode de remboursement
            const modeSelector = document.createElement('div');
            modeSelector.className = 'mb-4';
            modeSelector.innerHTML = `
                <label class="block mb-2 text-sm font-medium text-gray-300">
                    Mode de remboursement anticipé
                    <span class="ml-1 text-green-400 cursor-help" title="Choisissez si vous souhaitez réduire la durée du prêt en gardant la même mensualité, ou réduire la mensualité en gardant la même durée.">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <div class="flex gap-2">
                    <button id="mode-duree" class="flex-1 py-2 px-3 bg-blue-800 bg-opacity-30 text-green-400 rounded active">Réduire la durée</button>
                    <button id="mode-mensualite" class="flex-1 py-2 px-3 bg-blue-800 bg-opacity-30 text-gray-300 rounded">Réduire la mensualité</button>
                </div>
                <input type="hidden" id="remboursement-mode" value="duree">
            `;
            
            anticipatedSection.appendChild(modeSelector);
            
            // Ajouter les écouteurs d'événements
            document.getElementById('mode-duree').addEventListener('click', function() {
                document.getElementById('mode-duree').classList.add('active', 'text-green-400');
                document.getElementById('mode-mensualite').classList.remove('active', 'text-green-400');
                document.getElementById('mode-mensualite').classList.add('text-gray-300');
                document.getElementById('remboursement-mode').value = 'duree';
            });
            
            document.getElementById('mode-mensualite').addEventListener('click', function() {
                document.getElementById('mode-mensualite').classList.add('active', 'text-green-400');
                document.getElementById('mode-duree').classList.remove('active', 'text-green-400');
                document.getElementById('mode-duree').classList.add('text-gray-300');
                document.getElementById('remboursement-mode').value = 'mensualite';
            });
        }
    };
    
    // Création d'un panneau de frais annexes
    const addFeesSection = () => {
        const parametersColumn = document.querySelector('.bg-blue-900.bg-opacity-20.p-6.rounded-lg:first-child');
        
        if (parametersColumn) {
            // NOUVEAU: Ajout du sélecteur de type de prêt
            const typePretSection = document.createElement('div');
            typePretSection.className = 'mb-4';
            typePretSection.innerHTML = `
                <label class="block mb-2 text-sm font-medium text-gray-300">
                    Type de prêt
                    <span class="ml-1 text-green-400 cursor-help" title="Amortissable: remboursement progressif du capital. In fine: remboursement du capital à la fin. Dégressif: remboursement constant du capital.">
                        <i class="fas fa-info-circle"></i>
                    </span>
                </label>
                <select id="type-pret" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
                    <option value="amortissable">Amortissable</option>
                    <option value="inFine">In fine</option>
                    <option value="degressif">Dégressif</option>
                </select>
            `;
            
            // Insérer après le slider de durée du prêt
            const durationElement = document.getElementById('loan-duration-slider')?.closest('.mb-4');
            if (durationElement) {
                durationElement.after(typePretSection);
                
                // Ajouter une zone d'information contextuelle pour les types de prêt
                const infoContextuelle = document.createElement('div');
                infoContextuelle.id = 'pret-info';
                infoContextuelle.className = 'mt-4 mb-4 bg-green-900 bg-opacity-10 border-l-4 border-green-400 rounded-md p-3';
                infoContextuelle.innerHTML = `
                    <h5 class="text-green-400 font-medium flex items-center mb-2">
                        <i class="fas fa-info-circle mr-2"></i>
                        <span id="pret-info-titre">Prêt amortissable classique</span>
                    </h5>
                    <p id="pret-info-description" class="text-sm text-gray-300">
                        Chaque mensualité comprend une part d'intérêts et une part de capital. 
                        La part d'intérêts diminue progressivement tandis que la part de capital augmente.
                    </p>
                `;
                
                typePretSection.after(infoContextuelle);
                
                // Mettre à jour les infos selon le type de prêt sélectionné
                document.getElementById('type-pret').addEventListener('change', function() {
                    const titre = document.getElementById('pret-info-titre');
                    const description = document.getElementById('pret-info-description');
                    
                    switch(this.value) {
                        case 'inFine':
                            titre.textContent = "Prêt in fine";
                            description.textContent = "L'emprunteur ne paie que les intérêts chaque mois et rembourse l'intégralité du capital à la fin du prêt. Avantages fiscaux pour les investisseurs (LMNP, SCPI).";
                            break;
                        case 'degressif':
                            titre.textContent = "Prêt à amortissement dégressif";
                            description.textContent = "L'emprunteur rembourse une part fixe du capital chaque mois + les intérêts. Les mensualités sont dégressives car les intérêts diminuent.";
                            break;
                        default:
                            titre.textContent = "Prêt amortissable classique";
                            description.textContent = "Chaque mensualité comprend une part d'intérêts et une part de capital. La part d'intérêts diminue progressivement tandis que la part de capital augmente.";
                    }
                });
            }
            
            // NOUVEAU: Créer une section pour le changement de taux
            const changeTauxSection = document.createElement('div');
            changeTauxSection.className = 'mt-8 mb-4 pt-6 border-t border-blue-800';
            changeTauxSection.innerHTML = `
                <h5 class="text-lg font-semibold mb-4 flex items-center">
                    <i class="fas fa-percentage text-green-400 mr-2"></i>
                    Changement de taux
                </h5>
                
                <div class="mb-4">
                    <label class="block mb-2 text-sm font-medium text-gray-300">
                        Mois d'application du nouveau taux
                        <span class="ml-1 text-green-400 cursor-help" title="Mois à partir duquel s'appliquera le nouveau taux d'intérêt.">
                            <i class="fas fa-info-circle"></i>
                        </span>
                    </label>
                    <div class="flex items-center gap-4">
                        <input type="range" id="new-rate-month-slider" min="1" max="120" value="24" step="1" class="w-full h-2 bg-blue-800 rounded-lg appearance-none cursor-pointer">
                        <span id="new-rate-month-value" class="bg-green-900 bg-opacity-30 text-green-400 px-2 py-1 rounded text-sm font-medium min-w-[60px] text-center">24</span>
                    </div>
                </div>
                
                <div class="mb-4">
                    <label class="block mb-2 text-sm font-medium text-gray-300">
                        Nouveau taux d'intérêt (%)
                        <span class="ml-1 text-green-400 cursor-help" title="Le nouveau taux d'intérêt qui s'appliquera à partir du mois spécifié.">
                            <i class="fas fa-info-circle"></i>
                        </span>
                    </label>
                    <div class="flex items-center gap-4">
                        <input type="range" id="new-interest-rate-slider" min="0.5" max="7" value="2.3" step="0.01" class="w-full h-2 bg-blue-800 rounded-lg appearance-none cursor-pointer">
                        <span id="new-interest-rate-value" class="bg-green-900 bg-opacity-30 text-green-400 px-2 py-1 rounded text-sm font-medium min-w-[60px] text-center">2.3%</span>
                    </div>
                </div>
            `;
            
            // Ajouter la section après le sélecteur de type de prêt 
            const pretInfoElement = document.getElementById('pret-info');
            if (pretInfoElement) {
                pretInfoElement.after(changeTauxSection);
            }
            
            // Actualiser le mois d'application du nouveau taux
            const newRateMonthSlider = document.getElementById('new-rate-month-slider');
            const newRateMonthValue = document.getElementById('new-rate-month-value');
            
            if (newRateMonthSlider && newRateMonthValue) {
                newRateMonthSlider.addEventListener('input', function() {
                    newRateMonthValue.textContent = this.value;
                });
            }
            
            const feesSection = document.createElement('div');
            feesSection.className = 'mt-8 mb-4 pt-6 border-t border-blue-800';
            feesSection.innerHTML = `
                <h5 class="text-lg font-semibold mb-4 flex items-center">
                    <i class="fas fa-file-invoice-dollar text-green-400 mr-2"></i>
                    Frais annexes
                </h5>
                
                <div class="mb-4">
                    <label class="block mb-2 text-sm font-medium text-gray-300">
                        Frais de dossier
                        <span class="ml-1 text-green-400 cursor-help" title="Frais demandés par la banque pour l'étude et le montage du dossier.">
                            <i class="fas fa-info-circle"></i>
                        </span>
                    </label>
                    <input type="number" id="frais-dossier" value="2000" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
                </div>
                
                <div class="mb-4">
                    <label class="block mb-2 text-sm font-medium text-gray-300">
                        Frais de garantie (1,3709% du capital)
                        <span class="ml-1 text-green-400 cursor-help" title="Frais de garantie calculés automatiquement à 1,3709% du montant emprunté.">
                            <i class="fas fa-info-circle"></i>
                        </span>
                    </label>
                    <input type="number" id="frais-garantie" placeholder="Calculé automatiquement" disabled class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
                </div>
                
                <div class="mb-4">
                    <label class="block mb-2 text-sm font-medium text-gray-300">
                        Frais de tenue de compte
                        <span class="ml-1 text-green-400 cursor-help" title="Frais de tenue du compte bancaire sur la durée du prêt.">
                            <i class="fas fa-info-circle"></i>
                        </span>
                    </label>
                    <input type="number" id="frais-tenue-compte" value="710" min="0" class="bg-blue-800 bg-opacity-30 border border-blue-700 text-white rounded-lg p-2.5 w-full">
                </div>
                
                <div class="mb-4">
                    <div class="flex items-center">
                        <input id="assurance-capital-initial" type="checkbox" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                        <label for="assurance-capital-initial" class="ml-2 text-sm font-medium text-gray-300">
                            Assurance sur capital initial
                            <span class="ml-1 text-green-400 cursor-help" title="Si activé, le taux d'assurance s'applique au capital initial. Sinon, il s'applique au capital restant dû.">
                                <i class="fas fa-info-circle"></i>
                            </span>
                        </label>
                    </div>
                </div>
            `;
            
            parametersColumn.appendChild(feesSection);
            
            // Mise à jour des frais de garantie
            const updateGarantieEstimation = () => {
                const capital = parseFloat(document.getElementById('loan-amount').value);
                const fraisGarantieInput = document.getElementById('frais-garantie');
                
                // MODIFIÉ: Toujours calculer avec la formule fixe
                const fraisEstimes = capital * 0.013709;
                
                fraisGarantieInput.placeholder = fraisEstimes.toFixed(2) + " €";
                fraisGarantieInput.dataset.autoValue = fraisEstimes;
            };
            
            // Mettre à jour les frais de garantie quand le montant du prêt change
            document.getElementById('loan-amount').addEventListener('change', updateGarantieEstimation);
            
            // Initialiser l'estimation
            setTimeout(updateGarantieEstimation, 500);
        }
    };
    
    // Ajout de l'affichage des résultats améliorés
    const enhanceResultsDisplay = () => {
        const resultsContainer = document.querySelector('.grid.grid-cols-2.gap-4.mb-6');
        
        if (resultsContainer) {
            // Ajouter les deux nouvelles cellules pour frais et coût global
            const newCells = document.createElement('div');
            newCells.className = 'col-span-2 grid grid-cols-2 gap-4 mt-2';
            newCells.innerHTML = `
                <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
                    <p id="total-fees" class="text-green-400 text-2xl font-bold mb-1 result-value">0 €</p>
                    <p class="text-gray-400 text-sm">Frais annexes</p>
                </div>
                <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center">
                    <p id="taeg" class="text-green-400 text-2xl font-bold mb-1 result-value">0%</p>
                    <p class="text-gray-400 text-sm">TAEG approximatif</p>
                </div>
                <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg text-center col-span-2">
                    <p id="cout-global" class="text-green-400 text-2xl font-bold mb-1 result-value">0 €</p>
                    <p class="text-gray-400 text-sm">Coût global (tout compris)</p>
                </div>
            `;
            
            resultsContainer.after(newCells);
        }
    };

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

    // Ajouter les nouvelles sections d'UI si l'onglet de simulation est actif
    const isLoanTabActive = () => {
        return document.querySelector('[data-target="loan-simulator"].active') || 
               document.getElementById('loan-simulator').style.display !== 'none';
    };
    
    // Si l'onglet de simulation est actif, ajouter les nouvelles sections
    if (isLoanTabActive()) {
        setTimeout(() => {
            addPaymentOptionsSection();
            addFeesSection();
            enhanceResultsDisplay();
        }, 500);
    }
    
    // Écouter les changements d'onglets pour ajouter les sections au besoin
    const simulationTabs = document.querySelectorAll('.simulation-tab');
    simulationTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.getAttribute('data-target') === 'loan-simulator') {
                setTimeout(() => {
                    addPaymentOptionsSection();
                    addFeesSection();
                    enhanceResultsDisplay();
                }, 300);
            }
        });
    });

    // Fonction pour calculer et afficher les résultats
    function calculateLoan() {
        const loanAmount = parseFloat(document.getElementById('loan-amount').value);
        const interestRate = parseFloat(document.getElementById('interest-rate-slider').value);
        const loanDurationYears = parseInt(document.getElementById('loan-duration-slider').value);
        const insuranceRate = parseFloat(document.getElementById('insurance-rate-slider').value);
        const earlyRepaymentAmount = parseFloat(document.getElementById('early-repayment-amount').value);
        const earlyRepaymentMonth = parseInt(document.getElementById('early-repayment-month-slider').value);
        const newInterestRate = parseFloat(document.getElementById('new-interest-rate-slider').value);
        const penaltyMonths = parseInt(document.getElementById('penalty-months-slider').value);
        
        // NOUVEAU: Récupérer le mois d'application du nouveau taux
        const moisNouveauTaux = parseInt(document.getElementById('new-rate-month-slider')?.value || 0);
        
        // Récupérer les nouveaux paramètres
        const fraisDossier = parseFloat(document.getElementById('frais-dossier')?.value || 2000);
        const fraisTenueCompte = parseFloat(document.getElementById('frais-tenue-compte')?.value || 710);
        
        // Récupérer les frais de garantie (valeur calculée automatiquement)
        const fraisGarantieInput = document.getElementById('frais-garantie');
        let fraisGarantie = null;
        if (fraisGarantieInput && fraisGarantieInput.dataset.autoValue) {
            fraisGarantie = parseFloat(fraisGarantieInput.dataset.autoValue);
        }
        
        // Récupérer le type de prêt
        const typePret = document.getElementById('type-pret')?.value || 'amortissable';
        
        const assuranceSurCapitalInitial = document.getElementById('assurance-capital-initial')?.checked || false;
        
        // Récupérer le mode de remboursement (durée ou mensualité)
        const modeRemboursement = document.getElementById('remboursement-mode')?.value || 'duree';

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
            assuranceSurCapitalInitial: assuranceSurCapitalInitial,
            typePret: typePret
        });

        // Calcul du tableau d'amortissement
        const result = simulator.tableauAmortissement({
            remboursementAnticipe: earlyRepaymentAmount,
            moisAnticipe: earlyRepaymentMonth,
            nouveauTaux: newInterestRate,
            moisNouveauTaux: moisNouveauTaux, // NOUVEAU
            modeRemboursement: modeRemboursement
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
        if (taegElement) taegElement.textContent = result.taeg.toFixed(2) + '%';
        if (coutGlobalElement) coutGlobalElement.textContent = formatMontant(result.coutGlobalTotal);

        // Génération du tableau d'amortissement
        const tableBody = document.getElementById('amortization-table');
        tableBody.innerHTML = '';

        // Limiter le tableau aux 120 premières lignes pour des raisons de performance
        const displayRows = Math.min(result.tableau.length, 120);
        
        for (let i = 0; i < displayRows; i++) {
            const row = result.tableau[i];
            const tr = document.createElement('tr');
            
            // Coloration spéciale pour le dernier mois du prêt in fine
            if (typePret === 'inFine' && i === result.tableau.length - 1) {
                tr.classList.add('bg-blue-500', 'bg-opacity-20');
            } 
            // Marquage différent pour le mois de remboursement anticipé
            else if (row.mois === earlyRepaymentMonth) {
                tr.classList.add('bg-green-900', 'bg-opacity-20');
            }
            // NOUVEAU: Marquer le mois où le taux change
            else if (row.mois === moisNouveauTaux) {
                tr.classList.add('bg-yellow-600', 'bg-opacity-20');
            }
            else {
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
        
        // Calculer le pourcentage d'économies (avec protection contre division par zéro)
        let economiesPourcentage = 0;
        if (result.totalInterets + result.economiesInterets > 0) {
            economiesPourcentage = ((result.economiesInterets / (result.totalInterets + result.economiesInterets)) * 100).toFixed(1);
        }
        
        // Obtenir le type de prêt
        const typePret = document.getElementById('type-pret')?.value || 'amortissable';
        
        // Mettre à jour le contenu avec des informations spécifiques au type de prêt
        let specificsHtml = '';
        
        if (typePret === 'inFine') {
            specificsHtml = `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Prêt in fine : capital (${formatMontant(result.capitalInitial)}) remboursé intégralement à l'échéance</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Paiement mensuel fixe d'intérêts : ${formatMontant(result.capitalInitial * (parseFloat(document.getElementById('interest-rate-slider').value) / 100 / 12))}</span>
                </li>
            `;
        } else if (typePret === 'degressif') {
            const amortissementFixe = result.capitalInitial / result.dureeInitiale;
            specificsHtml = `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Prêt dégressif : amortissement constant de ${formatMontant(amortissementFixe)} par mois</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Mensualités dégressives, de ${formatMontant(result.mensualiteInitiale)} à ${formatMontant(result.tableau[result.tableau.length-1].mensualite)}</span>
                </li>
            `;
        }
        
        // NOUVEAU: Information sur le changement de taux
        const moisNouveauTaux = parseInt(document.getElementById('new-rate-month-slider')?.value || 0);
        const nouveauTaux = parseFloat(document.getElementById('new-interest-rate-slider')?.value || 0);
        
        let changeTauxHtml = '';
        if (moisNouveauTaux > 0) {
            changeTauxHtml = `
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-blue-400 mr-2 mt-1"></i>
                    <span>Changement de taux au mois ${moisNouveauTaux} : ${nouveauTaux}% (indépendant du remboursement anticipé)</span>
                </li>
            `;
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
                ${specificsHtml}
                ${changeTauxHtml}
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Vous économisez ${formatMontant(result.economiesInterets)} d'intérêts (${economiesPourcentage}% du total)</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mr-2 mt-1"></i>
                    <span>Réduction de la durée du prêt de ${result.dureeInitiale - result.dureeReelle} mois</span>
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
        
        // MODIFIÉ: Marquer visuellement le remboursement anticipé ET le changement de taux
        const earlyRepaymentMonth = parseInt(document.getElementById('early-repayment-month-slider').value);
        const moisNouveauTaux = parseInt(document.getElementById('new-rate-month-slider')?.value || 0);
        
        // Calcul des indices pour le graphique
        const remboursementIndex = Math.floor(earlyRepaymentMonth / sampleRate);
        const changeTauxIndex = Math.floor(moisNouveauTaux / sampleRate);
        
        // Marquer les points importants sur le graphique
        if (loanChart && loanChart.data && loanChart.data.datasets && loanChart.data.datasets[0]) {
            const dataset = loanChart.data.datasets[0];
            dataset.pointBackgroundColor = dataset.data.map((value, index) => {
                if (index === remboursementIndex) return 'rgba(52, 211, 153, 1)';
                if (index === changeTauxIndex) return 'rgba(251, 191, 36, 1)'; // Jaune pour le changement de taux
                return 'transparent';
            });
            
            dataset.pointRadius = dataset.data.map((value, index) => 
                (index === remboursementIndex || index === changeTauxIndex) ? 5 : 0
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
            
            // Récupérer le type de prêt
            const typePret = document.getElementById('type-pret')?.value || 'amortissable';
            
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
                        <p class="font-bold">Type de prêt:</p>
                        <p>${typePret === 'inFine' ? 'In fine' : (typePret === 'degressif' ? 'Dégressif' : 'Amortissable')}</p>
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
            
            // Informations sur le changement de taux
            const moisNouveauTaux = document.getElementById('new-rate-month-slider')?.value;
            const nouveauTaux = document.getElementById('new-interest-rate-slider')?.value;
            
            if (moisNouveauTaux && nouveauTaux) {
                element.innerHTML += `
                    <div class="mt-3 mb-6 p-4 border border-gray-300 rounded">
                        <h3 class="font-bold mb-2">Changement de taux</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="font-bold">Mois d'application:</p>
                                <p>${moisNouveauTaux}</p>
                            </div>
                            <div>
                                <p class="font-bold">Nouveau taux:</p>
                                <p>${nouveauTaux}%</p>
                            </div>
                        </div>
                    </div>
                `;
            }
            
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
                            <p class="font-bold">Indemnités (mois):</p>
                            <p>${document.getElementById('penalty-months-slider').value} mois</p>
                        </div>
                    </div>
                </div>
            `;
            
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
                                <p class="font-bold">Frais de garantie (1,3709%):</p>
                                <p>${document.getElementById('frais-garantie').placeholder} €</p>
                            </div>
                            <div>
                                <p class="font-bold">Frais de tenue de compte:</p>
                                <p>${document.getElementById('frais-tenue-compte').value} €</p>
                            </div>
                            <div>
                                <p class="font-bold">TAEG approximatif:</p>
                                <p>${document.getElementById('taeg')?.textContent || "N/A"}</p>
                            </div>
                            <div class="col-span-2">
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
                        <h3 class="font-bold mb-2 text-green-700">Analyse complète</h3>
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
    
    // Calculer les résultats initiaux au chargement de la page
    if (document.getElementById('loan-amount')) {
        calculateLoan();
    }
});
