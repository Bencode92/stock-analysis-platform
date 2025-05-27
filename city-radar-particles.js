// city-radar-particles.js - Effet de particules flottantes pour le City Radar

function createFloatingParticles() {
    const radarSection = document.getElementById('radar-section');
    if (!radarSection) return;
    
    // Créer le conteneur de particules
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'floating-particles';
    radarSection.insertBefore(particlesContainer, radarSection.firstChild);
    
    // Créer 20 particules
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Position aléatoire
        particle.style.left = Math.random() * 100 + '%';
        
        // Taille aléatoire
        const size = Math.random() * 6 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        
        // Couleur aléatoire parmi un set défini
        const colors = [
            'rgba(99, 102, 241, 0.6)',   // Violet
            'rgba(59, 130, 246, 0.6)',   // Bleu
            'rgba(245, 158, 11, 0.6)',   // Orange
            'rgba(34, 197, 94, 0.6)',    // Vert
            'rgba(168, 85, 247, 0.6)'    // Purple
        ];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        // Durée d'animation aléatoire
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        particle.style.animationDelay = Math.random() * 10 + 's';
        
        particlesContainer.appendChild(particle);
    }
}

// Intégrer dans le CityRadar existant
const originalCreateInterface = window.CityRadar.prototype.createInterface;
window.CityRadar.prototype.createInterface = function() {
    originalCreateInterface.call(this);
    setTimeout(createFloatingParticles, 100);
};
