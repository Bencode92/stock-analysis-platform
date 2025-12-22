# utils/canonicalize.py
"""
P1-5: Canonicalization pour hash déterministe.

v2.0 - Design core_hash (allowlist) + full_hash (denylist)

Objectifs:
- CI stable: 2 runs avec fixtures → même hash
- Reproductibilité: debug + audit
- Traçabilité prod: manifest avec data_sources hashes

Design:
- core_hash: Allowlist = robuste (nouveaux champs ignorés)
- full_hash: Denylist = fragile mais complet (debug)

Basé sur analyse exhaustive de:
- portfolio_engine/constraints.py (ConstraintViolation structure)
- compliance/sanitizer.py (SanitizeReport.hits = List[Tuple])
"""
import json
import copy
import hashlib
from typing import Any, Dict, List, Optional, Tuple

# ============= CONFIGURATION =============

PROFILES = ["Agressif", "Modéré", "Stable"]

# CORE_HASH: Seuls ces paths sont inclus (allowlist = robuste)
# Nouveaux champs ajoutés = automatiquement ignorés → hash stable
CORE_PATHS_DOC = """
Paths inclus dans core_hash:
- Allocations: *.Actions, *.ETF, *.Obligations, *.Crypto, *._tickers
- Contraintes: *._constraint_report.{all_hard_satisfied, violations, margins, ...}
- Optimisation: *._optimization.{mode, vol_realized, vol_target, converged}
- Meta: _meta.{version, buffett_mode, buffett_min_score}
- Manifest: _manifest.{git_sha, data_sources}
"""

# FULL_HASH: Paths volatils à exclure (denylist)
# Moins robuste: nouveau champ volatil non listé = hash instable
VOLATILE_PATHS_DOC = """
Paths exclus du full_hash:
- _meta.generated_at (timestamp)
- *._constraint_report.timestamp
- *._compliance_audit.timestamp
- *._backtest (dépend des prix = volatil)
"""


# ============= HELPERS =============

def _canonical_sort(obj: Any) -> Any:
    """
    Tri récursif robuste pour tout type.
    
    Gère correctement:
    - dict: tri par clé
    - list[dict]: tri par json.dumps canonique
    - list[tuple]: tri par éléments (pour hits = [(label, match), ...])
    - list[str]: tri alphabétique
    - list[other]: tri par repr()
    
    Returns:
        Structure triée de manière déterministe
    """
    if isinstance(obj, dict):
        return {k: _canonical_sort(v) for k, v in sorted(obj.items())}
    
    if isinstance(obj, list):
        if not obj:
            return obj
        
        first = obj[0]
        
        # List[dict] → tri par représentation JSON canonique
        # Ex: violations = [{"name": "sum_100", ...}, {"name": "bonds_min", ...}]
        if isinstance(first, dict):
            sorted_items = [_canonical_sort(item) for item in obj]
            return sorted(
                sorted_items,
                key=lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False)
            )
        
        # List[tuple] ou List[list] → tri par éléments
        # Ex: hits = [("superlatif", "idéal"), ("promesse_garantie", "garanti")]
        if isinstance(first, (tuple, list)):
            return sorted(obj, key=lambda x: tuple(str(e) for e in x))
        
        # List[str/int/float] → tri natif
        # Ex: warnings = ["phrase1", "phrase2"], relaxed_constraints = ["bucket_core"]
        if isinstance(first, (str, int, float)):
            return sorted(obj)
        
        # Fallback: tri par repr() pour types inconnus
        return sorted(obj, key=repr)
    
    return obj


def _round_floats(obj: Any, decimals: int = 6) -> Any:
    """
    Arrondit récursivement tous les floats.
    
    Absorbe les micro-différences de calcul (BLAS/threads).
    6 décimales = bon compromis précision/stabilité.
    
    Args:
        obj: Structure à traiter
        decimals: Nombre de décimales (défaut 6)
    
    Returns:
        Structure avec floats arrondis
    """
    if isinstance(obj, float):
        return round(obj, decimals)
    if isinstance(obj, dict):
        return {k: _round_floats(v, decimals) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_floats(item, decimals) for item in obj]
    if isinstance(obj, tuple):
        return tuple(_round_floats(item, decimals) for item in obj)
    return obj


