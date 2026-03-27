# portfolio_engine/market_intelligence.py
"""
=========================================
Market Intelligence v1.0.0
=========================================

Module stratégique: Claude Opus comme CIO (Chief Investment Officer).
Analyse le contexte macro et génère des ajustements d'allocation dynamiques.

Architecture:
  market_context.json → Claude Opus (analyse cross-asset) → allocation_adjustments
  Fallback: si API indisponible → règles hardcodées existantes

Flow:
  1. Lit market_context.json (Brent, VIX, CPI, Fed, spreads, gold, etc.)
  2. Construit un prompt CIO calibré avec:
     - Données macro actuelles
     - Levers d'ajustement disponibles
     - Portefeuilles actuels (résumé)
     - Exemples de raisonnement (few-shot)
  3. Appelle Claude Opus (temperature=0 pour déterminisme)
  4. Parse la réponse JSON structurée
  5. Retourne des ajustements compatibles avec apply_market_adjustments()

Coût: ~$0.02-0.05 par appel (Opus, ~2000 tokens in, ~1000 out)
Latence: ~5-10 secondes
Fallback: règles hardcodées si API fail
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, Optional, Any

logger = logging.getLogger("portfolio_engine.market_intelligence")

VERSION = "1.0.0"

# =============================================================================
# CONFIGURATION
# =============================================================================

# Backend: API directe avec clé. Frontend (browser): utilise le proxy workers.dev
# Le pipeline GitHub Actions a ANTHROPIC_API_KEY dans ses secrets
API_URL = os.environ.get("ANTHROPIC_API_URL", "https://api.anthropic.com/v1/messages")
PROXY_URL = "https://studyforge-proxy.benoit-comas.workers.dev/v1/messages"
MODEL = "claude-opus-4-20250514"
MAX_TOKENS = 2000
TEMPERATURE = 0  # Déterminisme maximum

# Répertoire pour l'audit trail
AUDIT_DIR = "data/market_intelligence_audit"

# =============================================================================
# SYSTEM PROMPT — CIO HEDGE FUND
# =============================================================================

SYSTEM_PROMPT = """Tu es le Chief Investment Officer (CIO) d'un hedge fund multi-stratégie.
Tu analyses le contexte macroéconomique et géopolitique pour ajuster dynamiquement l'allocation de 3 portefeuilles modèles (Agressif, Modéré, Stable).

TON RÔLE:
- Penser en SECOND ORDRE: pas juste "pétrole monte" mais "pétrole monte → inflation → Fed hawkish → duration risk → raccourcir les bonds"
- Identifier le RÉGIME DE MARCHÉ: goldilocks, risk_on, neutral, stagflation, risk_off, recession, crisis
  → goldilocks: croissance + inflation maîtrisée + Fed dovish → tech/growth, duration longue OK
  → risk_on: momentum haussier, VIX bas, spreads serrés → max equity, small caps OK
  → neutral: pas de signal clair → diversification max, pas de paris directionnels
  → stagflation: inflation + croissance faible → commodities, TIPS, duration courte, avoid tech
  → risk_off: correction en cours, VIX montant → défensives, cash montant, reduce beta
  → recession: croissance effondre, déflation → duration LONGUE (taux baissent), utilities, avoid cycliques
  → crisis: panique systémique, VIX>40, spreads explosent → treasury only, gold max, cash 15%+
- Être CONTRARIAN quand le consensus est trop fort (ex: tout le monde short → squeeze possible)
- Quantifier ton NIVEAU DE CONVICTION (1-5) pour chaque ajustement

