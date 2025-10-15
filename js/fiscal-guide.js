// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 3.7 - Mai 2025 - Mise à jour des taux et barèmes 2025
// --- GLOBALE (hors DOMContentLoaded) : badge IS réduit ---
function renderISReduceBadge() {
  return `
    <span class="regime-badge is" style="position:relative; cursor:help;">
      IS 15%
      <span class="tooltiptext">
        Taux réduit sous conditions (PME) :
        <br>• CA &lt; 10 M€
        <br>• Capital entièrement libéré
        <br>• ≥ 75% détenu par des personnes physiques
        <br><small>Sinon : 25%.</small>
      </span>
    </span>`;
}
// Rendez-la visible même en <script type="module">
if (typeof window !== 'undefined') window.renderISReduceBadge = renderISReduceBadge;
// --- Helpers VFL (versement libératoire) — GLOBAL ---
const VFL_RFR_LIMIT_PER_PART_2025 = 28797; // € / part, RFR N-2
const VFL_DEADLINE_TXT = "Option avant le 31/12 pour l'année suivante";

function isEligibleVFL({ rfrN2 = null, nbParts = 1 } = {}) {
  if (rfrN2 == null) return null;
  return (rfrN2 / Math.max(1, nbParts)) <= VFL_RFR_LIMIT_PER_PART_2025;
}

function renderVFLNote(typeMicro) {
  const taux = { BIC_VENTE: "1%", BIC_SERVICE: "1,7%", BNC: "2,2%" }[typeMicro] || "1–2,2%";
  return `
    <div class="mt-3 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-xs">
      <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
        <strong>Versement libératoire ${taux} du CA :</strong>
        RFR N-2 ≤ <strong>${VFL_RFR_LIMIT_PER_PART_2025.toLocaleString("fr-FR")} €</strong> par part • ${VFL_DEADLINE_TXT}
      </p>
    </div>`;
}
// --- Arrondis & fermeture d'équation (Option B) — GLOBAL ---
const round2 = v => Math.round(v * 100) / 100;

/**
 * Ferme l'équation: brut + cotisations = resultatAvantRem
 * en travaillant en centimes et en absorbant l'écart final (±1€) dans les cotisations.
 */
function closeEquation(brut, cotisations, resultatAvantRem, tol = 1) {
  const b = round2(brut);
  let c = round2(cotisations);
  let reste = round2(resultatAvantRem - b - c);
  if (Math.abs(reste) <= tol) {
    c = round2(c + reste);
    reste = 0;
  }
  return { brut: b, cotisations: c, reste };
}

if (typeof window !== "undefined") {
  window.renderVFLNote = renderVFLNote;
  window.isEligibleVFL = isEligibleVFL;
}


