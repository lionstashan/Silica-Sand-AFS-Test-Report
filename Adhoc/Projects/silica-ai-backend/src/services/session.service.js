const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, {
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return {
    token,
    expiresInSeconds: Math.floor(SESSION_TTL_MS / 1000)
  };
}

function verifySession(token) {
  const session = sessions.get(String(token || ''));
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

module.exports = {
  createSession,
  verifySession
};
