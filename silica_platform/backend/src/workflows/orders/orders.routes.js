const express = require('express');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roleMiddleware');
const ctrl = require('./orders.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/orders/create', requireRole(['director']), ctrl.create);
router.patch('/orders/:id/approve', requireRole(['director']), ctrl.approve);
router.patch('/orders/:id/prioritize', requireRole(['director']), ctrl.prioritize);
router.get('/orders/:id', requireRole(['dispatch','accounts','director']), ctrl.getOne);
router.get('/orders/outstanding', requireRole(['dispatch','accounts','director']), ctrl.outstanding);
router.get('/orders/queue', requireRole(['dispatch','accounts','director']), ctrl.queue);
router.post('/orders/allocate', requireRole(['dispatch','director']), ctrl.allocate);
router.patch('/orders/:id/reallocate', requireRole(['dispatch','director']), ctrl.reallocate);
router.get('/orders/history', requireRole(['dispatch','accounts','director']), ctrl.history);

module.exports = router;
