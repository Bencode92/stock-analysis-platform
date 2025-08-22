# Correctif CSG/CRDS pour les dirigeants TNS

## 🐛 Description du problème

Pour les dirigeants TNS (Travailleurs Non Salariés) des structures suivantes :
- **EURL à l'IS**
- **SARL** (gérant majoritaire)
- **SELARL**
- **SCA**

La CSG/CRDS non déductible (2,9% de la rémunération brute) n'est pas réintégrée dans la base imposable pour le calcul de l'impôt sur le revenu.

## 📊 Impact financier

### Exemple concret :
- Chiffre d'affaires : 4 000 000€
- Marge : 99% → Résultat : 3 960 000€
- Rémunération (70%) : 2 772 000€
- Cotisations TNS (30%) : 831 600€
- **Revenu net social** : 1 940 400€

### Erreur actuelle :
- L'IR est calculé sur : 1 940 400€ ❌

### Calcul correct :
- CSG/CRDS non déductible : 2 772 000€ × 2,9% = **80 388€**
- Base imposable IR : 1 940 400€ + 80 388€ = **2 020 788€** ✅

### Conséquences :
- Sous-estimation de l'impôt de plusieurs dizaines de milliers d'euros
- Comparaisons faussées entre statuts juridiques
- Risque de redressement fiscal pour les utilisateurs

## 🔧 Solution technique

### 1. Identifier la CSG non déductible
```javascript
const CSG_CRDS_IMPOSABLE = 0.029; // 2,9%
const csgNonDeductible = Math.round(remuneration * CSG_CRDS_IMPOSABLE);
```

### 2. Réintégrer dans la base imposable
```javascript
const baseImposableIR = remunerationNetteSociale + csgNonDeductible;
```

### 3. Calculer l'IR sur la base correcte
```javascript
const impotRevenu = modeExpert 
    ? FiscalUtils.calculateProgressiveIR(baseImposableIR)
    : Math.round(baseImposableIR * tmiActuel / 100);
```

## 📝 Fichiers à modifier

1. **fiscal-simulation.js** :
   - Méthode `simulerEURL` (section IS)
   - Méthode `simulerSARL` (condition gérant majoritaire)
   - Méthode `simulerSELARL`
   - Méthode `simulerSCA`

2. **fiscal-guide.js** :
   - Fonction `showCalculationDetails` pour afficher la réintégration CSG

## ✅ Tests de validation

Exécuter dans la console :
```javascript
// Test avec CA 4M€, marge 99%, rémunération 70%
const resultat = window.SimulationsFiscales.simulerEURL({
    ca: 4000000,
    tauxMarge: 0.99,
    tauxRemuneration: 0.70,
    optionIS: true,
    modeExpert: true
});

console.log("CSG non déductible:", resultat.csgNonDeductible); // Doit être ~80 388€
console.log("Base imposable IR:", resultat.baseImposableIR); // Doit être ~2 020 788€
```

## 🚀 Prochaines étapes

1. Appliquer les modifications dans fiscal-simulation.js
2. Mettre à jour l'affichage des détails dans fiscal-guide.js
3. Tester sur tous les statuts TNS concernés
4. Vérifier l'impact sur les simulations existantes

## 📚 Références

- [Article 154 quinquies du CGI](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041471314) - CSG/CRDS déductible
- Taux CSG/CRDS non déductible : 2,4% (CSG) + 0,5% (CRDS) = 2,9%
- Applicable aux revenus d'activité des TNS
