const admin = require('firebase-admin');

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey || !storageBucket) {
    throw new Error('Firebase Admin environment variables missing. Check .env');
  }

  const privateKey = rawKey.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });

  console.log('Firebase Admin initialized successfully');

  initialized = true;
  return admin;
}

const adminSdk = initFirebaseAdmin();
const db = adminSdk.firestore();
const auth = adminSdk.auth();
const messaging = adminSdk.messaging();
const storage = adminSdk.storage();

module.exports = {
  admin: adminSdk,
  db,
  auth,
  messaging,
  storage,
};
