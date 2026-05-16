const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));

// --- MIRROR CONFIGURATION ---
// Comma-separated list of URLs — Azure first, Render as backup
const verifMirrors = (process.env.VERIF_MIRRORS || process.env.VERIFICATION_SERVICE_URL || 'http://localhost:8001').split(',').map(s => s.trim()).filter(Boolean);
const votingMirrors = (process.env.VOTING_MIRRORS || process.env.VOTING_SERVICE_URL || 'http://localhost:8002').split(',').map(s => s.trim()).filter(Boolean);

console.log('>>> GATEWAY STARTING on port', port);
console.log('>>> Verification Mirrors:', verifMirrors);
console.log('>>> Voting Mirrors:', votingMirrors);

// --- FAILOVER LOGIC ---
// Tracks which mirror is currently healthy per service
const activeIndex = { verif: 0, voting: 0 };

async function getHealthyTarget(mirrors, key) {
  // Start from the last known good index
  for (let i = 0; i < mirrors.length; i++) {
    const idx = (activeIndex[key] + i) % mirrors.length;
    const target = mirrors[idx];
    try {
      await axios.get(`${target}/health`, { timeout: 3000 });
      activeIndex[key] = idx; // Remember the healthy one
      return target;
    } catch (e) {
      console.warn(`[Failover] ${key} mirror ${target} is down. Trying next...`);
    }
  }
  // If all fail, return the first one and let the proxy handle the error
  console.warn(`[Failover] All ${key} mirrors are down. Defaulting to first.`);
  return mirrors[0];
}

// Health endpoint for cron-job heartbeat
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    mirrors: { verif: verifMirrors, voting: votingMirrors },
    timestamp: new Date().toISOString()
  });
});
app.get('/ping', (req, res) => res.json({ status: 'ok' }));

// Proxy verification requests with Failover
app.use('/api/verification', createProxyMiddleware({
  router: () => getHealthyTarget(verifMirrors, 'verif'),
  target: verifMirrors[0],
  changeOrigin: true,
  pathRewrite: { '^/api/verification': '' },
  on: {
    error: (err, req, res) => {
      console.error('[Failover] Verification Proxy Error:', err.message);
      res.status(502).json({ error: 'All verification mirrors are currently unavailable.' });
    }
  }
}));

// Proxy voting requests with Failover
app.use('/api/voting', createProxyMiddleware({
  router: () => getHealthyTarget(votingMirrors, 'voting'),
  target: votingMirrors[0],
  changeOrigin: true,
  pathRewrite: { '^/api/voting': '' },
  on: {
    error: (err, req, res) => {
      console.error('[Failover] Voting Proxy Error:', err.message);
      res.status(502).json({ error: 'All voting mirrors are currently unavailable.' });
    }
  }
}));

app.listen(port, () => {
  console.log(`🚀 Multi-Mirror API Gateway running on port ${port}`);
});
