#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de récupération des données ETF depuis Boursorama et JustETF
Ce script génère les fichiers JSON pour la page ETF de TradePulse
"""

import os
import json
import re
import time
from datetime import datetime
import pytz
import requests
from bs4 import BeautifulSoup
import pandas as pd

# Configuration
OUTPUT_DIR = "data"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
}

# URLs
BOURSORAMA_ETF_URL = "https://www.boursorama.com/bourse/trackers/"
JUSTETF_WORLD_URL = "https://www.justetf.com/en/etf-screener.html"
JUSTETF_US_URL = "https://www.justetf.com/us/etf-screener.html"
JUSTETF_EU_URL = "https://www.justetf.com/en/etf-screener.html?groupField=index&sortField=fundSize&sortOrder=desc&distributionPolicy=distributionPolicy-accumulating&distributionPolicy=distributionPolicy-distributing&baseIndex=extended--region--Europe"
JUSTETF_TOP50_URL = "https://www.justetf.com/fr/market-overview/the-best-etfs.html"
JUSTETF_TOP_BONDS_URL = "https://www.justetf.com/fr/market-overview/the-best-bond-etfs.html"

def fetch_page(url, params=None, retries=3):
    """Récupère une page web avec gestion des erreurs et des tentatives"""
    for attempt in range(retries):
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            print(f"Tentative {attempt+1}/{retries} échouée: {e}")
            if attempt == retries - 1:
                raise
            time.sleep(5)

def get_current_time():
    """Renvoie l'horodatage actuel au format ISO avec fuseau horaire Europe/Paris"""
    paris_tz = pytz.timezone('Europe/Paris')
    return datetime.now(paris_tz).isoformat()

def init_data_structure():
    """Crée la structure de données initiale pour les fichiers JSON"""
    alphabet = "abcdefghijklmnopqrstuvwxyz"
    indices = {letter: [] for letter in alphabet}
    
    return {
        "indices": indices,
        "top_performers": {
            "daily": {
                "best": [],
                "worst": []
            },
            "ytd": {
                "best": [],
                "worst": []
            }
        },
        "top50_etfs": [],
        "top_bond_etfs": [],
        "meta": {
            "count": 0,
            "timestamp": get_current_time(),
            "source": "Boursorama/JustETF"
        }
    }

def scrape_boursorama_etfs():
    """Extrait les données ETF depuis Boursorama"""
    print("Récupération des données ETF depuis Boursorama...")
    
    try:
        html = fetch_page(BOURSORAMA_ETF_URL)
        soup = BeautifulSoup(html, 'lxml')
        
        # Extraction des tableaux d'ETF
        etf_tables = soup.select('.c-table')
        
        etfs = []
        for table in etf_tables:
            rows = table.select('tbody tr')
            for row in rows:
                cells = row.select('td')
                if len(cells) >= 6:
                    try:
                        name = cells[0].get_text(strip=True)
                        last_price = cells[1].get_text(strip=True)
                        change = cells[2].get_text(strip=True)
                        if change and not change.startswith('+') and not change.startswith('-'):
                            change = f"+{change}" if float(change.replace(',', '.').replace('%', '')) > 0 else change
                        
                        # Identifier la catégorie (approximative) basée sur le nom
                        category = "Actions"
                        if any(kw in name.lower() for kw in ["bond", "oblig", "govies", "treasury", "gilt", "bund"]):
                            category = "Obligations"
                        elif any(kw in name.lower() for kw in ["gold", "silver", "metal", "commodit", "oil", "gas", "energy"]):
                            category = "Matières premières"
                        elif any(kw in name.lower() for kw in ["multi", "divers", "alloc"]):
                            category = "Multi-actifs"
                        
                        # Identifier l'émetteur
                        provider = "Autres"
                        known_providers = {
                            "ishares": "iShares",
                            "lyxor": "Lyxor",
                            "amundi": "Amundi",
                            "bnp": "BNP Paribas",
                            "vanguard": "Vanguard",
                            "spdr": "SPDR",
                            "invesco": "Invesco",
                            "wisdomtree": "WisdomTree",
                            "xtrackers": "Xtrackers",
                            "ossiam": "Ossiam",
                            "vaneck": "VanEck"
                        }
                        
                        for key, value in known_providers.items():
                            if key in name.lower():
                                provider = value
                                break
                        
                        etf = {
                            "name": name,
                            "last": last_price,
                            "change": change,
                            "category": category,
                            "provider": provider,
                            # Valeurs par défaut pour les autres champs
                            "ytd": "n/a",
                            "assets": "n/a",
                            "ratio": "n/a"
                        }
                        etfs.append(etf)
                    except (ValueError, IndexError) as e:
                        print(f"Erreur lors de l'extraction d'un ETF: {e}")
        
        return etfs
    except Exception as e:
        print(f"Erreur lors de la récupération des ETF Boursorama: {e}")
        return []

