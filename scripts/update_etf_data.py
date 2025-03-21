#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de récupération des données ETF depuis Boursorama et JustETF
Ce script génère un fichier JSON unique pour la page ETF de TradePulse
Amélioré avec gestion de pagination pour Boursorama (jusqu'à 40 pages)
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
BOURSORAMA_ETF_SHORT_TERM_URL = "https://www.boursorama.com/bourse/trackers/recherche/autres/?etfSearch%5Bcurrent%5D=shortTerm&etfSearch%5BisEtf%5D=1"
JUSTETF_TOP50_URL = "https://www.justetf.com/fr/market-overview/the-best-etfs.html"
JUSTETF_TOP_BONDS_URL = "https://www.justetf.com/fr/market-overview/the-best-bond-etfs.html"

def fetch_page(url, params=None, retries=3, delay=5):
    """Récupère une page web avec gestion des erreurs et des tentatives"""
    for attempt in range(retries):
        try:
            print(f"Téléchargement de {url}" + (f" (tentative {attempt+1}/{retries})" if attempt > 0 else ""))
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            print(f"Tentative {attempt+1}/{retries} échouée: {e}")
            if attempt == retries - 1:
                print(f"Échec après {retries} tentatives pour {url}")
                raise
            print(f"Nouvelle tentative dans {delay} secondes...")
            time.sleep(delay)

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
        "top_short_term_etfs": [],
        "meta": {
            "count": 0,
            "timestamp": get_current_time(),
            "source": "Boursorama/JustETF"
        }
    }

def get_total_pages(soup):
    """Détermine le nombre total de pages à partir de la pagination"""
    try:
        # Rechercher les éléments de pagination
        pagination = soup.select('.c-pagination__page')
        if not pagination:
            return 1
        
        # Extraire le numéro de la dernière page
        last_page_elem = pagination[-1]
        last_page = int(last_page_elem.get_text(strip=True))
        return last_page
    except Exception as e:
        print(f"Erreur lors de la détermination du nombre de pages: {e}")
        return 40  # Valeur par défaut maximum

def scrape_boursorama_etfs():
    """Extrait les données ETF depuis Boursorama avec gestion de la pagination"""
    print("Récupération des données ETF depuis Boursorama...")
    
    # Liste pour stocker tous les ETF
    all_etfs = []
    
    # Récupérer la première page pour déterminer le nombre total de pages
    try:
        html = fetch_page(BOURSORAMA_ETF_URL)
        soup = BeautifulSoup(html, 'lxml')
        detected_pages = get_total_pages(soup)
        max_pages = min(detected_pages, 40)  # Limiter à 40 pages maximum comme demandé
        print(f"Nombre total de pages détecté: {detected_pages}, pages à parcourir: {max_pages}")
    except Exception as e:
        print(f"Erreur lors de la détermination du nombre de pages: {e}")
        max_pages = 40  # Valeur par défaut maximum
    
    # Parcourir chaque page
    for page in range(1, max_pages + 1):
        try:
            # Construire l'URL avec le paramètre de page
            page_url = f"{BOURSORAMA_ETF_URL}?page={page}"
            print(f"Récupération des ETF - Page {page}/{max_pages}: {page_url}")
            
            # Ajout d'un délai entre les requêtes pour éviter d'être bloqué
            if page > 1:
                time.sleep(2)
            
            # Pour la première page, réutiliser le soup déjà chargé
            if page == 1 and 'soup' in locals():
                pass
            else:
                html = fetch_page(page_url)
                soup = BeautifulSoup(html, 'lxml')
            
            # Vérifier si la page contient des données
            if "Aucun résultat" in soup.text:
                print(f"Page {page}: Aucun résultat trouvé, arrêt de la pagination")
                break
            
            # Extraction des tableaux d'ETF
            etf_tables = soup.select('.c-table')
            
            if not etf_tables:
                print(f"Page {page}: Aucun tableau d'ETF trouvé")
                # Vérifier si on a atteint la dernière page
                pagination = soup.select('.c-pagination__page')
                if not pagination or len(pagination) < page:
                    print("Dernière page atteinte, fin de la pagination")
                    break
                continue
            
            page_etfs = []
            for table in etf_tables:
                rows = table.select('tbody tr')
                print(f"Page {page}: {len(rows)} ETF trouvés dans le tableau")
                
                for row in rows:
                    cells = row.select('td')
                    if len(cells) >= 6:
                        try:
                            name = cells[0].get_text(strip=True)
                            last_price = cells[1].get_text(strip=True)
                            change = cells[2].get_text(strip=True)
                            ytd = cells[3].get_text(strip=True) if len(cells) > 3 else "n/a"
                            
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
                                "ytd": ytd,
                                "category": category,
                                "provider": provider,
                                # Valeurs par défaut pour les autres champs
                                "assets": "n/a",
                                "ratio": "n/a"
                            }
                            page_etfs.append(etf)
                        except (ValueError, IndexError) as e:
                            print(f"Erreur lors de l'extraction d'un ETF: {e}")
            
            # Ajouter les ETF de cette page à la liste complète
            all_etfs.extend(page_etfs)
            print(f"Page {page}: {len(page_etfs)} ETF extraits avec succès")
            
            # Vérifier s'il y a une page suivante
            next_button = soup.select_one('a.c-pagination__next')
            if next_button and 'c-pagination__next--disabled' in next_button.get('class', []):
                print(f"Dernière page atteinte ({page}), fin de la pagination")
                break
                
        except Exception as e:
            print(f"Erreur lors de la récupération des ETF Boursorama page {page}: {e}")
            # Continuer avec la page suivante même en cas d'erreur
    
    print(f"Total ETF récupérés depuis toutes les pages: {len(all_etfs)}")
    return all_etfs

