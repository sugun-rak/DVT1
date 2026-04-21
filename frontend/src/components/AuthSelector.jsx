import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const CAROUSEL_SLIDES = [
  { title: "Digital India", text: "Empowering every citizen with secure, transparent voting." },
  { title: "Your Vote Matters", text: "Participate in shaping the future of our democracy." },
  { title: "Fast & Secure", text: "State-of-the-art encryption ensures your vote remains confidential." }
];

export default function AuthSelector({ onManagementLogin, onEnterPublicVoting, initialView = 'select', initialRole = '', initialUser = '' }) {
  const { t } = useTranslation();
  const [view, setView] = useState(initialView); // select, role_select, login

  const [selectedRole, setSelectedRole] = useState(initialRole); // 'superadmin', 'admin', 'officer'
  const [pinUser, setPinUser] = useState(initialUser);
  const [pinValue, setPinValue] = useState('');
  const [constituencies, setConstituencies] = useState([]);
  
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const API_URL = 'http://localhost:8000/api';

  useEffect(() => {
    setView(initialView);
    setSelectedRole(initialRole);
    setPinUser(initialUser);
  }, [initialView, initialRole, initialUser]);

  useEffect(() => {
    if (view === 'select') {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
      }, 7000);
      return () => clearInterval(interval);
    } else if (view === 'role_select') {
      fetch(`${API_URL}/voting/constituencies`)
        .then(res => res.json())
        .then(data => setConstituencies(data))
        .catch(err => console.error(err));
    }
  }, [view]);

  // Keyboard Event Listener for PIN Pad
  const handleKeyDown = useCallback((e) => {
    if (view !== 'login') return;
    
    if (e.key >= '0' && e.key <= '9') {
      if (pinValue.length < 4) {
        setPinValue(prev => prev + e.key);
      }
    } else if (e.key === 'Backspace') {
      setPinValue(prev => prev.slice(0, -1));
    } else if (e.key === 'Enter' && pinValue.length === 4) {
      submitLogin(e);
    }
  }, [view, pinValue, pinUser, selectedRole]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handlePinDigit = (digit) => {
    if (pinValue.length < 4) setPinValue(prev => prev + digit);
  };

  const handlePinDelete = () => {
    setPinValue(prev => prev.slice(0, -1));
  };

  const proceedToLogin = () => {
    if (!selectedRole) {
      setError("Please select a role.");
      return;
    }
    if (selectedRole === 'officer' && !pinUser) {
      setError("Please select an assigned area.");
      return;
    }
    setError(null);
    if (selectedRole === 'superadmin') setPinUser('superadmin');
    if (selectedRole === 'admin') setPinUser('admin');
    setView('login');
  };

  const submitLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let endpoint = '';
      if (selectedRole === 'officer') {
          endpoint = '/verification/officer/login';
      } else {
          // Both admin and superadmin use the admin login for now, we'll verify username
          endpoint = '/verification/admin/login'; 
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pinUser, pin: pinValue })
      });
      const data = await res.json();
      if (res.ok) {
        // If they logged in as superadmin, make sure they actually used the superadmin account
        if (selectedRole === 'superadmin' && pinUser !== 'superadmin') {
            setError("Invalid super admin credentials.");
            setPinValue('');
            setLoading(false);
            return;
        }
        
        onManagementLogin({ ...data, role: selectedRole, username: pinUser });
      } else {
        setError(data.error);
        setPinValue('');
      }
    } catch (err) {
      setError("Failed to login.");
      setPinValue('');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'select') {
    return (
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
        <div className="carousel-container">
          {CAROUSEL_SLIDES.map((slide, idx) => (
            <div key={idx} className={`carousel-slide ${idx === currentSlide ? 'active' : ''}`}>
              <h2 className="carousel-title">{slide.title}</h2>
              <p className="carousel-text">{slide.text}</p>
            </div>
          ))}
        </div>

        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗳️</div>
          <h2 style={{ marginBottom: '2rem', fontSize: '2rem' }}>{t('app_title', 'Digital Voting System')}</h2>
          <div className="action-buttons" style={{ flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => { setView('role_select'); setError(null); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                📊 Management Portal
              </button>
              <button className="btn btn-primary" onClick={onEnterPublicVoting} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                🗳️ Public Voting Booth
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'role_select') {
      return (
          <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
              <button className="btn-secondary" onClick={() => setView('select')} style={{ padding: '0.2rem 0.5rem', marginBottom: '1rem', float: 'left' }}>←</button>
              <h2 style={{ marginBottom: '1.5rem', clear: 'both' }}>Select Management Role</h2>
              
              <div className="input-group">
                  <label>Role</label>
                  <select className="input-field" value={selectedRole} onChange={e => { setSelectedRole(e.target.value); setPinUser(''); setError(null); }}>
                      <option value="">-- Select Role --</option>
                      <option value="officer">Polling Officer</option>
                      <option value="admin">General Admin</option>
                      <option value="superadmin">Super Admin</option>
                  </select>
              </div>

              {selectedRole === 'officer' && (
                  <div className="input-group">
                      <label>Assigned Area (Constituency)</label>
                      <select className="input-field" value={pinUser} onChange={e => setPinUser(e.target.value)}>
                          <option value="">-- Choose Constituency --</option>
                          {constituencies.map(c => (
                              <option key={c.id} value={`officer_${c.id}`}>{c.name}</option>
                          ))}
                      </select>
                  </div>
              )}

              {error && <p style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>}

              <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={proceedToLogin}>
                  Proceed to Login
              </button>
          </div>
      );
  }

  if (view === 'login') {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '350px', margin: '0 auto', textAlign: 'center' }}>
        <button className="btn-secondary" onClick={() => setView('role_select')} style={{ padding: '0.2rem 0.5rem', marginBottom: '1rem', float: 'left' }}>←</button>
        <h2 style={{ marginBottom: '1.5rem', clear: 'both' }}>{selectedRole === 'officer' ? 'Officer Setup' : 'Admin Login'}</h2>
        
        <div className="input-group">
            <label>{selectedRole === 'officer' ? 'Assigned Area ID' : 'Username'}</label>
            <input type="text" className="input-field" value={pinUser} disabled />
        </div>

        <div className="input-group">
          <label>{t('enter_pin', 'Enter PIN')}</label>
          <div className="input-field" style={{ 
            fontSize: '2rem', letterSpacing: '10px', height: '50px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderColor: 'var(--primary-color)', boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.2)',
            marginBottom: '1rem', background: 'rgba(255,255,255,0.05)'
          }}>
            {pinValue.split('').map(() => '•').join('')}
            {pinValue.length < 4 && <span className="cursor-blink" style={{ width: '2px', height: '30px', background: 'var(--primary-color)', marginLeft: '5px', animation: 'blink 1s step-end infinite' }}></span>}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>(You can use your physical keyboard)</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} type="button" className="btn btn-secondary" onClick={() => handlePinDigit(num.toString())} style={{ padding: '1rem', fontSize: '1.2rem' }}>{num}</button>
          ))}
          <button type="button" className="btn btn-secondary" onClick={handlePinDelete} style={{ padding: '1rem', fontSize: '1.2rem' }}>⌫</button>
          <button type="button" className="btn btn-secondary" onClick={() => handlePinDigit('0')} style={{ padding: '1rem', fontSize: '1.2rem' }}>0</button>
          <button type="button" className="btn btn-primary" onClick={submitLogin} disabled={loading || pinValue.length !== 4} style={{ padding: '1rem', fontSize: '1.2rem' }}>✓</button>
        </div>

        {error && <p style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>}
      </div>
    );
  }

  return null;
}
