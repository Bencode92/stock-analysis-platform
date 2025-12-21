# portfolio_engine/instrument_classifier.py
"""
Instrument Classifier — v1.0.0 (PR1)

Système de classification unifié pour les instruments financiers.
Combine:
1. Overrides explicites (instrument_overrides.json)
2. Règles automatiques (classification par catégorie/ticker patterns)
3. Validation et gating (unknown = not execution ready)

ARCHITECTURE:
    source_data (vendor) → règles automatiques → overrides → validation
    
    Les overrides ont priorité sur les règles automatiques.
    Aucun default silencieux: si classification impossible → "unknown" + warning.

USAGE:
    from portfolio_engine.instrument_classifier import InstrumentClassifier
    
    classifier = InstrumentClassifier()
    classification = classifier.classify("AAPL", source_data={"category": "Actions", "sector": "Technology"})
    
    # Vérifier si le portefeuille est prêt pour exécution
    is_ready, issues = classifier.validate_portfolio(asset_classifications)

Audit trail:
- v1.0.0 (2024-12-21): Initial PR1 implementation
"""

from __future__ import annotations
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any, Set
from pathlib import Path

logger = logging.getLogger("portfolio_engine.instrument_classifier")


# ============= DATA CLASSES =============

@dataclass
class InstrumentClassification:
    """Classification complète d'un instrument."""
    ticker: str
    role: str                     # core | satellite | defensive | lottery | unknown
    risk_bucket: str              # equity_like | bond_like | leveraged | alternative | real_assets | crypto | unknown
    region: str                   # US | Europe | Emerging | Asia | Global | Unknown
    sector: str                   # Technology | Healthcare | ... | Unknown
    category: str                 # Actions | ETF | Obligations | Crypto | Unknown
    source: str                   # "override" | "auto" | "unknown"
    flags: Dict[str, Any] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    is_valid: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "ticker": self.ticker,
            "role": self.role,
            "risk_bucket": self.risk_bucket,
            "region": self.region,
            "sector": self.sector,
            "category": self.category,
            "source": self.source,
            "flags": self.flags,
            "warnings": self.warnings,
            "is_valid": self.is_valid,
        }


# ============= CONSTANTS =============

VALID_ROLES: Set[str] = {"core", "satellite", "defensive", "lottery", "unknown"}
VALID_RISK_BUCKETS: Set[str] = {"equity_like", "bond_like", "leveraged", "alternative", "real_assets", "crypto", "unknown"}

# Patterns pour détection automatique des ETFs leveragés
LEVERAGED_PATTERNS = [
    "2X", "3X", "-2X", "-3X",
    "ULTRA", "ULTRAPRO", "ULTRASHORT",
    "DOUBLE", "TRIPLE",
    "BULL", "BEAR",
]

# Mapping catégorie → role par défaut
CATEGORY_TO_DEFAULT_ROLE = {
    "Actions": "satellite",
    "ETF": "satellite",          # Plus conservateur que "core"
    "Obligations": "defensive",
    "Crypto": "lottery",
    "Fonds": "satellite",
}

# Mapping catégorie → risk_bucket par défaut
CATEGORY_TO_DEFAULT_BUCKET = {
    "Actions": "equity_like",
    "ETF": "equity_like",
    "Obligations": "bond_like",
    "Crypto": "crypto",
    "Fonds": "equity_like",
}


# ============= MAIN CLASS =============

