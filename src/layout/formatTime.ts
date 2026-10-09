/** Compact "2h ago" style label for an ISO timestamp, or null if it is not a date. */
export function formatRelativeTime(iso: string | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Oct 9, 2026" style label for an ISO timestamp, or null if it is not a date. */
export function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return new Date(then).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Human size of a data URL's payload, e.g. "1.2 MB". */
export function formatDataUrlSize(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  const payload = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const isBase64 = dataUrl.slice(0, comma === -1 ? 0 : comma).includes(';base64');
  const bytes = isBase64 ? Math.floor((payload.length * 3) / 4) : payload.length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
