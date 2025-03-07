// src/components/HighImpactEvents.jsx
import React, { useState } from 'react';
import { useFinancialDataContext } from '../contexts/FinancialDataContext';
import { LoadingSkeleton } from './ui/LoadingSkeleton';
import { ErrorMessage } from './ui/ErrorMessage';

/**
 * Composant qui affiche les événements du jour à fort impact sur les marchés
 */
export const HighImpactEvents = () => {
  const { 
    highImpactEvents, 
    isLoading, 
    hasError,
    fetchHighImpactEvents,
    newsData
  } = useFinancialDataContext();

  const [expandedEvent, setExpandedEvent] = useState(null);

  // Fonction pour basculer l'état déplié d'un événement
  const toggleEvent = (eventId) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };

  // Fonction pour obtenir la classe CSS en fonction du score d'impact
  const getImpactClass = (score) => {
    if (score >= 8) return 'critical-impact';
    if (score >= 6) return 'high-impact';
    if (score >= 4) return 'medium-impact';
    return 'low-impact';
  };

  // Fonction pour obtenir l'icône en fonction du type de marché
  const getMarketIcon = (marketType) => {
    switch (marketType.toLowerCase()) {
      case 'actions':
      case 'stock':
      case 'stocks':
        return 'fa-chart-line';
      case 'etf':
      case 'etfs':
        return 'fa-layer-group';
      case 'crypto':
      case 'cryptocurrency':
        return 'fa-bitcoin-sign';
      case 'forex':
        return 'fa-money-bill-transfer';
      case 'commodities':
      case 'matières premières':
        return 'fa-gas-pump';
      default:
        return 'fa-chart-pie';
    }
  };

  // Rendu en cas de chargement
  if (isLoading.events) {
    return (
      <section className="events-section">
        <h2><i className="fas fa-bolt"></i> Événements à fort impact aujourd'hui</h2>
        <div className="events-container">
          <LoadingSkeleton type="events" count={5} />
        </div>
      </section>
    );
  }

  // Rendu en cas d'erreur
  if (hasError.events) {
    return (
      <section className="events-section">
        <h2><i className="fas fa-bolt"></i> Événements à fort impact aujourd'hui</h2>
        <div className="events-container">
          <ErrorMessage 
            message="Impossible d'analyser les événements à fort impact" 
            retryAction={() => newsData?.length > 0 && fetchHighImpactEvents(newsData)}
          />
        </div>
      </section>
    );
  }

  // Rendu si aucun événement n'est disponible
  if (!highImpactEvents || highImpactEvents.length === 0) {
    return (
      <section className="events-section">
        <h2><i className="fas fa-bolt"></i> Événements à fort impact aujourd'hui</h2>
        <div className="events-container">
          <div className="events-empty">
            Aucun événement à fort impact identifié aujourd'hui
          </div>
        </div>
      </section>
    );
  }

  // Rendu principal des événements à fort impact
  return (
    <section className="events-section" data-testid="high-impact-events">
      <div className="section-header">
        <h2><i className="fas fa-bolt"></i> Événements à fort impact aujourd'hui</h2>
        <div className="section-controls">
          <button 
            className="refresh-button" 
            onClick={() => fetchHighImpactEvents(newsData)}
            title="Actualiser les événements"
          >
            <i className="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <div className="events-container">
        {highImpactEvents.map((event, index) => (
          <div 
            key={`event-${index}`}
            className={`event-card ${getImpactClass(event.impactScore)} ${expandedEvent === index ? 'expanded' : ''}`}
            onClick={() => toggleEvent(index)}
            data-testid={`event-${index}`}
          >
            <div className="event-header">
              <div className="event-title">
                <i className={`fas ${getMarketIcon(event.marketType)}`}></i>
                <h3>{event.title}</h3>
              </div>
              <div className="event-score">
                <div className="impact-label">Impact</div>
                <div className="impact-value">{event.impactScore}/10</div>
              </div>
            </div>

            <div className="event-details">
              <div className="event-info">
                <span className="event-market-type">{event.marketType}</span>
                <span className="event-timing">{event.timing}</span>
              </div>
              
              <p className="event-explanation">{event.explanation}</p>

              <div className="event-symbols">
                <span className="symbols-label">Symboles affectés:</span>
                <div className="symbols-list">
                  {event.affectedSymbols.map((symbol, symbolIndex) => (
                    <span key={`symbol-${symbolIndex}`} className="symbol-tag">
                      {symbol}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
