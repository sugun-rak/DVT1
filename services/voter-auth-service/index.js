require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

// --- WhatsApp Mirroring Setup ---
let lastQR = null;
let whatsappReady = false;

const whatsappClient = new Client({
    authStrategy: new LocalAuth({ clientId: "dvt1-voter-auth" }),
    puppeteer: {
        handleSIGINT: false,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

whatsappClient.on('qr', (qr) => {
    lastQR = qr;
    whatsappReady = false;
    console.log('[WHATSAPP] New QR Code generated. Scan it at /admin/whatsapp-qr');
});

whatsappClient.on('ready', () => {
    lastQR = null;
    whatsappReady = true;
    console.log('[WHATSAPP SUCCESS] Mirroring is active. Messages will send from your number.');
});

whatsappClient.on('disconnected', (reason) => {
    whatsappReady = false;
    console.warn('[WHATSAPP DISCONNECTED] Reason:', reason);
    sendNotificationEmail('⚠️ WhatsApp Mirror Disconnected', 
        `Your WhatsApp Mirror has disconnected (Reason: ${reason}).\n\n` +
        `Please visit the admin dashboard or /admin/whatsapp-qr to re-scan the QR code and restore service.`
    );
});

whatsappClient.initialize().catch(err => console.error('[WHATSAPP INIT ERROR]', err.message));

async function sendWhatsApp(to, body) {
    if (!whatsappReady) return false;
    try {
        // Format number: remove +, spaces, and ensure it ends with @c.us
        let cleanNumber = to.replace(/\D/g, '');
        if (!cleanNumber.endsWith('@c.us')) cleanNumber += '@c.us';
        
        await whatsappClient.sendMessage(cleanNumber, body);
        console.log(`[WHATSAPP SUCCESS] Message sent to ${to}`);
        return true;
    } catch (err) {
        console.error(`[WHATSAPP FAILURE] Failed to send to ${to}:`, err.message);
        return false;
    }
}

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: process.env.SMTP_USER || 'sugun.rakshit@gmail.com',
        pass: process.env.SMTP_PASS || ''
    },
    pool: true,            // Reuse connections
    maxConnections: 5,     // Limit concurrent connections
    maxMessages: 100       // Limit messages per connection
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('[SMTP VERIFY FAILURE] Connection failed:', error.message);
        if (error.code === 'EAUTH') {
            console.error('[SMTP ADVICE] Authentication failed. If using Gmail, verify your App Password and ensure 2-Step Verification is enabled.');
        }
    } else {
        console.log('[SMTP SUCCESS] Email server is ready to deliver notifications.');
    }
});

async function sendNotificationEmail(subject, text) {
    const startTime = Date.now();
    try {
        // Try WhatsApp first as a modern notification
        const waSuccess = await sendWhatsApp(process.env.ADMIN_PHONE || '917002011030', `*DVS ALERT*: ${subject}\n\n${text}`);
        
        if (!process.env.SMTP_PASS) {
            if (!waSuccess) console.log(`\n[MOCK EMAIL] To: sugun.rakshit@gmail.com | Subject: ${subject}\nBody: ${text}\n`);
            return;
        }

        await transporter.sendMail({
            from: process.env.SMTP_USER || 'sugun.rakshit@gmail.com',
            to: 'sugun.rakshit@gmail.com',
            subject: `Detail Notification for the DVS Services: ${subject}`,
            text: text
        });
        const duration = Date.now() - startTime;
        console.log(`[SMTP SUCCESS] Notification sent in ${duration}ms: ${subject}`);
    } catch (e) {
        console.error(`[NOTIFY FAILURE]`, e.message);
    }
}

// Send notification to guest via WhatsApp or Email
async function sendGuestNotification(toEmail, toPhone, subject, htmlBody, plainTextBody) {
    let sentViaWhatsApp = false;
    
    if (toPhone) {
        sentViaWhatsApp = await sendWhatsApp(toPhone, plainTextBody);
    }

    // Always send email as the "Master Record", or as fallback if WA failed
    await sendGuestEmail(toEmail, subject, htmlBody);
    
    if (sentViaWhatsApp) {
        console.log(`[GUEST NOTIFY] Delivered via WhatsApp to ${toPhone}`);
    } else {
        console.log(`[GUEST NOTIFY] Delivered via Email only to ${toEmail}`);
    }
}

