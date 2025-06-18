/* -----------------------------------------------------------------------------
   Correctif pour ajouter le Livret Jeune manquant
   ----------------------------------------------------------------------------- */

// Ajout du Livret Jeune dans la liste des enveloppes
// À insérer après le LEP dans fiscal-enveloppes.js

export const livretJeune = {
  id: 'livret-jeune',
  label: 'Livret Jeune',
  type: 'Épargne jeunes (12-25 ans)',
  plafond: 1_600,
  clockFrom: null,
  seuil: null,
  fiscalite: { 
    texte: 'Exonéré (intérêts et prélèvements sociaux)', 
    calcGainNet: ({ gain }) => gain 
  },
};

// Pour intégrer cette enveloppe, ajoutez cet objet dans le tableau 'enveloppes' 
// de fiscal-enveloppes.js, après la définition du LEP :

/*
  {
    id: 'livret-jeune',
    label: 'Livret Jeune',
    type: 'Épargne jeunes (12-25 ans)',
    plafond: 1_600,
    clockFrom: null,
    seuil: null,
    fiscalite: { 
      texte: 'Exonéré (intérêts et prélèvements sociaux)', 
      calcGainNet: ({ gain }) => gain 
    },
  },
*/

// Note: Le Livret Jeune est réservé aux 12-25 ans avec un plafond de 1 600€
// Le taux est fixé librement par les banques (minimum égal au Livret A)
