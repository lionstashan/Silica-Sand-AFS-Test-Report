const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const ctrl = require('./inventory.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

// READ endpoints
router.get('/inventory/fresh', requireRole(['production','drying','qc','dispatch','director']), ctrl.listFresh);
router.get('/inventory/ready', requireRole(['production','drying','qc','dispatch','director']), ctrl.listReady);
router.get('/inventory/movements', requireRole(['production','drying','qc','dispatch','director']), ctrl.movements);

// WRITE endpoints
router.post('/inventory/fresh/add', requireRole(['production','drying','qc','director']), ctrl.addFresh);
router.post('/inventory/ready/add', requireRole(['production','drying','qc','director']), ctrl.addReady);
router.patch('/inventory/fresh/:id/update', requireRole(['production','drying','qc','director']), ctrl.updateFresh);
router.patch('/inventory/ready/:id/update', requireRole(['production','drying','qc','director']), ctrl.updateReady);

module.exports = router;
