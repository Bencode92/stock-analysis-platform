/**
 * immo-simulation.js - Logique de calcul pour le simulateur immobilier
 * 
 * Ce script contient toutes les fonctions de calcul nécessaires pour la simulation
 * d'investissement immobilier, comparant l'achat classique et la vente aux enchères.
 * 
 * Version 4.0 - Refactorisée pour calculer le prix maximum finançable
 * Version 4.1 - Optimisation par recherche dichotomique
 * Version 4.2 - Optimisation de la recherche en commençant par le maximum théorique
 * Version 4.3 - Nouvelle méthode de recherche par surface décroissante
 * Version 4.4 - Optimisation des performances et amélioration de l'architecture
 * Version 4.5 - Corrections des coquilles et optimisations mineures
 * Version 4.6 - Correction du ratio d'apport appliqué au coût total du projet
 * Version 4.7 - Correction de l'orthographe: "emolements" -> "emoluments"
 * Version 4.8 - Ajout du support pour le mode "Cash-flow positif"
 * Version 4.9 - Ajout de chercheSurfaceObjectifCashflow pour le mode objectif
 * Version 5.0 - Refactorisation majeure: epsilon, contraintes unifiées, algos automatiques
 * Version 5.1 - Corrections fiscales, assurance emprunteur, TF paramétrable, robustesse
 * Version 5.2 - Clarification des marges: ajout margeHorsAssurance et margeAvecAssurance
 */

class SimulateurImmo {
    constructor() {
        // Constantes par défaut
        this.defaults = {
            surfaceMax: 120,              // Surface maximale par défaut (m²)
            surfaceMin: 20,               // Surface minimale par défaut (m²)
            pasSurface: 1,                // Pas de décrémentation pour la recherche
            chargesNonRecuperablesAnnuelles: 30, // €/m²/an
            pourcentageTravauxDefaut: 0.005,      // 0.5% du prix d'achat
            epsSeuil: 1,                  // Tolérance en € pour les comparaisons (évite les oscillations)
            tauxAssuranceEmprunteur: 0.20, // Taux d'assurance emprunteur par défaut (0.20% du capital)
            taxeFonciereDefaut: 0.05      // 5% du loyer annuel brut par défaut
        };
        
        // Paramètres initialisés par défaut
        this.params = {
            base: {
                apport: 20000,                // Apport disponible
                surface: 50,                  // Surface en m²
                taux: 3.5,                    // Taux d'emprunt
                duree: 20,                    // Durée du prêt
                surfaceMax: 120,              // Surface maximale autorisée
                surfaceMin: 20,               // Surface minimale autorisée (ajouté)
                pourcentApportMin: 10,        // Pourcentage d'apport minimum exigé (ajouté)
                apportCouvreFrais: false,     // Nouveau: l'apport doit-il couvrir au moins les frais
                calculationMode: 'loyer-mensualite', // Mode de calcul: 'loyer-mensualite' ou 'cashflow-positif'
                incluFraisBancairesDansRatio: false  // Nouveau: inclure frais bancaires dans le ratio d'apport
            },
            communs: {
                fraisBancairesDossier: 900,
                fraisBancairesCompte: 150,
                fraisGarantie: 1.3709,        // % du capital emprunté
                tauxAssuranceEmprunteur: 0.20, // % du capital emprunté (nouveau)
                taxeFonciere: 0,              // Montant annuel en € (0 = utiliser 5% du loyer)
                vacanceLocative: 5,           // % des loyers (modifié de 0% à 5% pour plus de réalisme)
                loyerM2: 12,                  // €/m²/mois (valeur utilisée si calcul par rendement impossible)
                travauxM2: 400,               // €/m² (remplacé par 0.5% du prix par défaut)
                useFixedTravauxPercentage: true, // Utiliser 0.5% du prix d'achat par défaut
                entretienAnnuel: 0.5,         // % du prix d'achat
                assurancePNO: 250,            // € par an
                chargesNonRecuperables: 30,   // €/m²/an (maintenant utilisé correctement)
                prixM2: 2000                  // Prix du marché immobilier en €/m²
            },
            classique: {
                publiciteFonciere: 0.72,      // % du prix
                droitsMutation: 5.81,         // % du prix
                securiteImmobiliere: 0.10,    // % du prix
                emolumentsVente: 1.12,        // % du prix
                formalites: 0.28,             // % du prix
                debours: 0.13,                // % du prix
                commissionImmo: 4             // % du prix
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
                deficitFoncier: true,
                plafondDeficitFoncier: 10700  // € par an (hors intérêts)
            },
            // Pour stocker les résultats
            resultats: {
                classique: {},
                encheres: {}
            }
        };
        
        // Historique des simulations pour comparaisons
        this.historiqueSimulations = [];
        
        // Mode debug (pour afficher les logs)
        this.debug = false;
    }

    /**
     * Valide les paramètres essentiels avant simulation
     * @returns {Object} - Objet avec statut et message d'erreur si applicable
     */
    validerParametres() {
        const { apport, taux, duree } = this.params.base;
        const { prixM2, loyerM2, vacanceLocative } = this.params.communs;
        
        if (!apport || apport <= 0) {
            return { 
                valide: false, 
                message: "L'apport doit être supérieur à 0" 
            };
        }
        
        if (!taux || taux < 0) {
            return { 
                valide: false, 
                message: "Le taux d'emprunt doit être positif ou nul" 
            };
        }
        
        if (!duree || duree <= 0) {
            return { 
                valide: false, 
                message: "La durée du prêt doit être supérieure à 0" 
            };
        }
        
        if (!prixM2 || prixM2 <= 0) {
            return { 
                valide: false, 
                message: "Le prix au m² doit être renseigné et supérieur à 0" 
            };
        }
        
        if (!loyerM2 || loyerM2 <= 0) {
            return { 
                valide: false, 
                message: "Le loyer au m² doit être renseigné et supérieur à 0" 
            };
        }
        
        // Borner la vacance locative entre 0 et 100%
        if (vacanceLocative < 0 || vacanceLocative > 100) {
            return { 
                valide: false, 
                message: "La vacance locative doit être entre 0% et 100%" 
            };
        }
        
        return { valide: true };
    }

