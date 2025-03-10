/**
 * dynamic-background.js
 * Animation d'arrière-plan dynamique avec graphiques financiers pour TradePulse
 */

class FinancialBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.charts = [];
        this.particles = [];
        this.resizeTimer = null;
        
        // Configuration
        this.chartColor = '#00FF87';
        this.chartGlow = 10;
        this.chartCount = 6;
        this.particleCount = 30;
        
        // Dimensions
        this.width = 0;
        this.height = 0;
        
        // Initialisation
        this.init();
        this.animate();
        
        // Responsive
        window.addEventListener('resize', () => this.handleResize());
    }
    
    init() {
        // Définir la taille du canvas
        this.resize();
        
        // Créer des graphiques
        this.generateCharts();
        
        // Créer des particules
        this.generateParticles();
    }
    
    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        
        this.ctx.scale(dpr, dpr);
    }
    
    handleResize() {
        // Limiter la fréquence de redimensionnement
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.resize();
            this.charts = [];
            this.particles = [];
            this.generateCharts();
            this.generateParticles();
        }, 200);
    }
    
    generateCharts() {
        for (let i = 0; i < this.chartCount; i++) {
            // Créer un nouveau graphique financier
            const chart = {
                points: [],
                pointCount: Math.floor(Math.random() * 20) + 10,
                startX: Math.random() * this.width,
                startY: Math.random() * this.height,
                width: Math.random() * 300 + 100,
                height: Math.random() * 150 + 50,
                opacity: Math.random() * 0.15 + 0.05,
                speed: Math.random() * 0.5 + 0.1,
                direction: Math.random() > 0.5 ? 1 : -1,
                lineWidth: Math.random() * 2 + 1,
                type: Math.random() > 0.3 ? 'line' : 'candle' // Type de graphique
            };
            
            // Générer les points du graphique
            this.generateChartPoints(chart);
            
            this.charts.push(chart);
        }
    }
    
    generateChartPoints(chart) {
        // Générer les points en simulant un mouvement de prix
        let lastY = 0;
        
        for (let i = 0; i < chart.pointCount; i++) {
            const x = (i / (chart.pointCount - 1)) * chart.width;
            
            // Simuler un mouvement de marché aléatoire mais cohérent
            let change;
            if (i === 0) {
                lastY = chart.height / 2;
                change = 0;
            } else {
                // Mouvement brownien avec tendance
                const trend = Math.sin(i / chart.pointCount * Math.PI) * 10;
                change = (Math.random() - 0.5) * 15 + trend;
            }
            
            lastY += change;
            lastY = Math.max(10, Math.min(chart.height - 10, lastY));
            
            if (chart.type === 'line') {
                chart.points.push({ x, y: lastY });
            } else {
                // Pour les bougies (chandeliers japonais)
                const open = lastY;
                const close = open + (Math.random() - 0.5) * 15;
                const high = Math.max(open, close) + Math.random() * 5;
                const low = Math.min(open, close) - Math.random() * 5;
                
                chart.points.push({ x, open, close, high, low });
            }
        }
    }
    
    generateParticles() {
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 3 + 1,
                speed: Math.random() * 0.5 + 0.1,
                angle: Math.random() * Math.PI * 2,
                opacity: Math.random() * 0.4 + 0.1
            });
        }
    }
    
    drawCharts() {
        for (const chart of this.charts) {
            this.ctx.save();
            this.ctx.translate(chart.startX, chart.startY);
            
            if (chart.type === 'line') {
                this.drawLineChart(chart);
            } else {
                this.drawCandleChart(chart);
            }
            
            this.ctx.restore();
            
            // Déplacer le graphique
            chart.startX += chart.speed * chart.direction;
            
            // Rebondir sur les bords
            if (chart.startX < -chart.width) {
                chart.startX = this.width;
                chart.startY = Math.random() * this.height;
                this.generateChartPoints(chart);
            } else if (chart.startX > this.width) {
                chart.startX = -chart.width;
                chart.startY = Math.random() * this.height;
                this.generateChartPoints(chart);
            }
        }
    }
    
    drawLineChart(chart) {
        this.ctx.beginPath();
        this.ctx.lineWidth = chart.lineWidth;
        this.ctx.strokeStyle = `rgba(0, 255, 135, ${chart.opacity})`;
        this.ctx.shadowColor = 'rgba(0, 255, 135, 0.5)';
        this.ctx.shadowBlur = this.chartGlow;
        
        // Dessiner la ligne du graphique
        for (let i = 0; i < chart.points.length; i++) {
            const point = chart.points[i];
            if (i === 0) {
                this.ctx.moveTo(point.x, point.y);
            } else {
                this.ctx.lineTo(point.x, point.y);
            }
        }
        
        this.ctx.stroke();
        
        // Dessiner la zone sous la courbe
        this.ctx.lineTo(chart.points[chart.points.length - 1].x, chart.height);
        this.ctx.lineTo(chart.points[0].x, chart.height);
        this.ctx.closePath();
        this.ctx.fillStyle = `rgba(0, 255, 135, ${chart.opacity * 0.3})`;
        this.ctx.shadowBlur = 0;
        this.ctx.fill();
    }
    
    drawCandleChart(chart) {
        this.ctx.shadowColor = 'rgba(0, 255, 135, 0.5)';
        this.ctx.shadowBlur = this.chartGlow * 0.5;
        
        // Dessiner les chandeliers japonais
        for (const point of chart.points) {
            // Dessiner la mèche (ligne verticale)
            this.ctx.beginPath();
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = `rgba(0, 255, 135, ${chart.opacity * 1.5})`;
            this.ctx.moveTo(point.x, point.high);
            this.ctx.lineTo(point.x, point.low);
            this.ctx.stroke();
            
            // Dessiner le corps de la bougie
            const isUp = point.close >= point.open;
            this.ctx.fillStyle = isUp 
                ? `rgba(0, 255, 135, ${chart.opacity * 1.5})` 
                : `rgba(255, 123, 0, ${chart.opacity * 1.5})`;
            
            const bodyTop = isUp ? point.open : point.close;
            const bodyHeight = Math.abs(point.close - point.open);
            
            this.ctx.fillRect(point.x - 3, bodyTop, 6, bodyHeight);
        }
    }
    
    drawParticles() {
        for (const particle of this.particles) {
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(0, 255, 135, ${particle.opacity})`;
            this.ctx.shadowColor = 'rgba(0, 255, 135, 0.5)';
            this.ctx.shadowBlur = 5;
            this.ctx.fill();
            
            // Déplacer la particule
            particle.x += Math.cos(particle.angle) * particle.speed;
            particle.y += Math.sin(particle.angle) * particle.speed;
            
            // Rebondir sur les bords
            if (particle.x < 0 || particle.x > this.width) {
                particle.angle = Math.PI - particle.angle;
            }
            
            if (particle.y < 0 || particle.y > this.height) {
                particle.angle = -particle.angle;
            }
        }
    }
    
    animate() {
        // Nettoyer le canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Dessiner tous les éléments
        this.drawCharts();
        this.drawParticles();
        
        // Continuer l'animation
        requestAnimationFrame(() => this.animate());
    }
}

// Initialiser l'arrière-plan lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Créer et ajouter un nouvel élément canvas s'il n'existe pas déjà
    if (!document.getElementById('financial-background')) {
        const canvas = document.createElement('canvas');
        canvas.id = 'financial-background';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '0';
        
        // Insérer comme premier enfant du conteneur
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(canvas, container.firstChild);
        } else {
            document.body.appendChild(canvas);
        }
    }
    
    // Initialiser l'animation d'arrière-plan
    new FinancialBackground('financial-background');
});
