export type ProductionStatus = 'Open' | 'In-Progress' | 'QC-Pending' | 'Completed' | 'Closed';

export interface ProductionTicket {
  type: 'Production';
  status: ProductionStatus;
  plant: string; // plants.id
  productionQty?: number; // total qty produced
  gradeBreakup?: Record<string, number>; // grade -> qty
  qc?: { status: 'Pass' | 'Fail' | 'Pending'; feedback?: string; grade?: string };
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  createdBy?: string;
  updatedBy?: string;
  notes?: string;
}

const FLOW_NEXT: Record<ProductionStatus, ProductionStatus[]> = {
  Open: ['In-Progress', 'QC-Pending', 'Completed'],
  'In-Progress': ['QC-Pending', 'Completed'],
  'QC-Pending': ['Completed'],
  Completed: ['Closed'],
  Closed: []
};

export function isValidStatus(s: any): s is ProductionStatus {
  return s === 'Open' || s === 'In-Progress' || s === 'QC-Pending' || s === 'Completed' || s === 'Closed';
}

export function isAllowedTransition(from?: ProductionStatus, to?: ProductionStatus): boolean {
  if (!from || !to) return true;
  const allowed = FLOW_NEXT[from] || [];
  return from === to || allowed.includes(to);
}

export function validateProductionTicket(data: any) {
  const errors: string[] = [];
  if (data?.type !== 'Production') errors.push('type must be "Production"');
  if (!isValidStatus(data?.status)) errors.push('invalid production status');
  const plant = data?.plant;
  if (!plant || typeof plant !== 'string') errors.push('plant is required');
  const qty = Number(data?.productionQty);
  if (data?.productionQty != null && (Number.isNaN(qty) || qty < 0)) errors.push('productionQty must be non-negative number');
  const breakup = data?.gradeBreakup;
  if (breakup != null) {
    if (typeof breakup !== 'object') errors.push('gradeBreakup must be object');
    else {
      for (const k of Object.keys(breakup)) {
        const v = Number(breakup[k]);
        if (Number.isNaN(v) || v < 0) errors.push(`gradeBreakup[${k}] must be non-negative number`);
      }
    }
  }
  const qc = data?.qc;
  if (qc != null) {
    if (!['Pass', 'Fail', 'Pending'].includes(qc.status)) errors.push('qc.status must be Pass|Fail|Pending');
    if (qc.grade != null && typeof qc.grade !== 'string') errors.push('qc.grade must be string');
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeProductionTicket<T extends Record<string, any>>(data: T): T & Partial<ProductionTicket> {
  const normalized: any = { ...data };
  if (!normalized.status) normalized.status = 'Open';
  return normalized;
}