    /**
     * Vérifie si une surface respecte les contraintes de financement
     * @param {number} surface - Surface en m²
     * @param {string} mode - Mode d'achat ('classique' ou 'encheres')
     * @returns {boolean} - True si toutes les contraintes sont respectées
     */
    surfaceRespecteContraintesFinancement(surface, mode) {
        const { apport, pourcentApportMin, apportCouvreFrais, incluFraisBancairesDansRatio } = this.params.base;
        const prixM2 = this.params.communs.prixM2;

        const prixAchat = surface * prixM2;

        // Frais spécifiques selon le mode
        let fraisSpecifiques = 0;
        if (mode === 'classique') {
            const fraisNotaire = this.calculerFraisNotaireClassique(prixAchat);
            const commission = prixAchat * this.params.classique.commissionImmo / 100;
            fraisSpecifiques = fraisNotaire + commission;
        } else {
            const droitsEnregistrement = this.calculerDroitsEnregistrement(prixAchat);
            const emolumentsPoursuivant = this.calculerEmolumentsPoursuivant(prixAchat);
            const honorairesAvocat = this.calculerHonorairesAvocat(emolumentsPoursuivant);
            const publiciteFonciere = prixAchat * this.params.encheres.publiciteFonciereEncheres / 100;
            const fraisDivers = this.params.encheres.fraisFixes + this.params.encheres.avocatEnchere + this.params.encheres.suiviDossier;
            const caution = this.params.encheres.cautionRestituee ? 0 : prixAchat * this.params.encheres.cautionPourcent / 100;
            fraisSpecifiques = droitsEnregistrement + emolumentsPoursuivant + honorairesAvocat + publiciteFonciere + fraisDivers + caution;
        }

        // Travaux
        const travauxCoeff = this.params.communs.useFixedTravauxPercentage
            ? this.defaults.pourcentageTravauxDefaut
            : (prixM2 > 0 ? (this.params.communs.travauxM2 / prixM2) : this.defaults.pourcentageTravauxDefaut);
        const travaux = prixAchat * travauxCoeff;

        let coutReference = prixAchat + fraisSpecifiques + travaux;
        
        // Optionnellement inclure les frais bancaires dans le ratio
        if (incluFraisBancairesDansRatio) {
            const fraisDossier = this.params.communs.fraisBancairesDossier;
            const fraisCompte = this.params.communs.fraisBancairesCompte;
            const tauxGarantie = this.params.communs.fraisGarantie / 100;
            // Estimation des frais bancaires
            const empruntEstime = Math.max(0, coutReference - apport);
            const fraisBancairesEstimes = fraisDossier + fraisCompte + empruntEstime * tauxGarantie;
            coutReference += fraisBancairesEstimes;
        }

        const ratio = (pourcentApportMin ?? 10) / 100;

        // apport / coutReference >= ratio  <=>  coutReference <= apport/ratio
        if (coutReference > (apport / ratio)) return false;

        if (apportCouvreFrais) {
            const fraisTotaux = fraisSpecifiques + travaux;
            if (apport < fraisTotaux) return false;
        }

        return true;
    }

    /**
     * @deprecated depuis v4.4; sera supprimé en v5. Utiliser chercheSurfaceDesc() à la place.
     * Cherche le prix maximum finançable (méthode linéaire)
     * @param {string} mode - Mode d'achat ("classique" ou "encheres")
     * @param {number} step - Pas d'incrémentation du prix
     * @param {number} maxPrice - Prix maximum à tester
     * @returns {Object} - Résultats de la simulation
     */
    cherchePrixMaxStep(mode, step = 1000, maxPrice = 3000000) {
        this.debug && console.warn("Méthode obsolète: utiliser chercheSurfaceDesc() à la place.");
        return this.chercheSurfaceDesc(mode, this.params.base.pasSurface || this.defaults.pasSurface);
    }
    
    /**
     * @deprecated depuis v4.4; sera supprimé en v5. Utiliser chercheSurfaceDesc() à la place.
     * Recherche dichotomique du prix maximum finançable
     * @param {string} mode   "classique" | "encheres"
     * @param {number} Pmin   borne basse (>= 0)
     * @param {number} Pmax   borne haute (ex: 3 000 000 €)
     * @param {number} eps    précision souhaitée (ex: 100 €)
     * @returns {Object|null} résultats complets pour le prix max trouvé
     */
    cherchePrixMaxDicho(mode, Pmin = 0, Pmax = null, eps = 100) {
        this.debug && console.warn("Méthode obsolète: utiliser chercheSurfaceDesc() à la place.");
        return this.chercheSurfaceDesc(mode, this.params.base.pasSurface || this.defaults.pasSurface);
    }

    /**
     * @deprecated depuis v4.4; sera supprimé en v5. Utiliser chercheSurfaceDesc() à la place.
     * Recherche le prix maximum finançable en commençant par la borne haute de l'apport
     * @param {string} mode   "classique" | "encheres"
     * @returns {Object|null} résultats complets pour le prix max trouvé
     */
    cherchePrixMaxApport(mode) {
        this.debug && console.warn("Méthode obsolète: utiliser chercheSurfaceDesc() à la place.");
        return this.chercheSurfaceDesc(mode, this.params.base.pasSurface || this.defaults.pasSurface);
    }

