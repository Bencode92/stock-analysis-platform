// services/api.js
// Module central pour la gestion des appels API externes

// Configuration des API
const API_CONFIG = {
  // Point d'accès MCP pour Perplexity
  PERPLEXITY_MCP_ENDPOINT: 'https://mcp-api.perplexity.ai/chat/completions',
  CLAUDE_ENDPOINT: 'https://api.anthropic.com/v1/messages',
  
  // Clés API (à obtenir depuis l'environnement ou les variables de configuration)
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '',
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  
  // Configuration des timeouts et retry
  TIMEOUT_MS: 15000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
};

// Service de cache
import { CacheService } from './cacheService.js';
const cache = new CacheService();

/**
 * Classe pour gérer les appels à l'API Perplexity via MCP
 */
class PerplexityService {
  constructor(apiKey = API_CONFIG.PERPLEXITY_API_KEY) {
    this.apiKey = apiKey;
    this.endpoint = API_CONFIG.PERPLEXITY_MCP_ENDPOINT;
  }

  /**
   * Envoie une requête à Perplexity via MCP
   * @param {string} prompt - Le prompt à envoyer
   * @param {Object} options - Options additionnelles (modèle, température, etc.)
   * @returns {Promise<Object>} La réponse de l'API
   */
  async query(prompt, options = {}) {
    // Paramètres par défaut
    const defaultOptions = {
      model: "sonar-medium-online",  // Modèle avec accès au web en temps réel
      temperature: 0.6,
      max_tokens: 2048
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
      const response = await this._makeRequest(prompt, mergedOptions);
      return response;
    } catch (error) {
      console.error('Error querying Perplexity API:', error);
      throw error;
    }
  }
  
  /**
   * Récupère les actualités financières en temps réel pour AUJOURD'HUI
   * @returns {Promise<Array>} Liste des actualités financières
   */
  async getFinancialNews() {
    // Pas de mise en cache pour les actualités pour avoir toujours les plus récentes
    const now = new Date();
    const formattedDate = now.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    const prompt = `
      Donne-moi les 8 actualités financières les plus importantes UNIQUEMENT d'AUJOURD'HUI (${formattedDate}). 
      Ne prends PAS en compte les actualités des jours précédents, même récentes.
      
      Pour chaque actualité, fournis:
      1. Le titre
      2. La source (Bloomberg, Reuters, etc.)
      3. Un résumé court (2-3 phrases)
      4. Une estimation de l'impact (sur une échelle de 1 à 50, où 50 est l'impact le plus fort)
      5. Le sentiment (positive ou negative)
      
      Réponds uniquement au format JSON comme suit:
      [
        {
          "title": "Titre de l'actualité",
          "source": "Source",
          "summary": "Résumé court",
          "impact": 35,
          "sentiment": "positive/negative",
          "timestamp": "2025-03-07T12:30:00Z"
        },
        ...
      ]
      
      IMPORTANT: Utilise tes capacités de navigation web pour trouver les actualités LES PLUS RÉCENTES. Vérifie que les actualités sont bien d'AUJOURD'HUI.
    `;
    
    try {
      const response = await this.query(prompt, {
        temperature: 0.1, // Basse température pour des réponses plus factuelles
        max_tokens: 3000,
        model: "sonar-medium-online" // Modèle avec capacité de navigation web
      });
      
      const news = this._parseNewsResponse(response);
      
      // Ajouter l'horodatage d'aujourd'hui pour les actualités qui n'en ont pas
      const newsWithTimestamps = news.map(item => {
        if (!item.timestamp) {
          return {
            ...item,
            timestamp: new Date().toISOString()
          };
        }
        return item;
      });
      
      return newsWithTimestamps;
    } catch (error) {
      console.error('Error fetching financial news:', error);
      throw error;
    }
  }
  
