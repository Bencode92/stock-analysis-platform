/**
 * Corrections et optimisations pour simulation-interface.js
 * Version 1.10 - Fixes critiques et améliorations
 */

// ✅ CORRECTION 1: Problème de duplication des icônes info
function ajouterInfobulle(element, texte) {
    if (!element) return;
    
    // CORRECTION: Vérifier si une infobulle existe déjà pour cet élément spécifique
    const existingIcon = element.querySelector('.info-icon') || 
                        element.parentNode?.querySelector(`.info-icon[data-for="${element.id}"]`);
    
    if (existingIcon) {
        // Mettre à jour le texte existant au lieu de créer une nouvelle icône
        const tooltipText = existingIcon.querySelector('.tooltip-text');
        if (tooltipText) tooltipText.textContent = texte;
        return;
    }
    
    // Créer l'icône avec un identifiant unique
    const infoIcon = document.createElement('span');
    infoIcon.className = 'info-icon';
    infoIcon.dataset.for = element.id || Date.now().toString();
    infoIcon.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <span class="tooltip-text">${texte}</span>
    `;
    
    // Position relative pour l'élément parent si nécessaire
    const position = window.getComputedStyle(element).position;
    if (position !== 'relative' && position !== 'absolute') {
        element.style.position = 'relative';
    }
    
    // Ajouter l'icône
    if (element.tagName === 'LABEL') {
        element.appendChild(infoIcon);
    } else {
        element.parentNode.appendChild(infoIcon);
    }
}

// ✅ CORRECTION 2: Amélioration de la fonction afficherResultats
function afficherResultats(resultats) {
    const { classique, encheres } = resultats;
    
    // Vérification plus robuste des résultats
    if (!classique || !encheres || 
        typeof classique.prixAchat === 'undefined' || 
        typeof encheres.prixAchat === 'undefined') {
        
        console.error('Données de résultats invalides:', { classique, encheres });
        
        if (typeof notificationSystem !== 'undefined') {
            notificationSystem.show(
                'Impossible de calculer les résultats avec les paramètres actuels. Veuillez vérifier vos saisies.',
                'error'
            );
        }
        return;
    }
    
    try {
        // Fonction helper pour mettre à jour un élément en toute sécurité
        function updateElement(id, value, formatter = null) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = formatter ? formatter(value) : value;
                // Animation légère pour indiquer la mise à jour
                element.style.transition = 'all 0.3s ease';
                element.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    element.style.transform = 'scale(1)';
                }, 300);
            }
        }
        
        // CORRECTION: Gestion sécurisée des éléments manquants
        // Achat classique
        updateElement('classique-budget-max', classique.prixAchat, formaterMontant);
        updateElement('classique-surface-max', classique.surface.toFixed(1) + " m²");
        updateElement('classique-prix-achat', classique.prixAchat, formaterMontant);
        updateElement('classique-frais-notaire', classique.fraisNotaire, formaterMontant);
        updateElement('classique-commission', classique.commission, formaterMontant);
        updateElement('classique-travaux', classique.travaux, formaterMontant);
        updateElement('classique-frais-bancaires', classique.fraisBancaires, formaterMontant);
        updateElement('classique-total', classique.coutTotal, formaterMontant);
        updateElement('classique-mensualite', classique.mensualite, formaterMontantMensuel);
        updateElement('classique-loyer-net', classique.loyerNet, formaterMontantMensuel);
        
        // Vente aux enchères
        updateElement('encheres-budget-max', encheres.prixAchat, formaterMontant);
        updateElement('encheres-surface-max', encheres.surface.toFixed(1) + " m²");
        updateElement('encheres-prix-achat', encheres.prixAchat, formaterMontant);
        updateElement('encheres-droits', encheres.droitsEnregistrement, formaterMontant);
        updateElement('encheres-emoluments', encheres.emolumentsPoursuivant, formaterMontant);
        updateElement('encheres-honoraires', encheres.honorairesAvocat, formaterMontant);
        updateElement('encheres-publicite', encheres.publiciteFonciere, formaterMontant);
        updateElement('encheres-frais-divers', encheres.fraisDivers, formaterMontant);
        updateElement('encheres-travaux', encheres.travaux, formaterMontant);
        updateElement('encheres-frais-bancaires', encheres.fraisBancaires, formaterMontant);
        updateElement('encheres-total', encheres.coutTotal, formaterMontant);
        updateElement('encheres-mensualite', encheres.mensualite, formaterMontantMensuel);
        updateElement('encheres-loyer-net', encheres.loyerNet, formaterMontantMensuel);
        
        // CORRECTION: Gestion améliorée du cash-flow avec conteneur
        updateCashflowDisplay('classique-cashflow', classique.cashFlow);
        updateCashflowDisplay('encheres-cashflow', encheres.cashFlow);
        
        // Mise à jour des rentabilités avec animation
        updateRentabiliteDisplay('classique-rentabilite', classique.rendementNet);
        updateRentabiliteDisplay('encheres-rentabilite', encheres.rendementNet);
        
        // Comparatif mis à jour
        updateComparatif(classique, encheres);
        
        // Ajouter les infobulles après un délai pour éviter les conflits
        setTimeout(() => {
            ajouterInfobullesExplicatives();
        }, 100);
        
    } catch (error) {
        console.error('Erreur lors de l\'affichage des résultats:', error);
        if (typeof notificationSystem !== 'undefined') {
            notificationSystem.show('Erreur lors de l\'affichage des résultats.', 'error');
        }
    }
}

// ✅ CORRECTION 3: Fonction helper pour le cash-flow
function updateCashflowDisplay(elementId, cashflowValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Nettoyer le contenu existant
    element.innerHTML = '';
    
    // Créer le nouveau conteneur
    const container = document.createElement('div');
    container.className = 'cashflow-container';
    container.id = elementId; // Conserver l'ID original
    
    // Cash-flow mensuel
    const monthlyDiv = document.createElement('div');
    monthlyDiv.className = `cashflow-monthly ${getClasseValeur(cashflowValue)}`;
    monthlyDiv.textContent = formaterMontantMensuel(cashflowValue);
    
    // Cash-flow annuel
    const annualDiv = document.createElement('div');
    annualDiv.className = `cashflow-annual ${getClasseValeur(cashflowValue)}`;
    annualDiv.textContent = formaterMontantAnnuel(cashflowValue * 12);
    
    container.appendChild(monthlyDiv);
    container.appendChild(annualDiv);
    
    // Remplacer l'élément existant
    element.parentNode.replaceChild(container, element);
}

// ✅ CORRECTION 4: Fonction helper pour les rentabilités
function updateRentabiliteDisplay(elementId, rentabiliteValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = formaterPourcentage(rentabiliteValue);
    
    // Mettre à jour la classe du badge parent
    const badge = element.closest('.tag-success, .tag-warning, .tag-danger') || 
                  element.parentElement;
    
    if (badge) {
        // Supprimer les anciennes classes
        badge.classList.remove('tag-success', 'tag-warning', 'tag-danger');
        
        // Ajouter la nouvelle classe selon la valeur
        if (rentabiliteValue >= 7) {
            badge.classList.add('tag-success');
        } else if (rentabiliteValue >= 4) {
            badge.classList.add('tag-warning');
        } else {
            badge.classList.add('tag-danger');
        }
    }
}

// ✅ CORRECTION 5: Fonction de comparatif optimisée
function updateComparatif(classique, encheres) {
    const comparisons = [
        {
            prefix: 'comp-classique-prix',
            enchPrefix: 'comp-encheres-prix',
            diffId: 'comp-prix-diff',
            classiqueValue: classique.prixAchat,
            encheresValue: encheres.prixAchat,
            formatter: formaterMontant,
            lowerIsBetter: true
        },
        {
            prefix: 'comp-classique-total',
            enchPrefix: 'comp-encheres-total',
            diffId: 'comp-total-diff',
            classiqueValue: classique.coutTotal,
            encheresValue: encheres.coutTotal,
            formatter: formaterMontant,
            lowerIsBetter: true
        },
        {
            prefix: 'comp-classique-rentabilite',
            enchPrefix: 'comp-encheres-rentabilite',
            diffId: 'comp-rentabilite-diff',
            classiqueValue: classique.rendementNet,
            encheresValue: encheres.rendementNet,
            formatter: formaterPourcentage,
            lowerIsBetter: false
        },
        {
            prefix: 'comp-classique-cashflow',
            enchPrefix: 'comp-encheres-cashflow',
            diffId: 'comp-cashflow-diff',
            classiqueValue: classique.cashFlow,
            encheresValue: encheres.cashFlow,
            formatter: formaterMontantMensuel,
            lowerIsBetter: false
        }
    ];
    
    comparisons.forEach(comp => {
        // Mettre à jour les valeurs
        const classiqueEl = document.getElementById(comp.prefix);
        const encheresEl = document.getElementById(comp.enchPrefix);
        const diffEl = document.getElementById(comp.diffId);
        
        if (classiqueEl) classiqueEl.textContent = comp.formatter(comp.classiqueValue);
        if (encheresEl) encheresEl.textContent = comp.formatter(comp.encheresValue);
        
        if (diffEl) {
            const diff = comp.encheresValue - comp.classiqueValue;
            diffEl.textContent = formaterMontantAvecSigne(diff);
            
            // Classe CSS selon si c'est mieux ou pas
            let className = '';
            if (comp.lowerIsBetter) {
                className = diff < 0 ? 'positive' : diff > 0 ? 'negative' : '';
            } else {
                className = diff > 0 ? 'positive' : diff < 0 ? 'negative' : '';
            }
            diffEl.className = className;
        }
    });
}

// ✅ CORRECTION 6: Debounce amélioré pour les sliders
function createDebouncedSliderHandler(callback, delay = 300) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => callback.apply(this, args), delay);
    };
}

// ✅ CORRECTION 7: Gestion d'erreurs globale
window.addEventListener('error', function(event) {
    console.error('Erreur JavaScript globale:', event.error);
    
    if (typeof notificationSystem !== 'undefined') {
        notificationSystem.show(
            'Une erreur inattendue s\'est produite. Veuillez actualiser la page.',
            'error'
        );
    }
});

// ✅ CORRECTION 8: Protection contre les valeurs nulles dans les calculs
function safeCalculate(operation, fallback = 0) {
    try {
        const result = operation();
        return isNaN(result) || !isFinite(result) ? fallback : result;
    } catch (error) {
        console.warn('Erreur de calcul:', error);
        return fallback;
    }
}

// ✅ CORRECTION 9: Amélioration de la fonction collecterDonneesFormulaire
function collecterDonneesFormulaire() {
    const formData = {};
    
    // Liste des champs avec valeurs par défaut
    const fields = [
        { id: 'apport', default: 20000, type: 'number' },
        { id: 'surface', default: 50, type: 'number' },
        { id: 'taux', default: 3.5, type: 'number' },
        { id: 'duree', default: 20, type: 'number' },
        { id: 'loyer-m2', default: 15, type: 'number' },
        { id: 'prix-m2-marche', default: 3000, type: 'number' },
        { id: 'vacance-locative', default: 5, type: 'number' },
        { id: 'travaux-m2', default: 200, type: 'number' }
        // Ajouter d'autres champs selon besoin
    ];
    
    fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            let value = element.value;
            
            if (field.type === 'number') {
                value = parseFloat(value) || field.default;
                // Validation des bornes
                if (value < 0) value = field.default;
            }
            
            formData[field.id.replace('-', '_')] = value;
        } else {
            formData[field.id.replace('-', '_')] = field.default;
        }
    });
    
    // Mode de calcul avec fallback
    const calculationModeEl = document.querySelector('input[name="calculation-mode"]:checked');
    formData.calculationMode = calculationModeEl ? calculationModeEl.value : 'loyer-mensualite';
    
    return formData;
}

// ✅ CORRECTION 10: Style CSS pour les animations d'erreur
const errorStyles = `
    .field-error {
        color: #ef4444;
        font-size: 0.875rem;
        margin-top: 0.25rem;
        animation: fadeInError 0.3s ease;
    }
    
    @keyframes fadeInError {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .border-red-500 {
        border-color: #ef4444 !important;
        box-shadow: 0 0 0 1px #ef4444;
    }
    
    .border-green-500 {
        border-color: #10b981 !important;
        box-shadow: 0 0 0 1px #10b981;
    }
    
    .cashflow-container {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .cashflow-monthly {
        font-weight: 600;
        font-size: 1.1rem;
    }
    
    .cashflow-annual {
        font-size: 0.9rem;
        opacity: 0.8;
    }
    
    .positive {
        color: #10b981;
    }
    
    .negative {
        color: #ef4444;
    }
`;

// Ajouter les styles si pas déjà présents
if (!document.getElementById('correction-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'correction-styles';
    styleEl.textContent = errorStyles;
    document.head.appendChild(styleEl);
}

// Export des fonctions pour tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ajouterInfobulle,
        afficherResultats,
        updateCashflowDisplay,
        updateRentabiliteDisplay,
        updateComparatif,
        createDebouncedSliderHandler,
        safeCalculate,
        collecterDonneesFormulaire
    };
}