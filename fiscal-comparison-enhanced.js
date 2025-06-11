/**
 * fiscal-comparison-enhanced.js
 * Module de comparaison des régimes fiscaux qui s'appuie sur SimulateurImmo
 * Version optimisée pour une intégration rapide
 */

class FiscalComparator {
    constructor(simulateur) {
        this.simulateur = simulateur || new SimulateurImmo();
        
        // Charger les régimes fiscaux par défaut
        this.regimes = this.getDefaultRegimes();
        
        // Cache pour optimiser les calculs
        this.cache = new Map();
    }

    /**
     * Définition des régimes fiscaux disponibles
     */
    getDefaultRegimes() {
        return [
            {
                id: 'micro-foncier',
                nom: 'Micro-foncier',
                icone: 'fa-percentage',
                couleur: '#3b82f6',
                description: 'Abattement forfaitaire de 30% sur les loyers',
                conditions: {
                    loyerAnnuelMax: 15000,
                    locationNue: true
                },
                calcul: {
                    abattement: 0.30,
                    type: 'micro'
                }
            },
            {
                id: 'reel-foncier',
                nom: 'Location nue au réel',
                icone: 'fa-calculator',
                couleur: '#8b5cf6',
                description: 'Déduction des charges réelles et déficit foncier',
                conditions: {
                    locationNue: true
                },
                calcul: {
                    deficitMax: 10700,
                    type: 'reel'
                }
            },
            {
                id: 'lmnp-micro',
                nom: 'LMNP Micro-BIC',
                icone: 'fa-bed',
                couleur: '#22c55e',
                description: 'Abattement forfaitaire de 50% sur les loyers',
                conditions: {
                    loyerAnnuelMax: 72600,
                    locationMeublee: true
                },
                calcul: {
                    abattement: 0.50,
                    type: 'micro'
                }
            },
            {
                id: 'lmnp-reel',
                nom: 'LMNP au réel',
                icone: 'fa-chart-line',
                couleur: '#f59e0b',
                description: 'Amortissement du bien et déduction des charges',
                conditions: {
                    locationMeublee: true
                },
                calcul: {
                    amortissementBien: 0.02, // 2% par an (50 ans)
                    amortissementMobilier: 0.10, // 10% par an
                    amortissementTravaux: 0.10, // 10% par an
                    type: 'reel-amortissement'
                }
            },
            {
                id: 'lmp',
                nom: 'LMP (Loueur Meublé Professionnel)',
                icone: 'fa-briefcase',
                couleur: '#ef4444',
                description: 'Régime professionnel avec avantages fiscaux étendus',
                conditions: {
                    loyerAnnuelMin: 23000,
                    locationMeublee: true,
                    activitePrincipale: true
                },
                calcul: {
                    type: 'professionnel'
                }
            },
            {
                id: 'sci-is',
                nom: 'SCI à l\'IS',
                icone: 'fa-building',
                couleur: '#14b8a6',
                description: 'Société civile immobilière soumise à l\'impôt sur les sociétés',
                conditions: {
                    structureSociete: true
                },
                calcul: {
                    tauxIS: 0.15, // 15% jusqu'à 38K€
                    tauxISPlein: 0.25, // 25% au-delà
                    seuilIS: 38120,
                    type: 'societe'
                }
            }
        ];
    }

    /**
     * Compare tous les régimes fiscaux pour un investissement donné
     */
    async compareAllRegimes(data) {
        // Générer une clé de cache
        const cacheKey = JSON.stringify(data);
        
        // Vérifier le cache
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // Préparer les paramètres pour le simulateur
        const params = this.prepareSimulatorParams(data);
        
        // Charger dans le simulateur
        this.simulateur.chargerParametres(params);
        
        // Calculer les données de base
        const baseResults = this.simulateur.calculeTout(data.surface, data.typeAchat);
        
        // Calculer pour chaque régime
        const results = [];
        
        for (const regime of this.regimes) {
            // Vérifier si le régime est applicable
            if (this.isRegimeApplicable(regime, data, baseResults)) {
                const result = this.calculateRegime(regime, baseResults, data);
                results.push(result);
            }
        }
        
        // Mettre en cache
        this.cache.set(cacheKey, results);
        
        return results;
    }

