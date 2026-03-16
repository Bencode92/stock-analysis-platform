/**
 * ui-enrichments.js — Injecte les champs UI manquants + câble le state
 * 
 * v1.3 — Sync live arbre + rôles → tableau international trié par importance
 *
 * @version 1.3.0 — 2026-03-16
 */
const UIEnrichments = (function() {
    'use strict';

    var _unionTypeStore = {};
    var _personCountryStore = {};
    var _personNationalityStore = {};
    var _treeObserver = null;
    var _rolesObserver = null;
    var _refreshTimer = null;
    var _lastPersonHash = '';

    var PAYS_OPTIONS = [
        ['FR', '\ud83c\uddeb\ud83c\uddf7 France'], ['DE', '\ud83c\udde9\ud83c\uddea Allemagne'], ['BE', '\ud83c\udde7\ud83c\uddea Belgique'], ['ES', '\ud83c\uddea\ud83c\uddf8 Espagne'],
        ['IT', '\ud83c\uddee\ud83c\uddf9 Italie'], ['PT', '\ud83c\uddf5\ud83c\uddf9 Portugal'], ['GB', '\ud83c\uddec\ud83c\udde7 Royaume-Uni'], ['CH', '\ud83c\udde8\ud83c\udded Suisse'],
        ['LU', '\ud83c\uddf1\ud83c\uddfa Luxembourg'], ['NL', '\ud83c\uddf3\ud83c\uddf1 Pays-Bas'], ['SE', '\ud83c\uddf8\ud83c\uddea Su\u00e8de'], ['AT', '\ud83c\udde6\ud83c\uddf9 Autriche'],
        ['GR', '\ud83c\uddec\ud83c\uddf7 Gr\u00e8ce'], ['FI', '\ud83c\uddeb\ud83c\uddee Finlande'], ['BG', '\ud83c\udde7\ud83c\uddec Bulgarie'], ['DK', '\ud83c\udde9\ud83c\uddf0 Danemark'],
        ['IE', '\ud83c\uddee\ud83c\uddea Irlande'], ['MA', '\ud83c\uddf2\ud83c\udde6 Maroc'], ['DZ', '\ud83c\udde9\ud83c\uddff Alg\u00e9rie'],
        ['TN', '\ud83c\uddf9\ud83c\uddf3 Tunisie'], ['TR', '\ud83c\uddf9\ud83c\uddf7 Turquie'], ['US', '\ud83c\uddfa\ud83c\uddf8 \u00c9tats-Unis'],
        ['OTHER', '\ud83c\udf0d Autre']
    ];

    // ============================================================
    // 1. PATCH FamilyGraph
    // ============================================================

    function patchFamilyGraph() {
        if (typeof FamilyGraph === 'undefined') return;

        if (!FamilyGraph.getUnionType) {
            FamilyGraph.getUnionType = function(id1, id2) {
                return _unionTypeStore[id1 + '-' + id2] || _unionTypeStore[id2 + '-' + id1] || 'mariage';
            };
        }

        if (!FamilyGraph.setUnionType) {
            FamilyGraph.setUnionType = function(id1, id2, type) {
                _unionTypeStore[id1 + '-' + id2] = type;
                _unionTypeStore[id2 + '-' + id1] = type;
                var state = SD._getState ? SD._getState() : null;
                if (state) state._unionType = type;
            };
        }

        var _origAddRel = FamilyGraph.addRelation;
        if (_origAddRel && !FamilyGraph._uiEnrichPatched) {
            FamilyGraph.addRelation = function(from, to, type) {
                _origAddRel.call(FamilyGraph, from, to, type);
                if (type === 'spouse') {
                    setTimeout(function() { injectUnionTypeSelector(from, to); }, 300);
                }
            };
            FamilyGraph._uiEnrichPatched = true;
        }
    }

    // ============================================================
    // 2. Type d'union (Step 1)
    // ============================================================

    function injectUnionTypeSelector(id1, id2) {
        var existingSel = document.getElementById('union-type-selector');
        if (existingSel) existingSel.remove();

        var treeSection = document.getElementById('family-persons-list');
        if (!treeSection) return;

        var p1 = FamilyGraph.getPerson ? FamilyGraph.getPerson(id1) : null;
        var p2 = FamilyGraph.getPerson ? FamilyGraph.getPerson(id2) : null;
        var nom1 = p1 ? p1.nom : 'Personne 1';
        var nom2 = p2 ? p2.nom : 'Personne 2';
        var currentType = FamilyGraph.getUnionType ? FamilyGraph.getUnionType(id1, id2) : 'mariage';

        var html = '<div id="union-type-selector" style="padding:14px 18px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.15);margin-top:12px;">';
        html += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:8px;"><i class="fas fa-heart" style="margin-right:6px;"></i>Union de <strong>' + esc(nom1) + '</strong> & <strong>' + esc(nom2) + '</strong></div>';
        html += '<div class="form-grid cols-3"><div class="form-group">';
        html += '<label class="form-label">Type d\'union</label>';
        html += '<select id="select-union-type" onchange="UIEnrichments.onUnionTypeChange(this.value,' + id1 + ',' + id2 + ')" style="border-color:rgba(255,107,107,.25);">';
        html += '<option value="mariage"' + (currentType === 'mariage' ? ' selected' : '') + '>\ud83d\udc8d Mariage</option>';
        html += '<option value="pacs"' + (currentType === 'pacs' ? ' selected' : '') + '>\ud83d\udccb PACS</option>';
        html += '<option value="concubinage"' + (currentType === 'concubinage' ? ' selected' : '') + '>\ud83e\udd1d Concubinage</option>';
        html += '</select></div></div>';
        html += '<div id="union-type-warning" style="margin-top:8px;font-size:.75rem;"></div></div>';

        treeSection.insertAdjacentHTML('afterend', html);
        updateUnionWarning(currentType);
    }

    function onUnionTypeChange(type, id1, id2) {
        if (FamilyGraph.setUnionType) FamilyGraph.setUnionType(id1, id2, type);
        updateUnionWarning(type);
    }

    function updateUnionWarning(type) {
        var el = document.getElementById('union-type-warning');
        if (!el) return;
        var msgs = {
            concubinage: ['rgba(255,107,107,.08)', 'var(--accent-coral)', 'fa-exclamation-triangle', '<strong>Concubinage :</strong> aucun droit successoral. Tax\u00e9 \u00e0 60%. Seule l\'AV est efficace.'],
            pacs: ['rgba(255,179,0,.08)', 'var(--accent-amber)', 'fa-exclamation-triangle', '<strong>PACS :</strong> exon\u00e9r\u00e9 mais AUCUN h\u00e9ritage sans testament ! DDV impossible.'],
            mariage: ['rgba(16,185,129,.06)', 'var(--accent-green)', 'fa-check-circle', '<strong>Mariage :</strong> conjoint exon\u00e9r\u00e9 + h\u00e9ritage automatique + DDV possible.']
        };
        var m = msgs[type] || msgs.mariage;
        el.innerHTML = '<div style="padding:8px 12px;border-radius:8px;background:' + m[0] + ';color:' + m[1] + ';"><i class="fas ' + m[2] + '" style="margin-right:4px;"></i>' + m[3] + '</div>';
    }

    // ============================================================
    // 3. Pays résidence PAR PERSONNE — sync live arbre + rôles
    // ============================================================

    function getPersonHash() {
        // Hash basé sur les personnes + leurs rôles pour détecter tout changement
        var persons = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getPersons) ? FamilyGraph.getPersons() : [];
        return persons.map(function(p) {
            return p.id + ':' + (p.nom || '') + ':' + (p.isDonor ? 'D' : '') + (p.isBen ? 'B' : '');
        }).join('|');
    }

    function scheduleRefreshInternational() {
        if (_refreshTimer) clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(function() {
            var hash = getPersonHash();
            if (hash !== _lastPersonHash) {
                _lastPersonHash = hash;
                injectInternationalFields();
            }
        }, 400);
    }

    function observeFamilyTree() {
        // Observer sur l'arbre visuel
        var treeContainer = document.getElementById('family-persons-list');
        if (treeContainer && !_treeObserver) {
            _treeObserver = new MutationObserver(function() {
                scheduleRefreshInternational();
            });
            _treeObserver.observe(treeContainer, { childList: true, subtree: true, characterData: true });
        }

        // Observer sur les rôles (checkboxes 💰/🎯)
        var rolesContainer = document.getElementById('family-roles-list');
        if (rolesContainer && !_rolesObserver) {
            _rolesObserver = new MutationObserver(function() {
                scheduleRefreshInternational();
            });
            _rolesObserver.observe(rolesContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['checked', 'class'] });

            // Écouter les clics sur les checkboxes de rôle
            rolesContainer.addEventListener('change', function() {
                scheduleRefreshInternational();
            });
            rolesContainer.addEventListener('click', function() {
                // Délai car le FamilyGraph met à jour après le clic
                setTimeout(scheduleRefreshInternational, 200);
            });
        }
    }

    function injectInternationalFields() {
        var rolesSection = document.getElementById('family-roles-list');
        if (!rolesSection) return;

        var existing = document.getElementById('international-fields');
        if (existing) existing.remove();

        var persons = [];
        if (typeof FamilyGraph !== 'undefined' && FamilyGraph.getPersons) {
            persons = FamilyGraph.getPersons();
        }
        _lastPersonHash = getPersonHash();

        if (persons.length === 0) return;

        // Trier : donateurs en premier, puis bénéficiaires, puis les autres
        persons.sort(function(a, b) {
            var scoreA = (a.isDonor ? 0 : a.isBen ? 10 : 20);
            var scoreB = (b.isDonor ? 0 : b.isBen ? 10 : 20);
            return scoreA - scoreB;
        });

        var html = '<div id="international-fields" class="section-card" style="margin-top:12px;border-color:rgba(59,130,246,.15);">';
        html += '<div class="section-title"><i class="fas fa-globe-europe" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Situation internationale</div>';
        html += '<div class="section-subtitle">Pays de r\u00e9sidence et nationalit\u00e9 de chaque membre. Laissez France par d\u00e9faut si pas concern\u00e9.</div>';

        html += '<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(59,130,246,.1);">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:.78rem;">';
        html += '<thead><tr style="background:rgba(59,130,246,.06);">';
        html += '<th style="padding:10px 12px;text-align:left;font-weight:600;">Personne</th>';
        html += '<th style="padding:10px 12px;text-align:left;font-weight:600;">R\u00f4le</th>';
        html += '<th style="padding:10px 12px;text-align:left;font-weight:600;">R\u00e9sidence</th>';
        html += '<th style="padding:10px 12px;text-align:left;font-weight:600;">Nationalit\u00e9</th>';
        html += '</tr></thead><tbody>';

        persons.forEach(function(p) {
            var storedC = _personCountryStore[p.id] || 'FR';
            var storedN = _personNationalityStore[p.id] || 'FR';

            // Badge rôle coloré
            var role = '\u2014';
            var roleBg = 'transparent';
            var roleColor = 'var(--text-muted)';
            if (p.isDonor) { role = '\ud83d\udcb0 Donateur'; roleBg = 'rgba(198,134,66,.1)'; roleColor = 'var(--primary-color)'; }
            else if (p.isBen) { role = '\ud83c\udfaf B\u00e9n\u00e9f.'; roleBg = 'rgba(16,185,129,.1)'; roleColor = 'var(--accent-green)'; }

            var mkSel = function(stored) {
                return PAYS_OPTIONS.map(function(o) {
                    return '<option value="' + o[0] + '"' + (o[0] === stored ? ' selected' : '') + '>' + o[1] + '</option>';
                }).join('');
            };

            html += '<tr style="border-bottom:1px solid rgba(59,130,246,.05);">';
            html += '<td style="padding:8px 12px;font-weight:600;">' + esc(p.nom || 'Sans nom') + (p.age ? ' <span style="color:var(--text-muted);font-weight:400;">(' + p.age + 'a)</span>' : '') + '</td>';
            html += '<td style="padding:8px 12px;"><span style="font-size:.70rem;padding:2px 8px;border-radius:10px;background:' + roleBg + ';color:' + roleColor + ';font-weight:600;">' + role + '</span></td>';
            html += '<td style="padding:6px 8px;"><select style="font-size:.76rem;height:34px;padding:2px 6px;" onchange="UIEnrichments.onPersonCountryChange(' + p.id + ',this.value)">' + mkSel(storedC) + '</select></td>';
            html += '<td style="padding:6px 8px;"><select style="font-size:.76rem;height:34px;padding:2px 6px;" onchange="UIEnrichments.onPersonNationalityChange(' + p.id + ',this.value)">' + mkSel(storedN) + '</select></td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        html += '<div style="margin-top:8px;font-size:.70rem;color:var(--text-muted);"><i class="fas fa-info-circle" style="margin-right:4px;"></i>R\u00e8glement UE 650/2012 : si le d\u00e9funt r\u00e9side hors France, loi du pays de r\u00e9sidence. Option loi fran\u00e7aise par testament (art. 22).</div>';
        html += '</div>';

        rolesSection.closest('.section-card').insertAdjacentHTML('afterend', html);
    }

    function onPersonCountryChange(personId, country) {
        _personCountryStore[personId] = country;
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var donors = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getDonors) ? FamilyGraph.getDonors() : [];
        if (donors.length > 0 && donors[0].id === personId) {
            state._paysResidence = country;
            state._residenceEtranger = country !== 'FR' ? country : null;
        }

        if (typeof FamilyGraph !== 'undefined' && FamilyGraph.spouse) {
            var sp = FamilyGraph.spouse(personId);
            if (sp) {
                var isSpouseDonor = donors.some(function(d) { return d.id === sp.id; });
                if (isSpouseDonor) state._paysConjoint = country;
            }
        }
    }

    function onPersonNationalityChange(personId, nationality) {
        _personNationalityStore[personId] = nationality;
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var donors = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getDonors) ? FamilyGraph.getDonors() : [];
        if (donors.length > 0 && donors[0].id === personId) {
            state._nationalite = nationality;
        }
    }

    // ============================================================
    // 4. Testament (Step 4)
    // ============================================================

    function injectTestamentSwitch() {
        var ddvSwitch = document.getElementById('switch-ddv');
        if (!ddvSwitch || document.getElementById('switch-testament')) return;

        var switchRow = ddvSwitch.closest('.switch-row');
        if (!switchRow) return;

        var html = '<div class="switch-row">';
        html += '<span class="switch-label">Testament d\u00e9j\u00e0 r\u00e9dig\u00e9 ? <span class="info-tip" onclick="this.classList.toggle(\'open\');event.stopPropagation()"><i class="fas fa-info-circle"></i><span class="tip-bubble">OBLIGATOIRE pour les pacs\u00e9s (sinon le partenaire ne re\u00e7oit RIEN). Recommand\u00e9 pour tous.</span></span></span>';
        html += '<div class="switch" id="switch-testament" onclick="SD.toggleSwitch(this);UIEnrichments.onTestamentChange()"></div>';
        html += '</div>';
        switchRow.insertAdjacentHTML('beforebegin', html);
    }

    function onTestamentChange() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var el = document.getElementById('switch-testament');
        state._hasTestament = el ? el.classList.contains('on') : false;
    }

    // ============================================================
    // 5. Bénéficiaires — beau_enfant + isAutreLit
    // ============================================================

    function enrichBeneficiaryOptions() {
        var list = document.getElementById('beneficiaries-list');
        if (!list || list._uiEnrichObserved) return;

        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('list-item')) {
                        enrichBenItem(node);
                    }
                });
            });
        });
        observer.observe(list, { childList: true });
        list._uiEnrichObserved = true;

        list.querySelectorAll('.list-item').forEach(enrichBenItem);
    }

    function enrichBenItem(item) {
        if (item.querySelector('.autre-lit-check')) return;
        var benId = item.dataset.benId;
        if (benId === undefined) {
            var m = item.id.match(/ben-(\d+)/);
            if (m) benId = m[1];
        }
        if (benId === undefined) return;

        var select = item.querySelector('select');
        if (select && !select.querySelector('option[value="beau_enfant"]')) {
            var opt = document.createElement('option');
            opt.value = 'beau_enfant';
            opt.textContent = 'Beau-fils / Belle-fille (enfant du conjoint)';
            var conjOpt = select.querySelector('option[value="conjoint_pacs"]');
            if (conjOpt) conjOpt.insertAdjacentElement('afterend', opt);
            else select.appendChild(opt);
        }

        var formGrid = item.querySelector('.form-grid');
        if (formGrid) {
            var h = '<div class="form-group autre-lit-check" style="margin-top:8px;">';
            h += '<label style="display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--text-secondary);cursor:pointer;">';
            h += '<input type="checkbox" onchange="UIEnrichments.onAutreLitChange(' + benId + ',this.checked)" style="width:16px;height:16px;cursor:pointer;">';
            h += 'Enfant d\'un autre lit</label></div>';
            formGrid.insertAdjacentHTML('afterend', h);
        }
    }

    function onAutreLitChange(benId, checked) {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;
        var ben = state.beneficiaries.find(function(b) { return b.id == benId; });
        if (ben) ben.isAutreLit = checked;
    }

    // ============================================================
    // 6. enrichState avant calcul
    // ============================================================

    function wireGatherInputs() {
        if (typeof SD === 'undefined' || !SD._getState) return;
        var _origCalc = SD.calculateResults;
        SD.calculateResults = function() {
            enrichState();
            _origCalc.call(SD);
        };
    }

    function enrichState() {
        var state = SD._getState ? SD._getState() : null;
        if (!state) return;

        var unionSel = document.getElementById('select-union-type');
        if (unionSel) state._unionType = unionSel.value;

        var donors = (typeof FamilyGraph !== 'undefined' && FamilyGraph.getDonors) ? FamilyGraph.getDonors() : [];
        if (donors.length > 0) {
            var mid = donors[0].id;
            state._paysResidence = _personCountryStore[mid] || 'FR';
            state._residenceEtranger = state._paysResidence !== 'FR' ? state._paysResidence : null;
            state._nationalite = _personNationalityStore[mid] || 'FR';
            var sp = (typeof FamilyGraph !== 'undefined' && FamilyGraph.spouse) ? FamilyGraph.spouse(mid) : null;
            if (sp) state._paysConjoint = _personCountryStore[sp.id] || '';
        }

        var testEl = document.getElementById('switch-testament');
        if (testEl) state._hasTestament = testEl.classList.contains('on');
        var ddvEl = document.getElementById('switch-ddv');
        if (ddvEl) state._hasDDV = ddvEl.classList.contains('on');

        var nbBeaux = 0;
        state.beneficiaries.forEach(function(b) {
            if (b.lien === 'beau_enfant') { b.isBeauEnfant = true; nbBeaux++; }
        });
        state._nbBeauxEnfants = nbBeaux;
        state._hasEnfantsAutreLit = state.beneficiaries.some(function(b) { return b.isAutreLit; });
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ============================================================
    // 7. INIT
    // ============================================================

    function init() {
        patchFamilyGraph();

        var interval = setInterval(function() {
            if (typeof SD === 'undefined') return;

            injectInternationalFields();
            enrichBeneficiaryOptions();
            injectTestamentSwitch();
            observeFamilyTree();
            wireGatherInputs();
            clearInterval(interval);
        }, 1000);

        // Réinjecter quand on change de step
        document.addEventListener('click', function(e) {
            var stepItem = e.target.closest('.step-item');
            if (stepItem) {
                setTimeout(function() {
                    injectInternationalFields();
                    enrichBeneficiaryOptions();
                    injectTestamentSwitch();
                    observeFamilyTree();
                }, 400);
            }
        });

        console.log('[UIEnrichments v1.3] Loaded \u2014 live sync arbre+r\u00f4les \u2194 international');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1200); });
    else setTimeout(init, 1200);

    return {
        onUnionTypeChange: onUnionTypeChange,
        onPaysChange: function() {},
        onPersonCountryChange: onPersonCountryChange,
        onPersonNationalityChange: onPersonNationalityChange,
        onTestamentChange: onTestamentChange,
        onAutreLitChange: onAutreLitChange,
        injectUnionTypeSelector: injectUnionTypeSelector,
        injectInternationalFields: injectInternationalFields,
        enrichState: enrichState
    };
})();
