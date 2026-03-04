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
     * @param {Object} pat - patrimoine (from computePatrimoine)
     * @param {number} fallbackAge - âge donateur par défaut
     * @param {number} nbDonors - nombre de donateurs
     * @returns {{ pairs: Array, totalBest: number, totalStatuQuo: number, pat: Object }}
     */
    function computeTransmissionMap(pat, fallbackAge, nbDonors) {
        var FISC = F();
        var PO = typeof PathOptimizer !== 'undefined' ? PathOptimizer : null;
        var donors = PO ? PO.getDonors() : [];
        var st = state();
        var allBens = st.beneficiaries.filter(function(b) { return b.lien !== 'conjoint_pacs'; });
        var obj = st.obj || {};

        // Build donor↔beneficiary pairs
        var pairs = [];

        if (donors.length > 0 && allBens.length > 0) {
            donors.forEach(function(donor) {
                allBens.forEach(function(ben) {
                    var lien = ben.lienFiscalDonateur || ben.lien || 'tiers';
                    if (PO && PO.detectLien) {
                        var detected = PO.detectLien(donor.id, ben.id || ben.prenom);
                        if (detected) lien = detected;
                    }
                    pairs.push({ donor: donor, ben: ben, lien: lien });
                });
            });
        } else {
            // Fallback: single donor
            allBens.forEach(function(ben) {
                pairs.push({
                    donor: { nom: 'Donateur', age: fallbackAge, role: 'parent' },
                    ben: ben,
                    lien: ben.lien || 'enfant'
                });
            });
        }

        // Compute channels for each pair
        var results = [];
        pairs.forEach(function(pair) {
            var channels = computeChannelsForPair(pair, pat, FISC, obj);
            channels.sort(function(a, b) { return b.net - a.net; });
            results.push({
                donor: pair.donor,
                ben: pair.ben,
                lien: pair.lien,
                channels: channels,
                best: channels[0] || null,
                statu_quo: channels.find(function(c) { return c.id === 'succession'; }) || null
            });
        });

        var totalBest = results.reduce(function(s, r) { return s + (r.best ? r.best.net : 0); }, 0);
        var totalStatuQuo = results.reduce(function(s, r) { return s + (r.statu_quo ? r.statu_quo.net : 0); }, 0);

        return { pairs: results, totalBest: totalBest, totalStatuQuo: totalStatuQuo, pat: pat };
    }


    // ================================================================
    // 2. CHANNELS — Calcul de chaque canal fiscal pour une paire
    // ================================================================

    function computeChannelsForPair(pair, pat, FISC, obj) {
        var donor = pair.donor;
        var lien = pair.lien;
        var donorAge = donor.age || 60;
        var npRatio = getNPRatio(donorAge);
        var abat = getAbattement(lien, false);
        var abatSucc = getAbattement(lien, true);
        var bareme = getBareme(lien);
        var st = state();
        var nbBens = Math.max(1, st.beneficiaries.filter(function(b) { return b.lien !== 'conjoint_pacs'; }).length);

        // Part du patrimoine pour ce bénéficiaire (répartition égale)
        var partImmo = Math.round(pat.immo / nbBens);
        var partFin = Math.round(pat.financier / nbBens);
        var partTotal = Math.round(pat.actifNet / nbBens);

        var channels = [];

        // ─── 1. SUCCESSION (statu quo) ──────────────────────────
        var baseSucc = Math.max(0, partTotal - abatSucc);
        var droitsSucc = calcDroits(baseSucc, bareme);
        var fraisSucc = Math.round(partTotal * FISC.fraisNotaireSuccPct);
        channels.push({
            id: 'succession', name: 'Succession (statu quo)',
            icon: '📋', timing: 'Au décès', color: '#ff6b6b',
            assiette: partTotal, abattement: abatSucc,
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
                'Pas de choix du moment'
            ],
            objectives: [],
            details: 'Si rien n\'est fait → droits au décès. Abattement ' + formatLien(lien) + ' : ' + fmt(abatSucc) + '.'
        });

        // ─── 2. DONATION DIRECTE PP ─────────────────────────────
        var baseDonPP = Math.max(0, partTotal - abat);
        var droitsDonPP = calcDroits(baseDonPP, bareme);
        var reduction = donorAge < 70 ? 0.50 : 0;
        var droitsDonPPRed = Math.round(droitsDonPP * (1 - reduction));
        var fraisDonPP = Math.round(partTotal * FISC.fraisNotairePct);
        channels.push({
            id: 'donation_pp', name: 'Donation directe (PP)',
            icon: '🎁', timing: 'Maintenant', color: '#c68642',
            assiette: partTotal, abattement: abat,
            base_taxable: baseDonPP, droits: droitsDonPPRed, frais: fraisDonPP,
            net: partTotal - droitsDonPPRed - fraisDonPP,
            taux_effectif: partTotal > 0 ? Math.round(droitsDonPPRed / partTotal * 100) : 0,
            fraisAn: 0,
            advantages: [
                'Abattement ' + fmt(abat) + ' renouvelable tous les 15 ans',
                donorAge < 70 ? 'Réduction 50% (donateur < 70 ans, art. 790 CGI)' : null,
                'Transmission immédiate, purge la plus-value'
            ].filter(Boolean),
            risks: [
                'Dessaisissement immédiat et irrévocable',
                'Le donateur perd l\'usage du bien'
            ],
            objectives: ['minimiser', 'egalite'],
            details: 'Abattement ' + fmt(abat) + ' (' + formatLien(lien) + ') · Base taxable : ' + fmt(baseDonPP) + (reduction > 0 ? ' · Réduction 50% → droits : ' + fmt(droitsDonPPRed) : '')
        });

        // ─── 3. DONATION NP (démembrement) ──────────────────────
        var valeurNP = Math.round(partTotal * npRatio);
        var baseNP = Math.max(0, valeurNP - abat);
        var droitsNP = calcDroits(baseNP, bareme);
        var fraisNP = Math.round(valeurNP * FISC.fraisNotairePct);
        channels.push({
            id: 'donation_np', name: 'Donation NP (' + Math.round(npRatio * 100) + '%)',
            icon: '🔑', timing: 'Maintenant', color: '#10b981',
            assiette: valeurNP, abattement: abat,
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
        if (partFin > 0 || pat.financier > 50000) {
            var avCap = partFin > 0 ? partFin : Math.round(pat.financier / nbBens);
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
                    pat.actifBrut > 0 && avCap / pat.actifBrut > FISC.primesExagSeuil ? 'Risque primes manifestement exagérées (' + Math.round(avCap / pat.actifBrut * 100) + '% du patrimoine)' : null
                ].filter(Boolean),
                objectives: ['minimiser', 'generation'],
                details: 'Capital AV : ' + fmt(avCap) + ' · Abat. 990 I : ' + fmt(avAbat) + ' · 20% jusqu\'à ' + fmt(FISC.av990I.seuil2) + ', 31,25% au-delà'
            });
        }

        // ─── 5. AV 757 B (primes après 70 ans) ─────────────────
        if (donorAge >= 70 && (partFin > 0 || pat.financier > 30000)) {
            var av757Cap = partFin > 0 ? partFin : Math.round(pat.financier / nbBens);
            var av757AbatGlobal = FISC.av757B.abattementGlobal;
            var av757Abat = Math.round(av757AbatGlobal / nbBens);
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
        if (partFin > 50000 || pat.financier > 100000) {
            var capiCap = partFin > 0 ? partFin : Math.round(pat.financier / nbBens);
            var capiNP = Math.round(capiCap * npRatio);
            var capiBase = Math.max(0, capiNP - abat);
            var capiDroits = calcDroits(capiBase, bareme);
            var capiFrais = Math.round(capiNP * FISC.fraisNotairePct);
            channels.push({
                id: 'capi_demembre', name: 'Capi. démembré (NP)',
                icon: '📊', timing: 'Maintenant', color: '#8b5cf6',
                assiette: capiNP, abattement: abat,
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
                details: 'NP ' + Math.round(npRatio * 100) + '% = ' + fmt(capiNP) + ' · Abat. ' + fmt(abat) + ' · Avantage vs AV si montants > ' + fmt(FISC.av990I.abattement)
            });
        }

        // ─── 7. SCI IR + DONATION NP PARTS ──────────────────────
        if (partImmo > 50000 || pat.immo > 100000) {
            var sciImmo = partImmo > 0 ? partImmo : Math.round(pat.immo / nbBens);
            var decote = 0.15;
            var sciValParts = Math.round(sciImmo * (1 - decote));
            var sciNP = Math.round(sciValParts * npRatio);
            var sciBase = Math.max(0, sciNP - abat);
            var sciDroits = calcDroits(sciBase, bareme);
            var sciFrais = Math.round(sciNP * FISC.fraisNotairePct) + Math.round(FISC.fraisStructure.creation / nbBens);
            channels.push({
                id: 'sci_np', name: 'SCI + donation NP parts',
                icon: '🏢', timing: 'Maintenant', color: '#06b6d4',
                assiette: sciNP, abattement: abat,
                base_taxable: sciBase, droits: sciDroits, frais: sciFrais,
                net: sciImmo - sciDroits - sciFrais,
                taux_effectif: sciImmo > 0 ? Math.round(sciDroits / sciImmo * 100) : 0,
                fraisAn: Math.round(FISC.fraisStructure.sci_ir / nbBens),
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
            var donTotal = Math.min(partFin, abat + donFamMax);
            channels.push({
                id: 'don_manuel', name: 'Don manuel + familial',
                icon: '💵', timing: 'Maintenant', color: '#22c55e',
                assiette: donTotal, abattement: abat + donFamMax,
                base_taxable: 0, droits: 0, frais: 0,
                net: donTotal,
                taux_effectif: 0,
                fraisAn: 0,
                advantages: [
                    'Cumul abattement ' + formatLien(lien) + ' (' + fmt(abat) + ') + don familial (' + fmt(donFamMax) + ')',
                    'Total exonéré : ' + fmt(abat + donFamMax) + ' par donateur',
                    '0 € de droits si montant ≤ abattement',
                    'Déclaration en ligne obligatoire (depuis 01/2026)'
                ],
                risks: [
                    'Limité aux sommes d\'argent',
                    'Don familial : donateur < 80 ans, donataire majeur',
                    'Rappel fiscal 15 ans'
                ],
                objectives: ['minimiser'],
                details: 'Max exonéré : ' + fmt(abat) + ' + ' + fmt(donFamMax) + ' = ' + fmt(abat + donFamMax) + '. Excédent taxé au barème.'
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

        // ── HERO SUMMARY ──────────────────────────────────────
        var statQuoDroits = pat.actifNet - txMap.totalStatuQuo;
        var eco = txMap.totalBest - txMap.totalStatuQuo;
        html += '<div style="padding:20px;border-radius:14px;background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(198,134,66,.06));border:1px solid rgba(16,185,129,.15);margin-bottom:20px;text-align:center;">';
        html += '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px;">Si on ne fait rien → droits estimés : <strong style="color:var(--accent-coral);">' + fmt(statQuoDroits > 0 ? statQuoDroits : 0) + '</strong></div>';
        html += '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px;">Avec optimisation → net transmis optimal :</div>';
        html += '<div style="font-size:1.8rem;font-weight:800;color:var(--accent-green);font-variant-numeric:tabular-nums;">' + fmt(txMap.totalBest) + '</div>';
        if (eco > 0) html += '<div style="font-size:.85rem;color:var(--accent-green);font-weight:600;margin-top:4px;">💰 ' + fmt(eco) + ' économisés vs statu quo</div>';
        html += '</div>';

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
    // PUBLIC API
    // ================================================================
    return {
        compute: computeTransmissionMap,
        render: renderTransmissionMap,
        computeChannelsForPair: computeChannelsForPair
    };

})();
