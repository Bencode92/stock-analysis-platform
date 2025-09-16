# Portfolio Normalizer - Instructions

## 🎯 Objectif
Ce module résout le problème d'incompatibilité entre le format v3 généré par le backend Python (avec IDs) et le format attendu par le frontend JavaScript.

## 📝 Fichiers créés

1. **`portfolio_normalizer.py`** : Module contenant les fonctions de normalisation
2. **`apply_normalizer_patch.py`** : Script automatique pour modifier `generate_portfolios.py`

## 🚀 Installation

### Étape 1 : Appliquer le patch
```bash
python apply_normalizer_patch.py
```

Ce script va :
- ✅ Créer une sauvegarde : `generate_portfolios_backup.py`
- ✅ Ajouter les imports nécessaires
- ✅ Modifier la fonction `save_portfolios()`
- ✅ Modifier la fonction `main()` pour utiliser la normalisation

### Étape 2 : Tester la génération
```bash
python generate_portfolios.py
```

### Étape 3 : Vérifier le résultat
Ouvrez `portefeuilles.json` et vérifiez qu'il contient la structure attendue :
```json
{
    "Agressif": {
        "Commentaire": "...",
        "Actions": {
            "Microsoft Corporation": "12%",
            "Apple Inc.": "10%"
        },
        "ETF": {...},
        "Obligations": {...},
        "Crypto": {...},
        "Compliance": {...}
    },
    "Modéré": {...},
    "Stable": {...}
}
```

## 🔄 Fonctionnement

### Avant (format v3 avec IDs)
```json
{
    "Agressif": {
        "Lignes": [
            {"id": "EQ_1", "allocation_pct": 12.5, "name": "Microsoft", "category": "Actions"}
        ]
    }
}
```

### Après (format frontend)
```json
{
    "Agressif": {
        "Actions": {
            "Microsoft Corporation": "12%"
        }
    }
}
```

## 📁 Structure des fichiers

- **`portefeuilles.json`** : Format frontend pour l'affichage web
- **`data/portfolio_history/portefeuilles_v3_stable_*.json`** : Archive complète avec les deux formats

## 🛠️ En cas de problème

### Restaurer la version originale
```bash
cp generate_portfolios_backup.py generate_portfolios.py
```

### Application manuelle
Si le patch automatique ne fonctionne pas, modifiez manuellement `generate_portfolios.py` :

1. Ajouter après les imports :
```python
from portfolio_normalizer import normalize_v3_to_frontend_v1, save_portfolios_dual
```

2. Dans la fonction `main()`, remplacer :
```python
save_portfolios(portfolios)
```

Par :
```python
allowed_assets = extract_allowed_assets(filtered_data)
front_json = normalize_v3_to_frontend_v1(portfolios, allowed_assets)
save_portfolios_dual(front_json, portfolios, "v3_stable_compliance")
```

## ✅ Validation

Le système fonctionne correctement si :
1. `portefeuilles.json` contient le format avec noms complets (pas d'IDs)
2. La page web affiche correctement les portefeuilles
3. Les graphiques et pourcentages sont visibles
4. Les archives v3 sont créées dans `data/portfolio_history/`

## 🔍 Débogage

Pour voir les données transformées :
```python
python -c "import json; print(json.dumps(json.load(open('portefeuilles.json')), indent=2)[:500])"
```

## 📞 Support

En cas de problème persistant, vérifiez :
1. Que tous les fichiers CSV source sont présents dans `data/`
2. Que la clé API OpenAI est définie : `export API_CHAT=sk-...`
3. Les logs de génération dans `debug/prompts/`
