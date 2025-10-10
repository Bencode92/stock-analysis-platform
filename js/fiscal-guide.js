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

/* ---- placement des 3 champs base10 à DROITE de "Part détenue (%)" ---- */
@media (min-width: 768px){
  #fiscal-simulator .form-grid-2cols{
    display: grid;
    grid-template-columns: 1fr 1fr; /* 2 colonnes */
    gap: 1rem;
  }
  .part-detenu-wrapper{ grid-column: 1 / span 1; }
  #base10-inline{ grid-column: 2 / span 1; align-self: end; }
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
  // Rafraîchir l’état des cases "Personnalisé" quand le nb d’associés change
  const nbAssociesEl = document.getElementById('sim-nb-associes');
  if (nbAssociesEl) nbAssociesEl.addEventListener('change', updateCustomStatusDisabling);
                                                  
   // 🔓 Déclampage côté UI : autoriser 0 % de salaire
  (function enableZeroPercentSalary() {
    const el = document.getElementById('sim-salaire');
    if (!el) return;

    // Autoriser 0 en borne basse
    el.setAttribute('min', '0');

    // Facultatif : pas d’1 point (%)
    if (!el.getAttribute('step')) el.setAttribute('step', '1');

    // Sécurise la saisie: borne [0,100] sans réécrire 0
    const clamp01 = v => Math.max(0, Math.min(100, v));
    const normalize = () => {
      if (el.value === '') return; // laisser vide si l’utilisateur efface
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
    const formContainer = simulatorContainer.querySelector('.grid');

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

      document.querySelectorAll('.status-checkbox, #use-optimal-ratio, #use-avg-charge-rate, #micro-type, #micro-vfl, #sarl-gerant-minoritaire')
        .forEach(el => el.addEventListener('change', runComparison));

      statusFilter.value = "all";
      statusFilter.dispatchEvent(new Event('change'));
    }
  }
   }
