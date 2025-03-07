// marketEvents.js
// Module pour analyser et afficher les événements à fort impact sur les marchés

// Service d'analyse des événements à fort impact
class MarketEventsAnalyzer {
  constructor() {
    this.eventCache = null;
    this.cacheTimestamp = null;
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes en millisecondes
  }

  /**
   * Vérifie si le cache est valide
   * @returns {boolean} true si le cache est valide
   */
  isCacheValid() {
    if (!this.eventCache || !this.cacheTimestamp) return false;
    
    const now = new Date();
    const cacheAge = now - this.cacheTimestamp;
    return cacheAge < this.cacheDuration;
  }

  /**
   * Analyse les actualités pour extraire les événements à fort impact
   * @param {Array} newsData - Actualités financières
   * @returns {Promise<Array>} Liste des événements à fort impact
   */
  async analyzeHighImpactEvents(newsData) {
    // Vérifier si le cache est valide
    if (this.isCacheValid()) {
      console.log('Utilisation des événements en cache');
      return this.eventCache;
    }

    if (!newsData || newsData.length === 0) {
      throw new Error('Aucune actualité disponible pour analyser les événements');
    }

    try {
      // Préparer le prompt pour l'API Perplexity/ChatGPT
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

      // Appeler l'API pour obtenir les événements
      let events;
      
      try {
        // Essayer d'utiliser l'API Perplexity via MCP si disponible
        console.log('Appel à l\'API Perplexity pour analyser les événements...');
        events = await this.callPerplexityAPI(prompt);
      } catch (error) {
        console.warn('Erreur avec l\'API Perplexity, utilisation des données simulées', error);
        // Génération de données simulées comme fallback
        events = this.generateMockEvents(newsData);
      }

      // Trier par score d'impact (du plus élevé au plus faible)
      const sortedEvents = events.sort((a, b) => b.impactScore - a.impactScore);

      // Mettre à jour le cache
      this.eventCache = sortedEvents;
      this.cacheTimestamp = new Date();

      return sortedEvents;
    } catch (error) {
      console.error('Erreur lors de l\'analyse des événements à fort impact:', error);
      throw error;
    }
  }

  /**
   * Appelle l'API Perplexity ou OpenAI pour analyser les événements
   * Avec les clés API qui pourraient être définies dans le code
   * @param {string} prompt - Le prompt à envoyer à l'API
   * @returns {Promise<Array>} Liste des événements
   */
  async callPerplexityAPI(prompt) {
    // Simuler une réponse d'API pour le moment
    // À remplacer par un vrai appel API avec chat_with_perplexity ou chat_with_openai
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simuler le délai réseau
    
    // Simulation de réponse
    return this.generateMockEvents();
  }

