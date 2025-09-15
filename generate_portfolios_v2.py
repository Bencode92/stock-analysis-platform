import os
import json
import requests
import datetime
import locale
import time
import random
import re
from pathlib import Path
import pandas as pd
from typing import Dict, List, Any, Tuple

# Importer les fonctions d'ajustement des portefeuilles
from portfolio_adjuster import check_portfolio_constraints, adjust_portfolios, get_portfolio_prompt_additions, valid_etfs_cache, valid_bonds_cache
# Importer la fonction de formatage du brief
from brief_formatter import format_brief_data

# ============= NOUVELLES FONCTIONS V2 ROBUSTE =============

def prepare_structured_data(filtered_data: Dict) -> Dict:
    """
    Transforme les données filtrées en format structuré avec IDs courts
    """
    
    # 1. Brief en points numérotés
    brief_points = []
    if filtered_data.get('brief'):
        brief_text = filtered_data['brief']
        # Parser le brief pour extraire les points clés
        brief_points = parse_brief_to_points(brief_text)
    
    # 2. Points marchés
    market_points = []
    if filtered_data.get('markets'):
        market_points = parse_markets_to_points(filtered_data['markets'])
    
    # 3. Points sectoriels
    sector_points = []
    if filtered_data.get('sectors'):
        sector_points = parse_sectors_to_points(filtered_data['sectors'])
    
    # 4. Thèmes
    theme_points = []
    if filtered_data.get('themes'):
        theme_points = parse_themes_to_points(filtered_data['themes'])
    
    return {
        "brief_points": brief_points,
        "market_points": market_points,
        "sector_points": sector_points,
        "theme_points": theme_points
    }

def parse_brief_to_points(brief_text: str) -> List[Dict]:
    """Parse le brief en points numérotés"""
    points = []
    lines = brief_text.split('\n')
    point_id = 1
    
    for line in lines:
        line = line.strip()
        if len(line) > 20 and ('scénario' in line.lower() or 'taux' in line.lower() or 
                              'récession' in line.lower() or 'inflation' in line.lower() or
                              'géopolitique' in line.lower()):
            points.append({
                "id": f"BR{point_id}",
                "text": line[:150] + "..." if len(line) > 150 else line
            })
            point_id += 1
            if point_id > 10:  # Limiter à 10 points max
                break
    
    # Points par défaut si rien trouvé
    if not points:
        points = [
            {"id": "BR1", "text": "Contexte économique incertain avec volatilité des marchés"},
            {"id": "BR2", "text": "Politique monétaire restrictive maintenue par les banques centrales"},
            {"id": "BR3", "text": "Tensions géopolitiques persistantes impactant les secteurs sensibles"}
        ]
    
    return points

def parse_markets_to_points(markets_text: str) -> List[Dict]:
    """Parse les données de marché en points"""
    points = []
    lines = markets_text.split('\n')
    point_id = 1
    
    for line in lines:
        line = line.strip()
        if ('•' in line or line.startswith('-')) and len(line) > 15:
            clean_line = re.sub(r'^[•\-\s]+', '', line)
            if clean_line:
                points.append({
                    "id": f"MC{point_id}",
                    "text": clean_line[:120] + "..." if len(clean_line) > 120 else clean_line
                })
                point_id += 1
                if point_id > 8:
                    break
    
    if not points:
        points = [
            {"id": "MC1", "text": "Marchés US en consolidation avec volatilité élevée"},
            {"id": "MC2", "text": "Europe : performance relative des valeurs défensives"},
            {"id": "MC3", "text": "Asie : rebond technique après phase de correction"}
        ]
    
    return points

def parse_sectors_to_points(sectors_text: str) -> List[Dict]:
    """Parse les données sectorielles en points"""
    points = []
    lines = sectors_text.split('\n')
    point_id = 1
    
    for line in lines:
        line = line.strip()
        if ('•' in line or line.startswith('-')) and len(line) > 15:
            clean_line = re.sub(r'^[•\-\s]+', '', line)
            if clean_line:
                points.append({
                    "id": f"SEC{point_id}",
                    "text": clean_line[:120] + "..." if len(clean_line) > 120 else clean_line
                })
                point_id += 1
                if point_id > 8:
                    break
    
    if not points:
        points = [
            {"id": "SEC1", "text": "Technologie : correction après euphorie IA, opportunités sélectives"},
            {"id": "SEC2", "text": "Santé : résilience confirmée avec valorisations attractives"},
            {"id": "SEC3", "text": "Énergie : bénéficie de la volatilité géopolitique"}
        ]
    
    return points

def parse_themes_to_points(themes_text: str) -> List[Dict]:
    """Parse les thèmes en points"""
    points = []
    lines = themes_text.split('\n')
    point_id = 1
    
    for line in lines:
        line = line.strip()
        if ('•' in line or line.startswith('-')) and len(line) > 15:
            clean_line = re.sub(r'^[•\-\s]+', '', line)
            if clean_line:
                points.append({
                    "id": f"TH{point_id}",
                    "text": clean_line[:120] + "..." if len(clean_line) > 120 else clean_line
                })
                point_id += 1
                if point_id > 6:
                    break
    
    if not points:
        points = [
            {"id": "TH1", "text": "Intelligence artificielle : transition vers applications concrètes"},
            {"id": "TH2", "text": "ESG : accélération réglementaire européenne"},
            {"id": "TH3", "text": "Crypto : adoption institutionnelle progressive"}
        ]
    
    return points

