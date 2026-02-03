require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { verifyFirebaseToken } = require('./middleware/auth');
const ticketsRouter = require('./tickets/tickets.routes');
const miningRouter = require('./workflows/mining/mining.routes');
const productionRouter = require('./workflows/production/production.routes');
const qcRouter = require('./workflows/qc/qc.routes');
const dryingRouter = require('./workflows/drying/drying.routes');
const inventoryRouter = require('./inventory/inventory.routes');
const adminRouter = require('./admin/admin.routes');
const dispatchRouter = require('./workflows/dispatch/dispatch.routes');
const ordersRouter = require('./workflows/orders/orders.routes');
const notificationsRouter = require('./notifications/notifications.routes');
const dashboardRouter = require('./dashboard/dashboard.routes');

const app = express();

// CORS
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true, credentials: true }));

// Body parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Example protected route
app.get('/me', verifyFirebaseToken, (req, res) => {
  res.json({ uid: req.user.uid, roles: req.user.roles || [], claims: req.user.claims || {} });
});

// API routes
app.use('/api', ticketsRouter);
app.use('/api', miningRouter);
app.use('/api', productionRouter);
app.use('/api', qcRouter);
app.use('/api', dryingRouter);
app.use('/api', inventoryRouter);
app.use('/api', adminRouter);
app.use('/api', dispatchRouter);
app.use('/api', ordersRouter);
app.use('/api', notificationsRouter);
app.use('/api', dashboardRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
