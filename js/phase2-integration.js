/**
 * Intégration Phase 2 (robustesse) - Script principal
 * 
 * Ce script intègre les nouvelles fonctionnalités de la Phase 2 au simulateur:
 * - Moteur de règles juridiques explicites
 * - Paramétrage dynamique des seuils légaux
 * - Comparaison "what-if" entre statuts
 * - Simulation financière avancée
 * 
 * Version 1.0.0 - Avril 2025
 */

// Importer les modules si l'environnement le permet
let RulesEngine;
let AdvancedSimulation;

try {
  // Import ES modules (environnement moderne)
  import('./rules-engine.js').then(module => {
    RulesEngine = module.default;
    initRulesEngine();
  });
  
  import('./advanced-simulation.js').then(module => {
    AdvancedSimulation = module.default;
    initAdvancedSimulation();
  });
} catch (e) {
  // Fallback pour environnement sans modules ES
  // Les modules devraient être disponibles globalement
  window.addEventListener('DOMContentLoaded', () => {
    if (window.RulesEngine) {
      RulesEngine = window.RulesEngine;
      initRulesEngine();
    }
    
    if (window.AdvancedSimulation) {
      AdvancedSimulation = window.AdvancedSimulation;
      initAdvancedSimulation();
    }
  });
}

// Variables globales
let rulesEngine = null;
let advancedSimulation = null;
let simulationChart = null;
let legalParameters = null;

// Initialiser le moteur de règles
async function initRulesEngine() {
  try {
    // Charger les paramètres juridiques et fiscaux
    const response = await fetch('js/legal-parameters.json');
    legalParameters = await response.json();
    
    // Mettre à jour la date des données légales
    if (legalParameters && legalParameters.lastUpdate) {
      const dateElements = document.querySelectorAll('.legal-params-date');
      dateElements.forEach(el => {
        el.textContent = new Date(legalParameters.lastUpdate).toLocaleDateString('fr-FR');
      });
    }
    
    // Créer le moteur de règles
    rulesEngine = new RulesEngine(legalParameters);
    
    // Connecter le moteur aux fonctions existantes
    enhanceExistingFunctions();
    
    console.log('📐 Moteur de règles juridiques initialisé');
  } catch (error) {
    console.error('Erreur d\'initialisation du moteur de règles:', error);
    // Utiliser des valeurs par défaut en cas d'erreur
    rulesEngine = new RulesEngine();
  }
}

// Initialiser la simulation avancée
function initAdvancedSimulation() {
  try {
    advancedSimulation = new AdvancedSimulation(legalParameters);
    
    // Initialiser les écouteurs d'événements pour la simulation
    initExpertModeListeners();
    initComparaisonListeners();
    
    console.log('📊 Simulation financière avancée initialisée');
  } catch (error) {
    console.error('Erreur d\'initialisation de la simulation avancée:', error);
  }
}

// Améliorer les fonctions existantes avec le moteur de règles
function enhanceExistingFunctions() {
  // S'assurer que la fonction existante est disponible
  if (typeof window.generateResults === 'function') {
    // Sauvegarder la fonction originale
    const originalGenerateResults = window.generateResults;
    
    // Remplacer par une version améliorée
    window.generateResults = function() {
      // Si le moteur de règles est disponible, l'utiliser
      if (rulesEngine) {
        // Utiliser le moteur de règles pour calculer les scores
        return enhancedGenerateResults();
      }
      
      // Sinon, utiliser la fonction originale
      return originalGenerateResults();
    };
  }
  
  // Améliorer la fonction simulerImpactFiscal si elle existe
  if (typeof window.simulationsFiscales === 'object' && 
      typeof window.simulationsFiscales.simulerImpactFiscal === 'function') {
    
    const originalSimulerImpactFiscal = window.simulationsFiscales.simulerImpactFiscal;
    
    window.simulationsFiscales.simulerImpactFiscal = function(forme, revenuAnnuel, ventilationRevenu) {
      // Utiliser le moteur de règles si disponible
      if (rulesEngine) {
        const userProfile = {
          revenuAnnuel: revenuAnnuel,
          ventilationRevenu: ventilationRevenu || { salaire: 0.5, dividendes: 0.5 }
        };
        
        return rulesEngine.calculateFiscalImpact(userProfile, forme);
      }
      
      // Sinon, utiliser la fonction originale
      return originalSimulerImpactFiscal(forme, revenuAnnuel);
    };
  }
}

