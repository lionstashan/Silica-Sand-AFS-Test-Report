const { db, admin } = require('../config/firebase');
const { ticketsCol, ticketRef, isAllowedTransition, nowTs } = require('./tickets.model');

function generateTicketId() {
  return ticketsCol().doc().id;
}

async function createTicket({ department, assignedTo, metadata }, createdBy) {
  const ticketId = generateTicketId();
  const doc = ticketRef(ticketId);
  const payload = {
    ticketId,
    department,
    assignedTo: assignedTo || null,
    createdBy,
    status: 'Open',
    metadata: metadata || {},
    timestamps: {
      createdAt: nowTs(),
      updatedAt: nowTs(),
    },
  };
  await doc.set(payload);
  return { id: ticketId, ...payload };
}

async function getTicketsByUser(uid, { limit = 50 } = {}) {
  const q1 = ticketsCol().where('assignedTo', '==', uid).orderBy('timestamps.createdAt', 'desc').limit(limit);
  const snap = await q1.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getTicketsByDepartment(department, { limit = 50 } = {}) {
  const q = ticketsCol().where('department', '==', department).orderBy('timestamps.createdAt', 'desc').limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getTicketById(id) {
  const snap = await ticketRef(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function updateTicketStatus(id, nextStatus, byUid) {
  const ref = ticketRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Ticket not found');
  const current = snap.data().status;
  if (!isAllowedTransition(current, nextStatus)) {
    throw new Error(`Invalid transition from ${current} to ${nextStatus}`);
  }
  await ref.set({ status: nextStatus, timestamps: { updatedAt: nowTs() } }, { merge: true });
  return { id, status: nextStatus };
}

async function addDowntime(id, { reason, notes }, byUid) {
  const ref = ticketRef(id);
  const log = {
    type: 'downtime',
    reason,
    notes: notes || '',
    by: byUid,
    ts: nowTs(),
  };
  await ref.set({
    status: 'Downtime',
    timestamps: { updatedAt: nowTs() },
    downtimeLogs: admin.firestore.FieldValue.arrayUnion(log),
  }, { merge: true });
  return { id, status: 'Downtime' };
}

async function resumeFromDowntime(id, byUid) {
  const ref = ticketRef(id);
  const log = {
    type: 'resume',
    by: byUid,
    ts: nowTs(),
  };
  await ref.set({
    status: 'Resume',
    timestamps: { updatedAt: nowTs() },
    downtimeLogs: admin.firestore.FieldValue.arrayUnion(log),
  }, { merge: true });
  return { id, status: 'Resume' };
}

async function completeTicket(id, byUid) {
  const ref = ticketRef(id);
  await ref.set({ status: 'Completed', timestamps: { updatedAt: nowTs() } }, { merge: true });
  return { id, status: 'Completed' };
}

module.exports = {
  createTicket,
  getTicketsByUser,
  getTicketsByDepartment,
  getTicketById,
  updateTicketStatus,
  addDowntime,
  resumeFromDowntime,
  completeTicket,
};
