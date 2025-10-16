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
const VFL_DEADLINE_TXT = "Option avant le 31/12 pour l’année suivante";

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
 * en travaillant en centimes et en absorbant l’écart final (±1€) dans les cotisations.
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
// --- Dividendes TNS : split PS 17,2% / Cotisations TNS (>10%) ---
const TAUX_PS = 0.172;
const TAUX_IR_PFU = 0.128;     // si PFU
const TAUX_ABATT_DIV = 0.40;   // abattement 40% si barème
const TAUX_TNS_DIV_FALLBACK = 0.40;// fallback ~40%

function calcDivTNS({divBruts=0, baseSeuil10=0, methode='PFU', tmi=11, tauxTNS=TAUX_TNS_DIV_FALLBACK}){
  const seuilMontant = 0.10 * (baseSeuil10 || 0);
  const partPS  = Math.min(divBruts, seuilMontant);
  const partTNS = Math.max(0, divBruts - seuilMontant);

  // IR sur dividendes
  let irDiv;
  if (methode === 'PROGRESSIF') {
    const baseIR = (partPS + partTNS) * (1 - TAUX_ABATT_DIV); // abattement 40%
    irDiv = baseIR * (tmi/100);
  } else {
    irDiv = divBruts * TAUX_IR_PFU;
  }

  const ps172  = partPS * TAUX_PS;   // seulement sur part <=10%
  const cotTNS = partTNS * tauxTNS;  // seulement sur part >10%

  const totalPrels = irDiv + ps172 + cotTNS;
  const nets = divBruts - totalPrels;

  return { partPS, partTNS, ps172, cotTNS, irDiv, totalPrels, nets };
}
// --- Abattement 10% T&S 2025 (plancher / plafond) ---
const CSG_NOND_TAUX = 0.029;
const ABATT_TS_TAUX = 0.10;
const ABATT_TS_MIN  = 472;
const ABATT_TS_MAX  = 14171;

function baseImposableTNS({remBrute=0, netSocial=0}) {
  const csgND = remBrute * CSG_NOND_TAUX;
  const abat  = Math.min(ABATT_TS_MAX, Math.max(ABATT_TS_MIN, remBrute * ABATT_TS_TAUX));
  const base  = Math.max(0, (netSocial + csgND) - abat);
  return { base, csgND, abat };
}
// --- Parts fiscales (quotient familial) — GLOBAL ---
function getNbParts() {
  const el = document.getElementById('sim-nb-parts');
  return el ? (parseFloat(el.value) || 1) : 1;
}
document.addEventListener('DOMContentLoaded', function () {
  // --- Initialisation requise par les écouteurs (onglet + présence du simulateur) ---
  let __fiscalSimInitDone = false;
  function initFiscalSimulator() {
    if (__fiscalSimInitDone) return;      // évite les ré-inits si on reclique l’onglet
    __fiscalSimInitDone = true;
    try {
      setupSimulator();                    // ta vraie initialisation
    } catch (e) {
      console.error('initFiscalSimulator error:', e);
      __fiscalSimInitDone = false;        // si échec, permettre une nouvelle tentative
    }
  }
  // (utile si d’autres scripts veulent l’appeler)
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
  // --- IS réduit 15% : conditions légales + calcul par tranches ---
const IS_15_SEUIL = 42500;     // plafond de la tranche à 15%
const IS_TAUX_PLEIN = 0.25;    // 25%

function isEligibleIS15({ ca = 0, capitalIntegralementLibere = false, pctDetentionPersPhysiques = 0 } = {}) {
  // Conditions simplifiées : CA < 10 M€, capital entièrement libéré, >= 75% détenu par des personnes physiques
  return ca < 10_000_000 && !!capitalIntegralementLibere && (pctDetentionPersPhysiques >= 75);
}

/** Calcule l'IS avec tranche 15% (si éligible) + 25% au-delà. */
function calcISProgressif(beneficeIS, elig15) {
  const b = Math.max(0, Number(beneficeIS) || 0);
  const part15 = elig15 ? Math.min(b, IS_15_SEUIL) : 0;
  const part25 = Math.max(0, b - part15);
  const is = round2(part15 * 0.15 + part25 * IS_TAUX_PLEIN);
  const tauxMoyen = b > 0 ? round2((is / b) * 100) : 0;
  return { is, part15, part25, tauxMoyen };
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
  window.getFormGrid = getFormGrid;
// ---------- Styles personnalisés ----------
// ===== styles + correctifs de layout =====
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
  /* ⚠️ ne pas forcer justify-items ici pour laisser les items s'étirer dans la grille à zones */
}
/* Variante si tu veux garder justify-items:start globalement : */
/* #fiscal-simulator .grid:not(.form-layout-areas-3){ justify-items:start !important; } */

/* --- PATCH CSS : "Options de simulation" en pleine largeur --- */
/* renforce la spécificité + neutralise tout col-span résiduel */
#fiscal-simulator .form-layout-areas-3 > #sim-options-container{
  grid-column: 1 / -1 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100%;
}
#sim-options-container[class*="col-span"]{
  grid-column: 1 / -1 !important;
}

/* Conteneur global */
#tab-content-container {
  max-width: 1200px;
  margin-left: 0;
  margin-right: auto;
}

/* ===== Grille 3 colonnes avec areas (ordre corrigé) ===== */
@media (min-width:768px){
  #fiscal-simulator .form-layout-areas-3{
    display:grid;
    grid-template-columns: 1.25fr 1fr 1fr !important; /* CA un peu plus large */
    grid-auto-rows:auto;
    grid-auto-flow:dense;
    column-gap:1rem;
    row-gap:1.25rem;

    /* L1 : CA (2 col) | Marge
       L2 : Associés | Part | Salaire
       L3 : Base10 (2 col) | Salaire (suite) */
    grid-template-areas:
      "ca       ca       marge"
      "associes part     salaire"
      "base10   base10   salaire" !important;

    justify-items:stretch !important;
    align-items:start;
  }

  /* Anti-overflow + neutralise tout col/row-span résiduel (Tailwind) */
  #fiscal-simulator .form-layout-areas-3 > *{
    grid-column:auto !important;
    grid-row:auto !important;
    min-width:0;
    max-width:100%;
  }

  /* Mapping prioritaire des zones */
  #fiscal-simulator .form-layout-areas-3 > .field-ca       { grid-area: ca !important; }
  #fiscal-simulator .form-layout-areas-3 > .field-marge    { grid-area: marge !important; }
  #fiscal-simulator .form-layout-areas-3 > .field-salaire  { grid-area: salaire !important; }
  #fiscal-simulator .form-layout-areas-3 > .field-associes { grid-area: associes !important; }
  #fiscal-simulator .form-layout-areas-3 > .field-part     { grid-area: part !important; }

  /* Base 10% : zone + 2 colonnes garanties en MD */
  #fiscal-simulator .form-layout-areas-3 > .field-base10{
    grid-area: base10 !important;
    grid-column: 1 / 3 !important;  /* 2 colonnes en >=768px */
    align-self:start;
    min-width:0;
    max-width:100%;
  }

  /* Ancien wrapper éventuel à neutraliser */
  #fiscal-simulator .form-layout-areas-3 .part-detenu-row{
    display:contents !important;
  }
}

/* LG (>=1024px) : étirer la carte Base 10% sur toute la rangée (3 colonnes) */
@media (min-width:1024px){
  #fiscal-simulator .form-layout-areas-3 > .field-base10{
    grid-column: 1 / -1 !important; /* plein largeur */
  }
  /* un peu plus d’air pour les 3 champs internes */
  #base10-inline .grid{
    grid-template-columns: repeat(3, minmax(240px,1fr));
    gap: 1.25rem;
  }
}

/* Mobile : on empile proprement */
@media (max-width:767.98px){
  #fiscal-simulator .form-layout-areas-3{ display:block; }
}

/* Sécurité supplémentaire pour la carte */
#base10-inline{ width:100%; max-width:100%; }

/* — Tooltips plus compacts — */
.tooltiptext {
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0.4rem 0.6rem;
  max-width: 220px;
}

/* ---- Correctifs d’inputs ---- */
.part-detenu-wrap{ position:relative; width:100%; display:inline-block; }
.part-detenu-wrap .suffix-pct{
  position:absolute; right:.65rem; top:50%; transform:translateY(-50%);
  pointer-events:none; font-weight:600; color:#cbd5e1;
}

/* “100% à droite” → forcer à gauche + place pour le % */
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

/* ========== Base 10% — carte et grille ========== */
#base10-inline { 
  max-width: 100%;
  margin-top: 1.25rem;
}
.base10-card { 
  padding: 1.25rem 1.5rem; 
  position: relative;
}

/* Grille interne par défaut */
#base10-inline .grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 1.25rem;
}
@media (max-width: 1024px) {
  #base10-inline .grid { grid-template-columns: repeat(2, minmax(220px, 1fr)); }
}
@media (max-width: 640px) {
  #base10-inline .grid { grid-template-columns: 1fr; }
}

/* --- Alignements visuels de la carte (patch) --- */

/* header de la carte : icône + libellé alignés sur la baseline */
#base10-inline .base10-card > .flex{
  align-items: baseline;
  gap: .5rem;
}
#base10-inline .base10-card label{
  line-height: 1.15;
  margin: 0;
}

/* hauteur homogène des inputs + suffixe € parfaitement centré */
#base10-inline .money-wrap{ position:relative; }
#base10-inline .money-wrap input{
  box-sizing: border-box;
  height: 3.25rem;              /* + homogène */
  padding: .875rem 2.5rem .875rem 1rem;
  font-size: .95rem;
}
#base10-inline .money-wrap .suffix-eur{
  position:absolute; right:.65rem; top:50%; transform:translateY(-50%);
  pointer-events:none; font-weight:600; color:#cbd5e1;
}

/* micro-libellés alignés et cohérents */
#base10-inline .mini{
  display:flex; align-items:center; gap:.4rem;
  font-size:.85rem; line-height:1.1; margin-bottom:.5rem; color:#cbd5e1;
}

/* bas de carte : texte info et résultat bien calés */
#base10-inline .mt-3{
  align-items: center;
}

/* Si jamais un col-span résiduel traîne dans la carte, on le neutralise */
#base10-inline *[class*="col-span"]{ grid-column: auto !important; }

/* (styles génériques déjà présents) */
#base10-inline .mini { 
  font-size: 0.85rem; 
  margin-bottom: 0.5rem; 
  font-weight: 500; 
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
    align-items:flex-end;      /* cale la baseline */
    gap:.375rem;
    line-height:1.2;
    min-height:1.6rem;         /* réserve fixe */
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
  /* l’input “Part détenue” a un suffixe % => on garde de la place à droite */
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

/* 4) Sécurité mobile pour l’espacement */
@media (max-width:767.98px){
  .field-associes label,
  .field-part label{ margin-bottom:.4rem; }
}
`;
  document.head.appendChild(style);
}
addCustomStyles();


// ---------- Insertion Base 10% + amélioration "Part détenue (%)" ----------

// util: remonter jusqu’à l’enfant direct de la grille
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

  // util : remonter jusqu’à l’enfant direct de formGrid
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

  // suffixe % pour “Part détenue”
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

  /* 🔒 Verrouillage position grille */
  inline.style.gridArea = 'base10';
  inline.style.gridColumn = '1 / 3';

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

  /* --- PATCH JS : inputs monnaie en <text> + clavier numérique --- */
  ['base-capital','base-cca','base-primes'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // switch <number> -> <text> pour autoriser 1 000, 25 000, etc.
    el.setAttribute('type', 'text');
    el.setAttribute('inputmode', 'numeric');   // clavier numérique mobile
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('pattern', '[0-9\\s,.]*'); // tolère espaces/virgules/points
    // (optionnel) empêche la roulette de modifier la valeur
    el.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  });

  // insérer Base10 juste APRÈS l’item "Nombre d’associés"
  nbItem.parentNode.insertBefore(inline, nbItem.nextElementSibling);
// ====== Formatage FR des montants saisis (robuste) ======

// Parser FR : gère espaces fines, € , points/virgules, et distingue milliers vs décimales
const parseFR = (val) => {
  let s = String(val ?? '').trim();

  // retirer € et espaces (y compris NBSP \u00A0 et espace fine \u202F)
  s = s.replace(/[€\s\u00A0\u202F]/g, '');

  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');

  if (hasComma && hasDot) {
    // style "1.234,56" → points = milliers, virgule = décimales
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // style "1234,56" → virgule = décimales
    s = s.replace(',', '.');
  } else if (hasDot) {
    // si pattern milliers "1.234.567" → retire les points, sinon garder comme décimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

// (optionnel) si tu veux forcer des entiers uniquement, dé-commente et remplace parseFR par parseFRint ci-dessous
// const parseFR = (val) => { const s = String(val ?? '').replace(/[^\d]/g, ''); return s ? Number(s) : 0; };

const formatFR = (n) => Number(n || 0).toLocaleString('fr-FR');

// Initialisation des 3 inputs (type=text pour accepter "10 000", "1.000", etc.)
['base-capital','base-cca','base-primes'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;

  // assurer un comportement "numérique" friendly
  el.setAttribute('type', 'text');
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('autocomplete', 'off');
  el.setAttribute('pattern', '[0-9\\s,.\u00A0\u202F€]*'); // tolère chiffres, espaces, ., , et €
  el.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

  // — live parsing : stocke la valeur brute normalisée dans data-raw
  el.addEventListener('input', () => {
    el.dataset.raw = String(parseFR(el.value));
  });

  // — au blur/change : ré-affiche joliment en FR
  ['change','blur'].forEach(ev => el.addEventListener(ev, () => {
    const raw = parseFR(el.dataset.raw ?? el.value);
    el.value = raw ? formatFR(raw) : '';
  }));

  // — si valeur initiale (placeholder ignoré), la normaliser
  if (el.value) {
    const raw = parseFR(el.value);
    el.dataset.raw = String(raw);
    el.value = raw ? formatFR(raw) : '';
  }
});

// Helper pour lire la valeur numérique d'un champ
const val = (id) => {
  const el = document.getElementById(id);
  return parseFR(el?.dataset.raw ?? el?.value);
};

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




function setupSimulator() {
  // --- Valeurs par défaut cohérentes (si vides) ---
  const setIfEmpty = (id, v) => {
    const el = document.getElementById(id);
    if (el && (el.value === '' || el.value == null)) el.value = v;
  };
  setIfEmpty('sim-nb-associes', '1');
  setIfEmpty('sim-part-associe', '100');
  setIfEmpty('sim-salaire', '70');
  setIfEmpty('sim-marge', '30');

  const compareBtn = document.getElementById('sim-compare-btn');
  if (!compareBtn) return;

  compareBtn.addEventListener('click', runComparison);

  // Écouter les changements dans les champs pour MAJ auto
  const inputFields = ['sim-ca', 'sim-marge', 'sim-salaire', 'sim-tmi', 'sim-nb-associes', 'sim-part-associe'];
  inputFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', runComparison);
  });

  // Rafraîchir l’état des cases "Personnalisé" quand le nb d’associés change
  const nbAssociesEl = document.getElementById('sim-nb-associes');
  if (nbAssociesEl) nbAssociesEl.addEventListener('change', updateCustomStatusDisabling);

  // 🔓 Autoriser 0 % de salaire et borner proprement [0,100]
  (function enableZeroPercentSalary() {
    const el = document.getElementById('sim-salaire');
    if (!el) return;
    el.setAttribute('min', '0');
    if (!el.getAttribute('step')) el.setAttribute('step', '1');
    const clamp01 = v => Math.max(0, Math.min(100, v));
    const normalize = () => {
      if (el.value === '') return;
      const n = parseFloat(el.value);
      if (Number.isFinite(n)) el.value = clamp01(n);
    };
    el.addEventListener('input', normalize, { passive: true });
    normalize();
  })();

  // Configurer l'accordéon pour les statuts juridiques
  setupAccordion();

  // Mettre à jour l'interface du simulateur pour inclure tous les statuts
  updateSimulatorInterface();

  // ➜ Le DOM cible existe maintenant
  placeBase10UnderNbAssocies(); // ✅ insertion des 3 champs “Base 10%”

  // Exécuter une première simulation au chargement
  setTimeout(runComparison, 100);
}


// Fonction pour mettre à jour l'interface du simulateur
function updateSimulatorInterface() {
  // Récupérer le conteneur du simulateur
  const simulatorContainer = document.getElementById('fiscal-simulator');
  if (!simulatorContainer) return;

  // Vérifier si les options existent déjà pour éviter les doublons
  if (document.getElementById('sim-options-container')) {
    console.log("Options de simulation déjà présentes, pas de reconstruction");
  } else {
    // Ajouter un sélecteur de statuts et des options de simulation avancées
    const formContainer = getFormGrid() || simulatorContainer.querySelector('.grid');

    if (formContainer) {
      // Ajouter une nouvelle ligne pour les options de simulation
      const optionsRow = document.createElement('div');
      optionsRow.className = 'col-span-full md:col-start-1 w-full mb-4 !ml-0 !mr-0';
      optionsRow.id = 'sim-options-container';
      optionsRow.innerHTML = `
