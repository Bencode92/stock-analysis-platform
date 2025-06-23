/**
 * budget-epargne-fixed.js - CORRECTION DES BUGS
 * Version corrigée du module de gestion du budget et de l'épargne
 * 
 * BUGS CORRIGÉS:
 * 1. ✅ Capacité d'épargne totale statique
 * 2. ✅ Recommandations personnalisées disparues
 * 3. ✅ Erreurs de syntaxe JavaScript
 */

// ✅ FONCTION CORRECTEMENT DÉFINIE: updateEpargneBreakdown
function updateEpargneBreakdown(epargnAutomatique, epargnePossible, revenuMensuel) {
    console.log(`🔄 Mise à jour épargne: ${epargnAutomatique}€ + ${epargnePossible}€`);
    
    // Calculer l'épargne totale et le taux
    const epargneTotale = epargnAutomatique + epargnePossible;
    const tauxEpargneTotale = revenuMensuel > 0 ? (epargneTotale / revenuMensuel) * 100 : 0;
    
    // Mise à jour des éléments d'affichage
    const epargnAutoDisplay = document.getElementById('epargne-auto-display');
    const epargnLibreDisplay = document.getElementById('epargne-libre-display');
    const epargnTotaleDisplay = document.getElementById('epargne-totale-display');
    const tauxEpargneTotaleDisplay = document.getElementById('taux-epargne-totale');
    
    if (epargnAutoDisplay) {
        epargnAutoDisplay.textContent = `${epargnAutomatique.toLocaleString('fr-FR')}€`;
    }
    if (epargnLibreDisplay) {
        epargnLibreDisplay.textContent = `${epargnePossible.toLocaleString('fr-FR')}€`;
    }
    if (epargnTotaleDisplay) {
        epargnTotaleDisplay.textContent = `${epargneTotale.toLocaleString('fr-FR')}€`;
    }
    if (tauxEpargneTotaleDisplay) {
        tauxEpargneTotaleDisplay.textContent = `${tauxEpargneTotale.toFixed(1)}%`;
    }
    
    console.log(`✅ Capacité d'épargne mise à jour: ${epargneTotale}€ (${tauxEpargneTotale.toFixed(1)}%)`);
}

// ✅ MOTEUR DE RÈGLES POUR LES RECOMMANDATIONS
const BUDGET_RULES = [
    {
        id: 'epargne_critique',
        condition: (data) => data.tauxEpargne < 5,
        message: '🚨 Priorité absolue : constituez un fonds d\'urgence de 1000€ minimum',
        severity: 'danger',
        action: 'Réduisez vos dépenses non essentielles'
    },
    {
        id: 'logement_cher',
        condition: (data) => data.ratioLogement > 33,
        message: '🏠 Votre logement dépasse 33% de vos revenus',
        severity: 'warning',
        action: 'Envisagez un déménagement ou une colocation'
    },
    {
        id: 'epargne_excellente',
        condition: (data) => data.tauxEpargne > 20,
        message: '🎉 Excellent taux d\'épargne ! Optimisez maintenant',
        severity: 'success',
        action: 'Diversifiez vers PEA et Assurance-vie'
    },
    {
        id: 'loisirs_excessifs',
        condition: (data) => data.ratioLoisirs > 15,
        message: '🎭 Vos loisirs dépassent 15% de vos revenus',
        severity: 'info',
        action: 'Établissez un budget loisirs strict'
    },
    {
        id: 'auto_invest_manquant',
        condition: (data) => data.investAuto === 0 && data.epargnePossible > 100,
        message: '🤖 Automatisez votre épargne pour garantir vos objectifs',
        severity: 'info',
        action: 'Mettez en place un virement automatique'
    }
];

