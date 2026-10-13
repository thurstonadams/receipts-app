import { scoreMatch, searchReceipts, sortNewestFirst } from './search';
import { Receipt } from '../types';

function r(id: string, partial: Partial<Receipt> = {}): Receipt {
  return {
    id, entityId: 'xfix', vendor: `Vendor ${id}`, date: '2026-04-24', total: 10,
    currency: 'USD', payment: 'Visa', category: 'Other', notes: '', status: 'ready',
    thumbTone: 0, createdAt: 1, updatedAt: 1, ...partial,
  };
}

describe('search by amount', () => {
  const blank = r('b', { vendor: '', total: 58.3, currency: 'EUR' });
  test('exact amount with a dot', () => expect(scoreMatch(blank, '58.30')).toBeGreaterThan(0));
  test('exact amount with a comma (French keyboard)', () => expect(scoreMatch(blank, '58,30')).toBeGreaterThan(0));
  test('amount with a currency symbol', () => expect(scoreMatch(blank, '€58.30')).toBeGreaterThan(0));
  test('one decimal place', () => expect(scoreMatch(blank, '58.3')).toBeGreaterThan(0));
  test('whole euros', () => expect(scoreMatch(blank, '58')).toBeGreaterThan(0));
  test('a different amount does not match', () => expect(scoreMatch(blank, '59.30')).toBe(0));
  test('58 does not match 158.00', () => expect(scoreMatch(r('x', { vendor: '', total: 158 }), '58')).toBe(0));
  test('exact amount ranks above whole-number match', () => {
    const exact = r('e', { vendor: '', total: 58.3 });
    const whole = r('w', { vendor: '', total: 58.99 });
    expect(scoreMatch(exact, '58.30')).toBeGreaterThan(scoreMatch(whole, '58'));
    expect(scoreMatch(whole, '58.30')).toBe(0);
  });
});

describe('search by date', () => {
  const jul29 = r('j', { vendor: '', date: '2026-07-29' });
  test('ISO date', () => expect(scoreMatch(jul29, '2026-07-29')).toBeGreaterThan(0));
  test('ISO month', () => expect(scoreMatch(jul29, '2026-07')).toBeGreaterThan(0));
  test('"Jul 29" as shown in the list', () => expect(scoreMatch(jul29, 'Jul 29')).toBeGreaterThan(0));
  test('"july 29"', () => expect(scoreMatch(jul29, 'july 29')).toBeGreaterThan(0));
  test('"29 jul" (French order)', () => expect(scoreMatch(jul29, '29 jul')).toBeGreaterThan(0));
  test('"juillet" (French month)', () => expect(scoreMatch(jul29, 'juillet')).toBeGreaterThan(0));
  test('month alone', () => expect(scoreMatch(jul29, 'jul')).toBeGreaterThan(0));
  test('wrong day does not match', () => expect(scoreMatch(jul29, 'jul 28')).toBe(0));
  test('wrong month does not match', () => expect(scoreMatch(jul29, 'aug 29')).toBe(0));
});

describe('search keeps text matching', () => {
  test('vendor prefix still wins', () => {
    expect(scoreMatch(r('a', { vendor: 'Totale Énergies' }), 'tot')).toBe(100);
  });
  test('blank vendor is findable by "no vendor"', () => {
    expect(scoreMatch(r('a', { vendor: '' }), 'no vendor')).toBeGreaterThan(0);
  });
});

describe('searchReceipts / sortNewestFirst', () => {
  const list = [
    r('old', { date: '2026-06-01', updatedAt: 5 }),
    r('new', { date: '2026-10-12', updatedAt: 1 }),
    r('mid', { date: '2026-07-29', updatedAt: 3, total: 58.3, vendor: '' }),
  ];
  test('empty query returns everything, newest receipt date first', () => {
    expect(searchReceipts(list, '').map(x => x.id)).toEqual(['new', 'mid', 'old']);
  });
  test('whitespace query is empty', () => {
    expect(searchReceipts(list, '   ')).toHaveLength(3);
  });
  test('query filters', () => {
    expect(searchReceipts(list, '58,30').map(x => x.id)).toEqual(['mid']);
  });
  test('sortNewestFirst does not mutate its input', () => {
    const copy = [...list];
    sortNewestFirst(list);
    expect(list).toEqual(copy);
  });
});
