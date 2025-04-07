/**
 * event-test.js
 * Script de test pour valider le fonctionnement des événements et filtres
 * Version 1.0 - Avril 2025
 */

// Fonction principale de test
window.testEvents = function() {
  console.group('🧪 TEST COMPLET DU SYSTÈME D\'ÉVÉNEMENTS');

  // 1. Vérifier que toutes les dépendances sont chargées
  const dependencies = [
    { name: 'EventsManager', test: () => window.EventsManager !== undefined },
    { name: 'eventsManager', test: () => window.eventsManager !== undefined },
    { name: 'EventFilters', test: () => window.EventFilters !== undefined },
    { name: 'DateNormalizer', test: () => window.DateNormalizer !== undefined }
  ];

  console.log('1️⃣ Vérification des dépendances:');
  const depResults = {};
  let allDepsOk = true;

  dependencies.forEach(dep => {
    const isLoaded = dep.test();
    depResults[dep.name] = isLoaded ? '✅' : '❌';
    if (!isLoaded) allDepsOk = false;
    console.log(`  - ${dep.name}: ${isLoaded ? '✅ Chargé' : '❌ Non chargé'}`);
  });

  if (!allDepsOk) {
    console.error('⛔ Des dépendances importantes sont manquantes. Le système ne fonctionnera pas correctement.');
    console.groupEnd();
    return { 
      success: false, 
      message: 'Dépendances manquantes', 
      details: depResults 
    };
  }

  // 2. Vérifier les événements dans le DOM
  console.log('2️⃣ Vérification des événements dans le DOM:');
  const eventCards = document.querySelectorAll('.event-card');
  console.log(`  - ${eventCards.length} événements trouvés dans le DOM`);

  if (eventCards.length === 0) {
    console.error('⛔ Aucun événement trouvé dans le DOM. Vérifiez l\'initialisation de EventsManager.');
    console.groupEnd();
    return { 
      success: false, 
      message: 'Aucun événement trouvé', 
      details: { eventsCount: 0 } 
    };
  }

  // 3. Vérifier les attributs des événements
  console.log('3️⃣ Vérification des attributs des événements:');
  const attributes = {
    'data-type': 0,
    'data-date': 0,
    '.event-date': 0,
    missingDataType: 0,
    missingDate: 0
  };

  const typeValues = {};
  const dateFormats = new Set();

  eventCards.forEach(card => {
    // Vérifier data-type
    const type = card.getAttribute('data-type');
    if (type) {
      attributes['data-type']++;
      typeValues[type] = (typeValues[type] || 0) + 1;
    } else {
      attributes.missingDataType++;
    }

    // Vérifier data-date
    const dataDate = card.getAttribute('data-date');
    if (dataDate) {
      attributes['data-date']++;
    }

    // Vérifier .event-date
    const dateEl = card.querySelector('.event-date');
    if (dateEl) {
      attributes['.event-date']++;
      dateFormats.add(dateEl.textContent.trim());
    } else {
      attributes.missingDate++;
    }
  });

  const attributesOk = attributes.missingDataType === 0 && attributes.missingDate === 0;
  
  console.log(`  - Attributs data-type: ${attributes['data-type']}/${eventCards.length}`);
  console.log(`  - Attributs data-date: ${attributes['data-date']}/${eventCards.length}`);
  console.log(`  - Éléments .event-date: ${attributes['.event-date']}/${eventCards.length}`);
  console.log(`  - Types d'événements trouvés: ${Object.keys(typeValues).join(', ')}`);
  console.log(`  - Formats de date trouvés: ${[...dateFormats].join(', ')}`);

  if (!attributesOk) {
    console.warn('⚠️ Certains événements manquent d\'attributs essentiels.');
  }

  // 4. Tester la compatibilité du filtrage
  console.log('4️⃣ Test de compatibilité du filtrage:');
  
  // Réinitialiser les filtres pour notre test
  const originalState = window.EventFilters ? {
    dateFilter: window.EventFilters.state.dateFilter,
    categoryFilter: window.EventFilters.state.categoryFilter
  } : null;

  const filterTests = [];

  if (window.EventFilters) {
    // Test du filtre de date
    window.EventFilters.setDateFilter('today');
    const visibleToday = [...eventCards].filter(card => 
      window.getComputedStyle(card).display !== 'none'
    ).length;
    filterTests.push({ test: 'date=today', visible: visibleToday });

    window.EventFilters.setDateFilter('week');
    const visibleWeek = [...eventCards].filter(card => 
      window.getComputedStyle(card).display !== 'none'
    ).length;
    filterTests.push({ test: 'date=week', visible: visibleWeek });

    // Test du filtre de catégorie
    const categories = Object.keys(typeValues);
    categories.forEach(category => {
      window.EventFilters.setCategoryFilter(category);
      const visibleCategory = [...eventCards].filter(card => 
        window.getComputedStyle(card).display !== 'none'
      ).length;
      filterTests.push({ test: `category=${category}`, visible: visibleCategory });
    });

    // Test de combinaison
    window.EventFilters.setDateFilter('today');
    window.EventFilters.setCategoryFilter('all');
    const visibleTodayAll = [...eventCards].filter(card => 
      window.getComputedStyle(card).display !== 'none'
    ).length;
    filterTests.push({ test: 'today+all', visible: visibleTodayAll });

    // Restaurer l'état original
    window.EventFilters.setDateFilter(originalState.dateFilter);
    window.EventFilters.setCategoryFilter(originalState.categoryFilter);
  } else {
    console.warn('⚠️ EventFilters non disponible, filtrage non testé');
  }

  // Afficher les résultats des tests de filtrage
  if (filterTests.length > 0) {
    console.log('  - Résultats des tests de filtrage:');
    filterTests.forEach(test => {
      console.log(`    * ${test.test}: ${test.visible} événements visibles`);
    });
    
    // Vérification logique: week devrait montrer plus ou autant d'événements que today
    const todayTest = filterTests.find(t => t.test === 'date=today');
    const weekTest = filterTests.find(t => t.test === 'date=week');
    
    if (todayTest && weekTest) {
      const weekFilterOk = weekTest.visible >= todayTest.visible;
      console.log(`  - Cohérence filtre semaine vs jour: ${weekFilterOk ? '✅ OK' : '❌ Problème'}`);
      
      if (!weekFilterOk) {
        console.warn('⚠️ Le filtre "week" montre moins d\'événements que "today", ce qui est illogique');
      }
    }
  }

  // 5. Résumé et recommandations
  console.log('5️⃣ Résumé du test:');
  
  const hasTypeIssues = attributes.missingDataType > 0;
  const hasDateIssues = attributes.missingDate > 0;
  const filteringOk = filterTests.length > 0;

  const success = !hasTypeIssues && !hasDateIssues && filteringOk;

  console.log(`  - Événements: ${success ? '✅' : '❌'} ${eventCards.length} présents`);
  console.log(`  - Attributs: ${attributesOk ? '✅' : '❌'} ${hasTypeIssues ? 'Problèmes data-type' : ''} ${hasDateIssues ? 'Problèmes date' : ''}`);
  console.log(`  - Filtrage: ${filteringOk ? '✅' : '❌'} ${filterTests.length} tests effectués`);

  // Recommandations
  console.log('6️⃣ Recommandations:');
  
  if (hasTypeIssues || hasDateIssues) {
    console.log('  - ❗ Exécutez window.fixEvents() pour réparer les attributs manquants');
  }
  
  if (!filteringOk) {
    console.log('  - ❗ Vérifiez l\'initialisation de EventFilters');
  }
  
  if (success) {
    console.log('  - ✅ Le système d\'événements semble fonctionner correctement !');
  }

  console.groupEnd();
  
  // Retourner un rapport complet
  return {
    success,
    dependencies: depResults,
    eventsCount: eventCards.length,
    attributes: {
      dataType: attributes['data-type'],
      dataDate: attributes['data-date'],
      eventDate: attributes['.event-date'],
      missingDataType: attributes.missingDataType,
      missingDate: attributes.missingDate
    },
    types: typeValues,
    dateFormats: [...dateFormats],
    filterTests
  };
};