<div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
  <h3 class="font-medium mb-3 text-green-400">Options de simulation</h3>

  <!-- Filtres de statuts avec boutons visuels -->
  <div class="mb-4">
    <label class="block text-gray-300 mb-2">Filtres rapides</label>
    <div class="flex flex-wrap gap-2" id="status-filter-buttons">
      <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="common">
        <i class="fas fa-star mr-1"></i> Recommandés
      </button>
      <button class="status-filter-btn px-3 py-2 rounded-md bg-green-500 text-gray-900 font-medium" data-filter="all">
        <i class="fas fa-list mr-1"></i> Tous
      </button>
      <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="is_only">
        <i class="fas fa-building mr-1"></i> IS uniquement
      </button>
      <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="ir_only">
        <i class="fas fa-user mr-1"></i> IR uniquement
      </button>
      <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="commercial">
        <i class="fas fa-store mr-1"></i> Commercial
      </button>
      <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="liberal">
        <i class="fas fa-briefcase-medical mr-1"></i> Libéral
      </button>
      <button class="status-filter-btn px-3 py-2 rounded-md bg-blue-800 text-white" data-filter="custom">
        <i class="fas fa-sliders-h mr-1"></i> Personnalisé
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4" id="sim-options">
    <div>
      <label class="block text-gray-300 mb-2">Statuts à comparer</label>
      <select id="sim-status-filter" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
        <option value="common">Statuts courants (5)</option>
        <option value="all" selected>Tous les statuts (13)</option>
        <option value="is_only">IS uniquement</option>
        <option value="ir_only">IR uniquement</option>
        <option value="commercial">Statuts commerciaux</option>
        <option value="liberal">Professions libérales</option>
        <option value="custom">Personnalisé</option>
      </select>
    </div>
  </div>
</div>

<div class="mb-4">
  <label class="block text-gray-300 mb-2">Fonctionnalités activées</label>

  <div class="flex items-center flex-wrap md:flex-nowrap gap-x-6 gap-y-2">
    <div class="flex flex-col">
      <label class="flex items-center">
        <input type="hidden" id="sim-expert-mode" checked>
        <i class="fas fa-chart-line text-pink-400 mr-1"></i>
        <span class="text-sm">Mode expert</span>
      </label>
      <span class="info-tooltip mt-1">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">Calcul par tranches progressives d'IR plutôt que le TMI simple.</span>
      </span>
    </div>

    <div class="flex flex-col">
      <label class="flex items-center">
        <input type="checkbox" id="use-optimal-ratio" class="mr-2 h-4 w-4">
        <i class="fas fa-magic text-purple-400 mr-1"></i>
        <span class="text-sm">Ratio optimal</span>
      </label>
      <span class="info-tooltip mt-1">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">Optimise le ratio entre rémunération et dividendes pour maximiser le revenu net.</span>
      </span>
    </div>

    <div class="flex flex-col">
      <label class="flex items-center">
        <input type="checkbox" id="sarl-gerant-minoritaire" class="mr-2 h-4 w-4">
        <i class="fas fa-users text-blue-400 mr-1"></i>
        <span class="text-sm">Gérant min.</span>
      </label>
      <span class="info-tooltip mt-1">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">Le gérant détient moins de 50&nbsp;% des parts sociales (assimilé salarié).</span>
      </span>
    </div>
  </div>

  <div class="mt-4">
    <label class="block text-gray-300 mb-2">Type d'activité pour Micro-entreprise</label>
    <select id="micro-type" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
      <option value="BIC_SERVICE" selected>BIC Services (abattement 50%)</option>
      <option value="BIC_VENTE">BIC Vente (abattement 71%)</option>
      <option value="BNC">BNC (abattement 34%)</option>
    </select>
  </div>

  <div class="mt-2">
    <div class="flex items-center">
      <input type="checkbox" id="micro-vfl" class="mr-2 h-4 w-4">
      <label for="micro-vfl" class="text-gray-300">Versement libératoire de l'impôt sur le revenu</label>
      <span class="info-tooltip ml-2">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">Remplace l'IR par un prélèvement de 1% (vente), 1,7% (services) ou 2,2% (libéral) sur votre CA.</span>
      </span>
    </div>
  </div>

  <!-- 🔹 NOUVEAU : Éligibilité au taux réduit d'IS (15%) -->
  <div class="mt-4">
    <label class="block text-gray-300 mb-2">Éligibilité au taux réduit d'IS (15%)</label>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4" id="is-eligibility-block">
      <label class="flex items-center gap-2">
        <input type="checkbox" id="is-capital-fully-paid" class="h-4 w-4">
        <span class="text-gray-300">Capital entièrement libéré</span>
      </label>
      <div>
        <label class="block text-gray-300 mb-1">Part détenue par des personnes physiques</label>
        <input id="is-pp-ownership" type="number" min="0" max="100" step="1" value="100"
               class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white">
      </div>
    </div>
    <div class="text-xs text-gray-400 mt-2">
      Conditions : CA &lt; 10 M€ • capital entièrement libéré • ≥ 75% détenu par des personnes physiques.
    </div>
  </div>

  <div class="fiscal-warning mt-4">
    <p><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
      <strong>Limites du simulateur:</strong> Ce simulateur simplifie certains aspects fiscaux pour faciliter la comparaison. Pour une analyse complète, consultez un expert-comptable.</p>
  </div>

  <div id="custom-status-options" class="hidden mt-4 p-4 rounded-lg">
    <div class="mb-2 text-green-400 font-medium">Sélectionnez les statuts à comparer</div>

    <div class="mb-3">
      <div class="text-sm text-gray-300 mb-1 border-b border-gray-700 pb-1">
        <i class="fas fa-building mr-1 text-blue-400"></i> Statuts à l'IS
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
        <div class="flex items-center"><input type="checkbox" id="status-eurlIS" value="eurlIS" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-eurlIS" class="text-sm"><span class="regime-badge is">IS</span> EURL-IS</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-sasu" value="sasu" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-sasu" class="text-sm"><span class="regime-badge is">IS</span> SASU</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-sarl" value="sarl" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-sarl" class="text-sm"><span class="regime-badge is">IS</span> SARL</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-sas" value="sas" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-sas" class="text-sm"><span class="regime-badge is">IS</span> SAS</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-sa" value="sa" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-sa" class="text-sm"><span class="regime-badge is">IS</span> SA</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-selarl" value="selarl" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-selarl" class="text-sm"><span class="regime-badge is">IS</span> SELARL</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-selas" value="selas" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-selas" class="text-sm"><span class="regime-badge is">IS</span> SELAS</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-sca" value="sca" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-sca" class="text-sm"><span class="regime-badge is">IS</span> SCA</label></div>
      </div>
    </div>

    <div>
      <div class="text-sm text-gray-300 mb-1 border-b border-gray-700 pb-1">
        <i class="fas fa-user mr-1 text-green-400"></i> Statuts à l'IR
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
        <div class="flex items-center"><input type="checkbox" id="status-micro" value="micro" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-micro" class="text-sm"><span class="regime-badge ir">IR</span> Micro</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-ei" value="ei" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-ei" class="text-sm"><span class="regime-badge ir">IR</span> EI</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-eurl" value="eurl" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-eurl" class="text-sm"><span class="regime-badge ir">IR</span> EURL-IR</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-snc" value="snc" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-snc" class="text-sm"><span class="regime-badge ir">IR</span> SNC</label></div>
        <div class="flex items-center"><input type="checkbox" id="status-sci" value="sci" class="status-checkbox mr-2 h-4 w-4 text-green-400"><label for="status-sci" class="text-sm"><span class="regime-badge ir">IR</span> SCI</label></div>
      </div>
    </div>
  </div>
