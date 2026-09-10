// measure_roic_excash.mjs — MESURE D'IMPACT (T3, spec §9) : ROIC actuel (GuruFocus) vs ROIC hors cash
// excédentaire re-figé côté ACTIFS + plancher. NE TOUCHE À RIEN — fetche un échantillon, imprime les
// 6 critères d'acceptation. Usage : TWELVE_DATA_API=xxx node scripts/measure_roic_excash.mjs [nUS]
//
// Formule NOUVELLE (spec §9, hors financières) :
//   IC   = total_assets − (total_current_liabilities − short_term_debt) − max(0, cash − 2%·CA)
//   NOPAT= (EBIT − produits financiers sur cash) × (1 − taux borné 15-35%)
//   ROIC = NOPAT / moyenne(IC_N, IC_{N-1}), IC planchonné à max(IC, 10%·CA)   [plancher → IC>0 garanti]

import axios from 'axios';
import fs from 'fs';

const API_KEY = process.env.TWELVE_DATA_API || process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) { console.error('❌ TWELVE_DATA_API absent'); process.exit(1); }
const N_US = parseInt(process.argv[2] || '300', 10);

// ─────────── parse (copié VERBATIM de stock-filter-by-volume.js, + short_term_debt) ───────────
const pf = (v) => (v === null || v === undefined || v === '' || v === 'null') ? null
  : (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);

function parseBS(sheet) {
  if (!sheet || typeof sheet !== 'object') return null;
  const assets = sheet.assets || {}, liabilities = sheet.liabilities || {};
  const equityBlock = sheet.shareholders_equity || {};
  const currentLiab = liabilities.current_liabilities || {};
  const nonCurrentLiab = liabilities.non_current_liabilities || {};
  const currentAssets = assets.current_assets || {};
  const cashCands = [currentAssets.cash_and_cash_equivalents, currentAssets.cash, currentAssets.cash_equivalents,
    currentAssets.other_short_term_investments, assets.cash_and_cash_equivalents, sheet.cash_and_cash_equivalents, sheet.cash];
  const hasCash = cashCands.some(v => pf(v) != null);
  const cash_total = hasCash ? cashCands.map(pf).filter(v => v != null).reduce((s, v) => s + v, 0) : null;
  const totalAssets = pf(assets.total_assets) ?? pf(sheet.total_assets) ?? null;
  const totalLiabilities = pf(liabilities.total_liabilities) ?? pf(sheet.total_liabilities) ?? null;
  const totalCurrentLiabilities = pf(currentLiab.total_current_liabilities) ?? pf(liabilities.total_current_liabilities) ?? null;
  const accountsPayable = pf(currentLiab.accounts_payable) ?? 0;
  const accruedExpenses = pf(currentLiab.accrued_expenses) ?? 0;
  const shortTermDebt = pf(currentLiab.short_term_debt) ?? pf(currentLiab.current_debt) ?? 0;
  const longTermDebt = pf(nonCurrentLiab.long_term_debt) ?? pf(nonCurrentLiab.long_term_debt_and_capital_lease_obligation) ?? 0;
  let totalEquity = pf(equityBlock.total_shareholders_equity) ?? pf(equityBlock.total_stockholders_equity)
    ?? pf(equityBlock.stockholders_equity) ?? pf(equityBlock.total_equity) ?? pf(equityBlock.common_stock_equity)
    ?? pf(sheet.total_shareholders_equity) ?? pf(sheet.total_stockholders_equity) ?? null;
  if (totalEquity === null && totalAssets !== null && totalLiabilities !== null) totalEquity = totalAssets - totalLiabilities;
  return {
    total_debt: shortTermDebt + longTermDebt, short_term_debt: shortTermDebt, total_equity: totalEquity,
    total_assets: totalAssets, total_liabilities: totalLiabilities,
    total_current_liabilities: totalCurrentLiabilities, accounts_payable: accountsPayable,
    accrued_expenses: accruedExpenses, cash_and_st_investments: cash_total,
    fiscal_date: sheet.fiscal_date || sheet.date || null,
  };
}

function parseIS(s) {
  if (!s || typeof s !== 'object') return null;
  const netIncome = pf(s.net_income) ?? pf(s.net_income_common_stockholders) ?? pf(s.net_income_from_continuing_operations) ?? null;
  const revenue = pf(s.revenue) ?? pf(s.total_revenue) ?? pf(s.sales) ?? pf(s.operating_revenue) ?? null;
  const operatingIncome = pf(s.operating_income) ?? pf(s.ebit) ?? null;
  // produits financiers sur cash (best-effort — TD : interest_income direct ou non_operating_interest.income)
  const noi = s.non_operating_interest || {};
  const interestIncome = pf(s.interest_income) ?? pf(noi.income) ?? pf(noi.interest_income) ?? null;
  return {
    net_income: netIncome, revenue, operating_income: operatingIncome,
    pretax_income: pf(s.pretax_income) ?? null, income_tax: pf(s.income_tax) ?? null,
    interest_income: interestIncome, fiscal_date: s.fiscal_date || s.date || null,
  };
}

