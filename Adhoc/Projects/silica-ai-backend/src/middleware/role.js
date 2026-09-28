function requireRole(allowedRoles = []) {
  const allowed = allowedRoles.map((role) => String(role).trim().toLowerCase());
  return (req, res, next) => {
    const roles = [
      ...(Array.isArray(req.user?.roles) ? req.user.roles : []),
      ...(Array.isArray(req.user?.claims?.roles) ? req.user.claims.roles : [])
    ].map((role) => String(role).trim().toLowerCase());

    if (!allowed.length || roles.some((role) => allowed.includes(role))) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  };
}

module.exports = {
  requireRole
};
