/**
 * Modification de la fonction updateBudgetChart() pour ajuster les labels
 */

function updateBudgetChart(loyer, quotidien, extra, investAuto, depensesVariables, epargne) {
    if (!window.budgetChart) return;
    
    // Mettre à jour les données avec les nouveaux labels
    window.budgetChart.data.labels = [
        'Loyer', 
        'Vie courante', 
        'Loisirs', 
        'Épargne auto', 
        'Dépenses variables', 
        'Épargne libre'  // Changé de "Épargne possible" à "Épargne libre"
    ];
    
    window.budgetChart.data.datasets[0].data = [loyer, quotidien, extra, investAuto, depensesVariables, epargne];
    window.budgetChart.update();
}

/**
 * Également mettre à jour updateObjectiveTime pour utiliser l'épargne totale
 */

// Dans analyserBudget(), remplacer l'appel updateObjectiveTime par :
updateObjectiveTime(epargneAuto + epargneLibre); // au lieu de juste epargneLibre
