const { auth } = require('../config/firebase');

// Extract bearer token from Authorization header, cookie, or custom header
function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  if (req.headers['x-firebase-token']) return String(req.headers['x-firebase-token']);
  if (req.cookies && req.cookies.session) return req.cookies.session;
  return null;
}

// Express middleware: verifies Firebase ID token and attaches req.user
async function verifyFirebaseToken(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Missing auth token' });
    const decoded = await auth.verifyIdToken(token);
    const roles = Array.isArray(decoded.roles) ? decoded.roles : [];
    req.user = { uid: decoded.uid, roles, claims: decoded };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid auth token', details: String(err && err.message || err) });
  }
}

module.exports = {
  verifyFirebaseToken,
};
