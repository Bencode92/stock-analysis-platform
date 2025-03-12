/**
 * Script d'intégration du composant Top Performers pour TradePulse
 * Ce script injecte le composant directement dans la page Marchés
 */

(function() {
    // Fonction d'initialisation qui sera appelée quand la page est chargée
    function initTopPerformers() {
        console.log("Initialisation du composant Top Performers...");
        
        // Attendre que les données de marché soient chargées
        if (typeof window.marketData === 'undefined') {
            // Si les données ne sont pas disponibles, essayer de les charger à partir de l'API
            loadMarketData().then(createTopPerformersComponent);
        } else {
            // Si les données sont déjà disponibles, créer directement le composant
            createTopPerformersComponent();
        }
    }
    
    // Fonction pour charger les données de marché
    async function loadMarketData() {
        try {
            console.log("Chargement des données de marché...");
            const response = await fetch('/data/markets.json');
            if (!response.ok) {
                throw new Error('Erreur lors du chargement des données');
            }
            window.marketData = await response.json();
            console.log("Données de marché chargées avec succès");
            return true;
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            return false;
        }
    }
    
    // Fonction pour créer et insérer le composant
    function createTopPerformersComponent() {
        console.log("Création du composant Top Performers...");
        
        // Trouver le conteneur où insérer le composant
        const marketOverviewSection = document.querySelector('.market-overview-container, .apercu-marches');
        const indicesSection = document.querySelector('.indices-container, .indices-table-container');
        
        // Si on ne trouve pas les conteneurs spécifiques, chercher des alternatives
        let container = marketOverviewSection || indicesSection;
        
        // Si on ne trouve toujours pas de conteneur, essayer avec des sélecteurs plus génériques
        if (!container) {
            container = document.querySelector('#marches-content, .page-content, main');
            console.log("Utilisation d'un conteneur alternatif:", container);
        }
        
        if (!container) {
            console.error("Impossible de trouver un conteneur pour le composant Top Performers");
            return;
        }
        
        // Créer l'élément pour le composant
        const topPerformersElement = document.createElement('div');
        topPerformersElement.className = 'top-performers-container';
        topPerformersElement.innerHTML = buildTopPerformersHTML();
        
        // Insérer le composant au début du conteneur
        container.insertBefore(topPerformersElement, container.firstChild);
        
        // Appliquer les styles
        applyTopPerformersStyles();
        
        // Ajouter l'interaction pour les onglets
        setupTabInteraction();
        
        console.log("Composant Top Performers créé et inséré avec succès");
    }
    
    // Fonction pour construire le HTML du composant
    function buildTopPerformersHTML() {
        // Vérifier si les données sont disponibles
        if (!window.marketData || !window.marketData.top_performers) {
            console.error("Les données de top performers ne sont pas disponibles");
            return `
                <div class="top-performers-panel">
                    <h2 class="top-performers-title">Top Performances</h2>
                    <div class="error-message">Les données de performance ne sont pas disponibles</div>
                </div>
            `;
        }
        
        const topPerformers = window.marketData.top_performers;
        
        // Construire le HTML pour les variations quotidiennes
        const dailyBestHTML = buildPerformersList(topPerformers.daily.best, 'Meilleures variations (jour)');
        const dailyWorstHTML = buildPerformersList(topPerformers.daily.worst, 'Pires variations (jour)');
        
        // Construire le HTML pour les variations depuis le début de l'année
        const ytdBestHTML = buildPerformersList(topPerformers.ytd.best, 'Meilleures variations (année)');
        const ytdWorstHTML = buildPerformersList(topPerformers.ytd.worst, 'Pires variations (année)');
        
        // Assembler le HTML complet
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
    
    // Fonction pour construire la liste des indices pour une catégorie
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
    
    // Fonction pour appliquer les styles CSS
    function applyTopPerformersStyles() {
        // Créer un élément style et l'ajouter au head
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
                margin-bottom: 20px;
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
            
            .error-message {
                color: var(--color-negative, #ff5252);
                padding: 10px;
                text-align: center;
                font-style: italic;
            }
            
            /* Pour les écrans plus petits */
            @media (max-width: 768px) {
                .performers-row {
                    flex-direction: column;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // Fonction pour configurer l'interaction des onglets
    function setupTabInteraction() {
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
    
    // Exécuter l'initialisation au chargement de la page
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTopPerformers);
    } else {
        initTopPerformers();
    }
})();
