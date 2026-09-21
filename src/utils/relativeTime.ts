// Minutes/hours/days ago, falling back to a locale date past a week — mirrors
// the granularity researchers actually care about ("did Sam edit this today
// or last month?") without needing exact timestamps. Shared by DiagramCard
// (last-edited), HistoryPanel (per-version timestamps) and the Notes panel.
//
// Accepts two input shapes: SQLite's zone-less "YYYY-MM-DD HH:MM:SS" (UTC —
// a 'Z' is appended) and full ISO 8601 strings that already carry a zone
// (analytic notes' createdAt/updatedAt).
function toDate(timestamp: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);
  return new Date(hasZone ? timestamp : timestamp + 'Z');
}

export function relativeTime(isoTimestamp: string): string {
  const then = toDate(isoTimestamp).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return toDate(isoTimestamp).toLocaleDateString();
}