RÈGLES STRICTES:
- Réponds UNIQUEMENT en JSON valide, pas de texte avant ou après
- Chaque ajustement doit avoir une justification en 1 phrase
- Ne recommande PAS d'ajustements si le marché est neutre — "no action" est une position valide
- Les delta sont en POINTS DE POURCENTAGE (ex: +3 = augmenter de 3pp)
- Maximum 8 ajustements par appel (focus sur l'essentiel)

FORMAT DE RÉPONSE (JSON strict):
{
  "regime": "stagflation|risk_on|risk_off|goldilocks|crisis|recession|neutral",
  "regime_confidence": 1-5,
  "regime_rationale": "Explication du régime en 2 phrases max",
  "adjustments": [
    {
      "type": "thematic_cap_delta|mandatory_hedge_delta|bond_preference|bond_floor_delta|cash_tactical",
      "action": "description courte",
      "params": {}, 
      "profiles": ["Agressif", "Modéré", "Stable"],
      "conviction": 1-5,
      "rationale": "Justification 1 phrase"
    }
  ],
  "bond_strategy": {
    "regime_summary": "Description de la stratégie obligataire en 1 phrase",
    "prefer_tips": true/false,
    "prefer_treasury": true/false,
    "avoid_hy": true/false,
    "avoid_securitized": true/false,
    "avoid_em_bonds": true/false,
    "max_duration_stable": 3.0-10.0,
    "max_duration_moderate": 5.0-15.0
  },
  "cash_allocation": {
    "_doc": "Cash tactique: poche à garder non investie pour opportunités futures ou protection",
    "Agressif": 2-10,
    "Modéré": 3-15,
    "Stable": 0-20,
    "rationale": "Justification de la poche cash en 1 phrase"
  },
  "_cash_guidance": "MINIMUM CASH: Agressif 2% si VIX>20 (option d'achat sur la vol), Modéré 3%, Stable 0% (T-bills = cash productif). Le cash est une POSITION, pas une absence de position.",
  "crypto_allocation": {
    "_doc": "Cap crypto max par profil selon le régime. Crypto = risk asset, réduire en stress.",
    "Agressif": 0-7,
    "Modéré": 0-3,
    "Stable": 0,
    "rationale": "Justification du cap crypto en 1 phrase"
  },
  "warnings": ["Risque spécifique à surveiller"],
  "market_interpretation": {
    "_doc": "Champs interprétatifs dérivés des données brutes. L'AI déduit ce que les API ne fournissent pas.",
    "geopolitical_risk": "Description en 1 phrase du contexte géopolitique (déduit du Brent, energy_shock, VIX)",
    "fed_stance": "hawkish_hold|dovish_hold|tightening|easing — déduit de fed_rate + CPI + yield curve",
    "prob_hike_next_fomc_pct": 0-100,
    "sentiment_estimate": "extreme_fear|fear|neutral|greed|extreme_greed — déduit de VIX + spreads + equity perf",
    "dollar_assessment": "strong|neutral|weak — interprétation du Trade-Weighted USD avec bons seuils"
  }
}

TYPES D'AJUSTEMENTS DISPONIBLES:

1. thematic_cap_delta: Ajuster le cap thématique equity
   params: {"theme": "energy_oil|semi|ai_infra|precious_metals|dividend_value|healthcare", "delta_pct": -5 à +5}
   
2. mandatory_hedge_delta: Ajuster un hedge obligatoire  
   params: {"hedge": "gold|healthcare_etf|btc|ig_credit", "delta_pct": -3 à +3}

3. bond_preference: Stratégie obligataire dynamique
   params: {"action": "prefer_tips|prefer_treasury|shorten_duration|avoid_fund_types|extend_duration_ok",
            "max_dur": 3.0-15.0, "fund_types": ["High Yield Bond", "Securitized Bond"]}

4. bond_floor_delta: Ajuster le floor obligataire
   params: {"delta_pct": -5 à +5}

5. cash_tactical: Poche cash non investie (0-20%)
   Utiliser quand: VIX élevé (attente de dip), incertitude macro forte, transition de régime
   NE PAS utiliser quand: régime clair avec conviction forte, inflation élevée (cash = perte réelle)
   ATTENTION: les T-bills ultra-courts (GBIL, SGOV, BIL, CLTL) avec duration <0.5y et yield ~4%
   sont du CASH PRODUCTIF. Distingue le vrai cash (0% yield) du cash proxy (T-bills ~4%).
   Recommande cash_tactical SEULEMENT si tu veux de la flexibilité pour acheter la dip,
   pas juste pour "réduire le risque" (les T-bills font ça déjà)."""


# =============================================================================
# USER PROMPT BUILDER
# =============================================================================

def _build_user_prompt(market_data: Dict, portfolio_summary: Dict = None) -> str:
    """
    Construit le prompt utilisateur avec les données macro actuelles.
    """
    
    # Format market data
    md = market_data or {}
    
    prompt = f"""DONNÉES MARCHÉ AU {md.get('date', datetime.now().strftime('%Y-%m-%d'))}:

PÉTROLE & ÉNERGIE:
- Brent: ${md.get('brent_usd', md.get('brent_usd_avg5d', 'N/A'))}/baril (avg 5j: ${md.get('brent_usd_avg5d', 'N/A')})
- XLE (Energy sector) daily change: {md.get('xle_perf_1d_pct', 'N/A')}%

VOLATILITÉ & RISQUE:
- VIX: {md.get('vix', 'N/A')} (seuil stress: >30, panique: >40)
- VIX trend: {md.get('vix_trend', 'N/A')}

INFLATION & TAUX:
- CPI YoY: {md.get('cpi_yoy_pct', 'N/A')}%
- CPI Core MoM: {md.get('cpi_core_mom_pct', 'N/A')}%
- PCE YoY (Fed preferred): {md.get('pce_yoy_pct', 'N/A')}%
- Fed Funds Rate: {md.get('fed_funds_rate', 'N/A')}%
- Fed delta 6m (cuts(-)/hikes(+)): {md.get('fed_funds_rate_delta_6m', 'N/A')}
- US 10Y yield: {md.get('us_10y_yield', 'N/A')}%
- US 2Y yield: {md.get('us_2y_yield', 'N/A')}%
- Courbe 2s10s: {md.get('yield_curve_2s10s', 'N/A')}bps
- Breakeven inflation 5Y: {md.get('breakeven_5y', 'N/A')}%

CRÉDIT & SPREADS:
- IG spread OAS: {md.get('ig_spread_bps', 'N/A')}bps
- HY spread OAS: {md.get('hy_spread_bps', 'N/A')}bps
- HY spread trend: {md.get('hy_spread_trend', 'N/A')}

OR & MÉTAUX:
- Gold XAU/USD: ${md.get('gold_usd', 'N/A')}
- Gold drawdown from ATH: {md.get('gold_drawdown_from_ath_pct', 'N/A')}%
- Silver: ${md.get('silver_usd', 'N/A')}

EQUITY:
- S&P 500: {md.get('sp500_level', 'N/A')}
- Nasdaq (QQQ) daily change: {md.get('nasdaq_change_1d_pct', 'N/A')}%
- XLU (Utilities) daily change: {md.get('xlu_perf_1d_pct', 'N/A')}%

DOLLAR & FX:
- Trade-Weighted USD Index (FRED DTWEXBGS, scale ~110-130, NOT ICE DXY ~99): {md.get('trade_weighted_usd', 'N/A')}
- EUR/USD: {md.get('eurusd', 'N/A')}
- NOTE: DTWEXBGS à 120 ≈ DXY ICE à ~100. NE PAS interpréter comme "dollar extrêmement fort". Seuils: DTWEXBGS >125 = dollar fort, >130 = très fort, <115 = dollar faible.
"""

    # Add RADAR sector momentum context if available
    if md.get('radar_regime') or md.get('sector_momentum_summary'):
        prompt += f"""
RADAR SECTOR MOMENTUM (analyse quantitative des secteurs):
- Régime RADAR: {md.get('radar_regime', 'N/A')} (confidence: {md.get('radar_confidence', 'N/A')})
- Secteurs favorisés: {md.get('favored_sectors', 'N/A')}
- Secteurs évités: {md.get('avoided_sectors', 'N/A')}
- Régions favorisées: {md.get('favored_regions', 'N/A')}
- Régions évitées: {md.get('avoided_regions', 'N/A')}
- Tendances clés: {md.get('key_trends', 'N/A')}
- Risques identifiés: {md.get('risks', 'N/A')}
- Détail secteurs (classification, beta, daily%): {md.get('sector_momentum_summary', 'N/A')}

IMPORTANT: Le RADAR est PUREMENT quantitatif (momentum/beta). Il ne voit PAS les fondamentaux macro
(inflation, taux, géopolitique). TON RÔLE est de COMBINER le signal RADAR avec les données macro 
pour identifier le VRAI régime. Exemple: RADAR dit "neutral" mais Brent>$100 + CPI montant = STAGFLATION.
"""

    # Add portfolio summary if available
    if portfolio_summary:
        prompt += f"""
PORTEFEUILLES ACTUELS (résumé):
- Agressif: {portfolio_summary.get('Agressif', {}).get('bonds_pct', '?')}% bonds, {portfolio_summary.get('Agressif', {}).get('equity_pct', '?')}% equity, vol {portfolio_summary.get('Agressif', {}).get('vol', '?')}%
- Modéré: {portfolio_summary.get('Modéré', {}).get('bonds_pct', '?')}% bonds, {portfolio_summary.get('Modéré', {}).get('equity_pct', '?')}% equity, vol {portfolio_summary.get('Modéré', {}).get('vol', '?')}%
- Stable: {portfolio_summary.get('Stable', {}).get('bonds_pct', '?')}% bonds, {portfolio_summary.get('Stable', {}).get('equity_pct', '?')}% equity, vol {portfolio_summary.get('Stable', {}).get('vol', '?')}%

Bonds Stable actuels: {portfolio_summary.get('Stable', {}).get('bond_tickers', '?')}
Bonds Modéré actuels: {portfolio_summary.get('Modéré', {}).get('bond_tickers', '?')}
Bonds Agressif actuels: {portfolio_summary.get('Agressif', {}).get('bond_tickers', '?')}
"""

    prompt += """
ANALYSE DEMANDÉE:
1. Identifie le régime de marché actuel
2. Détermine les ajustements optimaux pour chaque profil
3. Définis la stratégie obligataire (TIPS vs nominal, duration, crédit)
4. Liste les risques de queue à surveiller

Réponds UNIQUEMENT en JSON valide."""

    return prompt


# =============================================================================
# FEW-SHOT EXAMPLES (pour calibrer le raisonnement)
# =============================================================================

FEW_SHOT_EXAMPLE = """EXEMPLES DE RAISONNEMENT (6 régimes — couvrent tous les scénarios):

═══ EXEMPLE 1: GOLDILOCKS (croissance + inflation maîtrisée) ═══
INPUT: Brent $65, CPI 2.0%, Fed -50bps en 6m, VIX 14, IG 85bps, HY 250bps, gold DD 5%, 10Y 3.2%
RAISONNEMENT: Pétrole bas + inflation target + Fed dovish = goldilocks.
→ Risk-on: tech/growth surpondéré, duration longue OK, IG credit acceptable
→ Gold réduit (pas de stress), cash 0-2%, semi/AI caps relevés, crypto permissif
→ Bonds: duration 7-10y acceptable, IG corporate OK, HY acceptable en Agressif
OUTPUT: regime=goldilocks, confidence=4, energy -3%, ai_infra +5%, gold -2%, cash 0%, crypto Agressif 7%

═══ EXEMPLE 2: CRISIS / LIQUIDITY CRUNCH (panique systémique) ═══
INPUT: Brent $120, CPI 5.2%, Fed +75bps en 6m, VIX 42, IG 280bps, HY 650bps, gold DD 2%, 10Y 5.5%
RAISONNEMENT: VIX >40 + HY spreads >600bps = crise de liquidité. Flight to quality radical.
→ Treasury ONLY (avoid TOUT crédit y compris IG), gold max, cash 15-20%, equity minimal
→ Avoid: HY, CLO, EM, corporate, small caps, crypto
→ Bonds: treasury ultra-court uniquement (duration <2y), TIPS si inflation élevée
OUTPUT: regime=crisis, confidence=5, gold +5%, cash 15% tous, bonds=treasury only, duration max 2y, crypto 0%

═══ EXEMPLE 3: STAGFLATION (inflation + croissance faible) ═══
INPUT: Brent $100, CPI 3.5%, Fed hold, VIX 28, IG 150bps, HY 380bps, gold DD 8%, 10Y 4.5%
RAISONNEMENT: Pétrole élevé + inflation persistante + croissance ralentit = stagflation.
→ Energy/commodities surpondéré, TIPS obligatoire, duration courte (<4y), gold renforcé
→ Reduce: tech/growth (beta GDP élevé), EM (dollar fort), small caps
→ Bonds: treasury court + TIPS, avoid HY (corrélé equity en crise), avoid EM bonds
OUTPUT: regime=stagflation, confidence=4, energy +5%, tech -3%, gold +3%, TIPS preferred, duration 4y max, cash 5-8%

═══ EXEMPLE 4: RISK_ON (momentum haussier fort) ═══
INPUT: Brent $75, CPI 2.3%, Fed -25bps, VIX 13, IG 80bps, HY 230bps, gold DD 12%, SP500 YTD +15%
RAISONNEMENT: VIX très bas + spreads serrés + momentum equity fort = risk-on pur.
→ Max equity, tech/growth/semi surpondéré, small caps OK, EM attractif (dollar faible)
→ Gold réduit (coût d'opportunité), cash minimal, duration flexible
→ Bonds: mix IG + HY acceptable, duration 5-7y OK
OUTPUT: regime=risk_on, confidence=4, tech +5%, gold -3%, cash 0%, crypto Agressif 7%, EM +3%

═══ EXEMPLE 5: RISK_OFF / RECESSION (croissance en berne, pas d'inflation) ═══
INPUT: Brent $50, CPI 1.2%, Fed -100bps en 6m, VIX 32, IG 200bps, HY 500bps, gold DD 5%, 10Y 2.5%
RAISONNEMENT: Pétrole effondré + déflation + Fed en panique = récession.
→ Défensives (utilities, staples, healthcare), dividendes, duration LONGUE (taux baissent)
→ Gold comme hedge queue, cash modéré, avoid cycliques/energy/materials
→ Bonds: duration LONGUE OK (10-20y), treasury + IG, HY à éviter (defaults montent)
OUTPUT: regime=recession, confidence=4, utilities +5%, energy -5%, duration longue OK, gold +2%, cash 5-10%

═══ EXEMPLE 6: NEUTRAL (pas de signal clair) ═══
INPUT: Brent $80, CPI 2.5%, Fed hold, VIX 18, IG 120bps, HY 320bps, gold DD 8%, 10Y 4.0%
RAISONNEMENT: Aucun extrême. Marché en range. Pas de conviction forte.
→ Allocation proche des benchmarks, diversification maximale, pas de paris directionnels
→ Cash modéré (option d'achat), duration intermédiaire (3-5y)
→ Bonds: mix balanced, pas de surpondération sectorielle
OUTPUT: regime=neutral, confidence=3, pas de delta >±2%, cash 3-5%, duration 3-5y

IMPORTANT: Ces exemples illustrent le RAISONNEMENT, pas les données actuelles.
Analyse les VRAIES données fournies ci-dessous sans te référer aux exemples.
Le régime dépend des données, pas du template.
CHAQUE régime implique une stratégie obligataire DIFFÉRENTE (duration, crédit, TIPS)."""


# =============================================================================
# API CALL
# =============================================================================

def _call_claude_api(system: str, user: str, api_key: str = None) -> Optional[Dict]:
    """
    Appelle Claude Opus.
    Priorité: API directe avec clé (GitHub Actions) → proxy Cloudflare (fallback sans clé).
    """
    import urllib.request
    import urllib.error
    
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    
    payload = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "system": system,
        "messages": [
            {"role": "user", "content": user}
        ]
    }
    
    # Stratégie: si on a une clé → API directe. Sinon → proxy (le proxy injecte la clé).
    if key:
        url = API_URL
        headers = {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        }
    else:
        url = PROXY_URL
        headers = {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        logger.info("[MI] No API key found — using proxy")
    
    try:
        logger.info(f"[MI] Calling {url} (model={MODEL})")
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        # Extract text content
        text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                text += block["text"]
        
        if not text:
            logger.error("[MI] Empty response from Claude API")
            return None
        
        # Parse JSON — handle potential markdown fences
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        result = json.loads(text)
        
        # Log usage
        usage = data.get("usage", {})
        logger.info(
            f"[MI] Claude API OK — "
            f"input: {usage.get('input_tokens', '?')} tokens, "
            f"output: {usage.get('output_tokens', '?')} tokens, "
            f"regime: {result.get('regime', '?')}"
        )
        
        return result
        
    except urllib.error.URLError as e:
        logger.warning(f"[MI] API error: {e}")
        # Fallback: try proxy if we used direct API
        if key and url != PROXY_URL:
            logger.info(f"[MI] Retrying via proxy: {PROXY_URL}")
            try:
                req2 = urllib.request.Request(
                    PROXY_URL,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "anthropic-version": "2023-06-01"},
                    method="POST"
                )
                with urllib.request.urlopen(req2, timeout=60) as resp2:
                    data = json.loads(resp2.read().decode("utf-8"))
                text = ""
                for block in data.get("content", []):
                    if block.get("type") == "text":
                        text += block["text"]
                if text:
                    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                    result = json.loads(text)
                    logger.info(f"[MI] Proxy fallback OK — regime: {result.get('regime', '?')}")
                    return result
            except Exception as e2:
                logger.error(f"[MI] Proxy fallback also failed: {e2}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"[MI] JSON parse error: {e}\nRaw: {text[:500]}")
        return None
    except Exception as e:
        logger.error(f"[MI] Unexpected error: {e}")
        return None


# =============================================================================
# CONVERT AI RESPONSE TO ENGINE ADJUSTMENTS
# =============================================================================

def _ai_to_engine_adjustments(ai_response: Dict) -> Dict:
    """
    Convertit la réponse Claude en format compatible avec evaluate_market_rules().
    Même structure de sortie que les règles hardcodées.
    """
    adjustments = {
        "thematic_cap_deltas": {},
        "hedge_deltas": {},
        "bond_preferences": [],
        "active_rules": [f"ai_{ai_response.get('regime', 'unknown')}"],
    }
    
    for adj in ai_response.get("adjustments", []):
        adj_type = adj.get("type", "")
        profiles = adj.get("profiles", [])
        params = adj.get("params", {})
        conviction = adj.get("conviction", 3)
        
        # Skip low conviction adjustments
        if conviction < 2:
            logger.debug(f"[MI] Skipping low conviction adjustment: {adj.get('action')}")
            continue
        
        if adj_type == "thematic_cap_delta":
            theme = params.get("theme")
            delta = params.get("delta_pct", 0)
            if theme and delta:
                for p in profiles:
                    adjustments["thematic_cap_deltas"].setdefault(theme, {})
                    adjustments["thematic_cap_deltas"][theme][p] = \
                        adjustments["thematic_cap_deltas"][theme].get(p, 0) + delta
        
        elif adj_type == "mandatory_hedge_delta":
            hedge = params.get("hedge")
            delta = params.get("delta_pct", 0)
            if hedge and delta:
                for p in profiles:
                    adjustments["hedge_deltas"].setdefault(hedge, {})
                    adjustments["hedge_deltas"][hedge][p] = \
                        adjustments["hedge_deltas"][hedge].get(p, 0) + delta
        
        elif adj_type == "bond_preference":
            adjustments["bond_preferences"].append({
                "action": params.get("action"),
                "profiles": profiles,
                "max_dur": params.get("max_dur"),
                "fund_types": params.get("fund_types", []),
                "rule_id": f"ai_{ai_response.get('regime', '?')}",
            })
        
        elif adj_type == "bond_floor_delta":
            delta = params.get("delta_pct", 0)
            # Store for later application
            adjustments.setdefault("bond_floor_deltas", {})
            for p in profiles:
                adjustments["bond_floor_deltas"][p] = \
                    adjustments["bond_floor_deltas"].get(p, 0) + delta
    
    # Also extract bond_strategy into bond_preferences if not already covered
    bs = ai_response.get("bond_strategy", {})
    if bs:
        # These are global preferences, not per-adjustment
        _bs_profiles_stable = ["Stable"]
        _bs_profiles_mod = ["Modéré", "Stable"]
        _bs_profiles_all = ["Agressif", "Modéré", "Stable"]
        
        if bs.get("avoid_securitized"):
            _already = any(bp.get("action") == "avoid_fund_types" for bp in adjustments["bond_preferences"])
            if not _already:
                adjustments["bond_preferences"].append({
                    "action": "avoid_fund_types",
                    "profiles": _bs_profiles_mod,
                    "fund_types": ["Securitized Bond", "Bank Loan"],
                    "rule_id": "ai_bond_strategy",
                })
        
        if bs.get("avoid_hy"):
            _already = any(bp.get("action") == "avoid_fund_types" and "High Yield" in str(bp.get("fund_types", [])) 
                          for bp in adjustments["bond_preferences"])
            if not _already:
                adjustments["bond_preferences"].append({
                    "action": "avoid_fund_types",
                    "profiles": _bs_profiles_mod,
                    "fund_types": ["High Yield Bond"],
                    "rule_id": "ai_bond_strategy",
                })
        
        if bs.get("avoid_em_bonds"):
            adjustments["bond_preferences"].append({
                "action": "avoid_fund_types",
                "profiles": _bs_profiles_all,  # v2.1 fix: global, pas que Modéré/Stable
                "fund_types": ["Emerging Markets Bond"],
                "rule_id": "ai_bond_strategy",
            })
        
        if bs.get("prefer_tips"):
            _already = any(bp.get("action") == "prefer_tips" for bp in adjustments["bond_preferences"])
            if not _already:
                adjustments["bond_preferences"].append({
                    "action": "prefer_tips",
                    "profiles": _bs_profiles_mod,
                    "rule_id": "ai_bond_strategy",
                })
        
        if bs.get("prefer_treasury"):
            _already = any(bp.get("action") == "prefer_treasury" for bp in adjustments["bond_preferences"])
            if not _already:
                adjustments["bond_preferences"].append({
                    "action": "prefer_treasury",
                    "profiles": _bs_profiles_stable,
                    "rule_id": "ai_bond_strategy",
                })
        
        # Duration limits from bond_strategy
        max_dur_stable = bs.get("max_duration_stable")
        if max_dur_stable and max_dur_stable < 10:
            adjustments["bond_preferences"].append({
                "action": "shorten_duration",
                "profiles": _bs_profiles_stable,
                "max_dur": max_dur_stable,
                "rule_id": "ai_bond_strategy",
            })
        
        max_dur_mod = bs.get("max_duration_moderate")
        if max_dur_mod and max_dur_mod < 10:
            adjustments["bond_preferences"].append({
                "action": "shorten_duration",
                "profiles": ["Modéré"],
                "max_dur": max_dur_mod,
                "rule_id": "ai_bond_strategy",
            })
    
    # Extract cash_allocation
    ca = ai_response.get("cash_allocation", {})
    if ca:
        cash_pcts = {}
        for profile in ["Agressif", "Modéré", "Stable"]:
            val = ca.get(profile, 0)
            if isinstance(val, (int, float)) and val > 0:
                # Cap at 20% max
                cash_pcts[profile] = min(val, 20.0)
        if cash_pcts:
            adjustments["cash_tactical"] = cash_pcts
            adjustments["cash_tactical_rationale"] = ca.get("rationale", "")
    
    # Extract crypto_allocation — MI recommended caps per profile
    cry = ai_response.get("crypto_allocation", {})
    if cry:
        crypto_caps = {}
        for profile in ["Agressif", "Modéré", "Stable"]:
            val = cry.get(profile, None)
            if isinstance(val, (int, float)):
                crypto_caps[profile] = val
        if crypto_caps:
            adjustments["crypto_allocation"] = crypto_caps
    
    return adjustments


# =============================================================================
# AUDIT TRAIL
# =============================================================================

def _save_audit(market_data: Dict, ai_response: Dict, adjustments: Dict):
    """Sauvegarde l'audit trail pour traçabilité."""
    try:
        os.makedirs(AUDIT_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        regime = ai_response.get("regime", "unknown") if ai_response else "fallback"
        
        audit = {
            "timestamp": datetime.now().isoformat(),
            "version": VERSION,
            "model": MODEL,
            "market_data_input": market_data,
            "ai_response": ai_response,
            "adjustments_output": adjustments,
            "regime": regime,
            "warnings": ai_response.get("warnings", []) if ai_response else [],
        }
        
        path = os.path.join(AUDIT_DIR, f"mi_{ts}_{regime}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(audit, f, ensure_ascii=False, indent=2, default=str)
        
        logger.info(f"[MI] Audit saved: {path}")
    except Exception as e:
        logger.warning(f"[MI] Audit save failed: {e}")


# =============================================================================
# LOAD MARKET CONTEXT
# =============================================================================

def load_market_context(path: str = None) -> Dict:
    """
    Charge le market_context.json et retourne les données flat pour le prompt.
    Cherche dans _market_data_flat (généré par update_macro_context.py),
    puis dans les champs de premier niveau.
    """
    candidates = [
        path,
        os.path.join("data", "market_context.json"),
        os.path.join(os.path.dirname(__file__), "data", "market_context.json"),
        os.path.join(os.path.dirname(__file__), "..", "data", "market_context.json"),
        "market_context.json",
    ]
    
    for p in candidates:
        if p and os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"[MI] Market context loaded from {p}")
            
            # Priorité: _market_data_flat (généré par update_macro_context.py)
            flat = data.get("_market_data_flat", {})
            if flat:
                n_fields = sum(1 for v in flat.values() if v and str(v) not in ("N/A", "None"))
                logger.info(f"[MI] Using flat market data: {n_fields} fields")
                return flat
            
            # Fallback: extraire depuis macro_environment (ancienne structure)
            macro = data.get("macro_environment", {})
            if macro:
                flat = {}
                flat["date"] = datetime.now().strftime("%Y-%m-%d")
                if "brent" in macro:
                    flat["brent_usd"] = macro["brent"].get("price")
                    flat["brent_usd_avg5d"] = macro["brent"].get("avg_5d", macro["brent"].get("price"))
                if "gold" in macro:
                    flat["gold_usd"] = macro["gold"].get("price")
                if "vix" in macro:
                    flat["vix"] = macro["vix"].get("value")
                if "fed_rate" in macro:
                    flat["fed_funds_rate"] = macro["fed_rate"].get("value")
                if "ig_spread" in macro:
                    flat["ig_spread_bps"] = macro["ig_spread"].get("value_bps")
                if "hy_spread" in macro:
                    flat["hy_spread_bps"] = macro["hy_spread"].get("value_bps")
                if "us_10y_yield" in macro:
                    flat["us_10y_yield"] = macro["us_10y_yield"].get("value")
                if "us_2y_yield" in macro:
                    flat["us_2y_yield"] = macro["us_2y_yield"].get("value")
                if "breakeven_5y" in macro:
                    flat["breakeven_5y"] = macro["breakeven_5y"].get("value")
                if "sp500" in macro:
                    flat["sp500_level"] = macro["sp500"].get("level")
                if "trade_weighted_usd" in macro:
                    flat["trade_weighted_usd"] = macro["trade_weighted_usd"].get("value")
                elif "dxy" in macro:
                    flat["trade_weighted_usd"] = macro["dxy"].get("value")
                if "silver" in macro:
                    flat["silver_usd"] = macro["silver"].get("price")
                logger.info(f"[MI] Extracted {len(flat)} fields from macro_environment")
                return flat
            
            # Dernier fallback: retourner le dict tel quel
            return data
    
    logger.warning("[MI] market_context.json not found")
    return {}


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def get_ai_market_adjustments(
    market_data: Dict = None,
    portfolio_summary: Dict = None,
    api_key: str = None,
    fallback_rules: Dict = None,
) -> Dict:
    """
    Point d'entrée principal. Analyse le marché via Claude Opus
    et retourne des ajustements compatibles avec le moteur d'allocation.
    
    Args:
        market_data: Dict avec les indicateurs macro (ou None pour charger market_context.json)
        portfolio_summary: Résumé des portefeuilles actuels (optionnel)
        api_key: Clé API Anthropic (ou env var ANTHROPIC_API_KEY)
        fallback_rules: Rules dict pour fallback hardcodé si API fail
    
    Returns:
        Dict compatible avec apply_market_adjustments():
        {
            "thematic_cap_deltas": {...},
            "hedge_deltas": {...},
            "bond_preferences": [...],
            "active_rules": [...],
            "ai_regime": "stagflation",
            "ai_warnings": [...],
        }
    """
    # Load market data if not provided
    if market_data is None:
        market_data = load_market_context()
    
    if not market_data:
        logger.warning("[MI] No market data available — returning empty adjustments")
        return {"thematic_cap_deltas": {}, "hedge_deltas": {}, "bond_preferences": [], "active_rules": []}
    
    logger.info(f"[MI] Starting AI market analysis (model: {MODEL})")
    
    # Build prompts
    system = SYSTEM_PROMPT + "\n\n" + FEW_SHOT_EXAMPLE
    user = _build_user_prompt(market_data, portfolio_summary)
    
    # Call Claude Opus
    ai_response = _call_claude_api(system, user, api_key)
    
    if ai_response:
        # Convert AI response to engine adjustments
        adjustments = _ai_to_engine_adjustments(ai_response)
        
        # Add metadata
        adjustments["ai_regime"] = ai_response.get("regime", "unknown")
        adjustments["ai_regime_confidence"] = ai_response.get("regime_confidence", 0)
        adjustments["ai_warnings"] = ai_response.get("warnings", [])
        adjustments["ai_bond_strategy"] = ai_response.get("bond_strategy", {})
        
        # Log summary
        n_adj = len(ai_response.get("adjustments", []))
        regime = ai_response.get("regime", "?")
        conf = ai_response.get("regime_confidence", "?")
        logger.info(f"[MI] ✅ AI analysis complete: regime={regime} (confidence={conf}/5), {n_adj} adjustments")
        
        for w in ai_response.get("warnings", []):
            logger.warning(f"[MI] ⚠️ AI warning: {w}")
        
        # Save audit trail
        _save_audit(market_data, ai_response, adjustments)
        
        return adjustments
    
    # === FALLBACK: basic regime detection + hardcoded rules ===
    logger.warning("[MI] ⚠️ AI analysis failed — falling back to rule-based regime detection")
    
    # v2.2: Basic regime detection from macro data (no AI needed)
    _fb_regime = _detect_regime_fallback(market_data)
    logger.info(f"[MI] Fallback regime detected: {_fb_regime}")
    
    if fallback_rules:
        from allocation_rules_engine import evaluate_market_rules
        adjustments = evaluate_market_rules(fallback_rules, market_data)
    else:
        adjustments = {"thematic_cap_deltas": {}, "hedge_deltas": {}, "bond_preferences": []}
    
    adjustments["ai_regime"] = _fb_regime
    adjustments["ai_regime_confidence"] = 2  # Low confidence for fallback
    adjustments["ai_warnings"] = [f"AI unavailable — fallback regime: {_fb_regime}"]
    adjustments["active_rules"] = [f"fallback_{_fb_regime}"]
    
    # Apply basic regime-dependent adjustments
    _ALL_PROFILES = ["Agressif", "Modéré", "Stable"]
    _DEF_PROFILES = ["Modéré", "Stable"]
    
    if _fb_regime == "crisis":
        adjustments["bond_preferences"] = [
            {"action": "prefer_treasury", "profiles": _ALL_PROFILES, "rule_id": "fallback_crisis"},
            {"action": "shorten_duration", "profiles": _ALL_PROFILES, "max_dur": 2.0, "rule_id": "fallback_crisis"},
            {"action": "avoid_fund_types", "profiles": _ALL_PROFILES, "fund_types": ["High Yield Bond", "Emerging Markets Bond", "Securitized Bond"], "rule_id": "fallback_crisis"},
        ]
        adjustments.setdefault("cash_tactical", {})["Agressif"] = 10
        adjustments.setdefault("cash_tactical", {})["Modéré"] = 12
        adjustments.setdefault("cash_tactical", {})["Stable"] = 15
        adjustments["cash_tactical_rationale"] = f"Fallback crisis: max cash protection (VIX likely >35)"
    elif _fb_regime == "stagflation":
        adjustments["bond_preferences"] = [
            {"action": "prefer_tips", "profiles": _DEF_PROFILES, "rule_id": "fallback_stagflation"},
            {"action": "shorten_duration", "profiles": ["Stable"], "max_dur": 4.0, "rule_id": "fallback_stagflation"},
        ]
        adjustments.setdefault("cash_tactical", {})["Agressif"] = 5
        adjustments.setdefault("cash_tactical", {})["Modéré"] = 7
        adjustments["cash_tactical_rationale"] = f"Fallback stagflation: moderate cash (oil shock + inflation)"
    elif _fb_regime == "recession":
        adjustments["bond_preferences"] = [
            {"action": "extend_duration_ok", "profiles": _ALL_PROFILES, "rule_id": "fallback_recession"},
            {"action": "prefer_treasury", "profiles": _DEF_PROFILES, "rule_id": "fallback_recession"},
        ]
        adjustments.setdefault("cash_tactical", {})["Agressif"] = 5
        adjustments["cash_tactical_rationale"] = f"Fallback recession: defensive cash"
    elif _fb_regime == "risk_off":
        adjustments["bond_preferences"] = [
            {"action": "prefer_treasury", "profiles": _DEF_PROFILES, "rule_id": "fallback_risk_off"},
            {"action": "shorten_duration", "profiles": ["Stable"], "max_dur": 5.0, "rule_id": "fallback_risk_off"},
        ]
        adjustments.setdefault("cash_tactical", {})["Agressif"] = 5
        adjustments.setdefault("cash_tactical", {})["Modéré"] = 7
        adjustments["cash_tactical_rationale"] = f"Fallback risk_off: elevated cash"
    elif _fb_regime in ("goldilocks", "risk_on"):
        adjustments["bond_preferences"] = []
        adjustments.setdefault("cash_tactical", {})["Agressif"] = 2
        adjustments["cash_tactical_rationale"] = f"Fallback {_fb_regime}: minimal cash"
    elif _fb_regime == "neutral":
        adjustments["bond_preferences"] = []
        adjustments.setdefault("cash_tactical", {})["Agressif"] = 3
        adjustments.setdefault("cash_tactical", {})["Modéré"] = 4
        adjustments["cash_tactical_rationale"] = f"Fallback neutral: moderate cash"
    
    _save_audit(market_data, None, adjustments)
    return adjustments


def _detect_regime_fallback(md: Dict) -> str:
    """
    v2.2: Rule-based regime detection when Claude Opus is unavailable.
    Uses simple thresholds on VIX, spreads, oil, CPI, Fed rate.
    
    Returns: regime string (crisis|stagflation|recession|risk_off|neutral|risk_on|goldilocks)
    """
    vix = md.get("vix", 18)
    hy_spread = md.get("hy_spread_bps", 300)
    ig_spread = md.get("ig_spread_bps", 100)
    brent = md.get("brent_usd", md.get("brent_usd_avg5d", 75))
    cpi = md.get("cpi_yoy_pct", 2.0)
    fed_delta = md.get("fed_funds_rate_delta_6m", 0)
    
    # Crisis: VIX > 35 AND (HY > 500 OR IG > 200)
    if vix > 35 and (hy_spread > 500 or ig_spread > 200):
        return "crisis"
    
    # Stagflation: oil > $90 AND CPI > 2.5% AND Fed not cutting aggressively
    if brent > 90 and cpi > 2.5 and fed_delta >= -0.5:
        return "stagflation"
    
    # Recession: CPI < 1.5% AND Fed cutting aggressively (> -75bps)
    if cpi < 1.5 and fed_delta < -0.75:
        return "recession"
    
    # Risk-off: VIX > 25 OR HY > 400
    if vix > 25 or hy_spread > 400:
        return "risk_off"
    
    # Goldilocks: VIX < 15 AND CPI < 2.5% AND Fed ACTIVELY cutting (delta < -0.25)
    if vix < 15 and cpi < 2.5 and fed_delta < -0.25:
        return "goldilocks"
    
    # Risk-on: VIX < 18 AND spreads tight (less strict than goldilocks)
    if vix < 18 and hy_spread < 300:
        return "risk_on"
    
    return "neutral"


# =============================================================================
# INTEGRATION HELPER — for generate_portfolios_v4.py
# =============================================================================

def integrate_ai_adjustments(rules: Dict, adjustments: Dict) -> Dict:
    """
    Applique les ajustements AI au rules dict (même interface que apply_market_adjustments).
    Peut être appelé APRÈS ou À LA PLACE de evaluate_market_rules.
    
    Usage dans generate_portfolios_v4.py:
        from market_intelligence import get_ai_market_adjustments, integrate_ai_adjustments
        
        ai_adjustments = get_ai_market_adjustments(market_data)
        rules = integrate_ai_adjustments(rules, ai_adjustments)
        # Puis apply_allocation_rules(portfolio, profile, rules, ...) comme avant
    """
    if not adjustments.get("active_rules"):
        return rules
    
    # Apply thematic cap deltas
    for theme, profile_deltas in adjustments.get("thematic_cap_deltas", {}).items():
        if theme in rules.get("thematic_caps_pct", {}):
            for profile, delta in profile_deltas.items():
                old = rules["thematic_caps_pct"][theme].get(profile, 0)
                rules["thematic_caps_pct"][theme][profile] = max(0, old + delta)
                logger.info(f"[MI] Cap {theme}/{profile}: {old}% → {old + delta}%")
    
    # Apply hedge deltas
    for hedge, profile_deltas in adjustments.get("hedge_deltas", {}).items():
        for profile, delta in profile_deltas.items():
            hedges = rules.get("mandatory_hedges", {}).get(profile, {})
            if hedge in hedges:
                old = hedges[hedge].get("min_pct", 0)
                hedges[hedge]["min_pct"] = max(0, old + delta)
                logger.info(f"[MI] Hedge {hedge}/{profile}: {old}% → {old + delta}%")
    
    # Apply bond floor deltas
    for profile, delta in adjustments.get("bond_floor_deltas", {}).items():
        old = rules.get("bond_floor", {}).get(profile, 0)
        rules.setdefault("bond_floor", {})[profile] = max(0, old + delta / 100.0)
        logger.info(f"[MI] Bond floor {profile}: {old*100}% → {(old + delta/100)*100}%")
    
    # Pass bond preferences
    if adjustments.get("bond_preferences"):
        rules["_active_bond_preferences"] = adjustments["bond_preferences"]
        logger.info(f"[MI] Bond preferences: {len(adjustments['bond_preferences'])} active")
    
    # Pass cash_tactical
    if adjustments.get("cash_tactical"):
        rules["_cash_tactical"] = adjustments["cash_tactical"]
        rules["_cash_tactical_rationale"] = adjustments.get("cash_tactical_rationale", "")
        for p, pct in adjustments["cash_tactical"].items():
            logger.info(f"[MI] 💰 Cash tactique {p}: {pct}%")
        logger.info(f"[MI] 💰 Rationale: {adjustments.get('cash_tactical_rationale', '?')}")
    
    # Pass crypto_allocation
    if adjustments.get("crypto_allocation"):
        rules["_crypto_allocation"] = adjustments["crypto_allocation"]
        for p, pct in adjustments["crypto_allocation"].items():
            logger.info(f"[MI] 🪙 Crypto cap {p}: {pct}%")
    
    # Log regime
    regime = adjustments.get("ai_regime", "unknown")
    logger.info(f"[MI] Applied AI adjustments: regime={regime}")
    
    return rules


# =============================================================================
# CLI TEST
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    
    # Test with current market conditions
    test_market = {
        "date": "2026-03-25",
        "brent_usd": 101.0,
        "brent_usd_avg5d": 101.0,
        "vix": 27.0,
        "vix_trend": "Rising",
        "cpi_yoy_pct": 2.4,
        "cpi_core_mom_pct": 0.3,
        "pce_yoy_pct": 2.5,
        "fed_funds_rate": 3.64,
        "fed_funds_rate_delta_6m": 0.0,
        "us_10y_yield": 4.34,
        "us_2y_yield": 3.83,
        "yield_curve_2s10s": 51,
        "breakeven_5y": 2.55,
        "ig_spread_bps": 111,
        "hy_spread_bps": 319,
        "hy_spread_trend": "Widening",
        "gold_usd": 4563,
        "gold_drawdown_from_ath_pct": 14.4,
        "silver_usd": 72.9,
        "sp500_level": 658,
        "nasdaq_change_1d_pct": -0.5,
        "xlu_perf_1d_pct": 1.1,
        "xle_perf_1d_pct": 2.0,
        "trade_weighted_usd": 120.28,
        "eurusd": 1.08,
    }
    
    print("\n" + "=" * 60)
    print(f"MARKET INTELLIGENCE TEST v{VERSION}")
    print("=" * 60)
    
    result = get_ai_market_adjustments(test_market)
    
    print(f"\nRegime: {result.get('ai_regime', '?')}")
    print(f"Active rules: {result.get('active_rules', [])}")
    print(f"Bond preferences: {len(result.get('bond_preferences', []))}")
    print(f"Warnings: {result.get('ai_warnings', [])}")
    
    print("\n✅ Test complete")