  /**
   * Analyse les secteurs basés sur les actualités D'AUJOURD'HUI
   * @param {Array} newsData - Liste des actualités
   * @returns {Promise<Object>} Analyse sectorielle
   */
  async analyzeSectors(newsData) {
    const newsPrompt = newsData.map(news => 
      `- ${news.title} (${news.source}): ${news.summary}`
    ).join('\n');
    
    const sectorPrompt = `
      En te basant UNIQUEMENT sur ces actualités financières d'AUJOURD'HUI:
      
      ${newsPrompt}
      
      Identifie les secteurs qui devraient être haussiers et baissiers dans les prochains jours.
      Pour chaque secteur, donne une brève explication directement liée aux actualités RÉCENTES citées.
      
      Réponds uniquement au format JSON comme suit:
      {
        "bullish": [
          {
            "name": "Nom du secteur",
            "reason": "Raison de la perspective haussière"
          },
          ...
        ],
        "bearish": [
          {
            "name": "Nom du secteur",
            "reason": "Raison de la perspective baissière"
          },
          ...
        ]
      }
    `;
    
    try {
      // Caching léger (15 minutes) pour l'analyse sectorielle basée sur les mêmes actualités
      const newsHash = newsData.map(n => n.title.substring(0, 10)).join('_');
      const cacheKey = `sectors_${newsHash}`;
      
      // Vérifier le cache
      const cachedSectors = await cache.get(cacheKey);
      if (cachedSectors) {
        console.log('Sector analysis served from cache');
        return cachedSectors;
      }
      
      const response = await this.query(sectorPrompt, {
        temperature: 0.2,
        max_tokens: 2048
      });
      
      const sectors = this._parseSectorsResponse(response);
      
      // Mettre en cache l'analyse sectorielle (15 minutes)
      await cache.set(cacheKey, sectors, 15 * 60);
      
      return sectors;
    } catch (error) {
      console.error('Error analyzing sectors:', error);
      throw error;
    }
  }
  
  /**
   * Récupère des instruments financiers recommandés basés sur l'actualité du JOUR
   * @param {Array} newsData - Liste des actualités
   * @returns {Promise<Object>} Instruments financiers recommandés
   */
  async getFinancialInstruments(newsData) {
    const newsPrompt = newsData.map(news => 
      `- ${news.title} (${news.source}): ${news.summary}`
    ).join('\n');
    
    const today = new Date();
    const formattedToday = today.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    const instrumentsPrompt = `
      Analyse ces actualités financières d'AUJOURD'HUI (${formattedToday}):
      
      ${newsPrompt}
      
      En te basant UNIQUEMENT sur ces actualités d'AUJOURD'HUI, identifie:
      
      1. Les ETF spécifiques qui seraient pertinents à considérer. Pour chacun, donne son nom complet, son symbole boursier, et explique brièvement pourquoi il est lié à ces actualités.
      
      2. Les actions (stocks) spécifiques qui semblent prometteuses ou à risque. Pour chacune, donne son nom complet, son symbole boursier, et explique brièvement pourquoi elle est liée à ces actualités.
      
      3. Les cryptomonnaies qui pourraient être impactées. Pour chacune, donne son nom, son symbole, et explique brièvement pourquoi elle est liée à ces actualités.
      
      Réponds uniquement au format JSON comme suit:
      {
        "stocks": [
          {
            "name": "Nom de l'entreprise",
            "symbol": "SYMBOLE",
            "info": "Explication brève liée aux actualités d'aujourd'hui"
          },
          ...
        ],
        "etfs": [
          {
            "name": "Nom de l'ETF",
            "symbol": "SYMBOLE",
            "info": "Explication brève liée aux actualités d'aujourd'hui"
          },
          ...
        ],
        "cryptos": [
          {
            "name": "Nom de la crypto",
            "symbol": "SYMBOLE",
            "info": "Explication brève liée aux actualités d'aujourd'hui"
          },
          ...
        ]
      }
    `;
    
    try {
      // Caching très court (10 minutes) pour les instruments basés sur les actualités du jour
      const newsHash = newsData.map(n => n.title.substring(0, 10)).join('_');
      const cacheKey = `instruments_${newsHash}`;
      
      // Vérifier le cache
      const cachedInstruments = await cache.get(cacheKey);
      if (cachedInstruments) {
        console.log('Financial instruments served from cache');
        return cachedInstruments;
      }
      
      const response = await this.query(instrumentsPrompt, {
        temperature: 0.2,
        max_tokens: 2048,
        model: "sonar-medium-online" // Utiliser le modèle avec capacité de recherche pour vérifier les symboles
      });
      
      const instruments = this._parseInstrumentsResponse(response);
      
      // Mettre en cache les instruments (10 minutes)
      await cache.set(cacheKey, instruments, 10 * 60);
      
      return instruments;
    } catch (error) {
      console.error('Error getting financial instruments:', error);
      throw error;
    }
  }
  
