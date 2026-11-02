/**
 * Presentational helpers for event rows (the Today timeline and the edit screen title).
 * Pure (no imports), so it runs under Deno.
 */

export type EventVisual = {
  icon: 'feed' | 'breastFeed' | 'sleep' | 'diaper';
  /** Soft disc / row fill token. */
  soft: 'feedSoft' | 'sleepSoft' | 'diaperSoft';
};

/** Icon and soft fill per event type; a breast feed gets the breast icon, any other feed the bottle. */
export function eventVisual(type: string, feedKind?: 'bottle' | 'breast' | null): EventVisual {
  if (type === 'sleep') return { icon: 'sleep', soft: 'sleepSoft' };
  if (type === 'diaper') return { icon: 'diaper', soft: 'diaperSoft' };
  return { icon: feedKind === 'breast' ? 'breastFeed' : 'feed', soft: 'feedSoft' };
}

/** The spoken label of a timeline row: the visible strings, in reading order. */
export function timelineRowLabel(title: string, time: string, byPartner: boolean): string {
  return byPartner ? `${title}, ${time}, by your partner` : `${title}, ${time}`;
}
