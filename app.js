// app.js - Logique principale de TradePulse

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', async function() {
  console.log('Application TradePulse initialisée');
  
  try {
    // Vérifier la connectivité
    const isConnected = await checkConnectivity();
    
    if (isConnected) {
      console.log('Connexion Internet établie, chargement des données...');
      await loadAppData();
    } else {
      console.error('Pas de connexion Internet détectée');
      showOfflineMode();
    }
    
    // Mettre à jour l'heure du marché
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
    
    // Initialiser les écouteurs d'événements
    initEventListeners();
    
  } catch (error) {
    console.error('Erreur lors de l\'initialisation:', error);
    showErrorState();
  }
});

// Charger toutes les données de l'application
async function loadAppData() {
  try {
    // Charger les actualités financières récentes
    const newsData = await fetchFinancialNews();
    window.newsData = newsData; // Stocker pour une utilisation ultérieure par d'autres modules
    
    // Analyser les secteurs boursiers basés sur les actualités
    const sectorData = await analyzeSectors(newsData);
    
    // Obtenir des instruments financiers recommandés
    const financialInstruments = await window.aiIntegration.getFinancialInstrumentsFromPerplexity(newsData);
    
    // Générer des portefeuilles optimisés avec Perplexity
    const portfolios = await window.aiIntegration.generatePortfoliosWithPerplexity(newsData, sectorData, financialInstruments);
    
    // Afficher le portefeuille dans l'interface
    displayPortfolios(portfolios);
    
    // Mettre à jour l'heure de la dernière mise à jour
    updateLastUpdateTime();
    
  } catch (error) {
    console.error('Erreur lors du chargement des données:', error);
    showDataLoadingError();
  }
}

// Récupérer les actualités financières récentes
async function fetchFinancialNews() {
  console.log('Récupération des actualités financières...');
  
  try {
    // Simuler une requête API réseau
    await simulateNetworkDelay(1000);
    
    // Données simulées pour le MVP
    return [
      {
        title: "Exemption de droits de douane sur les véhicules",
        source: "Maison Blanche",
        summary: "La Maison Blanche a annoncé un report d'un mois sur les nouveaux tarifs automobiles. Cette exemption a entraîné une hausse des actions, avec le DAX en hausse de 3,5%, le STOXX 50 en hausse de 1,9%, et le Hang Seng en hausse de 2,87%.",
        url: "#",
        date: "2025-03-07",
        sentiment: "positive",
        impact: 45
      },
      {
        title: "Flambée historique du marché obligataire européen",
        source: "Marchés Européens",
        summary: "Le marché obligataire européen a connu une journée historique avec une hausse de 30 points de base du rendement allemand à 10 ans, un record depuis 1990.",
        url: "#",
        date: "2025-03-07",
        sentiment: "negative",
        impact: 38
      },
      {
        title: "Décision de la BCE attendue aujourd'hui",
        source: "BCE",
        summary: "La BCE est prévue pour maintenir ses taux inchangés, mais il y a une attente pour une baisse de 25 points de base, ce qui pourrait avoir des conséquences importantes sur les marchés.",
        url: "#",
        date: "2025-03-07",
        sentiment: "neutral",
        impact: 42
      },
      {
        title: "Tesla augmente sa production à Berlin",
        source: "Tesla",
        summary: "Tesla a annoncé une augmentation significative de la production dans sa gigafactory de Berlin, visant à répondre à la demande croissante en Europe.",
        url: "#",
        date: "2025-03-06",
        sentiment: "positive",
        impact: 36
      },
      {
        title: "Résultats exceptionnels pour Nvidia",
        source: "Bloomberg",
        summary: "Nvidia a atteint un nouveau sommet historique en bourse, porté par des prévisions optimistes sur la demande de puces pour l'intelligence artificielle.",
        url: "#",
        date: "2025-03-07",
        sentiment: "positive",
        impact: 48
      }
    ];
  } catch (error) {
    console.error('Erreur lors de la récupération des actualités:', error);
    throw error;
  }
}

