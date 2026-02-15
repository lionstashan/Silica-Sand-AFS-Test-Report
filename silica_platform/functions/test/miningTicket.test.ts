import { validateMiningTicket, isAllowedTransition } from '../src/models/miningTicket';

describe('MiningTicket validators', () => {
  test('valid mining ticket', () => {
    const t = { type: 'Mining', status: 'Open', mine: 1, pit: 2 };
    const v = validateMiningTicket(t);
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
  });
  test('invalid mine/pit', () => {
    const t = { type: 'Mining', status: 'Open', mine: 5, pit: 0 };
    const v = validateMiningTicket(t);
    expect(v.ok).toBe(false);
    expect(v.errors).toEqual(expect.arrayContaining(['mine must be integer in [1..3]', 'pit must be integer in [1..4]']));
  });
  test('status flow', () => {
    expect(isAllowedTransition('Open', 'In-Progress')).toBe(true);
    expect(isAllowedTransition('Open', 'Completed')).toBe(false);
  });
});
