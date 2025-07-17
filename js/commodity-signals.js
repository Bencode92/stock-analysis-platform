/**
 * Commodity Signals UI Module for TradePulse
 * Displays commodity alerts based on news correlation analysis
 * 
 * @author Bencode92
 * @version 1.0.0
 */

class CommoditySignals {
    constructor(opts = {}) {
        this.paths = {
            data: opts.dataPath || 'data/commodities.json'
        };
        this.state = {
            data: null,
            expanded: false,
            loading: false,
            error: null
        };
        this.el = {
            wrapper: null,
            chips: null,
            cards: null,
            toggle: null,
            lastUpdate: null
        };
        
        // Auto-refresh every 5 minutes
        this.refreshInterval = opts.refreshInterval || 300000;
        this.refreshTimer = null;
    }

    async init() {
        this._cacheEls();
        await this._loadData();
        this._render();
        this._bindEvents();
        this._startAutoRefresh();
    }

    _cacheEls() {
        this.el.wrapper = document.getElementById('commodity-signal-wrapper');
        this.el.chips = document.getElementById('commodity-signal-chips');
        this.el.cards = document.getElementById('commodity-signal-cards');
        this.el.toggle = document.getElementById('commodity-signal-toggle-details');
        this.el.lastUpdate = document.getElementById('commodity-signal-lastupdate');
    }

    async _loadData() {
        this.state.loading = true;
        this.state.error = null;
        
        try {
            const response = await fetch(this.paths.data + '?t=' + Date.now());
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this.state.data = await response.json();
            console.log('CommoditySignals: data loaded successfully', this.state.data);
        } catch (err) {
            console.error('CommoditySignals: failed to load data', err);
            this.state.error = err.message;
            this.state.data = null;
        } finally {
            this.state.loading = false;
        }
    }

    _render() {
        const data = this.state.data;
        
        // Handle loading state
        if (this.state.loading) {
            this.el.wrapper.classList.remove('hidden');
            this.el.chips.innerHTML = '<div class="text-gray-400 text-sm">Chargement des données matières premières...</div>';
            return;
        }
        
        // Handle error state
        if (this.state.error) {
            this.el.wrapper.classList.remove('hidden');
            this.el.chips.innerHTML = `<div class="text-red-400 text-sm">Erreur: ${this.state.error}</div>`;
            return;
        }
        
        // Handle no data
        if (!data || !data.commodities || !data.commodities.length) {
            this.el.wrapper.classList.add('hidden');
            return;
        }
        
        // Show wrapper
        this.el.wrapper.classList.remove('hidden');
        
        // Update last update time
        if (this.el.lastUpdate && data.lastUpdated) {
            const d = new Date(data.lastUpdated);
            this.el.lastUpdate.textContent = `(maj: ${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`;
        }

        // Sort by score descending
        const sorted = [...data.commodities].sort((a, b) => b.score - a.score);

        // Render chips (top 10)
        const chips = sorted.slice(0, 10).map(c => this._chipHTML(c)).join('');
        this.el.chips.innerHTML = chips;

        // Render cards (top 12)
        const cards = sorted.slice(0, 12).map(c => this._cardHTML(c)).join('');
        this.el.cards.innerHTML = cards;
        
        // Add summary stats
        this._renderSummary(data.summary);
    }

    _chipHTML(c) {
        const dir = c.trend === 'bullish' ? 'up' : (c.trend === 'bearish' ? 'down' : 'flat');
        const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→';
        const colorClass = dir === 'up' ? 'border-green-400 text-green-400 bg-green-400/10' : 
                          dir === 'down' ? 'border-red-400 text-red-400 bg-red-400/10' : 
                          'border-gray-400 text-gray-400 bg-gray-400/10';
        
        return `
            <span class="commodity-chip px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all hover:scale-105 ${colorClass}"
                  data-code="${c.code}"
                  data-dir="${dir}"
                  title="Score: ${c.score} | Pays: ${c.affected_countries.map(x => x.country_name).join(', ')}">
                ${c.name} ${arrow} ${c.score.toFixed(1)}
            </span>
        `;
    }

