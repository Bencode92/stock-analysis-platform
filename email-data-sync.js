/**
 * Script de synchronisation des données entre le tableau de bord et la prévisualisation d'emails
 * Ce script permet d'utiliser les données réelles du portefeuille dans les alertes email
 */

// Récupérer les données du portefeuille depuis le localStorage
function getPortfolioData() {
    const portfolioType = localStorage.getItem('portfolioType') || 'moderate';
    const portfolioData = JSON.parse(localStorage.getItem('portfolioData'));
    
    if (!portfolioData) {
        console.warn('Aucune donnée de portefeuille trouvée dans le localStorage');
        return null;
    }
    
    return {
        portfolioType,
        ...portfolioData
    };
}

// Formater les données pour le template d'email
function formatPortfolioDataForEmail(portfolioData) {
    if (!portfolioData) return null;
    
    const { value, performance, monthlyPerformance, components } = portfolioData;
    
    // Extraire la valeur numérique et supprimer les espaces et symboles de devise
    const numericValue = value.replace(/[^0-9,.]/g, '').replace(',', '.');
    
    // Calculer le gain/perte en fonction de la performance
    const perfValue = performance.replace(/[^0-9,.%-]/g, '');
    const perfPercent = parseFloat(perfValue);
    const portfolioValue = parseFloat(numericValue);
    
    // Calculer la valeur du gain/perte (approximative)
    const gainValue = (portfolioValue * perfPercent / 100).toFixed(0);
    const gainSign = performance.startsWith('+') ? '+' : '';
    
    return {
        performanceValue: performance,
        performanceClass: performance.startsWith('+') ? 'positive' : 'negative',
        portfolioValue: value.trim(),
        gainValue: `${gainSign}${gainValue} €`,
        gainClass: performance.startsWith('+') ? 'positive' : 'negative',
        sharpeRatio: '0.72', // Valeur par défaut pour l'exemple
        components: components
    };
}

// Générer des données de marché pour l'email
function generateMarketData() {
    return {
        cac40: {
            value: '8,052.21',
            change: '-0.23%',
            class: 'negative'
        },
        sp500: {
            value: '5,187.52',
            change: '+0.68%',
            class: 'positive'
        },
        nasdaq: {
            value: '16,342.15',
            change: '+1.12%',
            class: 'positive'
        },
        eurusd: {
            value: '1.0865',
            change: '+0.08%',
            class: 'positive'
        }
    };
}

// Générer des actualités pour l'email
function generateNewsData() {
    return [
        {
            title: 'La Fed annonce une réunion exceptionnelle sur les taux',
            description: 'La Réserve fédérale américaine a programmé une réunion de dernière minute, alimentant les spéculations sur les taux d\'intérêt.'
        },
        {
            title: 'LVMH dévoile des résultats supérieurs aux attentes',
            description: 'Le leader mondial du luxe a publié des résultats trimestriels qui dépassent les prévisions des analystes.'
        },
        {
            title: 'Bitcoin franchit un nouveau seuil à 75 000$',
            description: 'La principale cryptomonnaie atteint un nouveau record historique dans un contexte d\'adoption institutionnelle croissante.'
        }
    ];
}

// Préparer toutes les données pour le template d'email
function prepareEmailData() {
    const portfolioData = getPortfolioData();
    const formattedPortfolioData = formatPortfolioDataForEmail(portfolioData);
    const marketData = generateMarketData();
    const newsData = generateNewsData();
    
    // Date actuelle pour l'email
    const now = new Date();
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = now.toLocaleDateString('fr-FR', options);
    
    // Assembler toutes les données
    const emailData = {
        date: formattedDate,
        portfolioType: portfolioData?.portfolioType || 'moderate',
        ...(formattedPortfolioData || {}),
        marketData,
        newsData,
        lastUpdated: new Date().toISOString()
    };
    
    // Sauvegarder dans le localStorage pour la prévisualisation d'email
    localStorage.setItem('emailData', JSON.stringify(emailData));
    
    return emailData;
}

// Fonction pour vérifier si un email a été récemment généré
function checkRecentEmailGeneration() {
    const lastGeneration = localStorage.getItem('lastEmailGeneration');
    if (lastGeneration) {
        const lastTime = new Date(parseInt(lastGeneration));
        const now = new Date();
        
        // Vérifier si moins de 10 minutes se sont écoulées
        const tenMinutes = 10 * 60 * 1000; // 10 minutes en millisecondes
        if (now - lastTime < tenMinutes) {
            return true; // Email récemment généré
        }
    }
    
    return false; // Pas d'email récent
}

// Générer un email et enregistrer le timestamp
function generateEmail() {
    const emailData = prepareEmailData();
    localStorage.setItem('lastEmailGeneration', Date.now().toString());
    return emailData;
}

// Afficher une notification pour informer l'utilisateur
function showEmailNotification() {
    const notification = document.getElementById('emailNotification');
    if (notification) {
        notification.classList.add('show');
    }
}

// Initialisation au chargement du document
document.addEventListener('DOMContentLoaded', function() {
    // Si on est sur la page de prévisualisation d'email
    if (window.location.href.includes('email-preview.html')) {
        // Charger les données depuis le localStorage si disponibles
        if (!localStorage.getItem('emailData')) {
            prepareEmailData();
        }
    }
    
    // Si on est sur le dashboard et qu'un bouton de génération existe
    const generateBtn = document.getElementById('generateEmailBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', function() {
            generateEmail();
            showEmailNotification();
        });
    }
});

// Exporter les fonctions pour utilisation dans d'autres scripts
window.emailDataSync = {
    getPortfolioData,
    formatPortfolioDataForEmail,
    generateMarketData,
    generateNewsData,
    prepareEmailData,
    generateEmail,
    checkRecentEmailGeneration
};
