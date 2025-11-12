/**
 * Module de calcul d'équilibre locatif
 * Trouve le loyer ou le prix d'achat où CF_net = Amort_capital + CAPEX
 * 
 * @typedef {"loyer_mensuel"|"prix_d_achat"} VariableCible
 * @typedef {"mensuel"|"annuel"|"n_annees"} PeriodeBase
 * @typedef {"nu_micro"|"nu_reel"|"lmnp_micro"|"lmnp_reel"|"lmp_reel"|"sci_is"} RegimeFiscal
 */

/**
 * @typedef {Object} CapexItem
 * @property {number} periode - Période (mois ou année selon context)
 * @property {number} montant - Montant du CAPEX en €
 */

/**
 * @typedef {Object} InputsEquilibre
 * @property {VariableCible} variable_cible - Variable à résoudre
 * @property {PeriodeBase} periode_base - Période d'agrégation
 * @property {number} [n_annees=1] - Horizon si periode_base="n_annees"
 * @property {number} prix_d_achat - Prix d'achat en €
 * @property {number} montant_emprunt - Montant emprunté en €
 * @property {number} taux_annuel - Taux d'intérêt annuel en %
 * @property {number} duree_annees - Durée du prêt en années
 * @property {number} differe_capital - Différé d'amortissement en mois
 * @property {number} loyer_mensuel - Loyer mensuel HC en €
 * @property {number} vacance_pct - Taux de vacance en %
 * @property {number} taxe_fonciere - Taxe foncière annuelle en €
 * @property {number} charges_copro - Charges copro non récup en €/mois
 * @property {number} assurance - Assurance PNO en €/mois
 * @property {number} gestion - % de gestion sur loyers encaissés
 * @property {number} entretien - Entretien annuel en €
 * @property {number|null} [capex_annuel] - CAPEX annuel en € (ou null)
 * @property {CapexItem[]|null} [capex_list] - Liste de CAPEX ponctuels
 * @property {RegimeFiscal} regime_fiscal - Régime fiscal
 * @property {number} tmi_ou_is - TMI ou taux IS en %
 * @property {number} prelevements - Prélèvements sociaux en %
 * @property {number} indexation_loyer - Indexation annuelle loyers en %
 * @property {number} inflation_charges - Inflation charges en %
 */

/**
 * @typedef {Object} ResumePeriode
 * @property {string} periode - Label de la période
 * @property {number} cf_net - Cash-flow net en €
 * @property {number} amortissement - Amortissement capital en €
 * @property {number} capex - CAPEX en €
 * @property {number} besoin_couverture - Amort + CAPEX en €
 * @property {number} marge_securite - CF_net - besoin_couverture en €
 */

/**
 * @typedef {Object} EquilibreResult
 * @property {VariableCible} variable_cible - Variable résolue
 * @property {number} valeur_equilibre - Valeur d'équilibre trouvée
 * @property {PeriodeBase} periode_base - Période utilisée
 * @property {Object.<string,string>} hypotheses - Hypothèses clés
 * @property {ResumePeriode[]} recap - Détail par période
 * @property {Object.<string,Object>} sensitivites - Sensibilités ±10%
 * @property {boolean} feasible - Solution trouvée ?
 * @property {string|null} [message] - Message d'erreur si infeasible
 */

// ============================================================================
// HELPERS INTERNES
// ============================================================================

/**
 * Génère l'échéancier d'amortissement mensuel
 * @param {number} montant - Capital emprunté
 * @param {number} taux_annuel - Taux annuel en %
 * @param {number} duree_annees - Durée en années
 * @param {number} differe_capital - Mois de différé (intérêts seuls)
 * @returns {Array<{mois:number, interet:number, amort:number, restant:number}>}
 */
