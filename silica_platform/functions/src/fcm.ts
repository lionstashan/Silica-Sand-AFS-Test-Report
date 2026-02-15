import * as admin from 'firebase-admin';

export async function notifyRoles(roles: string[], title: string, body: string) {
  const messages = roles.map((role) => ({
    topic: role,
    notification: { title, body }
  }));
  const results = await Promise.all(messages.map((msg) => admin.messaging().send(msg)));
  return results;
}

export async function notifyUsers(uids: string[], title: string, body: string) {
  const tokensSnap = await admin.firestore()
    .collection('deviceTokens')
    .where('uid', 'in', uids)
    .get();
  const tokens = tokensSnap.docs.map((d) => d.get('token')).filter(Boolean);
  if (tokens.length === 0) return [];
  const message = {
    notification: { title, body },
    tokens
  } as admin.messaging.MulticastMessage;
  const res = await admin.messaging().sendEachForMulticast(message);
  return res.responses;
}
