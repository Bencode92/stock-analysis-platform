/**
 * fiscal-comparison-enhanced.js
 * Module de comparaison des régimes fiscaux qui s'appuie sur SimulateurImmo
 * Version corrigée avec calculs fiscaux exacts
 * 
 * CORRECTIONS APPORTÉES :
 * - Cash-flow spécifique à chaque régime
 * - Prélèvements sociaux uniquement pour location nue
 * - Pas de PS pour LMNP/LMP
 * - Seuil IS mis à jour pour 2024 (42 500€)
 * - Calculs de cash-flow réels basés sur les charges effectivement payées
 */

class FiscalComparator {
    constructor(simulateur) {
        this.simulateur = simulateur || new SimulateurImmo();
        
        // Charger les régimes fiscaux par défaut
        this.regimes = this.getDefaultRegimes();
        
        // Cache pour optimiser les calculs
        this.cache = new Map();
        
        // Constantes fiscales 2026
        this.SEUIL_IS = 100000;          // Relevé de 42 500€ à 100 000€ (LF 2026)
        this.SEUIL_IS_2024 = 42500;      // Compat legacy
        this.TAUX_PS = 17.2;             // Location nue : inchangé
        this.TAUX_PS_MEUBLE = 18.6;      // LMNP/LMP : CSG +1,4pt (LFSS 2026)
    }

    /**
     * Fonction centralisée pour déterminer le taux d'imposition selon le régime
     * @param {string} regimeId - Identifiant du régime fiscal
     * @param {number} tmi - Taux marginal d'imposition
     * @returns {number} - Taux d'imposition total à appliquer
     */
    getTauxImposition(regimeId, tmi) {
        // LMNP, LMP non assujetti SSI : IR + PS 18,6% (LFSS 2026, hausse CSG +1,4pt)
        if (regimeId === 'lmnp-micro' || regimeId === 'lmnp-reel' || regimeId === 'lmp') {
            return tmi + this.TAUX_PS_MEUBLE;
        }

        // SCI IS : traitement spécial (IS, pas IR+PS)
        if (regimeId === 'sci-is') {
            return 0; // L'IS est calculé différemment dans la méthode dédiée
        }

        // Location nue (micro-foncier, réel, jeanbrun) : IR + PS 17,2%
        return tmi + this.TAUX_PS;
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
                id: 'jeanbrun',
                nom: 'Dispositif Jeanbrun',
                icone: 'fa-landmark',
                couleur: '#6366f1',
                description: 'Amortissement en location nue + déficit foncier (LF 2026)',
                conditions: {
                    locationNue: true,
                    collectifUniquement: true,
                    engagementMinAnnees: 9,
                    acquisitionAvant: '2028-12-31'
                },
                calcul: {
                    type: 'reel-amortissement-nu',
                    // Taux d'amortissement par catégorie : [neuf, ancien+travaux]
                    tauxAmortissement: {
                        intermediaire: { neuf: 0.035, ancien: 0.030 },
                        social:        { neuf: 0.045, ancien: 0.035 },
                        tresSocial:    { neuf: 0.055, ancien: 0.040 }
                    },
                    plafondAmortissement: {
                        intermediaire: 8000,
                        social: 10000,
                        tresSocial: 12000
                    },
                    decoteLoyer: {
                        intermediaire: 0.15,
                        social: 0.30,
                        tresSocial: 0.45
                    },
                    partTerrain: 0.20,    // 20% non amortissable
                    deficitMax: 10700     // Plafond déficit foncier
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
                    amortissementBien: 0.025, // 2.5% par an (40 ans)
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
                    tauxIS: 0.15, // 15% jusqu'à 100K€
                    tauxISPlein: 0.25, // 25% au-delà
                    seuilIS: 100000, // Relevé à 100 000€ (LF 2026)
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
        
        // Trier par cash-flow net décroissant
        results.sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);
        
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
        
        // Normaliser chargeMensuelleCredit (compatibilité entre SimulateurImmo et MarketFiscalAnalyzer)
        if (!baseResults.chargeMensuelleCredit) {
            baseResults.chargeMensuelleCredit = baseResults.mensualiteTotale || baseResults.mensualite || 0;
        }

        // Préparer les données communes pour tous les calculs
        const commonData = {
            loyerMensuel: baseResults.loyerBrut,
            vacanceLocative: baseResults.vacanceLocative || 5,
            taxeFonciere: baseResults.taxeFonciere || 800,
            chargesCopro: baseResults.chargesNonRecuperables / 12 || 50,
            assurancePNO: baseResults.assurancePNO / 12 || 15,
            entretien: baseResults.entretienAnnuel || 500,
            gestionLocative: data.gestionLocativeTaux > 0 ? loyerAnnuel * (data.gestionLocativeTaux / 100) : 0,
            interetsAnnuels: baseResults.interetsAnnee1 || (baseResults.tableauAmortissement?.slice(0, 12).reduce((sum, m) => sum + m.interets, 0) ?? 0),
            fraisAchat: baseResults.fraisAchat || 0,
            travaux: baseResults.travaux || 0
        };
        
        switch (calcul.type) {
            case 'micro':
                if (regime.id === 'micro-foncier') {
                    result = this.calculateMicroFoncier(result, baseResults, data, commonData);
                } else if (regime.id === 'lmnp-micro') {
                    result = this.calculateLMNPMicroBIC(result, baseResults, data, commonData);
                }
                break;
                
            case 'reel':
                result = this.calculateNuReel(result, baseResults, data, commonData);
                break;
                
            case 'reel-amortissement':
                result = this.calculateLMNPReel(result, baseResults, data, commonData);
                break;

            case 'reel-amortissement-nu':
                result = this.calculateJeanbrun(result, baseResults, data, commonData);
                break;
                
            case 'professionnel':
                result = this.calculateLMP(result, baseResults, data, commonData);
                break;
                
            case 'societe':
                result = this.calculateSCIIS(result, baseResults, data, commonData);
                break;
                
            default:
                // Régime par défaut
                result = this.calculateNuReel(result, baseResults, data, commonData);
        }
        
        // Ajouter les métriques communes
        result.loyerAnnuel = loyerAnnuel;
        result.rendementBrut = (loyerAnnuel / baseResults.coutTotal) * 100;
        
        return result;
    }