    /**
     * Prépare les paramètres pour le simulateur
     */
    prepareSimulatorParams(data) {
        return {
            apport: data.apport,
            taux: data.taux,
            duree: data.duree,
            surface: data.surface,
            prixM2: data.prixBien / data.surface,
            loyerM2: data.loyerMensuel / data.surface,
            // Utiliser les paramètres par défaut du simulateur pour le reste
            ...this.simulateur.params.communs
        };
    }

    /**
     * Vérifie si un régime est applicable
     */
    isRegimeApplicable(regime, data, baseResults) {
        const conditions = regime.conditions;
        const loyerAnnuel = baseResults.loyerBrut * 12;
        
        // Vérifier les conditions
        if (conditions.loyerAnnuelMax && loyerAnnuel > conditions.loyerAnnuelMax) {
            return false;
        }
        
        if (conditions.loyerAnnuelMin && loyerAnnuel < conditions.loyerAnnuelMin) {
            return false;
        }
        
        // Pour cette version simplifiée, on considère tous les régimes applicables
        // Dans une version complète, il faudrait vérifier plus de conditions
        return true;
    }

    /**
     * Calcule les résultats pour un régime donné
     */
    calculateRegime(regime, baseResults, data) {
        const loyerAnnuel = baseResults.loyerBrut * 12;
        const calcul = regime.calcul;
        let result = {
            id: regime.id,
            nom: regime.nom,
            icone: regime.icone,
            couleur: regime.couleur,
            description: regime.description
        };
        
        switch (calcul.type) {
            case 'micro':
                result = this.calculateMicroRegime(result, baseResults, data, calcul.abattement);
                break;
                
            case 'reel':
                result = this.calculateReelRegime(result, baseResults, data, calcul.deficitMax);
                break;
                
            case 'reel-amortissement':
                result = this.calculateLMNPReel(result, baseResults, data, calcul);
                break;
                
            case 'professionnel':
                result = this.calculateLMP(result, baseResults, data);
                break;
                
            case 'societe':
                result = this.calculateSCIIS(result, baseResults, data, calcul);
                break;
                
            default:
                // Régime par défaut
                result = this.calculateReelRegime(result, baseResults, data);
        }
        
        // Ajouter les métriques communes
        result.loyerAnnuel = loyerAnnuel;
        result.cashflowAnnuel = baseResults.cashFlow * 12;
        result.rendementBrut = (loyerAnnuel / baseResults.coutTotal) * 100;
        
        return result;
    }

    /**
     * Calcul pour les régimes micro (micro-foncier, micro-BIC)
     */
    calculateMicroRegime(result, baseResults, data, abattement) {
        const loyerAnnuel = baseResults.loyerBrut * 12;
        const revenuImposable = loyerAnnuel * (1 - abattement);
        const impot = revenuImposable * (data.tmi + 17.2) / 100;
        
        result.abattementForfaitaire = loyerAnnuel * abattement;
        result.revenuImposable = revenuImposable;
        result.impotAnnuel = -impot;
        result.cashflowNetAnnuel = (baseResults.cashFlow * 12) - impot;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        result.rendementNet = (result.cashflowNetAnnuel / baseResults.apport) * 100;
        
        result.avantages = [
            `Abattement forfaitaire de ${abattement * 100}%`,
            "Simplicité administrative",
            "Pas de comptabilité détaillée"
        ];
        
        return result;
    }

