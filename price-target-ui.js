/**
 * PRICE TARGET UI - VERSION AMÉLIORÉE
 * Fix : Couleurs cohérentes + Messages clairs
 */

class PriceTargetUI {
  constructor(analyzer, containerId = 'price-target-widget') {
    this.analyzer = analyzer;
    this.containerId = containerId;
    this.isVisible = false;
  }

  render(result) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    container.innerHTML = this._generateHTML(result);
    container.style.display = 'block';
    this.isVisible = true;

    setTimeout(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  _generateHTML(r) {
    const fmt = (v) => this._formatCurrency(v);
    
    // ✅ FIX : bon prix = prix actuel < prix cible => gap < 0
    const isPriceGood = r.gap < 0;
    const priceStatus = isPriceGood ? 'good' : 'bad';

    const gapMessage = isPriceGood 
      ? `Marge de négociation : ${fmt(Math.abs(r.gap))}`
      : `Surpayé de : ${fmt(Math.abs(r.gap))}`;

    const gapPercent = Math.abs(r.gapPercent);

    // Prix cible arrondi pour affichage
    const priceTargetRounded = Math.round(r.priceTarget / 1000) * 1000;

    // Hero basé sur l'enrichissement réel (pas juste le gap)
    const isEnriching = r.currentEnrichment >= 0;

    const heroKPI = `
      <div style="
        text-align:center;
        padding:24px 0;
        border-bottom:1px solid rgba(148,163,184,0.15);
        margin-bottom:24px;
      ">
        <div style="
          font-size:0.85rem;
          text-transform:uppercase;
          letter-spacing:0.1em;
          color:#94a3b8;
          margin-bottom:8px;
        ">
          ${isEnriching ? '✓ Vous vous enrichissez' : '⚠ Vous vous appauvrissez'}
        </div>
        <div style="
          font-size:3rem;
          font-weight:900;
          line-height:1;
          color:${isEnriching ? '#22c55e' : '#ef4444'};
          margin-bottom:4px;
        ">
          ${isEnriching ? '+' : '−'}${fmt(Math.abs(r.currentEnrichment))}
          <span style="font-size:1.2rem; opacity:0.7;">/an</span>
        </div>
        <div style="font-size:0.9rem; color:#94a3b8;">
          au prix actuel de ${fmt(r.currentPrice)}
        </div>
      </div>
    `;

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

          <!-- HERO KPI (enrichissement annuel) -->
          ${heroKPI}

          <!-- Comparaison prix -->
          <div class="price-comparison-grid">
            <!-- Prix actuel -->
            <div class="price-box current ${priceStatus}">
              <div class="price-box-label">
                ${isPriceGood ? '✓ Prix actuel' : '⚠ Prix actuel'}
              </div>
              <div class="price-box-amount">${fmt(r.currentPrice)}</div>
              <div class="price-box-detail ${r.currentEnrichment >= 0 ? 'positive' : 'negative'}">
                Enrichissement : 
                ${r.currentEnrichment >= 0 ? '+' : ''}${fmt(r.currentEnrichment)}/an
              </div>
            </div>

            <!-- Flèche + Gap -->
            <div class="price-arrow">
              <div class="arrow-icon ${isPriceGood ? 'up' : 'down'}">
                ${isPriceGood ? '↗' : '↘'}
              </div>
              <div class="arrow-label">
                <div class="gap-message ${isPriceGood ? 'positive' : 'negative'}">
                  ${gapMessage}
                </div>
                <div class="gap-percent">
                  (${gapPercent.toFixed(1)}%)
                </div>
              </div>
            </div>

            <!-- Prix cible -->
            <div class="price-box target">
              <div class="price-box-label">🎯 Prix d'équilibre</div>
              <div class="price-box-amount">
                ~${fmt(priceTargetRounded)}
              </div>
              <div class="price-box-detail neutral">
                Enrichissement : ≈ 0€/an
              </div>
            </div>
          </div>

          <!-- Impact breakdown -->
          <div class="impact-breakdown">
            <div class="breakdown-title">
              <i class="fas fa-chart-bar"></i>
              Comparaison au prix cible
            </div>
            <div class="breakdown-grid">
              ${this._generateBreakdownItem('Cash-flow', r)}
              ${this._generateBreakdownItem('Capital', r)}
              ${this._generateBreakdownItem('Enrichissement', r)}
            </div>
          </div>

          <!-- Recommandation -->
          ${this._generateRecommendation(r.recommendation, isPriceGood, gapPercent)}
        </div>
      </div>
    `;
  }

  /**
   * ✅ FIX 4 : Breakdown avec messages positifs
   */
  _generateBreakdownItem(type, r) {
    let icon, label, currentVal, targetVal;
    
    switch(type) {
      case 'Cash-flow':
        icon = '💰';
        label = 'Cash-flow annuel';
        currentVal = r.currentBreakdown.cashflow;
        targetVal = r.targetBreakdown.cashflow;
        break;
      case 'Capital':
        icon = '🏦';
        label = 'Capital remboursé';
        currentVal = r.currentBreakdown.capital;
        targetVal = r.targetBreakdown.capital;
        break;
      case 'Enrichissement':
        icon = '💎';
        label = 'Enrichissement total';
        currentVal = r.currentBreakdown.enrichment;
        targetVal = r.targetBreakdown.enrichment;
        break;
    }
    
    const fmt = (v) => this._formatCurrency(Math.abs(v));
    const delta = currentVal - targetVal;
    
    // Message clair : "Actuellement X, serait Y au prix cible"
    return `
      <div class="breakdown-item">
        <div class="breakdown-label">${icon} ${label}</div>
        <div class="breakdown-current ${this._getValueClass(currentVal)}">
          Actuellement : ${currentVal >= 0 ? '+' : '−'}${fmt(currentVal)}
        </div>
        <div class="breakdown-target ${this._getValueClass(targetVal)}">
          Au prix cible : ${targetVal >= 0 ? '+' : '−'}${fmt(targetVal)}
        </div>
        <div class="breakdown-delta ${delta > 0 ? 'better' : 'worse'}">
          ${Math.abs(delta) < 100 ? '≈ Identique' : 
            delta > 0 ? `${fmt(delta)} de mieux` : `${fmt(delta)} de moins`}
        </div>
      </div>
    `;
  }

  /**
   * ✅ FIX 5 : Badge cohérent avec les couleurs
   */
  _generateBadge(r) {
    if (r.infeasible) {
      return `<div class="price-target-badge danger">🚨 Cible inatteignable</div>`;
    }

    // ✅ FIX : bon prix = gap < 0
    const isPriceGood = r.gap < 0;
    const gapPercent = Math.abs(r.gapPercent);

    if (Math.abs(r.gapPercent) < 2) {
      return `<div class="price-target-badge neutral">⚖️ Prix à l'équilibre</div>`;
    }
    
    if (isPriceGood) {
      // Prix actuel SOUS le prix cible = BON
      if (gapPercent > 50) {
        return `<div class="price-target-badge success">✅ Prix excellent (${gapPercent.toFixed(0)}% sous l'équilibre)</div>`;
      } else if (gapPercent > 20) {
        return `<div class="price-target-badge success">✅ Bon prix (${gapPercent.toFixed(0)}% sous l'équilibre)</div>`;
      } else {
        return `<div class="price-target-badge success">✅ Prix correct (${gapPercent.toFixed(0)}% sous l'équilibre)</div>`;
      }
    } else {
      // Prix actuel AU-DESSUS du prix cible = MAUVAIS
      if (gapPercent > 20) {
        return `<div class="price-target-badge danger">🚨 Prix trop élevé (${gapPercent.toFixed(0)}% au-dessus)</div>`;
      } else if (gapPercent > 10) {
        return `<div class="price-target-badge warning">⚠️ Prix élevé (${gapPercent.toFixed(0)}% au-dessus)</div>`;
      } else {
        return `<div class="price-target-badge warning">💡 Légèrement au-dessus (${gapPercent.toFixed(0)}%)</div>`;
      }
    }
  }

