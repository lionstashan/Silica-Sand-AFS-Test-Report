import * as admin from 'firebase-admin';
import { notifyRoles } from '../fcm';

export async function handleQCUpdate(ticketId: string, before: any, after: any) {
  const db = admin.firestore();
  const type = after?.type;
  if (type !== 'QC') return;

  const status = after?.status;
  if (status === 'Completed') {
    await db.collection('tickets').doc(ticketId).update({ closedAt: admin.firestore.FieldValue.serverTimestamp() });
    await notifyRoles(['Manager', 'Director'], 'QC Completed', `QC ticket ${ticketId} completed`);
  }
}
