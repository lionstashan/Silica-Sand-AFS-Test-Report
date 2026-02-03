const { db, admin } = require('../../config/firebase');

const PRODUCTION_COLLECTION = 'productionLogs';
const FRESH_STOCK_COLLECTION = 'freshStock';

function productionRef(id) {
  return db.collection(PRODUCTION_COLLECTION).doc(id);
}

function newProductionRef() {
  return db.collection(PRODUCTION_COLLECTION).doc();
}

function freshStockKey({ plantId, grade }) {
  return `plant${plantId}-${grade}`;
}

function freshStockRef({ plantId, grade }) {
  return db.collection(FRESH_STOCK_COLLECTION).doc(freshStockKey({ plantId, grade }));
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

module.exports = {
  PRODUCTION_COLLECTION,
  FRESH_STOCK_COLLECTION,
  productionRef,
  newProductionRef,
  freshStockRef,
  nowTs,
};