  /**
   * Génère des données simulées en cas d'échec de l'API
   * @param {Array} newsData - Actualités disponibles
   * @returns {Array} Événements à fort impact simulés
   */
  generateMockEvents(newsData = []) {
    // Extraire quelques mots-clés des actualités si disponibles
    const keywords = [];
    if (newsData && newsData.length > 0) {
      newsData.forEach(news => {
        const title = news.title.toLowerCase();
        if (title.includes('bitcoin') || title.includes('crypto')) keywords.push('crypto');
        if (title.includes('taux') || title.includes('bce') || title.includes('fed')) keywords.push('taux');
        if (title.includes('tech') || title.includes('IA')) keywords.push('tech');
        if (title.includes('pétrole') || title.includes('gaz')) keywords.push('énergie');
      });
    }

    // Événements de base
    const baseEvents = [
      {
        title: "Décision de taux de la BCE",
        marketType: "actions",
        explanation: "La BCE maintient ses taux d'intérêt, impactant les marchés européens et le secteur bancaire.",
        impactScore: 8,
        affectedSymbols: ["EURO STOXX", "BNP.PA", "DB"],
        timing: "immédiat"
      },
      {
        title: "Publication des chiffres de l'emploi américain",
        marketType: "forex",
        explanation: "Des données sur l'emploi meilleures que prévu renforcent le dollar face aux autres devises.",
        impactScore: 7,
        affectedSymbols: ["EUR/USD", "GBP/USD", "USD/JPY"],
        timing: "court terme"
      },
      {
        title: "Progression de l'adoption de l'intelligence artificielle",
        marketType: "actions",
        explanation: "Plusieurs entreprises technologiques annoncent des avancées majeures en IA, stimulant le secteur.",
        impactScore: 9,
        affectedSymbols: ["NVDA", "GOOG", "MSFT", "META"],
        timing: "moyen terme"
      },
      {
        title: "Tensions géopolitiques au Moyen-Orient",
        marketType: "commodities",
        explanation: "Les craintes d'une perturbation de l'approvisionnement en pétrole font grimper les prix.",
        impactScore: 6,
        affectedSymbols: ["CL=F", "BZ=F", "XOM"],
        timing: "court terme"
      },
      {
        title: "Régulation crypto en Europe",
        marketType: "crypto",
        explanation: "Nouvelles réglementations sur les cryptomonnaies impactant les exchanges et la liquidité.",
        impactScore: 8,
        affectedSymbols: ["BTC", "ETH", "COIN"],
        timing: "moyen terme"
      }
    ];

    // Si nous avons des mots-clés des actualités, ajouter des événements supplémentaires
    if (keywords.includes('crypto')) {
      baseEvents.push({
        title: "Hausse d'adoption institutionnelle du Bitcoin",
        marketType: "crypto",
        explanation: "De nouveaux investisseurs institutionnels annoncent des allocations en Bitcoin dans leurs portefeuilles.",
        impactScore: 7,
        affectedSymbols: ["BTC", "ETH", "SOL"],
        timing: "court terme"
      });
    }

    if (keywords.includes('tech')) {
      baseEvents.push({
        title: "Nouvelles avancées dans les puces d'IA",
        marketType: "actions",
        explanation: "Annonce de nouvelles architectures de puces plus performantes pour les applications d'IA.",
        impactScore: 8,
        affectedSymbols: ["NVDA", "AMD", "AVGO"],
        timing: "moyen terme"
      });
    }

    // Ajouter un peu d'aléatoire pour les scores d'impact
    return baseEvents.map(event => ({
      ...event,
      impactScore: Math.min(10, Math.max(1, event.impactScore + (Math.random() > 0.5 ? 1 : -1)))
    }));
  }
}

