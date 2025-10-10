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

/* -------------------------------------------------------
   DOMContentLoaded
------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  // S'assurer que l'onglet Guide fiscal initialise correctement ce code
  const guideTab = document.querySelector('.tab-item:nth-child(3)'); // Le 3ème onglet
  if (guideTab) guideTab.addEventListener('click', initFiscalSimulator);

  // Si le simulateur est déjà présent à l'init
  if (document.getElementById('fiscal-simulator')) {
    initFiscalSimulator();
  }

  // Styles globaux utiles
  addCustomStyles();

  /* ---------------- helpers UI ---------------- */
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
  grid-column: 1 / -1;
}

/* Conteneur global */
#tab-content-container {
  max-width: 1200px;
  margin-left: 0;
  margin-right: auto;
}

/* — Tooltips plus compacts — */
.tooltiptext {
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0.4rem 0.6rem;
  max-width: 220px;
}

/* FIX: Ligne Part détenue + Base 10% - disposition côte à côte */
.part-base-row {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 1rem;
  width: 100%;
  margin-bottom: 1rem;
}

@media (max-width: 767px) {
  .part-base-row {
    grid-template-columns: 1fr;
  }
}

.part-base-row > div {
  min-width: 0;
}
`;
    document.head.appendChild(style);
  }

  function setupSectorOptions() {
    const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
    const tailleSelect  = document.querySelector('#taille-select, [id$="taille-select"]');
    console.log("Éléments trouvés:", !!secteurSelect, !!tailleSelect);

    if (secteurSelect && tailleSelect) {
      window.sectorOptions = { secteur: secteurSelect.value, taille: tailleSelect.value };
      console.log("Options sectorielles initiales:", window.sectorOptions);

      document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { detail: window.sectorOptions }));
      if (typeof updateCustomStatusDisabling === 'function') updateCustomStatusDisabling();

      secteurSelect.addEventListener('change', function () {
        window.sectorOptions = { secteur: this.value, taille: tailleSelect.value };
        document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { detail: window.sectorOptions }));
        if (typeof runComparison === 'function') runComparison();
        if (typeof updateCustomStatusDisabling === 'function') updateCustomStatusDisabling();
      });

      tailleSelect.addEventListener('change', function () {
        window.sectorOptions = { secteur: secteurSelect.value, taille: this.value };
        document.dispatchEvent(new CustomEvent('sectorOptionsChanged', { detail: window.sectorOptions }));
        if (typeof runComparison === 'function') runComparison();
        if (typeof updateCustomStatusDisabling === 'function') updateCustomStatusDisabling();
      });
    } else {
      window.sectorOptions = { secteur: "Tous", taille: "<50" };
      console.log("Options sectorielles par défaut:", window.sectorOptions);
    }
  }

  document.addEventListener('sectorOptionsChanged', e => {
    console.log("ÉVÉNEMENT: Options sectorielles modifiées:", e.detail);
  });

  function initFiscalSimulator() {
    console.log("Initialisation du simulateur fiscal simplifié...");

    // Attendre que les dépendances calculatoires soient prêtes
    const checkDependencies = setInterval(() => {
      if (window.SimulationsFiscales && window.FiscalUtils) {
        clearInterval(checkDependencies);
        console.log("Dépendances trouvées, configuration du simulateur...");
        setupSimulator();
        setupSectorOptions();
      }
    }, 200);
  }

  function setupSimulator() {
    const compareBtn = document.getElementById('sim-compare-btn');
    if (!compareBtn) return;

    compareBtn.addEventListener('click', runComparison);

    // Écoute les champs de base
    ['sim-ca','sim-marge','sim-salaire','sim-tmi','sim-nb-associes','sim-part-associe'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', runComparison);
    });

    // Rafraîchir l'état des cases "Personnalisé" quand le nb d'associés change
    const nbAssociesEl = document.getElementById('sim-nb-associes');
    if (nbAssociesEl && typeof updateCustomStatusDisabling === 'function') {
      nbAssociesEl.addEventListener('change', updateCustomStatusDisabling);
    }

    // 🔓 Autoriser 0% de salaire
    (function enableZeroPercentSalary() {
      const el = document.getElementById('sim-salaire');
      if (!el) return;
      el.setAttribute('min','0');
      if (!el.getAttribute('step')) el.setAttribute('step','1');
      const clamp01 = v => Math.max(0, Math.min(100, v));
      const normalize = () => {
        if (el.value === '') return;
        const n = parseFloat(el.value);
        if (Number.isFinite(n)) el.value = clamp01(n);
      };
      el.addEventListener('input', normalize, { passive: true });
      normalize();
    })();

    // UI statuts
    setupAccordion?.();
    updateSimulatorInterface();

    // ⚙️ Monte la ligne "Part détenue + Base 10%"
    mountBase10Row();

    // Première simulation
    setTimeout(() => runComparison?.(), 100);
  }

  // Fonction pour mettre à jour l'interface du simulateur
  function updateSimulatorInterface() {
    const simulatorContainer = document.getElementById('fiscal-simulator');
    if (!simulatorContainer) return;

    if (document.getElementById('sim-options-container')) {
      console.log("Options de simulation déjà présentes, pas de reconstruction");
      return;
    }

    const formContainer = simulatorContainer.querySelector('.grid');
    if (!formContainer) return;

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
        const compareButtonWrapper = compareButton.closest('.col-span-1, .col-span-2, .col-span-full') || compareButton.parentElement;
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
    const filterBtns = document.querySelectorAll('.status-filter-btn');

    statusFilter.addEventListener('change', function () {
      const isCustom = this.value === 'custom';
      const customBox = document.getElementById('custom-status-options');
      if (customBox) customBox.style.display = isCustom ? 'block' : 'none';

      if (!isCustom && typeof getSelectedStatuses === 'function') {
        const selectedStatuses = getSelectedStatuses(this.value);
        document.querySelectorAll('.status-checkbox').forEach(cb => {
          cb.checked = selectedStatuses.includes(cb.value);
        });
      }

      filterBtns.forEach(btn => {
        const filter = btn.getAttribute('data-filter');
        if (filter === this.value) {
          btn.classList.remove('bg-blue-800','text-white');
          btn.classList.add('bg-green-500','text-gray-900','font-medium');
        } else {
          btn.classList.remove('bg-green-500','text-gray-900','font-medium');
          btn.classList.add('bg-blue-800','text-white');
        }
      });

      runComparison?.();
    });

    filterBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        filterBtns.forEach(b => {
          b.classList.remove('bg-green-500','text-gray-900','font-medium');
          b.classList.add('bg-blue-800','text-white');
        });
        this.classList.remove('bg-blue-800','text-white');
        this.classList.add('bg-green-500','text-gray-900','font-medium');

        const filter = this.getAttribute('data-filter');
        statusFilter.value = filter;

        const isCustom = filter === 'custom';
        const customBox = document.getElementById('custom-status-options');
        if (customBox) customBox.style.display = isCustom ? 'block' : 'none';

        if (!isCustom && typeof getSelectedStatuses === 'function') {
          const selectedStatuses = getSelectedStatuses(filter);
          document.querySelectorAll('.status-checkbox').forEach(cb => {
            cb.checked = selectedStatuses.includes(cb.value);
          });
        }

        runComparison?.();
      });
    });

    document.querySelectorAll('.status-checkbox, #use-optimal-ratio, #use-avg-charge-rate, #micro-type, #micro-vfl, #sarl-gerant-minoritaire')
      .forEach(el => el.addEventListener('change', () => runComparison?.()));

    // Valeur initiale
    statusFilter.value = "all";
    statusFilter.dispatchEvent(new Event('change'));
  }

  /* -------------------------------------------------------
     Montage de la ligne "Part détenue (%) + Base 10%"
     => Ancrage juste après #sim-nb-associes
     => DISPOSITION HORIZONTALE CÔTE À CÔTE
  ------------------------------------------------------- */
  function mountBase10Row() {
    const sim = document.getElementById('fiscal-simulator');
    if (!sim) return;

    const formGrid = sim.querySelector('.grid');
    if (!formGrid || document.getElementById('base10-inline')) return; // déjà monté

    const partInput = document.getElementById('sim-part-associe');
    const partWrapper = partInput ? partInput.closest('div') : null;
    if (!partWrapper) return;

    const nbInput = document.getElementById('sim-nb-associes');
    const nbWrapper = nbInput ? nbInput.closest('div') : null;

    // 1) Créer la ligne horizontale avec grid
    const row = document.createElement('div');
    row.className = 'part-base-row';

    // 2) INSÉRER la ligne APRÈS le champ "Nombre d'associés"
    if (nbWrapper && formGrid.contains(nbWrapper)) {
      nbWrapper.after(row);
    } else {
      // Fallback: insérer avant le wrapper de "Part détenue"
      formGrid.insertBefore(row, partWrapper);
    }

    // 3) Déplacer le champ "Part détenue" dans la colonne de gauche
    partWrapper.classList.remove('col-span-2','col-span-full','md:col-span-2','md:col-span-3');
    partWrapper.style.gridColumn = 'auto';
    row.appendChild(partWrapper);

    // 4) Créer le bloc "Base 10%" (colonne de droite)
    const base10Block = document.createElement('div');
    base10Block.id = 'base10-inline';
    base10Block.innerHTML = `
      <label class="block text-gray-300 mb-1">Base 10% (TNS dividendes)</label>
      <div class="grid grid-cols-3 gap-2">
        <input id="base-capital" type="number" min="0" step="100" placeholder="Capital"
               class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white">
        <input id="base-primes" type="number" min="0" step="100" placeholder="Primes"
               class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white">
        <input id="base-cca" type="number" min="0" step="100" placeholder="CCA"
               class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 text-white">
      </div>
      <input id="base10-total" type="hidden" value="0">
      <div class="text-xs text-gray-400 mt-1">10% : <span id="tns-mini-seuil">—</span></div>
    `;
    row.appendChild(base10Block);

    // 5) Calcul dynamique + liaison
    const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
    function updateBase10() {
      const total =
        (parseFloat(document.getElementById('base-capital')?.value) || 0) +
        (parseFloat(document.getElementById('base-primes')?.value) || 0) +
        (parseFloat(document.getElementById('base-cca')?.value) || 0);
      document.getElementById('base10-total').value = String(total);
      document.getElementById('tns-mini-seuil').textContent = total > 0 ? fmtEUR.format(total * 0.10) : '—';
      if (typeof runComparison === 'function') runComparison();
    }
    ['base-capital','base-primes','base-cca'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', updateBase10); el.addEventListener('change', updateBase10); }
    });
    updateBase10();
  }
});

// Le reste du code reste identique...
// (toutes les fonctions runComparison, getSelectedStatuses, showCalculationDetails, etc.)
