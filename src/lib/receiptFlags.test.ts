import { isVisible, isNotAReceipt, needsAttention, showAiTag, NOT_A_RECEIPT } from './receiptFlags';

describe('receipt flags', () => {
  test('duplicates are hidden', () => {
    expect(isVisible({ duplicateOf: 'r_primary' })).toBe(false);
    expect(isVisible({ duplicateOf: null })).toBe(true);
    expect(isVisible({})).toBe(true);
  });
  test('"Not a receipt?" goes to the tray, not the yellow list', () => {
    const junk = { status: 'needs-review' as const, reviewReason: NOT_A_RECEIPT };
    expect(isNotAReceipt(junk)).toBe(true);
    expect(needsAttention(junk)).toBe(false);
    expect(needsAttention({ status: 'needs-review', reviewReason: 'Amount not found' })).toBe(true);
    expect(needsAttention({ status: 'ready', reviewReason: null })).toBe(false);
  });
  test('AI tag only when the reader filled it', () => {
    expect(showAiTag({ aiExtracted: true })).toBe(true);
    expect(showAiTag({ aiExtracted: false })).toBe(false);
    expect(showAiTag({})).toBe(false);
  });
});
