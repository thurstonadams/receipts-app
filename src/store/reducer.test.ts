import { reducer, initialState } from './reducer';
import { Receipt } from '../types';

function r(id: string, partial: Partial<Receipt> = {}): Receipt {
  const now = Date.now();
  return {
    id,
    entityId: 'xfix',
    vendor: `Vendor ${id}`,
    date: '2026-04-24',
    total: 10,
    currency: 'USD',
    payment: 'Visa',
    category: 'Other',
    notes: '',
    status: 'ready',
    thumbTone: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('reducer', () => {
  test('HYDRATE replaces receipts and sets ready=true', () => {
    const next = reducer(initialState, {
      type: 'HYDRATE',
      receipts: [r('a'), r('b')],
      entityId: 'kai',
    });
    expect(next.ready).toBe(true);
    expect(next.entityId).toBe('kai');
    expect(next.receipts.map(x => x.id)).toEqual(['a', 'b']);
  });

  test('SET_ENTITY only changes entityId', () => {
    const next = reducer(initialState, { type: 'SET_ENTITY', id: 'personal' });
    expect(next.entityId).toBe('personal');
    expect(next.receipts).toEqual(initialState.receipts);
  });

  test('NAVIGATE updates screen and preserves currentReceiptId when not given', () => {
    const after1 = reducer(initialState, { type: 'NAVIGATE', screen: 'review', receiptId: 'r_1' });
    expect(after1.screen).toBe('review');
    expect(after1.currentReceiptId).toBe('r_1');
    // Omitting receiptId leaves currentReceiptId untouched.
    const after2 = reducer(after1, { type: 'NAVIGATE', screen: 'home' });
    expect(after2.screen).toBe('home');
    expect(after2.currentReceiptId).toBe('r_1');
    // Passing null clears it.
    const after3 = reducer(after2, { type: 'NAVIGATE', screen: 'home', receiptId: null });
    expect(after3.currentReceiptId).toBe(null);
  });

  test('ADD_RECEIPT prepends to receipts list (most-recent-first)', () => {
    const first = r('a');
    const second = r('b');
    const one = reducer(initialState, { type: 'ADD_RECEIPT', receipt: first });
    const two = reducer(one, { type: 'ADD_RECEIPT', receipt: second });
    expect(two.receipts.map(x => x.id)).toEqual(['b', 'a']);
  });

  test('UPDATE_RECEIPT replaces the matching id only', () => {
    const seeded = reducer(initialState, {
      type: 'HYDRATE',
      receipts: [r('a', { vendor: 'old' }), r('b')],
      entityId: 'xfix',
    });
    const updated = reducer(seeded, { type: 'UPDATE_RECEIPT', receipt: r('a', { vendor: 'new' }) });
    expect(updated.receipts.find(x => x.id === 'a')?.vendor).toBe('new');
    expect(updated.receipts.find(x => x.id === 'b')?.vendor).toBe('Vendor b');
  });

  test('DELETE_RECEIPT removes only the matching id', () => {
    const seeded = reducer(initialState, {
      type: 'HYDRATE',
      receipts: [r('a'), r('b'), r('c')],
      entityId: 'xfix',
    });
    const pruned = reducer(seeded, { type: 'DELETE_RECEIPT', id: 'b' });
    expect(pruned.receipts.map(x => x.id)).toEqual(['a', 'c']);
  });

  test('REFRESH wholesale replaces receipts but preserves entityId', () => {
    const seeded = reducer(initialState, {
      type: 'HYDRATE',
      receipts: [r('a')],
      entityId: 'kai',
    });
    const refreshed = reducer(seeded, { type: 'REFRESH', receipts: [r('z')] });
    expect(refreshed.entityId).toBe('kai');
    expect(refreshed.receipts.map(x => x.id)).toEqual(['z']);
  });

  test('SET_PHOTO_URI updates only the targeted receipt\'s photoUri', () => {
    const seeded = reducer(initialState, {
      type: 'HYDRATE',
      receipts: [r('a'), r('b')],
      entityId: 'xfix',
    });
    const patched = reducer(seeded, { type: 'SET_PHOTO_URI', id: 'b', uri: 'file:///x.jpg' });
    expect(patched.receipts.find(x => x.id === 'a')?.photoUri).toBeUndefined();
    expect(patched.receipts.find(x => x.id === 'b')?.photoUri).toBe('file:///x.jpg');
  });

  test('MARK_PENDING dedupes and MARK_SYNCED removes', () => {
    let s = reducer(initialState, { type: 'MARK_PENDING', key: 'r_1' });
    s = reducer(s, { type: 'MARK_PENDING', key: 'r_1' }); // dup
    s = reducer(s, { type: 'MARK_PENDING', key: 'photo:r_1' });
    expect(s.pendingSync).toEqual(['r_1', 'photo:r_1']);
    s = reducer(s, { type: 'MARK_SYNCED', key: 'r_1' });
    expect(s.pendingSync).toEqual(['photo:r_1']);
  });

  test('unknown action returns same state reference', () => {
    // @ts-expect-error — exercising the default branch deliberately
    const next = reducer(initialState, { type: 'NOPE' });
    expect(next).toBe(initialState);
  });
});