    /**
     * Calcule les intérêts pour la première année sans générer le tableau complet
     * @param {number} montantPret - Montant du prêt
     * @param {number} taux - Taux d'intérêt annuel en %
     * @param {number} dureeAnnees - Durée du prêt en années
     * @returns {number} - Total des intérêts de la première année
     */
    calculerInteretsPremiereAnnee(montantPret, taux, dureeAnnees) {
        const tauxMensuel = taux / 100 / 12;
        const mensualite = this.calculerMensualite(montantPret, taux, dureeAnnees);
        
        let capitalRestant = montantPret;
        let interetsTotal = 0;
        
        for (let i = 1; i <= 12; i++) {
            const interets = capitalRestant * tauxMensuel;
            interetsTotal += interets;
            const amortissementCapital = mensualite - interets;
            capitalRestant -= amortissementCapital;
        }
        
        return interetsTotal;
    }

    /**
     * Vérifie la viabilité d'une surface sans générer le tableau d'amortissement complet
     * @param {number} surface - Surface en m²
     * @param {string} mode - Mode d'achat
     * @returns {boolean} - True si la marge est positive
     */
    calculerViabilite(surface, mode) {
        // Code similaire à calculeTout mais sans générer le tableau d'amortissement complet
        const apport = this.params.base.apport;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const vacanceLocative = Math.max(0, Math.min(100, this.params.communs.vacanceLocative));
        
        const prixM2 = parseFloat(this.params.communs.prixM2);
        const prixAchat = surface * prixM2;
        
        // Travaux avec protection division par zéro
        let travauxCoefficient;
        if (this.params.communs.useFixedTravauxPercentage) {
            travauxCoefficient = this.defaults.pourcentageTravauxDefaut;
        } else {
            travauxCoefficient = prixM2 > 0 ? (this.params.communs.travauxM2 / prixM2) : this.defaults.pourcentageTravauxDefaut;
        }
        const travaux = prixAchat * travauxCoefficient;
        
        // Frais spécifiques selon le mode (code simplifié)
        let fraisSpecifiques = 0;
        
        if (mode === 'classique') {
            const fraisNotaire = this.calculerFraisNotaireClassique(prixAchat);
            const commission = prixAchat * this.params.classique.commissionImmo / 100;
            fraisSpecifiques = fraisNotaire + commission;
        } else {
            const droitsEnregistrement = this.calculerDroitsEnregistrement(prixAchat);
            const emolumentsPoursuivant = this.calculerEmolumentsPoursuivant(prixAchat);
            const honorairesAvocat = this.calculerHonorairesAvocat(emolumentsPoursuivant);
            const publiciteFonciere = prixAchat * this.params.encheres.publiciteFonciereEncheres / 100;
            const fraisDivers = this.params.encheres.fraisFixes + 
                            this.params.encheres.avocatEnchere + 
                            this.params.encheres.suiviDossier;
            const caution = this.params.encheres.cautionRestituee ? 0 : 
                        prixAchat * this.params.encheres.cautionPourcent / 100;
            
            fraisSpecifiques = droitsEnregistrement + emolumentsPoursuivant + 
                            honorairesAvocat + publiciteFonciere + fraisDivers + caution;
        }
        
        // Coût hors frais bancaires
        const coutHorsFraisB = prixAchat + fraisSpecifiques + travaux;
        
        // Calcul de l'emprunt
        const fraisDossier = this.params.communs.fraisBancairesDossier;
        const fraisCompte = this.params.communs.fraisBancairesCompte;
        const tauxGarantie = this.params.communs.fraisGarantie / 100;
        
        // Protection contre division par zéro et emprunt négatif
        let emprunt = 0;
        if (Math.abs(1 - tauxGarantie) > 0.0001) {
            emprunt = Math.max(0, (coutHorsFraisB - apport + fraisDossier + fraisCompte) / (1 - tauxGarantie));
        }
        
        // Mensualité du prêt
        const mensualite = this.calculerMensualite(emprunt, taux, duree);
        
        // Assurance emprunteur
        const tauxAssurance = (this.params.communs.tauxAssuranceEmprunteur ?? this.defaults.tauxAssuranceEmprunteur) / 100;
        const mensualiteAssurance = emprunt * tauxAssurance / 12;
        const mensualiteTotale = mensualite + mensualiteAssurance;
        
        // Loyer
        const loyerBrut = surface * this.params.communs.loyerM2;
        const loyerNet = this.calculerLoyerNet(loyerBrut, vacanceLocative);
        
        // Récupérer le mode de calcul sélectionné
        const calculationMode = this.params.base.calculationMode || 'loyer-mensualite';
        
        if (calculationMode === 'loyer-mensualite') {
            // Mode "Loyer ≥ Mensualité" avec tolérance epsilon
            // Utilise la mensualité totale (avec assurance) pour la cohérence
            return (loyerNet - mensualiteTotale) >= -this.defaults.epsSeuil;
        } else {
            // Mode "Cash-flow positif" avec tolérance epsilon
            // Taxe foncière paramétrable
            const taxeFonciere = this.calculerTaxeFonciereAnnuelle(loyerBrut * 12) / 12; // Mensuel
            
            // Charges non récupérables (utiliser le paramètre)
            const chargesNonRecuperables = surface * 
                (this.params.communs.chargesNonRecuperables ?? this.defaults.chargesNonRecuperablesAnnuelles) / 12;
            
            const entretienMensuel = prixAchat * (this.params.communs.entretienAnnuel / 100) / 12;
            const assurancePNO = this.params.communs.assurancePNO / 12;
            
            // Calcul du cash-flow complet
            const cashFlow = loyerNet - mensualiteTotale - taxeFonciere - chargesNonRecuperables - entretienMensuel - assurancePNO;
            return cashFlow >= -this.defaults.epsSeuil;
        }
    }

