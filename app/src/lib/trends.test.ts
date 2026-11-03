// Run with Deno (the app has no JS test runner):
//   npx -y deno@2 test app/src/lib/trends.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
//
// Two kinds of calendar: the phone's local one (events built with the local Date constructor, so the
// tests pass in any host zone) and a fixed Europe/Bucharest one, to check the clock-change days.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  bottleText,
  buildTrends,
  type Calendar,
  countLabel,
  diapersText,
  feedsText,
  formatSleep,
  hasTrendData,
  localCalendar,
  niceMax,
  sleepHours,
  sleepText,
  type TrendEvent,
  trendsFromMs,
} from './trends.ts';

const HOUR = 60 * 60 * 1000;
const NB = ' ';

/** Wall-clock calendar of an IANA zone, from Intl: what the phone's Date does in that zone. */
function zoneCalendar(timeZone: string): Calendar {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  /** The zone's wall clock at `ms`, read as if it were UTC. */
  const wall = (ms: number): number => {
    const p = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, Number(part.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  };
  return {
    dateOf: (ms) => {
      const date = new Date(wall(ms));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
    },
    startOf: (year, month, day) => {
      const target = Date.UTC(year, month, day);
      // The instant whose wall clock reads `target`; two passes settle on the offset at that instant.
      let instant = target - (wall(target) - target);
      instant = target - (wall(instant) - instant);
      return instant;
    },
  };
}

const bucharest = zoneCalendar('Europe/Bucharest');

/** A local time in November 2026, as an ISO string (the local constructor keeps this zone-proof). */
const nov = (day: number, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const NOW = new Date(2026, 10, 3, 12, 0);

const bottle = (startedAt: string, ml: number): TrendEvent => ({
  type: 'feed',
  startedAt,
  endedAt: null,
  feed: { kind: 'bottle', ml },
  diaper: null,
});
const breast = (startedAt: string): TrendEvent => ({
  type: 'feed',
  startedAt,
  endedAt: null,
  feed: { kind: 'breast' },
  diaper: null,
});
const diaper = (startedAt: string, wet: boolean, dirty: boolean): TrendEvent => ({
  type: 'diaper',
  startedAt,
  endedAt: null,
  feed: null,
  diaper: { wet, dirty },
});
const sleep = (startedAt: string, endedAt: string | null): TrendEvent => ({
  type: 'sleep',
  startedAt,
  endedAt,
  feed: null,
  diaper: null,
});

Deno.test('seven days, oldest first, ending today, all zero when nothing is logged', () => {
  const days = buildTrends([], 7, NOW);
  assertEquals(days.map((d) => d.date), [
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
  ]);
  assertEquals(days.map((d) => d.isToday), [false, false, false, false, false, false, true]);
  for (const d of days) {
    assertEquals([d.feeds, d.bottleMl, d.sleepMs, d.diapers, d.wet, d.dirty], [0, 0, 0, 0, 0, 0]);
  }
  assertEquals(hasTrendData(days), false);
  assertEquals(buildTrends([], 14, NOW).length, 14);
});

Deno.test('days start and end at local midnight', () => {
  const days = buildTrends([], 7, NOW);
  const today = days[6];
  assertEquals(today.startMs, new Date(2026, 10, 3).getTime());
  assertEquals(today.endMs, new Date(2026, 10, 4).getTime());
  for (let i = 1; i < days.length; i++) assertEquals(days[i].startMs, days[i - 1].endMs);
});

Deno.test('bottle ml are totalled; breast feeds count as feeds with no ml', () => {
  const days = buildTrends(
    [bottle(nov(3, 6), 90), bottle(nov(3, 9, 30), 120), breast(nov(3, 11)), bottle(nov(2, 20), 60)],
    7,
    NOW,
  );
  assertEquals([days[6].feeds, days[6].bottleMl], [3, 210]);
  assertEquals([days[5].feeds, days[5].bottleMl], [1, 60]);
  assertEquals(hasTrendData(days), true);
});

Deno.test('a feed with unreadable details still counts, with no ml', () => {
  const broken: TrendEvent = { type: 'feed', startedAt: nov(3, 7), endedAt: null, feed: null, diaper: null };
  const days = buildTrends([broken], 7, NOW);
  assertEquals([days[6].feeds, days[6].bottleMl], [1, 0]);
});

Deno.test('a "both" diaper counts as wet and as dirty', () => {
  const days = buildTrends(
    [diaper(nov(3, 7), true, false), diaper(nov(3, 8), false, true), diaper(nov(3, 9), true, true)],
    7,
    NOW,
  );
  assertEquals([days[6].diapers, days[6].wet, days[6].dirty], [3, 2, 2]);
  assertEquals(diapersText(days[6]), `3${NB}diapers, 2${NB}wet, 2${NB}dirty`);
});

Deno.test('a diaper with unreadable details counts as a diaper, neither wet nor dirty', () => {
  const broken: TrendEvent = { type: 'diaper', startedAt: nov(3, 7), endedAt: null, feed: null, diaper: null };
  const days = buildTrends([broken], 7, NOW);
  assertEquals([days[6].diapers, days[6].wet, days[6].dirty], [1, 0, 0]);
});

Deno.test('a sleep across midnight is split between the two days', () => {
  const days = buildTrends([sleep(nov(2, 22), nov(3, 7))], 7, NOW);
  assertEquals(days[5].sleepMs, 2 * HOUR);
  assertEquals(days[6].sleepMs, 7 * HOUR);
  assertEquals(days[4].sleepMs, 0);
});

Deno.test('a sleep over several days fills the whole days between', () => {
  const days = buildTrends([sleep(nov(1, 20), nov(3, 6))], 7, NOW);
  assertEquals(days[4].sleepMs, 4 * HOUR); // Nov 1, 20:00 to midnight
  assertEquals(days[5].sleepMs, days[5].endMs - days[5].startMs); // all of Nov 2
  assertEquals(days[6].sleepMs, 6 * HOUR);
});

Deno.test('an open sleep counts up to now', () => {
  const days = buildTrends([sleep(nov(3, 9), null)], 7, NOW);
  assertEquals(days[6].sleepMs, 3 * HOUR);
  const overnight = buildTrends([sleep(nov(2, 23), null)], 7, NOW);
  assertEquals(overnight[5].sleepMs, 1 * HOUR);
  assertEquals(overnight[6].sleepMs, 12 * HOUR);
  // It grows with `now`: today is partial.
  assertEquals(buildTrends([sleep(nov(3, 9), null)], 7, new Date(2026, 10, 3, 13, 30))[6].sleepMs, 4.5 * HOUR);
});

Deno.test('a sleep that began before the first day counts only its part inside', () => {
  const days = buildTrends([sleep(nov(-4, 22), nov(-3, 6))], 7, NOW); // Oct 27 22:00 to Oct 28 06:00
  assertEquals(days[0].date, '2026-10-28');
  assertEquals(days[0].sleepMs, 6 * HOUR);
});

Deno.test('a sleep ending exactly at midnight adds nothing to the next day; a feed at midnight starts it', () => {
  const days = buildTrends([sleep(nov(2, 21), nov(3, 0)), bottle(nov(3, 0), 100)], 7, NOW);
  assertEquals(days[5].sleepMs, 3 * HOUR);
  assertEquals(days[6].sleepMs, 0);
  assertEquals([days[5].feeds, days[6].feeds], [0, 1]);
});

Deno.test('events outside the days, backwards sleeps and other types are ignored', () => {
  const days = buildTrends(
    [
      bottle(nov(-10, 12), 100), // before the first day
      bottle(nov(4, 1), 100), // after today
      sleep(nov(3, 8), nov(3, 7)), // ends before it starts
      sleep('not a date', nov(3, 7)),
      sleep(nov(3, 12, 30), null), // opens after "now": nothing yet
      { type: 'walk', startedAt: nov(3, 8), endedAt: null, feed: null, diaper: null },
    ],
    7,
    NOW,
  );
  assertEquals(hasTrendData(days), false);
});

Deno.test('the 7-day view is the last 7 days of the 14-day view', () => {
  const events = [bottle(nov(3, 6), 90), sleep(nov(2, 22), nov(3, 7)), diaper(nov(-2, 9), true, true)];
  const seven = buildTrends(events, 7, NOW);
  const fourteen = buildTrends(events, 14, NOW);
  assertEquals(fourteen.slice(7), seven);
  assertEquals(fourteen[0].date, '2026-10-21');
});

Deno.test('fetch lower bound: the first day plus a day of margin', () => {
  assertEquals(trendsFromMs(7, NOW), new Date(2026, 9, 28).getTime() - 24 * HOUR);
  assertEquals(trendsFromMs(14, NOW), new Date(2026, 9, 21).getTime() - 24 * HOUR);
});

// Europe/Bucharest: the clocks go back on the last Sunday of October (25 Oct 2026, 04:00 to 03:00),
// so that day has 25 hours, and forward on the last Sunday of March (29 Mar 2026, 03:00 to 04:00): 23.
const NOW_BUCHAREST = new Date('2026-10-26T10:00:00Z'); // 12:00 on Mon 26 Oct

Deno.test('Bucharest: the day the clocks go back is 25 hours, the one they go forward 23', () => {
  const autumn = buildTrends([], 7, NOW_BUCHAREST, bucharest);
  assertEquals(autumn.map((d) => d.date), [
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
    '2026-10-26',
  ]);
  assertEquals(autumn.map((d) => (d.endMs - d.startMs) / HOUR), [24, 24, 24, 24, 24, 25, 24]);
  assertEquals(new Date(autumn[5].startMs).toISOString(), '2026-10-24T21:00:00.000Z'); // 00:00 EEST
  assertEquals(new Date(autumn[6].startMs).toISOString(), '2026-10-25T22:00:00.000Z'); // 00:00 EET
  const spring = buildTrends([], 3, new Date('2026-03-30T10:00:00Z'), bucharest);
  assertEquals(spring.map((d) => (d.endMs - d.startMs) / HOUR), [24, 23, 24]);
});

Deno.test('Bucharest: today follows the zone, not UTC', () => {
  // 22:30 UTC on the 25th is 00:30 on the 26th in Bucharest.
  const days = buildTrends([], 1, new Date('2026-10-25T22:30:00Z'), bucharest);
  assertEquals(days[0].date, '2026-10-26');
});

Deno.test('Bucharest: a feed late on the 25-hour day stays on it', () => {
  const days = buildTrends(
    [
      bottle('2026-10-24T21:10:00Z', 100), // 00:10 EEST on the 25th
      bottle('2026-10-25T00:30:00Z', 100), // 03:30 EEST (the first 03:30)
      bottle('2026-10-25T01:30:00Z', 100), // 03:30 EET (the second 03:30)
      bottle('2026-10-25T21:30:00Z', 100), // 23:30 EET on the 25th: a +24 h day would end at 23:00
      bottle('2026-10-25T22:30:00Z', 70), // 00:30 EET on the 26th
    ],
    7,
    NOW_BUCHAREST,
    bucharest,
  );
  assertEquals([days[5].date, days[5].feeds, days[5].bottleMl], ['2026-10-25', 4, 400]);
  assertEquals([days[6].date, days[6].feeds, days[6].bottleMl], ['2026-10-26', 1, 70]);
});

Deno.test('Bucharest: sleeps across the extra hour use elapsed time', () => {
  const days = buildTrends(
    [
      sleep('2026-10-24T19:00:00Z', '2026-10-25T05:00:00Z'), // 22:00 EEST on the 24th to 07:00 EET: 10 h
      sleep('2026-10-25T20:00:00Z', '2026-10-26T04:00:00Z'), // 22:00 EET on the 25th to 06:00 on the 26th
    ],
    7,
    NOW_BUCHAREST,
    bucharest,
  );
  assertEquals(days[4].sleepMs, 2 * HOUR); // the 24th: 22:00 to midnight
  // The 25th: midnight to 07:00 is 8 h of elapsed time (wall clocks say 7), then 22:00 to midnight.
  assertEquals(days[5].sleepMs, 8 * HOUR + 2 * HOUR);
  assertEquals(days[6].sleepMs, 6 * HOUR);
  assertEquals(days[4].sleepMs + 8 * HOUR, 10 * HOUR);
});

Deno.test('Bucharest: a sleep across the spring change loses the hour that does not exist', () => {
  const days = buildTrends(
    [sleep('2026-03-28T20:00:00Z', '2026-03-29T05:00:00Z')], // 22:00 EET on the 28th to 08:00 EEST
    3,
    new Date('2026-03-29T12:00:00Z'),
    bucharest,
  );
  assertEquals(days.map((d) => d.date), ['2026-03-27', '2026-03-28', '2026-03-29']);
  assertEquals(days[1].sleepMs, 2 * HOUR);
  assertEquals(days[2].sleepMs, 7 * HOUR); // midnight to 08:00 on the clock, 7 h elapsed
});

Deno.test('Bucharest: the fetch lower bound is a day before the first day starts', () => {
  assertEquals(new Date(trendsFromMs(7, NOW_BUCHAREST, bucharest)).toISOString(), '2026-10-18T21:00:00.000Z');
});

Deno.test('local calendar: out-of-range days roll over into the previous month and year', () => {
  const days = buildTrends([], 14, new Date(2027, 0, 3, 12), localCalendar);
  assertEquals(days[0].date, '2026-12-21');
  assertEquals(days[13].date, '2027-01-03');
});

Deno.test('sleep is shown as hours and minutes, rounded to the minute', () => {
  assertEquals(formatSleep((13 * 60 + 20) * 60_000), `13${NB}h 20${NB}min`);
  assertEquals(formatSleep(45 * 60_000), `45${NB}min`);
  assertEquals(formatSleep(2 * HOUR), `2${NB}h 0${NB}min`);
  assertEquals(formatSleep(0), `0${NB}min`);
  assertEquals(formatSleep(59.6 * 60_000), `1${NB}h 0${NB}min`);
  assertEquals(formatSleep(-5), `0${NB}min`);
});

Deno.test('counts and totals read as plain numbers with units', () => {
  const days = buildTrends([bottle(nov(3, 6), 640), bottle(nov(3, 9), 5)], 7, NOW);
  assertEquals(feedsText(days[6]), `2${NB}feeds`);
  assertEquals(bottleText(days[6]), `645${NB}ml`);
  assertEquals(sleepText(days[6]), `0${NB}min`);
  assertEquals(countLabel(1, 'feed'), `1${NB}feed`);
  assertEquals(countLabel(0, 'diaper'), `0${NB}diapers`);
});

Deno.test('sleepHours converts ms to hours', () => {
  assertEquals(sleepHours(90 * 60_000), 1.5);
});

Deno.test('niceMax rounds a chart top up to a round number', () => {
  assertEquals(niceMax(0), 1);
  assertEquals(niceMax(-3), 1);
  assertEquals(niceMax(Number.NaN), 1);
  assertEquals(niceMax(1), 1);
  assertEquals(niceMax(7), 8);
  assertEquals(niceMax(12), 12);
  assertEquals(niceMax(13), 15);
  assertEquals(niceMax(14), 15);
  assertEquals(niceMax(16), 20);
  assertEquals(niceMax(640), 800);
  assertEquals(niceMax(800), 800);
  assertEquals(niceMax(1001), 1200);
  assertEquals(niceMax(13.3), 15);
  assertEquals(niceMax(0.5), 0.5);
});
