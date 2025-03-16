import os
import json
import time
import requests
from datetime import datetime
import random

# Configuration
RENDER_API_URL = os.environ.get("RENDER_API_URL", "https://stock-analysis-platform-q9tc.onrender.com")
DATA_DIR = "./data"
os.makedirs(DATA_DIR, exist_ok=True)

def fetch_data_from_render(endpoint, payload=None):
    """Récupère les données depuis Render qui proxie vers Perplexity"""
    print(f"🔍 Récupération des données depuis Render: {endpoint}")
    
    try:
        if payload is None:
            payload = {"useSonar": True}
            
        # Appel à l'API Render
        response = requests.post(
            f"{RENDER_API_URL}{endpoint}", 
            json=payload,
            timeout=30  # Timeout de 30 secondes
        )
        
        # Vérifier si la requête a réussi
        if response.status_code != 200:
            print(f"❌ Erreur HTTP: {response.status_code}")
            print(f"Détails: {response.text}")
            return None
        
        # Extraire les données JSON
        data = response.json()
        
        # Transformer les données si nécessaire (noms de clés français -> anglais)
        if endpoint == "/api/perplexity/portfolios":
            data = normalize_portfolio_data(data)
            
        return data
    except Exception as e:
        print(f"❌ Erreur lors de la récupération des données depuis Render: {e}")
        return None

def normalize_portfolio_data(data):
    """Normalise les noms de clés des portefeuilles (français -> anglais)"""
    for portfolio_type in ["agressif", "modere", "stable"]:
        if portfolio_type in data:
            new_assets = []
            for asset in data[portfolio_type]:
                # Créer un nouvel objet d'actif standardisé (avec les clés anglaises)
                new_asset = {
                    # Pour les noms/titres
                    "name": asset.get("name", asset.get("nom", "")),
                    # Pour les symboles
                    "symbol": asset.get("symbol", asset.get("symbole", "")),
                    # Type d'actif
                    "type": asset.get("type", ""),
                    # Allocation en pourcentage
                    "allocation": asset.get("allocation", 0),
                    # Justification/raison
                    "reason": asset.get("reason", asset.get("justification", "")),
                    # Variation (obligatoire pour l'interface, par défaut à 0)
                    "change": asset.get("change", 0),
                    # Secteur (optionnel)
                    "sector": asset.get("sector", asset.get("secteur", "")),
                    # Risque (optionnel)
                    "risk": asset.get("risk", asset.get("risque", "medium"))
                }
                
                # S'assurer que les champs obligatoires ont des valeurs valides
                if not new_asset["name"]:
                    new_asset["name"] = f"Actif {len(new_assets) + 1}"
                
                if not new_asset["symbol"]:
                    # Générer un symbole basé sur le nom si absent
                    words = new_asset["name"].split()
                    new_asset["symbol"] = "".join([word[0].upper() for word in words if word])[:4]
                
                # Ajouter l'actif normalisé à la liste
                new_assets.append(new_asset)
            
            # Remplacer les anciennes données par les nouvelles données normalisées
            data[portfolio_type] = new_assets
    
    # S'assurer que marketContext est présent avec des valeurs par défaut
    if "marketContext" not in data:
        data["marketContext"] = {
            "mainTrend": "bullish",
            "volatilityLevel": "moderate",
            "keyEvents": ["Publication de résultats trimestriels", "Données économiques mitigées"],
            "sectorOutlook": {
                "tech": "positive",
                "finance": "neutral",
                "energy": "neutral",
                "healthcare": "positive",
                "consumer": "neutral"
            }
        }
    
    # S'assurer que lastUpdated est présent
    if "lastUpdated" not in data:
        data["lastUpdated"] = datetime.now().isoformat()
            
    return data

