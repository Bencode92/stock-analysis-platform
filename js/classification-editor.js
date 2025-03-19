/**
 * classification-editor.js
 * Ce script ajoute une interface utilisateur pour modifier directement les classifications
 * des actualités, en complément du système de feedback ML.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Ajouter les styles nécessaires s'ils ne sont pas déjà présents
    addClassificationEditorStyles();
});

/**
 * Ajoute les styles CSS nécessaires à l'éditeur de classification
 */
function addClassificationEditorStyles() {
    // Vérifier si les styles existent déjà
    if (document.getElementById('classification-editor-styles')) {
        return;
    }
    
    // Créer l'élément de style
    const styleElement = document.createElement('style');
    styleElement.id = 'classification-editor-styles';
    
    // Définir les styles
    styleElement.textContent = `
        /* Modal d'édition de classification */
        .classification-editor-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        }
        
        .classification-editor-content {
            background-color: rgba(1, 22, 39, 0.95);
            border-radius: 10px;
            box-shadow: 0 0 30px rgba(0, 255, 135, 0.3);
            padding: 25px;
            width: 90%;
            max-width: 450px;
            border: 1px solid rgba(0, 255, 135, 0.3);
            animation: modal-slide-up 0.3s ease-out;
        }
        
        @keyframes modal-slide-up {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .classification-editor-content h3 {
            margin: 0 0 15px 0;
            color: #00FF87;
            font-size: 1.3rem;
            font-weight: 600;
        }
        
        .classification-editor-content p {
            margin-bottom: 20px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 15px;
        }
        
        .editor-form .form-group {
            margin-bottom: 15px;
        }
        
        .editor-form label {
            display: block;
            margin-bottom: 7px;
            color: #fff;
            font-weight: 500;
        }
        
        .editor-select {
            width: 100%;
            padding: 10px;
            background-color: rgba(255, 255, 255, 0.1);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 5px;
            font-size: 0.95rem;
            transition: all 0.2s ease;
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ff87' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 16px;
        }
        
        .editor-select:focus {
            border-color: #00FF87;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 255, 135, 0.3);
        }
        
        .button-group {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 25px;
        }
        
        .editor-btn {
            padding: 10px 20px;
            border-radius: 5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
        }
        
        .editor-btn.save {
            background-color: #00FF87;
            color: #011627;
        }
        
        .editor-btn.save:hover {
            background-color: #00e67a;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0, 255, 135, 0.3);
        }
        
        .editor-btn.cancel {
            background-color: rgba(255, 255, 255, 0.1);
            color: #fff;
        }
        
        .editor-btn.cancel:hover {
            background-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
        }
        
        /* Animation pour les cartes mises à jour */
        .classification-updated {
            animation: highlight-update 1s ease-out;
        }
        
        @keyframes highlight-update {
            0%, 100% {
                box-shadow: none;
            }
            50% {
                box-shadow: 0 0 20px rgba(0, 255, 135, 0.7);
            }
        }
        
        /* Style du bouton d'édition */
        .edit-classification-button {
            background-color: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            font-size: 0.9rem;
            padding: 0.3rem 0.5rem;
            border-radius: 50%;
            transition: all 0.2s ease;
            opacity: 0.6;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 0.5rem;
        }
        
        .edit-classification-button:hover {
            background-color: rgba(0, 255, 135, 0.2);
            color: #00FF87;
            opacity: 1;
        }
        
        .news-item:hover .edit-classification-button {
            opacity: 0.8;
        }
    `;
    
    // Ajouter à la page
    document.head.appendChild(styleElement);
    console.log('✅ Styles pour l\'éditeur de classification ajoutés');
}

// Exposer les fonctions pour une utilisation externe
window.ClassificationEditor = {
    addStyles: addClassificationEditorStyles
};
