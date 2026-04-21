import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './index.css';
import AuthSelector from './components/AuthSelector';
import VoterFlow from './components/VoterFlow';
import ManagementFlow from './components/ManagementFlow';

function App() {
  const { i18n } = useTranslation();
  
  const [managementSession, setManagementSession] = useState(() => {
    const saved = localStorage.getItem('dvt_session');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [publicVotingMode, setPublicVotingMode] = useState(() => {
    return localStorage.getItem('dvt_voting_mode') === 'true';
  });
  
  const [authView, setAuthView] = useState({ view: 'select', role: '', user: '' });

  useEffect(() => {
    if (managementSession) {
      localStorage.setItem('dvt_session', JSON.stringify(managementSession));
    } else {
      localStorage.removeItem('dvt_session');
    }
  }, [managementSession]);

  useEffect(() => {
    localStorage.setItem('dvt_voting_mode', publicVotingMode);
  }, [publicVotingMode]);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en');
  };

  const handleManagementLogin = (data) => {
    setManagementSession(data);
  };

  const handleLogout = async (role) => {
    if (role === 'officer' && managementSession?.constituency_id) {
      try {
        await fetch('http://localhost:8000/api/verification/officer/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            constituency_id: managementSession.constituency_id,
            is_active: false
          })
        });
      } catch (e) {
        console.error(e);
      }
    }
    setManagementSession(null);
    setAuthView({ view: 'role_select', role: '', user: '' });
  };

  const handleBack = (role, user) => {
    setManagementSession(null);
    setAuthView({ view: 'login', role: role, user: user });
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ 
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', 
        padding: '1rem 2rem', gap: '10px', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <button 
          onClick={() => window.location.reload()} 
          className="btn btn-secondary"
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          title="Refresh App"
        >
          <span>⟳</span> Refresh
        </button>
        <button className="btn btn-secondary" onClick={toggleLanguage} style={{ padding: '0.5rem 1rem' }}>
          {i18n.language === 'en' ? 'हिंदी' : 'English'}
        </button>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {!managementSession && !publicVotingMode ? (
          <AuthSelector 
            onManagementLogin={handleManagementLogin} 
            onEnterPublicVoting={() => setPublicVotingMode(true)} 
            initialView={authView.view}
            initialRole={authView.role}
            initialUser={authView.user}
          />
        ) : publicVotingMode ? (
          <VoterFlow onExit={() => setPublicVotingMode(false)} />
        ) : (
          <ManagementFlow 
             managementSession={managementSession} 
             onLogout={() => handleLogout(managementSession.role)} 
             onBack={() => handleBack(managementSession.role, managementSession.username)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
