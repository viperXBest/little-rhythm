// Age bands and tuning for the prediction engine (predict.ts). All durations
// are minutes; bedtimes are minutes after local midnight.
//
// These are scheduling heuristics for a family log, not medical guidance. The
// app shows them as "typical for this age" and the buddy never turns them into
// advice.
//
// Sources, by band column:
// - Feed interval: NHS "Breastfeeding: the first few days" and "How often to
//   breastfeed" (8–12 feeds in 24 h for newborns, spacing out over the first
//   months); AAP HealthyChildren.org "How Often and How Much Should Your Baby
//   Eat?" (every 2–3 h newborn, 3–4 h by 2–4 months). After 6 months intervals
//   depend on solids; from 12 months "feed" means milk or meals.
// - Bedtime: AAP HealthyChildren.org sleep pages ("Getting Your Baby to Sleep";
//   no fixed bedtime in the first ~2 months); Mindell et al. 2010, Sleep
//   Medicine 11(3), "Cross-cultural differences in infant and toddler sleep"
//   (typical bedtimes ~19:00–21:00 in predominantly Caucasian countries).
// - Wake window and nap length: HEURISTIC. No clinical guideline publishes
//   these; the values are consensus ranges from infant sleep guides, sanity-
//   checked against total sleep per day (AASM consensus, Paruthi et al. 2016,
//   J Clin Sleep Med 12(6): 12–16 h for 4–12 months, 11–14 h for 1–2 years).

export type Range = { min: number; max: number };

export type AgeBand = {
  /** Inclusive lower bound in completed weeks. */
  fromWeeks: number;
  wake: Range;
  feed: Range;
  nap: Range;
  /** Null: no set bedtime yet. */
  bedtime: Range | null;
};

const h = (hours: number) => Math.round(hours * 60);
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

/** Ordered by fromWeeks. The last band applies to everything older. */
export const AGE_BANDS: readonly AgeBand[] = [
  // 0–3 wk: feeds 8–12 per day (NHS, AAP); short wake windows (heuristic); no bedtime (AAP).
  {
    fromWeeks: 0,
    wake: { min: 35, max: 60 },
    feed: { min: h(2), max: h(3) },
    nap: { min: 30, max: 120 },
    bedtime: null,
  },
  // 4–7 wk: still every 2–3 h (AAP); wake windows heuristic; no bedtime yet (AAP).
  {
    fromWeeks: 4,
    wake: { min: 60, max: 90 },
    feed: { min: h(2), max: h(3) },
    nap: { min: 30, max: 120 },
    bedtime: null,
  },
  // 8–12 wk: 2.5–3.5 h (AAP "every 3 h" by 2 months); bedtime varies widely at this age (Mindell 2010), wide band.
  {
    fromWeeks: 8,
    wake: { min: 75, max: 105 },
    feed: { min: h(2.5), max: h(3.5) },
    nap: { min: 30, max: 120 },
    bedtime: { min: at(19, 30), max: at(21, 30) },
  },
  // 13–16 wk: 2.5–4 h (AAP 3–4 h); bedtime 19:00–21:00 (Mindell 2010).
  {
    fromWeeks: 13,
    wake: { min: 90, max: 120 },
    feed: { min: h(2.5), max: h(4) },
    nap: { min: 30, max: 120 },
    bedtime: { min: at(19), max: at(21) },
  },
  // 17–25 wk: 3–4 h (AAP); bedtime 19:00–20:30 (Mindell 2010, AAP).
  {
    fromWeeks: 17,
    wake: { min: 105, max: 150 },
    feed: { min: h(3), max: h(4) },
    nap: { min: 40, max: 120 },
    bedtime: { min: at(19), max: at(20, 30) },
  },
  // 26–38 wk: 3–4.5 h, solids started (AAP); bedtime 18:30–20:00 (AAP, Mindell 2010).
  {
    fromWeeks: 26,
    wake: { min: 150, max: 210 },
    feed: { min: h(3), max: h(4.5) },
    nap: { min: 45, max: 120 },
    bedtime: { min: at(18, 30), max: at(20) },
  },
  // 39–51 wk: 3.5–5 h, milk plus meals (AAP); bedtime 18:30–20:00 (AAP, Mindell 2010).
  {
    fromWeeks: 39,
    wake: { min: 180, max: 240 },
    feed: { min: h(3.5), max: h(5) },
    nap: { min: 60, max: 120 },
    bedtime: { min: at(18, 30), max: at(20) },
  },
  // 52–77 wk: meals and milk every 3–5 h (AAP toddler feeding); bedtime 18:30–20:00 (Mindell 2010).
  {
    fromWeeks: 52,
    wake: { min: 240, max: 330 },
    feed: { min: h(3), max: h(5) },
    nap: { min: 60, max: 150 },
    bedtime: { min: at(18, 30), max: at(20) },
  },
  // 78+ wk: meals and snacks every 3–5 h (AAP); bedtime 19:00–20:30 (Mindell 2010).
  {
    fromWeeks: 78,
    wake: { min: 300, max: 360 },
    feed: { min: h(3), max: h(5) },
    nap: { min: 60, max: 150 },
    bedtime: { min: at(19), max: at(20, 30) },
  },
];

export function bandFor(weeks: number): AgeBand {
  let band = AGE_BANDS[0];
  for (const candidate of AGE_BANDS) if (weeks >= candidate.fromWeeks) band = candidate;
  return band;
}

/** When personal medians replace the age band, and how wide the window is. */
export type SampleRule = {
  /** At least this many samples: personal median only. */
  personalMin: number;
  /** At least this many (and fewer than personalMin): blend with the band middle. */
  blendMin: number;
  /** Half-width of the window around the centre. */
  halfWidth: number;
};

export const RULES = {
  feed: { personalMin: 12, blendMin: 4, halfWidth: 20 },
  wake: { personalMin: 10, blendMin: 3, halfWidth: 15 },
  nap: { personalMin: 6, blendMin: 2, halfWidth: 20 },
  bedtime: { personalMin: 4, blendMin: 2, halfWidth: 30 },
} as const satisfies Record<string, SampleRule>;

export const HISTORY_DAYS = 7;
/** Feeds starting within this of a cluster's first feed are one feed (both sides, top-ups). */
export const FEED_CLUSTER_MIN = 45;
/** Longer feed gaps are missed logs, not intervals. */
export const FEED_INTERVAL_MAX = h(8);
/** Shorter wake gaps are a resettle, not a wake window. */
export const WAKE_WINDOW_MIN = 10;
/** Daytime, in local minutes: wake windows and naps only count when they start in it. */
export const DAY_START = at(6);
export const DAY_END = at(18);
export const NAP_LENGTH = { min: 10, max: h(4) } as const;
/** A night sleep starts 18:00–23:59 local and lasts at least this long. */
export const NIGHT_SLEEP_MIN = h(4);
export const ROUTINE_LEAD_MIN = 30;
