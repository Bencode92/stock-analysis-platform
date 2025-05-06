// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 2.0 - Mai 2025 - Mise à jour pour inclure tous les statuts juridiques

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
                            <label class="inline-flex items-center">
                                <input type="checkbox" id="sim-show-details" class="form-checkbox h-4 w-4 text-green-400">
                                <span class="ml-2">Afficher les détails</span>
                            </label>
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
        
        // Option d'affichage des détails
        const showDetails = document.getElementById('sim-show-details');
        if (showDetails) {
            showDetails.addEventListener('change', runComparison);
        }
        
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
    
    const resultsBody = document.getElementById('sim-results-body');
    if (!resultsBody) return;
    
    // Paramètres communs pour toutes les simulations
    const params = {
        ca: ca,
        tauxMarge: marge,
        tauxRemuneration: ratioSalaire,
        tmiActuel: tmi
    };
    
    // Vider les résultats précédents
    resultsBody.innerHTML = '';
    
    // Vérifier si on doit afficher les détails
    const showDetails = document.getElementById('sim-show-details');
    const displayDetails = showDetails && showDetails.checked;
    
    // Obtenir les statuts à simuler selon le filtre sélectionné
    const statusFilter = document.getElementById('sim-status-filter');
    const selectedStatuses = getSelectedStatuses(statusFilter ? statusFilter.value : 'common');
    
    // Tableau pour stocker les résultats de simulation
    const resultats = [];
    
    // Associer chaque statut à sa fonction de simulation et son nom d'affichage
    const statutsComplets = {
        'micro': { 
            nom: 'Micro-entreprise', 
            simuler: () => window.SimulationsFiscales.simulerMicroEntreprise({
                ca: ca,
                typeMicro: 'BIC',
                tmiActuel: tmi
            })
        },
        'ei': { 
            nom: 'Entreprise Individuelle', 
            simuler: () => window.SimulationsFiscales.simulerEI({
                ca: ca,
                tauxMarge: marge,
                tmiActuel: tmi
            })
        },
        'eurl': { 
            nom: 'EURL à l\'IR', 
            simuler: () => window.SimulationsFiscales.simulerEURL({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                optionIS: false,
                tmiActuel: tmi
            })
        },
        'eurlIS': { 
            nom: 'EURL à l\'IS', 
            simuler: () => window.SimulationsFiscales.simulerEURL({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                optionIS: true,
                tmiActuel: tmi
            })
        },
        'sasu': { 
            nom: 'SASU', 
            simuler: () => window.SimulationsFiscales.simulerSASU({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi
            })
        },
        'sarl': { 
            nom: 'SARL', 
            simuler: () => window.SimulationsFiscales.simulerSARL({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi,
                gerantMajoritaire: true
            })
        },
        'sas': { 
            nom: 'SAS', 
            simuler: () => window.SimulationsFiscales.simulerSAS({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi
            })
        },
        'sa': { 
            nom: 'SA', 
            simuler: () => window.SimulationsFiscales.simulerSA({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi
            })
        },
        'snc': { 
            nom: 'SNC', 
            simuler: () => window.SimulationsFiscales.simulerSNC({
                ca: ca,
                tauxMarge: marge,
                tmiActuel: tmi
            })
        },
        'sci': { 
            nom: 'SCI', 
            simuler: () => window.SimulationsFiscales.simulerSCI({
                revenuLocatif: ca,
                chargesDeductibles: ca * (1 - marge),
                tmiActuel: tmi
            })
        },
        'selarl': { 
            nom: 'SELARL', 
            simuler: () => window.SimulationsFiscales.simulerSELARL({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi
            })
        },
        'selas': { 
            nom: 'SELAS', 
            simuler: () => window.SimulationsFiscales.simulerSELAS({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi
            })
        },
        'sca': { 
            nom: 'SCA', 
            simuler: () => window.SimulationsFiscales.simulerSCA({
                ca: ca,
                tauxMarge: marge,
                tauxRemuneration: ratioSalaire,
                tmiActuel: tmi
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
                    charges = sim.cotisationsSociales;
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
                    brut = sim.remuneration || sim.resultatEntreprise * ratioSalaire;
                    charges = sim.cotisationsSociales || (sim.chargesPatronales + sim.chargesSalariales);
                    impots = (sim.impotRevenu || 0) + (sim.is || 0) + (sim.prelevementForfaitaire || 0);
                    net = sim.revenuNetTotal || sim.revenuNetApresImpot;
                }
                
                resultats.push({
                    statut: statut.nom,
                    brut: brut,
                    charges: charges,
                    impots: impots,
                    net: net,
                    sim: sim,
                    score: 100 * (net / ca)
                });
            } catch (e) {
                console.error(`Erreur lors de la simulation pour ${statutsComplets[statutId].nom}:`, e);
                resultats.push({
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
        
        const row = document.createElement('tr');
        row.className = isTopResult 
            ? 'bg-green-900 bg-opacity-20 font-medium' 
            : (index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '');
        
        if (displayDetails && res.sim && res.score > 0) {
            // Affichage détaillé avec dividendes séparés
            const dividendesNets = res.sim.dividendesNets || 0;
            const remunerationNette = res.net - dividendesNets;
            
            row.innerHTML = `
                <td class="px-4 py-3 font-medium">
                    ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                    ${res.statut}
                </td>
                <td class="px-4 py-3">${res.brut === '-' ? '-' : formatter.format(res.brut)}</td>
                <td class="px-4 py-3">${res.charges === '-' ? '-' : formatter.format(res.charges)}</td>
                <td class="px-4 py-3">${res.impots === '-' ? '-' : formatter.format(res.impots)}</td>
                <td class="px-4 py-3">${dividendesNets ? formatter.format(dividendesNets) : '-'}</td>
                <td class="px-4 py-3 font-medium ${isTopResult ? 'text-green-400' : (isGoodResult ? 'text-green-300' : '')}">${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}</td>
            `;
        } else {
            // Affichage standard
            row.innerHTML = `
                <td class="px-4 py-3 font-medium">
                    ${isTopResult ? '<i class="fas fa-star text-yellow-400 mr-2"></i>' : ''}
                    ${res.statut}
                </td>
                <td class="px-4 py-3">${res.brut === '-' ? '-' : formatter.format(res.brut)}</td>
                <td class="px-4 py-3">${res.charges === '-' ? '-' : formatter.format(res.charges)}</td>
                <td class="px-4 py-3">${res.impots === '-' ? '-' : formatter.format(res.impots)}</td>
                <td class="px-4 py-3 font-medium ${isTopResult ? 'text-green-400' : (isGoodResult ? 'text-green-300' : '')}">${res.net === '-' ? '-' : (typeof res.net === 'string' ? res.net : formatter.format(res.net))}</td>
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
    // Informations fiscales par défaut pour chaque statut
    const infosFiscales = {
        'MICRO': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR avec abattement forfaitaire</p>
            <p class="mb-2"><strong>Abattements :</strong> 71% (vente), 50% (services BIC), 34% (BNC)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> 12.3% (vente), 21.2% (services) du CA</p>
            <p class="mb-2"><strong>Plafonds 2025 :</strong> 188 700€ (vente), 77 700€ (services)</p>
            <p class="mb-2"><strong>Option versement libératoire :</strong> Possible si revenu fiscal N-2 < plafond</p>
        `,
        'EI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Environ 45% sur le bénéfice</p>
            <p class="mb-2"><strong>Plafonds :</strong> Aucun</p>
            <p class="mb-2"><strong>Particularité :</strong> Patrimoine professionnel distinct depuis 2022</p>
        `,
        'EURL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut (gérant associé unique)</p>
            <p class="mb-2"><strong>Option fiscale :</strong> IS possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS (~40-45% sur rémunération)</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
        `,
        'SASU': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (Impôt sur les Sociétés)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Environ 80-85% sur salaire brut (part salariale + patronale)</p>
            <p class="mb-2"><strong>Rémunération président :</strong> Assimilé salarié</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
        `,
        'SARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS (option IR possible sur 5 ans)</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour gérant majoritaire, assimilé salarié pour gérant minoritaire</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Structure flexible adaptée aux PME et entreprises familiales</p>
        `,
        'SAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour le président</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Adaptée aux structures avec investisseurs</p>
        `,
        'SA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Capital minimum :</strong> 37 000€</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour les dirigeants</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Structure pour grandes entreprises ou cotation en bourse</p>
        `,
        'SNC': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR (transparence fiscale)</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour les associés</p>
            <p class="mb-2"><strong>Particularité :</strong> Imposition directe des bénéfices aux associés (IR)</p>
            <p class="mb-2"><strong>Responsabilité :</strong> Indéfinie et solidaire des associés</p>
        `,
        'SCI': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IR par défaut (transparence fiscale)</p>
            <p class="mb-2"><strong>Option IS :</strong> Possible mais généralement défavorable</p>
            <p class="mb-2"><strong>TVA :</strong> Exonération possible pour location nue</p>
            <p class="mb-2"><strong>Particularité :</strong> Revenus fonciers pour les associés à l'IR</p>
            <p class="mb-2"><strong>Usage :</strong> Gestion et transmission de patrimoine immobilier</p>
        `,
        'SELARL': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> TNS pour gérant majoritaire</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Réservée aux professions libérales réglementées</p>
        `,
        'SELAS': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Charges sociales :</strong> Assimilé salarié pour le président</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Réservée aux professions libérales réglementées</p>
            <p class="mb-2"><strong>Avantages :</strong> Combine flexibilité de la SAS et exercice libéral</p>
        `,
        'SCA': `
            <p class="mb-2"><strong>Régime fiscal :</strong> IS</p>
            <p class="mb-2"><strong>Structure :</strong> Commandités (responsabilité illimitée) et commanditaires (limitée)</p>
            <p class="mb-2"><strong>Dividendes :</strong> Soumis aux prélèvements sociaux (17.2%) + PFU (12.8%) ou IR</p>
            <p class="mb-2"><strong>IS :</strong> 15% jusqu'à 42 500€ de bénéfices, 25% au-delà</p>
            <p class="mb-2"><strong>Particularité :</strong> Protection contre les OPA hostiles</p>
            <p class="mb-2"><strong>Usage :</strong> Structure familiale cherchant à lever des fonds</p>
        `
    };
    
    return infosFiscales[statutId] || `<p class="mb-2">Informations fiscales non disponibles pour ce statut.</p>`;
}

// Exposer l'initialisation au niveau global pour l'onglet
window.initFiscalSimulator = initFiscalSimulator;