  /**
   * Méthode privée pour faire les appels API avec retry
   * @private
   */
  async _makeRequest(prompt, options) {
    let retries = 0;
    
    while (retries <= API_CONFIG.MAX_RETRIES) {
      try {
        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "user", content: prompt }
            ],
            temperature: options.temperature,
            max_tokens: options.max_tokens
          }),
          timeout: API_CONFIG.TIMEOUT_MS
        };
        
        const response = await fetch(this.endpoint, requestOptions);
        
        if (!response.ok) {
          throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        retries++;
        
        if (retries > API_CONFIG.MAX_RETRIES) {
          throw error;
        }
        
        // Attendre avant de réessayer (délai exponentiel)
        const delay = API_CONFIG.RETRY_DELAY_MS * Math.pow(2, retries - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  /**
   * Parse la réponse d'actualités
   * @private
   */
  _parseNewsResponse(response) {
    try {
      // Si la réponse est un objet JSON, extraire le contenu
      const content = response.choices ? response.choices[0].message.content : response;
      
      // Essayer de parser le JSON
      if (typeof content === 'string') {
        return JSON.parse(content);
      } else if (Array.isArray(content)) {
        return content;
      }
      
      throw new Error('Invalid news response format');
    } catch (error) {
      console.error('Error parsing news response:', error);
      throw error;
    }
  }
  
  /**
   * Parse la réponse d'analyse sectorielle
   * @private
   */
  _parseSectorsResponse(response) {
    try {
      // Si la réponse est un objet JSON, extraire le contenu
      const content = response.choices ? response.choices[0].message.content : response;
      
      // Essayer de parser le JSON
      if (typeof content === 'string') {
        return JSON.parse(content);
      } else if (typeof content === 'object' && content.bullish && content.bearish) {
        return content;
      }
      
      throw new Error('Invalid sectors response format');
    } catch (error) {
      console.error('Error parsing sectors response:', error);
      throw error;
    }
  }
  
  /**
   * Parse la réponse d'instruments financiers
   * @private
   */
  _parseInstrumentsResponse(response) {
    try {
      // Si la réponse est un objet JSON, extraire le contenu
      const content = response.choices ? response.choices[0].message.content : response;
      
      // Essayer de parser le JSON
      if (typeof content === 'string') {
        return JSON.parse(content);
      } else if (typeof content === 'object' && content.stocks && content.etfs && content.cryptos) {
        return content;
      }
      
      throw new Error('Invalid instruments response format');
    } catch (error) {
      console.error('Error parsing instruments response:', error);
      throw error;
    }
  }
}

/**
 * Classe pour gérer les appels à l'API Claude
 */
class ClaudeService {
  constructor(apiKey = API_CONFIG.CLAUDE_API_KEY) {
    this.apiKey = apiKey;
    this.endpoint = API_CONFIG.CLAUDE_ENDPOINT;
  }
  
  /**
   * Génère un portefeuille optimisé basé sur les données
   * @param {Array} newsData - Actualités récentes
   * @param {Object} sectorData - Analyse sectorielle
   * @param {Object} instruments - Instruments financiers
   * @returns {Promise<Array>} Portefeuille optimisé
   */
  async generateOptimizedPortfolio(newsData, sectorData, instruments) {
    const newsContext = newsData.map(news => 
      `- ${news.title} (${news.source}): ${news.summary} [Impact: ${news.sentiment === 'positive' ? 'Positif' : 'Négatif'}]`
    ).join('\n');
    
    const bullishSectors = sectorData.bullish.map(sector => 
      `- ${sector.name}: ${sector.reason}`
    ).join('\n');
    
    const bearishSectors = sectorData.bearish.map(sector => 
      `- ${sector.name}: ${sector.reason}`
    ).join('\n');
    
    const stocksInfo = instruments.stocks.map(stock => 
      `- ${stock.name} (${stock.symbol}): ${stock.info}`
    ).join('\n');
    
    const etfsInfo = instruments.etfs.map(etf => 
      `- ${etf.name} (${etf.symbol}): ${etf.info}`
    ).join('\n');
    
    const cryptosInfo = instruments.cryptos.map(crypto => 
      `- ${crypto.name} (${crypto.symbol}): ${crypto.info}`
    ).join('\n');
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Pas de mise en cache pour le portefeuille pour avoir une analyse fraîche
    
    const portfolioPrompt = `
      En tant qu'analyste financier expert, tu dois créer un portefeuille d'investissement optimisé pour ${dateStr} à ${timeStr} en te basant sur les données ci-dessous.

      ACTUALITÉS FINANCIÈRES D'AUJOURD'HUI:
      ${newsContext}

      SECTEURS HAUSSIERS:
      ${bullishSectors}

      SECTEURS BAISSIERS:
      ${bearishSectors}

      INSTRUMENTS FINANCIERS DISPONIBLES:
      ACTIONS:
      ${stocksInfo}

      ETF:
      ${etfsInfo}

      CRYPTOMONNAIES:
      ${cryptosInfo}

      Consignes:
      1. IMPORTANT: Crée un portefeuille équilibré à RISQUE MODÉRÉ basé sur ces informations.
      2. Ne suis AUCUN modèle d'allocation prédéfini (pas de 45%/30%/25% ou autre formule fixe).
      3. Analyse la situation actuelle et détermine librement l'équilibre optimal entre actions, ETF et cryptomonnaies.
      4. Choisis uniquement parmi les instruments listés ci-dessus.
      5. Pour chaque instrument, détermine un pourcentage d'allocation approprié.
      6. Justifie brièvement chaque choix en lien avec les actualités d'AUJOURD'HUI.
      7. TRÈS IMPORTANT: Assure-toi que le total des allocations fasse exactement 100%.

      Réponds directement au format JSON sans texte explicatif avant ou après:
      [
        {
          "name": "Nom de l'instrument",
          "symbol": "SYMBOLE",
          "type": "stock/etf/crypto",
          "allocation": XX,
          "reason": "Justification concise liée à l'actualité du jour"
        },
        ...
      ]
    `;
    
    try {
      const response = await this._makeRequest(portfolioPrompt);
      const portfolio = this._parsePortfolioResponse(response);
      
      // Ajouter un horodatage aux raisons
      const portfolioWithTimestamp = this._addTimestampToReasons(portfolio);
      
      return portfolioWithTimestamp;
    } catch (error) {
      console.error('Error generating portfolio with Claude:', error);
      throw error;
    }
  }
  
  /**
   * Méthode privée pour faire les appels API avec retry
   */
  async _makeRequest(prompt) {
    let retries = 0;
    
    while (retries <= API_CONFIG.MAX_RETRIES) {
      try {
        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: "claude-3-opus-20240229",
            messages: [
              { role: "user", content: prompt }
            ],
            max_tokens: 4096,
            temperature: 0.1
          }),
          timeout: API_CONFIG.TIMEOUT_MS
        };
        
        const response = await fetch(this.endpoint, requestOptions);
        
        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        retries++;
        
        if (retries > API_CONFIG.MAX_RETRIES) {
          throw error;
        }
        
        // Attendre avant de réessayer (délai exponentiel)
        const delay = API_CONFIG.RETRY_DELAY_MS * Math.pow(2, retries - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  /**
   * Parse la réponse de portefeuille
   * @private
   */
  _parsePortfolioResponse(response) {
    try {
      // Extraire le contenu de la réponse
      const content = response.content ? response.content[0].text : response;
      
      // Chercher et extraire JSON
      const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      throw new Error('Portfolio response did not contain valid JSON');
    } catch (error) {
      console.error('Error parsing portfolio response:', error);
      
      // Tenter une extraction manuelle si l'analyse JSON échoue
      return this._extractPortfolioManually(response);
    }
  }
  
  /**
   * Extraction manuelle du portefeuille si l'analyse JSON échoue
   * @private
   */
  _extractPortfolioManually(text) {
    // Code d'extraction manuelle existant dans aiIntegration.js
    const portfolio = [];
    const lines = typeof text === 'string' ? text.split('\n') : 
                  (text.content ? text.content[0].text.split('\n') : []);
    
    let currentAsset = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Détecter une nouvelle entrée d'actif
      if (trimmedLine.match(/^\d+\.|\-|\*/) || 
          trimmedLine.match(/^[A-Z].*\([A-Z]+\):/) || 
          trimmedLine.match(/^(Bitcoin|Ethereum|Binance Coin|Cardano|Solana)/)) {
        
        // Sauvegarder l'actif précédent si complet
        if (currentAsset && 
            currentAsset.name && 
            currentAsset.symbol && 
            currentAsset.type && 
            currentAsset.allocation) {
          portfolio.push(currentAsset);
        }
        
        // Initialiser un nouvel actif
        currentAsset = {
          name: '',
          symbol: '',
          type: '',
          allocation: 0,
          reason: ''
        };
        
        // Extraction des infos de base
        const symbolMatch = trimmedLine.match(/\(([A-Z]+)\)/);
        if (symbolMatch) {
          currentAsset.symbol = symbolMatch[1];
          currentAsset.name = trimmedLine.split('(')[0].trim();
        }
        
        // Détection du type
        if (trimmedLine.toLowerCase().includes('stock') || 
            trimmedLine.toLowerCase().includes('action')) {
          currentAsset.type = 'stock';
        } else if (trimmedLine.toLowerCase().includes('etf')) {
          currentAsset.type = 'etf';
        } else if (trimmedLine.toLowerCase().includes('crypto') || 
                trimmedLine.includes('Bitcoin') || 
                trimmedLine.includes('Ethereum')) {
          currentAsset.type = 'crypto';
        }
        
        // Extraction de l'allocation
        const allocationMatch = trimmedLine.match(/(\d+)%/);
        if (allocationMatch) {
          currentAsset.allocation = parseInt(allocationMatch[1]);
        }
      }
      
      // Complétion des informations de l'actif en cours
      if (currentAsset) {
        // Extraction du symbole s'il n'a pas été trouvé
        if (!currentAsset.symbol && trimmedLine.match(/symbol|symbole/i)) {
          const symbolMatch = trimmedLine.match(/[A-Z]{2,5}/);
          if (symbolMatch) currentAsset.symbol = symbolMatch[0];
        }
        
        // Extraction du type s'il n'a pas été trouvé
        if (!currentAsset.type) {
          if (trimmedLine.toLowerCase().includes('stock') || 
              trimmedLine.toLowerCase().includes('action')) {
            currentAsset.type = 'stock';
          } else if (trimmedLine.toLowerCase().includes('etf')) {
            currentAsset.type = 'etf';
          } else if (trimmedLine.toLowerCase().includes('crypto')) {
            currentAsset.type = 'crypto';
          }
        }
        
        // Extraction de l'allocation s'il n'a pas été trouvé
        if (!currentAsset.allocation && trimmedLine.match(/allocation|pourcentage|%/i)) {
          const allocationMatch = trimmedLine.match(/(\d+)%/);
          if (allocationMatch) currentAsset.allocation = parseInt(allocationMatch[1]);
        }
        
        // Extraction de la raison
        if (trimmedLine.match(/raison|justification|explication|en raison|car|parce que/i) ||
            (currentAsset.name && currentAsset.symbol && currentAsset.type && 
             currentAsset.allocation && !currentAsset.reason)) {
          currentAsset.reason = trimmedLine.replace(/^raison|justification|explication:/i, '').trim();
        }
      }
    }
    
    // Ajouter le dernier actif s'il est complet
    if (currentAsset && currentAsset.name && currentAsset.symbol && 
        currentAsset.type && currentAsset.allocation) {
      portfolio.push(currentAsset);
    }
    
    return portfolio;
  }
  
  /**
   * Ajouter un horodatage aux raisons
   * @private
   */
  _addTimestampToReasons(portfolio) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return portfolio.map(asset => ({
      ...asset,
      reason: `${asset.reason} (Analyse à ${timeStr})`
    }));
  }
}

// Exporter les services
export const perplexityService = new PerplexityService();
export const claudeService = new ClaudeService();
