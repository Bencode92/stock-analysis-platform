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
 * - Badge "Régime actuel" dynamique avec le select
 * - Protection contre tableauAmortissement undefined
 * - Fix apostrophe et référence window.analyzer
 * - NOUVEAU : Affichage détaillé du régime sélectionné avec comparaison complète
 */
/* ================== HELPERS REGIMES & LABELS ================== */
window.REGIME_LABELS = {
  nu_micro   : 'Location nue – Micro-foncier',
  nu_reel    : 'Location nue – Réel foncier',
  lmnp_micro : 'LMNP – Micro-BIC',
  lmnp_reel  : 'LMNP – Réel',
  lmp_reel   : 'LMP – Réel',
  sci_is     : "SCI à l'IS"
};

// mapping entre tes IDs internes et une clé "canonique" pour l'UI
const REGIME_KEY_FROM_ID = {
  'micro-foncier': 'nu_micro',
  'reel-foncier' : 'nu_reel',
  'lmnp-micro'   : 'lmnp_micro',
  'lmnp-reel'    : 'lmnp_reel',
  'lmp'          : 'lmp_reel',
  'sci-is'       : 'sci_is'
};
const REGIME_ID_FROM_KEY = Object.fromEntries(
  Object.entries(REGIME_KEY_FROM_ID).map(([id,key]) => [key,id])
);

function _fmtNumber(n){
  try {
    return window.analyzer?.formatNumber ? window.analyzer.formatNumber(n)
      : new Intl.NumberFormat('fr-FR', {maximumFractionDigits:0}).format(Math.round(n));
  } catch(e){ return String(n); }
}
function _numOrDash(n){ return (typeof n==='number' && isFinite(n)) ? _fmtNumber(n) : '—'; }
function _pctOrDash(n,d=2){ return (typeof n==='number' && isFinite(n)) ? n.toFixed(d)+'%' : '—'; }


class FiscalComparator {
    constructor(simulateur) {
        this.simulateur = simulateur || new SimulateurImmo();
        
        // Charger les régimes fiscaux par défaut
        this.regimes = this.getDefaultRegimes();
        
        // Cache pour optimiser les calculs
        this.cache = new Map();
        
        // Constantes fiscales 2024
        this.SEUIL_IS_2024 = 42500;
        this.TAUX_PS = 17.2;
    }

    /**
     * Fonction centralisée pour déterminer le taux d'imposition selon le régime
     * @param {string} regimeId - Identifiant du régime fiscal
     * @param {number} tmi - Taux marginal d'imposition
     * @returns {number} - Taux d'imposition total à appliquer
     */
    getTauxImposition(regimeId, tmi) {
        // LMNP, LMP : pas de prélèvements sociaux
        if (regimeId === 'lmnp-micro' || regimeId === 'lmnp-reel' || regimeId === 'lmp') {
            return tmi;
        }
        
        // SCI IS : traitement spécial (IS, pas IR+PS)
        if (regimeId === 'sci-is') {
            return 0; // L'IS est calculé différemment dans la méthode dédiée
        }
        
        // Location nue (micro-foncier, réel) : IR + PS
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
                    tauxIS: 0.15, // 15% jusqu'à 42.5K€
                    tauxISPlein: 0.25, // 25% au-delà
                    seuilIS: 42500, // Seuil 2024
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
        
        // ➜ Annoter et trier
        const currentKey = data?.regimeActuel || null;
        const currentId = currentKey ? (REGIME_ID_FROM_KEY[currentKey] || currentKey) : null;

        // Ajoute des métadonnées utiles pour l'UI
        results.forEach(r => {
            r.key = REGIME_KEY_FROM_ID[r.id] || r.id;
            r.isCurrent = currentId ? (r.id === currentId) : false;
        });

        // Tri naturel (meilleur cash-flow en premier)
        results.sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);

        // Marque le meilleur calculé
        if (results.length > 0) results[0].isOptimal = true;

        // NE PAS forcer le régime actuel en premier, juste l'annoter
        // L'affichage se chargera de montrer le détail du régime sélectionné

        // Cache & retour
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
        
        // Protection contre tableauAmortissement undefined
        const ta = Array.isArray(baseResults.tableauAmortissement) ? baseResults.tableauAmortissement : [];
        
