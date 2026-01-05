# portfolio_engine/asset_rationale_generator.py
"""
Générateur de justifications LLM pour chaque actif du portefeuille.

V1.0: Génère des explications détaillées pour chaque position via GPT.
- Intègre le contexte RADAR (secteurs/régions favorisés)
- Explique pourquoi chaque actif a été sélectionné
- Adapte le ton selon le profil (Agressif/Modéré/Stable)
"""

import os
import json
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path

logger = logging.getLogger("portfolio.asset_rationale")


def load_market_context_radar(data_dir: str = "data") -> Dict:
    """Charge le contexte RADAR généré."""
    radar_path = Path(data_dir) / "market_context.json"
    if radar_path.exists():
        try:
            with open(radar_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Impossible de charger market_context.json: {e}")
    return {}


def extract_asset_data(asset, asset_id: str, weight: float, asset_lookup: Dict) -> Dict:
    """Extrait les données d'un actif pour le prompt LLM."""
    
    info = asset_lookup.get(str(asset_id), {})
    
    # Récupérer les données depuis source_data si disponible
    source = {}
    if hasattr(asset, 'source_data') and asset.source_data:
        source = asset.source_data
    elif isinstance(asset, dict):
        source = asset
    
    def safe_get(key, default=None):
        if hasattr(asset, key):
            val = getattr(asset, key)
            if val is not None:
                return val
        return source.get(key, default)
    
    return {
        "name": info.get("name") or safe_get("name") or asset_id,
        "ticker": info.get("ticker") or safe_get("ticker") or safe_get("symbol"),
        "weight_pct": round(weight, 1),
        "category": info.get("category") or safe_get("category") or "ETF",
        "sector": safe_get("sector") or safe_get("sector_top") or "Non spécifié",
        "country": safe_get("country") or safe_get("country_top") or "Global",
        "region": safe_get("region") or "Global",
        # Métriques financières
        "roe": safe_get("roe"),
        "de_ratio": safe_get("de_ratio"),
        "pe_ratio": safe_get("pe_ratio"),
        "dividend_yield": safe_get("dividend_yield"),
        # Performance
        "perf_1m": safe_get("perf_1m"),
        "perf_3m": safe_get("perf_3m"),
        "ytd": safe_get("ytd") or safe_get("perf_ytd"),
        # Risque
        "volatility": safe_get("volatility_3y") or safe_get("vol") or safe_get("vol_3y"),
        "max_drawdown": safe_get("max_drawdown_ytd") or safe_get("max_dd"),
        # Scores
        "buffett_score": safe_get("_buffett_score"),
        "composite_score": safe_get("_score") or safe_get("composite_score"),
        # ETF specific
        "ter": safe_get("ter") or safe_get("expense_ratio"),
        "aum": safe_get("aum") or safe_get("total_assets"),
        "fund_type": safe_get("fund_type"),
    }


def build_rationale_prompt(
    assets_data: List[Dict],
    profile: str,
    market_context: Dict,
    portfolio_vol: float = None
) -> str:
    """Construit le prompt pour générer les justifications."""
    
    # Extraire le contexte RADAR
    macro_tilts = market_context.get("macro_tilts", {})
    favored_sectors = macro_tilts.get("favored_sectors", [])
    avoided_sectors = macro_tilts.get("avoided_sectors", [])
    favored_regions = macro_tilts.get("favored_regions", [])
    avoided_regions = macro_tilts.get("avoided_regions", [])
    market_regime = market_context.get("market_regime", "neutre")
    rationale_global = macro_tilts.get("rationale", "")
    key_trends = market_context.get("key_trends", [])
    risks = market_context.get("risks", [])
    
    # Description du profil
    profile_descriptions = {
        "Agressif": "recherche de performance maximale, tolérance élevée au risque, horizon long terme (7+ ans)",
        "Modéré": "équilibre rendement/risque, diversification, horizon moyen terme (3-7 ans)",
        "Stable": "préservation du capital, revenus réguliers, faible volatilité, horizon court-moyen terme"
    }
    profile_desc = profile_descriptions.get(profile, "équilibré")
    
    prompt = f"""Tu es un analyste financier expert. Génère une justification claire et pédagogique pour CHAQUE actif du portefeuille ci-dessous.

## CONTEXTE MARCHÉ (données RADAR)
- Régime actuel: {market_regime}
- Secteurs FAVORISÉS (surpondérés +15%): {', '.join(favored_sectors) if favored_sectors else 'Aucun'}
- Secteurs ÉVITÉS (sous-pondérés -15%): {', '.join(avoided_sectors) if avoided_sectors else 'Aucun'}
- Régions FAVORISÉES: {', '.join(favored_regions) if favored_regions else 'Aucune'}
- Régions ÉVITÉES: {', '.join(avoided_regions) if avoided_regions else 'Aucune'}
- Tendances clés: {', '.join(key_trends) if key_trends else 'N/A'}
- Risques identifiés: {', '.join(risks) if risks else 'N/A'}
- Analyse RADAR: {rationale_global}

## PROFIL INVESTISSEUR: {profile}
Caractéristiques: {profile_desc}
{f'Volatilité cible du portefeuille: {portfolio_vol:.1f}%' if portfolio_vol else ''}

## ACTIFS À JUSTIFIER
"""
    
    for i, asset in enumerate(assets_data, 1):
        prompt += f"""
### Actif {i}: {asset['name']}
- Ticker: {asset['ticker']}
- Poids: {asset['weight_pct']}%
- Catégorie: {asset['category']}
- Secteur: {asset['sector']}
- Pays/Région: {asset['country']}
"""
        # Ajouter les métriques disponibles
        if asset.get('roe'):
            prompt += f"- ROE: {asset['roe']}%\n"
        if asset.get('pe_ratio'):
            prompt += f"- P/E: {asset['pe_ratio']}\n"
        if asset.get('dividend_yield'):
            prompt += f"- Rendement dividende: {asset['dividend_yield']}%\n"
        if asset.get('ytd'):
            prompt += f"- Performance YTD: {asset['ytd']}%\n"
        if asset.get('volatility'):
            prompt += f"- Volatilité: {asset['volatility']}%\n"
        if asset.get('buffett_score'):
            prompt += f"- Score qualité Buffett: {asset['buffett_score']}/100\n"
        if asset.get('ter'):
            prompt += f"- Frais (TER): {asset['ter']}%\n"
        if asset.get('fund_type'):
            prompt += f"- Type de fonds: {asset['fund_type']}\n"
    
    prompt += """
## INSTRUCTIONS
Pour CHAQUE actif, génère une justification de 2-3 phrases qui explique:
1. POURQUOI cet actif a été sélectionné (qualité, momentum, valorisation, etc.)
2. Son RÔLE dans le portefeuille (core, satellite, hedge, income, diversification)
3. Le LIEN avec le contexte marché RADAR si pertinent (secteur/région favorisé ou évité)
4. Les RISQUES spécifiques à surveiller

## FORMAT DE RÉPONSE (JSON strict)
Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après:
```json
{
  "asset_details": [
    {
      "name": "NOM_ACTIF",
      "ticker": "TICKER",
      "rationale": "Justification de 2-3 phrases...",
      "role": "core|satellite|hedge|income|diversification",
      "risk_note": "Risque principal à surveiller",
      "market_context_link": "Lien avec le contexte RADAR (ou null si pas de lien direct)"
    }
  ]
}
```
"""
    
    return prompt


def generate_asset_rationales_sync(
    portfolios: Dict[str, Dict],
    assets: List,
    market_context: Dict,
    openai_client,
    model: str = "gpt-4o-mini"
) -> Dict[str, List[Dict]]:
    """
    Génère les justifications LLM pour tous les actifs de chaque profil.
    
    Returns:
        Dict mapping profile -> list of asset details with rationales
    """
    
    # Construire le lookup des assets
    asset_lookup = {}
    for a in assets:
        aid = getattr(a, 'id', None) or (a.get('id') if isinstance(a, dict) else None)
        if aid:
            name = getattr(a, 'name', None) or (a.get('name') if isinstance(a, dict) else aid)
            category = getattr(a, 'category', None) or (a.get('category') if isinstance(a, dict) else 'ETF')
            ticker = getattr(a, 'ticker', None) or (a.get('ticker') if isinstance(a, dict) else None)
            symbol = None
            if hasattr(a, 'source_data') and a.source_data:
                symbol = a.source_data.get('symbol')
            asset_lookup[str(aid)] = {
                "name": name,
                "category": category,
                "ticker": ticker or symbol or name,
                "asset_obj": a
            }
    
    results = {}
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in portfolios:
            continue
            
        portfolio_data = portfolios[profile]
        allocation = portfolio_data.get("allocation", {})
        diagnostics = portfolio_data.get("diagnostics", {})
        portfolio_vol = diagnostics.get("portfolio_vol")
        
        if not allocation:
            logger.warning(f"Pas d'allocation pour {profile}")
            results[profile] = []
            continue
        
        # Extraire les données de chaque actif
        assets_data = []
        for asset_id, weight in allocation.items():
            # Trouver l'asset correspondant
            asset_obj = None
            for a in assets:
                a_id = getattr(a, 'id', None) or (a.get('id') if isinstance(a, dict) else None)
                if str(a_id) == str(asset_id):
                    asset_obj = a
                    break
            
            asset_data = extract_asset_data(
                asset_obj or {},
                asset_id,
                weight,
                asset_lookup
            )
            assets_data.append(asset_data)
        
        # Construire le prompt
        prompt = build_rationale_prompt(
            assets_data=assets_data,
            profile=profile,
            market_context=market_context,
            portfolio_vol=portfolio_vol
        )
        
        logger.info(f"🤖 Génération des justifications LLM pour {profile} ({len(assets_data)} actifs)...")
        
        try:
            response = openai_client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "Tu es un analyste financier expert. Tu génères des justifications claires et pédagogiques pour les choix d'investissement. Réponds UNIQUEMENT en JSON valide."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=4000
            )
            
            response_text = response.choices[0].message.content.strip()
            
            # Nettoyer le JSON (enlever les backticks markdown si présents)
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1])
            
            # Parser le JSON
            parsed = json.loads(response_text)
            asset_details = parsed.get("asset_details", [])
            
            # Enrichir avec les données originales
            for detail in asset_details:
                # Trouver les données correspondantes
                for asset_data in assets_data:
                    if asset_data["ticker"] == detail.get("ticker") or asset_data["name"] == detail.get("name"):
                        detail["weight_pct"] = asset_data["weight_pct"]
                        detail["category"] = asset_data["category"]
                        detail["sector"] = asset_data["sector"]
                        detail["country"] = asset_data["country"]
                        detail["metrics"] = {
                            "roe": asset_data.get("roe"),
                            "pe_ratio": asset_data.get("pe_ratio"),
                            "dividend_yield": asset_data.get("dividend_yield"),
                            "ytd": asset_data.get("ytd"),
                            "volatility": asset_data.get("volatility"),
                            "buffett_score": asset_data.get("buffett_score"),
                        }
                        break
            
            results[profile] = asset_details
            logger.info(f"✅ {profile}: {len(asset_details)} justifications générées")
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing JSON pour {profile}: {e}")
            logger.error(f"   Réponse brute: {response_text[:500]}...")
            results[profile] = generate_fallback_rationales(assets_data, profile, market_context)
            
        except Exception as e:
            logger.error(f"❌ Erreur LLM pour {profile}: {e}")
            results[profile] = generate_fallback_rationales(assets_data, profile, market_context)
    
    return results


