"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchCreated = exports.scheduledSummaries = exports.ticketUpdated = exports.ticketCreated = exports.setRoles = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("./auth");
const mining_1 = require("./workflows/mining");
const production_1 = require("./workflows/production");
const drying_1 = require("./workflows/drying");
const qc_1 = require("./workflows/qc");
const dispatch_1 = require("./workflows/dispatch");
const miningTicket_1 = require("./models/miningTicket");
const productionTicket_1 = require("./models/productionTicket");
const dryingTicket_1 = require("./models/dryingTicket");
admin.initializeApp();
// Export callable for role claims
exports.setRoles = auth_1.setUserRoles;
// Normalize ticket creation: ensure defaults and topics
exports.ticketCreated = functions.firestore
    .document('tickets/{ticketId}')
    .onCreate(async (snap, context) => {
    const data = snap.data();
    const ticketId = context.params.ticketId;
    const defaults = {
        status: data?.status || 'Open',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    // Mining-specific validation
    if (data?.type === 'Mining') {
        const normalized = (0, miningTicket_1.normalizeMiningTicket)(data);
        const v = (0, miningTicket_1.validateMiningTicket)(normalized);
        await snap.ref.set({ validationErrors: v.ok ? [] : v.errors }, { merge: true });
    }
    if (data?.type === 'Production') {
        const normalized = (0, productionTicket_1.normalizeProductionTicket)(data);
        const v = (0, productionTicket_1.validateProductionTicket)(normalized);
        await snap.ref.set({ validationErrors: v.ok ? [] : v.errors }, { merge: true });
    }
    if (data?.type === 'Drying') {
        const normalized = (0, dryingTicket_1.normalizeDryingTicket)(data);
        const v = (0, dryingTicket_1.validateDryingTicket)(normalized);
        await snap.ref.set({ validationErrors: v.ok ? [] : v.errors }, { merge: true });
    }
    await snap.ref.set(defaults, { merge: true });
    console.log('ticketCreated', ticketId, data?.type, defaults?.status);
});
// Central dispatcher for ticket updates across workflows
exports.ticketUpdated = functions.firestore
    .document('tickets/{ticketId}')
    .onUpdate(async (change, context) => {
    const ticketId = context.params.ticketId;
    const before = change.before.data();
    const after = change.after.data();
    if (after?.type === 'Mining') {
        const v = (0, miningTicket_1.validateMiningTicket)(after);
        const transitionOk = (0, miningTicket_1.isAllowedTransition)(before?.status, after?.status);
        const errors = [...(v.ok ? [] : v.errors), ...(transitionOk ? [] : ['invalid status transition'])];
        if (errors.length) {
            await change.after.ref.set({ validationErrors: errors }, { merge: true });
        }
        else {
            await change.after.ref.set({ validationErrors: [] }, { merge: true });
        }
    }
    if (after?.type === 'Production') {
        const v = (0, productionTicket_1.validateProductionTicket)(after);
        const transitionOk = (0, productionTicket_1.isAllowedTransition)(before?.status, after?.status);
        const errors = [...(v.ok ? [] : v.errors), ...(transitionOk ? [] : ['invalid status transition'])];
        await change.after.ref.set({ validationErrors: errors }, { merge: true });
    }
    if (after?.type === 'Drying') {
        const v = (0, dryingTicket_1.validateDryingTicket)(after);
        const transitionOk = (0, dryingTicket_1.isAllowedTransition)(before?.status, after?.status);
        const errors = [...(v.ok ? [] : v.errors), ...(transitionOk ? [] : ['invalid status transition'])];
        await change.after.ref.set({ validationErrors: errors }, { merge: true });
    }
    await Promise.all([
        (0, mining_1.handleMiningUpdate)(ticketId, before, after),
        (0, production_1.handleProductionUpdate)(ticketId, before, after),
        (0, drying_1.handleDryingUpdate)(ticketId, before, after),
        (0, qc_1.handleQCUpdate)(ticketId, before, after)
    ]);
});
// Scheduled summaries: aggregate key metrics
exports.scheduledSummaries = functions.pubsub
    .schedule('every 1 hours')
    .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const ticketsSnap = await db.collection('tickets').where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000)).get();
    const totals = ticketsSnap.docs.reduce((acc, d) => {
        const t = d.data();
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
    }, {});
    await db.collection('summaries').doc('last24h').set({ totals, ts: now }, { merge: true });
    console.log('scheduledSummaries run', totals);
});
// Dispatch flow: on create under orders
exports.dispatchCreated = functions.firestore
    .document('orders/{orderId}/dispatches/{dispatchId}')
    .onCreate(async (snap, context) => {
    const data = snap.data();
    await (0, dispatch_1.handleDispatchCreate)(context.params.orderId, context.params.dispatchId, data);
});
