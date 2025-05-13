// Script de débogage pour le simulateur immobilier

document.addEventListener('DOMContentLoaded', function() {
    console.log('Script de débogage chargé');
    
    // Vérifie si les scripts sont chargés
    console.log('SimulateurImmo disponible:', typeof SimulateurImmo !== 'undefined');
    
    // Cherche le bouton simuler
    const btnSimulate = document.getElementById('btn-simulate');
    console.log('Bouton simuler trouvé:', !!btnSimulate);
    
    if (btnSimulate) {
        // Ajouter notre propre gestionnaire d'événements
        btnSimulate.addEventListener('click', function() {
            console.log('Bouton cliqué!');
            try {
                // Créer une instance du simulateur
                const simulateur = new SimulateurImmo();
                console.log('Simulateur créé avec succès');
                
                // Simuler des valeurs de base pour éviter les erreurs
                const formData = {
                    apport: document.getElementById('apport')?.value || 20000,
                    surface: document.getElementById('surface')?.value || 50,
                    taux: document.getElementById('taux')?.value || 3.5,
                    duree: document.getElementById('duree')?.value || 20,
                    objectif: document.getElementById('objectif')?.value || 'cashflow',
                    rendementMin: document.getElementById('rendement-min')?.value || 5,
                };
                
                // Créer des éléments manquants si nécessaire
                if (!document.getElementById('frais-bancaires-dossier')) {
                    console.log('Création d\'éléments manquants pour les paramètres avancés');
                    createHiddenElement('frais-bancaires-dossier', 2000);
                    createHiddenElement('frais-bancaires-compte', 710);
                    createHiddenElement('frais-garantie', 1.3709);
                    createHiddenElement('taxe-fonciere', 1);
                    createHiddenElement('vacance-locative', 8);
                    createHiddenElement('loyer-m2', 12);
                    createHiddenElement('travaux-m2', 400);
                    
                    // Paramètres classique
                    createHiddenElement('publicite-fonciere', 0.72);
                    createHiddenElement('droits-mutation', 5.81);
                    createHiddenElement('securite-immobiliere', 0.10);
                    createHiddenElement('emoluments-vente', 1.12);
                    createHiddenElement('formalites', 0.28);
                    createHiddenElement('debours', 0.13);
                    createHiddenElement('commission-immo', 5);
                    
                    // Paramètres enchères
                    createHiddenElement('droits-enregistrement', 5.70);
                    createHiddenElement('coef-mutation', 2.37);
                    createHiddenElement('emoluments-poursuivant-1', 7);
                    createHiddenElement('emoluments-poursuivant-2', 3);
                    createHiddenElement('emoluments-poursuivant-3', 2);
                    createHiddenElement('emoluments-poursuivant-4', 1);
                    createHiddenElement('honoraires-avocat-coef', 0.25);
                    createHiddenElement('honoraires-avocat-tva', 20);
                    createHiddenElement('publicite-fonciere-encheres', 0.10);
                    createHiddenElement('frais-fixes', 50);
                    createHiddenElement('avocat-enchere', 300);
                    createHiddenElement('suivi-dossier', 1200);
                    createHiddenElement('caution-pourcent', 5);
                    
                    // Élément spécial pour checkbox
                    const cautionRestitueeDom = document.createElement('input');
                    cautionRestitueeDom.type = 'checkbox';
                    cautionRestitueeDom.id = 'caution-restituee';
                    cautionRestitueeDom.checked = true;
                    cautionRestitueeDom.style.display = 'none';
                    document.body.appendChild(cautionRestitueeDom);
                }
                
                // Charger les paramètres
                simulateur.chargerParametres(collecterDonneesFormulaire());
                
                // Exécuter la simulation
                console.log('Lancement de la simulation...');
                const resultats = simulateur.simuler();
                console.log('Résultats de la simulation:', resultats);
                
                // Afficher les résultats
                afficherResultats(resultats);
                
                // Afficher le conteneur de résultats
                const resultsContainer = document.getElementById('results');
                if (resultsContainer) {
                    resultsContainer.classList.remove('hidden');
                    resultsContainer.scrollIntoView({ behavior: 'smooth' });
                } else {
                    console.error('Conteneur de résultats non trouvé');
                }
                
            } catch (error) {
                console.error('Erreur lors de la simulation:', error);
                alert('Erreur lors de la simulation: ' + error.message);
            }
        });
    } else {
        console.error('Bouton simuler non trouvé');
    }
    
    // Fonction pour créer des éléments cachés
    function createHiddenElement(id, value) {
        const element = document.createElement('input');
        element.type = 'hidden';
        element.id = id;
        element.value = value;
        document.body.appendChild(element);
        return element;
    }
    
    // Fonction pour collecter les données du formulaire
    function collecterDonneesFormulaire() {
        const formData = {
            // Paramètres de base
            apport: document.getElementById('apport')?.value || 20000,
            surface: document.getElementById('surface')?.value || 50,
            taux: document.getElementById('taux')?.value || 3.5,
            duree: document.getElementById('duree')?.value || 20,
            objectif: document.getElementById('objectif')?.value || 'cashflow',
            rendementMin: document.getElementById('rendement-min')?.value || 5,
            
            // Paramètres communs
            fraisBancairesDossier: document.getElementById('frais-bancaires-dossier')?.value || 2000,
            fraisBancairesCompte: document.getElementById('frais-bancaires-compte')?.value || 710,
            fraisGarantie: document.getElementById('frais-garantie')?.value || 1.3709,
            taxeFonciere: document.getElementById('taxe-fonciere')?.value || 1,
            vacanceLocative: document.getElementById('vacance-locative')?.value || 8,
            loyerM2: document.getElementById('loyer-m2')?.value || 12,
            travauxM2: document.getElementById('travaux-m2')?.value || 400,
            
            // Paramètres achat classique
            publiciteFonciere: document.getElementById('publicite-fonciere')?.value || 0.72,
            droitsMutation: document.getElementById('droits-mutation')?.value || 5.81,
            securiteImmobiliere: document.getElementById('securite-immobiliere')?.value || 0.10,
            emolumentsVente: document.getElementById('emoluments-vente')?.value || 1.12,
            formalites: document.getElementById('formalites')?.value || 0.28,
            debours: document.getElementById('debours')?.value || 0.13,
            commissionImmo: document.getElementById('commission-immo')?.value || 5,
            
            // Paramètres vente aux enchères
            droitsEnregistrement: document.getElementById('droits-enregistrement')?.value || 5.70,
            coefMutation: document.getElementById('coef-mutation')?.value || 2.37,
            emolumentsPoursuivant1: document.getElementById('emoluments-poursuivant-1')?.value || 7,
            emolumentsPoursuivant2: document.getElementById('emoluments-poursuivant-2')?.value || 3,
            emolumentsPoursuivant3: document.getElementById('emoluments-poursuivant-3')?.value || 2,
            emolumentsPoursuivant4: document.getElementById('emoluments-poursuivant-4')?.value || 1,
            honorairesAvocatCoef: document.getElementById('honoraires-avocat-coef')?.value || 0.25,
            honorairesAvocatTVA: document.getElementById('honoraires-avocat-tva')?.value || 20,
            publiciteFonciereEncheres: document.getElementById('publicite-fonciere-encheres')?.value || 0.10,
            fraisFixes: document.getElementById('frais-fixes')?.value || 50,
            avocatEnchere: document.getElementById('avocat-enchere')?.value || 300,
            suiviDossier: document.getElementById('suivi-dossier')?.value || 1200,
            cautionPourcent: document.getElementById('caution-pourcent')?.value || 5,
            cautionRestituee: document.getElementById('caution-restituee')?.checked !== false
        };
        
        console.log('Données du formulaire collectées:', formData);
        return formData;
    }
    
    // Fonction pour afficher les résultats
    function afficherResultats(resultats) {
        const { classique, encheres } = resultats;
        
        // Vérifier si des résultats ont été trouvés
        if (!classique || !encheres) {
            alert('Impossible de trouver une solution avec les paramètres actuels. Veuillez ajuster vos critères.');
            return;
        }
        
        // Helper pour mettre à jour un élément s'il existe
        function updateElement(id, value, formatter = (x) => x) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = formatter(value);
            } else {
                console.warn(`Élément #${id} non trouvé`);
            }
        }
        
        // Formatage des montants
        function formaterMontant(montant, decimales = 0) {
            return new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales
            }).format(montant);
        }
        
        function formaterPourcentage(valeur, decimales = 2) {
            return valeur.toFixed(decimales) + ' %';
        }
        
        function formaterMontantMensuel(montant) {
            return formaterMontant(montant) + '/mois';
        }
        
        function formaterMontantAvecSigne(montant) {
            return (montant > 0 ? '+' : '') + formaterMontant(montant);
        }
        
        function getClasseValeur(valeur) {
            return valeur >= 0 ? 'positive' : 'negative';
        }
        
        try {
            // Résultats achat classique
            updateElement('classique-prix-max', classique.prixAchat, formaterMontant);
            updateElement('classique-prix-achat', classique.prixAchat, formaterMontant);
            updateElement('classique-frais-notaire', classique.fraisNotaire, formaterMontant);
            updateElement('classique-commission', classique.commission, formaterMontant);
            updateElement('classique-travaux', classique.travaux, formaterMontant);
            updateElement('classique-frais-bancaires', classique.fraisBancaires, formaterMontant);
            updateElement('classique-total', classique.coutTotal, formaterMontant);
            updateElement('classique-mensualite', classique.mensualite, formaterMontantMensuel);
            updateElement('classique-loyer-net', classique.loyerNet, formaterMontantMensuel);
            updateElement('classique-rentabilite', classique.rendementNet, formaterPourcentage);
            
            const cashflowClassique = document.getElementById('classique-cashflow');
            if (cashflowClassique) {
                cashflowClassique.textContent = formaterMontantMensuel(classique.cashFlow);
                cashflowClassique.className = getClasseValeur(classique.cashFlow);
            }
            
            // Résultats vente aux enchères
            updateElement('encheres-prix-max', encheres.prixAchat, formaterMontant);
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
            updateElement('encheres-rentabilite', encheres.rendementNet, formaterPourcentage);
            
            const cashflowEncheres = document.getElementById('encheres-cashflow');
            if (cashflowEncheres) {
                cashflowEncheres.textContent = formaterMontantMensuel(encheres.cashFlow);
                cashflowEncheres.className = getClasseValeur(encheres.cashFlow);
            }
            
            // Comparatif
            updateElement('comp-classique-prix', classique.prixAchat, formaterMontant);
            updateElement('comp-encheres-prix', encheres.prixAchat, formaterMontant);
            updateElement('comp-prix-diff', encheres.prixAchat - classique.prixAchat, formaterMontantAvecSigne);
            
            updateElement('comp-classique-total', classique.coutTotal, formaterMontant);
            updateElement('comp-encheres-total', encheres.coutTotal, formaterMontant);
            updateElement('comp-total-diff', encheres.coutTotal - classique.coutTotal, formaterMontantAvecSigne);
            
            updateElement('comp-classique-loyer', classique.loyerBrut, formaterMontant);
            updateElement('comp-encheres-loyer', encheres.loyerBrut, formaterMontant);
            updateElement('comp-loyer-diff', encheres.loyerBrut - classique.loyerBrut, formaterMontantAvecSigne);
            
            updateElement('comp-classique-rentabilite', classique.rendementNet, formaterPourcentage);
            updateElement('comp-encheres-rentabilite', encheres.rendementNet, formaterPourcentage);
            updateElement('comp-rentabilite-diff', encheres.rendementNet - classique.rendementNet, formaterPourcentage);
            
            updateElement('comp-classique-cashflow', classique.cashFlow, formaterMontantAvecSigne);
            updateElement('comp-encheres-cashflow', encheres.cashFlow, formaterMontantAvecSigne);
            updateElement('comp-cashflow-diff', encheres.cashFlow - classique.cashFlow, formaterMontantAvecSigne);
            
            // Avantages comparatifs
            let avantagesClassique = [];
            let avantagesEncheres = [];
            
            if (classique.prixAchat > encheres.prixAchat) {
                avantagesEncheres.push("Prix d'achat plus avantageux");
            } else {
                avantagesClassique.push("Prix d'achat plus avantageux");
            }
            
            if (classique.coutTotal > encheres.coutTotal) {
                avantagesEncheres.push("Coût total inférieur");
            } else {
                avantagesClassique.push("Coût total inférieur");
            }
            
            if (classique.rendementNet < encheres.rendementNet) {
                avantagesEncheres.push("Meilleure rentabilité");
            } else {
                avantagesClassique.push("Meilleure rentabilité");
            }
            
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
            
            updateElement('classique-avantages', "Points forts: " + avantagesClassique.join(", "));
            updateElement('encheres-avantages', "Points forts: " + avantagesEncheres.join(", "));
            
            console.log('Affichage des résultats terminé avec succès');
        } catch (error) {
            console.error('Erreur lors de l\'affichage des résultats:', error);
        }
    }
});
