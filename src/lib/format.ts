// Currencies the entry UI offers. Receipt.currency is still free text so
// legacy/imported data with other codes keeps rendering via fmtMoney.
export const CURRENCIES = ['USD', 'EUR'] as const;

export function currencySymbol(cur: string): string {
  return cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '';
}

export function fmtMoney(n: number, cur: string = 'USD'): string {
  return `${currencySymbol(cur)}${n.toFixed(2)}`;
}

// Sum a list of receipts per currency and render as a single line, e.g.
// "$1234.56 + €89.00". Never converts between currencies — a mixed-currency
// total is displayed as its parts. USD first, then EUR, then anything else
// alphabetically. Unknown/missing currency is treated as USD (matches the
// pre-currency-toggle data, which was all USD).
export function fmtTotalsByCurrency(
  items: ReadonlyArray<{ total: number; currency?: string }>
): string {
  const sums = new Map<string, number>();
  for (const it of items) {
    const cur = it.currency || 'USD';
    sums.set(cur, (sums.get(cur) ?? 0) + it.total);
  }
  if (sums.size === 0) return fmtMoney(0, 'USD');
  const order = (c: string) => (c === 'USD' ? 0 : c === 'EUR' ? 1 : 2);
  const curs = Array.from(sums.keys()).sort(
    (a, b) => order(a) - order(b) || a.localeCompare(b)
  );
  return curs.map(c => fmtMoney(sums.get(c)!, c)).join(' + ');
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
