import unittest
import os
import sys
import json
from unittest.mock import patch, MagicMock

# Ajouter le répertoire parent au chemin pour pouvoir importer les modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Importer les modules à tester
try:
    from generate_portfolios import (
        filter_news_data, filter_markets_data, filter_sectors_data, 
        filter_lists_data, filter_etf_data, validate_and_fix_portfolios
    )
    from portfolio_adjuster import check_portfolio_constraints, adjust_portfolios
except ImportError:
    print("⚠️ Impossible d'importer les modules. Vérifiez que vous exécutez les tests depuis le répertoire racine.")
    sys.exit(1)

class TestFilteringFunctions(unittest.TestCase):
    """Tests des fonctions de filtrage des données."""
    
    def setUp(self):
        """Initialisation des données de test."""
        # Simuler des données d'actualités
        self.sample_news = {
            "Europe": [
                {"title": "Inflation en hausse", "impact": "High", "category": "Economy", "date": "2025-03-25"},
                {"title": "Croissance du PIB", "impact": "Medium", "category": "Economy", "date": "2025-03-24"}
            ],
            "USA": [
                {"title": "Décision de la FED", "impact": "High", "category": "Central Banks", "date": "2025-03-23"}
            ]
        }
        
        # Simuler des données de marchés
        self.sample_markets = {
            "indices": {
                "Europe": [
                    {"index_name": "CAC 40", "change": "2.3%", "ytdChange": "5.1%"},
                    {"index_name": "DAX", "change": "1.7%", "ytdChange": "4.3%"}
                ],
                "USA": [
                    {"index_name": "S&P 500", "change": "0.5%", "ytdChange": "8.2%"},
                    {"index_name": "Nasdaq", "change": "0.9%", "ytdChange": "12.5%"}
                ]
            },
            "top_performers": {
                "daily": {
                    "best": [
                        {"index_name": "Nikkei", "change": "3.1%", "country": "Japan"}
                    ],
                    "worst": [
                        {"index_name": "FTSE", "change": "-0.8%", "country": "UK"}
                    ]
                },
                "ytd": {
                    "best": [
                        {"index_name": "Nasdaq", "ytdChange": "12.5%", "country": "USA"}
                    ],
                    "worst": [
                        {"index_name": "Shanghai", "ytdChange": "-2.3%", "country": "China"}
                    ]
                }
            }
        }
        
        # Simuler des données sectorielles
        self.sample_sectors = {
            "sectors": {
                "Europe": [
                    {"name": "Technology", "change": "1.8%", "ytd": "7.5%"},
                    {"name": "Healthcare", "change": "0.9%", "ytd": "3.2%"}
                ],
                "USA": [
                    {"name": "Technology", "change": "2.1%", "ytd": "15.3%"},
                    {"name": "Energy", "change": "-0.5%", "ytd": "-2.1%"}
                ]
            }
        }
        
        # Simuler des données d'actifs
        self.sample_lists = {
            "watchlist_1": {
                "indices": {
                    "A": [
                        {"name": "Apple", "ytd": "22.5%"},
                        {"name": "Amazon", "ytd": "18.3%"}
                    ],
                    "M": [
                        {"name": "Microsoft", "ytd": "15.7%"},
                        {"name": "Meta", "ytd": "35.2%"}
                    ]
                }
            }
        }
        
        # Simuler des données ETF
        self.sample_etfs = {
            "top_etf_2025": [
                {"name": "iShares Global Tech ETF", "ytd": "12.5%", "1m": "2.3%"},
                {"name": "Vanguard S&P 500 ETF", "ytd": "8.3%", "1m": "1.5%"}
            ],
            "top_etf_obligations_2025": [
                {"name": "iShares Global Govt Bond ETF", "ytd": "4.2%", "1m": "0.7%"},
                {"name": "Vanguard Total Bond Market ETF", "ytd": "3.1%", "1m": "0.5%"}
            ],
            "etf_court_terme": [
                {"name": "iShares 1-3 Year Treasury ETF", "ytd": "1.2%", "1m": "0.3%"}
            ],
            "etf_sectoriels": [
                {"name": "Technology Select Sector SPDR", "ytd": "15.3%", "1m": "3.2%"},
                {"name": "Energy Select Sector SPDR", "ytd": "-2.1%", "1m": "-0.6%"}
            ]
        }
        
        # Simuler un portefeuille pour les tests de validation
        self.sample_portfolio = {
            "Agressif": {
                "Commentaire": "Ce portefeuille vise une croissance maximale...",
                "Actions": {
                    "Apple": "15%",
                    "Microsoft": "12%",
                    "Amazon": "10%"
                },
                "ETF": {
                    "iShares Global Tech ETF": "25%",
                    "Technology Select Sector SPDR": "20%"
                },
                "Crypto": {
                    "Bitcoin": "10%",
                    "Ethereum": "8%"
                }
            },
            "Modéré": {
                "Commentaire": "Ce portefeuille équilibré combine croissance...",
                "Actions": {
                    "Microsoft": "13%",
                    "Johnson & Johnson": "10%"
                },
                "ETF": {
                    "Vanguard S&P 500 ETF": "20%",
                    "iShares Global Tech ETF": "15%"
                },
                "Obligations": {
                    "Vanguard Total Bond Market ETF": "15%",
                    "iShares Global Govt Bond ETF": "12%"
                },
                "Crypto": {
                    "Bitcoin": "5%"
                }
            },
            "Stable": {
                "Commentaire": "Ce portefeuille défensif privilégie...",
                "Actions": {
                    "Johnson & Johnson": "10%",
                    "Procter & Gamble": "8%"
                },
                "Obligations": {
                    "iShares Global Govt Bond ETF": "30%",
                    "Vanguard Total Bond Market ETF": "25%"
                },
                "ETF": {
                    "iShares 1-3 Year Treasury ETF": "15%",
                    "Vanguard S&P 500 ETF": "12%"
                }
            }
        }

    def test_filter_news_data(self):
        """Teste la fonction de filtrage des données d'actualités."""
        filtered = filter_news_data(self.sample_news)
        # Vérifier que le résultat est une chaîne non vide
        self.assertIsInstance(filtered, str)
        self.assertTrue(len(filtered) > 0)
        # Vérifier que les actualités importantes sont incluses
        self.assertIn("Inflation", filtered)
        self.assertIn("FED", filtered)

    def test_filter_markets_data(self):
        """Teste la fonction de filtrage des données de marché."""
        filtered = filter_markets_data(self.sample_markets)
        # Vérifier que le résultat est une chaîne non vide
        self.assertIsInstance(filtered, str)
        self.assertTrue(len(filtered) > 0)
        # Vérifier que les indices et top performers sont inclus
        self.assertIn("CAC 40", filtered)
        self.assertIn("Nasdaq", filtered)
        self.assertIn("Nikkei", filtered)

    def test_filter_sectors_data(self):
        """Teste la fonction de filtrage des données sectorielles."""
        filtered = filter_sectors_data(self.sample_sectors)
        # Vérifier que le résultat est une chaîne non vide
        self.assertIsInstance(filtered, str)
        self.assertTrue(len(filtered) > 0)
        # Vérifier que les secteurs clés sont inclus
        self.assertIn("Technology", filtered)
        self.assertIn("Healthcare", filtered)

    def test_filter_lists_data(self):
        """Teste la fonction de filtrage des listes d'actifs."""
        filtered = filter_lists_data(self.sample_lists)
        # Vérifier que le résultat est une chaîne non vide
        self.assertIsInstance(filtered, str)
        self.assertTrue(len(filtered) > 0)
        # Vérifier que les actifs performants sont inclus
        self.assertIn("Meta", filtered)  # YTD > 20%

    def test_filter_etf_data(self):
        """Teste la fonction de filtrage des données ETF."""
        filtered = filter_etf_data(self.sample_etfs)
        # Vérifier que le résultat est une chaîne non vide
        self.assertIsInstance(filtered, str)
        self.assertTrue(len(filtered) > 0)
        # Vérifier que les ETF performants sont inclus
        self.assertIn("iShares Global Tech ETF", filtered)  # YTD > 10%
        self.assertIn("Technology Select Sector SPDR", filtered)  # YTD > 5%


