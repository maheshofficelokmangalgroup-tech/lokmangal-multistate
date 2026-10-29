// Display helpers. Staff always see Asia/Kolkata times and Indian number formatting.

const TZ = 'Asia/Kolkata';

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';

export const fmtDate = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso)) : '—';

export const fmtTime = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—');

export function fmtRelative(iso?: string | null) {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(iso);
}

export const fmtINR = (n?: number | null) => (n === null || n === undefined ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));
export const fmtNumber = (n?: number | null) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'));
export const fmtBytes = (n?: number | null) => {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/** IST calendar date of an instant, as yyyy-mm-dd. */
export const istDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

/** "2027-04-01T09:30" (datetime-local, interpreted in IST) → ISO instant. */
export const istLocalToIso = (local: string) => new Date(`${local}:00+05:30`).toISOString();
export const isoToIstLocal = (iso?: string | null) => {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
};

export const leadKinds: Record<string, string> = {
  account: 'Account opening',
  deposit: 'Deposit',
  loan: 'Loan',
  contact: 'Contact',
  callback: 'Callback',
  service: 'Service enquiry',
};

export const humanize = (s: string) => s.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** "3.500" → "3.50", "10.000" → "10.00"; month terms are whole numbers ("88.000" → "88"). */
export function trimRate(value: string | undefined, unit?: string) {
  if (value === undefined || value === null || value === '') return '—';
  if (unit === 'months') return String(Math.round(Number(value)));
  const [i, f = ''] = value.split('.');
  return `${i}.${f.replace(/0+$/, '').padEnd(2, '0')}`;
}