function amortSchedule(montant, taux_annuel, duree_annees, differe_capital) {
    const taux_mensuel = taux_annuel / 100 / 12;
    const n_mois_total = duree_annees * 12;
    const n_mois_amort = n_mois_total - differe_capital;
    
    // Mensualité (hors différé)
    let mensualite = 0;
    if (taux_mensuel === 0) {
        mensualite = montant / n_mois_amort;
    } else {
        mensualite = montant * taux_mensuel / (1 - Math.pow(1 + taux_mensuel, -n_mois_amort));
    }
    
    const schedule = [];
    let restant = montant;
    
    for (let mois = 1; mois <= n_mois_total; mois++) {
        const interet = restant * taux_mensuel;
        let amort = 0;
        
        if (mois > differe_capital) {
            // Période d'amortissement normale
            amort = mensualite - interet;
            restant -= amort;
        }
        // Sinon différé : amort = 0, on ne rembourse que les intérêts
        
        schedule.push({
            mois,
            interet: Math.max(0, interet),
            amort: Math.max(0, amort),
            restant: Math.max(0, restant)
        });
    }
    
    return schedule;
}

/**
 * Génère la série de CAPEX selon la période
 * @param {PeriodeBase} periode_base
 * @param {number} n_annees
 * @param {number|null} capex_annuel
 * @param {CapexItem[]|null} capex_list
 * @returns {number[]} - CAPEX par période (mois ou année)
 */
function capexSeries(periode_base, n_annees, capex_annuel, capex_list) {
    if (capex_list && capex_list.length > 0) {
        // Utiliser la liste fournie
        const max_periode = periode_base === 'mensuel' ? n_annees * 12 : n_annees;
        const series = new Array(max_periode).fill(0);
        
        capex_list.forEach(item => {
            const idx = item.periode - 1;
            if (idx >= 0 && idx < max_periode) {
                series[idx] += item.montant;
            }
        });
        
        return series;
    }
    
    if (capex_annuel !== null && capex_annuel > 0) {
        // CAPEX annuel constant
        if (periode_base === 'mensuel') {
            return new Array(n_annees * 12).fill(0);
        } else {
            return new Array(n_annees).fill(capex_annuel);
        }
    }
    
    // Pas de CAPEX
    const max_periode = periode_base === 'mensuel' ? n_annees * 12 : n_annees;
    return new Array(max_periode).fill(0);
}

/**
 * Calcule l'impôt selon le régime fiscal
 * @param {RegimeFiscal} regime
 * @param {number} tmi_ou_is - TMI ou IS en %
 * @param {number} prelevements - PS en %
 * @param {number} loyers_nets - Loyers encaissés (après vacance)
 * @param {number} interets - Intérêts du prêt
 * @param {number|null} amort_comptable - Amortissement comptable (LMNP/LMP)
 * @param {number} opex - Charges déductibles
 * @returns {number} - Montant de l'impôt
 */
function taxLocatif(regime, tmi_ou_is, prelevements, loyers_nets, interets, amort_comptable, opex) {
    let base_imposable = 0;
    let taux_total = 0;
    
    switch (regime) {
        case 'nu_micro':
            // Abattement de 30% sur loyers bruts
            base_imposable = loyers_nets * 0.70;
            taux_total = tmi_ou_is + prelevements;
            return Math.max(0, base_imposable * taux_total / 100);
            
        case 'nu_reel':
            // Déduction charges réelles
            base_imposable = loyers_nets - opex - interets;
            taux_total = tmi_ou_is + prelevements;
            return base_imposable > 0 ? base_imposable * taux_total / 100 : 0;
            
        case 'lmnp_micro':
            // Abattement de 50% sur loyers bruts
            base_imposable = loyers_nets * 0.50;
            taux_total = tmi_ou_is + prelevements;
            return Math.max(0, base_imposable * taux_total / 100);
            
        case 'lmnp_reel':
        case 'lmp_reel':
            // Déduction charges + amortissement
            const amort = amort_comptable || 0;
            base_imposable = loyers_nets - opex - interets - amort;
            taux_total = tmi_ou_is + prelevements;
            return base_imposable > 0 ? base_imposable * taux_total / 100 : 0;
            
        case 'sci_is':
            // IS sans prélèvements sociaux
            base_imposable = loyers_nets - opex - interets;
            return base_imposable > 0 ? base_imposable * tmi_ou_is / 100 : 0;
            
        default:
            return 0;
    }
}

