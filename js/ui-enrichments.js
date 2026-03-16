/**
 * ui-enrichments.js v1.6 — Fix: polling pour menu contextuel (élément recréé à chaque render)
 * @version 1.6.0 — 2026-03-16
 */
const UIEnrichments = (function() {
    'use strict';

    var _unionTypeStore = {}, _regimeStore = {}, _personCountryStore = {}, _personNationalityStore = {};
    var _treeObserver = null, _rolesObserver = null, _refreshTimer = null, _lastPersonHash = '';

    var PAYS_OPTIONS = [
        ['FR','\ud83c\uddeb\ud83c\uddf7 France'],['DE','\ud83c\udde9\ud83c\uddea Allemagne'],['BE','\ud83c\udde7\ud83c\uddea Belgique'],['ES','\ud83c\uddea\ud83c\uddf8 Espagne'],
        ['IT','\ud83c\uddee\ud83c\uddf9 Italie'],['PT','\ud83c\uddf5\ud83c\uddf9 Portugal'],['GB','\ud83c\uddec\ud83c\udde7 Royaume-Uni'],['CH','\ud83c\udde8\ud83c\udded Suisse'],
        ['LU','\ud83c\uddf1\ud83c\uddfa Luxembourg'],['NL','\ud83c\uddf3\ud83c\uddf1 Pays-Bas'],['SE','\ud83c\uddf8\ud83c\uddea Su\u00e8de'],['AT','\ud83c\udde6\ud83c\uddf9 Autriche'],
        ['GR','\ud83c\uddec\ud83c\uddf7 Gr\u00e8ce'],['FI','\ud83c\uddeb\ud83c\uddee Finlande'],['BG','\ud83c\udde7\ud83c\uddec Bulgarie'],['DK','\ud83c\udde9\ud83c\uddf0 Danemark'],
        ['IE','\ud83c\uddee\ud83c\uddea Irlande'],['MA','\ud83c\uddf2\ud83c\udde6 Maroc'],['DZ','\ud83c\udde9\ud83c\uddff Alg\u00e9rie'],
        ['TN','\ud83c\uddf9\ud83c\uddf3 Tunisie'],['TR','\ud83c\uddf9\ud83c\uddf7 Turquie'],['US','\ud83c\uddfa\ud83c\uddf8 \u00c9tats-Unis'],['OTHER','\ud83c\udf0d Autre']
    ];
    var UNION_TYPES = [['mariage','\ud83d\udc8d Mariage'],['pacs','\ud83d\udccb PACS'],['concubinage','\ud83e\udd1d Concubinage']];
    var REGIMES = [['communaute_acquets','Communaut\u00e9 acqu\u00eats'],['communaute_universelle','Communaut\u00e9 universelle'],
        ['separation_biens','S\u00e9paration de biens'],['participation_acquets','Participation acqu\u00eats']];

    // ============ 1. PATCH FamilyGraph ============
    function patchFamilyGraph() {
        if (typeof FamilyGraph === 'undefined') return;
        if (!FamilyGraph.getUnionType) {
            FamilyGraph.getUnionType = function(a,b) { return _unionTypeStore[a+'-'+b]||_unionTypeStore[b+'-'+a]||'mariage'; };
        }
        if (!FamilyGraph.setUnionType) {
            FamilyGraph.setUnionType = function(a,b,t) {
                _unionTypeStore[a+'-'+b]=t; _unionTypeStore[b+'-'+a]=t;
                var s=SD._getState?SD._getState():null; if(s)s._unionType=t;
            };
        }
        var _orig = FamilyGraph.addRelation;
        if (_orig && !FamilyGraph._uiEnrichPatched) {
            FamilyGraph.addRelation = function(f,t,ty) { _orig.call(FamilyGraph,f,t,ty); if(ty==='spouse') setTimeout(function(){injectUnionTypeSelector(f,t);},300); };
            FamilyGraph._uiEnrichPatched = true;
        }
    }

    // ============ 2. Bloc union sous l'arbre ============
    function injectUnionTypeSelector(id1, id2) {
        var ex = document.getElementById('union-type-selector'); if(ex) ex.remove();
        var tree = document.getElementById('family-persons-list'); if(!tree) return;
        var p1 = FamilyGraph.getPerson?FamilyGraph.getPerson(id1):null;
        var p2 = FamilyGraph.getPerson?FamilyGraph.getPerson(id2):null;
        var ct = FamilyGraph.getUnionType?FamilyGraph.getUnionType(id1,id2):'mariage';
        var cr = _regimeStore[id1+'-'+id2]||_regimeStore[id2+'-'+id1]||'communaute_acquets';
        var uO = UNION_TYPES.map(function(u){return '<option value="'+u[0]+'"'+(u[0]===ct?' selected':'')+'>'+u[1]+'</option>';}).join('');
        var rO = REGIMES.map(function(r){return '<option value="'+r[0]+'"'+(r[0]===cr?' selected':'')+'>'+r[1]+'</option>';}).join('');
        var h = '<div id="union-type-selector" style="padding:14px 18px;border-radius:12px;background:rgba(255,107,107,.04);border:1px solid rgba(255,107,107,.15);margin-top:12px;">';
        h += '<div style="font-size:.82rem;font-weight:700;color:var(--accent-coral);margin-bottom:10px;"><i class="fas fa-heart" style="margin-right:6px;"></i>Union de <strong>'+esc((p1||{}).nom||'?')+'</strong> & <strong>'+esc((p2||{}).nom||'?')+'</strong></div>';
        h += '<div class="form-grid"><div class="form-group"><label class="form-label">Type d\'union</label>';
        h += '<select id="select-union-type" onchange="UIEnrichments.onUnionTypeChange(this.value,'+id1+','+id2+')" style="border-color:rgba(255,107,107,.25);">'+uO+'</select></div>';
        h += '<div class="form-group" id="regime-group"><label class="form-label">R\u00e9gime matrimonial</label>';
        h += '<select id="select-regime-union" onchange="UIEnrichments.onRegimeChange(this.value,'+id1+','+id2+')" style="border-color:rgba(255,107,107,.25);">'+rO+'</select></div></div>';
        h += '<div id="union-type-warning" style="margin-top:8px;font-size:.75rem;"></div></div>';
        tree.insertAdjacentHTML('afterend', h);
        updateUnionWarning(ct); toggleRegimeVisibility(ct);
    }
    function onUnionTypeChange(t,a,b) { if(FamilyGraph.setUnionType)FamilyGraph.setUnionType(a,b,t); updateUnionWarning(t); toggleRegimeVisibility(t); }
    function onRegimeChange(r,a,b) {
        _regimeStore[a+'-'+b]=r; _regimeStore[b+'-'+a]=r;
        var el=document.getElementById('regime-matrimonial'); if(el) el.value=r;
        var s=SD._getState?SD._getState():null; if(s) s.regime=r;
    }
    function toggleRegimeVisibility(t) { var g=document.getElementById('regime-group'); if(g) g.style.display=t==='mariage'?'':'none'; }
    function updateUnionWarning(t) {
        var el=document.getElementById('union-type-warning'); if(!el) return;
        var m={concubinage:['rgba(255,107,107,.08)','var(--accent-coral)','fa-exclamation-triangle','<strong>Concubinage :</strong> 0 droit successoral. 60%. Seule l\'AV est efficace.'],
            pacs:['rgba(255,179,0,.08)','var(--accent-amber)','fa-exclamation-triangle','<strong>PACS :</strong> exon\u00e9r\u00e9 mais 0 h\u00e9ritage sans testament. DDV impossible.'],
            mariage:['rgba(16,185,129,.06)','var(--accent-green)','fa-check-circle','<strong>Mariage :</strong> conjoint exon\u00e9r\u00e9 + h\u00e9ritage auto + DDV possible.']};
        var v=m[t]||m.mariage;
        el.innerHTML='<div style="padding:8px 12px;border-radius:8px;background:'+v[0]+';color:'+v[1]+';font-size:.78rem;line-height:1.5;"><i class="fas '+v[2]+'" style="margin-right:4px;"></i>'+v[3]+'</div>';
    }

    // ============ 3. MENU CONTEXTUEL — Polling (élément recréé à chaque render) ============
    function startCtxMenuPolling() {
        setInterval(function() {
            var ctx = document.getElementById('ft-ctx');
            if (!ctx || ctx.style.display === 'none' || ctx.innerHTML.trim() === '') return;
            if (ctx.querySelector('.uie-union-section')) return; // déjà enrichi
            // Extraire le pid depuis SD.editNode(pid) dans le menu
            var match = ctx.innerHTML.match(/SD\.editNode\((\d+)\)/);
            if (!match) return;
            var pid = parseInt(match[1]);
            if (typeof FamilyGraph === 'undefined' || !FamilyGraph.spouse) return;
            var sp = FamilyGraph.spouse(pid);
            if (!sp) return; // Pas de conjoint → pas d'options union
            enrichContextMenu(ctx, pid, sp);
        }, 150);
    }

    function enrichContextMenu(ctx, pid, sp) {
        var id1=pid, id2=sp.id;
        var currentType = FamilyGraph.getUnionType?FamilyGraph.getUnionType(id1,id2):'mariage';
        var currentRegime = _regimeStore[id1+'-'+id2]||_regimeStore[id2+'-'+id1]||'communaute_acquets';
        var spNom = sp.nom||'Conjoint';

        var h = '<div class="uie-union-section"><div class="ft-ctx-sep"></div>';
        h += '<div style="padding:6px 12px;font-size:.58rem;font-weight:700;color:var(--accent-coral);text-transform:uppercase;letter-spacing:.05em;">\u2764\ufe0f Union avec '+esc(spNom)+'</div>';
        UNION_TYPES.forEach(function(u) {
            var a=u[0]===currentType;
            h += '<div class="ft-ctx-item" onclick="UIEnrichments.setUnionFromCtx(\''+u[0]+'\','+id1+','+id2+');event.stopPropagation();" style="'+(a?'background:rgba(255,107,107,.08);color:var(--accent-coral);font-weight:600;':'')+'">';
            h += '<i class="fas '+(a?'fa-check-circle':'fa-circle')+'" style="font-size:.5rem;'+(a?'color:var(--accent-coral);':'')+'"></i> '+u[1]+'</div>';
        });
        if (currentType === 'mariage') {
            h += '<div class="ft-ctx-sep"></div>';
            h += '<div style="padding:6px 12px;font-size:.58rem;font-weight:700;color:var(--primary-color);text-transform:uppercase;letter-spacing:.05em;">\u2696\ufe0f R\u00e9gime</div>';
            REGIMES.forEach(function(r) {
                var a=r[0]===currentRegime;
                h += '<div class="ft-ctx-item" onclick="UIEnrichments.setRegimeFromCtx(\''+r[0]+'\','+id1+','+id2+');event.stopPropagation();" style="'+(a?'background:rgba(198,134,66,.08);color:var(--primary-color);font-weight:600;':'')+'">';
                h += '<i class="fas '+(a?'fa-check-circle':'fa-circle')+'" style="font-size:.5rem;'+(a?'color:var(--primary-color);':'')+'"></i> '+r[1]+'</div>';
            });
        }
        h += '</div>';
        var danger = ctx.querySelector('.ft-ctx-danger');
        if (danger) { var ps=danger.previousElementSibling; if(ps)ps.insertAdjacentHTML('beforebegin',h); else danger.insertAdjacentHTML('beforebegin',h); }
        else ctx.insertAdjacentHTML('beforeend',h);
    }

    function setUnionFromCtx(t,a,b) {
        if(FamilyGraph.setUnionType)FamilyGraph.setUnionType(a,b,t);
        var sel=document.getElementById('select-union-type'); if(sel) sel.value=t;
        updateUnionWarning(t); toggleRegimeVisibility(t);
        if(typeof SD!=='undefined'&&SD.closeCtx) SD.closeCtx();
        injectUnionTypeSelector(a,b);
    }
    function setRegimeFromCtx(r,a,b) {
        _regimeStore[a+'-'+b]=r; _regimeStore[b+'-'+a]=r;
        var el=document.getElementById('regime-matrimonial'); if(el) el.value=r;
        var sl=document.getElementById('select-regime-union'); if(sl) sl.value=r;
        var s=SD._getState?SD._getState():null; if(s) s.regime=r;
        if(typeof SD!=='undefined'&&SD.closeCtx) SD.closeCtx();
    }

    // ============ 4. Pays résidence PAR PERSONNE ============
    function getPersonHash() {
        var p=(typeof FamilyGraph!=='undefined'&&FamilyGraph.getPersons)?FamilyGraph.getPersons():[];
        return p.map(function(x){return x.id+':'+(x.nom||'')+':'+(x.isDonor?'D':'')+(x.isBen?'B':'');}).join('|');
    }
    function scheduleRefreshInternational() {
        if(_refreshTimer) clearTimeout(_refreshTimer);
        _refreshTimer=setTimeout(function(){var h=getPersonHash();if(h!==_lastPersonHash){_lastPersonHash=h;injectInternationalFields();}},400);
    }
    function observeFamilyTree() {
        var tree=document.getElementById('family-persons-list');
        if(tree&&!_treeObserver){_treeObserver=new MutationObserver(function(){scheduleRefreshInternational();});_treeObserver.observe(tree,{childList:true,subtree:true,characterData:true});}
        var roles=document.getElementById('family-roles-list');
        if(roles&&!_rolesObserver){_rolesObserver=new MutationObserver(function(){scheduleRefreshInternational();});_rolesObserver.observe(roles,{childList:true,subtree:true,attributes:true,attributeFilter:['checked','class']});
        roles.addEventListener('change',function(){scheduleRefreshInternational();});roles.addEventListener('click',function(){setTimeout(scheduleRefreshInternational,200);});}
    }
    function injectInternationalFields() {
        var rs=document.getElementById('family-roles-list'); if(!rs) return;
        var ex=document.getElementById('international-fields'); if(ex) ex.remove();
        var persons=(typeof FamilyGraph!=='undefined'&&FamilyGraph.getPersons)?FamilyGraph.getPersons():[]; _lastPersonHash=getPersonHash();
        if(persons.length===0) return;
        persons.sort(function(a,b){return (a.isDonor?0:a.isBen?10:20)-(b.isDonor?0:b.isBen?10:20);});
        var h='<div id="international-fields" class="section-card" style="margin-top:12px;border-color:rgba(59,130,246,.15);">';
        h+='<div class="section-title"><i class="fas fa-globe-europe" style="background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(59,130,246,.1));color:var(--accent-blue);"></i> Situation internationale</div>';
        h+='<div class="section-subtitle">Pays de r\u00e9sidence et nationalit\u00e9 de chaque membre. Laissez France par d\u00e9faut.</div>';
        h+='<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(59,130,246,.1);"><table style="width:100%;border-collapse:collapse;font-size:.78rem;"><thead><tr style="background:rgba(59,130,246,.06);">';
        h+='<th style="padding:10px 12px;text-align:left;font-weight:600;">Personne</th><th style="padding:10px 12px;text-align:left;font-weight:600;">R\u00f4le</th>';
        h+='<th style="padding:10px 12px;text-align:left;font-weight:600;">R\u00e9sidence</th><th style="padding:10px 12px;text-align:left;font-weight:600;">Nationalit\u00e9</th></tr></thead><tbody>';
        persons.forEach(function(p){
            var sC=_personCountryStore[p.id]||'FR',sN=_personNationalityStore[p.id]||'FR';
            var role='\u2014',rBg='transparent',rC='var(--text-muted)';
            if(p.isDonor){role='\ud83d\udcb0 Donateur';rBg='rgba(198,134,66,.1)';rC='var(--primary-color)';}
            else if(p.isBen){role='\ud83c\udfaf B\u00e9n\u00e9f.';rBg='rgba(16,185,129,.1)';rC='var(--accent-green)';}
            var mk=function(st){return PAYS_OPTIONS.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===st?' selected':'')+'>'+o[1]+'</option>';}).join('');};
            h+='<tr style="border-bottom:1px solid rgba(59,130,246,.05);">';
            h+='<td style="padding:8px 12px;font-weight:600;">'+esc(p.nom||'Sans nom')+(p.age?' <span style="color:var(--text-muted);font-weight:400;">('+p.age+'a)</span>':'')+'</td>';
            h+='<td style="padding:8px 12px;"><span style="font-size:.70rem;padding:2px 8px;border-radius:10px;background:'+rBg+';color:'+rC+';font-weight:600;">'+role+'</span></td>';
            h+='<td style="padding:6px 8px;"><select style="font-size:.76rem;height:34px;padding:2px 6px;" onchange="UIEnrichments.onPersonCountryChange('+p.id+',this.value)">'+mk(sC)+'</select></td>';
            h+='<td style="padding:6px 8px;"><select style="font-size:.76rem;height:34px;padding:2px 6px;" onchange="UIEnrichments.onPersonNationalityChange('+p.id+',this.value)">'+mk(sN)+'</select></td></tr>';
        });
        h+='</tbody></table></div>';
        h+='<div style="margin-top:8px;font-size:.70rem;color:var(--text-muted);"><i class="fas fa-info-circle" style="margin-right:4px;"></i>R\u00e8glement UE 650/2012 : loi du pays de r\u00e9sidence. Option loi FR par testament (art. 22).</div></div>';
        rs.closest('.section-card').insertAdjacentHTML('afterend',h);
    }
    function onPersonCountryChange(pid,c){_personCountryStore[pid]=c;var s=SD._getState?SD._getState():null;if(!s)return;var d=(typeof FamilyGraph!=='undefined'&&FamilyGraph.getDonors)?FamilyGraph.getDonors():[];if(d.length>0&&d[0].id===pid){s._paysResidence=c;s._residenceEtranger=c!=='FR'?c:null;}if(typeof FamilyGraph!=='undefined'&&FamilyGraph.spouse){var sp=FamilyGraph.spouse(pid);if(sp&&d.some(function(x){return x.id===sp.id;}))s._paysConjoint=c;}}
    function onPersonNationalityChange(pid,n){_personNationalityStore[pid]=n;var s=SD._getState?SD._getState():null;if(!s)return;var d=(typeof FamilyGraph!=='undefined'&&FamilyGraph.getDonors)?FamilyGraph.getDonors():[];if(d.length>0&&d[0].id===pid)s._nationalite=n;}

    // ============ 5. Testament ============
    function injectTestamentSwitch(){var d=document.getElementById('switch-ddv');if(!d||document.getElementById('switch-testament'))return;var r=d.closest('.switch-row');if(!r)return;r.insertAdjacentHTML('beforebegin','<div class="switch-row"><span class="switch-label">Testament d\u00e9j\u00e0 r\u00e9dig\u00e9 ? <span class="info-tip" onclick="this.classList.toggle(\'open\');event.stopPropagation()"><i class="fas fa-info-circle"></i><span class="tip-bubble">OBLIGATOIRE pour les pacs\u00e9s.</span></span></span><div class="switch" id="switch-testament" onclick="SD.toggleSwitch(this);UIEnrichments.onTestamentChange()"></div></div>');}
    function onTestamentChange(){var s=SD._getState?SD._getState():null;if(!s)return;var el=document.getElementById('switch-testament');s._hasTestament=el?el.classList.contains('on'):false;}

    // ============ 6. Bénéficiaires ============
    function enrichBeneficiaryOptions(){var l=document.getElementById('beneficiaries-list');if(!l||l._uiEnrichObserved)return;var o=new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1&&n.classList&&n.classList.contains('list-item'))enrichBenItem(n);});});});o.observe(l,{childList:true});l._uiEnrichObserved=true;l.querySelectorAll('.list-item').forEach(enrichBenItem);}
    function enrichBenItem(item){if(item.querySelector('.autre-lit-check'))return;var benId=item.dataset.benId;if(benId===undefined){var m=item.id.match(/ben-(\d+)/);if(m)benId=m[1];}if(benId===undefined)return;var sel=item.querySelector('select');if(sel&&!sel.querySelector('option[value="beau_enfant"]')){var opt=document.createElement('option');opt.value='beau_enfant';opt.textContent='Beau-fils / Belle-fille';var cj=sel.querySelector('option[value="conjoint_pacs"]');if(cj)cj.insertAdjacentElement('afterend',opt);else sel.appendChild(opt);}var fg=item.querySelector('.form-grid');if(fg){fg.insertAdjacentHTML('afterend','<div class="form-group autre-lit-check" style="margin-top:8px;"><label style="display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--text-secondary);cursor:pointer;"><input type="checkbox" onchange="UIEnrichments.onAutreLitChange('+benId+',this.checked)" style="width:16px;height:16px;cursor:pointer;">Enfant d\'un autre lit</label></div>');}}
    function onAutreLitChange(b,c){var s=SD._getState?SD._getState():null;if(!s)return;var ben=s.beneficiaries.find(function(x){return x.id==b;});if(ben)ben.isAutreLit=c;}

    // ============ 7. enrichState ============
    function wireGatherInputs(){if(typeof SD==='undefined'||!SD._getState)return;var _o=SD.calculateResults;SD.calculateResults=function(){enrichState();_o.call(SD);};}
    function enrichState(){
        var s=SD._getState?SD._getState():null;if(!s)return;
        var uS=document.getElementById('select-union-type');if(uS)s._unionType=uS.value;
        var rS=document.getElementById('select-regime-union');if(rS)s.regime=rS.value;
        var d=(typeof FamilyGraph!=='undefined'&&FamilyGraph.getDonors)?FamilyGraph.getDonors():[];
        if(d.length>0){var mid=d[0].id;s._paysResidence=_personCountryStore[mid]||'FR';s._residenceEtranger=s._paysResidence!=='FR'?s._paysResidence:null;s._nationalite=_personNationalityStore[mid]||'FR';var sp=(typeof FamilyGraph!=='undefined'&&FamilyGraph.spouse)?FamilyGraph.spouse(mid):null;if(sp)s._paysConjoint=_personCountryStore[sp.id]||'';}
        var tE=document.getElementById('switch-testament');if(tE)s._hasTestament=tE.classList.contains('on');
        var dE=document.getElementById('switch-ddv');if(dE)s._hasDDV=dE.classList.contains('on');
        var nb=0;s.beneficiaries.forEach(function(b){if(b.lien==='beau_enfant'){b.isBeauEnfant=true;nb++;}});s._nbBeauxEnfants=nb;
        s._hasEnfantsAutreLit=s.beneficiaries.some(function(b){return b.isAutreLit;});
    }

    // ============ HELPERS ============
    function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}

    // ============ 8. INIT ============
    function init(){
        patchFamilyGraph();
        var iv=setInterval(function(){if(typeof SD==='undefined')return;injectInternationalFields();enrichBeneficiaryOptions();injectTestamentSwitch();observeFamilyTree();wireGatherInputs();startCtxMenuPolling();clearInterval(iv);},1000);
        document.addEventListener('click',function(e){if(e.target.closest('.step-item')){setTimeout(function(){injectInternationalFields();enrichBeneficiaryOptions();injectTestamentSwitch();observeFamilyTree();},400);}});
        console.log('[UIEnrichments v1.6] Loaded \u2014 polling ctx menu + union + r\u00e9gime');
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,1200);});
    else setTimeout(init,1200);

    return {onUnionTypeChange:onUnionTypeChange,onRegimeChange:onRegimeChange,onPaysChange:function(){},onPersonCountryChange:onPersonCountryChange,onPersonNationalityChange:onPersonNationalityChange,onTestamentChange:onTestamentChange,onAutreLitChange:onAutreLitChange,setUnionFromCtx:setUnionFromCtx,setRegimeFromCtx:setRegimeFromCtx,injectUnionTypeSelector:injectUnionTypeSelector,injectInternationalFields:injectInternationalFields,enrichState:enrichState};
})();
