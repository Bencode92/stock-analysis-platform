/**
 * PRICE TARGET ANALYZER - UI Layer
 * Version corrigée avec messages adaptés au régime fixe
 */

class PriceTargetUI {
  constructor(analyzer, containerId = 'price-target-widget') {
    this.analyzer = analyzer;
    this.containerId = containerId;
    this.isVisible = false;
  }

  /**
   * Rendu complet du widget
   */
  render(result) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    container.innerHTML = this._generateHTML(result);
    container.style.display = 'block';
    this.isVisible = true;

    // Scroll smooth vers le widget
    setTimeout(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  /**
   * Génère le HTML complet
   */
  _generateHTML(r) {
    const fmt = (v) => this._formatCurrency(v);
    const sign = (v) => (v >= 0 ? '+' : '−');
    const abs = (v) => Math.abs(v);

    return `
      <div class="price-target-container">
        <div class="price-target-card">
          <!-- Badge status -->
          ${this._generateBadge(r)}

          <!-- Header -->
          <div class="price-target-header">
            <h2 class="price-target-title">
              🎯 Prix Cible pour S'Enrichir
            </h2>
            <p class="price-target-subtitle">
              Avec votre régime <strong>${r.regimeUsed}</strong>, 
              voici le prix maximum pour vous enrichir
            </p>
          </div>

          <!-- Comparaison prix -->
          <div class="price-comparison-grid">
            <!-- Prix actuel -->
            <div class="price-box current">
              <div class="price-box-label">Prix actuel</div>
              <div class="price-box-amount">${fmt(r.currentPrice)}</div>
              <div class="price-box-detail">
                Enrichissement: 
                <span style="color:${r.currentEnrichment >= 0 ? '#22c55e' : '#ef4444'}">
                  ${sign(r.currentEnrichment)}${fmt(abs(r.currentEnrichment))}/an
                </span>
              </div>
            </div>

            <!-- Flèche + Gap -->
            <div class="price-arrow">
              <div class="arrow-icon">→</div>
              <div class="arrow-label">
                <div class="gap-amount">
                  ${r.gap > 0 ? '−' : '+'}${fmt(abs(r.gap))}
                </div>
                <div class="gap-percent">
                  (${abs(r.gapPercent).toFixed(1)}%)
                </div>
              </div>
            </div>

            <!-- Prix cible -->
            <div class="price-box target">
              <div class="price-box-label">Prix cible max</div>
              <div class="price-box-amount">${fmt(r.priceTarget)}</div>
              <div class="price-box-detail">
                Enrichissement: 
                <span style="color:#22c55e">
                  ${sign(r.targetEnrichment)}${fmt(abs(r.targetEnrichment))}/an
                </span>
              </div>
            </div>
          </div>

          <!-- Impact breakdown -->
          <div class="impact-breakdown">
            <div class="breakdown-title">
              <i class="fas fa-chart-bar"></i>
              Impact au prix cible
            </div>
            <div class="breakdown-grid">
              <!-- Cash-flow -->
              <div class="breakdown-item">
                <div class="breakdown-label">💰 Cash-flow annuel</div>
                <div class="breakdown-value ${this._getValueClass(r.targetBreakdown.cashflow)}">
                  ${sign(r.targetBreakdown.cashflow)}${fmt(abs(r.targetBreakdown.cashflow))}
                </div>
                <div class="breakdown-sub">
                  vs ${sign(r.currentBreakdown.cashflow)}${fmt(abs(r.currentBreakdown.cashflow))} actuel
                </div>
              </div>

              <!-- Capital -->
              <div class="breakdown-item">
                <div class="breakdown-label">🏦 Capital remboursé</div>
                <div class="breakdown-value ${this._getValueClass(r.targetBreakdown.capital)}">
                  ${sign(r.targetBreakdown.capital)}${fmt(abs(r.targetBreakdown.capital))}
                </div>
                <div class="breakdown-sub">
                  vs ${sign(r.currentBreakdown.capital)}${fmt(abs(r.currentBreakdown.capital))} actuel
                </div>
              </div>

              <!-- Enrichissement -->
              <div class="breakdown-item">
                <div class="breakdown-label">💎 Enrichissement total</div>
                <div class="breakdown-value ${this._getValueClass(r.targetBreakdown.enrichment)}">
                  ${sign(r.targetBreakdown.enrichment)}${fmt(abs(r.targetBreakdown.enrichment))}
                </div>
                <div class="breakdown-sub">
                  vs ${sign(r.currentBreakdown.enrichment)}${fmt(abs(r.currentBreakdown.enrichment))} actuel
                </div>
              </div>
            </div>
          </div>

          <!-- Recommandation -->
          ${this._generateRecommendation(r.recommendation)}
        </div>
      </div>
    `;
  }

  /**
   * Génère le badge de status
   */
  _generateBadge(r) {
    let badgeClass, badgeText;

    if (r.infeasible) {
      return `<div class="price-target-badge danger">🚨 Cible inatteignable</div>`;
    }

    if (Math.abs(r.gapPercent) < 1) {
      badgeClass = 'neutral';
      badgeText = '⚖️ Prix à l\'équilibre';
    } else if (r.gap > 0) {
      // Prix actuel trop élevé
      if (r.gapPercent > 20) {
        badgeClass = 'danger';
        badgeText = '🚨 Prix beaucoup trop élevé';
      } else if (r.gapPercent > 10) {
        badgeClass = 'warning';
        badgeText = '⚠️ Prix élevé - Négocier';
      } else {
        badgeClass = 'warning';
        badgeText = '💡 Marge de négociation';
      }
    } else {
      // Prix actuel déjà bon
      badgeClass = 'success';
      badgeText = '✅ Excellent prix';
    }

    return `<div class="price-target-badge ${badgeClass}">${badgeText}</div>`;
  }

  /**
   * Génère la box de recommandation
   */
  _generateRecommendation(rec) {
    return `
      <div class="recommendation-box ${rec.type}">
        <div class="recommendation-icon">${rec.icon}</div>
        <div class="recommendation-content">
          <div class="recommendation-title">${rec.title}</div>
          <div class="recommendation-message">${rec.message}</div>
          <div class="recommendation-action">
            <i class="fas fa-bullseye"></i> ${rec.action}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Helpers
   */
  _getValueClass(value) {
    if (value > 100) return 'positive';
    if (value < -100) return 'negative';
    return 'neutral';
  }

  _formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Affiche un loading
   */
  showLoading() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="price-target-card calculating">
        <div style="text-align:center;padding:60px;">
          <div class="spinner"></div>
          <p style="color:#94a3b8;margin-top:20px;font-size:1.1em;">
            Calcul du prix cible optimal...
          </p>
        </div>
      </div>
    `;
    container.style.display = 'block';
  }

  /**
   * Affiche une erreur
   */
  showError(message) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="recommendation-box danger">
        <div class="recommendation-icon">❌</div>
        <div class="recommendation-content">
          <div class="recommendation-title">Erreur de calcul</div>
          <div class="recommendation-message">${message}</div>
        </div>
      </div>
    `;
    container.style.display = 'block';
  }

  /**
   * Cache le widget
   */
  hide() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'none';
      this.isVisible = false;
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PriceTargetUI;
} else {
  window.PriceTargetUI = PriceTargetUI;
}
```

### ✅ **Checkpoint Étape 1**

**Vérification :**
```
✓ 3 fichiers créés dans le bon dossier
✓ Aucune erreur de copier-coller
✓ Les fichiers font ~15Ko, ~10Ko, ~8Ko respectivement
