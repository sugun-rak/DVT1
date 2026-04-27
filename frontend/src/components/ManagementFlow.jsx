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
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ state: '', party: '', status: 'all' });

  // Officer Session State
  const [currentStatus, setCurrentStatus] = useState(null);
  const [ballotEnabled, setBallotEnabled] = useState(false);
  const [officerTab, setOfficerTab] = useState('machine');
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
      if (role === 'superadmin') {
        const statsUrl = selectedConstituency 
          ? `${API_URL}/voting/stats?constituencyId=${selectedConstituency}`
          : `${API_URL}/voting/stats`;
        const statsRes = await fetchWithBackoff(statsUrl);
        if (statsRes.ok) setStats(await statsRes.json());
      }

      if (role === 'admin') {
        const [cRes, hRes, sRes] = await Promise.all([
          fetchWithBackoff(`${API_URL}/voting/constituencies`),
          fetchWithBackoff(`${API_URL}/verification/officer/status-batch`, { headers: authHeaders }),
          fetchWithBackoff(`${API_URL}/voting/stats`)
        ]);
        if (cRes.ok && hRes.ok && sRes.ok) {
          const cData = await cRes.json();
          const hMap = await hRes.json();
          const sData = await sRes.json();
          
          // Compute total votes per constituency
          const voteMap = {};
          if (sData && sData.party_stats) {
             sData.party_stats.forEach(stat => {
                 voteMap[stat.constituency_id] = (voteMap[stat.constituency_id] || 0) + stat.vote_count;
             });
          }

          const merged = cData.map(c => ({
            ...c,
            ...(hMap[c.id] || { is_active: false, ballot_enabled: false }),
            total_votes: voteMap[c.id] || 0 
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

  // --- FILTERING LOGIC ---
  const query = searchQuery.toLowerCase();
  
  const filteredStandings = stats.party_stats?.filter(s => {
      if (filters.party && s.party_name !== filters.party) return false;
      if (query && !s.party_name.toLowerCase().includes(query) && 
                   !s.candidate_name?.toLowerCase().includes(query) && 
                   !s.constituency_name?.toLowerCase().includes(query)) return false;
      return true;
  });

  const filteredHealth = healthData.filter(c => {
      if (filters.state && c.state_id !== filters.state) return false;
      if (filters.status === 'online' && !c.is_active) return false;
      if (filters.status === 'offline' && c.is_active) return false;
      if (query && !c.name.toLowerCase().includes(query) && !c.id.toLowerCase().includes(query)) return false;
      return true;
  });

  const currentArea = constituencies.find(c => c.id === constituency_id);
  const leadingParty = stats.party_stats && stats.party_stats.length > 0 ? stats.party_stats[0] : null;
  const onlineMachinesCount = healthData.filter(h => h.is_active).length;
  const maxVotes = Math.max(...healthData.map(h => h.total_votes), 1);

  return (
    <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', maxWidth: '1800px', width: '100%', margin: '0 auto', overflowX: 'hidden' }}>
      
      {/* 🔮 GLOBAL HEADER */}
      <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', borderRadius: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)' }}>
                {role === 'superadmin' ? '👑' : role === 'admin' ? '🛡️' : '🛂'}
            </div>
            <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Command Center</h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>{role.toUpperCase()}</span>
                    {constituency_id && (
                        <>
                            <span>•</span>
                            <span style={{ color: 'var(--text-main)' }}>{currentArea?.name || constituency_id}</span>
                            <code style={{ background: 'var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>{constituency_id}</code>
                        </>
                    )}
                </div>
            </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={onBack} style={{ borderRadius: '100px' }}>⬅️ Back</button>
            <button className="btn btn-secondary" onClick={onLogout} style={{ borderRadius: '100px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-color)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>⏏️ Logout</button>
        </div>
      </div>

      {/* 👑 SUPER ADMIN BENTO DASHBOARD */}
      {role === 'superadmin' && (
        <div className="animate-fade-in">
          <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
            {/* Bento 1: Total Votes */}
            <div className="glass-panel glow-primary animate-float" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="metric-label">Total Valid Votes</div>
              <div className="metric-value primary">{stats.total_votes.toLocaleString()}</div>
              <div style={{ marginTop: '1rem', height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--primary-color)' }}></div>
              </div>
            </div>

            {/* Bento 2: Turnout / Participation */}
            <div className="glass-panel glow-success animate-float" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', animationDelay: '0.2s' }}>
              <div className="metric-label">Verified Participation</div>
              <div className="metric-value success">{stats.participation_count.toLocaleString()}</div>
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ flex: 1, height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${stats.total_votes > 0 ? (stats.participation_count/stats.total_votes)*100 : 0}%`, background: 'var(--success-color)', transition: 'width 1s' }}></div>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--success-color)', fontWeight: 'bold' }}>
                      {stats.total_votes > 0 ? ((stats.participation_count / stats.total_votes) * 100).toFixed(1) : 0}% Yield
                  </span>
              </div>
            </div>

            {/* Bento 3: Leading Party Insight */}
            <div className="glass-panel glow-warning animate-float" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', animationDelay: '0.4s' }}>
              <div className="metric-label">Current Leader</div>
              {leadingParty ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                      <div style={{ fontSize: '3rem', filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.4))' }}>{leadingParty.symbol}</div>
                      <div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--warning-color)' }}>{leadingParty.party_name}</div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{leadingParty.vote_count.toLocaleString()} votes</div>
                      </div>
                  </div>
              ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>Awaiting Data...</div>
              )}
            </div>
          </div>

          {/* Super Admin Toolbar */}
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--panel-inner-bg)' }}>
              <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                  <input type="text" className="input-field" placeholder="Search party, candidate, or area..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '100px' }} />
              </div>
              <select className="input-field" style={{ width: 'auto', borderRadius: '100px' }} value={selectedConstituency} onChange={e => setSelectedConstituency(e.target.value)}>
                <option value="">🌍 Global View</option>
                {constituencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input-field" style={{ width: 'auto', borderRadius: '100px' }} value={filters.party} onChange={e => setFilters({...filters, party: e.target.value})}>
                <option value="">🏛️ All Parties</option>
                {parties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
          </div>

          {/* Standings Table */}
          <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="bento-table">
              <thead>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>Sym</th>
                  <th>Candidate & Party</th>
                  <th>Area</th>
                  <th style={{ width: '30%' }}>Vote Share</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredStandings?.map((stat, i) => {
                  const percentage = stats.total_votes > 0 ? ((stat.vote_count / stats.total_votes) * 100).toFixed(1) : 0;
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: '2rem', textAlign: 'center' }}>{stat.symbol}</td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '1.05rem' }}>{stat.candidate_name || 'TBA'}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{stat.party_name}</div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{stat.constituency_name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                               <div style={{ height: '100%', width: `${percentage}%`, background: i === 0 ? 'var(--success-color)' : 'var(--primary-color)' }}></div>
                            </div>
                            <span style={{ fontSize: '0.8rem', width: '40px', fontWeight: 'bold' }}>{percentage}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800', fontSize: '1.2rem', color: i === 0 ? 'var(--success-color)' : 'white' }}>{stat.vote_count.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {(!filteredStandings || filteredStandings.length === 0) && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No data matches the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🛡️ ADMIN BENTO DASHBOARD */}
      {role === 'admin' && activeTab === 'health' && (
        <div className="animate-fade-in">
           <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="glass-panel glow-primary animate-float" style={{ padding: '2rem' }}>
                  <div className="metric-label">System-Wide Votes</div>
                  <div className="metric-value primary">{healthData.reduce((acc, c) => acc + c.total_votes, 0).toLocaleString()}</div>
              </div>
              <div className="glass-panel glow-success animate-float" style={{ padding: '2rem', animationDelay: '0.2s' }}>
                  <div className="metric-label">Online Machines</div>
                  <div className="metric-value success">{onlineMachinesCount} <span style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>/ {healthData.length}</span></div>
              </div>
              <div className="glass-panel glow-warning animate-float" style={{ padding: '2rem', animationDelay: '0.4s' }}>
                  <div className="metric-label">Network Uptime</div>
                  <div className="metric-value warning">{healthData.length > 0 ? ((onlineMachinesCount / healthData.length) * 100).toFixed(0) : 0}%</div>
              </div>
           </div>

           <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--panel-inner-bg)' }}>
              <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                  <input type="text" className="input-field" placeholder="Search area name or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '100px' }} />
              </div>
              <select className="input-field" style={{ width: 'auto', borderRadius: '100px' }} value={filters.state} onChange={e => setFilters({...filters, state: e.target.value})}>
                <option value="">📍 All States</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="input-field" style={{ width: 'auto', borderRadius: '100px' }} value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                <option value="all">⚡ All Statuses</option>
                <option value="online">● Online Only</option>
                <option value="offline">○ Offline Only</option>
              </select>
          </div>
          
          <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="bento-table">
              <thead>
                <tr>
                  <th>Area ID</th>
                  <th>Constituency</th>
                  <th>Machine Network</th>
                  <th>Ballot State</th>
                  <th style={{ textAlign: 'right' }}>Local Votes</th>
                </tr>
              </thead>
              <tbody>
                {filteredHealth.map(c => (
                  <tr key={c.id}>
                    <td><code style={{ background: 'var(--border-color)', padding: '4px 8px', borderRadius: '4px', color: 'var(--primary-color)' }}>{c.id}</code></td>
                    <td style={{ fontWeight: '600' }}>{c.name}</td>
                    <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: c.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '4px 12px', borderRadius: '100px', border: `1px solid ${c.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.is_active ? 'var(--success-color)' : 'var(--error-color)', boxShadow: `0 0 10px ${c.is_active ? 'var(--success-color)' : 'var(--error-color)'}` }}></div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: c.is_active ? 'var(--success-color)' : 'var(--error-color)', textTransform: 'uppercase' }}>{c.is_active ? 'Online' : 'Offline'}</span>
                        </div>
                    </td>
                    <td>
                        <span style={{ color: c.ballot_enabled ? 'var(--text-main)' : 'var(--text-secondary)' }}>
                            {c.is_active ? (c.ballot_enabled ? '✅ Unlocked' : '🔒 Locked') : '—'}
                        </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <div style={{ width: '80px', height: '6px', background: 'var(--panel-inner-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${(c.total_votes / maxVotes) * 100}%`, height: '100%', background: 'var(--primary-color)' }}></div>
                            </div>
                            <span style={{ minWidth: '40px' }}>{c.total_votes}</span>
                        </div>
                    </td>
                  </tr>
                ))}
                {filteredHealth.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No machines match current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🛂 OFFICER DUAL-MODULE KIOSK */}
      {role === 'officer' && (
        <div className="animate-fade-in" style={{ width: '100%', maxWidth: '1800px', margin: '0 auto', padding: 'clamp(1rem, 2vh, 2rem) 1rem' }}>
          
          {/* TAB SELECTOR */}
          <div className="glass-panel" style={{ padding: '0.5rem', marginBottom: '2rem', display: 'flex', gap: '0.5rem', background: 'var(--panel-inner-bg)', borderRadius: '100px' }}>
            <button 
                className="btn" 
                onClick={() => setOfficerTab('machine')}
                style={{ 
                    flex: 1, 
                    padding: '1rem', 
                    borderRadius: '100px', 
                    background: officerTab === 'machine' ? 'var(--primary-color)' : 'transparent',
                    color: officerTab === 'machine' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 'bold',
                    boxShadow: officerTab === 'machine' ? '0 4px 15px rgba(56, 189, 248, 0.4)' : 'none',
                    border: 'none',
                    transition: 'all 0.3s'
                }}>
                ⚙️ Machine Control
            </button>
            <button 
                className="btn" 
                onClick={() => setOfficerTab('verification')}
                style={{ 
                    flex: 1, 
                    padding: '1rem', 
                    borderRadius: '100px', 
                    background: officerTab === 'verification' ? 'var(--primary-color)' : 'transparent',
                    color: officerTab === 'verification' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 'bold',
                    boxShadow: officerTab === 'verification' ? '0 4px 15px rgba(56, 189, 248, 0.4)' : 'none',
                    border: 'none',
                    transition: 'all 0.3s'
                }}>
                👤 Voter Verification
            </button>
          </div>

          <div style={{ position: 'relative' }}>
              {/* MODULE A: MACHINE CONTROL */}
              {officerTab === 'machine' && (
                <div className={`glass-panel animate-fade-in ${currentStatus === 'ACTIVE' ? 'glow-success' : 'glow-warning'}`} style={{ padding: 'clamp(1.5rem, 4vw, 3rem)', display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                      <h3 style={{ margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          ⚙️ System Status
                      </h3>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>NETWORK</div>
                              <div style={{ fontWeight: 'bold', color: currentStatus === 'ACTIVE' ? 'var(--success-color)' : 'var(--error-color)' }}>{currentStatus || 'WAIT'}</div>
                          </div>
                          <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }}></div>
                          <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>VOTES</div>
                              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{totalVotes}</div>
                          </div>
                      </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, justifyContent: 'center' }}>
                      {currentStatus !== 'ACTIVE' ? (
                          <div style={{ padding: 'clamp(1.5rem, 4vw, 3rem)', background: 'var(--panel-inner-bg)', borderRadius: '24px', textAlign: 'center' }}>
                              <div style={{ fontSize: '4rem', opacity: 0.5, marginBottom: '1rem' }}>🔌</div>
                              <h4 style={{ marginBottom: '2rem', color: 'var(--text-secondary)', fontSize: '1.2rem' }}>Machine is currently powered down</h4>
                              <SwipeSlider label="Slide to Power On" color="var(--success-color)" onConfirm={() => handleOfficerAction('start')} disabled={officerLoading} />
                          </div>
                      ) : (
                          <>
                              <div style={{ padding: 'clamp(1.5rem, 4vw, 3rem)', background: ballotEnabled ? 'rgba(56, 189, 248, 0.1)' : 'rgba(0,0,0,0.3)', border: `1px solid ${ballotEnabled ? 'rgba(56, 189, 248, 0.3)' : 'transparent'}`, borderRadius: '24px', textAlign: 'center', transition: 'all 0.3s' }}>
                                  <div style={{ fontSize: '4rem', marginBottom: '1rem', filter: ballotEnabled ? 'drop-shadow(0 0 15px rgba(56, 189, 248, 0.5))' : 'none' }}>{ballotEnabled ? '🗳️' : '🔒'}</div>
                                  <h4 style={{ marginBottom: '2rem', fontSize: '1.2rem', color: ballotEnabled ? 'var(--primary-color)' : 'var(--text-secondary)' }}>
                                      {ballotEnabled ? 'Ballot Unlocked for Voter' : 'Booth is Locked. Waiting for next voter.'}
                                  </h4>
                                  <SwipeSlider label={ballotEnabled ? "Awaiting Vote..." : "Slide to Unlock Ballot"} color="var(--primary-color)" onConfirm={() => handleOfficerAction('enable')} disabled={officerLoading || ballotEnabled} />
                              </div>
                              
                              <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
                                  <SwipeSlider label="Slide to Power Off" color="var(--error-color)" onConfirm={() => handleOfficerAction('stop')} disabled={officerLoading || ballotEnabled} />
                              </div>
                          </>
                      )}
                  </div>

                  {currentStatus !== 'ACTIVE' && (
                      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--border-color)' }}>
                          <button className="btn btn-secondary" style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--error-color)', background: 'rgba(239, 68, 68, 0.05)' }} onClick={() => handleOfficerAction('wipe_prompt')}>🗑️ Archive & Reset Local Votes</button>
                      </div>
                  )}

                  {wipeConfirmation && (
                      <div className="animate-fade-in" style={{ marginTop: '1rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error-color)', borderRadius: '12px' }}>
                          <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: '#fca5a5' }}>Security override. Enter 4-digit Officer PIN to confirm irreversible wipe:</p>
                          <input type="password" maxLength="4" className="input-field" value={wipePin} onChange={e => setWipePin(e.target.value)} style={{ textAlign: 'center', fontSize: '2rem', letterSpacing: '8px', background: 'var(--panel-inner-bg)' }} />
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleOfficerAction('cancel_wipe')}>Cancel</button>
                              <button className="btn btn-primary" style={{ flex: 1, background: 'var(--error-color)', boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)' }} onClick={() => handleOfficerAction('wipe')} disabled={wipePin.length !== 4}>CONFIRM WIPE</button>
                          </div>
                      </div>
                  )}
                </div>
              )}

              {/* MODULE B: VOTER VERIFICATION */}
              {officerTab === 'verification' && (
                <div className="glass-panel animate-fade-in glow-primary" style={{ padding: 'clamp(1.5rem, 4vw, 3rem)', display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                      <h3 style={{ margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          👤 Identity Verification Kiosk
                      </h3>
                  </div>
                  
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                      {!scannedVoter && !generatedAck ? (
                          <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                              <div className="scanner-container" style={{ margin: '0 auto 2.5rem auto' }}>
                                  {isScanning && <div className="scanner-line"></div>}
                                  <p style={{ opacity: isScanning ? 1 : 0.5, color: isScanning ? 'var(--primary-color)' : 'inherit', fontWeight: isScanning ? 'bold' : 'normal', transition: 'all 0.3s' }}>
                                      {isScanning ? 'Processing Biometrics...' : 'Ready to Scan Virtual ID'}
                                  </p>
                              </div>
                              <button className="btn btn-primary" style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }} onClick={handleScan} disabled={isScanning || currentStatus !== 'ACTIVE'}>
                                  {currentStatus !== 'ACTIVE' ? 'Power on machine to scan' : 'Simulate ID Scan'}
                              </button>
                          </div>
                      ) : scannedVoter && !generatedAck ? (
                          <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px' }}>
                              <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2rem', borderRadius: '16px', marginBottom: '2rem', textAlign: 'center' }}>
                                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', fontSize: '2.5rem' }}>✓</div>
                                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--success-color)' }}>Identity Verified</h3>
                                  <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>{scannedVoter.name}</p>
                                  <p style={{ margin: '0.5rem 0 0 0', opacity: 0.5, fontFamily: 'monospace' }}>{scannedVoter.id}</p>
                              </div>
                              <button className="btn btn-primary" style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', background: 'linear-gradient(135deg, var(--accent-color), var(--primary-color))' }} onClick={handleGenerateAck} disabled={officerLoading}>
                                  Issue ACK Token
                              </button>
                          </div>
                      ) : (
                          <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                              <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '3rem 2rem', borderRadius: '24px', marginBottom: '2rem' }}>
                                  <p style={{ margin: '0 0 1rem 0', color: 'var(--primary-color)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px' }}>Secure Voter Token</p>
                                  <div style={{ fontSize: 'clamp(3rem, 10vw, 5rem)', fontWeight: '800', letterSpacing: '8px', color: 'var(--text-main)', fontFamily: 'Outfit', textShadow: '0 0 20px rgba(56, 189, 248, 0.5)' }}>
                                      {generatedAck}
                                  </div>
                                  <p style={{ margin: '1rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Provide this number to the voter to unlock the booth.</p>
                              </div>
                              <button className="btn btn-secondary" style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }} onClick={() => { setScannedVoter(null); setGeneratedAck(null); }}>
                                  Scan Next Voter
                              </button>
                          </div>
                      )}
                  </div>
                  
                  {officerError && (
                      <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center' }}>
                          ⚠️ {officerError}
                      </div>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
