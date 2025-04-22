/**
 * Correctif pour résoudre les problèmes de validation dans le simulateur PTZ
 * Version: 1.0.0
 * Date: 22/04/2025
 */

// Fonction principale du correctif
window.fixPTZSimulator = function() {
    console.log("Application du correctif PTZ (v1.0.0)");
    
    try {
        // Références aux éléments clés du simulateur
        const projectTypeSelect = document.getElementById('ptz-project-type');
        const zoneSelect = document.getElementById('ptz-zone');
        
        if (!projectTypeSelect || !zoneSelect) {
            console.warn("Éléments du simulateur PTZ non trouvés, correctif non appliqué");
            return false;
        }
        
        // 1. Correctif pour la gestion des événements de changement de type de projet
        function enforceZoneRestrictions() {
            const currentType = projectTypeSelect.value;
            const currentZone = zoneSelect.value;
            
            // Réinitialiser toutes les options
            for (let i = 0; i < zoneSelect.options.length; i++) {
                zoneSelect.options[i].disabled = false;
                zoneSelect.options[i].style.color = '';
            }
            
            // Appliquer les restrictions pour le type "ancien"
            if (currentType === 'ancien') {
                for (let i = 0; i < zoneSelect.options.length; i++) {
                    const optionValue = zoneSelect.options[i].value;
                    if (optionValue === 'A' || optionValue === 'B1') {
                        zoneSelect.options[i].disabled = true;
                        zoneSelect.options[i].style.color = 'red';
                    } else {
                        zoneSelect.options[i].style.color = 'green';
                    }
                }
                
                // Corriger automatiquement la zone si nécessaire
                if (currentZone === 'A' || currentZone === 'B1') {
                    console.log("Correction automatique de la zone pour un logement ancien");
                    zoneSelect.value = 'B2';
                    
                    // Afficher un message d'information
                    const zoneInfoElement = document.getElementById('ptz-zone-info');
                    if (zoneInfoElement) {
                        zoneInfoElement.textContent = "⚠️ Zone ajustée automatiquement (logement ancien uniquement en zones B2/C)";
                        zoneInfoElement.classList.remove('hidden');
                        zoneInfoElement.style.color = 'orange';
                        
                        // Cacher après quelques secondes
                        setTimeout(() => {
                            zoneInfoElement.style.color = '';
                        }, 3000);
                    }
                }
            }
        }
        
        // 2. Remplacer les gestionnaires d'événements existants
        function replaceEventListeners() {
            // Supprimer les anciens gestionnaires en clonant les éléments
            const newProjectTypeSelect = projectTypeSelect.cloneNode(true);
            const newZoneSelect = zoneSelect.cloneNode(true);
            
            if (projectTypeSelect.parentNode) {
                projectTypeSelect.parentNode.replaceChild(newProjectTypeSelect, projectTypeSelect);
            }
            
            if (zoneSelect.parentNode) {
                zoneSelect.parentNode.replaceChild(newZoneSelect, zoneSelect);
            }
            
            // Ajouter les nouveaux gestionnaires
            newProjectTypeSelect.addEventListener('change', function() {
                console.log("Type de projet changé:", this.value);
                enforceZoneRestrictions();
            });
            
            newZoneSelect.addEventListener('change', function() {
                console.log("Zone changée:", this.value);
                enforceZoneRestrictions();
            });
            
            // Mettre à jour les références pour la vérification de validation
            document.getElementById('calculate-ptz-button')?.addEventListener('click', function(e) {
                // Valider avant de simuler
                const projectType = newProjectTypeSelect.value;
                const zone = newZoneSelect.value;
                
                if (projectType === 'ancien' && (zone === 'A' || zone === 'B1')) {
                    e.preventDefault();
                    alert("Pour un logement ancien avec travaux, seules les zones B2 et C sont éligibles.");
                    enforceZoneRestrictions();
                    return false;
                }
            });
        }
        
        // 3. Appliquer le correctif à la fonction de simulation PTZ
        const originalSimulerPTZ = window.simulerPTZ;
        if (typeof originalSimulerPTZ === 'function') {
            window.simulerPTZ = function() {
                // Exécuter la vérification de compatibilité avant simulation
                const projectType = projectTypeSelect.value;
                const zone = zoneSelect.value;
                
                if (projectType === 'ancien' && (zone === 'A' || zone === 'B1')) {
                    alert("Pour un logement ancien avec travaux, seules les zones B2 et C sont éligibles.");
                    enforceZoneRestrictions();
                    return false;
                }
                
                // Si tout est valide, exécuter la fonction originale
                return originalSimulerPTZ.apply(this, arguments);
            };
            console.log("Fonction simulerPTZ sécurisée avec validation");
        }
        
        // Appliquer immédiatement les correctifs
        replaceEventListeners();
        enforceZoneRestrictions();
        
        console.log("Correctif PTZ appliqué avec succès");
        return true;
    } catch (error) {
        console.error("Erreur lors de l'application du correctif PTZ:", error);
        return false;
    }
};

// S'auto-exécuter au chargement du script
(function() {
    console.log("Script de correctif PTZ chargé");
    
    // Tenter d'appliquer le correctif après un court délai pour s'assurer que le DOM est prêt
    setTimeout(function() {
        if (window.fixPTZSimulator) {
            window.fixPTZSimulator();
        }
    }, 500);
})();
