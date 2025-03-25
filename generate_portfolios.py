import os
import json
import requests
import datetime
import locale
from bs4 import BeautifulSoup
import re

def extract_content_from_html(html_file):
    """Extraire le contenu pertinent d'un fichier HTML."""
    try:
        # Initialiser content comme une liste vide par défaut
        content = []
        
        with open(html_file, 'r', encoding='utf-8') as file:
            soup = BeautifulSoup(file, 'html.parser')
            
            # Extraire le contenu principal
            if html_file.endswith('actualites.html'):
                # Pour les actualités, on cherche les articles de news
                articles = soup.select('.news-card, .article-item, .news-item')
                if not articles:
                    # Fallback: essayer de trouver d'autres éléments qui pourraient contenir des actualités
                    articles = soup.select('article, .news, .actualite, .card')
                
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
            
            elif html_file.endswith('marches.html'):
                # Extraction améliorée pour les marchés - cibler les tableaux
                tables = soup.select('table, .table')
                if tables:
                    print(f"Trouvé {len(tables)} tableaux dans {html_file}")
                    for table in tables:
                        # Extraire l'en-tête du tableau si présent
                        table_header = table.select_one('caption, thead, th')
                        if table_header:
                            header_text = table_header.get_text(strip=True)
                            content.append(f"📊 {header_text.upper()}:")
                        
                        # Extraire les lignes du tableau
                        rows = table.select('tr, .row')
                        for row in rows[:10]:  # Limiter à 10 lignes
                            cells = row.select('td, th, .cell')
                            if cells:
                                row_data = " | ".join([cell.get_text(strip=True) for cell in cells if cell.get_text(strip=True)])
                                if row_data:
                                    content.append(f"• {row_data}")
                
                # Si aucun tableau n'est trouvé, essayer d'autres sélecteurs
                if not content:
                    market_data = soup.select('.market-trend, .market-data, .trend-item, .index-card, .market-item')
                    if not market_data:
                        # Fallback pour les éléments génériques
                        market_data = soup.select('.card, .market, .indice, .asset-card')
                    
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
            
            elif html_file.endswith('secteurs.html'):
                # Extraction améliorée pour les secteurs - cibler les tableaux
                tables = soup.select('table, .table')
                if tables:
                    print(f"Trouvé {len(tables)} tableaux dans {html_file}")
                    for table in tables:
                        # Extraire l'en-tête du tableau si présent
                        table_header = table.select_one('caption, thead, th')
                        if table_header:
                            header_text = table_header.get_text(strip=True)
                            content.append(f"📊 {header_text.upper() or 'PERFORMANCES SECTORIELLES'}:")
                        else:
                            content.append("📊 PERFORMANCES SECTORIELLES:")
                        
                        # Extraire les lignes du tableau
                        rows = table.select('tr, .row')
                        for row in rows[:15]:  # Limiter à 15 lignes
                            cells = row.select('td, th, .cell')
                            if cells:
                                row_data = " | ".join([cell.get_text(strip=True) for cell in cells if cell.get_text(strip=True)])
                                if row_data:
                                    content.append(f"• {row_data}")
                
                # Si aucun tableau n'est trouvé, essayer les sélecteurs originaux
                if len(content) <= 1:
                    sector_data = soup.select('.sector-card, .sector-item, .performance-card')
                    if not sector_data:
                        # Fallback
                        sector_data = soup.select('.card, .sector, .industry-card, .industry-item')
                    
                    if not content:
                        content.append("📊 PERFORMANCES SECTORIELLES:")
                    
                    for item in sector_data:
                        name = item.select_one('h3, h4, .sector-name, .name, .title')
                        performance = item.select_one('.performance, .change, .variation')
                        trend = item.select_one('.trend, .direction, .recommendation')
                        
                        if name:
                            name_text = name.get_text(strip=True)
                            if name_text:
                                data_line = "• {}".format(name_text)
                                if performance:
                                    perf_text = performance.get_text(strip=True)
                                    data_line += ": {}".format(perf_text)
                                if trend:
                                    trend_text = trend.get_text(strip=True)
                                    data_line += " - {}".format(trend_text)
                                content.append(data_line)
            
            elif html_file.endswith('liste.html'):
                # Extraction améliorée pour les listes - cibler les tableaux
                tables = soup.select('table, .table')
                if tables:
                    print(f"Trouvé {len(tables)} tableaux dans {html_file}")
                    for table in tables:
                        # Extraire l'en-tête du tableau si présent
                        table_header = table.select_one('caption, thead, th')
                        if table_header:
                            header_text = table_header.get_text(strip=True)
                            # Utiliser des guillemets doubles pour éviter d'échapper l'apostrophe
                            content.append(f"📋 {header_text.upper() or 'LISTES ACTIFS SURVEILLÉS'}:")
                        else:
                            content.append("📋 LISTES ACTIFS SURVEILLÉS:")
                        
                        # Extraire les lignes du tableau
                        rows = table.select('tr, .row')
                        for row in rows[:20]:  # Limiter à 20 lignes
                            cells = row.select('td, th, .cell')
                            if cells:
                                row_data = " | ".join([cell.get_text(strip=True) for cell in cells if cell.get_text(strip=True)])
                                if row_data:
                                    content.append(f"• {row_data}")
                
                # Si aucun tableau n'est trouvé, essayer les sélecteurs originaux
                if len(content) <= 1:
                    asset_items = soup.select('.asset-item, .watchlist-item, .stock-item, .list-card')
                    if not asset_items:
                        # Fallback
                        asset_items = soup.select('.card, .item, tr, .asset')
                    
                    if not content:
                        content.append("📋 LISTES ACTIFS SURVEILLÉS:")
                    
                    for item in asset_items:
                        name = item.select_one('h3, h4, .asset-name, .name, .symbol, .title, td:first-child')
                        sector = item.select_one('.sector, .category, .type')
                        price = item.select_one('.price, .value, .current-price')
                        
                        if name:
                            name_text = name.get_text(strip=True)
                            if name_text:
                                data_line = "• {}".format(name_text)
                                if sector:
                                    sector_text = sector.get_text(strip=True)
                                    data_line += " ({}): ".format(sector_text)
                                if price:
                                    price_text = price.get_text(strip=True)
                                    data_line += "{}".format(price_text)
                                content.append(data_line)
            
            elif html_file.endswith('etf.html'):
                # Extraction améliorée pour les ETF - cibler les tableaux
                tables = soup.select('table, .table')
                if tables:
                    print(f"Trouvé {len(tables)} tableaux dans {html_file}")
                    for table in tables:
                        # Extraire l'en-tête du tableau si présent
                        table_header = table.select_one('caption, thead, th, h2, h3')
                        if table_header:
                            header_text = table_header.get_text(strip=True)
                            if "ETF" in header_text or not header_text:
                                content.append("📊 TOP ETF PERFORMANCES:")
                            else:
                                content.append(f"📊 {header_text.upper()}:")
                        else:
                            content.append("📊 ANALYSE DES ETF:")
                        
                        # Extraire les lignes du tableau
                        rows = table.select('tr, .row')
                        for row in rows[:15]:  # Limiter à 15 lignes
                            cells = row.select('td, th, .cell')
                            if cells:
                                row_data = " | ".join([cell.get_text(strip=True) for cell in cells if cell.get_text(strip=True)])
                                if row_data:
                                    content.append(f"• {row_data}")
                
                # Si aucun tableau n'est trouvé, essayer des sections ou cartes d'ETF spécifiques
                if len(content) <= 1:
                    # Chercher d'abord des sections avec des titres mentionnant ETF
                    etf_sections = []
                    for heading in soup.select('h1, h2, h3, h4, h5, h6'):
                        if 'ETF' in heading.get_text():
                            etf_sections.append(heading.parent)
                    
                    # Si des sections sont trouvées, extraire leur contenu
                    if etf_sections:
                        content.append("📊 ANALYSE DES ETF:")
                        for section in etf_sections:
                            title = section.select_one('h1, h2, h3, h4, h5, h6')
                            if title:
                                content.append(f"• {title.get_text(strip=True)}")
                            
                            # Extraire des éléments liste ou paragraphes
                            items = section.select('li, p')
                            for item in items[:10]:
                                content.append(f"  - {item.get_text(strip=True)}")
                    
                    # Fallback sur les sélecteurs originaux
                    if len(content) <= 1:
                        etf_items = soup.select('.etf-card, .etf-item, .fund-card, .etf-table tr')
                        if not etf_items:
                            # Fallback
                            etf_items = soup.select('.card, .etf, tr, .fund')
                        
                        if not content:
                            content.append("📊 ANALYSE DES ETF:")
                        
                        for item in etf_items:
                            name = item.select_one('h3, h4, .etf-name, .name, .symbol, .title, td:first-child')
                            category = item.select_one('.category, .type, .asset-class')
                            aum = item.select_one('.aum, .size, .assets')
                            expense = item.select_one('.expense, .ter, .fee')
                            
                            if name:
                                name_text = name.get_text(strip=True)
                                if name_text:
                                    data_line = "• {}".format(name_text)
                                    if category:
                                        category_text = category.get_text(strip=True)
                                        data_line += " ({})".format(category_text)
                                    if aum:
                                        aum_text = aum.get_text(strip=True)
                                        data_line += " AUM: {}".format(aum_text)
                                    if expense:
                                        expense_text = expense.get_text(strip=True)
                                        data_line += ", Frais: {}".format(expense_text)
                                    content.append(data_line)
            
            # Si aucun contenu spécifique n'a été trouvé, extraire le texte brut 
            if not content:
                # Extraire tout le contenu textuel de la page pour avoir quelque chose
                body_text = soup.body.get_text(strip=True) if soup.body else ""
                if body_text:
                    # Limiter à 1000 caractères pour éviter un prompt trop long
                    content.append(f"[Extraction brute de {html_file}]")
                    
                    # Découper le texte en lignes plus courtes pour plus de lisibilité
                    chunks = [body_text[i:i+100] for i in range(0, min(1000, len(body_text)), 100)]
                    for chunk in chunks:
                        content.append(chunk)
                else:
                    content.append(f"[Aucun contenu trouvé dans {html_file}]")
            
            # Ajouter une ligne de log pour déboguer
            print(f"✅ Contenu extrait de {html_file}: {len(content)} éléments trouvés")
            
            return "\n".join(content)
    except Exception as e:
        print(f"❌ Erreur lors de l'extraction du contenu de {html_file}: {str(e)}")
        # En cas d'erreur, retourner un placeholder pour ne pas bloquer l'exécution
        return f"[Contenu non disponible pour {html_file}]"

