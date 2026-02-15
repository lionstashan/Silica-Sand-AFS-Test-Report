import * as admin from 'firebase-admin';
import { notifyRoles } from '../fcm';

export async function handleDryingUpdate(ticketId: string, before: any, after: any) {
  const db = admin.firestore();
  const type = after?.type;
  if (type !== 'Drying') return;

  const qc = after?.qc;
  if (qc?.status === 'Pass' && qc?.grade && after?.bed) {
    const stockId = `ready_afs_${qc.grade}`;
    const ref = db.collection('stocks').doc(stockId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : {};
      const qty = Number(after?.dryQty || 0);
      tx.set(ref, {
        category: 'ReadyAFS',
        bed: after.bed,
        grade: qc.grade,
        qty: Number(current?.qty || 0) + qty,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await notifyRoles(['Manager', 'QC'], 'AFS Ready Stock Updated', `Bed ${after.bed}, Grade ${qc.grade}`);
  }
}
