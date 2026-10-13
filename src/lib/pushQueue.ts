// One upload at a time per receipt, always the newest version.
//
// Why: two quick saves of the same receipt used to fire two parallel upserts.
// If the older one reached Supabase last, the cloud kept the old row, the
// phone kept the new one, and nothing was left in the retry queue — the edit
// was silently stranded (the "$0.00 blank receipt" that was €58.30 on the
// phone, Oct 2026). Here a second save while one is in flight just records the
// newer version; it is sent right after the first finishes.
export interface Versioned { id: string; updatedAt: number }

export interface PushHooks {
  onPending: (id: string) => void;
  onSynced: (id: string) => void;
}

export function createSerialPusher<T extends Versioned>(
  send: (item: T) => Promise<void>,
  hooks: PushHooks,
) {
  const latest = new Map<string, T>();
  const inflight = new Map<string, Promise<void>>();
  // Version the cloud is known to hold, per receipt. Cleared on failure so a retry resends.
  const sent = new Map<string, number>();

  async function drain(id: string): Promise<void> {
    for (;;) {
      const item = latest.get(id);
      if (!item || item.updatedAt === sent.get(id)) break;
      try {
        await send(item);
        sent.set(id, item.updatedAt);
      } catch {
        sent.delete(id);
        hooks.onPending(id);
        return;
      }
    }
    hooks.onSynced(id);
  }

  /** force: resend even if this version was sent before (the cloud proved it did not keep it). */
  function push(item: T, opts: { force?: boolean } = {}): Promise<void> {
    if (opts.force) sent.delete(item.id);
    const known = latest.get(item.id);
    if (!known || item.updatedAt >= known.updatedAt) latest.set(item.id, item);
    hooks.onPending(item.id);
    const running = inflight.get(item.id);
    if (running) return running; // the loop picks up the newer version
    const p = drain(item.id).finally(() => inflight.delete(item.id));
    inflight.set(item.id, p);
    return p;
  }

  return { push };
}
