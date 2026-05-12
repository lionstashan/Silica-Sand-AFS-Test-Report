require('dotenv').config();
const crypto = require('crypto');

function safeParseDbUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname || null,
      port: url.port || null,
      database: (url.pathname || '').replace(/^\//, '') || null,
      username: url.username || null
    };
  } catch (_e) {
    return null;
  }
}

function mask(value, keep = 4) {
  const str = String(value || '');
  if (!str) return '';
  if (str.length <= keep) return '*'.repeat(str.length);
  return `${str.slice(0, keep)}${'*'.repeat(Math.max(0, str.length - keep))}`;
}

const raw = process.env.DATABASE_URL || '';
const parsed = safeParseDbUrl(raw);
const fingerprint = raw
  ? crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12)
  : null;

const report = {
  APP_ENV: process.env.APP_ENV || null,
  NODE_ENV: process.env.NODE_ENV || null,
  DATABASE_URL_present: Boolean(raw),
  DATABASE_URL_fingerprint: fingerprint,
  database_target: parsed
    ? {
        protocol: parsed.protocol,
        host: parsed.host,
        port: parsed.port,
        database: parsed.database,
        username_masked: mask(parsed.username, 2)
      }
    : null
};

console.log(JSON.stringify(report, null, 2));

