// fiscal-utils.js - Utilitaires pour les calculs fiscaux
// Version 1.6 - Mai 2025 - Correction des problèmes de secteur "Tous"

const CSG_CRDS_IMPOSABLE = 0.029;    // 2,4% CSG non déductible + 0,5% CRDS = 2,9%

// SMIC annuel 2025 pour les calculs de plages
const SMIC_ANNUEL_2025 = 21060;

// NOUVEAU: Debug flag pour contrôler les logs
const DEBUG = false;
function log(...args) {
    if (DEBUG) console.log(...args);
}

// NOUVEAU: Normalisation des valeurs sectorielles
function normalize(value) {
    // Si la valeur est "Par défaut", retourner "Tous" (valeur par défaut)
    if (!value || value === "Par défaut") return "Tous";
    
    return value.trim()
        .replace(/^</,"<")     // garde "<50"
        .replace(/^>=/,">=")   // garde ">=50"
        .toLowerCase()
        .replace(/^\w/, c => c.toUpperCase());
}

// Table paramétrable des charges sociales SASU (2025)
// Mise à jour avec des taux plus différenciés par secteur pour une meilleure visibilité de l'impact
const CHARGES_SASU_2025 = [
    // Tous secteurs, différentes tailles
    { secteur: "Tous", taille: "<50", plage: "<1.6", tauxPatronal: 0.28, tauxSalarial: 0.21, description: "Réduction générale maximale" },
    { secteur: "Tous", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.33, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Tous", taille: "<50", plage: ">2.5", tauxPatronal: 0.41, tauxSalarial: 0.21, description: "Taux pleins" },
    { secteur: "Tous", taille: ">=50", plage: "<1.6", tauxPatronal: 0.32, tauxSalarial: 0.21, description: "FNAL majoré, réduction max" },
    { secteur: "Tous", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.36, tauxSalarial: 0.21, description: "FNAL majoré, réduction part." },
    { secteur: "Tous", taille: ">=50", plage: ">2.5", tauxPatronal: 0.43, tauxSalarial: 0.21, description: "FNAL majoré, taux pleins" },
    
    // Commerce - taux légèrement réduits pour AT faible
    { secteur: "Commerce", taille: "<50", plage: "<1.6", tauxPatronal: 0.26, tauxSalarial: 0.21, description: "AT faible, famille réduit" },
    { secteur: "Commerce", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.31, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Commerce", taille: "<50", plage: ">2.5", tauxPatronal: 0.39, tauxSalarial: 0.22, description: "Taux pleins" },
    { secteur: "Commerce", taille: ">=50", plage: "<1.6", tauxPatronal: 0.30, tauxSalarial: 0.21, description: "FNAL majoré" },
    { secteur: "Commerce", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.34, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Commerce", taille: ">=50", plage: ">2.5", tauxPatronal: 0.41, tauxSalarial: 0.22, description: "Taux pleins" },
    
    // Industrie - taux majorés pour AT élevé
    { secteur: "Industrie", taille: "<50", plage: "<1.6", tauxPatronal: 0.32, tauxSalarial: 0.21, description: "AT élevé, famille réduit" },
    { secteur: "Industrie", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.37, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Industrie", taille: "<50", plage: ">2.5", tauxPatronal: 0.45, tauxSalarial: 0.21, description: "Taux pleins" },
    { secteur: "Industrie", taille: ">=50", plage: "<1.6", tauxPatronal: 0.36, tauxSalarial: 0.21, description: "FNAL majoré" },
    { secteur: "Industrie", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.40, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Industrie", taille: ">=50", plage: ">2.5", tauxPatronal: 0.47, tauxSalarial: 0.22, description: "FNAL majoré, taux pleins" },
    
    // Services - taux réduits pour AT très faible
    { secteur: "Services", taille: "<50", plage: "<1.6", tauxPatronal: 0.27, tauxSalarial: 0.21, description: "AT très faible" },
    { secteur: "Services", taille: "<50", plage: "1.6-2.5", tauxPatronal: 0.31, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Services", taille: "<50", plage: ">2.5", tauxPatronal: 0.39, tauxSalarial: 0.21, description: "Taux pleins" },
    { secteur: "Services", taille: ">=50", plage: "<1.6", tauxPatronal: 0.30, tauxSalarial: 0.21, description: "FNAL majoré" },
    { secteur: "Services", taille: ">=50", plage: "1.6-2.5", tauxPatronal: 0.34, tauxSalarial: 0.21, description: "Réduction partielle" },
    { secteur: "Services", taille: ">=50", plage: ">2.5", tauxPatronal: 0.41, tauxSalarial: 0.21, description: "FNAL majoré, taux pleins" }
];

class FiscalUtils {
    // Calcul d'IR par tranches progressives
    static calculateProgressiveIR(revenuImposable) {
        const tranches = [
            { max: 11497, taux: 0   },  // Mise à jour barème 2025
            { max: 29315, taux: 0.11},
            { max: 83823, taux: 0.30},
            { max: 180294, taux: 0.41},
            { max: Infinity, taux: 0.45}
        ];
        
        let impot = 0;
        let min = 0;
        for (const t of tranches) {
            const taxable = Math.max(0, Math.min(revenuImposable - min, t.max - min));
            impot += taxable * t.taux;
            min = t.max;
        }
        
        return Math.round(impot);
    }
    
    // Optimisation du ratio rémunération/dividendes - AMÉLIORATION MAJEURE
    static optimiserRatioRemuneration(params, simulationFunc) {
        // Mémoriser les meilleurs résultats
        let meilleurRatio = 0.5;
        let meilleurNet = 0;
        
        // S'assurer que les options sectorielles sont préservées
        const secteurOptions = {
            secteur: window.sectorOptions?.secteur || "Tous",
            taille: window.sectorOptions?.taille || "<50"
        };
        
        // Normaliser le secteur
        const secteur = normalize(secteurOptions.secteur);
        const taille = secteurOptions.taille.trim();
        
        log("FiscalUtils: Optimisation avec secteur:", secteur, taille);
        
        // Sauvegarde des paramètres originaux
        const paramsBase = {...params};
        
        // AMÉLIORATION: Utiliser une approche logarithmique pour réduire les calculs
        // 1. Commencer par un découpage grossier
        const grid = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
        
        // Tester les valeurs de la grille grossière
        for(const ratio of grid) {
            const paramsTest = {
                ...paramsBase,
                tauxRemuneration: ratio,
                secteur: secteur,
                taille: taille
            };
            
            const resultat = simulationFunc(paramsTest);
            
            if(resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
            }
        }
        
        // 2. Affiner autour du meilleur résultat (±0.05)
        const min = Math.max(0.01, meilleurRatio - 0.05);
        const max = Math.min(0.99, meilleurRatio + 0.05);
        
        for(let ratio = min; ratio <= max; ratio += 0.01) {
            const paramsTest = {
                ...paramsBase,
                tauxRemuneration: ratio,
                secteur: secteur,
                taille: taille
            };
            
            const resultat = simulationFunc(paramsTest);
            
            if(resultat.revenuNetTotal > meilleurNet) {
                meilleurNet = resultat.revenuNetTotal;
                meilleurRatio = ratio;
            }
        }
        
        // Calculer le résultat final avec le ratio optimal
        const paramsFinaux = {
            ...paramsBase,
            tauxRemuneration: meilleurRatio,
            secteur: secteur,
            taille: taille
        };
        
        log("FiscalUtils: Calcul final avec paramètres sectoriels:", paramsFinaux);
        
        const resultatFinal = simulationFunc(paramsFinaux);
        resultatFinal.ratioOptimise = meilleurRatio;
        
        log("FiscalUtils: Ratio optimal trouvé:", meilleurRatio, "avec revenu net:", meilleurNet);
        
        return {
            ratio: meilleurRatio,
            net: meilleurNet,
            resultat: resultatFinal
        };
    }
    
    // Calcul des cotisations TNS avec barème progressif
    static calculCotisationsTNS(rem) {
        const PASS = 47100;              // Plafond annuel SS 2025
        const trancheA = Math.min(rem, PASS) * 0.28;   // maladie + vieillesse de base
        const trancheB = Math.max(0, rem - PASS) * 0.17;
        const csg = rem * 0.092;
        const crds = rem * 0.005;
        return Math.round(trancheA + trancheB + csg + crds);
    }
    
    // Calcul des cotisations TNS sur bénéfice brut (formule fermée)
    static cotisationsTNSSurBenefice(beneficeBrut) {
        const tauxGlobal = 0.45;
        return Math.round(beneficeBrut * tauxGlobal / (1 + tauxGlobal));
    }
    
    // Calcul des cotisations TNS sur dividendes
    static cotTNSDividendes(dividendes, capitalSocial) {
        // Calcul précis avec les tranches 2025
        const PASS = 47100;
        const base = Math.max(0, dividendes - 0.10 * capitalSocial);
        const partA = Math.min(base, PASS) * 0.28;
        const partB = Math.max(0, base - PASS) * 0.1775;
        return Math.round(partA + partB);
    }
    
    // Calcul des charges salariales avec table paramétrable - CORRECTION MAJEURE
    static calculChargesSalariales(remuneration, params = {}) {
        // Considérer "Par défaut" comme équivalent à "Tous"
        let secteur = params.secteur || window.sectorOptions?.secteur || "Tous";
        if (secteur === "Par défaut") secteur = "Tous";
        
        let taille = (params.taille || window.sectorOptions?.taille || "<50").trim();
        if (taille === "Par défaut") taille = "<50";
        
        // Normaliser pour s'assurer de la cohérence
        secteur = normalize(secteur);
        
        log(`FiscalUtils: Calcul des charges - secteur=${secteur}, taille=${taille}, remuneration=${remuneration}`);
        
        // Déterminer la plage de salaire par rapport au SMIC
        const ratio = remuneration / SMIC_ANNUEL_2025;
        let plage = ratio < 1.6 ? "<1.6" : (ratio <= 2.5 ? "1.6-2.5" : ">2.5");
        
        // Rechercher les taux dans la table
        let tauxPatronal = 0.45; // Valeur par défaut
        let tauxSalarial = 0.22; // Valeur par défaut
        let description = "Valeurs par défaut";
        
        // Recherche du taux le plus spécifique possible
        let ligneCorrespondante = null;
        
        // D'abord chercher un taux spécifique au secteur et à la taille
        for (const ligne of CHARGES_SASU_2025) {
            if (ligne.secteur === secteur && 
                ligne.taille === taille && 
                ligne.plage === plage) {
                ligneCorrespondante = ligne;
                break;
            }
        }
        
        // Si aucun taux spécifique trouvé, chercher un taux pour "Tous" secteurs avec cette taille
        if (!ligneCorrespondante) {
            for (const ligne of CHARGES_SASU_2025) {
                if (ligne.secteur === "Tous" && 
                    ligne.taille === taille && 
                    ligne.plage === plage) {
                    ligneCorrespondante = ligne;
                    break;
                }
            }
        }
        
        // CORRECTION CRITIQUE: Si toujours rien trouvé et qu'on était déjà en mode "Tous",
        // créer une ligne par défaut pour éviter de rester bloqué
        if (!ligneCorrespondante && secteur === "Tous") {
            ligneCorrespondante = { 
                tauxPatronal: 0.45, 
                tauxSalarial: 0.22, 
                description: "Taux génériques par défaut", 
                secteur: "Tous", 
                taille: taille, 
                plage: plage 
            };
            log(`FiscalUtils: ATTENTION - Aucune ligne correspondante trouvée pour Tous/${taille}/${plage}, utilisation des valeurs par défaut`);
        }
        
        // Si trouvé, utiliser ces valeurs
        if (ligneCorrespondante) {
            tauxPatronal = ligneCorrespondante.tauxPatronal;
            tauxSalarial = ligneCorrespondante.tauxSalarial;
            description = ligneCorrespondante.description;
        }
        
        // Logging pour le débogage
        log(`[FiscalUtils] Taux appliqués - Patronal: ${(tauxPatronal*100).toFixed(1)}%, Salarial: ${(tauxSalarial*100).toFixed(1)}%, Description: ${description}`);
        
        const patronales = Math.round(remuneration * tauxPatronal);
        const salariales = Math.round(remuneration * tauxSalarial);
        
        return {
            patronales: patronales,
            salariales: salariales,
            total: patronales + salariales,
            tauxPatronal: tauxPatronal,
            tauxSalarial: tauxSalarial,
            description: description,
            secteur: secteur,
            taille: taille
        };
    }
    
    // Calcul PFU sur dividendes
    static calculPFU(dividendes) {
        return Math.round(dividendes * 0.30);
    }
    
    // Calcul IS selon tranches avec paramètres additionnels
    static calculIS(resultat, params = {}) {
        const seuil = 42500;
        const okTauxReduit = resultat <= seuil 
            && (params.ca ?? Infinity) < 10000000
            && (params.capitalEstLibere ?? true)
            && (params.detentionPersPhysiques75 ?? true);
        return Math.round(resultat * (okTauxReduit ? 0.15 : 0.25));
    }
    
    // Création de données pour le graphique d'optimisation
    static genererDonneesGraphiqueOptimisation(params, simulationFunc) {
        // S'assurer que les options sectorielles sont incluses et normalisées
        const secteur = normalize(window.sectorOptions?.secteur || "Tous");
        const taille = (window.sectorOptions?.taille || "<50").trim();
        
        const donnees = [];
        for(let ratio = 0.05; ratio <= 1; ratio += 0.05) {
            const paramsTest = {
                ...params,
                tauxRemuneration: ratio,
                secteur: secteur,
                taille: taille
            };
            const resultat = simulationFunc(paramsTest);
            donnees.push({
                ratio: Math.round(ratio * 100),
                revenuNet: resultat.revenuNetTotal,
                repartition: {
                    remuneration: resultat.salaireNetApresIR || resultat.revenuNetSalaire || 0,
                    dividendes: resultat.dividendesNets || 0
                }
            });
        }
        return donnees;
    }
    
    // Afficher l'impact sectoriel - fonction pour l'analyse
    static analyserImpactSectoriel(remuneration) {
        const secteurs = ["Tous", "Commerce", "Industrie", "Services"];
        const tailles = ["<50", ">=50"];
        
        const resultats = [];
        
        secteurs.forEach(secteur => {
            tailles.forEach(taille => {
                const charges = this.calculChargesSalariales(remuneration, { secteur, taille });
                
                resultats.push({
                    secteur: secteur,
                    taille: taille,
                    patronales: charges.patronales,
                    salariales: charges.salariales,
                    total: charges.total,
                    tauxPatronal: charges.tauxPatronal,
                    tauxSalarial: charges.tauxSalarial,
                    description: charges.description
                });
            });
        });
        
        return resultats;
    }
    
    // Nouvelle fonction pour générer un tableau comparatif des impacts sectoriels
    static genererTableauComparatifSectoriel(remuneration) {
        const resultats = this.analyserImpactSectoriel(remuneration);
        
        // Formater les données pour l'affichage
        return resultats.map(res => {
            const tauxGlobal = res.tauxPatronal + res.tauxSalarial;
            return {
                secteur: res.secteur,
                taille: res.taille,
                patronalesFormat: `${res.patronales.toLocaleString('fr-FR')} € (${(res.tauxPatronal*100).toFixed(1)}%)`,
                salarialesFormat: `${res.salariales.toLocaleString('fr-FR')} € (${(res.tauxSalarial*100).toFixed(1)}%)`,
                totalFormat: `${res.total.toLocaleString('fr-FR')} € (${(tauxGlobal*100).toFixed(1)}%)`,
                netApresCharges: `${(remuneration - res.salariales).toLocaleString('fr-FR')} €`,
                description: res.description
            };
        });
    }
    
    // Ajouter après la dernière méthode de la classe, avant la ligne "window.FiscalUtils = FiscalUtils;"
    static isUsingDefaultSectorOptions() {
        const secteurSelect = document.querySelector('#secteur-select, [id$="secteur-select"]');
        const tailleSelect = document.querySelector('#taille-select, [id$="taille-select"]');
        
        return (secteurSelect && secteurSelect.value === "Par défaut") &&
               (tailleSelect && tailleSelect.value === "Par défaut");
    }
}

// Exposer la classe au niveau global
window.FiscalUtils = FiscalUtils;

// Ajouter après window.FiscalUtils = FiscalUtils;
window.isUsingDefaultSectorOptions = FiscalUtils.isUsingDefaultSectorOptions;

// Exposer la fonction normalize au niveau global
window.normalizeSecteur = normalize;

// Notifier que le module est chargé
document.addEventListener('DOMContentLoaded', function() {
    log("Module FiscalUtils chargé et disponible globalement");
    
    // CORRECTION: Initialiser l'objet sectorOptions avec un objet vide pour éviter les erreurs
    if (!window.sectorOptions) {
        window.sectorOptions = {
            secteur: "Tous",
            taille: "<50"
        };
        log("FiscalUtils: Création de l'objet sectorOptions global par défaut");
    }
    
    document.dispatchEvent(new CustomEvent('fiscalUtilsReady'));
});