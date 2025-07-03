import os
import json
import requests
import datetime
import locale
import time
import random
import re
# Importer les fonctions d'ajustement des portefeuilles
from portfolio_adjuster import check_portfolio_constraints, adjust_portfolios, get_portfolio_prompt_additions, valid_etfs_cache, valid_bonds_cache
# Importer la fonction de formatage du brief
from brief_formatter import format_brief_data

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
    """Filtre les actifs avec YTD entre -5% et 120%, et Daily > -10% depuis lists.json,
    puis sélectionne les 5 meilleurs par secteur et par pays."""
    if not lists_data or not isinstance(lists_data, dict):
        return "Aucune liste d'actifs disponible"
    
    # Dictionnaires pour regrouper les actifs par secteur et par pays
    assets_by_sector = {}
    assets_by_country = {}  # Pour regroupement par pays
    
    # Parcourir toutes les listes d'actifs
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
                daily = asset.get("change", "")  # Variation journalière
                sector = asset.get("sector", "Non classé")  # "Non classé" si pas de secteur
                country = asset.get("country", "Non précisé")  # "Non précisé" si pas de pays

                # Nettoyage et conversion
                try:
                    ytd_value = float(re.sub(r"[^\d\.-]", "", str(ytd).replace(",", ".")))
                    daily_value = float(re.sub(r"[^\d\.-]", "", str(daily).replace(",", ".")))
                except (ValueError, AttributeError):
                    continue

                # Filtre : YTD entre -5% et 120%, et Daily > -10%
                if -5 <= ytd_value <= 120 and daily_value > -10:
                    # Ajouter des tags pour les actifs potentiellement intéressants
                    display_name = name
                    if ytd_value > 50 and daily_value < 0:
                        display_name = f"🚩 {name} (potentielle surévaluation)"
                    elif ytd_value > 10 and daily_value < -5:
                        display_name = f"📉 {name} (forte baisse récente mais secteur haussier)"
                    
                    # Créer l'entrée pour cet actif
                    asset_entry = {
                        "name": display_name,
                        "ytd": ytd_value,
                        "daily": daily_value,
                        "sector": sector,
                        "country": country,
                        "original_name": name  # Conserver le nom original pour référence
                    }
                    
                    # Ajouter au dictionnaire sectoriel
                    if sector not in assets_by_sector:
                        assets_by_sector[sector] = []
                    assets_by_sector[sector].append(asset_entry)
                    
                    # Ajouter au dictionnaire par pays
                    if country not in assets_by_country:
                        assets_by_country[country] = []
                    assets_by_country[country].append(asset_entry)

    # Résumé textuel organisé par secteur
    summary_lines = ["📋 TOP 5 ACTIFS PAR SECTEUR (YTD -5% à 120% et Daily > -10%) :"]
    
    # Trier les secteurs par ordre alphabétique pour une présentation cohérente
    sorted_sectors = sorted(assets_by_sector.keys())
    
    for sector in sorted_sectors:
        sector_assets = assets_by_sector[sector]
        
        # Si le secteur n'a pas d'actifs qui correspondent aux critères, on saute
        if not sector_assets:
            continue
        
        # Trier les actifs du secteur par YTD décroissant
        sector_assets.sort(key=lambda x: x["ytd"], reverse=True)
        
        # Sélectionner uniquement les 5 meilleurs
        top_5_assets = sector_assets[:5]
        
        # Ajouter l'en-tête du secteur
        summary_lines.append(f"\n🏭 SECTEUR: {sector.upper()} ({len(top_5_assets)} actifs)")
        
        # Ajouter chaque actif du top 5
        for asset in top_5_assets:
            # Construire la ligne de description avec les informations disponibles
            country_info = f" | Pays: {asset['country']}" if asset['country'] else ""
            
            summary_lines.append(
                f"• {asset['name']}: YTD {asset['ytd']:.2f}%, Daily {asset['daily']:.2f}%{country_info}"
            )
    
    # Ajouter un compteur global pour les secteurs
    total_filtered_assets_sectors = sum(len(assets_by_sector[sector][:5]) for sector in sorted_sectors if assets_by_sector[sector])
    summary_lines.insert(1, f"Total: {total_filtered_assets_sectors} actifs répartis dans {len(sorted_sectors)} secteurs")
    
    # Ajouter le résumé par pays
    summary_lines.append("\n🌍 TOP 5 ACTIFS PAR PAYS (YTD -5% à 120% et Daily > -10%) :")
    
    # Trier les pays par ordre alphabétique
    sorted_countries = sorted(assets_by_country.keys())
    
    # Ajouter un compteur global pour les pays
    total_filtered_assets_countries = sum(len(assets_by_country[country][:5]) for country in sorted_countries if assets_by_country[country])
    summary_lines.append(f"Total: {total_filtered_assets_countries} actifs répartis dans {len(sorted_countries)} pays")
    
    for country in sorted_countries:
        country_assets = assets_by_country[country]
        
        # Si le pays n'a pas d'actifs qui correspondent aux critères, on saute
        if not country_assets:
            continue
        
        # Trier les actifs du pays par YTD décroissant
        country_assets.sort(key=lambda x: x["ytd"], reverse=True)
        
        # Sélectionner uniquement les 5 meilleurs
        top_5_assets = country_assets[:5]
        
        # Ajouter l'en-tête du pays
        summary_lines.append(f"\n📌 PAYS: {country.upper()} ({len(top_5_assets)} actifs)")
        
        # Ajouter chaque actif du top 5
        for asset in top_5_assets:
            # Construire la ligne de description avec les informations sectorielles
            sector_info = f" | Secteur: {asset['sector']}" if asset['sector'] else ""
            
            summary_lines.append(
                f"• {asset['name']}: YTD {asset['ytd']:.2f}%, Daily {asset['daily']:.2f}%{sector_info}"
            )
    
    return "\n".join(summary_lines) if assets_by_sector else "Aucune donnée d'actifs significative"