</div>
      `;

      // Insertion sans doublons
      try {
        const compareButton = simulatorContainer.querySelector('#sim-compare-btn');
        if (compareButton) {
          const compareButtonWrapper = compareButton.closest('.col-span-1, .col-span-2');
          if (compareButtonWrapper && formContainer.contains(compareButtonWrapper)) {
            formContainer.insertBefore(optionsRow, compareButtonWrapper);
          } else {
            formContainer.appendChild(optionsRow);
          }
        } else {
          formContainer.appendChild(optionsRow);
        }
      } catch (error) {
        console.error("Erreur lors de l'insertion des options:", error);
        formContainer.appendChild(optionsRow);
      }

      // Événements filtres
      const statusFilter = document.getElementById('sim-status-filter');
      statusFilter.addEventListener('change', function () {
        const isCustom = this.value === 'custom';
        document.getElementById('custom-status-options').style.display = isCustom ? 'block' : 'none';

        if (!isCustom) {
          const selectedStatuses = getSelectedStatuses(this.value);
          document.querySelectorAll('.status-checkbox').forEach(checkbox => {
            checkbox.checked = selectedStatuses.includes(checkbox.value);
          });
        }

        document.querySelectorAll('.status-filter-btn').forEach(btn => {
          const filter = btn.getAttribute('data-filter');
          if (filter === this.value) {
            btn.classList.remove('bg-blue-800', 'text-white');
            btn.classList.add('bg-green-500', 'text-gray-900', 'font-medium');
          } else {
            btn.classList.remove('bg-green-500', 'text-gray-900', 'font-medium');
            btn.classList.add('bg-blue-800', 'text-white');
          }
        });

        runComparison();
      });

      document.querySelectorAll('.status-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.status-filter-btn').forEach(b => {
            b.classList.remove('bg-green-500', 'text-gray-900', 'font-medium');
            b.classList.add('bg-blue-800', 'text-white');
          });
          this.classList.remove('bg-blue-800', 'text-white');
          this.classList.add('bg-green-500', 'text-gray-900', 'font-medium');

          const filter = this.getAttribute('data-filter');
          statusFilter.value = filter;

          const isCustom = filter === 'custom';
          document.getElementById('custom-status-options').style.display = isCustom ? 'block' : 'none';

          if (!isCustom) {
            const selectedStatuses = getSelectedStatuses(filter);
            document.querySelectorAll('.status-checkbox').forEach(checkbox => {
              checkbox.checked = selectedStatuses.includes(checkbox.value);
            });
          }

          runComparison();
        });
      });

      // 🔗 Abonnements : inclut les 2 nouveaux champs IS
      document.querySelectorAll('.status-checkbox, #use-optimal-ratio, #use-avg-charge-rate, #micro-type, #micro-vfl, #sarl-gerant-minoritaire, #is-capital-fully-paid, #is-pp-ownership')
        .forEach(el => el.addEventListener('change', runComparison));

      // (optionnel) déclenche aussi sur saisie continue du % personnes physiques
      document.getElementById('is-pp-ownership')?.addEventListener('input', runComparison);

      statusFilter.value = "all";
      statusFilter.dispatchEvent(new Event('change'));
    }
  }
}


// Fonction pour obtenir les statuts sélectionnés selon le filtre
function getSelectedStatuses(filter) {
    switch(filter) {
        case 'common':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sasu'];
        case 'all':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc', 'sci', 'selarl', 'selas', 'sca'];
        case 'is_only':
            return ['eurlIS', 'sasu', 'sarl', 'sas', 'sa', 'selarl', 'selas', 'sca'];
        case 'ir_only':
            return ['micro', 'ei', 'eurl', 'snc', 'sci'];
        case 'commercial':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc'];
        case 'liberal':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'selarl', 'selas'];
        case 'custom':
            // Récupérer les statuts cochés
            return Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value);
        default:
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc', 'sci', 'selarl', 'selas', 'sca']; // Par défaut, tous les statuts
    }
}

function runComparison() {
  // Récupérer les valeurs du formulaire
  const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
  const marge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
  const _rawRatio = parseFloat(document.getElementById('sim-salaire').value);
  const ratioSalaire = Number.isFinite(_rawRatio) ? Math.max(0, Math.min(1, _rawRatio / 100)) : 0.7;
  const tmi = parseFloat(document.getElementById('sim-tmi').value) || 30;
  const nbAssocies = parseInt(document.getElementById('sim-nb-associes')?.value) || 1;
  const partAssociePct = parseFloat(document.getElementById('sim-part-associe')?.value) || 100;
  const partAssocie = partAssociePct / 100;

  // Récupérer les options sectorielles actuelles
  const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
  const tailleSelect  = document.querySelector('#taille-select,  [id$="taille-select"]');
  if (secteurSelect && tailleSelect) {
    window.sectorOptions = { secteur: secteurSelect.value, taille: tailleSelect.value };
    console.log("runComparison: Options sectorielles utilisées:", window.sectorOptions);
  }

  // Récupérer les options avancées
  const modeExpert = true; // Toujours activer le mode expert
  const useOptimalRatio     = document.getElementById('use-optimal-ratio')?.checked;
  const useAvgChargeRate    = document.getElementById('use-avg-charge-rate')?.checked;
  const versementLiberatoire= document.getElementById('micro-vfl')?.checked;
  const gerantMajoritaire   = !(document.getElementById('sarl-gerant-minoritaire')?.checked);

  // 🔹 LIRE Capital / Primes / CCA (base 10 % TNS) - FIX: utiliser dataset.raw
  const capitalLibere   = Number(document.getElementById('base-capital')?.dataset.raw)  || 0;
  const primesEmission  = Number(document.getElementById('base-primes')?.dataset.raw)   || 0;
  const comptesCourants = Number(document.getElementById('base-cca')?.dataset.raw)      || 0;
  // Base unique utilisée partout (alimentée par updateBase10)
  const baseSeuilDivTNS = Number(document.getElementById('base10-total')?.value) || 0;

  // Définir marge ou frais de façon exclusive selon l'option
  const params = {
    ca,
    tauxMarge: useAvgChargeRate ? undefined : marge,
    tauxFrais: useAvgChargeRate ? (1 - marge) : undefined,
    tauxRemuneration: ratioSalaire,
    tmiActuel: tmi,
    modeExpert,
    gerantMajoritaire,
    secteur: window.sectorOptions?.secteur,
    taille:   window.sectorOptions?.taille,
    nbAssocies,
    partAssocie,
    partAssociePrincipal: partAssocie, // compat
    partAssociePct,

    // 🔹 NOUVEAUX CHAMPS POUR LE MOTEUR
    capitalLibere,
    primesEmission,
    comptesCourants,
    baseSeuilDivTNS,
  };

  // 🔸 Éligibilité IS 15 % — AJOUT
  // Juste après avoir construit params :
  const capitalFullyPaid = !!document.getElementById('is-capital-fully-paid')?.checked;
  const pctPP = Number(document.getElementById('is-pp-ownership')?.value) || 0;

  params.is15Eligible = isEligibleIS15({
    ca,
    capitalIntegralementLibere: capitalFullyPaid,
    pctDetentionPersPhysiques: pctPP
  });
  // 🔸 Fin ajout

  // Logger pour debug
  console.log("Paramètres:", params);
  console.log("useAvgChargeRate:", useAvgChargeRate);
  console.log("versementLiberatoire:", versementLiberatoire);
  console.log("gerantMajoritaire:", gerantMajoritaire);

  const resultsBody = document.getElementById('sim-results-body');
  if (!resultsBody) return;

  // Vider les résultats précédents
  resultsBody.innerHTML = '';

  // Obtenir les statuts à simuler selon le filtre sélectionné
  const statusFilter = document.getElementById('sim-status-filter');

  // utiliser let car on va potentiellement réassigner
  let selectedStatuses = getSelectedStatuses(statusFilter ? statusFilter.value : 'all');

  // Si multi-associés, retirer les statuts unipersonnels
  if (nbAssocies >= 2) {
    selectedStatuses = selectedStatuses.filter(id => !STATUTS_UNIPERSONNELS[id]);
  }
  // Si 1 seul associé, retirer les statuts qui exigent ≥2 associés
  else if (nbAssocies === 1) {
    selectedStatuses = selectedStatuses.filter(id => !STATUTS_MIN_2[id]);
  }
    
    // Tableau pour stocker les résultats de simulation
    const resultats = [];
    window.currentSimulationResults = resultats;
    
    // Association icônes pour les statuts
    const statutIcons = {
        'micro': '<i class="fas fa-store-alt text-green-400 status-icon"></i>',
        'ei': '<i class="fas fa-user text-green-400 status-icon"></i>',
        'eurl': '<i class="fas fa-user-tie text-green-400 status-icon"></i>',
        'eurlIS': '<i class="fas fa-building text-blue-400 status-icon"></i>',
        'sasu': '<i class="fas fa-user-shield text-blue-400 status-icon"></i>',
        'sarl': '<i class="fas fa-users text-blue-400 status-icon"></i>',
        'sas': '<i class="fas fa-building text-blue-400 status-icon"></i>',
        'sa': '<i class="fas fa-landmark text-blue-400 status-icon"></i>',
        'snc': '<i class="fas fa-handshake text-green-400 status-icon"></i>',
        'sci': '<i class="fas fa-home text-green-400 status-icon"></i>',
        'selarl': '<i class="fas fa-user-md text-blue-400 status-icon"></i>',
        'selas': '<i class="fas fa-stethoscope text-blue-400 status-icon"></i>',
        'sca': '<i class="fas fa-chart-line text-blue-400 status-icon"></i>'
    };
    
    // Badge régime fiscal
    const regimeBadges = {
        'micro': '<span class="regime-badge ir">IR</span>',
        'ei': '<span class="regime-badge ir">IR</span>',
        'eurl': '<span class="regime-badge ir">IR</span>',
        'eurlIS': '<span class="regime-badge is">IS</span>',
        'sasu': '<span class="regime-badge is">IS</span>',
        'sarl': '<span class="regime-badge is">IS</span>',
        'sas': '<span class="regime-badge is">IS</span>',
        'sa': '<span class="regime-badge is">IS</span>',
        'snc': '<span class="regime-badge ir">IR</span>',
        'sci': '<span class="regime-badge ir">IR</span>',
        'selarl': '<span class="regime-badge is">IS</span>',
        'selas': '<span class="regime-badge is">IS</span>',
        'sca': '<span class="regime-badge is">IS</span>'
    };
    
    // Définir les stratégies d'optimisation par type de statut
    const optimisationParStatut = {
        // Structures assimilées salarié: charges lourdes (favoriser dividendes)
        'sasu':  { ratioMin: 0,    ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0,    capitalSocial: 1000 },
        'sas':   { ratioMin: 0,    ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0,    capitalSocial: 1000 },
        'sa':    { ratioMin: 0,    ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0,    capitalSocial: 37000 },
        'selas': { ratioMin: 0,    ratioMax: 1, favoriserDividendes: true, minRatioForFiscal: 0,    capitalSocial: 37000 },
        
        // Structures TNS: charges sociales sur dividendes >10% du capital (équilibre)
        'eurlIS': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 1 },
        'sarl': { ratioMin: 0.6, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.6, capitalSocial: 1 },
        'selarl': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 1 },
        'sca': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 37000 },
        
        // Structures sans distinction rémunération/dividendes (pas d'optimisation)
        'micro': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 },
        'ei': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 },
        'eurl': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 1 },
        'snc': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 },
        'sci': { ratioMin: 1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 1, capitalSocial: 0 }
    };
    
    // Associer chaque statut à sa fonction de simulation et son nom d'affichage
    const statutsComplets = {
        'micro': { 
            nom: 'Micro-entreprise', 
            simuler: () => window.SimulationsFiscales.simulerMicroEntreprise({
                ca: ca,
                typeMicro: document.getElementById('micro-type').value,
                tmiActuel: tmi,
                modeExpert: modeExpert,
                versementLiberatoire: versementLiberatoire
            })
        },
        'ei': { 
            nom: 'Entreprise Individuelle', 
            simuler: () => window.SimulationsFiscales.simulerEI({
                ...params,
                ca: ca,
                tmiActuel: tmi
            })
        },
        'eurl': { 
            nom: 'EURL à l\'IR', 
            simuler: () => window.SimulationsFiscales.simulerEURL({
                ...params,
                ca: ca,
                tauxRemuneration: ratioSalaire,
                optionIS: false,
                tmiActuel: tmi
            })
        },
        'eurlIS': { 
            nom: 'EURL à l\'IS', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['eurlIS'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerEURL({...p, optionIS: true})
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerEURL({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    optionIS: true,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sasu': { 
            nom: 'SASU', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sasu'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSASU(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSASU({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sarl': { 
            nom: 'SARL', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sarl'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSARL({...p, gerantMajoritaire: gerantMajoritaire})
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSARL({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    gerantMajoritaire: gerantMajoritaire
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sas': { 
            nom: 'SAS', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sas'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSAS(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSAS({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sa': { 
            nom: 'SA', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sa'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSA(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSA({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    capitalInvesti: 37000 // Minimum légal
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'snc': { 
            nom: 'SNC', 
            simuler: () => {
                console.log("Paramètres SNC:", {...params, ca: ca, tmiActuel: tmi});
                return window.SimulationsFiscales.simulerSNC({
                    ...params,
                    ca: ca,
                    tmiActuel: tmi
                });
            }
        },
        'sci': { 
            nom: 'SCI', 
            simuler: () => {
                console.log("Paramètres SCI:", {...params, revenuLocatif: ca, tmiActuel: tmi});
                return window.SimulationsFiscales.simulerSCI({
                    ...params,
                    revenuLocatif: ca,
                    tmiActuel: tmi
                });
            }
        },
        'selarl': { 
            nom: 'SELARL', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['selarl'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSELARL(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSELARL({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'selas': { 
            nom: 'SELAS', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['selas'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSELAS(p)
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSELAS({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        },
        'sca': { 
            nom: 'SCA', 
            simuler: () => {
                // Calculer avec optimisation (mais sans forcément l'utiliser)
                const config = optimisationParStatut['sca'];
                
                // Toujours calculer le ratio optimal pour l'afficher comme indicateur
                const optimisation = window.FiscalUtils.optimiserRatioRemuneration(
                    { ...params, 
                      ratioMin: config.ratioMin, 
                      ratioMax: config.ratioMax, 
                      favoriserDividendes: config.favoriserDividendes,
                      capitalSocial: config.capitalSocial
                    },
                    (p) => window.SimulationsFiscales.simulerSCA({...p, capitalInvesti: 37000})
                );
                
                // Si optimisation activée, utiliser le résultat optimisé
                if (useOptimalRatio) {
                    return optimisation.resultat;
                }
                
                // Sinon, utiliser le ratio manuel mais conserver l'info du ratio optimal
                const resultat = window.SimulationsFiscales.simulerSCA({
                    ...params,
                    ca: ca,
                    tauxRemuneration: ratioSalaire,
                    tmiActuel: tmi,
                    capitalInvesti: 37000 // Minimum légal
                });
                
                // Ajouter l'information du ratio optimal comme référence
                resultat.ratioOptimise = optimisation.resultat.ratioOptimise;
                
                return resultat;
            }
        }
    };
    
// Simuler chaque statut sélectionné
for (const statutId of selectedStatuses) {
  if (statutsComplets[statutId]) {
    try {
      const statut = statutsComplets[statutId];
      const sim = statut.simuler();

      // ----- Calcul IS par tranches pour les statuts à l’IS -----
      {
        const isStatutIS = ['eurlIS','sarl','selarl','sca','sasu','sas','sa','selas'].includes(statutId);
        if (isStatutIS && sim && sim.compatible) {
          // Bénéfice base IS = résultat après rémunération et charges sociales (avant IS)
          const benefIS = Number(sim.resultatApresRemuneration ?? sim.resultatEntreprise ?? 0);

          // Éligible 15% ?
          const elig15 = !!params.is15Eligible;

          // Calcul par tranches (15% jusqu'à 42 500 si éligible, 25% au-delà)
          const isBreak = calcISProgressif(benefIS, elig15);

          // Remplace/fiabilise les champs IS de la simulation
          sim.is = isBreak.is;
          sim._isDetail = { elig15, ...isBreak };

          // Mets à jour l'après-IS et, si besoin, les dividendes bruts
          sim.resultatApresIS = round2(Math.max(0, benefIS - sim.is));
          if (typeof sim.dividendes === 'number') {
            // si ton moteur ne recalculait pas, force la cohérence
            sim.dividendes = sim.resultatApresIS * (sim.partAssocie || 1);
          }
        }
      }
      // ----- fin calcul IS par tranches -----

      // === IR sur la rémunération (base imposable + barème progressif) ===
      (() => {
        // 1) Trouver les deux infos nécessaires
        const brut       = Number(sim.remuneration) || 0;                                   // salaire/remu brut
        const netSocial  = Number(sim.remunerationNetteSociale ?? sim.salaireNet) || 0;     // net "URSSAF"/net paie
        sim.remunerationNetteSociale = netSocial;

        if (brut > 0 && netSocial > 0) {
          // 2) Construire la base imposable (CSG non déductible + abattement 10% borné)
          const { base, csgND, abat } = baseImposableTNS({ remBrute: brut, netSocial: netSocial });
          sim.csgNonDeductible = csgND;
          sim.abattement10     = abat;
          sim.baseImposableIR  = base;

          // 3) Nombre de parts (si tu as un input ; sinon 1)
          const nbParts = getNbParts();

          // 4) Calcul IR + TMI
          sim.impotRevenu   = impotsIR2025(sim.baseImposableIR, nbParts);
          sim.tmiEffectif   = getTMI(sim.baseImposableIR, nbParts);

          // 5) Salaire net après IR + net total
          sim.revenuNetSalaire = Math.max(0, netSocial - sim.impotRevenu);

          // Si tu as des dividendes nets déjà calculés, cumule pour afficher un "net total"
          const dividendesNets = Number(sim.dividendesNets) || 0;
          sim.revenuNetTotal   = (sim.revenuNetSalaire || 0) + dividendesNets;
        } else {
          // Pas de rémunération (ou incomplète) -> neutraliser proprement
          sim.csgNonDeductible = sim.csgNonDeductible ?? 0;
          sim.abattement10     = sim.abattement10 ?? 0;
          sim.baseImposableIR  = sim.baseImposableIR ?? 0;
          sim.impotRevenu      = sim.impotRevenu ?? 0;
          sim.tmiEffectif      = sim.tmiEffectif ?? 0;
          sim.revenuNetSalaire = sim.revenuNetSalaire ?? 0;
          sim.revenuNetTotal   = sim.revenuNetTotal ?? (Number(sim.dividendesNets) || 0);
        }
      })();

      // Debug pour vérifier que les paramètres sont bien passés
      console.log(`Simulation ${statutId}:`, sim);

      // --- Post-traitement d'équation + UX dividendes (après simuler) ---
      if (sim && sim.compatible) {
        const resultatAvantRem = round2(
          sim.resultatAvantRemuneration
          ?? sim.resultatEntreprise
          ?? sim.beneficeAvantCotisations
          ?? 0
        );

        // TNS (EURL-IS, SARL, SELARL, SCA) → absorber l’écart dans les cotisations sociales
        if (['eurlIS','sarl','selarl','sca'].includes(statutId)) {
          const brut = Number(sim.remuneration) || 0;
          const cot  = Number(sim.cotisationsSociales) || 0;
          const { brut: b, cotisations: c, reste } = closeEquation(brut, cot, resultatAvantRem);
          if (reste === 0) {
            sim.remuneration = b;
            sim.cotisationsSociales = c;
            sim.resultatApresRemuneration = 0;
            if (sim.dividendes && Math.abs(sim.dividendes) < 5) {
              sim.dividendes = 0; sim.prelevementForfaitaire = 0; sim.dividendesNets = 0;
            }
          }
        }

        // Assimilé salarié (SASU, SAS, SA, SELAS) → absorber l’écart côté charges patronales
        if (['sasu','sas','sa','selas'].includes(statutId)) {
          const brut   = Number(sim.remuneration) || 0;
          const chPat  = Number(sim.chargesPatronales) || 0;
          const chSal  = Number(sim.chargesSalariales) || 0;
          const { brut: b, cotisations: totalCharges, reste } = closeEquation(brut, chPat + chSal, resultatAvantRem);
          if (reste === 0) {
            const delta = round2(totalCharges - (chPat + chSal));
            sim.remuneration = b;
            sim.chargesPatronales = round2(chPat + delta); // on ajuste côté employeur
            sim.resultatApresRemuneration = 0;
            if (sim.dividendes && Math.abs(sim.dividendes) < 5) {
              sim.dividendes = 0; sim.prelevementForfaitaire = 0; sim.dividendesNets = 0;
            }
          }
        }

        // IR “purs” (EI, EURL-IR, SNC) si une rémunération est modélisée
        if (['ei','eurl','snc'].includes(statutId) && sim.remuneration) {
          const brut = Number(sim.remuneration) || 0;
          const cot  = Number(sim.cotisationsSociales) || 0;
          const { brut: b, cotisations: c, reste } = closeEquation(brut, cot, resultatAvantRem);
          if (reste === 0) {
            sim.remuneration = b;
            sim.cotisationsSociales = c;
          }
        }
      }
      // --- fin post-traitement ---

      // Si incompatible, afficher un message
      if (!sim.compatible) {
        resultats.push({
          statutId: statutId,
          statut: statut.nom,
          brut: '-',
          charges: '-',
          impots: '-',
          net: `<span class="text-red-400">${sim.message || 'Incompatible'}</span>`,
          sim: sim,
          score: 0
        });
        continue;
      }

      // Déterminer les montants à afficher selon le type de statut
      let brut, charges, impots, net;

      // Ces valeurs varient selon le type de statut
      if (statutId === 'micro') {
        brut = sim.ca;
        charges = sim.cotisationsSociales + (sim.cfp || 0) + (sim.cfe || 0);
        impots = sim.impotRevenu;
        net = sim.revenuNetApresImpot;

      } else if (statutId === 'ei') {
        brut = sim.beneficeAvantCotisations;
        charges = sim.cotisationsSociales;
        impots = sim.impotRevenu;
        net = sim.revenuNetApresImpot;

      } else if (statutId === 'eurl' && !sim.is) {
        brut = sim.beneficeImposable + sim.cotisationsSociales;
        charges = sim.cotisationsSociales;
        impots = sim.impotRevenu;
        net = sim.revenuNetApresImpot;

      } else if (statutId === 'snc') {
        brut = sim.beneficeAssociePrincipal;
        charges = sim.cotisationsSociales;
        impots = sim.impotRevenu;
        net = sim.revenuNetApresImpot;

      } else if (statutId === 'sci') {
        // SCI est un cas particulier
        brut = sim.resultatFiscalAssocie;
        charges = sim.prelevementsSociaux || 0;
        impots = sim.impotRevenu;
        net = sim.revenuNetApresImpot;

       } else {
// Cas général pour les statuts à l'IS (SASU, EURL-IS, SAS, SARL, SELARL, SELAS, SA, SCA)
brut = sim.remuneration || sim.resultatEntreprise * (useOptimalRatio ? sim.ratioOptimise : ratioSalaire);
charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);

// ⚠️ Dividendes TNS : uniquement pour SARL/EURL-IS/SELARL/SCA avec gérant majoritaire
const isTNSDiv = ['sarl','eurlIS','selarl','sca'].includes(statutId) && gerantMajoritaire;
const divBruts = Number(sim.dividendes) || 0;
const base10   = Number(document.getElementById('base10-total')?.value) || getBaseSeuilDivTNS(sim) || 0;

let split = null;
if (isTNSDiv && divBruts > 0 && typeof calcDivTNS === 'function') {
  // bornage 0.40–0.45 si on observe quelque chose de cohérent, sinon 0.40
  const tauxObserve = (sim.remuneration > 0 && sim.cotisationsSociales > 0)
    ? (sim.cotisationsSociales / sim.remuneration)
    : null;
  const tauxTNS = (tauxObserve != null)
    ? Math.max(0.40, Math.min(0.45, tauxObserve))
    : TAUX_TNS_DIV_FALLBACK;

  split = calcDivTNS({
    divBruts: divBruts,
    baseSeuil10: base10,     // ← utilise la base saisie (capital + primes + CCA)
    methode: (sim.methodeDividendes === 'PROGRESSIF') ? 'PROGRESSIF' : 'PFU',
    tmi: tmi,
    tauxTNS
  });

  // ✅ PERSISTE LE SPLIT POUR L’AFFICHEUR DE DÉTAILS
  sim._divSplit              = split; // { partPS, partTNS, ps172, cotTNS, irDiv, totalPrels, nets }
  sim.prelevementForfaitaire = split.irDiv + split.ps172; // IR dividendes + PS (≤10%)
  sim.cotTNSDiv              = split.cotTNS;              // cotisations TNS (>10%)
  sim.dividendesNets         = split.nets;

  // Impôts totaux sans double PS
  impots = (sim.impotRevenu || 0) + (sim.is || 0) + split.irDiv + split.ps172 + split.cotTNS;
} else {
  // Pas de TNS sur dividendes (ou pas de dividendes) : logique standard
  impots = (sim.impotRevenu || 0) + (sim.is || 0) + (sim.prelevementForfaitaire || 0);
  if (sim.cotTNSDiv) impots += sim.cotTNSDiv;
}

// (4) Recomposition propre du net total + ratio (IS)
{
  const salaireApresIR = Number(sim.revenuNetSalaire) || 0; // net salarié après IR déjà calculé au-dessus
  const divNets        = Number(sim.dividendesNets)   || 0; // nets après PFU/barème + PS/TNS

  // Net total et ratio sur CA
  sim.revenuNetTotal = round2(salaireApresIR + divNets);
  sim.ratioNetCA     = ca > 0 ? round2((sim.revenuNetTotal / ca) * 100) : 0;

  // Propager vers la ligne du tableau
  net    = sim.revenuNetTotal;
  impots = (Number(sim.is) || 0) + (Number(sim.impotRevenu) || 0)
        + (Number(sim._divSplit?.irDiv) || 0)
        + (Number(sim._divSplit?.ps172) || 0)
        + (Number(sim._divSplit?.cotTNS) || 0);
}
        }


      // Calcul du score avec prise en compte de la progressivité fiscale
      const scoreNet = 100 * (net / ca); // Score standard

      // Coefficient d'évolutivité
      let coeffEvolution = 1;
      if (statutId === 'micro' && ca > 30000) {
        coeffEvolution = 0.95;
      } else if ((statutId === 'sasu' || statutId === 'sas' || statutId === 'selas') && ca > 80000) {
        coeffEvolution = 1.05;
      }

      // Score avec coefficient d'évolutivité
      const score = scoreNet * coeffEvolution;

      // Calculer la répartition rémunération/dividendes
      const ratioEffectif = useOptimalRatio && sim.ratioOptimise ? sim.ratioOptimise : ratioSalaire;

      // Déterminer si l'optimisation était active pour ce statut
      const optimisationActive = useOptimalRatio && sim.ratioOptimise !== undefined;

      // Astuce UX pour la colonne “Dividendes nets”
      const dividendesNetsAff = (sim.dividendesNets && Math.abs(sim.dividendesNets) >= 5) ? sim.dividendesNets : 0;

      resultats.push({
        statutId: statutId,
        statut: statut.nom,
        brut: brut,
        charges: charges,
        impots: impots,
        net: net,
        sim: sim,
        score: score,
        ratioOptimise: sim.ratioOptimise,
        dividendesNets: dividendesNetsAff,
        ratioEffectif: ratioEffectif,
        optimisationActive: optimisationActive
      });

    } catch (e) {
      console.error(`Erreur lors de la simulation pour ${statutsComplets[statutId].nom}:`, e);
      resultats.push({
        statutId: statutId,
        statut: statutsComplets[statutId].nom,
        brut: '-',
        charges: '-',
        impots: '-',
        net: `<span class="text-red-400">Erreur de calcul</span>`,
        score: 0
      });
    }
  }
}
    
    // Trier par net décroissant
    resultats.sort((a, b) => b.score - a.score);
    
    // Formater les nombres
    const formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Calculer la moyenne des scores pour les statuts compatibles
    const scoresCompatibles = resultats.filter(r => r.score > 0).map(r => r.score);
    const scoresMoyen = scoresCompatibles.length > 0 
        ? scoresCompatibles.reduce((sum, score) => sum + score, 0) / scoresCompatibles.length 
        : 0;
    
    // Modifier l'en-tête du tableau - toujours inclure les dividendes et optimisation
    const tableHeader = document.querySelector('#sim-results thead tr');
    if (tableHeader) {
        tableHeader.innerHTML = `
        <th class="px-4 py-3 rounded-tl-lg">Statut</th>
        <th class="px-4 py-3">Rémunération brute</th>
        <th class="px-4 py-3">Charges sociales</th>
        <th class="px-4 py-3">Impôts</th>
        <th class="px-4 py-3">Dividendes nets</th>
        <th class="px-4 py-3">Méthode fiscale</th>
        <th class="px-4 py-3">Ratio optimal</th>
        <th class="px-4 py-3 rounded-tr-lg">Net en poche</th>
    `;
    }
    
    // Afficher les résultats dans le tableau
    resultats.forEach((res, index) => {
        const isTopResult = index === 0;
        
        const row = document.createElement('tr');
        row.className = isTopResult 
            ? 'result-top-row' 
            : (index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '');
        
        // Valeur d'optimisation du ratio
        let optimisationValue = "";
        if (res.ratioOptimise) {
            const ratioDisplay = Math.round(res.ratioOptimise*100);
            const isMicroOrEI = res.statutId === 'micro' || res.statutId === 'ei' || res.statutId === 'eurl' || res.statutId === 'snc' || res.statutId === 'sci';
            
            if (useOptimalRatio && !isMicroOrEI) {
                optimisationValue = `<span class="ratio-optimal-value">${ratioDisplay}% rém.</span>`;
            } else if (isMicroOrEI) {
                optimisationValue = "N/A";
            } else {
                const ratioManuel = Math.round(ratioSalaire*100); 
                optimisationValue = `${ratioDisplay}% <small>(${ratioManuel}% manuel)</small>`;
            }
        } else {
            optimisationValue = `${Math.round(ratioSalaire*100)}% (manuel)`;
        }
        
        // Format avec dividendes et optimisation
row.innerHTML = `
    <td class="px-4 py-3 font-medium">
        ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
        ${statutIcons[res.statutId] || ''} ${res.statut} ${regimeBadges[res.statutId] || ''}
    </td>
   <td class="px-4 py-3">${(res.brut === '-' || res.brut == null) ? '-' : formatter.format(res.brut)}</td>
    <td class="px-4 py-3">${(res.charges === '-' || res.charges == null) ? '-' : formatter.format(res.charges)}</td>
    <td class="px-4 py-3">${res.impots === '-' ? '-' : formatter.format(res.impots)}</td>
    <td class="px-4 py-3">${res.dividendesNets ? formatter.format(res.dividendesNets) : '-'}</td>
   <td class="px-4 py-3">
  ${res.sim.methodeDividendes ? 
    (res.sim.methodeDividendes === 'PROGRESSIF' ? 
      '<span class="text-green-400 text-xs">Barème <i class="fas fa-check-circle ml-1"></i></span>' : 
      '<span class="text-blue-400 text-xs">PFU 30%</span>') 
    : '-'}
  ${res.sim.economieMethode > 0 ? 
    `<div class="text-xs text-gray-400">+${formatter.format(res.sim.economieMethode)}</div>` 
    : ''}
  ${res.sim.methodeDividendes === 'PROGRESSIF' && res.sim.economieMethode > 0
    ? '<div class="text-[10px] text-gray-400 italic">Option barème = globale</div>'
    : ''}
