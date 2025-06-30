/* ================================================================
 * loan-pdf.js – Export PDF (v2.6.0)  ▸ Smartflow Finance ▸ Juin 2025
 *
 * Nouveautés (v2.6.0) - Refonte esthétique complète
 *   • 🎨 Design tokens CSS pour cohérence couleurs
 *   • ✨ Grille KPI 3×2 pour meilleur équilibre visuel
 *   • 📐 Hero centré + coins arrondis + effets hover
 *   • 🪶 Header allégé + marges harmonisées
 *   • 🔢 Typographie tabulaire + box-shadows modernes
 * ================================================================ */

// ──────────────────────────────
// ENV & CONFIG
// ──────────────────────────────
const isDev = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
              location.hostname === 'localhost' ||
              location.hostname === '127.0.0.1';

// ✅ #1: RÉSOLUTION DOUBLÉE pour netteté
const PDF_CONFIG = {
  margin: [0, 0, 0, 0],
  image:  { type: 'jpeg', quality: 0.78 },
  html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'], after: '.hard-page-break', avoid: '.kpi-grid, .savings-block' }
};

// ──────────────────────────────
// EXPORT PRINCIPAL
// ──────────────────────────────
export async function exportLoanToPDF(loanData = null, options = {}) {
  if (isDev) console.log('📄 [Loan‑PDF] Début génération v2.6.0 avec nouvelle esthétique…');

  if (loanData instanceof Event) loanData = null; // sécurité

  let btn, uiState;
  try {
    await loadHtml2PdfLib();
    btn = document.getElementById('export-loan-pdf');

    await ensureLoanSimulationComplete();
    const data = loanData || extractLoanDataFromDOM();
    if (!validateLoanData(data)) throw new Error('Données insuffisantes');

    uiState = showLoadingState(btn);
    const tpl    = await buildLoanPDFTemplate(data);
    const finalOpts = { ...PDF_CONFIG, filename: generatePDFFilename(data.generatedAt, 'Pret'), ...options };

    // reset scroll
    const y = window.scrollY;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(r));
    try {
      await html2pdf().set(finalOpts).from(tpl).save();
    } finally {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    }
    showSuccessState(btn, uiState);
    if (isDev) console.log('✅ PDF v2.6.0 généré - nouvelle esthétique active');
  } catch (err) {
    console.error('❌ [Loan‑PDF]', err);
    showErrorState(btn, err.message);
  }
}

// ──────────────────────────────
// SYNCHRONISATION CALCUL
// ──────────────────────────────
async function ensureLoanSimulationComplete() {
  if (typeof window.calculateLoan === 'function') {
    if (isDev) console.log('🔄 Re‑calcul du prêt…');
    try { await window.calculateLoan(); } catch(e){ console.warn('[Loan‑PDF] calc error', e);}  }
  return new Promise(res => setTimeout(res, 400));
}

// ──────────────────────────────
// 🔗 PTZ HTML DIRECT (v2.2)
// ──────────────────────────────
function getPtzHtmlFromWindow() {
  // Récupère le HTML PTZ stocké par updatePtzSummary
  if (window.lastPtzSummaryHTML) {
    return {
      exists: true,
      html: window.lastPtzSummaryHTML,
      source: 'window.lastPtzSummaryHTML'
    };
  }
  
  // Fallback: cherche dans le DOM
  const ptzSummary = document.getElementById('ptz-summary');
  if (ptzSummary) {
    return {
      exists: true,
      html: ptzSummary.outerHTML,
      source: 'DOM fallback'
    };
  }
  
  return { exists: false, html: '', source: 'none' };
}

// 🔧 #15: Fix tableau Comparaison tronqué
function getComparisonHtmlFromDOM () {
  const el = document.getElementById('comparison-table');
  if (!el) return '';

  // le tableau réel est dans el.firstElementChild
  const clone = el.cloneNode(true);
  clone.classList.remove('overflow-y-auto', 'max-h-80', 'hidden');
  clone.style.maxHeight = 'none';
  clone.style.overflow  = 'visible';

  return clone.outerHTML;
}

