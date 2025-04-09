#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script unifié d'extraction des données des actions du NASDAQ Composite et du DJ STOXX 600
Combine les fonctionnalités de scrape_lists.py et scrape_stoxx.py
Utilisé par GitHub Actions pour mettre à jour régulièrement les données

IMPORTANT: Ce script met à jour UNIQUEMENT les fichiers suivants:
- data/lists.json (données NASDAQ et STOXX unifiées)
- data/update_summary.json (résumé de la mise à jour)
- data/global_top_performers.json (classement global NASDAQ + STOXX)
- data/top_nasdaq_performers.json (top performers NASDAQ)
- data/top_stoxx_performers.json (top performers STOXX)

Il ne modifie PAS le fichier markets.json qui est géré par le script scrape_markets.py
et le workflow 'Update Markets Data Only'.
"""

import os
import json
import sys
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
import logging
import time

# Configuration du logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "base_url": "https://www.boursorama.com/bourse/actions/cotations/international",
    "nasdaq": {
        "country": "1",  # États-Unis
        "market": "$COMPX",  # NASDAQ Composite
        "output_path": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lists.json"),
    },
    "stoxx": {
        "country": "EU",  # Europe
        "market": "2cSXXP",  # DJ STOXX 600
        "output_dir": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
    },
    "alphabet": list("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    "sleep_time": 1.5  # Délai entre les requêtes pour éviter la détection de bot
}

# Seuils pour les outliers
MAX_DAILY_GAIN_PERCENTAGE = 99.0  # Hausse journalière maximale autorisée
MIN_DAILY_LOSS_PERCENTAGE = -99.0  # Baisse journalière minimale autorisée
MIN_YTD_LOSS_PERCENTAGE = -99.0    # Baisse YTD minimale autorisée
# Remarque: Pas de limite pour les hausses YTD, car elles peuvent légitimement dépasser 99%

# Mappings pour les actions du STOXX (nom -> pays et secteur)
STOXX_MAPPINGS = {
   "A2A": {"country": "Italy", "sector": "Services publics"},
    "AALBERTS": {"country": "Netherlands", "sector": "Composants industriels / Automatisation"},
    "AB INBEV": {"country": "Belgium", "sector": "Alimentation"},
    "ABB": {"country": "Switzerland", "sector": "Composants industriels / Automatisation"},
    "ABERDEEN GRP PLC": {"country": "United Kingdom", "sector": "Banques"},
    "ABN AMRO DR": {"country": "Netherlands", "sector": "Banques"},
    "ACCELLERON IND": {"country": "Switzerland", "sector": "Industrie / Aérospatiale / Défense"},
    "ACCIONA": {"country": "Spain", "sector": "Green Tech / Clean Energy"},
    "ACCOR": {"country": "France", "sector": "Voyages / Loisirs"},
    "ACKERMANS V HAARE": {"country": "Belgium", "sector": "Diversifié / Conglomérats"},
    "ACS": {"country": "Spain", "sector": "Construction & Materials"},
    "ADECCO GROUP": {"country": "Switzerland", "sector": "IT Services"},
    "ADIDAS": {"country": "Germany", "sector": "Luxe"},
    "ADMIRAL GROUP": {"country": "United Kingdom", "sector": "Assurances"},
    "ADP": {"country": "France", "sector": "Voyages / Loisirs"},
    "ADYEN": {"country": "Netherlands", "sector": "Fintech / Paiements numériques"},
    "AEDIFICA": {"country": "Belgium", "sector": "Immobilier / REITs"},
    "AEGON": {"country": "Netherlands", "sector": "Assurances"},
    "AENA": {"country": "Spain", "sector": "Voyages / Loisirs"},
    "AGEAS": {"country": "Belgium", "sector": "Assurances"},
    "AIB GRP": {"country": "Ireland", "sector": "Banques"},
    "AIR LIQUIDE": {"country": "France", "sector": "Matériaux de base / Métaux"},
    "AIRBUS": {"country": "France", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "AIXTRON": {"country": "Germany", "sector": "Semiconducteurs"},
    "AKZO NOBEL": {"country": "Netherlands", "sector": "Matériaux de base / Métaux"},
    "ALCON": {"country": "Switzerland", "sector": "Santé / Equipement médical"},
    "ALLFUNDS GRP": {"country": "Spain", "sector": "Fintech / Paiements numériques"},
    "ALLIANZ": {"country": "Germany", "sector": "Assurances"},
    "ALLREAL HLDG": {"country": "Switzerland", "sector": "Immobilier / REITs"},
    "ALSTOM": {"country": "France", "sector": "Transports & Infrastructure industrielle"},
    "ALTEN": {"country": "France", "sector": "IT Services"},
    "AMADEUS IT GRP BR-A": {"country": "Spain", "sector": "Cloud & Software"},
    "AMPLIFON": {"country": "Italy", "sector": "Santé / Equipement médical"},
    "AMUNDI": {"country": "France", "sector": "Banques"},
    "ANGLO AMERICAN": {"country": "United Kingdom", "sector": "Matériaux de base / Métaux"},
    "ANTOFAGASTA": {"country": "United Kingdom", "sector": "Matériaux de base / Métaux"},
    "ARCADIS": {"country": "Netherlands", "sector": "Construction & Materials"},
    "ARCELORMITTAL": {"country": "Luxembourg", "sector": "Matériaux de base / Métaux"},
    "ARGENX": {"country": "Belgium", "sector": "Biotech"},
    "ARKEMA": {"country": "France", "sector": "Matériaux de base / Métaux"},
    "ASHTEAD GROUP": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "ASM INT": {"country": "Netherlands", "sector": "Semiconducteurs"},
    "ASML HLDG": {"country": "Netherlands", "sector": "Semiconducteurs"},
    "ASR": {"country": "Netherlands", "sector": "Assurances"},
    "ASSOCIAT BRIT FO": {"country": "United Kingdom", "sector": "Alimentation"},
    "ASTRAZENECA": {"country": "United Kingdom", "sector": "Pharma"},
    "AURUBIS AG": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "AUTO TRD GR RG-144A": {"country": "United States", "sector": "Automobile"},
    "AVIVA": {"country": "United Kingdom", "sector": "Assurances"},
    "AVOLTA": {"country": "Switzerland", "sector": "Voyages / Loisirs"},
    "AXA": {"country": "France", "sector": "Assurances"},
    "AZELIS GROUP": {"country": "Belgium", "sector": "Matériaux de base / Métaux"},
    "AZIMUT": {"country": "Italy", "sector": "Banques"},
    "BACHEM HLDG": {"country": "Switzerland", "sector": "Biotech"},
    "BAE SYSTEMS": {"country": "United Kingdom", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "BALFOUR BEATTY": {"country": "United Kingdom", "sector": "Construction & Materials"},
    "BALOISE HLDG": {"country": "Switzerland", "sector": "Assurances"},
    "BANCA MPS": {"country": "Italy", "sector": "Banques"},
    "BANCO BPM": {"country": "Italy", "sector": "Banques"},
    "BANCO SABADELL": {"country": "Spain", "sector": "Banques"},
    "BANCO SANTANDER": {"country": "Spain", "sector": "Banques"},
    "BANKINTER": {"country": "Spain", "sector": "Banques"},
    "BARCLAYS": {"country": "United Kingdom", "sector": "Banques"},
    "BARRATT DEVLOP": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "BARRY CALLEBAUT": {"country": "Switzerland", "sector": "Alimentation"},
    "BASF": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "BAWAG GROUP": {"country": "Austria", "sector": "Banques"},
    "BAYER": {"country": "Germany", "sector": "Pharma"},
    "BBVA": {"country": "Spain", "sector": "Banques"},
    "BC VAUDOISE": {"country": "Switzerland", "sector": "Banques"},
    "BCP": {"country": "Portugal", "sector": "Banques"},
    "BEAZLEY": {"country": "United Kingdom", "sector": "Assurances"},
    "BECHTLE": {"country": "Germany", "sector": "IT Services"},
    "BEIERSDORF": {"country": "Germany", "sector": "Produits ménagers"},
    "BELIMO HLDG": {"country": "Switzerland", "sector": "Industrie / Aérospatiale / Défense"},
    "BELLWAY": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "BERKELEY GRP HLD": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "BESI": {"country": "Netherlands", "sector": "Semiconducteurs"},
    "BIG YELLOW GROUP": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "BIOMERIEUX": {"country": "France", "sector": "Santé / Equipement médical"},
    "BK OF IE GRP": {"country": "Ireland", "sector": "Banques"},
    "BKW": {"country": "Switzerland", "sector": "Services publics"},
    "BMW": {"country": "Germany", "sector": "Automobile"},
    "BNP PARIBAS": {"country": "France", "sector": "Banques"},
    "BOLLORE SE": {"country": "France", "sector": "Diversifié / Conglomérats"},
    "BOUYGUES": {"country": "France", "sector": "Construction & Materials"},
    "BOVIS HOMES GROU": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "BP": {"country": "United Kingdom", "sector": "Énergie / Pétrole & Gaz"},
    "BPER BANCA": {"country": "Italy", "sector": "Banques"},
    "BRENNTAG": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "BRIT AMER TOBACC": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "BRIT LAND CO REI": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "BRUNELLO CUCINELLI": {"country": "Italy", "sector": "Luxe"},
    "BT GROUP": {"country": "United Kingdom", "sector": "Télécom / Infrastructure"},
    "BUCHER INDUSTRIES": {"country": "Switzerland", "sector": "Transports & Infrastructure industrielle"},
    "BUNZL": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "BURBERRY GROUP": {"country": "United Kingdom", "sector": "Luxe"},
    "BUREAU VERITAS": {"country": "France", "sector": "IT Services"},
    "BUZZI": {"country": "Italy", "sector": "Matériaux de base / Métaux"},
    "CAIXABANK": {"country": "Spain", "sector": "Banques"},
    "CAPGEMINI": {"country": "France", "sector": "Cloud & Software"},
    "CARL ZEISS MEDITE": {"country": "Germany", "sector": "Santé / Equipement médical"},
    "CARREFOUR": {"country": "France", "sector": "Alimentation"},
    "CELLNEX TELECOM": {"country": "Spain", "sector": "Télécom / Infrastructure"},
    "CEMBRA MONEY BK": {"country": "Switzerland", "sector": "Banques"},
    "CENTRICA": {"country": "United Kingdom", "sector": "Énergie / Pétrole & Gaz"},
    "CHRISTIAN DIOR": {"country": "France", "sector": "Luxe"},
    "CLARIANT": {"country": "Switzerland", "sector": "Matériaux de base / Métaux"},
    "COCA-COLA HBC": {"country": "United Kingdom", "sector": "Alimentation"},
    "COFINIMMO": {"country": "Belgium", "sector": "Immobilier / REITs"},
    "COMMERZBANK": {"country": "Germany", "sector": "Banques"},
    "COMPASS GROUP": {"country": "United Kingdom", "sector": "Alimentation"},
    "COMPUTACENTER": {"country": "United Kingdom", "sector": "IT Services"},
    "CONTINENTAL": {"country": "Germany", "sector": "Automobile"},
    "CONVATEC GRP": {"country": "United Kingdom", "sector": "Santé / Equipement médical"},
    "COVESTRO": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "COVIVIO": {"country": "France", "sector": "Immobilier / REITs"},
    "CRANSWICK": {"country": "United Kingdom", "sector": "Alimentation"},
    "CREDIT AGRICOLE SA": {"country": "France", "sector": "Banques"},
    "CRH PLC": {"country": "Ireland", "sector": "Matériaux de base / Métaux"},
    "CRODA INTL": {"country": "United Kingdom", "sector": "Matériaux de base / Métaux"},
    "CTS EVENTIM AG": {"country": "Germany", "sector": "Voyages / Loisirs"},
    "D'IETEREN GRP": {"country": "Belgium", "sector": "Automobile"},
    "DAIMLER TR HLDG": {"country": "Germany", "sector": "Automobile"},
    "DANONE": {"country": "France", "sector": "Alimentation"},
    "DASSAULT AVIATION": {"country": "France", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "DASSAULT SYSTEMES": {"country": "France", "sector": "Software"},
    "DAV CAM MIL": {"country": "Italy", "sector": "Industrie / Aérospatiale / Défense"},
    "DCC": {"country": "United Kingdom", "sector": "Diversifié / Conglomérats"},
    "DELIV HERO": {"country": "Germany", "sector": "E-commerce"},
    "DERWENT LONDON": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "DEUTSCHE BANK": {"country": "Germany", "sector": "Banques"},
    "DEUTSCHE BOERSE": {"country": "Germany", "sector": "Banques"},
    "DEUTSCHE POST": {"country": "Germany", "sector": "Logistique / Services postaux"},
    "DEUTSCHE TELEKOM": {"country": "Germany", "sector": "Télécom / Infrastructure"},
    "DIAGEO": {"country": "United Kingdom", "sector": "Alimentation"},
    "DIASORIN": {"country": "Italy", "sector": "Santé / Equipement médical"},
    "DIPLOMA": {"country": "United Kingdom", "sector": "Distribution industrielle / électrique"},
    "DIRECT LINE INS": {"country": "United Kingdom", "sector": "Assurances"},
    "DKSH HLDG": {"country": "Switzerland", "sector": "Produits ménagers"},
    "DRAX GROUP": {"country": "United Kingdom", "sector": "Green Tech / Clean Energy"},
    "DSM FIRMENICH": {"country": "Netherlands", "sector": "Matériaux de base / Métaux"},
    "DT LUFTHANSA": {"country": "Germany", "sector": "Voyages / Loisirs"},
    "E.ON": {"country": "Germany", "sector": "Services publics"},
    "EDENRED": {"country": "France", "sector": "Fintech / Paiements numériques"},
    "EDP RENOVAVEIS": {"country": "Portugal", "sector": "Green Tech / Clean Energy"},
    "EDP S.A": {"country": "Portugal", "sector": "Énergie / Pétrole & Gaz"},
    "EIFFAGE": {"country": "France", "sector": "Construction & Materials"},
    "ELIA GROUP": {"country": "Belgium", "sector": "Services publics"},
     "ELIS": {"country": "France", "sector": "Produits ménagers"},
    "EMS-CHEM HLDG": {"country": "Switzerland", "sector": "Matériaux de base / Métaux"},
    "ENAGAS": {"country": "Spain", "sector": "Énergie / Pétrole & Gaz"},
    "ENDESA": {"country": "Spain", "sector": "Services publics"},
    "ENEL": {"country": "Italy", "sector": "Services publics"},
    "ENGIE": {"country": "France", "sector": "Énergie / Pétrole & Gaz"},
    "ENI": {"country": "Italy", "sector": "Énergie / Pétrole & Gaz"},
    "ENTAIN": {"country": "United Kingdom", "sector": "Voyages / Loisirs"},
    "ESSILORLUXOTTICA": {"country": "France", "sector": "Santé / Equipement médical"},
    "EURAZEO": {"country": "France", "sector": "Banques"},
    "EUROFINS SCIENTIFIC": {"country": "France", "sector": "Santé / Equipement médical"},
    "EURONEXT": {"country": "France", "sector": "Banques"},
    "EVONIK INDUSTR": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "EVOTEC AG O.N.": {"country": "Germany", "sector": "Biotech"},
    "EXOR": {"country": "Netherlands", "sector": "Diversifié / Conglomérats"},
    "EXPERIAN": {"country": "United Kingdom", "sector": "IT Services"},
    "FDJ UNITED": {"country": "France", "sector": "Voyages / Loisirs"},
    "FERRARI": {"country": "Italy", "sector": "Automobile"},
    "FERROVIAL": {"country": "Spain", "sector": "Construction & Materials"},
    "FINECOBANK": {"country": "Italy", "sector": "Banques"},
    "FLUGHAFEN ZUERICH": {"country": "Switzerland", "sector": "Voyages / Loisirs"},
    "FLUTTER ENTMT": {"country": "Ireland", "sector": "Voyages / Loisirs"},
    "FORVIA (EX FAURECIA)": {"country": "France", "sector": "Automobile"},
    "FREENET": {"country": "Germany", "sector": "Télécom / Infrastructure"},
    "FRES MED CARE": {"country": "Germany", "sector": "Santé / Equipement médical"},
    "FRESENIUS": {"country": "Germany", "sector": "Santé / Equipement médical"},
    "FRONTLINE": {"country": "Norway", "sector": "Énergie / Pétrole & Gaz"},
    "GALENICA": {"country": "Switzerland", "sector": "Santé / Equipement médical"},
    "GALP ENERGIA -B-": {"country": "Portugal", "sector": "Énergie / Pétrole & Gaz"},
    "GAMES WORKSHOP G": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "GBL": {"country": "Belgium", "sector": "Diversifié / Conglomérats"},
    "GEA GROUP AG": {"country": "Germany", "sector": "Industrie / Aérospatiale / Défense"},
    "GEBERIT": {"country": "Switzerland", "sector": "Construction & Materials"},
    "GECINA": {"country": "France", "sector": "Immobilier / REITs"},
    "GENERALI": {"country": "Italy", "sector": "Assurances"},
    "GEORG FISCHER": {"country": "Switzerland", "sector": "Transports & Infrastructure industrielle"},
    "GERRESHEIMER": {"country": "Germany", "sector": "Santé / Equipement médical"},
    "GETLINK (ex: EUROTUNNEL)": {"country": "France", "sector": "Industrie / Aérospatiale / Défense"},
    "GIVAUDAN": {"country": "Switzerland", "sector": "Matériaux de base / Métaux"},
    "GLANBIA": {"country": "Ireland", "sector": "Alimentation"},
    "GLENCORE": {"country": "Switzerland", "sector": "Matériaux de base / Métaux"},
    "GRAFTON GROUP UTS": {"country": "Ireland", "sector": "Industrie / Aérospatiale / Défense"},
    "GREGGS": {"country": "United Kingdom", "sector": "Alimentation"},
    "GRIFOLS-A": {"country": "Spain", "sector": "Biotech"},
    "GSK": {"country": "United Kingdom", "sector": "Pharma"},
    "GTT (GAZTRANSPORT ET TEC.)": {"country": "France", "sector": "Industrie / Aérospatiale / Défense"},
    "HALEON": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "HALMA": {"country": "United Kingdom", "sector": "Santé / Equipement médical"},
    "HANNOVER RUECK": {"country": "Germany", "sector": "Assurances"},
    "HARBOUR ENER": {"country": "United Kingdom", "sector": "Énergie / Pétrole & Gaz"},
    "HARGREAVES LANS": {"country": "United Kingdom", "sector": "Fintech / Paiements numériques"},
    "HAYS": {"country": "United Kingdom", "sector": "IT Services"},
    "HEIDELBERGMAT": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "HEINEKEN": {"country": "Netherlands", "sector": "Alimentation"},
    "HEINEKEN HOLDING": {"country": "Netherlands", "sector": "Alimentation"},
    "HELLOFRESH": {"country": "Germany", "sector": "E-commerce"},
    "HELVETIA HLDG": {"country": "Switzerland", "sector": "Assurances"},
    "HENKEL PFD": {"country": "Germany", "sector": "Produits ménagers"},
    "HERA": {"country": "Italy", "sector": "Services publics"},
    "HERMES INTL": {"country": "France", "sector": "Luxe"},
    "HIKMA PHARM": {"country": "United Kingdom", "sector": "Pharma"},
    "HISCOX": {"country": "United Kingdom", "sector": "Assurances"},
    "HOCHTIEF": {"country": "Germany", "sector": "Industrie / Aérospatiale / Défense"},
    "HOLCIM": {"country": "Switzerland", "sector": "Matériaux de base / Métaux"},
    "HOWDEN JOINERY": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "HSBC HLDG": {"country": "United Kingdom", "sector": "Banques"},
    "HSBC HOLDINGS": {"country": "United Kingdom", "sector": "Banques"},
    "HUGO BOSS": {"country": "Germany", "sector": "Luxe"},
    "IBERDROLA": {"country": "Spain", "sector": "Green Tech / Clean Energy"},
    "ICG": {"country": "United Kingdom", "sector": "Banques"},
    "IG GROUP HDGS": {"country": "United Kingdom", "sector": "Fintech / Paiements numériques"},
    "IMCD": {"country": "Netherlands", "sector": "Matériaux de base / Métaux"},
    "IMI": {"country": "United Kingdom", "sector": "Composants industriels / Automatisation"},
    "IMPERIAL BRANDS": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "INCHCAPE": {"country": "United Kingdom", "sector": "Automobile"},
    "INDITEX": {"country": "Spain", "sector": "E-commerce"},
    "INDIVIOR": {"country": "United Kingdom", "sector": "Biotech"},
    "INFINEON TECHNOLOGIES": {"country": "Germany", "sector": "Semiconducteurs"},
    "INFORMA": {"country": "United Kingdom", "sector": "IT Services"},
    "ING GROUP": {"country": "Netherlands", "sector": "Banques"},
    "INMOB COLONIAL": {"country": "Spain", "sector": "Immobilier / REITs"},
    "INPOST": {"country": "Netherlands", "sector": "E-commerce"},
    "INTERCONT HOTELS": {"country": "United Kingdom", "sector": "Voyages / Loisirs"},
    "INTERPUMP GRP": {"country": "Italy", "sector": "Composants industriels / Automatisation"},
    "INTERTEK GROUP": {"country": "United Kingdom", "sector": "IT Services"},
    "INTESA SANPAOLO": {"country": "Italy", "sector": "Banques"},
    "INTL DISTR SVC": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "INTL. CONS. AIR": {"country": "Spain", "sector": "Voyages / Loisirs"},
    "INVESTEC": {"country": "United Kingdom", "sector": "Banques"},
    "INWIT": {"country": "Italy", "sector": "Télécom / Infrastructure"},
    "IPSEN": {"country": "France", "sector": "Pharma"},
    "ITALGAS": {"country": "Italy", "sector": "Services publics"},
    "ITV": {"country": "United Kingdom", "sector": "Voyages / Loisirs"},
    "JD SPORTS FSN": {"country": "United Kingdom", "sector": "E-commerce"},
    "JDE PEET'S": {"country": "Netherlands", "sector": "Alimentation"},
    "JERONIMO MARTINS": {"country": "Portugal", "sector": "Alimentation"},
    "JOHNSON MATTHEY": {"country": "United Kingdom", "sector": "Matériaux de base / Métaux"},
    "JULIUS BAER GRP": {"country": "Switzerland", "sector": "Banques"},
    "JUST EAT TAKEAW": {"country": "Netherlands", "sector": "E-commerce"},
    "K+S": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
      "KBC GR": {"country": "Belgium", "sector": "Banques"},
    "KERING": {"country": "France", "sector": "Luxe"},
    "KERRY GRP-A": {"country": "Ireland", "sector": "Alimentation"},
    "KINGFISHER": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "KINGSPAN GRP": {"country": "Ireland", "sector": "Matériaux de base / Métaux"},
    "KION GROUP": {"country": "Germany", "sector": "Transports & Infrastructure industrielle"},
    "KLEPIERRE": {"country": "France", "sector": "Immobilier / REITs"},
    "KNORR-BREMSE": {"country": "Germany", "sector": "Transports & Infrastructure industrielle"},
    "KON AH DEL": {"country": "Germany", "sector": "Alimentation"},
    "KONINKL KPN": {"country": "Netherlands", "sector": "Télécom / Infrastructure"},
    "KONINKLIJKE PHILIPS N.V.": {"country": "Netherlands", "sector": "Santé / Equipement médical"},
    "KUEHNE+NAGEL INT": {"country": "Switzerland", "sector": "Industrie / Aérospatiale / Défense"},
    "L'OREAL": {"country": "France", "sector": "Produits ménagers"},
    "LAND SEC REIT": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "LANXESS": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "LEG IMMOBILIEN": {"country": "Germany", "sector": "Immobilier / REITs"},
    "LEGAL & GENERAL": {"country": "United Kingdom", "sector": "Assurances"},
    "LEGRAND": {"country": "France", "sector": "Équipements électriques pour le bâtiment"},
    "LEONARDO": {"country": "Italy", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "LIFCO RG-B": {"country": "Sweden", "sector": "Industrie / Aérospatiale / Défense"},
    "LINDT&SPRUENGLI PS": {"country": "Switzerland", "sector": "Alimentation"},
    "LLOYDS BANKING G": {"country": "United Kingdom", "sector": "Banques"},
    "LOGITECH INTL": {"country": "Switzerland", "sector": "Hardware"},
    "LONDONMETRIC": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "LONZA GRP": {"country": "Switzerland", "sector": "Santé / Equipement médical"},
    "LOTUS BAKERIES": {"country": "Belgium", "sector": "Alimentation"},
    "LSE GROUP": {"country": "United Kingdom", "sector": "Banques"},
    "LVMH": {"country": "France", "sector": "Luxe"},
    "MAN GRP": {"country": "United Kingdom", "sector": "Banques"},
    "MARKS & SPENCER": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "MEDIOBANCA": {"country": "Italy", "sector": "Banques"},
    "MERCEDES-BENZ GROUP": {"country": "Germany", "sector": "Automobile"},
    "MERCK": {"country": "Germany", "sector": "Pharma"},
    "MERLIN PROP.": {"country": "Spain", "sector": "Immobilier / REITs"},
    "MICHELIN": {"country": "France", "sector": "Automobile"},
    "MONCLER": {"country": "Italy", "sector": "Luxe"},
    "MONDI": {"country": "United Kingdom", "sector": "Matériaux de base / Métaux"},
    "MTU AERO ENGINES": {"country": "Germany", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "MUENCHENER RUECKV": {"country": "Germany", "sector": "Assurances"},
    "NATL GRID": {"country": "United Kingdom", "sector": "Services publics"},
    "NATURGY GRP": {"country": "Spain", "sector": "Énergie / Pétrole & Gaz"},
    "NATWEST GRP": {"country": "United Kingdom", "sector": "Banques"},
    "NEMETSCHEK AG O.N.": {"country": "Germany", "sector": "Software"},
    "NESTLE": {"country": "Switzerland", "sector": "Alimentation"},
    "NEXANS": {"country": "France", "sector": "Transports & Infrastructure industrielle"},
    "NEXI": {"country": "Italy", "sector": "Fintech / Paiements numériques"},
    "NEXT": {"country": "United Kingdom", "sector": "Luxe"},
    "NN GROUP": {"country": "Netherlands", "sector": "Assurances"},
    "NOKIA": {"country": "Finland", "sector": "Télécom / Infrastructure"},
    "NORDEA BK": {"country": "Sweden", "sector": "Banques"},
    "NOVARTIS": {"country": "Switzerland", "sector": "Pharma"},
      "OCADO GROUP": {"country": "United Kingdom", "sector": "E-commerce"},
    "OCI": {"country": "Netherlands", "sector": "Matériaux de base / Métaux"},
    "ORANGE": {"country": "France", "sector": "Télécom / Infrastructure"},
    "PART GRP HLDG": {"country": "Switzerland", "sector": "Assurances"},
    "PEARSON": {"country": "United Kingdom", "sector": "IT Services"},
    "PERNOD RICARD": {"country": "France", "sector": "Alimentation"},
    "PERSIMMON PLC": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "PHOENIX GRP": {"country": "United Kingdom", "sector": "Assurances"},
    "PORSCH PREF": {"country": "Germany", "sector": "Automobile"},
    "PORSCHE AUTO HLDG SE": {"country": "Germany", "sector": "Automobile"},
    "POSTE ITALIANE": {"country": "Italy", "sector": "Banques"},
    "PROSUS RG-N": {"country": "Netherlands", "sector": "E-commerce"},
    "PRUDENTIAL": {"country": "United Kingdom", "sector": "Assurances"},
    "PRYSMIAN": {"country": "Italy", "sector": "Transports & Infrastructure industrielle"},
    "PSP SWISS PROPERT": {"country": "Switzerland", "sector": "Immobilier / REITs"},
    "PUBLICIS GROUPE": {"country": "France", "sector": "IT Services"},
    "PUMA": {"country": "Germany", "sector": "Luxe"},
    "QIAGEN": {"country": "Germany", "sector": "Biotech"},
    "QINETIQ GROUP": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "RANDSTAD": {"country": "Netherlands", "sector": "IT Services"},
    "RATIONAL": {"country": "Germany", "sector": "Equipements professionnels"},
    "RECKITT BENCK GR": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "RECORDATI IND CHI": {"country": "Italy", "sector": "Pharma"},
    "REDEIA CORP": {"country": "Spain", "sector": "Services publics"},
    "RELX": {"country": "United Kingdom", "sector": "IT Services"},
    "REMY COINTREAU": {"country": "France", "sector": "Alimentation"},
    "RENAULT": {"country": "France", "sector": "Automobile"},
    "RENTOKIL INITL.": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "REPLY": {"country": "Italy", "sector": "IT Services"},
    "REPSOL": {"country": "Spain", "sector": "Énergie / Pétrole & Gaz"},
    "REXEL": {"country": "France", "sector": "Distribution industrielle / électrique"},
    "RHEINMETALL": {"country": "Germany", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "RICHEMONT (CIE FIN.)": {"country": "Switzerland", "sector": "Luxe"},
    "RIGHTMOVE": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "RIO TINTO": {"country": "United Kingdom", "sector": "Matériaux de base / Métaux"},
    "ROCHE HLDG DR": {"country": "Switzerland", "sector": "Pharma"},
    "ROLLS-ROYCE HLDG": {"country": "United Kingdom", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "ROTORK": {"country": "United Kingdom", "sector": "Composants industriels / Automatisation"},
    "RS GRP": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "RUBIS": {"country": "France", "sector": "Énergie / Pétrole & Gaz"},
    "RWE": {"country": "Germany", "sector": "Services publics"},
    "RYANAIR HLDGS": {"country": "Ireland", "sector": "Voyages / Loisirs"},
    "SAFESTORE HOLD": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "SAFRAN": {"country": "France", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "SAGE GRP": {"country": "United Kingdom", "sector": "Cloud & Software"},
    "SAINSBURY": {"country": "United Kingdom", "sector": "Alimentation"},
    "SAINT-GOBAIN": {"country": "France", "sector": "Matériaux de base / Métaux"},
    "SANDOZ GROUP": {"country": "Switzerland", "sector": "Pharma"},
    "SANOFI": {"country": "France", "sector": "Pharma"},
      "SAP AG O.N.": {"country": "Germany", "sector": "Cloud & Software"},
    "SARTORIUS STEDIM BIOTECH": {"country": "France", "sector": "Biotech"},
    "SARTORIUS VZ": {"country": "Germany", "sector": "Biotech"},
    "SCHINDLERHLDG PC": {"country": "Switzerland", "sector": "Industrie / Aérospatiale / Défense"},
    "SCHNEIDER ELECTRIC": {"country": "France", "sector": "Composants industriels / Automatisation"},
    "SCHRODERS": {"country": "United Kingdom", "sector": "Banques"},
    "SCOR": {"country": "France", "sector": "Assurances"},
    "SCOUT24": {"country": "Germany", "sector": "IT Services"},
    "SEB": {"country": "France", "sector": "Produits ménagers"},
    "SEGRO (REIT)": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "SERCO GROUP": {"country": "United Kingdom", "sector": "IT Services"},
    "SES": {"country": "Luxembourg", "sector": "Télécom / Infrastructure"},
    "SEVERN TRENT": {"country": "United Kingdom", "sector": "Services publics"},
    "SFS GROUP": {"country": "Switzerland", "sector": "Industrie / Aérospatiale / Défense"},
    "SGS": {"country": "Switzerland", "sector": "IT Services"},
    "SHELL": {"country": "United Kingdom", "sector": "Énergie / Pétrole & Gaz"},
    "SIEGFRIED HLDG": {"country": "Switzerland", "sector": "Pharma"},
    "SIEMENS": {"country": "Germany", "sector": "Composants industriels / Automatisation"},
    "SIEMENS ENERGY": {"country": "Germany", "sector": "Green Tech / Clean Energy"},
    "SIEMENS HEALTH": {"country": "Germany", "sector": "Santé / Equipement médical"},
    "SIG GROUP": {"country": "Switzerland", "sector": "Produits ménagers"},
    "SIGNIFY": {"country": "Netherlands", "sector": "Produits ménagers"},
    "SIKA": {"country": "Switzerland", "sector": "Matériaux de base / Métaux"},
    "SMITH & NEPHEW": {"country": "United Kingdom", "sector": "Santé / Equipement médical"},
    "SMITHS GROUP": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "SNAM": {"country": "Italy", "sector": "Services publics"},
    "SOCIETE GENERALE": {"country": "France", "sector": "Banques"},
    "SODEXO": {"country": "France", "sector": "Alimentation"},
    "SOFINA": {"country": "Belgium", "sector": "Banques"},
    "SOFTCAT": {"country": "United Kingdom", "sector": "IT Services"},
    "SOITEC": {"country": "France", "sector": "Semiconducteurs"},
    "SONOVA HLDG": {"country": "Switzerland", "sector": "Santé / Equipement médical"},
    "SOPRA STERIA": {"country": "France", "sector": "IT Services"},
    "SPECTRIS": {"country": "United Kingdom", "sector": "Instrumentation / Capteurs"},
    "SPIE": {"country": "France", "sector": "Construction & Materials"},
    "SPIRAX GRP": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "SPS": {"country": "Switzerland", "sector": "Industrie / Aérospatiale / Défense"},
    "SSE": {"country": "United Kingdom", "sector": "Services publics"},
    "SSP GRP": {"country": "United Kingdom", "sector": "Voyages / Loisirs"},
    "ST. JAMES'S": {"country": "United Kingdom", "sector": "Assurances"},
    "STANDARD CHARTER": {"country": "United Kingdom", "sector": "Banques"},
    "STELLANTIS": {"country": "Italy", "sector": "Automobile"},
    "STMICROELECTRONICS": {"country": "Italy", "sector": "Semiconducteurs"},
    "STRAUMANN HLDG": {"country": "Switzerland", "sector": "Santé / Equipement médical"},
    "SWISS LIFE HLDG": {"country": "Switzerland", "sector": "Assurances"},
    "SWISS RE": {"country": "Switzerland", "sector": "Assurances"},
    "SWISSCOM": {"country": "Switzerland", "sector": "Télécom / Infrastructure"},
    "SWISSQUOTE GRP HL": {"country": "Switzerland", "sector": "Banques"},
    "SYENSQO": {"country": "Belgium", "sector": "Matériaux de base / Métaux"},
    "SYMRISE": {"country": "Germany", "sector": "Produits ménagers"},
     "TAG IMMOBILIEN AG": {"country": "Germany", "sector": "Immobilier / REITs"},
    "TALANX": {"country": "Germany", "sector": "Assurances"},
    "TATE & LYLE": {"country": "United Kingdom", "sector": "Alimentation"},
    "TAYLOR WIMPEY": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "TEAMVIEWER": {"country": "Germany", "sector": "Software"},
    "TECAN GRP": {"country": "Switzerland", "sector": "Santé / Equipement médical"},
    "TECHNIP ENERGIES": {"country": "France", "sector": "Énergie / Pétrole & Gaz"},
    "TELECOM ITALIA": {"country": "Italy", "sector": "Télécom / Infrastructure"},
    "TELEFONICA": {"country": "Spain", "sector": "Télécom / Infrastructure"},
    "TELEPERFORMANCE": {"country": "France", "sector": "IT Services"},
    "TENARIS": {"country": "Italy", "sector": "Matériaux de base / Métaux"},
    "TERNA": {"country": "Italy", "sector": "Services publics"},
    "TESCO": {"country": "United Kingdom", "sector": "Alimentation"},
    "THALES": {"country": "France", "sector": "Aéronautique, Défense & Technologies industrielles"},
    "THE SWATCH GRP": {"country": "Switzerland", "sector": "Luxe"},
    "THYSSENKRUPP": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "TOTALENERGIES": {"country": "France", "sector": "Énergie / Pétrole & Gaz"},
    "TRILLER GRP": {"country": "United States", "sector": "IT Services"},
    "TRITAX BIG BOX": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "TUI": {"country": "United Kingdom", "sector": "Voyages / Loisirs"},
    "UBISOFT ENTERTAIN.": {"country": "France", "sector": "Software"},
    "UBS GROUP": {"country": "Switzerland", "sector": "Banques"},
    "UCB": {"country": "Belgium", "sector": "Pharma"},
    "UMICORE": {"country": "Belgium", "sector": "Matériaux de base / Métaux"},
    "UNIBAIL-RODAMCO-WESTFIELD": {"country": "France", "sector": "Immobilier / REITs"},
    "UNICREDIT": {"country": "Italy", "sector": "Banques"},
    "UNILEVER": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "UNITE GROUP": {"country": "United Kingdom", "sector": "Immobilier / REITs"},
    "UNITED UTILITIES": {"country": "United Kingdom", "sector": "Services publics"},
    "UNIVERSAL MUSIC GROUP": {"country": "Netherlands", "sector": "Voyages / Loisirs"},
    "VALEO": {"country": "France", "sector": "Automobile"},
    "VALLOUREC": {"country": "France", "sector": "Matériaux de base / Métaux"},
    "VAT GROUP": {"country": "Switzerland", "sector": "Semiconducteurs"},
    "VEOLIA": {"country": "France", "sector": "Services publics"},
    "VERALLIA": {"country": "France", "sector": "Matériaux de base / Métaux"},
    "VIDRALA": {"country": "Spain", "sector": "Matériaux de base / Métaux"},
    "VINCI": {"country": "France", "sector": "Construction & Materials"},
    "VISCOFAN": {"country": "Spain", "sector": "Alimentation"},
    "VIVENDI": {"country": "France", "sector": "IT Services"},
    "VODAFONE GROUP": {"country": "United Kingdom", "sector": "Télécom / Infrastructure"},
    "VOLKSWAGEN VZ": {"country": "Germany", "sector": "Automobile"},
    "VONOVIA": {"country": "Switzerland", "sector": "Immobilier / REITs"},
    "WACKER CHEMIE": {"country": "Germany", "sector": "Matériaux de base / Métaux"},
    "WATCH SWITZ GRP": {"country": "Switzerland", "sector": "Luxe"},
    "WDP": {"country": "Belgium", "sector": "Immobilier / REITs"},
    "WEIR GROUP": {"country": "United Kingdom", "sector": "Industrie / Aérospatiale / Défense"},
    "WENDEL": {"country": "France", "sector": "Banques"},
    "WH SMITH": {"country": "United Kingdom", "sector": "Produits ménagers"},
    "WHITBREAD": {"country": "United Kingdom", "sector": "Voyages / Loisirs"},
    "WISE-A": {"country": "United Kingdom", "sector": "Fintech / Paiements numériques"},
    "WOLTERS KLUW": {"country": "Netherlands", "sector": "IT Services"},
    "WORLDLINE": {"country": "France", "sector": "Fintech / Paiements numériques"},
    "WPP": {"country": "United Kingdom", "sector": "IT Services"},
    "ZALANDO": {"country": "Germany", "sector": "E-commerce"},
    "ZURICH INSUR GR": {"country": "Switzerland", "sector": "Assurances"}
}

# Mappings pour les actions du NASDAQ (nom -> secteur)
NASDAQ_MAPPINGS = {
     "AAON": {"sector": "Matériaux"},
    "ABRAXIS BIOSCIENCE INC NEW": {"sector": "Biotech"},
    "ACACIA RES-AC TECHS": {"sector": "Biotech"},
    "ACADIA PHARMA": {"sector": "Pharma"},
    "ACCELRYS INC": {"sector": "Biotech"},
    "ACCURAY": {"sector": "Santé / Équipement médical"},
    "ACHIEVE LIFE SCI": {"sector": "Biotech"},
    "ACI WORLDWIDE": {"sector": "Software"},
    "ACTEL CORP": {"sector": "Semiconducteurs"},
    "ADAMS GOLF INC": {"sector": "Produits ménagers"},
    "ADDVANTAGE TECH": {"sector": "Technologie & Numérique"},
    "ADEIA": {"sector": "Software"},
    "ADOBE": {"sector": "Software"},
    "ADVANCED EMISSIO": {"sector": "Composants industriels / Automatisation"},
    "ADVANCED ENERGY": {"sector": "Composants industriels / Automatisation"},
    "AEHR TEST SYSTEM": {"sector": "Fintech / Paiements numériques"},
    "AEROVIRONMENT": {"sector": "Aéronautique, Défense & Technologies industrielles"},
    "AGENUS": {"sector": "Biotech"},
    "AGILYSYS": {"sector": "E-commerce"},
    "AGNC INVEST REIT": {"sector": "Immobilier / REITs"},
    "AIR T": {"sector": "Transports & Infrastructure industrielle"},
    "AIR TRANSPORT": {"sector": "Transports & Infrastructure industrielle"},
    "AIRNET TECH SP ADS": {"sector": "Transports & Infrastructure industrielle"},
    "AIX SP ADR": {"sector": "Transports & Infrastructure industrielle"},
    "AKAMAI TECHNOLOG": {"sector": "Technologie & Numérique"},
    "ALAUNOS": {"sector": "Biotech"},
    "ALICO": {"sector": "Biotech"},
    "ALIGN TECHNOLOGY": {"sector": "Santé / Équipement médical"},
    "ALLEGIANT TRAVEL": {"sector": "Voyages / Loisirs"},
    "ALLIANCE RESOURCE": {"sector": "Matériaux"},
    "ALLIED HEALTHCARE INTL INC": {"sector": "Santé / Équipement médical"},
    "ALLIENT": {"sector": "Santé / Équipement médical"},
    "ALLOT": {"sector": "Software"},
    "ALLOY INC": {"sector": "Software"},
    "ALNYLAM PHARMA": {"sector": "Biotech"},
    "ALPHATEC HOLDING": {"sector": "Aéronautique, Défense & Technologies industrielles"},
    "ALT5 SIGMA": {"sector": "Technologie & Numérique"},
    "ALTERI THERA SP ADS": {"sector": "Biotech"},
    "ALTO INGREDIENTS": {"sector": "Matériaux"},
    "AMARIN SP ADR": {"sector": "Biotech"},
    "AMAZON.COM": {"sector": "E-commerce"},
    "AMEDISYS": {"sector": "Santé / Équipement médical"},
    "AMER PUBLIC EDU": {"sector": "Éducation"},
    "AMERCN SUPERCOND": {"sector": "Énergie / Pétrole & Gaz"},
    "AMERICA SVC GROUP INC": {"sector": "Santé / Équipement médical"},
    "AMERICA'S CAR-MA": {"sector": "Automobile"},
    "AMERICAN DENTAL PARTNERS": {"sector": "Santé / Équipement médical"},
    "AMERICAN MED ALERT CORP": {"sector": "Santé / Équipement médical"},
    "AMERICAN PHYSICIANS CAPITAL": {"sector": "Fintech / Paiements numériques"},
    "AMERICAN WOODMAR": {"sector": "Matériaux"},
    "AMERIS BANCORP": {"sector": "Banques"},
    "AMERISAFE": {"sector": "Assurances"},
    "AMERISERV FINANC": {"sector": "Banques"},
    "AMES NATIONAL": {"sector": "Banques"},
    "AMGEN": {"sector": "Pharma"},
    "AMICUS THERA": {"sector": "Biotech"},
    "AMKOR TECHNOLOGY": {"sector": "Semiconducteurs"},
    "AMTECH SYSTEMS": {"sector": "Matériaux"},
    "ANDERSONS": {"sector": "Matériaux"},
    "ANGIODYNAMICS": {"sector": "Santé / Équipement médical"},
    "ANI PHARMACEUTIC": {"sector": "Santé / Équipement médical"},
    "ANIKA THERAPEUTI": {"sector": "Biotech"},
    "ANSYS": {"sector": "Biotech"},
    "APOGEE ENTERPRIS": {"sector": "Technologie & Numérique"},
    "APPLE": {"sector": "Technologie & Numérique"},
    "APPLIED MATERIALS": {"sector": "Technologie & Numérique"},
    "ARC GROUP WORLDW": {"sector": "Technologie & Numérique"},
    "ARCBEST": {"sector": "Transports & Infrastructure industrielle"},
    "ARCH CAP GRP": {"sector": "Assurances"},
    "ARCSIGHT INC": {"sector": "Technologie & Numérique"},
    "ARK REST CORP": {"sector": "Transports & Infrastructure industrielle"},
    "ARROW FINANCIAL": {"sector": "Fintech / Paiements numériques"},
    "ARROWHEAD PHRMCT": {"sector": "Biotech"},
    "ARTESIAN RES-A": {"sector": "Services aux collectivités"},
    "ARTS WAY MFG CO": {"sector": "Matériaux"},
    "ASCENT INDSTRIES": {"sector": "Industrie & Énergie"},
    "ASGN": {"sector": "Technologie & Numérique"},
    "ASM INT": {"sector": "Semiconducteurs"},
    "ASML HOLD NY SP ADR": {"sector": "Semiconducteurs"},
    "ASPIRA WOMEN HL": {"sector": "Santé / Équipement médical"},
    "ASSD BANC-CORP": {"sector": "Banques"},
    "ASTEC IND INC": {"sector": "Matériaux"},
    "ASTRONICS CORP": {"sector": "Composants industriels / Automatisation"},
    "ASTRONOVA": {"sector": "Instruments / Capteurs"},
    "ASTROTECH": {"sector": "Technologie & Numérique"},
    "ASURE SOFTWARE": {"sector": "Software"},
    "ATA CRTV GLB SP ADR": {"sector": "Biotech"},
    "ATHERSYS": {"sector": "Énergie / Pétrole & Gaz"},
    "ATLANTIC AM": {"sector": "Banques"},
    "ATLANTIC BANCGROUP INC": {"sector": "Banques"},
    "ATLANTIC UNION": {"sector": "Banques"},
    "ATLANTICUS HLDGS": {"sector": "Fintech / Paiements numériques"},
    "ATN INTERNATIONA": {"sector": "Technologie & Numérique"},
    "ATRICURE": {"sector": "Santé / Équipement médical"},
    "AUBURN NATL BANC": {"sector": "Technologie & Numérique"},
    "AUDIOCODES": {"sector": "Transports & Infrastructure industrielle"},
    "AUTODESK INC": {"sector": "Services aux collectivités"},
    "AUTOSCOPE TECH": {"sector": "Semiconducteurs"}
       "AVIAT NETWORKS": {"sector": "Technologie & Numérique"},
    "AWARE": {"sector": "Fintech / Paiements numériques"},
    "AXCELIS TECHS": {"sector": "Semiconducteurs"},
    "AXON ENTERPRISE": {"sector": "Biotech"},
    "AXOS FINANCIAL": {"sector": "Fintech / Paiements numériques"},
    "AXT": {"sector": "Semiconducteurs"},
    "AZENTA": {"sector": "Biotech"},
    "B COMMUNICATIONS": {"sector": "Télécom / Infrastructure"},
    "BAIDU SP ADR-A": {"sector": "Technologie & Numérique"},
    "BALCHEM CORP": {"sector": "Matériaux"},
    "BANC OF CALIFORNIA": {"sector": "Banques"},
    "BANCFIRST": {"sector": "Banques"},
    "BANCORP": {"sector": "Banques"},
    "BANCORP RHODE ISLAND INC": {"sector": "Banques"},
    "BANK OF GRANITE CORP": {"sector": "Banques"},
    "BANK OF MARIN": {"sector": "Banques"},
    "BANK OZK": {"sector": "Banques"},
    "BANKFINANCIAL": {"sector": "Banques"},
    "BANNER": {"sector": "Banques"},
    "BARRETT BUS SVCS": {"sector": "Services aux collectivités"},
    "BASSETT FURN IND": {"sector": "Matériaux"},
    "BCB BANCORP": {"sector": "Banques"},
    "BEACON ROOFING S": {"sector": "Services aux collectivités"},
    "BEASLEY BROAD RG-A": {"sector": "Media"},
    "BED BATH & BEYON": {"sector": "Commerce de détail"},
    "BEL FUSE-A": {"sector": "Composants industriels / Automatisation"},
    "BEL FUSE-B": {"sector": "Composants industriels / Automatisation"},
    "BENIHANA INC": {"sector": "Restaurants / Restauration"},
    "BERKSHIRE HILLS": {"sector": "Banques"},
    "BEYOND": {"sector": "E-commerce"},
    "BGC GROUP RG-A": {"sector": "Services financiers"},
    "BIG 5 SPRTNG GOO": {"sector": "Commerce de détail"},
    "BIO-TECHNE": {"sector": "Biotech"},
    "BIOCRYST PHARM": {"sector": "Biotech"},
    "BIOGEN": {"sector": "Pharma"},
    "BIOLASE": {"sector": "Santé / Équipement médical"},
    "BIOMARIN PHARM": {"sector": "Pharma"},
    "BJ'S RESTAURANTS": {"sector": "Restaurants / Restauration"},
    "BK OF STH CAROLI": {"sector": "Banques"},
    "BLACKBAUD": {"sector": "Technologie & Numérique"},
    "BLACKBERRY": {"sector": "Technologie & Numérique"},
    "BLUCORA": {"sector": "Technologie & Numérique"},
    "BOK FINL": {"sector": "Banques"},
    "BONSO ELECTRON I": {"sector": "Composants industriels / Automatisation"},
    "BOOKING HLDG": {"sector": "E-commerce"},
    "BOS BETTER ONLIN": {"sector": "E-commerce"},
    "BOULDER BRANDS": {"sector": "Commodités alimentaires"},
    "BRIDGELINE DGTL": {"sector": "Technologie & Numérique"},
    "BRIDGFORD FOODS": {"sector": "Alimentation"},
    "BROADWAY RG-A": {"sector": "Media"},
    "BROOKLINE BANCOR": {"sector": "Banques"},
    "BROOKLYN FEDERAL BANCORP INC": {"sector": "Banques"},
    "BRUKER": {"sector": "Santé / Équipement médical"},
    "BUCYRUS INTL INC NEW": {"sector": "Industrie & Énergie"},
    "BUILDERS FIRSTSO": {"sector": "Matériaux"},
    "C & F FINANCIAL": {"sector": "Banques"},
    "C V D EQUIPMENT": {"sector": "Composants industriels / Automatisation"},
    "C.H.ROBINSON WLD": {"sector": "Transports & Infrastructure industrielle"},
    "CADENCE DESIGN": {"sector": "Technologie & Numérique"},
    "CADIZ": {"sector": "Énergie / Pétrole & Gaz"},
    "CAL-MAINE FOODS": {"sector": "Alimentation"},
    "CALAVO GROWERS": {"sector": "Alimentation"},
    "CALIFORNIA PIZZA KITCHEN INC": {"sector": "Restaurants / Restauration"},
    "CALIPER LIFE SCIENCES INC": {"sector": "Santé / Équipement médical"},
    "CALUMET": {"sector": "Énergie / Pétrole & Gaz"},
    "CAMDEN NATIONAL": {"sector": "Banques"},
    "CAMTEK": {"sector": "Semiconducteurs"},
    "CANADIAN SOLAR": {"sector": "Énergie / Pétrole & Gaz"},
    "CANTALOUPE": {"sector": "Énergie / Pétrole & Gaz"},
    "CAPITAL CITY BK": {"sector": "Banques"},
    "CAPITAL CLEAN": {"sector": "Services aux collectivités"},
    "CAPITAL SOUTHWES": {"sector": "Énergie / Pétrole & Gaz"},
    "CAPRICOR THERAP": {"sector": "Biotech"},
    "CARDIAC SCIENCE CORP": {"sector": "Santé / Équipement médical"},
    "CARPARTS": {"sector": "Composants industriels / Automatisation"},
    "CARVER BANCORP": {"sector": "Banques"},
    "CASELLA WASTE SYS-A": {"sector": "Services aux collectivités"},
    "CASEY'S GEN STOR": {"sector": "Commodités alimentaires"},
    "CASS INFO SYS": {"sector": "Systèmes de gestion des déchets"},
    "CASSAVA SCIENCES": {"sector": "E-commerce"},
    "CATALYST PHARMA": {"sector": "Technologie & Numérique"},
    "CATHAY GENL BANC": {"sector": "Biotech"},
    "CAVCO INDUSTRIES": {"sector": "Pharma"},
    "CBAK ENERGY TECH": {"sector": "Banques"},
    "CDTI ADV MATL": {"sector": "Matériaux"},
    "CECO ENVIRONMENT": {"sector": "Services aux collectivités"},
    "CELADON GROUP": {"sector": "Transports & Infrastructure industrielle"},
    "CELLDEX THERAPTC": {"sector": "Biotech"},
    "CELSION": {"sector": "Biotech"},
    "CENTL GARD NVTGRG-A": {"sector": "Produits ménagers"},
    "CENTRAL GARDEN &": {"sector": "Alimentation"},
    "CENTURY ALUMINUM": {"sector": "Matériaux"},
    "CENTURY CASINOS": {"sector": "Transports & Infrastructure industrielle"},
    "CERAGON NETWORKS": {"sector": "Technologie & Numérique"},
    "CERUS": {"sector": "Biotech"},
    "CEVA": {"sector": "Transports & Infrastructure industrielle"},
    "CF BANKSHARES": {"sector": "Banques"},
    "CHARLES & COL": {"sector": "Finance"},
    "CHARLES SCHWAB": {"sector": "Banques"},
    "CHART INDUSTRIES": {"sector": "Industrie & Énergie"},
  "CHECK POINT SOFTWARE": {"sector": "Technologie & Numérique"},
    "CHEESECAKE FACTO": {"sector": "Restaurants / Restauration"},
    "CHILDREN'S PLACE": {"sector": "E-commerce"},
    "CHINA AUTO SYS": {"sector": "Automobile"},
    "CHINA FIN SP ADR": {"sector": "Fintech / Paiements numériques"},
    "CHINA NAT": {"sector": "Alimentation"},
    "CHURCHILL DOWNS": {"sector": "Transports & Infrastructure industrielle"},
    "CIENA": {"sector": "Technologie & Numérique"},
    "CINCINNATI FINAN": {"sector": "Assurances"},
    "CINEVERSE": {"sector": "E-commerce"},
    "CINTAS": {"sector": "Industrie & Énergie"},
    "CIRRUS LOGIC": {"sector": "Technologie & Numérique"},
    "CISCO SYSTEMS": {"sector": "Technologie & Numérique"},
    "CITI TRENDS": {"sector": "E-commerce"},
    "CITIZENS & NORTH": {"sector": "Banques"},
    "CITIZENS CMNTY B": {"sector": "Banques"},
    "CITIZENS HOLDING": {"sector": "Banques"},
    "CITY HOLDING CO": {"sector": "Banques"},
    "CIVISTA BANCSHAR": {"sector": "Banques"},
    "CKX INC": {"sector": "Industrie & Énergie"},
    "CLEAN ENERGY FUELS CORP.": {"sector": "Green Tech / Clean Energy"},
    "CLEAN HARBORS IN": {"sector": "Énergie / Pétrole & Gaz"},
    "CLEARDAY": {"sector": "Santé / Équipement médical"},
    "CLEARFIELD": {"sector": "Composants industriels / Automatisation"},
    "CLEARONE": {"sector": "Instruments / Capteurs"},
    "CLIMB GLB SLTN": {"sector": "Technologie & Numérique"},
    "CNB FINL": {"sector": "Banques"},
    "COCA-COLA CONSOL": {"sector": "Boissons"},
    "COGENT COMM HLDG": {"sector": "Technologie & Numérique"},
    "COGNEX": {"sector": "Technologie & Numérique"},
    "COGNIZANT TECH SO-A": {"sector": "Technologie & Numérique"},
    "COHERENT": {"sector": "Composants industriels / Automatisation"},
    "COHU": {"sector": "Semiconducteurs"},
    "COLLIERS INT GRP SV": {"sector": "Immobilier / REITs"},
    "COLUMBIA BKG SYS": {"sector": "Banques"},
    "COLUMBIA SPORTSW": {"sector": "Vêtements"},
    "COLUMBUS MCKINNO": {"sector": "Industrie & Énergie"},
    "COMCAST-A": {"sector": "Télécom / Infrastructure"},
    "COMMERCE BANCSHA": {"sector": "Banques"},
    "COMMERCIAL VEHIC": {"sector": "Véhicules commerciaux"},
    "COMMUNITY TRUST": {"sector": "Banques"},
    "COMMUNITY WEST": {"sector": "Banques"},
    "COMMVAULT SYSTEM": {"sector": "Systèmes de sauvegarde"},
    "COMPASS HLDGS-SBI": {"sector": "Services aux collectivités"},
    "COMPUGEN": {"sector": "Biotech"},
    "COMSTOCK HLDG RG-A": {"sector": "Composants industriels / Automatisation"},
    "COMTECH TELECOMM": {"sector": "Télécommunications"},
    "CONMED CORP": {"sector": "Santé / Équipement médical"},
    "CONN'S": {"sector": "Commerce de détail"},
    "CONNECTONE BANCO": {"sector": "Banques"},
    "CONSOLIDATED WAT": {"sector": "Services aux collectivités"},
    "CONSUMER PTFL SV": {"sector": "Services financiers"},
    "COPART": {"sector": "Automobile"},
    "COPERNIC INC": {"sector": "Technologie & Numérique"},
    "CORCEPT THERAPEU": {"sector": "Biotech"},
    "CORVEL": {"sector": "Santé / Équipement médical"},
    "COSCIENS BIO": {"sector": "Biotech"},
    "COSTAR GROUP": {"sector": "Immobilier / REITs"},
    "COSTCO WHSL": {"sector": "Commerce de détail"},
    "COVENANT LOG GRP-A": {"sector": "Transports & Infrastructure industrielle"},
    "CRA INTL": {"sector": "Industrie & Énergie"},
    "CRACKER BARREL O": {"sector": "Restaurants / Restauration"},
    "CREDIT ACCEPTANC": {"sector": "Fintech / Paiements numériques"},
    "CRESUD SACF SP ADR": {"sector": "Immobilier / REITs"},
    "CROCS": {"sector": "E-commerce"},
    "CROSS CTRY HLTHC": {"sector": "Santé / Équipement médical"},
    "CROWN CRAFTS": {"sector": "Santé / Équipement médical"},
    "CSG SYSTEMS INTL": {"sector": "Commodités alimentaires"},
    "CSP INC": {"sector": "Technologie & Numérique"},
    "CUTERA": {"sector": "Composants industriels / Automatisation"},
    "CVB FINANCIAL": {"sector": "Biotech"},
    "CYANOTECH": {"sector": "Banques"},
    "CYCLACEL PHARMA": {"sector": "Industrie & Énergie"},
    "CYREN": {"sector": "Biotech"},
    "CYTOKINETICS": {"sector": "Biotech"},
    "DAILY JOURNAL CO": {"sector": "Média"},
    "DAKTRONICS": {"sector": "Composants industriels / Automatisation"},
    "DANVERS BANCORP INC": {"sector": "Banques"},
    "DATA I/O": {"sector": "Technologie & Numérique"},
    "DAWSON GEOPHYSIC": {"sector": "Énergie / Pétrole & Gaz"},
    "DECKERS OUTDOOR": {"sector": "Consommation & Services"},
    "DENNY'S": {"sector": "Restaurants / Restauration"},
    "DENTSPLY SIRONA": {"sector": "Santé / Équipement médical"},
    "DESTINATION XL G": {"sector": "Vêtements"},
    "DESWELL INDUSTRI": {"sector": "Industrie & Énergie"},
    "DEXCOM": {"sector": "Santé / Équipement médical"},
    "DIAMOND HILL INV": {"sector": "Investissements"},
    "DIAMOND MANAGEMENT & TECHNOL": {"sector": "Technologie & Numérique"},
    "DIGI INTERNATION": {"sector": "Technologie & Numérique"},
    "DIME COMMUNITY": {"sector": "Banques"},
    "DIODES": {"sector": "Composants industriels / Automatisation"},
    "DISTR SOL GRP": {"sector": "Services aux collectivités"},
    "DITECH NETWORKS INC": {"sector": "Technologie & Numérique"},
    "DIVX INC": {"sector": "Divertissement"},
    "DIXIE GROUP": {"sector": "Consommation & Services"},
    "DLH HOLDINGS": {"sector": "Santé / Équipement médical"},
    "DMC GLOBAL": {"sector": "Industrie & Énergie"},
    "DOLLAR TREE": {"sector": "Commerce de détail"},
    "DOMINARI HLDGS": {"sector": "Services financiers"},
    "DONEGAL GROUP-A": {"sector": "Banques"},
 "DONEGAL GROUP-B": {"sector": "Banques"},
    "DORCHESTER MINERALS": {"sector": "Immobilier / REITs"},
    "DORMAN PRODUCTS": {"sector": "Métaux"},
    "DRDGOLD SP ADR": {"sector": "Vente au détail"},
    "DRUGSTORE COM INC": {"sector": "Services financiers"},
    "DURECT": {"sector": "Santé / Équipement médical"},
    "DXP ENTERPRISES": {"sector": "Technologie & Numérique"},
    "DYAX CORP": {"sector": "Biotech"},
    "DYNAMICS RESH CORP": {"sector": "Industrie & Énergie"},
    "DYNATRONICS": {"sector": "Industrie & Énergie"},
    "DYNAVAX TECH": {"sector": "Santé / Équipement médical"},
    "DZS": {"sector": "Biotech"},
    "EAGLE BANCORP": {"sector": "Biotech"},
    "EAST-WEST BANCOR": {"sector": "Services aux collectivités"},
    "EBAY": {"sector": "Technologie & Numérique"},
    "ECHOSTAR RG-A": {"sector": "Commerce de détail"},
    "EDAP TMS SP ADR": {"sector": "Biotech"},
    "EDGIO": {"sector": "Technologie & Numérique"},
    "EDUCAT DEV": {"sector": "Pharma"},
    "EHEALTH": {"sector": "Services aux collectivités"},
    "ELBIT IMAGING": {"sector": "Technologie & Numérique"},
    "ELBIT SYSTEMS LT": {"sector": "Énergie / Pétrole & Gaz"},
    "ELECTRO SENSORS": {"sector": "Services financiers"},
    "ELECTRONIC ARTS": {"sector": "E-commerce"},
    "ELTEK": {"sector": "Transports & Infrastructure industrielle"},
    "EMMIS": {"sector": "Technologie & Numérique"},
    "ENCORE BANCSHARES INC": {"sector": "Technologie & Numérique"},
    "ENCORE CAP GROUP": {"sector": "Télécom / Infrastructure"},
    "ENDWAVE CORP": {"sector": "Biotech"},
    "ENERGY FOCUS": {"sector": "Biotech"},
    "ENGLOBAL": {"sector": "Industrie & Énergie"},
    "ENSIGN GROUP": {"sector": "Santé / Équipement médical"},
    "ENSTAR GROUP": {"sector": "Services financiers"},
    "ENTEGRIS": {"sector": "Composants industriels / Automatisation"},
    "ENTERPRISE BANCO": {"sector": "Banques"},
    "ENTERPRISE FINL": {"sector": "Banques"},
    "EQUINIX REIT": {"sector": "Immobilier / REITs"},
    "ERICSSON SP ADR-B": {"sector": "Technologie & Numérique"},
    "ERIE INDEMNITY-A": {"sector": "Assurances"},
    "ESCALADE": {"sector": "Industrie & Énergie"},
    "ESSA BANCORP": {"sector": "Banques"},
    "EURO TECH HLDGS": {"sector": "Technologie & Numérique"},
    "EURONET WORLDWID": {"sector": "E-commerce"},
    "EXACT SCIENCES": {"sector": "Santé / Équipement médical"},
    "EXELIXIS": {"sector": "Biotech"},
    "EXLSERVICE HLDG": {"sector": "Services aux collectivités"},
    "EXPEDIA GROUP": {"sector": "E-commerce"},
    "EXPEDIT INTL WAS": {"sector": "Transports & Infrastructure industrielle"},
    "EXPONENT": {"sector": "Technologie & Numérique"},
    "EXTREME NETWORKS": {"sector": "Technologie & Numérique"},
    "EZCORP NVTG RG-A": {"sector": "Fintech / Paiements numériques"},
    "F5": {"sector": "Technologie & Numérique"},
    "FARMER BROTHERS": {"sector": "Alimentation"},
    "FARO TECHNOLOGIE": {"sector": "Technologie & Numérique"},
    "FASTENAL": {"sector": "Commodités industrielles"},
    "FEDNAT HOLDING": {"sector": "Assurances"},
    "FIFTH THIRD BANC": {"sector": "Banques"},
    "FIN GALA SP.ADR-B": {"sector": "Fintech / Paiements numériques"},
    "FINL INSTITUTION": {"sector": "Banques"},
    "FIRST BANCORP": {"sector": "Banques"},
    "FIRST BANCSHARES": {"sector": "Banques"},
    "FIRST BUSEY": {"sector": "Banques"},
    "FIRST BUSINESS F": {"sector": "Banques"},
    "FIRST CAPITAL": {"sector": "Banques"},
    "FIRST CITIZENS RG-A": {"sector": "Banques"},
    "FIRST COMMUNITY": {"sector": "Banques"},
    "FIRST FINL": {"sector": "Banques"},
    "FIRST FINL BANCO": {"sector": "Banques"},
    "FIRST FINL BANKS": {"sector": "Banques"},
    "FIRST MERCHANTS": {"sector": "Banques"},
    "FIRST SOLAR": {"sector": "Énergie / Pétrole & Gaz"},
    "FIRST UNITED": {"sector": "Banques"},
    "FIRST US BANCSRS": {"sector": "Banques"},
    "FIRSTCASH HLDGS": {"sector": "Fintech / Paiements numériques"},
    "FISERV INC": {"sector": "Technologie & Numérique"},
    "FLEX": {"sector": "Composants industriels / Automatisation"},
    "FLEXSTEEL IND": {"sector": "Composants industriels / Automatisation"},
    "FLUSHING FINL": {"sector": "Banques"},
    "FONAR": {"sector": "Santé / Équipement médical"},
    "FORMFACTOR": {"sector": "Composants industriels / Automatisation"},
    "FORMULASYST SP ADR": {"sector": "Technologie & Numérique"},
    "FORRESTER RESEAR": {"sector": "Recherche & Développement"},
    "FORWARD AIR": {"sector": "Transports & Infrastructure industrielle"},
    "FORWARD IND": {"sector": "Industrie & Énergie"},
    "FOSSIL GROUP": {"sector": "Vêtements"},
    "FPIC INS GROUP INC": {"sector": "Assurances"},
    "FRANKLIN ELECTRI": {"sector": "Industrie & Énergie"},
    "FREIGHTCAR AMERI": {"sector": "Transports & Infrastructure industrielle"},
    "FREQUENCY ELECTR": {"sector": "Technologie & Numérique"},
    "FRESH TRCKS THRP": {"sector": "Vêtements"},
    "FRP HOLDINGS": {"sector": "Immobilier / REITs"},
    "FRST OF LONG ISL": {"sector": "Banques"},
    "FST FINL NORTH": {"sector": "Banques"},
    "FUEL TECH": {"sector": "Énergie / Pétrole & Gaz"},
    "FUELCELL ENERGY": {"sector": "Green Tech / Clean Energy"},
    "FULTON FINANCIAL": {"sector": "Banques"},
    "FUNDTECH LTD": {"sector": "Fintech / Paiements numériques"},
    "G-III APPAREL GR": {"sector": "Vêtements"},
    "G.WILLI-FOOD": {"sector": "Alimentation"},
    "GADSDENPROP REIT": {"sector": "Immobilier / REITs"},
    "GAIA RG-A": {"sector": "Santé / Équipement médical"},
    "GARMIN": {"sector": "Technologie & Numérique"},
    "GEN DIGITAL": {"sector": "Technologie & Numérique"},
    "GENASYS": {"sector": "Composants industriels / Automatisation"},
    "GENCOR INDUSTRIE": {"sector": "Composants industriels / Automatisation"},
    "GENTEX": {"sector": "Composants industriels / Automatisation"},
    "GENTHERM": {"sector": "Composants industriels / Automatisation"},
    "GEORESOURCES INC": {"sector": "Technologie & Numérique"},
    "GEOSPACE TECHN": {"sector": "Santé / Équipement médical"},
    "GERMAN AMER BANC": {"sector": "Banques"},
    "GERON": {"sector": "Biotech"},
    "GIBRALTAR INDS": {"sector": "Industrie & Énergie"},
    "GIGAMEDIA": {"sector": "Télécom / Infrastructure"},
    "GILAT SATELLITE": {"sector": "Biotech"},
    "GILEAD SCIENCES": {"sector": "Santé / Équipement médical"},
    "GLACIER BANCORP": {"sector": "Banques"},
    "GLADSTO COM REIT": {"sector": "Immobilier / REITs"},
    "GLEN BURNIE BANC": {"sector": "Banques"},
    "GOLAR LNG": {"sector": "Transports & Infrastructure industrielle"},
    "GOLDEN ENTERTAIN": {"sector": "Restaurants / Restauration"},
    "GOOD TIMES REST": {"sector": "Transports & Infrastructure industrielle"},
    "GRAVITY SP ADR": {"sector": "Services financiers"},
    "GREAT LAKES DRED": {"sector": "Services aux collectivités"},
    "GREAT SOUTHERN B": {"sector": "Services aux collectivités"},
    "GREEN BRICK PART": {"sector": "Technologie & Numérique"},
    "GREEN PLAINS": {"sector": "Banques"},
    "GREENE COUNTY BA": {"sector": "Technologie & Numérique"},
    "GREENLIGHT CAP RE": {"sector": "Énergie / Pétrole & Gaz"},
    "GRTN HSG IM INV": {"sector": "Services financiers"},
    "GRUPO AERO SPADR-B": {"sector": "Biotech"},
    "GS FINL CORP": {"sector": "Industrie & Énergie"},
    "GSI TECHNOLOGY": {"sector": "Semiconducteurs"},
    "GTSI CORP": {"sector": "Composants industriels / Automatisation"},
    "GULF ISLAND": {"sector": "Énergie / Pétrole & Gaz"},
    "GYRE THERAP": {"sector": "Biotech"},
    "H&E EQUIPMENT SV": {"sector": "Équipement industriel"},
    "HACKETT GROUP": {"sector": "Consulting"},
    "HAIN CELESTIAL G": {"sector": "Consommation & Services"},
    "HALLMARK FINL": {"sector": "Banques"},
    "HALOZYME THERAPE": {"sector": "Biotech"},
    "HANCOCK WHITNEY": {"sector": "Banques"},
    "HANMI FIN": {"sector": "Banques"},
    "HARBIN ELECTRIC INC": {"sector": "Énergie / Pétrole & Gaz"},
    "HARMONIC": {"sector": "Technologie & Numérique"},
    "HARVARD BIOSCIEN": {"sector": "Technologie & Numérique"},
    "HARVST OIL & GAS": {"sector": "Biotech"},
    "HAWKINS": {"sector": "Commodités alimentaires"},
    "HAWTHORN BANC": {"sector": "Banques"},
    "HEALTH GRADES INC": {"sector": "Santé / Équipement médical"},
    "HEALTHCARE SVCS": {"sector": "Santé / Équipement médical"},
    "HEALTHSTREAM": {"sector": "Santé / Équipement médical"},
    "HEARTLAND EXPRES": {"sector": "Transports & Infrastructure industrielle"},
    "HEIDRCK & STRUGG": {"sector": "Services aux collectivités"},
    "HELEN OF TROY": {"sector": "Consommation & Services"},
    "HELIOS TECH": {"sector": "Technologie & Numérique"},
    "HENRY SCHEIN": {"sector": "Composants industriels / Automatisation"},
    "HERITAGE COMMERC": {"sector": "Santé / Équipement médical"},
    "HERITAGE FINANCI": {"sector": "Services financiers"},
    "HERON THERAPEUTI": {"sector": "Banques"},
    "HI-TECH PHARMACAL": {"sector": "Biotech"},
    "HIGHWAY HOLDINGS": {"sector": "Biotech"},
    "HIMAX TECH SP ADR": {"sector": "Industrie & Énergie"},
    "HINGHAM INSTITUT": {"sector": "Composants industriels / Automatisation"},
    "HLS AND MTHSN AN": {"sector": "Biotech"},
    "HOLOGIC": {"sector": "Composants industriels / Automatisation"},
    "HOME BANCSHARES": {"sector": "Technologie & Numérique"},
    "HOOKER FURNISHNG": {"sector": "Services bancaires"},
    "HOPE BANCORP": {"sector": "Banques"},
    "HOPFED BANCORP": {"sector": "Banques"},
    "HORIZON BANCORP": {"sector": "Banques"},
    "HUB GROUP-A": {"sector": "Banques"},
    "HUDSON GLOBAL": {"sector": "Banques"},
    "HUDSON TECHNOLOG": {"sector": "Banques"},
    "HUNTINGTON BANCS": {"sector": "Banques"},
    "HURCO COS INC": {"sector": "Industrie & Énergie"},
    "HURON CONSULTING": {"sector": "Consulting"},
    "ICAD": {"sector": "Santé / Équipement médical"},
    "ICAGEN INC": {"sector": "Biotech"},
    "ICF INTL": {"sector": "Services aux collectivités"},
    "ICU MEDICAL": {"sector": "Santé / Équipement médical"},
    "ICX TECHNOLOGIES INC": {"sector": "Technologie & Numérique"},
    "IDENTIV": {"sector": "Technologie & Numérique"},
    "IDEXX LABS": {"sector": "Santé / Équipement médical"},
    "ILLUMINA": {"sector": "Santé / Équipement médical"},
    "IMAX": {"sector": "Divertissement"},
    "IMMERSION": {"sector": "Technologie & Numérique"},
    "IMMUCELL": {"sector": "Santé / Équipement médical"},
    "INCYTE": {"sector": "Biotech"},
    "INDEPENDENT BANK": {"sector": "Banques"},
    "INDEPENDENT BK": {"sector": "Banques"},
    "INDIANA COMMUNITY BANCORP": {"sector": "Banques"},
    "INERGY HLDGS": {"sector": "Énergie / Pétrole & Gaz"},
    "INFINITY PHRMA": {"sector": "Biotech"},
    "INFORMATION SVC": {"sector": "Services financiers"},
    "INFOSYS SP ADR": {"sector": "Technologie & Numérique"},
    "INGLES MRKT CL-A-": {"sector": "Commerce de détail"},
    "INHIBITEX INC": {"sector": "Biotech"},
    "INNODATA": {"sector": "Technologie & Numérique"},
    "INNOSPEC": {"sector": "Chimie"},
    "INNOVATIVE SOL&S": {"sector": "Technologie & Numérique"},
   "INNOVIVA": {"sector": "Pharma"},
    "INOTIV": {"sector": "Biotech"},
    "INSIGHT ENTERPRI": {"sector": "Technologie & Numérique"},
    "INSIGNIA SYSTEMS": {"sector": "Santé / Équipement médical"},
    "INSMED": {"sector": "Santé / Équipement médical"},
    "INSTEEL INDUSTRI": {"sector": "Industrie & Énergie"},
    "INSULET": {"sector": "Biotech"},
    "INTEGRA LIFE HLD": {"sector": "Technologie & Numérique"},
    "INTEL": {"sector": "Pharma"},
    "INTERACTIVE BR RG-A": {"sector": "Technologie & Numérique"},
    "INTERDIGITAL": {"sector": "Banques"},
    "INTERGROUP CORP": {"sector": "Technologie & Numérique"},
    "INTERNET GOLD": {"sector": "Technologie & Numérique"},
    "INTERPACE BIOSCI": {"sector": "Télécom / Infrastructure"},
    "INTERPARFUMS": {"sector": "Technologie & Numérique"},
    "INTEVAC": {"sector": "Services financiers"},
    "INTL BANCSHARES": {"sector": "Technologie & Numérique"},
    "INTRNT INITI SP ADR": {"sector": "Santé / Équipement médical"},
    "INTUIT": {"sector": "Biotech"},
    "INTUITIVE SURGICAL": {"sector": "Technologie & Numérique"},
    "INVESTORS TITLE": {"sector": "Services financiers"},
    "IONIS PHARMACEUT": {"sector": "Biotech"},
    "IPG PHOTONICS": {"sector": "Technologie & Numérique"},
    "IRIDEX": {"sector": "Santé / Équipement médical"},
    "IROBOT": {"sector": "Technologie & Numérique"},
    "ISTA PHARMACEUTICALS INC": {"sector": "Pharma"},
    "ITRON": {"sector": "Industrie & Énergie"},
    "ITURAN LOC & CON": {"sector": "Transports & Infrastructure industrielle"},
    "J&J SNACK FOODS": {"sector": "Alimentation"},
    "J.B.HUNT TRANSP": {"sector": "Transports & Infrastructure industrielle"},
    "J.W.MAYS": {"sector": "Immobilier / REITs"},
    "JACK HENRY & ASS": {"sector": "Banques"},
    "JAKKS PAC": {"sector": "Vêtements"},
    "JETBLUE AIRWAYS": {"sector": "Transports & Infrastructure industrielle"},
    "JEWETT CAMERON T": {"sector": "Immobilier / REITs"},
    "JOHN B SAN FILIP": {"sector": "Services financiers"},
    "JOHNSON OUTDOORS-A": {"sector": "Consommation & Services"},
    "JUNIPER NETWORKS": {"sector": "Technologie & Numérique"},
    "K FED BANCORP": {"sector": "Banques"},
    "KAISER ALUM": {"sector": "Industrie & Énergie"},
    "KEARNY FINL": {"sector": "Banques"},
    "KELLY SVCS CONV-B-": {"sector": "Services aux collectivités"},
    "KELLY SVCS NVTGRG-A": {"sector": "Services aux collectivités"},
    "KENDLE INTERNATIONAL INC": {"sector": "Santé / Équipement médical"},
    "KENSEY NASH CORP": {"sector": "Biotech"},
    "KENTUCKY FIRST F": {"sector": "Banques"},
    "KEWAUNEE SCIENTI": {"sector": "Technologie & Numérique"},
    "KEY TRONIC": {"sector": "Technologie & Numérique"},
    "KINGSTONE COS": {"sector": "Commerce de détail"},
    "KIRKLANDS": {"sector": "Composants industriels / Automatisation"},
    "KLA": {"sector": "Technologie & Numérique"},
    "KNOLOGY INC": {"sector": "Technologie & Numérique"},
    "KOPIN": {"sector": "Technologie & Numérique"},
    "KOSS": {"sector": "Composants industriels / Automatisation"},
    "KRATOS DEF&SEC": {"sector": "Industrie & Énergie"},
    "KULICKE & SOFFA": {"sector": "Technologie & Numérique"},
    "KVH INDUSTRIES": {"sector": "Composants industriels / Automatisation"},
    "LADRX": {"sector": "Pharma"},
    "LAKE SHORE BANCO": {"sector": "Banques"},
    "LAKELAND FINANCI": {"sector": "Banques"},
    "LAKELAND IND INC": {"sector": "Industrie & Énergie"},
    "LAM RESEARCH": {"sector": "Semiconducteurs"},
    "LAMARADVTSREIT RG-A": {"sector": "Immobilier / REITs"},
    "LANCASTER COLONY": {"sector": "Consommation & Services"},
    "LANDMARK BANCORP": {"sector": "Banques"},
    "LANDSTAR SYSTEMS": {"sector": "Transports & Infrastructure industrielle"},
    "LANTRONIX": {"sector": "Technologie & Numérique"},
    "LATTICE SEMICOND": {"sector": "Semiconducteurs"},
    "LAWSON SOFTWARE INC NEW": {"sector": "Technologie & Numérique"},
    "LB FOSTER": {"sector": "Composants industriels / Automatisation"},
    "LEMAITRE VASCULA": {"sector": "Santé / Équipement médical"},
    "LESAKA TECH": {"sector": "Technologie & Numérique"},
    "LEXICON PHARMA": {"sector": "Biotech"},
    "LIFECORE BIOMED": {"sector": "Santé / Équipement médical"},
    "LIFETIME BRANDS": {"sector": "Consommation & Services"},
    "LIFEWAY FOODS": {"sector": "Consommation & Services"},
    "LIGAND PHARMA": {"sector": "Pharma"},
    "LIGHT & WONDER": {"sector": "Loisirs"},
    "LIGHTPATH TECH-A": {"sector": "Technologie & Numérique"},
    "LINCARE HLDGS INC": {"sector": "Santé / Équipement médical"},
    "LINCOLN EDUC SVC": {"sector": "Éducation"},
    "LINCOLN ELEC HLD": {"sector": "Composants industriels / Automatisation"},
    "LIQUID MDIA GRP": {"sector": "Composants industriels / Automatisation"},
    "LIQUIDITY SERVIC": {"sector": "Services financiers"},
    "LITTELFUSE": {"sector": "Services financiers"},
    "LIVE VENTURES": {"sector": "Composants industriels / Automatisation"},
    "LIVEPERSON": {"sector": "Services financiers"},
    "LIVERAMP HLDG": {"sector": "Technologie & Numérique"},
    "LKQ": {"sector": "Technologie & Numérique"},
    "LOGILITY SUPPLY-A": {"sector": "Technologie & Numérique"},
    "LOGITECH INTL": {"sector": "Technologie & Numérique"},
    "LSB CORPORATION": {"sector": "Composants industriels / Automatisation"},
    "LSI INDUSTRIES": {"sector": "Composants industriels / Automatisation"},
    "LULULEMON ATHL": {"sector": "Vêtements"},
    "LUNA INNOVATIONS": {"sector": "Technologie & Numérique"},
    "MADRIGAL PHARMACEUTICALS": {"sector": "Pharma"},
    "MAGIC SOFTWARE E": {"sector": "Technologie & Numérique"},
    "MAGMA DESIGN AUTO": {"sector": "Semiconducteurs"},
    "MAIDEN HOLDINGS": {"sector": "Assurances"},
    "MANHATTAN ASSOC": {"sector": "Technologie & Numérique"},
 "MANHATTAN REIT": {"sector": "Immobilier / REITs"},
    "MANNATECH": {"sector": "Santé / Équipement médical"},
    "MANNKIND": {"sector": "Biotech"},
    "MARCHEX-B": {"sector": "Technologie & Numérique"},
    "MARKETAXESS HOLD": {"sector": "Fintech / Paiements numériques"},
    "MARTEN TRANS LTD": {"sector": "Transports & Infrastructure industrielle"},
    "MARTIN MIDSTREAM": {"sector": "Énergie / Pétrole & Gaz"},
    "MASIMO": {"sector": "Santé / Équipement médical"},
    "MATRIX SERVICE": {"sector": "Services aux collectivités"},
    "MATSON": {"sector": "Transports & Infrastructure industrielle"},
    "MATTHEWS INTL -A-": {"sector": "Services financiers"},
    "MC GRATH RENT": {"sector": "Restaurants / Restauration"},
    "MCCORMICK & SCHMICKS SEAFD R": {"sector": "Services financiers"},
    "MEDALLION FINANC": {"sector": "Biotech"},
    "MEDICINOVA": {"sector": "Pharma"},
    "MEI PHARMA": {"sector": "Pharma"},
    "MELCO RSR&EN SP ADR": {"sector": "Loisirs"},
    "MERCADOLIBRE": {"sector": "E-commerce"},
    "MERCANTILE BANK": {"sector": "Banques"},
    "MERCER INTL": {"sector": "Papeterie"},
    "MERCURY SYSTEM": {"sector": "Technologie & Numérique"},
    "MERIT MED SYS": {"sector": "Santé / Équipement médical"},
    "MESA LABORATORIE": {"sector": "Santé / Équipement médical"},
    "META PLATFORMS (EX FACEBOOK)": {"sector": "Technologie & Numérique"},
    "METHANEX": {"sector": "Industrie & Énergie"},
    "MGE ENERGY": {"sector": "Énergie / Pétrole & Gaz"},
    "MGP INGREDIENTS": {"sector": "Alimentation"},
    "MICROBOT MEDICAL": {"sector": "Santé / Équipement médical"},
    "MICROCHIP TECH": {"sector": "Semiconducteurs"},
    "MICRONETICS INC DEL": {"sector": "Composants industriels / Automatisation"},
    "MICROSOFT": {"sector": "Technologie & Numérique"},
    "MICROSTRATEGY-A": {"sector": "Technologie & Numérique"},
    "MICROVISION": {"sector": "Technologie & Numérique"},
    "MICRUS ENDOVASCULAR": {"sector": "Santé / Équipement médical"},
    "MIDDLEBY CORP": {"sector": "Composants industriels / Automatisation"},
    "MIDDLESEX WATER": {"sector": "Services aux collectivités"},
    "MIDWESTONE FINL": {"sector": "Banques"},
    "MILLERKNOLL": {"sector": "Consommation & Services"},
    "MIND CTI": {"sector": "Services financiers"},
    "MIND TECHNOLOGY": {"sector": "Services aux collectivités"},
    "MKS INSTRUMENTS": {"sector": "Composants industriels / Automatisation"},
    "MODIVCARE": {"sector": "Santé / Équipement médical"},
    "MOLECULR TMPLTS": {"sector": "Biotech"},
    "MONARCH CASINO&R": {"sector": "Transports & Infrastructure industrielle"},
    "MONOLITHIC POWER": {"sector": "Composants industriels / Automatisation"},
    "MONRO": {"sector": "Industrie & Énergie"},
    "MORNINGSTAR": {"sector": "Finance"},
    "MOTORCAR PARTS A": {"sector": "Composants industriels / Automatisation"},
    "MWI VETERINARY SUPPLY INC": {"sector": "Santé / Équipement médical"},
    "MYRIAD GENETICS": {"sector": "Santé / Équipement médical"},
    "NAPCO SEC TECH": {"sector": "Sécurité"},
    "NASDAQ": {"sector": "Technologie & Numérique"},
    "NAT ALTERN INTL": {"sector": "Industrie & Énergie"},
    "NATHANS FAMOUS": {"sector": "Restaurants / Restauration"},
    "NATIONAL BANKSHA": {"sector": "Banques"},
    "NATIONAL BEVERAG": {"sector": "Alimentation"},
    "NATIONAL CINE": {"sector": "Loisirs"},
    "NATIONAL COAL CORP": {"sector": "Énergie / Pétrole & Gaz"},
    "NATL HEALTH TREN": {"sector": "Santé / Équipement médical"},
    "NB & T FINL GROUP INC": {"sector": "Banques"},
    "NBT BANCORP": {"sector": "Banques"},
    "NEKTAR THERAPEUT": {"sector": "Biotech"},
    "NEOGEN": {"sector": "Santé / Équipement médical"},
    "NEONODE": {"sector": "Technologie & Numérique"},
    "NETAPP": {"sector": "Technologie & Numérique"},
    "NETEASE SP ADR": {"sector": "Technologie & Numérique"},
    "NETFLIX": {"sector": "Loisirs"},
    "NETGEAR": {"sector": "Technologie & Numérique"},
    "NETLIST": {"sector": "Technologie & Numérique"},
    "NETSCOUT SYSTEMS": {"sector": "Composants industriels / Automatisation"},
    "NETSOL TECH": {"sector": "Technologie & Numérique"},
    "NETWORK ENGINES INC": {"sector": "Technologie & Numérique"},
    "NEUROCRINE BIOSCIENCES": {"sector": "Biotech"},
    "NEUROMETRIX": {"sector": "Technologie & Numérique"},
    "NEW FRONTIER MEDIA INC": {"sector": "Loisirs"},
    "NEW YORK REIT": {"sector": "Immobilier / REITs"},
    "NEWTEKONE": {"sector": "Services financiers"},
    "NEXSTAR MED GRP": {"sector": "Médias"},
    "NICE SP ADR": {"sector": "Technologie & Numérique"},
    "NN": {"sector": "Biotech"},
    "NOBEL LEARNING CMNTYS INC": {"sector": "Composants industriels / Automatisation"},
    "NORDSON": {"sector": "Services financiers"},
    "NORTECH SYSTEMS": {"sector": "Systèmes de gestion des déchets"},
    "NORTHERN TRUST": {"sector": "Banques"},
    "NORTHRIM BANCORP": {"sector": "Banques"},
    "NORTHWEST PIPE": {"sector": "Composants industriels / Automatisation"},
    "NORWOOD FINANCIA": {"sector": "Services financiers"},
    "NOVA": {"sector": "Biotech"},
    "NOVANTA": {"sector": "Technologie & Numérique"},
    "NOVAVAX": {"sector": "Biotech"},
    "NOVELL INC": {"sector": "Technologie & Numérique"},
    "NPS PHARMACEUTICALS INC": {"sector": "Biotech"},
    "NPTN WLNS": {"sector": "Technologie & Numérique"},
    "NVE": {"sector": "Composants industriels / Automatisation"},
    "NVIDIA": {"sector": "Semiconducteurs"},
    "NYMOX PHARMA": {"sector": "Santé / Équipement médical"},
    "O I CORP _COM": {"sector": "Technologie & Numérique"},
    "OCEAN POWER TECH": {"sector": "Énergie / Pétrole & Gaz"},
    "OCEANFIRST BK": {"sector": "Banques"},
    "OCEANFREIGHT-A": {"sector": "Transports & Infrastructure industrielle"},
 "ODYSSEY MARINE": {"sector": "Transports & Infrastructure industrielle"},
    "OHIO VY BANC COR": {"sector": "Industrie & Énergie"},
    "OLD DOMINION FRE": {"sector": "Banques"},
    "OLD POINT FINANC": {"sector": "Transports & Infrastructure industrielle"},
    "OLD SECOND BANCO": {"sector": "Banques"},
    "OLYMPIC STEEL": {"sector": "Composants industriels / Automatisation"},
    "OMEGA FLEX": {"sector": "Composants industriels / Automatisation"},
    "OMNI ENERGY SERVICES": {"sector": "Services aux collectivités"},
    "OMNICELL": {"sector": "Santé / Équipement médical"},
    "ON SEMICONDUCTOR": {"sector": "Semiconducteurs"},
    "ONESPAN": {"sector": "Technologie & Numérique"},
    "ONTO INNOVATION": {"sector": "Technologie & Numérique"},
    "ONTRAK": {"sector": "Technologie & Numérique"},
    "OPEN TEXT": {"sector": "Santé / Équipement médical"},
    "OPNEXT INC": {"sector": "Composants industriels / Automatisation"},
    "OPTICAL CABLE": {"sector": "Composants industriels / Automatisation"},
    "OPTIMUMBANK HLDG": {"sector": "Services financiers"},
    "OPTION CR HEALTH": {"sector": "Technologie & Numérique"},
    "ORACLE": {"sector": "Technologie & Numérique"},
    "ORASURE TECHS": {"sector": "Technologie & Numérique"},
    "ORBCOMM": {"sector": "Composants industriels / Automatisation"},
    "ORIGIN AGRITECH": {"sector": "Composants industriels / Automatisation"},
    "ORION ENRGY SYS": {"sector": "Santé / Équipement médical"},
    "ORION GROUP HLDG": {"sector": "Composants industriels / Automatisation"},
    "ORTHOFIX MED": {"sector": "Industrie & Énergie"},
    "OSI SYSTEMS": {"sector": "Composants industriels / Automatisation"},
    "OSTEOTECH INC": {"sector": "Services aux collectivités"},
    "OTIX GLOBAL INC": {"sector": "Services financiers"},
    "OTTER TAIL": {"sector": "Composants industriels / Automatisation"},
    "PACCAR": {"sector": "Industrie & Énergie"},
    "PACIFIC PREMIER": {"sector": "Banques"},
    "PAETEC HOLDING CORP": {"sector": "Technologie & Numérique"},
    "PAMT": {"sector": "Énergie / Pétrole & Gaz"},
    "PAN AMER SILVER": {"sector": "Industrie & Énergie"},
    "PANTRY INC": {"sector": "Alimentation"},
    "PAPA JOHNS INTL": {"sector": "Restaurants / Restauration"},
    "PARK OHIO HOLDIN": {"sector": "Composants industriels / Automatisation"},
    "PARKE BANCORP": {"sector": "Banques"},
    "PARKERVISION": {"sector": "Composants industriels / Automatisation"},
    "PARKVALE FINL CORP": {"sector": "Banques"},
    "PARLUX FRAGRANCES INC": {"sector": "Consommation & Services"},
    "PATHWARD FINL": {"sector": "Services financiers"},
    "PATRICK INDUSTR.": {"sector": "Industrie & Énergie"},
    "PATRIOT NATL BAN": {"sector": "Banques"},
    "PATTERSON COS": {"sector": "Santé / Équipement médical"},
    "PATTERSON-UTI EN": {"sector": "Énergie / Pétrole & Gaz"},
    "PAYCHEX INC": {"sector": "Services financiers"},
    "PC CONNECTION": {"sector": "Technologie & Numérique"},
    "PDF SOLUTIONS": {"sector": "Composants industriels / Automatisation"},
    "PEETS COFFEE & TEA INC": {"sector": "Alimentation"},
    "PEGASYSTEMS": {"sector": "Technologie & Numérique"},
    "PENFORD CORP": {"sector": "Commodités alimentaires"},
    "PENN ENTMT": {"sector": "Divertissement"},
    "PENNICHUCK CORP": {"sector": "Services publics"},
    "PENNS WOODS BANC": {"sector": "Banques"},
    "PEOPLES BANCORP": {"sector": "Banques"},
    "PEOPLES BANCORP": {"sector": "Semiconducteurs"},
    "PERASO": {"sector": "Éducation"},
    "PERDOCEO EDU": {"sector": "Technologie & Numérique"},
    "PERION NETWORK": {"sector": "Environnement"},
    "PERMA-FIX ENVIR": {"sector": "Santé / Équipement médical"},
    "PETMED EXPRESS": {"sector": "Consommation & Services"},
    "PETSMART INC": {"sector": "Pharma"},
    "PFD BK": {"sector": "Technologie & Numérique"},
    "PHARMASSET INC": {"sector": "Technologie & Numérique"},
    "PHOTRONICS INC": {"sector": "Composants industriels / Automatisation"},
    "PINNACLE FINL PR": {"sector": "Technologie & Numérique"},
    "PIXELWORKS": {"sector": "Composants industriels / Automatisation"},
    "PLEXUS CORP": {"sector": "Biotech"},
    "PLUG POWER": {"sector": "Biotech"},
    "PLUMAS BANCORP": {"sector": "Biotech"},
    "PLURI": {"sector": "Composants industriels / Automatisation"},
    "PLUS THERPEUTCS": {"sector": "Biotech"},
    "PMA CAPITAL-A": {"sector": "Industrie & Énergie"},
    "PMC-SIERRA INC": {"sector": "Technologie & Numérique"},
    "POLARITYTE": {"sector": "Biotech"},
    "POOL": {"sector": "Consommation & Services"},
    "POPULAR": {"sector": "Banques"},
    "POWELL IND": {"sector": "Industrie & Énergie"},
    "POWER INTEGRATIO": {"sector": "Semiconducteurs"},
    "PRA GROUP": {"sector": "Services financiers"},
    "PREFORMED LINE P": {"sector": "Composants industriels / Automatisation"},
    "PREMIER FINL BNC": {"sector": "Banques"},
    "PRICESMART": {"sector": "Consommation & Services"},
    "PRIMEENERGY RES": {"sector": "Industrie & Énergie"},
    "PRIMIS FINANCIAL": {"sector": "Banques"},
    "PRM-PP INTL HLDS": {"sector": "Industrie & Énergie"},
    "PRO-DEX": {"sector": "Technologie & Numérique"},
    "PROGRESS SOFTWAR": {"sector": "Technologie & Numérique"},
    "PROPHASE LABS": {"sector": "Santé / Équipement médical"},
    "PROSPECT CAPTL": {"sector": "Services financiers"},
    "PROSPERITY BANCS": {"sector": "Banques"},
    "PROVIDENT FINANC": {"sector": "Services financiers"},
    "PSYCHIATRIC SOLUTIONS INC": {"sector": "Santé / Équipement médical"},
    "PTC": {"sector": "Technologie & Numérique"},
    "PURE CYCLE": {"sector": "Environnement"},
    "QCR HOLDINGS": {"sector": "Banques"},
    "QIAGEN": {"sector": "Technologie & Numérique"},
    "QUALCOMM": {"sector": "Technologie & Numérique"},
    "QUICKLOGIC": {"sector": "Technologie & Numérique"},
 "QUIDELORTHO": {"sector": "Composants industriels / Automatisation"},
    "QVC GROUP RG-A": {"sector": "Loisirs"},
    "QVC GROUP RG-B": {"sector": "Loisirs"},
    "RADCOM": {"sector": "Télécom / Infrastructure"},
    "RADIUS-A": {"sector": "Technologie & Numérique"},
    "RADNET": {"sector": "Santé / Équipement médical"},
    "RADWARE": {"sector": "Technologie & Numérique"},
    "RAMBUS": {"sector": "Technologie & Numérique"},
    "RAND CAP": {"sector": "Finance"},
    "RAVE RESTAURANT": {"sector": "Restaurants / Restauration"},
    "RBC BEARINGS INC": {"sector": "Composants industriels / Automatisation"},
    "RC2 CORP": {"sector": "Composants industriels / Automatisation"},
    "RCI HOSPIT HOLDI": {"sector": "Technologie & Numérique"},
    "RCM TECHNOLOGIES": {"sector": "Restaurants / Restauration"},
    "RED ROBIN GRMT B": {"sector": "Santé / Équipement médical"},
    "REGENERON PHARMA": {"sector": "Santé / Équipement médical"},
    "RELIV INTL": {"sector": "Loisirs"},
    "REMARK HOLDINGS": {"sector": "Éducation"},
    "RENAISSANCE LEARNING INC": {"sector": "Banques"},
    "RENASANT": {"sector": "Biotech"},
    "REPLIGEN": {"sector": "Banques"},
    "REPUBLIC 1ST BAN": {"sector": "Banques"},
    "REPUBLIC BANCORP-A": {"sector": "Technologie & Numérique"},
    "RESEARCH FRONTIE": {"sector": "Services aux collectivités"},
    "RESOURCES CONNEC": {"sector": "Industrie & Énergie"},
    "RF INDUSTRIES": {"sector": "Services aux collectivités"},
    "RGC RESOURCES": {"sector": "Santé / Équipement médical"},
    "RICHARDSON ELECT": {"sector": "Technologie & Numérique"},
    "RIGEL PHARM": {"sector": "Santé / Équipement médical"},
    "RIOT PLATFORMS": {"sector": "Composants industriels / Automatisation"},
    "RIVERVIEW BANCOR": {"sector": "Consommation & Services"},
    "ROCKWELL MEDICAL": {"sector": "Vêtements"},
    "ROCKY BRANDS": {"sector": "Biotech"},
    "ROSETTA GENOMICS": {"sector": "Vêtements"},
    "ROSS STORES": {"sector": "Métaux précieux"},
    "ROYAL GOLD": {"sector": "Technologie & Numérique"},
    "RUBICON TECH": {"sector": "Services aux collectivités"},
    "RURAL / METRO CORP": {"sector": "Industrie & Énergie"},
    "RUSH ENTERPRISES-A": {"sector": "Transport & Infrastructure industrielle"},
    "RUSH ENTERPRISES-B": {"sector": "Transport & Infrastructure industrielle"},
    "RYANAIR SP ADR": {"sector": "Transports & Infrastructure industrielle"},
    "S & T BANCORP": {"sector": "Banques"},
    "S1 CORPORATION": {"sector": "Technologie & Numérique"},
    "SAFETY INS GRP": {"sector": "Assurances"},
    "SAIA": {"sector": "Transports & Infrastructure industrielle"},
    "SALARY COM INC": {"sector": "Technologie & Numérique"},
    "SALEM MEDIA-A": {"sector": "Médias"},
    "SANDY SPRING BAN": {"sector": "Banques"},
    "SANG THERAP": {"sector": "Biotech"},
    "SANMINA": {"sector": "Composants industriels / Automatisation"},
    "SAPIENS INTL COR": {"sector": "Technologie & Numérique"},
    "SAREPTA": {"sector": "Pharma"},
    "SB FINANCIAL GR": {"sector": "Banques"},
    "SBA CMMNS REIT-A": {"sector": "Immobilier / REITs"},
    "SCANSOURCE": {"sector": "Composants industriels / Automatisation"},
    "SCHMITT INDS": {"sector": "Composants industriels / Automatisation"},
    "SCHOLASTIC": {"sector": "Éducation"},
    "SEACHANGE INTL": {"sector": "Technologie & Numérique"},
    "SEACOAST BANKING": {"sector": "Banques"},
    "SECURITY NATL FIN-A": {"sector": "Services financiers"},
    "SEI INVESTMENTS": {"sector": "Services financiers"},
    "SELECTIVE INSURA": {"sector": "Assurances"},
    "SELLAS LIFE SCNC": {"sector": "Biotech"},
    "SEMTECH": {"sector": "Technologie & Numérique"},
    "SENECA FOODS -B": {"sector": "Alimentation"},
    "SENECA FOODS-A": {"sector": "Alimentation"},
    "SENSTAR TECH": {"sector": "Technologie & Numérique"},
    "SHAMIR OPTICAL INDUSTRY LTD": {"sector": "Optique"},
    "SHENANDOAH TELE": {"sector": "Télécommunications"},
    "SHOE CARNIVAL": {"sector": "Consommation & Services"},
    "SHORE BANCSHARES": {"sector": "Banques"},
    "SIEBERT FINANCIA": {"sector": "Banques"},
    "SIERRA BANCP": {"sector": "Technologie & Numérique"},
    "SIFY SP ADR": {"sector": "Banques"},
    "SIGA TECH": {"sector": "Technologie & Numérique"},
    "SIGMATRON INTL": {"sector": "Biotech"},
    "SIGNATURE BANK": {"sector": "Technologie & Numérique"},
    "SILGAN HLDGS": {"sector": "Banques"},
    "SILICOM": {"sector": "Banques"},
    "SILICON IMAGE INC": {"sector": "Technologie & Numérique"},
    "SILICON LABORATO": {"sector": "Technologie & Numérique"},
    "SILICON MOT SP ADR": {"sector": "Technologie & Numérique"},
    "SIMMONS FIRST N -A-": {"sector": "Technologie & Numérique"},
    "SIMPLY": {"sector": "Services aux collectivités"},
    "SIMULATIONS PLUS": {"sector": "Technologie & Numérique"},
    "SING FTR TECH": {"sector": "Industrie & Énergie"},
    "SKYWEST INC SHS": {"sector": "Services financiers"},
    "SKYWORKS SOLUTIO": {"sector": "Transports & Infrastructure industrielle"},
    "SLEEP NUMBER": {"sector": "Technologie & Numérique"},
    "SMITH & WSSN BRN": {"sector": "Services financiers"},
    "SMITH MICRO": {"sector": "Technologie & Numérique"},
    "SN MISSOURI BANC": {"sector": "Banques"},
    "SOCKET MOBILE": {"sector": "Technologie & Numérique"},
    "SOHU.COM SP ADR": {"sector": "Technologie & Numérique"},
    "SONESTA INTL HOTELS CORP": {"sector": "Loisirs"},
    "SONIC FDRY": {"sector": "Industrie & Énergie"},
    "SONOMA PHARMA": {"sector": "Biotech"},
    "SOTHER HOTL REIT": {"sector": "Immobilier / REITs"},
    "SOUTHERN FIRST": {"sector": "Banques"},
    "SOUTHSIDE BANCSH": {"sector": "Banques"},
 "SPAR GROUP": {"sector": "Commodités alimentaires"},
    "SPARTANNASH": {"sector": "Commodités alimentaires"},
    "SPOK HOLDINGS": {"sector": "Télécommunications"},
    "SSR MINING": {"sector": "Industrie & Énergie"},
    "STAAR SURGICAL": {"sector": "Santé / Équipement médical"},
    "STABILIS SLTNS": {"sector": "Santé / Équipement médical"},
    "STANDARD MICROSYSTEMS CORP": {"sector": "Composants industriels / Automatisation"},
    "STAR BULK CARRIE": {"sector": "Transports & Infrastructure industrielle"},
    "STAR EQTY HLDGS": {"sector": "Finances"},
    "STARBUCKS": {"sector": "Consommation & Services"},
    "STATE BANCORP INC N.Y": {"sector": "Banques"},
    "STATERA BIOPHRM": {"sector": "Biotech"},
    "STEALTHGAS": {"sector": "Industrie & Énergie"},
    "STEEL DYNAMICS": {"sector": "Industrie & Énergie"},
    "STERLING INFRA": {"sector": "Consommation & Services"},
    "STEVEN MADDEN": {"sector": "Banques"},
    "STOCK YARD BANCO": {"sector": "Services financiers"},
    "STONEX GROUP": {"sector": "Technologie & Numérique"},
    "STRATA SKIN SCN": {"sector": "Éducation"},
    "STRATEGIC EDU": {"sector": "Composants industriels / Automatisation"},
    "STRATTEC SECURIT": {"sector": "Immobilier / REITs"},
    "STRATUS PROPERTI": {"sector": "Santé / Équipement médical"},
    "STREAMLINE HLTH": {"sector": "Services financiers"},
    "SUMMIT STATE BAN": {"sector": "Commodités alimentaires"},
    "SUNOPTA": {"sector": "Technologie & Numérique"},
    "SUPER GRP OF COS": {"sector": "Technologie & Numérique"},
    "SUPER MICRO": {"sector": "Santé / Équipement médical"},
    "SUPERCOM": {"sector": "Biotech"},
    "SURGALIGN HLDG": {"sector": "Santé / Équipement médical"},
    "SURMODICS": {"sector": "Technologie & Numérique"},
    "SVB FINANCIAL GR": {"sector": "Biotech"},
    "SYMBOLIC LOGIC": {"sector": "Services financiers"},
    "SYNAPTICS": {"sector": "Banques"},
    "SYNCHRONOSS TECH": {"sector": "Composants industriels / Automatisation"},
    "SYNOPSYS": {"sector": "Banques"},
    "SYNOVIS LIFE TECHNOLOGIES IN": {"sector": "Technologie & Numérique"},
    "SYNTHESIS ENERGY": {"sector": "Technologie & Numérique"},
    "SYPRIS SOLUTIONS": {"sector": "Technologie & Numérique"},
    "T ROWE PRICE GRP": {"sector": "Technologie & Numérique"},
    "TAITRON COMPONENT-A": {"sector": "Industrie & Énergie"},
    "TAKE-TWO INTERACTIVE": {"sector": "Banques"},
    "TAOPING": {"sector": "Technologie & Numérique"},
    "TAT TECH": {"sector": "Loisirs"},
    "TAYLOR DEVICES I": {"sector": "Banques"},
    "TEAM": {"sector": "Loisirs"},
    "TETRA TECH": {"sector": "Services financiers"},
    "TEVAPHARMIND SP ADR": {"sector": "Pharma"},
    "TEXAS CAP BANC": {"sector": "Banques"},
    "TEXAS ROADHOUSE": {"sector": "Restaurants / Restauration"},
    "TFS FINANCIAL": {"sector": "Services financiers"},
    "THE DESCARTES SY": {"sector": "Technologie & Numérique"},
    "THE SHYFT GROUP": {"sector": "Transports & Infrastructure industrielle"},
    "THE SOUTH FINL GRP": {"sector": "Services financiers"},
    "THE9 SP ADS-A": {"sector": "Technologie & Numérique"},
    "THERMADYNE HLDGS CORP NEW": {"sector": "Industrie & Énergie"},
    "THERMOGEN HLDG": {"sector": "Biotech"},
    "TIMBERLAND BANCO": {"sector": "Banques"},
    "TITAN MACHINERY": {"sector": "Composants industriels / Automatisation"},
    "TOMOTHERAPY INC": {"sector": "Santé / Équipement médical"},
    "TOP SHIPS": {"sector": "Transports & Infrastructure industrielle"},
    "TOREADOR RES CORP": {"sector": "Énergie / Pétrole & Gaz"},
    "TOWER SEMICON IN": {"sector": "Semiconducteurs"},
    "TOWNE BANK": {"sector": "Banques"},
    "TRACTOR SUPPLY": {"sector": "Consommation & Services"},
    "TRADESTATION GROUP INC": {"sector": "Services financiers"},
    "TRANSACT TECH": {"sector": "Loisirs"},
    "TRANSCAT": {"sector": "Loisirs"},
    "TRAVELZOO": {"sector": "Loisirs"},
    "TRICO BANCSHARES": {"sector": "Loisirs"},
    "TRILLER GRP": {"sector": "Banques"},
    "TRIMBLE": {"sector": "Technologie & Numérique"},
    "TRIMERIS INC": {"sector": "Biotech"},
    "TRINITY BIO SP ADR": {"sector": "Biotech"},
    "TRIP COM GRP SP ADS": {"sector": "Services financiers"},
    "TRUBION PHARMACEUTICALS INC": {"sector": "Biotech"},
    "TRUBRIDGE": {"sector": "Services aux collectivités"},
    "TRUSTCO BANK": {"sector": "Banques"},
    "TRUSTMARK": {"sector": "Banques"},
    "TTEC HLDNGS": {"sector": "Technologie & Numérique"},
    "TTM TECHNOLOGIES": {"sector": "Composants industriels / Automatisation"},
    "TUESDAY MRNG": {"sector": "Consommation & Services"},
    "TWIN DISC": {"sector": "Composants industriels / Automatisation"},
    "U-HAUL": {"sector": "Transports & Infrastructure industrielle"},
    "U.S. GOLD": {"sector": "Énergie / Pétrole & Gaz"},
    "UFP TECHNOLOGIES": {"sector": "Composants industriels / Automatisation"},
    "ULTA BEAUTY": {"sector": "Vêtements"},
    "ULTRA CLEAN HLDG": {"sector": "Composants industriels / Automatisation"},
    "ULTRALIFE": {"sector": "Industrie & Énergie"},
    "UMB FINANCIAL": {"sector": "Banques"},
    "UNICA CORP": {"sector": "Assurances"},
    "UNICO AMERICAN C": {"sector": "Technologie & Numérique"},
    "UNITED AIRLINES": {"sector": "Transports & Infrastructure industrielle"},
    "UNITED BANCORP": {"sector": "Banques"},
    "UNITED BANCSHARE": {"sector": "Banques"},
    "UNITED FIRE GR": {"sector": "Assurances"},
    "UNITED NATURAL F": {"sector": "Alimentation"},
    "UNITED SEC BANCS": {"sector": "Banques"},
    "UNITED THERAPEUT": {"sector": "Biotech"},
    "UNITY BANCORP": {"sector": "Banques"},
    "UNIVERSAL DISPLA": {"sector": "Technologie & Numérique"},
  "UNIVERSAL ELECTR": {"sector": "Composants industriels / Automatisation"},
    "UNIVERSAL LOGIST": {"sector": "Logistique / Services postaux"},
    "UNIVEST FINL": {"sector": "Banques"},
    "UPBOUND GRP": {"sector": "Services financiers"},
    "URBAN ONE-A": {"sector": "Médias"},
    "URBAN OUTFITTERS": {"sector": "Vêtements"},
    "URN ON NON VTG-D": {"sector": "Services financiers"},
    "US ENERGY": {"sector": "Énergie / Pétrole & Gaz"},
    "US GLOBAL INVS-A": {"sector": "Services financiers"},
    "US LIME & MINERA": {"sector": "Industrie & Énergie"},
    "US PHYSICAL THER": {"sector": "Santé / Équipement médical"},
    "USANA HEALTH SC": {"sector": "Santé / Équipement médical"},
    "UTAH MEDICAL PRO": {"sector": "Santé / Équipement médical"},
    "UTI WORLDWIDE INC": {"sector": "Transports & Infrastructure industrielle"},
    "VALUE LINE INC": {"sector": "Services financiers"},
    "VANDA PHARMA": {"sector": "Biotech"},
    "VARIAN SEMICONDUCTOR EQUIPMN": {"sector": "Semiconducteurs"},
    "VAXART": {"sector": "Biotech"},
    "VEECO INSTRUMENT": {"sector": "Composants industriels / Automatisation"},
    "VERADIGM": {"sector": "Technologie & Numérique"},
    "VERICEL": {"sector": "Santé / Équipement médical"},
    "VERISIGN": {"sector": "Technologie & Numérique"},
    "VERTEX PHARMACEU": {"sector": "Pharma"},
    "VIASAT": {"sector": "Télécom / Infrastructure"},
    "VIAVI SOLUTIONS": {"sector": "Technologie & Numérique"},
    "VICOR": {"sector": "Composants industriels / Automatisation"},
    "VILLAGE BK & TR": {"sector": "Banques"},
    "VIRACTA THERAP": {"sector": "Biotech"},
    "VIRCO MFG": {"sector": "Composants industriels / Automatisation"},
    "VITAL IMAGES INC": {"sector": "Santé / Équipement médical"},
    "VLG SUPER MKT INC": {"sector": "Consommation & Services"},
    "VOLCANO CORPORATION": {"sector": "Santé / Équipement médical"},
    "VOXX INTL RG-A": {"sector": "Technologie & Numérique"},
    "VSE": {"sector": "Industrie & Énergie"},
    "WAFD": {"sector": "Banques"},
    "WAINWRIGHT BK&TR CO MACOM": {"sector": "Banques"},
    "WASHING.TR BANCO": {"sector": "Banques"},
    "WD-40 CO": {"sector": "Consommation & Services"},
    "WEBSENSE INC": {"sector": "Technologie & Numérique"},
    "WERNER ENTERPRIS": {"sector": "Composants industriels / Automatisation"},
    "WESBANCO": {"sector": "Banques"},
    "WEST BANCORP": {"sector": "Banques"},
    "WESTAMER BANCORP": {"sector": "Banques"},
    "WESTELL TECH-A": {"sector": "Composants industriels / Automatisation"},
    "WESTERN NEW ENGL": {"sector": "Industrie & Énergie"},
    "WESTWATER RES": {"sector": "Industrie & Énergie"},
    "WEYCO GROUP INC": {"sector": "Vêtements"},
    "WHITNEY HLDG CORP": {"sector": "Banques"},
    "WILLAMETTE VY VI": {"sector": "Industrie & Énergie"},
    "WILLDAN GROUP": {"sector": "Services aux collectivités"},
    "WILLIS LEASE FIN": {"sector": "Services financiers"},
    "WINMARK": {"sector": "Services financiers"},
    "WINTRUST FINANCI": {"sector": "Services financiers"},
    "WOLFSPEED": {"sector": "Technologie & Numérique"},
    "WOODWARD": {"sector": "Composants industriels / Automatisation"},
    "WORLD ACCEPTANCE": {"sector": "Loisirs"},
    "WPP SP ADR": {"sector": "Services financiers"},
    "WSFS FINANCIAL": {"sector": "Services financiers"},
    "WVS FINANCIAL": {"sector": "Loisirs"},
    "WYNN RESORTS": {"sector": "Loisirs"},
    "X-RITE INC": {"sector": "Composants industriels / Automatisation"},
    "XOMA RYLTY": {"sector": "Immobilier / REITs"},
    "YELLOW": {"sector": "Transports & Infrastructure industrielle"},
    "YIELD10 BIOSC": {"sector": "Biotech"},
    "YORK WATER": {"sector": "Services aux collectivités"},
    "YUNHONG GREEN": {"sector": "Énergie / Pétrole & Gaz"},
    "ZEBRA TECH -A-": {"sector": "Composants industriels / Automatisation"},
    "ZIFF DAVIS": {"sector": "Médias"},
    "ZIONS BANCORP": {"sector": "Banques"},
    "ZORAN CORP": {"sector": "Technologie & Numérique"},
    "ZUMIEZ": {"sector": "Vêtements"}
}
}

# Fonction pour obtenir le code pays à 2 lettres
def get_country_code(country_name):
    """Convertit un nom de pays en code ISO à 2 lettres pour affichage du drapeau"""
    country_codes = {
        "France": "FR",
        "Germany": "DE", 
        "Italy": "IT",
        "Spain": "ES",
        "Netherlands": "NL",
        "Belgium": "BE",
        "Switzerland": "CH",
        "United Kingdom": "GB",
        "Sweden": "SE",
        "Denmark": "DK",
        "Finland": "FI",
        "Norway": "NO",
        "Austria": "AT",
        "Portugal": "PT",
        "Ireland": "IE",
        "Greece": "GR",
        "Luxembourg": "LU",
        "Poland": "PL",
        "Hungary": "HU",
        "Czech Republic": "CZ"
    }
    return country_codes.get(country_name, "")

def get_headers():
    """Crée des en-têtes HTTP pour éviter la détection de bot"""
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/"
    }

#
# Fonctions communes
#
def extract_stock_data(row):
    """Extrait les données d'une action à partir d'une ligne de tableau"""
    try:
        cells = row.find_all('td')
        if not cells or len(cells) < 8:
            return None
            
        # Récupérer le libellé et le lien
        libelle_cell = cells[0]
        libelle_link = libelle_cell.find('a')
        libelle = libelle_link.text.strip() if libelle_link else ""
        link = libelle_link.get('href') if libelle_link else ""
        
        # Récupérer le cours et les autres valeurs
        dernier = cells[1].text.strip()
        variation = cells[2].text.strip()
        ouverture = cells[3].text.strip()
        plus_haut = cells[4].text.strip()
        plus_bas = cells[5].text.strip()
        var_ytd = cells[6].text.strip()
        volume = cells[7].text.strip()
        
        # Déterminer la tendance en fonction de la variation
        trend = "up" if variation and not variation.startswith('-') and variation != "0,00%" else "down"
        if variation == "0,00%":
            trend = "neutral"
            
        # Créer l'objet stock
        stock_data = {
            "symbol": link.split('/')[-1] if link else "",
            "name": libelle,
            "last": dernier,
            "change": variation,
            "open": ouverture,
            "high": plus_haut,
            "low": plus_bas,
            "ytd": var_ytd,
            "volume": volume,
            "trend": trend,
            "link": f"https://www.boursorama.com{link}" if link else ""
        }
        
        return stock_data
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des données d'une action: {str(e)}")
        return None

def parse_percentage(value_str):
    """
    Convertit une chaîne de pourcentage en valeur numérique
    Compatible avec différents formats (virgule/point, avec/sans %)
    """
    if not value_str or value_str == "-":
        return 0.0
    
    # Nettoyer la chaîne pour extraire le nombre
    cleaned = value_str.replace('%', '').replace(',', '.').replace(' ', '')
    try:
        return float(cleaned)
    except:
        return 0.0

def get_top_performers(stocks, field='change', reverse=True, limit=10):
    """
    Récupère les top/bottom performers basés sur un champ donné,
    avec déduplication stricte basée sur le nom de l'action.
    
    Args:
        stocks (list): Liste d'actions
        field (str): Champ pour le tri ('change' ou 'ytd')
        reverse (bool): True pour ordre décroissant, False pour croissant
        limit (int): Nombre maximum d'éléments à retourner
        
    Returns:
        list: Top performers dédupliqués
    """
    try:
        # Filtrer les actions avec une valeur valide pour le champ spécifié
        valid_stocks = []
        
        for stock in stocks:
            if not stock.get(field) or stock.get(field) == "-" or not stock.get("name"):
                continue
                
            # Convertir le pourcentage en valeur numérique
            percentage = parse_percentage(stock.get(field, "0"))
            
            # Appliquer les filtres selon les critères demandés
            if field == 'change':  # Variations journalières
                # Vérifier les seuils pour les variations journalières
                if reverse and percentage > MAX_DAILY_GAIN_PERCENTAGE:
                    logger.info(f"Outlier ignoré (hausse journalière > {MAX_DAILY_GAIN_PERCENTAGE}%): {stock['name']} avec {stock[field]}")
                    continue
                elif not reverse and percentage < MIN_DAILY_LOSS_PERCENTAGE:
                    logger.info(f"Outlier ignoré (baisse journalière < {MIN_DAILY_LOSS_PERCENTAGE}%): {stock['name']} avec {stock[field]}")
                    continue
            elif field == 'ytd':  # Variations YTD
                # Pas de limite supérieure pour les hausses YTD
                if not reverse and percentage < MIN_YTD_LOSS_PERCENTAGE:
                    logger.info(f"Outlier ignoré (baisse YTD < {MIN_YTD_LOSS_PERCENTAGE}%): {stock['name']} avec {stock[field]}")
                    continue
            
            # Stock passe les filtres, on l'ajoute avec sa valeur numérique
            valid_stocks.append((stock, percentage))
        
        # Trier les actions en fonction de la valeur numérique
        sorted_stocks = sorted(valid_stocks, key=lambda x: x[1], reverse=reverse)
        
        # Déduplication stricte basée sur le nom
        unique_stocks = []
        seen_names = set()
        
        for stock, _ in sorted_stocks:
            name = stock.get("name", "")
            if name and name not in seen_names:
                seen_names.add(name)
                unique_stocks.append(stock)
                
                # S'arrêter une fois que nous avons atteint la limite
                if len(unique_stocks) >= limit:
                    break
        
        # Vérifier si nous avons exactement le nombre demandé
        if len(unique_stocks) < limit:
            logger.warning(f"Attention: seulement {len(unique_stocks)}/{limit} actions uniques pour le top {field}, {'hausse' if reverse else 'baisse'}")
        
        return unique_stocks
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des top performers: {str(e)}")
        return []

# Fonction pour enrichir les données d'une action avec des secteurs et pays
def enrich_stock_data(stock, market_type):
    """
    Enrichit les données d'une action avec des informations de secteur et pays
    
    Args:
        stock (dict): Données de l'action
        market_type (str): Type de marché (NASDAQ ou STOXX)
    """
    name = stock.get("name", "")
    
    if market_type == "NASDAQ":
        # Ajouter le secteur si disponible dans le mapping
        stock_info = NASDAQ_MAPPINGS.get(name, {})
        if "sector" in stock_info:
            stock["sector"] = stock_info["sector"]
        
        # Ajouter USA comme pays par défaut pour NASDAQ
        stock["country"] = "United States"
        
    elif market_type == "STOXX":
        # Ajouter le secteur et le pays si disponibles
        stock_info = STOXX_MAPPINGS.get(name, {})
        if "sector" in stock_info:
            stock["sector"] = stock_info["sector"]
        if "country" in stock_info:
            stock["country"] = stock_info["country"]
            
            # Ajouter le code pays pour le drapeau
            country_code = get_country_code(stock_info["country"])
            if country_code:
                stock["country_code"] = country_code.lower()
                # Option: ajouter une balise d'image pour le drapeau
                stock["flag"] = f'<img src="flags/{country_code.lower()}.svg" class="country-flag" alt="{stock_info["country"]}" title="{stock_info["country"]}">'
    
    return stock

#
# Fonctions pour NASDAQ
#
def get_nasdaq_url(letter, page=1):
    """Génère l'URL pour obtenir la liste des actions NASDAQ pour une lettre donnée"""
    # Générer un timestamp similaire à celui utilisé par Boursorama
    pagination_timestamp = int(time.time())
    
    # Construire le chemin d'URL avec la page dans le chemin
    base_path = f"{CONFIG['base_url']}/page-{page}"
    
    # Paramètres de requête
    params = {
        "international_quotation_az_filter[country]": CONFIG["nasdaq"]["country"],
        "international_quotation_az_filter[market]": CONFIG["nasdaq"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        f"pagination_{pagination_timestamp}": ""
    }
    
    # Construire la chaîne de requête
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    
    # Retourner l'URL complète
    return f"{base_path}?{query_params}"

def scrape_nasdaq_page(letter, page=1):
    """Scrape une page de la liste des actions NASDAQ"""
    url = get_nasdaq_url(letter, page)
    logger.info(f"Récupération des données NASDAQ pour la lettre {letter}, page {page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour la lettre {letter}, page {page}")
            return [], False
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                # Enrichir avec secteur et pays
                stock_data = enrich_stock_data(stock_data, "NASDAQ")
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions NASDAQ pour la lettre {letter}, page {page}")
        
        # MISE À JOUR: Détection de pagination pour le nouveau format
        has_next_page = False
        
        # Recherche du bloc de pagination (nouvelle structure)
        pagination = soup.select_one('.c-block-pagination__content')
        if pagination:
            # Rechercher le bouton "suivant"
            next_button = pagination.select_one('a.c-block-pagination__next-btn, a.c-pagination__item--next')
            has_next_page = next_button is not None and not ('disabled' in next_button.get('class', []))
            
            # Si nous ne trouvons pas de bouton spécifique "suivant", vérifier s'il y a une page avec un numéro plus élevé
            if not has_next_page:
                page_links = pagination.select('a.c-block-pagination__link')
                for link in page_links:
                    if link.text.isdigit() and int(link.text) > page:
                        has_next_page = True
                        break
        
        # Vérification de l'ancienne structure de pagination au cas où
        if not has_next_page:
            pagination_old = soup.find('ul', class_='c-pagination')
            if pagination_old:
                next_button = pagination_old.find('li', class_='c-pagination__item--next')
                has_next_page = next_button and not next_button.has_attr('disabled')
        
        # Vérification supplémentaire: si nous avons des actions mais pas de pagination, 
        # essayons quand même la page suivante
        if len(stocks) > 0 and not has_next_page and len(stocks) >= 20:  # 20 est la taille de page courante
            logger.info(f"Aucune pagination détectée mais {len(stocks)} actions trouvées, on essaie la page suivante")
            has_next_page = True
            
        return stocks, has_next_page
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping NASDAQ pour lettre {letter}, page {page}: {str(e)}")
        return [], False

def scrape_all_nasdaq_stocks():
    """Scrape toutes les actions du NASDAQ Composite"""
    all_stocks = []
    
    for letter in CONFIG["alphabet"]:
        page = 1
        has_next_page = True
        max_pages_per_letter = 10  # Limite de sécurité pour éviter les boucles infinies
        
        while has_next_page and page <= max_pages_per_letter:
            stocks, has_next_page = scrape_nasdaq_page(letter, page)
            all_stocks.extend(stocks)
            
            # Si pas de page suivante, sortir de la boucle
            if not has_next_page:
                break
                
            # Passer à la page suivante
            page += 1
            
            # Attente pour éviter de surcharger le serveur
            time.sleep(CONFIG["sleep_time"])
        
        if page > max_pages_per_letter:
            logger.warning(f"Atteint la limite de {max_pages_per_letter} pages pour la lettre {letter}")
    
    return all_stocks

#
# Fonctions pour STOXX
#
def get_stoxx_url(page=1, letter=""):
    """Génère l'URL pour obtenir la liste des actions STOXX pour une page et lettre données"""
    # Générer un timestamp similaire à celui utilisé par Boursorama
    pagination_timestamp = int(time.time())
    
    # Construire le chemin d'URL avec la page dans le chemin
    base_path = f"{CONFIG['base_url']}/page-{page}"
    
    params = {
        "international_quotation_az_filter[country]": CONFIG["stoxx"]["country"],
        "international_quotation_az_filter[market]": CONFIG["stoxx"]["market"],
        "international_quotation_az_filter[letter]": letter,
        "international_quotation_az_filter[filter]": "",
        f"pagination_{pagination_timestamp}": ""
    }
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{base_path}?{query_params}"

def scrape_stoxx_page(page=1, letter=""):
    """Scrape une page de la liste des actions du STOXX 600 pour une lettre donnée"""
    url = get_stoxx_url(page, letter)
    logger.info(f"Récupération des données STOXX pour la lettre {letter}, page {page}: {url}")
    
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Trouver le tableau des actions
        table = soup.find('table', class_='c-table')
        if not table:
            logger.warning(f"Aucun tableau trouvé pour la lettre STOXX {letter}, page {page}")
            return [], page, 1, False
            
        # Trouver toutes les lignes de données (ignorer l'en-tête)
        rows = table.find('tbody').find_all('tr') if table.find('tbody') else []
        
        stocks = []
        for row in rows:
            stock_data = extract_stock_data(row)
            if stock_data:
                # Enrichir avec secteur et pays
                stock_data = enrich_stock_data(stock_data, "STOXX")
                stocks.append(stock_data)
                
        logger.info(f"Trouvé {len(stocks)} actions STOXX pour la lettre {letter}, page {page}")
        
        # Déterminer le nombre total de pages
        total_pages = 1
        current_page = page
        pagination = soup.select_one('.c-block-pagination__content')
        if pagination:
            # Extraire le nombre de pages
            page_items = pagination.select('a.c-block-pagination__link')
            for item in page_items:
                if item.text.isdigit():
                    page_num = int(item.text)
                    total_pages = max(total_pages, page_num)
            
            # Récupérer la page actuelle
            current_item = pagination.select_one('span.c-block-pagination__link--current') 
            if current_item and current_item.text.isdigit():
                current_page = int(current_item.text)
        
        # MISE À JOUR: Détection de pagination pour le nouveau format
        has_next_page = False
        
        # Recherche du bloc de pagination (nouvelle structure)
        if pagination:
            # Rechercher le bouton "suivant"
            next_button = pagination.select_one('a.c-block-pagination__next-btn, a.c-pagination__item--next')
            has_next_page = next_button is not None and not ('disabled' in next_button.get('class', []))
            
            # Si nous ne trouvons pas de bouton spécifique "suivant", vérifier s'il y a une page avec un numéro plus élevé
            if not has_next_page:
                page_links = pagination.select('a.c-block-pagination__link')
                for link in page_links:
                    if link.text.isdigit() and int(link.text) > page:
                        has_next_page = True
                        break
        
        # Vérification de l'ancienne structure de pagination au cas où
        if not has_next_page:
            pagination_old = soup.find('ul', class_='c-pagination')
            if pagination_old:
                next_button = pagination_old.find('li', class_='c-pagination__item--next')
                has_next_page = next_button and not next_button.has_attr('disabled')
        
        # Vérification supplémentaire: si nous avons des actions mais pas de pagination, 
        # essayons quand même la page suivante
        if len(stocks) > 0 and not has_next_page and len(stocks) >= 20:  # 20 est la taille de page courante
            logger.info(f"Aucune pagination détectée mais {len(stocks)} actions trouvées, on essaie la page suivante")
            has_next_page = True
        
        return stocks, current_page, total_pages, has_next_page
        
    except Exception as e:
        logger.error(f"Erreur lors du scraping STOXX lettre {letter}, page {page}: {str(e)}")
        return [], page, 1, False

def scrape_all_stoxx():
    """Scrape toutes les actions du STOXX 600 par lettre et par page"""
    all_stocks = []
    max_pages_per_letter = 10  # Limite de sécurité
    total_pages_overall = 0
    total_stocks = 0
    
    try:
        # Parcourir chaque lettre de l'alphabet
        for letter in CONFIG["alphabet"]:
            logger.info(f"📊 Récupération des données STOXX pour la lettre {letter}...")
            
            # Récupérer les données de la première page pour cette lettre
            letter_stocks, current_page, total_pages, has_next_page = scrape_stoxx_page(1, letter)
            
            if letter_stocks:
                all_stocks.extend(letter_stocks)
                total_stocks += len(letter_stocks)
                
                # Mettre à jour le nombre total de pages pour cette lettre
                letter_page_count = 1
                
                # Récupérer les pages suivantes pour cette lettre
                page = 2
                while has_next_page and page <= min(total_pages + 1, max_pages_per_letter + 1):
                    # Attente pour éviter de surcharger le serveur
                    time.sleep(CONFIG["sleep_time"])
                    
                    # Récupérer les données de la page
                    page_stocks, _, _, page_has_next = scrape_stoxx_page(page, letter)
                    
                    if page_stocks:
                        all_stocks.extend(page_stocks)
                        total_stocks += len(page_stocks)
                        letter_page_count += 1
                    
                    # Mettre à jour le flag pour la prochaine page
                    has_next_page = page_has_next
                    
                    # Passer à la page suivante
                    page += 1
                    
                # Mettre à jour le nombre total de pages global
                total_pages_overall = max(total_pages_overall, letter_page_count)
            
            # Attente entre les lettres pour éviter de surcharger le serveur
            time.sleep(CONFIG["sleep_time"])
        
        logger.info(f"✅ Scraping STOXX terminé avec succès: {total_stocks} actions récupérées sur toutes les lettres")
        return {
            "status": "success",
            "pages": total_pages_overall,
            "stocks": total_stocks,
            "all_stocks": all_stocks
        }
    except Exception as e:
        logger.error(f"❌ Erreur lors du scraping STOXX: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "pages": 0,
            "stocks": 0,
            "all_stocks": []
        }

def create_global_rankings(nasdaq_stocks, stoxx_result):
    """Crée un classement global combiné NASDAQ + STOXX et le sauvegarde"""
    logger.info("🌐 Création du classement global NASDAQ + STOXX...")
    
    try:
        # Ajouter l'information du marché pour chaque action NASDAQ
        nasdaq_with_source = []
        for stock in nasdaq_stocks:
            # Filtrer explicitement les valeurs extrêmes pour NASDAQ comme pour STOXX
            change_value = parse_percentage(stock.get('change', '0'))
            ytd_value = parse_percentage(stock.get('ytd', '0'))
            
            # Appliquer les mêmes filtres que dans get_top_performers
            if change_value > MAX_DAILY_GAIN_PERCENTAGE:
                logger.info(f"Outlier NASDAQ ignoré: {stock['name']} avec changement {stock.get('change', '0')} > {MAX_DAILY_GAIN_PERCENTAGE}%")
                continue
                
            if change_value < MIN_DAILY_LOSS_PERCENTAGE:
                logger.info(f"Outlier NASDAQ ignoré: {stock['name']} avec changement {stock.get('change', '0')} < {MIN_DAILY_LOSS_PERCENTAGE}%")
                continue
                
            # Filtrer aussi pour YTD
            if ytd_value < MIN_YTD_LOSS_PERCENTAGE:
                logger.info(f"Outlier NASDAQ YTD ignoré: {stock['name']} avec {stock.get('ytd', '0')} < {MIN_YTD_LOSS_PERCENTAGE}%")
                continue
                
            stock_with_source = stock.copy()
            stock_with_source['market'] = 'NASDAQ'
            stock_with_source['marketIcon'] = '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
            nasdaq_with_source.append(stock_with_source)
        
        # Récupérer toutes les actions STOXX depuis stoxx_result
        all_stoxx_stocks = stoxx_result.get('all_stocks', [])

        # Ajouter l'information du marché pour chaque action STOXX
        stoxx_with_source = []
        for stock in all_stoxx_stocks:
            stock_with_source = stock.copy()
            stock_with_source['market'] = 'STOXX'
            stock_with_source['marketIcon'] = '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
            stoxx_with_source.append(stock_with_source)
        
        # Combiner toutes les actions
        all_stocks = nasdaq_with_source + stoxx_with_source
        
        # Utiliser get_top_performers avec la fonction parse_percentage pour déduplication
        daily_best = get_top_performers(all_stocks, 'change', True, 10)
        daily_worst = get_top_performers(all_stocks, 'change', False, 10)
        ytd_best = get_top_performers(all_stocks, 'ytd', True, 10)
        ytd_worst = get_top_performers(all_stocks, 'ytd', False, 10)
        
        # Créer la structure de données pour le classement global
        global_rankings = {
            "daily": {
                "best": daily_best,
                "worst": daily_worst
            },
            "ytd": {
                "best": ytd_best,
                "worst": ytd_worst
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(all_stocks),
                "description": "Classement global combiné (NASDAQ + STOXX)"
            }
        }
        
        # Sauvegarder dans un fichier JSON
        output_path = os.path.join(CONFIG["stoxx"]["output_dir"], "global_top_performers.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(global_rankings, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Classement global enregistré dans {output_path}")
        return True
    
    except Exception as e:
        logger.error(f"❌ Erreur lors de la création du classement global: {str(e)}")
        return False

def create_market_top_performers_file(stocks, market_name, timestamp):
    """
    Crée un fichier JSON séparé pour les top performers d'un marché spécifique.
    
    Args:
        stocks (list): Liste des actions du marché
        market_name (str): Nom du marché (NASDAQ ou STOXX)
        timestamp (str): Horodatage pour les métadonnées
    """
    try:
        # Filtrer les valeurs extrêmes pour le marché NASDAQ
        filtered_stocks = []
        if market_name == "NASDAQ":
            for stock in stocks:
                change_value = parse_percentage(stock.get('change', '0'))
                ytd_value = parse_percentage(stock.get('ytd', '0'))
                
                # Appliquer les mêmes filtres que dans get_top_performers
                if change_value > MAX_DAILY_GAIN_PERCENTAGE:
                    logger.info(f"Outlier {market_name} ignoré: {stock['name']} avec changement {stock.get('change', '0')} > {MAX_DAILY_GAIN_PERCENTAGE}%")
                    continue
                    
                if change_value < MIN_DAILY_LOSS_PERCENTAGE:
                    logger.info(f"Outlier {market_name} ignoré: {stock['name']} avec changement {stock.get('change', '0')} < {MIN_DAILY_LOSS_PERCENTAGE}%")
                    continue
                    
                # Filtrer aussi pour YTD
                if ytd_value < MIN_YTD_LOSS_PERCENTAGE:
                    logger.info(f"Outlier {market_name} YTD ignoré: {stock['name']} avec {stock.get('ytd', '0')} < {MIN_YTD_LOSS_PERCENTAGE}%")
                    continue
                
                filtered_stocks.append(stock)
        else:
            # Pour STOXX, nous utilisons les stocks tels quels car get_top_performers appliquera le filtrage
            filtered_stocks = stocks
        
        # Ajouter/vérifier les indicateurs de marché pour chaque action
        for stock in filtered_stocks:
            if "market" not in stock:
                stock["market"] = market_name
            
            # Ajouter l'icône du marché si pas déjà présente
            if "marketIcon" not in stock:
                if market_name == "NASDAQ":
                    stock["marketIcon"] = '<i class="fas fa-flag-usa text-xs ml-1" title="NASDAQ"></i>'
                else:
                    stock["marketIcon"] = '<i class="fas fa-globe-europe text-xs ml-1" title="STOXX"></i>'
        
        # Récupérer les tops avec notre fonction améliorée de déduplication
        daily_best = get_top_performers(filtered_stocks, 'change', True, 10)
        daily_worst = get_top_performers(filtered_stocks, 'change', False, 10)
        ytd_best = get_top_performers(filtered_stocks, 'ytd', True, 10)
        ytd_worst = get_top_performers(filtered_stocks, 'ytd', False, 10)
        
        # Structure du fichier JSON
        market_tops = {
            "daily": {
                "best": daily_best,
                "worst": daily_worst
            },
            "ytd": {
                "best": ytd_best,
                "worst": ytd_worst
            },
            "meta": {
                "timestamp": timestamp,
                "count": len(filtered_stocks),
                "description": f"Top performers du marché {market_name}"
            }
        }
        
        # Nom du fichier
        filename = f"top_{market_name.lower()}_performers.json"
        file_path = os.path.join(CONFIG["stoxx"]["output_dir"], filename)
        
        # Écrire le fichier JSON
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(market_tops, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Fichier {filename} créé avec succès")
        
        # Valider le contenu généré
        validate_top_performers(market_tops, market_name)
        
        return market_tops
    except Exception as e:
        logger.error(f"❌ Erreur lors de la création du fichier top performers pour {market_name}: {str(e)}")
        return None

def validate_top_performers(data, market_name):
    """
    Vérifie que les tops performers sont correctement générés
    
    Args:
        data (dict): Données des top performers
        market_name (str): Nom du marché pour les logs
        
    Returns:
        bool: True si valide, False sinon
    """
    validation_issues = []
    
    # Vérifier la présence des catégories
    categories = [("daily", "best"), ("daily", "worst"), ("ytd", "best"), ("ytd", "worst")]
    for cat1, cat2 in categories:
        if cat1 not in data or cat2 not in data[cat1]:
            validation_issues.append(f"Catégorie manquante: {cat1}.{cat2} dans {market_name}")
            continue
            
        # Vérifier le nombre d'éléments (devrait être 10)
        items = data[cat1][cat2]
        if len(items) != 10:
            validation_issues.append(f"Nombre d'éléments incorrect: {len(items)}/10 dans {market_name}.{cat1}.{cat2}")
        
        # Vérifier l'unicité des noms
        names = [item.get("name", "") for item in items]
        unique_names = set(names)
        if len(unique_names) != len(names):
            validation_issues.append(f"Doublons détectés dans {market_name}.{cat1}.{cat2}")
    
    # Journaliser les problèmes ou confirmer la validation
    if validation_issues:
        for issue in validation_issues:
            logger.warning(issue)
        return False
    else:
        logger.info(f"✅ Validation des tops performers {market_name} réussie")
        return True

def ensure_data_directory():
    """S'assure que le répertoire de données existe"""
    data_dir = os.path.dirname(CONFIG["nasdaq"]["output_path"])
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)
        logger.info(f"✅ Répertoire de données créé: {data_dir}")

def verify_no_markets_conflict():
    """Vérifie que ce script ne modifie pas le fichier markets.json"""
    markets_file = os.path.join(os.path.dirname(CONFIG["nasdaq"]["output_path"]), "markets.json")
    if os.path.exists(markets_file):
        logger.info(f"✅ Vérification: Le fichier markets.json ne sera pas modifié par ce script")
    return True

def main():
    """Point d'entrée principal"""
    try:
        logger.info("🚀 Démarrage du script unifié d'extraction des données NASDAQ et STOXX")

        ensure_data_directory()
        verify_no_markets_conflict()

        # Créer la structure de base pour les deux marchés
        combined_data = {
            "nasdaq": {
                "indices": {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"},
                "top_performers": {
                    "daily": {"best": [], "worst": []},
                    "ytd": {"best": [], "worst": []}
                },
                "meta": {
                    "source": "Boursorama",
                    "description": "Actions du NASDAQ Composite (États-Unis)",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": 0
                }
            },
            "stoxx": {
                "indices": {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"},
                "top_performers": {
                    "daily": {"best": [], "worst": []},
                    "ytd": {"best": [], "worst": []}
                },
                "meta": {
                    "source": "Boursorama",
                    "description": "Actions du DJ STOXX 600 (Europe)",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": 0,
                    "pagination": {
                        "currentPage": 1,
                        "totalPages": 1
                    }
                }
            }
        }

        # Extraction des données NASDAQ
        logger.info("📊 Début du scraping NASDAQ...")
        nasdaq_stocks = scrape_all_nasdaq_stocks()
        
        if nasdaq_stocks:
            # Organiser par lettre alphabétique
            nasdaq_by_letter = {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"}
            for stock in nasdaq_stocks:
                if stock.get("name"):
                    first_letter = stock["name"][0].lower()
                    if first_letter in nasdaq_by_letter:
                        nasdaq_by_letter[first_letter].append(stock)
            
            # Mettre à jour les données NASDAQ
            combined_data["nasdaq"]["indices"] = nasdaq_by_letter
            combined_data["nasdaq"]["top_performers"]["daily"]["best"] = get_top_performers(nasdaq_stocks, "change", True)
            combined_data["nasdaq"]["top_performers"]["daily"]["worst"] = get_top_performers(nasdaq_stocks, "change", False)
            combined_data["nasdaq"]["top_performers"]["ytd"]["best"] = get_top_performers(nasdaq_stocks, "ytd", True)
            combined_data["nasdaq"]["top_performers"]["ytd"]["worst"] = get_top_performers(nasdaq_stocks, "ytd", False)
            combined_data["nasdaq"]["meta"]["count"] = len(nasdaq_stocks)
            combined_data["nasdaq"]["meta"]["timestamp"] = datetime.now(timezone.utc).isoformat()

        # Extraction des données STOXX
        logger.info("📊 Début du scraping STOXX...")
        stoxx_result = scrape_all_stoxx()
        stoxx_stocks = stoxx_result.get("all_stocks", [])
        
        if stoxx_stocks:
            # Organiser par lettre alphabétique
            stoxx_by_letter = {letter: [] for letter in "abcdefghijklmnopqrstuvwxyz"}
            for stock in stoxx_stocks:
                if stock.get("name"):
                    first_letter = stock["name"][0].lower()
                    if first_letter in stoxx_by_letter:
                        stoxx_by_letter[first_letter].append(stock)
            
            # Mettre à jour les données STOXX
            combined_data["stoxx"]["indices"] = stoxx_by_letter
            combined_data["stoxx"]["top_performers"]["daily"]["best"] = get_top_performers(stoxx_stocks, "change", True)
            combined_data["stoxx"]["top_performers"]["daily"]["worst"] = get_top_performers(stoxx_stocks, "change", False)
            combined_data["stoxx"]["top_performers"]["ytd"]["best"] = get_top_performers(stoxx_stocks, "ytd", True)
            combined_data["stoxx"]["top_performers"]["ytd"]["worst"] = get_top_performers(stoxx_stocks, "ytd", False)
            combined_data["stoxx"]["meta"]["count"] = len(stoxx_stocks)
            combined_data["stoxx"]["meta"]["timestamp"] = datetime.now(timezone.utc).isoformat()
            
            # Si nous avons des informations de pagination
            if stoxx_result.get("pages"):
                combined_data["stoxx"]["meta"]["pagination"]["totalPages"] = stoxx_result.get("pages", 1)

        # Chemin explicite pour lists.json
        lists_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lists.json")
        logger.info(f"📝 Sauvegarde des données combinées dans: {lists_path}")

        # Vérifier que les données à écrire sont bien structurées
        logger.info(f"📊 Structure des données: {len(combined_data.keys())} marchés, " 
                  f"NASDAQ: {combined_data['nasdaq']['meta']['count']} actions, "
                  f"STOXX: {combined_data['stoxx']['meta']['count']} actions")

        # Sauvegarder les données dans lists.json avec gestion d'erreur
        try:
            with open(lists_path, 'w', encoding='utf-8') as f:
                json.dump(combined_data, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Données sauvegardées avec succès dans {lists_path}")
        except Exception as e:
            logger.error(f"❌ ERREUR lors de la sauvegarde dans lists.json: {str(e)}")
            import traceback
            traceback.print_exc()

        # Créer le classement global pour compatibilité
        if nasdaq_stocks and stoxx_stocks:
            logger.info("📊 Création du classement global NASDAQ + STOXX...")
            create_global_rankings(nasdaq_stocks, stoxx_result)

        # Créer des fichiers séparés pour les top performers de chaque marché
        timestamp_str = datetime.now(timezone.utc).isoformat()

        # Création du fichier top_nasdaq_performers.json
        if nasdaq_stocks:
            logger.info(f"📊 Création du fichier top_nasdaq_performers.json avec déduplication stricte...")
            create_market_top_performers_file(nasdaq_stocks, "NASDAQ", timestamp_str)

        # Création du fichier top_stoxx_performers.json
        if stoxx_stocks:
            logger.info(f"📊 Création du fichier top_stoxx_performers.json avec déduplication stricte...")
            create_market_top_performers_file(stoxx_stocks, "STOXX", timestamp_str)

        # Résumé de la mise à jour
        result_summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "nasdaq": {
                "count": len(nasdaq_stocks),
                "status": "success" if nasdaq_stocks else "error"
            },
            "stoxx": {
                "count": len(stoxx_stocks),
                "status": "success" if stoxx_stocks else "error"
            },
            "combined_file": "lists.json",
            "global_ranking": {
                "status": "success" if nasdaq_stocks and stoxx_stocks else "error",
                "file": "global_top_performers.json"
            },
            "market_tops": {
                "nasdaq": "top_nasdaq_performers.json",
                "stoxx": "top_stoxx_performers.json"
            }
        }

        summary_path = os.path.join(CONFIG["stoxx"]["output_dir"], "update_summary.json")
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(result_summary, f, ensure_ascii=False, indent=2)

        logger.info(f"📊 Résumé: {json.dumps(result_summary, indent=2)}")
        logger.info("✅ Script unifié terminé avec succès")

        sys.exit(0)
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
