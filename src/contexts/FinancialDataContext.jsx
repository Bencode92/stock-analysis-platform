// src/contexts/FinancialDataContext.jsx
import React, { createContext, useContext } from 'react';
import { useFinancialData } from '../hooks/useFinancialData';

// Création du context
const FinancialDataContext = createContext(null);

/**
 * Provider pour les données financières
 * Centralise toutes les données et fonctions pour les composants enfants
 */
export const FinancialDataProvider = ({ children }) => {
  // Utiliser le hook pour obtenir les données et fonctions
  const financialData = useFinancialData();
  
  return (
    <FinancialDataContext.Provider value={financialData}>
      {children}
    </FinancialDataContext.Provider>
  );
};

/**
 * Hook personnalisé pour utiliser les données financières
 * Permet aux composants d'accéder facilement aux données et fonctions
 */
export const useFinancialDataContext = () => {
  const context = useContext(FinancialDataContext);
  
  if (!context) {
    throw new Error('useFinancialDataContext doit être utilisé à l\'intérieur d\'un FinancialDataProvider');
  }
  
  return context;
};
