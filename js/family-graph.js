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
