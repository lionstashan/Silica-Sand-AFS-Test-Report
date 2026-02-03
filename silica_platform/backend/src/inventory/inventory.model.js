const { db, admin } = require('../config/firebase');

const FRESH_STOCK_COLLECTION = 'freshStock';
const READY_STOCK_COLLECTION = 'readyStock';
const MOVEMENTS_COLLECTION = 'stockMovements';

function freshStockKeyByPlantGrade(plantId, grade) {
  return `plant${plantId}-grade${grade}`;
}
function freshStockKeyByMinePit(mineNumber, pitNumber) {
  return `mine${mineNumber}-pit${pitNumber}`;
}
function readyStockKeyByGrade(grade) {
  return `grade-${grade}`;
}

function freshStockRefById(id) { return db.collection(FRESH_STOCK_COLLECTION).doc(id); }
function readyStockRefById(id) { return db.collection(READY_STOCK_COLLECTION).doc(id); }

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }

module.exports = {
  db,
  FRESH_STOCK_COLLECTION,
  READY_STOCK_COLLECTION,
  MOVEMENTS_COLLECTION,
  freshStockKeyByPlantGrade,
  freshStockKeyByMinePit,
  readyStockKeyByGrade,
  freshStockRefById,
  readyStockRefById,
  nowTs,
};
