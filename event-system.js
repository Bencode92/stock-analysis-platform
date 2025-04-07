/**
 * event-system.js
 * Système complet et unifié de gestion des événements - Avril 2025
 * Remplace: events-loader.js, event-renderer.js, events-date-filter.js et tous les scripts liés aux événements
 */

// Système d'événements global - accessible via window.EventSystem
window.EventSystem = {
  // Configuration et état
  config: {
    containerId: 'events-container',
    todayButtonId: 'today-filter',
    weekButtonId: 'week-filter',
    categoryFiltersId: 'event-category-filters',
    noEventsMessageId: 'no-events-message'
  },
  
  state: {
    events: [],
    initialized: false,
    isLoading: true,
    activeFilters: {
      date: 'today',
      category: 'all'
    }
  },
  
  // Méthodes d'initialisation
  init: function() {
    console.log('🚀 Initialisation du système d\'événements (version unifiée)...');
    
    // Éviter l'initialisation multiple
    if (this.state.initialized) {
      console.log('⚠️ Le système d\'événements est déjà initialisé');
      return Promise.resolve(false);
    }
    
    // Injecter les styles CSS nécessaires
    this.injectStyles();
    
    // Récupérer le conteneur d'événements
    this.container = document.getElementById(this.config.containerId);
    if (!this.container) {
      console.error('❌ Conteneur d\'événements non trouvé:', this.config.containerId);
      return Promise.resolve(false);
    }
    
    // Afficher l'état de chargement
    this.showLoading();
    
    // Configurer les filtres
    this.setupFilters();
    
    // Charger les événements
    return this.loadEvents()
      .then(() => {
        // Marquer comme initialisé
        this.state.initialized = true;
        
        // Appliquer les filtres initiaux
        this.applyFilters();
        
        // Déclencher l'événement 'events-ready'
        this.dispatchReadyEvent();
        
        console.log('✅ Système d\'événements initialisé avec succès');
        return true;
      })
      .catch(error => {
        console.error('❌ Erreur lors de l\'initialisation du système d\'événements:', error);
        // Utiliser des événements de secours en cas d'échec
        this.state.events = this.generateFallbackEvents();
        this.state.isLoading = false;
        this.renderEvents();
        return false;
      });
  },
  
  // Configure les boutons de filtre
  setupFilters: function() {
    console.log('🔄 Configuration des filtres...');
    
    // Configurer les filtres de date
    const todayBtn = document.getElementById(this.config.todayButtonId);
    const weekBtn = document.getElementById(this.config.weekButtonId);
    
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        this.setDateFilter('today');
      });
    } else {
      console.warn('⚠️ Bouton "Aujourd\'hui" non trouvé:', this.config.todayButtonId);
    }
    
    if (weekBtn) {
      weekBtn.addEventListener('click', () => {
        this.setDateFilter('week');
      });
    } else {
      console.warn('⚠️ Bouton "Cette semaine" non trouvé:', this.config.weekButtonId);
    }
    
    // Configurer les filtres de catégorie
    const categoryFilters = document.getElementById(this.config.categoryFiltersId);
    if (categoryFilters) {
      const categoryButtons = categoryFilters.querySelectorAll('button');
      
      categoryButtons.forEach(btn => {
        // Ajouter des styles au survol
        btn.addEventListener('mouseenter', function() {
          if (!this.classList.contains('filter-active')) {
            this.style.transform = 'translateY(-1px)';
            this.style.boxShadow = '0 2px 8px rgba(0, 255, 135, 0.2)';
          }
        });
        
        btn.addEventListener('mouseleave', function() {
          if (!this.classList.contains('filter-active')) {
            this.style.transform = '';
            this.style.boxShadow = '';
          }
        });
        
        // Configurer le clic pour appliquer le filtre
        btn.addEventListener('click', () => {
          const category = btn.getAttribute('data-category');
          this.setCategoryFilter(category);
        });
      });
    } else {
      console.warn('⚠️ Conteneur de filtres de catégorie non trouvé:', this.config.categoryFiltersId);
    }
  },
  
  // Définit le filtre de date actif
  setDateFilter: function(dateFilter) {
    console.log(`🔍 Application du filtre de date: ${dateFilter}`);
    
    // Mettre à jour l'état
    this.state.activeFilters.date = dateFilter;
    
    // Mettre à jour les classes sur le body pour le CSS
    if (dateFilter === 'today') {
      document.body.classList.add('today-filter-active');
      document.body.classList.remove('week-filter-active');
    } else {
      document.body.classList.remove('today-filter-active');
      document.body.classList.add('week-filter-active');
    }
    
    // Mettre à jour l'apparence des boutons
    const todayBtn = document.getElementById(this.config.todayButtonId);
    const weekBtn = document.getElementById(this.config.weekButtonId);
    
    if (todayBtn && weekBtn) {
      // Réinitialiser les styles
      [todayBtn, weekBtn].forEach(btn => {
        btn.classList.remove('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
        btn.classList.add('text-gray-400', 'border-gray-700');
      });
      
      // Appliquer les styles au bouton actif
      const activeBtn = dateFilter === 'today' ? todayBtn : weekBtn;
      activeBtn.classList.add('active', 'text-green-400', 'border-green-400', 'border-opacity-30');
      activeBtn.classList.remove('text-gray-400', 'border-gray-700');
    }
    
    // Appliquer les filtres
    this.applyFilters();
  },
  
  // Définit le filtre de catégorie actif
  setCategoryFilter: function(category) {
    console.log(`🔍 Application du filtre de catégorie: ${category}`);
    
    // Mettre à jour l'état
    this.state.activeFilters.category = category;
    
    // Mettre à jour l'apparence des boutons
    const categoryFilters = document.getElementById(this.config.categoryFiltersId);
    if (categoryFilters) {
      const categoryButtons = categoryFilters.querySelectorAll('button');
      
      categoryButtons.forEach(btn => {
        // Réinitialiser les styles
        btn.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
        btn.classList.add('text-gray-400', 'border-gray-700');
        
        // Appliquer les styles au bouton actif
        if (btn.getAttribute('data-category') === category) {
          btn.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
          btn.classList.remove('text-gray-400', 'border-gray-700');
        }
      });
    }
    
    // Appliquer les filtres
    this.applyFilters();
  },
  
  // Charge les événements depuis le fichier news.json
  loadEvents: function() {
    console.log('⏳ Chargement des événements...');
    
    return fetch('data/news.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Erreur HTTP: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data && data.events && Array.isArray(data.events)) {
          // Traiter et enrichir les données d'événements
          this.state.events = this.processEvents(data.events);
          this.state.isLoading = false;
          
          console.log(`✅ ${this.state.events.length} événements chargés avec succès`);
          
          // Afficher les événements
          this.renderEvents();
          return this.state.events;
        } else {
          throw new Error('Format de données invalide');
        }
      });
  },
  
  // Traite et enrichit les événements avec des informations supplémentaires
  processEvents: function(events) {
    return events.map(event => {
      // Analyser le titre pour déterminer le type et extraire des infos
      const eventInfo = this.parseEventTitle(event.title);
      
      // Déterminer si l'événement est essentiel
      const isEssential = this.isEssentialEvent(event);
      
      // Normaliser le type d'événement
      let normalizedType = event.type || 'economic';
      if (normalizedType === 'merger') normalizedType = 'm&a';
      
      // Enrichir l'événement
      return {
        ...event,
        type: normalizedType,
        symbol: eventInfo.symbol,
        forecast: eventInfo.forecast,
        country: eventInfo.country || this.extractCountryFromTitle(event.title),
        category: eventInfo.category || this.getCategoryFromEvent(event),
        isEssential: isEssential,
        description: event.description || this.generateDescription(event)
      };
    });
  },
  
  // Analyse le titre d'un événement pour en extraire des informations
  parseEventTitle: function(title) {
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
    
    // Extraction des infos d'IPO
    const ipoMatch = title.match(/IPO:\s+(.+)\s+\(([A-Z0-9.]+)\)/);
    if (ipoMatch) {
      info.symbol = ipoMatch[2];
      info.category = 'ipo';
    }
    
    // Extraction des infos de M&A
    const maMatch = title.match(/M&A:\s+(.+)\s+acquiert\s+(.+)/);
    if (maMatch) {
      info.category = 'm&a';
    }
    
    return info;
  },
  
  // Extrait le pays à partir du titre
  extractCountryFromTitle: function(title) {
    if (!title) return null;
    
    const titleLower = title.toLowerCase();
    const countryMatches = {
      'US': ['us', 'united states', 'usa', 'america', 'fed', 'federal reserve'],
      'EU': ['euro', 'europe', 'eurozone', 'ecb', 'bce'],
      'FR': ['france', 'french', 'paris'],
      'UK': ['uk', 'united kingdom', 'britain', 'boe', 'british'],
      'JP': ['japan', 'japanese', 'boj'],
      'CN': ['china', 'chinese', 'pboc']
    };
    
    for (const [code, keywords] of Object.entries(countryMatches)) {
      if (keywords.some(keyword => titleLower.includes(keyword))) {
        return code;
      }
    }
    
    return null;
  },
  
  // Détermine la catégorie d'un événement
  getCategoryFromEvent: function(event) {
    if (event.type === 'earnings') return 'earnings';
    if (event.type === 'ipo') return 'ipo';
    if (event.type === 'm&a' || event.type === 'merger') return 'm&a';
    
    const title = (event.title || '').toLowerCase();
    
    if (title.includes('interest rate') || title.includes('taux')) return 'monetary';
    if (title.includes('gdp') || title.includes('pib')) return 'economic';
    if (title.includes('employment') || title.includes('emploi') || title.includes('unemployment')) return 'employment';
    if (title.includes('cpi') || title.includes('inflation')) return 'inflation';
    if (title.includes('pmi') || title.includes('manufacturing')) return 'business';
    if (title.includes('retail') || title.includes('consumer')) return 'consumer';
    if (title.includes('trade') || title.includes('export') || title.includes('import')) return 'trade';
    
    return 'economic';
  },
  
  // Détermine si un événement est essentiel
  isEssentialEvent: function(event) {
    if (!event) return false;
    
    if (event.score && event.score >= 12) {
      return true;
    }
    
    const title = (event.title || '').toLowerCase();
    const importance = event.importance || 'medium';
    const type = event.type || '';
    
    // Décisions de taux des banques centrales
    if (title.includes('interest rate') || title.includes('taux') || 
        title.includes('fed') || title.includes('bce') || 
        title.includes('fomc') || title.includes('ecb')) {
      return true;
    }
    
    // Données économiques importantes
    if (importance === 'high' && 
        (title.includes('gdp') || title.includes('pib') || 
         title.includes('cpi') || title.includes('inflation') || 
         title.includes('nonfarm') || title.includes('employment'))) {
      return true;
    }
    
    return false;
  },
  
  // Génère une description pour un événement
  generateDescription: function(event) {
    if (!event) return '';
    if (event.description) return event.description;
    
    const title = event.title || '';
    const type = event.type || '';
    
    // Descriptions pour les différents types d'événements
    if (type === 'economic') {
      if (title.toLowerCase().includes('speech') || title.toLowerCase().includes('discours')) {
        return "Discours d'un responsable de banque centrale. Ces interventions peuvent donner des indications sur l'orientation future de la politique monétaire.";
      }
      
      if (title.toLowerCase().includes('interest rate') || title.toLowerCase().includes('taux')) {
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
      
      return "Publication de données économiques importantes. Cet indicateur peut avoir un impact sur les marchés et les décisions d'investissement.";
    }
    
    // Descriptions pour les autres types d'événements
    if (type === 'earnings') {
      return "Publication des résultats financiers. Ces données peuvent influencer significativement le cours de l'action et potentiellement le secteur entier.";
    }
    
    if (type === 'ipo') {
      return "Introduction en bourse à venir. Les IPOs représentent souvent des opportunités d'investissement intéressantes mais potentiellement risquées.";
    }
    
    if (type === 'm&a') {
      return "Opération de fusion-acquisition pouvant entraîner des changements significatifs pour les entreprises impliquées et leur secteur d'activité.";
    }
    
    return "Événement économique ou financier pouvant impacter les marchés.";
  },
  
  // Affiche les événements filtrés
  renderEvents: function() {
    if (!this.container) return;
    
    // Si chargement en cours
    if (this.state.isLoading) {
      this.showLoading();
      return;
    }
    
    // Filtrer les événements selon les critères actuels
    const filteredEvents = this.getFilteredEvents();
    
    // Si aucun événement ne correspond aux filtres
    if (filteredEvents.length === 0) {
      this.showEmpty();
      return;
    }
    
    // Générer le HTML pour chaque événement
    let eventsHTML = '';
    
    filteredEvents.forEach((event, index) => {
      // Déterminer l'importance pour le style
      const importanceClass = this.getImportanceClass(event.importance || 'medium');
      
      // Déterminer l'icône de catégorie
      const categoryIcon = this.getCategoryIcon(event.category || 'economic');
      
      // Normaliser le type d'événement
      const eventType = (event.type || 'economic').toLowerCase();
      
      // Générer le HTML
      eventsHTML += `
        <div class="event-card bg-gray-800 bg-opacity-70 rounded-lg p-4 fade-in ${importanceClass}" 
             data-event-index="${index}" 
             data-type="${eventType}"
             data-date="${event.date || ''}">
          ${event.isEssential ? '<div class="essential-badge">Essentiel</div>' : ''}
          
          <div class="mb-3 flex justify-between items-start">
            <div class="text-sm">
              <span class="text-xs text-white bg-gray-700 px-2 py-1 rounded mr-2 event-date">${event.date || '--/--'}</span>
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
              ${event.country || eventType}
            </span>
          </div>
          
          <div class="text-xs text-gray-400 line-clamp-2">${event.description || ''}</div>
        </div>
      `;
    });
    
    this.container.innerHTML = eventsHTML;
    
    // Appliquer une animation de fade-in
    setTimeout(() => {
      const eventCards = this.container.querySelectorAll('.event-card');
      eventCards.forEach((card, index) => {
        setTimeout(() => {
          card.classList.add('animate-fadeIn');
        }, index * 50);
      });
    }, 100);
  },
  
  // Obtient les événements filtrés selon les critères actuels
  getFilteredEvents: function() {
    if (!this.state.events || !Array.isArray(this.state.events)) return [];
    
    const { date, category } = this.state.activeFilters;
    
    return this.state.events.filter(event => {
      // Vérifier si l'événement correspond au filtre de date
      const matchesDate = this.eventMatchesDateFilter(event, date);
      
      // Vérifier si l'événement correspond au filtre de catégorie (CORRECTION)
      let matchesCategory = category === 'all';
      
      if (!matchesCategory) {
        // Recherche plus flexible pour les catégories
        const eventType = (event.type || '').toLowerCase();
        const eventCategory = (event.category || '').toLowerCase();
        const eventTitle = (event.title || '').toLowerCase();
        
        // Recherche de correspondance par type exact ou par catégorie
        matchesCategory = (eventType === category.toLowerCase()) || 
                          (eventCategory === category.toLowerCase());
        
        // Si toujours pas de correspondance, recherche dans le titre
        if (!matchesCategory && category) {
          matchesCategory = eventTitle.includes(category.toLowerCase());
        }
      }
      
      return matchesDate && matchesCategory;
    });
  },
  
  // Vérifie si un événement correspond au filtre de date
  eventMatchesDateFilter: function(event, dateFilter) {
    if (!event.date) return false;
    
    // Obtenir la date d'aujourd'hui au format DD/MM/YYYY
    const today = new Date();
    const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    
    // Vérifier si la date de l'événement est aujourd'hui
    const eventDate = event.date;
    const isToday = eventDate === todayFormatted;
    
    if (dateFilter === 'today') {
      return isToday;
    } else if (dateFilter === 'week') {
      // Si c'est aujourd'hui, ce n'est pas "le reste de la semaine"
      if (isToday) return false;
      
      try {
        // Extraire les composants de la date
        const dateParts = eventDate.split('/');
        if (dateParts.length !== 3) return false;
        
        // Créer un objet Date pour la date de l'événement
        const eventDateObj = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
        eventDateObj.setHours(0, 0, 0, 0);
        
        // Calculer le jour de la semaine actuel et la fin de la semaine
        const todayDay = today.getDay(); // 0 = dimanche, 1 = lundi, etc.
        const daysUntilSunday = 7 - todayDay;
        
        // Créer une date pour la fin de la semaine (dimanche à minuit)
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + daysUntilSunday);
        endOfWeek.setHours(0, 0, 0, 0);
        
        // Créer une date pour demain
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        // Vérifier si la date de l'événement est entre demain et la fin de la semaine
        return eventDateObj >= tomorrow && eventDateObj < endOfWeek;
      } catch (error) {
        console.error('Erreur lors de l\'analyse de la date:', error);
        return false;
      }
    }
    
    return true;
  },
  
  // Applique les filtres actuels aux événements
  applyFilters: function() {
    // Afficher un message de débogage
    console.log(`🔍 Application des filtres: date=${this.state.activeFilters.date}, catégorie=${this.state.activeFilters.category}`);
    
    // Rafraîchir l'affichage des événements
    this.renderEvents();
  },
  
  // Affiche l'état de chargement
  showLoading: function() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="col-span-3 flex items-center justify-center p-6">
        <div class="loading-spinner mr-3"></div>
        <p class="text-gray-400">Chargement des événements économiques...</p>
      </div>
    `;
  },
  
  // Affiche un message quand aucun événement n'est disponible
  showEmpty: function() {
    if (!this.container) return;
    
    let message = 'Aucun événement ne correspond aux filtres sélectionnés.';
    
    // Personnaliser le message en fonction du filtre de date
    if (this.state.activeFilters.date === 'today') {
      message = 'Aucun événement prévu pour aujourd\'hui.';
    } else if (this.state.activeFilters.date === 'week') {
      message = 'Aucun événement prévu pour le reste de la semaine.';
    }
    
    this.container.innerHTML = `
      <div class="col-span-3 flex flex-col items-center justify-center p-6 text-center" id="${this.config.noEventsMessageId}">
        <i class="fas fa-calendar-times text-gray-600 text-3xl mb-3"></i>
        <p class="text-gray-400">${message}</p>
      </div>
    `;
  },
  
  // Génère des points pour visualiser le niveau d'impact
  generateImpactDots: function(importance) {
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
  },
  
  // Détermine la classe CSS d'importance
  getImportanceClass: function(importance) {
    switch (importance) {
      case 'high':
        return 'high-impact';
      case 'medium':
        return 'medium-impact';
      default:
        return 'low-impact';
    }
  },
  
  // Obtient l'icône FontAwesome pour une catégorie
  getCategoryIcon: function(category) {
    const icons = {
      'earnings': 'fa-chart-pie',
      'monetary': 'fa-landmark',
      'economic': 'fa-chart-line',
      'employment': 'fa-briefcase',
      'inflation': 'fa-dollar-sign',
      'business': 'fa-industry',
      'consumer': 'fa-shopping-cart',
      'trade': 'fa-ship',
      'ipo': 'fa-rocket',
      'm&a': 'fa-handshake'
    };
    
    return icons[category] || 'fa-calendar-day';
  },
  
  // Déclenche l'événement 'events-ready'
  dispatchReadyEvent: function() {
    // Créer un événement personnalisé
    const event = new CustomEvent('events-ready', {
      detail: {
        count: this.state.events.length,
        date: new Date().toISOString()
      }
    });
    
    // Déclencher l'événement sur le document
    document.dispatchEvent(event);
    
    console.log(`✅ Événement 'events-ready' déclenché avec ${this.state.events.length} événements`);
  },
  
  // Injecte les styles CSS nécessaires
  injectStyles: function() {
    // Vérifier si les styles existent déjà
    if (document.getElementById('event-system-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'event-system-styles';
    styleEl.textContent = `
      /* Styles pour les cartes d'événements */
      .event-card {
        position: relative !important;
        min-height: 180px !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        margin-bottom: 0.75rem !important;
        background-color: rgba(1, 22, 39, 0.8) !important;
        transition: all 0.3s ease !important;
        border-radius: 0.5rem !important;
      }
      
      .event-card:hover {
        transform: translateY(-3px) !important;
        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2) !important;
        border-color: rgba(0, 255, 135, 0.3) !important;
      }
      
      /* Indicateur d'impact */
      .event-card::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 5px !important;
        height: 100% !important;
      }
      
      .event-card.high-impact::before {
        background: linear-gradient(to bottom, #ff3d00, #ff7043) !important;
        box-shadow: 0 0 10px rgba(255, 61, 0, 0.7) !important;
      }
      
      .event-card.medium-impact::before {
        background: linear-gradient(to bottom, #ff9100, #ffb74d) !important;
        box-shadow: 0 0 10px rgba(255, 145, 0, 0.6) !important;
      }
      
      .event-card.low-impact::before {
        background: linear-gradient(to bottom, #00e676, #69f0ae) !important;
        box-shadow: 0 0 10px rgba(0, 230, 118, 0.6) !important;
      }
      
      /* Badge pour événements essentiels */
      .essential-badge {
        position: absolute !important;
        top: 10px !important;
        right: 10px !important;
        background: rgba(0, 255, 135, 0.3) !important;
        color: #00ff87 !important;
        padding: 4px 8px !important;
        font-size: 0.7rem !important;
        border-radius: 4px !important;
        font-weight: 600 !important;
        letter-spacing: 0.5px !important;
        text-transform: uppercase !important;
        box-shadow: 0 0 12px rgba(0, 255, 135, 0.4) !important;
        animation: pulse 2s infinite !important;
      }
      
      /* Boutons de filtre améliorés */
      #today-filter.active, 
      #week-filter.active {
        background-color: rgba(0, 255, 135, 0.2) !important;
        color: #00ff87 !important;
        border-color: #00ff87 !important;
        transform: translateY(-1px) !important;
        font-weight: 600 !important;
        box-shadow: 0 0 8px rgba(0, 255, 135, 0.3) !important;
      }
      
      /* Styles pour les filtres de catégorie */
      #event-category-filters button.filter-active {
        background-color: rgba(0, 255, 135, 0.2) !important;
        color: #00ff87 !important;
        border-color: #00ff87 !important;
        font-weight: 600 !important;
      }
      
      /* Animation pour fade-in */
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .animate-fadeIn {
        animation: fadeIn 0.3s ease-out forwards;
      }
      
      /* Loading spinner */
      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(0, 255, 135, 0.3);
        border-radius: 50%;
        border-top-color: #00ff87;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      /* Animation de pulse pour les badges */
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 255, 135, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(0, 255, 135, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 255, 135, 0); }
      }
    `;
    
    document.head.appendChild(styleEl);
    console.log('✅ Styles injectés');
  },
  
  // Génère des événements de secours en cas d'échec du chargement
  generateFallbackEvents: function() {
    console.log('⚠️ Utilisation des événements de secours');
    
    // Date d'aujourd'hui
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    
    // Créer un tableau d'événements
    return [
      {
        title: "Fed Balance Sheet (Apr/10)",
        date: todayStr,
        time: "09:00",
        type: "economic",
        importance: "high",
        country: "US",
        category: "economic",
        description: "Publication hebdomadaire du bilan de la Réserve Fédérale américaine. Indicateur clé de la politique monétaire."
      },
      {
        title: "Fed Williams Speech",
        date: todayStr,
        time: "09:00",
        type: "economic",
        importance: "high",
        country: "US",
        category: "monetary",
        description: "Discours de John Williams, président de la Fed de New York. Ses commentaires peuvent donner des indications sur la politique monétaire future."
      },
      {
        title: "Michigan Consumer Sentiment (Apr)",
        date: todayStr,
        time: "09:00",
        type: "economic",
        importance: "high",
        country: "US",
        category: "consumer",
        description: "Indice de confiance des consommateurs de l'Université du Michigan. Indicateur avancé des tendances de consommation aux États-Unis."
      },
      {
        title: "IPO: TechVision Inc. (TVIZ)",
        date: todayStr,
        time: "11:00",
        type: "ipo",
        importance: "medium",
        category: "ipo",
        description: "Introduction en bourse de TechVision Inc., une société spécialisée dans l'intelligence artificielle appliquée à la vision par ordinateur."
      },
      {
        title: "M&A: Global Payments acquiert FinnTech Solutions",
        date: todayStr,
        time: "14:30",
        type: "m&a",
        importance: "medium",
        category: "m&a",
        description: "Opération de fusion-acquisition dans le secteur des technologies financières. Global Payments renforce sa présence dans les solutions de paiement innovantes."
      }
    ];
  },
  
  // Méthode de test pour diagnostiquer les problèmes
  diagnostics: function() {
    console.group('📊 DIAGNOSTIC DU SYSTÈME D\'ÉVÉNEMENTS');
    
    console.log('État d\'initialisation:', this.state.initialized);
    console.log('Nombre d\'événements:', this.state.events.length);
    console.log('Filtres actifs:', this.state.activeFilters);
    
    // Analyser les événements
    const eventTypes = {};
    this.state.events.forEach(event => {
      const type = event.type || 'unknown';
      eventTypes[type] = (eventTypes[type] || 0) + 1;
    });
    
    console.log('Répartition par type:', eventTypes);
    
    // Vérifier les boutons de filtre
    const todayBtn = document.getElementById(this.config.todayButtonId);
    const weekBtn = document.getElementById(this.config.weekButtonId);
    const categoryFilters = document.getElementById(this.config.categoryFiltersId);
    
    console.log('Boutons de filtre:');
    console.log(`- "Aujourd'hui": ${todayBtn ? 'Trouvé' : 'Non trouvé'}`);
    console.log(`- "Cette semaine": ${weekBtn ? 'Trouvé' : 'Non trouvé'}`);
    console.log(`- Conteneur de catégories: ${categoryFilters ? 'Trouvé' : 'Non trouvé'}`);
    
    // Tester les filtres
    const filteredEvents = this.getFilteredEvents();
    console.log(`Événements après filtrage: ${filteredEvents.length}/${this.state.events.length}`);
    
    console.groupEnd();
    
    return {
      initialized: this.state.initialized,
      eventsCount: this.state.events.length,
      filters: this.state.activeFilters,
      typesDistribution: eventTypes,
      filteredCount: filteredEvents.length,
      todayBtnExists: !!todayBtn,
      weekBtnExists: !!weekBtn,
      categoryFiltersExist: !!categoryFilters
    };
  }
};

// Initialiser le système d'événements quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initialisation du système d\'événements...');
  
  // Attendre un court instant pour s'assurer que tout est chargé
  setTimeout(() => {
    window.EventSystem.init()
      .then(success => {
        if (success) {
          console.log('✅ Système d\'événements initialisé avec succès');
        } else {
          console.warn('⚠️ Problème lors de l\'initialisation du système d\'événements');
        }
      });
  }, 500);
});

// Fonction de test exposée globalement
window.testEvents = function() {
  return window.EventSystem.diagnostics();
};

// Fonction pour forcer la réinitialisation
window.reinitializeEvents = function() {
  // Réinitialiser l'état
  window.EventSystem.state.initialized = false;
  
  // Relancer l'initialisation
  return window.EventSystem.init();
};