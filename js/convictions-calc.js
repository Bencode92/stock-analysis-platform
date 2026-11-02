/* Calcul « Mes convictions » partagé (funnel.html + portefeuille.html).
 * Entrées : data/convictions.json (cibles en %, public) + relevés CSV importés dans le navigateur
 * (localStorage « funnel-conv-import-v1 », jamais envoyés). Aucun montant réel dans le dépôt. */
(function (root) {
  const KEY = "funnel-conv-import-v1";

  function csvRows(t) {
    const out = []; let row = [], c = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch == '"') { if (t[i + 1] == '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
      if (ch == '"') q = true;
      else if (ch == ",") { row.push(c); c = ""; }
      else if (ch == "\n" || ch == "\r") { if (ch == "\r" && t[i + 1] == "\n") i++; row.push(c); out.push(row); row = []; c = ""; }
      else c += ch;
    }
    if (c || row.length) { row.push(c); out.push(row); }
    return out.filter(r => r.length > 1);
  }

  function parseStatement(text, fname) {
    const R = csvRows(text), h = R[0] || [], ix = n => h.indexOf(n);
    const iS = ix("Slice"), iN = ix("Name"), iV = ix("Value"), iI = ix("Invested value");
    if (iS < 0 || iV < 0) throw new Error("format inattendu (colonnes Slice / Value absentes)");
    const tot = R.find(r => r[iS] === "Total"), dm = /(\d{4}-\d{2}-\d{2})/.exec(fname || "");
    return {
      pie: (tot && tot[iN]) || fname, date: dm ? dm[1] : null,
      lines: R.slice(1).filter(r => r[iS] && r[iS] !== "Total").map(r => ({ t: r[iS], name: r[iN], value: +r[iV] || 0, invested: +r[iI] || 0 }))
    };
  }

  function loadPies() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return (s && s.pies) || []; } catch (e) { return []; }
  }

  // état final : plus petit total où aucune conviction ne dépasse sa cible (⑤b n'est jamais rachetée)
  function compute(CONV, pies) {
    const L = CONV.lines, B = {}; CONV.buckets.forEach(b => B[b.key] = b);
    const all = []; pies.forEach(p => p.lines.forEach(l => all.push({ ...l, pie: p.pie, m: L[l.t] || null })));
    // ligne décidée mais pas encore achetée → portefeuille de même nature (actions / ETF), à 0 €
    const kind = {};
    pies.forEach(p => {
      const c = {}; p.lines.forEach(l => { const m = L[l.t]; if (m && m.pie) c[m.pie] = (c[m.pie] || 0) + 1; });
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; if (top) kind[top[0]] = p.pie;
    });
    Object.entries(L).forEach(([t, m]) => { if (m.new && !all.some(l => l.t === t) && kind[m.pie]) all.push({ t, name: m.name, value: 0, invested: 0, pie: kind[m.pie], m, fresh: true }); });
    const T = all.reduce((s, l) => s + l.value, 0); if (!T) return null;
    const V = {}; all.forEach(l => { const k = l.m ? l.m.bucket : "?"; V[k] = (V[k] || 0) + l.value; });
    const recv = l => l.m && (l.m.receiver != null ? l.m.receiver : B[l.m.bucket].receiver === true);
    const ai = 100 * all.reduce((s, l) => s + l.value * (l.m ? l.m.ai : 0), 0) / T;
    const rc = 100 * all.reduce((s, l) => s + (recv(l) ? l.value : 0), 0) / T;
    let Ts = T, bind = null;
    CONV.buckets.forEach(b => { if (b.target > 0 && V[b.key]) { const x = V[b.key] / (b.target / 100); if (x > Ts) { Ts = x; bind = b.key; } } });
    const wsum = {}; all.forEach(l => { if (l.m) wsum[l.m.bucket] = (wsum[l.m.bucket] || 0) + l.m.w; });
    all.forEach(l => {
      const b = l.m && B[l.m.bucket];
      l.end = (!b || b.frozen || b.key === bind) ? l.value : Math.max(l.value, (b.target / 100) * Ts * l.m.w / wsum[b.key]);
      l.need = l.end - l.value;
    });
    const need = all.reduce((s, l) => s + l.need, 0);
    return { T, Ts, V, ai, rc, all, need, unknown: all.filter(l => !l.m) };
  }

  // poids cibles à saisir, par portefeuille, arrondis à 0,1 et sommés à 100
  function pieTargets(C, pies) {
    const out = {};
    pies.forEach(p => {
      const ls = C.all.filter(l => l.pie === p.pie), E = ls.reduce((s, l) => s + l.end, 0), N = ls.reduce((s, l) => s + l.value, 0);
      const w = ls.map(l => ({ l, t: Math.round(1000 * l.end / E) / 10, cur: N ? 100 * l.value / N : 0 }));
      const d = Math.round((100 - w.reduce((s, x) => s + x.t, 0)) * 10) / 10;
      if (d && w.length) { const top = w.reduce((a, x) => x.t > a.t ? x : a); top.t = Math.round((top.t + d) * 10) / 10; }
      out[p.pie] = w.sort((a, b) => b.t - a.t);
    });
    return out;
  }

  root.ConvCalc = { KEY, csvRows, parseStatement, loadPies, compute, pieTargets };
})(typeof window !== "undefined" ? window : globalThis);
