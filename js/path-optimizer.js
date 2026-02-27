/**
 * ================================================================
 * PATH OPTIMIZER — Moteur d'optimisation multi-donateurs
 * ================================================================
 * Complète successions-donations.js sans le modifier.
 * 
 * Architecture :
 *   1. DONORS    — Gestion de la liste de donateurs multiples
 *   2. GRAPH     — Construction du graphe familial (donateurs ↔ bénéficiaires)
 *   3. PATHS     — Calcul de tous les chemins de transmission possibles
 *   4. OPTIMIZER — Classement des chemins par coût fiscal net
 *   5. UI        — Rendu de la matrice et des résultats de chemins
 * 
 * Dépendance : utilise SD (successions-donations.js) pour les constantes FISCAL,
 *              les fonctions calcDroits, getBareme, getAbattement, getNPRatio.
 * ================================================================
 */

const PathOptimizer = (() => {

    // ============================================================
    // 1. DONORS — Gestion multi-donateurs
    // ============================================================
    let donorIdCounter = 0;
    const donors = [];

    // Relations familiales et liens fiscaux auto-détectés
    const ROLE_MAP = {
        parent:        { versEnfant: 'enfant', versPetitEnfant: 'petit_enfant', versArrPetitEnfant: 'arriere_petit_enfant' },
        grand_parent:  { versEnfant: 'petit_enfant', versPetitEnfant: 'arriere_petit_enfant' },
        arr_grand_parent: { versEnfant: 'arriere_petit_enfant' },
        oncle_tante:   { versEnfant: 'neveu_niece' },
        conjoint:      { versEnfant: 'enfant' }, // beau-parent, même abattement si adoption
        tiers:         { versEnfant: 'tiers' }
    };

    // Abattements par lien (miroir FISCAL dans SD, mais accessible ici)
    const ABATTEMENTS = {
        enfant: 100000,
        petit_enfant: 31865,
        arriere_petit_enfant: 5310,
        conjoint_pacs_donation: 80724,
        conjoint_pacs_succession: Infinity,
        frere_soeur: 15932,
        neveu_niece: 7967,
        tiers: 1594,
        handicap: 159325,
        don_familial_argent: 31865,
        rappel_fiscal_ans: 15
    };

    const BAREMES = {
        ligne_directe: [
            { max: 8072, taux: 0.05 }, { max: 12109, taux: 0.10 },
            { max: 15932, taux: 0.15 }, { max: 552324, taux: 0.20 },
            { max: 902838, taux: 0.30 }, { max: 1805677, taux: 0.40 },
            { max: Infinity, taux: 0.45 }
        ],
        frere_soeur: [ { max: 24430, taux: 0.35 }, { max: Infinity, taux: 0.45 } ],
        neveu_niece: [ { max: Infinity, taux: 0.55 } ],
        tiers: [ { max: Infinity, taux: 0.60 } ]
    };

    const DEMEMBREMENT = [
        { maxAge: 20, np: 0.10 }, { maxAge: 30, np: 0.20 },
        { maxAge: 40, np: 0.30 }, { maxAge: 50, np: 0.40 },
        { maxAge: 60, np: 0.50 }, { maxAge: 70, np: 0.60 },
        { maxAge: 80, np: 0.70 }, { maxAge: 90, np: 0.80 },
        { maxAge: Infinity, np: 0.90 }
    ];

    function getNP(age) {
        for (const t of DEMEMBREMENT) { if (age <= t.maxAge) return t.np; }
        return 0.90;
    }

    function getBareme(lien) {
        if (['enfant', 'petit_enfant', 'arriere_petit_enfant'].includes(lien)) return BAREMES.ligne_directe;
        if (lien === 'frere_soeur') return BAREMES.frere_soeur;
        if (lien === 'neveu_niece') return BAREMES.neveu_niece;
        return BAREMES.tiers;
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

    function addDonor(role, nom, age, patrimoine, regime) {
        const id = donorIdCounter++;
        const donor = {
            id, role: role || 'parent', nom: nom || `Donateur ${id + 1}`,
            age: age || 60, patrimoine: patrimoine || 0,
            regime: regime || 'separation',
            donationsParBen: [] // [{benId, montant}] — donations déjà faites par bénéficiaire
        };
        donors.push(donor);
        renderDonorList();
        updateMatrix();
        return id;
    }

    function removeDonor(id) {
        const idx = donors.findIndex(d => d.id === id);
        if (idx >= 0) donors.splice(idx, 1);
        renderDonorList();
        updateMatrix();
        refreshBenDonSummaries();
    }

    function updateDonor(id, field, value) {
        const d = donors.find(d => d.id === id);
        if (!d) return;
        if (field === 'age' || field === 'patrimoine') {
            d[field] = +value || 0;
        } else {
            d[field] = value;
        }
        if (field === 'role' || field === 'age') updateMatrix();
        if (field === 'nom') renderDonorList(); // refresh dropdown labels
        if (typeof SD !== 'undefined' && SD.updateAside) SD.updateAside();
    }

    // Donation donateur → bénéficiaire spécifique
    function updateDonorDonation(donorId, benId, montant) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        let entry = d.donationsParBen.find(e => e.benId === benId);
        if (!entry) {
            entry = { benId, montant: 0 };
            d.donationsParBen.push(entry);
        }
        entry.montant = +montant || 0;
        // Re-render juste la barre d'abattement
        renderDonorDonationBar(donorId, benId);
        refreshBenDonSummaries();
    }

    function getDonorDonationForBen(donorId, benId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return 0;
        const entry = d.donationsParBen.find(e => e.benId === benId);
        return entry ? entry.montant : 0;
    }

    // Total des donations reçues par un bénéficiaire (tous donateurs confondus)
    function getTotalDonationsForBen(benId) {
        let total = 0;
        for (const d of donors) {
            const entry = d.donationsParBen.find(e => e.benId === benId);
            if (entry) total += entry.montant;
        }
        return total;
    }

    // Détail des donations reçues par bénéficiaire
    function getDonationDetailForBen(benId) {
        const details = [];
        for (const d of donors) {
            const entry = d.donationsParBen.find(e => e.benId === benId);
            if (entry && entry.montant > 0) {
                details.push({ donorId: d.id, donorNom: d.nom, donorRole: d.role, montant: entry.montant });
            }
        }
        return details;
    }

    function getDonors() { return [...donors]; }

    // ============================================================
    // 2. GRAPH — Liens familiaux auto-détectés
    // ============================================================
    function detectLien(donorRole, beneficiaryLien) {
        // donorRole = rôle du donateur dans la famille (parent, grand_parent, etc.)
        // beneficiaryLien = lien du bénéficiaire par rapport à la famille (enfant, petit_enfant, etc.)
        const map = ROLE_MAP[donorRole];
        if (!map) return 'tiers';

        // Mapping direct
        if (beneficiaryLien === 'enfant') return map.versEnfant || 'tiers';
        if (beneficiaryLien === 'petit_enfant') return map.versPetitEnfant || map.versEnfant || 'tiers';
        if (beneficiaryLien === 'arriere_petit_enfant') return map.versArrPetitEnfant || 'tiers';
        if (beneficiaryLien === 'neveu_niece') {
            if (donorRole === 'oncle_tante') return 'neveu_niece';
            return 'tiers';
        }
        if (beneficiaryLien === 'conjoint_pacs') return 'conjoint_pacs_donation';

        return 'tiers';
    }

    function buildGraph(beneficiaries) {
        // Retourne une matrice : pour chaque donateur × chaque bénéficiaire
        // { lienFiscal, abattement, bareme, npRatio, coutDirect }
        const matrix = [];
        for (const d of donors) {
            const row = { donor: d, links: [] };
            for (const b of beneficiaries) {
                const lien = detectLien(d.role, b.lien);
                const abat = ABATTEMENTS[lien] || ABATTEMENTS.tiers;
                const np = getNP(d.age);
                row.links.push({
                    beneficiary: b,
                    lienFiscal: lien,
                    abattement: abat,
                    bareme: getBareme(lien),
                    npRatio: np,
                    lienLabel: formatLien(lien)
                });
            }
            matrix.push(row);
        }
        return matrix;
    }

    function formatLien(lien) {
        const map = {
            enfant: 'Enfant (LD)', petit_enfant: 'Petit-enfant (LD)',
            arriere_petit_enfant: 'Arr. petit-enfant (LD)',
            conjoint_pacs_donation: 'Conjoint/PACS',
            frere_soeur: 'Frère/Sœur', neveu_niece: 'Neveu/Nièce',
            tiers: 'Tiers'
        };
        return map[lien] || 'Tiers';
    }

    function fmt(n) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    }

    // ============================================================
    // 3. PATHS — Calcul des chemins de transmission
    // ============================================================
    // Un chemin = séquence de hops : donateur → intermédiaire → ... → cible
    // Chaque hop a un coût fiscal (droits + frais notaire)

    function calcHopCost(montant, lienFiscal, donorAge, demembre, donationAnterieure) {
        const abat = ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers;
        const bareme = getBareme(lienFiscal);
        const fraisNotaire = 0.018;

        let assiette = montant;
        if (demembre) {
            assiette = Math.round(montant * getNP(donorAge));
        }

        const base = Math.max(0, assiette - abat + (donationAnterieure || 0));
        const droits = calcDroits(base, bareme);
        const frais = Math.round(assiette * fraisNotaire);

        return {
            assiette,
            abattementUtilise: Math.min(abat, assiette),
            baseTaxable: base,
            droits,
            frais,
            total: droits + frais,
            netTransmis: montant - droits - frais,
            demembre,
            lienFiscal
        };
    }

    function findAllPaths(targetBeneficiary, beneficiaries, maxHops) {
        // Pour un bénéficiaire cible, trouver tous les chemins possibles
        // depuis chaque donateur (direct ou via un intermédiaire)
        maxHops = maxHops || 2; // max 2 sauts (donateur → intermédiaire → cible)
        const paths = [];

        for (const donor of donors) {
            // === CHEMIN DIRECT : donateur → cible ===
            const lienDirect = detectLien(donor.role, targetBeneficiary.lien);
            const montant = donor.patrimoine;
            if (montant <= 0) continue;

            // Direct en PP
            const donAntDirect = getDonationsAntForDonor(targetBeneficiary.id, donor.id, donor.role);
            const hopPP = calcHopCost(montant, lienDirect, donor.age, false, donAntDirect);
            paths.push({
                type: 'direct_pp',
                label: `${donor.nom} → ${targetBeneficiary.prenom} (PP)`,
                hops: [{ from: donor.nom, to: targetBeneficiary.prenom, ...hopPP }],
                totalDroits: hopPP.droits,
                totalFrais: hopPP.frais,
                netFinal: hopPP.netTransmis,
                montantInitial: montant,
                tauxEffectif: ((hopPP.droits + hopPP.frais) / montant * 100).toFixed(1),
                complexity: 1,
                delaiAns: 0,
                risqueAge: donor.age > 75 ? 'élevé' : donor.age > 65 ? 'moyen' : 'faible',
                donor, target: targetBeneficiary
            });

            // Direct en NP démembrée
            const hopNP = calcHopCost(montant, lienDirect, donor.age, true, donAntDirect);
            paths.push({
                type: 'direct_np',
                label: `${donor.nom} → ${targetBeneficiary.prenom} (NP ${Math.round(getNP(donor.age) * 100)}%)`,
                hops: [{ from: donor.nom, to: targetBeneficiary.prenom, ...hopNP }],
                totalDroits: hopNP.droits,
                totalFrais: hopNP.frais,
                netFinal: hopNP.netTransmis,
                montantInitial: montant,
                tauxEffectif: ((hopNP.droits + hopNP.frais) / montant * 100).toFixed(1),
                complexity: 1,
                delaiAns: 0,
                risqueAge: donor.age > 75 ? 'élevé' : donor.age > 65 ? 'moyen' : 'faible',
                donor, target: targetBeneficiary
            });

            // === CHEMINS INDIRECTS : donateur → intermédiaire → cible ===
            if (maxHops < 2) continue;

            // L'intermédiaire peut être un autre bénéficiaire ou un donateur
            // Cas typique : grand-parent → parent (enfant) → petit-enfant (enfant du parent)
            for (const intermediaire of donors) {
                if (intermediaire.id === donor.id) continue;

                // Le donateur donne à l'intermédiaire, puis l'intermédiaire donne à la cible
                const lienDonorInter = detectLienBetweenDonors(donor.role, intermediaire.role);
                if (lienDonorInter === 'tiers') continue; // pas de lien familial direct

                const lienInterTarget = detectLien(intermediaire.role, targetBeneficiary.lien);
                if (lienInterTarget === 'tiers') continue; // l'intermédiaire n'a pas de lien avec la cible

                // Hop 1 : donateur → intermédiaire (inter-donateur, pas de rappel fiscal tracé)
                const hop1 = calcHopCost(montant, lienDonorInter, donor.age, false, 0);
                // Hop 2 : intermédiaire → cible (avec le net du hop 1)
                const hop2 = calcHopCost(hop1.netTransmis, lienInterTarget, intermediaire.age, false, 0);

                const totalDroits = hop1.droits + hop2.droits;
                const totalFrais = hop1.frais + hop2.frais;

                paths.push({
                    type: 'indirect',
                    label: `${donor.nom} → ${intermediaire.nom} → ${targetBeneficiary.prenom}`,
                    hops: [
                        { from: donor.nom, to: intermediaire.nom, ...hop1 },
                        { from: intermediaire.nom, to: targetBeneficiary.prenom, ...hop2 }
                    ],
                    totalDroits,
                    totalFrais,
                    netFinal: hop2.netTransmis,
                    montantInitial: montant,
                    tauxEffectif: ((totalDroits + totalFrais) / montant * 100).toFixed(1),
                    complexity: 2,
                    delaiAns: 0, // idéalement attendre 15 ans entre les deux
                    delaiOptimal: ABATTEMENTS.rappel_fiscal_ans,
                    risqueAge: donor.age > 75 ? 'élevé' : 'moyen',
                    donor, intermediaire, target: targetBeneficiary
                });

                // Indirect NP + PP : donateur donne NP à intermédiaire, intermédiaire donne PP à cible après reconstitution
                const hop1NP = calcHopCost(montant, lienDonorInter, donor.age, true, 0);
                const hop2FromNP = calcHopCost(hop1NP.netTransmis, lienInterTarget, intermediaire.age, false, 0);

                paths.push({
                    type: 'indirect_np',
                    label: `${donor.nom} →NP→ ${intermediaire.nom} → ${targetBeneficiary.prenom}`,
                    hops: [
                        { from: donor.nom, to: intermediaire.nom, ...hop1NP },
                        { from: intermediaire.nom, to: targetBeneficiary.prenom, ...hop2FromNP }
                    ],
                    totalDroits: hop1NP.droits + hop2FromNP.droits,
                    totalFrais: hop1NP.frais + hop2FromNP.frais,
                    netFinal: hop2FromNP.netTransmis,
                    montantInitial: montant,
                    tauxEffectif: (((hop1NP.droits + hop2FromNP.droits + hop1NP.frais + hop2FromNP.frais) / montant) * 100).toFixed(1),
                    complexity: 2,
                    delaiAns: 0,
                    delaiOptimal: ABATTEMENTS.rappel_fiscal_ans,
                    risqueAge: donor.age > 75 ? 'élevé' : 'moyen',
                    donor, intermediaire, target: targetBeneficiary,
                    note: `NP ${Math.round(getNP(donor.age) * 100)}% au 1er saut`
                });
            }
        }

        return paths;
    }

    function detectLienBetweenDonors(role1, role2) {
        // Grand-parent → Parent = lien enfant (ligne directe)
        if (role1 === 'grand_parent' && role2 === 'parent') return 'enfant';
        if (role1 === 'arr_grand_parent' && role2 === 'grand_parent') return 'enfant';
        if (role1 === 'arr_grand_parent' && role2 === 'parent') return 'petit_enfant';
        if (role1 === 'parent' && role2 === 'parent') return 'conjoint_pacs_donation'; // entre époux
        if (role1 === 'oncle_tante' && role2 === 'parent') return 'frere_soeur';
        return 'tiers';
    }

    // ============================================================
    // 4. OPTIMIZER — Classement et recommandations
    // ============================================================
    function optimizeForTarget(targetBeneficiary, beneficiaries) {
        const paths = findAllPaths(targetBeneficiary, beneficiaries, 2);
        if (paths.length === 0) return { best: null, alternatives: [], all: [] };

        // Tri par net final décroissant (le plus avantageux en premier)
        paths.sort((a, b) => b.netFinal - a.netFinal);

        // Tag best, best simple, best with delay
        const best = paths[0];
        const bestSimple = paths.find(p => p.complexity === 1) || best;
        const bestWithDelay = paths.find(p => p.type === 'indirect' && p.delaiOptimal) || null;

        return {
            best,
            bestSimple,
            bestWithDelay,
            all: paths,
            savings: best.netFinal - paths[paths.length - 1].netFinal,
            targetName: targetBeneficiary.prenom
        };
    }

    function optimizeAll(beneficiaries) {
        const results = {};
        for (const b of beneficiaries) {
            if (b.lien === 'conjoint_pacs') continue; // conjoint exonéré en succession
            results[b.id] = optimizeForTarget(b, beneficiaries);
        }
        return results;
    }

    // ============================================================
    // 5. UI — Rendu
    // ============================================================

    function renderDonorList() {
        const container = document.getElementById('donors-list');
        if (!container) return;
        const bens = getBeneficiaries();

        container.innerHTML = donors.map(d => {
            // Per-beneficiary donation rows
            let donBenHtml = '';
            if (bens.length > 0) {
                donBenHtml = `
                <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(198,134,66,.08);">
                    <label class="form-label" style="color:var(--accent-coral);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-history"></i> Donations déjà faites (rappel 15 ans) — à qui ?
                    </label>
                    ${bens.map(b => {
                        const montant = getDonorDonationForBen(d.id, b.id);
                        const lienFiscal = detectLien(d.role, b.lien);
                        const abat = ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers;
                        const restant = Math.max(0, abat - montant);
                        const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
                        const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';
                        return `
                        <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);">
                            <div>
                                <div style="font-size:.78rem;font-weight:600;color:var(--text-primary);">→ ${b.prenom || 'Bénéf. ' + (bens.indexOf(b)+1)} <span style="font-size:.62rem;color:var(--text-muted);">(${formatLien(lienFiscal)} · abat. ${fmt(abat)})</span></div>
                                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                                    <div style="flex:1;height:4px;border-radius:4px;background:rgba(198,134,66,.08);overflow:hidden;">
                                        <div id="don-bar-${d.id}-${b.id}" style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .3s;"></div>
                                    </div>
                                    <div id="don-rest-${d.id}-${b.id}" style="font-size:.62rem;white-space:nowrap;color:${restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'};">
                                        ${restant > 0 ? 'Restant : ' + fmt(restant) : 'Épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abat)}</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <input type="number" class="form-input" value="${montant}" min="0" step="1000"
                                       style="font-size:.75rem;height:34px;text-align:right;${montant > 0 ? 'border-color:rgba(255,107,107,.25);' : ''}"
                                       placeholder="0"
                                       onchange="PathOptimizer.updateDonorDonation(${d.id},${b.id},this.value)">
                            </div>
                        </div>`;
                    }).join('')}
                    ${bens.length === 0 ? '<div style="font-size:.72rem;color:var(--text-muted);">Ajoutez des bénéficiaires d\'abord.</div>' : ''}
                </div>`;
            } else {
                donBenHtml = `<div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(198,134,66,.03);font-size:.72rem;color:var(--text-muted);"><i class="fas fa-info-circle"></i> Ajoutez des bénéficiaires ci-dessus pour déclarer les donations déjà faites.</div>`;
            }

            return `
            <div class="list-item" data-donor-id="${d.id}" style="animation:fadeSlide .3s ease;">
                <div class="list-item-header">
                    <span class="list-item-title" id="donor-title-${d.id}">${d.nom}</span>
                    <button class="btn-remove" onclick="PathOptimizer.removeDonor(${d.id})"><i class="fas fa-times"></i></button>
                </div>
                <div class="form-grid cols-2">
                    <div class="form-group">
                        <label class="form-label">Nom / Identifiant</label>
                        <input type="text" class="form-input" value="${d.nom}" 
                               onchange="PathOptimizer.updateDonor(${d.id},'nom',this.value); document.getElementById('donor-title-${d.id}').textContent=this.value">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rôle familial</label>
                        <select class="form-input" onchange="PathOptimizer.updateDonor(${d.id},'role',this.value)">
                            <option value="parent" ${d.role === 'parent' ? 'selected' : ''}>Parent</option>
                            <option value="grand_parent" ${d.role === 'grand_parent' ? 'selected' : ''}>Grand-parent</option>
                            <option value="arr_grand_parent" ${d.role === 'arr_grand_parent' ? 'selected' : ''}>Arrière-grand-parent</option>
                            <option value="oncle_tante" ${d.role === 'oncle_tante' ? 'selected' : ''}>Oncle / Tante</option>
                            <option value="conjoint" ${d.role === 'conjoint' ? 'selected' : ''}>Conjoint du parent</option>
                            <option value="tiers" ${d.role === 'tiers' ? 'selected' : ''}>Tiers</option>
                        </select>
                    </div>
                </div>
                <div class="form-grid cols-3">
                    <div class="form-group">
                        <label class="form-label">Âge</label>
                        <input type="number" class="form-input" value="${d.age}" min="18" max="120"
                               onchange="PathOptimizer.updateDonor(${d.id},'age',this.value)">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Patrimoine propre (€)</label>
                        <input type="number" class="form-input" value="${d.patrimoine}" min="0" step="10000"
                               placeholder="Valeur totale des biens"
                               onchange="PathOptimizer.updateDonor(${d.id},'patrimoine',this.value)">
                        <div style="font-size:.62rem;color:var(--text-muted);margin-top:3px;">Inclure : appart, épargne, AV, etc. propres à cette personne</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Régime</label>
                        <select class="form-input" onchange="PathOptimizer.updateDonor(${d.id},'regime',this.value)">
                            <option value="separation" ${d.regime === 'separation' ? 'selected' : ''}>Séparation de biens</option>
                            <option value="communaute" ${d.regime === 'communaute' ? 'selected' : ''}>Communauté</option>
                        </select>
                    </div>
                </div>
                ${donBenHtml}
            </div>`;
        }).join('');
        refreshBenDonSummaries();
    }

    function renderDonorDonationBar(donorId, benId) {
        const d = donors.find(d => d.id === donorId);
        const bens = getBeneficiaries();
        const b = bens.find(b => String(b.id) === String(benId));
        if (!d || !b) return;

        const montant = getDonorDonationForBen(donorId, benId);
        const lienFiscal = detectLien(d.role, b.lien);
        const abat = ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers;
        const restant = Math.max(0, abat - montant);
        const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
        const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';

        const bar = document.getElementById(`don-bar-${donorId}-${benId}`);
        const rest = document.getElementById(`don-rest-${donorId}-${benId}`);
        if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }
        if (rest) {
            rest.style.color = restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)';
            rest.innerHTML = `${restant > 0 ? 'Restant : ' + fmt(restant) : 'Épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abat)}</span>`;
        }
    }

    // Refresh read-only summaries in beneficiary cards
    function refreshBenDonSummaries() {
        _suppressObserver = true;
        const bens = getBeneficiaries();
        bens.forEach(b => {
            const container = document.getElementById('don-summary-' + b.id);
            if (!container) return;

            if (donors.length === 0) {
                container.innerHTML = '<span style="color:var(--text-muted);">Ajoutez des donateurs dans la cartographie ci-dessous.</span>';
                return;
            }

            container.innerHTML = donors.map(d => {
                const lienFiscal = detectLien(d.role, b.lien);
                const abat = ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers;
                const montant = getDonorDonationForBen(d.id, b.id);
                const restant = Math.max(0, abat - montant);
                const hasGift = montant > 0;

                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:.72rem;${hasGift ? 'font-weight:500;' : ''}">
                    <span>← <strong>${d.nom}</strong> <span style="color:var(--text-muted);">(${formatRole(d.role)})</span> → <span style="color:var(--accent-caramel);">${formatLien(lienFiscal)}</span> · abat. ${fmt(abat)}</span>
                    <span style="color:${hasGift ? 'var(--accent-coral)' : 'var(--accent-green)'};">${hasGift ? 'reçu ' + fmt(montant) + ' · reste ' + fmt(restant) : 'intact'}</span>
                </div>`;
            }).join('');
        });

        // Sync SD state
        if (typeof SD !== 'undefined' && SD._getState) {
            const sdBens = SD._getState().beneficiaries;
            bens.forEach(b => {
                const sdBen = sdBens.find(sb => String(sb.id) === String(b.id));
                if (sdBen) sdBen.donationAnterieure = getTotalDonationsForBen(b.id);
            });
        }
        setTimeout(() => { _suppressObserver = false; }, 50);
    }

    function applyDonorPreset(type) {
        donors.length = 0;
        donorIdCounter = 0;

        document.querySelectorAll('.donor-preset-btn').forEach(b => b.classList.remove('active'));
        if (event && event.target) event.target.closest('.donor-preset-btn')?.classList.add('active');

        const presets = {
            'parent_seul': [
                { role: 'parent', nom: 'Parent', age: 55, patrimoine: 300000, regime: 'separation' }
            ],
            'couple_parents': [
                { role: 'parent', nom: 'Mère', age: 55, patrimoine: 200000, regime: 'separation' },
                { role: 'parent', nom: 'Père', age: 58, patrimoine: 200000, regime: 'separation' }
            ],
            'couple_gp': [
                { role: 'parent', nom: 'Mère', age: 55, patrimoine: 200000, regime: 'separation' },
                { role: 'parent', nom: 'Père', age: 58, patrimoine: 200000, regime: 'separation' },
                { role: 'grand_parent', nom: 'Grand-mère maternelle', age: 78, patrimoine: 150000, regime: 'separation' },
                { role: 'grand_parent', nom: 'Grand-père maternel', age: 80, patrimoine: 150000, regime: 'separation' }
            ],
            'gp_seuls': [
                { role: 'grand_parent', nom: 'Grand-mère', age: 75, patrimoine: 200000, regime: 'separation' },
                { role: 'grand_parent', nom: 'Grand-père', age: 78, patrimoine: 200000, regime: 'separation' }
            ]
        };

        const preset = presets[type] || presets['couple_parents'];
        preset.forEach(p => addDonor(p.role, p.nom, p.age, p.patrimoine, p.regime));
    }

    function updateMatrix() {
        // Met à jour l'affichage de la matrice donateurs × bénéficiaires
        const container = document.getElementById('path-matrix');
        if (!container) return;

        // Récupérer les bénéficiaires depuis SD
        const bens = getBeneficiaries();
        if (donors.length === 0 || bens.length === 0) {
            container.innerHTML = '<div class="aside-warn-item amber" style="margin:12px 0;"><i class="fas fa-info-circle"></i> Ajoutez au moins 1 donateur et 1 bénéficiaire pour voir la matrice.</div>';
            return;
        }

        const matrix = buildGraph(bens);

        let html = '<div style="overflow-x:auto;"><table class="comparison-table" style="font-size:.75rem;">';
        html += '<thead><tr><th style="text-align:left;">Donateur</th><th>Âge</th><th>Patrimoine</th>';
        bens.forEach(b => { html += `<th>${b.prenom}</th>`; });
        html += '</tr></thead><tbody>';

        matrix.forEach(row => {
            html += `<tr><td style="text-align:left;font-weight:600;">${row.donor.nom}<br><span style="color:var(--text-muted);font-size:.65rem;">${formatRole(row.donor.role)}</span></td>`;
            html += `<td>${row.donor.age} ans</td>`;
            html += `<td>${fmt(row.donor.patrimoine)}</td>`;
            row.links.forEach(link => {
                const color = getAbatColor(link.abattement);
                html += `<td style="text-align:center;">
                    <div style="font-weight:600;color:${color};">${link.lienLabel}</div>
                    <div style="font-size:.65rem;color:var(--text-muted);">Abat. ${fmt(link.abattement)}</div>
                    <div style="font-size:.6rem;color:var(--text-muted);">NP ${Math.round(link.npRatio * 100)}%</div>
                </td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    function getBeneficiaries() {
        // Lire les bénéficiaires depuis le DOM (créés par SD)
        const bens = [];
        document.querySelectorAll('#beneficiaries-list .list-item').forEach(item => {
            const id = item.dataset.benId;
            const select = item.querySelector('select');
            const nameInput = item.querySelector('input[type="text"]');
            if (select) {
                bens.push({
                    id: id || bens.length,
                    lien: select.value,
                    prenom: nameInput ? nameInput.value : `Bénéf. ${bens.length + 1}`
                });
            }
        });
        return bens;
    }

    // Récupérer les donations antérieures d'un bénéficiaire pour un donateur spécifique
    function getDonationsAntForDonor(benId, donorId, donorRole) {
        return getDonorDonationForBen(donorId, benId);
    }

    function formatRole(role) {
        const map = {
            parent: 'Parent', grand_parent: 'Grand-parent',
            arr_grand_parent: 'Arr. grand-parent',
            oncle_tante: 'Oncle/Tante', conjoint: 'Conjoint parent',
            tiers: 'Tiers'
        };
        return map[role] || role;
    }

    function getAbatColor(abat) {
        if (abat >= 100000) return 'var(--accent-green)';
        if (abat >= 30000) return 'var(--primary-color)';
        if (abat >= 7000) return 'var(--accent-amber)';
        return 'var(--accent-coral)';
    }

    // ============================================================
    // RENDER PATH RESULTS
    // ============================================================
    function renderPathResults() {
        const container = document.getElementById('path-results');
        if (!container) return;

        const bens = getBeneficiaries().filter(b => b.lien !== 'conjoint_pacs');
        if (donors.length === 0 || bens.length === 0) {
            container.innerHTML = '<div class="aside-warn-item amber" style="margin:12px 0;"><i class="fas fa-info-circle"></i> Ajoutez des donateurs et bénéficiaires d\'abord.</div>';
            return;
        }

        const results = optimizeAll(bens);
        let html = '';

        for (const [benId, result] of Object.entries(results)) {
            if (!result.best) continue;

            html += `<div class="section-card" style="margin-bottom:16px;">`;
            html += `<div class="section-title"><i class="fas fa-route"></i> Chemins vers ${result.targetName}</div>`;

            // Best path highlight
            html += `<div class="results-summary" style="margin-bottom:14px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                    <div style="text-align:center;">
                        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;">Meilleur chemin</div>
                        <div style="font-size:.85rem;font-weight:700;color:var(--accent-green);margin-top:4px;">${result.best.label}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;">Net transmis</div>
                        <div class="big-number" style="font-size:1.3rem;">${fmt(result.best.netFinal)}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;">Taux effectif</div>
                        <div style="font-size:1.1rem;font-weight:700;color:var(--accent-coral);">${result.best.tauxEffectif}%</div>
                    </div>
                </div>
            </div>`;

            // All paths table
            html += `<div style="overflow-x:auto;"><table class="comparison-table" style="font-size:.72rem;">`;
            html += `<thead><tr>
                <th style="text-align:left;">Chemin</th>
                <th>Type</th>
                <th>Droits</th>
                <th>Frais</th>
                <th>Net transmis</th>
                <th>Taux eff.</th>
                <th>Complexité</th>
                <th>Risque âge</th>
            </tr></thead><tbody>`;

            // Show top 6 paths
            result.all.slice(0, 6).forEach((p, i) => {
                const isBest = i === 0;
                const rowStyle = isBest ? 'background:rgba(16,185,129,.06);' : '';
                const badge = isBest ? '<span style="color:var(--accent-green);font-weight:700;"> ★</span>' : '';

                html += `<tr style="${rowStyle}">
                    <td style="text-align:left;font-weight:${isBest ? '700' : '500'};">${p.label}${badge}</td>
                    <td>${formatPathType(p.type)}</td>
                    <td style="color:var(--accent-coral);">${fmt(p.totalDroits)}</td>
                    <td>${fmt(p.totalFrais)}</td>
                    <td style="font-weight:700;color:${isBest ? 'var(--accent-green)' : 'var(--text-primary)'};">${fmt(p.netFinal)}</td>
                    <td>${p.tauxEffectif}%</td>
                    <td>${'●'.repeat(p.complexity)}${'○'.repeat(3 - p.complexity)}</td>
                    <td><span style="color:${p.risqueAge === 'élevé' ? 'var(--accent-coral)' : p.risqueAge === 'moyen' ? 'var(--accent-amber)' : 'var(--accent-green)'};">${p.risqueAge}</span></td>
                </tr>`;

                // Show hop details for indirect paths
                if (p.hops.length > 1) {
                    p.hops.forEach((hop, hi) => {
                        html += `<tr style="background:rgba(198,134,66,.03);">
                            <td style="padding-left:24px;color:var(--text-muted);font-size:.65rem;">↳ ${hop.from} → ${hop.to}</td>
                            <td style="color:var(--text-muted);font-size:.65rem;">${hop.demembre ? 'NP' : 'PP'}</td>
                            <td style="font-size:.65rem;">${fmt(hop.droits)}</td>
                            <td style="font-size:.65rem;">${fmt(hop.frais)}</td>
                            <td style="font-size:.65rem;">${fmt(hop.netTransmis)}</td>
                            <td colspan="2" style="font-size:.65rem;color:var(--text-muted);">Abat. ${fmt(hop.abattementUtilise)}</td>
                            <td></td>
                        </tr>`;
                    });
                }
            });

            html += `</tbody></table></div>`;

            // Savings note
            if (result.savings > 0) {
                html += `<div class="warning-box success" style="margin-top:10px;">
                    <i class="fas fa-piggy-bank"></i>
                    <span><strong>Économie potentielle :</strong> ${fmt(result.savings)} entre le meilleur et le pire chemin.
                    ${result.bestWithDelay ? `<br>💡 <strong>Avec patience (${result.bestWithDelay.delaiOptimal} ans entre les dons) :</strong> les abattements se rechargent → encore plus avantageux.` : ''}</span>
                </div>`;
            }

            html += `</div>`;
        }

        container.innerHTML = html;
    }

    function formatPathType(type) {
        const map = {
            direct_pp: '<span style="color:var(--primary-color);">Direct PP</span>',
            direct_np: '<span style="color:var(--accent-green);">Direct NP</span>',
            indirect: '<span style="color:var(--accent-amber);">Indirect PP</span>',
            indirect_np: '<span style="color:var(--accent-purple);">Indirect NP</span>'
        };
        return map[type] || type;
    }

    // ============================================================
    // INIT
    // ============================================================
    let _suppressObserver = false;

    document.addEventListener('DOMContentLoaded', () => {
        const benList = document.getElementById('beneficiaries-list');
        if (benList) {
            const observer = new MutationObserver(() => {
                if (_suppressObserver) return;
                setTimeout(() => { updateMatrix(); renderDonorList(); }, 200);
            });
            observer.observe(benList, { childList: true, subtree: true });
        }
    });

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        addDonor, removeDonor, updateDonor, getDonors,
        updateDonorDonation, getDonorDonationForBen, getTotalDonationsForBen, getDonationDetailForBen,
        applyDonorPreset,
        buildGraph, findAllPaths, optimizeAll,
        renderDonorList, updateMatrix, renderPathResults, refreshBenDonSummaries,
        getBeneficiaries, fmt
    };

})();
