const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const port = 3000;

// Proxy ke backend Flask
app.use('/api/video_feed', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  pathRewrite: {
    '^/api/video_feed': '/video_feed',
  },
  logLevel: 'debug',
  onProxyReq: (proxyReq, req) => {
  },
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.url}: ${err.message}`);
    res.status(500).send('Proxy error');
  },
}));

// Serve React build
app.use(express.static(path.join(__dirname, 'build')));

// Tangkap semua route lain
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`Frontend Node.js running at http://localhost:${port}`);
  console.log(`Proxying /api/video_feed -> http://localhost:5000/video_feed`);
});