// ✅ FONCTION CORRIGÉE: updateRecommendations
function updateRecommendations(epargnePossible, tauxEpargne, investAuto) {
    console.log('🔄 Mise à jour des recommandations...');
    
    const recommendationsElement = document.getElementById('budget-recommendations');
    if (!recommendationsElement) {
        console.warn('❌ Element budget-recommendations introuvable');
        return;
    }
    
    const recommendations = [];
    
    // Recommandation basée sur l'épargne
    if (epargnePossible > 0) {
        let vehiculeRecommande = '';
        let montantRecommande = 0;
        
        if (tauxEpargne < 10) {
            // Priorité à l'épargne de précaution
            vehiculeRecommande = 'Livret A';
            montantRecommande = Math.round(epargnePossible * 0.7);
            recommendations.push(`<p class="mb-2">💰 Priorité à la sécurité: placez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> sur un ${vehiculeRecommande} jusqu'à constituer un fonds d'urgence de 3 mois de dépenses.</p>`);
        } else if (tauxEpargne >= 10 && tauxEpargne < 20) {
            // Mix entre sécurité et rendement
            vehiculeRecommande = 'PEA (ETF diversifiés)';
            montantRecommande = Math.round(epargnePossible * 0.6);
            recommendations.push(`<p class="mb-2">⚖️ Équilibrez sécurité et rendement: investissez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> sur un ${vehiculeRecommande} pour profiter de la croissance à long terme.</p>`);
        } else {
            // Optimisation fiscale et rendement
            vehiculeRecommande = 'PEA + Assurance-vie';
            montantRecommande = Math.round(epargnePossible * 0.8);
            recommendations.push(`<p class="mb-2">🚀 Optimisez votre patrimoine: répartissez <strong>${montantRecommande.toLocaleString('fr-FR')} €/mois</strong> entre ${vehiculeRecommande} pour maximiser rendement et avantages fiscaux.</p>`);
        }
    } else {
        recommendations.push(`<p class="mb-2">⚠️ Votre budget est actuellement déficitaire. Concentrez-vous sur la réduction de vos dépenses non essentielles.</p>`);
    }
    
    // Recommandation sur l'investissement automatique
    if (investAuto === 0 && epargnePossible > 100) {
        recommendations.push(`<p class="mb-2"><i class="fas fa-robot text-green-400 mr-1"></i> Mettez en place un <strong>versement automatique</strong> mensuel pour simplifier votre stratégie d'épargne.</p>`);
    } else if (investAuto > 0) {
        recommendations.push(`<p class="mb-2"><i class="fas fa-check text-green-400 mr-1"></i> Excellent! Votre investissement automatique de ${investAuto.toLocaleString('fr-FR')} €/mois vous permet de construire votre patrimoine régulièrement.</p>`);
    }
    
    // Recommandation sur la simulation d'investissement
    recommendations.push(`<p class="mb-2"><i class="fas fa-arrow-right text-green-400 mr-1"></i> <a href="#investment-simulator" class="text-green-400 hover:underline">Simulez l'évolution de vos investissements</a> sur le long terme dans l'onglet "Simulateur d'investissement".</p>`);
    
    // Mise à jour de l'élément
    recommendationsElement.innerHTML = recommendations.join('');
    console.log(`✅ ${recommendations.length} recommandations mises à jour`);
}

