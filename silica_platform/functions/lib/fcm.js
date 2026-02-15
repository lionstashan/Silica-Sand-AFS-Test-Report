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
exports.notifyRoles = notifyRoles;
exports.notifyUsers = notifyUsers;
const admin = __importStar(require("firebase-admin"));
async function notifyRoles(roles, title, body) {
    const messages = roles.map((role) => ({
        topic: role,
        notification: { title, body }
    }));
    const results = await Promise.all(messages.map((msg) => admin.messaging().send(msg)));
    return results;
}
async function notifyUsers(uids, title, body) {
    const tokensSnap = await admin.firestore()
        .collection('deviceTokens')
        .where('uid', 'in', uids)
        .get();
    const tokens = tokensSnap.docs.map((d) => d.get('token')).filter(Boolean);
    if (tokens.length === 0)
        return [];
    const message = {
        notification: { title, body },
        tokens
    };
    const res = await admin.messaging().sendEachForMulticast(message);
    return res.responses;
}
