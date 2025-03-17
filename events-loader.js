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
    
    // Ajout d'un bouton de filtre "Événements essentiels" s'il n'existe pas déjà
    const filtersContainer = document.querySelector('.flex.gap-2');
    if (filtersContainer && !document.getElementById('essential-btn')) {
      const essentialBtn = document.createElement('button');
      essentialBtn.id = 'essential-btn';
      essentialBtn.className = 'text-xs text-gray-400 px-2 py-1 border border-gray-700 rounded';
      essentialBtn.textContent = 'Essentiels';
      
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
      
      filtersContainer.appendChild(essentialBtn);
    }
  }

  /**
   * Charge les événements depuis news.json
   */
  async loadEvents() {
    try {
      // Utiliser le fichier news.json existant (mis à jour par votre GitHub Action)
      const response = await fetch('data/news.json');
      if (!response.ok) throw new Error('Erreur lors du chargement des événements');
      
      const data = await response.json();
      
      if (data && data.events && Array.isArray(data.events)) {
        // Traiter et enrichir les données d'événements
        this.events = this.processEvents(data.events);
        
        // Fin du chargement
        this.isLoading = false;
        
        // Afficher les événements
        this.renderEvents();
      } else {
        throw new Error('Format de données invalide');
      }
    } catch (error) {
      console.error('Erreur lors du chargement des événements:', error);
      this.showError();
    }
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
    
    return this.events.filter(event => {
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
      /* Styles améliorés pour les événements */
      .event-card {
        position: relative;
        transition: all 0.3s ease;
        overflow: hidden;
      }
      
      .event-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        border-color: rgba(0, 255, 135, 0.3);
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
        box-shadow: 0 0 10px rgba(255, 61, 0, 0.7);
      }
      
      .event-card.medium-impact::before {
        background: linear-gradient(to bottom, #ff9100, #ffb74d);
        box-shadow: 0 0 10px rgba(255, 145, 0, 0.6);
      }
      
      .event-card.low-impact::before {
        background: linear-gradient(to bottom, #00e676, #69f0ae);
        box-shadow: 0 0 10px rgba(0, 230, 118, 0.6);
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
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        box-shadow: 0 0 8px rgba(0, 255, 135, 0.3);
      }
      
      /* État de chargement */
      .loading-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid rgba(0, 255, 135, 0.2);
        border-top-color: #00ff87;
        border-radius: 50%;
        animation: spinner 1s linear infinite;
      }
      
      @keyframes spinner {
        to {
          transform: rotate(360deg);
        }
      }
      
      /* Animation de fondu */
      .fade-in {
        animation: fadeIn 0.5s ease forwards;
      }
      
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
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

// Initialiser le gestionnaire d'événements au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  // Attendre que le DOM soit complètement chargé
  setTimeout(() => {
    const eventsManager = new EventsManager();
    eventsManager.init();
  }, 100);
});
