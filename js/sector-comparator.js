/**
 * TradePulse Comparator (sectors + markets)
 * ------------------------------------------
 * Compare deux secteurs OU deux marchés côte à côte : top 10 holdings (rangés
 * par poids ETF) enrichis avec les données perf + quality issues de
 * stocks_us/europe/asia.json.
 *
 * Auto-init :
 *   - #sector-comparator → source "sectors" (data/sectors.json)
 *   - #market-comparator → source "markets" (data/markets.json)
 */
(function () {
  'use strict';

  const STOCK_FILES = [
    'data/stocks_us.json',
    'data/stocks_europe.json',
    'data/stocks_asia.json',
  ];

  // Seuil minimum de holdings matchés sous lequel un item est désactivé
  const MIN_COVERAGE = 4;

  // Caches partagés (chargés une seule fois quel que soit le nombre d'instances)
  const shared = {
    holdings: null,
    stockIndex: null,
    loading: null,
  };

  // état par instance (un comparateur de secteurs OU de marchés)
  // state.items est rempli au démarrage de chaque instance
  const state = {
    items: null,
  };

  // ---------- Sources ----------
  const SOURCES = {
    sectors: {
      file: 'data/sectors.json',
      noun: 'secteur',
      title: 'Comparateur de secteurs',
      regions: [
        { key: 'all', label: 'Tous' },
        { key: 'europe', label: 'Europe' },
        { key: 'us', label: 'US' },
      ],
      flatten: flattenSectors,
    },
    markets: {
      file: 'data/markets.json',
      noun: 'marché',
      title: 'Comparateur de marchés',
      regions: [
        { key: 'all', label: 'Tous' },
        { key: 'europe', label: 'Europe' },
        { key: 'north-america', label: 'Amérique du Nord' },
        { key: 'asia', label: 'Asie' },
        { key: 'latin-america', label: 'Amérique latine' },
        { key: 'other', label: 'Autres' },
      ],
      flatten: flattenMarkets,
    },
  };

  // ---------- Loaders ----------

  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  }

  // Chargement des ressources partagées (etf_holdings + stocks)
  async function bootstrapShared() {
    if (shared.loading) return shared.loading;
    shared.loading = (async () => {
      const [holdingsRaw, ...stockSets] = await Promise.all([
        fetchJSON('data/etf_holdings.json'),
        ...STOCK_FILES.map(f => fetchJSON(f).catch(e => {
          console.warn('[comparator]', f, e);
          return null;
        })),
      ]);
      shared.holdings = holdingsRaw;
      shared.stockIndex = buildStockIndex(stockSets.filter(Boolean));
      return shared;
    })();
    return shared.loading;
  }

  async function bootstrap(source) {
    await bootstrapShared();
    const raw = await fetchJSON(source.file);
    state.items = source.flatten(raw);
    disambiguateLabels(state.items);
    computeAllItemAggs(state.items);   // remplace computeCoverage : calcule aussi item.agg
    computeCompositeScores(state.items); // ajoute item.compositeScore (percentile rank)
  }

  // Si plusieurs items partagent le même shortLabel dans la même famille,
  // on suffixe par symbole pour différencier (ex: "Etats-Unis (IVV)").
  function disambiguateLabels(items) {
    const groups = new Map();
    items.forEach(it => {
      const k = `${it.family}::${it.shortLabel}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    });
    groups.forEach(arr => {
      if (arr.length > 1) {
        arr.forEach(it => {
          // tente d'extraire un nom d'indice court depuis le label long
          const m = it.label.match(/(S&P\s*\d+|NASDAQ[^\s—]*|Russell\s*\d+|MSCI\s+\w+|FTSE\s*\d*|DAX|CAC\s*\d+|Nikkei\s*\d*|Hang\s*Seng|Dow\s*Jones)/i);
          const tag = m ? m[1].replace(/\s+/g, ' ') : it.symbol;
          it.shortLabel = `${it.shortLabel} (${tag})`;
        });
      }
    });
  }

  // Calcule la couverture stock (nb de holdings matchés) de chaque item
  function computeCoverage(items) {
    items.forEach(it => {
      const etf = shared.holdings?.etfs?.[it.symbol];
      const holdings = (etf?.holdings || []).slice(0, 10);
      let matched = 0;
      holdings.forEach(h => { if (matchStock(h, it.region)) matched++; });
      it.coverage = matched;
      it.totalHoldings = holdings.length;
      it.disabled = matched < MIN_COVERAGE;
    });
  }

  function flattenMarkets(raw) {
    const out = [];
    const groups = raw?.indices || {};
    const familyMap = {
      europe: 'Europe',
      'north-america': 'Amérique du Nord',
      us: 'États-Unis',
      asia: 'Asie',
      'latin-america': 'Amérique latine',
      other: 'Autres',
    };
    Object.keys(groups).forEach(region => {
      (groups[region] || []).forEach(m => {
        if (!m || !m.symbol) return;
        const country = m.country || '';
        const indexName = m.index_name || m.indexName || m.name || m.symbol;
        const label = country ? `${country} — ${indexName}` : indexName;
        const shortLabel = country || indexName;
        const family = familyMap[region] || region;
        out.push({
          key: `${region}::${m.symbol}`,
          label,
          shortLabel,
          family,
          region: family,
          regionKey: region,
          symbol: m.symbol,
          category: region,
          sectorObj: m,
        });
      });
    });
    out.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return out;
  }

  function flattenSectors(sectorsRaw) {
    const out = [];
    const groups = sectorsRaw?.sectors || {};
    Object.keys(groups).forEach(cat => {
      (groups[cat] || []).forEach(s => {
        if (!s || !s.symbol) return;
        const label = s.display_fr || s.indexName || s.name || s.symbol;
        // shortLabel = la partie après "—" (ex: "Technologie") sinon sector_fr
        const shortLabel = s.sector_fr
          || (label.includes('—') ? label.split('—').pop().trim() : label);
        const family = s.indexFamily || s.indexName || (s.region === 'Europe' ? 'Europe' : 'US');
        out.push({
          key: `${cat}::${s.symbol}`,
          label,
          shortLabel,
          family,
          region: s.region || '',
          regionKey: (s.region || '').toLowerCase(),
          symbol: s.symbol,
          category: cat,
          sectorObj: s,
        });
      });
    });
    out.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return out;
  }

  // ---------- Stock matching ----------

  function normalizeName(name) {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[.,'’()\-]/g, ' ')
      .replace(/\b(the|corp|corporation|inc|incorporated|company|co|ltd|limited|plc|sa|ag|nv|se|ab|oyj|holdings?|group|tr|trust|class\s*[abc])\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripSuffix(sym) {
    if (!sym) return '';
    return String(sym).split('.')[0].toUpperCase();
  }

  // Normalise une région ETF/holding vers une clé canonique : 'us' | 'europe' | 'asia' | ''
  function canonRegion(r) {
    if (!r) return '';
    const s = String(r).toLowerCase();
    if (s.includes('us') || s.includes('etat') || s.includes('états') || s.includes('north')) return 'us';
    if (s.includes('eur')) return 'europe';
    if (s.includes('asi') || s.includes('jap') || s.includes('chin') || s.includes('kor') || s.includes('hong') || s.includes('taiw')) return 'asia';
    return '';
  }

  // Index multi-candidats : Map<key, Stock[]>. On garde TOUS les candidats
  // pour pouvoir prioriser par région au moment du match.
  function buildStockIndex(stockSets) {
    const idx = new Map();
    let collisions = 0;
    const add = (k, v) => {
      if (!k) return;
      if (!idx.has(k)) {
        idx.set(k, [v]);
      } else {
        const arr = idx.get(k);
        // évite d'ajouter le même stock deux fois
        if (!arr.includes(v)) {
          arr.push(v);
          collisions++;
        }
      }
    };

    stockSets.forEach(set => {
      (set?.stocks || []).forEach(stk => {
        add(`T:${(stk.ticker || '').toUpperCase()}`, stk);
        add(`T:${stripSuffix(stk.ticker)}`, stk);
        if (stk.resolved_symbol) {
          add(`T:${stk.resolved_symbol.toUpperCase()}`, stk);
          add(`T:${stripSuffix(stk.resolved_symbol)}`, stk);
        }
        const n1 = normalizeName(stk.name);
        const n2 = normalizeName(stk.name_api);
        if (n1) add(`N:${n1}`, stk);
        if (n2) add(`N:${n2}`, stk);
      });
    });

    if (collisions > 0) {
      console.info(`[comparator] stock index built — ${idx.size} keys, ${collisions} collisions (multi-listing tickers)`);
    }
    return idx;
  }

  // Pick le meilleur candidat parmi les stocks indexés sous la même clé,
  // en privilégiant celui dont la région matche la région de l'ETF.
  function pickByRegion(candidates, regionHint) {
    if (!candidates || !candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    if (!regionHint) return candidates[0];
    const target = canonRegion(regionHint);
    if (!target) return candidates[0];
    const match = candidates.find(stk => canonRegion(stk.region) === target);
    return match || candidates[0];
  }

  function matchStock(holding, regionHint) {
    if (!shared.stockIndex) return null;
    const tries = [];
    if (holding.symbol) {
      tries.push(`T:${holding.symbol.toUpperCase()}`);
      tries.push(`T:${stripSuffix(holding.symbol)}`);
    }
    const n = normalizeName(holding.name);
    if (n) tries.push(`N:${n}`);
    for (const k of tries) {
      const candidates = shared.stockIndex.get(k);
      if (candidates) return pickByRegion(candidates, regionHint);
    }
    return null;
  }

  // ---------- Compute ----------

  function getHoldings(symbol) {
    const e = shared.holdings?.etfs?.[symbol];
    if (!e || !Array.isArray(e.holdings)) return [];
    return [...e.holdings]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 10);
  }

  function buildRows(symbol, regionHint) {
    return getHoldings(symbol).map((h, idx) => {
      const stock = matchStock(h, regionHint);
      return { rank: idx + 1, holding: h, stock };
    });
  }

  function weightedAvg(rows, getter) {
    let sum = 0, w = 0;
    rows.forEach(r => {
      const v = getter(r);
      const wt = r.holding.weight || 0;
      if (v != null && Number.isFinite(v) && wt > 0) {
        sum += v * wt; w += wt;
      }
    });
    return w > 0 ? sum / w : null;
  }

  function median(rows, getter) {
    const vals = rows.map(getter).filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    if (!vals.length) return null;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }

  function computeAggregates(rows) {
    const matched = rows.filter(r => r.stock);
    return {
      coverage: matched.length,
      total: rows.length,
      perf_ytd: weightedAvg(matched, r => r.stock.perf_ytd),
      perf_1y: weightedAvg(matched, r => r.stock.perf_1y),
      perf_3y: weightedAvg(matched, r => r.stock.perf_3y),
      quality: weightedAvg(matched, r => r.stock.quality_raw_score),
      buffett: weightedAvg(matched, r => r.stock.buffett_score),
      // Croissance et yield (signaux orthogonaux à quality)
      revenue_growth: median(matched, r => r.stock.revenue_growth_3y),
      eps_growth: median(matched, r => r.stock.eps_growth_5y),
      div_yield: weightedAvg(matched, r => r.stock.dividend_yield),
      fcf_yield: median(matched, r => r.stock.fcf_yield),
      // Conservés pour la table détaillée (non scorés, non comptés dans le composite)
      roe: median(matched, r => r.stock.roe),
      roic: median(matched, r => r.stock.roic),
      net_margin: median(matched, r => r.stock.net_margin),
      // Beta : descriptif uniquement
      beta: weightedAvg(matched, r => r.stock.beta),
    };
  }

  // ============================================================
  // Score composite percentile (style liste.html / AutoComparator)
  // ============================================================
  // Pondérations Σ = 1.00. Pas de double-counting :
  // - quality_raw + buffett sont des composites (incluent ROE/PE/D&E/FCF déjà)
  // - On garde uniquement des signaux orthogonaux à côté
  // - hib = "higher is better"
  const SECTOR_METRICS = [
    { key: 'perf_1y',        weight: 0.20, hib: true,  label: 'Perf 1Y' },
    { key: 'perf_3y',        weight: 0.15, hib: true,  label: 'Perf 3Y' },
    { key: 'quality',        weight: 0.25, hib: true,  label: 'Quality' },
    { key: 'buffett',        weight: 0.20, hib: true,  label: 'Buffett' },
    { key: 'revenue_growth', weight: 0.10, hib: true,  label: 'Revenue growth 3Y' },
    { key: 'fcf_yield',      weight: 0.06, hib: true,  label: 'FCF yield' },
    { key: 'div_yield',      weight: 0.04, hib: true,  label: 'Dividend yield' },
  ];

  // Pré-calcule les agrégats de chaque item au bootstrap (top 10 → agg).
  // Stocke item.agg pour réutilisation par renderPanel et computeCompositeScores.
  function computeAllItemAggs(items) {
    items.forEach(it => {
      const rows = buildRows(it.symbol, it.region);
      it.agg = computeAggregates(rows);
      it.coverage = it.agg.coverage;
      it.totalHoldings = it.agg.total;
      it.disabled = it.coverage < MIN_COVERAGE;
    });
  }

  // Score percentile pondéré dans l'univers des items enabled.
  // Identique à liste.html#computeScores : skip si <2 valeurs valides,
  // renormalise les poids sur les métriques effectivement utilisées.
  function computeCompositeScores(items) {
    const enabled = items.filter(i => !i.disabled);
    if (enabled.length < 2) {
      enabled.forEach(it => { it.compositeScore = null; });
      return;
    }
    const acc = enabled.map(() => ({ sum: 0, w: 0, used: 0 }));

    SECTOR_METRICS.forEach(metric => {
      const valid = enabled
        .map((it, i) => ({ v: it.agg ? it.agg[metric.key] : null, i }))
        .filter(x => x.v != null && Number.isFinite(x.v));
      if (valid.length < 2) return; // skip métrique : ne pénalise pas
      // tri du pire au meilleur selon hib
      valid.sort((a, b) => metric.hib ? a.v - b.v : b.v - a.v);
      // assignation de percentile 0-100
      valid.forEach((x, rank) => {
        const pct = (rank / (valid.length - 1)) * 100;
        acc[x.i].sum += pct * metric.weight;
        acc[x.i].w   += metric.weight;
        acc[x.i].used++;
      });
    });

    enabled.forEach((it, i) => {
      it.compositeScore = acc[i].w > 0 ? Math.round(acc[i].sum / acc[i].w) : null;
      it.compositeMetricsUsed = acc[i].used;
    });
    // Items disabled : pas de score
    items.filter(i => i.disabled).forEach(it => { it.compositeScore = null; });
  }

  // ---------- Render ----------

  const fmtPct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const fmtNum = (v, d = 1) => v == null ? '—' : v.toFixed(d);
  const fmtScore = v => v == null ? '—' : Math.round(v).toString();
  const cls = v => v == null ? '' : (v >= 0 ? 'positive' : 'negative');

  // Heatmap cell background — green for high/positive, red for low/negative.
  // `min`/`max` define the value range mapped to full color intensity.
  function heat(v, min, max) {
    if (v == null || !Number.isFinite(v)) return '';
    const mid = (min + max) / 2;
    const half = (max - min) / 2 || 1;
    const t = Math.max(-1, Math.min(1, (v - mid) / half));
    const a = Math.abs(t) * 0.32;
    const rgb = t >= 0 ? '0,255,135' : '255,107,107';
    return `background:rgba(${rgb},${a.toFixed(3)})`;
  }

  function renderRows(rows) {
    if (!rows.length) {
      return `<tr><td colspan="7" class="text-center py-4 opacity-60">Aucun holding disponible</td></tr>`;
    }
    return rows.map(r => {
      const s = r.stock || {};
      const name = (r.holding.name || s.name || '—');
      const tic = r.holding.symbol || s.ticker || '';
      const w = r.holding.weight != null ? (r.holding.weight * 100).toFixed(2) + '%' : '—';
      const flag = r.stock ? '' : '<span title="Pas de match" style="opacity:.4">∅</span>';
      return `
        <tr>
          <td class="sc-rank">${r.rank}</td>
          <td class="sc-name-cell">
            <div class="sc-name" title="${name}">${name} ${flag}</div>
            <div class="sc-tic">${tic}${s.country ? ' • ' + s.country : ''}</div>
          </td>
          <td class="sc-w">${w}</td>
          <td class="sc-heat ${cls(s.perf_ytd)}" style="${heat(s.perf_ytd, -20, 20)}">${fmtPct(s.perf_ytd)}</td>
          <td class="sc-heat ${cls(s.perf_1y)}" style="${heat(s.perf_1y, -20, 40)}">${fmtPct(s.perf_1y)}</td>
          <td class="sc-heat sc-q" style="${heat(s.quality_raw_score, 30, 85)}">${fmtScore(s.quality_raw_score)}${s.quality_grade ? ` <span class="sc-grade">${s.quality_grade}</span>` : ''}</td>
          <td class="sc-num">${fmtScore(s.buffett_score)}</td>
        </tr>`;
    }).join('');
  }

  // Liste ordonnée des métriques agrégées + sens (1 = higher wins, -1 = lower wins, 0 = neutre)
  const AGG_METRICS = [
    // eps = tie zone : si |L − R| < eps on déclare égalité (anti-bruit statistique)
    // group : utilisé pour l'affichage en sections thématiques
    // Métriques retirées (ROE/ROIC/net_margin) car déjà incluses dans quality_raw → double counting
    { key: 'perf_ytd',       label: 'Perf YTD (pondérée)', dir: 1, eps: 0.5, group: 'perf', fmt: v => fmtPct(v) },
    { key: 'perf_1y',        label: 'Perf 1Y (pondérée)',  dir: 1, eps: 0.5, group: 'perf', fmt: v => fmtPct(v) },
    { key: 'perf_3y',        label: 'Perf 3Y (pondérée)',  dir: 1, eps: 1.0, group: 'perf', fmt: v => fmtPct(v) },
    { key: 'quality',        label: 'Quality raw (pondéré)', dir: 1, eps: 2,   group: 'quality', fmt: v => fmtScore(v) },
    { key: 'buffett',        label: 'Buffett (pondéré)',   dir: 1, eps: 2,   group: 'quality', fmt: v => fmtScore(v) },
    { key: 'revenue_growth', label: 'Revenue growth 3Y',   dir: 1, eps: 0.5, group: 'quality', fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'fcf_yield',      label: 'FCF yield médian',    dir: 1, eps: 0.5, group: 'yield',   fmt: v => v == null ? '—' : v.toFixed(1) + '%' },
    { key: 'div_yield',      label: 'Dividend yield',      dir: 1, eps: 0.3, group: 'yield',   fmt: v => v == null ? '—' : v.toFixed(2) + '%' },
    // Beta est linéaire en pondération (β_p = Σ wᵢβᵢ), exact mathématiquement.
    // Vol et Max DD pondérés ne sont PAS exacts (ignorent les corrélations) — retirés.
    { key: 'beta',           label: 'Beta (pondéré)',      dir: 0,           group: 'risk',    fmt: v => v == null ? '—' : v.toFixed(2) },
    { key: 'coverage',       label: 'Couverture stocks',   dir: 0,           group: 'risk',    fmt: (_, agg) => `${agg.coverage}/${agg.total}` },
  ];

  const AGG_GROUPS = [
    { key: 'perf',    label: 'Performance' },
    { key: 'quality', label: 'Qualité & Croissance' },
    { key: 'yield',   label: 'Yield' },
    { key: 'risk',    label: 'Risque & Couverture' },
  ];

  function compareAggregates(aggL, aggR) {
    const result = { left: {}, right: {}, leftWins: 0, rightWins: 0, ties: 0 };
    AGG_METRICS.forEach(m => {
      if (m.dir === 0) { result.left[m.key] = result.right[m.key] = 'neutral'; return; }
      const vL = aggL[m.key], vR = aggR[m.key];
      if (vL == null || vR == null || !Number.isFinite(vL) || !Number.isFinite(vR)) {
        result.left[m.key] = result.right[m.key] = 'neutral';
        return;
      }
      // Tie zone : écart inférieur à epsilon → égalité (pas de victoire attribuée)
      if (Math.abs(vL - vR) < (m.eps || 0)) {
        result.left[m.key] = result.right[m.key] = 'tie';
        result.ties++;
        return;
      }
      const leftBetter = (m.dir === 1 ? vL > vR : vL < vR);
      result.left[m.key]  = leftBetter ? 'win' : 'lose';
      result.right[m.key] = leftBetter ? 'lose' : 'win';
      if (leftBetter) result.leftWins++; else result.rightWins++;
    });
    return result;
  }

  function renderAggregates(agg, comparison, side) {
    return AGG_GROUPS.map(g => {
      const cells = AGG_METRICS.filter(m => m.group === g.key).map(m => {
        const tone = comparison[side][m.key];
        const val = m.fmt(agg[m.key], agg);
        return `
          <div class="sc-agg-cell sc-${tone}">
            <div class="sc-agg-label">${m.label}</div>
            <div class="sc-agg-val">${val}</div>
          </div>`;
      }).join('');
      return `
        <div class="sc-agg-section">
          <div class="sc-agg-section-h">${g.label}</div>
          <div class="sc-agg-grid">${cells}</div>
        </div>`;
    }).join('');
  }

  function renderPanel(side, sector, agg, comparison) {
    const rows = buildRows(sector.symbol, sector.region);
    const wins = comparison[`${side}Wins`];
    const so = sector.sectorObj || {};
    // top_weight peut être stocké en pourcentage (35.2) ou en fraction (0.352)
    const etfData = shared.holdings?.etfs?.[sector.symbol];
    let topWeightPct = null;
    if (etfData && etfData.top_weight != null) {
      topWeightPct = etfData.top_weight > 1 ? etfData.top_weight : etfData.top_weight * 100;
    }
    const lowCoverage = topWeightPct != null && topWeightPct < 40;
    const warningBanner = lowCoverage ? `
      <div class="sc-warning" title="Le top 10 ne représente qu'une petite fraction de l'ETF — les agrégats ci-dessous ne reflètent pas le portefeuille complet">
        ⚠ Top 10 = ${topWeightPct.toFixed(1)}% du portefeuille — agrégats peu représentatifs
      </div>` : '';
    // Perf ETF réelle (sectors.json/markets.json) — à comparer avec la perf top-10 pondérée
    const realPerf = `
      <div class="sc-panel-realperf" title="Perfs réelles de l'ETF (toutes positions, pas seulement top-10). À comparer aux agrégats top-10 ci-dessous pour mesurer le biais de représentativité.">
        <span class="sc-rp-label">ETF réel :</span>
        <span class="sc-rp-item">YTD <b class="${cls(so.ytd_num)}">${fmtPct(so.ytd_num)}</b></span>
        <span class="sc-rp-item">3M <b class="${cls(so.m3_num)}">${fmtPct(so.m3_num)}</b></span>
        <span class="sc-rp-item">52W <b class="${cls(so.w52_num)}">${fmtPct(so.w52_num)}</b></span>
      </div>`;
    return `
      <div class="sc-panel">
        <div class="sc-panel-head">
          <div class="sc-panel-title">${sector.label}</div>
          <div class="sc-panel-sub">${sector.region} • ETF ${sector.symbol}${topWeightPct != null ? ` • Top 10 = ${topWeightPct.toFixed(1)}%` : ''}</div>
          ${warningBanner}
          ${realPerf}
          <div class="sc-panel-composite">
            <div class="sc-cs-num" style="${heat(sector.compositeScore, 30, 80)}">${sector.compositeScore != null ? sector.compositeScore : '—'}</div>
            <div class="sc-cs-lbl">
              <div class="sc-cs-title">Score composite</div>
              <div class="sc-cs-sub">percentile dans l'univers · ${sector.compositeMetricsUsed || 0}/${SECTOR_METRICS.length} métriques</div>
            </div>
          </div>
          <div class="sc-panel-score">
            <span class="sc-score-num">${wins}</span>
            <span class="sc-score-lbl">victoire${wins > 1 ? 's' : ''} sur ${comparison.leftWins + comparison.rightWins} critères</span>
          </div>
        </div>
        <div class="sc-table-wrap">
          <table class="sc-table">
            <thead>
              <tr>
                <th>#</th><th>Société</th><th>Poids</th>
                <th>YTD</th><th>1Y</th>
                <th title="Score qualité brut, non peer-normalisé. Inclut déjà ROE/PE/D&E/FCF.">Quality*</th><th>Buffett</th>
              </tr>
            </thead>
            <tbody>${renderRows(rows)}</tbody>
          </table>
        </div>
        ${renderAggregates(agg, comparison, side)}
      </div>`;
  }

  function renderComparison(rootEl, leftKey, rightKey) {
    const left  = state.items.find(s => s.key === leftKey);
    const right = state.items.find(s => s.key === rightKey);
    if (!left || !right) {
      rootEl.innerHTML = '<div class="opacity-60 py-6 text-center">Sélectionne deux secteurs.</div>';
      return;
    }
    const rowsL = buildRows(left.symbol, left.region);
    const rowsR = buildRows(right.symbol, right.region);
    const aggL = computeAggregates(rowsL);
    const aggR = computeAggregates(rowsR);
    const cmp = compareAggregates(aggL, aggR);

    const winnerLabel = cmp.leftWins === cmp.rightWins
      ? '<span class="sc-banner-tie">Égalité</span>'
      : cmp.leftWins > cmp.rightWins
        ? `<span class="sc-banner-winner">🏆 ${left.label}</span> l'emporte ${cmp.leftWins}–${cmp.rightWins}`
        : `<span class="sc-banner-winner">🏆 ${right.label}</span> l'emporte ${cmp.rightWins}–${cmp.leftWins}`;

    rootEl.innerHTML = `
      <div class="sc-banner">${winnerLabel}</div>
      <div class="sc-grid">
        ${renderPanel('left',  left,  aggL, cmp)}
        ${renderPanel('right', right, aggR, cmp)}
      </div>`;
  }

  // ---------- UI wire-up ----------

  function injectStyles() {
    if (document.getElementById('sc-styles')) return;
    const css = `
      #sector-comparator { margin: 2.5rem 0; width: 100%; }
      #sector-comparator .section-title { text-align: center; }
      .sc-hint { text-align: center; opacity: .75; font-size: .9rem; margin-bottom: 1rem; }
      .sc-region-tabs { display: flex; justify-content: center; gap: .4rem; margin-bottom: .85rem; }
      .sc-rtab { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: inherit; padding: .35rem .9rem; border-radius: 999px; font-size: .78rem; cursor: pointer; }
      .sc-rtab.is-active { background: rgba(0,255,135,.18); border-color: rgba(0,255,135,.5); color: #00ff87; }
      .sc-chips { display: flex; flex-direction: column; gap: .9rem; margin: 0 auto 1rem; max-width: 1100px; }
      .sc-family { background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.06); border-radius: .65rem; padding: .65rem .85rem .75rem; }
      .sc-family-head { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; opacity: .55; font-weight: 600; margin-bottom: .55rem; }
      .sc-family-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
      .sc-chip { position: relative; display: inline-flex; align-items: center; gap: .4rem; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: inherit; border-radius: .45rem; padding: .42rem .75rem; font-size: .78rem; cursor: pointer; transition: all .12s; text-align: left; }
      .sc-chip:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.25); transform: translateY(-1px); }
      .sc-chip.is-selected { background: rgba(0,255,135,.18); border-color: #00ff87; box-shadow: 0 0 0 1px #00ff87 inset; }
      .sc-chip.is-disabled { opacity: .35; cursor: not-allowed; text-decoration: line-through; }
      .sc-chip.is-disabled:hover { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); transform: none; }
      .sc-chip-num { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: #00ff87; color: #001; font-weight: 800; font-size: .65rem; }
      .sc-chip-label { font-weight: 600; }
      .sc-chip-cov { font-size: .62rem; opacity: .55; padding: 1px 5px; background: rgba(255,255,255,.06); border-radius: 4px; font-variant-numeric: tabular-nums; }
      .sc-actions { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 1.25rem; }
      .sc-btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,.15); color: inherit; padding: .35rem .8rem; border-radius: .4rem; font-size: .75rem; cursor: pointer; opacity: .7; }
      .sc-btn-ghost:hover { opacity: 1; }
      .sc-status { font-size: .72rem; opacity: .45; }
      .sc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
      @media (max-width: 1000px) { .sc-grid { grid-template-columns: 1fr; } }
      .sc-panel { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09); border-radius: .9rem; padding: 1.1rem 1.1rem 1rem; }
      .sc-panel-head { margin-bottom: .9rem; padding-bottom: .75rem; border-bottom: 1px solid rgba(255,255,255,.07); }
      .sc-panel-title { font-weight: 700; font-size: 1.1rem; letter-spacing: .01em; }
      .sc-panel-sub { font-size: .78rem; opacity: .55; margin-top: 2px; }
      .sc-table-wrap { overflow: hidden; }
      .sc-table { width: 100%; border-collapse: separate; border-spacing: 0 3px; font-size: .8rem; table-layout: auto; }
      .sc-table th, .sc-table td { text-align: right; padding: .55rem .4rem; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; }
      .sc-table th { font-weight: 600; opacity: .5; font-size: .65rem; text-transform: uppercase; letter-spacing: .06em; padding: .35rem .4rem .5rem; border-bottom: 1px solid rgba(255,255,255,.07); }
      .sc-table tbody tr { background: rgba(255,255,255,.02); transition: background .12s; }
      .sc-table tbody tr:hover { background: rgba(255,255,255,.06); }
      .sc-table tbody td:first-child { border-radius: .4rem 0 0 .4rem; }
      .sc-table tbody td:last-child  { border-radius: 0 .4rem .4rem 0; }
      .sc-table th:nth-child(1), .sc-table td:nth-child(1) { width: 24px; text-align: center; padding-left: .5rem; }
      .sc-table th:nth-child(2), .sc-table td:nth-child(2) { text-align: left; padding-left: .25rem; max-width: 0; width: 100%; }
      .sc-rank { opacity: .3; font-weight: 700; font-size: .8rem; }
      .sc-name-cell { overflow: hidden; }
      .sc-name { font-weight: 600; font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; line-height: 1.25; }
      .sc-tic { font-size: .66rem; opacity: .45; margin-top: 2px; letter-spacing: .02em; }
      .sc-w { color: #fff; opacity: .9; font-weight: 700; }
      .sc-num { opacity: .82; font-weight: 500; }
      .sc-heat { border-radius: .35rem; font-weight: 700; }
      .sc-q { font-weight: 700; }
      .sc-grade { display: inline-block; font-size: .62rem; padding: 1px 5px; border-radius: 4px; background: rgba(0,255,135,.22); color: #00ff87; margin-left: 4px; vertical-align: middle; font-weight: 800; }
      .positive { color: #00ff87; }
      .negative { color: #ff6b6b; }
      .sc-banner { text-align: center; font-size: 1rem; margin-bottom: 1rem; padding: .85rem; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: .6rem; }
      .sc-banner-winner { color: #00ff87; font-weight: 700; font-size: 1.1rem; }
      .sc-banner-tie { color: #ffd166; font-weight: 700; font-size: 1.1rem; }
      .sc-warning { margin-top: .55rem; padding: .55rem .75rem; background: rgba(255,209,102,.12); border: 1px solid rgba(255,209,102,.45); border-radius: .45rem; color: #ffd166; font-size: .78rem; font-weight: 600; }
      .sc-panel-realperf { margin-top: .55rem; display: flex; flex-wrap: wrap; gap: .85rem; align-items: baseline; padding: .5rem .65rem; background: rgba(255,255,255,.025); border-radius: .4rem; font-size: .75rem; }
      .sc-rp-label { opacity: .55; text-transform: uppercase; letter-spacing: .04em; font-size: .65rem; font-weight: 600; }
      .sc-rp-item { opacity: .85; font-variant-numeric: tabular-nums; }
      .sc-rp-item b { font-weight: 700; margin-left: .25rem; }
      .sc-panel-composite { margin-top: .65rem; display: flex; align-items: center; gap: .85rem; padding: .65rem .85rem; background: rgba(0,255,135,.04); border: 1px solid rgba(0,255,135,.18); border-radius: .5rem; }
      .sc-cs-num { font-size: 2rem; font-weight: 800; line-height: 1; padding: .25rem .65rem; border-radius: .4rem; font-variant-numeric: tabular-nums; min-width: 60px; text-align: center; color: #fff; }
      .sc-cs-lbl { display: flex; flex-direction: column; gap: 1px; }
      .sc-cs-title { font-size: .78rem; font-weight: 700; opacity: .9; }
      .sc-cs-sub { font-size: .65rem; opacity: .55; }
      .sc-panel-score { margin-top: .5rem; display: flex; align-items: baseline; gap: .35rem; }
      .sc-score-num { font-size: 1.6rem; font-weight: 800; color: #00ff87; line-height: 1; font-variant-numeric: tabular-nums; }
      .sc-score-lbl { font-size: .72rem; opacity: .55; text-transform: uppercase; letter-spacing: .04em; }
      .sc-agg-section { margin-top: 1rem; }
      .sc-agg-section:first-of-type { padding-top: 1rem; border-top: 1px solid rgba(255,255,255,.08); }
      .sc-agg-section-h { font-size: .62rem; font-weight: 700; opacity: .5; text-transform: uppercase; letter-spacing: .08em; margin-bottom: .4rem; }
      .sc-agg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .45rem; }
      @media (max-width: 700px) { .sc-agg-grid { grid-template-columns: repeat(2, 1fr); } }
      .sc-agg-cell { background: rgba(255,255,255,.04); border-radius: .5rem; padding: .55rem .6rem; border: 1px solid transparent; transition: all .2s; }
      .sc-agg-cell.sc-win  { background: rgba(0,255,135,.18); border-color: rgba(0,255,135,.5); }
      .sc-agg-cell.sc-lose { background: rgba(255,107,107,.15); border-color: rgba(255,107,107,.4); }
      .sc-agg-cell.sc-tie  { background: rgba(255,209,102,.12); border-color: rgba(255,209,102,.35); }
      .sc-agg-cell.sc-win .sc-agg-val  { color: #00ff87; }
      .sc-agg-cell.sc-lose .sc-agg-val { color: #ff8888; }
      .sc-agg-label { font-size: .6rem; opacity: .65; text-transform: uppercase; letter-spacing: .04em; }
      .sc-agg-val { font-size: 1.02rem; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 3px; }
    `;
    const tag = document.createElement('style');
    tag.id = 'sc-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function renderChips(container, regionFilter, selected) {
    const list = state.items.filter(s => regionFilter === 'all' || s.regionKey === regionFilter);
    // Groupe par famille d'indice
    const families = new Map();
    list.forEach(s => {
      if (!families.has(s.family)) families.set(s.family, []);
      families.get(s.family).push(s);
    });

    container.innerHTML = [...families.entries()].map(([family, sectors]) => `
      <div class="sc-family">
        <div class="sc-family-head">${family}</div>
        <div class="sc-family-chips">
          ${sectors.map(s => {
            const isSel = selected.includes(s.key);
            const order = isSel ? selected.indexOf(s.key) + 1 : '';
            const dis = s.disabled ? 'is-disabled' : '';
            const cov = `${s.coverage}/${s.totalHoldings || 10}`;
            const titleTxt = s.disabled
              ? `${s.label} — données insuffisantes (${cov} holdings matchés, min ${MIN_COVERAGE})`
              : `${s.label} — ${cov} holdings`;
            return `<button type="button" class="sc-chip ${isSel ? 'is-selected' : ''} ${dis}" data-key="${s.key}" title="${titleTxt}" ${s.disabled ? 'aria-disabled="true"' : ''}>
              ${isSel ? `<span class="sc-chip-num">${order}</span>` : ''}
              <span class="sc-chip-label">${s.shortLabel}</span>
              <span class="sc-chip-cov">${cov}</span>
            </button>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  async function initInstance(containerId, sourceKey) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const source = SOURCES[sourceKey];
    if (!source) return;
    injectStyles();
    const noun = source.noun;
    const nounPlural = noun + 's';
    root.innerHTML = `
      <h2 class="section-title">${source.title}</h2>
      <div class="sc-hint" id="sc-hint">Sélectionne <strong>2 ${nounPlural}</strong> pour les comparer</div>
      <div class="sc-region-tabs">
        ${source.regions.map((r, i) => `<button type="button" class="sc-rtab ${i === 0 ? 'is-active' : ''}" data-region="${r.key}">${r.label}</button>`).join('')}
      </div>
      <div id="sc-chips" class="sc-chips"></div>
      <div class="sc-actions">
        <button type="button" id="sc-clear" class="sc-btn-ghost">Réinitialiser</button>
        <span id="sc-status" class="sc-status"></span>
      </div>
      <div id="sc-result"></div>`;

    const status = root.querySelector('#sc-status');
    status.textContent = 'Chargement…';
    try {
      await bootstrap(source);
    } catch (e) {
      status.textContent = 'Erreur de chargement';
      console.error('[comparator]', e);
      return;
    }
    status.textContent = `${state.items.length} ${nounPlural} disponibles`;

    let regionFilter = 'all';
    let selected = []; // array of keys, max 2
    const chipsEl = root.querySelector('#sc-chips');
    const resultEl = root.querySelector('#sc-result');
    const hintEl = root.querySelector('#sc-hint');

    const refresh = () => {
      renderChips(chipsEl, regionFilter, selected);
      hintEl.innerHTML = selected.length === 0
        ? `Sélectionne <strong>2 ${nounPlural}</strong> pour les comparer`
        : selected.length === 1
          ? `Sélectionne <strong>1 ${noun}</strong> de plus…`
          : '<span style="color:#00ff87">Comparaison active — clique sur une carte pour la remplacer</span>';
      if (selected.length === 2) {
        renderComparison(resultEl, selected[0], selected[1]);
      } else {
        resultEl.innerHTML = '';
      }
    };

    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.sc-chip');
      if (!btn || btn.classList.contains('is-disabled')) return;
      const key = btn.dataset.key;
      const i = selected.indexOf(key);
      if (i >= 0) {
        selected.splice(i, 1);
      } else if (selected.length < 2) {
        selected.push(key);
      } else {
        selected.shift();
        selected.push(key);
      }
      refresh();
    });

    root.querySelectorAll('.sc-rtab').forEach(tab => {
      tab.addEventListener('click', () => {
        root.querySelectorAll('.sc-rtab').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        regionFilter = tab.dataset.region;
        refresh();
      });
    });

    root.querySelector('#sc-clear').addEventListener('click', () => {
      selected = [];
      refresh();
    });

    refresh();
  }

  function init() {
    if (document.getElementById('sector-comparator')) initInstance('sector-comparator', 'sectors');
    if (document.getElementById('market-comparator')) initInstance('market-comparator', 'markets');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposition des fonctions pures pour les tests (tests/comparator.html)
  // Aucune dépendance au DOM, aucun side effect.
  window.SectorComparator = {
    normalizeName,
    stripSuffix,
    canonRegion,
    weightedAvg,
    median,
    buildStockIndex,
    matchStock,
    pickByRegion,
    compareAggregates,
    disambiguateLabels,
    flattenSectors,
    flattenMarkets,
    AGG_METRICS,
    MIN_COVERAGE,
    // hooks pour injecter un état partagé en test (sans toucher au runtime)
    _setShared(state) { Object.assign(shared, state); },
    _resetShared() { shared.holdings = null; shared.stockIndex = null; shared.loading = null; },
  };
})();
