import { validateDryingTicket, isAllowedTransition } from '../src/models/dryingTicket';

describe('DryingTicket validators', () => {
  test('valid drying ticket', () => {
    const t = { type: 'Drying', status: 'Open', bed: 'bed_1', grade: 'grade_A', dryQty: 5 };
    const v = validateDryingTicket(t);
    expect(v.ok).toBe(true);
  });
  test('invalid moisture', () => {
    const t = { type: 'Drying', status: 'Open', bed: 'b', grade: 'g', moistureStart: 200 } as any;
    const v = validateDryingTicket(t);
    expect(v.ok).toBe(false);
  });
  test('status flow', () => {
    expect(isAllowedTransition('Open', 'Completed')).toBe(true);
    expect(isAllowedTransition('Completed', 'Open')).toBe(false);
  });
});