    /**
     * Calcul pour Micro-foncier - CORRIGÉ avec cash-flow réel
     */
    calculateMicroFoncier(result, baseResults, data, calcul) {
        console.log('📊 Calcul Micro-foncier');
        
        const loyerAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        const abattement = 0.30; // 30% d'abattement forfaitaire
        const revenuImposable = loyerAnnuel * (1 - abattement);
        
        // Impôt sur le revenu + prélèvements sociaux
        const impotRevenu = revenuImposable * (data.tmi / 100);
        const prelevementsSociaux = revenuImposable * 0.172;
        const impotTotal = impotRevenu + prelevementsSociaux;
        
        // ✅ NOUVEAU : Calcul du cash-flow réel
        // En micro-foncier, on ne peut déduire AUCUNE charge réelle
        const chargesReelles = 
            calcul.taxeFonciere +
            calcul.chargesCopro * 12 +
            calcul.assurancePNO * 12 +
            calcul.entretien +
            (calcul.gestionLocative || 0);
        
        const interetsAnnuels = calcul.interetsAnnuels || 0;
        const capitalAnnuel = (baseResults.chargeMensuelleCredit * 12) - interetsAnnuels;
        
        // Cash-flow = Loyers - Charges réelles - Mensualité crédit - Impôts
        const cashflowBrut = loyerAnnuel - chargesReelles - (interetsAnnuels + capitalAnnuel);
        result.cashflowNetAnnuel = cashflowBrut - impotTotal;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        
        // Logging pour debug
        console.log('Micro-foncier - Détails:', {
            loyerAnnuel,
            abattementForfaitaire: loyerAnnuel * abattement,
            chargesReelles,
            revenuImposable,
            impotTotal,
            cashflowNet: result.cashflowNetAnnuel,
            'Charges réelles > Abattement ?': chargesReelles > (loyerAnnuel * abattement)
        });
        
        // Autres calculs
        result.baseImposable = revenuImposable;
        result.impotAnnuel = -impotTotal;
        result.rendementNet = data.prixBien ? (result.cashflowNetAnnuel / data.prixBien) * 100 : 0;
        
        result.details = {
            regime: 'Micro-foncier',
            abattement: '30%',
            chargesForfaitaires: (loyerAnnuel * abattement).toFixed(2),
            chargesReelles: chargesReelles.toFixed(2),
            alerteDefavorable: chargesReelles > (loyerAnnuel * abattement)
        };
        
        result.avantages = [
            'Simplicité administrative (pas de comptabilité)',
            `Abattement forfaitaire de ${(loyerAnnuel * abattement).toFixed(0)}€`,
            chargesReelles > (loyerAnnuel * abattement) ? 
                `⚠️ ATTENTION : Vos charges réelles (${chargesReelles.toFixed(0)}€) dépassent l'abattement !` : 
                `✅ L'abattement vous fait économiser ${((loyerAnnuel * abattement) - chargesReelles).toFixed(0)}€`
        ];
        
        return result;
    }

