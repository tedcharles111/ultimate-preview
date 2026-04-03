const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Global middleware – sets headers for EVERY response
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Allow embedding in any iframe (for Multiverse)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});

const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

// Test endpoint – to verify headers are set
app.get('/test-headers', (req, res) => {
  res.json({
    'Cross-Origin-Embedder-Policy': res.getHeader('Cross-Origin-Embedder-Policy'),
    'Cross-Origin-Opener-Policy': res.getHeader('Cross-Origin-Opener-Policy'),
    'X-Frame-Options': res.getHeader('X-Frame-Options'),
    'Content-Security-Policy': res.getHeader('Content-Security-Policy')
  });
});

app.post('/api/preview/create', (req, res) => {
  try {
    const { files } = req.body;
    const sessionId = uuidv4();
    sessions.set(sessionId, {
      files,
      createdAt: Date.now(),
      errors: []
    });
    res.json({
      success: true,
      sessionId,
      previewUrl: `/preview/${sessionId}`,
      expiresIn: '30 minutes'
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/preview/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session expired' });
  res.json(session);
});

app.post('/api/preview/:sessionId/error', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (session) {
    session.errors.push({ ...req.body, timestamp: Date.now() });
  }
  res.json({ ok: true });
});

app.get('/api/preview/:sessionId/errors', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  res.json({ errors: session?.errors || [] });
});

// Preview route – defined BEFORE static middleware
app.get('/preview/:sessionId', (req, res) => {
  // Set all required headers (COOP/COEP and frame-ancestors)
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.sendFile(path.join(__dirname, 'public', 'preview.html'));
});

// Static files – placed AFTER all routes to prevent interference
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Preview engine running on port ${PORT}`);
});
