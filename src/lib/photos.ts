// Photo storage — persist captured receipt photos to app documents directory.
// Returns a permanent local file:// URI that survives app restarts.
import * as FileSystem from 'expo-file-system/legacy';

const PHOTO_DIR = (FileSystem.documentDirectory ?? '') + 'receipt-photos/';

async function ensureDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

export async function persistCapturedPhoto(tmpUri: string, id: string): Promise<string> {
  await ensureDir();
  const dest = `${PHOTO_DIR}${id}.jpg`;
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
