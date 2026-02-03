const { db } = require('../config/firebase');
const { FRESH_STOCK_COLLECTION, READY_STOCK_COLLECTION } = require('../inventory/inventory.model');
const { MINING_COLLECTION } = require('../workflows/mining/mining.model');
const { PRODUCTION_COLLECTION } = require('../workflows/production/production.model');
const { DRYING_COLLECTION, ACTIVE_STATUSES } = require('../workflows/drying/drying.model');
const { DISPATCH_COLLECTION, READY_LOCKS_COLLECTION, DispatchStatus } = require('../workflows/dispatch/dispatch.model');
const { ORDERS_COLLECTION } = require('../workflows/orders/orders.model');
const { startOfDay } = require('./datetime');
const { sum, groupBy } = require('./dataset');

const ROLES_DASH = ['director','mining','production','qc','drying','dispatch','accounts'];

let cache = { ts: 0, data: null };
const CACHE_MS = 60 * 1000;

async function getMiningSummary() {
  const start = startOfDay();
  const completedSnap = await db.collection(MINING_COLLECTION)
    .where('timestamps.completedAt', '>=', start)
    .get();
  const completed = completedSnap.docs.map((d) => d.data());
  const totalDumpersToday = sum(completed, (x) => x.dumpersLoaded || 0);

  // Downtime count today using tickets updatedAt and status Downtime
  const downtimeSnap = await db.collection('tickets')
    .where('department', '==', 'mining')
    .where('timestamps.updatedAt', '>=', start)
    .where('status', '==', 'Downtime')
    .get();
  const downtimeCountToday = downtimeSnap.size;

  return { totalDumpersToday, downtimeCountToday };
}

async function getProductionSummary() {
  const start = startOfDay();
  const todaySnap = await db.collection(PRODUCTION_COLLECTION)
    .where('timestamps.productionAt', '>=', start)
    .get();
  const today = todaySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const totalProducedToday = sum(today, (x) => x.quantity || 0);

  const byPlantMap = groupBy(today, (x) => x.plantId);
  const byPlant = Array.from(byPlantMap.entries()).map(([plantId, items]) => ({ plantId: Number(plantId), total: sum(items, (x) => x.quantity || 0) }));

  const qcPending = today.filter((x) => x.status === 'PendingQC').length;

  const qcSnap = await db.collection(PRODUCTION_COLLECTION)
    .where('timestamps.qcAt', '>=', start)
    .get();
  const qcToday = qcSnap.docs.map((d) => d.data());
  const qcPass = qcToday.filter((x) => x.status === 'Pass').length;
  const qcFail = qcToday.filter((x) => x.status === 'Fail').length;

  return { totalProducedToday, byPlant, qcPending, qcPass, qcFail };
}

async function getDryingSummary() {
  const activeSnap = await db.collection(DRYING_COLLECTION)
    .where('dryingStatus', 'in', ACTIVE_STATUSES)
    .get();
  const beds = activeSnap.docs.map((d) => {
    const x = d.data();
    return { dryingBedId: x.dryingBedId, dryingStatus: x.dryingStatus, moistureNow: x.moistureNow };
  });
  return { beds };
}

async function getInventorySummary() {
  const freshSnap = await db.collection(FRESH_STOCK_COLLECTION).get();
  const readySnap = await db.collection(READY_STOCK_COLLECTION).get();
  const locksSnap = await db.collection(READY_LOCKS_COLLECTION).where('released', '==', false).get();
  return {
    fresh: freshSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ready: readySnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    locked: locksSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

async function getOrdersSummary() {
  const outSnap = await db.collection(ORDERS_COLLECTION).where('pendingQuantity', '>', 0).get();
  const outstanding = outSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const outstandingCount = outstanding.length;
  const outstandingMT = sum(outstanding, (x) => x.pendingQuantity || 0);
  const queueSnap = await db.collection(ORDERS_COLLECTION)
    .where('pendingQuantity', '>', 0)
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(10)
    .get();
  const queue = queueSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { outstandingCount, outstandingMT, queue };
}

async function getDispatchSummary() {
  const start = startOfDay();
  const dispatchedSnap = await db.collection(DISPATCH_COLLECTION)
    .where('dispatchStatus', '==', DispatchStatus.Dispatched)
    .where('dispatchedAt', '>=', start)
    .get();
  const trucksDispatchedToday = dispatchedSnap.size;

  const pendingStatuses = [DispatchStatus.Assigned, DispatchStatus.AwaitingTransport, DispatchStatus.VehicleArrived, DispatchStatus.Loading];
  const pendingSnap = await db.collection(DISPATCH_COLLECTION)
    .where('dispatchStatus', 'in', pendingStatuses)
    .get();
  const pendingDispatchCount = pendingSnap.size;

  const arrived = pendingSnap.docs.filter((d) => d.data().dispatchStatus === DispatchStatus.VehicleArrived).length;
  const loading = pendingSnap.docs.filter((d) => d.data().dispatchStatus === DispatchStatus.Loading).length;
  const awaitingTransport = pendingSnap.docs.filter((d) => d.data().dispatchStatus === DispatchStatus.AwaitingTransport).length;

  return { trucksDispatchedToday, pendingDispatchCount, vehicleArrived: arrived, loading, awaitingTransport };
}

async function getSummary() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_MS) {
    return cache.data;
  }
  const [mining, production, drying, inventory, orders, dispatch] = await Promise.all([
    getMiningSummary(),
    getProductionSummary(),
    getDryingSummary(),
    getInventorySummary(),
    getOrdersSummary(),
    getDispatchSummary(),
  ]);
  const summary = { mining, production, drying, inventory, orders, dispatch };
  cache = { ts: now, data: summary };
  return summary;
}

module.exports = {
  ROLES_DASH,
  getSummary,
  getMiningSummary,
  getProductionSummary,
  getDryingSummary,
  getInventorySummary,
  getOrdersSummary,
  getDispatchSummary,
};
