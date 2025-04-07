/**
 * market-clock.js
 * Horloge dynamique des marchés financiers mondiaux - Version 4.0
 * Affiche l'état en temps réel des principales bourses avec design amélioré
 */

// Données des marchés boursiers avec des informations enrichies
const marketExchanges = [
  {
    exchange: "ASX",
    name: "Australian Stock Exchange",
    openingHour: "10:00 AM +11:00",
    closingHour: "04:00 PM +11:00",
    timezone: "Australia/Sydney",
    region: "Asie-Pacifique",
    icon: "fa-globe-asia",
    flag: "au",
    country: "Australie"
  },
  {
    exchange: "TSE",
    name: "Tokyo Stock Exchange",
    openingHour: "09:00 AM +09:00",
    closingHour: "11:30 AM +09:00",
    openingAdditional: "12:30 PM +09:00",
    closingAdditional: "03:00 PM +09:00",
    timezone: "Asia/Tokyo",
    region: "Asie-Pacifique",
    icon: "fa-yen-sign",
    flag: "jp",
    country: "Japon"
  },
  {
    exchange: "HKSE",
    name: "Hong Kong Stock Exchange",
    openingHour: "09:30 AM +08:00",
    closingHour: "12:00 PM +08:00",
    openingAdditional: "01:00 PM +08:00",
    closingAdditional: "04:00 PM +08:00",
    timezone: "Asia/Hong_Kong",
    region: "Asie-Pacifique",
    icon: "fa-landmark",
    flag: "hk",
    country: "Hong Kong"
  },
  {
    exchange: "SSE",
    name: "Shanghai Stock Exchange",
    openingHour: "09:30 AM +08:00",
    closingHour: "11:30 AM +08:00",
    openingAdditional: "01:00 PM +08:00",
    closingAdditional: "03:00 PM +08:00",
    timezone: "Asia/Shanghai",
    region: "Asie-Pacifique",
    icon: "fa-yuan-sign",
    flag: "cn",
    country: "Chine"
  },
  {
    exchange: "LSE",
    name: "London Stock Exchange",
    openingHour: "08:00 AM +01:00",
    closingHour: "04:30 PM +01:00",
    timezone: "Europe/London",
    region: "Europe",
    icon: "fa-pound-sign",
    flag: "gb",
    country: "Royaume-Uni"
  },
  {
    exchange: "EURONEXT",
    name: "Euronext Paris",
    openingHour: "09:00 AM +02:00",
    closingHour: "05:30 PM +02:00",
    timezone: "Europe/Paris",
    region: "Europe",
    icon: "fa-euro-sign",
    flag: "fr",
    country: "France"
  },
  {
    exchange: "NYSE",
    name: "New York Stock Exchange",
    openingHour: "09:30 AM -04:00",
    closingHour: "04:00 PM -04:00",
    timezone: "America/New_York",
    region: "Amériques",
    icon: "fa-dollar-sign",
    flag: "us",
    country: "États-Unis"
  },
  {
    exchange: "NASDAQ",
    name: "NASDAQ",
    openingHour: "09:30 AM -04:00",
    closingHour: "04:00 PM -04:00",
    timezone: "America/New_York",
    region: "Amériques",
    icon: "fa-chart-line",
    flag: "us",
    country: "États-Unis"
  }
];

class MarketClock {
  constructor() {
    this.markets = marketExchanges;
    this.leftContainer = document.getElementById('market-clock-left');
    this.rightContainer = document.getElementById('market-clock-right');
    this.mobileModal = document.getElementById('market-clock-modal');
    this.mobileLeftColumn = document.getElementById('modal-left-column');
    this.mobileRightColumn = document.getElementById('modal-right-column');
    this.flagsBasePath = '/flags/'; // Chemin de base vers les images de drapeaux
    this.initializeContainers();
    this.setupEventListeners();
  }

  /**
   * Initialise les conteneurs d'horloges si nécessaire
   */
  initializeContainers() {
    if (!this.leftContainer || !this.rightContainer) {
      console.warn('Conteneurs d\'horloges non trouvés, création automatique');
      this.createClockContainers();
    }
    
    // Vérifier si les colonnes mobiles existent
    if (this.mobileModal && (!this.mobileLeftColumn || !this.mobileRightColumn)) {
      this.mobileLeftColumn = this.mobileModal.querySelector('.market-clock-modal-column:first-child');
      this.mobileRightColumn = this.mobileModal.querySelector('.market-clock-modal-column:last-child');
    }
  }

