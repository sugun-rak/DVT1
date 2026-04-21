require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 8001;
const JWT_SECRET = process.env.JWT_SECRET || 'dvt-secure-jwt-secret-key-2026';

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS voters (
                id TEXT PRIMARY KEY,
                name TEXT,
                constituency_id TEXT
            );
            CREATE TABLE IF NOT EXISTS admins (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                pin TEXT
            );
            CREATE TABLE IF NOT EXISTS polling_officers (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                pin TEXT,
                constituency_id TEXT
            );
            CREATE TABLE IF NOT EXISTS constituency_status (
                constituency_id TEXT PRIMARY KEY,
                is_active BOOLEAN DEFAULT false,
                ballot_enabled BOOLEAN DEFAULT false
            );
            CREATE TABLE IF NOT EXISTS ack_numbers (
                id SERIAL PRIMARY KEY,
                ack_number TEXT UNIQUE,
                voter_id TEXT,
                is_used BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                voter_id TEXT,
                ack_number TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Handle DB Seeding
        const res = await pool.query('SELECT COUNT(*) as count FROM admins');
        if (parseInt(res.rows[0].count) === 0) {
            console.log('Seeding initial auth data (Voters & Officers)...');
            
            const adminHash1 = bcrypt.hashSync('1234', 10);
            const adminHash2 = bcrypt.hashSync('9999', 10);
            const officerHash = bcrypt.hashSync('0000', 10);
            
            await pool.query('INSERT INTO admins (id, username, pin) VALUES ($1, $2, $3)', ['admin_1', 'admin', adminHash1]);
            await pool.query('INSERT INTO admins (id, username, pin) VALUES ($1, $2, $3)', ['superadmin_1', 'superadmin', adminHash2]);

            const firstNames = ['Amit', 'Raj', 'Sanjay', 'Sunil', 'Vijay', 'Neha', 'Pooja', 'Kavita', 'Ritu', 'Anjali', 'Deepak', 'Manish', 'Nitin', 'Rakesh', 'Suresh', 'Swati', 'Preeti', 'Meena', 'Geeta', 'Nisha'];
            const lastNames = ['Yadav', 'Jain', 'Mehta', 'Kaur', 'Das', 'Sen', 'Pillai', 'Rao', 'Chauhan', 'Thakur'];

            let voterCount = 1;
            for (let s = 1; s <= 10; s++) {
                for (let c = 1; c <= 5; c++) {
                    const constituencyId = `s_${s}_c_${c}`;
                    
                    await pool.query('INSERT INTO constituency_status (constituency_id, is_active) VALUES ($1, false)', [constituencyId]);
                    await pool.query('INSERT INTO polling_officers (id, username, pin, constituency_id) VALUES ($1, $2, $3, $4)', 
                        [`off_${constituencyId}`, `officer_${constituencyId}`, officerHash, constituencyId]);

                    for (let v = 1; v <= 50; v++) {
                        const vId = `voter_${voterCount++}`;
                        const vName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
                        await pool.query('INSERT INTO voters (id, name, constituency_id) VALUES ($1, $2, $3)', [vId, vName, constituencyId]);
                    }
                }
            }
            console.log('Voter Auth & Officer seeding completed!');
        } else {
            const adminRes = await pool.query('SELECT * FROM admins WHERE username = $1', ['superadmin']);
            if (adminRes.rows.length === 0) {
                const adminHash2 = bcrypt.hashSync('9999', 10);
                await pool.query('INSERT INTO admins (id, username, pin) VALUES ($1, $2, $3)', ['superadmin_1', 'superadmin', adminHash2]);
            }
        }
    } catch (e) {
        console.error("DB Init Error:", e);
    }
}
initDB();

const loginAttempts = new Map();
function checkLockout(username) {
    const record = loginAttempts.get(username);
    if (record && record.lockUntil && record.lockUntil > Date.now()) {
        return Math.ceil((record.lockUntil - Date.now()) / 1000);
    }
    return 0;
}
function recordAttempt(username, success) {
    if (success) { loginAttempts.delete(username); return; }
    const record = loginAttempts.get(username) || { attempts: 0 };
    record.attempts += 1;
    if (record.attempts >= 3) {
        record.lockUntil = Date.now() + 60000;
        record.attempts = 0;
    }
    loginAttempts.set(username, record);
}

