import os
import json
import requests
import datetime
import locale
import time
import random
import re
from bs4 import BeautifulSoup
# Importer les fonctions d'ajustement des portefeuilles
from portfolio_adjuster import check_portfolio_constraints, adjust_portfolios, get_portfolio_prompt_additions, valid_etfs_cache, valid_bonds_cache

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
                # CORRECTION: Vérifier que le contenu n'a pas de lignes de données (avec •)
                if not content or not any("•" in item for item in content):
                    market_data = soup.select('.market-trend, .market-data, .trend-item, .index-card, .market-item')
                    if not market_data:
                        # Fallback
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
                
                # CORRECTION: Vérifier que le contenu n'a pas de lignes de données (avec •)
                if not any("•" in item for item in content):
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
                
                # CORRECTION: Vérifier que le contenu n'a pas de lignes de données (avec •)
                if not any("•" in item for item in content):
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
                
                # CORRECTION: Vérifier que le contenu n'a pas de lignes de données (avec •)
                if not any("•" in item for item in content):
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
                    
                    # Fallback sur les sélecteurs originaux si aucune ligne de données trouvée
                    if not any("•" in item for item in content):
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
            
            # CORRECTION: Si aucun contenu spécifique n'a été trouvé, extraire le texte brut avec marqueur clair
            if not content:
                # Extraire tout le contenu textuel de la page pour avoir quelque chose
                body_text = soup.body.get_text(strip=True) if soup.body else ""
                if body_text:
                    # Limiter à 1000 caractères pour éviter un prompt trop long
                    content.append(f"[FALLBACK BRUT - {html_file}]")
                    
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
    
    return "\n".join(filtered_news) if filtered_news else "Aucune donnée d'actualité pertinente"

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
    
    # 🚀 Traitement des Top Performers
    # Utilisation directe de la structure top_performers existante
    if "top_performers" in markets_data and isinstance(markets_data["top_performers"], dict):
        # Top performers quotidiens
        if "daily" in markets_data["top_performers"]:
            daily = markets_data["top_performers"]["daily"]
            
            # Meilleurs performers quotidiens
            if "best" in daily and isinstance(daily["best"], list) and daily["best"]:
                lines.append("🏆 Top Hausses (variation quotidienne):")
                for item in daily["best"][:3]:
                    if isinstance(item, dict):
                        name = item.get("index_name", "")
                        change = item.get("change", "")
                        country = item.get("country", "")
                        if name and country:
                            lines.append(f"• {name} ({country}): {change}")
            
            # Pires performers quotidiens
            if "worst" in daily and isinstance(daily["worst"], list) and daily["worst"]:
                lines.append("📉 Top Baisses (variation quotidienne):")
                for item in daily["worst"][:3]:
                    if isinstance(item, dict):
                        name = item.get("index_name", "")
                        change = item.get("change", "")
                        country = item.get("country", "")
                        if name and country:
                            lines.append(f"• {name} ({country}): {change}")
        
        # Top performers YTD (year-to-date)
        if "ytd" in markets_data["top_performers"]:
            ytd = markets_data["top_performers"]["ytd"]
            
            # Meilleurs performers YTD
            if "best" in ytd and isinstance(ytd["best"], list) and ytd["best"]:
                lines.append("📈 Top Hausses (YTD):")
                for item in ytd["best"][:3]:
                    if isinstance(item, dict):
                        name = item.get("index_name", "")
                        ytd_change = item.get("ytdChange", "")
                        country = item.get("country", "")
                        if name and country:
                            lines.append(f"• {name} ({country}): {ytd_change}")
            
            # Pires performers YTD
            if "worst" in ytd and isinstance(ytd["worst"], list) and ytd["worst"]:
                lines.append("📉 Top Baisses (YTD):")
                for item in ytd["worst"][:3]:
                    if isinstance(item, dict):
                        name = item.get("index_name", "")
                        ytd_change = item.get("ytdChange", "")
                        country = item.get("country", "")
                        if name and country:
                            lines.append(f"• {name} ({country}): {ytd_change}")
    
    # Ancienne structure (pour compatibilité) - uniquement si top_performers n'existe pas
    elif "top" in markets_data and isinstance(markets_data["top"], dict):
        top = markets_data["top"]
        
        # Top 3 Hausses (VAR %)
        if "top_var" in top and isinstance(top["top_var"], list):
            lines.append("🏆 Top 3 Hausses (variation %):")
            for item in top["top_var"][:3]:
                name = item.get("name", "")
                var = item.get("var", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {var}")
        
        # Top 3 Baisses (VAR %)
        if "worst_var" in top and isinstance(top["worst_var"], list):
            lines.append("📉 Top 3 Baisses (variation %):")
            for item in top["worst_var"][:3]:
                name = item.get("name", "")
                var = item.get("var", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {var}")
        
        # Top 3 Hausses YTD
        if "top_ytd" in top and isinstance(top["top_ytd"], list):
            lines.append("📈 Top 3 Hausses (YTD):")
            for item in top["top_ytd"][:3]:
                name = item.get("name", "")
                ytd = item.get("ytd", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {ytd}")
        
        # Top 3 Baisses YTD
        if "worst_ytd" in top and isinstance(top["worst_ytd"], list):
            lines.append("📉 Top 3 Baisses (YTD):")
            for item in top["worst_ytd"][:3]:
                name = item.get("name", "")
                ytd = item.get("ytd", "")
                country = item.get("country", "")
                lines.append(f"• {name} ({country}) : {ytd}")
    
    # Fallback si aucune donnée de top performers n'est trouvée
    if not lines or not any("•" in line for line in lines):  # CORRECTION: Vérifier l'absence de lignes de données
        # Ajouter une synthèse basique basée sur les indices
        for region, indices in indices_data.items():
            if not isinstance(indices, list) or not indices:
                continue
                
            # Chercher les indices avec les plus grandes variations
            try:
                # Trier par variation
                sorted_indices = sorted(
                    indices,
                    key=lambda x: float(str(x.get("change", "0")).replace('%','').replace(',', '.')),
                    reverse=True
                )
                
                # Prendre le meilleur et le pire
                best = sorted_indices[0] if sorted_indices else None
                worst = sorted_indices[-1] if len(sorted_indices) > 1 else None
                
                if best:
                    lines.append(f"• Meilleur {region}: {best.get('index_name', '')} ({best.get('change', '')})")
                if worst:
                    lines.append(f"• Pire {region}: {worst.get('index_name', '')} ({worst.get('change', '')})")
            except (ValueError, TypeError):
                # En cas d'erreur, ignorer ce tri
                pass
    
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

def filter_lists_data(lists_data):
    """Filtre les actifs avec YTD entre -5% et 120%, et Daily > -10% depuis lists.json."""
    if not lists_data or not isinstance(lists_data, dict):
        return "Aucune liste d'actifs disponible"
    
    filtered_assets = []

    for list_name, list_data in lists_data.items():
        if not isinstance(list_data, dict):
            continue

        indices = list_data.get("indices", {})
        for letter, assets in indices.items():
            if not isinstance(assets, list):
                continue

            for asset in assets:
                if not isinstance(asset, dict):
                    continue

                name = asset.get("name", "")
                ytd = asset.get("ytd", "")
                daily = asset.get("change", "")  # Utilisation de la clé "change" pour la variation journalière

                # Nettoyage et conversion
                try:
                    ytd_value = float(re.sub(r"[^\d\.-]", "", str(ytd).replace(",", ".")))
                    daily_value = float(re.sub(r"[^\d\.-]", "", str(daily).replace(",", ".")))
                except (ValueError, AttributeError):
                    continue

                # Filtre : YTD entre -5% et 120%, et Daily > -10%
                if -5 <= ytd_value <= 120 and daily_value > -10:
                    filtered_assets.append((name, ytd_value, daily_value))

    # Trier par YTD décroissant
    filtered_assets.sort(key=lambda x: x[1], reverse=True)

    # Résumé textuel
    assets_summary = ["📋 Actifs filtrés (YTD -5% à 120% et Daily > -10%) :"]
    for name, ytd_value, daily_value in filtered_assets[:15]:  # max 15 visibles
        assets_summary.append(f"• {name}: YTD {ytd_value:.2f}%, Daily {daily_value:.2f}%")

    return "\n".join(assets_summary) if filtered_assets else "Aucune donnée d'actifs significative"

def filter_etf_data(etfs_data):
    """Filtre les ETF par catégories et critères spécifiques."""
    if not etfs_data or not isinstance(etfs_data, dict):
        return "Aucune donnée ETF disponible"
    
    summary = []

    # Ajouter une section pour faciliter l'identification et la séparation
    summary.append("📊 LISTE DES ETF STANDARDS DISPONIBLES POUR LES PORTEFEUILLES:")

    # 1. TOP ETF 2025 → à utiliser comme ETF standards
    top_etfs = etfs_data.get("top50_etfs", [])
    selected_top = []
    for etf in top_etfs:
        if etf.get('name'):
            selected_top.append(f"{etf['name']} : {etf.get('ytd', 'N/A')}")
    if selected_top:
        summary.append("📊 TOP ETF STANDARDS 2025:")
        summary.extend(f"• {etf}" for etf in selected_top)

    # 2. TOP ETF OBLIGATIONS 2025 - À utiliser UNIQUEMENT dans la catégorie Obligations
    bond_etfs = etfs_data.get("top_bond_etfs", [])
    bond_names = []  # Liste des noms d'ETF obligataires pour la whitelist
    selected_bonds = []
    
    for etf in bond_etfs:
        if etf.get('name'):
            # Ajouter tous les ETF obligataires à la liste sans filtre
            bond_names.append(etf['name'])
            # Ajouter au résumé avec leur performance
            selected_bonds.append(f"{etf['name']} : {etf.get('ytd', 'N/A')}")
    
    if selected_bonds:
        summary.append("📉 LISTE DES ETF OBLIGATAIRES (À UTILISER UNIQUEMENT DANS LA CATÉGORIE OBLIGATIONS):")
        summary.extend(f"• {etf}" for etf in selected_bonds)

    # 3. ETF court terme → à utiliser comme ETF standards
    short_term_etfs = etfs_data.get("top_short_term_etfs", [])
    selected_short_term = []
    for etf in short_term_etfs:
        if etf.get('name'):
            selected_short_term.append(f"{etf['name']} : {etf.get('oneMonth', 'N/A')}")
    if selected_short_term:
        summary.append("📆 ETF COURT TERME:")
        summary.extend(f"• {etf}" for etf in selected_short_term)
    
    # 4. ETF Sectoriels en croissance (si disponible)
    sector_etfs = etfs_data.get("etf_sectoriels", []) or []
    selected_sector_etfs = []
    for etf in sector_etfs:
        try:
            ytd = float(str(etf.get("ytd", "0")).replace('%','').replace(',', '.'))
            if ytd > 5:  # Seuil de 5% pour les ETF sectoriels
                selected_sector_etfs.append(f"{etf['name']} : {etf['ytd']}")
        except:
            continue
    if selected_sector_etfs:
        summary.append("🔍 ETF SECTORIELS (>5% YTD):")
        summary.extend(f"• {etf}" for etf in selected_sector_etfs)
        
    # 5. ETF Marchés émergents (si disponible)
    emerging_etfs = etfs_data.get("etf_marches_emergents", []) or []
    selected_emerging = []
    for etf in emerging_etfs:
        try:
            ytd = float(str(etf.get("ytd", "0")).replace('%','').replace(',', '.'))
            # Sélectionner tous, avec priorité aux performances positives
            selected_emerging.append((etf['name'], ytd, f"{etf['name']} : {etf['ytd']}"))
        except:
            continue
    if selected_emerging:
        # Trier par performance décroissante
        selected_emerging.sort(key=lambda x: x[1], reverse=True)
        summary.append("🌍 ETF MARCHÉS ÉMERGENTS:")
        summary.extend(f"• {etf[2]}" for etf in selected_emerging[:5])  # Limiter aux 5 meilleurs
    
    # Si aucun ETF obligataire n'a été trouvé, ajouter des exemples par défaut
    if not bond_names:
        print("⚠️ Aucun ETF obligataire trouvé dans les données, ajout d'exemples de secours")
        bond_names = [
            "iShares Euro Government Bond 3-5yr UCITS ETF",
            "Xtrackers II Eurozone Government Bond UCITS ETF",
            "Lyxor Euro Government Bond UCITS ETF"
        ]
    
    # Fallback pour les anciennes structures de données si aucune catégorie n'a été trouvée
    if len(summary) <= 1:  # Si seulement le titre est présent
        # Essayer la structure top50_etfs standard
        if "top50_etfs" in etfs_data and isinstance(etfs_data["top50_etfs"], list):
            summary.append("📊 TOP 50 ETF:")
            for etf in etfs_data["top50_etfs"][:8]:  # Top 8
                if not isinstance(etf, dict):
                    continue
                    
                name = etf.get("name", "")
                ytd = etf.get("ytd", "")
                
                if name and ytd:
                    summary.append(f"• {name}: {ytd}")
    
    return "\n".join(summary), bond_names  # Retourne le texte filtré et la liste des noms d'ETF obligataires

def filter_crypto_data(crypto_data):
    """Filtre les crypto-monnaies incluant toutes les cryptos, triées par capitalisation boursière, avec filtre de volatilité."""
    if not crypto_data or not isinstance(crypto_data, dict):
        return "Aucune donnée de crypto-monnaie disponible"
    
    summary = ["🪙 LISTE COMPLÈTE DES CRYPTO-MONNAIES TRIÉES PAR CAPITALISATION:"]
    
    # Liste pour stocker toutes les cryptos avec leur capitalisation boursière
    all_cryptos = []
    cryptos_24h_positive = []
    cryptos_7d_positive = []
    cryptos_filtered_out = []  # Pour tracer les cryptos trop volatiles éliminées
    
    # Traiter la catégorie principale
    main_cryptos = crypto_data.get('categories', {}).get('main', [])
    if main_cryptos:
        for crypto in main_cryptos:
            try:
                name = crypto.get('name', '')
                symbol = crypto.get('symbol', '')
                price = crypto.get('price', '')
                
                # Extraire les variations et la capitalisation boursière
                change_24h = crypto.get('change_24h', '0%')
                change_7d = crypto.get('change_7d', '0%')
                market_cap = crypto.get('market_cap', 0)
                
                # Nettoyer les valeurs
                change_24h_value = float(change_24h.replace('+', '').replace('%', '').replace(',', '.'))
                change_7d_value = float(change_7d.replace('+', '').replace('%', '').replace(',', '.'))
                
                # ⚠️ Filtrer les cryptos trop volatiles
                if change_24h_value > 15 and change_24h_value > (change_7d_value * 2):
                    # Trop volatile, on l'ajoute à la liste des exclues mais on ne l'intègre pas au filtre principal
                    cryptos_filtered_out.append((name, symbol, change_24h_value, change_7d_value, price))
                    continue  # Passer à la crypto suivante
                
                # Convertir la market cap en nombre si c'est une chaîne
                if isinstance(market_cap, str):
                    # Nettoyer la chaîne (supprimer symboles, espaces, etc.)
                    cleaned_cap = re.sub(r'[^\d.,]', '', market_cap.replace(',', '.'))
                    
                    # Gérer les formats communs pour les milliards/millions (B, M)
                    if 'B' in market_cap or 'b' in market_cap:
                        multiplier = 1_000_000_000
                    elif 'M' in market_cap or 'm' in market_cap:
                        multiplier = 1_000_000
                    else:
                        multiplier = 1
                    
                    try:
                        market_cap_value = float(cleaned_cap) * multiplier
                    except (ValueError, TypeError):
                        # Si la conversion échoue, utilisez un ordre de grandeur basé sur le prix
                        # (juste comme approximation fallback)
                        try:
                            price_value = float(re.sub(r'[^\d.,]', '', str(price).replace(',', '.')))
                            market_cap_value = price_value * 1_000_000  # estimation grossière
                        except:
                            market_cap_value = 0
                else:
                    market_cap_value = float(market_cap or 0)
                
                # Ajouter à toutes les cryptos
                all_cryptos.append((name, symbol, change_24h_value, change_7d_value, price, market_cap_value))
                
                # Vérifier si positive sur 24h/7j
                if change_24h_value > 0:
                    cryptos_24h_positive.append((name, symbol))
                if change_7d_value > 0:
                    cryptos_7d_positive.append((name, symbol))
                
            except (ValueError, TypeError) as e:
                print(f"Erreur lors du traitement de la crypto {name}: {str(e)}")
                continue
    
    # Traiter les autres catégories si nécessaire
    top_gainers = crypto_data.get('categories', {}).get('top_gainers_7d', [])
    if top_gainers:
        for crypto in top_gainers:
            try:
                name = crypto.get('name', '')
                symbol = crypto.get('symbol', '')
                
                # Éviter les doublons
                if name and symbol and not any(symbol == c[1] for c in all_cryptos) and not any(symbol == c[1] for c in cryptos_filtered_out):
                    price = crypto.get('price', '')
                    change_24h = crypto.get('change_24h', '0%')
                    change_7d = crypto.get('change_7d', '0%')
                    market_cap = crypto.get('market_cap', 0)
                    
                    # Nettoyer les valeurs
                    change_24h_value = float(change_24h.replace('+', '').replace('%', '').replace(',', '.'))
                    change_7d_value = float(change_7d.replace('+', '').replace('%', '').replace(',', '.'))
                    
                    # ⚠️ Filtrer les cryptos trop volatiles
                    if change_24h_value > 15 and change_24h_value > (change_7d_value * 2):
                        # Trop volatile, on l'ajoute à la liste des exclues
                        cryptos_filtered_out.append((name, symbol, change_24h_value, change_7d_value, price))
                        continue  # Passer à la crypto suivante
                    
                    # Convertir la market cap
                    if isinstance(market_cap, str):
                        cleaned_cap = re.sub(r'[^\d.,]', '', market_cap.replace(',', '.'))
                        
                        if 'B' in market_cap or 'b' in market_cap:
                            multiplier = 1_000_000_000
                        elif 'M' in market_cap or 'm' in market_cap:
                            multiplier = 1_000_000
                        else:
                            multiplier = 1
                        
                        try:
                            market_cap_value = float(cleaned_cap) * multiplier
                        except:
                            try:
                                price_value = float(re.sub(r'[^\d.,]', '', str(price).replace(',', '.')))
                                market_cap_value = price_value * 1_000_000
                            except:
                                market_cap_value = 0
                    else:
                        market_cap_value = float(market_cap or 0)
                    
                    # Ajouter à la liste
                    all_cryptos.append((name, symbol, change_24h_value, change_7d_value, price, market_cap_value))
                    
                    # Vérifier si positive
                    if change_24h_value > 0:
                        cryptos_24h_positive.append((name, symbol))
                    if change_7d_value > 0:
                        cryptos_7d_positive.append((name, symbol))
            except (ValueError, TypeError):
                continue
    
    # Si aucune capitalisation boursière valide n'a été trouvée, utiliser une valeur par défaut basée sur le prix
    for i, crypto in enumerate(all_cryptos):
        name, symbol, change_24h, change_7d, price, market_cap = crypto
        if market_cap <= 0:
            try:
                # Essayer d'extraire une valeur numérique du prix
                price_cleaned = re.sub(r'[^\d.,]', '', str(price).replace(',', '.'))
                price_value = float(price_cleaned)
                # Utiliser le prix comme indicateur de l'ordre de grandeur de la capitalisation
                # Mais ajouter aussi index pour garder l'ordre original si tout échoue
                all_cryptos[i] = (name, symbol, change_24h, change_7d, price, price_value * 1000000 / (i + 1))
            except:
                # Si ça échoue aussi, utiliser juste l'index inversé pour garder un ordre quelconque
                all_cryptos[i] = (name, symbol, change_24h, change_7d, price, 1000000 / (i + 1))
    
    # Trier par capitalisation boursière (market cap) décroissante
    all_cryptos.sort(key=lambda x: x[5], reverse=True)
    
    # Ajouter un log pour voir les capitalisations triées
    print(f"🔍 Cryptomonnaies triées par capitalisation boursière:")
    for i, (name, symbol, _, _, _, cap) in enumerate(all_cryptos[:10]):
        print(f"  {i+1}. {name} ({symbol}): {cap:,.2f}")
    
    # Ajouter toutes les cryptos à la liste
    for name, symbol, change_24h, change_7d, price, _ in all_cryptos:
        status_24h = "+" if change_24h > 0 else ""
        status_7d = "+" if change_7d > 0 else ""
        summary.append(f"• {name} ({symbol}): 24h: {status_24h}{change_24h:.2f}% | 7j: {status_7d}{change_7d:.2f}% | Prix: {price}")
    
    # Ajouter des sections distinctes pour les positives
    summary.append("\n🟢 CRYPTO-MONNAIES POSITIVES SUR 24H:")
    summary.append(f"Total: {len(cryptos_24h_positive)} cryptos en hausse")
    for name, symbol in cryptos_24h_positive:
        summary.append(f"• {name} ({symbol})")
    
    summary.append("\n🟢 CRYPTO-MONNAIES POSITIVES SUR 7 JOURS:")
    summary.append(f"Total: {len(cryptos_7d_positive)} cryptos en hausse")
    for name, symbol in cryptos_7d_positive:
        summary.append(f"• {name} ({symbol})")
    
    # Ajouter la section des cryptos écartées pour volatilité excessive
    if cryptos_filtered_out:
        summary.append("\n🟠 CRYPTO-MONNAIES ÉCARTÉES POUR VOLATILITÉ EXCESSIVE (24h > 15% ET 24h > 2×7j):")
        summary.append(f"Total: {len(cryptos_filtered_out)} cryptos trop volatiles")
        for name, symbol, change_24h, change_7d, price in cryptos_filtered_out:
            summary.append(f"• {name} ({symbol}): 24h: +{change_24h:.2f}% | 7j: {'+' if change_7d > 0 else ''}{change_7d:.2f}% | Prix: {price}")
    
    return "\n".join(summary)

def filter_themes_data(themes_data):
    """Filtre les données de thèmes et tendances pour les intégrer au prompt."""
    if not themes_data or not isinstance(themes_data, dict):
        return "Aucune donnée de tendances thématiques disponible"
    
    summary = ["📊 TENDANCES THÉMATIQUES ACTUELLES:"]
    
    # Traiter les tendances haussières
    if "bullish" in themes_data and isinstance(themes_data["bullish"], list):
        summary.append("🔼 THÈMES HAUSSIERS:")
        for theme in themes_data["bullish"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                reason = theme.get("reason", "")
                score = theme.get("score", "")
                if name:
                    summary.append(f"• {name}: {reason} (Score: {score})")
    
    # Traiter les tendances baissières
    if "bearish" in themes_data and isinstance(themes_data["bearish"], list):
        summary.append("🔽 THÈMES BAISSIERS:")
        for theme in themes_data["bearish"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                reason = theme.get("reason", "")
                score = theme.get("score", "")
                if name:
                    summary.append(f"• {name}: {reason} (Score: {score})")
    
    # Traiter les tendances neutres ou émergentes si elles existent
    if "emerging" in themes_data and isinstance(themes_data["emerging"], list):
        summary.append("🔄 THÈMES ÉMERGENTS:")
        for theme in themes_data["emerging"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                description = theme.get("description", "")
                if name:
                    summary.append(f"• {name}: {description}")
    
    return "\n".join(summary)

# Nouvelle fonction pour détecter les opportunités sous-évaluées
def detect_undervalued_opportunities(lists_data, sectors_data, themes_data):
    """Détecte les actifs potentiellement sous-évalués mais prometteurs basés sur des secteurs ou thèmes favorables."""
    opportunities = []
    
    # Extraire les secteurs haussiers (YTD > 2%)
    good_sectors = set()
    for region, sector_list in sectors_data.get("sectors", {}).items():
        for sec in sector_list:
            if not isinstance(sec, dict):
                continue
            try:
                ytd_value = float(str(sec.get("ytd", "0")).replace("%", "").replace(",", "."))
                if ytd_value > 2:
                    sector_name = sec.get("name", "").strip().lower()
                    if sector_name:
                        good_sectors.add(sector_name)
            except (ValueError, TypeError):
                continue

    # Extraire les thèmes haussiers
    bullish_themes = set()
    for theme in themes_data.get("bullish", []):
        if isinstance(theme, dict) and theme.get("name"):
            bullish_themes.add(theme.get("name", "").strip().lower())

    # Scanner les actifs: YTD modeste mais secteur ou thème favorable
    for list_name, list_data in lists_data.items():
        if not isinstance(list_data, dict):
            continue
        
        indices = list_data.get("indices", {})
        for letter, assets in indices.items():
            if not isinstance(assets, list):
                continue
                
            for asset in assets:
                if not isinstance(asset, dict):
                    continue
                    
                try:
                    name = asset.get("name", "")
                    if not name:
                        continue
                        
                    # Nettoyer et convertir YTD
                    ytd_str = str(asset.get("ytd", "0"))
                    ytd = float(ytd_str.replace('%', '').replace(',', '.'))
                    
                    # Obtenir le secteur s'il existe
                    sector = asset.get("sector", "").strip().lower()
                    
                    # Vérifier si l'actif correspond à nos critères
                    matches_theme = any(theme in name.lower() for theme in bullish_themes)
                    in_good_sector = sector in good_sectors
                    
                    if -5 < ytd < 10 and (in_good_sector or matches_theme):
                        reason = []
                        if in_good_sector:
                            reason.append(f"secteur favorable: {sector}")
                        if matches_theme:
                            matching_themes = [theme for theme in bullish_themes if theme in name.lower()]
                            if matching_themes:
                                reason.append(f"aligné avec thème(s): {', '.join(matching_themes)}")
                        
                        opportunities.append(f"• {name}: YTD {ytd:.1f}% – {' & '.join(reason)}")
                except (ValueError, TypeError) as e:
                    print(f"Erreur lors de l'analyse de l'actif {asset.get('name', 'inconnu')}: {str(e)}")
                    continue
    
    return opportunities

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
    
    # Préparer le contenu HTML avec les variables préparées à l'avance
    # pour éviter l'imbrication excessive dans les f-strings
    prompt_length = len(prompt)
    escaped_prompt = prompt.replace('<', '&lt;').replace('>', '&gt;')
    
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
            <p>Taille totale du prompt: {prompt_length} caractères</p>
        </div>
        <h2>Contenu du prompt envoyé à ChatGPT :</h2>
        <pre>{escaped_prompt}</pre>
    </body>
    </html>
    """
    
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    # Créer également un fichier JavaScript pour enregistrer le debug dans localStorage
    js_debug_path = "debug/prompts/debug_data.js"
    with open(js_debug_path, 'w', encoding='utf-8') as f:
        f.write(f"""
// Script de debug généré automatiquement
// Ce fichier est utilisé par l'interface web de debug

// Enregistrer les infos de ce debug
if (window.recordDebugFile) {{
    window.recordDebugFile('{timestamp}', {{
        prompt_length: {prompt_length},
        prompt_path: '{debug_file}',
        html_path: '{html_file}'
    }});
}}
""")
    
    print(f"✅ Pour voir le prompt dans l'interface web, accédez à: debug-prompts.html")
    
    return debug_file, html_file

def generate_portfolios(news_data, markets_data, sectors_data, lists_data, etfs_data, crypto_data=None, themes_data=None):
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
    filtered_etfs, bond_etf_names = filter_etf_data(etfs_data)  # Récupère aussi la liste des noms d'ETF obligataires
    filtered_crypto = filter_crypto_data(crypto_data) if crypto_data else "Aucune donnée de crypto-monnaie disponible"
    # Ajouter le filtrage des tendances thématiques
    filtered_themes = filter_themes_data(themes_data) if themes_data else "Aucune donnée de tendances thématiques disponible"
    
    # Détecter les opportunités sous-évaluées
    undervalued_opportunities = detect_undervalued_opportunities(lists_data, sectors_data, themes_data)
    opportunity_block = "🔍 SIGNAUX D'OPPORTUNITÉS SOUS-ÉVALUÉES:\n" + "\n".join(undervalued_opportunities[:10]) if undervalued_opportunities else "🔍 Aucun actif sous-évalué avec potentiel détecté actuellement."
    
    # Formater la liste des ETF obligataires pour le prompt
    bond_etf_list = "\n".join([f"- {name}" for name in bond_etf_names])
    
    # Ajouter des logs pour déboguer les entrées
    print(f"🔍 Longueur des données FILTRÉES:")
    print(f"  📰 Actualités: {len(filtered_news)} caractères")
    print(f"  📈 Marché: {len(filtered_markets)} caractères")
    print(f"  🏭 Secteurs: {len(filtered_sectors)} caractères")
    print(f"  📋 Listes: {len(filtered_lists)} caractères")
    print(f"  📊 ETFs: {len(filtered_etfs)} caractères")
    print(f"  🪙 Cryptos: {len(filtered_crypto)} caractères")
    print(f"  🔍 Thèmes: {len(filtered_themes)} caractères")
    print(f"  🔎 Opportunités: {len(opportunity_block)} caractères")
    
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
    print("\n----- CRYPTO (données filtrées) -----")
    print(filtered_crypto[:200] + "..." if len(filtered_crypto) > 200 else filtered_crypto)
    print("\n----- THÈMES (données filtrées) -----")
    print(filtered_themes[:200] + "..." if len(filtered_themes) > 200 else filtered_themes)
    print("\n----- OPPORTUNITÉS SOUS-ÉVALUÉES -----")
    print(opportunity_block[:200] + "..." if len(opportunity_block) > 200 else opportunity_block)
    print("\n===========================================")
    
    # Afficher la liste des ETF obligataires trouvés
    print(f"\n📊 ETF obligataires trouvés: {len(bond_etf_names)}")
    for name in bond_etf_names:
        print(f"  - {name}")
    
    # ===== SYSTÈME DE RETRY AVEC BACKOFF EXPONENTIEL =====
    max_retries = 3
    backoff_time = 1  # Commencer avec 1 seconde
    
    # Horodatage pour les fichiers de debug
    debug_timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    
    for attempt in range(max_retries):
        try:
            # Obtenir les exigences minimales pour les portefeuilles
            minimum_requirements = get_portfolio_prompt_additions()
            
            # Construire un prompt avec la whitelist d'ETF obligataires explicite
            prompt = f"""
Tu es un expert en gestion de portefeuille. Tu dois IMPÉRATIVEMENT créer TROIS portefeuilles contenant EXACTEMENT entre 12 et 15 actifs CHACUN.

Utilise ces données filtrées pour générer les portefeuilles :

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

🪙 Crypto-monnaies performantes:
{filtered_crypto}

🔍 Tendances et thèmes actuels:
{filtered_themes}

📈 Opportunités d'actifs sous-évalués:
{opportunity_block}

📅 Contexte : Ces portefeuilles sont optimisés pour le mois de {current_month}.

🛡️ LISTE DES SEULS ETF OBLIGATAIRES AUTORISÉS (TOP BOND ETFs) :
{bond_etf_list}

🎯 INSTRUCTIONS TRÈS PRÉCISES (À RESPECTER ABSOLUMENT) :

1. Tu dois générer trois portefeuilles :
   a) Agressif : EXACTEMENT entre 12 et 15 actifs au total
   b) Modéré : EXACTEMENT entre 12 et 15 actifs au total  
   c) Stable : EXACTEMENT entre 12 et 15 actifs au total

2. Pour les obligations : Tu dois piocher UNIQUEMENT dans la **liste ci-dessus des ETF obligataires autorisés**. Tu ne dois JAMAIS inventer ou utiliser d'autres noms. 

🛡️ RÈGLES DE CATÉGORISATION STRICTES (À RESPECTER IMPÉRATIVEMENT) :

1. Catégorie "ETF" : Utilise UNIQUEMENT les ETF provenant des sections "TOP ETF STANDARDS 2025" et "ETF COURT TERME"
   * N'inclus JAMAIS les ETF obligataires dans cette catégorie

2. Catégorie "Obligations" : Utilise EXCLUSIVEMENT les ETF de la liste suivante:
{bond_etf_list}
   * Ces ETF obligataires doivent UNIQUEMENT apparaître dans la catégorie "Obligations"
   * Ne les place JAMAIS dans la catégorie "ETF"

📌 CONCERNANT LES CRYPTO-MONNAIES :

- Tu peux inclure des crypto-monnaies dans les portefeuilles si elles ont une performance positive sur 7 jours (7D%)
- Les crypto-monnaies sont particulièrement adaptées au portefeuille Agressif, mais peuvent être incluses dans les autres profils avec une allocation plus faible
- Tu dois sélectionner uniquement parmi les crypto-monnaies listées dans la section "Crypto-monnaies performantes"
- N'inclus PAS de crypto-monnaies si aucune ne présente une performance positive sur 7 jours

{minimum_requirements}

3. Pour chaque portefeuille (Agressif, Modéré, Stable), tu dois générer un **commentaire unique** qui suit une structure **top-down** claire et logique.

Le commentaire doit IMPÉRATIVEMENT suivre cette structure :

📰 **Actualités** — Résume objectivement les tendances macroéconomiques ou géopolitiques actuelles (ex. inflation, taux, conflits, croissance).  
📈 **Marchés** — Analyse les performances récentes des marchés régionaux (Europe, US, Amérique Latine...), en insistant sur les mouvements marquants (hausse, baisse, stabilité).  
🏭 **Secteurs** — Détaille les secteurs les plus dynamiques ou les plus en retrait selon les données récentes, sans orientation personnelle.  
📊 **Choix des actifs** — Explique les allocations choisies dans le portefeuille en cohérence avec le profil (Agressif / Modéré / Stable), en s'appuyant uniquement sur les données fournies (ETF, actions, obligations, crypto...).

📌 COHÉRENCE ET LOGIQUE DANS LA CONSTRUCTION DES PORTEFEUILLES :
- Tous les actifs sélectionnés doivent refléter une **analyse rationnelle** basée sur les données fournies.
- Il est strictement interdit de choisir des actifs par défaut, sans lien évident avec les tendances économiques, géographiques ou sectorielles.
- Le commentaire ne doit jamais mentionner un secteur, une région ou une dynamique **qui n'est pas représentée** dans les actifs choisis.
- Chaque portefeuille doit être construit de manière 100% logique à partir des données fournies.
- Les actifs sélectionnés doivent découler directement des performances réelles, secteurs en croissance, régions dynamiques, et tendances de marché analysées dans les données ci-dessus.

⚠️ Règle absolue: chaque actif sélectionné doit être JUSTIFIÉ par AU MOINS **deux sources différentes** parmi:
- 📰 Actualités financières récentes (spécifiques et pertinentes)
- 🏭 Tendance sectorielle identifiée dans l'analyse sectorielle
- 🌍 Dynamique régionale documentée dans les tendances du marché
- 📊 Thème haussier identifié dans les tendances thématiques
- 🔍 Signal d'opportunité sous-évaluée dans la section dédiée

❌ Un actif à forte performance YTD (>30%) **non justifié** par au moins deux des éléments ci-dessus doit être **absolument exclu** du portefeuille.

✅ Un actif à performance modeste peut être **prioritairement inclus** s'il est soutenu par:
- Un secteur ou un thème haussier documenté dans les données
- ET apparaît dans les "Signaux d'opportunités sous-évaluées"
- OU est mentionné positivement dans les actualités récentes

- Ne sélectionne **jamais** un actif uniquement parce qu'il a une **forte performance récente** (ex: YTD élevé). Cela ne garantit **ni la pertinence actuelle, ni la performance future**.
- Inversement, **n'exclus pas automatiquement** un actif ou un secteur en baisse (ex: -8% YTD) : une **reprise sectorielle, une amélioration du contexte macroéconomique, ou des signaux positifs** dans les actualités ou marchés peuvent justifier sa présence.
- Le but est d'**anticiper intelligemment** : un actif faiblement valorisé mais soutenu par **des données cohérentes et des dynamiques récentes** peut offrir **plus de potentiel** qu'un actif déjà en haut du cycle.
- ⚠️ L'IA doit analyser les données de manière **contextuelle et stratégique**, en **croisant toutes les sources** (actualités, marchés, secteurs, performance, ETF filtrés…).
- La sélection doit refléter une **lecture intelligente des tendances en cours ou en formation**, pas une simple extrapolation du passé.

🚫 Tu NE DOIS PAS prioriser un actif simplement en raison de sa performance récente (ex : +80% YTD). 
👉 Cette performance passée n'est PAS un indicateur suffisant. Tu dois d'abord évaluer si :
   - L'actualité valide ou remet en question cette tendance
   - Le secteur ou la région de l'actif est cohérent avec les dynamiques actuelles
   - L'actif n'est pas en phase terminale de cycle haussier sans justification macroéconomique
   Si tu n'as **aucune justification actuelle**, ne sélectionne pas l'actif, même s'il est très performant.

🧩 Chaque actif sélectionné doit résulter d'au moins **deux sources cohérentes** parmi les suivantes :
   - Actualités macroéconomiques ou sectorielles
   - Tendances géographiques du marché
   - Dynamique sectorielle spécifique
   - Indicateurs de performance récents cohérents avec ces éléments
   - Thèmes émergents identifiés dans les données de tendances
   ⚠️ Ne sélectionne **aucun actif** s'il n'est justifié que par sa performance brute.

🔍 Tu dois privilégier les actifs qui présentent des **signaux de potentiel futur cohérents**, même si leur performance passée est modeste, s'ils sont :
   - Alignés avec des tendances émergentes dans les actualités
   - Représentatifs d'un secteur ou d'une région en reprise ou en croissance
   - Soutenus par une dynamique géopolitique, monétaire ou sectorielle
   - En phase avec les thèmes haussiers identifiés dans les données de tendances
   ⚠️ Un actif peut être sous-évalué à court terme mais pertinent dans un contexte stratégique.

❌ Tu ne dois **JAMAIS** utiliser de logique par défaut comme "cet actif est performant donc je l'ajoute".
✅ Chaque choix doit être **contextualisé, stratégique et cohérent avec le profil de risque**.

⚠️ Exemple à NE PAS suivre : "L'action X a pris +90% YTD donc elle est à privilégier".
👉 Mauvais raisonnement. Ce n'est pas une justification valide. La croissance passée ne garantit **aucune** pertinence actuelle ou future.

📝 Dans la section "Choix des actifs" du commentaire, pour CHAQUE actif sélectionné, tu dois explicitement :
   1. Identifier la tendance actuelle ou émergente qui justifie sa sélection
   2. Expliquer pourquoi cet actif est bien positionné pour en bénéficier
   3. Si l'actif a connu une forte performance passée, préciser les facteurs ACTUELS qui pourraient soutenir sa croissance future
   4. Si l'actif a connu une performance modeste, expliquer les catalyseurs potentiels qui justifient son inclusion

✅ Voici la phrase à ajouter dans ton prompt pour **forcer cette logique** :
🧠 **Tu dois justifier chacun des actifs sélectionnés** dans chaque portefeuille (Agressif, Modéré, Stable).
* Pour chaque actif, explique **clairement et de manière concise** pourquoi il a été choisi, en t'appuyant sur **les données fournies** (actualités, marchés, secteurs, ETF, crypto, tendances thématiques, etc.).
* Chaque actif doit avoir une **raison précise et cohérente** d'être inclus, en lien direct avec la stratégie du portefeuille.
* Ces justifications doivent apparaître **dans la section "Choix des actifs"** du commentaire.
* Ne laisse **aucun actif sans justification explicite**.

🎯 Le style doit être fluide, professionnel et synthétique.  
❌ Aucun biais : ne fais pas d'hypothèse sur les classes d'actifs à privilégier. Base-toi uniquement sur les données fournies.  
✅ Le commentaire doit être **adapté au profil de risque** (Agressif / Modéré / Stable) sans forcer une direction (ex: ne dis pas "la techno est à privilégier" sauf si les données le montrent clairement).

📊 Format JSON requis:
{
  "Agressif": {
    "Commentaire": "Texte structuré suivant le format top-down demandé",
    "Actions": {
      "Nom Précis de l'Action 1": "X%",
      "Nom Précis de l'Action 2": "Y%",
      ...etc (jusqu'à avoir entre 12-15 actifs au total)
    },
    "Crypto": { ... },
    "ETF": { ... },
    "Obligations": { ... }
  },
  "Modéré": { ... },
  "Stable": { ... }
}

⚠️ CRITÈRES DE VALIDATION (ABSOLUMENT REQUIS) :
- Chaque portefeuille DOIT contenir EXACTEMENT entre 12 et 15 actifs au total, PAS MOINS, PAS PLUS
- La somme des allocations de chaque portefeuille DOIT être EXACTEMENT 100%
- Minimum 2 classes d'actifs par portefeuille
- Chaque actif doit avoir un nom SPÉCIFIQUE et PRÉCIS, PAS de noms génériques
- Ne réponds qu'avec le JSON, sans commentaire ni explication supplémentaire
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
            
            print("✅ Portefeuilles générés")
            
            # Afficher un résumé des actifs par portefeuille
            for portfolio_type, portfolio in portfolios.items():
                asset_count = sum(len(assets) for cat, assets in portfolio.items() if cat != "Commentaire")
                categories = [cat for cat in portfolio.keys() if cat != "Commentaire"]
                print(f"  📊 {portfolio_type}: {asset_count} actifs, {len(categories)} catégories")
            
            return portfolios
        
        except Exception as e:
            print(f"❌ Erreur lors de la tentative {attempt+1}: {str(e)}")
            
            if attempt < max_retries - 1:
                sleep_time = backoff_time + random.uniform(0, 1)
                print(f"⏳ Nouvelle tentative dans {sleep_time:.2f} secondes...")
                time.sleep(sleep_time)
                backoff_time *= 2  # Double le temps d'attente pour la prochaine tentative
            else:
                print("❌ Échec après plusieurs tentatives")
                raise

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
                if category != "Commentaire":  # Ne pas compter le commentaire comme une catégorie d'actifs
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
    crypto_data = load_json_data('data/crypto_lists.json')
    # Ajouter le chargement des tendances thématiques
    themes_data = load_json_data('data/themes.json')
    
    print("🧠 Génération des portefeuilles optimisés...")
    portfolios = generate_portfolios(news_data, markets_data, sectors_data, lists_data, etfs_data, crypto_data, themes_data)
    
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