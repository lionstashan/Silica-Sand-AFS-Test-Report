const { db } = require('../../config/firebase');
const {
  newQcRef,
  qcRef,
  productionRef,
  dryingRef,
  freshStockRefByPlantGrade,
  readyStockRefByGrade,
  nowTs,
} = require('./qc.model');

async function requestQc(body, requestedBy) {
  const ref = newQcRef();
  const payload = {
    id: ref.id,
    productionId: body.productionId || null,
    dryingBedId: body.dryingBedId || null,
    grade: body.grade,
    moisture: Number(body.moisture),
    afs: Number(body.afs),
    fm: Number(body.fm),
    comments: body.comments || '',
    status: 'Requested',
    testedBy: null,
    qcReportId: ref.id,
    timestamps: { createdAt: nowTs(), updatedAt: nowTs() },
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

async function startQc(id, testerUid) {
  const ref = qcRef(id);
  await ref.set({ status: 'InProgress', testedBy: testerUid, timestamps: { updatedAt: nowTs(), startedAt: nowTs() } }, { merge: true });
  return { id, status: 'InProgress' };
}

async function passQc(id) {
  const ref = qcRef(id);
  await db.runTransaction(async (tx) => {
    const qcSnap = await tx.get(ref);
    if (!qcSnap.exists) throw new Error('QC report not found');
    const qc = qcSnap.data();

    if (qc.productionId) {
      const pRef = productionRef(qc.productionId);
      const pSnap = await tx.get(pRef);
      if (!pSnap.exists) throw new Error('Linked production log not found');
      const p = pSnap.data();
      const qty = Number(p.quantity || 0);
      const fsRef = freshStockRefByPlantGrade(p.plantId, p.grade);
      const fsSnap = await tx.get(fsRef);
      const prev = fsSnap.exists ? fsSnap.data() : { quantity: 0, plantId: p.plantId, grade: p.grade };
      const next = { ...prev, quantity: Number(prev.quantity || 0) + qty, lastUpdated: nowTs() };
      tx.set(fsRef, next, { merge: true });
      tx.set(pRef, { qcStatus: 'Pass', timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
    } else if (qc.dryingBedId) {
      const dRef = dryingRef(qc.dryingBedId);
      const dSnap = await tx.get(dRef);
      if (!dSnap.exists) throw new Error('Linked drying bed log not found');
      const d = dSnap.data();
      const qty = Number(d.quantity || 0);
      const rsRef = readyStockRefByGrade(qc.grade);
      const rsSnap = await tx.get(rsRef);
      const prev = rsSnap.exists ? rsSnap.data() : { quantity: 0, grade: qc.grade };
      const next = { ...prev, quantity: Number(prev.quantity || 0) + qty, lastUpdated: nowTs() };
      tx.set(rsRef, next, { merge: true });
      tx.set(dRef, { qcStatus: 'Pass', timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
    } else {
      throw new Error('Invalid QC link');
    }

    tx.set(ref, { status: 'Pass', timestamps: { updatedAt: nowTs(), completedAt: nowTs() } }, { merge: true });
  });
  return { id, status: 'Pass' };
}

async function failQc(id) {
  const ref = qcRef(id);
  await db.runTransaction(async (tx) => {
    const qcSnap = await tx.get(ref);
    if (!qcSnap.exists) throw new Error('QC report not found');
    const qc = qcSnap.data();

    if (qc.productionId) {
      const pRef = productionRef(qc.productionId);
      tx.set(pRef, { qcStatus: 'Fail', timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
    }
    if (qc.dryingBedId) {
      const dRef = dryingRef(qc.dryingBedId);
      tx.set(dRef, { qcStatus: 'Fail', timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
    }
    tx.set(ref, { status: 'Fail', timestamps: { updatedAt: nowTs(), completedAt: nowTs() } }, { merge: true });
  });
  return { id, status: 'Fail' };
}

async function listPending() {
  const snap = await db.collection('qcReports').where('status', 'in', ['Requested', 'InProgress']).orderBy('timestamps.createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listHistory() {
  const snap = await db.collection('qcReports').orderBy('timestamps.createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  requestQc,
  startQc,
  passQc,
  failQc,
  listPending,
  listHistory,
};
