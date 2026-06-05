"""Core-Satellite Discipline — couche obligatoire du pipeline.

Applique en dur les règles décidées le 2026-06-03 après 7 tours de débat :
  - Satellite ≤ 20 % Modéré / 25 % Agressif / 10 % Stable
  - Cap 5 % par nom satellite
  - Cap 50 % par ETF cœur (sauf broad UCITS)
  - Cœur UCITS broad imposé par défaut (VWCE.DE, AGGH.AS, IBCI.AS, IBGS.AS, SGLN.AS, IWDA.AS)
  - β cible par profil (Stable 0.22 / Modéré 0.61 / Agressif 0.80)
  - Σ = 100.00 % exact, par construction

v6.2 (2026-06-03) — BYPASS SLSQP POUR LE SATELLITE
  Le satellite est désormais peuplé directement par les top natifs (fit_score
  via profile_assignment.py), équipondéré, capé. Le SLSQP ne touche plus au
  satellite — il ne décide que du cœur ETF.
  Raison : le dashboard audit avait identifié le goulet (cf. audit_dashboard.html
  l. 289) : "SLSQP final ne garde que 5 actions par profil et écarte les
  meilleurs candidats au profit de combinaisons covariance-favorables". Cette
  Phase Sélection-6 prévue n'avait jamais été codée.

Appelé par generate_portfolios_v4.py après l'optimizer, avant l'écriture JSON.
"""
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import copy

# ─── PARAMÈTRES (figés conversation 2026-06-03) ─────────────────────────────
CAP_PER_NAME = 0.05               # max 5 % par nom satellite
CAP_PER_CORE_ETF = 0.50           # max 50 % par ETF cœur
SAT_BUDGET = {                    # plafond satellite total
    "Stable":   0.10,
    "Modéré":   0.20,
    "Agressif": 0.25,
}

# Cœur UCITS canonique (somme = target_core par profil)
DEFAULT_CORE_FILLER = {
    # Stable (sat 10 %, cœur 90 %) — bonds-heavy + or
    "Stable":   [("VWCE.DE", 0.20), ("AGGH.AS", 0.25), ("IBCI.AS", 0.20),
                 ("IBGS.AS", 0.15), ("SGLN.AS", 0.10)],
    # Modéré (sat 20 %, cœur 80 %) — equity broad dominant, β cible 0.61
    "Modéré":   [("VWCE.DE", 0.50), ("AGGH.AS", 0.15), ("IBCI.AS", 0.05),
                 ("IBGS.AS", 0.05), ("SGLN.AS", 0.05)],
    # Agressif (sat 25 %, cœur 75 %) — equity broad très majoritaire, β cible 0.80
    # IBGS plafonné à 5% par profil (cap max_single_bond=5% pour Agressif)
    "Agressif": [("VWCE.DE", 0.50), ("IWDA.AS", 0.15), ("IBGS.AS", 0.05),
                 ("SGLN.AS", 0.05)],
}

# ETF broad reconnus (du choix v4 ou ailleurs) — si v4 les a, on les utilise tels quels
BROAD_CORE_ETFS = {
    "VT", "ACWI", "URTH", "IWDA", "VWCE", "IWDA.AS", "VWCE.DE",
    "IEMG", "VWO", "EMIM", "EMIM.AS",
    "AGG", "BND", "AGGH", "AGGH.AS", "GOVT",
    "SHY", "VGSH", "IBGS", "IBGS.AS", "BIL",
    "TIP", "STIP", "SCHP", "IBCI", "IBCI.AS",
    "GLD", "SGLN", "SGLN.AS", "IAU",
}

# v6.4 — Métadonnées des ETF UCITS du cœur (pour affichage dashboard)
# Sans ces infos, le dashboard affiche "Cœur broad UCITS" générique. Avec, il
# affiche le vrai nom, l'ISIN, et le TER. Données publiques iShares/Vanguard.
UCITS_CORE_META = {
    "VWCE.DE": {
        "name": "Vanguard FTSE All-World UCITS Acc EUR",
        "isin": "IE00BK5BQT80",
        "ter": 0.0022,  # 0.22%
        "category": "ETF",
        "fund_type": "Global Equity (All-World)",
        "currency": "EUR",
    },
    "IWDA.AS": {
        "name": "iShares Core MSCI World UCITS Acc",
        "isin": "IE00B4L5Y983",
        "ter": 0.0020,  # 0.20%
        "category": "ETF",
        "fund_type": "Developed Markets Equity",
        "currency": "EUR",
    },
    "EMIM.AS": {
        "name": "iShares Core MSCI EM IMI UCITS Acc",
        "isin": "IE00BKM4GZ66",
        "ter": 0.0018,  # 0.18%
        "category": "ETF",
        "fund_type": "Emerging Markets Equity",
        "currency": "EUR",
    },
    "AGGH.AS": {
        "name": "iShares Core Global Aggregate Bond UCITS EUR Hedged",
        "isin": "IE00BDBRDM35",
        "ter": 0.0010,  # 0.10%
        "category": "Obligations",
        "fund_type": "Global Aggregate Bond (EUR hedged)",
        "currency": "EUR",
    },
    "IBCI.AS": {
        "name": "iShares EUR Inflation Linked Govt Bond UCITS",
        "isin": "IE00B0M62X26",
        "ter": 0.0009,  # 0.09%
        "category": "Obligations",
        "fund_type": "EUR Inflation-Linked Govt Bond",
        "currency": "EUR",
    },
    "IBGS.AS": {
        "name": "iShares EUR Govt Bond 1-3yr UCITS",
        "isin": "IE00B14X4Q57",
        "ter": 0.0020,  # 0.20%
        "category": "Obligations",
        "fund_type": "EUR Govt Bond Short (1-3y)",
        "currency": "EUR",
    },
    "SGLN.AS": {
        "name": "iShares Physical Gold ETC",
        "isin": "IE00B4ND3602",
        "ter": 0.0012,  # 0.12%
        "category": "ETF",
        "fund_type": "Physical Gold",
        "currency": "EUR",
    },
}


