/**
 * boursorama-scraper.js - Module de scraping pour indices boursiers
 * Intégration directe dans TradePulse avec mise à jour toutes les 15 minutes
 */

// Configuration globale
const SCRAPER_CONFIG = {
    // URL de Boursorama pour les indices internationaux
    sourceUrl: 'https://www.boursorama.com/bourse/indices/internationaux',
    
    // Proxy CORS pour contourner les restrictions
    corsProxy: 'https://corsproxy.io/?',
    
    // Intervalle de mise à jour (15 minutes en ms)
    updateInterval: 15 * 60 * 1000,
    
    // Structure des régions pour la classification des indices
    regions: {
        europe: [
            'CAC', 'DAX', 'FTSE', 'IBEX', 'MIB', 'AEX', 'BEL', 'SMI', 'ATX', 
            'OMX', 'OMXS', 'ISEQ', 'PSI', 'ATHEX', 'OSEBX', 'STOXX', 'EURO'
        ],
        us: [
            'DOW', 'S&P', 'NASDAQ', 'RUSSELL', 'CBOE', 'NYSE', 'AMEX'
        ],
        asia: [
            'NIKKEI', 'HANG SENG', 'SHANGHAI', 'SHENZHEN', 'KOSPI', 'SENSEX', 
            'BSE', 'TAIEX', 'STRAITS', 'JAKARTA', 'KLSE', 'KOSDAQ', 'ASX'
        ],
        other: [
            'MERVAL', 'BOVESPA', 'IPC', 'IPSA', 'COLCAP', 'BVLG', 'IBC', 'CASE', 
            'ISE', 'TA', 'QE', 'FTSE/JSE', 'MOEX', 'MSX30'
        ]
    }
};

/**
 * Classe principale pour le scraping et l'affichage des données
 */
class BoursoramaScraper {
    constructor() {
        // Stockage des données
        this.data = {
            indices: {
                europe: [],
                us: [],
                asia: [],
                other: []
            },
            meta: {
                source: 'Boursorama',
                url: SCRAPER_CONFIG.sourceUrl,
                timestamp: null,
                count: 0,
                isStale: false // Indique si les données ne sont pas fraîches
            }
        };
        
        // État du scraper
        this.isLoading = false;
        this.lastUpdate = null;
        this.updateTimer = null;
        this.fetchSuccess = false; // Indique si la dernière requête a réussi
        
        // Éléments DOM
        this.elements = {
            loading: document.getElementById('indices-loading'),
            error: document.getElementById('indices-error'),
            container: document.getElementById('indices-container'),
            lastUpdate: document.getElementById('last-update-time'),
            refreshButton: document.getElementById('refresh-data'),
            retryButton: document.getElementById('retry-button')
        };
        
        // Initialisation
        this.init();
    }
    
    /**
     * Initialise le scraper
     */
    init() {
        console.log('🔄 Initialisation du scraper Boursorama...');
        
        // Configurer les gestionnaires d'événements
        if (this.elements.refreshButton) {
            this.elements.refreshButton.addEventListener('click', () => this.refresh(true));
        }
        
        if (this.elements.retryButton) {
            this.elements.retryButton.addEventListener('click', () => this.refresh(true));
        }
        
        // Premier chargement des données
        this.refresh();
        
        // Configurer la mise à jour automatique
        this.setupAutoRefresh();
        
        console.log('✅ Scraper Boursorama initialisé avec succès');
    }
    
    /**
     * Configure la mise à jour automatique
     */
    setupAutoRefresh() {
        // Effacer l'ancien timer si existant
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // Créer un nouveau timer
        this.updateTimer = setInterval(() => {
            console.log('🔄 Mise à jour automatique des indices...');
            this.refresh();
        }, SCRAPER_CONFIG.updateInterval);
        
        console.log(`⏱️ Mise à jour automatique configurée toutes les ${SCRAPER_CONFIG.updateInterval / 60000} minutes`);
    }
    