/**
 * Calcule le CF net agrégé sur la période
 * @param {InputsEquilibre} inputs
 * @param {number} valeur_cible - Valeur de la variable à tester
 * @param {Array} schedule - Échéancier d'amortissement
 * @returns {number} - CF net total sur la période
 */
function cfNetAgg(inputs, valeur_cible, schedule) {
    // Déterminer les bornes selon periode_base
    let debut_mois = 1;
    let fin_mois = 12;
    
    if (inputs.periode_base === 'mensuel') {
        fin_mois = 1;
    } else if (inputs.periode_base === 'n_annees') {
        fin_mois = inputs.n_annees * 12;
    }
    
    let cf_total = 0;
    let loyer_actuel = inputs.variable_cible === 'loyer_mensuel' ? valeur_cible : inputs.loyer_mensuel;
    let prix_actuel = inputs.variable_cible === 'prix_d_achat' ? valeur_cible : inputs.prix_d_achat;
    
    // Calcul de l'amortissement comptable (simplifié : 3% du prix/an sur 30 ans pour LMNP/LMP)
    const amort_comptable_annuel = (inputs.regime_fiscal === 'lmnp_reel' || inputs.regime_fiscal === 'lmp_reel') 
        ? prix_actuel * 0.03 
        : 0;
    
    for (let mois = debut_mois; mois <= fin_mois; mois++) {
        const annee_cours = Math.ceil(mois / 12);
        
        // Indexation loyer
        const coef_loyer = Math.pow(1 + inputs.indexation_loyer / 100, annee_cours - 1);
        const loyer_mois = loyer_actuel * coef_loyer;
        
        // Loyers encaissés (après vacance)
        const loyers_nets = loyer_mois * (1 - inputs.vacance_pct / 100);
        
        // Frais de gestion
        const frais_gestion = loyers_nets * inputs.gestion / 100;
        
        // Inflation charges
        const coef_charges = Math.pow(1 + inputs.inflation_charges / 100, annee_cours - 1);
        
        // OPEX mensuels
        const opex = (
            inputs.charges_copro * coef_charges +
            inputs.assurance * coef_charges +
            (inputs.entretien / 12) * coef_charges +
            frais_gestion
        );
        
        // Intérêts du mois
        const interets = schedule[mois - 1].interet;
        
        // Impôt mensuel (simplifié : 1/12 de l'impôt annuel)
        const impot_annuel = taxLocatif(
            inputs.regime_fiscal,
            inputs.tmi_ou_is,
            inputs.prelevements,
            loyers_nets * 12,  // annualiser
            interets * 12,      // annualiser
            amort_comptable_annuel,
            opex * 12           // annualiser
        );
        const impot_mois = impot_annuel / 12;
        
        // Taxe foncière (1/12 par mois)
        const tf_mois = inputs.taxe_fonciere / 12;
        
        // CF net du mois
        cf_total += loyers_nets - opex - interets - impot_mois - tf_mois;
    }
    
    return cf_total;
}

/**
 * Calcule le besoin de couverture agrégé (amort + capex)
 * @param {InputsEquilibre} inputs
 * @param {Array} schedule
 * @param {number[]} capex
 * @returns {number}
 */
function needAgg(inputs, schedule, capex) {
    let total_amort = 0;
    let total_capex = 0;
    
    let debut_mois = 1;
    let fin_mois = 12;
    
    if (inputs.periode_base === 'mensuel') {
        fin_mois = 1;
    } else if (inputs.periode_base === 'n_annees') {
        fin_mois = inputs.n_annees * 12;
    }
    
    // Amortissement capital
    for (let mois = debut_mois; mois <= fin_mois; mois++) {
        total_amort += schedule[mois - 1].amort;
    }
    
    // CAPEX
    if (inputs.periode_base === 'mensuel') {
        total_capex = capex[0] || 0;
    } else if (inputs.periode_base === 'annuel') {
        total_capex = capex[0] || 0;
    } else {
        total_capex = capex.reduce((sum, val) => sum + val, 0);
    }
    
    return total_amort + total_capex;
}

