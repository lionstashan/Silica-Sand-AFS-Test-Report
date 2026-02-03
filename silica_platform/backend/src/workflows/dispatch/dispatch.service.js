const { db } = require('../../config/firebase');
const { readyStockKeyByGrade, readyStockRefById, nowTs, MOVEMENTS_COLLECTION } = require('../../inventory/inventory.model');
const { dispatchCol, dispatchRef, lockRef, locksCol, orderRef, DispatchStatus } = require('./dispatch.model');

async function createMovement(tx, { stockType, type, source, grade, quantity, before, after, referenceId, userId, docId, meta }) {
  const ref = db.collection(MOVEMENTS_COLLECTION).doc();
  tx.set(ref, {
    id: ref.id,
    stockType,
    type,
    source,
    grade: grade || null,
    quantity: Number(quantity),
    before: before !== undefined ? Number(before) : null,
    after: after !== undefined ? Number(after) : null,
    timestamp: nowTs(),
    referenceId: referenceId || null,
    userId: userId || null,
    docId: docId || null,
    meta: meta || null,
  });
}

async function assignDispatch({ orderId, ticketId, grade, quantity, assignedTo, notes, userId }) {
  const docRef = dispatchCol().doc();
  const lockDoc = lockRef(docRef.id);
  const stockId = readyStockKeyByGrade(grade);
  const stockRef = readyStockRefById(stockId);

  await db.runTransaction(async (tx) => {
    const stockSnap = await tx.get(stockRef);
    const currentStock = stockSnap.exists ? Number(stockSnap.data().quantity || 0) : 0;

    const locksQuery = locksCol().where('grade', '==', String(grade)).where('released', '==', false);
    const locksSnap = await tx.get(locksQuery);
    const lockedQty = locksSnap.docs.reduce((sum, d) => sum + Number(d.data().quantityLocked || 0), 0);
    const available = currentStock - lockedQty;
    if (Number(quantity) > available) throw new Error('Insufficient available ready stock to lock');

    tx.set(docRef, {
      id: docRef.id,
      orderId: orderId || null,
      ticketId: ticketId || null,
      grade: grade,
      quantity: Number(quantity),
      vehicleNumber: null,
      driverName: null,
      dispatchStatus: DispatchStatus.Assigned,
      assignedAt: nowTs(),
      vehicleAssignedAt: null,
      loadingStartedAt: null,
      dispatchedAt: null,
      createdBy: userId || null,
      assignedTo: assignedTo || null,
      notes: notes || null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    tx.set(lockDoc, {
      id: lockDoc.id,
      dispatchId: docRef.id,
      orderId: orderId || null,
      grade: String(grade),
      quantityLocked: Number(quantity),
      released: false,
      timestamp: nowTs(),
      createdBy: userId || null,
    });

    await createMovement(tx, {
      stockType: 'ready',
      type: 'OUT',
      source: 'dispatch-lock',
      grade,
      quantity,
      before: currentStock,
      after: currentStock,
      referenceId: docRef.id,
      userId,
      docId: stockId,
      meta: { lock: true },
    });
  });

  return { id: docRef.id };
}

async function assignVehicle(id, { vehicleNumber, driverName, userId }) {
  await db.runTransaction(async (tx) => {
    const ref = dispatchRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Dispatch not found');

    tx.set(ref, {
      vehicleNumber,
      driverName,
      dispatchStatus: DispatchStatus.AwaitingTransport,
      vehicleAssignedAt: nowTs(),
      updatedAt: nowTs(),
      updatedBy: userId || null,
    }, { merge: true });
  });
  return { id };
}

async function markArrived(id, userId) {
  await db.runTransaction(async (tx) => {
    const ref = dispatchRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Dispatch not found');

    tx.set(ref, { dispatchStatus: DispatchStatus.VehicleArrived, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
  });
  return { id };
}

async function markLoading(id, userId) {
  await db.runTransaction(async (tx) => {
    const ref = dispatchRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Dispatch not found');

    tx.set(ref, { dispatchStatus: DispatchStatus.Loading, loadingStartedAt: nowTs(), updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
  });
  return { id };
}

async function completeDispatch(id, userId) {
  await db.runTransaction(async (tx) => {
    const ref = dispatchRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Dispatch not found');
    const data = snap.data();

    if (data.dispatchStatus === DispatchStatus.Dispatched) throw new Error('Already dispatched');

    const stockId = readyStockKeyByGrade(data.grade);
    const stockRef = readyStockRefById(stockId);
    const stockSnap = await tx.get(stockRef);
    const beforeQty = stockSnap.exists ? Number(stockSnap.data().quantity || 0) : 0;

    const lock = await tx.get(lockRef(id));
    if (!lock.exists || lock.data().released) throw new Error('No active stock lock for this dispatch');
    const q = Number(lock.data().quantityLocked || data.quantity || 0);

    if (q > beforeQty) throw new Error('Insufficient ready stock to deduct');

    const afterQty = beforeQty - q;
    tx.set(stockRef, { quantity: afterQty, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });

    tx.set(lockRef(id), { released: true, releasedAt: nowTs(), releasedBy: userId || null }, { merge: true });

    await createMovement(tx, {
      stockType: 'ready',
      type: 'OUT',
      source: 'dispatch',
      grade: data.grade,
      quantity: q,
      before: beforeQty,
      after: afterQty,
      referenceId: id,
      userId,
      docId: stockId,
    });

    tx.set(ref, { dispatchStatus: DispatchStatus.Dispatched, dispatchedAt: nowTs(), updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });

    // Note: pendingQuantity is reduced at allocation time in orders.service.allocate.
  });
  return { id };
}

async function listPending() {
  const snap = await dispatchCol().where('dispatchStatus', 'in', [
    DispatchStatus.Assigned,
    DispatchStatus.AwaitingTransport,
    DispatchStatus.VehicleArrived,
    DispatchStatus.Loading,
  ]).orderBy('assignedAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listHistory() {
  const snap = await dispatchCol().orderBy('assignedAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  assignDispatch,
  assignVehicle,
  markArrived,
  markLoading,
  completeDispatch,
  listPending,
  listHistory,
};