def filter_etf_data(etfs_data):
    """Filtre les ETF par catégories."""
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
    """Retourne toutes les cryptos où 7j > 24h > 0, ou à défaut 24h > 0 et 7j > -5"""
    if not crypto_data or not isinstance(crypto_data, dict):
        return "Aucune donnée de crypto-monnaie disponible"
    
    print("🔍 Débogage du filtre crypto: Analyse des données d'entrée")
    main = crypto_data.get('categories', {}).get('main', [])
    print(f"   Nombre de cryptos trouvées: {len(main)}")
    
    cryptos = []

    for i, crypto in enumerate(main):
        try:
            name = crypto.get('name', '')
            symbol = crypto.get('symbol', '')
            price = crypto.get('price', '')
            
            # Extraction sécurisée des valeurs de pourcentage
            c24h_raw = crypto.get('change_24h', '0%')
            c7d_raw = crypto.get('change_7d', '0%')
            
            # Simplification extrême de la conversion - enlever tout sauf les chiffres et le point/tiret
            c24_str = re.sub(r'[^0-9.\-]', '', str(c24h_raw))
            c7_str = re.sub(r'[^0-9.\-]', '', str(c7d_raw))
            
            # Conversion en float
            c24 = float(c24_str or 0)
            c7 = float(c7_str or 0)
            
            # Débogage détaillé pour les premières entrées
            if i < 5:
                print(f"   {name} ({symbol}) | 24h brut: {c24h_raw}, 7j brut: {c7d_raw}")
                print(f"   → Converti: 24h = {c24}, 7j = {c7}")
                print(f"   → Condition 'c7 > c24 > 0': {c7 > c24 > 0}")
            
            # Vérification de la condition principale avec log explicite
            if c7 > c24 > 0:
                cryptos.append((name, symbol, price, c24, c7))
                print(f"   ✅ {name} PASSE le filtre ! 7j: {c7} > 24h: {c24} > 0")
            else:
                if i < 5:
                    print(f"   ❌ {name} ne passe pas: 7j = {c7}, 24h = {c24}")
                
        except Exception as e:
            if i < 5:
                print(f"   ⚠️ ERREUR pour {crypto.get('name', 'inconnu')}: {str(e)}")
            continue

    # Fallback si aucun résultat strict
    alt_cryptos = []
    if not cryptos:
        print("⚠️ Aucune crypto ne respecte 7j > 24h > 0 → Fallback: 24h > 0 et 7j > -5")
        for crypto in main:
            try:
                name = crypto.get('name', '')
                symbol = crypto.get('symbol', '')
                price = crypto.get('price', '')
                
                # Extraction et conversion simplifiée
                c24h_raw = crypto.get('change_24h', '0%')
                c7d_raw = crypto.get('change_7d', '0%')
                
                c24_str = re.sub(r'[^0-9.\-]', '', str(c24h_raw))
                c7_str = re.sub(r'[^0-9.\-]', '', str(c7d_raw))
                
                c24 = float(c24_str or 0)
                c7 = float(c7_str or 0)
                
                # Critères alternatifs avec log
                if c24 > 0 and c7 > -5:
                    alt_cryptos.append((name, symbol, price, c24, c7))
                    print(f"   ✅ FALLBACK: {name} (24h = {c24} > 0, 7j = {c7} > -5)")
            except Exception:
                continue
        
        if alt_cryptos:
            cryptos = alt_cryptos
            criteria_desc = "24h > 0 ET 7j > -5%"
        else:
            criteria_desc = "aucun critère satisfait"
    else:
        criteria_desc = "7j > 24h > 0%"

    if not cryptos:
        return "Aucune crypto ne respecte les critères de tendance positive stable"

    # Générer le résumé
    summary = [f"🪙 CRYPTOS AVEC TENDANCE POSITIVE ({criteria_desc}) :"]
    summary.append(f"Total: {len(cryptos)} cryptos")

    for name, symbol, price, c24, c7 in cryptos:
        stability = c7/c24 if c24 != 0 else 0
        stability_txt = f"| Stabilité: {stability:.1f}x" if criteria_desc == "7j > 24h > 0%" else ""
        sign_24 = "+" if c24 > 0 else ""
        sign_7 = "+" if c7 > 0 else ""
        summary.append(f"• {name} ({symbol}): 24h: {sign_24}{c24:.2f}%, 7j: {sign_7}{c7:.2f}% {stability_txt} | Prix: {price}")

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

