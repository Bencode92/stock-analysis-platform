# portfolio_engine/trade_generator.py
"""
Générateur de trades pour passer du portefeuille actuel au portefeuille cible.

S'intègre avec optimizer.py et les données de combined_snapshot.json.
Génère une liste d'ordres priorisés avec contrainte de turnover.

Usage:
    python -m portfolio_engine.trade_generator
"""

from dataclasses import dataclass, asdict, field
from typing import Dict, List, Literal, Optional
from pathlib import Path
from datetime import datetime
import json
import logging

logger = logging.getLogger("portfolio_engine.trade_generator")


# ============ DATA MODELS ============

@dataclass
class Position:
    """Position actuelle dans le portefeuille."""
    ticker: str
    weight: float       # 0-1 (fraction du portefeuille)
    price: float        # Prix actuel
    quantity: float     # Nombre de titres
    value: float = 0.0  # weight * NAV (calculé)
    
    def __post_init__(self):
        if self.value == 0 and self.price > 0:
            self.value = self.quantity * self.price


@dataclass  
class Trade:
    """Ordre à exécuter."""
    ticker: str
    side: Literal["BUY", "SELL"]
    weight_from: float
    weight_to: float
    delta_weight: float
    target_value: float      # Montant à acheter/vendre
    target_quantity: float   # Nombre de titres
    priority: int            # 0=exit, 1=trim, 2=buy
    reason: str = ""         # Explication du trade


@dataclass
class TradeReport:
    """Rapport de génération de trades."""
    generated_at: str
    nav: float
    profile: str
    total_trades: int
    total_buy_value: float
    total_sell_value: float
    net_cash_flow: float
    total_turnover_pct: float
    trades: List[Dict]
    warnings: List[str] = field(default_factory=list)


# ============ LOADERS ============

def load_current_portfolio(
    path: Path = Path("data/current_portfolio.json")
) -> Dict[str, Position]:
    """
    Charge le portefeuille actuel depuis un fichier JSON.
    
    Format attendu:
    {
        "as_of": "2025-12-08",
        "nav": 100000,
        "positions": [
            {"ticker": "AAPL", "weight": 0.08, "quantity": 35, "price": 229.50}
        ]
    }
    """
    if not path.exists():
        logger.warning(f"No current portfolio found at {path}, assuming empty")
        return {}
    
    with open(path) as f:
        data = json.load(f)
    
    positions = {}
    for item in data.get("positions", []):
        ticker = item.get("ticker") or item.get("symbol")
        if not ticker:
            continue
            
        positions[ticker] = Position(
            ticker=ticker,
            weight=item.get("weight", 0),
            price=item.get("price", 0),
            quantity=item.get("quantity", 0),
            value=item.get("value", 0),
        )
    
    logger.info(f"Loaded {len(positions)} positions from {path}")
    return positions


def load_prices_from_snapshot(
    path: Path = Path("data/combined_snapshot.json")
) -> Dict[str, float]:
    """
    Extrait les prix actuels depuis combined_snapshot.json.
    
    Parcourt toutes les catégories (equities, etfs, crypto, bonds).
    """
    if not path.exists():
        logger.error(f"Snapshot not found: {path}")
        return {}
    
    with open(path) as f:
        data = json.load(f)
    
    prices = {}
    
    # Parcourir toutes les catégories possibles
    categories = ["equities", "etfs", "crypto", "bonds", "stocks", "assets"]
    
    for category in categories:
        items = data.get(category, [])
        if isinstance(items, dict):
            # Si c'est un dict avec des sous-catégories (ex: equities.us, equities.eu)
            for sub_key, sub_items in items.items():
                if isinstance(sub_items, list):
                    for item in sub_items:
                        _extract_price(item, prices)
        elif isinstance(items, list):
            for item in items:
                _extract_price(item, prices)
    
    logger.info(f"Loaded {len(prices)} prices from {path}")
    return prices