def _extract_core(output: dict) -> dict:
    """
    Extrait uniquement les paths définis dans l'allowlist.
    
    Design ALLOWLIST = robuste:
    - Nouveaux champs ajoutés → automatiquement ignorés
    - Hash stable même si le schéma évolue
    
    Contenu du core:
    - Allocations (output principal)
    - Résultats de validation (contraintes)
    - Mode d'optimisation
    - Paramètres de run
    - Traçabilité input (git_sha, data_sources hashes)
    
    Args:
        output: JSON complet de generate_portfolios_v4.py
    
    Returns:
        Sous-ensemble pour core_hash
    """
    core = {}
    
    # === Profils (Agressif, Modéré, Stable) ===
    for profile in PROFILES:
        if profile not in output:
            continue
        
        p = output[profile]
        core[profile] = {}
        
        # Allocations (cœur de l'output)
        for cat in ["Actions", "ETF", "Obligations", "Crypto", "_tickers"]:
            if cat in p:
                core[profile][cat] = p[cat]
        
        # Constraint report (sans timestamp)
        if "_constraint_report" in p:
            cr = p["_constraint_report"]
            core[profile]["_constraint_report"] = {}
            for k in [
                "all_hard_satisfied", 
                "all_soft_satisfied",
                "n_violations",
                "violations", 
                "warnings",
                "margins", 
                "relaxed_constraints"
            ]:
                if k in cr:
                    core[profile]["_constraint_report"][k] = cr[k]
        
        # Optimization (mode et métriques, sans disclaimer)
        if "_optimization" in p:
            opt = p["_optimization"]
            core[profile]["_optimization"] = {}
            for k in [
                "mode", 
                "is_heuristic",
                "vol_realized", 
                "vol_target", 
                "converged",
                "covariance_method",
                "n_assets",
                "n_bonds",
                "n_crypto"
                 # PR3: Nouvelles métadonnées heuristiques
                "heuristic_name",
                "heuristic_version",
                "rules_applied",
                "why_not_slsqp",
            ]:
                if k in opt:
                    core[profile]["_optimization"][k] = opt[k]
        
        # Limitations (ordre sémantique = ne pas trier)
        if "_limitations" in p:
            core[profile]["_limitations"] = p["_limitations"]
    
    # === Meta (paramètres de run, sans timestamps) ===
    if "_meta" in output:
        m = output["_meta"]
        core["_meta"] = {}
        for k in [
            "version", 
            "buffett_mode", 
            "buffett_min_score",
            "tactical_context_enabled",
            "backtest_days",
            "optimization_modes"
        ]:
            if k in m:
                core["_meta"][k] = m[k]
    
    # === Manifest (traçabilité input) ===
    if "_manifest" in output:
        mf = output["_manifest"]
        core["_manifest"] = {}
        
        # Git SHA = version du code
        if "git_sha" in mf:
            core["_manifest"]["git_sha"] = mf["git_sha"]
        
        # Data sources hashes = version des données
        if "data_sources" in mf:
            core["_manifest"]["data_sources"] = mf["data_sources"]
        
        # Module versions
        if "module_versions" in mf:
            core["_manifest"]["module_versions"] = mf["module_versions"]
    
    return core


def _remove_volatile(output: dict) -> dict:
    """
    Supprime les paths volatils pour full_hash.
    
    Design DENYLIST = fragile:
    - Nouveau champ volatil non listé = hash instable
    - Utile pour debug complet
    
    Paths supprimés:
    - _meta.generated_at
    - *._constraint_report.timestamp
    - *._compliance_audit.timestamp
    - *._backtest (dépend des prix historiques)
    
    Args:
        output: JSON complet
    
    Returns:
        JSON sans les paths volatils
    """
    result = copy.deepcopy(output)
    
    # === Meta ===
    if "_meta" in result:
        result["_meta"].pop("generated_at", None)
        result["_meta"].pop("duration_ms", None)
    
    # === Par profil ===
    for profile in PROFILES:
        if profile not in result:
            continue
        p = result[profile]
        
        # _backtest (dépend des prix = volatil entre runs)
        p.pop("_backtest", None)
        
        # Timestamps dans _constraint_report
        if "_constraint_report" in p:
            p["_constraint_report"].pop("timestamp", None)
        
        # Timestamps dans _compliance_audit
        if "_compliance_audit" in p:
            p["_compliance_audit"].pop("timestamp", None)
    
    # === Manifest execution (si présent) ===
    if "_manifest" in result:
        result["_manifest"].pop("execution", None)
        result["_manifest"].pop("cache_hits", None)
    
    return result