  /**
   * ✅ FIX 6 : Recommandation cohérente
   */
  _generateRecommendation(rec, isPriceGood, gapPercent) {
    let actionMessage = '';
    
    if (isPriceGood && gapPercent > 10) {
      actionMessage = `
        <div class="recommendation-action">
          <i class="fas fa-lightbulb"></i>
          Vous pouvez aller jusqu'à ${gapPercent.toFixed(0)}% plus cher 
          et rester à l'équilibre
        </div>
      `;
    } else if (!isPriceGood && gapPercent > 10) {
      actionMessage = `
        <div class="recommendation-action warning">
          <i class="fas fa-exclamation-triangle"></i>
          Négociez une baisse de ${gapPercent.toFixed(0)}% 
          pour atteindre l'équilibre
        </div>
      `;
    }

    return `
      <div class="recommendation-box ${rec.type}">
        <div class="recommendation-icon">${rec.icon}</div>
        <div class="recommendation-content">
          <div class="recommendation-title">${rec.title}</div>
          <div class="recommendation-message">${rec.message ?? ''}</div>
          ${actionMessage}
        </div>
      </div>
    `;
  }

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

  showLoading() { /* Inchangé */ }
  showError(message) { /* Inchangé */ }
  hide() { /* Inchangé */ }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PriceTargetUI;
} else {
  window.PriceTargetUI = PriceTargetUI;
}

