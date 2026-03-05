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
                if (po && po.getDonorDonationForBenRaw && donor._poId >= 0) {
                    var raw = po.getDonorDonationForBenRaw(donor._poId, ben.id);
                    if (raw && raw.montant > 0) donAnterieures = raw.montant;
                }
                var abatTotal = getAbattement(lien, false);
                var abatRestant = Math.max(0, abatTotal - donAnterieures);

                pairContexts.push({
                    donor: donor, ben: ben, lien: lien,
                    donAnterieures: donAnterieures, abatTotal: abatTotal, abatRestant: abatRestant
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
                alerts.push({ type: 'info', icon: '📋',
                    text: esc(pc.donor.nom) + ' a déjà donné <strong>' + fmt(pc.donAnterieures) + '</strong> à ' + esc(pc.ben.prenom || pc.ben.nom) + '. Abattement ' + formatLien(pc.lien) + ' : reste <strong>' + fmt(pc.abatRestant) + '</strong> sur ' + fmt(pc.abatTotal) + ' (rappel fiscal 15 ans, art. 784 CGI).'
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

    function buildImmoDiagnostic(im, ctx) {
        var d = [];
        var label = esc(im.label || 'Ce bien');
        var val = im.valeur || 0;
        var usage = im.usageActuel || 'rp';
        var structure = im.structure || 'direct';

        // ── Nature du bien ──
        if (usage === 'rp') {
            d.push('<strong>' + label + '</strong> est votre <strong>résidence principale</strong>, estimée à ' + fmt(val) + '.');
            d.push('En tant que RP, ce bien bénéficie d\'un <strong>abattement de 20% en succession</strong> (art. 764 bis CGI) si le conjoint ou un enfant y habite au moment du décès. Il n\'y a <strong>aucune plus-value à la vente</strong>.');

            // Key question
            ctx.donors.forEach(function(donor) {
                if (donor.age >= 80) {
                    d.push('La question clé : <strong>' + esc(donor.nom) + ' souhaite-t-elle continuer à y vivre ?</strong> Si oui, la donation de la nue-propriété permet de transmettre tout en gardant l\'usage du logement. Si un départ en établissement est envisagé, la vente (exonérée de PV) puis le réinvestissement en assurance-vie ou don manuel pourrait être plus pertinent.');
                } else {
                    d.push(esc(donor.nom) + ' occupe ce logement — la donation de la nue-propriété lui permet de <strong>rester chez elle tout en transmettant</strong> à moindre coût fiscal.');
                }
            });

        } else if (usage === 'locatif') {
            var loyer = im.loyerMensuel || 0;
            d.push('<strong>' + label + '</strong> est un <strong>bien locatif</strong> estimé à ' + fmt(val) + (loyer > 0 ? ', générant <strong>' + fmt(loyer) + '/mois</strong> de loyers (' + fmt(loyer * 12) + '/an)' : '') + '.');

            if (loyer > 0) {
                d.push('Ces revenus locatifs sont importants pour le donateur. Le <strong>démembrement</strong> (donation de la NP) permet de transmettre le bien tout en <strong>conservant les loyers</strong> jusqu\'au décès.');
            }

            // Location type
            if (im.typeLocation === 'meuble_longue_duree' || im.typeLocation === 'meuble_courte' || im.typeLocation === 'meuble_saisonnier') {
                d.push('⚠️ Ce bien est en <strong>location meublée</strong>. En cas d\'apport en SCI IR, attention au seuil de 10% de revenus meublés au-delà duquel la SCI risque d\'être <strong>requalifiée en IS</strong>.');
            }

            // PV latente
            if (im.prixAcquisition > 0 && im.prixAcquisition < val) {
                var pv = val - im.prixAcquisition;
                d.push('La <strong>plus-value latente</strong> est estimée à ' + fmt(pv) + '. En cas de vente, elle serait imposée à 36,2% (IR 19% + PS 17,2%) après abattements pour durée de détention. <strong>Donner avant de vendre</strong> purge cette plus-value (le donataire revend à la valeur déclarée dans l\'acte).');
            }

        } else if (usage === 'rs') {
            d.push('<strong>' + label + '</strong> est une <strong>résidence secondaire</strong> estimée à ' + fmt(val) + '.');
            d.push('Contrairement à la RP, la vente d\'une résidence secondaire est <strong>soumise à la plus-value immobilière</strong> (IR 19% + PS 17,2%). La donation avant vente permet de <strong>purger la plus-value</strong>.');
        }

        // ── Structure de détention ──
        if (structure === 'indivision' || (im.owners && im.owners.length > 1)) {
            var ownerNames = (im.owners || []).map(function(o) {
                var name = o.personNom || '';
                if (!name && o.personId) {
                    // Resolve from donors/intermediaries
                    var allP = ctx.donors.concat(ctx.intermediaires || []);
                    var pidStr = String(o.personId);
                    allP.forEach(function(p) {
                        if (p.nom && ('d-' + (p._poId >= 0 ? p._poId : p.id) === pidStr || 'd-' + p.id === pidStr)) name = p.nom;
                    });
                    // Also try FamilyGraph
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
            d.push('');
            d.push('Ce bien est détenu en <strong>indivision</strong> entre ' + ownerNames + '. L\'indivision complique la transmission : chaque indivisaire ne peut donner que <strong>sa propre quote-part</strong>. Deux options :');
            d.push('→ <em>Sortir de l\'indivision</em> d\'abord (rachat de parts, partage notarié, vente), puis transmettre la pleine propriété');
            d.push('→ <em>Donner la quote-part en l\'état</em> (possible mais le nu-propriétaire sera en indivision avec les autres — moins souple)');
        } else if (structure === 'demembre') {
            d.push('Ce bien est déjà <strong>démembré</strong>. Seul l\'usufruit ou la nue-propriété peut être transmis selon la position du donateur.');
        } else if (structure === 'sci_ir' || structure === 'sci_is') {
            d.push('Ce bien est détenu via une <strong>SCI</strong>. La transmission se fera par donation des parts sociales (avec décote d\'illiquidité ~15%).');
        }

        // ── Âge et démembrement ──
        ctx.donors.forEach(function(donor) {
            // Check if this donor owns this asset
            var owns = !im.owners || im.owners.length === 0 || im.owners.some(function(o) {
                return o.personNom === donor.nom || String(o.personId) === 'd-' + (donor._poId >= 0 ? donor._poId : donor.id);
            });
            if (!owns) return;

            var npR = getNPRatio(donor.age);
            d.push('');
            d.push('À <strong>' + donor.age + ' ans</strong>, la nue-propriété représente <strong>' + Math.round(npR * 100) + '%</strong> de la valeur (barème art. 669 CGI). ' +
                (npR >= 0.8 ? 'C\'est un ratio élevé — l\'avantage du démembrement est limité par l\'âge avancé. ' : '') +
                (npR <= 0.5 ? 'Le démembrement est très avantageux à cet âge : les droits portent sur seulement ' + Math.round(npR * 100) + '% de la valeur. ' : '') +
                'L\'usufruit (' + Math.round((1 - npR) * 100) + '%) permet de conserver ' + (usage === 'locatif' ? 'les loyers' : 'l\'usage du bien') + '.');
        });

        return d.join(' ');
    }

    function buildFinanceDiagnostic(fin, ctx) {
        var d = [];
        var cap = fin.valeur || 0;
        var FISC = ctx.FISC;

        // Find owner among donors
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

        if (fin.type === 'assurance_vie') {
            var isAvant70 = donorAge < 70 || (fin.ageVersement && fin.ageVersement < 70);

            d.push('Ce <strong>contrat d\'assurance-vie</strong> d\'une valeur de ' + fmt(cap) + ' est souscrit par ' + esc(donor ? donor.nom : '?') + '.');

            if (isAvant70) {
                d.push('Les primes ont été versées <strong>avant 70 ans</strong> → régime fiscal de l\'<strong>art. 990 I</strong> : abattement de <strong>' + fmt(FISC.av990I.abattement) + ' par bénéficiaire</strong>, puis 20% jusqu\'à ' + fmt(FISC.av990I.seuil2) + ' et 31,25% au-delà. C\'est le régime le plus favorable.');

                if (cap > FISC.av990I.abattement) {
                    d.push('Le capital (' + fmt(cap) + ') <strong>dépasse l\'abattement</strong> de ' + fmt(FISC.av990I.abattement) + '. Au-delà de ce seuil, un <strong>contrat de capitalisation démembré</strong> (donation de la NP) peut être fiscalement plus avantageux : les droits portent sur la nue-propriété seulement (' + Math.round(getNPRatio(donorAge) * 100) + '% à ' + donorAge + ' ans), avec l\'antériorité fiscale conservée.');
                } else {
                    d.push('Le capital reste <strong>sous l\'abattement</strong> de ' + fmt(FISC.av990I.abattement) + ' → au décès, le bénéficiaire recevra le capital <strong>en franchise de droits</strong>. C\'est la situation idéale — conservez ce contrat.');
                }
            } else {
                d.push('Le souscripteur ayant <strong>plus de 70 ans</strong>, les primes versées relèvent de l\'<strong>art. 757 B</strong> : abattement global de seulement <strong>' + fmt(FISC.av757B.abattementGlobal) + '</strong> (partagé entre tous les bénéficiaires), puis barème de droit commun.');
                d.push('<strong>Point positif :</strong> les intérêts et plus-values acquis depuis la souscription sont <strong>totalement exonérés</strong>. Seules les primes versées sont taxées.');
                d.push('');
                d.push('<strong>Stratégie à envisager :</strong> plutôt que de laisser le capital en AV (757B = peu d\'abattement), effectuez des <strong>rachats partiels annuels</strong> de ' + fmt(4600) + ' (exonérés d\'IR après 8 ans, art. 125-0 A CGI). Les sommes rachetées peuvent être transmises via <strong>don manuel</strong> (dans la limite des abattements disponibles) ou en <strong>présent d\'usage</strong> (anniversaire, Noël — non rapportable si proportionné au patrimoine).');

                if (cap > 100000) {
                    d.push('');
                    d.push('Avec ' + fmt(cap) + ' en AV, une <strong>alternative sérieuse</strong> est le <strong>contrat de capitalisation</strong> : souscrire un capi, y transférer le capital, puis donner la nue-propriété. Les droits portent sur ' + Math.round(getNPRatio(donorAge) * 100) + '% seulement, et le quasi-usufruit permet de continuer à utiliser le capital. La créance de restitution sera déductible de la succession.');
                }
            }

            // Clause bénéficiaire
            if (fin.avBeneficiaires && fin.avBeneficiaires.length > 0) {
                var benNames = fin.avBeneficiaires.map(function(b) { return (b.person ? b.person.prenom || b.person.nom : '?') + ' (' + (b.pct || '?') + '%)'; }).join(', ');
                d.push('');
                d.push('Clause bénéficiaire actuelle : ' + benNames + '. Vérifiez qu\'elle correspond à vos souhaits de transmission.');
            } else {
                d.push('');
                d.push('⚠️ <strong>Clause bénéficiaire non définie</strong> dans l\'outil. Vérifiez votre contrat — c\'est elle qui détermine qui reçoit le capital au décès.');
            }

        } else if (fin.type === 'contrat_capi') {
            d.push('Ce <strong>contrat de capitalisation</strong> d\'une valeur de ' + fmt(cap) + ' peut être transmis par <strong>donation de la nue-propriété</strong>.');
            d.push('Avantages spécifiques du capi vs l\'AV : l\'<strong>antériorité fiscale est conservée</strong> (pas de purge des PV au décès), et le <strong>quasi-usufruit</strong> est possible : le donateur continue d\'utiliser le capital, et la créance de restitution sera <strong>déductible de l\'actif successoral</strong>.');
            d.push('À ' + donorAge + ' ans, la NP = ' + Math.round(getNPRatio(donorAge) * 100) + '% → droits calculés sur ' + fmt(Math.round(cap * getNPRatio(donorAge))) + ' au lieu de ' + fmt(cap) + '.');

        } else if (fin.type === 'pea' || fin.type === 'pea_pme') {
            d.push('Le <strong>PEA</strong> de ' + fmt(cap) + ' ne peut pas être transmis par donation (le PEA est personnel et intransmissible du vivant). Au décès, il est clôturé et les gains sont exonérés d\'IR (seuls les prélèvements sociaux s\'appliquent). Le capital entre dans la succession.');
            d.push('Stratégie : si vous souhaitez transmettre les liquidités, effectuez un <strong>retrait du PEA</strong> (exonéré d\'IR après 5 ans) puis transmettez via don manuel ou réinvestissez en AV/capi.');

        } else if (fin.type === 'cto') {
            d.push('Le <strong>compte-titres</strong> de ' + fmt(cap) + ' peut être transmis par donation. La donation <strong>purge la plus-value latente</strong> (le donataire acquiert les titres à leur valeur au jour de la donation). C\'est un avantage significatif si les titres ont fortement augmenté.');

        } else {
            d.push('Placement financier de ' + fmt(cap) + '.');
        }

        return d.join(' ');
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
            diagnostic: '' // Expert narrative
        };

        if (result.valeur <= 0) return result;

        var FISC = ctx.FISC;

        // ── BUILD EXPERT DIAGNOSTIC ──
        result.diagnostic = buildImmoDiagnostic(im, ctx);

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

        // Sort options: lowest droits first
        result.options.sort(function(a, b) { return a.droits - b.droits; });
        if (result.options.length > 0) {
            result.options[0].isBest = true;
            result.options[0].rank = 0;
        }

        return result;
    }


    // ================================================================
    // 4. FINANCE OPTIONS — Options par actif financier
    // ================================================================

    function analyzeFinance(fin, ctx) {
        var result = {
            asset: fin, type: 'finance',
            label: fin.type === 'assurance_vie' ? 'Assurance-vie' : fin.type === 'contrat_capi' ? 'Contrat de capitalisation' : fin.type === 'pea' ? 'PEA' : 'Placement financier',
            valeur: fin.valeur || 0,
            options: [], alerts: [],
            diagnostic: ''
        };

        if (result.valeur <= 0) return result;

        // Expert diagnostic
        result.diagnostic = buildFinanceDiagnostic(fin, ctx);

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

        // Sort and mark best
        result.options.sort(function(a, b) { return a.droits - b.droits; });
        if (result.options.length > 0) result.options[0].isBest = true;

        return result;
    }


    // ================================================================
    // 5. ANALYZE — Point d'entrée
    // ================================================================

    function analyze() {
        var ctx = buildContext();
        var alerts = generateAlerts(ctx);
        var assetAnalyses = [];

        ctx.immo.forEach(function(im) {
            var a = analyzeImmo(im, ctx);
            if (a.options.length > 0) assetAnalyses.push(a);
        });

        ctx.finance.forEach(function(fin) {
            var a = analyzeFinance(fin, ctx);
            if (a.options.length > 0) assetAnalyses.push(a);
        });

        return { alerts: alerts, assets: assetAnalyses, ctx: ctx };
    }


    // ================================================================
    // 6. RENDER — Affichage dans Step 4
    // ================================================================

    function render() {
        var container = el('strategy-advisor-container');
        if (!container) return;

        var result = analyze();
        var html = '';

        // ── ALERTS ──
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

        // ── ASSET CARDS ──
        if (result.assets.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:var(--text-muted);">';
            html += '<i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:12px;display:block;"></i>';
            html += 'Ajoutez des actifs (immobilier, financier) à l\'étape 3 pour voir les recommandations.';
            html += '</div>';
        }

        result.assets.forEach(function(asset, idx) {
            var usageMap = { rp: 'Résidence principale', locatif: 'Bien locatif', rs: 'Résidence secondaire', vacant: 'Vacant' };
            var typeIcon = asset.type === 'immo' ? '🏠' : '💰';
            var usageLabel = asset.type === 'immo' ? (usageMap[asset.usage] || '') : '';

            html += '<div class="section-card" style="margin-bottom:16px;border-color:rgba(198,134,66,.15);">';

            // Header
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">';
            html += '<div>';
            html += '<div style="font-size:.92rem;font-weight:700;color:var(--text-primary);">' + typeIcon + ' ' + esc(asset.label) + '</div>';
            html += '<div style="font-size:.68rem;color:var(--text-muted);">' + usageLabel + (usageLabel ? ' · ' : '') + fmt(asset.valeur) + '</div>';
            html += '</div>';
            if (asset.options.length > 0 && asset.options[0].isBest) {
                html += '<div style="text-align:right;">';
                html += '<div style="font-size:.58rem;color:var(--text-muted);">Recommandé</div>';
                html += '<div style="font-size:.78rem;font-weight:700;color:var(--accent-green);">' + asset.options[0].icon + ' ' + esc(asset.options[0].name.split('—')[0].trim()) + '</div>';
                html += '</div>';
            }
            html += '</div>';

            // Expert diagnostic
            if (asset.diagnostic) {
                html += '<div style="padding:14px 18px;border-radius:10px;background:rgba(198,134,66,.04);border-left:3px solid rgba(198,134,66,.2);margin-bottom:14px;font-size:.78rem;color:var(--text-secondary);line-height:1.85;">';
                html += asset.diagnostic;
                html += '</div>';
            }

            // Options
            asset.options.forEach(function(opt, oi) {
                var bg = opt.isBest ? 'rgba(16,185,129,.06)' : opt.isWorst ? 'rgba(255,107,107,.04)' : 'rgba(198,134,66,.02)';
                var border = opt.isBest ? 'rgba(16,185,129,.2)' : opt.isWorst ? 'rgba(255,107,107,.12)' : 'rgba(198,134,66,.06)';

                html += '<div style="padding:14px 16px;border-radius:10px;background:' + bg + ';border:1px solid ' + border + ';margin-bottom:8px;cursor:pointer;" onclick="this.querySelector(\'.sa-details\').style.display=this.querySelector(\'.sa-details\').style.display===\'none\'?\'\':\'none\'">';

                // Row 1
                html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">';
                html += '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px;">';
                html += '<span style="font-size:1rem;">' + opt.icon + '</span>';
                html += '<div>';
                html += '<div style="font-size:.8rem;font-weight:600;color:var(--text-primary);">' + esc(opt.name.split('—')[0].trim());
                if (opt.isBest) html += ' <span style="font-size:.58rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.15);color:var(--accent-green);">🏆 RECOMMANDÉ</span>';
                html += '</div>';
                html += '<div style="font-size:.62rem;color:var(--text-muted);">' + opt.timing + '</div>';
                html += '</div></div>';

                // Metrics
                html += '<div style="display:flex;gap:14px;align-items:center;">';
                html += '<div style="text-align:center;"><div style="font-size:.55rem;color:var(--text-muted);">Droits</div><div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);">' + fmt(opt.droits) + '</div></div>';
                html += '<div style="text-align:center;"><div style="font-size:.55rem;color:var(--text-muted);">Net transmis</div><div style="font-size:.88rem;font-weight:800;color:' + (opt.isBest ? 'var(--accent-green)' : 'var(--text-primary)') + ';">' + fmt(opt.net) + '</div></div>';
                html += '</div></div>';

                // Expandable details
                html += '<div class="sa-details" style="display:' + (opt.isBest ? '' : 'none') + ';margin-top:10px;padding-top:10px;border-top:1px solid rgba(198,134,66,.08);">';
                html += '<div style="font-size:.75rem;color:var(--text-secondary);line-height:1.8;margin-bottom:8px;">' + opt.explain + '</div>';

                if (opt.advantages && opt.advantages.length > 0) {
                    html += '<div style="font-size:.68rem;color:var(--accent-green);margin-bottom:4px;">';
                    opt.advantages.forEach(function(a) { html += '<div>✅ ' + a + '</div>'; });
                    html += '</div>';
                }
                if (opt.risks && opt.risks.length > 0) {
                    html += '<div style="font-size:.68rem;color:var(--accent-coral);">';
                    opt.risks.forEach(function(r) { html += '<div>⚠️ ' + r + '</div>'; });
                    html += '</div>';
                }
                if (opt.fraisAn > 0) {
                    html += '<div style="font-size:.65rem;color:var(--text-muted);margin-top:4px;">Frais annuels récurrents : ' + fmt(opt.fraisAn) + '</div>';
                }

                html += '</div>'; // sa-details
                html += '</div>'; // option card
            });

            html += '</div>'; // section-card
        });

        container.innerHTML = html;
    }


    // ================================================================
    // PUBLIC API
    // ================================================================
    return {
        analyze: analyze,
        render: render,
        buildContext: buildContext
    };

})();
