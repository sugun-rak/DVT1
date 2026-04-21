const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());

// Proxy verification requests to Verification Service
app.use('/api/verification', createProxyMiddleware({ 
    target: process.env.VERIFICATION_SERVICE_URL || 'http://localhost:8001', 
    changeOrigin: true,
    pathRewrite: { '^/api/verification': '' }
}));

// Proxy voting requests to Voting Service
app.use('/api/voting', createProxyMiddleware({ 
    target: process.env.VOTING_SERVICE_URL || 'http://localhost:8002', 
    changeOrigin: true,
    pathRewrite: { '^/api/voting': '' }
}));

app.listen(port, () => {
    console.log(`API Gateway running on port ${port}`);
});
