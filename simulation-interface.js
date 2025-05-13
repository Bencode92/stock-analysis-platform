/**
 * simulation-interface.js - Gestion de l'interface pour le simulateur immobilier
 * 
 * Ce script gère l'interaction avec l'utilisateur, le rendu des résultats
 * et l'affichage dynamique des éléments d'interface.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser le simulateur
    const simulateur = new SimulateurImmo();

    // Éléments DOM
    const btnAdvancedToggle = document.getElementById('btn-advanced-toggle');
    const advancedParams = document.getElementById('advanced-params');
    const btnSimulate = document.getElementById('btn-simulate');
    const resultsContainer = document.getElementById('results');
    const objectifSelect = document.getElementById('objectif');
    const rendementMinGroup = document.getElementById('rendement-min-group');

    // Éléments des onglets
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Éléments accordion
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    // Variables pour stocker les instances de graphiques
    let comparisonChart = null;
    let cashflowChart = null;

    // Écouteurs d'événements
    // --------------------

    // Affichage/masquage des paramètres avancés
    btnAdvancedToggle.addEventListener('click', function() {
        advancedParams.classList.toggle('hidden');
        advancedParams.classList.toggle('fade-in');
        btnAdvancedToggle.innerHTML = advancedParams.classList.contains('hidden') 
            ? '<i class="fas fa-sliders-h"></i> Mode Avancé'
            : '<i class="fas fa-times"></i> Masquer les paramètres';
    });

    // Changement d'objectif
    objectifSelect.addEventListener('change', function() {
        rendementMinGroup.style.display = this.value === 'rendement' ? 'block' : 'none';
        if (this.value === 'rendement') {
            rendementMinGroup.classList.add('fade-in');
        }
    });

    // Gestion des onglets
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Retirer la classe active de tous les onglets et contenus
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Ajouter la classe active à l'onglet cliqué
            this.classList.add('active');
            
            // Afficher le contenu correspondant
            const tabId = this.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            tabContent.classList.add('active');
            tabContent.classList.add('fade-in');
        });
    });

    // Gestion des accordions
    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const body = this.nextElementSibling;
            body.classList.toggle('active');
            
            // Changer l'icône
            const icon = this.querySelector('i');
            if (body.classList.contains('active')) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            } else {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        });
    });

    // Lancement de la simulation
    btnSimulate.addEventListener('click', function() {
        // Afficher l'indicateur de chargement
        document.querySelector('.loading').style.display = 'flex';
        
        // Délai artificiel pour montrer le chargement (à retirer en production)
        setTimeout(() => {
            executerSimulation();
            
            // Masquer l'indicateur de chargement
            document.querySelector('.loading').style.display = 'none';
            
            // Afficher les résultats avec animation
            resultsContainer.classList.remove('hidden');
            resultsContainer.classList.add('fade-in');
            
            // Animer les valeurs numériques
            animerResultats();
            
            // Créer les graphiques
            creerGraphiques();
            
            // Défiler vers les résultats
            resultsContainer.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    });

    // Adapter l'interface selon l'appareil
    window.addEventListener('resize', adapterInterfaceSelonAppareil);
    window.addEventListener('DOMContentLoaded', adapterInterfaceSelonAppareil);

    // Fonctions
    // --------------------

    /**
     * Adapte l'interface selon la taille de l'écran
     */
    function adapterInterfaceSelonAppareil() {
        const estMobile = window.innerWidth < 768;
        
        if (estMobile) {
            document.querySelectorAll('.grid-2, .grid-3').forEach(grid => {
                grid.style.display = 'block';
            });
            document.querySelectorAll('.results-card').forEach(card => {
                card.style.marginBottom = '2rem';
            });
        } else {
            document.querySelectorAll('.grid-2').forEach(grid => {
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = '1fr 1fr';
            });
            document.querySelectorAll('.grid-3').forEach(grid => {
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = '1fr 1fr 1fr';
            });
        }
    }

    /**
     * Anime les valeurs numériques des résultats
     */
    function animerResultats() {
        // Animation des prix maximums
        const classiquePrixMax = document.getElementById('classique-prix-max');
        const encheresPrixMax = document.getElementById('encheres-prix-max');
        
        if (classiquePrixMax && encheresPrixMax) {
            // Récupérer les valeurs finales sans formatage
            const prixClassique = simulateur.params.resultats.classique.prixAchat;
            const prixEncheres = simulateur.params.resultats.encheres.prixAchat;
            
            // Animer les prix
            animerNombre(classiquePrixMax, 0, prixClassique, 1200);
            animerNombre(encheresPrixMax, 0, prixEncheres, 1200);
        }
        
        // Animation des rentabilités
        const classiqueRentabilite = document.getElementById('classique-rentabilite');
        const encheresRentabilite = document.getElementById('encheres-rentabilite');
        
        if (classiqueRentabilite && encheresRentabilite) {
            // Récupérer les valeurs de rentabilité
            const rentClassique = simulateur.params.resultats.classique.rendementNet;
            const rentEncheres = simulateur.params.resultats.encheres.rendementNet;
            
            // Animer les rentabilités
            setTimeout(() => {
                classiqueRentabilite.textContent = formaterPourcentage(rentClassique);
                encheresRentabilite.textContent = formaterPourcentage(rentEncheres);
                
                // Mettre à jour les classes des badges selon le niveau de rentabilité
                majClasseRentabilite(classiqueRentabilite.parentElement, rentClassique);
                majClasseRentabilite(encheresRentabilite.parentElement, rentEncheres);
            }, 500);
        }
    }

    /**
     * Met à jour la classe d'un badge de rentabilité selon sa valeur
     * @param {HTMLElement} element - Élément badge à mettre à jour
     * @param {number} rentabilite - Valeur de rentabilité
     */
    function majClasseRentabilite(element, rentabilite) {
        element.classList.remove('tag-success', 'tag-warning', 'tag-danger');
        
        if (rentabilite >= 7) {
            element.classList.add('tag-success');
        } else if (rentabilite >= 4) {
            element.classList.add('tag-warning');
        } else {
            element.classList.add('tag-danger');
        }
    }

    /**
     * Anime un nombre de 0 à sa valeur finale
     * @param {HTMLElement} element - Élément DOM à animer
     * @param {number} debut - Valeur de départ
     * @param {number} fin - Valeur finale
     * @param {number} duree - Durée de l'animation en ms
     */
    function animerNombre(element, debut, fin, duree) {
        const increment = fin > debut ? Math.ceil((fin - debut) / 50) : Math.floor((fin - debut) / 50);
        let current = debut;
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= fin) || (increment < 0 && current <= fin)) {
                clearInterval(timer);
                current = fin;
            }
            element.textContent = formaterMontant(current);
        }, duree / 50);
    }

    /**
     * Crée et affiche les graphiques de comparaison
     */
    function creerGraphiques() {
        // Détruire les graphiques existants
        if (comparisonChart) {
            comparisonChart.destroy();
        }
        if (cashflowChart) {
            cashflowChart.destroy();
        }
        
        // Récupérer les contextes
        const ctxComparison = document.getElementById('chart-comparison').getContext('2d');
        const ctxCashflow = document.getElementById('chart-cashflow').getContext('2d');
        
        // Récupérer les données
        const comparisonData = simulateur.getComparisonChartData();
        const cashflowData = simulateur.getAmortissementData();
        
        // Créer le graphique de comparaison
        comparisonChart = new Chart(ctxComparison, {
            type: 'bar',
            data: comparisonData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: 'Inter'
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Comparaison des options',
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            family: 'Inter',
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (context.datasetIndex === 0 || context.datasetIndex === 1) {
                                        // Pour les prix et coûts, formater en euros
                                        if (context.dataIndex <= 1) {
                                            label += formaterMontant(context.parsed.y);
                                        }
                                        // Pour la rentabilité, formater en pourcentage
                                        else if (context.dataIndex === 2) {
                                            label += formaterPourcentage(context.parsed.y);
                                        }
                                        // Pour le cash-flow, formater en euros par mois
                                        else {
                                            label += formaterMontantMensuel(context.parsed.y);
                                        }
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: 'Inter'
                            },
                            callback: function(value) {
                                // Formater les valeurs en fonction de l'axe
                                if (value >= 1000) {
                                    return value / 1000 + 'k€';
                                }
                                return value + '€';
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: 'Inter'
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
        
        // Créer le graphique d'évolution du cash-flow
        cashflowChart = new Chart(ctxCashflow, {
            type: 'line',
            data: cashflowData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: 'Inter'
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Évolution du cash-flow sur la durée du prêt',
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            family: 'Inter',
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formaterMontant(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: 'Inter'
                            },
                            callback: function(value) {
                                return value / 1000 + 'k€';
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            font: {
                                family: 'Inter'
                            },
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    /**
     * Récupère toutes les valeurs du formulaire
     * @returns {Object} - Données du formulaire
     */
    function collecterDonneesFormulaire() {
        const formData = {
            // Paramètres de base
            apport: document.getElementById('apport').value,
            surface: document.getElementById('surface').value,
            taux: document.getElementById('taux').value,
            duree: document.getElementById('duree').value,
            objectif: document.getElementById('objectif').value,
            rendementMin: document.getElementById('rendement-min').value,
            
            // Paramètres communs
            fraisBancairesDossier: document.getElementById('frais-bancaires-dossier').value,
            fraisBancairesCompte: document.getElementById('frais-bancaires-compte').value,
            fraisGarantie: document.getElementById('frais-garantie').value,
            taxeFonciere: document.getElementById('taxe-fonciere').value,
            vacanceLocative: document.getElementById('vacance-locative').value,
            loyerM2: document.getElementById('loyer-m2').value,
            travauxM2: document.getElementById('travaux-m2').value,
            
            // Paramètres achat classique
            publiciteFonciere: document.getElementById('publicite-fonciere').value,
            droitsMutation: document.getElementById('droits-mutation').value,
            securiteImmobiliere: document.getElementById('securite-immobiliere').value,
            emolumentsVente: document.getElementById('emoluments-vente').value,
            formalites: document.getElementById('formalites').value,
            debours: document.getElementById('debours').value,
            commissionImmo: document.getElementById('commission-immo').value,
            
            // Paramètres vente aux enchères
            droitsEnregistrement: document.getElementById('droits-enregistrement').value,
            coefMutation: document.getElementById('coef-mutation').value,
            emolumentsPoursuivant1: document.getElementById('emoluments-poursuivant-1').value,
            emolumentsPoursuivant2: document.getElementById('emoluments-poursuivant-2').value,
            emolumentsPoursuivant3: document.getElementById('emoluments-poursuivant-3').value,
            emolumentsPoursuivant4: document.getElementById('emoluments-poursuivant-4').value,
            honorairesAvocatCoef: document.getElementById('honoraires-avocat-coef').value,
            honorairesAvocatTVA: document.getElementById('honoraires-avocat-tva').value,
            publiciteFonciereEncheres: document.getElementById('publicite-fonciere-encheres').value,
            fraisFixes: document.getElementById('frais-fixes').value,
            avocatEnchere: document.getElementById('avocat-enchere').value,
            suiviDossier: document.getElementById('suivi-dossier').value,
            cautionPourcent: document.getElementById('caution-pourcent').value,
            cautionRestituee: document.getElementById('caution-restituee').checked
        };
        
        return formData;
    }

    /**
     * Formate un montant en euros
     * @param {number} montant - Montant à formater
     * @param {number} decimales - Nombre de décimales (par défaut 0)
     * @returns {string} - Montant formaté
     */
    function formaterMontant(montant, decimales = 0) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        }).format(montant);
    }

    /**
     * Formate un pourcentage
     * @param {number} valeur - Valeur à formater
     * @param {number} decimales - Nombre de décimales (par défaut 2)
     * @returns {string} - Pourcentage formaté
     */
    function formaterPourcentage(valeur, decimales = 2) {
        return valeur.toFixed(decimales) + ' %';
    }

    /**
     * Formate un montant mensuel
     * @param {number} montant - Montant à formater
     * @returns {string} - Montant formaté
     */
    function formaterMontantMensuel(montant) {
        return formaterMontant(montant) + '/mois';
    }

    /**
     * Applique une classe positive ou négative selon la valeur
     * @param {number} valeur - Valeur à évaluer
     * @returns {string} - Classe CSS
     */
    function getClasseValeur(valeur) {
        return valeur >= 0 ? 'positive' : 'negative';
    }

    /**
     * Affiche un montant avec signe
     * @param {number} montant - Montant à formater
     * @returns {string} - Montant formaté avec signe
     */
    function formaterMontantAvecSigne(montant) {
        return (montant > 0 ? '+' : '') + formaterMontant(montant);
    }

    /**
     * Exécute la simulation et affiche les résultats
     */
    function executerSimulation() {
        // Récupérer les données du formulaire
        const formData = collecterDonneesFormulaire();
        
        // Charger les paramètres dans le simulateur
        simulateur.chargerParametres(formData);
        
        // Exécuter la simulation
        const resultats = simulateur.simuler();
        
        // Afficher les résultats
        afficherResultats(resultats);
    }

    /**
     * Affiche les résultats de la simulation
     * @param {Object} resultats - Résultats de la simulation
     */
    function afficherResultats(resultats) {
        const { classique, encheres } = resultats;
        
        // Vérifier si des résultats ont été trouvés
        if (!classique || !encheres) {
            alert('Impossible de trouver une solution avec les paramètres actuels. Veuillez ajuster vos critères.');
            return;
        }
        
        // Affichage des résultats pour l'achat classique
        document.getElementById('classique-prix-max').textContent = formaterMontant(classique.prixAchat);
        document.getElementById('classique-prix-achat').textContent = formaterMontant(classique.prixAchat);
        document.getElementById('classique-frais-notaire').textContent = formaterMontant(classique.fraisNotaire);
        document.getElementById('classique-commission').textContent = formaterMontant(classique.commission);
        document.getElementById('classique-travaux').textContent = formaterMontant(classique.travaux);
        document.getElementById('classique-frais-bancaires').textContent = formaterMontant(classique.fraisBancaires);
        document.getElementById('classique-total').textContent = formaterMontant(classique.coutTotal);
        document.getElementById('classique-mensualite').textContent = formaterMontantMensuel(classique.mensualite);
        document.getElementById('classique-loyer-net').textContent = formaterMontantMensuel(classique.loyerNet);
        
        const cashflowClassique = document.getElementById('classique-cashflow');
        cashflowClassique.textContent = formaterMontantMensuel(classique.cashFlow);
        cashflowClassique.className = getClasseValeur(classique.cashFlow);
        
        document.getElementById('classique-rentabilite').textContent = formaterPourcentage(classique.rendementNet);
        
        // Affichage des résultats pour la vente aux enchères
        document.getElementById('encheres-prix-max').textContent = formaterMontant(encheres.prixAchat);
        document.getElementById('encheres-prix-achat').textContent = formaterMontant(encheres.prixAchat);
        document.getElementById('encheres-droits').textContent = formaterMontant(encheres.droitsEnregistrement);
        document.getElementById('encheres-emoluments').textContent = formaterMontant(encheres.emolumentsPoursuivant);
        document.getElementById('encheres-honoraires').textContent = formaterMontant(encheres.honorairesAvocat);
        document.getElementById('encheres-publicite').textContent = formaterMontant(encheres.publiciteFonciere);
        document.getElementById('encheres-frais-divers').textContent = formaterMontant(encheres.fraisDivers);
        document.getElementById('encheres-travaux').textContent = formaterMontant(encheres.travaux);
        document.getElementById('encheres-frais-bancaires').textContent = formaterMontant(encheres.fraisBancaires);
        document.getElementById('encheres-total').textContent = formaterMontant(encheres.coutTotal);
        document.getElementById('encheres-mensualite').textContent = formaterMontantMensuel(encheres.mensualite);
        document.getElementById('encheres-loyer-net').textContent = formaterMontantMensuel(encheres.loyerNet);
        
        const cashflowEncheres = document.getElementById('encheres-cashflow');
        cashflowEncheres.textContent = formaterMontantMensuel(encheres.cashFlow);
        cashflowEncheres.className = getClasseValeur(encheres.cashFlow);
        
        document.getElementById('encheres-rentabilite').textContent = formaterPourcentage(encheres.rendementNet);
        
        // Comparatif
        document.getElementById('comp-classique-prix').textContent = formaterMontant(classique.prixAchat);
        document.getElementById('comp-encheres-prix').textContent = formaterMontant(encheres.prixAchat);
        
        const diffPrix = encheres.prixAchat - classique.prixAchat;
        const compPrixDiff = document.getElementById('comp-prix-diff');
        compPrixDiff.textContent = formaterMontantAvecSigne(diffPrix);
        compPrixDiff.className = diffPrix < 0 ? 'positive' : diffPrix > 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-total').textContent = formaterMontant(classique.coutTotal);
        document.getElementById('comp-encheres-total').textContent = formaterMontant(encheres.coutTotal);
        
        const diffTotal = encheres.coutTotal - classique.coutTotal;
        const compTotalDiff = document.getElementById('comp-total-diff');
        compTotalDiff.textContent = formaterMontantAvecSigne(diffTotal);
        compTotalDiff.className = diffTotal < 0 ? 'positive' : diffTotal > 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-loyer').textContent = formaterMontant(classique.loyerBrut);
        document.getElementById('comp-encheres-loyer').textContent = formaterMontant(encheres.loyerBrut);
        
        const diffLoyer = encheres.loyerBrut - classique.loyerBrut;
        const compLoyerDiff = document.getElementById('comp-loyer-diff');
        compLoyerDiff.textContent = formaterMontantAvecSigne(diffLoyer);
        compLoyerDiff.className = diffLoyer > 0 ? 'positive' : diffLoyer < 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-rentabilite').textContent = formaterPourcentage(classique.rendementNet);
        document.getElementById('comp-encheres-rentabilite').textContent = formaterPourcentage(encheres.rendementNet);
        
        const diffRentabilite = encheres.rendementNet - classique.rendementNet;
        const compRentabiliteDiff = document.getElementById('comp-rentabilite-diff');
        compRentabiliteDiff.textContent = formaterPourcentage(diffRentabilite, 2);
        compRentabiliteDiff.className = diffRentabilite > 0 ? 'positive' : diffRentabilite < 0 ? 'negative' : '';
        
        document.getElementById('comp-classique-cashflow').textContent = formaterMontantAvecSigne(classique.cashFlow);
        document.getElementById('comp-encheres-cashflow').textContent = formaterMontantAvecSigne(encheres.cashFlow);
        
        const diffCashflow = encheres.cashFlow - classique.cashFlow;
        const compCashflowDiff = document.getElementById('comp-cashflow-diff');
        compCashflowDiff.textContent = formaterMontantAvecSigne(diffCashflow);
        compCashflowDiff.className = diffCashflow > 0 ? 'positive' : diffCashflow < 0 ? 'negative' : '';
        
        // Mettre à jour les avantages en fonction des résultats réels
        let avantagesClassique = [];
        let avantagesEncheres = [];
        
        // Comparer les prix
        if (classique.prixAchat > encheres.prixAchat) {
            avantagesEncheres.push("Prix d'achat plus avantageux");
        } else {
            avantagesClassique.push("Prix d'achat plus avantageux");
        }
        
        // Comparer les coûts totaux
        if (classique.coutTotal > encheres.coutTotal) {
            avantagesEncheres.push("Coût total inférieur");
        } else {
            avantagesClassique.push("Coût total inférieur");
        }
        
        // Comparer les rendements
        if (classique.rendementNet < encheres.rendementNet) {
            avantagesEncheres.push("Meilleure rentabilité");
        } else {
            avantagesClassique.push("Meilleure rentabilité");
        }
        
        // Comparer les cash-flows
        if (classique.cashFlow < encheres.cashFlow) {
            avantagesEncheres.push("Cash-flow mensuel supérieur");
        } else {
            avantagesClassique.push("Cash-flow mensuel supérieur");
        }
        
        // Avantages fixes
        avantagesClassique.push("Processus d'achat plus simple");
        avantagesClassique.push("Risques juridiques limités");
        avantagesClassique.push("Délais plus courts");
        
        avantagesEncheres.push("Potentiel de valorisation supérieur");
        avantagesEncheres.push("Absence de négociation");
        avantagesEncheres.push("Possibilité de trouver des biens sous-évalués");
        
        // Afficher les avantages
        document.getElementById('classique-avantages').textContent = "Points forts: " + avantagesClassique.join(", ");
        document.getElementById('encheres-avantages').textContent = "Points forts: " + avantagesEncheres.join(", ");
    }
});