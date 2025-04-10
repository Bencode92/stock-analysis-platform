/**
 * fiscal-optimizer.js - Module de simulation patrimoniale complète
 * Ce module gère toute la logique de simulation fiscale, calcul de dépenses et allocation d'actifs
 * TradePulse Finance Intelligence Platform
 */

// Structure principale du module (Pattern Module pour encapsulation)
const PatrimoineSimulator = (function() {
    // Constantes fiscales (France 2024-2025)
    const TRANCHES_IMPOT = [
        { min: 0, max: 11294, taux: 0 },
        { min: 11294, max: 28787, taux: 0.11 },
        { min: 28787, max: 82341, taux: 0.30 },
        { min: 82341, max: 177106, taux: 0.41 },
        { min: 177106, max: Infinity, taux: 0.45 }
    ];

    // Configuration par défaut
    const CONFIG_DEFAUT = {
        taux_charges: 0.22,        // 22% charges sociales
        per_pourcentage: 0.10,     // 10% du brut
        budget: {
            loyer: 1000,           // loyer/crédit mensuel
            quotidien: 1200,       // dépenses courantes
            extra: 500,            // loisirs, sorties, etc.
            investAuto: 300        // investissement automatique
        },
        allocation: {
            etf: 0.40,             // 40% en ETF
            assuranceVie: 0.25,    // 25% en assurance-vie
            scpi: 0.15,            // 15% en SCPI
            crypto: 0.10,          // 10% en crypto
            autres: 0.10           // 10% en autres (cash, etc.)
        }
    };

    // État interne du simulateur
    let state = {
        revenuBrut: 0,
        tauxCharges: CONFIG_DEFAUT.taux_charges,
        perPourcentage: CONFIG_DEFAUT.per_pourcentage,
        budget: {...CONFIG_DEFAUT.budget},
        allocation: {...CONFIG_DEFAUT.allocation},
        resultats: {
            // Section fiscalité
            netImposableSansPER: 0,
            netImposableAvecPER: 0,
            perVersement: 0,
            impotSansPER: 0,
            impotAvecPER: 0,
            gainFiscal: 0,
            netDispoSansPER: 0,
            netDispoAvecPER: 0,
            patrimoineGlobal: 0,
            
            // Section budget
            depensesTotales: 0,
            epargneTotale: 0,
            tauxEpargne: 0,
            
            // Section allocation
            montantDispo: 0,
            allocations: {
                etf: 0,
                assuranceVie: 0,
                scpi: 0,
                crypto: 0,
                autres: 0
            }
        }
    };

    /**
     * Réinitialise l'état avec les valeurs par défaut
     */
    function resetState() {
        state.tauxCharges = CONFIG_DEFAUT.taux_charges;
        state.perPourcentage = CONFIG_DEFAUT.per_pourcentage;
        state.budget = {...CONFIG_DEFAUT.budget};
        state.allocation = {...CONFIG_DEFAUT.allocation};
    }

    /**
     * Calcule l'impôt sur le revenu selon les tranches progressives
     * @param {number} revenuImposable - Revenu net imposable
     * @returns {number} Montant de l'impôt
     */
    function calculerImpot(revenuImposable) {
        let impot = 0;
        
        for (let i = 1; i < TRANCHES_IMPOT.length; i++) {
            const tranche = TRANCHES_IMPOT[i];
            const tranchePrecedente = TRANCHES_IMPOT[i-1];
            
            if (revenuImposable > tranchePrecedente.max) {
                const montantImposableDansTranche = Math.min(revenuImposable, tranche.max) - tranchePrecedente.max;
                impot += montantImposableDansTranche * tranche.taux;
            }
        }
        
        return Math.round(impot * 100) / 100;
    }

    /**
     * Calcule la simulation fiscale complète
     * @param {Object} params - Paramètres de la simulation
     * @returns {Object} Résultats détaillés de la simulation fiscale
     */
    function calculerSimulationFiscale(params = {}) {
        // Mise à jour de l'état avec les paramètres reçus
        state.revenuBrut = params.revenuBrut || state.revenuBrut;
        state.tauxCharges = params.tauxCharges || state.tauxCharges;
        state.perPourcentage = params.perPourcentage || state.perPourcentage;
        
        // Calculs fiscaux principaux
        const netImposableSansPER = state.revenuBrut * (1 - state.tauxCharges);
        const perVersement = state.revenuBrut * state.perPourcentage;
        const netImposableAvecPER = netImposableSansPER - perVersement;
        
        // Calculs d'impôts selon les tranches
        const impotSansPER = calculerImpot(netImposableSansPER);
        const impotAvecPER = calculerImpot(netImposableAvecPER);
        const gainFiscal = impotSansPER - impotAvecPER;
        
        // Calculs nets après impôts
        const netDispoSansPER = netImposableSansPER - impotSansPER;
        const netDispoAvecPER = netImposableAvecPER - impotAvecPER;
        const patrimoineGlobal = netDispoAvecPER + perVersement;
        
        // Mise à jour des résultats
        Object.assign(state.resultats, {
            netImposableSansPER,
            netImposableAvecPER,
            perVersement,
            impotSansPER,
            impotAvecPER,
            gainFiscal,
            netDispoSansPER,
            netDispoAvecPER,
            patrimoineGlobal
        });
        
        return state.resultats;
    }

    /**
     * Calcule le budget et les dépenses
     * @param {Object} params - Paramètres du budget
     * @returns {Object} Résultats détaillés du budget
     */
    function calculerBudget(params = {}) {
        // Mise à jour du budget avec les paramètres reçus
        if (params.loyer) state.budget.loyer = params.loyer;
        if (params.quotidien) state.budget.quotidien = params.quotidien;
        if (params.extra) state.budget.extra = params.extra;
        if (params.investAuto) state.budget.investAuto = params.investAuto;
        
        // Calcul des dépenses mensuelles totales
        const depensesTotales = Object.values(state.budget).reduce((a, b) => a + b, 0);
        
        // Calcul du disponible mensuel à épargner (basé sur le net avec PER)
        const revenumensuel = state.resultats.netDispoAvecPER / 12;
        const epargneTotale = revenumensuel - depensesTotales;
        
        // Taux d'épargne (pourcentage du revenu mensuel)
        const tauxEpargne = (epargneTotale / revenumensuel) * 100;
        
        // Mise à jour des résultats
        Object.assign(state.resultats, {
            depensesTotales,
            epargneTotale,
            tauxEpargne,
            montantDispo: epargneTotale > 0 ? epargneTotale : 0
        });
        
        return {
            depensesTotales,
            epargneTotale,
            tauxEpargne
        };
    }

    /**
     * Calcule l'allocation d'actifs optimale
     * @param {Object} params - Paramètres d'allocation
     * @returns {Object} Allocation détaillée
     */
    function calculerAllocation(params = {}) {
        // Mise à jour de l'allocation avec les paramètres reçus
        if (params.etf) state.allocation.etf = params.etf;
        if (params.assuranceVie) state.allocation.assuranceVie = params.assuranceVie;
        if (params.scpi) state.allocation.scpi = params.scpi;
        if (params.crypto) state.allocation.crypto = params.crypto;
        if (params.autres) state.allocation.autres = params.autres;
        
        // Normalisation des pourcentages (s'assurer que la somme = 100%)
        const total = Object.values(state.allocation).reduce((a, b) => a + b, 0);
        if (total !== 1) {
            Object.keys(state.allocation).forEach(key => {
                state.allocation[key] = state.allocation[key] / total;
            });
        }
        
        // Calcul des montants selon l'allocation
        const allocations = {};
        Object.keys(state.allocation).forEach(key => {
            allocations[key] = state.resultats.montantDispo * state.allocation[key];
        });
        
        // Mise à jour des résultats
        state.resultats.allocations = allocations;
        
        return allocations;
    }

    /**
     * Exécute la simulation patrimoniale complète
     * @param {Object} params - Tous les paramètres de simulation
     * @returns {Object} Résultats complets de la simulation
     */
    function simulerPatrimoine(params = {}) {
        // Exécution séquentielle des trois modules
        calculerSimulationFiscale(params);
        calculerBudget(params.budget);
        calculerAllocation(params.allocation);
        
        // Persistance des résultats (optionnel)
        if (params.sauvegarder) {
            sauvegarderResultats();
        }
        
        return state.resultats;
    }

    /**
     * Sauvegarde les résultats dans le localStorage
     */
    function sauvegarderResultats() {
        try {
            localStorage.setItem('tradepulse_simulation', JSON.stringify({
                parametres: {
                    revenuBrut: state.revenuBrut,
                    tauxCharges: state.tauxCharges,
                    perPourcentage: state.perPourcentage,
                    budget: state.budget,
                    allocation: state.allocation
                },
                resultats: state.resultats,
                timestamp: Date.now()
            }));
            console.log('✅ Résultats sauvegardés');
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde:', error);
            return false;
        }
    }

    /**
     * Charge les résultats précédents depuis le localStorage
     * @returns {Object|null} Données chargées ou null si aucune
     */
    function chargerResultats() {
        try {
            const savedData = localStorage.getItem('tradepulse_simulation');
            if (!savedData) return null;
            
            const parsed = JSON.parse(savedData);
            
            // Mise à jour de l'état avec les données sauvegardées
            state.revenuBrut = parsed.parametres.revenuBrut;
            state.tauxCharges = parsed.parametres.tauxCharges;
            state.perPourcentage = parsed.parametres.perPourcentage;
            state.budget = parsed.parametres.budget;
            state.allocation = parsed.parametres.allocation;
            state.resultats = parsed.resultats;
            
            return parsed;
        } catch (error) {
            console.error('❌ Erreur lors du chargement des résultats:', error);
            return null;
        }
    }

    /**
     * Exporter le "graphe d'allocation" pour affichage
     * @returns {Object} Données pour le graphique
     */
    function exporterDataGraphique() {
        return {
            fiscal: {
                labels: ['Sans PER', 'Avec PER'],
                datasets: [
                    {
                        label: 'Impôt payé',
                        data: [state.resultats.impotSansPER, state.resultats.impotAvecPER],
                        backgroundColor: 'rgba(255, 99, 132, 0.7)'
                    },
                    {
                        label: 'Net disponible',
                        data: [state.resultats.netDispoSansPER, state.resultats.netDispoAvecPER],
                        backgroundColor: 'rgba(75, 192, 192, 0.7)'
                    },
                    {
                        label: 'PER',
                        data: [0, state.resultats.perVersement],
                        backgroundColor: 'rgba(153, 102, 255, 0.7)'
                    }
                ]
            },
            budget: {
                labels: ['Loyer', 'Quotidien', 'Extra', 'Invest. Auto', 'Épargne'],
                data: [
                    state.budget.loyer,
                    state.budget.quotidien,
                    state.budget.extra,
                    state.budget.investAuto,
                    state.resultats.epargneTotale
                ],
                colors: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(255, 205, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(54, 162, 235, 0.7)'
                ]
            },
            allocation: {
                labels: Object.keys(state.allocation).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
                data: Object.values(state.resultats.allocations),
                colors: [
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(255, 205, 86, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(201, 203, 207, 0.7)'
                ]
            }
        };
    }

    // API publique du module
    return {
        calculerSimulationFiscale,
        calculerBudget,
        calculerAllocation,
        simulerPatrimoine,
        sauvegarderResultats,
        chargerResultats,
        resetState,
        exporterDataGraphique,
        // Exporter l'état actuel (pour inspection et debugging)
        getState: () => ({...state})
    };
})();

// Fonction de calcul initiale (pour compatibilité avec l'exemple donné)
function calculerFiscalite() {
    // Récupérer les valeurs du formulaire
    const brut = parseFloat(document.getElementById("brut-annuel").value);
    const charges = parseFloat(document.getElementById("taux-charges").value) / 100;
    const perPct = parseFloat(document.getElementById("per-pourcentage").value) / 100;

    // Déléguer le calcul au module
    const resultats = PatrimoineSimulator.calculerSimulationFiscale({
        revenuBrut: brut,
        tauxCharges: charges,
        perPourcentage: perPct
    });

    // Affichage des résultats
    document.getElementById("impot-sans-per").textContent = `${resultats.impotSansPER.toLocaleString('fr-FR')} €`;
    document.getElementById("impot-avec-per").textContent = `${resultats.impotAvecPER.toLocaleString('fr-FR')} €`;
    document.getElementById("gain-fiscal").textContent = `${resultats.gainFiscal.toLocaleString('fr-FR')} €`;
    document.getElementById("net-sans-per").textContent = `${resultats.netDispoSansPER.toLocaleString('fr-FR')} €`;
    document.getElementById("net-avec-per").textContent = `${resultats.netDispoAvecPER.toLocaleString('fr-FR')} €`;
    document.getElementById("patrimoine-total").textContent = `${resultats.patrimoineGlobal.toLocaleString('fr-FR')} €`;

    // Si des visualisations graphiques sont présentes
    if (window.taxPieChart) {
        updateTaxComparisonChart(resultats);
    }
}

/**
 * Met à jour le graphique de comparaison fiscale si existant
 */
function updateTaxComparisonChart(resultats) {
    const ctx = document.getElementById('tax-comparison-chart');
    if (!ctx) return;
    
    const data = PatrimoineSimulator.exporterDataGraphique().fiscal;
    
    if (!window.taxComparisonChart) {
        window.taxComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: data.datasets
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Comparaison avec et sans PER'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += new Intl.NumberFormat('fr-FR', { 
                                    style: 'currency', 
                                    currency: 'EUR' 
                                }).format(context.raw);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('fr-FR', { 
                                    style: 'currency', 
                                    currency: 'EUR',
                                    maximumFractionDigits: 0
                                }).format(value);
                            }
                        }
                    }
                }
            }
        });
    } else {
        // Mise à jour des données seulement
        window.taxComparisonChart.data.datasets = data.datasets;
        window.taxComparisonChart.update();
    }
}

// Exporter le module pour utilisation externe
window.PatrimoineSimulator = PatrimoineSimulator;
