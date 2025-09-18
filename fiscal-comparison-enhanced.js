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
 */
/* ================== HELPERS REGIMES & LABELS ================== */
window.REGIME_LABELS = {
  nu_micro   : 'Location nue – Micro-foncier',
  nu_reel    : 'Location nue – Réel foncier',
  lmnp_micro : 'LMNP – Micro-BIC',
  lmnp_reel  : 'LMNP – Réel',
  lmp_reel   : 'LMP – Réel',
  sci_is     : 'SCI à l'IS'
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
    return window.analyzer?.formatNumber ? analyzer.formatNumber(n)
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
const currentKey = data?.regimeActuel || null;              // ex: "lmnp_reel"
const currentId  = currentKey ? (REGIME_ID_FROM_KEY[currentKey] || currentKey) : null;

// Ajoute des métadonnées utiles pour l'UI
results.forEach(r => {
  r.key       = REGIME_KEY_FROM_ID[r.id] || r.id;           // ex: "lmnp_reel"
  r.isCurrent = currentId ? (r.id === currentId) : false;   // badge "Régime actuel"
});

// Tri naturel (meilleur cash-flow en premier)
results.sort((a, b) => b.cashflowNetAnnuel - a.cashflowNetAnnuel);

// Marque le meilleur calculé (sauf si on force le régime actuel)
if (results.length > 0) results[0].isOptimal = true;

// Si l'utilisateur force son régime : le mettre en premier
if (data?.forceRegime) {
  const idx = results.findIndex(r => r.isCurrent);
  if (idx > 0) {
    const cur = results.splice(idx, 1)[0];
    results.unshift(cur);
    results.forEach((r, i) => r.isOptimal = (i === 0)); // le 1er devient la "référence"
  }
}

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
        
        // Préparer les données communes pour tous les calculs
        const commonData = {
            loyerMensuel: baseResults.loyerBrut,
            vacanceLocative: baseResults.vacanceLocative || 5,
            taxeFonciere: baseResults.taxeFonciere || 800,
            chargesCopro: baseResults.chargesNonRecuperables / 12 || 50,
            assurancePNO: baseResults.assurancePNO / 12 || 15,
            entretien: baseResults.entretienAnnuel || 500,
            gestionLocative: data.gestionLocativeTaux > 0 ? loyerAnnuel * (data.gestionLocativeTaux / 100) : 0,
            interetsAnnuels: (baseResults.interetsAnnee1 != null) 
                ? baseResults.interetsAnnee1 
                : ta.slice(0, 12).reduce((sum, m) => sum + (m.interets || 0), 0),
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
}/* ================== RENDERER HTML & OVERRIDE ================== */
if (typeof window !== 'undefined') {
  window.renderFiscalResults = function(fiscalArray, analysisData, props={}){
    if (!Array.isArray(fiscalArray) || fiscalArray.length === 0){
      return `<div class="regime-result"><p style="color:#94a3b8">Aucun résultat fiscal disponible.</p></div>`;
    }

    const curKey = props.regimeActuel || null;
    
    // Recalibrer dynamiquement le "current" d'après le select
    fiscalArray = fiscalArray.map(r => {
      const key = r.key || (REGIME_KEY_FROM_ID[r.id] || r.id);
      return { ...r, key, isCurrent: curKey ? (key === curKey) : !!r.isCurrent };
    });

    // recalculer best/current après le mapping
    const best   = fiscalArray.find(r => r.isOptimal) || fiscalArray[0];
    const current = fiscalArray.find(r => r.isCurrent) || null;

    const bestAnnual = (typeof best.cashflowNetAnnuel==='number') ? best.cashflowNetAnnuel : NaN;
    const curAnnual  = current && typeof current.cashflowNetAnnuel==='number' ? current.cashflowNetAnnuel : NaN;
    const gapAnnual  = (isFinite(bestAnnual) && isFinite(curAnnual)) ? (bestAnnual - curAnnual) : NaN;

    const selectHtml = `
      <select onchange="(function(v){
        if(window.propertyData){window.propertyData.regimeActuel=v;}
        const box=document.getElementById('fiscal-comparison-results');
        if(box && window.lastFiscalResults){
          box.innerHTML = window.renderFiscalResults(window.lastFiscalResults, window.lastAnalysisData?.input, window.propertyData||{});
        }
      })(this.value)"
        style="margin-left:8px;background:#0e1b2d;border:1px solid rgba(0,191,255,.3);color:#e2e8f0;border-radius:8px;padding:6px 10px;">
        ${Object.entries(window.REGIME_LABELS).map(([k,v]) => `<option value="${k}" ${k===curKey?'selected':''}>${v}</option>`).join('')}
      </select>`;

    const summary = `
      <div class="best-regime-summary">
        <div class="summary-title"><i class="fas fa-balance-scale"></i> Synthèse des régimes</div>
        <div class="summary-content">
          <div style="margin-bottom:8px;">
            Régime actuel : <span class="summary-highlight">${window.REGIME_LABELS[curKey] || '—'}</span> ${selectHtml}
          </div>
          <div style="margin-bottom:8px;">
            ${props?.forceRegime ? `Optimisation <strong>verrouillée</strong> sur votre régime actuel.` :
              `Recommandé : <span class="summary-highlight">${window.REGIME_LABELS[best.key] || best.nom}</span>`}
          </div>
          ${(!props?.forceRegime && current && isFinite(gapAnnual)) ? `
            <div style="opacity:.9;">
              Écart vs votre régime :
              <span class="summary-highlight" style="color:${gapAnnual>=0?'#22c55e':'#ef4444'};">
                ${(gapAnnual>=0?'+':'-')}${_fmtNumber(Math.abs(gapAnnual))} €/an
              </span>
            </div>` : ``}
        </div>
      </div>`;

    const cards = fiscalArray.map(r=>{
      const taxesRaw =
        (typeof r.impotAnnuel === 'number' ? Math.abs(r.impotAnnuel) :
         typeof r.impotTotal  === 'number' ? r.impotTotal :
         typeof r.totalImpot  === 'number' ? r.totalImpot :
         typeof r.impots      === 'number' ? r.impots : null);

      return `
        <div class="regime-result ${r.isOptimal && !props.forceRegime ? 'best' : ''}" data-regime-key="${r.key||''}">
          <div class="regime-header">
            <div class="regime-name">
              <i class="fas ${String(r.id).includes('lmnp')||String(r.id).includes('lmp') ? 'fa-bed':'fa-building'}"></i>
              ${window.REGIME_LABELS[r.key] || r.nom || 'Régime'}
            </div>
            ${r.isOptimal && !props.forceRegime ? `<div class="regime-badge">Meilleur</div>` : ``}
            ${r.isCurrent ? `<div class="regime-badge current">Régime actuel</div>` : ``}
          </div>

          <div class="regime-metrics">
            <div class="metric-box">
              <div class="metric-label">Cash-flow net annuel</div>
              <div class="metric-value ${(r.cashflowNetAnnuel||0)>=0?'positive':'negative'}">${_numOrDash(r.cashflowNetAnnuel)} €</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Impôts & prélèvements</div>
              <div class="metric-value ${typeof taxesRaw==='number'?(taxesRaw<=0?'positive':'negative'):'neutral'}">${_numOrDash(taxesRaw)} €</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Rendement net</div>
              <div class="metric-value neutral">${_pctOrDash(r.rendementNet)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Base imposable</div>
              <div class="metric-value neutral">${_numOrDash(r.baseImposable)} €</div>
            </div>
          </div>
        </div>`;
    }).join('');

    return `${summary}<div class="regime-comparison-grid">${cards}</div>`;
  };

  // 🔄 Override doux si MarketFiscalAnalyzer existe (sinon, rien)
  window.addEventListener('load', () => {
    try {
      if (window.MarketFiscalAnalyzer && MarketFiscalAnalyzer.prototype) {
        const old = MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML;
        MarketFiscalAnalyzer.prototype.generateFiscalResultsHTML = function(fiscal, analysisData){
          window.lastFiscalResults = fiscal; // pour MAJ live
          return window.renderFiscalResults(fiscal, analysisData, window.propertyData || {});
        };
        console.log('🔁 generateFiscalResultsHTML overridé par renderFiscalResults');
      }
    } catch (e) {
      console.warn('Override generateFiscalResultsHTML impossible :', e);
    }
  });
}
