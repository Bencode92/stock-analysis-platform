// Script d'initialisation pour TradePulse
// Ce fichier coordonne les modules de connectivité et d'intégration AI

document.addEventListener('DOMContentLoaded', function() {
  // Vérifier l'état de la connexion au démarrage
  window.connectivityTools.checkOnlineStatus().then(isOnline => {
    if (isOnline) {
      console.log("TradePulse démarre en mode connecté");
      initializeOnlineMode();
    } else {
      console.log("TradePulse démarre en mode hors ligne");
      initializeOfflineMode();
    }
  });

  // Configuration en mode connecté
  function initializeOnlineMode() {
    // Mettre à jour l'interface pour indiquer qu'on est en ligne
    const portfolioTitle = document.querySelector('.portfolio-section h2');
    if (portfolioTitle) {
      portfolioTitle.innerHTML = '<i class="fas fa-briefcase"></i> Portefeuille recommandé par OpenAI (En ligne)';
    }

    // Ajouter un bouton de rafraîchissement dans le header
    addRefreshButton();

    // Charger les données initiales
    loadAllData();

    // Surveiller la connexion
    startConnectionMonitoring();
  }

  // Configuration en mode hors ligne
  function initializeOfflineMode() {
    // Mettre à jour l'interface pour indiquer qu'on est hors ligne
    window.connectivityTools.updateOfflineInterface();
    
    // Ajouter un bouton pour réessayer la connexion
    window.connectivityTools.setupRetryConnectionButton();
    
    // Charger des données statiques
    loadStaticData();
  }

  // Ajouter un bouton de rafraîchissement
  function addRefreshButton() {
    const header = document.querySelector('.main-header');
    if (!header) return;
    
    // Créer un conteneur pour le bouton
    const refreshContainer = document.createElement('div');
    refreshContainer.className = 'header-refresh-container';
    
    // Créer le bouton
    const refreshButton = document.createElement('button');
    refreshButton.id = 'globalRefreshButton';
    refreshButton.className = 'header-refresh-button';
    refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Actualiser les données';
    
    // Ajouter le bouton au header
    refreshContainer.appendChild(refreshButton);
    header.appendChild(refreshContainer);
    
    // Ajouter l'écouteur d'événement
    refreshButton.addEventListener('click', function() {
      refreshData(this);
    });
  }

  // Rafraîchir les données
  function refreshData(button) {
    // Ajouter un effet visuel pendant le chargement
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-sync-alt refresh-spinning"></i> Mise à jour en cours...';
    button.disabled = true;
    button.classList.add('refreshing');
    
    // Recharger toutes les données
    loadAllData()
      .then(() => {
        // Restaurer l'apparence du bouton
        setTimeout(() => {
          button.innerHTML = originalText;
          button.disabled = false;
          button.classList.remove('refreshing');
          
          // Afficher un message de confirmation
          window.connectivityTools.showNotification('Données mises à jour avec succès', 'success');
        }, 500);
      })
      .catch((error) => {
        console.error('Erreur lors de la mise à jour:', error);
        
        // Restaurer l'apparence du bouton
        button.innerHTML = originalText;
        button.disabled = false;
        button.classList.remove('refreshing');
        
        // Afficher un message d'erreur
        window.connectivityTools.showNotification('Erreur lors de la mise à jour des données', 'error');
      });
  }

  // Charger toutes les données actuelles
  async function loadAllData() {
    // Ce flux devrait être implémenté dans le fichier app.js
    // Voici comment il serait idéalement structuré:
    
    // 1. Récupérer les actualités de Perplexity
    // const newsData = await fetchFromPerplexity('news');
    
    // 2. Récupérer l'analyse sectorielle
    // const sectorData = await fetchFromPerplexity('sectors');
    
    // 3. Récupérer des instruments financiers selon les actualités des 4 derniers jours
    // const financialInstruments = await window.aiIntegration.getFinancialInstrumentsFromPerplexity(newsData);
    
    // 4. Générer un portefeuille équilibré avec OpenAI basé sur ces données
    // const portfolio = await window.aiIntegration.generatePortfolioWithOpenAI(newsData, sectorData, financialInstruments);
    
    // 5. Mettre à jour l'interface utilisateur
    // updateUI(newsData, sectorData, portfolio);
    
    // Cette fonction est un placeholder - l'implémentation réelle est dans app.js
    console.log("Chargement des données en direct...");
    
    // Simuler un délai pour le développement
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return true;
  }

  // Charger des données statiques en mode hors ligne
  function loadStaticData() {
    console.log("Chargement des données statiques en mode hors ligne...");
    // Cette fonction utiliserait les données locales statiques
    // L'implémentation complète est dans app.js
  }

  // Surveiller l'état de la connexion
  function startConnectionMonitoring() {
    // Vérifier périodiquement si nous sommes toujours en ligne
    setInterval(() => {
      window.connectivityTools.checkOnlineStatus().then(online => {
        if (!online) {
          console.log("Connexion internet perdue, passage en mode hors ligne");
          window.connectivityTools.showNotification('Connexion internet perdue. Passage en mode hors ligne.', 'error');
          window.connectivityTools.updateOfflineInterface();
          window.connectivityTools.setupRetryConnectionButton();
        }
      });
    }, 60000); // Vérifier toutes les minutes
  }
});
