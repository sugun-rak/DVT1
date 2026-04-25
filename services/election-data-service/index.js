require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const compression = require('compression');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // Cache master data for 5 minutes

const app = express();
const port = process.env.PORT || 8002;

app.use(compression());
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

async function initDB(retries = 10) {
    while (retries > 0) {
        try {
            await pool.query('SELECT 1'); // Test connection

        await pool.query(`
            CREATE TABLE IF NOT EXISTS states (
                id TEXT PRIMARY KEY,
                name TEXT,
                name_hi TEXT
            );
            CREATE TABLE IF NOT EXISTS constituencies (
                id TEXT PRIMARY KEY,
                name TEXT,
                name_hi TEXT,
                state_id TEXT,
                FOREIGN KEY(state_id) REFERENCES states(id)
            );
            CREATE TABLE IF NOT EXISTS parties (
                id TEXT PRIMARY KEY,
                name TEXT,
                name_hi TEXT,
                symbol TEXT
            );
            CREATE TABLE IF NOT EXISTS candidates (
                id TEXT PRIMARY KEY,
                name TEXT,
                name_hi TEXT,
                photo TEXT,
                party_id TEXT,
                constituency_id TEXT,
                FOREIGN KEY(party_id) REFERENCES parties(id),
                FOREIGN KEY(constituency_id) REFERENCES constituencies(id)
            );
            CREATE TABLE IF NOT EXISTS votes (
                id SERIAL PRIMARY KEY,
                party_id TEXT,
                candidate_id TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS votes_history (
                id SERIAL PRIMARY KEY,
                party_id TEXT,
                candidate_id TEXT,
                cycle_id TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS voter_participation (
                voter_id TEXT PRIMARY KEY,
                constituency_id TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS voter_participation_history (
                id SERIAL PRIMARY KEY,
                voter_id TEXT,
                constituency_id TEXT,
                cycle_id TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Optimization Indexes
            CREATE INDEX IF NOT EXISTS idx_candidates_constituency ON candidates(constituency_id);
            CREATE INDEX IF NOT EXISTS idx_votes_candidate ON votes(candidate_id);
            CREATE INDEX IF NOT EXISTS idx_participation_constituency ON voter_participation(constituency_id);
        `);

        // ── Data Migration & Anonymization (Voter Secrecy Patch) ────────────────
        // If 'votes' or 'votes_history' still have 'voter_id' columns, migrate and drop them.
        const tableInfo = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'votes' AND column_name = 'voter_id'
        `);
        if (tableInfo.rows.length > 0) {
            console.log('Migrating existing votes to participation registry for secrecy...');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // 1. Copy participation from current votes
                await client.query(`
                    INSERT INTO voter_participation (voter_id, constituency_id, timestamp)
                    SELECT v.voter_id, c.constituency_id, v.timestamp 
                    FROM votes v
                    JOIN candidates c ON v.candidate_id = c.id
                    ON CONFLICT (voter_id) DO NOTHING
                `);
                // 2. Copy participation from history
                await client.query(`
                    INSERT INTO voter_participation_history (voter_id, constituency_id, cycle_id, timestamp)
                    SELECT v.voter_id, c.constituency_id, v.cycle_id, v.timestamp 
                    FROM votes_history v
                    JOIN candidates c ON v.candidate_id = c.id
                `);
                // 3. Drop identifying columns from votes
                await client.query('ALTER TABLE votes DROP COLUMN IF EXISTS voter_id');
                await client.query('ALTER TABLE votes DROP COLUMN IF EXISTS session_id');
                // 4. Drop identifying columns from history
                await client.query('ALTER TABLE votes_history DROP COLUMN IF EXISTS voter_id');
                await client.query('ALTER TABLE votes_history DROP COLUMN IF EXISTS session_id');
                
                await client.query('COMMIT');
                console.log('Migration completed. All votes are now anonymous.');
            } catch (e) {
                await client.query('ROLLBACK');
                console.error('Migration failed:', e);
            } finally {
                client.release();
            }
        }

        // SEEDER LOGIC
        const res = await pool.query('SELECT COUNT(*) as count FROM states');
        if (parseInt(res.rows[0].count) === 0) {
            console.log('Database is empty. Seeding mock data with translations...');
            
            const states = [
                { en: 'Maharashtra', hi: 'महाराष्ट्र' }, { en: 'Delhi', hi: 'दिल्ली' }, { en: 'Karnataka', hi: 'कर्नाटक' },
                { en: 'Tamil Nadu', hi: 'तमिलनाडु' }, { en: 'Gujarat', hi: 'गुजरात' }, { en: 'Uttar Pradesh', hi: 'उत्तर प्रदेश' },
                { en: 'West Bengal', hi: 'पश्चिम बंगाल' }, { en: 'Rajasthan', hi: 'राजस्थान' }, { en: 'Kerala', hi: 'केरल' },
                { en: 'Punjab', hi: 'पंजाब' }
            ];
            const stateObjs = states.map((s, i) => ({ id: `s_${i+1}`, name: s.en, name_hi: s.hi }));
            
            const parties = [
                { id: 'p_1', name: 'Bharatiya Janata Party (BJP)', name_hi: 'भारतीय जनता पार्टी (भाजपा)', symbol: '🪷' },
                { id: 'p_2', name: 'Indian National Congress (INC)', name_hi: 'भारतीय राष्ट्रीय कांग्रेस (कांग्रेस)', symbol: '✋' },
                { id: 'p_3', name: 'Aam Aadmi Party (AAP)', name_hi: 'आम आदमी पार्टी (आप)', symbol: '🧹' },
                { id: 'p_4', name: 'Trinamool Congress (TMC)', name_hi: 'तृणमूल कांग्रेस (टीएमसी)', symbol: '🌺' },
                { id: 'p_5', name: 'Shiv Sena (SS)', name_hi: 'शिवसेना (एसएस)', symbol: '🏹' },
                { id: 'p_6', name: 'Nationalist Congress Party (NCP)', name_hi: 'राष्ट्रवादी कांग्रेस पार्टी (राकांपा)', symbol: '⏰' },
                { id: 'p_7', name: 'Dravida Munnetra Kazhagam (DMK)', name_hi: 'द्रविड़ मुनेत्र कड़गम (डीएमके)', symbol: '☀️' },
                { id: 'p_8', name: 'YSR Congress Party (YSRCP)', name_hi: 'युवजन श्रमिक रायथू कांग्रेस पार्टी (वायएसआरसीपी)', symbol: '🌀' },
                { id: 'p_9', name: 'Samajwadi Party (SP)', name_hi: 'समाजवादी पार्टी (सपा)', symbol: '🚲' },
                { id: 'p_10', name: 'Independent Alliance (IND)', name_hi: 'स्वतंत्र गठबंधन (निर्दलीय)', symbol: '⚖️' }
            ];

            const firstNames = [
                { en: 'Aarav', hi: 'आरव' }, { en: 'Vivaan', hi: 'विवान' }, { en: 'Aditya', hi: 'आदित्य' },
                { en: 'Vihaan', hi: 'विहान' }, { en: 'Arjun', hi: 'अर्जुन' }, { en: 'Sai', hi: 'साई' },
                { en: 'Reyansh', hi: 'रेयांश' }, { en: 'Ayaan', hi: 'अयान' }, { en: 'Krishna', hi: 'कृष्णा' },
                { en: 'Ishaan', hi: 'ईशान' }, { en: 'Shaurya', hi: 'शौर्य' }
            ];
            
            const lastNames = [
                { en: 'Sharma', hi: 'शर्मा' }, { en: 'Patel', hi: 'पटेल' }, { en: 'Kumar', hi: 'कुमार' },
                { en: 'Singh', hi: 'सिंह' }, { en: 'Reddy', hi: 'रेड्डी' }, { en: 'Gupta', hi: 'गुप्ता' }
            ];

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                for (const s of stateObjs) {
                    await client.query('INSERT INTO states (id, name, name_hi) VALUES ($1, $2, $3)', [s.id, s.name, s.name_hi]);
                }
                
                for (const p of parties) {
                    await client.query('INSERT INTO parties (id, name, name_hi, symbol) VALUES ($1, $2, $3, $4)', [p.id, p.name, p.name_hi, p.symbol]);
                }

                let candCount = 1;
                for (const s of stateObjs) {
                    for (let i = 1; i <= 5; i++) {
                        const c_id = `${s.id}_c_${i}`;
                        const c_name = `${s.name} Area ${i}`;
                        const c_name_hi = `${s.name_hi} क्षेत्र ${i}`;
                        await client.query('INSERT INTO constituencies (id, name, name_hi, state_id) VALUES ($1, $2, $3, $4)', [c_id, c_name, c_name_hi, s.id]);

                        for (const p of parties) {
                            const fname = firstNames[Math.floor(Math.random() * firstNames.length)];
                            const lname = lastNames[Math.floor(Math.random() * lastNames.length)];
                            const candName = `${fname.en} ${lname.en}`;
                            const candNameHi = `${fname.hi} ${lname.hi}`;
                            const candId = `cand_${candCount++}`;
                            const photo = `https://i.pravatar.cc/150?u=${candId}`;
                            await client.query('INSERT INTO candidates (id, name, name_hi, photo, party_id, constituency_id) VALUES ($1, $2, $3, $4, $5, $6)', 
                                [candId, candName, candNameHi, photo, p.id, c_id]);
                        }
                    }
                }
                
                await client.query('COMMIT');
                console.log('Election Data Seeding completed successfully!');
            } catch (e) {
                await client.query('ROLLBACK');
                console.error('Seeding failed', e);
            } finally {
                client.release();
            }
        }
        break; // Successfully initialized, break out of loop
    } catch (e) {
        console.error(`DB Init Error, retrying in 5s... (${retries} retries left):`, e.message);
        retries -= 1;
        if (retries === 0) {
            console.error("FATAL: Could not connect to DB.");
            process.exit(1);
        }
        await new Promise(res => setTimeout(res, 5000));
    }
}
}
initDB();

