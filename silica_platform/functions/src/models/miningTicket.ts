export type MiningStatus =
  | 'Open'
  | 'In-Progress'
  | 'Downtime'
  | 'Downtime-Fix'
  | 'Downtime-Fix-Completed'
  | 'Ready-To-Resume'
  | 'Completed'
  | 'Closed';

export interface MiningTicket {
  type: 'Mining';
  status: MiningStatus;
  mine: number; // 1–3
  pit: number; // 1–4
  expectedDumpers?: number;
  machineOperator?: string;
  dumperOperators?: string[];
  dumpersLoaded?: number;
  downtimeReasons?: string[];
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  createdBy?: string;
  updatedBy?: string;
  assignedTo?: string;
  notes?: string;
}

const FLOW_NEXT: Record<MiningStatus, MiningStatus[]> = {
  Open: ['In-Progress', 'Downtime'],
  'In-Progress': ['Downtime', 'Completed'],
  Downtime: ['Downtime-Fix', 'Ready-To-Resume'],
  'Downtime-Fix': ['Downtime-Fix-Completed'],
  'Downtime-Fix-Completed': ['Ready-To-Resume'],
  'Ready-To-Resume': ['In-Progress', 'Completed'],
  Completed: ['Closed'],
  Closed: []
};

export function isValidStatus(s: any): s is MiningStatus {
  return (
    s === 'Open' ||
    s === 'In-Progress' ||
    s === 'Downtime' ||
    s === 'Downtime-Fix' ||
    s === 'Downtime-Fix-Completed' ||
    s === 'Ready-To-Resume' ||
    s === 'Completed' ||
    s === 'Closed'
  );
}

export function isAllowedTransition(from?: MiningStatus, to?: MiningStatus): boolean {
  if (!from || !to) return true; // creation or missing status
  const allowed = FLOW_NEXT[from] || [];
  return from === to || allowed.includes(to);
}

export function validateMiningTicket(data: any) {
  const errors: string[] = [];
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

export function normalizeMiningTicket<T extends Record<string, any>>(data: T): T & Partial<MiningTicket> {
  const normalized: any = { ...data };
  if (!normalized.status) normalized.status = 'Open';
  return normalized;
}
