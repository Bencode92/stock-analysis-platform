# GitHub Actions Configuration

## Configuration des secrets

### 1. Ajouter votre clé API Twelve Data

1. Allez dans **Settings** > **Secrets and variables** > **Actions** de votre repo
2. Cliquez sur **New repository secret**
3. Créez un secret nommé `TWELVE_DATA_API`
4. Collez votre clé API Twelve Data
5. Cliquez sur **Add secret**

## Workflows automatisés

### 📊 Mise à jour des données sectorielles
- **Fréquence** : Toutes les heures
- **Fichier généré** : `data/sectors.json`
- **Crédits API** : ~5 crédits/ETF × 40 ETFs = ~200 crédits/heure

### 📈 Mise à jour des holdings ETF
- **Fréquence** : Hebdomadaire (dimanche 3h15 UTC)
- **Fichier généré** : `data/etf_holdings.json`
- **Crédits API** : ~200 crédits/ETF × 40 ETFs = ~8000 crédits/semaine

## Exécution manuelle

Vous pouvez déclencher manuellement les workflows :

1. Allez dans l'onglet **Actions**
2. Sélectionnez **Update Market Data**
3. Cliquez sur **Run workflow**
4. Choisissez le type de mise à jour :
   - `sectors` : Met à jour uniquement les secteurs
   - `holdings` : Met à jour uniquement les holdings
   - `both` : Met à jour les deux

## Surveillance

### Notifications d'erreur
Si une mise à jour échoue, le workflow :
- Créera automatiquement une issue GitHub
- Taggera l'issue avec `automated` et `data-update-failure`
- Inclura les détails de l'erreur et un lien vers les logs

### Vérification des mises à jour
- Les commits automatiques sont tagués avec l'heure UTC
- Format secteurs : `🔄 Update sectors data [YYYY-MM-DD HH:MM UTC]`
- Format holdings : `📈 Update ETF holdings [Weekly - YYYY-MM-DD]`

## Limites API Twelve Data

### Plan gratuit
- 800 crédits/jour
- 8 requêtes/minute

### Consommation estimée
- **Par jour** : ~4800 crédits (24h × 200 crédits)
- **Par semaine** : ~8000 crédits supplémentaires (holdings)

⚠️ **Note** : Le plan gratuit ne suffira PAS pour une mise à jour horaire complète. Options :
1. Réduire la fréquence (ex: toutes les 4 heures)
2. Réduire le nombre d'ETFs
3. Passer à un plan payant

## Optimisations possibles

### Réduire la consommation de crédits

**Option 1 : Mise à jour moins fréquente**
```yaml
schedule:
  - cron: '0 */4 * * *'  # Toutes les 4 heures
```

**Option 2 : Heures de marché uniquement**
```yaml
schedule:
  - cron: '0 9-17 * * 1-5'  # Lun-Ven, 9h-17h UTC
```

**Option 3 : Rotation des ETFs**
Modifier le script pour traiter un sous-ensemble différent à chaque exécution.

## Dépannage

### Le workflow ne se déclenche pas
- Vérifiez que le workflow est activé dans l'onglet Actions
- Les workflows scheduled peuvent être désactivés après 60 jours d'inactivité

### Erreurs API
- Vérifiez la validité de votre clé API
- Vérifiez les limites de votre plan Twelve Data
- Consultez les logs du workflow pour plus de détails

### Pas de changements commitées
C'est normal si les données n'ont pas changé depuis la dernière exécution (ex: marché fermé).

## Support

Pour toute question ou problème :
1. Consultez les [logs des workflows](../../actions)
2. Vérifiez les [issues ouvertes](../../issues?q=is%3Aissue+label%3Adata-update-failure)
3. Créez une nouvelle issue si nécessaire
