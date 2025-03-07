// src/hooks/useFinancialData.js
import { useState, useEffect, useCallback } from 'react';
import { perplexityService, claudeService } from '../../services/api';
import { marketEventsService } from '../../services/marketEventsService';

/**
 * Hook personnalisé pour gérer les données financières en temps réel
 * Centralise la logique de chargement des actualités, secteurs et portefeuille
 */
export function useFinancialData() {
  // États pour stocker les données
  const [newsData, setNewsData] = useState([]);
  const [sectorData, setSectorData] = useState({ bullish: [], bearish: [] });
  const [financialInstruments, setFinancialInstruments] = useState({ 
    stocks: [], 
    etfs: [], 
    cryptos: [] 
  });
  const [portfolioData, setPortfolioData] = useState([]);
  const [highImpactEvents, setHighImpactEvents] = useState([]);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  
  // États pour les chargements et erreurs
  const [isLoading, setIsLoading] = useState({
    news: true,
    sectors: true,
    instruments: true,
    portfolio: true,
    events: true
  });
  
  const [hasError, setHasError] = useState({
    news: false,
    sectors: false,
    instruments: false,
    portfolio: false,
    events: false
  });
  
  // Fonction pour récupérer les actualités
  const fetchNews = useCallback(async () => {
    setIsLoading(prev => ({ ...prev, news: true }));
    setHasError(prev => ({ ...prev, news: false }));
    
    try {
      console.log("Récupération des actualités financières en temps réel...");
      const news = await perplexityService.getFinancialNews();
      console.log(`Actualités récupérées: ${news.length}`);
      setNewsData(news);
      return news;
    } catch (error) {
      console.error('Erreur lors de la récupération des actualités:', error);
      setHasError(prev => ({ ...prev, news: true }));
      throw error;
    } finally {
      setIsLoading(prev => ({ ...prev, news: false }));
    }
  }, []);
  
  // Fonction pour récupérer l'analyse sectorielle
  const fetchSectorAnalysis = useCallback(async (news) => {
    setIsLoading(prev => ({ ...prev, sectors: true }));
    setHasError(prev => ({ ...prev, sectors: false }));
    
    try {
      console.log("Analyse des secteurs en cours...");
      const sectors = await perplexityService.analyzeSectors(news);
      console.log(`Secteurs analysés: ${sectors.bullish.length} haussiers, ${sectors.bearish.length} baissiers`);
      setSectorData(sectors);
      return sectors;
    } catch (error) {
      console.error('Erreur lors de l\'analyse sectorielle:', error);
      setHasError(prev => ({ ...prev, sectors: true }));
      throw error;
    } finally {
      setIsLoading(prev => ({ ...prev, sectors: false }));
    }
  }, []);
  
  // Fonction pour récupérer les instruments financiers
  const fetchFinancialInstruments = useCallback(async (news) => {
    setIsLoading(prev => ({ ...prev, instruments: true }));
    setHasError(prev => ({ ...prev, instruments: false }));
    
    try {
      console.log("Récupération des instruments financiers...");
      const instruments = await perplexityService.getFinancialInstruments(news);
      console.log(`Instruments récupérés: ${instruments.stocks.length} actions, ${instruments.etfs.length} ETFs, ${instruments.cryptos.length} cryptos`);
      setFinancialInstruments(instruments);
      return instruments;
    } catch (error) {
      console.error('Erreur lors de la récupération des instruments financiers:', error);
      setHasError(prev => ({ ...prev, instruments: true }));
      throw error;
    } finally {
      setIsLoading(prev => ({ ...prev, instruments: false }));
    }
  }, []);
  
  // Fonction pour obtenir les événements à fort impact
  const fetchHighImpactEvents = useCallback(async (news) => {
    setIsLoading(prev => ({ ...prev, events: true }));
    setHasError(prev => ({ ...prev, events: false }));
    
    try {
      console.log("Analyse des événements à fort impact en cours...");
      const events = await marketEventsService.getHighImpactEvents(news);
      console.log(`Événements à fort impact identifiés: ${events.length}`);
      setHighImpactEvents(events);
      return events;
    } catch (error) {
      console.error('Erreur lors de l\'analyse des événements à fort impact:', error);
      setHasError(prev => ({ ...prev, events: true }));
      throw error;
    } finally {
      setIsLoading(prev => ({ ...prev, events: false }));
    }
  }, []);
  
  // Fonction pour générer le portefeuille optimisé
  const generatePortfolio = useCallback(async (news, sectors, instruments) => {
    setIsLoading(prev => ({ ...prev, portfolio: true }));
    setHasError(prev => ({ ...prev, portfolio: false }));
    
    try {
      console.log("Génération du portefeuille optimisé avec Claude...");
      const portfolio = await claudeService.generateOptimizedPortfolio(
        news, 
        sectors, 
        instruments
      );
      
      console.log(`Portefeuille généré: ${portfolio.length} actifs`);
      setPortfolioData(portfolio);
      return portfolio;
    } catch (error) {
      console.error('Erreur lors de la génération du portefeuille:', error);
      setHasError(prev => ({ ...prev, portfolio: true }));
      throw error;
    } finally {
      setIsLoading(prev => ({ ...prev, portfolio: false }));
    }
  }, []);
  
  // Fonction pour rafraîchir toutes les données
  const refreshData = useCallback(async () => {
    try {
      console.log("Rafraîchissement des données financières en cours...");
      
      // Étape 1: Récupérer les actualités
      const news = await fetchNews();
      
      // Étape 2: Récupérer l'analyse sectorielle, les instruments financiers et les événements en parallèle
      const [sectors, instruments, events] = await Promise.all([
        fetchSectorAnalysis(news),
        fetchFinancialInstruments(news),
        fetchHighImpactEvents(news)
      ]);
      
      // Étape 3: Générer le portefeuille optimisé
      await generatePortfolio(news, sectors, instruments);
      
      // Mise à jour de l'heure de dernière actualisation
      const now = new Date();
      setLastUpdateTime(now);
      console.log(`Données mises à jour avec succès: ${now.toLocaleString()}`);
      
      return true;
    } catch (error) {
      console.error('Erreur lors du rafraîchissement des données:', error);
      throw error;
    }
  }, [fetchNews, fetchSectorAnalysis, fetchFinancialInstruments, fetchHighImpactEvents, generatePortfolio]);
  
  // Fonction pour vérifier si les données sont périmées (plus de 15 minutes)
  const areDataStale = useCallback(() => {
    if (!lastUpdateTime) return true;
    
    const now = new Date();
    const diffMs = now - lastUpdateTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    // Considérer les données comme périmées après 15 minutes
    return diffMinutes > 15;
  }, [lastUpdateTime]);
  
  // Charger les données au montage du composant
  useEffect(() => {
    refreshData()
      .catch(error => {
        console.error('Erreur lors du chargement initial des données:', error);
      });
      
    // Rafraîchir automatiquement les données toutes les 15 minutes
    const intervalId = setInterval(() => {
      if (areDataStale()) {
        console.log("Rafraîchissement automatique des données...");
        refreshData()
          .catch(error => {
            console.error('Erreur lors du rafraîchissement automatique:', error);
          });
      }
    }, 15 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [refreshData, areDataStale]);
  
  return {
    // Données
    newsData,
    sectorData,
    financialInstruments,
    portfolioData,
    highImpactEvents,
    lastUpdateTime,
    
    // États
    isLoading,
    hasError,
    areDataStale: areDataStale(),
    
    // Actions
    refreshData,
    fetchNews,
    fetchSectorAnalysis,
    fetchFinancialInstruments,
    fetchHighImpactEvents,
    generatePortfolio
  };
}
