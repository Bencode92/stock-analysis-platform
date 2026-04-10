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

    // Injecter les projections séparément (évite le parsing HTML cassé)
    if (result.regimeId === 'rp') {
      const slot = document.getElementById('bvr-projection-slot');
      if (slot) {
        slot.innerHTML = this._generateBuyVsRentProjection(result);
      }
    } else {
      const slot = document.getElementById('locatif-projection-slot');
      if (slot) {
        slot.innerHTML = this._generateLocatifProjection(result);
      }
    }

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

          <!-- VERDICT INVESTISSEMENT -->
          ${this._generateVerdictBox(r)}

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

          <!-- Suggestion meilleur régime -->
          ${this._generateRegimeSuggestion(r)}
        </div>
      </div>

      <!-- Projection enrichissement multi-années (locatif) -->
      <div id="locatif-projection-slot"></div>
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
          <details style=”margin-bottom:4px;”>
            <summary style=”cursor:pointer; font-size:0.9rem; color:#475569;”>
              🔍 Voir le détail des flux annuels
            </summary>
            <div style=”margin-top:8px;”>
              <table style=”width:100%; border-collapse:collapse; font-size:0.9rem;”>
                <tbody>
                  <tr>
                    <td style=”padding:6px 4px;”>💰 Gain / perte de cash vs loyer</td>
                    <td style=”padding:6px 4px; text-align:right; font-weight:600; color:${deltaCash >= 0 ? '#16a34a' : '#b91c1c'};”>
                      ${deltaCash >= 0 ? '+' : '−'}${fmt(Math.abs(deltaCash))}
                    </td>
                  </tr>
                  <tr>
                    <td style=”padding:6px 4px;”>🏦 Capital remboursé</td>
                    <td style=”padding:6px 4px; text-align:right; font-weight:600; color:#16a34a;”>
                      +${fmt(Math.abs(capital))}
                    </td>
                  </tr>
                  <tr>
                    <td style=”padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4);”>
                      <strong>= Enrichissement “comptable” (sans coût d'opportunité)</strong>
                    </td>
                    <td style=”padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4); text-align:right; font-weight:700;”>
                      ${simple >= 0 ? '+' : '−'}${fmt(Math.abs(simple))}
                    </td>
                  </tr>
                  <tr>
                    <td style=”padding:6px 4px; color:#b91c1c;”>📉 Coût d'opportunité de l'apport</td>
                    <td style=”padding:6px 4px; text-align:right; font-weight:600; color:#b91c1c;”>
                      −${fmt(Math.abs(oppCost))}
                    </td>
                  </tr>
                  <tr>
                    <td style=”padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4);”>
                      <strong>= Enrichissement “patrimonial” (vue réaliste)</strong>
                    </td>
                    <td style=”padding:6px 4px; border-top:1px solid rgba(148,163,184,0.4); text-align:right; font-weight:700;”>
                      ${realistic >= 0 ? '+' : '−'}${fmt(Math.abs(realistic))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

        </div>
      </div>

      <!-- placeholder projection -->
      <div id="bvr-projection-slot"></div>
    `;
  }

  /**
   * Projection multi-années : patrimoine Propriétaire vs Locataire
   * Locataire : place l'apport + les économies mensuelles
   * Propriétaire : valeur du bien − capital restant dû
   */
  _generateBuyVsRentProjection(r) {
    const fmt = (v) => this._formatCurrency(v);
    const currentPrice = Number(r.currentPrice ?? 0);
    const apport       = Number(r.rpApport ?? 0);
    const oppRate      = Number(r.rpOpportunityRate ?? 3) / 100;    // ex: 0.03
    const appreciation = 0.02;                                       // 2%/an appréciation immobilière
    const rentInflation = 0.015;                                     // 1.5%/an hausse loyers
    const mensualite   = Number(r.rpMensualite ?? r.currentMonthlyCost ?? 0) + Number(r.rpCharges ?? 0);
    const loyerMarche  = Number(r.rpLoyerMarche ?? 0);
    const partner      = Number(r.rpPartner ?? 0);
    const capital      = Number(r.rpCapitalAnnual ?? 0);
    const taux         = Number(r.rpTaux ?? 3.5);
    const duree        = Number(r.rpDuree ?? 20);
    const emprunt      = Number(r._baseInput?.loanAmount ?? r._baseInput?.montantEmprunt ?? (currentPrice - apport));

    if (!currentPrice || !loyerMarche) {
      return '<div style=”color:#94a3b8; text-align:center; padding:16px;”>Données insuffisantes pour la projection.</div>';
    }

    // Calcul de la mensualité du prêt
    const tauxM = taux / 100 / 12;
    const nbMens = duree * 12;
    const mensu = tauxM > 0
      ? (emprunt * tauxM) / (1 - Math.pow(1 + tauxM, -nbMens))
      : emprunt / nbMens;

    // Charges propriétaire mensuelles (hors mensualité prêt)
    const chargesProprio = Number(r.rpCharges ?? 200);

    // Coût total mensuel proprio (hors partner)
    const coutProprioMensuel = mensu + chargesProprio;

    // Projection sur les horizons clés
    const horizons = [1, 3, 5, 7, 10, 15, 20, 25];
    const rows = [];
    let breakEvenYear = null;

    let capitalRestant = emprunt;

    for (let year = 1; year <= Math.max(25, duree); year++) {
      // ── LOCATAIRE ──
      // Loyer annuel (avec inflation)
      const loyerAnnee = (loyerMarche * 12) * Math.pow(1 + rentInflation, year - 1);
      const loyerNetConjoint = loyerAnnee - (partner * 12);

      // Patrimoine locataire = apport composé + économies accumulées
      const patrimoineLocataire = apport * Math.pow(1 + oppRate, year);

      // ── PROPRIÉTAIRE ──
      // Valeur du bien (avec appréciation)
      const valeurBien = currentPrice * Math.pow(1 + appreciation, year);

      // Capital restant dû (amortissement simplifié)
      if (year <= duree) {
        const interetsAnnee = capitalRestant * (taux / 100);
        const capitalRembourse = (mensu * 12) - interetsAnnee;
        capitalRestant = Math.max(0, capitalRestant - capitalRembourse);
      } else {
        capitalRestant = 0;
      }

      // Patrimoine propriétaire = valeur bien − capital restant dû
      const patrimoineProprio = valeurBien - capitalRestant;

      // Avantage = patrimoine proprio − patrimoine locataire
      const avantageAchat = patrimoineProprio - patrimoineLocataire;

      // Détecter le point de bascule
      if (breakEvenYear === null && avantageAchat > 0) {
        breakEvenYear = year;
      }

      if (horizons.includes(year) || year === breakEvenYear) {
        rows.push({
          year,
          patrimoineLocataire: Math.round(patrimoineLocataire),
          patrimoineProprio: Math.round(patrimoineProprio),
          valeurBien: Math.round(valeurBien),
          capitalRestant: Math.round(capitalRestant),
          avantageAchat: Math.round(avantageAchat),
          isBreakEven: year === breakEvenYear
        });
      }
    }

    // Construire le HTML
    const breakEvenMsg = breakEvenYear
      ? `<span style=”color:#22c55e; font-weight:700;”>L'achat devient plus rentable à partir de l'année ${breakEvenYear}</span>`
      : `<span style=”color:#ef4444; font-weight:600;”>L'achat ne rattrape pas la location sur ${duree} ans avec ces hypothèses</span>`;

    const tdS = 'display:table-cell;padding:12px 16px;border:none;font-variant-numeric:tabular-nums';
    let tableRows = rows.map((row, idx) => {
      const isPos = row.avantageAchat >= 0;
      const isBE = row.isBreakEven;
      const trBg = isBE
        ? 'background:rgba(34,197,94,0.15);border-left:3px solid #22c55e'
        : (idx%2===0 ? 'background:rgba(255,255,255,0.03)' : '');
      const fw = isBE ? ';font-weight:700' : '';
      return `<tr style=”display:table-row;${trBg}”>` +
        `<td style=”${tdS};text-align:left;color:#fff${fw}”>${isBE?'🏆 ':''}An ${row.year}</td>` +
        `<td style=”${tdS};text-align:right;color:#60a5fa;font-weight:600”>${fmt(row.patrimoineLocataire)}</td>` +
        `<td style=”${tdS};text-align:right;color:#4ade80;font-weight:600”>${fmt(row.patrimoineProprio)}</td>` +
        `<td style=”${tdS};text-align:right;color:${isPos?'#22c55e':'#ef4444'};font-weight:700”>${isPos?'+':'−'}${fmt(Math.abs(row.avantageAchat))}</td>` +
        `</tr>`;
    }).join('\n');

    // Styles inline (le fichier CSS externe peut ne pas être chargé/caché)
    const S = {
      wrap: 'margin-top:30px;padding:28px 32px;background:linear-gradient(135deg,rgba(10,15,30,0.97),rgba(15,25,50,0.92));border:1px solid rgba(0,191,255,0.25);border-radius:16px;width:100%;box-sizing:border-box;box-shadow:0 8px 32px rgba(0,0,0,0.3)',
      h4: 'margin:0 0 8px;color:#e2e8f0;font-size:1.2rem;font-weight:700',
      sub: 'font-size:0.82rem;color:rgba(255,255,255,0.45);margin-bottom:20px;line-height:1.5',
      beOk: 'text-align:center;padding:16px 24px;margin-bottom:20px;border-radius:12px;font-size:1.1rem;font-weight:600;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e',
      beNo: 'text-align:center;padding:16px 24px;margin-bottom:20px;border-radius:12px;font-size:1.1rem;font-weight:600;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444',
      tbl: 'display:table;width:100%;border-collapse:separate;border-spacing:0 3px;font-size:0.9rem;table-layout:fixed;margin-top:8px',
      th: 'display:table-cell;padding:12px 16px;border:none;border-bottom:2px solid rgba(0,191,255,0.3);color:rgba(255,255,255,0.5);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.8px;font-weight:600',
      td: 'display:table-cell;padding:12px 16px;border:none;color:#e2e8f0;font-variant-numeric:tabular-nums',
      foot: 'margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.72rem;color:rgba(255,255,255,0.3);text-align:center;line-height:1.5'
    };

    return `
      <div style=”${S.wrap}”>
        <h4 style=”${S.h4}”>
          <i class=”fas fa-chart-line” style=”color:#00bfff;margin-right:8px”></i>
          Acheter vs Louer + placer l'apport
        </h4>
        <div style=”${S.sub}”>
          Appréciation ${(appreciation*100).toFixed(0)}%/an · Loyers +${(rentInflation*100).toFixed(1)}%/an · Placement ${(oppRate*100).toFixed(0)}%/an · Conjoint ${fmt(partner)}/mois
        </div>

        <div style=”${breakEvenYear ? S.beOk : S.beNo}”>
          ${breakEvenMsg}
        </div>

        <table style=”${S.tbl}”>
          <colgroup><col style=”width:18%”><col style=”width:27%”><col style=”width:27%”><col style=”width:28%”></colgroup>
          <thead><tr style=”display:table-row”>
            <th style=”${S.th};text-align:left”>Horizon</th>
            <th style=”${S.th};text-align:right;color:#60a5fa”>Locataire</th>
            <th style=”${S.th};text-align:right;color:#4ade80”>Propriétaire</th>
            <th style=”${S.th};text-align:right”>Δ Avantage</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>

        <div style=”${S.foot}”>
          Projection simplifiée hors fiscalité (pas d'impôt sur PV immobilière pour RP, pas d'impôt sur revenus de placement).
        </div>
      </div>
    `;
  }

  // 📊 Verdict investissement (locatif)
  _generateVerdictBox(r) {
    const fmt = (v) => this._formatCurrency(v);
    const enrichment = Number(r.currentEnrichment ?? 0);
    const gap = Number(r.gap ?? 0);
    const gapPct = Math.abs(Number(r.gapPercent ?? 0));
    const equity = Number(r.apport ?? 0);
    const roe = equity > 0 ? (enrichment / equity) * 100 : 0;
    const cf = Number(r.currentBreakdown?.cashflow ?? 0);
    const cfMensuel = Math.round(cf / 12);
    const isPriceGood = gap < 0;

    // Calculer la projection 20 ans (simplifié)
    const appreciation = 0.02;
    const currentPrice = Number(r.currentPrice ?? 0);
    const pvLatente20 = currentPrice * (Math.pow(1 + appreciation, 20) - 1);
    const enrichTotal20 = (enrichment * 20) + pvLatente20;

    // Suggestion régime
    let bestRegimeMsg = '';
    try {
      const analyzer = this.analyzer?.analyzer;
      if (analyzer?._computeBestRegimeCFAnnuel && r._baseInput) {
        const params = analyzer.getAllAdvancedParams?.() || {};
        const best = analyzer._computeBestRegimeCFAnnuel(
          analyzer._buildInputForPrice(r._baseInput, currentPrice, params), params
        );
        const currentKey = analyzer.normalizeRegimeKey?.({ id: r.regimeId }) || r.regimeId;
        if (best?.regimeId && best.regimeId !== currentKey) {
          const registry = analyzer.getRegimeRegistry?.() || {};
          const bestNom = registry[best.regimeId]?.nom || best.regimeNom;
          const bestEnrich = best.cashflowAnnuel + (Number(r.currentBreakdown?.capital ?? 0));
          const delta = bestEnrich - enrichment;
          if (delta > 0) {
            bestRegimeMsg = `<strong style="color:#22c55e">${bestNom}</strong> donnerait +${fmt(delta)}/an de mieux`;
          }
        }
      }
    } catch(e) {}

    // Construire les lignes de verdict avec interprétation
    const lines = [];

    // 1. Prix
    if (isPriceGood) {
      const margeMsg = gapPct > 30
        ? 'Excellente affaire — vous avez une grosse marge de sécurité.'
        : gapPct > 10
          ? 'Bon prix — vous êtes bien positionné.'
          : 'Prix correct — peu de marge mais l\'opération reste positive.';
      lines.push({ icon: 'fa-tag', color: '#22c55e',
        text: `<strong>Prix :</strong> ${gapPct.toFixed(0)}% sous l'équilibre (marge de ${fmt(Math.abs(gap))})`,
        explain: margeMsg });
    } else if (gapPct < 5) {
      lines.push({ icon: 'fa-tag', color: '#f59e0b',
        text: `<strong>Prix :</strong> proche de l'équilibre (${gapPct.toFixed(0)}% au-dessus)`,
        explain: 'À ce prix, vous ne gagnez ni ne perdez. Négociez si possible.' });
    } else {
      lines.push({ icon: 'fa-tag', color: '#ef4444',
        text: `<strong>Prix :</strong> ${gapPct.toFixed(0)}% au-dessus de l'équilibre (surcoût ${fmt(Math.abs(gap))})`,
        explain: `Vous surpayez de ${fmt(Math.abs(gap))}. Pour que l'opération soit rentable, visez ${fmt(Number(r.priceTarget ?? 0))} ou changez de régime fiscal.` });
    }

    // 2. Enrichissement
    if (enrichment > 0) {
      const enrichMensuel = Math.round(enrichment / 12);
      const enrichMsg = roe > 5
        ? `Très bon rendement — vous construisez ${fmt(enrichMensuel)}/mois de patrimoine net.`
        : roe > 2
          ? `Rendement correct — c'est l'équivalent de ${fmt(enrichMensuel)}/mois d'épargne forcée.`
          : `Rendement modeste — mais vous construisez du patrimoine (${fmt(enrichMensuel)}/mois).`;
      lines.push({ icon: 'fa-chart-line', color: '#22c55e',
        text: `<strong>Enrichissement :</strong> +${fmt(enrichment)}/an (${roe >= 0 ? '+' : ''}${roe.toFixed(1)}% sur apport)`,
        explain: enrichMsg });
    } else {
      lines.push({ icon: 'fa-chart-line', color: '#ef4444',
        text: `<strong>Enrichissement :</strong> ${fmt(enrichment)}/an`,
        explain: `Vous perdez ${fmt(Math.abs(enrichment))}/an. Le bien coûte plus qu'il ne rapporte. Changez de régime ou négociez le prix.` });
    }

    // 3. Patrimoine 20 ans
    const enrichMsg20 = enrichTotal20 > 100000
      ? `Sur 20 ans, votre patrimoine immobilier prend ${fmt(enrichTotal20)} de valeur. C'est un investissement patrimonial solide.`
      : enrichTotal20 > 0
        ? `Gain modeste mais positif sur 20 ans. La plus-value immobilière compense les cash-flows négatifs.`
        : `Attention : même sur 20 ans, l'opération est déficitaire avec ces hypothèses.`;
    lines.push({ icon: 'fa-building', color: '#60a5fa',
      text: `<strong>Patrimoine 20 ans :</strong> enrichissement total estimé ${enrichTotal20 >= 0 ? '+' : ''}${fmt(enrichTotal20)}`,
      explain: enrichMsg20 });

    // 4. Cash-flow
    if (cfMensuel >= 0) {
      lines.push({ icon: 'fa-wallet', color: '#22c55e',
        text: `<strong>Cash-flow :</strong> +${fmt(Math.abs(cfMensuel))}/mois`,
        explain: 'Le bien s\'autofinance — les loyers couvrent toutes les charges et le crédit. Aucun effort de trésorerie.' });
    } else {
      const effortMsg = Math.abs(cfMensuel) > 500
        ? `Effort important : vérifiez que votre budget supporte ${fmt(Math.abs(cfMensuel))}/mois pendant ${Number(r._baseInput?.loanDuration ?? 20)} ans.`
        : Math.abs(cfMensuel) > 200
          ? `Effort modéré. C'est de l'épargne forcée : une partie rembourse le capital de votre bien.`
          : `Effort faible — le bien est presque autofinancé.`;
      lines.push({ icon: 'fa-wallet', color: cfMensuel > -200 ? '#f59e0b' : '#ef4444',
        text: `<strong>Cash-flow :</strong> ${fmt(cfMensuel)}/mois d'effort`,
        explain: effortMsg });
    }

    // 5. Suggestion régime
    if (bestRegimeMsg) {
      lines.push({ icon: 'fa-lightbulb', color: '#a78bfa',
        text: `<strong>Optimisation :</strong> ${bestRegimeMsg}`,
        explain: 'Un changement de régime fiscal pourrait significativement améliorer la rentabilité de votre investissement.' });
    } else {
      lines.push({ icon: 'fa-check-circle', color: '#22c55e',
        text: `<strong>Régime :</strong> ${r.regimeUsed} est déjà optimal`,
        explain: 'Vous avez le meilleur régime fiscal pour ce bien. Aucune optimisation supplémentaire possible.' });
    }

    const linesHTML = lines.map(l => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <i class="fas ${l.icon}" style="color:${l.color};margin-top:3px;width:16px;text-align:center;flex-shrink:0"></i>
        <div>
          <div style="color:#e2e8f0;font-size:0.9rem;line-height:1.4">${l.text}</div>
          <div style="color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1.4;margin-top:2px">${l.explain}</div>
        </div>
      </div>
    `).join('');

    return `
      <div style="
        margin-bottom:20px;padding:18px 22px;
        background:linear-gradient(135deg,rgba(0,191,255,0.04),rgba(99,102,241,0.04));
        border:1px solid rgba(0,191,255,0.2);border-radius:12px;
      ">
        <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.4);margin-bottom:10px;font-weight:600;">
          <i class="fas fa-clipboard-check" style="margin-right:6px"></i>Verdict investissement
        </div>
        ${linesHTML}
      </div>
    `;
  }

  // 💡 Suggestion du meilleur régime (locatif)
  _generateRegimeSuggestion(r) {
    try {
      const analyzer = this.analyzer?.analyzer;
      if (!analyzer?._computeBestRegimeCFAnnuel) return '';

      const baseInput = r._baseInput;
      if (!baseInput) return '';

      const params = analyzer.getAllAdvancedParams?.() || {};
      const best = analyzer._computeBestRegimeCFAnnuel(
        analyzer._buildInputForPrice(baseInput, r.currentPrice, params),
        params
      );

      if (!best?.regimeId) return '';

      const currentKey = analyzer.normalizeRegimeKey?.({ id: r.regimeId }) || r.regimeId;
      if (best.regimeId === currentKey) return ''; // Déjà le meilleur

      const fmt = (v) => this._formatCurrency(v);
      const bestEnrich = best.cashflowAnnuel + (r.currentBreakdown?.capital ?? 0);
      const delta = bestEnrich - (r.currentEnrichment || 0);

      if (delta <= 0) return '';

      const registry = analyzer.getRegimeRegistry?.() || {};
      const bestNom = registry[best.regimeId]?.nom || best.regimeNom || best.regimeId;

      return `
        <div style="
          margin-top:16px;padding:14px 18px;
          background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(34,197,94,0.06));
          border:1px solid rgba(99,102,241,0.25);border-radius:12px;
        ">
          <div style="font-size:0.85rem;color:#6366f1;font-weight:600;margin-bottom:6px;">
            <i class="fas fa-lightbulb" style="margin-right:6px;"></i>Suggestion de régime
          </div>
          <div style="font-size:0.9rem;color:#e2e8f0;line-height:1.5;">
            En passant en <strong style="color:#22c55e;">${bestNom}</strong>,
            votre enrichissement passerait à
            <strong style="color:#22c55e;">${bestEnrich >= 0 ? '+' : ''}${fmt(bestEnrich)}/an</strong>
            soit <strong style="color:#22c55e;">+${fmt(delta)}/an</strong> de mieux.
          </div>
        </div>`;
    } catch(e) {
      console.warn('Suggestion régime erreur:', e);
      return '';
    }
  }

  // 📈 Projection enrichissement multi-années (locatif)
  _generateLocatifProjection(r) {
    const fmt = (v) => this._formatCurrency(v);
    const currentPrice = Number(r.currentPrice ?? 0);
    const cfAnnuelAn1 = Number(r.currentBreakdown?.cashflow ?? 0);
    const capAnnuelAn1 = Number(r.currentBreakdown?.capital ?? 0);
    const enrichAn1 = Number(r.currentEnrichment ?? 0);
    const apport = Number(r.apport ?? 0);
    const taux = Number(r._baseInput?.loanRate ?? r._baseInput?.taux ?? 3.5);
    const duree = Number(r._baseInput?.loanDuration ?? r._baseInput?.duree ?? 20);
    const loyerAnnuel = Number(r._baseInput?.loyerHC ?? 0) * 12;
    const emprunt = Number(r._baseInput?.loanAmount ?? r._baseInput?.montantEmprunt ?? (currentPrice - apport));
    const regimeNom = r.regimeUsed || r.regimeId || '?';

    // Hypothèses paramétrables
    const appreciation = 0.02;    // Appréciation immobilière
    const hausseLoyers = 0.015;   // Hausse loyers annuelle
    const chargesInflation = 0.02; // Hausse charges

    if (!currentPrice) return '';

    const tauxM = taux / 100 / 12;
    const nbMens = duree * 12;
    const mensu = tauxM > 0 ? (emprunt * tauxM) / (1 - Math.pow(1 + tauxM, -nbMens)) : emprunt / nbMens;
    const mensualiteAn = mensu * 12;

    // Décomposer le CF de l'an 1 pour recalculer avec hausse loyer
    // CF = loyer_net - charges - impôts - mensualité
    // Le "surplus" hors loyer = CF - loyer_net + mensualité = -(charges + impôts)
    const chargesEtImpotsAn1 = loyerAnnuel - cfAnnuelAn1 - mensualiteAn;

    const horizons = [1, 3, 5, 7, 10, 15, 20, 25];
    const rows = [];
    let capitalRestant = emprunt;
    let cfCumul = 0;
    let breakEvenYear = null;

    for (let year = 1; year <= Math.max(25, duree); year++) {
      // Valeur du bien
      const valeurBien = currentPrice * Math.pow(1 + appreciation, year);

      // Capital restant dû
      if (year <= duree) {
        const interets = capitalRestant * (taux / 100);
        const capitalRembourse = mensualiteAn - interets;
        capitalRestant = Math.max(0, capitalRestant - capitalRembourse);
      } else {
        capitalRestant = 0;
      }

      // Loyer avec hausse annuelle
      const loyerAnnee = loyerAnnuel * Math.pow(1 + hausseLoyers, year - 1);

      // Charges et impôts avec inflation
      const chargesAnnee = chargesEtImpotsAn1 * Math.pow(1 + chargesInflation, year - 1);

      // Mensualité (fixe si crédit en cours, 0 après)
      const mensAnnee = year <= duree ? mensualiteAn : 0;

      // Cash-flow de l'année = loyer - charges_et_impots - mensualité
      const cfAnnee = loyerAnnee - chargesAnnee - mensAnnee;
      cfCumul += cfAnnee;

      // PV latente
      const pvLatente = valeurBien - currentPrice;

      // Patrimoine = valeur - dette
      const patrimoine = valeurBien - capitalRestant;

      // Enrichissement total = CF cumulé + PV latente
      const enrichTotal = cfCumul + pvLatente;

      // Point de bascule (si CF cumulé négatif → positif)
      if (breakEvenYear === null && cfCumul > 0 && cfAnnuelAn1 < 0) {
        breakEvenYear = year;
      }

      if (horizons.includes(year) || year === breakEvenYear) {
        rows.push({
          year,
          patrimoine: Math.round(patrimoine),
          cfAnnee: Math.round(cfAnnee),
          cfCumul: Math.round(cfCumul),
          pvLatente: Math.round(pvLatente),
          enrichTotal: Math.round(enrichTotal),
          isBreakEven: year === breakEvenYear
        });
      }
    }

    // Résumé 20 ans
    const row20 = rows.find(r => r.year === 20) || rows[rows.length - 1];

    const S = {
      wrap: 'margin-top:30px;padding:28px 32px;background:linear-gradient(135deg,rgba(10,15,30,0.97),rgba(15,25,50,0.92));border:1px solid rgba(0,191,255,0.25);border-radius:16px;width:100%;box-sizing:border-box;box-shadow:0 8px 32px rgba(0,0,0,0.3)',
      h4: 'margin:0 0 8px;color:#e2e8f0;font-size:1.2rem;font-weight:700',
      sub: 'font-size:0.82rem;color:rgba(255,255,255,0.45);margin-bottom:16px;line-height:1.5',
      summary: 'text-align:center;padding:16px 24px;margin-bottom:16px;border-radius:12px;font-size:1rem',
      tbl: 'display:table;width:100%;border-collapse:separate;border-spacing:0 3px;font-size:0.9rem;table-layout:fixed;margin-top:8px',
      th: 'display:table-cell;padding:12px 14px;border:none;border-bottom:2px solid rgba(0,191,255,0.3);color:rgba(255,255,255,0.5);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.6px;font-weight:600',
      td: 'display:table-cell;padding:12px 14px;border:none;color:#e2e8f0;font-variant-numeric:tabular-nums',
      foot: 'margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.72rem;color:rgba(255,255,255,0.3);text-align:center;line-height:1.5'
    };

    const tableRows = rows.map((row, idx) => {
      const isPos = row.enrichTotal >= 0;
      const isBE = row.isBreakEven;
      const trBg = isBE
        ? 'background:rgba(34,197,94,0.15);border-left:3px solid #22c55e'
        : (idx % 2 === 0 ? 'background:rgba(255,255,255,0.03)' : '');
      const fw = isBE ? ';font-weight:700' : '';
      return `<tr style="display:table-row;${trBg}">` +
        `<td style="${S.td};text-align:left;color:#fff${fw}">${isBE ? '🏆 ' : ''}An ${row.year}</td>` +
        `<td style="${S.td};text-align:right;color:#4ade80;font-weight:600">${fmt(row.patrimoine)}</td>` +
        `<td style="${S.td};text-align:right;color:${row.cfAnnee >= 0 ? '#22c55e' : '#f59e0b'};font-weight:500">${row.cfAnnee >= 0 ? '+' : ''}${fmt(row.cfAnnee)}</td>` +
        `<td style="${S.td};text-align:right;color:${row.cfCumul >= 0 ? '#22c55e' : '#ef4444'};font-weight:600">${row.cfCumul >= 0 ? '+' : ''}${fmt(row.cfCumul)}</td>` +
        `<td style="${S.td};text-align:right;color:#60a5fa;font-weight:500">+${fmt(row.pvLatente)}</td>` +
        `<td style="${S.td};text-align:right;color:${isPos ? '#22c55e' : '#ef4444'};font-weight:700">${isPos ? '+' : ''}${fmt(row.enrichTotal)}</td>` +
        `</tr>`;
    }).join('\n');

    // Message résumé
    const summaryColor = (row20?.enrichTotal || 0) >= 0 ? '#22c55e' : '#ef4444';
    const summaryBg = (row20?.enrichTotal || 0) >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
    const summaryBorder = (row20?.enrichTotal || 0) >= 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';

    return `
      <div style="${S.wrap}">
        <h4 style="${S.h4}">
          <i class="fas fa-chart-line" style="color:#00bfff;margin-right:8px"></i>
          Projection enrichissement — ${regimeNom}
        </h4>
        <div style="${S.sub}">
          Appréciation bien ${(appreciation * 100).toFixed(0)}%/an · Hausse loyers +${(hausseLoyers * 100).toFixed(1)}%/an · Hausse charges +${(chargesInflation * 100).toFixed(0)}%/an · Apport ${fmt(apport)}
        </div>

        <div style="${S.summary};background:${summaryBg};border:1px solid ${summaryBorder}">
          <span style="color:${summaryColor};font-weight:700">
            Sur 20 ans : patrimoine ${fmt(row20?.patrimoine || 0)} € · enrichissement total ${(row20?.enrichTotal || 0) >= 0 ? '+' : ''}${fmt(row20?.enrichTotal || 0)} €
          </span>
          ${breakEvenYear && cfAnnuelAn1 < 0 ? `<br><span style="color:#22c55e;font-size:0.85rem">Cash-flow cumulé positif à partir de l'année ${breakEvenYear}</span>` : ''}
        </div>

        <table style="${S.tbl}">
          <colgroup><col style="width:12%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:16%"><col style="width:18%"></colgroup>
          <thead><tr style="display:table-row">
            <th style="${S.th};text-align:left">Horizon</th>
            <th style="${S.th};text-align:right;color:#4ade80">Patrimoine</th>
            <th style="${S.th};text-align:right">CF/an</th>
            <th style="${S.th};text-align:right">CF cumulé</th>
            <th style="${S.th};text-align:right;color:#60a5fa">PV latente</th>
            <th style="${S.th};text-align:right">Enrichissement</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>

        <div style="${S.foot}">
          Loyers : +${(hausseLoyers * 100).toFixed(1)}%/an (IRL). Charges/impôts : +${(chargesInflation * 100).toFixed(0)}%/an. Mensualité fixe pendant ${duree} ans puis 0.
          PV latente hors fiscalité plus-value. Après le crédit, le CF annuel augmente fortement.
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






