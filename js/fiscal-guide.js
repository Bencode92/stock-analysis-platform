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
const VFL_RFR_LIMIT_PER_PART_2025 = 29315; // € / part, RFR N-2 (revalorisé 2026)
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
function cotisationsEIFromCash(sim) {
  const benef = Number(sim.beneficeAvantCotisations ?? sim.resultatAvantRemuneration ?? 0);
  const cash  = Number(sim.cashAvantIR ?? 0);
  if (cash) return round2(Math.max(0, benef - cash));
  return round2(Number(sim.cotisationsSociales ?? 0));
}
// --- Dividendes TNS : split PS 18,6% / Cotisations TNS (>10%) --- LFSS 2026
const TAUX_PS = 0.186;
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
const ABATT_TS_MIN  = 509;   // Plancher 2026 (revenus 2025)
const ABATT_TS_MAX  = 14555; // Plafond 2026 (revenus 2025)

/**
 * Base IR TNS = (net social + CSG/CRDS non déductible) - abattement 10% (min/max).
 * ✅ Si pas de rémunération (remBrute=0 ou netSocial=0) : CSGND = 0 et abattement = 0 (pas de -472 €).
 */
function baseImposableTNS({ remBrute = 0, netSocial = 0 }) {
  const hasRemu = (remBrute > 0) && (netSocial > 0);

  const csgND   = hasRemu ? remBrute * CSG_NOND_TAUX : 0;
  const abatCal = hasRemu ? remBrute * ABATT_TS_TAUX : 0;
  const abat    = hasRemu ? Math.min(ABATT_TS_MAX, Math.max(ABATT_TS_MIN, abatCal)) : 0;

  const base = Math.max(0, (netSocial + csgND) - abat);
  return { base, csgND, abat };
}

// --- Parts fiscales (quotient familial) — GLOBAL ---
function getNbParts() {
  const el = document.getElementById('sim-nb-parts');
  return el ? (parseFloat(el.value) || 1) : 1;
}
// --- ACRE (micro) ---
// --- ACRE 2026 (réforme janv. 2026 - urssaf.fr, service-public.gouv.fr) ---
const MICRO_SOC_TAUX = { BIC_VENTE: 0.123, BIC_SERVICE: 0.212, BNC: 0.256 }; // BNC SSI 25,6% 2026 (CIPAV: 23,2%)
const ACRE_REMISE_MAX = 0.25;  // 25% max (réforme 2026, était 50% avant)
const ACRE_MOIS   = 12;
const PASS_2026 = 48060;
const ACRE_SEUIL_PLEIN = 36045;  // 75% PASS
const ACRE_SEUIL_ZERO  = 48060;  // 100% PASS

