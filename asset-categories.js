/**
 * asset-categories.js
 * Module de gestion des catégories d'actifs financiers
 * Fournit des outils pour la classification et le filtrage des actualités par type d'actif
 */

// Gestionnaire de catégories d'actifs
const AssetCategories = {
  
  // Système de catégorisation des actifs
  categories: {
    stocks: {
      name: "Actions",
      icon: "fa-chart-line",
      color: "#4CAF50",
      keywords: [
        "stock", "action", "share", "equity", "corporate", "dividend", 
        "blue chip", "nyse", "nasdaq", "euronext", "publicly traded"
      ],
      companies: ["AAPL", "MSFT", "GOOG", "GOOGL", "META", "AMZN", "TSLA", "JPM", "BAC", "NVDA"]
    },
    
    crypto: {
      name: "Crypto",
      icon: "fa-bitcoin-sign",
      color: "#FF9800",
      keywords: [
        "crypto", "bitcoin", "ethereum", "blockchain", "altcoin", "token",
        "mining", "defi", "decentralized finance", "nft", "btc", "eth", "xrp"
      ],
      companies: ["COIN", "BTC", "ETH", "USDT", "BNB", "SOL", "XRP", "ADA", "DOGE", "DOT"]
    },
    
    etf: {
      name: "ETF",
      icon: "fa-layer-group",
      color: "#2196F3",
      keywords: [
        "etf", "exchange traded fund", "tracker", "index fund", "ucits",
        "vanguard", "ishares", "spdr", "lyxor", "amundi"
      ],
      companies: ["SPY", "QQQ", "VOO", "VTI", "ARKK", "IWM", "EFA", "VEA", "AGG", "BND"]
    },
    
    bonds: {
      name: "Obligations",
      icon: "fa-money-bill-transfer",
      color: "#9C27B0",
      keywords: [
        "bond", "treasury", "yield", "coupon", "fixed income", "sovereign debt",
        "corporate bond", "junk bond", "municipal", "obligation", "debt"
      ],
      companies: ["TLT", "SHY", "BND", "AGG", "LQD", "HYG", "EMB", "IEF", "GOVT", "MUB"]
    },
    
    forex: {
      name: "Devises",
      icon: "fa-coins",
      color: "#00BCD4",
      keywords: [
        "forex", "currency", "fx", "exchange rate", "dollar", "euro", "yen", 
        "pound", "gbp", "usd", "eur", "jpy", "chf", "central bank"
      ],
      companies: ["EUR/USD", "USD/JPY", "GBP/USD", "USD/CHF", "USD/CAD", "AUD/USD", "EUR/GBP", "EUR/JPY"]
    },
    
    commodities: {
      name: "Matières premières",
      icon: "fa-gem",
      color: "#FF5722",
      keywords: [
        "commodity", "gold", "silver", "oil", "natural gas", "copper", "wheat",
        "soybean", "cotton", "matière première", "opec", "wti", "brent", 
        "precious metal", "agriculture"
      ],
      companies: ["GLD", "SLV", "USO", "UNG", "DBC", "CPER", "WEAT", "JO", "CORN", "BAL"]
    },
    
    funds: {
      name: "Fonds",
      icon: "fa-briefcase",
      color: "#795548",
      keywords: [
        "mutual fund", "hedge fund", "fonds commun de placement", "sicav", "opcvm",
        "fund manager", "asset management", "fidelity", "blackrock", "morgan stanley"
      ],
      companies: ["FCNTX", "VFINX", "VTSMX", "PRGFX", "VTSAX", "FBGRX", "SWPPX", "VFIAX", "FXAIX", "FUSEX"]
    },
    
    realestate: {
      name: "Immobilier",
      icon: "fa-building",
      color: "#3F51B5",
      keywords: [
        "real estate", "reit", "property", "immobilier", "mortgage", "housing",
        "commercial property", "residential", "home builder", "construction"
      ],
      companies: ["VNQ", "IYR", "XLRE", "ICF", "SPG", "O", "AMT", "EQIX", "PLD", "DLR"]
    }
  },
  
  /**
   * Détermine la catégorie d'actif d'après le contenu d'une actualité
   * @param {Object} newsItem - Élément d'actualité à catégoriser
   * @returns {string} - Code de la catégorie identifiée
   */
  categorizeNews(newsItem) {
    // Combiner titre et résumé pour analyse
    const content = `${newsItem.title} ${newsItem.summary || ''}`.toLowerCase();
    
    // Vérifier pour des mentions spécifiques de ticker ou symbole
    const tickerMatch = content.match(/\b([A-Z]{1,5})\b/g);
    if (tickerMatch) {
      for (const [category, info] of Object.entries(this.categories)) {
        if (tickerMatch.some(ticker => info.companies.includes(ticker))) {
          return category;
        }
      }
    }
    
    // Analyse de mots-clés
    const categoryScores = {};
    
    // Initialiser les scores à 0
    Object.keys(this.categories).forEach(cat => {
      categoryScores[cat] = 0;
    });
    
    // Calculer le score pour chaque catégorie
    for (const [category, info] of Object.entries(this.categories)) {
      info.keywords.forEach(keyword => {
        if (content.includes(keyword.toLowerCase())) {
          categoryScores[category] += 1;
        }
      });
    }
    
    // Trouver la catégorie avec le score le plus élevé
    let highestCategory = 'stocks'; // Par défaut
    let highestScore = 0;
    
    for (const [category, score] of Object.entries(categoryScores)) {
      if (score > highestScore) {
        highestScore = score;
        highestCategory = category;
      }
    }
    
    return highestCategory;
  },
  
  /**
   * Récupère les informations pour une catégorie donnée
   * @param {string} categoryCode - Code de la catégorie
   * @returns {Object} - Informations sur la catégorie
   */
  getCategoryInfo(categoryCode) {
    return this.categories[categoryCode] || this.categories.stocks;
  },
  
  /**
   * Récupère l'icône pour une catégorie donnée
   * @param {string} categoryCode - Code de la catégorie
   * @returns {string} - Classe CSS de l'icône
   */
  getCategoryIcon(categoryCode) {
    const category = this.getCategoryInfo(categoryCode);
    return category ? category.icon : 'fa-chart-line';
  },
  
  /**
   * Récupère la couleur pour une catégorie donnée
   * @param {string} categoryCode - Code de la catégorie
   * @returns {string} - Code couleur hexadécimal
   */
  getCategoryColor(categoryCode) {
    const category = this.getCategoryInfo(categoryCode);
    return category ? category.color : '#4CAF50';
  },
  
  /**
   * Récupère le nom lisible pour une catégorie donnée
   * @param {string} categoryCode - Code de la catégorie
   * @returns {string} - Nom de la catégorie
   */
  getCategoryName(categoryCode) {
    const category = this.getCategoryInfo(categoryCode);
    return category ? category.name : 'Actions';
  },
  
  /**
   * Configure les boutons de filtre pour les catégories d'actifs
   * @param {string} containerId - ID du conteneur HTML des boutons de filtre
   */
  setupCategoryFilters(containerId = 'category-filters') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Vider le conteneur
    container.innerHTML = '';
    
    // Ajouter le bouton "Tous"
    const allButton = document.createElement('button');
    allButton.className = 'text-xs md:text-sm px-3 py-1.5 bg-green-400 bg-opacity-10 text-green-400 border border-green-400 border-opacity-30 rounded-full font-medium filter-active';
    allButton.dataset.category = 'all';
    allButton.textContent = 'Tous';
    container.appendChild(allButton);
    
    // Ajouter un bouton pour chaque catégorie
    for (const [code, info] of Object.entries(this.categories)) {
      const button = document.createElement('button');
      button.className = 'text-xs md:text-sm px-3 py-1.5 bg-transparent text-gray-400 border border-gray-700 rounded-full font-medium';
      button.dataset.category = code;
      
      // Ajouter une icône si disponible
      if (info.icon) {
        const icon = document.createElement('i');
        icon.className = `fas ${info.icon} mr-1`;
        button.appendChild(icon);
      }
      
      button.appendChild(document.createTextNode(info.name));
      container.appendChild(button);
    }
    
    // Attacher les événements de filtrage
    const buttons = container.querySelectorAll('button');
    buttons.forEach(button => {
      button.addEventListener('click', function() {
        // Retirer la classe active de tous les boutons
        buttons.forEach(btn => {
          btn.classList.remove('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
          btn.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
        });
        
        // Ajouter la classe active au bouton cliqué
        this.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
        this.classList.add('filter-active', 'bg-green-400', 'bg-opacity-10', 'text-green-400', 'border-green-400', 'border-opacity-30');
        
        // Appliquer le filtre
        if (window.filterNews) {
          window.filterNews('category', this.dataset.category);
        } else {
          console.warn('Fonction filterNews non disponible');
        }
      });
    });
  }
};

// Exporter pour utilisation modulaire
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AssetCategories;
} else {
  // Pour utilisation dans le navigateur
  window.AssetCategories = AssetCategories;
}

// Initialiser les filtres au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
  // Vérifier si le conteneur existe
  if (document.getElementById('category-filters')) {
    AssetCategories.setupCategoryFilters();
  }
});
