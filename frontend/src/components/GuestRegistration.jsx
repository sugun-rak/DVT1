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
      setError('Network request failed');
    }
    setLoading(false);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '500px', width: '100%' }}>
      <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Beta Tester Registration</h2>
      
      {!guestPins ? (
        <form onSubmit={handleRegister}>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
            Register to receive temporary 15-minute PINs for testing the DVS platform.
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
          
          {error && <div style={{ color: 'var(--error-color)', marginBottom: '1rem' }}>{error}</div>}
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }} disabled={loading}>
            {loading ? 'Generating...' : 'Get Demo Access'}
          </button>
          
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={onBack}>
            Back to Login
          </button>
        </form>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--success-color)', marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'var(--success-color)', margin: '0 0 0.5rem 0' }}>✅ Session Active</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>These PINs will expire in exactly 15 minutes.</p>
          </div>
          
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'left' }}>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ADMIN ROLE</p>
            <p style={{ margin: 0, fontSize: '1.2rem' }}>Username: <strong>admin</strong></p>
            <p style={{ margin: 0, fontSize: '1.2rem' }}>PIN: <strong style={{ letterSpacing: '2px', color: 'var(--primary-color)' }}>{guestPins.adminPin}</strong></p>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left' }}>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>POLLING OFFICER ROLE</p>
            <p style={{ margin: 0, fontSize: '1.2rem' }}>Username: <strong>officer_s_1_c_1</strong></p>
            <p style={{ margin: 0, fontSize: '1.2rem' }}>PIN: <strong style={{ letterSpacing: '2px', color: 'var(--primary-color)' }}>{guestPins.officerPin}</strong></p>
          </div>
          
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onBack}>
            Proceed to Login
          </button>
        </div>
      )}
    </div>
  );
}
