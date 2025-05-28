// Modification partielle - Je vais juste vous montrer les changements clés
// À insérer dans la fonction afficherResultats() vers la ligne 1800

// Remplacer cette partie du code pour le cash-flow classique :
// Cash-flow mensuel et annuel
const cashflowClassique = document.getElementById('classique-cashflow');
if (cashflowClassique) {
    // NOUVELLE VERSION : Affichage amélioré avec décomposition
    const cashflowWrapper = document.createElement('div');
    cashflowWrapper.className = 'cashflow-detailed-wrapper';
    
    // Ajouter label "AVANT impôt"
    const labelAvant = document.createElement('div');
    labelAvant.className = 'cashflow-label-small';
    labelAvant.textContent = 'Cash-flow AVANT impôt';
    
    // Cash-flow mensuel avant impôt
    const cashflowMensuel = document.createElement('div');
    cashflowMensuel.className = 'cashflow-monthly ' + getClasseValeur(classique.cashFlow);
    cashflowMensuel.textContent = formaterMontantMensuel(classique.cashFlow);
    
    // Cash-flow annuel avant impôt
    const cashflowAnnuel = document.createElement('div');
    cashflowAnnuel.className = 'cashflow-annual ' + getClasseValeur(classique.cashFlow);
    cashflowAnnuel.textContent = formaterMontantAnnuel(classique.cashFlow * 12);
    
    // Encadré impact fiscal
    const fiscalBox = document.createElement('div');
    fiscalBox.className = 'fiscal-impact-box';
    fiscalBox.innerHTML = `
        <div class="fiscal-impact-header">
            <i class="fas fa-calculator"></i> Impact fiscal
        </div>
        <div class="fiscal-impact-content">
            <div class="fiscal-line">
                <span>Revenu imposable :</span>
                <span>${formaterMontant(classique.revenuFoncier || 0)}</span>
            </div>
            <div class="fiscal-line">
                <span>Impôt annuel :</span>
                <span class="negative">${formaterMontant(classique.impactFiscal || 0)}</span>
            </div>
            <div class="fiscal-line highlight">
                <span>Impact mensuel :</span>
                <span class="negative">${formaterMontant((classique.impactFiscal || 0) / 12)}/mois</span>
            </div>
        </div>
    `;
    
    // Cash-flow APRÈS impôt
    const cashflowApresImpotMensuel = classique.cashFlow + ((classique.impactFiscal || 0) / 12);
    const labelApres = document.createElement('div');
    labelApres.className = 'cashflow-label-small mt-2';
    labelApres.innerHTML = '<strong>Cash-flow APRÈS impôt</strong>';
    
    const cashflowApres = document.createElement('div');
    cashflowApres.className = 'cashflow-after-tax ' + getClasseValeur(cashflowApresImpotMensuel);
    cashflowApres.innerHTML = `
        <div class="cashflow-monthly-large">${formaterMontantMensuel(cashflowApresImpotMensuel)}</div>
        <div class="cashflow-annual">${formaterMontantAnnuel(cashflowApresImpotMensuel * 12)}</div>
    `;
    
    // Assembler le tout
    cashflowWrapper.appendChild(labelAvant);
    cashflowWrapper.appendChild(cashflowMensuel);
    cashflowWrapper.appendChild(cashflowAnnuel);
    cashflowWrapper.appendChild(fiscalBox);
    cashflowWrapper.appendChild(labelApres);
    cashflowWrapper.appendChild(cashflowApres);
    
    // Remplacer l'ancien affichage
    cashflowClassique.parentNode.replaceChild(cashflowWrapper, cashflowClassique);
}