    /**
     * Recherche de la surface maximale autofinancée
     * - démarre du plafond surfaceMax (120 m² par défaut)
     * - descend jusqu'à surfaceMin (20 m²) par pas
     * - stoppe dès que loyer net ≥ mensualité
     * @param {"classique"|"encheres"} mode
     * @param {number} pas - pas de décrémentation (par défaut 1 m²)
     * @returns {Object|null}  résultats complets ou null si rien de viable
     */
    chercheSurfaceDesc(mode, pas = null) {
        pas = pas || this.defaults.pasSurface;
        const surfaceMax = this.params.base.surfaceMax || this.defaults.surfaceMax;
        const surfaceMin = this.params.base.surfaceMin || this.defaults.surfaceMin;

        for (let S = surfaceMax; S >= surfaceMin; S -= pas) {
            // Vérifier d'abord les contraintes de financement
            if (!this.surfaceRespecteContraintesFinancement(S, mode)) continue;

            // Ensuite vérifier la viabilité (marge ou cash-flow)
            if (this.calculerViabilite(S, mode)) {
                // Une fois qu'on a trouvé une surface viable, on fait le calcul complet
                return this.calculeTout(S, mode);
            }
        }
        return null; // aucune solution autofinancée dans l'intervalle
    }

    /**
     * Recherche la plus petite surface donnant au moins targetCF
     * de cash-flow (cash-flow complet, pas seulement marge loyer-mensualité).
     *
     * @param {"classique"|"encheres"} mode
     * @param {number} targetCF cash-flow mensuel cible (≥ 0)
     * @param {number} eps précision m2 (défaut : 0.5 m2)
     * @returns {Object|null} résultats complets ou null si impossible
     */
    chercheSurfaceObjectifCashflow(mode, targetCF, eps = 0.5) {
        const Smin = this.params.base.surfaceMin ?? this.defaults.surfaceMin;
        let Smax = this.params.base.surfaceMax ?? this.defaults.surfaceMax;
        
        // Si Smax ne respecte pas les contraintes, on le réduit jusqu'à ce que ce soit finançable
        while (Smax >= Smin && !this.surfaceRespecteContraintesFinancement(Smax, mode)) {
            Smax -= eps;
        }
        if (Smax < Smin) return null;
        
        // Vérif de faisabilité cash-flow à Smax
        const resMax = this.calculeTout(Smax, mode);
        if (resMax.cashFlow < targetCF - this.defaults.epsSeuil) return null;
        
        let lo = Smin, hi = Smax, best = null;
        const respecte = (S) => {
            if (!this.surfaceRespecteContraintesFinancement(S, mode)) return false;
            const r = this.calculeTout(S, mode);
            return r.cashFlow >= (targetCF - this.defaults.epsSeuil);
        };
        
        while (hi - lo > eps) {
            const mid = (lo + hi) / 2;
            if (respecte(mid)) {
                best = this.calculeTout(mid, mode);
                hi = mid; // plus petit S suffisant
            } else {
                lo = mid;
            }
        }
        return best ?? this.calculeTout(hi, mode);
    }

    /**
     * Calcule tous les paramètres à partir d'un prix d'achat
     * @param {number} prixAchat - Prix d'achat du bien
     * @param {string} mode - Mode d'achat ("classique" ou "encheres")
     * @returns {Object} - Résultats de la simulation
     */
    calculeToutDepuisPrix(prixAchat, mode) {
        const surface = prixAchat / this.params.communs.prixM2;
        return this.calculeTout(surface, mode);   // réutilise le calcul existant
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
        
        // Ajouter le mode de calcul aux paramètres
        if (formData.calculationMode !== undefined)
            this.params.base.calculationMode = formData.calculationMode || 'loyer-mensualite';
        
        // Ajouter le chargement du pourcentage d'apport minimum
        if (formData.pourcentApportMin !== undefined)
            this.params.base.pourcentApportMin = parseFloat(formData.pourcentApportMin) || 10;
        
        // Chargement du nouveau paramètre apportCouvreFrais
        if (formData.apportCouvreFrais !== undefined)
            this.params.base.apportCouvreFrais = formData.apportCouvreFrais;
        
        // Nouveau: inclure frais bancaires dans ratio
        if (formData.incluFraisBancairesDansRatio !== undefined)
            this.params.base.incluFraisBancairesDansRatio = formData.incluFraisBancairesDansRatio;
        
        // Paramètres de surface min/max et pas
        if (formData.surfaceMax !== undefined)
            this.params.base.surfaceMax = parseFloat(formData.surfaceMax) || this.defaults.surfaceMax;
        if (formData.surfaceMin !== undefined)
            this.params.base.surfaceMin = parseFloat(formData.surfaceMin) || this.defaults.surfaceMin;
        if (formData.pasSurface !== undefined)
            this.params.base.pasSurface = parseFloat(formData.pasSurface) || this.defaults.pasSurface;
        
        // Paramètres communs
        if (formData.fraisBancairesDossier !== undefined) 
            this.params.communs.fraisBancairesDossier = parseFloat(formData.fraisBancairesDossier);
        if (formData.fraisBancairesCompte !== undefined) 
            this.params.communs.fraisBancairesCompte = parseFloat(formData.fraisBancairesCompte);
        if (formData.fraisGarantie !== undefined) 
            this.params.communs.fraisGarantie = parseFloat(formData.fraisGarantie);
        if (formData.tauxAssuranceEmprunteur !== undefined) 
            this.params.communs.tauxAssuranceEmprunteur = parseFloat(formData.tauxAssuranceEmprunteur);
        if (formData.taxeFonciere !== undefined) 
            this.params.communs.taxeFonciere = parseFloat(formData.taxeFonciere);
        if (formData.vacanceLocative !== undefined) 
            this.params.communs.vacanceLocative = parseFloat(formData.vacanceLocative);
        if (formData.loyerM2 !== undefined) 
            this.params.communs.loyerM2 = parseFloat(formData.loyerM2);
        if (formData.travauxM2 !== undefined) 
            this.params.communs.travauxM2 = parseFloat(formData.travauxM2);
        if (formData.useFixedTravauxPercentage !== undefined)
            this.params.communs.useFixedTravauxPercentage = formData.useFixedTravauxPercentage;
        if (formData.entretienAnnuel !== undefined)
            this.params.communs.entretienAnnuel = parseFloat(formData.entretienAnnuel);
        if (formData.assurancePNO !== undefined)
            this.params.communs.assurancePNO = parseFloat(formData.assurancePNO);
        if (formData.chargesNonRecuperables !== undefined)
            this.params.communs.chargesNonRecuperables = parseFloat(formData.chargesNonRecuperables);
        if (formData.prixM2 !== undefined)
            this.params.communs.prixM2 = parseFloat(formData.prixM2);

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
            this.params.encheres.emolumentsPoursuivant4 = parseFloat(formData.emolumentsPoursuivant4);  // CORRIGÉ: typo emolementsPoursuivant4
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
        if (formData.plafondDeficitFoncier !== undefined)
            this.params.fiscalite.plafondDeficitFoncier = parseFloat(formData.plafondDeficitFoncier);
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
     * Alias pour maintenir la compatibilité avec le code existant
     * @param {number} prix - Prix d'adjudication
     * @returns {number} - Montant des émoluments
     */
    calculerEmolementsPoursuivant(prix) {
        return this.calculerEmolumentsPoursuivant(prix);
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
        if (montantPret <= 0) return 0;
        
        const tauxMensuel = taux / 100 / 12;
        const nombreMensualites = dureeAnnees * 12;
        
        if (tauxMensuel === 0) return montantPret / nombreMensualites;
        
        return (montantPret * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -nombreMensualites));
    }

