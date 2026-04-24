require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER || 'sugun.rakshit@gmail.com',
        pass: process.env.SMTP_PASS || ''
    }
});

async function sendNotificationEmail(subject, text) {
    try {
        if (!process.env.SMTP_PASS) {
            console.log(`\n[MOCK EMAIL] To: sugun.rakshit@gmail.com | Subject: ${subject}\nBody: ${text}\n`);
            return;
        }
        await transporter.sendMail({
            from: process.env.SMTP_USER || 'sugun.rakshit@gmail.com',
            to: 'sugun.rakshit@gmail.com',
            subject: `Detail Notification for the DVS Services: ${subject}`,
            text: text
        });
    } catch (e) {
        console.error("Email failed to send:", e);
    }
}

// Send email to a specific guest recipient (HTML formatted)
async function sendGuestEmail(to, subject, htmlBody) {
    try {
        if (!process.env.SMTP_PASS) {
            console.log(`\n[MOCK GUEST EMAIL] To: ${to} | Subject: ${subject}\n`);
            return;
        }
        await transporter.sendMail({
            from: `"DVS Digital Voting System" <${process.env.SMTP_USER || 'sugun.rakshit@gmail.com'}>`,
            to: to,
            subject: subject,
            html: htmlBody
        });
    } catch (e) {
        console.error("Guest email failed to send:", e);
    }
}

// Format a Date in a given IANA timezone, returning a human-readable string
function formatInTimezone(date, tz, label) {
    try {
        const formatted = date.toLocaleString('en-US', {
            timeZone: tz,
            weekday: 'short', year: 'numeric', month: 'short',
            day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true, timeZoneName: 'short'
        });
        return `<b>${label}:</b> ${formatted}`;
    } catch (e) {
        return `<b>${label}:</b> ${date.toISOString()}`;
    }
}

// Build a styled HTML email body for guest access notifications
function buildGuestAccessEmail({ guestName, adminPin, superadminPin, officerPin, expiresAt, guestTimezone }) {
    const expiryDate = new Date(expiresAt);
    const localTz = guestTimezone || 'UTC';
    const localTime = formatInTimezone(expiryDate, localTz, `Your Local Time (${localTz})`);
    const istTime = formatInTimezone(expiryDate, 'Asia/Kolkata', 'IST — India Standard Time (UTC+05:30)');
    const utcTime = `<b>GMT / UTC:</b> ${expiryDate.toUTCString()}`;

    return `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0">
      <div style="max-width:600px;margin:0 auto;padding:32px 16px">

        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#38bdf8;font-size:28px;margin:0">🗳️ DVS Digital Voting System</h1>
          <p style="color:#94a3b8;margin:8px 0 0">Beta Tester Demo Access Granted</p>
        </div>

        <div style="background:#1e293b;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #334155">
          <p style="margin:0 0 8px">Hello <strong>${guestName}</strong>,</p>
          <p style="margin:0;color:#94a3b8">Your temporary <strong style="color:#38bdf8">15-minute demo access</strong> has been generated. Use the PINs below to explore all three management roles on the DVS platform.</p>
        </div>

        <!-- PINs -->
        <div style="background:#2d1b69;border-radius:10px;padding:20px;margin-bottom:16px;border-left:4px solid #a855f7">
          <p style="margin:0 0 6px;color:#c4b5fd;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">👑 Super Admin</p>
          <p style="margin:0 0 4px">Username: <code style="color:#e2e8f0">superadmin</code></p>
          <p style="margin:0">PIN: <strong style="font-size:28px;letter-spacing:6px;color:#a855f7;font-family:monospace">${superadminPin}</strong></p>
          <p style="margin:8px 0 0;font-size:12px;color:#c4b5fd">Access: Live Results, Stats, Export</p>
        </div>

        <div style="background:#1e3a5f;border-radius:10px;padding:20px;margin-bottom:16px;border-left:4px solid #38bdf8">
          <p style="margin:0 0 6px;color:#93c5fd;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">🛡️ General Admin</p>
          <p style="margin:0 0 4px">Username: <code style="color:#e2e8f0">admin</code></p>
          <p style="margin:0">PIN: <strong style="font-size:28px;letter-spacing:6px;color:#38bdf8;font-family:monospace">${adminPin}</strong></p>
          <p style="margin:8px 0 0;font-size:12px;color:#93c5fd">Access: Machine Health Dashboard</p>
        </div>

        <div style="background:#14532d;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #22c55e">
          <p style="margin:0 0 6px;color:#86efac;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">🗳️ Polling Officer</p>
          <p style="margin:0 0 4px">Username: <code style="color:#e2e8f0">officer_[any area]</code> — pick any constituency</p>
          <p style="margin:0">PIN: <strong style="font-size:28px;letter-spacing:6px;color:#22c55e;font-family:monospace">${officerPin}</strong></p>
          <p style="margin:8px 0 0;font-size:12px;color:#86efac">✅ Universal — works for every constituency</p>
        </div>

        <!-- Expiry Times in 3 Timezones -->
        <div style="background:#1e293b;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #f59e0b">
          <p style="margin:0 0 12px;color:#fcd34d;font-size:13px;font-weight:bold">⏱️ Session Expires At (All 3 Time Zones)</p>
          <p style="margin:0 0 8px;font-size:14px">${localTime}</p>
          <p style="margin:0 0 8px;font-size:14px">${istTime}</p>
          <p style="margin:0;font-size:14px">${utcTime}</p>
        </div>

        <div style="background:#1e293b;border-radius:10px;padding:16px;margin-bottom:24px;border:1px solid #334155">
          <p style="margin:0;color:#94a3b8;font-size:13px">⚠️ These PINs are <strong>single-use temporary credentials</strong> and expire in 15 minutes. Do not share them. After expiry, you will be automatically logged out.</p>
        </div>

        <div style="text-align:center;color:#475569;font-size:12px">
          <p style="margin:0">© ${new Date().getFullYear()} SUGUN-RAKSHIT DVS Digital Voting System</p>
          <p style="margin:4px 0 0">Secure. Transparent. Verifiable.</p>
        </div>
      </div>
    </body></html>
    `;
}

