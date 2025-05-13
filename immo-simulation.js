/**
 * immo-simulation.js - Logique de calcul pour le simulateur immobilier
 * 
 * Ce script contient toutes les fonctions de calcul nécessaires pour la simulation
 * d'investissement immobilier, comparant l'achat classique et la vente aux enchères.
 * 
 * Version 2.0 - Optimisée pour calculer le prix maximum possible selon l'apport
 * et le prêt disponible, en maintenant un cash-flow minimum.
 */

class SimulateurImmo {
    constructor() {
        // Paramètres initialisés par défaut
        this.params = {
            base: {
                apport: 20000,                // Apport disponible
                montantEmpruntMax: 150000,    // Montant maximum d'emprunt disponible
                surface: 50,                  // Surface en m²
                taux: 3.5,                    // Taux d'emprunt
                duree: 20,                    // Durée du prêt
                objectif: 'cashflow',         // Objectif: cashflow ou rendement
                rendementMin: 5,              // Rendement minimum souhaité
                cashFlowMin: 1                // Cash-flow minimum souhaité (1€)
            },
            communs: {
                fraisBancairesDossier: 2000,
                fraisBancairesCompte: 710,
                fraisGarantie: 1.3709,        // % du capital emprunté
                taxeFonciere: 1,              // % du prix
                vacanceLocative: 8,           // % des loyers
                loyerM2: 12,                  // €/m²/mois
                travauxM2: 400,               // €/m²
                entretienAnnuel: 0.5,         // % du prix d'achat
                assurancePNO: 250,            // € par an
                chargesNonRecuperables: 10    // % des loyers
            },
            classique: {
                publiciteFonciere: 0.72,      // % du prix
                droitsMutation: 5.81,         // % du prix
                securiteImmobiliere: 0.10,    // % du prix
                emolumentsVente: 1.12,        // % du prix
                formalites: 0.28,             // % du prix
                debours: 0.13,                // % du prix
                commissionImmo: 5             // % du prix
            },
            encheres: {
                droitsEnregistrement: 5.70,   // % du prix
                coefMutation: 2.37,           // Coefficient
                emolumentsPoursuivant1: 7,    // % (0-6500€)
                emolumentsPoursuivant2: 3,    // % (6500-23500€)
                emolumentsPoursuivant3: 2,    // % (23500-83500€)
                emolumentsPoursuivant4: 1,    // % (au-delà de 83500€)
                honorairesAvocatCoef: 0.25,   // x émoluments
                honorairesAvocatTVA: 20,      // %
                publiciteFonciereEncheres: 0.10, // % du prix
                fraisFixes: 50,               // €
                avocatEnchere: 300,           // €
                suiviDossier: 1200,           // €
                cautionPourcent: 5,           // % du prix de mise à prix
                cautionRestituee: true
            },
            fiscalite: {
                tauxPrelevementsSociaux: 17.2, // %
                tauxMarginalImpot: 30,        // %
                deficitFoncier: true
            },
            // Pour stocker les résultats
            resultats: {
                classique: {},
                encheres: {}
            }
        };
        
        // Historique des simulations pour comparaisons
        this.historiqueSimulations = [];
    }