    /**
     * Calcule le loyer mensuel brut en fonction du rendement souhaité
     * @param {number} prixAchat - Prix d'achat du bien
     * @param {number} rendementSouhaite - Rendement souhaité en %
     * @param {number} surface - Surface en m²
     * @returns {number} - Loyer mensuel brut
     */
    calculerLoyerBrut(prixAchat, rendementSouhaite, surface) {
        // Loyer basé sur le rendement souhaité (prix d'achat * rendement annuel / 12 mois)
        return (prixAchat * (rendementSouhaite / 100)) / 12;
    }

    /**
     * Calcule le loyer mensuel net
     * @param {number} loyerBrut - Loyer mensuel brut
     * @param {number} vacance - Taux de vacance locative en %
     * @returns {number} - Loyer mensuel net
     */
    calculerLoyerNet(loyerBrut, vacance) {
        // Borner la vacance entre 0 et 100%
        const vacanceBornee = Math.max(0, Math.min(100, vacance));
        return loyerBrut * (1 - vacanceBornee / 100);
    }

    /**
     * Calcule la taxe foncière annuelle
     * @param {number} loyerAnnuelBrut - Loyer annuel brut
     * @returns {number} - Taxe foncière annuelle
     */
    calculerTaxeFonciereAnnuelle(loyerAnnuelBrut) {
        // Si un montant est paramétré, l'utiliser
        if (this.params.communs.taxeFonciere > 0) {
            return this.params.communs.taxeFonciere;
        }
        // Sinon, utiliser 5% du loyer annuel brut par défaut
        return loyerAnnuelBrut * this.defaults.taxeFonciereDefaut;
    }