    _cardHTML(c) {
        const levelClass = {
            'critical': 'border-red-500 bg-red-500/10',
            'important': 'border-orange-500 bg-orange-500/10',
            'watch': 'border-yellow-500 bg-yellow-500/10',
            'none': 'border-gray-500 bg-gray-500/10'
        }[c.alert_level] || 'border-gray-500 bg-gray-500/10';
        
        const trendIcon = c.trend === 'bullish' ? '📈' : c.trend === 'bearish' ? '📉' : '➡️';
        const countries = c.affected_countries.map(x => x.country_name).join(', ');
        
        // Get impact badges
        const impactBadges = c.affected_countries.map(country => {
            const impactColor = {
                'pivot': 'bg-red-500',
                'major': 'bg-orange-500',
                'significant': 'bg-yellow-500'
            }[country.impact] || 'bg-gray-500';
            
            return `<span class="inline-block px-2 py-0.5 text-[10px] rounded ${impactColor} text-white">${country.country}: ${country.impact}</span>`;
        }).join(' ');
        
        return `
            <div class="commodity-card glassmorphism p-4 rounded-xl border ${levelClass} hover:scale-102 transition-transform cursor-pointer"
                 data-code="${c.code}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-semibold text-base">${c.name} ${trendIcon}</h3>
                    <span class="text-sm font-bold">${c.score.toFixed(2)}</span>
                </div>
                <div class="text-xs text-gray-400 mb-2">
                    <div class="mb-1">Pays affectés: ${countries}</div>
                    <div class="flex flex-wrap gap-1">${impactBadges}</div>
                </div>
                <div class="text-xs opacity-60 mb-2">${c.news_count} actualités liées</div>
                ${c.top_news.length > 0 ? `
                    <div class="text-xs text-gray-500 italic truncate">
                        "${c.top_news[0].title}"
                    </div>
                ` : ''}
                <button class="text-[11px] underline text-green-400 mt-2 view-commodity-details" data-code="${c.code}">
                    Voir les actualités →
                </button>
            </div>
        `;
    }

    _renderSummary(summary) {
        if (!summary) return;
        
        // Add alert badges if there are any
        if (summary.critical_alerts > 0 || summary.important_alerts > 0) {
            const alertsHtml = `
                <div class="flex gap-2 mb-3">
                    ${summary.critical_alerts > 0 ? `
                        <span class="px-2 py-1 bg-red-500/20 border border-red-500 text-red-400 rounded text-xs">
                            🚨 ${summary.critical_alerts} alertes critiques
                        </span>
                    ` : ''}
                    ${summary.important_alerts > 0 ? `
                        <span class="px-2 py-1 bg-orange-500/20 border border-orange-500 text-orange-400 rounded text-xs">
                            ⚠️ ${summary.important_alerts} alertes importantes
                        </span>
                    ` : ''}
                    ${summary.watch_list > 0 ? `
                        <span class="px-2 py-1 bg-yellow-500/20 border border-yellow-500 text-yellow-400 rounded text-xs">
                            👁️ ${summary.watch_list} à surveiller
                        </span>
                    ` : ''}
                </div>
            `;
            
            // Insert after title
            const titleEl = this.el.wrapper.querySelector('h2');
            const existingAlerts = this.el.wrapper.querySelector('.alert-badges');
            if (existingAlerts) {
                existingAlerts.remove();
            }
            const alertsDiv = document.createElement('div');
            alertsDiv.className = 'alert-badges';
            alertsDiv.innerHTML = alertsHtml;
            titleEl.parentNode.insertBefore(alertsDiv, titleEl.nextSibling);
        }
    }

