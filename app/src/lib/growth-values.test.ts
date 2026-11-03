// Run with Deno (the app has no JS test runner):
//   npx -y deno@2 test app/src/lib/growth-values.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  chartAltText,
  chartPoints,
  dayNumber,
  formatValue,
  formatWithUnit,
  GROWTH_SPECS,
  layoutChart,
  newestFirst,
  parseValue,
  validateMeasuredOn,
  yDomain,
  type ChartBox,
} from './growth-values.ts';

const NBSP = ' ';

Deno.test('weight shows kg with up to two decimals, trailing zeros dropped', () => {
  assertEquals(formatValue('weight', 4250), '4.25');
  assertEquals(formatValue('weight', 4200), '4.2');
  assertEquals(formatValue('weight', 4000), '4');
  assertEquals(formatValue('weight', 300), '0.3');
  assertEquals(formatValue('weight', 30000), '30');
  assertEquals(formatValue('weight', 4005), '4.01'); // 4005 g rounds to the 10 g step shown
  assertEquals(formatWithUnit('weight', 4250), `4.25${NBSP}kg`);
});

Deno.test('length and head show cm with exactly one decimal', () => {
  assertEquals(formatValue('length', 543), '54.3');
  assertEquals(formatValue('length', 540), '54.0');
  assertEquals(formatValue('head', 1200), '120.0');
  assertEquals(formatValue('head', 150), '15.0');
  assertEquals(formatWithUnit('head', 365), `36.5${NBSP}cm`);
});

Deno.test('input in kg or cm becomes grams or millimetres, with a dot or a comma', () => {
  assertEquals(parseValue('weight', '4.25'), { ok: true, value: 4250 });
  assertEquals(parseValue('weight', '4,25'), { ok: true, value: 4250 });
  assertEquals(parseValue('weight', ' 4 '), { ok: true, value: 4000 });
  assertEquals(parseValue('weight', '4.2'), { ok: true, value: 4200 });
  assertEquals(parseValue('weight', '.5'), { ok: true, value: 500 });
  assertEquals(parseValue('weight', '4.'), { ok: true, value: 4000 });
  assertEquals(parseValue('length', '54.5'), { ok: true, value: 545 });
  assertEquals(parseValue('length', '54'), { ok: true, value: 540 });
  assertEquals(parseValue('head', '36,5'), { ok: true, value: 365 });
});

Deno.test('parsing is integer arithmetic: 4.35 kg is exactly 4350 g', () => {
  // 4.35 * 1000 is 4349.999... in floating point.
  assertEquals(parseValue('weight', '4.35'), { ok: true, value: 4350 });
  assertEquals(parseValue('weight', '1.15'), { ok: true, value: 1150 });
  assertEquals(parseValue('length', '57.3'), { ok: true, value: 573 });
});

Deno.test('input that is not a number, or has too many decimals, gets a message', () => {
  for (const text of ['', '   ', 'abc', '4.2.5', '-4', '4 kg', '1e3', '.', ',']) {
    const result = parseValue('weight', text);
    assert(!result.ok, `"${text}" is refused`);
  }
  const tooMany = parseValue('weight', '4.255');
  assertEquals(tooMany, { ok: false, message: 'Use at most 2 decimals.' });
  assertEquals(parseValue('length', '54.55'), { ok: false, message: 'Use at most 1 decimal.' });
  assertEquals(parseValue('head', 'x'), { ok: false, message: 'Enter a number, like 36.5.' });
});

Deno.test('the typo guards match the database bounds, in the unit shown', () => {
  assertEquals(GROWTH_SPECS.weight.min, 300);
  assertEquals(GROWTH_SPECS.weight.max, 30000);
  assertEquals(GROWTH_SPECS.length.min, 200);
  assertEquals(GROWTH_SPECS.length.max, 1200);
  assertEquals(GROWTH_SPECS.head.min, 150);
  assertEquals(GROWTH_SPECS.head.max, 600);

  assertEquals(parseValue('weight', '0.3'), { ok: true, value: 300 });
  assertEquals(parseValue('weight', '30'), { ok: true, value: 30000 });
  assertEquals(parseValue('length', '20'), { ok: true, value: 200 });
  assertEquals(parseValue('length', '120'), { ok: true, value: 1200 });
  assertEquals(parseValue('head', '15'), { ok: true, value: 150 });
  assertEquals(parseValue('head', '60'), { ok: true, value: 600 });

  assertEquals(parseValue('weight', '0.29'), {
    ok: false,
    message: `Enter a weight between 0.3 and 30${NBSP}kg.`,
  });
  assert(!parseValue('weight', '30.01').ok);
  assert(!parseValue('weight', '425').ok, 'grams typed into the kg field');
  assert(!parseValue('length', '19.9').ok);
  assert(!parseValue('length', '120.1').ok);
  assert(!parseValue('head', '14.9').ok);
  assert(!parseValue('head', '60.1').ok);
  // Three digits before the point is the most the field takes.
  assert(!parseValue('length', '1200').ok);
});

