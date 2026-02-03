const { db } = require('../../config/firebase');
const { ordersCol, orderRef, OrderStatus, nowTs } = require('./orders.model');
const { dispatchCol, lockRef, locksCol, DispatchStatus } = require('../dispatch/dispatch.model');
const { readyStockKeyByGrade, readyStockRefById } = require('../../inventory/inventory.model');

async function createOrder({ companyName, grade, totalQuantity, truckType, packaging, dryOrAfs, shipTo, priority = 0, notes, userId }) {
  const ref = ordersCol().doc();
  const order = {
    id: ref.id,
    companyName,
    grade,
    totalQuantity: Number(totalQuantity),
    pendingQuantity: Number(totalQuantity),
    truckType: truckType || null,
    packaging,
    dryOrAfs,
    shipTo,
    priority: Number(priority) || 0,
    orderStatus: OrderStatus.Created,
    createdAt: nowTs(),
    approvedAt: null,
    createdBy: userId || null,
    notes: notes || null,
  };
  await ref.set(order);
  return { id: ref.id };
}

async function approveOrder(id, userId) {
  await orderRef(id).set({ orderStatus: OrderStatus.Approved, approvedAt: nowTs(), updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
  return { id };
}

async function prioritizeOrder(id, priority, userId) {
  await orderRef(id).set({ priority: Number(priority), updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
  return { id, priority: Number(priority) };
}

async function listOutstanding() {
  const snap = await ordersCol().where('pendingQuantity', '>', 0).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listQueue() {
  const snap = await ordersCol().where('pendingQuantity', '>', 0).orderBy('priority', 'desc').orderBy('createdAt', 'asc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listHistory({ company, grade, status }) {
  let query = ordersCol();
  if (company) query = query.where('companyName', '==', company);
  if (grade !== undefined) query = query.where('grade', '==', grade);
  if (status) query = query.where('orderStatus', '==', status);
  const snap = await query.orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Allocation: Reserve stock and create dispatch in a single transaction.
async function allocate({ orderId, quantity, userId }) {
  const q = Number(quantity);
  if (q <= 0) throw new Error('quantity must be positive');

  const ordRef = orderRef(orderId);
  const ordSnap = await ordRef.get();
  if (!ordSnap.exists) throw new Error('Order not found');
  const order = ordSnap.data();
  if (order.orderStatus === OrderStatus.Cancelled) throw new Error('Order is cancelled');

  const grade = order.grade;
  const stockId = readyStockKeyByGrade(grade);
  const stockRef = readyStockRefById(stockId);

  const result = await db.runTransaction(async (tx) => {
    const [oSnap, sSnap] = await Promise.all([tx.get(ordRef), tx.get(stockRef)]);
    if (!oSnap.exists) throw new Error('Order not found');
    const oData = oSnap.data();

    if (Number(oData.pendingQuantity || 0) < q) throw new Error('Insufficient pending quantity on order');

    const currentStock = sSnap.exists ? Number(sSnap.data().quantity || 0) : 0;
    const locksQuery = locksCol().where('grade', '==', String(grade)).where('released', '==', false);
    const locksSnap = await tx.get(locksQuery);
    const lockedQty = locksSnap.docs.reduce((sum, d) => sum + Number(d.data().quantityLocked || 0), 0);
    const available = currentStock - lockedQty;
    if (q > available) throw new Error('Insufficient available ready stock for allocation');

    const dispatchRef = dispatchCol().doc();
    const lockDoc = lockRef(dispatchRef.id);

    tx.set(dispatchRef, {
      id: dispatchRef.id,
      orderId: orderId,
      ticketId: null,
      grade: grade,
      quantity: q,
      vehicleNumber: null,
      driverName: null,
      dispatchStatus: DispatchStatus.Assigned,
      assignedAt: nowTs(),
      vehicleAssignedAt: null,
      loadingStartedAt: null,
      dispatchedAt: null,
      createdBy: userId || null,
      assignedTo: null,
      notes: null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    tx.set(lockDoc, {
      id: lockDoc.id,
      dispatchId: dispatchRef.id,
      orderId: orderId,
      grade: String(grade),
      quantityLocked: q,
      released: false,
      timestamp: nowTs(),
      createdBy: userId || null,
    });

    const newPending = Number(oData.pendingQuantity || 0) - q;
    const newStatus = newPending === 0 ? OrderStatus.Completed : OrderStatus.PartiallyFulfilled;
    tx.set(ordRef, { pendingQuantity: newPending, orderStatus: newStatus, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });

    return { dispatchId: dispatchRef.id };
  });

  return result;
}

// Reallocate: move an active lock + dispatch from one order to another
async function reallocate({ fromOrderId, toOrderId, quantity, grade, userId }) {
  const q = Number(quantity);
  if (q <= 0) throw new Error('quantity must be positive');
  const g = String(grade);

  return await db.runTransaction(async (tx) => {
    const fromOrder = await tx.get(orderRef(fromOrderId));
    const toOrder = await tx.get(orderRef(toOrderId));
    if (!fromOrder.exists || !toOrder.exists) throw new Error('Order not found');
    const fromData = fromOrder.data();
    const toData = toOrder.data();

    // Find a dispatch with active lock for fromOrder and grade
    const dispSnap = await tx.get(
      dispatchCol()
        .where('orderId', '==', fromOrderId)
        .where('grade', '==', g)
        .where('dispatchStatus', 'in', [DispatchStatus.Assigned, DispatchStatus.AwaitingTransport, DispatchStatus.VehicleArrived, DispatchStatus.Loading])
    );
    if (dispSnap.empty) throw new Error('No active dispatch found to reallocate');
    const dispDoc = dispSnap.docs[0];

    const lockSnap = await tx.get(lockRef(dispDoc.id));
    if (!lockSnap.exists || lockSnap.data().released) throw new Error('No active lock for the dispatch');
    const lockData = lockSnap.data();
    if (g !== String(lockData.grade)) throw new Error('Grade mismatch for reallocation');
    if (q > Number(lockData.quantityLocked || 0)) throw new Error('Requested quantity exceeds locked quantity');

    // Adjust lock quantity and optionally keep remainder on original dispatch
    // For simplicity: move entire dispatch/lock when quantities match, else split: reduce original lock and create a new dispatch for toOrder for q
    if (q === Number(lockData.quantityLocked)) {
      tx.set(dispDoc.ref, { orderId: toOrderId, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
      tx.set(lockRef(dispDoc.id), { orderId: toOrderId, updatedAt: nowTs() }, { merge: true });
    } else {
      const newDispatchRef = dispatchCol().doc();
      tx.set(newDispatchRef, { ...dispDoc.data(), id: newDispatchRef.id, orderId: toOrderId, quantity: q, assignedAt: nowTs(), updatedAt: nowTs(), createdAt: nowTs() });
      tx.set(lockRef(newDispatchRef.id), { id: newDispatchRef.id, dispatchId: newDispatchRef.id, orderId: toOrderId, grade: g, quantityLocked: q, released: false, timestamp: nowTs(), createdBy: userId || null });
      const remaining = Number(lockData.quantityLocked) - q;
      tx.set(lockRef(dispDoc.id), { quantityLocked: remaining, updatedAt: nowTs() }, { merge: true });
      tx.set(dispDoc.ref, { quantity: remaining, updatedAt: nowTs() }, { merge: true });
    }

    // Adjust pending quantities: add back to from, deduct from to (if to has enough pending)
    const toPending = Number(toData.pendingQuantity || 0);
    if (toPending < q) throw new Error('Target order has insufficient pending to receive allocation');

    const fromNewPending = Number(fromData.pendingQuantity || 0) + q;
    const toNewPending = toPending - q;

    const fromStatus = fromNewPending === 0 ? OrderStatus.Completed : OrderStatus.PartiallyFulfilled;
    const toStatus = toNewPending === 0 ? OrderStatus.Completed : OrderStatus.PartiallyFulfilled;

    tx.set(orderRef(fromOrderId), { pendingQuantity: fromNewPending, orderStatus: fromStatus, updatedAt: nowTs() }, { merge: true });
    tx.set(orderRef(toOrderId), { pendingQuantity: toNewPending, orderStatus: toStatus, updatedAt: nowTs() }, { merge: true });

    return { ok: true };
  });
}

module.exports = {
  createOrder,
  approveOrder,
  prioritizeOrder,
  listOutstanding,
  listQueue,
  listHistory,
  allocate,
  reallocate,
};