    /**
     * Calcul pour le régime réel (location nue)
     */
    calculateReelRegime(result, baseResults, data, deficitMax = 10700) {
        const loyerAnnuel = baseResults.loyerBrut * 12;
        
        // Charges déductibles
        const interets = baseResults.interetsAnnee1 || baseResults.tableauAmortissement.slice(0, 12).reduce((sum, m) => sum + m.interets, 0);
        const taxeFonciere = baseResults.taxeFonciere;
        const chargesCopro = baseResults.chargesNonRecuperables;
        const assurance = baseResults.assurancePNO;
        const entretien = baseResults.entretienAnnuel;
        const fraisGestion = loyerAnnuel * 0.05; // 5% pour la gestion
        
        const totalCharges = interets + taxeFonciere + chargesCopro + assurance + entretien + fraisGestion;
        
        // Revenu foncier imposable
        let revenuImposable = loyerAnnuel - totalCharges;
        let deficitReportable = 0;
        let economieDeficit = 0;
        
        // Gestion du déficit foncier
        if (revenuImposable < 0) {
            const deficitHorsInterets = Math.min(Math.abs(revenuImposable - interets), deficitMax);
            economieDeficit = deficitHorsInterets * data.tmi / 100;
            deficitReportable = Math.abs(revenuImposable) - deficitHorsInterets;
            revenuImposable = 0;
        }
        
        // Calcul de l'impôt
        const impot = revenuImposable * (data.tmi + 17.2) / 100;
        
        result.chargesDeductibles = totalCharges;
        result.revenuImposable = revenuImposable;
        result.deficitFoncier = deficitReportable;
        result.impotAnnuel = -impot;
        result.cashflowNetAnnuel = (baseResults.cashFlow * 12) - impot + economieDeficit;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        result.rendementNet = (result.cashflowNetAnnuel / baseResults.apport) * 100;
        
        result.avantages = [
            "Charges réelles déductibles",
            deficitReportable > 0 ? `Déficit foncier de ${Math.round(deficitReportable)}€` : null,
            "Intérêts d'emprunt déductibles"
        ].filter(Boolean);
        
        return result;
    }

    /**
     * Calcul pour LMNP au réel
     */
    calculateLMNPReel(result, baseResults, data, calcul) {
        const loyerAnnuel = baseResults.loyerBrut * 12;
        
        // Charges déductibles
        const chargesExploitation = baseResults.interetsAnnee1 + baseResults.taxeFonciere + 
                                   baseResults.chargesNonRecuperables + baseResults.assurancePNO + 
                                   baseResults.entretienAnnuel + (loyerAnnuel * 0.05);
        
        // Amortissements
        const amortissementBien = baseResults.prixAchat * calcul.amortissementBien;
        const amortissementMobilier = (baseResults.prixAchat * 0.10) * calcul.amortissementMobilier;
        const amortissementTravaux = baseResults.travaux * calcul.amortissementTravaux;
        const totalAmortissements = amortissementBien + amortissementMobilier + amortissementTravaux;
        
        // Résultat fiscal
        const resultatFiscal = Math.max(0, loyerAnnuel - chargesExploitation - totalAmortissements);
        
        // Impôt
        const impot = resultatFiscal * (data.tmi + 17.2) / 100;
        
        result.chargesDeductibles = chargesExploitation;
        result.amortissements = totalAmortissements;
        result.resultatFiscal = resultatFiscal;
        result.impotAnnuel = -impot;
        result.cashflowNetAnnuel = (baseResults.cashFlow * 12) - impot;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        result.rendementNet = (result.cashflowNetAnnuel / baseResults.apport) * 100;
        
        result.avantages = [
            "Amortissement du bien et du mobilier",
            "Report des déficits sur 10 ans",
            resultatFiscal === 0 ? "Aucun impôt grâce aux amortissements" : null,
            "Plus-value exonérée après 30 ans"
        ].filter(Boolean);
        
        return result;
    }

