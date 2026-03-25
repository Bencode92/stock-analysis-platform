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
- Identifier le RÉGIME DE MARCHÉ: risk-on, risk-off, stagflation, goldilocks, crise de liquidité
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
  "regime": "stagflation|risk_on|risk_off|goldilocks|crisis|neutral",
  "regime_confidence": 1-5,
  "regime_rationale": "Explication du régime en 2 phrases max",
  "adjustments": [
    {
      "type": "thematic_cap_delta|mandatory_hedge_delta|bond_preference|bond_floor_delta",
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
  "warnings": ["Risque spécifique à surveiller"]
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
   params: {"delta_pct": -5 à +5}"""


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

PÉTROLE & GÉOPOLITIQUE:
- Brent: ${md.get('brent_usd', md.get('brent_usd_avg5d', 'N/A'))}/baril (avg 5j: ${md.get('brent_usd_avg5d', 'N/A')})
- WTI: ${md.get('wti_usd', 'N/A')}/baril
- Contexte: {md.get('geopolitical_context', 'Non spécifié')}
- Strait of Hormuz: {md.get('hormuz_status', 'Non spécifié')}

VOLATILITÉ & RISQUE:
- VIX: {md.get('vix', 'N/A')} (seuil stress: >30, panique: >40)
- VIX trend 1m: {md.get('vix_trend_1m', 'N/A')}

INFLATION & TAUX:
- CPI YoY: {md.get('cpi_yoy_pct', 'N/A')}%
- CPI Core MoM: {md.get('cpi_core_mom_pct', 'N/A')}%
- PCE YoY: {md.get('pce_yoy_pct', 'N/A')}%
- Fed Funds Rate: {md.get('fed_funds_rate', 'N/A')}%
- Fed delta 6m (cuts(-)/hikes(+)): {md.get('fed_funds_rate_delta_6m', 'N/A')}
- Fed dot plot signal: {md.get('fed_dot_plot_signal', 'N/A')}
- US 10Y yield: {md.get('us_10y_yield', 'N/A')}%
- US 2Y yield: {md.get('us_2y_yield', 'N/A')}%
- Courbe 2s10s: {md.get('yield_curve_2s10s', 'N/A')}bps
- Breakeven inflation 5Y: {md.get('breakeven_5y', 'N/A')}%
- Probabilité hike prochain FOMC: {md.get('prob_hike_next_fomc', 'N/A')}%

CRÉDIT & SPREADS:
- IG spread OAS: {md.get('ig_spread_bps', 'N/A')}bps
- HY spread OAS: {md.get('hy_spread_bps', 'N/A')}bps
- HY spread trend: {md.get('hy_spread_trend', 'N/A')}

OR & MÉTAUX:
- Gold XAU/USD: ${md.get('gold_usd', 'N/A')}
- Gold drawdown from ATH: {md.get('gold_drawdown_from_ath_pct', 'N/A')}%
- Silver: ${md.get('silver_usd', 'N/A')}

EQUITY:
- S&P 500: {md.get('sp500_level', 'N/A')} (YTD: {md.get('sp500_ytd_pct', 'N/A')}%)
- Nasdaq: YTD {md.get('nasdaq_ytd_pct', 'N/A')}%
- XLU (Utilities): perf 1m {md.get('xlu_perf_1m_pct', 'N/A')}%
- XLE (Energy): perf 1m {md.get('xle_perf_1m_pct', 'N/A')}%

DOLLAR & FX:
- DXY Dollar Index: {md.get('dxy', 'N/A')}
- EUR/USD: {md.get('eurusd', 'N/A')}

SENTIMENT:
- AAII Bull/Bear: {md.get('aaii_bull_pct', 'N/A')}% bull / {md.get('aaii_bear_pct', 'N/A')}% bear
- Put/Call ratio: {md.get('put_call_ratio', 'N/A')}
- Fear & Greed Index: {md.get('fear_greed_index', 'N/A')}
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

FEW_SHOT_EXAMPLE = """Exemple de raisonnement attendu (mars 2026, crise Hormuz):

INPUT: Brent $101, CPI 2.8%, Fed hold 3.5-3.75%, VIX 27, IG spread 135bps, gold DD 16.5%
RAISONNEMENT SECOND ORDRE:
- Brent >$100 → coûts transport/énergie → CPI va monter vers 3.5%+ 
- CPI montant → Fed ne peut PAS couper → taux restent élevés ou montent
- Taux élevés + inflation → STAGFLATION (croissance ralentit, prix montent)
- Stagflation → duration risk → raccourcir les bonds, TIPS > nominal
- Stagflation → energy/gold surperforment, tech/growth sous-performent
- Consumer staples/utilities = pricing power → résistent à l'inflation
- HY bonds vulnérables → spreads vont s'écarter si récession
- CLO/securitized → risque de liquidité en stress, pas adapté au Stable
- Gold en correction mais narratif inflation intact → maintenir hedge
- Dollar fort (flight to quality) → EM bonds sous pression

OUTPUT:
{
  "regime": "stagflation",
  "regime_confidence": 4,
  "regime_rationale": "Oil shock Hormuz pousse CPI vers 3.5%+, Fed bloquée entre inflation et croissance. Profil stagflationniste avec energy/gold leadership.",
  "adjustments": [
    {
      "type": "thematic_cap_delta",
      "action": "energy_oil +5%",
      "params": {"theme": "energy_oil", "delta_pct": 5},
      "profiles": ["Agressif", "Modéré"],
      "conviction": 5,
      "rationale": "Brent >$100 avec Hormuz fermé, Goldman cible $110 mars/avril"
    },
    {
      "type": "mandatory_hedge_delta",
      "action": "gold +2%",
      "params": {"hedge": "gold", "delta_pct": 2},
      "profiles": ["Agressif", "Modéré"],
      "conviction": 4,
      "rationale": "Hedge inflation intact malgré correction 16.5%, DD technique pas fondamental"
    },
    {
      "type": "bond_preference",
      "action": "TIPS preferred",
      "params": {"action": "prefer_tips"},
      "profiles": ["Modéré", "Stable"],
      "conviction": 5,
      "rationale": "CPI 2.8% et montant, oil shock va diffuser dans core inflation, TIPS protègent le rendement réel"
    },
    {
      "type": "bond_preference",
      "action": "shorten duration Stable",
      "params": {"action": "shorten_duration", "max_dur": 5.0},
      "profiles": ["Stable"],
      "conviction": 4,
      "rationale": "Fed hold + 12% proba hike → risque de taux asymétrique à la hausse"
    },
    {
      "type": "bond_preference",
      "action": "avoid securitized/CLO Stable",
      "params": {"action": "avoid_fund_types", "fund_types": ["Securitized Bond", "Bank Loan"]},
      "profiles": ["Modéré", "Stable"],
      "conviction": 4,
      "rationale": "CLO AAA = produits structurés avec risque de liquidité en stress, incompatible capital preservation"
    }
  ],
  "bond_strategy": {
    "regime_summary": "Stagflation: TIPS + short duration + avoid credit risk. Pas de HY dans Stable/Modéré.",
    "prefer_tips": true,
    "prefer_treasury": false,
    "avoid_hy": true,
    "avoid_securitized": true,
    "avoid_em_bonds": true,
    "max_duration_stable": 5.0,
    "max_duration_moderate": 7.0
  },
  "warnings": [
    "Si Hormuz rouvre, Brent retombe à $75 → reverser energy cap en 48h",
    "Si CPI mars >3.5%, probabilité hike passe >50% → shorten duration à 3y max",
    "Gold DD >20% = signal de liquidation forcée, pas de renforcement"
  ]
}"""


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
                "profiles": _bs_profiles_mod,
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
    Charge le market_context.json.
    Cherche dans plusieurs emplacements.
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
    
    # === FALLBACK: use hardcoded rules ===
    logger.warning("[MI] ⚠️ AI analysis failed — falling back to hardcoded rules")
    
    if fallback_rules:
        from allocation_rules_engine import evaluate_market_rules
        adjustments = evaluate_market_rules(fallback_rules, market_data)
        adjustments["ai_regime"] = "fallback"
        adjustments["ai_warnings"] = ["AI analysis unavailable — using hardcoded rules"]
        
        _save_audit(market_data, None, adjustments)
        return adjustments
    
    return {"thematic_cap_deltas": {}, "hedge_deltas": {}, "bond_preferences": [], "active_rules": ["fallback_empty"]}


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
        "wti_usd": 91.0,
        "geopolitical_context": "US-Iran Hormuz crisis, Trump negotiations ongoing, 5-day military pause",
        "hormuz_status": "Partially closed, 5% normal flow",
        "vix": 27.0,
        "vix_trend_1m": "Rising from 19 to 27",
        "cpi_yoy_pct": 2.8,
        "cpi_core_mom_pct": 0.4,
        "pce_yoy_pct": 2.7,
        "fed_funds_rate": 3.625,
        "fed_funds_rate_delta_6m": 0.0,
        "fed_dot_plot_signal": "1 cut 2026, hawkish hold",
        "us_10y_yield": 4.39,
        "us_2y_yield": 4.05,
        "yield_curve_2s10s": 34,
        "breakeven_5y": 2.65,
        "prob_hike_next_fomc": 12.0,
        "ig_spread_bps": 135,
        "hy_spread_bps": 320,
        "hy_spread_trend": "Widening slowly",
        "gold_usd": 4451,
        "gold_drawdown_from_ath_pct": 16.5,
        "silver_usd": 32.5,
        "sp500_level": 6507,
        "sp500_ytd_pct": -1.5,
        "nasdaq_ytd_pct": -3.0,
        "xlu_perf_1m_pct": 10.3,
        "xle_perf_1m_pct": 8.5,
        "dxy": 99.5,
        "eurusd": 1.085,
        "fear_greed_index": 32,
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
