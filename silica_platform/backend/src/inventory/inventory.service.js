const { db, FRESH_STOCK_COLLECTION, READY_STOCK_COLLECTION, MOVEMENTS_COLLECTION, freshStockKeyByPlantGrade, freshStockKeyByMinePit, readyStockKeyByGrade, freshStockRefById, readyStockRefById, nowTs } = require('./inventory.model');

async function recordMovement(tx, { stockType, type, source, grade, quantity, before, after, referenceId, userId, docId }) {
  const ref = db.collection(MOVEMENTS_COLLECTION).doc();
  tx.set(ref, {
    id: ref.id,
    stockType,
    type, // IN or OUT
    source, // mining | production | qc | drying | dispatch | manual
    grade: grade || null,
    quantity: Number(quantity),
    before: Number(before),
    after: Number(after),
    timestamp: nowTs(),
    referenceId: referenceId || null,
    userId: userId || null,
    docId,
  });
}

async function incrementFreshStock({ plantId, grade, mineNumber, pitNumber, quantity, referenceId, source = 'manual', userId }) {
  const isPlant = plantId !== undefined;
  const docId = isPlant ? freshStockKeyByPlantGrade(plantId, grade) : freshStockKeyByMinePit(mineNumber, pitNumber);
  const ref = freshStockRefById(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : { quantity: 0, grade: grade || null, plantId: plantId || null, mineNumber: mineNumber || null, pitNumber: pitNumber || null };
    const before = Number(prev.quantity || 0);
    const after = before + Number(quantity);
    tx.set(ref, {
      ...prev,
      plantId: plantId || prev.plantId || null,
      mineNumber: mineNumber || prev.mineNumber || null,
      pitNumber: pitNumber || prev.pitNumber || null,
      grade: grade || prev.grade || null,
      quantity: after,
      updatedAt: nowTs(),
      updatedBy: userId || null,
    }, { merge: true });
    await recordMovement(tx, { stockType: 'fresh', type: 'IN', source, grade: grade || null, quantity, before, after, referenceId, userId, docId });
  });
  return { id: docId };
}

async function incrementReadyStock({ grade, quantity, referenceId, source = 'manual', userId }) {
  const docId = readyStockKeyByGrade(grade);
  const ref = readyStockRefById(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : { quantity: 0, grade };
    const before = Number(prev.quantity || 0);
    const after = before + Number(quantity);
    tx.set(ref, { grade, quantity: after, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
    await recordMovement(tx, { stockType: 'ready', type: 'IN', source, grade, quantity, before, after, referenceId, userId, docId });
  });
  return { id: docId };
}

async function decrementReadyStock({ grade, quantity, referenceId, source = 'dispatch', userId }) {
  const docId = readyStockKeyByGrade(grade);
  const ref = readyStockRefById(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : { quantity: 0, grade };
    const before = Number(prev.quantity || 0);
    const q = Number(quantity);
    if (q > before) throw new Error('Insufficient ready stock');
    const after = before - q;
    tx.set(ref, { grade, quantity: after, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
    await recordMovement(tx, { stockType: 'ready', type: 'OUT', source, grade, quantity, before, after, referenceId, userId, docId });
  });
  return { id: docId };
}

async function getFreshStockList() {
  const snap = await db.collection(FRESH_STOCK_COLLECTION).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getReadyStockList() {
  const snap = await db.collection(READY_STOCK_COLLECTION).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function setFreshStockQuantity(docId, quantity, userId) {
  const ref = freshStockRefById(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : { quantity: 0 };
    const before = Number(prev.quantity || 0);
    const after = Number(quantity);
    tx.set(ref, { quantity: after, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
    const type = after >= before ? 'IN' : 'OUT';
    const delta = Math.abs(after - before);
    if (delta > 0) await recordMovement(tx, { stockType: 'fresh', type, source: 'manual', grade: prev.grade || null, quantity: delta, before, after, referenceId: null, userId, docId: docId });
  });
  return { id: docId, quantity };
}

async function setReadyStockQuantity(docId, quantity, userId) {
  const ref = readyStockRefById(docId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : { quantity: 0 };
    const before = Number(prev.quantity || 0);
    const after = Number(quantity);
    tx.set(ref, { quantity: after, updatedAt: nowTs(), updatedBy: userId || null }, { merge: true });
    const type = after >= before ? 'IN' : 'OUT';
    const delta = Math.abs(after - before);
    if (delta > 0) await recordMovement(tx, { stockType: 'ready', type, source: 'manual', grade: prev.grade || null, quantity: delta, before, after, referenceId: null, userId, docId: docId });
  });
  return { id: docId, quantity };
}

async function listMovements(limit = 100) {
  const snap = await db.collection(MOVEMENTS_COLLECTION).orderBy('timestamp', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  incrementFreshStock,
  incrementReadyStock,
  decrementReadyStock,
  getFreshStockList,
  getReadyStockList,
  setFreshStockQuantity,
  setReadyStockQuantity,
  listMovements,
};
