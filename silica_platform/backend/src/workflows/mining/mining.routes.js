const express = require('express');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roleMiddleware');
const ctrl = require('./mining.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/mining/create', requireRole(['mining','director']), ctrl.create);
router.patch('/mining/:id/start', requireRole(['mining','director']), ctrl.start);
router.patch('/mining/:id/downtime', requireRole(['mining','director']), ctrl.downtime);
router.patch('/mining/:id/resume', requireRole(['mining','director']), ctrl.resume);
router.patch('/mining/:id/complete', requireRole(['mining','director']), ctrl.complete);
router.get('/mining/pending', requireRole(['mining','director']), ctrl.pending);

module.exports = router;
