/**
 * Portfolio Loader v2.2 - AMF Compliant - FIXED
 * Version simplifiée et robuste pour GitHub Pages
 */

class PortfolioManagerAMF {
    constructor() {
        this.portfolios = null;
        this.meta = null;
        this.lastUpdate = null;
        this.containerSelector = '.portfolio-container';
        this.loadingSelector = '.portfolio-loading';
        this.errorSelector = '.portfolio-error';
        
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
            this.showError(`Erreur de chargement: ${error.message}`);
            this.showLoading(false);
        }
    }

    normalizeType(type) {
        return type.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    /**
     * Charge les portefeuilles - VERSION SIMPLIFIÉE ET ROBUSTE
     */
    async loadPortfolios() {
        const timestamp = Date.now();
        
        // URL directe vers raw.githubusercontent.com - TOUJOURS ACCESSIBLE
        const rawUrl = `https://raw.githubusercontent.com/Bencode92/stock-analysis-platform/main/data/portfolios.json?_=${timestamp}`;
        
        // Chemins locaux à essayer d'abord
        const localPaths = [
            'data/portfolios.json',
            './data/portfolios.json',
            '/stock-analysis-platform/data/portfolios.json'
        ];
        
        let data = null;
        let loadedFrom = null;
        
        // 1. Essayer les chemins locaux d'abord
        for (const path of localPaths) {
            try {
                console.log(`📂 Essai: ${path}`);
                const response = await fetch(`${path}?_=${timestamp}`);
                if (response.ok) {
                    data = await response.json();
                    loadedFrom = path;
                    console.log(`✅ Chargé depuis: ${path}`);
                    break;
                }
            } catch (e) {
                console.warn(`⚠️ Échec ${path}: ${e.message}`);
            }
        }
        
        // 2. Fallback vers raw.githubusercontent.com
        if (!data) {
            try {
                console.log(`📂 Fallback: ${rawUrl}`);
                const response = await fetch(rawUrl);
                if (response.ok) {
                    data = await response.json();
                    loadedFrom = 'raw.githubusercontent.com';
                    console.log('✅ Chargé depuis raw.githubusercontent.com');
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                throw new Error(`Impossible de charger portfolios.json: ${e.message}`);
            }
        }
        
        // 3. Parser les données
        if (!data) {
            throw new Error('Données vides');
        }
        
        // Extraire _meta
        this.meta = data._meta || {
            version: 'unknown',
            generated_at: new Date().toISOString(),
            backtest_days: 90
        };
        
        // Extraire les portefeuilles (clés sans underscore)
        this.portfolios = {};
        for (const key of Object.keys(data)) {
            if (!key.startsWith('_')) {
                this.portfolios[key] = data[key];
            }
        }
        
        console.log('📊 Portefeuilles trouvés:', Object.keys(this.portfolios));
        console.log('📋 Meta:', this.meta);
        
        this.lastUpdate = this.meta.generated_at 
            ? new Date(this.meta.generated_at) 
            : new Date();
        
        // Mettre à jour l'affichage
        const versionEl = document.getElementById('portfolioVersion');
        if (versionEl) versionEl.textContent = this.meta.version || 'N/A';
        
        this.updateDisplayedDate();
        
        return this.portfolios;
    }

    updateDisplayedDate() {
        const dateStr = this.formatDate(this.lastUpdate);
        ['portfolioUpdateTime', 'updateTime'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = dateStr;
        });
    }

    generateAMFComplianceBlock(portfolioType, portfolio) {
        const optimization = portfolio._optimization || {};
        const constraints = portfolio._constraint_report || {};
        const limitations = portfolio._limitations || [];
        const exposures = portfolio._exposures || {};
        
        const isHeuristic = optimization.is_heuristic === true;
        const qualityScore = constraints.quality_score || 100;
        const violations = constraints.summary?.violated || 0;
        const cryptoExposure = this.calculateCryptoExposure(portfolio);
        
        let html = `<div class="amf-compliance-block">
            <div class="amf-header">
                <i class="fas fa-shield-alt"></i>
                <span>Information réglementaire (AMF)</span>
            </div>
            
            <div class="amf-disclaimer primary">
                <i class="fas fa-exclamation-triangle"></i>
                <p><strong>Avertissement :</strong> Ce portefeuille modèle est fourni à titre informatif et éducatif uniquement. 
                Il ne constitue pas un conseil en investissement personnalisé. 
                Les performances passées ne préjugent pas des performances futures.</p>
            </div>`;
        
        // Warning crypto si > seuil
        if (cryptoExposure > this.AMF_CONFIG.maxCryptoWarningThreshold) {
            html += `
            <div class="amf-warning crypto">
                <i class="fas fa-coins"></i>
                <p><strong>Risque crypto-actifs (${cryptoExposure.toFixed(1)}%) :</strong> 
                Les crypto-actifs présentent un risque de perte en capital très élevé.</p>
            </div>`;
        }
        
        // Méthodologie
        if (this.AMF_CONFIG.showMethodologyDetails) {
            const methodLabel = isHeuristic ? 'Allocation heuristique' : 'Optimisation Markowitz (SLSQP)';
            const methodClass = isHeuristic ? 'heuristic' : 'optimized';
            const methodIcon = isHeuristic ? 'fa-cogs' : 'fa-calculator';
            
            html += `
            <div class="amf-methodology ${methodClass}">
                <div class="method-header">
                    <i class="fas ${methodIcon}"></i>
                    <span>Méthodologie : ${methodLabel}</span>
                </div>`;
            
            if (isHeuristic && optimization.why_not_slsqp_details) {
                html += `
                <div class="method-explanation">
                    <p>${optimization.why_not_slsqp_details}</p>
                </div>`;
            }
            html += `</div>`;
        }
        
        // Violations
        if (this.AMF_CONFIG.showConstraintViolations && violations > 0) {
            const violatedList = (constraints.constraints || []).filter(c => c.status === 'VIOLATED');
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
                    ${violatedList.map(v => `
                        <li><strong>${v.name}</strong>: ${v.observed}% (limite: ${v.cap}%)</li>
                    `).join('')}
                </ul>
            </div>`;
        }
        
        // Limitations
        if (limitations.length > 0) {
            html += `
            <div class="amf-limitations">
                <div class="limitations-header">
                    <i class="fas fa-info-circle"></i>
                    <span>Limitations connues</span>
                </div>
                <ul>${limitations.map(l => `<li>${l}</li>`).join('')}</ul>
            </div>`;
        }
        
        // Métriques de risque
        const conc = exposures.concentration;
        if (this.AMF_CONFIG.showRiskMetrics && conc) {
            html += `
            <div class="amf-risk-metrics">
                <div class="metrics-header">
                    <i class="fas fa-chart-bar"></i>
                    <span>Indicateurs de risque</span>
                </div>
                <div class="metrics-grid">
                    <div class="metric">
                        <span class="metric-label">Volatilité</span>
                        <span class="metric-value">${(optimization.vol_realized || 0).toFixed(1)}%</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">HHI</span>
                        <span class="metric-value ${this.getHHIClass(conc.hhi)}">${Math.round(conc.hhi)}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Positions</span>
                        <span class="metric-value">${conc.n_positions}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Top 5</span>
                        <span class="metric-value">${conc.top_5_weight}%</span>
                    </div>
                </div>
                <p class="hhi-interpretation"><em>${this.getHHIInterpretation(conc.hhi)}</em></p>
            </div>`;
        }
        
        // Footer
        html += `
            <div class="amf-footer">
                <span>Version ${this.meta.version || 'N/A'}</span>
                <span>•</span>
                <span>Généré le ${this.formatDate(this.lastUpdate)}</span>
                <span>•</span>
                <span>Backtest ${this.meta.backtest_days || 90} jours</span>
            </div>
        </div>`;
        
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
        if (hhi < 1000) return '✅ Bien diversifié';
        if (hhi < 1500) return '🟢 Diversification acceptable';
        if (hhi < 2500) return '🟡 Concentration modérée';
        return '🔴 Forte concentration';
    }

    generatePortfolioContent(portfolioType, portfolio) {
        const normalizedType = this.normalizeType(portfolioType);
        const optimization = portfolio._optimization || {};
        
        const colors = {
            agressif: '#FF7B00',
            modere: '#00FF87',
            stable: '#00B2FF'
        };
        const color = colors[normalizedType] || '#00FF87';
        
        let html = `
        <div class="portfolio-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h2 style="color: ${color}; margin: 0;">${portfolioType}</h2>
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
        </div>`;
        
        // Commentaire
        const comment = portfolio.Commentaire || 'Portefeuille optimisé selon les conditions de marché.';
        html += `
        <div class="portfolio-commentary" style="border-left: 4px solid ${color}; padding: 1rem; background: rgba(255,255,255,0.03); margin-bottom: 1.5rem; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; line-height: 1.6;">${comment}</p>
        </div>`;
        
        // Graphique + Allocation
        html += `
        <div class="portfolio-overview" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div class="portfolio-chart-container" style="height: 250px;">
                <canvas id="chart-${normalizedType}"></canvas>
            </div>
            <div class="portfolio-allocation">
                <h3 style="margin-bottom: 1rem;">Répartition par classe</h3>
                ${this.generateAllocationBars(portfolio, color)}
            </div>
        </div>`;
        
        // Détails par catégorie
        html += '<div class="portfolio-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">';
        
        ['Actions', 'ETF', 'Obligations', 'Crypto'].forEach(category => {
            const assets = portfolio[category];
            if (!assets || Object.keys(assets).length === 0) return;
            
            const sorted = Object.entries(assets)
                .map(([name, val]) => ({ name, value: parseFloat(String(val).replace('%', '')) }))
                .filter(a => a.value > 0)
                .sort((a, b) => b.value - a.value);
            
            if (sorted.length === 0) return;
            
            html += `
            <div class="portfolio-category" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px;">
                <h3 style="color: ${color}; margin-bottom: 1rem; font-size: 1rem;">
                    <i class="${this.getCategoryIcon(category)}"></i> ${category}
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                    ${sorted.map(a => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 0.5rem 0; font-size: 0.85rem;">${a.name}</td>
                            <td style="padding: 0.5rem 0; text-align: right; color: ${color}; font-weight: 600;">${a.value}%</td>
                        </tr>
                    `).join('')}
                </table>
            </div>`;
        });
        
        html += '</div>';
        
        // Bloc AMF
        html += this.generateAMFComplianceBlock(portfolioType, portfolio);
        
        // Boutons
        html += `
        <div class="portfolio-actions" style="display: flex; gap: 1rem; margin-top: 2rem;">
            <button class="btn-download" data-portfolio="${portfolioType}" style="padding: 0.75rem 1.5rem; border: 2px solid ${color}; color: ${color}; background: transparent; border-radius: 8px; cursor: pointer;">
                <i class="fas fa-download"></i> PDF
            </button>
            <button class="btn-share" data-portfolio="${portfolioType}" style="padding: 0.75rem 1.5rem; border: 2px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); background: transparent; border-radius: 8px; cursor: pointer;">
                <i class="fas fa-share-alt"></i> Partager
            </button>
        </div>`;
        
        return html;
    }

    generateAllocationBars(portfolio, color) {
        const categories = ['Actions', 'ETF', 'Obligations', 'Crypto'];
        let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
        
        categories.forEach(cat => {
            const assets = portfolio[cat] || {};
            const total = Object.values(assets).reduce((sum, v) => {
                const num = parseFloat(String(v).replace('%', ''));
                return sum + (isNaN(num) ? 0 : num);
            }, 0);
            
            if (total === 0) return;
            
            html += `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="width: 80px; font-size: 0.85rem;">${cat}</span>
                <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${total}%; height: 100%; background: ${color};"></div>
                </div>
                <span style="width: 40px; text-align: right; color: ${color}; font-weight: 600;">${Math.round(total)}%</span>
            </div>`;
        });
        
        html += '</div>';
        return html;
    }

    getCategoryIcon(category) {
        return {
            'Actions': 'fas fa-chart-line',
            'ETF': 'fas fa-layer-group',
            'Obligations': 'fas fa-file-contract',
            'Crypto': 'fas fa-coins'
        }[category] || 'fas fa-cube';
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
        // Aussi dans la console
        console.error('Portfolio Error:', message);
    }

    renderPortfolios() {
        const container = document.querySelector(this.containerSelector);
        if (!container || !this.portfolios) {
            console.error('Container ou portfolios manquants');
            return;
        }
        
        console.log('🎨 Rendu des portefeuilles:', Object.keys(this.portfolios));
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'portfolio-content';
        
        const portfolioTypes = Object.keys(this.portfolios);
        
        portfolioTypes.forEach((type, index) => {
            const panel = document.createElement('div');
            panel.className = `portfolio-panel ${index === 0 ? 'active' : ''}`;
            panel.id = `portfolio-${this.normalizeType(type)}`;
            panel.style.display = index === 0 ? 'block' : 'none';
            panel.innerHTML = this.generatePortfolioContent(type, this.portfolios[type]);
            contentContainer.appendChild(panel);
        });
        
        // Supprimer l'ancien contenu
        const existing = container.querySelector('.portfolio-content');
        if (existing) existing.remove();
        
        // Cacher le loading
        const loading = container.querySelector('.portfolio-loading');
        if (loading) loading.style.display = 'none';
        
        // Ajouter le nouveau contenu
        container.appendChild(contentContainer);
        
        // Initialiser les graphiques
        setTimeout(() => this.initCharts(), 100);
    }

    initCharts() {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js non disponible');
            return;
        }
        
        Object.keys(this.portfolios).forEach(type => {
            const normalizedType = this.normalizeType(type);
            const canvas = document.getElementById(`chart-${normalizedType}`);
            if (!canvas) {
                console.warn(`Canvas chart-${normalizedType} non trouvé`);
                return;
            }
            
            const ctx = canvas.getContext('2d');
            const portfolio = this.portfolios[type];
            const data = [];
            const labels = [];
            const bgColors = [];
            
            const colorMap = {
                'Actions': '#FF6B6B',
                'ETF': '#4ECDC4',
                'Obligations': '#45B7D1',
                'Crypto': '#FFA07A'
            };
            
            ['Actions', 'ETF', 'Obligations', 'Crypto'].forEach(cat => {
                const assets = portfolio[cat] || {};
                const total = Object.values(assets).reduce((sum, v) => {
                    const num = parseFloat(String(v).replace('%', ''));
                    return sum + (isNaN(num) ? 0 : num);
                }, 0);
                
                if (total > 0) {
                    data.push(total);
                    labels.push(cat);
                    bgColors.push(colorMap[cat]);
                }
            });
            
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: bgColors,
                        borderWidth: 2,
                        borderColor: '#0a1929'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: '#fff', font: { size: 11 } }
                        }
                    }
                }
            });
        });
    }

    setupInteractions() {
        // Gestion des onglets
        document.querySelectorAll('.portfolio-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Désactiver tous les onglets et panels
                document.querySelectorAll('.portfolio-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.portfolio-panel').forEach(p => {
                    p.classList.remove('active');
                    p.style.display = 'none';
                });
                
                // Activer l'onglet cliqué
                tab.classList.add('active');
                const targetId = tab.dataset.target;
                const panel = document.getElementById(targetId);
                if (panel) {
                    panel.classList.add('active');
                    panel.style.display = 'block';
                }
                
                // Mettre à jour le titre
                const type = tab.dataset.originalType || targetId.replace('portfolio-', '');
                const titleEl = document.getElementById('portfolioTitle');
                if (titleEl) titleEl.textContent = `PORTEFEUILLE ${type.toUpperCase()}`;
            });
        });
        
        // Boutons téléchargement/partage
        document.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => alert(`PDF ${btn.dataset.portfolio} - Fonctionnalité à venir`));
        });
        
        document.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = `${window.location.href}?type=${this.normalizeType(btn.dataset.portfolio)}`;
                navigator.clipboard.writeText(url).then(() => alert('Lien copié !'));
            });
        });
    }

    formatDate(date) {
        if (!date) return 'N/A';
        try {
            return new Intl.DateTimeFormat('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }).format(new Date(date));
        } catch (e) {
            return 'N/A';
        }
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 PortfolioManager AMF v2.2 - Initialisation');
    window.portfolioManager = new PortfolioManagerAMF();
    window.portfolioManager.init();
});
