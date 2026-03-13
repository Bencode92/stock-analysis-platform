/**
 * strategy-recommendations.js — Recommandations stratégiques actionnables
 *
 * Génère des objectifs + simulations chiffrées basées sur la situation réelle :
 * 1. Changement d'union : concubinage → PACS → mariage (impact chiffré)
 * 2. Changement de régime matrimonial (communauté universelle, séparation...)
 * 3. Objectifs : protéger conjoint, minimiser droits, protéger enfants 1er lit
 * 4. Checklist actions (DDV, testament, AV, SCI, don familial...)
 * 5. Timeline : urgences (don familial < 80a, 790 A bis expire 31/12/2026)
 *
 * Croise TOUS les modules : CivilRights, FiscalOptimizations, InheritanceRules,
 * ExpatSuccession, PERAvClause
 *
 * @version 1.0.0 — 2026-03-13
 */
const StrategyRecommendations = (function() {
    'use strict';

    // ============================================================
    // 1. SIMULATEUR CHANGEMENT D'UNION
    // ============================================================

    /**
     * Compare les droits et protections selon le type d'union.
     * Génère un tableau chiffré : concubinage vs PACS vs mariage.
     *
     * @param {Object} params
     * @param {number} params.patrimoine - Patrimoine total
     * @param {number} params.montantConjoint - Montant que le conjoint recevrait
     * @param {number} params.ageDefunt - Âge du défunt
     * @param {number} params.nbEnfants - Nombre d'enfants
     * @param {boolean} params.hasEnfantsAutreLit - Enfants d'un autre lit
     * @param {number} params.montantAV - Montant AV bénéficiaire conjoint
     * @returns {Object} Comparatif chiffré
     */
    function simulerChangementUnion(params) {
        var p = params || {};
        var patrimoine = p.patrimoine || 500000;
        var montantConj = p.montantConjoint || Math.round(patrimoine * 0.25);
        var age = p.ageDefunt || 55;
        var nbEnf = p.nbEnfants || 2;
        var autresLit = !!p.hasEnfantsAutreLit;
        var montantAV = p.montantAV || 0;
        var F = SD._fiscal;

        var scenarios = {};

        // --- CONCUBINAGE ---
        var droitsConc = F.calcDroits(Math.max(0, montantConj - 1594), F.getBareme('tiers'));
        var droitsAVConc = 0;
        if (montantAV > 152500) droitsAVConc = Math.round((montantAV - 152500) * 0.20);
        scenarios.concubinage = {
            label: 'Concubinage',
            droitsConjoint: droitsConc,
            droitsAV: droitsAVConc,
            droitsTotal: droitsConc + droitsAVConc,
            exonereConjoint: false,
            droitLogement: 'Aucun',
            heritageAuto: false,
            ddvPossible: false,
            protections: ['AV (152.5k exo)', 'SCI croisée', 'Testament (QD)'],
            risques: ['60% de droits sur tout hors AV', 'Pas de droit au logement', 'Pas d\'héritage automatique'],
            couleur: 'var(--accent-coral)'
        };

        // --- PACS ---
        // Pacsé exonéré en succession MAIS pas d'héritage auto sans testament
        var droitsPacs = 0; // exonéré art. 796-0 bis
        scenarios.pacs = {
            label: 'PACS',
            droitsConjoint: 0,
            droitsAV: 0,
            droitsTotal: 0,
            exonereConjoint: true,
            droitLogement: '1 an (art. 515-6 CC)',
            heritageAuto: false,
            ddvPossible: false,
            testamentRequis: true,
            protections: ['Exonéré de droits', 'Droit logement 1 an', 'AV exonérée'],
            risques: ['RIEN sans testament !', 'Pas de DDV', 'Pas de droit viager au logement'],
            actions: ['Rédiger un testament (obligatoire !)', 'Clause AV bénéficiaire "mon partenaire"'],
            couleur: 'var(--accent-amber)'
        };

        // --- MARIAGE ---
        var droitsMar = 0; // exonéré
        var optionDDV = !autresLit ? '100% usufruit ou QD en PP' : '25% PP (enfants autre lit)';
        scenarios.mariage = {
            label: 'Mariage',
            droitsConjoint: 0,
            droitsAV: 0,
            droitsTotal: 0,
            exonereConjoint: true,
            droitLogement: 'Viager (art. 764 CC) + 1 an gratuit',
            heritageAuto: true,
            ddvPossible: !autresLit,
            optionDDV: optionDDV,
            protections: ['Exonéré de droits', 'Héritage automatique', 'Droit viager logement', 'DDV (usufruit 100%)', 'AV exonérée'],
            risques: autresLit ? ['Action en retranchement enfants 1er lit'] : [],
            actions: ['DDV chez notaire (~140€)', 'Clause AV bénéficiaire "mon conjoint"'],
            couleur: 'var(--accent-green)'
        };

        // Économie passage concubinage → PACS
        var ecoConcPacs = scenarios.concubinage.droitsTotal - scenarios.pacs.droitsTotal;
        // Économie passage concubinage → mariage
        var ecoConcMar = scenarios.concubinage.droitsTotal - scenarios.mariage.droitsTotal;
        // Économie passage PACS → mariage
        var ecoPacsMar = 0; // Déjà exonéré, l'avantage est civil (DDV, droit viager)

        return {
            scenarios: scenarios,
            economies: {
                concubinage_vers_pacs: ecoConcPacs,
                concubinage_vers_mariage: ecoConcMar,
                pacs_vers_mariage: ecoPacsMar
            },
            meilleur: 'mariage',
            recommendation: ecoConcPacs > 0
                ? 'Passage concubinage → PACS : économie immédiate de ' + fmt(ecoConcPacs) + ' sur les droits. Passage → mariage : + DDV + droit viager.'
                : 'Le mariage offre la meilleure protection (DDV + droit viager + exonération).'
        };
    }

    // ============================================================
    // 2. SIMULATEUR CHANGEMENT DE RÉGIME MATRIMONIAL
    // ============================================================

    function simulerChangementRegime(params) {
        var p = params || {};
        var patrimoine = p.patrimoine || 500000;
        var biensCommuns = p.biensCommuns || Math.round(patrimoine * 0.60);
        var biensPropres = patrimoine - biensCommuns;
        var nbEnfants = p.nbEnfants || 2;
        var autresLit = !!p.hasEnfantsAutreLit;
        var age = p.ageDefunt || 55;
        var F = SD._fiscal;

        var regimes = {};

        // Communauté réduite aux acquêts (défaut)
        var masseAcquets = Math.round(biensCommuns / 2) + biensPropres; // 50% communs + propres
        var droitsAcquets = F.calcDroits(Math.max(0, masseAcquets / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.acquets = {
            label: 'Communauté réduite aux acquêts (défaut)',
            masseSuccession: masseAcquets,
            droitsEnfants: droitsAcquets,
            article: 'Art. 1400-1491 CC',
            avantages: ['Régime par défaut, simple', 'Biens propres protégés'],
            inconvenients: ['Conjoint ne récupère que 50% des communs']
        };

        // Communauté universelle SANS clause
        var masseUniv = Math.round(patrimoine / 2); // 50% patrimoine total
        var droitsUniv = F.calcDroits(Math.max(0, masseUniv / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.universelle = {
            label: 'Communauté universelle',
            masseSuccession: masseUniv,
            droitsEnfants: droitsUniv,
            article: 'Art. 1526 CC',
            avantages: ['Tout est commun', 'Conjoint garante 50% minimum'],
            inconvenients: ['Biens propres perdent leur caractère propre']
        };

        // Communauté universelle AVEC clause attribution intégrale
        regimes.attribution_integrale = {
            label: 'Communauté universelle + clause attribution intégrale',
            masseSuccession: 0,
            droitsEnfants: 0,
            article: 'Art. 1526 CC + clause',
            droitsAu1erDeces: 0,
            droitsAu2ndDeces: F.calcDroits(Math.max(0, patrimoine / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants,
            perte1Abattement: 100000 * nbEnfants,
            avantages: ['0€ droits au 1er décès', 'Conjoint reçoit TOUT', 'Pas d\'ouverture de succession'],
            inconvenients: [
                'Enfants perdent 1 abattement (100k × ' + nbEnfants + ' = ' + fmt(100000 * nbEnfants) + ')',
                'Droits plus élevés au 2nd décès : ' + fmt(F.calcDroits(Math.max(0, patrimoine / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants)
            ],
            warnings: autresLit ? ['\ud83d\udea8 Enfants 1er lit : ACTION EN RETRANCHEMENT possible ! Ils peuvent exiger leur réserve.'] : [],
            recommandePour: 'Couples SANS enfant ou enfants communs uniquement'
        };

        // Séparation de biens
        var masseSep = biensPropres; // que les biens propres du défunt
        var droitsSep = F.calcDroits(Math.max(0, masseSep / nbEnfants - 100000), F.getBareme('enfant')) * nbEnfants;
        regimes.separation = {
            label: 'Séparation de biens',
            masseSuccession: masseSep,
            droitsEnfants: droitsSep,
            article: 'Art. 1536-1543 CC',
            avantages: ['Patrimoines séparés', 'Protection si activité à risque'],
            inconvenients: ['Conjoint peu fortuné : pas de protection automatique', 'Pas de mise en commun']
        };

        // Comparatif
        var meilleurDroits = 'attribution_integrale';
        var meilleurProtection = autresLit ? 'acquets' : 'attribution_integrale';

        return {
            regimes: regimes,
            actuel: 'acquets',
            meilleurFiscal: meilleurDroits,
            meilleurProtection: meilleurProtection,
            coutChangement: '~1 500 – 3 000€ notaire + homologation tribunal',
            delai: '2 ans minimum après le mariage'
        };
    }

    // ============================================================
    // 3. RECOMMANDATIONS BASÉES SUR OBJECTIFS
    // ============================================================

    function genererRecommandations(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var nbEnfants = p.nbEnfants || 0;
        var autresLit = !!p.hasEnfantsAutreLit;
        var patrimoine = p.patrimoine || 0;
        var age = p.ageDonateur || 55;
        var hasAV = !!p.hasAV;
        var hasPER = !!p.hasPER;
        var hasSCI = !!p.hasSCI;
        var hasDDV = !!p.hasDDV;
        var hasTestament = !!p.hasTestament;
        var paysResidence = p.paysResidence || 'FR';

        var recs = [];
        var urgences = [];

        // --- PROTECTION CONJOINT ---
        if (unionType === 'concubinage') {
            recs.push({
                objectif: 'Protéger votre concubin(e)',
                priorite: 'CRITIQUE',
                icon: 'fa-heart', color: 'var(--accent-coral)',
                actions: [
                    { action: 'Passer au PACS → exonération droits succession', impact: 'Économie 60% droits', urgence: true },
                    { action: 'Ou mieux : se marier → DDV + droit viager logement', impact: 'Protection maximale', urgence: true },
                    { action: 'Si maintien concubinage : AV bénéficiaire < 152.5k', impact: 'Exo art. 990 I', urgence: false },
                    { action: 'SCI à démembrement croisé pour protéger le logement', impact: 'Survivant reste 0€ droits', urgence: false },
                    { action: 'Testament pour léguer la QD', impact: 'Mais taxé à 60%', urgence: false }
                ]
            });
        }

        if (unionType === 'pacs' && !hasTestament) {
            recs.push({
                objectif: 'Rédiger un TESTAMENT (obligatoire PACS !)',
                priorite: 'CRITIQUE',
                icon: 'fa-exclamation-circle', color: 'var(--accent-coral)',
                actions: [
                    { action: 'PACS = 0€ d\'héritage sans testament !', impact: 'Partenaire reçoit RIEN', urgence: true },
                    { action: 'Testament olographe (gratuit) ou notarié (136€)', impact: 'Protège le partenaire', urgence: true },
                    { action: 'Inscrire au FCDDV (18€)', impact: 'Garantit la découverte', urgence: false }
                ]
            });
        }

        if (unionType === 'mariage' && !hasDDV && nbEnfants > 0) {
            recs.push({
                objectif: 'Donation au dernier vivant (DDV)',
                priorite: 'HAUTE',
                icon: 'fa-ring', color: 'var(--accent-amber)',
                actions: [
                    { action: 'DDV chez notaire : ~140€', impact: 'Conjoint choisit entre 100% US / QD PP / mixte', urgence: false },
                    { action: '100% usufruit recommandé si > 60 ans', impact: 'Revenus + logement protégés', urgence: false },
                    { action: autresLit ? '⚠️ Enfants autre lit : DDV limitée à 25% PP' : 'Sans enfants autre lit : toutes options disponibles', impact: '', urgence: autresLit }
                ]
            });
        }

        // --- OPTIMISATION FISCALE ---
        if (patrimoine > 200000 && nbEnfants > 0) {
            var optActions = [];

            if (!hasAV) {
                optActions.push({ action: 'Ouvrir une AV : abat. 152 500€/bénéficiaire (art. 990 I)', impact: 'Hors succession', urgence: false });
            }

            if (age < 80) {
                var donFamTotal = 31865 * nbEnfants * (p.nbDonors || 1);
                optActions.push({ action: 'Don familial 31 865€ × ' + nbEnfants + ' enfant(s) = ' + fmt(donFamTotal), impact: 'Art. 790 G — cumulable', urgence: age >= 75 });
                if (age >= 75) urgences.push('⏰ Don familial : donateur ' + age + 'a → plus que ' + (80 - age) + ' an(s) avant la limite !');
            }

            if (patrimoine > 300000 && !hasSCI) {
                optActions.push({ action: 'Loger l\'immobilier locatif en SCI : décote 15%', impact: fmt(Math.round(patrimoine * 0.15 * 0.3)) + ' d\'économie potentielle', urgence: false });
            }

            if (patrimoine > 500000) {
                optActions.push({ action: 'Investir 5-10% en GFV/GFA/GFI : exonération 75%', impact: fmt(Math.round(patrimoine * 0.075 * 0.75)) + ' hors assiette', urgence: false });
            }

            if (hasPER && hasAV) {
                optActions.push({ action: '⚠️ PER + AV : abattement 152.5k PARTAGÉ (pas cumulé !)', impact: 'Vérifier la répartition', urgence: false });
            }

            if (optActions.length > 0) {
                recs.push({
                    objectif: 'Réduire les droits de succession',
                    priorite: 'HAUTE',
                    icon: 'fa-piggy-bank', color: 'var(--accent-green)',
                    actions: optActions
                });
            }
        }

        // --- ENFANTS AUTRE LIT ---
        if (autresLit) {
            recs.push({
                objectif: 'Protéger les enfants du premier lit',
                priorite: 'HAUTE',
                icon: 'fa-child', color: 'var(--accent-purple)',
                actions: [
                    { action: '⚠️ Communauté universelle + clause intégrale = action en retranchement', impact: 'Enfants 1er lit récupèrent leur réserve', urgence: true },
                    { action: 'DDV limitée à 25% PP avec enfants autre lit', impact: 'Art. 757 al. 2 CC', urgence: false },
                    { action: 'AV bénéficiaire enfants 1er lit (hors succession)', impact: 'Protection indépendante du conjoint', urgence: false },
                    { action: 'Donation-partage transgénérationnelle pour figer les valeurs', impact: 'Pas de réévaluation au décès', urgence: false }
                ]
            });
        }

        // --- INTERNATIONAL ---
        if (paysResidence !== 'FR') {
            recs.push({
                objectif: 'Sécuriser la succession internationale',
                priorite: 'HAUTE',
                icon: 'fa-globe', color: 'var(--accent-blue)',
                actions: [
                    { action: 'Testament avec option "loi française" (art. 22 UE 650/2012)', impact: 'Protège la réserve héréditaire', urgence: true },
                    { action: 'Certificat successoral européen (~120€)', impact: 'Reconnu dans tous les pays UE (sauf DK, IE)', urgence: false },
                    { action: 'Vérifier convention fiscale bilatérale', impact: 'Éviter double imposition', urgence: false }
                ]
            });
        }

        // --- URGENCES TEMPORELLES ---
        urgences.push('📅 Exonération logement 790 A bis : expire le 31/12/2026 — jusqu\'à 100k€/donateur');

        if (nbEnfants > 0 && patrimoine > 100000) {
            var anneesAvantRappel = 15;
            urgences.push('⏳ Abattements renouvelables tous les 15 ans — commencer le plus tôt possible');
        }

        return {
            recommandations: recs,
            urgences: urgences,
            nbActions: recs.reduce(function(sum, r) { return sum + r.actions.length; }, 0)
        };
    }

    // ============================================================
    // 4. CHECKLIST PERSONNALISÉE
    // ============================================================

    function genererChecklist(params) {
        var p = params || {};
        var unionType = p.unionType || 'mariage';
        var items = [];

        // Universal
        items.push({ done: !!p.hasTestament, label: 'Testament rédigé' + (unionType === 'pacs' ? ' (OBLIGATOIRE pour PACS !)' : ''), priorite: unionType === 'pacs' ? 'critique' : 'haute' });
        items.push({ done: !!p.hasAV, label: 'Assurance vie souscrite (abat. 152 500€/bén.)', priorite: 'haute' });
        items.push({ done: false, label: 'Clause bénéficiaire AV vérifiée + second rang', priorite: 'haute' });

        if (unionType === 'mariage') {
            items.push({ done: !!p.hasDDV, label: 'Donation au dernier vivant (~140€ notaire)', priorite: 'haute' });
            items.push({ done: false, label: 'Régime matrimonial adapté (vérifier avec notaire)', priorite: 'moyenne' });
        }

        if (unionType === 'concubinage') {
            items.push({ done: false, label: '⚠️ Étudier le passage au PACS ou mariage', priorite: 'critique' });
            items.push({ done: !!p.hasSCI, label: 'SCI à démembrement croisé pour le logement', priorite: 'haute' });
        }

        if (p.nbEnfants > 0 && (p.ageDonateur || 50) < 80) {
            items.push({ done: false, label: 'Don familial 31 865€ effectué (art. 790 G)', priorite: 'haute' });
            items.push({ done: false, label: 'Donation 100k€/enfant/parent planifiée', priorite: 'moyenne' });
        }

        if (p.patrimoine > 300000) {
            items.push({ done: !!p.hasSCI, label: 'Immobilier locatif logé en SCI (décote 15%)', priorite: 'moyenne' });
            items.push({ done: false, label: 'GFV/GFA/GFI envisagé (exo 75%)', priorite: 'basse' });
        }

        items.push({ done: false, label: 'Déclaration en ligne dons manuels (obligatoire 01/2026)', priorite: 'haute' });
        items.push({ done: false, label: 'Exo logement 790 A bis avant 31/12/2026', priorite: 'moyenne' });

        return { items: items, nbTodo: items.filter(function(i) { return !i.done; }).length };
    }

    // ============================================================
    // 5. RENDU — Panneau step 5
    // ============================================================

    function renderRecommendationsPanel() {
        var state = getState();
        if (!state) return;

        var existing = document.getElementById('strategy-recommendations-panel');
        if (existing) existing.remove();

        var F = SD._fiscal, pat = F.computePatrimoine();
        var bens = state.beneficiaries || [];
        var nbEnfants = bens.filter(function(b) { return b.lien === 'enfant'; }).length;
        var unionType = state._unionType || 'mariage';
        var autresLit = bens.some(function(b) { return b.isAutreLit; });
        var ageDon = 55;
        var donors = typeof FamilyGraph !== 'undefined' ? FamilyGraph.getDonors() : [];
        if (donors.length > 0 && donors[0].age) ageDon = donors[0].age;
        var hasAV = (state.financials || []).some(function(f) { return f.type === 'assurance_vie'; });
        var hasPER = (state.financials || []).some(function(f) { return f.type === 'per'; });
        var hasSCI = (state.immos || []).some(function(b) { return b.detention === 'sci_ir' || b.detention === 'sci_is'; });

        // Simuler changement union si pas marié
        var unionSim = null;
        if (unionType !== 'mariage') {
            var montantConj = Math.round(pat.actifNet * 0.25);
            var avConj = 0;
            (state.financials || []).forEach(function(f) { if (f.type === 'assurance_vie') avConj += (f.montant || 0); });
            unionSim = simulerChangementUnion({ patrimoine: pat.actifNet, montantConjoint: montantConj, ageDefunt: ageDon, nbEnfants: nbEnfants, hasEnfantsAutreLit: autresLit, montantAV: avConj });
        }

        // Recommandations
        var recs = genererRecommandations({
            unionType: unionType, nbEnfants: nbEnfants, hasEnfantsAutreLit: autresLit,
            patrimoine: pat.actifNet, ageDonateur: ageDon, hasAV: hasAV, hasPER: hasPER,
            hasSCI: hasSCI, hasDDV: state._hasDDV, hasTestament: state._hasTestament,
            nbDonors: state.mode === 'couple' ? 2 : 1, paysResidence: state._paysResidence || 'FR'
        });

        if (recs.recommandations.length === 0 && !unionSim) return;

        var html = '<div class="section-card" id="strategy-recommendations-panel" style="border-color:rgba(255,179,0,.25);margin-bottom:20px;">';
        html += '<div class="section-title"><i class="fas fa-compass" style="background:linear-gradient(135deg,rgba(255,179,0,.2),rgba(255,152,0,.1));color:var(--accent-amber);"></i> Stratégie & recommandations</div>';
        html += '<div class="section-subtitle">Actions concrètes pour optimiser votre transmission — par ordre de priorité</div>';

        // --- Comparatif unions (si pas marié) ---
        if (unionSim && unionType !== 'mariage') {
            var sc = unionSim.scenarios;
            html += '<div style="padding:16px;border-radius:12px;background:rgba(255,179,0,.06);border:1px solid rgba(255,179,0,.15);margin-bottom:16px;">';
            html += '<div style="font-size:.85rem;font-weight:700;margin-bottom:10px;"><i class="fas fa-exchange-alt" style="color:var(--accent-amber);margin-right:6px;"></i>Et si vous changiez de statut ?</div>';

            html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;">';
            html += '<thead><tr>';
            ['', 'Concubinage', 'PACS', 'Mariage'].forEach(function(h) {
                var style = h === '' ? 'text-align:left;' : 'text-align:center;';
                if (h.toLowerCase() === unionType) style += 'background:rgba(255,179,0,.08);font-weight:700;';
                html += '<th style="padding:8px;' + style + '">' + h + (h.toLowerCase() === unionType ? ' (actuel)' : '') + '</th>';
            });
            html += '</tr></thead><tbody>';

            var rows = [
                ['Droits conjoint', fmt(sc.concubinage.droitsTotal), fmt(sc.pacs.droitsTotal), fmt(sc.mariage.droitsTotal)],
                ['Exonéré', '❌ Non (60%)', '✅ Oui', '✅ Oui'],
                ['Héritage auto', '❌ Non', '❌ Non (testament !)', '✅ Oui'],
                ['DDV', '❌', '❌', autresLit ? '⚠️ 25% PP' : '✅ 100% US'],
                ['Droit logement', '❌ Aucun', '1 an', '✅ Viager'],
                ['AV', '152.5k exo', '✅ Exonérée', '✅ Exonérée']
            ];
            rows.forEach(function(row) {
                html += '<tr>';
                row.forEach(function(cell, i) {
                    var style = 'padding:6px 8px;border-bottom:1px solid rgba(198,134,66,.05);';
                    if (i === 0) style += 'font-weight:600;';
                    html += '<td style="' + style + '">' + cell + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';

            if (unionSim.economies.concubinage_vers_pacs > 0 && unionType === 'concubinage') {
                html += '<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(16,185,129,.08);font-size:.8rem;font-weight:600;color:var(--accent-green);text-align:center;">';
                html += '💡 Passage PACS : économie ' + fmt(unionSim.economies.concubinage_vers_pacs) + ' | Mariage : économie ' + fmt(unionSim.economies.concubinage_vers_mariage) + ' + DDV + droit viager';
                html += '</div>';
            }
            html += '</div>';
        }

        // --- Recommandations par objectif ---
        recs.recommandations.forEach(function(rec) {
            var prioColor = rec.priorite === 'CRITIQUE' ? 'var(--accent-coral)' : rec.priorite === 'HAUTE' ? 'var(--accent-amber)' : 'var(--accent-blue)';
            html += '<div style="padding:14px 16px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.1);margin-bottom:12px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
            html += '<div style="display:flex;align-items:center;gap:8px;"><i class="fas ' + rec.icon + '" style="color:' + rec.color + ';"></i>';
            html += '<strong style="font-size:.85rem;">' + rec.objectif + '</strong></div>';
            html += '<span style="padding:2px 10px;border-radius:12px;font-size:.68rem;font-weight:700;color:white;background:' + prioColor + ';">' + rec.priorite + '</span>';
            html += '</div>';

            rec.actions.forEach(function(a) {
                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;font-size:.78rem;">';
                html += '<span style="color:' + (a.urgence ? 'var(--accent-coral)' : 'var(--accent-green)') + ';font-size:.7rem;margin-top:2px;">' + (a.urgence ? '🔴' : '🟢') + '</span>';
                html += '<div><span style="color:var(--text-primary);">' + a.action + '</span>';
                if (a.impact) html += '<span style="color:var(--text-muted);font-size:.72rem;"> → ' + a.impact + '</span>';
                html += '</div></div>';
            });
            html += '</div>';
        });

        // --- Urgences ---
        if (recs.urgences.length > 0) {
            html += '<div style="padding:12px 16px;border-radius:10px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.12);margin-bottom:12px;">';
            html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:6px;"><i class="fas fa-clock" style="margin-right:6px;"></i>Échéances à surveiller</div>';
            recs.urgences.forEach(function(u) {
                html += '<div style="font-size:.75rem;color:var(--text-secondary);padding:3px 0;">' + u + '</div>';
            });
            html += '</div>';
        }

        html += '</div>';

        // Injecter après PER panel ou avant fiscal-optimizations
        var anchor = document.getElementById('per-av-clause-panel') || document.getElementById('fiscal-optimizations-panel') || document.getElementById('results-warnings');
        if (anchor) anchor.insertAdjacentHTML('afterend', html);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function getState() { return (typeof SD !== 'undefined' && SD._getState) ? SD._getState() : null; }
    function fmt(n) {
        if (typeof SD !== 'undefined' && SD._fiscal && SD._fiscal.fmt) return SD._fiscal.fmt(n);
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    // ============================================================
    // INIT
    // ============================================================

    function init() {
        if (typeof SD === 'undefined') return;
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            _origCalc.call(SD);
            setTimeout(renderRecommendationsPanel, 600);
        };
        console.log('[StrategyRecommendations v1] Loaded — objectifs, unions, régimes, checklist');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 800); });
    else setTimeout(init, 800);

    return {
        simulerChangementUnion: simulerChangementUnion,
        simulerChangementRegime: simulerChangementRegime,
        genererRecommandations: genererRecommandations,
        genererChecklist: genererChecklist
    };
})();
