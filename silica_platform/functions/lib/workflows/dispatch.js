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
exports.handleDispatchCreate = handleDispatchCreate;
const admin = __importStar(require("firebase-admin"));
const fcm_1 = require("../fcm");
async function handleDispatchCreate(orderId, dispatchId, data) {
    const db = admin.firestore();
    const grade = data?.grade;
    const qty = Number(data?.loadQty || 0);
    const category = data?.category || 'ReadyDry';
    if (!grade || qty <= 0)
        return;
    const stockId = `${category.toLowerCase()}_${grade}`;
    const ref = db.collection('stocks').doc(stockId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? snap.data() : { qty: 0 };
        const newQty = Number(current?.qty || 0) - qty;
        tx.set(ref, {
            category,
            grade,
            qty: newQty,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    await (0, fcm_1.notifyRoles)(['Dispatch', 'Accounts', 'Manager'], 'Dispatch Created', `Order ${orderId} dispatch ${dispatchId} for ${qty} of ${grade}`);
}
