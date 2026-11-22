// Sidebar Tasks badge. Reads the one shared count (useWorkCount) so the badge, Today and Tasks always agree.
import { useWorkCount } from './useWorkCount';

export function useIssueCount(): { open: number; high: number } | null {
  const c = useWorkCount();
  return c ? { open: c.open, high: c.urgent } : null;
}