// 🔧 #19: Fix tableau Équivalence - ciblage <table> + nettoyage complet + patch #sensitivity-container
function getEquivalenceHtmlFromDOM () {
  const wrapper = document.querySelector('#equivalence-container, [data-table="equivalence"], #equivalence-table, #sensitivity-container');
  if(!wrapper) return '';

  const target = wrapper.querySelector('table') || wrapper; // on vise d'abord la <table>
  const clone  = target.cloneNode(true);

  /* on purge tous les overflow/hauteur restants (y compris sur des enfants) */
  clone.querySelectorAll('*').forEach(n=>{
     n.classList.forEach(c=>{
        if(c.startsWith('overflow-')||c.startsWith('max-h-')) n.classList.remove(c);
     });
     n.style.overflow='visible';
     n.style.maxHeight='none';
  });

  // ── NEW : supprime les display:none restants ──────────────────────
  clone.style.display = '';            // enlève display:none sur le <table>
  clone.removeAttribute('hidden');     // enlève l'attribut hidden éventuel
  clone.querySelectorAll('[style*="display:none"]').forEach(n=>{
      n.style.display='';
  });

  // 🔧 #20: Forcer largeur table pour éviter réduction jsPDF
  clone.style.width = '100%';
  clone.style.tableLayout = 'fixed';

  return clone.outerHTML;
}

function extractPtzDetailsFromDOM() {
  const g   = id => document.getElementById(id);
  const val = id => {
    const el = g(id);
    const v  = el ? (el.value || el.textContent || '0') : '0';
    return parseFloat(v.replace(/[^\d.-]/g, '')) || 0;
  };

  const amount      = val('ptz-amount');           // capital PTZ
  const duration    = val('ptz-duration-slider');  // durée PTZ (années)
  const differeMois = val('ptz-differe-slider');   // différé éventuel

  return {
    enabled     : g('enable-ptz')?.checked ?? false,
    amount,
    duration,
    differeMois,
    /** Mensualité PTZ : capital / (durée × 12) */
    monthly     : duration ? amount / (duration * 12) : 0
  };
}