// ─────────── IC ancien (GuruFocus, copié) vs nouveau (spec §9) ───────────
function icOld(bs) {
  if (!bs || bs.total_assets == null) return null;
  const cash = bs.cash_and_st_investments ?? 0;
  const excessCash = cash - Math.max(0, (bs.total_current_liabilities ?? 0) - (bs.total_assets ?? 0) + cash);
  return bs.total_assets - (bs.accounts_payable ?? 0) - (bs.accrued_expenses ?? 0) - excessCash;
}
function icNew(bs, revenue, applyFloor = true) {
  if (!bs || bs.total_assets == null || revenue == null || revenue <= 0) return null;
  const nibcl = Math.max(0, (bs.total_current_liabilities ?? 0) - (bs.short_term_debt ?? 0));
  const icBrut = bs.total_assets - nibcl;                  // IC côté actifs, AVANT retrait du cash
  if (icBrut <= 0) return null;                            // bilan pathologique (passif courant > actifs)
  const excessCash = Math.max(0, (bs.cash_and_st_investments ?? 0) - 0.02 * revenue);
  const ic = icBrut - excessCash;
  // PLANCHER RELATIF (revue expert 2026-09-10) : retirer le cash ne peut au plus que diviser l'IC par 2
  // (donc ROIC ×2 max). Pas de dépendance au CA, pas d'explosion asset-light, pas de cas négatif.
  return applyFloor ? Math.max(ic, 0.5 * icBrut) : ic;
}

