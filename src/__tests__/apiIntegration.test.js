// src/__tests__/apiIntegration.test.js
// Tests d'intégration pour vérifier la connectivité avec Perplexity et Claude

import { perplexityService, claudeService } from '../../services/api';
import { CacheService } from '../../services/cacheService';

// Simuler fetch pour les tests
global.fetch = jest.fn();

describe('API Integration Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Perplexity MCP API', () => {
    test('getFinancialNews fetches actualités d\'aujourd\'hui', async () => {
      const mockData = [
        {
          title: "Actualité financière importante",
          source: "Bloomberg",
          summary: "Résumé de l'actualité",
          impact: 40,
          sentiment: "positive",
          timestamp: new Date().toISOString()
        }
      ];
      
      // Mock de la réponse API
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(mockData)
              }
            }
          ]
        })
      });
      
      const result = await perplexityService.getFinancialNews();
      
      // Vérifier que l'appel API a bien été effectué
      expect(fetch).toHaveBeenCalledTimes(1);
      
      // Vérifier que la requête API contient les termes "AUJOURD'HUI"
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('AUJOURD\'HUI');
      expect(requestBody.messages[0].content).toContain('Ne prends PAS en compte les actualités des jours précédents');
      
      // Vérifier que le modèle utilisé est celui avec navigation web
      expect(requestBody.model).toBe("sonar-medium-online");
      
      // Vérifier le résultat
      expect(result).toEqual(mockData);
    });
    
    test('analyzeSectors analyse en fonction des actualités du jour', async () => {
      const mockNews = [
        {
          title: "Actualité importante",
          source: "Reuters",
          summary: "Résumé"
        }
      ];
      
      const mockSectors = {
        bullish: [{ name: "Tech", reason: "Raison" }],
        bearish: [{ name: "Finance", reason: "Raison" }]
      };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(mockSectors)
              }
            }
          ]
        })
      });
      
      const result = await perplexityService.analyzeSectors(mockNews);
      
      // Vérifier la requête
      expect(fetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('AUJOURD\'HUI');
      
      // Vérifier le résultat
      expect(result).toEqual(mockSectors);
    });
  });
  
  describe('Claude API', () => {
    test('generateOptimizedPortfolio produit un portefeuille adapté aux actualités du jour', async () => {
      const mockNews = [{ title: "Test", source: "Test", summary: "Test" }];
      const mockSectors = { bullish: [], bearish: [] };
      const mockInstruments = { stocks: [], etfs: [], cryptos: [] };
      
      const mockPortfolio = [
        {
          name: "Test Stock",
          symbol: "TEST",
          type: "stock",
          allocation: 50,
          reason: "Raison basée sur l'actualité du jour"
        }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify(mockPortfolio)
            }
          ]
        })
      });
      
      const result = await claudeService.generateOptimizedPortfolio(
        mockNews,
        mockSectors,
        mockInstruments
      );
      
      // Vérifier la requête
      expect(fetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('AUJOURD\'HUI');
      
      // Vérifier que la raison inclut un horodatage
      expect(result[0].reason).toContain('(Analyse à');
      
      // Vérifier que le modèle utilisé est Claude 3 Opus
      expect(requestBody.model).toBe("claude-3-opus-20240229");
    });
  });
  
  describe('Cache Service', () => {
    test('Le cache est utilisé pour les données qui changent moins fréquemment', async () => {
      // Créer une instance du service de cache
      const cache = new CacheService();
      
      // Simuler localStorage
      const mockLocalStorage = {};
      
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: jest.fn((key) => mockLocalStorage[key] || null),
          setItem: jest.fn((key, value) => { mockLocalStorage[key] = value; }),
          removeItem: jest.fn((key) => { delete mockLocalStorage[key]; })
        },
        writable: true
      });
      
      // Espionner les méthodes de cache
      jest.spyOn(cache, 'get');
      jest.spyOn(cache, 'set');
      
      // Simuler une requête d'actualités (qui ne devrait pas être mise en cache)
      const mockNewsResp = { choices: [{ message: { content: '[]' } }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockNewsResp
      });
      
      await perplexityService.getFinancialNews();
      
      // Simuler une requête de secteurs (qui devrait être mise en cache)
      const mockSectorsResp = { choices: [{ message: { content: '{"bullish":[],"bearish":[]}' } }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectorsResp
      });
      
      // Première requête de secteurs
      await perplexityService.analyzeSectors([]);
      
      // Vérifier que le cache a été utilisé
      expect(window.localStorage.setItem).toHaveBeenCalled();
      
      // Déclencher une deuxième requête de secteurs (devrait utiliser le cache)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectorsResp
      });
      
      await perplexityService.analyzeSectors([]);
      
      // Vérifier que le fetch n'a pas été appelé une deuxième fois
      expect(fetch).toHaveBeenCalledTimes(2); // Une fois pour news, une fois pour la première requête de secteurs
    });
  });
});
