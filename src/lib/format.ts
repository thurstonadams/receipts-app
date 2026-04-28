export function fmtMoney(n: number, cur: string = 'USD'): string {
  const sign = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '';
  return `${sign}${n.toFixed(2)}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateFull(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function todayISO(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// In-process counter to guarantee uniqueness even when uid() is called
// many times within a single millisecond (which Math.random + a short
// suffix doesn't reliably guarantee — we hit birthday-paradox collisions
// at ~5k calls per ms with a 5-char base36 tail).
let _uidCounter = 0;

export function uid(prefix: string = 'r'): string {
  _uidCounter = (_uidCounter + 1) | 0;
  const ts = Date.now().toString(36);
  const seq = _uidCounter.toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${ts}${seq}_${rand}`;
}
