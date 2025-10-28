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
    ws: true,
    proxyTimeout: 0,
    logLevel: 'debug',
  })
);

/* Serve React build */
app.use(express.static(path.join(__dirname, 'build')));

/* React Router fallback dengan logging */
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'build', 'index.html');
  console.log(`Serving ${indexPath} for ${req.url}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Server error');
    }
  });
});

app.listen(port, () => {
  console.log(`Frontend running at http://localhost:${port}`);
});