def get_financial_news():
    """Récupère les actualités financières via Render/Perplexity"""
    print("📰 Récupération des actualités financières...")
    
    # Tentative de récupération via Render
    news_data = fetch_data_from_render("/api/perplexity/news")
    
    # Si échec, générer des données de secours
    if news_data is None:
        print("⚠️ Utilisation des données d'actualités de secours")
        news_data = generate_fallback_news()
    else:
        print(f"✅ Actualités récupérées: {len(news_data.get('us', []))} US, {len(news_data.get('france', []))} France")
    
    # Valider et compléter la structure
    validate_news_structure(news_data)
    
    return news_data

def get_portfolio_recommendations():
    """Récupère les recommandations de portefeuille via Render/Perplexity"""
    print("💼 Récupération des recommandations de portefeuille...")
    
    # Tentative de récupération via Render
    portfolios_data = fetch_data_from_render("/api/perplexity/portfolios")
    
    # Si échec, générer des données de secours
    if portfolios_data is None:
        print("⚠️ Utilisation des données de portefeuille de secours")
        portfolios_data = generate_fallback_portfolios()
    else:
        print(f"✅ Portefeuilles récupérés: agressif: {len(portfolios_data.get('agressif', []))}, modere: {len(portfolios_data.get('modere', []))}, stable: {len(portfolios_data.get('stable', []))}") 
    
    # Valider et standardiser la structure des portefeuilles
    portfolios_data = validate_portfolio_structure(portfolios_data)
    
    return portfolios_data

def validate_portfolio_structure(data):
    """Valide et corrige la structure des portefeuilles"""
    required_keys = ["agressif", "modere", "stable", "marketContext", "lastUpdated"]
    for key in required_keys:
        if key not in data:
            if key == "lastUpdated":
                data[key] = datetime.now().isoformat()
            elif key == "marketContext":
                data[key] = {
                    "mainTrend": "neutral",
                    "volatilityLevel": "medium", 
                    "keyEvents": [],
                    "sectorOutlook": {}
                }
            else:
                data[key] = []
    
    # Standardiser le format de chaque élément de portefeuille
    for portfolio_type in ["agressif", "modere", "stable"]:
        standardized_assets = []
        for asset in data[portfolio_type]:
            # Créer un dictionnaire avec les bonnes clés (en anglais)
            standardized_asset = {
                "name": asset.get("name") or asset.get("nom", ""),
                "symbol": asset.get("symbol") or asset.get("symbole", ""),
                "type": asset.get("type", ""),
                "allocation": asset.get("allocation", 0),
                "reason": asset.get("reason") or asset.get("justification", ""),
                "change": asset.get("change", 0),  # Valeur par défaut
                "sector": asset.get("sector", asset.get("secteur", "")),
                "risk": asset.get("risk", asset.get("risque", "medium"))
            }
            
            # S'assurer que les champs obligatoires ont des valeurs valides
            if not standardized_asset["name"]:
                standardized_asset["name"] = f"Actif {len(standardized_assets) + 1}"
            
            if not standardized_asset["symbol"]:
                # Générer un symbole basé sur le nom si absent
                words = standardized_asset["name"].split()
                standardized_asset["symbol"] = "".join([word[0].upper() for word in words if word])[:4]
            
            standardized_assets.append(standardized_asset)
        
        # Remplacer les données originales par les données standardisées
        data[portfolio_type] = standardized_assets
    
    return data

