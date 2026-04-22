import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './index.css';
import AuthSelector from './components/AuthSelector';
import VoterFlow from './components/VoterFlow';
import ManagementFlow from './components/ManagementFlow';
import { API_URL } from './config';

function App() {
  const { t, i18n } = useTranslation();
  
  const [isWakingBackend, setIsWakingBackend] = useState(true);
  const [wakeTimeout, setWakeTimeout] = useState(false);
  const [factIndex, setFactIndex] = useState(0);

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

  // Backend Wake-up Sequence
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_URL}/voting/constituencies`);
        if (res.ok) {
          setIsWakingBackend(false);
          return;
        }
      } catch (e) {
        // Backend is likely sleeping and request failed
      }
      setTimeout(checkBackend, 3000);
    };

    const tId = setTimeout(() => setWakeTimeout(true), 3000);
    checkBackend();

    return () => clearTimeout(tId);
  }, []);

  // Engaging Loading Facts
  useEffect(() => {
    if (isWakingBackend) {
      const interval = setInterval(() => {
        setFactIndex(prev => (prev + 1) % 4);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [isWakingBackend]);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en');
  };

  const handleManagementLogin = (data) => {
    setManagementSession(data);
  };

  const handleLogout = async (role) => {
    if (role === 'officer' && managementSession?.constituency_id) {
      try {
        await fetch(`${API_URL}/verification/officer/toggle`, {
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

  if (isWakingBackend) {
    const loadingFacts = [
      t('fact_1', 'Did you know? Cryptographic verification ensures your vote cannot be tampered with.'),
      t('fact_2', 'Our VVPAT system generates a secure paper trail for every digital vote cast.'),
      t('fact_3', 'Zero-knowledge proofs allow us to verify votes without revealing identities.'),
      t('fact_4', 'Establishing encrypted tunnels to distributed server clusters...')
    ];

    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(to bottom, #0f172a, #020617)' }}>
        <div style={{ textAlign: 'center', maxWidth: '600px', padding: '2rem' }}>
          <div className="scanner-line" style={{ position: 'relative', width: '200px', height: '4px', background: 'rgba(56, 189, 248, 0.2)', margin: '0 auto 3rem auto', overflow: 'hidden', borderRadius: '2px' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '30%', background: '#38bdf8', animation: 'slide 1.5s infinite ease-in-out' }}></div>
          </div>
          
          <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('connecting_secure', 'Establishing Secure Connection...')}
          </h1>
          
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', minHeight: '60px', transition: 'opacity 0.5s' }}>
            {loadingFacts[factIndex]}
          </p>

          {wakeTimeout && (
            <div className="animate-fade-in" style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px' }}>
              <p style={{ color: '#fcd34d', margin: 0, fontSize: '0.9rem' }}>
                <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>⏳</span>
                {t('waking_backend', 'Waking up secure environment. This may take up to 60 seconds on the first load to initialize cold storage...')}
              </p>
            </div>
          )}
        </div>
        <style>{`@keyframes slide { 0% { left: -30%; } 100% { left: 100%; } }`}</style>
      </div>
    );
  }

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
          title={t('refresh', 'Refresh App')}
        >
          <span>🔄</span> {t('refresh', 'Refresh')}
        </button>
        <button className="btn btn-secondary" onClick={toggleLanguage} style={{ padding: '0.5rem 1rem' }}>
          {i18n.language === 'en' ? 'हिन्दी' : 'English'}
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
      
      {/* Footer */}
      <footer style={{
        padding: '1rem', textAlign: 'center', background: 'rgba(0,0,0,0.8)', borderTop: '1px solid rgba(255,255,255,0.05)',
        color: 'var(--text-secondary)', fontSize: '0.9rem', zIndex: 10
      }}>
        <p style={{ margin: 0 }}>&copy; {new Date().getFullYear()} DVT Digital Voting Technology. All rights reserved.</p>
        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', opacity: 0.6 }}>Secure. Transparent. Verifiable.</p>
      </footer>
    </div>
  );
}

export default App;
