/* ================================================================
 * loan-pdf.js – Module d'export PDF pour le simulateur de prêt
 * Smartflow Finance Intelligence Platform ▸ Juin 2025
 *
 * Inspiré de budget‑pdf.js, avec :
 *   • extraction DOM spécifique au Loan Simulator
 *   • résumé financier + encadré PTZ
 *   • tableau d'amortissement (≤ 120 lignes)
 *   • styles embarqués, marges optimisées, aucune capture graphique
 *   • reset/restaure scroll pour html2canvas
 * ================================================================ */

// ──────────────────────────────
// ENV & CONFIG
// ──────────────────────────────
const isDev = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
              location.hostname === 'localhost' ||
              location.hostname === '127.0.0.1';

const PDF_CONFIG = {
  margin: [0, 0, 0, 0],
  image:  { type: 'jpeg', quality: 0.82 },
  html2canvas: { scale: 1.4, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'], after: '.hard-page-break' }
};

// ──────────────────────────────
// EXPORT PRINCIPAL
// ──────────────────────────────
export async function exportLoanToPDF(loanData = null, options = {}) {
  if (isDev) console.log('📄 [Loan‑PDF] Début génération…');

  // Protection contre event
  if (loanData instanceof Event) loanData = null;

  let btn, uiState;
  try {
    await loadHtml2PdfLib();
    btn = document.getElementById('export-loan-pdf');

    await ensureLoanSimulationComplete();
    const data = loanData || extractLoanDataFromDOM();
    if (!validateLoanData(data)) throw new Error('Données insuffisantes');

    uiState = showLoadingState(btn);
    const tpl    = await buildLoanPDFTemplate(data);
    const finalOpts = { ...PDF_CONFIG, filename: generatePDFFilename(data.generatedAt, 'Prêt'), ...options };

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
    if (isDev) console.log('✅ PDF prêt');
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
// EXTRACTION DATAS
// ──────────────────────────────
function extractLoanDataFromDOM() {
  if (isDev) console.log('🔍 Extraction Loan DOM');
  const toNumber = v => {
    if (v === '' || v === undefined || v === null) return 0;
    if (typeof v === 'number') return Number.isFinite(v)?v:0;
    v = String(v).replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(v); return Number.isFinite(n)?n:0;
  };
  const g = id => document.getElementById(id);
  const txt = (id,def='') => (g(id)?.textContent.trim() ?? def);
  const val = id => toNumber(g(id)?.value ?? 0);

  const data = {
    generatedAt: new Date(),
    // Inputs
    amount: val('loan-amount'),
    rate:   val('interest-rate-slider'),
    durationYears: val('loan-duration-slider'),
    insuranceRate: val('insurance-rate-slider'),
    // Résultats (déjà formatés en € dans le DOM → re‑parse)
    monthly: toNumber(txt('monthly-payment','0')), // global
    totalCost: toNumber(txt('total-cost','0')),
    totalInterest: toNumber(txt('total-interest','0')),
    taeg: toNumber(txt('taeg','0')),
    totalFees: toNumber(txt('total-fees','0')),
    // PTZ
    ptzEnabled: g('enable-ptz')?.checked ?? false,
    ptzAmount: val('ptz-amount'),
    ptzDuration: val('ptz-duration-slider'),
    // Tableau amortissement (limité 120 lignes)
    amortization: grabTableRows('#amortization-table', 120)
  };
  return data;
}

function grabTableRows(selector, maxRows=120) {
  const rows = [];
  document.querySelectorAll(`${selector} tr`).forEach((tr,i)=>{
    if(i>=maxRows) return;
    const cells=[...tr.children].map(td=>td.textContent.trim());
    if(cells.length>=6) rows.push(cells);
  });
  return rows;
}

// ──────────────────────────────
// TEMPLATE CONSTRUCTEUR
// ──────────────────────────────
async function buildLoanPDFTemplate(d){
  const wrap = document.createElement('div');
  wrap.className = 'pdf-container';
  wrap.appendChild(buildStyles());
  wrap.appendChild(buildHeader(d));
  wrap.appendChild(buildHero(d));
  if (d.ptzEnabled) wrap.appendChild(buildPTZBlock(d));
  wrap.appendChild(buildAmortTable(d));
  wrap.appendChild(buildFooter(d));
  return wrap;
}

function buildStyles(){
  const s=document.createElement('style');
  s.textContent=`
  body,html{margin:0;padding:0;box-sizing:border-box;}
  .pdf-container{font-family:Arial, sans-serif;font-size:12px;color:#374151;padding:15mm 10mm;background:#fff;}
  .pdf-header{text-align:center;border-bottom:2px solid #059669;margin-bottom:10mm;padding-bottom:6mm;}
  .pdf-table{width:100%;border-collapse:collapse;margin-top:6mm;}
  .pdf-table th,.pdf-table td{border:1px solid #e5e7eb;padding:6px;text-align:right;}
  .pdf-table th{text-align:center;background:#f0fdf4;font-weight:600;color:#065f46;}
  .small{font-size:11px;color:#6b7280;}
  .hard-page-break{page-break-after:always;break-after:page;}
  `;
  return s;
}

function buildHeader(d){
  const h=document.createElement('div');h.className='pdf-header';
  h.innerHTML=`<h1 style="margin:0;font-size:22px;color:#1f2937">📝 Analyse de prêt</h1>
  <div class="small">Généré le ${d.generatedAt.toLocaleDateString('fr-FR')} à ${d.generatedAt.toLocaleTimeString('fr-FR')}</div>`;
  return h;
}

function buildHero(d){
  const t=document.createElement('table');t.className='pdf-table';
  t.innerHTML=`<thead><tr><th>Montant</th><th>Durée</th><th>Taux nominal</th><th>Mensualité</th><th>Coût total</th></tr></thead>
  <tbody><tr>
  <td>${fmt(d.amount)}</td><td>${d.durationYears} ans</td><td>${d.rate.toFixed(2)} %</td>
  <td>${fmt(d.monthly)}</td><td>${fmt(d.totalCost)}</td>
  </tr></tbody>`;
  return t;
}

function buildPTZBlock(d){
  const div=document.createElement('div');div.style.marginTop='8mm';
  div.innerHTML=`<h3 style="color:#b45309;margin:0 0 4mm">🏡 PTZ</h3>
  <p style="margin:0 0 2mm">Capital : <strong>${fmt(d.ptzAmount)}</strong> sur ${d.ptzDuration} ans</p>`;
  return div;
}

function buildAmortTable(d){
  const div=document.createElement('div');div.style.marginTop='10mm';
  const t=document.createElement('table');t.className='pdf-table';
  t.innerHTML=`<thead><tr><th>Mois</th><th>Mensualité</th><th>Capital amorti</th><th>Intérêts</th><th>Assurance</th><th>Capital restant</th></tr></thead><tbody></tbody>`;
  const tb=t.querySelector('tbody');
  d.amortization.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=r.slice(0,6).map((c,i)=>`<td style="text-align:${i===0?'center':'right'}">${c}</td>`).join('');
    tb.appendChild(tr);
  });
  div.appendChild(t);
  return div;
}

function buildFooter(d){
  const f=document.createElement('div');f.style.marginTop='10mm;border-top:1px solid #e5e7eb;padding-top:4mm;font-size:11px;color:#6b7280;';
  f.innerHTML=`⚠️ Cette synthèse ne constitue pas un conseil financier personnalisé. Consultez un conseiller avant toute décision.<br>© Smartflow ${d.generatedAt.getFullYear()}`;
  return f;
}

// ──────────────────────────────
// UTILS
// ──────────────────────────────
function fmt(n){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:0}).format(n||0);} 
function validateLoanData(d){return d && d.amount>0 && d.monthly>0;}
function generatePDFFilename(date=new Date(),prefix='Smartflow'){const d=date.toISOString().split('T')[0];const t=date.toTimeString().split(' ')[0].replace(/:/g,'');return `${prefix}-${d}-${t}.pdf`;}

