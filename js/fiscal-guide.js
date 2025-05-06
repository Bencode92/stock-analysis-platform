// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 3.0 - Mai 2025 - Amélioré avec calcul progressif et optimisation

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
});

function initFiscalSimulator() {
    console.log("Initialisation du simulateur fiscal simplifié...");
    
    // Attendre que SimulationsFiscales soit chargé
    const checkSimEngine = setInterval(() => {
        if (window.SimulationsFiscales) {
            clearInterval(checkSimEngine);
            console.log("SimulationsFiscales trouvé, configuration du simulateur...");
            setupSimulator();
        }
    }, 200);
}

function setupSimulator() {
    const compareBtn = document.getElementById('sim-compare-btn');
    if (!compareBtn) return;
    
    compareBtn.addEventListener('click', runComparison);
    
    // Écouter les changements dans les champs pour mettre à jour automatiquement
    const inputFields = ['sim-ca', 'sim-marge', 'sim-salaire', 'sim-tmi'];
    inputFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', runComparison);
    });
    
    // Configurer l'accordéon pour les statuts juridiques
    setupAccordion();
    
    // Mettre à jour l'interface du simulateur
    updateSimulatorInterface();
    
    // Exécuter une première simulation au chargement
    setTimeout(runComparison, 100);
}

// Fonction pour mettre à jour l'interface du simulateur
function updateSimulatorInterface() {
    // Récupérer le conteneur du simulateur
    const simulatorContainer = document.getElementById('fiscal-simulator');
    if (!simulatorContainer) return;
    
    // Ajouter un sélecteur de statuts et des options de simulation avancées
    const formContainer = simulatorContainer.querySelector('.grid');
    
    if (formContainer) {
        // Ajouter une nouvelle ligne pour les options de simulation
        const optionsRow = document.createElement('div');
        optionsRow.className = 'col-span-1 md:col-span-2 mb-4';
        optionsRow.innerHTML = `
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                <h3 class="font-medium mb-3 text-green-400">Options de simulation</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="sim-options">
                    <div>
                        <label class="block text-gray-300 mb-2">Statuts à comparer</label>
                        <select id="sim-status-filter" class="w-full bg-blue-900 bg-opacity-50 border border-gray-700 rounded-lg px-4 py-2 text-white">
                            <option value="common">Statuts courants (5)</option>
                            <option value="all">Tous les statuts (13)</option>
                            <option value="commercial">Statuts commerciaux</option>
                            <option value="liberal">Professions libérales</option>
                            <option value="custom">Personnalisé</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-gray-300 mb-2">Options avancées</label>
                        <div>
                            <label class="inline-flex items-center mb-2">
                                <input type="checkbox" id="sim-show-details" class="form-checkbox h-4 w-4 text-green-400">
                                <span class="ml-2">Afficher les détails</span>
                            </label>
                            <div class="mt-2">
                                <label class="inline-flex items-center">
                                    <input type="checkbox" id="sim-progressive-ir" class="form-checkbox h-4 w-4 text-green-400">
                                    <span class="ml-2">IR progressif (tranches)</span>
                                </label>
                            </div>
                            <div class="mt-2">
                                <label class="inline-flex items-center">
                                    <input type="checkbox" id="sim-optimize" class="form-checkbox h-4 w-4 text-green-400">
                                    <span class="ml-2">Optimiser salaire/dividendes</span>
                                </label>
                            </div>
                            <div class="mt-2">
                                <a href="docs/methodologie-calculs-fiscaux.md" target="_blank" class="text-green-400 hover:text-green-300 text-sm">
                                    <i class="fas fa-info-circle mr-1"></i>Méthodologie de calcul
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="custom-status-options" class="hidden mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
                    <!-- Les cases à cocher seront ajoutées ici -->
                </div>
            </div>
        `;
        
        // Insérer avant le bouton de comparaison
        const compareButton = simulatorContainer.querySelector('#sim-compare-btn').parentNode;
        formContainer.insertBefore(optionsRow, compareButton);
        
        // Ajouter les options personnalisées
        const customStatusContainer = document.getElementById('custom-status-options');
        
        // Liste de tous les statuts disponibles
        const allStatuses = [
            { id: 'micro', label: 'Micro-entreprise' },
            { id: 'ei', label: 'Entreprise Individuelle' },
            { id: 'eurl', label: 'EURL à l\'IR' },
            { id: 'eurlIS', label: 'EURL à l\'IS' },
            { id: 'sarl', label: 'SARL' },
            { id: 'sasu', label: 'SASU' },
            { id: 'sas', label: 'SAS' },
            { id: 'sa', label: 'SA' },
            { id: 'snc', label: 'SNC' },
            { id: 'sci', label: 'SCI' },
            { id: 'selarl', label: 'SELARL' },
            { id: 'selas', label: 'SELAS' },
            { id: 'sca', label: 'SCA' }
        ];
        
        // Ajouter une case à cocher pour chaque statut
        allStatuses.forEach(status => {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'flex items-center';
            checkboxDiv.innerHTML = `
                <input type="checkbox" id="status-${status.id}" value="${status.id}" class="status-checkbox mr-2 h-4 w-4 text-green-400">
                <label for="status-${status.id}" class="text-sm">${status.label}</label>
            `;
            customStatusContainer.appendChild(checkboxDiv);
        });
        
        // Ajouter les événements
        const statusFilter = document.getElementById('sim-status-filter');
        statusFilter.addEventListener('change', function() {
            const isCustom = this.value === 'custom';
            customStatusContainer.style.display = isCustom ? 'grid' : 'none';
            
            // Cocher/décocher les cases selon le filtre sélectionné
            if (!isCustom) {
                const selectedStatuses = getSelectedStatuses(this.value);
                document.querySelectorAll('.status-checkbox').forEach(checkbox => {
                    checkbox.checked = selectedStatuses.includes(checkbox.value);
                });
            }
            
            // Relancer la comparaison
            runComparison();
        });
        
        // Ajouter un événement aux cases à cocher
        document.querySelectorAll('.status-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', runComparison);
        });
        
        // Options avancées
        const showDetails = document.getElementById('sim-show-details');
        const progressiveIR = document.getElementById('sim-progressive-ir');
        const optimize = document.getElementById('sim-optimize');
        
        if (showDetails) showDetails.addEventListener('change', runComparison);
        if (progressiveIR) progressiveIR.addEventListener('change', runComparison);
        if (optimize) optimize.addEventListener('change', runComparison);
        
        // Sélectionner par défaut les statuts courants
        statusFilter.dispatchEvent(new Event('change'));
    }
}

