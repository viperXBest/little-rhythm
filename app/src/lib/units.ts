/** A number and its unit joined by a non-breaking space, so the unit never wraps onto its own line. */
export function withUnit(value: number | string, unit: string): string {
  return `${value} ${unit}`;
}

/** The feed line shown on the timeline and the confirm card, e.g. "Breast · right · 14 min". */
export function feedLabel(
  feed: { kind: "bottle"; ml: number } | { kind: "breast"; side: string; minutes: number },
): string {
  return feed.kind === "bottle"
    ? `Bottle · ${withUnit(feed.ml, "ml")}`
    : `Breast · ${feed.side} · ${withUnit(feed.minutes, "min")}`;
}
