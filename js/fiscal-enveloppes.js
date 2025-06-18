/**
 * fiscal-enveloppes.js - Configuration fiscale des enveloppes d'investissement
 * TradePulse Finance Intelligence Platform
 * Version 1.0 - Juin 2025
 * 
 * Basé sur les données fiscales 2025
 * Compatible avec simulation.js
 */

/* --------------------------------------------------------------------
   PARAMÈTRES FISCAUX CONFIGURABLES
   -------------------------------------------------------------------- */
export const TAXES = {
  YEAR: 2025,
  // Prélèvement forfaitaire unique (flat-tax)
  IR_PFU: 0.128,              // Part impôt sur le revenu
  PRL_SOC: 0.172,             // Prélèvements sociaux (17.2%)
  get PFU_TOTAL() {
    return this.IR_PFU + this.PRL_SOC;  // 30%
  },
  // CSG déductible
  CSG_DEDUCTIBLE_RATE: 0.068,
  // Assurance-vie après 8 ans (≤ 150k€)
  IR_AV_8Y: 0.075,
  // Plus-values immobilières
  IR_SCPI_PV: 0.19,
};

/* --------------------------------------------------------------------
   CONSTANTES
   -------------------------------------------------------------------- */
export const PASS_2025 = 47100; // Plafond annuel Sécurité sociale

