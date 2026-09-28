const admin = require('firebase-admin');

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n')
    })
  });

  initialized = true;
  return admin;
}

const adminSdk = initFirebaseAdmin();

module.exports = {
  admin: adminSdk,
  auth: adminSdk ? adminSdk.auth() : null,
  db: adminSdk ? adminSdk.firestore() : null
};
