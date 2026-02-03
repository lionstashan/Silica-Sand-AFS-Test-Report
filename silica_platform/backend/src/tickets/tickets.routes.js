const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const ctrl = require('./tickets.controller');

const router = express.Router();

// All ticket routes require authentication
router.use(verifyFirebaseToken);

router.post('/tickets', ctrl.createTicket);
router.get('/tickets', ctrl.listTickets);
router.get('/tickets/:id', ctrl.getTicket);
router.patch('/tickets/:id/status', ctrl.patchStatus);
router.patch('/tickets/:id/downtime', ctrl.addDowntime);
router.patch('/tickets/:id/resume', ctrl.resumeFromDowntime);
router.patch('/tickets/:id/complete', ctrl.completeTicket);

module.exports = router;
