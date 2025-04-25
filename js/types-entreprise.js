/**
 * Simulateur de forme juridique d'entreprise - Version améliorée 2025
 * Ce script permet de recommander une forme juridique adaptée au profil de l'utilisateur
 * basé sur les réponses au questionnaire.
 * Améliorations: progression du général au particulier, questions qualitatives précises,
 * scoring pondéré contextuel, détection des incompatibilités, simulation pluriannuelle.
 * Dernière mise à jour : Avril 2025 - Information vérifiées pour la législation en vigueur
 */

document.addEventListener('DOMContentLoaded', function() {
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
            {
                id: 'ei',
                nom: 'Entreprise Individuelle (EI)',
                categorie: 'Commerciale/Civile',
                associes: '1',
                capital: 'Aucun',
                responsabilite: 'Limitée au patrimoine professionnel (réforme 2022)',
                fiscalite: 'IR',
                fiscaliteOption: 'Non',
                regimeSocial: 'TNS',
                protectionPatrimoine: 'Oui (depuis 2022)',
                chargesSociales: 'Sur bénéfices',
                fiscal: 'Non applicable (pas de distribution, IR sur bénéfices)',
                regimeTVA: 'Oui',
                publicationComptes: 'Non',
                formalites: 'Très simplifiées',
                activite: 'Toutes sauf réglementées',
                leveeFonds: 'Non',
                entreeAssocies: 'Non',
                profilOptimal: 'Entrepreneur solo',
                avantages: 'Simplicité, coût réduit',
                inconvenients: 'Peu de protection en cas de faute de gestion',
                casConseille: 'Artisan, commerçant',
                casDeconseille: 'Projet à risque élevé',
                transmission: 'Non',
                plafondCA: 'Aucun plafond',
                icone: 'fa-user'
            },
            {
                id: 'eurl',
                nom: 'EURL',
                categorie: 'Commerciale',
                associes: '1',
                capital: '1€ minimum',
                responsabilite: 'Limitée aux apports',
                fiscalite: 'IR ou IS',
                fiscaliteOption: 'Oui',
                regimeSocial: 'TNS ou Assimilé salarié',
                protectionPatrimoine: 'Oui',
                chargesSociales: 'Sur rémunération',
                fiscal: 'Dividendes possibles',
                regimeTVA: 'Oui',
                publicationComptes: 'Oui',
                formalites: 'Modérées',
                activite: 'Toutes',
                leveeFonds: 'Limité',
                entreeAssocies: 'Possible',
                profilOptimal: 'Entrepreneur solo cherchant séparation patrimoine',
                avantages: 'Protection du patrimoine personnel, flexibilité fiscale',
                inconvenients: 'Formalisme, coûts de création',
                casConseille: 'Activité avec risques',
                casDeconseille: 'Petit CA sans risque',
                transmission: 'Oui',
                plafondCA: 'Aucun plafond',
                icone: 'fa-shield-alt'
            },
            {
                id: 'sasu',
                nom: 'SASU',
                categorie: 'Commerciale',
                associes: '1',
                capital: '1€ minimum',
                responsabilite: 'Limitée aux apports',
                fiscalite: 'IS',
                fiscaliteOption: 'Non',
                regimeSocial: 'Assimilé salarié',
                protectionPatrimoine: 'Oui',
                chargesSociales: 'Sur rémunération',
                fiscal: 'Dividendes possibles',
                regimeTVA: 'Oui',
                publicationComptes: 'Oui',
                formalites: 'Modérées',
                activite: 'Toutes',
                leveeFonds: 'Oui',
                entreeAssocies: 'Facile',
                profilOptimal: 'Entrepreneur solo cherchant statut salarié',
                avantages: 'Protection sociale du régime général, flexibilité statutaire',
                inconvenients: 'IS obligatoire, charges sociales élevées',
                casConseille: 'Salaire élevé, levée de fonds',
                casDeconseille: 'Petit CA',
                transmission: 'Oui',
                plafondCA: 'Aucun plafond',
                icone: 'fa-chart-line'
            },
            
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
            transmission: 0.8,
            zoneImplantation: 1.2,
            garantieDecennale: 1.5,
            multiEtablissements: 1.0,
            structureHolding: 1.3,
            regimeMatrimonial: 1.2
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

            // Projet avec garantie décennale = importance protection
            if (userResponses.garantieDecennale) {
                coefficients.garantieDecennale = 2.5;
                coefficients.cautionBancaire = 2.0;
            }

            // Structure holding = importance structure adaptée
            if (userResponses.structureHolding) {
                coefficients.structureHolding = 2.5;
            }

            // Régime matrimonial communauté = importance protection
            if (userResponses.estMarie && userResponses.regimeMatrimonial === 'communaute-reduite') {
                coefficients.regimeMatrimonial = 2.0;
                coefficients.cautionBancaire = 2.0;
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
            if (window.hasHardFail(forme.id, window.checkHardFails(userResponses))) {
                // Si oui, score très bas et on l'indique comme incompatible
                incompatibiliteMajeure = true;
                
                // Récupérer les détails des incompatibilités
                incompatibilites = window.checkHardFails(userResponses)
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
            
            // Horizon projet
            if (userResponses.horizonProjet === 'court' && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels += 15 * coefficients.horizonProjet;
                details.push('Structure idéale pour projet à court terme');
            } else if (userResponses.horizonProjet === 'moyen' && 
                      (forme.id === 'eurl' || forme.id === 'sasu')) {
                scoreCriteresStructurels += 15 * coefficients.horizonProjet;
                details.push('Structure adaptée à un développement sur 3-5 ans');
            } else if (userResponses.horizonProjet === 'long' && 
                      (forme.id === 'sas' || forme.id === 'sarl' || forme.id === 'sa')) {
                scoreCriteresStructurels += 15 * coefficients.horizonProjet;
                details.push('Structure pérenne pour projet à long terme');
            }
            
            // Profil entrepreneur
            if (userResponses.profilEntrepreneur === 'solo' && forme.associes === '1') {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Forme adaptée aux entrepreneurs solos');
            } else if (userResponses.profilEntrepreneur === 'associes' && parseInt(forme.associes) > 1) {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Forme adaptée aux projets avec associés');
            } else if (userResponses.profilEntrepreneur === 'famille' && forme.id.includes('sarl')) {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Forme particulièrement adaptée aux projets familiaux');
            } else if (userResponses.profilEntrepreneur === 'investisseurs' && forme.leveeFonds === 'Oui') {
                scoreCriteresStructurels += 20 * coefficients.profilEntrepreneur;
                details.push('Structure idéale pour accueillir des investisseurs');
            }
            
            // Type d'activité et réglementation
            if (userResponses.typeActivite && forme.activite.includes(userResponses.typeActivite)) {
                scoreCriteresStructurels += 15 * coefficients.typeActivite;
                details.push(`Adapté aux activités ${userResponses.typeActivite}s`);
            }
            
            if (userResponses.activiteReglementee && userResponses.ordreProessionnel) {
                if (forme.id.includes('sel')) {
                    scoreCriteresStructurels += 25;
                    details.push('Structure spécifique pour professions réglementées avec ordre');
                } else if (forme.id === 'micro-entreprise') {
                    scoreCriteresStructurels -= 50; // Forte pénalité
                    details.push('Incompatible avec ordre professionnel');
                }
            } else if (userResponses.activiteReglementee && forme.id !== 'micro-entreprise') {
                scoreCriteresStructurels += 15;
                details.push('Compatible avec activité réglementée');
            }
            
            // Chiffre d'affaires et marge
            const seuils = {
                'bic-vente': 188700,
                'bic-service': 77700,
                'bnc': 77700,
                'artisanale': 188700,
                'agricole': 95000
            };
            
            const seuil = seuils[userResponses.typeActivite] || 77700;
            
            if (userResponses.chiffreAffaires < seuil * 0.7 && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels += 20 * coefficients.chiffreAffaires;
                details.push('CA compatible avec régime micro-entreprise');
            } else if (userResponses.chiffreAffaires >= seuil && forme.id === 'micro-entreprise') {
                scoreCriteresStructurels -= 50; // Incompatibilité forte
                details.push('CA trop élevé pour régime micro-entreprise');
                
                // Ajouter une incompatibilité majeure
                if (!incompatibiliteMajeure) {
                    incompatibiliteMajeure = true;
                    incompatibilites.push({
                        code: 'ca-depasse-seuil',
                        message: `Le CA prévu (${userResponses.chiffreAffaires.toLocaleString('fr-FR')}€) dépasse le seuil micro-entreprise (${seuil.toLocaleString('fr-FR')}€)`,
                        details: 'Régime réel obligatoire'
                    });
                }
            } else if (userResponses.chiffreAffaires >= seuil && 
                      (forme.id === 'eurl' || forme.id === 'sasu' || forme.id === 'ei')) {
                scoreCriteresStructurels += 15 * coefficients.chiffreAffaires;
                details.push('Structure adaptée à ce niveau de CA');
            } else if (userResponses.chiffreAffaires >= seuil * 2 && 
                      (forme.id === 'sas' || forme.id === 'sarl' || forme.id === 'sa')) {
                scoreCriteresStructurels += 20 * coefficients.chiffreAffaires;
                details.push('Structure idéale pour les CA élevés');
            }

            // Statut du porteur (ACRE)
            if (userResponses.statutPorteur === 'demandeur-emploi') {
                if (forme.regimeSocial.includes('TNS')) {
                    scoreCriteresStructurels += 15;
                    details.push('Éligible à l\'ACRE (charges sociales réduites)');
                }
            }

            // Zone d'implantation
            if (userResponses.zoneImplantation === 'zfu' || userResponses.zoneImplantation === 'zrr') {
                if (forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui') {
                    scoreCriteresStructurels += 15 * coefficients.zoneImplantation;
                    details.push(`Avantages fiscaux en zone ${userResponses.zoneImplantation.toUpperCase()}`);
                }
            }
            
            // PARTIE OBJECTIFS (40%)
            
            // Marge brute
            if (userResponses.tauxMarge < 15) {
                // Marges faibles = avantage aux formes avec charges sociales plus faibles
                if (forme.id === 'micro-entreprise') {
                    scoreObjectifs += 15 * coefficients.tauxMarge;
                    details.push('Charges forfaitaires avantageuses avec marge faible');
                } else if (forme.id === 'sasu' || forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs -= 10 * coefficients.tauxMarge;
                    details.push('Charges sociales élevées avec marge faible');
                }
            } else if (userResponses.tauxMarge > 40) {
                // Marges élevées = avantage aux formes avec fiscalité optimisée
                if (forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui') {
                    scoreObjectifs += 15 * coefficients.tauxMarge;
                    details.push('Optimisation fiscale intéressante avec marge élevée');
                }
            }
            
            // Besoin de revenus immédiats
            if (userResponses.besoinRevenusImmediats) {
                if (forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs += 20 * coefficients.besoinRevenusImmediats;
                    details.push('Permet une rémunération immédiate par salaire');
                } else if (forme.id === 'micro-entreprise') {
                    scoreObjectifs += 15 * coefficients.besoinRevenusImmediats;
                    details.push('Versement immédiat du CA après prélèvements forfaitaires');
                } else if (forme.fiscalite === 'IS' && !forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs -= 10 * coefficients.besoinRevenusImmediats;
                    details.push('Moins adapté aux besoins de rémunération immédiate');
                }
            }
            
            // Protection patrimoniale et caution bancaire
            if (userResponses.cautionBancaire || userResponses.bienImmobilier) {
                if (forme.protectionPatrimoine === 'Oui') {
                    scoreObjectifs += 25 * coefficients.cautionBancaire;
                    details.push('Protection patrimoniale complète, idéale avec caution bancaire');
                } else if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
                    if (userResponses.bienImmobilier) {
                        scoreObjectifs -= 20 * coefficients.cautionBancaire;
                        details.push('Protection limitée pour votre patrimoine immobilier');
                    } else {
                        scoreObjectifs -= 10;
                        details.push('Protection patrimoniale partielle depuis 2022');
                    }
                }
            }
            
            // Montant de levée de fonds
            if (userResponses.montantLevee > 50000) {
                if (forme.leveeFonds === 'Oui') {
                    scoreObjectifs += 20 * coefficients.montantLevee;
                    details.push('Structure adaptée à la levée de fonds envisagée');
                } else {
                    scoreObjectifs -= 15 * coefficients.montantLevee;
                    details.push('Structure peu adaptée à la levée de fonds');
                }
            }
            
            // Type d'investisseurs
            if (userResponses.typeInvestisseurs.includes('vc') && forme.id === 'sas') {
                scoreObjectifs += 15;
                details.push('Structure privilégiée par les fonds de capital-risque');
            } else if (userResponses.typeInvestisseurs.includes('business-angels') && 
                      (forme.id === 'sas' || forme.id === 'sasu')) {
                scoreObjectifs += 10;
                details.push('Structure appréciée des business angels');
            }
            
            // Aides et dispositifs spécifiques
            if (userResponses.aides.includes('jei') && forme.fiscalite === 'IS') {
                scoreObjectifs += 15;
                details.push('Éligible au statut JEI');
            }
            
            if (userResponses.aides.includes('cir') && 
               (forme.id !== 'micro-entreprise' && forme.id !== 'ei')) {
                scoreObjectifs += 10;
                details.push('Structure compatible avec CIR/CII');
            }
            
            // Transmission/sortie
            if (userResponses.transmission === 'revente' && 
               (forme.id === 'sas' || forme.id === 'sa')) {
                scoreObjectifs += 15 * coefficients.transmission;
                details.push('Structure favorable à la revente future');
            } else if (userResponses.transmission === 'transmission' && 
                      (forme.id === 'sarl' || forme.id.includes('ei'))) {
                scoreObjectifs += 10 * coefficients.transmission;
                details.push('Structure adaptée à la transmission familiale');
            }
            
            // Régime fiscal préféré
            if (userResponses.regimeFiscal === 'ir' && forme.fiscalite === 'IR') {
                scoreObjectifs += 15 * coefficients.regimeFiscal;
                details.push('Correspond à votre préférence pour l\'IR');
            } else if (userResponses.regimeFiscal === 'is' && forme.fiscalite === 'IS') {
                scoreObjectifs += 15 * coefficients.regimeFiscal;
                details.push('Correspond à votre préférence pour l\'IS');
            } else if (userResponses.regimeFiscal === 'flexible' && forme.fiscaliteOption === 'Oui') {
                scoreObjectifs += 20 * coefficients.regimeFiscal;
                details.push('Offre la flexibilité fiscale souhaitée');
            }
            
            // Régime social préféré
            if (userResponses.regimeSocial === 'tns' && forme.regimeSocial.includes('TNS')) {
                scoreObjectifs += 15 * coefficients.regimeSocial;
                details.push('Correspond à votre préférence pour le statut TNS');
            } else if (userResponses.regimeSocial === 'salarie' && forme.regimeSocial.includes('salarié')) {
                scoreObjectifs += 15 * coefficients.regimeSocial;
                details.push('Correspond à votre préférence pour le statut assimilé-salarié');
            }

            // Régime matrimonial
            if (userResponses.estMarie && userResponses.regimeMatrimonial === 'communaute-reduite') {
                if (forme.protectionPatrimoine === 'Oui') {
                    scoreObjectifs += 15 * coefficients.regimeMatrimonial;
                    details.push('Protection du patrimoine commun en régime matrimonial de communauté');
                } else {
                    scoreObjectifs -= 15 * coefficients.regimeMatrimonial;
                    details.push('Risque pour le patrimoine commun en régime matrimonial de communauté');
                }
            }

            // Garantie décennale
            if (userResponses.garantieDecennale && forme.id === 'micro-entreprise') {
                scoreObjectifs -= 40 * coefficients.garantieDecennale;
                details.push('Incompatible avec une garantie décennale obligatoire');
                
                if (!incompatibiliteMajeure) {
                    incompatibiliteMajeure = true;
                    incompatibilites.push({
                        code: 'garantie-decennale',
                        message: 'Activité nécessitant une garantie décennale',
                        details: 'Structure peu adaptée aux assurances professionnelles à forte couverture'
                    });
                }
            }

            // Multi-établissements
            if (userResponses.multiEtablissements) {
                if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
                    scoreObjectifs -= 25 * coefficients.multiEtablissements;
                    details.push('Structure peu adaptée à plusieurs établissements');
                } else if (forme.id === 'sas' || forme.id === 'sa') {
                    scoreObjectifs += 15 * coefficients.multiEtablissements;
                    details.push('Structure idéale pour organisation multi-sites');
                }
            }

            // Structure holding
            if (userResponses.structureHolding) {
                if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
                    scoreObjectifs -= 50 * coefficients.structureHolding;
                    details.push('Incompatible avec structure holding');
                    
                    if (!incompatibiliteMajeure) {
                        incompatibiliteMajeure = true;
                        incompatibilites.push({
                            code: 'structure-holding',
                            message: 'Structure de type holding avec filiales',
                            details: 'Ce type de structure nécessite une forme sociétaire'
                        });
                    }
                } else if (forme.id === 'sas' || forme.id === 'sa') {
                    scoreObjectifs += 25 * coefficients.structureHolding;
                    details.push('Structure parfaitement adaptée aux holdings');
                }
            }

            // Apport de brevets
            if (userResponses.apportBrevet) {
                if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
                    scoreObjectifs -= 20;
                    details.push('Apport de PI impossible ou complexe');
                } else if (forme.id === 'sas' || forme.id === 'sasu') {
                    scoreObjectifs += 15;
                    details.push('Structure adaptée à la valorisation de propriété intellectuelle');
                }
            }

            // Préférences dividendes
            if (userResponses.preferenceDividendes === 'pfu' && userResponses.tmiActuel >= 30) {
                if (forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui') {
                    scoreObjectifs += 10;
                    details.push('Préférence PFU optimale avec forme à l\'IS');
                }
            }

            // Protection sociale
            if (userResponses.protectionSociale === 'retraite') {
                if (forme.regimeSocial.includes('salarié')) {
                    scoreObjectifs += 15;
                    details.push('Meilleure protection retraite avec statut assimilé-salarié');
                }
            } else if (userResponses.protectionSociale === 'charges') {
                if (forme.id === 'micro-entreprise' || (forme.fiscalite === 'IR' && forme.regimeSocial.includes('TNS'))) {
                    scoreObjectifs += 15;
                    details.push('Optimisation des charges sociales');
                }
            }
            
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

    // ===== MODULE 3: GESTION DES FORMULAIRES ET INTERFACES UTILISATEUR =====
    const FormManager = {
        // Variables pour le formulaire
        currentSection: 1,
        totalSections: 7, // Mise à jour à 7 sections au lieu de 5
        
        // Initialisation
        init: function() {
            this.setupEventListeners();
            this.updateProgressBar(1);
        },
        
        // Configuration des écouteurs d'événements
        setupEventListeners: function() {
            // Boutons de navigation
            const nextStep1 = document.getElementById('next1');
            const nextStep1b = document.getElementById('next1b');
            const nextStep2 = document.getElementById('next2');
            const nextStep3 = document.getElementById('next3');
            const nextStep3b = document.getElementById('next3b');
            const prevStep1b = document.getElementById('prev1b');
            const prevStep2 = document.getElementById('prev2');
            const prevStep3 = document.getElementById('prev3');
            const prevStep3b = document.getElementById('prev3b');
            const prevStep4 = document.getElementById('prev4');
            const submitBtn = document.getElementById('submit-btn');
            const restartBtn = document.getElementById('restart-btn');
            
            // Gestion des boutons d'option simples
            const optionButtons = document.querySelectorAll('.option-btn');
            optionButtons.forEach(button => {
                if (!button.hasAttribute('data-multi')) {
                    button.addEventListener('click', function() {
                        // Désélectionner tous les boutons du même groupe
                        const parentDiv = this.parentElement;
                        parentDiv.querySelectorAll('.option-btn').forEach(btn => {
                            btn.classList.remove('selected');
                        });
                        
                        // Sélectionner ce bouton
                        this.classList.add('selected');
                    });
                }
            });
            
            // Navigation entre sections
            if (nextStep1) {
                nextStep1.addEventListener('click', () => {
                    DataCollector.collectSection1Data();
                    StorageManager.saveProgress();
                    this.showSection(2); // Section 1b
                });
            }
            
            if (nextStep1b) {
                nextStep1b.addEventListener('click', () => {
                    DataCollector.collectSection1bData();
                    StorageManager.saveProgress();
                    this.showSection(3); // Section 2
                });
            }
            
            if (prevStep1b) {
                prevStep1b.addEventListener('click', () => this.showSection(1)); // Retour à section 1
            }
            
            if (nextStep2) {
                nextStep2.addEventListener('click', () => {
                    DataCollector.collectSection2Data();
                    StorageManager.saveProgress();
                    this.showSection(4); // Section 3
                });
            }
            
            if (nextStep3) {
                nextStep3.addEventListener('click', () => {
                    DataCollector.collectSection3Data();
                    StorageManager.saveProgress();
                    this.showSection(5); // Section 3b
                });
            }
            
            if (nextStep3b) {
                nextStep3b.addEventListener('click', () => {
                    DataCollector.collectSection3bData();
                    StorageManager.saveProgress();
                    this.showSection(6); // Section 4
                });
            }
            
            if (prevStep2) {
                prevStep2.addEventListener('click', () => this.showSection(2)); // Retour à section 1b
            }
            
            if (prevStep3) {
                prevStep3.addEventListener('click', () => this.showSection(3)); // Retour à section 2
            }
            
            if (prevStep3b) {
                prevStep3b.addEventListener('click', () => this.showSection(4)); // Retour à section 3
            }
            
            if (prevStep4) {
                prevStep4.addEventListener('click', () => this.showSection(5)); // Retour à section 3b
            }
            
            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    DataCollector.collectSection4Data();
                    StorageManager.saveProgress();
                    this.showSection(7); // Section résultats (7)
                    ResultsManager.generateResults();
                });
            }
            
            if (restartBtn) {
                restartBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.resetSimulation();
                });
            }
            
            // Écouteurs pour les champs matrimoniaux
            const estMarieButtons = document.querySelectorAll('[data-name="est-marie"]');
            estMarieButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const regimeContainer = document.getElementById('regime-matrimonial-container');
                    if (this.getAttribute('data-value') === 'oui') {
                        regimeContainer.style.display = 'block';
                    } else {
                        regimeContainer.style.display = 'none';
                    }
                });
            });
            
            // Autres écouteurs d'événements spécifiques aux paramètres avancés
            const advancedParamsToggle = document.getElementById('advanced-params-toggle');
            if (advancedParamsToggle) {
                advancedParamsToggle.addEventListener('click', this.toggleAdvancedParams);
            }
            
            // Écouteur pour les détails de calcul
            const showCalculationDetails = document.getElementById('show-calculation-details');
            if (showCalculationDetails) {
                showCalculationDetails.addEventListener('change', function() {
                    document.dispatchEvent(new CustomEvent('toggleCalculationDetails', {
                        detail: { visible: this.checked }
                    }));
                });
            }
        },
        
        // Afficher une section spécifique
        showSection: function(sectionNumber) {
            const sections = document.querySelectorAll('.question-section');
            const progressSteps = document.querySelectorAll('.progress-step');
            
            sections.forEach((section, index) => {
                section.classList.remove('active');
                section.classList.add('hidden');
                
                progressSteps[index].classList.remove('active', 'completed');
            });
            
            sections[sectionNumber - 1].classList.remove('hidden');
            sections[sectionNumber - 1].classList.add('active');
            
            // Mettre à jour les étapes de progression
            progressSteps[sectionNumber - 1].classList.add('active');
            
            for (let i = 0; i < sectionNumber - 1; i++) {
                progressSteps[i].classList.add('completed');
            }
            
            // Mettre à jour la barre de progression
            this.updateProgressBar(sectionNumber);
            
            // Scroll vers le haut
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            this.currentSection = sectionNumber;
        },
        
        // Mise à jour de la barre de progression
        updateProgressBar: function(currentStep) {
            const percentage = (currentStep / this.totalSections) * 100;
            const progressBar = document.getElementById('progress-bar');
            const progressPercentage = document.getElementById('progress-percentage');
            
            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
            }
            
            if (progressPercentage) {
                progressPercentage.textContent = `${Math.round(percentage)}% complété`;
            }
            
            // Mettre à jour le temps restant estimé
            const timeEstimate = document.getElementById('time-estimate');
            if (timeEstimate) {
                const remainingTime = Math.max(1, 5 - (currentStep - 1));
                timeEstimate.textContent = `Temps estimé: ${remainingTime} minute${remainingTime > 1 ? 's' : ''}`;
            }
            
            // Mettre à jour la progression de la question
            const questionProgress = document.getElementById(`question-progress${currentStep > 1 ? '-' + currentStep : ''}`);
            if (questionProgress) {
                // Logique améliorée pour montrer la progression réelle
                const stepQuestionMapping = {
                    1: "1-2",   // Section 1: 2 questions
                    2: "3-4",   // Section 1b: 2 questions
                    3: "5",     // Section 2: 1 question
                    4: "6-7",   // Section 3: 2 questions
                    5: "8-9",   // Section 3b: 2 questions
                    6: "10-12", // Section 4: 3 questions
                    7: "Résultats"
                };
                
                const questionText = stepQuestionMapping[currentStep] || "1";
                questionProgress.textContent = `Question${questionText.includes('-') ? 's' : ''} ${questionText} sur 12`;
            }
        },
        
        // Bascule les paramètres avancés
        toggleAdvancedParams: function() {
            const advancedParamsContent = document.getElementById('advanced-params-content');
            const iconElement = document.getElementById('params-toggle-icon');
            
            if (advancedParamsContent) {
                advancedParamsContent.classList.toggle('visible');
                
                if (iconElement) {
                    if (advancedParamsContent.classList.contains('visible')) {
                        iconElement.classList.remove('fa-chevron-down');
                        iconElement.classList.add('fa-chevron-up');
                    } else {
                        iconElement.classList.remove('fa-chevron-up');
                        iconElement.classList.add('fa-chevron-down');
                    }
                }
            }
        },
        
        // Réinitialise la simulation
        resetSimulation: function() {
            userResponses = {
                // Section 1: Profil & Horizon Personnel
                tmiActuel: 30,
                autresRevenusSalaries: false,
                horizonProjet: 'moyen',
                revenuAnnee1: 30000,
                revenuAnnee3: 50000,
                bienImmobilier: false,
                
                // Section 1b: Situation personnelle et géographique
                statutPorteur: null,
                estMarie: false,
                regimeMatrimonial: null,
                zoneImplantation: 'metropole',
                aideRegionale: false,
                
                // Section 2: Équipe & Gouvernance
                profilEntrepreneur: null,
                typeInvestisseurs: [],
                
                // Section 3: Nature de l'activité
                typeActivite: null,
                activiteReglementee: false,
                ordreProessionnel: false,
                risqueResponsabilite: false,
                besoinAssurance: false,
                
                // Section 3b: Spécificités du projet
                embauchesPrevues: 'aucune',
                apportBrevet: false,
                apportMateriel: false,
                garantieDecennale: false,
                rcpObligatoire: false,
                multiEtablissements: false,
                structureHolding: false,
                entrepriseMission: false,
                statutEsus: false,
                
                // Section 4: Volumétrie et finances
                chiffreAffaires: null,
                tauxMarge: 35,
                besoinRevenusImmediats: false,
                cautionBancaire: false,
                montantLevee: 0,
                preferenceRemuneration: 'mixte',
                aides: [],
                transmission: null,
                regimeFiscal: null,
                regimeSocial: null,
                preferenceDividendes: null,
                protectionSociale: null
            };
            
            // Réinitialiser l'interface
            document.querySelectorAll('.option-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            // Réinitialiser les champs de saisie
            const tmiSelect = document.getElementById('tmi-actuel');
            const revenuAnnee1Input = document.getElementById('revenu-annee1');
            const revenuAnnee3Input = document.getElementById('revenu-annee3');
            const bienImmobilierCheckbox = document.getElementById('bien-immobilier');
            
            // Section 1b
            const zoneImplantationSelect = document.getElementById('zone-implantation');
            const aideRegionaleCheckbox = document.getElementById('aide-regionale');
            const regimeMatrimonialSelect = document.getElementById('regime-matrimonial');
            const regimeMatrimonialContainer = document.getElementById('regime-matrimonial-container');
            
            // Section 3
            const checkboxReglementee = document.getElementById('activite-reglementee');
            const ordreProCheckbox = document.getElementById('ordre-professionnel');
            
            // Section 3b
            const garantieDecennaleCheckbox = document.getElementById('garantie-decennale');
            const rcpObligatoireCheckbox = document.getElementById('rcp-obligatoire');
            const multiEtablissementsCheckbox = document.getElementById('multi-etablissements');
            const structureHoldingCheckbox = document.getElementById('structure-holding');
            const entrepriseMissionCheckbox = document.getElementById('entreprise-mission');
            const statutEsusCheckbox = document.getElementById('statut-esus');
            const apportBrevetCheckbox = document.getElementById('apport-brevet');
            const apportMaterielCheckbox = document.getElementById('apport-materiel');
            const embauchePreviewSelect = document.getElementById('embauche-prevue');
            
            // Section 4
            const caPrevisionnelInput = document.getElementById('ca-previsionnel');
            const tauxMargeSlider = document.getElementById('taux-marge');
            const tauxMargeValue = document.getElementById('taux-marge-value');
            const besoinsRevenusCheckbox = document.getElementById('besoin-revenus-immediats');
            const cautionBancaireCheckbox = document.getElementById('caution-bancaire');
            const montantLeveeInput = document.getElementById('montant-levee');
            const preferenceDividendesSelect = document.getElementById('preference-dividendes');
            const protectionSocialeSelect = document.getElementById('protection-sociale');
            
            // Réinitialiser les champs de saisie de la section 1
            if (tmiSelect) tmiSelect.value = '30';
            if (revenuAnnee1Input) revenuAnnee1Input.value = '30000';
            if (revenuAnnee3Input) revenuAnnee3Input.value = '50000';
            if (bienImmobilierCheckbox) bienImmobilierCheckbox.checked = false;
            
            // Réinitialiser les champs de la section 1b
            if (zoneImplantationSelect) zoneImplantationSelect.value = 'metropole';
            if (aideRegionaleCheckbox) aideRegionaleCheckbox.checked = false;
            if (regimeMatrimonialSelect) regimeMatrimonialSelect.value = 'communaute-reduite';
            if (regimeMatrimonialContainer) regimeMatrimonialContainer.style.display = 'none';
            
            // Réinitialiser les champs de la section 3
            if (checkboxReglementee) checkboxReglementee.checked = false;
            if (ordreProCheckbox) ordreProCheckbox.checked = false;
            
            // Réinitialiser les champs de la section 3b
            if (garantieDecennaleCheckbox) garantieDecennaleCheckbox.checked = false;
            if (rcpObligatoireCheckbox) rcpObligatoireCheckbox.checked = false;
            if (multiEtablissementsCheckbox) multiEtablissementsCheckbox.checked = false;
            if (structureHoldingCheckbox) structureHoldingCheckbox.checked = false;
            if (entrepriseMissionCheckbox) entrepriseMissionCheckbox.checked = false;
            if (statutEsusCheckbox) statutEsusCheckbox.checked = false;
            if (apportBrevetCheckbox) apportBrevetCheckbox.checked = false;
            if (apportMaterielCheckbox) apportMaterielCheckbox.checked = false;
            if (embauchePreviewSelect) embauchePreviewSelect.value = 'aucune';
            
            // Réinitialiser les champs de la section 4
            if (caPrevisionnelInput) caPrevisionnelInput.value = '75000';
            if (tauxMargeSlider) tauxMargeSlider.value = '35';
            if (tauxMargeValue) tauxMargeValue.textContent = '35%';
            if (besoinsRevenusCheckbox) besoinsRevenusCheckbox.checked = false;
            if (cautionBancaireCheckbox) cautionBancaireCheckbox.checked = false;
            if (montantLeveeInput) montantLeveeInput.value = '0';
            if (preferenceDividendesSelect) preferenceDividendesSelect.value = 'optimisation';
            if (protectionSocialeSelect) protectionSocialeSelect.value = 'equilibre';
            
            // Supprimer le localStorage
            localStorage.removeItem('entreprise-form-progress');
            
            // Retourner à la première section
            this.showSection(1);
        }
    };

    // ===== MODULE 4: COLLECTEUR DE DONNÉES DU FORMULAIRE =====
    const DataCollector = {
        /**
         * Collecte les données de la section 1 : Profil & Horizon Personnel
         */
        collectSection1Data: function() {
            // TMI actuelle
            const tmiSelect = document.getElementById('tmi-actuel');
            if (tmiSelect) {
                userResponses.tmiActuel = parseInt(tmiSelect.value);
            }
            
            // Autres revenus salariés
            const autresRevenusBtn = document.querySelector('#section1 .option-btn[data-value="oui"].selected');
            userResponses.autresRevenusSalaries = !!autresRevenusBtn;
            
            // Horizon du projet
            const horizonButtons = document.querySelectorAll('#section1 .option-btn[data-value^="court"], #section1 .option-btn[data-value^="moyen"], #section1 .option-btn[data-value^="long"]');
            horizonButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.horizonProjet = button.getAttribute('data-value');
                }
            });
            
            // Objectifs de revenus
            const revenuAnnee1Input = document.getElementById('revenu-annee1');
            const revenuAnnee3Input = document.getElementById('revenu-annee3');
            
            if (revenuAnnee1Input) {
                userResponses.revenuAnnee1 = parseInt(revenuAnnee1Input.value);
            }
            
            if (revenuAnnee3Input) {
                userResponses.revenuAnnee3 = parseInt(revenuAnnee3Input.value);
            }
            
            // Bien immobilier
            const bienImmobilierCheckbox = document.getElementById('bien-immobilier');
            if (bienImmobilierCheckbox) {
                userResponses.bienImmobilier = bienImmobilierCheckbox.checked;
            }
        },

        /**
         * Collecte les données de la section 1b : Situation personnelle et géographique
         */
        collectSection1bData: function() {
            // Statut du porteur
            const statutButtons = document.querySelectorAll('#section1b .option-btn[data-value]');
            statutButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.statutPorteur = button.getAttribute('data-value');
                }
            });
            
            // Situation matrimoniale
            const estMarieBtn = document.querySelector('#section1b .option-btn[data-value="oui"][data-name="est-marie"].selected');
            userResponses.estMarie = !!estMarieBtn;
            
            // Régime matrimonial
            const regimeMatrimonialSelect = document.getElementById('regime-matrimonial');
            if (regimeMatrimonialSelect) {
                userResponses.regimeMatrimonial = regimeMatrimonialSelect.value;
            }
            
            // Zone d'implantation
            const zoneSelect = document.getElementById('zone-implantation');
            if (zoneSelect) {
                userResponses.zoneImplantation = zoneSelect.value;
            }
            
            // Aide régionale
            const aideRegionaleCheckbox = document.getElementById('aide-regionale');
            if (aideRegionaleCheckbox) {
                userResponses.aideRegionale = aideRegionaleCheckbox.checked;
            }
        },

        /**
         * Collecte les données de la section 2 : Équipe & Gouvernance
         */
        collectSection2Data: function() {
            // Profil entrepreneur
            const profilButtons = document.querySelectorAll('#section2 .option-btn[data-value]');
            profilButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.profilEntrepreneur = button.getAttribute('data-value');
                }
            });
            
            // Type d'investisseurs
            userResponses.typeInvestisseurs = [];
            const businessAngelsCheckbox = document.getElementById('invest-business-angels');
            const vcCheckbox = document.getElementById('invest-vc');
            const crowdfundingCheckbox = document.getElementById('invest-crowdfunding');
            
            if (businessAngelsCheckbox && businessAngelsCheckbox.checked) {
                userResponses.typeInvestisseurs.push('business-angels');
            }
            
            if (vcCheckbox && vcCheckbox.checked) {
                userResponses.typeInvestisseurs.push('vc');
            }
            
            if (crowdfundingCheckbox && crowdfundingCheckbox.checked) {
                userResponses.typeInvestisseurs.push('crowdfunding');
            }
        },

        /**
         * Collecte les données de la section 3 : Nature de l'activité
         */
        collectSection3Data: function() {
            // Type d'activité
            const typeActiviteSelect = document.getElementById('activite-type');
            if (typeActiviteSelect) {
                userResponses.typeActivite = typeActiviteSelect.value;
            }
            
            // Activité réglementée
            const checkboxReglementee = document.getElementById('activite-reglementee');
            if (checkboxReglementee) {
                userResponses.activiteReglementee = checkboxReglementee.checked;
            }
            
            // Ordre professionnel
            const ordreProCheckbox = document.getElementById('ordre-professionnel');
            if (ordreProCheckbox) {
                userResponses.ordreProessionnel = ordreProCheckbox.checked;
            }
            
            // Risques de responsabilité
            const risqueResponsabiliteCheckbox = document.getElementById('risque-responsabilite');
            if (risqueResponsabiliteCheckbox) {
                userResponses.risqueResponsabilite = risqueResponsabiliteCheckbox.checked;
            }
            
            // Besoin d'assurance
            const besoinAssuranceCheckbox = document.getElementById('besoin-assurance');
            if (besoinAssuranceCheckbox) {
                userResponses.besoinAssurance = besoinAssuranceCheckbox.checked;
            }
        },

        /**
         * Collecte les données de la section 3b : Spécificités du projet
         */
        collectSection3bData: function() {
            // Embauche prévue
            const embaucheSelect = document.getElementById('embauche-prevue');
            if (embaucheSelect) {
                userResponses.embauchesPrevues = embaucheSelect.value;
            }
            
            // Apports spécifiques au capital
            const apportBrevetCheckbox = document.getElementById('apport-brevet');
            const apportMaterielCheckbox = document.getElementById('apport-materiel');
            
            if (apportBrevetCheckbox) userResponses.apportBrevet = apportBrevetCheckbox.checked;
            if (apportMaterielCheckbox) userResponses.apportMateriel = apportMaterielCheckbox.checked;
            
            // Assurances professionnelles
            const garantieDecennaleCheckbox = document.getElementById('garantie-decennale');
            const rcpObligatoireCheckbox = document.getElementById('rcp-obligatoire');
            
            if (garantieDecennaleCheckbox) userResponses.garantieDecennale = garantieDecennaleCheckbox.checked;
            if (rcpObligatoireCheckbox) userResponses.rcpObligatoire = rcpObligatoireCheckbox.checked;
            
            // Structure d'exploitation
            const multiEtablissementsCheckbox = document.getElementById('multi-etablissements');
            const structureHoldingCheckbox = document.getElementById('structure-holding');
            
            if (multiEtablissementsCheckbox) userResponses.multiEtablissements = multiEtablissementsCheckbox.checked;
            if (structureHoldingCheckbox) userResponses.structureHolding = structureHoldingCheckbox.checked;
            
            // Finalité de l'entreprise
            const entrepriseMissionCheckbox = document.getElementById('entreprise-mission');
            const statutEsusCheckbox = document.getElementById('statut-esus');
            
            if (entrepriseMissionCheckbox) userResponses.entrepriseMission = entrepriseMissionCheckbox.checked;
            if (statutEsusCheckbox) userResponses.statutEsus = statutEsusCheckbox.checked;
        },

        /**
         * Collecte les données de la section 4 : Volumétrie et finances
         */
        collectSection4Data: function() {
            // Chiffre d'affaires prévisionnel
            const caPrevisionnelInput = document.getElementById('ca-previsionnel');
            if (caPrevisionnelInput) {
                userResponses.chiffreAffaires = parseInt(caPrevisionnelInput.value);
            }
            
            // Taux de marge
            const tauxMargeSlider = document.getElementById('taux-marge');
            if (tauxMargeSlider) {
                userResponses.tauxMarge = parseInt(tauxMargeSlider.value);
            }
            
            // Besoin de revenus immédiats
            const besoinsRevenusCheckbox = document.getElementById('besoin-revenus-immediats');
            if (besoinsRevenusCheckbox) {
                userResponses.besoinRevenusImmediats = besoinsRevenusCheckbox.checked;
            }
            
            // Caution bancaire
            const cautionBancaireCheckbox = document.getElementById('caution-bancaire');
            if (cautionBancaireCheckbox) {
                userResponses.cautionBancaire = cautionBancaireCheckbox.checked;
            }
            
            // Montant de levée
            const montantLeveeInput = document.getElementById('montant-levee');
            if (montantLeveeInput) {
                userResponses.montantLevee = parseInt(montantLeveeInput.value);
            }
            
            // Préférence de rémunération
            const preferenceSelect = document.getElementById('preference-remuneration');
            if (preferenceSelect) {
                userResponses.preferenceRemuneration = preferenceSelect.value;
            }
            
            // Aides et dispositifs
            userResponses.aides = [];
            const acreCheckbox = document.getElementById('aide-acre');
            const jeiCheckbox = document.getElementById('aide-jei');
            const cirCheckbox = document.getElementById('aide-cir');
            
            if (acreCheckbox && acreCheckbox.checked) userResponses.aides.push('acre');
            if (jeiCheckbox && jeiCheckbox.checked) userResponses.aides.push('jei');
            if (cirCheckbox && cirCheckbox.checked) userResponses.aides.push('cir');
            
            // Transmission/sortie
            const sortieButtons = document.querySelectorAll('#section4 .option-btn[data-value^="revente"], #section4 .option-btn[data-value^="transmission"]');
            sortieButtons.forEach(button => {
                if (button.classList.contains('selected')) {
                    userResponses.transmission = button.getAttribute('data-value');
                }
            });
            
            // Préférences fiscales et sociales
            const regimeFiscalSelect = document.getElementById('regime-fiscal-preference');
            const regimeSocialSelect = document.getElementById('regime-social-preference');
            
            if (regimeFiscalSelect) userResponses.regimeFiscal = regimeFiscalSelect.value;
            if (regimeSocialSelect) userResponses.regimeSocial = regimeSocialSelect.value;
            
            // Préférences dividendes et protection sociale
            const preferenceDividendesSelect = document.getElementById('preference-dividendes');
            const protectionSocialeSelect = document.getElementById('protection-sociale');
            
            if (preferenceDividendesSelect) userResponses.preferenceDividendes = preferenceDividendesSelect.value;
            if (protectionSocialeSelect) userResponses.protectionSociale = protectionSocialeSelect.value;
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
            afficherProjection: false,
            natureActivite: null,
            garantieDecennale: false,
            rcpObligatoire: false,
            zoneImplantation: 'metropole',
            preferenceDividendes: null,
            protectionSociale: null
        },
        
        // Initialisation
        init: function() {
            // Initialisation des paramètres avancés
            this.initAdvancedParams();
            
            // Écouteurs d'événements pour les paramètres
            const applyParamsButton = document.getElementById('apply-params');
            if (applyParamsButton) {
                applyParamsButton.addEventListener('click', this.applyAdvancedParams.bind(this));
            }
        },
        
        // Initialisation des paramètres avancés
        initAdvancedParams: function() {
            const ratioSalaireValue = document.getElementById('ratio-salaire-value');
            const ratioDividendesValue = document.getElementById('ratio-dividendes-value');
            const capitalSocialInput = document.getElementById('capital-social');
            const capitalLibereValue = document.getElementById('capital-libere-value');
            const caSimulationInput = document.getElementById('ca-simulation');
            const fraisReelsInput = document.getElementById('frais-reels');
            const acreCheckbox = document.getElementById('acre-checkbox');
            
            if (ratioSalaireValue) ratioSalaireValue.textContent = `${this.simulationParams.ratioSalaire}%`;
            if (ratioDividendesValue) ratioDividendesValue.textContent = `${this.simulationParams.ratioDividendes}%`;
            if (capitalSocialInput) capitalSocialInput.value = this.simulationParams.capitalSocial;
            if (capitalLibereValue) capitalLibereValue.textContent = `${this.simulationParams.capitalLibere}%`;
            if (caSimulationInput) caSimulationInput.value = this.simulationParams.caSimulation;
            if (fraisReelsInput) fraisReelsInput.value = this.simulationParams.fraisReels;
            if (acreCheckbox) acreCheckbox.checked = this.simulationParams.acreActif;
            
            // Mise à jour du ratio salaire/dividendes
            const ratioSalaireSlider = document.getElementById('ratio-salaire');
            if (ratioSalaireSlider) {
                ratioSalaireSlider.addEventListener('input', this.updateRatioValues.bind(this));
            }
            
            // Mise à jour du capital libéré
            const capitalLibereSlider = document.getElementById('capital-libere');
            if (capitalLibereSlider) {
                capitalLibereSlider.addEventListener('input', this.updateCapitalLibereValue.bind(this));
            }
        },
        
        // Mise à jour des valeurs du ratio salaire/dividendes
        updateRatioValues: function() {
            const ratioSalaireSlider = document.getElementById('ratio-salaire');
            const ratioDividendesValue = document.getElementById('ratio-dividendes-value');
            const ratioSalaireValue = document.getElementById('ratio-salaire-value');
            
            if (!ratioSalaireSlider || !ratioDividendesValue || !ratioSalaireValue) return;
            
            const ratioSalaire = parseInt(ratioSalaireSlider.value);
            const ratioDividendes = 100 - ratioSalaire;
            
            ratioSalaireValue.textContent = `${ratioSalaire}%`;
            ratioDividendesValue.textContent = `${ratioDividendes}%`;
        },
        
        // Mise à jour de la valeur du capital libéré
        updateCapitalLibereValue: function() {
            const capitalLibereSlider = document.getElementById('capital-libere');
            const capitalLibereValue = document.getElementById('capital-libere-value');
            
            if (!capitalLibereSlider || !capitalLibereValue) return;
            
            const value = parseInt(capitalLibereSlider.value);
            capitalLibereValue.textContent = `${value}%`;
        },

        // Méthode pour simuler année pour micro-entreprise
        calculateMicroEntrepriseYear: function(benefice, year, formeId) {
            // Taux de charges sociales
            const tauxCharges = 0.22; // ~22% pour micro BNC
            let reductionAcre = year === 1 && this.simulationParams.acreActif ? 0.5 : 0; // 50% réduction première année
            
            const charges = benefice * tauxCharges * (1 - reductionAcre);
            const impots = benefice * 0.1; // Approximation IR
            
            return {
                charges: Math.round(charges),
                impots: Math.round(impots),
                net: Math.round(benefice - charges - impots),
                acre: year === 1 && this.simulationParams.acreActif
            };
        },

        // Méthode pour simuler année pour société avec IS
        calculateSocietyWithISYear: function(benefice, year, formeId, ratioSalaire, ratioDividendes) {
            const salaireBrut = benefice * (ratioSalaire / 100);
            const dividendesBrut = benefice * (ratioDividendes / 100);
            
            // Charges sur salaire
            const tauxChargesSalariales = formeId === 'sasu' ? 0.45 : 0.35; // SASU: assimilé salarié, EURL: TNS
            let reductionAcre = year === 1 && this.simulationParams.acreActif && formeId !== 'sasu' ? 0.5 : 0;
            
            const chargesSalaire = salaireBrut * tauxChargesSalariales * (1 - reductionAcre);
            const impotSalaire = (salaireBrut - chargesSalaire) * 0.1; // Approximation IR sur salaire
            
            // IS et dividendes
            const impotSociete = dividendesBrut * 0.25; // Taux IS à 25%
            const dividendesNetIS = dividendesBrut - impotSociete;
            const prelevementsDividendes = dividendesNetIS * 0.30; // PFU à 30%
            
            return {
                charges: Math.round(chargesSalaire),
                impots: Math.round(impotSalaire + impotSociete + prelevementsDividendes),
                net: Math.round((salaireBrut - chargesSalaire - impotSalaire) + (dividendesNetIS - prelevementsDividendes)),
                salaireNet: Math.round(salaireBrut - chargesSalaire - impotSalaire),
                dividendesNet: Math.round(dividendesNetIS - prelevementsDividendes),
                acre: year === 1 && this.simulationParams.acreActif && formeId !== 'sasu'
            };
        },
        
        // Appliquer les paramètres avancés
        applyAdvancedParams: function() {
            const ratioSalaireSlider = document.getElementById('ratio-salaire');
            const capitalSocialInput = document.getElementById('capital-social');
            const capitalLibereSlider = document.getElementById('capital-libere');
            const caSimulationInput = document.getElementById('ca-simulation');
            const fraisReelsInput = document.getElementById('frais-reels');
            const acreCheckbox = document.getElementById('acre-checkbox');
            const projectionsCheckbox = document.getElementById('projections-pluriannuelles');
            
            if (!ratioSalaireSlider || !capitalSocialInput || !capitalLibereSlider || !caSimulationInput) return;
            
            this.simulationParams.ratioSalaire = parseInt(ratioSalaireSlider.value);
            this.simulationParams.ratioDividendes = 100 - this.simulationParams.ratioSalaire;
            this.simulationParams.capitalSocial = parseInt(capitalSocialInput.value);
            this.simulationParams.capitalLibere = parseInt(capitalLibereSlider.value);
            this.simulationParams.caSimulation = parseInt(caSimulationInput.value);
            
            if (fraisReelsInput) {
                this.simulationParams.fraisReels = parseInt(fraisReelsInput.value);
            }
            
            if (acreCheckbox) {
                this.simulationParams.acreActif = acreCheckbox.checked;
            }
            
            if (projectionsCheckbox) {
                this.simulationParams.afficherProjection = projectionsCheckbox.checked;
            }
            
            // Récupérer les valeurs depuis userResponses pour les nouveaux paramètres
            this.simulationParams.natureActivite = userResponses.typeActivite;
            this.simulationParams.garantieDecennale = userResponses.garantieDecennale;
            this.simulationParams.rcpObligatoire = userResponses.rcpObligatoire;
            this.simulationParams.zoneImplantation = userResponses.zoneImplantation;
            this.simulationParams.preferenceDividendes = userResponses.preferenceDividendes;
            this.simulationParams.protectionSociale = userResponses.protectionSociale;
            
            // Recalculer les résultats avec les nouveaux paramètres
            this.generateResults();
            
            // Notification à l'utilisateur
            const notification = document.createElement('div');
            notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
            notification.textContent = 'Paramètres appliqués et résultats recalculés';
            document.body.appendChild(notification);
            
            // Disparaitre après 3 secondes
            setTimeout(() => {
                notification.remove();
            }, 3000);
        },
        
        // Génére les résultats
        generateResults: function(customParams) {
            const resultsContainer = document.getElementById('results-container');
            if (!resultsContainer) return;
            
            // Vérifier si le module fiscal est chargé
            if (!window.checkHardFails || !window.SimulationsFiscales) {
                console.error('Module fiscal-simulation.js non chargé');
                alert('Erreur: Module de simulation fiscale non disponible.');
                return;
            }
            
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
            
            // Calculer les scores pour chaque forme juridique
            const results = FormeJuridiqueDB.structures.map(forme => {
                // Calculer le score avec le moteur de scoring amélioré
                const scoreResult = ScoringEngine.calculerScore(forme, userResponses);
                
                // Ajouter la simulation financière
                const simulation = window.SimulationsFiscales.simulerImpactFiscal(forme, this.simulationParams.caSimulation, {
                    ratioSalaire: this.simulationParams.ratioSalaire,
                    ratioDividendes: this.simulationParams.ratioDividendes,
                    capitalSocial: this.simulationParams.capitalSocial,
                    capitalLibere: this.simulationParams.capitalLibere,
                    fraisReels: this.simulationParams.fraisReels,
                    acreActif: this.simulationParams.acreActif,
                    tmiActuel: userResponses.tmiActuel,
                    tauxMarge: userResponses.tauxMarge,
                    typeActivite: userResponses.typeActivite,
                    garantieDecennale: userResponses.garantieDecennale,
                    rcpObligatoire: userResponses.rcpObligatoire,
                    zoneImplantation: userResponses.zoneImplantation,
                    preferenceDividendes: userResponses.preferenceDividendes,
                    protectionSociale: userResponses.protectionSociale
                });
                
                return {
                    ...scoreResult,
                    simulation: simulation
                };
            });

            // Grouper les résultats
            const resultatsRecommandes = results.filter(r => r.compatibilite === 'RECOMMANDÉ');
            const resultatsCompatibles = results.filter(r => r.compatibilite === 'COMPATIBLE');
            const resultatsPeuAdaptes = results.filter(r => r.compatibilite === 'PEU ADAPTÉ');
            const resultatsDeconseilles = results.filter(r => r.compatibilite === 'DÉCONSEILLÉ');
            const resultatsIncompatibles = results.filter(r => r.compatibilite === 'INCOMPATIBLE');

            // Trier chaque groupe par score
            resultatsRecommandes.sort((a, b) => b.score - a.score);
            resultatsCompatibles.sort((a, b) => b.score - a.score);
            resultatsPeuAdaptes.sort((a, b) => b.score - a.score);
            resultatsDeconseilles.sort((a, b) => b.score - a.score);
            resultatsIncompatibles.sort((a, b) => b.score - a.score);

            // Regrouper pour affichage principal (sans les incompatibles)
            const resultatsAffichage = [...resultatsRecommandes, ...resultatsCompatibles, ...resultatsPeuAdaptes].slice(0, 3);

            // Afficher les résultats
            this.displayResults(resultatsAffichage, resultatsIncompatibles);
            
            // Préparer les données du tableau comparatif complet
            this.prepareComparatifTable(FormeJuridiqueDB.structures);
            
            // Rendre visible les boutons d'export
            const exportButtons = document.getElementById('export-buttons');
            if (exportButtons) {
                exportButtons.style.display = 'flex';
            }
            
            // Déclencher un événement pour signaler que les résultats sont chargés
            document.dispatchEvent(new CustomEvent('resultsLoaded'));
            
            // Retourner tous les résultats pour référence
            return {
                recommandes: resultatsRecommandes,
                compatibles: resultatsCompatibles,
                peuAdaptes: resultatsPeuAdaptes,
                deconseilles: resultatsDeconseilles,
                incompatibles: resultatsIncompatibles
            };
        },
        
        // Affiche les résultats
        displayResults: function(results, incompatibles) {
            const resultsContainer = document.getElementById('results-container');
            if (!resultsContainer) return;
            
            resultsContainer.innerHTML = '';
            
            // Si aucun résultat trouvé
            if (results.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="p-6 text-center">
                        <h3 class="text-xl font-bold text-red-400 mb-4">Aucun résultat compatible trouvé</h3>
                        <p class="mb-4">Vos critères ne correspondent à aucune forme juridique recommandée. Essayez de modifier vos réponses.</p>
                        <button id="restart-form" class="bg-green-500 hover:bg-green-400 text-gray-900 font-semibold py-3 px-6 rounded-lg transition flex items-center mx-auto">
                            <i class="fas fa-redo mr-2"></i> Recommencer la simulation
                        </button>
                    </div>
                `;
                
                // Ajouter un écouteur d'événement au bouton de redémarrage
                const restartForm = document.getElementById('restart-form');
                if (restartForm) {
                    restartForm.addEventListener('click', FormManager.resetSimulation.bind(FormManager));
                }
                
                return;
            }
            
            // Résultat principal (le premier comme recommandation principale)
            const recommended = results[0];
            
            // Calculer le score en pourcentage pour la visualisation
            const scorePercentage = Math.round((recommended.scoreDetails.pourcentage || 85));
            
            // Version améliorée avec badge "RECOMMANDÉ"
            let htmlPrimary = `
                <div class="result-card primary-result visible p-6 mb-6 relative">
                    ${recommended.compatibilite === 'RECOMMANDÉ' ? '<div class="recommended-badge">Recommandé</div>' : ''}
                    <h3 class="text-2xl font-bold text-green-400 mb-3">${recommended.forme.nom}</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p class="text-lg mb-3">Score de compatibilité: <strong class="text-green-400">${scorePercentage}%</strong></p>
                            
                            <div class="match-indicator mb-4">
                                <div class="match-fill" style="width: ${scorePercentage}%;"></div>
                            </div>
                            
                            <h4 class="font-semibold mb-2">Caractéristiques principales</h4>
                            <ul class="feature-list">
                                <li><i class="fas fa-users text-green-400"></i> <strong>Associés:</strong> ${recommended.forme.associes}</li>
                                <li><i class="fas fa-coins text-green-400"></i> <strong>Capital:</strong> ${recommended.forme.capital}</li>
                                <li><i class="fas fa-shield-alt text-green-400"></i> <strong>Responsabilité:</strong> ${recommended.forme.responsabilite}</li>
                                <li><i class="fas fa-percentage text-green-400"></i> <strong>Fiscalité:</strong> ${recommended.forme.fiscalite}</li>
                                <li><i class="fas fa-id-card text-green-400"></i> <strong>Régime social:</strong> ${recommended.forme.regimeSocial}</li>
                            </ul>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Points forts pour votre profil</h4>
                            <ul class="feature-list">
            `;
            
            // Ajouter les points forts (détails)
            recommended.details.slice(0, 5).forEach(detail => {
                htmlPrimary += `<li><i class="fas fa-check text-green-400"></i> ${detail}</li>`;
            });
            
            htmlPrimary += `
                            </ul>
                            
                            <h4 class="font-semibold mt-4 mb-2">Impact fiscal estimé</h4>
                            <div class="bg-blue-900 bg-opacity-30 p-3 rounded-lg">
                                <div class="flex justify-between mb-2">
                                    <span>Revenu brut simulé:</span>
                                    <span>${this.simulationParams.caSimulation.toLocaleString('fr-FR')} €</span>
                                </div>
                                <div class="flex justify-between mb-2">
                                    <span>Charges sociales:</span>
                                    <span>${Math.round(recommended.simulation.chargesSociales || 0).toLocaleString('fr-FR')} €</span>
                                </div>
                                <div class="flex justify-between mb-2">
                                    <span>Impôts:</span>
                                    <span>${Math.round(recommended.simulation.impot || 0).toLocaleString('fr-FR')} €</span>
                                </div>
                                <div class="flex justify-between font-semibold text-green-400">
                                    <span>Revenu net estimé:</span>
                                    <span>${Math.round(recommended.simulation.revenueNet || 0).toLocaleString('fr-FR')} €</span>
                                </div>
                            </div>
                            
                            <div class="mt-4">
                                <button id="show-score-details" class="text-green-400 hover:text-green-300 text-sm flex items-center">
                                    <i class="fas fa-calculator mr-1"></i> Voir le détail du score
                                </button>
                                <div id="score-details" class="score-details hidden mt-2">
                                    <ul>
                                        <li>Score critères structurels: ${recommended.scoreCriteresStructurels} pts (60%)</li>
                                        <li>Score objectifs: ${recommended.scoreObjectifs} pts (40%)</li>
                                        <li>Score total: ${recommended.score} / ${ScoringEngine.SCORE_MAX}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Ajouter le tableau comparatif des régimes fiscaux (IR vs IS)
            htmlPrimary += this.renderTaxRegimeComparison(recommended.forme, this.simulationParams.caSimulation, userResponses.tauxMarge);
            
            // Ajouter la simulation salaire/dividendes
            htmlPrimary += this.renderSalaryDividendSimulation(recommended.forme, this.simulationParams.caSimulation, userResponses.tauxMarge);
            
            // Ajouter la projection pluriannuelle si activée
            if (this.simulationParams.afficherProjection) {
                htmlPrimary += this.renderMultiYearSimulation(recommended.forme, this.simulationParams.caSimulation, userResponses.tauxMarge);
            }
            
            // Ajouter les stratégies optimales pour cette forme juridique
            htmlPrimary += this.renderOptimalStrategies(recommended.forme, userResponses);
            
            // Ajouter les autres résultats si disponibles comme "challengers crédibles"
            let secondaryHtml = '';
            const showMoreResults = document.getElementById('show-more-results');
            const secondaryResults = document.getElementById('secondary-results');
            
            if (results.length > 1) {
                // Afficher le bouton pour montrer plus de résultats
                if (showMoreResults) {
                    showMoreResults.classList.remove('hidden');
                }
                
                // Titre pour les challengers
                secondaryHtml = `
                    <h3 class="text-xl font-semibold mb-4 flex items-center">
                        <i class="fas fa-medal text-blue-400 mr-2"></i>
                        Autres options compatibles
                    </h3>
                `;
                
                // Créer le contenu des résultats secondaires en grid
                secondaryHtml += '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
                
                results.slice(1).forEach(result => {
                    const resultScore = Math.round((result.scoreDetails.pourcentage || 75));
                    
                    secondaryHtml += `
                        <div class="result-card visible p-5 relative">
                            <h3 class="text-xl font-bold text-green-400 mb-2">${result.forme.nom}</h3>
                            <p class="mb-2">Compatibilité: <strong>${resultScore}%</strong></p>
                            
                            <div class="match-indicator mb-3">
                                <div class="match-fill" style="width: ${resultScore}%;"></div>
                            </div>
                            
                            <h4 class="font-semibold text-sm mb-2">Points clés</h4>
                            <ul class="text-sm">
                                <li><strong>Fiscalité:</strong> ${result.forme.fiscalite}</li>
                                <li><strong>Régime social:</strong> ${result.forme.regimeSocial}</li>
                                <li><strong>Points forts:</strong> ${result.details.slice(0, 2).join(', ')}</li>
                            </ul>
                            
                            <div class="mt-3 grid grid-cols-2 gap-2">
                                <div class="text-sm">
                                    <div class="text-xs opacity-70">Charges</div>
                                    <div>${Math.round(result.simulation.chargesSociales || 0).toLocaleString('fr-FR')} €</div>
                                </div>
                                <div class="text-sm">
                                    <div class="text-xs opacity-70">Revenu net</div>
                                    <div>${Math.round(result.simulation.revenueNet || 0).toLocaleString('fr-FR')} €</div>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                secondaryHtml += '</div>';
                
                // Ajouter le contenu secondaire au container
                if (secondaryResults) {
                    secondaryResults.innerHTML = secondaryHtml;
                    secondaryResults.classList.add('hidden'); // Caché par défaut
                }
            }
            
            // Ajouter les incompatibilités si présentes
            const incompatibilitesHtml = this.displayIncompatibilites(incompatibles);
            
            // Ajouter le tout au container
            resultsContainer.innerHTML = htmlPrimary + incompatibilitesHtml;
            
            // Activer le bouton de détail du score
            const showScoreDetails = document.getElementById('show-score-details');
            const scoreDetails = document.getElementById('score-details');
            
            if (showScoreDetails && scoreDetails) {
                showScoreDetails.addEventListener('click', function() {
                    scoreDetails.classList.toggle('hidden');
                    showScoreDetails.innerHTML = scoreDetails.classList.contains('hidden') 
                        ? '<i class="fas fa-calculator mr-1"></i> Voir le détail du score' 
                        : '<i class="fas fa-calculator mr-1"></i> Masquer le détail';
                });
            }
            
            // Gérer les onglets d'années si la projection est active
            if (this.simulationParams.afficherProjection) {
                const yearTabs = document.querySelectorAll('.year-tab');
                const yearContents = document.querySelectorAll('.year-content');
                
                yearTabs.forEach(tab => {
                    tab.addEventListener('click', function() {
                        const year = this.getAttribute('data-year');
                        
                        // Désactiver tous les onglets et contenus
                        yearTabs.forEach(t => t.classList.remove('active'));
                        yearContents.forEach(c => c.classList.remove('active'));
                        
                        // Activer l'onglet cliqué et le contenu correspondant
                        this.classList.add('active');
                        document.getElementById(`year-content-${year}`).classList.add('active');
                    });
                });
            }
        },
        
        // Affiche les formes juridiques incompatibles
        displayIncompatibilites: function(incompatibles) {
            if (!incompatibles || incompatibles.length === 0) return '';
            
            let html = `
                <div class="mt-8 mb-6">
                    <h3 class="text-xl font-bold text-red-400 mb-4 flex items-center">
                        <i class="fas fa-exclamation-triangle mr-2"></i> 
                        Formes juridiques incompatibles avec votre profil
                    </h3>
                    <div class="bg-blue-900 bg-opacity-20 p-4 rounded-xl">
                        <p class="mb-4">Les structures suivantes présentent des incompatibilités majeures avec vos critères :</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;
            
            // Regrouper les incompatibilités par forme juridique
            const incompatibiliteParForme = {};
            incompatibles.forEach(inc => {
                const forme = FormeJuridiqueDB.getById(inc.formeId);
                if (forme) {
                    if (!incompatibiliteParForme[forme.id]) {
                        incompatibiliteParForme[forme.id] = {
                            forme: forme,
                            raisons: [],
                            solution: this.getSolutionDeRepli(forme.id, inc.code)
                        };
                    }
                    
                    // Vérifier si cette raison n'est pas déjà listée
                    const raisonExiste = incompatibiliteParForme[forme.id].raisons.some(r => r.code === inc.code);
                    if (!raisonExiste) {
                        incompatibiliteParForme[forme.id].raisons.push({
                            code: inc.code,
                            message: inc.message,
                            details: inc.details
                        });
                    }
                }
            });
            
            // Générer le HTML pour chaque forme incompatible
            Object.values(incompatibiliteParForme).forEach(item => {
                html += `
                    <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                        <h4 class="font-semibold text-red-400 mb-2">${item.forme.nom}</h4>
                        <ul class="text-sm">
                `;
                
                item.raisons.forEach(raison => {
                    html += `<li class="mb-1 flex items-start">
                        <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                        <span>${raison.message}</span>
                    </li>`;
                });
                
                // Ajouter la solution de repli si disponible
                if (item.solution) {
                    html += `
                        <li class="mt-3 pt-2 border-t border-red-800 flex items-start">
                            <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-1"></i>
                            <span><strong>Alternative :</strong> ${item.solution}</span>
                        </li>
                    `;
                }
                
                html += `
                        </ul>
                    </div>
                `;
            });
            
            html += `
                        </div>
                    </div>
                </div>
            `;
            
            return html;
        },
        
        // Renvoie une solution de repli adaptée selon le type d'incompatibilité
        getSolutionDeRepli: function(formeId, codeErreur) {
            const solutions = {
                'micro-entreprise': {
                    'ca-depasse-seuil': 'Optez pour une EURL ou SASU permettant des volumes d\'activité plus importants',
                    'ordre-professionnel': 'Choisissez une SEL ou SELAS adaptée aux professions réglementées',
                    'investisseurs': 'Considérez une SAS pour accueillir des investisseurs',
                    'garantie-decennale': 'Optez pour une EURL ou SASU offrant une meilleure protection juridique',
                    'structure-holding': 'Choisissez une SAS ou SA adaptée aux structures de holding'
                },
                'ei': {
                    'protection-patrimoine': 'Privilégiez une EURL qui offre une meilleure protection patrimoniale',
                    'levee-fonds': 'Optez pour une SAS ou SASU plus adaptée à la levée de fonds',
                    'garantie-decennale': 'Préférez une EURL pour les activités nécessitant des assurances importantes',
                    'structure-holding': 'Choisissez une SAS ou SA adaptée aux structures de holding'
                },
                'sasu': {
                    'charges-elevees': 'Envisagez une EURL à l\'IR pour optimiser les charges sociales avec un CA faible',
                    'formalisme': 'Si la simplicité est prioritaire, considérez la micro-entreprise (si CA compatible)'
                }
            };
            
            return solutions[formeId] && solutions[formeId][codeErreur] 
                ? solutions[formeId][codeErreur] 
                : 'Consultez les autres formes recommandées dans les résultats';
        },
        
        // Prépare le tableau comparatif complet
        prepareComparatifTable: function(formesJuridiques) {
            const comparatifTableBody = document.getElementById('comparatif-table-body');
            if (!comparatifTableBody) return;
            
            // Vider le tableau existant
            comparatifTableBody.innerHTML = '';
            
            // Créer une ligne pour chaque forme juridique
            formesJuridiques.forEach(forme => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-blue-900 hover:bg-opacity-40';
                
                // Créer les cellules
                row.innerHTML = `
                    <td class="p-3">
                        <div class="font-semibold">${forme.nom}</div>
                        <div class="text-xs text-gray-400">${forme.categorie}</div>
                    </td>
                    <td class="p-3">${forme.associes}</td>
                    <td class="p-3">${forme.capital}</td>
                    <td class="p-3">${forme.responsabilite}</td>
                    <td class="p-3">${forme.fiscalite}${forme.fiscaliteOption === 'Oui' ? ' (option)' : ''}</td>
                    <td class="p-3">${forme.regimeSocial}</td>
                    <td class="p-3">
                        <ul class="text-sm list-disc pl-4">
                            <li>${forme.avantages.split(',')[0]}</li>
                            ${forme.avantages.includes(',') ? `<li>${forme.avantages.split(',')[1]}</li>` : ''}
                        </ul>
                    </td>
                    <td class="p-3">
                        <ul class="text-sm list-disc pl-4">
                            <li>${forme.inconvenients.split(',')[0]}</li>
                            ${forme.inconvenients.includes(',') ? `<li>${forme.inconvenients.split(',')[1]}</li>` : ''}
                        </ul>
                    </td>
                `;
                
                // Ajouter la ligne au tableau
                comparatifTableBody.appendChild(row);
            });
            
            // Configurer les boutons pour afficher/masquer le tableau
            const compareBtn = document.getElementById('compare-btn');
            const hideComparatifBtn = document.getElementById('hide-comparatif');
            const comparatifComplet = document.getElementById('comparatif-complet');
            const resultsContainer = document.getElementById('results-container');
            
            if (compareBtn && hideComparatifBtn && comparatifComplet && resultsContainer) {
                compareBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    resultsContainer.classList.add('hidden');
                    comparatifComplet.classList.remove('hidden');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                
                hideComparatifBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    comparatifComplet.classList.add('hidden');
                    resultsContainer.classList.remove('hidden');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            }
        },
        
        // Génère un tableau comparatif IR vs IS
        renderTaxRegimeComparison: function(forme, caSimulation, tauxMarge) {
            // Calculer le bénéfice (revenu imposable avant impôt)
            const benefice = caSimulation * (tauxMarge / 100);
            
            // Calculer les résultats pour l'IR
            const irResult = {
                tauxEffectif: 30, // Valeur par défaut
                netApreesImpot: Math.round(benefice * 0.7) // Estimation simplifiée
            };
            
            // Calculer les résultats pour l'IS
            const isResult = {
                tauxIS: benefice <= 42500 ? 15 : 25,
                netApreesImpot: Math.round(benefice * (benefice <= 42500 ? 0.85 : 0.75)) // Estimation simplifiée
            };
            
            // Déterminer le régime le plus avantageux
            const irMeilleur = irResult.netApreesImpot > isResult.netApreesImpot;
            const difference = Math.abs(irResult.netApreesImpot - isResult.netApreesImpot);
            
            return `
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
                <h4 class="font-semibold text-green-400 mb-3">Comparaison des régimes fiscaux IR vs IS</h4>
                
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-gray-700">
                                <th class="text-left p-2">Critère</th>
                                <th class="text-left p-2">IR (Impôt sur le Revenu)</th>
                                <th class="text-left p-2">IS (Impôt sur les Sociétés)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-gray-700">
                                <td class="p-2">Imposition des bénéfices</td>
                                <td class="p-2">Barème progressif (TMI: ${irResult.tauxEffectif}%)</td>
                                <td class="p-2">${isResult.tauxIS}% ${isResult.tauxIS === 15 ? '(taux réduit PME)' : ''}</td>
                            </tr>
                            <tr class="border-b border-gray-700">
                                <td class="p-2">Montant net après impôt</td>
                                <td class="p-2 ${irMeilleur ? 'text-green-400 font-semibold' : ''}">${irResult.netApreesImpot.toLocaleString('fr-FR')} €</td>
                                <td class="p-2 ${!irMeilleur ? 'text-green-400 font-semibold' : ''}">${isResult.netApreesImpot.toLocaleString('fr-FR')} €</td>
                            </tr>
                            <tr class="border-b border-gray-700">
                                <td class="p-2">Charges sociales</td>
                                <td class="p-2">Sur la totalité du bénéfice</td>
                                <td class="p-2">Uniquement sur la rémunération</td>
                            </tr>
                            <tr class="border-b border-gray-700">
                                <td class="p-2">Flexibilité de rémunération</td>
                                <td class="p-2">Limitée (prélèvements personnels)</td>
                                <td class="p-2">Élevée (salaire + dividendes)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="mt-4 p-3 ${irMeilleur ? 'bg-green-900' : 'bg-blue-900'} bg-opacity-30 rounded-lg">
                    <p class="flex items-center">
                        <i class="fas fa-info-circle mr-2 ${irMeilleur ? 'text-green-400' : 'text-blue-400'}"></i>
                        <span>
                            <strong>Pour votre situation actuelle:</strong> 
                            Le régime ${irMeilleur ? 'IR semble plus avantageux' : 'IS semble plus avantageux'} 
                            fiscalement (différence de ${difference.toLocaleString('fr-FR')} €).
                            ${forme.fiscaliteOption === 'Oui' ? 
                                `<strong class="text-green-400">Votre forme juridique (${forme.nom}) vous permet de choisir entre les deux régimes.</strong>` : 
                                ''}
                        </span>
                    </p>
                </div>
            </div>`;
        },
        
        // Génère une simulation comparative de répartition salaire/dividendes
        renderSalaryDividendSimulation: function(forme, caSimulation, tauxMarge) {
            // Vérifier si la forme juridique permet les dividendes
            if (forme.fiscalite !== 'IS' && forme.fiscaliteOption !== 'Oui') {
                return ''; // Ne pas afficher pour les formes qui ne permettent pas la distribution de dividendes
            }
            
            // Calculer le bénéfice (revenu imposable avant impôt)
            const benefice = caSimulation * (tauxMarge / 100);
            
            // Créer les données pour plusieurs scénarios
            const scenarios = [
                { salaire: 100, dividendes: 0 },
                { salaire: 75, dividendes: 25 },
                { salaire: 50, dividendes: 50 },
                { salaire: 25, dividendes: 75 },
                { salaire: 0, dividendes: 100 }
            ];
            
            // Générer les résultats pour chaque scénario
            const results = scenarios.map(scenario => {
                const salaireAmount = benefice * (scenario.salaire / 100);
                const dividendesAmount = benefice * (scenario.dividendes / 100);
                
                // Calculs simplifiés
                const chargesSalaire = salaireAmount * 0.45; // ~45% de charges sur salaire
                const impotSalaire = salaireAmount * 0.1; // ~10% d'impôt sur le salaire (approximation)
                
                const impotSociete = dividendesAmount * 0.25; // 25% d'IS
                const chargesDividendes = (dividendesAmount - impotSociete) * 0.172; // 17.2% de prélèvements sociaux sur dividendes nets d'IS
                const impotDividendes = (dividendesAmount - impotSociete) * 0.12; // ~12% d'impôt sur dividendes (approximation PFU - prélèvements sociaux)
                
                const totalCharges = chargesSalaire + chargesDividendes;
                const totalImpots = impotSalaire + impotSociete + impotDividendes;
                const netTotal = salaireAmount + dividendesAmount - totalCharges - totalImpots;
                
                return {
                    ...scenario,
                    netTotal: Math.round(netTotal),
                    charges: Math.round(totalCharges),
                    impots: Math.round(totalImpots)
                };
            });
            
            // Trouver le scénario optimal
            const maxNet = Math.max(...results.map(r => r.netTotal));
            const optimalScenario = results.find(r => r.netTotal === maxNet);
            
            return `
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
                <h4 class="font-semibold text-green-400 mb-3">Impact de la répartition salaire/dividendes</h4>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h5 class="font-medium mb-2">Simulation sur un bénéfice de ${Math.round(benefice).toLocaleString('fr-FR')} €</h5>
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-gray-700">
                                    <th class="text-left p-2">Répartition</th>
                                    <th class="text-right p-2">Charges</th>
                                    <th class="text-right p-2">Impôts</th>
                                    <th class="text-right p-2">Revenu net</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.map(r => `
                                <tr class="border-b border-gray-700 ${r.netTotal === maxNet ? 'bg-green-900 bg-opacity-20' : ''}">
                                    <td class="p-2">${r.salaire}% / ${r.dividendes}%</td>
                                    <td class="p-2 text-right">${r.charges.toLocaleString('fr-FR')} €</td>
                                    <td class="p-2 text-right">${r.impots.toLocaleString('fr-FR')} €</td>
                                    <td class="p-2 text-right font-semibold ${r.netTotal === maxNet ? 'text-green-400' : ''}">${r.netTotal.toLocaleString('fr-FR')} €</td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="bg-blue-800 bg-opacity-40 p-4 rounded-lg">
                        <h5 class="font-medium text-green-400 mb-3">Stratégie optimale pour votre situation</h5>
                        <div class="mb-4">
                            <div class="text-xl font-bold">${optimalScenario.salaire}% salaire / ${optimalScenario.dividendes}% dividendes</div>
                            <div class="text-sm text-gray-400 mt-1">Revenu net estimé: ${optimalScenario.netTotal.toLocaleString('fr-FR')} €</div>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="font-medium mb-1">Pourquoi cette répartition ?</h6>
                            <ul class="text-sm">
                                ${optimalScenario.salaire === 100 ? 
                                    '<li class="mb-1">• Votre TMI actuelle est faible, privilégiez le salaire</li>' : 
                                    ''}
                                ${optimalScenario.dividendes === 100 ? 
                                    '<li class="mb-1">• Charges sociales très élevées sur salaire, privilégiez les dividendes</li>' : 
                                    ''}
                                ${optimalScenario.salaire > 0 && optimalScenario.dividendes > 0 ? 
                                    '<li class="mb-1">• Une répartition mixte optimise votre fiscalité globale</li>' : 
                                    ''}
                                <li class="mb-1">• Cette répartition réduit votre pression fiscale et sociale</li>
                            </ul>
                        </div>
                        
                        <div>
                            <h6 class="font-medium mb-1">Considérations importantes</h6>
                            <ul class="text-sm">
                                <li class="mb-1">• Protection sociale plus faible avec dividendes</li>
                                <li class="mb-1">• Besoin d'une trésorerie suffisante pour les dividendes</li>
                                <li class="mb-1">• Impact différent sur votre crédit immobilier futur</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>`;
        },
        
        // Génère une simulation pluriannuelle avec prise en compte de la répartition salaire/dividendes
        renderMultiYearSimulation: function(forme, caSimulation, tauxMarge) {
            // Définir progression de CA sur 3 ans
            const caYear1 = caSimulation;
            const caYear2 = Math.round(caSimulation * 1.2); // +20%
            const caYear3 = Math.round(caYear2 * 1.2); // +20% supplémentaire
            
            // Calcul du bénéfice pour chaque année
            const beneficeYear1 = caYear1 * (tauxMarge / 100);
            const beneficeYear2 = caYear2 * (tauxMarge / 100);
            const beneficeYear3 = caYear3 * (tauxMarge / 100);
            
            // Calculer les résultats pour chaque année
            let resultYear1, resultYear2, resultYear3;
            
            // Appliquer les calculs selon le type de structure juridique
            if (forme.id === 'micro-entreprise' || forme.id === 'ei') {
                // Pour micro-entreprise et EI, pas de distinction salaire/dividendes
                resultYear1 = this.calculateMicroEntrepriseYear(beneficeYear1, 1, forme.id);
                resultYear2 = this.calculateMicroEntrepriseYear(beneficeYear2, 2, forme.id);
                resultYear3 = this.calculateMicroEntrepriseYear(beneficeYear3, 3, forme.id);
            } else {
                // Pour EURL, SASU, SAS, etc. avec IS ou option IS
                resultYear1 = this.calculateSocietyWithISYear(beneficeYear1, 1, forme.id, this.simulationParams.ratioSalaire, this.simulationParams.ratioDividendes);
                resultYear2 = this.calculateSocietyWithISYear(beneficeYear2, 2, forme.id, this.simulationParams.ratioSalaire, this.simulationParams.ratioDividendes);
                resultYear3 = this.calculateSocietyWithISYear(beneficeYear3, 3, forme.id, this.simulationParams.ratioSalaire, this.simulationParams.ratioDividendes);
            }
            
            return `
            <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-4">
                <h4 class="font-semibold text-green-400 mb-3">Projection sur 3 ans</h4>
                
                <div class="year-tabs flex border-b border-gray-700 mb-4">
                    <div class="year-tab active px-4 py-2 cursor-pointer" data-year="1">Année 1</div>
                    <div class="year-tab px-4 py-2 cursor-pointer" data-year="2">Année 2</div>
                    <div class="year-tab px-4 py-2 cursor-pointer" data-year="3">Année 3</div>
                </div>
                
                <div class="year-content active" id="year-content-1">
                    <h5 class="font-medium mb-2">Année 1 ${resultYear1.acre ? '<span class="acre-badge"><i class="fas fa-star"></i> ACRE</span>' : ''}</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Chiffre d'affaires</div>
                            <div class="text-xl font-semibold">${caYear1.toLocaleString('fr-FR')} €</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Charges sociales</div>
                            <div class="text-xl font-semibold">${resultYear1.charges.toLocaleString('fr-FR')} €</div>
                            ${resultYear1.acre ? '<div class="text-xs text-green-400">Réduction ACRE appliquée (-50%)</div>' : ''}
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Impôts</div>
                            <div class="text-xl font-semibold">${resultYear1.impots.toLocaleString('fr-FR')} €</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Revenu net</div>
                            <div class="text-xl font-semibold text-green-400">${resultYear1.net.toLocaleString('fr-FR')} €</div>
                        </div>
                    </div>
                    ${forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui' ? `
                    <div class="mt-3 bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <p class="text-sm mb-2">Répartition appliquée: ${this.simulationParams.ratioSalaire}% salaire / ${this.simulationParams.ratioDividendes}% dividendes</p>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <div class="text-xs opacity-70">Salaire net</div>
                                <div>${Math.round(resultYear1.salaireNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                            <div>
                                <div class="text-xs opacity-70">Dividendes nets</div>
                                <div>${Math.round(resultYear1.dividendesNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                        </div>
                    </div>` : ''}
                </div>
                
                <div class="year-content hidden" id="year-content-2">
                    <h5 class="font-medium mb-2">Année 2</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Chiffre d'affaires</div>
                            <div class="text-xl font-semibold">${caYear2.toLocaleString('fr-FR')} €</div>
                            <div class="text-xs text-green-400">+20% vs année 1</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Charges sociales</div>
                            <div class="text-xl font-semibold">${resultYear2.charges.toLocaleString('fr-FR')} €</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Impôts</div>
                            <div class="text-xl font-semibold">${resultYear2.impots.toLocaleString('fr-FR')} €</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Revenu net</div>
                            <div class="text-xl font-semibold text-green-400">${resultYear2.net.toLocaleString('fr-FR')} €</div>
                        </div>
                    </div>
                    ${forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui' ? `
                    <div class="mt-3 bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <p class="text-sm mb-2">Répartition appliquée: ${this.simulationParams.ratioSalaire}% salaire / ${this.simulationParams.ratioDividendes}% dividendes</p>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <div class="text-xs opacity-70">Salaire net</div>
                                <div>${Math.round(resultYear2.salaireNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                            <div>
                                <div class="text-xs opacity-70">Dividendes nets</div>
                                <div>${Math.round(resultYear2.dividendesNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                        </div>
                    </div>` : ''}
                </div>
                
                <div class="year-content hidden" id="year-content-3">
                    <h5 class="font-medium mb-2">Année 3</h5>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Chiffre d'affaires</div>
                            <div class="text-xl font-semibold">${caYear3.toLocaleString('fr-FR')} €</div>
                            <div class="text-xs text-green-400">+44% vs année 1</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Charges sociales</div>
                            <div class="text-xl font-semibold">${resultYear3.charges.toLocaleString('fr-FR')} €</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Impôts</div>
                            <div class="text-xl font-semibold">${resultYear3.impots.toLocaleString('fr-FR')} €</div>
                        </div>
                        <div class="bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                            <div class="text-xs text-gray-400">Revenu net</div>
                            <div class="text-xl font-semibold text-green-400">${resultYear3.net.toLocaleString('fr-FR')} €</div>
                        </div>
                    </div>
                    ${forme.fiscalite === 'IS' || forme.fiscaliteOption === 'Oui' ? `
                    <div class="mt-3 bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                        <p class="text-sm mb-2">Répartition appliquée: ${this.simulationParams.ratioSalaire}% salaire / ${this.simulationParams.ratioDividendes}% dividendes</p>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <div class="text-xs opacity-70">Salaire net</div>
                                <div>${Math.round(resultYear3.salaireNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                            <div>
                                <div class="text-xs opacity-70">Dividendes nets</div>
                                <div>${Math.round(resultYear3.dividendesNet || 0).toLocaleString('fr-FR')} €</div>
                            </div>
                        </div>
                    </div>` : ''}
                </div>
            </div>`;
        },
        
  // Affiche les stratégies optimales pour une forme juridique
renderOptimalStrategies: function(forme, userResponses) {
    let strategies;
    
    switch (forme.id) {
        case 'micro-entreprise':
            strategies = [
                'Démarrez rapidement pour tester votre concept',
                'Optimisez votre CA en restant sous les seuils',
                userResponses.tmiActuel <= 11 ? 'Optez pour le versement libératoire d\'impôt' : 'Anticipez le passage à une forme sociétale à terme',
                'Évitez les activités nécessitant des assurances professionnelles coûteuses',
                userResponses.statutPorteur === 'demandeur-emploi' ? 'Profitez de l\'ACRE pour réduire vos charges' : 'Optez pour les déclarations trimestrielles si votre activité est stable'
            ].filter(Boolean);
            break;
            
        case 'ei':
            strategies = [
                'Déduisez vos frais réels pour optimiser votre bénéfice imposable',
                'Créez un compte bancaire dédié pour séparer professionnelle/personnelle',
                'Pensez à la location-gérance pour transmettre votre activité',
                userResponses.statutPorteur === 'demandeur-emploi' ? 'Profitez de l\'ACRE pour réduire vos charges' : 'Adhérez à un organisme de gestion agréé pour éviter la majoration fiscale',
                userResponses.tauxMarge < 20 ? 'Évaluez l\'option micro-entreprise si votre CA le permet' : 'Optimisez votre trésorerie avec un bon suivi comptable'
            ];
            break;
            
        case 'eurl':
            strategies = [
                'Choisissez le statut fiscal optimal entre IR et IS selon votre TMI',
                'Répartissez intelligemment entre rémunération et réserves',
                userResponses.bienImmobilier ? 'Utilisez la SCI pour vos locaux professionnels' : 'Achetez vos locaux en nom propre puis louez-les à l\'EURL',
                'Basculez vers l\'IS après 2-3 ans quand votre activité sera stabilisée',
                userResponses.regimeMatrimonial === 'communaute-reduite' ? 'Protégez votre patrimoine familial avec un mandat de protection future' : 'Envisagez de transformer en SASU à terme pour une revente facilitée'
            ];
            break;
            
        case 'sasu':
            strategies = [
                'Optimisez votre répartition salaire/dividendes annuellement',
                userResponses.tmiActuel >= 30 ? 'Privilégiez les dividendes avec le PFU à 30%' : 'Privilégiez le salaire pour bénéficier de droits sociaux supérieurs',
                'Utilisez la convention de portage lors d\'une levée de fonds',
                'Profitez des dispositifs d\'épargne salariale (PEE, PERCO)',
                userResponses.montantLevee > 50000 ? 'Créez des catégories d\'actions pour vos investisseurs' : 'Structurez votre capital pour faciliter l\'entrée d\'associés futurs'
            ];
            break;
            
        case 'sas':
            strategies = [
                'Élaborez des statuts sur mesure pour votre gouvernance',
                'Mettez en place des droits de vote double pour garder le contrôle',
                'Prévoyez des clauses d\'agrément et de sortie adaptées',
                userResponses.typeInvestisseurs.includes('vc') ? 'Structurez votre capital avec des actions de préférence' : 'Créez un pacte d\'actionnaires solide',
                userResponses.structureHolding ? 'Optimisez avec une holding animatrice pour l\'intégration fiscale' : 'Prévoyez une réserve spéciale de participation pour motiver vos salariés'
            ];
            break;
            
        case 'sarl':
            strategies = [
                'Optimisez la répartition des parts entre associés',
                'Utilisez judicieusement le compte courant d\'associé',
                userResponses.profilEntrepreneur === 'famille' ? 'Prévoyez la transmission familiale dans les statuts' : 'Mettez en place une convention de cession progressive',
                'Bénéficiez de la fiscalité des dividendes pour le gérant majoritaire',
                'Prévoyez les cas de mésentente entre associés avec des clauses adaptées'
            ];
            break;
            
        default:
            strategies = [
                'Consultez un expert-comptable pour optimiser votre structure',
                'Adaptez votre stratégie de rémunération à votre activité',
                'Prévoyez l\'évolution de votre structure à 3-5 ans',
                'Sécurisez votre patrimoine personnel avec les bons outils juridiques',
                'Équilibrez optimisation fiscale et couverture sociale'
            ];
    }
    
    // Filtrer les stratégies nulles ou vides
    strategies = strategies.filter(s => s);
    
    return `
    <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-6">
        <h4 class="font-semibold text-green-400 mb-3">Stratégies optimales pour votre ${forme.nom}</h4>
        
        <div class="grid grid-cols-1 gap-3">
            ${strategies.map((strategy, index) => `
                <div class="flex items-start bg-blue-800 bg-opacity-40 p-3 rounded-lg">
                    <div class="strategy-number flex-shrink-0 mr-3">
                        <span>${index + 1}</span>
                    </div>
                    <div>
                        <p class="font-medium">${strategy}</p>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="mt-4 text-sm">
            <p class="flex items-center">
                <i class="fas fa-info-circle mr-2 text-blue-400"></i>
                <span>Ces recommandations sont adaptées à votre situation mais ne remplacent pas l'avis d'un expert-comptable.</span>
            </p>
        </div>
    </div>`;
}
