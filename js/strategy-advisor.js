/**
 * ================================================================
 * STRATEGY ADVISOR — Moteur de recommandation fiscaliste actif par actif
 * ================================================================
 * Fichier chargé après successions-donations.js et path-optimizer.js
 * 
 * Analyse chaque actif en contexte (propriétaire, lien fiscal,
 * donations antérieures, âge) et génère des options chiffrées
 * avec recommandation.
 * ================================================================
 */

const StrategyAdvisor = (() => {
    'use strict';

    // === Shorthand refs ===
    function F()                 { return SD._fiscal.getFISCAL(); }
    function st()                { return SD._fiscal.getState(); }
    function getAbattement(l, s) { return SD._fiscal.getAbattement(l, s); }
    function getBareme(l)        { return SD._fiscal.getBareme(l); }
    function calcDroits(b, br)   { return SD._fiscal.calcDroits(b, br); }
    function getNPRatio(a)       { return SD._fiscal.getNPRatio(a); }
    function fmt(n)              { return SD._fiscal.fmt(n); }
    function esc(s)              { return SD._fiscal.esc(s); }
    function el(id)              { return SD._fiscal.el(id); }

    var FG = function() { return typeof FamilyGraph !== 'undefined' ? FamilyGraph : null; };
    var PO = function() { return typeof PathOptimizer !== 'undefined' ? PathOptimizer : null; };

    function formatLien(lien) {
        var m = { enfant:'enfant', petit_enfant:'petit-enfant', arriere_petit_enfant:'arrière-petit-enfant',
            conjoint_pacs:'conjoint/PACS', conjoint_pacs_donation:'conjoint/PACS', frere_soeur:'frère/sœur',
            neveu_niece:'neveu/nièce', tiers:'tiers', grand_parent:'grand-parent', parent:'parent' };
        return m[lien] || lien;
    }


    // ================================================================
    // 1. CONTEXT — Collecte du contexte complet
    // ================================================================

    function buildContext() {
        var s = st();
        var fg = FG();
        var po = PO();
        var FISC = F();
        var pat = SD._fiscal.computePatrimoine();

        // Checked donors (only isDonor=true)
        var donors = [];
        if (fg && fg.getDonors) {
            var fgDonors = fg.getDonors();
            var poDonors = po ? po.getDonors() : [];
            fgDonors.forEach(function(d) {
                var pod = poDonors.find(function(pd) { return pd.nom === d.nom; });
                donors.push({
                    id: d.id, nom: d.nom, age: d.age || 60,
                    role: pod ? pod.role : (fg.inferRole ? fg.inferRole(d.id) : 'parent'),
                    _poId: pod ? pod.id : -1
                });
            });
        }

        // Beneficiaries
        var bens = s.beneficiaries.filter(function(b) { return b.lien !== 'conjoint_pacs'; });

        // For each donor ↔ beneficiary pair, compute lien + donations + abattement restant
        var pairContexts = [];
        donors.forEach(function(donor) {
            bens.forEach(function(ben) {
                var lien = ben.lien || 'enfant';
                if (fg && fg.computeFiscalLien) {
                    var cl = fg.computeFiscalLien(donor.id, ben._graphId || ben.id);
                    if (cl && cl !== 'self') lien = cl;
                }

                var donAnterieures = 0;
                var donAntDate = null;
                var donAntHorsRappel = false;
                if (po && po.getDonorDonationForBenRaw && donor._poId >= 0) {
                    var raw = po.getDonorDonationForBenRaw(donor._poId, ben.id);
                    if (raw && raw.montant > 0) {
                        donAntDate = raw.date || null;
                        // FIX 3: Check 15-year rappel fiscal
                        if (po.isDonationInRappel && donAntDate) {
                            if (po.isDonationInRappel(donAntDate)) {
                                donAnterieures = raw.montant;
                            } else {
                                donAntHorsRappel = true; // > 15 ans, abattement rechargé
                            }
                        } else {
                            donAnterieures = raw.montant; // conservative
                        }
                    }
                }
                var abatTotal = getAbattement(lien, false);
                var abatRestant = Math.max(0, abatTotal - donAnterieures);

                pairContexts.push({
                    donor: donor, ben: ben, lien: lien,
                    donAnterieures: donAnterieures, donAntDate: donAntDate, donAntHorsRappel: donAntHorsRappel,
                    abatTotal: abatTotal, abatRestant: abatRestant
                });
            });
        });

        // All PO donors (including intermediaries) for indirect paths
        var allPersons = po ? po.getDonors() : [];

        // Find possible intermediaries (parents not checked as donors)
        var intermediaires = [];
        if (fg && fg.getPersons) {
            var checkedIds = new Set(donors.map(function(d) { return d.id; }));
            var benIds = new Set(bens.map(function(b) { return b._graphId || b.id; }));
            fg.getPersons().forEach(function(p) {
                if (checkedIds.has(p.id) || benIds.has(p.id)) return;
                intermediaires.push(p);
            });
        }

        return {
            donors: donors, bens: bens, pat: pat, FISC: FISC,
            pairContexts: pairContexts, intermediaires: intermediaires,
            immo: s.immo || [], finance: s.finance || [],
            pro: s.pro || [], debts: s.debts || []
        };
    }


    // ================================================================
    // 2. ALERTS — Alertes situationnelles
    // ================================================================

    function generateAlerts(ctx) {
        var alerts = [];

        // Age urgency
        ctx.donors.forEach(function(d) {
            if (d.age >= 85) {
                alerts.push({ type: 'critical', icon: '🚨',
                    text: '<strong>' + esc(d.nom) + ' a ' + d.age + ' ans</strong> — une seule opération de donation réaliste (abattements renouvelables tous les 15 ans seulement). <strong>Urgence absolue.</strong>'
                });
            } else if (d.age >= 70) {
                alerts.push({ type: 'warning', icon: '⚠️',
                    text: '<strong>' + esc(d.nom) + ' a ' + d.age + ' ans</strong> — primes AV versées maintenant = art. 757 B (abat. global 30 500 €) au lieu de art. 990 I (152 500 €/bénéficiaire). Les intérêts acquis restent exonérés.'
                });
            }
        });

        // Indivision detected
        ctx.immo.forEach(function(im) {
            if (im.structure === 'indivision' || (im.owners && im.owners.length > 1 && im.owners.some(function(o) { return o.role === 'indiv'; }))) {
                alerts.push({ type: 'info', icon: 'ℹ️',
                    text: '<strong>' + esc(im.label || 'Bien immobilier') + '</strong> est en indivision. La donation de quote-part est possible mais la sortie d\'indivision peut être préférable pour simplifier la transmission.'
                });
            }
        });

        // Donations antérieures
        var hasDon = false;
        ctx.pairContexts.forEach(function(pc) {
            if (pc.donAnterieures > 0) {
                hasDon = true;
                var dateInfo = pc.donAntDate ? ' le ' + pc.donAntDate : '';
                alerts.push({ type: 'info', icon: '📋',
                    text: esc(pc.donor.nom) + ' a déjà donné <strong>' + fmt(pc.donAnterieures) + '</strong> à ' + esc(pc.ben.prenom || pc.ben.nom) + dateInfo + ' (dans le rappel fiscal 15 ans). Abattement ' + formatLien(pc.lien) + ' : reste <strong>' + fmt(pc.abatRestant) + '</strong> sur ' + fmt(pc.abatTotal) + ' (art. 784 CGI).'
                });
            }
            if (pc.donAntHorsRappel) {
                alerts.push({ type: 'tip', icon: '✅',
                    text: 'Bonne nouvelle : une donation antérieure de ' + esc(pc.donor.nom) + ' à ' + esc(pc.ben.prenom || pc.ben.nom) + ' est <strong>hors rappel fiscal</strong> (> 15 ans). L\'abattement ' + formatLien(pc.lien) + ' de <strong>' + fmt(pc.abatTotal) + '</strong> est entièrement rechargé.'
                });
            }
        });

        // Also check donations from intermediaries (parents not checked as donors)
        ctx.intermediaires.forEach(function(inter) {
            ctx.bens.forEach(function(ben) {
                var po2 = PO();
                if (!po2 || !po2.getDonorDonationForBenRaw) return;
                var poDonors = po2.getDonors();
                var pod = poDonors.find(function(d) { return d.nom === inter.nom; });
                if (!pod) return;
                var raw = po2.getDonorDonationForBenRaw(pod.id, ben.id);
                if (raw && raw.montant > 0) {
                    // Find lien
                    var fg2 = FG();
                    var lien = 'enfant';
                    if (fg2 && fg2.computeFiscalLien) {
                        var cl = fg2.computeFiscalLien(inter.id, ben._graphId || ben.id);
                        if (cl && cl !== 'self') lien = cl;
                    }
                    var abat = getAbattement(lien, false);
                    alerts.push({ type: 'info', icon: '📋',
                        text: esc(inter.nom) + ' (intermédiaire possible) a déjà donné <strong>' + fmt(raw.montant) + '</strong> à ' + esc(ben.prenom || ben.nom) + '. Abattement ' + formatLien(lien) + ' restant : <strong>' + fmt(Math.max(0, abat - raw.montant)) + '</strong>.'
                    });
                }
            });
        });

        // Present d'usage opportunity
        if (ctx.pat.actifNet > 500000) {
            var presentMax = Math.round(ctx.pat.actifNet * 0.025);
            alerts.push({ type: 'tip', icon: '🎁',
                text: 'Patrimoine de ' + fmt(ctx.pat.actifNet) + ' → <strong>présents d\'usage</strong> (cadeaux anniversaire, Noël) d\'environ ' + fmt(presentMax) + '/an sont non rapportables et non taxables (jurisprudence : ~2-2,5% du patrimoine).'
            });
        }

        return alerts;
    }


    // ================================================================
    // 3. DIAGNOSTICS — Prose d'expert personnalisée par actif
    // ================================================================

    // Store user decisions
    var decisions = {};

    function getDecision(assetId, questionId) {
        return decisions[assetId + ':' + questionId] || null;
    }
    function setDecision(assetId, questionId, value) {
        decisions[assetId + ':' + questionId] = value;
        // Re-render after decision
        render();
    }

    function buildImmoDiagnostic(im, ctx) {
        var prose = [];
        var questions = [];
        var label = esc(im.label || 'Ce bien');
        var val = im.valeur || 0;
        var usage = im.usageActuel || 'rp';
        var structure = im.structure || 'direct';
        var assetId = 'immo-' + im.id;

        // ── Nature du bien ──
        if (usage === 'rp') {
            prose.push('<strong>' + label + '</strong> est votre <strong>résidence principale</strong>, estimée à ' + fmt(val) + '. En tant que RP : <strong>abattement 20% en succession</strong> (art. 764 bis CGI) <em>uniquement si le conjoint/PACS ou un enfant mineur/majeur protégé y habite au moment du décès</em>. <strong>Aucune plus-value à la vente</strong>.');

            ctx.donors.forEach(function(donor) {
                var donorLabel = esc(donor.nom);
                questions.push({
                    id: 'rp-intention-' + donor.id,
                    text: donorLabel + ' souhaite-t-elle continuer à occuper ce logement ?',
                    type: 'qcm',
                    options: [
                        { value: 'rester', label: '🏠 Oui, rester dans le logement', hint: '→ Donation NP recommandée (conserve l\'usage)' },
                        { value: 'etablissement', label: '🏥 Départ en établissement envisagé', hint: '→ Vente RP (exonérée PV) + réinvestir en AV/don' },
                        { value: 'indecis', label: '🤔 Pas encore décidé', hint: '→ On compare toutes les options' }
                    ]
                });
            });

        } else if (usage === 'locatif') {
            var loyer = im.loyerMensuel || 0;
            prose.push('<strong>' + label + '</strong> est un <strong>bien locatif</strong> estimé à ' + fmt(val) + (loyer > 0 ? ', générant <strong>' + fmt(loyer) + '/mois</strong> (' + fmt(loyer * 12) + '/an)' : '') + '.');

            if (im.typeLocation && (im.typeLocation.indexOf('meuble') >= 0)) {
                prose.push('⚠️ Location meublée : en cas d\'apport en SCI IR, risque de requalification IS si revenus meublés > 10%.');
            }

            if (im.prixAcquisition > 0 && im.prixAcquisition < val) {
                prose.push('Plus-value latente estimée : <strong>' + fmt(val - im.prixAcquisition) + '</strong>. Donner avant de vendre purge cette PV.');
            }

            questions.push({
                id: 'locatif-revenus',
                text: 'Les revenus locatifs sont-ils importants pour le donateur ?',
                type: 'qcm',
                options: [
                    { value: 'essentiels', label: '💰 Oui, essentiels au train de vie', hint: '→ Démembrement NP (conserve les loyers)' },
                    { value: 'complementaires', label: '📊 Complémentaires mais pas vitaux', hint: '→ Démembrement NP ou SCI (conserve la gérance)' },
                    { value: 'non', label: '❌ Non, le donateur peut s\'en passer', hint: '→ Donation PP possible (plus simple)' }
                ]
            });

            questions.push({
                id: 'locatif-horizon',
                text: 'Quel est le projet pour ce bien ?',
                type: 'qcm',
                options: [
                    { value: 'conserver', label: '🏠 Conserver et continuer à louer', hint: '→ Donation NP ou SCI + NP' },
                    { value: 'vendre_court', label: '🏷️ Vente envisagée (< 3 ans)', hint: '→ Donner AVANT de vendre (purge PV)' },
                    { value: 'vendre_long', label: '📅 Vente possible à long terme (> 5 ans)', hint: '→ SCI (souplesse) ou conserver' },
                    { value: 'transmettre', label: '🎁 Transmettre rapidement', hint: '→ Donation PP ou NP selon contrôle souhaité' }
                ]
            });

            // FIX 4: Abus de droit — si vente envisagée, demander si déjà décidée
            var locHorizonDecision = getDecision('immo-' + im.id, 'locatif-horizon');
            if (locHorizonDecision === 'vendre_court') {
                questions.push({
                    id: 'vente-prearrangee',
                    text: '⚠️ La vente est-elle déjà décidée, signée ou en cours de négociation ?',
                    type: 'qcm',
                    options: [
                        { value: 'non', label: '❌ Non, c\'est un projet futur', hint: '→ Donation avant vente = purge PV (sécurisé)' },
                        { value: 'negociation', label: '🤝 En négociation / offre reçue', hint: '→ ⚠️ Risque abus de droit si donation puis vente immédiate' },
                        { value: 'oui', label: '✅ Oui, compromis signé ou vente actée', hint: '→ 🚨 Donation-cession DÉCONSEILLÉE (abus de droit quasi certain)' }
                    ]
                });
            }

        } else if (usage === 'rs') {
            prose.push('<strong>' + label + '</strong> est une <strong>résidence secondaire</strong> estimée à ' + fmt(val) + '. La vente est soumise à la <strong>plus-value immobilière</strong> (36,2%). La donation avant vente purge la PV.');

            questions.push({
                id: 'rs-projet',
                text: 'Quel est le projet pour cette résidence secondaire ?',
                type: 'qcm',
                options: [
                    { value: 'garder', label: '🏖️ La garder (usage familial)', hint: '→ Donation NP (famille conserve l\'usage)' },
                    { value: 'vendre', label: '🏷️ La vendre', hint: '→ Donner avant de vendre = purge PV' },
                    { value: 'transmettre', label: '🎁 La transmettre directement', hint: '→ Donation PP ou NP' }
                ]
            });

            // FIX 4: Abus de droit pour RS aussi
            var rsDecision = getDecision('immo-' + im.id, 'rs-projet');
            if (rsDecision === 'vendre') {
                questions.push({
                    id: 'vente-prearrangee',
                    text: '⚠️ La vente est-elle déjà décidée ou en cours ?',
                    type: 'qcm',
                    options: [
                        { value: 'non', label: '❌ Non, projet futur', hint: '→ Donation avant vente = purge PV (OK)' },
                        { value: 'negociation', label: '🤝 En négociation', hint: '→ ⚠️ Risque abus de droit' },
                        { value: 'oui', label: '✅ Compromis signé', hint: '→ 🚨 Donation-cession déconseillée' }
                    ]
                });
            }
        }

        // ── Structure de détention ──
        if (structure === 'indivision' || (im.owners && im.owners.length > 1)) {
            var ownerNames = (im.owners || []).map(function(o) {
                var name = o.personNom || '';
                if (!name && o.personId) {
                    var allP = ctx.donors.concat(ctx.intermediaires || []);
                    var pidStr = String(o.personId);
                    allP.forEach(function(p) {
                        if (p.nom && ('d-' + (p._poId >= 0 ? p._poId : p.id) === pidStr || 'd-' + p.id === pidStr)) name = p.nom;
                    });
                    if (!name) {
                        var fg2 = FG();
                        if (fg2 && fg2.getPersons) {
                            fg2.getPersons().forEach(function(fp) {
                                if ('d-' + fp.id === pidStr || 'b-' + fp.id === pidStr || String(fp.id) === pidStr.replace('d-','').replace('b-','')) {
                                    if (fp.nom) name = fp.nom;
                                }
                            });
                        }
                    }
                }
                return (name || '?') + ' (' + (o.quote || '?') + '%)';
            }).join(', ');

            prose.push('Ce bien est en <strong>indivision</strong> entre ' + ownerNames + '. Chaque indivisaire ne peut donner que <strong>sa propre quote-part</strong>.');

            questions.push({
                id: 'indivision-sortie',
                text: 'Comment souhaitez-vous traiter l\'indivision ?',
                type: 'qcm',
                options: [
                    { value: 'sortir', label: '🔓 Sortir de l\'indivision d\'abord', hint: '→ Rachat de parts ou partage notarié, puis donation de la PP' },
                    { value: 'donner_qp', label: '📝 Donner la quote-part en l\'état', hint: '→ Plus rapide mais le donataire reste en indivision' },
                    { value: 'sci', label: '🏢 Apporter en SCI pour structurer', hint: '→ SCI = décote + contrôle + sortie progressive' },
                    { value: 'rien', label: '⏳ Ne rien changer pour l\'instant', hint: '→ Transmission en succession (quote-part)' }
                ]
            });
        }

        // ── Âge et démembrement ──
        ctx.donors.forEach(function(donor) {
            var owns = !im.owners || im.owners.length === 0 || im.owners.some(function(o) {
                return o.personNom === donor.nom || String(o.personId) === 'd-' + (donor._poId >= 0 ? donor._poId : donor.id);
            });
            if (!owns) return;

            var npR = getNPRatio(donor.age);
            prose.push('À <strong>' + donor.age + ' ans</strong> (barème art. 669) : NP = <strong>' + Math.round(npR * 100) + '%</strong>, usufruit = ' + Math.round((1 - npR) * 100) + '%. ' +
                (npR >= 0.8 ? 'Ratio élevé — l\'avantage fiscal du démembrement est réduit à cet âge.' : 'Le démembrement est avantageux : droits sur ' + Math.round(npR * 100) + '% seulement.'));
        });

        // ── Chemin indirect ? ──
        var hasGPDonor = ctx.donors.some(function(d) { return d.role === 'grand_parent' || d.role === 'arr_grand_parent'; });
        if (hasGPDonor && ctx.intermediaires.length > 0) {
            questions.push({
                id: 'chemin-indirect',
                text: 'Envisagez-vous de passer par un intermédiaire (ex: Gérald) pour cumuler les abattements ?',
                type: 'qcm',
                options: [
                    { value: 'oui', label: '✅ Oui, si c\'est plus avantageux', hint: '→ On calcule le chemin indirect optimal' },
                    { value: 'non', label: '❌ Non, donation directe uniquement', hint: '→ Seul le chemin direct sera proposé' },
                    { value: 'comparer', label: '🔄 Comparer les deux', hint: '→ On affiche direct ET indirect côte à côte' }
                ]
            });
        }

        return { prose: prose.join(' '), questions: questions };
    }

    function buildFinanceDiagnostic(fin, ctx) {
        var prose = [];
        var questions = [];
        var cap = fin.valeur || 0;
        var FISC = ctx.FISC;
        var assetId = 'fin-' + fin.id;

        var donor = ctx.donors[0];
        if (fin.ownerId) {
            var po2 = PO();
            if (po2) {
                var pidStr = String(fin.ownerId);
                if (pidStr.startsWith('d-')) {
                    var poIdx = parseInt(pidStr.replace('d-', ''));
                    var pod = po2.getDonors().find(function(d2) { return d2.id === poIdx; });
                    if (pod) {
                        var md = ctx.donors.find(function(cd) { return cd.nom === pod.nom; });
                        if (md) donor = md;
                    }
                }
            }
        }
        var donorAge = donor ? donor.age : 60;
        var donorName = donor ? esc(donor.nom) : '?';

        if (fin.type === 'assurance_vie') {
            var isAvant70 = donorAge < 70 || (fin.ageVersement && fin.ageVersement < 70);

            prose.push('<strong>Assurance-vie</strong> de ' + fmt(cap) + ' souscrite par ' + donorName + '.');

            if (isAvant70) {
                prose.push('Primes versées <strong>avant 70 ans → art. 990 I</strong> : abattement <strong>' + fmt(FISC.av990I.abattement) + '/bénéficiaire</strong>, puis 20% / 31,25%.');
                if (cap <= FISC.av990I.abattement) {
                    prose.push('Le capital reste sous l\'abattement → <strong>0 € de droits au décès</strong>. Situation idéale.');
                } else {
                    prose.push('Le capital dépasse l\'abattement de ' + fmt(FISC.av990I.abattement) + '. Au-delà, un contrat de capitalisation démembré peut être plus avantageux.');
                }
            } else {
                prose.push(donorName + ' ayant <strong>plus de 70 ans → art. 757 B</strong> : abattement global <strong>' + fmt(FISC.av757B.abattementGlobal) + '</strong> seulement. Mais les <strong>intérêts acquis sont exonérés</strong> (seules les primes taxées).');
            }

            questions.push({
                id: 'av-strategie',
                text: 'Quelle approche pour cette assurance-vie ?',
                type: 'qcm',
                options: [
                    { value: 'conserver', label: '🛡️ Conserver le contrat jusqu\'au décès', hint: '→ Capital transmis au bénéficiaire (art. ' + (isAvant70 ? '990 I' : '757 B') + ')' },
                    { value: 'rachats', label: '💸 Rachats progressifs + dons', hint: '→ ' + fmt(4600) + '/an exonéré IR (après 8 ans) + don manuel ou cadeau' },
                    { value: 'capi', label: '📊 Transformer en contrat de capitalisation', hint: '→ Donner la NP, droits sur ' + Math.round(getNPRatio(donorAge) * 100) + '% seulement, antériorité conservée' },
                    { value: 'comparer', label: '🔄 Voir toutes les options', hint: '→ Comparaison chiffrée complète' }
                ]
            });

            if (!isAvant70 && cap > 50000) {
                questions.push({
                    id: 'av-usage-rachats',
                    text: donorName + ' a-t-elle besoin de revenus complémentaires issus de cette AV ?',
                    type: 'qcm',
                    options: [
                        { value: 'oui', label: '💰 Oui, les rachats sont nécessaires', hint: '→ Rachats réguliers + transmission du solde au décès' },
                        { value: 'non', label: '❌ Non, l\'AV est un placement de transmission', hint: '→ Capi démembré ou modifier clause bénéficiaire' }
                    ]
                });
            }

            // Clause bénéficiaire
            if (!fin.avBeneficiaires || fin.avBeneficiaires.length === 0) {
                prose.push('⚠️ <strong>Clause bénéficiaire non définie</strong> — c\'est elle qui détermine qui reçoit le capital.');
                questions.push({
                    id: 'av-clause',
                    text: 'Qui doit être désigné bénéficiaire de cette AV ?',
                    type: 'text',
                    placeholder: 'Ex: Andréa en PP, ou clause démembrée (US Gérald, NP Andréa)...'
                });
            }

        } else if (fin.type === 'contrat_capi') {
            prose.push('<strong>Contrat de capitalisation</strong> de ' + fmt(cap) + '. Avantages spécifiques : <strong>antériorité fiscale conservée</strong>, quasi-usufruit possible (créance déductible au décès).');
            prose.push('À ' + donorAge + ' ans, NP = ' + Math.round(getNPRatio(donorAge) * 100) + '% → droits sur ' + fmt(Math.round(cap * getNPRatio(donorAge))) + ' au lieu de ' + fmt(cap) + '.');

            questions.push({
                id: 'capi-strategie',
                text: 'Souhaitez-vous démembrer ce contrat ?',
                type: 'qcm',
                options: [
                    { value: 'demembrer', label: '🔑 Oui, donner la NP', hint: '→ Droits réduits, quasi-usufruit possible' },
                    { value: 'conserver', label: '⏳ Non, conserver en l\'état', hint: '→ Transmission en succession au décès' }
                ]
            });

        } else if (fin.type === 'pea' || fin.type === 'pea_pme') {
            prose.push('<strong>PEA</strong> de ' + fmt(cap) + '. Le PEA est <strong>personnel et intransmissible</strong> du vivant. Au décès : clôture, gains exonérés d\'IR (seuls PS s\'appliquent), capital entre dans la succession.');
            
            questions.push({
                id: 'pea-strategie',
                text: 'Souhaitez-vous utiliser le PEA pour transmettre ?',
                type: 'qcm',
                options: [
                    { value: 'retrait', label: '💸 Retirer et transmettre via don manuel', hint: '→ Retrait exonéré IR après 5 ans, puis don' },
                    { value: 'conserver', label: '⏳ Garder le PEA (succession)', hint: '→ Gains exonérés IR au décès' }
                ]
            });

        } else if (fin.type === 'cto') {
            prose.push('<strong>Compte-titres</strong> de ' + fmt(cap) + '. La donation <strong>purge la plus-value latente</strong> — avantage significatif si les titres ont fortement progressé.');

        } else {
            prose.push('Placement financier de ' + fmt(cap) + '.');
        }

        return { prose: prose.join(' '), questions: questions };
    }


    // ================================================================
    // 4. IMMO OPTIONS — Options par bien immobilier
    // ================================================================

    function analyzeImmo(im, ctx) {
        var result = {
            asset: im,
            type: 'immo',
            label: im.label || 'Bien immobilier',
            usage: im.usageActuel || 'rp',
            valeur: im.valeur || 0,
            options: [],
            alerts: [],
            questions: [],
            diagnostic: '' // Expert narrative
        };

        if (result.valeur <= 0) return result;

        var FISC = ctx.FISC;

        // ── BUILD EXPERT DIAGNOSTIC ──
        var diag = buildImmoDiagnostic(im, ctx);
        result.diagnostic = diag.prose;
        result.questions = diag.questions;

        // Find owners of this asset among donors
        var donorOwners = [];
        (im.owners || []).forEach(function(o) {
            ctx.donors.forEach(function(d) {
                var donorKey = 'd-' + (d._poId >= 0 ? d._poId : d.id);
                // Also try matching by FG id
                var fgKey = 'd-' + d.id;
                if (String(o.personId) === donorKey || String(o.personId) === fgKey || (o.personNom && o.personNom === d.nom)) {
                    donorOwners.push({ donor: d, owner: o, quote: (o.quote || 100) / 100, role: o.role || 'pp' });
                }
            });
        });

        // If no ownership data, assume first checked donor owns 100%
        if (donorOwners.length === 0 && ctx.donors.length > 0) {
            donorOwners.push({ donor: ctx.donors[0], owner: {}, quote: 1, role: 'pp' });
        }

        donorOwners.forEach(function(dOwner) {
            var donor = dOwner.donor;
            var partVal = Math.round(result.valeur * dOwner.quote);
            var npRatio = getNPRatio(donor.age);

            // Context for this donor → each beneficiary
            ctx.bens.forEach(function(ben) {
                var pc = ctx.pairContexts.find(function(p) {
                    return p.donor.id === donor.id && (p.ben.id === ben.id);
                });
                if (!pc) return;

                var lien = pc.lien;
                var abatR = pc.abatRestant;
                var bareme = getBareme(lien);
                var ownerLabel = esc(donor.nom) + ' (' + Math.round(dOwner.quote * 100) + '%)';

                // === OPTION: NE RIEN FAIRE (succession) ===
                var abatSucc = Math.max(0, getAbattement(lien, true) - pc.donAnterieures);
                var baseSucc = Math.max(0, partVal - abatSucc);
                var droitsSucc = calcDroits(baseSucc, bareme);
                result.options.push({
                    id: 'succession', rank: 99,
                    name: 'Ne rien faire (succession)',
                    icon: '📋', timing: 'Au décès de ' + esc(donor.nom),
                    droits: droitsSucc, net: partVal - droitsSucc - Math.round(partVal * FISC.fraisNotaireSuccPct),
                    donor: donor.nom, ben: ben.prenom || ben.nom, lien: lien,
                    explain: 'Au décès, ' + esc(ben.prenom || ben.nom) + ' paierait <strong>' + fmt(droitsSucc) + ' de droits</strong> sur la part de ' + ownerLabel + ' (base taxable ' + fmt(baseSucc) + ' après abattement ' + formatLien(lien) + ' de ' + fmt(abatSucc) + ').',
                    risks: ['Droits au barème plein', 'Pas de choix du timing'],
                    advantages: ['Aucune démarche', 'Bien reste dans le patrimoine'],
                    isBest: false, isWorst: true
                });

                // === OPTION: DONATION NP DIRECTE ===
                var npVal = Math.round(partVal * npRatio);
                var baseNP = Math.max(0, npVal - abatR);
                var droitsNP = calcDroits(baseNP, bareme);
                var fraisNP = Math.round(npVal * FISC.fraisNotairePct);
                result.options.push({
                    id: 'donation_np', rank: 2,
                    name: 'Donation NP directe (' + Math.round(npRatio * 100) + '%) — ' + esc(donor.nom) + ' → ' + esc(ben.prenom || ben.nom),
                    icon: '🔑', timing: 'Maintenant',
                    droits: droitsNP, frais: fraisNP, net: partVal - droitsNP - fraisNP,
                    donor: donor.nom, ben: ben.prenom || ben.nom, lien: lien,
                    explain: 'Donner la nue-propriété à ' + esc(ben.prenom || ben.nom) + ' (art. 669 CGI). À ' + donor.age + ' ans, NP = ' + Math.round(npRatio * 100) + '% → droits sur <strong>' + fmt(npVal) + '</strong> au lieu de ' + fmt(partVal) + '. ' + esc(donor.nom) + ' conserve l\'usufruit (usage et revenus). Au décès, la PP se reconstitue sans droits supplémentaires.',
                    risks: ['Nu-propriétaire ne peut vendre sans accord usufruitier'],
                    advantages: ['Usufruit conservé (loyers, usage)', 'NP → PP au décès sans re-taxation', 'Droits réduits sur ' + Math.round(npRatio * 100) + '% seulement'],
                    isBest: false, isWorst: false
                });

                // === OPTION: CHEMIN INDIRECT (si GP) ===
                if (['petit_enfant', 'arriere_petit_enfant'].includes(lien)) {
                    // Find parent intermediaries
                    ctx.intermediaires.forEach(function(inter) {
                        var fg2 = FG();
                        if (!fg2 || !fg2.computeFiscalLien) return;

                        var lienDonorInter = fg2.computeFiscalLien(donor.id, inter.id);
                        if (!lienDonorInter || lienDonorInter === 'tiers' || lienDonorInter === 'self') return;

                        var lienInterBen = fg2.computeFiscalLien(inter.id, ben._graphId || ben.id);
                        if (!lienInterBen || lienInterBen === 'tiers' || lienInterBen === 'self') return;

                        var abatDI = getAbattement(lienDonorInter, false);
                        var abatIB = getAbattement(lienInterBen, false);
                        if (abatDI < 10000 || abatIB < 10000) return;

                        // Check intermediary's prior donations to beneficiary
                        var po2 = PO();
                        var interDonAnt = 0;
                        if (po2 && po2.getDonorDonationForBenRaw) {
                            var pod = po2.getDonors().find(function(pd) { return pd.nom === inter.nom; });
                            if (pod) {
                                var raw = po2.getDonorDonationForBenRaw(pod.id, ben.id);
                                if (raw && raw.montant > 0) interDonAnt = raw.montant;
                            }
                        }
                        var abatIBRestant = Math.max(0, abatIB - interDonAnt);

                        // Step 1: Donor → Intermediary (NP)
                        var npVal1 = Math.round(partVal * npRatio);
                        var base1 = Math.max(0, npVal1 - abatDI);
                        var droits1 = calcDroits(base1, getBareme(lienDonorInter));

                        // Step 2: Intermediary → Beneficiary (NP)
                        // Intermediary donates what they received (NP value)
                        var interAge = inter.age || 50;
                        var npRatio2 = getNPRatio(interAge);
                        var npVal2 = Math.round(partVal * npRatio2); // value based on inter's age
                        var base2 = Math.max(0, npVal2 - abatIBRestant);
                        var droits2 = calcDroits(base2, getBareme(lienInterBen));

                        var totalDroits = droits1 + droits2;
                        var fraisIndir = Math.round(npVal1 * FISC.fraisNotairePct) + Math.round(npVal2 * FISC.fraisNotairePct);

                        // Only show if cheaper than direct
                        if (totalDroits < droitsNP) {
                            result.options.push({
                                id: 'indirect_' + inter.id, rank: 1,
                                name: 'Chemin indirect : ' + esc(donor.nom) + ' → ' + esc(inter.nom) + ' → ' + esc(ben.prenom || ben.nom),
                                icon: '🔀', timing: 'Maintenant (2 actes)',
                                droits: totalDroits, frais: fraisIndir, net: partVal - totalDroits - fraisIndir,
                                donor: donor.nom, ben: ben.prenom || ben.nom, lien: lien,
                                explain: '<strong>Étape 1 :</strong> ' + esc(donor.nom) + ' donne la NP à ' + esc(inter.nom) + ' (' + formatLien(lienDonorInter) + ', abat. ' + fmt(abatDI) + ') → droits : ' + fmt(droits1) + '.<br>' +
                                    '<strong>Étape 2 :</strong> ' + esc(inter.nom) + ' redonne la NP à ' + esc(ben.prenom || ben.nom) + ' (' + formatLien(lienInterBen) + ', abat. ' + fmt(abatIBRestant) + (interDonAnt > 0 ? ' — ' + fmt(interDonAnt) + ' déjà donné' : '') + ') → droits : ' + fmt(droits2) + '.<br>' +
                                    '<strong>Total :</strong> ' + fmt(totalDroits) + ' de droits (vs ' + fmt(droitsNP) + ' en direct). <strong>Économie : ' + fmt(droitsNP - totalDroits) + '</strong>.',
                                risks: [esc(inter.nom) + ' consomme ' + fmt(Math.min(npVal2, abatIBRestant)) + ' de son abattement ' + formatLien(lienInterBen), '2 actes notariés → frais doublés', esc(inter.nom) + ' est nu-propriétaire temporaire'],
                                advantages: ['Cumul de 2 abattements en ligne directe', 'Économie de ' + fmt(droitsNP - totalDroits) + ' vs donation directe', esc(donor.nom) + ' conserve l\'usufruit'],
                                isBest: false, isWorst: false
                            });
                        }
                    });
                }

                // === OPTION: SCI + DONATION NP PARTS ===
                if (partVal > 80000) {
                    var decote = 0.15;
                    var sciVal = Math.round(partVal * (1 - decote));
                    var sciNP = Math.round(sciVal * npRatio);
                    var baseSCI = Math.max(0, sciNP - abatR);
                    var droitsSCI = calcDroits(baseSCI, bareme);
                    var fraisSCI = Math.round(sciNP * FISC.fraisNotairePct) + FISC.fraisStructure.creation;
                    result.options.push({
                        id: 'sci_np', rank: 3,
                        name: 'SCI IR + donation NP parts — ' + esc(donor.nom) + ' → ' + esc(ben.prenom || ben.nom),
                        icon: '🏢', timing: 'Maintenant',
                        droits: droitsSCI, frais: fraisSCI, net: partVal - droitsSCI - fraisSCI,
                        fraisAn: FISC.fraisStructure.sci_ir,
                        donor: donor.nom, ben: ben.prenom || ben.nom, lien: lien,
                        explain: 'Apporter le bien en SCI IR → décote 15% (illiquidité, art. 757 CGI) : valeur parts ' + fmt(sciVal) + ' au lieu de ' + fmt(partVal) + '. Puis donner la NP des parts (' + Math.round(npRatio * 100) + '%) → droits sur <strong>' + fmt(sciNP) + '</strong>. ' + esc(donor.nom) + ' reste gérant = contrôle total.',
                        risks: ['Frais création ~' + fmt(FISC.fraisStructure.creation), 'Comptabilité annuelle ~' + fmt(FISC.fraisStructure.sci_ir) + '/an', 'SCI + meublé > 10% = risque IS'],
                        advantages: ['Décote 15% + démembrement = double levier', 'Gérant = contrôle total', 'Transmission progressive possible'],
                        isBest: false, isWorst: false
                    });
                }

                // === OPTION: VENDRE PUIS TRANSMETTRE ===
                if (im.prixAcquisition > 0 && im.usageActuel !== 'rp') {
                    var pvBrute = Math.max(0, partVal - im.prixAcquisition * dOwner.quote);
                    var pvIR = Math.round(pvBrute * FISC.pvIR);
                    var pvPS = Math.round(pvBrute * FISC.pvPS);
                    var netVente = partVal - pvIR - pvPS;
                    result.options.push({
                        id: 'vendre', rank: 5,
                        name: 'Vendre puis transmettre le produit',
                        icon: '🏷️', timing: 'Avant donation',
                        droits: pvIR + pvPS, net: netVente,
                        donor: donor.nom, ben: ben.prenom || ben.nom, lien: lien,
                        explain: 'Vente → PV brute estimée ' + fmt(pvBrute) + ' (IR 19% + PS 17,2% = ' + fmt(pvIR + pvPS) + '). Net après impôts : ' + fmt(netVente) + '. Ce montant peut ensuite être transmis en don manuel ou placé en AV.<br>Alternative : <strong>donner AVANT de vendre</strong> → purge de la plus-value (le donataire revend à valeur vénale, pas de PV).',
                        risks: ['Fiscalité PV immédiate', 'Perte du bien'],
                        advantages: ['Liquidité immédiate', 'Si donation avant vente : purge PV'],
                        isBest: false, isWorst: false
                    });
                }
            });
        });

        // Sort and filter based on user decisions
        var assetKey = 'immo-' + im.id;
        result.options = applyDecisions(result.options, assetKey, im, ctx);

        return result;
    }

    /**
     * applyDecisions — Filter and re-rank options based on user QCM answers
     */
    function applyDecisions(options, assetKey, asset, ctx) {
        // ── Hide options that don't match decisions ──
        var filtered = options.slice();

        // RP intention
        var rpIntent = getDecision(assetKey, 'rp-intention-' + (ctx.donors[0] ? ctx.donors[0].id : ''));
        if (!rpIntent) rpIntent = getDecision(assetKey, 'rp-intention-0');
        if (rpIntent === 'etablissement') {
            // Boost vente option, deprioritize NP
            filtered.forEach(function(o) {
                if (o.id === 'vendre') o.rank = 0;
                if (o.id.indexOf('np') >= 0 || o.id.indexOf('sci') >= 0) o.rank += 5;
            });
        } else if (rpIntent === 'rester') {
            // Boost NP options
            filtered.forEach(function(o) {
                if (o.id === 'donation_np' || o.id.indexOf('indirect') >= 0) o.rank = Math.max(0, o.rank - 2);
                if (o.id === 'vendre') o.rank += 10;
            });
        }

        // Locatif revenus
        var locRevenu = getDecision(assetKey, 'locatif-revenus');
        if (locRevenu === 'essentiels') {
            filtered.forEach(function(o) {
                if (o.id === 'donation_np' || o.id === 'sci_np' || o.id.indexOf('indirect') >= 0 || o.id === 'capi_demembre') o.rank = Math.max(0, o.rank - 2);
                // Hide PP donation
                if (o.id === 'donation_pp') o.hidden = true;
            });
        } else if (locRevenu === 'non') {
            filtered.forEach(function(o) {
                if (o.id === 'donation_pp') o.rank = Math.max(0, o.rank - 1);
            });
        }

        // Locatif horizon
        var locHorizon = getDecision(assetKey, 'locatif-horizon');
        if (locHorizon === 'vendre_court') {
            filtered.forEach(function(o) {
                if (o.id === 'vendre') o.rank = 0;
                if (o.id === 'donation_np') { o.rank = 1; o.explain += '<br><strong>💡 Astuce :</strong> donner la NP AVANT de vendre → purge de la plus-value. Le donataire revend ensuite sans PV.'; }
            });
        } else if (locHorizon === 'conserver') {
            filtered.forEach(function(o) {
                if (o.id === 'vendre') o.rank += 10;
            });
        }

        // Indivision
        var indivision = getDecision(assetKey, 'indivision-sortie');
        if (indivision === 'sortir') {
            filtered.forEach(function(o) {
                if (o.id === 'donation_np' || o.id === 'donation_pp') {
                    o.explain = '<strong>Après sortie d\'indivision :</strong> ' + o.explain;
                }
            });
        } else if (indivision === 'sci') {
            filtered.forEach(function(o) {
                if (o.id === 'sci_np') o.rank = 0;
            });
        } else if (indivision === 'rien') {
            // Only show succession
            filtered.forEach(function(o) {
                if (o.id !== 'succession') o.rank += 10;
            });
        }

        // Chemin indirect preference
        var indirect = getDecision(assetKey, 'chemin-indirect');
        if (indirect === 'non') {
            filtered = filtered.filter(function(o) { return o.id.indexOf('indirect') < 0; });
        } else if (indirect === 'oui') {
            filtered.forEach(function(o) {
                if (o.id.indexOf('indirect') >= 0) o.rank = Math.max(0, o.rank - 3);
            });
        }

        // FIX 4: Abus de droit — si vente pré-arrangée, flag les donations
        var ventePrearrangee = getDecision(assetKey, 'vente-prearrangee');
        if (ventePrearrangee === 'oui' || ventePrearrangee === 'negociation') {
            filtered.forEach(function(o) {
                if (o.id === 'donation_np' || o.id === 'donation_pp' || o.id.indexOf('indirect') >= 0 || o.id === 'sci_np') {
                    if (ventePrearrangee === 'oui') {
                        o.risks = (o.risks || []).concat(['🚨 ABUS DE DROIT : vente déjà actée → donation-cession très probablement requalifiée (art. L64 LPF). Pénalités 40-80%.']);
                        o.rank += 20;
                    } else {
                        o.risks = (o.risks || []).concat(['⚠️ Risque abus de droit : l\'administration fiscale vérifie si la cession était déjà engagée (offre, négociation avancée, mandat de vente) avant la donation. Le critère n\'est pas un délai fixe mais l\'intention préexistante de vendre.']);
                    }
                }
            });
        }

        // Remove hidden
        filtered = filtered.filter(function(o) { return !o.hidden; });

        // Re-sort by rank then by droits
        filtered.sort(function(a, b) { return a.rank !== b.rank ? a.rank - b.rank : a.droits - b.droits; });

        // Re-mark best
        filtered.forEach(function(o) { o.isBest = false; });
        if (filtered.length > 0) filtered[0].isBest = true;

        return filtered;
    }


    // ================================================================
    // 4. FINANCE OPTIONS — Options par actif financier
    // ================================================================

    function analyzeFinance(fin, ctx) {
        var result = {
            asset: fin, type: 'finance',
            label: fin.type === 'assurance_vie' ? 'Assurance-vie' : fin.type === 'contrat_capi' ? 'Contrat de capitalisation' : fin.type === 'pea' ? 'PEA' : 'Placement financier',
            valeur: fin.valeur || 0,
            options: [], alerts: [], questions: [],
            diagnostic: ''
        };

        if (result.valeur <= 0) return result;

        // Expert diagnostic
        var diag = buildFinanceDiagnostic(fin, ctx);
        result.diagnostic = diag.prose;
        result.questions = diag.questions;

        var FISC = ctx.FISC;

        // Find owner
        var donor = ctx.donors[0]; // default
        if (fin.ownerId) {
            var po2 = PO();
            if (po2) {
                var pidStr = String(fin.ownerId);
                if (pidStr.startsWith('d-')) {
                    var poIdx = parseInt(pidStr.replace('d-', ''));
                    var pod = po2.getDonors().find(function(d) { return d.id === poIdx; });
                    if (pod) {
                        var matchedDonor = ctx.donors.find(function(cd) { return cd.nom === pod.nom; });
                        if (matchedDonor) donor = matchedDonor;
                    }
                }
            }
        }
        if (!donor) return result;

        var donorAge = donor.age || 60;
        var npRatio = getNPRatio(donorAge);
        var cap = result.valeur;

        ctx.bens.forEach(function(ben) {
            var pc = ctx.pairContexts.find(function(p) {
                return p.donor.id === donor.id && p.ben.id === ben.id;
            });
            if (!pc) return;
            var lien = pc.lien;
            var abatR = pc.abatRestant;
            var bareme = getBareme(lien);

            // ─── ASSURANCE-VIE ───
            if (fin.type === 'assurance_vie') {
                var isAvant70 = donorAge < 70 || (fin.ageVersement && fin.ageVersement < 70);

                if (isAvant70) {
                    // Art. 990 I
                    var av990Abat = FISC.av990I.abattement;
                    var avBase = Math.max(0, cap - av990Abat);
                    var avTr1 = Math.min(avBase, FISC.av990I.seuil2 - av990Abat);
                    var avTr2 = Math.max(0, avBase - avTr1);
                    var avDroits = Math.round(avTr1 * FISC.av990I.taux1 + avTr2 * FISC.av990I.taux2);

                    result.options.push({
                        id: 'av_990i', rank: 2, icon: '🛡️', timing: 'Au décès',
                        name: 'Conserver l\'AV (art. 990 I — primes avant 70 ans)',
                        droits: avDroits, net: cap - avDroits,
                        explain: 'Abattement <strong>' + fmt(av990Abat) + '</strong> par bénéficiaire (hors succession). Au-delà : 20% jusqu\'à ' + fmt(FISC.av990I.seuil2) + ', puis 31,25%. Droits estimés : <strong>' + fmt(avDroits) + '</strong>.',
                        advantages: ['Hors succession', 'Bénéficiaire libre', 'Abattement ' + fmt(av990Abat) + '/bénéficiaire'],
                        risks: ['Frais de gestion ~0,7%/an'],
                        isBest: false, isWorst: false
                    });
                } else {
                    // Art. 757 B
                    var nbBens = Math.max(1, ctx.bens.length);
                    var av757Abat = Math.round(FISC.av757B.abattementGlobal / nbBens);
                    var av757Base = Math.max(0, cap - av757Abat);
                    var av757Droits = calcDroits(av757Base, bareme);

                    result.options.push({
                        id: 'av_757b', rank: 3, icon: '📉', timing: 'Au décès',
                        name: 'Conserver l\'AV (art. 757 B — primes après 70 ans)',
                        droits: av757Droits, net: cap - av757Droits,
                        explain: 'Primes versées après 70 ans → barème de droit commun. Abattement global <strong>' + fmt(FISC.av757B.abattementGlobal) + '</strong> (partagé si plusieurs bénéficiaires). <strong>Mais les intérêts acquis sont exonérés</strong> (seules les primes sont taxées). Droits estimés : <strong>' + fmt(av757Droits) + '</strong>.',
                        advantages: ['Intérêts exonérés (seules primes taxées)', 'Bénéficiaire libre'],
                        risks: ['Abattement global ' + fmt(FISC.av757B.abattementGlobal) + ' seulement', 'Barème droit commun'],
                        isBest: false, isWorst: false
                    });
                }

                // Rachats annuels + don manuel
                var rachatAnnuel = 4600; // célibataire
                var projAns = 10;
                var totalRachats = rachatAnnuel * projAns;
                result.options.push({
                    id: 'rachats_don', rank: 2, icon: '💸', timing: 'Étalé sur ' + projAns + ' ans',
                    name: 'Rachats annuels exonérés + dons manuels',
                    droits: 0, net: Math.min(totalRachats, cap),
                    explain: 'Après 8 ans de contrat : rachat annuel de <strong>' + fmt(rachatAnnuel) + '</strong> exonéré d\'IR (abattement art. 125-0 A CGI). Sur ' + projAns + ' ans = <strong>' + fmt(totalRachats) + '</strong> transmis en franchise via don manuel / présent d\'usage. Cumulable avec les abattements donation.',
                    advantages: ['0 € de droits', '0 € d\'IR sur les rachats', 'Transmission progressive'],
                    risks: ['Limité à ' + fmt(rachatAnnuel) + '/an', 'Nécessite un contrat de + de 8 ans'],
                    isBest: false, isWorst: false
                });

                // === CONTRAT DE CAPITALISATION comme alternative ===
                if (cap > FISC.av990I.abattement) {
                    var capiNP = Math.round(cap * npRatio);
                    var capiBase = Math.max(0, capiNP - abatR);
                    var capiDroits = calcDroits(capiBase, bareme);

                    result.options.push({
                        id: 'capi_alt', rank: 1, icon: '📊', timing: 'Maintenant',
                        name: 'Souscrire un contrat de capitalisation + donner la NP',
                        droits: capiDroits, net: cap - capiDroits,
                        explain: 'Au-delà de ' + fmt(FISC.av990I.abattement) + ' d\'abattement AV, un <strong>contrat de capitalisation démembré</strong> peut être plus avantageux : droits sur la NP seulement (' + Math.round(npRatio * 100) + '% à ' + donorAge + ' ans). Antériorité fiscale conservée. Quasi-usufruit possible → créance de restitution déductible au décès.<br>Droits estimés : <strong>' + fmt(capiDroits) + '</strong> (vs ' + fmt(isAvant70 ? result.options[0].droits : (result.options[0] || {}).droits || 0) + ' en AV).',
                        advantages: ['Droits sur NP (' + Math.round(npRatio * 100) + '%) seulement', 'Antériorité fiscale conservée', 'Quasi-usufruit = créance déductible', esc(donor.nom) + ' garde le contrôle'],
                        risks: ['Frais gestion ~0,7%/an', 'Entre dans la succession (contrairement AV)'],
                        isBest: false, isWorst: false
                    });
                }
            }

            // ─── CONTRAT DE CAPITALISATION existant ───
            if (fin.type === 'contrat_capi') {
                var capiNPVal = Math.round(cap * npRatio);
                var capiBaseVal = Math.max(0, capiNPVal - abatR);
                var capiDroitsVal = calcDroits(capiBaseVal, bareme);

                result.options.push({
                    id: 'capi_demembre', rank: 1, icon: '📊', timing: 'Maintenant',
                    name: 'Démembrer le contrat (donner la NP)',
                    droits: capiDroitsVal, net: cap - capiDroitsVal,
                    explain: 'Donner la NP du contrat à ' + esc(ben.prenom || ben.nom) + '. Droits sur ' + Math.round(npRatio * 100) + '% = <strong>' + fmt(capiNPVal) + '</strong>. ' + esc(donor.nom) + ' conserve l\'usufruit (quasi-usufruit possible). Antériorité fiscale conservée.',
                    advantages: ['Droits sur NP seulement', 'Antériorité fiscale', 'Quasi-usufruit possible'],
                    risks: ['Contrat entre dans succession'],
                    isBest: false, isWorst: false
                });
            }

            // === NE RIEN FAIRE (succession) ===
            var baseSuccFin = Math.max(0, cap - Math.max(0, getAbattement(lien, true) - pc.donAnterieures));
            var droitsSuccFin = calcDroits(baseSuccFin, bareme);
            result.options.push({
                id: 'succession_fin', rank: 99, icon: '📋', timing: 'Au décès',
                name: 'Ne rien faire (succession)',
                droits: droitsSuccFin, net: cap - droitsSuccFin,
                explain: 'Au décès : droits de succession de <strong>' + fmt(droitsSuccFin) + '</strong> sur ' + fmt(cap) + '.',
                advantages: ['Aucune démarche'], risks: ['Barème plein'],
                isBest: false, isWorst: true
            });
        });

        // Sort and filter based on decisions
        var assetKey = 'fin-' + fin.id;
        var avStrat = getDecision(assetKey, 'av-strategie');
        
        if (avStrat === 'rachats') {
            result.options.forEach(function(o) { if (o.id === 'rachats_don') o.rank = 0; });
        } else if (avStrat === 'capi') {
            result.options.forEach(function(o) { if (o.id === 'capi_alt' || o.id === 'capi_demembre') o.rank = 0; });
        } else if (avStrat === 'conserver') {
            result.options.forEach(function(o) { if (o.id.indexOf('990') >= 0 || o.id.indexOf('757') >= 0) o.rank = 0; });
        }

        result.options.sort(function(a, b) { return a.rank !== b.rank ? a.rank - b.rank : a.droits - b.droits; });
        result.options.forEach(function(o) { o.isBest = false; });
        if (result.options.length > 0) result.options[0].isBest = true;

        return result;
    }


    // ================================================================
    // 5. GLOBAL QUESTIONS — Entretien CGP avec vrais chiffres
    // ================================================================

    function generateGlobalQuestions(ctx) {
        var questions = [];
        var FISC = ctx.FISC;
        var pat = ctx.pat;

        // === SECTION 1: COMPRENDRE LA SITUATION ===

        // Q: Testament vs Donation (éducation)
        ctx.donors.forEach(function(donor) {
            var donorLabel = esc(donor.nom);
            var donorAge = donor.age || 60;

            // Calculate statu quo droits for this donor
            var totalDroitsSucc = 0;
            ctx.pairContexts.forEach(function(pc) {
                if (pc.donor.id !== donor.id) return;
                var abatS = getAbattement(pc.lien, true);
                var partTotal = Math.round(pat.actifNet / Math.max(1, ctx.bens.length));
                var base = Math.max(0, partTotal - Math.max(0, abatS - pc.donAnterieures));
                totalDroitsSucc += calcDroits(base, getBareme(pc.lien));
            });

            if (totalDroitsSucc > 5000) {
                questions.push({
                    id: 'global-testament-' + donor.id,
                    section: 'comprendre',
                    context: donorLabel + ' possède un patrimoine de <strong>' + fmt(pat.actifNet) + '</strong>. ' +
                        'Si rien n\'est fait de son vivant (pas de donation, seulement un testament ou la succession légale), les droits de succession s\'élèveraient à environ <strong style="color:var(--accent-coral);">' + fmt(totalDroitsSucc) + '</strong>. ' +
                        'La donation permet de réduire ces droits, mais implique de <strong>se dessaisir</strong> d\'une partie du patrimoine. Le démembrement est un entre-deux : on transmet la propriété future tout en gardant l\'usage et les revenus.',
                    text: donorLabel + ' est-elle prête à envisager des donations de son vivant pour réduire ces droits ?',
                    type: 'qcm',
                    options: [
                        { value: 'oui_pret', label: '✅ Oui, elle souhaite transmettre activement', hint: '→ On explore toutes les options (donation, démembrement, AV, SCI...)' },
                        { value: 'prudent', label: '🔒 Oui mais en gardant le maximum de contrôle et de revenus', hint: '→ Démembrement NP, SCI, contrat de capitalisation en priorité' },
                        { value: 'non', label: '⏳ Non, elle préfère que tout passe en succession', hint: '→ On optimise la succession (AV, clause bénéficiaire, testament)' },
                        { value: 'ne_sait_pas', label: '🤔 Elle ne sait pas encore', hint: '→ On compare succession vs donation pour chaque actif' }
                    ]
                });
            }

            // Q: Besoins de revenus (global)
            var totalLoyers = (ctx.immo || []).reduce(function(s, im) { return s + (im.loyerMensuel || 0); }, 0);
            var totalFinancier = pat.financier || 0;

            questions.push({
                id: 'global-revenus-' + donor.id,
                section: 'situation',
                context: donorLabel + ' perçoit' + (totalLoyers > 0 ? ' <strong>' + fmt(totalLoyers) + '/mois de loyers</strong>' : '') +
                    (totalFinancier > 0 ? (totalLoyers > 0 ? ' et' : '') + ' dispose de <strong>' + fmt(totalFinancier) + ' en placements financiers</strong>' : '') + '. ' +
                    'Si elle donne un bien locatif en pleine propriété, elle perd les loyers. Si elle donne en nue-propriété, elle les conserve jusqu\'à son décès.',
                text: donorLabel + ' a-t-elle besoin de l\'intégralité de ses revenus actuels pour vivre ?',
                type: 'qcm',
                options: [
                    { value: 'essentiels', label: '💰 Oui, chaque euro compte', hint: '→ On privilégie les solutions qui préservent 100% des revenus' },
                    { value: 'confortable', label: '📊 Non, elle est à l\'aise financièrement', hint: '→ Plus de leviers possibles (don manuel, rachats AV, donation PP...)' },
                    { value: 'modeste', label: '🏠 Elle vit modestement mais n\'a pas de soucis', hint: '→ On sécurise les revenus essentiels et on optimise le reste' }
                ]
            });

            // Q: Urgence / horizon
            if (donorAge >= 75) {
                questions.push({
                    id: 'global-urgence-' + donor.id,
                    section: 'situation',
                    context: donorLabel + ' a <strong>' + donorAge + ' ans</strong>. Les abattements de donation ne se renouvellent que tous les <strong>15 ans</strong> (art. 784 CGI). ' +
                        'À cet âge, il est réaliste de ne pouvoir faire <strong>qu\'une seule opération</strong> de donation.' +
                        (donorAge >= 70 ? ' De plus, les primes d\'assurance-vie versées maintenant relèveraient de l\'<strong>art. 757 B</strong> (abattement global de 30 500 € seulement au lieu de 152 500 € par bénéficiaire en 990 I).' : ''),
                    text: 'Comment évaluez-vous la situation de ' + donorLabel + ' ?',
                    type: 'qcm',
                    options: [
                        { value: 'urgence', label: '🚨 Il faut agir rapidement', hint: '→ On priorise les opérations simples et rapides' },
                        { value: 'serein', label: '🕰️ Elle est en bonne santé, on a du temps', hint: '→ On peut planifier sur 2-3 ans (SCI, transmission progressive)' },
                        { value: 'incertain', label: '❓ Difficile à dire', hint: '→ On recommande d\'agir dans l\'année par prudence' }
                    ]
                });
            }
        });

        // === SECTION 2: STRATÉGIE PATRIMONIALE ===

        // Q: Chemin indirect (si GP → petit-enfant)
        var hasGPDonor = ctx.donors.some(function(d) { return d.role === 'grand_parent' || d.role === 'arr_grand_parent'; });
        var hasParentIntermediary = ctx.intermediaires.some(function(inter) {
            var fg2 = FG();
            if (!fg2 || !fg2.computeFiscalLien) return false;
            // Check if this intermediary is an enfant of a GP donor
            return ctx.donors.some(function(d) {
                if (d.role !== 'grand_parent' && d.role !== 'arr_grand_parent') return false;
                var lien = fg2.computeFiscalLien(d.id, inter.id);
                return lien === 'enfant';
            });
        });

        if (hasGPDonor && hasParentIntermediary) {
            var gpDonor = ctx.donors.find(function(d) { return d.role === 'grand_parent' || d.role === 'arr_grand_parent'; });
            var parentInter = ctx.intermediaires.find(function(inter) {
                var fg2 = FG();
                if (!fg2) return false;
                return ctx.donors.some(function(d) {
                    if (d.role !== 'grand_parent' && d.role !== 'arr_grand_parent') return false;
                    return fg2.computeFiscalLien(d.id, inter.id) === 'enfant';
                });
            });
            if (gpDonor && parentInter) {
                var benExample = ctx.bens[0];
                var abatDirect = getAbattement('petit_enfant', false);
                var abatIndirect = getAbattement('enfant', false) * 2; // GP→Parent + Parent→Child

                // Check if parent already gave to the child
                var parentDonAnt = 0;
                var po2 = PO();
                if (po2 && po2.getDonorDonationForBenRaw && benExample) {
                    var parentPod = po2.getDonors().find(function(pd) { return pd.nom === parentInter.nom; });
                    if (parentPod) {
                        var raw = po2.getDonorDonationForBenRaw(parentPod.id, benExample.id);
                        if (raw && raw.montant > 0) parentDonAnt = raw.montant;
                    }
                }
                var parentAbatRestant = Math.max(0, getAbattement('enfant', false) - parentDonAnt);

                questions.push({
                    id: 'global-indirect',
                    section: 'strategie',
                    context: 'Donation directe ' + esc(gpDonor.nom) + ' → ' + esc(benExample ? (benExample.prenom || benExample.nom) : '?') + ' : abattement petit-enfant de <strong>' + fmt(abatDirect) + '</strong> seulement. ' +
                        'Mais si ' + esc(gpDonor.nom) + ' donne d\'abord à <strong>' + esc(parentInter.nom) + '</strong> (abattement enfant ' + fmt(getAbattement('enfant', false)) + '), puis ' + esc(parentInter.nom) + ' redonne au bénéficiaire (abattement enfant ' + fmt(parentAbatRestant) + (parentDonAnt > 0 ? ' — ' + fmt(parentDonAnt) + ' déjà donné' : '') + '), on cumule <strong>' + fmt(getAbattement('enfant', false) + parentAbatRestant) + ' d\'abattements</strong>.' +
                        '<br><em>Contrepartie : ' + esc(parentInter.nom) + ' consomme son propre abattement et devient temporairement propriétaire.</em>',
                    text: esc(parentInter.nom) + ' accepterait-il/elle de servir d\'intermédiaire pour cette transmission ?',
                    type: 'qcm',
                    options: [
                        { value: 'oui', label: '✅ Oui, c\'est envisageable', hint: '→ Les résultats intégreront le chemin indirect' },
                        { value: 'non', label: '❌ Non, préférence pour le direct', hint: '→ Seule la donation directe sera proposée' },
                        { value: 'a_discuter', label: '💬 À discuter en famille', hint: '→ On compare les deux options dans les résultats' }
                    ]
                });
            }
        }

        // Q: Transmission progressive vs immédiate
        if (pat.actifNet > 200000) {
            questions.push({
                id: 'global-rythme',
                section: 'strategie',
                context: 'Deux approches possibles : <strong>tout transmettre maintenant</strong> (utilise les abattements en une fois, effet immédiat) ou <strong>transmettre progressivement</strong> (dons manuels réguliers, rachats AV, présents d\'usage — les abattements se rechargent tous les 15 ans). La transmission progressive est souvent plus souple mais moins « efficace » fiscalement si le patrimoine est important.',
                text: 'Quelle approche de transmission correspond le mieux à la situation ?',
                type: 'qcm',
                options: [
                    { value: 'immediat', label: '⚡ Transmettre le maximum maintenant', hint: '→ Utiliser les abattements en une opération' },
                    { value: 'progressif', label: '📅 Transmettre progressivement sur plusieurs années', hint: '→ Rachats AV + dons manuels + présents d\'usage' },
                    { value: 'mixte', label: '🔄 Un peu des deux : une opération principale + des dons réguliers', hint: '→ Donation NP/SCI pour l\'immo + rachats AV pour le financier' }
                ]
            });
        }

        // Q: Global pour chaque bien immo — vision d'ensemble
        if (ctx.immo.length > 1) {
            var immoList = ctx.immo.map(function(im) {
                var usageMap = { rp: 'RP', locatif: 'Locatif', rs: 'Rés. secondaire' };
                return esc(im.label || 'Bien') + ' (' + (usageMap[im.usageActuel] || '?') + ', ' + fmt(im.valeur || 0) + ')';
            }).join(', ');

            questions.push({
                id: 'global-immo-vision',
                section: 'strategie',
                context: 'Le patrimoine immobilier comprend <strong>' + ctx.immo.length + ' biens</strong> : ' + immoList + '. ' +
                    'Quand il y a plusieurs biens immobiliers, les regrouper dans une <strong>SCI</strong> peut simplifier la transmission (un seul acte pour donner les parts) et permettre une décote de ~15%. Mais la SCI a des coûts (création ~2 000 €, comptabilité ~1 100 €/an).',
                text: 'Quel est le projet global pour le patrimoine immobilier ?',
                type: 'qcm',
                options: [
                    { value: 'garder_tous', label: '🏠 Tout garder dans la famille', hint: '→ Donation NP ou SCI pour l\'ensemble' },
                    { value: 'vendre_certains', label: '🏷️ Vendre certains biens', hint: '→ On identifiera lesquels dans les questions par actif' },
                    { value: 'restructurer', label: '🏢 Restructurer (SCI, sortie indivision...)', hint: '→ On évaluera le regroupement en SCI' },
                    { value: 'pas_encore_decide', label: '🤔 Pas encore décidé', hint: '→ On compare toutes les options par bien' }
                ]
            });
        }

        return questions;
    }


    // ================================================================
    // 6. ANALYZE — Point d'entrée
    // ================================================================

    function analyze() {
        var ctx = buildContext();
        var alerts = generateAlerts(ctx);
        var globalQuestions = generateGlobalQuestions(ctx);
        var assetAnalyses = [];

        ctx.immo.forEach(function(im) {
            var a = analyzeImmo(im, ctx);
            if (a.options.length > 0 || (a.questions && a.questions.length > 0) || a.diagnostic) assetAnalyses.push(a);
        });

        ctx.finance.forEach(function(fin) {
            var a = analyzeFinance(fin, ctx);
            if (a.options.length > 0 || (a.questions && a.questions.length > 0) || a.diagnostic) assetAnalyses.push(a);
        });

        return { alerts: alerts, globalQuestions: globalQuestions, assets: assetAnalyses, ctx: ctx };
    }


    // ================================================================
    // 6. RENDER — Affichage dans Step 4
    // ================================================================

    function render() {
        var container = el('strategy-advisor-container');
        if (!container) return;

        var result = analyze();
        var html = '';

        // ── ALERTS (unchanged) ──
        if (result.alerts.length > 0) {
            html += '<div style="margin-bottom:20px;">';
            result.alerts.forEach(function(a) {
                var bg = a.type === 'critical' ? 'rgba(255,107,107,.08)' : a.type === 'warning' ? 'rgba(245,158,11,.06)' : a.type === 'tip' ? 'rgba(16,185,129,.06)' : 'rgba(198,134,66,.04)';
                var border = a.type === 'critical' ? 'rgba(255,107,107,.2)' : a.type === 'warning' ? 'rgba(245,158,11,.15)' : a.type === 'tip' ? 'rgba(16,185,129,.15)' : 'rgba(198,134,66,.1)';
                html += '<div style="padding:12px 16px;border-radius:10px;background:' + bg + ';border:1px solid ' + border + ';margin-bottom:8px;font-size:.78rem;color:var(--text-secondary);line-height:1.7;">';
                html += '<span style="margin-right:6px;">' + a.icon + '</span>' + a.text;
                html += '</div>';
            });
            html += '</div>';
        }

        // ── GLOBAL QUESTIONS (CGP interview) ──
        if (result.globalQuestions && result.globalQuestions.length > 0) {
            // Group by section
            var sections = {};
            result.globalQuestions.forEach(function(q) {
                var sec = q.section || 'general';
                if (!sections[sec]) sections[sec] = [];
                sections[sec].push(q);
            });

            var sectionLabels = {
                comprendre: { icon: '🧑‍💼', title: 'Comprendre la situation', subtitle: 'Ces questions nous aident à comprendre les enjeux avant de proposer des solutions' },
                situation: { icon: '🏠', title: 'Situation personnelle', subtitle: 'Revenus, besoins, autonomie — ce qui détermine les solutions possibles' },
                strategie: { icon: '🎯', title: 'Stratégie patrimoniale', subtitle: 'Comment transmettre : en direct, via un intermédiaire, progressivement...' }
            };

            Object.keys(sections).forEach(function(secKey) {
                var secInfo = sectionLabels[secKey] || { icon: '📋', title: 'Questions', subtitle: '' };
                var secQuestions = sections[secKey];

                html += '<div class="section-card" style="margin-bottom:16px;border-color:rgba(198,134,66,.15);">';
                html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
                html += '<span style="font-size:1.2rem;">' + secInfo.icon + '</span>';
                html += '<div><div style="font-size:.88rem;font-weight:700;color:var(--primary-color);">' + secInfo.title + '</div>';
                html += '<div style="font-size:.68rem;color:var(--text-muted);">' + secInfo.subtitle + '</div></div>';
                html += '</div>';

                secQuestions.forEach(function(q) {
                    html += renderQuestion(q, 'global');
                });

                html += '</div>';
            });
        }

        // ── PER-ASSET CARDS (diagnostic + questions) ──
        if (result.assets.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:var(--text-muted);">';
            html += '<i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:12px;display:block;"></i>';
            html += 'Ajoutez des actifs (immobilier, financier) à l\'étape 3 pour voir les recommandations.';
            html += '</div>';
        }

        if (result.assets.length > 0) {
            html += '<div class="section-card" style="margin-bottom:16px;border-color:rgba(198,134,66,.15);">';
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
            html += '<span style="font-size:1.2rem;">🏦</span>';
            html += '<div><div style="font-size:.88rem;font-weight:700;color:var(--primary-color);">Vos actifs</div>';
            html += '<div style="font-size:.68rem;color:var(--text-muted);">Pour chaque bien ou placement, quelques questions pour affiner la stratégie</div></div>';
            html += '</div>';
        }

        result.assets.forEach(function(asset, idx) {
            var usageMap = { rp: 'Résidence principale', locatif: 'Bien locatif', rs: 'Résidence secondaire', vacant: 'Vacant' };
            var typeIcon = asset.type === 'immo' ? '🏠' : '💰';
            var usageLabel = asset.type === 'immo' ? (usageMap[asset.usage] || '') : '';

            html += '<div style="padding:16px;border-radius:12px;background:rgba(198,134,66,.03);border:1px solid rgba(198,134,66,.08);margin-bottom:12px;">';

            // Header
            html += '<div style="font-size:.88rem;font-weight:700;color:var(--text-primary);margin-bottom:6px;">' + typeIcon + ' ' + esc(asset.label) + '</div>';
            html += '<div style="font-size:.68rem;color:var(--text-muted);margin-bottom:12px;">' + usageLabel + (usageLabel ? ' · ' : '') + fmt(asset.valeur) + '</div>';

            // Expert diagnostic prose
            if (asset.diagnostic) {
                html += '<div style="font-size:.76rem;color:var(--text-secondary);line-height:1.85;margin-bottom:12px;padding:10px 14px;border-radius:8px;background:rgba(198,134,66,.03);border-left:3px solid rgba(198,134,66,.15);">';
                html += asset.diagnostic;
                html += '</div>';
            }

            // Per-asset questions
            if (asset.questions && asset.questions.length > 0) {
                asset.questions.forEach(function(q) {
                    var assetKey = asset.type + '-' + (asset.asset.id || idx);
                    html += renderQuestion(q, assetKey);
                });
            }

            html += '</div>'; // asset card
        });

        if (result.assets.length > 0) {
            html += '</div>'; // close section-card
        }

        // ── DECISIONS SUMMARY ──
        var allQuestions = (result.globalQuestions || []).concat(
            result.assets.reduce(function(arr, a) { return arr.concat(a.questions || []); }, [])
        );
        var totalQ = allQuestions.length;
        var answeredCount = Object.keys(decisions).length;

        if (totalQ > 0) {
            html += '<div style="padding:16px 20px;border-radius:14px;background:linear-gradient(135deg,rgba(198,134,66,.04),rgba(59,130,246,.03));border:1px solid rgba(198,134,66,.1);margin-top:16px;">';

            if (answeredCount === 0) {
                html += '<div style="font-size:.8rem;color:var(--text-muted);text-align:center;">';
                html += '<i class="fas fa-hand-pointer" style="margin-right:6px;color:var(--primary-color);"></i>';
                html += 'Répondez aux questions ci-dessus — vos choix guideront les stratégies présentées dans les résultats.';
                html += '</div>';
            } else {
                html += '<div style="font-size:.82rem;font-weight:700;color:var(--primary-color);margin-bottom:8px;"><i class="fas fa-clipboard-check" style="margin-right:6px;"></i> Vos réponses (' + answeredCount + '/' + totalQ + ')</div>';

                html += '<div style="font-size:.72rem;color:var(--text-secondary);line-height:1.8;">';
                // Show global decisions
                (result.globalQuestions || []).forEach(function(q) {
                    var val = getDecision('global', q.id);
                    if (!val) return;
                    var chosenOpt = (q.options || []).find(function(o) { return o.value === val; });
                    if (chosenOpt) html += '<div>→ ' + chosenOpt.label + '</div>';
                });
                // Show per-asset decisions
                result.assets.forEach(function(asset) {
                    if (!asset.questions) return;
                    asset.questions.forEach(function(q) {
                        var assetKey = asset.type + '-' + asset.asset.id;
                        var val = getDecision(assetKey, q.id);
                        if (!val) return;
                        var chosenOpt = (q.options || []).find(function(o) { return o.value === val; });
                        if (chosenOpt) html += '<div>' + esc(asset.label) + ' → ' + chosenOpt.label + '</div>';
                        else if (val) html += '<div>' + esc(asset.label) + ' → <em>' + esc(val) + '</em></div>';
                    });
                });
                html += '</div>';

                html += '<div style="margin-top:10px;font-size:.7rem;color:var(--text-muted);"><i class="fas fa-arrow-right" style="margin-right:4px;"></i> Cliquez sur "Calculer" pour voir les résultats adaptés à vos choix.</div>';
            }
            html += '</div>';
        }

        container.innerHTML = html;

        // ── AUTO-DERIVE OBJECTIVES from decisions ──
        syncObjectivesFromDecisions();
    }

    /**
     * renderQuestion — Renders a single QCM or text question
     */
    function renderQuestion(q, assetKey) {
        var currentVal = getDecision(assetKey, q.id);
        var html = '';

        html += '<div style="margin-bottom:12px;">';

        // Educational context (the prose that makes you think)
        if (q.context) {
            html += '<div style="font-size:.76rem;color:var(--text-secondary);line-height:1.8;margin-bottom:10px;padding:10px 14px;border-radius:8px;background:rgba(59,130,246,.03);border-left:3px solid rgba(59,130,246,.12);">';
            html += q.context;
            html += '</div>';
        }

        // Question text
        html += '<div style="font-size:.82rem;font-weight:600;color:var(--text-primary);margin-bottom:8px;">';
        html += '<i class="fas fa-question-circle" style="color:#3b82f6;margin-right:6px;font-size:.75rem;"></i>' + q.text;
        html += '</div>';

        if (q.type === 'qcm') {
            html += '<div style="display:grid;gap:6px;">';
            (q.options || []).forEach(function(opt) {
                var isSelected = currentVal === opt.value;
                var bg = isSelected ? 'rgba(16,185,129,.1)' : 'rgba(198,134,66,.03)';
                var border = isSelected ? 'rgba(16,185,129,.3)' : 'rgba(198,134,66,.08)';
                var checkIcon = isSelected ? '<i class="fas fa-check-circle" style="color:var(--accent-green);margin-right:6px;"></i>' : '<i class="far fa-circle" style="color:var(--text-muted);margin-right:6px;opacity:.5;"></i>';

                html += '<div style="padding:8px 12px;border-radius:8px;background:' + bg + ';border:1px solid ' + border + ';cursor:pointer;transition:all .2s;" ';
                html += 'onmouseover="this.style.borderColor=\'rgba(16,185,129,.3)\'" onmouseout="this.style.borderColor=\'' + border + '\'" ';
                html += 'onclick="StrategyAdvisor.decide(\'' + assetKey + '\',\'' + q.id + '\',\'' + opt.value + '\')">';
                html += '<div style="display:flex;align-items:center;gap:8px;">';
                html += checkIcon;
                html += '<div style="flex:1;">';
                html += '<div style="font-size:.76rem;font-weight:' + (isSelected ? '600' : '400') + ';color:var(--text-primary);">' + opt.label + '</div>';
                if (opt.hint) html += '<div style="font-size:.63rem;color:var(--text-muted);margin-top:2px;">' + opt.hint + '</div>';
                html += '</div></div></div>';
            });
            html += '</div>';
        } else if (q.type === 'text') {
            html += '<input type="text" value="' + esc(currentVal || '') + '" placeholder="' + esc(q.placeholder || '') + '" ';
            html += 'style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(198,134,66,.15);background:var(--bg-input);color:var(--text-primary);font-size:.76rem;" ';
            html += 'onchange="StrategyAdvisor.decide(\'' + assetKey + '\',\'' + q.id + '\',this.value)">';
        }

        html += '</div>';
        return html;
    }


    /**
     * syncObjectivesFromDecisions — Auto-set les toggles d'objectifs
     * en fonction des réponses QCM de l'utilisateur
     */
    function syncObjectivesFromDecisions() {
        var s = st();
        var objState = s.obj || {};

        // Scan all decisions by KEY (not just value) for precision
        var keys = Object.keys(decisions);

        // ── Global: donation readiness ──
        keys.forEach(function(k) {
            var val = decisions[k];
            if (k.indexOf('global-testament') >= 0) {
                if (val === 'prudent') { objState.revenus = true; objState.controle = true; }
                if (val === 'non') { /* succession only — no donation objectives */ }
            }
            if (k.indexOf('global-revenus') >= 0) {
                if (val === 'essentiels') objState.revenus = true;
                if (val === 'confortable') { /* more options available */ }
            }
            if (k.indexOf('global-indirect') >= 0) {
                if (val === 'oui' || val === 'a_discuter') objState.generation = true;
            }
            if (k.indexOf('global-rythme') >= 0) {
                // No direct objective mapping — used in Step 5 to filter
            }
            if (k.indexOf('global-immo-vision') >= 0) {
                if (val === 'vendre_certains') objState.vendre = true;
                if (val === 'restructurer') objState.controle = true;
            }
            // Per-asset decisions
            if (k.indexOf('locatif-revenus') >= 0) {
                if (val === 'essentiels' || val === 'complementaires') objState.revenus = true;
            }
            if (k.indexOf('locatif-horizon') >= 0 || k.indexOf('rs-projet') >= 0) {
                if (val === 'vendre_court' || val === 'vendre' || val === 'vendre_long') objState.vendre = true;
            }
            if (k.indexOf('indivision-sortie') >= 0) {
                if (val === 'sci') objState.controle = true;
            }
            if (k.indexOf('rp-intention') >= 0) {
                if (val === 'rester') objState.revenus = true;
            }
        });

        objState.minimiser = true; // always on

        // Update switch UI
        ['minimiser', 'revenus', 'controle', 'conjoint', 'egalite', 'generation', 'vendre'].forEach(function(key) {
            var switchEl = document.getElementById('obj-' + key);
            if (switchEl) {
                if (objState[key]) switchEl.classList.add('on');
                else switchEl.classList.remove('on');
            }
        });
    }


    // ================================================================
    // PUBLIC API
    // ================================================================
    return {
        analyze: analyze,
        render: render,
        buildContext: buildContext,
        decide: setDecision,
        getDecisions: function() { return decisions; }
    };

})();
