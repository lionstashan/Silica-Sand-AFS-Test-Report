const Joi = require('joi');
const { db } = require('../../config/firebase');
const { newProductionRef, productionRef, freshStockRef, nowTs } = require('./production.model');

const plants = [1, 2, 3, 4, 5];

const createSchema = Joi.object({
  plantId: Joi.number().integer().valid(...plants).required(),
  grade: Joi.string().min(1).required(),
  quantity: Joi.number().min(0).required(),
  operator: Joi.string().required(),
  shift: Joi.string().allow('').optional(),
  notes: Joi.string().allow('').optional(),
  timestamp: Joi.date().optional(),
});

async function createLog(body, createdBy) {
  const { error, value } = createSchema.validate(body);
  if (error) throw new Error(error.message);

  const ref = newProductionRef();
  const payload = {
    id: ref.id,
    plantId: value.plantId,
    grade: value.grade,
    quantity: Number(value.quantity),
    operator: value.operator,
    shift: value.shift || null,
    notes: value.notes || '',
    status: 'PendingQC',
    qcRequest: false,
    qcResultId: null,
    createdBy,
    timestamps: {
      createdAt: nowTs(),
      updatedAt: nowTs(),
      productionAt: value.timestamp ? new Date(value.timestamp) : nowTs(),
    },
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

async function getDailyLogs(date = new Date()) {
  // Filter by today's date (server-side simple filter by start of day)
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const snap = await db
    .collection('productionLogs')
    .where('timestamps.productionAt', '>=', start)
    .orderBy('timestamps.productionAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getByPlant(plantId) {
  const snap = await db
    .collection('productionLogs')
    .where('plantId', '==', Number(plantId))
    .orderBy('timestamps.createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function markQcRequest(id) {
  const ref = productionRef(id);
  await ref.set({ status: 'PendingQC', qcRequest: true, timestamps: { updatedAt: nowTs() } }, { merge: true });
  return { id, status: 'PendingQC', qcRequest: true };
}

async function qcPass(id) {
  // Set status to Pass and increment freshStock by plant+grade quantity atomically
  const ref = productionRef(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Production log not found');
    const data = snap.data();
    const qty = Number(data.quantity || 0);
    const fsRef = freshStockRef({ plantId: data.plantId, grade: data.grade });
    const fsSnap = await tx.get(fsRef);
    const prev = fsSnap.exists ? fsSnap.data() : { quantity: 0, plantId: data.plantId, grade: data.grade };
    const next = {
      ...prev,
      quantity: Number(prev.quantity || 0) + qty,
      lastUpdated: nowTs(),
    };
    tx.set(fsRef, next, { merge: true });
    tx.set(ref, { status: 'Pass', timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
  });
  return { id, status: 'Pass' };
}

async function qcFail(id) {
  const ref = productionRef(id);
  await ref.set({ status: 'Fail', timestamps: { updatedAt: nowTs(), qcAt: nowTs() } }, { merge: true });
  return { id, status: 'Fail' };
}

module.exports = {
  createLog,
  getDailyLogs,
  getByPlant,
  markQcRequest,
  qcPass,
  qcFail,
};
