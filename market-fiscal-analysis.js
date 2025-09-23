/**
 * market-fiscal-analysis.js
 * Module d'intégration pour l'analyse de marché et la comparaison fiscale
 * Complète la page comparaison-fiscale.html
 * Version 3.0 - Corrections complètes
 */

// Constantes fiscales
const FISCAL_CONSTANTS = {
    // Taux
    PRELEVEMENTS_SOCIAUX: 0.172,
    IS_TAUX_REDUIT: 0.15,
    IS_PLAFOND_REDUIT: 42500,
    
    // Abattements
    MICRO_FONCIER_ABATTEMENT: 0.30,
    MICRO_BIC_ABATTEMENT: 0.50,
    
    // Plafonds
    MICRO_FONCIER_PLAFOND: 15000,
    MICRO_BIC_PLAFOND: 77700,     
    DEFICIT_FONCIER_MAX: 10700,
    
    // Amortissement
    LMNP_TAUX_AMORTISSEMENT_BIEN: 0.025,
    LMNP_TAUX_AMORTISSEMENT_MOBILIER: 0.10,
    LMNP_PART_MOBILIER: 0.10,
    LMNP_PART_TERRAIN: 0.10,  
    
    // Durées
    DUREE_AMORTISSEMENT_BIEN: 40,
    DUREE_AMORTISSEMENT_MOBILIER: 10,

    // LMP (cotisations sociales pro)
  LMP_COTISATIONS_TAUX: 0.35,   // 35% par défaut
  LMP_COTISATIONS_MIN: 1200
};

/**
 * UNITS_CONTRACT - Documentation des unités utilisées
 * IMPORTANT: Tout ce qui est "/ mois" doit finir ×12 avant comparaison fiscale
 */
const UNITS_CONTRACT = {
    // MENSUEL (€/mois)
    loyerHC: '€/mois',
    monthlyCharges: '€/mois',
    chargesCoproNonRecup: '€/mois',
    assurancePNO: '€/mois',
    
    // ANNUEL (€/an)
    taxeFonciere: '€/an',
    entretienAnnuel: '€/an',
    fraisGestion: '€/an',
    
    // POURCENTAGES (%)
    vacanceLocative: '%',
    gestionLocativeTaux: '%',
    tmi: '%'
};
/**
 * Helper pour parser les valeurs numériques en acceptant 0
 * ⚠️ IMPORTANT : Cette fonction doit être AVANT la classe MarketFiscalAnalyzer
 * @param {string} elemId - ID de l'élément HTML
 * @param {number} def - Valeur par défaut
 * @returns {number} - Valeur parsée ou défaut si invalide
 */
function parseFloatOrDefault(elemId, def) {
    const v = parseFloat(document.getElementById(elemId)?.value);
    return Number.isNaN(v) ? def : v;   // 0 est conservé, '' ou 'abc' donnent def
}

class MarketFiscalAnalyzer {
    constructor() {
        this.simulateur = new SimulateurImmo();
        this.comparateur = new FiscalComparator(this.simulateur);
        this.propertyData = null;
        this.marketAnalysis = null;
        // Constante pour le vrai signe minus
        this.SIGN_MINUS = '−'; // U+2212 (pas un tiret simple !)
    }

    // ─────────────────────────────────────────────────────────────
    //  Normalisation robuste des régimes + registre unique
    // ─────────────────────────────────────────────────────────────
    normalizeRegimeKey(reg) {
        const raw = (reg?.id || reg?.nom || '').toString()
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g,''); // supprime les accents

        // Normalisations usuelles
        if (raw.includes('lmp'))                           return 'lmp';
        if (raw.includes('lmnp') && raw.includes('reel'))  return 'lmnp_reel';
        if (raw.includes('lmnp') && raw.includes('micro')) return 'lmnp_micro';
        if (raw.includes('micro-foncier') || raw.includes('nu_micro')) return 'nu_micro';
        if ((raw.includes('nu') || raw.includes('foncier')) && raw.includes('reel')) return 'nu_reel';
        if (raw.includes('sci') && raw.includes('is'))     return 'sci_is';

        // Valeurs exactes utilisées par le formulaire
        if (raw === 'nu_micro')   return 'nu_micro';
        if (raw === 'nu_reel')    return 'nu_reel';
        if (raw === 'lmnp_micro') return 'lmnp_micro';
        if (raw === 'lmnp_reel')  return 'lmnp_reel';
        if (raw === 'lmp_reel')   return 'lmp';
        if (raw === 'sci_is')     return 'sci_is';

        return raw.replace(/\s+/g,'-');
    }

    getRegimeRegistry() {
        return {
            nu_micro   : { id:'nu_micro',   nom:'Micro-foncier',                icone:'fa-leaf' },
            nu_reel    : { id:'nu_reel',    nom:'Location nue au réel',         icone:'fa-calculator' },
            lmnp_micro : { id:'lmnp_micro', nom:'LMNP Micro-BIC',               icone:'fa-bed' },
            lmnp_reel  : { id:'lmnp_reel',  nom:'LMNP au réel',                 icone:'fa-file-invoice-dollar' },
            lmp        : { id:'lmp',        nom:'LMP Réel',                     icone:'fa-briefcase' },
            sci_is     : { id:'sci_is',     nom:"SCI à l'IS",                   icone:'fa-building' }
        };
    }

