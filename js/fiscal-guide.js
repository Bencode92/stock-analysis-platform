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


document.addEventListener('DOMContentLoaded', function() {
    // S'assurer que l'onglet Guide fiscal initialise correctement ce code
    const guideTab = document.querySelector('.tab-item:nth-child(3)'); // Le 3ème onglet
    
    if (guideTab) {
        guideTab.addEventListener('click', initFiscalSimulator);
    }
    
    // Chercher si le simulateur existe déjà sur la page
    if (document.getElementById('fiscal-simulator')) {
        initFiscalSimulator();
    }
    
// Ajouter les styles personnalisés pour le simulateur
function addCustomStyles() {
  const style = document.createElement('style');
  style.textContent = `
/* Conteneur du simulateur fiscal */
#fiscal-simulator {
  max-width: 980px;
  margin-left: 0;
  margin-right: auto;
}

/* Grille alignée à gauche */
#fiscal-simulator .grid {
  justify-content: flex-start !important;
  justify-items: start !important;
}

/* Options sans centrage automatique */
#sim-options-container {
  margin-left: 0 !important;
  margin-right: 0 !important;
  grid-column: 1 / -1; /* Force le bloc à occuper toute la largeur */
}

/* Conteneur global */
#tab-content-container {
  max-width: 1200px;
  margin-left: 0;
  margin-right: auto;
}

/* ---- AMÉLIORATION: placement des champs Base 10% ---- */
/* Sur desktop: créer une ligne avec 2 colonnes égales */
@media (min-width: 768px) {
  .part-detenu-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    width: 100%;
    grid-column: 1 / -1; /* Prend toute la largeur du grid parent */
  }
  
  .part-detenu-wrapper {
    grid-column: 1 / span 1;
  }
  
  #base10-inline {
    grid-column: 2 / span 1;
    align-self: end;
  }
  
  /* S'assurer que les 3 inputs sont bien alignés */
  #base10-inline .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
}

/* Sur mobile: empiler verticalement */
@media (max-width: 767.98px) {
  .part-detenu-row {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }
  
  #base10-inline .grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
}

/* — Tooltips plus compacts — */
.tooltiptext {
  font-size: 0.75rem;      /* 12 px */
  line-height: 1rem;       /* 16 px */
  padding: 0.4rem 0.6rem;  /* réduit le carré blanc */
  max-width: 220px;        /* évite les bulles trop larges */
}
`;
  document.head.appendChild(style);
}
addCustomStyles();



function setupSectorOptions() {
  // Find selector elements
  const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
  const tailleSelect  = document.querySelector('#taille-select, [id$="taille-select"]');
  console.log("Éléments trouvés:", !!secteurSelect, !!tailleSelect);

  // CRITICAL: Initialize immediately at load time
  if (secteurSelect && tailleSelect) {
    // Set initial values right away
    window.sectorOptions = {
      secteur: secteurSelect.value,
      taille:  tailleSelect.value
    };
    console.log("Options sectorielles initiales:", window.sectorOptions);

    // Broadcast initial values
    document.dispatchEvent(new CustomEvent('sectorOptionsChanged', {
      detail: window.sectorOptions
    }));
    updateCustomStatusDisabling(); // ⬅️ premier passage

    // Add change listeners
    secteurSelect.addEventListener('change', function () {
      window.sectorOptions = { secteur: this.value, taille: tailleSelect.value };
      console.log("Options sectorielles mises à jour:", window.sectorOptions);

      // Broadcast changes
      document.dispatchEvent(new CustomEvent('sectorOptionsChanged', {
        detail: window.sectorOptions
      }));

      runComparison();
      updateCustomStatusDisabling(); // ⬅️ ici
    });

    tailleSelect.addEventListener('change', function () {
      window.sectorOptions = { secteur: secteurSelect.value, taille: this.value };
      console.log("Options sectorielles mises à jour:", window.sectorOptions);

      // Broadcast changes
      document.dispatchEvent(new CustomEvent('sectorOptionsChanged', {
        detail: window.sectorOptions
      }));

      runComparison();
      updateCustomStatusDisabling(); // ⬅️ ici
    });
  } else {
    // Set defaults if elements not found
    window.sectorOptions = { secteur: "Tous", taille: "<50" };
    console.log("Options sectorielles par défaut:", window.sectorOptions);
  }
}

// Add listener for debugging
document.addEventListener('sectorOptionsChanged', function(e) {
    console.log("ÉVÉNEMENT: Options sectorielles modifiées:", e.detail);
});

function initFiscalSimulator() {
    console.log("Initialisation du simulateur fiscal simplifié...");
    
    // Attendre que SimulationsFiscales et FiscalUtils soient chargés
    const checkDependencies = setInterval(() => {
        if (window.SimulationsFiscales && window.FiscalUtils) {
            clearInterval(checkDependencies);
            console.log("Dépendances trouvées, configuration du simulateur...");
            setupSimulator();
            setupSectorOptions(); // Ajout de cette ligne
        }
    }, 200);
}
  
  // --- AMÉLIORATION: Fonction de placement des champs Base 10% ---
function placeBase10UnderNbAssocies() {
  const sim = document.getElementById('fiscal-simulator');
  if (!sim) {
    console.warn('⚠️ Simulateur fiscal non trouvé');
    return;
  }

  const formGrid = sim.querySelector('.grid');
  if (!formGrid) {
    console.warn('⚠️ Grid du formulaire non trouvé');
    return;
  }

  // Éviter les doublons
  if (document.getElementById('base10-inline')) {
    console.log('✅ Champs Base 10% déjà présents');
    return;
  }

  // Récupérer les éléments existants
  const partInput = document.getElementById('sim-part-associe');
  const nbAssoc = document.getElementById('sim-nb-associes');
  
  if (!partInput || !nbAssoc) {
    console.warn('⚠️ Champs requis non trouvés:', { partInput: !!partInput, nbAssoc: !!nbAssoc });
    return;
  }

  const partWrapper = partInput.closest('div');
  const nbAssocWrapper = nbAssoc.closest('div');
  
  if (!partWrapper || !nbAssocWrapper) {
    console.warn('⚠️ Wrappers non trouvés');
    return;
  }

  // Créer la ligne conteneur avec 2 colonnes
  const row = document.createElement('div');
  row.className = 'part-detenu-row';
  row.style.gridColumn = '1 / -1'; // Prend toute la largeur

  // Créer un nouveau wrapper pour "Part détenue" (pour ne pas déplacer l'original)
  const newPartWrapper = document.createElement('div');
  newPartWrapper.className = 'part-detenu-wrapper';
  newPartWrapper.appendChild(partInput.parentNode.cloneNode(true));
  
  // Supprimer l'ancien champ "Part détenue" de son emplacement original
  partWrapper.style.display = 'none';
  
  row.appendChild(newPartWrapper);

  // Créer le bloc des 3 champs Base 10%
  const inline = document.createElement('div');
  inline.id = 'base10-inline';
  inline.innerHTML = `
    <label class="block text-gray-300 text-sm mb-2">
      Base 10% (TNS dividendes)
      <span class="info-tooltip ml-1">
        <i class="fas fa-question-circle text-gray-400"></i>
        <span class="tooltiptext">
          Capital social + Primes d'émission + Comptes courants d'associés.<br>
          Les dividendes supérieurs à 10% de cette base sont soumis aux cotisations sociales TNS.
        </span>
      </span>
    </label>
    <div class="grid grid-cols-3 gap-2">
      <input id="base-capital" type="number" min="0" step="100" placeholder="Capital social"
        class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        title="Capital social libéré">
      <input id="base-primes" type="number" min="0" step="100" placeholder="Primes émission"
        class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        title="Primes d'émission">
      <input id="base-cca" type="number" min="0" step="100" placeholder="Comptes courants"
        class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        title="Comptes courants d'associés">
    </div>
    <input id="base10-total" type="hidden" value="0">
    <div class="text-xs text-gray-400 mt-1">Seuil 10% : <span id="tns-mini-seuil" class="font-mono">—</span></div>
  `;
  row.appendChild(inline);

  // Insérer la ligne APRÈS le wrapper "Nombre d'associés"
  nbAssocWrapper.parentNode.insertBefore(row, nbAssocWrapper.nextSibling);
  
  console.log('✅ Champs Base 10% insérés avec succès');

  // Calcul dynamique du total et du seuil 10%
  const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
  
  function updateBase10() {
    const capital = parseFloat(document.getElementById('base-capital')?.value) || 0;
    const primes = parseFloat(document.getElementById('base-primes')?.value) || 0;
    const cca = parseFloat(document.getElementById('base-cca')?.value) || 0;
    const total = capital + primes + cca;
    
    document.getElementById('base10-total').value = String(total);
    document.getElementById('tns-mini-seuil').textContent = total > 0 ? fmtEUR.format(total * 0.10) : '—';
    
    if (typeof runComparison === 'function') {
      runComparison();
    }
  }

  // Attacher les événements
  ['base-capital', 'base-primes', 'base-cca'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateBase10);
      el.addEventListener('change', updateBase10);
    }
  });
  
  // Appel initial
  updateBase10();

  // Gestion de la visibilité selon le statut sélectionné
  function toggleBase10Visibility() {
    const filter = document.getElementById('sim-status-filter')?.value || 'all';
    const selected = typeof getSelectedStatuses === 'function' ? getSelectedStatuses(filter) : [];
    const gerantMinoritaire = document.getElementById('sarl-gerant-minoritaire')?.checked;
    
    // Statuts où le mécanisme des 10% s'applique
    const statutsPertinents = ['eurlIS', 'sarl', 'selarl', 'sca'];
    const applicable = selected.some(s => statutsPertinents.includes(s)) && !gerantMinoritaire;
    
    row.style.display = applicable ? '' : 'none';
  }

  // Attacher les événements de visibilité
  toggleBase10Visibility();
  document.getElementById('sim-status-filter')?.addEventListener('change', toggleBase10Visibility);
  document.getElementById('sarl-gerant-minoritaire')?.addEventListener('change', toggleBase10Visibility);
}


