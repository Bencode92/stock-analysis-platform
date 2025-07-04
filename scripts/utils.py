# scripts/utils.py
import os
import logging
from functools import lru_cache
from langdetect import detect

# Configuration du logger
logger = logging.getLogger(__name__)

@lru_cache(maxsize=None)
def _translator():
    """Initialise l'objet traducteur DeepL une seule fois."""
    try:
        import deepl  # pip install deepl
        api_key = os.environ.get("DEEPL_API_KEY")
        if not api_key:
            logger.warning("DEEPL_API_KEY non définie - traduction désactivée")
            return None
        return deepl.Translator(api_key)
    except ImportError:
        logger.warning("Module deepl non installé - traduction désactivée")
        return None
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation du traducteur DeepL: {e}")
        return None

def translate_to_fr_safe(text: str) -> str:
    """
    Traduit vers le français **uniquement si** le texte détecté est anglais.
    Version sécurisée avec gestion d'erreurs complète.
    Sinon, renvoie le texte tel quel.
    """
    if not text or not text.strip():
        return text
    
    try:
        # Vérification de la langue
        detected_lang = detect(text)
        if detected_lang != "en":
            logger.debug(f"Langue détectée: {detected_lang} - pas de traduction nécessaire")
            return text
    except Exception as e:
        logger.debug(f"Impossible de détecter la langue: {e} - tentative de traduction quand même")
    
    # Tentative de traduction
    translator = _translator()
    if not translator:
        logger.debug("Traducteur non disponible - retour du texte original")
        return text
    
    try:
        result = translator.translate_text(text, target_lang="FR")
        logger.debug(f"Traduction réussie: {text[:50]}... -> {result.text[:50]}...")
        return result.text
    except Exception as e:
        logger.warning(f"Erreur lors de la traduction: {e} - retour du texte original")
        return text

def translate_to_fr(text: str) -> str:
    """
    Fonction de traduction principale - alias pour translate_to_fr_safe
    """
    return translate_to_fr_safe(text)