// Fonction pour obtenir les statuts sélectionnés selon le filtre
function getSelectedStatuses(filter) {
    switch(filter) {
        case 'common':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sasu'];
        case 'all':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc', 'sci', 'selarl', 'selas', 'sca'];
        case 'commercial':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sarl', 'sasu', 'sas', 'sa', 'snc'];
        case 'liberal':
            return ['micro', 'ei', 'eurl', 'eurlIS', 'selarl', 'selas'];
        case 'custom':
            // Récupérer les statuts cochés
            return Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value);
        default:
            return ['micro', 'ei', 'eurl', 'eurlIS', 'sasu'];
    }
}

function runComparison() {
    // Récupérer les valeurs du formulaire
    const ca = parseFloat(document.getElementById('sim-ca').value) || 50000;
    const marge = parseFloat(document.getElementById('sim-marge').value) / 100 || 0.3;
    const ratioSalaire = parseFloat(document.getElementById('sim-salaire').value) / 100 || 0.7;
    const tmi = parseFloat(document.getElementById('sim-tmi').value) || 30;
    
    // Options avancées
    const displayDetails = document.getElementById('sim-show-details')?.checked || false;
    const useProgressiveIR = document.getElementById('sim-progressive-ir')?.checked || false;
    const optimize = document.getElementById('sim-optimize')?.checked || false;
    
    const resultsBody = document.getElementById('sim-results-body');
    if (!resultsBody) return;
    
    // Paramètres communs pour toutes les simulations
    const params = {
        ca: ca,
        tauxMarge: marge,
        tauxRemuneration: ratioSalaire,
        tmiActuel: tmi,
        modeProgressif: useProgressiveIR,
        optimiser: optimize
    };
    
    // Afficher un indicateur de chargement
    resultsBody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-4">
                <div class="inline-block animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-400 mr-2"></div>
                Calcul des simulations en cours...
            </td>
        </tr>
    `;
    
    // Obtenir les statuts à simuler selon le filtre sélectionné
    const statusFilter = document.getElementById('sim-status-filter');
    const selectedStatuses = getSelectedStatuses(statusFilter ? statusFilter.value : 'common');
    
    // Utiliser setTimeout pour permettre l'affichage de l'indicateur de chargement
    setTimeout(() => {
        // Si la fonction comparerStatutsOptimises est disponible, l'utiliser pour une comparaison optimisée
        if (window.SimulationsFiscales.comparerStatutsOptimises && optimize) {
            const resultats = window.SimulationsFiscales.comparerStatutsOptimises({
                ca: ca,
                tauxMarge: marge,
                tmiActuel: tmi,
                modeProgressif: useProgressiveIR
            });
            
            // Filtrer selon les statuts sélectionnés
            const filteredResults = resultats.filter(r => 
                selectedStatuses.includes(r.id) || 
                (r.id === 'eurl-ir' && selectedStatuses.includes('eurl')) ||
                (r.id === 'eurl-is' && selectedStatuses.includes('eurlIS'))
            );
            
            displayResults(filteredResults, displayDetails);
            return;
        }
        
        // Tableau pour stocker les résultats de simulation
        const resultats = [];
        
        // Associer chaque statut à sa fonction de simulation et son nom d'affichage
        const statutsComplets = {
            'micro': { 
                id: 'micro',
                nom: 'Micro-entreprise', 
                simuler: () => window.SimulationsFiscales.simulerMicroEntreprise({
                    ...params,
                    typeMicro: 'BIC'
                })
            },
            'ei': { 
                id: 'ei',
                nom: 'Entreprise Individuelle', 
                simuler: () => window.SimulationsFiscales.simulerEI(params)
            },
            'eurl': { 
                id: 'eurl-ir',
                nom: 'EURL à l\'IR', 
                simuler: () => window.SimulationsFiscales.simulerEURL({
                    ...params,
                    optionIS: false
                })
            },
            'eurlIS': { 
                id: 'eurl-is',
                nom: 'EURL à l\'IS', 
                simuler: () => window.SimulationsFiscales.simulerEURL({
                    ...params,
                    optionIS: true
                })
            },
            'sasu': { 
                id: 'sasu',
                nom: 'SASU', 
                simuler: () => window.SimulationsFiscales.simulerSASU(params)
            },
            'sarl': { 
                id: 'sarl',
                nom: 'SARL', 
                simuler: () => window.SimulationsFiscales.simulerSARL({
                    ...params,
                    gerantMajoritaire: true
                })
            },
            'sas': { 
                id: 'sas',
                nom: 'SAS', 
                simuler: () => window.SimulationsFiscales.simulerSASU({
                    ...params,
                    // Utiliser simulerSASU avec les mêmes paramètres car dans notre cas c'est identique
                })
            },
            'sa': { 
                id: 'sa',
                nom: 'SA', 
                simuler: () => window.SimulationsFiscales.simulerSASU({
                    ...params,
                    // Simplification: utiliser SASU comme approximation
                })
            },
            'snc': { 
                id: 'snc',
                nom: 'SNC', 
                simuler: () => window.SimulationsFiscales.simulerEI({
                    ...params,
                    // Simplification: utiliser EI comme approximation
                })
            },
            'sci': { 
                id: 'sci',
                nom: 'SCI', 
                simuler: () => window.SimulationsFiscales.simulerEURL({
                    ...params,
                    optionIS: false,
                    // Simplification: utiliser EURL IR comme approximation
                })
            },
            'selarl': { 
                id: 'selarl',
                nom: 'SELARL', 
                simuler: () => window.SimulationsFiscales.simulerSARL({
                    ...params,
                    gerantMajoritaire: true
                })
            },
            'selas': { 
                id: 'selas',
                nom: 'SELAS', 
                simuler: () => window.SimulationsFiscales.simulerSASU(params)
            },
            'sca': { 
                id: 'sca',
                nom: 'SCA', 
                simuler: () => window.SimulationsFiscales.simulerSASU({
                    ...params,
                    // Simplification: utiliser SASU comme approximation
                })
            }
        };
        
        // Simuler chaque statut sélectionné
        for (const statutId of selectedStatuses) {
            if (statutsComplets[statutId]) {
                try {
                    const statut = statutsComplets[statutId];
                    const sim = statut.simuler();
                    
                    // Si incompatible, afficher un message
                    if (!sim.compatible) {
                        resultats.push({
                            id: statut.id,
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
                    let brut, charges, impots, net, dividendes = 0;
                    
                    // Ces valeurs varient selon le type de statut
                    if (statutId === 'micro') {
                        brut = sim.ca;
                        charges = sim.cotisationsSociales;
                        impots = sim.impotRevenu;
                        net = sim.revenuNetApresImpot;
                    } else if (statutId === 'ei' || statutId === 'snc') {
                        brut = sim.beneficeAvantCotisations || sim.resultatEntreprise;
                        charges = sim.cotisationsSociales;
                        impots = sim.impotRevenu;
                        net = sim.revenuNetApresImpot;
                    } else if ((statutId === 'eurl' && !sim.optimisation) || statutId === 'sci') {
                        brut = sim.beneficeImposable + sim.cotisationsSociales || sim.resultatEntreprise;
                        charges = sim.cotisationsSociales;
                        impots = sim.impotRevenu;
                        net = sim.revenuNetApresImpot || sim.revenuNetTotal;
                    } else {
                        // Cas général pour les statuts à l'IS (SASU, EURL-IS, SAS, SARL, etc.)
                        brut = sim.remuneration || (sim.resultatEntreprise * ratioSalaire);
                        charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);
                        impots = (sim.impotRevenu || 0);
                        if (sim.is) impots += sim.is;
                        if (sim.prelevementForfaitaire) impots += sim.prelevementForfaitaire;
                        
                        dividendes = sim.dividendesNets || 0;
                        net = sim.revenuNetTotal || sim.revenuNetApresImpot;
                    }
                    
                    resultats.push({
                        id: statut.id,
                        statut: statut.nom + (sim.optimisation ? ' (optimisée)' : ''),
                        brut: brut,
                        charges: charges,
                        impots: impots,
                        dividendes: dividendes,
                        net: net,
                        sim: sim,
                        score: 100 * (net / ca),
                        optimisation: sim.optimisation
                    });
                } catch (e) {
                    console.error(`Erreur lors de la simulation pour ${statutsComplets[statutId].nom}:`, e);
                    resultats.push({
                        id: statut.id,
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
        
        // Afficher les résultats
        displayResults(resultats, displayDetails);
    }, 10);
}

function displayResults(resultats, displayDetails) {
    const resultsBody = document.getElementById('sim-results-body');
    if (!resultsBody) return;
    
    // Vider les résultats précédents
    resultsBody.innerHTML = '';
    
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
    
    // Modifier l'en-tête du tableau si nécessaire pour afficher les détails
    const tableHeader = document.querySelector('#sim-results thead tr');
    if (tableHeader) {
        if (displayDetails) {
            // Ajouter des colonnes de détails si elles n'existent pas
            if (tableHeader.querySelectorAll('th').length < 6) {
                tableHeader.innerHTML = `
                    <th class="px-4 py-3 rounded-tl-lg">Statut</th>
                    <th class="px-4 py-3">Rémunération brute</th>
                    <th class="px-4 py-3">Charges sociales</th>
                    <th class="px-4 py-3">Impôts</th>
                    <th class="px-4 py-3">Dividendes nets</th>
                    <th class="px-4 py-3 rounded-tr-lg">Net en poche</th>
                `;
            }
        } else {
            // Revenir à l'affichage standard
            tableHeader.innerHTML = `
                <th class="px-4 py-3 rounded-tl-lg">Statut</th>
                <th class="px-4 py-3">Rémunération brute</th>
                <th class="px-4 py-3">Charges sociales</th>
                <th class="px-4 py-3">Impôts</th>
                <th class="px-4 py-3 rounded-tr-lg">Net en poche</th>
            `;
        }
    }
    
    // Afficher les résultats dans le tableau
    resultats.forEach((res, index) => {
        const isTopResult = index === 0;
        const isGoodResult = res.score > scoresMoyen;
        const isOptimized = res.optimisation;
        
        const row = document.createElement('tr');
        row.className = isTopResult 
            ? 'bg-green-900 bg-opacity-20 font-medium' 
            : (index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '');
        
        if (isOptimized) {
            row.classList.add('border-l-2', 'border-green-400');
        }
        
        if (displayDetails && res.sim && res.score > 0) {
            // Affichage détaillé avec dividendes séparés
            const dividendesNets = res.dividendes || 0;
            const remunerationNette = res.net - dividendesNets;
            
            // Ajouter une info-bulle pour les statuts optimisés
            let optimisationInfo = '';
            if (isOptimized && res.sim.ratioOptimal !== undefined) {
                optimisationInfo = `
                    <div class="text-xs text-green-400 mt-1">
                        <i class="fas fa-check-circle mr-1"></i>Ratio optimal: ${Math.round(res.sim.ratioOptimal * 100)}% salaire
                    </div>
                `;
            }
            
            row.innerHTML = `
                <td class="px-4 py-3 font-medium">
                    ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                    ${res.statut}
                    ${optimisationInfo}
                </td>
                <td class="px-4 py-3">${res.brut === '-' ? '-' : formatter.format(res.brut)}</td>
                <td class="px-4 py-3">${res.charges === '-' ? '-' : formatter.format(res.charges)}</td>
                <td class="px-4 py-3">${res.impots === '-' ? '-' : formatter.format(res.impots)}</td>
                <td class="px-4 py-3">${dividendesNets ? formatter.format(dividendesNets) : '-'}</td>
                <td class="px-4 py-3 font-medium ${isTopResult ? 'text-green-400' : (isGoodResult ? 'text-green-300' : '')}">
                    ${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}
                </td>
            `;
        } else {
            // Affichage standard
            let optimisationInfo = '';
            if (isOptimized && res.sim.ratioOptimal !== undefined) {
                optimisationInfo = `
                    <div class="text-xs text-green-400 mt-1">
                        <i class="fas fa-check-circle mr-1"></i>Ratio optimal: ${Math.round(res.sim.ratioOptimal * 100)}% salaire
                    </div>
                `;
            }
            
            row.innerHTML = `
                <td class="px-4 py-3 font-medium">
                    ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                    ${res.statut}
                    ${optimisationInfo}
                </td>
                <td class="px-4 py-3">${res.brut === '-' ? '-' : formatter.format(res.brut)}</td>
                <td class="px-4 py-3">${res.charges === '-' ? '-' : formatter.format(res.charges)}</td>
                <td class="px-4 py-3">${res.impots === '-' ? '-' : formatter.format(res.impots)}</td>
                <td class="px-4 py-3 font-medium ${isTopResult ? 'text-green-400' : (isGoodResult ? 'text-green-300' : '')}">
                    ${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}
                </td>
            `;
        }
        
        resultsBody.appendChild(row);
    });
    
    // Ajouter ligne de ratio net/brut pour les statuts compatibles
    const ratioRow = document.createElement('tr');
    ratioRow.className = 'border-t border-gray-700 text-sm';
    
    if (displayDetails) {
        ratioRow.innerHTML = `
            <td class="px-4 py-2 italic" colspan="5">Ratio net/CA</td>
            <td class="px-4 py-2 font-medium">
                ${scoresCompatibles.length > 0 
                    ? `${resultats[0].score.toFixed(1)}% (max) / ${scoresMoyen.toFixed(1)}% (moy)` 
                    : 'N/A'}
            </td>
        `;
    } else {
        ratioRow.innerHTML = `
            <td class="px-4 py-2 italic" colspan="4">Ratio net/CA</td>
            <td class="px-4 py-2 font-medium">
                ${scoresCompatibles.length > 0 
                    ? `${resultats[0].score.toFixed(1)}% (max) / ${scoresMoyen.toFixed(1)}% (moy)` 
                    : 'N/A'}
            </td>
        `;
    }
    
    resultsBody.appendChild(ratioRow);
    
    // Ajouter des informations sur les options activées
    const optionsInfoRow = document.createElement('tr');
    optionsInfoRow.className = 'text-xs text-gray-400';
    
    const modeProgressifActif = document.getElementById('sim-progressive-ir')?.checked || false;
    const optimisationActive = document.getElementById('sim-optimize')?.checked || false;
    
    let optionsInfoHTML = `<td colspan="${displayDetails ? '6' : '5'}" class="px-4 py-2 text-right">`;
    
    if (modeProgressifActif) {
        optionsInfoHTML += `<span class="ml-2"><i class="fas fa-check-circle text-green-400 mr-1"></i>IR progressif activé</span>`;
    }
    if (optimisationActive) {
        optionsInfoHTML += `<span class="ml-2"><i class="fas fa-check-circle text-green-400 mr-1"></i>Optimisation salaire/dividendes activée</span>`;
    }
    
    if (!modeProgressifActif && !optimisationActive) {
        optionsInfoHTML += `Mode standard (TMI directe, sans optimisation)`;
    }
    
    optionsInfoHTML += `</td>`;
    optionsInfoRow.innerHTML = optionsInfoHTML;
    
    resultsBody.appendChild(optionsInfoRow);
}

// Configurer l'accordéon pour les sections d'informations fiscales
function setupAccordion() {
    // Récupérer le conteneur pour l'accordéon
    const accordionContainer = document.querySelector('.space-y-4');
    if (!accordionContainer) return;
    
    // Vider le conteneur actuel
    accordionContainer.innerHTML = '';
    
    // Récupérer la liste des statuts depuis legalStatuses si disponible, sinon utiliser une liste par défaut
    let statuts = [];
    if (window.legalStatuses) {
        statuts = Object.keys(window.legalStatuses);
    } else {
        // Liste des statuts par défaut
        statuts = ['MICRO', 'EI', 'EURL', 'SASU', 'SARL', 'SAS', 'SA', 'SNC', 'SCI', 'SELARL', 'SELAS', 'SCA'];
    }
    
    // Générer l'accordéon pour chaque statut
    statuts.forEach(statutId => {
        const nomStatut = window.legalStatuses && window.legalStatuses[statutId] 
            ? window.legalStatuses[statutId].name 
            : getDefaultNomStatut(statutId);
        
        // Créer l'élément d'accordéon
        const accordionItem = document.createElement('div');
        accordionItem.className = 'bg-blue-900 bg-opacity-30 rounded-lg overflow-hidden mb-3';
        
        // Contenu de l'accordéon basé sur le statut
        accordionItem.innerHTML = `
            <button class="accordion-toggle w-full flex justify-between items-center px-4 py-3 text-left font-medium">
                ${nomStatut}
                <i class="fas fa-plus"></i>
            </button>
            <div class="hidden px-4 py-3 border-t border-gray-700">
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
            const icon = this.querySelector('i');
            icon.classList.toggle('fa-plus');
            icon.classList.toggle('fa-minus');
        });
    });
    
    // Ajouter un bouton pour accéder à la documentation méthodologique complète
    const docButton = document.createElement('div');
    docButton.className = 'text-center mt-6';
    docButton.innerHTML = `
        <a href="docs/methodologie-calculs-fiscaux.md" target="_blank" 
           class="inline-block bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
            <i class="fas fa-file-alt mr-2"></i>Voir la documentation méthodologique complète
        </a>
    `;
    accordionContainer.appendChild(docButton);
}