// Analyser les secteurs basés sur les actualités
async function analyzeSectors(newsData) {
  console.log('Analyse des secteurs basée sur les actualités...');
  
  try {
    // Simuler une analyse IA
    await simulateNetworkDelay(800);
    
    // Résultat d'analyse simulé
    return {
      bullish: [
        {
          name: "Automobile & VE",
          reason: "La décision de la Maison Blanche concernant le report des droits de douane a un impact positif direct sur les constructeurs automobiles, particulièrement ceux investis dans les véhicules électriques."
        },
        {
          name: "Technologie",
          reason: "Les résultats attendus de sociétés comme Broadcom et le développement continu de l'IA poussent le secteur vers le haut, malgré les tensions sino-américaines."
        },
        {
          name: "Énergie renouvelable",
          reason: "Les initiatives de transition énergétique continuent de favoriser les entreprises du secteur, particulièrement dans le contexte des tensions géopolitiques actuelles."
        }
      ],
      bearish: [
        {
          name: "Obligations",
          reason: "La hausse historique des rendements obligataires européens indique une pression à la baisse sur les prix des obligations, impactant les détenteurs d'obligations à long terme."
        },
        {
          name: "Immobilier",
          reason: "La hausse des taux d'intérêt et l'incertitude concernant les décisions de la BCE exercent une pression sur le secteur immobilier, particulièrement sensible aux variations de taux."
        },
        {
          name: "Importateurs chinois",
          reason: "Les tensions commerciales croissantes entre les États-Unis et la Chine menacent les entreprises fortement dépendantes des importations chinoises, créant de l'incertitude pour leurs modèles d'approvisionnement."
        }
      ]
    };
  } catch (error) {
    console.error('Erreur lors de l\'analyse des secteurs:', error);
    throw error;
  }
}

// Afficher les portefeuilles dans l'interface
function displayPortfolios(portfoliosData) {
  console.log('Affichage des portefeuilles avec les données:', portfoliosData);
  
  try {
    // Mise à jour des cartes d'actifs pour chaque profil
    if (portfoliosData) {
      // Pour le profil agressif
      if (portfoliosData.agressif) {
        const aggressiveHighlights = document.getElementById('aggressive-highlights');
        if (aggressiveHighlights) {
          aggressiveHighlights.innerHTML = generateHighlightCards(portfoliosData.agressif.slice(0, 3));
        }
      }
      
      // Pour le profil modéré
      if (portfoliosData.modere) {
        const moderateHighlights = document.getElementById('moderate-highlights');
        if (moderateHighlights) {
          moderateHighlights.innerHTML = generateHighlightCards(portfoliosData.modere.slice(0, 3));
        }
      }
      
      // Pour le profil stable
      if (portfoliosData.stable) {
        const safeHighlights = document.getElementById('safe-highlights');
        if (safeHighlights) {
          safeHighlights.innerHTML = generateHighlightCards(portfoliosData.stable.slice(0, 3));
        }
      }
      
      // Mise à jour des graphiques
      updatePortfolioCharts(portfoliosData);
    }
  } catch (error) {
    console.error('Erreur lors de l\'affichage des portefeuilles:', error);
  }
}

// Générer les cartes de mise en évidence pour les actifs principaux
function generateHighlightCards(assets) {
  if (!assets || assets.length === 0) {
    return '<div class="no-data">Aucune donnée de portefeuille disponible</div>';
  }
  
  let cardsHtml = '';
  
  // Mapper les types d'actifs aux icônes
  const typeIcons = {
    'stock': 'fa-chart-line',
    'etf': 'fa-chart-pie',
    'crypto': 'fa-bitcoin-sign',
    'bond': 'fa-landmark'
  };
  
  // Créer une carte pour chaque actif
  assets.forEach(asset => {
    const icon = typeIcons[asset.type] || 'fa-money-bill';
    
    cardsHtml += `
      <div class="highlight-card">
        <div class="highlight-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="highlight-content">
          <h3>${asset.name}</h3>
          <p class="highlight-symbol">${asset.symbol}</p>
          <p class="highlight-allocation">${asset.allocation}%</p>
          <p class="highlight-reason">${asset.reason}</p>
        </div>
      </div>
    `;
  });
  
  return cardsHtml;
}

