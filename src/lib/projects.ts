// Per-user, per-entity custom project list, persisted in AsyncStorage.
//
// Projects are intentionally local-only: they're free-text labels the user
// types when filing a receipt and are scoped to a specific book (xFix vs KAI;
// personal book hides the project field entirely). A future migration could
// promote these to a Supabase table if cross-device sync becomes important,
// but for now AsyncStorage matches how the rest of the app stores book-level
// preferences.
//
// Storage key shape: @xfix-receipts:projects:v1:<userId>:<entityId>
// Stored value: JSON-encoded string[] (project names, deduped, lowercased
// uniqueness, original casing preserved).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const projectsKey = (userId: string, entityId: string) =>
  `@xfix-receipts:projects:v1:${userId}:${entityId}`;

export async function loadProjects(userId: string, entityId: string): Promise<string[]> {
  if (!userId || !entityId) return [];
  try {
    const raw = await AsyncStorage.getItem(projectsKey(userId, entityId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveProjects(
  userId: string,
  entityId: string,
  projects: string[],
): Promise<void> {
  if (!userId || !entityId) return;
  try {
    await AsyncStorage.setItem(projectsKey(userId, entityId), JSON.stringify(projects));
  } catch {
    // AsyncStorage failures here aren't worth surfacing — the UI already
    // updated, and the next save will retry.
  }
}

// Merge a new project name into the saved list. Case-insensitive dedupe so
// "Acme Q3" and "acme q3" don't both end up in the picker. Returns the new
// list (caller should call saveProjects to persist).
export function addProject(existing: string[], next: string): string[] {
  const trimmed = next.trim();
  if (!trimmed) return existing;
  const exists = existing.some(p => p.toLowerCase() === trimmed.toLowerCase());
  if (exists) return existing;
  return [...existing, trimmed].sort((a, b) => a.localeCompare(b));
}

/**
 * React hook that loads + persists the per-user-per-entity project list.
 * Re-loads whenever userId or entityId changes. The setter writes through
 * to AsyncStorage transparently.
 */
export function useProjects(userId: string, entityId: string) {
  const [projects, setProjects] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    loadProjects(userId, entityId).then(list => {
      if (!cancelled) {
        setProjects(list);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [userId, entityId]);

  const add = useCallback(async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const next = addProject(projects, trimmed);
    setProjects(next);
    await saveProjects(userId, entityId, next);
    return trimmed;
  }, [projects, userId, entityId]);

  return { projects, loaded, add };
}