def validate_news_structure(data):
    """Valide et corrige la structure des actualités"""
    # Vérifier les clés principales
    required_keys = ["us", "france", "events"]
    for key in required_keys:
        if key not in data:
            data[key] = []
    
    # Ajouter lastUpdated si absent
    if "lastUpdated" not in data:
        data["lastUpdated"] = datetime.now().isoformat()
    
    # Vérifier et standardiser chaque actualité
    for region in ["us", "france"]:
        for i, news in enumerate(data[region]):
            # Vérifier les champs obligatoires
            required_fields = ["title", "content", "source", "date", "time", "category", "impact"]
            for field in required_fields:
                if field not in news:
                    if field == "date":
                        news[field] = datetime.now().strftime("%d/%m/%Y")
                    elif field == "time":
                        news[field] = datetime.now().strftime("%H:%M")
                    elif field == "category":
                        news[field] = "marches"
                    elif field == "impact":
                        news[field] = "neutral"
                    elif field == "source":
                        news[field] = "Source financière"
                    else:
                        news[field] = ""
            
            # Standardiser category
            valid_categories = ["marches", "economie", "entreprises", "tech", "crypto"]
            if news["category"] not in valid_categories:
                news["category"] = map_category(news["category"])
            
            # Standardiser impact
            valid_impacts = ["positive", "negative", "neutral"]
            if news["impact"] not in valid_impacts:
                news["impact"] = valid_impacts[0]
            
            # Ajouter country
            news["country"] = "us" if region == "us" else "fr"
    
    # Vérifier et standardiser chaque événement
    for i, event in enumerate(data["events"]):
        required_fields = ["title", "date", "time", "type", "importance"]
        for field in required_fields:
            if field not in event:
                if field == "date":
                    event[field] = (datetime.now().strftime("%d/%m/%Y"))
                elif field == "time":
                    event[field] = datetime.now().strftime("%H:%M")
                elif field == "type":
                    event[field] = "economic"
                elif field == "importance":
                    event[field] = "medium"
                else:
                    event[field] = ""
        
        # Standardiser type
        valid_types = ["earnings", "economic", "policy", "ipo", "merger"]
        if event["type"] not in valid_types:
            event["type"] = valid_types[0]
        
        # Standardiser importance
        valid_importance = ["high", "medium", "low"]
        if event["importance"] not in valid_importance:
            event["importance"] = valid_importance[0]

def map_category(category):
    """Mappe une catégorie à l'une des catégories valides"""
    category = category.lower()
    
    if "march" in category or "market" in category:
        return "marches"
    elif "econ" in category or "macro" in category:
        return "economie"
    elif "entr" in category or "corp" in category or "compan" in category:
        return "entreprises"
    elif "tech" in category:
        return "tech"
    elif "crypto" in category or "bitcoin" in category or "blockchain" in category:
        return "crypto"
    else:
        return "marches"  # Par défaut