def extract_allowed_assets(filtered_data: Dict) -> Dict:
    """
    Extrait les actifs autorisés depuis les données filtrées
    et les structure en univers fermés
    """
    
    # Actions autorisées (extraire depuis filtered_lists)
    allowed_equities = extract_equities_from_filtered_lists(filtered_data.get('lists', ''))
    
    # ETF standards autorisés
    allowed_etfs_standard = extract_etfs_from_filtered_data(filtered_data.get('etfs', ''))
    
    # ETF obligataires autorisés
    allowed_bond_etfs = []
    if filtered_data.get('bond_etf_names'):
        for i, name in enumerate(filtered_data['bond_etf_names'][:15]):  # Top 15
            allowed_bond_etfs.append({
                "id": f"ETF_b{i+1}",
                "name": name
            })
    
    # Cryptos autorisées
    allowed_crypto = extract_crypto_from_filtered_data(filtered_data.get('crypto', ''))
    
    return {
        "allowed_equities": allowed_equities,
        "allowed_etfs_standard": allowed_etfs_standard,
        "allowed_bond_etfs": allowed_bond_etfs,
        "allowed_crypto": allowed_crypto
    }

def extract_equities_from_filtered_lists(lists_text: str) -> List[Dict]:
    """Extrait les actions depuis le texte filtré"""
    equities = []
    lines = lists_text.split('\n')
    eq_id = 1
    
    for line in lines:
        if '•' in line and ('YTD' in line or '%' in line):
            # Parse: "• Apple Inc: YTD 45.2%, Daily 1.2% | Secteur: Technology"
            match = re.search(r'•\s*([^:]+):\s*YTD\s*([\d\.-]+)%.*?Secteur:\s*([^|]+)', line)
            if match:
                name = match.group(1).strip()
                ytd = float(match.group(2))
                sector = match.group(3).strip() if match.group(3) else "Technology"
                
                # Déterminer la région basée sur des heuristiques
                region = "US"
                if any(eu_indicator in name.lower() for eu_indicator in ['sap', 'asml', 'airbus', 'lvmh', 'nestle']):
                    region = "Europe"
                elif any(asia_indicator in name.lower() for asia_indicator in ['toyota', 'samsung', 'tsmc', 'alibaba']):
                    region = "Asia"
                
                equities.append({
                    "id": f"EQ_{eq_id}",
                    "name": name,
                    "region": region,
                    "sector": sector,
                    "ytd": ytd
                })
                eq_id += 1
                
                if eq_id > 50:  # Limiter à 50 actions max
                    break
    
    # Actions par défaut si rien trouvé
    if not equities:
        equities = [
            {"id": "EQ_1", "name": "Microsoft Corporation", "region": "US", "sector": "Technology", "ytd": 12.5},
            {"id": "EQ_2", "name": "Apple Inc.", "region": "US", "sector": "Technology", "ytd": 8.3},
            {"id": "EQ_3", "name": "NVIDIA Corporation", "region": "US", "sector": "Technology", "ytd": 35.2},
            {"id": "EQ_4", "name": "Johnson & Johnson", "region": "US", "sector": "Healthcare", "ytd": 5.1},
            {"id": "EQ_5", "name": "Berkshire Hathaway Inc.", "region": "US", "sector": "Financial", "ytd": 7.8},
            {"id": "EQ_6", "name": "ASML Holding N.V.", "region": "Europe", "sector": "Technology", "ytd": 15.2},
            {"id": "EQ_7", "name": "Nestlé S.A.", "region": "Europe", "sector": "Consumer", "ytd": 3.2}
        ]
    
    return equities

def extract_etfs_from_filtered_data(etfs_text: str) -> List[Dict]:
    """Extrait les ETF standards depuis le texte filtré"""
    etfs = []
    lines = etfs_text.split('\n')
    etf_id = 1
    
    for line in lines:
        if '•' in line and 'ETF' in line.upper() and 'OBLIGAT' not in line.upper():
            # Parse: "• Vanguard S&P 500 ETF : 12.5%"
            match = re.search(r'•\s*([^:]+)', line)
            if match:
                name = match.group(1).strip()
                etfs.append({
                    "id": f"ETF_s{etf_id}",
                    "name": name
                })
                etf_id += 1
                
                if etf_id > 20:  # Limiter à 20 ETF max
                    break
    
    # ETF par défaut si rien trouvé
    if not etfs:
        etfs = [
            {"id": "ETF_s1", "name": "Vanguard S&P 500 ETF"},
            {"id": "ETF_s2", "name": "iShares MSCI World UCITS ETF"},
            {"id": "ETF_s3", "name": "Vanguard FTSE Europe ETF"},
            {"id": "ETF_s4", "name": "iShares MSCI Emerging Markets ETF"},
            {"id": "ETF_s5", "name": "Invesco QQQ Trust ETF"}
        ]
    
    return etfs