// Send email to a specific guest recipient (HTML formatted)
async function sendGuestEmail(to, subject, htmlBody) {
    const startTime = Date.now();
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
        const duration = Date.now() - startTime;
        console.log(`[SMTP SUCCESS] Guest email sent to ${to} in ${duration}ms: ${subject}`);
        if (duration > 3000) {
            console.warn(`[SMTP LATENCY WARNING] SMTP server is slow. Took ${duration}ms to send guest email.`);
        }
    } catch (e) {
        const duration = Date.now() - startTime;
        console.error(`[SMTP FAILURE] Failed to send guest email to ${to} after ${duration}ms:`, {
            message: e.message,
            code: e.code,
            command: e.command,
            response: e.response
        });
    }
}

// Format a timestamp using a fixed UTC offset (no ICU dependency — works on all Node.js builds)
function formatWithOffset(dateMs, offsetMins, label, tzAbbr) {
    const pad = n => String(n).padStart(2, '0');
    const shifted = new Date(dateMs + offsetMins * 60000);
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const wd = weekdays[shifted.getUTCDay()];
    const mo = months[shifted.getUTCMonth()];
    const d = pad(shifted.getUTCDate());
    const yr = shifted.getUTCFullYear();
    let h = shifted.getUTCHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const mi = pad(shifted.getUTCMinutes());
    const se = pad(shifted.getUTCSeconds());
    const sign = offsetMins >= 0 ? '+' : '-';
    const absOff = Math.abs(offsetMins);
    const offH = pad(Math.floor(absOff / 60));
    const offM = pad(absOff % 60);
    return `<b>${label}:</b> ${wd}, ${d} ${mo} ${yr} — ${h}:${mi}:${se} ${ampm} ${tzAbbr} (UTC${sign}${offH}:${offM})`;
}