def generate_fallback_rationales(
    assets_data: List[Dict],
    profile: str,
    market_context: Dict
) -> List[Dict]:
    """Génère des justifications basiques si le LLM échoue."""
    
    macro_tilts = market_context.get("macro_tilts", {})
    favored_sectors = macro_tilts.get("favored_sectors", [])
    favored_regions = macro_tilts.get("favored_regions", [])
    
    results = []
    
    for asset in assets_data:
        sector = asset.get("sector", "").lower()
        country = asset.get("country", "")
        category = asset.get("category", "ETF")
        
        # Déterminer le rôle
        if "bond" in category.lower() or "oblig" in category.lower():
            role = "income"
            base_rationale = "Position obligataire pour générer des revenus réguliers et réduire la volatilité globale."
        elif "gold" in asset.get("name", "").lower() or "or" in asset.get("name", "").lower():
            role = "hedge"
            base_rationale = "Couverture contre l'inflation et les risques géopolitiques."
        elif asset.get("weight_pct", 0) >= 10:
            role = "core"
            base_rationale = "Position cœur de portefeuille contribuant significativement à la performance."
        else:
            role = "satellite"
            base_rationale = "Position satellite pour diversification et capture d'opportunités spécifiques."
        
        # Ajouter le lien avec le contexte si pertinent
        market_link = None
        for fav_sector in favored_sectors:
            if fav_sector.lower() in sector:
                market_link = f"Secteur {fav_sector} actuellement favorisé par les conditions de marché."
                break
        
        for fav_region in favored_regions:
            if fav_region.lower() in country.lower():
                market_link = f"Région {fav_region} identifiée comme favorable par l'analyse RADAR."
                break
        
        # Construire la justification
        rationale = base_rationale
        if asset.get("buffett_score") and asset["buffett_score"] > 60:
            rationale += f" Score qualité Buffett de {asset['buffett_score']}/100 indique une entreprise de qualité."
        if asset.get("ytd") and float(str(asset["ytd"]).replace("%", "")) > 10:
            rationale += f" Momentum positif avec +{asset['ytd']}% YTD."
        
        results.append({
            "name": asset["name"],
            "ticker": asset["ticker"],
            "weight_pct": asset["weight_pct"],
            "category": asset["category"],
            "sector": asset["sector"],
            "country": asset["country"],
            "rationale": rationale,
            "role": role,
            "risk_note": "Risques standards de marché et de liquidité.",
            "market_context_link": market_link,
            "metrics": {
                "roe": asset.get("roe"),
                "ytd": asset.get("ytd"),
                "volatility": asset.get("volatility"),
                "buffett_score": asset.get("buffett_score"),
            }
        })
    
    return results


def merge_rationales_into_portfolio(
    portfolio_v1: Dict,
    rationales: Dict[str, List[Dict]]
) -> Dict:
    """Fusionne les justifications dans le JSON portfolio final."""
    
    for profile in ["Agressif", "Modéré", "Stable"]:
        if profile not in portfolio_v1:
            continue
        
        if profile in rationales and rationales[profile]:
            portfolio_v1[profile]["_asset_details"] = rationales[profile]
            logger.info(f"✅ {profile}: {len(rationales[profile])} détails d'actifs ajoutés")
        else:
            portfolio_v1[profile]["_asset_details"] = []
    
    return portfolio_v1
