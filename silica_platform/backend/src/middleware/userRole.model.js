const { db } = require('../config/firebase');

const COLLECTION = 'userRoles';

function userRoleDoc(uid) {
  return db.collection(COLLECTION).doc(uid);
}

module.exports = {
  COLLECTION,
  userRoleDoc,
};
