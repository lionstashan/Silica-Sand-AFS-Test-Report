import * as admin from 'firebase-admin';
import { notifyRoles } from '../fcm';

export async function handleMiningUpdate(ticketId: string, before: any, after: any) {
  const db = admin.firestore();
  const type = after?.type;
  if (type !== 'Mining') return;

  // Log status changes
  if (before?.status !== after?.status) {
    await db.collection('tickets').doc(ticketId).collection('logs').add({
      ts: admin.firestore.FieldValue.serverTimestamp(),
      from: before?.status || null,
      to: after?.status,
      by: after?.updatedBy || null
    });
  }

  // Downtime notifications and tracking
  if (after?.status === 'Downtime') {
    await notifyRoles(['Maintenance', 'Manager'], 'Mining Downtime', `Ticket ${ticketId} in downtime`);
  }

  if (after?.status === 'Ready-To-Resume') {
    await notifyRoles(['Manager'], 'Ready to Resume', `Mining ticket ${ticketId} ready to resume`);
  }

  if (after?.status === 'Completed') {
    await notifyRoles(['Manager', 'Director'], 'Mining Completed', `Mining ticket ${ticketId} completed`);
  }
}
