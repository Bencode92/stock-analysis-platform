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
    sanitize_portfolio_output,
    sanitize_portfolio_commentary,
    sanitize_justification,
    sanitize_all_justifications,
    full_compliance_check,
    FORBIDDEN_TERMS,
    check_forbidden_terms,
)

__all__ = [
    # AMF
    "AMF_DISCLAIMER",
    "AMF_DISCLAIMER_FULL",
    "generate_compliance_block",
    "validate_compliance_text",
    # Sanitizer
    "sanitize_marketing_language",
    "sanitize_portfolio_output",
    "sanitize_portfolio_commentary",
    "sanitize_justification",
    "sanitize_all_justifications",
    "full_compliance_check",
    "FORBIDDEN_TERMS",
    "check_forbidden_terms",
]