/** Convertit une valeur en nombre, gère les formats FR/UE courants */
toFloat(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val == null || val === '') return 0;

  // Nettoyage robuste : espaces insécables, séparateurs de milliers, symboles €
  let s = String(val)
    .trim()
    .replace(/\u2212/g, '-')        // vrai signe moins → '-'
    .replace(/[\u00A0\u202F]/g, '') // NBSP et espace fine insécable
    .replace(/[€$]/g, '')           // symboles monétaires
    .replace(/\s/g, '')             // tout espace résiduel
    .replace(/'/g, '');             // séparateur de milliers style suisse

  // Cas français classique : "1.234,56" → enlever les points (milliers), puis virgule → point
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else {
    // Si on n'a que des points, on suppose déjà un décimal correct
    // Si on n'a que des virgules, on les convertit en points
    s = s.replace(/,/g, '.');
    // Les points restants utilisés comme milliers (ex: "1.234") ne posent pas de souci à parseFloat
  }

  // Ne garder que chiffres, un éventuel signe -, et un seul point décimal
  s = s.replace(/[^0-9\.\-]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s =
      s.slice(0, firstDot + 1) +
      s.slice(firstDot + 1).replace(/\./g, ''); // retire les autres points
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formate un montant avec signe et classe CSS
 * @param {any} value
 * @param {boolean} showSign
 * @returns {{ className:string, formattedValue:string, isPositive:boolean, numValue:number, rawValue:number }}
 */
formatAmountWithClass(value, showSign = true) {
  const numValue = this.toFloat(value);
  const isPositive = numValue >= 0;
  const absValue = Math.abs(numValue);

  const minus = this.SIGN_MINUS || '−';
  let formattedValue = this.formatCurrency(absValue);

  if (showSign) {
    formattedValue = (isPositive ? '+' : minus) + formattedValue;
  }

  return {
    className: isPositive ? 'positive' : 'negative',
    formattedValue,
    isPositive,
    numValue,
    rawValue: numValue
  };
}
    /**
     * Effectue l'analyse complète (marché + fiscal) - V3 CORRIGÉE
     */
async performCompleteAnalysis(data) {
    try {
        // 1. Analyse de marché
        this.marketAnalysis = this.analyzeMarketPosition(data);
        
        // 2. Préparation des données
        const fiscalData = this.prepareFiscalData(data);
        const comparatorData = this.prepareFiscalDataForComparator(fiscalData);
        
        // 3. Créer un pseudo-résultat sans tableau d'amortissement
        const baseResults = {
            // Mensualité déjà calculée dans prepareFiscalData
            mensualite: comparatorData.chargeMensuelleCredit || 
                        this.calculateMonthlyPayment(
                            comparatorData.loanAmount,
                            comparatorData.loanRate,
                            comparatorData.loanDuration
                        ),
            // Pas de tableau → force la formule analytique
            tableauAmortissement: null
        };

        // 4. Propager la mensualité pour le comparateur
        comparatorData.chargeMensuelleCredit = baseResults.mensualite;
        
        // 5. Enrichir comparatorData avec les résultats du simulateur
        comparatorData.tableauAmortissement = baseResults.tableauAmortissement;
        
        // 6. Comparaison des régimes avec l'adaptateur
        const fiscalResults = await this.comparateur.compareAllRegimes(comparatorData);
        
// 7. Enrichir les résultats avec les calculs détaillés différenciés
const params = this.getAllAdvancedParams();
fiscalResults.forEach(regime => {
  const detailedCalc = this.getDetailedCalculations(regime, fiscalData, params, baseResults);

  // Remplacer par les valeurs détaillées plus précises
  regime.cashflowNetAnnuel = detailedCalc.cashflowNetAnnuel;
  regime.cashflowMensuel   = detailedCalc.cashflowNetAnnuel / 12;
  regime.impotAnnuel       = -(detailedCalc.totalImpots);
  regime.rendementNet      = (detailedCalc.cashflowNetAnnuel / (fiscalData.price || fiscalData.prixBien || 1)) * 100;

  // Ajouter les détails pour le debug
  regime._detailedCalc = detailedCalc;
});

// ✅ 7.b Normaliser systématiquement les ids/labels renvoyés
fiscalResults.forEach(r => {
  const key = this.normalizeRegimeKey(r);
  r.id = key || r.id;
  const reg = this.getRegimeRegistry()[r.id];
  if (reg && !r.nom) r.nom = reg.nom;
});

// ✅ 7.c Injection GÉNÉRIQUE du régime choisi si absent (plus de cas spécial LMP)
const chosenKey = this.normalizeRegimeKey({ id: data?.regimeActuel });
if (chosenKey && !fiscalResults.some(r => this.normalizeRegimeKey(r) === chosenKey)) {
  const reg = { ...this.getRegimeRegistry()[chosenKey] };
  if (reg) {
    const detailedCalc = this.getDetailedCalculations(reg, fiscalData, params, baseResults);
    reg.cashflowNetAnnuel = detailedCalc.cashflowNetAnnuel;
    reg.cashflowMensuel   = detailedCalc.cashflowNetAnnuel / 12;
    reg.impotAnnuel       = -(detailedCalc.totalImpots);
    reg.rendementNet      = (detailedCalc.cashflowNetAnnuel / (fiscalData.price || fiscalData.prixBien || 1)) * 100;
    reg._detailedCalc     = detailedCalc;
    fiscalResults.push(reg);
  }
}

// (optionnel) garder le meilleur en tête de liste
fiscalResults.sort((a, b) => (b.cashflowNetAnnuel ?? -Infinity) - (a.cashflowNetAnnuel ?? -Infinity));

return {
  market: this.marketAnalysis,
  fiscal: fiscalResults,
  recommendations: this.generateGlobalRecommendations(this.marketAnalysis, fiscalResults)
};
        
    } catch (error) {
        console.error('Erreur dans performCompleteAnalysis:', error);
        throw error;
    }
}
   /**
 * Prépare les données pour le comparateur fiscal - V3 COMPLÈTE
 * (respecte les zéros saisis grâce à ??)
 */
prepareFiscalDataForComparator(rawData) {
  // Calcul du loyer brut annuel AVANT l'appel au simulateur
  const chargesM = (rawData.monthlyCharges ?? 50);    // respecte 0
  const loyerMensuelTotal = (rawData.loyerHC ?? 0) + chargesM;
  const loyerBrutAnnuel = loyerMensuelTotal * 12;

  return {
    // Prix et financement
    prixBien: rawData.price,
    apport: rawData.apport,
    duree: rawData.loanDuration,
    taux: rawData.loanRate,

    // Revenus - V3: Distinction HC/CC pour plafonds
    loyerMensuel: (rawData.loyerHC ?? 0),
    loyerBrutHC: (rawData.loyerHC ?? 0) * 12,   // Pour les plafonds fiscaux
    loyerBrutCC: loyerBrutAnnuel,               // Pour l'analyse cash-flow
    loyerBrut: loyerBrutAnnuel,                 // Compatibilité
    chargesCopro: chargesM,

    // Charges - V3: chargesNonRecuperables en ANNUEL
    taxeFonciere: (rawData.taxeFonciere ?? 800),                         // €/an
    vacanceLocative: (rawData.vacanceLocative ?? 0),                     // %
    gestionLocativeTaux: (rawData.gestionLocativeTaux ?? 0),             // %
    chargesNonRecuperables: ((rawData.chargesCoproNonRecup ?? 50) * 12), // €/an

    // Divers
    surface: rawData.surface,
    typeAchat: rawData.typeAchat,
    tmi: rawData.tmi,

    // Charges annuelles
    entretienAnnuel: (rawData.entretienAnnuel ?? 500),
    assurancePNO: ((rawData.assurancePNO ?? 15) * 12),

    // Calculé après le simulateur
    chargeMensuelleCredit: (rawData.monthlyPayment ?? 0),

    // Travaux
    travauxRenovation: (rawData.travauxRenovation ?? 0),

    // Pour compatibilité avec le simulateur
    montantEmprunt: rawData.loanAmount,
    fraisBancaires: (rawData.fraisBancairesDossier ?? 0) + (rawData.fraisBancairesCompte ?? 0),
    fraisGarantie: rawData.fraisGarantie
  };
}

    /**
     * Analyse la position sur le marché
     */
    analyzeMarketPosition(data) {
        const result = {
            hasMarketData: !!data.ville,
            priceAnalysis: {},
            rentAnalysis: {},
            globalScore: 0
        };

        if (data.ville) {
            const marketPriceM2 = data.ville.prix_m2;
            const marketRentM2 = data.ville.loyer_m2;
            
            // Analyse du prix
            const priceDiff = ((data.prixM2Paye - marketPriceM2) / marketPriceM2) * 100;
            result.priceAnalysis = {
                userPrice: data.prixM2Paye,
                marketPrice: marketPriceM2,
                difference: priceDiff,
                position: this.getPricePosition(priceDiff),
                savings: (marketPriceM2 - data.prixM2Paye) * data.surface
            };
            
            // Analyse du loyer - Comparer en CC
            const loyerCCM2 = (data.loyerActuel + data.charges) / data.surface;
            const rentDiff = ((loyerCCM2 - marketRentM2) / marketRentM2) * 100;
            result.rentAnalysis = {
                userRent: data.loyerM2Actuel,
                userRentCC: loyerCCM2,
                marketRent: marketRentM2,
                difference: rentDiff,
                position: this.getRentPosition(rentDiff),
                potential: (marketRentM2 - loyerCCM2) * data.surface
            };
            
            // Score global (0-100)
            const priceScore = Math.max(0, 50 - Math.abs(priceDiff));
            const rentScore = Math.max(0, 50 + (rentDiff / 2));
            result.globalScore = (priceScore + rentScore) / 2;
        }
        
        return result;
    }

    /**
     * Détermine la position du prix
     */
    getPricePosition(diff) {
        if (diff < -15) return 'excellent';
        if (diff < -5) return 'good';
        if (diff < 5) return 'average';
        if (diff < 15) return 'high';
        return 'overpriced';
    }

    /**
     * Détermine la position du loyer
     */
    getRentPosition(diff) {
        if (diff > 15) return 'excellent';
        if (diff > 5) return 'good';
        if (diff > -5) return 'average';
        if (diff > -15) return 'low';
        return 'underpriced';
    }

/**
 * Récupère tous les paramètres avancés du formulaire - VERSION CORRIGÉE
 * ✅ ACCEPTE MAINTENANT LA VALEUR 0 grâce au helper parseFloatOrDefault
 */
getAllAdvancedParams() {
  return {
    // Communs
    fraisBancairesDossier: parseFloatOrDefault('frais-bancaires-dossier', 900),
    fraisBancairesCompte:  parseFloatOrDefault('frais-bancaires-compte', 150),
    fraisGarantie:         parseFloatOrDefault('frais-garantie', 1.3709),
    taxeFonciere:          parseFloatOrDefault('taxeFonciere', 800),
    vacanceLocative:       parseFloatOrDefault('vacanceLocative', 0),
    gestionLocativeTaux:   parseFloatOrDefault('gestionLocative', 0),

    // Séparer travaux et entretien
    travauxRenovation: parseFloatOrDefault('travaux-renovation', 0),
    entretienAnnuel:   parseFloatOrDefault('entretien-annuel', 500),
    assurancePNO:      parseFloatOrDefault('assurance-pno', 15),

    // Charges de copropriété non récupérables
    chargesCoproNonRecup: parseFloatOrDefault('charges-copro-non-recup', 50),

    // Spécifiques classique
    fraisNotaireTaux: parseFloatOrDefault('frais-notaire-taux', 8),
    commissionImmo:   parseFloatOrDefault('commission-immo', 4),

    // Spécifiques enchères - BASE
    droitsEnregistrement: parseFloatOrDefault('droits-enregistrement', 5.70),
    coefMutation:         parseFloatOrDefault('coef-mutation', 2.37),
    honorairesAvocat:     parseFloatOrDefault('honoraires-avocat', 1500),
    fraisFixes:           parseFloatOrDefault('frais-fixes', 50),

    // Enchères - Émoluments par tranches
    emolumentsTranche1: parseFloatOrDefault('emoluments-tranche1', 7),
    emolumentsTranche2: parseFloatOrDefault('emoluments-tranche2', 3),
    emolumentsTranche3: parseFloatOrDefault('emoluments-tranche3', 2),
    emolumentsTranche4: parseFloatOrDefault('emoluments-tranche4', 1),

    // Enchères - Autres frais détaillés
    honorairesAvocatCoef: parseFloatOrDefault('honoraires-avocat-coef', 0.25),
    tvaHonoraires:        parseFloatOrDefault('tva-honoraires', 20),
    publiciteFonciere:    parseFloatOrDefault('publicite-fonciere', 0.10),
    avocatPorterEnchere:  parseFloatOrDefault('avocat-porter-enchere', 300),
    suiviDossier:         parseFloatOrDefault('suivi-dossier', 1200),
    cautionMisePrix:      parseFloatOrDefault('caution-mise-prix', 5),
    cautionRestituee:     document.getElementById('caution-restituee')?.checked ?? true,

    // ─────────────────────────────────────────
    // LMP (cotisations sociales) + Toggles
    // ─────────────────────────────────────────
    // % et plancher €/an (si les inputs n’existent pas, on prend les valeurs défaut constantes)
    lmpCotisationsTaux: parseFloatOrDefault(
      'lmp-cotisations-taux',
      FISCAL_CONSTANTS.LMP_COTISATIONS_TAUX * 100 // en %
    ),
    lmpCotisationsMin: parseFloatOrDefault(
      'lmp-cotisations-min',
      FISCAL_CONSTANTS.LMP_COTISATIONS_MIN // €/an
    ),

    // Toggles utiles (fonctionnent même sans input dans le DOM)
    assujettiCotisSociales: document.getElementById('assujetti-cotis')?.checked ?? false, // LMNP soumis cotisations → pas de PS
    sciEligibleTauxReduit:  document.getElementById('sci-taux-reduit')?.checked ?? true,  // 15% jusqu’à 42 500 €

    // PFU pour SCI à l'IS (dividendes simulés au PFU 30%)
    applyPFU: document.getElementById('apply-pfu')?.checked ?? false
  };
}

/**
 * Calcule les intérêts annuels avec précision – somme fermée (gère 0% et échéancier)
 * year = 1 → mois 0..11, year = 2 → mois 12..23, etc.
 */
calculateAnnualInterests(inputData, baseResults, year = 1) {
  // 1) Si on a un échéancier détaillé, on additionne simplement les intérêts de l'année
  if (baseResults?.tableauAmortissement?.length >= 12) {
    const start = (year - 1) * 12;
    const end   = Math.min(year * 12, baseResults.tableauAmortissement.length);
    if (end <= start) return 0;
    return baseResults.tableauAmortissement
      .slice(start, end)
      .reduce((sum, m) => sum + (Number(m?.interets) || 0), 0);
  }

  // 2) Sinon : somme fermée exacte sur [n0, n1)
  const P   = Number(inputData?.loanAmount ?? 0);
  const yrs = Number(inputData?.loanDuration ?? 0);
  const yr  = Number(inputData?.loanRate ?? 0);      // en %
  const N   = yrs * 12;
  if (!(P > 0) || !(N > 0)) return 0;

  const r = (yr / 100) / 12;                         // taux mensuel
  if (!Number.isFinite(r) || Math.abs(r) < 1e-12) return 0; // 0% → pas d’intérêts

  const M  = this.calculateMonthlyPayment(P, yr, yrs);
  const n0 = Math.max(0, (year - 1) * 12);
  const n1 = Math.min(year * 12, N);
  if (n1 <= n0) return 0;

  const a0 = Math.pow(1 + r, n0);
  const a1 = Math.pow(1 + r, n1);

  // S = Σ_{k=n0}^{n1-1} r · CRD(k)
  //   = P·(a1 − a0) − M · [ (a1 − a0)/r − (n1 − n0) ]
  return P * (a1 - a0) - M * ((a1 - a0) / r - (n1 - n0));
}
/**
 * Calcule les charges réelles déductibles
 */
calculateRealCharges(inputData, params, interetsAnnuels) {
  return interetsAnnuels +
         Number(params.taxeFonciere ?? 0) +
         Number(params.chargesCoproNonRecup ?? 0) * 12 +
         Number(params.assurancePNO ?? 0) * 12 +
         Number(params.entretienAnnuel ?? 0);
}
/**
 * Calcule tous les détails pour un régime donné - V3 DIFFÉRENCIÉE (patchée)
 * Correctifs inclus :
 * 1) Micro = recettes CC (plafond & base), éligibilité sur recettes CC annuelles
 * 2) Zéros respectés : usage de ?? pour les champs susceptibles de valoir 0
 * 3) SCI à l’IS : option PFU 30% (params.applyPFU === true || inputData.applyPFU === true)
 * 4) Cotisations sociales LMP/LMNP assujetti : plancher paramétrable (défaut 1200 €)
 * 5) ✅ CF corrigé : on garde CC pour le fiscal, mais on calcule le cash-flow en HC (option A)
 */
getDetailedCalculations(regime, inputData, params, baseResults) {
  // ─────────────────────────────────────────────────────────────
  // A) SOCLES DE REVENUS (corrigés pour MICROS : base = recettes CC)
  // ─────────────────────────────────────────────────────────────
  const loyerHC       = Number(inputData.loyerHC ?? 0);
  const chargesRecupM = Number(inputData.chargesRecuperables ?? inputData.monthlyCharges ?? 0);
  const loyerCCm      = Number(inputData.loyerCC ?? (loyerHC + chargesRecupM));
  const loyerAnnuelHC = loyerHC * 12;

  const vacPct        = Number(inputData.vacanceLocative ?? 0) / 100;

  // ⚠️ Base fiscale (MICRO) = CC
  const recettesCCAnn = loyerCCm * 12;
  const vacanceAmount = recettesCCAnn * vacPct;
  const recettesBrutes = recettesCCAnn - vacanceAmount; // ← garde pour le FISCAL

  // Frais de gestion : impactent cash-flow & régimes réels (pas la base micro)
  const gestTaux     = Number(params.gestionLocativeTaux ?? 0) / 100;
  const fraisGestion = gestTaux > 0 ? recettesBrutes * gestTaux : 0;

  // Revenus nets utilisés pour les régimes RÉELS (fiscal)
  const revenusNets = recettesBrutes - fraisGestion;

  // 🆕 Base cash-flow en HC (évite d'ajouter une charge "passe-plat")
  const recettesHCAnn   = loyerHC * 12;
  const vacanceAmountHC = recettesHCAnn * vacPct;
  const revenusNetsCF   = (recettesHCAnn - vacanceAmountHC) - fraisGestion;

  // ─────────────────────────────────────────────────────────────
  // Crédit
  // ─────────────────────────────────────────────────────────────
  const interetsAnnuels     = this.calculateAnnualInterests(inputData, baseResults);
  const mensualite          = Number(inputData.monthlyPayment ?? 0);
  const mensualiteAnnuelle  = mensualite * 12;
  const capitalAnnuel       = mensualiteAnnuelle - interetsAnnuels;

  // Variables communes
  const TMI = Number(inputData.tmi ?? 0) / 100;

  let chargesDeductibles    = 0;
  let baseImposable         = 0;
  let impotRevenu           = 0;   // IS ou IR selon cas
  let prelevementsSociaux   = 0;   // PS 17.2% si applicable
  let amortissementBien     = 0;
  let amortissementMobilier = 0;
  let amortissementTravaux  = 0;
  let cotisationsSociales   = 0;   // LMP/LMNP assujetti

  // --- Switch sur clé normalisée ---
  const key = this.normalizeRegimeKey(regime);

  switch (key) {
    // ───────────────────────────────────────────────────────────
    // B) MICRO-FONCIER (base = RECETTES CC, éligibilité sur CC annuel)
    // ───────────────────────────────────────────────────────────
    case 'nu_micro': {
      if (recettesCCAnn > FISCAL_CONSTANTS.MICRO_FONCIER_PLAFOND) {
        regime._warning = 'Inéligible micro-foncier (> 15 000 € de recettes CC).';
      }
      const base = recettesBrutes * (1 - FISCAL_CONSTANTS.MICRO_FONCIER_ABATTEMENT);

      chargesDeductibles  = recettesBrutes * FISCAL_CONSTANTS.MICRO_FONCIER_ABATTEMENT; // affichage
      baseImposable       = base;
      impotRevenu         = base * TMI;
      prelevementsSociaux = base * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
      break;
    }

    // ───────────────────────────────────────────────────────────
    // C) NU AU RÉEL — déficit foncier hors intérêts imputable (10 700 €)
    // ───────────────────────────────────────────────────────────
    case 'nu_reel': {
      const chargesHorsInterets =
        Number(params.taxeFonciere ?? 0) +
        Number(params.chargesCoproNonRecup ?? 0) * 12 +
        Number(params.assurancePNO ?? 0) * 12 +
        Number(params.entretienAnnuel ?? 0);

      // Déficit HORS intérêts imputable au revenu global (plafonné)
      const baseAvantInterets   = revenusNets - chargesHorsInterets;
      const deficitHorsInterets = Math.min(0, baseAvantInterets);
      const imputableGlobal     = Math.min(FISCAL_CONSTANTS.DEFICIT_FONCIER_MAX, Math.abs(deficitHorsInterets));

      // Résultat foncier après intérêts (≥ 0) = base pour IR/PS
      const baseApresInterets   = Math.max(0, baseAvantInterets - interetsAnnuels);

      baseImposable             = baseApresInterets;
      impotRevenu               = baseApresInterets * TMI - (imputableGlobal * TMI);
      prelevementsSociaux       = baseApresInterets * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;

      chargesDeductibles        = interetsAnnuels + chargesHorsInterets;
      break;
    }

    // ───────────────────────────────────────────────────────────
    // D) LMNP MICRO-BIC (base = RECETTES CC, éligibilité sur CC annuel)
    // ───────────────────────────────────────────────────────────
    case 'lmnp_micro': {
      if (recettesCCAnn > FISCAL_CONSTANTS.MICRO_BIC_PLAFOND) {
        regime._warning = 'Inéligible micro-BIC (> 77 700 € de recettes CC).';
      }
      const base = recettesBrutes * (1 - FISCAL_CONSTANTS.MICRO_BIC_ABATTEMENT);

      chargesDeductibles  = recettesBrutes * FISCAL_CONSTANTS.MICRO_BIC_ABATTEMENT; // affichage
      baseImposable       = base;
      impotRevenu         = base * TMI;

      const assujetti     = !!inputData.assujettiCotisSociales;
      prelevementsSociaux = assujetti ? 0 : base * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
      break;
    }

    // ───────────────────────────────────────────────────────────
    // E) LMNP AU RÉEL — assujetti ⇒ cotisations sociales, PS = 0
    // ───────────────────────────────────────────────────────────
    case 'lmnp_reel': {
      const chargesReelles    = this.calculateRealCharges(inputData, params, interetsAnnuels);
      const baseAmortissable  = Number(inputData.price ?? 0) *
                                (1 - FISCAL_CONSTANTS.LMNP_PART_TERRAIN - FISCAL_CONSTANTS.LMNP_PART_MOBILIER);

      amortissementBien       = baseAmortissable * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;
      amortissementMobilier   = Number(inputData.price ?? 0) * FISCAL_CONSTANTS.LMNP_PART_MOBILIER * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_MOBILIER;
      amortissementTravaux    = Number(inputData.travauxRenovation ?? 0) * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;

      const totalDeductions   = chargesReelles + amortissementBien + amortissementMobilier + amortissementTravaux;

      baseImposable           = Math.max(0, revenusNets - totalDeductions);
      impotRevenu             = baseImposable * TMI;

      const assujetti         = !!inputData.assujettiCotisSociales;
      if (assujetti) {
        // ✅ Correctif #4 : plancher paramétrable, zéros respectés
        const tauxRaw   = Number(inputData.lmpCotisationsTaux);
        const tauxCotis = Number.isFinite(tauxRaw) ? (tauxRaw / 100) : FISCAL_CONSTANTS.LMP_COTISATIONS_TAUX;

        const minRaw    = Number(inputData.lmpCotisationsMin);
        const minCotis  = Number.isFinite(minRaw) ? minRaw : FISCAL_CONSTANTS.LMP_COTISATIONS_MIN;

        cotisationsSociales = Math.max(baseImposable * tauxCotis, minCotis);
        prelevementsSociaux = 0;
      } else {
        prelevementsSociaux = baseImposable * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
      }

      chargesDeductibles      = chargesReelles;
      break;
    }

    // ───────────────────────────────────────────────────────────
    // F) LMP (réel) — avec plancher cotisations
    // ───────────────────────────────────────────────────────────
    case 'lmp': {
      const chargesReelles    = this.calculateRealCharges(inputData, params, interetsAnnuels);
      const baseAmortissable  = Number(inputData.price ?? 0) *
                                (1 - FISCAL_CONSTANTS.LMNP_PART_TERRAIN - FISCAL_CONSTANTS.LMNP_PART_MOBILIER);

      amortissementBien       = baseAmortissable * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;
      amortissementMobilier   = Number(inputData.price ?? 0) * FISCAL_CONSTANTS.LMNP_PART_MOBILIER * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_MOBILIER;
      amortissementTravaux    = Number(inputData.travauxRenovation ?? 0) * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;

      const baseAvantAmort    = revenusNets - chargesReelles;
      const deficitHorsAmort  = Math.min(0, baseAvantAmort);
      const economieIR        = Math.abs(deficitHorsAmort) * TMI;

      const amortTotal        = amortissementBien + amortissementMobilier + amortissementTravaux;
      baseImposable           = Math.max(0, baseAvantAmort - amortTotal);

      impotRevenu             = baseImposable * TMI - economieIR;
      prelevementsSociaux     = 0;

      // ✅ Correctif #4 : plancher paramétrable, zéros respectés
      const tauxRaw   = Number(inputData.lmpCotisationsTaux);
      const tauxCotis = Number.isFinite(tauxRaw) ? (tauxRaw / 100) : FISCAL_CONSTANTS.LMP_COTISATIONS_TAUX;

      const minRaw    = Number(inputData.lmpCotisationsMin);
      const minCotis  = Number.isFinite(minRaw) ? minRaw : FISCAL_CONSTANTS.LMP_COTISATIONS_MIN;

      cotisationsSociales     = Math.max(baseImposable * tauxCotis, minCotis);

      chargesDeductibles      = chargesReelles + amortTotal;
      break;
    }

 // ───────────────────────────────────────────────────────────
// G) SCI À L’IS — option PFU investisseur (+ taux de distribution)
// ───────────────────────────────────────────────────────────
case 'sci_is': {
  const chargesReelles    = this.calculateRealCharges(inputData, params, interetsAnnuels);
  const baseAmortissable  = Number(inputData.price ?? 0) * (1 - FISCAL_CONSTANTS.LMNP_PART_TERRAIN);
  const amortBien         = baseAmortissable * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN;
  const amortMob          = Number(inputData.price ?? 0) * FISCAL_CONSTANTS.LMNP_PART_MOBILIER * FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_MOBILIER;

  // Charges "réelles" uniquement ici ; amortissements séparés
  chargesDeductibles      = chargesReelles;
  amortissementBien       = amortBien;
  amortissementMobilier   = amortMob;
  amortissementTravaux    = 0;

  const resultatAvantIS   = Math.max(0, revenusNets - (chargesReelles + amortBien + amortMob));
  const eligible15        = !!inputData.sciEligibleTauxReduit;

  if (eligible15) {
    const tranche = Math.min(resultatAvantIS, FISCAL_CONSTANTS.IS_PLAFOND_REDUIT);
    const surplus = Math.max(0, resultatAvantIS - tranche);
    impotRevenu   = tranche * FISCAL_CONSTANTS.IS_TAUX_REDUIT + surplus * 0.25;
  } else {
    impotRevenu   = resultatAvantIS * 0.25;
  }

  // ✅ PFU 30% sur la part distribuée (opt-in via applyPFU)
  const applyPFU = (params?.applyPFU === true) || (inputData?.applyPFU === true);
  if (applyPFU) {
    const ratioDistrib = Math.max(0, Math.min(1, Number(inputData?.sciDistribution ?? params?.sciDistribution ?? 1)));
    const dividendes   = Math.max(0, resultatAvantIS - impotRevenu); // résultat après IS
    impotRevenu       += (dividendes * ratioDistrib) * 0.30;         // PFU sur la part distribuée
  }

  prelevementsSociaux     = 0;   // en société IS, PS non applicables au niveau société
  baseImposable           = resultatAvantIS;
  break;
}

    // ───────────────────────────────────────────────────────────
    // Par défaut : calque "nu réel"
    // ───────────────────────────────────────────────────────────
    default: {
      const chargesReelles = this.calculateRealCharges(inputData, params, interetsAnnuels);
      chargesDeductibles   = chargesReelles;
      baseImposable        = Math.max(0, revenusNets - chargesReelles);
      impotRevenu          = baseImposable * TMI;
      prelevementsSociaux  = baseImposable * FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Totaux & retours
  // ─────────────────────────────────────────────────────────────
  const totalImpots = impotRevenu + prelevementsSociaux + cotisationsSociales;

  // Charges cash pour le CF (la gestion a déjà été retranchée des revenus)
  const chargesCashAnnuel =
    Number(params.taxeFonciere ?? 0) +
    Number(params.entretienAnnuel ?? 0) +
    Number(params.assurancePNO ?? 0) * 12 +
    Number(params.chargesCoproNonRecup ?? 0) * 12;

  // 🆕 CF calculé en HC
  const cashflowNetAnnuel =
    revenusNetsCF -
    chargesCashAnnuel -
    totalImpots -
    mensualiteAnnuelle;

  // totalCharges pour l’affichage (amortissements ajoutés 1 seule fois)
  const isMicro = (key === 'nu_micro' || key === 'lmnp_micro');
  const totalCharges =
    (key === 'lmp')
      ? chargesDeductibles
      : chargesDeductibles + amortissementBien + amortissementMobilier + amortissementTravaux;

  return {
    // Revenus
    loyerHC,
    loyerAnnuelBrut: loyerAnnuelHC,
    vacanceLocative: Number(inputData.vacanceLocative ?? 0),
    vacanceAmount,                // CC (fiscal)
    gestionLocative: Number(params.gestionLocativeTaux ?? 0),
    fraisGestion,
    revenusNets,                  // fiscal (CC)
    revenusNetsCF,                // 🆕 cash-flow (HC)

    // Charges (lignes)
    interetsAnnuels,
    tauxAmortissement: amortissementBien > 0 ? FISCAL_CONSTANTS.LMNP_TAUX_AMORTISSEMENT_BIEN * 100 : 0,
    amortissementBien,
    amortissementMobilier,
    amortissementTravaux,
    chargesCopro: Number(inputData.chargesRecuperables ?? 0) * 12,
    chargesCoproNonRecup: Number(params.chargesCoproNonRecup ?? 0) * 12,
    entretienAnnuel: Number(params.entretienAnnuel ?? 0),
    taxeFonciere: Number(params.taxeFonciere ?? 0),
    assurancePNO: Number(params.assurancePNO ?? 0) * 12,
    totalCharges,

    // Fiscalité
    baseImposable,
    impotRevenu,
    prelevementsSociaux,
    cotisationsSociales,
    totalImpots,

    // Cash-flow
    capitalAnnuel,
    mensualiteAnnuelle,
    cashflowNetAnnuel,

    // Infos
    regime: this.getRegimeRegistry()[key]?.nom || regime.nom,
    abattementApplique: isMicro ? chargesDeductibles : 0,
    chargesReelles: this.calculateRealCharges(inputData, params, interetsAnnuels)
  };
}

    /**
     * Construit le tableau détaillé complet
     */
  buildDetailedTable(regime, inputData) {
    const params = this.getAllAdvancedParams(); // ⚠️ GARDE CETTE LIGNE !
    const calc = regime._detailedCalc;           // ✅ Utilise le calcul existant
        
        return `
            <table class="detailed-comparison-table" role="table">
                <caption class="sr-only">Détail complet des calculs fiscaux pour le régime ${regime.nom}</caption>
                <thead>
                    <tr>
                        <th colspan="3">📊 DÉTAIL COMPLET - ${regime.nom.toUpperCase()}</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.buildCoutInitialSection(inputData, params)}
                    ${this.buildRevenusSection(calc, params)}
                    ${this.buildChargesSection(calc, params)}
                    ${this.buildFiscaliteSection(calc, inputData)}
                    ${this.buildCashflowSection(calc, inputData)}
                    ${this.buildIndicateursSection(calc, inputData)}
                </tbody>
            </table>
        `;
    }

/**
 * Construit la section coût initial de l'opération
 */
buildCoutInitialSection(inputData, params, coutTotalProjet = null) {
  // Calcul des frais selon le type d'achat
  let fraisAcquisition = 0;
  let detailFrais = [];
  
  if (inputData.typeAchat === 'encheres') {
      // Frais pour vente aux enchères
      const droitsEnregistrement = inputData.price * (params.droitsEnregistrement / 100);
      const emoluments          = this.calculateEmoluments(inputData.price, params);
      const honorairesAvocat    = params.honorairesAvocat;
      const publiciteFonciere   = inputData.price * (params.publiciteFonciere / 100); // 🆕
      const tvaHonoraires       = honorairesAvocat * (params.tvaHonoraires / 100);    // 🆕
      const fraisDivers         = params.fraisFixes + params.avocatPorterEnchere + params.suiviDossier;
      
      // Inclure tous les postes dans le total d'acquisition (aligné avec calculateFraisAcquisition)
      fraisAcquisition = droitsEnregistrement + emoluments + honorairesAvocat + tvaHonoraires + publiciteFonciere + fraisDivers;
      
      detailFrais = [
          { label: "Droits d'enregistrement", value: droitsEnregistrement, formula: `${params.droitsEnregistrement}% du prix` },
          { label: "Émoluments du poursuivant", value: emoluments, formula: "Selon barème" },
          { label: "Honoraires avocat", value: honorairesAvocat, formula: "Forfait" },
          { label: "TVA sur honoraires", value: tvaHonoraires, formula: `${params.tvaHonoraires}% des honoraires` },              // 🆕
          { label: "Publicité foncière", value: publiciteFonciere, formula: `${params.publiciteFonciere}% du prix` },            // 🆕
          { label: "Frais divers (admin, suivi...)", value: fraisDivers, formula: "Frais fixes" }
      ];
  } else {
      // Frais pour achat classique
      const fraisNotaire = inputData.price * (params.fraisNotaireTaux / 100);
      const commission   = inputData.price * (params.commissionImmo / 100);
      
      fraisAcquisition = fraisNotaire + commission;
      
      detailFrais = [
          { label: "Frais de notaire", value: fraisNotaire, formula: `${params.fraisNotaireTaux}% du prix` },
          { label: "Commission immobilière", value: commission, formula: `${params.commissionImmo}% du prix` }
      ];
  }
  
  // Ajouter les frais bancaires
  const fraisBancaires = params.fraisBancairesDossier + params.fraisBancairesCompte + 
                         (inputData.loanAmount * params.fraisGarantie / 100);
  
  detailFrais.push({ 
      label: "Frais bancaires totaux", 
      value: fraisBancaires, 
      formula: "Dossier + compte + garantie" 
  });
  
  const coutTotalOperation = coutTotalProjet || inputData.coutTotalAcquisition || 
    (inputData.price + inputData.travauxRenovation + fraisAcquisition + fraisBancaires);
  
  return `
      <tr class="section-header">
          <td colspan="3"><strong>💰 COÛT INITIAL DE L'OPÉRATION</strong></td>
      </tr>
      <tr>
          <td>Prix d'achat du bien</td>
          <td class="text-right">${this.formatCurrency(inputData.price)}</td>
          <td class="formula">Prix négocié</td>
      </tr>
      ${inputData.travauxRenovation > 0 ? `
      <tr>
          <td>Travaux de rénovation</td>
          <td class="text-right">${this.formatCurrency(inputData.travauxRenovation)}</td>
          <td class="formula">Travaux initiaux</td>
      </tr>
      ` : ''}
      ${detailFrais.map(frais => `
      <tr>
          <td>${frais.label}</td>
          <td class="text-right">${this.formatCurrency(frais.value)}</td>
          <td class="formula">${frais.formula}</td>
      </tr>
      `).join('')}
      <tr class="total-row">
          <td><strong>Coût total de l'opération</strong></td>
          <td class="text-right"><strong>${this.formatCurrency(coutTotalOperation)}</strong></td>
          <td class="formula"><strong>Investissement total</strong></td>
      </tr>
      <tr>
          <td>Apport personnel</td>
          <td class="text-right">${this.formatCurrency(inputData.apport)}</td>
          <td class="formula">${((inputData.apport / coutTotalOperation) * 100).toFixed(1)}% du total</td>
      </tr>
      <tr>
          <td>Montant emprunté</td>
          <td class="text-right">${this.formatCurrency(inputData.loanAmount)}</td>
          <td class="formula">${((inputData.loanAmount / coutTotalOperation) * 100).toFixed(1)}% du total</td>
      </tr>
  `;
}
    /**
     * Calcule les émoluments pour les enchères
     */
    calculateEmoluments(price, params) {
        let emoluments = 0;
        
        // Tranche 1 : 0 à 6 500 €
        if (price > 0) {
            emoluments += Math.min(price, 6500) * (params.emolumentsTranche1 / 100);
        }
        
        // Tranche 2 : 6 500 à 23 500 €
        if (price > 6500) {
            emoluments += Math.min(price - 6500, 17000) * (params.emolumentsTranche2 / 100);
        }
        
        // Tranche 3 : 23 500 à 83 500 €
        if (price > 23500) {
            emoluments += Math.min(price - 23500, 60000) * (params.emolumentsTranche3 / 100);
        }
        
        // Tranche 4 : Au-delà de 83 500 €
        if (price > 83500) {
            emoluments += (price - 83500) * (params.emolumentsTranche4 / 100);
        }
        
        return emoluments;
    }
    // 🆕 AJOUTEZ LA NOUVELLE FONCTION ICI (juste après l'accolade fermante)
/**
 * Calcule tous les frais d'acquisition (classique ou enchères)
 * Intègre les paramètres auparavant “fantômes” :
 *  - coefMutation : multiplicateur sur les droits d’enregistrement
 *  - honorairesAvocatCoef : coefficient multiplicatif sur les honoraires
 *  - cautionMisePrix / cautionRestituee : coût si non restituée
 */
calculateFraisAcquisition(prix, typeAchat, params) {
  const P = Number(prix) || 0;

  if (typeAchat === 'encheres') {
    // Droits d'enregistrement × coefMutation (si fourni)
    const droits = P * (Number(params?.droitsEnregistrement ?? 0) / 100) *
                   (Number(params?.coefMutation ?? 1) || 1); // 🆕

    const emoluments = this.calculateEmoluments(P, params);

    // Honoraires × (1 + coef)
    const honorairesBase = Number(params?.honorairesAvocat ?? 0);
    const honorairesCoef = Number(params?.honorairesAvocatCoef ?? 0);
    const honoraires     = honorairesBase * (1 + honorairesCoef);         // 🆕

    const publiciteFonciere = P * (Number(params?.publiciteFonciere ?? 0) / 100);
    const tvaHonoraires     = honoraires * (Number(params?.tvaHonoraires ?? 0) / 100);

    // Frais divers + caution si NON restituée
    let fraisDivers = Number(params?.fraisFixes ?? 0)
                    + Number(params?.avocatPorterEnchere ?? 0)
                    + Number(params?.suiviDossier ?? 0);

    const cautionTaux = Number(params?.cautionMisePrix ?? 0) / 100;
    const caution     = P * (isFinite(cautionTaux) ? cautionTaux : 0);    // 🆕
    if (params?.cautionRestituee === false) {
      fraisDivers += caution;                                             // 🆕
    }

    return droits + emoluments + honoraires + tvaHonoraires + publiciteFonciere + fraisDivers;
  } else {
    const fraisNotaire = P * (Number(params?.fraisNotaireTaux ?? 0) / 100);
    const commission   = P * (Number(params?.commissionImmo ?? 0) / 100);
    return fraisNotaire + commission;
  }
}

  /**
 * Construit la section revenus (affichage corrigé de la formule de vacance)
 */
buildRevenusSection(calc, params) {
  return `
    <tr class="section-header">
      <td colspan="3"><strong>💰 REVENUS LOCATIFS</strong></td>
    </tr>
    <tr>
      <td>Loyer mensuel HC</td>
      <td class="text-right">${this.formatCurrency(calc.loyerHC)}</td>
      <td class="formula">Loyer hors charges</td>
    </tr>
    <tr>
      <td>Loyer annuel brut</td>
      <td class="text-right">${this.formatCurrency(calc.loyerAnnuelBrut)}</td>
      <td class="formula">= ${calc.loyerHC} × 12 mois</td>
    </tr>
    <tr>
      <td>Vacance locative (${calc.vacanceLocative}%)</td>
      <td class="text-right negative">-${this.formatCurrency(calc.vacanceAmount)}</td>
      <td class="formula">= (Loyer HC + charges récup.) × 12 × ${calc.vacanceLocative}%</td>
    </tr>
    ${calc.fraisGestion > 0 ? `
    <tr>
      <td>Frais de gestion (${params.gestionLocativeTaux}%)</td>
      <td class="text-right negative">-${this.formatCurrency(calc.fraisGestion)}</td>
      <td class="formula">= Loyer net × ${params.gestionLocativeTaux}%</td>
    </tr>
    ` : ''}
    <tr class="total-row">
      <td><strong>Revenus locatifs nets</strong></td>
      <td class="text-right"><strong>${this.formatCurrency(calc.revenusNets)}</strong></td>
      <td></td>
    </tr>
  `;
}

/**
 * Construit la section charges (triées par impact)
 */
buildChargesSection(calc, params) {
    const charges = [];
    
    // Pour les régimes micro, afficher l'abattement forfaitaire
    if (calc.regime.includes('Micro')) {
        charges.push({
            label: `Abattement forfaitaire (${calc.regime === 'Micro-foncier' ? '30%' : '50%'})`,
            value: calc.abattementApplique,
            formula: 'Sur revenus nets'
        });
    } else {
        // Pour les régimes réels, détailler toutes les charges
        charges.push(
            { label: "Intérêts d'emprunt", value: calc.interetsAnnuels, formula: "Selon échéancier" },
            calc.amortissementBien > 0 ? { label: "Amortissement bien", value: calc.amortissementBien, formula: `${calc.tauxAmortissement}% × valeur` } : null,
            calc.amortissementMobilier > 0 ? { label: "Amortissement mobilier", value: calc.amortissementMobilier, formula: "10% × 10% du prix" } : null,
            
            // 🆕 LIGNE AJOUTÉE : Amortissement des travaux
            calc.amortissementTravaux > 0 ? { 
                label: "Amortissement travaux", 
                value: calc.amortissementTravaux, 
                formula: "2.5% × coût travaux" 
            } : null,
            
            { label: "Taxe foncière", value: calc.taxeFonciere, formula: "Paramètre avancé" },
            // { label: "Charges copro récupérables", value: calc.chargesCopro, formula: "12 × charges mensuelles" }, // Commenté car non déductible
            calc.chargesCoproNonRecup > 0 ? { label: "Charges copro non récupérables", value: calc.chargesCoproNonRecup, formula: `${params.chargesCoproNonRecup} × 12` } : null,
            { label: "Assurance PNO", value: calc.assurancePNO, formula: `${params.assurancePNO} × 12` },
            { label: "Entretien annuel", value: calc.entretienAnnuel, formula: "Budget annuel" }
        );
    }
    
    const validCharges = charges.filter(Boolean).sort((a, b) => b.value - a.value);
    
    return `
        <tr class="section-header">
            <td colspan="3"><strong>📉 CHARGES DÉDUCTIBLES</strong></td>
        </tr>
        ${validCharges.map(charge => `
        <tr>
            <td>${charge.label}</td>
            <td class="text-right negative">-${this.formatCurrency(charge.value)}</td>
            <td class="formula">${charge.formula}</td>
        </tr>
        `).join('')}
        ${calc.regime.includes('Micro') && calc.chargesReelles > calc.abattementApplique ? `
        <tr class="warning-row">
            <td colspan="3" style="color: #f59e0b; font-style: italic;">
                ⚠️ Charges réelles (${this.formatCurrency(calc.chargesReelles)}) > Abattement (${this.formatCurrency(calc.abattementApplique)})
                → Le régime réel serait plus avantageux
            </td>
        </tr>
        ` : ''}
        <tr class="total-row">
            <td><strong>Total charges déductibles</strong></td>
            <td class="text-right negative"><strong>-${this.formatCurrency(calc.totalCharges)}</strong></td>
            <td></td>
        </tr>
    `;
}

    /**
     * Construit la section fiscalité
     */
buildFiscaliteSection(calc, inputData) {
    const isSCI = calc.regime === "SCI à l'IS";
    const isIRNegatif = typeof calc.impotRevenu === 'number' && calc.impotRevenu < 0;

    // Helpers d’affichage
    const fmt = v => this.formatCurrency(Math.abs(Number(v) || 0));
    const has = v => typeof v === 'number' && isFinite(v) && Math.abs(v) > 0;

    // Libellé IR
    const libIR = isSCI ? '(IS)' : `(TMI ${Number(inputData.tmi) || 0}%)`;
    const formIR = isSCI ? 'Barème IS' : `= Base × ${Number(inputData.tmi) || 0}%`;

    // Ligne IR (montant négatif = économie → affichée en positif, classe “positive”)
    const irValueCell = isIRNegatif
        ? `<td class="text-right positive">+${fmt(calc.impotRevenu)}</td>`
        : `<td class="text-right negative">-${fmt(calc.impotRevenu)}</td>`;

    const irFormulaCell = isIRNegatif
        ? `<td class="formula">Économie d'impôt (déficit/imputation)</td>`
        : `<td class="formula">${formIR}</td>`;

    // Total impôts : si négatif → économie nette
    const totalImpotsNeg = has(calc.totalImpots) && calc.totalImpots < 0;
    const totalImpotsCell = totalImpotsNeg
        ? `<td class="text-right positive"><strong>+${fmt(calc.totalImpots)}</strong></td>`
        : `<td class="text-right negative"><strong>-${fmt(calc.totalImpots)}</strong></td>`;

    const totalImpotsLabel = totalImpotsNeg
        ? `<strong>Économie nette</strong>`
        : `<strong>Total impôts</strong>`;

    return `
        <tr class="section-header">
            <td colspan="3"><strong>📊 CALCUL FISCAL</strong></td>
        </tr>

        <tr>
            <td>Revenus nets</td>
            <td class="text-right">${this.formatCurrency(calc.revenusNets)}</td>
            <td class="formula">Après vacance et gestion</td>
        </tr>

        <tr>
            <td>- Charges déductibles</td>
            <td class="text-right negative">-${this.formatCurrency(calc.totalCharges)}</td>
            <td class="formula">Total ci-dessus</td>
        </tr>

        <tr>
            <td><strong>Base imposable</strong></td>
            <td class="text-right"><strong>${this.formatCurrency(calc.baseImposable)}</strong></td>
            <td class="formula">= Max(0, revenus - charges)</td>
        </tr>

        <tr>
            <td>Impôt sur le revenu ${libIR}</td>
            ${irValueCell}
            ${irFormulaCell}
        </tr>

        ${
            has(calc.cotisationsSociales)
                ? `
        <tr>
            <td>Cotisations sociales (LMP)</td>
            <td class="text-right negative">-${fmt(calc.cotisationsSociales)}</td>
            <td class="formula">Assises sur bénéfice BIC pro</td>
        </tr>`
                : ''
        }

        ${
            has(calc.prelevementsSociaux)
                ? `
        <tr>
            <td>Prélèvements sociaux (17.2%)</td>
            <td class="text-right negative">-${fmt(calc.prelevementsSociaux)}</td>
            <td class="formula">Selon régime</td>
        </tr>`
                : ''
        }

        <tr class="total-row">
            <td>${totalImpotsLabel}</td>
            ${totalImpotsCell}
            <td></td>
        </tr>
    `;
}

    /**
     * Construit la section cash-flow
     */
buildCashflowSection(calc, inputData) {
    const mensualiteAnnuelle = inputData.monthlyPayment * 12;
    
    // Recalculer les charges cash pour l'affichage
const chargesCashAnnuel = 
    calc.taxeFonciere +
    calc.chargesCoproNonRecup +
    calc.entretienAnnuel +
    calc.assurancePNO;
    
    return `
        <tr class="section-header">
            <td colspan="3"><strong>💰 CASH-FLOW</strong></td>
        </tr>
        <tr>
            <td>Revenus nets après impôts</td>
            <td class="text-right positive">+${this.formatCurrency(calc.revenusNetsCF - calc.totalImpots)}</td>
            <td class="formula">= Revenus - impôts</td>
        </tr>
        <tr>
            <td>Charges cash annuelles</td>
            <td class="text-right negative">-${this.formatCurrency(chargesCashAnnuel)}</td>
            <td class="formula">  TF + copro + entretien + PNO${calc.fraisGestion ? ' (gestion déjà déduite des revenus)' : ''}</td>
        </tr>
        <tr>
            <td>Mensualité crédit (capital + intérêts)</td>
            <td class="text-right negative">-${this.formatCurrency(mensualiteAnnuelle)}</td>
            <td class="formula">= ${this.formatNumber(inputData.monthlyPayment)} × 12</td>
        </tr>
        <tr>
            <td>Dont remboursement capital</td>
            <td class="text-right">-${this.formatCurrency(calc.capitalAnnuel)}</td>
            <td class="formula">Enrichissement</td>
        </tr>
        <tr class="total-row ${calc.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
            <td><strong>Cash-flow net annuel</strong></td>
            <td class="text-right"><strong>${this.formatCurrency(calc.cashflowNetAnnuel)}</strong></td>
            <td><strong>${calc.cashflowNetAnnuel >= 0 ? 'Bénéfice' : 'Déficit'}</strong></td>
        </tr>
        <tr>
            <td>Cash-flow mensuel moyen</td>
            <td class="text-right ${calc.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                ${this.formatCurrency(calc.cashflowNetAnnuel / 12)}
            </td>
            <td class="formula">= Annuel ÷ 12</td>
        </tr>
    `;
}

    /**
     * Construit la section indicateurs
     * ───────────────────────────────────────────────────────────
     * 1. Cash-on-Cash        = Cash-flow net annuel / Apport
     * 2. Rendement net réel  = Revenus nets / Coût total du projet
     * 3. Taux de couverture  = Revenus nets / Mensualités de crédit
     */
buildIndicateursSection(calc, inputData) {
    // Récupération des constantes fiscales
    const PS = FISCAL_CONSTANTS.PRELEVEMENTS_SOCIAUX || 0.172;
    
    // Calcul du coût total du projet
    const coutTotalProjet = inputData.coutTotalAcquisition || 
                           (inputData.price + (inputData.travauxRenovation || 0) + (inputData.price * 0.10));
    
    // Mensualité annuelle
    const mensualiteAnnuelle = inputData.monthlyPayment * 12;
    
    /* 1️⃣ Cash-on-Cash return (gérer apport = 0) */
    const cashOnCash = inputData.apport > 0 
        ? (calc.cashflowNetAnnuel / inputData.apport) * 100 
        : null;
        
    /* 2️⃣ Rendement net sur coût total (loyers - charges non récupérables) */
const revenuNetReel = (calc.revenusNetsCF
  - calc.taxeFonciere
  - calc.chargesCoproNonRecup
  - calc.entretienAnnuel
  - calc.assurancePNO);
const rendementNetReel = (revenuNetReel / coutTotalProjet) * 100;
    
/* 3️⃣ Taux de couverture du crédit (DSCR) */
const dscr = mensualiteAnnuelle > 0
    ? (revenuNetReel / mensualiteAnnuelle)
    : 1;
const tauxCouverture = dscr * 100;
    
    return `
        <tr class="section-header">
            <td colspan="3"><strong>📈 INDICATEURS DE PERFORMANCE</strong></td>
        </tr>
        <tr>
            <td>Cash-on-Cash return</td>
            <td class="text-right ${cashOnCash !== null && cashOnCash >= 0 ? 'positive' : 'negative'}">
                ${cashOnCash !== null ? cashOnCash.toFixed(2) + '%' : '—'}
            </td>
            <td class="formula">${cashOnCash !== null ? '= Cash-flow / Apport' : 'Pas d\'apport'}</td>
        </tr>
        <tr>
            <td>Rendement net sur coût total</td>
            <td class="text-right ${rendementNetReel >= 0 ? 'positive' : 'negative'}">
                ${rendementNetReel.toFixed(2)}%
            </td>
            <td class="formula">= Revenus nets / Coût total</td>
        </tr>
        <tr>
            <td>Taux de couverture du crédit</td>
            <td class="text-right ${tauxCouverture >= 100 ? 'positive' : 'negative'}">
                ${tauxCouverture.toFixed(0)}%
            </td>
            <td class="formula">= Revenus nets / Mensualités</td>
        </tr>
    `;
}

/**
 * Prépare les données pour la comparaison fiscale - VERSION COMPLÈTE
 */
prepareFiscalData() {
    // Récupérer les données de ville sélectionnée
    const villeData = window.villeSearchManager?.getSelectedVilleData();
    
    // SIMPLIFICATION : Toujours HC + charges
    const loyerHC = parseFloatOrDefault('monthlyRent', 0);
    const charges = parseFloatOrDefault('monthlyCharges', 50);
    const loyerCC = loyerHC + charges;
    
    // Récupérer tous les paramètres avancés
    const allParams = this.getAllAdvancedParams();
    
    console.log('💰 Calcul des loyers:', {
        loyerHC,
        charges,
        loyerCC
    });
    
    // Récupérer TOUS les paramètres du formulaire
    const formData = {
        // Localisation
        city: villeData?.ville || document.getElementById('propertyCity')?.value || '',
        department: villeData?.departement || document.getElementById('propertyDepartment')?.value || '',
        
        // Détails du bien
        propertyType: document.getElementById('propertyType')?.value || 'appartement',
        surface: parseFloat(document.getElementById('propertySurface')?.value) || 0,
        price: parseFloat(document.getElementById('propertyPrice')?.value) || 0,
        monthlyRent: loyerHC, // Toujours HC pour les calculs fiscaux
        
        // Financement
        apport: parseFloat(document.getElementById('apport')?.value) || 0,
        loanRate: parseFloat(document.getElementById('loanRate')?.value) || 2.5,
        loanDuration: parseInt(document.getElementById('loanDuration')?.value) || 20,
        
        // Fiscal
        tmi: parseFloat(document.getElementById('tmi')?.value) || 30,
        
        // Charges
        monthlyCharges: charges,
        taxeFonciere: allParams.taxeFonciere,
        
        // NOUVEAU : Séparer travaux et entretien
        travauxRenovation: allParams.travauxRenovation,
        entretienAnnuel: allParams.entretienAnnuel,
        
        // NOUVEAU : Charges de copropriété non récupérables
        chargesCoproNonRecup: allParams.chargesCoproNonRecup,
        
        // Paramètres avancés
       gestionLocativeTaux: allParams.gestionLocativeTaux,
       vacanceLocative: parseFloatOrDefault('vacanceLocative', 0),
        
        // Mode d'achat
        typeAchat: document.querySelector('input[name="type-achat"]:checked')?.value || 'classique',
        
        // NOUVEAU : Tous les paramètres avancés
        ...allParams
    };
    
// 🆕 Calcul des frais d'acquisition
const fraisAcquisition = this.calculateFraisAcquisition(
    formData.price,
    formData.typeAchat,
    allParams
);

// 🆕 Calcul analytique de l'emprunt (comme dans immo-simulation.js)
const fraisDossier = allParams.fraisBancairesDossier;
const fraisCompte = allParams.fraisBancairesCompte;
const tauxGarantie = allParams.fraisGarantie / 100;

// Coût hors frais bancaires
const coutHorsFraisB = formData.price + allParams.travauxRenovation + fraisAcquisition;

// Formule analytique pour l'emprunt
const loanAmount = (coutHorsFraisB - formData.apport + fraisDossier + fraisCompte) 
                 / (1 - tauxGarantie);

// Frais bancaires réels
const fraisBancaires = fraisDossier + fraisCompte + (loanAmount * tauxGarantie);

// Coût total final
const coutTotalFinal = coutHorsFraisB + fraisBancaires;

// Calcul de la mensualité
const monthlyPayment = this.calculateMonthlyPayment(
    loanAmount, 
    formData.loanRate, 
    formData.loanDuration
);

// GARDEZ ces deux lignes qui étaient déjà là
const yearlyRent = loyerHC * 12 * (1 - formData.vacanceLocative / 100);
const yearlyCharges = charges * 12;
    
    // Ajouter les frais de gestion si applicable
    const gestionFees = formData.gestionLocativeTaux > 0 ? 
    yearlyRent * (formData.gestionLocativeTaux / 100) : 0;
    
    // Stocker dans la console pour debug
    console.log('📊 Données fiscales préparées:', formData);
    console.log('🏙️ Ville sélectionnée:', villeData);
  console.log('💸 Coût total acquisition:', coutTotalFinal);
    console.log('🏛️ Paramètres enchères:', {
        emoluments: [formData.emolumentsTranche1, formData.emolumentsTranche2, formData.emolumentsTranche3, formData.emolumentsTranche4],
        honorairesCoef: formData.honorairesAvocatCoef,
        tvaHonoraires: formData.tvaHonoraires,
        cautionRestituee: formData.cautionRestituee
    });
    
    // Format compatible avec le comparateur fiscal existant
return {
    typeAchat: formData.typeAchat,
    prixBien: formData.price,
    surface: formData.surface,
    apport: formData.apport,
    duree: formData.loanDuration,
    taux: formData.loanRate,
    loyerMensuel: loyerHC,
    tmi: formData.tmi,
    chargesCopro: charges,
    
    // Données étendues pour l'affichage
    ...formData,
    loyerHC: loyerHC,
    loyerCC: loyerCC,
    chargesRecuperables: charges,
    loanAmount,
    monthlyPayment,
    yearlyRent,
    yearlyCharges,
    gestionFees,
    
      // 🆕 Ajout du booléen gestionLocative
    gestionLocative: allParams.gestionLocativeTaux > 0,
    
    // 🆕 REMPLACEZ par ces 3 lignes :
    coutTotalAcquisition: coutTotalFinal,  // Utiliser la bonne variable !
    fraisAcquisition: fraisAcquisition,
    fraisBancaires: fraisBancaires,
    
    timestamp: new Date().toISOString()
};
}


    /**
     * Génère des recommandations globales
     */
    generateGlobalRecommendations(marketAnalysis, fiscalResults) {
        const recommendations = [];
        
        // Recommandations basées sur l'analyse de marché
        if (marketAnalysis.hasMarketData) {
            if (marketAnalysis.priceAnalysis.position === 'excellent') {
                recommendations.push({
                    type: 'success',
                    icon: 'fa-trophy',
                    title: 'Excellent prix d\'achat',
                    description: `Vous avez acheté ${Math.abs(marketAnalysis.priceAnalysis.difference).toFixed(0)}% en dessous du marché, soit une économie de ${this.formatNumber(Math.abs(marketAnalysis.priceAnalysis.savings))}€.`
                });
            } else if (marketAnalysis.priceAnalysis.position === 'overpriced') {
                recommendations.push({
                    type: 'warning',
                    icon: 'fa-exclamation-triangle',
                    title: 'Prix d\'achat élevé',
                    description: `Vous avez payé ${marketAnalysis.priceAnalysis.difference.toFixed(0)}% au-dessus du marché. L'optimisation fiscale est cruciale pour compenser.`
                });
            }
            
            if (marketAnalysis.rentAnalysis.position === 'low' || marketAnalysis.rentAnalysis.position === 'underpriced') {
                recommendations.push({
                    type: 'info',
                    icon: 'fa-chart-line',
                    title: 'Potentiel d\'augmentation du loyer',
                    description: `Votre loyer pourrait être augmenté de ${this.formatNumber(Math.abs(marketAnalysis.rentAnalysis.potential))}€/mois pour atteindre le prix du marché.`
                });
            }
        }
        
        // Recommandations fiscales
        if (fiscalResults && fiscalResults.length > 0) {
            const bestRegime = fiscalResults[0];
            const worstRegime = fiscalResults[fiscalResults.length - 1];
            const savings = bestRegime.cashflowNetAnnuel - worstRegime.cashflowNetAnnuel;
            
            recommendations.push({
                type: 'primary',
                icon: 'fa-balance-scale',
                title: `Régime optimal : ${bestRegime.nom}`,
                description: `Ce régime vous permet d'économiser ${this.formatNumber(savings)}€/an par rapport au régime le moins avantageux.`
            });
            
            if (bestRegime.cashflowNetAnnuel > 0) {
                recommendations.push({
                    type: 'success',
                    icon: 'fa-coins',
                    title: 'Investissement rentable',
                    description: `Avec le régime ${bestRegime.nom}, vous générez ${this.formatNumber(bestRegime.cashflowNetAnnuel)}€/an de cash-flow net après impôts.`
                });
            }
        }
        
        // Score global et recommandation finale
        if (marketAnalysis.globalScore > 75) {
            recommendations.push({
                type: 'success',
                icon: 'fa-star',
                title: 'Excellent investissement global',
                description: 'Votre investissement est bien positionné sur le marché. L\'optimisation fiscale le rendra encore plus rentable.'
            });
        } else if (marketAnalysis.globalScore < 40) {
            recommendations.push({
                type: 'warning',
                icon: 'fa-info-circle',
                title: 'Optimisation nécessaire',
                description: 'Votre investissement nécessite une attention particulière. Le choix du bon régime fiscal est crucial pour sa rentabilité.'
            });
        }
        
        return recommendations;
    }

    /**
     * Formate un nombre
     */
    formatNumber(num) {
        return new Intl.NumberFormat('fr-FR', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(Math.round(num));
    }

    /**
     * Formate une devise
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    }
        /**
     * Détermine la classe CSS selon le rendement
     * @param {number} r - Rendement en pourcentage
     * @returns {string} 'positive' | 'neutral' | 'negative'
     */
    getRendementClass(r) {
        if (r > 4.5)  return 'positive'; // vert
        if (r < 2.5)  return 'negative'; // rouge
        return 'neutral';                // gris
    }

    /**
     * Calcul de mensualité de prêt
     */
    calculateMonthlyPayment(loanAmount, annualRate, years) {
        const monthlyRate = annualRate / 100 / 12;
        const numPayments = years * 12;
        
        if (monthlyRate === 0) return loanAmount / numPayments;
        
        return loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments) / 
               (Math.pow(1 + monthlyRate, numPayments) - 1);
    }

/**
 * Génère le HTML pour afficher les résultats fiscaux améliorés - VERSION COMPLÈTE (ancrage sur calcul réel)
 */
generateFiscalResultsHTML(fiscalResults, inputData, opts = {}) {
  // ✅ Sécurité
  if (!Array.isArray(fiscalResults) || fiscalResults.length === 0) {
    return '<div class="market-comparison-card"><p>Aucun résultat fiscal à afficher.</p></div>';
  }

  // Helpers (tolérants aux champs manquants)
  const fmt = (v) =>
    this.formatCurrency
      ? this.formatCurrency(v || 0)
      : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

  const rendementClass = (x) =>
    this.getRendementClass ? this.getRendementClass(x) : (x >= 6 ? 'positive' : x >= 3 ? 'neutral' : 'negative');

  const buildDetail = (regime, data) =>
    this.buildDetailedTable ? this.buildDetailedTable(regime, data) : '<div class="market-comparison-card"><p>Détails indisponibles.</p></div>';

  // Normalisation des champs d'entrée communs
  const yearlyRent      = Number(inputData.yearlyRent ?? (inputData.loyerHC ?? inputData.loyerMensuel ?? 0) * 12) || 0;
  const monthlyPayment  = Number(inputData.monthlyPayment ?? inputData.mensualite ?? 0) || 0;
  const yearlyPayment   = monthlyPayment * 12;
  const totalCost       = Number(inputData.coutTotalAcquisition ?? inputData.price ?? inputData.prixBien ?? inputData.prixPaye ?? 0) || 0;

  // Déterminer le meilleur régime
  const bestRegime = fiscalResults.reduce(
    (a, b) => ((a?.cashflowNetAnnuel ?? -Infinity) > (b?.cashflowNetAnnuel ?? -Infinity) ? a : b),
    fiscalResults[0]
  );

  // ✅ Utiliser les IDs pour la robustesse (détail, sélection, meilleur)
  const selectedId     = opts.selectedId || null;
  const bestIdFromOpts = opts.bestId || null;
  const forceRegime    = !!opts.forceRegime;

  const detailRegime =
    fiscalResults.find((r) => r.id === opts.detailId) ||
    bestRegime;

  // ————————————————————————————————————————————————
  // Bloc “estimation” ancré sur le calcul réel si dispo
  // ————————————————————————————————————————————————
  const yearlyCharges      = Number(inputData.yearlyCharges ?? 0) || 0;
  const taxeFonciere       = Number(inputData.taxeFonciere ?? 0) || 0;
  const loanAmount         = Number(inputData.loanAmount ?? inputData.montantEmprunte ?? 0) || 0;
  const loanRate           = Number(inputData.loanRate ?? inputData.taux ?? 0) || 0; // %
  const loanDuration       = Number(inputData.loanDuration ?? inputData.duree ?? 0) || 0;
  const gestionFees        = Number(inputData.gestionFees ?? inputData.gestionLocativeMontant ?? 0) || 0;
  const entretienAnnuel    = Number(inputData.entretienAnnuel ?? 0) || 0;
  const chargesCoproNRmois = Number(inputData.chargesCoproNonRecup ?? 0) || 0;

  // Intérêts annuels réalistes via calculateAnnualInterests
  const interetsAnnuelsEstimes = this.calculateAnnualInterests(
    { loanAmount, loanRate, loanDuration },
    { tableauAmortissement: inputData.tableauAmortissement || [] },
    1
  );

  // 🔗 Ancrage estimation sur le calcul réel du régime (si dispo)
  const r            = detailRegime?._detailedCalc;
  const affRevenus   = r ? r.revenusNetsCF
                         : (yearlyRent - gestionFees); // fallback simple (HC - gestion)
  const affCharges   = r ? r.totalCharges
                         : (yearlyCharges
                            + taxeFonciere
                            + interetsAnnuelsEstimes
                            + gestionFees
                            + entretienAnnuel
                            + (chargesCoproNRmois * 12));
  const affBaseImp   = r ? r.baseImposable
                         : Math.max(0, affRevenus - affCharges);
  const affImpots    = r ? r.totalImpots
                         : Math.abs(detailRegime.impotAnnuel || 0);

  // Rendu principal
  return `
    <!-- Résumé du bien -->
    <div class="property-summary">
      <h3>📊 Résumé de votre investissement</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">🏛️ Type d'acquisition:</span>
          <span class="value">${inputData.typeAchat === 'encheres' ? 'Vente aux enchères' : 'Achat classique'}</span>
        </div>
        <div class="summary-item">
          <span class="label">📍 Localisation:</span>
          <span class="value">${inputData.city || inputData.ville?.nom || 'Non renseignée'}${inputData.department ? ` (${inputData.department})` : ''}</span>
        </div>
        <div class="summary-item">
          <span class="label">🏠 Bien:</span>
          <span class="value">${(inputData.propertyType || 'Logement')} - ${(inputData.surface || 0)} m²</span>
        </div>
        <div class="summary-item">
          <span class="label">💰 Prix d'achat:</span>
          <span class="value">${fmt(inputData.price ?? inputData.prixBien ?? inputData.prixPaye ?? 0)}</span>
        </div>
        ${Number(inputData.travauxRenovation ?? 0) > 0 ? `
        <div class="summary-item">
          <span class="label">🔨 Travaux initiaux:</span>
          <span class="value">${fmt(inputData.travauxRenovation)}</span>
        </div>` : ''}
        <div class="summary-item">
          <span class="label">💸 Coût total:</span>
          <span class="value" style="font-weight: 600; color: #00bfff;">${fmt(totalCost)}</span>
        </div>
        <div class="summary-item">
          <span class="label">🏦 Financement:</span>
          <span class="value">${(loanRate || inputData.taux || 0)}% sur ${(inputData.loanDuration ?? inputData.duree ?? 0)} ans</span>
        </div>
        <div class="summary-item">
          <span class="label">💵 Loyer mensuel (HC estimé):</span>
          <span class="value">${fmt((yearlyRent / 12) || (inputData.loyerHC ?? inputData.loyerMensuel ?? 0))}</span>
        </div>
        <div class="summary-item">
          <span class="label">📊 TMI:</span>
          <span class="value">${inputData.tmi ?? 0}%</span>
        </div>
        ${chargesCoproNRmois ? `
        <div class="summary-item">
          <span class="label">🏢 Charges copro non récup.:</span>
          <span class="value">${fmt(chargesCoproNRmois)}/mois</span>
        </div>` : ''}
      </div>

      ${(inputData.gestionLocative || (inputData.vacanceLocative ?? 0) > 5 || (inputData.travauxRenovation ?? 0) > 0 || inputData.typeAchat === 'encheres') ? `
      <div class="parameter-modified" style="margin-top:10px;padding:10px;background:rgba(255,193,7,0.1);border-radius:6px;">
        <i class="fas fa-info-circle" style="color:#ffc107;"></i>
        Paramètres avancés pris en compte :
        ${inputData.gestionLocative ? ' Gestion locative' : ''}
        ${(inputData.vacanceLocative ?? 0) > 5 ? ` Vacance locative (${inputData.vacanceLocative}%)` : ''}
        ${(inputData.travauxRenovation ?? 0) > 0 ? ` Travaux initiaux (${fmt(inputData.travauxRenovation)})` : ''}
        ${inputData.typeAchat === 'encheres' ? ' Frais enchères personnalisés' : ''}
      </div>` : ''}
    </div>

    <!-- Carte du régime détaillé -->
    <div class="best-regime-card">
      <h3>
        ${forceRegime && selectedId ? '⚖️ Régime fiscal choisi' : '🏆 Meilleur régime fiscal'} :
        ${detailRegime.nom}
      </h3>

      <div class="regime-benefits">
        <div class="benefit-item">
          <h4>💸 Cash-flow mensuel</h4>
          <p class="amount ${detailRegime.cashflowMensuel >= 0 ? 'positive' : 'negative'}">
            ${detailRegime.cashflowMensuel >= 0 ? '+' : ''}${fmt(detailRegime.cashflowMensuel)}
          </p>
        </div>
        <div class="benefit-item">
          <h4>📊 Rendement brut / coût total</h4>
          <p class="amount ${rendementClass((yearlyRent / (totalCost || 1)) * 100)}">
            ${((yearlyRent / (totalCost || 1)) * 100).toFixed(2)} %
          </p>
        </div>
      </div>

      <!-- Détail du calcul (affichage) -->
      <div class="fiscal-calculation-details">
        <h4>📋 Détail du calcul avec vos données</h4>
        <table class="calculation-table">
          <tr>
            <td>Revenus nets (base CF) :</td>
            <td class="positive">+${fmt(affRevenus)}</td>
          </tr>
          <tr>
            <td>Charges déductibles (selon régime) :</td>
            <td class="negative">-${fmt(affCharges)}</td>
          </tr>
          <tr>
            <td>Base imposable (estimation) :</td>
            <td>${fmt(affBaseImp)}</td>
          </tr>
          <tr>
            <td>Impôts & prélèvements (estimation) :</td>
            <td class="negative">-${fmt(Math.abs(affImpots))}</td>
          </tr>
          <tr>
            <td>Mensualités de crédit (annuelles) :</td>
            <td class="negative">-${fmt(yearlyPayment)}</td>
          </tr>
          <tr class="total-row">
            <td><strong>Résultat net annuel :</strong></td>
            <td class="${(detailRegime.cashflowNetAnnuel ?? 0) >= 0 ? 'positive' : 'negative'}">
              <strong>${fmt(detailRegime.cashflowNetAnnuel || 0)}</strong>
            </td>
          </tr>
        </table>

        <button class="btn-expand-table" id="btn-fiscal-detail" type="button">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
          <span>Voir le détail complet</span>
        </button>
      </div>
    </div>

    <!-- Tableau détaillé (caché par défaut) -->
    <div id="detailed-fiscal-table" style="display:none;">
      ${buildDetail(detailRegime, inputData)}
    </div>

    <!-- Tableau comparatif avec badges -->
    <div class="comparison-table">
      <h3>📊 Comparaison des régimes fiscaux</h3>
      <table>
        <thead>
          <tr>
            <th>Régime</th>
            <th>Cash-flow mensuel</th>
            <th>Cash-flow annuel</th>
            <th>Impôt annuel</th>
            <th>cash-flow / coût total</th>
          </tr>
        </thead>
        <tbody>
          ${
            fiscalResults.map(regime => {
              const rendementNet = (Number(regime.cashflowNetAnnuel || 0) / (totalCost || 1)) * 100;
              const isSelected   = selectedId ? regime.id === selectedId : false;
              const isBest       = bestIdFromOpts ? regime.id === bestIdFromOpts : regime.id === bestRegime.id;

              return `
                <tr class="${isBest ? 'best-regime' : ''}">
                  <td>
                    <i class="fas ${regime.icone || 'fa-home'}"></i>
                    ${regime.nom}
                    ${isSelected ? '<span class="regime-badge current">Régime actuel</span>' : ''}
                    ${isBest ? '<span class="regime-badge">Meilleur</span>' : ''}
                  </td>
                  <td class="${(regime.cashflowMensuel ?? 0) >= 0 ? 'positive' : 'negative'}">
                    ${fmt(regime.cashflowMensuel || 0)}
                  </td>
                  <td class="${(regime.cashflowNetAnnuel ?? 0) >= 0 ? 'positive' : 'negative'}">
                    ${fmt(regime.cashflowNetAnnuel || 0)}
                  </td>
                  <td>${fmt(Math.abs(regime.impotAnnuel || 0))}</td>
                  <td class="${rendementClass(rendementNet)}">
                    ${isFinite(rendementNet) ? rendementNet.toFixed(2) : '—'}%
                  </td>
                </tr>`;
            }).join('')
          }
        </tbody>
      </table>
    </div>

    <!-- Conteneurs de graphiques (scripts existants inchangés) -->
    <div class="charts-container" style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:30px 0;">
      <div class="chart-wrapper">
        <h4 style="text-align:center;color:#e2e8f0;">Cash-flow net annuel par régime</h4>
        <canvas id="fiscal-cashflow-chart" style="height:300px;"></canvas>
      </div>
      <div class="chart-wrapper">
        <h4 style="text-align:center;color:#e2e8f0;">Rendement net par régime</h4>
        <canvas id="fiscal-rendement-chart" style="height:300px;"></canvas>
      </div>
    </div>

    <!-- Debug helper -->
    <script>
      window.lastAnalysisData = {
        input: ${JSON.stringify(inputData || {})},
        results: ${JSON.stringify(fiscalResults || [])},
        timestamp: new Date()
      };
      console.log('✅ Analyse fiscale: rendu HTML généré.');
    </script>
  `;
}

/**
 * Génère le tableau de comparaison détaillé
 * (corrige l’unité du loyer : affichage mensuel HC, dérivé de sources annuelles si besoin)
 */
generateDetailedComparisonTable(classique, encheres, modeActuel) {
  const data = modeActuel === 'classique' ? classique : encheres;
  const compareData = modeActuel === 'classique' ? encheres : classique;

  // ✅ Sécurise le nom du coût total (compat: coutTotal / coutTotalAcquisition)
  const coutA = Number(data.coutTotal ?? data.coutTotalAcquisition ?? 0);
  const coutB = Number(compareData.coutTotal ?? compareData.coutTotalAcquisition ?? 0);

  // Helpers pour sécuriser l’unité mensuelle
  const monthlyHC = (o) =>
    (o?.loyerMensuel ?? o?.loyerHC ??
      (typeof o?.loyerBrutHC === 'number' ? o.loyerBrutHC / 12 :
       (typeof o?.loyerBrut === 'number'   ? o.loyerBrut   / 12 : 0)));
  const monthlyNet = (o) =>
    (o?.loyerNetMensuel ?? (typeof o?.loyerNet === 'number' ? o.loyerNet / 12 : undefined));

  const mDataHC  = monthlyHC(data);
  const mCompHC  = monthlyHC(compareData);
  const mDataNet = monthlyNet(data) ?? mDataHC;          // fallback raisonnable
  const mCompNet = monthlyNet(compareData) ?? mCompHC;   // fallback raisonnable

  return `
      <table class="detailed-comparison-table">
          <thead>
              <tr>
                  <th>Critère</th>
                  <th>${modeActuel === 'classique' ? 'Achat Classique' : 'Vente aux Enchères'}</th>
                  <th>${modeActuel === 'classique' ? 'Vente aux Enchères' : 'Achat Classique'}</th>
                  <th>Différence</th>
              </tr>
          </thead>
          <tbody>
              <!-- COÛTS D'ACQUISITION -->
              <tr class="section-header">
                  <td colspan="4"><strong>COÛTS D'ACQUISITION</strong></td>
              </tr>
              <tr>
                  <td>Prix d'achat</td>
                  <td>${this.formatNumber(data.prixAchat)} €</td>
                  <td>${this.formatNumber(compareData.prixAchat)} €</td>
                  <td class="${data.prixAchat < compareData.prixAchat ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.prixAchat - compareData.prixAchat)} €
                  </td>
              </tr>
              <tr>
                  <td>Frais de notaire / Droits</td>
                  <td>${this.formatNumber(data.fraisNotaire || data.droitsEnregistrement)} €</td>
                  <td>${this.formatNumber(compareData.fraisNotaire || compareData.droitsEnregistrement)} €</td>
                  <td class="${(data.fraisNotaire || data.droitsEnregistrement) < (compareData.fraisNotaire || compareData.droitsEnregistrement) ? 'positive' : 'negative'}">
                      ${this.formatNumber((data.fraisNotaire || data.droitsEnregistrement) - (compareData.fraisNotaire || compareData.droitsEnregistrement))} €
                  </td>
              </tr>
              <tr>
                  <td>Commission / Honoraires avocat</td>
                  <td>${this.formatNumber(data.commission || data.honorairesAvocat)} €</td>
                  <td>${this.formatNumber(compareData.commission || compareData.honorairesAvocat)} €</td>
                  <td class="${(data.commission || data.honorairesAvocat) < (compareData.commission || compareData.honorairesAvocat) ? 'positive' : 'negative'}">
                      ${this.formatNumber((data.commission || data.honorairesAvocat) - (compareData.commission || compareData.honorairesAvocat))} €
                  </td>
              </tr>
              <tr>
                  <td>Travaux de rénovation</td>
                  <td>${this.formatNumber(data.travaux)} €</td>
                  <td>${this.formatNumber(compareData.travaux)} €</td>
                  <td class="${data.travaux < compareData.travaux ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.travaux - compareData.travaux)} €
                  </td>
              </tr>
              <tr>
                  <td>Frais bancaires</td>
                  <td>${this.formatNumber(data.fraisBancaires)} €</td>
                  <td>${this.formatNumber(compareData.fraisBancaires)} €</td>
                  <td class="${data.fraisBancaires < compareData.fraisBancaires ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.fraisBancaires - compareData.fraisBancaires)} €
                  </td>
              </tr>
              <tr class="total-row">
                  <td><strong>Budget total nécessaire</strong></td>
                  <td><strong>${this.formatNumber(coutA)} €</strong></td>
                  <td><strong>${this.formatNumber(coutB)} €</strong></td>
                  <td class="${coutA < coutB ? 'positive' : 'negative'}">
                      <strong>${this.formatNumber(coutA - coutB)} €</strong>
                  </td>
              </tr>
              
              <!-- FINANCEMENT -->
              <tr class="section-header">
                  <td colspan="4"><strong>FINANCEMENT</strong></td>
              </tr>
              <tr>
                  <td>Votre apport personnel</td>
                  <td>${this.formatNumber(coutA - (data.emprunt ?? 0))} €</td>
                  <td>${this.formatNumber(coutB - (compareData.emprunt ?? 0))} €</td>
                  <td>0 €</td>
              </tr>
              <tr>
                  <td>Montant emprunté</td>
                  <td>${this.formatNumber(data.emprunt)} €</td>
                  <td>${this.formatNumber(compareData.emprunt)} €</td>
                  <td class="${data.emprunt < compareData.emprunt ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.emprunt - compareData.emprunt)} €
                  </td>
              </tr>
              <tr>
                  <td>Remboursement mensuel</td>
                  <td>${this.formatNumber(data.mensualite)} €/mois</td>
                  <td>${this.formatNumber(compareData.mensualite)} €/mois</td>
                  <td class="${data.mensualite < compareData.mensualite ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.mensualite - compareData.mensualite)} €
                  </td>
              </tr>
              
              <!-- REVENUS LOCATIFS -->
              <tr class="section-header">
                  <td colspan="4"><strong>REVENUS LOCATIFS</strong></td>
              </tr>
              <tr>
                  <td>Surface que vous pouvez acheter</td>
                  <td>${data.surface.toFixed(1)} m²</td>
                  <td>${compareData.surface.toFixed(1)} m²</td>
                  <td class="${data.surface > compareData.surface ? 'positive' : 'negative'}">
                      ${(data.surface - compareData.surface).toFixed(1)} m²
                  </td>
              </tr>
              <tr>
                  <td>Loyer mensuel (avant charges)</td>
                  <td>${this.formatNumber(mDataHC)} €</td>
                  <td>${this.formatNumber(mCompHC)} €</td>
                  <td class="${mDataHC > mCompHC ? 'positive' : 'negative'}">
                      ${this.formatNumber(mDataHC - mCompHC)} €
                  </td>
              </tr>
              <tr>
                  <td>Provision logement vide</td>
                  <td>-${this.formatNumber(Math.max(0, mDataHC - mDataNet))} €</td>
                  <td>-${this.formatNumber(Math.max(0, mCompHC - mCompNet))} €</td>
                  <td>${this.formatNumber(Math.max(0, (mDataHC - mDataNet)) - Math.max(0, (mCompHC - mCompNet)))} €</td>
              </tr>
              <tr>
                  <td>Loyer net mensuel</td>
                  <td>${this.formatNumber(mDataNet)} €</td>
                  <td>${this.formatNumber(mCompNet)} €</td>
                  <td class="${mDataNet > mCompNet ? 'positive' : 'negative'}">
                      ${this.formatNumber(mDataNet - mCompNet)} €
                  </td>
              </tr>
              
              <!-- VOS DÉPENSES MENSUELLES -->
              <tr class="section-header">
                  <td colspan="4"><strong>VOS DÉPENSES MENSUELLES</strong></td>
              </tr>
              <tr>
                  <td>Remboursement du prêt</td>
                  <td>-${this.formatNumber(data.mensualite)} €</td>
                  <td>-${this.formatNumber(compareData.mensualite)} €</td>
                  <td class="${data.mensualite < compareData.mensualite ? 'positive' : 'negative'}">
                      ${this.formatNumber(compareData.mensualite - data.mensualite)} €
                  </td>
              </tr>
              <tr>
                  <td>Taxe foncière (par mois)</td>
                  <td>-${this.formatNumber(data.taxeFonciere / 12)} €</td>
                  <td>-${this.formatNumber(compareData.taxeFonciere / 12)} €</td>
                  <td class="${data.taxeFonciere < compareData.taxeFonciere ? 'positive' : 'negative'}">
                      ${this.formatNumber((compareData.taxeFonciere - data.taxeFonciere) / 12)} €
                  </td>
              </tr>
              <tr>
                  <td>Charges de copropriété</td>
                  <td>-${this.formatNumber(data.chargesNonRecuperables / 12)} €</td>
                  <td>-${this.formatNumber(compareData.chargesNonRecuperables / 12)} €</td>
                  <td class="${data.chargesNonRecuperables < compareData.chargesNonRecuperables ? 'positive' : 'negative'}">
                      ${this.formatNumber((compareData.chargesNonRecuperables - data.chargesNonRecuperables) / 12)} €
                  </td>
              </tr>
              <tr>
                  <td>Budget entretien</td>
                  <td>-${this.formatNumber(data.entretienAnnuel / 12)} €</td>
                  <td>-${this.formatNumber(compareData.entretienAnnuel / 12)} €</td>
                  <td class="${data.entretienAnnuel < compareData.entretienAnnuel ? 'positive' : 'negative'}">
                      ${this.formatNumber((compareData.entretienAnnuel - data.entretienAnnuel) / 12)} €
                  </td>
              </tr>
              <tr>
                  <td>Assurance propriétaire</td>
                  <td>-${this.formatNumber(data.assurancePNO / 12)} €</td>
                  <td>-${this.formatNumber(compareData.assurancePNO / 12)} €</td>
                  <td>${this.formatNumber((compareData.assurancePNO - data.assurancePNO) / 12)} €</td>
              </tr>
              <tr class="total-row">
                  <td><strong>Total de vos dépenses</strong></td>
                  <td><strong>-${this.formatNumber(data.mensualite + data.taxeFonciere/12 + data.chargesNonRecuperables/12 + data.entretienAnnuel/12 + data.assurancePNO/12)} €</strong></td>
                  <td><strong>-${this.formatNumber(compareData.mensualite + compareData.taxeFonciere/12 + compareData.chargesNonRecuperables/12 + compareData.entretienAnnuel/12 + compareData.assurancePNO/12)} €</strong></td>
                  <td><strong>${this.formatNumber((compareData.mensualite + compareData.taxeFonciere/12 + compareData.chargesNonRecuperables/12 + compareData.entretienAnnuel/12 + compareData.assurancePNO/12) - (data.mensualite + data.taxeFonciere/12 + data.chargesNonRecuperables/12 + data.entretienAnnuel/12 + data.assurancePNO/12))} €</strong></td>
              </tr>
              
              <!-- RÉSULTAT -->
              <tr class="section-header">
                  <td colspan="4"><strong>RÉSULTAT</strong></td>
              </tr>
              <tr>
                  <td>Cash-flow avant impôts</td>
                  <td class="${data.cashFlow >= 0 ? 'positive' : 'negative'}">${this.formatNumber(data.cashFlow)} €</td>
                  <td class="${compareData.cashFlow >= 0 ? 'positive' : 'negative'}">${this.formatNumber(compareData.cashFlow)} €</td>
                  <td class="${data.cashFlow > compareData.cashFlow ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.cashFlow - compareData.cashFlow)} €
                  </td>
              </tr>
              <tr>
                  <td>Gain annuel après impôts théorique</td>
                  <td class="${data.cashFlowAnnuel >= 0 ? 'positive' : 'negative'}">${this.formatNumber(data.cashFlowAnnuel)} €</td>
                  <td class="${compareData.cashFlowAnnuel >= 0 ? 'positive' : 'negative'}">${this.formatNumber(compareData.cashFlowAnnuel)} €</td>
                  <td class="${data.cashFlowAnnuel > compareData.cashFlowAnnuel ? 'positive' : 'negative'}">
                      ${this.formatNumber(data.cashFlowAnnuel - compareData.cashFlowAnnuel)} €
                  </td>
              </tr>
              <tr>
                  <td>Rendement de votre investissement</td>
                  <td class="${data.rendementNet >= 0 ? 'positive' : 'negative'}">${data.rendementNet.toFixed(2)} %</td>
                  <td class="${compareData.rendementNet >= 0 ? 'positive' : 'negative'}">${compareData.rendementNet.toFixed(2)} %</td>
                  <td class="${data.rendementNet > compareData.rendementNet ? 'positive' : 'negative'}">
                      ${(data.rendementNet - compareData.rendementNet).toFixed(2)} %
                  </td>
              </tr>
          </tbody>
      </table>
  `;
}

    /**
     * Génère les cartes de définition
     */
    generateDefinitionCards() {
        const definitions = [
            {
                title: "Cash-flow",
                icon: "fa-coins",
                description: "Le cash-flow représente l'argent qui reste dans votre poche chaque mois après avoir payé toutes les charges (crédit, taxes, entretien, etc.). Un cash-flow positif signifie que l'investissement s'autofinance."
            },
            {
                title: "TMI (Taux Marginal d'Imposition)",
                icon: "fa-percentage",
                description: "C'est le taux d'imposition qui s'applique à la tranche la plus élevée de vos revenus. Plus votre TMI est élevé, plus les régimes avec déductions fiscales deviennent intéressants."
            },
            {
                title: "LMNP (Loueur Meublé Non Professionnel)",
                icon: "fa-bed",
                description: "Régime fiscal pour la location meublée permettant d'amortir le bien et le mobilier. Très avantageux car les amortissements réduisent voire annulent l'impôt sur les loyers."
            },
            {
                title: "Déficit foncier",
                icon: "fa-chart-line",
                description: "Lorsque vos charges dépassent vos revenus locatifs, vous créez un déficit déductible de vos autres revenus (jusqu'à 10 700€/an), ce qui réduit votre impôt global."
            },
            {
                title: "Amortissement",
                icon: "fa-clock",
                description: "Déduction comptable représentant la perte de valeur du bien dans le temps. En LMNP, vous pouvez amortir 2-3% du bien par an, réduisant ainsi votre base imposable."
            },
            {
                title: "Rendement",
                icon: "fa-chart-pie",
                description: "Rentabilité de votre investissement calculée en divisant le cash-flow annuel net par le prix total du bien. Plus ce pourcentage est élevé, plus votre investissement est rentable."
            }
        ];
        
        return definitions.map(def => `
            <div class="definition-card">
                <div class="definition-icon">
                    <i class="fas ${def.icon}"></i>
                </div>
                <h4 class="definition-title">${def.title}</h4>
                <p class="definition-text">${def.description}</p>
            </div>
        `).join('');
    }

    /**
     * Génère une carte de régime fiscal
     */
    generateRegimeCard(regime, isBest) {
        return `
            <div class="regime-result ${isBest ? 'best' : ''}">
                <div class="regime-header">
                    <div class="regime-name">
                        <i class="fas ${regime.icone || 'fa-home'}"></i>
                        ${regime.nom}
                    </div>
                    ${isBest ? '<div class="regime-badge">Meilleur choix</div>' : ''}
                </div>
                
                <div class="regime-metrics">
                    <div class="metric-box">
                        <div class="metric-label">Cash-flow mensuel</div>
                        <div class="metric-value ${regime.cashflowMensuel >= 0 ? 'positive' : 'negative'}">
                            ${this.formatNumber(regime.cashflowMensuel)} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Impôt annuel</div>
                        <div class="metric-value negative">
                            ${this.formatNumber(Math.abs(regime.impotAnnuel))} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Cash-flow net annuel</div>
                        <div class="metric-value ${regime.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}">
                            ${this.formatNumber(regime.cashflowNetAnnuel)} €
                        </div>
                    </div>
                    
                    <div class="metric-box">
                        <div class="metric-label">Rendement net</div>
                        <div class="metric-value neutral">
                            ${regime.rendementNet.toFixed(2)}%
                        </div>
                    </div>
                </div>
                
                ${regime.avantages && regime.avantages.length > 0 ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <strong style="color: #94a3b8; font-size: 0.9em;">Avantages :</strong>
                        <ul style="margin-top: 10px; list-style: none; padding: 0;">
                            ${regime.avantages.map(a => `<li style="color: #e2e8f0; font-size: 0.9em; margin-top: 5px;">✓ ${a}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Crée les graphiques de comparaison fiscale avec lazy loading - V3
     */
    createFiscalCharts(fiscalResults) {
        // Utiliser lazy loading si disponible
        if (typeof lazyLoadCharts === 'function') {
            lazyLoadCharts('.charts-container', fiscalResults);
        } else {
            // Fallback : création directe
            this._createChartsDirectly(fiscalResults);
        }
    }
    
    /**
     * Création directe des graphiques (fallback ou après lazy load)
     */
    _createChartsDirectly(fiscalResults) {
        // Graphique des cash-flows
        const ctxCashflow = document.getElementById('fiscal-cashflow-chart')?.getContext('2d');
        if (ctxCashflow) {
            new Chart(ctxCashflow, {
                type: 'bar',
                data: {
                    labels: fiscalResults.map(r => r.nom),
                    datasets: [{
                        label: 'Cash-flow net annuel',
                        data: fiscalResults.map(r => r.cashflowNetAnnuel),
                        backgroundColor: fiscalResults.map((r, i) => i === 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(0, 191, 255, 0.7)'),
                        borderColor: fiscalResults.map((r, i) => i === 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(0, 191, 255, 1)'),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#94a3b8',
                                callback: (value) => this.formatNumber(value) + ' €'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                maxRotation: 45,
                                minRotation: 45
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }
        
        // Graphique des rendements
        const ctxRendement = document.getElementById('fiscal-rendement-chart')?.getContext('2d');
        if (ctxRendement) {
            new Chart(ctxRendement, {
                type: 'line',
                data: {
                    labels: fiscalResults.map(r => r.nom),
                    datasets: [{
                        label: 'Rendement net',
                        data: fiscalResults.map(r => r.rendementNet),
                        borderColor: 'rgba(0, 191, 255, 1)',
                        backgroundColor: 'rgba(0, 191, 255, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 6,
                        pointBackgroundColor: fiscalResults.map((r, i) => i === 0 ? '#22c55e' : '#00bfff'),
                        pointBorderColor: '#0a0f1e',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#94a3b8',
                                callback: (value) => value.toFixed(1) + '%'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                maxRotation: 45,
                                minRotation: 45
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }
    }

 // ─────────────────────────────────────────────
//  utilitaire n°1 : coût d'occupation (RP)
computeOccupationCost(data, partner = 0) {
    const mensu   = Number(data.monthlyPayment) || 0;
    const tf      = (Number(data.taxeFonciere) || 0) / 12;
    const copro   = (Number(data.chargesCoproNonRecup) || 0);
    const entret  = (Number(data.entretienAnnuel) || 0) / 12;
    const pno     = (Number(data.assurancePNO) || 0) / 12;
    const chargesRecup = Number(
        data.monthlyCharges      // nouveau nom
        || data.charges         // fallback ancien nom
    ) || 0;
    
    const brut = +(mensu + tf + copro + entret + pno + chargesRecup).toFixed(2);
    const net  = Math.max(0, brut - partner);
    
    const loyerPerdu = Number(data.loyerCC) || 0; // opportunité manquée
    const netOp      = +(net + loyerPerdu).toFixed(2);
    
    return {
        brut,               // charges totales
        netPourVous:       Math.round(net),
        netAvecOpportunite:Math.round(netOp),
        loyerPerdu:        Math.round(loyerPerdu)
    };
}
}

/**
 * Fonction de lazy loading pour les graphiques - V3
 */
function lazyLoadCharts(selector, fiscalResults) {
    const el = document.querySelector(selector);
    if (!el) return;
    
    const obs = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting) {
            // Si Chart.js n'est pas déjà chargé
            if (typeof Chart === 'undefined') {
                // Import dynamique
                await import('https://cdn.jsdelivr.net/npm/chart.js');
            }
            
            // Créer les graphiques
            const analyzer = window.analyzer || new MarketFiscalAnalyzer();
            analyzer._createChartsDirectly(fiscalResults);
            
            // Déconnecter l'observer
            obs.disconnect();
        }
    }, { rootMargin: '200px' }); // Charger 200px avant d'être visible
    
    obs.observe(el);
}

// Export pour utilisation
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = MarketFiscalAnalyzer;
} else {
    window.MarketFiscalAnalyzer = MarketFiscalAnalyzer;
    window.lazyLoadCharts = lazyLoadCharts; // Export la fonction de lazy loading
}

// Helpers de debug V3 avec tests unitaires
window.debugFiscalPipeline = function() {
    const analyzer = window.analyzer || new MarketFiscalAnalyzer();
    
    // Données de test
    const testData = {
        price: 200000,
        surface: 60,
        loyerHC: 800,
        monthlyCharges: 50,
        apport: 40000,
        loanRate: 3.5,
        loanDuration: 20,
        tmi: 30,
        typeAchat: 'classique',
        vacanceLocative: 0,
        taxeFonciere: 800,
        gestionLocativeTaux: 0,
        chargesCoproNonRecup: 50,
        entretienAnnuel: 500,
        assurancePNO: 15
    };
    
    console.group('🔍 Debug Pipeline Fiscal V3');
    
    // 1. Test prepareFiscalData (sans DOM)
    const fiscalData = {
        ...testData,
        yearlyRent: testData.loyerHC * 12,
        loanAmount: testData.price - testData.apport,
        monthlyPayment: analyzer.calculateMonthlyPayment(160000, 3.5, 20)
    };
    console.log('1️⃣ Fiscal Data simulée:', fiscalData);
    
    // 2. Test adaptation
    const comparatorData = analyzer.prepareFiscalDataForComparator(fiscalData);
    console.log('2️⃣ Comparator Data:', comparatorData);
    console.log('   - loyerBrutHC:', comparatorData.loyerBrutHC);
    console.log('   - loyerBrutCC:', comparatorData.loyerBrutCC);
    console.log('   - chargesNonRecuperables annuel:', comparatorData.chargesNonRecuperables);
    
    // 3. Tests unitaires
    console.group('3️⃣ Tests unitaires');
    
    // Test Micro-foncier
    const microFoncierCalc = analyzer.getDetailedCalculations(
        { nom: 'Micro-foncier' }, 
        fiscalData, 
        analyzer.getAllAdvancedParams(), 
        { tableauAmortissement: [] }
    );
    const abattementTest = microFoncierCalc.baseImposable / (fiscalData.loyerHC * 12);
    console.log('✓ Micro-foncier abattement 30%:', 
        Math.abs(abattementTest - 0.70) < 0.01 ? '✅ PASS' : '❌ FAIL', 
        `(${abattementTest.toFixed(2)} vs 0.70 attendu)`
    );
    
    // Test LMNP base imposable jamais négative
    const lmnpCalc = analyzer.getDetailedCalculations(
        { nom: 'LMNP au réel' }, 
        { ...fiscalData, loyerHC: 100 }, // Très faible loyer
        analyzer.getAllAdvancedParams(), 
        { tableauAmortissement: [] }
    );
    console.log('✓ LMNP base imposable >= 0:', 
        lmnpCalc.baseImposable >= 0 ? '✅ PASS' : '❌ FAIL',
        `(${lmnpCalc.baseImposable})`
    );
    
    // Test SCI IS taux réduit
    const sciCalc = analyzer.getDetailedCalculations(
        { nom: 'SCI à l\'IS' }, 
        { ...fiscalData, loyerHC: 3000 }, 
        analyzer.getAllAdvancedParams(), 
        { tableauAmortissement: [] }
    );
    const tauxEffectif = sciCalc.impotRevenu / sciCalc.baseImposable;
    console.log('✓ SCI IS taux 15% si < 42500€:', 
        Math.abs(tauxEffectif - 0.15) < 0.01 ? '✅ PASS' : '❌ FAIL',
        `(${(tauxEffectif * 100).toFixed(1)}% vs 15% attendu)`
    );
    
    console.groupEnd();
    
    // 4. Vérifier chaque régime
    console.log('4️⃣ Test par régime:');
    ['Micro-foncier', 'Location nue au réel', 'LMNP Micro-BIC', 'LMNP au réel', 'SCI à l\'IS'].forEach(regimeName => {
        const regime = { nom: regimeName };
        const calc = analyzer.getDetailedCalculations(regime, fiscalData, analyzer.getAllAdvancedParams(), {});
        console.log(`${regimeName}:`, {
            baseImposable: calc.baseImposable,
            totalImpots: calc.totalImpots,
            cashflow: calc.cashflowNetAnnuel,
            chargesDeductibles: calc.totalCharges
        });
    });
    
    console.groupEnd();
};

// Nouvelle fonction de test pour vérifier les calculs
window.testFiscalCalculations = function() {
    console.group('🧪 Tests de calculs fiscaux');
    
    const analyzer = new MarketFiscalAnalyzer();
    let passed = 0;
    let failed = 0;
    
    // Test 1: Mensualité de prêt
    const mensualite = analyzer.calculateMonthlyPayment(160000, 3.5, 20);
    const expectedMensualite = 928.37; // Valeur attendue
    if (Math.abs(mensualite - expectedMensualite) < 1) {
        console.log('✅ Test mensualité: PASS');
        passed++;
    } else {
        console.log('❌ Test mensualité: FAIL', mensualite, 'vs', expectedMensualite);
        failed++;
    }
    
    // Test 2: Charges non récupérables annuelles
    const testData = { chargesCoproNonRecup: 50 };
    const adapted = analyzer.prepareFiscalDataForComparator(testData);
    if (adapted.chargesNonRecuperables === 600) { // 50 * 12
        console.log('✅ Test charges annuelles: PASS');
        passed++;
    } else {
        console.log('❌ Test charges annuelles: FAIL', adapted.chargesNonRecuperables);
        failed++;
    }
    
    console.log(`\n📊 Résultats: ${passed} PASS, ${failed} FAIL`);
    console.groupEnd();
};