    /**
     * Calcul pour Location nue au réel - CORRIGÉ avec déficit foncier
     */
    calculateNuReel(result, baseResults, data, calcul) {
        console.log('📊 Calcul Location nue au réel');
        
        const loyerAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        
        // ✅ NOUVEAU : Charges déductibles en location nue
        const chargesDeductibles = {
            interets: calcul.interetsAnnuels || 0,
            taxeFonciere: calcul.taxeFonciere || 0,
            chargesCopro: (calcul.chargesCopro || 0) * 12,
            assurancePNO: (calcul.assurancePNO || 0) * 12,
            entretien: calcul.entretien || 0,
            travauxDeductibles: calcul.travaux || 0, // Si travaux d'entretien
            fraisGestion: calcul.gestionLocative || 0,
            total: 0
        };
        
        chargesDeductibles.total = Object.values(chargesDeductibles)
            .filter(v => typeof v === 'number')
            .reduce((a, b) => a + b, 0);
        
        // Résultat fiscal
        const resultatFiscal = loyerAnnuel - chargesDeductibles.total;
        const deficit = resultatFiscal < 0 ? Math.abs(resultatFiscal) : 0;
        const deficitImputable = Math.min(deficit, 10700); // Plafond déficit foncier
        
        // Base imposable après déficit
        const baseImposable = Math.max(0, resultatFiscal);
        
        // Impôts
        const impotRevenu = baseImposable * (data.tmi / 100);
        const prelevementsSociaux = baseImposable * 0.172;
        const impotTotal = impotRevenu + prelevementsSociaux;
        
        // Économie d'impôt si déficit
        const economieDeficit = deficitImputable * (data.tmi / 100);
        
        // ✅ NOUVEAU : Cash-flow réel
        const chargesReellementPayees = chargesDeductibles.total - chargesDeductibles.interets;
        const mensualiteCredit = baseResults.chargeMensuelleCredit * 12;
        
        const cashflowBrut = loyerAnnuel - chargesReellementPayees - mensualiteCredit;
        result.cashflowNetAnnuel = cashflowBrut - impotTotal + economieDeficit;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        
        // Logging
        console.log('Location nue réel - Détails:', {
            loyerAnnuel,
            chargesDeductibles: chargesDeductibles.total,
            resultatFiscal,
            deficit,
            economieDeficit,
            impotTotal,
            cashflowNet: result.cashflowNetAnnuel
        });
        
        // Autres calculs
        result.baseImposable = baseImposable;
        result.impotAnnuel = -(impotTotal - economieDeficit);
        result.deficit = deficit;
        result.deficitReportable = deficit - deficitImputable;
        result.rendementNet = data.prixBien ? (result.cashflowNetAnnuel / data.prixBien) * 100 : 0;
        
        result.details = {
            regime: 'Location nue au réel',
            chargesDeductibles: chargesDeductibles.total.toFixed(2),
            deficit: deficit.toFixed(2),
            economieDeficit: economieDeficit.toFixed(2)
        };
        
        result.avantages = [
            'Déduction de toutes les charges réelles',
            deficit > 0 ? `Déficit foncier : ${deficit.toFixed(0)}€` : null,
            deficitImputable > 0 ? `Économie d'impôt déficit : ${economieDeficit.toFixed(0)}€` : null,
            result.deficitReportable > 0 ? `Déficit reportable : ${result.deficitReportable.toFixed(0)}€` : null
        ].filter(Boolean);
        
        return result;
    }