    /**
     * Charge les paramètres depuis le formulaire
     * @param {Object} formData - Données du formulaire
     */
    chargerParametres(formData) {
        // Paramètres de base
        this.params.base.apport = parseFloat(formData.apport) || 20000;
        this.params.base.montantEmpruntMax = parseFloat(formData.montantEmpruntMax) || 150000;
        this.params.base.surface = parseFloat(formData.surface) || 50;
        this.params.base.taux = parseFloat(formData.taux) || 3.5;
        this.params.base.duree = parseFloat(formData.duree) || 20;
        this.params.base.objectif = formData.objectif || 'cashflow';
        this.params.base.rendementMin = parseFloat(formData.rendementMin) || 5;
        this.params.base.cashFlowMin = parseFloat(formData.cashFlowMin) || 1;

        // Paramètres communs
        if (formData.fraisBancairesDossier !== undefined) 
            this.params.communs.fraisBancairesDossier = parseFloat(formData.fraisBancairesDossier);
        if (formData.fraisBancairesCompte !== undefined) 
            this.params.communs.fraisBancairesCompte = parseFloat(formData.fraisBancairesCompte);
        if (formData.fraisGarantie !== undefined) 
            this.params.communs.fraisGarantie = parseFloat(formData.fraisGarantie);
        if (formData.taxeFonciere !== undefined) 
            this.params.communs.taxeFonciere = parseFloat(formData.taxeFonciere);
        if (formData.vacanceLocative !== undefined) 
            this.params.communs.vacanceLocative = parseFloat(formData.vacanceLocative);
        if (formData.loyerM2 !== undefined) 
            this.params.communs.loyerM2 = parseFloat(formData.loyerM2);
        if (formData.travauxM2 !== undefined) 
            this.params.communs.travauxM2 = parseFloat(formData.travauxM2);
        if (formData.entretienAnnuel !== undefined)
            this.params.communs.entretienAnnuel = parseFloat(formData.entretienAnnuel);
        if (formData.assurancePNO !== undefined)
            this.params.communs.assurancePNO = parseFloat(formData.assurancePNO);
        if (formData.chargesNonRecuperables !== undefined)
            this.params.communs.chargesNonRecuperables = parseFloat(formData.chargesNonRecuperables);

        // Paramètres achat classique
        if (formData.publiciteFonciere !== undefined) 
            this.params.classique.publiciteFonciere = parseFloat(formData.publiciteFonciere);
        if (formData.droitsMutation !== undefined) 
            this.params.classique.droitsMutation = parseFloat(formData.droitsMutation);
        if (formData.securiteImmobiliere !== undefined) 
            this.params.classique.securiteImmobiliere = parseFloat(formData.securiteImmobiliere);
        if (formData.emolumentsVente !== undefined) 
            this.params.classique.emolumentsVente = parseFloat(formData.emolumentsVente);
        if (formData.formalites !== undefined) 
            this.params.classique.formalites = parseFloat(formData.formalites);
        if (formData.debours !== undefined) 
            this.params.classique.debours = parseFloat(formData.debours);
        if (formData.commissionImmo !== undefined) 
            this.params.classique.commissionImmo = parseFloat(formData.commissionImmo);

        // Paramètres vente aux enchères
        if (formData.droitsEnregistrement !== undefined) 
            this.params.encheres.droitsEnregistrement = parseFloat(formData.droitsEnregistrement);
        if (formData.coefMutation !== undefined) 
            this.params.encheres.coefMutation = parseFloat(formData.coefMutation);
        if (formData.emolumentsPoursuivant1 !== undefined) 
            this.params.encheres.emolumentsPoursuivant1 = parseFloat(formData.emolumentsPoursuivant1);
        if (formData.emolumentsPoursuivant2 !== undefined) 
            this.params.encheres.emolumentsPoursuivant2 = parseFloat(formData.emolumentsPoursuivant2);
        if (formData.emolumentsPoursuivant3 !== undefined) 
            this.params.encheres.emolumentsPoursuivant3 = parseFloat(formData.emolumentsPoursuivant3);
        if (formData.emolumentsPoursuivant4 !== undefined) 
            this.params.encheres.emolumentsPoursuivant4 = parseFloat(formData.emolumentsPoursuivant4);
        if (formData.honorairesAvocatCoef !== undefined) 
            this.params.encheres.honorairesAvocatCoef = parseFloat(formData.honorairesAvocatCoef);
        if (formData.honorairesAvocatTVA !== undefined) 
            this.params.encheres.honorairesAvocatTVA = parseFloat(formData.honorairesAvocatTVA);
        if (formData.publiciteFonciereEncheres !== undefined) 
            this.params.encheres.publiciteFonciereEncheres = parseFloat(formData.publiciteFonciereEncheres);
        if (formData.fraisFixes !== undefined) 
            this.params.encheres.fraisFixes = parseFloat(formData.fraisFixes);
        if (formData.avocatEnchere !== undefined) 
            this.params.encheres.avocatEnchere = parseFloat(formData.avocatEnchere);
        if (formData.suiviDossier !== undefined) 
            this.params.encheres.suiviDossier = parseFloat(formData.suiviDossier);
        if (formData.cautionPourcent !== undefined) 
            this.params.encheres.cautionPourcent = parseFloat(formData.cautionPourcent);
        if (formData.cautionRestituee !== undefined) 
            this.params.encheres.cautionRestituee = formData.cautionRestituee;
            
        // Paramètres fiscalité
        if (formData.tauxPrelevementsSociaux !== undefined)
            this.params.fiscalite.tauxPrelevementsSociaux = parseFloat(formData.tauxPrelevementsSociaux);
        if (formData.tauxMarginalImpot !== undefined)
            this.params.fiscalite.tauxMarginalImpot = parseFloat(formData.tauxMarginalImpot);
        if (formData.deficitFoncier !== undefined)
            this.params.fiscalite.deficitFoncier = formData.deficitFoncier;
    }

    /**
     * Sauvegarde les résultats de la simulation actuelle dans l'historique
     * @param {string} nom - Nom de la simulation
     * @returns {boolean} - Succès de la sauvegarde
     */
    sauvegarderSimulation(nom) {
        // Vérifier si des résultats existent
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return false;
        }
        
        // Créer une copie des résultats et paramètres actuels
        const copieResultats = JSON.parse(JSON.stringify(this.params.resultats));
        const copieParams = {
            base: {...this.params.base},
            communs: {...this.params.communs},
            classique: {...this.params.classique},
            encheres: {...this.params.encheres},
            fiscalite: {...this.params.fiscalite}
        };
        
        // Ajouter à l'historique
        this.historiqueSimulations.push({
            id: Date.now(),
            nom: nom || `Simulation du ${new Date().toLocaleDateString()}`,
            date: new Date(),
            params: copieParams,
            resultats: copieResultats
        });
        
        // Limiter l'historique à 10 simulations
        if (this.historiqueSimulations.length > 10) {
            this.historiqueSimulations.shift();
        }
        