def _extract_price(item: dict, prices: Dict[str, float]):
    """Helper pour extraire le prix d'un item."""
    if not isinstance(item, dict):
        return
        
    ticker = (
        item.get("symbol") or 
        item.get("ticker") or 
        item.get("id") or
        item.get("name")
    )
    
    price = (
        item.get("price") or 
        item.get("last_close") or 
        item.get("close") or
        item.get("current_price")
    )
    
    if ticker and price:
        try:
            prices[ticker] = float(price)
        except (ValueError, TypeError):
            pass


def load_target_weights(
    path: Path = Path("data/portfolios.json"),
    profile: str = "Modéré"
) -> Dict[str, float]:
    """
    Charge les poids cibles depuis portfolios.json.
    
    Format attendu (output de generate_portfolios_v4.py):
    {
        "generated_at": "...",
        "portfolios": {
            "Modéré": {
                "weights": {"AAPL": 0.08, "MSFT": 0.07, ...}
            }
        }
    }
    """
    if not path.exists():
        logger.error(f"Portfolios file not found: {path}")
        return {}
    
    with open(path) as f:
        data = json.load(f)
    
    portfolios = data.get("portfolios", data)
    
    if profile not in portfolios:
        available = list(portfolios.keys())
        logger.error(f"Profile '{profile}' not found. Available: {available}")
        return {}
    
    profile_data = portfolios[profile]
    
    # Support différents formats
    if "weights" in profile_data:
        weights = profile_data["weights"]
    elif "assets" in profile_data:
        # Format avec liste d'assets
        weights = {
            a.get("symbol", a.get("ticker")): a.get("weight", 0)
            for a in profile_data["assets"]
            if a.get("symbol") or a.get("ticker")
        }
    else:
        weights = profile_data
    
    # Normaliser (s'assurer que ça somme à 1)
    total = sum(weights.values())
    if total > 0 and abs(total - 1.0) > 0.01:
        weights = {k: v / total for k, v in weights.items()}
    
    logger.info(f"Loaded {len(weights)} target weights for profile '{profile}'")
    return weights


# ============ TRADE GENERATOR ============

