import { pickBook, autoBillToKai, findDuplicate, vendorsSimilar, tripFor, uberProfileTag, Trip } from './filing';

const trips: Trip[] = [
  { id: 't1', name: 'India', start_date: '2026-08-15', end_date: '2026-08-26', entity_id: 'kai' },
  { id: 't2', name: 'Frankfurt', start_date: '2026-09-07', end_date: '2026-09-10', entity_id: 'kai' },
];
const base = { subject: '', vendor: 'Conrad Pune', category: 'Travel', addressBook: 'xfix' as const };

describe('pickBook — the Conrad/Marriott/Uber Eats cases from the backlog', () => {
  test('a trip wins over the forwarding address', () => {
    expect(pickBook({ ...base, date: '2026-08-25' }, trips)).toEqual({ book: 'kai', why: 'Trip: India' });
  });
  test('trip bounds are inclusive', () => {
    expect(pickBook({ ...base, date: '2026-08-15' }, trips).book).toBe('kai');
    expect(pickBook({ ...base, date: '2026-08-26' }, trips).book).toBe('kai');
    expect(pickBook({ ...base, date: '2026-08-27' }, trips).book).toBe('xfix');
  });
  test('Uber [Personal] → Personal outside a trip', () => {
    expect(pickBook({ ...base, vendor: 'Uber Eats', category: 'Meals & Entertainment', date: '2026-08-05', subject: 'Fwd: [Personal] Your Tuesday evening order with Uber Eats' }, trips))
      .toEqual({ book: 'personal', why: 'Uber profile: Personal' });
  });
  test('…but the trip wins: the Aug 26 airport ride billed on KAI-2026-08 is tagged [Personal]', () => {
    expect(pickBook({ ...base, vendor: 'Uber', date: '2026-08-26', subject: 'FW: [Personal] Your Wednesday morning trip with Uber' }, trips))
      .toEqual({ book: 'kai', why: 'Trip: India' });
  });
  test('prepaid hotel: HotelTonight charged Jul 24 for Sep 7 Moxy Frankfurt → Frankfurt trip', () => {
    expect(pickBook({ ...base, vendor: 'HotelTonight', date: '2026-07-24', serviceDate: '2026-09-07' }, trips))
      .toEqual({ book: 'kai', why: 'Trip: Frankfurt' });
    expect(pickBook({ ...base, vendor: 'HotelTonight', date: '2026-07-24', serviceDate: null }, trips).book).toBe('xfix');
  });
  test('software → xFix, even during a KAI trip and even from the KAI address', () => {
    expect(pickBook({ ...base, vendor: 'Snowflake', category: 'Other', date: '2026-09-08', addressBook: 'kai' }, trips).book).toBe('xfix');
    expect(pickBook({ ...base, vendor: 'Some SaaS', category: 'Software & Subscriptions', date: '2026-08-20' }, trips).book).toBe('xfix');
  });
  test('no trip → AI hint, then the address', () => {
    expect(pickBook({ ...base, vendor: 'Uber Eats', category: 'Meals & Entertainment', date: '2026-07-22', aiHint: 'personal' }, trips).book).toBe('personal');
    expect(pickBook({ ...base, date: '2026-07-01' }, trips)).toEqual({ book: 'xfix', why: 'Forwarding address' });
  });
});

describe('tripFor / uberProfileTag', () => {
  test('overlapping trips → the shortest wins', () => {
    const t = [...trips, { id: 't3', name: 'Q3 travel', start_date: '2026-07-01', end_date: '2026-09-30', entity_id: 'xfix' as const }];
    expect(tripFor('2026-09-08', t)?.name).toBe('Frankfurt');
  });
  test('Uber tags', () => {
    expect(uberProfileTag('FW: [Personal] Your Thursday evening order')).toBe('personal');
    expect(uberProfileTag('[Business] trip')).toBe('business');
    expect(uberProfileTag('Your receipt from Fly.io')).toBeNull();
  });
});

describe('autoBillToKai — ruling 2026-09-24', () => {
  test('KAI travel and meals are billable', () => {
    expect(autoBillToKai('kai', 'Travel', 'Conrad Pune')).toBe(true);
    expect(autoBillToKai('kai', 'Meals & Entertainment', 'Adolf Wagner')).toBe(true);
  });
  test('never software, never other books', () => {
    expect(autoBillToKai('kai', 'Software & Subscriptions', 'OpenAI')).toBe(false);
    expect(autoBillToKai('kai', 'Travel', 'Snowflake')).toBe(false);
    expect(autoBillToKai('xfix', 'Travel', 'Uber')).toBe(false);
    expect(autoBillToKai('personal', 'Meals & Entertainment', 'Uber Eats')).toBe(false);
  });
});

describe('findDuplicate', () => {
  const existing = [
    { id: 'cap-conrad', vendor: 'Hilton Conrad Pune', date: '2026-08-25', total: 1861.97, currency: 'USD' },
    { id: 'uber-a', vendor: 'Uber', date: '2026-08-26', total: 47.18, currency: 'EUR' },
    { id: 'old-dup', vendor: 'Uber', date: '2026-08-26', total: 47.18, currency: 'EUR', duplicate_of: 'uber-a' },
  ];
  test('Uber charge summary + trip receipt (same amount, same currency) → merge into the first', () => {
    expect(findDuplicate({ id: 'n', vendor: 'Uber', date: '2026-08-26', total: 47.18, currency: 'EUR' }, existing))
      .toEqual({ kind: 'same', of: 'uber-a' });
  });
  test('Conrad folio in INR vs the USD capture → flagged, not merged', () => {
    expect(findDuplicate({ id: 'n', vendor: 'Conrad Pune', date: '2026-08-25', total: 177736.62, currency: 'INR' }, existing))
      .toEqual({ kind: 'possible', of: 'cap-conrad' });
  });
  test('two different Uber rides the same day are NOT duplicates', () => {
    expect(findDuplicate({ id: 'n', vendor: 'Uber', date: '2026-08-26', total: 12.4, currency: 'EUR' }, existing)).toBeNull();
  });
  test('more than 3 days apart → not a duplicate', () => {
    expect(findDuplicate({ id: 'n', vendor: 'Uber', date: '2026-08-31', total: 47.18, currency: 'EUR' }, existing)).toBeNull();
  });
  test('$0 never merges', () => {
    expect(findDuplicate({ id: 'n', vendor: 'Uber', date: '2026-08-26', total: 0, currency: 'EUR' },
      [{ id: 'z', vendor: 'Uber', date: '2026-08-26', total: 0, currency: 'EUR' }])).toBeNull();
  });
  test('vendor similarity ignores filler words', () => {
    expect(vendorsSimilar('JW Marriott New Delhi Aerocity', 'Marriott')).toBe(true);
    expect(vendorsSimilar('Hotel Moxy', 'Hotel Ibis')).toBe(false);
    expect(vendorsSimilar('Supabase Pte. Ltd.', 'Supabase')).toBe(true);
  });
});
