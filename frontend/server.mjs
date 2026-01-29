import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import NodeCache from 'node-cache';
import bodyParser from "body-parser";
import pkg from 'pg'; 
const { Pool } = pkg;
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sseClients = new Set();

// === LOAD ENV ===
dotenv.config({
  path: path.resolve(__dirname, '../backend/.env'),
});

// === DATABASE CONNECTION (LOCAL) ===
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// === INIT APP ===
const app = express();
const PORT = 3000;
const cache = new NodeCache({ stdTTL: 60 });

// === MIDDLEWARE ===
app.use(cors());
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// === SERVE IMAGES & ASSETS ===
// Pastikan folder ini mengarah ke direktori gambar Anda di backend
app.use('/assets/violations', express.static(path.join(__dirname, '../backend/public/cctv')));

// 1. API ROUTES (Murni SQL)
app.get('/api/violations-history', async (req, res) => {
  const { cctv, year, month, day, page = 1, limit = 20 } = req.query;

  const validCctv = cctv && cctv !== 'null' ? parseInt(cctv, 10) : null;
  const validYear = year && year !== 'null' ? parseInt(year, 10) : null;
  const validMonth = month && month !== 'null' ? parseInt(month, 10) : null;
  const validDay = day && day !== 'null' ? parseInt(day, 10) : null;

  const limitNum = Math.min(parseInt(limit, 10), 100);
  const offset = (parseInt(page, 10) - 1) * limitNum;

  try {
    // 1. DAFTAR CCTV
    if (!validCctv) {
      const result = await pool.query("SELECT id, name FROM cctv_data ORDER BY id ASC");
      return res.json({ options: 'cctv', data: result.rows });
    }

    // 2. DAFTAR TAHUN
    if (!validYear) {
      const result = await pool.query(
        "SELECT DISTINCT EXTRACT(YEAR FROM timestamp) as year FROM violation_detection WHERE id_cctv = $1 ORDER BY year DESC",
        [validCctv]
      );
      return res.json({ options: 'year', data: result.rows.map(r => r.year) });
    }

    // 3. DAFTAR BULAN
    if (!validMonth) {
      const result = await pool.query(
        "SELECT DISTINCT EXTRACT(MONTH FROM timestamp) as month FROM violation_detection WHERE id_cctv = $1 AND EXTRACT(YEAR FROM timestamp) = $2 ORDER BY month DESC",
        [validCctv, validYear]
      );
      return res.json({ options: 'month', data: result.rows.map(r => r.month) });
    }

    // 4. DAFTAR TANGGAL
    if (!validDay) {
      const result = await pool.query(
        "SELECT DISTINCT EXTRACT(DAY FROM timestamp) as day FROM violation_detection WHERE id_cctv = $1 AND EXTRACT(YEAR FROM timestamp) = $2 AND EXTRACT(MONTH FROM timestamp) = $3 ORDER BY day DESC",
        [validCctv, validYear, validMonth]
      );
      return res.json({ options: 'day', data: result.rows.map(r => r.day) });
    }

    // 5. TAMPILKAN GAMBAR
    const query = `
      SELECT v.id, v.id_cctv, v.image, v.timestamp, o.name as violation
      FROM violation_detection v
      JOIN object_class o ON v.id_violation = o.id
      WHERE v.id_cctv = $1 
      AND EXTRACT(YEAR FROM v.timestamp) = $2
      AND EXTRACT(MONTH FROM v.timestamp) = $3
      AND EXTRACT(DAY FROM v.timestamp) = $4
      ORDER BY v.timestamp DESC
      LIMIT $5 OFFSET $6
    `;
    const result = await pool.query(query, [validCctv, validYear, validMonth, validDay, limitNum, offset]);

    const data = result.rows.map(row => {
      const cleanPath = row.image.replace(/^cctv\//, ''); 
      
      return {
          ...row,
          imageUrl: `/assets/violations/${cleanPath}`
      };
    });

    return res.json({ data, hasMore: data.length === limitNum });

  } catch (err) {
    console.error('[DB ERROR]:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// SSE Endpoint (Untuk Realtime sederhana)
app.get('/api/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  const client = { id: Date.now(), res };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
});

// PROXY KE PYTHON
app.use('/api', createProxyMiddleware({
  target: 'http://127.0.0.1:5000',
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    if (req.rawBody) {
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.write(req.rawBody);
    }
  },
}));

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});