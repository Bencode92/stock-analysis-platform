/**
 * aiintegration.js - Intégration de Perplexity AI pour TradePulse
 * Ce script gère les requêtes vers l'API Perplexity pour obtenir 
 * des actualités financières et des recommandations de portefeuille en temps réel.
 */

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
    }
};

// Classe principale pour l'intégration de Perplexity
class PerplexityIntegration {
    constructor() {
        this.newsData = {
            us: [],
            france: [],
            lastUpdated: null
        };
        
        this.portfolios = {
            agressif: [],
            modere: [],
            stable: [],
            lastUpdated: null
        };
        
        // Initialisation des données
        this.init();
    }
    
    /**
     * Initialise l'intégration avec Perplexity
     */
    async init() {
        console.log('Initialisation de l\'intégration Perplexity...');
        console.log('URL de l\'API:', API_CONFIG.baseUrl);
        console.log('Mode Sonar:', API_CONFIG.useSonar ? 'Activé' : 'Désactivé');
        
        try {
            // Vérifier si l'API est accessible avec retry
            await this.fetchWithRetry(`${API_CONFIG.baseUrl}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, true);
            
            console.log('✅ API accessible');
            
            // Charger les données pour la première fois
            await this.updateData();
            
            // Configurer une mise à jour périodique
            setInterval(() => this.updateData(), API_CONFIG.updatesInterval);
            
            console.log('✅ Intégration Perplexity initialisée avec succès');
        } catch (error) {
            console.error('❌ API inaccessible:', error.message);
            console.log('⚠️ Tentative de réveil du service Render...');
            
            // Deuxième tentative après un délai pour laisser le temps au service de se réveiller
            setTimeout(async () => {
                try {
                    await this.fetchWithRetry(`${API_CONFIG.baseUrl}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }, true);
                    console.log('✅ API accessible après réveil');
                    await this.updateData();
                } catch (secondError) {
                    console.error('❌ API toujours inaccessible après tentative de réveil:', secondError.message);
                    // Plus de fallback data, on affiche juste un message d'erreur dans l'UI
                    this.handleApiError();
                }
            }, 5000); // 5 secondes de délai pour laisser le temps au service de se réveiller
        }
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
                    <button class="retry-button" onclick="window.perplexityIntegration.updateNews()">
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
                                <button class="retry-button" onclick="window.perplexityIntegration.updatePortfolios()">
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
     * Met à jour les données depuis Perplexity
     */
    async updateData() {
        console.log('🔄 Mise à jour des données depuis Perplexity...');
        
        try {
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
            this.handleApiError();
            throw error;
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
            
            // Afficher message d'erreur dans l'UI
            const newsGrid = document.querySelector('.news-grid');
            if (newsGrid) {
                newsGrid.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Impossible de charger les actualités</h3>
                        <p>Nous rencontrons un problème de connexion avec notre service. Veuillez réessayer ultérieurement.</p>
                        <button class="retry-button" onclick="window.perplexityIntegration.updateNews()">
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
                                    <button class="retry-button" onclick="window.perplexityIntegration.updatePortfolios()">
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
        // Si Sonar est activé, rediriger vers searchWithSonar
        if (API_CONFIG.useSonar) {
            return this.searchWithSonar(query);
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
                        <button class="retry-button" onclick="window.perplexityIntegration.updateNews()">
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
                        <button class="retry-button" onclick="window.perplexityIntegration.updateNews()">
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
                    <button class="retry-button" onclick="window.perplexityIntegration.updateNews()">
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
                        <button class="retry-button" onclick="window.perplexityIntegration.updatePortfolios()">
                            <i class="fas fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                </div>
            `);
        }
    }
    
    /**
     * Met à jour une table de portefeuille spécifique
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
                        <button class="retry-button" onclick="window.perplexityIntegration.updatePortfolios()">
                            <i class="fas fa-sync-alt"></i> Actualiser
                        </button>
                    </div>
                </div>
            `);
            return;
        }
        
        // Créer les lignes pour chaque actif
        const rowsHTML = portfolioData.map(asset => {
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