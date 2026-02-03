const { setUserRoles, validateRoles, normalizeRoles, ALLOWED_ROLES } = require('../middleware/rbac.service');

async function setRoles(req, res) {
  try {
    const { uid, roles } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    const norm = normalizeRoles(roles);
    validateRoles(norm);
    const result = await setUserRoles(uid, norm);
    return res.status(200).json({ ok: true, ...result, allowed: ALLOWED_ROLES });
  } catch (e) {
    return res.status(400).json({ error: String(e && e.message || e) });
  }
}

module.exports = {
  setRoles,
};