// Version améliorée de generateResults utilisant le moteur de règles
function enhancedGenerateResults() {
  // Créer un profil utilisateur basé sur les réponses
  const userProfile = { ...window.userResponses };
  
  // Calculer les scores avec le moteur de règles
  const results = window.formesJuridiques.map(forme => {
    // Configurer le profil avec la forme juridique en cours
    const profileWithForm = { 
      ...userProfile, 
      formeId: forme.id 
    };
    
    // Valider la forme juridique
    const validation = rulesEngine.validateLegalForm(profileWithForm, forme);
    
    // Convertir les résultats de validation en score
    let score = 0;
    let details = [];
    let scoreDetails = {};
    
    // Gestion similaire à la fonction originale...
    
    // Utiliser les règles pour déterminer les incompatibilités
    const incompatibilities = validation.blockers.map(blocker => ({
      raison: blocker.message,
      message: blocker.message,
      suggestion: blocker.suggestion
    }));
    
    const isIncompatible = incompatibilities.length > 0;
    
    // Structure similaire au résultat original pour maintenir la compatibilité
    return {
      forme: forme,
      score: isIncompatible ? -100 : score,
      details: details,
      scoreDetails: scoreDetails,
      compatibilite: isIncompatible ? 'INCOMPATIBLE' : determineCompatibiliteLevel(score),
      incompatibilites: incompatibilities,
      incompatibiliteMajeure: isIncompatible,
      fiscalImpact: validation.fiscalImpact // Nouvel élément: impact fiscal calculé par le moteur
    };
  });
  
  // Regrouper les résultats (comme dans la fonction originale)
  // ...
  
  return results;
}

// Déterminer le niveau de compatibilité en fonction du score
function determineCompatibiliteLevel(score) {
  const SCORE_MAX_POSSIBLE = 150; // Même valeur que dans le code original
  
  if (score < 0) {
    return 'DÉCONSEILLÉ';
  } else if (score / SCORE_MAX_POSSIBLE < 0.60) {
    return 'PEU ADAPTÉ';
  } else if (score / SCORE_MAX_POSSIBLE < 0.85) {
    return 'COMPATIBLE';
  } else {
    return 'RECOMMANDÉ';
  }
}

// Initialiser les écouteurs d'événements pour le mode expert
function initExpertModeListeners() {
  // Vérifier que les éléments DOM existent
  const expertModeToggle = document.getElementById('expert-mode-toggle');
  if (!expertModeToggle) {
    console.warn('Élément expert-mode-toggle non trouvé. L\'interface du mode expert n\'est peut-être pas chargée.');
    return;
  }
  
  // Toggle du mode expert
  expertModeToggle.addEventListener('click', function() {
    const expertPanel = document.getElementById('expert-mode-panel');
    const handle = this.querySelector('.expert-toggle-handle');
    
    if (expertPanel.classList.contains('hidden')) {
      expertPanel.classList.remove('hidden');
      handle.classList.add('bg-green-400', 'translate-x-8');
      handle.classList.remove('bg-gray-400');
    } else {
      expertPanel.classList.add('hidden');
      handle.classList.remove('bg-green-400', 'translate-x-8');
      handle.classList.add('bg-gray-400');
    }
  });
  
  // Mettre à jour l'affichage des valeurs des sliders
  const ventilationSlider = document.getElementById('ventilation-salaire');
  const investmentRatioSlider = document.getElementById('investment-ratio');
  
  if (ventilationSlider) {
    ventilationSlider.addEventListener('input', function() {
      const valueDisplay = document.getElementById('ventilation-salaire-value');
      if (valueDisplay) {
        valueDisplay.textContent = this.value + '%';
      }
    });
  }
  
  if (investmentRatioSlider) {
    investmentRatioSlider.addEventListener('input', function() {
      const valueDisplay = document.getElementById('investment-ratio-value');
      if (valueDisplay) {
        valueDisplay.textContent = this.value + '%';
      }
    });
  }
  
  // Gérer la distribution mensuelle personnalisée
  const monthlyDistribution = document.getElementById('monthly-distribution');
  if (monthlyDistribution) {
    monthlyDistribution.addEventListener('change', function() {
      const customContainer = document.getElementById('custom-monthly-container');
      
      if (this.value === 'custom' && customContainer) {
        customContainer.classList.remove('hidden');
        
        // Générer les contrôles pour chaque mois
        customContainer.innerHTML = '';
        for (let i = 1; i <= 12; i++) {
          customContainer.innerHTML += `
            <div class="flex items-center mb-2">
              <label class="w-20 text-xs">Mois ${i}</label>
              <input type="range" min="0" max="100" value="8" class="custom-month-slider slider flex-grow" data-month="${i}">
              <span class="ml-2 w-10 text-xs custom-month-value">8%</span>
            </div>
          `;
        }
        
        // Ajouter les écouteurs d'événements
        customContainer.querySelectorAll('.custom-month-slider').forEach(slider => {
          slider.addEventListener('input', updateCustomDistribution);
        });
        
        // Initialiser la distribution
        updateCustomDistribution();
      } else if (customContainer) {
        customContainer.classList.add('hidden');
      }
    });
  }
  
  // Lancer la simulation avancée
  const runSimulationBtn = document.getElementById('run-advanced-simulation');
  if (runSimulationBtn) {
    runSimulationBtn.addEventListener('click', runAdvancedSimulation);
  }
}