        return true;
    }

    /**
     * Récupère l'historique des simulations
     * @returns {Array} - Historique des simulations
     */
    getHistoriqueSimulations() {
        return this.historiqueSimulations;
    }

    /**
     * Calcule le montant total des frais de notaire pour l'achat classique
     * @param {number} prix - Prix d'achat
     * @returns {number} - Montant total des frais de notaire
     */
    calculerFraisNotaireClassique(prix) {
        return prix * (
            this.params.classique.publiciteFonciere / 100 +
            this.params.classique.droitsMutation / 100 +
            this.params.classique.securiteImmobiliere / 100 +
            this.params.classique.emolumentsVente / 100 +
            this.params.classique.formalites / 100 +
            this.params.classique.debours / 100
        );
    }

    /**
     * Calcule les émoluments du poursuivant pour la vente aux enchères
     * @param {number} prix - Prix d'adjudication
     * @returns {number} - Montant des émoluments
     */
    calculerEmolumentsPoursuivant(prix) {
        let emoluments = 0;
        
        if (prix <= 6500) {
            emoluments = prix * this.params.encheres.emolumentsPoursuivant1 / 100;
        } else if (prix <= 23500) {
            emoluments = 6500 * this.params.encheres.emolumentsPoursuivant1 / 100;
            emoluments += (prix - 6500) * this.params.encheres.emolumentsPoursuivant2 / 100;
        } else if (prix <= 83500) {
            emoluments = 6500 * this.params.encheres.emolumentsPoursuivant1 / 100;
            emoluments += (23500 - 6500) * this.params.encheres.emolumentsPoursuivant2 / 100;
            emoluments += (prix - 23500) * this.params.encheres.emolumentsPoursuivant3 / 100;
        } else {
            emoluments = 6500 * this.params.encheres.emolumentsPoursuivant1 / 100;
            emoluments += (23500 - 6500) * this.params.encheres.emolumentsPoursuivant2 / 100;
            emoluments += (83500 - 23500) * this.params.encheres.emolumentsPoursuivant3 / 100;
            emoluments += (prix - 83500) * this.params.encheres.emolumentsPoursuivant4 / 100;
        }
        
        return emoluments;
    }

    /**
     * Calcule les honoraires d'avocat pour la vente aux enchères
     * @param {number} emoluments - Émoluments du poursuivant
     * @returns {number} - Montant des honoraires d'avocat
     */
    calculerHonorairesAvocat(emoluments) {
        return emoluments * 
            this.params.encheres.honorairesAvocatCoef * 
            (1 + this.params.encheres.honorairesAvocatTVA / 100);
    }

    /**
     * Calcule le montant des droits d'enregistrement pour la vente aux enchères
     * @param {number} prix - Prix d'adjudication
     * @returns {number} - Montant des droits d'enregistrement
     */
    calculerDroitsEnregistrement(prix) {
        return prix * 
            this.params.encheres.droitsEnregistrement / 100 * 
            this.params.encheres.coefMutation;
    }

    /**
     * Calcule le montant des frais bancaires
     * @param {number} capitalEmprunte - Capital emprunté
     * @returns {number} - Montant des frais bancaires
     */
    calculerFraisBancaires(capitalEmprunte) {
        return this.params.communs.fraisBancairesDossier + 
               this.params.communs.fraisBancairesCompte + 
               (capitalEmprunte * this.params.communs.fraisGarantie / 100);
    }

    /**
     * Calcule la mensualité du prêt
     * @param {number} montantPret - Montant du prêt
     * @param {number} taux - Taux d'intérêt annuel en %
     * @param {number} dureeAnnees - Durée du prêt en années
     * @returns {number} - Mensualité
     */
    calculerMensualite(montantPret, taux, dureeAnnees) {
        const tauxMensuel = taux / 100 / 12;
        const nombreMensualites = dureeAnnees * 12;
        
        if (tauxMensuel === 0) return montantPret / nombreMensualites;
        
        return (montantPret * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -nombreMensualites));
    }

    /**
     * Calcule le loyer mensuel net
     * @param {number} surface - Surface en m²
     * @param {number} prixM2 - Prix du loyer au m²
     * @param {number} vacance - Taux de vacance locative en %
     * @returns {number} - Loyer mensuel net
     */
    calculerLoyerNet(surface, prixM2, vacance) {
        const loyerBrut = surface * prixM2;
        return loyerBrut * (1 - vacance / 100);
    }

    /**
     * Calcule le montant des charges non récupérables
     * @param {number} loyerBrut - Loyer mensuel brut
     * @returns {number} - Montant mensuel des charges non récupérables
     */
    calculerChargesNonRecuperables(loyerBrut) {
        return loyerBrut * (this.params.communs.chargesNonRecuperables / 100);
    }

    /**
     * Calcule le montant de l'entretien annuel
     * @param {number} prixAchat - Prix d'achat
     * @returns {number} - Montant mensuel de l'entretien
     */
    calculerEntretienMensuel(prixAchat) {
        return (prixAchat * (this.params.communs.entretienAnnuel / 100)) / 12;
    }

    /**
     * Calcule le cash-flow mensuel
     * @param {number} loyerNet - Loyer mensuel net
     * @param {number} mensualite - Mensualité du prêt
     * @param {number} taxeFonciere - Montant annuel de la taxe foncière
     * @param {number} chargesNonRecuperables - Charges non récupérables mensuelles
     * @param {number} entretienMensuel - Coût d'entretien mensuel
     * @param {number} assurancePNO - Coût annuel de l'assurance PNO
     * @returns {number} - Cash-flow mensuel
     */
    calculerCashFlow(loyerNet, mensualite, taxeFonciere, chargesNonRecuperables, entretienMensuel, assurancePNO) {
        return loyerNet - mensualite - (taxeFonciere / 12) - chargesNonRecuperables - entretienMensuel - (assurancePNO / 12);
    }

    /**
     * Calcule l'impact fiscal
     * @param {number} revenuFoncier - Revenu foncier annuel avant impôts
     * @param {number} interetsEmprunt - Intérêts d'emprunt annuels
     * @returns {number} - Impact fiscal annuel
     */
    calculerImpactFiscal(revenuFoncier, interetsEmprunt) {
        // Si le revenu foncier est négatif et le déficit foncier est déductible
        if (revenuFoncier < 0 && this.params.fiscalite.deficitFoncier) {
            // Impact fiscal positif (économie d'impôt)
            const tauxImposition = (this.params.fiscalite.tauxMarginalImpot + this.params.fiscalite.tauxPrelevementsSociaux) / 100;
            return Math.abs(revenuFoncier) * tauxImposition;
        } 
        // Si le revenu foncier est positif
        else if (revenuFoncier > 0) {
            // Impact fiscal négatif (impôt à payer)
            const tauxImposition = (this.params.fiscalite.tauxMarginalImpot + this.params.fiscalite.tauxPrelevementsSociaux) / 100;
            return -revenuFoncier * tauxImposition;
        }
        
        return 0;
    }

    /**
     * Calcule le rendement net
     * @param {number} loyerAnnuelNet - Loyer annuel net
     * @param {number} chargesAnnuelles - Charges annuelles (taxe foncière, entretien, etc.)
     * @param {number} impactFiscal - Impact fiscal annuel
     * @param {number} prixTotal - Prix total de l'investissement
     * @returns {number} - Rendement net en %
     */
    calculerRendementNet(loyerAnnuelNet, chargesAnnuelles, impactFiscal, prixTotal) {
        const revenuNetApresImpot = loyerAnnuelNet - chargesAnnuelles + impactFiscal;
        return (revenuNetApresImpot / prixTotal) * 100;
    }

    /**
     * Calcule le tableau d'amortissement du prêt
     * @param {number} montantPret - Montant du prêt
     * @param {number} taux - Taux d'intérêt annuel en %
     * @param {number} dureeAnnees - Durée du prêt en années
     * @returns {Array} - Tableau d'amortissement
     */
    calculerTableauAmortissement(montantPret, taux, dureeAnnees) {
        const tauxMensuel = taux / 100 / 12;
        const nombreMensualites = dureeAnnees * 12;
        const mensualite = this.calculerMensualite(montantPret, taux, dureeAnnees);
        
        let capitalRestant = montantPret;
        const tableau = [];
        
        for (let i = 1; i <= nombreMensualites; i++) {
            const interets = capitalRestant * tauxMensuel;
            const amortissementCapital = mensualite - interets;
            
            capitalRestant -= amortissementCapital;
            
            tableau.push({
                periode: i,
                mensualite: mensualite,
                interets: interets,
                amortissementCapital: amortissementCapital,
                capitalRestant: Math.max(0, capitalRestant) // Éviter les valeurs négatives dues aux arrondis
            });
        }
        
        return tableau;
    }

    /**
     * Calcule le prix maximum pour l'achat classique selon les critères
     * en respectant la contrainte du montant d'emprunt maximum
     * @returns {Object} - Résultats de la simulation pour l'achat classique
     */
    simulerAchatClassique() {
        // Paramètres
        const apport = this.params.base.apport;
        const montantEmpruntMax = this.params.base.montantEmpruntMax;
        const surface = this.params.base.surface;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const objectif = this.params.base.objectif;
        const rendementMin = this.params.base.rendementMin;
        const cashFlowMin = this.params.base.cashFlowMin;
        const loyerM2 = this.params.communs.loyerM2;
        const vacanceLocative = this.params.communs.vacanceLocative;
        
        // Recherche dichotomique pour trouver le prix maximum
        let prixMin = 1000; // Prix minimum (à ajuster selon les besoins)
        let prixMax = 1000000; // Prix maximum (à ajuster selon les besoins)
        let prixOptimal = 0;
        let resultats = null;
        
        while (prixMax - prixMin > 100) { // Précision de 100€
            const prixTest = Math.floor((prixMin + prixMax) / 2);
            
            // Calculer tous les coûts pour ce prix
            const fraisNotaire = this.calculerFraisNotaireClassique(prixTest);
            const commission = prixTest * this.params.classique.commissionImmo / 100;
            const travaux = surface * this.params.communs.travauxM2;
            
            // Coût total du projet
            const coutTotal = prixTest + fraisNotaire + commission + travaux;
            
            // Montant à emprunter
            const montantPret = coutTotal - apport;
            
            // Vérifier si l'apport est suffisant ET si le montant d'emprunt ne dépasse pas le maximum
            if (montantPret <= 0 || montantPret > montantEmpruntMax) {
                if (montantPret <= 0) {
                    prixMin = prixTest; // Si l'apport couvre tout, on peut tester un prix plus élevé
                } else {
                    prixMax = prixTest; // Si l'emprunt est trop élevé, on doit réduire le prix
                }
                continue;
            }
            
            // Frais bancaires
            const fraisBancaires = this.calculerFraisBancaires(montantPret);
            
            // Mensualité
            const mensualite = this.calculerMensualite(montantPret + fraisBancaires, taux, duree);
            
            // Loyer net
            const loyerBrut = surface * loyerM2;
            const loyerNet = this.calculerLoyerNet(surface, loyerM2, vacanceLocative);
            
            // Taxe foncière
            const taxeFonciere = prixTest * this.params.communs.taxeFonciere / 100;
            
            // Charges non récupérables
            const chargesNonRecuperables = this.calculerChargesNonRecuperables(loyerBrut);
            
            // Entretien
            const entretienMensuel = this.calculerEntretienMensuel(prixTest);
            
            // Assurance PNO
            const assurancePNO = this.params.communs.assurancePNO;
            
            // Cash-flow
            const cashFlow = this.calculerCashFlow(
                loyerNet, mensualite, taxeFonciere, 
                chargesNonRecuperables, entretienMensuel, assurancePNO
            );
            
            // Calcul des intérêts pour la première année
            const tableauAmortissement = this.calculerTableauAmortissement(montantPret + fraisBancaires, taux, duree);
            const interetsPremierAnnee = tableauAmortissement.slice(0, 12).reduce((sum, m) => sum + m.interets, 0);
            
            // Revenu foncier avant impôt
            const chargesDeductibles = taxeFonciere + (assurancePNO) + (chargesNonRecuperables * 12) + (entretienMensuel * 12);
            const revenuFoncier = (loyerNet * 12) - chargesDeductibles - interetsPremierAnnee;
            
            // Impact fiscal
            const impactFiscal = this.calculerImpactFiscal(revenuFoncier, interetsPremierAnnee);
            
            // Rendement net
            const rendementNet = this.calculerRendementNet(
                loyerNet * 12, chargesDeductibles, impactFiscal, coutTotal + fraisBancaires
            );
            
            // Vérifier si les critères sont respectés
            let criteresRespectes = false;
            
            if (objectif === 'cashflow') {
                criteresRespectes = cashFlow >= cashFlowMin;
            } else {
                criteresRespectes = rendementNet >= rendementMin && cashFlow >= cashFlowMin;
            }
            
            if (criteresRespectes) {
                prixMin = prixTest;
                prixOptimal = prixTest;
                
                resultats = {
                    prixAchat: prixTest,
                    fraisNotaire: fraisNotaire,
                    commission: commission,
                    travaux: travaux,
                    fraisBancaires: fraisBancaires,
                    coutTotal: coutTotal + fraisBancaires,
                    montantPret: montantPret + fraisBancaires,
                    mensualite: mensualite,
                    loyerNet: loyerNet,
                    loyerBrut: loyerBrut,
                    taxeFonciere: taxeFonciere,
                    chargesNonRecuperables: chargesNonRecuperables * 12,
                    entretienAnnuel: entretienMensuel * 12,
                    assurancePNO: assurancePNO,
                    interetsAnnee1: interetsPremierAnnee,
                    revenuFoncier: revenuFoncier,
                    impactFiscal: impactFiscal,
                    cashFlow: cashFlow,
                    cashFlowAnnuel: cashFlow * 12,
                    rendementNet: rendementNet,
                    prixM2: prixTest / surface,
                    tableauAmortissement: tableauAmortissement
                };
            } else {
                prixMax = prixTest;
            }
        }
        
        // Stocker les résultats
        this.params.resultats.classique = resultats;
        
        return resultats;
    }

    /**
     * Calcule le prix maximum pour la vente aux enchères selon les critères
     * en respectant la contrainte du montant d'emprunt maximum
     * @returns {Object} - Résultats de la simulation pour la vente aux enchères
     */
    simulerVenteEncheres() {
        // Paramètres
        const apport = this.params.base.apport;
        const montantEmpruntMax = this.params.base.montantEmpruntMax;
        const surface = this.params.base.surface;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const objectif = this.params.base.objectif;
        const rendementMin = this.params.base.rendementMin;
        const cashFlowMin = this.params.base.cashFlowMin;
        const loyerM2 = this.params.communs.loyerM2;
        const vacanceLocative = this.params.communs.vacanceLocative;
        
        // Recherche dichotomique pour trouver le prix maximum
        let prixMin = 1000; // Prix minimum (à ajuster selon les besoins)
        let prixMax = 1000000; // Prix maximum (à ajuster selon les besoins)
        let prixOptimal = 0;
        let resultats = null;
        
        while (prixMax - prixMin > 100) { // Précision de 100€
            const prixTest = Math.floor((prixMin + prixMax) / 2);
            
            // Calculer tous les coûts pour ce prix
            const droitsEnregistrement = this.calculerDroitsEnregistrement(prixTest);
            const emolumentsPoursuivant = this.calculerEmolumentsPoursuivant(prixTest);
            const honorairesAvocat = this.calculerHonorairesAvocat(emolumentsPoursuivant);
            const publiciteFonciere = prixTest * this.params.encheres.publiciteFonciereEncheres / 100;
            const fraisDivers = this.params.encheres.fraisFixes + 
                               this.params.encheres.avocatEnchere + 
                               this.params.encheres.suiviDossier;
            
            // Caution (si non restituée)
            const caution = this.params.encheres.cautionRestituee ? 0 : 
                           prixTest * this.params.encheres.cautionPourcent / 100;
            
            // Travaux
            const travaux = surface * this.params.communs.travauxM2;
            
            // Coût total avant frais bancaires
            const coutTotal = prixTest + droitsEnregistrement + emolumentsPoursuivant + 
                             honorairesAvocat + publiciteFonciere + fraisDivers + caution + travaux;
            
            // Montant à emprunter
            const montantPret = coutTotal - apport;
            
            // Vérifier si l'apport est suffisant ET si le montant d'emprunt ne dépasse pas le maximum
            if (montantPret <= 0 || montantPret > montantEmpruntMax) {
                if (montantPret <= 0) {
                    prixMin = prixTest; // Si l'apport couvre tout, on peut tester un prix plus élevé
                } else {
                    prixMax = prixTest; // Si l'emprunt est trop élevé, on doit réduire le prix
                }
                continue;
            }
            
            // Frais bancaires
            const fraisBancaires = this.calculerFraisBancaires(montantPret);
            
            // Mensualité
            const mensualite = this.calculerMensualite(montantPret + fraisBancaires, taux, duree);
            
            // Loyer
            const loyerBrut = surface * loyerM2;
            const loyerNet = this.calculerLoyerNet(surface, loyerM2, vacanceLocative);
            
            // Taxe foncière
            const taxeFonciere = prixTest * this.params.communs.taxeFonciere / 100;
            
            // Charges non récupérables
            const chargesNonRecuperables = this.calculerChargesNonRecuperables(loyerBrut);
            
            // Entretien
            const entretienMensuel = this.calculerEntretienMensuel(prixTest);
            
            // Assurance PNO
            const assurancePNO = this.params.communs.assurancePNO;
            
            // Cash-flow
            const cashFlow = this.calculerCashFlow(
                loyerNet, mensualite, taxeFonciere,
                chargesNonRecuperables, entretienMensuel, assurancePNO
            );
            
            // Calcul des intérêts pour la première année
            const tableauAmortissement = this.calculerTableauAmortissement(montantPret + fraisBancaires, taux, duree);
            const interetsPremierAnnee = tableauAmortissement.slice(0, 12).reduce((sum, m) => sum + m.interets, 0);
            
            // Revenu foncier avant impôt
            const chargesDeductibles = taxeFonciere + (assurancePNO) + (chargesNonRecuperables * 12) + (entretienMensuel * 12);
            const revenuFoncier = (loyerNet * 12) - chargesDeductibles - interetsPremierAnnee;
            
            // Impact fiscal
            const impactFiscal = this.calculerImpactFiscal(revenuFoncier, interetsPremierAnnee);
            
            // Rendement net
            const rendementNet = this.calculerRendementNet(
                loyerNet * 12, chargesDeductibles, impactFiscal, coutTotal + fraisBancaires
            );
            
            // Vérifier si les critères sont respectés
            let criteresRespectes = false;
            
            if (objectif === 'cashflow') {
                criteresRespectes = cashFlow >= cashFlowMin;
            } else {
                criteresRespectes = rendementNet >= rendementMin && cashFlow >= cashFlowMin;
            }
            
            if (criteresRespectes) {
                prixMin = prixTest;
                prixOptimal = prixTest;
                
                resultats = {
                    prixAchat: prixTest,
                    droitsEnregistrement: droitsEnregistrement,
                    emolumentsPoursuivant: emolumentsPoursuivant,
                    honorairesAvocat: honorairesAvocat,
                    publiciteFonciere: publiciteFonciere,
                    fraisDivers: fraisDivers,
                    caution: caution,
                    travaux: travaux,
                    fraisBancaires: fraisBancaires,
                    coutTotal: coutTotal + fraisBancaires,
                    montantPret: montantPret + fraisBancaires,
                    mensualite: mensualite,
                    loyerNet: loyerNet,
                    loyerBrut: loyerBrut,
                    taxeFonciere: taxeFonciere,
                    chargesNonRecuperables: chargesNonRecuperables * 12,
                    entretienAnnuel: entretienMensuel * 12,
                    assurancePNO: assurancePNO,
                    interetsAnnee1: interetsPremierAnnee,
                    revenuFoncier: revenuFoncier,
                    impactFiscal: impactFiscal,
                    cashFlow: cashFlow,
                    cashFlowAnnuel: cashFlow * 12,
                    rendementNet: rendementNet,
                    prixM2: prixTest / surface,
                    tableauAmortissement: tableauAmortissement
                };
            } else {
                prixMax = prixTest;
            }
        }
        
        // Stocker les résultats
        this.params.resultats.encheres = resultats;
        
        return resultats;
    }

    /**
     * Exécute la simulation complète
     * @returns {Object} - Résultats de la simulation pour les deux modes d'achat
     */
    simuler() {
        const resultatsClassique = this.simulerAchatClassique();
        const resultatsEncheres = this.simulerVenteEncheres();
        
        return {
            classique: resultatsClassique,
            encheres: resultatsEncheres
        };
    }

    /**
     * Fournit les données pour les graphiques de comparaison
     * @returns {Object} - Données formatées pour Chart.js
     */
    getComparisonChartData() {
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return null;
        }

        const resultats = this.params.resultats;
        return {
            labels: ['Prix d\'achat', 'Coût total', 'Rentabilité (%)', 'Cash-flow mensuel'],
            datasets: [
                {
                    label: 'Achat Classique',
                    data: [
                        resultats.classique.prixAchat,
                        resultats.classique.coutTotal,
                        resultats.classique.rendementNet,
                        resultats.classique.cashFlow
                    ],
                    backgroundColor: 'rgba(0, 255, 135, 0.2)',
                    borderColor: 'rgba(0, 255, 135, 1)',
                    borderWidth: 2,
                    borderRadius: 5,
                },
                {
                    label: 'Vente aux Enchères',
                    data: [
                        resultats.encheres.prixAchat,
                        resultats.encheres.coutTotal,
                        resultats.encheres.rendementNet,
                        resultats.encheres.cashFlow
                    ],
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 2,
                    borderRadius: 5,
                }
            ]
        };
    }

    /**
     * Calcule les données d'amortissement sur la durée du prêt
     * @returns {Object} - Données formatées pour Chart.js
     */
    getAmortissementData() {
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return null;
        }

        const resultats = this.params.resultats;
        const duree = this.params.base.duree;
        const labels = Array.from({length: duree}, (_, i) => `Année ${i+1}`);
        
        // Calcul des cash-flows cumulés sur la durée du prêt
        const cashFlowsClassique = [];
        const cashFlowsEncheres = [];
        
        let cumulClassique = 0;
        let cumulEncheres = 0;
        
        for (let i = 0; i < duree; i++) {
            // Cash-flow annuel
            const annualClassique = resultats.classique.cashFlow * 12;
            const annualEncheres = resultats.encheres.cashFlow * 12;
            
            cumulClassique += annualClassique;
            cumulEncheres += annualEncheres;
            
            cashFlowsClassique.push(cumulClassique);
            cashFlowsEncheres.push(cumulEncheres);
        }
        
        return {
            labels: labels,
            datasets: [
                {
                    label: 'Cash-flow cumulé - Achat Classique',
                    data: cashFlowsClassique,
                    fill: true,
                    backgroundColor: 'rgba(0, 255, 135, 0.1)',
                    borderColor: 'rgba(0, 255, 135, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(0, 255, 135, 1)',
                },
                {
                    label: 'Cash-flow cumulé - Vente aux Enchères',
                    data: cashFlowsEncheres,
                    fill: true,
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(245, 158, 11, 1)',
                }
            ]
        };
    }

    /**
     * Calcule la répartition des coûts pour les graphiques en camembert
     * @returns {Object} - Données formatées pour Chart.js
     */
    getCoutsPieChartData() {
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return null;
        }
        
        const resultats = this.params.resultats;
        
        // Répartition des coûts pour l'achat classique
        const classique = {
            labels: ['Prix d\'achat', 'Frais de notaire', 'Commission', 'Travaux', 'Frais bancaires'],
            datasets: [{
                data: [
                    resultats.classique.prixAchat,
                    resultats.classique.fraisNotaire,
                    resultats.classique.commission,
                    resultats.classique.travaux,
                    resultats.classique.fraisBancaires
                ],
                backgroundColor: [
                    'rgba(0, 255, 135, 0.7)',
                    'rgba(0, 200, 100, 0.7)',
                    'rgba(0, 150, 80, 0.7)',
                    'rgba(0, 100, 60, 0.7)',
                    'rgba(0, 50, 40, 0.7)'
                ],
                borderWidth: 1
            }]
        };
        
        // Répartition des coûts pour la vente aux enchères
        const encheres = {
            labels: ['Prix d\'achat', 'Droits d\'enregistrement', 'Émoluments', 'Honoraires avocat', 'Travaux', 'Frais divers', 'Frais bancaires'],
            datasets: [{
                data: [
                    resultats.encheres.prixAchat,
                    resultats.encheres.droitsEnregistrement,
                    resultats.encheres.emolumentsPoursuivant,
                    resultats.encheres.honorairesAvocat,
                    resultats.encheres.travaux,
                    resultats.encheres.fraisDivers,
                    resultats.encheres.fraisBancaires
                ],
                backgroundColor: [
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(220, 140, 10, 0.7)',
                    'rgba(200, 120, 10, 0.7)',
                    'rgba(180, 100, 10, 0.7)',
                    'rgba(160, 80, 10, 0.7)',
                    'rgba(140, 60, 10, 0.7)',
                    'rgba(120, 40, 10, 0.7)'
                ],
                borderWidth: 1
            }]
        };
        
        return {
            classique: classique,
            encheres: encheres
        };
    }
    
    /**
     * Calcule les données pour le graphique d'évolution de la valeur du bien
     * @param {number} tauxAppreciation - Taux d'appréciation annuel en %
     * @returns {Object} - Données formatées pour Chart.js
     */
    getEvolutionValeurData(tauxAppreciation = 2) {
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return null;
        }
        
        const resultats = this.params.resultats;
        const duree = this.params.base.duree;
        const labels = Array.from({length: duree + 1}, (_, i) => i === 0 ? 'Achat' : `Année ${i}`);
        
        // Évolution de la valeur du bien
        const valeursClassique = [resultats.classique.prixAchat];
        const valeursEncheres = [resultats.encheres.prixAchat];
        
        // Évolution de la valeur patrimoniale (valeur du bien - capital restant dû)
        const patrimoineClassique = [resultats.classique.prixAchat - resultats.classique.montantPret];
        const patrimoineEncheres = [resultats.encheres.prixAchat - resultats.encheres.montantPret];
        
        let valeurClassique = resultats.classique.prixAchat;
        let valeurEncheres = resultats.encheres.prixAchat;
        
        for (let i = 1; i <= duree; i++) {
            // Appréciation de la valeur du bien
            valeurClassique *= (1 + tauxAppreciation / 100);
            valeurEncheres *= (1 + tauxAppreciation / 100);
            
            valeursClassique.push(valeurClassique);
            valeursEncheres.push(valeurEncheres);
            
            // Capital restant dû à l'année i
            const capitalRestantClassique = i * 12 < resultats.classique.tableauAmortissement.length 
                ? resultats.classique.tableauAmortissement[i * 12 - 1].capitalRestant 
                : 0;
                
            const capitalRestantEncheres = i * 12 < resultats.encheres.tableauAmortissement.length 
                ? resultats.encheres.tableauAmortissement[i * 12 - 1].capitalRestant 
                : 0;
            
            // Calcul de la valeur patrimoniale
            patrimoineClassique.push(valeurClassique - capitalRestantClassique);
            patrimoineEncheres.push(valeurEncheres - capitalRestantEncheres);
        }
        
        return {
            labels: labels,
            datasets: [
                {
                    label: 'Valeur du bien - Achat Classique',
                    data: valeursClassique,
                    borderColor: 'rgba(0, 255, 135, 1)',
                    backgroundColor: 'rgba(0, 255, 135, 0.05)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 2,
                },
                {
                    label: 'Valeur du bien - Vente aux Enchères',
                    data: valeursEncheres,
                    borderColor: 'rgba(245, 158, 11, 1)',
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 2,
                },
                {
                    label: 'Patrimoine net - Achat Classique',
                    data: patrimoineClassique,
                    borderColor: 'rgba(0, 200, 100, 1)',
                    backgroundColor: 'rgba(0, 200, 100, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 2,
                },
                {
                    label: 'Patrimoine net - Vente aux Enchères',
                    data: patrimoineEncheres,
                    borderColor: 'rgba(220, 140, 10, 1)',
                    backgroundColor: 'rgba(220, 140, 10, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 2,
                }
            ]
        };
    }

    /**
     * Calcule la surface et l'emprunt optimaux selon l'apport et le rendement
     * @returns {Object} - Surface et montant d'emprunt optimaux
     */
    calculerParametresOptimaux() {
        const apport = this.params.base.apport;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const rendementMin = this.params.base.rendementMin;
        const loyerM2 = this.params.communs.loyerM2;
        const travauxM2 = this.params.communs.travauxM2;
        const vacance = this.params.communs.vacanceLocative / 100;
        
        // Calcul orienté rendement
        const loyerAnnuelM2 = loyerM2 * 12;
        const loyerNetAnnuelM2 = loyerAnnuelM2 * (1 - vacance);
        
        // Prix maximum au m² pour atteindre le rendement souhaité
        const fraisAcquisition = 0.08; // 8% frais de notaire, etc.
        const prixM2Max = loyerNetAnnuelM2 / (rendementMin / 100);
        const coutTotalM2 = prixM2Max * (1 + fraisAcquisition) + travauxM2;
        
        // Calcul de l'emprunt maximum
        const tauxMensuel = taux / 100 / 12;
        const nombreMensualites = duree * 12;
        const mensualiteParM2 = loyerM2 * 0.7; // 70% du loyer en mensualité max
        const capaciteEmpruntM2 = mensualiteParM2 * ((1 - Math.pow(1 + tauxMensuel, -nombreMensualites)) / tauxMensuel);
        
        // Surface maximale possible
        const surfaceMaxEmprunt = Math.floor(this.params.base.montantEmpruntMax / capaciteEmpruntM2);
        const surfaceMaxApport = Math.floor(apport / (coutTotalM2 - capaciteEmpruntM2));
        const surfaceOptimale = Math.min(surfaceMaxEmprunt, surfaceMaxApport);
        
        // Montant d'emprunt correspondant
        const montantEmpruntOptimal = surfaceOptimale * capaciteEmpruntM2;
        
        return {
            surface: surfaceOptimale > 0 ? surfaceOptimale : 30, // valeur minimum par défaut
            montantEmprunt: montantEmpruntOptimal
        };
    }
}

// Export pour la compatibilité avec différents environnements
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = SimulateurImmo;
} else {
    window.SimulateurImmo = SimulateurImmo;
}