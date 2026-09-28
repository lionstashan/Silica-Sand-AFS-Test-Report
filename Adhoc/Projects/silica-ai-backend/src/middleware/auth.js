const { auth } = require('../config/firebase');
const { verifySession } = require('../services/session.service');

function extractToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  if (req.headers['x-firebase-token']) return String(req.headers['x-firebase-token']);
  return null;
}

async function verifyFirebaseToken(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      const sessionToken = String(req.headers['x-ai-session'] || '');
      if (verifySession(sessionToken)) {
        req.user = {
          uid: 'basic-access',
          roles: ['director'],
          claims: { roles: ['director'], auth_mode: 'basic_access' }
        };
        return next();
      }

      const testCode = String(req.headers['x-ai-test-code'] || '');
      const expectedTestCode = String(process.env.AI_TEST_ACCESS_CODE || '');
      if (expectedTestCode && testCode && testCode === expectedTestCode) {
        req.user = {
          uid: 'test-access',
          roles: ['director'],
          claims: { roles: ['director'], auth_mode: 'test_access_code' }
        };
        return next();
      }
      return res.status(401).json({ error: 'Missing auth token' });
    }
    if (!auth) {
      return res.status(503).json({ error: 'Firebase auth is not configured' });
    }
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      roles: Array.isArray(decoded.roles) ? decoded.roles : [],
      claims: decoded
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}

module.exports = {
  verifyFirebaseToken
};