class TestPortfolioValidation(unittest.TestCase):
    """Tests des fonctions de validation des portefeuilles."""
    
    def setUp(self):
        """Initialisation des données de test."""
        # Portefeuille valide (portefeuilles séparés pour faciliter les tests)
        self.valid_portfolio = {
            "Agressif": {
                "Commentaire": "Ce portefeuille vise une croissance maximale...",
                "Actions": {
                    "Apple": "15%",
                    "Microsoft": "12%",
                    "Amazon": "10%",
                    "Google": "8%",
                    "Tesla": "7%"
                },
                "ETF": {
                    "iShares Global Tech ETF": "20%",
                    "Technology Select Sector SPDR": "15%"
                },
                "Crypto": {
                    "Bitcoin": "8%",
                    "Ethereum": "5%"
                }
            }
        }
        
        # Portefeuille avec trop peu d'actifs
        self.few_assets_portfolio = {
            "Agressif": {
                "Commentaire": "Portefeuille avec trop peu d'actifs",
                "Actions": {
                    "Apple": "50%",
                    "Microsoft": "30%"
                },
                "ETF": {
                    "iShares Global Tech ETF": "20%"
                }
            }
        }
        
        # Portefeuille avec allocation incorrecte
        self.incorrect_allocation_portfolio = {
            "Agressif": {
                "Commentaire": "Allocation totale incorrecte",
                "Actions": {
                    "Apple": "20%",
                    "Microsoft": "15%",
                    "Amazon": "10%",
                    "Google": "10%",
                    "Tesla": "10%"
                },
                "ETF": {
                    "iShares Global Tech ETF": "20%",
                    "Technology Select Sector SPDR": "10%"
                },
                "Crypto": {
                    "Bitcoin": "10%",
                    "Ethereum": "10%"
                }
            }
        }
        
        # Portefeuille modéré sans obligations
        self.no_bonds_portfolio = {
            "Modéré": {
                "Commentaire": "Portefeuille modéré sans obligations",
                "Actions": {
                    "Microsoft": "20%",
                    "Apple": "15%",
                    "Amazon": "15%",
                    "Johnson & Johnson": "10%",
                    "Procter & Gamble": "10%"
                },
                "ETF": {
                    "Vanguard S&P 500 ETF": "15%",
                    "iShares Global Tech ETF": "15%"
                }
            }
        }
        
        # Liste d'ETF et obligations valides pour les tests
        self.valid_etfs = ["iShares Global Tech ETF", "Vanguard S&P 500 ETF", "Technology Select Sector SPDR"]
        self.valid_bonds = ["iShares Global Govt Bond ETF", "Vanguard Total Bond Market ETF"]

    def test_check_valid_portfolio(self):
        """Teste la validation d'un portefeuille valide."""
        is_valid, issues = check_portfolio_constraints(self.valid_portfolio)
        self.assertTrue(is_valid)
        self.assertEqual(len(issues), 0)

    def test_check_few_assets_portfolio(self):
        """Teste la validation d'un portefeuille avec trop peu d'actifs."""
        is_valid, issues = check_portfolio_constraints(self.few_assets_portfolio)
        self.assertFalse(is_valid)
        self.assertGreater(len(issues), 0)
        # Vérifier que l'erreur mentionne le nombre d'actifs
        self.assertTrue(any("actifs" in issue for issue in issues))

    def test_check_incorrect_allocation(self):
        """Teste la validation d'un portefeuille avec allocation incorrecte."""
        is_valid, issues = check_portfolio_constraints(self.incorrect_allocation_portfolio)
        self.assertFalse(is_valid)
        # Le portefeuille a une allocation totale de 115%
        self.assertTrue(any("allocation" in issue for issue in issues))

    def test_check_missing_bonds(self):
        """Teste la validation d'un portefeuille modéré sans obligations."""
        is_valid, issues = check_portfolio_constraints(self.no_bonds_portfolio)
        self.assertFalse(is_valid)
        # Vérifier que l'erreur mentionne les obligations manquantes
        self.assertTrue(any("Obligation" in issue for issue in issues))

    def test_validate_and_fix_portfolios(self):
        """Teste la fonction de correction automatique des portefeuilles."""
        # Remplacer les variables globales pour le test
        with patch('generate_portfolios.valid_etfs_cache', self.valid_etfs), \
             patch('generate_portfolios.valid_bonds_cache', self.valid_bonds):
            
            # Tester avec un portefeuille modéré sans obligations
            fixed = validate_and_fix_portfolios(self.no_bonds_portfolio, self.valid_etfs, self.valid_bonds)
            
            # Vérifier que des obligations ont été ajoutées
            self.assertIn("Obligations", fixed["Modéré"])
            self.assertGreater(len(fixed["Modéré"]["Obligations"]), 0)


