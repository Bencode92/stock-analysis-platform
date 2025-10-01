/** ============================
 *  PRESETS EXPERT 2025 (FR)
 *  ============================
 *  - statuts: liste des shortName à mettre en comparaison
 *  - intents: alimente les toggles du comparatif (si présents)
 *  - match(answers): score contextuel (plus haut = plus pertinent)
 *    answers = ton objet questionnaire (cf. exclusionFilters)
 *  - rationale: courte explication (utile en UI si tu veux)
 */

window.quickPresets = [
  // 1) Solo "classique"
  {
    id: 'solo-classique',
    label: 'Solo : SASU ↔ EURL',
    statuts: ['SASU', 'EURL'],
    intents: { veut_dividendes: true, prevoit_associes: 'non', levee_fonds: 'non' },
    rationale: 'Le duel standard pour un solo : assimilé salarié vs TNS.',
    match: (a={}) => (a.team_structure === 'solo' ? 5 : 2) + (a.social_regime === 'assimilated_employee' ? 1 : 0)
  },

  // 2) Démarrage / ARE / prudence budgets
  {
    id: 'demarrage-are',
    label: 'Démarrage / ARE : SASU ↔ EURL ↔ MICRO',
    statuts: ['SASU', 'EURL', 'MICRO'],
    intents: { en_chomage: true, veut_dividendes: false, prevoit_associes: 'non', levee_fonds: 'non' },
    rationale: 'Comparer très concrètement maintien ARE vs ARCE et la simplicité Micro.',
    match: (a={}) => (a.on_unemployment === 'yes' ? 6 : 2)
  },

  // 3) Plusieurs associés : cadre PME
  {
    id: 'pme-associes',
    label: 'PME à plusieurs : SAS ↔ SARL',
    statuts: ['SAS', 'SARL'],
    intents: { prevoit_associes: 'oui', levee_fonds: 'non', veut_dividendes: true },
    rationale: 'Gouvernance souple (SAS) vs cadre encadré (SARL).',
    match: (a={}) => (a.team_structure === 'solo' ? 1 : 6)
  },

  // 4) Start-up / levée / BSPCE
  {
    id: 'startup-fundraising',
    label: 'Start-up & levée : SASU ↔ SAS ↔ SA',
    statuts: ['SASU', 'SAS', 'SA'],
    intents: { levee_fonds: 'oui', veut_dividendes: true, prevoit_associes: 'oui' },
    rationale: 'Accueillir investisseurs + instruments (BSPCE/BSA/AGA).',
    match: (a={}) =>
      (Array.isArray(a.sharing_instruments) && a.sharing_instruments.length ? 5 : 0) +
      (a.public_listing_or_aps === 'yes' ? 3 : 0) +
      (a.team_structure !== 'solo' ? 1 : 0)
  },

  // 5) Commerce / retail (vitrine → société)
  {
    id: 'commerce',
    label: 'Commerce : MICRO ↔ EI ↔ EURL',
    statuts: ['MICRO', 'EI', 'EURL'],
    intents: { veut_dividendes: false, prevoit_associes: 'non' },
    rationale: 'Parcours naturel commerce : démarrage simple → société crédible.',
    match: (a={}) => (a.activity === 'commerce' ? 6 : 3)
  },

  // 6) e-commerce / revente avec associés
  {
    id: 'ecommerce-associes',
    label: 'e-commerce : MICRO ↔ EURL ↔ SARL',
    statuts: ['MICRO', 'EURL', 'SARL'],
    intents: { prevoit_associes: 'oui', veut_dividendes: false },
    rationale: 'Micro pour tester, SARL crédible si plusieurs.',
    match: (a={}) => (a.activity === 'ecommerce' ? 6 : 2) + (a.team_structure !== 'solo' ? 2 : 0)
  },

  // 7) Libéral réglementé (ordre)
  {
    id: 'liberal-reglemente',
    label: 'Libéral réglementé : SELAS ↔ SELARL ↔ EI',
    statuts: ['SELAS', 'SELARL', 'EI'],
    intents: { prevoit_associes: 'oui' },
    rationale: 'Souplesse SELAS vs cadre SELARL, EI reste possible en solo.',
    match: (a={}) => (a.professional_order === 'yes' ? 7 : 0)
  },

  // 8) Immobilier patrimonial
  {
    id: 'immobilier',
    label: 'Immobilier : SCI (IR/IS) ↔ SARL',
    statuts: ['SCI', 'SARL', 'SAS'],
    intents: { prevoit_associes: 'oui', veut_dividendes: false },
    rationale: 'SCI (détention/gestion) vs société commerciale selon projet.',
    match: (a={}) => (a.activity === 'immobilier' ? 7 : 1)
  },

  // 9) Dividendes "clean" (sans cotisations sociales sur RCM)
  {
    id: 'dividendes-max',
    label: 'Dividendes "clean" : SASU ↔ SAS',
    statuts: ['SASU', 'SAS'],
    intents: { veut_dividendes: true, prevoit_associes: 'non' },
    rationale: 'RCM/PFU, pas de cotisations sociales (hors requalification abus).',
    match: (a={}) => (a.wants_dividends === 'yes' ? 6 : 2)
  },

  // 10) Charges sociales contenues (TNS)
  {
    id: 'cout-social-bas',
    label: 'Charges sociales contenues : EURL ↔ SARL',
    statuts: ['EURL', 'SARL'],
    intents: { veut_dividendes: true, prevoit_associes: 'oui' },
    rationale: 'TNS (souvent moins coûteux sur la rémunération).',
    match: (a={}) => (a.focus_costs === 'low_social' ? 6 : 2)
  },

  // 11) Cotation / appel public à l'épargne
  {
    id: 'cotation',
    label: 'Cotation : SA ↔ SCA ↔ SAS',
    statuts: ['SA', 'SCA', 'SAS'],
    intents: { levee_fonds: 'oui', prevoit_associes: 'oui', veut_dividendes: true },
    rationale: 'Schémas de marché/cotation et contrôle capitalistique.',
    match: (a={}) => (a.public_listing_or_aps === 'yes' ? 9 : 0) + (a.available_capital >= 18500 ? 1 : 0)
  },

  // 12) Familiale / solidarité forte (à manier avec précaution)
  {
    id: 'familiale-solidaire',
    label: 'Familiale (solidarité) : SNC ↔ SARL',
    statuts: ['SNC', 'SARL'],
    intents: { prevoit_associes: 'oui', veut_dividendes: true },
    rationale: 'SNC = responsabilité indéfinie & solidaire → à réserver aux cas maîtrisés.',
    match: (a={}) => (a.family_business === 'yes' ? 6 : 0)
  }
];