// ✅ FONCTION CORRIGÉE: analyserBudget
function analyserBudgetFixed() {
    console.log('🔄 Analyse du budget avec corrections...');
    
    try {
        // Récupérer les valeurs du budget
        const loyer = parseFloat(document.getElementById('simulation-budget-loyer')?.value) || 0;
        let quotidien, extra;
        
        // Vérifier le mode d'affichage actif
        const detailedView = document.getElementById('detailed-view');
        const isDetailed = detailedView && detailedView.style.display !== 'none';
        
        if (isDetailed && typeof updateCategoryTotal === 'function') {
            // En mode détaillé, utiliser le nouveau système montant × quantité
            quotidien = updateCategoryTotal('vie-courante');
            extra = updateCategoryTotal('loisirs');
        } else {
            // En mode simplifié, utiliser les valeurs directes
            quotidien = parseFloat(document.getElementById('simulation-budget-quotidien')?.value) || 0;
            extra = parseFloat(document.getElementById('simulation-budget-extra')?.value) || 0;
        }
        
        const investAuto = parseFloat(document.getElementById('simulation-budget-invest')?.value) || 0;
        
        // Récupérer le total des dépenses détaillées
        const totalDepensesVariables = typeof updateDetailedExpensesTotal === 'function' 
            ? updateDetailedExpensesTotal() 
            : 0;
        
        // Récupérer le revenu mensuel saisi par l'utilisateur
        const revenuMensuel = parseFloat(document.getElementById('revenu-mensuel-input')?.value) || 3000;
        
        // Calculer les totaux du budget
        const depensesTotales = loyer + quotidien + extra + investAuto + totalDepensesVariables;
        const epargnePossible = Math.max(0, revenuMensuel - depensesTotales);
        const tauxEpargne = revenuMensuel > 0 ? (epargnePossible / revenuMensuel) * 100 : 0;
        
        // Formater les valeurs monétaires
        const formatter = new Intl.NumberFormat('fr-FR', { 
            style: 'currency', 
            currency: 'EUR',
            maximumFractionDigits: 2
        });
        
        // Mettre à jour l'affichage du budget
        const elements = {
            'simulation-revenu-mensuel': formatter.format(revenuMensuel),
            'simulation-depenses-totales': formatter.format(depensesTotales),
            'simulation-epargne-possible': formatter.format(epargnePossible),
            'simulation-taux-epargne': tauxEpargne.toFixed(1) + '%'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        
        // ✅ CORRECTION PRINCIPALE: Appeler correctement updateEpargneBreakdown
        updateEpargneBreakdown(investAuto, epargnePossible, revenuMensuel);
        
        // Mettre à jour les graphiques si les fonctions existent
        if (typeof updateBudgetChart === 'function') {
            updateBudgetChart(loyer, quotidien, extra, investAuto, totalDepensesVariables, epargnePossible);
        }
        
        if (typeof updateEvolutionChart === 'function') {
            updateEvolutionChart(epargnePossible);
        }
        
        // Mise à jour des conseils budgétaires avec moteur de règles
        updateBudgetAdviceFixed(loyer, quotidien, extra, investAuto, totalDepensesVariables, revenuMensuel, tauxEpargne);
        
        // Mise à jour du temps pour atteindre l'objectif d'épargne
        if (typeof updateObjectiveTime === 'function') {
            updateObjectiveTime(epargnePossible);
        }
        
        // Mettre à jour le score budget
        if (typeof updateBudgetScore === 'function') {
            updateBudgetScore(tauxEpargne, loyer, revenuMensuel, depensesTotales);
        }
        
        // ✅ CORRECTION: Mettre à jour les recommandations
        updateRecommendations(epargnePossible, tauxEpargne, investAuto);
        
        console.log(`✅ Analyse terminée: ${epargnePossible}€ épargne possible (${tauxEpargne.toFixed(1)}%)`);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'analyse du budget:', error);
    }
}