// Gestionnaire d'interface pour la section des événements
class MarketEventsUI {
  constructor(container, analyzer) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.analyzer = analyzer || new MarketEventsAnalyzer();
    this.isLoading = false;
    this.hasError = false;
    this.events = [];
    this.expandedEventIndex = null;
  }

  /**
   * Initialise la section des événements
   */
  init() {
    if (!this.container) {
      console.error('Conteneur pour les événements non trouvé');
      return;
    }

    // Injecter les styles CSS
    this.injectStyles();

    // Créer la structure de base
    this.container.innerHTML = `
      <section class="events-section">
        <div class="section-header">
          <h2><i class="fas fa-bolt"></i> Événements à fort impact aujourd'hui</h2>
          <div class="section-controls">
            <button class="refresh-button" id="refreshEventsButton" title="Actualiser les événements">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
        <div class="events-container" id="eventsContainer">
          <div class="loading-events">
            <div class="spinner"></div>
            <p>Analyse des événements à fort impact en cours...</p>
          </div>
        </div>
      </section>
    `;

    // Ajouter les écouteurs d'événements
    const refreshButton = this.container.querySelector('#refreshEventsButton');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refreshEvents());
    }
  }

  /**
   * Injecte les styles CSS nécessaires
   */
  injectStyles() {
    // Vérifier si les styles sont déjà présents
    if (document.getElementById('market-events-styles')) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'market-events-styles';
    styleElement.textContent = `
      /* Styles pour la section des événements à fort impact */
      .events-section {
        background-color: var(--card-bg, #1a1a1a);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: var(--shadow, 0 4px 6px rgba(0, 0, 0, 0.3));
        margin-bottom: 2rem;
        border: 1px solid var(--primary-color, #1E90FF);
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-color, #333333);
      }

      .events-section h2 {
        margin-bottom: 0;
        display: flex;
        align-items: center;
        font-size: var(--heading-size, 1.5rem);
        color: var(--primary-color, #1E90FF);
      }

      .events-section h2 i {
        margin-right: 0.8rem;
        color: var(--primary-color, #1E90FF);
      }

      .section-controls {
        display: flex;
        gap: 0.5rem;
      }

      .events-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 1.5rem;
      }

      .event-card {
        background-color: var(--bg-light, #1e1e1e);
        border-radius: 8px;
        overflow: hidden;
        transition: all 0.3s ease;
        border-left: 4px solid transparent;
        position: relative;
        cursor: pointer;
      }

      .event-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 15px rgba(0, 0, 0, 0.3);
      }

      .event-card.expanded {
        grid-column: 1 / -1;
      }

      /* Classes d'impact avec leurs couleurs correspondantes */
      .event-card.critical-impact {
        border-left-color: #ff3d00; /* Rouge intense */
      }

      .event-card.high-impact {
        border-left-color: #ff9100; /* Orange */
      }

      .event-card.medium-impact {
        border-left-color: #ffd600; /* Jaune */
      }

      .event-card.low-impact {
        border-left-color: #64dd17; /* Vert */
      }

      .event-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background-color: rgba(0, 0, 0, 0.1);
      }

      .event-title {
        display: flex;
        align-items: center;
        gap: 0.8rem;
      }

      .event-title i {
        font-size: 1.2rem;
        color: var(--primary-color, #1E90FF);
      }

      .event-title h3 {
        margin: 0;
        font-size: var(--subheading-size, 1.2rem);
        color: var(--text-bright, #ffffff);
      }

      .event-score {
        background-color: rgba(0, 0, 0, 0.2);
        padding: 0.5rem 0.8rem;
        border-radius: 4px;
        text-align: center;
      }

      .impact-label {
        font-size: 0.7rem;
        color: var(--text-muted, #888888);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .impact-value {
        font-size: 1.1rem;
        font-weight: 700;
      }

      /* Couleurs des scores d'impact */
      .critical-impact .impact-value {
        color: #ff3d00; /* Rouge intense */
      }

      .high-impact .impact-value {
        color: #ff9100; /* Orange */
      }

      .medium-impact .impact-value {
        color: #ffd600; /* Jaune */
      }

      .low-impact .impact-value {
        color: #64dd17; /* Vert */
      }

      .event-details {
        padding: 1rem;
      }

      .event-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.8rem;
      }

      .event-market-type, .event-timing {
        font-size: 0.8rem;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        background-color: rgba(30, 144, 255, 0.1);
        color: var(--primary-color, #1E90FF);
      }

      .event-explanation {
        margin-bottom: 1rem;
        line-height: 1.5;
        color: var(--text-color, #e0e0e0);
      }

      .event-symbols {
        margin-top: 0.8rem;
      }

      .symbols-label {
        display: block;
        font-size: 0.8rem;
        color: var(--text-muted, #888888);
        margin-bottom: 0.4rem;
      }

      .symbols-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .symbol-tag {
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.3rem 0.5rem;
        border-radius: 4px;
        background-color: rgba(255, 255, 255, 0.1);
        color: var(--text-bright, #ffffff);
      }

      .events-empty {
        grid-column: 1 / -1;
        padding: 2rem;
        text-align: center;
        color: var(--text-muted, #888888);
        font-style: italic;
        background-color: var(--bg-light, #1e1e1e);
        border-radius: 8px;
      }

      .loading-events, .events-error {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem;
        text-align: center;
      }

      .loading-events .spinner {
        width: 30px;
        height: 30px;
        border: 3px solid rgba(30, 144, 255, 0.2);
        border-top-color: var(--primary-color, #1E90FF);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 0.8rem;
      }

      .events-error i {
        font-size: 2rem;
        color: var(--loss-color, #ff3d00);
        margin-bottom: 1rem;
      }

      .retry-button {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        background-color: var(--primary-color, #1E90FF);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
        margin-top: 1rem;
      }

      .retry-button:hover {
        background-color: var(--primary-dark, #0078e7);
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Styles responsive */
      @media (max-width: 768px) {
        .events-container {
          grid-template-columns: 1fr;
        }
        
        .event-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }
        
        .event-score {
          align-self: flex-end;
        }
      }
    `;

    document.head.appendChild(styleElement);
  }

  /**
   * Charge et affiche les événements à fort impact
   * @param {Array} newsData - Actualités financières
   */
  async loadEvents(newsData) {
    this.isLoading = true;
    this.hasError = false;
    this.renderState();

    try {
      // Analyser les événements à fort impact
      this.events = await this.analyzer.analyzeHighImpactEvents(newsData);
      this.isLoading = false;
      this.renderEvents();
    } catch (error) {
      console.error('Erreur lors du chargement des événements:', error);
      this.isLoading = false;
      this.hasError = true;
      this.renderState();
    }
  }

  /**
   * Rafraîchit les événements
   */
  refreshEvents() {
    // Si nous avons déjà des actualités, les utiliser
    // Sinon, essayer de les récupérer depuis le DOM
    const existingNews = window.newsData || this.extractNewsFromDOM();
    
    if (existingNews && existingNews.length > 0) {
      this.loadEvents(existingNews);
    } else {
      console.error('Aucune actualité disponible pour rafraîchir les événements');
      this.hasError = true;
      this.renderState();
    }
  }

  /**
   * Tente d'extraire les actualités du DOM si elles ne sont pas disponibles dans la variable globale
   * @returns {Array} Actualités extraites ou tableau vide
   */
  extractNewsFromDOM() {
    const newsCards = document.querySelectorAll('.news-card');
    if (!newsCards || newsCards.length === 0) return [];

    const extractedNews = [];
    
    newsCards.forEach(card => {
      const title = card.querySelector('h3')?.textContent || '';
      const source = card.querySelector('.news-source')?.textContent || '';
      const summary = card.querySelector('p')?.textContent || '';
      
      // Extraire le sentiment (positif/négatif)
      const impactElement = card.querySelector('.impact-level');
      const sentiment = impactElement?.classList.contains('positive') ? 'positive' : 'negative';
      
      // Estimer l'impact en fonction de la largeur de la barre
      let impact = 25; // Valeur par défaut
      if (impactElement) {
        const widthStyle = impactElement.style.width;
        const percentMatch = widthStyle.match(/(\d+)%/);
        if (percentMatch && percentMatch[1]) {
          impact = Math.floor((parseInt(percentMatch[1]) / 100) * 50); // Convertir en score sur 50
        }
      }

      extractedNews.push({ title, source, summary, sentiment, impact });
    });
    
    return extractedNews;
  }

  /**
   * Affiche l'état actuel (chargement/erreur)
   */
  renderState() {
    const eventsContainer = this.container.querySelector('#eventsContainer');
    if (!eventsContainer) return;

    if (this.isLoading) {
      eventsContainer.innerHTML = `
        <div class="loading-events">
          <div class="spinner"></div>
          <p>Analyse des événements à fort impact en cours...</p>
        </div>
      `;
    } else if (this.hasError) {
      eventsContainer.innerHTML = `
        <div class="events-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Impossible d'analyser les événements à fort impact</p>
          <button class="retry-button" id="retryEventsButton">
            <i class="fas fa-sync-alt"></i> Réessayer
          </button>
        </div>
      `;

      // Ajouter l'écouteur pour le bouton "Réessayer"
      const retryButton = eventsContainer.querySelector('#retryEventsButton');
      if (retryButton) {
        retryButton.addEventListener('click', () => this.refreshEvents());
      }
    } else if (!this.events || this.events.length === 0) {
      eventsContainer.innerHTML = `
        <div class="events-empty">
          Aucun événement à fort impact identifié aujourd'hui
        </div>
      `;
    }
  }

  /**
   * Affiche les événements
   */
  renderEvents() {
    const eventsContainer = this.container.querySelector('#eventsContainer');
    if (!eventsContainer || !this.events || this.events.length === 0) {
      this.renderState();
      return;
    }

    // Générer le HTML pour chaque événement
    let eventsHTML = '';
    this.events.forEach((event, index) => {
      // Déterminer la classe d'impact
      const impactClass = this.getImpactClass(event.impactScore);
      
      // Déterminer l'icône du marché
      const marketIcon = this.getMarketIcon(event.marketType);
      
      // Construire le HTML pour cet événement
      eventsHTML += `
        <div class="event-card ${impactClass} ${this.expandedEventIndex === index ? 'expanded' : ''}" 
             data-event-index="${index}" 
             data-event-id="event-${index}">
          <div class="event-header">
            <div class="event-title">
              <i class="fas ${marketIcon}"></i>
              <h3>${event.title}</h3>
            </div>
            <div class="event-score">
              <div class="impact-label">Impact</div>
              <div class="impact-value">${event.impactScore}/10</div>
            </div>
          </div>

          <div class="event-details">
            <div class="event-info">
              <span class="event-market-type">${event.marketType}</span>
              <span class="event-timing">${event.timing}</span>
            </div>
            
            <p class="event-explanation">${event.explanation}</p>

            <div class="event-symbols">
              <span class="symbols-label">Symboles affectés:</span>
              <div class="symbols-list">
                ${event.affectedSymbols.map(symbol => `
                  <span class="symbol-tag">${symbol}</span>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    eventsContainer.innerHTML = eventsHTML;

    // Ajouter les écouteurs d'événements pour le clic sur les cartes
    const eventCards = eventsContainer.querySelectorAll('.event-card');
    eventCards.forEach(card => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.eventIndex, 10);
        this.toggleEvent(index);
      });
    });
  }

  /**
   * Bascule l'état déplié d'un événement
   * @param {number} index - Index de l'événement à basculer
   */
  toggleEvent(index) {
    this.expandedEventIndex = this.expandedEventIndex === index ? null : index;
    this.renderEvents();
  }

  /**
   * Renvoie la classe CSS en fonction du score d'impact
   * @param {number} score - Score d'impact (1-10)
   * @returns {string} Classe CSS correspondante
   */
  getImpactClass(score) {
    if (score >= 8) return 'critical-impact';
    if (score >= 6) return 'high-impact';
    if (score >= 4) return 'medium-impact';
    return 'low-impact';
  }

  /**
   * Renvoie l'icône FontAwesome en fonction du type de marché
   * @param {string} marketType - Type de marché
   * @returns {string} Classe CSS de l'icône
   */
  getMarketIcon(marketType) {
    switch (marketType.toLowerCase()) {
      case 'actions':
      case 'stock':
      case 'stocks':
        return 'fa-chart-line';
      case 'etf':
      case 'etfs':
        return 'fa-layer-group';
      case 'crypto':
      case 'cryptocurrency':
        return 'fa-bitcoin-sign';
      case 'forex':
        return 'fa-money-bill-transfer';
      case 'commodities':
      case 'matières premières':
        return 'fa-gas-pump';
      default:
        return 'fa-chart-pie';
    }
  }
}