    /**
     * Calcul pour Dispositif Jeanbrun (LF 2026, art. 47)
     * Hybride : location nue + amortissement + déficit foncier 10 700€
     * Loyers plafonnés selon niveau (intermédiaire/social/très social)
     */
    calculateJeanbrun(result, baseResults, data, calcul) {
        console.log('📊 Calcul Dispositif Jeanbrun');

        // --- Paramètres Jeanbrun depuis data ou défauts ---
        const niveauLoyer = data.jeanbrunNiveau || 'intermediaire';
        const typeBien = data.jeanbrunType || 'ancien';
        const regime = this.regimes.find(r => r.id === 'jeanbrun');
        const regiCalc = regime.calcul;

        // --- Décote du loyer ---
        const decote = regiCalc.decoteLoyer[niveauLoyer] || 0.15;
        const loyerMarcheAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        const loyerJeanbrunAnnuel = loyerMarcheAnnuel * (1 - decote);

        // --- Amortissement fiscal (non décaissé) ---
        const valeurBien = baseResults.prixAchat || data.prixBien || 0;
        const baseAmortissable = valeurBien * (1 - regiCalc.partTerrain); // 80% du prix
        const tauxAmort = regiCalc.tauxAmortissement[niveauLoyer]?.[typeBien] || 0.035;
        const plafondAmort = regiCalc.plafondAmortissement[niveauLoyer] || 8000;
        const amortissementBrut = baseAmortissable * tauxAmort;
        const amortissementEffectif = Math.min(amortissementBrut, plafondAmort);

        // --- Charges déductibles (réellement payées) ---
        const chargesDeductibles = {
            interets: calcul.interetsAnnuels || 0,
            taxeFonciere: calcul.taxeFonciere || 0,
            chargesCopro: (calcul.chargesCopro || 0) * 12,
            assurancePNO: (calcul.assurancePNO || 0) * 12,
            entretien: calcul.entretien || 0,
            gestionLocative: calcul.gestionLocative || 0,
            total: 0
        };
        chargesDeductibles.total = Object.values(chargesDeductibles)
            .filter(v => typeof v === 'number')
            .reduce((a, b) => a + b, 0);

        // --- Résultat fiscal = loyers plafonné - charges - amortissement ---
        const resultatFiscal = loyerJeanbrunAnnuel - chargesDeductibles.total - amortissementEffectif;
        const deficit = resultatFiscal < 0 ? Math.abs(resultatFiscal) : 0;
        const deficitImputable = Math.min(deficit, regiCalc.deficitMax);

        // --- Base imposable ---
        const baseImposable = Math.max(0, resultatFiscal);

        // --- Impôts : IR + PS (location nue) ---
        const impotRevenu = baseImposable * (data.tmi / 100);
        const prelevementsSociaux = baseImposable * 0.172;
        const impotTotal = impotRevenu + prelevementsSociaux;

        // --- Économie d'impôt si déficit ---
        const economieDeficit = deficitImputable * (data.tmi / 100);

        // --- Cash-flow réel (basé sur loyer PLAFONNÉ et charges réelles) ---
        const chargesReellementPayees = chargesDeductibles.total - chargesDeductibles.interets;
        const mensualiteCredit = baseResults.chargeMensuelleCredit * 12;
        const cashflowBrut = loyerJeanbrunAnnuel - chargesReellementPayees - mensualiteCredit;
        result.cashflowNetAnnuel = cashflowBrut - impotTotal + economieDeficit;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;

        // Logging
        console.log('Jeanbrun - Détails:', {
            niveauLoyer,
            typeBien,
            loyerMarche: loyerMarcheAnnuel,
            loyerJeanbrun: loyerJeanbrunAnnuel,
            decote: `${(decote * 100)}%`,
            amortissementBrut,
            amortissementEffectif,
            plafondAmort,
            chargesDeductibles: chargesDeductibles.total,
            resultatFiscal,
            deficit,
            economieDeficit,
            impotTotal,
            cashflowNet: result.cashflowNetAnnuel
        });

        // --- Résultats ---
        result.baseImposable = baseImposable;
        result.impotAnnuel = -(impotTotal - economieDeficit);
        result.amortissements = amortissementEffectif;
        result.deficit = deficit;
        result.deficitReportable = deficit - deficitImputable;
        result.rendementNet = data.prixBien ? (result.cashflowNetAnnuel / data.prixBien) * 100 : 0;

        result.details = {
            regime: 'Dispositif Jeanbrun',
            niveauLoyer: niveauLoyer,
            typeBien: typeBien,
            decoteLoyer: `${(decote * 100)}%`,
            loyerMarche: loyerMarcheAnnuel.toFixed(0),
            loyerJeanbrun: loyerJeanbrunAnnuel.toFixed(0),
            amortissementEffectif: amortissementEffectif.toFixed(0),
            plafondAmortissement: plafondAmort,
            chargesDeductibles: chargesDeductibles.total.toFixed(0),
            deficit: deficit.toFixed(0),
            economieDeficit: economieDeficit.toFixed(0)
        };

        const niveauLabel = { intermediaire: 'intermédiaire', social: 'social', tresSocial: 'très social' }[niveauLoyer];
        result.avantages = [
            `Amortissement ${(tauxAmort * 100).toFixed(1)}%/an → ${amortissementEffectif.toFixed(0)}€ déduits`,
            `Loyer ${niveauLabel} (−${(decote * 100)}% vs marché)`,
            deficit > 0 ? `Déficit foncier : ${deficit.toFixed(0)}€ (${deficitImputable.toFixed(0)}€ imputables)` : null,
            economieDeficit > 0 ? `Économie d'impôt déficit : ${economieDeficit.toFixed(0)}€/an` : null,
            'Pas de zonage géographique',
            '⚠️ Engagement 9 ans minimum',
            '⚠️ Réintégration amortissements à la revente'
        ].filter(Boolean);

        return result;
    }

