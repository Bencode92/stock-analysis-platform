// Code à ajouter dans fiscal-enveloppes.js après le LEP dans la section LIVRETS RÉGLEMENTÉS

{
  id: 'livret-jeune',
  label: 'Livret Jeune',
  type: 'Épargne réglementée 12-25 ans',
  
  // Plafonds & versements
  plafond: 1_600,        // hors intérêts capitalisés
  versementMin: 10,      // versement initial & solde minimum
  
  // Rémunération
  taux: '≥ taux du Livret A (2,40 % net depuis le 1ᵉʳ février 2025)',
  
  // Durée
  clockFrom: null,       // pas de compteur spécifique
  fermetureAuto: '31 décembre de l'année des 25 ans',
  
  // Seuil de déclenchement éventuel
  seuil: null,
  
  // Conditions d'éligibilité
  conditions: {
    ageMin: 12,
    ageMax: 25,
    residenceFrance: true, // résidence fiscale en France
    unique: true           // un seul Livret Jeune par personne
  },
  
  // Encadrement des retraits pour les mineurs
  retraitsAvant16Ans: 'Autorisation du représentant légal requise',
  
  // Fiscalité
  fiscalite: {
    texte: 'Exonéré',      // 0 % IR & PS
    calcGainNet: ({ gain }) => gain
  }
},