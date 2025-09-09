#!/bin/bash
# Script pour ajouter la concurrence aux workflows qui pushent

# Liste des workflows critiques qui font des push
WORKFLOWS=(
  "crypto-pipeline.yml"
  "update-market-data.yml"
  "update-financial-data.yml"
  "update-holdings-weekly.yml"
  "update-unified-lists.yml"
  "filter-stocks.yml"
  "filter-cryptos.yml"
  "etf-pipeline.yml"
  "update-themes.yml"
  "update-commodities.yml"
  "update-sectors-data.yml"
  "update-data.yml"
  "update-etf-data.yml"
  "update-market-data-twelve.yml"
  "update-market-data-optimized.yml"
  "update-holdings-data-twelve.yml"
  "update-sectors-data-twelve.yml"
  "weekly-etf-refresh.yml"
)

echo "🔧 Ajout de la configuration de concurrence aux workflows..."

for workflow in "${WORKFLOWS[@]}"; do
  FILE=".github/workflows/$workflow"
  
  # Skip si le fichier n'existe pas ou est vide
  if [ ! -s "$FILE" ]; then
    echo "⏭️  Ignoré: $workflow (fichier vide ou inexistant)"
    continue
  fi
  
  # Skip si déjà configuré
  if grep -q "concurrency:" "$FILE"; then
    echo "✅ Déjà configuré: $workflow"
    continue
  fi
  
  echo "📝 Mise à jour: $workflow"
  
  # Créer un fichier temporaire avec la nouvelle config
  {
    # Première ligne (name:)
    head -n 1 "$FILE"
    
    # Ajouter concurrency et permissions
    cat << 'EOF'

# Concurrency control to prevent conflicts
concurrency:
  group: repo-writes-global
  cancel-in-progress: false  # Wait for crypto-data-pipeline if running

permissions:
  contents: write

EOF
    
    # Le reste du fichier (en sautant la première ligne)
    tail -n +2 "$FILE"
  } > "${FILE}.tmp"
  
  # Remplacer le fichier original
  mv "${FILE}.tmp" "$FILE"
  
  echo "✅ Mis à jour: $workflow"
done

echo ""
echo "🎉 Configuration de concurrence ajoutée à ${#WORKFLOWS[@]} workflows!"
echo ""
echo "📌 Note: Le workflow crypto-data-pipeline.yml a la priorité absolue avec:"
echo "   - cancel-in-progress: true (annule les autres)"
echo ""
echo "📌 Les autres workflows ont:"
echo "   - cancel-in-progress: false (attendent leur tour)"
