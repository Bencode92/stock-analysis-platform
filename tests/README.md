# Tests de TradePulse

Ce répertoire contient les tests unitaires pour la plateforme TradePulse.

## Structure des tests

- `test_portfolio_generation.py` - Tests pour les fonctions de génération et validation des portefeuilles

## Prérequis

Pour exécuter les tests, vous aurez besoin de:

1. Python 3.10 ou supérieur
2. Les modules suivants:
   - unittest (inclus dans la bibliothèque standard Python)
   - json (inclus dans la bibliothèque standard Python)
   - BeautifulSoup4 (`pip install beautifulsoup4`)
   - Requests (`pip install requests`)

## Exécution des tests

### Depuis le répertoire racine du projet:

```bash
python -m unittest discover tests
```

### Tests spécifiques:

```bash
python -m unittest tests.test_portfolio_generation
```

### Une méthode de test spécifique:

```bash
python -m unittest tests.test_portfolio_generation.TestFilteringFunctions.test_filter_news_data
```

## Résultats des tests

Les tests produisent une sortie indiquant leur succès ou échec:

```
...........
----------------------------------------------------------------------
Ran 11 tests in 1.234s

OK
```

## Conseils pour le débogage

- Si des tests échouent avec des erreurs d'importation, assurez-vous d'exécuter les tests depuis le répertoire racine du projet
- Les tests utilisent des mocks pour simuler les dépendances externes (API, fichiers), donc aucune connexion internet ou fichier réel n'est nécessaire
- Pour les tests impliquant les fonctions de filtrage, vérifiez que les structures de données d'entrée correspondent à celles attendues

## Ajout de nouveaux tests

Pour ajouter de nouveaux tests:

1. Créez une nouvelle classe de test héritant de `unittest.TestCase`
2. Ajoutez des méthodes dont le nom commence par `test_`
3. Utilisez les méthodes d'assertion (`self.assertEqual`, `self.assertTrue`, etc.)

Exemple:

```python
class TestMaNouvelleFonctionnalite(unittest.TestCase):
    def setUp(self):
        # Initialisation avant chaque test
        self.data = ...
        
    def test_ma_fonction(self):
        result = ma_fonction(self.data)
        self.assertEqual(result, valeur_attendue)
```

## CI/CD avec GitHub Actions

Les tests sont automatiquement exécutés à chaque push sur le dépôt GitHub grâce à GitHub Actions. Consultez le fichier `.github/workflows/tests.yml` pour plus de détails.