def scrape_justetf_etfs(url, market="world"):
    """Extrait les données ETF depuis JustETF pour un marché spécifique"""
    print(f"Récupération des données ETF depuis JustETF ({market})...")
    
    try:
        html = fetch_page(url)
        soup = BeautifulSoup(html, 'lxml')
        
        # Extraction du tableau d'ETF
        etf_table = soup.select_one('#etf-screener table')
        if not etf_table:
            return []
            
        etfs = []
        rows = etf_table.select('tbody tr')
        for row in rows:
            try:
                cells = row.select('td')
                if len(cells) >= 7:
                    name = cells[0].get_text(strip=True)
                    
                    # Extraction de l'émetteur (peut être affiché séparément sur JustETF)
                    provider_elem = cells[0].select_one('.provider')
                    provider = provider_elem.get_text(strip=True) if provider_elem else "Autres"
                    
                    # Nettoyage du nom en enlevant l'émetteur si présent
                    if provider_elem:
                        name = name.replace(provider, "").strip()
                    
                    # Extraire la catégorie
                    category_elem = cells[1] if len(cells) > 1 else None
                    category = category_elem.get_text(strip=True) if category_elem else "Actions"
                    
                    # Extraire le cours actuel
                    price_elem = cells[4] if len(cells) > 4 else None
                    last_price = price_elem.get_text(strip=True) if price_elem else "n/a"
                    
                    # Extraire la variation
                    change_elem = cells[5] if len(cells) > 5 else None
                    change = change_elem.get_text(strip=True) if change_elem else "0,00%"
                    if change and not change.startswith('+') and not change.startswith('-'):
                        change = f"+{change}" if float(change.replace(',', '.').replace('%', '')) > 0 else change
                    
                    # Extraire la variation YTD
                    ytd_elem = cells[6] if len(cells) > 6 else None
                    ytd = ytd_elem.get_text(strip=True) if ytd_elem else "0,00%"
                    if ytd and not ytd.startswith('+') and not ytd.startswith('-'):
                        ytd = f"+{ytd}" if float(ytd.replace(',', '.').replace('%', '')) > 0 else ytd
                    
                    # Extraire les actifs sous gestion
                    assets_elem = cells[8] if len(cells) > 8 else None
                    assets = assets_elem.get_text(strip=True) if assets_elem else "n/a"
                    
                    # Extraire le ratio de frais
                    ter_elem = cells[9] if len(cells) > 9 else None
                    ratio = ter_elem.get_text(strip=True) if ter_elem else "n/a"
                    
                    etf = {
                        "name": name,
                        "provider": provider,
                        "category": category,
                        "last": last_price,
                        "change": change,
                        "ytd": ytd,
                        "assets": assets,
                        "ratio": ratio
                    }
                    etfs.append(etf)
            except (ValueError, IndexError) as e:
                print(f"Erreur lors de l'extraction d'un ETF de JustETF: {e}")
        
        return etfs
    except Exception as e:
        print(f"Erreur lors de la récupération des ETF JustETF ({market}): {e}")
        return []