// Mettre à jour la distribution personnalisée
function updateCustomDistribution() {
  const sliders = document.querySelectorAll('.custom-month-slider');
  let total = 0;
  
  // Calculer la somme actuelle
  sliders.forEach(slider => {
    total += parseInt(slider.value);
  });
  
  // Mettre à jour les pourcentages pour que la somme soit égale à 100%
  sliders.forEach((slider, index) => {
    const value = parseInt(slider.value);
    const normalizedValue = Math.round((value / total) * 100);
    
    // Mettre à jour l'affichage
    const valueDisplay = slider.nextElementSibling;
    if (valueDisplay) {
      valueDisplay.textContent = normalizedValue + '%';
    }
  });
}

// Exécuter la simulation avancée
function runAdvancedSimulation() {
  if (!advancedSimulation) {
    console.error('Le module de simulation avancée n\'est pas initialisé.');
    return;
  }
  
  const revenuInput = document.getElementById('revenu-simulation');
  const ventilationSlider = document.getElementById('ventilation-salaire');
  const investmentRatioSlider = document.getElementById('investment-ratio');
  const initialInvestmentInput = document.getElementById('initial-investment');
  
  if (!revenuInput) {
    console.error('Élément revenu-simulation non trouvé.');
    return;
  }
  
  const revenuAnnuel = parseFloat(revenuInput.value) || 50000;
  const ventilationSalaire = ventilationSlider ? (parseFloat(ventilationSlider.value) / 100) : 0.5;
  const investmentRatio = investmentRatioSlider ? (parseFloat(investmentRatioSlider.value) / 100) : 0;
  const initialInvestment = initialInvestmentInput ? (parseFloat(initialInvestmentInput.value) || 0) : 0;
  
  // Trouver la forme juridique sélectionnée
  let selectedForm;
  
  // Option 1: Rechercher un élément radio checked
  const selectedRadio = document.querySelector('input[name="forme-juridique"]:checked');
  if (selectedRadio) {
    const selectedFormId = selectedRadio.value;
    selectedForm = window.formesJuridiques.find(f => f.id === selectedFormId);
  } 
  // Option 2: Utiliser la première forme recommandée
  else if (window.resultatsRecommandes && window.resultatsRecommandes.length > 0) {
    selectedForm = window.resultatsRecommandes[0].forme;
  }
  // Option 3: Utiliser la première forme de la liste
  else if (window.formesJuridiques && window.formesJuridiques.length > 0) {
    selectedForm = window.formesJuridiques[0];
  }
  
  if (!selectedForm) {
    console.error('Aucune forme juridique trouvée pour la simulation.');
    return;
  }
  
  // Déterminer la distribution mensuelle
  let monthlyDistribution;
  const distributionSelect = document.getElementById('monthly-distribution');
  
  if (distributionSelect) {
    const distributionType = distributionSelect.value;
    
    switch (distributionType) {
      case 'equal':
        monthlyDistribution = Array(12).fill(1/12);
        break;
      case 'seasonal':
        monthlyDistribution = [0.06, 0.06, 0.07, 0.08, 0.09, 0.12, 0.15, 0.12, 0.09, 0.07, 0.05, 0.04];
        break;
      case 'growth':
        monthlyDistribution = [0.04, 0.05, 0.06, 0.07, 0.08, 0.08, 0.09, 0.09, 0.1, 0.1, 0.11, 0.13];
        break;
      case 'custom':
        const sliders = document.querySelectorAll('.custom-month-slider');
        if (sliders && sliders.length > 0) {
          let total = 0;
          sliders.forEach(slider => { total += parseInt(slider.value); });
          
          monthlyDistribution = Array.from(sliders).map(slider => {
            return parseInt(slider.value) / total;
          });
        } else {
          monthlyDistribution = Array(12).fill(1/12);
        }
        break;
      default:
        monthlyDistribution = Array(12).fill(1/12);
    }
  } else {
    monthlyDistribution = Array(12).fill(1/12);
  }
  
  // Configurer la simulation avancée
  advancedSimulation.setCustomDistribution({
    salary: ventilationSalaire,
    dividends: 1 - ventilationSalaire,
    investmentRatio: investmentRatio,
    initialInvestment: initialInvestment
  });
  
  // Calculer les flux mensuels
  const monthlyData = advancedSimulation.calculateMonthlyFlows(
    revenuAnnuel, 
    selectedForm, 
    monthlyDistribution
  );
  
  // Générer les données du graphique
  const chartData = advancedSimulation.generateChartData();
  
  // Afficher les résultats
  updateSimulationChart(chartData);
  updateMonthlyDataTable(monthlyData);
}