// UI Helpers (réutilisés depuis budget‑pdf.js)
function showLoadingState(btn){if(!btn) return null;const o={html:btn.innerHTML,dis:btn.disabled};btn.innerHTML='<i class="fas fa-spinner fa-spin mr-2"></i>PDF…';btn.disabled=true;return o;}
function showSuccessState(btn,o){if(!btn)return;btn.innerHTML='<i class="fas fa-check mr-2"></i>Téléchargé !';setTimeout(()=>{btn.innerHTML=o?.html||'Export PDF';btn.disabled=o?.dis||false;},1600);} 
function showErrorState(btn,msg){alert('Erreur PDF : '+msg);if(btn){btn.innerHTML='Export PDF';btn.disabled=false;}}

// Charger html2pdf si nécessaire
async function loadHtml2PdfLib(){
  if(typeof html2pdf==='undefined'){
    if(isDev) console.log('[Loan‑PDF] Chargement html2pdf…');
    await import('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    let i=0;while(typeof html2pdf==='undefined'&&i<8){await new Promise(r=>setTimeout(r,100));i++;}
    if(typeof html2pdf==='undefined') throw new Error('html2pdf introuvable');
  }
}

// ──────────────────────────────
// INTÉGRATION UI
// ──────────────────────────────
export function createLoanExportButton(){
  let btn=document.getElementById('export-loan-pdf');
  if(btn) return btn;
  const target=document.querySelector('#loan-simulator .mt-8') || document.getElementById('loan-results');
  if(!target) return null;
  btn=document.createElement('button');btn.id='export-loan-pdf';
  btn.className='w-full mt-4 py-3 px-4 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-lg shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center justify-center opacity-50 cursor-not-allowed';
  btn.disabled=true;btn.innerHTML='<i class="fas fa-file-pdf mr-2"></i>Exporter en PDF';
  btn.title='Calculez le prêt pour activer';
  btn.addEventListener('click',()=>exportLoanToPDF());
  target.appendChild(btn);
  return btn;
}

export function activateLoanExportButton(){
  const btn=document.getElementById('export-loan-pdf');
  if(btn){btn.disabled=false;btn.classList.remove('opacity-50','cursor-not-allowed');btn.title='Télécharger le PDF';}
}

// ──────────────────────────────
// AUTO‑INIT AU CHARGEMENT
// ──────────────────────────────
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{createLoanExportButton();});
}else{createLoanExportButton();}
