const { db, admin } = require('../../config/firebase');

const MINING_COLLECTION = 'miningTasks';
const FRESH_STOCK_COLLECTION = 'freshStock';

function miningRef(ticketId) {
  return db.collection(MINING_COLLECTION).doc(ticketId);
}

function freshStockKey({ mineNumber, pitNumber }) {
  return `mine${mineNumber}-pit${pitNumber}`;
}

function freshStockRef({ mineNumber, pitNumber }) {
  return db.collection(FRESH_STOCK_COLLECTION).doc(freshStockKey({ mineNumber, pitNumber }));
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

module.exports = {
  MINING_COLLECTION,
  FRESH_STOCK_COLLECTION,
  miningRef,
  freshStockRef,
  nowTs,
};