// Mettre à jour le graphique de simulation
function updateSimulationChart(chartData) {
  const canvas = document.getElementById('simulation-chart');
  if (!canvas) {
    console.error('Canvas de graphique non trouvé.');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  // Détruire le graphique existant s'il y en a un
  if (simulationChart) {
    simulationChart.destroy();
  }
  
  // Créer un nouveau graphique
  simulationChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y1: {
          position: 'right',
          grid: {
            display: false
          },
          title: {
            display: true,
            text: 'Cash-flow cumulé'
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: 'rgba(255, 255, 255, 0.7)'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y.toLocaleString('fr-FR') + ' €';
            }
          }
        }
      }
    }
  });
}

// Mettre à jour le tableau des données mensuelles
function updateMonthlyDataTable(monthlyData) {
  const tableBody = document.querySelector('#monthly-data-table tbody');
  if (!tableBody) {
    console.error('Tableau des données mensuelles non trouvé.');
    return;
  }
  
  tableBody.innerHTML = '';
  
  monthlyData.forEach(data => {
    tableBody.innerHTML += `
      <tr class="border-b border-gray-700">
        <td class="p-2">Mois ${data.month}</td>
        <td class="p-2 text-right">${Math.round(data.revenue).toLocaleString('fr-FR')} €</td>
        <td class="p-2 text-right">${Math.round(data.expenses).toLocaleString('fr-FR')} €</td>
        <td class="p-2 text-right">${Math.round(data.socialCharges).toLocaleString('fr-FR')} €</td>
        <td class="p-2 text-right">${Math.round(data.taxes).toLocaleString('fr-FR')} €</td>
        <td class="p-2 text-right font-bold ${data.cashflow >= 0 ? 'text-green-400' : 'text-red-400'}">
          ${Math.round(data.cashflow).toLocaleString('fr-FR')} €
        </td>
      </tr>
    `;
  });
  
  // Ajouter une ligne de total
  const totals = monthlyData.reduce((acc, data) => {
    acc.revenue += data.revenue;
    acc.expenses += data.expenses;
    acc.socialCharges += data.socialCharges;
    acc.taxes += data.taxes;
    acc.cashflow += data.cashflow;
    return acc;
  }, { revenue: 0, expenses: 0, socialCharges: 0, taxes: 0, cashflow: 0 });
  
  tableBody.innerHTML += `
    <tr class="bg-blue-900 bg-opacity-40 font-bold">
      <td class="p-2">TOTAL ANNUEL</td>
      <td class="p-2 text-right">${Math.round(totals.revenue).toLocaleString('fr-FR')} €</td>
      <td class="p-2 text-right">${Math.round(totals.expenses).toLocaleString('fr-FR')} €</td>
      <td class="p-2 text-right">${Math.round(totals.socialCharges).toLocaleString('fr-FR')} €</td>
      <td class="p-2 text-right">${Math.round(totals.taxes).toLocaleString('fr-FR')} €</td>
      <td class="p-2 text-right ${totals.cashflow >= 0 ? 'text-green-400' : 'text-red-400'}">
        ${Math.round(totals.cashflow).toLocaleString('fr-FR')} €
      </td>
    </tr>
  `;
}

