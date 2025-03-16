/**
 * aiintegration.js - Intégration de Perplexity AI pour TradePulse
 * Ce script gère les requêtes vers l'API Perplexity pour obtenir 
 * des actualités financières et des recommandations de portefeuille en temps réel.
 * 
 * Version modifiée pour utiliser les fichiers JSON statiques générés par GitHub Actions.
 */

// Fonction pour obtenir le chemin de base
function getBasePath() {
    // Si sur GitHub Pages, construire le chemin avec le nom du repo
    if (window.location.hostname.includes('github.io')) {
        // Extraire le nom du dépôt de l'URL
        const pathParts = window.location.pathname.split('/');
        if (pathParts.length > 1) {
            // Retourner le chemin avec le nom du repo
            return '/' + pathParts[1] + '/';
        }
    }
    // Sinon, utiliser la racine
    return '/';
}

// Configuration de l'API
const API_CONFIG = {
    // URL du serveur proxy (mise à jour avec l'URL Render valide)
    baseUrl: 'https://stock-analysis-platform-q9tc.onrender.com',
    
    // Activation de Sonar
    useSonar: true,
    
    // Mode debug pour afficher plus d'informations dans la console
    debug: true,
    
    // Endpoints
    endpoints: {
        news: '/api/perplexity/news',
        portfolios: '/api/perplexity/portfolios',
        search: '/api/perplexity/search',
        sonar: '/api/perplexity/sonar' // Nouvel endpoint pour Sonar
    },
    
    // Intervalle de mise à jour (en millisecondes)
    updatesInterval: 30 * 60 * 1000, // Mise à jour toutes les 30 minutes
    
    // Options de timeout et retry pour améliorer la résilience
    fetchOptions: {
        timeout: 15000,
        retries: 3,
        retryDelay: 2000
    },
    
    // Nouvelles options pour les données statiques
    staticData: {
        enabled: true, // Utiliser les fichiers JSON statiques par défaut
        paths: {
            news: getBasePath() + 'data/news.json',
            portfolios: getBasePath() + 'data/portfolios.json'
        }
    }
};

// Données de secours à utiliser si le chargement échoue
const FALLBACK_DATA = {
    news: {
        us: [
            {
                title: "Marchés américains : perspectives positives pour le secteur technologique",
                content: "Les marchés américains montrent des signaux positifs, portés par le secteur technologique et les résultats des entreprises du S&P 500.",
                source: "TradePulse",
                date: new Date().toLocaleDateString('fr-FR'),
                time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
                category: "marches",
                impact: "positive",
                country: "us"
            },
            {
                title: "La Fed maintient sa politique monétaire",
                content: "La Réserve fédérale américaine a décidé de maintenir sa politique actuelle, en ligne avec les attentes des analystes.",
                source: "TradePulse",
                date: new Date().toLocaleDateString('fr-FR'),
                time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
                category: "economie",
                impact: "neutral",
                country: "us"
            }
        ],
        france: [
            {
                title: "Le CAC 40 en hausse, porté par le secteur du luxe",
                content: "L'indice parisien enregistre une progression, soutenu notamment par les valeurs du luxe et les perspectives économiques européennes.",
                source: "TradePulse",
                date: new Date().toLocaleDateString('fr-FR'),
                time: new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
                category: "marches",
                impact: "positive",
                country: "fr"
            }
        ],
        events: [
            {
                title: "Publication des résultats trimestriels des grandes entreprises tech",
                date: "28/03/2025",
                time: "16:30",
                type: "earnings",
                importance: "high"
            },
            {
                title: "Réunion de la BCE sur les taux d'intérêt",
                date: "22/03/2025",
                time: "13:45",
                type: "policy",
                importance: "high"
            }
        ],
        lastUpdated: new Date().toISOString()
    },
    portfolios: {
        agressif: [
            {
                name: "NVIDIA Corporation",
                symbol: "NVDA",
                type: "Action",
                allocation: 25,
                reason: "Leader dans les processeurs graphiques et l'IA",
                change: 3.5
            },
            {
                name: "Tesla, Inc.",
                symbol: "TSLA",
                type: "Action",
                allocation: 20,
                reason: "Innovation dans les véhicules électriques",
                change: 2.1
            },
            {
                name: "ARK Innovation ETF",
                symbol: "ARKK",
                type: "ETF",
                allocation: 15,
                reason: "Exposition aux technologies disruptives",
                change: 1.8
            },
            {
                name: "Bitcoin",
                symbol: "BTC",
                type: "Crypto",
                allocation: 15,
                reason: "Diversification avec la cryptomonnaie principale",
                change: 4.5
            },
            {
                name: "Amazon.com, Inc.",
                symbol: "AMZN",
                type: "Action",
                allocation: 15,
                reason: "Leader e-commerce et cloud computing",
                change: 1.2
            },
            {
                name: "Advanced Micro Devices",
                symbol: "AMD",
                type: "Action",
                allocation: 10,
                reason: "Croissance dans le secteur des semi-conducteurs",
                change: 2.7
            }
        ],
        modere: [
            {
                name: "Microsoft Corporation",
                symbol: "MSFT",
                type: "Action",
                allocation: 20,
                reason: "Leader stable en technologie et cloud",
                change: 1.1
            },
            {
                name: "Vanguard S&P 500 ETF",
                symbol: "VOO",
                type: "ETF",
                allocation: 20,
                reason: "Exposition large au marché américain",
                change: 0.9
            },
            {
                name: "Apple Inc.",
                symbol: "AAPL",
                type: "Action",
                allocation: 15,
                reason: "Entreprise technologique stable avec dividendes",
                change: 0.7
            },
            {
                name: "Alphabet Inc.",
                symbol: "GOOGL",
                type: "Action",
                allocation: 15,
                reason: "Leader dans la recherche en ligne et l'IA",
                change: 1.3
            },
            {
                name: "iShares Core U.S. Aggregate Bond ETF",
                symbol: "AGG",
                type: "ETF",
                allocation: 20,
                reason: "Stabilité avec des obligations américaines",
                change: 0.2
            },
            {
                name: "Coca-Cola Company",
                symbol: "KO",
                type: "Action",
                allocation: 10,
                reason: "Valeur défensive avec dividendes stables",
                change: 0.4
            }
        ],
        stable: [
            {
                name: "Vanguard Total Bond Market ETF",
                symbol: "BND",
                type: "ETF",
                allocation: 25,
                reason: "Base d'obligations diversifiées",
                change: 0.1
            },
            {
                name: "iShares TIPS Bond ETF",
                symbol: "TIP",
                type: "ETF",
                allocation: 20,
                reason: "Protection contre l'inflation",
                change: 0.2
            },
            {
                name: "Johnson & Johnson",
                symbol: "JNJ",
                type: "Action",
                allocation: 15,
                reason: "Valeur défensive dans le secteur de la santé",
                change: 0.3
            },
            {
                name: "Berkshire Hathaway Inc.",
                symbol: "BRK.B",
                type: "Action",
                allocation: 15,
                reason: "Portefeuille diversifié à gestion conservatrice",
                change: 0.5
            },
            {
                name: "Procter & Gamble Co.",
                symbol: "PG",
                type: "Action",
                allocation: 15,
                reason: "Biens de consommation avec dividendes stables",
                change: 0.2
            },
            {
                name: "SPDR Gold Shares",
                symbol: "GLD",
                type: "ETF",
                allocation: 10,
                reason: "Diversification avec l'or comme valeur refuge",
                change: 0.6
            }
        ],
        marketContext: {
            mainTrend: "bullish",
            volatilityLevel: "moderate",
            keyEvents: [
                "Décision de maintien des taux par les banques centrales",
                "Résultats trimestriels positifs du secteur technologique",
                "Reprise économique globale"
            ]
        },
        lastUpdated: new Date().toISOString()
    }
};