function setupSimulator() {
    const compareBtn = document.getElementById('sim-compare-btn');
    if (!compareBtn) return;
    
    compareBtn.addEventListener('click', runComparison);
    
    // Écouter les changements dans les champs pour mettre à jour automatiquement
    const inputFields = ['sim-ca', 'sim-marge', 'sim-salaire', 'sim-tmi', 'sim-nb-associes', 'sim-part-associe'];
    inputFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', runComparison);
    });
  // Rafraîchir l'état des cases "Personnalisé" quand le nb d'associés change
  const nbAssociesEl = document.getElementById('sim-nb-associes');
  if (nbAssociesEl) nbAssociesEl.addEventListener('change', updateCustomStatusDisabling);
                                                  
   // 🔓 Déclampage côté UI : autoriser 0 % de salaire
  (function enableZeroPercentSalary() {
    const el = document.getElementById('sim-salaire');
    if (!el) return;

    // Autoriser 0 en borne basse
    el.setAttribute('min', '0');

    // Facultatif : pas d'1 point (%)
    if (!el.getAttribute('step')) el.setAttribute('step', '1');

    // Sécurise la saisie: borne [0,100] sans réécrire 0
    const clamp01 = v => Math.max(0, Math.min(100, v));
    const normalize = () => {
      if (el.value === '') return; // laisser vide si l'utilisateur efface
      const n = parseFloat(el.value);
      if (Number.isFinite(n)) el.value = clamp01(n);
    };

    el.addEventListener('input', normalize, { passive: true });
    // Normalise la valeur initiale si besoin
    normalize();
  })();
    
    // Configurer l'accordéon pour les statuts juridiques
    setupAccordion();
    
    // Mettre à jour l'interface du simulateur pour inclure tous les statuts
    updateSimulatorInterface();
  
   // ➜ APPEL CRUCIAL: insérer les champs Base 10%
  setTimeout(() => {
    placeBase10UnderNbAssocies();
    console.log('🔧 Placement des champs Base 10% exécuté');
  }, 100);
    
    // Exécuter une première simulation au chargement
    setTimeout(runComparison, 200);
}

// ... (le reste du code reste identique) ...
