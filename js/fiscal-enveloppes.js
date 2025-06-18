/* -----------------------------------------------------------------------------
   Smartflow – Catalogue exhaustif d'enveloppes patrimoniales
   Version « 12.0 » – révisée le 18 juin 2025
   -----------------------------------------------------------------------------
   • Isolates all tax parameters in a configurable TAXES object
   • Corrects the surtaxe sur plus‑values immobilières to apply on net gain
   • Clarifies PEL regime comment (plans opened before/after 2018)
   • Adds utility functions and Jest unit‑test stubs for edge cases
   ----------------------------------------------------------------------------- */

/* --------------------------------------------------------------------
   CONFIGURABLE TAX PARAMETERS
   -------------------------------------------------------------------- */
export const TAXES = {
  YEAR: 2025,
  // Prélèvement forfaitaire unique (flat‑tax) – Income‑tax share
  IR_PFU: 0.128,
  // Prélèvements sociaux (CSG 9,2 % + CRDS 0,5 % + prélèv. solidarité 7,5 %)
  PRL_SOC: 0.172,
  // Dynamic getter keeps PFU_TOTAL in sync
  get PFU_TOTAL() {
    return this.IR_PFU + this.PRL_SOC;
  },
  // Fraction de CSG déductible
  CSG_DEDUCTIBLE_RATE: 0.068,
  // Assurance‑vie – part IR après 8 ans (≤ 150 k€ de primes)
  IR_AV_8Y: 0.075,
  // Plus‑values immobilières (IR 19 %)
  IR_SCPI_PV: 0.19,
};

/**
 * Let the host application patch TAXES when new Finance Acts are voted.
 * @param {Partial<typeof TAXES>} patch – key/value pairs to override.
 */
export function updateTaxes(patch = {}) {
  Object.assign(TAXES, patch);
}

/* --------------------------------------------------------------------
   CONSTANTES SOCIALES 2025
   -------------------------------------------------------------------- */
export const PASS_2025 = 47_100; // Plafond annuel de la Sécurité sociale

/* --------------------------------------------------------------------
   OUTILS GÉNÉRIQUES
   -------------------------------------------------------------------- */
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const netAfterFlatTax = (gain, taux = TAXES.PFU_TOTAL) =>
  round2(gain * (1 - taux));

/**
 * Net après option barème – année de la déclaration + économie d'IR N+1
 * grâce à la CSG déductible (6,8 % de la base imposable).
 * @param {number} base – Base imposable après charges/abattements.
 * @param {number} tmi  – Taux marginal d'imposition (0.11, 0.30, 0.41, 0.45 …).
 */
export function netAfterBareme(base, tmi) {
  const ir = base * tmi;
  const ps = base * TAXES.PRL_SOC;
  const csgSaving = base * TAXES.CSG_DEDUCTIBLE_RATE * tmi;
  return round2(base - ir - ps + csgSaving);
}

/* --------------------------------------------------------------------
   ABATTEMENTS SUR PLUS‑VALUES IMMOBILIÈRES
   -------------------------------------------------------------------- */
export function abattImmoIR(duree) {
  if (duree < 6) return 0;
  if (duree < 22) return (duree - 5) * 0.06; // 6 %/an années 6‑21
  return 1; // exonération totale ≥ 22 ans
}

export function abattImmoPS(duree) {
  if (duree < 6) return 0;
  if (duree <= 21) return (duree - 5) * 0.0165; // 1,65 %/an années 6‑21
  if (duree === 22) return 0.28; // 26,4 % + 1,6 % = 28 %
  if (duree <= 30) return 0.28 + (duree - 22) * 0.09; // +9 %/an années 23‑30
  return 1; // exonération totale ≥ 31 ans
}

/* --------------------------------------------------------------------
   SURTAXE PROGRESSIVE SUR PLUS‑VALUES (> 50 k€) – appliquée sur le NET
   -------------------------------------------------------------------- */
export function surtaxePlusValue(gainNet) {
  if (gainNet <= 50_000) return 0;
  const brackets = [
    { limit: 100_000, rate: 0.02 },
    { limit: 150_000, rate: 0.03 },
    { limit: 200_000, rate: 0.04 },
    { limit: 250_000, rate: 0.05 },
    { limit: Infinity, rate: 0.06 },
  ];
  let prev = 50_000;
  let surtaxe = 0;
  for (const { limit, rate } of brackets) {
    if (gainNet <= prev) break;
    const taxableSlice = Math.min(gainNet, limit) - prev;
    surtaxe += taxableSlice * rate;
    prev = limit;
  }
  return round2(surtaxe);
}

