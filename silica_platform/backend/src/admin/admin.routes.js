const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const ctrl = require('./admin.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/admin/set-roles', requireRole(['director']), ctrl.setRoles);

module.exports = router;