def compute_trades(
    current: Dict[str, Position],
    target_weights: Dict[str, float],
    nav: float,
    prices: Dict[str, float],
    max_turnover: float = 0.25,
    min_trade_weight: float = 0.005,
    min_notional: float = 100.0
) -> List[Trade]:
    """
    Génère les ordres pour passer de current → target.
    
    Args:
        current: Positions actuelles {ticker: Position}
        target_weights: Poids cibles {ticker: weight} (sortie de optimizer.py)
        nav: Valeur totale du portefeuille
        prices: Prix actuels {ticker: price}
        max_turnover: % max du portefeuille à bouger (0.25 = 25%)
        min_trade_weight: Ignorer les ajustements < 0.5%
        min_notional: Ticket minimum en €/$
    
    Returns:
        Liste de Trade ordonnée par priorité
    """
    trades: List[Trade] = []
    deltas = []
    warnings = []
    
    all_tickers = set(current.keys()) | set(target_weights.keys())
    
    # 1) Calculer tous les deltas
    for ticker in all_tickers:
        w_cur = current.get(ticker, Position(ticker, 0, 0, 0)).weight
        w_tgt = target_weights.get(ticker, 0.0)
        delta = w_tgt - w_cur
        
        if abs(delta) < min_trade_weight:
            continue
        
        # Déterminer la priorité et la raison
        if w_tgt == 0 and w_cur > 0:
            priority = 0  # EXIT - sortir complètement
            reason = "Exit position (not in target)"
        elif w_cur > w_tgt:
            priority = 1  # TRIM - réduire la position
            reason = f"Trim from {w_cur*100:.1f}% to {w_tgt*100:.1f}%"
        elif w_cur == 0:
            priority = 2  # NEW - nouvelle position
            reason = f"New position at {w_tgt*100:.1f}%"
        else:
            priority = 2  # ADD - renforcement
            reason = f"Add from {w_cur*100:.1f}% to {w_tgt*100:.1f}%"
        
        deltas.append({
            "ticker": ticker,
            "w_cur": w_cur,
            "w_tgt": w_tgt,
            "delta": delta,
            "priority": priority,
            "reason": reason,
        })
    
    # 2) Trier par priorité (exits d'abord, puis trims, puis buys)
    # À priorité égale, trier par magnitude décroissante
    deltas.sort(key=lambda x: (x["priority"], -abs(x["delta"])))
    
    # 3) Appliquer sous contrainte de turnover
    used_turnover = 0.0
    
    for d in deltas:
        ticker = d["ticker"]
        delta = d["delta"]
        w_cur = d["w_cur"]
        w_tgt = d["w_tgt"]
        
        # Vérifier budget turnover
        turnover_needed = abs(delta)
        if used_turnover + turnover_needed > max_turnover:
            remaining = max_turnover - used_turnover
            if remaining <= min_trade_weight:
                logger.info(f"Turnover budget exhausted ({used_turnover*100:.1f}%), stopping")
                break
            # Clipper l'ajustement
            delta = remaining if delta > 0 else -remaining
            w_tgt = w_cur + delta
            d["reason"] += f" (clipped by turnover limit)"
        
        # Vérifier montant minimum
        notional = abs(delta) * nav
        if notional < min_notional:
            continue
        
        # Calculer quantité
        price = prices.get(ticker, 0)
        if price <= 0:
            # Essayer de récupérer depuis la position actuelle
            if ticker in current and current[ticker].price > 0:
                price = current[ticker].price
            else:
                logger.warning(f"No price for {ticker}, skipping")
                continue
        
        quantity = notional / price
        
        trades.append(Trade(
            ticker=ticker,
            side="BUY" if delta > 0 else "SELL",
            weight_from=w_cur,
            weight_to=w_tgt,
            delta_weight=delta,
            target_value=round(notional, 2),
            target_quantity=round(quantity, 4),
            priority=d["priority"],
            reason=d["reason"],
        ))
        
        used_turnover += abs(delta)
    
    logger.info(f"Generated {len(trades)} trades, total turnover: {used_turnover*100:.1f}%")
    return trades


def generate_trade_report(
    trades: List[Trade],
    nav: float,
    profile: str = "Modéré",
    output_path: Optional[Path] = None
) -> TradeReport:
    """
    Génère un rapport de trades et le sauvegarde optionnellement.
    
    Args:
        trades: Liste des trades générés
        nav: Valeur liquidative du portefeuille
        profile: Nom du profil
        output_path: Chemin de sauvegarde (optionnel)
    
    Returns:
        TradeReport avec statistiques
    """
    total_buy = sum(t.target_value for t in trades if t.side == "BUY")
    total_sell = sum(t.target_value for t in trades if t.side == "SELL")
    total_turnover = sum(abs(t.delta_weight) for t in trades) / 2  # One-way turnover
    
    report = TradeReport(
        generated_at=datetime.now().isoformat(),
        nav=nav,
        profile=profile,
        total_trades=len(trades),
        total_buy_value=round(total_buy, 2),
        total_sell_value=round(total_sell, 2),
        net_cash_flow=round(total_sell - total_buy, 2),
        total_turnover_pct=round(total_turnover * 100, 2),
        trades=[asdict(t) for t in trades],
    )
    
    # Sauvegarder si chemin fourni
    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w") as f:
            json.dump(asdict(report), f, indent=2, default=str)
        
        logger.info(f"Trade report saved to {output_path}")
    
    return report