/**
 * Calcule les sensibilités ±10%
 * @param {InputsEquilibre} inputs
 * @param {EquilibreResult} base_result
 * @param {Array} schedule
 * @returns {Object}
 */
function sensitivites(inputs, base_result, schedule) {
    const sensibles = ['taux_annuel', 'vacance_pct', 'gestion'];
    
    if (inputs.capex_annuel > 0 || (inputs.capex_list && inputs.capex_list.length > 0)) {
        sensibles.push('capex');
    }
    
    const results = {};
    
    sensibles.forEach(param => {
        const inputs_moins = { ...inputs };
        const inputs_plus = { ...inputs };
        
        if (param === 'capex') {
            if (inputs.capex_annuel) {
                inputs_moins.capex_annuel = inputs.capex_annuel * 0.9;
                inputs_plus.capex_annuel = inputs.capex_annuel * 1.1;
            } else if (inputs.capex_list) {
                inputs_moins.capex_list = inputs.capex_list.map(c => ({ ...c, montant: c.montant * 0.9 }));
                inputs_plus.capex_list = inputs.capex_list.map(c => ({ ...c, montant: c.montant * 1.1 }));
            }
        } else {
            inputs_moins[param] = inputs[param] * 0.9;
            inputs_plus[param] = inputs[param] * 1.1;
        }
        
        try {
            const result_moins = solveEquilibre(inputs_moins, { tol: 1e-4, max_iter: 50 });
            const result_plus = solveEquilibre(inputs_plus, { tol: 1e-4, max_iter: 50 });
            
            results[param] = {
                '-10%': result_moins.feasible ? Math.round(result_moins.valeur_equilibre) : null,
                '+10%': result_plus.feasible ? Math.round(result_plus.valeur_equilibre) : null
            };
        } catch (e) {
            results[param] = { '-10%': null, '+10%': null };
        }
    });
    
    return results;
}

// ============================================================================
// FONCTION PRINCIPALE : RÉSOLUTION PAR BISSECTION
// ============================================================================

/**
 * Résout l'équation d'équilibre : CF_net = Amort_capital + CAPEX
 * @param {InputsEquilibre} inputs
 * @param {Object} opts - Options de résolution
 * @returns {EquilibreResult}
 */
