# 📊 Module d'Équilibre Locatif - Guide d'intégration

## 🎯 Objectif

Ce module calcule le **prix ou loyer d'équilibre** où vos cash-flows couvrent exactement l'amortissement du capital + les CAPEX.

**Équation résolue** : `CF_net = Amortissement_capital + CAPEX`

---

## 📁 Fichiers

- **`/js/equilibre.js`** : Module principal (déjà créé ✅)
- **`comparaison-fiscale.html`** : À modifier pour l'intégration

---

## 🔧 Intégration en 3 étapes

### Étape 1 : Charger le module dans le HTML

Ajoutez cette ligne **avant la fermeture du `</body>`** dans `comparaison-fiscale.html` :

```html
<!-- AVANT les autres scripts -->
<script src="./js/equilibre.js"></script>

<!-- Scripts existants -->
<script src="./ville-search.js"></script>
<script src="./immo-simulation.js"></script>
```

### Étape 2 : Ajouter l'interface utilisateur

Ajoutez ce bloc dans la **Section 1 (Formulaire)**, juste après le bloc "Régime fiscal actuel" :

```html
<!-- ⬇️ NOUVEAU : Options d'analyse d'équilibre -->
<div class="form-section">
  <div class="form-section-title">
    <i class="fas fa-balance-scale"></i>
    Analyse d'équilibre (optionnel)
  </div>
  
  <div style="margin-bottom: 20px;">
    <label class="toggle-switch" style="display: inline-flex; align-items: center; gap: 10px;">
      <input type="checkbox" id="enable-equilibre">
      <span class="slider"></span>
      <span style="color: #e2e8f0;">Activer l'analyse d'équilibre</span>
    </label>
    <span class="form-help">Trouvez le loyer ou prix d'achat où votre CF net couvre l'amortissement</span>
  </div>

  <!-- Options visibles seulement si activé -->
  <div id="equilibre-options" style="display:none;">
    <div class="grid grid-2">
      <!-- Variable à résoudre -->
      <div class="form-group">
        <label class="form-label">Variable à trouver</label>
        <select id="equilibre-variable" class="form-input">
          <option value="loyer_mensuel" selected>Loyer mensuel d'équilibre</option>
          <option value="prix_d_achat">Prix d'achat d'équilibre</option>
        </select>
        <span class="form-help">Quelle valeur voulez-vous calculer ?</span>
      </div>

      <!-- Période d'analyse -->
      <div class="form-group">
        <label class="form-label">Période d'analyse</label>
        <select id="equilibre-periode" class="form-input">
          <option value="mensuel">Mensuel (1er mois)</option>
          <option value="annuel" selected>Annuel (1ère année)</option>
          <option value="n_annees">Sur plusieurs années</option>
        </select>
        <span class="form-help">Horizon de calcul</span>
      </div>

      <!-- Nombre d'années (si sélectionné) -->
      <div class="form-group" id="equilibre-n-years-group" style="display:none;">
        <label class="form-label" for="equilibre-n-years">Nombre d'années</label>
        <div class="form-input-wrapper">
          <input type="number" id="equilibre-n-years" class="form-input" value="5" min="1" max="30">
          <span class="form-addon-text">ans</span>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
// Toggle des options d'équilibre
document.getElementById('enable-equilibre').addEventListener('change', function() {
  document.getElementById('equilibre-options').style.display = this.checked ? 'block' : 'none';
});

// Toggle du champ "nombre d'années"
document.getElementById('equilibre-periode').addEventListener('change', function() {
  const showYears = this.value === 'n_annees';
  document.getElementById('equilibre-n-years-group').style.display = showYears ? 'block' : 'none';
});
</script>
```

### Étape 3 : Intégrer dans `proceedToFiscalAnalysis()`

Trouvez la fonction `proceedToFiscalAnalysis()` (vers la ligne 2880) et ajoutez ce code **après l'analyse fiscale** (après le bloc 9 "Debug") :

```javascript
// ============================================================================
// NOUVEAU : Calcul d'équilibre locatif
// ============================================================================
if (document.getElementById('enable-equilibre')?.checked && window.Equilibre) {
    try {
        console.log('🎯 Calcul de l\'équilibre locatif...');
        
        // Récupérer les paramètres
        const variableCible = document.getElementById('equilibre-variable').value;
        const periodeBase = document.getElementById('equilibre-periode').value;
        const nAnnees = periodeBase === 'n_annees' 
            ? parseInt(document.getElementById('equilibre-n-years').value) 
            : 1;
        
        // Construire les inputs
        const eqInputs = {
            variable_cible: variableCible,
            periode_base: periodeBase,
            n_annees: nAnnees,
            prix_d_achat: propertyData.prixPaye,
            montant_emprunt: propertyData.prixPaye - propertyData.apport,
            taux_annuel: propertyData.taux,
            duree_annees: propertyData.duree,
            differe_capital: 0,
            loyer_mensuel: propertyData.loyerActuel,
            vacance_pct: propertyData.vacanceLocative || 0,
            taxe_fonciere: propertyData.taxeFonciere || 800,
            charges_copro: propertyData.chargesCoproNonRecup || 50,
            assurance: propertyData.assurancePNO || 15,
            gestion: propertyData.gestionLocativeTaux || 0,
            entretien: propertyData.entretienAnnuel || 500,
            capex_annuel: null,
            capex_list: null,
            regime_fiscal: propertyData.regimeActuel,
            tmi_ou_is: propertyData.tmi,
            prelevements: 17.2,
            indexation_loyer: 0,
            inflation_charges: 0
        };
        
        // Résoudre l'équilibre
        const eqResult = window.Equilibre.solveEquilibre(eqInputs, {
            tol: 1e-6,
            max_iter: 100
        });
        
        // Afficher le résultat
        window.Equilibre.renderEquilibre(eqResult, resultsDiv);
        
        console.log('✅ Équilibre calculé:', eqResult);
        
    } catch (error) {
        console.error('❌ Erreur calcul équilibre:', error);
        resultsDiv.insertAdjacentHTML('beforeend', `
            <div class="market-comparison-card" style="margin-top:40px;">
                <h3 style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Erreur de calcul d'équilibre
                </h3>
                <p style="color: #94a3b8;">${error.message}</p>
            </div>
        `);
    }
}
```