function microTauxCotisations(typeMicro='BIC_SERVICE', { acre=false, mois=12, revenuPro=0 } = {}) {
  const base = MICRO_SOC_TAUX[typeMicro] ?? MICRO_SOC_TAUX.BIC_SERVICE;
  if (!acre) return base;
  
  // Dégressivité ACRE 2026
  let tauxExo;
  if (revenuPro <= ACRE_SEUIL_PLEIN) {
    tauxExo = ACRE_REMISE_MAX;
  } else if (revenuPro >= ACRE_SEUIL_ZERO) {
    tauxExo = 0;
  } else {
    tauxExo = ACRE_REMISE_MAX * (ACRE_SEUIL_ZERO - revenuPro) / (ACRE_SEUIL_ZERO - ACRE_SEUIL_PLEIN);
  }
  
  const prorata = Math.max(0, Math.min(12, mois)) / 12;
  return base * (1 - tauxExo * prorata);
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
        <div class="text-xs text-gray-400"><i class="fas fa-info-circle mr-1"></i>Capital libéré + primes + CCA <span class="text-gray-300">(× quote-part)</span></div>
        <div class="text-base md:text-lg font-semibold text-green-400">10% = <span id="tns-mini-seuil">—</span></div>
      </div>

      <div class="base10-card-accent"></div>
    </div>
  `;

  // ➜ insérer le bloc PUIS seulement maintenant, toucher #base-capital/#base-cca/#base-primes
  nbItem.parentNode.insertBefore(inline, nbItem.nextElementSibling);

  // ====== Formatage FR des montants saisis (robuste) ======
  const parseFR = (val) => {
    let s = String(val ?? '').trim();
    s = s.replace(/[€\s\u00A0\u202F]/g, '');
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
    else if (hasComma) s = s.replace(',', '.');
    else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const formatFR = (n) => Number(n || 0).toLocaleString('fr-FR');

  // Initialisation des 3 inputs (type=text pour accepter "10 000", "1.000", etc.)
  ['base-capital','base-cca','base-primes'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('type', 'text');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('pattern', '[0-9\\s,.\u00A0\u202F€]*');
    el.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('input', () => { el.dataset.raw = String(parseFR(el.value)); });
    ['change','blur'].forEach(ev => el.addEventListener(ev, () => {
      const raw = parseFR(el.dataset.raw ?? el.value);
      el.value = raw ? formatFR(raw) : '';
    }));
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

  // 🔄 calcul dynamique du seuil 10% — AVEC PRORATA DE PART DÉTENUE
  const fmtEUR = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:0});
  function updateBase10(){
    const total = val('base-capital') + val('base-primes') + val('base-cca');

    // part détenue par l'associé simulé (0–1)
    const partPctEl = document.getElementById('sim-part-associe');
    const part = Math.max(0, Math.min(1, (parseFloat(partPctEl?.value) || 100) / 100));

    // ✅ base proratisée = (capital + primes + CCA) × quote-part
    const baseQuotePart = total * part;

    // stocke la base PRORATISÉE pour le moteur (runComparison → calcDivTNS)
    const hidden = document.getElementById('base10-total');
    if (hidden) hidden.value = String(baseQuotePart);

    // affiche "10% = ..." sur la base PRORATISÉE
    const seuil10 = baseQuotePart > 0 ? baseQuotePart * 0.10 : 0;
    const out = document.getElementById('tns-mini-seuil');
    if (out) out.textContent = baseQuotePart > 0 ? fmtEUR.format(seuil10) : '—';

    // relance la simu
    if (typeof runComparison === 'function') runComparison();
  }

  // ⛓️ écouteurs (inclut la part détenue)
  ['base-capital','base-primes','base-cca','sim-part-associe'].forEach(id=>{
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

  // 🔗 Attache robuste sur l’onglet “Guide fiscal” (ordre indépendant)
  const guideTab = Array.from(document.querySelectorAll('.tab-item'))
    .find(el => el.textContent?.includes('Guide fiscal'));
  guideTab?.addEventListener('click', initFiscalSimulator);
}

// === Helpers ratio % (à coller AVANT setupSimulator) ===
function getPctSalaire(){ 
  const v = parseFloat(document.getElementById('sim-salaire')?.value);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 70;
}
function getPctDividendes(){
  const el = document.getElementById('sim-dividendes'); // OPTIONNEL si tu ajoutes l'input
  if (el) {
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 20;
  }
  // défaut si pas d’input dédié :
  return Math.max(0, 100 - getPctSalaire() - 10); // garde ~10% pour IS/réserve
}

  /** Réserve légale : prélève 5% du bénéfice (après IS) jusqu’à atteindre 10% du capital. */
function calcReserveLegale({ resultatApresIS, capitalLibere=0, reserveExistante=0, appliquer=true }) {
  if (!appliquer) return { reserve: 0, reste: round2(Math.max(0, resultatApresIS||0)) };
  const cap = Number(capitalLibere)||0;
  if (cap <= 0) return { reserve: 0, reste: round2(Math.max(0, resultatApresIS||0)) };

  const cible10 = 0.10 * cap;                              // 10% du capital
  const manque  = Math.max(0, cible10 - (Number(reserveExistante)||0));
  const base    = Math.max(0, Number(resultatApresIS)||0);
  const prelev  = Math.min( round2(base * 0.05), round2(manque) );  // 5% borné au manque
  const reste   = round2(Math.max(0, base - prelev));
  return { reserve: prelev, reste };
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
        <input type="checkbox" id="use-optimal-ratio" class="mr-2 h-4 w-4">
        <i class="fas fa-magic text-purple-400 mr-1"></i>
        <span class="text-sm">Ratio optimal</span>
      </label>
      <span class="info-tooltip mt-1">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">Optimise la part salaire/dividendes pour maximiser le net en poche.</span>
      </span>
    </div>

    <!-- 🔹 Réserve légale auto -->
    <div class="flex flex-col">
      <label class="flex items-center">
        <input type="checkbox" id="sim-reserve-auto" class="mr-2 h-4 w-4" checked>
        <i class="fas fa-shield-alt text-green-400 mr-1"></i>
        <span class="text-sm">Respecter la réserve légale</span>
      </label>
      <span class="info-tooltip mt-1">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">
          Met de côté 5% du bénéfice (après IS) jusqu’à atteindre 10% du capital. 
          Les dividendes sont ensuite limités au montant réellement distribuable.
        </span>
      </span>
    </div>
    <!-- 🔹 Fin -->

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
  <!-- 🔹 ACRE (réduction cotisations ~50% pendant 12 mois) -->
<div class="mt-2">
  <div class="flex items-center">
    <input type="checkbox" id="micro-acre" class="mr-2 h-4 w-4">
    <label for="micro-acre" class="text-gray-300">
      ACRE 2026 (max 25%, éligibilité restreinte)
    </label>
    <span class="info-tooltip ml-2">
      <i class="fas fa-question-circle text-gray-400"></i>
      <span class="tooltiptext">
        ⚠️ Réforme 2026 : max 25%, dégressive si revenu > 36 045 €. Éligibilité restreinte (demandeurs d'emploi, RSA, QPV...). Demande URSSAF obligatoire.
        N'affecte pas l'IR (barème ou versement libératoire).
      </span>
    </span>
  </div>

  <!-- 🔹 Éligibilité au taux réduit d'IS (15%) -->
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
 document
  .querySelectorAll(
    '.status-checkbox, #use-optimal-ratio, #use-avg-charge-rate, #micro-type, #micro-vfl, #micro-acre, #sarl-gerant-minoritaire, #is-capital-fully-paid, #is-pp-ownership' /* , '#micro-acre-mois' */
  )
  .forEach(el => el.addEventListener('change', runComparison));

// (optionnel) déclenche aussi sur saisie continue du % personnes physiques
document.getElementById('is-pp-ownership')?.addEventListener('input', runComparison);

// (optionnel) si tu utilises le prorata ACRE et veux recalculer en live
// document.getElementById('micro-acre-mois')?.addEventListener('input', runComparison);

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
             return ['micro','ei','eurl','eurlIS','sarl','sasu','sas','sa','snc','sci','sciIS','selarl','selas','sca'];
       case 'is_only':
              return ['eurlIS','sasu','sarl','sas','sa','selarl','selas','sca','sciIS'];
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
  
// Renvoie {blocRemTarget, profitPreIS}
function computeTargets(R, pctSalaire, pctDiv){
  const sum = Math.max(1, pctSalaire + pctDiv); // évite /0
  const shareRem = pctSalaire / sum;
  const blocRemTarget = R * shareRem;          // ce qu’on veut pour (brut + cotisations)
  const profitPreIS   = Math.max(0, R - blocRemTarget);
  return { blocRemTarget, profitPreIS };
}

// Estime brut/cotisations à partir d’un taux observé (fallback si absent)
function splitBrutFromBloc(blocTarget, {observedRate=null, fallback=0.40}){
  const tx = (observedRate!=null && isFinite(observedRate) && observedRate>=0) ? observedRate : fallback;
  const brut = blocTarget / (1 + tx);
  const cot  = blocTarget - brut;
  return { brut: round2(brut), cotisations: round2(cot) };
}

// Détecte le taux "cotisations / brut" selon le statut simulé
function getObservedRate(statutId, sim){
  if (['sasu','sas','sa','selas'].includes(statutId)) {
    const ch = (Number(sim.chargesPatronales)||0) + (Number(sim.chargesSalariales)||0);
    const b  = Number(sim.remuneration)||0;
    return b>0 ? (ch/b) : null;                // ~0.75–0.85
  }
  if (['eurlIS','sarl','selarl','sca','ei','eurl','snc'].includes(statutId)) {
    const cot = Number(sim.cotisationsSociales)||0;
    const b   = Number(sim.remuneration)||0;
    return b>0 ? (cot/b) : null;               // ~0.40–0.45 (TNS)
  }
  return null;
}
// ====== FiscalUtils : Optimiseur de ratio salaire/dividendes (drop-in) ======
window.FiscalUtils = window.FiscalUtils || {};

// Choisit automatiquement PFU vs Barème pour LES dividendes d’un TNS/assimilé
// Retourne { methode: 'PFU'|'PROGRESSIF', irDiv, ps172, cotTNS, nets, economie }
// - baseSeuil10 : base servant au seuil des 10% (déjà proratisée quote-part)
function chooseBestDividendMethod({ statutId, divBruts, tmi, baseSeuil10, tauxTNSDivFallback = 0.40 }) {
  const isAssimile = ['sasu','sas','sa','selas'].includes(statutId);

  // Calcule le split PFU (toujours valable)
  const pfu = (() => {
    if (isAssimile) {
      const irDiv = divBruts * 0.128;
      const ps172 = divBruts * TAUX_PS;
      return { methode:'PFU', irDiv, ps172, cotTNS:0, nets: divBruts - irDiv - ps172 };
    } else {
      const split = calcDivTNS({
        divBruts,
        baseSeuil10: baseSeuil10 || 0,
        methode: 'PFU',
        tmi,
        tauxTNS: tauxTNSDivFallback
      });
      return { methode:'PFU', ...split };
    }
  })();

  // Calcule le split Barème (abattement 40%)
  const prog = (() => {
    if (isAssimile) {
      // Assimilé : abattement 40% puis IR au TMI sur 60% (PS 17,2% sur 100%)
      const baseIR = divBruts * 0.60;
      const irDiv = baseIR * (tmi/100);
      const ps172 = divBruts * TAUX_PS;
      return { methode:'PROGRESSIF', irDiv, ps172, cotTNS:0, nets: divBruts - (irDiv + ps172) };
    } else {
      const split = calcDivTNS({
        divBruts,
        baseSeuil10: baseSeuil10 || 0,
        methode: 'PROGRESSIF',
        tmi,
        tauxTNS: tauxTNSDivFallback
      });
      return { methode:'PROGRESSIF', ...split };
    }
  })();

  // On garde la méthode qui donne le net le + élevé
  const best = (pfu.nets >= prog.nets) ? pfu : prog;
  const alt  = (best === pfu) ? prog : pfu;
  return { ...best, economie: Math.max(0, best.nets - alt.nets) };
}

// Optimise r ∈ [ratioMin, ratioMax] pour maximiser le net en poche de l’associé
// simulateFn(params) : ta fonction moteur par statut (ex: p => SimulationsFiscales.simulerSASU(p))
window.FiscalUtils.optimiserRatioRemuneration = function optimiserRatioRemuneration(
  params,
  simulateFn,
  opts = {}
) {
  const {
    ratioMin = 0, ratioMax = 1, favoriserDividendes = false,
    capitalSocial = 1, pasInitial = 0.01
  } = params;

  // Quick exit pour cas non optimisables
  const statutId = params.statutId || params.statut || '';
  if (['micro','ei','eurl','snc','sci','sciIS'].includes(statutId)) {
    const sim = simulateFn({ ...params, tauxRemuneration: 1 });
    return { resultat: sim, ratioOptimise: 1, methodeDividendes: sim?.methodeDividendes, economieMethode: sim?.economieMethode || 0 };
  }

  // Balayage grossier puis raffinement local
  function evaluateAtRatio(r, bestSoFar) {
    // 1) Simulation “brute” au ratio r pour avoir R (= résultat avant rémunération)
    let sim = simulateFn({ ...params, tauxRemuneration: r });
    if (!sim || sim.compatible === false) return null;

    // 2) Recompose proprement rémunération/cotisations à partir de R comme dans runComparison
    const R = round2(
      sim.resultatAvantRemuneration
      ?? sim.resultatEntreprise
      ?? sim.beneficeAvantCotisations
      ?? 0
    );

    // Si pas de résultat, rien à optimiser
    if (R <= 0) {
      sim.revenuNetTotal = round2(Number(sim.revenuNetSalaire || 0) + Number(sim.dividendesNets || 0));
      return { r, sim, score: sim.revenuNetTotal };
    }

    // Bloc rémunération cible + déduction d’un brut via taux observé/fallback
    const { blocRemTarget, profitPreIS } = computeTargets(R, r*100, Math.max(0, 100 - r*100));
    const observed = getObservedRate(statutId, sim);
    const fallback = ['sasu','sas','sa','selas'].includes(statutId) ? 0.80 : 0.42;
    const { brut, cotisations } = splitBrutFromBloc(blocRemTarget, { observedRate: observed, fallback });

    if (['sasu','sas','sa','selas'].includes(statutId)) {
      const totCharges = (Number(sim.chargesPatronales)||0) + (Number(sim.chargesSalariales)||0);
      const partPat = totCharges > 0 ? (Number(sim.chargesPatronales)||0)/totCharges : 0.70;
      sim.remuneration      = brut;
      sim.chargesPatronales = round2(cotisations * partPat);
      sim.chargesSalariales = round2(cotisations * (1 - partPat));
      sim.salaireNet = round2(sim.remuneration - sim.chargesSalariales);
      sim.remunerationNetteSociale = sim.salaireNet;
    } else {
      sim.remuneration        = brut;
      sim.cotisationsSociales = cotisations;
    }

    sim.resultatApresRemuneration = round2(Math.max(0, profitPreIS));

    // 3) IS progressif, réserve légale, distribuable
    const elig15 = !!params.is15Eligible;
    const isBreak = calcISProgressif(sim.resultatApresRemuneration, elig15);
    sim.is = isBreak.is;
    sim._isDetail = { elig15, ...isBreak };
    sim.resultatApresIS = round2(Math.max(0, sim.resultatApresRemuneration - sim.is));

    const { reserve, reste: distribuableSociete } = calcReserveLegale({
      resultatApresIS: sim.resultatApresIS,
      capitalLibere:   Number(params.capitalLibere)||0,
      reserveExistante: 0,
      appliquer: true
    });
    sim.reserveLegalePrelevee = reserve;

    // 4) Dividendes bruts (plafonnés au distribuable, puis quote-part)
    const targetDivSociete = round2(R * (1 - r));
    const divSociete       = Math.max(0, Math.min(targetDivSociete, distribuableSociete));
    const partDec          = Math.max(0, Math.min(1, Number(params.partAssocie || params.partAssociePrincipal || (params.partAssociePct||100)/100)));
    const divBrutsAssocie  = round2(divSociete * partDec);

    // 5) IR sur rémunération
    if (['sasu','sas','sa','selas'].includes(statutId)) {
      const brutSalaire = Number(sim.remuneration)||0;
      const netSocial   = Number(sim.salaireNet)||0;
      const { base, csgND, abat } = baseImposableTNS({ remBrute: brutSalaire, netSocial });
      sim.csgNonDeductible = csgND; sim.abattement10 = abat; sim.baseImposableIR = base;
    } else {
      const brutSalaire = Number(sim.remuneration)||0;
      const netSocial   = Number(sim.remunerationNetteSociale||0);
      const { base, csgND, abat } = baseImposableTNS({ remBrute: brutSalaire, netSocial });
      sim.csgNonDeductible = csgND; sim.abattement10 = abat; sim.baseImposableIR = base;
    }

    const nbParts = (typeof getNbParts === 'function') ? getNbParts() : 1;
    sim.impotRevenu = impotsIR2025(sim.baseImposableIR, nbParts);
    const tmi = getTMI(sim.baseImposableIR, nbParts);
    sim.revenuNetSalaire = Math.max(0, (sim.salaireNet || sim.remunerationNetteSociale || 0) - sim.impotRevenu);

    // 6) Dividendes : choisir PFU vs Barème
    const baseSeuil10 = Number(params.baseSeuilDivTNS) || getBaseSeuilDivTNS({
      capitalLibere: params.capitalLibere||0,
      primesEmission: params.primesEmission||0,
      comptesCourants: params.comptesCourants||0,
      partAssocie: partDec
    });

    const tauxTNSObserved = (sim.remuneration > 0 && sim.cotisationsSociales > 0)
      ? Math.max(0.40, Math.min(0.45, sim.cotisationsSociales / sim.remuneration))
      : 0.40;

    let divChoice = { methode: null, irDiv: 0, ps172: 0, cotTNS: 0, nets: 0, economie: 0 };
    if (divBrutsAssocie > 0) {
      divChoice = chooseBestDividendMethod({
        statutId, divBruts: divBrutsAssocie, tmi,
        baseSeuil10, tauxTNSDivFallback: tauxTNSObserved
      });
    }
    sim.dividendes = divBrutsAssocie;
    sim.methodeDividendes = divChoice.methode;
    sim.prelevementForfaitaire = (divChoice.irDiv||0) + (divChoice.ps172||0);
    sim.cotTNSDiv = divChoice.cotTNS||0;
    sim.dividendesNets = divChoice.nets||0;
    sim.economieMethode = divChoice.economie||0;

    // 7) Net total + score
    sim.revenuNetTotal = round2((sim.revenuNetSalaire||0) + (sim.dividendesNets||0));
    const score = sim.revenuNetTotal;

    // Tiebreaks doux
    if (bestSoFar && score === bestSoFar.score) {
      if (favoriserDividendes && ['sasu','sas','sa','selas'].includes(statutId) && (1 - r) > (1 - bestSoFar.r)) {
        return { r, sim, score, methodeDividendes: divChoice.methode, economieMethode: divChoice.economie };
      }
    }

    return { r, sim, score, methodeDividendes: divChoice.methode, economieMethode: divChoice.economie };
  }

  // Balayage grossier
  let step = pasInitial; // 1%
  let best = null;
  for (let r = ratioMin; r <= ratioMax + 1e-9; r += step) {
    const e = evaluateAtRatio(r, best);
    if (e && (!best || e.score > best.score)) best = e;
  }

  // Raffinement local autour du meilleur (±5 points → pas /10)
  if (best) {
    const left  = Math.max(ratioMin, best.r - 0.05);
    const right = Math.min(ratioMax, best.r + 0.05);
    step = Math.max(0.001, pasInitial / 10); // 0.1%
    for (let r = left; r <= right + 1e-9; r += step) {
      const e = evaluateAtRatio(r, best);
      if (e && e.score > best.score) best = e;
    }
  }

  if (!best) {
    const sim = simulateFn({ ...params, tauxRemuneration: ratioMin });
    return { resultat: sim, ratioOptimise: ratioMin, methodeDividendes: sim?.methodeDividendes, economieMethode: sim?.economieMethode||0 };
  }

  // Tag infos d’optimisation dans la simulation retournée
  best.sim.ratioOptimise = round2(best.r);
  best.sim.methodeDividendes = best.methodeDividendes ?? best.sim.methodeDividendes;
  best.sim.economieMethode   = best.economieMethode   ?? best.sim.economieMethode;

  return { resultat: best.sim, ratioOptimise: best.r, methodeDividendes: best.methodeDividendes, economieMethode: best.economieMethode };
};

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
   // ✅ AJOUT : ACRE (pour le bandeau + éventuels besoins globaux)
  const acreEnabled = !!document.getElementById('micro-acre')?.checked;
  const acreMois    = parseInt(document.getElementById('micro-acre-mois')?.value) || 12;
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
      'sciIS': '<i class="fas fa-home text-blue-400 status-icon"></i>',
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
      'sciIS': '<span class="regime-badge is">IS</span>',
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
  simuler: () => {
    const type = document.getElementById('micro-type')?.value || 'BIC_SERVICE';
    const vfl  = document.getElementById('micro-vfl')?.checked || false;

    // 🔹 Lecture ACRE (et prorata si tu as activé le champ mois)
    const acreEnabled = document.getElementById('micro-acre')?.checked || false;
    const acreMois = parseInt(document.getElementById('micro-acre-mois')?.value) || 12;

    // 🔹 Lecture MARGE depuis l'UI (robuste : évite || qui écrase 0)
    const margePctUI = parseFloat(document.getElementById('sim-marge')?.value);
    const tauxMarge = Number.isFinite(margePctUI)
      ? Math.max(0, Math.min(1, margePctUI / 100))
      : 0.30;

    // 🧮 Appel moteur avec tauxMarge
    const sim = window.SimulationsFiscales.simulerMicroEntreprise({
      ca: ca,
      typeMicro: type,
      tmiActuel: tmi,
      modeExpert: modeExpert,
      versementLiberatoire: vfl,
      acre: acreEnabled,
      acreMois: acreMois,
      tauxMarge: tauxMarge
    });

    // ═══════════════════════════════════════════════════════════════
    // 🔧 PATCH : Forcer le calcul marge/dépenses/cashNetReel côté UI
    //    (contourne le bug du moteur qui ignore tauxMarge)
    // ═══════════════════════════════════════════════════════════════
    if (sim?.compatible) {
      // 1) Recaler la marge réelle
      sim.tauxMarge = tauxMarge;
      sim.tauxMargePct = `${Math.round(tauxMarge * 100)}%`;

      // 2) Dépenses pro et bénéfice réel
      sim.depensesPro = round2(ca * (1 - tauxMarge));
      sim.beneficeReel = round2(ca - sim.depensesPro);

      // 3) Recalculer le cash net réel
      const cotSoc = Number(sim.cotisationsSociales) || 0;
      const cfp    = Number(sim.cfp) || 0;
      const cfe    = Number(sim.cfe) || 0;
      const ir     = Number(sim.impotRevenu) || 0;

      sim.cashNetReel = round2(ca - sim.depensesPro - cotSoc - cfp - cfe - ir);

      // 4) Ratios
      sim.ratioCashNetCA = ca > 0 ? round2((sim.cashNetReel / ca) * 100) : 0;

      // 5) Warnings si micro défavorable
      const abattements = { BIC_VENTE: 0.71, BIC_SERVICE: 0.50, BNC: 0.34 };
      const abattEff = abattements[type] || 0.50;
      sim.beneficeForfaitaire = round2(ca * (1 - abattEff));
      sim.microDefavorable = tauxMarge < (1 - abattEff);

      if (!sim.warnings) sim.warnings = [];
      if (sim.microDefavorable && !sim.warnings.some(w => w.includes('défavorable'))) {
        sim.warnings.push(`⚠️ Micro potentiellement défavorable : marge réelle (${Math.round(tauxMarge * 100)}%) < bénéfice forfaitaire (${Math.round((1 - abattEff) * 100)}%).`);
      }
      if (sim.cashNetReel < 0 && !sim.warnings.some(w => w.includes('négatif'))) {
        sim.warnings.push(`🚨 Cash net réel négatif (${Math.round(sim.cashNetReel)}€). Micro non viable.`);
      }
    }
    // ═══════════════════════════════════════════════════════════════

    // 🔒 Patch ACRE (garanti même si le moteur ne le gère pas)
    if (acreEnabled && sim?.compatible) {
      // Revenu pro estimé = CA × (1 - abattement)
      const abattements = { BIC_VENTE: 0.71, BIC_SERVICE: 0.50, BNC: 0.34 };
      const revenuProEstime = ca * (1 - (abattements[type] || 0.50));
      const txACRE = microTauxCotisations(type, { acre: true, mois: acreMois, revenuPro: revenuProEstime });
      sim.cotisationsSociales = round2(ca * txACRE);

      const impots = Number(sim.impotRevenu) || 0;
      const cfp = Number(sim.cfp) || 0;
      const cfe = Number(sim.cfe) || 0;

      // Recalculer cashNetReel avec le nouveau taux ACRE
      sim.cashNetReel = round2(ca - sim.depensesPro - sim.cotisationsSociales - cfp - cfe - impots);
      sim.ratioCashNetCA = ca > 0 ? round2((sim.cashNetReel / ca) * 100) : 0;

      sim._acre_applique = { txAvant: MICRO_SOC_TAUX[type], txApres: txACRE, mois: acreMois };
    }

    return sim;
  }
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
     'sciIS': {
  nom: 'SCI (option IS)',
  simuler: () => {
    // 1) Entrées “douces”
    const revenusLocatifs = Number(params.ca) || 0;

    // Marge depuis l’UI (#sim-marge), défaut 30% si absent
    const uiMarge = parseFloat(document.getElementById('sim-marge')?.value);
    const tauxMarge = Number.isFinite(uiMarge)
      ? Math.max(0, Math.min(1, uiMarge / 100))
      : 0.30;

    // Si ton moteur fournit des charges / amortissements détaillés, on les respecte.
    // Sinon on dérive le résultat via la marge.
    const chargesDeductiblesInput =
      Number(params.chargesDeductibles ?? 0);
    const amortissementAnnuelInput =
      Number(params.amortissementAnnuel ?? 0)
      || Number(window?.SimulationsFiscales?.amortissementAnnuel ?? 0)
      || Number(window?.amortissementAnnuel ?? 0)
      || 0;

    const utiliserDetail =
      (chargesDeductiblesInput > 0 || amortissementAnnuelInput > 0);

    // 2) Résultat avant IS (bénéfice fiscal)
    const resultatAvantIS = round2(
      utiliserDetail
        ? (revenusLocatifs - chargesDeductiblesInput - amortissementAnnuelInput)
        : (revenusLocatifs * tauxMarge)
    );

    // 3) IS progressif (15% si éligible jusqu'au plafond, puis 25%)
    const elig15 = !!params.is15Eligible;
    const isBreak = calcISProgressif(resultatAvantIS, elig15); // -> { is, part15, part25, tauxMoyen }
    const resultatApresIS = round2(Math.max(0, resultatAvantIS - isBreak.is));

    // 4) Politique de distribution : 100% (adapter si tu ajoutes un input)
    const pctDistribution = 1;
    const dividendesSociete = round2(resultatApresIS * pctDistribution);

    // 5) Quote-part de l’associé simulé (0–1)
    const partAssocieDec = Math.max(
      0,
      Math.min(1, params.partAssocie || (params.partAssociePct || 100) / 100)
    );

    const dividendesBrutsAssocie = round2(dividendesSociete * partAssocieDec);

    // 6) Fiscalité dividendes : PFU 30% (12,8% IR + 17,2% PS). Pas de TNS en SCI-IS.
    const irDiv = round2(dividendesBrutsAssocie * 0.128);
    const ps172 = round2(dividendesBrutsAssocie * TAUX_PS);
    const nets  = round2(dividendesBrutsAssocie - irDiv - ps172);

    // 7) Sortie “compatible” avec ton tableau récap
    const sim = {
      compatible: true,
      statutId: 'sciIS',

      // Base & résultats
      ca: revenusLocatifs,
      resultatAvantRemuneration: resultatAvantIS, // pour cohérence écran
      resultatApresRemuneration: resultatAvantIS, // pas de salaire en SCI-IS
      is: isBreak.is,
      _isDetail: { elig15, ...isBreak },
      resultatApresIS,

      // Dividendes
      dividendes: dividendesBrutsAssocie,
      methodeDividendes: 'PFU',
      prelevementForfaitaire: irDiv + ps172, // IR + PS
      cotTNSDiv: 0,                          // jamais en SCI-IS
      dividendesNets: nets,
      economieMethode: 0,

      // Pas de rémunération
      remuneration: 0,
      cotisationsSociales: 0,
      chargesPatronales: 0,
      chargesSalariales: 0,
      remunerationNetteSociale: 0,
      salaireNet: 0,
      revenuNetSalaire: 0,

      // Paramètres d’associé
      nbAssocies: params.nbAssocies,
      partAssocie: partAssocieDec,
      partAssociePct: params.partAssociePct,

      // Net total = dividendes nets
      revenuNetTotal: nets,
      ratioNetCA: revenusLocatifs > 0 ? round2((nets / revenusLocatifs) * 100) : 0,
    };

    return sim;
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

      // --- C. Fixer le bloc rémunération selon % et NE PAS aplatir le reliquat ---
     if (sim && sim.compatible) {

 // ⛔️ SCI à l’IS : pas de rémunération, 100% dividendes
if (statutId === 'sciIS') {
  // A) Neutraliser toute rémunération
  sim.remuneration = 0;
  sim.cotisationsSociales = 0;
  sim.chargesPatronales = 0;
  sim.chargesSalariales = 0;

  // B) Base IS = résultat avant IS (on ne retire aucun “salaire”)
  sim.resultatApresRemuneration = round2(
    sim.resultatAvantRemuneration ?? sim.resultatEntreprise ?? 0
  );

  // C) Forcer les champs "net total" côté associé (100% dividendes)
  //    (si les dividendes nets sont déjà calculés ici, on fige tout de suite ;
  //     sinon, ce sera réévalué plus loin après le calcul du PFU.)
  sim.revenuNetSalaire = 0; // aucune rémunération en SCI-IS

  if (typeof sim.dividendesNets === 'number') {
    sim.revenuNetTotal = round2(sim.dividendesNets);
    sim.ratioNetCA = sim.ca > 0 ? round2((sim.revenuNetTotal / sim.ca) * 100) : 0;
  }
  
} else {
  const R = round2(
    sim.resultatAvantRemuneration
    ?? sim.resultatEntreprise
    ?? sim.beneficeAvantCotisations
    ?? 0
  );

  // 1) Cible bloc rémunération (brut + cotisations) via % utilisateur
  const pctSalaire = getPctSalaire();
  const pctDiv     = getPctDividendes();
  const { blocRemTarget, profitPreIS } = computeTargets(R, pctSalaire, pctDiv);

  // 2) Taux observé → déduire un BRUT qui matche le bloc cible
  const observed = getObservedRate(statutId, sim);
  const fallback = ['sasu','sas','sa','selas'].includes(statutId) ? 0.80 : 0.42; // assimilé / TNS
  const { brut, cotisations } = splitBrutFromBloc(blocRemTarget, { observedRate: observed, fallback });

  // 3) Écritures propres (sans écraser le reliquat !)
  if (['sasu','sas','sa','selas'].includes(statutId)) {
    const totCharges = (Number(sim.chargesPatronales)||0) + (Number(sim.chargesSalariales)||0);
    const partPat = totCharges > 0 ? (Number(sim.chargesPatronales)||0)/totCharges : 0.70;
    sim.remuneration      = brut;
    sim.chargesPatronales = round2(cotisations * partPat);
    sim.chargesSalariales = round2(cotisations * (1 - partPat));
    sim.salaireNet = round2(sim.remuneration - sim.chargesSalariales);
    sim.remunerationNetteSociale = sim.salaireNet;

  } else if (['eurlIS','sarl','selarl','sca','ei','eurl','snc'].includes(statutId)) {
    // ═══════════════════════════════════════════════════════════════════════════
    // FIX: Ne pas écraser les cotisations pour les statuts IR (ei, eurl, snc)
    // Ces statuts n'ont pas de split salaire/dividendes - le moteur calcule
    // correctement les cotisations TNS sur l'intégralité du bénéfice.
    // Le recalcul via splitBrutFromBloc() ne s'applique qu'aux statuts IS.
    // ═══════════════════════════════════════════════════════════════════════════
    const isStatutIRPur = ['ei','eurl','snc','sci'].includes(statutId);
    if (!isStatutIRPur) {
      // Statuts IS TNS : recalcul bloc rémunération selon ratio UI
      sim.remuneration        = brut;
      sim.cotisationsSociales = cotisations;
    }
    // Statuts IR : conserver les valeurs du moteur (cotisationsSociales intactes)
  }

  // 4) Le reliquat (profit avant IS) sert de base à l'IS
  sim.resultatApresRemuneration = round2(profitPreIS);
}
       }
      // --- fin C ---

      // ----- Calcul IS par tranches pour les statuts à l’IS (après C) -----
{
 const isStatutIS = ['eurlIS','sarl','selarl','sca','sasu','sas','sa','selas','sciIS'].includes(statutId);

  if (isStatutIS && sim && sim.compatible) {
    // Bénéfice base IS = résultat après rémunération (avant IS)
    const benefIS = Number(sim.resultatApresRemuneration ?? sim.resultatEntreprise ?? 0);

    // Éligible 15 % ?
    const elig15  = !!params.is15Eligible;

    // IS progressif (15 % si éligible jusqu’à 42 500 €, puis 25 %)
    const isBreak = calcISProgressif(benefIS, elig15);
    sim.is        = isBreak.is;
    sim._isDetail = { elig15, ...isBreak };
    sim.resultatApresIS = round2(Math.max(0, benefIS - sim.is));

    // Réserve légale (option)
    const applyReserve = document.getElementById('sim-reserve-auto')
      ? !!document.getElementById('sim-reserve-auto').checked
      : true;

    const { reserve, reste } = calcReserveLegale({
      resultatApresIS: sim.resultatApresIS,
      capitalLibere:   params.capitalLibere,
      // facultatif :
      primesEmission:  params.primesEmission,
      compteCourant:   params.comptesCourants,
      reserveExistante: 0,
      appliquer:       applyReserve
    });

    sim.reserveLegalePrelevee = reserve;
    const distribuableSociete = reste; // bénéfice distribuable (après IS & réserve)

    // ⛔️ SCI-IS : 100% dividendes (on ignore totalement le ratio UI)
    if (statutId === 'sciIS') {
      const partDec = (() => {
        const p = (sim.partAssocie ?? (sim.partAssociePct ?? 100) / 100);
        return Math.max(0, Math.min(1, Number(p) || 0));
      })();

      const dividendesBrutsAssocie = round2(Math.max(0, distribuableSociete) * partDec);

      sim.dividendes            = dividendesBrutsAssocie;
      sim.methodeDividendes     = 'PFU';
      const ir  = round2(dividendesBrutsAssocie * 0.128);
      const ps  = round2(dividendesBrutsAssocie * TAUX_PS);
      sim.prelevementForfaitaire = ir + ps; // IR + PS
      sim.cotTNSDiv             = 0;        // jamais en SCI-IS
      sim.dividendesNets        = round2(dividendesBrutsAssocie - ir - ps);

    } else {
      // Cas général (autres statuts IS) : on respecte le ratio UI, plafonné au distribuable
      const pctSalaire = getPctSalaire();
      const pctDiv     = getPctDividendes();
      const R = round2(
        sim.resultatAvantRemuneration
        ?? sim.resultatEntreprise
        ?? sim.beneficeAvantCotisations
        ?? 0
      );
      const sumPct            = Math.max(1, pctSalaire + pctDiv);
      const targetDivSociete  = round2(R * (pctDiv / sumPct));
      const dividendesSociete = Math.min(targetDivSociete, distribuableSociete);

      // Quote-part de l’associé simulé
      sim.dividendes = round2(dividendesSociete * (sim.partAssocie || 1));
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
  net = sim.cashNetReel ?? sim.revenuNetApresImpot;

} else if (statutId === 'ei') {
  brut = sim.beneficeAvantCotisations;

  // ✅ cotisations reconstituées depuis le cash si dispo (sinon fallback)
  charges = Math.max(0, Math.round(cotisationsEIFromCash(sim)));

  impots = sim.impotRevenu;
  net = sim.revenuNetApresImpot;

} else if (statutId === 'eurl' && !sim.is) {
  // FIX: Utiliser beneficeAvantCotisations si dispo, sinon ca * marge (variables du scope)
  brut = sim.beneficeAvantCotisations ?? (ca * marge);
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
   } else if (statutId === 'sciIS') {
  // SCI à l’IS : pas de rémunération, tout en dividendes
  brut    = 0;
  charges = 0;
  // impôts = IS + PFU (IR 12,8 + PS 17,2) déjà cumulés
  impots  = (Number(sim.is)||0) + (Number(sim.prelevementForfaitaire)||0);
  net     = Number(sim.dividendesNets)||0;

} else {
// Cas général pour les statuts à l'IS (SASU, EURL-IS, SAS, SARL, SELARL, SELAS, SA, SCA)
brut    = sim.remuneration || sim.resultatEntreprise * (useOptimalRatio ? sim.ratioOptimise : ratioSalaire);
charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);

// ⚠️ Dividendes : TNS uniquement pour SARL/EURL-IS/SELARL/SCA avec gérant maj.
// (SASU/SAS/SA/SELAS = non TNS -> PS 17,2% sur 100%, jamais de TNS)
const divBruts = Number(sim.dividendes) || 0;
const base10   = Number(document.getElementById('base10-total')?.value) || getBaseSeuilDivTNS(sim) || 0;

const isTNSFamily = ['sarl','eurlIS','selarl','sca'].includes(statutId);
const isGerantMaj = isTNSFamily ? !!gerantMajoritaire : false;

// Taux TNS : observe si dispo, sinon fallback borné
const tauxObserve = (Number(sim.cotisationsSociales) > 0 && Number(sim.remuneration) > 0)
  ? (sim.cotisationsSociales / sim.remuneration)
  : null;
const tauxTNS = (tauxObserve != null)
  ? Math.max(0.40, Math.min(0.45, tauxObserve))
  : TAUX_TNS_DIV_FALLBACK;

let split = null;
if (divBruts > 0) {
  const isAssimile = ['sasu','sas','sa','selas'].includes(statutId);

  if (isAssimile) {
    // PFU standard sur 100% des dividendes (aucune cotisation TNS)
    const irDiv = divBruts * TAUX_IR_PFU; // 0.128
    const ps172 = divBruts * TAUX_PS;     // 0.186 (LFSS 2026)

    split = {
      partPS: divBruts,    // PS sur 100%
      partTNS: 0,
      ps172,
      cotTNS: 0,
      irDiv,
      totalPrels: irDiv + ps172,
      nets: divBruts - (irDiv + ps172),
      methode: 'PFU'
    };
  } else {
   // ✅ TNS (EURL-IS / SARL / SELARL / SCA) : choisir automatiquement PFU vs Barème
const choix = chooseBestDividendMethod({
  statutId,
  divBruts,
  tmi,
  baseSeuil10: base10,        // capital + primes + CCA × quote-part
  tauxTNSDivFallback: tauxTNS,
  isGerantMajoritaire: isGerantMaj, // optionnel : si ta logique en tient compte
  eligibleAbattement40: true        // garde l'info si utile à ton moteur
});
     split = { ...choix }; // <-- IMPORTANT
}

  // Persistance & totaux communs
  sim._divSplit              = split;                 // { partPS, partTNS, ps172, cotTNS, irDiv, totalPrels, nets, ... }
  sim.methodeDividendes      = split.methode;
  sim.economieMethode        = split.economie;
  sim.prelevementForfaitaire = split.irDiv + split.ps172; // IR + PS
  sim.cotTNSDiv              = split.cotTNS;              // 0 en assimilé
  sim.dividendesNets         = split.nets;

  // Totaux impôts (évite le double comptage)
  impots = (sim.impotRevenu || 0) + (sim.is || 0)
         + (split.irDiv || 0) + (split.ps172 || 0) + (split.cotTNS || 0);
} else {
  // pas de dividendes
  impots = (sim.impotRevenu || 0) + (sim.is || 0) + (sim.prelevementForfaitaire || 0) + (sim.cotTNSDiv || 0);
}

// (4) Recomposition propre du net total + ratio (IS)
{
  const salaireApresIR = Number(sim.revenuNetSalaire) || 0; // net après IR déjà calculé
  const divNets        = Number(sim.dividendesNets)   || 0; // nets après PFU/barème + PS/TNS

  sim.revenuNetTotal = round2(salaireApresIR + divNets);
  sim.ratioNetCA     = ca > 0 ? round2((sim.revenuNetTotal / ca) * 100) : 0;

  // Propager vers la ligne du tableau (recale impôts via _divSplit si présent)
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
    <span class="ml-2 text-xs text-gray-400">(Conforme au barème 2026, revenus 2025)</span>
    ${useAvgChargeRate ? '<span class="ml-3"><i class="fas fa-receipt mr-1"></i>Frais réels activés</span>' : ''}
    ${versementLiberatoire ? '<span class="ml-3"><i class="fas fa-percentage mr-1"></i>VFL micro-entreprise</span>' : ''}
    ${acreEnabled ? '<span class="ml-3"><i class="fas fa-leaf mr-1"></i>ACRE micro</span>' : ''}
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
  'sciIS': true,
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
  'sciIS': true,
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
// 1) Montant d'IR 2026 (progressif, revenus 2025) – avec quotient familial
function impotsIR2025(baseImposable, nbParts = 1) {
  const T = [
    { min: 0,      max: 11600,  taux: 0.00 },
    { min: 11600,  max: 29579,  taux: 0.11 },
    { min: 29579,  max: 84577,  taux: 0.30 },
    { min: 84577,  max: 181917, taux: 0.41 },
    { min: 181917, max: Infinity, taux: 0.45 },
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
// Barème IR 2026 (revenus 2025) - Fonction utilitaire pour calculer le TMI effectif
function getTMI(revenu, nbParts = 1) {
  const part = Math.max(0, revenu) / Math.max(1, nbParts);
  if (part <= 11600)   return 0;
  if (part <= 29579)   return 11;
  if (part <= 84577)   return 30;
  if (part <= 181917)  return 41;
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
  // % marge de la société (prend l'input UI si dispo, sinon recalcule)
function getMargePct(sim){
  const ui = parseFloat(document.getElementById('sim-marge')?.value);
  if (Number.isFinite(ui)) return ui; // ex. 90
  if (Number.isFinite(sim?.tauxMarge)) return sim.tauxMarge * 100;
  const numer = Number(sim?.resultatEntreprise ?? sim?.resultatAvantRemuneration);
  const denom = Number(sim?.ca);
  return denom > 0 ? (numer / denom) * 100 : 0;
}

// % de quote-part de l’associé affiché
function getQuotePartPct(sim){
  if (sim?.partAssociePct != null) return Number(sim.partAssociePct);
  if (sim?.partAssocie != null)    return Number(sim.partAssocie) * 100;
  return 100;
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
  // ====== Micro-entreprise : lecture du moteur (result.sim) ======
  const sim = result?.sim ?? {};

  // Identité micro
  const typeMicro = sim.typeMicro || 'BIC_SERVICE';
  const versementLiberatoire = !!sim.versementLiberatoire;

  // Valeurs calculées par le moteur (source de vérité)
  const caMicro      = Number(sim.ca) || 0;
  const depensesPro  = Number(sim.depensesPro) || 0;

  // cashNetReel prioritaire ; fallback si le moteur utilise un autre nom
  const cashNetReel  =
    (sim.cashNetReel != null ? Number(sim.cashNetReel) : null) ??
    (sim.revenuNetApresImpot != null ? Number(sim.revenuNetApresImpot) : 0);

  const netFiscal    = Number(sim.revenuNetApresImpot) || 0;
  const warnings     = Array.isArray(sim.warnings) ? sim.warnings : [];
  const tauxMargePct = sim.tauxMargePct ?? '—';

  // Bénéfices (moteur d'abord, fallback safe)
  const benefReelEst =
    (sim.beneficeReel != null ? Number(sim.beneficeReel) : null) ??
    (caMicro - depensesPro);

  const benefForfait = Number(sim.beneficeForfaitaire) || 0;

  // Charges (moteur)
  const cotSoc = Number(sim.cotisationsSociales) || 0;
  const cfp    = Number(sim.cfp) || 0;
  const cfe    = Number(sim.cfe) || 0;
  const ir     = Number(sim.impotRevenu) || 0;

  // Taux (affichage / référentiel)
  const tauxAbattement = { BIC_VENTE: 71, BIC_SERVICE: 50, BNC: 34 };
  const tauxVFL        = { BIC_VENTE: 1,  BIC_SERVICE: 1.7, BNC: 2.2 };
  const abattPct       = tauxAbattement[typeMicro] || 0;

  // ACRE : affichage du taux
  const txSansAcre = (MICRO_SOC_TAUX?.[typeMicro] ?? 0.212) * 100;
  const txAvecAcre = sim._acre_applique
    ? microTauxCotisations(typeMicro, { acre: true, mois: sim._acre_applique.mois }) * 100
    : txSansAcre;

  const revenuImposable = Number(sim.revenuImposable) || 0;
  const tmiEffectif = versementLiberatoire ? null : getTMI(revenuImposable, nbParts);

  detailContent = `
    <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - Micro-entreprise</h2>

    ${warnings.length > 0
      ? `<div class="mb-4 p-3 bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg text-xs">
          ${warnings.map(w => `<p><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>${w}</p>`).join('')}
         </div>`
      : ''
    }

    <div class="detail-category">Données de base</div>
    <table class="detail-table">
      <tr><td>Chiffre d'affaires</td><td>${formatter.format(caMicro)}</td></tr>
      <tr><td>Type de micro-entreprise</td><td>${typeMicro}</td></tr>
      <tr><td>Taux de marge réel</td><td>${tauxMargePct}</td></tr>
      <tr><td>Dépenses pro estimées</td><td class="text-orange-400">- ${formatter.format(depensesPro)}</td></tr>
      <tr><td>Bénéfice réel estimé</td><td>${formatter.format(benefReelEst)}</td></tr>
      <tr><td>Bénéfice forfaitaire (abattement ${abattPct}%)</td><td>${formatter.format(benefForfait)}</td></tr>
      <tr>
        <td>Versement libératoire</td>
        <td>${versementLiberatoire
          ? `<span class="text-green-400">Activé (${tauxVFL[typeMicro]}% du CA)</span>`
          : '<span class="text-gray-400">Non activé</span>'
        }</td>
      </tr>
    </table>

    <div class="detail-category">Charges sociales</div>
    <table class="detail-table">
      <tr><td>Base de calcul</td><td>${formatter.format(caMicro)}</td></tr>
      <tr>
        <td>Taux de cotisations</td>
        <td>${sim._acre_applique
          ? `<span class="text-green-400">${txAvecAcre.toFixed(1)}% (ACRE)</span>
             <small class="text-gray-400 ml-2">au lieu de ${txSansAcre.toFixed(1)}%</small>`
          : `${txSansAcre.toFixed(1)}%`
        }</td>
      </tr>
      ${sim._acre_applique
        ? `<tr><td>ACRE appliquée</td><td>−50% sur ${sim._acre_applique.mois}/12 mois</td></tr>`
        : ''
      }
      <tr><td>Cotisations sociales</td><td>${formatter.format(cotSoc)}</td></tr>
      ${cfp ? `<tr><td>CFP</td><td>${formatter.format(cfp)}</td></tr>` : ''}
      ${cfe ? `<tr><td>CFE</td><td>${formatter.format(cfe)}</td></tr>` : ''}
    </table>

    <div class="detail-category">Impôt sur le revenu</div>
    <table class="detail-table">
      ${versementLiberatoire
        ? `<tr><td>Versement libératoire</td><td>${tauxVFL[typeMicro]}% du CA</td></tr>
           <tr><td>Montant</td><td>${formatter.format(ir)}</td></tr>`
        : `<tr><td>Revenu imposable</td><td>${formatter.format(revenuImposable)}</td></tr>
           <tr><td>TMI</td><td>${tmiEffectif}%</td></tr>
           <tr><td>IR</td><td>${formatter.format(ir)}</td></tr>`
      }
    </table>

    <div class="detail-category">Résultat final</div>
    <table class="detail-table">
      <tr><td>Chiffre d'affaires</td><td>${formatter.format(caMicro)}</td></tr>
      <tr><td>- Dépenses pro</td><td class="text-orange-400">- ${formatter.format(depensesPro)}</td></tr>
      <tr class="border-t border-gray-600"><td><strong>= Bénéfice réel</strong></td><td><strong>${formatter.format(benefReelEst)}</strong></td></tr>
      <tr><td>- Cotisations</td><td>${formatter.format(cotSoc)}</td></tr>
      ${cfp ? `<tr><td>- CFP</td><td>${formatter.format(cfp)}</td></tr>` : ''}
      ${cfe ? `<tr><td>- CFE</td><td>${formatter.format(cfe)}</td></tr>` : ''}
      <tr><td>- ${versementLiberatoire ? 'VFL' : 'IR'}</td><td>${formatter.format(ir)}</td></tr>

      <tr class="border-t border-gray-600">
        <td><strong class="text-green-400">= Cash net réel</strong></td>
        <td><strong class="text-green-400">${formatter.format(cashNetReel)}</strong></td>
      </tr>
      <tr>
        <td class="text-xs text-gray-400">Net fiscal micro (référence)</td>
        <td class="text-xs text-gray-400">${formatter.format(netFiscal)}</td>
      </tr>
      <tr><td>Ratio cash/CA</td><td>${(caMicro > 0 ? (cashNetReel / caMicro * 100) : 0).toFixed(1)}%</td></tr>
    </table>

    <div class="mt-4 p-3 bg-blue-900 bg-opacity-20 rounded-lg text-xs">
      <i class="fas fa-info-circle text-blue-400 mr-2"></i>
      <strong>Hypothèse :</strong> dépenses pro = CA × (1 − marge). Ajuste la marge pour refléter tes charges réelles.
    </div>
  `;
} else if (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa' || statutId === 'selas') {
  // Cas des structures avec dirigeant assimilé salarié

  // Helper anti-NaN
  const getNumber = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;

  const hasDividendes = result.sim.dividendes && result.sim.dividendes > 0;
  const salaireNet = getNumber(result.sim.salaireNet);

  // ✅ Récupère ce que baseImposableTNS() a calculé en amont
  const csgNonDeductible = getNumber(result.sim.csgNonDeductible);
  const abattement10     = getNumber(result.sim.abattement10);

  // ✅ Base imposable = (net + CSG ND) − abattement (borné à 0)
  const baseImposableIR  = getNumber(result.sim.baseImposableIR)
                        || Math.max(0, (salaireNet + csgNonDeductible) - abattement10);

  // TMI calculé sur la BASE IMPOSABLE (pas sur le net)
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
</tr>` : ''}

