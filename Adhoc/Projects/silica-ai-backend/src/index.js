require('dotenv').config();

const express = require('express');
const cors = require('cors');
const aiRouter = require('./routes/ai.routes');

const app = express();
const port = process.env.PORT || 8090;
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const origins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'silica-ai-backend' });
});

app.use('/api', aiRouter);

app.listen(port, host, () => {
  console.log(`Silica AI backend listening on ${host}:${port}`);
});
