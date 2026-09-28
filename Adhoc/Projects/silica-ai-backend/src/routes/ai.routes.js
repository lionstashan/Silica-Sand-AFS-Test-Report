const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { askQuestion } = require('../services/ai.service');
const { createSession } = require('../services/session.service');

const DASHBOARD_ROLES = ['director', 'mining', 'production', 'qc', 'drying', 'dispatch', 'accounts'];

const router = express.Router();

router.post('/ai/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const expectedUsername = String(process.env.AI_BASIC_USERNAME || '');
  const expectedPassword = String(process.env.AI_BASIC_PASSWORD || '');

  if (!expectedUsername || !expectedPassword) {
    return res.status(503).json({ error: 'AI basic login is not configured' });
  }
  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json(createSession());
});

router.post('/ai/query', verifyFirebaseToken, requireRole(DASHBOARD_ROLES), async (req, res) => {
  try {
    const result = await askQuestion({
      question: req.body?.question,
      user: req.user
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: String(error.message || error) });
  }
});

module.exports = router;
