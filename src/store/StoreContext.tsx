import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Receipt, Screen } from '../types';
import { ENTITIES } from '../data/entities';
import { uid } from '../lib/format';
import { deletePhoto, uploadPhotoToStorage, deletePhotoFromStorage } from '../lib/photos';
import { pushReceipt, deleteReceiptRemote, fetchAllReceipts, subscribeToReceipts } from '../lib/syncReceipts';

// v3 keys are scoped by the authenticated user id so different accounts on the
// same device don't bleed into each other's local cache. v2 keys (unscoped)
// from earlier builds are migrated on first launch of the new version.
const LEGACY_KEY_RECEIPTS = '@xfix-receipts:receipts:v2';
const LEGACY_KEY_ENTITY   = '@xfix-receipts:entity:v2';
const keyReceipts = (uid: string) => `@xfix-receipts:receipts:v3:${uid}`;
const keyEntity   = (uid: string) => `@xfix-receipts:entity:v3:${uid}`;
const keyMigrated = (uid: string) => `@xfix-receipts:v3-migrated:${uid}`;

interface State {
  entityId: string;
  screen: Screen;
  currentReceiptId: string | null;
  receipts: Receipt[];
  ready: boolean;
  // IDs of receipts whose most recent local write failed to reach Supabase.
  // deleted receipts are tracked with a 'del:' prefix so we know to retry the
  // delete rather than the upsert.
  pendingSync: string[];
}

type Action =
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