# Bond ETF tickers — pour catégoriser dans "Obligations" (pas "ETF")
# Permet à la validation business rules de compter correctement les bonds.
BOND_ETF_TICKERS = {
    # Agrégés
    "AGG", "BND", "AGGH", "AGGH.AS", "BNDX", "IAGG",
    # Treasuries / Govt courts
    "SHY", "VGSH", "SCHO", "BSV", "BIL", "SGOV", "SHV", "TBIL", "USFR", "FLOT",
    "IBGS", "IBGS.AS", "GOVT", "VTIP",
    # Intermediate / Long Treasuries
    "IEF", "VGIT", "SCHR", "SCHZ", "TLT", "VGLT", "EDV", "ZROZ",
    # TIPS (inflation-linked)
    "TIP", "STIP", "SCHP", "IBCI", "IBCI.AS",
    # Corporate / Credit
    "LQD", "VCIT", "VCSH", "HYG", "JNK", "USIG", "MBB",
    # Autres
    "MUB", "EMB", "EMLC", "CLTL", "VRIG", "ICLO", "PAAA", "TDTT",
    "BINC", "CARY", "CGCP", "CGMS", "DRSK", "PGF",
}


def _is_bond_etf(ticker: str) -> bool:
    """Identifie un ETF bond (à classer dans 'Obligations' pour la validation)."""
    return (ticker or "").upper() in BOND_ETF_TICKERS


# ─── v6.2 : SATELLITE NATIF PAR FIT_SCORE ───────────────────────────────────
# Bypass SLSQP : le satellite stocks est peuplé directement par les top natifs
# (les actions dont _profile_native == profile, triées par _fit_<profile>).
# Voir profile_assignment.py pour fit_score_stable/modere/agressif.

_FIT_KEY_BY_PROFILE = {
    "Stable":   "_fit_stable",
    "Modéré":   "_fit_modere",
    "Agressif": "_fit_agressif",
}

# v6.18 — Diversification structurelle par profil
# Fix A : cap par SECTEUR (pas juste par industry, car "Insurance—P&C" et
# "Insurance—Reinsurance" sont 2 industries mais 1 cluster de risque).
# Stable : 1/secteur (évite 2 financières comme ADM+SREN dans les mêmes 2 lignes).
MAX_PER_SECTOR_BY_PROFILE = {
    "Stable":   1,
    "Modéré":   2,
    "Agressif": 2,
}
# Fix B : n_target élargi pour Stable (de 2 → 4) — meilleure diversification visible
N_TARGET_SATELLITE_BY_PROFILE = {
    "Stable":   4,
    "Modéré":   4,
    "Agressif": 5,
}

# v6.16 — Sticky bonus LÉGER (priorité #3 Claude externe)
# Filtre le bruit : un stock déjà en portefeuille reçoit un petit bonus de fit
# pour éviter qu'il sorte sur une variation marginale (±0.5). Trop fort = gelée.
# Trop faible = clignotement run-à-run. 0.03 = juste assez pour ignorer le bruit
# du recalcul fit_score, pas assez pour retenir un nom devenu clairement inférieur.
STICKY_BONUS = 0.03

def _load_previous_satellite_tickers() -> Dict[str, set]:
    """Lit la composition satellite PRÉCÉDENTE depuis data/portfolios.json.

    Retourne : {profile_name: set(tickers in current satellite)}
    Si le fichier n'existe pas (premier run), retourne dict vide → pas de sticky.
    """
    pf_path = Path(__file__).parent.parent / "data" / "portfolios.json"
    if not pf_path.exists():
        return {}
    try:
        with open(pf_path) as f:
            data = json.load(f)
    except Exception:
        return {}
    result: Dict[str, set] = {}
    for profile in ("Stable", "Modéré", "Agressif", "Agressif-Thematique"):
        prof = data.get(profile, {})
        meta = prof.get("_tickers_meta", {})
        sat_tickers = {tk for tk, m in meta.items() if m.get("role") == "satellite"}
        if sat_tickers:
            result[profile] = sat_tickers
    return result


