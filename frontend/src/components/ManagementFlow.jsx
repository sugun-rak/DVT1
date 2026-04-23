import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';

export default function ManagementFlow({ managementSession, onLogout, onBack }) {
  const { t } = useTranslation();
  const { role, constituency_id } = managementSession;
  
  const defaultTab = role === 'superadmin' ? 'dashboard' : role === 'admin' ? 'health' : 'session';
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  // Admin & Super Admin state
  const [stats, setStats] = useState({ total_votes: 0, party_stats: [] });
  const [voters, setVoters] = useState([]);
  const [states, setStates] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [parties, setParties] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [healthData, setHealthData] = useState([]);
  const [selectedConstituency, setSelectedConstituency] = useState('');
  
  const [newParty, setNewParty] = useState({ id: '', name: '', symbol: '' });
  const [newCandidate, setNewCandidate] = useState({ id: '', name: '', photo: '', party_id: '', constituency_id: '' });

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

  const authHeaders = {
    'Authorization': `Bearer ${managementSession?.token || ''}`,
    'Content-Type': 'application/json'
  };

  const loadStats = async () => {
    if (role === 'superadmin') {
      try {
        const url = selectedConstituency 
          ? `${API_URL}/voting/stats?constituencyId=${selectedConstituency}`
          : `${API_URL}/voting/stats`;
        const res = await fetch(url);
        setStats(await res.json());
      } catch (e) { console.error(e); }
    } else if (role === 'admin') {
      try {
        const cRes = await fetch(`${API_URL}/voting/constituencies`);
        const cData = await cRes.json();
        
        const healthStats = await Promise.all(cData.map(async (c) => {
          const sRes = await fetch(`${API_URL}/verification/officer/status/${c.id}`, { headers: authHeaders });
          const sData = await sRes.json();
          const vRes = await fetch(`${API_URL}/voting/stats?constituencyId=${c.id}`, { headers: authHeaders });
          const vData = await vRes.json();
          return { ...c, is_active: sData.is_active, ballot_enabled: sData.ballot_enabled, total_votes: vData.total_votes || 0 };
        }));
        setHealthData(healthStats);
      } catch(e) {}
    } else if (role === 'officer') {
      try {
          const statusRes = await fetch(`${API_URL}/verification/officer/status/${constituency_id}?t=${Date.now()}`, { cache: 'no-store', headers: authHeaders });
          const statusData = await statusRes.json();
          setCurrentStatus(statusData.is_active ? 'ACTIVE' : 'STOPPED');
          setBallotEnabled(statusData.ballot_enabled);
          
          const statsRes = await fetch(`${API_URL}/voting/stats?constituencyId=${constituency_id}&t=${Date.now()}`, { cache: 'no-store', headers: authHeaders });
          const statsData = await statsRes.json();
          setTotalVotes(statsData.total_votes || 0);

          const histRes = await fetch(`${API_URL}/voting/session-history?constituencyId=${constituency_id}`, { headers: authHeaders });
          const histData = await histRes.json();
          setSessionHistory(histData || []);
      } catch(e) {
          setCurrentStatus('UNKNOWN');
      }
    }
  };

  const loadData = async () => {
    if (role === 'admin') {
      try {
        const [sRes, cRes, pRes, candRes] = await Promise.all([
          fetch(`${API_URL}/voting/parties`), 
          fetch(`${API_URL}/voting/candidates`) 
        ]);
        setStates(await sRes.json());
        setConstituencies(await cRes.json());
        setParties(await pRes.json());
        setCandidates(await candRes.json());
      } catch (err) {}
    }
  };

  useEffect(() => {
    loadStats();
    loadData();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [selectedConstituency, role]);

  const handleExport = (format) => {
    if (!stats.party_stats || stats.party_stats.length === 0) {
      alert("No data available to export.");
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `election_live_stats_${timestamp}.${format}`;
    let fileContent = '';

    if (format === 'csv') {
      const headers = ['Party Symbol', 'Party Name', 'Candidate Name', 'Votes'];
      const rows = stats.party_stats.map(s => [
        s.symbol, `"${s.party_name}"`, `"${s.candidate_name || 'N/A'}"`, s.vote_count
      ].join(','));
      fileContent = [headers.join(','), ...rows].join('\n');
    } else if (format === 'json') {
      fileContent = JSON.stringify(stats, null, 2);
    }

    const blob = new Blob([fileContent], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddParty = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/voting/parties`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newParty) });
    setNewParty({ id: '', name: '', symbol: '' });
    loadData();
  };

  const handleAddCandidate = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/voting/candidates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCandidate) });
    setNewCandidate({ id: '', name: '', photo: '', party_id: '', constituency_id: '' });
    loadData();
  };

  // --- OFFICER ACTIONS ---
  const handleOfficerAction = async (action, cycleId = null) => {
    setOfficerError(null);
    if (action === 'wipe_prompt') { setWipeConfirmation(true); return; }
    if (action === 'cancel_wipe') { setWipeConfirmation(false); setWipePin(''); return; }

    setOfficerLoading(true);
    
    const sendAction = async (url, body) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(body)
        });
        if (!res.ok) {
           const err = await res.json().catch(()=>({error: 'Unknown API error'}));
           setOfficerError(err.error || `Server responded with ${res.status}`);
        }
      } catch(e) {
        setOfficerError(e.message || "Network request failed");
      }
    };

    if (action === 'stop') {
        await sendAction(`${API_URL}/verification/officer/toggle`, { constituency_id, is_active: false });
    } else if (action === 'start' || action === 'resume') {
        await sendAction(`${API_URL}/verification/officer/toggle`, { constituency_id, is_active: true });
    } else if (action === 'wipe') {
        if (wipePin.length !== 4) {
            setOfficerError("Please enter your 4-digit PIN.");
            setOfficerLoading(false);
            return;
        }
        await sendAction(`${API_URL}/voting/reset-constituency`, { constituencyId: constituency_id });
        setWipeConfirmation(false);
        setWipePin('');
    } else if (action === 'restore' && cycleId) {
        await sendAction(`${API_URL}/voting/restore-session`, { constituencyId: constituency_id, cycleId });
    } else if (action === 'enable_ballot') {
        await sendAction(`${API_URL}/verification/officer/enable-ballot`, { constituency_id });
    }

    await loadStats();
    setOfficerLoading(false);
  };

  const handleScan = async () => {
      setIsScanning(true);
      setOfficerError(null);
      setGeneratedAck(null);
      try {
          await new Promise(r => setTimeout(r, 1500));
          setScannedVoter({ id: 'VOTER_' + Math.floor(Math.random() * 9000 + 1000), name: 'Verified Citizen' });
      } catch(e) {
          setOfficerError('Scan failed');
      }
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
      if (res.ok) {
        setGeneratedAck(data.ackNumber);
      } else {
        setOfficerError(data.error);
      }
    } catch (e) {
      setOfficerError("Failed to generate acknowledgement number.");
    }
    setOfficerLoading(false);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
            <h2 style={{ margin: 0 }}>Management Portal</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                Role: <strong style={{ color: 'var(--primary-color)' }}>{role.toUpperCase()}</strong>
                {constituency_id && ` | Area: ${constituency_id.toUpperCase()}`}
            </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⬅️</span> Back
            </button>
            <button className="btn btn-secondary" onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--error-color)', borderColor: 'var(--error-color)' }}>
              <span>⏏️</span> Logout
            </button>
        </div>
      </div>

      <div className="tabs-container">
        {role === 'superadmin' && <div className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>{t('live_results', 'Live Results')}</div>}
        
        {role === 'admin' && (
            <>
                <div className={`tab ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>{t('machine_health', 'Machine Health')}</div>
                <div className={`tab ${activeTab === 'regions' ? 'active' : ''}`} onClick={() => setActiveTab('regions')}>{t('states_constituencies', 'States & Constituencies')}</div>
                <div className={`tab ${activeTab === 'parties' ? 'active' : ''}`} onClick={() => setActiveTab('parties')}>{t('parties_candidates', 'Parties & Candidates')}</div>
            </>
        )}

        {role === 'officer' && (
            <>
                <div className={`tab ${activeTab === 'session' ? 'active' : ''}`} onClick={() => setActiveTab('session')}>{t('control_panel', 'Control Panel')}</div>
                <div className={`tab ${activeTab === 'verification' ? 'active' : ''}`} onClick={() => setActiveTab('verification')}>{t('verify_voters', 'Verify Voters')}</div>
            </>
        )}
      </div>

      {role === 'superadmin' && activeTab === 'dashboard' && (
        <div className="animate-fade-in" style={{ display: 'grid', gap: '2rem' }}>
          {/* Top Summary Bento Box */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '1rem' }}>{t('total_votes_cast', 'Total Votes Cast')}</h3>
              <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{stats.total_votes}</div>
            </div>
            
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1rem' }}>{t('quick_actions', 'Quick Actions')}</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={() => handleExport('csv')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span>📊</span> {t('export_csv', 'Export CSV')}</button>
                <button className="btn btn-secondary" onClick={() => handleExport('json')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span>{'{ }'}</span> {t('export_json', 'Export JSON')}</button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
              <label style={{ marginRight: '1rem' }}>{t('filter_area', 'Filter Area:')}</label>
              <select className="input-field" style={{ width: 'auto', display: 'inline-block' }} value={selectedConstituency} onChange={(e) => setSelectedConstituency(e.target.value)}>
                <option value="">{t('global_view', 'Global View')}</option>
                {constituencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
          </div>

          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{t('live_candidate_standings', 'Live Candidate Standings')}</h3>
            </div>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ padding: '1rem 1.5rem', width: '80px', textAlign: 'center' }}>{t('symbol', 'Symbol')}</th>
                  <th style={{ padding: '1rem 1.5rem' }}>{t('party_candidate', 'Party & Candidate')}</th>
                  <th style={{ padding: '1rem 1.5rem', width: '40%' }}>{t('vote_share', 'Vote Share')}</th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>{t('total_votes_col', 'Total Votes')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.party_stats?.map((stat, i) => {
                  const percentage = stats.total_votes > 0 ? ((stat.vote_count / stats.total_votes) * 100).toFixed(1) : 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '2.5rem', textAlign: 'center' }}>{stat.symbol}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{stat.party_name}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{stat.candidate_name || 'TBA'}</div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${percentage}%`, background: i === 0 ? 'var(--success-color)' : 'var(--primary-color)', transition: 'width 1s ease-in-out' }}></div>
                          </div>
                          <span style={{ fontSize: '0.9rem', width: '40px', textAlign: 'right' }}>{percentage}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '1.5rem', color: i === 0 ? 'var(--success-color)' : 'var(--text-primary)', textAlign: 'right', fontWeight: 'bold' }}>
                        {stat.vote_count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {role === 'admin' && activeTab === 'health' && (
        <div className="animate-fade-in">
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
             <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '1rem' }}>{t('total_system_votes', 'Total System Votes (All Areas)')}</h3>
             <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{healthData.reduce((acc, c) => acc + c.total_votes, 0)}</div>
          </div>
          <h3>{t('constituency_machine_health', 'Constituency Machine Health')}</h3>
          <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ padding: '1rem' }}>{t('constituency', 'Constituency')}</th>
                  <th style={{ padding: '1rem' }}>{t('machine_status', 'Machine Status')}</th>
                  <th style={{ padding: '1rem' }}>{t('ballot_status', 'Ballot Status')}</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>{t('votes_cast', 'Votes Cast')}</th>
                </tr>
              </thead>
              <tbody>
                {healthData.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '1rem' }}>{c.name} ({c.id})</td>
                    <td style={{ padding: '1rem' }}>
                        <span style={{ color: c.is_active ? 'var(--success-color)' : 'var(--error-color)', fontWeight: 'bold' }}>
                            {c.is_active ? `● ${t('online', 'ONLINE')}` : `○ ${t('offline', 'OFFLINE')}`}
                        </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                        {c.is_active ? (
                            <span style={{ color: c.ballot_enabled ? 'var(--primary-color)' : 'var(--text-secondary)' }}>
                                {c.ballot_enabled ? t('enabled', 'ENABLED') : t('locked', 'LOCKED')}
                            </span>
                        ) : '-'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>{c.total_votes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {role === 'admin' && activeTab === 'regions' && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h3>States ({states.length})</h3>
              <ul style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {states.map(s => <li key={s.id} style={{ margin: '0.5rem 0' }}>{s.id}: <strong>{s.name}</strong></li>)}
              </ul>
            </div>
            <div>
              <h3>Constituencies ({constituencies.length})</h3>
              <ul style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {constituencies.map(c => <li key={c.id} style={{ margin: '0.5rem 0' }}>{c.id}: <strong>{c.name}</strong> (State: {c.state_id})</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {role === 'admin' && activeTab === 'parties' && (
        <div className="animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px' }}>
              <h3>{t('add_party', 'Add Party')}</h3>
              <form onSubmit={handleAddParty} style={{ marginTop: '1rem' }}>
                <div className="input-group"><input type="text" className="input-field" placeholder={t('party_id', 'Party ID (e.g. p_new)')} value={newParty.id} onChange={e => setNewParty({...newParty, id: e.target.value})} required /></div>
                <div className="input-group"><input type="text" className="input-field" placeholder={t('party_name', 'Party Name')} value={newParty.name} onChange={e => setNewParty({...newParty, name: e.target.value})} required /></div>
                <div className="input-group"><input type="text" className="input-field" placeholder={t('symbol_emoji', 'Symbol (Emoji)')} value={newParty.symbol} onChange={e => setNewParty({...newParty, symbol: e.target.value})} required /></div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>{t('add_party', 'Add Party')}</button>
              </form>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px' }}>
              <h3>{t('add_candidate', 'Add Candidate')}</h3>
              <form onSubmit={handleAddCandidate} style={{ marginTop: '1rem' }}>
                <div className="input-group"><input type="text" className="input-field" placeholder={t('candidate_id', 'Candidate ID')} value={newCandidate.id} onChange={e => setNewCandidate({...newCandidate, id: e.target.value})} required /></div>
                <div className="input-group"><input type="text" className="input-field" placeholder={t('candidate_name', 'Candidate Name')} value={newCandidate.name} onChange={e => setNewCandidate({...newCandidate, name: e.target.value})} required /></div>
                <div className="input-group"><input type="text" className="input-field" placeholder={t('photo_url', 'Photo URL')} value={newCandidate.photo} onChange={e => setNewCandidate({...newCandidate, photo: e.target.value})} required /></div>
                <div className="input-group"><select className="input-field" value={newCandidate.party_id} onChange={e => setNewCandidate({...newCandidate, party_id: e.target.value})} required><option value="">-- {t('select_party', 'Select Party')} --</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="input-group"><select className="input-field" value={newCandidate.constituency_id} onChange={e => setNewCandidate({...newCandidate, constituency_id: e.target.value})} required><option value="">-- {t('choose_constituency', '-- Choose Constituency --')} --</option>{constituencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>{t('add_candidate', 'Add Candidate')}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- OFFICER TABS --- */}
      {role === 'officer' && activeTab === 'session' && (
          <div className="animate-fade-in" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '2rem' }}>
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('machine_status', 'Machine Status')}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: currentStatus === 'ACTIVE' ? 'var(--success-color)' : 'var(--error-color)' }}>{currentStatus === 'ACTIVE' ? t('online', 'ACTIVE') : currentStatus}</div>
                  </div>
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('active_votes', 'Active Votes')}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{totalVotes}</div>
                  </div>
              </div>

              {currentStatus === 'ACTIVE' && (
                  <div className="glass-panel" style={{ marginBottom: '2rem', border: ballotEnabled ? '2px solid var(--success-color)' : '2px solid rgba(255,255,255,0.1)' }}>
                      <h3 style={{ marginBottom: '1rem', color: ballotEnabled ? 'var(--success-color)' : 'var(--text-primary)' }}>
                          {ballotEnabled ? `🗳️ ${t('ballot_enabled', 'Ballot Enabled for Current Voter')}` : `🔒 ${t('ballot_locked', 'Ballot is Locked')}`}
                      </h3>
                      {!ballotEnabled ? (
                          <button className="btn btn-primary" style={{ width: '100%', fontSize: '1.2rem', padding: '1.5rem' }} onClick={() => handleOfficerAction('enable_ballot')} disabled={officerLoading}>
                              ▶ {t('enable_ballot_voter', 'Enable Ballot for Current Voter')}
                          </button>
                      ) : (
                          <p style={{ color: 'var(--text-secondary)' }}>{t('waiting_for_voter', 'The Public Voting Booth is unlocked. Waiting for voter to cast their vote...')}</p>
                      )}
                  </div>
              )}

              {wipeConfirmation ? (
                  <div className="glass-panel" style={{ border: '1px solid var(--error-color)' }}>
                      <h3 style={{ color: 'var(--error-color)', marginBottom: '1rem' }}>⚠️ {t('confirm_wipe', 'Confirm Wipe')}</h3>
                      <p style={{ marginBottom: '1rem' }}>Enter your 4-digit PIN to safely archive and clear active votes.</p>
                      <input 
                          type="password" pattern="[0-9]*" inputMode="numeric" maxLength="4"
                          className="input-field" value={wipePin} onChange={e => setWipePin(e.target.value)} 
                          style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '5px', marginBottom: '1rem' }}
                      />
                      {officerError && <p style={{ color: 'var(--error-color)' }}>{officerError}</p>}
                      <div style={{ display: 'flex', gap: '1rem' }}>
                          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleOfficerAction('cancel_wipe')}>{t('cancel', 'Cancel')}</button>
                          <button className="btn btn-primary" style={{ flex: 1, background: 'var(--error-color)' }} onClick={() => handleOfficerAction('wipe')} disabled={wipePin.length !== 4}>{t('confirm_wipe', 'Confirm Wipe')}</button>
                      </div>
                  </div>
              ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                      {currentStatus !== 'ACTIVE' ? (
                          <button className="btn btn-primary" onClick={() => handleOfficerAction('start')} disabled={officerLoading}>
                              ▶ {t('power_on_machine', 'Power On Machine (Start Session)')}
                          </button>
                      ) : (
                          <button className="btn btn-secondary" onClick={() => handleOfficerAction('stop')} disabled={officerLoading}>
                              🛑 {t('power_off_machine', 'Power Off Machine (Stop Session)')}
                          </button>
                      )}

                      {sessionHistory.length > 0 && currentStatus !== 'ACTIVE' && (
                          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('historical_archives', 'Historical Archives')}</p>
                              <button className="btn btn-secondary" style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.9rem' }} onClick={() => handleOfficerAction('restore', sessionHistory[0])} disabled={officerLoading}>
                                  {t('load_last_session', 'Load Last Session')} ({new Date(parseInt(sessionHistory[0].split('_')[1])).toLocaleString()})
                              </button>
                          </div>
                      )}

                      <button className="btn btn-secondary" style={{ borderColor: 'var(--error-color)', color: 'var(--error-color)', marginTop: '1rem' }} onClick={() => handleOfficerAction('wipe_prompt')} disabled={officerLoading || currentStatus === 'ACTIVE'}>
                          🗑️ {t('archive_reset', 'Archive & Reset Active Votes')}
                      </button>
                  </div>
              )}
          </div>
      )}

      {role === 'officer' && activeTab === 'verification' && (
          <div className="animate-fade-in" style={{ textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
              <div className="glass-panel">
                  <h2 style={{ marginBottom: '1rem' }}>{t('verify_voter_id', 'Verify Voter ID')}</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                      Verify the voter's physical ID card by scanning it. If valid, generate a unique, one-time Acknowledgment Number for them to use at the Voting Booth.
                  </p>

                  {!scannedVoter && !generatedAck && (
                      <>
                          <div className="scanner-container">
                              {isScanning && <div className="scanner-line"></div>}
                              <div className="scanner-text">{isScanning ? t('scanning', 'Scanning...') : t('place_id', 'Place Virtual ID to Scan')}</div>
                          </div>
                          <button className="btn btn-primary" onClick={handleScan} disabled={isScanning} style={{ width: '100%', marginBottom: '2rem' }}>
                              {isScanning ? t('scanning', 'Scanning...') : t('simulate_scan', 'Simulate Scan')}
                          </button>
                      </>
                  )}

                  {scannedVoter && !generatedAck && (
                      <div className="animate-fade-in" style={{ marginBottom: '2rem' }}>
                          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                              <p style={{ color: 'var(--success-color)', fontWeight: 'bold', marginBottom: '0.5rem' }}>✓ Voter Verified</p>
                              <p style={{ color: 'var(--text-secondary)' }}>ID: {scannedVoter.id}</p>
                              <p style={{ color: 'var(--text-secondary)' }}>Name: {scannedVoter.name}</p>
                          </div>
                          
                          <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', marginBottom: '1rem' }} onClick={handleGenerateAck} disabled={officerLoading}>
                              {t('generate_ack', 'Generate ACK Number')}
                          </button>
                      </div>
                  )}

                  {officerError && <p style={{ color: 'var(--error-color)', marginTop: '1rem' }}>{officerError}</p>}

                  {generatedAck && (
                      <div className="animate-fade-in" style={{ marginTop: '2rem', padding: '2rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--primary-color)', borderRadius: '8px' }}>
                          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('provide_ack_to_voter', 'Provide this number to the voter:')}</p>
                          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '4px', color: 'white', marginBottom: '1.5rem' }}>
                              {generatedAck}
                          </div>
                          <button className="btn btn-secondary" onClick={() => { setScannedVoter(null); setGeneratedAck(null); }} style={{ width: '100%' }}>
                              {t('scan_next_voter', 'Scan Next Voter')}
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

    </div>
  );
}