def generate_fallback_news():
    """Génère des données d'actualités de secours"""
    print("⚠️ Génération de données d'actualités de secours")
    
    # Date et heure actuelles
    now = datetime.now()
    date_str = now.strftime("%d/%m/%Y")
    time_str = now.strftime("%H:%M")
    
    # Actualités US
    us_news = [
        {
            "title": "La Fed maintient les taux d'intérêt, signalant la vigilance face à l'inflation",
            "content": "La Réserve fédérale a décidé de maintenir les taux d'intérêt à leur niveau actuel lors de sa dernière réunion. Le président de la Fed a souligné que l'inflation reste sous surveillance étroite.",
            "source": "The Wall Street Journal",
            "date": date_str,
            "time": time_str,
            "category": "economie",
            "impact": "neutral",
            "country": "us"
        },
        {
            "title": "Apple dévoile de nouveaux produits lors de sa conférence annuelle",
            "content": "Le géant technologique a présenté sa nouvelle gamme d'iPhones et d'autres produits innovants. Les analystes prévoient un impact positif sur les ventes du prochain trimestre.",
            "source": "CNBC",
            "date": date_str,
            "time": time_str,
            "category": "tech",
            "impact": "positive",
            "country": "us"
        },
        {
            "title": "Wall Street en hausse portée par les valeurs technologiques",
            "content": "Les indices américains ont terminé en territoire positif, soutenus par une forte performance du secteur technologique. Les investisseurs restent optimistes malgré les incertitudes économiques.",
            "source": "Bloomberg",
            "date": date_str,
            "time": time_str,
            "category": "marches",
            "impact": "positive",
            "country": "us"
        },
        {
            "title": "Tesla annonce une expansion majeure de sa production",
            "content": "Le constructeur de véhicules électriques prévoit d'augmenter significativement sa capacité de production mondiale. Cette décision pourrait renforcer sa position de leader sur le marché des VE.",
            "source": "Reuters",
            "date": date_str,
            "time": time_str,
            "category": "entreprises",
            "impact": "positive",
            "country": "us"
        },
        {
            "title": "Bitcoin dépasse les 60 000 dollars, atteignant un nouveau sommet",
            "content": "La principale cryptomonnaie a franchi un nouveau record historique, portée par l'adoption institutionnelle croissante et l'intérêt des investisseurs pour les actifs numériques.",
            "source": "CoinDesk",
            "date": date_str,
            "time": time_str,
            "category": "crypto",
            "impact": "positive",
            "country": "us"
        }
    ]
    
    # Actualités françaises
    france_news = [
        {
            "title": "La Banque de France révise à la hausse ses prévisions de croissance",
            "content": "L'institution a revu ses estimations pour l'économie française, anticipant une reprise plus forte que prévu. Cette révision reflète la résilience du marché du travail et la consommation des ménages.",
            "source": "Les Échos",
            "date": date_str,
            "time": time_str,
            "category": "economie",
            "impact": "positive",
            "country": "fr"
        },
        {
            "title": "Le CAC 40 franchit un nouveau record historique",
            "content": "L'indice phare de la Bourse de Paris a atteint un niveau sans précédent, porté par les résultats solides des entreprises françaises et l'optimisme des investisseurs.",
            "source": "Le Figaro",
            "date": date_str,
            "time": time_str,
            "category": "marches",
            "impact": "positive",
            "country": "fr"
        },
        {
            "title": "LVMH annonce une acquisition stratégique dans le secteur du luxe",
            "content": "Le leader mondial du luxe renforce sa position avec le rachat d'une marque prestigieuse. Cette opération s'inscrit dans la stratégie de diversification du groupe.",
            "source": "BFM Business",
            "date": date_str,
            "time": time_str,
            "category": "entreprises",
            "impact": "positive",
            "country": "fr"
        }
    ]
    
    # Événements
    future_date = datetime.now()
    events = [
        {
            "title": "Publication des résultats trimestriels de Microsoft",
            "date": (future_date.replace(day=min(future_date.day + 5, 28))).strftime("%d/%m/%Y"),
            "time": "16:30",
            "type": "earnings",
            "importance": "high"
        },
        {
            "title": "Réunion de la BCE sur les taux d'intérêt",
            "date": (future_date.replace(day=min(future_date.day + 10, 28))).strftime("%d/%m/%Y"),
            "time": "13:45",
            "type": "policy",
            "importance": "high"
        },
        {
            "title": "Publication des chiffres de l'emploi américain",
            "date": (future_date.replace(day=min(future_date.day + 3, 28))).strftime("%d/%m/%Y"),
            "time": "14:30",
            "type": "economic",
            "importance": "medium"
        },
        {
            "title": "Introduction en bourse de TechFuture Inc.",
            "date": (future_date.replace(day=min(future_date.day + 15, 28))).strftime("%d/%m/%Y"),
            "time": "09:30",
            "type": "ipo",
            "importance": "medium"
        }
    ]
    
    return {
        "us": us_news,
        "france": france_news,
        "events": events,
        "lastUpdated": datetime.now().isoformat()
    }

