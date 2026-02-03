const { getUserRoles } = require('./rbac.service');

function intersect(a, b) {
  const setB = new Set(b);
  return a.some((x) => setB.has(x));
}

function requireRole(allowedRoles = []) {
  const allowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .filter(Boolean)
    .map((r) => String(r).trim().toLowerCase());

  return async function roleGuard(req, res, next) {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!allowed.length) return next();

      let roles = Array.isArray(req.user.roles) ? req.user.roles : [];
      const claimRoles = Array.isArray(req.user.claims?.roles) ? req.user.claims.roles : [];
      roles = [...new Set([...(roles || []), ...claimRoles])].map((r) => String(r).trim().toLowerCase());

      if (!roles.length) {
        roles = await getUserRoles(req.user.uid);
      }

      if (!intersect(roles, allowed)) {
        return res.status(403).json({ error: 'Forbidden: insufficient role', required: allowed, have: roles });
      }

      return next();
    } catch (err) {
      return res.status(500).json({ error: 'RBAC check failed', details: String(err && err.message || err) });
    }
  };
}

module.exports = {
  requireRole,
};
