/**
 * aiintegration.js - Intégration de Perplexity AI pour TradePulse
 * Ce script gère les requêtes vers l'API Perplexity pour obtenir 
 * des actualités financières et des recommandations de portefeuille en temps réel.
 */

// Configuration de l'API
const API_CONFIG = {
    // Les endpoints seront configurés par l'environnement serveur
    updatesInterval: 60 * 60 * 1000, // Mise à jour toutes les heures
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
        
        try {
            // Charger les données pour la première fois
            await this.updateData();
            
            // Configurer une mise à jour périodique
            setInterval(() => this.updateData(), API_CONFIG.updatesInterval);
            
            console.log('Intégration Perplexity initialisée avec succès');
        } catch (error) {
            console.error('Erreur lors de l\'initialisation de l\'intégration Perplexity:', error);
        }
    }
    
    /**
     * Met à jour les données depuis Perplexity
     */
    async updateData() {
        console.log('Mise à jour des données depuis Perplexity...');
        
        try {
            // Mettre à jour les actualités
            await this.updateNews();
            
            // Mettre à jour les portefeuilles
            await this.updatePortfolios();
            
            // Mise à jour des affichages sur le site
            this.updateUI();
            
            console.log('Données mises à jour avec succès');
        } catch (error) {
            console.error('Erreur lors de la mise à jour des données:', error);
        }
    }
    
    /**
     * Met à jour les actualités financières depuis Perplexity
     */
    async updateNews() {
        try {
            // Cette fonction sera remplacée par un appel à l'API Perplexity en production
            // Actuellement, nous utilisons des données simulées
            
            // Dans un environnement de production, vous utiliseriez:
            /*
            const response = await fetch('/api/perplexity/news', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: "Donne-moi un résumé des actualités financières du jour concernant les marchés US et français. Format: 3 actualités principales par marché, avec impact potentiel sur les investissements. Sois précis et factuel."
                })
            });
            
            const data = await response.json();
            
            // Traiter la réponse de Perplexity
            const newsContent = data.response;
            
            // Parser le contenu pour extraire les actualités US et françaises
            // Logique de parsing ici
            */
            
            // Simulons des données pour le développement
            const now = new Date();
            const dateStr = now.toLocaleDateString('fr-FR');
            
            this.newsData = {
                us: [
                    {
                        source: "Federal Reserve",
                        date: dateStr,
                        time: "08:30",
                        title: "La Fed annonce un maintien des taux directeurs",
                        content: "La Réserve fédérale américaine maintient ses taux directeurs inchangés, signalant une stabilité de la politique monétaire américaine. Les marchés réagissent positivement à cette décision attendue."
                    },
                    {
                        source: "Markets US",
                        date: dateStr,
                        time: "10:15",
                        title: "Résultats trimestriels supérieurs aux attentes pour le secteur technologique",
                        content: "Les grandes entreprises technologiques américaines ont présenté des résultats trimestriels largement supérieurs aux attentes des analystes, témoignant de la robustesse du secteur malgré l'environnement économique incertain."
                    },
                    {
                        source: "Treasury Department",
                        date: dateStr,
                        time: "14:45",
                        title: "Baisse des rendements obligataires américains",
                        content: "Les rendements des bons du Trésor américain ont diminué suite aux commentaires de la Fed, indiquant une confiance accrue des investisseurs dans la stabilité économique à moyen terme."
                    }
                ],
                france: [
                    {
                        source: "Banque de France",
                        date: dateStr,
                        time: "09:00",
                        title: "Révision à la hausse des prévisions de croissance",
                        content: "La Banque de France a revu à la hausse ses prévisions de croissance pour l'année en cours, citant une reprise plus vigoureuse que prévu dans les secteurs des services et de l'industrie."
                    },
                    {
                        source: "CAC 40",
                        date: dateStr,
                        time: "13:30",
                        title: "Le CAC 40 atteint un nouveau sommet historique",
                        content: "L'indice principal de la Bourse de Paris a franchi un nouveau record, porté par les performances exceptionnelles des valeurs du luxe et de l'aéronautique."
                    },
                    {
                        source: "Ministère de l'Économie",
                        date: dateStr,
                        time: "11:15",
                        title: "Nouvelles mesures fiscales pour soutenir l'innovation",
                        content: "Le gouvernement français annonce un renforcement des incitations fiscales pour les entreprises investissant dans la recherche et développement, visant à stimuler l'innovation et la compétitivité internationale."
                    }
                ],
                lastUpdated: now.toISOString()
            };
            
            console.log('Actualités mises à jour');
            return this.newsData;
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour des actualités:', error);
            throw error;
        }
    }
    
    /**
     * Met à jour les recommandations de portefeuille depuis Perplexity
     */
    async updatePortfolios() {
        try {
            // Cette fonction sera remplacée par un appel à l'API Perplexity en production
            // Actuellement, nous utilisons des données simulées
            
            // Dans un environnement de production, vous utiliseriez:
            /*
            const response = await fetch('/api/perplexity/portfolios', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: "En te basant sur les actualités financières récentes et le contexte économique global, génère 3 portefeuilles d'investissement (agressif, modéré et stable) avec 10-15 actifs chacun incluant stocks, ETF, crypto, bonds. Pour chaque actif, fournis: Nom complet, Symbole/ticker, Type d'actif, Pourcentage d'allocation (total 100%), Justification basée sur les actualités récentes. Format JSON structuré."
                })
            });
            
            const data = await response.json();
            
            // Traiter la réponse de Perplexity
            const portfoliosContent = data.response;
            
            // Parser le contenu JSON pour extraire les portefeuilles
            // Logique de parsing ici
            */
            
            // Simulons des données pour le développement
            const now = new Date();
            
            this.portfolios = {
                agressif: [
                    {
                        name: "NVIDIA Corporation",
                        symbol: "NVDA",
                        type: "STOCK",
                        allocation: 25,
                        reason: "Leader incontesté des puces IA avec un nouveau record historique selon les actualités du jour, bénéficiant directement de la demande croissante pour l'IA."
                    },
                    {
                        name: "Tesla, Inc.",
                        symbol: "TSLA",
                        type: "STOCK",
                        allocation: 22,
                        reason: "L'augmentation de production dans la gigafactory de Berlin annoncée cette semaine crée une opportunité immédiate dans un secteur haussier."
                    },
                    {
                        name: "Amazon.com, Inc.",
                        symbol: "AMZN",
                        type: "STOCK",
                        allocation: 18,
                        reason: "Sa nouvelle stratégie logistique annoncée cette semaine promet d'améliorer ses performances à court terme."
                    },
                    {
                        name: "Invesco QQQ Trust",
                        symbol: "QQQ",
                        type: "ETF",
                        allocation: 10,
                        reason: "Exposition aux grandes entreprises technologiques qui bénéficient de la tendance haussière actuelle du secteur tech."
                    },
                    {
                        name: "iShares Global Clean Energy ETF",
                        symbol: "ICLN",
                        type: "ETF",
                        allocation: 8,
                        reason: "Profite des initiatives de transition énergétique mentionnées dans les actualités récentes."
                    },
                    {
                        name: "Bitcoin",
                        symbol: "BTC",
                        type: "CRYPTO",
                        allocation: 12,
                        reason: "Le rebond significatif suite aux commentaires de la SEC cette semaine crée une opportunité tactique à court terme."
                    },
                    {
                        name: "Ethereum",
                        symbol: "ETH",
                        type: "CRYPTO",
                        allocation: 5,
                        reason: "Bénéficie actuellement du développement des applications décentralisées et suit la tendance haussière récente du Bitcoin."
                    }
                ],
                modere: [
                    {
                        name: "Microsoft Corporation",
                        symbol: "MSFT",
                        type: "STOCK",
                        allocation: 15,
                        reason: "Position dominante dans le cloud et l'IA, profitant de la tendance haussière du secteur technologique avec un profil de risque modéré."
                    },
                    {
                        name: "Amazon.com, Inc.",
                        symbol: "AMZN",
                        type: "STOCK",
                        allocation: 12,
                        reason: "Sa nouvelle stratégie logistique dévoilée cette semaine et sa diversification sectorielle offrent un bon équilibre risque/rendement."
                    },
                    {
                        name: "SPDR S&P 500 ETF Trust",
                        symbol: "SPY",
                        type: "ETF",
                        allocation: 20,
                        reason: "Diversification large sur le marché américain pour réduire la volatilité globale du portefeuille."
                    },
                    {
                        name: "Invesco QQQ Trust",
                        symbol: "QQQ",
                        type: "ETF",
                        allocation: 15,
                        reason: "Exposition contrôlée au secteur technologique pour capturer la croissance sans risque excessif."
                    },
                    {
                        name: "iShares 20+ Year Treasury Bond ETF",
                        symbol: "TLT",
                        type: "BOND",
                        allocation: 15,
                        reason: "Protection contre la volatilité des marchés actions dans un contexte d'incertitude économique."
                    },
                    {
                        name: "NVIDIA Corporation",
                        symbol: "NVDA",
                        type: "STOCK",
                        allocation: 10,
                        reason: "Exposition limitée au leader des puces IA pour bénéficier de la croissance sans surpondération."
                    },
                    {
                        name: "iShares iBoxx $ Investment Grade Corporate Bond ETF",
                        symbol: "LQD",
                        type: "BOND",
                        allocation: 8,
                        reason: "Rendements supérieurs aux bons du Trésor avec un risque modéré."
                    },
                    {
                        name: "Bitcoin",
                        symbol: "BTC",
                        type: "CRYPTO",
                        allocation: 5,
                        reason: "Exposition limitée pour diversification, suite aux commentaires positifs de la SEC cette semaine."
                    }
                ],
                stable: [
                    {
                        name: "Vanguard Total Bond Market ETF",
                        symbol: "BND",
                        type: "BOND",
                        allocation: 25,
                        reason: "Large diversification obligataire offrant stabilité et préservation du capital dans le contexte actuel."
                    },
                    {
                        name: "Johnson & Johnson",
                        symbol: "JNJ",
                        type: "STOCK",
                        allocation: 15,
                        reason: "Valeur défensive peu corrélée aux turbulences du marché, offrant stabilité et dividendes dans un contexte d'incertitude."
                    },
                    {
                        name: "Microsoft Corporation",
                        symbol: "MSFT",
                        type: "STOCK",
                        allocation: 10,
                        reason: "Entreprise à forte capitalisation avec solides fondamentaux et flux de trésorerie stable, offrant à la fois sécurité et croissance modérée."
                    },
                    {
                        name: "SPDR S&P 500 ETF Trust",
                        symbol: "SPY",
                        type: "ETF",
                        allocation: 15,
                        reason: "Exposition large au marché avec une volatilité moindre que les secteurs individuels."
                    },
                    {
                        name: "iShares 20+ Year Treasury Bond ETF",
                        symbol: "TLT",
                        type: "BOND",
                        allocation: 20,
                        reason: "Protection maximale contre l'incertitude des marchés, particulièrement utile suite aux annonces récentes de la BCE."
                    },
                    {
                        name: "iShares iBoxx $ Investment Grade Corporate Bond ETF",
                        symbol: "LQD",
                        type: "BOND",
                        allocation: 15,
                        reason: "Rendement prévisible avec risque limité grâce aux obligations d'entreprises de qualité."
                    }
                ],
                lastUpdated: now.toISOString()
            };
            
            console.log('Portefeuilles mis à jour');
            return this.portfolios;
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour des portefeuilles:', error);
            throw error;
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
            // Fusion des actualités US et françaises
            const allNews = [...this.newsData.us, ...this.newsData.france];
            
            // Tri par date/heure (du plus récent au plus ancien)
            const sortedNews = allNews.sort((a, b) => {
                const dateA = new Date(`${a.date} ${a.time}`);
                const dateB = new Date(`${b.date} ${b.time}`);
                return dateB - dateA;
            });
            
            // Sélectionner les 3 actualités les plus récentes
            const recentNews = sortedNews.slice(0, 3);
            
            // Créer le HTML pour chaque actualité
            const newsHTML = recentNews.map((news, index) => {
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
            
            console.log('Interface des actualités mise à jour');
        } catch (error) {
            console.error('Erreur lors de la mise à jour de l\'interface des actualités:', error);
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
            if (portfolioDetailsAgressif) {
                this.updatePortfolioTable(portfolioDetailsAgressif, this.portfolios.agressif);
                if (typeof initAggressiveChart === 'function') {
                    initAggressiveChart();
                }
            }
            
            // Mise à jour du portefeuille modéré
            if (portfolioDetailsModere) {
                this.updatePortfolioTable(portfolioDetailsModere, this.portfolios.modere);
                if (typeof initModerateChart === 'function') {
                    initModerateChart();
                }
            }
            
            // Mise à jour du portefeuille stable
            if (portfolioDetailsStable) {
                this.updatePortfolioTable(portfolioDetailsStable, this.portfolios.stable);
                if (typeof initStableChart === 'function') {
                    initStableChart();
                }
            }
            
            // Mise à jour de l'horodatage des portefeuilles
            const updateTimestamp = document.getElementById('updateTimestamp');
            if (updateTimestamp) {
                const date = new Date(this.portfolios.lastUpdated);
                const dateStr = date.toLocaleDateString('fr-FR');
                const timeStr = date.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                updateTimestamp.textContent = `${dateStr} à ${timeStr}`;
            }
            
            console.log('Interface des portefeuilles mise à jour');
        } catch (error) {
            console.error('Erreur lors de la mise à jour de l\'interface des portefeuilles:', error);
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