// Build a styled HTML email body for guest access notifications
function buildGuestAccessEmail({ guestName, adminPin, superadminPin, officerPin, expiresAt, guestTimezone, timezoneOffsetMinutes }) {
    const localOffsetMins = typeof timezoneOffsetMinutes === 'number' ? timezoneOffsetMinutes : 0;
    // Try to derive a short timezone abbreviation from the IANA name (e.g. 'Asia/Kolkata' → 'IST')
    const localAbbr = guestTimezone ? guestTimezone.split('/').pop().replace('_', ' ') : 'Local';
    const localTime = formatWithOffset(expiresAt, localOffsetMins, `Your Local Time (${guestTimezone || 'Local'})`, localAbbr);
    const istTime   = formatWithOffset(expiresAt, 330, 'IST — India Standard Time', 'IST');
    const utcTime   = formatWithOffset(expiresAt, 0,   'GMT / UTC', 'UTC');

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
function buildGuestExpiredEmail({ guestName, expiredAt, guestTimezone, timezoneOffsetMinutes }) {
    const localOffsetMins = typeof timezoneOffsetMinutes === 'number' ? timezoneOffsetMinutes : 0;
    const localAbbr = guestTimezone ? guestTimezone.split('/').pop().replace('_', ' ') : 'Local';
    const localTime = formatWithOffset(expiredAt, localOffsetMins, `Your Local Time (${guestTimezone || 'Local'})`, localAbbr);
    const istTime   = formatWithOffset(expiredAt, 330, 'IST — India Standard Time', 'IST');
    const utcTime   = formatWithOffset(expiredAt, 0,   'GMT / UTC', 'UTC');

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
// Keep a small buffer of recently expired sessions to allow late notification requests
const recent_expiries = new Map(); 

setInterval(() => {
    const now = Date.now();
    for (const [pin, data] of guest_pins.entries()) {
        if (data.session.expiresAt && now > data.session.expiresAt) {
            // Buffer the email for 5 minutes before total deletion
            recent_expiries.set(data.session.guestEmail, { ...data.session, deletedAt: now });
            guest_pins.delete(pin);
        }
    }
    // Cleanup the buffer
    for (const [email, data] of recent_expiries.entries()) {
        if (now - data.deletedAt > 300000) recent_expiries.delete(email);
    }
}, 60000);


const app = express();
const port = process.env.PORT || 8001;
const JWT_SECRET = process.env.JWT_SECRET || 'dvt-secure-jwt-secret-key-2026';

app.use(compression());
app.use(cors());
app.use(express.json());

// ── Rate Limiter — sends Retry-After header so frontend backoff knows how long to wait
const limiter = rateLimit({
    windowMs: 60 * 1000,          // 1-minute window
    max: 300,                     // 300 requests per IP per minute
    standardHeaders: true,        // includes RateLimit-* headers
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again shortly.' }
});
app.use(limiter);

// ── In-Memory Status Cache (10s TTL) — decouples DB load from admin polling frequency
const statusCache = new Map();
function getCached(key) {
    const entry = statusCache.get(key);
    if (entry && (Date.now() - entry.at) < 10000) return entry.data;
    return null;
}
function setCache(key, data) {
    statusCache.set(key, { data, at: Date.now() });
    // Evict old cache entries every 100 sets to prevent unbounded growth
    if (statusCache.size > 200) {
        const oldest = [...statusCache.entries()].sort((a,b) => a[1].at - b[1].at)[0];
        if (oldest) statusCache.delete(oldest[0]);
    }
}

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
        const { email, name, timezone, phone } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'Email and Name required' });
        
        const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();
        const adminPin = generatePin();
        const superadminPin = generatePin();
        const officerPin = generatePin();
        
        const guestTimezone = timezone || 'UTC';
        const timezoneOffsetMinutes = typeof req.body.timezoneOffsetMinutes === 'number'
            ? req.body.timezoneOffsetMinutes : 0;
        
        const sharedSession = {
            guestEmail: email,
            guestPhone: phone,
            guestName: name,
            guestTimezone,
            timezoneOffsetMinutes,
            expiresAt: null, 
            timerStarted: false
        };
        
        guest_pins.set(adminPin, { role: 'admin', session: sharedSession, username: 'admin' });
        guest_pins.set(superadminPin, { role: 'superadmin', session: sharedSession, username: 'superadmin' });
        guest_pins.set(officerPin, { role: 'officer', universal: true, session: sharedSession });
        
        // Owner notification
        sendNotificationEmail('New Guest Beta Tester Registered', 
            `User ${name} (${email}, Phone: ${phone || 'N/A'}) has registered.\n` +
            `SuperAdmin PIN: ${superadminPin}\nAdmin PIN: ${adminPin}\nOfficer PIN: ${officerPin}`
        );

        // Guest notification
        const guestHtml = buildGuestAccessEmail({ 
            guestName: name, adminPin, superadminPin, officerPin, 
            expiresAt: Date.now() + 15 * 60 * 1000, 
            guestTimezone, timezoneOffsetMinutes 
        });

        const plainText = `🗳️ DVS Access Granted!\nHello ${name}, your demo PINs (15 min) are:\n\n` +
            `👑 SuperAdmin: ${superadminPin}\n` +
            `🛡️ Admin: ${adminPin}\n` +
            `🗳️ Officer: ${officerPin}\n\n` +
            `Timer starts on first login. Enjoy!`;

        sendGuestNotification(email, phone, '🗳️ DVS Demo Access — Your Temporary PINs (15 min)', guestHtml, plainText);
        
        res.json({ success: true, adminPin, superadminPin, officerPin });
    } catch (err) { res.status(500).json({ error: 'Failed to generate guest pins' }); }
});