// Fonction d'aide pour obtenir le nom par défaut si legalStatuses n'est pas disponible
function getDefaultNomStatut(statutId) {
    const noms = {
        'MICRO': 'Micro-entreprise',
        'EI': 'Entreprise Individuelle',
        'EURL': 'EURL',
        'SASU': 'SASU',
        'SARL': 'SARL',
        'SAS': 'SAS',
        'SA': 'Société Anonyme',
        'SNC': 'Société en Nom Collectif',
        'SCI': 'Société Civile Immobilière',
        'SELARL': 'SELARL',
        'SELAS': 'SELAS',
        'SCA': 'Société en Commandite par Actions'
    };
    return noms[statutId] || statutId;
}

// Fonction pour générer les informations fiscales de chaque statut
function getStatutFiscalInfo(statutId) {
    // Amélioré pour inclure des informations sur l'optimisation
    const infosFiscales = {
        'MICRO': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
            <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services) du CA</p>
            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente), 77 700€ (services)</p>
            <p class="mb-2"><strong>Option versement libératoire :</strong> Possible si revenu fiscal N-2 < plafond</p>
            <p class="mb-2 mt-4 text-green-400"><strong>Potentiel d'optimisation :</strong> Aucun (régime forfaitaire)</p>
        `,
        'EI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Environ 45% sur le bénéfice</p>
            <p class="mb-2"><strong>Plafonds :</strong> Aucun</p>
            <p class="mb-2"><strong>Particularité :</strong> Patrimoine professionnel distinct depuis 2022</p>
            <p class="mb-2 mt-4 text-green-400"><strong>Potentiel d'optimisation :</strong> Limité (pas de distinction salaire/dividendes)</p>
        `,
        'EURL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut (gérant associé unique)</p>
            <p class="mb-2"><strong>Option fiscale :</strong> IS possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS (~40-45% sur rémunération)</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2 mt-4 text-green-400"><strong>Potentiel d'optimisation :</strong> Élevé avec option IS (répartition salaire/dividendes)</p>
            <div class="bg-blue-900 bg-opacity-40 p-3 rounded-lg mt-2 text-sm">
                <p class="font-medium text-green-400 mb-1"><i class="fas fa-lightbulb mr-1"></i>Astuce d'optimisation :</p>
                <p>Avec option IS, il est généralement avantageux de se verser un salaire modéré (25-40% du bénéfice) et de prendre le reste en dividendes pour optimiser les charges sociales.</p>
            </div>
        `,
        'SASU': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (Impôt sur les Sociétés)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Environ 80-85% sur salaire brut (part salariale + patronale)</p>
            <p class="mb-2"><strong>Rémunération président :</strong> Assimilé salarié</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2 mt-4 text-green-400"><strong>Potentiel d'optimisation :</strong> Très élevé (arbitrage salaire/dividendes)</p>
            <div class="bg-blue-900 bg-opacity-40 p-3 rounded-lg mt-2 text-sm">
                <p class="font-medium text-green-400 mb-1"><i class="fas fa-lightbulb mr-1"></i>Astuce d'optimisation :</p>
                <p>En SASU, il est souvent optimal de se verser un salaire limité (30-40% du bénéfice) pour profiter de la protection sociale, puis prendre le reste en dividendes soumis au PFU de 30%, moins coûteux que les charges sociales.</p>
            </div>
        `,
        'SARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (option IR possible sur 5 ans)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour gérant majoritaire, assimilé salarié pour gérant minoritaire</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Structure flexible adaptée aux PME et entreprises familiales</p>
            <p class="mb-2 mt-4 text-green-400"><strong>Potentiel d'optimisation :</strong> Élevé pour gérant majoritaire (arbitrage salaire/dividendes)</p>
            <div class="bg-blue-900 bg-opacity-40 p-3 rounded-lg mt-2 text-sm">
                <p class="font-medium text-green-400 mb-1"><i class="fas fa-lightbulb mr-1"></i>Astuce d'optimisation :</p>
                <p>Pour un gérant majoritaire de SARL, l'optimisation est similaire à l'EURL à l'IS. Pour un gérant minoritaire (assimilé salarié), l'approche se rapproche de celle de la SASU.</p>
            </div>
        `,
        'SAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour le président</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Adaptée aux structures avec investisseurs</p>
            <p class="mb-2 mt-4 text-green-400"><strong>Potentiel d'optimisation :</strong> Très élevé (similaire à la SASU)</p>
        `
    };
    
    // Pour les autres statuts, utiliser un texte générique
    if (!infosFiscales[statutId]) {
        return `
            <p class="mb-2">Informations fiscales non détaillées pour ce statut.</p>
            <p class="mb-2">Pour une simulation précise, utilisez l'outil de comparaison ci-dessus.</p>
        `;
    }
    
    return infosFiscales[statutId];
}

// Exposer l'initialisation au niveau global pour l'onglet
window.initFiscalSimulator = initFiscalSimulator;