/* --------------------------------------------------------------------
   FONCTIONS UTILITAIRES
   -------------------------------------------------------------------- */
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const formatMoney = (n) => new Intl.NumberFormat('fr-FR', { 
  style: 'currency', 
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(n);

export const netAfterFlatTax = (gain, taux = TAXES.PFU_TOTAL) =>
  round2(gain * (1 - taux));

export function netAfterBareme(base, tmi) {
  const ir = base * tmi;
  const ps = base * TAXES.PRL_SOC;
  const csgSaving = base * TAXES.CSG_DEDUCTIBLE_RATE * tmi;
  return round2(base - ir - ps + csgSaving);
}

/* --------------------------------------------------------------------
   CONFIGURATION DES ENVELOPPES FISCALES
   -------------------------------------------------------------------- */
export const ENVELOPPES_CONFIG = {
  /* ───────────── ACTIONS ───────────── */
  'pea': {
    id: 'pea',
    label: 'PEA - Plan d\'Épargne en Actions',
    shortLabel: 'PEA',
    category: 'actions',
    description: 'Investissement en actions européennes avec fiscalité avantageuse après 5 ans',
    plafond: 150000,
    plafondCouple: null,
    dureeOptimale: 5,
    clockFrom: 'ouverture',
    
    avantages: [
      'Exonération d\'impôt sur les plus-values après 5 ans',
      'Seuls les prélèvements sociaux restent dus (17.2%)',
      'Dividendes exonérés après 5 ans',
      'Transmission facilitée'
    ],
    
    contraintes: [
      'Limité aux actions européennes',
      'Retrait avant 5 ans = clôture du plan',
      'Un seul PEA par personne',
      'Plafond de versement : 150 000€'
    ],
    
    fiscalite: {
      avant5ans: {
        description: 'PFU 30% + clôture du plan',
        tauxGlobal: TAXES.PFU_TOTAL,
        calcul: (gain) => netAfterFlatTax(gain)
      },
      apres5ans: {
        description: 'Exonéré IR, prélèvements sociaux 17.2%',
        tauxGlobal: TAXES.PRL_SOC,
        calcul: (gain) => netAfterFlatTax(gain, TAXES.PRL_SOC)
      }
    },
    
    // Fonction principale de calcul compatible avec simulation.js
    calculateNetGain: function(gain, duree = 0) {
      if (duree >= 5) {
        return this.fiscalite.apres5ans.calcul(gain);
      }
      return this.fiscalite.avant5ans.calcul(gain);
    },
    
    // Pour l'affichage dans l'interface
    getTaxInfo: function(duree = 0) {
      const regime = duree >= 5 ? 'apres5ans' : 'avant5ans';
      return {
        description: this.fiscalite[regime].description,
        taux: this.fiscalite[regime].tauxGlobal,
        tauxPct: (this.fiscalite[regime].tauxGlobal * 100).toFixed(1) + '%'
      };
    }
  },

  /* ───────────── COMPTE-TITRES ───────────── */
  'cto': {
    id: 'cto',
    label: 'Compte-Titres Ordinaire',
    shortLabel: 'CTO',
    category: 'polyvalent',
    description: 'Investissement libre sans contrainte, fiscalité au PFU ou barème',
    plafond: null,
    dureeOptimale: null,
    
    avantages: [
      'Aucune limite de versement',
      'Tous types d\'actifs (actions, obligations, ETF monde...)',
      'Report des moins-values sur 10 ans',
      'Option barème possible si avantageux',
      'CSG déductible à 6.8% si option barème'
    ],
    
    contraintes: [
      'Fiscalité pleine (30% ou barème)',
      'Pas d\'avantage fiscal particulier'
    ],
    
    fiscalite: {
      pfu: {
        description: 'Prélèvement forfaitaire unique 30%',
        tauxGlobal: TAXES.PFU_TOTAL,
        calcul: (gain) => netAfterFlatTax(gain)
      },
      bareme: {
        description: 'Option barème progressif + PS 17.2%',
        calcul: (gain, tmi = 0.3) => netAfterBareme(gain, tmi)
      }
    },
    
    calculateNetGain: function(gain, duree = 0, options = {}) {
      const { optionBareme = false, tmi = 0.3, moinsValues = 0 } = options;
      const gainNet = Math.max(gain - moinsValues, 0);
      
      if (optionBareme) {
        return this.fiscalite.bareme.calcul(gainNet, tmi);
      }
      return this.fiscalite.pfu.calcul(gainNet);
    },
    
    getTaxInfo: function(options = {}) {
      const { optionBareme = false, tmi = 0.3 } = options;
      if (optionBareme) {
        const tauxEffectif = tmi + TAXES.PRL_SOC - (TAXES.CSG_DEDUCTIBLE_RATE * tmi);
        return {
          description: `Barème progressif (TMI ${(tmi*100)}%) + PS 17.2%`,
          taux: tauxEffectif,
          tauxPct: (tauxEffectif * 100).toFixed(1) + '%'
        };
      }
      return {
        description: this.fiscalite.pfu.description,
        taux: this.fiscalite.pfu.tauxGlobal,
        tauxPct: '30%'
      };
    }
  },

  /* ───────────── ASSURANCE-VIE ───────────── */
  'assurance-vie': {
    id: 'assurance-vie',
    label: 'Assurance-Vie',
    shortLabel: 'AV',
    category: 'epargne',
    description: 'Épargne polyvalente avec avantages fiscaux après 8 ans',
    plafond: null,
    dureeOptimale: 8,
    clockFrom: 'versement',
    
    avantages: [
      'Abattement annuel après 8 ans (4600€ solo, 9200€ couple)',
      'Fiscalité réduite après 8 ans',
      'Transmission avantageuse (abattement 152 500€)',
      'Rachat partiel possible',
      'Fonds euros garanti + unités de compte'
    ],
    
    contraintes: [
      'Frais d\'entrée et de gestion',
      'Fiscalité moins avantageuse avant 8 ans',
      'Performance des fonds euros faible'
    ],
    
    abattements: {
      solo: 4600,
      couple: 9200
    },
    
    fiscalite: {
      avant8ans: {
        description: 'PFU 30%',
        tauxGlobal: TAXES.PFU_TOTAL
      },
      apres8ans: {
        jusqua150k: {
          description: '24.7% (7.5% IR + 17.2% PS) après abattement',
          tauxIR: TAXES.IR_AV_8Y,
          tauxGlobal: TAXES.IR_AV_8Y + TAXES.PRL_SOC
        },
        auDela150k: {
          description: 'PFU 30% après abattement',
          tauxGlobal: TAXES.PFU_TOTAL
        }
      }
    },
    
    calculateNetGain: function(gain, duree = 0, options = {}) {
      const { 
        estCouple = false, 
        primesVersees = 0 
      } = options;
      
      const abattement = estCouple ? this.abattements.couple : this.abattements.solo;
      
      if (duree < 8) {
        const gainImposable = Math.max(gain - abattement, 0);
        const impot = gainImposable * this.fiscalite.avant8ans.tauxGlobal;
        return round2(gain - impot);
      }
      
      // Après 8 ans
      const gainImposable = Math.max(gain - abattement, 0);
      if (gainImposable === 0) return gain;
      
      const seuilRestant = Math.max(150000 - primesVersees, 0);
      const partBasse = Math.min(gainImposable, seuilRestant);
      const partHaute = gainImposable - partBasse;
      
      const impotBas = partBasse * this.fiscalite.apres8ans.jusqua150k.tauxGlobal;
      const impotHaut = partHaute * this.fiscalite.apres8ans.auDela150k.tauxGlobal;
      
      return round2(gain - impotBas - impotHaut);
    },
    
    getTaxInfo: function(duree = 0, options = {}) {
      const { primesVersees = 0, estCouple = false } = options;
      const abatt = estCouple ? '9 200€' : '4 600€';
      
      if (duree < 8) {
        return {
          description: `PFU 30% (abattement ${abatt})`,
          taux: this.fiscalite.avant8ans.tauxGlobal,
          tauxPct: '30%'
        };
      }
      
      if (primesVersees <= 150000) {
        return {
          description: `24.7% après abattement de ${abatt}`,
          taux: this.fiscalite.apres8ans.jusqua150k.tauxGlobal,
          tauxPct: '24.7%'
        };
      }
      
      return {
        description: `Mixte: 24.7% jusqu'à 150k€, 30% au-delà (abatt. ${abatt})`,
        taux: null,
        tauxPct: '24.7% / 30%'
      };
    }
  },

  /* ───────────── PER ───────────── */
  'per': {
    id: 'per',
    label: 'Plan d\'Épargne Retraite',
    shortLabel: 'PER',
    category: 'retraite',
    description: 'Épargne retraite avec déduction fiscale à l\'entrée',
    plafond: null,
    dureeOptimale: null,
    
    avantages: [
      'Déduction du revenu imposable',
      'Économie d\'impôt immédiate selon TMI',
      'Sortie en capital possible',
      'Déblocage anticipé (résidence principale)',
      'Gestion pilotée par défaut'
    ],
    
    contraintes: [
      'Épargne bloquée jusqu\'à la retraite',
      'Fiscalité à la sortie',
      'Plafond de déduction annuel'
    ],
    
    // Calcul du plafond de déduction
    calculerPlafond: function(revenusPro) {
      const dixPctRevenus = revenusPro * 0.1;
      const plafondMax = PASS_2025 * 8 * 0.1; // 10% de 8 PASS
      const plafondMin = PASS_2025 * 0.1;     // 10% d'1 PASS
      
      return {
        montant: Math.max(plafondMin, Math.min(dixPctRevenus, plafondMax)),
        minimum: plafondMin,
        maximum: plafondMax
      };
    },
    
    fiscalite: {
      entree: {
        description: 'Déduction du revenu imposable',
        economie: (versement, tmi) => round2(versement * tmi)
      },
      sortie: {
        description: 'PFU 30% sur les plus-values',
        tauxGlobal: TAXES.PFU_TOTAL
      }
    },
    
    calculateNetGain: function(gain, duree = 0, options = {}) {
      // Pour le PER, on calcule seulement la fiscalité sur les gains
      return netAfterFlatTax(gain);
    },
    
    calculateEconomieImpot: function(versement, tmi = 0.3) {
      return this.fiscalite.entree.economie(versement, tmi);
    },
    
    getTaxInfo: function(options = {}) {
      const { tmi = 0.3 } = options;
      return {
        description: `Déduction à l'entrée (${(tmi*100)}% TMI), PFU 30% sur gains à la sortie`,
        taux: TAXES.PFU_TOTAL,
        tauxPct: '30%',
        economieEntree: `${(tmi*100)}%`
      };
    }
  },

  /* ───────────── LIVRETS RÉGLEMENTÉS ───────────── */
  'livret-a': {
    id: 'livret-a',
    label: 'Livret A',
    shortLabel: 'Livret A',
    category: 'livrets',
    description: 'Épargne de précaution totalement défiscalisée',
    plafond: 22950,
    taux: 0.03, // 3% en 2025
    
    avantages: [
      'Totalement défiscalisé',
      'Liquidité immédiate',
      'Capital garanti',
      'Taux fixé par l\'État'
    ],
    
    contraintes: [
      'Plafond limité (22 950€)',
      'Taux de rendement faible',
      'Un seul livret par personne'
    ],
    
    fiscalite: {
      description: 'Exonéré d\'impôts et de prélèvements sociaux',
      tauxGlobal: 0
    },
    
    calculateNetGain: function(gain) {
      return gain; // Aucune fiscalité
    },
    
    getTaxInfo: function() {
      return {
        description: 'Totalement exonéré',
        taux: 0,
        tauxPct: '0%'
      };
    }
  },

  'ldds': {
    id: 'ldds',
    label: 'Livret de Développement Durable et Solidaire',
    shortLabel: 'LDDS',
    category: 'livrets',
    description: 'Épargne solidaire défiscalisée',
    plafond: 12000,
    taux: 0.03, // 3% en 2025
    
    avantages: [
      'Totalement défiscalisé',
      'Liquidité immédiate',
      'Finance l\'économie sociale et solidaire',
      'Peut financer des travaux d\'économie d\'énergie'
    ],
    
    contraintes: [
      'Plafond limité (12 000€)',
      'Taux de rendement faible'
    ],
    
    fiscalite: {
      description: 'Exonéré d\'impôts et de prélèvements sociaux',
      tauxGlobal: 0
    },
    
    calculateNetGain: function(gain) {
      return gain;
    },
    
    getTaxInfo: function() {
      return {
        description: 'Totalement exonéré',
        taux: 0,
        tauxPct: '0%'
      };
    }
  },

  /* ───────────── IMMOBILIER ───────────── */
  'scpi': {
    id: 'scpi',
    label: 'SCPI - Sociétés Civiles de Placement Immobilier',
    shortLabel: 'SCPI',
    category: 'immobilier',
    description: 'Investissement immobilier mutualisé',
    plafond: null,
    
    avantages: [
      'Revenus réguliers (4-6% en moyenne)',
      'Diversification immobilière',
      'Gestion déléguée',
      'Accessible dès quelques milliers d\'euros'
    ],
    
    contraintes: [
      'Frais d\'entrée élevés (8-12%)',
      'Liquidité limitée',
      'Fiscalité des revenus fonciers',
      'Délai de jouissance (3-6 mois)'
    ],
    
    fiscalite: {
      revenus: {
        microFoncier: {
          description: 'Abattement 30% si revenus < 15k€',
          seuil: 15000,
          abattement: 0.3
        },
        reel: {
          description: 'Déduction des charges réelles'
        }
      },
      plusValues: {
        description: '19% IR + 17.2% PS avec abattements selon durée'
      }
    },
    
    calculateNetGain: function(gain, duree = 0, options = {}) {
      const { 
        nature = 'plusValue', // 'revenu' ou 'plusValue'
        tmi = 0.3,
        regimeMicro = true,
        charges = 0
      } = options;
      
      if (nature === 'revenu') {
        // Revenus fonciers
        let baseImposable = gain;
        if (regimeMicro && gain <= this.fiscalite.revenus.microFoncier.seuil) {
          baseImposable = gain * (1 - this.fiscalite.revenus.microFoncier.abattement);
        } else if (!regimeMicro) {
          baseImposable = gain - charges;
        }
        return netAfterBareme(baseImposable, tmi);
      }
      
      // Plus-values (simplifié)
      const tauxGlobal = TAXES.IR_SCPI_PV + TAXES.PRL_SOC;
      return netAfterFlatTax(gain, tauxGlobal);
    },
    
    getTaxInfo: function(options = {}) {
      const { nature = 'plusValue', tmi = 0.3 } = options;
      
      if (nature === 'revenu') {
        return {
          description: `Revenus fonciers au barème (TMI ${(tmi*100)}%) + PS 17.2%`,
          taux: tmi + TAXES.PRL_SOC,
          tauxPct: ((tmi + TAXES.PRL_SOC) * 100).toFixed(1) + '%'
        };
      }
      
      return {
        description: 'Plus-values: 19% IR + 17.2% PS',
        taux: TAXES.IR_SCPI_PV + TAXES.PRL_SOC,
        tauxPct: '36.2%'
      };
    }
  }
};

/* --------------------------------------------------------------------
   FONCTION D'EXPORT POUR SIMULATION.JS
   -------------------------------------------------------------------- */
export function getEnveloppeConfig(enveloppeId) {
  return ENVELOPPES_CONFIG[enveloppeId] || null;
}

export function getAllEnveloppes() {
  return Object.values(ENVELOPPES_CONFIG);
}

export function getEnveloppesByCategory(category) {
  return Object.values(ENVELOPPES_CONFIG).filter(e => e.category === category);
}

/* --------------------------------------------------------------------
   INTÉGRATION AVEC SIMULATION.JS
   -------------------------------------------------------------------- */
if (typeof window !== 'undefined') {
  window.FiscalEnveloppes = {
    TAXES,
    ENVELOPPES_CONFIG,
    getEnveloppeConfig,
    getAllEnveloppes,
    getEnveloppesByCategory,
    formatMoney,
    round2
  };
}