import { fmtMoney, fmtDate, fmtDateFull, todayISO, uid } from './format';

describe('fmtMoney', () => {
  test('defaults to USD with $ prefix', () => {
    expect(fmtMoney(12.5)).toBe('$12.50');
  });
  test('uses correct symbol for EUR and GBP', () => {
    expect(fmtMoney(5, 'EUR')).toBe('€5.00');
    expect(fmtMoney(5, 'GBP')).toBe('£5.00');
  });
  test('falls back to no symbol for unknown currencies', () => {
    expect(fmtMoney(5, 'ZZZ')).toBe('5.00');
  });
  test('always renders two decimals', () => {
    expect(fmtMoney(0)).toBe('$0.00');
    expect(fmtMoney(9.999)).toBe('$10.00');
  });
});

describe('fmtDate / fmtDateFull', () => {
  test('fmtDate returns short US form', () => {
    // Using en-US locale in node; still deterministic for month abbreviations.
    const out = fmtDate('2026-04-24');
    expect(out).toMatch(/Apr/);
    expect(out).toMatch(/24/);
  });
  test('fmtDateFull includes weekday + year', () => {
    const out = fmtDateFull('2026-04-24');
    expect(out).toMatch(/2026/);
  });
});

describe('todayISO', () => {
  test('matches YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('components align with the current Date', () => {
    const d = new Date();
    const [y, m, day] = todayISO().split('-').map(Number);
    expect(y).toBe(d.getFullYear());
    expect(m).toBe(d.getMonth() + 1);
    expect(day).toBe(d.getDate());
  });
});

describe('uid', () => {
  test('uses the given prefix', () => {
    expect(uid('x')).toMatch(/^x_[a-z0-9]+_[a-z0-9]{5}$/);
  });
  test('defaults to r_ prefix', () => {
    expect(uid()).toMatch(/^r_/);
  });
  test('collision is astronomically unlikely across small batches', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(uid());
    expect(seen.size).toBe(5000);
  });
});
