/**
 * api-proxy-patch.js v1.0 — Redirige l'appel Anthropic via Cloudflare Worker
 *
 * Probleme : transmission-engine.js appelle directement api.anthropic.com
 *   → CORS bloque depuis GitHub Pages
 *   → Pas de cle API dans le header
 *
 * Solution : intercepter generateNarrativeSummary et remplacer l'URL
 *   par celle du Cloudflare Worker proxy (qui ajoute la cle cote serveur)
 *
 * SETUP :
 * 1. Deployer workers/claude-proxy.js sur Cloudflare Workers
 * 2. Ajouter ANTHROPIC_API_KEY dans les variables d'environnement du Worker
 * 3. Remplacer PROXY_URL ci-dessous par votre URL Worker
 *
 * @version 1.0.0 — 2026-03-17
 */
(function() {
    'use strict';

    // ══════════════════════════════════════════════════════════════
    // CONFIGURATION — Remplacer par votre URL Cloudflare Worker
    // ══════════════════════════════════════════════════════════════
    var PROXY_URL = 'https://claude-proxy.bencode92.workers.dev';
    // ══════════════════════════════════════════════════════════════

    function init() {
        if (typeof TransmissionEngine === 'undefined') {
            setTimeout(init, 500);
            return;
        }

        // Patch : intercepter le fetch global pour rediriger les appels Anthropic
        var _origFetch = window.fetch;
        window.fetch = function(url, options) {
            // Intercepter uniquement les appels vers api.anthropic.com
            if (typeof url === 'string' && url.indexOf('api.anthropic.com') >= 0) {
                console.log('[ApiProxy] Redirecting Anthropic call via proxy:', PROXY_URL);

                // Retirer les headers qui posent probleme en CORS
                var newOptions = Object.assign({}, options || {});
                newOptions.headers = { 'Content-Type': 'application/json' };
                // Ne PAS envoyer x-api-key (le proxy l'ajoute cote serveur)

                return _origFetch.call(window, PROXY_URL, newOptions);
            }
            // Tous les autres fetch passent normalement
            return _origFetch.apply(window, arguments);
        };

        console.log('[ApiProxy v1.0] Anthropic API calls redirected via', PROXY_URL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }
})();
