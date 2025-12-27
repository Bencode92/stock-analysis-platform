/**
 * Portfolio Loader v2.1 - AMF Compliant
 * 
 * Changements v2.1:
 * - Ajout chemin absolu GitHub Pages comme fallback
 * - Meilleure gestion des erreurs de chargement
 * - Support URL raw GitHub en dernier recours
 */

class PortfolioManagerAMF {
    constructor() {
        this.portfolios = null;
        this.meta = null;
        this.lastUpdate = null;
        this.containerSelector = '.portfolio-container';
        this.loadingSelector = '.portfolio-loading';
        this.errorSelector = '.portfolio-error';
        
        // Configuration AMF
        this.AMF_CONFIG = {
            maxCryptoWarningThreshold: 5,
            qualityScoreWarningThreshold: 90,
            showMethodologyDetails: true,
            showRiskMetrics: true,
            showConstraintViolations: true
        };
    }

    async init() {
        try {
            this.showLoading(true);
            await this.loadPortfolios();
            this.renderPortfolios();
            this.setupInteractions();
            this.showLoading(false);
            console.log('✅ Portefeuilles AMF chargés avec succès');
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error);
            this.showError('Erreur de chargement des portefeuilles. Veuillez réessayer.');
            this.showLoading(false);
        }
    }

    normalizeType(type) {
        return type.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    /**
     * Charge les portefeuilles avec plusieurs fallbacks
     */
    async loadPortfolios() {
        const timestamp = new Date().getTime();
        
        // Détection du base path pour GitHub Pages
        const basePath = window.location.pathname.includes('/stock-analysis-platform') 
            ? '/stock-analysis-platform' 
            : '';
        
        // Chemins à essayer (du plus local au plus distant)
        const paths = [
            `${basePath}/data/portfolios.json?_=${timestamp}`,
            `data/portfolios.json?_=${timestamp}`,
            `./data/portfolios.json?_=${timestamp}`,
            // Fallback absolu GitHub Pages
            `https://bencode92.github.io/stock-analysis-platform/data/portfolios.json?_=${timestamp}`,
            // Fallback raw GitHub (toujours à jour)
            `https://raw.githubusercontent.com/Bencode92/stock-analysis-platform/main/data/portfolios.json?_=${timestamp}`
        ];
        
        let loaded = false;
        let lastError = null;
        
        for (const path of paths) {
            try {
                console.log(`📂 Tentative de chargement: ${path}`);
                const response = await fetch(path, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                    cache: 'no-store'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // Extraire les métadonnées
                    this.meta = data._meta || {};
                    
                    // Extraire les portefeuilles (tout sauf _meta)
                    this.portfolios = {};
                    Object.keys(data).forEach(key => {
                        if (!key.startsWith('_')) {
                            this.portfolios[key] = data[key];
                        }
                    });
                    
                    this.lastUpdate = this.meta.generated_at 
                        ? new Date(this.meta.generated_at) 
                        : new Date();
                    
                    console.log(`✅ Chargé depuis ${path}`, {
                        profiles: Object.keys(this.portfolios),
                        version: this.meta.version,
                        generated: this.meta.generated_at
                    });
                    
                    // Mettre à jour l'affichage de la version
                    const versionEl = document.getElementById('portfolioVersion');
                    if (versionEl) versionEl.textContent = this.meta.version || 'N/A';
                    
                    loaded = true;
                    break;
                } else {
                    console.warn(`⚠️ Échec ${path}: HTTP ${response.status}`);
                    lastError = `HTTP ${response.status}`;
                }
            } catch (e) {
                console.warn(`⚠️ Échec ${path}:`, e.message);
                lastError = e.message;
            }
        }
        
        if (!loaded) {
            throw new Error(`Impossible de charger portfolios.json. Dernière erreur: ${lastError}`);
        }
        
        this.updateDisplayedDate();
        return this.portfolios;
    }

    updateDisplayedDate() {
        const elements = [
            document.getElementById('portfolioUpdateTime'),
            document.getElementById('updateTime')
        ];
        
        const dateStr = this.formatDate(this.lastUpdate);
        
        elements.forEach(el => {
            if (el) el.textContent = dateStr;
        });
    }

    generateAMFComplianceBlock(portfolioType, portfolio) {
        const optimization = portfolio._optimization || {};
        const constraints = portfolio._constraint_report || {};
        const limitations = portfolio._limitations || [];
        const exposures = portfolio._exposures || {};
        
        const isHeuristic = optimization.is_heuristic || false;
        const qualityScore = constraints.quality_score || 100;
        const violations = constraints.summary?.violated || 0;
        
        const cryptoExposure = this.calculateCryptoExposure(portfolio);
        
        let html = `<div class="amf-compliance-block">`;
        
        html += `
            <div class="amf-header">
                <i class="fas fa-shield-alt"></i>
                <span>Information réglementaire (AMF)</span>
            </div>
        `;
        
        html += `
            <div class="amf-disclaimer primary">
                <i class="fas fa-exclamation-triangle"></i>
                <p><strong>Avertissement :</strong> Ce portefeuille modèle est fourni à titre informatif et éducatif uniquement. 
                Il ne constitue pas un conseil en investissement personnalisé au sens de l'article L. 321-1 du Code monétaire et financier. 
                Les performances passées ne préjugent pas des performances futures.</p>
            </div>
        `;
        
        if (cryptoExposure > this.AMF_CONFIG.maxCryptoWarningThreshold) {
            html += `
                <div class="amf-warning crypto">
                    <i class="fas fa-coins"></i>
                    <p><strong>Risque crypto-actifs (${cryptoExposure.toFixed(1)}%) :</strong> 
                    Les crypto-actifs présentent un risque de perte en capital très élevé. 
                    Leur valorisation peut varier considérablement en très peu de temps. 
                    Investissez uniquement des sommes dont la perte ne compromettrait pas votre situation financière.</p>
                </div>
            `;
        }
        
        if (this.AMF_CONFIG.showMethodologyDetails) {
            const methodLabel = isHeuristic ? 'Allocation heuristique' : 'Optimisation Markowitz (SLSQP)';
            const methodIcon = isHeuristic ? 'fa-cogs' : 'fa-calculator';
            const methodClass = isHeuristic ? 'heuristic' : 'optimized';
            
            html += `
                <div class="amf-methodology ${methodClass}">
                    <div class="method-header">
                        <i class="fas ${methodIcon}"></i>
                        <span>Méthodologie : ${methodLabel}</span>
                    </div>
            `;
            
            if (isHeuristic && optimization.why_not_slsqp_details) {
                html += `
                    <div class="method-explanation">
                        <p>${optimization.why_not_slsqp_details}</p>
                    </div>
                `;
            }
            
            html += `</div>`;
        }
        
        if (this.AMF_CONFIG.showConstraintViolations && violations > 0) {
            html += `
                <div class="amf-warning violations">
                    <div class="warning-header">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Contraintes non respectées (${violations})</span>
                        <span class="quality-badge score-${this.getScoreClass(qualityScore)}">
                            Score: ${qualityScore.toFixed(1)}%
                        </span>
                    </div>
                    <ul class="violation-list">
            `;
            
            const violatedConstraints = (constraints.constraints || [])
                .filter(c => c.status === 'VIOLATED');
            
            violatedConstraints.forEach(v => {
                html += `
                    <li>
                        <strong>${v.name}</strong>: ${v.observed}% (limite: ${v.cap}%)
                        <span class="slack">${v.slack > 0 ? '+' : ''}${v.slack.toFixed(1)}%</span>
                    </li>
                `;
            });
            
            html += `</ul></div>`;
        }
        
        if (limitations.length > 0) {
            html += `
                <div class="amf-limitations">
                    <div class="limitations-header">
                        <i class="fas fa-info-circle"></i>
                        <span>Limitations connues</span>
                    </div>
                    <ul>
            `;
            limitations.forEach(lim => {
                html += `<li>${lim}</li>`;
            });
            html += `</ul></div>`;
        }
        
        if (this.AMF_CONFIG.showRiskMetrics && exposures.concentration) {
            const conc = exposures.concentration;
            html += `
                <div class="amf-risk-metrics">
                    <div class="metrics-header">
                        <i class="fas fa-chart-bar"></i>
                        <span>Indicateurs de risque</span>
                    </div>
                    <div class="metrics-grid">
                        <div class="metric">
                            <span class="metric-label">Volatilité estimée</span>
                            <span class="metric-value">${(optimization.vol_realized || 0).toFixed(1)}%</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Diversification (HHI)</span>
                            <span class="metric-value ${this.getHHIClass(conc.hhi)}">${conc.hhi}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Positions effectives</span>
                            <span class="metric-value">${conc.effective_n?.toFixed(1) || 'N/A'}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Concentration Top 5</span>
                            <span class="metric-value">${conc.top_5_weight}%</span>
                        </div>
                    </div>
                    <p class="hhi-interpretation">
                        <em>${this.getHHIInterpretation(conc.hhi)}</em>
                    </p>
                </div>
            `;
        }
        
        html += `
            <div class="amf-footer">
                <span>Version ${this.meta.version || 'N/A'}</span>
                <span>•</span>
                <span>Généré le ${this.formatDate(this.lastUpdate)}</span>
                <span>•</span>
                <span>Backtest ${this.meta.backtest_days || 90} jours</span>
            </div>
        `;
        
        html += `</div>`;
        
        return html;
    }

    calculateCryptoExposure(portfolio) {
        const crypto = portfolio.Crypto || {};
        return Object.values(crypto).reduce((sum, val) => {
            const num = parseFloat(String(val).replace('%', ''));
            return sum + (isNaN(num) ? 0 : num);
        }, 0);
    }

    getScoreClass(score) {
        if (score >= 95) return 'excellent';
        if (score >= 85) return 'good';
        if (score >= 70) return 'warning';
        return 'critical';
    }

    getHHIClass(hhi) {
        if (hhi < 1000) return 'well-diversified';
        if (hhi < 1500) return 'diversified';
        if (hhi < 2500) return 'concentrated';
        return 'highly-concentrated';
    }

    getHHIInterpretation(hhi) {
        if (hhi < 1000) return '✅ Portefeuille bien diversifié';
        if (hhi < 1500) return '🟢 Diversification acceptable';
        if (hhi < 2500) return '🟡 Concentration modérée - surveiller';
        return '🔴 Forte concentration - risque élevé';
    }

    generatePortfolioContent(portfolioType, portfolio) {
        const normalizedType = this.normalizeType(portfolioType);
        const optimization = portfolio._optimization || {};
        const exposures = portfolio._exposures || {};
        
        const colors = {
            agressif: { main: '#FF7B00', rgb: '255, 123, 0' },
            modere: { main: '#00FF87', rgb: '0, 255, 135' },
            stable: { main: '#00B2FF', rgb: '0, 178, 255' }
        };
        const color = colors[normalizedType] || colors.modere;
        
        let html = '';
        
        html += `
            <div class="portfolio-header">
                <h2 style="color: ${color.main}">${portfolioType}</h2>
                <div class="portfolio-badges">
                    <span class="badge ${optimization.is_heuristic ? 'heuristic' : 'optimized'}">
                        <i class="fas ${optimization.is_heuristic ? 'fa-cogs' : 'fa-calculator'}"></i>
                        ${optimization.is_heuristic ? 'Heuristique' : 'Optimisé'}
                    </span>
                    <span class="badge volatility">
                        <i class="fas fa-chart-line"></i>
                        Vol: ${(optimization.vol_realized || 0).toFixed(1)}%
                    </span>
                </div>
            </div>
        `;
        
        const comment = portfolio.Commentaire || this.getDefaultDescription(portfolioType);
        html += `
            <div class="portfolio-commentary" style="border-left-color: ${color.main}">
                <div class="commentary-header">
                    <i class="fas fa-lightbulb" style="color: ${color.main}"></i>
                    <span>Analyse stratégique</span>
                </div>
                <p>${comment}</p>
            </div>
        `;
        
        html += `
            <div class="portfolio-overview">
                <div class="portfolio-chart-container">
                    <canvas id="chart-${normalizedType}"></canvas>
                </div>
                <div class="portfolio-allocation">
                    <h3>Répartition par classe d'actifs</h3>
                    ${this.generateAllocationBars(portfolio, color)}
                </div>
            </div>
        `;
        
        html += '<div class="portfolio-details">';
        
        ['Actions', 'ETF', 'Obligations', 'Crypto'].forEach(category => {
            const assets = portfolio[category];
            if (!assets || Object.keys(assets).length === 0) return;
            
            const hasNonZero = Object.values(assets).some(v => 
                parseFloat(String(v).replace('%', '')) > 0
            );
            if (!hasNonZero) return;
            
            html += `
                <div class="portfolio-category">
                    <h3>
                        <i class="${this.getCategoryIcon(category)}"></i>
                        ${category}
                    </h3>
                    <table class="assets-table">
                        <thead>
                            <tr>
                                <th>Instrument</th>
                                <th>Allocation</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            const sorted = Object.entries(assets)
                .map(([name, val]) => ({
                    name,
                    value: parseFloat(String(val).replace('%', ''))
                }))
                .filter(a => a.value > 0)
                .sort((a, b) => b.value - a.value);
            
            sorted.forEach(asset => {
                html += `
                    <tr>
                        <td>${asset.name}</td>
                        <td>
                            <span class="asset-allocation" style="color: ${color.main}">
                                ${asset.value}%
                            </span>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        });
        
        html += '</div>';
        
        html += this.generateAMFComplianceBlock(portfolioType, portfolio);
        
        html += `
            <div class="portfolio-actions">
                <button class="btn-download" data-portfolio="${portfolioType}" style="border-color: ${color.main}; color: ${color.main}">
                    <i class="fas fa-download"></i> Télécharger PDF
                </button>
                <button class="btn-share" data-portfolio="${portfolioType}">
                    <i class="fas fa-share-alt"></i> Partager
                </button>
            </div>
        `;
        
        return html;
    }

    generateAllocationBars(portfolio, color) {
        const categories = ['Actions', 'ETF', 'Obligations', 'Crypto'];
        let html = '<ul class="category-allocation">';
        
        categories.forEach(cat => {
            const assets = portfolio[cat] || {};
            const total = Object.values(assets).reduce((sum, v) => {
                const num = parseFloat(String(v).replace('%', ''));
                return sum + (isNaN(num) ? 0 : num);
            }, 0);
            
            if (total === 0) return;
            
            html += `
                <li>
                    <span class="category-name">
                        <i class="${this.getCategoryIcon(cat)}"></i>
                        ${cat}
                    </span>
                    <div class="allocation-bar">
                        <div class="allocation-fill" style="width: ${total}%; background-color: ${color.main}"></div>
                    </div>
                    <span class="allocation-value" style="color: ${color.main}">${total.toFixed(0)}%</span>
                </li>
            `;
        });
        
        html += '</ul>';
        return html;
    }

    getCategoryIcon(category) {
        const icons = {
            'Actions': 'fas fa-chart-line',
            'ETF': 'fas fa-layer-group',
            'Obligations': 'fas fa-file-contract',
            'Crypto': 'fas fa-coins'
        };
        return icons[category] || 'fas fa-cube';
    }

    getDefaultDescription(type) {
        const descriptions = {
            'Agressif': 'Portefeuille orienté croissance maximale avec une tolérance élevée au risque.',
            'Modéré': 'Portefeuille équilibré combinant croissance et protection du capital.',
            'Stable': 'Portefeuille défensif privilégiant la préservation du capital.'
        };
        return descriptions[type] || 'Portefeuille optimisé selon les conditions de marché.';
    }

    showLoading(show) {
        const el = document.querySelector(this.loadingSelector);
        if (el) el.style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        const el = document.querySelector(this.errorSelector);
        if (el) {
            el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
            el.style.display = 'block';
        }
    }

    renderPortfolios() {
        const container = document.querySelector(this.containerSelector);
        if (!container || !this.portfolios) return;
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'portfolio-content';
        
        Object.keys(this.portfolios).forEach((type, index) => {
            const panel = document.createElement('div');
            panel.className = `portfolio-panel ${index === 0 ? 'active' : ''}`;
            panel.id = `portfolio-${this.normalizeType(type)}`;
            panel.innerHTML = this.generatePortfolioContent(type, this.portfolios[type]);
            contentContainer.appendChild(panel);
        });
        
        const existing = container.querySelector('.portfolio-content');
        if (existing) existing.remove();
        container.appendChild(contentContainer);
        
        this.initCharts();
    }

    initCharts() {
        if (!window.Chart) {
            console.warn('Chart.js non disponible');
            return;
        }
        
        Object.keys(this.portfolios).forEach(type => {
            const normalizedType = this.normalizeType(type);
            const ctx = document.getElementById(`chart-${normalizedType}`);
            if (!ctx) return;
            
            const portfolio = this.portfolios[type];
            const data = [];
            const labels = [];
            const colors = this.getChartColors(normalizedType);
            
            ['Actions', 'ETF', 'Obligations', 'Crypto'].forEach((cat, i) => {
                const assets = portfolio[cat] || {};
                const total = Object.values(assets).reduce((sum, v) => {
                    const num = parseFloat(String(v).replace('%', ''));
                    return sum + (isNaN(num) ? 0 : num);
                }, 0);
                
                if (total > 0) {
                    data.push(total);
                    labels.push(cat);
                }
            });
            
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors.slice(0, data.length),
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: colors[0],
                                font: { size: 11, family: "'Inter', sans-serif" }
                            }
                        }
                    }
                }
            });
        });
    }

    getChartColors(type) {
        const palettes = {
            agressif: ['#FF7B00', '#FF9E44', '#FFB266', '#FFCB8E', '#FFE4C4'],
            modere: ['#00FF87', '#33FF9E', '#66FFB5', '#99FFCC', '#CCFFE5'],
            stable: ['#00B2FF', '#33C4FF', '#66D6FF', '#99E8FF', '#CCF4FF']
        };
        return palettes[type] || palettes.modere;
    }

    setupInteractions() {
        document.querySelectorAll('.portfolio-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.portfolio-tab, .portfolio-panel')
                    .forEach(el => el.classList.remove('active'));
                
                tab.classList.add('active');
                const target = document.getElementById(tab.dataset.target);
                if (target) target.classList.add('active');
                
                const type = tab.dataset.originalType || tab.dataset.target.replace('portfolio-', '');
                const titleEl = document.getElementById('portfolioTitle');
                if (titleEl) titleEl.textContent = `PORTEFEUILLE ${type.toUpperCase()}`;
            });
        });
        
        document.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => this.downloadPDF(btn.dataset.portfolio));
        });
        
        document.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', () => this.sharePortfolio(btn.dataset.portfolio));
        });
    }

    downloadPDF(type) {
        this.showNotification(`Génération PDF ${type} en cours...`, 'info');
    }

    sharePortfolio(type) {
        const url = `${window.location.origin}${window.location.pathname}?type=${this.normalizeType(type)}`;
        
        if (navigator.share) {
            navigator.share({
                title: `TradePulse - Portefeuille ${type}`,
                url
            });
        } else {
            navigator.clipboard.writeText(url);
            this.showNotification('Lien copié !', 'success');
        }
    }

    showNotification(message, type = 'success') {
        let notif = document.querySelector('.tp-notification');
        if (!notif) {
            notif = document.createElement('div');
            notif.className = 'tp-notification';
            document.body.appendChild(notif);
        }
        
        notif.className = `tp-notification ${type}`;
        notif.textContent = message;
        notif.style.display = 'block';
        
        setTimeout(() => { notif.style.display = 'none'; }, 3000);
    }

    formatDate(date) {
        if (!date) return 'N/A';
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initialisation PortfolioManager AMF v2.1');
    const manager = new PortfolioManagerAMF();
    window.portfolioManager = manager;
    manager.init();
});