def _load_all_stocks() -> List[Dict]:
    """Charge l'univers complet d'actions (US + EU + Asia)."""
    root = Path(__file__).parent.parent / "data"
    all_stocks = []
    for fname in ("stocks_us.json", "stocks_europe.json", "stocks_asia.json"):
        path = root / fname
        if not path.exists():
            continue
        try:
            data = json.load(open(path))
            stocks = data.get("stocks", []) if isinstance(data, dict) else data
            all_stocks.extend(stocks)
        except Exception:
            pass
    return all_stocks


def _get_top_natives_for_profile(profile: str, n_target: int) -> List[Dict]:
    """Retourne les top-N actions de qualité pour le satellite d'un profil.

    v6.3 (2026-06-04) — POOL ÉLARGI POUR AGRESSIF
    Pour Stable et Modéré : pool = _profile_native == profile, trié par _fit_<profile>.
    Pour Agressif : pool élargi à Modéré-natives + Agressif-natives, vol ≥ 20%,
        trié par _fit_modere (quality measure). Raison : fit_score_agressif a une
        vol band 30-65% qui EXCLUT mécaniquement les vraies qualités (NOVN vol 19,
        REGN 15, ADP 21). L'agressivité du profil vient du β cœur (0.80 via VWCE
        50% + IWDA 15%), pas de la vol des actions individuelles. Le satellite
        doit refléter la qualité, pas la haute vol.
    """
    try:
        from portfolio_engine.profile_assignment import annotate_universe_with_fits
    except ImportError:
        try:
            from .profile_assignment import annotate_universe_with_fits
        except ImportError:
            return []

    all_stocks = _load_all_stocks()
    if not all_stocks:
        return []
    annotate_universe_with_fits(all_stocks)

    # v6.16 : sticky bonus — un stock déjà en portefeuille reçoit un petit
    # bonus de fit pour filtrer le bruit (sortir sur ±0.005 = clignotement)
    prev_sats = _load_previous_satellite_tickers()
    prev_for_profile = prev_sats.get(profile, set())

    if profile == "Agressif":
        # Pool élargi : qualité quel que soit le profil natif, vol >= 20
        # v6.21 — Cap perf_1y ≤ 300% par COHÉRENCE DE DOCTRINE avec le
        # Thématique (ligne 713), pas pour optimiser un Sharpe historique.
        # Justification logique, vraie AVANT tout backtest : une action qui
        # a fait +400%/an est un pari sur la queue de distribution, pas une
        # qualité reproductible. Le filtre vire les fusées spéculatives
        # absurdes sans toucher aux vrais leaders (qui plafonnent à
        # ~150-250% sur les meilleurs cycles).
        # NE PAS modifier ce seuil sur la base d'un backtest a posteriori
        # (overfitting) : c'est une règle anti-spéculative de principe.
        candidates = [
            s for s in all_stocks
            if s.get("_profile_native") in ("Agressif", "Modéré")
            and (s.get("volatility_3y") or 0) >= 20.0
            and (s.get("buffett_score") or 0) >= 70  # qualité minimum
            and (s.get("perf_1y") or 0) < 300.0      # v6.21 anti-spéculatif
        ]
        # Tri par fit_modere + sticky bonus si dans portefeuille précédent
        def _score(s):
            base = s.get("_fit_modere") or 0
            tk = s.get("ticker") or s.get("symbol") or ""
            return base + (STICKY_BONUS if tk in prev_for_profile else 0)
        candidates.sort(key=_score, reverse=True)
    else:
        # v6.22 — T1 (qualité absolue) PRIME sur T4 (diversification)
        # Le profile_assignment annote _profile_native par fit_score sans
        # forcément appliquer le min_buffett_score du profil. Conséquence
        # observée : Stable a retenu AD/SHEL/FGR (Buffett 67) alors que
        # min_buffett_score=70 pour Stable. La diversification sectorielle
        # (max 1/secteur) écrasait silencieusement T1 quand il n'y avait
        # pas de Buffett≥70 dans un secteur donné.
        # Fix : filtrer explicitement par Buffett/Quality du profil AVANT
        # la diversification. Si après filtre il reste < n_target candidats
        # dans n secteurs distincts, on accepte une compo plus courte plutôt
        # que de dégrader la qualité — la hiérarchie des tiers (T1 > T4)
        # est une règle de doctrine.
        fit_key = _FIT_KEY_BY_PROFILE.get(profile, "_fit_modere")
        try:
            from portfolio_engine.preset_meta import PROFILE_POLICY
        except ImportError:
            from .preset_meta import PROFILE_POLICY
        policy = PROFILE_POLICY.get(profile, {})
        min_buf = policy.get("min_buffett_score", 0)
        min_qual = policy.get("min_quality_gate", 0)
        gate = (policy.get("gate_logic") or "or").lower()
        def _passes_qa(s):
            b = s.get("buffett_score") or 0
            q = s.get("quality_score") or 0
            if gate == "and":
                return b >= min_buf and q >= min_qual
            return b >= min_buf or q >= min_qual
        candidates = [
            s for s in all_stocks
            if s.get("_profile_native") == profile and _passes_qa(s)
        ]
        def _score(s):
            base = s.get(fit_key) or 0
            tk = s.get("ticker") or s.get("symbol") or ""
            return base + (STICKY_BONUS if tk in prev_for_profile else 0)
        candidates.sort(key=_score, reverse=True)

    # v6.18 — Diversification dure : par industry ET par SECTEUR GICS L1
    # Fix A : Stable concentré ADM+SREN venait du dédup industry seul —
    # "Insurance—P&C" et "Insurance—Reinsurance" sont 2 industries mais
    # 1 cluster de risque (corr 0.65 en GFC). Cap par secteur paramétrable.
    max_per_sector = MAX_PER_SECTOR_BY_PROFILE.get(profile, 2)
    by_industry: Dict[str, int] = {}
    by_sector: Dict[str, int] = {}
    deduped = []
    for s in candidates:
        ind = (s.get("industry") or "_").lower()
        sec = (s.get("sector") or s.get("sector_api") or "_").lower()
        if by_industry.get(ind, 0) >= 2:
            continue
        if by_sector.get(sec, 0) >= max_per_sector:
            continue
        by_industry[ind] = by_industry.get(ind, 0) + 1
        by_sector[sec] = by_sector.get(sec, 0) + 1
        deduped.append(s)
        if len(deduped) >= n_target:
            break

    # v6.18 Fix D : différencier visuellement Agressif vs Modéré
    # Force au moins 2/N stocks Agressif-natifs (vol ≥ 30%) dans Agressif satellite
    # pour qu'il ne soit pas un clone visuel du Modéré.
    if profile == "Agressif":
        high_vol_count = sum(1 for s in deduped if (s.get("volatility_3y") or 0) >= 30)
        if high_vol_count < 2:
            # Cherche dans le reste des candidats les vol ≥ 30 non-déjà-pris
            extra_high_vol = [
                s for s in candidates
                if s not in deduped
                and (s.get("volatility_3y") or 0) >= 30
            ]
            n_to_swap = min(2 - high_vol_count, len(extra_high_vol))
            for i in range(n_to_swap):
                # Trouve la position la plus calme à remplacer (vol minimale)
                low_vol_positions = sorted(
                    range(len(deduped)),
                    key=lambda idx: deduped[idx].get("volatility_3y") or 0
                )
                if low_vol_positions:
                    idx_remove = low_vol_positions[0]
                    deduped[idx_remove] = extra_high_vol[i]

    return deduped


