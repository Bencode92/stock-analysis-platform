/**
 * FamilyGraph.js — Moteur de graphe familial pour succession/donation
 * 
 * Relations simples → liens fiscaux automatiques :
 *   addPerson("Marie-Jo", 60)
 *   addRelation('parent', marieJo, catherine)   // Marie-Jo est parent de Catherine
 *   addRelation('spouse', catherine, christophe) // Catherine mariée à Christophe
 * 
 * → computeFiscalLien(marieJo, baptiste) = 'petit_enfant' (31 865€)
 */
const FamilyGraph = (function() {
    'use strict';

    let persons = [];
    let relations = [];
    let idCounter = 0;

    // ============================================================
    // 1. PERSON CRUD
    // ============================================================
    function addPerson(nom, age, patrimoine, regime) {
        const id = idCounter++;
        const p = {
            id, nom: nom || `Personne ${id + 1}`,
            age: age || 0,
            patrimoine: patrimoine || 0,
            regime: regime || 'communaute',
            isDonor: false,
            isBeneficiary: false,
            isDeceased: false
        };
        persons.push(p);
        return p;
    }

    function removePerson(id) {
        persons = persons.filter(p => p.id !== +id);
        relations = relations.filter(r => r.from !== +id && r.to !== +id);
    }

    function updatePerson(id, field, value) {
        const p = persons.find(p => p.id === +id);
        if (!p) return;
        if (field === 'age' || field === 'patrimoine') p[field] = +value || 0;
        else p[field] = value;
    }

    function getPerson(id) { return persons.find(p => p.id === +id); }
    function getPersons() { return [...persons]; }
    function getDonors() { return persons.filter(p => p.isDonor); }
    function getBeneficiaries() { return persons.filter(p => p.isBeneficiary); }

    function toggleRole(id, role, val) {
        const p = getPerson(id);
        if (!p) return;
        if (role === 'donor') p.isDonor = !!val;
        if (role === 'beneficiary') p.isBeneficiary = !!val;
    }

    // ============================================================
    // 2. RELATIONS
    // ============================================================
    // type: 'parent' (from is parent OF to) | 'spouse' (bidirectional)
    function addRelation(type, fromId, toId) {
        const f = +fromId, t = +toId;
        if (f === t) return;
        if (type === 'spouse') {
            // Only 1 spouse per person
            relations = relations.filter(r => !(r.type === 'spouse' && (r.from === f || r.to === f)));
            relations = relations.filter(r => !(r.type === 'spouse' && (r.from === t || r.to === t)));
        }
        if (!relations.some(r => r.type === type && r.from === f && r.to === t)) {
            relations.push({ type, from: f, to: t });
        }
    }

    function removeRelation(type, fromId, toId) {
        relations = relations.filter(r => !(r.type === type && r.from === +fromId && r.to === +toId));
        // For spouse, also check reverse
        if (type === 'spouse') {
            relations = relations.filter(r => !(r.type === 'spouse' && r.from === +toId && r.to === +fromId));
        }
    }

    function getRelations() { return [...relations]; }

    // ============================================================
    // 3. GRAPH TRAVERSAL
    // ============================================================
    function parents(pid) {
        return relations.filter(r => r.type === 'parent' && r.to === +pid).map(r => getPerson(r.from)).filter(Boolean);
    }

    function children(pid) {
        return relations.filter(r => r.type === 'parent' && r.from === +pid).map(r => getPerson(r.to)).filter(Boolean);
    }

    function spouse(pid) {
        const r = relations.find(r => r.type === 'spouse' && (r.from === +pid || r.to === +pid));
        if (!r) return null;
        return getPerson(r.from === +pid ? r.to : r.from);
    }

    function siblings(pid) {
        const ps = parents(pid);
        const ids = new Set();
        ps.forEach(p => children(p.id).forEach(c => { if (c.id !== +pid) ids.add(c.id); }));
        return [...ids].map(id => getPerson(id)).filter(Boolean);
    }

    function grandchildren(pid) {
        const gc = [];
        children(pid).forEach(c => children(c.id).forEach(gc2 => gc.push(gc2)));
        return gc;
    }

    function grandparents(pid) {
        const gp = [];
        parents(pid).forEach(p => parents(p.id).forEach(gp2 => gp.push(gp2)));
        return gp;
    }

    function greatGrandchildren(pid) {
        const ggc = [];
        grandchildren(pid).forEach(gc => children(gc.id).forEach(ggc2 => ggc.push(ggc2)));
        return ggc;
    }

    function unclesAunts(pid) {
        // Parents' siblings + their spouses
        const result = [];
        parents(pid).forEach(p => {
            siblings(p.id).forEach(s => {
                result.push(s);
                const sp = spouse(s.id);
                if (sp && !result.some(r => r.id === sp.id)) result.push(sp);
            });
        });
        return result;
    }

    function nephewsNieces(pid) {
        // Siblings' children + spouse's siblings' children
        const result = [];
        const addChildren = (arr) => arr.forEach(s => children(s.id).forEach(c => {
            if (!result.some(r => r.id === c.id)) result.push(c);
        }));
        addChildren(siblings(pid));
        const sp = spouse(pid);
        if (sp) addChildren(siblings(sp.id));
        return result;
    }

    // ============================================================
    // 4. FISCAL LIEN COMPUTATION
    // ============================================================
    function computeFiscalLien(fromId, toId) {
        const f = +fromId, t = +toId;
        if (f === t) return 'self';

        // Direct child / parent
        if (children(f).some(c => c.id === t)) return 'enfant';
        if (parents(f).some(p => p.id === t)) return 'enfant'; // LD ascendante

        // Spouse
        const sp = spouse(f);
        if (sp && sp.id === t) return 'conjoint_pacs_donation';

        // Grandchild / grandparent
        if (grandchildren(f).some(gc => gc.id === t)) return 'petit_enfant';
        if (grandparents(f).some(gp => gp.id === t)) return 'petit_enfant';

        // Great-grandchild
        if (greatGrandchildren(f).some(ggc => ggc.id === t)) return 'arriere_petit_enfant';

        // Sibling
        if (siblings(f).some(s => s.id === t)) return 'frere_soeur';

        // Nephew/niece
        if (nephewsNieces(f).some(n => n.id === t)) return 'neveu_niece';
        // Uncle/aunt (reverse of nephew)
        if (unclesAunts(f).some(u => u.id === t)) return 'neveu_niece';

        return 'tiers';
    }

    // Build full matrix donateurs × bénéficiaires
    function buildMatrix() {
        const ds = getDonors();
        const bs = getBeneficiaries();
        return ds.map(d => ({
            donor: d,
            links: bs.map(b => ({
                beneficiary: b,
                lien: computeFiscalLien(d.id, b.id)
            }))
        }));
    }

    // ============================================================
    // 5. TREE LEVELS — for visual rendering
    // ============================================================
    function computeLevels() {
        const levels = {};
        // Roots = persons with no parents declared
        const roots = persons.filter(p => parents(p.id).length === 0);

        function walk(pid, depth) {
            if (levels[pid] !== undefined && levels[pid] <= depth) return;
            levels[pid] = depth;
            // Spouse at same level
            const sp = spouse(pid);
            if (sp && (levels[sp.id] === undefined || levels[sp.id] > depth)) {
                levels[sp.id] = depth;
            }
            children(pid).forEach(c => walk(c.id, depth + 1));
        }

        roots.forEach(r => walk(r.id, 0));

        // Any unvisited persons at max+1
        const maxLvl = Math.max(0, ...Object.values(levels));
        persons.forEach(p => { if (levels[p.id] === undefined) levels[p.id] = maxLvl + 1; });

        return levels;
    }

    // ============================================================
    // 6. SYNC to PathOptimizer — bridge old system
    // ============================================================
    function syncToPathOptimizer() {
        if (typeof PathOptimizer === 'undefined') return;

        const ds = getDonors();
        const bs = getBeneficiaries();

        // Clear old data
        const oldDonors = PathOptimizer.getDonors ? PathOptimizer.getDonors() : [];
        oldDonors.forEach(d => { if (PathOptimizer.removeDonor) PathOptimizer.removeDonor(d.id); });

        // Recreate donors with graph-computed liens
        ds.forEach(d => {
            const role = inferRole(d.id);
            const newId = PathOptimizer.addDonor(role, d.nom, d.age, d.patrimoine, d.regime);
            // Set linkedBens based on graph
            const donor = PathOptimizer.getDonors().find(dd => dd.id === newId);
            if (donor) {
                donor.linkedBens = {};
                bs.forEach(b => {
                    const lien = computeFiscalLien(d.id, b.id);
                    donor.linkedBens[b.id] = (lien !== 'tiers');
                });
                // Map original person id for later reference
                donor._graphId = d.id;
            }
        });

        // Update beneficiaries in SD state
        if (typeof SD !== 'undefined' && SD._getState) {
            const state = SD._getState();
            state.beneficiaries = bs.map(b => ({
                id: b.id,
                prenom: b.nom,
                age: b.age,
                lien: inferBenLien(b.id),
                generation: inferGeneration(b.id)
            }));
        }
    }

    // Infer old-style "role" from graph position
    function inferRole(personId) {
        const bs = getBeneficiaries();
        // If has grandchildren in bens → grand_parent
        if (bs.some(b => grandchildren(personId).some(gc => gc.id === b.id))) return 'grand_parent';
        if (bs.some(b => greatGrandchildren(personId).some(ggc => ggc.id === b.id))) return 'arr_grand_parent';
        // If has children in bens → parent
        if (bs.some(b => children(personId).some(c => c.id === b.id))) return 'parent';
        // If spouse of someone who has children in bens → conjoint
        const sp = spouse(personId);
        if (sp && bs.some(b => children(sp.id).some(c => c.id === b.id))) return 'conjoint';
        // If nephews/nieces in bens → oncle_tante
        if (bs.some(b => nephewsNieces(personId).some(n => n.id === b.id))) return 'oncle_tante';
        return 'tiers';
    }

    function inferBenLien(personId) {
        const ds = getDonors();
        // If has parents in donors → enfant
        if (ds.some(d => parents(personId).some(p => p.id === d.id))) return 'enfant';
        if (ds.some(d => grandparents(personId).some(gp => gp.id === d.id))) return 'petit_enfant';
        return 'enfant';
    }

    function inferGeneration(personId) {
        const ds = getDonors();
        if (ds.some(d => grandparents(personId).some(gp => gp.id === d.id))) return 'petit_enfant';
        return 'enfant';
    }

    // ============================================================
    // 7. SERIALIZATION
    // ============================================================
    function exportData() {
        return { persons: persons.map(p => ({...p})), relations: [...relations], idCounter };
    }

    function importData(data) {
        persons = (data.persons || []).map(p => ({...p}));
        relations = data.relations || [];
        idCounter = data.idCounter || persons.length;
    }

    function reset() {
        persons = [];
        relations = [];
        idCounter = 0;
    }

    // ============================================================
    // EXPORTS
    // ============================================================
    return {
        // Persons
        addPerson, removePerson, updatePerson, getPerson, getPersons,
        getDonors, getBeneficiaries, toggleRole,
        // Relations
        addRelation, removeRelation, getRelations,
        // Graph queries
        parents, children, spouse, siblings,
        grandchildren, grandparents, greatGrandchildren,
        unclesAunts, nephewsNieces,
        // Fiscal
        computeFiscalLien, buildMatrix,
        // Visual
        computeLevels,
        // Bridge
        syncToPathOptimizer, inferRole,
        // Data
        exportData, importData, reset
    };
})();

/**
 * ================================================================
 * OPTIMISATEUR SUCCESSION & DONATION — TradePulse
 * ================================================================
 * Moteur de calcul + gestion UI du wizard 5 étapes
 * Barèmes 2026 (art. 669, 777, 779, 790 A bis, 990 I, 757 B CGI)
 * Gelés jusqu'en 2028 (PLF 2026). Exonération temporaire logement neuf/réno.
 * Déclaration en ligne obligatoire dons manuels depuis 01/01/2026.
 * 
 * Architecture :
 *   1. FISCAL — Barèmes et constantes fiscales
 *   2. STATE  — État global de l'application
 *   3. NAV    — Navigation wizard (stepper)
 *   4. UI     — Génération HTML dynamique (bénéficiaires, biens, etc.)
 *   5. CALC   — Moteur de calcul DMTG / démembrement / AV / PV
 *   6. RENDER — Affichage des résultats (tableau, chart, stratégie)
 * ================================================================
 */

