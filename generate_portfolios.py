import os
import json
import requests
import datetime
import locale
import time
import random
import re
from bs4 import BeautifulSoup

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

def filter_news_data(news_data):
    """Filtre les données d'actualités pour n'inclure que les plus pertinentes."""
    if not news_data or not isinstance(news_data, dict):
        return "Aucune donnée d'actualité disponible"
    
    # Sélectionner uniquement les actualités des derniers jours
    filtered_news = []
    
    # Parcourir les actualités par région
    for region, news_list in news_data.items():
        if not isinstance(news_list, list):
            continue
            
        # Ne prendre que les 5 actualités les plus importantes par région
        important_news = []
        for news in news_list[:5]:  # Limiter à 5 actualités par région
            if not isinstance(news, dict):
                continue
                
            # Ne garder que les champs essentiels
            important_news.append({
                "title": news.get("title", ""),
                "impact": news.get("impact", ""),
                "category": news.get("category", ""),
                "date": news.get("date", "")
            })
        
        # Ajouter seulement si nous avons des actualités
        if important_news:
            filtered_news.append(f"Région {region}: " + 
                               ", ".join([f"{n['title']} ({n['impact']})" for n in important_news]))
    
    return "\n".join(filtered_news) if filtered_news else "Aucune actualité pertinente"

