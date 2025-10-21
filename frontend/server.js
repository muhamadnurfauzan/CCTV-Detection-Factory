const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = 3000;

// Proxy semua request ke /api ke backend Flask
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:5000',  // Flask di 5000
  changeOrigin: true,
  pathRewrite: { '^/api': '' }
}));

// Route utama: Serve halaman HTML dengan stream CCTV embed
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CCTV Monitoring Portal</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; background: #f4f4f4; margin: 0; padding: 20px; }
        h1 { color: #333; }
        #video-container { max-width: 80%; margin: 20px auto; border: 2px solid #000; border-radius: 8px; overflow: hidden; }
        img { width: 100%; height: auto; display: block; }
        p { font-size: 1.2em; color: #666; }
        #status { margin-top: 10px; color: green; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>CCTV Monitoring Portal</h1>
      <div id="video-container">
        <img id="cctv-stream" src="/api/video_feed" alt="CCTV Stream" onerror="handleError(this);">
      </div>
      <p>Minimal 3 FPS realtime stream</p>
      <div id="status">Loading stream...</div>
      <script>
        function handleError(img) {
          document.getElementById('status').textContent = 'Error loading stream. Check backend.';
          document.getElementById('status').style.color = 'red';
          img.src = '';
        }
        document.getElementById('cctv-stream').onload = () => {
          document.getElementById('status').textContent = 'Stream connected!';
          document.getElementById('status').style.color = 'green';
        };
      </script>
    </body>
    </html>
  `);
});

// Serve static files (CSS, JS, images) dari folder 'public' (after root route)
const fs = require('fs');
if (!fs.existsSync('public')) {
  console.warn('Warning: public folder not found. Static assets will not be served.');
} else {
  app.use(express.static('public'));
}

// Jalankan server
app.listen(port, () => {
  console.log(`Frontend Node.js running at http://localhost:${port}`);
  console.log(`Proxying /api -> http://localhost:5000`);
});

// Simple health check
app.get('/health', (req, res) => res.send({ok: true, timestamp: Date.now()}));