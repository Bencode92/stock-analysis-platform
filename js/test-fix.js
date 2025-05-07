// Test pour vérifier le comportement du taux de charge réel

// Fonction qui reproduit ce que fait FiscalUtils.getMargeEffective
function getMargeEffective(tauxMarge, tauxFrais) {
  console.log("getMargeEffective appelé avec:", { tauxMarge, tauxFrais });
  
  // Si tauxFrais est défini, on l'utilise pour calculer la marge effective
  if (tauxFrais !== null && tauxFrais !== undefined) {
    return 1 - tauxFrais;  // Ex: 35% de frais → 65% de marge
  }
  
  // Sinon on utilise le taux de marge ou une valeur par défaut
  return tauxMarge ?? 0.3;  // Garde la valeur passée ou 30% par défaut
}

// Fonction pour simuler ce que fait SimulationsFiscales.simulerEI
function simulerTest(params) {
  const { ca, tauxMarge, tauxFrais } = params;
  
  console.log("Paramètres reçus:", params);
  
  // Calcul de la marge effective
  const margeEffective = getMargeEffective(tauxMarge, tauxFrais);
  console.log("Marge effective calculée:", margeEffective);
  
  // Résultat simulé
  const resultat = ca * margeEffective;
  console.log("Résultat calculé:", resultat);
  
  return {
    ca,
    margeEffective,
    resultat
  };
}

// Test 1: Sans tauxFrais (cas standard)
console.log("TEST 1: Sans tauxFrais (cas standard)");
const params1 = {
  ca: 50000,
  tauxMarge: 0.3,
  tauxFrais: 0
};
const resultat1 = simulerTest(params1);
console.log("Résultat 1:", resultat1);

// Test 2: Avec tauxFrais = null
console.log("\nTEST 2: Avec tauxFrais = null");
const params2 = {
  ca: 50000,
  tauxMarge: 0.3,
  tauxFrais: null
};
const resultat2 = simulerTest(params2);
console.log("Résultat 2:", resultat2);

// Test 3: Avec tauxFrais défini (cas du taux de charge réel)
console.log("\nTEST 3: Avec tauxFrais défini (cas du taux de charge réel)");
const params3 = {
  ca: 50000,
  tauxMarge: undefined,
  tauxFrais: 0.7  // 70% de frais = 30% de marge
};
const resultat3 = simulerTest(params3);
console.log("Résultat 3:", resultat3);

// Instructions pour débogage
/*
1. Ajoutez ce script au fichier fiscal-guide.js dans runComparison() :

console.log("Paramètres envoyés:", params);
console.log("useAvgChargeRate est:", useAvgChargeRate);

2. Vérifiez dans la console du navigateur si tauxFrais est bien initialisé
3. Si le problème persiste, modifiez la ligne pour utiliser undefined au lieu de null :

tauxFrais: useAvgChargeRate ? (1 - marge) : undefined,
*/