        // Préparer les données communes pour tous les calculs avec protection des zéros
        const commonData = {
            loyerMensuel: baseResults.loyerBrut,
            vacanceLocative: (baseResults.vacanceLocative ?? 5),
            taxeFonciere: (baseResults.taxeFonciere ?? 800),
            chargesCopro: (typeof baseResults.chargesNonRecuperables === 'number' 
                ? baseResults.chargesNonRecuperables / 12 : 50),
            assurancePNO: (typeof baseResults.assurancePNO === 'number' 
                ? baseResults.assurancePNO / 12 : 15),
            entretien: (baseResults.entretienAnnuel ?? 500),
            gestionLocative: data.gestionLocativeTaux > 0 ? loyerAnnuel * (data.gestionLocativeTaux / 100) : 0,
            interetsAnnuels: (baseResults.interetsAnnee1 != null) 
                ? baseResults.interetsAnnee1 
                : ta.slice(0, 12).reduce((sum, m) => sum + (m.interets || 0), 0),
            fraisAchat: (baseResults.fraisAchat ?? 0),
            travaux: (baseResults.travaux ?? 0)
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
     * Calcul pour LMNP Micro-BIC - CORRIGÉ
     */
    calculateLMNPMicroBIC(result, baseResults, data, calcul) {
        console.log('📊 Calcul LMNP Micro-BIC');
        
        const loyerAnnuel = calcul.loyerMensuel * 12 * (1 - calcul.vacanceLocative / 100);
        const abattement = 0.50; // 50% d'abattement
        const baseImposable = loyerAnnuel * (1 - abattement);
        const impot = baseImposable * (data.tmi / 100); // Pas de PS en LMNP
        
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
        
        // Calcul de l'impôt (pas de PS en LMNP)
        const impot = resultatFiscal * (data.tmi / 100);
        
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
        if (resultatImposable <= 42500) {
            impotIS = resultatImposable * 0.15; // Taux réduit 15%
        } else {
            impotIS = 42500 * 0.15 + (resultatImposable - 42500) * 0.25;
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
            tauxIS: resultatImposable <= 42500 ? '15%' : 'Mixte 15%/25%',
            amortissements: (chargesDeductibles.amortissementBien + chargesDeductibles.amortissementFrais).toFixed(2),
            economieVsIR: economieVsIR.toFixed(2)
        };
        
        result.avantages = [
            `Taux IS : ${resultatImposable <= 42500 ? '15%' : 'jusqu\'à 15%'} vs TMI ${data.tmi}%`,
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

/* ================== RENDERER HTML AMÉLIORÉ ================== */
if (typeof window !== 'undefined') {
  window.renderFiscalResults = function(fiscalArray, analysisData, props={}) {
    if (!Array.isArray(fiscalArray) || fiscalArray.length === 0) {
        return `<div class="regime-result"><p style="color:#94a3b8">Aucun résultat fiscal disponible.</p></div>`;
    }

    // Récupérer le régime actuellement sélectionné
    const selectedKey = props.regimeActuel || 
                       document.querySelector('input[name="regime-actuel"]:checked')?.value || 
                       'nu_micro';
    
    // Trouver le régime sélectionné ET le meilleur régime
    fiscalArray = fiscalArray.map(r => {
        const key = r.key || (REGIME_KEY_FROM_ID[r.id] || r.id);
        return { ...r, key, isCurrent: (key === selectedKey) };
    });
    
    // Trier par cash-flow (meilleur en premier)
    const sorted = [...fiscalArray].sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);
    const best = sorted[0];
    const selected = fiscalArray.find(r => r.isCurrent) || best;
    
    // Calcul des écarts
    const selectedAnnual = selected.cashflowNetAnnuel || 0;
    const bestAnnual = best.cashflowNetAnnuel || 0;
    const gap = bestAnnual - selectedAnnual;
    
    // 1. DÉTAIL DU RÉGIME SÉLECTIONNÉ
    const detailHTML = `
        <div class="best-regime-summary" style="background: rgba(0, 191, 255, 0.05); border: 2px solid rgba(0, 191, 255, 0.3); border-radius: 20px; padding: 30px; margin: 30px 0;">
            <div class="summary-title" style="font-size: 1.8em; color: #00bfff; margin-bottom: 20px;">
                <i class="fas fa-balance-scale"></i> 
                Détail du régime sélectionné : ${window.REGIME_LABELS[selectedKey] || selected.nom}
                ${selected !== best ? `
                    <div style="font-size: 0.6em; color: #ffc107; margin-top: 10px;">
                        ⚠️ Un meilleur régime existe : ${window.REGIME_LABELS[best.key] || best.nom} 
                        (<span style="color: #22c55e;">+${_fmtNumber(gap)} €/an</span>)
                    </div>
                ` : `
                    <div style="font-size: 0.6em; color: #22c55e; margin-top: 10px;">
                        ✅ C'est le meilleur régime pour votre situation !
                    </div>
                `}
            </div>
            
            <!-- Métriques principales en gros -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 30px 0;">
                <div style="text-align: center;">
                    <h3 style="color: #94a3b8; font-size: 1.1em; margin-bottom: 10px;">Cash-flow mensuel</h3>
                    <div class="${selectedAnnual >= 0 ? 'positive' : 'negative'}" style="font-size: 2.5em; font-weight: 700; color: ${selectedAnnual >= 0 ? '#22c55e' : '#ef4444'};">
                        ${selectedAnnual >= 0 ? '+' : ''}${_fmtNumber(selectedAnnual / 12)} €
                    </div>
                </div>
                <div style="text-align: center;">
                    <h3 style="color: #94a3b8; font-size: 1.1em; margin-bottom: 10px;">Cash-flow annuel</h3>
                    <div class="${selectedAnnual >= 0 ? 'positive' : 'negative'}" style="font-size: 2.5em; font-weight: 700; color: ${selectedAnnual >= 0 ? '#22c55e' : '#ef4444'};">
                        ${selectedAnnual >= 0 ? '+' : ''}${_fmtNumber(selectedAnnual)} €
                    </div>
                </div>
            </div>
            
            <!-- Détails fiscaux -->
            <div style="background: rgba(255, 255, 255, 0.03); border-radius: 15px; padding: 20px; margin: 20px 0;">
                <h4 style="color: #00bfff; margin-bottom: 15px;">Détails fiscaux</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div>
                        <span style="color: #94a3b8;">Base imposable:</span>
                        <strong style="color: #e2e8f0; margin-left: 10px;">${_numOrDash(selected.baseImposable)} €</strong>
                    </div>
                    <div>
                        <span style="color: #94a3b8;">Impôts annuels:</span>
                        <strong style="color: #ef4444; margin-left: 10px;">−${_numOrDash(Math.abs(selected.impotAnnuel || 0))} €</strong>
                    </div>
                    <div>
                        <span style="color: #94a3b8;">Rendement net:</span>
                        <strong style="color: ${selected.rendementNet > 4 ? '#22c55e' : selected.rendementNet < 2 ? '#ef4444' : '#e2e8f0'}; margin-left: 10px;">
                            ${_pctOrDash(selected.rendementNet)}
                        </strong>
                    </div>
                    ${selected.deficit > 0 ? `
                    <div>
                        <span style="color: #94a3b8;">Déficit reportable:</span>
                        <strong style="color: #ffc107; margin-left: 10px;">${_fmtNumber(selected.deficit)} €</strong>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Avantages du régime -->
            ${selected.avantages && selected.avantages.length > 0 ? `
                <div style="background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 15px; padding: 20px; margin-top: 20px;">
                    <h4 style="color: #22c55e; margin-bottom: 15px;">
                        <i class="fas fa-check-circle"></i> Points clés de ce régime
                    </h4>
                    <ul style="margin: 0; padding-left: 20px; color: #e2e8f0;">
                        ${selected.avantages.map(a => `<li style="margin: 8px 0;">${a}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
    
    // 2. TABLEAU COMPARATIF DE TOUS LES RÉGIMES
    const comparisonHTML = `
        <div style="margin-top: 50px;">
            <h3 style="color: #00bfff; font-size: 1.5em; margin-bottom: 25px; text-align: center;">
                <i class="fas fa-chart-bar"></i> Comparaison de tous les régimes fiscaux
            </h3>
            
            <div class="regime-comparison-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
                ${sorted.map(r => {
                    const isSelected = r.key === selectedKey;
                    const isBest = r === best;
                    const diff = r.cashflowNetAnnuel - selectedAnnual;
                    
                    return `
                        <div class="regime-result ${isBest ? 'best' : ''}" 
                             style="background: ${isSelected ? 'rgba(0, 191, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)'}; 
                                    border: 2px solid ${isBest ? '#22c55e' : isSelected ? '#00bfff' : 'rgba(0, 191, 255, 0.2)'}; 
                                    border-radius: 15px; padding: 20px; transition: all 0.3s ease;
                                    ${isSelected ? 'box-shadow: 0 0 20px rgba(0,191,255,0.3);' : ''}">
                            
                            <div class="regime-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                                <div class="regime-name" style="font-weight: 600; color: ${isBest ? '#22c55e' : '#00bfff'};">
                                    <i class="fas ${r.icone || (String(r.id).includes('lmnp')||String(r.id).includes('lmp') ? 'fa-bed':'fa-building')}"></i>
                                    ${window.REGIME_LABELS[r.key] || r.nom}
                                </div>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    ${isBest ? '<span class="regime-badge" style="background: #22c55e; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em;">Meilleur</span>' : ''}
                                    ${isSelected ? '<span class="regime-badge current" style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em;">Sélectionné</span>' : ''}
                                </div>
                            </div>
                            
                            <div class="regime-metrics" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="metric-box" style="text-align: center; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                                    <div class="metric-label" style="color: #94a3b8; font-size: 0.85em; margin-bottom: 5px;">Cash-flow annuel</div>
                                    <div class="metric-value ${r.cashflowNetAnnuel >= 0 ? 'positive' : 'negative'}" 
                                         style="font-size: 1.2em; font-weight: 600; color: ${r.cashflowNetAnnuel >= 0 ? '#22c55e' : '#ef4444'};">
                                        ${_numOrDash(r.cashflowNetAnnuel)} €
                                    </div>
                                </div>
                                <div class="metric-box" style="text-align: center; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                                    <div class="metric-label" style="color: #94a3b8; font-size: 0.85em; margin-bottom: 5px;">Impôts</div>
                                    <div class="metric-value negative" style="font-size: 1.2em; font-weight: 600; color: #ef4444;">
                                        ${_numOrDash(Math.abs(r.impotAnnuel || 0))} €
                                    </div>
                                </div>
                                <div class="metric-box" style="text-align: center; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                                    <div class="metric-label" style="color: #94a3b8; font-size: 0.85em; margin-bottom: 5px;">Rendement</div>
                                    <div class="metric-value neutral" style="font-size: 1.2em; font-weight: 600; color: #e2e8f0;">
                                        ${_pctOrDash(r.rendementNet)}
                                    </div>
                                </div>
                                <div class="metric-box" style="text-align: center; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                                    <div class="metric-label" style="color: #94a3b8; font-size: 0.85em; margin-bottom: 5px;">Base imposable</div>
                                    <div class="metric-value neutral" style="font-size: 1.2em; font-weight: 600; color: #e2e8f0;">
                                        ${_numOrDash(r.baseImposable)} €
                                    </div>
                                </div>
                            </div>
                            
                            ${!isSelected ? `
                                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
                                    <span style="color: ${diff >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 500;">
                                        ${diff >= 0 ? 'Gain' : 'Perte'} vs sélection: 
                                        ${diff >= 0 ? '+' : ''}${_fmtNumber(diff)} €/an
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
            
            <!-- Légende -->
            <div style="margin-top: 30px; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 15px; text-align: center;">
                <div style="display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; color: #94a3b8; font-size: 0.9em;">
                    <div><span style="display: inline-block; width: 12px; height: 12px; background: #22c55e; border-radius: 50%; margin-right: 8px;"></span>Meilleur régime</div>
                    <div><span style="display: inline-block; width: 12px; height: 12px; background: #3b82f6; border-radius: 50%; margin-right: 8px;"></span>Régime sélectionné</div>
                    <div><span style="display: inline-block; width: 12px; height: 12px; background: rgba(0,191,255,0.3); border-radius: 50%; margin-right: 8px;"></span>Autres régimes</div>
                </div>
            </div>
        </div>
    `;
    
    // Retourner le HTML complet
    return detailHTML + comparisonHTML;
  };

  // Override doux si MarketFiscalAnalyzer existe
  window.addEventListener('load', () => {
    try {
      if (window.MarketFiscalAnalyzer && MarketFiscalAnalyzer.prototype) {
        const old = MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML;
        MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML = function(fiscal, analysisData){
          window.lastFiscalResults = fiscal;
          window.lastAnalysisData = { input: analysisData };
          return window.renderFiscalResults(fiscal, analysisData, window.propertyData || {});
        };
        console.log('✅ generateFiscalResultsHTML overridé avec nouvelle logique');
      }
    } catch (e) {
      console.warn('Override generateFiscalResultsHTML impossible :', e);
    }
  });
}
