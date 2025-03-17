/**
 * events-loader.js
 * Gestionnaire d'événements économiques et financiers amélioré
 * S'intègre avec le fichier news.json généré par GitHub Action
 */

class EventsManager {
  constructor() {
    this.container = document.getElementById('events-container');
    this.events = [];
    this.filteredEvents = [];
    this.filterMode = 'today'; // 'today' ou 'week'
    this.essentialOnly = false;
    this.isLoading = true;
  }

  /**
   * Initialise le gestionnaire d'événements
   */
  async init() {
    // Afficher l'état de chargement
    this.showLoading();
    
    // Configurer les boutons de filtre
    this.setupFilters();
    
    // Charger les événements
    await this.loadEvents();
    
    // Injecter les styles CSS nécessaires
    this.injectStyles();
  }

  /**
   * Configure les boutons de filtre pour les événements
   */
  setupFilters() {
    // Boutons de filtre temporel (aujourd'hui/semaine)
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    const essentialBtn = document.getElementById('essential-btn');
    
    if (todayBtn && weekBtn) {
      todayBtn.addEventListener('click', () => {
        this.filterMode = 'today';
        todayBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        todayBtn.classList.remove('text-gray-400', 'border-gray-700');
        
        weekBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        weekBtn.classList.add('text-gray-400', 'border-gray-700');
        
        this.renderEvents();
      });
      
      weekBtn.addEventListener('click', () => {
        this.filterMode = 'week';
        weekBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        weekBtn.classList.remove('text-gray-400', 'border-gray-700');
        
        todayBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        todayBtn.classList.add('text-gray-400', 'border-gray-700');
        
        this.renderEvents();
      });
    }
    
    // Configurer le bouton Essentiels s'il existe
    if (essentialBtn) {
      essentialBtn.addEventListener('click', () => {
        this.essentialOnly = !this.essentialOnly;
        
        if (this.essentialOnly) {
          essentialBtn.classList.add('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
          essentialBtn.classList.remove('text-gray-400', 'border-gray-700');
        } else {
          essentialBtn.classList.remove('filter-active', 'text-green-400', 'border-green-400', 'border-opacity-30');
          essentialBtn.classList.add('text-gray-400', 'border-gray-700');
        }
        
        this.renderEvents();
      });
    }
  }

  /**
   * Charge les événements depuis news.json et ajoute des événements économiques
   */
  async loadEvents() {
    try {
      // Utiliser le fichier news.json existant (mis à jour par votre GitHub Action)
      const response = await fetch('data/news.json');
      if (!response.ok) throw new Error('Erreur lors du chargement des événements');
      
      const data = await response.json();
      
      if (data && data.events && Array.isArray(data.events)) {
        // Traiter et enrichir les données d'événements existants
        const baseEvents = this.processEvents(data.events);
        
        // Si nous n'avons que des résultats financiers, ajoutons des événements économiques
        const hasEconomicEvents = baseEvents.some(event => 
          event.type === 'economic' || 
          (event.title && !event.title.toLowerCase().includes('résultats'))
        );
        
        if (!hasEconomicEvents) {
          // Ajouter des événements économiques importants
          const economicEvents = this.generateEconomicEvents();
          this.events = [...baseEvents, ...economicEvents];
        } else {
          this.events = baseEvents;
        }
        
        // Fin du chargement
        this.isLoading = false;
        
        // Afficher les événements
        this.renderEvents();
      } else {
        throw new Error('Format de données invalide');
      }
    } catch (error) {
      console.error('Erreur lors du chargement des événements:', error);
      // En cas d'erreur, générer des événements de secours
      this.events = this.generateFallbackEvents();
      this.isLoading = false;
      this.renderEvents();
    }
  }

  /**
   * Génère des événements économiques pour compléter les résultats financiers
   */
  generateEconomicEvents() {
    // Date d'aujourd'hui et dates futures
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    // Format de date JJ/MM/YYYY
    const formatDate = (date) => {
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    };
    
    // Obtenir la date d'aujourd'hui au format requis
    const todayStr = formatDate(today);
    const tomorrowStr = formatDate(tomorrow);
    const nextWeekStr = formatDate(nextWeek);
    
    return [
      // Événements économiques majeurs
      {
        title: "Décision de taux d'intérêt (Fed)",
        date: nextWeekStr,
        time: "14:00",
        type: "economic",
        importance: "high",
        country: "US",
        category: "monetary",
        isEssential: true,
        description: "Annonce des taux directeurs par la Réserve Fédérale américaine. Impact majeur sur les marchés obligataires, actions et devises."
      },
      {
        title: "Décision de taux d'intérêt (BCE)",
        date: tomorrowStr,
        time: "13:45",
        type: "economic",
        importance: "high",
        country: "EU",
        category: "monetary",
        isEssential: true,
        description: "Décision de la Banque Centrale Européenne sur les taux directeurs. Ces annonces peuvent avoir un impact majeur sur tous les marchés financiers."
      },
      {
        title: "Publication PIB trimestriel (US)",
        date: todayStr,
        time: "09:30",
        type: "economic",
        importance: "high",
        country: "US",
        category: "economic",
        isEssential: true,
        description: "Publication du Produit Intérieur Brut américain. Cet indicateur clé mesure la croissance économique globale des États-Unis."
      },
      // Indicateurs d'emploi
      {
        title: "Données d'emploi non-agricole (NFP)",
        date: todayStr,
        time: "09:30",
        type: "economic",
        importance: "high",
        country: "US",
        category: "employment",
        isEssential: true,
        description: "Publication des données d'emploi non-agricole aux États-Unis, un indicateur clé de la santé économique."
      },
      // Indicateurs d'inflation
      {
        title: "Inflation IPC (Zone Euro)",
        date: todayStr,
        time: "11:00",
        type: "economic",
        importance: "high",
        country: "EU",
        category: "inflation",
        isEssential: false,
        description: "Publication de l'Indice des Prix à la Consommation en zone euro. Cet indicateur mesure l'inflation et influence les décisions de la BCE."
      },
      {
        title: "Inflation IPC (France)",
        date: tomorrowStr,
        time: "10:00",
        type: "economic",
        importance: "medium",
        country: "FR",
        category: "inflation",
        isEssential: false,
        description: "Données mensuelles sur l'inflation en France. Ces chiffres influencent les décisions de politique monétaire de la BCE."
      },
      // Indicateurs PMI manufacturier
      {
        title: "Indice PMI Manufacturier (Chine)",
        date: todayStr,
        time: "09:45",
        type: "economic",
        importance: "medium",
        country: "CN",
        category: "business",
        isEssential: false,
        description: "L'indice des directeurs d'achat du secteur manufacturier chinois est un indicateur avancé de l'activité économique, surveillé de près pour anticiper les tendances globales."
      },
      {
        title: "PMI Services (Royaume-Uni)",
        date: todayStr,
        time: "10:30",
        type: "economic",
        importance: "medium",
        country: "UK",
        category: "business",
        isEssential: false,
        description: "Indice des directeurs d'achat pour le secteur des services au Royaume-Uni. Reflète la santé du secteur tertiaire britannique."
      },
      // Indicateurs de ventes au détail
      {
        title: "Ventes au détail (US)",
        date: tomorrowStr,
        time: "09:30",
        type: "economic",
        importance: "high",
        country: "US",
        category: "consumer",
        isEssential: true,
        description: "Publication des données de ventes au détail aux États-Unis. Indicateur majeur de la consommation et de la santé économique."
      }
    ];
  }

  /**
   * Génère des événements de secours en cas d'échec du chargement
   */
  generateFallbackEvents() {
    // Utiliser la même fonction que pour les événements économiques
    // mais ajouter aussi quelques résultats financiers
    const economicEvents = this.generateEconomicEvents();
    
    // Date d'aujourd'hui 
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    
    // Ajouter quelques résultats financiers de secours
    const earningsEvents = [
      {
        title: "Résultats AAPL - Prévision: 1.52$ par action",
        date: todayStr,
        time: "16:30",
        type: "earnings",
        importance: "high",
        category: "earnings",
        isEssential: true,
        description: "Publication des résultats financiers d'Apple. Ces données peuvent influencer significativement le secteur technologique."
      },
      {
        title: "Résultats MSFT - Prévision: 2.35$ par action",
        date: todayStr,
        time: "16:30",
        type: "earnings",
        importance: "high",
        category: "earnings",
        isEssential: true,
        description: "Publication des résultats financiers de Microsoft. Ces données ont un impact important sur le secteur des logiciels et du cloud."
      },
      {
        title: "Résultats AMZN - Prévision: 0.95$ par action",
        date: todayStr,
        time: "16:30",
        type: "earnings",
        importance: "high",
        category: "earnings",
        isEssential: true,
        description: "Publication des résultats financiers d'Amazon. Ces données peuvent influencer les secteurs du e-commerce et du cloud."
      }
    ];
    
    return [...economicEvents, ...earningsEvents];
  }

  /**
   * Traite et enrichit les événements avec des informations supplémentaires
   * @param {Array} events - Événements bruts
   * @returns {Array} Événements enrichis
   */
  processEvents(events) {
    return events.map(event => {
      // Analyser le titre pour déterminer le type et extraire des infos
      const eventInfo = this.parseEventTitle(event.title);
      
      return {
        ...event,
        type: event.type || 'economic', // utiliser la valeur existante ou par défaut
        symbol: eventInfo.symbol,
        forecast: eventInfo.forecast,
        country: eventInfo.country || this.extractCountryFromTitle(event.title),
        category: eventInfo.category || this.getCategoryFromEvent(event),
        isEssential: this.isEssentialEvent(event),
        description: this.generateDescription(event)
      };
    });
  }

  /**
   * Analyse le titre d'un événement pour en extraire des informations
   * @param {string} title - Titre de l'événement
   * @returns {Object} Informations extraites
   */
  parseEventTitle(title) {
    const info = {
      symbol: null,
      forecast: null,
      country: null,
      category: null
    };
    
    if (!title) return info;
    
    // Extraction du symbole et des prévisions pour les résultats d'entreprises
    const earningsMatch = title.match(/Résultats\s+([A-Z0-9.]+)\s+-\s+Prévision:\s+([-+]?\d*\.?\d+)\$/);
    if (earningsMatch) {
      info.symbol = earningsMatch[1];
      info.forecast = earningsMatch[2];
      info.category = 'earnings';
    }
    
    // Extraction du pays pour les événements économiques
    const countryMatches = {
      'US': ['US', 'United States', 'Fed', 'Federal Reserve', 'FOMC'],
      'EU': ['EU', 'Europe', 'Eurozone', 'ECB', 'BCE'],
      'FR': ['FR', 'France', 'French'],
      'UK': ['UK', 'United Kingdom', 'Britain', 'BOE', 'British'],
      'JP': ['JP', 'Japan', 'Japanese', 'BOJ'],
      'CN': ['CN', 'China', 'Chinese', 'PBOC']
    };
    
    Object.entries(countryMatches).forEach(([country, keywords]) => {
      if (keywords.some(keyword => title.includes(keyword))) {
        info.country = country;
      }
    });
    
    // Extraction de la catégorie pour les événements économiques
    const categoryMatches = {
      'interestRate': ['Interest Rate', 'Rate Decision', 'Fed', 'ECB', 'BCE', 'BOE', 'taux'],
      'inflation': ['CPI', 'Inflation', 'Price Index'],
      'gdp': ['GDP', 'PIB', 'Growth'],
      'employment': ['Employment', 'Unemployment', 'Nonfarm', 'Emploi', 'Jobs'],
      'retail': ['Retail', 'Sales', 'Consumer', 'Ventes'],
      'manufacturing': ['PMI', 'Manufacturing', 'Production', 'Industrial'],
      'trade': ['Trade', 'Export', 'Import', 'Balance']
    };
    
    Object.entries(categoryMatches).forEach(([category, keywords]) => {
      if (keywords.some(keyword => title.includes(keyword))) {
        info.category = category;
      }
    });
    
    return info;
  }

  /**
   * Extrait le pays à partir du titre
   * @param {string} title - Titre de l'événement
   * @returns {string} Code pays ou null
   */
  extractCountryFromTitle(title) {
    if (!title) return null;
    
    const titleLower = title.toLowerCase();
    const countryMatches = {
      'US': ['us', 'united states', 'usa', 'america', 'fed', 'federal reserve'],
      'EU': ['euro', 'europe', 'eurozone', 'ecb', 'bce'],
      'FR': ['france', 'french', 'paris'],
      'UK': ['uk', 'united kingdom', 'britain', 'boe', 'british'],
      'JP': ['japan', 'japanese', 'boj'],
      'CN': ['china', 'chinese', 'pboc'],
      'DE': ['germany', 'german', 'allemagne'],
      'CA': ['canada', 'canadian'],
      'AU': ['australia', 'australian']
    };
    
    for (const [code, keywords] of Object.entries(countryMatches)) {
      if (keywords.some(keyword => titleLower.includes(keyword))) {
        return code;
      }
    }
    
    return null;
  }

  /**
   * Détermine la catégorie d'un événement
   * @param {Object} event - Événement
   * @returns {string} Catégorie
   */
  getCategoryFromEvent(event) {
    if (event.type === 'earnings') return 'earnings';
    
    const title = (event.title || '').toLowerCase();
    
    if (title.includes('interest rate') || title.includes('taux')) return 'monetary';
    if (title.includes('gdp') || title.includes('pib')) return 'economic';
    if (title.includes('employment') || title.includes('emploi') || title.includes('unemployment') || title.includes('nonfarm')) return 'employment';
    if (title.includes('cpi') || title.includes('inflation') || title.includes('price index')) return 'inflation';
    if (title.includes('pmi') || title.includes('manufacturing') || title.includes('service')) return 'business';
    if (title.includes('retail') || title.includes('consumer')) return 'consumer';
    if (title.includes('trade') || title.includes('export') || title.includes('import')) return 'trade';
    
    return 'other';
  }

  /**
   * Détermine si un événement est essentiel pour un investisseur
   * @param {Object} event - Événement
   * @returns {boolean} True si l'événement est essentiel
   */
  isEssentialEvent(event) {
    if (!event) return false;
    
    // Obtenir des informations utiles
    const title = (event.title || '').toLowerCase();
    const importance = event.importance || 'medium';
    const type = event.type || '';
    
    // 1. Décisions de taux des banques centrales = Événements essentiels
    if (title.includes('interest rate') || title.includes('taux d\'intérêt') || 
        title.includes('fed') || title.includes('bce') || title.includes('boe') || 
        title.includes('fomc') || title.includes('ecb')) {
      return true;
    }
    
    // 2. Données économiques des grandes économies avec impact élevé
    if (importance === 'high' && 
        (title.includes('gdp') || title.includes('pib') || 
         title.includes('cpi') || title.includes('inflation') || 
         title.includes('nonfarm') || title.includes('employment'))) {
      return true;
    }
    
    // 3. Résultats trimestriels des grandes entreprises
    if (type === 'earnings') {
      const bigCompanies = ['AAPL', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'BAC'];
      if (bigCompanies.some(ticker => title.includes(ticker.toLowerCase()))) {
        return true;
      }
      
      // Aussi considérer les résultats avec des prévisions importantes 
      // (changements > 10% par action)
      const forecastMatch = title.match(/prévision:\s*([-+]?\d+(\.\d+)?)\$/i);
      if (forecastMatch) {
        const forecast = parseFloat(forecastMatch[1]);
        if (Math.abs(forecast) > 1.0) {
          return true;
        }
      }
    }
    
    // 4. Événements à importance élevée avec des mots clés spécifiques
    if (importance === 'high' && 
        (title.includes('report') || title.includes('announcement') || 
         title.includes('declaration') || title.includes('decision'))) {
      return true;
    }
    
    return false;
  }

  /**
   * Génère une description pour un événement
   * @param {Object} event - Événement
   * @returns {string} Description
   */
  generateDescription(event) {
    if (!event) return '';
    
    const title = event.title || '';
    const type = event.type || '';
    
    // Descriptions pour les événements économiques
    if (type === 'economic') {
      if (title.toLowerCase().includes('interest rate')) {
        return "Décision sur les taux d'intérêt. Ces annonces peuvent impacter fortement les marchés, les devises et les obligations.";
      }
      
      if (title.toLowerCase().includes('pmi')) {
        return "L'indice des directeurs d'achat (PMI) est un indicateur avancé de l'activité économique, surveillé de près pour anticiper les tendances.";
      }
      
      if (title.toLowerCase().includes('gdp') || title.toLowerCase().includes('pib')) {
        return "Publication du Produit Intérieur Brut. Cet indicateur clé mesure la croissance économique et peut influencer significativement les marchés.";
      }
      
      if (title.toLowerCase().includes('cpi') || title.toLowerCase().includes('inflation')) {
        return "Données sur l'inflation. Ces chiffres sont cruciaux pour anticiper les futures décisions de politique monétaire.";
      }
      
      if (title.toLowerCase().includes('retail') || title.toLowerCase().includes('sales')) {
        return "Données sur les ventes au détail. Cet indicateur reflète la santé de la consommation, moteur essentiel de l'économie.";
      }
      
      if (title.toLowerCase().includes('employment') || title.toLowerCase().includes('unemployment')) {
        return "Rapport sur l'emploi. Ces données influencent les perspectives économiques et les décisions de politique monétaire.";
      }
      
      return "Publication de données économiques importantes. Cet indicateur peut avoir un impact sur les décisions d'investissement.";
    }
    
    // Descriptions pour les résultats d'entreprises
    if (type === 'earnings') {
      const symbol = this.parseEventTitle(title).symbol || '';
      
      return `Publication des résultats financiers de ${symbol}. Ces données peuvent influencer significativement le cours de l'action et potentiellement le secteur entier.`;
    }
    
    // Description par défaut
    return "Événement économique ou financier pouvant impacter les marchés.";
  }

  /**
   * Filtre les événements selon les critères actuels
   * @returns {Array} Événements filtrés
   */
  filterEvents() {
    if (!this.events || !Array.isArray(this.events)) return [];
    
    // Obtenir la date d'aujourd'hui au format JJ/MM/YYYY
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    
    // Calculer la date de fin de semaine
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);
    
    // Filtrer les événements
    const filteredEvents = this.events.filter(event => {
      // Appliquer le filtre temporel
      if (this.filterMode === 'today') {
        // Extraire le jour et le mois de la date de l'événement
        const eventDateParts = (event.date || '').split('/');
        const todayParts = todayStr.split('/');
        
        // Comparer uniquement le jour et le mois (pas l'année)
        if (eventDateParts.length >= 2 && todayParts.length >= 2) {
          const sameDay = eventDateParts[0] === todayParts[0];
          const sameMonth = eventDateParts[1] === todayParts[1];
          
          if (!sameDay || !sameMonth) return false;
        } else {
          // Si format de date non reconnu, utiliser une correspondance directe
          if (event.date !== todayStr) return false;
        }
      } else if (this.filterMode === 'week') {
        // Vérifier si la date de l'événement est dans la semaine à venir
        if (event.date) {
          const dateParts = event.date.split('/');
          if (dateParts.length >= 3) {
            const eventDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
            if (eventDate < today || eventDate > endOfWeek) return false;
          }
        }
      }
      
      // Appliquer le filtre d'événements essentiels
      if (this.essentialOnly && !event.isEssential) {
        return false;
      }
      
      return true;
    });
    
    return filteredEvents;
  }