def _is_broad_core(ticker: str, meta: Dict) -> bool:
    """Identifie un ETF cœur broad — exige catégorie ETF/Obligations ET ticker connu."""
    if ticker not in BROAD_CORE_ETFS:
        return False
    cat = (meta.get("category") or "").lower()
    return cat in ("etf", "obligations", "bond")


def _build_disciplined_positions(profile: str, v4_meta: Dict) -> List[Dict]:
    """Reconstruit les positions disciplinées à partir du _tickers_meta v4.

    v6.2 : Le satellite stocks est désormais peuplé par les TOP NATIFS du score
    fit (profile_assignment.py), équipondéré et capé. Le SLSQP ne touche plus
    au satellite — il ne décide que du cœur ETF.

    Args:
        profile: "Stable" | "Modéré" | "Agressif"
        v4_meta: {ticker: {weight, category, name, industry, beta, asset_ids}}

    Returns:
        List[dict] de positions avec role, weight, etc. — Σ = 100 % garanti
    """
    positions = []
    sat_used = 0.0
    cap_budget = SAT_BUDGET.get(profile, 0.20)

    # ─── PHASE 1 v6.2 : Satellite = TOP NATIFS par fit_score, équipondéré ──
    # n_max = budget / cap (Stable 10/5=2, Modéré 20/5=4, Agressif 25/5=5)
    # v6.18 Fix B : n_target élargi pour Stable (4 au lieu de 2)
    # Permet 4 actions diversifiées par secteur au lieu de 2 financières concentrées.
    # Cap automatique : 10% budget / 4 stocks = 2.5%/nom (toujours sous cap 5%).
    n_max_satellite = N_TARGET_SATELLITE_BY_PROFILE.get(
        profile, int(round(cap_budget / CAP_PER_NAME))
    )
    top_natives = _get_top_natives_for_profile(profile, n_target=n_max_satellite)

    if top_natives:
        # Construit le satellite à partir des natifs (bypass SLSQP)
        weight_per_name = cap_budget / len(top_natives) if top_natives else 0
        weight_per_name = min(weight_per_name, CAP_PER_NAME)
        fit_key = _FIT_KEY_BY_PROFILE.get(profile, "_fit_modere")

        for s in top_natives:
            tk = s.get("ticker") or s.get("symbol") or s.get("resolved_symbol")
            if not tk:
                continue
            name = (s.get("name") or s.get("name_api") or tk)[:80]
            positions.append({
                "ticker": tk,
                "name": name,
                "category": "Actions",
                "industry": s.get("industry", ""),
                "weight_pct": round(weight_per_name * 100, 2),
                "weight": weight_per_name,
                "role": "satellite",
                "asset_ids": [tk],
                "beta": s.get("beta"),
                "buffett_score": s.get("buffett_score"),
                "fit_score": s.get(fit_key),
                "_source": "top_natifs_v6.2",
            })
            sat_used += weight_per_name

    else:
        # FALLBACK v6.0 si profile_assignment indisponible : ancienne logique
        # (prend les positions v4 par poids décroissant)
        sorted_items = sorted(v4_meta.items(), key=lambda x: -(x[1].get("weight") or 0))
        for tk, meta in sorted_items:
            if _is_broad_core(tk, meta):
                continue
            w_v4 = meta.get("weight") or 0
            if w_v4 <= 0:
                continue
            w_capped = min(w_v4, CAP_PER_NAME)
            remaining = cap_budget - sat_used
            if remaining <= 0.001:
                break
            w_final = min(w_capped, remaining)
            if w_final < 0.005:
                continue
            positions.append({
                "ticker": tk,
                "name": (meta.get("name") or "")[:80],
                "category": meta.get("category", ""),
                "industry": meta.get("industry", ""),
                "weight_pct": round(w_final * 100, 2),
                "weight": w_final,
                "role": "satellite",
                "asset_ids": meta.get("asset_ids", [tk]),
                "beta": meta.get("beta"),
                "_source": "v4_fallback",
            })
            sat_used += w_final

    # ─── PHASE 2 : Cœur UCITS broad (filler canonique) ─────────────────────
    target_core = 1.0 - sat_used
    filler = DEFAULT_CORE_FILLER.get(profile, DEFAULT_CORE_FILLER["Modéré"])
    # v6.4 : enrichit chaque filler avec ses vraies métadonnées (nom, ISIN, TER)
    # pour que le dashboard et les consommateurs en aval voient le vrai produit.
    def _get_filler_meta(tk: str) -> Dict:
        m = UCITS_CORE_META.get(tk)
        if m:
            return {
                "name": m["name"],
                "category": m["category"],
                "isin": m["isin"],
                "ter": m["ter"],
                "fund_type": m["fund_type"],
                "currency": m["currency"],
            }
        return {"name": f"Cœur broad UCITS ({tk})", "category": "ETF"}

    filler_meta = {"name": "Cœur broad UCITS", "category": "ETF"}
    core_dict = {}  # ticker -> weight

    # Pass 1 : alloue chaque entrée filler dans la limite de son poids template
    gap = target_core
    for tk, w_template in filler:
        if gap <= 0.001:
            break
        existing_w = core_dict.get(tk, 0)
        headroom = CAP_PER_CORE_ETF - existing_w
        if headroom <= 0:
            continue
        add = min(headroom, gap, w_template)
        if add > 0.001:
            core_dict[tk] = existing_w + add
            gap -= add

    # Pass 2 : consomme la headroom restante si gap non comblé
    passes = 0
    while gap > 0.001 and passes < 3:
        distributed = 0.0
        for tk, _ in filler:
            if gap <= 0.001:
                break
            existing_w = core_dict.get(tk, 0)
            headroom = CAP_PER_CORE_ETF - existing_w
            if headroom <= 0.001:
                continue
            add = min(headroom, gap)
            if add < 0.001:
                continue
            core_dict[tk] = existing_w + add
            gap -= add
            distributed += add
        if distributed < 0.001:
            break
        passes += 1

    for tk, w in core_dict.items():
        meta = _get_filler_meta(tk)
        positions.append({
            "ticker": tk,
            "name": meta["name"],
            "category": meta["category"],
            "industry": meta.get("fund_type", ""),
            "weight_pct": round(w * 100, 2),
            "weight": w,
            "role": "core",
            "asset_ids": [tk],
            "beta": None,
            "isin": meta.get("isin"),
            "ter": meta.get("ter"),
            "currency": meta.get("currency"),
        })

    positions.sort(key=lambda p: -p["weight_pct"])
    return positions


