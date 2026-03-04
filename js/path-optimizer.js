function formatLienShort(lien) {
        var map = {
            enfant: 'Enfant', petit_enfant: 'Petit-enfant', arriere_petit_enfant: 'Arr. petit-enfant',
            conjoint_pacs_donation: 'Conjoint', frere_soeur: 'Frère/Sœur', neveu_niece: 'Neveu/Nièce',
            frere: 'Frère/Sœur', enfant_propre: 'Enfant', parent_propre: 'Parent', cousin: 'Cousin',
            oncle_tante: 'Oncle/Tante', beau_enfant: 'Beau-enfant', beau_frere: 'Beau-frère',
            tiers: 'Tiers', aucun: 'Aucun lien'
        };
        return map[lien] || lien;
    }
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

    // FISCAL — loaded from SD via setFiscal(), fallback to window.__FISCAL__ or hardcoded
    let ABATTEMENTS = {
        enfant: 100000, petit_enfant: 31865, arriere_petit_enfant: 5310,
        conjoint_pacs_donation: 80724, conjoint_pacs_succession: Infinity,
        frere_soeur: 15932, neveu_niece: 7967, tiers: 1594,
        handicap: 159325, don_familial_argent: 31865, rappel_fiscal_ans: 15
    };
    let BAREMES = {
        ligne_directe: [ { max: 8072, taux: 0.05 }, { max: 12109, taux: 0.10 }, { max: 15932, taux: 0.15 }, { max: 552324, taux: 0.20 }, { max: 902838, taux: 0.30 }, { max: 1805677, taux: 0.40 }, { max: Infinity, taux: 0.45 } ],
        epoux_pacs: [ { max: 8072, taux: 0.05 }, { max: 12109, taux: 0.10 }, { max: 15932, taux: 0.15 }, { max: 552324, taux: 0.20 }, { max: 902838, taux: 0.30 }, { max: 1805677, taux: 0.40 }, { max: Infinity, taux: 0.45 } ],
        frere_soeur: [ { max: 24430, taux: 0.35 }, { max: Infinity, taux: 0.45 } ],
        neveu_niece: [{ max: Infinity, taux: 0.55 }],
        tiers: [{ max: Infinity, taux: 0.60 }]
    };
    let DEMEMBREMENT = [
        { maxAge: 20, np: 0.10 }, { maxAge: 30, np: 0.20 }, { maxAge: 40, np: 0.30 },
        { maxAge: 50, np: 0.40 }, { maxAge: 60, np: 0.50 }, { maxAge: 70, np: 0.60 },
        { maxAge: 80, np: 0.70 }, { maxAge: 90, np: 0.80 }, { maxAge: Infinity, np: 0.90 }
    ];

    function setFiscal(fiscal) {
        if (!fiscal) return;
        ABATTEMENTS = fiscal.abattements || ABATTEMENTS;
        if (fiscal.bareme_ligne_directe) {
            BAREMES = {
                ligne_directe: fiscal.bareme_ligne_directe,
                epoux_pacs: fiscal.bareme_epoux_pacs || fiscal.bareme_ligne_directe,
                frere_soeur: fiscal.bareme_frere_soeur || BAREMES.frere_soeur,
                neveu_niece: fiscal.bareme_neveu_niece || BAREMES.neveu_niece,
                tiers: fiscal.bareme_tiers || BAREMES.tiers
            };
        }
        if (fiscal.demembrement) DEMEMBREMENT = fiscal.demembrement;
        console.log('[PathOptimizer] Fiscal data synced from SD');
    }

    // Try to sync from global on load
    if (window.__FISCAL__) setFiscal(window.__FISCAL__);

    function getNP(age) {
        for (const t of DEMEMBREMENT) { if (age <= t.maxAge) return t.np; }
        return 0.90;
    }

    function getBareme(lien) {
        if (['enfant', 'petit_enfant', 'arriere_petit_enfant'].includes(lien)) return BAREMES.ligne_directe;
        if (lien === 'conjoint_pacs_donation') return BAREMES.epoux_pacs || BAREMES.ligne_directe;
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
        const bens = getBeneficiaries();
        const donor = {
            id, role: role || 'parent', nom: nom || `Donateur ${id + 1}`,
            age: age || 60, patrimoine: patrimoine || 0,
            regime: regime || 'separation',
            donationsParBen: [],
            donationsRecues: [],
            // Explicit parentage: { benId: true } — which beneficiaries is this donor a direct parent/GP of
            // Default: all current beneficiaries (user can uncheck)
            linkedBens: Object.fromEntries(bens.map(b => [b.id, true])),
            // Entourage — linked family members
            conjointId: null,
            entourage: []
        };
        donors.push(donor);
        // Full re-render: data is safe in donors[] array, so re-render is safe
        // (donation values are stored in donationsParBen/donationsRecues, not in DOM)
        renderDonorList();
        updateMatrix();
        refreshBenDonSummaries();
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
        if (field === 'role' || field === 'age') {
            updateMatrix();
            // Role change affects inter-donor links on ALL cards → full re-render needed
            renderDonorList();
            refreshBenDonSummaries();
        }
        if (field === 'nom') {
            // Name change affects inter-donor labels on other cards → full re-render
            renderDonorList();
            refreshBenDonSummaries();
        }
        if (typeof SD !== 'undefined' && SD.updateAside) SD.updateAside();
    }

    // Update only the lien labels and abattement bars without re-rendering the whole donor list
    function updateDonorLabelsInPlace(donorId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        const bens = getBeneficiaries();

        bens.forEach(b => {
            const lienFiscal = getEffectiveLien(d.id, b.id, d.role, b.lien);
            const abat = ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers;
            const montant = getDonorDonationForBen(d.id, b.id);
            const restant = Math.max(0, abat - montant);
            const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
            const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';

            // Update label
            const labelEl = document.getElementById(`don-label-${d.id}-${b.id}`);
            if (labelEl) labelEl.innerHTML = `→ ${b.prenom || 'Bénéf.'} <span style="font-size:.62rem;color:var(--text-muted);">(${formatLien(lienFiscal)} · abat. ${fmt(abat)})</span>`;

            // Update bar
            renderDonorDonationBar(d.id, b.id);
        });

        // Also update inter-donor labels
        donors.filter(od => od.id !== d.id).forEach(od => {
            // Labels where this donor receives from others
            renderDonorReceivedBar(d.id, od.id);
            // Labels where others receive from this donor
            renderDonorReceivedBar(od.id, d.id);
        });
    }

    // Donation donateur → bénéficiaire spécifique
    function updateDonorDonation(donorId, benId, montant) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        let entry = d.donationsParBen.find(e => e.benId === benId);
        if (!entry) {
            entry = { benId, montant: 0, lienOverride: null, date: null, type: 'inconnue' };
            d.donationsParBen.push(entry);
        }
        entry.montant = +montant || 0;
        renderDonorDonationBar(donorId, benId);
        refreshBenDonSummaries();
    }

    function updateDonorDonationDate(donorId, benId, dateStr) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        let entry = d.donationsParBen.find(e => e.benId === benId);
        if (!entry) { entry = { benId, montant: 0, lienOverride: null, date: null, type: 'inconnue' }; d.donationsParBen.push(entry); }
        entry.date = dateStr || null;
        renderDonorList();
    }

    function updateDonorDonationType(donorId, benId, type) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        let entry = d.donationsParBen.find(e => e.benId === benId);
        if (!entry) { entry = { benId, montant: 0, lienOverride: null, date: null, type: 'inconnue' }; d.donationsParBen.push(entry); }
        entry.type = type;
    }

    // Check if a donation is within the 15-year recall period
    function isDonationInRappel(dateStr) {
        if (!dateStr) return true; // conservateur: si pas de date, on suppose dans le rappel
        const donDate = new Date(dateStr);
        const now = new Date();
        const diffYears = (now - donDate) / (365.25 * 24 * 60 * 60 * 1000);
        return diffYears < ABATTEMENTS.rappel_fiscal_ans;
    }

    // Get effective donation amount considering 15-year window
    function getEffectiveDonation(entry) {
        if (!entry || !entry.montant) return 0;
        if (isDonationInRappel(entry.date)) return entry.montant;
        return 0; // > 15 ans : abattement rechargé
    }

    // Override lien fiscal pour une paire donateur↔bénéficiaire
    function updateDonorBenLien(donorId, benId, lienOverride) {
        const d = donors.find(d => d.id === +donorId);
        if (!d) return;
        const bid = +benId;
        let entry = d.donationsParBen.find(e => +e.benId === bid);
        if (!entry) {
            entry = { benId: bid, montant: 0, lienOverride: null, date: null, type: 'inconnue' };
            d.donationsParBen.push(entry);
        }
        entry.lienOverride = lienOverride === 'auto' ? null : lienOverride;
        // Re-render only the donation bar, not the whole card
        renderDonorDonationBar(+donorId, bid);
        updateMatrix();
        refreshBenDonSummaries();
    }

    // Get effective lien fiscal for a donor→beneficiary pair
    function getEffectiveLien(donorId, benId, donorRole, benLien) {
        const d = donors.find(d => d.id === +donorId);
        if (d) {
            // 1. Manual override always wins
            const entry = d.donationsParBen.find(e => String(e.benId) === String(benId));
            if (entry && entry.lienOverride && entry.lienOverride !== 'auto') return entry.lienOverride;

            // 1b. Use FamilyGraph if available (most accurate)
            if (typeof FamilyGraph !== 'undefined' && d._graphId !== undefined) {
                // Find the graph ID of this beneficiary
                var graphBenId = +benId;
                if (typeof SD !== 'undefined' && SD.getBeneficiaries) {
                    var sdBen = SD.getBeneficiaries().find(function(b){return b.id === +benId || String(b.id) === String(benId)});
                    if (sdBen && sdBen._graphId !== undefined) graphBenId = sdBen._graphId;
                }
                // Also check if benId IS already a graph ID (when called from syncGraphToStep2)
                var graphLien = FamilyGraph.computeFiscalLien(d._graphId, graphBenId);
                if (graphLien && graphLien !== 'tiers' && graphLien !== 'self') return graphLien;
            }

            // 2. Check explicit parentage — if linkedBens exists and this ben is NOT linked
            if (d.linkedBens && Object.keys(d.linkedBens).length > 0) {
                const isLinked = d.linkedBens[benId] || d.linkedBens[String(benId)];
                if (!isLinked) {
                    // Not direct relative. Check cross-family links (neveu/nièce via sibling)
                    const linkedDonors = donors.filter(od => od.id !== d.id && od.linkedBens && (od.linkedBens[benId] || od.linkedBens[String(benId)]));
                    for (const ld of linkedDonors) {
                        const interLien = detectLienBetweenDonors(d.role, ld.role, d.id, ld.id);
                        if (interLien === 'conjoint_pacs_donation') {
                            // Conjoint of the actual parent → beau-parent, same as parent fiscally
                            return detectLien(d.role, benLien || 'enfant');
                        }
                        if (interLien === 'frere_soeur' || d.role === 'oncle_tante') {
                            return 'neveu_niece';
                        }
                    }
                    return 'tiers';
                }
            }
        }
        // 3. Fall back to role-based detection
        return detectLien(donorRole || 'parent', benLien || 'enfant');
    }

    function getLienOverride(donorId, benId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return null;
        const entry = d.donationsParBen.find(e => String(e.benId) === String(benId));
        return entry ? entry.lienOverride : null;
    }

    function getDonorDonationForBen(donorId, benId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return 0;
        const entry = d.donationsParBen.find(e => e.benId === benId);
        return entry ? getEffectiveDonation(entry) : 0;
    }

    // Raw amount (ignoring 15-year window) for display purposes
    function getDonorDonationForBenRaw(donorId, benId) {
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

    // Inter-donor donations (ex: Martine a donné 50k à Gérald)
    function updateDonorReceivedDonation(donorId, fromDonorId, montant) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        let entry = d.donationsRecues.find(e => e.deDonorId === fromDonorId);
        if (!entry) {
            entry = { deDonorId: fromDonorId, montant: 0, lienOverride: null };
            d.donationsRecues.push(entry);
        }
        entry.montant = +montant || 0;
        renderDonorReceivedBar(donorId, fromDonorId);
    }

    function updateDonorRecvLien(donorId, fromDonorId, lienOverride) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        let entry = d.donationsRecues.find(e => e.deDonorId === fromDonorId);
        if (!entry) {
            entry = { deDonorId: fromDonorId, montant: 0, lienOverride: null };
            d.donationsRecues.push(entry);
        }
        entry.lienOverride = lienOverride === 'auto' ? null : lienOverride;
        // Re-render this donor's card
        const card = document.querySelector(`[data-donor-id="${donorId}"]`);
        if (card) {
            const bens = getBeneficiaries();
            const newCard = document.createElement('div');
            newCard.innerHTML = buildDonorCardHtml(d, bens);
            card.replaceWith(newCard.firstElementChild);
        }
    }

    function getDonorReceivedFrom(donorId, fromDonorId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return 0;
        const entry = d.donationsRecues.find(e => e.deDonorId === fromDonorId);
        return entry ? entry.montant : 0;
    }

    function renderDonorReceivedBar(donorId, fromDonorId) {
        const d = donors.find(d => d.id === donorId);
        const fromD = donors.find(dd => dd.id === fromDonorId);
        if (!d || !fromD) return;
        const montant = getDonorReceivedFrom(donorId, fromDonorId);
        const lien = detectLienBetweenDonors(fromD.role, d.role, fromD.id, d.id);
        const abat = ABATTEMENTS[lien] || ABATTEMENTS.tiers;
        const restant = Math.max(0, abat - montant);
        const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
        const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';

        const bar = document.getElementById(`don-recv-bar-${donorId}-${fromDonorId}`);
        const rest = document.getElementById(`don-recv-rest-${donorId}-${fromDonorId}`);
        if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }
        if (rest) {
            rest.style.color = restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)';
            rest.innerHTML = `${restant > 0 ? 'Restant : ' + fmt(restant) : 'Épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abat)}</span>`;
        }
    }

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
                const lien = getEffectiveLien(d.id, b.id, d.role, b.lien);
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
            enfant: 'Ligne directe (100k)', petit_enfant: 'Petit-enfant (LD)',
            arriere_petit_enfant: 'Arr. petit-enfant (LD)',
            conjoint_pacs_donation: 'Conjoint/PACS',
            frere_soeur: 'Frère/Sœur', neveu_niece: 'Neveu/Nièce',
            tiers: 'Tiers', aucun: '🚫 Aucun lien'
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
            const lienDirect = getEffectiveLien(donor.id, targetBeneficiary.id, donor.role, targetBeneficiary.lien);
            const montant = donor.patrimoine;
            if (montant <= 0) continue;
            if (lienDirect === 'aucun') continue; // Pas de lien = pas de chemin direct

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

            // Build list of all potential intermediaries: other donors + entourage members
            const intermediaires = [];
            // Other donors
            for (const od of donors) {
                if (od.id === donor.id) continue;
                intermediaires.push({ type: 'donor', id: od.id, nom: od.nom, role: od.role, age: od.age, patrimoine: od.patrimoine });
            }
            // Entourage members of all donors (not already in donors)
            for (const d2 of donors) {
                for (const ent of d2.entourage) {
                    if (ent.donorId && donors.find(dd => dd.id === ent.donorId)) continue; // already in donors
                    // Map entourage lien to a role for path calculation
                    const entRole = mapEntourageLienToRole(ent.lien, d2.role);
                    if (entRole) {
                        intermediaires.push({
                            type: 'entourage', id: 'ent-' + ent.id, nom: ent.nom || 'Membre',
                            role: entRole, age: ent.age || 50, patrimoine: ent.patrimoine || 0,
                            viadonor: d2.nom, _entRef: ent
                        });
                    }
                }
            }

            for (const intermediaire of intermediaires) {
                // Le donateur donne à l'intermédiaire, puis l'intermédiaire donne à la cible
                const lienDonorInter = intermediaire.type === 'donor'
                    ? detectLienBetweenDonors(donor.role, intermediaire.role, donor.id, intermediaire.id)
                    : detectLienBetweenDonors(donor.role, intermediaire.role, donor.id, intermediaire.id);
                if (lienDonorInter === 'tiers') continue;

                const lienInterTarget = intermediaire.type === 'donor'
                    ? getEffectiveLien(intermediaire.id, targetBeneficiary.id, intermediaire.role, targetBeneficiary.lien)
                    : detectLien(intermediaire.role, targetBeneficiary.lien);
                if (lienInterTarget === 'tiers' || lienInterTarget === 'aucun') continue;

                // Hop 1 : donateur → intermédiaire (use inter-donor donation history)
                const donAntInterDonor = intermediaire.type === 'donor' ? getDonorReceivedFrom(intermediaire.id, donor.id) : 0;
                const hop1 = calcHopCost(montant, lienDonorInter, donor.age, false, donAntInterDonor);
                // Hop 2 : intermédiaire → cible
                // For entourage members, check their donation history to this beneficiary
                let donAntInterBen = 0;
                if (intermediaire.type === 'entourage' && intermediaire._entRef) {
                    donAntInterBen = getEntourageDonForBen(intermediaire._entRef, targetBeneficiary.id);
                } else if (intermediaire.type === 'donor') {
                    donAntInterBen = getDonorDonationForBen(intermediaire.id, targetBeneficiary.id);
                }
                const hop2 = calcHopCost(hop1.netTransmis, lienInterTarget, intermediaire.age, false, donAntInterBen);

                const totalDroits = hop1.droits + hop2.droits;
                const totalFrais = hop1.frais + hop2.frais;

                const entTag = intermediaire.type === 'entourage' ? ' 👥' : '';
                paths.push({
                    type: 'indirect',
                    label: `${donor.nom} → ${intermediaire.nom}${entTag} → ${targetBeneficiary.prenom}`,
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
                const donAntInterDonorNP = intermediaire.type === 'donor' ? getDonorReceivedFrom(intermediaire.id, donor.id) : 0;
                const hop1NP = calcHopCost(montant, lienDonorInter, donor.age, true, donAntInterDonorNP);
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

    // Map entourage relationship to an equivalent donor role for path calculation
    function mapEntourageLienToRole(entLien, parentDonorRole) {
        // entLien = how this person relates to the donor who declared them
        // parentDonorRole = role of the donor who declared this entourage member
        const map = {
            'frere': parentDonorRole,           // frère du parent = also a parent (same generation)
            'enfant_propre': (() => {            // enfant du donateur
                if (parentDonorRole === 'parent') return 'parent'; // enfant d'un parent = another parent (co-parent)
                if (parentDonorRole === 'grand_parent') return 'parent'; // enfant d'un GP = parent
                return null;
            })(),
            'parent_propre': (() => {
                if (parentDonorRole === 'parent') return 'grand_parent';
                if (parentDonorRole === 'grand_parent') return 'arr_grand_parent';
                return null;
            })(),
            'cousin': 'oncle_tante',            // cousin du parent ≈ oncle/tante level
            'oncle_tante': 'grand_parent',      // oncle du parent ≈ grand-parent level
            'beau_enfant': parentDonorRole,     // beau-fils = same generation
            'beau_frere': parentDonorRole,      // beau-frère = same generation
        };
        return map[entLien] || null;
    }

    function graphLienBetweenDonors(donorId1, donorId2) {
        if (typeof FamilyGraph === 'undefined') return null;
        var d1 = donors.find(function(d){return d.id === +donorId1});
        var d2 = donors.find(function(d){return d.id === +donorId2});
        if (!d1 || !d2) return null;
        if (d1._graphId === undefined || d2._graphId === undefined) return null;
        var lien = FamilyGraph.computeFiscalLien(d1._graphId, d2._graphId);
        if (!lien || lien === 'self') return null;
        // Alliés = tiers fiscalement (sauf conjoint/pacs)
        if (String(lien).startsWith('beau_')) return 'tiers';
        return lien;
    }

    function detectLienBetweenDonors(role1, role2, donorId1, donorId2) {
        // 1. Use FamilyGraph if available (most accurate)
        var g = graphLienBetweenDonors(donorId1, donorId2);
        if (g) return g;

        // 2. Fallback heuristic based on roles
        if (role1 === 'conjoint' || role2 === 'conjoint') return 'conjoint_pacs_donation';
        if (role1 === 'grand_parent' && role2 === 'parent') return 'enfant';
        if (role1 === 'parent' && role2 === 'grand_parent') return 'enfant';
        if (role1 === 'arr_grand_parent' && role2 === 'grand_parent') return 'enfant';
        if (role1 === 'grand_parent' && role2 === 'arr_grand_parent') return 'enfant';
        if (role1 === 'arr_grand_parent' && role2 === 'parent') return 'petit_enfant';
        if (role1 === 'parent' && role2 === 'arr_grand_parent') return 'petit_enfant';
        if (role1 === 'parent' && role2 === 'parent') return 'tiers';
        if (role1 === 'oncle_tante' && role2 === 'parent') return 'frere_soeur';
        if (role1 === 'parent' && role2 === 'oncle_tante') return 'frere_soeur';
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

    // === ENTOURAGE ===
    let entourageIdCounter = 0;

    function addEntourage(donorId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        d.entourage.push({
            id: entourageIdCounter++, nom: '', lien: 'frere', age: 50, patrimoine: 0,
            donorId: null,
            donationsParBen: [],    // [{benId, montant, lienOverride}]
            donationsRecues: [],    // [{deId, deType:'donor'|'ent', montant}]
            expanded: false         // toggle detail view
        });
        renderDonorList();
    }

    function removeEntourage(donorId, entId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        d.entourage = d.entourage.filter(e => e.id !== entId);
        renderDonorList();
    }

    function updateEntourage(donorId, entId, field, value) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        const e = d.entourage.find(e => e.id === entId);
        if (!e) return;
        if (field === 'age' || field === 'patrimoine') e[field] = +value || 0;
        else if (field === 'donorId') {
            if (value === 'none') { e.donorId = null; }
            else { e.donorId = +value; const linked = donors.find(dd => dd.id === +value); if (linked) e.nom = linked.nom; }
        }
        else e[field] = value;
    }

    function toggleEntourageExpand(donorId, entId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        const e = d.entourage.find(e => e.id === entId);
        if (!e) return;
        e.expanded = !e.expanded;
        renderDonorList();
    }

    function updateEntourageDonation(donorId, entId, benId, montant) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        const e = d.entourage.find(e => e.id === entId);
        if (!e) return;
        let entry = e.donationsParBen.find(x => x.benId === benId);
        if (!entry) { entry = { benId, montant: 0, lienOverride: null }; e.donationsParBen.push(entry); }
        entry.montant = +montant || 0;
    }

    function updateEntourageDonLien(donorId, entId, benId, lien) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        const e = d.entourage.find(e => e.id === entId);
        if (!e) return;
        let entry = e.donationsParBen.find(x => x.benId === benId);
        if (!entry) { entry = { benId, montant: 0, lienOverride: null }; e.donationsParBen.push(entry); }
        entry.lienOverride = lien === 'auto' ? null : lien;
        renderDonorList();
    }

    function getEntourageDonForBen(entourage, benId) {
        const entry = entourage.donationsParBen.find(x => x.benId === benId);
        return entry ? entry.montant : 0;
    }

    function getEntourageLienOverride(entourage, benId) {
        const entry = entourage.donationsParBen.find(x => x.benId === benId);
        return entry ? entry.lienOverride : null;
    }

    function updateDonorConjoint(donorId, conjointId) {
        const d = donors.find(d => d.id === donorId);
        if (!d) return;
        d.conjointId = conjointId === 'none' ? null : +conjointId;
        renderDonorList();
    }

    function toggleLinkedBen(donorId, benId, isLinked) {
        const d = donors.find(d => d.id === +donorId);
        if (!d) return;
        if (!d.linkedBens) d.linkedBens = {};
        d.linkedBens[benId] = isLinked;
        // Full re-render to update lien labels, matrix, bars
        renderDonorList();
        updateMatrix();
        refreshBenDonSummaries();
    }

    function buildEntourageHtml(d) {
        const otherDonors = donors.filter(od => od.id !== d.id);

        // Auto-detect: who's already linked from cartographie
        const autoLinks = [];
        otherDonors.forEach(od => {
            const lien = detectLienBetweenDonors(d.role, od.role, d.id, od.id);
            if (lien !== 'tiers') {
                autoLinks.push({ donorId: od.id, nom: od.nom, lien, auto: true });
            }
        });

        // Conjoint selector
        const conjointOpts = `<option value="none"${!d.conjointId ? ' selected' : ''}>Aucun / Non renseigné</option>` +
            otherDonors.map(od => `<option value="${od.id}"${d.conjointId === od.id ? ' selected' : ''}>${od.nom} (${formatRole(od.role)})</option>`).join('') +
            `<option value="autre"${d.conjointId === 'autre' ? ' selected' : ''}>— Autre (pas dans la cartographie) —</option>`;

        let html = `
        <div style="margin-top:12px;padding:12px;border-radius:10px;background:rgba(92,64,51,.04);border:1px solid rgba(92,64,51,.1);">
            <label class="form-label" style="margin-bottom:10px;display:flex;align-items:center;gap:6px;color:var(--primary-color);">
                <i class="fas fa-sitemap"></i> Entourage de ${d.nom} <span style="font-size:.58rem;font-weight:400;color:var(--text-muted);">(enrichit les chemins indirects)</span>
            </label>

            <div style="display:flex;gap:8px;align-items:center;font-size:.75rem;margin-bottom:10px;flex-wrap:wrap;">
                <span style="color:var(--text-muted);white-space:nowrap;">💍 Conjoint :</span>
                <select class="form-input" style="font-size:.72rem;height:32px;min-width:200px;flex:1;" onchange="PathOptimizer.updateDonorConjoint(${d.id},this.value)">${conjointOpts}</select>
            </div>`;

        // Auto-detected links
        if (autoLinks.length > 0) {
            html += `<div style="font-size:.68rem;color:var(--text-muted);margin-bottom:8px;">
                <strong>Liens auto-détectés :</strong> ${autoLinks.map(a => `${a.nom} (${formatLien(a.lien)})`).join(', ')}
            </div>`;
        }

        // Manual entourage entries
        html += `<div style="font-size:.68rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Autres membres liés :</div>`;

        const lienOpts = [
            ['frere', 'Frère / Sœur'],
            ['enfant_propre', 'Enfant (propre, pas bénéficiaire)'],
            ['parent_propre', 'Parent (propre)'],
            ['cousin', 'Cousin(e)'],
            ['oncle_tante', 'Oncle / Tante'],
            ['beau_enfant', 'Beau-fils / Belle-fille'],
            ['beau_frere', 'Beau-frère / Belle-sœur'],
            ['autre', 'Autre']
        ];

        if (d.entourage.length === 0) {
            html += `<div style="font-size:.68rem;color:var(--text-muted);padding:4px 0;">Aucun — ajoutez des frères/sœurs, cousins, etc.</div>`;
        }

        html += d.entourage.map(e => {
            const linkedDonor = e.donorId ? donors.find(dd => dd.id === e.donorId) : null;
            const bens = getBeneficiaries();
            const entRole = mapEntourageLienToRole(e.lien, d.role);
            const hasDonations = e.donationsParBen && e.donationsParBen.some(x => x.montant > 0);

            let row = `
            <div style="margin-bottom:8px;padding:8px 10px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);">
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                    <input type="text" class="form-input" value="${linkedDonor ? linkedDonor.nom : e.nom}" placeholder="Prénom"
                           style="font-size:.72rem;height:30px;flex:1;min-width:80px;${linkedDonor ? 'opacity:.6;' : ''}"
                           ${linkedDonor ? 'disabled' : ''}
                           onchange="PathOptimizer.updateEntourage(${d.id},${e.id},'nom',this.value)">
                    <select class="form-input" style="font-size:.68rem;height:30px;flex:1;min-width:100px;" onchange="PathOptimizer.updateEntourage(${d.id},${e.id},'lien',this.value)">
                        ${lienOpts.map(([v, l]) => `<option value="${v}"${e.lien === v ? ' selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <div style="display:flex;align-items:center;gap:4px;font-size:.68rem;color:var(--text-muted);">
                        <span>Âge</span>
                        <input type="number" class="form-input" value="${e.age}" min="0" max="120" style="font-size:.68rem;height:26px;width:50px;text-align:center;"
                               onchange="PathOptimizer.updateEntourage(${d.id},${e.id},'age',this.value)">
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;font-size:.68rem;color:var(--text-muted);">
                        <span>Patrim.</span>
                        <input type="number" class="form-input" value="${e.patrimoine}" min="0" step="10000" style="font-size:.68rem;height:26px;width:80px;text-align:right;"
                               placeholder="0€" onchange="PathOptimizer.updateEntourage(${d.id},${e.id},'patrimoine',this.value)">
                    </div>
                    <button style="font-size:.62rem;height:26px;padding:0 8px;background:${hasDonations ? 'rgba(255,107,107,.15)' : 'rgba(198,134,66,.08)'};border:1px solid rgba(198,134,66,.15);border-radius:4px;color:var(--text-secondary);cursor:pointer;white-space:nowrap;" onclick="PathOptimizer.toggleEntourageExpand(${d.id},${e.id})">
                        ${e.expanded ? '▼' : '▶'} Donations${hasDonations ? ' ●' : ''}
                    </button>
                    <button class="btn-remove" style="width:26px;height:26px;font-size:.55rem;flex-shrink:0;" onclick="PathOptimizer.removeEntourage(${d.id},${e.id})"><i class="fas fa-times"></i></button>
                </div>`;

            // Expanded donation details
            if (e.expanded && bens.length > 0) {
                row += `<div style="margin-top:6px;padding:8px;border-radius:6px;background:rgba(198,134,66,.03);border:1px dashed rgba(198,134,66,.08);">
                    <div style="font-size:.62rem;font-weight:600;color:var(--accent-coral);margin-bottom:6px;">Donations faites par ${e.nom || 'ce membre'} aux bénéficiaires :</div>`;

                row += bens.map(b => {
                    const montant = getEntourageDonForBen(e, b.id);
                    const override = getEntourageLienOverride(e, b.id);
                    const autoLien = entRole ? detectLien(entRole, b.lien) : 'tiers';
                    const effLien = override || autoLien;
                    const abat = (effLien === 'aucun') ? 0 : (ABATTEMENTS[effLien] || ABATTEMENTS.tiers);
                    const restant = Math.max(0, abat - montant);

                    const lienSelectOpts = [
                        ['auto', 'Auto : ' + formatLien(autoLien)],
                        ['aucun', '🚫 Aucun lien'],
                        ['enfant', 'Ligne directe (100k)'],
                        ['petit_enfant', 'Petit-enfant (31 865)'],
                        ['neveu_niece', 'Neveu/Nièce (7 967)'],
                        ['frere_soeur', 'Frère/Sœur (15 932)'],
                        ['tiers', 'Tiers (1 594)']
                    ].map(([v, l]) => `<option value="${v}" ${(override === v || (!override && v === 'auto')) ? 'selected' : ''}>${l}</option>`).join('');

                    if (effLien === 'aucun') {
                        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;opacity:.5;font-size:.62rem;">
                            <span>→ ${b.prenom || 'Bénéf.'}</span>
                            <select style="font-size:.58rem;height:22px;padding:0 3px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-muted);border-radius:3px;" onchange="PathOptimizer.updateEntourageDonLien(${d.id},${e.id},${b.id},this.value)">${lienSelectOpts}</select>
                            <span>🚫</span>
                        </div>`;
                    }

                    return `<div style="display:grid;grid-template-columns:1fr 100px 90px;gap:4px;align-items:center;margin-bottom:4px;">
                        <div>
                            <div style="font-size:.62rem;font-weight:600;">→ ${b.prenom || 'Bénéf.'} <span style="color:var(--text-muted);">(${formatLien(effLien)} · ${fmt(abat)})</span></div>
                            <select style="font-size:.55rem;height:20px;margin-top:2px;padding:0 3px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-muted);border-radius:3px;" onchange="PathOptimizer.updateEntourageDonLien(${d.id},${e.id},${b.id},this.value)">${lienSelectOpts}</select>
                            <div style="font-size:.55rem;color:${restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'};margin-top:2px;">Restant : ${fmt(restant)}</div>
                        </div>
                        <input type="number" class="form-input" value="${montant}" min="0" step="1000"
                               style="font-size:.65rem;height:26px;text-align:right;"
                               onchange="PathOptimizer.updateEntourageDonation(${d.id},${e.id},${b.id},this.value)">
                        <div style="height:3px;border-radius:2px;background:rgba(198,134,66,.08);overflow:hidden;">
                            <div style="height:100%;width:${abat > 0 ? Math.min(100, montant / abat * 100) : 100}%;background:${restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'};border-radius:2px;"></div>
                        </div>
                    </div>`;
                }).join('');

                row += `</div>`;
            } else if (e.expanded && bens.length === 0) {
                row += `<div style="font-size:.62rem;color:var(--text-muted);padding:6px;">Ajoutez des bénéficiaires d'abord.</div>`;
            }

            row += `</div>`;
            return row;
        }).join('');

        html += `
            <button class="btn-add" style="font-size:.65rem;padding:3px 8px;margin-top:6px;" onclick="PathOptimizer.addEntourage(${d.id})">
                <i class="fas fa-plus"></i> Ajouter un membre
            </button>
        </div>`;

        return html;
    }

    function buildDonorCardHtml(d, bens) {
            // === LINKED BENEFICIARIES (parenté explicite) ===
            let linkedBensHtml = '';
            if (bens.length > 0) {
                if (!d.linkedBens) d.linkedBens = Object.fromEntries(bens.map(b => [b.id, true]));
                const linkedCount = bens.filter(b => d.linkedBens[b.id] || d.linkedBens[String(b.id)]).length;
                linkedBensHtml = `
                <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.1);">
                    <label class="form-label" style="margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-link"></i> Bénéficiaires directs de ${d.nom} <span style="font-size:.58rem;color:var(--text-muted);">(${linkedCount}/${bens.length} — décochez ceux qui ne sont pas vos enfants/petits-enfants)</span>
                    </label>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${bens.map(b => {
                            const isLinked = d.linkedBens[b.id] || d.linkedBens[String(b.id)];
                            const lien = getEffectiveLien(d.id, b.id, d.role, b.lien);
                            return `<label style="display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:.68rem;background:${isLinked ? 'rgba(46,125,50,.1)' : 'rgba(198,134,66,.03)'};border:1px solid ${isLinked ? 'rgba(46,125,50,.25)' : 'rgba(198,134,66,.08)'};color:${isLinked ? 'var(--accent-green)' : 'var(--text-muted)'};">
                                <input type="checkbox" ${isLinked ? 'checked' : ''} onchange="PathOptimizer.toggleLinkedBen(${d.id},${b.id},this.checked)" style="accent-color:var(--accent-green);">
                                ${b.prenom || 'Bénéf.'} <span style="font-size:.55rem;opacity:.7;">${formatLienShort(lien)}</span>
                            </label>`;
                        }).join('')}
                    </div>
                </div>`;
            }

            // Per-beneficiary donation rows
            let donBenHtml = '';
            if (bens.length > 0) {
                donBenHtml = `
                <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(198,134,66,.08);">
                    <label class="form-label" style="color:var(--accent-coral);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-history"></i> Donations déjà faites (rappel 15 ans) — à qui ?
                    </label>
                    ${bens.map(b => {
                        const donEntry = d.donationsParBen.find(e => e.benId === b.id);
                        const montantRaw = donEntry ? donEntry.montant : 0;
                        const montant = donEntry ? getEffectiveDonation(donEntry) : 0;
                        const lienFiscal = getEffectiveLien(d.id, b.id, d.role, b.lien);
                        const currentOverride = getLienOverride(d.id, b.id);
                        const autoLien = detectLien(d.role, b.lien);
                        const abat = ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers;
                        const restant = Math.max(0, abat - montant);
                        const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
                        const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';
                        const lienOpts = [
                            ['auto', `Auto : ${formatLien(autoLien)}`],
                            ['aucun', '🚫 Aucun lien'],
                            ['enfant', 'Ligne directe (LD · 100k)'],
                            ['petit_enfant', 'Petit-enfant (LD · 31 865)'],
                            ['arriere_petit_enfant', 'Arr. petit-enfant (5 310)'],
                            ['neveu_niece', 'Neveu/Nièce (7 967)'],
                            ['frere_soeur', 'Frère/Sœur (15 932)'],
                            ['tiers', 'Tiers (1 594)']
                        ].map(([v, l]) => `<option value="${v}" ${(currentOverride === v || (!currentOverride && v === 'auto')) ? 'selected' : ''}>${l}</option>`).join('');
                        const isAucun = lienFiscal === 'aucun';
                        if (isAucun) {
                            return `
                            <div style="display:grid;grid-template-columns:1fr;gap:6px;align-items:center;margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(198,134,66,.02);border:1px dashed rgba(198,134,66,.08);opacity:.6;">
                                <div style="display:flex;align-items:center;justify-content:space-between;">
                                    <div>
                                        <span style="font-size:.78rem;color:var(--text-muted);">→ ${b.prenom || 'Bénéf.'}</span>
                                        <span style="font-size:.62rem;color:var(--text-muted);margin-left:6px;">🚫 Aucun lien</span>
                                    </div>
                                    <select style="font-size:.62rem;height:24px;padding:0 4px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-secondary);border-radius:4px;" onchange="PathOptimizer.updateDonorBenLien(${d.id},${b.id},this.value)">${lienOpts}</select>
                                </div>
                            </div>`;
                        }
                        return `
                        <div style="display:grid;grid-template-columns:1fr 100px 120px;gap:6px;align-items:center;margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.06);">
                            <div>
                                <div id="don-label-${d.id}-${b.id}" style="font-size:.78rem;font-weight:600;color:var(--text-primary);">→ ${b.prenom || 'Bénéf.'} <span style="font-size:.62rem;color:var(--text-muted);">(${formatLien(lienFiscal)} · abat. ${fmt(abat)})</span></div>
                                <select style="font-size:.62rem;height:24px;margin-top:4px;padding:0 4px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-secondary);border-radius:4px;width:auto;" onchange="PathOptimizer.updateDonorBenLien(${d.id},${b.id},this.value)">${lienOpts}</select>
                                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                                    <div style="flex:1;height:4px;border-radius:4px;background:rgba(198,134,66,.08);overflow:hidden;">
                                        <div id="don-bar-${d.id}-${b.id}" style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .3s;"></div>
                                    </div>
                                    <div id="don-rest-${d.id}-${b.id}" style="font-size:.62rem;white-space:nowrap;color:${restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'};">
                                        ${restant > 0 ? 'Restant : ' + fmt(restant) : 'Épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abat)}</span>
                                    </div>
                                </div>
                            </div>
                            <div style="font-size:.6rem;color:var(--text-muted);text-align:center;">${currentOverride ? '✏️' : '🤖'}</div>
                            <div>
                                <input type="number" class="form-input" value="${montantRaw}" min="0" step="1000"
                                       style="font-size:.75rem;height:34px;text-align:right;${montantRaw > 0 ? 'border-color:rgba(255,107,107,.25);' : ''}"
                                       placeholder="0"
                                       onchange="PathOptimizer.updateDonorDonation(${d.id},${b.id},this.value)">
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;padding-left:4px;">
                            <input type="date" class="form-input" value="${donEntry?.date || ''}"
                                   style="font-size:.6rem;height:24px;flex:1;max-width:130px;"
                                   title="Date de la donation (pour le rappel 15 ans)"
                                   onchange="PathOptimizer.updateDonorDonationDate(${d.id},${b.id},this.value)">
                            <select class="form-input" style="font-size:.58rem;height:24px;flex:1;max-width:120px;"
                                    onchange="PathOptimizer.updateDonorDonationType(${d.id},${b.id},this.value)">
                                <option value="inconnue" ${(donEntry?.type||'inconnue')==='inconnue'?'selected':''}>Type inconnu</option>
                                <option value="notariee" ${donEntry?.type==='notariee'?'selected':''}>Notariée</option>
                                <option value="don_manuel" ${donEntry?.type==='don_manuel'?'selected':''}>Don manuel</option>
                            </select>
                            ${montantRaw > 0 ? (donEntry?.date && !isDonationInRappel(donEntry.date)
                                ? '<span style="font-size:.55rem;color:var(--accent-green);white-space:nowrap;">✅ > 15 ans</span>'
                                : donEntry?.date
                                    ? '<span style="font-size:.55rem;color:var(--accent-coral);white-space:nowrap;">⏳ rappel 15a</span>'
                                    : '<span style="font-size:.55rem;color:var(--accent-amber);white-space:nowrap;">📅?</span>') : ''}
                        </div>`;
                    }).join('')}
                </div>`;
            } else {
                donBenHtml = `<div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(198,134,66,.03);font-size:.72rem;color:var(--text-muted);"><i class="fas fa-info-circle"></i> Ajoutez des bénéficiaires ci-dessus pour déclarer les donations déjà faites.</div>`;
            }

            // Inter-donor section
            const otherDonors = donors.filter(od => od.id !== d.id);
            let donRecvHtml = '';
            if (otherDonors.length > 0) {
                donRecvHtml = `
                <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(198,134,66,.08);">
                    <label class="form-label" style="color:var(--primary-color);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-arrow-down"></i> Donations reçues d'un autre donateur <span style="font-size:.6rem;font-weight:400;color:var(--text-muted);">(pour les chemins indirects)</span>
                    </label>
                    ${otherDonors.map(od => {
                        const montant = getDonorReceivedFrom(d.id, od.id);
                        const autoLien = detectLienBetweenDonors(od.role, d.role, od.id, d.id);
                        // Check for override in donationsRecues
                        const recvEntry = d.donationsRecues.find(e => e.deDonorId === od.id);
                        const recvOverride = recvEntry ? recvEntry.lienOverride : null;
                        const lien = recvOverride || autoLien;
                        const abat = (lien === 'aucun') ? 0 : (ABATTEMENTS[lien] || ABATTEMENTS.tiers);
                        const restant = Math.max(0, abat - montant);
                        const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
                        const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';
                        const recvLienOpts = [
                            ['auto', `Auto : ${formatLien(autoLien)}`],
                            ['aucun', '🚫 Aucun lien'],
                            ['enfant', 'Ligne directe (LD · 100k)'],
                            ['conjoint_pacs_donation', 'Conjoint/PACS (80 724)'],
                            ['petit_enfant', 'Petit-enfant (31 865)'],
                            ['frere_soeur', 'Frère/Sœur (15 932)'],
                            ['neveu_niece', 'Neveu/Nièce (7 967)'],
                            ['tiers', 'Tiers (1 594)']
                        ].map(([v, l]) => `<option value="${v}" ${(recvOverride === v || (!recvOverride && v === 'auto')) ? 'selected' : ''}>${l}</option>`).join('');

                        if (lien === 'aucun') {
                            return `
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(92,64,51,.03);border:1px dashed rgba(92,64,51,.08);opacity:.6;">
                                <span style="font-size:.78rem;color:var(--text-muted);">← ${od.nom} 🚫</span>
                                <select style="font-size:.62rem;height:24px;padding:0 4px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-secondary);border-radius:4px;" onchange="PathOptimizer.updateDonorRecvLien(${d.id},${od.id},this.value)">${recvLienOpts}</select>
                            </div>`;
                        }

                        return `
                        <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(92,64,51,.06);border:1px solid rgba(92,64,51,.1);">
                            <div>
                                <div style="font-size:.78rem;font-weight:600;color:var(--text-primary);">← reçu de ${od.nom} <span style="font-size:.62rem;color:var(--text-muted);">(${od.nom}→${d.nom} = ${formatLien(lien)} · abat. ${fmt(abat)})</span></div>
                                <select style="font-size:.62rem;height:24px;margin-top:4px;padding:0 4px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.1);color:var(--text-secondary);border-radius:4px;" onchange="PathOptimizer.updateDonorRecvLien(${d.id},${od.id},this.value)">${recvLienOpts}</select>
                                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                                    <div style="flex:1;height:4px;border-radius:4px;background:rgba(198,134,66,.08);overflow:hidden;">
                                        <div id="don-recv-bar-${d.id}-${od.id}" style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .3s;"></div>
                                    </div>
                                    <div id="don-recv-rest-${d.id}-${od.id}" style="font-size:.62rem;white-space:nowrap;color:${restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'};">
                                        ${restant > 0 ? 'Restant : ' + fmt(restant) : 'Épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abat)}</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <input type="number" class="form-input" value="${montant}" min="0" step="1000"
                                       style="font-size:.75rem;height:34px;text-align:right;"
                                       placeholder="0"
                                       onchange="PathOptimizer.updateDonorReceivedDonation(${d.id},${od.id},this.value)">
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
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
                               onchange="PathOptimizer.updateDonor(${d.id},'nom',this.value)">
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
                    <div class="form-group" style="display:none;">
                        <label class="form-label">Patrimoine propre (€)</label>
                        <input type="number" class="form-input" value="${d.patrimoine}" min="0" step="10000"
                               onchange="PathOptimizer.updateDonor(${d.id},'patrimoine',this.value)">
                    </div>
                    <div class="form-group" style="display:none;">
                        <select class="form-input" onchange="PathOptimizer.updateDonor(${d.id},'regime',this.value)">
                            <option value="communaute" selected>Communauté</option>
                        </select>
                    </div>
                </div>
                ${linkedBensHtml}
                ${donBenHtml}
                ${donRecvHtml}
                
            </div>`;
    }

    function appendDonorCard(donor) {
        const container = document.getElementById('donors-list');
        if (!container) return;
        const bens = getBeneficiaries();
        container.insertAdjacentHTML('beforeend', buildDonorCardHtml(donor, bens));
    }

    function renderDonorList() {
        const container = document.getElementById('donors-list');
        if (!container) return;
        const bens = getBeneficiaries();
        container.innerHTML = donors.map(d => buildDonorCardHtml(d, bens)).join('');
        refreshBenDonSummaries();
    }


    function renderDonorDonationBar(donorId, benId) {
        const d = donors.find(d => d.id === +donorId);
        const bens = getBeneficiaries();
        const b = bens.find(b => String(b.id) === String(benId));
        if (!d || !b) return;

        const montant = getDonorDonationForBen(donorId, benId);
        const lienFiscal = getEffectiveLien(d.id, b.id, d.role, b.lien);
        const abat = (lienFiscal === 'aucun') ? 0 : (ABATTEMENTS[lienFiscal] || ABATTEMENTS.tiers);
        const restant = Math.max(0, abat - montant);
        const pct = abat > 0 ? Math.min(100, (montant / abat) * 100) : 100;
        const barColor = pct > 80 ? 'var(--accent-coral)' : pct > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';

        const bar = document.getElementById(`don-bar-${donorId}-${benId}`);
        const rest = document.getElementById(`don-rest-${donorId}-${benId}`);
        const label = document.getElementById(`don-label-${donorId}-${benId}`);
        if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }
        if (rest) {
            rest.style.color = restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)';
            rest.innerHTML = `${restant > 0 ? 'Restant : ' + fmt(restant) : 'Épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abat)}</span>`;
        }
        if (label) {
            label.innerHTML = `→ ${b.prenom || 'Bénéf.'} <span style="font-size:.62rem;color:var(--text-muted);">(${formatLien(lienFiscal)} · abat. ${fmt(abat)})</span>`;
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
                const lienFiscal = getEffectiveLien(d.id, b.id, d.role, b.lien);
                if (lienFiscal === 'aucun') {
                    return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:.68rem;opacity:.4;">
                        <span>← ${d.nom}</span><span>🚫 aucun lien</span>
                    </div>`;
                }
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
        setFiscal, isDonationInRappel,
        addDonor, removeDonor, updateDonor, getDonors,
        addEntourage, removeEntourage, updateEntourage, updateDonorConjoint,
        toggleEntourageExpand, updateEntourageDonation, updateEntourageDonLien,
        updateDonorDonation, updateDonorDonationDate, updateDonorDonationType,
        updateDonorBenLien, getEffectiveLien, getDonorDonationForBen, getDonorDonationForBenRaw, getTotalDonationsForBen, getDonationDetailForBen,
        updateDonorReceivedDonation, getDonorReceivedFrom, updateDonorRecvLien,
        applyDonorPreset,
        buildGraph, findAllPaths, optimizeAll,
        renderDonorList, updateMatrix, renderPathResults, refreshBenDonSummaries,
        getBeneficiaries, fmt
    };

})();