def print_trade_report(report: TradeReport):
    """Affiche un rapport de trades formaté."""
    print("\n" + "="*70)
    print("📋 TRADE GENERATION REPORT")
    print("="*70)
    
    print(f"\nProfile: {report.profile}")
    print(f"NAV: ${report.nav:,.2f}")
    print(f"Generated: {report.generated_at}")
    
    print("\n--- Summary ---")
    print(f"Total Trades:     {report.total_trades:>8}")
    print(f"Buy Value:        ${report.total_buy_value:>12,.2f}")
    print(f"Sell Value:       ${report.total_sell_value:>12,.2f}")
    print(f"Net Cash Flow:    ${report.net_cash_flow:>12,.2f}")
    print(f"Turnover:         {report.total_turnover_pct:>8.1f}%")
    
    if report.trades:
        print("\n--- Trades (by priority) ---")
        print(f"{'Side':<6} {'Ticker':<8} {'From':>7} {'To':>7} {'Value':>12} {'Reason'}")
        print("-" * 70)
        
        for t in report.trades:
            print(
                f"{t['side']:<6} "
                f"{t['ticker']:<8} "
                f"{t['weight_from']*100:>6.1f}% "
                f"{t['weight_to']*100:>6.1f}% "
                f"${t['target_value']:>10,.2f}  "
                f"{t['reason'][:30]}"
            )
    
    if report.warnings:
        print("\n⚠️  Warnings:")
        for w in report.warnings:
            print(f"  - {w}")
    
    print("\n" + "="*70)


# ============ MAIN ============

def main():
    """
    Point d'entrée principal.
    
    Usage:
        python -m portfolio_engine.trade_generator
        python -m portfolio_engine.trade_generator --profile Agressif
        python -m portfolio_engine.trade_generator --nav 150000
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate trades from current to target portfolio")
    parser.add_argument("--profile", type=str, default="Modéré", help="Target profile")
    parser.add_argument("--nav", type=float, default=None, help="Portfolio NAV (overrides current_portfolio.json)")
    parser.add_argument("--max-turnover", type=float, default=0.25, help="Max turnover (0-1)")
    parser.add_argument("--min-trade", type=float, default=100.0, help="Min trade notional")
    parser.add_argument("--output", type=str, default="data/trades_to_execute.json", help="Output path")
    parser.add_argument("--current-portfolio", type=str, default="data/current_portfolio.json")
    parser.add_argument("--target-portfolio", type=str, default="data/portfolios.json")
    parser.add_argument("--snapshot", type=str, default="data/combined_snapshot.json")
    
    args = parser.parse_args()
    
    # Configuration logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    print(f"\n🔄 Generating trades for profile: {args.profile}")
    print("-" * 50)
    
    # 1) Charger le portefeuille actuel
    current = load_current_portfolio(Path(args.current_portfolio))
    
    # 2) Charger les poids cibles
    target_weights = load_target_weights(Path(args.target_portfolio), args.profile)
    
    if not target_weights:
        print("❌ No target weights found. Run generate_portfolios_v4.py first.")
        return
    
    # 3) Charger les prix
    prices = load_prices_from_snapshot(Path(args.snapshot))
    
    # 4) Déterminer le NAV
    if args.nav:
        nav = args.nav
    elif current:
        # Calculer depuis les positions actuelles
        nav = sum(p.value for p in current.values())
        if nav <= 0:
            nav = sum(p.quantity * p.price for p in current.values())
    else:
        # NAV par défaut
        nav = 100000.0
        print(f"⚠️  Using default NAV: ${nav:,.2f}")
    
    print(f"📊 Current NAV: ${nav:,.2f}")
    print(f"📊 Current positions: {len(current)}")
    print(f"📊 Target positions: {len(target_weights)}")
    
    # 5) Générer les trades
    trades = compute_trades(
        current=current,
        target_weights=target_weights,
        nav=nav,
        prices=prices,
        max_turnover=args.max_turnover,
        min_notional=args.min_trade,
    )
    
    # 6) Générer le rapport
    report = generate_trade_report(
        trades=trades,
        nav=nav,
        profile=args.profile,
        output_path=Path(args.output),
    )
    
    # 7) Afficher
    print_trade_report(report)
    
    print(f"\n✅ Trades saved to: {args.output}")


if __name__ == "__main__":
    main()
