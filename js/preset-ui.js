/**
 * preset-ui.js - Interface des presets pour le comparateur
 * Injecte les "Situations types" dans le comparateur
 */

(function() {
    'use strict';

    // CSS pour les presets
    const presetCSS = `
        .preset-section {
            margin-bottom: 1.5rem;
            padding: 1rem;
            background: rgba(1, 35, 65, 0.4);
            border-radius: 8px;
            border: 1px solid rgba(0, 255, 135, 0.15);
        }

        .preset-section-title {
            font-size: 0.875rem;
            font-weight: 600;
            color: #00FF87;
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .preset-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .preset-chip {
            display: inline-flex;
            align-items: center;
            padding: 0.5rem 0.875rem;
            background: rgba(1, 42, 74, 0.6);
            border: 1px solid rgba(0, 255, 135, 0.25);
            border-radius: 20px;
            font-size: 0.8125rem;
            color: rgba(230, 230, 230, 0.9);
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
        }

        .preset-chip:hover {
            background: rgba(1, 42, 74, 0.9);
            border-color: rgba(0, 255, 135, 0.5);
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(0, 255, 135, 0.15);
        }

        .preset-chip.active {
            background: rgba(0, 255, 135, 0.2);
            border-color: rgba(0, 255, 135, 0.6);
            color: #00FF87;
            font-weight: 600;
        }

        .preset-chip-icon {
            margin-right: 0.375rem;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .preset-chips {
                flex-direction: column;
            }
            
            .preset-chip {
                width: 100%;
                justify-content: center;
            }
        }
    `;

    // Injecter le CSS
    function injectPresetCSS() {
        if (document.getElementById('preset-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'preset-ui-styles';
        style.textContent = presetCSS;
        document.head.appendChild(style);
    }

    // Créer et insérer la section presets
    function createPresetSection() {
        const header = document.querySelector('.comparatif-header');
        if (!header) {
            console.warn('Comparatif header not found, retrying...');
            return false;
        }

        // Vérifier si déjà créé
        if (document.getElementById('preset-section')) return true;

        // Créer la section
        const presetSection = document.createElement('div');
        presetSection.id = 'preset-section';
        presetSection.className = 'preset-section';

        // Récupérer tous les presets (ou les meilleurs selon profil si on a les données)
        const presets = window.quickPresets || [];
        const displayPresets = presets.slice(0, 8); // Afficher les 8 premiers par défaut

        presetSection.innerHTML = `
            <div class="preset-section-title">
                <span>🎯</span>
                <span>Situations types</span>
            </div>
            <div class="preset-chips" id="preset-chips-container">
                ${displayPresets.map(preset => `
                    <div class="preset-chip" data-preset-id="${preset.id}" title="${preset.rationale}">
                        <span class="preset-chip-label">${preset.label}</span>
                    </div>
                `).join('')}
            </div>
        `;

        // Insérer au début du header (avant les filtres d'intention)
        const intentFilters = header.querySelector('.intent-filters');
        if (intentFilters) {
            header.insertBefore(presetSection, intentFilters);
        } else {
            header.insertBefore(presetSection, header.firstChild);
        }

        // Ajouter les event listeners
        attachPresetListeners();

        return true;
    }

    // Attacher les listeners aux chips
    function attachPresetListeners() {
        const chips = document.querySelectorAll('.preset-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const presetId = chip.dataset.presetId;
                applyPreset(presetId, chip);
            });
        });
    }

    // État du preset actif
    let activePresetId = null;

    // Appliquer un preset
    function applyPreset(presetId, chipElement) {
        const preset = (window.quickPresets || []).find(p => p.id === presetId);
        if (!preset) {
            console.error(`Preset ${presetId} not found`);
            return;
        }

        // Toggle : si le preset est déjà actif, on le désactive
        if (activePresetId === presetId) {
            resetPreset(chipElement);
            return;
        }

        // Marquer comme actif
        document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        chipElement.classList.add('active');
        activePresetId = presetId;

        console.log('Applying preset:', preset);

        // Utiliser le hook si disponible
        if (window.__comparatifHooks?.applyPreset) {
            window.__comparatifHooks.applyPreset(preset);
            return;
        }

        // Sinon, appliquer manuellement
        applyPresetManually(preset);
    }

    // Désactiver le preset
    function resetPreset(chipElement) {
        chipElement.classList.remove('active');
        activePresetId = null;

        // Reset manuel : vider la comparaison et désactiver les filtres
        if (window.__comparatifHooks?.reset) {
            window.__comparatifHooks.reset();
        } else {
            // Reset minimal : déclencher un événement custom
            window.dispatchEvent(new CustomEvent('preset:reset'));
        }
    }

    // Application manuelle du preset (fallback)
    function applyPresetManually(preset) {
        // Déclencher un événement custom avec les données
        window.dispatchEvent(new CustomEvent('preset:apply', {
            detail: {
                statuts: preset.statuts,
                intents: preset.intents,
                preset: preset
            }
        }));

        console.log('Preset applied via custom event:', preset);
    }

    // Initialiser l'interface presets
    function initPresetUI() {
        console.log('Initializing preset UI...');
        
        injectPresetCSS();

        // Attendre que le comparatif soit prêt
        const checkInterval = setInterval(() => {
            if (createPresetSection()) {
                clearInterval(checkInterval);
                console.log('Preset UI initialized successfully');
            }
        }, 100);

        // Timeout après 5 secondes
        setTimeout(() => clearInterval(checkInterval), 5000);
    }

    // Exposer l'API publique
    window.presetUI = {
        init: initPresetUI,
        applyPreset: applyPreset
    };

    // Auto-initialisation quand le DOM est prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPresetUI);
    } else {
        // DOM déjà prêt, initialiser après un court délai
        setTimeout(initPresetUI, 500);
    }

    // Écouter l'événement de ready du comparatif
    window.addEventListener('comparatif:ready', initPresetUI);

})();
