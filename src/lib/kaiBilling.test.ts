import { kaiBillability, subtotalsByCurrency, unbilledCarryOvers, defaultBillToKai } from './kaiBilling';
import { Receipt } from '../types';

const r = (over: Partial<Receipt>): Receipt => ({
  id: over.id ?? 'r1',
  entityId: 'xfix',
  vendor: 'Uber',
  date: '2026-09-10',
  total: 10,
  currency: 'USD',
  payment: '',
  category: 'Travel',
  notes: '',
  status: 'ready',
  thumbTone: 0,
  billableTo: 'kai',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('kaiBillability — ruling 2026-09-24: software subscriptions are not billable to KAI', () => {
  test('travel and meals are billable', () => {
    expect(kaiBillability(r({ category: 'Travel' })).ok).toBe(true);
    expect(kaiBillability(r({ category: 'Meals & Entertainment', vendor: 'Adolf Wagner' })).ok).toBe(true);
  });

  test('the Software & Subscriptions category is never billable', () => {
    const res = kaiBillability(r({ category: 'Software & Subscriptions', vendor: 'Some Tool' }));
    expect(res.ok).toBe(false);
  });

  test('known software vendors are blocked even when miscategorised', () => {
    for (const vendor of ['Anthropic', 'Anthropic, PBC', 'OpenAI', 'Amazon AWS', 'GitHub', 'Supabase', 'Hostinger', 'Vercel']) {
      expect(kaiBillability(r({ category: 'Other', vendor })).ok).toBe(false);
    }
  });

  test('a vendor that merely contains a short token is not caught (Uber, Marriott stay billable)', () => {
    expect(kaiBillability(r({ vendor: 'Marriott', category: 'Other' })).ok).toBe(true);
    expect(kaiBillability(r({ vendor: 'Uber', category: 'Travel' })).ok).toBe(true);
  });
});

describe('subtotalsByCurrency', () => {
  test('never adds EUR into USD', () => {
    const totals = subtotalsByCurrency([
      r({ total: 1861.97, currency: 'USD' }),
      r({ total: 263.6, currency: 'EUR' }),
      r({ total: 155.2, currency: 'EUR' }),
    ]);
    expect(totals).toEqual({ USD: 186197, EUR: 41880 });
  });

  test('blank currency is treated as USD', () => {
    expect(subtotalsByCurrency([r({ total: 1, currency: '' })])).toEqual({ USD: 100 });
  });
});

describe('unbilledCarryOvers', () => {
  test('returns KAI receipts from earlier months that no billed report covers', () => {
    const receipts = [
      r({ id: 'june-mcd', date: '2026-06-16', currency: 'EUR', total: 13.65 }),
      r({ id: 'aug-billed', date: '2026-08-25' }),
      r({ id: 'sep-current', date: '2026-09-10' }),
      r({ id: 'jul-not-kai', date: '2026-07-01', billableTo: null }),
      r({ id: 'jul-software', date: '2026-07-02', category: 'Software & Subscriptions' }),
    ];
    const out = unbilledCarryOvers(receipts, new Set(['aug-billed']), '2026-09-01');
    expect(out.map(x => x.id)).toEqual(['june-mcd']);
  });
});

describe('review findings 2026-09-24', () => {
  test('trade shows named "Expo" stay billable; AI chat vendors are blocked', () => {
    expect(kaiBillability(r({ vendor: 'AAPEX Expo', category: 'Other' })).ok).toBe(true);
    expect(kaiBillability(r({ vendor: 'ChatGPT', category: 'Other' })).ok).toBe(false);
    expect(kaiBillability(r({ vendor: 'Claude.ai', category: 'Other' })).ok).toBe(false);
    expect(kaiBillability(r({ vendor: 'Chez Claude', category: 'Meals & Entertainment' })).ok).toBe(true);
  });

  test('defaultBillToKai: KAI-book, never-touched receipts start on; explicit "no" sticks', () => {
    expect(defaultBillToKai(r({ entityId: 'kai', billableTo: undefined }))).toBe(true);
    // email ingest: null + untouched since arrival
    expect(defaultBillToKai(r({ entityId: 'kai', billableTo: null, source: 'email', createdAt: 1, updatedAt: 1 }))).toBe(true);
    // user already saved it as not billable (updatedAt moved) — stays off even if still needs-review
    expect(defaultBillToKai(r({ entityId: 'kai', billableTo: null, source: 'email', status: 'needs-review', createdAt: 1, updatedAt: 9 }))).toBe(false);
    expect(defaultBillToKai(r({ entityId: 'xfix', billableTo: undefined }))).toBe(false);
    expect(defaultBillToKai(r({ entityId: 'xfix', billableTo: 'kai' }))).toBe(true);
    // software in the KAI book never defaults on
    expect(defaultBillToKai(r({ entityId: 'kai', billableTo: undefined, category: 'Software & Subscriptions' }))).toBe(false);
  });
});

describe('possible duplicates are never pre-ticked for KAI', () => {
  const { defaultBillToKai } = require('./kaiBilling');
  const row = { entityId: 'kai', billableTo: null, source: 'email', createdAt: 1, updatedAt: 1, category: 'Travel', vendor: 'Conrad Pune' };
  test('untouched KAI email row → on', () => expect(defaultBillToKai(row)).toBe(true));
  test('same row flagged "Possible duplicate …" → off', () =>
    expect(defaultBillToKai({ ...row, reviewReason: 'Possible duplicate of Hilton Conrad Pune 2026-08-25 (USD 1861.97)' })).toBe(false));
  test('an explicit Bill to KAI still wins', () =>
    expect(defaultBillToKai({ ...row, billableTo: 'kai', reviewReason: 'Possible duplicate of X' })).toBe(true));
});