// ──────────────────────────────
// EXTRACTION DATAS & HELPERS
// ──────────────────────────────
function extractLoanDataFromDOM() {
  if (isDev) console.log('🔍 Extraction Loan DOM v2.6.0 avec nouvelle esthétique');
  const toNumber = v => {
    if (v === '' || v === undefined || v === null) return 0;
    if (typeof v === 'number') return Number.isFinite(v)?v:0;
    v = String(v).replace(',', '.').replace(/[\s\u00A0€]/g, '');
    const n = parseFloat(v); return Number.isFinite(n)?n:0;
  };
  const g = id => document.getElementById(id);
  const txt = (id,def='') => (g(id)?.textContent.trim() ?? def);
  const val = id => toNumber(g(id)?.value ?? 0);

  const amount  = val('loan-amount');
  const ptzAmt  = val('ptz-amount');
  const totalCost = toNumber(txt('total-cost','0'));
  const totalInterest = toNumber(txt('total-interest','0'));

  // ✅ NOUVELLES EXTRACTIONS v2.5.3
  const mensRenego  = toNumber(
        document.getElementById('monthly-payment-renego')?.textContent || 0);
  const mensTotalPTZ = toNumber(
        document.querySelector('#monthly-payment-combined .result-value')?.textContent || 0);
  const coutGlobal  = toNumber(
        document.getElementById('cout-global')?.textContent || 0);

  // 🔗 Extraction PTZ HTML direct
  const ptzDetails = extractPtzDetailsFromDOM();
  const ptzHtml = getPtzHtmlFromWindow();

  const data = {
    generatedAt: new Date(),
    // Inputs & résultats de synthèse
    amount,
    rate: val('interest-rate-slider'),
    durationYears: val('loan-duration-slider'),
    insuranceRate: val('insurance-rate-slider'),
    monthly: toNumber(txt('monthly-payment','0')),
    totalCost,
    totalInterest,
    taeg: toNumber(txt('taeg','0')),
    totalFees: toNumber(txt('total-fees','0')),
    ratioCost: amount>0? (totalCost/amount).toFixed(3) : '0.000',
    // ✅ Nouvelles valeurs v2.5.3
    mensRenego,
    mensTotalPTZ,
    coutGlobal,
    // PTZ v2.2 - HTML direct
    ptzEnabled: ptzDetails.enabled,
    ptzAmount: ptzDetails.amount,
    ptzDuration: ptzDetails.duration,
    ptzDiffereMois: ptzDetails.differeMois,
    ptzMonthly: ptzDetails.monthly,
    ptzHtml: ptzHtml,
    // Calculs d'économies
    originalCost: calculateOriginalCost(),
    savings: calculateSavings(),
    // Événements clés
    events: extractKeyEvents(),
    // 🔧 #15-19: Import tableaux d'analyse fixes
    comparisonHtml: getComparisonHtmlFromDOM(),
    equivalenceHtml: getEquivalenceHtmlFromDOM()
  };

  // ✅ CORRECTION: Calculer doublePeriod après la création de l'objet data
  data.doublePeriod = calcDoubleMonthlyPeriod(data);

  if (isDev) {
    if (ptzHtml.exists) console.log(`🔗 PTZ HTML récupéré via ${ptzHtml.source}`);
    if (data.comparisonHtml) console.log('🔧 Tableau Comparaison extrait et nettoyé');
    if (data.equivalenceHtml) console.log('🔧 Tableau Équivalence extrait et fixé v2.5.2');
    console.log('✅ Nouvelles données v2.6.0:', { mensRenego: data.mensRenego, mensTotalPTZ: data.mensTotalPTZ, coutGlobal: data.coutGlobal });
  }

  return data;
}

// ✅ CORRECTION: Fonction modifiée pour accepter data en paramètre
function calcDoubleMonthlyPeriod(data) {
  const endPTZ  = data.ptzEnabled ? data.ptzDuration : 0;
  const endMain = data.durationYears;
  if (!endPTZ || endPTZ === endMain) return null;
  if (endPTZ > endMain)   return {start: endMain*12+1, end: endPTZ*12};
  if (endMain > endPTZ)   return {start: endPTZ*12+1, end: endMain*12};
  return null;
}

function calculateOriginalCost() {
  // Essaie de récupérer le coût sans optimisations depuis le comparateur
  const withoutOptimElement = document.querySelector('[data-scenario="without-optimization"] .total-cost');
  if (withoutOptimElement) {
    return parseFloat(withoutOptimElement.textContent.replace(/[^\d.-]/g, '')) || 0;
  }
  return 0;
}

function calculateSavings() {
  const originalElement = document.querySelector('[data-scenario="without-optimization"] .total-cost');
  const optimizedElement = document.querySelector('[data-scenario="with-optimization"] .total-cost');
  
  if (originalElement && optimizedElement) {
    const original = parseFloat(originalElement.textContent.replace(/[^\d.-]/g, '')) || 0;
    const optimized = parseFloat(optimizedElement.textContent.replace(/[^\d.-]/g, '')) || 0;
    return Math.max(0, original - optimized);
  }
  return 0;
}

