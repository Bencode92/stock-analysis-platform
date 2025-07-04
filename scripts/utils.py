# scripts/utils.py
import os
from functools import lru_cache
from langdetect import detect
import logging

logger = logging.getLogger(__name__)

@lru_cache(maxsize=None)
def _translator():
    """Initialise l'objet traducteur DeepL une seule fois."""
    try:
        import deepl  # pip install deepl
        api_key = os.environ.get("DEEPL_API_KEY")
        if not api_key:
            logger.warning("DEEPL_API_KEY non définie, traduction désactivée")
            return None
        return deepl.Translator(api_key)
    except ImportError:
        logger.warning("Module deepl non installé, traduction désactivée")
        return None
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation du traducteur DeepL: {e}")
        return None

def translate_to_fr(text: str) -> str:
    """
    Traduit vers le français **uniquement si** le texte détecté est anglais.
    Sinon, renvoie le texte tel quel.
    """
    if not text or len(text.strip()) < 10:  # Texte trop court à traduire
        return text
    
    translator = _translator()
    if not translator:
        return text  # Pas de traducteur disponible
    
    try:
        # Détecter la langue du texte
        detected_lang = detect(text)
        if detected_lang != "en":
            logger.debug(f"Texte détecté comme '{detected_lang}', pas de traduction nécessaire")
            return text
        
        # Traduire vers le français
        logger.debug(f"Traduction en cours: {text[:50]}...")
        result = translator.translate_text(text, target_lang="FR")
        translated_text = result.text
        logger.debug(f"Traduction terminée: {translated_text[:50]}...")
        return translated_text
        
    except Exception as e:
        logger.warning(f"Erreur lors de la traduction: {e}")
        return text  # Retourner le texte original en cas d'erreur

def translate_to_fr_safe(text: str) -> str:
    """
    Version sécurisée de translate_to_fr avec retry automatique.
    """
    try:
        from tenacity import retry, wait_fixed, stop_after_attempt, retry_if_exception_type
        
        @retry(
            wait=wait_fixed(2), 
            stop=stop_after_attempt(3),
            retry=retry_if_exception_type(Exception),
            reraise=True
        )
        def _translate_with_retry():
            return translate_to_fr(text)
        
        return _translate_with_retry()
    except ImportError:
        # Si tenacity n'est pas installé, utiliser la version simple
        return translate_to_fr(text)
    except Exception as e:
        logger.error(f"Échec de la traduction après plusieurs tentatives: {e}")
        return text
