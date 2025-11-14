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

    // 🔀 RP : on route vers un rendu spécifique
    if (r.regimeId === 'rp') {
      return this._generateRPRichHTML(r);
    }

    // 🔴 Cas particulier : cible inatteignable (locatif uniquement)
    if (r.infeasible) {
      return this._generateInfeasibleHTML(r);
    }
    
    // ✅ bon prix = prix actuel < prix cible => gap < 0
    const isPriceGood = r.gap < 0;
    const priceStatus = isPriceGood ? 'good' : 'bad';

    const gapMessage = isPriceGood 
      ? `Marge de négociation : ${fmt(Math.abs(r.gap))}`
      : `Surpayé de : ${fmt(Math.abs(r.gap))}`;

    const gapPercent = Math.abs(r.gapPercent);

    // Prix cible arrondi pour affichage
    const priceTargetRounded = Math.round(r.priceTarget / 1000) * 1000;

    // Hero basé sur l'enrichissement réel
    const isEnriching = r.currentEnrichment >= 0;

    // 🔹 Récupération de l’apport et calcul du rendement sur apport (ROE)
    const equity = Number(r.apport ?? 0);
    const hasEquity = equity > 0;
    const yieldOnEquity = hasEquity
      ? (r.currentEnrichment / equity) * 100
      : 0;

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
        <div style="font-size:0.9rem; color:#94a3b8; margin-bottom:2px;">
          au prix actuel de ${fmt(r.currentPrice)}
        </div>
        ${
          hasEquity
            ? `
        <div style="font-size:0.9rem; color:#64748b; margin-top:4px;">
          Rendement sur apport :
          <span style="font-weight:600; color:${yieldOnEquity >= 0 ? '#22c55e' : '#ef4444'};">
            ${yieldOnEquity >= 0 ? '+' : ''}${yieldOnEquity.toFixed(2)}%/an
          </span>
        </div>
        `
            : ''
        }
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

          <!-- HERO KPI (enrichissement annuel + rendement sur apport) -->
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

  // 🔵 Rendu spécifique Résidence Principale : acheter vs louer + placer l'apport
  _generateRPRichHTML(r) {
    const fmt = (v) => this._formatCurrency(v);

    const simple   = Number(r.rpEnrichmentSimple ?? 0);
    const complete = Number(r.rpEnrichmentComplete ?? 0);
    const deltaCash = Number(r.rpDeltaCashAnnual ?? 0);
    const capital   = Number(r.rpCapitalAnnual ?? 0);
    const oppCost   = Number(r.rpOpportunityCost ?? 0);

    const isGoodReal = complete >= 0;

    const realMessage = isGoodReal
      ? `À horizon 1 an, être propriétaire vous enrichit plus que louer <strong>en tenant compte</strong> de l'apport placé à ${r.rpOpportunityRate}%/an.`
      : `À horizon 1 an, louer + placer l'apport à ${r.rpOpportunityRate}%/an est plus rentable que devenir propriétaire.`;

    return `
      <div class="price-target-container">
        <div class="price-target-card">

          <!-- Badge -->
          <div class="price-target-badge ${isGoodReal ? 'success' : 'warning'}">
            ${isGoodReal 
              ? '✅ Propriété compétitive vs location' 
              : '⚠️ Location + placement de l\'apport plus intéressante'}
          </div>

          <!-- Header -->
          <div class="price-target-header">
            <h2 class="price-target-title">
              🏠 Acheter vs Louer – Résidence Principale
            </h2>
            <p class="price-target-subtitle">
              Comparaison annuelle entre l'achat au prix actuel (${fmt(r.currentPrice)}) 
              et la location au loyer de marché, en supposant que votre apport 
              (${fmt(r.rpApport || 0)}) soit placé à ${r.rpOpportunityRate}%/an.
            </p>
          </div>

          <!-- Disclaimer -->
          <div style="
            padding:12px 16px;
            background:rgba(248,250,252,0.9);
            border-radius:10px;
            border:1px solid rgba(148,163,184,0.4);
            font-size:0.85rem;
            color:#64748b;
            margin-bottom:16px;
          ">
            ⚠️ <strong>Analyse sur 1 an uniquement.</strong><br>
            Le capital remboursé est faible en début de prêt ; 
            la résidence principale devient souvent plus intéressante que la location 
            après 15–20 ans selon les cas.
          </div>

          <!-- Double héro : enrichissement "base" vs "réaliste" -->
          <div style="
            display:grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap:16px;
            margin-bottom:24px;
          ">
            <div style="
              padding:16px;
              border-radius:14px;
              border:1px solid rgba(148,163,184,0.35);
              background:rgba(15,23,42,0.02);
            ">
              <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; margin-bottom:4px;">
                Vue simple (sans coût d'opportunité)
              </div>
              <div style="
                font-size:2rem;
                font-weight:800;
                color:${simple >= 0 ? '#22c55e' : '#ef4444'};
                margin-bottom:4px;
              ">
                ${simple >= 0 ? '+' : '−'}${fmt(Math.abs(simple))}
                <span style="font-size:0.9rem; opacity:0.7;">/an</span>
              </div>
              <div style="font-size:0.85rem; color:#64748b;">
                ΔCash vs loyer + capital remboursé.
              </div>
            </div>

            <div style="
              padding:16px;
              border-radius:14px;
              border:1px solid ${isGoodReal ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'};
              background:${isGoodReal ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.06)'};
            ">
              <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; margin-bottom:4px;">
                Vue réaliste (avec coût d'opportunité)
              </div>
              <div style="
                font-size:2rem;
                font-weight:800;
                color:${isGoodReal ? '#22c55e' : '#ef4444'};
                margin-bottom:4px;
              ">
                ${complete >= 0 ? '+' : '−'}${fmt(Math.abs(complete))}
                <span style="font-size:0.9rem; opacity:0.7;">/an</span>
              </div>
              <div style="font-size:0.85rem; color:#64748b; margin-bottom:4px;">
                ΔCash + capital remboursé − gain perdu sur l'apport.
              </div>
              <div style="font-size:0.85rem; color:${isGoodReal ? '#16a34a' : '#b91c1c'};">
                ${realMessage}
              </div>
            </div>
          </div>

          <!-- Décomposition détaillée -->
          <details style="margin-bottom:16px;">
            <summary style="cursor:pointer; font-size:0.9rem; color:#475569;">
              Voir le détail des flux annuels
            </summary>
            <div style="margin-top:8px;">
              <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <tbody>
                  <tr>
                    <td style="padding:6px 4px;">💰 Gain / perte de cash vs loyer</td>
                    <td style="padding:6px 4px; text-align:right; font-weight:600; color:${deltaCash >= 0 ? '#16a34a' : '#b91c1c'};">
                      ${deltaCash >= 0 ? '+' : '−'}${fmt(Math.abs(deltaCash))}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 4px;">🏦 Capital remboursé</td>
                    <td style="padding:6px 4px; text-align:right; font-weight:600; color:#16a34a;">
                      +${fmt(Math.abs(capital))}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4);">
                      <strong>= Enrichissement “base”</strong>
                    </td>
                    <td style="padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4); text-align:right; font-weight:700;">
                      ${simple >= 0 ? '+' : '−'}${fmt(Math.abs(simple))}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 4px; color:#b91c1c;">📉 Coût d'opportunité de l'apport</td>
                    <td style="padding:6px 4px; text-align:right; font-weight:600; color:#b91c1c;">
                      −${fmt(Math.abs(oppCost))}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4);">
                      <strong>= Enrichissement “réaliste”</strong>
                    </td>
                    <td style="padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4); text-align:right; font-weight:700;">
                      ${complete >= 0 ? '+' : '−'}${fmt(Math.abs(complete))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

        </div>
      </div>
    `;
  }

  // 🔴 Rendu spécifique quand la cible est inatteignable (locatif)
  _generateInfeasibleHTML(r) {
    const fmt = (v) => this._formatCurrency(v);
    const isEnriching = r.currentEnrichment >= 0;

    return `
      <div class="price-target-container">
        <div class="price-target-card">
          <!-- Badge danger -->
          <div class="price-target-badge danger">
            🚨 Cible inatteignable avec les paramètres actuels
          </div>

          <!-- Header -->
          <div class="price-target-header">
            <h2 class="price-target-title">
              🎯 Prix d'équilibre impossible à atteindre
            </h2>
            <p class="price-target-subtitle">
              Avec le régime <strong>${r.regimeUsed}</strong>, aucun prix dans la plage testée
              ne permet d'atteindre votre objectif d'enrichissement.
            </p>
          </div>

          <!-- Situation actuelle -->
          <div style="
            text-align:center;
            padding:24px 16px;
            border-radius:16px;
            border:1px solid rgba(248,113,113,0.4);
            background:rgba(248,113,113,0.08);
            margin-bottom:24px;
          ">
            <div style="
              font-size:0.85rem;
              text-transform:uppercase;
              letter-spacing:0.1em;
              color:#f87171;
              margin-bottom:8px;
            ">
              Situation actuelle
            </div>
            <div style="font-size:1rem; color:#94a3b8; margin-bottom:4px;">
              Prix actuel : <strong>${fmt(r.currentPrice)}</strong>
            </div>
            <div style="
              font-size:2rem;
              font-weight:800;
              color:${isEnriching ? '#22c55e' : '#ef4444'};
            ">
              ${isEnriching ? '+' : '−'}${fmt(Math.abs(r.currentEnrichment))}
              <span style="font-size:1rem; opacity:0.7;">/an</span>
            </div>
          </div>

          <!-- Pistes d'action -->
          <div class="recommendation-box danger">
            <div class="recommendation-icon">💡</div>
            <div class="recommendation-content">
              <div class="recommendation-title">Pistes pour rendre le projet viable</div>
              <div class="recommendation-message">
                <ul style="margin:8px 0 0 18px; line-height:1.7;">
                  <li>Revoir le <strong>niveau de loyer</strong> ou le type d'exploitation (meublé, colocation, saisonnier...)</li>
                  <li>Réduire les <strong>charges récurrentes</strong> (gestion, vacance, travaux, copropriété)</li>
                  <li>Augmenter votre <strong>apport</strong> pour diminuer la mensualité</li>
                  <li>Tester un <strong>autre régime fiscal</strong> plus favorable à votre cas</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * ✅ Breakdown avec messages positifs
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
   * ✅ Badge cohérent avec les couleurs (locatif)
   */
  _generateBadge(r) {
    if (r.infeasible) {
      return `<div class="price-target-badge danger">🚨 Cible inatteignable</div>`;
    }

    const isPriceGood = r.gap < 0;
    const gapPercent = Math.abs(r.gapPercent);

    if (Math.abs(r.gapPercent) < 2) {
      return `<div class="price-target-badge neutral">⚖️ Prix à l'équilibre</div>`;
    }
    
    if (isPriceGood) {
      if (gapPercent > 50) {
        return `<div class="price-target-badge success">✅ Prix excellent (${gapPercent.toFixed(0)}% sous l'équilibre)</div>`;
      } else if (gapPercent > 20) {
        return `<div class="price-target-badge success">✅ Bon prix (${gapPercent.toFixed(0)}% sous l'équilibre)</div>`;
      } else {
        return `<div class="price-target-badge success">✅ Prix correct (${gapPercent.toFixed(0)}% sous l'équilibre)</div>`;
      }
    } else {
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
   * ✅ Recommandation cohérente (locatif)
   */
  _generateRecommendation(rec, isPriceGood, gapPercent) {
    if (!rec) return '';

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


