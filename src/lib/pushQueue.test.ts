import { createSerialPusher } from './pushQueue';

type V = { id: string; updatedAt: number; v: string };

function deferred() {
  let resolve!: () => void; let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(r => setImmediate(r));

describe('createSerialPusher', () => {
  test('a single push sends once and reports synced', async () => {
    const sent: string[] = []; const synced: string[] = [];
    const p = createSerialPusher<V>(async x => { sent.push(x.v); }, { onPending: () => {}, onSynced: id => synced.push(id) });
    await p.push({ id: 'a', updatedAt: 1, v: 'one' });
    expect(sent).toEqual(['one']);
    expect(synced).toEqual(['a']);
  });

  test('THE BUG: two quick saves never let the older one land last', async () => {
    const calls: { v: string; d: ReturnType<typeof deferred> }[] = [];
    const cloud: Record<string, string> = {};
    const p = createSerialPusher<V>(x => {
      const d = deferred();
      calls.push({ v: x.v, d });
      return d.promise.then(() => { cloud[x.id] = x.v; });
    }, { onPending: () => {}, onSynced: () => {} });

    const first = p.push({ id: 'a', updatedAt: 1, v: 'blank' });
    const second = p.push({ id: 'a', updatedAt: 2, v: '58.30' });
    await flush();
    // Only one request in flight for the same receipt.
    expect(calls.map(c => c.v)).toEqual(['blank']);
    calls[0].d.resolve();
    await flush();
    // The newer version follows the older one, never the other way round.
    expect(calls.map(c => c.v)).toEqual(['blank', '58.30']);
    calls[1].d.resolve();
    await Promise.all([first, second]);
    expect(cloud.a).toBe('58.30');
  });

  test('an older version arriving later is ignored', async () => {
    const sent: string[] = [];
    const p = createSerialPusher<V>(async x => { sent.push(x.v); }, { onPending: () => {}, onSynced: () => {} });
    await p.push({ id: 'a', updatedAt: 5, v: 'new' });
    await p.push({ id: 'a', updatedAt: 3, v: 'old' });
    expect(sent).toEqual(['new']);
  });

  test('a failure leaves the receipt pending and does not report synced', async () => {
    const pending: string[] = []; const synced: string[] = [];
    const p = createSerialPusher<V>(async () => { throw new Error('offline'); },
      { onPending: id => pending.push(id), onSynced: id => synced.push(id) });
    await p.push({ id: 'a', updatedAt: 1, v: 'x' });
    expect(pending).toContain('a');
    expect(synced).toEqual([]);
  });

  test('after a failure, the same version can be retried', async () => {
    let fail = true; const sent: string[] = [];
    const p = createSerialPusher<V>(async x => { if (fail) throw new Error('offline'); sent.push(x.v); },
      { onPending: () => {}, onSynced: () => {} });
    await p.push({ id: 'a', updatedAt: 1, v: 'x' });
    fail = false;
    await p.push({ id: 'a', updatedAt: 1, v: 'x' });
    expect(sent).toEqual(['x']);
  });

  test('force resends a version the cloud turned out not to have', async () => {
    const sent: string[] = [];
    const p = createSerialPusher<V>(async x => { sent.push(x.v); }, { onPending: () => {}, onSynced: () => {} });
    await p.push({ id: 'a', updatedAt: 1, v: 'x' });
    await p.push({ id: 'a', updatedAt: 1, v: 'x' });
    expect(sent).toEqual(['x']);
    await p.push({ id: 'a', updatedAt: 1, v: 'x' }, { force: true });
    expect(sent).toEqual(['x', 'x']);
  });

  test('different receipts upload in parallel', async () => {
    const started: string[] = []; const ds: Record<string, ReturnType<typeof deferred>> = {};
    const p = createSerialPusher<V>(x => { started.push(x.id); ds[x.id] = deferred(); return ds[x.id].promise; },
      { onPending: () => {}, onSynced: () => {} });
    const a = p.push({ id: 'a', updatedAt: 1, v: 'a' });
    const b = p.push({ id: 'b', updatedAt: 1, v: 'b' });
    await flush();
    expect(started.sort()).toEqual(['a', 'b']);
    ds.a.resolve(); ds.b.resolve();
    await Promise.all([a, b]);
  });
});
