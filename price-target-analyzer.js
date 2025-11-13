/**
 * PRICE TARGET ANALYZER - Version régime fixe
 * Calcule le prix maximum d'achat pour un régime spécifique
 */

class PriceTargetAnalyzer {
  constructor(fiscalAnalyzer) {
    this.analyzer = fiscalAnalyzer;
    this.cache = new Map();
  }

  /**
   * Calcule le prix maximum pour atteindre un enrichissement cible
   * @param {Object} baseInput - Données de base du bien
   * @param {Number} targetEnrichment - Enrichissement annuel cible (0 = équilibre)
   * @param {Object} opts - Options { regimeId }
   */
  calculatePriceTarget(baseInput, targetEnrichment = 0, opts = {}) {
    const cacheKey = this._getCacheKey(baseInput, targetEnrichment, opts);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const currentPrice = Number(baseInput.price ?? baseInput.prixBien ?? 0);
    const regimeId = opts.regimeId || this.analyzer.getSelectedRegime();

    // Calcul enrichissement au prix actuel
    const currentEnrichment = this._computeEnrichmentAtPrice(
      baseInput, 
      currentPrice, 
      regimeId
    );

    // Solveur pour trouver le prix cible
    const targetResult = this._solveForEnrichment(
      baseInput, 
      targetEnrichment, 
      regimeId, 
      opts
    );

    // Calcul de l'impact
    const gap = currentPrice - targetResult.price;
    const gapPercent = this._safeDiv(gap, currentPrice) * 100;

    const result = {
      // Prix
      currentPrice: Math.round(currentPrice),
      priceTarget: Math.round(targetResult.price),
      gap: Math.round(gap),
      gapPercent: Math.round(gapPercent * 100) / 100,
      
      // Enrichissement
      currentEnrichment: Math.round(currentEnrichment.enrichment),
      targetEnrichment: Math.round(targetEnrichment),
      enrichmentGain: Math.round(targetResult.enrichment - currentEnrichment.enrichment),
      
      // Détails
      regimeUsed: targetResult.regimeNom,
      regimeId: targetResult.regimeId,
      infeasible: !!targetResult.infeasible,
      
      // Breakdown au prix cible
      targetBreakdown: {
        cashflow: Math.round(targetResult.cashflow),
        capital: Math.round(targetResult.capital),
        enrichment: Math.round(targetResult.enrichment)
      },
      
      // Breakdown au prix actuel
      currentBreakdown: {
        cashflow: Math.round(currentEnrichment.cashflow),
        capital: Math.round(currentEnrichment.capital),
        enrichment: Math.round(currentEnrichment.enrichment)
      },
      
      // Recommandation
      recommendation: this._generateRecommendation(
        gap, 
        gapPercent, 
        targetResult.enrichment,
        targetResult.regimeNom,
        targetResult.infeasible
      )
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Calcule l'enrichissement à un prix donné (régime fixe)
   */
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

  /**
   * Solveur : trouve le prix qui donne l'enrichissement cible
   * Version simplifiée pour régime fixe (monotone)
   */
  _solveForEnrichment(baseInput, targetEnrichment, regimeId, opts = {}) {
    const p0 = Number(baseInput.price ?? baseInput.prixBien ?? 0) || 0;

    // Bornes adaptatives
    let lo = Math.max(1, p0 * 0.3);
    let hi = Math.max(2, p0 * 2.0);

    const maxIter = Number(opts.maxIter ?? 80);
    const tol = Number(opts.tol ?? 1); // 1 € d'écart sur l'enrichissement

    // Test d’infaisabilité côté bas (même au prix minimal, on n’atteint pas la cible)
    const eLo = this._computeEnrichmentAtPrice(baseInput, lo, regimeId).enrichment;
    if (eLo + tol < targetEnrichment) {
      const registry = this.analyzer.getRegimeRegistry();
      const key = this.analyzer.normalizeRegimeKey({ id: regimeId });
      return {
        price: lo,
        regimeId: key,
        regimeNom: registry[key]?.nom || key,
        enrichment: eLo,
        cashflow: 0,
        capital: 0,
        infeasible: true
      };
    }

    // ---------- Newton-Raphson avec sauvegarde du "meilleur" ----------
    let price = Math.min(Math.max(p0, lo), hi); // clamp point de départ
    let best = null;

    const bisectionStep = () => {
      const mid = (lo + hi) / 2;
      const r = this._computeEnrichmentAtPrice(baseInput, mid, regimeId);
      best = {
        price: mid,
        regimeId: r.regimeId,
        regimeNom: r.regimeNom,
        enrichment: r.enrichment,
        cashflow: r.cashflow,
        capital: r.capital
      };
      const diff = r.enrichment - targetEnrichment;
      if (diff > 0) lo = mid; else hi = mid;
      price = mid;
      return Math.abs(diff) <= tol;
    };

    for (let i = 0; i < maxIter; i++) {
      const cur = this._computeEnrichmentAtPrice(baseInput, price, regimeId);
      const diff = cur.enrichment - targetEnrichment;

      // MàJ best
      if (!best || Math.abs(diff) < Math.abs(best.enrichment - targetEnrichment)) {
        best = {
          price,
          regimeId: cur.regimeId,
          regimeNom: cur.regimeNom,
          enrichment: cur.enrichment,
          cashflow: cur.cashflow,
          capital: cur.capital
        };
      }

      if (Math.abs(diff) <= tol) break;

      // Dérivée numérique locale
      const h = Math.max(50, Math.abs(price) * 1e-3); // pas adaptatif
      const nxt = this._computeEnrichmentAtPrice(baseInput, Math.min(price + h, hi), regimeId);
      const derivative = (nxt.enrichment - cur.enrichment) / h;

      // Si dérivée quasi nulle ou signe incohérent -> fallback bisection
      if (!isFinite(derivative) || Math.abs(derivative) < 1e-8) {
        if (bisectionStep()) break;
        continue;
      }

      // Pas de Newton avec amortissement
      let step = diff / derivative; // NB: diff = f(price) - target
      let newPrice = price - step;

      // Si on sort des bornes, on réduit le pas (damping) jusqu'à rentrer dans [lo, hi]
      let damping = 1;
      while ((newPrice < lo || newPrice > hi) && damping > 1e-3) {
        damping *= 0.5;
        newPrice = price - step * damping;
      }

      // Si malgré le damping on reste hors bornes → fallback bisection
      if (newPrice < lo || newPrice > hi || !isFinite(newPrice)) {
        if (bisectionStep()) break;
        continue;
      }

      // Avance Newton
      price = newPrice;

      // Maintien de l'invariant lo/hi (monotonicité attendue: diff>0 ⇒ prix trop bas)
      if (diff > 0) lo = Math.max(lo, price); else hi = Math.min(hi, price);
    }

    // Si pas de convergence stricte, on renvoie le meilleur rencontré
    return best;
  }
  /**
   * Génère une recommandation actionnable
   */
  _generateRecommendation(gap, gapPercent, targetEnrichment, regimeNom, infeasible) {
    // Cas spécial : cible inatteignable
    if (infeasible) {
      return {
        type: 'danger',
        icon: '🚨',
        title: 'Cible inatteignable',
        message: `Avec le régime <strong>${regimeNom}</strong> et vos paramètres actuels, aucun prix ne permet d'atteindre l'équilibre enrichissement. Augmentez le loyer, l'apport, ou changez de régime.`,
        action: 'Ajuster les hypothèses'
      };
    }

    // Cas normal : analyse du gap
    if (Math.abs(gapPercent) < 1) {
      return {
        type: 'neutral',
        icon: '⚖️',
        title: 'Prix à l\'équilibre',
        message: `Avec <strong>${regimeNom}</strong>, le prix actuel correspond au seuil d'enrichissement positif.`,
        action: 'Prix acceptable'
      };
    }

    if (gap > 0) {
      // Prix actuel trop élevé
      if (gapPercent > 20) {
        return {
          type: 'danger',
          icon: '🚨',
          title: 'Prix beaucoup trop élevé',
          message: `Avec <strong>${regimeNom}</strong>, vous devez négocier une baisse de ${Math.round(gapPercent)}% pour atteindre l'équilibre. Au prix actuel, ce régime n'est pas rentable.`,
          action: 'Renégocier ou changer de régime'
        };
      } else if (gapPercent > 10) {
        return {
          type: 'warning',
          icon: '⚠️',
          title: 'Prix élevé',
          message: `Avec <strong>${regimeNom}</strong>, négociez une baisse de ${Math.round(gapPercent)}% pour optimiser votre enrichissement.`,
          action: 'Négocier fortement'
        };
      } else {
        return {
          type: 'caution',
          icon: '💡',
          title: 'Marge de négociation',
          message: `Une baisse de ${Math.round(gapPercent)}% améliorerait votre enrichissement avec <strong>${regimeNom}</strong>.`,
          action: 'Négocier si possible'
        };
      }
    } else {
      // Prix actuel déjà bon
      const margin = Math.abs(gapPercent);
      return {
        type: 'success',
        icon: '✅',
        title: 'Excellent prix',
        message: `Avec <strong>${regimeNom}</strong>, vous êtes ${Math.round(margin)}% en dessous du prix d'équilibre. Votre enrichissement est garanti dès la première année !`,
        action: 'Foncez'
      };
    }
  }

  /**
   * Division sécurisée (évite NaN/Infinity)
   */
  _safeDiv(a, b) {
    return (b && isFinite(b) && b !== 0) ? (a / b) : 0;
  }

  /**
   * Génère une clé de cache robuste
   */
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
      // Params critiques
      taxeFonciere: params.taxeFonciere,
      vacance: params.vacanceLocative,
      gestion: params.gestionLocativeTaux
    });
  }

  /**
   * Vide le cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PriceTargetAnalyzer;
} else {
  window.PriceTargetAnalyzer = PriceTargetAnalyzer;
}