function extractKeyEvents() {
  const events = [{month: 0, label: "💰 Déblocage des fonds", type: "start"}];
  
  // PTZ start (avec différé)
  const ptzDetails = extractPtzDetailsFromDOM();
  if (ptzDetails.enabled) {
    const ptzStartMonth = ptzDetails.differeMois || 0;
    events.push({
      month: ptzStartMonth, 
      label: `🏡 Début PTZ${ptzStartMonth > 0 ? ' (après différé)' : ''}`, 
      type: "ptz-start"
    });
  }
  
  // Renégociation
  const renegoMonth = document.getElementById('renegotiation-month-slider')?.value;
  const renegoEnabled = document.getElementById('apply-renegotiation')?.checked;
  if (renegoEnabled && renegoMonth) {
    events.push({
      month: parseInt(renegoMonth), 
      label: `📊 Renégociation (nouveau taux)`, 
      type: "renegotiation"
    });
  }

  // Remboursements anticipés
  document.querySelectorAll('.repayment-item').forEach((item, index) => {
    const monthEl = item.querySelector('[id*="month"]');
    const amountEl = item.querySelector('[id*="amount"]');
    if (monthEl && amountEl) {
      const month = parseInt(monthEl.textContent) || 0;
      const amount = parseFloat(amountEl.textContent.replace(/[^\d.-]/g, '')) || 0;
      if (month > 0 && amount > 0) {
        events.push({
          month, 
          label: `💸 Remb. anticipé ${fmt(amount)}`, 
          type: "early-repayment"
        });
      }
    }
  });

  // Fin de prêt
  const duration = document.getElementById('loan-duration-slider')?.value;
  if (duration) {
    events.push({
      month: parseInt(duration) * 12, 
      label: "🏁 Fin de prêt", 
      type: "end"
    });
  }

  return events.sort((a, b) => a.month - b.month);
}

// ──────────────────────────────
// TEMPLATE PDF ENHANCED v2.6.0
// ──────────────────────────────
async function buildLoanPDFTemplate(d){
  const wrap = document.createElement('div');
  wrap.className = 'pdf-container';
  
  // ✅ Structure pages optimisée - synthèse executive
  wrap.appendChild(buildStyles());
  wrap.appendChild(buildHeader(d));
  wrap.appendChild(buildHero(d));
  wrap.appendChild(buildKPIBlockCards(d)); // ✅ #4: Nouveau format cards v2.6.0
  
  // Sections conditionnelles optimisées
  if (d.savings > 0) wrap.appendChild(buildSavingsBlock(d));
  if (d.events.length > 2) wrap.appendChild(buildTimeline(d));
  if (d.ptzEnabled) wrap.appendChild(buildPTZBlock(d));
  
  // 🔧 #15-19: Tableaux d'analyse fixes
  if (d.comparisonHtml) wrap.appendChild(buildComparisonBlock(d));
  if (d.equivalenceHtml) wrap.appendChild(buildEquivalenceBlock(d));
  
  wrap.appendChild(buildFooter(d));
  
  // ✅ #7: Numérotation automatique des pages
  setTimeout(() => {
    [...document.querySelectorAll('.page-num')].forEach((el, i) => {
      el.textContent = `Page ${i + 1}`;
    });
  }, 100);
  
  return wrap;
}