def positions_to_format_b(positions: List[Dict], profile: str) -> Dict:
    """Convertit les positions disciplinées en Format B (compatible schemas/portfolio_output.json).

    Schema requis :
      - Commentaire (str 50-5000 chars)
      - Actions, ETF, Obligations, Crypto (AllocationMap : "NAME (TK)" → "X.X%")
      - _tickers (TickerWeights : ticker → decimal 0-1)
      - _tickers_meta (optionnel mais consommé par HTML)
    additionalProperties: false — seules les clés du schema sont autorisées.
    """
    actions, etf, obligations = {}, {}, {}
    tickers_meta = {}
    tickers = {}  # _tickers : ticker → decimal weight (requis par schema)

    for p in positions:
        tk = p["ticker"]
        name = p.get("name") or tk
        w_pct = p["weight_pct"]
        w_frac = w_pct / 100.0
        cat_raw = (p.get("category") or "").lower()

        # v6.0.2 : un ETF bond doit aller dans "Obligations", pas "ETF"
        # — sinon la validation business rules compte 0% de bonds.
        if cat_raw in ("actions", "stock", "equity"):
            cat_display = "Actions"
            actions[f"{name} ({tk})"] = f"{w_pct:.1f}%"
        elif cat_raw in ("obligations", "bond") or _is_bond_etf(tk):
            cat_display = "Obligations"
            obligations[f"{name} ({tk})"] = f"{w_pct:.1f}%"
        else:
            cat_display = "ETF"
            etf[f"{name} ({tk})"] = f"{w_pct:.1f}%"

        tickers[tk] = round(w_frac, 4)

        tickers_meta[tk] = {
            "weight": w_frac,
            "category": cat_display,
            "name": name,
            "asset_ids": p.get("asset_ids", [tk]),
            "industry": p.get("industry", ""),
            "beta": p.get("beta"),
            "role": p["role"],
        }
        # v6.4 : pour les ETF cœur UCITS, propage ISIN/TER/currency au dashboard
        if p.get("isin"):
            tickers_meta[tk]["isin"] = p["isin"]
        if p.get("ter") is not None:
            tickers_meta[tk]["ter"] = p["ter"]
        if p.get("currency"):
            tickers_meta[tk]["currency"] = p["currency"]
        if p.get("fit_score") is not None:
            tickers_meta[tk]["fit_score"] = p["fit_score"]
        if p.get("buffett_score") is not None:
            tickers_meta[tk]["buffett_score"] = p["buffett_score"]

    # Commentaire min 50 chars (schema requirement) — adapté au profil
    if profile == "Agressif-Thematique":
        commentaire = (
            "Portefeuille Agressif-Thematique (v6.9) — variante POUSSÉE pour comparaison. "
            "Cœur 80% en ETFs thématiques diversifiés Growth/EM/Tech/SmallCap/MidCap/"
            "International/Énergie (QQQ + IEMG + VGT + CGXU + VBK + VOT + XLE + or + EWT). "
            "Satellite 20% = mêmes 5 actions qualité que l'Agressif Principal (continuité). "
            "Σ = 100% par construction. β attendu ~1.1, MaxDD historique -60 à -75% sur "
            "fenêtre complète 2000-2026 (incluant dotcom + GFC). À COMPARER dans le "
            "dashboard avec l'Agressif Principal — pas optimisation, pari thématique assumé."
        )
    else:
        commentaire = (
            f"Portefeuille {profile} (v6.9) — discipline Core-Satellite. "
            f"Cœur ETF UCITS broad calibré pour β cible "
            f"(Stable 0.22 / Modéré 0.61 / Agressif 0.80) + satellite fondamental "
            f"capé à 5%/nom, budget {int(SAT_BUDGET.get(profile, 0)*100)}%. "
            f"Σ = 100% par construction. RADAR sectoriel neutralisé "
            f"(walk-forward strict a montré Δ Sharpe -0.11 OOS sur timing factoriel)."
        )

    return {
        "Actions": actions,
        "ETF": etf,
        "Obligations": obligations,
        "Crypto": {},
        "_tickers": tickers,
        "_tickers_meta": tickers_meta,
        "Commentaire": commentaire,
    }