def generate_portfolios(news_data, markets_data, sectors_data, lists_data, etfs_data, crypto_data=None, themes_data=None, brief_data=None):
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
    # Traiter le résumé d'actualités complet
    filtered_brief = format_brief_data(brief_data) if brief_data else "Aucun résumé d'actualités complet disponible"
    
    # Formater la liste des ETF obligataires pour le prompt
    bond_etf_list = "\n".join([f"- {name}" for name in bond_etf_names])
    
    # Ajouter des logs pour déboguer les entrées
    print(f"🔍 Longueur des données FILTRÉES:")
    print(f"  📰 Actualités: {len(filtered_news)} caractères")
    print(f"  📜 Résumé d'actualités complet: {len(filtered_brief)} caractères")
    print(f"  📈 Marché: {len(filtered_markets)} caractères")
    print(f"  🏭 Secteurs: {len(filtered_sectors)} caractères")
    print(f"  📋 Listes: {len(filtered_lists)} caractères")
    print(f"  📊 ETFs: {len(filtered_etfs)} caractères")
    print(f"  🪙 Cryptos: {len(filtered_crypto)} caractères")
    print(f"  🔍 Thèmes: {len(filtered_themes)} caractères")
    
    # Afficher les données filtrées pour vérification
    print("\n===== APERÇU DES DONNÉES FILTRÉES =====")
    print("\n----- ACTUALITÉS (données filtrées) -----")
    print(filtered_news[:200] + "..." if len(filtered_news) > 200 else filtered_news)
    print("\n----- RÉSUMÉ D'ACTUALITÉS COMPLET (données filtrées) -----")
    print(filtered_brief[:200] + "..." if len(filtered_brief) > 200 else filtered_brief)
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

📜 RÉSUMÉ COMPLET DE L'ACTUALITÉ FINANCIÈRE: 
{filtered_brief}

📌 **INSTRUCTION MAJEURE : PRIORISATION DU BRIEF STRATÉGIQUE**
Le document stratégique ci-dessus (brief_ia.json) est ta source d'information prioritaire. Il reflète les anticipations économiques, géopolitiques et sectorielles les plus récentes et les plus fiables.

✅ Chaque actif sélectionné doit obligatoirement répondre à au moins une de ces conditions :
- Être en ligne avec un scénario ou une conviction macro du brief
- Refléter une stratégie sectorielle ou géographique justifiée dans le brief
- S'inscrire dans une logique de prudence, d'anticipation ou d'opportunité signalée dans le brief

