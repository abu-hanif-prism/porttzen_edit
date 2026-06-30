'use strict';
require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowed = [
  'https://edit.md-hanif.xyz',
  'http://localhost:5173',
  'http://localhost:4173',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','DELETE'],
}));
app.use(express.json());

// ── UPLOAD DIR BASE ───────────────────────────────────────────────────────────
const UPLOADS_BASE = path.join('f:/photographer-red/www/uploads');

// ── MULTER ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { subdomain } = req.body;
    if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
      return cb(new Error('Invalid subdomain'));
    }
    const dir = path.join(UPLOADS_BASE, subdomain);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const { slot } = req.body;
    if (!slot || !/^[a-z0-9_-]+$/.test(slot)) {
      return cb(new Error('Invalid slot'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, slot + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only jpg/png/webp allowed'));
    cb(null, true);
  },
});

// ── TOKEN VALIDATION ──────────────────────────────────────────────────────────
async function validateToken(token) {
  const { data, error } = await sb
    .from('edit_tokens')
    .select('id, subdomain, used, expires_at')
    .eq('token', token)
    .single();

  if (error || !data)           return { ok: false, msg: 'Token not found' };
  if (data.used)                return { ok: false, msg: 'Token already used' };
  if (new Date(data.expires_at) < new Date()) return { ok: false, msg: 'Token expired' };
  return { ok: true, subdomain: data.subdomain };
}

// ── POST /upload ──────────────────────────────────────────────────────────────
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { subdomain, token, slot } = req.body;

    if (!token)     return res.status(400).json({ error: 'Missing token' });
    if (!subdomain) return res.status(400).json({ error: 'Missing subdomain' });
    if (!slot)      return res.status(400).json({ error: 'Missing slot' });
    if (!req.file)  return res.status(400).json({ error: 'No file uploaded' });

    const check = await validateToken(token);
    if (!check.ok) {
      fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: check.msg });
    }

    // Ensure the token subdomain matches the request subdomain
    if (check.subdomain !== subdomain) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Token subdomain mismatch' });
    }

    const relativePath = `uploads/${subdomain}/${req.file.filename}`;
    res.json({ success: true, path: relativePath });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ── DELETE /upload ────────────────────────────────────────────────────────────
app.delete('/upload', async (req, res) => {
  try {
    const { subdomain, token, slot } = req.body;

    if (!token || !subdomain || !slot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const check = await validateToken(token);
    if (!check.ok) return res.status(401).json({ error: check.msg });
    if (check.subdomain !== subdomain) return res.status(403).json({ error: 'Token subdomain mismatch' });

    // Find files matching this slot (any extension)
    const dir = path.join(UPLOADS_BASE, subdomain);
    if (!fs.existsSync(dir)) return res.json({ success: true });

    const files = fs.readdirSync(dir).filter(f => {
      const name = path.basename(f, path.extname(f));
      return name === slot;
    });

    files.forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── CATCH-ALL ERROR HANDLER (multer errors bypass route try/catch) ────────────
app.use((err, req, res, _next) => {
  if (req.file) { try { require('fs').unlinkSync(req.file.path); } catch (_) {} }
  console.error('Upload server error:', err.message);
  res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PortZen upload server listening on port ${PORT}`);
});