def scrape_top50_etfs():
    """Extrait les données des TOP 50 ETF depuis JustETF"""
    print("Récupération des TOP 50 ETF depuis JustETF...")
    
    try:
        html = fetch_page(JUSTETF_TOP50_URL)
        soup = BeautifulSoup(html, 'lxml')
        
        # Extraction du tableau des TOP 50 ETF
        etf_table = soup.select_one('.etf-rank-table')
        if not etf_table:
            return []
            
        top_etfs = []
        rows = etf_table.select('tbody tr')
        for row in rows:
            try:
                cells = row.select('td')
                if len(cells) >= 8:
                    # Extraire le focus sur l'investissement/indice
                    focus_elem = cells[0] if len(cells) > 0 else None
                    focus_text = focus_elem.get_text(strip=True) if focus_elem else ""
                    
                    # Extraire le nom de l'ETF
                    name_elem = focus_elem.select_one('a') if focus_elem else None
                    name = name_elem.get_text(strip=True) if name_elem else "ETF Inconnu"
                    
                    # Extraire la variation en 2025 (YTD)
                    ytd_elem = cells[4] if len(cells) > 4 else None
                    ytd = ytd_elem.get_text(strip=True) if ytd_elem else "0,00%"
                    
                    # Extraire la variation sur 1 mois
                    one_month_elem = cells[5] if len(cells) > 5 else None
                    one_month = one_month_elem.get_text(strip=True) if one_month_elem else "0,00%"
                    
                    # Extraire la variation sur 3 mois
                    three_month_elem = cells[6] if len(cells) > 6 else None
                    three_month = three_month_elem.get_text(strip=True) if three_month_elem else "0,00%"
                    
                    # Extraire la variation sur 1 an
                    one_year_elem = cells[7] if len(cells) > 7 else None
                    one_year = one_year_elem.get_text(strip=True) if one_year_elem else "0,00%"
                    
                    # Extraire la variation sur 3 ans
                    three_year_elem = cells[8] if len(cells) > 8 else None
                    three_year = three_year_elem.get_text(strip=True) if three_year_elem else "0,00%"
                    
                    # Extraire le nombre d'ETF associés
                    num_etfs_elem = cells[9] if len(cells) > 9 else None
                    num_etfs = num_etfs_elem.get_text(strip=True) if num_etfs_elem else "1"
                    
                    top_etf = {
                        "name": name,
                        "focus": focus_text,
                        "ytd": ytd,
                        "one_month": one_month,
                        "three_month": three_month,
                        "one_year": one_year,
                        "three_year": three_year,
                        "num_etfs": num_etfs
                    }
                    top_etfs.append(top_etf)
            except (ValueError, IndexError) as e:
                print(f"Erreur lors de l'extraction d'un TOP ETF: {e}")
        
        return top_etfs
    except Exception as e:
        print(f"Erreur lors de la récupération des TOP 50 ETF: {e}")
        return []

def scrape_top_bond_etfs():
    """Extrait les données des meilleurs ETF d'obligations depuis JustETF"""
    print("Récupération des meilleurs ETF d'obligations depuis JustETF...")
    
    try:
        html = fetch_page(JUSTETF_TOP_BONDS_URL)
        soup = BeautifulSoup(html, 'lxml')
        
        # Extraction du tableau des meilleurs ETF d'obligations
        etf_table = soup.select_one('.etf-rank-table')
        if not etf_table:
            return []
            
        top_bond_etfs = []
        rows = etf_table.select('tbody tr')
        for row in rows:
            try:
                cells = row.select('td')
                if len(cells) >= 8:
                    # Extraire le focus sur l'investissement/indice
                    focus_elem = cells[0] if len(cells) > 0 else None
                    focus_text = focus_elem.get_text(strip=True) if focus_elem else ""
                    
                    # Extraire le nom de l'ETF
                    name_elem = focus_elem.select_one('a') if focus_elem else None
                    name = name_elem.get_text(strip=True) if name_elem else "ETF Obligations Inconnu"
                    
                    # Extraire la variation en 2025 (YTD)
                    ytd_elem = cells[4] if len(cells) > 4 else None
                    ytd = ytd_elem.get_text(strip=True) if ytd_elem else "0,00%"
                    
                    # Extraire la variation sur 1 mois
                    one_month_elem = cells[5] if len(cells) > 5 else None
                    one_month = one_month_elem.get_text(strip=True) if one_month_elem else "0,00%"
                    
                    # Extraire la variation sur 3 mois
                    three_month_elem = cells[6] if len(cells) > 6 else None
                    three_month = three_month_elem.get_text(strip=True) if three_month_elem else "0,00%"
                    
                    # Extraire la variation sur 1 an
                    one_year_elem = cells[7] if len(cells) > 7 else None
                    one_year = one_year_elem.get_text(strip=True) if one_year_elem else "0,00%"
                    
                    # Extraire la variation sur 3 ans
                    three_year_elem = cells[8] if len(cells) > 8 else None
                    three_year = three_year_elem.get_text(strip=True) if three_year_elem else "0,00%"
                    
                    # Extraire le nombre d'ETF associés
                    num_etfs_elem = cells[9] if len(cells) > 9 else None
                    num_etfs = num_etfs_elem.get_text(strip=True) if num_etfs_elem else "1"
                    
                    top_bond_etf = {
                        "name": name,
                        "focus": focus_text,
                        "ytd": ytd,
                        "one_month": one_month,
                        "three_month": three_month,
                        "one_year": one_year,
                        "three_year": three_year,
                        "num_etfs": num_etfs
                    }
                    top_bond_etfs.append(top_bond_etf)
            except (ValueError, IndexError) as e:
                print(f"Erreur lors de l'extraction d'un TOP ETF d'obligations: {e}")
        
        return top_bond_etfs
    except Exception as e:
        print(f"Erreur lors de la récupération des meilleurs ETF d'obligations: {e}")
        return []

