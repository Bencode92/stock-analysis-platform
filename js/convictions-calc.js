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

  // Pilotés (cibles, plafonds, versements) : les portefeuilles dont au moins la moitié des lignes sont dans convictions.json.
  // Les autres (socle, suivi…) sont gardés et analysés à part : ils ne faussent ni les écarts ni les versements.
  const ROLES = [{ k: "convictions", l: "Actions convictions" }, { k: "thematique", l: "Thématique" }, { k: "socle", l: "Actions socle" }, { k: "track", l: "Track (lié à la banque)" }];
  function guessRole(CONV, p) {
    const n = String(p.pie || "");
    if (/socle/i.test(n)) return "socle";
    if (/track|banque/i.test(n)) return "track";
    if (/th[eé]mat/i.test(n)) return "thematique";
    if (/convic/i.test(n)) return "convictions";
    const c = {}; p.lines.forEach(l => { const m = CONV.lines[l.t]; if (m && m.pie) c[m.pie] = (c[m.pie] || 0) + 1; });
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] * 2 >= p.lines.length ? (top[0] === "etf" ? "thematique" : "convictions") : "track";
  }
  function isPiloted(CONV, p) {
    if (p.role) return p.role === "convictions" || p.role === "thematique";   // choisi à l'import : fait foi
    return p.lines.length > 0 && p.lines.filter(l => CONV.lines[l.t]).length * 2 >= p.lines.length;
  }
  function pilotPies(CONV, pies) { return pies.filter(p => isPiloted(CONV, p)); }

  // même symbole ≠ même société (SU = Schneider à Paris, Suncor à New York) : le nom doit concorder
  const NAME_STOP = new Set(["THE", "INC", "CORP", "CO", "LTD", "PLC", "SA", "SE", "NV", "AG"]);
  const nameWords = n => String(n || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").split(" ").filter(w => w && !NAME_STOP.has(w));
  function findRow(rows, l, m) {
    const w = nameWords(m ? m.name : l.name); if (!w.length) return null;
    const cand = rows.filter(r => r.t === l.t && nameWords(r.n).includes(w[0]));
    if (cand.length) return cand[0];
    if (m) return rows.find(r => r.t === l.t && r.st === "mine") || null;   // « TSMC » ≠ « Taiwan Semiconductor » : ligne déjà rattachée
    // repli sur le nom seul (classes d'actions : GOOGL/GOOG) : premier mot long et sans ambiguïté, ou deux mots
    const same = rows.filter(r => nameWords(r.n)[0] === w[0]);
    if (same.length === 1 && w[0].length >= 5) return same[0];
    return w.length > 1 ? same.find(r => nameWords(r.n)[1] === w[1]) || null : null;
  }

  // Vue des portefeuilles importés : tous, pilotés ou non. rows = lignes de conviction_universe.json
  function overview(CONV, pies, rows) {
    rows = rows || [];
    const aiSum = {}, aiN = {};
    Object.values(CONV.lines).forEach(m => { aiSum[m.bucket] = (aiSum[m.bucket] || 0) + m.ai; aiN[m.bucket] = (aiN[m.bucket] || 0) + 1; });
    const T = pies.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.value, 0), 0);
    const P = pies.map(p => {
      const piloted = isPiloted(CONV, p), V = p.lines.reduce((a, l) => a + l.value, 0), I = p.lines.reduce((a, l) => a + l.invested, 0);
      const lines = p.lines.map(l => {
        let m = CONV.lines[l.t] || null;
        // hors pilotés, le symbole ne suffit pas : même nom exigé
        if (m && !piloted && l.name && !nameWords(l.name).some(w => nameWords(m.name).includes(w))) m = null;
        const row = findRow(rows, l, m), mapped = !m && !row ? (CONV.etf_map || {})[l.t] || null : null;
        const bucket = m ? m.bucket : row && row.b !== "b4" ? row.b : mapped ? mapped.b : null;   // « machines » ≠ robots : ④ n'a aucune ligne tant que la thèse n'est pas écrite
        return { ...l, m, row, bucket, estimated: !m && (!!row || !!mapped), ai: m ? m.ai : mapped ? mapped.ai : bucket ? aiSum[bucket] / aiN[bucket] || 0 : 0, weight: V ? 100 * l.value / V : 0,
                 res: l.invested > 0 ? 100 * (l.value / l.invested - 1) : null };
      }).sort((a, b) => b.value - a.value);
      return { pie: p.pie, date: p.date, role: p.role || null, piloted, value: V, invested: I, res: I > 0 ? 100 * (V / I - 1) : null, share: T ? 100 * V / T : 0, lines };
    });
    const sumBy = list => { const o = {}; list.forEach(p => p.lines.forEach(l => { const k = l.bucket || "?"; o[k] = (o[k] || 0) + l.value; })); return o; };
    const pil = P.filter(x => x.piloted), TP = pil.reduce((s, x) => s + x.value, 0);
    const aiOf = (list, tot) => tot ? 100 * list.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.value * l.ai, 0), 0) / tot : null;
    const seen = {}; P.forEach(p => p.lines.forEach(l => { const k = l.m ? l.t : l.t + "|" + nameWords(l.name)[0]; (seen[k] = seen[k] || []).push({ t: l.t, pie: p.pie, value: l.value, name: l.m ? l.m.name : l.name });  }));
    const dupes = Object.entries(seen).filter(([, v]) => v.length > 1)
      .map(([, v]) => ({ t: v[0].t, name: v[0].name, pies: v.map(x => x.pie), share: T ? 100 * v.reduce((s, x) => s + x.value, 0) / T : 0 })).sort((a, b) => b.share - a.share);
    return { pies: P, T, TP, byAll: sumBy(P), byPilot: sumBy(pil), aiAll: aiOf(P, T), aiPilot: aiOf(pil, TP), dupes,
             dates: [...new Set(P.map(p => p.date).filter(Boolean))] };
  }

  // état final : plus petit total où aucune conviction ne dépasse sa cible (⑤b n'est jamais rachetée)
  function compute(CONV, piesIn) {
    const pies = pilotPies(CONV, piesIn);
    const L = CONV.lines, B = {}; CONV.buckets.forEach(b => B[b.key] = b);
    const all = []; pies.forEach(p => p.lines.forEach(l => all.push({ ...l, pie: p.pie, m: L[l.t] || null })));
    // ligne décidée mais pas encore achetée → portefeuille de même nature (actions / ETF), à 0 €
    const kind = {}, kindN = {};
    pies.forEach(p => {
      const c = {}; p.lines.forEach(l => { const m = L[l.t]; if (m && m.pie) c[m.pie] = (c[m.pie] || 0) + 1; });
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > (kindN[top[0]] || 0)) { kind[top[0]] = p.pie; kindN[top[0]] = top[1]; }
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
  function pieTargets(C, piesIn) {
    const out = {}, pies = piesIn.filter(p => C.all.some(l => l.pie === p.pie));
    pies.forEach(p => {
      const ls = C.all.filter(l => l.pie === p.pie), E = ls.reduce((s, l) => s + l.end, 0), N = ls.reduce((s, l) => s + l.value, 0);
      const w = ls.map(l => ({ l, t: Math.round(1000 * l.end / E) / 10, cur: N ? 100 * l.value / N : 0 }));
      const d = Math.round((100 - w.reduce((s, x) => s + x.t, 0)) * 10) / 10;
      if (d && w.length) { const top = w.reduce((a, x) => x.t > a.t ? x : a); top.t = Math.round((top.t + d) * 10) / 10; }
      out[p.pie] = w.sort((a, b) => b.t - a.t);
    });
    return out;
  }

  root.ConvCalc = { KEY, csvRows, parseStatement, loadPies, compute, pieTargets, isPiloted, pilotPies, overview, ROLES, guessRole };
})(typeof window !== "undefined" ? window : globalThis);