# ============= MAIN FUNCTIONS =============

def canonicalize_core(output: dict, float_decimals: int = 6) -> str:
    """
    JSON canonique pour CORE_HASH (allowlist = robuste).
    
    Contient uniquement ce qui définit le portefeuille:
    - Allocations
    - Résultats de validation
    - Paramètres de run
    - Traçabilité input
    
    Args:
        output: JSON de generate_portfolios_v4.py
        float_decimals: Précision des floats (défaut 6)
    
    Returns:
        JSON string canonique (prêt pour hash)
    """
    core = _extract_core(output)
    core = _canonical_sort(core)
    core = _round_floats(core, decimals=float_decimals)
    
    return json.dumps(
        core,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def canonicalize_full(output: dict, float_decimals: int = 6) -> str:
    """
    JSON canonique pour FULL_HASH (denylist = moins robuste).
    
    Contient tout sauf timestamps et _backtest.
    Utile pour debug, mais fragile aux nouveaux champs.
    
    Args:
        output: JSON de generate_portfolios_v4.py
        float_decimals: Précision des floats (défaut 6)
    
    Returns:
        JSON string canonique (prêt pour hash)
    """
    full = _remove_volatile(output)
    full = _canonical_sort(full)
    full = _round_floats(full, decimals=float_decimals)
    
    return json.dumps(
        full,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def compute_hashes(output: dict, float_decimals: int = 6) -> Dict[str, str]:
    """
    Calcule les deux hashes canoniques.
    
    Args:
        output: JSON de generate_portfolios_v4.py
        float_decimals: Précision des floats (défaut 6)
    
    Returns:
        {
            "core_hash": SHA256 du contrat public (allocations + contraintes),
            "full_hash": SHA256 du JSON complet (moins _backtest, timestamps),
        }
    
    Usage:
        >>> hashes = compute_hashes(portfolio_json)
        >>> print(hashes["core_hash"])  # Pour CI / audit
        >>> print(hashes["full_hash"])  # Pour debug
    """
    core_str = canonicalize_core(output, float_decimals)
    full_str = canonicalize_full(output, float_decimals)
    
    return {
        "core_hash": hashlib.sha256(core_str.encode("utf-8")).hexdigest(),
        "full_hash": hashlib.sha256(full_str.encode("utf-8")).hexdigest(),
    }


def add_hashes_to_meta(output: dict, float_decimals: int = 6) -> dict:
    """
    Ajoute les hashes au bloc _meta du JSON.
    
    Utile pour traçabilité en production:
    - Chaque run a son core_hash
    - Permet de vérifier reproductibilité
    
    Args:
        output: JSON de generate_portfolios_v4.py
        float_decimals: Précision des floats
    
    Returns:
        JSON avec _meta.core_hash et _meta.full_hash ajoutés
    
    Note:
        Les hashes sont calculés AVANT d'être ajoutés,
        donc ils ne s'incluent pas eux-mêmes (pas de récursion).
    """
    result = copy.deepcopy(output)
    hashes = compute_hashes(output, float_decimals)
    
    if "_meta" not in result:
        result["_meta"] = {}
    
    result["_meta"]["core_hash"] = hashes["core_hash"]
    result["_meta"]["full_hash"] = hashes["full_hash"]
    
    return result


# ============= CLI UTILITY =============

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python canonicalize.py <portfolio.json> [--verbose]")
        print("")
        print("Calcule les hashes canoniques d'un fichier portfolio JSON.")
        print("")
        print("Options:")
        print("  --verbose  Affiche aussi la taille des JSON canoniques")
        sys.exit(1)
    
    filepath = sys.argv[1]
    verbose = "--verbose" in sys.argv
    
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    hashes = compute_hashes(data)
    
    print(f"Core hash: {hashes['core_hash']}")
    print(f"Full hash: {hashes['full_hash']}")
    
    if verbose:
        core_str = canonicalize_core(data)
        full_str = canonicalize_full(data)
        print(f"")
        print(f"Core size: {len(core_str):,} chars")
        print(f"Full size: {len(full_str):,} chars")
