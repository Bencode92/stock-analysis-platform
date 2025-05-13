/**
 * immo-simulation.js - Logique de calcul pour le simulateur immobilier
 * 
 * Ce script contient toutes les fonctions de calcul nécessaires pour la simulation
 * d'investissement immobilier, comparant l'achat classique et la vente aux enchères.
 */

class SimulateurImmo {
    constructor() {
        // Paramètres initialisés par défaut
        this.params = {
            base: {
                apport: 20000,
                surface: 50,
                taux: 3.5,
                duree: 20,
                objectif: 'cashflow',
                rendementMin: 5
            },
            communs: {
                fraisBancairesDossier: 2000,
                fraisBancairesCompte: 710,
                fraisGarantie: 1.3709, // % du capital emprunté
                taxeFonciere: 1, // % du prix
                vacanceLocative: 8, // % des loyers
                loyerM2: 12, // €/m²/mois
                travauxM2: 400 // €/m²
            },
            classique: {
                publiciteFonciere: 0.72, // % du prix
                droitsMutation: 5.81, // % du prix
                securiteImmobiliere: 0.10, // % du prix
                emolumentsVente: 1.12, // % du prix
                formalites: 0.28, // % du prix
                debours: 0.13, // % du prix
                commissionImmo: 5 // % du prix
            },
            encheres: {
                droitsEnregistrement: 5.70, // % du prix
                coefMutation: 2.37, // Coefficient
                emolumentsPoursuivant1: 7, // % (0-6500€)
                emolumentsPoursuivant2: 3, // % (6500-23500€)
                emolumentsPoursuivant3: 2, // % (23500-83500€)
                emolumentsPoursuivant4: 1, // % (au-delà de 83500€)
                honorairesAvocatCoef: 0.25, // x émoluments
                honorairesAvocatTVA: 20, // %
                publiciteFonciereEncheres: 0.10, // % du prix
                fraisFixes: 50, // €
                avocatEnchere: 300, // €
                suiviDossier: 1200, // €
                cautionPourcent: 5, // % du prix de mise à prix
                cautionRestituee: true
            },
            // Pour stocker les résultats
            resultats: {
                classique: {},
                encheres: {}
            }
        };
    }

    /**
     * Charge les paramètres depuis le formulaire
     * @param {Object} formData - Données du formulaire
     */
    chargerParametres(formData) {
        // Paramètres de base
        this.params.base.apport = parseFloat(formData.apport) || 20000;
        this.params.base.surface = parseFloat(formData.surface) || 50;
        this.params.base.taux = parseFloat(formData.taux) || 3.5;
        this.params.base.duree = parseFloat(formData.duree) || 20;
        this.params.base.objectif = formData.objectif || 'cashflow';
        this.params.base.rendementMin = parseFloat(formData.rendementMin) || 5;

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
     * Calcule le cash-flow mensuel
     * @param {number} loyerNet - Loyer mensuel net
     * @param {number} mensualite - Mensualité du prêt
     * @param {number} taxeFonciere - Montant annuel de la taxe foncière
     * @returns {number} - Cash-flow mensuel
     */
    calculerCashFlow(loyerNet, mensualite, taxeFonciere) {
        return loyerNet - mensualite - (taxeFonciere / 12);
    }

    /**
     * Calcule le rendement net
     * @param {number} loyerAnnuelNet - Loyer annuel net
     * @param {number} prixTotal - Prix total de l'investissement
     * @returns {number} - Rendement net en %
     */
    calculerRendementNet(loyerAnnuelNet, prixTotal) {
        return (loyerAnnuelNet / prixTotal) * 100;
    }

    /**
     * Calcule le prix maximum pour l'achat classique selon les critères
     * @returns {Object} - Résultats de la simulation pour l'achat classique
     */
    simulerAchatClassique() {
        // Paramètres
        const apport = this.params.base.apport;
        const surface = this.params.base.surface;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const objectif = this.params.base.objectif;
        const rendementMin = this.params.base.rendementMin;
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
            
            // Vérifier si l'apport est suffisant
            if (montantPret <= 0) {
                prixMin = prixTest;
                continue;
            }
            
            // Frais bancaires
            const fraisBancaires = this.calculerFraisBancaires(montantPret);
            
            // Mensualité
            const mensualite = this.calculerMensualite(montantPret + fraisBancaires, taux, duree);
            
            // Loyer net
            const loyerNet = this.calculerLoyerNet(surface, loyerM2, vacanceLocative);
            
            // Taxe foncière
            const taxeFonciere = prixTest * this.params.communs.taxeFonciere / 100;
            
            // Cash-flow
            const cashFlow = this.calculerCashFlow(loyerNet, mensualite, taxeFonciere);
            
            // Rendement net
            const loyerAnnuelNet = loyerNet * 12 - taxeFonciere;
            const rendementNet = this.calculerRendementNet(loyerAnnuelNet, coutTotal);
            
            // Vérifier si les critères sont respectés
            let criteresRespectes = false;
            
            if (objectif === 'cashflow') {
                criteresRespectes = cashFlow >= 0;
            } else {
                criteresRespectes = rendementNet >= rendementMin;
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
                    loyerBrut: surface * loyerM2,
                    taxeFonciere: taxeFonciere,
                    cashFlow: cashFlow,
                    rendementNet: rendementNet
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
     * @returns {Object} - Résultats de la simulation pour la vente aux enchères
     */
    simulerVenteEncheres() {
        // Paramètres
        const apport = this.params.base.apport;
        const surface = this.params.base.surface;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const objectif = this.params.base.objectif;
        const rendementMin = this.params.base.rendementMin;
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
            
            // Vérifier si l'apport est suffisant
            if (montantPret <= 0) {
                prixMin = prixTest;
                continue;
            }
            
            // Frais bancaires
            const fraisBancaires = this.calculerFraisBancaires(montantPret);
            
            // Mensualité
            const mensualite = this.calculerMensualite(montantPret + fraisBancaires, taux, duree);
            
            // Loyer net
            const loyerNet = this.calculerLoyerNet(surface, loyerM2, vacanceLocative);
            
            // Taxe foncière
            const taxeFonciere = prixTest * this.params.communs.taxeFonciere / 100;
            
            // Cash-flow
            const cashFlow = this.calculerCashFlow(loyerNet, mensualite, taxeFonciere);
            
            // Rendement net
            const loyerAnnuelNet = loyerNet * 12 - taxeFonciere;
            const rendementNet = this.calculerRendementNet(loyerAnnuelNet, coutTotal + fraisBancaires);
            
            // Vérifier si les critères sont respectés
            let criteresRespectes = false;
            
            if (objectif === 'cashflow') {
                criteresRespectes = cashFlow >= 0;
            } else {
                criteresRespectes = rendementNet >= rendementMin;
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
                    loyerBrut: surface * loyerM2,
                    taxeFonciere: taxeFonciere,
                    cashFlow: cashFlow,
                    rendementNet: rendementNet
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
}

// Export pour la compatibilité avec différents environnements
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = SimulateurImmo;
} else {
    window.SimulateurImmo = SimulateurImmo;
}