"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidStatus = isValidStatus;
exports.isAllowedTransition = isAllowedTransition;
exports.validateProductionTicket = validateProductionTicket;
exports.normalizeProductionTicket = normalizeProductionTicket;
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
function validateProductionTicket(data) {
    const errors = [];
    if (data?.type !== 'Production')
        errors.push('type must be "Production"');
    if (!isValidStatus(data?.status))
        errors.push('invalid production status');
    const plant = data?.plant;
    if (!plant || typeof plant !== 'string')
        errors.push('plant is required');
    const qty = Number(data?.productionQty);
    if (data?.productionQty != null && (Number.isNaN(qty) || qty < 0))
        errors.push('productionQty must be non-negative number');
    const breakup = data?.gradeBreakup;
    if (breakup != null) {
        if (typeof breakup !== 'object')
            errors.push('gradeBreakup must be object');
        else {
            for (const k of Object.keys(breakup)) {
                const v = Number(breakup[k]);
                if (Number.isNaN(v) || v < 0)
                    errors.push(`gradeBreakup[${k}] must be non-negative number`);
            }
        }
    }
    const qc = data?.qc;
    if (qc != null) {
        if (!['Pass', 'Fail', 'Pending'].includes(qc.status))
            errors.push('qc.status must be Pass|Fail|Pending');
        if (qc.grade != null && typeof qc.grade !== 'string')
            errors.push('qc.grade must be string');
    }
    return { ok: errors.length === 0, errors };
}
function normalizeProductionTicket(data) {
    const normalized = { ...data };
    if (!normalized.status)
        normalized.status = 'Open';
    return normalized;
}