</td>
    <td class="px-4 py-3">${optimisationValue}</td>
    <td class="px-4 py-3">
        <span class="net-value ${isTopResult ? 'top' : ''} cursor-pointer show-detail-btn" data-statut="${res.statutId}">
            ${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}
        </span>
        ${isTopResult ? 
        '<div class="text-xs text-green-400 mt-1"><i class="fas fa-check-circle mr-1"></i>Optimal pour ce CA</div>' : ''}
        <div class="text-xs text-blue-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Cliquez pour détails</div>
    </td>
`;

resultsBody.appendChild(row);
    });
    
// Ajouter une ligne de mode de calcul avec état de l'optimisation
const modeRow = document.createElement('tr');
modeRow.className = 'bg-pink-900 bg-opacity-20 text-sm border-t border-pink-800';

modeRow.innerHTML = `
    <td colspan="8" class="px-4 py-2 font-medium text-pink-300">
        <i class="fas fa-calculator mr-2"></i> 
        Calculs fiscaux précis : IR progressif par tranches + ${useOptimalRatio ? 'optimisation automatique' : 'ratio manuel'} du ratio rémunération/dividendes
        <span class="ml-2 text-xs text-gray-400">(Conforme au barème 2025)</span>
        ${useAvgChargeRate ? '<span class="ml-3"><i class="fas fa-receipt mr-1"></i>Frais réels activés</span>' : ''}
        ${versementLiberatoire ? '<span class="ml-3"><i class="fas fa-percentage mr-1"></i>VFL micro-entreprise</span>' : ''}
    </td>
`;
    
    resultsBody.appendChild(modeRow);
    
    // Ajouter ligne de ratio net/brut pour les statuts compatibles
   const ratioRow = document.createElement('tr');
ratioRow.className = 'ratio-row';

ratioRow.innerHTML = `
    <td class="px-4 py-2 italic" colspan="7">Ratio net/CA</td>
    <td class="px-4 py-2 font-medium">
        ${scoresCompatibles.length > 0 
            ? `${resultats[0].score.toFixed(1)}% (max) / ${scoresMoyen.toFixed(1)}% (moy)` 
            : 'N/A'}
    </td>
`;

resultsBody.appendChild(ratioRow);
    
    // Ajouter avertissement sur les limites de la simulation
    const warningRow = document.createElement('tr');
    warningRow.className = 'bg-blue-900 bg-opacity-30 text-xs border-t border-blue-800';
    
   warningRow.innerHTML = `
    <td colspan="8" class="px-4 py-3">
        <div class="flex items-start">
            <i class="fas fa-info-circle text-blue-400 mr-2 mt-0.5"></i>
            <div>
                <strong class="text-blue-400">Note sur les limites de la simulation :</strong>
                <ul class="mt-1 space-y-1 text-gray-300">
                    <li>• Les statuts à l'IR (Micro, EI, EURL IR) permettent plus de déductions fiscales que ce qui est simulé ici.</li>
                    <li>• Dans le régime Micro, l'abattement forfaitaire peut être avantageux si vos charges réelles sont faibles.</li>
                    <li>• Pour les statuts à l'IS, certaines optimisations spécifiques ne sont pas prises en compte (épargne salariale, etc.).</li>
                </ul>
            </div>
        </div>
    </td>
`;
    
    resultsBody.appendChild(warningRow);
    
    // Ajouter les gestionnaires d'événements pour afficher les détails
    const detailButtons = document.querySelectorAll('.show-detail-btn');
    detailButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const statutId = this.getAttribute('data-statut');
            showCalculationDetails(statutId, resultats);
        });
    });
}

// NOUVEAU : Configuration des statuts multi-associés (à ajouter au début de fiscal-guide.js)
const STATUTS_MULTI_ASSOCIES = {
  'sci': true,
  'snc': true,
  'sarl': true,
  'sas': true,
  'sa': true,
  'selarl': true,
  'selas': true,
  'sca': true,
  // Les suivants sont unipersonnels
  'ei': false,
  'eurl': false,
  'eurlIS': false,
  'sasu': false,
  'micro': false
};

// Statuts non pertinents si nbAssocies >= 2 (à filtrer automatiquement)
const STATUTS_UNIPERSONNELS = {
  'micro': true,
  'ei': true,
  'eurl': true,
  'eurlIS': true,
  'sasu': true
};
// Statuts qui demandent au moins 2 associés (les variantes 1 associé existent sous d'autres formes : EURL, SASU, …)
const STATUTS_MIN_2 = {
  'sarl':   true,
  'sas':    true,
  'sa':     true,
  'snc':    true,
  'sci':    true,
  'selarl': true,
  'selas':  true,
  'sca':    true
};

function updateCustomStatusDisabling() {
  const nbAssocies = parseInt(document.getElementById('sim-nb-associes')?.value) || 1;
  const customBoxEls = document.querySelectorAll('#custom-status-options .status-checkbox');

  customBoxEls.forEach(cb => {
    const id = cb.value;
    const isUni  = !!STATUTS_UNIPERSONNELS[id]; // à masquer si nb ≥ 2
    const isMin2 = !!STATUTS_MIN_2[id];         // à masquer si nb = 1

    let mustDisable = false;
    if (nbAssocies >= 2 && isUni)  mustDisable = true;
    if (nbAssocies === 1 && isMin2) mustDisable = true;

    cb.disabled = mustDisable;
    if (mustDisable) {
      cb.checked = false;
      cb.closest('.flex.items-center')?.classList.add('opacity-50','pointer-events-none');
    } else {
      cb.closest('.flex.items-center')?.classList.remove('opacity-50','pointer-events-none');
    }
  });
}
// 1) Montant d'IR 2025 (progressif) – avec quotient familial
function impotsIR2025(baseImposable, nbParts = 1) {
  const T = [
    { min: 0,      max: 11497,  taux: 0.00 },
    { min: 11497,  max: 29315,  taux: 0.11 },
    { min: 29315,  max: 83823,  taux: 0.30 },
    { min: 83823,  max: 180294, taux: 0.41 },
    { min: 180294, max: Infinity, taux: 0.45 },
  ];
  const parts = Math.max(1, nbParts);
  const qf = Math.max(0, baseImposable) / parts; // revenu par part
  let impotsPart = 0;
  for (const tr of T) {
    const assiette = Math.min(qf, tr.max) - tr.min;
    if (assiette > 0) impotsPart += assiette * tr.taux;
    if (qf <= tr.max) break;
  }
  return Math.round(impotsPart * parts);
}
// Barème IR 2025 - Fonction utilitaire pour calculer le TMI effectif
function getTMI(revenu, nbParts = 1) {
  const part = Math.max(0, revenu) / Math.max(1, nbParts);
  if (part <= 11497)   return 0;
  if (part <= 29315)   return 11;
  if (part <= 83823)   return 30;
  if (part <= 180294)  return 41;
  return 45;
}
// --- PATCH seuil dividendes TNS (inclut primes + CCA + quote-part) ---
function getBaseSeuilDivTNS(sim = {}) {
  const cap    = Number(sim.capitalLibere ?? sim.capital ?? 0);
  const primes = Number(sim.primesEmission ?? sim.primes ?? 0);
  const cca    = Number(sim.compteCourant ?? sim.comptesCourants ?? 0);

  // part associée : accepte partAssocie (0–1) ou partAssociePct (0–100)
  let part = (sim.partAssocie != null)
    ? Number(sim.partAssocie)
    : (sim.partAssociePct != null ? Number(sim.partAssociePct) / 100 : 1);

  if (!Number.isFinite(part)) part = 1;
  part = Math.min(1, Math.max(0, part));

  const base = cap + primes + cca;
  return Math.max(0, base * part);
}

function getSeuil10DivTNS(sim = {}) {
  return 0.10 * getBaseSeuilDivTNS(sim);
}

function formatBaseSeuilDivTNSTooltip(base) {
  return `
    <span class="info-tooltip">
      <i class="fas fa-question-circle text-gray-400"></i>
      <span class="tooltiptext">
        Seuil des 10% calculé sur :
        <br>capital libéré + primes d’émission + sommes en compte courant (× quote-part).
        <br><small>Si inconnu : application d’un taux TNS prudent (fallback).</small>
      </span>
    </span>`;
}

// Fonction améliorée pour afficher le détail des calculs avec pourcentages
function showCalculationDetails(statutId, simulationResults) {
  const nbParts = getNbParts();
    // Supprimer tout modal existant
    const existingModal = document.querySelector('.detail-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Trouver les résultats pour ce statut
    const result = simulationResults.find(r => r.statutId === statutId);
    if (!result) return;
    const optimisationActive = result.optimisationActive || false;
    
    // Formatter les nombres
    const formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Formatter les pourcentages
    const formatPercent = (value, decimals = 1) => {
        return `${value.toFixed(decimals)}%`;
    };
    /* === INSERT: libellé "IS 15%" pour l'affichage des détails === */
const isD = result?.sim?._isDetail;
const txtIS = isD
  ? (isD.elig15
      ? `15% sur ${formatter.format(isD.part15)} puis 25% sur ${formatter.format(isD.part25)}`
      : `25% (non éligible au taux réduit)`)
  : (result?.sim?.is ? '25%' : '—');
    // Créer le modal
    const modal = document.createElement('div');
    modal.className = 'detail-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.8);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow-y: auto;
        padding: 20px;
    `;
    
    // Adapter l'affichage en fonction du statut juridique
    let detailContent = '';
    
