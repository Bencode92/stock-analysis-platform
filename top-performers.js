/**
 * Composant pour afficher les "Top 3" des indices avec les plus fortes variations
 * Ce composant peut être intégré sur la page principale à côté des tableaux d'indices
 */

document.addEventListener('DOMContentLoaded', function() {
    // Attendre que la page soit chargée et que les données de marché soient disponibles
    if (typeof window.marketData === 'undefined') {
        console.error('Les données de marché ne sont pas disponibles');
        return;
    }

    // Créer le composant Top Performers
    createTopPerformersComponent();
});

/**
 * Crée et insère le composant Top Performers dans la page
 */
function createTopPerformersComponent() {
    // Chercher l'emplacement où insérer le composant (à adapter selon votre structure HTML)
    const container = document.querySelector('.market-overview-container') || 
                      document.querySelector('.page-content') ||
                      document.querySelector('main');
    
    if (!container) {
        console.error('Impossible de trouver un conteneur pour le composant Top Performers');
        return;
    }

    // Créer l'élément qui contiendra le composant
    const topPerformersElement = document.createElement('div');
    topPerformersElement.className = 'top-performers-container';
    topPerformersElement.innerHTML = buildTopPerformersHTML();

    // Insérer le composant dans le DOM
    // Si vous voulez l'insérer à gauche, utilisez prepend(), sinon append()
    container.prepend(topPerformersElement);

    // Appliquer les styles
    applyTopPerformersStyles();
}

/**
 * Construit le HTML pour le composant Top Performers
 */
function buildTopPerformersHTML() {
    const topPerformers = window.marketData.top_performers;
    
    // Vérifier que les données sont disponibles
    if (!topPerformers || !topPerformers.daily || !topPerformers.ytd) {
        return '<div class="error-message">Les données de performance ne sont pas disponibles</div>';
    }

    // Construire le HTML pour les variations quotidiennes
    const dailyBestHTML = buildPerformersList(topPerformers.daily.best, 'Meilleures variations (jour)');
    const dailyWorstHTML = buildPerformersList(topPerformers.daily.worst, 'Pires variations (jour)');

    // Construire le HTML pour les variations depuis le début de l'année
    const ytdBestHTML = buildPerformersList(topPerformers.ytd.best, 'Meilleures variations (année)');
    const ytdWorstHTML = buildPerformersList(topPerformers.ytd.worst, 'Pires variations (année)');

    // Assembler le tout
    return `
        <div class="top-performers-panel">
            <h2 class="top-performers-title">Top Performances</h2>
            <div class="top-performers-tabs">
                <button class="tab-button active" data-tab="daily">Journalière</button>
                <button class="tab-button" data-tab="ytd">Annuelle</button>
            </div>
            <div class="tab-content active" id="daily-tab">
                <div class="performers-row">
                    ${dailyBestHTML}
                    ${dailyWorstHTML}
                </div>
            </div>
            <div class="tab-content" id="ytd-tab">
                <div class="performers-row">
                    ${ytdBestHTML}
                    ${ytdWorstHTML}
                </div>
            </div>
        </div>
    `;
}

/**
 * Construit la liste des indices pour une catégorie de performance
 */
function buildPerformersList(performers, title) {
    if (!performers || performers.length === 0) {
        return `
            <div class="performers-column">
                <h3>${title}</h3>
                <div class="no-data">Aucune donnée disponible</div>
            </div>
        `;
    }

    const itemsHTML = performers.map(item => {
        const trendClass = item.trend === 'up' ? 'trend-up' : 'trend-down';
        const valueFormatted = item.value || '—';
        const changeFormatted = item.changePercent || (title.includes('année') ? item.ytdChange : '—');
        
        return `
            <div class="performer-item ${trendClass}">
                <div class="performer-name">${item.name}</div>
                <div class="performer-value">${valueFormatted}</div>
                <div class="performer-change">${changeFormatted}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="performers-column">
            <h3>${title}</h3>
            <div class="performers-list">
                ${itemsHTML}
            </div>
        </div>
    `;
}

/**
 * Applique les styles CSS pour le composant
 */
function applyTopPerformersStyles() {
    // Créer un élément style
    const style = document.createElement('style');
    style.textContent = `
        .top-performers-container {
            margin-bottom: 20px;
        }
        
        .top-performers-panel {
            background-color: var(--bg-card, #0d1117);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            color: var(--text-primary, #fff);
            border: 1px solid var(--border-color, #304050);
        }
        
        .top-performers-title {
            margin: 0 0 15px 0;
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--accent-color, #00ff9d);
        }
        
        .top-performers-tabs {
            display: flex;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color, #304050);
        }
        
        .tab-button {
            background: none;
            border: none;
            color: var(--text-secondary, #a0a0a0);
            padding: 8px 15px;
            font-size: 0.9rem;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }
        
        .tab-button.active {
            color: var(--accent-color, #00ff9d);
            border-bottom: 2px solid var(--accent-color, #00ff9d);
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .performers-row {
            display: flex;
            justify-content: space-between;
            gap: 15px;
        }
        
        .performers-column {
            flex: 1;
        }
        
        .performers-column h3 {
            font-size: 0.9rem;
            margin: 0 0 10px 0;
            font-weight: 500;
            color: var(--text-secondary, #a0a0a0);
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
            padding: 8px 10px;
            border-radius: 4px;
            background-color: var(--bg-card-secondary, #1a2233);
            font-size: 0.85rem;
        }
        
        .performer-name {
            flex: 2;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .performer-value {
            flex: 1;
            text-align: right;
        }
        
        .performer-change {
            flex: 1;
            text-align: right;
            font-weight: 600;
        }
        
        .trend-up .performer-change {
            color: var(--color-positive, #00c853);
        }
        
        .trend-down .performer-change {
            color: var(--color-negative, #ff5252);
        }
        
        .no-data {
            font-style: italic;
            color: var(--text-muted, #808080);
            padding: 10px;
            text-align: center;
        }
        
        /* Pour les écrans plus petits */
        @media (max-width: 768px) {
            .performers-row {
                flex-direction: column;
            }
        }
    `;
    
    // Ajouter le style au head
    document.head.appendChild(style);
    
    // Ajouter l'interaction pour les onglets
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            // Désactiver tous les onglets
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Activer l'onglet cliqué
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}
