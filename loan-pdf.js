/* ================================================================
 * loan-pdf.js – Export PDF (v2.3)  ▸ Smartflow Finance ▸ Juin 2025
 *
 * Nouveautés (v2.3) - 8 améliorations ciblées
 *   • ✅ #1: Résolution doublée (scale: 2) pour netteté impression
 *   • ✅ #3: Tableau amortissement détaillé supprimé (synthèse exec)
 *   • ✅ #4: KPI Table → 4 cartes 2×2 modernes et visuelles
 *   • ✅ #5: Structure pages optimisée (Hero + KPI + Savings + Timeline)
 *   • ✅ #6: En-têtes/pieds de page récurrents avec CSS print
 *   • ✅ #7: Numérotation automatique des pages
 *   • ✅ #8: CSS masquage tableau détaillé (réversible)
 *   • 🔗 v2.2 : Direct HTML PTZ from window.lastPtzSummaryHTML
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
  if (isDev) console.log('📄 [Loan‑PDF] Début génération v2.3 avec 8 améliorations…');

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
    if (isDev) console.log('✅ PDF v2.3 généré avec succès');
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
// 🔗 PTZ HTML DIRECT (NOUVEAU v2.2)
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
  if (isDev) console.log('🔍 Extraction Loan DOM v2.3 avec KPI cards optimisé');
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
    events: extractKeyEvents()
    // ✅ #3: Amortissement détaillé supprimé (plus dans l'extraction)
  };

  // ✅ CORRECTION: Calculer doublePeriod après la création de l'objet data
  data.doublePeriod = calcDoubleMonthlyPeriod(data);

  if (isDev && ptzHtml.exists) {
    console.log(`🔗 PTZ HTML récupéré via ${ptzHtml.source}`);
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
// TEMPLATE PDF ENHANCED v2.3
// ──────────────────────────────
async function buildLoanPDFTemplate(d){
  const wrap = document.createElement('div');
  wrap.className = 'pdf-container';
  
  // ✅ #5: Structure pages optimisée - synthèse executive
  wrap.appendChild(buildStyles());
  wrap.appendChild(buildHeader(d));
  wrap.appendChild(buildHero(d));
  wrap.appendChild(buildKPIBlockCards(d)); // ✅ #4: Nouveau format cards
  
  // Sections conditionnelles optimisées
  if (d.savings > 0) wrap.appendChild(buildSavingsBlock(d));
  if (d.events.length > 2) wrap.appendChild(buildTimeline(d));
  if (d.ptzEnabled) wrap.appendChild(buildPTZBlock(d));
  if (d.doublePeriod) wrap.appendChild(buildDoubleAlert(d));
  
  // 🔗 Intégration HTML PTZ direct (v2.2)
  if (d.ptzHtml && d.ptzHtml.exists) {
    wrap.appendChild(buildPTZHtmlFromWindow(d));
  }
  
  // Chart placeholder + Footer
  wrap.appendChild(buildChart(d));
  // ✅ #3: Tableau d'amortissement détaillé supprimé
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
// 1. Styles CSS améliorés v2.3
// ──────────────────────────────
function buildStyles(){
  const s=document.createElement('style');
  s.textContent=`
    body,html{margin:0;padding:0;box-sizing:border-box;}
    .pdf-container{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#374151;padding:15mm 12mm;background:#ffffff;line-height:1.4;}
    
    /* ✅ #6: En-têtes/pieds de page récurrents */
    @media print {
      .pdf-header{position:fixed;top:0;left:0;right:0;}
      .pdf-container{padding-top:32mm;}
      .page-num{position:fixed;bottom:12mm;right:14mm;font-size:11px;}
    }
    
    /* Header */
    .pdf-header{text-align:center;border-bottom:3px solid #059669;margin-bottom:10mm;padding-bottom:6mm;}
    .pdf-header h1{margin:0;font-size:24px;color:#1f2937;font-weight:700;}
    
    /* Hero section - BIG numbers */
    .hero-card{display:flex;flex-direction:column;align-items:center;justify-content:center;margin:8mm 0;padding:6mm;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border-radius:8px;border:2px solid #10b981;}
    .hero-main{font-size:32px;font-weight:700;color:#059669;margin:0;text-shadow:0 1px 2px rgba(0,0,0,0.1);}
    .hero-sub{font-size:16px;font-weight:600;color:#111827;margin:4px 0 0;}
    .hero-total{font-size:18px;color:#374151;font-weight:600;margin:6px 0 0;}
    
    /* ✅ #4: KPI Cards 2×2 (remplace table) */
    .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:6mm 0;}
    .kpi-card{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:6mm;text-align:center;}
    .kpi-card p{font-size:12px;color:#047857;margin:0;}
    .kpi-card h3{font-size:18px;color:#059669;margin:2mm 0 0;}
    
    /* ✅ #8: Masquage ancien tableau (réversible) */
    .pdf-table{display:none !important;}
    
    /* Savings highlight */
    .savings-block{background:linear-gradient(135deg,#fef3c7,#fef9c3);border:2px solid #f59e0b;padding:6mm;border-radius:8px;margin:6mm 0;text-align:center;}
    .savings-block h3{margin:0 0 4mm;color:#b45309;font-size:16px;}
    .savings-amount{font-size:24px;font-weight:700;color:#d97706;margin:2mm 0;}
    .savings-percent{font-size:14px;color:#92400e;font-weight:600;}
    
    /* Timeline */
    .timeline{margin:6mm 0;padding:4mm;background:#f8fafc;border-radius:6px;border-left:4px solid #3b82f6;}
    .timeline h3{margin:0 0 4mm;color:#1e40af;font-size:14px;}
    .timeline-event{display:flex;align-items:center;margin:2mm 0;font-size:11px;}
    .timeline-month{background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;margin-right:8px;font-weight:600;min-width:40px;text-align:center;}
    
    /* PTZ block enhanced v2.2 */
    .ptz-box{background:linear-gradient(135deg,#fef3c7,#fef9c3);border:2px solid #fcd34d;padding:6mm;border-radius:8px;margin:6mm 0;}
    .ptz-box h3{margin:0 0 3mm;font-size:16px;color:#b45309;}
    .ptz-html-direct{background:linear-gradient(135deg,#fef7ed,#fefbf3);border:2px solid #f97316;padding:4mm;border-radius:6px;margin:4mm 0;font-size:11px;}
    .ptz-html-direct h5{color:#ea580c;font-size:14px;margin:0 0 2mm;}
    .ptz-html-direct .text-amber-400{color:#f59e0b !important;}
    .ptz-html-direct .bg-amber-900{background-color:rgba(146,64,14,0.1) !important;}
    
    /* Alert box */
    .alert-box{background:#fef9c3;border:2px dashed #facc15;padding:4mm;border-radius:6px;margin:6mm 0;font-size:12px;color:#a16207;}
    
    /* Chart placeholder */
    .chart-placeholder{width:100%;height:120px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);border:1px solid #cbd5e1;border-radius:6px;margin:6mm 0;display:flex;align-items:center;justify-content:center;color:#64748b;font-style:italic;}
    
    /* Utilities */
    .small{font-size:11px;color:#6b7280;}
    .text-center{text-align:center;}
    .hard-page-break{page-break-after:always;break-after:page;}
    
    /* Print optimizations */
    @media print {
      .pdf-container{padding:10mm 8mm;}
      .hero-main{font-size:28px;}
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
    <div class="small">Généré le ${d.generatedAt.toLocaleDateString('fr-FR')} à ${d.generatedAt.toLocaleTimeString('fr-FR')} • Smartflow Finance v2.3</div>
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
// ✅ #4: KPI block → 2×2 cards (NOUVEAU)
// ──────────────────────────────
function buildKPIBlockCards(d){
  const wrap=document.createElement('div');
  wrap.className='kpi-grid';
  
  const card=(label,val)=>`
     <div class="kpi-card">
        <p>${label}</p>
        <h3>${val}</h3>
     </div>`;
     
  wrap.innerHTML=
     card('TAEG',d.taeg.toFixed(2)+' %')+
     card('Intérêts',fmt(d.totalInterest))+
     card('Frais',fmt(d.totalFees))+
     card('Ratio',d.ratioCost);
     
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
// 7. PTZ block amélioré v2.2
// ──────────────────────────────
function buildPTZBlock(d){
  const div=document.createElement('div');div.className='ptz-box';
  
  div.innerHTML=`
    <h3>🏡 Prêt à Taux Zéro (PTZ) v2.3</h3>
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
// 🔗 7bis. PTZ HTML Direct (v2.2)
// ──────────────────────────────
function buildPTZHtmlFromWindow(d){
  if (!d.ptzHtml || !d.ptzHtml.exists) return document.createElement('div');
  
  const wrapper = document.createElement('div');
  wrapper.className = 'ptz-html-direct';
  
  // Parse et nettoie le HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = d.ptzHtml.html;
  
  // Ajoute header pour clarifier la source
  wrapper.innerHTML = `
    <h5>📋 Résumé PTZ détaillé (source: ${d.ptzHtml.source})</h5>
    ${tempDiv.innerHTML}
  `;
  
  return wrapper;
}

// ──────────────────────────────
// 8. Alerte double mensualité
// ──────────────────────────────
function buildDoubleAlert(d){
  const {start,end}=d.doublePeriod;
  const div=document.createElement('div');div.className='alert-box';
  const months = end - start + 1;
  
  div.innerHTML=`
    <strong>⚠️ Attention : Période de double mensualité</strong><br>
    Du mois ${start} au mois ${end} (${months} mois), vous paierez les deux prêts simultanément.<br>
    <strong>Impact mensuel :</strong> +${fmt(d.ptzMonthly)} • Prévoyez cette charge dans votre budget.
  `;
  return div;
}

// ──────────────────────────────
// 9. Graphique capital/intérêts
// ──────────────────────────────
function buildChart(d){
  // Placeholder optimisé pour synthèse executive
  const div=document.createElement('div');div.className='chart-placeholder';
  div.innerHTML = `
    <div style="text-align:center;">
      <strong>📈 Évolution Capital / Intérêts</strong><br>
      <small>Graphique disponible dans l'interface web • Lien QR code possible</small>
    </div>
  `;
  return div;
}

// ──────────────────────────────
// 11. Footer amélioré v2.3
// ──────────────────────────────
function buildFooter(d){
  const f=document.createElement('div');
  f.style.cssText='margin-top:10mm;border-top:2px solid #e5e7eb;padding-top:4mm;font-size:11px;color:#6b7280;text-align:center;';
  f.innerHTML=`
    <div style="margin-bottom:2mm;"><strong>⚠️ Avertissement :</strong> Cette synthèse est fournie à titre informatif uniquement et ne constitue pas un conseil financier personnalisé.</div>
    <div>Pour toute décision d'investissement, consultez un conseiller financier qualifié.</div>
    <div style="margin-top:4mm;font-weight:600;">© Smartflow Finance Intelligence ${d.generatedAt.getFullYear()} • Plateforme d'analyse financière v2.3</div>
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
  btn.innerHTML='<i class="fas fa-spinner fa-spin mr-2"></i>Génération PDF v2.3…';
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
  btn.innerHTML='<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF v2.3';
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
    btn.title='Télécharger la synthèse PDF v2.3 (résolution x2, KPI cards)';
    if(isDev) console.log('✅ Bouton PDF v2.3 activé avec 8 améliorations');
  }
}

// ──────────────────────────────
// AUTO‑INIT AU CHARGEMENT
// ──────────────────────────────
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    createLoanExportButton();
    if(isDev) console.log('🚀 Loan PDF v2.3 initialisé avec 8 améliorations');
  });
}else{
  createLoanExportButton();
  if(isDev) console.log('🚀 Loan PDF v2.3 ready');
}