def merge_etf_data(boursorama_etfs, justetf_etfs):
    """Fusionne et déduplique les données d'ETF de différentes sources"""
    etf_by_name = {}
    
    # Ajouter les ETF de Boursorama
    for etf in boursorama_etfs:
        name = etf["name"].lower()
        etf_by_name[name] = etf
    
    # Ajouter ou mettre à jour avec les ETF de JustETF
    for etf in justetf_etfs:
        name = etf["name"].lower()
        if name in etf_by_name:
            # Mettre à jour les champs manquants
            for key, value in etf.items():
                if value != "n/a" and etf_by_name[name].get(key) == "n/a":
                    etf_by_name[name][key] = value
        else:
            etf_by_name[name] = etf
    
    return list(etf_by_name.values())

def organize_by_letter(etfs):
    """Organise les ETF par lettre initiale"""
    result = {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"}
    
    for etf in etfs:
        name = etf["name"]
        if name:
            first_letter = name[0].lower()
            if first_letter.isalpha() and first_letter in result:
                result[first_letter].append(etf)
            elif first_letter.isdigit():
                # Les ETF commençant par un chiffre seront placés dans la lettre 'n' (numbers)
                result['n'].append(etf)
    
    return result

def get_top_performers(etfs, count=3):
    """Identifie les meilleurs et pires performers"""
    top_performers = {
        "daily": {"best": [], "worst": []},
        "ytd": {"best": [], "worst": []}
    }
    
    # Liste temporaire pour le tri
    daily_changes = []
    ytd_changes = []
    
    for etf in etfs:
        # Pour les variations quotidiennes
        change_str = etf.get("change", "0,00%")
        if change_str != "n/a":
            try:
                change_val = float(change_str.replace(',', '.').replace('%', '').replace('+', ''))
                daily_changes.append((change_val, {
                    "name": etf["name"],
                    "symbol": etf.get("provider", ""),
                    "change": change_str
                }))
            except ValueError:
                pass
        
        # Pour les variations YTD
        ytd_str = etf.get("ytd", "0,00%")
        if ytd_str != "n/a":
            try:
                ytd_val = float(ytd_str.replace(',', '.').replace('%', '').replace('+', ''))
                ytd_changes.append((ytd_val, {
                    "name": etf["name"],
                    "symbol": etf.get("provider", ""),
                    "ytd": ytd_str
                }))
            except ValueError:
                pass
    
    # Tri et sélection des meilleurs/pires performers
    daily_changes.sort(key=lambda x: x[0], reverse=True)
    ytd_changes.sort(key=lambda x: x[0], reverse=True)
    
    # Meilleurs performers quotidiens
    top_performers["daily"]["best"] = [item[1] for item in daily_changes[:count]]
    
    # Pires performers quotidiens
    top_performers["daily"]["worst"] = [item[1] for item in daily_changes[-count:]]
    if top_performers["daily"]["worst"]:
        top_performers["daily"]["worst"].reverse()  # Pour avoir le pire en premier
    
    # Meilleurs performers YTD
    top_performers["ytd"]["best"] = [item[1] for item in ytd_changes[:count]]
    
    # Pires performers YTD
    top_performers["ytd"]["worst"] = [item[1] for item in ytd_changes[-count:]]
    if top_performers["ytd"]["worst"]:
        top_performers["ytd"]["worst"].reverse()  # Pour avoir le pire en premier
    
    return top_performers

def save_json(data, filename):
    """Enregistre les données au format JSON"""
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Fichier {filepath} enregistré avec succès")

def main():
    """Fonction principale"""
    try:
        # Créer le répertoire de sortie s'il n'existe pas
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        
        # Récupérer les données des TOP ETF
        top50_etfs = scrape_top50_etfs()
        top_bond_etfs = scrape_top_bond_etfs()
        
        print(f"Total TOP 50 ETF récupérés: {len(top50_etfs)}")
        print(f"Total meilleurs ETF Obligations récupérés: {len(top_bond_etfs)}")
        
        # Récupérer les données d'ETF de Boursorama
        boursorama_etfs = scrape_boursorama_etfs()
        print(f"Total ETF récupérés depuis Boursorama: {len(boursorama_etfs)}")
        
        # Récupérer les données d'ETF de JustETF pour chaque marché
        justetf_world_etfs = scrape_justetf_etfs(JUSTETF_WORLD_URL, "world")
        justetf_us_etfs = scrape_justetf_etfs(JUSTETF_US_URL, "us")
        justetf_eu_etfs = scrape_justetf_etfs(JUSTETF_EU_URL, "eu")
        
        print(f"Total ETF récupérés depuis JustETF (world): {len(justetf_world_etfs)}")
        print(f"Total ETF récupérés depuis JustETF (US): {len(justetf_us_etfs)}")
        print(f"Total ETF récupérés depuis JustETF (EU): {len(justetf_eu_etfs)}")
        
        # Fusionner les données pour chaque marché
        world_etfs = merge_etf_data(boursorama_etfs, justetf_world_etfs)
        us_etfs = merge_etf_data([], justetf_us_etfs)  # Boursorama n'a pas de section spécifique US
        eu_etfs = merge_etf_data([], justetf_eu_etfs)  # Boursorama n'a pas de section spécifique EU
        
        # Organiser par marché et lettre
        world_data = init_data_structure()
        world_data["indices"] = organize_by_letter(world_etfs)
        world_data["top_performers"] = get_top_performers(world_etfs)
        world_data["top50_etfs"] = top50_etfs
        world_data["top_bond_etfs"] = top_bond_etfs
        world_data["meta"]["count"] = len(world_etfs)
        
        us_data = init_data_structure()
        us_data["indices"] = organize_by_letter(us_etfs)
        us_data["top_performers"] = get_top_performers(us_etfs)
        us_data["top50_etfs"] = top50_etfs  # Ajout des TOP 50 à tous les marchés
        us_data["top_bond_etfs"] = top_bond_etfs  # Ajout des TOP Obligations à tous les marchés
        us_data["meta"]["count"] = len(us_etfs)
        
        eu_data = init_data_structure()
        eu_data["indices"] = organize_by_letter(eu_etfs)
        eu_data["top_performers"] = get_top_performers(eu_etfs)
        eu_data["top50_etfs"] = top50_etfs  # Ajout des TOP 50 à tous les marchés
        eu_data["top_bond_etfs"] = top_bond_etfs  # Ajout des TOP Obligations à tous les marchés
        eu_data["meta"]["count"] = len(eu_etfs)
        
        # Enregistrer les données
        save_json(world_data, "etfs_world.json")
        save_json(us_data, "etfs_us.json")
        save_json(eu_data, "etfs_eu.json")
        
        print("Récupération et traitement des données ETF terminés avec succès")
        
    except Exception as e:
        print(f"Erreur dans le processus principal: {e}")
        raise

if __name__ == "__main__":
    main()