# Champs du profil qu'on remplace (les autres champs v4 sont préservés tels quels)
_DISCIPLINE_OVERRIDE_KEYS = {
    "Actions", "ETF", "Obligations", "Crypto",
    "_tickers", "_tickers_meta", "Commentaire",
}


def apply_to_portfolios_dict(portfolios_data: Dict) -> Dict:
    """Applique la discipline aux 3 profils dans le dict portfolios_data.

    Args:
        portfolios_data: structure produite par v4 — {Agressif, Modéré, Stable, ...}
                         Chaque profil doit avoir un `_tickers_meta` populé.

    Returns:
        Nouveau dict avec les 3 profils principaux disciplinés. Les champs
        v4 non-discipline (_optimization, _exposures, risk_analysis, _alternates,
        _constraint_report, _limitations, etc.) sont PRÉSERVÉS tels quels.
        Les autres clés top-level (Dividende-PEA, Dividende-CTO, _meta) sont
        préservées telles quelles.
    """
    output = {}
    # Préserve les clés top-level non-Core-Satellite (dividendes, _meta, etc.)
    for k, v in portfolios_data.items():
        if k not in ("Stable", "Modéré", "Agressif"):
            output[k] = v

    # Pour chaque profil principal : on MERGE le résultat discipline sur le profil v4
    # → les champs Actions/ETF/Obligations/Crypto/_tickers/_tickers_meta/Commentaire
    #   sont remplacés par la version disciplinée
    # → tous les autres champs v4 (_optimization, _exposures, risk_analysis, etc.)
    #   sont préservés tels quels
    agressif_satellite_positions = None  # pour réutiliser dans Agressif-Thematique
    for profile in ("Stable", "Modéré", "Agressif"):
        prof_v4 = portfolios_data.get(profile, {})
        v4_meta = prof_v4.get("_tickers_meta", {})
        if not v4_meta:
            output[profile] = prof_v4  # rien à discipliner
            continue
        positions = _build_disciplined_positions(profile, v4_meta)
        disciplined = positions_to_format_b(positions, profile)
        # Merge : profil v4 + override des clés discipline
        merged = dict(prof_v4)  # copie shallow du profil v4
        merged.update(disciplined)  # écrase les clés discipline
        output[profile] = merged

        # Pour Agressif : capture le satellite pour le réutiliser dans Agressif-Thematique
        if profile == "Agressif":
            agressif_satellite_positions = [p for p in positions if p.get("role") == "satellite"]

    # ═══════════════════════════════════════════════════════════════════════
    # v6.9 (2026-06-04) — PROFIL SUPPLÉMENTAIRE : AGRESSIF-THEMATIQUE
    # ─────────────────────────────────────────────────────────────────────
    # Génère un 4e profil dans portfolios.json pour COMPARAISON dans le dashboard.
    # Même satellite que l'Agressif Principal (continuité), cœur thématique pure
    # ETF Growth/EM/Tech/SmallCap/MidCap/International/Énergie.
    # Schema CI : "Agressif-Thematique" ajouté comme propriété optionnelle.
    # ═══════════════════════════════════════════════════════════════════════
    if agressif_satellite_positions:
        thematique = _build_agressif_thematique(agressif_satellite_positions)
        output["Agressif-Thematique"] = thematique

    return output


