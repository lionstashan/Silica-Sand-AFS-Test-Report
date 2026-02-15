export type DryingStatus = 'Open' | 'In-Progress' | 'QC-Pending' | 'Completed' | 'Closed';

export interface DryingTicket {
  type: 'Drying';
  status: DryingStatus;
  bed: string; // beds.id
  grade: string; // grades.id
  moistureStart?: number; // %
  moistureEnd?: number; // %
  dryStart?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  dryEnd?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  qc?: { status: 'Pass' | 'Fail' | 'Pending'; feedback?: string; grade?: string };
  dryQty?: number;
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  createdBy?: string;
  updatedBy?: string;
  notes?: string;
}

const FLOW_NEXT: Record<DryingStatus, DryingStatus[]> = {
  Open: ['In-Progress', 'QC-Pending', 'Completed'],
  'In-Progress': ['QC-Pending', 'Completed'],
  'QC-Pending': ['Completed'],
  Completed: ['Closed'],
  Closed: []
};

export function isValidStatus(s: any): s is DryingStatus {
  return s === 'Open' || s === 'In-Progress' || s === 'QC-Pending' || s === 'Completed' || s === 'Closed';
}

export function isAllowedTransition(from?: DryingStatus, to?: DryingStatus): boolean {
  if (!from || !to) return true;
  const allowed = FLOW_NEXT[from] || [];
  return from === to || allowed.includes(to);
}

export function validateDryingTicket(data: any) {
  const errors: string[] = [];
  if (data?.type !== 'Drying') errors.push('type must be "Drying"');
  if (!isValidStatus(data?.status)) errors.push('invalid drying status');
  const bed = data?.bed;
  if (!bed || typeof bed !== 'string') errors.push('bed is required');
  const grade = data?.grade;
  if (!grade || typeof grade !== 'string') errors.push('grade is required');
  const ms = Number(data?.moistureStart);
  if (data?.moistureStart != null && (Number.isNaN(ms) || ms < 0 || ms > 100)) errors.push('moistureStart must be 0..100');
  const me = Number(data?.moistureEnd);
  if (data?.moistureEnd != null && (Number.isNaN(me) || me < 0 || me > 100)) errors.push('moistureEnd must be 0..100');
  const dq = Number(data?.dryQty);
  if (data?.dryQty != null && (Number.isNaN(dq) || dq < 0)) errors.push('dryQty must be non-negative number');
  const qc = data?.qc;
  if (qc != null) {
    if (!['Pass', 'Fail', 'Pending'].includes(qc.status)) errors.push('qc.status must be Pass|Fail|Pending');
    if (qc.grade != null && typeof qc.grade !== 'string') errors.push('qc.grade must be string');
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeDryingTicket<T extends Record<string, any>>(data: T): T & Partial<DryingTicket> {
  const normalized: any = { ...data };
  if (!normalized.status) normalized.status = 'Open';
  return normalized;
}
