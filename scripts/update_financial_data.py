import os
import json
import time
from datetime import datetime
import random

# Configuration
API_KEY = os.environ.get("PERPLEXITY_API_KEY")
DATA_DIR = "./data"
os.makedirs(DATA_DIR, exist_ok=True)

# Essayer d'importer la bibliothèque Perplexity
try:
    from perplexity import Perplexity
    client = Perplexity(api_key=API_KEY) if API_KEY else None
    PERPLEXITY_AVAILABLE = API_KEY is not None
except ImportError:
    print("⚠️ Bibliothèque Perplexity non disponible, utilisation du mode de secours")
    PERPLEXITY_AVAILABLE = False
    client = None

def extract_json_from_text(text):
    """Extrait le JSON d'une réponse textuelle"""
    try:
        # Trouver les indices du premier { et du dernier }
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx == -1:
            # Essayer avec [ si pas de {
            start_idx = text.find('[')
            end_idx = text.rfind(']')
        
        if start_idx == -1 or end_idx == -1:
            raise ValueError("Aucun JSON trouvé dans le texte")
        
        # Extraire le JSON
        json_str = text[start_idx:end_idx+1]
        return json.loads(json_str)
    except Exception as e:
        print(f"❌ Erreur lors de l'extraction du JSON: {e}")
        print(f"Texte: {text[:100]}...")
        raise

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

def get_financial_news():
    """Récupère les actualités financières via Perplexity ou génère des données de secours"""
    print("📰 Récupération des actualités financières...")
    
    if not PERPLEXITY_AVAILABLE:
        print("⚠️ API Perplexity non disponible, génération de données factices")
        return generate_fallback_news()
    
    try:
        prompt = """
        Donne-moi les actualités financières les plus importantes d'aujourd'hui, organisées selon ce format exact:
        {
          "us": [
            {
              "title": "Titre précis de l'actualité",
              "content": "Description de 2-3 phrases sur cette actualité",
              "source": "Source (ex: Bloomberg, WSJ, Reuters)",
              "date": "JJ/MM/YYYY",
              "time": "HH:MM",
              "category": "Une des catégories suivantes: marches, economie, entreprises, tech, crypto",
              "impact": "Une valeur parmi: positive, negative, neutral",
              "country": "us"
            },
            ... (9 autres actualités importantes)
          ],
          "france": [
            {
              "title": "Titre de l'actualité française",
              "content": "Description de 2-3 phrases",
              "source": "Source (ex: Les Échos, Le Figaro, BFM Business)",
              "date": "JJ/MM/YYYY",
              "time": "HH:MM",
              "category": "Une des catégories suivantes: marches, economie, entreprises, tech, crypto",
              "impact": "Une valeur parmi: positive, negative, neutral",
              "country": "fr"
            },
            ... (5 autres actualités françaises importantes)
          ],
          "events": [
            {
              "title": "Titre de l'événement (ex: Publication résultats Apple)",
              "date": "JJ/MM/YYYY",
              "time": "HH:MM",
              "type": "Une valeur parmi: earnings, economic, policy, ipo, merger",
              "importance": "Une valeur parmi: high, medium, low"
            },
            ... (8 événements à venir)
          ]
        }
        
        Réponds UNIQUEMENT avec ce JSON, sans introduction ni conclusion.
        """
        
        # Utiliser Sonar pour des résultats optimaux
        response = client.query(prompt, mode="sonar")
        news_data = extract_json_from_text(response.answer)
        
        # Valider et corriger la structure
        validate_news_structure(news_data)
        
        print(f"✅ Actualités récupérées: {len(news_data.get('us', []))} US, {len(news_data.get('france', []))} France")
        return news_data
    except Exception as e:
        print(f"❌ Erreur lors de la récupération des actualités: {e}")
        return generate_fallback_news()

