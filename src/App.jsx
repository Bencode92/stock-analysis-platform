// src/App.jsx
import React, { useState } from 'react';
import { FinancialDataProvider } from './contexts/FinancialDataContext';
import { NewsSection } from './components/NewsSection';
import { SectorsSection } from './components/SectorsSection';
import { PortfolioSection } from './components/PortfolioSection';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Notification } from './components/ui/Notification';
import './styles/main.css';

/**
 * Composant principal de l'application
 * Utilise le provider de données financières pour tous les composants enfants
 */
function App() {
  const [notifications, setNotifications] = useState([]);
  
  // Fonction pour afficher une notification
  const showNotification = (message, type = 'success', duration = 5000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Supprimer la notification après la durée spécifiée
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(notif => notif.id !== id));
      }, duration);
    }
    
    return id;
  };
  
  // Fonction pour supprimer une notification
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };
  
  return (
    <FinancialDataProvider>
      <div className="app-container">
        <Header 
          showNotification={showNotification} 
        />
        
        <main className="main-content">
          <NewsSection />
          <SectorsSection />
          <PortfolioSection />
          <Footer />
        </main>
        
        {/* Affichage des notifications */}
        <div className="notifications-container">
          {notifications.map(({ id, message, type }) => (
            <Notification 
              key={id}
              message={message}
              type={type}
              onClose={() => removeNotification(id)}
            />
          ))}
        </div>
      </div>
    </FinancialDataProvider>
  );
}

export default App;
