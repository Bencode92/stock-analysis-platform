import os
import json
import requests
import datetime
from bs4 import BeautifulSoup
import re

def extract_content_from_html(html_file):
    """Extraire le contenu pertinent d'un fichier HTML."""
    try:
        with open(html_file, 'r', encoding='utf-8') as file:
            soup = BeautifulSoup(file, 'html.parser')
            
            # Extraire le contenu principal
            if html_file.endswith('actualites.html'):
                # Pour les actualités, on cherche les articles de news
                articles = soup.select('.news-card, .article-item, .news-item')
                if not articles:
                    # Fallback: essayer de trouver d'autres éléments qui pourraient contenir des actualités
                    articles = soup.select('article, .news, .actualite, .card')
                
                content = []
                for article in articles[:15]:  # Limiter aux 15 premiers articles pour éviter un prompt trop long
                    title = article.select_one('h2, h3, .title, .headline')
                    summary = article.select_one('p, .summary, .description')
                    
                    if title:
                        title_text = title.get_text(strip=True)
                        if title_text:
                            content.append("• {}".format(title_text))
                            if summary:
                                summary_text = summary.get_text(strip=True)
                                if summary_text:
                                    content.append("  {}...".format(summary_text[:150]))  # Limiter la longueur
            
            elif html_file.endswith('marche.html'):
                # Pour les marchés, on cherche les données de tendance
                market_data = soup.select('.market-trend, .market-data, .trend-item, .index-card')
                if not market_data:
                    # Fallback
                    market_data = soup.select('.card, .market, .indice, .asset-card')
                
                content = []
                for item in market_data:
                    name = item.select_one('h3, h4, .name, .asset-name, .title')
                    value = item.select_one('.value, .price, .current-price')
                    change = item.select_one('.change, .variation, .performance')
                    
                    if name:
                        name_text = name.get_text(strip=True)
                        if name_text:
                            data_line = "• {}".format(name_text)
                            if value:
                                value_text = value.get_text(strip=True)
                                data_line += ": {}".format(value_text)
                            if change:
                                change_text = change.get_text(strip=True)
                                data_line += " ({})".format(change_text)
                            content.append(data_line)
            
            return "\n".join(content)
    except Exception as e:
        print("Erreur lors de l'extraction du contenu de {}: {}".format(html_file, str(e)))
        # En cas d'erreur, retourner un placeholder pour ne pas bloquer l'exécution
        return "[Contenu non disponible pour {}]".format(html_file)

def generate_portfolios(actualites, marche):
    """Générer les portefeuilles en utilisant l'API OpenAI."""
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie dans les variables d'environnement.")
    
    prompt = """Tu es un expert en finance et en gestion de portefeuille.

Les dernières actualités financières :
{}

Les tendances actuelles du marché :
{}

En fonction des tendances du marché et des actualités, génère trois portefeuilles optimisés :
1️⃣ **Agressif** : Composé de **10 à 20 actifs** à forte volatilité. Inclure des actions de croissance (ex: tech), des cryptos et des ETF risqués.
2️⃣ **Modéré** : Composé de **10 à 20 actifs** équilibrés entre actions solides (blue chips), obligations d'entreprises et ETF diversifiés.
3️⃣ **Stable** : Composé de **10 à 20 actifs** défensifs, avec des obligations souveraines, des valeurs refuges et des ETF stables.

💡 **Format attendu** :  
Retourne un JSON avec la structure suivante :
{{
    "Agressif": {{
        "Actions": {{
            "Nom de l'action 1": "X%",
            "Nom de l'action 2": "X%"
        }},
        "Crypto": {{
            "Nom de la crypto 1": "X%",
            "Nom de la crypto 2": "X%"
        }},
        "ETF": {{
            "Nom de l'ETF 1": "X%",
            "Nom de l'ETF 2": "X%"
        }},
        "Obligations": {{
            "Nom de l'obligation 1": "X%",
            "Nom de l'obligation 2": "X%"
        }}
    }},
    "Modéré": {{ ... }},
    "Stable": {{ ... }}
}}

🚀 **Critères de sélection** :
- Vérifie que chaque portefeuille contient **entre 10 et 20 actifs**.
- Adapte les allocations en fonction des **tendances actuelles du marché** et des **actualités récentes**.
- Ajuste la volatilité et le risque selon le type de portefeuille (ex: plus de crypto/actions volatiles pour l'agressif, plus de valeurs refuges pour le stable).

Ne réponds qu'avec le JSON, sans autres explications.
""".format(actualites, marche)
    
    try:
        headers = {
            "Authorization": "Bearer {}".format(api_key),
            "Content-Type": "application/json"
        }
        
        data = {
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7
        }
        
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data)
        response.raise_for_status()
        
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        
        # Nettoyer la réponse pour extraire seulement le JSON
        content = re.sub(r'^```json', '', content)
        content = re.sub(r'```$', '', content)
        content = content.strip()
        
        # Vérifier que le contenu est bien du JSON valide
        portfolios = json.loads(content)
        return portfolios
    
    except Exception as e:
        print("Erreur lors de la génération des portefeuilles: {}".format(str(e)))
        # En cas d'erreur, retourner un portfolio par défaut
        return {
            "Agressif": {
                "Actions": {"Apple": "15%", "Tesla": "10%", "Nvidia": "15%"},
                "Crypto": {"Bitcoin": "15%", "Ethereum": "10%"},
                "ETF": {"ARK Innovation ETF": "15%", "SPDR S&P 500 ETF": "10%"}
            },
            "Modéré": {
                "Actions": {"Microsoft": "15%", "Alphabet": "10%", "Johnson & Johnson": "10%"},
                "Obligations": {"US Treasury 10Y": "15%", "Corporate Bonds AAA": "15%"},
                "ETF": {"Vanguard Total Stock Market ETF": "20%", "iShares Core MSCI EAFE ETF": "15%"}
            },
            "Stable": {
                "Actions": {"Procter & Gamble": "10%", "Coca-Cola": "10%", "McDonald's": "10%"},
                "Obligations": {"US Treasury 30Y": "25%", "Municipal Bonds AAA": "15%"},
                "ETF": {"Vanguard High Dividend Yield ETF": "15%", "SPDR Gold Shares": "15%"}
            }
        }

