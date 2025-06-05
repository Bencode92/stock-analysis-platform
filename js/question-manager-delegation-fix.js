// question-manager-delegation-fix.js
// Amélioration avec délégation d'événements pour éviter les listeners multiples

(function() {
    if (!window.QuestionManager) return;

    const proto = window.QuestionManager.prototype;
    
    // Override de la méthode init pour ajouter la délégation
    const originalInit = proto.init;
    proto.init = function() {
        originalInit.call(this);
        
        // Délégation d'événements sur le conteneur principal
        this.questionContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.option-btn');
            if (!btn) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const questionId = btn.dataset.questionId;
            const radio = btn.querySelector('input[type="radio"]');
            const checkbox = btn.querySelector('input[type="checkbox"]');
            
            if (radio) {
                // Gérer les radios
                document.querySelectorAll(`.option-btn[data-question-id="${questionId}"]`)
                    .forEach(opt => opt.classList.remove('selected'));
                btn.classList.add('selected');
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (checkbox) {
                // Gérer les checkboxes
                btn.classList.toggle('selected');
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    };
    
    // Désactiver les anciens attachEventListeners
    proto.attachRadioEvents = function() {
        // Ne rien faire - géré par la délégation
    };
    
    proto.attachCheckboxEvents = function() {
        // Ne rien faire - géré par la délégation
    };
    
    console.log('Question Manager: Délégation d\'événements activée');
})();