// fiscal-guide.js - Simulateur fiscal simplifié pour l'onglet Guide fiscal
// Version 1.0 - Mai 2025

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
    
    // Exécuter une première simulation au chargement
    setTimeout(runComparison, 100);
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
    
    // Simuler chaque statut juridique majeur
    const statuts = {
        'micro': 'Micro-entreprise',
        'ei': 'Entreprise Individuelle',
        'eurl': 'EURL à l\'IR',
        'eurlIS': 'EURL à l\'IS',
        'sasu': 'SASU'
    };
    
    // Tableau pour stocker les résultats de simulation
    const resultats = [];
    
    // Simuler chaque statut
    for (const [id, nom] of Object.entries(statuts)) {
        let sim;
        
        try {
            switch(id) {
                case 'micro':
                    sim = window.SimulationsFiscales.simulerMicroEntreprise({
                        ca: ca,
                        typeMicro: 'BIC',
                        tmiActuel: tmi
                    });
                    
                    // Si CA dépasse le plafond Micro, marquer comme incompatible
                    if (!sim.compatible) {
                        resultats.push({
                            statut: nom,
                            brut: '-',
                            charges: '-',
                            impots: '-',
                            net: `<span class="text-red-400">CA > plafond</span>`,
                            score: 0
                        });
                        continue;
                    }
                    
                    resultats.push({
                        statut: nom,
                        brut: sim.ca,
                        charges: sim.cotisationsSociales,
                        impots: sim.impotRevenu,
                        net: sim.revenuNetApresImpot,
                        score: 100 * (sim.revenuNetApresImpot / ca)
                    });
                    break;
                    
                case 'ei':
                    sim = window.SimulationsFiscales.simulerEI({
                        ca: ca,
                        tauxMarge: marge,
                        tmiActuel: tmi
                    });
                    
                    resultats.push({
                        statut: nom,
                        brut: sim.beneficeAvantCotisations,
                        charges: sim.cotisationsSociales,
                        impots: sim.impotRevenu,
                        net: sim.revenuNetApresImpot,
                        score: 100 * (sim.revenuNetApresImpot / ca)
                    });
                    break;
                    
                case 'eurl':
                    sim = window.SimulationsFiscales.simulerEURL({
                        ca: ca,
                        tauxMarge: marge,
                        tauxRemuneration: ratioSalaire,
                        optionIS: false,
                        tmiActuel: tmi
                    });
                    
                    resultats.push({
                        statut: nom,
                        brut: sim.resultatAvantRemuneration,
                        charges: sim.cotisationsSociales,
                        impots: sim.impotRevenu,
                        net: sim.revenuNetApresImpot,
                        score: 100 * (sim.revenuNetApresImpot / ca)
                    });
                    break;
                    
                case 'eurlIS':
                    sim = window.SimulationsFiscales.simulerEURL({
                        ca: ca,
                        tauxMarge: marge,
                        tauxRemuneration: ratioSalaire,
                        optionIS: true,
                        tmiActuel: tmi
                    });
                    
                    resultats.push({
                        statut: nom,
                        brut: sim.remuneration,
                        charges: sim.cotisationsSociales,
                        impots: sim.is + sim.prelevementForfaitaire,
                        net: sim.revenuNetTotal,
                        score: 100 * (sim.revenuNetTotal / ca)
                    });
                    break;
                    
                case 'sasu':
                    sim = window.SimulationsFiscales.simulerSASU({
                        ca: ca,
                        tauxMarge: marge,
                        tauxRemuneration: ratioSalaire,
                        tmiActuel: tmi
                    });
                    
                    resultats.push({
                        statut: nom,
                        brut: sim.remuneration,
                        charges: sim.chargesSalariales + sim.chargesPatronales,
                        impots: sim.is + sim.prelevementForfaitaire,
                        net: sim.revenuNetTotal,
                        score: 100 * (sim.revenuNetTotal / ca)
                    });
                    break;
            }
        } catch (e) {
            console.error(`Erreur lors de la simulation pour ${nom}:`, e);
            resultats.push({
                statut: nom,
                brut: '-',
                charges: '-',
                impots: '-',
                net: `<span class="text-red-400">Erreur de calcul</span>`,
                score: 0
            });
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
    
    // Afficher les résultats dans le tableau
    resultats.forEach((res, index) => {
        const isTopResult = index === 0;
        const isGoodResult = res.score > scoresMoyen;
        
        const row = document.createElement('tr');
        row.className = isTopResult 
            ? 'bg-green-900 bg-opacity-20 font-medium' 
            : (index % 2 === 0 ? 'bg-blue-900 bg-opacity-20' : '');
        
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
        
        resultsBody.appendChild(row);
    });
    
    // Ajouter ligne de ratio net/brut pour les statuts compatibles
    const ratioRow = document.createElement('tr');
    ratioRow.className = 'border-t border-gray-700 text-sm';
    ratioRow.innerHTML = `
        <td class="px-4 py-2 italic" colspan="4">Ratio net/CA</td>
        <td class="px-4 py-2 font-medium">
            ${scoresCompatibles.length > 0 
                ? `${resultats[0].score.toFixed(1)}% (max) / ${scoresMoyen.toFixed(1)}% (moy)` 
                : 'N/A'}
        </td>
    `;
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