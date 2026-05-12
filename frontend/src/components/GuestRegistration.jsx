import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function GuestRegistration({ onBack }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guestPins, setGuestPins] = useState(null);
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (!guestPins?.expiresAt) return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((guestPins.expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [guestPins]);

  const formatCountdown = (secs) => {
    if (secs === null) return '';
    if (secs <= 0) return '00:00 — Expired';
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const countdownColor = countdown !== null
    ? countdown > 300 ? 'var(--success-color)'
    : countdown > 120 ? 'var(--warning-color)'
    : 'var(--error-color)'
    : 'var(--success-color)';

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezoneOffsetMinutes = -(new Date().getTimezoneOffset());

    try {
      const res = await fetch(`${API_URL}/verification/guest/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, name, timezone, timezoneOffsetMinutes })
      });
      const data = await res.json();
      
      if (res.ok) {
        setGuestPins(data);
        sessionStorage.setItem('dvt_guest_info', JSON.stringify({ email, phone, name, timezone, timezoneOffsetMinutes, expiresAt: data.expiresAt }));
      } else {
        setError(data.error || 'Failed to register guest session');
      }
    } catch (err) {
      setError('Network request failed. Please check your connection.');
    }
    setLoading(false);
  };

  return (
    <div className="glass-panel animate-fade-in glow-primary" style={{ padding: '2.5rem', maxWidth: '500px', width: '100%', margin: '0 auto', marginTop: '10vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ padding: '0.5rem 1rem', borderRadius: '100px' }}>⬅️ Back</button>
          <h2 className="font-heading" style={{ flex: 1, margin: 0, textAlign: 'center' }}>Demo Access</h2>
      </div>
      
      {!guestPins ? (
        <form onSubmit={handleRegister} className="animate-fade-in">
          <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)', fontSize: '0.95rem', textAlign: 'center', lineHeight: 1.6 }}>
            Register to receive temporary 15-minute PINs to test all 3 management roles across the entire DVS platform.
            <br /><span style={{ color: 'var(--primary-color)', fontSize: '0.85rem', fontWeight: 'bold' }}>📧 PINs will be sent via Email & WhatsApp.</span>
          </p>
          
          <div style={{ marginBottom: '1.2rem' }}>
            <label className="metric-label">Full Name</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g. Jane Doe" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>
          <div style={{ marginBottom: '1.2rem' }}>
            <label className="metric-label">Email Address</label>
            <input 
              type="email" 
              className="input-field" 
              placeholder="e.g. jane@example.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div style={{ marginBottom: '2rem' }}>
            <label className="metric-label">WhatsApp Number (Optional)</label>
            <input 
              type="tel" 
              className="input-field" 
              placeholder="e.g. +91 98765 43210" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Include country code (e.g. +91)</p>
          </div>
          
          {error && <div style={{ color: '#fca5a5', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--error-color)', borderRadius: '8px', fontSize: '0.9rem' }}>{error}</div>}
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', fontSize: '1.1rem' }} disabled={loading}>
            {loading ? '⏳ Generating Access...' : '🔑 Request Global Access'}
          </button>
        </form>
      ) : (
        <div className="animate-fade-in" style={{ textAlign: 'center' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--success-color)', marginBottom: '1.5rem', boxShadow: '0 0 20px rgba(16, 185, 129, 0.1)' }}>
            <h3 className="font-heading" style={{ color: 'var(--success-color)', margin: '0 0 0.5rem 0' }}>✅ Active Session</h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Check your WhatsApp and Email for a copy.</p>
            
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--panel-inner-bg)', padding: '0.5rem 1.5rem', borderRadius: '100px',
              border: `1px solid ${countdownColor}`
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>⏱ Expires in:</span>
              <span className="font-heading" style={{ fontSize: '1.5rem', fontWeight: '800', color: countdownColor, letterSpacing: '2px' }}>
                {formatCountdown(countdown)}
              </span>
            </div>
          </div>

          {countdown === 0 && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--error-color)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
              <p style={{ color: '#fca5a5', margin: 0, fontSize: '0.9rem' }}>⛔ Session expired. Please request new access.</p>
            </div>
          )}

          {/* Super Admin PIN */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '1rem', textAlign: 'left', border: '1px solid rgba(168, 85, 247, 0.3)', background: 'rgba(168, 85, 247, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <p style={{ margin: 0, color: '#c084fc', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>👑 Super Admin</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(168,85,247,0.15)', padding: '2px 8px', borderRadius: '100px' }}>Global Insights</span>
            </div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>User: <strong style={{ color: 'var(--text-main)' }}>superadmin</strong></p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="metric-label" style={{ margin: 0 }}>PIN:</span>
                <strong style={{ letterSpacing: '8px', color: '#c084fc', fontSize: '1.8rem', fontFamily: 'Outfit' }}>{guestPins.superadminPin}</strong>
            </p>
          </div>

          {/* General Admin PIN */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '1rem', textAlign: 'left', border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <p style={{ margin: 0, color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>🛡️ General Admin</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(56,189,248,0.15)', padding: '2px 8px', borderRadius: '100px' }}>System Health</span>
            </div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>User: <strong style={{ color: 'var(--text-main)' }}>admin</strong></p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="metric-label" style={{ margin: 0 }}>PIN:</span>
                <strong style={{ letterSpacing: '8px', color: 'var(--primary-color)', fontSize: '1.8rem', fontFamily: 'Outfit' }}>{guestPins.adminPin}</strong>
            </p>
          </div>

          {/* Polling Officer PIN */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem', textAlign: 'left', border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <p style={{ margin: 0, color: 'var(--success-color)', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>🛂 Polling Officer</p>
              <span style={{ fontSize: '0.7rem', color: 'var(--success-color)', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '100px' }}>Universal Access</span>
            </div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>User: <strong style={{ color: 'var(--text-main)' }}>officer_[any]</strong></p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="metric-label" style={{ margin: 0 }}>PIN:</span>
                <strong style={{ letterSpacing: '8px', color: 'var(--success-color)', fontSize: '1.8rem', fontFamily: 'Outfit' }}>{guestPins.officerPin}</strong>
            </p>
          </div>
          
          <button type="button" className="btn btn-primary" style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', fontSize: '1.1rem' }} onClick={onBack}>
            Proceed to Login
          </button>
        </div>
      )}
    </div>
  );
}