🚫 Tu NE DOIS PAS inclure un actif si :
- Il est en contradiction avec le scénario central (ex: récession ➝ ne pas inclure de cyclique spéculatif sans raison)
- Sa seule justification est sa performance récente (ex: +80% YTD)

💡 Tu peux mentionner explicitement dans tes commentaires :
> "Cet actif est aligné avec la conviction X du brief stratégique"
> "Cet ETF répond à la logique de repli obligataire indiquée dans le scénario de récession"

🎯 Ton objectif est de construire des portefeuilles qui incarnent les convictions du brief tout en restant diversifiés, logiques, et adaptés aux profils de risque (Agressif / Modéré / Stable).

⚠️ **AMÉLIORATIONS CRITIQUES D'ALIGNEMENT AVEC LE BRIEF** :
1️⃣ **Références explicites obligatoires :**
   Pour chaque actif sélectionné, indique explicitement s'il est aligné avec le brief stratégique, et avec quelle conviction (ex: récession, hausse budget défense, stabilisation des taux, etc.).

2️⃣ **Restriction des actifs contradictoires :**
   Ne sélectionne aucun actif cyclique ou spéculatif à moins qu'il soit justifié par une dynamique macro du brief ou un thème identifié (ex : résilience de la Chine ou des pays émergents dans le scénario 2).

3️⃣ **Justifications précises et détaillées :**
   La section "Choix des actifs" doit justifier chaque actif avec :
   - lien explicite avec le brief (citer scénario ou conviction précise)
   - logique sectorielle ou géographique alignée avec le brief
   - ET potentiel futur (pas uniquement performance passée)

🔺 **Attention aux performances trompeuses**
Certains actifs affichent des **performances YTD spectaculaires**, mais sont **déjà en fin de cycle** ou exposés à des **risques récents majeurs** :
* Exemples : **Rheinmetall** (+80% YTD) qui chute suite à un changement dans la politique étrangère américaine ; ou un ETF tech US qui baisse malgré un bon YTD, car les taux longs remontent brutalement.
👉 Tu dois **impérativement croiser** :
* **Les performances passées (YTD, 1M, 1D)** **AVEC**
* **Les signaux actuels** (actualités, tendances macro, dynamique sectorielle, signaux faibles)
🧠 Objectif : détecter si la performance est encore **pertinente et soutenable**, ou si elle est **artificielle et risquée**.
**Règle :** *N'intègre jamais un actif **juste** parce qu'il a +X% YTD.*
Tu dois vérifier :
* Est-ce que des signaux **récents** confirment cette tendance ?
* Ou au contraire, y a-t-il un **risque de retournement** non encore reflété dans les prix ?

🧩 **Favorise la résilience sectorielle (vs performance passée)**
Ne privilégie pas les secteurs **seulement** parce qu'ils ont performé récemment. Tu dois identifier ceux qui **tiennent dans la tempête actuelle**, même si leur performance récente est modeste.
🎯 Cherche des **signes de résilience ou de reprise structurelle** :
* Secteurs défensifs (santé, utilities, consommation de base)
* Secteurs résilients à l'inflation ou aux hausses de taux
* Zones géographiques stables ou en rebond macro (Amérique Latine, Asie émergente…)
🔍 Exemple :
Un secteur comme la santé peut avoir un YTD neutre, mais bénéficier d'un regain d'intérêt en période d'instabilité géopolitique ou de repli économique.
🧠 Inclure ces secteurs **montre une logique de préservation et d'anticipation**, pas seulement de performance.

📉 **Sur-réaction du marché = opportunité ?**
Un actif ou un secteur peut baisser fortement à court terme, **non pas à cause de ses fondamentaux**, mais à cause d'un **excès de peur** ou d'une réaction irrationnelle du marché.
🧠 Tu dois détecter ces cas et les traiter intelligemment :
Si un actif baisse de -6% en 1 jour, mais que :
* Le secteur est en croissance
* L'actualité ne remet pas en cause ses fondamentaux
* Le thème est haussier (ex : énergie verte, digitalisation)
👉 Tu peux l'inclure, **à condition de justifier clairement** qu'il s'agit d'un **retournement technique temporaire** ou d'une **opportunité liée à une exagération du marché.**
🚫 Inversement, si la baisse est liée à un vrai changement de paradigme (ex : sanctions économiques, changement de politique budgétaire), il faut **exclure** cet actif même s'il est encore bien classé YTD.

