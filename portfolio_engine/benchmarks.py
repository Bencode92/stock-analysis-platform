# portfolio_engine/benchmarks.py
"""
P1-7: Profile-specific benchmark configuration.

Chaque profil de risque a un benchmark approprié pour la comparaison.
Cela permet une évaluation plus pertinente de la performance:
- Un profil Agressif vs QQQ (croissance tech)
- Un profil Modéré vs URTH (MSCI World)
- Un profil Stable vs AGG (obligations investment grade)

Rationale:
- Comparer un portefeuille obligataire au S&P 500 n'a pas de sens
- Le benchmark doit refléter l'univers d'investissement du profil
"""

from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class BenchmarkConfig:
    """Configuration d'un benchmark."""
    symbol: str
    name: str
    description: str
    asset_class: str  # "equity", "fixed_income", "balanced"
    rationale: str


# ============================================================================
# PROFILE BENCHMARKS - Mapping profil → benchmark approprié
# ============================================================================

PROFILE_BENCHMARKS: Dict[str, BenchmarkConfig] = {
    "Agressif": BenchmarkConfig(
        symbol="QQQ",
        name="Invesco QQQ Trust (Nasdaq-100)",
        description="ETF tracking the Nasdaq-100 Index (100 largest non-financial Nasdaq stocks)",
        asset_class="equity",
        rationale="Growth/tech heavy allocation matches aggressive equity exposure with tech tilt"
    ),
    "Modéré": BenchmarkConfig(
        symbol="URTH",
        name="iShares MSCI World ETF",
        description="ETF tracking the MSCI World Index (developed markets large/mid cap)",
        asset_class="equity",
        rationale="Global diversified equities benchmark for balanced risk profile"
    ),
    "Stable": BenchmarkConfig(
        symbol="AGG",
        name="iShares Core U.S. Aggregate Bond ETF",
        description="ETF tracking the Bloomberg U.S. Aggregate Bond Index",
        asset_class="fixed_income",
        rationale="Investment-grade bond benchmark for conservative/income-focused profile"
    ),
}

# Alternative benchmarks for secondary comparison
ALTERNATIVE_BENCHMARKS: Dict[str, List[BenchmarkConfig]] = {
    "Agressif": [
        BenchmarkConfig(
            symbol="SPY",
            name="SPDR S&P 500 ETF",
            description="ETF tracking S&P 500",
            asset_class="equity",
            rationale="Broad US equity market benchmark"
        ),
        BenchmarkConfig(
            symbol="VGT",
            name="Vanguard Information Technology ETF",
            description="ETF focused on tech sector",
            asset_class="equity",
            rationale="Pure tech sector exposure"
        ),
    ],
    "Modéré": [
        BenchmarkConfig(
            symbol="VT",
            name="Vanguard Total World Stock ETF",
            description="All-world equity exposure",
            asset_class="equity",
            rationale="Includes emerging markets"
        ),
        BenchmarkConfig(
            symbol="AOR",
            name="iShares Core Growth Allocation ETF",
            description="60/40 stocks/bonds allocation",
            asset_class="balanced",
            rationale="Classic balanced portfolio proxy"
        ),
    ],
    "Stable": [
        BenchmarkConfig(
            symbol="BND",
            name="Vanguard Total Bond Market ETF",
            description="Broad US bond market",
            asset_class="fixed_income",
            rationale="Alternative broad bond benchmark"
        ),
        BenchmarkConfig(
            symbol="IEF",
            name="iShares 7-10 Year Treasury Bond ETF",
            description="Intermediate Treasury bonds",
            asset_class="fixed_income",
            rationale="Government bond benchmark"
        ),
    ],
}

# Default benchmark for unknown profiles
DEFAULT_BENCHMARK = PROFILE_BENCHMARKS["Modéré"]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_benchmark_for_profile(profile: str) -> BenchmarkConfig:
    """
    Retourne le benchmark approprié pour un profil donné.
    
    Args:
        profile: Nom du profil ("Agressif", "Modéré", "Stable")
    
    Returns:
        BenchmarkConfig avec symbol, name, rationale, etc.
    """
    # Normaliser le nom du profil
    profile_normalized = profile.strip().title()
    
    # Mapping de synonymes
    profile_aliases = {
        "Aggressive": "Agressif",
        "Balanced": "Modéré",
        "Moderate": "Modéré",
        "Conservative": "Stable",
        "Défensif": "Stable",
        "Defensif": "Stable",
    }
    
    if profile_normalized in profile_aliases:
        profile_normalized = profile_aliases[profile_normalized]
    
    return PROFILE_BENCHMARKS.get(profile_normalized, DEFAULT_BENCHMARK)


def get_benchmark_symbol(profile: str) -> str:
    """Raccourci pour obtenir juste le symbole du benchmark."""
    return get_benchmark_for_profile(profile).symbol


def get_all_benchmark_symbols() -> List[str]:
    """
    Retourne tous les symboles de benchmark (primaires + alternatives).
    Utile pour le data_loader qui doit charger les prix de tous les benchmarks.
    """
    symbols = set()
    
    # Primary benchmarks
    for config in PROFILE_BENCHMARKS.values():
        symbols.add(config.symbol)
    
    # Alternative benchmarks
    for alternatives in ALTERNATIVE_BENCHMARKS.values():
        for config in alternatives:
            symbols.add(config.symbol)
    
    return sorted(list(symbols))


def get_benchmark_metadata(profile: str) -> Dict:
    """
    Retourne les métadonnées complètes du benchmark pour un profil.
    Format adapté pour inclusion dans portfolio_output.json.
    """
    config = get_benchmark_for_profile(profile)
    
    return {
        "symbol": config.symbol,
        "name": config.name,
        "description": config.description,
        "asset_class": config.asset_class,
        "rationale": config.rationale,
        "alternatives": [
            {
                "symbol": alt.symbol,
                "name": alt.name,
                "rationale": alt.rationale,
            }
            for alt in ALTERNATIVE_BENCHMARKS.get(profile, [])
        ]
    }


# ============================================================================
# VALIDATION
# ============================================================================

def validate_benchmark_availability(available_symbols: List[str], profile: str) -> Dict:
    """
    Vérifie si le benchmark (et alternatives) sont disponibles dans les données.
    
    Returns:
        Dict avec primary_available, alternatives_available, fallback_symbol
    """
    config = get_benchmark_for_profile(profile)
    alternatives = ALTERNATIVE_BENCHMARKS.get(profile, [])
    
    result = {
        "primary_symbol": config.symbol,
        "primary_available": config.symbol in available_symbols,
        "alternatives_available": [],
        "fallback_symbol": None,
    }
    
    for alt in alternatives:
        if alt.symbol in available_symbols:
            result["alternatives_available"].append(alt.symbol)
    
    # Déterminer le fallback
    if result["primary_available"]:
        result["fallback_symbol"] = config.symbol
    elif result["alternatives_available"]:
        result["fallback_symbol"] = result["alternatives_available"][0]
    else:
        # Fallback ultime: URTH (le plus liquide)
        result["fallback_symbol"] = "URTH" if "URTH" in available_symbols else None
    
    return result
