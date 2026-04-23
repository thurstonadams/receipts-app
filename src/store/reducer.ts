// Pure reducer for the receipt store. Kept in its own file (with no JSX and
// no React imports) so it can be unit-tested without pulling the full RN
// test infrastructure.
import { Receipt, Screen } from '../types';

export interface State {
  entityId: string;
  screen: Screen;
  currentReceiptId: string | null;
  receipts: Receipt[];
  ready: boolean;
  pendingSync: string[];
}

export type Action =
  | { type: 'HYDRATE'; receipts: Receipt[]; entityId: string }
  | { type: 'SET_ENTITY'; id: string }
  | { type: 'NAVIGATE'; screen: Screen; receiptId?: string | null }
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
  receipts: [],
  ready: false,
  pendingSync: [],
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, receipts: action.receipts, entityId: action.entityId, ready: true };
    case 'SET_ENTITY':
      return { ...state, entityId: action.id };
    case 'NAVIGATE':
      return {
        ...state,
        screen: action.screen,
        currentReceiptId:
          action.receiptId === undefined ? state.currentReceiptId : action.receiptId,
      };
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
