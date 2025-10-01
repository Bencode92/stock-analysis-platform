/**
 * status-meta-2025.js - Méta-données enrichies pour les statuts juridiques
 * 4 clés décisives : rémunération, chômage, évolution capital, régime dirigeant
 */

// Enrichissements meta pour chaque statut
const statusMeta2025 = {
  "MICRO": {
    meta_payout: {
      peut_salaire: false,
      peut_dividendes: false,
      dividendes_cot_sociales: "n/a",
      base_cotisations: "chiffre d'affaires (taux forfaitaire)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: false, // pas de salaire possible
      are_commentaire_court: "Compatible ARE. Revenus nets déclarés mensuellement impactent les allocations selon barème Pôle Emploi."
    },
    meta_evolution: {
      accueil_investisseurs: "impossible",
      entree_associes_facile: false,
      migration_simple: "Passage en EI (réel) ou EURL/SASU simple si CA augmente"
    },
    meta_dirigeant: {
      statut_dirigeant: "TNS",
      couverture_dirigeant: "faible"
    }
  },

  "EI": {
    meta_payout: {
      peut_salaire: false,
      peut_dividendes: false,
      dividendes_cot_sociales: "n/a",
      base_cotisations: "bénéfice (réel) ou CA (micro)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: false,
      are_commentaire_court: "Compatible ARE. Revenus nets déclarés trimestriellement impactent les allocations."
    },
    meta_evolution: {
      accueil_investisseurs: "impossible",
      entree_associes_facile: false,
      migration_simple: "Apport du fonds à une société (EURL/SASU/SARL/SAS)"
    },
    meta_dirigeant: {
      statut_dirigeant: "TNS",
      couverture_dirigeant: "moyenne"
    }
  },

  "EURL": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: ">10%",
      base_cotisations: "rémunération + dividendes >10% (si IS)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Sans salaire : ARE maintenue. Avec salaire : baisse selon montant. Dividendes non pris en compte (attention requalification)."
    },
    meta_evolution: {
      accueil_investisseurs: "limité",
      entree_associes_facile: true,
      migration_simple: "EURL → SARL très simple (entrée d'associés)"
    },
    meta_dirigeant: {
      statut_dirigeant: "TNS",
      couverture_dirigeant: "moyenne"
    }
  },

  "SASU": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: "non",
      base_cotisations: "rémunération uniquement"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Sans salaire : ARE maintenue. Avec salaire : baisse selon montant. Dividendes non pris en compte (prudence requalification)."
    },
    meta_evolution: {
      accueil_investisseurs: "élevé",
      entree_associes_facile: true,
      migration_simple: "SASU → SAS très simple (cession/augmentation capital)"
    },
    meta_dirigeant: {
      statut_dirigeant: "assimilé salarié",
      couverture_dirigeant: "élevée"
    }
  },

  "SARL": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: ">10% (si gérant majoritaire)",
      base_cotisations: "rémunération + dividendes >10% (si gérant majoritaire et IS)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Gérant majoritaire : ARE difficile. Gérant minoritaire/égalitaire : comme assimilé salarié."
    },
    meta_evolution: {
      accueil_investisseurs: "moyen",
      entree_associes_facile: true,
      migration_simple: "SARL → SAS possible (transformation) mais formalités lourdes"
    },
    meta_dirigeant: {
      statut_dirigeant: "TNS (majoritaire) / assimilé salarié (minoritaire)",
      couverture_dirigeant: "moyenne/élevée selon gérance"
    }
  },

  "SAS": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: "non",
      base_cotisations: "rémunération uniquement"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Sans salaire président : ARE maintenue. Avec salaire : baisse selon montant. Dividendes non pris en compte."
    },
    meta_evolution: {
      accueil_investisseurs: "élevé",
      entree_associes_facile: true,
      migration_simple: "Actions de préférence, BSPCE, pactes d'actionnaires facilités"
    },
    meta_dirigeant: {
      statut_dirigeant: "assimilé salarié",
      couverture_dirigeant: "élevée"
    }
  },

  "SA": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: "non",
      base_cotisations: "rémunération uniquement"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Dirigeants assimilés salariés : ARE baisse si rémunération. Dividendes non pris en compte."
    },
    meta_evolution: {
      accueil_investisseurs: "élevé",
      entree_associes_facile: true,
      migration_simple: "Cotation en bourse possible, capital variable"
    },
    meta_dirigeant: {
      statut_dirigeant: "assimilé salarié",
      couverture_dirigeant: "élevée"
    }
  },

  "SNC": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: false, // transparence fiscale IR par défaut
      dividendes_cot_sociales: "n/a",
      base_cotisations: "bénéfice (IR) ou rémunération (IS)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Associés TNS : ARE difficile. Gérant non associé : comme assimilé."
    },
    meta_evolution: {
      accueil_investisseurs: "faible",
      entree_associes_facile: false,
      migration_simple: "Agrément unanime requis pour entrée/sortie"
    },
    meta_dirigeant: {
      statut_dirigeant: "TNS (associés)",
      couverture_dirigeant: "moyenne"
    }
  },

  "SCI": {
    meta_payout: {
      peut_salaire: false,
      peut_dividendes: true, // seulement si option IS
      dividendes_cot_sociales: "n/a (sauf IS)",
      base_cotisations: "aucune (sauf gérant rémunéré)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: false, // généralement pas de salaire
      are_commentaire_court: "Compatible ARE si pas de rémunération. Revenus fonciers n'impactent pas l'ARE."
    },
    meta_evolution: {
      accueil_investisseurs: "faible",
      entree_associes_facile: true,
      migration_simple: "Agrément statutaire courant, transmission facilitée"
    },
    meta_dirigeant: {
      statut_dirigeant: "aucun (gérant souvent non rémunéré)",
      couverture_dirigeant: "aucune"
    }
  },

  "SELARL": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: ">10% (si gérant majoritaire)",
      base_cotisations: "rémunération + dividendes >10% (si gérant majoritaire et IS)"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Gérant majoritaire TNS : ARE difficile. Minoritaire : comme assimilé salarié."
    },
    meta_evolution: {
      accueil_investisseurs: "limité",
      entree_associes_facile: true,
      migration_simple: "Agrément ordinal requis, majorité capital par professionnels"
    },
    meta_dirigeant: {
      statut_dirigeant: "TNS (majoritaire) / assimilé (minoritaire)",
      couverture_dirigeant: "moyenne/élevée selon gérance"
    }
  },

  "SELAS": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: "non",
      base_cotisations: "rémunération uniquement"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Président assimilé salarié : ARE baisse si rémunération. Dividendes non pris en compte."
    },
    meta_evolution: {
      accueil_investisseurs: "moyen",
      entree_associes_facile: true,
      migration_simple: "Agrément ordinal, contraintes capital/votes professionnels"
    },
    meta_dirigeant: {
      statut_dirigeant: "assimilé salarié",
      couverture_dirigeant: "élevée"
    }
  },

  "SCA": {
    meta_payout: {
      peut_salaire: true,
      peut_dividendes: true,
      dividendes_cot_sociales: "non",
      base_cotisations: "rémunération gérant"
    },
    meta_are: {
      are_compatible_sans_salaire: true,
      are_baisse_si_salaire: true,
      are_commentaire_court: "Gérant assimilé salarié : ARE baisse si rémunération."
    },
    meta_evolution: {
      accueil_investisseurs: "élevé",
      entree_associes_facile: true,
      migration_simple: "Contrôle par commandités, levée de fonds facilitée"
    },
    meta_dirigeant: {
      statut_dirigeant: "assimilé salarié (gérant)",
      couverture_dirigeant: "élevée"
    }
  }
};

// Exposer globalement
window.statusMeta2025 = statusMeta2025;

// Fonction pour enrichir un statut avec ses métas
window.enrichWithMeta2025 = function(statut) {
  if (!statut || !statut.shortName) return statut;
  
  const meta = statusMeta2025[statut.shortName];
  if (!meta) return statut;
  
  return {
    ...statut,
    ...meta
  };
};

console.log('✅ status-meta-2025.js chargé -', Object.keys(statusMeta2025).length, 'statuts enrichis');