def scrape_top_short_term_etfs():
    """Extrait les données des ETF avec performances court terme depuis Boursorama avec pagination"""
    print("Récupération des ETF court terme depuis Boursorama...")
    
    # Liste pour stocker tous les ETF court terme
    all_short_term_etfs = []
    
    # Récupérer la première page pour déterminer le nombre total de pages
    try:
        html = fetch_page(BOURSORAMA_ETF_SHORT_TERM_URL)
        soup = BeautifulSoup(html, 'lxml')
        detected_pages = get_total_pages(soup)
        max_pages = min(detected_pages, 40)  # Limiter à 40 pages maximum comme demandé
        print(f"Nombre total de pages d'ETF court terme détecté: {detected_pages}, pages à parcourir: {max_pages}")
    except Exception as e:
        print(f"Erreur lors de la détermination du nombre de pages d'ETF court terme: {e}")
        max_pages = 40  # Valeur par défaut maximum
    
    # Parcourir chaque page
    for page in range(1, max_pages + 1):
        try:
            # Construire l'URL avec le paramètre de page
            page_url = f"{BOURSORAMA_ETF_SHORT_TERM_URL}&page={page}"
            print(f"Récupération des ETF court terme - Page {page}/{max_pages}: {page_url}")
            
            # Ajout d'un délai entre les requêtes pour éviter d'être bloqué
            if page > 1:
                time.sleep(2)
            
            # Pour la première page, réutiliser le soup déjà chargé
            if page == 1 and 'soup' in locals():
                pass
            else:
                html = fetch_page(page_url)
                soup = BeautifulSoup(html, 'lxml')
            
            # Vérifier si la page contient des données
            if "Aucun résultat" in soup.text:
                print(f"Page {page}: Aucun résultat trouvé, arrêt de la pagination")
                break
            
            # Trouver le tableau de données
            table = soup.select_one('table')
            
            if not table:
                print(f"Page {page}: Aucun tableau d'ETF court terme trouvé")
                # Vérifier si on a atteint la dernière page
                pagination = soup.select('.c-pagination__page')
                if not pagination or len(pagination) < page:
                    print("Dernière page atteinte, fin de la pagination")
                    break
                continue
            
            # Extraire les lignes du tableau
            rows = table.select('tbody tr')
            print(f"Page {page}: {len(rows)} ETF court terme trouvés")
            
            page_etfs = []
            for row in rows:
                try:
                    cells = row.select('td')
                    if len(cells) >= 6:
                        # Trouver le libellé de l'ETF (première colonne)
                        etf_name_elem = row.select_one('a.c-link')
                        etf_name = etf_name_elem.get_text(strip=True) if etf_name_elem else "ETF Inconnu"
                        
                        # Trouver l'icône de tendance (flèche haut/bas)
                        trend_icon = row.select_one('i.c-icon')
                        trend = "up" if trend_icon and "up" in trend_icon.get('class', []) else "down"
                        
                        # Extraire les données des colonnes - attention à l'ordre correct
                        # Colonnes: Libellé, ETF 1M, Catégorie 1M, Class 1M, ETF 6M, Catégorie 6M, Class 6M
                        one_month_etf = cells[1].get_text(strip=True) if len(cells) > 1 else "0,00%"
                        one_month_category = cells[2].get_text(strip=True) if len(cells) > 2 else "0,00%"
                        one_month_rank = cells[3].get_text(strip=True) if len(cells) > 3 else ""
                        
                        six_month_etf = cells[4].get_text(strip=True) if len(cells) > 4 else "0,00%"
                        six_month_category = cells[5].get_text(strip=True) if len(cells) > 5 else "0,00%"
                        six_month_rank = cells[6].get_text(strip=True) if len(cells) > 6 else ""
                        
                        # Créer l'objet ETF
                        etf = {
                            "name": etf_name,
                            "trend": trend,
                            "one_month_etf": one_month_etf,
                            "one_month_category": one_month_category,
                            "one_month_rank": one_month_rank,
                            "six_month_etf": six_month_etf,
                            "six_month_category": six_month_category,
                            "six_month_rank": six_month_rank
                        }
                        
                        page_etfs.append(etf)
                        print(f"Extrait ETF court terme: {etf_name}, 1M: {one_month_etf}, 6M: {six_month_etf}")
                except Exception as e:
                    print(f"Erreur lors de l'extraction d'un ETF court terme: {e}")
            
            # Ajouter les ETF de cette page à la liste complète
            all_short_term_etfs.extend(page_etfs)
            print(f"Page {page}: {len(page_etfs)} ETF court terme extraits avec succès")
            
            # Vérifier s'il y a une page suivante
            next_button = soup.select_one('a.c-pagination__next')
            if next_button and 'c-pagination__next--disabled' in next_button.get('class', []):
                print(f"Dernière page atteinte ({page}), fin de la pagination")
                break
                
        except Exception as e:
            print(f"Erreur lors de la récupération des ETF court terme page {page}: {e}")
            # Continuer avec la page suivante même en cas d'erreur
    
    print(f"Total ETF court terme récupérés depuis toutes les pages: {len(all_short_term_etfs)}")
    return all_short_term_etfs

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
    start_time = time.time()
    print(f"Démarrage de la mise à jour des données ETF: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Créer le répertoire de sortie s'il n'existe pas
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        
        # Récupérer les données d'ETF de Boursorama avec pagination
        etfs = scrape_boursorama_etfs()
        print(f"Total ETF récupérés depuis Boursorama: {len(etfs)}")
        
        # Récupérer les données des TOP ETF
        top50_etfs = scrape_top50_etfs()
        top_bond_etfs = scrape_top_bond_etfs()
        top_short_term_etfs = scrape_top_short_term_etfs()
        
        print(f"Total TOP 50 ETF récupérés: {len(top50_etfs)}")
        print(f"Total meilleurs ETF Obligations récupérés: {len(top_bond_etfs)}")
        print(f"Total ETF court terme récupérés: {len(top_short_term_etfs)}")
        
        # Créer un objet de données unique
        data = init_data_structure()
        data["indices"] = organize_by_letter(etfs)
        data["top_performers"] = get_top_performers(etfs)
        data["top50_etfs"] = top50_etfs
        data["top_bond_etfs"] = top_bond_etfs
        data["top_short_term_etfs"] = top_short_term_etfs
        data["meta"]["count"] = len(etfs)
        data["meta"]["timestamp"] = get_current_time()
        
        # Enregistrer les données
        output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILE)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"Fichier {output_path} enregistré avec succès")
        
        elapsed_time = time.time() - start_time
        print(f"Mise à jour complétée en {elapsed_time:.2f} secondes")
        print(f"Nombre total d'ETF récupérés: {data['meta']['count']}")
        
    except Exception as e:
        print(f"Erreur dans le processus principal: {e}")
        raise

if __name__ == "__main__":
    main()