def save_portfolios(portfolios):
    """Sauvegarder les portefeuilles dans un fichier JSON et conserver l'historique."""
    try:
        # Création du dossier d'historique s'il n'existe pas
        history_dir = 'data/portfolio_history'
        os.makedirs(history_dir, exist_ok=True)
        
        # Génération d'un horodatage pour le nom de fichier
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Sauvegarder la version actuelle
        with open('portefeuilles.json', 'w', encoding='utf-8') as file:
            json.dump(portfolios, file, ensure_ascii=False, indent=4)
        
        # Sauvegarder dans l'historique avec l'horodatage
        history_file = "{}/portefeuilles_{}.json".format(history_dir, timestamp)
        with open(history_file, 'w', encoding='utf-8') as file:
            # Ajouter les métadonnées de date pour faciliter la recherche ultérieure
            portfolios_with_metadata = {
                "timestamp": timestamp,
                "date": datetime.datetime.now().isoformat(),
                "portfolios": portfolios
            }
            json.dump(portfolios_with_metadata, file, ensure_ascii=False, indent=4)
        
        # Mettre à jour le fichier d'index d'historique
        update_history_index(history_file, portfolios_with_metadata)
        
        print("✅ Portefeuilles sauvegardés avec succès dans portefeuilles.json et {}".format(history_file))
    except Exception as e:
        print("❌ Erreur lors de la sauvegarde des portefeuilles: {}".format(str(e)))

def update_history_index(history_file, portfolio_data):
    """Mettre à jour l'index des portefeuilles historiques."""
    try:
        index_file = 'data/portfolio_history/index.json'
        
        # Charger l'index existant s'il existe
        index_data = []
        if os.path.exists(index_file):
            try:
                with open(index_file, 'r', encoding='utf-8') as file:
                    index_data = json.load(file)
            except json.JSONDecodeError:
                # Réinitialiser si le fichier est corrompu
                index_data = []
        
        # Créer une entrée d'index avec les métadonnées essentielles
        entry = {
            "file": os.path.basename(history_file),
            "timestamp": portfolio_data["timestamp"],
            "date": portfolio_data["date"],
            # Ajouter un résumé des allocations pour référence rapide
            "summary": {}
        }

        # Ajouter le résumé pour chaque type de portefeuille
        for portfolio_type, portfolio in portfolio_data["portfolios"].items():
            entry["summary"][portfolio_type] = {}
            for category, assets in portfolio.items():
                count = len(assets)
                entry["summary"][portfolio_type][category] = "{} actifs".format(count)
        
        # Ajouter la nouvelle entrée au début de la liste (plus récente en premier)
        index_data.insert(0, entry)
        
        # Limiter la taille de l'index si nécessaire (garder les 100 dernières entrées)
        if len(index_data) > 100:
            index_data = index_data[:100]
        
        # Sauvegarder l'index mis à jour
        with open(index_file, 'w', encoding='utf-8') as file:
            json.dump(index_data, file, ensure_ascii=False, indent=4)
            
    except Exception as e:
        print("⚠️ Avertissement: Erreur lors de la mise à jour de l'index: {}".format(str(e)))

def main():
    print("🔍 Extraction des données financières...")
    actualites = extract_content_from_html('actualites.html')
    marche = extract_content_from_html('marche.html')
    
    print("🧠 Génération des portefeuilles optimisés...")
    portfolios = generate_portfolios(actualites, marche)
    
    print("💾 Sauvegarde des portefeuilles...")
    save_portfolios(portfolios)
    
    print("✨ Traitement terminé!")

if __name__ == "__main__":
    main()
