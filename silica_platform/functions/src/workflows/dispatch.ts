import * as admin from 'firebase-admin';
import { notifyRoles } from '../fcm';

export async function handleDispatchCreate(orderId: string, dispatchId: string, data: any) {
  const db = admin.firestore();
  const grade = data?.grade as string | undefined;
  const qty = Number(data?.loadQty || 0);
  const category = (data?.category as string) || 'ReadyDry';
  if (!grade || qty <= 0) return;
  const stockId = `${category.toLowerCase()}_${grade}`;
  const ref = db.collection('stocks').doc(stockId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : { qty: 0 };
    const newQty = Number(current?.qty || 0) - qty;
    tx.set(ref, {
      category,
      grade,
      qty: newQty,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await notifyRoles(['Dispatch', 'Accounts', 'Manager'], 'Dispatch Created', `Order ${orderId} dispatch ${dispatchId} for ${qty} of ${grade}`);
}