// ✅ FONCTION CORRIGÉE: updateBudgetAdvice
function updateBudgetAdviceFixed(loyer, quotidien, extra, investAuto, depensesVariables, revenuMensuel, tauxEpargne) {
    const adviceElement = document.getElementById('budget-advice');
    const adviceList = document.querySelector('#budget-advice .advice-list');
    const adviceScore = document.querySelector('#budget-advice .advice-score');
    
    if (!adviceElement || !adviceList || !adviceScore) return;
    
    // Préparer les données pour le moteur de règles
    const budgetData = {
        tauxEpargne,
        ratioLogement: revenuMensuel > 0 ? (loyer / revenuMensuel) * 100 : 0,
        ratioLoisirs: revenuMensuel > 0 ? (extra / revenuMensuel) * 100 : 0,
        investAuto,
        epargnePossible: Math.max(0, revenuMensuel - (loyer + quotidien + extra + investAuto + depensesVariables))
    };
    
    // Générer les conseils dynamiques
    const dynamicTips = BUDGET_RULES.filter(rule => rule.condition(budgetData));
    
    // Calculer le score
    let score = 3;
    if (tauxEpargne < 5) score--;
    if (budgetData.ratioLogement > 33) score--;
    if (tauxEpargne >= 20) score++;
    if (budgetData.ratioLogement <= 25) score++;
    score = Math.max(1, Math.min(5, score));
    
    // Mettre à jour l'affichage
    adviceScore.textContent = `Évaluation: ${score}/5`;
    
    // Afficher les conseils dynamiques avec style
    const conseilsHTML = dynamicTips.map(tip => {
        const colorClass = {
            danger: 'text-red-400',
            warning: 'text-orange-400',
            success: 'text-green-400',
            info: 'text-blue-400'
        }[tip.severity] || 'text-gray-300';
        
        return `
            <li class="mb-2">
                <span class="${colorClass} font-medium">${tip.message}</span>
                <br><span class="text-gray-400 text-xs ml-4">💡 ${tip.action}</span>
            </li>
        `;
    }).join('');
    
    adviceList.innerHTML = conseilsHTML || '<li>Votre budget semble équilibré.</li>';
    
    // Ajuster la couleur du score selon l'évaluation
    adviceScore.className = 'advice-score inline-block px-2 py-1 rounded text-sm font-medium mb-2';
    if (score >= 4) {
        adviceScore.classList.add('bg-green-900', 'bg-opacity-20', 'text-green-400');
    } else if (score <= 2) {
        adviceScore.classList.add('bg-red-900', 'bg-opacity-20', 'text-red-400');
    } else {
        adviceScore.classList.add('bg-blue-900', 'bg-opacity-20', 'text-blue-400');
    }
}

// ✅ FONCTION D'APPLICATION DES CORRECTIONS
function applyBudgetFixes() {
    console.log('🔧 Application des corrections budget...');
    
    try {
        // Remplacer la fonction analyserBudget existante
        if (typeof window.analyserBudget !== 'undefined') {
            window.analyserBudgetOriginal = window.analyserBudget;
            window.analyserBudget = analyserBudgetFixed;
            console.log('✅ Fonction analyserBudget remplacée');
        } else {
            window.analyserBudget = analyserBudgetFixed;
        }
        
        // Réanalyser le budget avec les corrections
        analyserBudgetFixed();
        
        // Re-attacher les écouteurs au bouton d'analyse
        const budgetButton = document.getElementById('simulate-budget-button');
        if (budgetButton) {
            // Supprimer les anciens écouteurs
            budgetButton.removeEventListener('click', window.analyserBudgetOriginal);
            // Ajouter le nouvel écouteur
            budgetButton.addEventListener('click', analyserBudgetFixed);
        }
        
        // Notification de succès
        console.log('✅ Corrections appliquées avec succès !');
        
        // Afficher une notification visuelle si possible
        if (typeof showBudgetNotification === 'function') {
            showBudgetNotification('Bugs corrigés ! La capacité d\'épargne et les recommandations fonctionnent maintenant.', 'success');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'application des corrections:', error);
    }
}

// ✅ AUTO-APPLICATION DES CORRECTIONS
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Chargement des corrections budget...');
    
    // Attendre que le module budget soit chargé
    setTimeout(() => {
        if (document.getElementById('budget-planner')) {
            applyBudgetFixes();
        } else {
            console.log('⏳ Module budget pas encore chargé, nouvelle tentative...');
            setTimeout(() => {
                if (document.getElementById('budget-planner')) {
                    applyBudgetFixes();
                }
            }, 2000);
        }
    }, 1000);
});

// ✅ INTERFACE PUBLIQUE POUR DÉBOGAGE
window.budgetFixes = {
    updateEpargneBreakdown,
    updateRecommendations,
    analyserBudgetFixed,
    applyBudgetFixes,
    forceUpdate: () => {
        console.log('🔄 Mise à jour forcée...');
        applyBudgetFixes();
    }
};

console.log('💾 ✅ Corrections budget chargées - Tapez budgetFixes.forceUpdate() pour forcer la mise à jour');