# ─── Profil Agressif-Thematique (v6.9) ────────────────────────────────────
THEMATIQUE_CORE = {
    "QQQ":     {"weight": 0.20, "name": "Invesco QQQ Trust (Nasdaq 100)",
                "fund_type": "Large Growth Tech-heavy", "currency": "USD"},
    "IEMG":    {"weight": 0.15, "name": "iShares Core MSCI EM IMI",
                "fund_type": "Emerging Markets diversified", "currency": "USD"},
    "VGT":     {"weight": 0.10, "name": "Vanguard Information Technology ETF",
                "fund_type": "US Tech sector broad", "currency": "USD"},
    "CGXU":    {"weight": 0.10, "name": "Capital Group International Focus Eq",
                "fund_type": "Foreign Large Growth", "currency": "USD"},
    "VBK":     {"weight": 0.08, "name": "Vanguard Small-Cap Growth ETF",
                "fund_type": "US Small-Cap Growth", "currency": "USD"},
    "VOT":     {"weight": 0.05, "name": "Vanguard Mid-Cap Growth ETF",
                "fund_type": "US Mid-Cap Growth", "currency": "USD"},
    "XLE":     {"weight": 0.05, "name": "Energy Select Sector SPDR",
                "fund_type": "US Energy", "currency": "USD"},
    "SGLN.AS": {"weight": 0.05, "name": "iShares Physical Gold ETC",
                "fund_type": "Gold hedge", "isin": "IE00B4ND3602",
                "ter": 0.0012, "currency": "EUR"},
    "EWT":     {"weight": 0.02, "name": "iShares MSCI Taiwan ETF",
                "fund_type": "Taiwan (high vol, small tilt)", "currency": "USD"},
}  # total = 0.80


# v6.14 : Satellite thématique DYNAMISÉ (plus d'actions en dur).
# Sélectionné via fit_score_agressif (qui privilégie haute vol + momentum +
# EPS growth — les caractéristiques des actions thématiques par construction).
# PAS de bonus RADAR sectoriel ici — le RADAR est neutralisé au pipeline et
# le réintroduire ici réouvrirait le timing factoriel rejeté OOS (-0.11 Sharpe).
# Garde-fous structurels :
#   - max 2 actions par pays (sinon le scoring remonte 5 semis Corée-Taïwan)
#   - max 2 actions par industry (sinon 5 clones d'un même secteur)
#   - Buffett ≥ 70 (qualité minimum, exclut les small-caps spéculatifs)
#   - vol_3y ≥ 30% (pool thématique = haute vol par définition)