def extract_crypto_from_filtered_data(crypto_text: str) -> List[Dict]:
    """Extrait les cryptos depuis le texte filtré"""
    cryptos = []
    lines = crypto_text.split('\n')
    cr_id = 1
    
    for line in lines:
        if '•' in line and ('24h:' in line or '7j:' in line):
            # Parse: "• Bitcoin (BTC): 24h: +2.5%, 7j: +8.3%"
            match = re.search(r'•\s*([^(]+)\(([^)]+)\).*?7j:\s*([\+\-]?[\d\.]+)%', line)
            if match:
                name = match.group(1).strip()
                symbol = match.group(2).strip()
                seven_days = float(match.group(3))
                
                cryptos.append({
                    "id": f"CR_{cr_id}",
                    "name": name,
                    "symbol": symbol,
                    "sevenDaysPositif": seven_days > 0
                })
                cr_id += 1
                
                if cr_id > 10:  # Limiter à 10 cryptos max
                    break
    
    # Cryptos par défaut si rien trouvé
    if not cryptos:
        cryptos = [
            {"id": "CR_1", "name": "Bitcoin", "symbol": "BTC", "sevenDaysPositif": True},
            {"id": "CR_2", "name": "Ethereum", "symbol": "ETH", "sevenDaysPositif": True},
            {"id": "CR_3", "name": "Solana", "symbol": "SOL", "sevenDaysPositif": False}
        ]
    
    return cryptos

def build_robust_prompt_v2(structured_data: Dict, allowed_assets: Dict, current_month: str) -> str:
    """
    Construit le prompt v2 robuste avec univers fermés
    """
    
    prompt = f"""Tu es un expert en allocation. Construis TROIS portefeuilles (Agressif, Modéré, Stable).

## Données structurées (univers fermés)
BRIEF_POINTS = {json.dumps(structured_data['brief_points'], ensure_ascii=False)}
MARKETS = {json.dumps(structured_data['market_points'], ensure_ascii=False)}
SECTORS = {json.dumps(structured_data['sector_points'], ensure_ascii=False)}
THEMES = {json.dumps(structured_data['theme_points'], ensure_ascii=False)}

ALLOWED_EQUITIES = {json.dumps(allowed_assets['allowed_equities'], ensure_ascii=False)}
ALLOWED_ETFS_STANDARD = {json.dumps(allowed_assets['allowed_etfs_standard'], ensure_ascii=False)}
ALLOWED_BOND_ETFS = {json.dumps(allowed_assets['allowed_bond_etfs'], ensure_ascii=False)}
ALLOWED_CRYPTO = {json.dumps(allowed_assets['allowed_crypto'], ensure_ascii=False)}

## Règles ABSOLUES
- Choisir uniquement des actifs dont l'`id` figure dans les listes ALLOWED_*.
- 3 portefeuilles : chacun **12 à 15** lignes (somme Actions+ETF+Obligations+Crypto).
- **≥2 catégories** par portefeuille (parmi: Actions, ETF, Obligations, Crypto).
- **Somme des allocations = 100.00** avec **2 décimales**. La **dernière ligne** ajuste pour atteindre 100.00.
- Catégorie **Obligations** = ALLOWED_BOND_ETFS exclusivement. Interdit ailleurs.
- Catégorie **ETF** = uniquement ALLOWED_ETFS_STANDARD (aucun bond ETF ici).
- Catégorie **Crypto** = actifs de ALLOWED_CRYPTO avec `sevenDaysPositif=true`.
- Un même `id` ne peut apparaître qu'**une fois** par portefeuille.

## Logique d'investissement (synthèse)
- Chaque actif doit être justifié par **≥1 référence** parmi BRIEF(Macro), MARKETS(Géo), SECTORS(Secteur), THEMES(Thèmes).
  Utilise les **IDs** (ex: ["BR2","MC1"]).
- Ne **jamais** choisir sur la seule base de la perf YTD.
- Contexte : Ces portefeuilles sont optimisés pour le mois de {current_month}.

## Profils de portefeuilles
- **Agressif** : 60-80% Actions/Crypto, 10-25% ETF, 5-15% Obligations
- **Modéré** : 40-60% Actions, 25-40% ETF, 15-25% Obligations, 0-10% Crypto
- **Stable** : 20-40% Actions, 30-50% ETF, 25-40% Obligations, 0-5% Crypto

## Commentaires attendus (par portefeuille)
- `Commentaire` (≤1000 caractères), structure:
  1) Actualités (BRIEF) — 2 phrases neutres
  2) Marchés (MARKETS) — 2 phrases
  3) Secteurs (SECTORS/THEMES) — 2 phrases
  4) Choix des actifs — 3 phrases max reliant le mix aux refs (IDs)

## Actifs exclus
- Fournis 2-3 `ActifsExclus` avec `reason` courte et `refs` (IDs) expliquant l'exclusion.

## Format de SORTIE (STRICT, JSON UNIQUEMENT, pas de markdown, aucun texte hors JSON)
{{
  "Agressif": {{
    "Commentaire": "Actualités: [référence BRIEF]. Marchés: [référence MARKETS]. Secteurs: [référence SECTORS/THEMES]. Choix: Mix agressif privilégiant la croissance avec exposition crypto mesurée.",
    "Lignes": [
      {{"id":"EQ_1",   "name":"Microsoft Corporation", "category":"Actions",     "allocation_pct":15.00, "justificationRefs":["BR1","SEC1"], "justification":"Leadership technologique et résilience"}},
      {{"id":"ETF_s1", "name":"Vanguard S&P 500 ETF",  "category":"ETF",         "allocation_pct":25.00, "justificationRefs":["MC1"],        "justification":"Exposition large au marché US"}},
      {{"id":"ETF_b1", "name":"ETF Obligations 1",     "category":"Obligations", "allocation_pct":10.00, "justificationRefs":["BR2"],        "justification":"Stabilisation du portefeuille"}},
      {{"id":"CR_1",   "name":"Bitcoin",               "category":"Crypto",      "allocation_pct":8.00,  "justificationRefs":["TH1"],        "justification":"Diversification alternative"}}
    ],
    "ActifsExclus": [
      {{"name":"Tesla Inc", "reason":"Valorisation excessive malgré +80% YTD", "refs":["BR1"]}},
      {{"name":"ARKK ETF", "reason":"Risque de correction sévère", "refs":["MC1"]}}
    ]
  }},
  "Modéré": {{
    "Commentaire": "...",
    "Lignes": [
      // 12-15 lignes avec allocations totalisant 100.00
    ],
    "ActifsExclus": [...]
  }},
  "Stable": {{
    "Commentaire": "...", 
    "Lignes": [
      // 12-15 lignes avec allocations totalisant 100.00
    ],
    "ActifsExclus": [...]
  }}
}}

### CONTRÔLE QUALITÉ (obligatoire avant d'émettre la réponse)
- Vérifie que chaque portefeuille a 12–15 lignes, ≥2 catégories, somme = 100.00 exactement (2 décimales).
- Vérifie qu'aucun `id` n'est dupliqué et que chaque catégorie respecte ses univers autorisés.
- Si une règle échoue, corrige puis ne sors que le JSON final conforme.
- Ta réponse doit commencer par `{{` et finir par `}}` — **aucun autre caractère**.
"""
    
    return prompt

