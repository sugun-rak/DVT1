import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';
import heroBg from '../assets/hero-bg.png';
import logo from '../assets/logo.png';
import GuestRegistration from './GuestRegistration';

const CAROUSEL_SLIDES = [
  { title: "Digital Democracy", text: "Empowering every citizen with secure, transparent, and instantly verifiable voting technology." },
  { title: "Your Voice, Secured", text: "State-of-the-art cryptographic encryption ensures your vote remains strictly confidential." },
  { title: "The Future of Elections", text: "Experience the next generation of civic participation with our seamless digital kiosks." }
];

export default function AuthSelector({ onManagementLogin, onEnterPublicVoting, initialView = 'select', initialRole = '', initialUser = '' }) {
  const { t } = useTranslation();
  const [view, setView] = useState(initialView);

  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [pinUser, setPinUser] = useState(initialUser);
  const [pinValue, setPinValue] = useState('');
  const [constituencies, setConstituencies] = useState([]);
  
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    setView(initialView);
    setSelectedRole(initialRole);
    setPinUser(initialUser);
  }, [initialView, initialRole, initialUser]);

  useEffect(() => {
    if (view === 'select') {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
      }, 5000);
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
      <div className="animate-fade-in" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', position: 'relative', padding: '4rem 1rem 2rem 1rem' }}>
        {/* Stunning Hero Background */}
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.6, zIndex: -1 }}></div>
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 1))', zIndex: -1 }}></div>

        {/* Premium Logo and Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', zIndex: 1, padding: '0' }}>
          <img src={logo} alt="DVT Logo" style={{ height: '80px', marginBottom: '1rem', filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.5))', borderRadius: '15px' }} />
          <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: '800', background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, letterSpacing: '-1px' }}>
            {t('app_title', 'Digital Voting System')}
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 4vw, 1.2rem)', color: 'var(--text-secondary)', marginTop: '1rem', maxWidth: '600px', margin: '1rem auto 0' }}>
            The next generation of secure, verifiable, and transparent democratic technology.
          </p>
        </div>

        {/* Enhanced Glassmorphism Carousel */}
        <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', padding: '0', display: 'flex', flexWrap: 'wrap', overflow: 'hidden', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', zIndex: 1, marginBottom: '2rem' }}>
          <div style={{ flex: '1 1 300px', position: 'relative', padding: '2rem', background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.05)', minHeight: '280px' }}>
            <div className="carousel-container" style={{ height: '100%', display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              {CAROUSEL_SLIDES.map((slide, idx) => (
                <div key={idx} className={`carousel-slide ${idx === currentSlide ? 'active' : ''}`} style={{ transition: 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)', position: 'absolute', width: '90%', opacity: idx === currentSlide ? 1 : 0 }}>
                  <h2 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', color: '#fff', marginBottom: '0.8rem', fontWeight: 'bold' }}>{slide.title}</h2>
                  <p style={{ fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', lineHeight: '1.5' }}>{slide.text}</p>
                </div>
              ))}
            </div>
            {/* Carousel Indicators */}
            <div style={{ position: 'absolute', bottom: '1.5rem', left: '2rem', display: 'flex', gap: '8px' }}>
              {CAROUSEL_SLIDES.map((_, idx) => (
                <div key={idx} style={{ height: '4px', width: idx === currentSlide ? '32px' : '16px', background: idx === currentSlide ? '#38bdf8' : 'rgba(255,255,255,0.2)', borderRadius: '2px', transition: 'all 0.4s ease' }} />
              ))}
            </div>
          </div>

          <div style={{ flex: '1 1 300px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}>
            <h3 style={{ fontSize: 'clamp(1rem, 3vw, 1.2rem)', color: '#fff', marginBottom: '1.5rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>{t('select_portal', 'Select Portal')}</h3>
            <button className="btn btn-primary" onClick={onEnterPublicVoting} style={{ padding: '1.2rem', fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', background: 'linear-gradient(135deg, #0284c7, #3b82f6)', border: 'none', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)', borderRadius: '12px', transition: 'transform 0.2s, box-shadow 0.2s' }}>
              <span style={{ fontSize: '1.4rem' }}>🗳️</span> {t('public_voting_booth', 'Public Voting Booth')}
            </button>
            <button className="btn btn-secondary" onClick={() => { setView('role_select'); setError(null); }} style={{ padding: '1.2rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', transition: 'transform 0.2s, background 0.2s' }}>
              <span style={{ fontSize: '1.4rem' }}>📊</span> {t('management_portal', 'Management Portal')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'role_select') {
      return (
          <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
              <button className="btn-secondary" onClick={() => setView('select')} style={{ padding: '0.2rem 0.5rem', marginBottom: '1rem', float: 'left' }}>←</button>
              <h2 style={{ marginBottom: '1.5rem', clear: 'both' }}>{t('select_management_role', 'Select Management Role')}</h2>
              
              <div className="input-group">
                  <label>{t('role', 'Role')}</label>
                  <select className="input-field" value={selectedRole} onChange={e => { setSelectedRole(e.target.value); setPinUser(''); setError(null); }}>
                      <option value="">-- {t('role', 'Role')} --</option>
                      <option value="officer">{t('polling_officer', 'Polling Officer')}</option>
                      <option value="admin">{t('general_admin', 'General Admin')}</option>
                      <option value="superadmin">{t('super_admin', 'Super Admin')}</option>
                  </select>
              </div>

              {selectedRole === 'officer' && (
                  <div className="input-group">
                      <label>{t('assigned_area', 'Assigned Area (Constituency)')}</label>
                      <select className="input-field" value={pinUser} onChange={e => setPinUser(e.target.value)}>
                          <option value="">{t('choose_constituency', '-- Choose Constituency --')}</option>
                          {constituencies.map(c => (
                              <option key={c.id} value={`officer_${c.id}`}>{c.name}</option>
                          ))}
                      </select>
                  </div>
              )}

              {error && <p style={{ color: 'var(--error-color)', marginTop: '1rem' }}>{error}</p>}
              
              <button className="btn btn-primary" onClick={proceedToLogin} style={{ width: '100%', marginTop: '1.5rem' }}>{t('proceed', 'Proceed')}</button>
              
              <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.8rem' }}>Beta Testing Program</p>
                  <button className="btn btn-secondary" onClick={() => setView('guest_register')} style={{ width: '100%', fontSize: '0.9rem', padding: '0.8rem' }}>
                    Register for Guest Access
                  </button>
              </div>
          </div>
      );
  }

  if (view === 'guest_register') {
      return <GuestRegistration onBack={() => setView('role_select')} />;
  }

  if (view === 'login') {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '350px', margin: '0 auto', textAlign: 'center' }}>
        <button className="btn-secondary" onClick={() => setView('role_select')} style={{ padding: '0.2rem 0.5rem', marginBottom: '1rem', float: 'left' }}>←</button>
        <h2 style={{ marginBottom: '1.5rem', clear: 'both' }}>{selectedRole === 'officer' ? t('officer_setup', 'Officer Setup') : t('admin_login', 'Admin Login')}</h2>
        
        <div className="input-group">
            <label>{selectedRole === 'officer' ? t('assigned_area_id', 'Assigned Area ID') : t('username', 'Username')}</label>
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
