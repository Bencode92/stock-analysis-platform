// Patch pour corriger les problèmes de clic sur les cartes
// À inclure après question-manager.js

(function() {
    // Override de la méthode attachRadioEvents
    if (window.QuestionManager) {
        const originalAttachRadioEvents = window.QuestionManager.prototype.attachRadioEvents;
        
        window.QuestionManager.prototype.attachRadioEvents = function(question) {
            const options = document.querySelectorAll(`.option-btn[data-question-id="${question.id}"]`);
            
            options.forEach(option => {
                // Supprimer les anciens listeners pour éviter les doublons
                const newOption = option.cloneNode(true);
                option.parentNode.replaceChild(newOption, option);
                
                // Attacher un seul listener avec capture
                newOption.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Désélectionner toutes les options
                    document.querySelectorAll(`.option-btn[data-question-id="${question.id}"]`)
                        .forEach(opt => opt.classList.remove('selected'));
                    
                    // Sélectionner l'option cliquée
                    newOption.classList.add('selected');
                    
                    // Cocher la case radio
                    const radio = newOption.querySelector('input[type="radio"]');
                    if (radio) {
                        radio.checked = true;
                        
                        // Déclencher l'événement change
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    // Gérer les contrôles additionnels
                    if (question.additionalControls) {
                        question.additionalControls.forEach(control => {
                            if (control.showIf) {
                                const controlElement = document.getElementById(control.id);
                                if (controlElement) {
                                    const parentDiv = controlElement.parentNode.parentNode;
                                    parentDiv.style.display = radio.value === control.showIf ? 'block' : 'none';
                                }
                            }
                        });
                    }
                }, true); // Utiliser la capture
            });
        };
        
        // Améliorer aussi createRadioOptions pour s'assurer que data-question-id est bien défini
        const originalCreateRadioOptions = window.QuestionManager.prototype.createRadioOptions;
        
        window.QuestionManager.prototype.createRadioOptions = function(question) {
            const container = originalCreateRadioOptions.call(this