    /**
     * Rafraîchit les données des indices
     */
    async refresh(userTriggered = false) {
        // Éviter les chargements multiples simultanés
        if (this.isLoading) {
            console.log('⚠️ Chargement déjà en cours, opération ignorée');
            return;
        }
        
        this.isLoading = true;
        
        // Mettre à jour l'interface pour montrer le chargement
        this.showLoading();
        
        // Si rafraîchissement manuel, mettre à jour le bouton
        if (userTriggered && this.elements.refreshButton) {
            this.elements.refreshButton.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i> Chargement...';
            this.elements.refreshButton.disabled = true;
        }
        
        try {
            // Récupérer les données
            const success = await this.fetchIndicesData();
            
            if (success) {
                // Mettre à jour l'interface
                this.data.meta.isStale = false;
                this.renderIndicesData();
                this.lastUpdate = new Date();
                this.showSuccess();
                this.fetchSuccess = true;
            } else {
                // Si c'est la première tentative et qu'elle échoue
                if (!this.fetchSuccess) {
                    // Aucune donnée précédente disponible
                    this.showError();
                } else {
                    // On a des données précédentes
                    this.data.meta.isStale = true;
                    this.renderIndicesData();
                    this.showSuccess();
                    
                    // Afficher un message indiquant que les données sont anciennes
                    this.showNotification('Impossible de mettre à jour les données. Affichage des valeurs précédentes.', 'warning');
                }
            }
        } catch (error) {
            console.error('❌ Erreur lors du rafraîchissement des données:', error);
            
            if (this.fetchSuccess) {
                // On a des données précédentes
                this.data.meta.isStale = true;
                this.renderIndicesData();
                this.showSuccess();
                this.showNotification('Impossible de mettre à jour les données. Affichage des valeurs précédentes.', 'warning');
            } else {
                this.showError();
            }
        } finally {
            // Réinitialiser l'état
            this.isLoading = false;
            
            // Réinitialiser le bouton
            if (userTriggered && this.elements.refreshButton) {
                this.elements.refreshButton.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Rafraîchir';
                this.elements.refreshButton.disabled = false;
            }
        }
    }
    
