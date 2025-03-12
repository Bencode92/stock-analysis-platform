/**
 * TradePulse - Composant Top Performers
 * Affiche les indices avec les plus fortes variations quotidiennes et annuelles
 */

document.addEventListener('DOMContentLoaded', () => {
  // Attendre le chargement des données
  const checkDataInterval = setInterval(() => {
    if (window.marketData) {
      clearInterval(checkDataInterval);
      initTopPerformers();
    }
  }, 100);
});

function initTopPerformers() {
  const marketOverviewSection = document.querySelector('.market-overview-container');
  if (!marketOverviewSection) return;

  // Créer le conteneur pour les top performers
  const topPerformersContainer = document.createElement('div');
  topPerformersContainer.classList.add('top-performers-container');

  // Insérer avant les cartes de régions
  const regionCards = document.querySelector('.region-cards');
  if (regionCards) {
    marketOverviewSection.insertBefore(topPerformersContainer, regionCards);
  } else {
    marketOverviewSection.appendChild(topPerformersContainer);
  }

  renderTopPerformers();
  initTopPerformersListeners();
  injectTopPerformersStyles();
}

function renderTopPerformers() {
  if (!window.marketData || !window.marketData.top_performers) return;
  
  const container = document.querySelector('.top-performers-container');
  if (!container) return;

  const { daily, ytd } = window.marketData.top_performers;
  
  // Déterminer quel onglet est actif
  const activeTab = document.querySelector('.top-tab-button.active')?.dataset.tab || 'daily';
  
  container.innerHTML = `
    <div class="top-performers-panel">
      <div class="top-performers-header">
        <h3>Meilleures Performances</h3>
        <div class="top-performers-tabs">
          <button class="top-tab-button ${activeTab === 'daily' ? 'active' : ''}" data-tab="daily">Journalière</button>
          <button class="top-tab-button ${activeTab === 'ytd' ? 'active' : ''}" data-tab="ytd">Annuelle</button>
        </div>
      </div>
      
      <div class="top-performers-content">
        <div class="top-tab-content ${activeTab === 'daily' ? 'active' : ''}" id="daily-tab">
          <div class="top-performers-grid">
            <div class="top-performers-column">
              <h4 class="top-column-title positive">Hausses</h4>
              ${renderPerformersList(daily.best, 'positive')}
            </div>
            <div class="top-performers-column">
              <h4 class="top-column-title negative">Baisses</h4>
              ${renderPerformersList(daily.worst, 'negative')}
            </div>
          </div>
        </div>
        
        <div class="top-tab-content ${activeTab === 'ytd' ? 'active' : ''}" id="ytd-tab">
          <div class="top-performers-grid">
            <div class="top-performers-column">
              <h4 class="top-column-title positive">Hausses</h4>
              ${renderPerformersList(ytd.best, 'positive', true)}
            </div>
            <div class="top-performers-column">
              <h4 class="top-column-title negative">Baisses</h4>
              ${renderPerformersList(ytd.worst, 'negative', true)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPerformersList(performers, trendClass, isYtd = false) {
  if (!performers || performers.length === 0) {
    return '<div class="no-performers">Aucune donnée disponible</div>';
  }

  let html = '<div class="performers-list">';
  
  performers.forEach(item => {
    const percentValue = isYtd ? item.ytdChange : item.changePercent;
    
    html += `
      <div class="performer-item">
        <div class="performer-info">
          <div class="performer-name">${item.name}</div>
          <div class="performer-region">${formatRegion(item.region)}</div>
        </div>
        <div class="performer-value">${item.value}</div>
        <div class="performer-change ${trendClass}">${percentValue}</div>
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

function formatRegion(region) {
  const regionMap = {
    'europe': 'Europe',
    'us': 'États-Unis',
    'asia': 'Asie',
    'other': 'Autres'
  };
  
  return regionMap[region] || region;
}

function initTopPerformersListeners() {
  // Ajouter les écouteurs d'événements pour les onglets
  document.addEventListener('click', event => {
    const tabButton = event.target.closest('.top-tab-button');
    if (!tabButton) return;
    
    const tab = tabButton.dataset.tab;
    if (!tab) return;
    
    // Mettre à jour les classes actives
    document.querySelectorAll('.top-tab-button').forEach(btn => {
      btn.classList.toggle('active', btn === tabButton);
    });
    
    document.querySelectorAll('.top-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tab}-tab`);
    });
  });
}

function injectTopPerformersStyles() {
  // Vérifier si le style existe déjà
  if (document.getElementById('top-performers-styles')) return;
  
  const styleElement = document.createElement('style');
  styleElement.id = 'top-performers-styles';
  styleElement.textContent = `
    .top-performers-container {
      margin-bottom: 16px;
    }
    
    .top-performers-panel {
      background-color: rgb(13, 25, 36);
      border-radius: 8px;
      border: 1px solid rgba(0, 255, 157, 0.2);
      overflow: hidden;
    }
    
    .top-performers-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      border-bottom: 1px solid rgba(0, 255, 157, 0.1);
    }
    
    .top-performers-header h3 {
      font-size: 18px;
      font-weight: 600;
      color: rgb(0, 255, 157);
      margin: 0;
    }
    
    .top-performers-tabs {
      display: flex;
    }
    
    .top-tab-button {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      padding: 6px 12px;
      margin-left: 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    
    .top-tab-button:hover {
      background-color: rgba(0, 255, 157, 0.1);
    }
    
    .top-tab-button.active {
      background-color: rgba(0, 255, 157, 0.15);
      color: rgb(0, 255, 157);
    }
    
    .top-performers-content {
      padding: 0;
    }
    
    .top-tab-content {
      display: none;
    }
    
    .top-tab-content.active {
      display: block;
    }
    
    .top-performers-grid {
      display: flex;
    }
    
    .top-performers-column {
      flex: 1;
      border-right: 1px solid rgba(0, 255, 157, 0.1);
      padding: 15px;
    }
    
    .top-performers-column:last-child {
      border-right: none;
    }
    
    .top-column-title {
      font-size: 14px;
      font-weight: 500;
      margin: 0 0 12px 0;
      text-align: center;
    }
    
    .top-column-title.positive {
      color: #00c853;
    }
    
    .top-column-title.negative {
      color: #ff5252;
    }
    
    .performers-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .performer-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background-color: rgba(0, 255, 157, 0.05);
      border-radius: 4px;
    }
    
    .performer-info {
      flex: 2;
    }
    
    .performer-name {
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }
    
    .performer-region {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
    }
    
    .performer-value {
      flex: 1;
      font-size: 14px;
      color: #fff;
      text-align: right;
      padding-right: 10px;
    }
    
    .performer-change {
      flex: 1;
      font-size: 14px;
      font-weight: 600;
      text-align: right;
    }
    
    .performer-change.positive {
      color: #00c853;
    }
    
    .performer-change.negative {
      color: #ff5252;
    }
    
    .no-performers {
      text-align: center;
      padding: 20px;
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .top-performers-grid {
        flex-direction: column;
      }
      
      .top-performers-column {
        border-right: none;
        border-bottom: 1px solid rgba(0, 255, 157, 0.1);
      }
      
      .top-performers-column:last-child {
        border-bottom: none;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}
