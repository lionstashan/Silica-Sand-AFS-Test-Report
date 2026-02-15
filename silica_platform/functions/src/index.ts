import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { setUserRoles } from './auth';
import { handleMiningUpdate } from './workflows/mining';
import { handleProductionUpdate } from './workflows/production';
import { handleDryingUpdate } from './workflows/drying';
import { handleQCUpdate } from './workflows/qc';
import { handleDispatchCreate } from './workflows/dispatch';
import { validateMiningTicket, normalizeMiningTicket, isAllowedTransition } from './models/miningTicket';
import { validateProductionTicket, normalizeProductionTicket, isAllowedTransition as prodAllowed } from './models/productionTicket';
import { validateDryingTicket, normalizeDryingTicket, isAllowedTransition as dryAllowed } from './models/dryingTicket';

admin.initializeApp();

// Export callable for role claims
export const setRoles = setUserRoles;

// Normalize ticket creation: ensure defaults and topics
export const ticketCreated = functions.firestore
  .document('tickets/{ticketId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const ticketId = context.params.ticketId;
    const defaults: any = {
      status: data?.status || 'Open',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    // Mining-specific validation
    if (data?.type === 'Mining') {
      const normalized = normalizeMiningTicket(data);
      const v = validateMiningTicket(normalized);
      await snap.ref.set({ validationErrors: v.ok ? [] : v.errors }, { merge: true });
    }
    if (data?.type === 'Production') {
      const normalized = normalizeProductionTicket(data);
      const v = validateProductionTicket(normalized);
      await snap.ref.set({ validationErrors: v.ok ? [] : v.errors }, { merge: true });
    }
    if (data?.type === 'Drying') {
      const normalized = normalizeDryingTicket(data);
      const v = validateDryingTicket(normalized);
      await snap.ref.set({ validationErrors: v.ok ? [] : v.errors }, { merge: true });
    }
    await snap.ref.set(defaults, { merge: true });
    console.log('ticketCreated', ticketId, data?.type, defaults?.status);
  });

// Central dispatcher for ticket updates across workflows
export const ticketUpdated = functions.firestore
  .document('tickets/{ticketId}')
  .onUpdate(async (change, context) => {
    const ticketId = context.params.ticketId;
    const before = change.before.data();
    const after = change.after.data();
    if (after?.type === 'Mining') {
      const v = validateMiningTicket(after);
      const transitionOk = isAllowedTransition(before?.status, after?.status);
      const errors = [...(v.ok ? [] : v.errors), ...(transitionOk ? [] : ['invalid status transition'])];
      if (errors.length) {
        await change.after.ref.set({ validationErrors: errors }, { merge: true });
      } else {
        await change.after.ref.set({ validationErrors: [] }, { merge: true });
      }
    }
    if (after?.type === 'Production') {
      const v = validateProductionTicket(after);
      const transitionOk = prodAllowed(before?.status, after?.status);
      const errors = [...(v.ok ? [] : v.errors), ...(transitionOk ? [] : ['invalid status transition'])];
      await change.after.ref.set({ validationErrors: errors }, { merge: true });
    }
    if (after?.type === 'Drying') {
      const v = validateDryingTicket(after);
      const transitionOk = dryAllowed(before?.status, after?.status);
      const errors = [...(v.ok ? [] : v.errors), ...(transitionOk ? [] : ['invalid status transition'])];
      await change.after.ref.set({ validationErrors: errors }, { merge: true });
    }
    await Promise.all([
      handleMiningUpdate(ticketId, before, after),
      handleProductionUpdate(ticketId, before, after),
      handleDryingUpdate(ticketId, before, after),
      handleQCUpdate(ticketId, before, after)
    ]);
  });

// Scheduled summaries: aggregate key metrics
export const scheduledSummaries = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const ticketsSnap = await db.collection('tickets').where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000)).get();
    const totals = ticketsSnap.docs.reduce((acc, d) => {
      const t = d.data();
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    await db.collection('summaries').doc('last24h').set({ totals, ts: now }, { merge: true });
    console.log('scheduledSummaries run', totals);
  });

// Dispatch flow: on create under orders
export const dispatchCreated = functions.firestore
  .document('orders/{orderId}/dispatches/{dispatchId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    await handleDispatchCreate(context.params.orderId, context.params.dispatchId, data);
  });
