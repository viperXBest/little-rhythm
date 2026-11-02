/**
 * Index of the window with the earliest start, or -1 when none has a window. Ties go to the
 * first one, so the Next up order (feed, nap or wake, routine, bedtime) breaks them.
 * Pure (no imports), so it runs under Deno.
 */
export function earliestIndex(windows: readonly ({ start: string } | null)[]): number {
  let best = -1;
  let bestStart = Infinity;
  windows.forEach((w, i) => {
    if (!w) return;
    const start = Date.parse(w.start);
    if (Number.isFinite(start) && start < bestStart) {
      best = i;
      bestStart = start;
    }
  });
  return best;
}
