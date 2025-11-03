// server.mjs
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import NodeCache from 'node-cache';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === LOAD ENV DARI backend/.env ===
dotenv.config({
  path: path.resolve(__dirname, '../backend/.env'),
});

// Validasi ENV wajib
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.SUPABASE_BUCKET) {
  console.error('ERROR: Missing required env variables (SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET)');
  process.exit(1);
}

// === INIT APP ===
const app = express();
const PORT = 3000;
const cache = new NodeCache({ stdTTL: 60 });

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());

// === SUPABASE CLIENT (SERVICE ROLE - AMAN) ===
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1. API ROUTES (SPESIFIK DULU)

// === API: Get violation images with signed URLs + cache + safe date parsing ===
app.get('/supabase-api/violations', async (req, res) => {
  const { cctv, year, month, day, page = 1, limit = 20 } = req.query;

  // === VALIDASI & PARSE PARAM ===
  const validCctv = cctv && cctv !== 'null' ? parseInt(cctv, 10) : null;
  const validYear = year && year !== 'null' ? parseInt(year, 10) : null;
  const validMonth = month && month !== 'null' ? parseInt(month, 10) : null;
  const validDay = day && day !== 'null' ? parseInt(day, 10) : null;

  const limitNum = Math.min(parseInt(limit, 10), 100);
  const from = (parseInt(page, 10) - 1) * limitNum;
  const to = from + limitNum - 1;

  // === FORCE NO CACHE ===
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    // === 1. TIDAK ADA PARAM → DAFTAR CCTV ===
    if (!validCctv) {
      const { data, error } = await supabase
        .from('cctv_data')
        .select('id, name')
        .order('id', { ascending: true });

      if (error) throw error;

      return res.json({ options: 'cctv', data });
    }

    // === 2. ADA CCTV, TAPI TIDAK ADA TAHUN → DAFTAR TAHUN ===
    if (!validYear) {
      const { data, error } = await supabase
        .from('violation_detection')
        .select('timestamp')
        .eq('id_cctv', validCctv)
        .not('timestamp', 'is', null)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const years = [...new Set(
        data
          .map(row => {
            const date = new Date(row.timestamp);
            return isNaN(date.getTime()) ? null : date.getFullYear();
          })
          .filter(year => year !== null)
      )].sort((a, b) => b - a);

      return res.json({ options: 'year', data: years });
    }

    // === 3. ADA TAHUN, TAPI TIDAK ADA BULAN → DAFTAR BULAN ===
    if (!validMonth) {
      const start = new Date(validYear, 0, 1).toISOString();
      const end = new Date(validYear, 11, 31, 23, 59, 59, 999).toISOString();

      const { data, error } = await supabase
        .from('violation_detection')
        .select('timestamp')
        .eq('id_cctv', validCctv)
        .gte('timestamp', start)
        .lte('timestamp', end)
        .not('timestamp', 'is', null)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const months = [...new Set(
        data
          .map(row => {
            const date = new Date(row.timestamp);
            return isNaN(date.getTime()) ? null : date.getMonth() + 1;
          })
          .filter(m => m !== null)
      )].sort((a, b) => b - a);

      return res.json({ options: 'month', data: months });
    }

    // === 4. ADA BULAN, TAPI TIDAK ADA TANGGAL → DAFTAR TANGGAL ===
    if (!validDay) {
      const start = new Date(validYear, validMonth - 1, 1).toISOString();
      const end = new Date(validYear, validMonth, 0, 23, 59, 59, 999).toISOString();

      const { data, error } = await supabase
        .from('violation_detection')
        .select('timestamp')
        .eq('id_cctv', validCctv)
        .gte('timestamp', start)
        .lte('timestamp', end)
        .not('timestamp', 'is', null)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const days = [...new Set(
        data
          .map(row => {
            const date = new Date(row.timestamp);
            return isNaN(date.getTime()) ? null : date.getDate();
          })
          .filter(d => d !== null)
      )].sort((a, b) => b - a);

      return res.json({ options: 'day', data: days });
    }

    // === 5. SEMUA PARAM ADA → TAMPILKAN GAMBAR ===
    const start = new Date(validYear, validMonth - 1, validDay, 0, 0, 0, 0).toISOString();
    const end = new Date(validYear, validMonth - 1, validDay, 23, 59, 59, 999).toISOString();

    let query = supabase
      .from('violation_detection')
      .select('id, id_cctv, image, timestamp, violation_data(name)')
      .eq('id_cctv', validCctv)
      .gte('timestamp', start)
      .lte('timestamp', end)
      .not('timestamp', 'is', null)
      .order('timestamp', { ascending: false })
      .range(from, to);

    const { data, error } = await query;
    if (error) throw error;

    const imagesWithUrl = await Promise.all(
      data.map(async (item) => {
        let signedUrl = item.image;

        // Hanya generate signed URL jika path relatif
        if (item.image && !item.image.startsWith('http')) {
          try {
            const { data: signed } = await supabase.storage
              .from(process.env.SUPABASE_BUCKET)
              .createSignedUrl(item.image, 3600); // 1 jam
            signedUrl = signed?.signedUrl || item.image;
          } catch (signErr) {
            console.warn(`[SIGN URL FAILED] ${item.image}:`, signErr.message);
            signedUrl = item.image; // fallback
          }
        }

        // Sanitasi timestamp
        const safeTimestamp = item.timestamp && !isNaN(new Date(item.timestamp).getTime())
          ? item.timestamp
          : null;

        return {
          id: item.id,
          id_cctv: item.id_cctv,
          image: item.image,
          signedUrl,
          timestamp: safeTimestamp,
          violation: item.violation_data?.name || 'unknown',
        };
      })
    );

    const hasMore = data.length === limitNum;
    const result = { data: imagesWithUrl, hasMore };

    // === CACHE (opsional, tapi aman karena no-store di header) ===
    const cacheKey = req.originalUrl;
    cache.set(cacheKey, result, 30); // 30 detik

    return res.json(result);

  } catch (err) {
    console.error('[SUPABASE API ERROR]:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// API: Invalidate cache
app.post('/invalidate-cache', (req, res) => {
  cache.flushAll();
  console.log('[CACHE] All flushed');
  res.json({ success: true });
});

// 2. PROXY KE PYTHON BACKEND
app.use(
  '/api',
  createProxyMiddleware({
    target: 'http://localhost:5000',
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onError: (err, req, res) => {
      console.error('[PROXY ERROR]:', err.message);
      res.status(502).json({ error: 'Python backend unreachable' });
    },
  })
);

// 3. SERVE VITE BUILD (dist/)
app.use(express.static(path.join(__dirname, 'dist')));

// 4. FALLBACK UNTUK REACT ROUTER (HARUS TERAKHIR!)
// Gunakan middleware function tanpa path wildcard
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// SERVER START
app.listen(PORT, () => {
  console.log(`\nServer running at http://localhost:${PORT}`);
  console.log(`Supabase API: http://localhost:${PORT}/supabase-api/violations`);
  console.log(`Python Proxy:  http://localhost:${PORT}/api/...`);
  console.log(`Frontend:      http://localhost:${PORT}\n`);
});