def filter_markets_data(markets_data):
    """Filtre les données de marché pour inclure les indices clés et les top performers."""
    if not markets_data or not isinstance(markets_data, dict):
        return "Aucune donnée de marché disponible"
    
    lines = []
    
    # 🌍 Résumé par région – indices globaux
    indices_data = markets_data.get("indices", {})
    for region, indices in indices_data.items():
        if not isinstance(indices, list):
            continue
        
        lines.append(f"📈 {region}")
        for idx in indices[:5]:  # max 5 indices par région
            name = idx.get("index_name", "")
            var = idx.get("change", "")
            ytd = idx.get("ytdChange", "")
            if name and var:
                lines.append(f"• {name}: {var} | YTD: {ytd}")
    
    # 🚀 Top Performers
    top = markets_data.get("top", {})
    
    # Correction: Vérifier si 'top_var' existe dans 'top' avant d'y accéder
    if "top_var" in top and isinstance(top["top_var"], list):
        lines.append("🏆 Top 3 Hausses (variation %):")
        for item in top["top_var"][:3]:
            name = item.get("name", "")
            var = item.get("var", "")
            country = item.get("country", "")
            lines.append(f"• {name} ({country}) : {var}")
    
    # Ou utiliser top_performers s'il existe
    if "top_performers" in markets_data:
        if "daily" in markets_data["top_performers"] and "best" in markets_data["top_performers"]["daily"]:
            lines.append("🏆 Top 3 Hausses (variation %):")
            for item in markets_data["top_performers"]["daily"]["best"][:3]:
                name = item.get("index_name", "")
                change = item.get("change", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {change}")
    
    # Worst performers
    if "worst_var" in top and isinstance(top["worst_var"], list):
        lines.append("📉 Top 3 Baisses (variation %):")
        for item in top["worst_var"][:3]:
            name = item.get("name", "")
            var = item.get("var", "")
            country = item.get("country", "")
            lines.append(f"• {name} ({country}) : {var}")
    
    # Ou utiliser top_performers s'il existe
    if "top_performers" in markets_data:
        if "daily" in markets_data["top_performers"] and "worst" in markets_data["top_performers"]["daily"]:
            lines.append("📉 Top 3 Baisses (variation %):")
            for item in markets_data["top_performers"]["daily"]["worst"][:3]:
                name = item.get("index_name", "")
                change = item.get("change", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {change}")
    
    # Top 3 Hausses/Baisses YTD
    if "top_ytd" in top and isinstance(top["top_ytd"], list):
        lines.append("📈 Top 3 Hausses (YTD):")
        for item in top["top_ytd"][:3]:
            name = item.get("name", "")
            ytd = item.get("ytd", "")
            country = item.get("country", "")
            lines.append(f"• {name} ({country}) : {ytd}")
    
    # Ou utiliser top_performers s'il existe
    if "top_performers" in markets_data and "ytd" in markets_data["top_performers"]:
        if "best" in markets_data["top_performers"]["ytd"]:
            lines.append("📈 Top 3 Hausses (YTD):")
            for item in markets_data["top_performers"]["ytd"]["best"][:3]:
                name = item.get("index_name", "")
                ytd = item.get("ytdChange", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {ytd}")
    
    if "worst_ytd" in top and isinstance(top["worst_ytd"], list):
        lines.append("📉 Top 3 Baisses (YTD):")
        for item in top["worst_ytd"][:3]:
            name = item.get("name", "")
            ytd = item.get("ytd", "")
            country = item.get("country", "")
            lines.append(f"• {name} ({country}) : {ytd}")
    
    # Fallback si aucune donnée n'a été trouvée
    if not lines:
        lines.append("Données de marché extraites des indices disponibles:")
        # Ajouter quelques indices de base si disponibles
        for region, indices in indices_data.items():
            if isinstance(indices, list) and indices:
                lines.append(f"📈 {region.upper()}:")
                for idx in indices[:3]:  # Juste 3 par région pour limiter
                    name = idx.get("index_name", "")
                    change = idx.get("change", "")
                    if name:
                        lines.append(f"• {name}: {change}")
    
    return "\n".join(lines) if lines else "Aucune donnée de marché significative"

def filter_sectors_data(sectors_data):
    """Filtre les données sectorielles pour montrer les meilleures et pires variations par région."""
    if not sectors_data or not isinstance(sectors_data, dict):
        return "Aucune donnée sectorielle disponible"
    
    summary = []
    sectors = sectors_data.get("sectors", {})
    
    for region, sector_list in sectors.items():
        if not isinstance(sector_list, list):
            continue
        
        # Trier par variation YTD si disponible
        try:
            sector_list_sorted = sorted(
                sector_list, 
                key=lambda x: float(str(x.get("ytd", "0")).replace('%','').replace(',', '.')), 
                reverse=True
            )
        except (ValueError, TypeError):
            sector_list_sorted = sector_list
        
        summary.append(f"🏭 {region}")
        for sec in sector_list_sorted[:5]:  # Top 5
            name = sec.get("name", "")
            var = sec.get("change", "")
            ytd = sec.get("ytd", "")
            if name and var:
                summary.append(f"• {name} : {var} | YTD : {ytd}")
    
    return "\n".join(summary) if summary else "Aucune donnée sectorielle significative"

def filter_etf_data(etf_data):
    """Filtre les données ETF pour n'inclure que les ETF les plus performants."""
    if not etf_data or not isinstance(etf_data, dict):
        return "Aucune donnée ETF disponible"
    
    etf_summary = []
    
    # Extraire les ETF performants
    if "top50_etfs" in etf_data and isinstance(etf_data["top50_etfs"], list):
        top_etfs = []
        for etf in etf_data["top50_etfs"][:5]:  # Limiter aux 5 premiers
            if not isinstance(etf, dict):
                continue
                
            name = etf.get("name", "")
            ytd = etf.get("ytd", "")
            
            if name and ytd:
                top_etfs.append(f"{name}: {ytd}")
        
        if top_etfs:
            etf_summary.append("ETF performants: " + ", ".join(top_etfs))
    
    # Ajouter les top performers si disponibles
    if "top_performers" in etf_data and isinstance(etf_data["top_performers"], dict):
        if "ytd" in etf_data["top_performers"] and isinstance(etf_data["top_performers"]["ytd"], dict):
            best_ytd = etf_data["top_performers"]["ytd"].get("best", [])
            if isinstance(best_ytd, list) and best_ytd:
                best_names = []
                for etf in best_ytd[:3]:
                    if isinstance(etf, dict):
                        name = etf.get("name", "")
                        if name:
                            best_names.append(name)
                
                if best_names:
                    etf_summary.append("Meilleurs ETF YTD: " + ", ".join(best_names))
    
    return "\n".join(etf_summary) if etf_summary else "Aucune donnée ETF significative"

def filter_lists_data(lists_data):
    """Extrait les actifs les plus pertinents des listes de surveillance."""
    if not lists_data or not isinstance(lists_data, dict):
        return "Aucune liste d'actifs disponible"
    
    assets_summary = []
    
    # Parcourir les différentes listes
    for list_name, list_data in lists_data.items():
        if not isinstance(list_data, dict):
            continue
            
        trending_up = []
        trending_down = []
        
        # Rechercher dans les indices
        if "indices" in list_data and isinstance(list_data["indices"], dict):
            for letter, assets in list_data["indices"].items():
                if not isinstance(assets, list):
                    continue
                    
                for asset in assets:
                    if not isinstance(asset, dict):
                        continue
                        
                    name = asset.get("name", "")
                    change = asset.get("change", "")
                    trend = asset.get("trend", "")
                    
                    if name and change:
                        if trend == "up" and not change.startswith("-"):
                            trending_up.append(f"{name}: {change}")
                        elif trend == "down" and change.startswith("-"):
                            trending_down.append(f"{name}: {change}")
        
        # Limiter aux 5 meilleurs et 5 pires
        if trending_up:
            assets_summary.append(f"Actifs {list_name} en hausse: " + ", ".join(trending_up[:5]))
        if trending_down:
            assets_summary.append(f"Actifs {list_name} en baisse: " + ", ".join(trending_down[:5]))
    
    return "\n".join(assets_summary) if assets_summary else "Aucune donnée d'actifs significative"

def save_prompt_to_debug_file(prompt, timestamp=None):
    """Sauvegarde le prompt complet dans un fichier de débogage."""
    # Créer un répertoire de debug s'il n'existe pas
    debug_dir = "debug/prompts"
    os.makedirs(debug_dir, exist_ok=True)
    
    # Utiliser un horodatage fourni ou en générer un nouveau
    if timestamp is None:
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Créer le nom du fichier de débogage
    debug_file = f"{debug_dir}/prompt_{timestamp}.txt"
    
    # Sauvegarder le prompt dans le fichier
    with open(debug_file, 'w', encoding='utf-8') as f:
        f.write(prompt)
    
    # Générer un fichier HTML plus lisible
    html_file = f"{debug_dir}/prompt_{timestamp}.html"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>TradePulse - Debug de Prompt</title>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }}
            pre {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; }}
            h1, h2 {{ color: #2c3e50; }}
            .info {{ background-color: #e8f4f8; padding: 10px; border-radius: 5px; margin-bottom: 20px; }}
            .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }}
            .stat-box {{ background: #f0f7fa; padding: 10px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
            .highlight {{ background-color: #ffffcc; }}
        </style>
    </head>
    <body>
        <h1>TradePulse - Debug de Prompt ChatGPT</h1>
        <div class="info">
            <p>Timestamp: {timestamp}</p>
            <p>Taille totale du prompt: {len(prompt)} caractères</p>
        </div>
        <h2>Contenu du prompt envoyé à ChatGPT :</h2>
        <pre>{prompt.replace('<', '&lt;').replace('>', '&gt;')}</pre>
    </body>
    </html>
    """
    
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    # Créer également un fichier JavaScript pour enregistrer le debug dans localStorage
    # (pour l'intégration avec l'interface web)
    js_debug_path = "debug/prompts/debug_data.js"
    with open(js_debug_path, 'w', encoding='utf-8') as f:
        f.write(f"""
// Script de debug généré automatiquement
// Ce fichier est utilisé par l'interface web de debug

// Enregistrer les infos de ce debug
if (window.recordDebugFile) {{
    window.recordDebugFile('{timestamp}', {{
        prompt_length: {len(prompt)},
        prompt_path: '{debug_file}',
        html_path: '{html_file}'
    }});
}}
""")
    
    print(f"✅ Pour voir le prompt dans l'interface web, accédez à: debug-prompts.html")
    
    return debug_file, html_file

def generate_portfolios(news_data, markets_data, sectors_data, lists_data, etfs_data):
    """Génère trois portefeuilles optimisés en combinant les données fournies et le contexte actuel du marché."""
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")
    
    # Obtenir le mois courant en français
    current_month = get_current_month_fr()
    
    # ===== OPTIMISATION : FILTRER LES DONNÉES =====
    # Filtrer les données pour réduire la taille
    filtered_news = filter_news_data(news_data)
    filtered_markets = filter_markets_data(markets_data)
    filtered_sectors = filter_sectors_data(sectors_data)
    filtered_lists = filter_lists_data(lists_data)
    filtered_etfs = filter_etf_data(etfs_data)
    
    # Ajouter des logs pour déboguer les entrées
    print(f"🔍 Longueur des données FILTRÉES:")
    print(f"  📰 Actualités: {len(filtered_news)} caractères")
    print(f"  📈 Marché: {len(filtered_markets)} caractères")
    print(f"  🏭 Secteurs: {len(filtered_sectors)} caractères")
    print(f"  📋 Listes: {len(filtered_lists)} caractères")
    print(f"  📊 ETFs: {len(filtered_etfs)} caractères")
    
    # Afficher les données filtrées pour vérification
    print("\n===== APERÇU DES DONNÉES FILTRÉES =====")
    print("\n----- ACTUALITÉS (données filtrées) -----")
    print(filtered_news[:200] + "..." if len(filtered_news) > 200 else filtered_news)
    print("\n----- MARCHÉS (données filtrées) -----")
    print(filtered_markets[:200] + "..." if len(filtered_markets) > 200 else filtered_markets)
    print("\n----- SECTEURS (données filtrées) -----")
    print(filtered_sectors[:200] + "..." if len(filtered_sectors) > 200 else filtered_sectors)
    print("\n----- LISTES (données filtrées) -----")
    print(filtered_lists[:200] + "..." if len(filtered_lists) > 200 else filtered_lists)
    print("\n----- ETF (données filtrées) -----")
    print(filtered_etfs[:200] + "..." if len(filtered_etfs) > 200 else filtered_etfs)
    print("\n===========================================")
    
    # ===== SYSTÈME DE RETRY AVEC BACKOFF EXPONENTIEL =====
    max_retries = 3
    backoff_time = 1  # Commencer avec 1 seconde
    
    # Horodatage pour les fichiers de debug
    debug_timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    
    for attempt in range(max_retries):
        try:
            # Construire un prompt beaucoup plus court avec les données filtrées
            prompt = f"""
Tu es un expert en gestion de portefeuille, avec une expertise en allocation stratégique et tactique. Tu vises à maximiser le rendement ajusté au risque en tenant compte de l'environnement macroéconomique actuel.

Utilise ces données filtrées et synthétisées pour générer des portefeuilles optimisés :

📰 Actualités financières récentes: 
{filtered_news}

📈 Tendances du marché: 
{filtered_markets}

🏭 Analyse sectorielle: 
{filtered_sectors}

📋 Listes d'actifs surveillés: 
{filtered_lists}

📊 Analyse des ETF: 
{filtered_etfs}

📅 Contexte : Ces portefeuilles sont optimisés pour le mois de {current_month} en tenant compte des évolutions à court et moyen terme.

🎯 Ton objectif : Générer trois portefeuilles optimisés :
1️⃣ Agressif : 10 à 20 actifs très volatils (actions de croissance, crypto, ETF spéculatifs).  
2️⃣ Modéré : 10 à 20 actifs équilibrés (blue chips, ETF diversifiés, obligations d'entreprises).  
3️⃣ Stable : 10 à 20 actifs défensifs (obligations souveraines, valeurs refuges, ETF stables).

📊 Format JSON uniquement:
{{
  "Agressif": {{
    "Actions": {{
      "Nom": "X%",
      ...
    }},
    "Crypto": {{ ... }},
    "ETF": {{ ... }},
    "Obligations": {{ ... }}
  }},
  "Modéré": {{ ... }},
  "Stable": {{ ... }}
}}

✅ Contraintes :
- Chaque portefeuille: 10-20 actifs, somme 100%, minimum 2 classes d'actifs
- Surpondérer les secteurs en croissance dans Agressif/Modéré
- Renforcer les actifs refuges dans Stable en cas d'incertitude
- Ne réponds qu'avec le JSON, sans commentaire ni explication.
"""
            
            # ===== NOUVELLE FONCTIONNALITÉ: SAUVEGARDER LE PROMPT POUR DEBUG =====
            print("\n🔍 GÉNÉRATION DU PROMPT COMPLET POUR DEBUG...")
            debug_file, html_file = save_prompt_to_debug_file(prompt, debug_timestamp)
            print(f"✅ Prompt complet sauvegardé dans {debug_file}")
            print(f"✅ Version HTML plus lisible sauvegardée dans {html_file}")
            print(f"📝 Consultez ces fichiers pour voir exactement ce qui est envoyé à ChatGPT")
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7
            }
            
            print(f"🚀 Envoi de la requête à l'API OpenAI (tentative {attempt+1}/{max_retries})...")
            response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data)
            response.raise_for_status()
            
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            # Sauvegarder également la réponse pour analyse
            response_debug_file = f"debug/prompts/response_{debug_timestamp}.txt"
            with open(response_debug_file, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ Réponse de l'API sauvegardée dans {response_debug_file}")
            
            # Nettoyer la réponse pour extraire seulement le JSON
            content = re.sub(r'^```json', '', content)
            content = re.sub(r'```$', '', content)
            content = content.strip()
            
            # Vérifier que le contenu est bien du JSON valide
            portfolios = json.loads(content)
            print("✅ Portefeuilles générés avec succès")
            return portfolios
        
        except Exception as e:
            print(f"❌ Erreur lors de la tentative {attempt+1}: {str(e)}")
            
            if attempt < max_retries - 1:
                sleep_time = backoff_time + random.uniform(0, 1)
                print(f"⏳ Nouvelle tentative dans {sleep_time:.2f} secondes...")
                time.sleep(sleep_time)
                backoff_time *= 2  # Double le temps d'attente pour la prochaine tentative
            else:
                print("❌ Échec après plusieurs tentatives, utilisation du portfolio par défaut")
                # En cas d'échec de toutes les tentatives, retourner un portfolio par défaut
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