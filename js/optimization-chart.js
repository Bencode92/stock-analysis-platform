// optimization-chart.js - Module pour le graphique d'optimisation du ratio rémunération/dividendes
// Version 1.0 - Mai 2025

(function() {
    // Vérifier que les dépendances sont chargées
    document.addEventListener('DOMContentLoaded', function() {
        // Attendre que les modules fiscal soient chargés
        const checkDependencies = setInterval(() => {
            if (window.FiscalUtils && window.SimulationsFiscales) {
                clearInterval(checkDependencies);
                console.log("Dépendances pour optimization-chart.js trouvées, prêt à générer des graphiques");
            }
        }, 200);
    });

    // Fonction pour générer le graphique d'optimisation
    window.genererGraphiqueOptimisation = function(params, containerId = 'optimization-chart') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Conteneur ${containerId} non trouvé`);
            return;
        }

        // Vider le conteneur
        container.innerHTML = '';

        // Créer l'élément canvas pour le graphique
        const canvas = document.createElement('canvas');
        canvas.id = 'ratio-optimization-chart';
        canvas.style.width = '100%';
        canvas.style.height = '300px';
        container.appendChild(canvas);

        // Vérifier que Chart.js est disponible
        if (!window.Chart) {
            // Charger Chart.js dynamiquement si nécessaire
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
            script.onload = function() {
                createChart(canvas, params);
            };
            document.head.appendChild(script);
        } else {
            createChart(canvas, params);
        }
    };

    function createChart(canvas, params) {
        // Générer les données pour le graphique
        const donnees = window.FiscalUtils.genererDonneesGraphiqueOptimisation(
            params,
            (p) => window.SimulationsFiscales.simulerSASU(p)
        );

        // Trouver le ratio optimal (celui qui donne le revenu net maximal)
        let maxNet = 0;
        let ratioOptimal = 50;
        donnees.forEach(point => {
            if (point.revenuNet > maxNet) {
                maxNet = point.revenuNet;
                ratioOptimal = point.ratio;
            }
        });

        // Extraire les données pour le graphique
        const labels = donnees.map(d => d.ratio + '%');
        const dataRevenuNet = donnees.map(d => d.revenuNet);
        const dataRemuneration = donnees.map(d => d.repartition.remuneration);
        const dataDividendes = donnees.map(d => d.repartition.dividendes);

        // Formateur pour les valeurs monétaires
        const formatMonetaire = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        });

        // Créer le graphique
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenu net total',
                        data: dataRevenuNet,
                        borderColor: '#00FF87',
                        backgroundColor: 'rgba(0, 255, 135, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'Rémunération nette',
                        data: dataRemuneration,
                        borderColor: '#60A5FA',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Dividendes nets',
                        data: dataDividendes,
                        borderColor: '#EC4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                return `${context.dataset.label}: ${formatMonetaire.format(value)}`;
                            },
                            title: function(tooltipItems) {
                                return `Ratio rémunération: ${tooltipItems[0].label}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#E6E6E6'
                        }
                    },
                    // Annotation pour marquer le point optimal
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                xMin: ratioOptimal + '%',
                                xMax: ratioOptimal + '%',
                                borderColor: 'rgba(0, 255, 135, 0.5)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: `Optimal: ${ratioOptimal}%`,
                                    enabled: true,
                                    position: 'top',
                                    backgroundColor: 'rgba(0, 255, 135, 0.7)',
                                    color: '#011627'
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#E6E6E6',
                            callback: function(value) {
                                return formatMonetaire.format(value);
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#E6E6E6'
                        }
                    }
                }
            }
        });

        // Ajouter une explication textuelle sous le graphique
        const explanation = document.createElement('div');
        explanation.className = 'text-sm mt-4 p-3 bg-blue-900 bg-opacity-20 rounded-md';
        explanation.innerHTML = `
            <p class="mb-2"><strong>Analyse :</strong> Le ratio optimal de rémunération/dividendes est de <span class="text-green-400 font-bold">${ratioOptimal}%</span>.</p>
            <p class="mb-2">À ce ratio, votre revenu net total est de <span class="text-green-400 font-bold">${formatMonetaire.format(maxNet)}</span>.</p>
            <p>Ce ratio optimal varie en fonction de votre TMI et des seuils des tranches d'impôt.</p>
        `;
        container.appendChild(explanation);

        return chart;
    }
})();