function solveEquilibre(inputs, opts = {}) {
    // Validation des entrées
    if (!inputs.variable_cible || !inputs.periode_base) {
        throw new Error('variable_cible et periode_base sont requis');
    }
    
    const {
        borne_min = null,
        borne_max = null,
        tol = 1e-6,
        max_iter = 100
    } = opts;
    
    // Déterminer n_annees
    const n_annees = inputs.periode_base === 'n_annees' 
        ? (inputs.n_annees || 1)
        : 1;
    
    // Générer l'échéancier (utilise les valeurs initiales pour le montant emprunté)
    const schedule = amortSchedule(
        inputs.montant_emprunt,
        inputs.taux_annuel,
        inputs.duree_annees,
        inputs.differe_capital
    );
    
    // Générer les CAPEX
    const capex = capexSeries(
        inputs.periode_base,
        n_annees,
        inputs.capex_annuel,
        inputs.capex_list
    );
    
    // Fonction f(x) = CF_net(x) - (Amort + CAPEX)
    const f = (x) => {
        // Recalculer l'échéancier si la variable est le prix
        let sched = schedule;
        if (inputs.variable_cible === 'prix_d_achat') {
            const new_emprunt = x - inputs.prix_d_achat + inputs.montant_emprunt;
            sched = amortSchedule(new_emprunt, inputs.taux_annuel, inputs.duree_annees, inputs.differe_capital);
        }
        
        const cf = cfNetAgg(inputs, x, sched);
        const need = needAgg(inputs, sched, capex);
        return cf - need;
    };
    
    // Déterminer les bornes
    let a, b;
    
    if (inputs.variable_cible === 'loyer_mensuel') {
        a = borne_min !== null ? borne_min : 0;
        b = borne_max !== null ? borne_max : Math.max(inputs.loyer_mensuel * 2, 1000);
        
        // Expansion de b si f(b) < 0
        let expansions = 0;
        while (f(b) < 0 && expansions < 20) {
            b *= 1.5;
            expansions++;
        }
        
        if (f(b) < 0) {
            return {
                variable_cible: inputs.variable_cible,
                valeur_equilibre: 0,
                periode_base: inputs.periode_base,
                hypotheses: {},
                recap: [],
                sensitivites: {},
                feasible: false,
                message: 'Infeasible : Le CF net reste négatif même avec un loyer majoré'
            };
        }
    } else {
        // prix_d_achat
        a = borne_min !== null ? borne_min : Math.max(1, inputs.montant_emprunt * 0.5);
        b = borne_max !== null ? borne_max : inputs.prix_d_achat * 1.5;
        
        // Pour le prix, f est décroissante : vérifier f(a) > 0
        if (f(a) < 0) {
            return {
                variable_cible: inputs.variable_cible,
                valeur_equilibre: 0,
                periode_base: inputs.periode_base,
                hypotheses: {},
                recap: [],
                sensitivites: {},
                feasible: false,
                message: 'Infeasible : Le bien est déjà sous-évalué et CF net négatif'
            };
        }
        
        // Expansion de b si nécessaire
        let expansions = 0;
        while (f(b) > 0 && expansions < 20) {
            b *= 1.25;
            expansions++;
        }
        
        if (f(b) > 0) {
            return {
                variable_cible: inputs.variable_cible,
                valeur_equilibre: 0,
                periode_base: inputs.periode_base,
                hypotheses: {},
                recap: [],
                sensitivites: {},
                feasible: false,
                message: 'Infeasible : Pas de borne supérieure trouvée pour le prix'
            };
        }
    }
    
    // Bissection
    let iteration = 0;
    let m = (a + b) / 2;
    
    while ((b - a) > tol && iteration < max_iter) {
        m = (a + b) / 2;
        const fm = f(m);
        
        if (Math.abs(fm) < 1e-3) {
            break; // Convergence atteinte
        }
        
        if (inputs.variable_cible === 'loyer_mensuel') {
            // f croissante en loyer
            if (fm < 0) {
                a = m;
            } else {
                b = m;
            }
        } else {
            // f décroissante en prix
            if (fm > 0) {
                a = m;
            } else {
                b = m;
            }
        }
        
        iteration++;
    }
    
    // Calculer le récapitulatif final
    const valeur_equilibre = m;
    
    // Recalculer avec la valeur d'équilibre
    let final_schedule = schedule;
    if (inputs.variable_cible === 'prix_d_achat') {
        const new_emprunt = valeur_equilibre - inputs.prix_d_achat + inputs.montant_emprunt;
        final_schedule = amortSchedule(new_emprunt, inputs.taux_annuel, inputs.duree_annees, inputs.differe_capital);
    }
    
    const cf_net = cfNetAgg(inputs, valeur_equilibre, final_schedule);
    const besoin = needAgg(inputs, final_schedule, capex);
    
    const recap = [{
        periode: inputs.periode_base === 'mensuel' ? 'M1' : inputs.periode_base === 'annuel' ? 'A1' : `${n_annees} ans`,
        cf_net: Math.round(cf_net),
        amortissement: Math.round(besoin - capex.reduce((s, v) => s + v, 0)),
        capex: Math.round(capex.reduce((s, v) => s + v, 0)),
        besoin_couverture: Math.round(besoin),
        marge_securite: Math.round(cf_net - besoin)
    }];
    
    // Hypothèses
    const hypotheses = {
        vacance: `${inputs.vacance_pct}%`,
        gestion: `${inputs.gestion}%`,
        regime: inputs.regime_fiscal,
        horizon: inputs.periode_base === 'mensuel' ? 'M1' : inputs.periode_base === 'annuel' ? 'A1' : `${n_annees} ans`
    };
    
    // Sensibilités
    const sensitivites_calc = sensitivites(inputs, null, final_schedule);
    
    return {
        variable_cible: inputs.variable_cible,
        valeur_equilibre: Math.round(valeur_equilibre * 100) / 100,
        periode_base: inputs.periode_base,
        hypotheses,
        recap,
        sensitivites: sensitivites_calc,
        feasible: true,
        message: null
    };
}

