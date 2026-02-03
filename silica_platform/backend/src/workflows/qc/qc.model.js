const { db, admin } = require('../../config/firebase');

const QC_COLLECTION = 'qcReports';
const PRODUCTION_COLLECTION = 'productionLogs';
const DRYING_COLLECTION = 'dryingLogs'; // to be implemented in drying module
const FRESH_STOCK_COLLECTION = 'freshStock';
const READY_STOCK_COLLECTION = 'readyStock';

function qcRef(id) { return db.collection(QC_COLLECTION).doc(id); }
function newQcRef() { return db.collection(QC_COLLECTION).doc(); }
function productionRef(id) { return db.collection(PRODUCTION_COLLECTION).doc(id); }
function dryingRef(id) { return db.collection(DRYING_COLLECTION).doc(id); }

function freshStockKeyByPlantGrade(plantId, grade) { return `plant${plantId}-${grade}`; }
function freshStockRefByPlantGrade(plantId, grade) { return db.collection(FRESH_STOCK_COLLECTION).doc(freshStockKeyByPlantGrade(plantId, grade)); }

function readyStockKeyByGrade(grade) { return `grade-${grade}`; }
function readyStockRefByGrade(grade) { return db.collection(READY_STOCK_COLLECTION).doc(readyStockKeyByGrade(grade)); }

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }

module.exports = {
  QC_COLLECTION,
  PRODUCTION_COLLECTION,
  DRYING_COLLECTION,
  FRESH_STOCK_COLLECTION,
  READY_STOCK_COLLECTION,
  qcRef,
  newQcRef,
  productionRef,
  dryingRef,
  freshStockRefByPlantGrade,
  readyStockRefByGrade,
  nowTs,
};
