import React, { useState } from 'react';
import { API_URL } from '../config';

export default function GuestRegistration({ onBack }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guestPins, setGuestPins] = useState(null);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/verification/guest/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      const data = await res.json();
      
      if (res.ok) {
        setGuestPins(data);
      } else {
        setError(data.error || 'Failed to register guest session');
      }
    } catch (err) {
      setError('Network request failed. Please check your connection.');
    }
    setLoading(false);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '500px', width: '100%' }}>
      <h2 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Beta Tester Registration</h2>
      
      {!guestPins ? (
        <form onSubmit={handleRegister}>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
            Register to receive temporary 15-minute PINs to test all 3 management roles across the entire DVS platform.
          </p>
          
          <div className="input-group">
            <input 
              type="text" 
              className="input-field" 
              placeholder="Your Name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>
          <div className="input-group">
            <input 
              type="email" 
              className="input-field" 
              placeholder="Your Email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          
          {error && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', padding: '0.8rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>{error}</div>}
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem', padding: '1rem' }} disabled={loading}>
            {loading ? '⏳ Generating Your Demo Access...' : '🔑 Get Demo Access — All 3 Roles'}
          </button>
          
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={onBack}>
            ← Back to Login
          </button>
        </form>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--success-color)', marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'var(--success-color)', margin: '0 0 0.3rem 0' }}>✅ Demo Session Active — 15 Minutes</h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>All 3 PINs work app-wide, just like the owner's permanent PINs.</p>
          </div>

          {/* Super Admin PIN */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginBottom: '0.8rem', textAlign: 'left', border: '1px solid rgba(168, 85, 247, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <p style={{ margin: 0, color: '#a855f7', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>👑 Super Admin</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(168,85,247,0.15)', padding: '2px 8px', borderRadius: '20px' }}>Live Results & Stats</span>
            </div>
            <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.9rem' }}>Username: <strong>superadmin</strong></p>
            <p style={{ margin: 0 }}>PIN: <strong style={{ letterSpacing: '4px', color: '#a855f7', fontSize: '1.5rem', fontFamily: 'monospace' }}>{guestPins.superadminPin}</strong></p>
          </div>

          {/* General Admin PIN */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginBottom: '0.8rem', textAlign: 'left', border: '1px solid rgba(56, 189, 248, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <p style={{ margin: 0, color: 'var(--primary-color)', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>🛡️ General Admin</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(56,189,248,0.15)', padding: '2px 8px', borderRadius: '20px' }}>Machine Health</span>
            </div>
            <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.9rem' }}>Username: <strong>admin</strong></p>
            <p style={{ margin: 0 }}>PIN: <strong style={{ letterSpacing: '4px', color: 'var(--primary-color)', fontSize: '1.5rem', fontFamily: 'monospace' }}>{guestPins.adminPin}</strong></p>
          </div>

          {/* Polling Officer PIN — Universal */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left', border: '1px solid rgba(34, 197, 94, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <p style={{ margin: 0, color: 'var(--success-color)', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>🗳️ Polling Officer</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(34,197,94,0.15)', padding: '2px 8px', borderRadius: '20px' }}>✅ Any Constituency</span>
            </div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Username: <strong style={{ color: 'white' }}>officer_[any area]</strong> — pick any constituency from the dropdown
            </p>
            <p style={{ margin: 0 }}>PIN: <strong style={{ letterSpacing: '4px', color: 'var(--success-color)', fontSize: '1.5rem', fontFamily: 'monospace' }}>{guestPins.officerPin}</strong></p>
            <p style={{ margin: '0.6rem 0 0 0', fontSize: '0.78rem', color: '#86efac' }}>
              💡 This PIN works for <em>every</em> constituency — just like the owner's permanent PIN works for all areas.
            </p>
          </div>
          
          <button type="button" className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={onBack}>
            ← Proceed to Login
          </button>
        </div>
      )}
    </div>
  );
}
