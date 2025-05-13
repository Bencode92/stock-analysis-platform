// Mettre à jour la fonction collecterDonneesFormulaire
// Forcer le mode rendement
function collecterDonneesFormulaire() {
    const formData = {
        // Paramètres de base
        apport: document.getElementById('apport').value,
        montantEmpruntMax: document.getElementById('montant-emprunt-max').value,
        surface: document.getElementById('surface').value,
        taux: document.getElementById('taux').value,
        duree: document.getElementById('duree').value,
        // Forcer le mode rendement
        objectif: 'rendement',
        rendementMin: document.getElementById('rendement-min').value,
        cashFlowMin: document.getElementById('cashflow-min')?.value || 1,
        
        // Autres paramètres inchangés...
    };
    
    return formData;
}