const { db, admin } = require('../../config/firebase');

const ORDERS_COLLECTION = 'orders';

const OrderStatus = {
  Created: 'Created',
  Approved: 'Approved',
  PartiallyFulfilled: 'PartiallyFulfilled',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }
function ordersCol() { return db.collection(ORDERS_COLLECTION); }
function orderRef(id) { return ordersCol().doc(id); }

module.exports = {
  db,
  ORDERS_COLLECTION,
  OrderStatus,
  nowTs,
  ordersCol,
  orderRef,
};
