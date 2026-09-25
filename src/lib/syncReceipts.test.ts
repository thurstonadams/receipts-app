const upsert = jest.fn().mockResolvedValue({ error: null });
jest.mock('./supabase', () => ({ supabase: { from: () => ({ upsert }) } }));
import { pushReceipt } from './syncReceipts';
import { Receipt } from '../types';

const base: Receipt = {
  id: 'r1', entityId: 'kai', vendor: 'Conrad Pune', date: '2026-08-25', total: 1, currency: 'INR',
  payment: '', category: 'Travel', notes: '', status: 'ready', thumbTone: 0, createdAt: 1, updatedAt: 2,
  reviewReason: 'Amount not found', aiExtracted: true, duplicateOf: 'r_primary',
};

describe('pushReceipt row mapping', () => {
  beforeEach(() => upsert.mockClear());
  test('never writes duplicate_of (server-owned)', async () => {
    await pushReceipt(base, 'u');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('duplicate_of');
  });
  test('a ready receipt clears its yellow reason', async () => {
    await pushReceipt(base, 'u');
    expect(upsert.mock.calls[0][0].review_reason).toBeNull();
  });
  test('a yellow receipt keeps its reason; AI flag passes through', async () => {
    await pushReceipt({ ...base, status: 'needs-review', aiExtracted: false }, 'u');
    expect(upsert.mock.calls[0][0]).toMatchObject({ review_reason: 'Amount not found', ai_extracted: false, entity_id: 'kai' });
  });
});

describe('upgrade safety — copies cached by build 20 lack the new fields', () => {
  beforeEach(() => upsert.mockClear());
  test('undefined reason/AI flag on a yellow row are left to the server', async () => {
    const { reviewReason, aiExtracted, ...old } = base;
    void reviewReason; void aiExtracted;
    await pushReceipt({ ...old, status: 'needs-review' } as Receipt, 'u');
    const row = upsert.mock.calls[0][0];
    expect(row).not.toHaveProperty('review_reason');
    expect(row).not.toHaveProperty('ai_extracted');
  });
});
