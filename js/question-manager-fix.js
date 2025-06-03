// PATCH: Correction de la méthode createSelectOptions
// Rechercher la ligne ~520 dans question-manager.js et remplacer toute la méthode createSelectOptions par :

/**
 * Créer un sélecteur pour une question de type select
 */
createSelectOptions(question) {
    const container = document.createElement('div');
    container.className = 'relative';
    
    const select = document.createElement('select');
    select.id = question.id;
    select.name = question.id;
    select.className = 'bg-blue-900 bg-opacity-50 border border-gray-700 text-white rounded-lg py-3 px-4 appearance-none w-full focus:outline-none focus:ring-2 focus:ring-green-400';
    
    // Option par défaut
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Sélectionnez une option';
    defaultOption.disabled = true;
    defaultOption.selected = !this.answers[question.id];
    select.appendChild(defaultOption);
    
    // Autres options
    question.options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.textContent = option.label;
        optionElement.selected = this.answers[question.id] === option.id;
        select.appendChild(optionElement);
    });
    
    // Ajouter le select dans le container
    container.appendChild(select);
    
    // Ajouter l'icône de la flèche DANS le même container
    const arrowIcon = document.createElement('div');
    arrowIcon.className = 'pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-green-400';
    arrowIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
    container.appendChild(arrowIcon);
    
    return container;
}