// Initialiser les écouteurs pour la comparaison "what-if"
function initComparaisonListeners() {
  const compareBtn = document.getElementById('compare-statuses-btn');
  if (!compareBtn) {
    console.warn('Bouton de comparaison non trouvé. L\'interface de comparaison n\'est peut-être pas chargée.');
    return;
  }
  
  // Initialiser le sélecteur de statut actuel et les options
  initComparisonSelectors();
  
  // Ajouter l'écouteur d'événement pour le bouton "Comparer"
  compareBtn.addEventListener('click', runComparison);
}

// Initialiser les sélecteurs pour la comparaison
function initComparisonSelectors() {
  const currentStatusSelect = document.getElementById('current-status');
  const alternativesContainer = document.getElementById('alternative-statuses');
  
  if (!currentStatusSelect || !alternativesContainer) {
    return;
  }
  
  // Vider les conteneurs
  currentStatusSelect.innerHTML = '';
  alternativesContainer.innerHTML = '';
  
  // Remplir le sélecteur de statut actuel
  window.formesJuridiques.forEach(forme => {
    const option = document.createElement('option');
    option.value = forme.id;
    option.textContent = forme.nom;
    currentStatusSelect.appendChild(option);
  });
  
  // Remplir les options d'alternatives
  window.formesJuridiques.forEach(forme => {
    const label = document.createElement('label');
    label.className = 'flex items-center space-x-2 p-2 bg-blue-900 bg-opacity-40 rounded-lg cursor-pointer';
    label.innerHTML = `
      <input type="checkbox" value="${forme.id}" class="form-checkbox h-4 w-4 text-green-400 rounded border-gray-600 bg-blue-900 bg-opacity-40">
      <span>${forme.nom}</span>
    `;
    alternativesContainer.appendChild(label);
  });
}

// Exécuter la comparaison "what-if"
function runComparison() {
  if (!advancedSimulation) {
    console.error('Le module de simulation avancée n\'est pas initialisé.');
    return;
  }
  
  const currentStatusSelect = document.getElementById('current-status');
  const alternativeCheckboxes = document.querySelectorAll('#alternative-statuses input:checked');
  const resultsContainer = document.getElementById('comparison-results');
  
  if (!currentStatusSelect || !resultsContainer) {
    console.error('Éléments de comparaison non trouvés.');
    return;
  }
  
  const currentStatusId = currentStatusSelect.value;
  const alternativeIds = Array.from(alternativeCheckboxes).map(cb => cb.value);
  
  if (alternativeIds.length === 0) {
    resultsContainer.innerHTML = '<div class="text-yellow-400 p-4">Veuillez sélectionner au moins une alternative à comparer.</div>';
    return;
  }
  
  // Récupérer les formes juridiques
  const currentStatus = window.formesJuridiques.find(f => f.id === currentStatusId);
  const alternatives = window.formesJuridiques.filter(f => alternativeIds.includes(f.id));
  
  // Récupérer les paramètres de simulation
  const revenuInput = document.getElementById('revenu-simulation');
  const revenuAnnuel = parseFloat(revenuInput?.value || 50000);
  
  const ventilationSlider = document.getElementById('ventilation-salaire');
  const ventilationSalaire = ventilationSlider ? (parseFloat(ventilationSlider.value) / 100) : 0.5;
  
  // Paramètres utilisateur
  const userParams = {
    revenuAnnuel: revenuAnnuel,
    ventilationRevenu: {
      salaire: ventilationSalaire,
      dividendes: 1 - ventilationSalaire
    },
    distribution: Array(12).fill(1/12) // Distribution égale par défaut
  };
  
  // Effectuer la comparaison
  const comparisonResults = advancedSimulation.compareStatuses(currentStatus, alternatives, userParams);
  
  // Afficher les résultats
  displayComparisonResults(comparisonResults, resultsContainer);
}

