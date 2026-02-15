import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const setUserRoles = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const requesterRoles: string[] = (context.auth.token?.roles as string[]) || [];
  if (!requesterRoles.includes('Director') && !requesterRoles.includes('Manager')) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient privileges');
  }
  const { uid, roles } = data as { uid: string; roles: string[] };
  if (!uid || !Array.isArray(roles)) {
    throw new functions.https.HttpsError('invalid-argument', 'Provide `uid` and `roles` array');
  }
  await admin.auth().setCustomUserClaims(uid, { roles });
  await admin.firestore().collection('users').doc(uid).set({ roles }, { merge: true });
  return { success: true };
});
