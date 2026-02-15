#!/usr/bin/env ts-node
import * as admin from 'firebase-admin';

async function main() {
  try { admin.initializeApp(); } catch {}
  const auth = admin.auth();
  let nextPageToken: string | undefined = undefined;
  do {
    const result = await auth.listUsers(1000, nextPageToken);
    result.users.forEach((u) => {
      console.log(JSON.stringify({ uid: u.uid, email: u.email, phone: u.phoneNumber, displayName: u.displayName }));
    });
    nextPageToken = result.pageToken;
  } while (nextPageToken);
}

main().catch((e) => { console.error(e); process.exit(1); });