    /**
     * Calcul pour LMNP Micro-BIC - CORRIGÉ
     */
    calculateLMNPMicroBIC(result, baseResults, data, calcul) {
        console.log('📊 Calcul LMNP Micro-BIC');
        
        const loyerAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        const abattement = 0.50; // 50% d'abattement
        const baseImposable = loyerAnnuel * (1 - abattement);
        const impot = baseImposable * ((data.tmi / 100) + 0.186); // IR + PS 18,6% (LFSS 2026)
        
        // ✅ Charges réelles pour le cash-flow (sans abattement)
        const chargesReelles = 
            calcul.taxeFonciere +
            calcul.chargesCopro * 12 +
            calcul.assurancePNO * 12 +
            calcul.entretien +
            (calcul.gestionLocative || 0);
        
        const cashflowAvantImpot = loyerAnnuel - chargesReelles;
        const remboursementTotal = baseResults.chargeMensuelleCredit * 12;
        const cashflowBrut = cashflowAvantImpot - remboursementTotal;
        
        // Cash-flow net
        result.cashflowNetAnnuel = cashflowBrut - impot;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        
        // Logging
        console.log('LMNP Micro-BIC - Détails:', {
            loyerAnnuel,
            baseImposable,
            impot,
            chargesReelles,
            cashflowNet: result.cashflowNetAnnuel
        });
        
        // Autres calculs
        result.baseImposable = baseImposable;
        result.impotAnnuel = -impot;
        result.rendementNet = data.prixBien ? (result.cashflowNetAnnuel / data.prixBien) * 100 : 0;
        
        result.details = {
            regime: 'LMNP Micro-BIC',
            abattement: `${(abattement * 100)}%`,
            chargesForfaitaires: (loyerAnnuel * abattement).toFixed(2),
            chargesReelles: chargesReelles.toFixed(2)
        };
        
        result.avantages = [
            `Abattement forfaitaire de ${(abattement * 100)}%`,
            'Simplicité : pas de comptabilité détaillée',
            'Pas de prélèvements sociaux',
            chargesReelles > (loyerAnnuel * abattement) ? 
                '⚠️ Vos charges réelles dépassent l\'abattement' : 
                `Économie vs charges réelles : ${((loyerAnnuel * abattement) - chargesReelles).toFixed(0)}€`
        ];
        
        return result;
    }