def get_portfolio_recommendations(news_data):
    """Génère des recommandations de portefeuille basées sur les actualités"""
    print("💼 Génération des recommandations de portefeuille...")
    
    if not PERPLEXITY_AVAILABLE:
        print("⚠️ API Perplexity non disponible, génération de portefeuilles factices")
        return generate_fallback_portfolios()
    
    portfolios = {
        "agressif": [],
        "modere": [],
        "stable": [],
        "lastUpdated": datetime.now().isoformat(),
        "marketContext": {
            "mainTrend": "bullish",
            "volatilityLevel": "moderate",
            "keyEvents": [],
            "sectorOutlook": {}
        }
    }
    
    try:
        # Extraire les tendances des actualités pour le contexte
        market_trends = extract_market_trends(news_data)
        portfolios["marketContext"] = market_trends
        
        # Générer chaque type de portefeuille
        for portfolio_type in ["agressif", "modere", "stable"]:
            # Synthétiser les actualités pour le contexte
            news_summary = summarize_news(news_data)
            
            prompt = f"""
            En tenant compte des actualités financières suivantes:
            {news_summary}
            
            Et des tendances de marché:
            - Tendance principale: {market_trends['mainTrend']}
            - Niveau de volatilité: {market_trends['volatilityLevel']}
            - Événements clés: {', '.join(market_trends['keyEvents'])}
            
            Génère des recommandations pour un portefeuille {portfolio_type} avec exactement 8 instruments.
            Réponds en JSON strict sans commentaires, avec ce format exact:
            [
              {{
                "name": "Nom complet de l'entreprise/ETF",
                "symbol": "SYMB",
                "type": "Action/ETF/Obligation/REIT/Matières premières",
                "allocation": 15,
                "reason": "Raison de l'inclusion dans le portefeuille",
                "sector": "Secteur",
                "risk": "high/medium/low",
                "change": 1.2
              }},
              ...
            ]
            
            Les allocations doivent totaliser exactement 100%.
            Pour un portefeuille {portfolio_type}, adapte le niveau de risque et les types d'instruments.
            """
            
            # Utiliser Sonar pour des résultats optimaux
            response = client.query(prompt, mode="sonar")
            portfolio_data = extract_json_from_text(response.answer)
            
            # Valider et ajuster les données du portefeuille
            validate_portfolio(portfolio_data, portfolio_type)
            
            portfolios[portfolio_type] = portfolio_data
            
            # Pause pour éviter la limite de taux de l'API
            time.sleep(2)
        
        return portfolios
    except Exception as e:
        print(f"❌ Erreur lors de la génération des portefeuilles: {e}")
        return generate_fallback_portfolios()

def extract_market_trends(news_data):
    """Extrait les tendances du marché à partir des actualités"""
    # Analyse des actualités pour déterminer la tendance
    positive_count = 0
    negative_count = 0
    
    # Compter les impacts positifs/négatifs
    for region in ["us", "france"]:
        for news in news_data.get(region, []):
            if news.get("impact") == "positive":
                positive_count += 1
            elif news.get("impact") == "negative":
                negative_count += 1
    
    # Déterminer la tendance principale
    if positive_count > negative_count * 1.5:
        main_trend = "bullish"
    elif negative_count > positive_count * 1.5:
        main_trend = "bearish"
    else:
        main_trend = "neutral"
    
    # Extraire les événements clés des actualités
    key_events = []
    for region in ["us", "france"]:
        for news in news_data.get(region, [])[:3]:  # Prendre les 3 premières actualités de chaque région
            if news.get("impact") in ["positive", "negative"]:
                key_events.append(news.get("title", "").split(":", 1)[-1].strip())
    
    # Limiter à 3 événements maximum
    key_events = key_events[:3]
    
    # Évaluer les secteurs
    sectors = {
        "tech": 0,
        "finance": 0,
        "energy": 0,
        "healthcare": 0,
        "consumer": 0
    }
    
    # Analyse simplifiée par mots-clés
    sector_keywords = {
        "tech": ["tech", "technology", "digital", "software", "hardware", "apple", "microsoft", "google", "meta", "ai"],
        "finance": ["bank", "finance", "financial", "investment", "stock", "market", "trading", "broker"],
        "energy": ["oil", "gas", "energy", "renewable", "solar", "wind", "petroleum", "coal"],
        "healthcare": ["health", "pharma", "medical", "biotech", "drug", "healthcare", "medicine"],
        "consumer": ["retail", "consumer", "shop", "food", "beverage", "luxury", "goods"]
    }
    
    # Analyse basique par mots-clés
    for region in ["us", "france"]:
        for news in news_data.get(region, []):
            content = (news.get("title", "") + " " + news.get("content", "")).lower()
            for sector, keywords in sector_keywords.items():
                for keyword in keywords:
                    if keyword in content:
                        # Bonus pour l'impact
                        if news.get("impact") == "positive":
                            sectors[sector] += 1
                        elif news.get("impact") == "negative":
                            sectors[sector] -= 1
                        break
    
    # Générer l'outlook sectoriel
    sector_outlook = {}
    for sector, score in sectors.items():
        if score > 2:
            sector_outlook[sector] = "positive"
        elif score < -2:
            sector_outlook[sector] = "negative"
        else:
            sector_outlook[sector] = "neutral"
    
    # Évaluer la volatilité
    events = news_data.get("events", [])
    high_importance_events = sum(1 for event in events if event.get("importance") == "high")
    
    if high_importance_events >= 3:
        volatility = "high"
    elif high_importance_events >= 1:
        volatility = "moderate"
    else:
        volatility = "low"
    
    return {
        "mainTrend": main_trend,
        "volatilityLevel": volatility,
        "keyEvents": key_events,
        "sectorOutlook": sector_outlook
    }