    /**
     * Récupère les données des indices depuis Boursorama
     */
    async fetchIndicesData() {
        try {
            console.log('🔄 Récupération des données depuis Boursorama...');
            
            // Utiliser le proxy CORS pour contourner les restrictions
            const url = SCRAPER_CONFIG.corsProxy + SCRAPER_CONFIG.sourceUrl;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const html = await response.text();
            
            // Parser le HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extraire les données
            this.parseIndicesFromHTML(doc);
            
            // Mettre à jour les méta-données
            this.data.meta.timestamp = new Date().toISOString();
            this.data.meta.count = 
                this.data.indices.europe.length + 
                this.data.indices.us.length + 
                this.data.indices.asia.length + 
                this.data.indices.other.length;
            
            console.log(`✅ Données récupérées avec succès: ${this.data.meta.count} indices`);
            
            // Vérifier si nous avons des données
            if (this.data.meta.count === 0) {
                console.warn('⚠️ Aucun indice trouvé dans la page Boursorama');
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des données:', error);
            return false;
        }
    }
    
    /**
     * Parse les indices depuis le HTML de Boursorama
     */
    parseIndicesFromHTML(doc) {
        // Réinitialiser les données
        this.data.indices = {
            europe: [],
            us: [],
            asia: [],
            other: []
        };
        
        // Sélectionner les lignes du tableau
        const rows = doc.querySelectorAll('table tbody tr');
        
        // Pour chaque ligne, extraire les informations
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            
            if (cells.length > 0) {
                // Extraire le nom de l'indice
                const nameEl = row.querySelector('a');
                const name = nameEl ? nameEl.textContent.trim() : cells[1].textContent.trim();
                
                // Vérifier que c'est un nom d'indice valide
                if (name && name.length > 1 && !name.match(/^\d+/)) {
                    // Extraire les autres informations
                    const value = cells[2] ? cells[2].textContent.trim() : '';
                    const change = cells[3] ? cells[3].textContent.trim() : '';
                    const opening = cells[4] ? cells[4].textContent.trim() : '';
                    
                    // Certaines cellules Boursorama peuvent contenir des valeurs vides comme "-"
                    // Ne créer l'objet indice que si nous avons au moins une valeur et une variation
                    if (value && value !== '-' && change && change !== '-') {
                        // Déterminer la tendance (hausse/baisse)
                        const trend = change.includes('-') ? 'down' : 'up';
                        
                        // Créer l'objet indice
                        const index = {
                            name,
                            value,
                            change,
                            changePercent: change,
                            opening: opening !== '-' ? opening : '',
                            high: '',
                            low: '',
                            trend
                        };
                        
                        // Classer l'indice dans la bonne région
                        this.classifyIndex(index);
                    }
                }
            }
        });
    }
    
    /**
     * Classe un indice dans la bonne région
     */
    classifyIndex(index) {
        // Convertir le nom en majuscules pour faciliter la comparaison
        const name = index.name.toUpperCase();
        
        // Vérifier chaque région
        for (const [region, keywords] of Object.entries(SCRAPER_CONFIG.regions)) {
            if (keywords.some(keyword => name.includes(keyword))) {
                this.data.indices[region].push(index);
                return;
            }
        }
        
        // Par défaut, ajouter à "other"
        this.data.indices.other.push(index);
    }
    
    /**
     * Affiche les données des indices dans l'interface
     */
    renderIndicesData() {
        try {
            // Mettre à jour l'horodatage
            const timestamp = new Date(this.data.meta.timestamp);
            let formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // Ajouter un indicateur si les données sont périmées
            if (this.data.meta.isStale) {
                formattedDate += ' (anciennes données)';
            }
            
            if (this.elements.lastUpdate) {
                this.elements.lastUpdate.textContent = formattedDate;
                
                // Ajouter une classe visuelle si les données sont périmées
                if (this.data.meta.isStale) {
                    this.elements.lastUpdate.classList.add('text-yellow-400');
                } else {
                    this.elements.lastUpdate.classList.remove('text-yellow-400');
                }
            }
            
            // Générer le HTML pour chaque région
            const regions = ['europe', 'us', 'asia', 'other'];
            
            regions.forEach(region => {
                const indices = this.data.indices[region] || [];
                const tableBody = document.getElementById(`${region}-indices-body`);
                
                if (tableBody) {
                    // Vider le corps du tableau
                    tableBody.innerHTML = '';
                    
                    // Si pas d'indices, afficher un message
                    if (indices.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `
                            <td colspan="7" class="text-center py-4 text-gray-400">
                                <i class="fas fa-info-circle mr-2"></i>
                                Aucune donnée disponible pour cette région
                            </td>
                        `;
                        tableBody.appendChild(emptyRow);
                    } else {
                        // Remplir avec les données
                        indices.forEach(index => {
                            const row = document.createElement('tr');
                            
                            row.innerHTML = `
                                <td class="font-medium">${index.name}</td>
                                <td>${index.value || '-'}</td>
                                <td class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.change || '-'}</td>
                                <td class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.changePercent || '-'}</td>
                                <td>${index.opening || '-'}</td>
                                <td>${index.high || '-'}</td>
                                <td>${index.low || '-'}</td>
                            `;
                            
                            tableBody.appendChild(row);
                        });
                    }
                    
                    // Mettre à jour le résumé
                    this.updateRegionSummary(region, indices);
                }
            });
            
            console.log('✅ Interface mise à jour avec succès');
        } catch (error) {
            console.error('❌ Erreur lors de l\'affichage des données:', error);
        }
    }
    
    /**
     * Met à jour le résumé des indices pour une région donnée
     */
    updateRegionSummary(region, indices) {
        const summaryContainer = document.getElementById(`${region}-indices-summary`);
        const trendElement = document.getElementById(`${region}-trend`);
        
        if (!summaryContainer || !trendElement) return;
        
        // Si pas d'indices, afficher un message
        if (!indices.length) {
            summaryContainer.innerHTML = `
                <div class="col-span-2 text-center text-gray-400">
                    Aucune donnée disponible
                </div>
            `;
            
            // Masquer la tendance
            trendElement.innerHTML = '';
            return;
        }
        
        // Compter les indices en hausse et en baisse
        const upCount = indices.filter(index => index.trend === 'up').length;
        const downCount = indices.filter(index => index.trend === 'down').length;
        
        // Déterminer la tendance générale
        const overallTrend = upCount >= downCount ? 'up' : 'down';
        trendElement.className = overallTrend === 'up' ? 'text-sm positive' : 'text-sm negative';
        trendElement.innerHTML = overallTrend === 'up' ? 
            '<i class="fas fa-arrow-up"></i>' : 
            '<i class="fas fa-arrow-down"></i>';
        
        // Sélectionner les indices importants pour cette région
        let importantIndices = [];
        
        switch (region) {
            case 'europe':
                importantIndices = indices.filter(index => 
                    index.name.includes('CAC 40') || 
                    index.name.includes('DAX') || 
                    index.name.includes('FTSE 100') ||
                    index.name.includes('EURO STOXX 50')
                );
                break;
            case 'us':
                importantIndices = indices.filter(index => 
                    index.name.includes('DOW') || 
                    index.name.includes('S&P 500') || 
                    index.name.includes('NASDAQ') ||
                    index.name.includes('RUSSELL')
                );
                break;
            case 'asia':
                importantIndices = indices.filter(index => 
                    index.name.includes('NIKKEI') || 
                    index.name.includes('HANG SENG') || 
                    index.name.includes('SSE') ||
                    index.name.includes('KOSPI')
                );
                break;
            case 'other':
                importantIndices = indices.filter(index => 
                    index.name.includes('BOVESPA') || 
                    index.name.includes('TSX') || 
                    index.name.includes('ASX') ||
                    index.name.includes('RTS')
                );
                break;
        }
        
        // Limiter à 4 indices
        importantIndices = importantIndices.slice(0, 4);
        
        // Si nous n'avons pas 4 indices, prendre les premiers
        while (importantIndices.length < 4 && indices.length > importantIndices.length) {
            const remainingIndices = indices.filter(index => !importantIndices.includes(index));
            importantIndices.push(remainingIndices[0]);
        }
        
        // Générer le HTML
        summaryContainer.innerHTML = '';
        
        importantIndices.forEach(index => {
            const div = document.createElement('div');
            div.innerHTML = `
                <div class="font-medium">${index.name}</div>
                <div class="${index.trend === 'down' ? 'negative' : 'positive'}">${index.changePercent || '-'}</div>
            `;
            summaryContainer.appendChild(div);
        });
    }
    
    /**
     * Affiche une notification
     */
    showNotification(message, type = 'info') {
        // Vérifier si une notification existe déjà
        let notification = document.querySelector('.notification-popup');
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'notification-popup';
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.padding = '15px 25px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '1000';
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            notification.style.transition = 'opacity 0.3s, transform 0.3s';
            
            if (type === 'warning') {
                notification.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                notification.style.borderLeft = '3px solid #FFC107';
                notification.style.color = '#FFC107';
            } else {
                notification.style.backgroundColor = 'rgba(0, 255, 135, 0.1)';
                notification.style.borderLeft = '3px solid var(--accent-color)';
                notification.style.color = 'var(--text-color)';
            }
            
            notification.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
            
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        
        // Animer la notification
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
            
            // Masquer automatiquement après 4 secondes
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(20px)';
                
                // Supprimer après la transition
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 4000);
        }, 100);
    }
    
    /**
     * Fonctions pour gérer l'affichage
     */
    showLoading() {
        if (this.elements.loading) this.elements.loading.classList.remove('hidden');
        if (this.elements.error) this.elements.error.classList.add('hidden');
        if (this.elements.container) this.elements.container.classList.add('hidden');
    }
    
    showSuccess() {
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.error) this.elements.error.classList.add('hidden');
        if (this.elements.container) this.elements.container.classList.remove('hidden');
    }
    
    showError() {
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.error) this.elements.error.classList.remove('hidden');
        if (this.elements.container) this.elements.container.classList.add('hidden');
    }
}