// ──────────────────────────────
// 1. Styles CSS v2.6.0 - Refonte esthétique complète
// ──────────────────────────────
function buildStyles(){
  const s=document.createElement('style');
  s.textContent=`
    /* 🎨 Design tokens v2.6.0 */
    :root {
      --c-primary: #059669;
      --c-secondary: #2563eb;
      --c-accent: #f59e0b;
      --c-bg: #f8fafc;
      --c-surface: #ffffff;
      --shadow-sm: 0 2px 4px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 14px rgba(0,0,0,0.06);
    }
    
    body,html{margin:0;padding:0;box-sizing:border-box;}
    .pdf-container{
      font-family:'Segoe UI',Arial,sans-serif;
      font-size:12px;
      color:#374151;
      padding:15mm 12mm;
      background:var(--c-surface);
      line-height:1.4;
      font-variant-numeric:tabular-nums; /* 🔢 Police tabulaire pour chiffres */
    }
    
    /* ✅ #6: En-têtes/pieds de page récurrents */
    @media print {
      .pdf-header{position:fixed;top:0;left:0;right:0;}
      .pdf-container{padding-top:32mm;}
      .page-num{position:fixed;bottom:12mm;right:14mm;font-size:11px;}
    }
    
    /* 🪶 Header allégé v2.6.0 */
    .pdf-header{
      text-align:center;
      border-bottom:1px solid var(--c-primary); /* 🪶 Plus léger */
      margin-bottom:8mm;
      padding-bottom:5mm;
    }
    .pdf-header h1{margin:0;font-size:24px;color:#1f2937;font-weight:700;}
    
    /* 📐 Hero section centré + coins arrondis v2.6.0 */
    .hero-card{
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      text-align:center; /* 📐 Centrage parfait */
      margin:6mm 0; /* 📏 Marge harmonisée */
      padding:8mm;
      background:linear-gradient(135deg,#f0fdf4,#ecfdf5);
      border-radius:12px; /* 📐 Coins plus arrondis */
      border:2px solid var(--c-primary);
      box-shadow:var(--shadow-sm); /* 🌟 Profondeur subtile */
    }
    .hero-main{font-size:28px;font-weight:700;color:var(--c-primary);margin:0;text-shadow:0 1px 2px rgba(0,0,0,0.1);}
    .hero-sub{font-size:16px;font-weight:600;color:#111827;margin:4px 0 0;}
    .hero-total{font-size:18px;color:#374151;font-weight:600;margin:6px 0 0;}
    
    /* ✨ KPI Cards 3×2 grid v2.6.0 */
    .kpi-grid{
      display:grid;
      grid-template-columns:repeat(3,1fr); /* ✨ 3 colonnes */
      gap:3mm; /* Gap optimisé */
      margin:6mm 0; /* 📏 Marge harmonisée */
    }
    .kpi-card{
      background:var(--c-bg);
      border:1px solid #a7f3d0;
      border-radius:8px;
      padding:5mm;
      text-align:center;
      transition:all 0.2s ease;
      box-shadow:var(--shadow-sm); /* 🌟 Profondeur */
    }
    .kpi-card p{font-size:12px;color:#047857;margin:0;}
    .kpi-card h3{font-size:16px;color:var(--c-primary);margin:3mm 0 0;font-weight:600;}
    
    /* ✨ Effets hover pour version écran */
    @media screen {
      .kpi-card:hover{
        transform:translateY(-2px);
        box-shadow:var(--shadow-md);
        border-color:var(--c-primary);
      }
    }
    
    /* ✅ #8: Masquage ancien tableau (réversible) */
    .pdf-table{display:none !important;}
    
    /* 🔧 #18: Styles tableaux v2.5.2 - overflow complet neutralisé */
    .analysis-block{
      margin:6mm 0; /* 📏 Marge harmonisée */
      padding:5mm;
      border:1px solid #cbd5e1;
      border-radius:8px;
      background:var(--c-bg);
      font-size:11.5px;
      overflow:initial !important;
      page-break-inside:auto;
      break-inside:auto;
      box-shadow:var(--shadow-sm); /* 🌟 Profondeur */
    }
    
    .analysis-block tr{
      page-break-inside:avoid;
      break-inside:avoid;
    }
    
    .analysis-title{
      margin:0 0 4mm;
      font-size:14px;
      color:var(--c-secondary);
      font-weight:600;
      border-bottom:1px solid #e2e8f0;
      padding-bottom:2mm;
    }
    .analysis-block table{
      width:100%;
      border-collapse:collapse;
      font-size:11px;
      page-break-inside:auto;
      table-layout:fixed;
    }
    .analysis-block th,.analysis-block td{border:1px solid #e5e7eb;padding:4px;text-align:right;}
    .analysis-block th{text-align:center;background:#eef2ff;color:#374151;}
    
    /* Savings highlight */
    .savings-block{
      background:linear-gradient(135deg,#fef3c7,#fef9c3);
      border:2px solid var(--c-accent);
      padding:6mm;
      border-radius:8px;
      margin:6mm 0; /* 📏 Marge harmonisée */
      text-align:center;
      box-shadow:var(--shadow-sm); /* 🌟 Profondeur */
    }
    .savings-block h3{margin:0 0 4mm;color:#b45309;font-size:16px;}
    .savings-amount{font-size:24px;font-weight:700;color:#d97706;margin:2mm 0;}
    .savings-percent{font-size:14px;color:#92400e;font-weight:600;}
    
    /* Timeline */
    .timeline{
      margin:6mm 0; /* 📏 Marge harmonisée */
      padding:5mm;
      background:var(--c-bg);
      border-radius:8px;
      border-left:4px solid var(--c-secondary);
      box-shadow:var(--shadow-sm); /* 🌟 Profondeur */
    }
    .timeline h3{margin:0 0 4mm;color:var(--c-secondary);font-size:14px;}
    .timeline-event{display:flex;align-items:center;margin:2mm 0;font-size:11px;}
    .timeline-month{background:#dbeafe;color:var(--c-secondary);padding:2px 6px;border-radius:4px;margin-right:8px;font-weight:600;min-width:40px;text-align:center;}
    
    /* PTZ block enhanced */
    .ptz-box{
      background:linear-gradient(135deg,#fef3c7,#fef9c3);
      border:2px solid #fcd34d;
      padding:6mm;
      border-radius:8px;
      margin:6mm 0; /* 📏 Marge harmonisée */
      box-shadow:var(--shadow-sm); /* 🌟 Profondeur */
    }
    .ptz-box h3{margin:0 0 3mm;font-size:16px;color:#b45309;}
    
    /* Utilities */
    .small{font-size:11px;color:#6b7280;}
    .text-center{text-align:center;}
    .hard-page-break{page-break-after:always;break-after:page;}
    
    /* Print optimizations */
    @media print {
      .pdf-container{padding:8mm 6mm;}
      .hero-main{font-size:26px;}
      .kpi-grid{gap:2mm;}
    }
  `;
  return s;
}

