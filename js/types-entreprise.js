/**
 * Simulateur de forme juridique d'entreprise - Version améliorée 2025
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: progression du général au particulier, questions qualitatives précises,
 * scoring pondéré contextuel, détection des incompatibilités, simulation pluriannuelle.
 * Dernière mise à jour : Avril 2025 - Information vérifiées pour la législation en vigueur
 */

document.addEventListener('DOMContentLoaded', function() {
    // Vérifier que l'API EntrepriseQCM est disponible
    if (typeof window.EntrepriseQCM === 'undefined') {
        console.error("L'API EntrepriseQCM n'est pas disponible. Assurez-vous que entreprise-qcm.js est chargé avant ce script.");
        return;
    }

    // ===== MODULE 1: BASE DE DONNÉES DES FORMES JURIDIQUES =====
    const FormeJuridiqueDB = {
        // Base de données des formes juridiques mise à jour avec données vérifiées 2025
        structures: [
            {
                id: 'micro-entreprise',
                nom: 'Micro-entreprise',
                categorie: 'Commerciale/Civile',
                associes: '1',
                capital: 'Aucun',
                responsabilite: 'Limitée au patrimoine professionnel (réforme 2022)',
                fiscalite: 'IR',
                fiscaliteOption: 'Non',
                regimeSocial: 'TNS',
                protectionPatrimoine: 'Oui (depuis 2022)',
                chargesSociales: 'Simplifiées',
                fiscal: 'Non applicable (pas de distribution, IR sur bénéfices)',
                regimeTVA: 'Franchise en base (TVA uniquement si dépassement seuils)',
                publicationComptes: 'Non',
                formalites: 'Très simplifiées',
                activite: 'Toutes sauf réglementées',
                leveeFonds: 'Non',
                entreeAssocies: 'Non',
                profilOptimal: 'Entrepreneur solo',
                avantages: 'Simplicité, coût réduit',
                inconvenients: 'Plafond CA (188 700 € vente ou 77 700 € services), abattement forfaitaire au lieu de déduction réelle',
                casConseille: 'Début d\'activité, test',
                casDeconseille: 'Développement ambitieux',
                transmission: 'Non',
                plafondCA: '188 700 € (vente/hébergement) ou 77 700 € (services/libérales)',
                icone: 'fa-rocket'
            },
            // ... autres formes juridiques ...
            // (Le reste des structures reste inchangé)
        ],
        
        // Méthodes d'accès aux données
        getById: function(id) {
            return this.structures.find(forme => forme.id === id);
        },
        
        getCompatibleForms: function(criteres) {
            return this.structures.filter(forme => {
                // Filtrer les formes compatibles avec les critères
                if (criteres.associes && criteres.associes !== forme.associes) return false;
                // Autres critères de filtrage
                return true;
            });
        }
    };

    // Exposer la base de données pour d'autres modules
    window.FormeJuridiqueDB = FormeJuridiqueDB;

    // ===== MODULE 2: SYSTÈME DE SCORING CONTEXTUEL =====
    const ScoringEngine = {
        // Score maximal possible pour le calcul des pourcentages - augmenté pour plus de nuance
        SCORE_MAX: 200,
        
        // Pondérations de base pour les critères d'évaluation
        ponderation: {
            tmiActuel: 1.5,
            horizonProjet: 1.5,
            profilEntrepreneur: 1.5,
            typeActivite: 2.0,
            chiffreAffaires: 2.0,
            tauxMarge: 1.3,
            besoinRevenusImmediats: 1.5,
            cautionBancaire: 1.2,
            montantLevee: 1.0,
            regimeFiscal: 1.0,
            regimeSocial: 1.0,
            transmission: 0.8
        },
        
        /**
         * Ajuste les coefficients en fonction du contexte utilisateur
         */
        ajusterCoefficients: function(userResponses) {
            let coefficients = {...this.ponderation};
            
            // Facteurs d'ajustement contextuel
            // Par exemple: TMI élevé = plus d'importance à l'optimisation fiscale
            if (userResponses.tmiActuel >= 30) {
                coefficients.regimeFiscal = 2.5;
            }
            
            // Besoins de revenus immédiats = plus d'importance au salariat
            if (userResponses.besoinRevenusImmediats) {
                coefficients.besoinRevenusImmediats = 2.5;
            }
            
            // Bien immobilier existant = plus d'importance à la protection patrimoniale
            if (userResponses.bienImmobilier) {
                coefficients.cautionBancaire = 2.0;
            }
            
            // Levée de fonds importante = statut juridique adapté
            if (userResponses.montantLevee > 50000) {
                coefficients.montantLevee = 2.5;
            }
            
            // Marges faibles = plus attention aux charges sociales
            if (userResponses.tauxMarge < 20) {
                coefficients.tauxMarge = 2.0;
            }
            
            return coefficients;
        },
        
        /**
         * Calcule le score pour une forme juridique selon un profil utilisateur
         */
        calculerScore: function(forme, userResponses) {
            // Initialiser les scores par catégorie pour l'équilibre 60/40
            let scoreCriteresStructurels = 0;
            let scoreObjectifs = 0;
            
            let score = 0;
            let details = [];
            let scoreDetails = {}; // Pour l'affichage du détail des scores
            let incompatibilites = [];
            let incompatibiliteMajeure = false;

            // Récupérer les coefficients ajustés au contexte
            const coefficients = this.ajusterCoefficients(userResponses);

            // Vérifier si cette forme a une incompatibilité majeure
            if (window.EntrepriseQCM.checkCompatibility(userResponses).some(fail => fail.formeId === forme.id)) {
                // Si oui, score très bas et on l'indique comme incompatible
                incompatibiliteMajeure = true;
                
                // Récupérer les détails des incompatibilités
                incompatibilites = window.EntrepriseQCM.checkCompatibility(userResponses)
                    .filter(fail => fail.formeId === forme.id);
            }
            
            // PARTIE STRUCTURELLE (60%)
            
            // TMI actuelle et fiscalité
            if (userResponses.tmiActuel <= 11 && forme.fiscalite === 'IR') {
                scoreCriteresStructurels += 20 * coefficients.tmiActuel;
                details.push('TMI faible: avantage fiscal avec régime IR');
            } else if (userResponses.tmiActuel >= 30 && forme.fiscalite === 'IS') {
                scoreCriteresStructurels += 20 * coefficients.tmiActuel;
                details.push('TMI élevée: optimisation via IS recommandée');
            } else if (userResponses.tmiActuel >= 30 && forme.fiscaliteOption === 'Oui') {
                scoreCriteresStructurels += 15 * coefficients.tmiActuel;
                details.push('TMI élevée: option fiscale avantageuse');
            }
            
            // Reste du code de scoring inchangé...
            // (Le reste de la méthode de calcul reste inchangé)
            
            // Score total
            score = scoreCriteresStructurels + scoreObjectifs;
            
            // Stocker les scores détaillés pour l'affichage
            scoreDetails = {
                criteres: scoreCriteresStructurels,
                objectifs: scoreObjectifs,
                total: score,
                pourcentage: Math.round((score / this.SCORE_MAX) * 100)
            };

            // Déterminer la catégorie de compatibilité
            let compatibilite;
            if (incompatibiliteMajeure) {
                compatibilite = 'INCOMPATIBLE';
                score = -100; // Score très négatif pour les incompatibles
            } else if (score < 0) {
                compatibilite = 'DÉCONSEILLÉ';
            } else if (score / this.SCORE_MAX < 0.60) {
                compatibilite = 'PEU ADAPTÉ';
            } else if (score / this.SCORE_MAX < 0.85) {
                compatibilite = 'COMPATIBLE';
            } else {
                compatibilite = 'RECOMMANDÉ';
            }
            
            return {
                forme: forme,
                score: score,
                scoreOriginal: score,
                scoreCriteresStructurels: scoreCriteresStructurels,
                scoreObjectifs: scoreObjectifs,
                details: details,
                scoreDetails: scoreDetails,
                compatibilite: compatibilite,
                incompatibilites: incompatibilites,
                incompatibiliteMajeure: incompatibiliteMajeure
            };
        }
    };

    // ===== MODULE 5: GESTIONNAIRE DES RÉSULTATS =====
    const ResultsManager = {
        // Options de simulation avancées
        simulationParams: {
            ratioSalaire: 50,
            ratioDividendes: 50,
            capitalSocial: 10000,
            capitalLibere: 100,
            caSimulation: 50000,
            fraisReels: 35,
            acreActif: true,
            afficherProjection: false
        },
        
        // Méthodes de génération des résultats...
        // (Le reste du code du ResultsManager reste inchangé)
        
        // Génére les résultats
        generateResults: function(customParams) {
            const resultsContainer = document.getElementById('results-container');
            if (!resultsContainer) return;
            
            // Récupérer les données utilisateur via l'API
            const userResponses = window.EntrepriseQCM.collectUserData();
            
            // Si des paramètres personnalisés sont fournis, les utiliser
            if (customParams) {
                Object.assign(this.simulationParams, customParams);
            }
            
            // Afficher l'indicateur de chargement
            resultsContainer.innerHTML = `
                <div class="flex justify-center items-center py-10">
                    <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-400"></div>
                </div>
            `;
            
            // Le reste de la méthode reste inchangé...
        }
        
        // Le reste des méthodes du ResultsManager reste inchangé
    };

    // Exposer les modules
    window.ScoringEngine = ScoringEngine;
    window.ResultsManager = ResultsManager;
    
    // Ajouter des écouteurs pour gérer les événements spécifiques
    document.addEventListener('toggleCalculationDetails', function(e) {
        const scoreDetails = document.querySelectorAll('.score-details');
        scoreDetails.forEach(detail => {
            detail.classList.toggle('hidden', !e.detail.visible);
        });
    });
});