Deno.test('no message talks about the numbers being good or bad', () => {
  const banned = /healthy|normal|on track|low|high|average|percentile/i;
  const messages = [
    ...['', 'abc', '4.255', '0.1', '99'].map((text) => parseValue('weight', text)),
    ...['', 'abc', '54.55', '1', '999'].map((text) => parseValue('length', text)),
    ...['', 'abc', '36.55', '1', '999'].map((text) => parseValue('head', text)),
  ].flatMap((result) => (result.ok ? [] : [result.message]));
  assert(messages.length > 0);
  for (const message of messages) assert(!banned.test(message), message);
  for (
    const message of [
      validateMeasuredOn('2026-11-04', '2026-09-01', '2026-11-03'),
      validateMeasuredOn('2026-08-31', '2026-09-01', '2026-11-03'),
      validateMeasuredOn('nope', '2026-09-01', '2026-11-03'),
    ]
  ) {
    assert(message !== null && !banned.test(message), String(message));
  }
});

Deno.test('dates are real days', () => {
  assertEquals(dayNumber('1970-01-02'), 1);
  assertEquals(dayNumber('2026-02-30'), null);
  assertEquals(dayNumber('2026-13-01'), null);
  assertEquals(dayNumber('26-01-01'), null);
  assertEquals(dayNumber('2026-11-03')! - dayNumber('2026-11-01')!, 2);
});

Deno.test('the date runs from the birth date to today, the phone\'s calendar', () => {
  const birth = '2026-09-01';
  const today = '2026-11-03';
  assertEquals(validateMeasuredOn('2026-11-03', birth, today), null);
  assertEquals(validateMeasuredOn('2026-09-01', birth, today), null);
  assertEquals(validateMeasuredOn('2026-10-15', birth, today), null);
  assertEquals(validateMeasuredOn('2026-11-04', birth, today), 'The date can’t be in the future.');
  assertEquals(validateMeasuredOn('2026-08-31', birth, today), 'The date can’t be before the birth date.');
  assertEquals(validateMeasuredOn('2026-02-30', birth, today), 'Choose a date.');
});

const rows = [
  { id: 'c', kind: 'weight', value: 5100, measured_on: '2026-11-03', created_at: '2026-11-03T08:00:00Z' },
  { id: 'a', kind: 'weight', value: 3400, measured_on: '2026-09-12', created_at: '2026-09-12T08:00:00Z' },
  { id: 'x', kind: 'length', value: 540, measured_on: '2026-10-01', created_at: '2026-10-01T08:00:00Z' },
  { id: 'b', kind: 'weight', value: 4300, measured_on: '2026-10-10', created_at: '2026-10-10T08:00:00Z' },
  { id: 'bad', kind: 'weight', value: 4000, measured_on: '2026-02-30', created_at: '2026-10-10T09:00:00Z' },
];

Deno.test('chart points are one kind, oldest first, without unreadable dates', () => {
  const points = chartPoints(rows, 'weight');
  assertEquals(points.map((p) => p.id), ['a', 'b', 'c']);
  assertEquals(points.map((p) => p.value), [3400, 4300, 5100]);
  assertEquals(points[0].date, '2026-09-12');
  assertEquals(chartPoints(rows, 'head'), []);
});

