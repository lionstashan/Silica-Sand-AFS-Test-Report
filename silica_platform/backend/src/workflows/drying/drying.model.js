const { db, admin } = require('../../config/firebase');

const DRYING_COLLECTION = 'dryingLogs';
const READY_STOCK_COLLECTION = 'readyStock';

function dryingRef(id) { return db.collection(DRYING_COLLECTION).doc(id); }
function newDryingRef() { return db.collection(DRYING_COLLECTION).doc(); }

function readyStockKeyByGrade(grade) { return `grade-${grade}`; }
function readyStockRefByGrade(grade) { return db.collection(READY_STOCK_COLLECTION).doc(readyStockKeyByGrade(grade)); }

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }

const ACTIVE_STATUSES = ['Assigned', 'Drying', 'PendingQC'];

module.exports = {
  DRYING_COLLECTION,
  READY_STOCK_COLLECTION,
  dryingRef,
  newDryingRef,
  readyStockRefByGrade,
  nowTs,
  ACTIVE_STATUSES,
};
