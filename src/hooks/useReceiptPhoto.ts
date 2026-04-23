// Resolve a receipt's photo to a local file:// URI we can feed to <Image>.
// If the receipt already has a local photoUri, returns it immediately.
// If it only has a Supabase Storage photoPath (e.g. just restored from the
// cloud on a fresh install), checks for an existing local cache file at the
// canonical path, and otherwise downloads via a short-lived signed URL.
// On resolution, the store is notified via setLocalPhotoUri so subsequent
// renders skip the download and the uri is persisted in AsyncStorage.
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { Receipt } from '../types';
import { useStore } from '../store/StoreContext';
import { downloadPhotoFromStorage, localPhotoUri } from '../lib/photos';

export interface PhotoState {
  uri?: string;
  loading: boolean;
}

export function useReceiptPhoto(receipt: Receipt | null | undefined): PhotoState {
  const { setLocalPhotoUri } = useStore();
  const [state, setState] = useState<PhotoState>({
    uri: receipt?.photoUri,
    loading: false,
  });

  const id = receipt?.id;
  const photoUri = receipt?.photoUri;
  const photoPath = receipt?.photoPath;

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ uri: undefined, loading: false });
      return;
    }
    if (photoUri) {
      setState({ uri: photoUri, loading: false });
      return;
    }
    if (!photoPath) {
      setState({ uri: undefined, loading: false });
      return;
    }

    const candidate = localPhotoUri(id);
    setState({ uri: undefined, loading: true });

    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(candidate);
        if (info.exists) {
          if (cancelled) return;
          setState({ uri: candidate, loading: false });
          setLocalPhotoUri(id, candidate);
          return;
        }
        const downloaded = await downloadPhotoFromStorage(photoPath, id);
        if (cancelled) return;
        setState({ uri: downloaded, loading: false });
        setLocalPhotoUri(id, downloaded);
      } catch {
        if (cancelled) return;
        // Leave uri undefined — component renders the placeholder thumb.
        setState({ uri: undefined, loading: false });
      }
    })();

    return () => { cancelled = true; };
  }, [id, photoUri, photoPath, setLocalPhotoUri]);

  return state;
}