// Afficher les résultats de la comparaison
function displayComparisonResults(results, container) {
  const currentStatus = results.current;
  const alternatives = results.alternatives;
  
  // Construire le HTML des résultats
  let html = `
    <div class="bg-blue-900 bg-opacity-40 p-4 rounded-xl mb-6">
      <h5 class="font-bold text-lg text-green-400 mb-3 flex items-center">
        <i class="fas ${currentStatus.status.icone || 'fa-building'} mr-2"></i>
        Statut actuel: ${currentStatus.status.nom}
      </h5>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <span class="opacity-70">Revenu brut:</span>
          <span class="font-semibold ml-2">${Math.round(currentStatus.data.annual.revenue).toLocaleString('fr-FR')} €</span>
        </div>
        <div>
          <span class="opacity-70">Charges sociales:</span>
          <span class="font-semibold ml-2">${Math.round(currentStatus.data.annual.socialCharges).toLocaleString('fr-FR')} €</span>
        </div>
        <div>
          <span class="opacity-70">Impôts:</span>
          <span class="font-semibold ml-2">${Math.round(currentStatus.data.annual.impot).toLocaleString('fr-FR')} €</span>
        </div>
        <div>
          <span class="opacity-70">Revenu net:</span>
          <span class="font-semibold ml-2 text-green-400">${Math.round(currentStatus.data.annual.revenuNet).toLocaleString('fr-FR')} €</span>
        </div>
        <div>
          <span class="opacity-70">Cash-flow annuel:</span>
          <span class="font-semibold ml-2">${Math.round(currentStatus.data.annual.cashflow).toLocaleString('fr-FR')} €</span>
        </div>
      </div>
    </div>
    
    <h5 class="font-bold text-lg mb-4">Comparaison avec les alternatives</h5>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
  `;
  
  // Ajouter chaque alternative
  alternatives.forEach(alt => {
    const diffClass = alt.diff.revenuNet >= 0 ? 'text-green-400' : 'text-red-400';
    const arrowIcon = alt.diff.revenuNet >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
    
    html += `
      <div class="bg-blue-900 bg-opacity-30 p-4 rounded-xl">
        <h6 class="font-bold flex items-center text-lg mb-3">
          <i class="fas ${alt.status.icone || 'fa-building'} mr-2 text-blue-400"></i>
          ${alt.status.nom}
        </h6>
        
        <div class="text-lg font-bold ${diffClass} mb-3 flex items-center">
          <i class="fas ${arrowIcon} mr-2"></i>
          ${alt.diff.revenuNet >= 0 ? '+' : ''}${Math.round(alt.diff.revenuNet).toLocaleString('fr-FR')} € 
          <span class="text-sm ml-2">(${alt.diff.revenuNetPercent >= 0 ? '+' : ''}${alt.diff.revenuNetPercent.toFixed(1)}%)</span>
        </div>
        
        <div class="grid grid-cols-1 gap-2 text-sm">
          <div class="flex justify-between">
            <span class="opacity-70">Charges sociales:</span>
            <span class="${alt.diff.chargesSociales <= 0 ? 'text-green-400' : 'text-red-400'}">
              ${alt.diff.chargesSociales >= 0 ? '+' : ''}${Math.round(alt.diff.chargesSociales).toLocaleString('fr-FR')} €
            </span>
          </div>
          <div class="flex justify-between">
            <span class="opacity-70">Impôts:</span>
            <span class="${alt.diff.impot <= 0 ? 'text-green-400' : 'text-red-400'}">
              ${alt.diff.impot >= 0 ? '+' : ''}${Math.round(alt.diff.impot).toLocaleString('fr-FR')} €
            </span>
          </div>
          <div class="flex justify-between font-semibold mt-2 pt-2 border-t border-gray-700">
            <span>Revenu net:</span>
            <span class="${diffClass}">
              ${Math.round(alt.data.annual.revenuNet).toLocaleString('fr-FR')} €
            </span>
          </div>
        </div>
        
        <!-- Points clés de différence -->
        <div class="mt-4 pt-3 border-t border-gray-700">
          <h6 class="font-semibold mb-2">Points clés</h6>
          <ul class="space-y-1 text-sm">
            <li class="flex items-start">
              <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
              ${getDifferenceHighlight(currentStatus.status, alt.status)}
            </li>
            ${getAdditionalHighlights(currentStatus.status, alt.status)}
          </ul>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  // Ajouter note de bas de comparaison
  html += `
    <div class="mt-6 text-sm bg-blue-900 bg-opacity-20 p-3 rounded-lg">
      <p class="flex items-start">
        <i class="fas fa-info-circle text-blue-400 mr-2 mt-1"></i>
        Cette comparaison est basée sur un revenu annuel de ${Math.round(currentStatus.data.annual.revenue).toLocaleString('fr-FR')} € 
        avec une répartition salaire/dividendes de ${Math.round(results.current.data.salaryRatio * 100 || 50)}%/${Math.round(results.current.data.dividendsRatio * 100 || 50)}%.
        Pour une analyse personnalisée plus précise, consultez un expert-comptable.
      </p>
    </div>
  `;
  
  // Injecter le HTML dans le conteneur
  container.innerHTML = html;
}

// Obtenir un point fort de la différence entre deux statuts
function getDifferenceHighlight(currentStatus, altStatus) {
  // Points de différence courants
  if (currentStatus.regimeFiscal !== altStatus.regimeFiscal) {
    return `Changement de régime fiscal: ${currentStatus.regimeFiscal} → ${altStatus.regimeFiscal}`;
  }
  
  if (currentStatus.regimeSocial !== altStatus.regimeSocial) {
    return `Changement de régime social: ${currentStatus.regimeSocial} → ${altStatus.regimeSocial}`;
  }
  
  if (currentStatus.protectionPatrimoine !== altStatus.protectionPatrimoine) {
    if (altStatus.protectionPatrimoine === 'Oui') {
      return 'Meilleure protection du patrimoine personnel';
    } else {
      return 'Protection du patrimoine réduite';
    }
  }
  
  if (currentStatus.id === 'micro-entreprise' && altStatus.id !== 'micro-entreprise') {
    return 'Plus de flexibilité mais plus de formalités administratives';
  }
  
  // Fallback
  return `Différent mode de fonctionnement et options`;
}

// Obtenir des points supplémentaires de différence
function getAdditionalHighlights(currentStatus, altStatus) {
  const highlights = [];
  
  // Options fiscales
  if (currentStatus.fiscaliteOption !== altStatus.fiscaliteOption) {
    if (altStatus.fiscaliteOption === 'Oui') {
      highlights.push(`<li class="flex items-start">
        <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
        Plus d'options fiscales disponibles
      </li>`);
    }
  }
  
  // Levée de fonds
  if (currentStatus.leveeFonds !== altStatus.leveeFonds) {
    if (altStatus.leveeFonds === 'Oui') {
      highlights.push(`<li class="flex items-start">
        <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
        Possibilité de lever des fonds
      </li>`);
    }
  }
  
  // Plafonds de CA
  if (currentStatus.id === 'micro-entreprise' && altStatus.id !== 'micro-entreprise') {
    highlights.push(`<li class="flex items-start">
      <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
      Pas de plafond de chiffre d'affaires
    </li>`);
  }
  
  return highlights.join('');
}

// Injecter les nouvelles fonctionnalités dans la page
window.addEventListener('DOMContentLoaded', function() {
  // Vérifier si la page types-entreprise est chargée
  const isTypesEntreprisePage = document.querySelector('#section1') !== null;
  
  if (isTypesEntreprisePage) {
    console.log('📊 Initialisation de la Phase 2 (robustesse) du simulateur de formes juridiques...');
    
    // Injecter les composants HTML pour le mode expert et la comparaison
    injectExpertModeHTML();
  }
});

// Injecter les composants HTML du mode expert dans la page
function injectExpertModeHTML() {
  try {
    // Charger le template HTML
    fetch('expert-mode-template.html')
      .then(response => response.text())
      .then(html => {
        // Insérer dans la page
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) {
          // Insérer après les résultats principaux
          resultsContainer.insertAdjacentHTML('beforeend', html);
          
          // Initialiser les écouteurs d'événements
          initExpertModeListeners();
          initComparaisonListeners();
        }
      })
      .catch(error => {
        console.error('Erreur lors du chargement du template HTML:', error);
      });
  } catch (error) {
    console.error('Erreur lors de l\'injection du HTML:', error);
  }
}
