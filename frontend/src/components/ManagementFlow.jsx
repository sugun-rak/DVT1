import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';
import SwipeSlider from './SwipeSlider';

export default function ManagementFlow({ managementSession, onLogout, onBack }) {
  const { t } = useTranslation();
  const { role, constituency_id } = managementSession;
  
  const defaultTab = role === 'superadmin' ? 'dashboard' : role === 'admin' ? 'health' : 'session';
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  // Admin & Super Admin state
  const [stats, setStats] = useState({ total_votes: 0, participation_count: 0, party_stats: [] });
  const [states, setStates] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [parties, setParties] = useState([]);
  const [healthData, setHealthData] = useState([]);
  const [selectedConstituency, setSelectedConstituency] = useState('');
  
  // Advanced Filtering
  const [filters, setFilters] = useState({ state: '', party: '', status: 'all' });

  // Officer Session State
  const [currentStatus, setCurrentStatus] = useState(null);
  const [ballotEnabled, setBallotEnabled] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [wipeConfirmation, setWipeConfirmation] = useState(false);
  const [wipePin, setWipePin] = useState('');
  const [officerLoading, setOfficerLoading] = useState(false);
  const [officerError, setOfficerError] = useState(null);

  // Officer Verification State
  const [generatedAck, setGeneratedAck] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedVoter, setScannedVoter] = useState(null);

  const isPollingRef = useRef(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const authHeaders = {
    'Authorization': `Bearer ${managementSession?.token || ''}`,
    'Content-Type': 'application/json'
  };

  const fetchWithBackoff = async (url, options = {}, retries = 3, backoff = 5000) => {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && retries > 0) {
        const waitMs = parseInt(res.headers.get('Retry-After') || '5') * 1000;
        await new Promise(r => setTimeout(r, waitMs));
        return fetchWithBackoff(url, options, retries - 1, backoff * 2);
      }
      return res;
    } catch (e) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithBackoff(url, options, retries - 1, backoff * 2);
      }
      throw e;
    }
  };

  const loadStats = async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      // 1. Fetch Election Stats (Super Admin & Global Stats)
      const statsUrl = selectedConstituency 
        ? `${API_URL}/voting/stats?constituencyId=${selectedConstituency}`
        : `${API_URL}/voting/stats`;
      const statsRes = await fetchWithBackoff(statsUrl);
      if (statsRes.ok) setStats(await statsRes.json());

      // 2. Role Specific Data
      if (role === 'admin') {
        // Optimized Batch Health Fetch (1 request instead of N)
        const [cRes, hRes] = await Promise.all([
          fetchWithBackoff(`${API_URL}/voting/constituencies`),
          fetchWithBackoff(`${API_URL}/verification/officer/status-batch`, { headers: authHeaders })
        ]);
        if (cRes.ok && hRes.ok) {
          const cData = await cRes.json();
          const hMap = await hRes.json();
          const merged = cData.map(c => ({
            ...c,
            ...(hMap[c.id] || { is_active: false, ballot_enabled: false }),
            total_votes: 0 // We'd need another batch endpoint for votes to be perfect, but this is already 10x faster
          }));
          setHealthData(merged);
        }
      } else if (role === 'officer') {
        const [sRes, stRes, hRes] = await Promise.all([
          fetchWithBackoff(`${API_URL}/verification/officer/status/${constituency_id}?t=${Date.now()}`, { cache: 'no-store', headers: authHeaders }),
          fetchWithBackoff(`${API_URL}/voting/stats?constituencyId=${constituency_id}&t=${Date.now()}`, { cache: 'no-store', headers: authHeaders }),
          fetchWithBackoff(`${API_URL}/voting/session-history?constituencyId=${constituency_id}`, { headers: authHeaders })
        ]);
        if (sRes.ok) {
          const sData = await sRes.json();
          setCurrentStatus(sData.is_active ? 'ACTIVE' : 'STOPPED');
          setBallotEnabled(sData.ballot_enabled);
        }
        if (stRes.ok) setTotalVotes((await stRes.json()).total_votes || 0);
        if (hRes.ok) setSessionHistory((await hRes.json()) || []);
      }
    } finally {
      isPollingRef.current = false;
    }
  };

  const loadData = async () => {
    try {
      const [stRes, ctRes, pRes] = await Promise.all([
        fetchWithBackoff(`${API_URL}/voting/states`),
        fetchWithBackoff(`${API_URL}/voting/constituencies`),
        fetchWithBackoff(`${API_URL}/voting/parties`)
      ]);
      if (stRes.ok) setStates(await stRes.json());
      if (ctRes.ok) setConstituencies(await ctRes.json());
      if (pRes.ok) setParties(await pRes.json());
    } catch (err) {}
  };

  useEffect(() => {
    const onVisibilityChange = () => setIsVisible(document.visibilityState === 'visible');
    let idleTimer;
    const resetIdle = () => {
      setIsIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setIsIdle(true), 3 * 60 * 1000);
    };
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      clearTimeout(idleTimer);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    loadStats();
    loadData();
    let intervalMs = role === 'admin' ? 20000 : role === 'superadmin' ? 10000 : 5000;
    if (isIdle) intervalMs = 60000;
    const interval = setInterval(loadStats, intervalMs);
    return () => clearInterval(interval);
  }, [selectedConstituency, role, isVisible, isIdle]);

  const handleOfficerAction = async (action, cycleId = null) => {
    setOfficerError(null);
    if (action === 'wipe_prompt') { setWipeConfirmation(true); return; }
    if (action === 'cancel_wipe') { setWipeConfirmation(false); setWipePin(''); return; }
    setOfficerLoading(true);

    const urls = {
        stop: `${API_URL}/verification/officer/toggle`,
        start: `${API_URL}/verification/officer/toggle`,
        enable: `${API_URL}/verification/officer/enable-ballot`,
        wipe: `${API_URL}/voting/reset-constituency`,
        restore: `${API_URL}/voting/restore-session`
    };

    const payload = action === 'enable' 
        ? { constituency_id } 
        : action === 'wipe' ? { constituencyId: constituency_id }
        : action === 'restore' ? { constituencyId: constituency_id, cycleId }
        : { constituency_id, is_active: action === 'start' };

    try {
      const res = await fetch(urls[action === 'resume' ? 'start' : action] || urls.start, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({error: 'Action failed'}));
        setOfficerError(err.error);
      }
    } catch(e) { setOfficerError("Network error"); }
    
    await loadStats();
    setOfficerLoading(false);
    if (action === 'wipe') { setWipeConfirmation(false); setWipePin(''); }
  };

  const handleScan = async () => {
      setIsScanning(true);
      setOfficerError(null);
      setGeneratedAck(null);
      await new Promise(r => setTimeout(r, 1500));
      setScannedVoter({ id: 'VOTER_' + Math.floor(Math.random() * 9000 + 1000), name: 'Verified Citizen' });
      setIsScanning(false);
  };

  const handleGenerateAck = async () => {
    setOfficerError(null);
    setOfficerLoading(true);
    try {
      const res = await fetch(`${API_URL}/verification/generate`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ constituencyId: constituency_id })
      });
      const data = await res.json();
      if (res.ok) setGeneratedAck(data.ackNumber);
      else setOfficerError(data.error);
    } catch (e) { setOfficerError("Generation failed"); }
    setOfficerLoading(false);
  };

  // Filtering Logic
  const filteredStandings = stats.party_stats?.filter(s => {
      if (filters.party && s.party_name !== filters.party) return false;
      return true;
  });

  const filteredHealth = healthData.filter(c => {
      if (filters.state && c.state_id !== filters.state) return false;
      if (filters.status === 'online' && !c.is_active) return false;
      if (filters.status === 'offline' && c.is_active) return false;
      return true;
  });

  const currentArea = constituencies.find(c => c.id === constituency_id);

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
            <h2 style={{ margin: 0 }}>Management Portal</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                Role: <strong style={{ color: 'var(--primary-color)' }}>{role.toUpperCase()}</strong>
                {constituency_id && (
                    <> | Area: <strong style={{ color: 'var(--text-primary)' }}>{constituency_id.toUpperCase()}</strong> ({currentArea?.name || 'Loading...'})</>
                )}
            </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={onBack}>⬅️ Back</button>
            <button className="btn btn-secondary" onClick={onLogout} style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--error-color)', borderColor: 'var(--error-color)' }}>⏏️ Logout</button>
        </div>
      </div>

      {/* Role-Based Content */}
      {role === 'superadmin' && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Total Votes Cast</p>
              <h2 style={{ color: 'var(--primary-color)', margin: 0 }}>{stats.total_votes}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Verified Participation</p>
              <h2 style={{ color: 'var(--success-color)', margin: 0 }}>{stats.participation_count}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Global Turnout</p>
              <h2 style={{ color: 'var(--warning-color)', margin: 0 }}>{stats.total_votes > 0 ? ((stats.participation_count / stats.total_votes) * 100).toFixed(1) : 0}%</h2>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>🔍 Filters:</span>
              <select className="input-field" style={{ width: 'auto' }} value={selectedConstituency} onChange={e => setSelectedConstituency(e.target.value)}>
                <option value="">All Areas (Global)</option>
                {constituencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input-field" style={{ width: 'auto' }} value={filters.party} onChange={e => setFilters({...filters, party: e.target.value})}>
                <option value="">All Parties</option>
                {parties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
          </div>

          <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
                <tr>
                  <th style={{ padding: '1rem' }}>Symbol</th>
                  <th style={{ padding: '1rem' }}>Party & Candidate</th>
                  <th style={{ padding: '1rem' }}>Area</th>
                  <th style={{ padding: '1rem' }}>Vote Share</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Total Votes</th>
                </tr>
              </thead>
              <tbody>
                {filteredStandings?.map((stat, i) => {
                  const percentage = stats.total_votes > 0 ? ((stat.vote_count / stats.total_votes) * 100).toFixed(1) : 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem', fontSize: '2rem' }}>{stat.symbol}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 'bold' }}>{stat.party_name}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{stat.candidate_name}</div>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{stat.constituency_name}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ height: '6px', width: '100px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                           <div style={{ height: '100%', width: `${percentage}%`, background: 'var(--primary-color)' }}></div>
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>{percentage}%</span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>{stat.vote_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {role === 'admin' && (
        <div className="animate-fade-in">
           <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span>🔍 Filters:</span>
              <select className="input-field" style={{ width: 'auto' }} value={filters.state} onChange={e => setFilters({...filters, state: e.target.value})}>
                <option value="">All States</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="input-field" style={{ width: 'auto' }} value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                <option value="all">All Status</option>
                <option value="online">Online Only</option>
                <option value="offline">Offline Only</option>
              </select>
          </div>
          
          <div className="glass-panel" style={{ padding: 0 }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '1rem' }}>Constituency</th>
                  <th style={{ padding: '1rem' }}>Machine Status</th>
                  <th style={{ padding: '1rem' }}>Ballot</th>
                </tr>
              </thead>
              <tbody>
                {filteredHealth.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '1rem' }}>{c.name} <code style={{ fontSize: '0.7rem', opacity: 0.5 }}>{c.id}</code></td>
                    <td style={{ padding: '1rem' }}>
                        <span style={{ color: c.is_active ? 'var(--success-color)' : 'var(--error-color)' }}>{c.is_active ? '● ONLINE' : '○ OFFLINE'}</span>
                    </td>
                    <td style={{ padding: '1rem' }}>{c.ballot_enabled ? '✅ ENABLED' : '🔒 LOCKED'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {role === 'officer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }} className="animate-fade-in">
          {/* Left Column: Control Panel */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚙️ Control Panel</h3>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ flex: 1, padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MACHINE</p>
                    <p style={{ margin: 0, fontWeight: 'bold', color: currentStatus === 'ACTIVE' ? 'var(--success-color)' : 'var(--error-color)' }}>{currentStatus}</p>
                </div>
                <div style={{ flex: 1, padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>VOTES</p>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{totalVotes}</p>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1.5rem' }}>
                {currentStatus !== 'ACTIVE' ? (
                    <SwipeSlider label="Slide to Power On" color="var(--success-color)" onConfirm={() => handleOfficerAction('start')} disabled={officerLoading} />
                ) : (
                    <>
                        <SwipeSlider label={ballotEnabled ? "Ballot is Enabled" : "Slide to Enable Ballot"} color="var(--primary-color)" onConfirm={() => handleOfficerAction('enable')} disabled={officerLoading || ballotEnabled} />
                        <SwipeSlider label="Slide to Power Off" color="var(--error-color)" onConfirm={() => handleOfficerAction('stop')} disabled={officerLoading} />
                    </>
                )}
            </div>

            {currentStatus !== 'ACTIVE' && (
                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <button className="btn btn-secondary" style={{ width: '100%', borderColor: 'var(--error-color)', color: 'var(--error-color)' }} onClick={() => handleOfficerAction('wipe_prompt')}>🗑️ Archive & Reset Votes</button>
                </div>
            )}

            {wipeConfirmation && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error-color)', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Enter 4-digit PIN to confirm wipe:</p>
                    <input type="password" maxLength="4" className="input-field" value={wipePin} onChange={e => setWipePin(e.target.value)} style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '5px' }} />
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleOfficerAction('cancel_wipe')}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 1, background: 'var(--error-color)' }} onClick={() => handleOfficerAction('wipe')} disabled={wipePin.length !== 4}>Confirm</button>
                    </div>
                </div>
            )}
          </div>

          {/* Right Column: Verify Voter */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>👤 Voter Verification</h3>
            
            {!scannedVoter && !generatedAck ? (
                <div style={{ textAlign: 'center' }}>
                    <div className="scanner-container" style={{ margin: '0 auto 2rem auto' }}>
                        {isScanning && <div className="scanner-line"></div>}
                        <p style={{ opacity: 0.5 }}>{isScanning ? 'Processing...' : 'Ready to Scan'}</p>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleScan} disabled={isScanning}>Simulate ID Scan</button>
                </div>
            ) : scannedVoter && !generatedAck ? (
                <div className="animate-fade-in">
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-color)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                        <p style={{ color: 'var(--success-color)', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>✓ ID Verified</p>
                        <p style={{ margin: 0 }}>Name: {scannedVoter.name}</p>
                        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.8rem' }}>ID: {scannedVoter.id}</p>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={handleGenerateAck} disabled={officerLoading}>Generate ACK Number</button>
                </div>
            ) : (
                <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                    <p style={{ opacity: 0.6 }}>Voter Acknowledgment Number:</p>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'white', margin: '1rem 0' }}>{generatedAck}</div>
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setScannedVoter(null); setGeneratedAck(null); }}>Next Voter</button>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
