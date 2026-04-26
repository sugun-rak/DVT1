import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';

export default function VoterFlow({ onExit }) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState(null);
  
  // View: 'scanner', 'page1' (party), 'page2' (confirm), 'page3' (vvpat)
  const [view, setView] = useState('scanner');
  
  const [ackNumber, setAckNumber] = useState('');
  const [parties, setParties] = useState([]);
  const [selectedParty, setSelectedParty] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (view === 'page3') {
      const timer = setTimeout(() => {
        setSession(null);
        setAckNumber('');
        setSelectedParty(null);
        setError(null);
        setView('scanner');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [view]);

  const submitVoterLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/verification/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ackNumber })
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data);
        fetchParties(data.voterDetails.constituency_id);
        setView('page1');
      } else {
        setError(data.error);
        if (data.error === "Ballot is locked by the polling officer. Please wait for authorization.") {
            setError("Ballot is locked. Please wait for the Polling Officer to enable the machine for you.");
        }
      }
    } catch (err) {
      setError("Failed to connect to the voting network.");
    } finally {
      setLoading(false);
    }
  };

  const fetchParties = async (constituencyId) => {
    try {
      const res = await fetch(`${API_URL}/voting/parties?constituencyId=${constituencyId}`);
      const data = await res.json();
      setParties(data);
    } catch (err) {}
  };

  const handlePartySelect = (party) => {
    setSelectedParty(party);
    setView('page2');
  };

  const handleConfirmVote = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/voting/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          userId: session.userId,
          partyId: selectedParty.id,
          candidateId: selectedParty.candidates[0].id
        })
      });
      const data = await res.json();
      if (res.ok) setView('page3');
      else setError(data.error);
    } catch (err) {
      setError("Encryption failed. Vote could not be cast.");
    } finally {
      setLoading(false);
    }
  };

  const renderHeaderInfo = () => (
    <div className="glass-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '2rem', padding: '1.5rem', borderRadius: '16px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
      <div>
        <p className="metric-label" style={{ color: 'var(--primary-color)' }}>{t('session_id')}</p>
        <p style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1rem' }}>{session.sessionId.substring(0,8)}</p>
      </div>
      <div>
        <p className="metric-label" style={{ color: 'var(--primary-color)' }}>Voter ID</p>
        <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{session.userId}</p>
      </div>
      <div>
        <p className="metric-label" style={{ color: 'var(--primary-color)' }}>{t('name')}</p>
        <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{session.voterDetails.name}</p>
      </div>
      <div>
        <p className="metric-label" style={{ color: 'var(--primary-color)' }}>{t('constituency')}</p>
        <p style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)' }}>{session.voterDetails.constituency_id.replace(/_/g, ' ').toUpperCase()}</p>
      </div>
    </div>
  );

  if (view === 'scanner') {
    return (
      <div className="glass-panel animate-fade-in glow-primary" style={{ padding: '3rem 2.5rem', maxWidth: '550px', width: '100%', margin: '0 auto', textAlign: 'center', position: 'relative', marginTop: '10vh' }}>
        
        <button 
          onClick={onExit}
          style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--border-color)', border: '1px solid var(--border-color)', borderRadius: '100px', padding: '0.4rem 0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s', zIndex: 10 }}
          title="Exit Voting Booth"
        >
          Exit Booth
        </button>

        <div style={{ fontSize: '5rem', marginBottom: '1.5rem', filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.4))' }}>🗳️</div>
        <h2 className="font-heading" style={{ marginBottom: '1rem', color: 'var(--text-main)', fontSize: '2.5rem' }}>Secure Voting Kiosk</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem' }}>Enter the unique Acknowledgment Number provided by the Polling Officer.</p>
        
        {error && <div className="animate-fade-in" style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--error-color)', marginBottom: '2rem', color: '#fca5a5' }}>
          {error}
        </div>}

        <form onSubmit={submitVoterLogin} style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: '2rem' }}>
            <label className="metric-label" style={{ textAlign: 'center', display: 'block', marginBottom: '1rem' }}>{t('enter_ack', 'Acknowledgment Number')}</label>
            <input type="text" className="input-field" value={ackNumber} onChange={(e) => setAckNumber(e.target.value)} style={{ fontSize: '2rem', letterSpacing: '4px', textAlign: 'center', height: '70px', borderRadius: '16px', fontFamily: 'Outfit', fontWeight: '800', background: 'var(--panel-inner-bg)' }} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1.2rem', fontSize: '1.2rem', borderRadius: '16px' }} disabled={loading}>
            {loading ? 'Authenticating...' : t('start_session', 'Proceed to Vote')}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'page1') {
    return (
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: 'clamp(1rem, 2vh, 2rem) 1rem' }}>
        {renderHeaderInfo()}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 className="font-heading" style={{ fontSize: '3rem', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #fff, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('select_party')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>{t('select_party_desc')}</p>
        </div>
        
        <div className="bento-grid-dense">
          {parties.map(party => (
            <div key={party.id} className="glass-panel" onClick={() => handlePartySelect(party)} style={{ padding: '2rem', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: '4.5rem', marginBottom: '1rem', filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.2))' }}>{party.symbol}</div>
              <div style={{ fontWeight: '800', fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-main)', fontFamily: 'Outfit' }}>{i18n.language === 'hi' ? party.name_hi : party.name}</div>
              {party.candidates.length > 0 && (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{i18n.language === 'hi' ? party.candidates[0].name_hi : party.candidates[0].name}</div>
              )}
            </div>
          ))}
          {parties.length === 0 && <p style={{ textAlign: 'center', gridColumn: '1 / -1', color: 'var(--text-secondary)' }}>{t('no_candidates', 'No candidates available for your constituency.')}</p>}
        </div>
      </div>
    );
  }

  if (view === 'page2') {
    if (!selectedParty) return null;
    const candidate = selectedParty.candidates[0];
    
    return (
      <div className="glass-panel animate-fade-in glow-primary" style={{ margin: '0 auto', maxWidth: '600px', padding: '3rem 2.5rem', textAlign: 'center', marginTop: '5vh' }}>
        <h1 className="font-heading" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{t('confirm_selection')}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', fontSize: '1.1rem' }}>{t('confirm_desc')}</p>
        
        <div style={{ background: 'var(--panel-inner-bg)', borderRadius: '24px', padding: '3rem 2rem', marginBottom: '3rem', border: '1px solid rgba(56, 189, 248, 0.2)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(circle at top right, rgba(56, 189, 248, 0.1), transparent 70%)', pointerEvents: 'none' }}></div>
            {candidate && <img src={candidate.photo} alt={candidate.name} style={{ width: '160px', height: '160px', borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--primary-color)', marginBottom: '1.5rem', boxShadow: '0 0 30px rgba(56, 189, 248, 0.3)' }} />}
            <div style={{ fontSize: '4rem', position: 'absolute', top: '2rem', right: '2rem', opacity: 0.2, filter: 'grayscale(1)' }}>{selectedParty.symbol}</div>
            
            <div style={{ fontSize: '5rem', marginBottom: '1rem', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.2))' }}>{selectedParty.symbol}</div>
            {candidate && <h2 className="font-heading" style={{ fontSize: '2.2rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>{i18n.language === 'hi' ? candidate.name_hi : candidate.name}</h2>}
            <p style={{ color: 'var(--primary-color)', fontSize: '1.3rem', fontWeight: 'bold' }}>{i18n.language === 'hi' ? selectedParty.name_hi : selectedParty.name}</p>
        </div>

        {error && <p style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setView('page1')} disabled={loading} style={{ flex: 1, padding: '1.2rem', fontSize: '1.1rem', borderRadius: '16px' }}>
            {t('back_clear')}
          </button>
          <button className="btn btn-success" onClick={handleConfirmVote} disabled={loading || !candidate} style={{ flex: 2, padding: '1.2rem', fontSize: '1.2rem', borderRadius: '16px', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}>
            {loading ? t('recording') : t('confirm_vote')}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'page3') {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%', maxWidth: '600px', margin: '0 auto', marginTop: '5vh' }}>
        <div className="glass-panel glow-success" style={{ padding: '4rem 2rem', border: '1px solid var(--success-color)' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', fontSize: '3rem', border: '2px solid var(--success-color)', boxShadow: '0 0 30px rgba(16, 185, 129, 0.5)' }}>✓</div>
          <h1 className="font-heading" style={{ color: 'var(--success-color)', marginBottom: '1.5rem', fontSize: '2.5rem' }}>{t('vote_cast')}</h1>
          
          <div style={{ background: 'var(--panel-inner-bg)', padding: '1.5rem', borderRadius: '12px', marginBottom: '3rem', border: '1px solid var(--border-color)' }}>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)' }}>{t('session_id')}: <strong style={{ fontFamily: 'monospace', color: 'var(--text-main)', letterSpacing: '1px' }}>{session.sessionId.substring(0, 12)}...</strong></p>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t('your_ack')} <strong style={{ fontFamily: 'monospace', color: 'var(--text-main)', letterSpacing: '2px' }}>{session.ackNumber}</strong> {t('ack_invalid')}</p>
          </div>
          
          <h3 className="metric-label" style={{ color: 'var(--primary-color)', marginBottom: '1.5rem' }}>{t('vvpat_verify')}</h3>
          
          <div style={{ width: '100%', maxWidth: '350px', margin: '0 auto', background: 'var(--panel-inner-bg-solid)', border: '10px solid #1e293b', borderRadius: '12px', height: '250px', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 0 30px rgba(0,0,0,1)' }}>
            {/* The animated slip */}
            <div style={{ 
                position: 'absolute', top: '-100%', left: '10%', width: '80%', background: '#f8fafc', color: '#0f172a', 
                padding: '1.5rem 1rem', textAlign: 'center', border: '1px dashed #94a3b8', 
                animation: 'dropSlip 5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                boxShadow: '0 10px 20px rgba(0,0,0,0.5)'
            }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{selectedParty?.symbol}</div>
                <div style={{ fontWeight: '800', fontSize: '1.4rem', marginBottom: '0.3rem', fontFamily: 'Outfit' }}>{i18n.language === 'hi' ? selectedParty?.name_hi : selectedParty?.name}</div>
                <div style={{ fontSize: '1.1rem', color: '#475569' }}>{i18n.language === 'hi' ? selectedParty?.candidates[0]?.name_hi : selectedParty?.candidates[0]?.name}</div>
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.7rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                    TX: {session.sessionId.substring(0,16)}
                </div>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('vvpat_machine')}</div>
        </div>
        
        <style>{`
          @keyframes dropSlip {
            0% { top: -100%; opacity: 1; transform: scale(0.95); }
            15% { top: 10%; opacity: 1; transform: scale(1); }
            85% { top: 10%; opacity: 1; transform: scale(1); }
            100% { top: 120%; opacity: 0; transform: scale(0.95); }
          }
        `}</style>
      </div>
    );
  }

  return null;
}