// Build expiry notification email HTML
function buildGuestExpiredEmail({ guestName, expiredAt, guestTimezone }) {
    const expiryDate = new Date(expiredAt);
    const localTz = guestTimezone || 'UTC';
    const localTime = formatInTimezone(expiryDate, localTz, `Your Local Time (${localTz})`);
    const istTime = formatInTimezone(expiryDate, 'Asia/Kolkata', 'IST — India Standard Time (UTC+05:30)');
    const utcTime = `<b>GMT / UTC:</b> ${expiryDate.toUTCString()}`;

    return `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0">
      <div style="max-width:600px;margin:0 auto;padding:32px 16px">

        <div style="text-align:center;margin-bottom:32px">
          <h1 style="color:#38bdf8;font-size:28px;margin:0">🗳️ DVS Digital Voting System</h1>
          <p style="color:#94a3b8;margin:8px 0 0">Demo Session Expired</p>
        </div>

        <div style="background:#7f1d1d;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #ef4444">
          <h2 style="margin:0 0 12px;color:#fca5a5">⏰ Your Demo Session Has Expired</h2>
          <p style="margin:0;color:#fecaca">Hello <strong>${guestName}</strong>, your 15-minute demo access to DVS has ended and you have been automatically logged out.</p>
        </div>

        <div style="background:#1e293b;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #f59e0b">
          <p style="margin:0 0 12px;color:#fcd34d;font-size:13px;font-weight:bold">⏱️ Session Expired At (All 3 Time Zones)</p>
          <p style="margin:0 0 8px;font-size:14px">${localTime}</p>
          <p style="margin:0 0 8px;font-size:14px">${istTime}</p>
          <p style="margin:0;font-size:14px">${utcTime}</p>
        </div>

        <div style="background:#1e293b;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #334155;text-align:center">
          <p style="margin:0 0 16px;color:#94a3b8">To continue exploring the DVS platform, request a new demo session from the login screen.</p>
          <p style="margin:0;font-size:24px">🔑 Request New Access → <strong style="color:#38bdf8">Beta Tester Registration</strong></p>
        </div>

        <div style="text-align:center;color:#475569;font-size:12px">
          <p style="margin:0">© ${new Date().getFullYear()} SUGUN-RAKSHIT DVS Digital Voting System</p>
          <p style="margin:4px 0 0">Secure. Transparent. Verifiable.</p>
        </div>
      </div>
    </body></html>
    `;
}