  /**
   * Configure les écouteurs d'événements pour l'interactivité
   */
  setupEventListeners() {
    // Boutons de basculement des horloges
    const leftToggle = document.getElementById('left-clock-toggle');
    const rightToggle = document.getElementById('right-clock-toggle');
    
    if (leftToggle && this.leftContainer) {
      leftToggle.addEventListener('click', () => {
        this.leftContainer.classList.toggle('hidden');
        leftToggle.innerHTML = this.leftContainer.classList.contains('hidden') 
          ? '<i class="fas fa-chevron-right"></i>' 
          : '<i class="fas fa-chevron-left"></i>';
      });
    }
    
    if (rightToggle && this.rightContainer) {
      rightToggle.addEventListener('click', () => {
        this.rightContainer.classList.toggle('hidden');
        rightToggle.innerHTML = this.rightContainer.classList.contains('hidden') 
          ? '<i class="fas fa-chevron-left"></i>' 
          : '<i class="fas fa-chevron-right"></i>';
      });
    }
    
    // Bouton mobile et modal
    const mobileBtn = document.getElementById('mobile-clock-btn');
    const closeModalBtn = document.getElementById('modal-close-btn');
    
    if (mobileBtn && this.mobileModal) {
      mobileBtn.addEventListener('click', () => {
        this.mobileModal.classList.add('active');
      });
    }
    
    if (closeModalBtn && this.mobileModal) {
      closeModalBtn.addEventListener('click', () => {
        this.mobileModal.classList.remove('active');
      });
    }
  }

  /**
   * Crée les conteneurs d'horloges s'ils n'existent pas
   */
  createClockContainers() {
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
      console.error('Conteneur principal non trouvé');
      return;
    }

    // Créer les conteneurs d'horloges
    this.leftContainer = document.createElement('div');
    this.leftContainer.id = 'market-clock-left';
    this.leftContainer.className = 'market-clock-container left';

    this.rightContainer = document.createElement('div');
    this.rightContainer.id = 'market-clock-right';
    this.rightContainer.className = 'market-clock-container right';

    // Ajouter les conteneurs à la page
    mainContainer.parentNode.insertBefore(this.leftContainer, mainContainer);
    mainContainer.parentNode.insertBefore(this.rightContainer, mainContainer.nextSibling);
    
    // Créer les boutons de basculement s'ils n'existent pas
    if (!document.getElementById('left-clock-toggle')) {
      const leftToggle = document.createElement('div');
      leftToggle.id = 'left-clock-toggle';
      leftToggle.className = 'market-clock-toggle left';
      leftToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
      document.body.appendChild(leftToggle);
    }
    
    if (!document.getElementById('right-clock-toggle')) {
      const rightToggle = document.createElement('div');
      rightToggle.id = 'right-clock-toggle';
      rightToggle.className = 'market-clock-toggle right';
      rightToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
      document.body.appendChild(rightToggle);
    }
    
