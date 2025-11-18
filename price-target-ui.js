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

    // HTML principal (prix cible / RP etc.)
    let html = this._generateHTML(result);

    // 🔹 Scénarios uniquement pour le locatif faisable
    if (result.regimeId !== 'rp' && !result.infeasible && this.analyzer?.analyzeScenarios) {
      const baseInput = result._baseInput; // injecté côté analyzer
      if (baseInput) {
        const scenariosData = this.analyzer.analyzeScenarios(
          baseInput,
          0, // seuil d’équilibre
          { regimeId: result.regimeId }
        );
        html += this._generateScenariosPanel(scenariosData);
      }
    }

    container.innerHTML = html;
    container.style.display = 'block';
    this.isVisible = true;

    // Activer le toggle du panneau scénarios (si présent)
    this._attachScenarioToggle?.();

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

  // 🔵 Rendu spécifique Résidence Principale : acheter vs louer + placer l'apport (version clarifiée)
  _generateRPRichHTML(r) {
    const fmt = (v) => this._formatCurrency(v);

    const simple     = Number(r.rpEnrichmentSimple ?? 0);     // ΔCash + capital
    const realistic  = Number(r.rpEnrichmentComplete ?? 0);   // simple – coût d'opportunité
    const deltaCash  = Number(r.rpDeltaCashAnnual ?? 0);
    const capital    = Number(r.rpCapitalAnnual ?? 0);
    const oppCost    = Number(r.rpOpportunityCost ?? 0);
    const apport     = Number(r.rpApport ?? 0);

    const currentPrice   = Number(r.currentPrice ?? 0);
    const priceTarget    = Number(r.priceTarget ?? 0);
    const priceTargetRnd = Math.round(priceTarget / 1000) * 1000;

    // gap = prix actuel − prix cible
    const gap        = Number(r.gap ?? 0);
    const gapPercent = Math.abs(Number(r.gapPercent ?? 0)); // en %

    const isPriceUnderEquilibrium = currentPrice < priceTarget;
    const roomToEquilibrium       = priceTarget - currentPrice;
    const roomPercent             = currentPrice > 0 ? (roomToEquilibrium / currentPrice) * 100 : 0;

    // KPI principal : enrichissement "réaliste" (vue patrimoniale)
    const isRealPositive = realistic >= 0;

    // Rendement réel sur apport
    const hasEquity = apport > 0;
    const roeReal   = hasEquity ? (realistic / apport) * 100 : 0;
    const oppRate   = Number(r.rpOpportunityRate ?? 0); // déjà en %

    // 🔹 KPI mensuels pour la réconciliation trésorerie vs patrimoine
    const monthlyNet     = Number(r.rpMonthlyNet ?? r.currentMonthlyCost ?? 0);
    const monthlyEffort  = Math.abs(monthlyNet);                 // ex : 443 €/mois
    const monthlyCapital = Math.round(Math.abs(capital / 12));   // ex : ~375 €/mois

    const monthlyLabel = monthlyNet >= 0
      ? 'Effort d\'épargne mensuel (proprio plus cher que locataire)'
      : 'Économie de trésorerie mensuelle (proprio moins cher que locataire)';

    // Badge : compétitivité vs location
    let badgeClass = 'success';
    let badgeText  = '✅ Propriété compétitive vs location';

    if (!isRealPositive) {
      badgeClass = 'danger';
      badgeText  = `⚠️ Location + placement de l'apport plus rentable`;
    } else if (hasEquity && roeReal < 1) {
      badgeClass = 'warning';
      badgeText  = `⚠️ Propriété marginalement compétitive vs location`;
    }

    // Message marge / surcoût
    let gapLabel;
    if (Math.abs(gap) < 500) {
      gapLabel = 'Prix très proche du seuil d’équilibre';
    } else if (isPriceUnderEquilibrium) {
      gapLabel = `Marge théorique : ${fmt(roomToEquilibrium)} (+${roomPercent.toFixed(1)}% avant d’atteindre l’équilibre)`;
    } else {
      gapLabel = `Surcoût vs prix d’équilibre : ${fmt(Math.abs(gap))} (+${gapPercent.toFixed(1)}% au-dessus)`;
    }

    // Interprétation
    const interpLines = [];
    if (isPriceUnderEquilibrium) {
      interpLines.push(
        `Vous pouvez monter jusqu'à <strong>${fmt(priceTargetRnd)}</strong> sans perdre d'argent (≈ prix d'équilibre à 1 an).`
      );
      interpLines.push(
        `Au-delà de ce prix, louer puis placer votre apport à ${oppRate}%/an devient plus rentable.`
      );
    } else {
      interpLines.push(
        `Pour que l'achat soit au moins aussi intéressant que la location, il faudrait viser un prix autour de <strong>${fmt(priceTargetRnd)}</strong>.`
      );
    }
    if (hasEquity) {
      interpLines.push(
        `Au prix actuel, le gain patrimonial est de <strong>${fmt(realistic)}/an</strong>, soit <strong>${roeReal.toFixed(2)}%/an</strong> sur votre apport de ${fmt(apport)} ` +
        `(à comparer aux <strong>${oppRate}%/an</strong> si vous laissiez l'apport placé).`
      );
    }

    return `
      <div class="price-target-container">
        <div class="price-target-card">

          <!-- Badge global -->
          <div class="price-target-badge ${badgeClass}">
            ${badgeText}
            ${
              hasEquity
                ? `&nbsp;(<span style="font-weight:600;">${fmt(realistic)}/an = ${roeReal.toFixed(2)}% sur apport</span>)`
                : ''
            }
          </div>

          <!-- Header -->
          <div class="price-target-header">
            <h2 class="price-target-title">
              🏠 Prix cible – Acheter ou louer (Résidence principale)
            </h2>
            <p class="price-target-subtitle">
              Comparaison annuelle entre l'achat au prix actuel (${fmt(currentPrice)}) 
              et la location au loyer de marché, en supposant que votre apport 
              (${fmt(apport)}) soit placé à ${oppRate}%/an.
            </p>
          </div>

          <!-- Disclaimer horizon -->
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

          <!-- HERO : 1 seul KPI = vue réaliste -->
          <div style="
            text-align:center;
            padding:20px 0 24px;
            border-bottom:1px solid rgba(148,163,184,0.15);
            margin-bottom:20px;
          ">
            <div style="
              font-size:0.85rem;
              text-transform:uppercase;
              letter-spacing:0.1em;
              color:#94a3b8;
              margin-bottom:6px;
            ">
              ${isRealPositive ? '✓ Enrichissement patrimonial (vue réaliste)' : '⚠ Appauvrissement patrimonial (vue réaliste)'}
            </div>
            <div style="
              font-size:2.6rem;
              font-weight:900;
              line-height:1;
              color:${isRealPositive ? '#22c55e' : '#ef4444'};
              margin-bottom:6px;
            ">
              ${realistic >= 0 ? '+' : '−'}${fmt(Math.abs(realistic))}
              <span style="font-size:1.1rem; opacity:0.7;">/an</span>
            </div>
            <div style="font-size:0.9rem; color:#94a3b8;">
              au prix actuel de ${fmt(currentPrice)} (après coût d'opportunité de l'apport à ${oppRate}%/an)
            </div>
            ${
              hasEquity
                ? `
            <div style="font-size:0.9rem; color:#64748b; margin-top:6px;">
              Rendement réel sur votre apport :
              <span style="font-weight:600; color:${roeReal >= 0 ? '#22c55e' : '#ef4444'};">
                ${roeReal >= 0 ? '+' : ''}${roeReal.toFixed(2)}%/an
              </span>
            </div>
            `
                : ''
            }
          </div>

          <!-- 🔄 Réconciliation Trésorerie vs Patrimoine -->
          <div class="cash-wealth-reconciliation" style="
            background: linear-gradient(135deg, rgba(239,68,68,0.03), rgba(34,197,94,0.04));
            border: 1px solid rgba(148,163,184,0.4);
            border-radius: 12px;
            padding: 16px 18px;
            margin-bottom: 20px;
          ">
            <h4 style="margin:0 0 10px; color:#64748b; font-size:0.95rem;">
              🔄 Trésorerie vs patrimoine
            </h4>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; align-items:center;">
              <!-- Colonne 1 : trésorerie -->
              <div style="text-align:center;">
                <div style="font-size:0.8rem; color:#94a3b8;">${monthlyLabel}</div>
                <div style="font-size:1.6rem; font-weight:700; color:${monthlyNet >= 0 ? '#ef4444' : '#22c55e'};">
                  ${monthlyNet >= 0 ? '-' : '+'}${this._formatCurrency(monthlyEffort).replace('€',' €')}
                </div>
                <div style="font-size:0.75rem; color:#94a3b8;">par mois vs location</div>
              </div>

              <!-- Flèche / explication -->
              <div style="text-align:center;">
                <div style="font-size:2rem; line-height:1;">→</div>
                <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">
                  dont environ<br>
                  <strong>${this._formatCurrency(monthlyCapital).replace('€',' €')}</strong><br>
                  de capital remboursé / mois
                </div>
              </div>

              <!-- Colonne 3 : enrichissement annuel -->
              <div style="text-align:center;">
                <div style="font-size:0.8rem; color:#94a3b8;">Enrichissement patrimonial (1 an)</div>
                <div style="font-size:1.6rem; font-weight:700; color:${realistic >= 0 ? '#22c55e' : '#ef4444'};">
                  ${realistic >= 0 ? '+' : '−'}${this._formatCurrency(Math.abs(realistic)).replace('€',' €')}
                </div>
                <div style="font-size:0.75rem; color:#94a3b8;">après coût d'opportunité</div>
              </div>
            </div>

            <div style="margin-top:10px; padding:8px 10px; background:rgba(248,250,252,0.8); border-radius:8px; font-size:0.8rem; color:#475569;">
              💡 <strong>Lecture :</strong> les ${this._formatCurrency(monthlyEffort).replace('€',' €')} de plus par mois ne sont pas "perdus" :
              une grande partie correspond à du capital remboursé. C'est ce qui explique un gain patrimonial net de 
              <strong>${realistic >= 0 ? '+' : '−'}${this._formatCurrency(Math.abs(realistic)).replace('€',' €')}/an</strong>
              par rapport à la location + placement de l'apport.
            </div>
          </div>

          <!-- Bloc : prix actuel vs prix d'équilibre -->
          <div class="price-comparison-grid" style="margin-bottom:24px;">
            <!-- Prix actuel -->
            <div class="price-box current ${isPriceUnderEquilibrium ? 'good' : 'bad'}">
              <div class="price-box-label">
                ${isPriceUnderEquilibrium ? '✓ Prix actuel' : '⚠ Prix actuel'}
              </div>
              <div class="price-box-amount">${fmt(currentPrice)}</div>
              <div class="price-box-detail ${isRealPositive ? 'positive' : 'negative'}">
                Enrichissement réaliste : 
                ${realistic >= 0 ? '+' : '−'}${fmt(Math.abs(realistic))}/an
              </div>
            </div>

            <!-- Flèche + gap -->
            <div class="price-arrow">
              <div class="arrow-icon ${isPriceUnderEquilibrium ? 'up' : 'down'}">
                ${isPriceUnderEquilibrium ? '↗' : '↘'}
              </div>
              <div class="arrow-label">
                <div class="gap-message ${isPriceUnderEquilibrium ? 'positive' : 'negative'}">
                  ${gapLabel}
                </div>
              </div>
            </div>

            <!-- Prix d'équilibre -->
            <div class="price-box target">
              <div class="price-box-label">🎯 Prix d'équilibre (horizon 1 an)</div>
              <div class="price-box-amount">
                ~${fmt(priceTargetRnd)}
              </div>
              <div class="price-box-detail neutral">
                Enrichissement réaliste : ≈ 0 €/an
              </div>
            </div>
          </div>

          <!-- Interprétation synthétique -->
          <div style="font-size:0.9rem; color:#475569; margin-bottom:20px;">
            <div style="font-weight:600; margin-bottom:4px;">💡 Interprétation</div>
            <ul style="margin:0 0 0 18px; padding:0; line-height:1.6;">
              ${interpLines.map(l => `<li>${l}</li>`).join('')}
            </ul>
          </div>

          <!-- Détail des flux annuels (accordion) -->
          <details style="margin-bottom:4px;">
            <summary style="cursor:pointer; font-size:0.9rem; color:#475569;">
              🔍 Voir le détail des flux annuels
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
                      <strong>= Enrichissement “comptable” (sans coût d'opportunité)</strong>
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
                      <strong>= Enrichissement “patrimonial” (vue réaliste)</strong>
                    </td>
                    <td style="padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4); text-align:right; font-weight:700;">
                      ${realistic >= 0 ? '+' : '−'}${fmt(Math.abs(realistic))}
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

  /**
   * Panneau d’analyse de sensibilité (3 scénarios)
   * @param {object} scenariosData - Retour de analyzer.analyzeScenarios(...)
   */
  _generateScenariosPanel(scenariosData) {
    if (!scenariosData || !scenariosData.scenarios) return '';

    const { scenarios, stats, currentPrice } = scenariosData;
    const fmt = v => this._formatCurrency(v);

    const rows = Object.values(scenarios).map(s => `
      <tr class="scenario-row scenario-${s.id}">
        <td>
          <div class="scenario-label">
            <div class="scenario-name">${s.name}</div>
            <div class="scenario-desc">${s.description}</div>
          </div>
        </td>
        <td style="text-align:right;"><strong>${fmt(s.priceTarget)}</strong></td>
        <td style="text-align:right;" class="${s.gap >= 0 ? 'negative' : 'positive'}">
          ${s.gapPercent >= 0 ? '+' : ''}${s.gapPercent.toFixed(1)}%
        </td>
        <td style="text-align:right;" class="${s.currentEnrichment >= 0 ? 'positive' : 'negative'}">
          ${s.currentEnrichment >= 0 ? '+' : ''}${fmt(s.currentEnrichment)}/an
        </td>
        <td style="text-align:right;" class="${s.cashflow >= 0 ? 'positive' : 'negative'}">
          ${s.cashflow >= 0 ? '+' : ''}${fmt(s.cashflow)}/an
        </td>
      </tr>
    `).join('');

    return `
      <div class="scenarios-panel">
        <div class="scenarios-header" onclick="window.toggleScenarios && window.toggleScenarios()">
          <h3 class="scenarios-title">📊 Analyse de sensibilité (3 scénarios)</h3>
          <button class="scenarios-toggle" type="button">
            <span id="scenarios-chevron">▼</span>
          </button>
        </div>

        <div class="scenarios-content" id="scenarios-content" style="display:none;">
          
          <div class="risk-profile risk-${stats.riskProfile.level}">
            <div class="risk-badge">${stats.riskProfile.label}</div>
            <p class="risk-message">${stats.riskProfile.message}</p>
          </div>

          <table class="scenarios-table">
            <thead>
              <tr>
                <th>Scénario</th>
                <th style="text-align:right;">Prix cible</th>
                <th style="text-align:right;">Écart vs prix actuel</th>
                <th style="text-align:right;">Enrichissement/an</th>
                <th style="text-align:right;">Cash-flow/an</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="scenarios-insights">
            <ul>
              <li>
                Fourchette de prix cible :
                <strong>${fmt(stats.priceRange.min)} – ${fmt(stats.priceRange.max)}</strong>
                (~${stats.priceRange.spreadPercent.toFixed(0)}% de dispersion autour du prix actuel ${fmt(currentPrice)}).
              </li>
              <li>
                Enrichissement potentiel (selon scénario) :
                <strong>${fmt(stats.enrichmentRange.min)} à ${fmt(stats.enrichmentRange.max)}/an</strong>.
              </li>
              ${stats.enrichmentRange.min < 0 ? `
              <li>
                ⚠️ En scénario pessimiste, prévoir une réserve d’environ 
                <strong>${fmt(Math.abs(stats.enrichmentRange.min))}/an</strong>.
              </li>` : ''}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  _attachScenarioToggle() {
    window.toggleScenarios = function() {
      const content = document.getElementById('scenarios-content');
      const chevron = document.getElementById('scenarios-chevron');
      if (!content || !chevron) return;
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      chevron.textContent = isHidden ? '▲' : '▼';
    };
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