const guest_pins = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [pin, data] of guest_pins.entries()) {
        if (now > data.expiresAt) guest_pins.delete(pin);
    }
}, 60000);


const app = express();
const port = process.env.PORT || 8001;
const JWT_SECRET = process.env.JWT_SECRET || 'dvt-secure-jwt-secret-key-2026';

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

// Guest Register
app.post('/guest/register', async (req, res) => {
    try {
        const { email, name, timezone } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'Email and Name required' });
        
        const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();
        const adminPin = generatePin();
        const superadminPin = generatePin();
        const officerPin = generatePin();
        
        const expiresAt = Date.now() + 15 * 60 * 1000;
        const guestTimezone = timezone || 'UTC';
        
        // Store email, name, and timezone so we can send the expiry notification later
        guest_pins.set(adminPin, { role: 'admin', expiresAt, username: 'admin', guestEmail: email, guestName: name, guestTimezone });
        guest_pins.set(superadminPin, { role: 'superadmin', expiresAt, username: 'superadmin', guestEmail: email, guestName: name, guestTimezone });
        guest_pins.set(officerPin, { role: 'officer', expiresAt, universal: true, guestEmail: email, guestName: name, guestTimezone });
        
        // Owner notification (plain text, as before)
        await sendNotificationEmail('New Guest Beta Tester Registered', 
            `User ${name} (${email}) has registered for a 15-minute Guest Session.\n` +
            `SuperAdmin Temp PIN: ${superadminPin} (username: superadmin)\n` +
            `Admin Temp PIN: ${adminPin} (username: admin)\n` +
            `Officer Temp PIN: ${officerPin} (UNIVERSAL — any constituency)\n` +
            `Expires at: ${new Date(expiresAt).toISOString()}\n` +
            `Guest Timezone: ${guestTimezone}`
        );

        // Guest notification — send styled HTML email to the guest's own inbox
        const guestHtml = buildGuestAccessEmail({ guestName: name, adminPin, superadminPin, officerPin, expiresAt, guestTimezone });
        await sendGuestEmail(email, '🗳️ DVS Demo Access — Your Temporary PINs (15 min)', guestHtml);
        
        res.json({ success: true, adminPin, superadminPin, officerPin, expiresAt });
    } catch (err) { res.status(500).json({ error: 'Failed to generate guest pins' }); }
});

// Guest Expiry Notification — called by frontend when JWT expires
app.post('/guest/expired-notify', async (req, res) => {
    try {
        const { email, name, timezone, expiredAt } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'Email and name required' });
        const expiredDate = expiredAt ? parseInt(expiredAt) : Date.now();
        const guestTimezone = timezone || 'UTC';

        const html = buildGuestExpiredEmail({ guestName: name, expiredAt: expiredDate, guestTimezone });
        await sendGuestEmail(email, '⏰ DVS Demo Session Expired — Request New Access', html);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to send expiry notification' }); }
});