    // Créer le bouton mobile s'il n'existe pas
    if (!document.getElementById('mobile-clock-btn')) {
      const mobileBtn = document.createElement('div');
      mobileBtn.id = 'mobile-clock-btn';
      mobileBtn.className = 'market-clock-mobile-btn';
      mobileBtn.innerHTML = '<i class="fas fa-globe"></i>';
      document.body.appendChild(mobileBtn);
      
      // Créer le modal mobile
      const modal = document.createElement('div');
      modal.id = 'market-clock-modal';
      modal.className = 'market-clock-modal';
      modal.innerHTML = `
        <div class="market-clock-modal-header">
          <div class="market-clock-modal-title">Horaires des Marchés Mondiaux</div>
          <div class="market-clock-modal-close" id="modal-close-btn">
            <i class="fas fa-times"></i>
          </div>
        </div>
        <div class="market-clock-modal-content">
          <div class="market-clock-modal-column" id="modal-left-column"></div>
          <div class="market-clock-modal-column" id="modal-right-column"></div>
        </div>
      `;
      document.body.appendChild(modal);
      
      this.mobileModal = modal;
      this.mobileLeftColumn = document.getElementById('modal-left-column');
      this.mobileRightColumn = document.getElementById('modal-right-column');
    }
  }

  /**
   * Convertit une heure au format "HH:MM AM/PM +/-XX:00" en objet Date
   */
  parseMarketTime(timeString, timezone) {
    // Extraire les composants de l'heure
    const regex = /(\\d{2}):(\\d{2}) (AM|PM) ([+-]\\d{2}):(\\d{2})/;
    const match = timeString.match(regex);
    
    if (!match) return null;
    
    let [_, hours, minutes, ampm, tzHours, tzMinutes] = match;
    
    // Convertir en format 24h
    hours = parseInt(hours);
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    
    // Créer une date à l'heure actuelle
    const today = new Date();
    const marketDate = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      hours,
      parseInt(minutes),
      0
    ));
    
    // Ajuster pour le fuseau horaire
    const tzOffsetMinutes = (parseInt(tzHours) * 60) + (parseInt(tzHours) > 0 ? parseInt(tzMinutes) : -parseInt(tzMinutes));
    marketDate.setMinutes(marketDate.getMinutes() - tzOffsetMinutes);
    
    return marketDate;
  }

  /**
   * Détermine si un marché est actuellement ouvert
   */
  isMarketOpen(market) {
    const now = new Date();
    
    // Convertir les heures d'ouverture et de fermeture en objets Date
    const openTime = this.parseMarketTime(market.openingHour, market.timezone);
    const closeTime = this.parseMarketTime(market.closingHour, market.timezone);
    
    // Si le marché a une pause déjeuner, vérifier également les heures additionnelles
    if (market.openingAdditional && market.closingAdditional) {
      const openTimeAdditional = this.parseMarketTime(market.openingAdditional, market.timezone);
      const closeTimeAdditional = this.parseMarketTime(market.closingAdditional, market.timezone);
      
      // Le marché est ouvert si l'heure actuelle est entre l'ouverture et la fermeture
      // OU entre l'ouverture additionnelle et la fermeture additionnelle
      return (now >= openTime && now <= closeTime) || 
             (now >= openTimeAdditional && now <= closeTimeAdditional);
    }
    
    // Sinon, vérifier simplement si l'heure actuelle est entre l'ouverture et la fermeture
    return now >= openTime && now <= closeTime;
  }

  /**
   * Vérifie si un marché est en pause déjeuner
   */
  isMarketOnLunchBreak(market) {
    if (!market.openingAdditional || !market.closingAdditional) return false;
    
    const now = new Date();
    const closeTime = this.parseMarketTime(market.closingHour, market.timezone);
    const openTimeAdditional = this.parseMarketTime(market.openingAdditional, market.timezone);
    
    return now > closeTime && now < openTimeAdditional;
  }

  /**
   * Formate une heure au format "HH:MM AM/PM +/-XX:00" en "HH:MM" local
   */
  formatLocalTime(timeString, timezone) {
    const time = this.parseMarketTime(timeString, timezone);
    if (!time) return timeString;
    
    return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Obtient l'heure locale d'un fuseau horaire spécifié
   */
  getLocalTime(timezone) {
    try {
      // Utiliser Intl.DateTimeFormat pour obtenir l'heure dans un fuseau horaire spécifique
      return new Date().toLocaleTimeString('fr-FR', { 
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'heure locale pour', timezone, error);
      return '--:--';
    }
  }

  /**
   * Retourne le statut du marché (ouvert, fermé, en pause)
   */
  getMarketStatus(market) {
    if (this.isMarketOpen(market)) return 'open';
    if (this.isMarketOnLunchBreak(market)) return 'lunch';
    return 'closed';
  }

  /**
   * Retourne un texte pour le statut du marché
   */
  getMarketStatusText(status) {
    switch(status) {
      case 'open': return 'Ouvert';
      case 'lunch': return 'Pause déjeuner';
      case 'closed': return 'Fermé';
      default: return 'Indéterminé';
    }
  }

  /**
   * Construit l'élément HTML pour un marché avec design amélioré
   */
  buildMarketElement(market) {
    const status = this.getMarketStatus(market);
    const element = document.createElement('div');
    element.className = `market-item ${status}`;
    element.style.animationDelay = `${Math.random() * 0.5}s`; // Délai aléatoire pour un effet staggered
    
    // Déterminer les heures à afficher dans un format compact
    const openingTime = this.formatLocalTime(market.openingHour, market.timezone);
    const closingTime = this.formatLocalTime(market.closingHour, market.timezone);
    
    let scheduleDisplay = `${openingTime} - ${closingTime}`;
    
    // Ajouter les heures additionnelles si elles existent
    if (market.openingAdditional && market.closingAdditional) {
      const additionalOpening = this.formatLocalTime(market.openingAdditional, market.timezone);
      const additionalClosing = this.formatLocalTime(market.closingAdditional, market.timezone);
      scheduleDisplay = `${openingTime} - ${closingTime} / ${additionalOpening} - ${additionalClosing}`;
    }
    
    // Obtenir l'heure locale du marché
    const marketLocalTime = this.getLocalTime(market.timezone);
    
    // Structure HTML améliorée avec les nouvelles fonctionnalités
    element.innerHTML = `
      <div class="market-header">
        <div class="market-name">
          <img src="${this.flagsBasePath}${market.flag}.png" class="market-flag" alt="${market.country}" />
          ${market.exchange}
        </div>
        <div class="market-tag ${status}">${this.getMarketStatusText(status)}</div>
      </div>
      <div class="market-details">
        <div class="market-full-name">
          ${market.name}
          <div class="market-live-time" data-timezone="${market.timezone}">${marketLocalTime}</div>
        </div>
        <div class="market-schedule-inline">${scheduleDisplay}</div>
      </div>
    `;
    
    return element;
  }

  /**
   * Crée un élément d'affichage d'heure locale
   */
  createLocalTimeDisplay() {
    const now = new Date();
    const timeElement = document.createElement('div');
    timeElement.className = 'local-time-display';
    
    timeElement.innerHTML = `
      <div class="local-time-label">Heure locale</div>
      <div class="local-time-value" id="local-time-value">
        ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
    `;
    
    // Mettre à jour l'heure chaque seconde
    setInterval(() => {
      const timeValue = timeElement.querySelector('#local-time-value');
      if (timeValue) {
        const now = new Date();
        timeValue.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    }, 1000);
    
    return timeElement;
  }

  /**
   * Met à jour les horloges locales des marchés
   */
  updateMarketLocalTimes() {
    document.querySelectorAll('.market-live-time').forEach(el => {
      const timezone = el.dataset.timezone;
      if (timezone) {
        el.textContent = this.getLocalTime(timezone);
      }
    });
  }

  /**
   * Crée un récapitulatif des statuts de marché
   */
  createMarketSummary() {
    // Compter les marchés par statut
    let openCount = 0;
    let closedCount = 0;
    let lunchCount = 0;
    
    this.markets.forEach(market => {
      const status = this.getMarketStatus(market);
      if (status === 'open') openCount++;
      else if (status === 'lunch') lunchCount++;
      else closedCount++;
    });
    
    // Créer l'élément
    const summaryElement = document.createElement('div');
    summaryElement.className = 'market-status-summary';
    
    summaryElement.innerHTML = `
      <div class="market-summary-title">Statut des marchés</div>
      <div class="market-summary-counts">
        <div class="market-summary-count">
          <div class="count-value open">${openCount}</div>
          <div class="count-label">Ouverts</div>
        </div>
        <div class="market-summary-count">
          <div class="count-value lunch">${lunchCount}</div>
          <div class="count-label">Pause</div>
        </div>
        <div class="market-summary-count">
          <div class="count-value closed">${closedCount}</div>
          <div class="count-label">Fermés</div>
        </div>
      </div>
    `;
    
    return summaryElement;
  }

  /**
   * Affiche les horloges des marchés avec design amélioré
   */
  renderMarketClocks() {
    // Regrouper les marchés différemment selon la demande du client
    // Asie-Pacifique dans le conteneur de gauche, Europe et Amériques dans celui de droite
    const asianMarkets = this.markets.filter(m => m.region === 'Asie-Pacifique');
    const europeAmericaMarkets = this.markets.filter(m => m.region === 'Europe' || m.region === 'Amériques');
    
    // Vider les conteneurs
    if (this.leftContainer) this.leftContainer.innerHTML = '';
    if (this.rightContainer) this.rightContainer.innerHTML = '';
    if (this.mobileLeftColumn) this.mobileLeftColumn.innerHTML = '';
    if (this.mobileRightColumn) this.mobileRightColumn.innerHTML = '';
    
    // Ajouter l'affichage de l'heure locale aux deux conteneurs
    if (this.leftContainer) {
      const timeDisplay = this.createLocalTimeDisplay();
      this.leftContainer.appendChild(timeDisplay);
    }
    
    if (this.rightContainer) {
      const timeDisplay = this.createLocalTimeDisplay();
      this.rightContainer.appendChild(timeDisplay);
    }
    
    // Ajouter des titres
    if (this.leftContainer) {
      const leftTitle = document.createElement('div');
      leftTitle.className = 'market-clock-title';
      leftTitle.innerHTML = 'Marchés <span>Asie-Pacifique</span>';
      this.leftContainer.appendChild(leftTitle);
    }
    
    if (this.rightContainer) {
      const rightTitle = document.createElement('div');
      rightTitle.className = 'market-clock-title';
      rightTitle.innerHTML = 'Marchés <span>Europe & Amériques</span>';
      this.rightContainer.appendChild(rightTitle);
    }
    
    // Ajouter les récapitulatifs de statut
    if (this.leftContainer) {
      const summary = this.createMarketSummary();
      this.leftContainer.appendChild(summary);
    }
    
    // Conteneurs de contenu pour le défilement
    const leftContent = document.createElement('div');
    leftContent.className = 'market-clock-content';
    
    const rightContent = document.createElement('div');
    rightContent.className = 'market-clock-content';
    
    // Ajouter les marchés à gauche (Asie-Pacifique)
    asianMarkets.forEach((market, index) => {
      const element = this.buildMarketElement(market);
      // Délai d'animation pour l'effet d'apparition échelonnée
      element.style.animationDelay = `${index * 0.1}s`;
      leftContent.appendChild(element);
      
      // Dupliquer pour le mobile si nécessaire
      if (this.mobileLeftColumn) {
        const mobileElement = this.buildMarketElement(market);
        this.mobileLeftColumn.appendChild(mobileElement);
      }
    });
    
    // Ajouter les marchés à droite (Europe & Amériques)
    europeAmericaMarkets.forEach((market, index) => {
      const element = this.buildMarketElement(market);
      // Délai d'animation pour l'effet d'apparition échelonnée
      element.style.animationDelay = `${index * 0.1}s`;
      rightContent.appendChild(element);
      
      // Dupliquer pour le mobile si nécessaire
      if (this.mobileRightColumn) {
        const mobileElement = this.buildMarketElement(market);
        this.mobileRightColumn.appendChild(mobileElement);
      }
    });
    
    // Ajouter les conteneurs de contenu aux conteneurs principaux
    if (this.leftContainer) this.leftContainer.appendChild(leftContent);
    if (this.rightContainer) this.rightContainer.appendChild(rightContent);
    
    // Ajouter des séparateurs
    if (this.leftContainer) {
      const divider = document.createElement('div');
      divider.className = 'market-divider';
      this.leftContainer.appendChild(divider);
    }
    
    if (this.rightContainer) {
      const divider = document.createElement('div');
      divider.className = 'market-divider';
      this.rightContainer.appendChild(divider);
    }
    
    // Mettre en place la mise à jour des horloges locales
    this.startMarketTimeUpdates();
  }

  /**
   * Démarre la mise à jour régulière des horloges locales des marchés
   */
  startMarketTimeUpdates() {
    // Mise à jour immédiate
    this.updateMarketLocalTimes();
    
    // Mise à jour toutes les 30 secondes
    if (!this._marketTimeInterval) {
      this._marketTimeInterval = setInterval(() => {
        this.updateMarketLocalTimes();
      }, 30000);
    }
  }

  /**
   * Vérifie si les images de drapeaux sont disponibles, sinon utilise les icônes de pays
   */
  checkFlagsAvailability() {
    // Essayer de charger une image de drapeau
    const testImage = new Image();
    testImage.onload = () => {
      console.log('Drapeaux disponibles, utilisation des images');
      this.useFallbackIcons = false;
    };
    testImage.onerror = () => {
      console.warn('Drapeaux non disponibles, utilisation des icônes de repli');
      this.useFallbackIcons = true;
      this.flagsBasePath = '';
    };
    testImage.src = `${this.flagsBasePath}us.png`;
  }

  /**
   * Démarre la mise à jour régulière des horloges
   */
  start() {
    // Vérifier la disponibilité des drapeaux
    this.checkFlagsAvailability();
    
    // Première mise à jour immédiate
    this.renderMarketClocks();
    
    // Configurer les écouteurs d'événements
    this.setupEventListeners();
    
    // Mise à jour toutes les minutes
    setInterval(() => {
      this.renderMarketClocks();
    }, 60000);
  }
}

// Initialiser l'horloge lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
  // Attendre que tous les éléments de la page soient chargés
  setTimeout(() => {
    const marketClock = new MarketClock();
    marketClock.start();
    
    // Exposer l'instance pour un accès global si nécessaire
    window.marketClock = marketClock;
  }, 1000);
});