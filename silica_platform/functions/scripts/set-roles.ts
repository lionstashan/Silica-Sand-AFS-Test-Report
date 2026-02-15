#!/usr/bin/env ts-node
import * as admin from 'firebase-admin';

function usage() {
  console.error('Usage: roles:set <uid> <role1,role2,...>');
  process.exit(1);
}

async function main() {
  const [, , uid, rolesArg] = process.argv;
  if (!uid || !rolesArg) usage();
  const roles = rolesArg.split(',').map((r) => r.trim()).filter(Boolean);

  // Initialize using Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
  try {
    admin.initializeApp();
  } catch (e) {
    // already initialized
  }

  await admin.auth().setCustomUserClaims(uid, { roles });
  await admin.firestore().collection('users').doc(uid).set({ roles }, { merge: true });
  console.log(`Set roles for ${uid}: [${roles.join(', ')}]`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
