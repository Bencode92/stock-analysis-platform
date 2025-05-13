document.addEventListener('DOMContentLoaded', function() {
    // Ajout du texte explicatif pour le rendement minimum
    const rendementMinGroup = document.getElementById('rendement-min-group');
    if (rendementMinGroup) {
        const helpText = document.createElement('span');
        helpText.className = 'form-help';
        helpText.textContent = 'Le cash-flow minimum de 1€ est toujours appliqué en plus du rendement souhaité';
        rendementMinGroup.appendChild(helpText);
    }

    // Mise à jour du texte des options
    const selectElement = document.getElementById('objectif');
    if (selectElement) {
        const options = selectElement.querySelectorAll('option');
        if (options.length >= 2) {
            options[0].textContent = 'Cash-flow positif ≥ 1€';
            options[1].textContent = 'Rendement net minimum + cash-flow ≥ 1€';
        }
    }
});
