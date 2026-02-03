const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const ctrl = require('./notifications.controller');

const router = express.Router();
router.use(verifyFirebaseToken);

router.post('/notifications/register-token', ctrl.registerToken);
router.post('/notifications/send', requireRole(['director']), ctrl.send);
router.post('/notifications/send-multiple', requireRole(['director']), ctrl.sendMultiple);

module.exports = router;
