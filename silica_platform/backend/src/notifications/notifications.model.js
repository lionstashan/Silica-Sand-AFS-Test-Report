const { db, admin, messaging } = require('../config/firebase');

const DEVICE_TOKENS_COLLECTION = 'deviceTokens';
const NOTIFICATION_LOGS_COLLECTION = 'notificationLogs';

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }
function tokensRef(uid) { return db.collection(DEVICE_TOKENS_COLLECTION).doc(uid); }
function logsCol() { return db.collection(NOTIFICATION_LOGS_COLLECTION); }

module.exports = {
  db,
  admin,
  messaging,
  DEVICE_TOKENS_COLLECTION,
  NOTIFICATION_LOGS_COLLECTION,
  nowTs,
  tokensRef,
  logsCol,
};