if (statutId === 'micro') {
    // Récupérer le type de micro et les taux associés
    const typeMicro = result.sim.typeMicro || 'BIC_SERVICE';
    const revenuImposable = result.sim.revenuImposable || 0;
    const versementLiberatoire = result.sim.versementLiberatoire || false;
    
    // NOUVEAU : Calculer le TMI effectif SEULEMENT si pas de versement libératoire
    const tmiEffectif = versementLiberatoire ? null : getTMI(revenuImposable, nbParts);
    
    const tauxCotisations = {
        'BIC_VENTE': 12.3,
        'BIC_SERVICE': 21.2,
        'BNC': 24.6
    };
    const tauxAbattement = {
        'BIC_VENTE': 71,
        'BIC_SERVICE': 50,
        'BNC': 34
    };
    const tauxVFL = {
        'BIC_VENTE': 1,
        'BIC_SERVICE': 1.7,
        'BNC': 2.2
    };
    
    detailContent = `
        <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - Micro-entreprise</h2>
        
        <div class="detail-category">Données de base</div>
        <table class="detail-table">
            <tr>
                <td>Chiffre d'affaires</td>
                <td>${formatter.format(result.sim.ca)}</td>
            </tr>
            <tr>
                <td>Type de micro-entreprise</td>
                <td>${result.sim.typeMicro || 'BIC'}</td>
            </tr>
            <tr>
                <td>Abattement forfaitaire (${formatPercent(tauxAbattement[typeMicro])})</td>
                <td>${formatter.format(result.sim.ca * tauxAbattement[typeMicro] / 100)}</td>
            </tr>
            <tr>
                <td>Versement libératoire de l'IR</td>
                <td>${versementLiberatoire ? 
                    `<span class="text-green-400">Activé (${formatPercent(tauxVFL[typeMicro])} du CA)</span>` : 
                    '<span class="text-gray-400">Non activé</span>'}</td>
            </tr>
        </table>
        
        <div class="detail-category">Charges sociales</div>
        <table class="detail-table">
            <tr>
                <td>Base de calcul</td>
                <td>${formatter.format(result.sim.ca)}</td>
            </tr>
            <tr>
                <td>Taux de cotisations sociales</td>
                <td>${formatPercent(tauxCotisations[typeMicro])}</td>
            </tr>
            <tr>
                <td>Montant des cotisations sociales</td>
                <td>${formatter.format(result.sim.cotisationsSociales)}</td>
            </tr>
            ${result.sim.cfp ? `<tr>
                <td>Contribution à la Formation Professionnelle (0.1% à 0.3%)</td>
                <td>${formatter.format(result.sim.cfp)}</td>
            </tr>` : ''}
            ${result.sim.cfe ? `<tr>
                <td>Cotisation Foncière des Entreprises (forfait)</td>
                <td>${formatter.format(result.sim.cfe)}</td>
            </tr>` : ''}
        </table>
        
        <div class="detail-category">Impôt sur le revenu</div>
        <table class="detail-table">
            ${versementLiberatoire ? `
                <tr>
                    <td>Versement libératoire de l'IR</td>
                    <td>${formatPercent(tauxVFL[typeMicro])} du CA</td>
                </tr>
                <tr>
                    <td>Montant du versement libératoire</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
                <tr>
                    <td colspan="2" class="text-xs text-gray-400 italic">
                        <i class="fas fa-info-circle mr-1"></i>
                        Avec le versement libératoire, l'IR est définitivement réglé. 
                        Le barème progressif ne s'applique pas.
                    </td>
                </tr>
            ` : `
                <tr>
                    <td>Revenu imposable après abattement (${formatPercent(100-tauxAbattement[typeMicro])} du CA)</td>
                    <td>${formatter.format(result.sim.revenuImposable)}</td>
                </tr>
                <tr>
                    <td>Tranche marginale d'imposition atteinte</td>
                    <td>${tmiEffectif}%</td>
                </tr>
                <tr>
                    <td>Impôt sur le revenu${result.sim.modeExpert ? ' (calcul progressif)' : ' (TMI appliquée)'}</td>
                    <td>${formatter.format(result.sim.impotRevenu)}</td>
                </tr>
            `}
        </table>
        
        ${versementLiberatoire ? `
        <div class="mt-4 p-3 bg-green-900 bg-opacity-20 rounded-lg text-sm border-l-4 border-green-400">
            <p><i class="fas fa-check-circle text-green-400 mr-2"></i>
            <strong>Versement libératoire activé :</strong> L'impôt est payé en même temps que les cotisations sociales, 
            au taux de ${formatPercent(tauxVFL[typeMicro])} du CA. Le revenu après abattement (${formatter.format(revenuImposable)}) 
            n'est pas soumis au barème progressif de l'IR.</p>
        </div>
        ` : ''}
        
        <div class="detail-category">Résultat final</div>
        <table class="detail-table">
            <tr>
                <td>Chiffre d'affaires</td>
                <td>${formatter.format(result.sim.ca)}</td>
            </tr>
            <tr>
                <td>- Cotisations sociales (${formatPercent(tauxCotisations[typeMicro])})</td>
                <td>${formatter.format(result.sim.cotisationsSociales)}</td>
            </tr>
            ${result.sim.cfp ? `<tr>
                <td>- CFP</td>
                <td>${formatter.format(result.sim.cfp)}</td>
            </tr>` : ''}
            ${result.sim.cfe ? `<tr>
                <td>- CFE</td>
                <td>${formatter.format(result.sim.cfe)}</td>
            </tr>` : ''}
            <tr>
                <td>- ${versementLiberatoire ? 'Versement libératoire' : 'Impôt sur le revenu'}</td>
                <td>${formatter.format(result.sim.impotRevenu)}</td>
            </tr>
            <tr>
                <td><strong>= Revenu net en poche</strong></td>
                <td><strong>${formatter.format(result.sim.revenuNetApresImpot)}</strong></td>
            </tr>
            <tr>
                <td>Ratio Net/CA</td>
                <td>${formatPercent(result.sim.ratioNetCA)}</td>
            </tr>
        </table>
        
        ${versementLiberatoire ? `
        <div class="mt-4 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-xs">
            <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
            <strong>Conditions du versement libératoire (2025) :</strong></p>
            <ul class="mt-1 ml-6 space-y-1">
                <li>• Revenu fiscal de référence N-2 < 28 797 € par part</li>
                <li>• Option à exercer lors de la création ou avant le 31/12 pour l'année suivante</li>
                <li>• Irrévocable pour l'année en cours</li>
            </ul>
        </div>
        ` : ''}
    `;
} else if (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa' || statutId === 'selas') {
    // Cas des structures avec dirigeant assimilé salarié
    
    // AJOUT : Fonction helper pour éviter les NaN
    const getNumber = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;
    
    const hasDividendes = result.sim.dividendes && result.sim.dividendes > 0;
    const salaireNet = result.sim.salaireNet || 0;
    
    // NOUVEAU : Récupérer la CSG non déductible et la base imposable
    const csgNonDeductible = getNumber(result.sim.csgNonDeductible);
    const baseImposableIR = getNumber(result.sim.baseImposableIR) || (salaireNet + csgNonDeductible);
    
    // NOUVEAU : Calculer le TMI effectif sur la BASE IMPOSABLE (pas le salaire net)
   const tmiEffectif = getTMI(baseImposableIR, nbParts);
    
  // Calcul des taux (robuste si rémunération = 0)
const {
  remuneration = 0,
  chargesPatronales = 0,
  chargesSalariales = 0,
  resultatApresRemuneration = 0
} = result.sim || {};

const tauxChargesPatronales = remuneration > 0
  ? (chargesPatronales / remuneration) * 100
  : 0;

const tauxChargesSalariales = remuneration > 0
  ? (chargesSalariales / remuneration) * 100
  : 0;

    
    // NOUVEAU : Gestion du CAC pour la SA
    const coutCAC = statutId === 'sa' ? (result.sim.coutCAC || 5000) : 0;
    
    detailContent = `
        <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>
        
        <div class="detail-category">Données de base</div>
        <table class="detail-table">
            <tr>
                <td>Chiffre d'affaires</td>
                <td>${formatter.format(result.sim.ca)}</td>
            </tr>
            <tr>
                <td>Résultat de l'entreprise (marge ${formatPercent((result.sim.resultatEntreprise/result.sim.ca)*100)})</td>
                <td>${formatter.format(result.sim.resultatEntreprise)}</td>
            </tr>
            <tr>
                <td>Ratio rémunération/dividendes ${optimisationActive ? '(optimisé)' : '(manuel)'}</td>
                <td>
                    ${formatPercent(result.ratioEffectif * 100)} / ${formatPercent(100 - result.ratioEffectif * 100)}
                    ${!optimisationActive && result.ratioOptimise ? 
                        `<small class="ml-2 text-gray-400">(optimum : ${formatPercent(result.ratioOptimise * 100)})</small>` 
                        : ''}
                </td>
            </tr>
        </table>

        ${/* NOUVEAU: Section associés pour SAS/SA/SELAS */ ''}
        ${STATUTS_MULTI_ASSOCIES[statutId] && result.sim.nbAssocies > 1 ? `
        <div class="detail-category">Répartition entre associés</div>
        <table class="detail-table">
            <tr>
                <td colspan="2" class="text-center text-sm text-green-400">
                    Simulation pour <strong>1 associé détenant ${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</strong>
                    (société à ${result.sim.nbAssocies} associés)
                </td>
            </tr>
            <tr>
                <td>Nombre total d'associés</td>
                <td>${result.sim.nbAssocies}</td>
            </tr>
            <tr>
                <td>Part de l'associé simulé</td>
                <td>${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</td>
            </tr>
            ${result.sim.dividendes > 0 ? `
            <tr>
                <td>Dividendes totaux de la société</td>
                <td>${formatter.format(
                    Math.round(result.sim.dividendes / (result.sim.partAssocie || 1))
                )}</td>
            </tr>
            <tr>
               <td>Quote-part de dividendes (${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))})</td>
                <td>${formatter.format(result.sim.dividendes)}</td>
            </tr>
            ` : ''}
      </table>

<div class="mt-3 p-3 bg-blue-900 bg-opacity-30 rounded-lg text-xs">
  ${(() => {
    const pct = (result.sim.partAssociePct != null)
      ? result.sim.partAssociePct
      : (result.sim.partAssocie * 100);
    const partDec = pct / 100;
    const inv = partDec > 0 ? (1 / partDec) : 0;
    return `<p><i class="fas fa-calculator text-blue-400 mr-2"></i>
      <strong>Note :</strong> Les montants affichés correspondent uniquement à la quote-part 
      de cet associé. Pour obtenir les résultats totaux de la société, divisez par ${partDec.toLocaleString('fr-FR',{maximumFractionDigits:2})}
      (ou multipliez par ${inv.toLocaleString('fr-FR',{maximumFractionDigits:2})}).</p>`;
  })()}
</div>
` : ''}


        ${/* NOUVEAU: Note pour SASU unipersonnelle */ ''}
        ${statutId === 'sasu' ? `
        <div class="mt-3 p-3 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
            <p><i class="fas fa-user mr-1"></i> 
            Structure unipersonnelle : 1 seul associé détenant 100% des parts.</p>
        </div>
        ` : ''}

        <div class="detail-category">Rémunération et charges sociales</div>
        <table class="detail-table">
            <tr>
                <td>Rémunération brute</td>
                <td>${formatter.format(result.sim.remuneration)}</td>
            </tr>
            <tr>
                <td>Charges patronales (≈${formatPercent(tauxChargesPatronales)})</td>
                <td>${formatter.format(result.sim.chargesPatronales)}</td>
            </tr>
            <tr>
                <td>Charges salariales (≈${formatPercent(tauxChargesSalariales)})</td>
                <td>${formatter.format(result.sim.chargesSalariales)}</td>
            </tr>
            <tr>
                <td>Coût total employeur</td>
                <td>${formatter.format(result.sim.coutTotalEmployeur || (result.sim.remuneration + result.sim.chargesPatronales))}</td>
            </tr>
            <tr>
                <td>Salaire net avant IR</td>
                <td>${formatter.format(result.sim.salaireNet)}</td>
            </tr>
        </table>
        
        <div class="detail-category">Base imposable et impôt sur le revenu</div>
        <table class="detail-table">
            <tr>
                <td>Salaire net</td>
                <td>${formatter.format(salaireNet)}</td>
            </tr>
            ${csgNonDeductible > 0 ? `
            <tr>
                <td>+ CSG/CRDS non déductible (2,9% du brut)</td>
                <td class="text-orange-400">+ ${formatter.format(csgNonDeductible)}</td>
            </tr>
            <tr class="border-t border-gray-600">
                <td><strong>= Base imposable IR</strong></td>
                <td><strong>${formatter.format(baseImposableIR)}</strong></td>
            </tr>
            ` : ''}
            <tr>
                <td>Impôt sur le revenu (${result.sim.modeExpert ? 'progressif, TMI: '+tmiEffectif+'%' : 'TMI: '+tmiEffectif+'%'})</td>
                <td class="text-red-400">- ${formatter.format(result.sim.impotRevenu)}</td>
            </tr>
            <tr>
                <td>Salaire net après IR</td>
                <td>${formatter.format(result.sim.revenuNetSalaire)}</td>
            </tr>
        </table>
        
        ${csgNonDeductible > 0 ? `
        <div class="mt-3 p-3 bg-blue-900 bg-opacity-30 rounded-lg text-xs">
            <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
            <strong>Note fiscale :</strong> Pour les dirigeants assimilés salariés, la CSG/CRDS non déductible (2,9% du salaire brut) 
            est réintégrée dans la base imposable. Vous payez donc l'IR sur un montant supérieur à votre salaire net.</p>
        </div>
        ` : ''}
        
        ${baseImposableIR > salaireNet ? `
        <div class="mt-2 p-2 bg-yellow-900 bg-opacity-20 rounded flex items-center text-xs">
            <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
            <span>Attention : Vous serez imposé sur ${formatter.format(baseImposableIR - salaireNet)} 
            de plus que votre salaire net !</span>
        </div>
        ` : ''}
        
        ${hasDividendes ? `
        <div class="detail-category">Dividendes</div>
        <table class="detail-table">
            <tr>
                <td>Résultat après rémunération</td>
                <td>${formatter.format(result.sim.resultatApresRemuneration)}</td>
            </tr>
            ${coutCAC > 0 ? `
            <tr>
                <td class="text-red-400">- Honoraires CAC (obligatoire)</td>
                <td class="text-red-400">- ${formatter.format(coutCAC)}</td>
            </tr>
            <tr class="border-t border-gray-600">
                <td><strong>= Résultat après frais obligatoires</strong></td>
                <td><strong>${formatter.format(result.sim.resultatApresRemuneration - coutCAC)}</strong></td>
            </tr>
            ` : ''}
            <tr>
              <td>Impôt sur les sociétés (${txtIS})</td>
                <td>${formatter.format(result.sim.is)}</td>
            </tr>
            <tr>
                <td>Résultat après IS</td>
                <td>${formatter.format(result.sim.resultatApresIS)}</td>
            </tr>
            <tr>
                <td>Dividendes bruts</td>
                <td>${formatter.format(result.sim.dividendes)}</td>
            </tr>
            <tr>
                <td>Méthode de taxation choisie</td>
                <td>
                    ${result.sim.methodeDividendes === 'PROGRESSIF' ? 
                        `<span class="text-green-400">Barème progressif</span>
                         <small class="text-gray-400 ml-2">(plus avantageux que le PFU)</small>` : 
                        '<span class="text-blue-400">PFU 30%</span>'}
                </td>
            </tr>
            ${result.sim.methodeDividendes === 'PROGRESSIF' ? `
            <tr>
                <td>Abattement de 40%</td>
                <td>${formatter.format(result.sim.dividendes * 0.40)}</td>
            </tr>
            <tr>
                <td>Base imposable après abattement</td>
                <td>${formatter.format(result.sim.dividendes * 0.60)}</td>
            </tr>
            <tr>
                <td>Impôt sur le revenu (TMI ${tmiEffectif}%)</td>
                <td>${formatter.format(result.sim.dividendes * 0.60 * tmiEffectif / 100)}</td>
            </tr>
            <tr>
                <td>Prélèvements sociaux (17,2%)</td>
                <td>${formatter.format(result.sim.dividendes * 0.172)}</td>
            </tr>
            ` : `
            <tr>
                <td>IR sur dividendes (12,8%)</td>
                <td>${formatter.format(result.sim.dividendes * 0.128)}</td>
            </tr>
            <tr>
                <td>Prélèvements sociaux (17,2%)</td>
                <td>${formatter.format(result.sim.dividendes * 0.172)}</td>
            </tr>
            `}
            <tr>
                <td>Total prélèvements sur dividendes</td>
                <td>${formatter.format(result.sim.prelevementForfaitaire)}</td>
            </tr>
            ${result.sim.economieMethode > 0 ? `
            <tr>
                <td>Économie réalisée</td>
                <td class="text-green-400">+ ${formatter.format(result.sim.economieMethode)}</td>
            </tr>
            ` : ''}
            <tr>
                <td>Dividendes nets</td>
                <td>${formatter.format(result.sim.dividendesNets)}</td>
            </tr>
</table>
<div class="text-xs text-gray-400 mt-1">
  Montants affichés = dividendes nets (après impôts/prélèvements).
</div>
${result.sim.methodeDividendes === 'PROGRESSIF' && result.sim.economieMethode > 0 ? `
  <div class="mt-3 p-3 bg-green-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-green-400">
    <p><i class="fas fa-lightbulb text-green-400 mr-2"></i>
      <strong>Optimisation fiscale appliquée :</strong> Avec votre TMI de ${tmiEffectif}%, 
      le barème progressif est plus avantageux que le PFU.
      Économie réalisée : ${formatter.format(result.sim.economieMethode)}.</p>
    <p class="mt-2 text-gray-400">
      Note : Ce choix s'applique à tous vos revenus de capitaux mobiliers de l'année.</p>
  </div>
` : ``}
        ${coutCAC > 0 ? `
        <div class="mt-3 p-3 bg-orange-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-orange-400">
            <p><i class="fas fa-gavel text-orange-400 mr-2"></i>
            <strong>Obligation légale SA :</strong> Les honoraires du Commissaire Aux Comptes (CAC) sont obligatoires 
            pour toute SA, quel que soit son chiffre d'affaires. Ce coût est déductible du résultat imposable.</p>
        </div>
        ` : ''}
        ` : `
        <div class="detail-category">Dividendes</div>
        <div class="mt-2 p-4 bg-blue-900 bg-opacity-30 rounded-lg">
            <p class="text-sm">
                <i class="fas fa-info-circle text-blue-400 mr-2"></i>
                <strong>Aucune distribution de dividendes</strong> - 100% du résultat est versé en rémunération.
            </p>
            ${result.sim.resultatApresRemuneration < 0 ? `
            <p class="text-sm mt-2 text-orange-400">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                Note : Le résultat après rémunération est négatif (${formatter.format(result.sim.resultatApresRemuneration)}), 
                ce qui indique que les charges sociales et la rémunération dépassent le résultat disponible.
            </p>` : ''}
        </div>
        `}
        
        <div class="detail-category">Résultat final</div>
        <table class="detail-table">
            <tr>
                <td>Salaire net après IR</td>
                <td>${formatter.format(result.sim.revenuNetSalaire)}</td>
            </tr>
            ${hasDividendes ? `
            <tr>
                <td>+ Dividendes nets</td>
                <td>${formatter.format(result.sim.dividendesNets)}</td>
            </tr>` : ''}
            <tr>
                <td><strong>= Revenu net total</strong></td>
                <td><strong>${formatter.format(result.sim.revenuNetTotal)}</strong></td>
            </tr>
            <tr>
                <td>Ratio Net/CA</td>
                <td>${formatPercent(result.sim.ratioNetCA)}</td>
            </tr>
        </table>
        
        <div class="mt-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg">
           <h4 class="text-sm font-bold text-gray-300">Récapitulatif fiscal :</h4>
            <div class="text-xs text-gray-400 -mt-1 mb-2">rémunération uniquement</div>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p class="text-gray-400">💰 Salaire net réel :</p>
                    <p class="font-mono">${formatter.format(salaireNet)}</p>
                </div>
                <div>
                    <p class="text-gray-400">📊 Base imposable IR :</p>
                    <p class="font-mono">${formatter.format(salaireNet)} + ${formatter.format(csgNonDeductible)} = ${formatter.format(baseImposableIR)}</p>
                </div>
            </div>
        </div>
    `;
 } else if (statutId === 'eurlIS' || statutId === 'sarl' || statutId === 'selarl' || statutId === 'sca') {
  // Cas des structures à l'IS avec un gérant TNS
  const hasDividendes = result.sim.dividendes && result.sim.dividendes > 0;

  // Base imposable via baseImposableTNS (intègre CSG non déductible + abattement 10% min/max)
  const remunerationNetteSociale = Number(result.sim.remunerationNetteSociale) || 0;
  const remBrute = Number(result.sim.remuneration) || 0;
  const netSoc   = Number(result.sim.remunerationNetteSociale) || 0;
  const b = baseImposableTNS({ remBrute, netSocial: netSoc });

  const baseImposableIR   = b.base;
  const csgNonDeductible  = b.csgND;
  const abattement10      = b.abat;

  // TMI calculé sur la base imposable corrigée
  const tmiEffectif = getTMI(baseImposableIR, nbParts);

  // Calcul des taux (robuste et plus réaliste)
  const baseRem = Number(result.sim?.remuneration) || 0;
  const cotSoc  = Number(result.sim?.cotisationsSociales) || 0;

  // TNS effectif observé sur la rémunération (fallback 30 si info manquante)
  const tauxCotisationsTNS = baseRem > 0 ? Math.round((cotSoc / baseRem) * 100) : 30;


  // Dividendes TNS (>10% capital) : réutilise le taux TNS effectif, fallback prudent 35
  const tauxCotTNSDiv = Number.isFinite(tauxCotisationsTNS) && tauxCotisationsTNS > 0
    ? tauxCotisationsTNS
    : 35;

  // 🔹 Split persistant calculé dans runComparison()
  const split = result.sim._divSplit || null;   // { partPS, partTNS, ps172, cotTNS, irDiv, totalPrels, nets }
  const pfu   = result.sim.methodeDividendes !== 'PROGRESSIF';

  detailContent = `
  <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>

  <div class="detail-category">Données de base</div>
  <table class="detail-table">
    <tr>
      <td>Chiffre d'affaires</td>
      <td>${formatter.format(result.sim.ca)}</td>
    </tr>
    <tr>
      <td>Résultat de l'entreprise (marge ${formatPercent(((result.sim.resultatAvantRemuneration || result.sim.resultatEntreprise) / result.sim.ca) * 100)})</td>
      <td>${formatter.format(result.sim.resultatAvantRemuneration || result.sim.resultatEntreprise)}</td>
    </tr>
    <tr>
      <td>Ratio rémunération/dividendes ${optimisationActive ? '(optimisé)' : '(manuel)'}</td>
      <td>
        ${formatPercent(result.ratioEffectif * 100)} / ${formatPercent(100 - result.ratioEffectif * 100)}
        ${!optimisationActive && result.ratioOptimise
          ? `<small class="ml-2 text-gray-400">(optimum : ${formatPercent(result.ratioOptimise * 100)})</small>`
          : ''}
      </td>
    </tr>
    ${statutId === 'sarl' ? `
    <tr>
      <td>Statut du gérant</td>
      <td>${result.sim.gerantMajoritaire ? 'Majoritaire (TNS)' : 'Minoritaire (assimilé salarié)'}</td>
    </tr>` : ''}
  </table>

  ${STATUTS_MULTI_ASSOCIES[statutId] && result.sim.nbAssocies > 1 ? `
  <div class="detail-category">Répartition entre associés</div>
  <table class="detail-table">
    <tr>
      <td colspan="2" class="text-center text-sm text-green-400">
        Simulation pour <strong>1 associé détenant ${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</strong>
        (société à ${result.sim.nbAssocies} associés)
      </td>
    </tr>
    <tr>
      <td>Nombre total d'associés</td>
      <td>${result.sim.nbAssocies}</td>
    </tr>
    <tr>
      <td>Part de l'associé simulé</td>
      <td>${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</td>
    </tr>
    ${result.sim.dividendes > 0 ? `
    <tr>
      <td>Dividendes totaux de la société</td>
      <td>${formatter.format(Math.round(result.sim.dividendes / (result.sim.partAssocie || 1)))}</td>
    </tr>
    <tr>
      <td>Quote-part de dividendes (${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))})</td>
      <td>${formatter.format(result.sim.dividendes)}</td>
    </tr>` : ''}
    ${statutId === 'sarl' && result.sim.gerantMajoritaire ? `
    <tr>
      <td colspan="2" class="text-xs text-gray-400 italic">
        <i class="fas fa-info-circle mr-1"></i>
        En tant que gérant majoritaire, les cotisations TNS sur dividendes s'appliquent sur votre quote-part.
      </td>
    </tr>` : ''}
  </table>

  <div class="mt-3 p-3 bg-blue-900 bg-opacity-30 rounded-lg text-xs">
    ${(() => {
      const pct = (result.sim.partAssociePct != null) ? result.sim.partAssociePct : (result.sim.partAssocie * 100);
      const partDec = pct / 100;
      const inv = partDec > 0 ? (1 / partDec) : 0;
      return `<p><i class="fas fa-calculator text-blue-400 mr-2"></i>
        <strong>Note :</strong> Les montants affichés correspondent uniquement à la quote-part
        de cet associé. Pour obtenir les résultats totaux de la société, divisez par ${partDec.toLocaleString('fr-FR',{maximumFractionDigits:2})}
        (ou multipliez par ${inv.toLocaleString('fr-FR',{maximumFractionDigits:2})}).</p>`;
    })()}
  </div>
  ` : ''}

  <!-- Base imposable IR (gérant TNS) — version complète avec abattement -->
  <div class="detail-category">Base imposable et impôt sur le revenu</div>
  <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4 mb-4">
    <table class="w-full">
      <tr>
        <td class="text-gray-300 pb-2">Salaire net</td>
        <td class="text-right text-lg font-semibold">
          ${formatter.format(remunerationNetteSociale)}
        </td>
      </tr>
      <tr>
        <td class="text-gray-300 pb-2">+ CSG/CRDS non déductible (2,9% du brut)</td>
        <td class="text-right text-lg font-semibold text-yellow-400">
          + ${formatter.format(csgNonDeductible)}
        </td>
      </tr>
      <tr>
        <td class="text-gray-300 pb-2">- Abattement 10% (min/max appliqués)</td>
        <td class="text-right text-lg font-semibold">
          - ${formatter.format(abattement10)}
        </td>
      </tr>
      <tr class="border-t border-gray-600 pt-2">
        <td class="text-white font-semibold pt-2"><strong>= Base imposable IR</strong></td>
        <td class="text-right text-xl font-bold text-white pt-2">
          <strong>${formatter.format(baseImposableIR)}</strong>
        </td>
      </tr>
    </table>
  </div>

        
        ${(statutId === 'eurl' || statutId === 'eurlIS') ? `
        <div class="mt-3 p-3 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
            <p><i class="fas fa-user mr-1"></i> 
            Structure unipersonnelle : 1 seul associé détenant 100% des parts.</p>
        </div>
        ` : ''}
        
        <div class="detail-category">Rémunération</div>
        <table class="detail-table">
            <tr>
                <td>Rémunération brute</td>
                <td>${formatter.format(result.sim.remuneration)}</td>
            </tr>
            <tr>
                <td>Cotisations sociales TNS (≈${formatPercent(tauxCotisationsTNS)})</td>
                <td>${formatter.format(result.sim.cotisationsSociales)}</td>
            </tr>
            <tr>
                <td>Revenu net social</td>
                <td>${formatter.format(result.sim.remunerationNetteSociale)}</td>
            </tr>
        </table>

        <table class="detail-table">
            <tr>
                <td>Impôt sur le revenu (${result.sim.modeExpert ? 'progressif, TMI: '+tmiEffectif+'%' : 'TMI: '+tmiEffectif+'%'})</td>
                <td>${formatter.format(result.sim.impotRevenu)}</td>
            </tr>
            <tr>
                <td>Revenu net après IR</td>
                <td>${formatter.format(result.sim.revenuNetSalaire)}</td>
            </tr>
        </table>
        
        <div class="mt-3 p-3 bg-yellow-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-yellow-400">
            <p><i class="fas fa-exclamation-triangle text-yellow-400 mr-2"></i>
            <strong>Important :</strong> La CSG/CRDS non déductible (2,9%) augmente votre base imposable à l'IR. 
            Cette particularité s'applique aux TNS (gérants majoritaires de SARL, gérants d'EURL, etc.).</p>
        </div>
        
${hasDividendes ? `
  <div class="detail-category">Dividendes</div>
  <table class="detail-table">
    <tr>
      <td>Résultat après rémunération</td>
      <td>${formatter.format(result.sim.resultatApresRemuneration)}</td>
    </tr>
    <tr>
<td>Impôt sur les sociétés (${txtIS})</td>
      <td>${formatter.format(result.sim.is)}</td>
    </tr>
    <tr>
      <td>Résultat après IS</td>
      <td>${formatter.format(result.sim.resultatApresIS)}</td>
    </tr>
    <tr>
      <td>Dividendes bruts</td>
      <td>${formatter.format(result.sim.dividendes)}</td>
    </tr>

    ${(() => {
      // 🔹 Toujours afficher la base 10% : priorité aux champs UI, sinon fallback simulation
      const uiBase = Number(document.getElementById('base10-total')?.value) || 0;
      const baseSeuil = uiBase > 0 ? uiBase : getBaseSeuilDivTNS(result.sim || {});
      const libelleBase = baseSeuil > 0
        ? `10% de ${formatter.format(baseSeuil)}`
        : `10% de (capital libéré + primes + CCA)`;

      return `
        <tr>
          <td>Seuil TNS sur dividendes</td>
          <td>${libelleBase} ${formatBaseSeuilDivTNSTooltip(baseSeuil)}</td>
        </tr>
        ${result.sim.cotTNSDiv ? `
          <tr>
            <td>Cotisations TNS sur dividendes &gt; seuil</td>
            <td>${formatter.format(result.sim.cotTNSDiv)}</td>
          </tr>` : `
          <tr>
            <td>Cotisations TNS sur dividendes &gt; seuil</td>
            <td>0 €</td>
          </tr>`}
      `;
    })()}

    <tr>
      <td>Méthode de taxation choisie</td>
      <td>
        ${result.sim.methodeDividendes === 'PROGRESSIF'
          ? `<span class="text-green-400">Barème progressif</span><small class="text-gray-400 ml-2">(plus avantageux que le PFU)</small>`
          : '<span class="text-blue-400">PFU 30%</span>'}
      </td>
    </tr>

    ${pfu ? `
      <tr><td>IR 12,8%</td>
          <td>${formatter.format(split ? split.irDiv : (result.sim.dividendes || 0) * 0.128)}</td></tr>
      <tr><td>Prélèvements sociaux 17,2% (≤10%)</td>
          <td>${formatter.format(split ? split.ps172 : (result.sim.dividendes || 0) * 0.172)}</td></tr>
      ${split && split.cotTNS ? `<tr><td>Cotisations TNS (>10%)</td><td>${formatter.format(split.cotTNS)}</td></tr>` : ''}
    ` : `
      <tr><td>Abattement de 40%</td>
          <td>${formatter.format((result.sim.dividendes || 0) * 0.40)}</td></tr>
      <tr><td>Base imposable après abattement</td>
          <td>${formatter.format((result.sim.dividendes || 0) * 0.60)}</td></tr>
      <tr><td>IR (TMI)</td>
          <td>${formatter.format(split ? split.irDiv : (result.sim.dividendes || 0) * 0.60 * (tmiEffectif / 100))}</td></tr>
      <tr><td>Prélèvements sociaux 17,2% (≤10%)</td>
          <td>${formatter.format(split ? split.ps172 : (result.sim.dividendes || 0) * 0.172)}</td></tr>
      ${split && split.cotTNS ? `<tr><td>Cotisations TNS (>10%)</td><td>${formatter.format(split.cotTNS)}</td></tr>` : ''}
    `}

    <tr>
      <td>Total prélèvements sur dividendes</td>
      <td>${formatter.format(
        split
          ? (split.totalPrels ?? (split.irDiv + split.ps172 + (split.cotTNS || 0)))
          : ((result.sim.prelevementForfaitaire || 0) + (result.sim.cotTNSDiv || 0))
      )}</td>
    </tr>

    <tr>
      <td>Dividendes nets</td>
      <td>${formatter.format(result.sim.dividendesNets || (split ? split.nets : 0))}</td>
    </tr>

    ${result.sim.economieMethode > 0 ? `
      <tr>
        <td>Économie réalisée</td>
        <td class="text-green-400">+ ${formatter.format(result.sim.economieMethode)}</td>
      </tr>
    ` : ''}
  </table>

  <div class="text-xs text-gray-400 mt-1">
    Montants affichés = dividendes nets (après impôts/prélèvements).
  </div>

  ${result.sim.methodeDividendes === 'PROGRESSIF' && result.sim.economieMethode > 0 ? `
    <div class="mt-3 p-3 bg-green-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-green-400">
      <p><i class="fas fa-lightbulb text-green-400 mr-2"></i>
        <strong>Optimisation fiscale appliquée :</strong> Avec votre TMI de ${tmiEffectif}%, 
        le barème progressif est plus avantageux que le PFU.
        Économie réalisée : ${formatter.format(result.sim.economieMethode)}.</p>
      <p class="mt-2 text-gray-400">Note : Ce choix s'applique à tous vos revenus de capitaux mobiliers de l'année.</p>
    </div>
  ` : ``}
` : `
  <div class="detail-category">Dividendes</div>
  <div class="mt-2 p-4 bg-blue-900 bg-opacity-30 rounded-lg">
    <p class="text-sm">
      <i class="fas fa-info-circle text-blue-400 mr-2"></i>
      <strong>Aucune distribution de dividendes</strong> — 100% du résultat est versé en rémunération.
    </p>
    ${result.sim.resultatApresRemuneration < 0 ? `
      <p class="text-sm mt-2 text-orange-400">
        <i class="fas fa-exclamation-triangle mr-2"></i>
        Note : Le résultat après rémunération est négatif (${formatter.format(result.sim.resultatApresRemuneration)}).
      </p>` : ''}
  </div>
`}
        
        <div class="detail-category">Résultat final</div>
        <table class="detail-table">
            <tr>
                <td>Revenu net après IR</td>
                <td>${formatter.format(result.sim.revenuNetSalaire)}</td>
            </tr>
            ${hasDividendes ? `
            <tr>
                <td>+ Dividendes nets</td>
                <td>${formatter.format(result.sim.dividendesNets || (split ? split.nets : 0))}</td>
            </tr>` : ''}
            <tr>
                <td><strong>= Revenu net total</strong></td>
                <td><strong>${formatter.format(result.sim.revenuNetTotal)}</strong></td>
            </tr>
            <tr>
                <td>Ratio Net/CA</td>
                <td>${formatPercent(result.sim.ratioNetCA)}</td>
            </tr>
        </table>
    `;

} else if (statutId === 'ei' || statutId === 'eurl' || statutId === 'snc') {
    // Cas des entreprises à l'IR
    const tauxCotisationsTNS = 30;
    
    // NOUVEAU : Fonction helper pour éviter les NaN
    const getNumber = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;
    
    // NOUVEAU : Récupérer le bénéfice de manière canonique selon le statut
    const beneficeBrut = getNumber(
        result.sim.beneficeAvantCotisations ??           // EI standard
        result.sim.resultatAvantRemuneration ??          // EURL variante
        result.sim.beneficeAssociePrincipal ??          // SNC quote-part
        result.sim.benefice ??                           // Autre variante possible
        result.brut                                      // Fallback ultime
    );
    
    // Récupérer les autres valeurs de manière sûre
    const cotisations = getNumber(result.sim.cotisationsSociales);
    const csgNonDeductible = getNumber(result.sim.csgNonDeductible);
    
    // Calculer le cash de manière fiable
    const cashAvantIR = getNumber(result.sim.cashAvantIR) || (beneficeBrut - cotisations);
    
    // Calculer la base imposable
    const baseImposableIR = getNumber(
        result.sim.baseImposableIR ??
        result.sim.beneficeImposable ??
        result.sim.beneficeApresCotisations ??
        (cashAvantIR + csgNonDeductible)
    );
    
    // NOUVEAU : Calculer le TMI effectif
    const tmiEffectif = getTMI(baseImposableIR, nbParts);
    
    detailContent = `
        <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - ${result.statut}</h2>
        
        <div class="detail-category">Données de base</div>
        <table class="detail-table">
            <tr>
                <td>Chiffre d'affaires</td>
                <td>${formatter.format(result.sim.ca)}</td>
            </tr>
            <tr>
                <td>Bénéfice avant cotisations (marge ${formatPercent((beneficeBrut/result.sim.ca)*100)})</td>
                <td>${formatter.format(beneficeBrut)}</td>
            </tr>
        </table>
        
        ${/* Section associés pour SNC */ ''}
        ${statutId === 'snc' && STATUTS_MULTI_ASSOCIES[statutId] && result.sim.nbAssocies > 1 ? `
        <div class="detail-category">Répartition entre associés</div>
        <table class="detail-table">
            <tr>
                <td colspan="2" class="text-center text-sm text-green-400">
                    Simulation pour <strong>1 associé détenant ${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</strong>
                    (société à ${result.sim.nbAssocies} associés)
                </td>
            </tr>
            <tr>
                <td>Nombre total d'associés</td>
                <td>${result.sim.nbAssocies}</td>
            </tr>
            <tr>
                <td>Part de l'associé simulé</td>
                <td>${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</td>
            </tr>
            <tr>
                <td>Quote-part du bénéfice</td>
                <td>${formatter.format(beneficeBrut)}</td>
            </tr>
        </table>
        
        <div class="mt-3 p-3 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
            <p><i class="fas fa-balance-scale mr-1"></i> 
            <strong>Transparence fiscale :</strong> Chaque associé déclare sa quote-part 
            du résultat fiscal dans sa déclaration personnelle.</p>
        </div>
        ` : ''}
        
        <div class="detail-category">Flux de trésorerie (cash)</div>
        <table class="detail-table">
            <tr>
                <td>Bénéfice avant cotisations ${statutId === 'snc' ? '(quote-part)' : ''}</td>
                <td>${formatter.format(beneficeBrut)}</td>
            </tr>
            <tr>
                <td>- Cotisations sociales TNS (${formatPercent(tauxCotisationsTNS)})</td>
                <td class="text-red-400">- ${formatter.format(cotisations)}</td>
            </tr>
            <tr class="border-t border-gray-600">
                <td><strong>= Cash disponible avant IR</strong></td>
                <td><strong>${formatter.format(cashAvantIR)}</strong></td>
            </tr>
        </table>
        
        <div class="detail-category">Base imposable (calcul fiscal)</div>
        <table class="detail-table">
            <tr>
                <td>Cash disponible</td>
                <td>${formatter.format(cashAvantIR)}</td>
            </tr>
            ${csgNonDeductible > 0 ? `
            <tr>
                <td>+ CSG/CRDS non déductible (2,9%)</td>
                <td class="text-orange-400">+ ${formatter.format(csgNonDeductible)}</td>
            </tr>
            <tr class="border-t border-gray-600">
                <td><strong>= Base imposable IR</strong></td>
                <td><strong>${formatter.format(baseImposableIR)}</strong></td>
            </tr>
            ` : `
            <tr>
                <td>Base imposable IR</td>
                <td>${formatter.format(baseImposableIR)}</td>
            </tr>
            `}
        </table>
        
        <div class="mt-3 p-3 bg-blue-900 bg-opacity-30 rounded-lg text-xs">
            <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
            <strong>Note fiscale :</strong> La CSG/CRDS non déductible (2,9%) est réintégrée dans la base imposable 
            mais reste bien payée. C'est pourquoi le cash réel est inférieur à la base imposable.</p>
            <p class="mt-2 text-xs">
                <strong>Exemple :</strong> Sur 100k€ de bénéfice, après 30k€ de cotisations, 
                vous avez 70k€ en cash mais êtes imposé sur 72,9k€ (+2,9% de CSG non déductible).
            </p>
        </div>
        
        ${baseImposableIR > cashAvantIR ? `
        <div class="mt-2 p-2 bg-yellow-900 bg-opacity-20 rounded flex items-center text-xs">
            <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
            <span>Attention : Vous serez imposé sur ${formatter.format(baseImposableIR - cashAvantIR)} 
            de plus que votre cash réel !</span>
        </div>
        ` : ''}
        
        <div class="detail-category">Impôt sur le revenu</div>
        <table class="detail-table">
            <tr>
                <td>Base imposable IR</td>
                <td>${formatter.format(baseImposableIR)}</td>
            </tr>
            <tr>
                <td>Tranche marginale d'imposition (TMI)</td>
                <td>${tmiEffectif}%</td>
            </tr>
            <tr>
                <td>Impôt sur le revenu (${result.sim.modeExpert ? 'calcul progressif' : 'TMI simple'})</td>
                <td class="text-red-400">- ${formatter.format(result.sim.impotRevenu || 0)}</td>
            </tr>
        </table>
        
        <div class="detail-category">Résultat final</div>
        <table class="detail-table">
            <tr>
                <td>Cash disponible avant IR</td>
                <td>${formatter.format(cashAvantIR)}</td>
            </tr>
            <tr>
                <td>- Impôt sur le revenu</td>
                <td class="text-red-400">- ${formatter.format(getNumber(result.sim.impotRevenu))}</td>
            </tr>
            <tr class="border-t border-gray-600">
                <td><strong>= Revenu net en poche</strong></td>
                <td><strong class="text-green-400">${formatter.format(getNumber(result.sim.revenuNetApresImpot))}</strong></td>
            </tr>
            <tr>
                <td>Ratio Net/CA</td>
                <td>${formatPercent(result.sim.ratioNetCA || ((getNumber(result.sim.revenuNetApresImpot) / result.sim.ca) * 100))}</td>
            </tr>
        </table>
        
        <div class="mt-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg">
            <h4 class="text-sm font-bold text-gray-300 mb-2">Récapitulatif des flux :</h4>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p class="text-gray-400">💰 Flux de trésorerie :</p>
                    <p class="font-mono">${formatter.format(beneficeBrut)} - ${formatter.format(cotisations)} = ${formatter.format(cashAvantIR)}</p>
                </div>
                <div>
                    <p class="text-gray-400">📊 Flux fiscal :</p>
                    <p class="font-mono">${formatter.format(cashAvantIR)} + ${formatter.format(csgNonDeductible)} = ${formatter.format(baseImposableIR)}</p>
                </div>
            </div>
        </div>
        
        ${statutId === 'snc' ? `
        <div class="mt-4 p-3 bg-purple-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-purple-400">
            <p><i class="fas fa-info-circle text-purple-400 mr-2"></i>
            <strong>Spécificité SNC :</strong> Les montants affichés correspondent à votre quote-part 
            (${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}) du résultat total de la société.</p>
        </div>
        ` : ''}
        
        ${statutId === 'eurl' ? `
        <div class="mt-4 p-3 bg-indigo-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-indigo-400">
            <p><i class="fas fa-info-circle text-indigo-400 mr-2"></i>
            <strong>Spécificité EURL-IR :</strong> Structure unipersonnelle soumise à l'IR. 
            Le gérant associé unique est imposé sur l'intégralité du bénéfice après cotisations.</p>
        </div>
        ` : ''}
    `;

    } else if (statutId === 'sci') {
        // Cas particulier de la SCI
        const tauxPrelevementsSociaux = 17.2;
        const tauxCSGDeductible = 6.8; // CSG déductible sur les revenus fonciers
        
        // Récupérer les données
        const revenuLocatif = result.sim.ca || result.sim.revenuLocatif || 0;
        const chargesDeductibles = result.sim.chargesDeductibles || 0;
        const nombreAssocies = result.sim.nombreAssocies || 1;
        
        // Calcul du résultat fiscal de la SCI (niveau société)
        const resultatFiscalSCI = revenuLocatif - chargesDeductibles;
        
        // Vérifier si le résultat est anormalement divisé
        let quotePartAssocie = result.sim.resultatFiscalAssocie || 0;
        let noteCorrection = '';
        
        // Si le résultat affiché semble être divisé par 2, le corriger
        if (Math.abs(quotePartAssocie * 2 - resultatFiscalSCI) < 1 && nombreAssocies === 1) {
            quotePartAssocie = resultatFiscalSCI;
            noteCorrection = ' (corrigé)';
        }
        
        // Calcul des prélèvements sociaux sur la quote-part
        const prelevementsSociaux = quotePartAssocie * tauxPrelevementsSociaux / 100;
        const csgDeductible = quotePartAssocie * tauxCSGDeductible / 100;
        
        // Base imposable après déduction de la CSG déductible
        const baseImposableIR = quotePartAssocie - csgDeductible;
        
        // Calcul du TMI effectif sur la base imposable nette
        const tmiEffectif = getTMI(baseImposableIR, nbParts);
        
        // Recalcul de l'impôt si nécessaire (si correction appliquée)
        let impotRevenu = result.sim.impotRevenu || 0;
        if (noteCorrection) {
            // Recalculer l'impôt avec la base corrigée
            if (result.sim.modeExpert) {
                // Calcul progressif (simplifié ici)
                impotRevenu = baseImposableIR * tmiEffectif / 100 * 0.8; // Approximation
            } else {
                impotRevenu = baseImposableIR * tmiEffectif / 100;
            }
        }
        
        // Revenu net après prélèvements et impôts
        const revenuNetAssocie = quotePartAssocie - prelevementsSociaux - impotRevenu;
        
        detailContent = `
            <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - SCI à l'IR</h2>
            
            <div class="detail-category">Données de base (niveau SCI)</div>
            <table class="detail-table">
                <tr>
                    <td>Revenus locatifs totaux</td>
                    <td>${formatter.format(revenuLocatif)}</td>
                </tr>
                ${chargesDeductibles ? `
                <tr>
                    <td>- Charges déductibles</td>
                    <td>${formatter.format(chargesDeductibles)}</td>
                </tr>` : ''}
                <tr>
                    <td><strong>= Résultat fiscal de la SCI</strong></td>
                    <td><strong>${formatter.format(resultatFiscalSCI)}</strong></td>
                </tr>
                ${nombreAssocies > 1 ? `
                <tr>
                    <td>Nombre d'associés</td>
                    <td>${nombreAssocies}</td>
                </tr>` : ''}
            </table>
            
            ${/* NOUVEAU: Section associés pour SCI */ ''}
            ${STATUTS_MULTI_ASSOCIES['sci'] && result.sim.nbAssocies > 1 ? `
            <div class="detail-category">Répartition entre associés</div>
            <table class="detail-table">
                <tr>
                    <td colspan="2" class="text-center text-sm text-green-400">
                        Simulation pour <strong>1 associé détenant ${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</strong>
                        (SCI à ${result.sim.nbAssocies} associés)
                    </td>
                </tr>
                <tr>
                    <td>Part de l'associé simulé</td>
                    <td>${formatPercent(result.sim.partAssociePct || (result.sim.partAssocie * 100))}</td>
                </tr>
                <tr>
                    <td>Quote-part du résultat fiscal</td>
                    <td>${formatter.format(result.sim.resultatFiscalAssocie || quotePartAssocie)}</td>
                </tr>
            </table>
            
            <div class="mt-3 p-3 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
                <p><i class="fas fa-balance-scale mr-1"></i> 
                <strong>Transparence fiscale :</strong> Chaque associé déclare sa quote-part 
                du résultat fiscal dans sa déclaration personnelle (case 4BA pour les revenus fonciers).</p>
            </div>
            ` : `
            <div class="detail-category">Quote-part de l'associé${nombreAssocies > 1 ? ' (1/'+nombreAssocies+')' : ''}</div>
            <table class="detail-table">
                <tr>
                    <td>Quote-part du résultat fiscal${noteCorrection}</td>
                    <td>${formatter.format(quotePartAssocie)}</td>
                </tr>
                <tr>
                    <td colspan="2" class="text-xs text-gray-400 italic">
                        Base imposable individuelle déclarée en revenus fonciers (case 4BA)
                    </td>
                </tr>
            </table>
            `}
            
            <div class="detail-category">Prélèvements sociaux</div>
            <table class="detail-table">
                <tr>
                    <td>Base de calcul (quote-part)</td>
                    <td>${formatter.format(quotePartAssocie)}</td>
                </tr>
                <tr>
                    <td>Taux de prélèvements sociaux</td>
                    <td>${formatPercent(tauxPrelevementsSociaux)}</td>
                </tr>
                <tr>
                    <td>Montant des prélèvements sociaux</td>
                    <td>${formatter.format(prelevementsSociaux)}</td>
                </tr>
                <tr>
                    <td colspan="2" class="text-xs text-gray-400 italic">
                        Dont CSG déductible (${formatPercent(tauxCSGDeductible)}) : ${formatter.format(csgDeductible)}
                    </td>
                </tr>
            </table>
            
            <div class="detail-category">Impôt sur le revenu</div>
            <table class="detail-table">
                <tr>
                    <td>Quote-part imposable</td>
                    <td>${formatter.format(quotePartAssocie)}</td>
                </tr>
                <tr>
                    <td>- CSG déductible (${formatPercent(tauxCSGDeductible)})</td>
                    <td>${formatter.format(csgDeductible)}</td>
                </tr>
                <tr>
                    <td>= Base nette imposable à l'IR</td>
                    <td>${formatter.format(baseImposableIR)}</td>
                </tr>
                <tr>
                    <td>Tranche marginale d'imposition</td>
                    <td>${tmiEffectif}%</td>
                </tr>
                <tr>
                    <td>Impôt sur le revenu${result.sim.modeExpert ? ' (calcul progressif)' : ''}</td>
                    <td>${formatter.format(impotRevenu)}</td>
                </tr>
            </table>
            
            <div class="detail-category">Résultat final pour l'associé</div>
            <table class="detail-table">
                <tr>
                    <td>Quote-part du résultat</td>
                    <td>${formatter.format(quotePartAssocie)}</td>
                </tr>
                <tr>
                    <td>- Prélèvements sociaux (${formatPercent(tauxPrelevementsSociaux)})</td>
                    <td>${formatter.format(prelevementsSociaux)}</td>
                </tr>
                <tr>
                    <td>- Impôt sur le revenu</td>
                    <td>${formatter.format(impotRevenu)}</td>
                </tr>
                <tr>
                    <td><strong>= Revenu net après impôts</strong></td>
                    <td><strong>${formatter.format(revenuNetAssocie)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio net/revenus locatifs${nombreAssocies > 1 ? ' (pour cet associé)' : ''}</td>
                    <td>${formatPercent((revenuNetAssocie / (revenuLocatif/nombreAssocies)) * 100)}</td>
                </tr>
            </table>
            
            ${nombreAssocies > 1 ? `
            <div class="mt-4 p-4 bg-blue-900 bg-opacity-30 rounded-lg text-sm">
                <p><i class="fas fa-info-circle text-blue-400 mr-2"></i> 
                <strong>Note :</strong> Les montants affichés correspondent à la quote-part d'un associé détenant 1/${nombreAssocies} des parts.
                Le résultat fiscal total de la SCI est de ${formatter.format(resultatFiscalSCI)}.</p>
            </div>
            ` : ''}
            
            ${noteCorrection ? `
            <div class="mt-4 p-4 bg-yellow-900 bg-opacity-30 rounded-lg text-sm">
                <p><i class="fas fa-exclamation-triangle text-yellow-400 mr-2"></i> 
                <strong>Correction appliquée :</strong> Le résultat fiscal a été ajusté pour refléter le montant total de la SCI.
                Vérifiez le paramétrage du nombre d'associés si ce n'est pas le résultat attendu.</p>
            </div>
            ` : ''}
            
            <div class="mt-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
                <p><i class="fas fa-balance-scale mr-1"></i> 
                <strong>Précisions fiscales :</strong></p>
                <ul class="mt-2 space-y-1 ml-4">
                    <li>• La CSG déductible (6,8%) vient minorer la base imposable à l'IR l'année suivante</li>
                    <li>• Chaque associé déclare sa quote-part en case 4BA de la déclaration 2042</li>
                    <li>• La SCI doit déposer une déclaration 2072 récapitulant les résultats</li>
                    <li>• Régime de transparence fiscale (article 8 CGI)</li>
                </ul>
            </div>
        `;
    } else {
        // Cas par défaut
        detailContent = `
            <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>
            
            <div class="detail-category">Résultat final</div>
            <table class="detail-table">
                <tr>
                    <td>Chiffre d'affaires</td>
                    <td>${formatter.format(result.sim.ca)}</td>
                </tr>
                <tr>
                    <td>Charges sociales</td>
                    <td>${formatter.format(result.charges)}</td>
                </tr>
                <tr>
                    <td>Impôts (IR + IS + PFU)</td>
                    <td>${formatter.format(result.impots)}</td>
                </tr>
                <tr>
                    <td><strong>Revenu net total</strong></td>
                    <td><strong>${formatter.format(result.net)}</strong></td>
                </tr>
                <tr>
                    <td>Ratio Net/CA</td>
                    <td>${formatPercent((result.score || 0))}</td>
                </tr>
            </table>
            
            <div class="mt-4 p-4 bg-blue-900 bg-opacity-30 rounded-lg text-sm">
                <p><i class="fas fa-info-circle text-blue-400 mr-2"></i> Les calculs détaillés pour ce statut sont spécifiques et complexes. Pour plus d'informations, consultez la documentation fiscale ou un expert-comptable.</p>
            </div>
        `;
    }
    
    // NOUVEAU : Variable pour stocker le TMI effectif calculé
    let tmiEffectifFinal = 0;
    
    // Déterminer le TMI effectif selon le statut
 if (statutId === 'micro') {
  tmiEffectifFinal = getTMI(result.sim.revenuImposable || 0, nbParts);
} else if (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa' || statutId === 'selas') {
  const base = (result.sim.baseImposableIR ?? ((result.sim.salaireNet || 0) + (result.sim.csgNonDeductible || 0)));
  tmiEffectifFinal = getTMI(base, nbParts);
} else if (statutId === 'eurlIS' || statutId === 'sarl' || statutId === 'selarl' || statutId === 'sca') {
  const base = (result.sim.baseImposableIR ?? ((result.sim.remunerationNetteSociale || 0) + (result.sim.csgNonDeductible || 0)));
  tmiEffectifFinal = getTMI(base);
} else if (statutId === 'ei' || statutId === 'eurl' || statutId === 'snc') {
  const base = (result.sim.baseImposableIR || result.sim.beneficeImposable || result.sim.beneficeApresCotisations || 0);
  tmiEffectifFinal = getTMI(base);
} else if (statutId === 'sci') {
  const base = (result.sim.resultatFiscalAssocie || 0) * (1 - 6.8/100); // CSG déductible
  tmiEffectifFinal = getTMI(base);
}
    
// --- Récapitulatif des taux utilisés ---
detailContent += `
  <div class="detail-category mt-6">Récapitulatif des taux utilisés</div>
  <div class="mt-2 p-4 bg-green-900 bg-opacity-20 rounded-lg text-sm">
    <ul class="space-y-1">
      <li><i class="fas fa-percentage text-green-400 mr-2"></i>
        <strong>Charges sociales :</strong> ${
          statutId === 'micro'
            ? '12,3% à 24,6% selon activité'
            : (['sasu','sas','sa','selas'].includes(statutId)
                ? '≈77% (22% salariales + 55% patronales)'
                : (statutId === 'sci'
                    ? '17,2% (prélèvements sociaux sur revenus fonciers)'
                    : '≈30% (TNS)'))
        }
      </li>

      ${(['eurlIS','sasu','sarl','sas','sa','selarl','selas','sca'].includes(statutId)) ? `
        <li><i class="fas fa-percentage text-green-400 mr-2"></i>
          <strong>IS :</strong> ${renderISReduceBadge()} jusqu’à <strong>42 500 €</strong>, puis 25%
        </li>
        <li><i class="fas fa-percentage text-green-400 mr-2"></i>
          <strong>PFU sur dividendes :</strong> 30% (17,2% PS + 12,8% IR)
        </li>
      ` : ''}

      ${(['eurlIS','sarl','selarl','sca'].includes(statutId)) ? `
        <li><i class="fas fa-percentage text-green-400 mr-2"></i>
          <strong>Cotisations TNS sur dividendes :</strong> ≈ 40–45% sur la part &gt; 10%
        </li>
      ` : ''}

      ${(statutId === 'micro') ? `
        <li><i class="fas fa-percentage text-green-400 mr-2"></i>
          <strong>Abattement forfaitaire :</strong> ${
            (result.sim.typeMicro || 'BIC_SERVICE') === 'BIC_VENTE' ? '71%' :
            (result.sim.typeMicro || 'BIC_SERVICE') === 'BNC' ? '34%' : '50%'
          } du CA
        </li>
        ${result.sim.versementLiberatoire ? `
          <li><i class="fas fa-percentage text-green-400 mr-2"></i>
            <strong>Versement libératoire :</strong> ${
              (result.sim.typeMicro || 'BIC_SERVICE') === 'BIC_VENTE' ? '1%' :
              (result.sim.typeMicro || 'BIC_SERVICE') === 'BNC' ? '2,2%' : '1,7%'
            } du CA (remplace l’IR progressif)
          </li>
        ` : ''}
      ` : ''}

      ${!(statutId === 'micro' && result.sim.versementLiberatoire) ? `
        <li><i class="fas fa-percentage text-green-400 mr-2"></i>
          <strong>TMI effectif :</strong> ${tmiEffectifFinal}%
        </li>
      ` : ''}
    </ul>
  </div>`;


    
    // Ajouter une note explicative sur le régime fiscal
    if (statutId === 'micro' || statutId === 'ei' || statutId === 'eurl' || statutId === 'snc' || statutId === 'sci') {
        detailContent += `
        <div class="mt-2 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-blue-400">
            <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
            <strong>Régime IR :</strong> Cette structure est transparente fiscalement. 
            Le résultat est directement imposé à l'IR du dirigeant/associé, sans IS ni distribution de dividendes.</p>
        </div>`;
    } else {
        detailContent += `
        <div class="mt-2 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-xs border-l-4 border-blue-400">
            <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
            <strong>Régime IS :</strong> La société paie l'IS sur ses bénéfices. 
            Le dirigeant peut se verser une rémunération (imposée à l'IR) et/ou des dividendes (soumis au PFU).</p>
        </div>`;
    }
    
    // Créer le conteneur du contenu
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
        background-color: #012a4a;
        border-radius: 12px;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        position: relative;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(0, 255, 135, 0.3);
    `;
    
    contentWrapper.innerHTML = `
        <div class="detail-content" style="padding: 2rem;">
            <span class="close-modal" style="position: absolute; top: 1rem; right: 1rem; cursor: pointer; font-size: 1.5rem; color: #00FF87;">
                <i class="fas fa-times"></i>
            </span>
            ${detailContent}
        </div>
    `;
    
    modal.appendChild(contentWrapper);
    document.body.appendChild(modal);
    
    // Ajouter un gestionnaire d'événement pour fermer le modal
    modal.querySelector('.close-modal').addEventListener('click', function() {
        modal.remove();
    });
    
    // Fermer le modal en cliquant en dehors du contenu
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.remove();
        }
    });
}

// Configurer l'accordéon pour les sections d'informations fiscales
function setupAccordion() {
  const accordionContainer = document.querySelector('.space-y-4');
  if (!accordionContainer) return;

  // --- Lazy retry si legalStatuses n'est pas encore prêt ---
  const hasLegal = !!window.legalStatuses;

  // Si pas prêt et pas encore construit, on retente une fois un peu plus tard
  if (!hasLegal && accordionContainer.dataset.built !== '1') {
    if (!accordionContainer.dataset.retryScheduled) {
      accordionContainer.dataset.retryScheduled = '1';
      setTimeout(() => {
        accordionContainer.dataset.retryScheduled = '';
        setupAccordion();
      }, 150);
    }
    // Ne pas toucher au contenu avant d'avoir legalStatuses pour éviter l'effet "fallback → rebuild"
    return;
  }

  // Évite un double build si déjà fait
  if (accordionContainer.dataset.built === '1') return;

  // (Re)style du conteneur
  accordionContainer.innerHTML = '';
  accordionContainer.style.background = 'rgba(1, 42, 74, 0.4)';
  accordionContainer.style.padding = '2rem';
  accordionContainer.style.borderRadius = '12px';
  accordionContainer.style.border = '1px solid rgba(0, 255, 135, 0.1)';

  // Source des statuts : legalStatuses ou fallback
  const statuts = window.legalStatuses
    ? Object.keys(window.legalStatuses)
    : ['MICRO','EI','EURL','SASU','SARL','SAS','SA','SNC','SCI','SELARL','SELAS','SCA'];

  // Icônes
  const statutIcons = {
    'MICRO':'<i class="fas fa-store-alt text-green-400 mr-2"></i>',
    'EI':'<i class="fas fa-user text-green-400 mr-2"></i>',
    'EURL':'<i class="fas fa-user-tie text-green-400 mr-2"></i>',
    'SASU':'<i class="fas fa-user-shield text-blue-400 mr-2"></i>',
    'SARL':'<i class="fas fa-users text-blue-400 mr-2"></i>',
    'SAS':'<i class="fas fa-building text-blue-400 mr-2"></i>',
    'SA':'<i class="fas fa-landmark text-blue-400 mr-2"></i>',
    'SNC':'<i class="fas fa-handshake text-green-400 mr-2"></i>',
    'SCI':'<i class="fas fa-home text-green-400 mr-2"></i>',
    'SELARL':'<i class="fas fa-user-md text-blue-400 mr-2"></i>',
    'SELAS':'<i class="fas fa-stethoscope text-blue-400 mr-2"></i>',
    'SCA':'<i class="fas fa-chart-line text-blue-400 mr-2"></i>'
  };

  // Badges fiscaux
  const regimeBadges = {
    'MICRO':'<span class="status-badge ir">IR</span>',
    'EI':'<span class="status-badge ir">IR</span>',
    'EURL':'<span class="status-badge iris">IR/IS</span>',
    'SASU':'<span class="status-badge is">IS</span>',
    'SARL':'<span class="status-badge is">IS</span>',
    'SAS':'<span class="status-badge is">IS</span>',
    'SA':'<span class="status-badge is">IS</span>',
    'SNC':'<span class="status-badge ir">IR</span>',
    'SCI':'<span class="status-badge ir">IR</span>',
    'SELARL':'<span class="status-badge is">IS</span>',
    'SELAS':'<span class="status-badge is">IS</span>',
    'SCA':'<span class="status-badge is">IS</span>'
  };

  // Génération
  statuts.forEach(statutId => {
    const nomStatut = (window.legalStatuses && window.legalStatuses[statutId])
      ? window.legalStatuses[statutId].name
      : getDefaultNomStatut(statutId); // suppose dispo ailleurs

    const item = document.createElement('div');
    item.className = 'mb-3';
    item.innerHTML = `
      <button class="accordion-toggle w-full">
        ${statutIcons[statutId] || ''} ${nomStatut}
        ${regimeBadges[statutId] || ''}
        <i class="fas fa-plus ml-auto"></i>
      </button>
      <div class="hidden px-4 py-3 border-t border-gray-700 bg-blue-900 bg-opacity-20 rounded-b-lg">
        ${getStatutFiscalInfo(statutId)} <!-- suppose dispo ailleurs -->
      </div>
    `;
    accordionContainer.appendChild(item);
  });

  // Interactions
  accordionContainer.querySelectorAll('.accordion-toggle').forEach(btn => {
    btn.addEventListener('click', function () {
      const content = this.nextElementSibling;
      content.classList.toggle('hidden');
      const icon = this.querySelector('i:last-child');
      icon.classList.toggle('fa-plus');
      icon.classList.toggle('fa-minus');
      this.classList.toggle('active');
    }, { passive: true });
  });

  // Verrou "déjà construit"
  accordionContainer.dataset.built = '1';
}

// Fonction d'aide pour obtenir le nom par défaut si legalStatuses n'est pas disponible
function getDefaultNomStatut(statutId) {
    const noms = {
        'MICRO': 'Micro-entreprise',
        'EI': 'Entreprise Individuelle',
        'EURL': 'Entreprise Unipersonnelle à Responsabilité Limitée',
        'SASU': 'Société par Actions Simplifiée Unipersonnelle',
        'SARL': 'Société à Responsabilité Limitée',
        'SAS': 'Société par Actions Simplifiée',
        'SA': 'Société Anonyme',
        'SNC': 'Société en Nom Collectif',
        'SCI': 'Société Civile Immobilière',
        'SELARL': 'Société d\'Exercice Libéral à Responsabilité Limitée',
        'SELAS': 'Société d\'Exercice Libéral par Actions Simplifiée',
        'SCA': 'Société en Commandite par Actions'
    };
    return noms[statutId] || statutId;
}
});
// Fonction pour générer les informations fiscales de chaque statut
function getStatutFiscalInfo(statutId) {
  // Informations fiscales par défaut pour chaque statut
  const infosFiscales = {
    'MICRO': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
      <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
      <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services), 24.6% (BNC)</p>
      <p class="mb-2"><strong>Versement libératoire :</strong> 1% (vente), 1,7% (services), 2,2% (BNC) sur CA</p>
      <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente) / 77 700€ (services)</p>
    `,
    'EI': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IR, imposition sur le bénéfice</p>
      <p class="mb-2"><strong>Cotisations sociales :</strong> ~30% du bénéfice</p>
      <p class="mb-2"><strong>Avantages :</strong> Simplicité de gestion, frais réels déductibles</p>
      <p class="mb-2"><strong>Inconvénients :</strong> Pas de distinction entre patrimoine privé/pro</p>
    `,
    'EURL': `
      <p class="mb-2"><strong>Régimes fiscaux possibles :</strong> IR par défaut ou option IS</p>
      <p class="mb-2"><strong>IR :</strong> Imposition sur la totalité du bénéfice</p>
      <p class="mb-2"><strong>IS :</strong> Impôt sur les sociétés + PFU sur dividendes</p>
      <p class="mb-2"><strong>Cotisations sociales :</strong> Environ 30% de la rémunération du gérant (TNS)</p>
      <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes &gt; 10% du capital</p>
    `,
    'SASU': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS uniquement</p>
      <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
      <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Optimisation:</strong> Favoriser les dividendes</p>
    `,
    'SARL': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
      <p class="mb-2"><strong>Social gérant majoritaire :</strong> TNS (~45% de cotisations)</p>
      <p class="mb-2"><strong>Social gérant minoritaire :</strong> Assimilé salarié (~80%)</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Dividendes TNS :</strong> cotisations sociales sur la part &gt;10% (≈40–45%), sinon PS 17,2%.</p>
    `,
    'SAS': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
      <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
      <p class="mb-2"><strong>Cotisations :</strong> ~80% sur rémunération (22% salariales, 55% patronales)</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS (15%/25%) + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Capital minimal :</strong> Libre (1€ suffit)</p>
    `,
    'SA': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS (impôt sur les sociétés)</p>
      <p class="mb-2"><strong>Social :</strong> Président du CA assimilé salarié</p>
      <p class="mb-2"><strong>Particularités :</strong> Conseil d'administration obligatoire (3 membres min)</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
    `,
    'SNC': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IR (transparence fiscale)</p>
      <p class="mb-2"><strong>Particularités :</strong> Responsabilité indéfinie et solidaire des associés</p>
      <p class="mb-2"><strong>Social :</strong> Gérants et associés = TNS</p>
      <p class="mb-2"><strong>Fiscalité :</strong> Bénéfice imposé directement chez les associés</p>
    `,
    'SCI': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut, option IS possible</p>
      <p class="mb-2"><strong>Activité :</strong> Gestion immobilière (location nue principalement)</p>
      <p class="mb-2"><strong>IR :</strong> Revenus fonciers pour les associés + prélèvements sociaux 17.2%</p>
      <p class="mb-2"><strong>IS :</strong> Rarement avantageux sauf activité commerciale</p>
    `,
    'SELARL': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS presque toujours</p>
      <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
      <p class="mb-2"><strong>Social :</strong> Gérant majoritaire = TNS</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Dividendes TNS :</strong> cotisations sociales sur la part &gt;10% (≈40–45%), sinon PS 17,2%.</p>
    `,
    'SELAS': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
      <p class="mb-2"><strong>Particularités :</strong> Réservée aux professions libérales réglementées</p>
      <p class="mb-2"><strong>Social :</strong> Président assimilé salarié</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Capital minimal :</strong> Libre</p>
    `,
    'SCA': `
      <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
      <p class="mb-2"><strong>Structure :</strong> Commandités (responsabilité illimitée) et commanditaires</p>
      <p class="mb-2"><strong>Social :</strong> Gérants = TNS</p>
      <p class="mb-2"><strong>Fiscalité :</strong> IS + PFU 30% sur dividendes</p>
      <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes &gt; 10% du capital</p>
      <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
    `
  };

  return infosFiscales[statutId] || `<p>Informations non disponibles pour ${statutId}</p>`;
}

