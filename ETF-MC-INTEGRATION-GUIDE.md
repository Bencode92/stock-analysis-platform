# 📚 ETF MC v3.2 - Guide d'intégration dans etf.html

## 🎯 Scripts à ajouter dans etf.html

Ajoutez ces lignes **avant** la balise `</body>` dans votre fichier `etf.html`, dans cet ordre exact :

```html
<!-- Script principal ETF -->
<script src="etf-script.js"></script>

<!-- Data Adapter pour unifier les données -->
<script src="etf-data-adapter.js"></script>

<!-- Scripts MC dans l'ordre -->
<link rel="stylesheet" href="mc-styles.css">
<script src="etf-mc-integration.js"></script>
<script src="etf-mc-module.js"></script>
```

## 🔧 Modifications HTML pour la section Composer

Dans la section du Composer Multi-Critères, modifiez les `<fieldset>` pour ajouter les attributs `data-role` et `id` :

### 1. Fieldset des métriques
```html
<fieldset data-role="metrics">
    <legend class="text-sm opacity-70 mb-2">Critères de sélection ETF (v3.2)</legend>
    <div class="flex flex-wrap gap-2" id="etf-mc-metrics">
        <!-- Les checkboxes métriques ici -->
    </div>
</fieldset>
```

### 2. Fieldset des filtres
```html
<fieldset data-role="filters" id="etf-mc-filters">
    <legend class="text-sm opacity-70 mb-2">Filtres avancés</legend>
    <!-- Les filtres ici -->
</fieldset>
```

## ✨ Nouvelles fonctionnalités v3.2

### 🚀 Améliorations principales
- **Event-based** : Plus de polling, utilise `ETFData:ready`
- **Auto-recalcul** : Recalcul automatique avec debounce (120ms)
- **LocalStorage** : Sauvegarde des préférences utilisateur
- **Infos étendues** : Affiche pays/secteur/date dans les cartes
- **Performance** : RequestAnimationFrame pour fluidité
- **API propre** : Interface claire entre modules

### 📊 Données affichées dans les cartes

Chaque carte affiche maintenant :
- **Ticker** et **Nom complet**
- **Type** : Actions/Obligations/Matières
- **Badge LEV/INV** si leveraged/inverse
- **Pays principal** avec poids (ex: 🌍 USA 65.3%)
- **Secteur principal** avec poids (ex: 🏷️ Technology 42.1%)
- **Date de mise à jour** (ex: ⏱️ 04/09/2025)
- **Métriques sélectionnées** avec code couleur
- **Score** en mode équilibre (0-100%)

### 🎨 Codes couleur améliorés

#### TER (Total Expense Ratio)
- 🟢 **Vert brillant** : < 0.2%
- 🟢 **Vert** : 0.2-0.4%
- 🟡 **Jaune** : 0.4-0.7%
- 🔴 **Rouge** : > 0.7%

#### Volatilité
- 🟢 **Vert brillant** : < 10%
- 🟢 **Vert** : 10-20%
- 🟡 **Jaune** : 20-30%
- 🔴 **Rouge** : > 30%

#### R/Vol (Ratio Rendement/Volatilité)
- 🟢 **Vert brillant** : > 2.0
- 🟢 **Vert** : 1.0-2.0
- 🟡 **Jaune** : 0-1.0
- 🔴 **Rouge** : < 0

### 💾 Préférences sauvegardées

Le module sauvegarde automatiquement dans localStorage :
- Mode de tri (équilibre/priorités)
- Métriques sélectionnées
- Tous les filtres appliqués

Les préférences sont restaurées au rechargement de la page.

### ⚡ Performances optimisées

- **Debounce** : Évite les recalculs excessifs (120ms)
- **RequestAnimationFrame** : Calculs dans le cycle de rendu
- **Fragment** : Création DOM optimisée
- **Lazy calculation** : Calcul uniquement des métriques sélectionnées

## 🐛 Debug dans la console

```javascript
// État actuel avec préférences
ETF_MC.state

// Forcer un recalcul immédiat
ETF_MC.calculate()

// Changer les métriques programmatiquement
ETF_MC.setMetrics(['ter', 'aum', 'sharpe_proxy'])

// Changer un filtre
ETF_MC.setFilter('maxTER', 0.5)

// Changer le mode
ETF_MC.setMode('lexico')

// Statistiques des données
ETFData.getStats()
```

## 📈 Flux de données

```
CSV Files → etf-script.js → ETFData.setData() → Event 'ETFData:ready'
                                ↓
                         etf-data-adapter.js
                                ↓
                         etf-mc-module.js (v3.2)
                                ↓
                         Auto-calculate avec debounce
                                ↓
                         Render + LocalStorage
```

## ✅ Checklist de validation

- [ ] Les scripts sont chargés dans le bon ordre
- [ ] L'adapter de données est présent
- [ ] Les fieldsets ont les bons attributs `data-role`
- [ ] Le recalcul automatique fonctionne
- [ ] Les préférences sont sauvegardées/restaurées
- [ ] Les infos pays/secteur s'affichent
- [ ] Le loader apparaît pendant le calcul
- [ ] Pas d'erreurs dans la console

## 🎉 Résultat attendu

Après ces modifications, vous devriez avoir :
- **Chargement plus rapide** (pas de polling)
- **Interface plus réactive** (auto-recalcul)
- **Expérience mémorisée** (LocalStorage)
- **Plus d'informations** (pays, secteur, date)
- **Meilleure performance** (debounce, RAF)

---
*Version 3.2 - Module ETF Multi-Critères avec optimisations*
*Contact: benoit.comas@gmail.com*