// Exécuter le test automatiquement après un délai pour laisser le temps à tout de se charger
setTimeout(() => {
  console.log('🔍 Exécution automatique du test des événements...');
  if (document.readyState === 'complete') {
    // Attendre que l'initialisation des événements soit terminée
    if (document.querySelectorAll('.event-card').length > 0) {
      window.testEvents();
    } else {
      console.log('⏳ Attente du chargement des événements...');
      // Réessayer après un délai
      setTimeout(() => {
        if (document.querySelectorAll('.event-card').length > 0) {
          window.testEvents();
        } else {
          console.warn('⚠️ Les événements ne semblent pas se charger. Vous pouvez exécuter window.testEvents() manuellement plus tard.');
        }
      }, 2000);
    }
  } else {
    console.log('⏳ Page en cours de chargement, report du test...');
    // Réessayer quand la page sera complètement chargée
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.testEvents();
      }, 1000);
    });
  }
}, 3000);

// Ajouter des alias pour les tests et corriger les fonctions de compatibilité
window.verifierEvents = window.testEvents;
window.testFilter = function(category, dateFilter) {
  if (window.EventFilters) {
    // Sauvegarder l'état actuel
    const originalState = {
      dateFilter: window.EventFilters.state.dateFilter,
      categoryFilter: window.EventFilters.state.categoryFilter
    };
    
    // Appliquer les filtres de test
    if (dateFilter) window.EventFilters.setDateFilter(dateFilter);
    if (category) window.EventFilters.setCategoryFilter(category);
    
    // Compter les événements visibles
    const visibleCount = [...document.querySelectorAll('.event-card')].filter(
      card => window.getComputedStyle(card).display !== 'none'
    ).length;
    
    console.log(`Test filtre: category=${category || originalState.categoryFilter}, date=${dateFilter || originalState.dateFilter} => ${visibleCount} événements visibles`);
    
    // Restaurer l'état original
    window.EventFilters.setDateFilter(originalState.dateFilter);
    window.EventFilters.setCategoryFilter(originalState.categoryFilter);
    
    return visibleCount;
  } else {
    console.error('❌ EventFilters non disponible');
    return -1;
  }
};