// Initialiser le scraper au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser le scraper
    window.boursoramaScraper = new BoursoramaScraper();
    
    // Initialiser les autres fonctionnalités de la page
    initTheme();
    initRegionTabs();
    updateMarketTime();
    setInterval(updateMarketTime, 1000);
});

/**
 * Initialise les onglets de région
 */
function initRegionTabs() {
    const tabs = document.querySelectorAll('.region-tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Mettre à jour les onglets actifs
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Afficher le contenu correspondant
            const region = this.getAttribute('data-region');
            const contents = document.querySelectorAll('.region-content');
            
            contents.forEach(content => {
                content.classList.add('hidden');
            });
            
            document.getElementById(`${region}-indices`)?.classList.remove('hidden');
        });
    });
}

/**
 * Met à jour l'heure du marché
 */
function updateMarketTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;
    
    const marketTimeElement = document.getElementById('marketTime');
    if (marketTimeElement) {
        marketTimeElement.textContent = timeStr;
    }
}

/**
 * Gestion du mode sombre/clair
 */
function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const darkIcon = document.getElementById('dark-icon');
    const lightIcon = document.getElementById('light-icon');
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
        document.documentElement.classList.remove('dark');
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
    } else {
        document.body.classList.add('dark');
        document.body.classList.remove('light');
        document.documentElement.classList.add('dark');
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
    }
    
    themeToggleBtn.addEventListener('click', function() {
        document.body.classList.toggle('dark');
        document.body.classList.toggle('light');
        document.documentElement.classList.toggle('dark');
        
        if (document.body.classList.contains('dark')) {
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
            localStorage.setItem('theme', 'dark');
        } else {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
            localStorage.setItem('theme', 'light');
        }
    });
}