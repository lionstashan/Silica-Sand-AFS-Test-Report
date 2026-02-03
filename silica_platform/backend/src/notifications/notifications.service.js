const { admin, messaging, tokensRef, logsCol, nowTs } = require('./notifications.model');

function toStringMap(obj = {}) {
  const m = {};
  for (const [k, v] of Object.entries(obj)) m[String(k)] = v == null ? '' : String(v);
  return m;
}

async function registerToken(uid, token) {
  const ref = tokensRef(uid);
  await ref.set({
    uid,
    tokens: admin.firestore.FieldValue.arrayUnion(token),
    updatedAt: nowTs(),
  }, { merge: true });
  return { ok: true };
}

async function logNotification({ uid, title, body, meta, status }) {
  const ref = logsCol().doc();
  await ref.set({ id: ref.id, uid, title, body, meta: meta || null, status, sentAt: nowTs() });
}

async function cleanupInvalidTokens(uid, tokens) {
  if (!tokens || !tokens.length) return;
  const ref = tokensRef(uid);
  await ref.set({ tokens: admin.firestore.FieldValue.arrayRemove(...tokens), updatedAt: nowTs() }, { merge: true });
}

async function sendToUser(uid, title, body, data = {}, actorUid = null) {
  const ref = tokensRef(uid);
  const snap = await ref.get();
  const tokens = snap.exists ? (snap.data().tokens || []) : [];
  if (!tokens.length) {
    await logNotification({ uid, title, body, meta: { reason: 'no-tokens', actorUid, data }, status: 'failure' });
    return { ok: true, count: 0 };
  }

  const message = {
    tokens,
    notification: { title, body },
    data: toStringMap(data),
  };

  const resp = await messaging.sendEachForMulticast(message);
  const invalidTokens = [];
  resp.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error && r.error.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        invalidTokens.push(tokens[idx]);
      }
    }
  });
  if (invalidTokens.length) await cleanupInvalidTokens(uid, invalidTokens);

  await logNotification({ uid, title, body, meta: { successCount: resp.successCount, failureCount: resp.failureCount, actorUid, data, invalidTokens }, status: resp.successCount > 0 ? 'success' : 'failure' });

  return { ok: true, count: resp.successCount };
}

async function sendToMultiple(uids = [], title, body, data = {}, actorUid = null) {
  let total = 0;
  for (const uid of uids) {
    const { count } = await sendToUser(uid, title, body, data, actorUid);
    total += count;
  }
  return { ok: true, count: total };
}

// Triggers
async function sendQCRequested(userId, productionId) {
  return sendToUser(userId, 'QC Requested', 'A new QC check is requested.', { type: 'qc_requested', productionId });
}
async function sendQCPass(userId, productionId) {
  return sendToUser(userId, 'QC Passed', 'Production batch passed QC.', { type: 'qc_pass', productionId });
}
async function sendQCFail(userId, productionId) {
  return sendToUser(userId, 'QC Failed', 'Production batch failed QC.', { type: 'qc_fail', productionId });
}
async function sendDryingReady(userId, dryingLogId) {
  return sendToUser(userId, 'Drying Ready', 'Drying bed is ready for QC.', { type: 'drying_ready', dryingLogId });
}
async function sendDispatchAssigned(userId, dispatchId) {
  return sendToUser(userId, 'Dispatch Assigned', 'A dispatch has been assigned to you.', { type: 'dispatch_assigned', dispatchId });
}
async function sendVehicleAssigned(userId, dispatchId) {
  return sendToUser(userId, 'Vehicle Assigned', 'Vehicle assigned for your dispatch.', { type: 'vehicle_assigned', dispatchId });
}
async function sendVehicleArrived(userId, dispatchId) {
  return sendToUser(userId, 'Vehicle Arrived', 'Vehicle has arrived at the plant.', { type: 'vehicle_arrived', dispatchId });
}
async function sendLoadingStarted(userId, dispatchId) {
  return sendToUser(userId, 'Loading Started', 'Loading has started for your dispatch.', { type: 'loading_started', dispatchId });
}
async function sendDispatched(userId, dispatchId) {
  return sendToUser(userId, 'Dispatched', 'Your dispatch has left the plant.', { type: 'dispatched', dispatchId });
}
async function sendOrderAllocated(userId, orderId) {
  return sendToUser(userId, 'Order Allocated', 'An order was allocated.', { type: 'order_allocated', orderId });
}
async function sendOrderApproved(userId, orderId) {
  return sendToUser(userId, 'Order Approved', 'Your order has been approved.', { type: 'order_approved', orderId });
}
async function sendTransportReminder(userId, orderId) {
  return sendToUser(userId, 'Transport Reminder', 'Please arrange transport for your order.', { type: 'transport_reminder', orderId });
}

module.exports = {
  registerToken,
  sendToUser,
  sendToMultiple,
  sendQCRequested,
  sendQCPass,
  sendQCFail,
  sendDryingReady,
  sendDispatchAssigned,
  sendVehicleAssigned,
  sendVehicleArrived,
  sendLoadingStarted,
  sendDispatched,
  sendOrderAllocated,
  sendOrderApproved,
  sendTransportReminder,
};
