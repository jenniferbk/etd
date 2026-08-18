// Minutes/hours/days ago, falling back to a locale date past a week — mirrors
// the granularity researchers actually care about ("did Sam edit this today
// or last month?") without needing exact timestamps. Shared by DiagramCard
// (last-edited) and HistoryPanel (per-version timestamps).
export function relativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp + 'Z').getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(isoTimestamp + 'Z').toLocaleDateString();
}
