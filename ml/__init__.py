# Module ML pour TradePulse
# Ce module fournit les fonctionnalités de classification des actualités financières

from .news_classifier import NewsClassifier, run_classification

__all__ = ['NewsClassifier', 'run_classification']