// Admin Login (handles admin AND superadmin roles)
app.post('/admin/login', async (req, res) => {
    try {
        const { username, pin } = req.body;
        const lockoutTime = checkLockout(username);
        if (lockoutTime > 0) return res.status(403).json({ error: `Account locked. Try again in ${lockoutTime} seconds.` });

        // Check guest PIN (admin or superadmin)
        const guestData = guest_pins.get(pin);
        if (guestData && (guestData.role === 'admin' || guestData.role === 'superadmin') && guestData.username === username && Date.now() < guestData.expiresAt) {
            recordAttempt(username, true);
            const guestRole = guestData.role;
            const token = jwt.sign({ id: `guest_${guestRole}`, role: guestRole }, JWT_SECRET, { expiresIn: '15m' });
            return res.json({ token, role: guestRole });
        }

        const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        const admin = result.rows[0];
        if (!admin || !bcrypt.compareSync(pin, admin.pin)) {
            recordAttempt(username, false);
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }
        
        recordAttempt(username, true);
        // Determine role from username
        const role = admin.username === 'superadmin' ? 'superadmin' : 'admin';
        await sendNotificationEmail('Owner Admin Login', `The permanent Owner (${username}, role: ${role}) account was just used to log in at ${new Date().toISOString()}.`);
        const token = jwt.sign({ id: admin.id, role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, role });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer Login
app.post('/officer/login', async (req, res) => {
    try {
        const { username, pin } = req.body;
        const lockoutTime = checkLockout(username);
        if (lockoutTime > 0) return res.status(403).json({ error: `Account locked. Try again in ${lockoutTime} seconds.` });

        // Check guest officer PIN — UNIVERSAL: works for any constituency the tester selects.
        // Just like the permanent owner PIN 0000 works for any officer username.
        const guestData = guest_pins.get(pin);
        if (guestData && guestData.role === 'officer' && Date.now() < guestData.expiresAt) {
            recordAttempt(username, true);
            // Derive constituency from whichever username was selected at login
            const cId = username.startsWith('officer_') ? username.replace('officer_', '') : 's_1_c_1';
            const token = jwt.sign({ id: 'guest_officer', role: 'officer', constituency_id: cId }, JWT_SECRET, { expiresIn: '15m' });
            return res.json({ token, role: 'officer', constituency_id: cId });
        }

        const result = await pool.query('SELECT * FROM polling_officers WHERE username = $1', [username]);
        const officer = result.rows[0];
        if (!officer || !bcrypt.compareSync(pin, officer.pin)) {
            recordAttempt(username, false);
            return res.status(401).json({ error: 'Invalid officer credentials. Remember: each officer PIN only works for their specific assigned area.' });
        }
        
        recordAttempt(username, true);
        await sendNotificationEmail('Owner Officer Login', `The permanent Owner Officer account (${username}) was just used to log in at ${new Date().toISOString()}.`);
        const token = jwt.sign({ id: officer.id, role: 'officer', constituency_id: officer.constituency_id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, role: 'officer', constituency_id: officer.constituency_id });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer: Get Status
app.get('/officer/status/:constituencyId', async (req, res) => {
    try {
        const result = await pool.query('SELECT is_active, ballot_enabled FROM constituency_status WHERE constituency_id = $1', [req.params.constituencyId]);
        const row = result.rows[0];
        if (!row) return res.json({ is_active: false, ballot_enabled: false });
        res.json({ is_active: !!row.is_active, ballot_enabled: !!row.ballot_enabled });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer: Toggle Status
app.post('/officer/toggle', async (req, res) => {
    try {
        const { constituency_id, is_active } = req.body;
        await pool.query(`
            INSERT INTO constituency_status (constituency_id, is_active, ballot_enabled) 
            VALUES ($1, $2, false)
            ON CONFLICT (constituency_id) 
            DO UPDATE SET is_active = $2, ballot_enabled = false
        `, [constituency_id, is_active]);
        res.json({ success: true, is_active });
    } catch (err) { res.status(500).json({ error: 'Failed to update status' }); }
});

// Officer: Enable Ballot
app.post('/officer/enable-ballot', async (req, res) => {
    try {
        const { constituency_id } = req.body;
        await pool.query(`
            INSERT INTO constituency_status (constituency_id, is_active, ballot_enabled) 
            VALUES ($1, true, true)
            ON CONFLICT (constituency_id) 
            DO UPDATE SET ballot_enabled = true
        `, [constituency_id]);
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

// ── Keep-Alive Health Endpoints (for cron-job.org pinging) ──────────────
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'voter-auth-service', timestamp: new Date().toISOString() });
});
app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Voter Auth Service running on port ${port}`);
});