// Classe principale pour l'intégration de Perplexity
class PerplexityIntegration {
    constructor() {
        this.newsData = {
            us: [],
            france: [],
            events: [],
            lastUpdated: null
        };
        
        this.portfolios = {
            agressif: [],
            modere: [],
            stable: [],
            marketContext: {},
            lastUpdated: null
        };
        
        // Flag pour suivre la disponibilité de l'API
        this.apiAvailable = false;
        
        // Initialisation des données
        this.init();
    }
    
    /**
     * Initialise l'intégration avec Perplexity
     */
    async init() {
        console.log('Initialisation de l\'intégration TradePulse...');
        console.log('Chemins de données statiques:', API_CONFIG.staticData.paths);
        
        try {
            // Vérifier d'abord si des données préchargées existent
            if (window.TRADEPULSE_STATIC_DATA) {
                console.log('✅ Données pré-chargées trouvées, utilisation directe');
                
                if (window.TRADEPULSE_STATIC_DATA.news) {
                    this.newsData = window.TRADEPULSE_STATIC_DATA.news;
                    console.log('📰 Données d\'actualités pré-chargées appliquées');
                }
                
                if (window.TRADEPULSE_STATIC_DATA.portfolios) {
                    this.portfolios = window.TRADEPULSE_STATIC_DATA.portfolios;
                    console.log('💼 Données de portefeuilles pré-chargées appliquées');
                }
                
                // Mettre à jour l'interface immédiatement
                this.updateUI();
            } 
            // Sinon, essayer de charger les données statiques
            else if (API_CONFIG.staticData.enabled) {
                await this.loadStaticData();
                console.log('✅ Données statiques chargées avec succès');
            }
            
            // Même si les données statiques sont chargées, nous vérifions si l'API est disponible
            // pour les futures recherches mais sans bloquer l'interface
            this.checkApiAvailability();
            
            // Si nous n'utilisons pas les données statiques, charger depuis l'API
            if (!API_CONFIG.staticData.enabled && !window.TRADEPULSE_STATIC_DATA) {
                await this.updateData();
            }
            
            // Configurer une mise à jour périodique des données
            setInterval(() => {
                if (API_CONFIG.staticData.enabled) {
                    this.loadStaticData();
                } else if (this.apiAvailable) {
                    this.updateData();
                }
            }, API_CONFIG.updatesInterval);
            
            console.log('✅ Intégration TradePulse initialisée avec succès');
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error.message);
            // Utiliser les données de secours en cas d'erreur critique d'initialisation
            console.log('⚠️ Utilisation des données de secours après erreur d\'initialisation');
            this.newsData = FALLBACK_DATA.news;
            this.portfolios = FALLBACK_DATA.portfolios;
            this.updateUI();
            this.handleApiError();
        }
    }
    
    /**
     * Vérifie si l'API est disponible (en arrière-plan)
     */
    async checkApiAvailability() {
        try {
            console.log('🔍 Vérification de la disponibilité de l\'API...');
            await this.fetchWithRetry(`${API_CONFIG.baseUrl}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, true);
            
            this.apiAvailable = true;
            console.log('✅ API Perplexity disponible pour les recherches');
            return true;
        } catch (error) {
            this.apiAvailable = false;
            console.log('⚠️ API Perplexity non disponible. Utilisation des données statiques uniquement.');
            return false;
        }
    }
    
    /**
     * Charge les données depuis les fichiers JSON statiques
     */
    async loadStaticData() {
        try {
            console.log('🔍 Chargement des données statiques...');
            
            // Afficher un état de chargement dans l'UI si nécessaire
            this.showLoadingState();
            
            // Éviter la mise en cache des fichiers JSON
            const timestamp = new Date().getTime();
            
            // Ajouter des logs détaillés pour déboguer les chemins
            console.log(`URL du fichier d'actualités: ${API_CONFIG.staticData.paths.news}?t=${timestamp}`);
            console.log(`URL du fichier de portefeuilles: ${API_CONFIG.staticData.paths.portfolios}?t=${timestamp}`);
            
            try {
                // Chargement des actualités avec plus d'informations de débogage
                const newsResponse = await fetch(`${API_CONFIG.staticData.paths.news}?t=${timestamp}`);
                if (!newsResponse.ok) {
                    console.error(`Erreur HTTP lors du chargement des actualités: ${newsResponse.status} ${newsResponse.statusText}`);
                    throw new Error(`Erreur de chargement des actualités: ${newsResponse.status}`);
                }
                
                // Conversion en JSON avec vérification
                try {
                    this.newsData = await newsResponse.json();
                    console.log('✅ Données d\'actualités chargées avec succès:', 
                        this.newsData.us.length + ' articles US, ' + 
                        this.newsData.france.length + ' articles France, ' + 
                        this.newsData.events.length + ' événements'
                    );
                } catch (jsonError) {
                    console.error('Erreur lors du parsing JSON des actualités:', jsonError);
                    console.log('Contenu de la réponse:', await newsResponse.text());
                    throw jsonError;
                }
            } catch (newsError) {
                console.error('❌ Échec du chargement des actualités:', newsError);
                // Utiliser les données de secours pour les actualités
                console.log('⚠️ Utilisation des données d\'actualités de secours');
                this.newsData = FALLBACK_DATA.news;
                // Continuer avec les portefeuilles
            }
            
            try {
                // Chargement des portefeuilles avec plus d'informations de débogage
                const portfoliosResponse = await fetch(`${API_CONFIG.staticData.paths.portfolios}?t=${timestamp}`);
                if (!portfoliosResponse.ok) {
                    console.error(`Erreur HTTP lors du chargement des portefeuilles: ${portfoliosResponse.status} ${portfoliosResponse.statusText}`);
                    throw new Error(`Erreur de chargement des portefeuilles: ${portfoliosResponse.status}`);
                }
                
                // Conversion en JSON avec vérification
                try {
                    this.portfolios = await portfoliosResponse.json();
                    console.log('✅ Données de portefeuilles chargées avec succès:',
                        this.portfolios.agressif.length + ' actifs agressifs, ' +
                        this.portfolios.modere.length + ' actifs modérés, ' +
                        this.portfolios.stable.length + ' actifs stables'
                    );
                } catch (jsonError) {
                    console.error('Erreur lors du parsing JSON des portefeuilles:', jsonError);
                    console.log('Contenu de la réponse:', await portfoliosResponse.text());
                    throw jsonError;
                }
            } catch (portfoliosError) {
                console.error('❌ Échec du chargement des portefeuilles:', portfoliosError);
                // Utiliser les données de secours pour les portefeuilles
                console.log('⚠️ Utilisation des données de portefeuilles de secours');
                this.portfolios = FALLBACK_DATA.portfolios;
            }

            // Mise à jour de l'interface avec les données chargées/de secours
            this.updateUI();
            
            return { 
                newsData: this.newsData, 
                portfoliosData: this.portfolios 
            };
        } catch (error) {
            console.error('❌ Erreur générale lors du chargement des données statiques:', error);
            
            // En cas d'erreur critique, utiliser les données de secours
            console.log('⚠️ Utilisation des données de secours après erreur critique');
            this.newsData = FALLBACK_DATA.news;
            this.portfolios = FALLBACK_DATA.portfolios;
            
            // Mettre à jour l'interface avec les données de secours
            this.updateUI();
            this.handleApiError();
            
            return { 
                newsData: this.newsData, 
                portfoliosData: this.portfolios 
            };
        }
    }
    
    /**
     * Affiche l'état de chargement dans l'interface
     */
    showLoadingState() {
        // Actualités
        const newsGrid = document.querySelector('.news-grid');
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Chargement des dernières actualités financières...</p>
                </div>
            `;
        }
        
        // Événements
        const eventsContainer = document.getElementById('events-container');
        if (eventsContainer) {
            eventsContainer.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Chargement des événements à venir...</p>
                </div>
            `;
        }
        
        // Portefeuilles
        const portfolioContainers = [
            document.getElementById('aggressiveDetails'),
            document.getElementById('moderateDetails'),
            document.getElementById('stableDetails')
        ];
        
        portfolioContainers.forEach(container => {
            if (container) {
                const tableContainer = container.querySelector('.portfolio-table');
                if (tableContainer) {
                    // Conserver l'en-tête
                    const tableHeader = tableContainer.querySelector('.table-header');
                    tableContainer.innerHTML = '';
                    if (tableHeader) tableContainer.appendChild(tableHeader);
                    
                    tableContainer.insertAdjacentHTML('beforeend', `
                        <div class="table-row loading-row">
                            <div class="loading-indicator">
                                <div class="pulse-dot"></div>
                                <p>Chargement des données du portefeuille...</p>
                            </div>
                        </div>
                    `);
                }
            }
        });
    }
    
    /**
     * Effectue une requête fetch avec retry et timeout
     */
    async fetchWithRetry(url, options = {}, skipParse = false) {
        let attempt = 0;
        
        while (attempt < API_CONFIG.fetchOptions.retries) {
            try {
                // Ajouter un timeout à la requête fetch
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.fetchOptions.timeout);
                
                const fetchOptions = {
                    ...options,
                    signal: controller.signal
                };
                
                const response = await fetch(url, fetchOptions);
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
                }
                
                // Si skipParse est true, on renvoie juste la réponse
                if (skipParse) {
                    return response;
                }
                
                // Sinon on parse le JSON
                const data = await response.json();
                return data;
            } catch (error) {
                attempt++;
                console.warn(`Tentative ${attempt}/${API_CONFIG.fetchOptions.retries} échouée:`, error.message);
                
                if (attempt >= API_CONFIG.fetchOptions.retries) {
                    throw error;
                }
                
                // Attendre avant de réessayer
                await new Promise(resolve => setTimeout(resolve, API_CONFIG.fetchOptions.retryDelay));
            }
        }
    }
    
    /**
     * Gère les erreurs d'API en affichant des messages d'erreur appropriés
     */
    handleApiError() {
        console.log('⚠️ Affichage des messages d\'erreur dans l\'interface');
        
        // Actualités
        const newsGrid = document.querySelector('.news-grid');
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Impossible de charger les actualités</h3>
                    <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                    <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                        <i class="fas fa-sync-alt"></i> Réessayer
                    </button>
                </div>
            `;
        }
        
        // Portefeuilles
        const portfolioContainers = [
            document.getElementById('aggressiveDetails'),
            document.getElementById('moderateDetails'),
            document.getElementById('stableDetails')
        ];
        
        portfolioContainers.forEach(container => {
            if (container) {
                const tableContainer = container.querySelector('.portfolio-table');
                if (tableContainer) {
                    const tableHeader = tableContainer.querySelector('.table-header');
                    tableContainer.innerHTML = '';
                    if (tableHeader) tableContainer.appendChild(tableHeader);
                    
                    tableContainer.insertAdjacentHTML('beforeend', `
                        <div class="table-row error-row">
                            <div class="error-message">
                                <i class="fas fa-exclamation-triangle"></i>
                                <h3>Impossible de charger les données du portefeuille</h3>
                                <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                                <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                                    <i class="fas fa-sync-alt"></i> Réessayer
                                </button>
                            </div>
                        </div>
                    `);
                }
            }
        });
    }
    
    /**
     * Met à jour les données depuis Perplexity (via API)
     */
    async updateData() {
        console.log('🔄 Mise à jour des données depuis Perplexity...');
        
        try {
            if (!this.apiAvailable) {
                console.log('⚠️ API non disponible, utilisation des données statiques');
                return this.loadStaticData();
            }
            
            // Mettre à jour les actualités et les portefeuilles en parallèle
            const [newsData, portfoliosData] = await Promise.all([
                this.updateNews(),
                this.updatePortfolios()
            ]);
            
            // Mise à jour des affichages sur le site
            this.updateUI();
            
            console.log('✅ Données mises à jour avec succès');
            return { newsData, portfoliosData };
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour des données:', error);
            
            // En cas d'erreur, on essaie de charger les données statiques
            if (API_CONFIG.staticData.enabled) {
                console.log('⚠️ Tentative de chargement depuis les fichiers statiques...');
                return this.loadStaticData();
            } else {
                this.handleApiError();
                throw error;
            }
        }
    }
    
    /**
     * Met à jour les actualités financières depuis Perplexity
     */
    async updateNews() {
        try {
            console.log('🔍 Récupération des actualités depuis l\'API...');
            
            // Afficher un état de chargement dans l'UI si nécessaire
            const newsGrid = document.querySelector('.news-grid');
            if (newsGrid) {
                newsGrid.innerHTML = `
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>Chargement des dernières actualités financières...</p>
                    </div>
                `;
            }
            
            // Appel à l'API via le proxy avec retry
            const data = await this.fetchWithRetry(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.news}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    useSonar: API_CONFIG.useSonar // Indiquer si on doit utiliser Sonar
                })
            });
            
            if (API_CONFIG.debug) {
                console.log('📊 Actualités reçues:', data);
            }
            
            // Mise à jour des données d'actualités
            this.newsData = data;
            
            console.log('✅ Actualités mises à jour avec succès');
            
            // Mettre à jour l'UI des actualités immédiatement
            this.updateNewsUI();
            
            return this.newsData;
            
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour des actualités:', error);
            
            // En cas d'erreur, on essaie de charger les données statiques
            if (API_CONFIG.staticData.enabled) {
                console.log('⚠️ Tentative de chargement des actualités depuis les fichiers statiques...');
                const response = await fetch(API_CONFIG.staticData.paths.news);
                if (response.ok) {
                    this.newsData = await response.json();
                    this.updateNewsUI();
                    return this.newsData;
                } else {
                    // Utiliser les données de secours
                    console.log('⚠️ Utilisation des données d\'actualités de secours');
                    this.newsData = FALLBACK_DATA.news;
                    this.updateNewsUI();
                    return this.newsData;
                }
            }
            
            // Afficher message d'erreur dans l'UI
            const newsGrid = document.querySelector('.news-grid');
            if (newsGrid) {
                newsGrid.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Impossible de charger les actualités</h3>
                        <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                        <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                            <i class="fas fa-sync-alt"></i> Réessayer
                        </button>
                    </div>
                `;
            }
            
            throw error;
        }
    }
    
    /**
     * Met à jour les recommandations de portefeuille depuis Perplexity
     */
    async updatePortfolios() {
        try {
            console.log('🔍 Récupération des portefeuilles depuis l\'API...');
            
            // Afficher un état de chargement dans l'UI pour chaque portefeuille
            const portfolioContainers = [
                document.getElementById('aggressiveDetails'),
                document.getElementById('moderateDetails'),
                document.getElementById('stableDetails')
            ];
            
            portfolioContainers.forEach(container => {
                if (container) {
                    const tableContainer = container.querySelector('.portfolio-table');
                    if (tableContainer) {
                        // Conserver l'en-tête
                        const tableHeader = tableContainer.querySelector('.table-header');
                        tableContainer.innerHTML = '';
                        if (tableHeader) tableContainer.appendChild(tableHeader);
                        
                        tableContainer.insertAdjacentHTML('beforeend', `
                            <div class="table-row loading-row">
                                <div class="loading-indicator">
                                    <div class="pulse-dot"></div>
                                    <p>Génération du portefeuille optimisé via Perplexity AI...</p>
                                </div>
                            </div>
                        `);
                    }
                }
            });
            
            // Appel à l'API via le proxy avec retry
            const data = await this.fetchWithRetry(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.portfolios}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    useSonar: API_CONFIG.useSonar // Indiquer si on doit utiliser Sonar
                })
            });
            
            if (API_CONFIG.debug) {
                console.log('📊 Portefeuilles reçus:', data);
            }
            
            // Mise à jour des données de portefeuilles
            this.portfolios = data;
            
            console.log('✅ Portefeuilles mis à jour avec succès');
            
            // Mettre à jour l'UI des portefeuilles immédiatement
            this.updatePortfoliosUI();
            
            return this.portfolios;
            
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour des portefeuilles:', error);
            
            // En cas d'erreur, on essaie de charger les données statiques
            if (API_CONFIG.staticData.enabled) {
                console.log('⚠️ Tentative de chargement des portefeuilles depuis les fichiers statiques...');
                const response = await fetch(API_CONFIG.staticData.paths.portfolios);
                if (response.ok) {
                    this.portfolios = await response.json();
                    this.updatePortfoliosUI();
                    return this.portfolios;
                } else {
                    // Utiliser les données de secours
                    console.log('⚠️ Utilisation des données de portefeuilles de secours');
                    this.portfolios = FALLBACK_DATA.portfolios;
                    this.updatePortfoliosUI();
                    return this.portfolios;
                }
            }
            
            // Afficher message d'erreur dans l'UI pour chaque portefeuille
            const portfolioContainers = [
                document.getElementById('aggressiveDetails'),
                document.getElementById('moderateDetails'),
                document.getElementById('stableDetails')
            ];
            
            portfolioContainers.forEach(container => {
                if (container) {
                    const tableContainer = container.querySelector('.portfolio-table');
                    if (tableContainer) {
                        const tableHeader = tableContainer.querySelector('.table-header');
                        tableContainer.innerHTML = '';
                        if (tableHeader) tableContainer.appendChild(tableHeader);
                        
                        tableContainer.insertAdjacentHTML('beforeend', `
                            <div class="table-row error-row">
                                <div class="error-message">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <h3>Impossible de charger les données du portefeuille</h3>
                                    <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                                    <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                                        <i class="fas fa-sync-alt"></i> Réessayer
                                    </button>
                                </div>
                            </div>
                        `);
                    }
                }
            });
            
            throw error;
        }
    }
    
    /**
     * Effectue une recherche personnalisée avec Perplexity
     */
    async search(query) {
        // Vérifier si l'API est disponible
        if (!this.apiAvailable) {
            return {
                answer: "Désolé, mais l'API n'est pas disponible actuellement. Veuillez réessayer plus tard.",
                limited: true
            };
        }
        
        // Vérifier si nous avons atteint la limite journalière
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const requestsKey = `tradepulse_search_requests_${currentDate}`;
        const currentRequests = parseInt(localStorage.getItem(requestsKey) || '0');
        
        const DAILY_SEARCH_LIMIT = 10; // Limite de 10 recherches par jour par utilisateur
        
        if (currentRequests >= DAILY_SEARCH_LIMIT) {
            // Limite atteinte
            return {
                answer: "Désolé, la limite quotidienne de recherches a été atteinte. Les réponses sont limitées pour conserver nos crédits API. Veuillez réessayer demain ou utiliser les données préchargées.",
                limited: true
            };
        }
        
        // Si Sonar est activé, rediriger vers searchWithSonar
        if (API_CONFIG.useSonar) {
            const result = await this.searchWithSonar(query);
            
            // Incrémenter le compteur
            localStorage.setItem(requestsKey, (currentRequests + 1).toString());
            
            return result;
        }
        
        try {
            console.log(`🔍 Recherche standard: "${query}"`);
            console.log(`📡 URL complète: ${API_CONFIG.baseUrl}${API_CONFIG.endpoints.search}`);
            
            // Appel à l'API via le proxy avec retry
            const data = await this.fetchWithRetry(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.search}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });
            
            if (API_CONFIG.debug) {
                console.log('📊 Résultats de recherche reçus:', data);
            }
            
            // Incrémenter le compteur
            localStorage.setItem(requestsKey, (currentRequests + 1).toString());
            
            console.log('✅ Recherche effectuée avec succès');
            return data;
            
        } catch (error) {
            console.error('❌ Erreur lors de la recherche:', error);
            throw error;
        }
    }
    
    /**
     * Effectue une recherche avec Perplexity Sonar
     */
    async searchWithSonar(query) {
        try {
            console.log(`🔍 Recherche Sonar: "${query}"`);
            console.log(`📡 URL complète: ${API_CONFIG.baseUrl}${API_CONFIG.endpoints.sonar}`);
            
            // Appel à l'API Sonar via le proxy avec retry
            const data = await this.fetchWithRetry(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.sonar}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    query,
                    options: {
                        mode: 'sonar',
                        enhance_precision: true,
                        include_financial_metrics: true
                    }
                })
            });
            
            if (API_CONFIG.debug) {
                console.log('📊 Résultats de recherche Sonar reçus:', data);
            }
            
            console.log('✅ Recherche Sonar effectuée avec succès');
            return data;
            
        } catch (error) {
            console.error('❌ Erreur lors de la recherche Sonar:', error);
            
            // Fallback vers la recherche standard
            try {
                console.log('⚠️ Fallback vers recherche standard');
                // Désactiver temporairement Sonar pour éviter une boucle
                const originalSonarSetting = API_CONFIG.useSonar;
                API_CONFIG.useSonar = false;
                const result = await this.search(query);
                API_CONFIG.useSonar = originalSonarSetting;
                return result;
            } catch (fallbackError) {
                throw error;
            }
        }
    }
    
    /**
     * Met à jour l'interface utilisateur avec les données actualisées
     */
    updateUI() {
        // Mise à jour des actualités dans l'interface
        this.updateNewsUI();
        
        // Mise à jour des événements dans l'interface
        this.updateEventsUI();
        
        // Mise à jour des portefeuilles dans l'interface
        this.updatePortfoliosUI();
        
        // Mise à jour des horodatages
        document.querySelectorAll('.update-time').forEach(el => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('fr-FR');
            const timeStr = now.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            el.textContent = `${dateStr} ${timeStr}`;
        });
    }
    
    /**
     * Met à jour la section des événements dans l'interface
     */
    updateEventsUI() {
        // Vérifier si nous sommes sur la page des actualités
        const eventsContainer = document.getElementById('events-container');
        if (!eventsContainer) return;
        
        try {
            // Vérifier si nous avons des données d'événements
            if (!this.newsData || !this.newsData.events || this.newsData.events.length === 0) {
                eventsContainer.innerHTML = `
                    <div class="no-data-message">
                        <i class="fas fa-calendar-alt"></i>
                        <h3>Aucun événement disponible</h3>
                        <p>Nous n'avons pas pu récupérer les événements à venir.</p>
                    </div>
                `;
                return;
            }
            
            // Créer le HTML pour chaque événement
            const eventsHTML = this.newsData.events.map(event => {
                const importanceClass = event.importance || 'medium';
                
                return `
                <div class="event-card ${importanceClass}-importance">
                    <div class="event-date">
                        <div class="event-day">${event.date.split('/')[0]}</div>
                        <div class="event-month">${event.date.split('/')[1]}</div>
                    </div>
                    <div class="event-content">
                        <div class="event-title">${event.title}</div>
                        <div class="event-details">
                            <span class="event-time"><i class="fas fa-clock"></i> ${event.time}</span>
                            <span class="event-type ${event.type}">${event.type}</span>
                            <span class="event-importance ${event.importance}"><i class="fas fa-signal"></i> ${event.importance}</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
            
            // Mettre à jour le conteneur des événements
            eventsContainer.innerHTML = eventsHTML;
            
            console.log('✅ Interface des événements mise à jour');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'interface des événements:', error);
            
            // Afficher un message d'erreur
            eventsContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erreur lors de l'affichage des événements</h3>
                    <p>Une erreur s'est produite lors de l'affichage des événements.</p>
                </div>
            `;
        }
    }
    
    /**
     * Met à jour la section des actualités dans l'interface
     */
    updateNewsUI() {
        // Vérifier si nous sommes sur la page des actualités
        const newsGrid = document.querySelector('.news-grid');
        if (!newsGrid) return;
        
        try {
            // Vérifier si nous avons des données d'actualités
            if (!this.newsData || !this.newsData.us || !this.newsData.france || 
                this.newsData.us.length === 0 && this.newsData.france.length === 0) {
                
                // Aucune donnée disponible
                newsGrid.innerHTML = `
                    <div class="no-data-message">
                        <i class="fas fa-newspaper"></i>
                        <h3>Aucune actualité disponible</h3>
                        <p>Nous n'avons pas pu récupérer les dernières actualités. Veuillez réessayer ultérieurement.</p>
                        <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                            <i class="fas fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                `;
                return;
            }
            
            // Fusion des actualités US et françaises
            const allNews = [...this.newsData.us, ...this.newsData.france];
            
            // Tri par date/heure (du plus récent au plus ancien)
            const sortedNews = allNews.sort((a, b) => {
                const dateA = new Date(`${a.date} ${a.time}`);
                const dateB = new Date(`${b.date} ${b.time}`);
                return dateB - dateA;
            });
            
            // Si aucune actualité n'est disponible après le tri
            if (sortedNews.length === 0) {
                newsGrid.innerHTML = `
                    <div class="no-data-message">
                        <i class="fas fa-newspaper"></i>
                        <h3>Aucune actualité disponible</h3>
                        <p>Nous n'avons pas pu récupérer les dernières actualités. Veuillez réessayer ultérieurement.</p>
                        <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                            <i class="fas fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                `;
                return;
            }
            
            // Créer le HTML pour chaque actualité
            const newsHTML = sortedNews.map((news, index) => {
                return `
                <div class="news-card ${index === 0 ? 'major-news' : ''}">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${news.source}</span>
                            <div class="news-date-time">
                                <i class="fas fa-calendar-alt"></i>
                                <span class="news-date">${news.date}</span>
                                <span class="news-time">${news.time}</span>
                            </div>
                        </div>
                        <h3>${news.title}</h3>
                        <p>${news.content}</p>
                    </div>
                </div>
                `;
            }).join('');
            
            // Mettre à jour le conteneur des actualités
            newsGrid.innerHTML = newsHTML;
            
            console.log('✅ Interface des actualités mise à jour');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'interface des actualités:', error);
            
            // Afficher un message d'erreur
            newsGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erreur lors de l'affichage des actualités</h3>
                    <p>Une erreur s'est produite lors de l'affichage des actualités. Veuillez réessayer ultérieurement.</p>
                    <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                        <i class="fas fa-sync-alt"></i> Réessayer
                    </button>
                </div>
            `;
        }
    }
    
    /**
     * Met à jour les sections de portefeuille dans l'interface
     */
    updatePortfoliosUI() {
        // Vérifier si nous sommes sur la page de portefeuille
        const portfolioDetailsAgressif = document.getElementById('aggressiveDetails');
        const portfolioDetailsModere = document.getElementById('moderateDetails');
        const portfolioDetailsStable = document.getElementById('stableDetails');
        
        if (!portfolioDetailsAgressif && !portfolioDetailsModere && !portfolioDetailsStable) return;
        
        try {
            // Mise à jour du portefeuille agressif
            if (portfolioDetailsAgressif && this.portfolios.agressif && this.portfolios.agressif.length > 0) {
                this.updatePortfolioTable(portfolioDetailsAgressif, this.portfolios.agressif);
                if (typeof initAggressiveChart === 'function') {
                    initAggressiveChart();
                }
            } else if (portfolioDetailsAgressif) {
                this.showPortfolioError(portfolioDetailsAgressif);
            }
            
            // Mise à jour du portefeuille modéré
            if (portfolioDetailsModere && this.portfolios.modere && this.portfolios.modere.length > 0) {
                this.updatePortfolioTable(portfolioDetailsModere, this.portfolios.modere);
                if (typeof initModerateChart === 'function') {
                    initModerateChart();
                }
            } else if (portfolioDetailsModere) {
                this.showPortfolioError(portfolioDetailsModere);
            }
            
            // Mise à jour du portefeuille stable
            if (portfolioDetailsStable && this.portfolios.stable && this.portfolios.stable.length > 0) {
                this.updatePortfolioTable(portfolioDetailsStable, this.portfolios.stable);
                if (typeof initStableChart === 'function') {
                    initStableChart();
                }
            } else if (portfolioDetailsStable) {
                this.showPortfolioError(portfolioDetailsStable);
            }
            
            // Mise à jour de l'horodatage des portefeuilles
            const updateTimestamp = document.getElementById('updateTimestamp');
            if (updateTimestamp && this.portfolios.lastUpdated) {
                const date = new Date(this.portfolios.lastUpdated);
                const dateStr = date.toLocaleDateString('fr-FR');
                const timeStr = date.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                updateTimestamp.textContent = `${dateStr} à ${timeStr}`;
            }
            
            // Mise à jour du contexte de marché si présent
            const marketTrendElement = document.getElementById('marketTrend');
            if (marketTrendElement && this.portfolios.marketContext && this.portfolios.marketContext.mainTrend) {
                marketTrendElement.textContent = this.portfolios.marketContext.mainTrend;
                marketTrendElement.className = `market-trend ${this.portfolios.marketContext.mainTrend}`;
            }
            
            console.log('✅ Interface des portefeuilles mise à jour');
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de l\'interface des portefeuilles:', error);
            
            // Afficher message d'erreur pour chaque portefeuille
            if (portfolioDetailsAgressif) this.showPortfolioError(portfolioDetailsAgressif);
            if (portfolioDetailsModere) this.showPortfolioError(portfolioDetailsModere);
            if (portfolioDetailsStable) this.showPortfolioError(portfolioDetailsStable);
        }
    }
    
    /**
     * Affiche un message d'erreur dans un conteneur de portefeuille
     */
    showPortfolioError(container) {
        const tableContainer = container.querySelector('.portfolio-table');
        if (tableContainer) {
            const tableHeader = tableContainer.querySelector('.table-header');
            tableContainer.innerHTML = '';
            if (tableHeader) tableContainer.appendChild(tableHeader);
            
            tableContainer.insertAdjacentHTML('beforeend', `
                <div class="table-row error-row">
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Données non disponibles</h3>
                        <p>Nous n'avons pas pu récupérer les données de ce portefeuille. Veuillez réessayer ultérieurement.</p>
                        <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                            <i class="fas fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                </div>
            `);
        }
    }
    
    /**
     * Met à jour une table de portefeuille spécifique
     * Version améliorée avec support pour différents formats de données
     */
    updatePortfolioTable(container, portfolioData) {
        const tableContainer = container.querySelector('.portfolio-table');
        if (!tableContainer) return;
        
        // Conserver l'en-tête de la table
        const tableHeader = tableContainer.querySelector('.table-header');
        
        // Vérifier si nous avons des données
        if (!portfolioData || portfolioData.length === 0) {
            tableContainer.innerHTML = '';
            if (tableHeader) tableContainer.appendChild(tableHeader);
            
            tableContainer.insertAdjacentHTML('beforeend', `
                <div class="table-row error-row">
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Aucune donnée disponible</h3>
                        <p>Nous n'avons pas pu récupérer les données de ce portefeuille. Veuillez réessayer ultérieurement.</p>
                        <button class="retry-button" onclick="window.perplexityIntegration.loadStaticData()">
                            <i class="fas fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                </div>
            `);
            return;
        }
        
        // Normaliser les données pour gérer différents formats (FR/EN)
        const normalizedData = portfolioData.map(asset => {
            return {
                // Utiliser || pour prendre la première valeur non-undefined
                name: asset.name || asset.nom || "",
                symbol: asset.symbol || asset.symbole || "",
                type: asset.type || "",
                allocation: asset.allocation || 0,
                reason: asset.reason || asset.justification || "",
                // Fournir une valeur par défaut de 0 si change est absent
                change: typeof asset.change !== 'undefined' ? asset.change : 0
            };
        });
        
        // Créer les lignes pour chaque actif avec les données normalisées
        const rowsHTML = normalizedData.map(asset => {
            const changeClass = asset.change >= 0 ? 'positive' : 'negative';
            const changeSymbol = asset.change >= 0 ? '+' : '';
            
            return `
            <div class="table-row">
                <div class="cell instrument-cell">
                    <div class="instrument-name">${asset.name}</div>
                    <div class="instrument-reason">${asset.reason}</div>
                </div>
                <div class="cell">${asset.symbol}</div>
                <div class="cell">
                    <span class="asset-type ${asset.type.toLowerCase()}">${asset.type}</span>
                </div>
                <div class="cell allocation">${asset.allocation}%</div>
                <div class="cell change ${changeClass}">${changeSymbol}${asset.change}%</div>
            </div>
            `;
        }).join('');
        
        // Reconstruire la table avec l'en-tête et les nouvelles lignes
        tableContainer.innerHTML = '';
        tableContainer.appendChild(tableHeader);
        tableContainer.insertAdjacentHTML('beforeend', rowsHTML);
    }
    
    /**
     * Récupère les données d'actualités actuelles
     */
    getNewsData() {
        return this.newsData;
    }
    
    /**
     * Récupère les données de portefeuille actuelles
     */
    getPortfoliosData() {
        return this.portfolios;
    }
}

// Initialisation de l'intégration Perplexity lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Instance globale pour l'accès partout dans l'application
    window.perplexityIntegration = new PerplexityIntegration();
});

// Export pour utilisation dans d'autres modules
export default PerplexityIntegration;