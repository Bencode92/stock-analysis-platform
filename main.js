/**
 * TradePulse - Application d'analyse financière en temps réel
 * 
 * Ce fichier est le point d'entrée principal de l'application,
 * il coordonne les différents services et affiche les données.
 */

import { optimizedGetNews, optimizedGetSectors } from './services/perplexity-service.js';
import { optimizedGeneratePortfolio, getFallbackPortfolio } from './services/openai-service.js';
import { clearCache } from './utils/cache-system.js';
import { handleError, ErrorTypes } from './utils/error-handler.js';

// Initialiser l'application quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
    // Éléments DOM
    const marketIndicator = document.querySelector('.market-indicator');
    const marketStatusText = document.querySelector('.market-status span');
    const marketTimeElement = document.querySelector('.market-time');
    const updateTimeElement = document.querySelector('.update-time');
    const bullishSectorsContainer = document.getElementById('bullishSectors');
    const bearishSectorsContainer = document.getElementById('bearishSectors');
    const portfolioTableBody = document.getElementById('portfolioTableBody');
    const portfolioChartCanvas = document.getElementById('portfolioChart');
    const newsGrid = document.querySelector('.news-grid');
    
    // Variables globales
    let portfolioChart = null;
    let sectorData = {};
    let portfolioData = [];
    let newsData = [];
    let lastDataUpdate = null;
    
    // Initialisation
    function init() {
        console.log("Initialisation de TradePulse...");
        
        // Mettre à jour l'heure du marché
        updateMarketTime();
        
        // Ajouter le bouton de rafraîchissement global dans le header
        createHeaderRefreshButton();
        
        // Initialiser le graphique du portefeuille
        initPortfolioChart();
        
        // Récupérer les données initiales
        fetchAllFinancialData();
        
        // Configurer les écouteurs d'événements
        setupEventListeners();
        
        // Mettre à jour régulièrement l'heure
        setInterval(updateMarketTime, 1000);
        
        console.log("Initialisation terminée");
    }
    
    // Ajouter un bouton de rafraîchissement dans le header
    function createHeaderRefreshButton() {
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
            handleGlobalRefresh(this);
        });
        
        console.log("Bouton de rafraîchissement ajouté au header");
    }
    
    // Gestionnaire pour le bouton de rafraîchissement global
    function handleGlobalRefresh(button) {
        if (!button) return;
        
        console.log("Rafraîchissement global demandé");
        
        // Ajouter un effet visuel pendant le chargement
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-sync-alt refresh-spinning"></i> Mise à jour en cours...';
        button.disabled = true;
        button.classList.add('refreshing');
        
        // Vider le cache pour forcer une mise à jour fraîche
        clearCache();
        
        // Rafraîchir toutes les données
        fetchAllFinancialData()
            .then(() => {
                // Restaurer l'apparence du bouton
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = false;
                    button.classList.remove('refreshing');
                    
                    // Afficher un message de confirmation
                    showNotification('Données mises à jour avec succès', 'success');
                }, 500);
            })
            .catch((error) => {
                console.error('Erreur lors de la mise à jour globale:', error);
                
                // Restaurer l'apparence du bouton
                button.innerHTML = '<i class="fas fa-sync-alt"></i> Réessayer';
                button.disabled = false;
                button.classList.remove('refreshing');
                
                // Afficher un message d'erreur
                showNotification('Erreur lors de la mise à jour des données', 'error');
            });
    }
    
    // Affiche une notification
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
    
    // Récupérer toutes les données financières
    async function fetchAllFinancialData() {
        console.log("Récupération de toutes les données financières...");
        
        // Afficher des indicateurs de chargement dans toutes les sections
        displayLoadingState();
        
        try {
            // Étape 1: Récupérer les actualités
            const newsResponse = await optimizedGetNews();
            if (!newsResponse || !newsResponse.news) {
                throw new Error("Réponse d'actualités invalide");
            }
            
            // Filtrer pour ne garder que les actualités les plus importantes
            newsData = filterImportantNews(newsResponse.news);
            console.log(`${newsData.length} actualités récupérées et filtrées`);
            
            // Mettre à jour l'affichage des actualités
            updateNewsDisplay(newsData);
            
            // Étape 2: Obtenir les analyses sectorielles
            const sectorsResponse = await optimizedGetSectors();
            if (!sectorsResponse || !sectorsResponse.bullish || !sectorsResponse.bearish) {
                throw new Error("Réponse d'analyse sectorielle invalide");
            }
            
            sectorData = sectorsResponse;
            console.log(`Analyses sectorielles récupérées: ${sectorData.bullish.length} secteurs haussiers, ${sectorData.bearish.length} secteurs baissiers`);
            
            // Mettre à jour l'affichage des secteurs
            updateSectorsDisplay(sectorData);
            
            // Étape 3: Générer un portefeuille optimisé avec OpenAI
            try {
                console.log("Génération du portefeuille avec OpenAI...");
                
                // Appel à OpenAI avec les actualités et secteurs
                const openAIPortfolio = await optimizedGeneratePortfolio(newsData, sectorData);
                
                if (openAIPortfolio && openAIPortfolio.length > 0) {
                    portfolioData = openAIPortfolio;
                    console.log(`Portefeuille généré avec ${portfolioData.length} actifs`);
                    
                    // Mettre à jour l'affichage avec le portefeuille généré par OpenAI
                    updatePortfolioDisplay(portfolioData);
                    
                    // Afficher un tag indiquant que c'est généré par OpenAI
                    const portfolioTitle = document.querySelector('.portfolio-section h2');
                    if (portfolioTitle) {
                        portfolioTitle.innerHTML = '<i class="fas fa-briefcase"></i> Portefeuille généré par OpenAI (Temps réel)';
                    }
                } else {
                    throw new Error("Format de portefeuille OpenAI invalide");
                }
                
            } catch (aiError) {
                await handleError(aiError, 'portfolio', async () => {
                    console.warn("Utilisation du portefeuille de fallback suite à une erreur OpenAI");
                    
                    // Obtenir le portefeuille de fallback
                    portfolioData = await getFallbackPortfolio();
                    updatePortfolioDisplay(portfolioData);
                    
                    // Indiquer que c'est un portefeuille de secours
                    const portfolioTitle = document.querySelector('.portfolio-section h2');
                    if (portfolioTitle) {
                        portfolioTitle.innerHTML = '<i class="fas fa-briefcase"></i> Portefeuille recommandé (Mode hors ligne)';
                    }
                });
            }
            
            // Mettre à jour la date de dernière actualisation
            lastDataUpdate = new Date();
            updateLastUpdateTime();
            
            console.log("Toutes les données ont été mises à jour avec succès");
            
        } catch (error) {
            await handleError(error, 'data_fetching', () => {
                console.error("Erreur critique lors de la récupération des données:", error);
                displayErrorState();
                showNotification("Impossible de récupérer les données. Veuillez réessayer.", "error");
            });
        }
    }
    
    // Fonction pour filtrer les actualités les plus importantes
    function filterImportantNews(allNews) {
        // Critères pour déterminer l'importance d'une actualité:
        // 1. Score d'impact (calculé par Perplexity)
        // 2. Sources fiables (Bloomberg, Reuters, etc.)
        // 3. Fraîcheur (les plus récentes de la journée)
        // 4. Mentions de mots-clés importants (taux, BCE, Fed, marché, etc.)
        
        // Trier les actualités par score d'importance
        const scoredNews = allNews.map(news => {
            let score = 0;
            
            // Score basé sur la source
            const premiumSources = ['Bloomberg', 'Reuters', 'Financial Times', 'Wall Street Journal', 'CNBC'];
            if (premiumSources.some(source => news.source.includes(source))) {
                score += 30;
            }
            
            // Score basé sur les mots-clés dans le titre
            const keywordScores = {
                'BCE': 20, 'Fed': 20, 'taux': 15, 'inflation': 15, 'récession': 15,
                'croissance': 10, 'PIB': 10, 'chômage': 10, 'pétrole': 8, 'or': 8,
                'crypto': 7, 'bitcoin': 7, 'euro': 7, 'dollar': 7
            };
            
            Object.entries(keywordScores).forEach(([keyword, value]) => {
                const pattern = new RegExp(keyword, 'i');
                if (pattern.test(news.title) || pattern.test(news.summary)) {
                    score += value;
                }
            });
            
            // Score basé sur la fraîcheur (de la journée)
            const newsTime = new Date(news.timestamp);
            const now = new Date();
            const isToday = newsTime.toDateString() === now.toDateString();
            const hoursAgo = (now - newsTime) / (1000 * 60 * 60);
            
            if (isToday) {
                if (hoursAgo < 1) score += 25;
                else if (hoursAgo < 3) score += 20;
                else if (hoursAgo < 6) score += 15;
                else if (hoursAgo < 12) score += 10;
                else score += 5;
            } else {
                // Pénalité légère pour les actualités qui ne sont pas d'aujourd'hui
                score -= 10;
            }
            
            // Score d'impact de Perplexity
            score += news.impact || 0;
            
            return { ...news, score };
        });
        
        // Trier par score décroissant et ne garder que les 5 premières actualités
        return scoredNews.sort((a, b) => b.score - a.score).slice(0, 5);
    }
    
    // Afficher l'état de chargement dans toutes les sections
    function displayLoadingState() {
        // Chargement des actualités
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="loading-news">
                    <div class="spinner"></div>
                    <p>Récupération des dernières actualités importantes...</p>
                </div>
            `;
        }
        
        // Chargement des secteurs
        if (bullishSectorsContainer) {
            bullishSectorsContainer.innerHTML = `
                <div class="sector-loading">
                    <div class="spinner"></div>
                    <p>Analyse des secteurs en cours...</p>
                </div>
            `;
        }
        
        if (bearishSectorsContainer) {
            bearishSectorsContainer.innerHTML = `
                <div class="sector-loading">
                    <div class="spinner"></div>
                    <p>Analyse des secteurs en cours...</p>
                </div>
            `;
        }
        
        // Chargement du portefeuille
        if (portfolioTableBody) {
            portfolioTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="portfolio-loading">
                        <div class="spinner"></div>
                        <p>Génération d'un portefeuille optimisé en temps réel avec OpenAI...</p>
                    </td>
                </tr>
            `;
        }
    }
    
    // Afficher l'état d'erreur dans toutes les sections
    function displayErrorState() {
        // Erreur des actualités
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="news-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Impossible de récupérer les actualités. Veuillez réessayer.</p>
                </div>
            `;
        }
        
        // Erreur des secteurs
        if (bullishSectorsContainer) {
            bullishSectorsContainer.innerHTML = `
                <div class="sector-empty">
                    Erreur lors de l'analyse des secteurs haussiers. Veuillez réessayer.
                </div>
            `;
        }
        
        if (bearishSectorsContainer) {
            bearishSectorsContainer.innerHTML = `
                <div class="sector-empty">
                    Erreur lors de l'analyse des secteurs baissiers. Veuillez réessayer.
                </div>
            `;
        }
        
        // Erreur du portefeuille
        if (portfolioTableBody) {
            portfolioTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="portfolio-empty">
                        Erreur lors de la génération du portefeuille. Veuillez réessayer.
                    </td>
                </tr>
            `;
        }
    }
    
    // Fonction pour mettre à jour l'affichage des actualités
    function updateNewsDisplay(newsItems) {
        if (!newsGrid) return;
        
        let newsHTML = '';
        
        // L'actualité la plus importante sera mise en évidence
        const [topNews, ...otherNews] = newsItems;
        
        if (topNews) {
            newsHTML += `
                <div class="news-card major-news">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${topNews.source}
                                <span class="news-badge important">Majeur</span>
                            </span>
                            <span class="news-time">${formatNewsTime(topNews.timestamp)}</span>
                        </div>
                        <h3>${topNews.title}</h3>
                        <p>${topNews.summary}</p>
                        <div class="news-impact">
                            <span class="impact-label">Impact: ${topNews.sentiment === 'positive' ? 'Positif' : 'Négatif'}</span>
                            <div class="impact-meter">
                                <div class="impact-level ${topNews.sentiment === 'positive' ? 'positive' : 'negative'}" 
                                     style="width: ${(topNews.impact / 50) * 100}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Afficher les autres actualités importantes
        otherNews.forEach(news => {
            newsHTML += `
                <div class="news-card">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-source">${news.source}</span>
                            <span class="news-time">${formatNewsTime(news.timestamp)}</span>
                        </div>
                        <h3>${news.title}</h3>
                        <p>${news.summary}</p>
                        <div class="news-impact">
                            <span class="impact-label">Impact: ${news.sentiment === 'positive' ? 'Positif' : 'Négatif'}</span>
                            <div class="impact-meter">
                                <div class="impact-level ${news.sentiment === 'positive' ? 'positive' : 'negative'}" 
                                     style="width: ${(news.impact / 50) * 100}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        newsGrid.innerHTML = newsHTML;
    }
    
    // Mise à jour de l'affichage des secteurs
    function updateSectorsDisplay(sectors) {
        if (!bullishSectorsContainer || !bearishSectorsContainer) return;
        
        // Construire le HTML pour les secteurs haussiers
        let bullishHTML = '';
        if (sectors.bullish && sectors.bullish.length > 0) {
            sectors.bullish.forEach(sector => {
                bullishHTML += `
                    <div class="sector-item">
                        <div class="sector-name">${sector.name} <i class="fas fa-arrow-up"></i></div>
                        <div class="sector-reason">${sector.reason}</div>
                    </div>
                `;
            });
        } else {
            bullishHTML = `
                <div class="sector-empty">Aucun secteur haussier identifié aujourd'hui</div>
            `;
        }
        
        // Construire le HTML pour les secteurs baissiers
        let bearishHTML = '';
        if (sectors.bearish && sectors.bearish.length > 0) {
            sectors.bearish.forEach(sector => {
                bearishHTML += `
                    <div class="sector-item">
                        <div class="sector-name">${sector.name} <i class="fas fa-arrow-down"></i></div>
                        <div class="sector-reason">${sector.reason}</div>
                    </div>
                `;
            });
        } else {
            bearishHTML = `
                <div class="sector-empty">Aucun secteur baissier identifié aujourd'hui</div>
            `;
        }
        
        // Mise à jour des conteneurs
        bullishSectorsContainer.innerHTML = bullishHTML;
        bearishSectorsContainer.innerHTML = bearishHTML;
        
        // Réattacher les écouteurs d'événements
        document.querySelectorAll('.sector-item').forEach(item => {
            item.addEventListener('click', function() {
                highlightSector(this);
            });
        });
    }
    
    // Mise à jour de l'affichage du portefeuille
    function updatePortfolioDisplay(portfolio) {
        if (!portfolioTableBody || !portfolioChart) return;
        
        // Construire le HTML pour le tableau du portefeuille
        let tableHTML = '';
        if (Array.isArray(portfolio) && portfolio.length > 0) {
            portfolio.forEach(asset => {
                tableHTML += `
                    <tr class="portfolio-asset" data-symbol="${asset.symbol}">
                        <td>${asset.name} (${asset.symbol})</td>
                        <td><span class="asset-type ${asset.type}">${asset.type.toUpperCase()}</span></td>
                        <td class="allocation">${asset.allocation}%</td>
                        <td class="rationale">${asset.reason || 'Recommandé selon l\'analyse de marché actuelle'}</td>
                    </tr>
                `;
            });
        } else {
            tableHTML = `
                <tr>
                    <td colspan="4" class="portfolio-empty">Aucune recommandation disponible pour le moment.</td>
                </tr>
            `;
        }
        
        // Mise à jour du tableau
        portfolioTableBody.innerHTML = tableHTML;
        
        // Réattacher les écouteurs d'événements
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.addEventListener('click', function() {
                highlightAsset(this);
            });
        });
        
        // Mise à jour du graphique en camembert
        updatePortfolioChart(portfolio);
    }
    
    // Mise à jour du graphique du portefeuille
    function updatePortfolioChart(portfolio) {
        if (!portfolioChart || !Array.isArray(portfolio) || portfolio.length === 0) return;
        
        // Regrouper par type d'actif
        const stocksTotal = portfolio
            .filter(asset => asset.type === 'stock')
            .reduce((sum, asset) => sum + asset.allocation, 0);
            
        const etfTotal = portfolio
            .filter(asset => asset.type === 'etf')
            .reduce((sum, asset) => sum + asset.allocation, 0);
            
        const cryptoTotal = portfolio
            .filter(asset => asset.type === 'crypto')
            .reduce((sum, asset) => sum + asset.allocation, 0);
        
        // Mettre à jour les données du graphique
        portfolioChart.data.datasets[0].data = [stocksTotal, etfTotal, cryptoTotal];
        portfolioChart.update();
    }
    
    // Formater l'heure des actualités
    function formatNewsTime(timestamp) {
        const newsDate = new Date(timestamp);
        const now = new Date();
        const diffMs = now - newsDate;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        
        if (diffMinutes < 60) {
            return `Il y a ${diffMinutes} min${diffMinutes > 1 ? 's' : ''}`;
        } else {
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24) {
                return `Il y a ${diffHours} h${diffHours > 1 ? '' : ''}`;
            } else {
                return newsDate.toLocaleDateString('fr-FR');
            }
        }
    }
    
    // Initialiser le graphique du portefeuille
    function initPortfolioChart() {
        if (!portfolioChartCanvas) return;
        
        // Préparer les données pour le graphique
        const stocksTotal = 45; // Valeurs de démo initiales
        const etfTotal = 30;
        const cryptoTotal = 25;
        
        // Configuration du graphique
        const data = {
            labels: ['Actions', 'ETF', 'Crypto'],
            datasets: [{
                data: [stocksTotal, etfTotal, cryptoTotal],
                backgroundColor: [
                    '#1E90FF', // Bleu électrique pour les actions
                    '#00BFFF', // Bleu ciel profond pour les ETF
                    '#87CEFA'  // Bleu ciel clair pour les crypto
                ],
                borderWidth: 0
            }]
        };
        
        // Options du graphique
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#e0e0e0',
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map(function(label, i) {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    
                                    return {
                                        text: `${label} (${data.datasets[0].data[i]}%)`,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: '#000000',
                                        lineWidth: 0,
                                        hidden: isNaN(data.datasets[0].data[i]) || meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value}%`;
                        }
                    }
                }
            }
        };
        
        // Créer le graphique
        portfolioChart = new Chart(portfolioChartCanvas, {
            type: 'pie',
            data: data,
            options: options
        });
    }
    
    // Configurer les écouteurs d'événements
    function setupEventListeners() {
        // Interaction avec les éléments du portefeuille
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.addEventListener('click', function() {
                highlightAsset(this);
            });
        });
        
        // Interaction avec les secteurs
        document.querySelectorAll('.sector-item').forEach(item => {
            item.addEventListener('click', function() {
                highlightSector(this);
            });
        });
    }
    
    // Mettre en évidence un actif du portefeuille lorsque cliqué
    function highlightAsset(element) {
        // Retirer la mise en évidence des autres éléments
        document.querySelectorAll('.portfolio-asset').forEach(row => {
            row.style.backgroundColor = '';
        });
        
        // Appliquer la mise en évidence
        element.style.backgroundColor = 'rgba(30, 144, 255, 0.15)';
        
        // Faire défiler pour centrer l'élément si nécessaire
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Mettre en évidence un secteur lorsque cliqué
    function highlightSector(element) {
        // Retirer la mise en évidence des autres éléments
        document.querySelectorAll('.sector-item').forEach(item => {
            item.style.backgroundColor = '';
            item.style.padding = '';
            item.style.borderRadius = '';
            item.style.margin = '';
        });
        
        // Appliquer la mise en évidence
        element.style.backgroundColor = 'rgba(30, 144, 255, 0.15)';
        element.style.padding = '0.5rem';
        element.style.borderRadius = '4px';
        element.style.margin = '-0.5rem';
        
        // Faire défiler pour centrer l'élément si nécessaire
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Mettre à jour l'heure de dernière mise à jour
    function updateLastUpdateTime() {
        if (updateTimeElement) {
            const now = new Date();
            const formattedDateTime = formatDateTime(now);
            updateTimeElement.textContent = formattedDateTime;
        }
    }
    
    // Formater la date et l'heure
    function formatDateTime(date) {
        return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    // Mettre à jour l'heure et le statut du marché
    function updateMarketTime() {
        const now = new Date();
        
        // Format de l'heure : HH:MM:SS
        const timeStr = now.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Mettre à jour l'heure
        if (marketTimeElement) {
            marketTimeElement.textContent = timeStr;
        }
        
        // Vérifier si le marché est ouvert (9h à 17h30, du lundi au vendredi)
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayOfWeek = now.getDay(); // 0 = dimanche, 6 = samedi
        
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isBeforeOpen = hour < 9;
        const isAfterClose = hour > 17 || (hour === 17 && minute >= 30);
        
        const isMarketOpen = !isWeekend && !isBeforeOpen && !isAfterClose;
        
        // Mettre à jour l'indicateur et le texte
        if (marketIndicator && marketStatusText) {
            if (isMarketOpen) {
                marketIndicator.classList.remove('red');
                marketIndicator.classList.add('green');
                marketStatusText.textContent = 'Marché ouvert';
            } else {
                marketIndicator.classList.remove('green');
                marketIndicator.classList.add('red');
                marketStatusText.textContent = 'Marché fermé';
            }
        }
    }
    
    // Démarrer l'application
    init();
});
