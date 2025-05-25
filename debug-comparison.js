/**
 * debug-comparison.js - Script de debug pour le comparateur
 * Ce fichier aide à comprendre pourquoi certaines simulations échouent
 */

// Fonction pour tester une simulation avec des paramètres donnés
function debugSimulation(ville, type, apport) {
    console.log(`\n🔍 DEBUG: Test pour ${ville} ${type} avec ${apport}€ d'apport`);
    
    // Récupérer les données depuis le manager
    const villesData = window.villeSearchManager?.villesData;
    if (!villesData) {
        console.error('❌ Données des villes non chargées');
        return;
    }
    
    // Trouver la ville
    const villeData = villesData.villes.find(v => v.nom === ville);
    if (!villeData) {
        console.error(`❌ Ville ${ville} non trouvée`);
        return;
    }
    
    // Récupérer les données du type
    const pieceData = villeData.pieces[type];
    if (!pieceData) {
        console.error(`❌ Type ${type} non disponible pour ${ville}`);
        return;
    }
    
    console.log(`📊 Prix/m²: ${pieceData.prix_m2}€ • Loyer/m²: ${pieceData.loyer_m2}€/mois`);
    
    // Calculer quelques métriques de base
    const surfaces = [20, 30, 40, 50, 60];
    console.log('\n📏 Analyse par surface:');
    
    surfaces.forEach(surface => {
        const prix = surface * pieceData.prix_m2;
        const loyer = surface * pieceData.loyer_m2;
        const fraisNotaire = prix * 0.08; // ~8%
        const travaux = prix * 0.005; // 0.5%
        const coutTotal = prix + fraisNotaire + travaux;
        const apportMin = coutTotal * 0.1; // 10% minimum
        
        console.log(`Surface ${surface}m²:`);
        console.log(`  • Prix: ${prix.toLocaleString()}€`);
        console.log(`  • Coût total estimé: ${Math.round(coutTotal).toLocaleString()}€`);
        console.log(`  • Apport min (10%): ${Math.round(apportMin).toLocaleString()}€`);
        console.log(`  • Loyer mensuel: ${loyer}€`);
        console.log(`  • ${apport >= apportMin ? '✅ Finançable' : '❌ Apport insuffisant'}`);
    });
}

// Fonction pour analyser toutes les villes sélectionnées
function analyzeSelectedCities() {
    if (!window.cityComparator) {
        console.error('❌ Comparateur non initialisé');
        return;
    }
    
    const apport = parseFloat(document.getElementById('apport')?.value) || 20000;
    const mode = document.querySelector('input[name="calculation-mode"]:checked')?.value || 'loyer-mensualite';
    
    console.log('\n🏦 ANALYSE DES VILLES SÉLECTIONNÉES');
    console.log(`💰 Apport: ${apport.toLocaleString()}€`);
    console.log(`📊 Mode: ${mode === 'cashflow-positif' ? 'Cash-flow positif' : 'Loyer ≥ Mensualité'}`);
    
    window.cityComparator.selectedCities.forEach((ville, nom) => {
        console.log(`\n🏙️ ${nom} (${ville.departement})`);
        Object.keys(ville.pieces).forEach(type => {
            const piece = ville.pieces[type];
            const surfaceMax = Math.floor(apport * 10 / piece.prix_m2); // Surface max avec 10% d'apport
            console.log(`  ${type}: ${piece.prix_m2}€/m² • ${piece.loyer_m2}€/m²/mois • Surface max ≈ ${surfaceMax}m²`);
        });
    });
}

// Ajouter des boutons de debug
function addDebugButtons() {
    const container = document.getElementById('city-comparison-panel');
    if (!container) return;
    
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = 'margin-top: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px;';
    debugDiv.innerHTML = `
        <h4 style="color: #60A5FA; margin-bottom: 0.5rem;">🔧 Outils de debug</h4>
        <button onclick="analyzeSelectedCities()" class="btn btn-outline" style="margin-right: 0.5rem;">
            Analyser les villes
        </button>
        <button onclick="testWithHigherBudget()" class="btn btn-outline">
            Tester avec 50k€ d'apport
        </button>
    `;
    
    container.querySelector('.comparison-content')?.appendChild(debugDiv);
}

// Fonction pour tester avec un budget plus élevé
window.testWithHigherBudget = function() {
    const apportInput = document.getElementById('apport');
    if (apportInput) {
        apportInput.value = '50000';
        console.log('💰 Apport mis à jour à 50 000€');
        
        // Relancer la comparaison
        document.getElementById('btn-launch-comparison')?.click();
    }
};

// Auto-exécution au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(addDebugButtons, 1000);
    });
} else {
    setTimeout(addDebugButtons, 1000);
}

// Export des fonctions pour la console
window.debugSimulation = debugSimulation;
window.analyzeSelectedCities = analyzeSelectedCities;

console.log('🔧 Debug comparison.js chargé. Utilisez:');
console.log('  • analyzeSelectedCities() pour analyser les villes sélectionnées');
console.log('  • debugSimulation("Lyon 1er Arrondissement", "T3", 20000) pour tester une ville spécifique');