def validate_portfolios_v2(portfolios: Dict) -> Tuple[bool, List[str]]:
    """
    Validation stricte des portefeuilles générés
    """
    errors = []
    
    for portfolio_name, portfolio in portfolios.items():
        if not isinstance(portfolio.get('Lignes'), list):
            errors.append(f"{portfolio_name}: 'Lignes' manquant ou invalide")
            continue
            
        lignes = portfolio['Lignes']
        
        # Vérifier le nombre d'actifs
        if not (12 <= len(lignes) <= 15):
            errors.append(f"{portfolio_name}: {len(lignes)} actifs (requis: 12-15)")
        
        # Vérifier la somme des allocations
        total_allocation = sum(ligne.get('allocation_pct', 0) for ligne in lignes)
        if abs(total_allocation - 100.0) > 0.01:
            errors.append(f"{portfolio_name}: allocation totale = {total_allocation:.2f}% (requis: 100.00%)")
        
        # Vérifier les IDs uniques
        ids = [ligne.get('id') for ligne in lignes if ligne.get('id')]
        if len(ids) != len(set(ids)):
            errors.append(f"{portfolio_name}: IDs dupliqués détectés")
        
        # Vérifier les catégories
        categories = set(ligne.get('category') for ligne in lignes if ligne.get('category'))
        if len(categories) < 2:
            errors.append(f"{portfolio_name}: moins de 2 catégories ({categories})")
        
        # Vérifier que les obligations ne sont que des ETF obligataires
        for ligne in lignes:
            if ligne.get('category') == 'Obligations' and not ligne.get('id', '').startswith('ETF_b'):
                errors.append(f"{portfolio_name}: Obligation invalide - {ligne.get('name')}")
    
    return len(errors) == 0, errors

def fix_portfolios_v2(portfolios: Dict, errors: List[str]) -> Dict:
    """
    Correction automatique des portefeuilles si possible
    """
    for portfolio_name, portfolio in portfolios.items():
        if 'Lignes' in portfolio:
            lignes = portfolio['Lignes']
            
            if not lignes:
                continue
            
            # Ajuster les allocations pour atteindre 100%
            total = sum(ligne.get('allocation_pct', 0) for ligne in lignes)
            if abs(total - 100.0) > 0.01:
                # Ajuster la dernière ligne
                diff = 100.0 - total
                lignes[-1]['allocation_pct'] = round(lignes[-1]['allocation_pct'] + diff, 2)
                print(f"✅ Ajustement allocation {portfolio_name}: {diff:+.2f}% sur {lignes[-1]['name']}")
    
    return portfolios

