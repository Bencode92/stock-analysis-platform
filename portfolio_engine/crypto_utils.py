# portfolio_engine/crypto_utils.py
"""
Utilitaires crypto v1.0.0 — Parsing robuste des paires et filtrage devise.

FONCTIONNALITÉS:
- parse_crypto_pair(): Parse BTC/USD, BTC-USD, BTCUSD, BTC:USD, etc.
- is_allowed_quote(): Valide la devise de cotation
- find_crypto_by_base(): Recherche flexible par base currency (BTC, ETH)

PHILOSOPHIE:
- Portefeuille EUR → autoriser /EUR et stablecoins
- Portefeuille USD → autoriser /USD et stablecoins
- Le filtre est configurable selon la devise de base
"""

import re
import logging
from typing import Optional, Tuple, Set, List, Any

logger = logging.getLogger("portfolio_engine.crypto_utils")

# ============= CONFIGURATION DEVISES =============

# Stablecoins toujours autorisés (proxy USD)
STABLECOINS = {"USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "GUSD", "FRAX"}

# Devises fiat autorisées par base portefeuille
ALLOWED_QUOTES_BY_BASE = {
    "EUR": {"EUR"} | STABLECOINS | {"USD"},  # EUR base: EUR + stables + USD
    "USD": {"USD"} | STABLECOINS,              # USD base: USD + stables only
}

# Valeur par défaut si non spécifié
DEFAULT_PORTFOLIO_BASE = "EUR"  # Configurable


# ============= PARSING PAIRES CRYPTO =============

def parse_crypto_pair(text: str) -> Optional[Tuple[str, str]]:
    """
    Parse une paire crypto et retourne (base, quote).
    
    Formats supportés:
    - BTC/USD, ETH/EUR (séparateur /)
    - BTC-USD, ETH-EUR (séparateur -)
    - BTC_USD (séparateur _)
    - BTC:USD (séparateur :)
    - BTCUSD, ETHUSD (concaténé, détection par suffix)
    - BTCUSDTPERP, ETHBUSD (avec suffixes PERP/FUT/SWAP)
    
    Returns:
        (base, quote) tuple ou None si non parsable
        
    Examples:
        >>> parse_crypto_pair("BTC/USD")
        ('BTC', 'USD')
        >>> parse_crypto_pair("XMR-EUR")
        ('XMR', 'EUR')
        >>> parse_crypto_pair("BTCUSDT")
        ('BTC', 'USDT')
    """
    if not text:
        return None
    
    s = str(text).upper().strip()
    
    # Nettoyer les suffixes de produits dérivés
    s = re.sub(r"[-_]?(PERP|PERPETUAL|FUT|FUTURE|SWAP|SPOT|INDEX)$", "", s)
    
    # Méthode 1: Séparateurs explicites
    for sep in ["/", "-", "_", ":"]:
        if sep in s:
            parts = [p.strip() for p in s.split(sep) if p.strip()]
            if len(parts) >= 2:
                base = parts[0]
                quote = parts[1]
                # Nettoyer les suffixes restants sur quote
                quote = re.sub(r"(PERP|FUT|SWAP)$", "", quote)
                if base and quote:
                    return base, quote
    
    # Méthode 2: Formats concaténés - suffix matching
    # Ordre de priorité: plus long d'abord (USDT avant USD)
    known_quotes = sorted(
        STABLECOINS | {"USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "BTC", "ETH"},
        key=len,
        reverse=True
    )
    
    for quote in known_quotes:
        if s.endswith(quote) and len(s) > len(quote):
            base = s[:-len(quote)]
            # Éviter les faux positifs (ex: "USD" seul)
            if len(base) >= 2:
                return base, quote
    
    return None


def get_quote_currency(symbol_or_id: str) -> Optional[str]:
    """
    Extrait la devise de cotation d'un symbole.
    
    Returns:
        Quote currency (USD, EUR, USDT, etc.) ou None si non parsable
    """
    pair = parse_crypto_pair(symbol_or_id)
    if pair:
        return pair[1]
    return None


def get_base_currency(symbol_or_id: str) -> Optional[str]:
    """
    Extrait la crypto de base d'un symbole.
    
    Returns:
        Base currency (BTC, ETH, etc.) ou None si non parsable
    """
    pair = parse_crypto_pair(symbol_or_id)
    if pair:
        return pair[0]
    return None


# ============= FILTRAGE DEVISE =============

def is_allowed_quote(
    symbol_or_id: str, 
    portfolio_base: str = DEFAULT_PORTFOLIO_BASE,
    strict: bool = True
) -> bool:
    """
    Vérifie si la devise de cotation est autorisée.
    
    Args:
        symbol_or_id: Symbole ou ID de la paire (ex: "BTC/USD", "XMREUR")
        portfolio_base: Devise de base du portefeuille ("EUR" ou "USD")
        strict: Si True, filtre les paires non parsables. Si False, les laisse passer.
    
    Returns:
        True si autorisé, False sinon
    """
    pair = parse_crypto_pair(symbol_or_id)
    
    if not pair:
        # Non parsable
        if strict:
            logger.debug(f"Crypto filtrée (non parsable): {symbol_or_id}")
            return False
        return True  # Laisser passer en mode non-strict
    
    _, quote = pair
    allowed = ALLOWED_QUOTES_BY_BASE.get(portfolio_base.upper(), ALLOWED_QUOTES_BY_BASE["EUR"])
    
    if quote not in allowed:
        logger.debug(f"Crypto filtrée (quote={quote} not in {allowed}): {symbol_or_id}")
        return False
    
    return True


def crypto_quote_filter(
    row: dict, 
    portfolio_base: str = DEFAULT_PORTFOLIO_BASE,
    logger_instance = None
) -> bool:
    """
    Filtre une ligne crypto par devise de cotation.
    
    Logique:
    1. Si currency_quote présent et non vide → utiliser directement
    2. Sinon → parser symbol/id/ticker
    3. Si non parsable → FILTRER (strict par défaut)
    
    Args:
        row: Dict avec les données crypto
        portfolio_base: Devise de base du portefeuille
        logger_instance: Logger optionnel
    
    Returns:
        True si la crypto passe le filtre, False sinon
    """
    log = logger_instance or logger
    
    # Méthode 1: currency_quote si présent et non vide
    cq = str(row.get("currency_quote", "") or "").upper().strip()
    if cq:
        allowed = ALLOWED_QUOTES_BY_BASE.get(portfolio_base.upper(), ALLOWED_QUOTES_BY_BASE["EUR"])
        # Normaliser "US DOLLAR" → "USD"
        if cq == "US DOLLAR":
            cq = "USD"
        if cq not in allowed:
            log.debug(f"Crypto filtrée (currency_quote={cq}): {row.get('symbol')}")
            return False
        return True
    
    # Méthode 2: Parser symbol/id/ticker
    for key in ["symbol", "id", "ticker"]:
        val = row.get(key)
        if val:
            if is_allowed_quote(str(val), portfolio_base, strict=True):
                return True
            else:
                return False  # Filtré par is_allowed_quote
    
    # Aucun identifiant trouvé → filtrer par sécurité
    log.debug(f"Crypto filtrée (aucun identifiant): {row}")
    return False


# ============= RECHERCHE FLEXIBLE CORE ASSETS =============

def find_crypto_by_base(
    candidates: List[Any],
    base_currency: str,
    portfolio_base: str = DEFAULT_PORTFOLIO_BASE
) -> Optional[Any]:
    """
    Recherche un actif crypto par sa devise de base (BTC, ETH, etc.).
    
    Matching flexible: trouve BTC peu importe le format (BTC/USD, BTC-EUR, BTCUSDT, etc.)
    
    Args:
        candidates: Liste d'objets Asset avec .id, .symbol, .ticker, .category
        base_currency: Crypto recherchée (ex: "BTC", "ETH")
        portfolio_base: Devise de base pour valider la quote
    
    Returns:
        L'Asset trouvé ou None
    """
    base_upper = base_currency.upper()
    
    for c in candidates:
        # Vérifier que c'est bien une crypto
        if getattr(c, 'category', '') != "Crypto":
            continue
        
        # Essayer id, symbol, ticker
        for attr in ['id', 'symbol', 'ticker']:
            val = getattr(c, attr, None)
            if not val:
                continue
            
            pair = parse_crypto_pair(str(val))
            if not pair:
                continue
            
            parsed_base, parsed_quote = pair
            
            # Vérifier que la base match ET que la quote est autorisée
            if parsed_base == base_upper:
                if is_allowed_quote(str(val), portfolio_base, strict=True):
                    logger.debug(f"find_crypto_by_base: Found {base_currency} → {val}")
                    return c
    
    logger.warning(f"find_crypto_by_base: {base_currency} NOT FOUND in {len(candidates)} candidates")
    return None


def find_all_cryptos_by_base(
    candidates: List[Any],
    base_currency: str,
    portfolio_base: str = DEFAULT_PORTFOLIO_BASE
) -> List[Any]:
    """
    Trouve TOUTES les variantes d'une crypto (ex: BTC/USD, BTC/EUR, BTCUSDT).
    
    Utile pour debug ou déduplication.
    """
    base_upper = base_currency.upper()
    results = []
    
    for c in candidates:
        if getattr(c, 'category', '') != "Crypto":
            continue
        
        for attr in ['id', 'symbol', 'ticker']:
            val = getattr(c, attr, None)
            if not val:
                continue
            
            pair = parse_crypto_pair(str(val))
            if pair and pair[0] == base_upper:
                results.append(c)
                break  # Éviter les doublons si plusieurs attrs matchent
    
    return results


# ============= DEBUG UTILITIES =============

def debug_crypto_universe(rows: List[dict]) -> dict:
    """
    Analyse l'univers crypto pour debug.
    
    Returns:
        Dict avec stats et samples
    """
    crypto_rows = [
        r for r in rows 
        if str(r.get("category", "")).lower() in ["crypto", "cryptocurrency"]
    ]
    
    samples = []
    parsed_bases = set()
    parsed_quotes = set()
    unparsable = []
    
    for r in crypto_rows:
        symbol = r.get("symbol") or r.get("id") or r.get("ticker")
        pair = parse_crypto_pair(str(symbol)) if symbol else None
        
        sample = {
            "id": r.get("id"),
            "ticker": r.get("ticker"),
            "symbol": r.get("symbol"),
            "currency_quote": r.get("currency_quote"),
            "parsed": pair,
        }
        samples.append(sample)
        
        if pair:
            parsed_bases.add(pair[0])
            parsed_quotes.add(pair[1])
        else:
            unparsable.append(symbol)
    
    # Chercher BTC et ETH
    btc_variants = [s for s in samples if s.get("parsed") and s["parsed"][0] == "BTC"]
    eth_variants = [s for s in samples if s.get("parsed") and s["parsed"][0] == "ETH"]
    
    return {
        "total_crypto": len(crypto_rows),
        "unique_bases": sorted(parsed_bases),
        "unique_quotes": sorted(parsed_quotes),
        "unparsable_count": len(unparsable),
        "unparsable_samples": unparsable[:10],
        "btc_variants": btc_variants,
        "eth_variants": eth_variants,
        "has_btc": len(btc_variants) > 0,
        "has_eth": len(eth_variants) > 0,
        "samples": samples[:30],
    }


# ============= TESTS =============

if __name__ == "__main__":
    # Tests parsing
    test_cases = [
        "BTC/USD", "ETH/EUR", "XMR-EUR", "BCH_USD", "BTC:USDT",
        "BTCUSD", "ETHUSDT", "XRPBUSD", "BTCUSDTPERP", "SOLEUR",
        "BTC", "USD", "", None, "WBTC/USD", "BTCB/BUSD"
    ]
    
    print("=== PARSING TESTS ===")
    for tc in test_cases:
        result = parse_crypto_pair(tc)
        print(f"  {tc!r:20} → {result}")
    
    print("\n=== QUOTE FILTER TESTS (base=EUR) ===")
    for tc in test_cases:
        if tc:
            allowed = is_allowed_quote(tc, "EUR")
            print(f"  {tc!r:20} → {'✅' if allowed else '❌'}")
    
    print("\n=== QUOTE FILTER TESTS (base=USD) ===")
    for tc in ["BTC/USD", "BTC/EUR", "ETH/USDT", "XMR/EUR"]:
        allowed = is_allowed_quote(tc, "USD")
        print(f"  {tc!r:20} → {'✅' if allowed else '❌'}")
    
    print("\n✅ crypto_utils.py tests completed")