// ──────────────────────────────
// 2. Header amélioré
// ──────────────────────────────
function buildHeader(d){
  const h=document.createElement('div');h.className='pdf-header';
  h.innerHTML=`
    <h1>📊 Synthèse de prêt immobilier</h1>
    <div class="small">Généré le ${d.generatedAt.toLocaleDateString('fr-FR')} à ${d.generatedAt.toLocaleTimeString('fr-FR')} • Smartflow Finance v2.6.0</div>
    <div class="page-num"></div>
  `;
  return h;
}

// ──────────────────────────────
// 3. Hero section - BIG impact
// ──────────────────────────────
function buildHero(d){
  const hero=document.createElement('div');hero.className='hero-card';
  hero.innerHTML=`
    <p class="hero-main">${fmt(d.monthly)}</p>
    <p class="hero-sub">Mensualité globale</p>
    <p class="hero-total">Coût total : ${fmt(d.totalCost)}</p>
  `;
  return hero;
}

// ──────────────────────────────
// ✅ #4: KPI block → 3×2 cards v2.6.0
// ──────────────────────────────
function buildKPIBlockCards(d){
  const wrap=document.createElement('div');
  wrap.className='kpi-grid';
  
  // helper rapide
  const card = (label, val) => `
      <div class="kpi-card">
          <p>${label}</p>
          <h3>${val}</h3>
      </div>`;

  wrap.innerHTML =
      card('Mensualité après renégociation', fmt(d.mensRenego)) +
      card('Mensualité totale après démarrage PTZ', fmt(d.mensTotalPTZ)) +
      card('TAEG', d.taeg.toFixed(2) + ' %') +
      card('Intérêts', fmt(d.totalInterest)) +
      card('Frais', fmt(d.totalFees)) +
      card('Coût global (tout compris)', fmt(d.coutGlobal || d.totalCost));

  return wrap;
}

