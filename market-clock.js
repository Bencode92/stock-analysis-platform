/**
 * market-clock.js
 * Horloge dynamique des marchés financiers mondiaux
 * Affiche l'état en temps réel des principales bourses
 */

// Données des marchés boursiers
const marketExchanges = [
  {
    exchange: "ASX",
    name: "Australian Stock Exchange",
    openingHour: "10:00 AM +11:00",
    closingHour: "04:00 PM +11:00",
    timezone: "Australia/Sydney"
  },
  {
    exchange: "TSE",
    name: "Tokyo Stock Exchange",
    openingHour: "09:00 AM +09:00",
    closingHour: "11:30 AM +09:00",
    openingAdditional: "12:30 PM +09:00",
    closingAdditional: "03:00 PM +09:00",
    timezone: "Asia/Tokyo"
  },
  {
    exchange: "HKSE",
    name: "Hong Kong Stock Exchange",
    openingHour: "09:30 AM +08:00",
    closingHour: "12:00 PM +08:00",
    openingAdditional: "01:00 PM +08:00",
    closingAdditional: "04:00 PM +08:00",
    timezone: "Asia/Hong_Kong"
  },
  {
    exchange: "SSE",
    name: "Shanghai Stock Exchange",
    openingHour: "09:30 AM +08:00",
    closingHour: "11:30 AM +08:00",
    openingAdditional: "01:00 PM +08:00",
    closingAdditional: "03:00 PM +08:00",
    timezone: "Asia/Shanghai"
  },
  {
    exchange: "LSE",
    name: "London Stock Exchange",
    openingHour: "08:00 AM +01:00",
    closingHour: "04:30 PM +01:00",
    timezone: "Europe/London"
  },
  {
    exchange: "EURONEXT",
    name: "Euronext Paris",
    openingHour: "09:00 AM +02:00",
    closingHour: "05:30 PM +02:00",
    timezone: "Europe/Paris"
  },
  {
    exchange: "NYSE",
    name: "New York Stock Exchange",
    openingHour: "09:30 AM -04:00",
    closingHour: "04:00 PM -04:00",
    timezone: "America/New_York"
  },
  {
    exchange: "NASDAQ",
    name: "NASDAQ",
    openingHour: "09:30 AM -04:00",
    closingHour: "04:00 PM -04:00",
    timezone: "America/New_York"
  }
];

class MarketClock {
  constructor() {
    this.markets = marketExchanges;
    this.leftContainer = document.getElementById('market-clock-left');
    this.rightContainer = document.getElementById('market-clock-right');
    this.initializeContainers();
  }

  /**
   * Initialise les conteneurs d'horloges si nécessaire
   */
  initializeContainers() {
    if (!this.leftContainer || !this.rightContainer) {
      console.warn('Conteneurs d\'horloges non trouvés, création automatique');
      this.createClockContainers();
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
  }

  /**
   * Convertit une heure au format "HH:MM AM/PM +/-XX:00" en objet Date
   */
  parseMarketTime(timeString, timezone) {
    // Extraire les composants de l'heure
    const regex = /(\d{2}):(\d{2}) (AM|PM) ([+-]\d{2}):(\d{2})/;
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
   * Retourne le statut du marché (ouvert, fermé, en pause)
   */
  getMarketStatus(market) {
    if (this.isMarketOpen(market)) return 'open';
    if (this.isMarketOnLunchBreak(market)) return 'lunch';
    return 'closed';
  }

  /**
   * Construit l'élément HTML pour un marché
   */
  buildMarketElement(market) {
    const status = this.getMarketStatus(market);
    const element = document.createElement('div');
    element.className = `market-item ${status}`;
    
    // Déterminer les heures à afficher
    const openingTime = this.formatLocalTime(market.openingHour, market.timezone);
    const closingTime = this.formatLocalTime(market.closingHour, market.timezone);
    
    // Ajouter les heures additionnelles si elles existent
    let additionalTimes = '';
    if (market.openingAdditional && market.closingAdditional) {
      const additionalOpening = this.formatLocalTime(market.openingAdditional, market.timezone);
      const additionalClosing = this.formatLocalTime(market.closingAdditional, market.timezone);
      additionalTimes = `<div class="market-schedule additional">${additionalOpening} - ${additionalClosing}</div>`;
    }
    
    // Structure HTML
    element.innerHTML = `
      <div class="market-header">
        <div class="market-name">${market.exchange}</div>
        <div class="market-status-indicator"></div>
      </div>
      <div class="market-details">
        <div class="market-full-name">${market.name}</div>
        <div class="market-schedule">${openingTime} - ${closingTime}</div>
        ${additionalTimes}
      </div>
    `;
    
    return element;
  }

  /**
   * Affiche les horloges des marchés
   */
  renderMarketClocks() {
    // Diviser les marchés en deux groupes pour les côtés gauche et droit
    const mid = Math.ceil(this.markets.length / 2);
    const leftMarkets = this.markets.slice(0, mid);
    const rightMarkets = this.markets.slice(mid);
    
    // Vider les conteneurs
    this.leftContainer.innerHTML = '';
    this.rightContainer.innerHTML = '';
    
    // Ajouter des titres
    const leftTitle = document.createElement('div');
    leftTitle.className = 'market-clock-title';
    leftTitle.innerHTML = 'Marchés <span>Asie & Europe</span>';
    this.leftContainer.appendChild(leftTitle);
    
    const rightTitle = document.createElement('div');
    rightTitle.className = 'market-clock-title';
    rightTitle.innerHTML = 'Marchés <span>Amériques</span>';
    this.rightContainer.appendChild(rightTitle);
    
    // Ajouter les marchés à gauche
    leftMarkets.forEach(market => {
      const element = this.buildMarketElement(market);
      this.leftContainer.appendChild(element);
    });
    
    // Ajouter les marchés à droite
    rightMarkets.forEach(market => {
      const element = this.buildMarketElement(market);
      this.rightContainer.appendChild(element);
    });
  }

  /**
   * Démarre la mise à jour régulière des horloges
   */
  start() {
    // Première mise à jour immédiate
    this.renderMarketClocks();
    
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
  }, 1000);
});