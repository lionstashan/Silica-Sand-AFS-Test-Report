const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const ctrl = require('./dashboard.controller');
const { ROLES_DASH } = require('./dashboard.service');

const router = express.Router();
router.use(verifyFirebaseToken);

router.get('/dashboard/summary', requireRole(ROLES_DASH), ctrl.summary);
router.get('/dashboard/mining', requireRole(ROLES_DASH), ctrl.mining);
router.get('/dashboard/production', requireRole(ROLES_DASH), ctrl.production);
router.get('/dashboard/drying', requireRole(ROLES_DASH), ctrl.drying);
router.get('/dashboard/inventory', requireRole(ROLES_DASH), ctrl.inventory);
router.get('/dashboard/orders', requireRole(ROLES_DASH), ctrl.orders);
router.get('/dashboard/dispatch', requireRole(ROLES_DASH), ctrl.dispatch);

module.exports = router;
