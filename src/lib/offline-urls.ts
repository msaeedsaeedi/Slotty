/**
 * Which saved page an address opens offline (#173): one rule for the service worker (what it
 * serves) and `AppLink` (what it shows as available), so the two can't disagree.
 *
 * Pages are saved by path only (`/today`, `/courses/c/manage/assignments/a/mark`). An address
 * with a query is the same page only if every parameter just focuses or links somewhere
 * (`booking` picks a row of the sheet, `back` and `returnTo` set the back link). Anything else
 * (`?day=`, `?scope=`, `?student=`, `?reschedule=1` …) shows different content, which isn't on
 * the device: serving the saved copy under that address would show the wrong day silently.
 *
 * Add a parameter here only if the page shows the same data with or without it.
 */

/** Per page (path pattern), the query parameters that don't change what it shows. */
const SAME_PAGE_PARAMS: { path: RegExp; params: readonly string[] }[] = [
  { path: /^\/courses\/[^/]+\/manage\/assignments\/[^/]+\/mark$/, params: ["booking", "back"] },
  { path: /^\/courses\/[^/]+\/manage\/assignments\/[^/]+\/evaluate\/[^/]+$/, params: ["returnTo"] },
];

/**
 * The saved page (its path) that this address shows, or null if it needs a page that's never
 * saved: a query parameter that changes the content. Doesn't say whether that page is saved.
 */
export function savedPageKey(url: URL): string | null {
  const path = url.pathname;
  const keep = SAME_PAGE_PARAMS.find((p) => p.path.test(path))?.params ?? [];
  for (const name of url.searchParams.keys()) if (!keep.includes(name)) return null;
  return path;
}