    /**
     * Calcul pour LMP
     */
    calculateLMP(result, baseResults, data) {
        // Similaire au LMNP réel avec avantages supplémentaires
        result = this.calculateLMNPReel(result, baseResults, data, {
            amortissementBien: 0.02,
            amortissementMobilier: 0.10,
            amortissementTravaux: 0.10
        });
        
        result.avantages = [
            ...result.avantages,
            "Exonération ISF/IFI sur le bien",
            "Exonération de plus-value professionnelle",
            "Déduction du déficit sur le revenu global"
        ];
        
        return result;
    }

    /**
     * Calcul pour SCI IS
     */
    calculateSCIIS(result, baseResults, data, calcul) {
        const loyerAnnuel = baseResults.loyerBrut * 12;
        
        // Charges déductibles (plus étendues qu'en nom propre)
        const chargesExploitation = baseResults.interetsAnnee1 + baseResults.taxeFonciere + 
                                   baseResults.chargesNonRecuperables + baseResults.assurancePNO + 
                                   baseResults.entretienAnnuel + (loyerAnnuel * 0.05);
        
        // Amortissements (y compris du bâti)
        const amortissementBatiment = baseResults.prixAchat * 0.8 * 0.02; // 80% du prix sur 50 ans
        const amortissementTravaux = baseResults.travaux * 0.10;
        const totalAmortissements = amortissementBatiment + amortissementTravaux;
        
        // Résultat imposable
        const resultatImposable = Math.max(0, loyerAnnuel - chargesExploitation - totalAmortissements);
        
        // Calcul de l'IS
        let impotIS = 0;
        if (resultatImposable <= calcul.seuilIS) {
            impotIS = resultatImposable * calcul.tauxIS;
        } else {
            impotIS = calcul.seuilIS * calcul.tauxIS + (resultatImposable - calcul.seuilIS) * calcul.tauxISPlein;
        }
        
        result.chargesDeductibles = chargesExploitation;
        result.amortissements = totalAmortissements;
        result.resultatImposable = resultatImposable;
        result.impotAnnuel = -impotIS;
        result.cashflowNetAnnuel = (baseResults.cashFlow * 12) - impotIS;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        result.rendementNet = (result.cashflowNetAnnuel / baseResults.apport) * 100;
        
        result.avantages = [
            "Taux d'IS réduit jusqu'à 38 120€",
            "Amortissement du bâtiment",
            "Report illimité des déficits",
            "Cession de parts facilitée"
        ];
        
        return result;
    }

    /**
     * Génère un rapport de comparaison
     */
    generateReport(results, data) {
        // Trier par cash-flow net
        const sorted = [...results].sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);
        
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        
        return {
            meilleurRegime: best,
            economieMax: best.cashflowNetAnnuel - worst.cashflowNetAnnuel,
            resultatsDetailles: sorted,
            recommandations: this.generateRecommendations(sorted, data)
        };
    }

    /**
     * Génère des recommandations personnalisées
     */
    generateRecommendations(results, data) {
        const recommandations = [];
        const best = results[0];
        
        // Recommandations basées sur le meilleur régime
        if (best.id.includes('lmnp')) {
            recommandations.push("Assurez-vous de bien meubler le logement selon la liste officielle");
            recommandations.push("Conservez toutes les factures pour justifier les amortissements");
        }
        
        if (best.id.includes('micro')) {
            recommandations.push("Régime simple mais vérifiez le plafond de loyers chaque année");
        }
        
        if (best.id === 'sci-is') {
            recommandations.push("Consultez un expert-comptable pour la création de la SCI");
            recommandations.push("Prévoyez les frais de gestion comptable annuels");
        }
        
        // Recommandations basées sur la TMI
        if (data.tmi >= 30) {
            recommandations.push("Votre TMI élevée favorise les régimes avec fortes déductions");
        }
        
        return recommandations;
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = FiscalComparator;
} else {
    window.FiscalComparator = FiscalComparator;
}