// Initialisation globale
document.addEventListener('DOMContentLoaded', function() {
  // Créer un élément div pour contenir la section
  const eventsContainer = document.createElement('div');
  eventsContainer.id = 'market-events-container';
  
  // Trouver l'endroit où insérer la section (après les actualités)
  const newsSection = document.getElementById('breaking-news');
  if (newsSection) {
    newsSection.parentNode.insertBefore(eventsContainer, newsSection.nextSibling);
    
    // Initialiser l'interface des événements
    const eventsUI = new MarketEventsUI(eventsContainer);
    eventsUI.init();
    
    // Observer les changements dans les actualités pour mettre à jour les événements
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Si des actualités ont été ajoutées, extraire les données et mettre à jour les événements
          const newsData = window.newsData || eventsUI.extractNewsFromDOM();
          if (newsData && newsData.length > 0) {
            eventsUI.loadEvents(newsData);
            break;
          }
        }
      }
    });
    
    // Observer les changements dans la grille d'actualités
    const newsGrid = document.querySelector('.news-grid');
    if (newsGrid) {
      observer.observe(newsGrid, { childList: true, subtree: true });
    }
    
    // Charger les événements au démarrage
    setTimeout(() => {
      const newsData = window.newsData || eventsUI.extractNewsFromDOM();
      if (newsData && newsData.length > 0) {
        eventsUI.loadEvents(newsData);
      }
    }, 1000);
  } else {
    console.error('Section des actualités non trouvée');
  }
});
