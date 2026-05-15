const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const compression = require('compression');

const axios = require('axios');
const FailoverProxy = require('./failover-proxy');

const app = express();
const port = process.env.PORT || 8000;

app.use(compression());
app.use(cors());

// --- MIRROR CONFIGURATION ---
// These should be comma-separated lists of URLs (e.g., Render, GCP, Azure, Koyeb)
const verifMirrors = (process.env.VERIF_MIRRORS || process.env.VERIFICATION_SERVICE_URL || 'http://localhost:8001').split(',');
const votingMirrors = (process.env.VOTING_MIRRORS || process.env.VOTING_SERVICE_URL || 'http://localhost:8002').split(',');

const verifProxy = new FailoverProxy('Verification', verifMirrors);
const votingProxy = new FailoverProxy('Voting', votingMirrors);

// ── Keep-Alive Health Endpoints
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        service: 'api-gateway', 
        mirrors: { verif: verifMirrors.length, voting: votingMirrors.length },
        timestamp: new Date().toISOString() 
    });
});
app.get('/ping', (req, res) => res.status(200).json({ status: 'ok' }));

// Dynamic Target Resolver for Failover
const getRouter = async (proxy) => {
    return await proxy.getActiveTarget();
};

// Proxy verification requests with Failover
app.use('/api/verification', createProxyMiddleware({ 
    router: async () => await verifProxy.getActiveTarget(),
    target: verifMirrors[0], // Required default
    changeOrigin: true,
    pathRewrite: { '^/api/verification': '' },
    onError: (err, req, res) => {
        console.error('[Failover] Verification Proxy Error:', err.message);
        res.status(502).json({ error: 'All verification mirrors are currently unavailable.' });
    }
}));

// Proxy voting requests with Failover
app.use('/api/voting', createProxyMiddleware({ 
    router: async () => await votingProxy.getActiveTarget(),
    target: votingMirrors[0], // Required default
    changeOrigin: true,
    pathRewrite: { '^/api/voting': '' },
    onError: (err, req, res) => {
        console.error('[Failover] Voting Proxy Error:', err.message);
        res.status(502).json({ error: 'All voting mirrors are currently unavailable.' });
    }
}));

app.listen(port, () => {
    console.log(`🚀 Multi-Mirror API Gateway running on port ${port}`);
    console.log(`[Config] Verification Mirrors: ${verifMirrors.join(' | ')}`);
    console.log(`[Config] Voting Mirrors: ${votingMirrors.join(' | ')}`);
});