// Admin: WhatsApp QR Code Viewer
app.get('/admin/whatsapp-qr', async (req, res) => {
    if (whatsappReady) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; height: 100vh;">
                <h1 style="color: #22c55e;">✅ WhatsApp Connected</h1>
                <p>Your number is successfully mirrored. Notifications will send automatically.</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; background: #38bdf8; border: none; border-radius: 5px; color: white; cursor: pointer;">Check Status</button>
            </div>
        `);
    }

    if (!lastQR) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; height: 100vh;">
                <h1>⏳ Initializing WhatsApp...</h1>
                <p>The system is starting up. Please refresh in 10 seconds.</p>
                <script>setTimeout(() => window.location.reload(), 5000);</script>
            </div>
        `);
    }

    try {
        const qrImage = await qrcode.toDataURL(lastQR);
        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; min-height: 100vh;">
                <h1 style="color: #38bdf8;">📲 Link Your WhatsApp</h1>
                <p>Scan this QR code with your phone (WhatsApp > Linked Devices) to enable messaging notifications.</p>
                <div style="background: white; display: inline-block; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <img src="${qrImage}" style="width: 300px; height: 300px;" />
                </div>
                <p style="color: #94a3b8; font-size: 0.9em;">This code refreshes automatically. Once scanned, this page will update.</p>
                <script>setInterval(() => { if (!document.hidden) window.location.reload(); }, 15000);</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Error generating QR code');
    }
});

