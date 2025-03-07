// services/marketEventsService.js
// Service pour identifier et analyser les événements à fort impact

import { perplexityService } from './api';
import { CacheService } from './cacheService';

const cache = new CacheService();

/**
 * Service pour l'analyse des événements à fort impact sur les marchés
 */
class MarketEventsService {
  /**
   * Identifie les événements à fort impact à partir des actualités
   * @param {Array} newsData - Données d'actualités
   * @returns {Promise<Array>} - Liste des événements à fort impact
   */
  async getHighImpactEvents(newsData) {
    // Vérifier si on a des actualités
    if (!newsData || newsData.length === 0) {
      throw new Error('Aucune actualité disponible pour analyser les événements');
    }
    
    // Vérifier le cache (seulement 5 minutes de validité pour rester très actuel)
    const newsHash = newsData.map(n => n.title.substring(0, 15)).join('_').replace(/\s+/g, '');
    const cacheKey = `high_impact_events_${newsHash}`;
    
    const cachedEvents = await cache.get(cacheKey);
    if (cachedEvents) {
      console.log('Événements à fort impact récupérés depuis le cache');
      return cachedEvents;
    }
    
    try {
      // Préparer le prompt pour Perplexity
      const today = new Date();
      const formattedToday = today.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      
      const newsPrompt = newsData.map(news => 
        `- ${news.title} (${news.source}): ${news.summary} [Impact: ${news.impact}/50, Sentiment: ${news.sentiment}]`
      ).join('\n');
      
      const prompt = `
        Basé sur ces actualités financières d'AUJOURD'HUI (${formattedToday}), identifie les 5-7 ÉVÉNEMENTS SPÉCIFIQUES qui auront probablement le plus grand impact sur les marchés financiers dans les prochaines heures/jours.

        ACTUALITÉS:
        ${newsPrompt}

        Pour chaque événement identifié, fournis:
        1. Un titre court et précis de l'événement (pas simplement le titre de l'actualité)
        2. Le type de marché principalement affecté (actions, ETF, crypto, forex, matières premières, etc.)
        3. Une explication courte et claire de pourquoi cet événement est important
        4. Un score d'impact sur une échelle de 1 à 10 (10 étant l'impact le plus fort)
        5. Un ou plusieurs symboles boursiers ou cryptos spécifiquement impactés
        6. Le timing (immédiat, court terme, moyen terme)

        Réponds UNIQUEMENT au format JSON suivant:
        [
          {
            "title": "Titre de l'événement",
            "marketType": "actions/etf/crypto/forex/commodities",
            "explanation": "Explication concise de l'importance",
            "impactScore": 8,
            "affectedSymbols": ["AAPL", "MSFT", "BTC"],
            "timing": "immédiat/court terme/moyen terme"
          },
          ...
        ]
      `;
      
      // Appeler Perplexity pour analyser les événements
      const response = await perplexityService.query(prompt, {
        temperature: 0.1,
        max_tokens: 2048,
        model: "sonar-medium-online"  // Utiliser le modèle avec navigation web
      });
      
      // Extraire et parser la réponse
      const events = this._parseEventsResponse(response);
      
      // Trier par score d'impact (décroissant)
      const sortedEvents = events.sort((a, b) => b.impactScore - a.impactScore);
      
      // Mettre en cache les événements (5 minutes)
      await cache.set(cacheKey, sortedEvents, 5 * 60);
      
      return sortedEvents;
    } catch (error) {
      console.error('Erreur lors de l\'analyse des événements à fort impact:', error);
      throw error;
    }
  }
  
  /**
   * Parse la réponse d'événements
   * @private
   */
  _parseEventsResponse(response) {
    try {
      // Si la réponse est un objet JSON, extraire le contenu
      const content = response.choices ? response.choices[0].message.content : response;
      
      // Essayer de parser le JSON
      if (typeof content === 'string') {
        return JSON.parse(content);
      } else if (Array.isArray(content)) {
        return content;
      }
      
      throw new Error('Format de réponse invalide pour les événements');
    } catch (error) {
      console.error('Erreur lors du parsing de la réponse événements:', error);
      throw error;
    }
  }
}

export const marketEventsService = new MarketEventsService();