def summarize_news(news_data):
    """Crée un résumé des actualités pour le prompt de portefeuille"""
    summary = ""
    
    # Résumer les actualités US
    summary += "Actualités US importantes:\n"
    for news in news_data.get("us", [])[:5]:  # Limiter à 5 actualités
        summary += f"- {news.get('title', '')}: {news.get('impact', 'neutral')} ({news.get('category', '')})\n"
    
    # Résumer les actualités françaises
    summary += "\nActualités françaises importantes:\n"
    for news in news_data.get("france", [])[:3]:  # Limiter à 3 actualités
        summary += f"- {news.get('title', '')}: {news.get('impact', 'neutral')} ({news.get('category', '')})\n"
    
    # Résumer les événements
    summary += "\nÉvénements à venir:\n"
    for event in news_data.get("events", [])[:3]:  # Limiter à 3 événements
        summary += f"- {event.get('title', '')} ({event.get('date', '')}): {event.get('importance', 'medium')}\n"
    
    return summary

def validate_portfolio(portfolio, portfolio_type):
    """Valide et ajuste un portefeuille"""
    if not portfolio:
        return
    
    # Vérifier les champs obligatoires pour chaque instrument
    required_fields = ["name", "symbol", "type", "allocation", "reason", "sector", "risk"]
    valid_types = ["Action", "ETF", "Obligation", "REIT", "Matières premières"]
    valid_risks = ["high", "medium", "low"]
    
    for instrument in portfolio:
        for field in required_fields:
            if field not in instrument:
                if field == "allocation":
                    instrument[field] = 0
                elif field == "type":
                    instrument[field] = valid_types[0]
                elif field == "risk":
                    instrument[field] = valid_risks[1]
                elif field == "sector":
                    instrument[field] = "Divers"
                else:
                    instrument[field] = ""
        
        # Standardiser le type
        if instrument["type"] not in valid_types:
            instrument["type"] = valid_types[0]
        
        # Standardiser le risque
        if instrument["risk"] not in valid_risks:
            instrument["risk"] = valid_risks[1]
        
        # Ajouter le champ change s'il est absent
        if "change" not in instrument:
            # Générer un changement aléatoire entre -5% et +5%
            instrument["change"] = round(random.uniform(-5.0, 5.0), 2)
    
    # Vérifier que la somme des allocations est égale à 100%
    total_allocation = sum(instrument.get("allocation", 0) for instrument in portfolio)
    
    if total_allocation != 100:
        # Ajuster proportionnellement
        if total_allocation > 0:
            adjustment_factor = 100 / total_allocation
            for instrument in portfolio:
                instrument["allocation"] = round(instrument["allocation"] * adjustment_factor)
        else:
            # Si total est 0, distribution équitable
            equal_allocation = 100 // len(portfolio)
            remainder = 100 % len(portfolio)
            
            for i, instrument in enumerate(portfolio):
                instrument["allocation"] = equal_allocation + (1 if i < remainder else 0)

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
            "date": (future_date.replace(day=future_date.day + 5)).strftime("%d/%m/%Y"),
            "time": "16:30",
            "type": "earnings",
            "importance": "high"
        },
        {
            "title": "Réunion de la BCE sur les taux d'intérêt",
            "date": (future_date.replace(day=future_date.day + 10)).strftime("%d/%m/%Y"),
            "time": "13:45",
            "type": "policy",
            "importance": "high"
        },
        {
            "title": "Publication des chiffres de l'emploi américain",
            "date": (future_date.replace(day=future_date.day + 3)).strftime("%d/%m/%Y"),
            "time": "14:30",
            "type": "economic",
            "importance": "medium"
        },
        {
            "title": "Introduction en bourse de TechFuture Inc.",
            "date": (future_date.replace(day=future_date.day + 15)).strftime("%d/%m/%Y"),
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
    
    # Portefeuille agressif
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
            "mainTrend": "neutral",
            "volatilityLevel": "moderate",
            "keyEvents": ["Publication de résultats trimestriels", "Données économiques mitigées"],
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
    portfolios_data = get_portfolio_recommendations(news_data)
    save_data(portfolios_data, "portfolios.json")
    
    print(f"✅ Mise à jour des données terminée à {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()
