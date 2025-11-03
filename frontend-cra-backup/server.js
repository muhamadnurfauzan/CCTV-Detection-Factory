// server.js (DIUPDATE)
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';

const { createProxyMiddleware } = require('http-proxy-middleware');

dotenv.config();

const app = express();
const port = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cache = new NodeCache({ stdTTL: 60 });

app.use(cors());
app.use(express.json());

// === SUPABASE CLIENT (SERVICE KEY - AMAN) ===
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// === API UNTUK GAMBAR (DENGAN CACHE & FIX) ===
app.get('/supabase-api/violations', async (req, res) => {
  const cacheKey = req.url;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] ${cacheKey}`);
    return res.json(cached);
  }

  try {
    const { cctv, year, month, day, page = 1, limit = 20 } = req.query;
    const limitNum = parseInt(limit);
    const from = (page - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from('violation_detection')
      .select('id, id_cctv, image, timestamp, violation_data(name)')
      .order('timestamp', { ascending: false })
      .range(from, to);

    if (cctv) {
      query = query.eq('id_cctv', cctv);
      if (year && month && day) {
        const start = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
        const end = new Date(`${year}-${month}-${day}T23:59:59.999Z`);
        query = query.gte('timestamp', start.toISOString())
                     .lte('timestamp', end.toISOString());
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    // Generate signed URL jika perlu
    const imagesWithUrl = await Promise.all(
      data.map(async (item) => {
        let signedUrl = item.image;

        if (!item.image.startsWith('http')) {
          try {
            const { data: signed } = await supabase.storage
              .from(process.env.SUPABASE_BUCKET)
              .createSignedUrl(item.image, 3600);
            signedUrl = signed?.signedUrl || item.image;
          } catch (signErr) {
            console.warn(`Failed to sign URL for ${item.image}:`, signErr.message);
            signedUrl = item.image; // fallback
          }
        }

        return {
          ...item,
          signedUrl,
          violation: item.violation_data?.name || 'unknown'
        };
      })
    );

    // FIX: hasMore benar!
    const hasMore = data.length === limitNum;

    const result = { 
      data: imagesWithUrl, 
      hasMore 
    };

    // Set cache
    cache.set(cacheKey, result);
    console.log(`[CACHE SET] ${cacheKey} | ${data.length} items | hasMore: ${hasMore}`);

    res.json(result);
  } catch (err) {
    console.error('Supabase API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// === PROXY KE PYTHON (HANYA /api) ===
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

// === SERVE REACT BUILD ===
app.use(express.static(path.join(__dirname, 'build')));

// === FALLBACK UNTUK REACT ROUTER ===
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'build', 'index.html');
  console.log(`Serving ${indexPath} for ${req.url}`);
  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Supabase API: http://localhost:${port}/supabase-api/violations`);
  console.log(`Python API proxy: http://localhost:${port}/python-api/...`);
});

app.post('/invalidate-cache', (req, res) => {
  cache.flushAll();
  console.log('[CACHE] Flushed all');
  res.json({ success: true });
});