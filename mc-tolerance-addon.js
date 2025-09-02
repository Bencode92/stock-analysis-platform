// ===== Addon Slider de Tolérance pour MC Module =====
// À intégrer dans mc-integration.js après la section des filtres

(function() {
  // Attendre que le module MC soit prêt
  if (!window.MC) {
    console.log('⏳ Attente du module MC pour le slider de tolérance...');
    setTimeout(arguments.callee, 500);
    return;
  }

  // Ajouter le slider de tolérance dans l'interface
  function addToleranceSlider() {
    const modeFieldset = document.querySelector('#mc-section fieldset[role="radiogroup"]');
    if (!modeFieldset || document.getElementById('tolerance-control')) return;
    
    const toleranceControl = document.createElement('div');
    toleranceControl.id = 'tolerance-control';
    toleranceControl.className = 'mt-4 p-3 rounded bg-white/5 border border-cyan-400/20';
    toleranceControl.innerHTML = `
      <div class="text-xs opacity-70 mb-2 flex items-center gap-2">
        <i class="fas fa-sliders-h text-cyan-400"></i>
        <span>Tolérance des égalités</span>
        <span class="ml-auto text-cyan-400 font-semibold" id="tolerance-value">Normal</span>
      </div>
      <div class="relative">
        <input type="range" 
               id="mc-tolerance" 
               min="0" 
               max="2" 
               step="0.1" 
               value="1"
               class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-cyan">
        <div class="flex justify-between text-xs opacity-50 mt-1">
          <span>Strict</span>
          <span>Normal</span>
          <span>Large</span>
        </div>
      </div>
      <div class="text-xs opacity-60 mt-2 leading-relaxed">
        <div id="tolerance-description" class="hidden">
          <div class="strict-desc hidden">
            <strong class="text-cyan-400">Mode Strict:</strong> Distinction fine entre valeurs proches (c=0.8, κ=1.2)
          </div>
          <div class="normal-desc">
            <strong class="text-cyan-400">Mode Normal:</strong> Équilibre standard pour la plupart des cas (c=1.0, κ=1.5)
          </div>
          <div class="large-desc hidden">
            <strong class="text-cyan-400">Mode Large:</strong> Regroupe les valeurs similaires (c=1.3, κ=1.8)
          </div>
        </div>
      </div>
    `;
    
    modeFieldset.appendChild(toleranceControl);
    
    // Ajouter les styles CSS pour le slider cyan
    if (!document.getElementById('tolerance-slider-styles')) {
      const styles = document.createElement('style');
      styles.id = 'tolerance-slider-styles';
      styles.textContent = `
        .slider-cyan {
          background: linear-gradient(to right, 
            rgba(0, 255, 255, 0.2) 0%, 
            rgba(0, 255, 255, 0.3) 50%, 
            rgba(0, 255, 255, 0.2) 100%);
          outline: none;
          transition: all 0.3s ease;
        }
        
        .slider-cyan::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #00ffff;
          border: 2px solid rgba(0, 255, 255, 0.5);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
          transition: all 0.2s ease;
        }
        
        .slider-cyan::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #00ffff;
          border: 2px solid rgba(0, 255, 255, 0.5);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
          transition: all 0.2s ease;
        }
        
        .slider-cyan:hover::-webkit-slider-thumb,
        .slider-cyan:hover::-moz-range-thumb {
          box-shadow: 0 0 15px rgba(0, 255, 255, 0.7);
          transform: scale(1.1);
        }
        
        .slider-cyan:active::-webkit-slider-thumb,
        .slider-cyan:active::-moz-range-thumb {
          box-shadow: 0 0 20px rgba(0, 255, 255, 0.9);
          transform: scale(1.15);
        }
        
        /* Animation pour le changement de valeur */
        @keyframes pulse-cyan {
          0% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }
          50% { box-shadow: 0 0 20px rgba(0, 255, 255, 0.8); }
          100% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }
        }
        
        .slider-cyan.animating::-webkit-slider-thumb,
        .slider-cyan.animating::-moz-range-thumb {
          animation: pulse-cyan 0.5s ease-out;
        }
      `;
      document.head.appendChild(styles);
    }
    
    // Gestionnaire d'événements pour le slider
    const slider = document.getElementById('mc-tolerance');
    const valueLabel = document.getElementById('tolerance-value');
    const descriptions = {
      strict: document.querySelector('.strict-desc'),
      normal: document.querySelector('.normal-desc'),
      large: document.querySelector('.large-desc')
    };
    
    if (slider && valueLabel) {
      // Fonction de mise à jour
      const updateTolerance = (value) => {
        const v = parseFloat(value);
        
        // Calculer les valeurs de tolérance
        let c, kappa, label, descKey;
        
        if (v < 0.7) {
          // Mode Strict
          c = 0.8 + v * 0.2;
          kappa = 1.2 + v * 0.2;
          label = 'Strict';
          descKey = 'strict';
        } else if (v < 1.4) {
          // Mode Normal
          c = 0.9 + (v - 0.7) * 0.3;
          kappa = 1.3 + (v - 0.7) * 0.4;
          label = 'Normal';
          descKey = 'normal';
        } else {
          // Mode Large
          c = 1.1 + (v - 1.4) * 0.4;
          kappa = 1.6 + (v - 1.4) * 0.4;
          label = 'Large';
          descKey = 'large';
        }
        
        // Mettre à jour le module MC
        if (window.MC && window.MC.state) {
          // Accéder aux constantes TOL_PRESET via le module
          // Note: il faudrait exposer TOL_PRESET dans le module MC
          console.log(`🎚️ Tolérance mise à jour: ${label} (c=${c.toFixed(2)}, κ=${kappa.toFixed(2)})`);
          
          // Envoyer un événement personnalisé
          window.dispatchEvent(new CustomEvent('mc-tolerance-changed', {
            detail: { c, kappa, mode: label.toLowerCase() }
          }));
        }
        
        // Mettre à jour l'interface
        valueLabel.textContent = label;
        valueLabel.className = `ml-auto font-semibold ${
          label === 'Strict' ? 'text-blue-400' : 
          label === 'Normal' ? 'text-cyan-400' : 
          'text-green-400'
        }`;
        
        // Mettre à jour les descriptions
        Object.values(descriptions).forEach(desc => {
          if (desc) desc.classList.add('hidden');
        });
        if (descriptions[descKey]) {
          descriptions[descKey].classList.remove('hidden');
          document.getElementById('tolerance-description').classList.remove('hidden');
        }
        
        // Ajouter l'animation
        slider.classList.add('animating');
        setTimeout(() => slider.classList.remove('animating'), 500);
      };
      
      // Événements
      slider.addEventListener('input', (e) => {
        updateTolerance(e.target.value);
      });
      
      slider.addEventListener('change', (e) => {
        // Recalculer après le changement
        if (window.MC && window.MC.refresh) {
          window.MC.refresh();
        }
      });
      
      // Initialisation
      updateTolerance(slider.value);
    }
  }
  
  // Ajouter un bouton de présets de tolérance
  function addTolerancePresets() {
    const toleranceControl = document.getElementById('tolerance-control');
    if (!toleranceControl || document.getElementById('tolerance-presets')) return;
    
    const presets = document.createElement('div');
    presets.id = 'tolerance-presets';
    presets.className = 'flex gap-2 mt-3';
    presets.innerHTML = `
      <button class="preset-btn flex-1 px-2 py-1 text-xs rounded border border-cyan-400/30 hover:bg-cyan-400/10 transition-all" data-value="0.3">
        <i class="fas fa-microscope mr-1"></i> Précis
      </button>
      <button class="preset-btn flex-1 px-2 py-1 text-xs rounded border border-cyan-400/30 hover:bg-cyan-400/10 transition-all" data-value="1.0">
        <i class="fas fa-balance-scale mr-1"></i> Équilibré
      </button>
      <button class="preset-btn flex-1 px-2 py-1 text-xs rounded border border-cyan-400/30 hover:bg-cyan-400/10 transition-all" data-value="1.8">
        <i class="fas fa-expand mr-1"></i> Flexible
      </button>
    `;
    
    toleranceControl.appendChild(presets);
    
    // Gestionnaires pour les boutons preset
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        const slider = document.getElementById('mc-tolerance');
        if (slider) {
          slider.value = value;
          slider.dispatchEvent(new Event('input'));
          slider.dispatchEvent(new Event('change'));
          
          // Feedback visuel
          btn.classList.add('bg-cyan-400/20', 'border-cyan-400');
          setTimeout(() => {
            btn.classList.remove('bg-cyan-400/20', 'border-cyan-400');
          }, 300);
        }
      });
    });
  }
  
  // Initialisation
  addToleranceSlider();
  addTolerancePresets();
  
  console.log('✅ Addon Slider de Tolérance installé');
  
  // Exposer les fonctions pour utilisation externe
  window.MCToleranceAddon = {
    updateTolerance: (value) => {
      const slider = document.getElementById('mc-tolerance');
      if (slider) {
        slider.value = value;
        slider.dispatchEvent(new Event('input'));
        slider.dispatchEvent(new Event('change'));
      }
    }
  };
})();