app.get('/states', async (req, res) => {
    try {
        const cached = cache.get('states');
        if (cached) return res.json(cached);

        const result = await pool.query('SELECT * FROM states');
        const data = result.rows || [];
        cache.set('states', data);
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/constituencies', async (req, res) => {
    try {
        const { stateId } = req.query;
        const cacheKey = `constituencies_${stateId || 'all'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        let query = 'SELECT * FROM constituencies';
        let params = [];
        if (stateId) {
            query += ' WHERE state_id = $1';
            params.push(stateId);
        }
        const result = await pool.query(query, params);
        const data = result.rows || [];
        cache.set(cacheKey, data);
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/parties', async (req, res) => {
    try {
        const { constituencyId } = req.query;
        const cacheKey = `parties_${constituencyId || 'all'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        let query = `
            SELECT p.id as party_id, p.name as party_name, p.name_hi as party_name_hi, p.symbol,
                   c.id as candidate_id, c.name as candidate_name, c.name_hi as candidate_name_hi, c.photo
            FROM parties p
            JOIN candidates c ON p.id = c.party_id
        `;
        let params = [];
        if (constituencyId) {
            query += ` WHERE c.constituency_id = $1`;
            params.push(constituencyId);
        }

        const result = await pool.query(query, params);
        
        const partiesMap = {};
        result.rows.forEach(row => {
            if (!partiesMap[row.party_id]) {
                partiesMap[row.party_id] = {
                    id: row.party_id, name: row.party_name, name_hi: row.party_name_hi,
                    symbol: row.symbol, candidates: []
                };
            }
            partiesMap[row.party_id].candidates.push({
                id: row.candidate_id, name: row.candidate_name, name_hi: row.candidate_name_hi, photo: row.photo
            });
        });

        const data = Object.values(partiesMap).sort((a, b) => a.name.localeCompare(b.name));
        cache.set(cacheKey, data);
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/candidates', async (req, res) => {
    try {
        const cached = cache.get('candidates_all');
        if (cached) return res.json(cached);

        const result = await pool.query(`
            SELECT c.*, p.name as party_name, p.symbol as party_symbol, co.name as constituency_name 
            FROM candidates c 
            JOIN parties p ON c.party_id = p.id
            JOIN constituencies co ON c.constituency_id = co.id
        `);
        const data = result.rows || [];
        cache.set('candidates_all', data);
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/stats', async (req, res) => {
    try {
        const { constituencyId } = req.query;
        let partyJoin = 'LEFT JOIN votes v ON p.id = v.party_id';
        let countQuery = 'SELECT COUNT(*) as total FROM votes';
        let params = [];
        
        if (constituencyId) {
            partyJoin = 'LEFT JOIN votes v ON p.id = v.party_id AND v.candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $1)';
            countQuery = 'SELECT COUNT(*) as total FROM votes WHERE candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $1)';
            params.push(constituencyId);
        }

        const partyRes = await pool.query(`
            SELECT p.name as party_name, p.symbol, COUNT(v.id) as vote_count
            FROM parties p
            ${partyJoin}
            GROUP BY p.id
            ORDER BY vote_count DESC
        `, params);
        
        const totalRes = await pool.query(countQuery, params);
        
        res.json({
            total_votes: totalRes.rows[0] ? parseInt(totalRes.rows[0].total) : 0,
            party_stats: partyRes.rows.map(r => ({ ...r, vote_count: parseInt(r.vote_count) }))
        });
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/reset-stats', async (req, res) => {
    const cycleId = `cycle_${Date.now()}`;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            INSERT INTO votes_history (party_id, candidate_id, cycle_id, timestamp)
            SELECT party_id, candidate_id, $1, timestamp FROM votes
        `, [cycleId]);
        await client.query(`
            INSERT INTO voter_participation_history (voter_id, constituency_id, cycle_id, timestamp)
            SELECT voter_id, constituency_id, $1, timestamp FROM voter_participation
        `, [cycleId]);
        await client.query(`DELETE FROM votes`);
        await client.query(`DELETE FROM voter_participation`);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Stats archived and reset (participation cleared)', cycleId });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to reset stats' });
    } finally {
        client.release();
    }
});

app.post('/reset-constituency', async (req, res) => {
    const { constituencyId } = req.body;
    if (!constituencyId) return res.status(400).json({ error: 'Missing constituencyId' });
    const cycleId = `cycle_${Date.now()}`;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            INSERT INTO votes_history (party_id, candidate_id, cycle_id, timestamp)
            SELECT party_id, candidate_id, $1, timestamp FROM votes
            WHERE candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $2)
        `, [cycleId, constituencyId]);
        await client.query(`
            INSERT INTO voter_participation_history (voter_id, constituency_id, cycle_id, timestamp)
            SELECT voter_id, constituency_id, $1, timestamp FROM voter_participation
            WHERE constituency_id = $2
        `, [cycleId, constituencyId]);
        await client.query(`DELETE FROM votes WHERE candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $1)`, [constituencyId]);
        await client.query(`DELETE FROM voter_participation WHERE constituency_id = $1`, [constituencyId]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Constituency votes and participation reset', constituencyId });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to reset constituency votes' });
    } finally {
        client.release();
    }
});

app.get('/session-history', async (req, res) => {
    try {
        const { constituencyId } = req.query;
        let result;
        if (constituencyId) {
            result = await pool.query(`
                SELECT DISTINCT cycle_id FROM votes_history 
                WHERE candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $1)
                ORDER BY cycle_id DESC LIMIT 2
            `, [constituencyId]);
        } else {
            result = await pool.query('SELECT DISTINCT cycle_id FROM votes_history ORDER BY cycle_id DESC LIMIT 2');
        }
        res.json(result.rows ? result.rows.map(r => r.cycle_id) : []);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/restore-session', async (req, res) => {
    const { constituencyId, cycleId } = req.body;
    const newCycleId = `cycle_${Date.now()}`;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        let qFilter = constituencyId ? `WHERE candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $2)` : '';
        let qFilterPart = constituencyId ? `WHERE constituency_id = $2` : '';
        let paramsInsert1 = constituencyId ? [newCycleId, constituencyId] : [newCycleId];
        
        // Archive current state before restoring
        await client.query(`
            INSERT INTO votes_history (party_id, candidate_id, cycle_id, timestamp)
            SELECT party_id, candidate_id, $1, timestamp FROM votes ${qFilter}
        `, paramsInsert1);
        await client.query(`
            INSERT INTO voter_participation_history (voter_id, constituency_id, cycle_id, timestamp)
            SELECT voter_id, constituency_id, $1, timestamp FROM voter_participation ${qFilterPart}
        `, paramsInsert1);
        
        if (constituencyId) {
            await client.query(`DELETE FROM votes WHERE candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $1)`, [constituencyId]);
            await client.query(`DELETE FROM voter_participation WHERE constituency_id = $1`, [constituencyId]);
            
            await client.query(`
                INSERT INTO votes (party_id, candidate_id, timestamp)
                SELECT party_id, candidate_id, timestamp FROM votes_history
                WHERE cycle_id = $1 AND candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $2)
            `, [cycleId, constituencyId]);
            await client.query(`
                INSERT INTO voter_participation (voter_id, constituency_id, timestamp)
                SELECT voter_id, constituency_id, timestamp FROM voter_participation_history
                WHERE cycle_id = $1 AND constituency_id = $2
            `, [cycleId, constituencyId]);
            
            await client.query(`DELETE FROM votes_history WHERE cycle_id = $1 AND candidate_id IN (SELECT id FROM candidates WHERE constituency_id = $2)`, [cycleId, constituencyId]);
            await client.query(`DELETE FROM voter_participation_history WHERE cycle_id = $1 AND constituency_id = $2`, [cycleId, constituencyId]);
        } else {
            await client.query(`DELETE FROM votes`);
            await client.query(`DELETE FROM voter_participation`);
            
            await client.query(`
                INSERT INTO votes (party_id, candidate_id, timestamp)
                SELECT party_id, candidate_id, timestamp FROM votes_history WHERE cycle_id = $1
            `, [cycleId]);
            await client.query(`
                INSERT INTO voter_participation (voter_id, constituency_id, timestamp)
                SELECT voter_id, constituency_id, timestamp FROM voter_participation_history WHERE cycle_id = $1
            `, [cycleId]);
            
            await client.query(`DELETE FROM votes_history WHERE cycle_id = $1`, [cycleId]);
            await client.query(`DELETE FROM voter_participation_history WHERE cycle_id = $1`, [cycleId]);
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to restore session' });
    } finally {
        client.release();
    }
});

app.get('/voted-voters', async (req, res) => {
    try {
        const { constituencyId } = req.query;
        if (!constituencyId) return res.status(400).json({ error: 'Missing constituencyId' });
        const result = await pool.query(`
            SELECT voter_id FROM voter_participation
            WHERE constituency_id = $1
        `, [constituencyId]);
        res.json(result.rows.map(r => r.voter_id));
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/cast', async (req, res) => {
    const client = await pool.connect();
    try {
        const { sessionId, userId, partyId, candidateId } = req.body;
        if (!sessionId || !userId || !partyId || !candidateId) {
            return res.status(400).json({ error: 'Missing required voting parameters' });
        }

        await client.query('BEGIN');

        // 1. Record Participation (identifiable, but separate from the ballot)
        // This prevents double voting.
        const candRes = await client.query('SELECT constituency_id FROM candidates WHERE id = $1', [candidateId]);
        const cId = candRes.rows[0]?.constituency_id;
        
        await client.query(`
            INSERT INTO voter_participation (voter_id, constituency_id) 
            VALUES ($1, $2)
        `, [userId, cId]);

        // 2. Record Vote (anonymous)
        await client.query(`
            INSERT INTO votes (party_id, candidate_id) 
            VALUES ($1, $2)
        `, [partyId, candidateId]);

        await client.query('COMMIT');

        // Invalidate session in Auth service
        try {
            await globalThis.fetch(`${process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8001'}/complete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            res.json({ success: true, message: 'Vote successfully recorded anonymously.' });
        } catch (e) {
            console.error('Error communicating with verification service:', e);
            res.json({ success: true, message: 'Vote recorded, but session invalidation needs check.' });
        }
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') { // Postgres unique violation error code on voter_id
            return res.status(400).json({ error: 'You have already cast your vote!' });
        }
        console.error('Cast Error:', err);
        res.status(500).json({ error: 'Failed to record vote' });
    } finally {
        client.release();
    }
});

const rateLimit = require('express-rate-limit');

// ── Rate Limiter
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' }
});
app.use(limiter);

// ── Keep-Alive Health Endpoints (pings DB to keep Neon awake) ──────────────
app.get('/health', async (req, res) => {
    let dbStatus = 'error';
    try {
        await pool.query('SELECT 1');
        dbStatus = 'connected';
    } catch (e) {
        console.error('[health] DB ping failed:', e.message);
    }
    res.status(200).json({ 
        status: 'ok', 
        service: 'election-data-service', 
        db: dbStatus,
        timestamp: new Date().toISOString() 
    });
});
app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Election Data Service running on port ${port}`);
});