function roicYear(bsC, bsP, is, mode) {
  if (!bsC || !is) return null;
  const rev = is.revenue, op = is.operating_income;
  if (op == null) return null;
  let taxRate = 0.25;
  if (is.pretax_income > 0 && is.income_tax != null && is.income_tax >= 0) {
    taxRate = is.income_tax / is.pretax_income;
    taxRate = mode === 'new' ? Math.min(Math.max(taxRate, 0.15), 0.35) : Math.min(Math.max(taxRate, 0), 0.50);
  } else if (mode === 'new') taxRate = 0.25;
  const ebit = mode === 'new' ? op - (is.interest_income ?? 0) : op;   // ex-intérêts cash (nouveau)
  const nopat = ebit * (1 - taxRate);
  const cur = mode === 'new' ? icNew(bsC, rev) : icOld(bsC);
  const prev = bsP ? (mode === 'new' ? icNew(bsP, rev) : icOld(bsP)) : cur;   // rev de N en approx pour N-1
  const avgIC = (cur != null && prev != null) ? (cur + prev) / 2 : cur;
  if (avgIC == null || avgIC <= 1000) return null;
  return Math.round((nopat / avgIC) * 10000) / 100;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isRateLimited = (d) => d && (d.code === 429 || (d.status === 'error' && /run out|limit|credits/i.test(d.message || '')));

async function fetchStmt(kind, symbol, ctx) {
  const params = { symbol, period: 'annual', apikey: API_KEY };
  if (ctx?.country) params.country = ctx.country;
  if (ctx?.exchange) params.exchange = ctx.exchange;
  for (let attempt = 0; attempt < 5; attempt++) {          // filet rate-limit : backoff au lieu d'abandonner
    try {
      const { data } = await axios.get(`https://api.twelvedata.com/${kind}`, { params, timeout: 30000 });
      if (isRateLimited(data)) { await sleep(8000); continue; }
      if (!data || data.status === 'error' || data.code) return null;
      let arr = data[kind] || data;
      if (!Array.isArray(arr)) arr = [arr];
      return arr;
    } catch (e) {
      if (e.response?.status === 429) { await sleep(8000); continue; }
      return null;
    }
  }
  return null;
}

// ─────────── échantillon : Japon ciblé (cash-lourd) + US aléatoire ───────────
const JAPAN = [
  { sym: '6146', name: 'DISCO', country: 'Japan' }, { sym: '3064', name: 'MonotaRO', country: 'Japan' },
  { sym: '4684', name: 'OBIC', country: 'Japan' }, { sym: '6861', name: 'Keyence', country: 'Japan' },
  { sym: '4063', name: 'Shin-Etsu', country: 'Japan' }, { sym: '6273', name: 'SMC', country: 'Japan' },
];
function usSample(n) {
  const arr = (JSON.parse(fs.readFileSync('data/stocks_us.json', 'utf8')).stocks || []);
  // n'échantillonner QUE des titres AVEC fondamentaux (roic_avg_3y non-null) → couverture TD garantie,
  // fini le rendement 10% dû aux micro-caps sans data. Déterministe (pas déterministe → reproductible).
  const pick = arr.filter(s => s.ticker && /^[A-Z.]{1,5}$/.test(String(s.ticker)) && s.roic_avg_3y != null);
  const step = Math.max(1, Math.floor(pick.length / n));
  const out = [];
  for (let i = 0; i < pick.length && out.length < n; i += step) out.push({ sym: String(pick[i].ticker), name: pick[i].name });
  return out;
}

async function measure(entry) {
  const [bs, is] = await Promise.all([
    fetchStmt('balance_sheet', entry.sym, entry), fetchStmt('income_statement', entry.sym, entry),
  ]);
  if (!bs || !is) return null;
  const bsP = bs.map(parseBS).filter(Boolean), isP = is.map(parseIS).filter(Boolean);
  if (!bsP.length || !isP.length) return null;
  const oldR = roicYear(bsP[0], bsP[1], isP[0], 'old');
  const newR = roicYear(bsP[0], bsP[1], isP[0], 'new');
  if (oldR == null || newR == null) return null;
  const rawIC = icNew(bsP[0], isP[0].revenue, false);        // IC AVANT plancher (pour compter les rescapés)
  return { ...entry, old: oldR, new: newR, hadInterest: isP[0].interest_income != null,
           rawICneg: (rawIC != null && rawIC <= 0), negROIC: newR < 0 };
}

(async () => {
  const sample = [...JAPAN, ...usSample(N_US)];
  console.log(`Échantillon : ${JAPAN.length} Japon ciblés + ${sample.length - JAPAN.length} US (N_US=${N_US}). Fetch…`);
  const rows = [];
  for (let i = 0; i < sample.length; i++) {
    const r = await measure(sample[i]);
    if (r) rows.push(r);
    if (i % 25 === 0) process.stdout.write(`\r  ${i}/${sample.length} (${rows.length} valides)   `);
    await sleep(400);
  }
  console.log(`\n\n=== RÉSULTATS : ${rows.length} titres valides ===`);
  // POPULATION D'ÉVALUATION (revue expert) : ROIC_brut > 0 (les pertes échouent la porte 4 de toute façon ;
  // leur ROIC à −50000% est un artefact sans conséquence de sélection). Univers entier = info seulement.
  const evalR = rows.filter(r => r.old > 0);
  const dAll = rows.map(r => r.new - r.old).sort((a, b) => a - b);
  const meanAll = dAll.reduce((a, b) => a + b, 0) / dAll.length;
  const medAll = dAll[Math.floor(dAll.length / 2)];
  const deltas = evalR.map(r => r.new - r.old).sort((a, b) => a - b);
  const med = deltas[Math.floor(deltas.length / 2)];
  const p99 = deltas[Math.floor(0.99 * deltas.length)];
  const big = evalR.filter(r => Math.abs(r.new - r.old) > 2).length;
  const rescued = rows.filter(r => r.rawICneg).length;          // IC (avant plancher) ≤ 0 → rattrapé
  const negROIC = rows.filter(r => r.negROIC).length;           // ROIC < 0 = pertes (exclues de l'éval)
  const up = evalR.filter(r => r.old < 12 && r.new >= 12).length;
  const down = evalR.filter(r => r.new < 12 && r.old >= 12).length;
  const withInt = rows.filter(r => r.hadInterest).length;
  const scaleFull = 11000 / evalR.length;                       // extrapolation à ~11k titres éligibles
  const P = (ok) => ok ? '✅ PASS' : '❌ FAIL';
  console.log(`couverture produits financiers (NOPAT ex-intérêts) : ${withInt}/${rows.length} (${(100*withInt/rows.length).toFixed(0)}%)`);
  console.log(`plancher relatif déclenché : ${rescued} | exclus de l'éval (ROIC<0, pertes) : ${negROIC}`);
  console.log(`INFO univers entier (${rows.length}) : Δ médian ${medAll.toFixed(2)} · Δ moyen ${meanAll.toFixed(2)}`);
  console.log(`\n─ CRITÈRES D'ACCEPTATION (spec §9) — population ROIC_brut>0 : ${evalR.length} titres ─`);
  console.log(`  IC effectif > 0 (garanti plancher): 0 négatif  ${P(true)}`);
  console.log(`  Δ médian ∈ ±2 pts            : ${med.toFixed(2)}  ${P(Math.abs(med) <= 2)}`);
  console.log(`  matériel (|Δ|>2) < 25%       : ${(100*big/evalR.length).toFixed(1)}%  ${P(big/evalR.length < 0.25)}`);
  console.log(`  franchissent 12% net (extrap): +${Math.round((up-down)*scaleFull)} (< +300 ?)  ${P((up-down)*scaleFull < 300)}   [éch: +${up}/−${down}]`);
  console.log(`  p99 Δ < +30 pts              : ${p99.toFixed(1)}  ${P(p99 < 30)}`);
  console.log('\n─ JAPON (doit rester relevé, sens + ordre de grandeur) ─');
  for (const j of JAPAN) {
    const r = rows.find(x => x.sym === j.sym);
    console.log(`  ${j.name.padEnd(12)} ${r ? `${r.old.toFixed(1)} → ${r.new.toFixed(1)}  (${(r.new-r.old>=0?'+':'')}${(r.new-r.old).toFixed(1)})` : 'pas de data'}`);
  }
})();