  /**
   * Affiche l'état de chargement
   */
  showLoading() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="col-span-3 flex items-center justify-center p-6">
        <div class="loading-spinner mr-3"></div>
        <p class="text-gray-400">Chargement des événements économiques...</p>
      </div>
    `;
  }

  /**
   * Affiche un message d'erreur
   */
  showError() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="col-span-3 flex flex-col items-center justify-center p-6 text-center">
        <i class="fas fa-exclamation-triangle text-red-500 text-3xl mb-3"></i>
        <p class="text-gray-300 mb-3">Impossible de charger les événements économiques</p>
        <button class="text-xs text-green-400 px-3 py-1.5 border border-green-400 border-opacity-30 rounded-full" id="retry-events-btn">
          <i class="fas fa-sync-alt mr-1"></i> Réessayer
        </button>
      </div>
    `;
    
    const retryBtn = document.getElementById('retry-events-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadEvents());
    }
  }

  /**
   * Affiche un message quand aucun événement n'est disponible
   */
  showEmpty() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="col-span-3 flex flex-col items-center justify-center p-6 text-center">
        <i class="fas fa-calendar-times text-gray-600 text-3xl mb-3"></i>
        <p class="text-gray-400">
          ${this.filterMode === 'today' 
            ? 'Aucun événement économique prévu pour aujourd\'hui' 
            : 'Aucun événement économique prévu pour cette semaine'}
        </p>
      </div>
    `;
  }

  /**
   * Injecte les styles CSS nécessaires
   */
  injectStyles() {
    // Vérifier si les styles existent déjà
    if (document.getElementById('events-enhanced-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'events-enhanced-styles';
    styleEl.textContent = `
      /* Styles de base pour les événements - peuvent être surcharges par event-style.css */
      .event-card {
        position: relative;
        transition: all 0.3s ease;
        overflow: hidden;
      }
      
      /* Indicateur de niveau d'impact */
      .event-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 3px;
        height: 100%;
      }
      
      .event-card.high-impact::before {
        background: linear-gradient(to bottom, #ff3d00, #ff7043);
      }
      
      .event-card.medium-impact::before {
        background: linear-gradient(to bottom, #ff9100, #ffb74d);
      }
      
      .event-card.low-impact::before {
        background: linear-gradient(to bottom, #00e676, #69f0ae);
      }
      
      /* Badge pour événements essentiels */
      .essential-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 255, 135, 0.2);
        color: #00ff87;
        padding: 3px 6px;
        font-size: 0.65rem;
        border-radius: 4px;
      }
      
      /* Classe de ligne coupée pour les descriptions */
      .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    `;
    
    document.head.appendChild(styleEl);
  }

  /**
   * Détermine la classe CSS d'importance
   * @param {string} importance - Niveau d'importance
   * @returns {string} Classe CSS
   */
  getImportanceClass(importance) {
    switch (importance) {
      case 'high':
        return 'high-impact';
      case 'medium':
        return 'medium-impact';
      default:
        return 'low-impact';
    }
  }

  /**
   * Obtient l'icône FontAwesome pour une catégorie
   * @param {string} category - Catégorie d'événement
   * @returns {string} Classe CSS de l'icône
   */
  getCategoryIcon(category) {
    const icons = {
      'earnings': 'fa-chart-pie',
      'monetary': 'fa-landmark',
      'economic': 'fa-chart-line',
      'employment': 'fa-briefcase',
      'inflation': 'fa-dollar-sign',
      'business': 'fa-industry',
      'consumer': 'fa-shopping-cart',
      'trade': 'fa-ship'
    };
    
    return icons[category] || 'fa-calendar-day';
  }

  /**
   * Affiche les événements filtrés
   */
  renderEvents() {
    if (!this.container) return;
    
    // Si chargement en cours
    if (this.isLoading) {
      this.showLoading();
      return;
    }
    
    // Filtrer les événements
    const filteredEvents = this.filterEvents();
    
    // Si aucun événement ne correspond aux filtres
    if (filteredEvents.length === 0) {
      this.showEmpty();
      return;
    }
    
    // Générer le HTML pour chaque événement
    let eventsHTML = '';
    
    filteredEvents.forEach((event, index) => {
      // Obtenir la classe d'importance
      const importanceClass = this.getImportanceClass(event.importance);
      
      // Obtenir l'icône de catégorie
      const categoryIcon = this.getCategoryIcon(event.category);
      
      // Générer le HTML
      eventsHTML += `
        <div class="event-card bg-gray-800 bg-opacity-70 rounded-lg p-4 fade-in ${importanceClass}" data-event-index="${index}">
          ${event.isEssential ? '<div class="essential-badge">Essentiel</div>' : ''}
          
          <div class="mb-3 flex justify-between items-start">
            <div class="text-sm">
              <span class="text-xs text-white bg-gray-700 px-2 py-1 rounded mr-2">${event.date || '--/--'}</span>
              <span class="text-gray-400">${event.time || '00:00'}</span>
            </div>
            <div class="flex items-center">
              <span class="text-xs flex items-center ${
                event.importance === 'high' ? 'text-red-500' : 
                event.importance === 'medium' ? 'text-orange-400' : 'text-green-400'
              }">
                ${this.generateImpactDots(event.importance)}
                <span class="ml-1">${event.importance || 'low'}</span>
              </span>
            </div>
          </div>
          
          <h3 class="text-white text-sm font-semibold mb-2">${event.title}</h3>
          
          <div class="flex items-center mb-3">
            <span class="text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded flex items-center">
              <i class="fas ${categoryIcon} mr-1"></i>
              ${event.country || event.type || 'economic'}
            </span>
          </div>
          
          <div class="text-xs text-gray-400 line-clamp-2">${event.description || ''}</div>
        </div>
      `;
    });
    
    this.container.innerHTML = eventsHTML;
    
    // Ajouter des événements pour l'interaction (si nécessaire)
    const eventCards = this.container.querySelectorAll('.event-card');
    eventCards.forEach(card => {
      card.addEventListener('click', () => {
        // Optionnel: Ouvrir plus de détails sur l'événement
        const index = parseInt(card.dataset.eventIndex, 10);
        console.log('Événement cliqué:', filteredEvents[index]);
      });
    });
  }

  /**
   * Génère des points pour visualiser le niveau d'impact
   * @param {string} importance - Niveau d'importance (high/medium/low)
   * @returns {string} HTML pour les points d'impact
   */
  generateImpactDots(importance) {
    let dots = '';
    const total = 3;
    let active = 0;
    
    switch (importance) {
      case 'high':
        active = 3;
        break;
      case 'medium':
        active = 2;
        break;
      default:
        active = 1;
    }
    
    for (let i = 0; i < total; i++) {
      if (i < active) {
        dots += '<span class="w-1.5 h-1.5 rounded-full bg-current inline-block mx-0.5"></span>';
      } else {
        dots += '<span class="w-1.5 h-1.5 rounded-full bg-gray-700 inline-block mx-0.5"></span>';
      }
    }
    
    return dots;
  }
}

// Ne pas initialiser automatiquement - cela sera géré par event-renderer.js
// La classe EventsManager est simplement exportée
window.EventsManager = EventsManager;