Deno.test('the list is one kind, newest first; the same day goes by when it was logged', () => {
  // The row with an impossible date can't come from the database; it only shows the sort is by string.
  assertEquals(newestFirst(rows, 'weight').map((r) => r.id), ['c', 'b', 'a', 'bad']);
  const sameDay = [
    { id: '1', kind: 'head', value: 360, measured_on: '2026-10-01', created_at: '2026-10-01T08:00:00Z' },
    { id: '2', kind: 'head', value: 362, measured_on: '2026-10-01', created_at: '2026-10-01T09:00:00Z' },
  ];
  assertEquals(newestFirst(sameDay, 'head').map((r) => r.id), ['2', '1']);
  assertEquals(chartPoints(sameDay, 'head').map((p) => p.id), ['1', '2']);
});

Deno.test('the vertical range is a round step around the data; one value sits in the middle', () => {
  assertEquals(yDomain([3400, 5100]), { min: 3000, max: 5500 });
  assertEquals(yDomain([540, 573]), { min: 540, max: 580 });
  assertEquals(yDomain([4000]), { min: 3800, max: 4200 });
  assertEquals(yDomain([540]), { min: 490, max: 590 });
  const single = yDomain([4000]);
  assert(single.min < 4000 && single.max > 4000);
  assertEquals((single.min + single.max) / 2, 4000);
  const same = yDomain([365, 365]);
  assertEquals((same.min + same.max) / 2, 365);
});

const box: ChartBox = { width: 300, height: 180, left: 12, right: 12, top: 12, bottom: 12 };

Deno.test('chart layout: time along x, value along y, inside the box', () => {
  const points = chartPoints(rows, 'weight');
  const layout = layoutChart(points, box);
  assertEquals(layout.dots.length, 3);
  // First and last points sit at the left and right edges of the plot.
  assertEquals(layout.dots[0].x, 12);
  assertEquals(layout.dots[2].x, 288);
  // 12 Sep to 10 Oct is 28 of the 52 days between 12 Sep and 3 Nov.
  assertEquals(layout.dots[1].x, Math.round((12 + (28 / 52) * 276) * 10) / 10);
  // A bigger value is higher up (smaller y).
  assert(layout.dots[0].y > layout.dots[1].y && layout.dots[1].y > layout.dots[2].y);
  for (const dot of layout.dots) {
    assert(dot.y >= layout.yTop && dot.y <= layout.yBottom, `${dot.y} inside the plot`);
    assert(dot.x >= 12 && dot.x <= 288);
  }
  assert(layout.yMin <= 3400 && layout.yMax >= 5100);
  assert(layout.path.startsWith('M12 '));
  assertEquals(layout.path.split('L').length, 3);
});

Deno.test('chart layout: a single point is centred and has no line', () => {
  const layout = layoutChart(chartPoints(rows, 'length'), box);
  assertEquals(layout.dots.length, 1);
  assertEquals(layout.dots[0].x, 150);
  assertEquals(layout.dots[0].y, (12 + 168) / 2);
  assertEquals(layout.path, '');
});

Deno.test('chart layout: two measurements on one day stack at the same x', () => {
  const sameDay = [
    { id: '1', kind: 'head', value: 360, measured_on: '2026-10-01', created_at: '2026-10-01T08:00:00Z' },
    { id: '2', kind: 'head', value: 362, measured_on: '2026-10-01', created_at: '2026-10-01T09:00:00Z' },
  ];
  const layout = layoutChart(chartPoints(sameDay, 'head'), box);
  assertEquals(layout.dots.map((d) => d.x), [150, 150]);
});

Deno.test('the text alternative gives the count, the first and the latest value, and no verdict', () => {
  const date = (iso: string) => iso;
  const points = chartPoints(rows, 'weight');
  assertEquals(
    chartAltText('weight', points, date),
    `Weight chart: 3 measurements. First: 3.4${NBSP}kg on 2026-09-12. Latest: 5.1${NBSP}kg on 2026-11-03.`,
  );
  assertEquals(
    chartAltText('length', chartPoints(rows, 'length'), date),
    `Length chart: 1 measurement, 54.0${NBSP}cm on 2026-10-01.`,
  );
  assertEquals(chartAltText('head', [], date), 'Head circumference chart: no measurements yet.');
  const banned = /healthy|normal|on track|low|high|average|percentile|gain|grow/i;
  for (const text of [chartAltText('weight', points, date), chartAltText('head', [], date)]) {
    assert(!banned.test(text), text);
  }
});
