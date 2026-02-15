const Joi = require('joi');
const { db, admin } = require('../../config/firebase');
const { miningRef, freshStockRef, nowTs } = require('./mining.model');
const tickets = require('../../tickets/tickets.service');

const createSchema = Joi.object({
  mineNumber: Joi.number().integer().min(1).max(3).required(),
  pitNumber: Joi.number().integer().min(1).max(4).required(),
  expectedDumpers: Joi.number().integer().min(0).default(0),
  machineOperator: Joi.string().required(),
  dumperOperators: Joi.array().items(Joi.string()).default([]),
  notes: Joi.string().allow('').default(''),
});

async function createMiningTask(body, createdBy) {
  const { error, value } = createSchema.validate(body);
  if (error) throw new Error(error.message);

  // Create core ticket first
  const ticket = await tickets.createTicket({ department: 'mining', assignedTo: value.machineOperator, metadata: value }, createdBy);

  // Persist mining task doc with the same ticketId as the document id
  const ref = miningRef(ticket.id);
  const payload = {
    ticketId: ticket.id,
    ...value,
    dumpersLoaded: 0,
    downtimeLogs: [],
    photos: [],
    timestamps: { createdAt: nowTs(), updatedAt: nowTs() },
  };
  await ref.set(payload);
  return { id: ticket.id, ...payload, ticket };
}

async function startMining(ticketId, byUid) {
  // Transition ticket to InProgress
  await tickets.updateTicketStatus(ticketId, 'InProgress', byUid);
  const ref = miningRef(ticketId);
  await ref.set({ timestamps: { updatedAt: nowTs(), startedAt: nowTs() } }, { merge: true });
  return { id: ticketId, status: 'InProgress' };
}

async function addDowntime(ticketId, { reason, notes }, byUid) {
  await tickets.addDowntime(ticketId, { reason, notes }, byUid);
  const log = { type: 'downtime', reason, notes: notes || '', by: byUid, ts: nowTs() };
  await miningRef(ticketId).set({ downtimeLogs: admin.firestore.FieldValue.arrayUnion(log), timestamps: { updatedAt: nowTs() } }, { merge: true });
  return { id: ticketId, status: 'Downtime' };
}

async function resumeMining(ticketId, byUid) {
  await tickets.resumeFromDowntime(ticketId, byUid);
  // Immediately move back to InProgress after resume per rules
  await tickets.updateTicketStatus(ticketId, 'InProgress', byUid);
  const log = { type: 'resume', by: byUid, ts: nowTs() };
  await miningRef(ticketId).set({ downtimeLogs: admin.firestore.FieldValue.arrayUnion(log), timestamps: { updatedAt: nowTs() } }, { merge: true });
  return { id: ticketId, status: 'InProgress' };
}

async function completeMining(ticketId, { dumpersLoaded = 0, notes = '' }, byUid) {
  // Transition ticket through Completing -> Completed
  await tickets.updateTicketStatus(ticketId, 'Completing', byUid);
  await tickets.updateTicketStatus(ticketId, 'Completed', byUid);

  // Update mining doc and fresh stock transactionally
  const ref = miningRef(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Mining task not found');
  const task = snap.data();
  const qtyInc = Number(dumpersLoaded || 0);

  await db.runTransaction(async (tx) => {
    const fsRef = freshStockRef({ mineNumber: task.mineNumber, pitNumber: task.pitNumber });
    const fsSnap = await tx.get(fsRef);
    const prev = fsSnap.exists ? fsSnap.data() : { quantity: 0, mineNumber: task.mineNumber, pitNumber: task.pitNumber };
    const next = {
      ...prev,
      quantity: Number(prev.quantity || 0) + qtyInc,
      lastUpdated: nowTs(),
    };
    tx.set(fsRef, next, { merge: true });
    tx.set(ref, { dumpersLoaded: qtyInc, timestamps: { updatedAt: nowTs(), completedAt: nowTs() }, notes }, { merge: true });
  });

  return { id: ticketId, status: 'Completed', addedToFreshStock: qtyInc };
}

module.exports = {
  createMiningTask,
  startMining,
  addDowntime,
  resumeMining,
  completeMining,
  listPending,
};

async function listPending() {
  // Return mining tasks; optionally filter by ticket status not Completed
  const { db } = require('../../config/firebase');
  const { MINING_COLLECTION } = require('./mining.model');
  const snap = await db.collection(MINING_COLLECTION).orderBy('timestamps.createdAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