    /**
     * Calcul pour LMNP au réel - CORRIGÉ avec amortissements
     */
    calculateLMNPReel(result, baseResults, data, calcul) {
        console.log('📊 Calcul LMNP au réel - Début');
        
        const loyerAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        
        // ✅ NOUVEAU : Calculer les charges RÉELLEMENT DÉCAISSÉES
        const chargesReellementPayees = 
            calcul.taxeFonciere +
            calcul.chargesCopro * 12 +
            calcul.assurancePNO * 12 +
            calcul.entretien +
            calcul.interetsAnnuels +
            (calcul.gestionLocative || 0);
        
        // ✅ NOUVEAU : Calculer les amortissements (non décaissés)
        const valeurBien = baseResults.prixAchat || data.prixBien || 0;
        const valeurTerrain = valeurBien * 0.15;
        const valeurConstruction = valeurBien - valeurTerrain;
        const valeurMobilier = valeurBien * 0.10; // 10% du prix en mobilier
        
        const amortissementConstruction = valeurConstruction * 0.025; // 2.5% par an
        const amortissementMobilier = valeurMobilier * 0.10; // 10% par an
        const amortissementFrais = calcul.fraisAchat * 0.20; // 20% sur 5 ans
        
        const totalAmortissements = amortissementConstruction + amortissementMobilier + amortissementFrais;
        
        // ✅ NOUVEAU : Charges déductibles fiscalement (incluant amortissements)
        const chargesFiscalesDeductibles = chargesReellementPayees + totalAmortissements;
        
        // Résultat fiscal
        const resultatFiscal = Math.max(0, loyerAnnuel - chargesFiscalesDeductibles);
        
        // Calcul de l'impôt : IR + PS 18,6% (LFSS 2026, hausse CSG)
        const impot = resultatFiscal * ((data.tmi / 100) + 0.186);
        
        // ✅ CORRECTION PRINCIPALE : Cash-flow basé sur les charges RÉELLES
        const cashflowAvantImpot = loyerAnnuel - chargesReellementPayees;
        const remboursementCapital = (baseResults.chargeMensuelleCredit * 12) - calcul.interetsAnnuels;
        const cashflowBrut = cashflowAvantImpot - remboursementCapital;
        
        // Cash-flow net après impôt
        result.cashflowNetAnnuel = cashflowBrut - impot;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        
        // Logging pour debug
        console.log('LMNP Réel - Détails du calcul:', {
            loyerAnnuel,
            chargesReellementPayees,
            totalAmortissements,
            chargesFiscalesDeductibles,
            resultatFiscal,
            impot,
            cashflowBrut,
            cashflowNet: result.cashflowNetAnnuel
        });
        
        // Autres calculs
        result.amortissements = totalAmortissements;
        result.baseImposable = resultatFiscal;
        result.impotAnnuel = -impot;
        result.deficit = resultatFiscal < 0 ? Math.abs(resultatFiscal) : 0;
        result.rendementNet = data.prixBien ? (result.cashflowNetAnnuel / data.prixBien) * 100 : 0;
        
        // Détails pour affichage
        result.details = {
            regime: 'LMNP au réel',
            chargesDeductibles: chargesFiscalesDeductibles.toFixed(2),
            amortissements: totalAmortissements.toFixed(2),
            resultatFiscal: resultatFiscal.toFixed(2),
            economieImpot: (totalAmortissements * (data.tmi / 100)).toFixed(2)
        };
        
        result.avantages = [
            `Amortissement du bien : ${amortissementConstruction.toFixed(0)}€/an`,
            `Amortissement mobilier : ${amortissementMobilier.toFixed(0)}€/an`,
            totalAmortissements > loyerAnnuel ? 'Aucun impôt grâce aux amortissements' : 
                `Économie d'impôt : ${(totalAmortissements * data.tmi / 100).toFixed(0)}€/an`,
            'Pas de prélèvements sociaux',
            result.deficit > 0 ? `Déficit reportable : ${result.deficit.toFixed(0)}€` : null
        ].filter(Boolean);
        
        return result;
    }