;(() => {
  // ====== AJOUT : 3 champs compacts à DROITE de "Part détenue (%)" ======
  const simContainer2 = document.getElementById('fiscal-simulator');
  if (!simContainer2) return;

  const formGrid2 = simContainer2.querySelector('.grid');
  if (!formGrid2 || document.getElementById('base10-inline')) return;

  // 👉 forcer une grille 2 colonnes utilisable par notre CSS
  formGrid2.classList.add('form-grid-2cols');

  // repérer "Part détenue (%)"
  const partInput = document.getElementById('sim-part-associe');
  const partWrapper = partInput
    ? partInput.closest('.col-span-1, .col-span-2, .col-span-full, .w-full')
    : null;

  // ancrer cette zone en colonne 1
  if (partWrapper) partWrapper.classList.add('part-detenu-wrapper');

  // créer le bloc à mettre en colonne 2
  const inline = document.createElement('div');
  inline.id = 'base10-inline';
  inline.innerHTML = `
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

  // insérer juste après le wrapper "Part détenue (%)"
  if (partWrapper && formGrid2.contains(partWrapper)) {
    partWrapper.insertAdjacentElement('afterend', inline);
  } else {
    formGrid2.appendChild(inline);
  }

  // calcul & maj
  const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
  function updateBase10(){
    const total =
      (parseFloat(document.getElementById('base-capital')?.value)||0) +
      (parseFloat(document.getElementById('base-primes')?.value)||0) +
      (parseFloat(document.getElementById('base-cca')?.value)||0);

    const hidden = document.getElementById('base10-total');
    if (hidden) hidden.value = String(total);

    const seuil = document.getElementById('tns-mini-seuil');
    if (seuil) seuil.textContent = total>0 ? fmtEUR.format(total*0.10) : '—';

    if (typeof runComparison === 'function') runComparison();
  }
  ['base-capital','base-primes','base-cca'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.addEventListener('input',updateBase10); el.addEventListener('change',updateBase10); }
  });
  updateBase10();
})();

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
    const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
    
    if (secteurSelect && tailleSelect) {
        window.sectorOptions = {
            secteur: secteurSelect.value,
            taille: tailleSelect.value
        };
        console.log("runComparison: Options sectorielles utilisées:", window.sectorOptions);
    }
    
    // Récupérer les options avancées
  const modeExpert = true; // Toujours activer le mode expert pour des calculs précis
    const useOptimalRatio = document.getElementById('use-optimal-ratio') && document.getElementById('use-optimal-ratio').checked;
    const useAvgChargeRate = document.getElementById('use-avg-charge-rate') && document.getElementById('use-avg-charge-rate').checked;
    const versementLiberatoire = document.getElementById('micro-vfl') && document.getElementById('micro-vfl').checked;
    const gerantMajoritaire = !(document.getElementById('sarl-gerant-minoritaire') && document.getElementById('sarl-gerant-minoritaire').checked);
    
    // Définir marge ou frais de façon exclusive selon l'option
    const params = {
        ca: ca,
        tauxMarge: useAvgChargeRate ? undefined : marge,
        tauxFrais: useAvgChargeRate ? (1 - marge) : undefined, // Changé de null à undefined
        tauxRemuneration: ratioSalaire,
        tmiActuel: tmi,
        modeExpert: modeExpert,
        gerantMajoritaire: gerantMajoritaire,
        secteur: window.sectorOptions?.secteur, // Ajouter ces paramètres
        taille: window.sectorOptions?.taille,
        nbAssocies: nbAssocies,
        partAssocie: partAssocie,
        partAssociePrincipal: partAssocie,  // Pour compatibilité
        partAssociePct: partAssociePct
    };

    
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
        'sarl': { ratioMin: 0.1, ratioMax: 1, favoriserDividendes: false, minRatioForFiscal: 0.5, capitalSocial: 1 },
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
        // Cas général pour les statuts à l'IS (SASU, EURL-IS, SAS, SARL, etc.)
        brut = sim.remuneration || sim.resultatEntreprise * (useOptimalRatio ? sim.ratioOptimise : ratioSalaire);
        charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);
        impots = (sim.impotRevenu || 0) + (sim.is || 0) + (sim.prelevementForfaitaire || 0);
        if (sim.cotTNSDiv) impots += sim.cotTNSDiv; // Ajout des cotisations TNS sur dividendes

        // Astuce UX : tuer les “dividendes 1 €” (seuil 5 €)
        const dividendesNets = (sim.dividendesNets && Math.abs(sim.dividendesNets) >= 5) ? sim.dividendesNets : 0;

        // Recalculer explicitement le net en tenant compte des charges mises à jour
        const revenuNetSalaire = sim.salaireNetApresIR || sim.revenuNetSalaire || 0;
        net = sim.revenuNetTotal || (revenuNetSalaire + dividendesNets);

        // Log de debug pour vérifier les valeurs
        console.log(`[FIX] ${statutId} - Charges: ${charges}, Salaire net: ${revenuNetSalaire}, Dividendes: ${dividendesNets}, NET: ${net}`);
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

// Barème IR 2025 - Fonction utilitaire pour calculer le TMI effectif
function getTMI(revenu) {
    if (revenu <= 11497)   return 0;
    if (revenu <= 29315)   return 11;
    if (revenu <= 83823)   return 30;
    if (revenu <= 180294)  return 41;
    return 45;
}
function getBaseSeuilDivTNS({ capitalLibere = 0, primesEmission = 0, comptesCourants = 0 } = {}) {
  return Number(capitalLibere) + Number(primesEmission) + Number(comptesCourants);
}
function formatBaseSeuilDivTNSTooltip(base) {
  return `
    <span class="info-tooltip">
      <i class="fas fa-question-circle text-gray-400"></i>
      <span class="tooltiptext">
        Seuil des 10% calculé sur :
        <br>capital libéré + primes d’émission + sommes en compte courant.
        <br><small>Si inconnu : application d’un taux TNS prudent (fallback).</small>
      </span>
    </span>`;
}

// Fonction améliorée pour afficher le détail des calculs avec pourcentages
function showCalculationDetails(statutId, simulationResults) {
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
    const tmiEffectif = versementLiberatoire ? null : getTMI(revenuImposable);
    
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
    const tmiEffectif = getTMI(baseImposableIR);
    
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

const tauxIS = resultatApresRemuneration <= 42500 ? 15 : 25;
    
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
                <td>${formatter.format(result.sim.salaireNetApresIR)}</td>
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
                <td>Impôt sur les sociétés (${formatPercent(tauxIS)})</td>
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
                <td>${formatter.format(result.sim.salaireNetApresIR)}</td>
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
    const remunerationNetteSociale = result.sim.remunerationNetteSociale || 0;
    
    // NOUVEAU : Récupérer les valeurs CSG depuis la simulation
    const csgNonDeductible = result.sim.csgNonDeductible || Math.round(result.sim.remuneration * 0.029);
    const baseImposableIR = result.sim.baseImposableIR || (remunerationNetteSociale + csgNonDeductible);
    
    // MODIFIÉ : Calculer le TMI sur la base imposable correcte
    const tmiEffectif = getTMI(baseImposableIR);
    
   // Calcul des taux (robuste et plus réaliste)
const baseRem = Number(result.sim?.remuneration) || 0;
const cotSoc  = Number(result.sim?.cotisationsSociales) || 0;

// TNS effectif observé sur la rémunération (fallback 30 si info manquante)
const tauxCotisationsTNS = baseRem > 0 ? Math.round((cotSoc / baseRem) * 100) : 30;

// IS (15% sous conditions PME) sinon 25%
const tauxIS = (Number(result.sim?.resultatApresRemuneration) || 0) <= 42500 ? 15 : 25;

// Dividendes TNS (>10% capital) : réutilise le taux TNS effectif, fallback prudent 35
const tauxCotTNSDiv = Number.isFinite(tauxCotisationsTNS) && tauxCotisationsTNS > 0
  ? tauxCotisationsTNS
  : 35;
    
    detailContent = `
        <h2 class="text-2xl font-bold text-blue-400 mb-4">Détail du calcul - ${result.statut}</h2>
        
        <div class="detail-category">Données de base</div>
        <table class="detail-table">
            <tr>
                <td>Chiffre d'affaires</td>
                <td>${formatter.format(result.sim.ca)}</td>
            </tr>
            <tr>
                <td>Résultat de l'entreprise (marge ${formatPercent((result.sim.resultatAvantRemuneration || result.sim.resultatEntreprise)/result.sim.ca*100)})</td>
                <td>${formatter.format(result.sim.resultatAvantRemuneration || result.sim.resultatEntreprise)}</td>
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
            ${statutId === 'sarl' ? `
            <tr>
                <td>Statut du gérant</td>
                <td>${result.sim.gerantMajoritaire ? 'Majoritaire (TNS)' : 'Minoritaire (assimilé salarié)'}</td>
            </tr>` : ''}
        </table>
        
        ${/* NOUVEAU: Section associés pour SARL/SELARL/SCA */ ''}
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
            ${statutId === 'sarl' && result.sim.gerantMajoritaire ? `
            <tr>
                <td colspan="2" class="text-xs text-gray-400 italic">
                    <i class="fas fa-info-circle mr-1"></i>
                    En tant que gérant majoritaire, les cotisations TNS sur dividendes 
                    s'appliquent sur votre quote-part.
                </td>
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
        
        ${/* NOUVEAU: Note pour EURL unipersonnelle */ ''}
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
        
                ${/* NOUVEAU : Section Base imposable et impôt sur le revenu */ ''}
        <div class="detail-category">Base imposable et impôt sur le revenu</div>
        <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4 mb-4">
            <table class="w-full">
                <tr>
                    <td class="text-gray-300 pb-2">Salaire net</td>
                    <td class="text-right text-lg font-semibold">${formatter.format(remunerationNetteSociale)}</td>
                </tr>
                <tr>
                    <td class="text-gray-300 pb-2">+ CSG/CRDS non déductible (2,9% du brut)</td>
                    <td class="text-right text-lg font-semibold text-yellow-400">+ ${formatter.format(csgNonDeductible)}</td>
                </tr>
                <tr class="border-t border-gray-600 pt-2">
                    <td class="text-white font-semibold pt-2">= Base imposable IR</td>
                    <td class="text-right text-xl font-bold text-white pt-2">${formatter.format(baseImposableIR)}</td>
                </tr>
            </table>
        </div>
        
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
                <td>Impôt sur les sociétés (${formatPercent(tauxIS)})</td>
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
              const baseSeuil = getBaseSeuilDivTNS(result.sim || {});
              const libelleBase = baseSeuil > 0
                ? `10% de ${formatter.format(baseSeuil)}`
                : `10% de (capital libéré + primes + CCA)`;
              return result.sim.cotTNSDiv ? `
              <tr>
                  <td>Cotisations TNS sur dividendes &gt; ${libelleBase} ${formatBaseSeuilDivTNSTooltip(baseSeuil)}</td>
                  <td>${formatter.format(result.sim.cotTNSDiv)}</td>
              </tr>` : '';
            })()}
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
        ` : ''}
        ` : `
        <div class="detail-category">Dividendes</div>
        <div class="mt-2 p-4 bg-blue-900 bg-opacity-30 rounded-lg">
            <p class="text-sm">
                <i class="fas fa-info-circle text-blue-400 mr-2"></i>
                <strong>Aucune distribution de dividendes</strong> - 100% du résultat est versé en rémunération.
            </p>
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
    const tmiEffectif = getTMI(baseImposableIR);
    
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
        const tmiEffectif = getTMI(baseImposableIR);
        
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
  tmiEffectifFinal = getTMI(result.sim.revenuImposable || 0);
} else if (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa' || statutId === 'selas') {
  const base = (result.sim.baseImposableIR ?? ((result.sim.salaireNet || 0) + (result.sim.csgNonDeductible || 0)));
  tmiEffectifFinal = getTMI(base);
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
    
 // CORRECTION : Ajouter une section récapitulative des taux utilisés ADAPTÉE au régime fiscal
detailContent += `
  <div class="detail-category mt-6">Récapitulatif des taux utilisés</div>
  <div class="mt-2 p-4 bg-green-900 bg-opacity-20 rounded-lg text-sm">
    <ul class="space-y-1">`;

// Charges sociales (toujours affichées)
detailContent += `
  <li><i class="fas fa-percentage text-green-400 mr-2"></i><strong>Charges sociales :</strong> ${
    statutId === 'micro' ? '12.3% à 24.6% selon activité' :
    (statutId === 'sasu' || statutId === 'sas' || statutId === 'sa' || statutId === 'selas') ? '≈77% (22% salariales + 55% patronales)' :
    statutId === 'sci' ? '17.2% (prélèvements sociaux sur revenus fonciers)' :
    '≈30% (TNS)'
  }</li>`;

// Statuts à l'IS uniquement
 if (statutId === 'eurlIS' || statutId === 'sasu' || statutId === 'sarl' || statutId === 'sas' || 
    statutId === 'sa' || statutId === 'selarl' || statutId === 'selas' || statutId === 'sca') {
  detailContent += `
    <li>
      <i class="fas fa-percentage text-green-400 mr-2"></i>
      <strong>IS :</strong>
      ${renderISReduceBadge()} jusqu’à <strong>42 500 €</strong> (taux réduit 15% sous conditions PME), puis 25%
    </li>
    <li>
      <i class="fas fa-percentage text-green-400 mr-2"></i>
      <strong>PFU sur dividendes :</strong> 30% (17.2% prélèvements sociaux + 12.8% IR)
    </li>`;
  
  // Cotisations TNS sur dividendes pour certains statuts
  if (statutId === 'eurlIS' || statutId === 'sarl' || statutId === 'selarl') {
    detailContent += `
      <li><i class="fas fa-percentage text-green-400 mr-2"></i><strong>Cotisations TNS sur dividendes :</strong> 30% sur la part > 10% du capital social</li>`;
  }
}

// Statuts à l'IR — Micro : abattement & VFL
else if (statutId === 'micro') {
  const typeMicro = result.sim.typeMicro || 'BIC_SERVICE';
  const versementLiberatoire = result.sim.versementLiberatoire || false;
  const __vflBanner = versementLiberatoire ? renderVFLNote(typeMicro) : '';

  detailContent += `
    <li><i class="fas fa-percentage text-green-400 mr-2"></i><strong>Abattement forfaitaire :</strong> ${
      typeMicro === 'BIC_VENTE' ? '71%' :
      typeMicro === 'BIC_SERVICE' ? '50%' :
      '34%'
    } du CA</li>`;

  if (versementLiberatoire) {
    detailContent += `
      <li><i class="fas fa-percentage text-green-400 mr-2"></i><strong>Versement libératoire :</strong> ${
        typeMicro === 'BIC_VENTE' ? '1%' :
        typeMicro === 'BIC_SERVICE' ? '1.7%' :
        '2.2%'
      } du CA (remplace l'IR progressif)</li>`;
    // (Optionnel) afficher la bannière VFL
    detailContent += __vflBanner;
  } 
}

// Statut SCI — infos spécifiques IR
else if (statutId === 'sci') {
  detailContent += `
    <li><i class="fas fa-percentage text-green-400 mr-2"></i><strong>Régime fiscal :</strong> Revenus fonciers (IR)</li>
    <li><i class="fas fa-percentage text-green-400 mr-2"></i><strong>CSG déductible :</strong> 6.8% des revenus fonciers</li>`;
}

// --- AJOUT : n'afficher le TMI générique que si ce n'est pas "Micro avec VFL"
if (!(statutId === 'micro' && result.sim.versementLiberatoire)) {
  detailContent += `
    <li>
      <i class="fas fa-percentage text-green-400 mr-2"></i>
      <strong>TMI effectif :</strong> ${tmiEffectifFinal}% (tranche atteinte)
    </li>`;
}

// Fermeture de la liste + conteneur
detailContent += `
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
    // Récupérer le conteneur pour l'accordéon
    const accordionContainer = document.querySelector('.space-y-4');
    if (!accordionContainer) return;
    
    // Vider le conteneur actuel
    accordionContainer.innerHTML = '';
        // Ajouter le fond
    accordionContainer.style.background = 'rgba(1, 42, 74, 0.4)';
    accordionContainer.style.padding = '2rem';
    accordionContainer.style.borderRadius = '12px';
    accordionContainer.style.border = '1px solid rgba(0, 255, 135, 0.1)';
    
    // Récupérer la liste des statuts depuis legalStatuses si disponible, sinon utiliser une liste par défaut
    let statuts = [];
    if (window.legalStatuses) {
        statuts = Object.keys(window.legalStatuses);
    } else {
        // Liste des statuts par défaut
        statuts = ['MICRO', 'EI', 'EURL', 'SASU', 'SARL', 'SAS', 'SA', 'SNC', 'SCI', 'SELARL', 'SELAS', 'SCA'];
    }
    
    // Icônes pour les statuts juridiques
    const statutIcons = {
        'MICRO': '<i class="fas fa-store-alt text-green-400 mr-2"></i>',
        'EI': '<i class="fas fa-user text-green-400 mr-2"></i>',
        'EURL': '<i class="fas fa-user-tie text-green-400 mr-2"></i>',
        'SASU': '<i class="fas fa-user-shield text-blue-400 mr-2"></i>',
        'SARL': '<i class="fas fa-users text-blue-400 mr-2"></i>',
        'SAS': '<i class="fas fa-building text-blue-400 mr-2"></i>',
        'SA': '<i class="fas fa-landmark text-blue-400 mr-2"></i>',
        'SNC': '<i class="fas fa-handshake text-green-400 mr-2"></i>',
        'SCI': '<i class="fas fa-home text-green-400 mr-2"></i>',
        'SELARL': '<i class="fas fa-user-md text-blue-400 mr-2"></i>',
        'SELAS': '<i class="fas fa-stethoscope text-blue-400 mr-2"></i>',
        'SCA': '<i class="fas fa-chart-line text-blue-400 mr-2"></i>'
    };
 // Badge régime fiscal
    const regimeBadges = {
        'MICRO': '<span class="status-badge ir">IR</span>',
        'EI': '<span class="status-badge ir">IR</span>',
        'EURL': '<span class="status-badge iris">IR/IS</span>',
        'SASU': '<span class="status-badge is">IS</span>',
        'SARL': '<span class="status-badge is">IS</span>',
        'SAS': '<span class="status-badge is">IS</span>',
        'SA': '<span class="status-badge is">IS</span>',
        'SNC': '<span class="status-badge ir">IR</span>',
        'SCI': '<span class="status-badge ir">IR</span>',
        'SELARL': '<span class="status-badge is">IS</span>',
        'SELAS': '<span class="status-badge is">IS</span>',
        'SCA': '<span class="status-badge is">IS</span>'
    };
    
    // Générer l'accordéon pour chaque statut
    statuts.forEach(statutId => {
        const nomStatut = window.legalStatuses && window.legalStatuses[statutId] 
            ? window.legalStatuses[statutId].name 
            : getDefaultNomStatut(statutId);
        
        // Créer l'élément d'accordéon
        const accordionItem = document.createElement('div');
        accordionItem.className = 'mb-3';
        
        // Contenu de l'accordéon basé sur le statut
        accordionItem.innerHTML = `
            <button class="accordion-toggle w-full">
                ${statutIcons[statutId] || ''} ${nomStatut} 
                ${regimeBadges[statutId] || ''}
                <i class="fas fa-plus ml-auto"></i>
            </button>
            <div class="hidden px-4 py-3 border-t border-gray-700 bg-blue-900 bg-opacity-20 rounded-b-lg">
                ${getStatutFiscalInfo(statutId)}
            </div>
        `;
        
        accordionContainer.appendChild(accordionItem);
    });
    
    // Attacher les événements aux boutons de l'accordéon
    const toggleBtns = document.querySelectorAll('.accordion-toggle');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const content = this.nextElementSibling;
            content.classList.toggle('hidden');
            
            // Changer l'icône
            const icon = this.querySelector('i:last-child');
            icon.classList.toggle('fa-plus');
            icon.classList.toggle('fa-minus');
            
            // Ajouter/supprimer la classe active
            this.classList.toggle('active');
        });
    });
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
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
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
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
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
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
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
            <p class="mb-2"><strong>Dividendes TNS :</strong> Cotisations (17%) sur dividendes > 10% du capital</p>
            <p class="mb-2"><strong>Capital minimal :</strong> 37 000€</p>
        `
    };
    
    return infosFiscales[statutId] || `<p>Informations non disponibles pour ${statutId}</p>`;
}// Contenu trop volumineux pour être inclus dans la demande

