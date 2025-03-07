// src/__tests__/HighImpactEvents.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HighImpactEvents } from '../components/HighImpactEvents';
import { FinancialDataContext } from '../contexts/FinancialDataContext';

// Mock du contexte de données financières
const mockHighImpactEvents = [
  {
    title: "Événement test 1",
    marketType: "actions",
    explanation: "Explication de l'événement 1",
    impactScore: 8,
    affectedSymbols: ["AAPL", "MSFT"],
    timing: "immédiat"
  },
  {
    title: "Événement test 2",
    marketType: "crypto",
    explanation: "Explication de l'événement 2",
    impactScore: 6,
    affectedSymbols: ["BTC", "ETH"],
    timing: "court terme"
  }
];

describe('Composant HighImpactEvents', () => {
  test('affiche un indicateur de chargement quand isLoading est true', () => {
    render(
      <FinancialDataContext.Provider value={{ 
        highImpactEvents: [], 
        isLoading: { events: true }, 
        hasError: { events: false } 
      }}>
        <HighImpactEvents />
      </FinancialDataContext.Provider>
    );
    
    expect(screen.getByText(/Événements à fort impact aujourd'hui/i)).toBeInTheDocument();
    expect(screen.queryByTestId('high-impact-events')).not.toBeInTheDocument();
  });
  
  test('affiche un message d\'erreur quand hasError est true', () => {
    render(
      <FinancialDataContext.Provider value={{ 
        highImpactEvents: [], 
        isLoading: { events: false }, 
        hasError: { events: true },
        newsData: [],
        fetchHighImpactEvents: jest.fn()
      }}>
        <HighImpactEvents />
      </FinancialDataContext.Provider>
    );
    
    expect(screen.getByText(/Impossible d'analyser les événements/i)).toBeInTheDocument();
  });
  
  test('affiche le message d\'absence d\'événements quand la liste est vide', () => {
    render(
      <FinancialDataContext.Provider value={{ 
        highImpactEvents: [], 
        isLoading: { events: false }, 
        hasError: { events: false } 
      }}>
        <HighImpactEvents />
      </FinancialDataContext.Provider>
    );
    
    expect(screen.getByText(/Aucun événement à fort impact identifié aujourd'hui/i)).toBeInTheDocument();
  });
  
  test('affiche les événements à fort impact correctement', () => {
    render(
      <FinancialDataContext.Provider value={{ 
        highImpactEvents: mockHighImpactEvents, 
        isLoading: { events: false }, 
        hasError: { events: false },
        newsData: [],
        fetchHighImpactEvents: jest.fn()
      }}>
        <HighImpactEvents />
      </FinancialDataContext.Provider>
    );
    
    // Vérifier que les événements sont affichés
    expect(screen.getByTestId('high-impact-events')).toBeInTheDocument();
    expect(screen.getByText('Événement test 1')).toBeInTheDocument();
    expect(screen.getByText('Événement test 2')).toBeInTheDocument();
    
    // Vérifier les détails de l'événement 1
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    
    // Vérifier que l'icône de crypto est présente pour l'événement 2 (utilisé FontAwesome)
    const cryptoEvent = screen.getByText('Événement test 2').closest('.event-card');
    expect(cryptoEvent.querySelector('.fa-bitcoin-sign')).toBeTruthy();
  });
  
  test('développe un événement au clic', () => {
    render(
      <FinancialDataContext.Provider value={{ 
        highImpactEvents: mockHighImpactEvents, 
        isLoading: { events: false }, 
        hasError: { events: false },
        newsData: [],
        fetchHighImpactEvents: jest.fn()
      }}>
        <HighImpactEvents />
      </FinancialDataContext.Provider>
    );
    
    // Cliquer sur l'événement 1
    const event1 = screen.getByText('Événement test 1').closest('.event-card');
    fireEvent.click(event1);
    
    // Vérifier que l'événement 1 est développé
    expect(event1).toHaveClass('expanded');
    
    // Cliquer à nouveau pour réduire
    fireEvent.click(event1);
    
    // Vérifier que l'événement 1 n'est plus développé
    expect(event1).not.toHaveClass('expanded');
  });
  
  test('le bouton d\'actualisation appelle fetchHighImpactEvents', () => {
    const mockFetchEvents = jest.fn();
    const mockNewsData = [{ title: "Test News" }];
    
    render(
      <FinancialDataContext.Provider value={{ 
        highImpactEvents: mockHighImpactEvents, 
        isLoading: { events: false }, 
        hasError: { events: false },
        newsData: mockNewsData,
        fetchHighImpactEvents: mockFetchEvents
      }}>
        <HighImpactEvents />
      </FinancialDataContext.Provider>
    );
    
    // Cliquer sur le bouton d'actualisation
    const refreshButton = screen.getByTitle('Actualiser les événements');
    fireEvent.click(refreshButton);
    
    // Vérifier que la fonction a été appelée avec les actualités
    expect(mockFetchEvents).toHaveBeenCalledWith(mockNewsData);
  });
});