class TestPortfolioGeneration(unittest.TestCase):
    """Tests de la fonction principale de génération de portefeuilles."""
    
    @patch('generate_portfolios.requests.post')
    def test_generate_portfolios(self, mock_post):
        """Teste la fonction de génération de portefeuilles avec mock de l'API."""
        # Configuration du mock pour simuler une réponse de l'API OpenAI
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps({
                            "Agressif": {
                                "Commentaire": "Ce portefeuille vise une croissance maximale...",
                                "Actions": {
                                    "Apple": "15%",
                                    "Microsoft": "10%"
                                },
                                "ETF": {
                                    "iShares Global Tech ETF": "20%"
                                }
                            },
                            "Modéré": {
                                "Commentaire": "Ce portefeuille équilibré...",
                                "Actions": {
                                    "Microsoft": "10%"
                                },
                                "ETF": {
                                    "Vanguard S&P 500 ETF": "15%"
                                },
                                "Obligations": {
                                    "iShares Global Govt Bond ETF": "15%"
                                }
                            },
                            "Stable": {
                                "Commentaire": "Ce portefeuille défensif...",
                                "Actions": {
                                    "Johnson & Johnson": "10%"
                                },
                                "ETF": {
                                    "Vanguard S&P 500 ETF": "10%"
                                },
                                "Obligations": {
                                    "iShares Global Govt Bond ETF": "20%"
                                }
                            }
                        })
                    }
                }
            ]
        }
        mock_post.return_value = mock_response
        
        # Pour éviter les dépendances externes lors des tests:
        # - Patcher os.environ pour simuler la clé API
        # - Patcher les fonctions de filtrage pour renvoyer des données simulées
        # - Patcher les fonctions de sauvegarde pour éviter l'écriture de fichiers
        with patch.dict('os.environ', {'API_CHAT': 'test_api_key'}), \
             patch('generate_portfolios.filter_news_data', return_value="Données d'actualités filtrées"), \
             patch('generate_portfolios.filter_markets_data', return_value="Données de marché filtrées"), \
             patch('generate_portfolios.filter_sectors_data', return_value="Données sectorielles filtrées"), \
             patch('generate_portfolios.filter_lists_data', return_value="Listes d'actifs filtrées"), \
             patch('generate_portfolios.filter_etf_data', return_value="Données ETF filtrées"), \
             patch('generate_portfolios.save_prompt_to_debug_file', return_value=("debug.txt", "debug.html")), \
             patch('generate_portfolios.validate_and_fix_portfolios', return_value={"Agressif": {}, "Modéré": {}, "Stable": {}}), \
             patch('generate_portfolios.check_portfolio_constraints', return_value=(True, [])):
            
            try:
                from generate_portfolios import generate_portfolios
                
                # Test de la fonction generate_portfolios
                result = generate_portfolios({}, {}, {}, {}, {})
                
                # Vérifier que la fonction a renvoyé un dictionnaire avec les trois types de portefeuille
                self.assertIsInstance(result, dict)
                self.assertIn("Agressif", result)
                self.assertIn("Modéré", result)
                self.assertIn("Stable", result)
                
                # Vérifier que l'API a été appelée avec les bons paramètres
                mock_post.assert_called_once()
                call_args = mock_post.call_args[1]
                self.assertEqual(call_args["headers"]["Authorization"], "Bearer test_api_key")
                self.assertEqual(call_args["json"]["model"], "gpt-4o")
                
            except ImportError:
                self.skipTest("Fonction generate_portfolios non importable")


if __name__ == '__main__':
    unittest.main()