document.addEventListener('DOMContentLoaded', function () {
  // --- Initialisation requise par les écouteurs (onglet + présence du simulateur) ---
  let __fiscalSimInitDone = false;
  function initFiscalSimulator() {
    if (__fiscalSimInitDone) return;      // évite les ré-inits si on reclique l'onglet
    __fiscalSimInitDone = true;
    try {
      setupSimulator();                    // ta vraie initialisation
    } catch (e) {
      console.error('initFiscalSimulator error:', e);
      __fiscalSimInitDone = false;        // si échec, permettre une nouvelle tentative
    }
  }
  // (utile si d'autres scripts veulent l'appeler)
  if (typeof window !== 'undefined') window.initFiscalSimulator = initFiscalSimulator;

  // S'assurer que l'onglet Guide fiscal initialise correctement ce code
  const guideTab = document.querySelector('.tab-item:nth-child(3)'); // Le 3ème onglet
  if (guideTab) {
    guideTab.addEventListener('click', initFiscalSimulator);
  }

  // Chercher si le simulateur existe déjà sur la page
  if (document.getElementById('fiscal-simulator')) {
    initFiscalSimulator();
  }

  // --- Util commun : détecter LA bonne grille de formulaire ---
  function getFormGrid(){
    const sim = document.getElementById('fiscal-simulator');
    if (!sim) return null;

    const ids = ['sim-ca','sim-marge','sim-salaire','sim-nb-associes','sim-part-associe'];
    const fields = ids.map(id=>document.getElementById(id)).filter(Boolean);
    if (!fields.length) return sim.querySelector('.grid');

    const grids = Array.from(sim.querySelectorAll('.grid'))
      .filter(g => fields.every(f => g.contains(f)));
    if (!grids.length) return sim.querySelector('.grid');

    const depth = g => { let d=0, p=g; while (p && p!==sim){ d++; p=p.parentElement; } return d; };
    grids.sort((a,b)=>depth(a)-depth(b));
    return grids[0];
  }
// ---------- Styles personnalisés ----------
function addCustomStyles() {
  const style = document.createElement('style');
  style.textContent = `
/* Conteneur du simulateur fiscal */
#fiscal-simulator {
  max-width: 980px;
  margin-left: 0;
  margin-right: auto;
}

/* Grille alignée à gauche (base) */
#fiscal-simulator .grid {
  justify-content: flex-start !important;
}

/* Options sans centrage automatique */
#sim-options-container {
  margin-left: 0 !important;
  margin-right: 0 !important;
  grid-column: 1 / -1;
}

/* Conteneur global */
#tab-content-container {
  max-width: 1200px;
  margin-left: 0;
  margin-right: auto;
}

/* ===== Grille 3 colonnes avec areas (layout CORRIGÉ) ===== */
@media (min-width:768px){
  #fiscal-simulator .form-layout-areas-3{
    display:grid;
    grid-template-columns: 1fr 1fr 1fr !important;
    grid-auto-rows:auto;
    grid-auto-flow:dense;
    column-gap:1rem;
    row-gap:1.25rem;

    /* ✅ CORRECTION : inverser associes et part
       L1 : CA (2 col) | Marge
       L2 : Associés | Part | Salaire
       L3 : Base10 (2 col) | Salaire (suite) */
    grid-template-areas:
      "ca       ca       marge"
      "associes part     salaire"
      "base10   base10   salaire";

    align-items:start;
    justify-items: stretch !important;
  }
  
  /* Sécurité overflow/shrink des enfants */
  #fiscal-simulator .form-layout-areas-3 > * { min-width: 0; }
  #base10-inline { width: 100%; }

  /* mapping des zones */
  .field-ca       { grid-area: ca; }
  .field-marge    { grid-area: marge; }
  .field-salaire  { grid-area: salaire; }
  .field-associes { grid-area: associes; }
  .field-part     { grid-area: part; }
  #base10-inline,
  .field-base10   { grid-area: base10; align-self:start; }

  /* ⛔ Neutraliser tout ancien col-span/row-span qui perturbe les areas */
  #fiscal-simulator .form-layout-areas-3 .field-ca,
  #fiscal-simulator .form-layout-areas-3 .field-marge,
  #fiscal-simulator .form-layout-areas-3 .field-salaire,
  #fiscal-simulator .form-layout-areas-3 .field-associes,
  #fiscal-simulator .form-layout-areas-3 .field-part,
  #fiscal-simulator .form-layout-areas-3 .field-base10{
    grid-column: auto !important;
    grid-row: auto !important;
  }

  /* Si un vieux wrapper existe encore, on le neutralise */
  #fiscal-simulator .form-layout-areas-3 .part-detenu-row{ 
    display: contents !important; 
  }
}

/* Mobile : on empile proprement */
@media (max-width:767.98px){
  #fiscal-simulator .form-layout-areas-3{ display:block; }
}

/* — Tooltips plus compacts — */
.tooltiptext {
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0.4rem 0.6rem;
  max-width: 220px;
}

/* ---- Correctifs d'inputs ---- */
.part-detenu-wrap{ position:relative; width:100%; display:inline-block; }
.part-detenu-wrap .suffix-pct{
  position:absolute; right:.65rem; top:50%; transform:translateY(-50%);
  pointer-events:none; font-weight:600; color:#cbd5e1;
}

/* "100% à droite" → forcer à gauche + place pour le % */
#sim-part-associe{
  text-align:left !important;
  padding-right:2.25rem;
}

/* ---------- Carte Base 10% ---------- */
.base10-card { position: relative; }
.base10-card-accent{
  position:absolute; inset:0;
  border-left:4px solid rgba(34,197,94,.8);
  border-radius: 12px;
  pointer-events:none;
}

/* Champs un peu plus "respirants" */
#base10-inline .money-wrap { position: relative; }
#base10-inline .money-wrap input{ padding-right:2.25rem; }
#base10-inline .money-wrap .suffix-eur{
  position:absolute; right:.65rem; top:50%; transform:translateY(-50%);
  pointer-events:none; font-weight:600; color:#cbd5e1;
}
#base10-inline .mini{ font-size:.8rem; color:#cbd5e1; margin-bottom:.25rem; }

/* ========== Base 10% — carte et grille ========== */
#base10-inline { 
  max-width: 100%;
  margin-top: 0;
}
.base10-card { 
  padding: 1.25rem 1.5rem; 
  position: relative;
}
#base10-inline .grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(200px, 1fr));
  gap: 1rem;
}
@media (max-width: 1024px) {
  #base10-inline .grid { grid-template-columns: repeat(2, minmax(200px, 1fr)); }
}
@media (max-width: 640px) {
  #base10-inline .grid { grid-template-columns: 1fr; }
}
#base10-inline .money-wrap { position: relative; }
#base10-inline .money-wrap input {
  padding: 0.875rem 2.5rem 0.875rem 1rem;
  font-size: 0.95rem;
  height: 3rem;
}
#base10-inline .mini { 
  font-size: 0.85rem; 
  margin-bottom: 0.5rem; 
  font-weight: 500; 
}
#base10-inline .money-wrap .suffix-eur {
  position: absolute; 
  right: .65rem; 
  top: 50%; 
  transform: translateY(-50%);
  pointer-events: none; 
  font-weight: 600; 
  color: #cbd5e1;
}
#tns-mini-seuil { 
  font-size: 1.25rem; 
  font-weight: 700; 
}

/* ====== ALIGNER "Nombre d'associés" et "Part détenue (%)" ====== */
@media (min-width:768px){
  /* 1) Même ligne de label (avec ou sans tooltip à droite) */
  .field-associes label,
  .field-part label{
    display:inline-flex;
    align-items:flex-end;
    gap:.375rem;
    line-height:1.2;
    min-height:1.6rem;
    margin-bottom:.5rem;
  }
  /* si un tooltip suit le label, on l'aligne en bas aussi */
  .field-associes label + .info-tooltip,
  .field-part label + .info-tooltip{
    align-self:flex-end;
    margin-bottom:.5rem;
  }

  /* 2) Inputs : hauteur/padding identiques */
  .field-associes input,
  .field-part input{
    box-sizing:border-box;
    height:2.75rem;
    padding:.75rem .75rem;
    font-size:.95rem;
  }
  /* l'input "Part détenue" a un suffixe % => on garde de la place à droite */
  .field-part .part-detenu-wrap input{
    padding-right:2.25rem;
  }
}

/* 3) Supprimer les spinners (évite une hauteur différente selon navigateur) */
.field-associes input[type="number"],
.field-part input[type="number"]{
  -moz-appearance:textfield;
}
.field-associes input[type="number"]::-webkit-outer-spin-button,
.field-associes input[type="number"]::-webkit-inner-spin-button,
.field-part input[type="number"]::-webkit-outer-spin-button,
.field-part input[type="number"]::-webkit-inner-spin-button{
  -webkit-appearance: none;
  margin:0;
}

/* 4) Sécurité mobile pour l'espacement */
@media (max-width:767.98px){
  .field-associes label,
  .field-part label{ margin-bottom:.4rem; }
}
`;
  document.head.appendChild(style);
}
addCustomStyles();


// ---------- Insertion Base 10% + amélioration "Part détenue (%)" ----------

// util: remonter jusqu'à l'enfant direct de la grille
function gridItem(el, grid) {
  let cur = el;
  while (cur && cur.parentElement !== grid) cur = cur.parentElement;
  return cur;
}


function placeBase10UnderNbAssocies(){
  const sim = document.getElementById('fiscal-simulator');
  if (!sim) return;

  // ✅ utilise la même détection partout
  const formGrid = getFormGrid();
  if (!formGrid || document.getElementById('base10-inline')) return;

  // activer la grille à zones sur LE bon conteneur
  formGrid.classList.add('form-layout-areas-3');

  // champs
  const elCA      = document.getElementById('sim-ca');
  const elMarge   = document.getElementById('sim-marge');
  const elSalaire = document.getElementById('sim-salaire');
  const elNb      = document.getElementById('sim-nb-associes');
  const elPart    = document.getElementById('sim-part-associe');
  const fields = [elCA, elMarge, elSalaire, elNb, elPart].filter(Boolean);
  if (fields.length < 5) return;

  // util : remonter jusqu'à l'enfant direct de formGrid
  const gridItem = (el, grid) => { let cur = el; while (cur && cur.parentElement !== grid) cur = cur.parentElement; return cur; };

  // enfants directs
  const caItem      = gridItem(elCA,      formGrid);
  const margeItem   = gridItem(elMarge,   formGrid);
  const salaireItem = gridItem(elSalaire, formGrid);
  const nbItem      = gridItem(elNb,      formGrid);
  const partItem    = gridItem(elPart,    formGrid);
  if (!caItem || !margeItem || !salaireItem || !nbItem || !partItem) return;

  // purge des spans récalcitrants
  [caItem, margeItem, salaireItem, nbItem, partItem].forEach(w=>{
    w.classList.remove(
      'col-span-1','col-span-2','col-span-3','col-span-full',
      'md:col-span-1','md:col-span-2','md:col-span-3','md:col-span-4',
      'md:col-start-1','lg:col-start-1'
    );
    w.style.gridColumn = 'auto';
    w.style.gridRow = 'auto';
  });

  // mapping des zones
  caItem.classList.add('field-ca');
  margeItem.classList.add('field-marge');
  salaireItem.classList.add('field-salaire');
  nbItem.classList.add('field-associes');
  partItem.classList.add('field-part');

  // suffixe % pour "Part détenue"
  if (elPart && !elPart.closest('.part-detenu-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'part-detenu-wrap w-full';
    const parent = elPart.parentNode;
    parent.insertBefore(wrap, elPart);
    wrap.appendChild(elPart);
    const pct = document.createElement('span');
    pct.className = 'suffix-pct';
    pct.textContent = '%';
    wrap.appendChild(pct);
  }
  elPart?.setAttribute('min','0');
  elPart?.setAttribute('max','100');
  elPart?.setAttribute('step','1');
  if (elPart) elPart.style.textAlign = 'left';

  // === bloc Base 10% ===
  const inline = document.createElement('div');
  inline.id = 'base10-inline';
  inline.classList.add('field-base10');
  inline.innerHTML = `
    <div class="base10-card bg-blue-900/40 border border-blue-700 rounded-xl p-4 md:p-5 relative">
      <div class="flex items-center mb-3 gap-2">
        <span class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-green-500/15 border border-green-500/30">
          <i class="fas fa-calculator text-green-400 text-xs"></i>
        </span>
        <label class="text-green-300 font-medium">
          Base 10% <span class="text-gray-400">(TNS dividendes)</span>
        </label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="money-wrap">
          <div class="mini flex items-center gap-1"><i class="fas fa-piggy-bank text-gray-400"></i><span>Capital social</span></div>
          <input id="base-capital" type="number" min="0" step="100" placeholder="ex. 10 000"
            class="w-full bg-blue-900/60 border border-gray-700 rounded-lg px-3 py-3 text-white">
          <span class="suffix-eur">€</span>
        </div>

        <div class="money-wrap">
          <div class="mini flex items-center gap-1"><i class="fas fa-university text-gray-400"></i><span>Compte courant</span></div>
          <input id="base-cca" type="number" min="0" step="100" placeholder="ex. 5 000"
            class="w-full bg-blue-900/60 border border-gray-700 rounded-lg px-3 py-3 text-white">
          <span class="suffix-eur">€</span>
        </div>

        <div class="money-wrap">
          <div class="mini flex items-center gap-1"><i class="fas fa-gift text-gray-400"></i><span>Primes</span></div>
          <input id="base-primes" type="number" min="0" step="100" placeholder="ex. 2 000"
            class="w-full bg-blue-900/60 border border-gray-700 rounded-lg px-3 py-3 text-white">
          <span class="suffix-eur">€</span>
        </div>
      </div>

      <input id="base10-total" type="hidden" value="0">

      <div class="mt-3 flex items-center justify-between">
        <div class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i>Capital libéré + primes + CCA</div>
        <div class="text-base md:text-lg font-semibold text-green-400">10% = <span id="tns-mini-seuil">—</span></div>
      </div>

      <div class="base10-card-accent"></div>
    </div>
  `;

  // ✅ Insérer Base10 APRÈS partItem (au lieu de nbItem)
  // Cela garantit qu'elle apparaît sur la 3e ligne dans le DOM
  partItem.parentNode.insertBefore(inline, partItem.nextElementSibling);

  // formatage FR des montants saisis
  const parseFR = s => Number(String(s||'').replace(/\s/g,'').replace(/[^\d.-]/g,''))||0;
  const formatFR = n => n.toLocaleString('fr-FR');
  ['base-capital','base-cca','base-primes'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', ()=> { el.dataset.raw = String(parseFR(el.value)); });
    ['change','blur'].forEach(ev=> el.addEventListener(ev, ()=>{
      const raw = parseFR(el.dataset.raw ?? el.value);
      el.value = raw ? formatFR(raw) : '';
    }));
  });
  const val = id => { const el = document.getElementById(id); return parseFR(el?.dataset.raw ?? el?.value); };

  // calcul dynamique du seuil 10%
  const fmtEUR = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:0});
  function updateBase10(){
    const total = val('base-capital') + val('base-primes') + val('base-cca');
    document.getElementById('base10-total').value = String(total);
    document.getElementById('tns-mini-seuil').textContent = total>0 ? fmtEUR.format(total*0.10) : '—';
    if (typeof runComparison === 'function') runComparison();
  }
  ['base-capital','base-primes','base-cca'].forEach(id=>{
    const el=document.getElementById(id);
    if (el){ el.addEventListener('input',updateBase10); el.addEventListener('change',updateBase10); }
  });
  updateBase10();

  // visibilité selon statuts
  function toggleBase10Visibility(){
    const filter = document.getElementById('sim-status-filter')?.value || 'all';
    const selected = typeof getSelectedStatuses==='function' ? getSelectedStatuses(filter) : [];
    const gerantMinoritaire = document.getElementById('sarl-gerant-minoritaire')?.checked;
    const pertinents = ['eurlIS','sarl','selarl','sca'];
    inline.style.display = (selected.some(s => pertinents.includes(s)) && !gerantMinoritaire) ? '' : 'none';
  }
  toggleBase10Visibility();
  document.getElementById('sim-status-filter')?.addEventListener('change',toggleBase10Visibility);
  document.getElementById('sarl-gerant-minoritaire')?.addEventListener('change',toggleBase10Visibility);
}
