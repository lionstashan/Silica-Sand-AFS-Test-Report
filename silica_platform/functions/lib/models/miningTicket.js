"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidStatus = isValidStatus;
exports.isAllowedTransition = isAllowedTransition;
exports.validateMiningTicket = validateMiningTicket;
exports.normalizeMiningTicket = normalizeMiningTicket;
const FLOW_NEXT = {
    Open: ['In-Progress', 'Downtime'],
    'In-Progress': ['Downtime', 'Completed'],
    Downtime: ['Downtime-Fix', 'Ready-To-Resume'],
    'Downtime-Fix': ['Downtime-Fix-Completed'],
    'Downtime-Fix-Completed': ['Ready-To-Resume'],
    'Ready-To-Resume': ['In-Progress', 'Completed'],
    Completed: ['Closed'],
    Closed: []
};
function isValidStatus(s) {
    return (s === 'Open' ||
        s === 'In-Progress' ||
        s === 'Downtime' ||
        s === 'Downtime-Fix' ||
        s === 'Downtime-Fix-Completed' ||
        s === 'Ready-To-Resume' ||
        s === 'Completed' ||
        s === 'Closed');
}
function isAllowedTransition(from, to) {
    if (!from || !to)
        return true; // creation or missing status
    const allowed = FLOW_NEXT[from] || [];
    return from === to || allowed.includes(to);
}
function validateMiningTicket(data) {
    const errors = [];
    if (data?.type !== 'Mining') {
        errors.push('type must be "Mining"');
    }
    const mine = Number(data?.mine);
    if (!Number.isInteger(mine) || mine < 1 || mine > 3) {
        errors.push('mine must be integer in [1..3]');
    }
    const pit = Number(data?.pit);
    if (!Number.isInteger(pit) || pit < 1 || pit > 4) {
        errors.push('pit must be integer in [1..4]');
    }
    const status = data?.status;
    if (!isValidStatus(status)) {
        errors.push('status invalid for Mining');
    }
    const expectedDumpers = data?.expectedDumpers;
    if (expectedDumpers != null && (!Number.isInteger(Number(expectedDumpers)) || Number(expectedDumpers) < 0)) {
        errors.push('expectedDumpers must be non-negative integer');
    }
    const dumpersLoaded = data?.dumpersLoaded;
    if (dumpersLoaded != null && (!Number.isInteger(Number(dumpersLoaded)) || Number(dumpersLoaded) < 0)) {
        errors.push('dumpersLoaded must be non-negative integer');
    }
    const machineOperator = data?.machineOperator;
    if (machineOperator != null && String(machineOperator).trim().length === 0) {
        errors.push('machineOperator cannot be empty');
    }
    const dumperOperators = data?.dumperOperators;
    if (dumperOperators != null && !Array.isArray(dumperOperators)) {
        errors.push('dumperOperators must be array of strings');
    }
    const downtimeReasons = data?.downtimeReasons;
    if (downtimeReasons != null && !Array.isArray(downtimeReasons)) {
        errors.push('downtimeReasons must be array of strings');
    }
    return { ok: errors.length === 0, errors };
}
function normalizeMiningTicket(data) {
    const normalized = { ...data };
    if (!normalized.status)
        normalized.status = 'Open';
    return normalized;
}