// Module pour simuler l'impact fiscal des différentes formes juridiques
window.SimulationsFiscales = {
    /**
     * Simule l'impact fiscal pour une forme juridique donnée
     */
    simulerImpactFiscal: function(forme, ca, options = {}) {
        const tauxMarge = options.tauxMarge || 35;
        const benefice = ca * (tauxMarge / 100);
        const resultat = {};
        
        // Utiliser le calculateur fiscal de l'API
        const calculerImpot = window.EntrepriseQCM.utilFiscaux.calculerImpot;
        
        // Cas Micro-entreprise
        if (forme.id === 'micro-entreprise') {
            // Code de simulation pour micro-entreprise...
            return {
                revenueBrut: ca,
                revenueNet: ca * 0.7,  // Approximation simplifiée
                chargesSociales: ca * 0.2,
                impot: ca * 0.1
            };
        }
        
        // Cas IS (SARL, SAS, SASU...)
        if (forme.fiscalite === 'IS') {
            // Code de simulation pour IS...
            return {
                revenueBrut: benefice,
                revenueNet: benefice * 0.65,  // Approximation après IS et IR
                chargesSociales: benefice * 0.2,
                impot: benefice * 0.15
            };
        }
        
        // Cas IR (EI, EURL à l'IR...)
        if (forme.fiscalite === 'IR') {
            // Code de simulation pour IR...
            return {
                revenueBrut: benefice,
                revenueNet: benefice * 0.7,  // Approximation après IR
                chargesSociales: benefice * 0.2,
                impot: benefice * 0.1
            };
        }
        
        // Cas par défaut
        return {
            revenueBrut: benefice,
            revenueNet: benefice * 0.6,
            chargesSociales: benefice * 0.25,
            impot: benefice * 0.15
        };
    }
};