    /**
     * Calcul pour LMP - Loueur Meublé Professionnel
     */
    calculateLMP(result, baseResults, data, calcul) {
        console.log('📊 Calcul LMP');
        
        // Base similaire au LMNP réel
        result = this.calculateLMNPReel(result, baseResults, data, calcul);
        
        // Ajustements spécifiques LMP
        result.nom = 'LMP (Loueur Meublé Professionnel)';
        
        // Le déficit est déductible du revenu global en LMP
        if (result.deficit > 0) {
            const economieDeficitGlobal = result.deficit * (data.tmi / 100);
            result.cashflowNetAnnuel += economieDeficitGlobal;
            result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        }
        
        result.avantages = [
            ...result.avantages,
            'Déficit déductible du revenu global',
            'Exonération ISF/IFI sur le bien',
            'Exonération de plus-value professionnelle',
            'Cotisations sociales déductibles'
        ];
        
        return result;
    }

    /**
     * Calcul pour SCI à l'IS - CORRIGÉ avec taux 2024
     */
    calculateSCIIS(result, baseResults, data, calcul) {
        console.log('📊 Calcul SCI à l\'IS');
        
        const loyerAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        
        // ✅ NOUVEAU : Charges déductibles spécifiques SCI IS
        const chargesDeductibles = {
            interets: calcul.interetsAnnuels || 0,
            taxeFonciere: calcul.taxeFonciere || 0,
            chargesCopro: (calcul.chargesCopro || 0) * 12,
            assurancePNO: (calcul.assurancePNO || 0) * 12,
            entretien: calcul.entretien || 0,
            fraisGestion: calcul.gestionLocative || 0,
            honorairesComptable: 1200, // Forfait comptable SCI
            fraisBancaires: 200,
            amortissementBien: (data.prixBien || 0) * 0.025, // 2.5% du bien
            amortissementFrais: (calcul.fraisAchat || 0) * 0.20, // 20% des frais
            total: 0
        };
        
        chargesDeductibles.total = Object.values(chargesDeductibles)
            .filter(v => typeof v === 'number')
            .reduce((a, b) => a + b, 0);
        
        // Résultat fiscal
        const resultatFiscal = loyerAnnuel - chargesDeductibles.total;
        const resultatImposable = Math.max(0, resultatFiscal);
        
        // Calcul IS avec taux réduit
        let impotIS = 0;
        if (resultatImposable <= 100000) {
            impotIS = resultatImposable * 0.15; // Taux réduit 15%
        } else {
            impotIS = 100000 * 0.15 + (resultatImposable - 100000) * 0.25;
        }
        
        // ✅ NOUVEAU : Cash-flow réel SCI
        // Les amortissements ne sont pas des sorties de cash
        const chargesDecaissables = chargesDeductibles.total - 
            chargesDeductibles.amortissementBien - 
            chargesDeductibles.amortissementFrais;
        
        const mensualiteCredit = baseResults.chargeMensuelleCredit * 12;
        
        const cashflowBrut = loyerAnnuel - chargesDecaissables - mensualiteCredit;
        result.cashflowNetAnnuel = cashflowBrut - impotIS;
        result.cashflowMensuel = result.cashflowNetAnnuel / 12;
        
        // Logging
        console.log('SCI IS - Détails:', {
            loyerAnnuel,
            chargesDeductibles: chargesDeductibles.total,
            dontAmortissements: chargesDeductibles.amortissementBien + chargesDeductibles.amortissementFrais,
            resultatFiscal,
            impotIS,
            tauxEffectifIS: resultatImposable > 0 ? (impotIS / resultatImposable * 100).toFixed(1) + '%' : '0%',
            cashflowNet: result.cashflowNetAnnuel
        });
        
        // Autres calculs
        result.baseImposable = resultatImposable;
        result.impotAnnuel = -impotIS;
        result.deficit = resultatFiscal < 0 ? Math.abs(resultatFiscal) : 0;
        result.rendementNet = data.prixBien ? (result.cashflowNetAnnuel / data.prixBien) * 100 : 0;
        
        // Comparaison avec TMI personnel
        const impotSiIR = resultatImposable * (data.tmi / 100) + resultatImposable * 0.172;
        const economieVsIR = impotSiIR - impotIS;
        
        result.details = {
            regime: 'SCI à l\'IS',
            tauxIS: resultatImposable <= 100000 ? '15%' : 'Mixte 15%/25%',
            amortissements: (chargesDeductibles.amortissementBien + chargesDeductibles.amortissementFrais).toFixed(2),
            economieVsIR: economieVsIR.toFixed(2)
        };
        
        result.avantages = [
            `Taux IS : ${resultatImposable <= 100000 ? '15%' : 'jusqu\'à 15%'} vs TMI ${data.tmi}%`,
            `Amortissement du bien : ${chargesDeductibles.amortissementBien.toFixed(0)}€/an`,
            economieVsIR > 0 ? `Économie vs IR : ${economieVsIR.toFixed(0)}€/an` : null,
            'Possibilité de déduire la rémunération du gérant',
            'Report illimité des déficits'
        ].filter(Boolean);
        
        return result;
    }

    /**
     * Helper pour calculer les charges réelles
     */
    calculateChargesReellesComplete(calcul) {
        return {
            // Charges financières
            interetsAnnuels: calcul.interetsAnnuels || 0,
            
            // Charges d'exploitation
            taxeFonciere: calcul.taxeFonciere || 0,
            chargesCopro: (calcul.chargesCopro || 0) * 12,
            assurancePNO: (calcul.assurancePNO || 0) * 12,
            entretien: calcul.entretien || 0,
            gestionLocative: calcul.gestionLocative || 0,
            
            // Méthodes utiles
            totalSansInterets: function() {
                return this.taxeFonciere + this.chargesCopro + 
                       this.assurancePNO + this.entretien + this.gestionLocative;
            },
            totalAvecInterets: function() {
                return this.totalSansInterets() + this.interetsAnnuels;
            }
        };
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
