import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Receipt, Screen } from '../types';
import { ENTITIES } from '../data/entities';
import { uid } from '../lib/format';
import { deletePhoto } from '../lib/photos';
import { pushReceipt, deleteReceiptRemote, fetchAllReceipts } from '../lib/syncReceipts';

const STORAGE_KEY_RECEIPTS = '@xfix-receipts:receipts:v2';
const STORAGE_KEY_ENTITY   = '@xfix-receipts:entity:v2';

interface State {
  entityId: string;
  screen: Screen;
  currentReceiptId: string | null;
  receipts: Receipt[];
  ready: boolean;
}

type Action =
  | { type: 'HYDRATE'; receipts: Receipt[]; entityId: string }
  | { type: 'SET_ENTITY'; id: string }
  | { type: 'NAVIGATE'; screen: Screen; receiptId?: string | null }
  | { type: 'ADD_RECEIPT'; receipt: Receipt }
  | { type: 'UPDATE_RECEIPT'; receipt: Receipt }
  | { type: 'DELETE_RECEIPT'; id: string };

const initial: State = {
  entityId: 'xfix', screen: 'home', currentReceiptId: null, receipts: [], ready: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, receipts: action.receipts, entityId: action.entityId, ready: true };
    case 'SET_ENTITY':
      return { ...state, entityId: action.id };
    case 'NAVIGATE':
      return {
        ...state, screen: action.screen,
        currentReceiptId: action.receiptId === undefined ? state.currentReceiptId : action.receiptId,
      };
    case 'ADD_RECEIPT':
      return { ...state, receipts: [action.receipt, ...state.receipts] };
    case 'UPDATE_RECEIPT':
      return { ...state, receipts: state.receipts.map(r => r.id === action.receipt.id ? action.receipt : r) };
    case 'DELETE_RECEIPT':
      return { ...state, receipts: state.receipts.filter(r => r.id !== action.id) };
    default:
      return state;
  }
}

interface StoreValue {
  state: State;
  entities: typeof ENTITIES;
  currentEntity: (typeof ENTITIES)[number];
  currentReceipt: Receipt | null;
  receiptsForEntity: Receipt[];
  setEntity: (id: string) => void;
  navigate: (screen: Screen, receiptId?: string | null) => void;
  addReceipt: (r: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt'>) => Receipt;
  updateReceipt: (r: Receipt) => void;
  deleteReceipt: (id: string) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hydratedRef = useRef(false);
  const userIdRef = useRef(userId);

  // Hydrate: AsyncStorage first (fast/offline), then Supabase if local is empty (fresh install).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawReceipts, savedEntity] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_RECEIPTS),
          AsyncStorage.getItem(STORAGE_KEY_ENTITY),
        ]);
        let receipts: Receipt[] = [];
        if (rawReceipts) {
          try { receipts = JSON.parse(rawReceipts); } catch { receipts = []; }
        }
        if (!cancelled) {
          dispatch({ type: 'HYDRATE', receipts, entityId: savedEntity ?? 'xfix' });
          hydratedRef.current = true;
        }
        // Fresh install or cleared data — restore from Supabase cloud backup.
        if (!rawReceipts) {
          const remote = await fetchAllReceipts();
          if (remote.length > 0 && !cancelled) {
            dispatch({ type: 'HYDRATE', receipts: remote, entityId: savedEntity ?? 'xfix' });
          }
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'HYDRATE', receipts: [], entityId: 'xfix' });
          hydratedRef.current = true;
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist receipts locally on every change.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(state.receipts)).catch(() => {});
  }, [state.receipts]);

  // Persist selected entity locally.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY_ENTITY, state.entityId).catch(() => {});
  }, [state.entityId]);

  const sync = {
    push: (r: Receipt) => pushReceipt(r, userIdRef.current).catch(() => {}),
    remove: (id: string) => deleteReceiptRemote(id).catch(() => {}),
  };

  const currentEntity = ENTITIES.find(e => e.id === state.entityId) ?? ENTITIES[0];
  const receiptsForEntity = state.receipts.filter(r => r.entityId === state.entityId);
  const currentReceipt = state.receipts.find(r => r.id === state.currentReceiptId) ?? null;

  const value: StoreValue = {
    state, entities: ENTITIES, currentEntity, currentReceipt, receiptsForEntity,
    setEntity: id => dispatch({ type: 'SET_ENTITY', id }),
    navigate: (screen, receiptId) => dispatch({ type: 'NAVIGATE', screen, receiptId }),
    addReceipt: r => {
      const now = Date.now();
      const receipt: Receipt = { ...r, id: uid(), createdAt: now, updatedAt: now };
      dispatch({ type: 'ADD_RECEIPT', receipt });
      sync.push(receipt);
      return receipt;
    },
    updateReceipt: r => {
      const updated = { ...r, updatedAt: Date.now() };
      dispatch({ type: 'UPDATE_RECEIPT', receipt: updated });
      sync.push(updated);
    },
    deleteReceipt: async id => {
      const r = state.receipts.find(x => x.id === id);
      if (r?.photoUri) await deletePhoto(r.photoUri);
      dispatch({ type: 'DELETE_RECEIPT', id });
      sync.remove(id);
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
