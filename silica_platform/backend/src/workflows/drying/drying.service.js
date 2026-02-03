const { db } = require('../../config/firebase');
const { newDryingRef, dryingRef, readyStockRefByGrade, nowTs, ACTIVE_STATUSES, DRYING_COLLECTION } = require('./drying.model');

async function ensureBedAvailable(dryingBedId) {
  const snap = await db.collection(DRYING_COLLECTION)
    .where('dryingBedId', '==', Number(dryingBedId))
    .where('dryingStatus', 'in', ACTIVE_STATUSES)
    .limit(1)
    .get();
  if (!snap.empty) {
    throw new Error(`Drying bed ${dryingBedId} already has an active task`);
  }
}

async function assign(body, createdBy) {
  await ensureBedAvailable(body.dryingBedId);
  const ref = newDryingRef();
  const payload = {
    id: ref.id,
    dryingBedId: Number(body.dryingBedId),
    productionId: body.productionId || null,
    wetQuantity: Number(body.wetQuantity),
    grade: body.grade,
    moistureStart: Number(body.moistureStart),
    moistureNow: Number(body.moistureStart),
    dryingStatus: 'Assigned',
    operator: body.operator,
    assignedAt: nowTs(),
    completedAt: null,
    qcReportId: null,
    notes: body.notes || '',
    timestamps: { createdAt: nowTs(), updatedAt: nowTs() },
    createdBy,
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

async function updateMoisture(id, moistureNow, byUid) {
  const ref = dryingRef(id);
  await ref.set({
    moistureNow: Number(moistureNow),
    dryingStatus: 'Drying',
    timestamps: { updatedAt: nowTs() },
  }, { merge: true });
  return { id, dryingStatus: 'Drying', moistureNow: Number(moistureNow) };
}

async function finish(id, byUid) {
  const ref = dryingRef(id);
  await ref.set({
    dryingStatus: 'PendingQC',
    completedAt: nowTs(),
    timestamps: { updatedAt: nowTs() },
  }, { merge: true });
  return { id, dryingStatus: 'PendingQC' };
}

async function qcPass(id, { qcReportId }) {
  const ref = dryingRef(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Drying log not found');
    const data = snap.data();
    if (data.dryingStatus !== 'PendingQC') {
      throw new Error('Drying log must be PendingQC to pass QC');
    }
    const qty = Number(data.wetQuantity || 0);
    const rsRef = readyStockRefByGrade(data.grade);
    const rsSnap = await tx.get(rsRef);
    const prev = rsSnap.exists ? rsSnap.data() : { quantity: 0, grade: data.grade };
    const next = { ...prev, quantity: Number(prev.quantity || 0) + qty, lastUpdated: nowTs() };
    tx.set(rsRef, next, { merge: true });
    tx.set(ref, { dryingStatus: 'Pass', qcReportId: qcReportId || null, timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
    if (qcReportId) {
      const qcRef = db.collection('qcReports').doc(qcReportId);
      tx.set(qcRef, { dryingBedId: data.dryingBedId, status: 'Pass', timestamps: { updatedAt: nowTs() } }, { merge: true });
    }
  });
  return { id, dryingStatus: 'Pass' };
}

async function qcFail(id) {
  const ref = dryingRef(id);
  await ref.set({
    dryingStatus: 'Fail',
    timestamps: { updatedAt: nowTs(), qcAt: nowTs() },
  }, { merge: true });
  return { id, dryingStatus: 'Fail' };
}

async function listPending() {
  const snap = await db.collection(DRYING_COLLECTION)
    .where('dryingStatus', 'in', ['Assigned', 'Drying', 'PendingQC'])
    .orderBy('assignedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listHistory() {
  const snap = await db.collection(DRYING_COLLECTION)
    .orderBy('assignedAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  assign,
  updateMoisture,
  finish,
  qcPass,
  qcFail,
  listPending,
  listHistory,
};
