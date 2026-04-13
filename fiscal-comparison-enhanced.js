/**
 * fiscal-comparison-enhanced.js
 * Module de comparaison des régimes fiscaux
 *
 * REFACTORING Option A (avril 2026) :
 * Les méthodes calculateXxx ont été supprimées car leurs résultats
 * étaient systématiquement écrasés par getDetailedCalculations()
 * dans MarketFiscalAnalyzer.performCompleteAnalysis().
 *
 * Ce fichier ne contient plus que :
 * - Les métadonnées des 7 régimes (id, nom, conditions, calcul)
 * - La logique d'éligibilité (isRegimeApplicable)
 * - Le cache et les constantes fiscales 2026
 *
 * Source unique de calcul : market-fiscal-analysis.js → getDetailedCalculations()
 */

class FiscalComparator {
    constructor(simulateur) {
        this.simulateur = simulateur || new SimulateurImmo();
        this.regimes = this.getDefaultRegimes();
        this.cache = new Map();

        // Constantes fiscales 2026
        this.SEUIL_IS = 100000;
        this.TAUX_PS = 17.2;
        this.TAUX_PS_MEUBLE = 18.6;
    }

    getTauxImposition(regimeId, tmi) {
        if (regimeId === 'lmnp-micro' || regimeId === 'lmnp-reel' || regimeId === 'lmp') {
            return tmi + this.TAUX_PS_MEUBLE;
        }
        if (regimeId === 'sci-is') return 0;
        return tmi + this.TAUX_PS;
    }

    getDefaultRegimes() {
        return [
            {
                id: 'micro-foncier', nom: 'Micro-foncier',
                icone: 'fa-percentage', couleur: '#3b82f6',
                description: 'Abattement forfaitaire de 30% sur les loyers',
                conditions: { loyerAnnuelMax: 15000, locationNue: true },
                calcul: { abattement: 0.30, type: 'micro' }
            },
            {
                id: 'reel-foncier', nom: 'Location nue au réel',
                icone: 'fa-calculator', couleur: '#8b5cf6',
                description: 'Déduction des charges réelles et déficit foncier',
                conditions: { locationNue: true },
                calcul: { deficitMax: 10700, type: 'reel' }
            },
            {
                id: 'jeanbrun', nom: 'Dispositif Jeanbrun',
                icone: 'fa-landmark', couleur: '#6366f1',
                description: 'Amortissement en location nue + déficit foncier (LF 2026)',
                conditions: { locationNue: true, collectifUniquement: true, engagementMinAnnees: 9, acquisitionAvant: '2028-12-31' },
                calcul: {
                    type: 'reel-amortissement-nu',
                    tauxAmortissement: {
                        intermediaire: { neuf: 0.035, ancien: 0.030 },
                        social: { neuf: 0.045, ancien: 0.035 },
                        tresSocial: { neuf: 0.055, ancien: 0.040 }
                    },
                    plafondAmortissement: { intermediaire: 8000, social: 10000, tresSocial: 12000 },
                    decoteLoyer: { intermediaire: 0.15, social: 0.30, tresSocial: 0.45 },
                    partTerrain: 0.20,
                    deficitMax: 10700
                }
            },
            {
                id: 'lmnp-micro', nom: 'LMNP Micro-BIC',
                icone: 'fa-bed', couleur: '#22c55e',
                description: 'Abattement forfaitaire de 50% sur les loyers',
                conditions: { loyerAnnuelMax: 77700, locationMeublee: true },
                calcul: { abattement: 0.50, type: 'micro' }
            },
            {
                id: 'lmnp-reel', nom: 'LMNP au réel',
                icone: 'fa-chart-line', couleur: '#f59e0b',
                description: 'Amortissement du bien et déduction des charges',
                conditions: { locationMeublee: true },
                calcul: { amortissementBien: 0.025, amortissementMobilier: 0.10, amortissementTravaux: 0.10, type: 'reel-amortissement' }
            },
            {
                id: 'lmp', nom: 'LMP (Loueur Meublé Professionnel)',
                icone: 'fa-briefcase', couleur: '#ef4444',
                description: 'Régime professionnel avec avantages fiscaux étendus',
                conditions: { loyerAnnuelMin: 23000, locationMeublee: true, activitePrincipale: true },
                calcul: { type: 'professionnel' }
            },
            {
                id: 'sci-is', nom: 'SCI à l\'IS',
                icone: 'fa-building', couleur: '#14b8a6',
                description: 'Société civile immobilière soumise à l\'impôt sur les sociétés',
                conditions: { structureSociete: true },
                calcul: { tauxIS: 0.15, tauxISPlein: 0.25, seuilIS: 100000, type: 'societe' }
            }
        ];
    }

    async compareAllRegimes(data) {
        const cacheKey = JSON.stringify(data);
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const params = this.prepareSimulatorParams(data);
        this.simulateur.chargerParametres(params);
        const baseResults = this.simulateur.calculeTout(data.surface, data.typeAchat);

        const results = [];
        for (const regime of this.regimes) {
            if (this.isRegimeApplicable(regime, data, baseResults)) {
                results.push(this.calculateRegime(regime, baseResults, data));
            }
        }

        results.sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);
        this.cache.set(cacheKey, results);
        return results;
    }

    prepareSimulatorParams(data) {
        return {
            apport: data.apport, taux: data.taux, duree: data.duree,
            surface: data.surface, prixM2: data.prixBien / data.surface,
            loyerM2: data.loyerMensuel / data.surface,
            ...this.simulateur.params.communs
        };
    }

    isRegimeApplicable(regime, data, baseResults) {
        const conditions = regime.conditions;
        const loyerAnnuel = baseResults.loyerBrut * 12;
        if (conditions.loyerAnnuelMax && loyerAnnuel > conditions.loyerAnnuelMax) return false;
        if (conditions.loyerAnnuelMin && loyerAnnuel < conditions.loyerAnnuelMin) return false;
        return true;
    }

    /**
     * Stub : retourne les métadonnées + valeurs par défaut.
     * performCompleteAnalysis() écrasera cashflowNetAnnuel, impotAnnuel, rendementNet
     * via getDetailedCalculations() dans market-fiscal-analysis.js.
     */
    calculateRegime(regime, baseResults, data) {
        const loyerAnnuel = baseResults.loyerBrut * 12;
        if (!baseResults.chargeMensuelleCredit) {
            baseResults.chargeMensuelleCredit = baseResults.mensualiteTotale || baseResults.mensualite || 0;
        }
        return {
            id: regime.id, nom: regime.nom, icone: regime.icone,
            couleur: regime.couleur, description: regime.description,
            loyerAnnuel, rendementBrut: baseResults.coutTotal > 0 ? (loyerAnnuel / baseResults.coutTotal) * 100 : 0,
            cashflowNetAnnuel: 0, cashflowMensuel: 0, impotAnnuel: 0,
            rendementNet: 0, baseImposable: 0, details: {}, avantages: []
        };
    }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = FiscalComparator;
} else {
    window.FiscalComparator = FiscalComparator;
}
