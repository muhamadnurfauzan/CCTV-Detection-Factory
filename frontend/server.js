const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const port = 3000;

// Proxy ke backend Flask untuk HLS (prioritas tinggi)
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  pathRewrite: {
    '^/api/video_feed': '/video_feed',
    '^/api/hls': '/hls'
  },
  logLevel: 'debug', // Tambah logging untuk debug
  onProxyReq: (proxyReq, req) => {
    console.log(`Proxying ${req.method} ${req.url} to http://localhost:5000${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.url}: ${err.message}`);
    res.status(500).send('Proxy error');
  }
}));

// Serve React build dari folder 'build'
app.use(express.static(path.join(__dirname, 'build')));

// Tangkap semua route lain, kirim ke React index.html
app.get('*', (req, res) => {
  console.log(`Serving React app for ${req.url}`);
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Jalankan server
app.listen(port, () => {
  console.log(`Frontend Node.js running at http://localhost:${port}`);
  console.log(`Proxying /api/video_feed -> http://localhost:5000/video_feed`);
  console.log(`Proxying /api/hls -> http://localhost:5000/hls`);
});