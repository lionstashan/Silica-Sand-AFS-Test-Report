import * as admin from 'firebase-admin';
import { notifyRoles } from '../fcm';

export async function handleProductionUpdate(ticketId: string, before: any, after: any) {
  const db = admin.firestore();
  const type = after?.type;
  if (type !== 'Production') return;

  // When QC feedback is present and pass, update Fresh Stock
  const qc = after?.qc;
  if (qc?.status === 'Pass' && qc?.grade && after?.plant) {
    const stockId = `fresh_${after.plant}_${qc.grade}`;
    const ref = db.collection('stocks').doc(stockId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : {};
      const qty = Number(after?.productionQty || 0);
      tx.set(ref, {
        category: 'Fresh',
        plant: after.plant,
        grade: qc.grade,
        qty: Number(current?.qty || 0) + qty,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await notifyRoles(['Manager', 'QC'], 'Fresh Stock Updated', `Plant ${after.plant}, Grade ${qc.grade}`);
  }
}