def get_current_month_fr():
    """Retourne le nom du mois courant en français."""
    try:
        # Tenter de définir la locale en français
        locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')
    except locale.Error:
        # Fallback si la locale française n'est pas disponible
        month_names = {
            1: "janvier", 2: "février", 3: "mars", 4: "avril",
            5: "mai", 6: "juin", 7: "juillet", 8: "août",
            9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre"
        }
        return month_names[datetime.datetime.now().month]
    
    # Obtenir le mois en français
    return datetime.datetime.now().strftime('%B').lower()

def generate_portfolios(actualites, marche, secteurs, listes, etfs):
    """Génère trois portefeuilles optimisés en combinant les données fournies et le contexte actuel du marché."""
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")
    
    # Obtenir le mois courant en français
    current_month = get_current_month_fr()
    
    # Ajouter des logs pour déboguer les entrées
    print(f"🔍 Longueur des données extraites:")
    print(f"  📰 Actualités: {len(actualites)} caractères")
    print(f"  📈 Marché: {len(marche)} caractères")
    print(f"  🏭 Secteurs: {len(secteurs)} caractères")
    print(f"  📋 Listes: {len(listes)} caractères")
    print(f"  📊 ETFs: {len(etfs)} caractères")
    
    # Afficher les premiers caractères de chaque source pour vérification
    print("\n===== APERÇU DU CONTENU EXTRAIT =====")
    print("\n----- ACTUALITÉS (premiers 200 caractères) -----")
    print(actualites[:200] + "..." if len(actualites) > 200 else actualites)
    print("\n----- MARCHÉS (premiers 200 caractères) -----")
    print(marche[:200] + "..." if len(marche) > 200 else marche)
    print("\n----- SECTEURS (premiers 200 caractères) -----")
    print(secteurs[:200] + "..." if len(secteurs) > 200 else secteurs)
    print("\n----- LISTES (premiers 200 caractères) -----")
    print(listes[:200] + "..." if len(listes) > 200 else listes)
    print("\n----- ETF (premiers 200 caractères) -----")
    print(etfs[:200] + "..." if len(etfs) > 200 else etfs)
    print("\n===========================================")
    
    prompt = f"""
Tu es un expert en gestion de portefeuille, avec une expertise en allocation stratégique et tactique. Tu vises à maximiser le rendement ajusté au risque en tenant compte de l'environnement macroéconomique actuel.

Utilise :
- Les **données suivantes** :  
  📰 Actualités financières : {actualites}  
  📈 Tendances du marché : {marche}  
  🏭 Analyse sectorielle : {secteurs}  
  📋 Listes d'actifs surveillés : {listes}
  📊 Analyse des ETF : {etfs}
- Et **ton propre contexte actuel du marché** (connaissances à jour, tendances macroéconomiques, comportements des investisseurs, mouvements des classes d'actifs).

📅 Contexte : Ces portefeuilles sont optimisés pour le mois de {current_month} en tenant compte des évolutions à court et moyen terme.

🎯 Ton objectif : Générer trois portefeuilles optimisés :
1️⃣ **Agressif** : 10 à 20 actifs très volatils (actions de croissance, crypto, ETF spéculatifs).  
2️⃣ **Modéré** : 10 à 20 actifs équilibrés (blue chips, ETF diversifiés, obligations d'entreprises).  
3️⃣ **Stable** : 10 à 20 actifs défensifs (obligations souveraines, valeurs refuges, ETF stables).

📊 **Format attendu : JSON uniquement**
{{
  "Agressif": {{
    "Actions": {{
      "Nom": "X%",
      ...
    }},
    "Crypto": {{
      ...
    }},
    "ETF": {{
      ...
    }},
    "Obligations": {{
      ...
    }}
  }},
  "Modéré": {{ ... }},
  "Stable": {{ ... }}
}}

✅ **Contraintes** :
- Chaque portefeuille contient **entre 10 et 20 actifs**.
- La somme des pourcentages fait **100%** par portefeuille.
- Chaque portefeuille inclut **au minimum deux classes d'actifs différentes**.
- L'allocation reflète à la fois les données fournies **et** les tendances actuelles du marché.
- Si un secteur est en forte croissance selon l'analyse sectorielle, surpondère-le dans les portefeuilles Agressif et Modéré.
- En cas d'incertitude macroéconomique, renforce les allocations en actifs refuges dans le portefeuille Stable.
- Privilégie les ETF mentionnés dans la section ETF pour les allocations ETF.
- Utilise les actifs des listes de surveillance quand c'est pertinent.
- Les poids d'allocation sont exprimés en **% du portefeuille total**.
- Ne réponds **qu'avec le JSON**, sans commentaire ni explication.
"""
    
    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7
        }
        
        print("🚀 Envoi de la requête à l'API OpenAI...")
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
        print("✅ Portefeuilles générés avec succès")
        return portfolios
    
    except Exception as e:
        print(f"❌ Erreur lors de la génération des portefeuilles: {str(e)}")
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
    print("🔍 Chargement des données financières...")
    # Charger les données JSON directement depuis le dossier data/
    news_data = load_json_data('data/news.json')
    markets_data = load_json_data('data/markets.json')
    sectors_data = load_json_data('data/sectors.json')
    lists_data = load_json_data('data/lists.json')
    etfs_data = load_json_data('data/etf.json')
    
    print("🧠 Génération des portefeuilles optimisés...")
    portfolios = generate_portfolios(news_data, markets_data, sectors_data, lists_data, etfs_data)
    
    print("💾 Sauvegarde des portefeuilles...")
    save_portfolios(portfolios)
    
    print("✨ Traitement terminé!")

def load_json_data(file_path):
    """Charger des données depuis un fichier JSON."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
            print(f"✅ Données JSON chargées avec succès depuis {file_path}")
            return data
    except Exception as e:
        print(f"❌ Erreur lors du chargement de {file_path}: {str(e)}")
        return {}

if __name__ == "__main__":
    main()