    /**
     * Calcule le montant des charges non récupérables
     * @param {number} surface - Surface en m²
     * @returns {number} - Montant mensuel des charges non récupérables
     */
    calculerChargesNonRecuperables(surface) {
        // Utiliser le paramètre s'il existe, sinon la valeur par défaut
        const chargesAnnuelles = this.params.communs.chargesNonRecuperables ?? this.defaults.chargesNonRecuperablesAnnuelles;
        return (surface * chargesAnnuelles) / 12;
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
     * @param {number} mensualiteTotale - Mensualité totale (prêt + assurance)
     * @param {number} taxeFonciere - Montant annuel de la taxe foncière
     * @param {number} chargesNonRecuperables - Charges non récupérables mensuelles
     * @param {number} entretienMensuel - Coût d'entretien mensuel
     * @param {number} assurancePNO - Coût annuel de l'assurance PNO
     * @returns {number} - Cash-flow mensuel
     */
    calculerCashFlow(loyerNet, mensualiteTotale, taxeFonciere, chargesNonRecuperables, entretienMensuel, assurancePNO) {
        return loyerNet - mensualiteTotale - (taxeFonciere / 12) - chargesNonRecuperables - entretienMensuel - (assurancePNO / 12);
    }

    /**
     * Calcule l'impact fiscal (corrigé pour le déficit foncier)
     * @param {number} revenuFoncier - Revenu foncier annuel avant impôts
     * @param {number} interetsEmprunt - Intérêts d'emprunt annuels
     * @returns {number} - Impact fiscal annuel
     */
    calculerImpactFiscal(revenuFoncier, interetsEmprunt) {
        const TMI = this.params.fiscalite.tauxMarginalImpot / 100;
        const PS = this.params.fiscalite.tauxPrelevementsSociaux / 100;
        
        // Si le revenu foncier est positif : TMI + PS s'appliquent
        if (revenuFoncier > 0) {
            return -(revenuFoncier * (TMI + PS));
        }
        
        // Si le revenu foncier est négatif et le déficit foncier est déductible
        if (revenuFoncier < 0 && this.params.fiscalite.deficitFoncier) {
            // En déficit foncier : seul le TMI génère une économie d'impôt
            // Les PS ne s'appliquent pas sur un déficit
            // Note: en réalité, il faut distinguer la part intérêts (reportable) 
            // de la part charges (imputable dans la limite de 10 700€)
            // Version simplifiée : on applique le TMI sur tout le déficit
            const deficit = Math.abs(revenuFoncier);
            const plafond = this.params.fiscalite.plafondDeficitFoncier || 10700;
            
            // Appliquer le plafond sur la partie hors intérêts (simplifié ici)
            const deficitImputable = Math.min(deficit, plafond);
            return deficitImputable * TMI;
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
     * Calcule le rendement sur coût total (nouveau)
     * @param {number} loyerAnnuelNet - Loyer annuel net
     * @param {number} coutTotal - Coût total de l'investissement
     * @returns {number} - Rendement sur coût total en %
     */
    calculerRendementSurCoutTotal(loyerAnnuelNet, coutTotal) {
        return (loyerAnnuelNet / coutTotal) * 100;
    }

    /**
     * Calcule le tableau d'amortissement du prêt
     * @param {number} montantPret - Montant du prêt
     * @param {number} taux - Taux d'intérêt annuel en %
     * @param {number} dureeAnnees - Durée du prêt en années
     * @returns {Array} - Tableau d'amortissement
     */
    calculerTableauAmortissement(montantPret, taux, dureeAnnees) {
        if (montantPret <= 0) return [];
        
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
     * Calcule tous les paramètres pour une surface et un mode (classique/enchères) donnés
     * @param {number} surface - Surface en m²
     * @param {string} mode - Mode d'achat ("classique" ou "encheres")
     * @returns {Object} - Résultats complets de la simulation
     */
    calculeTout(surface, mode) {
        const apport = this.params.base.apport;
        const taux = this.params.base.taux;
        const duree = this.params.base.duree;
        const vacanceLocative = Math.max(0, Math.min(100, this.params.communs.vacanceLocative));
        
        // Prix d'achat (en fonction de la surface)
        // Utiliser le prix au m² paramétré
        const prixM2 = parseFloat(this.params.communs.prixM2);
        const prixAchat = surface * prixM2;
        
        // Travaux (0,5% du prix d'achat ou valeur paramétrable)
        let travauxCoefficient;
        if (this.params.communs.useFixedTravauxPercentage) {
            travauxCoefficient = this.defaults.pourcentageTravauxDefaut; // 0.5% du prix d'achat
        } else {
            // Protection contre division par zéro
            travauxCoefficient = prixM2 > 0 ? (this.params.communs.travauxM2 / prixM2) : this.defaults.pourcentageTravauxDefaut;
        }
        const travaux = prixAchat * travauxCoefficient;
        
        // Frais spécifiques selon le mode d'achat
        let fraisSpecifiques = 0;
        let fraisDetails = {};
        
        if (mode === 'classique') {
            const fraisNotaire = this.calculerFraisNotaireClassique(prixAchat);
            const commission = prixAchat * this.params.classique.commissionImmo / 100;
            fraisSpecifiques = fraisNotaire + commission;
            fraisDetails = {
                fraisNotaire,
                commission
            };
        } else { // mode === 'encheres'
            const droitsEnregistrement = this.calculerDroitsEnregistrement(prixAchat);
            const emolumentsPoursuivant = this.calculerEmolumentsPoursuivant(prixAchat);
            const honorairesAvocat = this.calculerHonorairesAvocat(emolumentsPoursuivant);
            const publiciteFonciere = prixAchat * this.params.encheres.publiciteFonciereEncheres / 100;
            const fraisDivers = this.params.encheres.fraisFixes + 
                              this.params.encheres.avocatEnchere + 
                              this.params.encheres.suiviDossier;
            const caution = this.params.encheres.cautionRestituee ? 0 : 
                          prixAchat * this.params.encheres.cautionPourcent / 100;
            
            fraisSpecifiques = droitsEnregistrement + emolumentsPoursuivant + 
                             honorairesAvocat + publiciteFonciere + fraisDivers + caution;
            
 fraisDetails = {
    droitsEnregistrement,
    emolumentsPoursuivant,
    honorairesAvocat,
    publiciteFonciere,
    fraisDivers,
    caution,
    honorairesTotal: honorairesAvocat + fraisDivers + publiciteFonciere  // NOUVELLE LIGNE
};
        }
        
        // Coût hors frais bancaires
        const coutHorsFraisB = prixAchat + fraisSpecifiques + travaux;
        
        // Calcul analytique de l'emprunt
        const fraisDossier = this.params.communs.fraisBancairesDossier;
        const fraisCompte = this.params.communs.fraisBancairesCompte;
        const tauxGarantie = this.params.communs.fraisGarantie / 100;
        
        // Protection contre division par zéro et emprunt négatif
        let emprunt = 0;
        if (Math.abs(1 - tauxGarantie) > 0.0001) {
            emprunt = Math.max(0, (coutHorsFraisB - apport + fraisDossier + fraisCompte) / (1 - tauxGarantie));
        }
        
        // Frais bancaires
        const fraisBancaires = fraisDossier + fraisCompte + emprunt * tauxGarantie;
        
        // Coût total
        const coutTotal = coutHorsFraisB + fraisBancaires;
        
        // Mensualité du prêt
        const mensualite = this.calculerMensualite(emprunt, taux, duree);
        
        // Assurance emprunteur
        const tauxAssurance = (this.params.communs.tauxAssuranceEmprunteur ?? this.defaults.tauxAssuranceEmprunteur) / 100;
        const mensualiteAssurance = emprunt * tauxAssurance / 12;
        const mensualiteTotale = mensualite + mensualiteAssurance;
        
        // Loyer (basé sur la valeur au m² du marché, non plus sur le rendement souhaité)
        const loyerBrut = surface * this.params.communs.loyerM2;
        const rendementBrut = (loyerBrut * 12) / prixAchat * 100;
        const loyerNet = this.calculerLoyerNet(loyerBrut, vacanceLocative);
        
        // Taxe foncière (paramétrable ou 5% du loyer)
        const taxeFonciere = this.calculerTaxeFonciereAnnuelle(loyerBrut * 12);
        
        // Charges non récupérables (utiliser le paramètre)
        const chargesCopro = surface * (this.params.communs.chargesNonRecuperables ?? this.defaults.chargesNonRecuperablesAnnuelles);
        const chargesNonRecuperables = chargesCopro / 12; // Mensuel
        
        // Entretien
        const entretienMensuel = this.calculerEntretienMensuel(prixAchat);
        
        // Assurance PNO
        const assurancePNO = this.params.communs.assurancePNO;
        
        // Cash-flow (avec mensualité totale incluant l'assurance)
        const cashFlow = this.calculerCashFlow(
            loyerNet, mensualiteTotale, taxeFonciere, 
            chargesNonRecuperables, entretienMensuel, assurancePNO
        );
        
        // Calcul des intérêts pour la première année
        const tableauAmortissement = this.calculerTableauAmortissement(emprunt, taux, duree);
        const interetsPremierAnnee = tableauAmortissement.slice(0, 12).reduce((sum, m) => sum + m.interets, 0);
        
        // Revenu foncier avant impôt
        const chargesDeductibles = taxeFonciere + assurancePNO + chargesCopro + (entretienMensuel * 12);
        const revenuFoncier = (loyerNet * 12) - chargesDeductibles - interetsPremierAnnee;
        
        // Impact fiscal (corrigé)
        const impactFiscal = this.calculerImpactFiscal(revenuFoncier, interetsPremierAnnee);
        
        // Rendement net
        const rendementNet = this.calculerRendementNet(
            loyerNet * 12, chargesDeductibles, impactFiscal, coutTotal
        );
        
        // Rendement sur coût total (nouveau)
        const rendementSurCoutTotal = this.calculerRendementSurCoutTotal(loyerNet * 12, coutTotal);
        
        // Construire le résultat
        const resultat = {
            surface,
            prixAchat,
            prixM2,
            travaux,
            fraisBancaires,
            coutTotal,
            emprunt,
            mensualite,
            mensualiteAssurance,  // NOUVEAU
            mensualiteTotale,     // NOUVEAU
            loyerNet,
            loyerBrut,
            loyerM2: surface > 0 ? loyerBrut / surface : 0,
            taxeFonciere,
            chargesNonRecuperables: chargesCopro,
            entretienAnnuel: entretienMensuel * 12,
            assurancePNO,
            interetsAnnee1: interetsPremierAnnee,
            revenuFoncier,
            impactFiscal,
            cashFlow,
            cashFlowAnnuel: cashFlow * 12,
            rendementNet,
            rendementBrut,
            rendementSurCoutTotal,  // NOUVEAU
            // Deux marges pour la transparence
            margeHorsAssurance: loyerNet - mensualite,  // NOUVEAU: marge sans l'assurance
            margeAvecAssurance: loyerNet - mensualiteTotale,  // NOUVEAU: marge avec l'assurance (comme avant)
            marge: loyerNet - mensualiteTotale,  // Conservé pour compatibilité (= margeAvecAssurance)
            tableauAmortissement
        };
        
        // Ajouter les détails spécifiques selon le mode
        if (mode === 'classique') {
            resultat.fraisNotaire = fraisDetails.fraisNotaire;
            resultat.commission = fraisDetails.commission;
        } else {
            resultat.droitsEnregistrement = fraisDetails.droitsEnregistrement;
            resultat.emolumentsPoursuivant = fraisDetails.emolumentsPoursuivant;
            resultat.honorairesAvocat = fraisDetails.honorairesAvocat;
            resultat.honorairesTotal = fraisDetails.honorairesTotal;  // NOUVELLE LIGNE
            resultat.publiciteFonciere = fraisDetails.publiciteFonciere;
            resultat.fraisDivers = fraisDetails.fraisDivers;
            resultat.caution = fraisDetails.caution;
        }
        
        return resultat;
    }

    /**
     * Calcule le prix maximum pour l'achat classique selon les critères
     * @returns {Object} - Résultats de la simulation pour l'achat classique
     */
    simulerAchatClassique() {
        const pas = this.params.base.pasSurface || this.defaults.pasSurface;
        const modeCalc = this.params.base.calculationMode || 'loyer-mensualite';
        
        // Brancher automatiquement l'algo selon le mode
        const resultats = (modeCalc === 'cashflow-positif')
            ? this.chercheSurfaceDesc('classique', pas)  // ou chercheSurfaceObjectifCashflow('classique', 0) si préféré
            : this.chercheSurfaceDesc('classique', pas);
        
        // Stocker les résultats
        this.params.resultats.classique = resultats;
        
        return resultats;
    }

    /**
     * Calcule le prix maximum pour la vente aux enchères selon les critères
     * @returns {Object} - Résultats de la simulation pour la vente aux enchères
     */
    simulerVenteEncheres() {
        const pas = this.params.base.pasSurface || this.defaults.pasSurface;
        const modeCalc = this.params.base.calculationMode || 'loyer-mensualite';
        
        // Brancher automatiquement l'algo selon le mode
        const resultats = (modeCalc === 'cashflow-positif')
            ? this.chercheSurfaceDesc('encheres', pas)  // ou chercheSurfaceObjectifCashflow('encheres', 0) si préféré
            : this.chercheSurfaceDesc('encheres', pas);
        
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
     * @typedef {Object} DonneesAffichage
     * @property {Object} resultats - Résultats bruts de la simulation
     * @property {Object} resultats.classique - Résultats pour l'achat classique
     * @property {Object} resultats.encheres - Résultats pour la vente aux enchères
     * @property {Object} comparaison - Comparaison entre les deux modes
     * @property {Object} graphiques - Données pour les graphiques
     * @property {Object} avantages - Avantages de chaque mode
     */

    /**
     * Prépare les données pour l'affichage
     * @returns {DonneesAffichage|null} - Objet contenant toutes les données pour l'interface
     */
    preparerDonneesAffichage() {
        // Si aucun résultat n'est disponible, retourner null
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return null;
        }
        
        const classique = this.params.resultats.classique;
        const encheres = this.params.resultats.encheres;
        
        // Préparer toutes les données nécessaires à l'affichage
        return {
            resultats: {
                classique: classique,
                encheres: encheres
            },
            comparaison: {
                prixDiff: encheres.prixAchat - classique.prixAchat,
                coutTotalDiff: encheres.coutTotal - classique.coutTotal,
                loyerDiff: encheres.loyerBrut - classique.loyerBrut,
                rentabiliteDiff: encheres.rendementNet - classique.rendementNet,
                cashFlowDiff: encheres.cashFlow - classique.cashFlow
            },
            graphiques: {
                comparaison: this.getComparisonChartData(),
                amortissement: this.getAmortissementData(),
                valeur: this.getEvolutionValeurData(2),
                couts: this.getCoutsPieChartData()
            },
            avantages: this.determinerAvantages()
        };
    }

    /**
     * Détermine les avantages de chaque mode d'achat
     * @returns {Object} - Objet contenant les avantages de chaque mode
     */
    determinerAvantages() {
        if (!this.params.resultats.classique || !this.params.resultats.encheres) {
            return null;
        }
        
        const classique = this.params.resultats.classique;
        const encheres = this.params.resultats.encheres;
        
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
        
        return {
            classique: avantagesClassique,
            encheres: avantagesEncheres
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
        const patrimoineClassique = [resultats.classique.prixAchat - resultats.classique.emprunt];
        const patrimoineEncheres = [resultats.encheres.prixAchat - resultats.encheres.emprunt];
        
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
     * Tests unitaires automatiques pour la cohérence
     * @returns {boolean} - True si tous les tests passent
     */
    testCoherence() {
        const eps = this.defaults.epsSeuil;
        
        try {
            // Sauvegarder les paramètres actuels
            const paramsBackup = JSON.parse(JSON.stringify(this.params));
            
            // Configurer pour les tests
            this.params.base.apport = 30000;
            this.params.communs.prixM2 = 2000;
            this.params.communs.loyerM2 = 12;
            
            // Test 1: Mode loyer-mensualité
            this.params.base.calculationMode = 'loyer-mensualite';
            const resLM = this.chercheSurfaceDesc('classique', 1);
            console.assert(resLM && resLM.margeAvecAssurance >= -eps, "Test 1 échoué: Marge avec assurance doit être >= -epsilon");
            
            // Test 2: Mode cashflow
            this.params.base.calculationMode = 'cashflow-positif';
            const resCF = this.chercheSurfaceDesc('classique', 1);
            console.assert(resCF && resCF.cashFlow >= -eps, "Test 2 échoué: CashFlow doit être >= -epsilon");
            
            // Test 3: Contraintes respectées
            if (resLM) {
                console.assert(
                    this.surfaceRespecteContraintesFinancement(resLM.surface, 'classique'),
                    "Test 3 échoué: Surface trouvée doit respecter les contraintes"
                );
            }
            
            // Test 4: Assurance emprunteur prise en compte
            if (resLM) {
                console.assert(
                    resLM.mensualiteTotale > resLM.mensualite,
                    "Test 4 échoué: Mensualité totale doit inclure l'assurance"
                );
            }
            
            // Test 5: Taxe foncière paramétrable
            this.params.communs.taxeFonciere = 1500;
            const resAvecTF = this.calculeTout(50, 'classique');
            console.assert(
                Math.abs(resAvecTF.taxeFonciere - 1500) < 0.01,
                "Test 5 échoué: Taxe foncière doit être paramétrable"
            );
            
            // Test 6: Deux marges distinctes
            if (resLM) {
                console.assert(
                    Math.abs(resLM.margeHorsAssurance - resLM.margeAvecAssurance - resLM.mensualiteAssurance) < 0.01,
                    "Test 6 échoué: La différence entre les marges doit égaler l'assurance"
                );
            }
            
            // Restaurer les paramètres
            this.params = paramsBackup;
            
            console.log("✅ Tous les tests de cohérence sont passés");
            return true;
            
        } catch (error) {
            console.error("❌ Erreur dans les tests de cohérence:", error);
            return false;
        }
    }
}

// Export pour la compatibilité avec différents environnements
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = SimulateurImmo;
} else {
    window.SimulateurImmo = SimulateurImmo;
}

// Tests unitaires simples (exécutés uniquement si NODE_ENV=test)
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
    // Wrapper de test simple
    function runTest(name, testFn) {
        try {
            const result = testFn();
            console.log(`✅ Test "${name}" réussi`);
            return result;
        } catch (error) {
            console.error(`❌ Test "${name}" échoué:`, error);
            return false;
        }
    }
    
    // Tests basiques
    const simTest = new SimulateurImmo();
    simTest.params.base.apport = 30000;
    simTest.params.communs.prixM2 = 2000;
    simTest.params.communs.loyerM2 = 12;
    
    runTest("Vérification de surface viable", () => {
        const result = simTest.chercheSurfaceDesc('classique');
        if (!result) throw new Error("Aucune surface viable trouvée");
        return true;
    });
    
    runTest("Vérification de marge positive avec epsilon", () => {
        const result = simTest.chercheSurfaceDesc('classique');
        if (!result || result.margeAvecAssurance < -simTest.defaults.epsSeuil) 
            throw new Error(`Marge non acceptable: ${result?.margeAvecAssurance}`);
        return true;
    });
    
    runTest("Vérification de rendement positif", () => {
        const result = simTest.chercheSurfaceDesc('classique');
        if (!result || result.rendementNet <= 0) throw new Error("Rendement non positif");
        return true;
    });
    
    runTest("Test de cohérence complète", () => {
        return simTest.testCoherence();
    });
    
    runTest("Vérification des deux marges", () => {
        const result = simTest.chercheSurfaceDesc('classique');
        if (!result) throw new Error("Aucun résultat");
        
        const diff = Math.abs((result.margeHorsAssurance - result.margeAvecAssurance) - result.mensualiteAssurance);
        if (diff > 0.01) {
            throw new Error(`Incohérence entre les marges: diff=${diff}`);
        }
        return true;
    });
}