${abattement10 > 0 ? `
<tr>
  <td>- Abattement 10% (min/max)</td>
  <td>- ${formatter.format(abattement10)}</td>
</tr>` : ''}

<tr class="border-t border-gray-600">
  <td><strong>= Base imposable IR</strong></td>
  <td><strong>${formatter.format(baseImposableIR)}</strong></td>
</tr>

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
                <td>${formatter.format(result.sim.dividendes * TAUX_PS)}</td>
            </tr>
            ` : `
            <tr>
                <td>IR sur dividendes (12,8%)</td>
                <td>${formatter.format(result.sim.dividendes * 0.128)}</td>
            </tr>
            <tr>
                <td>Prélèvements sociaux (17,2%)</td>
                <td>${formatter.format(result.sim.dividendes * TAUX_PS)}</td>
            </tr>
            `}
<tr>
 <td>Total prélèvements sur dividendes</td>
  <td>${
    formatter.format(
      (result.sim._divSplit
        ? (result.sim._divSplit.irDiv + result.sim._divSplit.ps172)
        : (result.sim.prelevementForfaitaire || 0)
      )
    )
  }</td>
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
      <p class="font-mono">${
        formatter.format(salaireNet)
      } + ${formatter.format(csgNonDeductible)} − ${formatter.format(abattement10)} = ${
        formatter.format(baseImposableIR)
      }</p>
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
          <td>${formatter.format(split ? split.ps172 : (result.sim.dividendes || 0) * TAUX_PS)}</td></tr>
      ${split && split.cotTNS ? `<tr><td>Cotisations TNS (>10%)</td><td>${formatter.format(split.cotTNS)}</td></tr>` : ''}
    ` : `
      <tr><td>Abattement de 40%</td>
          <td>${formatter.format((result.sim.dividendes || 0) * 0.40)}</td></tr>
      <tr><td>Base imposable après abattement</td>
          <td>${formatter.format((result.sim.dividendes || 0) * 0.60)}</td></tr>
      <tr><td>IR (TMI)</td>
          <td>${formatter.format(split ? split.irDiv : (result.sim.dividendes || 0) * 0.60 * (tmiEffectif / 100))}</td></tr>
      <tr><td>Prélèvements sociaux 17,2% (≤10%)</td>
          <td>${formatter.format(split ? split.ps172 : (result.sim.dividendes || 0) * TAUX_PS)}</td></tr>
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

  // Helper anti-NaN
  const getNumber = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;

  // Bénéfice canonique selon le statut
  const beneficeBrut = getNumber(
    result.sim.beneficeAvantCotisations ??           // EI
    result.sim.resultatAvantRemuneration ??          // EURL
    result.sim.beneficeAssociePrincipal ??           // SNC (quote-part)
    result.sim.benefice ??                           // fallback
    result.brut
  );

  // ✅ Cotisations : reconstituées depuis le cash si dispo, sinon fallback
  const cotisations = cotisationsEIFromCash(result.sim);

  const csgNonDeductible = getNumber(result.sim.csgNonDeductible);

  // ✅ Cash fiable : cash fourni, sinon bénéfice - cotisations reconstituées
  const cashAvantIR = getNumber(result.sim.cashAvantIR)
                   || Math.max(0, round2(beneficeBrut - cotisations));

  // Base imposable
  const baseImposableIR = getNumber(
    result.sim.baseImposableIR ??
    result.sim.beneficeImposable ??
    result.sim.beneficeApresCotisations ??
    (cashAvantIR + csgNonDeductible)
  );

  // 🔹 Libellé clair "marge • quote-part" (SNC) ou juste "marge" (EI/EURL)
  const margePct = (() => {
    const ca = Number(result.sim.ca) || 0;
    if (ca <= 0) return 0;
    // Si on dispose d'un résultat d'entreprise global, l'utiliser ; sinon, lire l'input #sim-marge (fallback 90%)
    const resTot = Number(result.sim.resultatEntrepriseTotale);
    if (Number.isFinite(resTot)) return (resTot / ca) * 100;
    const inputMarge = parseFloat(document.getElementById('sim-marge')?.value);
    const tauxMarge = Number.isFinite(inputMarge) ? inputMarge / 100 : 0.90;
    return tauxMarge * 100;
  })();

  const quotePct = (() => {
    if (statutId !== 'snc') return null;
    if (result.sim.partAssociePct != null) return Number(result.sim.partAssociePct);
    if (result.sim.partAssocie != null)     return Number(result.sim.partAssocie) * 100;
    return 100; // fallback
  })();

  const libelleBenef = (statutId === 'snc')
    ? `Bénéfice avant cotisations (marge ${formatPercent(margePct)} • quote-part ${formatPercent(quotePct)})`
    : `Bénéfice avant cotisations (marge ${formatPercent(margePct)})`;
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
        <td>${libelleBenef}</td>
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
  // Cas particulier de la SCI à l'IR
  const TAUX_PS = 17.2;
  const TAUX_CSG_DEDUCT = 6.8;

  // Données de base
  const revenuLocatifTot = Number(result.sim.ca ?? result.sim.revenuLocatif ?? 0);
  const chargesDeductibles = Number(result.sim.chargesDeductibles ?? 0);
  const nbAssocies = Number(result.sim.nbAssocies ?? result.sim.nombreAssocies ?? 1);

  // Résultat fiscal (niveau SCI)
  const resultatFiscalSCI = Math.max(0, revenuLocatifTot - chargesDeductibles);

  // Part détenue (décimal 0–1)
  const partAssocieDec = (result.sim.partAssocie != null)
    ? Number(result.sim.partAssocie)
    : (result.sim.partAssociePct != null ? Number(result.sim.partAssociePct) / 100
       : (nbAssocies > 0 ? 1 / nbAssocies : 1));

  // Quote-part de résultat fiscal pour l'associé simulé
  let quotePartAssocie = Number(result.sim.resultatFiscalAssocie);
  if (!Number.isFinite(quotePartAssocie) || quotePartAssocie <= 0) {
    quotePartAssocie = resultatFiscalSCI * Math.max(0, Math.min(1, partAssocieDec));
  }

  // Prélèvements sociaux & CSG déductible
  const prelevementsSociaux = quotePartAssocie * (TAUX_PS / 100);
  const csgDeductible = quotePartAssocie * (TAUX_CSG_DEDUCT / 100);

  // Base imposable IR (après déduction CSG déductible)
  const baseImposableIR = Math.max(0, quotePartAssocie - csgDeductible);

  // TMI & IR (barème progressif 2025)
  const tmiEffectif = getTMI(baseImposableIR, nbParts);
  const impotRevenu = impotsIR2025(baseImposableIR, nbParts);

  // Net après impôts pour l'associé
  const revenuNetAssocie = quotePartAssocie - prelevementsSociaux - impotRevenu;

  // 🔧 BASE CORRECTE DU RATIO : revenus locatifs de l'associé (CA total × quote-part)
  const revenusLocatifsAssocie = revenuLocatifTot * Math.max(0, Math.min(1, partAssocieDec));
  const ratioNetRevenusAssocie = revenusLocatifsAssocie > 0
    ? (revenuNetAssocie / revenusLocatifsAssocie) * 100
    : 0;

  // (facultatif) autres ratios clarifiés
  const ratioNetCATotal = revenuLocatifTot > 0 ? (revenuNetAssocie / revenuLocatifTot) * 100 : 0;
  const ratioNetQuotePart = quotePartAssocie > 0 ? (revenuNetAssocie / quotePartAssocie) * 100 : 0;

  // Rendu
  detailContent = `
    <h2 class="text-2xl font-bold text-green-400 mb-4">Détail du calcul - SCI à l'IR</h2>

    <div class="detail-category">Données de base (niveau SCI)</div>
    <table class="detail-table">
      <tr><td>Revenus locatifs totaux</td><td>${formatter.format(revenuLocatifTot)}</td></tr>
      ${chargesDeductibles ? `<tr><td>- Charges déductibles</td><td>${formatter.format(chargesDeductibles)}</td></tr>` : ''}
      <tr><td><strong>= Résultat fiscal de la SCI</strong></td><td><strong>${formatter.format(resultatFiscalSCI)}</strong></td></tr>
      ${nbAssocies > 1 ? `<tr><td>Nombre d'associés</td><td>${nbAssocies}</td></tr>` : ''}
    </table>

    ${STATUTS_MULTI_ASSOCIES['sci'] && nbAssocies > 1 ? `
      <div class="detail-category">Répartition entre associés</div>
      <table class="detail-table">
        <tr>
          <td>Part de l'associé simulé</td>
          <td>${formatPercent((result.sim.partAssociePct ?? (partAssocieDec * 100)), 1)}</td>
        </tr>
        <tr>
          <td>Quote-part du résultat fiscal</td>
          <td>${formatter.format(quotePartAssocie)}</td>
        </tr>
      </table>
      <div class="mt-3 p-3 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
        <p><i class="fas fa-balance-scale mr-1"></i>
        <strong>Transparence fiscale :</strong> Chaque associé déclare sa quote-part du résultat fiscal dans sa déclaration personnelle (revenus fonciers).</p>
      </div>
    ` : ''}

    <div class="detail-category">Prélèvements sociaux</div>
    <table class="detail-table">
      <tr><td>Base de calcul (quote-part)</td><td>${formatter.format(quotePartAssocie)}</td></tr>
      <tr><td>Taux de prélèvements sociaux</td><td>${formatPercent(TAUX_PS)}</td></tr>
      <tr><td>Montant des prélèvements sociaux</td><td>${formatter.format(prelevementsSociaux)}</td></tr>
      <tr><td colspan="2" class="text-xs text-gray-400 italic">Dont CSG déductible (${formatPercent(TAUX_CSG_DEDUCT)}) : ${formatter.format(csgDeductible)}</td></tr>
    </table>

    <div class="detail-category">Impôt sur le revenu</div>
    <table class="detail-table">
      <tr><td>Quote-part imposable</td><td>${formatter.format(quotePartAssocie)}</td></tr>
      <tr><td>- CSG déductible (${formatPercent(TAUX_CSG_DEDUCT)})</td><td>${formatter.format(csgDeductible)}</td></tr>
      <tr><td>= Base nette imposable à l'IR</td><td>${formatter.format(baseImposableIR)}</td></tr>
      <tr><td>Tranche marginale d'imposition</td><td>${tmiEffectif}%</td></tr>
      <tr><td>Impôt sur le revenu (barème)</td><td>${formatter.format(impotRevenu)}</td></tr>
    </table>

    <div class="detail-category">Résultat final pour l'associé</div>
    <table class="detail-table">
      <tr><td>Quote-part du résultat</td><td>${formatter.format(quotePartAssocie)}</td></tr>
      <tr><td>- Prélèvements sociaux (${formatPercent(TAUX_PS)})</td><td>${formatter.format(prelevementsSociaux)}</td></tr>
      <tr><td>- Impôt sur le revenu</td><td>${formatter.format(impotRevenu)}</td></tr>
      <tr><td><strong>= Revenu net après impôts</strong></td><td><strong>${formatter.format(revenuNetAssocie)}</strong></td></tr>

      <!-- ✅ Ratio corrigé -->
      <tr>
        <td>Ratio net/revenus locatifs (pour cet associé)</td>
        <td>${ratioNetRevenusAssocie.toFixed(1)}%</td>
      </tr>

      <!-- (facultatif) autres ratios pour transparence -->
      <tr class="text-gray-400"><td>Ratio net / CA total de la SCI</td><td>${ratioNetCATotal.toFixed(1)}%</td></tr>
      <tr class="text-gray-400"><td>Ratio net / quote-part du résultat</td><td>${ratioNetQuotePart.toFixed(1)}%</td></tr>
    </table>

    <div class="mt-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-400">
      <p><i class="fas fa-balance-scale mr-1"></i><strong>Précisions fiscales :</strong></p>
      <ul class="mt-2 space-y-1 ml-4">
        <li>• La CSG déductible (6,8%) minore la base imposable l'année suivante.</li>
        <li>• Chaque associé déclare sa quote-part dans la 2042 (revenus fonciers).</li>
        <li>• La SCI dépose une 2072 récapitulative.</li>
        <li>• Régime de transparence fiscale (article 8 CGI).</li>
      </ul>
    </div>
  `;
 } else if (statutId === 'sciIS') {
  const sim  = result.sim || {};
  const fmt  = v => formatter.format(Number(v) || 0);
  const pct  = v => `${(Number(v) || 0).toFixed(1)}%`;
  const n    = v => Number(v) || 0;

  // Libellé IS (15% si éligible puis 25%, sinon 25%)
  const isD   = sim?._isDetail;
  const txtIS = isD
    ? (isD.elig15
        ? `15% sur ${fmt(isD.part15)} puis 25% sur ${fmt(isD.part25)}`
        : `25% (non éligible)`)
    : (sim.is ? '25%' : '—');

  // Champs optionnels (afficher seulement si > 0)
  const hasCharges = n(sim.chargesDeductibles ?? sim._chargesDeductibles) > 0;
  const charges    = n(sim.chargesDeductibles ?? sim._chargesDeductibles);
  const hasAmort   = n(sim.amortissementAnnuel) > 0;
  const amort      = n(sim.amortissementAnnuel);

  // Quote-part affichée en %
  const partPct = (sim.partAssociePct != null)
    ? n(sim.partAssociePct)
    : n(sim.partAssocie) * 100;

  // PFU total (IR 12,8 + PS 17,2)
  const pfuTotal = n(sim.prelevementForfaitaire);
detailContent = `
  <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - SCI (option IS)</h2>

  <div class="detail-category">Données de base</div>
  <table class="detail-table">
    <tr><td>Revenus locatifs (CA)</td><td>${fmt(sim.ca)}</td></tr>
    <tr>
      <td><strong>= Résultat fiscal (avant IS)</strong></td>
      <td><strong>${fmt(sim.resultatAvantRemuneration)}</strong></td>
    </tr>
  </table>

  <div class="detail-category">Impôt sur les sociétés</div>
  <table class="detail-table">
    <tr><td>Barème</td><td>${txtIS}</td></tr>
    <tr><td>IS dû</td><td>${fmt(sim.is)}</td></tr>
    <tr>
      <td><strong>= Résultat après IS</strong></td>
      <td><strong>${fmt(sim.resultatApresIS)}</strong></td>
    </tr>
    ${n(sim.reserveLegalePrelevee) > 0
      ? `<tr><td>Réserve légale (5%)</td><td>− ${fmt(sim.reserveLegalePrelevee)}</td></tr>`
      : ``}
  </table>

  <div class="detail-category">Distribution (quote-part de cet associé)</div>
  <table class="detail-table">
    <tr><td>Part de l'associé simulé</td><td>${pct(partPct)}</td></tr>
    <tr><td>Dividendes bruts</td><td>${fmt(sim.dividendes)}</td></tr>
    <tr><td>Méthode de taxation</td><td><span class="text-blue-400">PFU 30%</span></td></tr>
    <tr><td>IR (12,8%) + PS (17,2%)</td><td>${fmt(pfuTotal)}</td></tr>
    <tr><td><strong>Dividendes nets</strong></td><td><strong>${fmt(sim.dividendesNets)}</strong></td></tr>
  </table>

  <div class="detail-category">Résultat final</div>
  <table class="detail-table">
    <tr><td><strong>Revenu net en poche</strong></td><td><strong>${fmt(sim.revenuNetTotal)}</strong></td></tr>
    <tr><td>Ratio Net/CA</td><td>${(n(sim.ratioNetCA)).toFixed(1)}%</td></tr>
  </table>

  <div class="mt-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg text-xs text-gray-300">
    <p><i class="fas fa-info-circle text-blue-400 mr-2"></i>
    À l’IS, la SCI est <strong>opaque</strong> : IS au niveau société, puis imposition des dividendes chez l’associé (PFU 30% par défaut). Aucune cotisation TNS n’est due sur les dividendes.</p>
  </div>
`;

// 🔒 Récap "taux utilisés" : ne pas l’injecter pour SCI-IS
if (statutId !== 'sciIS') {
  // Si tu as une fonction centralisée d’injection :
  detailContent += renderRecapTauxUtilises(result.sim || {});
}

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
      <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services), 25.6% (BNC SSI) / 23.2% (BNC CIPAV)</p>
      <p class="mb-2"><strong>Versement libératoire :</strong> 1% (vente), 1,7% (services), 2,2% (BNC) sur CA</p>
      <p class="mb-2"><strong>Plafonds 2026 :</strong> 203 100€ (vente) / 83 600€ (services/BNC)</p>
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


