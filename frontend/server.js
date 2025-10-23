const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const port = 3000;

/* Proxy semua API, termasuk stream */
app.use(
  '/api',
  createProxyMiddleware({
    target: 'http://localhost:5000',
    changeOrigin: true,
    ws: true,                // dukung WebSocket / long-lived connection
    proxyTimeout: 0,         // jangan timeout untuk stream
    logLevel: 'debug',       // log detail supaya gampang debug
  })
);

/* Serve React build */
app.use(express.static(path.join(__dirname, 'build')));

/* React Router fallback */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`Frontend running at http://localhost:${port}`);
});
