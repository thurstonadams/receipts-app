// Photo storage — persist captured receipt photos to app documents directory,
// mirror them to Supabase Storage so cloud backups aren't just phantom
// references, and pull them back to local on demand when a restored receipt
// is first viewed.
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const PHOTO_DIR = (FileSystem.documentDirectory ?? '') + 'receipt-photos/';
const BUCKET = 'receipts';

async function ensureDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

export function localPhotoUri(receiptId: string): string {
  return `${PHOTO_DIR}${receiptId}.jpg`;
}

export async function persistCapturedPhoto(tmpUri: string, id: string): Promise<string> {
  await ensureDir();
  const dest = localPhotoUri(id);
  try {
    await FileSystem.copyAsync({ from: tmpUri, to: dest });
  } catch {
    // fall back to returning the original URI (still works until app relaunches)
    return tmpUri;
  }
  return dest;
}

export async function deletePhoto(uri?: string): Promise<void> {
  if (!uri || !uri.startsWith('file://')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}

/**
 * Upload a locally-stored receipt photo to Supabase Storage.
 * Returns the storage object key (e.g. "<userId>/<receiptId>.jpg") on success.
 */
export async function uploadPhotoToStorage(
  localUri: string,
  userId: string,
  receiptId: string
): Promise<string> {
  const path = `${userId}/${receiptId}.jpg`;
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Supabase JS SDK accepts ArrayBuffer / Uint8Array for RN uploads.
  // atob + Uint8Array.from is available in modern Hermes/RN without extra deps.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/**
 * Download a receipt photo from Supabase Storage into the local photo dir,
 * returning the resulting file:// URI. Uses a short-lived signed URL so we
 * can reuse FileSystem.downloadAsync.
 */
export async function downloadPhotoFromStorage(
  photoPath: string,
  receiptId: string
): Promise<string> {
  await ensureDir();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoPath, 60 * 5);
  if (error || !data) throw error ?? new Error('no signed url');
  const dest = localPhotoUri(receiptId);
  const res = await FileSystem.downloadAsync(data.signedUrl, dest);
  if (res.status >= 400) throw new Error(`download failed: ${res.status}`);
  return dest;
}

export async function deletePhotoFromStorage(photoPath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([photoPath]);
  if (error) throw error;
}
