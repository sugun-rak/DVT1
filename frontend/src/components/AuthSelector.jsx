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
          endpoint = '/verification/admin/login'; 
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pinUser, pin: pinValue })
      });
      const data = await res.json();
      if (res.ok) {
        const serverRole = data.role || selectedRole;
        onManagementLogin({ 
          ...data, 
          role: serverRole, 
          username: pinUser,
          constituency_id: data.constituency_id || undefined
        });
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
      <div className="animate-fade-in" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', position: 'relative', padding: '2rem 1rem' }}>
        {/* Background Layer */}
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.3, zIndex: -1 }}></div>
        
        {/* Main Content Area */}
        <div style={{ textAlign: 'center', marginBottom: '3rem', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100px', height: '100px', borderRadius: '24px', background: 'var(--border-color)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-color)', marginBottom: '1.5rem', boxShadow: '0 0 30px rgba(56, 189, 248, 0.2)' }}>
              <img src={logo} alt="DVT Logo" style={{ height: '60px', filter: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.8))' }} />
          </div>
          <h1 className="font-heading" style={{ fontSize: 'clamp(3rem, 8vw, 4.5rem)', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {t('app_title', 'Digital Voting System')}
          </h1>
          <p style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', color: 'var(--text-secondary)', marginTop: '1rem', maxWidth: '650px', margin: '1.5rem auto 0', lineHeight: 1.6 }}>
            The next generation of secure, verifiable, and transparent democratic technology. Experience the future of civic participation.
          </p>
        </div>

        {/* Bento Grid layout for Hero section */}
        <div className="bento-grid" style={{ maxWidth: '1000px', zIndex: 1 }}>
          
          {/* Carousel Bento Card */}
          <div className="glass-panel glow-primary" style={{ position: 'relative', overflow: 'hidden', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              {CAROUSEL_SLIDES.map((slide, idx) => (
                <div key={idx} style={{ 
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                    padding: '3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    opacity: idx === currentSlide ? 1 : 0, transition: 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: idx === currentSlide ? 'auto' : 'none'
                }}>
                  <div style={{ width: '40px', height: '4px', background: 'var(--primary-color)', marginBottom: '1.5rem', borderRadius: '2px', boxShadow: '0 0 10px var(--primary-color)' }}></div>
                  <h2 className="font-heading" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.2rem)', color: 'var(--text-main)', marginBottom: '1rem', fontWeight: '800' }}>{slide.title}</h2>
                  <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6' }}>{slide.text}</p>
                </div>
              ))}
            </div>
            {/* Indicators */}
            <div style={{ padding: '1.5rem 3rem', display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
              {CAROUSEL_SLIDES.map((_, idx) => (
                <div key={idx} style={{ height: '4px', width: idx === currentSlide ? '32px' : '16px', background: idx === currentSlide ? 'var(--primary-color)' : 'rgba(255,255,255,0.2)', borderRadius: '2px', transition: 'all 0.4s ease' }} />
              ))}
            </div>
          </div>

          {/* Actions Bento Card */}
          <div className="glass-panel glow-success" style={{ padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--panel-bg-hover)' }}>
            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <span className="metric-label" style={{ color: 'var(--primary-color)' }}>{t('select_portal', 'Access Portal')}</span>
            </div>
            
            <button className="btn btn-primary" onClick={onEnterPublicVoting} style={{ padding: '1.2rem', fontSize: '1.1rem', marginBottom: '1.5rem', width: '100%', borderRadius: '16px' }}>
              <span style={{ fontSize: '1.5rem' }}>🗳️</span> {t('public_voting_booth', 'Public Voting Booth')}
            </button>
            
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border-color)' }}></div>
                <span style={{ position: 'relative', background: 'var(--panel-inner-bg-solid)', padding: '0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ADMINISTRATION</span>
            </div>

            <button className="btn btn-secondary" onClick={() => { setView('role_select'); setError(null); }} style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%', borderRadius: '16px' }}>
              <span style={{ fontSize: '1.5rem' }}>🛡️</span> {t('management_portal', 'Management Portal')}
            </button>
          </div>
          
        </div>
      </div>
    );
  }

  if (view === 'role_select') {
      return (
          <div className="glass-panel animate-fade-in glow-primary" style={{ padding: '2.5rem', maxWidth: '450px', margin: '0 auto', textAlign: 'center', marginTop: '10vh' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
                  <button className="btn btn-secondary" onClick={() => setView('select')} style={{ padding: '0.5rem 1rem', borderRadius: '100px' }}>⬅️ Back</button>
                  <h2 className="font-heading" style={{ flex: 1, margin: 0, textAlign: 'center' }}>{t('select_management_role', 'Select Role')}</h2>
              </div>
              
              <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                  <label className="metric-label">{t('role', 'System Role')}</label>
                  <select className="input-field" value={selectedRole} onChange={e => { setSelectedRole(e.target.value); setPinUser(''); setError(null); }} style={{ borderRadius: '12px', padding: '1.2rem' }}>
                      <option value="">-- {t('role', 'Select Role')} --</option>
                      <option value="officer">🛂 {t('polling_officer', 'Polling Officer')}</option>
                      <option value="admin">🛡️ {t('general_admin', 'General Admin')}</option>
                      <option value="superadmin">👑 {t('super_admin', 'Super Admin')}</option>
                  </select>
              </div>

              {selectedRole === 'officer' && (
                  <div className="animate-fade-in" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                      <label className="metric-label">{t('assigned_area', 'Assigned Constituency')}</label>
                      <select className="input-field" value={pinUser} onChange={e => setPinUser(e.target.value)} style={{ borderRadius: '12px', padding: '1.2rem' }}>
                          <option value="">{t('choose_constituency', '-- Select Area --')}</option>
                          {constituencies.map(c => (
                              <option key={c.id} value={`officer_${c.id}`}>{c.name}</option>
                          ))}
                      </select>
                  </div>
              )}

              {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error-color)', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{error}</div>}
              
              <button className="btn btn-primary" onClick={proceedToLogin} style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', fontSize: '1.1rem' }}>{t('proceed', 'Proceed to Authentication')}</button>
              
              <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                  <p className="metric-label" style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Beta Testing Program</p>
                  <button className="btn btn-secondary" onClick={() => setView('guest_register')} style={{ width: '100%', padding: '1rem', borderRadius: '12px' }}>
                    Request Guest Access
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
      <div className="glass-panel animate-fade-in glow-primary" style={{ padding: '2.5rem', maxWidth: '400px', margin: '0 auto', textAlign: 'center', marginTop: '10vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
            <button className="btn btn-secondary" onClick={() => setView('role_select')} style={{ padding: '0.5rem 1rem', borderRadius: '100px' }}>⬅️ Back</button>
            <h2 className="font-heading" style={{ flex: 1, margin: 0 }}>{selectedRole === 'officer' ? t('officer_setup', 'Kiosk Setup') : t('admin_login', 'Admin Access')}</h2>
        </div>
        
        <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label className="metric-label">{selectedRole === 'officer' ? t('assigned_area_id', 'Assigned Area ID') : t('username', 'Username')}</label>
            <input type="text" className="input-field" value={pinUser} disabled style={{ background: 'var(--panel-inner-bg)', opacity: 0.7 }} />
        </div>

        <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
          <label className="metric-label">{t('enter_pin', 'Secure PIN')}</label>
          <div className="input-field" style={{ 
            fontSize: '2.5rem', letterSpacing: '12px', height: '70px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderColor: pinValue.length === 4 ? 'var(--success-color)' : 'var(--primary-color)', 
            boxShadow: `0 0 20px ${pinValue.length === 4 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.1)'}`,
            background: 'var(--panel-inner-bg)', borderRadius: '16px', fontFamily: 'Outfit', fontWeight: '800'
          }}>
            {pinValue.split('').map(() => '•').join('')}
            {pinValue.length < 4 && <span style={{ width: '3px', height: '35px', background: 'var(--primary-color)', marginLeft: '8px', animation: 'blink 1s step-end infinite' }}></span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} type="button" className="btn btn-secondary" onClick={() => handlePinDigit(num.toString())} style={{ padding: '1.2rem', fontSize: '1.5rem', borderRadius: '12px', background: 'var(--btn-secondary-bg)' }}>{num}</button>
          ))}
          <button type="button" className="btn btn-secondary" onClick={handlePinDelete} style={{ padding: '1.2rem', fontSize: '1.2rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5' }}>⌫</button>
          <button type="button" className="btn btn-secondary" onClick={() => handlePinDigit('0')} style={{ padding: '1.2rem', fontSize: '1.5rem', borderRadius: '12px', background: 'var(--btn-secondary-bg)' }}>0</button>
          <button type="button" className="btn btn-primary" onClick={submitLogin} disabled={loading || pinValue.length !== 4} style={{ padding: '1.2rem', fontSize: '1.5rem', borderRadius: '12px' }}>✓</button>
        </div>

        {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error-color)', color: '#fca5a5', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem' }}>{error}</div>}
      </div>
    );
  }

  return null;
}