const initial: State = {
  entityId: 'xfix',
  screen: 'home',
  currentReceiptId: null,
  receipts: [],
  ready: false,
  pendingSync: [],
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

interface StoreValue {
  state: State;
  entities: typeof ENTITIES;
  currentEntity: (typeof ENTITIES)[number];
  currentReceipt: Receipt | null;
  receiptsForEntity: Receipt[];
  unsyncedCount: number;
  setEntity: (id: string) => void;
  navigate: (screen: Screen, receiptId?: string | null) => void;
  addReceipt: (r: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt'>) => Receipt;
  updateReceipt: (r: Receipt) => void;
  deleteReceipt: (id: string) => Promise<void>;
  setLocalPhotoUri: (id: string, uri: string) => void;
  refreshFromCloud: () => Promise<void>;
  retryPendingSync: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

// One-time migration from the unscoped v2 keys. Current-user inherits any
// legacy data that existed on the device; legacy keys are then cleared so
// a second user signing in later can't pick them up.
async function migrateV2IfNeeded(userId: string): Promise<void> {
  const done = await AsyncStorage.getItem(keyMigrated(userId));
  if (done) return;
  try {
    const [legacyReceipts, legacyEntity] = await Promise.all([
      AsyncStorage.getItem(LEGACY_KEY_RECEIPTS),
      AsyncStorage.getItem(LEGACY_KEY_ENTITY),
    ]);
    if (legacyReceipts) await AsyncStorage.setItem(keyReceipts(userId), legacyReceipts);
    if (legacyEntity)   await AsyncStorage.setItem(keyEntity(userId), legacyEntity);
    await AsyncStorage.multiRemove([LEGACY_KEY_RECEIPTS, LEGACY_KEY_ENTITY]);
  } catch {
    // Non-fatal — worst case we fall through to a Supabase fetch.
  }
  await AsyncStorage.setItem(keyMigrated(userId), '1');
}

export function StoreProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hydratedRef = useRef(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // Snapshot of latest receipts, readable from callbacks that may outlive
  // a given render.
  const receiptsRef = useRef<Receipt[]>([]);
  receiptsRef.current = state.receipts;
  const pendingSyncRef = useRef<string[]>([]);
  pendingSyncRef.current = state.pendingSync;

  // Hydrate: migrate legacy keys, then AsyncStorage (fast/offline), then
  // Supabase if local is empty (fresh install).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateV2IfNeeded(userId);
        const [rawReceipts, savedEntity] = await Promise.all([
          AsyncStorage.getItem(keyReceipts(userId)),
          AsyncStorage.getItem(keyEntity(userId)),
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
  }, [userId]);

  // Persist receipts locally on every change.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(keyReceipts(userIdRef.current), JSON.stringify(state.receipts)).catch(() => {});
  }, [state.receipts]);

  // Live sync via Supabase Realtime. Any receipts row touched by another
  // device (or this one — self-echo) fires through here. We dedupe against
  // updated_at so we never revert a newer local edit to an older remote one.
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToReceipts(userId, change => {
      if (change.kind === 'upsert') {
        const incoming = change.receipt;
        const existing = receiptsRef.current.find(r => r.id === incoming.id);
        if (existing && existing.updatedAt >= incoming.updatedAt) return;
        if (existing) {
          dispatch({ type: 'UPDATE_RECEIPT', receipt: incoming });
        } else {
          dispatch({ type: 'ADD_RECEIPT', receipt: incoming });
        }
      } else if (change.kind === 'delete') {
        if (receiptsRef.current.find(r => r.id === change.id)) {
          dispatch({ type: 'DELETE_RECEIPT', id: change.id });
        }
      }
    });
    return unsubscribe;
  }, [userId]);

  // Persist selected entity locally.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(keyEntity(userIdRef.current), state.entityId).catch(() => {});
  }, [state.entityId]);

  const pushOne = useCallback(async (r: Receipt) => {
    try {
      await pushReceipt(r, userIdRef.current);
      dispatch({ type: 'MARK_SYNCED', key: r.id });
    } catch {
      dispatch({ type: 'MARK_PENDING', key: r.id });
    }
  }, []);

  const removeOne = useCallback(async (id: string) => {
    try {
      await deleteReceiptRemote(id);
      dispatch({ type: 'MARK_SYNCED', key: `del:${id}` });
      dispatch({ type: 'MARK_SYNCED', key: id });
    } catch {
      dispatch({ type: 'MARK_PENDING', key: `del:${id}` });
    }
  }, []);

  // Upload a captured photo to Supabase Storage in the background, then
  // patch the receipt with the returned photoPath so the cloud copy can
  // survive a fresh install. Fire-and-forget — a failure just marks
  // photo:<id> pending for later retry.
  const uploadPhoto = useCallback(async (receiptId: string, localUri: string) => {
    try {
      const path = await uploadPhotoToStorage(localUri, userIdRef.current, receiptId);
      const current = receiptsRef.current.find(r => r.id === receiptId);
      if (!current) return;
      const updated: Receipt = { ...current, photoPath: path, updatedAt: Date.now() };
      dispatch({ type: 'UPDATE_RECEIPT', receipt: updated });
      pushOne(updated);
      dispatch({ type: 'MARK_SYNCED', key: `photo:${receiptId}` });
    } catch {
      dispatch({ type: 'MARK_PENDING', key: `photo:${receiptId}` });
    }
  }, [pushOne]);

  // Full refresh from cloud. Merges with local: remote rows take precedence
  // on updated_at ties, but any local-only receipt that hasn't been pushed
  // yet (id is in pendingSync) is preserved so offline captures don't vanish.
  const refreshFromCloud = useCallback(async () => {
    try {
      const incoming = await fetchAllReceipts();
      const incomingIds = new Set(incoming.map(r => r.id));
      const pending = new Set(pendingSyncRef.current);
      const localOnly = receiptsRef.current.filter(r => !incomingIds.has(r.id) && pending.has(r.id));
      const merged: Receipt[] = incoming.map(r => {
        const local = receiptsRef.current.find(x => x.id === r.id);
        return local && local.updatedAt > r.updatedAt ? local : r;
      });
      dispatch({ type: 'REFRESH', receipts: [...localOnly, ...merged] });
    } catch {
      // Network issue, etc. — leave state as-is.
    }
  }, []);

  // Belt-and-suspenders in case the Realtime socket drops or missed events:
  // whenever the app returns from background, pull the full set again.
  useEffect(() => {
    if (!hydratedRef.current) {
      // defer until after initial hydrate
    }
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && hydratedRef.current) {
        refreshFromCloud();
      }
    });
    return () => sub.remove();
  }, [refreshFromCloud]);

  const retryPendingSync = useCallback(async () => {
    const keys = [...state.pendingSync];
    for (const key of keys) {
      if (key.startsWith('del:')) {
        await removeOne(key.slice(4));
      } else if (key.startsWith('photo:')) {
        const receiptId = key.slice(6);
        const r = receiptsRef.current.find(x => x.id === receiptId);
        if (r?.photoUri) await uploadPhoto(receiptId, r.photoUri);
        else dispatch({ type: 'MARK_SYNCED', key });
      } else {
        const r = receiptsRef.current.find(x => x.id === key);
        if (r) await pushOne(r);
        else dispatch({ type: 'MARK_SYNCED', key });
      }
    }
  }, [state.pendingSync, pushOne, removeOne, uploadPhoto]);

  const currentEntity = ENTITIES.find(e => e.id === state.entityId) ?? ENTITIES[0];
  const receiptsForEntity = state.receipts.filter(r => r.entityId === state.entityId);
  const currentReceipt = state.receipts.find(r => r.id === state.currentReceiptId) ?? null;

  const value: StoreValue = {
    state,
    entities: ENTITIES,
    currentEntity,
    currentReceipt,
    receiptsForEntity,
    unsyncedCount: state.pendingSync.length,
    setEntity: id => dispatch({ type: 'SET_ENTITY', id }),
    navigate: (screen, receiptId) => dispatch({ type: 'NAVIGATE', screen, receiptId }),
    addReceipt: r => {
      const now = Date.now();
      const receipt: Receipt = { ...r, id: uid(), createdAt: now, updatedAt: now };
      dispatch({ type: 'ADD_RECEIPT', receipt });
      pushOne(receipt);
      // Kick off the photo upload in the background; it'll patch the
      // receipt with a photoPath on success and retry on failure.
      if (receipt.photoUri && !receipt.photoPath) {
        uploadPhoto(receipt.id, receipt.photoUri);
      }
      return receipt;
    },
    updateReceipt: r => {
      const updated = { ...r, updatedAt: Date.now() };
      dispatch({ type: 'UPDATE_RECEIPT', receipt: updated });
      pushOne(updated);
    },
    deleteReceipt: async id => {
      const r = state.receipts.find(x => x.id === id);
      if (r?.photoUri) await deletePhoto(r.photoUri);
      if (r?.photoPath) {
        // Orphaned storage objects aren't a security issue (still user-owned,
        // RLS-scoped) so don't block the UX on cleanup.
        deletePhotoFromStorage(r.photoPath).catch(() => {});
      }
      dispatch({ type: 'DELETE_RECEIPT', id });
      await removeOne(id);
    },
    // Local-only photoUri update (does not push to Supabase). Used when a
    // download-on-demand resolves a remote photo onto the device.
    setLocalPhotoUri: (id, uri) => dispatch({ type: 'SET_PHOTO_URI', id, uri }),
    refreshFromCloud,
    retryPendingSync,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