🧠 **Checklist mentale à appliquer avant de sélectionner un actif**
Pour chaque actif sélectionné, **pose-toi ces 4 questions**. Si une seule réponse est négative, **exclue ou justifie fortement** :
1. **Tendance actuelle :** L'actif est-il aligné avec une **tendance macroéconomique, géopolitique ou sectorielle récente** ?
2. **Contexte sectoriel :** Le **secteur ou la région** montre-t-il une **stabilité, une croissance ou un retournement anticipé** ?
3. **Performance soutenable :** La performance passée est-elle **confirmée** par des **signaux récents positifs** ? Ou bien est-ce un pic isolé ?
4. **Signal d'alerte ou opportunité ?** Une récente baisse ou volatilité est-elle :
   * 🟥 un **signal de danger** ? (→ exclure)
   * 🟩 ou une **opportunité technique ou structurelle** ? (→ justifier avec données macro/thème)

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
📊 **Choix des actifs** — Explique les allocations choisies dans le portefeuille en cohérence avec le profil (Agressif / Modéré / Stable), en s'appuyant uniquement sur les données fournies (ETF, actions, obligations, crypto...). Pour chaque actif, cite OBLIGATOIREMENT le lien avec le brief stratégique.

📌 COHÉRENCE ET LOGIQUE DANS LA CONSTRUCTION DES PORTEFEUILLES :
- Tous les actifs sélectionnés doivent refléter une **analyse rationnelle** basée sur les données fournies.
- Il est strictement interdit de choisir des actifs par défaut, sans lien évident avec les tendances économiques, géographiques ou sectorielles.
- Le commentaire ne doit jamais mentionner un secteur, une région ou une dynamique **qui n'est pas représentée** dans les actifs choisis.
- Chaque portefeuille doit être construit de manière 100% logique à partir des données fournies.
- Les actifs sélectionnés doivent découler directement des performances réelles, secteurs en croissance, régions dynamiques, et tendances de marché analysées dans les données ci-dessus.

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

📝 Pour chaque portefeuille généré, tu dois également fournir une brève liste "ActifsExclus" avec 2-3 actifs que tu as délibérément écartés malgré leur forte performance YTD, en expliquant pourquoi (ex: "Rheinmetall: +80% YTD mais risque de correction suite aux annonces de politique étrangère américaine").

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
{{
  "Agressif": {{
    "Commentaire": "Texte structuré suivant le format top-down demandé",
    "Actions": {{
      "Nom Précis de l'Action 1": "X%",
      "Nom Précis de l'Action 2": "Y%",
      ...etc (jusqu'à avoir entre 12-15 actifs au total)
    }},
    "Crypto": {{ ... }},
    "ETF": {{ ... }},
    "Obligations": {{ ... }},
    "ActifsExclus": [
      "Nom de l'actif exclu 1: Raison de l'exclusion",
      "Nom de l'actif exclu 2: Raison de l'exclusion"
    ]
  }},
  "Modéré": {{ ... }},
  "Stable": {{ ... }}
}}

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
                "model": "gpt-o3",  # 👈 ICI
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3           # 👈 Température réduite
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
                asset_count = sum(len(assets) for cat, assets in portfolio.items() if cat != "Commentaire" and cat != "ActifsExclus")
                categories = [cat for cat in portfolio.keys() if cat != "Commentaire" and cat != "ActifsExclus"]
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
                if category != "Commentaire" and category != "ActifsExclus":  # Ne pas compter le commentaire comme une catégorie d'actifs
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
    
    # Essayer de charger le résumé d'actualités complet depuis différents emplacements possibles
    brief_data = None
    brief_paths = ['brief_ia.json', './brief_ia.json', 'data/brief_ia.json']
    
    for path in brief_paths:
        try:
            with open(path, 'r', encoding='utf-8') as file:
                brief_data = json.load(file)
                print(f"✅ Résumé d'actualités chargé avec succès depuis {path}")
                break
        except Exception as e:
            print(f"⚠️ Impossible de charger {path}: {str(e)}")
    
    if brief_data is None:
        print("⚠️ Aucun fichier brief_ia.json trouvé parmi les chemins testés")
    
    print("🧠 Génération des portefeuilles optimisés...")
    portfolios = generate_portfolios(news_data, markets_data, sectors_data, lists_data, etfs_data, crypto_data, themes_data, brief_data)
    
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
