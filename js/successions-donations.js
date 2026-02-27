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
    // 1. FISCAL — Barèmes et constantes
    // ============================================================
    const FISCAL = {
        abattements: {
            enfant: 100000,
            petit_enfant: 31865,
            arriere_petit_enfant: 5310,
            conjoint_pacs_donation: 80724,
            conjoint_pacs_succession: Infinity, // exonéré
            frere_soeur: 15932,
            neveu_niece: 7967,
            tiers: 1594,
            handicap: 159325,
            don_familial_argent: 31865,
            rappel_fiscal_ans: 15
        },

        bareme_ligne_directe: [
            { max: 8072, taux: 0.05 },
            { max: 12109, taux: 0.10 },
            { max: 15932, taux: 0.15 },
            { max: 552324, taux: 0.20 },
            { max: 902838, taux: 0.30 },
            { max: 1805677, taux: 0.40 },
            { max: Infinity, taux: 0.45 }
        ],
        bareme_frere_soeur: [
            { max: 24430, taux: 0.35 },
            { max: Infinity, taux: 0.45 }
        ],
        bareme_neveu_niece: [{ max: Infinity, taux: 0.55 }],
        bareme_tiers: [{ max: Infinity, taux: 0.60 }],

        // Démembrement art. 669 CGI
        demembrement: [
            { maxAge: 20, np: 0.10 },
            { maxAge: 30, np: 0.20 },
            { maxAge: 40, np: 0.30 },
            { maxAge: 50, np: 0.40 },
            { maxAge: 60, np: 0.50 },
            { maxAge: 70, np: 0.60 },
            { maxAge: 80, np: 0.70 },
            { maxAge: 90, np: 0.80 },
            { maxAge: Infinity, np: 0.90 }
        ],

        // Assurance-vie
        av990I: { abattement: 152500, taux1: 0.20, seuil2: 700000, taux2: 0.3125 },
        av757B: { abattementGlobal: 30500 },
        primesExagSeuil: 0.35,

        // PV immobilière
        pvIR: 0.19,
        pvPS: 0.172,
        lmnpAmortDate: '2025-02-15',

        // Structure
        sciMeubleTolerance: 0.10,
        fraisNotairePct: 0.018,
        fraisNotaireSuccPct: 0.012,
        fraisStructure: { sci_ir: 1100, sci_is: 2300, sarl: 3000, creation: 2000 },

        // IS 2026
        isReduit: { taux: 0.15, plafond: 42500 },
        isNormal: 0.25,

        // SSI
        ssiMinimum: 1100,

        // Dutreil
        dutreilAbat: 0.75,
        dutreilReduction: 0.50,

        // Exonération temporaire logement 790 A bis (15/02/2025 → 31/12/2026)
        exoLogement: {
            maxParDonateur: 100000,
            maxParDonataire: 300000,
            delaiUtilisationMois: 6,
            dureeConservationAns: 5,
            dateFin: '2026-12-31'
        }
    };

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
    function goToStep(n) {
        if (n > currentStep + 1) return;
        currentStep = n;

        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('step-' + n).classList.add('active');

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
        el('btn-next').style.display = n < 5 ? '' : 'none';
        el('btn-calculate').style.display = n === 4 ? '' : 'none';
        if (n === 5) {
            el('btn-next').style.display = 'none';
            el('btn-calculate').style.display = 'none';
        }

        if (n === 3) updateSynthese();
        updateAside();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function nextStep() { if (currentStep < 5) goToStep(currentStep + 1); }
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
        if (event && event.target) event.target.classList.add('active');

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
            ['enfant', 'Enfant'], ['petit_enfant', 'Petit-enfant'],
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
                    <label class="form-label">Lien de parenté</label>
                    <select onchange="SD.updateBen(${id},'lien',this.value)">${opts}</select>
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
                <label class="form-label" style="color:var(--accent-coral);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-history"></i> Donations déjà reçues (rappel fiscal 15 ans)
                </label>
                <div id="don-ant-list-${id}" class="don-ant-list"></div>
                <button class="btn-add" style="margin-top:6px;font-size:.72rem;padding:6px 12px;" onclick="SD.addDonAnt(${id})">
                    <i class="fas fa-plus"></i> Ajouter une donation reçue
                </button>
            </div>
        </div>`;
        el('beneficiaries-list').insertAdjacentHTML('beforeend', html);
    }

    // -- Donations antérieures par donateur (liées à la cartographie) --
    let donAntIdCounter = 0;

    function addDonAnt(benId) {
        const ben = state.beneficiaries.find(b => b.id === benId);
        if (!ben) return;
        if (!ben.donationsAnterieures) ben.donationsAnterieures = [];
        const daId = donAntIdCounter++;
        // donorId = lien vers PathOptimizer.getDonors()[x].id, -1 = "autre personne"
        ben.donationsAnterieures.push({ id: daId, donorId: -1, donorNom: '', donorRole: 'parent', montant: 0 });
        renderDonAntList(benId);
        recalcDonAnt(benId);
    }

    function removeDonAnt(benId, daId) {
        const ben = state.beneficiaries.find(b => b.id === benId);
        if (!ben || !ben.donationsAnterieures) return;
        ben.donationsAnterieures = ben.donationsAnterieures.filter(d => d.id !== daId);
        renderDonAntList(benId);
        recalcDonAnt(benId);
    }

    function updateDonAnt(benId, daId, field, value) {
        const ben = state.beneficiaries.find(b => b.id === benId);
        if (!ben || !ben.donationsAnterieures) return;
        const da = ben.donationsAnterieures.find(d => d.id === daId);
        if (!da) return;

        if (field === 'montant') {
            da.montant = +value || 0;
        } else if (field === 'donorId') {
            da.donorId = +value;
            // Si c'est un donateur de la cartographie, copier son nom et rôle
            if (da.donorId >= 0 && typeof PathOptimizer !== 'undefined') {
                const donor = PathOptimizer.getDonors().find(d => d.id === da.donorId);
                if (donor) { da.donorNom = donor.nom; da.donorRole = donor.role; }
            }
        } else if (field === 'donorNom') {
            da.donorNom = value;
        } else if (field === 'donorRole') {
            da.donorRole = value;
        }

        renderDonAntList(benId);
        recalcDonAnt(benId);
    }

    function recalcDonAnt(benId) {
        const ben = state.beneficiaries.find(b => b.id === benId);
        if (!ben) return;
        ben.donationAnterieure = (ben.donationsAnterieures || []).reduce((s, d) => s + (d.montant || 0), 0);
    }

    // Abattement applicable selon le rôle du donateur par rapport au lien du bénéficiaire
    function getAbatForDonorRole(donorRole, benLien) {
        // Utilise la même logique que PathOptimizer.detectLien
        const ROLE_TO_LIEN = {
            parent:        { enfant: 'enfant', petit_enfant: 'petit_enfant' },
            grand_parent:  { enfant: 'petit_enfant', petit_enfant: 'arriere_petit_enfant' },
            arr_grand_parent: { enfant: 'arriere_petit_enfant' },
            oncle_tante:   { enfant: 'neveu_niece' },
            conjoint:      { enfant: 'enfant' },
            tiers:         { enfant: 'tiers' }
        };
        const map = ROLE_TO_LIEN[donorRole];
        const lienFiscal = map ? (map[benLien] || 'tiers') : 'tiers';

        const ABAT = { enfant: 100000, petit_enfant: 31865, arriere_petit_enfant: 5310,
            conjoint_pacs_donation: 80724, frere_soeur: 15932, neveu_niece: 7967, tiers: 1594 };
        return { lienFiscal, abattement: ABAT[lienFiscal] || ABAT.tiers };
    }

    function renderDonAntList(benId) {
        const ben = state.beneficiaries.find(b => b.id === benId);
        const container = el('don-ant-list-' + benId);
        if (!container || !ben) return;

        // Liste des donateurs de la cartographie
        const cartoDonors = (typeof PathOptimizer !== 'undefined') ? PathOptimizer.getDonors() : [];

        if (!ben.donationsAnterieures || ben.donationsAnterieures.length === 0) {
            container.innerHTML = '<div style="font-size:.72rem;color:var(--text-muted);padding:4px 0;">Aucune donation antérieure déclarée — l\'abattement est entièrement disponible.</div>';
            return;
        }

        const roleOpts = [
            ['parent', 'Parent'], ['grand_parent', 'Grand-parent'],
            ['arr_grand_parent', 'Arr. grand-parent'], ['oncle_tante', 'Oncle/Tante'],
            ['frere_soeur', 'Frère/Sœur'], ['conjoint', 'Conjoint'], ['tiers', 'Autre']
        ];

        container.innerHTML = ben.donationsAnterieures.map(da => {
            // Dropdown options : d'abord les donateurs de la cartographie, puis "Autre"
            let donorSelectHtml = `<option value="-1" ${da.donorId === -1 ? 'selected' : ''}>— Autre personne —</option>`;
            cartoDonors.forEach(cd => {
                donorSelectHtml += `<option value="${cd.id}" ${da.donorId === cd.id ? 'selected' : ''}>${cd.nom} (${formatRoleShort(cd.role)})</option>`;
            });

            // Calcul abattement restant
            const role = da.donorId >= 0 ? da.donorRole : da.donorRole;
            const { lienFiscal, abattement } = getAbatForDonorRole(role, ben.lien);
            const restant = Math.max(0, abattement - da.montant);
            const pctUsed = abattement > 0 ? Math.min(100, (da.montant / abattement) * 100) : 100;
            const barColor = pctUsed > 80 ? 'var(--accent-coral)' : pctUsed > 50 ? 'var(--accent-amber)' : 'var(--accent-green)';

            // Champ nom libre si "Autre personne"
            const isOther = da.donorId === -1;

            return `
            <div style="margin-bottom:8px;padding:10px;border-radius:10px;background:rgba(255,107,107,.03);border:1px solid rgba(255,107,107,.08);">
                <div style="display:grid;grid-template-columns:1fr ${isOther ? '1fr' : ''} 110px 28px;gap:8px;align-items:end;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:.6rem;">Donateur</label>
                        <select style="font-size:.75rem;height:34px;" onchange="SD.updateDonAnt(${benId},${da.id},'donorId',this.value)">${donorSelectHtml}</select>
                    </div>
                    ${isOther ? `
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:.6rem;">Nom + rôle</label>
                        <div style="display:flex;gap:4px;">
                            <input type="text" value="${da.donorNom}" placeholder="Nom"
                                   style="font-size:.72rem;height:34px;flex:1;"
                                   onchange="SD.updateDonAnt(${benId},${da.id},'donorNom',this.value)">
                            <select style="font-size:.68rem;height:34px;width:100px;" onchange="SD.updateDonAnt(${benId},${da.id},'donorRole',this.value)">
                                ${roleOpts.map(([v, l]) => `<option value="${v}" ${v === da.donorRole ? 'selected' : ''}>${l}</option>`).join('')}
                            </select>
                        </div>
                    </div>` : ''}
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:.6rem;">Montant (€)</label>
                        <input type="number" value="${da.montant}" min="0" step="1000"
                               style="font-size:.75rem;height:34px;border-color:rgba(255,107,107,.2);"
                               onchange="SD.updateDonAnt(${benId},${da.id},'montant',this.value)">
                    </div>
                    <button class="btn-remove" style="width:28px;height:28px;font-size:.6rem;" onclick="SD.removeDonAnt(${benId},${da.id})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:4px;border-radius:4px;background:rgba(198,134,66,.1);overflow:hidden;">
                        <div style="height:100%;width:${pctUsed}%;background:${barColor};border-radius:4px;transition:width .3s;"></div>
                    </div>
                    <div style="font-size:.62rem;white-space:nowrap;color:${restant > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'};">
                        ${restant > 0 ? `Restant : ${fmt(restant)}` : 'Abattement épuisé'} <span style="color:var(--text-muted);">/ ${fmt(abattement)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function formatRoleShort(role) {
        return { parent:'Parent', grand_parent:'GP', arr_grand_parent:'Arr.GP',
            oncle_tante:'Oncle', conjoint:'Conjoint', tiers:'Tiers' }[role] || role;
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
            dateAcquisition: '',
            dateSortieRP: '',
            // Détention
            structure: 'direct',            // direct | sci_ir | sci_is | sarl_famille | indivision | demembre
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
                <div class="form-grid cols-3">
                    <div class="form-group">
                        <label class="form-label">Prix d'acquisition (€)</label>
                        <input type="number" step="1000" onchange="SD.updateImmo(${id},'prixAcquisition',+this.value)" placeholder="Ex: 310000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date d'acquisition</label>
                        <input type="date" onchange="SD.updateImmo(${id},'dateAcquisition',this.value)">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Mode de détention</label>
                        <select onchange="SD.updateImmo(${id},'structure',this.value); SD.refreshImmoUI(${id})">
                            <option value="direct">En direct (personne physique)</option>
                            <option value="sci_ir">Via SCI à l'IR</option>
                            <option value="sci_is">Via SCI à l'IS</option>
                            <option value="sarl_famille">Via SARL de famille (IR)</option>
                            <option value="indivision">En indivision</option>
                            <option value="demembre">Démembré (US ou NP)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Date sortie RP (si ex-RP) -->
            <div id="immo-exrp-${id}" style="display:none; margin-top:12px;">
                <div class="form-group">
                    <label class="form-label">Date de sortie de la résidence principale <span class="info-tip" data-tip="Si le bien était votre RP et ne l'est plus, la plus-value n'est plus exonérée. La date de sortie RP détermine le début du calcul PV."><i class="fas fa-info-circle"></i></span></label>
                    <input type="date" onchange="SD.updateImmo(${id},'dateSortieRP',this.value)">
                </div>
            </div>

            <!-- Crédit -->
            <div class="form-grid" style="margin-top:12px;">
                <div class="form-group">
                    <label class="form-label">Crédit restant dû (€)</label>
                    <input type="number" step="1000" onchange="SD.updateImmo(${id},'credit',+this.value)" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Assurance décès (ADI) sur ce crédit ?</label>
                    <select onchange="SD.updateImmo(${id},'creditADI',this.value==='oui')">
                        <option value="non">Non — déductible du passif</option>
                        <option value="oui">Oui — NON déductible (soldé au décès)</option>
                    </select>
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
    function addFinancial() {
        const id = finIdCounter++;
        state.finance.push({
            id, type: 'assurance_vie', valeur: 0, versements: 0,
            dateOuverture: '', primesAvant70: 0, primesApres70: 0,
            clauseBeneficiaire: 'standard'
        });

        const html = `
        <div class="list-item" id="fin-${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-chart-line"></i> Actif financier ${id + 1}</div>
                <button class="btn-remove" onclick="SD.removeFinancial(${id})"><i class="fas fa-times"></i></button>
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
                        <input type="number" step="1000" onchange="SD.updateFin(${id},'primesAvant70',+this.value)" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Primes après 70 ans <span class="info-tip" data-tip="Art. 757 B : abattement global 30 500 € (partagé). Intérêts exonérés. Au-delà : DMTG classiques."><i class="fas fa-info-circle"></i></span></label>
                        <input type="number" step="1000" onchange="SD.updateFin(${id},'primesApres70',+this.value)" placeholder="0">
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
            </div>
        </div>`;
        el('finance-list').insertAdjacentHTML('beforeend', html);
    }

    function removeFinancial(id) { state.finance = state.finance.filter(i => i.id !== id); el('fin-' + id)?.remove(); }
    function updateFin(id, field, val) { const item = state.finance.find(i => i.id === id); if (item) item[field] = val; }
    function refreshFinUI(id) {
        const item = state.finance.find(i => i.id === id);
        const avSection = el('fin-av-' + id);
        if (avSection) avSection.style.display = (item && ['assurance_vie', 'contrat_capi'].includes(item.type)) ? '' : 'none';
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
        state.debts.push({ id, type: 'credit_immo', montant: 0, adi: false });
        const html = `
        <div class="list-item" id="debt-${id}">
            <div class="list-item-header">
                <div class="list-item-title"><i class="fas fa-file-invoice-dollar"></i> Dette ${id + 1}</div>
                <button class="btn-remove" onclick="SD.removeDebt(${id})"><i class="fas fa-times"></i></button>
            </div>
            <div class="form-grid cols-3">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select onchange="SD.updateDebt(${id},'type',this.value)">
                        <option value="credit_immo">Crédit immobilier</option>
                        <option value="credit_conso">Crédit consommation</option>
                        <option value="dette_pro">Dette professionnelle</option>
                        <option value="impot">Impôt dû</option>
                        <option value="autre">Autre</option>
                    </select>
                </div>
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
        addDonAnt, removeDonAnt, updateDonAnt,
        addImmo, removeImmo, updateImmo, updateImmoTitle, refreshImmoUI,
        addFinancial, removeFinancial, updateFin, refreshFinUI,
        addProfessional, removePro, updatePro,
        addDebt, removeDebt, updateDebt,
        calculateResults, resetAll, updateAside,
        _getState: () => state
    };

})();