---

## 🎨 Exemple d'utilisation

1. Remplissez le formulaire normalement
2. **Activez** "Analyse d'équilibre"
3. Choisissez :
   - **Variable** : `loyer_mensuel` (par défaut)
   - **Période** : `annuel` (1ère année)
4. Cliquez sur **"Analyser mon investissement"**
5. À l'étape 3, vous verrez :
   - Votre analyse fiscale habituelle
   - **+ Section "Analyse d'équilibre"** avec :
     - Loyer d'équilibre calculé
     - Détail des cash-flows
     - Analyse de sensibilité (±10%)

---

## 📊 Exemples de résultats

### Cas 1 : Loyer d'équilibre trouvé
```
✅ Loyer mensuel d'équilibre : 1 240 €/mois

À ce niveau, vos cash-flows couvrent exactement 
l'amortissement du capital.

Période : A1
CF Net : 5 400 €
Amortissement : 4 900 €
Marge de sécurité : +500 €
```

### Cas 2 : Équilibre impossible
```
❌ Équilibre impossible

Le CF net reste négatif même avec un loyer majoré.

Suggestions:
• Augmentez le loyer ou réduisez la vacance
• Optimisez vos charges
• Améliorez le financement
```

---

## 🔍 Debug & Tests

### Tester le module seul

```javascript
// Dans la console du navigateur
const testInputs = {
    variable_cible: 'loyer_mensuel',
    periode_base: 'annuel',
    n_annees: 1,
    prix_d_achat: 200000,
    montant_emprunt: 160000,
    taux_annuel: 3.5,
    duree_annees: 20,
    differe_capital: 0,
    loyer_mensuel: 900,
    vacance_pct: 5,
    taxe_fonciere: 800,
    charges_copro: 50,
    assurance: 15,
    gestion: 7,
    entretien: 500,
    capex_annuel: null,
    capex_list: null,
    regime_fiscal: 'nu_reel',
    tmi_ou_is: 30,
    prelevements: 17.2,
    indexation_loyer: 0,
    inflation_charges: 0
};

const result = window.Equilibre.solveEquilibre(testInputs);
console.log('Résultat:', result);
```

### Vérifier les fonctions disponibles

```javascript
console.log('Module chargé:', !!window.Equilibre);
console.log('Fonctions:', Object.keys(window.Equilibre));
// Attendu: ["solveEquilibre", "renderEquilibre", "amortSchedule", ...]
```

---

## ⚙️ Paramètres avancés

### CAPEX ponctuels

```javascript
capex_list: [
    { periode: 1, montant: 5000 },  // 5000€ la 1ère année
    { periode: 5, montant: 10000 }  // 10000€ la 5ème année
]
```

### Différé d'amortissement

```javascript
differe_capital: 12  // 12 mois de différé (intérêts seuls)
```

### Indexation & Inflation

```javascript
indexation_loyer: 2,      // +2% par an
inflation_charges: 1.5    // +1.5% par an
```

---

## 🐛 Problèmes courants

| Problème | Solution |
|----------|----------|
| "Equilibre is not defined" | Vérifier que `equilibre.js` est chargé **avant** l'appel |
| "feasible: false" | Paramètres irréalistes → augmenter loyer ou réduire charges |
| Sensibilités null | Échec du calcul → vérifier les bornes min/max |
| Pas d'affichage | Vérifier que `resultsDiv` existe bien |

---

## 📚 Ressources

- **Documentation TypeScript** : Voir les `@typedef` en haut du fichier `equilibre.js`
- **Algorithme** : Bissection sur `f(x) = CF_net(x) - (Amort + CAPEX)`
- **Support** : Ouvrir une issue sur GitHub

---

## ✅ Checklist d'intégration

- [ ] Fichier `js/equilibre.js` présent
- [ ] Script chargé dans le HTML
- [ ] Section UI ajoutée au formulaire
- [ ] Appel dans `proceedToFiscalAnalysis()`
- [ ] Test sur un cas simple
- [ ] Vérification de l'affichage

---

**Version** : 1.0.0  
**Date** : 12 novembre 2025  
**Auteur** : Assistant Claude
