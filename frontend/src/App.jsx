import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './index.css';
import AuthSelector from './components/AuthSelector';
import VoterFlow from './components/VoterFlow';
import ManagementFlow from './components/ManagementFlow';
import { API_URL } from './config';

// ── Tab-isolated storage helpers (sessionStorage = per-tab, survives refresh, not shared across tabs) ──
const ss = {
  get: (k) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  remove: (k) => { try { sessionStorage.removeItem(k); } catch {} },
};

// Fire expiry notification via sendBeacon (survives page close) + fetch fallback
function fireExpiryNotification(guestInfo, expiryMs) {
  if (!guestInfo?.email || !guestInfo?.name) return;
  const payload = JSON.stringify({
    email: guestInfo.email,
    name: guestInfo.name,
    timezone: guestInfo.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: guestInfo.timezoneOffsetMinutes ?? 0,
    expiredAt: String(expiryMs || Date.now())
  });
  const url = `${API_URL}/verification/guest/expired-notify`;
  const beaconOk = navigator.sendBeacon
    ? navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
    : false;
  if (!beaconOk) {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .catch(e => console.error('Expiry notify failed', e));
  }
}

function App() {
  const { t, i18n } = useTranslation();
  
  const [isWakingBackend, setIsWakingBackend] = useState(true);
  const [wakeTimeout, setWakeTimeout] = useState(false);
  const [factIndex, setFactIndex] = useState(0);

  // ── Use sessionStorage so each tab is fully independent again ──
  const [managementSession, setManagementSession] = useState(() => ss.get('dvt_session'));
  const [publicVotingMode, setPublicVotingMode] = useState(() => ss.get('dvt_voting_mode') === true);
  
  const [authView, setAuthView] = useState({ view: 'select', role: '', user: '' });
  const [guestExpiring, setGuestExpiring] = useState(null);
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);
  
  useEffect(() => {
    if (managementSession) ss.set('dvt_session', managementSession);
    else ss.remove('dvt_session');
  }, [managementSession]);

  useEffect(() => {
    ss.set('dvt_voting_mode', publicVotingMode);
  }, [publicVotingMode]);

  // ── Guest Session Auto-Logout (derives timer from JWT exp, which is shared via backend) ──
  useEffect(() => {
    if (!managementSession?.token) { setGuestExpiring(null); return; }

    let payload = null;
    try { payload = JSON.parse(atob(managementSession.token.split('.')[1])); } catch { return; }

    if (!payload?.id?.startsWith('guest_')) { setGuestExpiring(null); return; }

    const expiryMs = payload.exp * 1000;
    const guestInfo = ss.get('dvt_guest_info') || {};

    if (Date.now() >= expiryMs) {
      fireExpiryNotification(guestInfo, expiryMs);
      ss.remove('dvt_guest_info');
      setManagementSession(null);
      setAuthView({ view: 'role_select', role: '', user: '' });
      return;
    }

    const tickerId = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      setGuestExpiring({ secondsLeft: remaining, isExpired: remaining === 0 });
    }, 1000);

    const logoutDelay = Math.max(0, expiryMs - Date.now());
    const logoutId = setTimeout(() => {
      setShowExpiredBanner(true);
      fireExpiryNotification(guestInfo, expiryMs);
      setTimeout(() => {
        setShowExpiredBanner(false);
        ss.remove('dvt_guest_info');
        setManagementSession(null);
        setAuthView({ view: 'role_select', role: '', user: '' });
      }, 4000);
    }, logoutDelay);

    return () => { clearInterval(tickerId); clearTimeout(logoutId); };
  }, [managementSession]);
  // Backend Wake-up Sequence
  useEffect(() => {
    let timeoutId;
    const checkBackend = async () => {
      try {
        const [votingRes, authRes] = await Promise.allSettled([
          fetch(`${API_URL}/voting/constituencies`),
          fetch(`${API_URL}/verification/health`)
        ]);
        if (votingRes.status === 'fulfilled' && votingRes.value.ok && 
            authRes.status === 'fulfilled' && authRes.value.ok) {
          setIsWakingBackend(false);
          return;
        }
      } catch (e) {}
      timeoutId = setTimeout(checkBackend, 8000);
    };

    const tId = setTimeout(() => setWakeTimeout(true), 8000);
    checkBackend();
    return () => { clearTimeout(tId); clearTimeout(timeoutId); };
  }, []);

  // Engaging Loading Facts
  useEffect(() => {
    if (isWakingBackend) {
      const interval = setInterval(() => setFactIndex(prev => (prev + 1) % 4), 4000);
      return () => clearInterval(interval);
    }
  }, [isWakingBackend]);

  const toggleLanguage = () => i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en');

  const handleManagementLogin = (data) => setManagementSession(data);

  const handleLogout = async (role) => {
    if (role === 'officer' && managementSession?.constituency_id) {
      try {
        await fetch(`${API_URL}/verification/officer/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ constituency_id: managementSession.constituency_id, is_active: false })
        });
      } catch (e) { console.error(e); }
    }
    setManagementSession(null);
    setAuthView({ view: 'role_select', role: '', user: '' });
  };

  const handleBack = (role, user) => {
    setManagementSession(null);
    setAuthView({ view: 'login', role, user });
  };

  if (isWakingBackend) {
    const loadingFacts = [
      t('fact_1', 'Did you know? Cryptographic verification ensures your vote cannot be tampered with.'),
      t('fact_2', 'Our VVPAT system generates a secure paper trail for every digital vote cast.'),
      t('fact_3', 'Zero-knowledge proofs allow us to verify votes without revealing identities.'),
      t('fact_4', 'Establishing encrypted tunnels to distributed server clusters...')
    ];
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel animate-fade-in glow-primary" style={{ textAlign: 'center', maxWidth: '600px', padding: '3rem 2rem', borderRadius: '24px' }}>
          <div className="scanner-line" style={{ position: 'relative', width: '200px', height: '4px', background: 'rgba(56, 189, 248, 0.2)', margin: '0 auto 3rem auto', overflow: 'hidden', borderRadius: '2px' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '30%', background: '#38bdf8', animation: 'slide 1.5s infinite ease-in-out', boxShadow: '0 0 20px #38bdf8' }}></div>
          </div>
          <h1 className="font-heading" style={{ fontSize: '2.5rem', marginBottom: '1.5rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('connecting_secure', 'Establishing Secure Connection...')}
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', minHeight: '60px', transition: 'opacity 0.5s', lineHeight: 1.6 }}>
            {loadingFacts[factIndex]}
          </p>
          {wakeTimeout && (
            <div className="animate-fade-in" style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px' }}>
              <p style={{ color: '#fcd34d', margin: 0, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left' }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Guest Session Expiry Banner */}
      {showExpiredBanner && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
          padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '1rem', borderBottom: '2px solid #ef4444'
        }}>
          <span style={{ fontSize: '1.5rem' }}>⏰</span>
          <div>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#fecaca' }}>Demo Session Expired</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#fca5a5' }}>You have been automatically logged out. Check your email for a follow-up notification.</p>
          </div>
        </div>
      )}

      {/* Guest Session Live Countdown Banner */}
      {managementSession && guestExpiring !== null && (
        <div style={{
          padding: '0.4rem 1.5rem',
          background: guestExpiring.secondsLeft > 120 ? 'rgba(34,197,94,0.12)' : guestExpiring.secondsLeft > 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.18)',
          borderBottom: `1px solid ${guestExpiring.secondsLeft > 120 ? 'rgba(34,197,94,0.3)' : guestExpiring.secondsLeft > 60 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.5)'}`,
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', fontSize: '0.85rem'
        }}>
          <span>🔑 Guest Demo Session</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1rem', color: guestExpiring.secondsLeft > 120 ? '#22c55e' : guestExpiring.secondsLeft > 60 ? '#f59e0b' : '#ef4444' }}>
            ⏱ {String(Math.floor(guestExpiring.secondsLeft / 60)).padStart(2,'0')}:{String(guestExpiring.secondsLeft % 60).padStart(2,'0')}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>remaining</span>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '1rem 2rem', gap: '10px', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} title={t('refresh', 'Refresh App')}>
          <span>🔄</span> {t('refresh', 'Refresh')}
        </button>
        <button className="btn btn-secondary" onClick={toggleLanguage} style={{ padding: '0.5rem 1rem' }}>
          {i18n.language === 'en' ? 'हिन्दी' : 'English'}
        </button>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {!managementSession && !publicVotingMode ? (
          <AuthSelector onManagementLogin={handleManagementLogin} onEnterPublicVoting={() => setPublicVotingMode(true)} initialView={authView.view} initialRole={authView.role} initialUser={authView.user} />
        ) : publicVotingMode ? (
          <VoterFlow onExit={() => setPublicVotingMode(false)} />
        ) : (
          <ManagementFlow managementSession={managementSession} onLogout={() => handleLogout(managementSession.role)} onBack={() => handleBack(managementSession.role, managementSession.username)} />
        )}
      </main>
      
      <footer style={{ padding: '1rem', textAlign: 'center', background: 'rgba(0,0,0,0.8)', borderTop: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '0.9rem', zIndex: 10 }}>
        <p style={{ margin: 0 }}>&copy; {new Date().getFullYear()} SUGUN-RAKSHIT-DVS Digital Voting System. All rights reserved.</p>
        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', opacity: 0.6 }}>Secure. Transparent. Verifiable.</p>
      </footer>
    </div>
  );
}

export default App;
