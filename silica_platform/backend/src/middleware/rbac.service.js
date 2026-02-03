const { db, auth } = require('../config/firebase');
const { userRoleDoc } = require('./userRole.model');

const ALLOWED_ROLES = [
  'worker',
  'mining',
  'production',
  'qc',
  'drying',
  'dispatch',
  'accounts',
  'director',
];

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .filter((r) => typeof r === 'string')
    .map((r) => r.trim().toLowerCase())
    .filter((r, idx, arr) => r && arr.indexOf(r) === idx);
}

function validateRoles(roles) {
  const invalid = roles.filter((r) => !ALLOWED_ROLES.includes(r));
  if (invalid.length) {
    throw new Error(`Invalid roles: ${invalid.join(', ')}`);
  }
}

async function getUserRoles(uid) {
  const snap = await userRoleDoc(uid).get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  return normalizeRoles(data.roles || []);
}

async function setUserRoles(uid, roles) {
  const norm = normalizeRoles(roles);
  validateRoles(norm);
  await userRoleDoc(uid).set({ roles: norm }, { merge: true });
  await auth.setCustomUserClaims(uid, { roles: norm });
  return { uid, roles: norm };
}

module.exports = {
  ALLOWED_ROLES,
  normalizeRoles,
  validateRoles,
  getUserRoles,
  setUserRoles,
};