// Mettre à jour les graphiques de portefeuille
function updatePortfolioCharts(portfoliosData) {
  console.log('Mise à jour des graphiques de portefeuille...');
  
  // Stockage des données pour utilisation dans les fonctions d'UI
  window.portfoliosData = portfoliosData;
  
  // Initialiser l'affichage avec le profil agressif par défaut
  if (typeof initChart === 'function') {
    initChart();
  }
}

// Initialiser les écouteurs d'événements
function initEventListeners() {
  // Bouton de rafraîchissement des données
  const refreshButton = document.querySelector('.update-data-button');
  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      try {
        refreshButton.disabled = true;
        refreshButton.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Rafraîchissement...';
        await loadAppData();
      } catch (error) {
        console.error('Erreur lors du rafraîchissement des données:', error);
      } finally {
        refreshButton.disabled = false;
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Actualiser les données';
      }
    });
  }
  
  // Autres écouteurs d'événements peuvent être ajoutés ici
}

// Mettre à jour l'heure du marché
function updateMarketTime() {
  const marketTimeElement = document.querySelector('.market-time');
  if (marketTimeElement) {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    marketTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
  }
}

// Mettre à jour l'heure de la dernière mise à jour
function updateLastUpdateTime() {
  const updateTimeElement = document.querySelector('.update-time');
  if (updateTimeElement) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    updateTimeElement.textContent = `${dateStr} ${timeStr}`;
  }
}

// Fonction utilitaire pour simuler un délai réseau
function simulateNetworkDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Afficher le mode hors ligne
function showOfflineMode() {
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.classList.add('offline-mode');
    
    // Ajouter une bannière d'alerte
    const alertBanner = document.createElement('div');
    alertBanner.className = 'alert-banner';
    alertBanner.innerHTML = `
      <i class="fas fa-wifi-slash"></i>
      <span>Mode hors ligne - Les données ne sont pas mises à jour</span>
      <button id="retry-connection" class="retry-button">
        <i class="fas fa-sync-alt"></i> Réessayer
      </button>
    `;
    
    // Insérer la bannière au début du conteneur
    appContainer.insertBefore(alertBanner, appContainer.firstChild);
    
    // Ajouter un écouteur pour le bouton réessayer
    const retryButton = document.getElementById('retry-connection');
    if (retryButton) {
      retryButton.addEventListener('click', async () => {
        const isConnected = await checkConnectivity();
        if (isConnected) {
          alertBanner.remove();
          appContainer.classList.remove('offline-mode');
          await loadAppData();
        } else {
          // Animer le bouton pour indiquer l'échec
          retryButton.classList.add('shake-animation');
          setTimeout(() => {
            retryButton.classList.remove('shake-animation');
          }, 820);
        }
      });
    }
  }
}

// Afficher un état d'erreur
function showErrorState() {
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>Une erreur est survenue</h2>
        <p>Impossible de charger les données de l'application. Veuillez réessayer plus tard.</p>
        <button id="reload-app" class="retry-button">
          <i class="fas fa-redo"></i> Recharger l'application
        </button>
      </div>
    `;
    
    // Ajouter un écouteur pour le bouton de rechargement
    const reloadButton = document.getElementById('reload-app');
    if (reloadButton) {
      reloadButton.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }
}

// Afficher une erreur de chargement des données
function showDataLoadingError() {
  // Créer un élément d'alerte
  const alertElement = document.createElement('div');
  alertElement.className = 'data-loading-error';
  alertElement.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>Impossible de charger certaines données. Les informations affichées peuvent être incomplètes.</span>
    <button class="close-button"><i class="fas fa-times"></i></button>
  `;
  
  // Ajouter l'alerte au corps du document
  document.body.appendChild(alertElement);
  
  // Faire apparaître l'alerte avec une animation
  setTimeout(() => {
    alertElement.classList.add('visible');
  }, 100);
  
  // Ajouter un écouteur pour le bouton de fermeture
  const closeButton = alertElement.querySelector('.close-button');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      alertElement.classList.remove('visible');
      setTimeout(() => {
        alertElement.remove();
      }, 300);
    });
  }
  
  // Masquer automatiquement après 5 secondes
  setTimeout(() => {
    if (document.body.contains(alertElement)) {
      alertElement.classList.remove('visible');
      setTimeout(() => {
        if (document.body.contains(alertElement)) {
          alertElement.remove();
        }
      }, 300);
    }
  }, 5000);
}
