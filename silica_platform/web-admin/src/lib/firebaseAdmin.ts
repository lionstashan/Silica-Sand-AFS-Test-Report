import * as admin from 'firebase-admin';

let app: admin.app.App | undefined;

export function initFirebaseAdmin() {
  if (app) return app;
  if (admin.apps.length) {
    app = admin.app();
    return app;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const credJson = process.env.FIREBASE_ADMIN_CREDENTIAL; // JSON string of service account
  if (!projectId || !credJson) {
    throw new Error('Missing FIREBASE_PROJECT_ID or FIREBASE_ADMIN_CREDENTIAL env');
  }
  const serviceAccount = JSON.parse(credJson);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId
  });
  return app;
}

export function getAdminAuth() {
  return initFirebaseAdmin().auth();
}

export function getAdminDb() {
  return initFirebaseAdmin().firestore();
}