def _get_top_thematic_satellite(n_target: int = 5) -> List[Dict]:
    """Sélectionne dynamiquement le top-N actions thématiques.

    Score = fit_score_agressif (fondamental, pas sectoriel macro).
    Diversification forcée : max 2 par pays ET max 2 par industry.
    Pool restreint à haute vol + qualité minimum pour rester thématique.
    """
    try:
        from portfolio_engine.profile_assignment import annotate_universe_with_fits
    except ImportError:
        try:
            from .profile_assignment import annotate_universe_with_fits
        except ImportError:
            return []

    all_stocks = _load_all_stocks()
    if not all_stocks:
        return []
    annotate_universe_with_fits(all_stocks)

    # v6.18 Fix C : Pool thématique DÉSATURÉ
    # - Buffett ≥ 65 (baissé de 70 — laisse passer plus de qualité semi mid-cap)
    # - vol_3y ≥ 30% (inchangé — pool thématique haute vol)
    # - PERF_1Y ≤ 300% (exclut SK SQUARE +1168%, fusées spéculatives pures)
    #   raisonnement : un stock qui a fait +1000%/an est probablement au sommet,
    #   pas un "pari thématique de qualité". Cap à 300% = filtre les extremes
    #   tout en gardant les vrais leaders thématiques (+50 à +250%).
    candidates = [
        s for s in all_stocks
        if (s.get("volatility_3y") or 0) >= 30.0
        and (s.get("buffett_score") or 0) >= 65
        and (s.get("perf_1y") or 0) < 300.0
    ]

    # v6.16 : sticky bonus léger pour filtrer le bruit
    prev_sats = _load_previous_satellite_tickers()
    prev_for_thematique = prev_sats.get("Agressif-Thematique", set())

    # v6.18 Fix C : tri par fit_agressif DÉSATURÉ
    # On garde fit_agressif (= reflète bien le thème) mais on plafonne sa
    # contribution momentum extrême. Concrètement : si _fit_agressif est saturé
    # par perf_1y +1000%, on le ramène vers une valeur plus normale en pénalisant
    # les stocks avec perf_1y > 200% (qui ont déjà explosé).
    def _score(s):
        base = s.get("_fit_agressif") or 0
        perf_1y = s.get("perf_1y") or 0
        # Pénalité progressive si perf_1y > 200% (déjà au sommet)
        if perf_1y > 200:
            penalty = min((perf_1y - 200) / 1000, 0.15)  # max -15% sur fit
            base = base - penalty
        tk = s.get("ticker") or s.get("symbol") or ""
        return base + (STICKY_BONUS if tk in prev_for_thematique else 0)
    candidates.sort(key=_score, reverse=True)

    # Diversification dure : max 2 par pays + max 2 par industry
    by_country: Dict[str, int] = {}
    by_industry: Dict[str, int] = {}
    selected = []
    for s in candidates:
        country = (s.get("country") or "_").lower()
        industry = (s.get("industry") or "_").lower()
        if by_country.get(country, 0) >= 2:
            continue
        if by_industry.get(industry, 0) >= 2:
            continue
        by_country[country] = by_country.get(country, 0) + 1
        by_industry[industry] = by_industry.get(industry, 0) + 1
        selected.append(s)
        if len(selected) >= n_target:
            break

    return selected


def _build_agressif_thematique(satellite_positions_unused: List[Dict]) -> Dict:
    """Construit le profil Agressif-Thematique en Format B.

    v6.14 : Satellite DYNAMISÉ via fit_score_agressif + max 2/pays + max 2/industry.
    Le paramètre satellite_positions_unused est conservé pour la signature
    mais ignoré — le satellite Thematique a son propre univers (scored dynamiquement).
    """
    positions = []

    # Cœur thématique (80 %) — reste en dur (ticker stable, contenu vivant)
    for tk, info in THEMATIQUE_CORE.items():
        positions.append({
            "ticker": tk,
            "name": info["name"][:80],
            "category": "ETF",
            "industry": info.get("fund_type", ""),
            "weight_pct": round(info["weight"] * 100, 2),
            "weight": info["weight"],
            "role": "core",
            "asset_ids": [tk],
            "beta": None,
            "isin": info.get("isin"),
            "ter": info.get("ter"),
            "currency": info.get("currency"),
        })

    # Satellite : top 5 dynamique via fit_score_agressif (20 % total, 4 % par nom)
    n_satellite = 5
    weight_per = 0.20 / n_satellite  # = 0.04
    top_thematic = _get_top_thematic_satellite(n_target=n_satellite)

    # Log pour vérification de la diversification (max 2/pays appliqué)
    if top_thematic:
        countries = [s.get("country", "?") for s in top_thematic]
        industries = [s.get("industry", "?") for s in top_thematic]
        try:
            import logging
            log = logging.getLogger("portfolio_engine.core_satellite_discipline")
            log.info(f"[Agressif-Thematique] Satellite dynamique : "
                     f"{[s.get('ticker') for s in top_thematic]}")
            log.info(f"  Pays : {countries}  (max 2/pays ✓)")
            log.info(f"  Industries : {industries}  (max 2/industry ✓)")
        except Exception:
            pass

    for s in top_thematic:
        tk = s.get("ticker") or s.get("symbol") or s.get("resolved_symbol", "")
        if not tk:
            continue
        positions.append({
            "ticker": tk,
            "name": (s.get("name") or tk)[:80],
            "category": "Actions",
            "industry": s.get("industry", ""),
            "weight_pct": round(weight_per * 100, 2),
            "weight": weight_per,
            "role": "satellite",
            "asset_ids": [tk],
            "beta": s.get("beta"),
            "country": s.get("country"),
            "buffett_score": s.get("buffett_score"),
            "fit_score": s.get("_fit_agressif"),
        })

    return positions_to_format_b(positions, "Agressif-Thematique")


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────
__all__ = ["apply_to_portfolios_dict", "SAT_BUDGET", "CAP_PER_NAME", "CAP_PER_CORE_ETF"]
