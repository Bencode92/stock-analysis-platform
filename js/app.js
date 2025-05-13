// app.js - Logique principale de l'application

document.addEventListener('DOMContentLoaded', function() {
    // Gestionnaire des onglets
    const tabItems = document.querySelectorAll('.tab-item');
    const tabContentContainer = document.getElementById('tab-content-container');
    const questionContainer = document.getElementById('question-container');
    const resultsContainer = document.getElementById('results-container');
    const progressElements = document.querySelectorAll('.progress-info, .progress-bar-container, #progress-steps-container');
    
    // Fonction pour masquer/afficher les éléments en fonction de l'onglet actif
    function updateVisibility(activeTabName) {
        // Si l'onglet Simulateur est actif
        if (activeTabName === 'Simulateur') {
            tabContentContainer.style.display = 'none';
            questionContainer.style.display = 'block';
            progressElements.forEach(el => { if(el) el.style.display = 'flex'; });
        } else {
            tabContentContainer.style.display = 'block';
            questionContainer.style.display = 'none';
            progressElements.forEach(el => { if(el) el.style.display = 'none'; });
        }
    }
    
    // Gestionnaire de clic pour les onglets
    tabItems.forEach(item => {
        item.addEventListener('click', function() {
            // Mise à jour des classes active
            tabItems.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');
            
            // Mettre à jour la visibilité des éléments
            updateVisibility(this.textContent.trim());
        });
    });
    
    // Initialisation - vérifier quel onglet est actif au chargement
    const activeTab = document.querySelector('.tab-item.active');
    if (activeTab) {
        updateVisibility(activeTab.textContent.trim());
    }
    
    // Bouton de démarrage rapide
    const quickStartBtn = document.getElementById('quick-start-btn');
    if (quickStartBtn) {
        quickStartBtn.addEventListener('click', function() {
            // Logic pour démarrer le simulateur en mode rapide
            console.log('Démarrage rapide du simulateur');
            // Implémenter la logique de démarrage rapide ici...
        });
    }
    
    // Simulation de l'horloge du marché
    const marketTimeElement = document.getElementById('marketTime');
    if (marketTimeElement) {
        function updateMarketTime() {
            const now = new Date();
            let hours = now.getHours();
            let minutes = now.getMinutes();
            let seconds = now.getSeconds();
            
            // Ajouter un zéro devant si nécessaire
            hours = hours < 10 ? '0' + hours : hours;
            minutes = minutes < 10 ? '0' + minutes : minutes;
            seconds = seconds < 10 ? '0' + seconds : seconds;
            
            marketTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
        }
        
        // Mise à jour initiale
        updateMarketTime();
        
        // Mise à jour toutes les secondes
        setInterval(updateMarketTime, 1000);
    }
    
    // Mise à jour de la date de dernière mise à jour
    const lastUpdateDateElement = document.getElementById('lastUpdateDate');
    if (lastUpdateDateElement) {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        
        lastUpdateDateElement.textContent = `${day}/${month}/${year}`;
    }
});
