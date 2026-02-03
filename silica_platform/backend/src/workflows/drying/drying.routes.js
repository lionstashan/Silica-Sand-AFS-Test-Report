const express = require('express');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roleMiddleware');
const ctrl = require('./drying.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/drying/assign', requireRole(['drying','director']), ctrl.assign);
router.patch('/drying/:id/updateMoisture', requireRole(['drying','director']), ctrl.updateMoisture);
router.patch('/drying/:id/finish', requireRole(['drying','director']), ctrl.finish);
router.patch('/drying/:id/qc-pass', requireRole(['drying','director']), ctrl.qcPass);
router.patch('/drying/:id/qc-fail', requireRole(['drying','director']), ctrl.qcFail);
router.get('/drying/pending', requireRole(['drying','director']), ctrl.pending);
router.get('/drying/history', requireRole(['drying','director']), ctrl.history);

module.exports = router;
