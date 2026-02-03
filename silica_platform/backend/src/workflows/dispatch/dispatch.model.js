const { db, admin } = require('../../config/firebase');
const { MOVEMENTS_COLLECTION } = require('../../inventory/inventory.model');

const DISPATCH_COLLECTION = 'dispatchLogs';
const READY_LOCKS_COLLECTION = 'readyStockLocks';
const ORDERS_COLLECTION = 'orders';

const DispatchStatus = {
  Assigned: 'Assigned',
  AwaitingTransport: 'AwaitingTransport',
  VehicleArrived: 'VehicleArrived',
  Loading: 'Loading',
  Dispatched: 'Dispatched',
  Closed: 'Closed',
};

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }

function dispatchRef(id) { return db.collection(DISPATCH_COLLECTION).doc(id); }
function dispatchCol() { return db.collection(DISPATCH_COLLECTION); }
function lockRef(id) { return db.collection(READY_LOCKS_COLLECTION).doc(id); }
function locksCol() { return db.collection(READY_LOCKS_COLLECTION); }
function orderRef(id) { return db.collection(ORDERS_COLLECTION).doc(id); }

module.exports = {
  db,
  MOVEMENTS_COLLECTION,
  DISPATCH_COLLECTION,
  READY_LOCKS_COLLECTION,
  ORDERS_COLLECTION,
  DispatchStatus,
  nowTs,
  dispatchRef,
  dispatchCol,
  lockRef,
  locksCol,
  orderRef,
};
