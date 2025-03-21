#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de récupération des données ETF depuis Boursorama et JustETF
Ce script génère un fichier JSON unique pour la page ETF de TradePulse
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
OUTPUT_FILE = "etf.json"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
}

# URLs
BOURSORAMA_ETF_URL = "https://www.boursorama.com/bourse/trackers/"
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
    """Crée la structure de données initiale pour le fichier JSON"""
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

def scrape_top50_etfs():
    """Extrait les données des TOP 50 ETF depuis JustETF"""
    print("Récupération des TOP 50 ETF depuis JustETF...")
    
    try:
        html = fetch_page(JUSTETF_TOP50_URL)
        soup = BeautifulSoup(html, 'lxml')
        
        # Extraction du tableau des TOP 50 ETF
        etf_table = soup.select_one('.etf-rank-table')
        if not etf_table:
            print("Table des TOP 50 ETF non trouvée, tentative avec un autre sélecteur")
            etf_table = soup.select_one('table')  # Tentative avec un sélecteur plus général
            if not etf_table:
                return []
        
        top_etfs = []
        rows = etf_table.select('tbody tr')
        print(f"Nombre de lignes trouvées dans la table TOP 50 ETF: {len(rows)}")
        
        for row in rows:
            try:
                cells = row.select('td')
                if len(cells) >= 7:  # Vérifions qu'il y a assez de cellules
                    # Extraction des données avec gestion d'erreur plus robuste
                    focus_text = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                    
                    # Extraction du nom avec vérification
                    name_elem = cells[0].select_one('a')
                    name = name_elem.get_text(strip=True) if name_elem else "ETF Inconnu"
                    
                    # Extraire les performances avec vérification
                    ytd_elem = cells[4] if len(cells) > 4 else None
                    ytd = ytd_elem.get_text(strip=True) if ytd_elem else "0,00%"
                    
                    one_month_elem = cells[5] if len(cells) > 5 else None
                    one_month = one_month_elem.get_text(strip=True) if one_month_elem else "0,00%"
                    
                    one_year_elem = cells[7] if len(cells) > 7 else None
                    one_year = one_year_elem.get_text(strip=True) if one_year_elem else "0,00%"
                    
                    # Exporter toutes les données pertinentes
                    top_etf = {
                        "name": name,
                        "focus": focus_text,
                        "ytd": ytd,
                        "one_month": one_month,
                        "one_year": one_year,
                        "symbol": ""  # Ajout d'un symbole vide pour compatibilité
                    }
                    top_etfs.append(top_etf)
                    
                    # Debug
                    print(f"Extrait ETF TOP: {name}, YTD: {ytd}, 1 mois: {one_month}")
            except Exception as e:
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
            print("Table des TOP ETF BOND non trouvée, tentative avec un autre sélecteur")
            etf_table = soup.select_one('table')  # Tentative avec un sélecteur plus général
            if not etf_table:
                return []
        
        top_bond_etfs = []
        rows = etf_table.select('tbody tr')
        print(f"Nombre de lignes trouvées dans la table TOP BOND ETF: {len(rows)}")
        
        for row in rows:
            try:
                cells = row.select('td')
                if len(cells) >= 7:  # Vérifions qu'il y a assez de cellules
                    # Extraction des données avec gestion d'erreur plus robuste
                    focus_text = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                    
                    # Extraction du nom avec vérification
                    name_elem = cells[0].select_one('a')
                    name = name_elem.get_text(strip=True) if name_elem else "ETF Obligations Inconnu"
                    
                    # Extraire les performances avec vérification
                    ytd_elem = cells[4] if len(cells) > 4 else None
                    ytd = ytd_elem.get_text(strip=True) if ytd_elem else "0,00%"
                    
                    one_month_elem = cells[5] if len(cells) > 5 else None
                    one_month = one_month_elem.get_text(strip=True) if one_month_elem else "0,00%"
                    
                    one_year_elem = cells[7] if len(cells) > 7 else None
                    one_year = one_year_elem.get_text(strip=True) if one_year_elem else "0,00%"
                    
                    # Exporter toutes les données pertinentes
                    top_bond_etf = {
                        "name": name,
                        "focus": focus_text,
                        "ytd": ytd,
                        "one_month": one_month,
                        "one_year": one_year,
                        "symbol": ""  # Ajout d'un symbole vide pour compatibilité
                    }
                    top_bond_etfs.append(top_bond_etf)
                    
                    # Debug
                    print(f"Extrait ETF BOND: {name}, YTD: {ytd}, 1 mois: {one_month}")
            except Exception as e:
                print(f"Erreur lors de l'extraction d'un TOP ETF d'obligations: {e}")
        
        return top_bond_etfs
    except Exception as e:
        print(f"Erreur lors de la récupération des meilleurs ETF d'obligations: {e}")
        return []

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
        etfs = scrape_boursorama_etfs()
        print(f"Total ETF récupérés depuis Boursorama: {len(etfs)}")
        
        # Créer un objet de données unique
        data = init_data_structure()
        data["indices"] = organize_by_letter(etfs)
        data["top_performers"] = get_top_performers(etfs)
        data["top50_etfs"] = top50_etfs
        data["top_bond_etfs"] = top_bond_etfs
        data["meta"]["count"] = len(etfs)
        data["meta"]["timestamp"] = get_current_time()
        
        # Enregistrer les données
        output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILE)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"Fichier {output_path} enregistré avec succès")
        print("Récupération et traitement des données ETF terminés avec succès")
        
    except Exception as e:
        print(f"Erreur dans le processus principal: {e}")
        raise

if __name__ == "__main__":
    main()
