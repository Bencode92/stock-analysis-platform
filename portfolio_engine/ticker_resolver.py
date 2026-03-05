# portfolio_engine/ticker_resolver.py
"""
Ticker Resolution Module v1.0.0

Builds and manages symbol → mic_code / exchange / resolved_symbol mappings
from stock data JSON files. Used by historical_data.py and backtest/data_loader.py
to resolve non-US tickers (AGS→XBRU, 2360→XTAI, etc.)

The stock JSON files already contain:
  - data_mic: "XBRU", "XTAI", "XKRX", etc.
  - data_exchange: "Euronext", "TWSE", "KRX", etc.
  - resolved_symbol: the exact symbol that worked in JS enrichment

This module propagates that information to Python API calls.

Changelog:
- v1.0.0: Initial release
  - Build mappings from stocks_*.json
  - Support mic_code + exchange fallback
  - resolved_symbol takes priority over ticker
  - Cache invalidation for failed tickers
"""

import json
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

logger = logging.getLogger("portfolio_engine.ticker_resolver")

VERSION = "1.0.0"


class TickerResolver:
    """
    Resolves ticker symbols to their correct API parameters.
    
    Usage:
        resolver = TickerResolver.from_stock_files()
        
        # Get the best symbol + mic_code for API call
        symbol, mic, exchange = resolver.resolve("AGS")
        # → ("AGS", "XBRU", "Euronext")
        
        symbol, mic, exchange = resolver.resolve("2360")
        # → ("2360", "XTAI", "TWSE")
    """
    
    def __init__(self):
        self.mic_code_map: Dict[str, str] = {}
        self.exchange_map: Dict[str, str] = {}
        self.resolved_symbol_map: Dict[str, str] = {}
        self._loaded = False
    
    @classmethod
    def from_stock_files(cls, data_dir: str = "data") -> "TickerResolver":
        """Build resolver from stocks_us.json, stocks_europe.json, stocks_asia.json."""
        resolver = cls()
        resolver.load_from_files(data_dir)
        return resolver
    
    @classmethod
    def from_equities(cls, equities: list) -> "TickerResolver":
        """Build resolver from already-loaded equity dicts."""
        resolver = cls()
        resolver.load_from_equities(equities)
        return resolver
    
    def load_from_files(self, data_dir: str = "data") -> int:
        """Load mappings from stock JSON files. Returns number of tickers mapped."""
        count = 0
        stock_files = [
            Path(data_dir) / "stocks_us.json",
            Path(data_dir) / "stocks_europe.json",
            Path(data_dir) / "stocks_asia.json",
        ]
        
        for filepath in stock_files:
            if not filepath.exists():
                logger.debug(f"File not found: {filepath}")
                continue
            
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                stocks = data.get("stocks", [])
                for stock in stocks:
                    self._register_stock(stock)
                    count += 1
                
                logger.info(f"[TickerResolver] Loaded {len(stocks)} stocks from {filepath.name}")
            
            except Exception as e:
                logger.warning(f"[TickerResolver] Error loading {filepath}: {e}")
        
        self._loaded = True
        logger.info(
            f"[TickerResolver] Ready: {len(self.mic_code_map)} mic_codes, "
            f"{len(self.exchange_map)} exchanges, "
            f"{len(self.resolved_symbol_map)} resolved_symbols"
        )
        return count
    
    def load_from_equities(self, equities: list) -> int:
        """Load mappings from already-loaded equity dicts (from generate_portfolios_v4)."""
        count = 0
        for eq in equities:
            if isinstance(eq, dict):
                self._register_stock(eq)
                count += 1
        
        self._loaded = True
        logger.info(
            f"[TickerResolver] Built from {count} equities: "
            f"{len(self.mic_code_map)} mic_codes, "
            f"{len(self.exchange_map)} exchanges, "
            f"{len(self.resolved_symbol_map)} resolved_symbols"
        )
        return count
    
    def _register_stock(self, stock: dict):
        """Register a single stock's resolution data."""
        ticker = stock.get("ticker")
        if not ticker:
            return
        
        ticker_upper = ticker.upper().strip()
        
        # mic_code (e.g., "XBRU", "XTAI")
        mic = stock.get("data_mic")
        if mic:
            self.mic_code_map[ticker] = mic
            self.mic_code_map[ticker_upper] = mic
        
        # exchange (e.g., "Euronext", "TWSE")
        exchange = stock.get("data_exchange")
        if exchange:
            self.exchange_map[ticker] = exchange
            self.exchange_map[ticker_upper] = exchange
        
        # resolved_symbol (the symbol that actually worked in JS enrichment)
        resolved = stock.get("resolved_symbol")
        if resolved and resolved != ticker:
            self.resolved_symbol_map[ticker] = resolved
            self.resolved_symbol_map[ticker_upper] = resolved
    
    def resolve(self, ticker: str) -> Tuple[str, Optional[str], Optional[str]]:
        """
        Resolve a ticker to its best API parameters.
        
        Args:
            ticker: Raw ticker symbol (e.g., "AGS", "2360")
        
        Returns:
            (symbol, mic_code, exchange) where:
            - symbol: resolved_symbol if available, else original ticker
            - mic_code: MIC code for API (e.g., "XBRU") or None
            - exchange: Exchange name for API fallback (e.g., "Euronext") or None
        """
        ticker_clean = ticker.strip()
        ticker_upper = ticker_clean.upper()
        
        # 1. Use resolved_symbol if available (handles cross-listings)
        symbol = self.resolved_symbol_map.get(ticker_clean) or \
                 self.resolved_symbol_map.get(ticker_upper) or \
                 ticker_clean
        
        # 2. Get mic_code
        mic = self.mic_code_map.get(ticker_clean) or \
              self.mic_code_map.get(ticker_upper) or \
              self.mic_code_map.get(symbol)
        
        # 3. Get exchange (fallback)
        exchange = self.exchange_map.get(ticker_clean) or \
                   self.exchange_map.get(ticker_upper) or \
                   self.exchange_map.get(symbol)
        
        return symbol, mic, exchange
    
    def get_mic(self, ticker: str) -> Optional[str]:
        """Quick lookup: ticker → mic_code."""
        return self.mic_code_map.get(ticker) or self.mic_code_map.get(ticker.upper())
    
    def get_exchange(self, ticker: str) -> Optional[str]:
        """Quick lookup: ticker → exchange."""
        return self.exchange_map.get(ticker) or self.exchange_map.get(ticker.upper())
    
    def get_resolved_symbol(self, ticker: str) -> str:
        """Quick lookup: ticker → resolved_symbol (returns ticker if not mapped)."""
        return self.resolved_symbol_map.get(ticker) or \
               self.resolved_symbol_map.get(ticker.upper()) or \
               ticker
    
    def invalidate_cache_for(self, tickers: list, cache_dir: str = "data/returns_cache"):
        """Delete cached return files for specific tickers (after fix deployment)."""
        cache_path = Path(cache_dir)
        if not cache_path.exists():
            return
        
        deleted = 0
        for ticker in tickers:
            safe_name = ticker.upper().replace("/", "_").replace("\\", "_")
            cache_file = cache_path / f"{safe_name}.json"
            if cache_file.exists():
                cache_file.unlink()
                deleted += 1
                logger.info(f"[TickerResolver] Cache invalidated: {ticker}")
        
        if deleted:
            logger.info(f"[TickerResolver] Invalidated {deleted} cache entries")
    
    def summary(self) -> dict:
        """Return summary stats for debugging."""
        return {
            "version": VERSION,
            "loaded": self._loaded,
            "n_mic_codes": len(self.mic_code_map),
            "n_exchanges": len(self.exchange_map),
            "n_resolved_symbols": len(self.resolved_symbol_map),
            "sample_mic": dict(list(self.mic_code_map.items())[:5]),
            "sample_resolved": dict(list(self.resolved_symbol_map.items())[:5]),
        }


# Singleton for easy access
_GLOBAL_RESOLVER: Optional[TickerResolver] = None


def get_resolver(data_dir: str = "data") -> TickerResolver:
    """Get or create the global TickerResolver singleton."""
    global _GLOBAL_RESOLVER
    if _GLOBAL_RESOLVER is None or not _GLOBAL_RESOLVER._loaded:
        _GLOBAL_RESOLVER = TickerResolver.from_stock_files(data_dir)
    return _GLOBAL_RESOLVER


def set_resolver(resolver: TickerResolver):
    """Set the global resolver (used by generate_portfolios_v4.py)."""
    global _GLOBAL_RESOLVER
    _GLOBAL_RESOLVER = resolver
