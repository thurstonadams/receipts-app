jest.mock('./supabase', () => ({ supabase: {} }));
import { tripFor, validateTrip } from './trips';
import { Trip } from '../types';

const t = (id: string, s: string, e: string, entityId: Trip['entityId'] = 'kai'): Trip =>
  ({ id, name: id, startDate: s, endDate: e, entityId, notes: '', createdAt: 0, updatedAt: 0 });

describe('tripFor (same rule as the email import)', () => {
  const trips = [t('India', '2026-08-15', '2026-08-26'), t('Frankfurt', '2026-09-07', '2026-09-10')];
  test('inclusive bounds', () => {
    expect(tripFor('2026-08-15', trips)?.name).toBe('India');
    expect(tripFor('2026-08-26', trips)?.name).toBe('India');
    expect(tripFor('2026-08-27', trips)).toBeNull();
  });
  test('overlap → shortest trip wins', () => {
    expect(tripFor('2026-09-08', [...trips, t('Q3', '2026-07-01', '2026-09-30', 'xfix')])?.name).toBe('Frankfurt');
  });
});

describe('validateTrip', () => {
  test('rejects bad input with a readable message', () => {
    expect(validateTrip({ name: ' ', startDate: '2026-09-07', endDate: '2026-09-10' })).toMatch(/name/);
    expect(validateTrip({ name: 'X', startDate: '7 Sep', endDate: '2026-09-10' })).toMatch(/Start/);
    expect(validateTrip({ name: 'X', startDate: '2026-09-10', endDate: '2026-09-07' })).toMatch(/before/);
    expect(validateTrip({ name: 'X', startDate: '2026-09-07', endDate: '2026-09-10' })).toBeNull();
  });
});

describe('sanitizeTrips (offline cache)', () => {
  test('drops null, half-written and invalid entries', () => {
    const good = t('Frankfurt', '2026-09-07', '2026-09-10');
    const { sanitizeTrips } = require('./trips');
    expect(sanitizeTrips([null, good, { id: 'x', name: 'x' }, { ...good, id: 'bad', endDate: '2026-01-01' }, { ...good, id: 'b2', entityId: 'acme' }]))
      .toEqual([good]);
    expect(sanitizeTrips('nope')).toEqual([]);
  });
});