// Guest Expiry Notification — called by frontend when JWT expires
app.post('/guest/expired-notify', async (req, res) => {
    try {
        const { email, name, timezone, expiredAt, timezoneOffsetMinutes } = req.body;
        if (!email || !name) return res.status(400).json({ error: 'Email and name required' });

        // Find the shared session for this guest group to prevent duplicate emails
        let sessionToNotify = recent_expiries.get(email);
        if (!sessionToNotify) {
            for (const pinData of guest_pins.values()) {
                if (pinData.session && pinData.session.guestEmail === email) {
                    sessionToNotify = pinData.session;
                    break;
                }
            }
        }
        
        if (sessionToNotify) {
            if (sessionToNotify.notificationSent) {
                return res.json({ success: true, message: 'Notification already sent' });
            }
            sessionToNotify.notificationSent = true;
        }

        const expiredDate = expiredAt ? parseInt(expiredAt) : Date.now();
        const guestTimezone = timezone || 'UTC';
        const offsetMins = typeof timezoneOffsetMinutes === 'number' ? timezoneOffsetMinutes : 0;

        const html = buildGuestExpiredEmail({ guestName: name, expiredAt: expiredDate, guestTimezone, timezoneOffsetMinutes: offsetMins });
        sendGuestEmail(email, '⏰ DVS Demo Session Expired — Request New Access', html);
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
        const pinData = guest_pins.get(pin);
        if (pinData && (pinData.role === 'admin' || pinData.role === 'superadmin') && pinData.username === username) {
            const session = pinData.session;
            
            // Start timer on very first login
            if (!session.timerStarted) {
                session.expiresAt = Date.now() + 15 * 60 * 1000;
                session.timerStarted = true;
                console.log(`[Timer Start] Guest session activated for ${session.guestEmail}. Expires in 15m.`);
            }

            if (Date.now() < session.expiresAt) {
                recordAttempt(username, true);
                const guestRole = pinData.role;
                // Calculate remaining seconds for JWT
                const remainingSecs = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
                const token = jwt.sign({ id: `guest_${guestRole}`, role: guestRole }, JWT_SECRET, { expiresIn: remainingSecs });
                return res.json({ token, role: guestRole });
            } else {
                return res.status(401).json({ error: 'Guest access has expired.' });
            }
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
        sendNotificationEmail('Owner Admin Login', `The permanent Owner (${username}, role: ${role}) account was just used to log in at ${new Date().toISOString()}.`);
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

        // Check guest officer PIN
        const pinData = guest_pins.get(pin);
        if (pinData && pinData.role === 'officer') {
            const session = pinData.session;

            // Start timer on very first login
            if (!session.timerStarted) {
                session.expiresAt = Date.now() + 15 * 60 * 1000;
                session.timerStarted = true;
                console.log(`[Timer Start] Guest session activated for ${session.guestEmail}. Expires in 15m.`);
            }

            if (Date.now() < session.expiresAt) {
                recordAttempt(username, true);
                const cId = username.startsWith('officer_') ? username.replace('officer_', '') : 's_1_c_1';
                const remainingSecs = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
                const token = jwt.sign({ id: 'guest_officer', role: 'officer', constituency_id: cId }, JWT_SECRET, { expiresIn: remainingSecs });
                return res.json({ token, role: 'officer', constituency_id: cId });
            } else {
                return res.status(401).json({ error: 'Guest access has expired.' });
            }
        }

        const result = await pool.query('SELECT * FROM polling_officers WHERE username = $1', [username]);
        const officer = result.rows[0];
        if (!officer || !bcrypt.compareSync(pin, officer.pin)) {
            recordAttempt(username, false);
            return res.status(401).json({ error: 'Invalid officer credentials. Remember: each officer PIN only works for their specific assigned area.' });
        }
        
        recordAttempt(username, true);
        sendNotificationEmail('Owner Officer Login', `The permanent Owner Officer account (${username}) was just used to log in at ${new Date().toISOString()}.`);
        const token = jwt.sign({ id: officer.id, role: 'officer', constituency_id: officer.constituency_id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, role: 'officer', constituency_id: officer.constituency_id });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer: Get Status (with 10s cache to reduce DB load)
app.get('/officer/status/:constituencyId', async (req, res) => {
    try {
        const cId = req.params.constituencyId;
        const cached = getCached(`status:${cId}`);
        if (cached) return res.json(cached);

        const result = await pool.query('SELECT is_active, ballot_enabled FROM constituency_status WHERE constituency_id = $1', [cId]);
        const row = result.rows[0];
        const data = { is_active: !!row?.is_active, ballot_enabled: !!row?.ballot_enabled };
        setCache(`status:${cId}`, data);
        res.json(data);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Admin: Bulk Status Check (solves latency issues)
app.get('/officer/status-batch', async (req, res) => {
    try {
        const result = await pool.query('SELECT constituency_id, is_active, ballot_enabled FROM constituency_status');
        const statusMap = {};
        result.rows.forEach(r => {
            statusMap[r.constituency_id] = { is_active: !!r.is_active, ballot_enabled: !!r.ballot_enabled };
        });
        res.json(statusMap);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Officer: Toggle Status (invalidate cache on write)
app.post('/officer/toggle', async (req, res) => {
    try {
        const { constituency_id, is_active } = req.body;
        await pool.query(`
            INSERT INTO constituency_status (constituency_id, is_active, ballot_enabled) 
            VALUES ($1, $2, false)
            ON CONFLICT (constituency_id) 
            DO UPDATE SET is_active = $2, ballot_enabled = false
        `, [constituency_id, is_active]);
        statusCache.delete(`status:${constituency_id}`); // Invalidate cache immediately
        res.json({ success: true, is_active });
    } catch (err) { res.status(500).json({ error: 'Failed to update status' }); }
});

// Officer: Enable Ballot (invalidate cache on write)
app.post('/officer/enable-ballot', async (req, res) => {
    try {
        const { constituency_id } = req.body;
        await pool.query(`
            INSERT INTO constituency_status (constituency_id, is_active, ballot_enabled) 
            VALUES ($1, true, true)
            ON CONFLICT (constituency_id) 
            DO UPDATE SET ballot_enabled = true
        `, [constituency_id]);
        statusCache.delete(`status:${constituency_id}`); // Invalidate cache immediately
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

// ── Keep-Alive Health Endpoints — NOW pings DB too (keeps Neon awake via cron-job.org)
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
        service: 'voter-auth-service',
        db: dbStatus,
        timestamp: new Date().toISOString()
    });
});
app.get('/ping', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(port, () => {
    console.log(`Voter Auth Service running on port ${port}`);
});
