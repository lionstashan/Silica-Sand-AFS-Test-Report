const express = require('express');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roleMiddleware');
const ctrl = require('./qc.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/qc/request', requireRole(['qc','director']), ctrl.request);
router.patch('/qc/:id/start', requireRole(['qc','director']), ctrl.start);
router.patch('/qc/:id/pass', requireRole(['qc','director']), ctrl.pass);
router.patch('/qc/:id/fail', requireRole(['qc','director']), ctrl.fail);
router.get('/qc/pending', requireRole(['qc','director']), ctrl.pending);
router.get('/qc/history', requireRole(['qc','director']), ctrl.history);

module.exports = router;