// Admin Login
app.post('/admin/login', async (req, res) => {
    try {
        const { username, pin } = req.body;
        const lockoutTime = checkLockout(username);
        if (lockoutTime > 0) return res.status(403).json({ error: `Account locked. Try again in ${lockoutTime} seconds.` });

        const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        const admin = result.rows[0];
        if (!admin || !bcrypt.compareSync(pin, admin.pin)) {
            recordAttempt(username, false);
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }
        
        recordAttempt(username, true);
        const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, role: 'admin' });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer Login
app.post('/officer/login', async (req, res) => {
    try {
        const { username, pin } = req.body;
        const lockoutTime = checkLockout(username);
        if (lockoutTime > 0) return res.status(403).json({ error: `Account locked. Try again in ${lockoutTime} seconds.` });

        const result = await pool.query('SELECT * FROM polling_officers WHERE username = $1', [username]);
        const officer = result.rows[0];
        if (!officer || !bcrypt.compareSync(pin, officer.pin)) {
            recordAttempt(username, false);
            return res.status(401).json({ error: 'Invalid officer credentials' });
        }
        
        recordAttempt(username, true);
        const token = jwt.sign({ id: officer.id, role: 'officer', constituency_id: officer.constituency_id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, role: 'officer', constituency_id: officer.constituency_id });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer: Get Status
app.get('/officer/status/:constituencyId', async (req, res) => {
    try {
        const result = await pool.query('SELECT is_active, ballot_enabled FROM constituency_status WHERE constituency_id = $1', [req.params.constituencyId]);
        const row = result.rows[0];
        if (!row) return res.status(500).json({ error: 'Failed to fetch status' });
        res.json({ is_active: !!row.is_active, ballot_enabled: !!row.ballot_enabled });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer: Toggle Status
app.post('/officer/toggle', async (req, res) => {
    try {
        const { constituency_id, is_active } = req.body;
        await pool.query('UPDATE constituency_status SET is_active = $1, ballot_enabled = false WHERE constituency_id = $2', [is_active, constituency_id]);
        res.json({ success: true, is_active });
    } catch (err) { res.status(500).json({ error: 'Failed to update status' }); }
});

// Officer: Enable Ballot
app.post('/officer/enable-ballot', async (req, res) => {
    try {
        const { constituency_id } = req.body;
        await pool.query('UPDATE constituency_status SET ballot_enabled = true WHERE constituency_id = $1', [constituency_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to enable ballot' }); }
});

// Voter Scan/Generate
app.post('/generate', async (req, res) => {
    try {
        const { constituencyId } = req.body;
        let query = 'SELECT * FROM voters';
        let params = [];
        if (constituencyId) {
            query += ' WHERE constituency_id = $1';
            params.push(constituencyId);
        }
        
        const votersRes = await pool.query(query, params);
        if (votersRes.rows.length === 0) return res.status(500).json({ error: 'No voters available for this constituency' });
        
        let availableVoters = votersRes.rows;
        
        try {
            const fetchRes = await globalThis.fetch(`${process.env.ELECTION_SERVICE_URL || 'http://127.0.0.1:8002'}/voted-voters?constituencyId=${constituencyId || ''}`);
            if (fetchRes.ok) {
                const votedIds = await fetchRes.json();
                availableVoters = availableVoters.filter(v => !votedIds.includes(v.id));
            }
        } catch (e) { console.error("Failed to fetch voted voters", e); }

        if (availableVoters.length === 0) return res.status(400).json({ error: 'All voters in this constituency have already voted!' });

        const randomVoter = availableVoters[Math.floor(Math.random() * availableVoters.length)];
        
        const statusRes = await pool.query('SELECT is_active FROM constituency_status WHERE constituency_id = $1', [randomVoter.constituency_id]);
        const statusRow = statusRes.rows[0];
        
        if (!statusRow || !statusRow.is_active) {
            return res.status(403).json({ error: `Voting is currently STOPPED by the Polling Officer in this constituency (${randomVoter.constituency_id}).` });
        }

        const ackNumber = Math.floor(100000 + Math.random() * 900000).toString(); 
        await pool.query(`INSERT INTO ack_numbers (ack_number, voter_id) VALUES ($1, $2)`, [ackNumber, randomVoter.id]);
        res.json({ ackNumber, message: 'Acknowledge number generated successfully.' });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Voter Login
app.post('/login', async (req, res) => {
    try {
        const { ackNumber } = req.body;
        if (!ackNumber) return res.status(400).json({ error: 'Acknowledge number is required' });

        const ackRes = await pool.query(`
            SELECT a.*, v.name, v.constituency_id 
            FROM ack_numbers a 
            JOIN voters v ON a.voter_id = v.id 
            WHERE a.ack_number = $1
        `, [ackNumber]);
        
        const row = ackRes.rows[0];
        if (!row) return res.status(401).json({ error: 'Invalid Acknowledge Number' });
        if (row.is_used) return res.status(401).json({ error: 'Acknowledge Number has already been used' });

        const statusRes = await pool.query('SELECT is_active, ballot_enabled FROM constituency_status WHERE constituency_id = $1', [row.constituency_id]);
        const statusRow = statusRes.rows[0];
        
        if (!statusRow) return res.status(500).json({ error: 'Database error' });
        if (!statusRow.is_active) return res.status(403).json({ error: 'The voting machine is currently locked. Please wait.' });
        if (!statusRow.ballot_enabled) return res.status(403).json({ error: 'Please wait for the Polling Officer to enable the machine for your vote.' });

        const sessionId = uuidv4();
        await pool.query(`INSERT INTO sessions (session_id, voter_id, ack_number) VALUES ($1, $2, $3)`, [sessionId, row.voter_id, ackNumber]);
        res.json({ 
            sessionId, userId: row.voter_id, ackNumber, 
            voterDetails: { name: row.name, constituency_id: row.constituency_id },
            message: 'Session started' 
        });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/complete', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const sessionRes = await pool.query(`
            SELECT s.*, v.constituency_id 
            FROM sessions s
            JOIN voters v ON s.voter_id = v.id
            WHERE s.session_id = $1 AND s.is_active = true
        `, [sessionId]);
        
        const session = sessionRes.rows[0];
        if (!session) return res.status(400).json({ error: 'Invalid or inactive session' });

        await pool.query(`UPDATE sessions SET is_active = false WHERE session_id = $1`, [sessionId]);
        await pool.query(`UPDATE ack_numbers SET is_used = true WHERE ack_number = $1`, [session.ack_number]);
        await pool.query(`UPDATE constituency_status SET ballot_enabled = false WHERE constituency_id = $1`, [session.constituency_id]);
        
        res.json({ success: true, message: 'Session completed' });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/voters', async (req, res) => {
    try {
        const { constituencyId } = req.query;
        let query = 'SELECT * FROM voters';
        let params = [];
        if (constituencyId) {
            query += ' WHERE constituency_id = $1';
            params.push(constituencyId);
        }
        const result = await pool.query(query, params);
        res.json(result.rows || []);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.listen(port, () => {
    console.log(`Voter Auth Service running on port ${port}`);
});