// ============================================================================
// RENDU UI
// ============================================================================

/**
 * Rend le résultat d'équilibre dans le DOM
 * @param {EquilibreResult} eq
 * @param {HTMLElement} mountEl
 */
function renderEquilibre(eq, mountEl) {
    if (!mountEl) {
        console.error('Element de montage introuvable');
        return;
    }
    
    const formatNumber = window.analyzer?.formatNumber || ((n) => {
        return new Intl.NumberFormat('fr-FR', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(Math.round(n));
    });
    
    const variableLabel = eq.variable_cible === 'loyer_mensuel' 
        ? 'Loyer mensuel d\'équilibre'
        : 'Prix d\'achat d\'équilibre';
    
    const unite = eq.variable_cible === 'loyer_mensuel' ? '€/mois' : '€';
    
    let html = `
        <div class="section-divider" style="margin: 60px 0;"></div>
        
        <div class="card backdrop-blur-md bg-opacity-20 border border-blue-400/10 shadow-lg">
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-balance-scale"></i>
                </div>
                <h2 class="card-title">Analyse d'équilibre locatif</h2>
            </div>
    `;
    
    if (eq.feasible) {
        html += `
            <div class="best-regime-summary" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05));">
                <div class="summary-title" style="color: #22c55e;">
                    <i class="fas fa-check-circle"></i>
                    ${variableLabel}
                </div>
                <div class="summary-content">
                    <div class="summary-highlight" style="font-size: 2.5em; margin: 20px 0;">
                        ${formatNumber(eq.valeur_equilibre)} ${unite}
                    </div>
                    <p style="color: #94a3b8; margin-top: 10px;">
                        À ce niveau, vos cash-flows couvrent exactement l'amortissement du capital
                        ${eq.recap[0].capex > 0 ? ' et les dépenses CAPEX' : ''}
                    </p>
                </div>
            </div>
            
            <!-- Hypothèses -->
            <div class="form-section" style="margin-top: 30px;">
                <div class="form-section-title">
                    <i class="fas fa-info-circle"></i>
                    Hypothèses de calcul
                </div>
                <div class="grid grid-2">
                    ${Object.entries(eq.hypotheses).map(([key, val]) => `
                        <div class="market-metric">
                            <div class="market-metric-label">${key}</div>
                            <div class="market-metric-value" style="font-size: 1.2em;">${val}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Récapitulatif -->
            <div class="form-section" style="margin-top: 30px;">
                <div class="form-section-title">
                    <i class="fas fa-table"></i>
                    Détail de la période
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(0, 191, 255, 0.3);">
                            <th style="padding: 15px; text-align: left; color: #00bfff;">Période</th>
                            <th style="padding: 15px; text-align: right; color: #00bfff;">CF Net</th>
                            <th style="padding: 15px; text-align: right; color: #00bfff;">Amortissement</th>
                            <th style="padding: 15px; text-align: right; color: #00bfff;">CAPEX</th>
                            <th style="padding: 15px; text-align: right; color: #00bfff;">Besoin</th>
                            <th style="padding: 15px; text-align: right; color: #00bfff;">Marge</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${eq.recap.map(r => `
                            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                <td style="padding: 15px; color: #e2e8f0;">${r.periode}</td>
                                <td style="padding: 15px; text-align: right; color: #e2e8f0;">${formatNumber(r.cf_net)} €</td>
                                <td style="padding: 15px; text-align: right; color: #e2e8f0;">${formatNumber(r.amortissement)} €</td>
                                <td style="padding: 15px; text-align: right; color: #e2e8f0;">${formatNumber(r.capex)} €</td>
                                <td style="padding: 15px; text-align: right; color: #ef4444;">${formatNumber(r.besoin_couverture)} €</td>
                                <td style="padding: 15px; text-align: right; font-weight: 600; color: ${r.marge_securite >= 0 ? '#22c55e' : '#ef4444'};">
                                    ${r.marge_securite >= 0 ? '+' : ''}${formatNumber(r.marge_securite)} €
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Sensibilités -->
            <div class="form-section" style="margin-top: 30px;">
                <div class="form-section-title">
                    <i class="fas fa-chart-line"></i>
                    Analyse de sensibilité (±10%)
                </div>
                <div class="regime-comparison-grid">
                    ${Object.entries(eq.sensitivites).map(([param, vals]) => `
                        <div class="regime-result">
                            <div class="regime-header">
                                <div class="regime-name" style="font-size: 1em;">
                                    ${param.replace('_', ' ')}
                                </div>
                            </div>
                            <div class="regime-metrics">
                                <div class="metric-box">
                                    <div class="metric-label">-10%</div>
                                    <div class="metric-value ${vals['-10%'] !== null && vals['-10%'] < eq.valeur_equilibre ? 'positive' : 'neutral'}">
                                        ${vals['-10%'] !== null ? formatNumber(vals['-10%']) + ' ' + unite : 'N/A'}
                                    </div>
                                </div>
                                <div class="metric-box">
                                    <div class="metric-label">+10%</div>
                                    <div class="metric-value ${vals['+10%'] !== null && vals['+10%'] > eq.valeur_equilibre ? 'negative' : 'neutral'}">
                                        ${vals['+10%'] !== null ? formatNumber(vals['+10%']) + ' ' + unite : 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="best-regime-summary" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05));">
                <div class="summary-title" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Équilibre impossible
                </div>
                <div class="summary-content">
                    <p style="color: #94a3b8; font-size: 1.1em; line-height: 1.8;">
                        ${eq.message || 'Aucune solution d\'équilibre n\'a pu être trouvée avec les paramètres actuels.'}
                    </p>
                    <div style="margin-top: 30px;">
                        <div class="recommendations-box">
                            <div class="recommendations-title">
                                <i class="fas fa-lightbulb"></i>
                                Suggestions
                            </div>
                            <div class="recommendation-item">
                                <div class="recommendation-icon">
                                    <i class="fas fa-arrow-up"></i>
                                </div>
                                <div class="recommendation-content">
                                    <h4>Augmenter les revenus</h4>
                                    <p>Augmentez le loyer ou réduisez la vacance locative</p>
                                </div>
                            </div>
                            <div class="recommendation-item">
                                <div class="recommendation-icon">
                                    <i class="fas fa-arrow-down"></i>
                                </div>
                                <div class="recommendation-content">
                                    <h4>Réduire les charges</h4>
                                    <p>Optimisez vos charges, frais de gestion ou fiscalité</p>
                                </div>
                            </div>
                            <div class="recommendation-item">
                                <div class="recommendation-icon">
                                    <i class="fas fa-money-bill-wave"></i>
                                </div>
                                <div class="recommendation-content">
                                    <h4>Améliorer le financement</h4>
                                    <p>Augmentez l'apport ou négociez un meilleur taux</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    html += `
        </div>
    `;
    
    mountEl.insertAdjacentHTML('beforeend', html);
}

// ============================================================================
// EXPORT
// ============================================================================

// Exposer les fonctions au window pour utilisation globale
if (typeof window !== 'undefined') {
    window.Equilibre = {
        solveEquilibre,
        renderEquilibre,
        // Helpers exposés pour debug/tests
        amortSchedule,
        capexSeries,
        taxLocatif,
        cfNetAgg,
        needAgg,
        sensitivites
    };
}