class InstrumentClassifier:
    """
    Classificateur d'instruments avec overrides et règles automatiques.
    """
    
    def __init__(self, overrides_path: Optional[str] = None):
        """
        Initialise le classificateur.
        
        Args:
            overrides_path: Chemin vers instrument_overrides.json
                           Si None, cherche dans portfolio_engine/
        """
        self.overrides: Dict[str, Dict[str, Any]] = {}
        self._load_overrides(overrides_path)
    
    def _load_overrides(self, path: Optional[str] = None) -> None:
        """Charge les overrides depuis le fichier JSON."""
        if path is None:
            # Chercher dans le même répertoire que ce fichier
            current_dir = Path(__file__).parent
            path = current_dir / "instrument_overrides.json"
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.overrides = data.get("overrides", {})
                logger.info(f"Loaded {len(self.overrides)} instrument overrides from {path}")
        except FileNotFoundError:
            logger.warning(f"Overrides file not found at {path}, using empty overrides")
            self.overrides = {}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in overrides file: {e}")
            self.overrides = {}
    
    def classify(
        self,
        ticker: str,
        source_data: Optional[Dict[str, Any]] = None,
    ) -> InstrumentClassification:
        """
        Classifie un instrument.
        
        Ordre de priorité:
        1. Override explicite (instrument_overrides.json)
        2. Règles automatiques basées sur source_data
        3. "unknown" si rien ne fonctionne
        
        Args:
            ticker: Symbole de l'instrument (ex: "AAPL", "SPY")
            source_data: Données sources (category, sector, region, etc.)
            
        Returns:
            InstrumentClassification avec tous les champs remplis
        """
        source_data = source_data or {}
        warnings = []
        
        # 1. Vérifier si override existe
        if ticker in self.overrides:
            return self._from_override(ticker, self.overrides[ticker])
        
        # 2. Essayer classification automatique
        classification = self._auto_classify(ticker, source_data)
        
        # 3. Vérifier si résultat valide
        if classification.role == "unknown" or classification.risk_bucket == "unknown":
            classification.warnings.append(
                f"Incomplete classification for {ticker}: role={classification.role}, "
                f"risk_bucket={classification.risk_bucket}"
            )
            classification.is_valid = False
        
        return classification
    
    def _from_override(self, ticker: str, override: Dict[str, Any]) -> InstrumentClassification:
        """Crée une classification depuis un override."""
        return InstrumentClassification(
            ticker=ticker,
            role=override.get("role", "unknown"),
            risk_bucket=override.get("risk_bucket", "unknown"),
            region=override.get("region", "Unknown"),
            sector=override.get("sector", "Unknown"),
            category=override.get("category", "Unknown"),
            source="override",
            flags=override.get("flags", {}),
            warnings=[],
            is_valid=True,
        )
    
    def _auto_classify(
        self,
        ticker: str,
        source_data: Dict[str, Any],
    ) -> InstrumentClassification:
        """Classification automatique basée sur les règles."""
        warnings = []
        
        # Extraire les données disponibles
        category = source_data.get("category", "Unknown")
        sector = source_data.get("sector") or source_data.get("sector_top", "Unknown")
        region = source_data.get("region") or source_data.get("country") or source_data.get("country_top", "Unknown")
        
        # Déterminer risk_bucket
        risk_bucket = self._determine_risk_bucket(ticker, category, source_data)
        
        # Déterminer role
        role = self._determine_role(ticker, category, risk_bucket, source_data)
        
        # Vérifier si leveraged
        is_leveraged = self._is_leveraged(ticker, source_data)
        if is_leveraged:
            risk_bucket = "leveraged"
            role = "lottery"
        
        # Construire les flags
        flags = {
            "leveraged": is_leveraged,
            "alternative": risk_bucket == "alternative",
        }
        
        # Warning si classification incomplète
        if role == "unknown":
            warnings.append(f"Could not determine role for {ticker}")
        if risk_bucket == "unknown":
            warnings.append(f"Could not determine risk_bucket for {ticker}")
        
        return InstrumentClassification(
            ticker=ticker,
            role=role,
            risk_bucket=risk_bucket,
            region=region,
            sector=sector,
            category=category,
            source="auto",
            flags=flags,
            warnings=warnings,
            is_valid=(role != "unknown" and risk_bucket != "unknown"),
        )
    
    def _determine_risk_bucket(
        self,
        ticker: str,
        category: str,
        source_data: Dict[str, Any],
    ) -> str:
        """Détermine le risk_bucket basé sur la catégorie et les patterns."""
        # Vérifier si leveraged d'abord
        if self._is_leveraged(ticker, source_data):
            return "leveraged"
        
        # Crypto
        if category == "Crypto" or ticker.endswith("-USD"):
            return "crypto"
        
        # Utiliser le mapping par catégorie
        return CATEGORY_TO_DEFAULT_BUCKET.get(category, "unknown")
    
    def _determine_role(
        self,
        ticker: str,
        category: str,
        risk_bucket: str,
        source_data: Dict[str, Any],
    ) -> str:
        """Détermine le role basé sur plusieurs critères."""
        # Leveraged/Crypto → lottery
        if risk_bucket in ("leveraged", "crypto"):
            return "lottery"
        
        # Obligations → defensive
        if category == "Obligations" or risk_bucket == "bond_like":
            return "defensive"
        
        # ETF World/SP500 avec faible vol → core
        # (cette logique pourrait être enrichie avec les données de volatilité)
        exposure = source_data.get("exposure", "").lower()
        if category == "ETF" and exposure in ("world", "sp500", "msci_world", "global"):
            return "core"
        
        # Utiliser le mapping par catégorie
        return CATEGORY_TO_DEFAULT_ROLE.get(category, "unknown")
    
    def _is_leveraged(self, ticker: str, source_data: Dict[str, Any]) -> bool:
        """Détecte si l'instrument est leveragé."""
        # Vérifier le ticker
        ticker_upper = ticker.upper()
        for pattern in LEVERAGED_PATTERNS:
            if pattern in ticker_upper:
                return True
        
        # Vérifier les données sources
        if source_data.get("leveraged") or source_data.get("is_leveraged"):
            return True
        
        # Vérifier le nom
        name = source_data.get("name", "").upper()
        for pattern in LEVERAGED_PATTERNS:
            if pattern in name:
                return True
        
        return False
    
    def classify_portfolio(
        self,
        tickers: List[str],
        source_data_map: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> Dict[str, InstrumentClassification]:
        """
        Classifie tous les instruments d'un portefeuille.
        
        Args:
            tickers: Liste des tickers
            source_data_map: Dict {ticker: source_data}
            
        Returns:
            Dict {ticker: InstrumentClassification}
        """
        source_data_map = source_data_map or {}
        
        return {
            ticker: self.classify(ticker, source_data_map.get(ticker))
            for ticker in tickers
        }
    
    def validate_portfolio(
        self,
        classifications: Dict[str, InstrumentClassification],
    ) -> Tuple[bool, List[str]]:
        """
        Valide qu'un portefeuille est prêt pour exécution.
        
        Un portefeuille n'est PAS ready si:
        - Au moins un instrument a role="unknown"
        - Au moins un instrument a risk_bucket="unknown"
        
        Args:
            classifications: Dict {ticker: InstrumentClassification}
            
        Returns:
            (is_ready, list_of_issues)
        """
        issues = []
        
        for ticker, cls in classifications.items():
            if cls.role == "unknown":
                issues.append(f"{ticker}: role is unknown")
            if cls.risk_bucket == "unknown":
                issues.append(f"{ticker}: risk_bucket is unknown")
            if not cls.is_valid:
                issues.extend([f"{ticker}: {w}" for w in cls.warnings])
        
        is_ready = len(issues) == 0
        
        if not is_ready:
            logger.warning(f"Portfolio not ready for execution: {len(issues)} issues found")
        
        return is_ready, issues
    
    def get_role_mapping(
        self,
        classifications: Dict[str, InstrumentClassification],
    ) -> Dict[str, str]:
        """
        Extrait le mapping ticker → role pour exposures.py.
        
        Args:
            classifications: Dict {ticker: InstrumentClassification}
            
        Returns:
            Dict {ticker: role}
        """
        return {ticker: cls.role for ticker, cls in classifications.items()}
    
    def add_override(self, ticker: str, override: Dict[str, Any]) -> None:
        """
        Ajoute un override en mémoire (ne persiste pas).
        
        Utile pour les corrections runtime.
        """
        self.overrides[ticker] = override
        logger.info(f"Added runtime override for {ticker}")
    
    def get_statistics(
        self,
        classifications: Dict[str, InstrumentClassification],
    ) -> Dict[str, Any]:
        """
        Calcule des statistiques sur les classifications.
        
        Returns:
            Dict avec count par role, risk_bucket, source, etc.
        """
        stats = {
            "total": len(classifications),
            "by_role": {},
            "by_risk_bucket": {},
            "by_source": {},
            "unknown_count": 0,
            "invalid_count": 0,
        }
        
        for cls in classifications.values():
            # By role
            stats["by_role"][cls.role] = stats["by_role"].get(cls.role, 0) + 1
            
            # By risk_bucket
            stats["by_risk_bucket"][cls.risk_bucket] = stats["by_risk_bucket"].get(cls.risk_bucket, 0) + 1
            
            # By source
            stats["by_source"][cls.source] = stats["by_source"].get(cls.source, 0) + 1
            
            # Unknown
            if cls.role == "unknown" or cls.risk_bucket == "unknown":
                stats["unknown_count"] += 1
            
            # Invalid
            if not cls.is_valid:
                stats["invalid_count"] += 1
        
        return stats


# ============= CONVENIENCE FUNCTION =============

# Instance singleton pour usage simple
_default_classifier: Optional[InstrumentClassifier] = None

def get_classifier() -> InstrumentClassifier:
    """Retourne l'instance singleton du classifier."""
    global _default_classifier
    if _default_classifier is None:
        _default_classifier = InstrumentClassifier()
    return _default_classifier


def classify_ticker(ticker: str, source_data: Optional[Dict[str, Any]] = None) -> InstrumentClassification:
    """Fonction de convenance pour classifier un ticker."""
    return get_classifier().classify(ticker, source_data)