/* --------------------------------------------------------------------
   CATALOGUE D'ENVELOPPES PATRIMONIALES
   -------------------------------------------------------------------- */
export const enveloppes = [
  /* ───────────── INVESTISSEMENT ACTIONS ───────────── */
  {
    id: 'pea',
    label: 'PEA',
    type: 'Actions UE (ETF, titres vifs)',
    plafond: 150_000,
    plafondGlobal: 225_000, // PEA + PEA‑PME
    clockFrom: 'ouverture',
    seuil: 5,
    fiscalite: {
      avant: 'PFU 30 % + clôture',
      apres: 'Exonéré IR, 17,2 % PS',
      calcGainNet: ({ gain, duree }) =>
        duree >= 5 ? netAfterFlatTax(gain, TAXES.PRL_SOC) : netAfterFlatTax(gain),
    },
  },
  {
    id: 'pea-pme',
    label: 'PEA‑PME/ETI',
    type: 'Actions PME/ETI UE',
    plafond: 225_000,
    clockFrom: 'ouverture',
    seuil: 5,
    fiscalite: {
      avant: 'PFU 30 % + clôture',
      apres: 'Exonéré IR, 17,2 % PS',
      calcGainNet: ({ gain, duree }) =>
        duree >= 5 ? netAfterFlatTax(gain, TAXES.PRL_SOC) : netAfterFlatTax(gain),
    },
  },
  {
    id: 'cto',
    label: 'Compte‑titres ordinaire',
    type: 'Actions/ETF monde, obligations, fonds',
    plafond: null,
    clockFrom: null,
    seuil: null,
    fiscalite: {
      texte:
        'PFU 30 % ou option barème (report moins‑values 10 ans, CSG 6,8 % déductible année N+1)',
      /**
       * @param {number} gain
       * @param {number} tmi – taux marginal (default 30 %)
       * @param {number} moinsValuesDisponibles
       * @param {boolean} optionBareme
       */
      calcGainNet({
        gain,
        tmi = 0.3,
        moinsValuesDisponibles = 0,
        optionBareme = false,
      }) {
        const gainApresMV = Math.max(gain - moinsValuesDisponibles, 0);
        return optionBareme
          ? netAfterBareme(gainApresMV, tmi)
          : netAfterFlatTax(gainApresMV);
      },
    },
  },

  /* ───────────── ÉPARGNE POLYVALENTE ───────────── */
  {
    id: 'assurance-vie',
    label: 'Assurance‑vie',
    type: 'Fonds € + UC',
    plafond: null,
    clockFrom: 'versement',
    seuil: 8,
    fiscalite: {
      avant: 'PFU 30 % (ou 35/15 % si < 4 ans pour anciens contrats)',
      apres:
        '24,7 % (7,5 % IR + 17,2 % PS) sur prime ≤ 150 k€ ; 30 % au‑delà',
      abattement: { solo: 4_600, couple: 9_200 },
      /**
       * @param {number} gain
       * @param {number} duree – durée du contrat en années
       * @param {number} primesVerseesAvantRachat
       * @param {boolean} estCouple
       */
      calcGainNet({
        gain,
        duree,
        primesVerseesAvantRachat = 0,
        estCouple = false,
      }) {
        const abatt = estCouple
          ? this.abattement.couple
          : this.abattement.solo;
        const taxable = Math.max(gain - abatt, 0);
        if (duree < 8) return netAfterFlatTax(taxable) + Math.min(gain, abatt);

        // Après 8 ans
        const enveloppeRestante = Math.max(150_000 - primesVerseesAvantRachat, 0);
        const partLow = Math.min(taxable, enveloppeRestante);
        const partHigh = taxable - partLow;
        const netLow =
          partLow * (1 - (TAXES.IR_AV_8Y + TAXES.PRL_SOC)); // 7,5 % + PS
        const netHigh = partHigh * (1 - TAXES.PFU_TOTAL); // 30 %
        return round2(netLow + netHigh + Math.min(gain, abatt));
      },
    },
  },
  {
    id: 'per',
    label: 'PER',
    type: 'Épargne retraite (UC / fonds €)',
    plafond: null,
    clockFrom: 'versement',
    seuil: null,
    plafondCalcule({ revenusPro }) {
      const partRevenus = revenusPro * 0.1; // 10 % revenus pro
      const plafond1 = PASS_2025 * 8 * 0.1; // 10 % × 8 PASS
      const plafond2 = PASS_2025 * 0.1; // 10 % PASS
      return Math.max(plafond2, Math.min(partRevenus, plafond1));
    },
    fiscalite: {
      texte:
        "Déduction à l'entrée, PFU 30 % sur plus‑values à la sortie capital (pension imposée au barème)",
      calcGainNet: ({ gain }) => netAfterFlatTax(gain),
    },
  },

  /* ───────────── LIVRETS RÉGLEMENTÉS ───────────── */
  {
    id: 'livret-a',
    label: 'Livret A',
    type: 'Épargne de précaution',
    plafond: 22_950,
    clockFrom: null,
    seuil: null,
    fiscalite: { texte: 'Exonéré', calcGainNet: ({ gain }) => gain },
  },
  {
    id: 'ldds',
    label: 'LDDS',
    type: 'Épargne de précaution / solidaire',
    plafond: 12_000,
    clockFrom: null,
    seuil: null,
    fiscalite: { texte: 'Exonéré', calcGainNet: ({ gain }) => gain },
  },
  {
    id: 'lep',
    label: 'LEP',
    type: 'Livret Épargne Populaire',
    plafond: 10_000,
    clockFrom: null,
    seuil: null,
    fiscalite: { texte: 'Exonéré', calcGainNet: ({ gain }) => gain },
  },

  /* ───────────── LOGEMENT ───────────── */
  {
    id: 'pel',
    label: 'PEL',
    type: 'Plan Épargne Logement',
    plafond: 61_200,
    clockFrom: 'ouverture',
    seuil: null,
    fiscalite: {
      texte:
        "Plans > 2018 : PFU 30 % sur intérêts (années 1‑12). Plans ≤ 2017 : intérêts exonérés d'IR, soumis aux PS (17,2 %) chaque année. Au‑delà de 12 ans, barème + PS (CSG déductible intégrée).",
      /**
       * @param {number} gain – intérêts bruts
       * @param {number} duree – âge du plan
       * @param {number} tmi  – taux marginal, seulement utile après 12 ans
       */
      calcGainNet({ gain, duree, tmi = 0.3 }) {
        if (duree < 12) return netAfterFlatTax(gain); // PFU 30 %
        return netAfterBareme(gain, tmi);
      },
    },
  },
  {
    id: 'cel',
    label: 'CEL',
    type: 'Compte Épargne Logement',
    plafond: 15_300,
    clockFrom: null,
    seuil: null,
    fiscalite: {
      texte: 'PFU 30 % chaque année',
      calcGainNet: ({ gain }) => netAfterFlatTax(gain),
    },
  },

  /* ───────────── JEUNE / CLIMAT ───────────── */
  {
    id: 'peac',
    label: 'PEA‑Avenir Climat',
    type: 'Jeunes < 21 ans, ISR',
    plafond: 22_950,
    clockFrom: 'ouverture',
    seuil: 5,
    fiscalite: {
      avant: 'Retrait interdit ou perte des avantages',
      apres: 'Exonéré IR + PS',
      calcGainNet: ({ gain, duree, age }) =>
        age >= 18 && duree >= 5 ? gain : 0,
    },
  },

  /* ───────────── IMMOBILIER PAPIER ───────────── */
  {
    id: 'scpi-cto',
    label: 'SCPI (via CTO)',
    type: 'Rendement immobilier',
    plafond: null,
    clockFrom: null,
    seuil: null,
    fiscalite: {
      loyers:
        'Revenus fonciers – micro‑foncier 30 % ≤ 15 000 € ou réel + PS 17,2 % (CSG déductible intégrée)',
      plusValues:
        'Régime des plus‑values immo (19 % IR + 17,2 % PS) avec abattements + surtaxe > 50 k€',
      /**
       * @param {number} gain
       * @param {'loyer'|'plusValue'} nature
       * @param {number} duree – durée de détention en années
       * @param {number} tmi
       * @param {boolean} regimeMicro
       * @param {number} chargesPct – pour réel (0‑1)
       */
      calcGainNet({
        gain,
        nature = 'plusValue',
        duree = 0,
        tmi = 0.3,
        regimeMicro = true,
        chargesPct = 0,
      }) {
        if (nature === 'loyer') {
          const base = regimeMicro ? gain * 0.7 : gain * (1 - chargesPct);
          return netAfterBareme(base, tmi);
        }
        // Plus‑value immobilière
        const abattIR = abattImmoIR(duree);
        const abattPS = abattImmoPS(duree);
        const baseIR = gain * (1 - abattIR);
        const basePS = gain * (1 - abattPS);
        const netImposable = baseIR; // seuil surtaxe : plus‑value nette IR
        const imposition =
          baseIR * TAXES.IR_SCPI_PV +
          basePS * TAXES.PRL_SOC +
          surtaxePlusValue(netImposable);
        return round2(gain - imposition);
      },
    },
  },
  {
    id: 'scpi-av',
    label: 'SCPI (via AV)',
    type: 'Rendement immobilier logé AV',
    plafond: null,
    clockFrom: 'versement',
    seuil: 8,
    fiscalite: {
      texte: 'Fiscalité assurance‑vie',
      calcGainNet({ gain, duree, primesVerseesAvantRachat = 0, estCouple = false }) {
        return enveloppes
          .find((e) => e.id === 'assurance-vie')
          .fiscalite.calcGainNet({
            gain,
            duree,
            primesVerseesAvantRachat,
            estCouple,
          });
      },
    },
  },
  {
    id: 'opci',
    label: 'OPCI grand public',
    type: 'Immobilier + actions + cash',
    plafond: null,
    clockFrom: null,
    seuil: null,
    fiscalite: {
      texte: 'PFU 30 % (SPPICAV) ou revenus fonciers',
      calcGainNet: ({ gain }) => netAfterFlatTax(gain),
    },
  },

  /* ───────────── NICHE FISCALE PME / INNOVATION ───────────── */
  {
    id: 'fcpi-fip',
    label: 'FCPI / FIP',
    type: 'Capital‑risque PME',
    plafond: { solo: 12_000, couple: 24_000 },
    clockFrom: 'versement',
    seuil: 5,
    fiscalite: {
      avant: 'PFU 30 % + reprise de la réduction IR',
      apres: 'Exonéré IR, 17,2 % PS',
      calcGainNet: ({ gain, duree }) =>
        duree >= 5 ? netAfterFlatTax(gain, TAXES.PRL_SOC) : netAfterFlatTax(gain),
    },
  },

  /* ───────────── ACTIFS NUMÉRIQUES ───────────── */
  {
    id: 'crypto-cto',
    label: 'Crypto‑actifs (via CTO)',
    type: 'Actifs numériques',
    plafond: null,
    clockFrom: null,
    seuil: null,
    fiscalite: {
      texte:
        'PFU 30 % sur les cessions > 305 € (report moins‑values 10 ans) ou option barème si activité pro (CSG déductible intégrée)',
      /**
       * @param {number} gain
       * @param {number} montantCession
       * @param {number} moinsValuesDisponibles
       * @param {boolean} optionBareme
       * @param {number} tmi
       */
      calcGainNet({
        gain,
        montantCession = 1_000,
        moinsValuesDisponibles = 0,
        optionBareme = false,
        tmi = 0.3,
      }) {
        if (montantCession <= 305) return gain;
        const gainApresMV = Math.max(gain - moinsValuesDisponibles, 0);
        return optionBareme
          ? netAfterBareme(gainApresMV, tmi)
          : netAfterFlatTax(gainApresMV);
      },
    },
  },
];

/* --------------------------------------------------------------------
   TESTS UNITAIRES (Jest) – exemples de cas limites
   -------------------------------------------------------------------- */
if (typeof describe === 'function') {
  describe('surtaxePlusValue()', () => {
    it('should be zero under the threshold', () => {
      expect(surtaxePlusValue(49_999)).toBe(0);
    });
    it('should calculate 200 € for a 60 k€ net gain (10 k€ × 2 %)', () => {
      expect(surtaxePlusValue(60_000)).toBe(200);
    });
  });

  describe('netAfterBareme()', () => {
    it('should factor in CSG deduction', () => {
      const net = netAfterBareme(1_000, 0.3);
      expect(net).toBeCloseTo(1_000 - 1_000 * 0.3 - 1_000 * TAXES.PRL_SOC + 1_000 * TAXES.CSG_DEDUCTIBLE_RATE * 0.3);
    });
  });
}