// ──────────────────────────────
// 5. Économies réalisées
// ──────────────────────────────
function buildSavingsBlock(d){
  const div=document.createElement('div');div.className='savings-block';
  const savingsPercent = d.originalCost > 0 ? (d.savings / d.originalCost * 100).toFixed(1) : 0;
  
  div.innerHTML=`
    <h3>💰 Économies réalisées</h3>
    <div class="savings-amount">${fmt(d.savings)}</div>
    <div class="savings-percent">${savingsPercent}% du coût initial économisé</div>
    <div class="small" style="margin-top:2mm;">Grâce aux optimisations (renégociation, remboursements anticipés)</div>
  `;
  return div;
}

// ──────────────────────────────
// 6. Timeline des événements
// ──────────────────────────────
function buildTimeline(d){
  const div=document.createElement('div');div.className='timeline';
  div.innerHTML='<h3>⏱️ Calendrier des événements clés</h3>';
  
  d.events.forEach(event => {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'timeline-event';
    
    const monthLabel = event.month === 0 ? 'M0' : `M${event.month}`;
    eventDiv.innerHTML = `
      <span class="timeline-month">${monthLabel}</span>
      <span>${event.label}</span>
    `;
    div.appendChild(eventDiv);
  });
  
  return div;
}

// ──────────────────────────────
// 7. PTZ block amélioré
// ──────────────────────────────
function buildPTZBlock(d){
  const div=document.createElement('div');div.className='ptz-box';
  
  div.innerHTML=`
    <h3>🏡 Prêt à Taux Zéro (PTZ)</h3>
    <p style="margin:0;font-size:13px;">
      <strong>Capital :</strong> ${fmt(d.ptzAmount)} • 
      <strong>Durée :</strong> ${d.ptzDuration} ans • 
      <strong>Mensualité :</strong> ${fmt(d.ptzMonthly)}
      ${d.ptzDiffereMois > 0 ? `<br><strong>Différé :</strong> ${d.ptzDiffereMois} mois` : ''}
    </p>
    <div class="small" style="margin-top:2mm;">
      Prêt complémentaire sans intérêts pour l'acquisition de votre résidence principale
      ${d.ptzDiffereMois > 0 ? ` - Première échéance au mois ${d.ptzDiffereMois + 1}` : ''}
    </div>
  `;
  return div;
}

// ──────────────────────────────
// 🔧 #15-19: Builders tableaux d'analyse fixes
// ──────────────────────────────
function buildComparisonBlock(d){
  if(!d.comparisonHtml) return document.createElement('div');
  const wrap=document.createElement('div');
  wrap.className='analysis-block';

  // ── NEW : supprime les overflows hérités du conteneur ─────────────
  wrap.style.overflow  = 'initial';
  wrap.style.maxHeight = 'none';

  wrap.innerHTML=`<h3 class="analysis-title">📊 Comparaison des scénarios</h3>`+d.comparisonHtml;
  return wrap;
}

function buildEquivalenceBlock(d){
  if(!d.equivalenceHtml) return document.createElement('div');
  const wrap=document.createElement('div');
  wrap.className='analysis-block';
  wrap.innerHTML=`<h3 class="analysis-title">↔️ Équivalence baisse de taux / remb. anticipé</h3>`+d.equivalenceHtml;
  return wrap;
}

// ──────────────────────────────
// 11. Footer amélioré v2.6.0
// ──────────────────────────────
function buildFooter(d){
  const f=document.createElement('div');
  f.style.cssText='margin-top:10mm;border-top:2px solid #e5e7eb;padding-top:4mm;font-size:11px;color:#6b7280;text-align:center;';
  f.innerHTML=`
    <div style="margin-bottom:2mm;"><strong>⚠️ Avertissement :</strong> Cette synthèse est fournie à titre informatif uniquement et ne constitue pas un conseil financier personnalisé.</div>
    <div>Pour toute décision d'investissement, consultez un conseiller financier qualifié.</div>
    <div style="margin-top:4mm;font-weight:600;">© Smartflow Finance Intelligence ${d.generatedAt.getFullYear()} • Plateforme d'analyse financière v2.6.0</div>
    <div class="page-num"></div>
  `;
  return f;
}

