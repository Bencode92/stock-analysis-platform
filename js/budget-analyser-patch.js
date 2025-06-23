/**
 * Modification de la fonction analyserBudget() - AJOUTEZ CECI :
 * 
 * Juste après le bloc de formatage (ligne ~2125), AVANT updateBudgetChart :
 */

    // ===== NOUVELLE SECTION - MISE À JOUR DES TUILES ÉPARGNE =====
    
    // Calculer l'épargne totale (automatique + possible)
    const epargneTotale = epargneAuto + epargneLibre;

    // Mettre à jour les NOUVELLES tuiles épargne
    document.getElementById('simulation-epargne-auto').textContent = formatter.format(epargneAuto);
    document.getElementById('simulation-epargne-totale').textContent = formatter.format(epargneTotale);

    // ===== FIN NOUVELLE SECTION =====
    
    // Ensuite continuer avec le code existant...
    updateBudgetChart(loyer, quotidien, extra, epargneAuto, totalDepensesVariables, epargneLibre);
