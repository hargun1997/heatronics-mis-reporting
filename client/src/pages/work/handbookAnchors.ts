// Split from taskModel.ts so the task maths (used by the sidebar count on every page) does not pull the 250 kB handbook.
import { getHandbook, type HbArticle } from '../../data/handbook/handbook';

/** First anchor id of each handbook article (for the "How to" picker). */
export function handbookAnchors(): { id: string; a: HbArticle }[] {
  const seen = new Set<HbArticle>();
  const out: { id: string; a: HbArticle }[] = [];
  for (const [id, a] of getHandbook().idToArticle) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push({ id, a });
  }
  return out;
}
