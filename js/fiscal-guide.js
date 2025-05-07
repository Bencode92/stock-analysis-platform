// Chercher et remplacer ~80% par ~67% dans js/fiscal-guide.js
// Exemple d'un emplacement à modifier :
// <p class="mb-2"><strong>Charges sociales:</strong> ~67% sur salaire (45% patronales, 22% salariales)</p>

// Modifications pour le curseur tauxRemuneration dans EURL-IR
// Ajouter ces écouteurs d'événements dans la fonction setupSimulator

document.getElementById('status-selector').addEventListener('change', function() {
    const selectedStatus = this.value;
    const isEURLIR = selectedStatus === 'eurl' && !document.getElementById('option-is').checked;
    
    // Référence au slider de répartition rémunération/dividendes
    const sliderContainer = document.getElementById('sim-salaire').closest('.form-group');
    const label = sliderContainer.querySelector('label');
    
    // Griser le slider si EURL-IR est sélectionné
    if (isEURLIR) {
        sliderContainer.classList.add('disabled');
        sliderContainer.querySelector('input').disabled = true;
        // Éviter de dupliquer le message
        if (!label.innerHTML.includes('Non applicable')) {
            label.innerHTML += ' <span class="text-gray-400">(Non applicable en EURL-IR)</span>';
        }
    } else {
        sliderContainer.classList.remove('disabled');
        sliderContainer.querySelector('input').disabled = false;
        // Supprimer le message si présent
        label.innerHTML = label.innerHTML.replace(/ <span class="text-gray-400">\(Non applicable en EURL-IR\)<\/span>/g, '');
    }
});

// Ajouter également un écouteur sur le checkbox de l'option IS
document.getElementById('option-is').addEventListener('change', function() {
    const isEURLSelected = document.getElementById('status-selector').value === 'eurl';
    const isEURLIR = isEURLSelected && !this.checked;
    
    const sliderContainer = document.getElementById('sim-salaire').closest('.form-group');
    const label = sliderContainer.querySelector('label');
    
    if (isEURLIR) {
        sliderContainer.classList.add('disabled');
        sliderContainer.querySelector('input').disabled = true;
        // Éviter de dupliquer le message
        if (!label.innerHTML.includes('Non applicable')) {
            label.innerHTML += ' <span class="text-gray-400">(Non applicable en EURL-IR)</span>';
        }
    } else {
        sliderContainer.classList.remove('disabled');
        sliderContainer.querySelector('input').disabled = false;
        // Supprimer le message si présent
        label.innerHTML = label.innerHTML.replace(/ <span class="text-gray-400">\(Non applicable en EURL-IR\)<\/span>/g, '');
    }
});

// Ajouter du CSS pour la classe disabled dans la fonction addCustomStyles
function addCustomStyles() {
    // Code existant...
    
    // Ajouter styles pour éléments désactivés
    styleElement.textContent += `
        .form-group.disabled {
            opacity: 0.6;
            pointer-events: none;
            user-select: none;
        }
        .form-group.disabled input {
            background-color: rgba(100, 100, 100, 0.2);
        }
    `;
}