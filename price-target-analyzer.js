(function () {
  'use strict';

  class PriceTargetAnalyzer {
    constructor(fiscalAnalyzer) {
      this.analyzer = fiscalAnalyzer;
      this.cache = new Map();
    }

    calculatePriceTarget(baseInput, targetEnrichment = 0, opts = {}) {
      const cacheKey = this._getCacheKey(baseInput, targetEnrichment, opts);
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

      const currentPrice = Number(baseInput.price ?? baseInput.prixBien ?? 0);
      const regimeId = opts.regimeId || this.analyzer.getSelectedRegime();

      const currentEnrichment = this._computeEnrichmentAtPrice(baseInput, currentPrice, regimeId);
      const targetResult = this._solveForEnrichment(baseInput, targetEnrichment, regimeId, opts);

      const gap = currentPrice - targetResult.price;
      const gapPercent = this._safeDiv(gap, currentPrice) * 100;

      const result = {
        currentPrice: Math.round(currentPrice),
        priceTarget: Math.round(targetResult.price),
        gap: Math.round(gap),
        gapPercent: Math.round(gapPercent * 100) / 100,
        currentEnrichment: Math.round(currentEnrichment.enrichment),
        targetEnrichment: Math.round(targetEnrichment),
        enrichmentGain: Math.round(targetResult.enrichment - currentEnrichment.enrichment),
        regimeUsed: targetResult.regimeNom,
        regimeId: targetResult.regimeId,

        infeasible: !!targetResult.infeasible,
        infeasibleType: targetResult.infeasibleType ?? null,
        outOfRange: !!targetResult.outOfRange,
        outOfRangeType: targetResult.outOfRangeType ?? null,
        solveReason: targetResult.reason ?? null,

        // Exposer l’apport pour l’UI
        apport: Number(baseInput.apport ?? 0),

        targetBreakdown: {
          cashflow: Math.round(targetResult.cashflow),
          capital: Math.round(targetResult.capital),
          enrichment: Math.round(targetResult.enrichment)
        },
        currentBreakdown: {
          cashflow: Math.round(currentEnrichment.cashflow),
          capital: Math.round(currentEnrichment.capital),
          enrichment: Math.round(currentEnrichment.enrichment)
        },
        recommendation: this._generateRecommendation(
          gap,
          gapPercent,
          targetResult.enrichment,
          targetResult.regimeNom,
          targetResult.infeasible,
          targetResult.outOfRange,
          targetResult.outOfRangeType
        )
      };

      this.cache.set(cacheKey, result);
      return result;
    }

    _computeEnrichmentAtPrice(baseInput, price, regimeId) {
      const params = this.analyzer.getAllAdvancedParams?.() || {};
      const input = this.analyzer._buildInputForPrice(baseInput, price, params);

      const registry = this.analyzer.getRegimeRegistry();
      const key = this.analyzer.normalizeRegimeKey({ id: regimeId });
      const meta = registry[key];

      const calc = this.analyzer.getDetailedCalculations(meta, input, params, {
        mensualite: Number(input.monthlyPayment ?? 0),
        tableauAmortissement: null
      });

      const cf = Number(calc.cashflowNetAnnuel || 0);
      const cap = Number(calc.capitalAnnuel || 0);

      return {
        regimeId: key,
        regimeNom: meta?.nom || key,
        cashflow: cf,
        capital: cap,
        enrichment: cf + cap
      };
    }

    _solveForEnrichment(baseInput, targetEnrichment, regimeId, opts = {}) {
      const p0 = Number(baseInput.price ?? baseInput.prixBien ?? 0) || 0;
      let lo = Math.max(1, p0 * 0.3);   // ~ -70% sous le prix actuel
      let hi = Math.max(2, p0 * 2.0);   // ~ 2x le prix actuel

      const maxIter = Number(opts.maxIter ?? 80);
      const tol = Number(opts.tol ?? 1);

      // 1) Borne basse : bien structurellement trop peu rentable
      const resLo = this._computeEnrichmentAtPrice(baseInput, lo, regimeId);
      if (resLo.enrichment + tol < targetEnrichment) {
        return {
          ...resLo,
          price: lo,
          infeasible: true,
          infeasibleType: 'underperforming',
          outOfRange: false,
          outOfRangeType: null,
          reason: 'Bien structurellement peu rentable - même à ~30% du prix actuel l\'enrichissement reste sous la cible'
        };
      }

      // 2) Borne haute : bien "trop rentable" dans la plage testée
      const resHi = this._computeEnrichmentAtPrice(baseInput, hi, regimeId);
      if (resHi.enrichment > targetEnrichment + tol) {
        return {
          ...resHi,
          price: hi,
          infeasible: false,
          infeasibleType: null,
          outOfRange: true,
          outOfRangeType: 'overperforming',
          reason: 'Bien exceptionnellement rentable - le prix d\'équilibre serait > ~2x le prix actuel'
        };
      }

      // 3) Bisection classique dans [lo, hi]
      let best = null;

      for (let i = 0; i < maxIter; i++) {
        const mid = (lo + hi) / 2;
        const cur = this._computeEnrichmentAtPrice(baseInput, mid, regimeId);
        const diff = cur.enrichment - targetEnrichment;

        if (!best || Math.abs(diff) < Math.abs(best.enrichment - targetEnrichment)) {
          best = { ...cur, price: mid };
        }

        if (Math.abs(diff) <= tol) break;

        // Hypothèse : enrichissement décroît quand le prix augmente
        if (cur.enrichment > targetEnrichment) {
          // Trop d'enrichissement → on peut payer plus cher
          lo = mid;
        } else {
          // Enrichissement insuffisant → on doit baisser le prix
          hi = mid;
        }
      }

      // Sécurisation : si best reste null, on renvoie la borne basse "safe"
      if (!best) {
        return {
          ...resLo,
          price: lo,
          infeasible: true,
          infeasibleType: 'underperforming',
          outOfRange: false,
          outOfRangeType: null,
          reason: 'Impossible de trouver un prix d\'équilibre dans la plage testée'
        };
      }

      return {
        ...best,
        infeasible: false,
        infeasibleType: null,
        outOfRange: false,
        outOfRangeType: null,
        reason: null
      };
    }

    // ✅ RP avec enrichissement complet (Δcash + capital − coût d’opportunité)
    calculateRPPriceEquilibrium(baseInput, opts = {}) {
      const params = this._buildRPParams(baseInput, opts);
      const targetResult = this._solveRPPrice(baseInput, params);

      const currentPrice = Number(baseInput.price ?? baseInput.prixBien ?? 0);
      const currentCost  = this._computeRPCostAtPrice(baseInput, currentPrice, params);

      const gap = currentPrice - targetResult.price;
      const gapPercent = this._safeDiv(gap, currentPrice) * 100;

      return {
        currentPrice: Math.round(currentPrice),
        priceTarget: Math.round(targetResult.price),
        gap: Math.round(gap),
        gapPercent: Math.round(gapPercent * 100) / 100,

        // Coût mensuel vs loyer (logique historique)
        currentMonthlyCost: Math.round(currentCost.net),
        targetMonthlyCost: 0,
        regimeUsed: 'Résidence Principale',
        regimeId: 'rp',
        infeasible: !!targetResult.infeasible,

        // Décomposition mensuelle (inchangée)
        targetBreakdown: {
          mensualite: Math.round(targetResult.mensualite),
          chargesMensuelles: Math.round(targetResult.charges),
          loyerMarche: Math.round(params.loyerMarche),
          partnerContribution: Math.round(params.partner)
        },
        currentBreakdown: {
          mensualite: Math.round(currentCost.mensualite),
          chargesMensuelles: Math.round(currentCost.charges),
          loyerMarche: Math.round(params.loyerMarche),
          partnerContribution: Math.round(params.partner)
        },

        // ENRICHISSEMENT RP (deux versions, ANNUELLES)
        rpCapitalAnnual: Math.round(currentCost.capitalAnnuel),
        rpDeltaCashAnnual: Math.round(currentCost.deltaCash),

        // Version sans coût d'opportunité (vue simple)
        rpEnrichmentSimple: Math.round(currentCost.enrichissementRPSimple),

        // Version avec coût d'opportunité (vue réaliste)
        rpEnrichmentComplete: Math.round(currentCost.enrichissementRPComplet),

        // Détail du coût d'opportunité
        rpOpportunityCost: Math.round(currentCost.coutOpportuniteApport),
        rpApport: Math.round(currentCost.apport),
        rpOpportunityRate: currentCost.tauxOpportunite, // en %

        recommendation: this._generateRPRecommendation(gap, gapPercent, params.loyerMarche)
      };
    }

    _buildRPParams(baseInput, opts) {
      const p = v => Number(v) || 0;
      const surface = p(baseInput.surface);
      const loyerM2 = p(baseInput?.ville?.loyer_m2);
      const loyerMarcheCal = (loyerM2 > 0 && surface > 0)
        ? loyerM2 * surface
        : (p(baseInput.loyerHC) + p(baseInput.monthlyCharges ?? baseInput.charges));
      const loyerMarche = p(opts.loyerMarche) || loyerMarcheCal;

      return {
        loyerMarche,
        partner: p(opts.partnerContribution ?? baseInput.partnerContribution),
        taxeFonciere: p(baseInput.taxeFonciere) / 12,
        coproNonRecup: p(baseInput.chargesCoproNonRecup),
        entretien: p(baseInput.entretienAnnuel) / 12,
        pno: p(baseInput.assurancePNO),
        chargesRecup: p(baseInput.monthlyCharges ?? baseInput.charges),

        // Optionnel : permet de surcharger le taux d’opportunité depuis les opts
        tauxOpportuniteApport: p(opts.tauxOpportuniteApport)
      };
    }

    // ✅ Nouvelle version complète pour la RP
    _computeRPCostAtPrice(baseInput, price, params) {
      const adv = this.analyzer.getAllAdvancedParams?.() || {};
      const inputAtPrice = this.analyzer._buildInputForPrice(baseInput, price, adv);
      const mensualite = Number(inputAtPrice.monthlyPayment ?? 0);

      // Charges de propriétaire (mensuelles)
      const charges = Number(params.taxeFonciere)
                    + Number(params.coproNonRecup)
                    + Number(params.entretien)
                    + Number(params.pno);

      const brut = mensualite + charges;

      // --- CAPITAL REMBOURSÉ ANNUEL (comme pour le locatif) ---
      let capitalAnnuel = 0;
      if (this.analyzer.getDetailedCalculations) {
        const regimeId = this.analyzer.getSelectedRegime?.();
        const registry = this.analyzer.getRegimeRegistry?.() || {};
        const key = this.analyzer.normalizeRegimeKey?.({ id: regimeId }) ?? regimeId;
        const meta = registry[key];

        const calc = this.analyzer.getDetailedCalculations(meta, inputAtPrice, adv, {
          mensualite,
          tableauAmortissement: null
        });
        capitalAnnuel = Number(calc.capitalAnnuel || 0);
      }

      // --- COMPARAISON VS LOCATION (symétrique locataire / proprio) ---
      const loyerMensuel   = Number(params.loyerMarche || 0);
      const loyerAnnuel    = loyerMensuel * 12;
      const partnerMensuel = Number(params.partner || 0);
      const partnerAnnuel  = partnerMensuel * 12;

      // Coût annuel si tu restes locataire (avec coloc / conjoint)
      const coutLocataireAnnuel = loyerAnnuel - partnerAnnuel;

      // Coût annuel si tu es proprio (avec même coloc / conjoint)
      const coutProprioAnnuel   = brut * 12 - partnerAnnuel;

      // ΔCash = cash économisé (ou perdu) en devenant proprio
      const deltaCash = coutLocataireAnnuel - coutProprioAnnuel;

      // --- COÛT D'OPPORTUNITÉ DE L'APPORT ---
      const apport = Number(baseInput.apport ?? 0);

      // 3 % par défaut, surcharge via params avancés ou slider RP
      const tauxOpportunite =
        Number(adv.tauxOpportuniteApport ?? params.tauxOpportuniteApport ?? 3) / 100;

      const coutOpportuniteApport = apport * tauxOpportunite;

      // --- KPIs D'ENRICHISSEMENT (ANNUELS) ---
      const enrichissementRPSimple  = deltaCash + capitalAnnuel;                      // vue "simple"
      const enrichissementRPComplet = enrichissementRPSimple - coutOpportuniteApport; // vue "réaliste"

      // Net mensuel : surcoût / économie mensuelle du proprio vs locataire
      const coutLocataireMensuel = coutLocataireAnnuel / 12;
      const coutProprioMensuel   = coutProprioAnnuel / 12;
      const net = coutProprioMensuel - coutLocataireMensuel;

      return {
        mensualite,
        charges,
        brut,
        net,
        loyerMarche: params.loyerMarche,

        // KPIs annuels
        capitalAnnuel,
        deltaCash,
        enrichissementRPSimple,
        enrichissementRPComplet,
        coutOpportuniteApport,
        apport,
        tauxOpportunite: tauxOpportunite * 100 // pour affichage (%)
      };
    }

    _solveRPPrice(baseInput, params) {
      const p0 = Number(baseInput.price ?? baseInput.prixBien ?? 0) || 0;
      let lo = Math.max(1, p0 ? 0.3 * p0 : 50_000);
      let hi = p0 ? 2.0 * p0 : 800_000;

      const maxIter = 60, tol = 1;

      const costLo = this._computeRPCostAtPrice(baseInput, lo, params);
      if (costLo.net > 0) {
        return { price: lo, mensualite: costLo.mensualite, charges: costLo.charges, net: costLo.net, infeasible: true };
      }

      let best = null;
      for (let i = 0; i < maxIter; i++) {
        const mid  = (lo + hi) / 2;
        const cost = this._computeRPCostAtPrice(baseInput, mid, params);
        best = { price: mid, mensualite: cost.mensualite, charges: cost.charges, net: cost.net };
        if (Math.abs(cost.net) <= tol) break;
        if (cost.net > 0) hi = mid; else lo = mid;
      }
      return best;
    }

    _generateRecommendation(gap, gapPercent, targetEnrichment, regimeNom, infeasible, outOfRange, outOfRangeType) {
      // 1) Cas cible vraiment inatteignable (bien trop peu rentable)
      if (infeasible) {
        return {
          type: 'danger',
          icon: '🚨',
          title: 'Cible inatteignable',
          message: `Avec <strong>${regimeNom}</strong>, même en baissant fortement le prix, l'enrichissement reste sous la cible.`
        };
      }

      // 2) Cas "bien trop rentable" (overperforming) : prix d'équilibre > 2x
      if (outOfRange && outOfRangeType === 'overperforming') {
        return {
          type: 'success',
          icon: '✅',
          title: 'Bien très rentable dans la plage testée',
          message: `Même en doublant le prix, l'enrichissement reste au-dessus de la cible. Le prix d'équilibre réel est au-delà de la plage testée : marge théorique très importante.`
        };
      }

      // 3) Cas "normal" : logique existante
      if (Math.abs(gapPercent) < 1) {
        return {
          type: 'neutral',
          icon: '⚖️',
          title: `Prix à l'équilibre`,
          message: `Prix actuel au seuil d'enrichissement.`
        };
      }
      if (gap > 0) {
        return {
          type: gapPercent > 20 ? 'danger' : 'warning',
          icon: gapPercent > 20 ? '🚨' : '⚠️',
          title: gapPercent > 20 ? 'Prix trop élevé' : 'Marge de négociation',
          message: `Baisse d'environ ${Math.round(gapPercent)}% nécessaire.`
        };
      }
      return {
        type: 'success',
        icon: '✅',
        title: 'Excellent prix',
        message: `${Math.abs(Math.round(gapPercent))}% sous le prix d'équilibre.`
      };
    }

    _generateRPRecommendation(gap, gapPercent /*, loyerMarche */) {
      if (Math.abs(gapPercent) < 2) {
        return {
          type: 'neutral',
          icon: '⚖️',
          title: `Prix à l'équilibre`
        };
      }
      if (gap > 0) {
        return {
          type: gapPercent > 15 ? 'danger' : 'warning',
          icon: gapPercent > 15 ? '🚨' : '⚠️',
          title: gapPercent > 15 ? 'Prix trop élevé' : 'Marge de négociation'
        };
      }
      return {
        type: 'success',
        icon: '✅',
        title: 'Excellent prix'
      };
    }

    _safeDiv(a, b) {
      return (b && isFinite(b) && b !== 0) ? (a / b) : 0;
    }

    _getCacheKey(baseInput, target, opts) {
      const params = this.analyzer.getAllAdvancedParams?.() || {};
      const price = Number(baseInput.price ?? baseInput.prixBien ?? 0);
      return JSON.stringify({
        price,
        apport: baseInput.apport,
        loyer: baseInput.loyerHC,
        taux: baseInput.loanRate,
        duree: baseInput.loanDuration,
        target,
        regime: opts.regimeId,
        taxeFonciere: params.taxeFonciere,
        vacanceLocative: params.vacanceLocative
      });
    }

    clearCache() { this.cache.clear(); }
  }

  // Exposition globale
  window.PriceTargetAnalyzer = PriceTargetAnalyzer;
})();

