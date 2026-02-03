const { db, admin } = require('../config/firebase');

const TICKETS_COLLECTION = 'tickets';

const STATUSES = [
  'Open',
  'InProgress',
  'Downtime',
  'Resume',
  'Completing',
  'Completed',
  'Closed',
];

const TRANSITIONS = {
  Open: ['InProgress', 'Closed'],
  InProgress: ['Downtime', 'Completing', 'Closed'],
  Downtime: ['Resume', 'Closed'],
  Resume: ['InProgress', 'Closed'],
  Completing: ['Completed', 'Closed'],
  Completed: ['Closed'],
  Closed: [],
};

function isAllowedTransition(current, next) {
  if (!STATUSES.includes(next)) return false;
  if (!current) return next === 'Open';
  const allowed = TRANSITIONS[current] || [];
  return allowed.includes(next);
}

function ticketsCol() {
  return db.collection(TICKETS_COLLECTION);
}

function ticketRef(ticketId) {
  return ticketsCol().doc(ticketId);
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

module.exports = {
  TICKETS_COLLECTION,
  STATUSES,
  TRANSITIONS,
  isAllowedTransition,
  ticketsCol,
  ticketRef,
  nowTs,
};
