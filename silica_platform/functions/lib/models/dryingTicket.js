"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidStatus = isValidStatus;
exports.isAllowedTransition = isAllowedTransition;
exports.validateDryingTicket = validateDryingTicket;
exports.normalizeDryingTicket = normalizeDryingTicket;
const FLOW_NEXT = {
    Open: ['In-Progress', 'QC-Pending', 'Completed'],
    'In-Progress': ['QC-Pending', 'Completed'],
    'QC-Pending': ['Completed'],
    Completed: ['Closed'],
    Closed: []
};
function isValidStatus(s) {
    return s === 'Open' || s === 'In-Progress' || s === 'QC-Pending' || s === 'Completed' || s === 'Closed';
}
function isAllowedTransition(from, to) {
    if (!from || !to)
        return true;
    const allowed = FLOW_NEXT[from] || [];
    return from === to || allowed.includes(to);
}
function validateDryingTicket(data) {
    const errors = [];
    if (data?.type !== 'Drying')
        errors.push('type must be "Drying"');
    if (!isValidStatus(data?.status))
        errors.push('invalid drying status');
    const bed = data?.bed;
    if (!bed || typeof bed !== 'string')
        errors.push('bed is required');
    const grade = data?.grade;
    if (!grade || typeof grade !== 'string')
        errors.push('grade is required');
    const ms = Number(data?.moistureStart);
    if (data?.moistureStart != null && (Number.isNaN(ms) || ms < 0 || ms > 100))
        errors.push('moistureStart must be 0..100');
    const me = Number(data?.moistureEnd);
    if (data?.moistureEnd != null && (Number.isNaN(me) || me < 0 || me > 100))
        errors.push('moistureEnd must be 0..100');
    const dq = Number(data?.dryQty);
    if (data?.dryQty != null && (Number.isNaN(dq) || dq < 0))
        errors.push('dryQty must be non-negative number');
    const qc = data?.qc;
    if (qc != null) {
        if (!['Pass', 'Fail', 'Pending'].includes(qc.status))
            errors.push('qc.status must be Pass|Fail|Pending');
        if (qc.grade != null && typeof qc.grade !== 'string')
            errors.push('qc.grade must be string');
    }
    return { ok: errors.length === 0, errors };
}
function normalizeDryingTicket(data) {
    const normalized = { ...data };
    if (!normalized.status)
        normalized.status = 'Open';
    return normalized;
}
