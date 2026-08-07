#!/bin/bash

# ===========================================
# SCRIPT DE PATCH AUTOMATIQUE SIMULATION V2.0
# ===========================================
# Ce script applique automatiquement les modifications
# nécessaires pour intégrer l'interface v2.0

set -e

echo "🚀 Intégration automatique de l'interface Simulation v2.0"
echo "=================================================="

# Vérification des prérequis
if [ ! -f "simulation.html" ]; then
    echo "❌ Erreur : simulation.html introuvable"
    echo "📁 Exécutez ce script depuis la racine du projet"
    exit 1
fi

# Backup du fichier original
echo "💾 Création d'un backup..."
cp simulation.html simulation.html.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backup créé : simulation.html.backup.$(date +%Y%m%d_%H%M%S)"

# Vérification de l'existence des nouveaux fichiers
missing_files=()

if [ ! -f "css/simulation-results-v2.css" ]; then
    missing_files+=("css/simulation-results-v2.css")
fi

if [ ! -f "js/simulation-results-v2.js" ]; then
    missing_files+=("js/simulation-results-v2.js")
fi

if [ ${#missing_files[@]} -gt 0 ]; then
    echo "❌ Fichiers manquants :"
    printf '%s\n' "${missing_files[@]}"
    echo "📥 Assurez-vous d'être sur la branche feature/simulation-ui-v2"
    exit 1
fi

echo "✅ Tous les fichiers v2.0 sont présents"

# ÉTAPE 1 : Ajouter les nouveaux CSS
echo "🎨 Ajout des styles v2.0..."

# Chercher la ligne avec simulation.css et ajouter après
if grep -q "simulation.css" simulation.html; then
    # Ajouter après la ligne simulation.css si pas déjà présent
    if ! grep -q "simulation-results-v2.css" simulation.html; then
        sed -i '/simulation\.css/a\    <link rel="stylesheet" href="css/simulation-results-v2.css">' simulation.html
        echo "✅ CSS v2.0 ajouté"
    else
        echo "⚠️  CSS v2.0 déjà présent"
    fi
else
    echo "❌ Impossible de localiser simulation.css dans simulation.html"
    exit 1
fi

# ÉTAPE 2 : Ajouter le nouveau JavaScript
echo "⚙️  Ajout des scripts v2.0..."

# Ajouter avant la fermeture du </body> si pas déjà présent
if ! grep -q "simulation-results-v2.js" simulation.html; then
    sed -i '/<\/body>/i\    <script src="js/simulation-results-v2.js"></script>' simulation.html
    echo "✅ JavaScript v2.0 ajouté"
else
    echo "⚠️  JavaScript v2.0 déjà présent"
fi

# ÉTAPE 3 : Patch de la fonction updateResultsDisplay
echo "🔧 Patch de la fonction updateResultsDisplay..."

# Créer un fichier temporaire avec le patch JavaScript
cat > /tmp/simulation_v2_patch.js << 'EOF'

// PATCH AUTOMATIQUE V2.0 - Ajouté par le script de patch
// =====================================================

// Sauvegarder la fonction originale
const originalUpdateResultsDisplay = window.updateResultsDisplay || updateResultsDisplay;

// Nouvelle fonction avec support v2.0
function updateResultsDisplay(results) {
    // Appeler la fonction originale pour compatibilité
    if (typeof originalUpdateResultsDisplay === 'function') {
        originalUpdateResultsDisplay(results);
    }
    
    // NOUVEAU : Interface v2.0
    if (window.SimulationResultsV2) {
        console.log('🔄 Mise à jour interface v2.0', results);
        
        window.SimulationResultsV2.updateResults({
            initialDeposit: results.initialDeposit || results.investedTotal,
            finalAmount: results.finalAmount,
            afterTaxAmount: results.afterTaxAmount,
            taxAmount: results.taxAmount,
            years: results.years,
            vehicleId: results.vehicleId,
            annualReturn: results.annualReturn
        });
    }
}

// Rendre la fonction globale
window.updateResultsDisplay = updateResultsDisplay;

EOF

# Ajouter le patch si pas déjà présent
if ! grep -q "PATCH AUTOMATIQUE V2.0" simulation.html; then
    # Insérer avant la fermeture du dernier script
    sed -i '/<\/script>$/i\'"$(cat /tmp/simulation_v2_patch.js)" simulation.html
    echo "✅ Patch JavaScript appliqué"
    rm /tmp/simulation_v2_patch.js
else
    echo "⚠️  Patch JavaScript déjà présent"
    rm /tmp/simulation_v2_patch.js
fi

# ÉTAPE 4 : Ajouter un marqueur pour l'HTML v2.0
echo "📝 Préparation de la zone d'intégration HTML..."

# Chercher la section résultats existante et ajouter un marqueur
if ! grep -q "INTEGRATION-ZONE-V2" simulation.html; then
    # Localiser la div des résultats et ajouter un commentaire après
    sed -i '/Résultats de la simulation/a\                <!-- INTEGRATION-ZONE-V2: Remplacer cette section par le contenu v2.0 -->' simulation.html
    echo "✅ Zone d'intégration HTML marquée"
else
    echo "⚠️  Zone d'intégration déjà marquée"
fi

# ÉTAPE 5 : Vérification finale
echo "🔍 Vérification de l'intégration..."

checks_passed=0
total_checks=3

# Check 1: CSS présent
if grep -q "simulation-results-v2.css" simulation.html; then
    echo "✅ CSS v2.0 intégré"
    ((checks_passed++))
else
    echo "❌ CSS v2.0 manquant"
fi

# Check 2: JS présent
if grep -q "simulation-results-v2.js" simulation.html; then
    echo "✅ JavaScript v2.0 intégré"
    ((checks_passed++))
else
    echo "❌ JavaScript v2.0 manquant"
fi

# Check 3: Patch présent
if grep -q "PATCH AUTOMATIQUE V2.0" simulation.html; then
    echo "✅ Patch updateResultsDisplay appliqué"
    ((checks_passed++))
else
    echo "❌ Patch updateResultsDisplay manquant"
fi

echo ""
echo "📊 Résultat : $checks_passed/$total_checks vérifications réussies"

if [ $checks_passed -eq $total_checks ]; then
    echo ""
    echo "🎉 INTÉGRATION RÉUSSIE !"
    echo "========================"
    echo "✅ L'interface v2.0 est prête à être utilisée"
    echo ""
    echo "📋 Prochaines étapes :"
    echo "1. Remplacer manuellement la section HTML des résultats"
    echo "2. Copier le contenu depuis simulation-v2-demo.html"
    echo "3. Tester l'interface avec vos simulations"
    echo ""
    echo "📖 Consultez README-SIMULATION-V2.md pour les détails"
    echo "🎮 Testez avec simulation-v2-demo.html"
    echo ""
    echo "🔄 Pour annuler :"
    echo "   cp simulation.html.backup.* simulation.html"
else
    echo ""
    echo "⚠️  INTÉGRATION PARTIELLE"
    echo "========================="
    echo "Certaines vérifications ont échoué."
    echo "Consultez les messages ci-dessus et corrigez manuellement."
    echo ""
    echo "🔄 Pour restaurer :"
    echo "   cp simulation.html.backup.* simulation.html"
fi

echo ""
echo "🚀 Script terminé"