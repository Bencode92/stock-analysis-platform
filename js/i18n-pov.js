/**
 * i18n-pov.js — Wording dynamique selon le point de vue
 *
 * Adapte automatiquement le vocabulaire de l'interface au POV de l'utilisateur :
 *   - "Votre patrimoine" vs "le patrimoine de vos parents" vs "de vos grands-parents"
 *   - "Vos enfants" vs "les enfants de vos parents" (= votre fratrie)
 *   - etc.
 *
 * USAGE dans le HTML :
 *   <span data-i18n-pov="patrimoine">Patrimoine</span>
 *   Au fire de l'event 'pov:ready', le texte est remplacé.
 *
 * USAGE dans le JS :
 *   I18nPOV.label('patrimoine')  // "le patrimoine de vos parents"
 *   I18nPOV.l('donateur')        // alias court
 *
 * Dépend de : pov-onboarding.js (window.__POV__)
 *
 * @version 1.0.0 — 2026-04-20
 */
const I18nPOV = (function() {
    'use strict';

    // ============================================================
    // DICTIONNAIRE de termes par POV
    // ============================================================
    // Chaque clé a 5 variantes (self / child / grandchild / spouse / pro)
    // + fallback explicite
    const TERMS = {
        // Possessifs / désignation du patrimoine
        'patrimoine': {
            self:       'votre patrimoine',
            child:      'le patrimoine de vos parents',
            grandchild: 'le patrimoine de vos grands-parents',
            spouse:     'le patrimoine de votre conjoint décédé',
            pro:        'le patrimoine du client'
        },
        'patrimoine_maj': {
            self:       'Votre patrimoine',
            child:      'Le patrimoine de vos parents',
            grandchild: 'Le patrimoine de vos grands-parents',
            spouse:     'Le patrimoine de votre conjoint décédé',
            pro:        'Le patrimoine du client'
        },
        // Désignation du/des donateur(s)
        'donateur': {
            self:       'vous',
            child:      'vos parents',
            grandchild: 'vos grands-parents',
            spouse:     'votre conjoint décédé',
            pro:        'votre client'
        },
        'donateur_maj': {
            self:       'Vous',
            child:      'Vos parents',
            grandchild: 'Vos grands-parents',
            spouse:     'Votre conjoint décédé',
            pro:        'Votre client'
        },
        // Possessif appliqué au donateur
        'possessif_donateur': {
            self:       'votre',
            child:      'leur',
            grandchild: 'leur',
            spouse:     'sa',
            pro:        'son'
        },
        // Verbe "donne"
        'verbe_donner': {
            self:       'vous donnez',
            child:      'vos parents donnent',
            grandchild: 'vos grands-parents donnent',
            spouse:     'votre conjoint avait donné',
            pro:        'votre client donne'
        },
        'verbe_transmettre': {
            self:       'vous transmettez',
            child:      'vos parents transmettent',
            grandchild: 'vos grands-parents transmettent',
            spouse:     'votre conjoint a transmis',
            pro:        'votre client transmet'
        },
        // Les bénéficiaires
        'beneficiaires': {
            self:       'vos bénéficiaires',
            child:      'vous et votre fratrie',
            grandchild: 'vos parents (et vous en donation directe)',
            spouse:     'vous et les enfants',
            pro:        'les bénéficiaires'
        },
        'enfants_du_donateur': {
            self:       'vos enfants',
            child:      'vous et vos frères/sœurs',
            grandchild: 'vos parents et leurs frères/sœurs',
            spouse:     'vos enfants',
            pro:        'les enfants du client'
        },
        // Conjoint du donateur
        'conjoint_donateur': {
            self:       'votre conjoint',
            child:      'le parent survivant',
            grandchild: 'le grand-parent survivant',
            spouse:     'vous (conjoint survivant)',
            pro:        'le conjoint du client'
        },
        // Titres / headings
        'titre_situation': {
            self:       'Votre situation',
            child:      'La situation de vos parents',
            grandchild: 'La situation de vos grands-parents',
            spouse:     'La situation à liquider',
            pro:        'Situation du client'
        },
        'titre_objectifs': {
            self:       'Vos objectifs',
            child:      'Objectifs pour vos parents',
            grandchild: 'Objectifs pour vos grands-parents',
            spouse:     'Objectifs de liquidation',
            pro:        'Objectifs du client'
        },
        'titre_resultats': {
            self:       'Votre plan de transmission',
            child:      'Plan de transmission de vos parents',
            grandchild: 'Plan de transmission de vos grands-parents',
            spouse:     'Plan de liquidation',
            pro:        'Plan du client'
        },
        // Actions
        'cta_simuler': {
            self:       'Calculer ma transmission',
            child:      'Calculer leur transmission',
            grandchild: 'Calculer leur transmission',
            spouse:     'Calculer la liquidation',
            pro:        'Lancer la simulation'
        },
        // Disclaimers
        'disclaimer_age': {
            self:       'Renseignez votre âge pour affiner les calculs de démembrement.',
            child:      'Renseignez l\'âge de vos parents pour le calcul usufruit/nue-propriété.',
            grandchild: 'Renseignez l\'âge de vos grands-parents pour le calcul usufruit/nue-propriété.',
            spouse:     'L\'âge du défunt détermine le régime AV (avant/après 70 ans).',
            pro:        'Âge du client : clé pour démembrement et AV.'
        },
        // Questions contextuelles
        'q_qui_transmet': {
            self:       'Qui reçoit votre patrimoine ?',
            child:      'Qui seront les bénéficiaires chez vos parents ?',
            grandchild: 'Qui recevra le patrimoine de vos grands-parents ?',
            spouse:     'Qui sont les héritiers ?',
            pro:        'Qui sont les bénéficiaires ?'
        }
    };

    // ============================================================
    // API
    // ============================================================
    function currentPOV() {
        return (window.__POV__ && window.__POV__.pov) || 'self';
    }

    /**
     * Retourne le terme adapté au POV actuel.
     * @param {string} key   — clé dans TERMS
     * @param {string} [fallback] — valeur de repli si clé inconnue
     * @returns {string}
     */
    function label(key, fallback) {
        const entry = TERMS[key];
        if (!entry) return fallback != null ? fallback : key;
        const pov = currentPOV();
        return entry[pov] || entry.self || (fallback != null ? fallback : key);
    }

    // Alias court
    function l(key, fallback) { return label(key, fallback); }

    /**
     * Applique les traductions à tous les [data-i18n-pov] dans le DOM.
     * Stocke le texte d'origine en data-i18n-original pour pouvoir re-render.
     */
    function applyToDOM(root) {
        root = root || document;
        const nodes = root.querySelectorAll('[data-i18n-pov]');
        nodes.forEach(n => {
            const key = n.getAttribute('data-i18n-pov');
            if (!n.hasAttribute('data-i18n-original')) {
                n.setAttribute('data-i18n-original', n.textContent || '');
            }
            const original = n.getAttribute('data-i18n-original') || '';
            n.textContent = label(key, original);
        });
        // Aussi : [data-i18n-pov-attr="placeholder:key"]
        const attrNodes = root.querySelectorAll('[data-i18n-pov-attr]');
        attrNodes.forEach(n => {
            const spec = n.getAttribute('data-i18n-pov-attr');
            if (!spec) return;
            const [attr, key] = spec.split(':');
            if (!attr || !key) return;
            if (!n.hasAttribute('data-i18n-original-' + attr)) {
                n.setAttribute('data-i18n-original-' + attr, n.getAttribute(attr) || '');
            }
            const original = n.getAttribute('data-i18n-original-' + attr) || '';
            n.setAttribute(attr, label(key, original));
        });
    }

    /**
     * Capitalise la première lettre.
     */
    function cap(str) {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ============================================================
    // AUTO-APPLY au chargement et au changement de POV
    // ============================================================
    document.addEventListener('pov:ready', () => {
        try { applyToDOM(); } catch (e) { console.warn('[I18nPOV] applyToDOM failed', e); }
    });

    // Si déjà chargé après pov:ready (cas où i18n charge en retard) : applyToDOM immédiat
    if (typeof window !== 'undefined' && window.__POV__ && window.__POV__.completed) {
        setTimeout(() => { try { applyToDOM(); } catch (e) {} }, 50);
    }

    return {
        label, l, cap,
        applyToDOM,
        currentPOV,
        getTerms: () => TERMS,
        addTerms: function(extra) { Object.assign(TERMS, extra || {}); }
    };
})();

if (typeof window !== 'undefined') window.I18nPOV = I18nPOV;
