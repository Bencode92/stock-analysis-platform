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

    // Écouteurs d'événements
    // --------------------

    // Affichage/masquage des paramètres avancés
    btnAdvancedToggle.addEventListener('click', function() {
        advancedParams.classList.toggle('hidden');
        btnAdvancedToggle.innerHTML = advancedParams.classList.contains('hidden') 
            ? '<i class="fas fa-sliders-h"></i> Mode Avancé'
            : '<i class="fas fa-times"></i> Masquer les paramètres';
    });

    // Changement d'objectif
    objectifSelect.addEventListener('change', function() {
        rendementMinGroup.style.display = this.value === 'rendement' ? 'block' : 'none';
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
            document.getElementById(tabId).classList.add('active');
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
            
            // Afficher les résultats
            resultsContainer.classList.remove('hidden');
            
            // Défiler vers les résultats
            resultsContainer.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    });

    // Fonctions
    // --------------------

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
        document.getElementById('comp-prix-diff').textContent = formaterMontantAvecSigne(encheres.prixAchat - classique.prixAchat);
        
        document.getElementById('comp-classique-total').textContent = formaterMontant(classique.coutTotal);
        document.getElementById('comp-encheres-total').textContent = formaterMontant(encheres.coutTotal);
        document.getElementById('comp-total-diff').textContent = formaterMontantAvecSigne(encheres.coutTotal - classique.coutTotal);
        
        document.getElementById('comp-classique-loyer').textContent = formaterMontant(classique.loyerBrut);
        document.getElementById('comp-encheres-loyer').textContent = formaterMontant(encheres.loyerBrut);
        document.getElementById('comp-loyer-diff').textContent = formaterMontantAvecSigne(encheres.loyerBrut - classique.loyerBrut);
        
        document.getElementById('comp-classique-rentabilite').textContent = formaterPourcentage(classique.rendementNet);
        document.getElementById('comp-encheres-rentabilite').textContent = formaterPourcentage(encheres.rendementNet);
        document.getElementById('comp-rentabilite-diff').textContent = formaterPourcentage(encheres.rendementNet - classique.rendementNet, 2);
        
        document.getElementById('comp-classique-cashflow').textContent = formaterMontantAvecSigne(classique.cashFlow);
        document.getElementById('comp-encheres-cashflow').textContent = formaterMontantAvecSigne(encheres.cashFlow);
        document.getElementById('comp-cashflow-diff').textContent = formaterMontantAvecSigne(encheres.cashFlow - classique.cashFlow);
        
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