    _bindEvents() {
        // Toggle button
        if (this.el.toggle) {
            this.el.toggle.addEventListener('click', () => {
                this.state.expanded = !this.state.expanded;
                this.el.cards.classList.toggle('hidden', !this.state.expanded);
                
                // Update icon and text
                const icon = this.el.toggle.querySelector('i');
                const text = this.el.toggle.querySelector('span');
                
                icon.classList.toggle('fa-chevron-down', !this.state.expanded);
                icon.classList.toggle('fa-chevron-up', this.state.expanded);
                text.textContent = this.state.expanded ? 'Masquer' : 'Voir détails';
            });
        }

        // Chip click - expand and focus card
        this.el.chips.addEventListener('click', e => {
            const chip = e.target.closest('.commodity-chip');
            if (!chip) return;
            
            const code = chip.dataset.code;
            this._focusCard(code);
        });

        // Card detail button click
        this.el.cards.addEventListener('click', e => {
            const btn = e.target.closest('.view-commodity-details');
            if (btn) {
                e.stopPropagation();
                this._showModal(btn.dataset.code);
                return;
            }
            
            // Card click - show modal
            const card = e.target.closest('.commodity-card');
            if (card) {
                this._showModal(card.dataset.code);
            }
        });
    }

    _focusCard(code) {
        // Expand if not already
        if (!this.state.expanded) {
            this.el.toggle.click();
        }
        
        // Find and highlight card
        const card = this.el.cards.querySelector(`[data-code="${code}"]`);
        if (!card) return;
        
        // Scroll into view
        setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add highlight effect
            card.classList.add('ring-2', 'ring-green-400', 'ring-opacity-75');
            setTimeout(() => {
                card.classList.remove('ring-2', 'ring-green-400', 'ring-opacity-75');
            }, 2000);
        }, 300);
    }

    _showModal(code) {
        const commodity = this.state.data.commodities.find(c => c.code === code);
        if (!commodity) return;
        
        // Create modal content
        const modalContent = `
            <div class="mb-4">
                <h3 class="text-xl font-bold mb-2">${commodity.name}</h3>
                <div class="flex gap-4 text-sm text-gray-400 mb-4">
                    <span>Score: ${commodity.score.toFixed(2)}</span>
                    <span>Tendance: ${commodity.trend === 'bullish' ? '📈 Haussière' : commodity.trend === 'bearish' ? '📉 Baissière' : '➡️ Neutre'}</span>
                    <span>Niveau: ${commodity.alert_level}</span>
                </div>
            </div>
            
            <div class="mb-4">
                <h4 class="font-semibold mb-2">Pays affectés:</h4>
                <div class="flex flex-wrap gap-2">
                    ${commodity.affected_countries.map(c => `
                        <span class="px-3 py-1 bg-gray-700 rounded text-sm">
                            ${c.country_name} (${c.impact})
                        </span>
                    `).join('')}
                </div>
            </div>
            
            <div>
                <h4 class="font-semibold mb-2">Actualités liées:</h4>
                <div class="space-y-3">
                    ${commodity.top_news.map(news => `
                        <div class="border border-gray-700 rounded p-3">
                            <div class="font-medium mb-1">${news.title}</div>
                            <div class="text-xs text-gray-400 flex justify-between">
                                <span>${news.date}</span>
                                <span>Impact: ${news.impact}</span>
                            </div>
                            ${news.url ? `
                                <a href="${news.url}" target="_blank" class="text-xs text-blue-400 hover:underline mt-1 inline-block">
                                    Lire l'article →
                                </a>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Show in existing modal or create simple modal
        if (window.showModal) {
            window.showModal('Détails Matière Première', modalContent);
        } else {
            // Fallback: create simple modal
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
            modal.innerHTML = `
                <div class="bg-gray-900 rounded-xl p-6 max-w-2xl max-h-[80vh] overflow-y-auto relative">
                    <button class="absolute top-4 right-4 text-gray-400 hover:text-white" onclick="this.closest('.fixed').remove()">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                    ${modalContent}
                </div>
            `;
            modal.addEventListener('click', e => {
                if (e.target === modal) modal.remove();
            });
            document.body.appendChild(modal);
        }
    }

    _startAutoRefresh() {
        // Clear existing timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        // Set new timer
        this.refreshTimer = setInterval(() => {
            this._loadData().then(() => this._render());
        }, this.refreshInterval);
    }

    destroy() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
    }
}

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only init if wrapper exists
    if (document.getElementById('commodity-signal-wrapper')) {
        window.commoditySignals = new CommoditySignals();
        window.commoditySignals.init();
    }
});