def generate_fallback_portfolios():
    """Génère des données de portefeuilles de secours"""
    print("⚠️ Génération de données de portefeuilles de secours")
    
    # Portefeuille agressif - STRUCTURE AMÉLIORÉE
    aggressive_portfolio = [
        {
            "name": "Apple Inc.",
            "symbol": "AAPL",
            "type": "Action",
            "allocation": 15,
            "reason": "Leader technologique avec potentiel de croissance",
            "sector": "Technologie",
            "risk": "medium",
            "change": 1.8
        },
        {
            "name": "NVIDIA Corporation",
            "symbol": "NVDA",
            "type": "Action",
            "allocation": 15,
            "reason": "Position dominante dans l'IA et les GPU",
            "sector": "Technologie",
            "risk": "high",
            "change": 2.5
        },
        {
            "name": "Tesla, Inc.",
            "symbol": "TSLA",
            "type": "Action",
            "allocation": 13,
            "reason": "Leader dans les véhicules électriques et l'énergie propre",
            "sector": "Automobile",
            "risk": "high",
            "change": -0.7
        },
        {
            "name": "Amazon.com, Inc.",
            "symbol": "AMZN",
            "type": "Action",
            "allocation": 12,
            "reason": "Dominance dans l'e-commerce et le cloud computing",
            "sector": "Commerce électronique",
            "risk": "medium",
            "change": 1.2
        },
        {
            "name": "ARK Innovation ETF",
            "symbol": "ARKK",
            "type": "ETF",
            "allocation": 12,
            "reason": "Exposition aux entreprises disruptives",
            "sector": "Technologie disruptive",
            "risk": "high",
            "change": -1.3
        },
        {
            "name": "Bitcoin ETF",
            "symbol": "BTCQ",
            "type": "ETF",
            "allocation": 10,
            "reason": "Exposition à la principale cryptomonnaie",
            "sector": "Crypto-actifs",
            "risk": "high",
            "change": 3.2
        },
        {
            "name": "Shopify Inc.",
            "symbol": "SHOP",
            "type": "Action",
            "allocation": 10,
            "reason": "Forte croissance dans le commerce en ligne",
            "sector": "Technologie",
            "risk": "high",
            "change": -0.5
        },
        {
            "name": "iShares MSCI Emerging Markets ETF",
            "symbol": "EEM",
            "type": "ETF",
            "allocation": 13,
            "reason": "Diversification vers les marchés émergents",
            "sector": "International",
            "risk": "high",
            "change": 0.9
        }
    ]
    
    # Portefeuille modéré
    moderate_portfolio = [
        {
            "name": "Microsoft Corporation",
            "symbol": "MSFT",
            "type": "Action",
            "allocation": 12,
            "reason": "Leader stable en technologie et cloud",
            "sector": "Technologie",
            "risk": "medium",
            "change": 0.8
        },
        {
            "name": "Vanguard S&P 500 ETF",
            "symbol": "VOO",
            "type": "ETF",
            "allocation": 15,
            "reason": "Exposition large au marché américain",
            "sector": "Diversifié",
            "risk": "medium",
            "change": 0.4
        },
        {
            "name": "Johnson & Johnson",
            "symbol": "JNJ",
            "type": "Action",
            "allocation": 10,
            "reason": "Valeur défensive dans le secteur de la santé",
            "sector": "Santé",
            "risk": "low",
            "change": 0.2
        },
        {
            "name": "Alphabet Inc.",
            "symbol": "GOOGL",
            "type": "Action",
            "allocation": 10,
            "reason": "Leader dans la publicité en ligne et l'IA",
            "sector": "Technologie",
            "risk": "medium",
            "change": 1.1
        },
        {
            "name": "iShares Core U.S. Aggregate Bond ETF",
            "symbol": "AGG",
            "type": "ETF",
            "allocation": 15,
            "reason": "Stabilité et revenu fixe",
            "sector": "Obligations",
            "risk": "low",
            "change": -0.1
        },
        {
            "name": "Coca-Cola Company",
            "symbol": "KO",
            "type": "Action",
            "allocation": 8,
            "reason": "Stabilité et dividendes fiables",
            "sector": "Consommation de base",
            "risk": "low",
            "change": 0.3
        },
        {
            "name": "Vanguard FTSE Developed Markets ETF",
            "symbol": "VEA",
            "type": "ETF",
            "allocation": 15,
            "reason": "Diversification internationale",
            "sector": "International",
            "risk": "medium",
            "change": 0.5
        },
        {
            "name": "Vanguard Real Estate ETF",
            "symbol": "VNQ",
            "type": "ETF",
            "allocation": 15,
            "reason": "Exposition au secteur immobilier",
            "sector": "Immobilier",
            "risk": "medium",
            "change": -0.2
        }
    ]
    
    # Portefeuille stable
    stable_portfolio = [
        {
            "name": "Vanguard Total Bond Market ETF",
            "symbol": "BND",
            "type": "ETF",
            "allocation": 20,
            "reason": "Base solide d'obligations diversifiées",
            "sector": "Obligations",
            "risk": "low",
            "change": 0.1
        },
        {
            "name": "iShares TIPS Bond ETF",
            "symbol": "TIP",
            "type": "ETF",
            "allocation": 15,
            "reason": "Protection contre l'inflation",
            "sector": "Obligations",
            "risk": "low",
            "change": 0.2
        },
        {
            "name": "Vanguard Dividend Appreciation ETF",
            "symbol": "VIG",
            "type": "ETF",
            "allocation": 15,
            "reason": "Actions à dividendes croissants",
            "sector": "Diversifié",
            "risk": "low",
            "change": 0.4
        },
        {
            "name": "Procter & Gamble Co.",
            "symbol": "PG",
            "type": "Action",
            "allocation": 10,
            "reason": "Entreprise défensive avec dividendes stables",
            "sector": "Consommation de base",
            "risk": "low",
            "change": 0.3
        },
        {
            "name": "Vanguard Short-Term Corporate Bond ETF",
            "symbol": "VCSH",
            "type": "ETF",
            "allocation": 10,
            "reason": "Obligations d'entreprises à court terme",
            "sector": "Obligations",
            "risk": "low",
            "change": 0.1
        },
        {
            "name": "Berkshire Hathaway Inc.",
            "symbol": "BRK.B",
            "type": "Action",
            "allocation": 10,
            "reason": "Conglomérat diversifié à gestion conservatrice",
            "sector": "Diversifié",
            "risk": "low",
            "change": 0.5
        },
        {
            "name": "Utilities Select Sector SPDR Fund",
            "symbol": "XLU",
            "type": "ETF",
            "allocation": 10,
            "reason": "Secteur défensif des services publics",
            "sector": "Services publics",
            "risk": "low",
            "change": -0.1
        },
        {
            "name": "SPDR Gold Shares",
            "symbol": "GLD",
            "type": "ETF",
            "allocation": 10,
            "reason": "Diversification avec l'or comme valeur refuge",
            "sector": "Matières premières",
            "risk": "medium",
            "change": 0.7
        }
    ]
    
    return {
        "agressif": aggressive_portfolio,
        "modere": moderate_portfolio,
        "stable": stable_portfolio,
        "marketContext": {
            "mainTrend": "bullish",
            "volatilityLevel": "moderate",
            "keyEvents": [
                "Décision de maintien des taux par la Fed",
                "Résultats financiers du secteur tech",
                "Hausse du Bitcoin au-delà des 60 000$"
            ],
            "sectorOutlook": {
                "tech": "positive",
                "finance": "neutral",
                "energy": "neutral",
                "healthcare": "positive",
                "consumer": "neutral"
            }
        },
        "lastUpdated": datetime.now().isoformat()
    }

def save_data(data, filename):
    """Enregistre les données dans un fichier JSON"""
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ Données enregistrées dans {filepath}")

def main():
    """Fonction principale"""
    print(f"🚀 Démarrage de la mise à jour des données financières à {datetime.now().isoformat()}")
    
    # Créer le répertoire des données s'il n'existe pas
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Récupérer les actualités et les enregistrer
    news_data = get_financial_news()
    save_data(news_data, "news.json")
    
    # Générer les recommandations de portefeuille basées sur les actualités
    portfolios_data = get_portfolio_recommendations()
    save_data(portfolios_data, "portfolios.json")
    
    print(f"✅ Mise à jour des données terminée à {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()