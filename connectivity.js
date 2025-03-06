// Module de gestion de connectivité pour TradePulse
// Ajouter ce fichier et l'importer dans index.html avec:
// <script src="connectivity.js"></script>

// Vérification de la connexion internet
function checkOnlineStatus() {
  // Vérification complète: navigateur + ping externe
  return navigator.onLine ? 
    fetch('https://api.github.com/zen', { 
      method: 'HEAD', 
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      mode: 'cors'
    })
    .then(() => true)
    .catch(() => false) : 
    Promise.resolve(false);
}

// Mettre à jour l'interface en mode hors ligne
function updateOfflineInterface() {
  // Mettre à jour le titre du portefeuille
  const portfolioTitle = document.querySelector('.portfolio-section h2');
  if (portfolioTitle) {
    portfolioTitle.innerHTML = '<i class="fas fa-briefcase"></i> Portefeuille recommandé (Mode hors ligne)';
  }
  
  // Ajouter une indication visuelle en haut de l'écran
  const header = document.querySelector('.main-header');
  if (header) {
    // Vérifier si la bannière existe déjà
    if (!document.querySelector('.offline-banner')) {
      const offlineBanner = document.createElement('div');
      offlineBanner.className = 'offline-banner';
      offlineBanner.innerHTML = '<i class="fas fa-wifi-slash"></i> Mode hors ligne - Les données ne sont pas mises à jour';
      
      // Insérer la bannière après le header
      header.parentNode.insertBefore(offlineBanner, header.nextSibling);
      
      // Ajouter des styles CSS pour la bannière
      const style = document.createElement('style');
      style.textContent = `
        .offline-banner {
          background-color: #ff3d00;
          color: white;
          text-align: center;
          padding: 8px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .offline-banner i {
          font-size: 1rem;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Ajouter un bouton pour réessayer la connexion
function setupRetryConnectionButton() {
  // Vérifier si le bouton existe déjà
  if (document.getElementById('retry-connection-btn')) return;
  
  const header = document.querySelector('.main-header');
  if (!header) return;
  
  // Créer un conteneur pour le bouton
  const reconnectContainer = document.createElement('div');
  reconnectContainer.className = 'header-refresh-container';
  
  // Créer le bouton
  const reconnectButton = document.createElement('button');
  reconnectButton.id = 'retry-connection-btn';
  reconnectButton.className = 'header-refresh-button';
  reconnectButton.innerHTML = '<i class="fas fa-wifi"></i> Réessayer la connexion';
  
  // Ajouter le bouton au header
  reconnectContainer.appendChild(reconnectButton);
  header.appendChild(reconnectContainer);
  
  // Ajouter l'écouteur d'événement
  reconnectButton.addEventListener('click', function() {
    // Désactiver le bouton pendant la vérification
    this.disabled = true;
    this.innerHTML = '<i class="fas fa-sync-alt refresh-spinning"></i> Vérification...';
    
    // Vérifier la connexion
    checkOnlineStatus().then(online => {
      if (online) {
        // Connexion rétablie
        showNotification('Connexion rétablie. Mise à jour des données...', 'success');
        
        // Supprimer la bannière hors ligne
        const offlineBanner = document.querySelector('.offline-banner');
        if (offlineBanner) {
          offlineBanner.remove();
        }
        
        // Redémarrer l'application en mode normal
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        // Toujours hors ligne
        showNotification('Toujours hors ligne. Veuillez vérifier votre connexion internet.', 'error');
        
        // Réactiver le bouton
        this.disabled = false;
        this.innerHTML = '<i class="fas fa-wifi"></i> Réessayer la connexion';
      }
    });
  });
}

// Affichage de notifications
function showNotification(message, type = 'success') {
  // Créer l'élément de notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Ajouter un icône selon le type
  const icon = document.createElement('i');
  icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
  notification.prepend(icon);
  
  // Ajouter au corps du document
  document.body.appendChild(notification);
  
  // Animation d'entrée
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Disparaître après 3 secondes
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// Charger des données statiques en mode hors ligne
function loadOfflineData(simulatePerplexityNewsAPI, simulatePerplexitySectorsAPI, simulatePerplexityPortfolioAPI, filterImportantNews, updateNewsDisplay, updateSectorsDisplay, updatePortfolioDisplay) {
  // Utiliser les fonctions de simulation mais sans délai
  const newsResponse = simulatePerplexityNewsAPI(true); // true = sans délai
  newsResponse.then(data => {
    const filteredNews = filterImportantNews(data.news);
    updateNewsDisplay(filteredNews);
  });
  
  const sectorsResponse = simulatePerplexitySectorsAPI(true);
  sectorsResponse.then(data => {
    updateSectorsDisplay(data);
  });
  
  const portfolioResponse = simulatePerplexityPortfolioAPI(true);
  portfolioResponse.then(data => {
    updatePortfolioDisplay(data);
  });
}

// Exporter les fonctions pour les rendre disponibles
window.connectivityTools = {
  checkOnlineStatus,
  updateOfflineInterface,
  setupRetryConnectionButton,
  showNotification,
  loadOfflineData
};
