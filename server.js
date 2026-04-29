/**
 * Mondevis — Backend Server for Railway
 * ─────────────────────────────────────────────
 * Secure Claude API proxy. No Stripe needed during free period.
 *
 * Deploy to Railway:
 *   1. Push these files to a GitHub repo
 *   2. Go to railway.app → New Project → Deploy from GitHub
 *   3. Add environment variables in Railway dashboard
 *   4. Railway auto-deploys and gives you a public URL
 *
 * Local dev:
 *   npm install
 *   cp .env.example .env
 *   node server.js
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.set('trust proxy', 1);

// npm install express-rate-limit
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 10 quotes per IP per hour
  message: { error: 'Too many requests, please try again later.' }
});



// ── CORS ──────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// ── BODY PARSER ───────────────────────────────
// 20MB limit for base64-encoded PDF plans and images
app.use(express.json({ limit: '20mb' }));

// ── HEALTH CHECK ──────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'Mondevis API',
    status: 'ok',
    timestamp: new Date().toISOString(),
    free_until: '2027-06-30'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── CLAUDE API PROXY ──────────────────────────
/**
 * POST /generate-quote
 * Proxies to Claude API with the secret key stored server-side.
 * Supports text, PDF documents, and images.
 */
app.post('/generate-quote', limiter, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not configured on the server.'
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'pdfs-2024-09-25'
      },
      body: JSON.stringify({
       model: req.body.model || 'claude-sonnet-4-6',
        max_tokens: req.body.max_tokens || 1200,
        messages:   req.body.messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error('generate-quote error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Mondevis server running on port ${PORT}`);
  console.log(`   Claude API key: ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ MISSING'}`);
  console.log(`   Frontend URL:   ${process.env.FRONTEND_URL || '* (all origins)'}`);
  console.log(`   Free until:     30 June 2027\n`);
});