// ──────────────────────────────
// UTILS
// ──────────────────────────────
function fmt(n){
  return new Intl.NumberFormat('fr-FR',{
    style:'currency',
    currency:'EUR',
    minimumFractionDigits:0,
    maximumFractionDigits:0
  }).format(n||0);
} 

function validateLoanData(d){
  return d && d.amount>0 && d.monthly>0;
}

function generatePDFFilename(date=new Date(),prefix='Smartflow'){
  const d=date.toISOString().split('T')[0];
  const t=date.toTimeString().split(' ')[0].replace(/:/g,'');
  return `${prefix}-Pret-${d}-${t}.pdf`;
}

// UI Helpers
function showLoadingState(btn){
  if(!btn) return null;
  const originalState={html:btn.innerHTML,disabled:btn.disabled};
  btn.innerHTML='<i class="fas fa-spinner fa-spin mr-2"></i>Génération PDF v2.6.0…';
  btn.disabled=true;
  return originalState;
}

function showSuccessState(btn,originalState){
  if(!btn)return;
  btn.innerHTML='<i class="fas fa-check mr-2"></i>PDF téléchargé !';
  setTimeout(()=>{
    btn.innerHTML=originalState?.html||'<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF';
    btn.disabled=originalState?.disabled||false;
  },2000);
} 

function showErrorState(btn,message){
  console.error('PDF Error:', message);
  if(btn){
    btn.innerHTML='<i class="fas fa-exclamation-triangle mr-2"></i>Erreur PDF';
    setTimeout(() => {
      btn.innerHTML='<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF';
      btn.disabled=false;
    }, 3000);
  }
  alert('Erreur lors de la génération du PDF : '+message);
}

// Charger html2pdf si nécessaire
async function loadHtml2PdfLib(){
  if(typeof html2pdf==='undefined'){
    if(isDev) console.log('[Loan‑PDF] Chargement html2pdf…');
    try {
      await import('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
      let attempts=0;
      while(typeof html2pdf==='undefined'&&attempts<10){
        await new Promise(resolve=>setTimeout(resolve,200));
        attempts++;
      }
      if(typeof html2pdf==='undefined') throw new Error('html2pdf library failed to load');
    } catch (error) {
      throw new Error('Impossible de charger la librairie PDF : ' + error.message);
    }
  }
}

// ──────────────────────────────
// INTÉGRATION UI
// ──────────────────────────────
export function createLoanExportButton(){
  let btn=document.getElementById('export-loan-pdf');
  if(btn) return btn;
  
  const target=document.querySelector('#loan-simulator .bg-blue-900') || 
               document.querySelector('#loan-results') ||
               document.querySelector('.loan-results-container');
  if(!target) return null;
  
  btn=document.createElement('button');
  btn.id='export-loan-pdf';
  btn.className='w-full mt-4 py-3 px-4 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center justify-center opacity-50 cursor-not-allowed';
  btn.disabled=true;
  btn.innerHTML='<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF v2.6.0';
  btn.title='Calculez le prêt pour activer l\'export PDF';
  btn.addEventListener('click',()=>exportLoanToPDF());
  
  target.appendChild(btn);
  return btn;
}

export function activateLoanExportButton(){
  const btn=document.getElementById('export-loan-pdf');
  if(btn){
    btn.disabled=false;
    btn.classList.remove('opacity-50','cursor-not-allowed');
    btn.title='Télécharger la synthèse PDF v2.6.0 avec nouvelle esthétique';
    if(isDev) console.log('✅ Bouton PDF v2.6.0 activé - nouvelle esthétique prête');
  }
}

// ──────────────────────────────
// AUTO‑INIT AU CHARGEMENT
// ──────────────────────────────
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    createLoanExportButton();
    if(isDev) console.log('🚀 Loan PDF v2.6.0 initialisé - nouvelle esthétique intégrée');
  });
}else{
  createLoanExportButton();
  if(isDev) console.log('🚀 Loan PDF v2.6.0 ready');
}