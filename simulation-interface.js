// Mise à jour de la fonction d'affichage du résumé pour corriger le problème de surface négative
function afficherResume(classique, encheres) {
    const diff = encheres.surface - classique.surface;
    const economie = classique.coutTotal - encheres.coutTotal;
    const cashFlowDiff = encheres.cashFlow - classique.cashFlow;
    
    // Meilleure option
    const meilleureOption = encheres.cashFlow > classique.cashFlow ? 'encheres' : 'classique';
    const winnerCard = document.getElementById('summary-winner');
    
    if (meilleureOption === 'encheres') {
        winnerCard.querySelector('.summary-mode').textContent = 'Vente aux enchères';
        winnerCard.querySelector('.summary-gain').textContent = '+' + cashFlowDiff.toFixed(0) + '€/mois';
    } else {
        winnerCard.querySelector('.summary-mode').textContent = 'Achat classique';
        winnerCard.querySelector('.summary-gain').textContent = '+' + Math.abs(cashFlowDiff).toFixed(0) + '€/mois';
    }
    
    // Économie totale
    document.querySelector('.summary-amount').textContent = formatMontant(economie);
    
    // Surface supplémentaire (corrigé pour éviter les valeurs négatives)
    const surfaceElement = document.querySelector('.summary-surface');
    if (diff > 0) {
        surfaceElement.textContent = '+' + diff.toFixed(1) + ' m²';
        surfaceElement.style.color = '#3B82F6';
    } else if (diff < 0) {
        surfaceElement.textContent = Math.abs(diff).toFixed(1) + ' m² de moins';
        surfaceElement.style.color = '#EF4444';
    } else {
        surfaceElement.textContent = 'Identique';
        surfaceElement.style.color = '#6B7280';
    }
    
    // Résumé textuel
    const summaryText = document.getElementById('summary-text');
    if (meilleureOption === 'encheres') {
        summaryText.textContent = `La vente aux enchères est plus intéressante : vous gagnez ${cashFlowDiff.toFixed(0)}€ de plus chaque mois. Vous aurez ${diff > 0 ? diff.toFixed(1) + ' m² de plus' : Math.abs(diff).toFixed(1) + ' m² de moins'} avec les enchères. L'économie totale est de ${formatMontant(economie)}.`;
    } else {
        summaryText.textContent = `L'achat classique est plus intéressant : vous gagnez ${Math.abs(cashFlowDiff).toFixed(0)}€ de plus chaque mois. Vous aurez ${diff < 0 ? Math.abs(diff).toFixed(1) + ' m² de plus' : diff.toFixed(1) + ' m² de moins'} avec l'achat classique.`;
    }
    
    // Ajouter les barres visuelles de cash-flow
    ajouterBarresVisuelles(classique, encheres);
}

// Nouvelle fonction pour ajouter des barres visuelles de cash-flow
function ajouterBarresVisuelles(classique, encheres) {
    const container = document.getElementById('cashflow-visual-container');
    if (!container) return;
    
    const maxValue = Math.max(Math.abs(classique.cashFlow), Math.abs(encheres.cashFlow));
    
    container.innerHTML = `
        <h3 style="margin-bottom: 1rem; color: rgba(255,255,255,0.9);">Comparaison visuelle du cash-flow mensuel</h3>
        
        <div class="cashflow-bar">
            <div class="cashflow-bar-fill ${classique.cashFlow >= 0 ? 'positive' : 'negative'}" 
                 style="width: ${Math.abs(classique.cashFlow) / maxValue * 100}%">
                <span class="cashflow-bar-label">Achat Classique</span>
                <span class="cashflow-bar-value">${classique.cashFlow.toFixed(0)} €</span>
            </div>
        </div>
        
        <div class="cashflow-bar">
            <div class="cashflow-bar-fill ${encheres.cashFlow >= 0 ? 'positive' : 'negative'}" 
                 style="width: ${Math.abs(encheres.cashFlow) / maxValue * 100}%">
                <span class="cashflow-bar-label">Vente aux Enchères</span>
                <span class="cashflow-bar-value">${encheres.cashFlow.toFixed(0)} €</span>
            </div>
        </div>
    `;
    
    // Animer les barres après un court délai
    setTimeout(() => {
        const bars = container.querySelectorAll('.cashflow-bar-fill');
        bars.forEach((bar, index) => {
            bar.style.transition = 'width 1s ease';
        });
    }, 100);
}

// Export des fonctions si nécessaire
window.afficherResume = afficherResume;
window.ajouterBarresVisuelles = ajouterBarresVisuelles;