/**
 * Renvoie les meilleurs presets pour un profil "answers".
 * - answers : ton objet de réponses (team_structure, on_unemployment, sharing_instruments, activity, etc.)
 * - limit   : nombre max de presets
 */
window.getRecommendedPresets = function getRecommendedPresets(answers = {}, limit = 6) {
  const items = (window.quickPresets || []).map(p => {
    let base = typeof p.match === 'function' ? p.match(answers) : 0;

    // Affinage léger générique (bonus/malus selon quelques flags courants)
    if (answers.team_structure === 'solo' && p.statuts.includes('SASU')) base += 1;
    if (answers.team_structure !== 'solo' && p.statuts.includes('SAS')) base += 1;
    if (Array.isArray(answers.sharing_instruments) && answers.sharing_instruments.length && (p.statuts.includes('SAS') || p.statuts.includes('SASU'))) base += 1;
    if (answers.on_unemployment === 'yes' && p.id.includes('are')) base += 2;
    if (answers.professional_order === 'yes' && (p.statuts.includes('SELARL') || p.statuts.includes('SELAS'))) base += 2;
    if (answers.public_listing_or_aps === 'yes' && (p.statuts.includes('SA') || p.statuts.includes('SCA'))) base += 3;

    return { preset: p, score: base };
  });

  return items
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.preset);
};

/**
 * (Optionnel) Pont simple vers le comparatif si présent :
 * - tente d'appliquer le preset dans l'UI (statuts + toggles)
 */
window.applyPresetToComparatif = function applyPresetToComparatif(presetId) {
  const p = (window.quickPresets || []).find(x => x.id === presetId);
  if (!p) return false;

  // Si le comparatif expose un hook "applyPreset", on l'utilise
  if (window.__comparatifHooks?.applyPreset) {
    window.__comparatifHooks.applyPreset(p);
    return true;
  }

  // Fallback minimal : on expose les valeurs pour que le comparatif les lise au chargement
  window.presetDefaultStatuts = p.statuts;
  window.presetDefaultIntents = p.intents;
  window.dispatchEvent(new CustomEvent('preset:selected', { detail: p }));
  return true;
};
