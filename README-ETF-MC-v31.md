# 📦 ETF Multi-Critères v3.1 - Documentation

## 🚀 Changements v3.1 (Décembre 2024)

### ✨ Améliorations principales
- **Utilisation des vrais champs de données** (total_expense_ratio, aum_usd, etc.)
- **Classification intelligente** des ETFs (Actions, Obligations, Matières premières)
- **Nouvelles métriques** :
  - `R/Vol` : Ratio rendement/volatilité (proxy Sharpe)
  - `Yield net` : Rendement net après frais (obligations)
  - `Qualité` : Score de qualité des données
- **Filtrage automatique** des ETFs leveraged/inverse (désactivable)
- **Formatage amélioré** : AUM en M$ ou B$, TER en %
- **UX améliorée** : Tooltips, raccourcis clavier, loader animé

## 📝 Fichiers mis à jour

- `etf-mc-module.js` : Module principal v3.1
- `etf-mc-integration.js` : Intégration UI v3.1

## 🎯 Utilisation

### Modes de calcul
- **Mode Équilibre** : Score normalisé pondéré (0-100%)
- **Mode Priorités** : Tri lexicographique avec tolérance 1%

### Raccourcis clavier
- `Ctrl + Enter` : Appliquer les filtres
- `Esc` : Réinitialiser tout

### Types d'ETF détectés automatiquement
- **Actions** : ETFs equity classiques
- **Obligations** : Contient "Bond", "Government", "Fixed Income" dans fund_type
- **Matières premières** : Contient "Commodity", "Gold", "Silver", "Oil"
- **Leveraged/Inverse** : Détectés via etf_type ou leverage != 0

## 📊 Mapping des champs CSV

| Interface | Champ CSV réel | Transformation |
|-----------|---------------|----------------|
| TER | total_expense_ratio | × 100 (en %) |
| AUM | aum_usd | ÷ 1M (en M$) |
| Perf Daily | daily_change_pct | Direct (%) |
| YTD | ytd_return_pct | Direct (%) |
| Perf 1Y | one_year_return_pct | Direct (%) |
| Vol 3Y | vol_3y_pct | Direct (%) |
| Yield TTM | yield_ttm | × 100 (en %) |
| R/Vol | Calculé | return_1y ÷ vol_3y |
| Yield net | Calculé | yield - TER (bonds) |
| Qualité | data_quality_score | Direct (0-100) |

## 🔧 Configuration

### Métriques par défaut
```javascript
['ter', 'aum', 'return_ytd', 'volatility', 'sharpe_proxy']
```

### Filtres par défaut
- **Qualité min** : 80/100 (ajustable via slider)
- **Leveraged/Inverse** : Exclus par défaut (toggle disponible)
- **Type** : Tous (modifiable via dropdown)

## 🎨 Codes couleur pour les métriques

### TER (Total Expense Ratio)
- 🟢 Vert brillant : < 0.2%
- 🟢 Vert : < 0.4%
- 🟡 Jaune : < 0.7%
- 🔴 Rouge : ≥ 0.7%

### Volatilité
- 🟢 Vert brillant : < 10%
- 🟢 Vert : < 20%
- 🟡 Jaune : < 30%
- 🔴 Rouge : ≥ 30%

### R/Vol (Ratio Rendement/Volatilité)
- 🟢 Vert brillant : > 2.0
- 🟢 Vert : > 1.0
- 🟡 Jaune : > 0
- 🔴 Rouge : ≤ 0

### Qualité des données
- 🟢 Vert brillant : ≥ 95
- 🟢 Vert : ≥ 90
- 🟡 Jaune : ≥ 80
- 🔴 Rouge : < 80

## 🐛 Debugging dans la console

```javascript
// État actuel
ETF_MC.state

// Métriques disponibles
ETF_MC.METRICS

// Forcer un recalcul
ETF_MC.calculate()

// Tester la classification d'un ETF
ETF_MC.helpers.kindOf(etf)  // 'equity', 'bonds', 'commodity'
ETF_MC.helpers.isLeveraged(etf)  // true/false

// Voir les données brutes
window.ETFData.getData()
```

## ✅ Validation après mise à jour

1. ✓ Les nouvelles métriques (R/Vol, Yield net, Qualité) apparaissent
2. ✓ Le toggle "Exclure Leveraged/Inverse" est visible
3. ✓ Le slider de qualité fonctionne (0-100)
4. ✓ Les raccourcis clavier répondent
5. ✓ Les ETFs sont correctement classés (badges colorés)
6. ✓ L'AUM s'affiche en M$ ou B$
7. ✓ Le TER s'affiche en %

## 📈 Prochaines améliorations possibles

- [ ] Export CSV/Excel des résultats
- [ ] Sauvegarde des présets de filtres
- [ ] Graphiques de comparaison
- [ ] Mode comparaison côte à côte
- [ ] Historique des calculs
- [ ] Filtrage par holdings (NVDA, TSLA, etc.)
- [ ] Filtrage par secteur/pays des sous-jacents

## 📄 Exemple de résultat

```
Top 10 ETFs - Mode Équilibre
• TER · AUM · YTD · Vol 3Y · R/Vol
• No Lev/Inv • 45/120 ETFs

#1 SPY - Actions - Score: 92%
   TER: 0.09% | AUM: 500B$ | YTD: +15% | Vol: 12% | R/Vol: 1.8

#2 QQQ - Actions - Score: 88%
   TER: 0.20% | AUM: 200B$ | YTD: +22% | Vol: 18% | R/Vol: 1.5
```

## 💬 Support

Pour toute question, vérifiez la console JavaScript pour les messages d'erreur et utilisez les commandes de debug ci-dessus.

---
*Version 3.1 - Mise à jour automatique via GitHub API*
*Contact: benoit.comas@gmail.com*
