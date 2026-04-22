import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';

export default function VoterFlow({ onExit }) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState(null);
  
  // View: 'scanner', 'page1' (party), 'page2' (confirm), 'page3' (vvpat)
  const [view, setView] = useState('scanner');
  
  // Scanner State
  const [ackNumber, setAckNumber] = useState('');
  
  // Voting State
  const [parties, setParties] = useState([]);
  const [selectedParty, setSelectedParty] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-reset back to scanner after VVPAT
  useEffect(() => {
    if (view === 'page3') {
      const timer = setTimeout(() => {
        // Reset everything for the next voter
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
      setError("Failed to login. Machine may be offline.");
    } finally {
      setLoading(false);
    }
  };

  const fetchParties = async (constituencyId) => {
    try {
      const res = await fetch(`${API_URL}/voting/parties?constituencyId=${constituencyId}`);
      const data = await res.json();
      setParties(data);
    } catch (err) {
      console.error("Failed to load parties:", err);
    }
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
      if (res.ok) {
        setView('page3');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to cast vote.");
    } finally {
      setLoading(false);
    }
  };

  const renderHeaderInfo = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('session_id')}</p>
        <p style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{session.sessionId.substring(0,8)}</p>
      </div>
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>User ID</p>
        <p style={{ fontWeight: 'bold' }}>{session.userId}</p>
      </div>
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('name')}</p>
        <p style={{ fontWeight: 'bold' }}>{session.voterDetails.name}</p>
      </div>
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('constituency')}</p>
        <p style={{ fontWeight: 'bold' }}>{session.voterDetails.constituency_id.replace(/_/g, ' ').toUpperCase()}</p>
      </div>
    </div>
  );

  if (view === 'scanner') {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '500px', width: '100%', margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        
        <button 
          onClick={onExit}
          style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: '1px solid var(--text-secondary)', borderRadius: '4px', padding: '0.3rem 0.6rem', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
          title="Exit Voting Booth"
        >
          <span>⏏️</span> Exit
        </button>

        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗳️</div>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>Public Voting Booth</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Please enter your Acknowledgment Number to securely cast your vote.</p>
        
        {error && <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--error-color)', marginBottom: '2rem' }}>
          <p style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>{error}</p>
        </div>}

        <form onSubmit={submitVoterLogin} style={{ textAlign: 'left' }}>
          <div className="input-group">
            <label>{t('enter_ack', 'Enter Acknowledge Number')}</label>
            <input type="text" className="input-field" value={ackNumber} onChange={(e) => setAckNumber(e.target.value)} style={{ fontSize: '1.5rem', letterSpacing: '2px', textAlign: 'center' }} required />
          </div>
          <div className="action-buttons">
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }} disabled={loading}>
              {loading ? t('starting', 'Authenticating...') : t('start_session', 'Proceed to Vote')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === 'page1') {
    return (
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}>
        {renderHeaderInfo()}
        <div className="header">
          <h1>{t('select_party')}</h1>
          <p>{t('select_party_desc')}</p>
        </div>
        <div className="parties-grid">
          {parties.map(party => (
            <div key={party.id} className="glass-panel party-card" onClick={() => handlePartySelect(party)}>
              <div className="party-symbol">{party.symbol}</div>
              <div className="party-name">{i18n.language === 'hi' ? party.name_hi : party.name}</div>
              {party.candidates.length > 0 && (
                <div className="party-candidate">{i18n.language === 'hi' ? party.candidates[0].name_hi : party.candidates[0].name}</div>
              )}
            </div>
          ))}
          {parties.length === 0 && <p style={{ textAlign: 'center', gridColumn: '1 / -1' }}>{t('no_candidates', 'No candidates available for your constituency.')}</p>}
        </div>
      </div>
    );
  }

  if (view === 'page2') {
    if (!selectedParty) return null;
    const candidate = selectedParty.candidates[0];
    
    return (
      <div className="glass-panel candidate-profile animate-fade-in" style={{ margin: '0 auto', maxWidth: '600px' }}>
        <div className="header" style={{ marginBottom: '2rem' }}>
          <h1>{t('confirm_selection')}</h1>
          <p>{t('confirm_desc')}</p>
        </div>
        
        {candidate && <img src={candidate.photo} alt={candidate.name} className="candidate-photo" />}
        
        <div className="candidate-details">
          <div className="party-symbol" style={{ fontSize: '3rem' }}>{selectedParty.symbol}</div>
          {candidate && <h2 className="candidate-name">{i18n.language === 'hi' ? candidate.name_hi : candidate.name}</h2>}
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '0.5rem' }}>{i18n.language === 'hi' ? selectedParty.name_hi : selectedParty.name}</p>
          
          <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', display: 'inline-block' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('constituency_label', 'Constituency: ')}</span>
            <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{session.voterDetails.constituency_id.replace(/_/g, ' ').toUpperCase()}</span>
          </div>
        </div>

        {error && <p style={{ color: 'var(--error-color)', marginBottom: '1rem' }}>{error}</p>}

        <div className="action-buttons">
          <button className="btn btn-secondary" onClick={() => setView('page1')} disabled={loading}>
            {t('back_clear')}
          </button>
          <button className="btn btn-success" onClick={handleConfirmVote} disabled={loading || !candidate}>
            {loading ? t('recording') : t('confirm_vote')}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'page3') {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ padding: '3rem 2rem', marginBottom: '2rem' }}>
          <h1 style={{ color: 'var(--success-color)', marginBottom: '1rem' }}>{t('vote_cast')}</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            {t('session_id')}: <span style={{ fontFamily: 'monospace', color: 'white' }}>{session.sessionId.substring(0, 8)}...</span><br/>
            {t('your_ack')} <span style={{ fontFamily: 'monospace', color: 'white' }}>{session.ackNumber}</span> {t('ack_invalid')}
          </p>
          
          <h3 style={{ marginBottom: '1.5rem' }}>{t('vvpat_verify')}</h3>
          
          <div className="vvpat-container">
            <div className="vvpat-window">
              <div className="vvpat-slip-content vvpat-slip">
                <div className="vvpat-slip-symbol">{selectedParty?.symbol}</div>
                <div className="vvpat-slip-text">{i18n.language === 'hi' ? selectedParty?.name_hi : selectedParty?.name}</div>
                <div className="vvpat-slip-text">{i18n.language === 'hi' ? selectedParty?.candidates[0]?.name_hi : selectedParty?.candidates[0]?.name}</div>
              </div>
            </div>
            <div style={{ marginTop: '1rem', color: '#666', fontSize: '0.8rem' }}>{t('vvpat_machine')}</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
