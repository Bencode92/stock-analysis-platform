# utils/stable_sort.py
"""
Stable Sort Utility — P1-10
===========================

Provides deterministic sorting for assets with tie-breaking.

Problem:
    When two assets have the same score, Python's sorted() may return
    different orderings between runs (depending on input order).
    This breaks P1-5 DETERMINISTIC mode which requires consistent hashes.

Solution:
    Use a composite sort key: (-score, id)
    - Primary: score descending (highest first)
    - Secondary: id ascending (alphabetical tie-breaker)

Example:
    Before (unstable):
        Run 1: [{"id": "AAPL", "score": 85}, {"id": "MSFT", "score": 85}]
        Run 2: [{"id": "MSFT", "score": 85}, {"id": "AAPL", "score": 85}]
    
    After (stable):
        Run 1: [{"id": "AAPL", "score": 85}, {"id": "MSFT", "score": 85}]
        Run 2: [{"id": "AAPL", "score": 85}, {"id": "MSFT", "score": 85}]
        (AAPL < MSFT alphabetically → always first when scores equal)
"""

from typing import List, Dict, Any, Optional, Callable


def stable_sort_assets(
    assets: List[Dict[str, Any]],
    score_key: str = "composite_score",
    id_key: str = "symbol",
    reverse_score: bool = True,
    fallback_id_keys: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Sort assets by score with deterministic tie-breaking by ID.
    
    Args:
        assets: List of asset dictionaries to sort
        score_key: Key for the score field (default: "composite_score")
        id_key: Primary key for tie-breaking (default: "symbol")
        reverse_score: If True, highest scores first (default: True)
        fallback_id_keys: Fallback keys if id_key not found (default: ["id", "ticker", "isin"])
    
    Returns:
        Sorted list (new list, original unchanged)
    
    Example:
        >>> assets = [
        ...     {"symbol": "MSFT", "composite_score": 85.0},
        ...     {"symbol": "AAPL", "composite_score": 85.0},
        ...     {"symbol": "GOOGL", "composite_score": 90.0},
        ... ]
        >>> sorted_assets = stable_sort_assets(assets)
        >>> [a["symbol"] for a in sorted_assets]
        ['GOOGL', 'AAPL', 'MSFT']  # GOOGL first (90 > 85), then AAPL < MSFT
    """
    if fallback_id_keys is None:
        fallback_id_keys = ["id", "ticker", "isin", "name"]
    
    def get_id(asset: Dict[str, Any]) -> str:
        """Extract ID with fallback chain."""
        # Try primary key
        if id_key in asset and asset[id_key]:
            return str(asset[id_key])
        
        # Try fallbacks
        for key in fallback_id_keys:
            if key in asset and asset[key]:
                return str(asset[key])
        
        # Ultimate fallback: hash of asset
        return str(hash(frozenset(
            (k, str(v)) for k, v in asset.items() 
            if isinstance(v, (str, int, float, bool, type(None)))
        )))
    
    def sort_key(asset: Dict[str, Any]) -> tuple:
        """Composite sort key: (-score, id) for desc score + asc id."""
        score = asset.get(score_key, 0)
        if score is None:
            score = 0
        
        # Convert to float safely
        try:
            score_float = float(score)
        except (TypeError, ValueError):
            score_float = 0.0
        
        # Negate score if reverse (for descending order)
        score_component = -score_float if reverse_score else score_float
        
        # ID component (always ascending for tie-break)
        id_component = get_id(asset).lower()  # Case-insensitive
        
        return (score_component, id_component)
    
    return sorted(assets, key=sort_key)


def stable_sort_by_key(
    items: List[Dict[str, Any]],
    primary_key: str,
    tiebreaker_key: str,
    reverse_primary: bool = True,
) -> List[Dict[str, Any]]:
    """
    Generic stable sort with explicit primary and tie-breaker keys.
    
    Args:
        items: List of dictionaries to sort
        primary_key: Key for primary sort
        tiebreaker_key: Key for tie-breaking (always ascending)
        reverse_primary: If True, sort primary descending
    
    Returns:
        Sorted list
    """
    def sort_key(item: Dict[str, Any]) -> tuple:
        primary = item.get(primary_key, 0)
        if primary is None:
            primary = 0
        try:
            primary_float = float(primary)
        except (TypeError, ValueError):
            primary_float = 0.0
        
        tiebreaker = str(item.get(tiebreaker_key, "")).lower()
        
        primary_component = -primary_float if reverse_primary else primary_float
        return (primary_component, tiebreaker)
    
    return sorted(items, key=sort_key)


# Convenience functions for common use cases

def sort_by_score(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort by 'score' field, tie-break by 'symbol'."""
    return stable_sort_assets(assets, score_key="score", id_key="symbol")


def sort_by_composite_score(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort by 'composite_score' field, tie-break by 'symbol'."""
    return stable_sort_assets(assets, score_key="composite_score", id_key="symbol")


def sort_by_buffett_score(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort by 'buffett_score' field, tie-break by 'symbol'."""
    return stable_sort_assets(assets, score_key="buffett_score", id_key="symbol")


# ============= TESTS (inline for quick validation) =============

if __name__ == "__main__":
    print("Testing stable_sort_assets...")
    
    # Test 1: Basic tie-breaking
    assets = [
        {"symbol": "MSFT", "composite_score": 85.0},
        {"symbol": "AAPL", "composite_score": 85.0},
        {"symbol": "GOOGL", "composite_score": 90.0},
    ]
    result = stable_sort_assets(assets)
    assert result[0]["symbol"] == "GOOGL", "GOOGL should be first (highest score)"
    assert result[1]["symbol"] == "AAPL", "AAPL should be second (alphabetically before MSFT)"
    assert result[2]["symbol"] == "MSFT", "MSFT should be third"
    print("  ✓ Test 1 passed: Basic tie-breaking")
    
    # Test 2: Reversed input should give same output
    assets_reversed = list(reversed(assets))
    result2 = stable_sort_assets(assets_reversed)
    assert [a["symbol"] for a in result] == [a["symbol"] for a in result2], "Order should be identical"
    print("  ✓ Test 2 passed: Reversed input gives same output")
    
    # Test 3: All same score
    same_score = [
        {"symbol": "ZZZ", "composite_score": 50.0},
        {"symbol": "AAA", "composite_score": 50.0},
        {"symbol": "MMM", "composite_score": 50.0},
    ]
    result3 = stable_sort_assets(same_score)
    assert [a["symbol"] for a in result3] == ["AAA", "MMM", "ZZZ"], "Alphabetical order"
    print("  ✓ Test 3 passed: All same score → alphabetical")
    
    # Test 4: Fallback ID key
    no_symbol = [
        {"id": "asset2", "composite_score": 80.0},
        {"id": "asset1", "composite_score": 80.0},
    ]
    result4 = stable_sort_assets(no_symbol)
    assert result4[0]["id"] == "asset1", "Should use 'id' as fallback"
    print("  ✓ Test 4 passed: Fallback ID key")
    
    # Test 5: None scores handled
    with_none = [
        {"symbol": "A", "composite_score": None},
        {"symbol": "B", "composite_score": 50.0},
    ]
    result5 = stable_sort_assets(with_none)
    assert result5[0]["symbol"] == "B", "B should be first (50 > 0)"
    print("  ✓ Test 5 passed: None scores treated as 0")
    
    print("\n✅ All tests passed!")
