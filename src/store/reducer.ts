// Pure reducer for the receipt store. Kept in its own file (with no JSX and
// no React imports) so it can be unit-tested without pulling the full RN
// test infrastructure.
import { Receipt, Screen } from '../types';

export interface State {
  entityId: string;
  screen: Screen;
  currentReceiptId: string | null;
  currentReportId: string | null;
  receipts: Receipt[];
  ready: boolean;
  pendingSync: string[];
}

export type Action =
  | { type: 'HYDRATE'; receipts: Receipt[]; entityId: string; pendingSync?: string[] }
  | { type: 'SET_ENTITY'; id: string }
  | { type: 'NAVIGATE'; screen: Screen; receiptId?: string | null }
  | { type: 'SET_REPORT'; id: string | null }
  | { type: 'ADD_RECEIPT'; receipt: Receipt }
  | { type: 'UPDATE_RECEIPT'; receipt: Receipt }
  | { type: 'DELETE_RECEIPT'; id: string }
  | { type: 'REFRESH'; receipts: Receipt[] }
  | { type: 'SET_PHOTO_URI'; id: string; uri: string }
  | { type: 'MARK_PENDING'; key: string }
  | { type: 'MARK_SYNCED'; key: string };

export const initialState: State = {
  entityId: 'xfix',
  screen: 'home',
  currentReceiptId: null,
  currentReportId: null,
  receipts: [],
  ready: false,
  pendingSync: [],
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return {
        ...state,
        receipts: action.receipts,
        entityId: action.entityId,
        // Restore the persisted retry queue. Without it, a restart forgets
        // which local receipts never reached Supabase and mergeRemote drops them.
        pendingSync: action.pendingSync ?? state.pendingSync,
        ready: true,
      };
    case 'SET_ENTITY':
      return { ...state, entityId: action.id };
    case 'NAVIGATE':
      return {
        ...state,
        screen: action.screen,
        currentReceiptId:
          action.receiptId === undefined ? state.currentReceiptId : action.receiptId,
      };
    case 'SET_REPORT':
      return { ...state, currentReportId: action.id };
    case 'ADD_RECEIPT':
      return { ...state, receipts: [action.receipt, ...state.receipts] };
    case 'UPDATE_RECEIPT':
      return {
        ...state,
        receipts: state.receipts.map(r => (r.id === action.receipt.id ? action.receipt : r)),
      };
    case 'DELETE_RECEIPT':
      return { ...state, receipts: state.receipts.filter(r => r.id !== action.id) };
    case 'REFRESH':
      return { ...state, receipts: action.receipts };
    case 'SET_PHOTO_URI':
      return {
        ...state,
        receipts: state.receipts.map(r =>
          r.id === action.id ? { ...r, photoUri: action.uri } : r,
        ),
      };
    case 'MARK_PENDING':
      return state.pendingSync.includes(action.key)
        ? state
        : { ...state, pendingSync: [...state.pendingSync, action.key] };
    case 'MARK_SYNCED':
      return { ...state, pendingSync: state.pendingSync.filter(k => k !== action.key) };
    default:
      return state;
  }
}

/**
 * Merge a full cloud fetch into local state.
 *   - Remote rows win unless the local copy has a newer updatedAt.
 *   - A local receipt missing from the cloud is kept ONLY if it is still in
 *     the pending-sync queue (captured offline, never uploaded). Anything else
 *     missing from the cloud was deleted on another device and is dropped.
 */
export function mergeRemote(local: Receipt[], incoming: Receipt[], pendingSync: string[]): Receipt[] {
  const pending = new Set(pendingSync);
  // A delete that hasn't reached the cloud yet must not bring the row back.
  const live = incoming.filter(r => !pending.has(`del:${r.id}`));
  const incomingIds = new Set(live.map(r => r.id));
  const localById = new Map(local.map(r => [r.id, r]));
  const localOnly = local.filter(r => !incomingIds.has(r.id) && pending.has(r.id));
  const merged = live.map(r => {
    const l = localById.get(r.id);
    if (l && l.updatedAt > r.updatedAt) return l;
    if (!l) return r;
    return {
      ...r,
      // Cloud rows never carry photoUri (device-local path). Keep ours, or a
      // photo whose upload is still queued can no longer be retried.
      photoUri: r.photoUri ?? l.photoUri,
      // The cloud stores "no decision yet" as null. Keep the local undefined
      // so an untouched KAI-book capture still defaults to Bill to KAI.
      billableTo: l.billableTo === undefined && r.billableTo === null ? undefined : r.billableTo,
    };
  });
  return [...localOnly, ...merged];
}
