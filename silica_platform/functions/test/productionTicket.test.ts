import { validateProductionTicket, isAllowedTransition } from '../src/models/productionTicket';

describe('ProductionTicket validators', () => {
  test('valid production ticket', () => {
    const t = { type: 'Production', status: 'Open', plant: 'plant_wet_1', productionQty: 10 };
    const v = validateProductionTicket(t);
    expect(v.ok).toBe(true);
  });
  test('invalid status', () => {
    const t = { type: 'Production', status: 'X', plant: 'p' } as any;
    const v = validateProductionTicket(t);
    expect(v.ok).toBe(false);
  });
  test('status flow', () => {
    expect(isAllowedTransition('Open', 'QC-Pending')).toBe(true);
    expect(isAllowedTransition('Completed', 'In-Progress')).toBe(false);
  });
});