def convert_to_legacy_format(portfolios_v2: Dict) -> Dict:
    """
    Convertit le format v2 au format legacy pour compatibilité
    """
    legacy_portfolios = {}
    
    for portfolio_name, portfolio in portfolios_v2.items():
        legacy_portfolio = {
            "Commentaire": portfolio.get("Commentaire", ""),
            "ActifsExclus": portfolio.get("ActifsExclus", [])
        }
        
        # Regrouper par catégorie
        lignes = portfolio.get("Lignes", [])
        
        for ligne in lignes:
            category = ligne.get("category", "Actions")
            name = ligne.get("name", "")
            allocation = ligne.get("allocation_pct", 0)
            
            if category not in legacy_portfolio:
                legacy_portfolio[category] = {}
            
            legacy_portfolio[category][name] = f"{allocation}%"
        
        legacy_portfolios[portfolio_name] = legacy_portfolio
    
    return legacy_portfolios

def generate_portfolios_v2(filtered_data: Dict) -> Dict:
    """
    Version améliorée robuste de la génération de portefeuilles
    """
    
    api_key = os.environ.get('API_CHAT')
    if not api_key:
        raise ValueError("La clé API OpenAI (API_CHAT) n'est pas définie.")
    
    current_month = get_current_month_fr()
    
    print("🔍 Préparation des données structurées v2...")
    
    # Préparer les données structurées
    structured_data = prepare_structured_data(filtered_data)
    allowed_assets = extract_allowed_assets(filtered_data)
    
    print(f"📊 Actifs extraits:")
    print(f"  - Actions: {len(allowed_assets['allowed_equities'])}")
    print(f"  - ETF standards: {len(allowed_assets['allowed_etfs_standard'])}")
    print(f"  - ETF obligataires: {len(allowed_assets['allowed_bond_etfs'])}")
    print(f"  - Cryptos: {len(allowed_assets['allowed_crypto'])}")
    
    # Construire le prompt robuste
    prompt = build_robust_prompt_v2(structured_data, allowed_assets, current_month)
    
    # Sauvegarder le prompt pour debug
    debug_timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    save_prompt_to_debug_file(prompt, debug_timestamp + "_v2")
    
    # Configuration API avec forçage JSON
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "gpt-4-turbo",  # ou gpt-o3 si disponible
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,  # 0 pour maximum de déterminisme
        "response_format": {"type": "json_object"}  # Force le JSON
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"🚀 Envoi de la requête à l'API OpenAI v2 (tentative {attempt+1}/{max_retries})...")
            response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data)
            response.raise_for_status()
            
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            # Sauvegarder la réponse
            response_debug_file = f"debug/prompts/response_{debug_timestamp}_v2.txt"
            os.makedirs("debug/prompts", exist_ok=True)
            with open(response_debug_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Parsing direct (pas de nettoyage nécessaire avec response_format)
            portfolios_v2 = json.loads(content)
            
            # Validation post-génération
            validation_ok, validation_errors = validate_portfolios_v2(portfolios_v2)
            if not validation_ok:
                print(f"⚠️ Erreurs de validation détectées: {validation_errors}")
                portfolios_v2 = fix_portfolios_v2(portfolios_v2, validation_errors)
                
                # Re-valider après correction
                validation_ok_2, validation_errors_2 = validate_portfolios_v2(portfolios_v2)
                if validation_ok_2:
                    print("✅ Corrections appliquées avec succès")
                else:
                    print(f"❌ Erreurs persistantes après correction: {validation_errors_2}")
            
            # Convertir au format legacy pour compatibilité
            legacy_portfolios = convert_to_legacy_format(portfolios_v2)
            
            print("✅ Portefeuilles v2 générés avec succès")
            
            # Afficher un résumé
            for portfolio_type, portfolio in portfolios_v2.items():
                lignes = portfolio.get('Lignes', [])
                categories = set(ligne.get('category') for ligne in lignes)
                total_allocation = sum(ligne.get('allocation_pct', 0) for ligne in lignes)
                print(f"  📊 {portfolio_type}: {len(lignes)} actifs, {len(categories)} catégories, {total_allocation:.1f}% total")
            
            return legacy_portfolios
            
        except json.JSONDecodeError as e:
            print(f"❌ Erreur JSON (tentative {attempt+1}): {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Backoff exponentiel
                continue
            else:
                raise
        except Exception as e:
            print(f"❌ Erreur lors de la tentative {attempt+1}: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
                continue
            else:
                raise

# ============= FONCTIONS ORIGINALES (inchangées) =============

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

def build_lists_summary_from_stocks_files(stocks_paths):
    """Remplace filter_lists_data(lists_data) avec les nouveaux stocks_*.json."""
    def load_json_safe(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"  ⚠️ Impossible de charger {p}: {str(e)}")
            return {}
    
    def fnum(x):
        s = re.sub(r'[^0-9.\-]', '', str(x or ''))
        try: 
            return float(s) if s not in ('', '-', '.', '-.') else 0.0
        except: 
            return 0.0

    by_sector, by_country = {}, {}
    total_stocks_loaded = 0
    
    for p in stocks_paths:
        data = load_json_safe(p)
        items = data.get("stocks", [])
        print(f"  📊 {p.name}: {len(items)} stocks trouvées")
        total_stocks_loaded += len(items)
        
        for it in items:
            name = it.get("name") or it.get("ticker") or ""
            sector = it.get("sector") or "Non classé"
            country = it.get("country") or "Non précisé"
            ytd = it.get("perf_ytd") or it.get("ytd") or it.get("perf_1y") or 0
            daily = it.get("perf_1d") or it.get("change_percent") or 0
            ytd_v, daily_v = fnum(ytd), fnum(daily)
            
            # Même filtre que l'ancien: YTD [-5,120], Daily > -10
            if -5 <= ytd_v <= 120 and daily_v > -10:
                # Ajouter des tags pour les actifs potentiellement intéressants
                display_name = name
                if ytd_v > 50 and daily_v < 0:
                    display_name = f"🚩 {name} (potentielle surévaluation)"
                elif ytd_v > 10 and daily_v < -5:
                    display_name = f"📉 {name} (forte baisse récente mais secteur haussier)"
                
                row = {
                    "name": display_name,
                    "ytd": ytd_v,
                    "daily": daily_v,
                    "sector": sector,
                    "country": country,
                    "original_name": name
                }
                by_sector.setdefault(sector, []).append(row)
                by_country.setdefault(country, []).append(row)

    print(f"  ✅ Total stocks chargées: {total_stocks_loaded}")
    print(f"  ✅ Stocks filtrées (YTD -5% à 120% et Daily > -10%): {sum(len(v) for v in by_sector.values())}")

    lines = ["📋 TOP 5 ACTIFS PAR SECTEUR (YTD -5% à 120% et Daily > -10%) :"]
    total = 0
    
    for sector in sorted(by_sector.keys()):
        xs = sorted(by_sector[sector], key=lambda r: r["ytd"], reverse=True)[:5]
        if not xs: continue
        lines.append(f"\n🏭 SECTEUR: {sector.upper()} ({len(xs)} actifs)")
        for r in xs:
            country_info = f" | Pays: {r['country']}" if r['country'] != "Non précisé" else ""
            lines.append(f"• {r['name']}: YTD {r['ytd']:.2f}%, Daily {r['daily']:.2f}%{country_info}")
        total += len(xs)
    
    lines.insert(1, f"Total: {total} actifs répartis dans {len(by_sector)} secteurs")

    lines.append("\n🌍 TOP 5 ACTIFS PAR PAYS (YTD -5% à 120% et Daily > -10%) :")
    total_pays = sum(min(5, len(by_country[c])) for c in by_country)
    lines.append(f"Total: {total_pays} actifs répartis dans {len(by_country)} pays")
    
    for country in sorted(by_country.keys()):
        xs = sorted(by_country[country], key=lambda r: r["ytd"], reverse=True)[:5]
        if not xs: continue
        lines.append(f"\n📌 PAYS: {country.upper()} ({len(xs)} actifs)")
        for r in xs:
            sector_info = f" | Secteur: {r['sector']}" if r['sector'] != "Non classé" else ""
            lines.append(f"• {r['name']}: YTD {r['ytd']:.2f}%, Daily {r['daily']:.2f}%{sector_info}")
    
    return "\n".join(lines) if total or total_pays else "Aucune donnée d'actifs significative"

def load_etf_dict_from_csvs(etf_csv_path, bonds_csv_path):
    """Construit le dict attendu par filter_etf_data() à partir des CSV."""
    etf = {"top50_etfs": [], "top_short_term_etfs": [], "top_bond_etfs": []}
    
    # Charger les ETF obligataires
    try:
        if Path(bonds_csv_path).exists():
            bdf = pd.read_csv(bonds_csv_path)
            print(f"  📊 ETF obligataires: {len(bdf)} trouvés")
            
            # Trouver les colonnes pertinentes
            name_col = next((c for c in bdf.columns if str(c).lower() in ["name","etf_name","long_name","symbol"]), None)
            ytd_col = next((c for c in bdf.columns if "ytd" in str(c).lower()), None)
            
            if name_col:
                for _, r in bdf.iterrows():
                    etf["top_bond_etfs"].append({
                        "name": str(r[name_col]),
                        "ytd": str(r[ytd_col]) if ytd_col and pd.notna(r[ytd_col]) else "N/A"
                    })
    except Exception as e:
        print(f"  ⚠️ Erreur lors du chargement des bonds: {str(e)}")
    
    # Charger les ETF standards
    try:
        if Path(etf_csv_path).exists():
            df = pd.read_csv(etf_csv_path)
            print(f"  📊 ETF standards: {len(df)} trouvés")
            
            # Trouver les colonnes pertinentes
            name_col = next((c for c in df.columns if str(c).lower() in ["name","etf_name","long_name","symbol"]), None)
            ytd_col = next((c for c in df.columns if "ytd" in str(c).lower()), None)
            dur_col = next((c for c in df.columns if "duration" in str(c).lower()), None)
            
            if name_col:
                # Top 50 ETF par performance YTD
                if ytd_col:
                    df_sorted = df.sort_values(ytd_col, ascending=False)
                else:
                    df_sorted = df
                    
                for _, r in df_sorted.head(50).iterrows():
                    etf["top50_etfs"].append({
                        "name": str(r[name_col]),
                        "ytd": str(r[ytd_col]) if ytd_col and pd.notna(r[ytd_col]) else "N/A"
                    })
                
                # ETF court terme (heuristique)
                if dur_col and dur_col in df.columns:
                    short = df[df[dur_col] <= 1.0]
                else:
                    # Recherche par nom si pas de colonne duration
                    pattern = r"short\s*term|ultra\s*short|0[-–]1|1[-–]3\s*year"
                    short = df[df[name_col].astype(str).str.contains(pattern, case=False, regex=True)]
                
                for _, r in short.head(20).iterrows():
                    etf["top_short_term_etfs"].append({
                        "name": str(r[name_col]),
                        "oneMonth": "N/A"
                    })
    except Exception as e:
        print(f"  ⚠️ Erreur lors du chargement des ETF: {str(e)}")
    
    return etf

def load_crypto_dict_from_csv(csv_path):
    """Construit une structure minimale compatible filter_crypto_data()."""
    out = {"categories": {"main": []}}
    
    try:
        if Path(csv_path).exists():
            df = pd.read_csv(csv_path)
            print(f"  🪙 Cryptos: {len(df)} trouvées dans le CSV")
        else:
            print(f"  ⚠️ Fichier crypto non trouvé: {csv_path}")
            return out
    except Exception as e:
        print(f"  ⚠️ Erreur lors du chargement des cryptos: {str(e)}")
        return out
    
    # Mapper les colonnes
    cols = {c.lower(): c for c in df.columns}
    c_sym = next((cols[x] for x in cols if x in ["symbol","pair"]), None)
    c_r1 = next((cols[x] for x in cols if x in ["ret_1d_pct","ret_1d","ret_1d%","perf_1d"]), None)
    c_r7 = next((cols[x] for x in cols if x in ["ret_7d_pct","ret_7d","ret_7d%","perf_7d"]), None)
    c_pr = next((cols[x] for x in cols if "last_close" in x or "price" in x), None)
    c_tier = next((cols[x] for x in cols if "tier1" in x), None)
    
    def as_bool(v):
        return str(v).lower() in ["true","1","yes"]
    
    cryptos_added = 0
    for _, r in df.iterrows():
        # Filtrer par tier si la colonne existe
        if c_tier and not as_bool(r[c_tier]):
            continue
            
        name = str(r[c_sym]) if c_sym else ""
        out["categories"]["main"].append({
            "name": name,
            "symbol": name,
            "price": str(r[c_pr]) if c_pr and pd.notna(r[c_pr]) else "",
            "change_24h": f"{r[c_r1]}%" if c_r1 and pd.notna(r[c_r1]) else "0%",
            "change_7d": f"{r[c_r7]}%" if c_r7 and pd.notna(r[c_r7]) else "0%",
        })
        cryptos_added += 1
    
    print(f"  ✅ Cryptos ajoutées au dict: {cryptos_added}")
    return out

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

def filter_etf_data(etfs_data):
    """Filtre les ETF par catégories."""
    if not etfs_data or not isinstance(etfs_data, dict):
        return "Aucune donnée ETF disponible", []
    
    summary = []
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

    # 2. TOP ETF OBLIGATIONS 2025
    bond_etfs = etfs_data.get("top_bond_etfs", [])
    bond_names = []
    selected_bonds = []
    
    for etf in bond_etfs:
        if etf.get('name'):
            bond_names.append(etf['name'])
            selected_bonds.append(f"{etf['name']} : {etf.get('ytd', 'N/A')}")
    
    if selected_bonds:
        summary.append("📉 LISTE DES ETF OBLIGATAIRES (À UTILISER UNIQUEMENT DANS LA CATÉGORIE OBLIGATIONS):")
        summary.extend(f"• {etf}" for etf in selected_bonds)

    # Si aucun ETF obligataire n'a été trouvé, ajouter des exemples par défaut
    if not bond_names:
        print("⚠️ Aucun ETF obligataire trouvé dans les données, ajout d'exemples de secours")
        bond_names = [
            "iShares Euro Government Bond 3-5yr UCITS ETF",
            "Xtrackers II Eurozone Government Bond UCITS ETF",
            "Lyxor Euro Government Bond UCITS ETF"
        ]
    
    return "\n".join(summary), bond_names

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
                    summary.append(f"• {name}: {reason} (Score: {score}")
    
    # Traiter les tendances baissières
    if "bearish" in themes_data and isinstance(themes_data["bearish"], list):
        summary.append("🔽 THÈMES BAISSIERS:")
        for theme in themes_data["bearish"]:
            if isinstance(theme, dict):
                name = theme.get("name", "")
                reason = theme.get("reason", "")
                score = theme.get("score", "")
                if name:
                    summary.append(f"• {name}: {reason} (Score: {score}")
    
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
        <h1>TradePulse - Debug de Prompt OpenAI v2</h1>
        <div class="info">
            <p>Timestamp: {timestamp}</p>
            <p>Taille totale du prompt: {len(prompt)} caractères</p>
        </div>
        <h2>Contenu du prompt envoyé à OpenAI :</h2>
        <pre>{prompt.replace('<', '&lt;').replace('>', '&gt;')}</pre>
    </body>
    </html>
    """
    
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✅ Prompt v2 sauvegardé dans {debug_file}")
    print(f"✅ Version HTML v2 sauvegardée dans {html_file}")
    
    return debug_file, html_file

def generate_portfolios(filtered_data):
    """Fonction legacy - redirige vers la version v2"""
    print("🔄 Redirection vers generate_portfolios_v2...")
    return generate_portfolios_v2(filtered_data)

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
                if category not in ["Commentaire", "ActifsExclus"]:  # Ne pas compter le commentaire comme une catégorie d'actifs
                    count = len(assets) if isinstance(assets, dict) else 0
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
    """Version modifiée pour utiliser les nouveaux fichiers."""
    print("🔍 Chargement des données financières...")
    print("=" * 60)
    
    # ========== CHARGEMENT DES DONNÉES DEPUIS LES NOUVEAUX FICHIERS ==========
    
    # 1. Données inchangées (gardent les anciens formats)
    print("\n📂 Chargement des fichiers JSON standards...")
    markets_data = load_json_data('data/markets.json')
    sectors_data = load_json_data('data/sectors.json')
    themes_data = load_json_data('data/themes.json')
    news_data = load_json_data('data/news.json')  # ou news_digest.json si disponible
    
    # 2. Nouveaux fichiers stocks
    print("\n📂 Chargement des nouveaux fichiers stocks...")
    stocks_files = [
        Path('data/stocks_us.json'),
        Path('data/stocks_europe.json'),
        Path('data/stocks_asia.json')
    ]
    stocks_files_exist = [f for f in stocks_files if f.exists()]
    print(f"  Fichiers trouvés: {[f.name for f in stocks_files_exist]}")
    
    # 3. Nouveaux fichiers ETF
    print("\n📂 Chargement des nouveaux fichiers ETF/Bonds...")
    etf_csv = Path('data/combined_etfs.csv')
    bonds_csv = Path('data/combined_bonds.csv')
    print(f"  ETF CSV existe: {etf_csv.exists()}")
    print(f"  Bonds CSV existe: {bonds_csv.exists()}")
    
    # 4. Nouveau fichier crypto
    print("\n📂 Chargement du nouveau fichier crypto...")
    crypto_csv = Path('data/filtered/Crypto_filtered_volatility.csv')
    print(f"  Crypto CSV existe: {crypto_csv.exists()}")
    
    # 5. Brief stratégique
    print("\n📂 Recherche du brief stratégique...")
    brief_data = None
    brief_paths = ['brief_ia.json', './brief_ia.json', 'data/brief_ia.json']
    for path in brief_paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                brief_data = json.load(f)
                print(f"  ✅ Brief chargé depuis {path}")
                break
        except Exception:
            pass
    
    if brief_data is None:
        print("  ⚠️ Aucun fichier brief_ia.json trouvé")
    
    print("\n" + "=" * 60)
    
    # ========== FILTRAGE ET PRÉPARATION DES DONNÉES ==========
    
    print("\n🔄 Filtrage et préparation des données...")
    
    # Créer le résumé des stocks (remplace l'ancien filter_lists_data)
    filtered_lists = build_lists_summary_from_stocks_files(stocks_files_exist)
    
    # Charger et filtrer les ETF
    etfs_data = load_etf_dict_from_csvs(str(etf_csv), str(bonds_csv))
    filtered_etfs, bond_etf_names = filter_etf_data(etfs_data)
    
    # Charger et filtrer les cryptos
    crypto_data = load_crypto_dict_from_csv(str(crypto_csv))
    filtered_crypto = filter_crypto_data(crypto_data)
    
    # Filtrer les autres données avec les fonctions existantes
    filtered_news = filter_news_data(news_data) if news_data else "Aucune donnée d'actualité disponible"
    filtered_markets = filter_markets_data(markets_data) if markets_data else "Aucune donnée de marché disponible"
    filtered_sectors = filter_sectors_data(sectors_data) if sectors_data else "Aucune donnée sectorielle disponible"
    filtered_themes = filter_themes_data(themes_data) if themes_data else "Aucune donnée de tendances disponible"
    filtered_brief = format_brief_data(brief_data) if brief_data else "Aucun résumé d'actualités disponible"
    
    # ========== GÉNÉRATION DES PORTEFEUILLES V2 ==========
    
    print("\n🧠 Génération des portefeuilles optimisés (v2 robuste)...")
    
    # Préparer le dictionnaire des données filtrées
    filtered_data = {
        'news': filtered_news,
        'markets': filtered_markets,
        'sectors': filtered_sectors,
        'lists': filtered_lists,
        'etfs': filtered_etfs,
        'crypto': filtered_crypto,
        'themes': filtered_themes,
        'brief': filtered_brief,
        'bond_etf_names': bond_etf_names
    }
    
    # Générer les portefeuilles avec la v2
    portfolios = generate_portfolios_v2(filtered_data)
    
    # ========== SAUVEGARDE ==========
    
    print("\n💾 Sauvegarde des portefeuilles...")
    save_portfolios(portfolios)
    
    print("\n✨ Traitement terminé!")

def load_json_data(file_path):
    """Charger des données depuis un fichier JSON."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
            print(f"  ✅ {file_path}: {len(data)} entrées")
            return data
    except Exception as e:
        print(f"  ❌ Erreur {file_path}: {str(e)}")
        return {}

if __name__ == "__main__":
    main()
