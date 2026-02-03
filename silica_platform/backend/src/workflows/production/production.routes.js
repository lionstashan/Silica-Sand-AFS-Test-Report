const express = require('express');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roleMiddleware');
const ctrl = require('./production.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/production/log', requireRole(['production','director']), ctrl.create);
router.get('/production/daily', requireRole(['production','director']), ctrl.daily);
router.get('/production/by-plant/:id', requireRole(['production','director']), ctrl.byPlant);
router.patch('/production/:id/qc-request', requireRole(['production','director']), ctrl.qcRequest);
router.patch('/production/:id/qc-pass', requireRole(['production','director']), ctrl.qcPass);
router.patch('/production/:id/qc-fail', requireRole(['production','director']), ctrl.qcFail);

module.exports = router;
