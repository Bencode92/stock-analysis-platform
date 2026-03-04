/**
 * ================================================================
 * TRANSMISSION ENGINE — Moteur par chemins donateur → bénéficiaire
 * ================================================================
 * Fichier autonome, chargé après successions-donations.js
 * 
 * Dépendances :
 *   - SD._fiscal  (getAbattement, getBareme, calcDroits, getNPRatio, fmt, esc, el, getFISCAL, getState, computePatrimoine)
 *   - PathOptimizer (optionnel, pour getDonors/detectLien)
 * 
 * Architecture :
 *   1. COMPUTE   — computeTransmissionMap()  → { pairs[], totalBest, totalStatuQuo }
 *   2. CHANNELS  — computeChannelsForPair()  → channel[] par paire donateur/bénéficiaire
 *   3. RENDER    — renderTransmissionMap()   → HTML dans #transmission-map
 * ================================================================
 */

const TransmissionEngine = (() => {
    'use strict';

    // === Shorthand refs to SD fiscal utilities ===
    function F()              { return SD._fiscal.getFISCAL(); }
    function state()          { return SD._fiscal.getState(); }
    function getAbattement(l, s) { return SD._fiscal.getAbattement(l, s); }
    function getBareme(l)     { return SD._fiscal.getBareme(l); }
    function calcDroits(b, br){ return SD._fiscal.calcDroits(b, br); }
    function getNPRatio(a)    { return SD._fiscal.getNPRatio(a); }
    function fmt(n)           { return SD._fiscal.fmt(n); }
    function esc(s)           { return SD._fiscal.esc(s); }
    function el(id)           { return SD._fiscal.el(id); }

    function formatLien(lien) {
        var map = {
            enfant: 'enfant', petit_enfant: 'petit-enfant',
            arriere_petit_enfant: 'arrière-petit-enfant',
            conjoint_pacs: 'conjoint/PACS', conjoint_pacs_donation: 'conjoint/PACS',
            frere_soeur: 'frère/sœur', neveu_niece: 'neveu/nièce', tiers: 'tiers'
        };
        return map[lien] || lien;
    }


    // ================================================================
    // 1. COMPUTE — Génère la carte de transmission complète
    // ================================================================

    /**
     * computeTransmissionMap
     * @param {Object} pat - patrimoine GLOBAL (from computePatrimoine)
     * @param {number} fallbackAge - âge donateur par défaut
     * @param {number} nbDonors - nombre de donateurs
     * @returns {{ pairs: Array, totalBest: number, totalStatuQuo: number, pat: Object, indirectPaths: Array }}
     */
    function computeTransmissionMap(pat, fallbackAge, nbDonors) {
        var FISC = F();
        var PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
        var donors = PO ? PO.getDonors() : [];
        var st = state();
        var allBens = st.beneficiaries.filter(function(b) { return b.lien !== 'conjoint_pacs'; });
        var obj = st.obj || {};

        // ── 1. Compute per-donor patrimoine based on actual ownership ──
        var donorPatrimoines = {};
        if (donors.length > 0) {
            donors.forEach(function(donor) {
                donorPatrimoines[donor.id] = computeDonorPatrimoine(donor, st);
            });
        }

        // ── 2. Build donor↔beneficiary pairs with per-donor patrimoine ──
        var pairs = [];

        if (donors.length > 0 && allBens.length > 0) {
            donors.forEach(function(donor) {
                var donorPat = donorPatrimoines[donor.id] || { immo: 0, financier: 0, pro: 0, passif: 0, actifNet: 0, actifBrut: 0, details: [] };

                // Skip donors with no patrimoine
                if (donorPat.actifNet <= 0) return;

                // Number of beneficiaries for THIS donor (for equal split)
                var donorBenCount = allBens.length;

                allBens.forEach(function(ben) {
                    var lien = ben.lienFiscalDonateur || ben.lien || 'tiers';
                    if (PO && PO.getEffectiveLien) {
                        var detected = PO.getEffectiveLien(donor.id, ben.id, donor.role, ben.lien);
                        if (detected && detected !== 'aucun') lien = detected;
                    }

                    // Per-beneficiary share of THIS DONOR's patrimoine
                    var benPat = {
                        immo: Math.round(donorPat.immo / donorBenCount),
                        financier: Math.round(donorPat.financier / donorBenCount),
                        pro: Math.round(donorPat.pro / donorBenCount),
                        passif: Math.round(donorPat.passif / donorBenCount),
                        actifNet: Math.round(donorPat.actifNet / donorBenCount),
                        actifBrut: Math.round(donorPat.actifBrut / donorBenCount),
                        details: donorPat.details
                    };

                    pairs.push({ donor: donor, ben: ben, lien: lien, donorPat: donorPat, benPat: benPat, donorBenCount: donorBenCount });
                });
            });
        }

        // Fallback: single donor, use global patrimoine
        if (pairs.length === 0) {
            allBens.forEach(function(ben) {
                var benPat = {
                    immo: Math.round(pat.immo / allBens.length),
                    financier: Math.round(pat.financier / allBens.length),
                    pro: Math.round(pat.pro / allBens.length),
                    passif: Math.round(pat.passif / allBens.length),
                    actifNet: Math.round(pat.actifNet / allBens.length),
                    actifBrut: Math.round(pat.actifBrut / allBens.length),
                    details: []
                };
                pairs.push({
                    donor: { nom: 'Donateur', age: fallbackAge, role: 'parent', id: -1 },
                    ben: ben,
                    lien: ben.lien || 'enfant',
                    donorPat: pat,
                    benPat: benPat,
                    donorBenCount: allBens.length
                });
            });
        }

        // ── 3. Compute channels for each pair using THEIR patrimoine ──
        var results = [];
        pairs.forEach(function(pair) {
            var channels = computeChannelsForPair(pair, pair.benPat, FISC, obj);
            channels.sort(function(a, b) { return b.net - a.net; });
            results.push({
                donor: pair.donor,
                ben: pair.ben,
                lien: pair.lien,
                donorPat: pair.donorPat,
                benPat: pair.benPat,
                channels: channels,
                best: channels[0] || null,
                statu_quo: channels.find(function(c) { return c.id === 'succession'; }) || null
            });
        });

        // ── 4. Detect indirect paths (GP → Parent → Child) ──
        var indirectPaths = detectIndirectPaths(donors, allBens, donorPatrimoines, FISC);

        var totalBest = results.reduce(function(s, r) { return s + (r.best ? r.best.net : 0); }, 0);
        var totalStatuQuo = results.reduce(function(s, r) { return s + (r.statu_quo ? r.statu_quo.net : 0); }, 0);

        return { pairs: results, totalBest: totalBest, totalStatuQuo: totalStatuQuo, pat: pat, indirectPaths: indirectPaths, donorPatrimoines: donorPatrimoines };
    }


    // ================================================================
    // 1b. PER-DONOR PATRIMOINE — Calcul basé sur la propriété réelle
    // ================================================================

    /**
     * computeDonorPatrimoine — Calcule le patrimoine réellement détenu par un donateur
     * en analysant les owners de chaque actif
     */
    function computeDonorPatrimoine(donor, st) {
        var donorKey = 'd-' + donor.id; // Format used in getPersonsList()
        var immo = 0, financier = 0, pro = 0, passif = 0;
        var details = [];
        var hasOwnership = false; // Track if ANY ownership data was found

        // ── IMMOBILIER ──
        (st.immo || []).forEach(function(im) {
            if (!im.owners || im.owners.length === 0) return;
            im.owners.forEach(function(o) {
                if (String(o.personId) === donorKey) {
                    hasOwnership = true;
                    var quote = (o.quote || 100) / 100;
                    var val = Math.round((im.valeur || 0) * quote);
                    immo += val;
                    details.push({
                        type: 'immo', label: im.titre || 'Bien immo',
                        valeur: val, quote: o.quote || 100, role: o.role || 'pp',
                        sousType: im.type || '?', structure: im.structure || 'pp'
                    });
                }
            });
        });

        // ── FINANCIER ──
        (st.finance || []).forEach(function(f) {
            if (String(f.ownerId) === donorKey) {
                hasOwnership = true;
                financier += (f.valeur || 0);
                details.push({
                    type: 'finance', label: f.type || 'Financier',
                    valeur: f.valeur || 0, sousType: f.type,
                    isAV: f.type === 'assurance_vie',
                    isCapi: f.type === 'contrat_capi',
                    avBeneficiaires: f.avBeneficiaires || [],
                    npBeneficiaires: f.npBeneficiaires || [],
                    ageVersement: f.ageVersement
                });
            }
        });

        // ── DETTES ──
        (st.debts || []).forEach(function(d) {
            if (String(d.ownerId) === donorKey) {
                hasOwnership = true;
                passif += (d.montant || 0);
            }
        });

        // ── PRO (pas de champ owner → split entre donateurs) ──
        var PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
        var nbDonors = PO ? Math.max(1, PO.getDonors().length) : 1;
        (st.pro || []).forEach(function(p) {
            pro += Math.round((p.valeur || 0) / nbDonors);
        });

        var actifBrut = immo + financier + pro;
        var actifNet = actifBrut - passif;

        // ── FALLBACK : si AUCUNE donnée de propriété n'existe, ne pas retourner 0 ──
        // (l'utilisateur n'a pas renseigné les propriétaires)
        if (!hasOwnership && (st.immo.length > 0 || st.finance.length > 0)) {
            // Check if this donor's patrimoine field was set in PathOptimizer
            if (donor.patrimoine && donor.patrimoine > 0) {
                return {
                    immo: 0, financier: 0, pro: 0, passif: 0,
                    actifNet: donor.patrimoine, actifBrut: donor.patrimoine,
                    details: [{ type: 'global', label: 'Patrimoine déclaré (non ventilé)', valeur: donor.patrimoine }],
                    fallback: true
                };
            }
            // No ownership AND no patrimoine field → return empty (will be skipped)
            return { immo: 0, financier: 0, pro: 0, passif: 0, actifNet: 0, actifBrut: 0, details: [], fallback: true, noData: true };
        }

        return { immo: immo, financier: financier, pro: pro, passif: passif, actifNet: actifNet, actifBrut: actifBrut, details: details, fallback: false };
    }


    // ================================================================
    // 1c. INDIRECT PATHS — Détection des chemins indirects GP→Parent→Enfant
    // ================================================================

    /**
     * detectIndirectPaths — Identifie les chaînes de transmission indirectes
     * Ex: GP donne 100k au Parent (abat. 100k) → Parent donne 100k à l'Enfant (abat. 100k)
     * = 200k transmis avec 0€ de droits vs GP→Enfant directement = abat. 31 865€ seulement
     */
    function detectIndirectPaths(donors, bens, donorPatrimoines, FISC) {
        var paths = [];
        var PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
        if (!PO || donors.length < 2) return paths;

        // Find GP/AGP donors and Parent donors
        var gpDonors = donors.filter(function(d) { return d.role === 'grand_parent' || d.role === 'arr_grand_parent'; });
        var parentDonors = donors.filter(function(d) { return d.role === 'parent'; });

        gpDonors.forEach(function(gp) {
            var gpPat = donorPatrimoines[gp.id];
            if (!gpPat || gpPat.actifNet <= 0) return;

            parentDonors.forEach(function(parent) {
                bens.forEach(function(child) {
                    // Direct path: GP → Child
                    var lienDirect = 'petit_enfant';
                    if (gp.role === 'arr_grand_parent') lienDirect = 'arriere_petit_enfant';
                    var abatDirect = getAbattement(lienDirect, false);

                    // Indirect path: GP → Parent → Child
                    var abatGPtoParent = getAbattement('enfant', false); // 100 000 €
                    var abatParentToChild = getAbattement('enfant', false); // 100 000 €
                    var totalAbatIndirect = abatGPtoParent + abatParentToChild;

                    // Only flag if indirect path gives MORE total abattement
                    if (totalAbatIndirect > abatDirect) {
                        var maxDirectExo = abatDirect;
                        var maxIndirectExo = totalAbatIndirect;

                        // Calculate actual savings on the GP's patrimoine
                        var gpAmount = gpPat.actifNet;
                        var amountViaParent = Math.min(gpAmount, abatGPtoParent);
                        // The parent can then donate this to the child using their own abattement
                        var amountParentToChild = Math.min(amountViaParent, abatParentToChild);

                        // Direct: GP→Child, droits on (gpAmount - abatDirect)
                        var droitsDirect = calcDroits(Math.max(0, gpAmount - abatDirect), getBareme(lienDirect));
                        // Indirect: GP→Parent (0 droits if <= abatGPtoParent) + Parent→Child (0 if <= abatParentToChild)
                        var droitsGPtoP = calcDroits(Math.max(0, gpAmount - abatGPtoParent), getBareme('enfant'));
                        var droitsPtoC = calcDroits(Math.max(0, amountViaParent - abatParentToChild), getBareme('enfant'));
                        var droitsIndirect = droitsGPtoP + droitsPtoC;

                        if (droitsIndirect < droitsDirect) {
                            paths.push({
                                gp: gp,
                                parent: parent,
                                child: child,
                                lienDirect: lienDirect,
                                abatDirect: abatDirect,
                                abatIndirect: totalAbatIndirect,
                                droitsDirect: droitsDirect,
                                droitsIndirect: droitsIndirect,
                                economie: droitsDirect - droitsIndirect,
                                description: gp.nom + ' → ' + parent.nom + ' (abat. ' + fmt(abatGPtoParent) + ') → ' + (child.prenom || child.nom) + ' (abat. ' + fmt(abatParentToChild) + ') = ' + fmt(totalAbatIndirect) + ' d\'abattements cumulés vs ' + fmt(abatDirect) + ' en direct. Économie : ' + fmt(droitsDirect - droitsIndirect)
                            });
                        }
                    }
                });
            });
        });

        return paths;
    }


    // ================================================================
    // 2. CHANNELS — Calcul de chaque canal fiscal pour une paire
    // ================================================================

    function computeChannelsForPair(pair, benPat, FISC, obj) {
        var donor = pair.donor;
        var lien = pair.lien;
        var donorAge = donor.age || 60;
        var npRatio = getNPRatio(donorAge);
        var abat = getAbattement(lien, false);
        var abatSucc = getAbattement(lien, true);
        var bareme = getBareme(lien);

        // benPat = already the per-beneficiary share of THIS DONOR's patrimoine
        var partImmo = benPat.immo || 0;
        var partFin = benPat.financier || 0;
        var partTotal = benPat.actifNet || 0;
        var partBrut = benPat.actifBrut || partTotal;

        // Deduct prior donations from abattement (rappel fiscal 15 ans)
        var PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
        var donAnterieures = 0;
        if (PO && PO.getDonorDonationForBenRaw && donor.id >= 0) {
            var raw = PO.getDonorDonationForBenRaw(donor.id, pair.ben.id);
            if (raw && raw.montant > 0) donAnterieures = raw.montant;
        }
        var abatRestant = Math.max(0, abat - donAnterieures);
        var abatSuccRestant = Math.max(0, abatSucc - donAnterieures);

        var channels = [];

        // ─── 1. SUCCESSION (statu quo) ──────────────────────────
        var baseSucc = Math.max(0, partTotal - abatSuccRestant);
        var droitsSucc = calcDroits(baseSucc, bareme);
        var fraisSucc = Math.round(partTotal * FISC.fraisNotaireSuccPct);
        channels.push({
            id: 'succession', name: 'Succession (statu quo)',
            icon: '📋', timing: 'Au décès', color: '#ff6b6b',
            assiette: partTotal, abattement: abatSuccRestant,
            base_taxable: baseSucc, droits: droitsSucc, frais: fraisSucc,
            net: partTotal - droitsSucc - fraisSucc,
            taux_effectif: partTotal > 0 ? Math.round(droitsSucc / partTotal * 100) : 0,
            fraisAn: 0,
            advantages: [
                'Aucune démarche à faire',
                'Le bien reste dans le patrimoine du vivant du donateur'
            ],
            risks: [
                'Droits de succession au barème plein',
                'Pas de réduction pour âge',
                'Pas de choix du moment',
                donAnterieures > 0 ? 'Abattement partiellement consommé : ' + fmt(donAnterieures) + ' déjà utilisé → reste ' + fmt(abatSuccRestant) : null
            ].filter(Boolean),
            objectives: [],
            details: 'Statu quo → droits au décès. Abattement ' + formatLien(lien) + ' : ' + fmt(abatSucc) + (donAnterieures > 0 ? ' (dont ' + fmt(donAnterieures) + ' consommé → reste ' + fmt(abatSuccRestant) + ')' : '') + '.'
        });

        // ─── 2. DONATION DIRECTE PP ─────────────────────────────
        var baseDonPP = Math.max(0, partTotal - abatRestant);
        var droitsDonPP = calcDroits(baseDonPP, bareme);
        var reduction = donorAge < 70 ? 0.50 : 0;
        var droitsDonPPRed = Math.round(droitsDonPP * (1 - reduction));
        var fraisDonPP = Math.round(partTotal * FISC.fraisNotairePct);
        channels.push({
            id: 'donation_pp', name: 'Donation directe (PP)',
            icon: '🎁', timing: 'Maintenant', color: '#c68642',
            assiette: partTotal, abattement: abatRestant,
            base_taxable: baseDonPP, droits: droitsDonPPRed, frais: fraisDonPP,
            net: partTotal - droitsDonPPRed - fraisDonPP,
            taux_effectif: partTotal > 0 ? Math.round(droitsDonPPRed / partTotal * 100) : 0,
            fraisAn: 0,
            advantages: [
                'Abattement ' + fmt(abat) + ' renouvelable tous les 15 ans' + (donAnterieures > 0 ? ' (reste ' + fmt(abatRestant) + ')' : ''),
                donorAge < 70 ? 'Réduction 50% (donateur < 70 ans, art. 790 CGI)' : null,
                'Transmission immédiate, purge la plus-value'
            ].filter(Boolean),
            risks: [
                'Dessaisissement immédiat et irrévocable',
                'Le donateur perd l\'usage du bien'
            ],
            objectives: ['minimiser', 'egalite'],
            details: 'Abattement ' + fmt(abat) + (donAnterieures > 0 ? ' (reste ' + fmt(abatRestant) + ' après donations antérieures)' : '') + ' (' + formatLien(lien) + ') · Base taxable : ' + fmt(baseDonPP) + (reduction > 0 ? ' · Réduction 50% → droits : ' + fmt(droitsDonPPRed) : '')
        });

        // ─── 3. DONATION NP (démembrement) ──────────────────────
        var valeurNP = Math.round(partTotal * npRatio);
        var baseNP = Math.max(0, valeurNP - abatRestant);
        var droitsNP = calcDroits(baseNP, bareme);
        var fraisNP = Math.round(valeurNP * FISC.fraisNotairePct);
        channels.push({
            id: 'donation_np', name: 'Donation NP (' + Math.round(npRatio * 100) + '%)',
            icon: '🔑', timing: 'Maintenant', color: '#10b981',
            assiette: valeurNP, abattement: abatRestant,
            base_taxable: baseNP, droits: droitsNP, frais: fraisNP,
            net: partTotal - droitsNP - fraisNP,
            taux_effectif: partTotal > 0 ? Math.round(droitsNP / partTotal * 100) : 0,
            fraisAn: 0,
            advantages: [
                'Droits calculés sur ' + Math.round(npRatio * 100) + '% seulement (art. 669)',
                'Donateur conserve usufruit (usage + revenus)',
                'Au décès : NP → PP sans droits supplémentaires',
                'Réunit PP sans re-taxation'
            ],
            risks: [
                'Le nu-propriétaire ne peut pas vendre sans accord de l\'usufruitier'
            ],
            objectives: ['minimiser', 'revenus', 'controle'],
            details: 'NP = ' + fmt(valeurNP) + ' (' + Math.round(npRatio * 100) + '% pour donateur de ' + donorAge + ' ans) · Économie vs PP : ' + fmt(droitsDonPPRed - droitsNP)
        });

        // ─── 4. ASSURANCE-VIE (art. 990 I) — primes avant 70 ans ─
        if (partFin > 0 || partTotal > 50000) {
            var avCap = partFin > 0 ? partFin : partTotal;
            var avAbat = FISC.av990I.abattement;
            var avBase = Math.max(0, avCap - avAbat);
            var avTr1 = Math.min(avBase, FISC.av990I.seuil2 - avAbat);
            var avTr2 = Math.max(0, avBase - avTr1);
            var avDroits = Math.round(avTr1 * FISC.av990I.taux1 + avTr2 * FISC.av990I.taux2);

            channels.push({
                id: 'av_990i', name: 'Assurance-vie (990 I)',
                icon: '🛡️', timing: 'Au décès', color: '#3b82f6',
                assiette: avCap, abattement: avAbat,
                base_taxable: avBase, droits: avDroits, frais: Math.round(avCap * 0.005),
                net: avCap - avDroits - Math.round(avCap * 0.005),
                taux_effectif: avCap > 0 ? Math.round(avDroits / avCap * 100) : 0,
                fraisAn: Math.round(avCap * 0.007),
                advantages: [
                    'Hors succession — abattement ' + fmt(avAbat) + ' par bénéficiaire',
                    'Bénéficiaire libre : petit-enfant, tiers, association',
                    'Rachat annuel exonéré IR : ' + fmt(4600) + ' (célibataire) / ' + fmt(9200) + ' (couple) après 8 ans',
                    'Primes avant 70 ans : fiscalité 990 I avantageuse',
                    donorAge < 70 ? '⚠️ Verser AVANT 70 ans pour rester en 990 I' : '⚠️ Donateur ≥ 70 ans → primes en 757 B (moins favorable)'
                ],
                risks: [
                    'Frais de gestion annuels (~0,7%)',
                    donorAge >= 70 ? 'Primes versées maintenant → art. 757 B (abattement réduit)' : null,
                    partBrut > 0 && avCap / partBrut > FISC.primesExagSeuil ? 'Risque primes manifestement exagérées (' + Math.round(avCap / partBrut * 100) + '% du patrimoine)' : null
                ].filter(Boolean),
                objectives: ['minimiser', 'generation'],
                details: 'Capital AV : ' + fmt(avCap) + ' · Abat. 990 I : ' + fmt(avAbat) + ' · 20% jusqu\'à ' + fmt(FISC.av990I.seuil2) + ', 31,25% au-delà'
            });
        }

        // ─── 5. AV 757 B (primes après 70 ans) ─────────────────
        if (donorAge >= 70 && (partFin > 0 || partTotal > 30000)) {
            var av757Cap = partFin > 0 ? partFin : partTotal;
            var av757AbatGlobal = FISC.av757B.abattementGlobal;
            var av757Abat = Math.round(av757AbatGlobal / (pair.donorBenCount || 1));
            var av757Base = Math.max(0, av757Cap - av757Abat);
            var av757Droits = calcDroits(av757Base, bareme);
            channels.push({
                id: 'av_757b', name: 'AV après 70 ans (757 B)',
                icon: '📉', timing: 'Au décès', color: '#f59e0b',
                assiette: av757Cap, abattement: av757Abat,
                base_taxable: av757Base, droits: av757Droits, frais: Math.round(av757Cap * 0.005),
                net: av757Cap - av757Droits - Math.round(av757Cap * 0.005),
                taux_effectif: av757Cap > 0 ? Math.round(av757Droits / av757Cap * 100) : 0,
                fraisAn: Math.round(av757Cap * 0.007),
                advantages: [
                    'Les INTÉRÊTS sont exonérés (seules les primes versées sont taxées)',
                    'Abattement global ' + fmt(av757AbatGlobal) + ' (partagé entre bénéficiaires)',
                    'Bénéficiaire libre'
                ],
                risks: [
                    'Abattement global ' + fmt(av757AbatGlobal) + ' seulement (vs ' + fmt(FISC.av990I.abattement) + ' en 990 I)',
                    'Barème de droit commun (non le forfait 20%/31,25%)'
                ],
                objectives: ['generation'],
                details: 'Abat. global ' + fmt(av757AbatGlobal) + ' (part : ' + fmt(av757Abat) + '). Intérêts acquis exonérés. Barème succession.'
            });
        }

        // ─── 6. CONTRAT DE CAPITALISATION DÉMEMBRÉ ──────────────
        if (partFin > 50000 || partTotal > 100000) {
            var capiCap = partFin > 0 ? partFin : partTotal;
            var capiNP = Math.round(capiCap * npRatio);
            var capiBase = Math.max(0, capiNP - abatRestant);
            var capiDroits = calcDroits(capiBase, bareme);
            var capiFrais = Math.round(capiNP * FISC.fraisNotairePct);
            channels.push({
                id: 'capi_demembre', name: 'Capi. démembré (NP)',
                icon: '📊', timing: 'Maintenant', color: '#8b5cf6',
                assiette: capiNP, abattement: abatRestant,
                base_taxable: capiBase, droits: capiDroits, frais: capiFrais,
                net: capiCap - capiDroits - capiFrais,
                taux_effectif: capiCap > 0 ? Math.round(capiDroits / capiCap * 100) : 0,
                fraisAn: Math.round(capiCap * 0.007),
                advantages: [
                    'Antériorité fiscale conservée (pas de purge des PV)',
                    'Quasi-usufruit possible → créance de restitution déductible au décès',
                    'Droits sur NP seulement (' + Math.round(npRatio * 100) + '%)',
                    'Le souscripteur-usufruitier garde le contrôle'
                ],
                risks: [
                    'Frais de gestion annuels',
                    'Contrat entre dans la succession (contrairement à l\'AV)'
                ],
                objectives: ['minimiser', 'revenus', 'controle'],
                details: 'NP ' + Math.round(npRatio * 100) + '% = ' + fmt(capiNP) + ' · Abat. ' + fmt(abatRestant) + (donAnterieures > 0 ? ' (reste après donations ant.)' : '') + ' · Avantage vs AV si montants > ' + fmt(FISC.av990I.abattement)
            });
        }

        // ─── 7. SCI IR + DONATION NP PARTS ──────────────────────
        if (partImmo > 50000 || partTotal > 100000) {
            var sciImmo = partImmo > 0 ? partImmo : partTotal;
            var decote = 0.15;
            var sciValParts = Math.round(sciImmo * (1 - decote));
            var sciNP = Math.round(sciValParts * npRatio);
            var sciBase = Math.max(0, sciNP - abatRestant);
            var sciDroits = calcDroits(sciBase, bareme);
            var sciFrais = Math.round(sciNP * FISC.fraisNotairePct) + Math.round(FISC.fraisStructure.creation / (pair.donorBenCount || 1));
            channels.push({
                id: 'sci_np', name: 'SCI + donation NP parts',
                icon: '🏢', timing: 'Maintenant', color: '#06b6d4',
                assiette: sciNP, abattement: abatRestant,
                base_taxable: sciBase, droits: sciDroits, frais: sciFrais,
                net: sciImmo - sciDroits - sciFrais,
                taux_effectif: sciImmo > 0 ? Math.round(sciDroits / sciImmo * 100) : 0,
                fraisAn: Math.round(FISC.fraisStructure.sci_ir / (pair.donorBenCount || 1)),
                advantages: [
                    'Décote 15% sur la valeur des parts (illiquidité)',
                    'Donateur = gérant → contrôle total',
                    'Démembrement NP : droits sur ' + Math.round(npRatio * 100) + '% de la valeur décotée',
                    'Cumul décote + démembrement = double levier',
                    'Facilite la transmission progressive (donation par tranches)'
                ],
                risks: [
                    'Frais de création ~' + fmt(FISC.fraisStructure.creation),
                    'Comptabilité annuelle obligatoire (~' + fmt(FISC.fraisStructure.sci_ir) + '/an)',
                    'SCI IR + meublé = risque requalification IS si > 10% revenus meublés'
                ],
                objectives: ['minimiser', 'revenus', 'controle'],
                details: 'Immo ' + fmt(sciImmo) + ' · Décote 15% → parts ' + fmt(sciValParts) + ' · NP ' + Math.round(npRatio * 100) + '% = ' + fmt(sciNP)
            });
        }

        // ─── 8. DON MANUEL + DON FAMILIAL ARGENT ────────────────
        if (partFin > 0 && ['enfant', 'petit_enfant', 'arriere_petit_enfant', 'neveu_niece'].includes(lien)) {
            var donFamMax = FISC.abattements.don_familial_argent;
            var donTotal = Math.min(partFin, abatRestant + donFamMax);
            var donDroits = donTotal <= (abatRestant + donFamMax) ? 0 : calcDroits(donTotal - abatRestant - donFamMax, bareme);
            channels.push({
                id: 'don_manuel', name: 'Don manuel + familial',
                icon: '💵', timing: 'Maintenant', color: '#22c55e',
                assiette: donTotal, abattement: abatRestant + donFamMax,
                base_taxable: Math.max(0, donTotal - abatRestant - donFamMax), droits: donDroits, frais: 0,
                net: donTotal - donDroits,
                taux_effectif: 0,
                fraisAn: 0,
                advantages: [
                    'Cumul abattement ' + formatLien(lien) + ' (' + fmt(abat) + (donAnterieures > 0 ? ', reste ' + fmt(abatRestant) : '') + ') + don familial (' + fmt(donFamMax) + ')',
                    'Total exonéré disponible : ' + fmt(abatRestant + donFamMax) + ' par donateur',
                    donDroits === 0 ? '0 € de droits' : null,
                    'Déclaration en ligne obligatoire (depuis 01/2026)'
                ],
                risks: [
                    'Limité aux sommes d\'argent',
                    'Don familial : donateur < 80 ans, donataire majeur',
                    'Rappel fiscal 15 ans'
                ],
                objectives: ['minimiser'],
                details: 'Abattement restant : ' + fmt(abatRestant) + ' + don familial ' + fmt(donFamMax) + ' = ' + fmt(abatRestant + donFamMax) + ' exonéré.' + (donAnterieures > 0 ? ' Donations antérieures : ' + fmt(donAnterieures) + ' (rappel 15 ans).' : '')
            });
        }

        return channels;
    }


    // ================================================================
    // 3. RENDER — Affichage dans #transmission-map
    // ================================================================

    function renderTransmissionMap(txMap, pat) {
        var container = el('transmission-map');
        if (!container) return;

        var st = state();
        var html = '';

        // ── PER-DONOR PATRIMOINE SUMMARY (if multiple donors) ──
        if (txMap.donorPatrimoines && Object.keys(txMap.donorPatrimoines).length > 1) {
            var PO2 = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
            var donors2 = PO2 ? PO2.getDonors() : [];

            html += '<div style="margin-bottom:16px;padding:16px;border-radius:12px;background:rgba(198,134,66,.04);border:1px solid rgba(198,134,66,.1);">';
            html += '<div style="font-size:.78rem;font-weight:700;color:var(--primary-color);margin-bottom:10px;"><i class="fas fa-wallet" style="margin-right:6px;"></i> Patrimoine par donateur</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">';

            Object.keys(txMap.donorPatrimoines).forEach(function(donorId) {
                var dp = txMap.donorPatrimoines[donorId];
                var donorInfo = donors2.find(function(d) { return String(d.id) === String(donorId); });
                var donorLabel = donorInfo ? esc(donorInfo.nom) : 'Donateur';
                var roleLabel = donorInfo ? formatLien(donorInfo.role === 'parent' ? 'enfant' : donorInfo.role) : '';

                html += '<div style="padding:12px;border-radius:10px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.08);">';
                html += '<div style="font-size:.78rem;font-weight:600;color:var(--text-primary);">' + donorLabel + '</div>';
                html += '<div style="font-size:.62rem;color:var(--text-muted);margin-bottom:6px;">' + (donorInfo ? donorInfo.role + ', ' + (donorInfo.age || '?') + ' ans' : '') + '</div>';
                html += '<div style="font-size:1rem;font-weight:800;color:var(--primary-color);">' + fmt(dp.actifNet) + '</div>';

                if (dp.immo > 0 || dp.financier > 0) {
                    html += '<div style="font-size:.6rem;color:var(--text-muted);margin-top:4px;">';
                    if (dp.immo > 0) html += 'Immo ' + fmt(dp.immo);
                    if (dp.immo > 0 && dp.financier > 0) html += ' · ';
                    if (dp.financier > 0) html += 'Fin. ' + fmt(dp.financier);
                    html += '</div>';
                }
                if (dp.fallback) {
                    html += '<div style="font-size:.55rem;color:var(--accent-coral);margin-top:2px;">⚠️ Propriété non ventilée</div>';
                }

                html += '</div>';
            });

            html += '</div></div>';
        }

        // ── PER PAIR CARDS ────────────────────────────────────
        txMap.pairs.forEach(function(pair) {
            var donorLabel = esc(pair.donor.nom || 'Donateur');
            var benLabel = esc(pair.ben.prenom || pair.ben.nom || 'Bénéficiaire');
            var lienLabel = formatLien(pair.lien);
            var abatLabel = fmt(getAbattement(pair.lien, false));

            html += '<div class="section-card" style="margin-bottom:16px;border-color:rgba(198,134,66,.15);">';

            // Header: Donor → Beneficiary
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">';
            html += '<div>';
            html += '<div style="font-size:.95rem;font-weight:700;color:var(--text-primary);">';
            html += '<span style="color:var(--primary-color);">' + donorLabel + '</span>';
            html += ' <i class="fas fa-long-arrow-alt-right" style="font-size:.7rem;color:var(--text-muted);margin:0 6px;"></i> ';
            html += '<span style="color:var(--accent-green);">' + benLabel + '</span>';
            html += '</div>';
            html += '<div style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">' + lienLabel + ' · abattement ' + abatLabel + ' · donateur ' + (pair.donor.age || '?') + ' ans</div>';
            // Show donor's actual patrimoine
            if (pair.donorPat && pair.donorPat.actifNet > 0) {
                html += '<div style="font-size:.65rem;color:var(--primary-color);margin-top:3px;">Patrimoine du donateur : ' + fmt(pair.donorPat.actifNet);
                if (pair.donorPat.immo > 0) html += ' (immo ' + fmt(pair.donorPat.immo) + ')';
                if (pair.donorPat.financier > 0) html += ' (fin. ' + fmt(pair.donorPat.financier) + ')';
                html += ' · Part/bénéf. : ' + fmt(pair.benPat.actifNet) + '</div>';
            }
            html += '</div>';

            if (pair.best) {
                html += '<div style="text-align:right;">';
                html += '<div style="font-size:.62rem;color:var(--text-muted);">Meilleur canal</div>';
                html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-green);">' + pair.best.icon + ' ' + esc(pair.best.name) + '</div>';
                html += '</div>';
            }
            html += '</div>';

            // Channel grid
            html += '<div style="display:grid;gap:8px;">';
            pair.channels.forEach(function(ch, ci) {
                html += renderChannelCard(ch, ci, pair, st);
            });
            html += '</div>';

            html += '</div>'; // close pair card
        });

        // ── INDIRECT PATHS (GP → Parent → Child) ──────────────
        if (txMap.indirectPaths && txMap.indirectPaths.length > 0) {
            html += '<div class="section-card" style="margin-top:16px;border-color:rgba(59,130,246,.2);background:rgba(59,130,246,.03);">';
            html += '<div style="font-size:.88rem;font-weight:700;color:#3b82f6;margin-bottom:10px;"><i class="fas fa-route" style="margin-right:6px;"></i> Chemins indirects détectés</div>';
            html += '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:12px;">Transmettre via un intermédiaire (parent) peut doubler les abattements disponibles.</div>';

            txMap.indirectPaths.forEach(function(ip) {
                html += '<div style="padding:12px 16px;border-radius:10px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.12);margin-bottom:8px;">';
                html += '<div style="font-size:.8rem;font-weight:600;color:var(--text-primary);margin-bottom:6px;">';
                html += esc(ip.gp.nom) + ' <i class="fas fa-arrow-right" style="font-size:.55rem;color:var(--text-muted);margin:0 4px;"></i> ';
                html += esc(ip.parent.nom) + ' <i class="fas fa-arrow-right" style="font-size:.55rem;color:var(--text-muted);margin:0 4px;"></i> ';
                html += esc(ip.child.prenom || ip.child.nom);
                html += '</div>';

                html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.72rem;">';
                html += '<div><span style="color:var(--text-muted);">Direct (' + formatLien(ip.lienDirect) + ') :</span> abat. ' + fmt(ip.abatDirect) + ', droits <span style="color:var(--accent-coral);">' + fmt(ip.droitsDirect) + '</span></div>';
                html += '<div><span style="color:var(--text-muted);">Indirect (via parent) :</span> abat. cumulés ' + fmt(ip.abatIndirect) + ', droits <span style="color:var(--accent-green);">' + fmt(ip.droitsIndirect) + '</span></div>';
                html += '<div style="font-weight:700;color:var(--accent-green);">Économie : ' + fmt(ip.economie) + '</div>';
                html += '</div>';

                html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:6px;font-style:italic;">' + esc(ip.description) + '</div>';
                html += '</div>';
            });

            html += '</div>';
        }

        container.innerHTML = html;
    }


    /**
     * renderChannelCard — une ligne cliquable pour un canal
     */
    function renderChannelCard(ch, ci, pair, st) {
        var isBest = ci === 0;
        var isWorst = ch.id === 'succession';
        var bgColor = isBest ? 'rgba(16,185,129,.06)' : (isWorst ? 'rgba(255,107,107,.04)' : 'rgba(198,134,66,.02)');
        var borderColor = isBest ? 'rgba(16,185,129,.2)' : (isWorst ? 'rgba(255,107,107,.12)' : 'rgba(198,134,66,.06)');

        var html = '';
        html += '<div style="padding:14px 16px;border-radius:10px;background:' + bgColor + ';border:1px solid ' + borderColor + ';cursor:pointer;" onclick="this.querySelector(\'.ch-details\').style.display=this.querySelector(\'.ch-details\').style.display===\'none\'?\'\':\'none\'">';

        // Row 1: Name + Key Metrics
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">';

        // Left: icon + name
        html += '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:180px;">';
        html += '<span style="font-size:1.1rem;">' + ch.icon + '</span>';
        html += '<div>';
        html += '<div style="font-size:.82rem;font-weight:600;color:var(--text-primary);">' + esc(ch.name);
        if (isBest) html += ' <span style="font-size:.6rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.15);color:var(--accent-green);">🏆 OPTIMAL</span>';
        html += '</div>';
        html += '<div style="font-size:.65rem;color:var(--text-muted);">' + ch.timing + ' · Taux effectif : ' + ch.taux_effectif + '%</div>';
        html += '</div></div>';

        // Right: metrics
        html += '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">';
        html += '<div style="text-align:center;"><div style="font-size:.58rem;color:var(--text-muted);">Droits</div><div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);">' + fmt(ch.droits) + '</div></div>';
        html += '<div style="text-align:center;"><div style="font-size:.58rem;color:var(--text-muted);">Net transmis</div><div style="font-size:.9rem;font-weight:800;color:' + (isBest ? 'var(--accent-green)' : 'var(--text-primary)') + ';">' + fmt(ch.net) + '</div></div>';

        // vs statu quo
        if (pair.statu_quo && ch.id !== 'succession') {
            var diff = ch.net - pair.statu_quo.net;
            if (diff !== 0) {
                var diffColor = diff > 0 ? 'var(--accent-green)' : 'var(--accent-coral)';
                html += '<div style="text-align:center;"><div style="font-size:.58rem;color:var(--text-muted);">vs statu quo</div><div style="font-size:.75rem;font-weight:700;color:' + diffColor + ';">' + (diff > 0 ? '+' : '') + fmt(diff) + '</div></div>';
            }
        }
        html += '</div></div>';

        // Row 2: Expandable details
        html += '<div class="ch-details" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(198,134,66,.08);">';

        // Fiscal decomposition
        html += '<div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:8px;line-height:1.7;">';
        html += 'Assiette : ' + fmt(ch.assiette) + ' · Abattement : ' + fmt(ch.abattement) + ' · Base taxable : ' + fmt(ch.base_taxable) + '<br>';
        html += 'Droits : ' + fmt(ch.droits) + ' · Frais : ' + fmt(ch.frais) + (ch.fraisAn > 0 ? ' · Frais annuels : ' + fmt(ch.fraisAn) : '') + '<br>';
        html += esc(ch.details);
        html += '</div>';

        // Advantages
        if (ch.advantages && ch.advantages.length > 0) {
            html += '<div style="font-size:.68rem;color:var(--accent-green);margin-bottom:4px;">';
            ch.advantages.forEach(function(a) { html += '<div>✅ ' + esc(a) + '</div>'; });
            html += '</div>';
        }

        // Risks
        if (ch.risks && ch.risks.length > 0) {
            html += '<div style="font-size:.68rem;color:var(--accent-coral);">';
            ch.risks.forEach(function(r) { html += '<div>⚠️ ' + esc(r) + '</div>'; });
            html += '</div>';
        }

        // Objective badges
        var activeObjs = Object.entries(st.obj || {}).filter(function(e) { return e[1]; }).map(function(e) { return e[0]; });
        var matchedObjs = (ch.objectives || []).filter(function(o) { return activeObjs.indexOf(o) >= 0; });
        if (matchedObjs.length > 0) {
            var objLabels = {
                minimiser: '💰 Min. droits', revenus: '📊 Revenus', controle: '🔒 Contrôle',
                conjoint: '💍 Conjoint', egalite: '⚖️ Égalité', generation: '👶 Génération', vendre: '🏷️ Vente'
            };
            html += '<div style="margin-top:6px;">';
            matchedObjs.forEach(function(o) {
                html += '<span style="font-size:.58rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.1);color:var(--accent-green);margin-right:4px;">' + (objLabels[o] || o) + '</span>';
            });
            html += '</div>';
        }

        html += '</div>'; // close ch-details
        html += '</div>'; // close channel card

        return html;
    }


    // ================================================================
    // 4. AI SUMMARY — Synthèse détaillée via Claude Opus (Anthropic API)
    // ================================================================

    /**
     * generateNarrativeSummary — Envoie TOUT le contexte à Claude Opus
     * et affiche une analyse complète et personnalisée en français.
     */
    async function generateNarrativeSummary(txMap, pat) {
        var container = el('ai-narrative-summary');
        if (!container) return;

        // Show loading state FIRST (summary is above channel cards)
        container.style.display = '';
        container.innerHTML = '<div style="padding:24px;border-radius:14px;background:linear-gradient(135deg,rgba(198,134,66,.06),rgba(59,130,246,.04));border:1px solid rgba(198,134,66,.12);">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--primary-color),#d4a574);display:flex;align-items:center;justify-content:center;"><i class="fas fa-brain" style="color:#1a1a2e;font-size:.9rem;"></i></div>' +
            '<div><div style="font-size:.88rem;font-weight:700;color:var(--primary-color);">Analyse patrimoniale en cours</div>' +
            '<div style="font-size:.68rem;color:var(--text-muted);">Claude Opus rédige votre synthèse détaillée...</div></div></div>' +
            '<div style="display:flex;justify-content:center;padding:12px 0;"><div style="display:inline-flex;gap:6px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary-color);animation:pulse 1.4s ease-in-out infinite;"></span>' +
            '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary-color);animation:pulse 1.4s ease-in-out .25s infinite;"></span>' +
            '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary-color);animation:pulse 1.4s ease-in-out .5s infinite;"></span>' +
            '</div></div></div>';

        // Build comprehensive context
        var st = state();
        var contextData = buildFullContext(txMap, pat, st);

        try {
            var response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-opus-4-6',
                    max_tokens: 3000,
                    system: buildDetailedSystemPrompt(),
                    messages: [
                        { role: 'user', content: contextData }
                    ]
                })
            });

            var data = await response.json();

            if (data && data.content && data.content.length > 0) {
                var text = data.content
                    .filter(function(c) { return c.type === 'text'; })
                    .map(function(c) { return c.text; })
                    .join('\n');

                renderDetailedSummary(container, text, txMap, pat);
            } else {
                renderFallbackSummary(container, txMap, pat);
            }
        } catch (err) {
            console.warn('AI summary error:', err);
            renderFallbackSummary(container, txMap, pat);
        }
    }

    function buildDetailedSystemPrompt() {
        return "Tu es un conseiller senior en gestion de patrimoine et fiscalité successorale française (20+ ans d'expérience). " +
            "Tu reçois l'intégralité du dossier d'un client : arbre familial, patrimoine détaillé, donations déjà réalisées, abattements consommés, objectifs, et les résultats chiffrés de chaque canal de transmission pour chaque chemin donateur→bénéficiaire.\n\n" +

            "Rédige une ANALYSE COMPLÈTE et PERSONNALISÉE. Structure obligatoire :\n\n" +

            "**1. DROITS DE SUCCESSION ESTIMÉS (statu quo)**\n" +
            "Commence TOUJOURS par le montant TOTAL de droits que la famille devra payer si RIEN n'est fait. " +
            "Détaille par bénéficiaire : qui paie combien, sur quelle base taxable, à quel taux. " +
            "C'est le chiffre le plus important — il déclenche la prise de conscience.\n\n" +

            "**2. ANALYSE PAR CHEMIN donateur → bénéficiaire**\n" +
            "Pour CHAQUE paire donateur→bénéficiaire, fais une vraie analyse narrative :\n" +
            "- Compare EXPLICITEMENT le scénario SUCCESSION (ne rien faire) vs le MEILLEUR canal de donation\n" +
            "- Identifie clairement : 'Le canal qui produit le MOINS de droits est X, avec Y € de droits (Z% de taux effectif), contre W € en succession'\n" +
            "- Explique le MÉCANISME fiscal (pas juste les chiffres) : pourquoi le démembrement réduit l'assiette, comment l'AV 990I sort de la succession, etc.\n" +
            "- Mentionne ce que le donateur CONSERVE (revenus, usage, contrôle) et ce qu'il PERD (propriété, disponibilité)\n" +
            "- Impact de l'âge : seuil 70 ans pour AV (990I vs 757B), réduction 50% si < 70 ans pour donation PP (art. 790 CGI)\n" +
            "- Si grand-parent de 85+ ans : signale l'URGENCE absolue — une seule opération possible, l'espérance de vie ne permet pas de renouvellement d'abattement\n\n" +

            "**3. DONATIONS ANTÉRIEURES et ABATTEMENTS CONSOMMÉS**\n" +
            "Si des donations ont déjà été faites, explique leur impact CONCRET : combien d'abattement reste, quand il se renouvelle (rappel 15 ans, art. 784 CGI). " +
            "Si aucune donation antérieure : souligne que TOUS les abattements sont disponibles et c'est une opportunité.\n\n" +

            "**4. ASSURANCE-VIE vs CONTRAT DE CAPITALISATION**\n" +
            "Si le patrimoine financier le permet, compare :\n" +
            "- AV 990I : abattement 152 500 € par bénéficiaire, hors succession, bénéficiaire libre\n" +
            "- Capi démembré : NP donné, antériorité fiscale conservée, quasi-usufruit possible\n" +
            "- Mentionne le rachat annuel exonéré IR (4 600 € célibataire / 9 200 € couple après 8 ans)\n" +
            "- Si montant > 152 500 € par bénéficiaire : le capi peut être plus intéressant car droits sur NP seulement\n\n" +

            "**5. IMMOBILIER : RP, LOCATIF, RÉSIDENCE SECONDAIRE**\n" +
            "Si de l'immobilier est présent, traite chaque type :\n" +
            "- RP : abattement 20% en succession sur la valeur (art. 764 bis CGI si conjoint ou enfant y habite). Pas de PV à la vente.\n" +
            "- Locatif : SCI possible (décote 15% + NP), calcul PV si vente. Comparer vente avant/après donation (purge PV).\n" +
            "- Résidence secondaire : PV imposable (IR 19% + PS 17,2%), abattements durée détention. Donation avant vente = purge PV.\n\n" +

            "**6. STRATÉGIE COMBINÉE RECOMMANDÉE**\n" +
            "Propose LE plan d'action optimal qui COMBINE les meilleurs canaux. " +
            "Exemple concret : 'Le père fait une donation NP de l'appartement + la mère ouvre une AV 990I de 150 000 € + le GP fait un don manuel de 31 865 € au petit-enfant'. " +
            "Chiffre l'économie TOTALE par rapport au statu quo.\n\n" +

            "**7. POINTS DE VIGILANCE**\n" +
            "- Rappel fiscal 15 ans (art. 784 CGI) — si donation maintenant, prochaine tranche dans 15 ans\n" +
            "- Risque de requalification / abus de droit (si donation puis vente < 2 ans)\n" +
            "- Primes manifestement exagérées sur AV (art. L132-13 Code des assurances) si > 35% du patrimoine\n" +
            "- SCI + meublé = risque requalification IS si revenus meublés > 10%\n" +
            "- Exonération 790 A bis TEMPORAIRE (expire 31/12/2026) — signaler si applicable\n" +
            "- Le régime matrimonial peut impacter la liquidation successorale\n\n" +

            "**8. CHEMINS INDIRECTS (GP → Parent → Enfant)**\n" +
            "Si des chemins indirects sont détectés, explique POURQUOI ils sont souvent meilleurs : GP→Parent consomme un abattement enfant (100k) puis Parent→Enfant consomme un autre abattement enfant (100k) = 200k d'abattements cumulés, contre seulement 31 865 € pour un don direct GP→petit-enfant. Chiffre l'économie. C'est souvent le conseil le plus impactant.\n\n" +

            "**9. PROCHAINES ÉTAPES**\n" +
            "Liste ordonnée d'actions concrètes avec timing.\n\n" +

            "RÈGLES D'ÉCRITURE :\n" +
            "- CRITIQUE : Chaque donateur ne transmet QUE son propre patrimoine. Si la GM possède 400k et le père 200k, ne confonds PAS leurs patrimoines. Mentionne explicitement 'le patrimoine de [Nom] s'élève à X €'.\n" +
            "- Français courant, termes techniques AVEC explication entre parenthèses\n" +
            "- Articles CGI : art. 669, 757 B, 764 bis, 779 I, 784, 790, 790 A bis, 790 B, 990 I\n" +
            "- Montants EXACTS tirés des données, pas d'arrondis\n" +
            "- DIRECT : 'Faites ceci' pas 'Il conviendrait d'envisager'\n" +
            "- Compare TOUJOURS à la succession (statu quo)\n" +
            "- Prose fluide en paragraphes. Bullet points uniquement pour les étapes finales.\n" +
            "- 800-1200 mots.\n" +
            "- Termine TOUJOURS par : 'Avertissement : cette analyse est indicative et basée sur la fiscalité en vigueur en 2025-2026. Les montants sont des estimations. Consultez un notaire ou conseiller en gestion de patrimoine pour valider et mettre en œuvre cette stratégie.'";
    }

    function buildFullContext(txMap, pat, st) {
        var lines = [];
        var PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;

        // ═══ 1. ARBRE FAMILIAL ═══
        lines.push('═══════════════════════════════════════');
        lines.push('1. ARBRE FAMILIAL & SITUATION CIVILE');
        lines.push('═══════════════════════════════════════');
        lines.push('Mode : ' + (st.mode === 'couple' ? 'Couple (2 donateurs)' : 'Individuel'));
        if (st.donor1 && st.donor1.age) {
            var statusMap = { celibataire: 'Célibataire', marie: 'Marié(e)', pacse: 'Pacsé(e)', divorce: 'Divorcé(e)', veuf: 'Veuf/ve' };
            lines.push('Donateur principal : ' + (st.donor1.age || '?') + ' ans, ' + (statusMap[st.donor1.status] || st.donor1.status || '?'));
        }
        if (st.mode === 'couple' && st.donor2 && st.donor2.age) {
            lines.push('Donateur 2 : ' + (st.donor2.age || '?') + ' ans');
        }
        var regimeMap = { communaute_acquets: 'Communauté réduite aux acquêts', separation: 'Séparation de biens', communaute_universelle: 'Communauté universelle', participation_acquets: 'Participation aux acquêts' };
        lines.push('Régime matrimonial : ' + (regimeMap[st.regime] || st.regime || 'Non précisé'));

        if (PO) {
            var donors = PO.getDonors();
            donors.forEach(function(d) {
                lines.push('DONATEUR : ' + (d.nom || '?') + ', ' + (d.age || '?') + ' ans, rôle: ' + (d.role || '?'));
                if (d.conjointAge) lines.push('  Conjoint : ' + (d.conjointNom || '?') + ', ' + d.conjointAge + ' ans');
            });

            var bens = PO.getBeneficiaries();
            bens.forEach(function(b) {
                var lien = b.lien || b.lienFiscalDonateur || '?';
                var donAnt = PO.getTotalDonationsForBen ? PO.getTotalDonationsForBen(b.id) : 0;
                lines.push('BÉNÉFICIAIRE : ' + (b.prenom || b.nom || '?') + ', lien fiscal: ' + lien +
                    (donAnt > 0 ? ', donations antérieures reçues: ' + fmt(donAnt) : ', aucune donation antérieure'));
            });
        } else {
            // Fallback
            lines.push('Mode: ' + (st.mode || 'individuel'));
            if (st.donor1) lines.push('DONATEUR principal : âge ' + (st.donor1.age || '?') + ' ans');
            (st.beneficiaries || []).forEach(function(b) {
                lines.push('BÉNÉFICIAIRE : ' + (b.prenom || b.nom || '?') + ', lien: ' + (b.lien || '?'));
            });
        }

        // ═══ 2. DONATIONS DÉJÀ FAITES ═══
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('2. DONATIONS ANTÉRIEURES (rappel fiscal 15 ans)');
        lines.push('═══════════════════════════════════════');

        var hasDonations = false;
        if (PO) {
            var donors2 = PO.getDonors();
            donors2.forEach(function(d) {
                var bens2 = PO.getBeneficiaries();
                bens2.forEach(function(b) {
                    if (PO.getDonorDonationForBenRaw) {
                        var raw = PO.getDonorDonationForBenRaw(d.id, b.id);
                        if (raw && raw.montant > 0) {
                            hasDonations = true;
                            var dateStr = raw.date ? ' le ' + raw.date : '';
                            var typeStr = raw.type ? ' (' + raw.type + ')' : '';
                            lines.push(d.nom + ' → ' + (b.prenom || b.nom) + ' : ' + fmt(raw.montant) + dateStr + typeStr);

                            // Abattement consommé
                            var lien = b.lienFiscalDonateur || b.lien || 'enfant';
                            var abatTotal = getAbattement(lien, false);
                            var abatRestant = Math.max(0, abatTotal - raw.montant);
                            lines.push('  → Abattement ' + formatLien(lien) + ' : ' + fmt(abatTotal) + ' total, ' + fmt(raw.montant) + ' consommé, RESTE : ' + fmt(abatRestant));
                        }
                    }
                });
            });
        }
        if (!hasDonations) {
            lines.push('Aucune donation antérieure déclarée. Tous les abattements sont disponibles à 100%.');
        }

        // ═══ 3. PATRIMOINE DÉTAILLÉ ═══
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('3. PATRIMOINE DÉTAILLÉ');
        lines.push('═══════════════════════════════════════');
        lines.push('Actif net transmissible : ' + fmt(pat.actifNet));
        if (pat.immo > 0) lines.push('Immobilier total : ' + fmt(pat.immo));
        if (pat.financier > 0) lines.push('Financier total : ' + fmt(pat.financier));
        if (pat.pro > 0) lines.push('Professionnel : ' + fmt(pat.pro));
        if (pat.passif > 0) lines.push('Passif (dettes) : ' + fmt(pat.passif));

        // Détail immobilier
        (st.immo || []).forEach(function(im) {
            var typeLabel = im.type === 'rp' ? 'Résidence principale' : im.type === 'locatif' ? 'Locatif' : im.type === 'secondaire' ? 'Résidence secondaire' : im.type || 'Non précisé';
            lines.push('  🏠 ' + (im.titre || 'Bien immo') + ' : ' + fmt(im.valeur || 0) + ' (' + typeLabel + ')');
            if (im.type === 'rp') {
                lines.push('     → RP : abattement 20% en succession (art. 764 bis CGI) si conjoint/enfant y habite. Exonération PV à la vente.');
            } else if (im.type === 'locatif') {
                lines.push('     → Locatif : SCI possible (décote 15% + NP). PV imposable si vente. Comparer donation avant vente (purge PV).');
            } else if (im.type === 'secondaire') {
                lines.push('     → Résidence secondaire : PV imposable (IR 19% + PS 17,2%). Donation avant vente = purge PV possible.');
            }
            if (im.owners && im.owners.length > 0) {
                im.owners.forEach(function(o) {
                    lines.push('     Détenu par : ' + (o.nom || '?') + ' à ' + (o.pct || 100) + '% en ' + (o.regime || 'PP'));
                });
            }
        });

        // Détail financier
        (st.finance || []).forEach(function(f) {
            var typeLabel = f.type === 'assurance_vie' ? 'Assurance-vie' : f.type === 'contrat_capi' ? 'Contrat de capitalisation' : f.type === 'pea' ? 'PEA' : f.type === 'compte_titre' ? 'Compte-titres' : f.type || '?';
            lines.push('  💰 ' + typeLabel + ' : ' + fmt(f.valeur || 0));
            if (f.type === 'assurance_vie') {
                lines.push('     Souscripteur âge versement: ' + (f.ageVersement || '?') + ' ans → ' + (f.ageVersement && f.ageVersement < 70 ? 'art. 990 I (abat. 152 500 €/bénéf.)' : 'art. 757 B (abat. global 30 500 €)'));
                lines.push('     Rachat annuel exonéré IR après 8 ans : 4 600 € (célibataire) / 9 200 € (couple)');
                if (f.avBeneficiaires && f.avBeneficiaires.length > 0) {
                    lines.push('     Clause bénéficiaire AV : ' + f.avBeneficiaires.map(function(b) { return (b.person ? (b.person.prenom || b.person.nom) : '?') + ' ' + (b.pct || '?') + '%'; }).join(', '));
                } else {
                    lines.push('     Clause bénéficiaire AV : NON DÉFINIE — à configurer');
                }
            }
            if (f.type === 'contrat_capi') {
                lines.push('     Avantage capi vs AV : antériorité fiscale conservée (pas de purge PV au décès)');
                if (f.demembre) {
                    lines.push('     Contrat démembré : NP donée, US conservé (quasi-usufruit possible)');
                }
                if (f.npBeneficiaires && f.npBeneficiaires.length > 0) {
                    lines.push('     Bénéficiaires NP capi : ' + f.npBeneficiaires.map(function(b) { return (b.person ? (b.person.prenom || b.person.nom) : '?') + ' ' + (b.pct || '?') + '%'; }).join(', '));
                }
                lines.push('     Note : si montant AV dépasse 152 500 €/bénéficiaire, comparer avec un contrat capi (droits sur NP seulement)');
            }
        });

        // Professionnel
        (st.pro || []).forEach(function(p) {
            lines.push('  🏢 ' + (p.nom || 'Actif pro') + ' : ' + fmt(p.valeur || 0) + ' (' + (p.type || '?') + ')');
        });

        // Dettes
        (st.debts || []).forEach(function(d) {
            lines.push('  📉 Dette : ' + (d.description || '?') + ' = ' + fmt(d.montant || 0));
        });

        // ═══ 4. OBJECTIFS ═══
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('4. OBJECTIFS DU CLIENT');
        lines.push('═══════════════════════════════════════');
        var objLabels = {
            minimiser: 'Minimiser les droits de donation/succession',
            revenus: 'Conserver les revenus et l\'usage des biens',
            controle: 'Maintenir le contrôle sur le patrimoine',
            conjoint: 'Protéger le conjoint survivant',
            egalite: 'Assurer l\'égalité entre les enfants',
            generation: 'Transmettre à la génération suivante (petits-enfants)',
            vendre: 'Vendre un ou plusieurs biens'
        };
        var activeCount = 0;
        Object.keys(st.obj || {}).forEach(function(k) {
            if (st.obj[k]) { lines.push('✅ ' + (objLabels[k] || k)); activeCount++; }
            else lines.push('❌ ' + (objLabels[k] || k));
        });

        // Démembrement activé ?
        if (st.demembrement) {
            lines.push('');
            lines.push('Démembrement activé : type usufruit = ' + (st.usufruit || 'viager'));
        }

        // DDV / préciput
        if (st.ddv) lines.push('Donation au dernier vivant (DDV) : activée');
        if (st.preciput) lines.push('Clause de préciput : activée');

        // Type de donation
        var donTypeMap = { donation_partage: 'Donation-partage', donation_simple: 'Donation simple', don_manuel: 'Don manuel' };
        lines.push('Type de donation envisagé : ' + (donTypeMap[st.donationType] || st.donationType || '?'));

        // Exonération 790 A bis (logement neuf)
        if (st.exoLogement && st.exoLogement.active) {
            var exoObjMap = { acquisition_neuf: 'Acquisition neuf', construction: 'Construction', travaux_energetiques: 'Travaux énergétiques' };
            lines.push('');
            lines.push('EXONÉRATION 790 A bis ACTIVÉE :');
            lines.push('  Objet : ' + (exoObjMap[st.exoLogement.objet] || st.exoLogement.objet));
            lines.push('  Montant : ' + fmt(st.exoLogement.montant || 0));
            lines.push('  Plafond : 100 000 € par donateur, 300 000 € par donataire');
            lines.push('  Expire le 31/12/2026 — TEMPORAIRE');
        }

        // ═══ 5. PATRIMOINE PAR DONATEUR (propriété réelle) ═══
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('5. PATRIMOINE PAR DONATEUR (basé sur la propriété réelle des actifs)');
        lines.push('═══════════════════════════════════════');
        lines.push('⚠️ IMPORTANT : Chaque donateur ne transmet QUE ce qu\'il possède. Les calculs ci-dessous sont basés sur la propriété réelle déclarée sur chaque actif (titulaire financier, propriétaire immobilier).');

        if (txMap.donorPatrimoines) {
            Object.keys(txMap.donorPatrimoines).forEach(function(donorId) {
                var dp = txMap.donorPatrimoines[donorId];
                var PO2 = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
                var donors2 = PO2 ? PO2.getDonors() : [];
                var donorInfo = donors2.find(function(d) { return String(d.id) === String(donorId); });
                var donorLabel = donorInfo ? donorInfo.nom + ' (' + donorInfo.role + ', ' + (donorInfo.age || '?') + ' ans)' : 'Donateur #' + donorId;

                lines.push('');
                lines.push('  ' + donorLabel + ' :');
                lines.push('    Actif net transmissible : ' + fmt(dp.actifNet));
                if (dp.immo > 0) lines.push('    Immobilier détenu : ' + fmt(dp.immo));
                if (dp.financier > 0) lines.push('    Financier détenu : ' + fmt(dp.financier));
                if (dp.pro > 0) lines.push('    Professionnel : ' + fmt(dp.pro));
                if (dp.passif > 0) lines.push('    Passif : ' + fmt(dp.passif));
                if (dp.fallback) lines.push('    ⚠️ Propriété non ventilée par actif — patrimoine global déclaré');

                // Detail each asset
                if (dp.details && dp.details.length > 0) {
                    dp.details.forEach(function(d) {
                        if (d.type === 'immo') {
                            lines.push('    📌 ' + d.label + ' : ' + fmt(d.valeur) + ' (' + d.sousType + ', ' + (d.quote || 100) + '% en ' + (d.role || 'PP') + ')');
                        } else if (d.type === 'finance') {
                            lines.push('    📌 ' + d.label + ' : ' + fmt(d.valeur) + (d.isAV ? ' [Assurance-vie]' : '') + (d.isCapi ? ' [Contrat capi]' : ''));
                        }
                    });
                }
            });
        }

        // ═══ 6. RÉSULTATS CHIFFRÉS PAR CHEMIN ═══
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('6. RÉSULTATS CHIFFRÉS PAR CHEMIN');
        lines.push('═══════════════════════════════════════');

        var totalStatQuoDroits = 0;
        var totalBestDroits = 0;

        txMap.pairs.forEach(function(pair) {
            lines.push('');
            lines.push('──── ' + (pair.donor.nom || 'Donateur') + ' (' + (pair.donor.age || '?') + ' ans, ' + (pair.donor.role || '?') + ') → ' + (pair.ben.prenom || pair.ben.nom || 'Bénéficiaire') + ' (lien fiscal: ' + pair.lien + ') ────');

            // Show THIS DONOR's patrimoine for this pair
            if (pair.donorPat) {
                lines.push('Patrimoine de CE donateur : ' + fmt(pair.donorPat.actifNet) + ' (immo ' + fmt(pair.donorPat.immo) + ', fin. ' + fmt(pair.donorPat.financier) + ')');
            }
            if (pair.benPat) {
                lines.push('Part transmise à ce bénéficiaire : ' + fmt(pair.benPat.actifNet));
            }

            var abatDisp = getAbattement(pair.lien, false);
            lines.push('Abattement total en donation : ' + fmt(abatDisp));
            lines.push('Abattement total en succession : ' + fmt(getAbattement(pair.lien, true)));

            // Check for prior donations eating into abattement
            var PO3 = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
            if (PO3 && PO3.getDonorDonationForBenRaw && pair.donor.id >= 0) {
                var rawDon = PO3.getDonorDonationForBenRaw(pair.donor.id, pair.ben.id);
                if (rawDon && rawDon.montant > 0) {
                    lines.push('⚠️ Donations antérieures de ce donateur vers ce bénéficiaire : ' + fmt(rawDon.montant));
                    lines.push('   → Abattement restant : ' + fmt(Math.max(0, abatDisp - rawDon.montant)));
                }
            }

            pair.channels.forEach(function(ch, i) {
                var marker = i === 0 ? '🏆 MEILLEUR' : (ch.id === 'succession' ? '📋 STATU QUO' : '  ');
                lines.push(marker + ' | ' + ch.name);
                lines.push('  Assiette: ' + fmt(ch.assiette) + ' | Abat: ' + fmt(ch.abattement) + ' | Base taxable: ' + fmt(ch.base_taxable));
                lines.push('  Droits: ' + fmt(ch.droits) + ' | Frais: ' + fmt(ch.frais) + ' | NET TRANSMIS: ' + fmt(ch.net) + ' | Taux effectif: ' + ch.taux_effectif + '%');
                if (ch.fraisAn > 0) lines.push('  Frais annuels récurrents: ' + fmt(ch.fraisAn));
                if (ch.advantages && ch.advantages.length > 0) {
                    lines.push('  Avantages: ' + ch.advantages.join(' | '));
                }
                if (ch.risks && ch.risks.length > 0) {
                    lines.push('  Risques: ' + ch.risks.join(' | '));
                }
            });

            if (pair.statu_quo) totalStatQuoDroits += pair.statu_quo.droits;
            if (pair.best) totalBestDroits += pair.best.droits;
        });

        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('7. TOTAUX & COMPARAISON SUCCESSION vs DONATION');
        lines.push('═══════════════════════════════════════');
        lines.push('DROITS DE SUCCESSION si rien n\'est fait : ' + fmt(totalStatQuoDroits));
        lines.push('DROITS avec stratégie optimale : ' + fmt(totalBestDroits));
        lines.push('ÉCONOMIE TOTALE : ' + fmt(totalStatQuoDroits - totalBestDroits));
        lines.push('NET TRANSMIS optimal : ' + fmt(txMap.totalBest));
        lines.push('NET TRANSMIS statu quo : ' + fmt(txMap.totalStatuQuo));

        // Explicit per-pair comparison
        lines.push('');
        lines.push('RÉSUMÉ PAR PAIRE (succession vs meilleur canal) :');
        txMap.pairs.forEach(function(pair) {
            var sq = pair.statu_quo;
            var best = pair.best;
            if (sq && best && best.id !== 'succession') {
                lines.push('  ' + (pair.donor.nom || 'Donateur') + ' → ' + (pair.ben.prenom || pair.ben.nom) + ' :');
                lines.push('    SUCCESSION : droits ' + fmt(sq.droits) + ', net ' + fmt(sq.net));
                lines.push('    MEILLEUR (' + best.name + ') : droits ' + fmt(best.droits) + ', net ' + fmt(best.net));
                lines.push('    → ÉCONOMIE : ' + fmt(best.net - sq.net) + ' (' + (sq.droits > 0 ? Math.round((1 - best.droits / sq.droits) * 100) : 0) + '% de droits en moins)');
            }
        });

        // ═══ 8. CHEMINS INDIRECTS (GP → Parent → Enfant) ═══
        if (txMap.indirectPaths && txMap.indirectPaths.length > 0) {
            lines.push('');
            lines.push('═══════════════════════════════════════');
            lines.push('8. CHEMINS INDIRECTS DÉTECTÉS (transmission en cascade)');
            lines.push('═══════════════════════════════════════');
            lines.push('⚠️ IMPORTANT : Ces chemins sont souvent PLUS efficaces qu\'une donation directe GP→petit-enfant car ils cumulent les abattements en ligne directe.');

            txMap.indirectPaths.forEach(function(ip) {
                lines.push('');
                lines.push('CHEMIN : ' + ip.gp.nom + ' → ' + ip.parent.nom + ' → ' + (ip.child.prenom || ip.child.nom));
                lines.push('  Direct (' + ip.lienDirect + ') : abat. ' + fmt(ip.abatDirect) + ', droits ' + fmt(ip.droitsDirect));
                lines.push('  Indirect (via parent) : abat. cumulés ' + fmt(ip.abatIndirect) + ', droits ' + fmt(ip.droitsIndirect));
                lines.push('  ÉCONOMIE CHEMIN INDIRECT : ' + fmt(ip.economie));
                lines.push('  → RECOMMANDATION : Faire 2 donations successives (GP→Parent puis Parent→Enfant) plutôt qu\'une donation directe GP→petit-enfant');
                lines.push('  → ATTENTION : Le parent reçoit et RE-donne. Il consomme son propre abattement enfant. Vérifier qu\'il n\'a pas déjà donné à cet enfant.');
            });
        }

        // Vente context
        if (st.obj && st.obj.vendre && st.vente && st.vente.prixVente > 0) {
            lines.push('');
            lines.push('═══════════════════════════════════════');
            lines.push('9. PROJET DE VENTE');
            lines.push('═══════════════════════════════════════');
            lines.push('Prix de vente visé : ' + fmt(st.vente.prixVente));
            lines.push('Prix d\'acquisition : ' + fmt(st.vente.prixAcquisition));
            lines.push('Date acquisition : ' + (st.vente.dateAcquisition || '?'));
            lines.push('Type de bien : ' + st.vente.typeBien);
            lines.push('Horizon de vente : ' + st.vente.horizon + ' ans');
        }

        return lines.join('\n');
    }

    function renderDetailedSummary(container, text, txMap, pat) {
        // Convert markdown to styled HTML
        var html = text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/##\s*(.+)/g, '<div style="font-size:.88rem;font-weight:700;color:var(--primary-color);margin:16px 0 6px;border-bottom:1px solid rgba(198,134,66,.12);padding-bottom:4px;">$1</div>')
            .replace(/\n{2,}/g, '</p><p style="margin-bottom:10px;">')
            .replace(/\n- /g, '<br>→ ')
            .replace(/\n(\d+)\.\s/g, '<br><strong>$1.</strong> ')
            .replace(/\n/g, '<br>');

        // Droits headline
        var statQuoDroits = pat.actifNet - txMap.totalStatuQuo;
        var eco = txMap.totalBest - txMap.totalStatuQuo;

        var header = '';
        header += '<div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap;">';

        // Droits estimés box
        header += '<div style="flex:1;min-width:160px;padding:14px 18px;border-radius:12px;background:rgba(255,107,107,.06);border:1px solid rgba(255,107,107,.15);text-align:center;">';
        header += '<div style="font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px;">Droits si rien n\'est fait</div>';
        header += '<div style="font-size:1.4rem;font-weight:800;color:var(--accent-coral);">' + fmt(statQuoDroits > 0 ? statQuoDroits : 0) + '</div>';
        header += '</div>';

        // Net optimal box
        header += '<div style="flex:1;min-width:160px;padding:14px 18px;border-radius:12px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);text-align:center;">';
        header += '<div style="font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px;">Net transmis optimal</div>';
        header += '<div style="font-size:1.4rem;font-weight:800;color:var(--accent-green);">' + fmt(txMap.totalBest) + '</div>';
        header += '</div>';

        // Économie box
        if (eco > 0) {
            header += '<div style="flex:1;min-width:160px;padding:14px 18px;border-radius:12px;background:rgba(198,134,66,.06);border:1px solid rgba(198,134,66,.15);text-align:center;">';
            header += '<div style="font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px;">Économie potentielle</div>';
            header += '<div style="font-size:1.4rem;font-weight:800;color:var(--primary-color);">' + fmt(eco) + '</div>';
            header += '</div>';
        }
        header += '</div>';

        container.innerHTML = '<div style="padding:24px;border-radius:16px;background:linear-gradient(135deg,rgba(198,134,66,.04),rgba(59,130,246,.02));border:1px solid rgba(198,134,66,.1);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--primary-color),#d4a574);display:flex;align-items:center;justify-content:center;"><i class="fas fa-brain" style="color:#1a1a2e;font-size:.9rem;"></i></div>' +
            '<div><div style="font-size:.9rem;font-weight:700;color:var(--primary-color);">Analyse patrimoniale</div>' +
            '<div style="font-size:.62rem;color:var(--text-muted);">Personnalisée en fonction de votre situation</div></div></div>' +
            '<span style="font-size:.55rem;padding:3px 8px;border-radius:4px;background:rgba(59,130,246,.08);color:#3b82f6;">Claude Opus</span>' +
            '</div>' +
            header +
            '<div style="font-size:.8rem;color:var(--text-secondary);line-height:1.85;"><p style="margin-bottom:10px;">' + html + '</p></div>' +
            '</div>';
    }

    /**
     * renderFallbackSummary — Résumé statique si l'API est indisponible
     */
    function renderFallbackSummary(container, txMap, pat) {
        var eco = txMap.totalBest - txMap.totalStatuQuo;
        var statQuoDroits = pat.actifNet - txMap.totalStatuQuo;
        var st = state();

        var lines = [];

        // Droits en gras
        if (statQuoDroits > 0) {
            lines.push('<div style="padding:14px 18px;border-radius:12px;background:rgba(255,107,107,.06);border:1px solid rgba(255,107,107,.15);margin-bottom:14px;text-align:center;">');
            lines.push('<div style="font-size:.62rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px;">Droits de succession estimés (si rien n\'est fait)</div>');
            lines.push('<div style="font-size:1.4rem;font-weight:800;color:var(--accent-coral);">' + fmt(statQuoDroits) + '</div>');
            lines.push('</div>');
        }

        lines.push('<strong>Patrimoine net :</strong> ' + fmt(pat.actifNet) + ' à transmettre.');
        lines.push('');

        // Par chemin
        txMap.pairs.forEach(function(pair) {
            var donorLabel = pair.donor.nom || 'Donateur';
            var benLabel = pair.ben.prenom || pair.ben.nom || 'Bénéficiaire';
            var lienLabel = formatLien(pair.lien);

            lines.push('');
            lines.push('<strong>' + esc(donorLabel) + ' → ' + esc(benLabel) + '</strong> (' + lienLabel + ', donateur ' + (pair.donor.age || '?') + ' ans) :');

            if (pair.statu_quo) {
                lines.push('Sans rien faire : <span style="color:var(--accent-coral);">' + fmt(pair.statu_quo.droits) + ' de droits</span>, net transmis ' + fmt(pair.statu_quo.net));
            }
            if (pair.best && pair.best.id !== 'succession') {
                var diff = pair.best.net - (pair.statu_quo ? pair.statu_quo.net : 0);
                lines.push('Meilleur canal : ' + pair.best.icon + ' <strong>' + esc(pair.best.name) + '</strong> → <span style="color:var(--accent-green);">' + fmt(pair.best.net) + ' net</span>, droits ' + fmt(pair.best.droits) + ' (taux effectif ' + pair.best.taux_effectif + '%)');
                if (diff > 0) lines.push('<span style="color:var(--accent-green);font-weight:600;">Économie : +' + fmt(diff) + ' vs statu quo</span>');
            }
        });

        if (eco > 0) {
            lines.push('');
            lines.push('<div style="padding:12px 16px;border-radius:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);text-align:center;margin-top:10px;"><strong style="color:var(--accent-green);">Économie totale potentielle : ' + fmt(eco) + '</strong></div>');
        }

        lines.push('');
        lines.push('<em style="font-size:.68rem;color:var(--text-muted);">Analyse indicative. Consultez un notaire ou CGP pour valider la stratégie.</em>');

        container.innerHTML = '<div style="padding:24px;border-radius:16px;background:linear-gradient(135deg,rgba(198,134,66,.04),rgba(59,130,246,.02));border:1px solid rgba(198,134,66,.1);">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--primary-color),#d4a574);display:flex;align-items:center;justify-content:center;"><i class="fas fa-file-alt" style="color:#1a1a2e;font-size:.9rem;"></i></div>' +
            '<div style="font-size:.9rem;font-weight:700;color:var(--primary-color);">Synthèse des résultats</div></div>' +
            '<div style="font-size:.8rem;color:var(--text-secondary);line-height:1.85;">' + lines.join('<br>') + '</div>' +
            '</div>';
    }


    // ================================================================
    // PUBLIC API
    // ================================================================
    return {
        compute: computeTransmissionMap,
        render: renderTransmissionMap,
        computeChannelsForPair: computeChannelsForPair,
        generateSummary: generateNarrativeSummary
    };

})();
