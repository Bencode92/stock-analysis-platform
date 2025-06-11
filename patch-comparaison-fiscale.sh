#!/bin/bash
# patch-comparaison-fiscale.sh
# Script pour appliquer automatiquement les améliorations du badge de pourcentage

echo "🚀 Application du patch pour améliorer l'affichage du pourcentage..."

# Vérifier que le fichier comparaison-fiscale.html existe
if [ ! -f "comparaison-fiscale.html" ]; then
    echo "❌ Erreur : Le fichier comparaison-fiscale.html n'existe pas dans le répertoire courant."
    exit 1
fi

# Créer une sauvegarde
cp comparaison-fiscale.html comparaison-fiscale.html.backup
echo "✅ Sauvegarde créée : comparaison-fiscale.html.backup"

# Insérer le CSS après les CSS existants
sed -i '/<link rel="stylesheet" href="css\/immo-comparison-enhanced.css">/a\    \n    <!-- CSS pour améliorer la barre de position -->\n    <link rel="stylesheet" href="css/market-position-enhanced.css">' comparaison-fiscale.html

# Insérer le JavaScript après les scripts existants
sed -i '/<script src=".\/market-fiscal-analysis.js"><\/script>/a\    \n    <!-- Script d'\''amélioration de l'\''analyse de marché -->\n    <script src="./market-analysis-enhancement.js"></script>' comparaison-fiscale.html

echo "✅ Patch appliqué avec succès !"
echo ""
echo "📋 Modifications effectuées :"
echo "   - Ajout du CSS : css/market-position-enhanced.css"
echo "   - Ajout du JS : market-analysis-enhancement.js"
echo ""
echo "💡 Le badge de pourcentage s'affichera maintenant au-dessus du marqueur de position."
echo ""
echo "🔄 Pour annuler les modifications :"
echo "   mv comparaison-fiscale.html.backup comparaison-fiscale.html"