const SD = (() => {

    // ============================================================
    // 1. FISCAL — Loaded from data/fiscal-donation-2026.json + fiscal-succession-2026.json
    // ============================================================
    let FISCAL = null;
    const FISCAL_FALLBACK = {
        abattements: {
            enfant: 100000, petit_enfant: 31865, arriere_petit_enfant: 5310,
            conjoint_pacs_donation: 80724, conjoint_pacs_succession: Infinity,
            frere_soeur: 15932, neveu_niece: 7967, tiers: 1594,
            handicap: 159325, don_familial_argent: 31865, rappel_fiscal_ans: 15
        },
        bareme_ligne_directe: [
            { max: 8072, taux: 0.05 }, { max: 12109, taux: 0.10 },
            { max: 15932, taux: 0.15 }, { max: 552324, taux: 0.20 },
            { max: 902838, taux: 0.30 }, { max: 1805677, taux: 0.40 },
            { max: Infinity, taux: 0.45 }
        ],
        bareme_frere_soeur: [ { max: 24430, taux: 0.35 }, { max: Infinity, taux: 0.45 } ],
        bareme_neveu_niece: [{ max: Infinity, taux: 0.55 }],
        bareme_tiers: [{ max: Infinity, taux: 0.60 }],
        demembrement: [
            { maxAge: 20, np: 0.10 }, { maxAge: 30, np: 0.20 }, { maxAge: 40, np: 0.30 },
            { maxAge: 50, np: 0.40 }, { maxAge: 60, np: 0.50 }, { maxAge: 70, np: 0.60 },
            { maxAge: 80, np: 0.70 }, { maxAge: 90, np: 0.80 }, { maxAge: Infinity, np: 0.90 }
        ],
        av990I: { abattement: 152500, taux1: 0.20, seuil2: 700000, taux2: 0.3125 },
        av757B: { abattementGlobal: 30500 },
        primesExagSeuil: 0.35, pvIR: 0.19, pvPS: 0.172, lmnpAmortDate: '2025-02-15',
        sciMeubleTolerance: 0.10, fraisNotairePct: 0.018, fraisNotaireSuccPct: 0.012,
        fraisStructure: { sci_ir: 1100, sci_is: 2300, sarl: 3000, creation: 2000 },
        isReduit: { taux: 0.15, plafond: 42500 }, isNormal: 0.25, ssiMinimum: 1100,
        dutreilAbat: 0.75, dutreilReduction: 0.50,
        exoLogement: { maxParDonateur: 100000, maxParDonataire: 300000,
            delaiUtilisationMois: 6, dureeConservationAns: 5, dateFin: '2026-12-31' }
    };

    // Helper: convert JSON bareme tranches {de,a,taux} → engine format {max,taux}
    function parseTranches(tranches) {
        return tranches.map(t => ({ max: t.a === null ? Infinity : t.a, taux: t.taux }));
    }

    async function loadFiscalData() {
        try {
            const [donResp, sucResp] = await Promise.all([
                fetch('data/fiscal-donation-2026.json'),
                fetch('data/fiscal-succession-2026.json')
            ]);
            const don = await donResp.json();
            const suc = await sucResp.json();

            // Merge: donation has most data, succession adds AV + RP abattement
            const abat = {};
            for (const [k, v] of Object.entries(don.abattements)) {
                abat[k === 'conjoint_pacs' ? 'conjoint_pacs_donation' : k] = v.montant;
            }
            abat.conjoint_pacs_succession = Infinity; // exonéré
            abat.don_familial_argent = don.abattements.don_familial_argent?.montant || 31865;
            abat.rappel_fiscal_ans = don.delai_rappel_fiscal_ans || 15;

            FISCAL = {
                abattements: abat,

                // Barèmes donation
                bareme_ligne_directe: parseTranches(don.baremes.ligne_directe.tranches),
                bareme_epoux_pacs: parseTranches(don.baremes.entre_epoux_pacs.tranches),
                bareme_frere_soeur: parseTranches(don.baremes.frere_soeur.tranches),
                bareme_neveu_niece: parseTranches(don.baremes.neveu_niece.tranches),
                bareme_tiers: parseTranches(don.baremes.tiers.tranches),

                // Démembrement art. 669
                demembrement: don.demembrement_669.viager.map(t => ({ maxAge: t.age_max, np: t.nue_propriete })),
                demembrement_temporaire: don.demembrement_669.temporaire,

                // AV (from succession file)
                av990I: {
                    abattement: suc.assurance_vie.art_990I.abattement_par_beneficiaire,
                    taux1: suc.assurance_vie.art_990I.taux_tranche1,
                    seuil2: suc.assurance_vie.art_990I.seuil_tranche2,
                    taux2: suc.assurance_vie.art_990I.taux_tranche2
                },
                av757B: { abattementGlobal: suc.assurance_vie.art_757B.abattement_global },
                primesExagSeuil: suc.assurance_vie.primes_exagerees_seuil_alerte || 0.35,

                // PV immobilière
                pvIR: don.plus_value_immobiliere.taux_ir,
                pvPS: don.plus_value_immobiliere.taux_ps,
                pvAbattementIR: don.plus_value_immobiliere.abattement_ir_duree,
                pvAbattementPS: don.plus_value_immobiliere.abattement_ps_duree,
                pvSurtaxe: don.plus_value_immobiliere.surtaxe_pv_nette,
                pvExonerations: don.plus_value_immobiliere.exonerations,
                lmnpAmortDate: don.plus_value_immobiliere.lmnp_amort_reintegration.date_application,

                // Structures
                sciMeubleTolerance: don.sci_meuble_tolerance.seuil_pct,
                fraisNotairePct: don.frais_notaire_donation.estimation_pct_global,
                fraisNotaireSuccPct: suc.frais_notaire_pct || 0.012,
                fraisStructure: {
                    sci_ir: don.frais_structure_annuels.sci_ir.total,
                    sci_is: don.frais_structure_annuels.sci_is.total,
                    sarl: don.frais_structure_annuels.sarl_famille.total,
                    creation: don.frais_structure_annuels.creation_sci
                },
                isReduit: don.is_2026.taux_reduit,
                isNormal: don.is_2026.taux_normal,
                ssiMinimum: don.cotisations_ssi_gerant_majoritaire.minimum_annuel,

                // Dutreil
                dutreilAbat: don.dutreil.abattement,
                dutreilReduction: don.dutreil.reduction_donation_pp_avant_70,

                // 790 A bis
                exoLogement: {
                    maxParDonateur: don.exoneration_temporaire_logement.montant_max_par_donateur,
                    maxParDonataire: don.exoneration_temporaire_logement.montant_max_par_donataire,
                    delaiUtilisationMois: don.exoneration_temporaire_logement.delai_utilisation_mois,
                    dureeConservationAns: don.exoneration_temporaire_logement.duree_conservation_ans,
                    dateFin: don.exoneration_temporaire_logement.periode.fin,
                    exclusions: don.exoneration_temporaire_logement.exclusions
                },

                // Succession specifics
                abattementRP: suc.abattement_rp,
                passifDeductible: suc.passif_deductible,

                // Raw data for detailed display
                _raw: { donation: don, succession: suc }
            };

            console.log('[FISCAL] Loaded from fiscal-donation-2026.json v' + don.version + ' + fiscal-succession-2026.json v' + suc.version);
        } catch (e) {
            console.warn('[FISCAL] JSON files not found, using inline fallback', e);
            FISCAL = FISCAL_FALLBACK;
        }
        window.__FISCAL__ = FISCAL;
        if (typeof PathOptimizer !== 'undefined' && PathOptimizer.setFiscal) PathOptimizer.setFiscal(FISCAL);
    }
    loadFiscalData();


    // ============================================================
    // 2. STATE — État global
    // ============================================================
    let currentStep = 1;
    let benIdCounter = 0;
    let immoIdCounter = 0;
    let finIdCounter = 0;
    let proIdCounter = 0;
    let debtIdCounter = 0;

    const state = {
        mode: 'solo',
        donor1: { age: null, status: 'celibataire' },
        donor2: { age: null },
        regime: 'communaute_acquets',
        ddv: false,
        preciput: false,
        beneficiaries: [],
        detailMode: 'simplifie',
        patrimoine: { total: 0, rp: 0, dettes: 0, type: 'financier' },
        immo: [],
        finance: [],
        pro: [],
        debts: [],
        operation: 'donation',
        donationType: 'donation_partage',
        demembrement: false,
        usufruit: 'viager',
        objectives: { minimiser: true, revenus: false, conjoint: false, vendre: false },
        vente: { prix: 0, horizon: 5 },
        exoLogement: { active: false, objet: 'acquisition_neuf', montant: 0 }
    };

    // ============================================================
    // 3. NAV — Navigation wizard
    // ============================================================
    // === FAMILY VALIDATION + SMART QUESTIONS ===
    function buildFamilyTree() {
        const donors = typeof PathOptimizer !== 'undefined' ? PathOptimizer.getDonors() : [];
        const bens = state.beneficiaries;
        const container = el('family-tree-container');
        if (!container) return;

        if (donors.length === 0 && bens.length === 0) {
            container.style.display = 'block';
            container.innerHTML = '<div class="section-card" style="text-align:center;padding:32px;"><i class="fas fa-users" style="font-size:2rem;color:var(--text-muted);"></i><div style="margin-top:12px;color:var(--text-muted);">Ajoutez des donateurs et bénéficiaires pour voir l\'arbre.</div></div>';
            return;
        }

        const fmt = v => new Intl.NumberFormat('fr-FR').format(v) + '€';
        const PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;

        // Classify donors by level
        const levels = { arr_grand_parent: 0, grand_parent: 1, parent: 2, conjoint: 2, oncle_tante: 2, tiers: 2 };
        const donorsByLevel = {};
        donors.forEach(d => {
            const lvl = levels[d.role] ?? 2;
            if (!donorsByLevel[lvl]) donorsByLevel[lvl] = [];
            donorsByLevel[lvl].push(d);
        });

        // Build edges: each donor → each beneficiary
        const edges = [];
        donors.forEach(d => {
            bens.forEach(b => {
                const lien = PO ? PO.getEffectiveLien(d.id, b.id, d.role, b.lien) : 'tiers';
                if (lien === 'aucun') return;
                const donEntry = d.donationsParBen.find(e => +e.benId === b.id);
                const donne = donEntry ? donEntry.montant : 0;
                const dateStr = donEntry?.date || null;
                const inRappel = !dateStr || (PO && typeof PO.isDonationInRappel === 'function' ? PO.isDonationInRappel(dateStr) : true);
                const effective = inRappel ? donne : 0;
                const abat = FISCAL ? (FISCAL.abattements[lien] || FISCAL.abattements.tiers) : 1594;
                const restant = Math.max(0, abat - effective);
                const pctUsed = abat > 0 ? Math.min(100, (effective / abat) * 100) : 100;
                edges.push({ from: d, to: b, lien, abat, donne, effective, restant, pctUsed, dateStr, inRappel, type: 'direct' });
            });
        });

        // Inter-donor edges
        const interEdges = [];
        donors.forEach(d => {
            donors.forEach(od => {
                if (d.id >= od.id) return;
                const lien = PO ? PO.getEffectiveLien(d.id, od.id, d.role, od.role) : 'tiers';
                if (lien !== 'tiers' && lien !== 'aucun') {
                    interEdges.push({ d1: d, d2: od, lien });
                }
            });
        });

        // Entourage-based indirect paths
        const indirectEdges = [];
        donors.forEach(d => {
            (d.entourage || []).filter(e => e.nom && e.nom.trim()).forEach(e => {
                bens.forEach(b => {
                    indirectEdges.push({ from: d, via: e, to: b });
                });
            });
        });

        // === QUALITY CHECKS ===
        const checks = [];
        checks.push({ label: 'Donateurs', ok: donors.length > 0, critical: true, detail: donors.length > 0 ? donors.length + ' donateur(s)' : 'Aucun' });
        checks.push({ label: 'Bénéficiaires', ok: bens.length > 0, critical: true, detail: bens.length > 0 ? bens.length + ' bénéf.' : 'Aucun' });
        checks.push({ label: 'Âges', ok: donors.every(d => d.age > 0), critical: true, detail: donors.every(d => d.age > 0) ? 'OK' : 'Manquant(s)' });
        const donsWithAmount = donors.flatMap(d => d.donationsParBen.filter(e => e.montant > 0));
        const hasDates = donsWithAmount.length === 0 || donsWithAmount.every(e => e.date);
        checks.push({ label: 'Dates', ok: hasDates, critical: false, detail: donsWithAmount.length === 0 ? 'Aucune don.' : hasDates ? 'OK' : donsWithAmount.filter(e=>!e.date).length + ' sans date' });
        const hasConj = donors.some(d => d.conjointId && d.conjointId !== 'none') || donors.some(d => d.role === 'conjoint');
        checks.push({ label: 'Conjoint', ok: hasConj || donors.length <= 1, critical: false, detail: hasConj ? 'OK' : 'Non renseigné' });

        // === RENDER ===
        let html = '<div class="section-card" style="margin-top:16px;padding:20px;">';

        // Quality bar
        const passed = checks.filter(c => c.ok).length;
        const total = checks.length;
        html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
            ${checks.map(c => {
                const clr = c.ok ? '#2e7d32' : c.critical ? '#ff6b6b' : '#ffb74d';
                return `<span style="font-size:.62rem;padding:4px 10px;border-radius:20px;background:${clr}15;border:1px solid ${clr}40;color:${clr};font-weight:600;">${c.ok ? '✓' : c.critical ? '✗' : '!'} ${c.label}: ${c.detail}</span>`;
            }).join('')}
        </div>`;

        // === TREE VISUAL ===
        html += '<div style="position:relative;overflow-x:auto;">';

        // Render node helper
        function nodeHtml(person, role, isdonor) {
            const age = person.age ? `, ${person.age}a` : '';
            const pat = isdonor && person.patrimoine ? `<div style="font-size:.55rem;color:var(--text-muted);">${fmt(person.patrimoine)}</div>` : '';
            const roleLabel = formatRole(role);
            const bgColor = isdonor ? 'linear-gradient(135deg, rgba(198,134,66,.12), rgba(198,134,66,.06))' : 'linear-gradient(135deg, rgba(46,125,50,.12), rgba(46,125,50,.06))';
            const borderColor = isdonor ? 'rgba(198,134,66,.3)' : 'rgba(46,125,50,.3)';
            const iconColor = isdonor ? 'var(--primary-color)' : 'var(--accent-green)';
            return `<div style="display:inline-flex;flex-direction:column;align-items:center;padding:10px 14px;border-radius:10px;background:${bgColor};border:1.5px solid ${borderColor};min-width:100px;text-align:center;">
                <div style="font-size:.78rem;font-weight:700;color:var(--text-primary);">${person.prenom || person.nom || '?'}</div>
                <div style="font-size:.58rem;color:${iconColor};font-weight:600;">${roleLabel}${age}</div>
                ${pat}
            </div>`;
        }

        // Arrow/edge helper
        function edgeHtml(edge) {
            const pct = edge.pctUsed;
            const barColor = pct > 80 ? '#ff6b6b' : pct > 50 ? '#ffb74d' : '#2e7d32';
            const lienLabel = formatLienShort(edge.lien);
            const dateTag = edge.donne > 0 ? (edge.dateStr
                ? (edge.inRappel ? `<span style="color:#ff6b6b;">⏳${edge.dateStr.slice(0,4)}</span>` : `<span style="color:#2e7d32;">✅${edge.dateStr.slice(0,4)}</span>`)
                : '<span style="color:#ffb74d;">📅?</span>') : '';
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0;">
                <div style="width:2px;height:12px;background:${barColor};"></div>
                <div style="font-size:.58rem;font-weight:600;color:${barColor};white-space:nowrap;">${lienLabel}</div>
                <div style="width:60px;height:4px;border-radius:2px;background:rgba(198,134,66,.1);overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;"></div>
                </div>
                <div style="font-size:.52rem;color:var(--text-muted);">
                    ${edge.donne > 0 ? `<span style="color:${barColor};">${fmt(edge.donne)}</span> / ` : ''}${fmt(edge.abat)} ${dateTag}
                </div>
                <div style="width:2px;height:12px;background:${barColor};"></div>
                <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${barColor};"></div>
            </div>`;
        }

        // Group by level and render
        const sortedLevels = Object.keys(donorsByLevel).sort((a,b) => +a - +b);

        sortedLevels.forEach((lvl, li) => {
            const lvlDonors = donorsByLevel[lvl];

            // Donor row
            html += `<div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:4px;">`;
            lvlDonors.forEach(d => {
                html += nodeHtml(d, d.role, true);
            });
            html += '</div>';

            // Edges from this level to beneficiaries
            const lvlEdges = edges.filter(e => lvlDonors.some(d => d.id === e.from.id));
            if (lvlEdges.length > 0) {
                html += `<div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">`;
                // Group by beneficiary to align columns
                bens.forEach(b => {
                    const benEdges = lvlEdges.filter(e => e.to.id === b.id);
                    if (benEdges.length === 0) {
                        html += `<div style="width:100px;"></div>`;
                        return;
                    }
                    html += '<div style="display:flex;gap:8px;justify-content:center;">';
                    benEdges.forEach(e => {
                        html += `<div style="display:flex;flex-direction:column;align-items:center;">
                            <div style="font-size:.5rem;color:var(--text-muted);margin-bottom:2px;">${e.from.nom}</div>
                            ${edgeHtml(e)}
                        </div>`;
                    });
                    html += '</div>';
                });
                html += '</div>';
            }

            // Inter-donor edges at this level
            const lvlInter = interEdges.filter(ie => lvlDonors.some(d => d.id === ie.d1.id || d.id === ie.d2.id));
            if (lvlInter.length > 0) {
                html += `<div style="display:flex;justify-content:center;gap:12px;margin:4px 0;">`;
                lvlInter.forEach(ie => {
                    html += `<span style="font-size:.55rem;padding:3px 8px;border-radius:12px;background:rgba(198,134,66,.08);border:1px dashed rgba(198,134,66,.2);color:var(--text-muted);">↔ ${ie.d1.nom} — ${ie.d2.nom} : ${formatLienShort(ie.lien)}</span>`;
                });
                html += '</div>';
            }
        });

        // Beneficiary row
        html += `<div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-top:4px;">`;
        bens.forEach(b => {
            html += nodeHtml(b, b.lien || 'enfant', false);
        });
        html += '</div>';

        // Indirect paths summary
        const entourageMembers = donors.flatMap(d => (d.entourage || []).filter(e => e.nom && e.nom.trim()).map(e => ({ ...e, donorNom: d.nom })));
        if (entourageMembers.length > 0) {
            html += `<div style="margin-top:16px;padding:12px;border-radius:8px;background:rgba(198,134,66,.04);border:1px dashed rgba(198,134,66,.15);">
                <div style="font-size:.72rem;font-weight:700;color:var(--primary-color);margin-bottom:6px;"><i class="fas fa-route"></i> Chemins indirects via entourage</div>`;
            entourageMembers.forEach(e => {
                html += `<div style="font-size:.62rem;color:var(--text-secondary);padding:2px 0;">
                    ${e.donorNom} → <strong>${e.nom}</strong> (${formatLienShort(e.lien)}) → bénéficiaires
                </div>`;
            });
            html += '</div>';
        }

        html += '</div>'; // close relative

        // Suggestions
        const questions = [];
        donors.forEach(d => {
            const otherIsConjoint = donors.some(od => od.id !== d.id && od.role === 'conjoint');
            const hasEntConj = d.conjointId && d.conjointId !== 'none';
            if (!otherIsConjoint && !hasEntConj && d.role !== 'conjoint') {
                questions.push({ icon: '💍', text: `${d.nom} : conjoint ?`, severity: 'info' });
            }
            const noDateDons = (d.donationsParBen || []).filter(e => e.montant > 0 && !e.date);
            if (noDateDons.length > 0) {
                questions.push({ icon: '📅', text: `${d.nom} : ${noDateDons.length} donation(s) sans date`, severity: 'warn' });
            }
        });
        bens.forEach(b => {
            const linked = donors.some(d => {
                const lien = PO ? PO.getEffectiveLien(d.id, b.id, d.role, b.lien) : 'tiers';
                return lien !== 'aucun' && lien !== 'tiers';
            });
            if (!linked) questions.push({ icon: '⚠️', text: `${b.prenom} : aucun lien fiscal`, severity: 'error' });
        });

        if (questions.length > 0) {
            const sorted = questions.sort((a,b) => ({ error:0, warn:1, info:2 }[a.severity]||3) - ({ error:0, warn:1, info:2 }[b.severity]||3)).slice(0, 4);
            html += `<div style="margin-top:14px;"><div style="font-size:.72rem;font-weight:700;color:var(--accent-amber);margin-bottom:6px;"><i class="fas fa-lightbulb"></i> Suggestions</div>`;
            sorted.forEach(q => {
                const bg = q.severity === 'error' ? 'rgba(255,107,107,.08)' : q.severity === 'warn' ? 'rgba(255,183,77,.08)' : 'rgba(198,134,66,.04)';
                const border = q.severity === 'error' ? 'rgba(255,107,107,.2)' : q.severity === 'warn' ? 'rgba(255,183,77,.2)' : 'rgba(198,134,66,.1)';
                html += `<div style="font-size:.65rem;padding:6px 10px;margin-bottom:4px;border-radius:6px;background:${bg};border:1px solid ${border};color:var(--text-secondary);">${q.icon} ${q.text}</div>`;
            });
            html += '</div>';
        }

        html += `<div style="text-align:center;margin-top:14px;font-size:.6rem;color:var(--text-muted);">Tout est correct ? Cliquez "Suivant" pour continuer.</div>`;
        html += '</div>'; // close section-card

        container.style.display = 'block';
        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Keep old name for backward compat
    function buildFamilyValidation() { buildFamilyTree(); }

    function formatLienShort(lien) {
        const map = {
            enfant: 'Enfant', petit_enfant: 'Petit-enfant', arriere_petit_enfant: 'Arr. petit-enfant',
            conjoint_pacs_donation: 'Conjoint', frere_soeur: 'Frère/Sœur', neveu_niece: 'Neveu/Nièce',
            frere: 'Frère/Sœur', enfant_propre: 'Enfant', parent_propre: 'Parent', cousin: 'Cousin',
            oncle_tante: 'Oncle/Tante', beau_enfant: 'Beau-enfant', beau_frere: 'Beau-frère',
            tiers: 'Tiers', aucun: 'Aucun lien'
        };
        return map[lien] || lien;
    }

    function formatRole(role) {
        const map = { parent: 'Parent', grand_parent: 'Grand-parent', arr_grand_parent: 'Arr. GP', oncle_tante: 'Oncle/Tante', conjoint: 'Conjoint', tiers: 'Tiers' };
        return map[role] || role;
    }

    // ============================================================
    // FAMILY GRAPH UI — Step 1
    // ============================================================
    // ============================================================
    // FAMILY GRAPH UI — Interactive vertical tree
    // ============================================================

    function renderFamilyTree() {
        const container = el('family-persons-list');
        if (!container) return;
        const persons = FamilyGraph.getPersons();

        if (persons.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px 20px;">
                <div style="font-size:2rem;margin-bottom:12px;">👨‍👩‍👧‍👦</div>
                <div style="font-size:.82rem;color:var(--text-secondary);margin-bottom:16px;">Commencez par un modèle ou ajoutez la première personne.</div>
                <button class="btn-add" onclick="SD.addRootPerson()" style="font-size:.78rem;padding:10px 20px;">
                    <i class="fas fa-plus"></i> Ajouter la première personne
                </button>
            </div>`;
            // Also clear roles
            const rolesC = el('family-roles-list');
            if (rolesC) rolesC.innerHTML = '';
            return;
        }

        // Build tree by levels
        const levels = FamilyGraph.computeLevels();
        const maxLvl = Math.max(...Object.values(levels));

        let html = '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">';

        for (let lvl = 0; lvl <= maxLvl; lvl++) {
            const lvlPersons = persons.filter(p => levels[p.id] === lvl);
            if (lvlPersons.length === 0) continue;

            // Group by couples
            const rendered = new Set();
            const groups = [];

            lvlPersons.forEach(p => {
                if (rendered.has(p.id)) return;
                rendered.add(p.id);
                const sp = FamilyGraph.spouse(p.id);
                if (sp && levels[sp.id] === lvl && !rendered.has(sp.id)) {
                    rendered.add(sp.id);
                    groups.push([p, sp]);
                } else {
                    groups.push([p]);
                }
            });

            // Render level
            html += `<div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;width:100%;">`;
            groups.forEach(group => {
                if (group.length === 2) {
                    // Couple
                    html += `<div style="display:flex;align-items:center;gap:4px;">`;
                    html += renderNode(group[0], levels);
                    html += `<div style="font-size:.7rem;color:var(--accent-coral);padding:0 2px;" title="Conjoints">💍</div>`;
                    html += renderNode(group[1], levels);
                    html += `</div>`;
                } else {
                    html += renderNode(group[0], levels);
                }
            });
            html += `</div>`;

            // Connector lines to next level
            if (lvl < maxLvl) {
                html += `<div style="display:flex;justify-content:center;"><div style="width:2px;height:16px;background:rgba(198,134,66,.25);"></div></div>`;
            }
        }

        // Add orphan button
        html += `<div style="margin-top:12px;text-align:center;">
            <button class="btn-add" onclick="SD.addRootPerson()" style="font-size:.68rem;padding:6px 14px;opacity:.7;">
                <i class="fas fa-plus"></i> Ajouter une personne sans lien
            </button>
        </div>`;

        html += '</div>';
        container.innerHTML = html;

        // Render roles grid
        renderFamilyRoles();
    }

    function renderNode(p, levels) {
        const hasChildren = FamilyGraph.children(p.id).length > 0;
        const hasParents = FamilyGraph.parents(p.id).length > 0;
        const hasSpouse = !!FamilyGraph.spouse(p.id);

        const donorBg = p.isDonor ? 'rgba(198,134,66,.15)' : 'transparent';
        const benBorder = p.isBeneficiary ? '2px solid var(--accent-green)' : '1.5px solid rgba(198,134,66,.2)';
        const roleIcons = (p.isDonor ? '💰' : '') + (p.isBeneficiary ? '🎯' : '');

        return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            ${!hasParents ? `<button onclick="SD.addRelative(${p.id},'parent')" style="font-size:.55rem;padding:2px 6px;border:1px dashed rgba(198,134,66,.3);background:none;color:var(--text-muted);border-radius:4px;cursor:pointer;" title="Ajouter un parent">+ Parent</button>` : ''}
            <div style="display:flex;align-items:center;gap:2px;">
                ${!hasSpouse ? `<button onclick="SD.addRelative(${p.id},'spouse')" style="font-size:.5rem;padding:2px 4px;border:1px dashed rgba(255,107,107,.3);background:none;color:var(--text-muted);border-radius:4px;cursor:pointer;writing-mode:vertical-rl;" title="Ajouter conjoint">+💍</button>` : ''}
                <div style="padding:8px 12px;border-radius:10px;background:${donorBg};border:${benBorder};min-width:90px;text-align:center;position:relative;">
                    <button onclick="FamilyGraph.removePerson(${p.id});SD.renderFamilyTree();" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:var(--accent-coral);color:#fff;border:none;font-size:.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.6;" title="Supprimer">✕</button>
                    <input type="text" value="${p.nom}" placeholder="Nom" 
                           style="font-size:.72rem;font-weight:700;text-align:center;background:none;border:none;border-bottom:1px solid rgba(198,134,66,.15);color:var(--text-primary);width:100%;padding:2px 0;outline:none;"
                           onchange="FamilyGraph.updatePerson(${p.id},'nom',this.value);SD.renderFamilyTree();">
                    <div style="display:flex;justify-content:center;gap:4px;margin-top:4px;">
                        <input type="number" value="${p.age || ''}" placeholder="âge" min="0" max="120"
                               style="font-size:.58rem;width:36px;text-align:center;background:rgba(198,134,66,.05);border:1px solid rgba(198,134,66,.1);border-radius:4px;color:var(--text-secondary);padding:2px;"
                               onchange="FamilyGraph.updatePerson(${p.id},'age',this.value);">
                        <input type="number" value="${p.patrimoine || ''}" placeholder="patrim." min="0" step="10000"
                               style="font-size:.58rem;width:60px;text-align:center;background:rgba(198,134,66,.05);border:1px solid rgba(198,134,66,.1);border-radius:4px;color:var(--text-secondary);padding:2px;"
                               onchange="FamilyGraph.updatePerson(${p.id},'patrimoine',this.value);">
                    </div>
                    ${roleIcons ? `<div style="font-size:.6rem;margin-top:2px;">${roleIcons}</div>` : ''}
                </div>
            </div>
            ${!hasChildren ? `<button onclick="SD.addRelative(${p.id},'child')" style="font-size:.55rem;padding:2px 6px;border:1px dashed rgba(198,134,66,.3);background:none;color:var(--text-muted);border-radius:4px;cursor:pointer;" title="Ajouter un enfant">+ Enfant</button>` : `<button onclick="SD.addRelative(${p.id},'child')" style="font-size:.5rem;padding:1px 4px;border:1px dashed rgba(198,134,66,.2);background:none;color:var(--text-muted);border-radius:4px;cursor:pointer;opacity:.5;" title="Encore un enfant">+</button>`}
        </div>`;
    }

    function addRelative(fromId, type) {
        const from = FamilyGraph.getPerson(fromId);
        if (!from) return;
        let newP;
        if (type === 'child') {
            newP = FamilyGraph.addPerson('', 0);
            FamilyGraph.addRelation('parent', fromId, newP.id);
            // If from has a spouse, also add as parent
            const sp = FamilyGraph.spouse(fromId);
            if (sp) FamilyGraph.addRelation('parent', sp.id, newP.id);
        } else if (type === 'parent') {
            newP = FamilyGraph.addPerson('', 0);
            FamilyGraph.addRelation('parent', newP.id, fromId);
        } else if (type === 'spouse') {
            newP = FamilyGraph.addPerson('', 0);
            FamilyGraph.addRelation('spouse', fromId, newP.id);
            // Spouse also becomes parent of from's children
            FamilyGraph.children(fromId).forEach(c => {
                FamilyGraph.addRelation('parent', newP.id, c.id);
            });
        }
        renderFamilyTree();
    }

    function addRootPerson() {
        FamilyGraph.addPerson('', 0);
        renderFamilyTree();
    }

    function renderFamilyRoles() {
        const container = el('family-roles-list');
        if (!container) return;
        const persons = FamilyGraph.getPersons();
        if (persons.length === 0) {
            container.innerHTML = '';
            return;
        }
        const levels = FamilyGraph.computeLevels();
        // Sort by level
        const sorted = [...persons].sort((a, b) => (levels[a.id] || 0) - (levels[b.id] || 0));

        container.innerHTML = `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:3px 10px;align-items:center;">
            <div style="font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Personne</div>
            <div style="font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;text-align:center;">Lien auto</div>
            <div style="font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;text-align:center;">💰</div>
            <div style="font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;text-align:center;">🎯</div>
            ${sorted.map(p => {
                const role = FamilyGraph.inferRole(p.id);
                const roleLabel = { parent: 'Parent', grand_parent: 'Grand-parent', arr_grand_parent: 'Arr. GP', conjoint: 'Conjoint', oncle_tante: 'Oncle/Tante', tiers: '—' }[role] || '—';
                return `
                <div style="font-size:.72rem;font-weight:600;color:var(--text-primary);padding:5px 0;border-bottom:1px solid rgba(198,134,66,.05);">${p.nom || '?'} ${p.age ? '<span style="font-size:.58rem;color:var(--text-muted);">(' + p.age + 'a)</span>' : ''}</div>
                <div style="font-size:.58rem;color:var(--text-muted);text-align:center;border-bottom:1px solid rgba(198,134,66,.05);">${roleLabel}</div>
                <div style="text-align:center;border-bottom:1px solid rgba(198,134,66,.05);">
                    <input type="checkbox" ${p.isDonor ? 'checked' : ''} onchange="FamilyGraph.toggleRole(${p.id},'donor',this.checked);SD.renderFamilyTree();" style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;">
                </div>
                <div style="text-align:center;border-bottom:1px solid rgba(198,134,66,.05);">
                    <input type="checkbox" ${p.isBeneficiary ? 'checked' : ''} onchange="FamilyGraph.toggleRole(${p.id},'beneficiary',this.checked);SD.renderFamilyTree();" style="accent-color:var(--accent-green);width:16px;height:16px;cursor:pointer;">
                </div>`;
            }).join('')}
        </div>
        <div style="margin-top:6px;font-size:.6rem;color:var(--text-muted);">
            💰 ${FamilyGraph.getDonors().length} donateur(s) · 🎯 ${FamilyGraph.getBeneficiaries().length} bénéficiaire(s)
        </div>`;
    }

    // === ALIASES for backward compat ===
    function renderFamilyAll() { renderFamilyTree(); }
    function renderFamilyPersons() { renderFamilyTree(); }
    function renderFamilyRelations() {} // No longer separate
    function addFamilyPerson() { addRootPerson(); }
    function addFamilyRelation() {} // No longer needed
    function updateFamilyRelation() {}
    function removeFamilyRelation() {}

    // === PRESETS ===
    function applyFamilyPreset(type) {
        FamilyGraph.reset();
        const presets = {
            'couple_2enfants': () => {
                const m = FamilyGraph.addPerson('Mère', 55, 200000);
                const p = FamilyGraph.addPerson('Père', 58, 200000);
                const e1 = FamilyGraph.addPerson('Enfant 1', 25);
                const e2 = FamilyGraph.addPerson('Enfant 2', 22);
                FamilyGraph.addRelation('spouse', m.id, p.id);
                [e1, e2].forEach(e => { FamilyGraph.addRelation('parent', m.id, e.id); FamilyGraph.addRelation('parent', p.id, e.id); });
                m.isDonor = true; p.isDonor = true;
                e1.isBeneficiary = true; e2.isBeneficiary = true;
            },
            'couple_3enfants': () => {
                const m = FamilyGraph.addPerson('Mère', 55, 200000);
                const p = FamilyGraph.addPerson('Père', 58, 200000);
                const e1 = FamilyGraph.addPerson('Enfant 1', 28);
                const e2 = FamilyGraph.addPerson('Enfant 2', 25);
                const e3 = FamilyGraph.addPerson('Enfant 3', 22);
                FamilyGraph.addRelation('spouse', m.id, p.id);
                [e1, e2, e3].forEach(e => { FamilyGraph.addRelation('parent', m.id, e.id); FamilyGraph.addRelation('parent', p.id, e.id); });
                m.isDonor = true; p.isDonor = true;
                [e1, e2, e3].forEach(e => { e.isBeneficiary = true; });
            },
            'gp_parents_enfants': () => {
                const gm = FamilyGraph.addPerson('Grand-mère', 78, 150000);
                const gp = FamilyGraph.addPerson('Grand-père', 80, 150000);
                const m = FamilyGraph.addPerson('Mère', 55, 200000);
                const p = FamilyGraph.addPerson('Père', 58, 200000);
                const e1 = FamilyGraph.addPerson('Enfant 1', 28);
                const e2 = FamilyGraph.addPerson('Enfant 2', 25);
                FamilyGraph.addRelation('spouse', gm.id, gp.id);
                FamilyGraph.addRelation('parent', gm.id, m.id);
                FamilyGraph.addRelation('parent', gp.id, m.id);
                FamilyGraph.addRelation('spouse', m.id, p.id);
                [e1, e2].forEach(e => { FamilyGraph.addRelation('parent', m.id, e.id); FamilyGraph.addRelation('parent', p.id, e.id); });
                gm.isDonor = true; gp.isDonor = true; m.isDonor = true; p.isDonor = true;
                e1.isBeneficiary = true; e2.isBeneficiary = true;
            },
            'recomposee': () => {
                const m = FamilyGraph.addPerson('Mère', 50, 150000);
                const bp = FamilyGraph.addPerson('Beau-père', 55, 100000);
                const p = FamilyGraph.addPerson('Père', 52, 150000);
                const e1 = FamilyGraph.addPerson('Enfant commun', 20);
                const e2 = FamilyGraph.addPerson('Enfant du père', 24);
                FamilyGraph.addRelation('spouse', m.id, bp.id);
                FamilyGraph.addRelation('parent', m.id, e1.id);
                FamilyGraph.addRelation('parent', p.id, e1.id);
                FamilyGraph.addRelation('parent', p.id, e2.id);
                m.isDonor = true; p.isDonor = true; bp.isDonor = true;
                e1.isBeneficiary = true; e2.isBeneficiary = true;
            }
        };
        (presets[type] || presets['couple_2enfants'])();
        renderFamilyTree();
    }

    // === SYNC Graph → Step 2 ===
    function syncGraphToStep2() {
        if (typeof FamilyGraph === 'undefined') return;
        const donors = FamilyGraph.getDonors();
        const bens = FamilyGraph.getBeneficiaries();

        // Sync beneficiaries to SD state
        state.beneficiaries = bens.map(b => ({
            id: b.id,
            prenom: b.nom,
            age: b.age || 0,
            lien: 'enfant',
            generation: 'enfant'
        }));

        // Sync donors to PathOptimizer
        if (typeof PathOptimizer !== 'undefined') {
            const old = PathOptimizer.getDonors();
            old.forEach(d => { if (PathOptimizer.removeDonor) PathOptimizer.removeDonor(d.id); });

            donors.forEach(d => {
                const role = FamilyGraph.inferRole(d.id);
                PathOptimizer.addDonor(role, d.nom, d.age, d.patrimoine, d.regime);
                const newDonor = PathOptimizer.getDonors().find(dd => dd.nom === d.nom);
                if (newDonor) {
                    newDonor.linkedBens = {};
                    newDonor._graphId = d.id;
                    bens.forEach(b => {
                        const lien = FamilyGraph.computeFiscalLien(d.id, b.id);
                        newDonor.linkedBens[b.id] = (lien !== 'tiers');
                        let entry = newDonor.donationsParBen.find(e => +e.benId === b.id);
                        if (!entry) {
                            entry = { benId: b.id, montant: 0, lienOverride: null, date: null, type: 'inconnue' };
                            newDonor.donationsParBen.push(entry);
                        }
                        entry.lienOverride = lien;
                    });
                }
            });
            if (PathOptimizer.updateMatrix) PathOptimizer.updateMatrix();
            if (PathOptimizer.renderDonorList) PathOptimizer.renderDonorList();
        }
        renderBenList();
        if (typeof PathOptimizer !== 'undefined') {
            PathOptimizer.refreshBenDonSummaries();
        }
    }

    function goToStep(n) {
        if (n > currentStep + 1) return;

        // Leaving step 1 (arbre) → sync to step 2 (donations)
        if (currentStep === 1 && n === 2) {
            syncGraphToStep2();
        }

        // Leaving step 2 (donations) → build family tree visual
        if (currentStep === 2 && n === 3) {
            buildFamilyValidation();
        }

        currentStep = n;

        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('step-' + n);
        if (panel) panel.classList.add('active');

        document.querySelectorAll('.step-item').forEach(s => {
            const sn = +s.dataset.step;
            s.classList.remove('active', 'completed');
            if (sn === n) s.classList.add('active');
            else if (sn < n) s.classList.add('completed');
        });

        document.querySelectorAll('.step-connector').forEach((c, i) => {
            c.classList.toggle('completed', i < n - 1);
        });

        el('btn-prev').style.display = n > 1 ? '' : 'none';
        el('btn-next').style.display = n < 6 ? '' : 'none';
        el('btn-calculate').style.display = n === 5 ? '' : 'none';
        if (n === 6) {
            el('btn-next').style.display = 'none';
            el('btn-calculate').style.display = 'none';
        }

        if (n === 4) updateSynthese();
        updateAside();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function nextStep() { if (currentStep < 6) goToStep(currentStep + 1); }
    function prevStep() { if (currentStep > 1) goToStep(currentStep - 1); }

    // ============================================================
    // 4. UI — Gestion des formulaires dynamiques
    // ============================================================

    // -- Helpers DOM --
    function el(id) { return document.getElementById(id); }
    function fmt(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }

    function toggleSwitch(elem) {
        elem.classList.toggle('on');
    }

    function toggleSection(id) {
        const section = el(id);
        if (section) section.style.display = section.style.display === 'none' ? '' : 'none';
    }

    function toggleCollapsible(header) {
        header.classList.toggle('open');
        const body = header.nextElementSibling;
        body.classList.toggle('open');
    }

    // -- Mode couple/solo --
    function setMode(m) {
        state.mode = m;
        document.querySelectorAll('#mode-toggle .toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === m);
        });
        const cf = el('couple-fields'); if (cf) cf.style.display = m === 'couple' ? '' : 'none';
        const ds = el('donor1-status-group'); if (ds) ds.style.display = m === 'couple' ? 'none' : '';
    }

    // -- Detail mode --
    function setDetailMode(m) {
        state.detailMode = m;
        document.querySelectorAll('#detail-toggle .toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === m);
        });
        el('mode-simplifie').style.display = m === 'simplifie' ? '' : 'none';
        el('mode-detaille').style.display = m === 'detaille' ? '' : 'none';
    }

    // -- Operation --
    function setOperation(op) {
        state.operation = op;
        document.querySelectorAll('#operation-toggle .toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === op);
        });
        el('donation-type-section').style.display = op === 'succession' ? 'none' : '';
        const succOpts = el('succession-options-section');
        if (succOpts) succOpts.style.display = (op === 'succession' || op === 'both') ? '' : 'none';
    }

    // -- Presets bénéficiaires --
    function applyPreset(type) {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        if (typeof event !== 'undefined' && event && event.target && event.target.closest) {
            const btn = event.target.closest('.preset-btn');
            if (btn) btn.classList.add('active');
        }

        state.beneficiaries = [];
        el('beneficiaries-list').innerHTML = '';
        benIdCounter = 0;

        const presets = {
            '2enfants': [['enfant', 'Enfant 1'], ['enfant', 'Enfant 2']],
            '3enfants': [['enfant', 'Enfant 1'], ['enfant', 'Enfant 2'], ['enfant', 'Enfant 3']],
            'conjoint2': [['conjoint_pacs', 'Conjoint'], ['enfant', 'Enfant 1'], ['enfant', 'Enfant 2']],
            'neveu': [['neveu_niece', 'Neveu']]
        };

        (presets[type] || []).forEach(([lien, prenom]) => addBeneficiary(lien, prenom));
    }

    // -- Bénéficiaires --
    function addBeneficiary(lien, prenom) {
        const id = benIdCounter++;
        const defLien = lien || 'enfant';
        const defPrenom = prenom || '';
        state.beneficiaries.push({
            id, lien: defLien, prenom: defPrenom,
            age: null, handicap: false,
            donationsAnterieures: [], // [{de: 'Grand-mère', role: 'grand_parent', montant: 50000, date: '2020-03-15'}]
            donationAnterieure: 0, dateDerniereDonation: ''
        });

        const opts = [
            ['enfant', 'Enfant (fils/fille)'], ['petit_enfant', 'Petit-enfant'],
            ['arriere_petit_enfant', 'Arrière-petit-enfant'],
            ['conjoint_pacs', 'Conjoint / Pacsé'],
            ['frere_soeur', 'Frère / Sœur'],
            ['neveu_niece', 'Neveu / Nièce'],
            ['tiers', 'Tiers']
        ].map(([v, l]) => `<option value="${v}" ${v === defLien ? 'selected' : ''}>${l}</option>`).join('');

        const html = `
        <div class="list-item" id="ben-${id}" data-ben-id="${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-user"></i> Bénéficiaire ${id + 1}</div>
                <button class="btn-remove" onclick="SD.removeBeneficiary(${id})"><i class="fas fa-times"></i></button>
            </div>
            <div class="form-grid cols-3">
                <div class="form-group">
                    <label class="form-label">Prénom</label>
                    <input type="text" value="${defPrenom}" onchange="SD.updateBen(${id},'prenom',this.value)" placeholder="Optionnel">
                </div>
                <div class="form-group">
                    <label class="form-label">Génération</label>
                    <select onchange="SD.updateBen(${id},'lien',this.value)">${opts}</select>
                    <div style="font-size:.58rem;color:var(--text-muted);margin-top:2px;">Le lien fiscal exact est auto-détecté par donateur</div>
                </div>
                <div class="form-group">
                    <label class="form-label">Âge</label>
                    <input type="number" min="0" max="100" onchange="SD.updateBen(${id},'age',+this.value)" placeholder="Ex: 30">
                </div>
            </div>
            <div class="form-group" style="margin-top:6px;">
                <label class="form-label">Handicap reconnu</label>
                <select onchange="SD.updateBen(${id},'handicap',this.value==='oui')">
                    <option value="non">Non</option>
                    <option value="oui">Oui (+159 325 €)</option>
                </select>
            </div>

            <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(198,134,66,.1);">
                <label class="form-label" style="color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-link"></i> Liens fiscaux auto-détectés + donations reçues
                </label>
                <div id="don-summary-${id}" style="font-size:.72rem;color:var(--text-muted);padding:4px 0;">Ajoutez des donateurs dans la cartographie ci-dessous.</div>
            </div>
        </div>`;
        el('beneficiaries-list').insertAdjacentHTML('beforeend', html);
    }

    function removeBeneficiary(id) {
        state.beneficiaries = state.beneficiaries.filter(b => b.id !== id);
        el('ben-' + id)?.remove();
    }

    function updateBen(id, field, val) {
        const b = state.beneficiaries.find(b => b.id === id);
        if (b) b[field] = val;
    }

    // ============================================================
    // IMMOBILIER — Section enrichie (usage actuel, location, bail)
    // ============================================================
    function addImmo() {
        const id = immoIdCounter++;
        state.immo.push({
            id,
            label: '',
            // Situation actuelle
            usageActuel: 'rp',              // rp | rs | locatif | vacant
            occupant: 'proprietaire',       // proprietaire | locataire | vacant
            // Si loué actuellement
            typeLocation: 'nu',             // nu | meuble_longue_duree | meuble_courte | meuble_saisonnier | commercial
            typeBail: 'bail_nu_3ans',       // bail_nu_3ans | bail_nu_6ans | bail_meuble_1an | bail_etudiant_9mois | bail_mobilite | bail_commercial | saisonnier
            dateDebutBail: '',
            loyerMensuel: 0,
            chargesLocatives: 0,
            // Fiscalité du loué
            regimeFiscal: 'foncier_reel',   // foncier_micro | foncier_reel | micro_bic | bic_reel
            lmnpAmortCumul: 0,
            isResidenceServices: false,
            // Bien
            valeur: 0,
            prixAcquisition: 0,
            modeAcquisition: 'achat',       // achat | donation | succession | construction
            operationEnvisagee: 'conserver', // conserver | vendre | donner_np | donner_pp | apporter_sci
            valeurDeclaree: 0,              // Si reçu par donation/succession
            droitsTransmission: 0,          // Droits payés lors de la transmission
            recuDe: '',                     // Personne qui a transmis
            dateAcquisition: '',
            dateSortieRP: '',
            // Détention
            structure: 'direct',            // direct | sci_ir | sci_is | sarl_famille | indivision | demembre
            // Propriétaires liés à la cartographie
            owners: [],                     // [{personId, personNom, personType:'donor'|'ben'|'autre', role:'pp'|'us'|'np'|'indiv', quote: 100, lienAutre:''}]
            partRecettesCommHT: 0,
            // Charges
            credit: 0,
            creditADI: false,
            taxeFonciere: 0,
            chargesCopro: 0,
            assurancePNO: 0,
            travauxEntretien: 0,
            fraisGestion: 0
        });

        const html = `
        <div class="list-item" id="immo-${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-building"></i> <span id="immo-title-${id}">Bien immobilier ${id + 1}</span></div>
                <button class="btn-remove" onclick="SD.removeImmo(${id})"><i class="fas fa-times"></i></button>
            </div>

            <!-- Nom / Adresse -->
            <div class="form-group" style="margin-bottom:16px;">
                <label class="form-label">Nom ou adresse du bien</label>
                <input type="text" onchange="SD.updateImmo(${id},'label',this.value); SD.updateImmoTitle(${id})" placeholder="Ex: Appartement Paris 11e">
            </div>

            <!-- Usage actuel du bien -->
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label">Usage actuel du bien <span class="info-tip" data-tip="Détermine le régime fiscal applicable. La résidence principale bénéficie d'une exonération de plus-value à la vente."><i class="fas fa-info-circle"></i></span></label>
                    <select onchange="SD.updateImmo(${id},'usageActuel',this.value); SD.refreshImmoUI(${id})">
                        <option value="rp">🏠 Résidence principale (j'y habite)</option>
                        <option value="rs">🏖️ Résidence secondaire</option>
                        <option value="locatif">🔑 Loué actuellement</option>
                        <option value="vacant">🏚️ Vacant / inoccupé</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Valeur estimée actuelle (€)</label>
                    <input type="number" step="1000" onchange="SD.updateImmo(${id},'valeur',+this.value)" placeholder="Ex: 400000">
                </div>
            </div>

            <!-- Si loué : détail location -->
            <div id="immo-loc-${id}" style="display:none; margin-top:16px;">
                <div style="font-size:.82rem; font-weight:600; color:var(--accent-blue); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                    <i class="fas fa-key"></i> Détail de la location en cours
                </div>
                <div class="form-grid cols-3">
                    <div class="form-group">
                        <label class="form-label">Type de location</label>
                        <select onchange="SD.updateImmo(${id},'typeLocation',this.value); SD.refreshImmoUI(${id})">
                            <option value="nu">Location nue (non meublée)</option>
                            <option value="meuble_longue_duree">Meublé longue durée</option>
                            <option value="meuble_courte">Meublé courte durée (Airbnb)</option>
                            <option value="meuble_saisonnier">Meublé saisonnier</option>
                            <option value="commercial">Bail commercial / professionnel</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Type de bail</label>
                        <select id="bail-type-${id}" onchange="SD.updateImmo(${id},'typeBail',this.value)">
                            <option value="bail_nu_3ans">Bail nu 3 ans (particulier)</option>
                            <option value="bail_nu_6ans">Bail nu 6 ans (bailleur société)</option>
                            <option value="bail_meuble_1an">Bail meublé 1 an</option>
                            <option value="bail_etudiant_9mois">Bail étudiant 9 mois</option>
                            <option value="bail_mobilite">Bail mobilité (1-10 mois)</option>
                            <option value="bail_commercial">Bail commercial (3-6-9)</option>
                            <option value="saisonnier">Saisonnier</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date début du bail</label>
                        <input type="date" onchange="SD.updateImmo(${id},'dateDebutBail',this.value)">
                    </div>
                </div>
                <div class="form-grid" style="margin-top:12px;">
                    <div class="form-group">
                        <label class="form-label">Loyer mensuel hors charges (€)</label>
                        <input type="number" step="10" onchange="SD.updateImmo(${id},'loyerMensuel',+this.value)" placeholder="Ex: 850">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Charges locatives mensuelles (€)</label>
                        <input type="number" step="10" onchange="SD.updateImmo(${id},'chargesLocatives',+this.value)" placeholder="Ex: 80">
                    </div>
                </div>

                <!-- Régime fiscal de la location -->
                <div style="margin-top:16px;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Régime fiscal actuel <span class="info-tip" data-tip="Nu : revenus fonciers (micro-foncier si < 15k€/an, ou réel). Meublé : BIC (micro-BIC si < 77 700€/an, ou réel avec amortissements)."><i class="fas fa-info-circle"></i></span></label>
                            <select id="regime-fiscal-${id}" onchange="SD.updateImmo(${id},'regimeFiscal',this.value); SD.refreshImmoUI(${id})">
                                <option value="foncier_micro">Micro-foncier (abattement 30%)</option>
                                <option value="foncier_reel" selected>Foncier réel (déduction charges)</option>
                                <option value="micro_bic">Micro-BIC (abattement 50%)</option>
                                <option value="bic_reel">BIC réel (amortissements)</option>
                            </select>
                        </div>
                        <div class="form-group" id="immo-amort-group-${id}" style="display:none;">
                            <label class="form-label">Amortissements cumulés (€) <span class="info-tip" data-tip="LF 2025 : depuis le 15/02/2025, les amortissements sont réintégrés dans le calcul de la plus-value à la revente."><i class="fas fa-info-circle"></i></span></label>
                            <input type="number" step="1000" onchange="SD.updateImmo(${id},'lmnpAmortCumul',+this.value)" placeholder="0">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Acquisition & détention -->
            <div style="margin-top:16px;">
                <div class="form-grid cols-2">
                    <div class="form-group">
                        <label class="form-label">Mode d'acquisition</label>
                        <select onchange="SD.updateImmo(${id},'modeAcquisition',this.value); SD.refreshImmoUI(${id})">
                            <option value="achat">Achat</option>
                            <option value="donation">Reçu par donation</option>
                            <option value="succession">Reçu par succession</option>
                            <option value="construction">Construction / VEFA</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date d'acquisition</label>
                        <input type="date" onchange="SD.updateImmo(${id},'dateAcquisition',this.value)">
                    </div>
                </div>

                <!-- Si achat : prix d'achat -->
                <div id="immo-achat-${id}">
                    <div class="form-group" style="margin-top:8px;">
                        <label class="form-label">Prix d'acquisition (€)</label>
                        <input type="number" step="1000" onchange="SD.updateImmo(${id},'prixAcquisition',+this.value)" placeholder="Ex: 310000">
                    </div>
                </div>

                <!-- Si donation/succession : valeur déclarée -->
                <div id="immo-donation-${id}" style="display:none;margin-top:8px;padding:10px;border-radius:8px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);">
                    <div class="form-grid cols-2">
                        <div class="form-group">
                            <label class="form-label" style="color:var(--accent-coral);">Valeur déclarée lors de la transmission (€)</label>
                            <input type="number" step="1000" onchange="SD.updateImmo(${id},'valeurDeclaree',+this.value)" placeholder="Base pour la plus-value future">
                            <div style="font-size:.58rem;color:var(--text-muted);margin-top:2px;">= prix de revient fiscal pour le calcul de plus-value à la revente</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Droits payés lors de la transmission (€)</label>
                            <input type="number" step="100" onchange="SD.updateImmo(${id},'droitsTransmission',+this.value)" placeholder="0">
                            <div style="font-size:.58rem;color:var(--text-muted);margin-top:2px;">Ajoutés au prix de revient si < 5 ans</div>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top:8px;">
                        <label class="form-label">Reçu de qui ?</label>
                        <select class="form-input" id="immo-recu-de-${id}" style="font-size:.75rem;height:34px;" onchange="SD.updateImmo(${id},'recuDe',this.value)">
                            <option value="">— Choisir —</option>
                        </select>
                    </div>
                </div>

                <div class="form-grid cols-2" style="margin-top:12px;">
                    <div class="form-group">
                        <label class="form-label">Mode de détention</label>
                        <select onchange="SD.updateImmo(${id},'structure',this.value); SD.refreshImmoUI(${id})">
                            <option value="direct">En direct (personne physique)</option>
                            <option value="sci_ir">Via SCI à l'IR</option>
                            <option value="sci_is">Via SCI à l'IS</option>
                            <option value="sarl_famille">Via SARL de famille (IR)</option>
                            <option value="indivision">En indivision</option>
                            <option value="demembre">Démembré (US / NP)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Crédit restant dû (€)</label>
                        <input type="number" step="1000" onchange="SD.updateImmo(${id},'credit',+this.value)" placeholder="0">
                    </div>
                </div>
                <div class="form-grid cols-2" style="margin-top:4px;">
                    <div class="form-group">
                        <label class="form-label">Assurance décès (ADI) sur ce crédit ?</label>
                        <select onchange="SD.updateImmo(${id},'creditADI',this.value==='oui')">
                            <option value="non">Non — déductible du passif</option>
                            <option value="oui">Oui — NON déductible (capital couvert)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Opération envisagée <span class="info-tip" data-tip="Détermine le traitement fiscal : PV à calculer si vente, décote NP si donation démembrée, cession déguisée si apport SCI."><i class="fas fa-info-circle"></i></span></label>
                        <select onchange="SD.updateImmo(${id},'operationEnvisagee',this.value); SD.refreshImmoUI(${id})">
                            <option value="conserver">🏠 Conserver (succession)</option>
                            <option value="vendre">💰 Vendre</option>
                            <option value="donner_pp">🎁 Donner en pleine propriété</option>
                            <option value="donner_np">📋 Donner la nue-propriété</option>
                            <option value="apporter_sci">🏢 Apporter en SCI</option>
                        </select>
                    </div>
                </div>

                <!-- Warning opération -->
                <div id="immo-op-warning-${id}" style="display:none;"></div>

                <!-- Propriétaire(s) — apparaît pour tous les modes -->
                <div id="immo-owners-${id}" style="margin-top:12px;padding:12px;border-radius:10px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.08);">
                    <div id="immo-owners-content-${id}"></div>
                </div>
            </div>

            <!-- Date sortie RP (si ex-RP) -->
            <div id="immo-exrp-${id}" style="display:none; margin-top:12px;">
                <div class="form-group">
                    <label class="form-label">Date de sortie de la résidence principale <span class="info-tip" data-tip="Si le bien était votre RP et ne l'est plus, la plus-value n'est plus exonérée. La date de sortie RP détermine le début du calcul PV."><i class="fas fa-info-circle"></i></span></label>
                    <input type="date" onchange="SD.updateImmo(${id},'dateSortieRP',this.value)">
                </div>
            </div>

            <!-- Charges annuelles (collapsible) -->
            <div class="collapsible-header" onclick="SD.toggleCollapsible(this)" style="margin-top:8px;">
                <span style="font-size:.78rem;color:var(--text-secondary);"><i class="fas fa-euro-sign" style="margin-right:6px;"></i>Charges annuelles détaillées</span>
                <i class="fas fa-chevron-down chevron" style="color:var(--text-muted);"></i>
            </div>
            <div class="collapsible-body">
                <div class="form-grid cols-3">
                    <div class="form-group">
                        <label class="form-label">Taxe foncière / an</label>
                        <input type="number" step="50" onchange="SD.updateImmo(${id},'taxeFonciere',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Charges copropriété / an</label>
                        <input type="number" step="50" onchange="SD.updateImmo(${id},'chargesCopro',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Assurance PNO / an</label>
                        <input type="number" step="50" onchange="SD.updateImmo(${id},'assurancePNO',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Travaux / entretien / an</label>
                        <input type="number" step="100" onchange="SD.updateImmo(${id},'travauxEntretien',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Frais de gestion locative / an</label>
                        <input type="number" step="50" onchange="SD.updateImmo(${id},'fraisGestion',+this.value)" placeholder="0">
                    </div>
                </div>
            </div>

            <!-- Warnings dynamiques -->
            <div id="immo-warnings-${id}"></div>
        </div>`;
        el('immo-list').insertAdjacentHTML('beforeend', html);
        refreshImmoUI(id);
    }

    function removeImmo(id) {
        state.immo = state.immo.filter(i => i.id !== id);
        el('immo-' + id)?.remove();
    }

    function updateImmo(id, field, val) {
        const item = state.immo.find(i => i.id === id);
        if (item) item[field] = val;
    }

    function updateImmoTitle(id) {
        const item = state.immo.find(i => i.id === id);
        const titleEl = el('immo-title-' + id);
        if (item && titleEl) titleEl.textContent = item.label || `Bien immobilier ${id + 1}`;
    }

    function refreshImmoUI(id) {
        const item = state.immo.find(i => i.id === id);
        if (!item) return;

        const isLoue = item.usageActuel === 'locatif';
        const isMeuble = ['meuble_longue_duree', 'meuble_courte', 'meuble_saisonnier'].includes(item.typeLocation);
        const isBICReel = item.regimeFiscal === 'bic_reel';
        const isExRP = ['locatif', 'rs', 'vacant'].includes(item.usageActuel);

        // Show/hide location section
        el('immo-loc-' + id).style.display = isLoue ? '' : 'none';

        // Show/hide amort field (only BIC réel)
        const amortGroup = el('immo-amort-group-' + id);
        if (amortGroup) amortGroup.style.display = (isLoue && isBICReel) ? '' : 'none';

        // Show/hide ex-RP field
        el('immo-exrp-' + id).style.display = isExRP ? '' : 'none';

        // Render owners section
        renderImmoOwners(id);

        // Acquisition mode: show/hide fields
        const isDonSuc = ['donation', 'succession'].includes(item.modeAcquisition);
        const achatEl = el('immo-achat-' + id);
        const donEl = el('immo-donation-' + id);
        if (achatEl) achatEl.style.display = isDonSuc ? 'none' : '';
        if (donEl) donEl.style.display = isDonSuc ? '' : 'none';

        // Populate "reçu de" dropdown
        if (isDonSuc) {
            const recuSelect = el('immo-recu-de-' + id);
            if (recuSelect) {
                const persons = getPersonsList();
                recuSelect.innerHTML = `<option value="">— Choisir —</option>` +
                    persons.map(p => `<option value="${p.id}" ${item.recuDe === p.id ? 'selected' : ''}>${p.nom} (${p.type === 'donor' ? 'donateur' : 'bénéf.'})</option>`).join('') +
                    `<option value="autre" ${item.recuDe === 'autre' ? 'selected' : ''}>Autre personne</option>`;
            }
        }

        // Operation envisagée warnings
        const opWarn = el('immo-op-warning-' + id);
        if (opWarn) {
            let opHtml = '';
            if (item.operationEnvisagee === 'apporter_sci') {
                opHtml = `<div class="warning-box error" style="margin-top:8px;"><i class="fas fa-exclamation-triangle"></i><span><strong>Apport en SCI = cession :</strong> l'apport d'un bien immobilier à une SCI constitue une cession à titre onéreux. La plus-value est immédiatement imposable (IR ${FISCAL ? (FISCAL.pvIR*100) : 19}% + PS ${FISCAL ? (FISCAL.pvPS*100) : 17.2}%). Le compteur d'abattement pour durée de détention repart à zéro dans la SCI.</span></div>`;
            } else if (item.operationEnvisagee === 'vendre') {
                opHtml = `<div class="warning-box warn" style="margin-top:8px;"><i class="fas fa-calculator"></i><span><strong>Vente :</strong> plus-value imposable sauf si résidence principale. Abattement pour durée de détention : exonération IR après 22 ans, exonération PS après 30 ans.</span></div>`;
            } else if (item.operationEnvisagee === 'donner_np') {
                opHtml = `<div class="warning-box info" style="margin-top:8px;"><i class="fas fa-info-circle"></i><span><strong>Donation NP :</strong> la valeur de la nue-propriété dépend de l'âge de l'usufruitier (table art. 669 CGI). Pas de plus-value à payer lors de la donation. L'usufruitier conserve le droit d'usage et les revenus.</span></div>`;
            } else if (item.operationEnvisagee === 'donner_pp') {
                opHtml = `<div class="warning-box info" style="margin-top:8px;"><i class="fas fa-gift"></i><span><strong>Donation PP :</strong> droits de donation calculés sur la valeur vénale. Le donateur perd tout droit sur le bien. Pas de plus-value à payer.</span></div>`;
            }
            opWarn.style.display = opHtml ? '' : 'none';
            opWarn.innerHTML = opHtml;
        }

        // Update regime fiscal options based on location type
        const regimeSelect = el('regime-fiscal-' + id);
        if (regimeSelect && isLoue) {
            if (isMeuble) {
                regimeSelect.innerHTML = `
                    <option value="micro_bic">Micro-BIC (abattement 50%)</option>
                    <option value="bic_reel">BIC réel (amortissements)</option>`;
                if (!['micro_bic', 'bic_reel'].includes(item.regimeFiscal)) {
                    item.regimeFiscal = 'micro_bic';
                }
            } else {
                regimeSelect.innerHTML = `
                    <option value="foncier_micro">Micro-foncier (abattement 30%)</option>
                    <option value="foncier_reel">Foncier réel (déduction charges)</option>`;
                if (!['foncier_micro', 'foncier_reel'].includes(item.regimeFiscal)) {
                    item.regimeFiscal = 'foncier_reel';
                }
            }
            regimeSelect.value = item.regimeFiscal;
        }

        // Update bail options
        const bailSelect = el('bail-type-' + id);
        if (bailSelect && isLoue) {
            if (isMeuble) {
                bailSelect.innerHTML = `
                    <option value="bail_meuble_1an">Bail meublé 1 an</option>
                    <option value="bail_etudiant_9mois">Bail étudiant 9 mois</option>
                    <option value="bail_mobilite">Bail mobilité (1-10 mois)</option>
                    <option value="saisonnier">Saisonnier / courte durée</option>`;
            } else if (item.typeLocation === 'commercial') {
                bailSelect.innerHTML = `
                    <option value="bail_commercial">Bail commercial (3-6-9)</option>
                    <option value="bail_pro">Bail professionnel (6 ans)</option>`;
            } else {
                bailSelect.innerHTML = `
                    <option value="bail_nu_3ans">Bail nu 3 ans (bailleur particulier)</option>
                    <option value="bail_nu_6ans">Bail nu 6 ans (bailleur société/SCI)</option>`;
            }
        }

        // Dynamic warnings
        const warnEl = el('immo-warnings-' + id);
        let warnings = '';

        if (item.usageActuel === 'rp') {
            warnings += `<div class="warning-box success"><i class="fas fa-shield-alt"></i><span><strong>Résidence principale :</strong> exonération totale de plus-value en cas de vente. Abattement de 20% en succession (art. 764 bis) si occupée par le conjoint ou enfant mineur.</span></div>`;
        }

        if (isLoue && isMeuble && item.structure === 'sci_ir') {
            warnings += `<div class="warning-box error"><i class="fas fa-ban"></i><span><strong>⛔ Incompatibilité :</strong> SCI à l'IR + location meublée → risque de requalification à l'IS si revenus meublés > 10% du CA total HT. Envisagez une SARL de famille ou SCI à l'IS.</span></div>`;
        }

        if (isLoue && isMeuble && isBICReel) {
            warnings += `<div class="warning-box warn"><i class="fas fa-exclamation-triangle"></i><span><strong>LF 2025 (en vigueur) :</strong> depuis le 15/02/2025, les amortissements déduits en LMNP/LMP sont réintégrés dans le calcul de la plus-value à la revente (sauf résidences services).</span></div>`;
        }

        if (item.structure === 'sci_is') {
            warnings += `<div class="warning-box info"><i class="fas fa-info-circle"></i><span><strong>SCI IS :</strong> pas d'abattement pour durée de détention sur la plus-value. PV calculée sur la VNC (valeur nette comptable). IS 15% puis 25%.</span></div>`;
        }

        if (item.structure === 'sarl_famille') {
            warnings += `<div class="warning-box warn"><i class="fas fa-exclamation-triangle"></i><span><strong>SARL de famille :</strong> le gérant majoritaire est affilié à la SSI même non rémunéré (cotisations minimales ~1 100 €/an). Tous les associés doivent être membres de la même famille.</span></div>`;
        }

        if (item.structure === 'sci_ir' && !isMeuble && isLoue) {
            const bailDuree = item.structure === 'sci_ir' ? '6 ans' : '3 ans';
            warnings += `<div class="warning-box info"><i class="fas fa-info-circle"></i><span><strong>SCI IR + bail nu :</strong> durée minimale du bail = ${bailDuree} (bailleur société). Revenus fonciers imposés au barème IR des associés.</span></div>`;
        }

        warnEl.innerHTML = warnings;
    }

    // ============================================================
    // FINANCIER
    // ============================================================
    // === OWNERSHIP / PROPRIÉTAIRES ===
    function getPersonsList() {
        // Combine donors + beneficiaries from cartographie
        const persons = [];
        if (typeof PathOptimizer !== 'undefined') {
            PathOptimizer.getDonors().forEach(d => {
                persons.push({ id: 'd-' + d.id, nom: d.nom, type: 'donor', role: d.role });
            });
        }
        state.beneficiaries.forEach(b => {
            persons.push({ id: 'b-' + b.id, nom: b.prenom || 'Bénéf. ' + b.id, type: 'ben', lien: b.lien });
        });
        return persons;
    }

    function addImmoOwner(immoId) {
        const item = state.immo.find(i => i.id === immoId);
        if (!item) return;
        item.owners.push({ personId: '', personNom: '', personType: 'autre', role: 'pp', quote: 100, lienAutre: '' });
        renderImmoOwners(immoId);
    }

    function removeImmoOwner(immoId, idx) {
        const item = state.immo.find(i => i.id === immoId);
        if (!item) return;
        item.owners.splice(idx, 1);
        renderImmoOwners(immoId);
    }

    function updateImmoOwner(immoId, idx, field, value) {
        const item = state.immo.find(i => i.id === immoId);
        if (!item || !item.owners[idx]) return;
        const o = item.owners[idx];

        if (field === 'personId') {
            o.personId = value;
            if (value === 'autre') {
                o.personType = 'autre';
                o.personNom = '';
            } else {
                const persons = getPersonsList();
                const p = persons.find(pp => pp.id === value);
                if (p) { o.personNom = p.nom; o.personType = p.type; }
            }
        } else if (field === 'quote') {
            o.quote = +value || 0;
        } else if (field === 'role') {
            o.role = value;
        } else if (field === 'personNom') {
            o.personNom = value;
        }
        renderImmoOwners(immoId);
    }

    function renderImmoOwners(immoId) {
        const item = state.immo.find(i => i.id === immoId);
        const container = el('immo-owners-content-' + immoId);
        if (!container || !item) return;

        const struct = item.structure;
        const isDemembre = struct === 'demembre';
        const isIndivision = struct === 'indivision';
        const isSimple = !isDemembre && !isIndivision;

        const persons = getPersonsList();
        const personOpts = persons.map(p =>
            `<option value="${p.id}">${p.nom} (${p.type === 'donor' ? 'donateur' : 'bénéf.'})</option>`
        ).join('') + `<option value="autre">— Autre personne —</option>`;

        // For simple modes, just show single owner
        if (isSimple) {
            // Auto-set single owner if empty
            if (item.owners.length === 0 && persons.length > 0) {
                item.owners = [{ personId: persons[0].id, personNom: persons[0].nom, personType: persons[0].type, role: 'pp', quote: 100, lienAutre: '' }];
            }
            const o = item.owners[0] || {};
            container.innerHTML = `
                <label class="form-label" style="font-size:.72rem;margin-bottom:6px;display:flex;align-items:center;gap:4px;"><i class="fas fa-user"></i> Propriétaire</label>
                <select class="form-input" style="font-size:.75rem;height:34px;" onchange="SD.updateImmoOwner(${immoId},0,'personId',this.value)">
                    <option value="">— Choisir —</option>
                    ${persons.map(p => `<option value="${p.id}" ${o.personId === p.id ? 'selected' : ''}>${p.nom} (${p.type === 'donor' ? 'donateur' : 'bénéf.'})</option>`).join('')}
                    <option value="autre" ${o.personId === 'autre' ? 'selected' : ''}>— Autre personne —</option>
                </select>
                ${o.personId === 'autre' ? `<input type="text" class="form-input" value="${o.personNom}" placeholder="Nom" style="margin-top:6px;font-size:.72rem;height:32px;" onchange="SD.updateImmoOwner(${immoId},0,'personNom',this.value)">` : ''}`;
            return;
        }

        // For indivision / démembrement : multi-owner
        const roleLabel = isDemembre ? 'Droit' : 'Part';
        const roleOpts = isDemembre
            ? `<option value="us">Usufruitier</option><option value="np">Nu-propriétaire</option>`
            : `<option value="indiv">Indivisaire</option>`;

        let html = `<label class="form-label" style="font-size:.72rem;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
            <i class="fas fa-users"></i> ${isDemembre ? 'Démembrement — qui détient quoi ?' : 'Indivision — parts de chacun'}
        </label>`;

        const totalQuote = item.owners.reduce((s, o) => s + (o.quote || 0), 0);

        html += item.owners.map((o, idx) => `
            <div style="display:grid;grid-template-columns:1fr ${isDemembre ? '110px' : ''} 80px 28px;gap:6px;align-items:center;margin-bottom:6px;">
                <div>
                    <select class="form-input" style="font-size:.72rem;height:32px;" onchange="SD.updateImmoOwner(${immoId},${idx},'personId',this.value)">
                        <option value="">— Choisir —</option>
                        ${persons.map(p => `<option value="${p.id}" ${o.personId === p.id ? 'selected' : ''}>${p.nom}</option>`).join('')}
                        <option value="autre" ${o.personId === 'autre' ? 'selected' : ''}>Autre</option>
                    </select>
                    ${o.personId === 'autre' ? `<input type="text" class="form-input" value="${o.personNom}" placeholder="Nom" style="margin-top:4px;font-size:.68rem;height:28px;" onchange="SD.updateImmoOwner(${immoId},${idx},'personNom',this.value)">` : ''}
                </div>
                ${isDemembre ? `<select class="form-input" style="font-size:.68rem;height:32px;" onchange="SD.updateImmoOwner(${immoId},${idx},'role',this.value)">
                    <option value="us" ${o.role === 'us' ? 'selected' : ''}>Usufruitier</option>
                    <option value="np" ${o.role === 'np' ? 'selected' : ''}>Nu-propriétaire</option>
                </select>` : ''}
                <div style="position:relative;">
                    <input type="number" class="form-input" value="${o.quote}" min="0" max="100" style="font-size:.72rem;height:32px;text-align:right;padding-right:20px;" onchange="SD.updateImmoOwner(${immoId},${idx},'quote',this.value)">
                    <span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:.62rem;color:var(--text-muted);">%</span>
                </div>
                <button class="btn-remove" style="width:28px;height:28px;font-size:.6rem;" onclick="SD.removeImmoOwner(${immoId},${idx})"><i class="fas fa-times"></i></button>
            </div>
        `).join('');

        // Total bar
        const pctColor = totalQuote === 100 ? 'var(--accent-green)' : totalQuote > 100 ? 'var(--accent-coral)' : 'var(--accent-amber)';
        html += `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgba(198,134,66,.08);">
                <button class="btn-add" style="font-size:.68rem;padding:4px 10px;" onclick="SD.addImmoOwner(${immoId})"><i class="fas fa-plus"></i> Ajouter</button>
                <span style="font-size:.68rem;font-weight:600;color:${pctColor};">Total : ${totalQuote}%${totalQuote !== 100 ? ' ⚠️' : ' ✓'}</span>
            </div>`;

        container.innerHTML = html;
    }

    function addFinancial() {
        const id = finIdCounter++;
        state.finance.push({
            id, type: 'assurance_vie', valeur: 0, versements: 0,
            dateOuverture: '', primesAvant70: 0, primesApres70: 0,
            clauseBeneficiaire: 'standard',
            ownerId: '', ownerNom: ''   // Lié à la cartographie
        });

        const html = `
        <div class="list-item" id="fin-${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-chart-line"></i> Actif financier ${id + 1}</div>
                <button class="btn-remove" onclick="SD.removeFinancial(${id})"><i class="fas fa-times"></i></button>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label" style="font-size:.72rem;"><i class="fas fa-user"></i> Titulaire</label>
                <select class="form-input" id="fin-owner-${id}" style="font-size:.75rem;height:34px;" onchange="SD.updateFin(${id},'ownerId',this.value)">
                    <option value="">— Choisir le titulaire —</option>
                </select>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label">Type de placement</label>
                    <select onchange="SD.updateFin(${id},'type',this.value); SD.refreshFinUI(${id})">
                        <option value="assurance_vie">Assurance-vie</option>
                        <option value="contrat_capi">Contrat de capitalisation</option>
                        <option value="pea">PEA</option>
                        <option value="pea_pme">PEA-PME</option>
                        <option value="cto">Compte-titres (CTO)</option>
                        <option value="per">PER</option>
                        <option value="livrets">Livrets réglementés</option>
                        <option value="liquidites">Liquidités (comptes courants)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Valeur actuelle (€)</label>
                    <input type="number" step="1000" onchange="SD.updateFin(${id},'valeur',+this.value)" placeholder="Ex: 150000">
                </div>
                <div class="form-group">
                    <label class="form-label">Date d'ouverture</label>
                    <input type="date" onchange="SD.updateFin(${id},'dateOuverture',this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">Total versé (€)</label>
                    <input type="number" step="1000" onchange="SD.updateFin(${id},'versements',+this.value)" placeholder="Ex: 120000">
                </div>
            </div>
            <div id="fin-av-${id}" style="margin-top:12px;">
                <div class="form-grid cols-3">
                    <div class="form-group">
                        <label class="form-label">Primes avant 70 ans <span class="info-tip" data-tip="Art. 990 I : abattement de 152 500 € par bénéficiaire, puis 20% jusqu'à 700k€ et 31,25% au-delà."><i class="fas fa-info-circle"></i></span></label>
                        <input type="number" id="fin-av70-${id}" step="1000" onchange="SD.updateFin(${id},'primesAvant70',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Primes après 70 ans <span class="info-tip" data-tip="Art. 757 B : abattement global 30 500 € (partagé). Intérêts exonérés. Au-delà : DMTG classiques."><i class="fas fa-info-circle"></i></span></label>
                        <input type="number" id="fin-apres70-${id}" step="1000" onchange="SD.updateFin(${id},'primesApres70',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Clause bénéficiaire</label>
                        <select onchange="SD.updateFin(${id},'clauseBeneficiaire',this.value)">
                            <option value="standard">Standard (PP aux bénéficiaires)</option>
                            <option value="demembree">Démembrée (quasi-usufruit conjoint)</option>
                            <option value="personnalisee">Personnalisée</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                    <button type="button" style="font-size:.62rem;padding:4px 10px;border-radius:4px;background:rgba(198,134,66,.08);border:1px solid rgba(198,134,66,.15);color:var(--text-secondary);cursor:pointer;" onclick="SD.avJeNeSaisPas(${id})">
                        🤷 Je ne sais pas → calcul conservateur
                    </button>
                    <span id="fin-av-warn-${id}" style="font-size:.58rem;color:var(--accent-amber);display:none;">⚠️ Tout traité comme après 70 ans (art. 757 B) — abattement réduit</span>
                </div>
                <div id="fin-av-beneficiaires-${id}" style="margin-top:10px;"></div>
            </div>
        </div>`;
        el('finance-list').insertAdjacentHTML('beforeend', html);
        refreshFinUI(id);
        refreshAVBeneficiaires(id);
    }

    function removeFinancial(id) { state.finance = state.finance.filter(i => i.id !== id); el('fin-' + id)?.remove(); }
    function updateFin(id, field, val) { const item = state.finance.find(i => i.id === id); if (item) item[field] = val; }

    function avJeNeSaisPas(id) {
        const item = state.finance.find(i => i.id === id);
        if (!item) return;
        // Conservateur: tout comme après 70 ans
        item.primesAvant70 = 0;
        item.primesApres70 = item.versements || item.valeur || 0;
        item.avUnknown = true;
        const inputAv = el('fin-av70-' + id);
        const inputAp = el('fin-apres70-' + id);
        if (inputAv) inputAv.value = 0;
        if (inputAp) inputAp.value = item.primesApres70;
        const warn = el('fin-av-warn-' + id);
        if (warn) warn.style.display = '';
    }

    function refreshAVBeneficiaires(id) {
        const container = el('fin-av-beneficiaires-' + id);
        if (!container) return;
        const item = state.finance.find(i => i.id === id);
        if (!item || item.type !== 'av') { container.innerHTML = ''; return; }

        const bens = state.beneficiaries;
        if (bens.length === 0) {
            container.innerHTML = '<div style="font-size:.62rem;color:var(--text-muted);"><i class="fas fa-info-circle"></i> Ajoutez des bénéficiaires en étape 1 pour désigner les bénéficiaires AV.</div>';
            return;
        }

        if (!item.avBeneficiaires) {
            // Default: equal split
            item.avBeneficiaires = bens.map(b => ({ benId: b.id, pct: Math.round(100 / bens.length) }));
        }

        let html = '<div style="font-size:.68rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;"><i class="fas fa-users"></i> Bénéficiaires désignés du contrat AV</div>';
        const total = item.avBeneficiaires.reduce((s, ab) => s + (ab.pct || 0), 0);
        html += item.avBeneficiaires.map(ab => {
            const b = bens.find(bb => bb.id === ab.benId);
            if (!b) return '';
            return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <span style="font-size:.65rem;flex:1;">${b.prenom || 'Bénéf.'}</span>
                <input type="number" class="form-input" value="${ab.pct}" min="0" max="100"
                       style="font-size:.65rem;height:24px;width:60px;text-align:center;"
                       onchange="SD.updateAVBenPct(${id},${ab.benId},+this.value)">
                <span style="font-size:.6rem;color:var(--text-muted);">%</span>
            </div>`;
        }).join('');
        html += `<div style="font-size:.58rem;margin-top:4px;color:${total === 100 ? 'var(--accent-green)' : 'var(--accent-coral)'};">Total : ${total}%${total !== 100 ? ' ⚠️ doit être 100%' : ' ✓'}</div>`;
        container.innerHTML = html;
    }

    function updateAVBenPct(finId, benId, pct) {
        const item = state.finance.find(i => i.id === finId);
        if (!item || !item.avBeneficiaires) return;
        const ab = item.avBeneficiaires.find(a => a.benId === benId);
        if (ab) ab.pct = pct;
        refreshAVBeneficiaires(finId);
    }
    function refreshFinUI(id) {
        const item = state.finance.find(i => i.id === id);
        const avSection = el('fin-av-' + id);
        if (avSection) avSection.style.display = (item && ['assurance_vie', 'contrat_capi'].includes(item.type)) ? '' : 'none';

        // Populate owner dropdown
        const ownerSelect = el('fin-owner-' + id);
        if (ownerSelect && item) {
            const persons = getPersonsList();
            const current = item.ownerId;
            ownerSelect.innerHTML = `<option value="">— Choisir le titulaire —</option>` +
                persons.map(p => `<option value="${p.id}" ${current === p.id ? 'selected' : ''}>${p.nom} (${p.type === 'donor' ? 'donateur' : 'bénéf.'})</option>`).join('');
        }
    }

    // ============================================================
    // PROFESSIONNEL
    // ============================================================
    function addProfessional() {
        const id = proIdCounter++;
        state.pro.push({ id, type: 'sarl', valeur: 0, pctDetention: 100, dutreil: false });
        const html = `
        <div class="list-item" id="pro-${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-store"></i> Actif professionnel ${id + 1}</div>
                <button class="btn-remove" onclick="SD.removePro(${id})"><i class="fas fa-times"></i></button>
            </div>
            <div class="form-grid cols-4">
                <div class="form-group">
                    <label class="form-label">Structure</label>
                    <select onchange="SD.updatePro(${id},'type',this.value)">
                        <option value="sarl">SARL</option><option value="sas">SAS/SASU</option>
                        <option value="eurl">EURL</option><option value="ei">EI</option>
                        <option value="fonds">Fonds de commerce</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Valeur des parts (€)</label>
                    <input type="number" step="1000" onchange="SD.updatePro(${id},'valeur',+this.value)" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">% détention</label>
                    <input type="number" min="1" max="100" onchange="SD.updatePro(${id},'pctDetention',+this.value)" value="100">
                </div>
                <div class="form-group">
                    <label class="form-label">Pacte Dutreil <span class="info-tip" data-tip="Abattement 75% sur droits + réduction 50% si donation PP avant 70 ans. Conditions strictes."><i class="fas fa-info-circle"></i></span></label>
                    <select onchange="SD.updatePro(${id},'dutreil',this.value==='oui')">
                        <option value="non">Non</option><option value="oui">Oui (−75%)</option>
                    </select>
                </div>
            </div>
        </div>`;
        el('pro-list').insertAdjacentHTML('beforeend', html);
    }
    function removePro(id) { state.pro = state.pro.filter(i => i.id !== id); el('pro-' + id)?.remove(); }
    function updatePro(id, field, val) { const item = state.pro.find(i => i.id === id); if (item) item[field] = val; }

    // ============================================================
    // DETTES
    // ============================================================
    function addDebt() {
        const id = debtIdCounter++;
        state.debts.push({ id, type: 'credit_conso', montant: 0, adi: false, ownerId: '' });
        const persons = getPersonsList();
        const personOpts = `<option value="">— Débiteur —</option>` +
            persons.map(p => `<option value="${p.id}">${p.nom}</option>`).join('');
        const html = `
        <div class="list-item" id="debt-${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-file-invoice-dollar"></i> Dette hors immo ${id + 1}</div>
                <button class="btn-remove" onclick="SD.removeDebt(${id})"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:.58rem;color:var(--text-muted);margin-bottom:8px;padding:4px 8px;border-radius:4px;background:rgba(198,134,66,.03);"><i class="fas fa-info-circle"></i> Les crédits immobiliers se saisissent directement dans chaque fiche bien (ci-dessus).</div>
            <div class="form-grid cols-2" style="margin-bottom:8px;">
                <div class="form-group">
                    <label class="form-label" style="font-size:.72rem;"><i class="fas fa-user"></i> Débiteur (qui doit ?)</label>
                    <select class="form-input" style="font-size:.75rem;height:34px;" onchange="SD.updateDebt(${id},'ownerId',this.value)">
                        ${personOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select onchange="SD.updateDebt(${id},'type',this.value)">
                        <option value="credit_conso">Crédit consommation</option>
                        <option value="dette_pro">Dette professionnelle</option>
                        <option value="impot">Impôt dû</option>
                        <option value="autre">Autre</option>
                    </select>
                </div>
            </div>
            <div class="form-grid cols-2">
                <div class="form-group">
                    <label class="form-label">Montant (€)</label>
                    <input type="number" step="1000" onchange="SD.updateDebt(${id},'montant',+this.value)" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Assurance décès (ADI)</label>
                    <select onchange="SD.updateDebt(${id},'adi',this.value==='oui')">
                        <option value="non">Non (déductible)</option>
                        <option value="oui">Oui (NON déductible)</option>
                    </select>
                </div>
            </div>
        </div>`;
        el('debt-list').insertAdjacentHTML('beforeend', html);
    }
    function removeDebt(id) { state.debts = state.debts.filter(i => i.id !== id); el('debt-' + id)?.remove(); }
    function updateDebt(id, field, val) { const item = state.debts.find(i => i.id === id); if (item) item[field] = val; }

    // ============================================================
    // SYNTHESE PATRIMONIALE
    // ============================================================
    function gatherInputs() {
        // Donateurs : prendre depuis PathOptimizer si disponible
        if (typeof PathOptimizer !== 'undefined') {
            const pDonors = PathOptimizer.getDonors();
            if (pDonors.length > 0) {
                state.donor1.age = pDonors[0].age || 60;
                state.mode = pDonors.length >= 2 && pDonors[0].role === 'parent' && pDonors[1].role === 'parent' ? 'couple' : 'solo';
                if (pDonors.length >= 2) state.donor2.age = pDonors[1].age || null;
            }
        } else {
            const d1Age = el('donor1-age');
            state.donor1.age = d1Age ? (+d1Age.value || null) : null;
        }

        // Régime + DDV (maintenant dans Step 4)
        const regimeEl = el('regime-matrimonial');
        if (regimeEl) state.regime = regimeEl.value;
        const ddvEl = el('switch-ddv');
        if (ddvEl) state.ddv = ddvEl.classList.contains('on');

        if (state.detailMode === 'simplifie') {
            state.patrimoine.total = +el('total-patrimoine').value || 0;
            state.patrimoine.rp = +el('montant-rp').value || 0;
            state.patrimoine.dettes = +el('total-dettes').value || 0;
            state.patrimoine.type = el('type-dominant').value;
        }
        state.operation = document.querySelector('#operation-toggle .toggle-btn.active')?.dataset.value || 'donation';
        state.donationType = el('donation-type')?.value || 'donation_partage';
        state.demembrement = el('switch-demembrement')?.classList.contains('on') || false;
        state.usufruit = el('usufruit-type')?.value || 'viager';
        state.exoLogement.active = el('switch-790abis')?.classList.contains('on') || false;
        if (state.exoLogement.active) {
            state.exoLogement.objet = el('exo-logement-objet')?.value || 'acquisition_neuf';
            state.exoLogement.montant = Math.min(+el('exo-logement-montant')?.value || 0, FISCAL.exoLogement.maxParDonateur);
        }
    }

    function computePatrimoine() {
        if (state.detailMode === 'simplifie') {
            const rp = state.patrimoine.rp || 0;
            return {
                actifBrut: state.patrimoine.total,
                immo: rp, immoBrut: rp,
                financier: Math.max(0, state.patrimoine.total - rp),
                pro: 0,
                passif: state.patrimoine.dettes,
                actifNet: state.patrimoine.total - state.patrimoine.dettes,
                revenus: 0, charges: 0
            };
        }
        const immoTotal = state.immo.reduce((s, i) => s + (i.valeur || 0), 0);
        const finTotal = state.finance.reduce((s, i) => s + (i.valeur || 0), 0);
        const proTotal = state.pro.reduce((s, i) => s + ((i.valeur || 0) * (i.pctDetention || 100) / 100), 0);
        const debtsDirect = state.debts.filter(d => !d.adi).reduce((s, d) => s + (d.montant || 0), 0);
        const immoCredits = state.immo.filter(i => !i.creditADI).reduce((s, i) => s + (i.credit || 0), 0);
        const passif = debtsDirect + immoCredits + 1500; // + frais funéraires forfait
        const revenus = state.immo.reduce((s, i) => s + (i.loyerMensuel || 0) * 12, 0);
        const charges = state.immo.reduce((s, i) => s + (i.taxeFonciere || 0) + (i.chargesCopro || 0) + (i.assurancePNO || 0) + (i.travauxEntretien || 0) + (i.fraisGestion || 0), 0);
        return {
            actifBrut: immoTotal + finTotal + proTotal,
            immo: immoTotal, immoBrut: immoTotal,
            financier: finTotal, pro: proTotal,
            passif, actifNet: immoTotal + finTotal + proTotal - passif,
            revenus, charges
        };
    }

    function updateSynthese() {
        gatherInputs();
        const s = computePatrimoine();
        el('synthese-patri').style.display = '';
        const rendement = s.actifBrut > 0 ? ((s.revenus - s.charges) / s.actifBrut * 100).toFixed(1) : '0';
        el('synthese-content').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="padding:16px;background:var(--bg-input);border-radius:10px;">
                <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;">Actif brut</div>
                <div style="font-size:1.4rem;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-green);">${fmt(s.actifBrut)}</div>
                <div style="margin-top:8px;font-size:.75rem;color:var(--text-secondary);">
                    Immobilier : ${fmt(s.immo)} · Financier : ${fmt(s.financier)} · Pro : ${fmt(s.pro)}
                </div>
            </div>
            <div style="padding:16px;background:var(--bg-input);border-radius:10px;">
                <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;">Actif net taxable</div>
                <div style="font-size:1.4rem;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-cyan);">${fmt(s.actifNet)}</div>
                <div style="margin-top:8px;font-size:.75rem;color:var(--text-secondary);">
                    Passif : ${fmt(-s.passif)}${s.revenus > 0 ? ` · Rendement : ${fmt(s.revenus - s.charges)}/an (${rendement}%)` : ''}
                </div>
            </div>
        </div>`;
    }

    // ============================================================
    // 5. CALC — Moteur de calcul
    // ============================================================
    function getAbattement(lien, isSuccession) {
        const a = FISCAL.abattements;
        if (lien === 'conjoint_pacs') return isSuccession ? Infinity : a.conjoint_pacs_donation;
        return a[lien] || a.tiers;
    }

    function getBareme(lien) {
        if (['enfant', 'petit_enfant', 'arriere_petit_enfant'].includes(lien)) return FISCAL.bareme_ligne_directe;
        if (lien === 'frere_soeur') return FISCAL.bareme_frere_soeur;
        if (lien === 'neveu_niece') return FISCAL.bareme_neveu_niece;
        return FISCAL.bareme_tiers;
    }

    function calcDroits(base, bareme) {
        if (base <= 0) return 0;
        let droits = 0, prev = 0;
        for (const tr of bareme) {
            const taxable = Math.min(base, tr.max) - prev;
            if (taxable > 0) droits += taxable * tr.taux;
            prev = tr.max;
            if (base <= tr.max) break;
        }
        return Math.max(0, Math.round(droits));
    }

    function getNPRatio(age) {
        for (const t of FISCAL.demembrement) {
            if (age <= t.maxAge) return t.np;
        }
        return 0.90;
    }

    function computeAV990I(capitalParBen, nbBen) {
        let totalTax = 0;
        for (let i = 0; i < nbBen; i++) {
            const base = Math.max(0, capitalParBen - FISCAL.av990I.abattement);
            if (base <= 0) continue;
            const tr1 = Math.min(base, FISCAL.av990I.seuil2);
            const tr2 = Math.max(0, base - tr1);
            totalTax += tr1 * FISCAL.av990I.taux1 + tr2 * FISCAL.av990I.taux2;
        }
        return Math.round(totalTax);
    }

    function calcDroitsForBens(montant, bens, nbDonors, isSuccession) {
        if (montant <= 0 || bens.length === 0) return 0;
        let total = 0;
        bens.forEach(b => {
            const part = montant / bens.length;
            const abat = getAbattement(b.lien, isSuccession) * nbDonors - (b.donationAnterieure || 0);
            const handicapAbat = b.handicap ? FISCAL.abattements.handicap : 0;
            const base = Math.max(0, part - abat - handicapAbat);
            total += calcDroits(base, getBareme(b.lien));
        });
        return total;
    }

    // ============================================================
    // SCENARIOS GENERATOR
    // ============================================================
    function calculateResults() {
        gatherInputs();
        const pat = computePatrimoine();
        const bens = state.beneficiaries.filter(b => b.lien !== 'conjoint_pacs');
        const nbBens = Math.max(1, bens.length);
        const donorAge = state.donor1.age || 60;
        const nbDonors = state.mode === 'couple' ? 2 : 1;
        const totalNet = pat.actifNet;
        const avTotal = state.finance.reduce((s, f) => f.type === 'assurance_vie' ? s + (f.valeur || 0) : s, 0)
            || (state.detailMode === 'simplifie' ? pat.financier * 0.5 : 0);

        const scenarios = [];

        // 1. Succession brute
        const droitsSucc = calcDroitsForBens(totalNet, bens, nbDonors, true);
        const fraisSucc = Math.round(totalNet * FISCAL.fraisNotaireSuccPct);
        scenarios.push({
            name: 'Succession\nsans optimisation', short: 'Succession brute',
            actifTransmis: totalNet, droits: droitsSucc, frais: fraisSucc, fraisAn: 0,
            net: totalNet - droitsSucc - fraisSucc
        });

        // 2. Donation PP
        const droitsDonPP = calcDroitsForBens(totalNet, bens, nbDonors, false);
        const fraisDonPP = Math.round(totalNet * FISCAL.fraisNotairePct);
        scenarios.push({
            name: 'Donation directe\npleine propriété', short: 'Donation PP',
            actifTransmis: totalNet, droits: droitsDonPP, frais: fraisDonPP, fraisAn: 0,
            net: totalNet - droitsDonPP - fraisDonPP
        });

        // 3. Donation démembrée (NP) sans structure
        const npRatio = getNPRatio(donorAge);
        const valeurNP = Math.round(totalNet * npRatio);
        const droitsNP = calcDroitsForBens(valeurNP, bens, nbDonors, false);
        const fraisNP = Math.round(valeurNP * FISCAL.fraisNotairePct);
        scenarios.push({
            name: `Donation NP (${Math.round(npRatio * 100)}%)\nsans structure`, short: `Donation NP ${Math.round(npRatio * 100)}%`,
            actifTransmis: totalNet, droits: droitsNP, frais: fraisNP, fraisAn: 0,
            net: totalNet - droitsNP - fraisNP,
            note: `NP = ${Math.round(npRatio * 100)}% (donateur ${donorAge} ans)`
        });

        // 4. Assurance-vie (990 I)
        if (avTotal > 0 || pat.financier > 50000) {
            const avCap = avTotal || Math.min(pat.financier, FISCAL.av990I.abattement * nbBens * 1.2);
            const taxAV = computeAV990I(avCap / nbBens, nbBens);
            const reste = totalNet - avCap;
            const droitsReste = reste > 0 ? calcDroitsForBens(reste, bens, nbDonors, true) : 0;
            scenarios.push({
                name: 'Assurance-vie\n(art. 990 I)', short: 'Assurance-vie',
                actifTransmis: totalNet, droits: taxAV + droitsReste,
                frais: Math.round(avCap * 0.005), fraisAn: Math.round(avCap * 0.007),
                net: totalNet - taxAV - droitsReste - Math.round(avCap * 0.005),
                note: `${fmt(avCap)} en AV · abat. ${fmt(FISCAL.av990I.abattement)}/bénéf.`
            });
        }

        // 5. AV clause démembrée
        if ((avTotal > 0 || pat.financier > 100000) && state.demembrement) {
            const avCap = avTotal || Math.min(pat.financier, FISCAL.av990I.abattement * nbBens * 1.5);
            const taxAV = computeAV990I(avCap / nbBens, nbBens);
            const reste = Math.max(0, totalNet - avCap - avCap); // créance de restitution
            const droitsReste = calcDroitsForBens(reste, bens, nbDonors, true);
            scenarios.push({
                name: 'AV démembrée\n+ quasi-usufruit', short: 'AV + quasi-US',
                actifTransmis: totalNet, droits: taxAV + droitsReste,
                frais: Math.round(avCap * 0.005) + 800, fraisAn: Math.round(avCap * 0.007),
                net: totalNet - taxAV - droitsReste - Math.round(avCap * 0.005) - 800,
                note: 'Créance de restitution déductible'
            });
        }

        // 5bis. Exonération 790 A bis (logement neuf/réno) — temporaire jusqu'au 31/12/2026
        if (state.exoLogement.active && state.exoLogement.montant > 0) {
            const exoMontant = Math.min(state.exoLogement.montant, FISCAL.exoLogement.maxParDonateur) * nbDonors;
            // Cumul : abat enfant 100k + don familial 31 865 + exo 790 A bis 100k = 231 865 / parent / enfant
            const abatCumul = (FISCAL.abattements.enfant + FISCAL.abattements.don_familial_argent + FISCAL.exoLogement.maxParDonateur) * nbDonors;
            const resteDon = Math.max(0, totalNet - exoMontant);
            const droitsDonExo = calcDroitsForBens(Math.max(0, resteDon - (FISCAL.abattements.enfant + FISCAL.abattements.don_familial_argent) * nbDonors * nbBens / Math.max(1, nbBens)), bens, nbDonors, false);
            const fraisExo = Math.round(resteDon * FISCAL.fraisNotairePct);
            scenarios.push({
                name: 'Don 790 A bis\n⏰ logement neuf/réno', short: '⚠️ Exo. logement 2026',
                actifTransmis: totalNet, droits: droitsDonExo, frais: fraisExo, fraisAn: 0,
                net: totalNet - droitsDonExo - fraisExo,
                note: `${fmt(exoMontant)} exonérés (790 A bis) · Abat. cumulé max ${fmt(abatCumul)}/enfant`
            });
        }

        // 6. SCI IR + donation NP parts
        if (pat.immo > 100000) {
            const decote = 0.15;
            const valParts = pat.immo * (1 - decote);
            const valNPParts = Math.round(valParts * npRatio);
            const droitsSCI = calcDroitsForBens(valNPParts, bens, nbDonors, false);
            const droitsFin = pat.financier > 0 ? calcDroitsForBens(pat.financier, bens, nbDonors, true) : 0;
            const fraisSCI = Math.round(valNPParts * FISCAL.fraisNotairePct) + FISCAL.fraisStructure.creation;
            scenarios.push({
                name: 'SCI IR + donation\nNP parts (−15%)', short: 'SCI IR + NP',
                actifTransmis: totalNet, droits: droitsSCI + droitsFin,
                frais: fraisSCI, fraisAn: FISCAL.fraisStructure.sci_ir,
                net: totalNet - droitsSCI - droitsFin - fraisSCI,
                note: `Décote 15% · NP ${Math.round(npRatio * 100)}%`
            });
        }

        // 7. Contrat de capitalisation démembré
        if (pat.financier > 150000) {
            const valNPCapi = Math.round(pat.financier * npRatio);
            const droitsCapi = calcDroitsForBens(valNPCapi, bens, nbDonors, false);
            const droitsImmo = pat.immo > 0 ? calcDroitsForBens(pat.immo, bens, nbDonors, true) : 0;
            const fraisCapi = Math.round(valNPCapi * FISCAL.fraisNotairePct);
            scenarios.push({
                name: 'Contrat capi.\ndémembré', short: 'Capi. démembré',
                actifTransmis: totalNet, droits: droitsCapi + droitsImmo,
                frais: fraisCapi, fraisAn: Math.round(pat.financier * 0.007),
                net: totalNet - droitsCapi - droitsImmo - fraisCapi,
                note: `NP ${Math.round(npRatio * 100)}% · antériorité conservée`
            });
        }

        // Sort best first
        scenarios.sort((a, b) => b.net - a.net);
        renderResults(scenarios, pat);

        // Path optimizer — multi-donateurs
        if (typeof PathOptimizer !== 'undefined') {
            const pathDonors = PathOptimizer.getDonors();
            const wrapper = document.getElementById('path-results-wrapper');
            if (pathDonors.length > 0 && wrapper) {
                wrapper.style.display = '';
                PathOptimizer.renderPathResults();
            } else if (wrapper) {
                wrapper.style.display = 'none';
            }
        }

        goToStep(5);
    }

    // ============================================================
    // 6. RENDER — Affichage des résultats
    // ============================================================
    function renderResults(scenarios, pat) {
        const best = scenarios[0];
        const baseline = scenarios.find(s => s.short === 'Succession brute') || scenarios[scenarios.length - 1];

        // Hero
        el('best-net-amount').textContent = fmt(best.net);
        const savings = best.net - baseline.net;
        el('savings-badge').textContent = savings > 0
            ? `💰 ${fmt(savings)} économisés vs succession brute`
            : `Meilleur scénario : ${best.short}`;

        // Warnings
        renderWarnings(pat);

        // Comparison table
        const headerRow = el('table-header');
        const tbody = el('table-body');
        headerRow.innerHTML = '<th>Critère</th>' + scenarios.map((s, i) =>
            `<th class="${i === 0 ? 'best-col-header' : ''}">${s.short}</th>`
        ).join('');

        const rows = [
            { label: 'Actif transmis', key: 'actifTransmis' },
            { label: 'Droits de mutation', key: 'droits' },
            { label: 'Frais (notaire, structure)', key: 'frais' },
            { label: 'Frais annuels', key: 'fraisAn' }
        ];
        tbody.innerHTML = rows.map(r =>
            `<tr><td>${r.label}</td>${scenarios.map((s, i) =>
                `<td class="${i === 0 ? 'best-col' : ''}">${fmt(s[r.key])}</td>`
            ).join('')}</tr>`
        ).join('') +
        `<tr class="row-total"><td><strong>MONTANT NET TRANSMIS</strong></td>${scenarios.map((s, i) =>
            `<td class="${i === 0 ? 'best-col' : ''}" style="color:${i === 0 ? 'var(--accent-green)' : 'var(--text-primary)'};">${fmt(s.net)}</td>`
        ).join('')}</tr>` +
        `<tr><td>% conservé</td>${scenarios.map((s, i) =>
            `<td class="${i === 0 ? 'best-col' : ''}">${pat.actifNet > 0 ? Math.round(s.net / pat.actifNet * 100) + '%' : '—'}</td>`
        ).join('')}</tr>`;

        // Bar chart
        const maxNet = Math.max(...scenarios.map(s => s.net));
        el('chart-bars').innerHTML = scenarios.map((s, i) => {
            const pct = maxNet > 0 ? Math.round(s.net / maxNet * 100) : 0;
            const cls = i === 0 ? 'best' : (i >= scenarios.length - 1 ? 'worst' : (i === 1 ? 'neutral' : 'mid'));
            return `<div class="chart-bar-row">
                <div class="chart-bar-label">${s.short}</div>
                <div class="chart-bar-track">
                    <div class="chart-bar-fill ${cls}" style="width:${pct}%;">${fmt(s.net)}</div>
                </div>
            </div>`;
        }).join('');

        // Strategy
        renderStrategy(scenarios, pat);

        // Per beneficiary
        renderBeneficiaryDetail(scenarios[0]);
    }

    function renderWarnings(pat) {
        let html = '';
        const donorAge = state.donor1.age || 60;
        if (donorAge >= 70) {
            html += `<div class="warning-box warn"><i class="fas fa-exclamation-triangle"></i><span>Donateur de ${donorAge} ans : les versements AV relèveront de l'art. 757 B (abattement réduit à 30 500 € global). Privilégiez les primes <strong>avant 70 ans</strong>.</span></div>`;
        }
        const totalAV = state.finance.filter(f => f.type === 'assurance_vie').reduce((s, f) => s + (f.valeur || 0), 0);
        if (totalAV > 0 && pat.actifBrut > 0 && totalAV / pat.actifBrut > FISCAL.primesExagSeuil) {
            html += `<div class="warning-box warn"><i class="fas fa-exclamation-triangle"></i><span>Primes AV = ${Math.round(totalAV / pat.actifBrut * 100)}% du patrimoine : risque de « primes manifestement exagérées ».</span></div>`;
        }
        // Check SCI IR + meublé
        const sciMeuble = state.immo.find(i => i.structure === 'sci_ir' && i.usageActuel === 'locatif' &&
            ['meuble_longue_duree', 'meuble_courte', 'meuble_saisonnier'].includes(i.typeLocation));
        if (sciMeuble) {
            html += `<div class="warning-box error"><i class="fas fa-ban"></i><span>Bien "${sciMeuble.label || 'immo'}" : SCI IR + meublé = risque requalification IS si revenus meublés > 10%.</span></div>`;
        }
        // 790 A bis deadline
        if (state.exoLogement.active) {
            html += `<div class="warning-box urgent"><i class="fas fa-hourglass-half"></i><span><strong>Art. 790 A bis :</strong> exonération temporaire jusqu'au <span class="countdown-text">31/12/2026</span>. Fonds à utiliser sous <span class="countdown-text">6 mois</span>. Conservation du logement <span class="countdown-text">5 ans</span> minimum. Pensez à déclarer le don en ligne sur impots.gouv.fr (obligatoire depuis 01/2026).</span></div>`;
        }
        // Don manuel online declaration
        if (state.donationType === 'don_manuel') {
            html += `<div class="warning-box info"><i class="fas fa-laptop"></i><span><strong>Depuis le 01/01/2026 :</strong> les dons manuels doivent être déclarés en ligne (rubrique « Déclarer un don » sur impots.gouv.fr). Paiement par CB ou prélèvement. Cerfa 2735 papier uniquement en cas de dispense.</span></div>`;
        }
        el('results-warnings').innerHTML = html;
    }


    function renderStrategy(scenarios, pat) {
        const best = scenarios[0];
        const donorAge = state.donor1.age || 60;
        const nbBens = Math.max(1, state.beneficiaries.filter(b => b.lien !== 'conjoint_pacs').length);
        const npRatio = getNPRatio(donorAge);
        const steps = [];
        const timeline = [];

        if (donorAge < 70 && pat.financier > 50000) {
            const avOptimal = Math.min(pat.financier, FISCAL.av990I.abattement * nbBens);
            steps.push({
                title: `Verser ${fmt(avOptimal)} sur assurance-vie`,
                desc: `Abattement ${fmt(FISCAL.av990I.abattement)} par bénéficiaire hors droits (art. 990 I). À faire avant 70 ans.`,
                amount: avOptimal
            });
            timeline.push({ when: 'Maintenant', action: `Alimenter AV : ${fmt(avOptimal)}` });
        }

        // 790 A bis — exonération temporaire logement
        if (state.exoLogement.active && state.exoLogement.montant > 0) {
            const exoAmt = Math.min(state.exoLogement.montant, FISCAL.exoLogement.maxParDonateur) * nbDonors;
            steps.push({
                title: `⏰ Don exonéré logement neuf/réno : ${fmt(exoAmt)}`,
                desc: `Art. 790 A bis — EXPIRE le 31/12/2026. Utilisation des fonds sous 6 mois. Conservation 5 ans. Cumulable avec abattement enfant + don familial argent.`,
                amount: exoAmt,
                urgent: true
            });
            timeline.push({ when: '⚠️ Avant 31/12/2026', action: `Don 790 A bis : ${fmt(exoAmt)}` });
        }

        if (pat.immo > 100000) {
            steps.push({
                title: `Donation NP${pat.immo > 200000 ? ' parts SCI (−15% décote)' : ' en direct'}`,
                desc: `NP = ${Math.round(npRatio * 100)}% à ${donorAge} ans. Vous conservez l'usufruit (revenus locatifs).`,
                amount: Math.round(pat.immo * 0.85 * npRatio)
            });
            timeline.push({ when: 'Année +1', action: pat.immo > 200000 ? 'Créer SCI + donation NP parts' : 'Donation NP en direct' });
        }

        steps.push({
            title: 'Reconstitution des abattements (15 ans)',
            desc: `Abattements de ${fmt(getAbattement('enfant', false))}/enfant/parent renouvelables tous les 15 ans. Planifiez une seconde donation.`,
            amount: null
        });
        timeline.push({ when: '+15 ans', action: 'Nouvelle donation (abattements reconstitués)' });
        timeline.push({ when: 'Terme', action: 'Réunion US/NP → pleine propriété' });

        el('strategy-steps').innerHTML = steps.map((step, i) =>
            `<div class="strategy-step${step.urgent ? ' urgent-border' : ''}" ${step.urgent ? 'style="border-color:rgba(255,107,107,.25);"' : ''}>
                <div class="strategy-step-num" ${step.urgent ? 'style="background:linear-gradient(135deg,#FF6B6B,#E85D5D);"' : ''}>${i + 1}</div>
                <div class="strategy-step-content">
                    <h4>${step.title}${step.urgent ? ' <span class="badge-urgent" style="font-size:.65rem;padding:2px 8px;"><i class="fas fa-hourglass-half"></i> Urgent</span>' : ''}</h4>
                    <p>${step.desc}</p>
                    ${step.amount ? `<div class="amount">${fmt(step.amount)}</div>` : ''}
                </div>
            </div>`
        ).join('');
        el('strategy-total').textContent = fmt(best.net);

        el('timeline').innerHTML = timeline.map((t, i, arr) =>
            `<div class="timeline-node">
                <div class="timeline-dot"></div>
                <div class="timeline-label">${t.when}</div>
                <div class="timeline-desc">${t.action}</div>
            </div>${i < arr.length - 1 ? '<div class="timeline-connector"></div>' : ''}`
        ).join('');
    }

    function renderBeneficiaryDetail(best) {
        const bens = state.beneficiaries.filter(b => b.lien !== 'conjoint_pacs');
        if (bens.length === 0) { el('per-beneficiary-detail').innerHTML = ''; return; }
        const partNet = best.net / bens.length;
        const liens = {
            enfant: 'Enfant', petit_enfant: 'Petit-enfant', arriere_petit_enfant: 'Arrière-petit-enfant',
            conjoint_pacs: 'Conjoint/Pacsé', frere_soeur: 'Frère/Sœur', neveu_niece: 'Neveu/Nièce', tiers: 'Tiers'
        };
        el('per-beneficiary-detail').innerHTML = bens.map(b => `
            <div style="display:flex;align-items:center;gap:16px;padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:8px;">
                <div style="width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,.15);display:flex;align-items:center;justify-content:center;color:var(--accent-blue);"><i class="fas fa-user"></i></div>
                <div style="flex:1;">
                    <div style="font-weight:600;">${b.prenom || 'Bénéficiaire ' + (b.id + 1)}</div>
                    <div style="font-size:.75rem;color:var(--text-secondary);">${liens[b.lien] || b.lien} · Abat. ${fmt(getAbattement(b.lien, false))}${b.handicap ? ' + 159 325 € handicap' : ''}${b.donationAnterieure > 0 ? ' · déjà reçu ' + fmt(b.donationAnterieure) : ''}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-green);">${fmt(partNet)}</div>
                    <div style="font-size:.7rem;color:var(--text-secondary);">net estimé</div>
                </div>
            </div>
        `).join('');
    }

    // ============================================================
    // RESET
    // ============================================================
    function resetAll() {
        if (!confirm('Réinitialiser toutes les données ?')) return;
        location.reload();
    }

    // ============================================================
    // ASIDE STICKY RÉSUMÉ
    // ============================================================
    function updateAside() {
        // Donors (multi-donateur via PathOptimizer)
        const asideDonor = document.getElementById('aside-donor');
        if (asideDonor) {
            if (typeof PathOptimizer !== 'undefined') {
                const pDonors = PathOptimizer.getDonors();
                if (pDonors.length > 0) {
                    asideDonor.innerHTML = pDonors.map(d => 
                        `<div><span class="val-highlight">${d.nom}</span> · ${d.age} ans · ${PathOptimizer.fmt(d.patrimoine)}</div>`
                    ).join('');
                } else {
                    const age = el('donor1-age') ? el('donor1-age').value : '';
                    asideDonor.innerHTML = age ? `<span class="val-highlight">${age} ans</span> · ${state.operation === 'succession' ? 'Succession' : 'Donation'}` : 'Non renseigné';
                }
            } else {
                const age = el('donor1-age') ? el('donor1-age').value : '';
                asideDonor.innerHTML = age ? `<span class="val-highlight">${age} ans</span>` : 'Non renseigné';
            }
        }

        // Beneficiaries
        const benList = document.querySelectorAll('#beneficiaries-list .list-item');
        const asideBenef = document.getElementById('aside-benef');
        if (asideBenef) {
            if (benList.length > 0) {
                const types = {};
                benList.forEach(b => {
                    const sel = b.querySelector('select');
                    if (sel) { const v = sel.options[sel.selectedIndex]?.text || ''; types[v] = (types[v]||0) + 1; }
                });
                asideBenef.innerHTML = Object.entries(types).map(([k,v]) => `<span class="val-highlight">${v}</span> ${k}`).join(', ');
            } else {
                asideBenef.textContent = 'Aucun ajouté';
            }
        }

        // Patrimoine
        const asidePatri = document.getElementById('aside-patri');
        if (asidePatri) {
            const parts = [];
            const immoList = document.querySelectorAll('#immo-list .list-item');
            if (immoList.length > 0) parts.push(`${immoList.length} bien${immoList.length>1?'s':''} immo`);
            const finVal = el('fin-global') ? el('fin-global').value : '';
            if (finVal && +finVal > 0) parts.push(`${(+finVal).toLocaleString('fr-FR')} € financier`);
            const avVal = el('av-capital') ? el('av-capital').value : '';
            if (avVal && +avVal > 0) parts.push(`AV: ${(+avVal).toLocaleString('fr-FR')} €`);
            asidePatri.innerHTML = parts.length > 0 ? parts.map(p => `<div>${p}</div>`).join('') : 'Non renseigné';
        }

        // Warnings
        const asideWarn = document.getElementById('aside-warnings');
        if (asideWarn) {
            const warnings = [];
            if (benList.length === 0) warnings.push({cls:'amber', icon:'fa-user-plus', text:'Ajoutez des bénéficiaires'});
            const exoActive = document.getElementById('switch-790abis');
            if (exoActive && exoActive.checked) warnings.push({cls:'coral', icon:'fa-hourglass-half', text:'790 A bis — avant 31/12/2026'});
            if (currentStep >= 2 && (!el('fin-global') || !el('fin-global').value || +el('fin-global').value === 0) && document.querySelectorAll('#immo-list .list-item').length === 0) {
                warnings.push({cls:'amber', icon:'fa-coins', text:'Renseignez le patrimoine'});
            }
            if (warnings.length === 0) warnings.push({cls:'green', icon:'fa-check', text:'Tout est prêt'});
            asideWarn.innerHTML = warnings.map(w => `<div class="aside-warn-item ${w.cls}"><i class="fas ${w.icon}"></i> ${w.text}</div>`).join('');
        }

        // Progress
        const progress = document.getElementById('aside-progress');
        const hint = document.getElementById('aside-hint');
        if (progress) progress.style.width = `${(currentStep / 5) * 100}%`;
        if (hint) hint.textContent = `Étape ${currentStep} sur 5`;

        // CTA
        const asideCta = document.getElementById('aside-cta');
        if (asideCta) {
            if (currentStep === 4) { asideCta.textContent = 'Calculer →'; asideCta.onclick = () => SD.calculateResults(); }
            else if (currentStep === 5) { asideCta.textContent = '↺ Recommencer'; asideCta.onclick = () => SD.goToStep(1); }
            else { asideCta.textContent = 'Suivant →'; asideCta.onclick = () => SD.nextStep(); }
        }

        // Précédent in aside
        const asidePrev = document.getElementById('aside-prev');
        if (asidePrev) {
            asidePrev.style.display = currentStep > 1 ? '' : 'none';
            asidePrev.onclick = () => SD.prevStep();
        }
    }

    // ============================================================
    // INIT
    // ============================================================
    document.addEventListener('DOMContentLoaded', () => {
        applyPreset('2enfants');
        updateAside();

        // Close tooltips on outside click
        document.addEventListener('click', e => {
            if (!e.target.closest('.info-tip')) {
                document.querySelectorAll('.info-tip.open').forEach(t => t.classList.remove('open'));
            }
        });

        // Update aside on input changes
        document.addEventListener('input', () => { clearTimeout(window._asideTO); window._asideTO = setTimeout(updateAside, 300); });
        document.addEventListener('change', () => { clearTimeout(window._asideTO); window._asideTO = setTimeout(updateAside, 300); });
    });

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        goToStep, nextStep, prevStep,
        setMode, setDetailMode, setOperation,
        toggleSwitch, toggleSection, toggleCollapsible,
        applyPreset, addBeneficiary, removeBeneficiary, updateBen,
        addImmo, removeImmo, updateImmo, updateImmoTitle, refreshImmoUI,
        addImmoOwner, removeImmoOwner, updateImmoOwner,
        addFinancial, removeFinancial, updateFin, refreshFinUI, avJeNeSaisPas, refreshAVBeneficiaires, updateAVBenPct,
        addProfessional, removePro, updatePro,
        addDebt, removeDebt, updateDebt,
        calculateResults, resetAll, updateAside,
        buildFamilyTree,
        // Family graph UI
        renderFamilyTree, renderFamilyAll, renderFamilyPersons, renderFamilyRelations, renderFamilyRoles,
        addFamilyPerson, addFamilyRelation, updateFamilyRelation, removeFamilyRelation,
        addRelative, addRootPerson,
        applyFamilyPreset, syncGraphToStep2,
        _getState: () => state
    };

})();
