// Small, shared answers about a receipt's state, so every screen agrees.
import { Receipt } from '../types';

export const NOT_A_RECEIPT = 'Not a receipt?';

/** Duplicates stay in storage for the paper trail but never show or count. */
export function isVisible(r: Pick<Receipt, 'duplicateOf'>): boolean {
  return !r.duplicateOf;
}

/** Login links, marketing, enquiries: they go to a tray, not the yellow list. */
export function isNotAReceipt(r: Pick<Receipt, 'status' | 'reviewReason'>): boolean {
  return r.status === 'needs-review' && r.reviewReason === NOT_A_RECEIPT;
}

/** Yellow = needs a decision from Thurston. */
export function needsAttention(r: Pick<Receipt, 'status' | 'reviewReason'>): boolean {
  return r.status === 'needs-review' && !isNotAReceipt(r);
}

/** "AI" tag: filled by the reader and not yet saved by hand. */
export function showAiTag(r: Pick<Receipt, 'aiExtracted'>): boolean {
  return r.aiExtracted === true;
}
