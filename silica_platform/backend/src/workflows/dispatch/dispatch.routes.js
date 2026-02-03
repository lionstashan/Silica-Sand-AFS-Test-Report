const express = require('express');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roleMiddleware');
const ctrl = require('./dispatch.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/dispatch/assign', requireRole(['dispatch','director']), ctrl.assign);
router.patch('/dispatch/:id/vehicle', requireRole(['dispatch','director']), ctrl.vehicle);
router.patch('/dispatch/:id/arrived', requireRole(['dispatch','director']), ctrl.arrived);
router.patch('/dispatch/:id/loading', requireRole(['dispatch','director']), ctrl.loading);
router.patch('/dispatch/:id/complete', requireRole(['dispatch','director']), ctrl.complete);
router.get('/dispatch/pending', requireRole(['dispatch','director','accounts']), ctrl.pending);
router.get('/dispatch/history', requireRole(['dispatch','director','accounts']), ctrl.history);

module.exports = router;
