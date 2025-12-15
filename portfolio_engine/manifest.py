# portfolio_engine/manifest.py
"""
Manifest complet pour chaque run de génération.

ChatGPT v2.0 Audit - Q1: "As-tu un _manifest complet par run?"
Réponse: Ce module.

Le manifest contient:
- git_sha (version du code)
- versions des modules
- config utilisée
- hash des datasets
- timezone
- durée d'exécution
- erreurs/warnings
"""

import os
import subprocess
import hashlib
import json
import time
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from pathlib import Path
import logging

logger = logging.getLogger("portfolio_engine.manifest")


@dataclass
class DataSourceInfo:
    """Information sur une source de données."""
    path: str
    hash: str
    rows: Optional[int] = None
    columns: Optional[int] = None
    last_modified: Optional[str] = None


@dataclass
class ManifestBuilder:
    """
    Construit le manifest complet d'un run.
    
    Usage:
        manifest = ManifestBuilder()
        manifest.start()
        # ... génération ...
        manifest.add_data_source("stocks_us", "data/stocks_us.json")
        manifest.add_error("Warning: API timeout")
        manifest.end()
        result = manifest.to_dict()
    """
    
    # Versioning
    git_sha: Optional[str] = None
    git_branch: Optional[str] = None
    module_versions: Dict[str, str] = field(default_factory=dict)
    
    # Config
    config: Dict[str, Any] = field(default_factory=dict)
    parameters: Dict[str, Any] = field(default_factory=dict)
    
    # Data sources
    data_sources: Dict[str, DataSourceInfo] = field(default_factory=list)
    
    # Execution
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None
    timezone_name: str = "UTC"
    
    # Results
    profiles_generated: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    # Environment
    python_version: Optional[str] = None
    platform: Optional[str] = None
    
    def __post_init__(self):
        self.data_sources = {}
        self._collect_git_info()
        self._collect_env_info()
        self._collect_module_versions()
    
    def _collect_git_info(self):
        """Récupère les infos Git."""
        try:
            self.git_sha = subprocess.check_output(
                ["git", "rev-parse", "HEAD"],
                stderr=subprocess.DEVNULL
            ).decode().strip()[:12]
            
            self.git_branch = subprocess.check_output(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                stderr=subprocess.DEVNULL
            ).decode().strip()
        except Exception:
            self.git_sha = "unknown"
            self.git_branch = "unknown"
    
    def _collect_env_info(self):
        """Récupère les infos d'environnement."""
        import platform
        import sys
        
        self.python_version = sys.version.split()[0]
        self.platform = platform.platform()
    
    def _collect_module_versions(self):
        """Récupère les versions des modules clés."""
        modules = [
            ("numpy", "np"),
            ("pandas", "pd"),
            ("scipy", "scipy"),
        ]
        
        for module_name, import_name in modules:
            try:
                mod = __import__(module_name)
                self.module_versions[module_name] = getattr(mod, "__version__", "unknown")
            except ImportError:
                self.module_versions[module_name] = "not_installed"
        
        # Versions internes
        try:
            from portfolio_engine.optimizer import __doc__ as opt_doc
            # Extraire version du docstring (ex: "v6.13")
            if opt_doc:
                import re
                match = re.search(r'v(\d+\.\d+)', opt_doc)
                if match:
                    self.module_versions["portfolio_engine"] = match.group(0)
        except Exception:
            pass
        
        try:
            from portfolio_engine.data_lineage import __version__ as lineage_version
            self.module_versions["data_lineage"] = lineage_version
        except Exception:
            pass
    
    def start(self):
        """Démarre le chronomètre."""
        self.start_time = datetime.now(timezone.utc)
        logger.info(f"Manifest: run started at {self.start_time.isoformat()}")
    
    def end(self):
        """Termine le chronomètre."""
        self.end_time = datetime.now(timezone.utc)
        if self.start_time:
            self.duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000)
        logger.info(f"Manifest: run completed in {self.duration_ms}ms")
    
    def add_data_source(self, name: str, filepath: str):
        """Ajoute une source de données avec son hash."""
        path = Path(filepath)
        
        if not path.exists():
            self.warnings.append(f"Data source not found: {filepath}")
            return
        
        # Calculer le hash
        try:
            with open(path, 'rb') as f:
                content = f.read()
                file_hash = f"sha256:{hashlib.sha256(content).hexdigest()[:16]}"
        except Exception as e:
            file_hash = f"error:{str(e)[:20]}"
        
        # Compter les lignes/colonnes si JSON ou CSV
        rows, cols = None, None
        try:
            if filepath.endswith('.json'):
                data = json.loads(content.decode('utf-8'))
                if isinstance(data, list):
                    rows = len(data)
                elif isinstance(data, dict):
                    for key in ['stocks', 'etfs', 'bonds', 'crypto']:
                        if key in data and isinstance(data[key], list):
                            rows = len(data[key])
                            break
            elif filepath.endswith('.csv'):
                lines = content.decode('utf-8').strip().split('\n')
                rows = len(lines) - 1  # Exclure header
                if lines:
                    cols = len(lines[0].split(','))
        except Exception:
            pass
        
        # Last modified
        try:
            mtime = path.stat().st_mtime
            last_modified = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        except Exception:
            last_modified = None
        
        self.data_sources[name] = DataSourceInfo(
            path=str(path),
            hash=file_hash,
            rows=rows,
            columns=cols,
            last_modified=last_modified,
        )
    
    def add_config(self, config: Dict[str, Any]):
        """Ajoute la configuration utilisée."""
        self.config = config
    
    def add_parameters(self, parameters: Dict[str, Any]):
        """Ajoute les paramètres de génération."""
        self.parameters = parameters
    
    def add_profile(self, profile_name: str):
        """Enregistre un profil généré."""
        self.profiles_generated.append(profile_name)
    
    def add_error(self, error: str):
        """Ajoute une erreur."""
        self.errors.append(error)
        logger.error(f"Manifest error: {error}")
    
    def add_warning(self, warning: str):
        """Ajoute un warning."""
        self.warnings.append(warning)
        logger.warning(f"Manifest warning: {warning}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Exporte le manifest complet."""
        return {
            # Versioning
            "git_sha": self.git_sha,
            "git_branch": self.git_branch,
            "module_versions": self.module_versions,
            
            # Config
            "config": self.config,
            "parameters": self.parameters,
            
            # Data sources
            "data_sources": {
                name: {
                    "path": ds.path,
                    "hash": ds.hash,
                    "rows": ds.rows,
                    "columns": ds.columns,
                    "last_modified": ds.last_modified,
                }
                for name, ds in self.data_sources.items()
            },
            
            # Execution
            "execution": {
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": self.end_time.isoformat() if self.end_time else None,
                "duration_ms": self.duration_ms,
                "timezone": self.timezone_name,
            },
            
            # Results
            "profiles_generated": self.profiles_generated,
            "n_errors": len(self.errors),
            "errors": self.errors,
            "n_warnings": len(self.warnings),
            "warnings": self.warnings[:10],  # Limiter à 10
            
            # Environment
            "environment": {
                "python_version": self.python_version,
                "platform": self.platform,
            },
        }


def create_manifest_for_run(config: Dict, data_files: List[str]) -> ManifestBuilder:
    """
    Crée un manifest pré-configuré pour un run.
    
    Usage:
        manifest = create_manifest_for_run(
            config=CONFIG,
            data_files=["data/stocks_us.json", "data/combined_etfs.csv"]
        )
        manifest.start()
        # ... génération ...
        manifest.end()
    """
    manifest = ManifestBuilder()
    manifest.add_config(config)
    
    for filepath in data_files:
        name = Path(filepath).stem
        manifest.add_data_source(name, filepath)
    
    return manifest
