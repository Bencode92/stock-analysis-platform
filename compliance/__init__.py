# compliance/__init__.py
"""
Module Compliance - Gestion réglementaire et sanitisation.

- amf.py : Blocs avertissement AMF, disclaimers
- sanitizer.py : Nettoyage langage marketing, termes interdits
"""

from .amf import (
    AMF_DISCLAIMER,
    AMF_DISCLAIMER_FULL,
    generate_compliance_block,
    validate_compliance_text,
)

from .sanitizer import (
    sanitize_marketing_language,
    FORBIDDEN_TERMS,
    check_forbidden_terms,
)

__all__ = [
    "AMF_DISCLAIMER",
    "AMF_DISCLAIMER_FULL",
    "generate_compliance_block",
    "validate_compliance_text",
    "sanitize_marketing_language",
    "FORBIDDEN_TERMS",
    "check_forbidden_terms",
]
