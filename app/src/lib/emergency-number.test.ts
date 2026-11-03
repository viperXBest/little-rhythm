// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/emergency-number.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { emergencyNumber } from './emergency-number.ts';

Deno.test('112 by default: the EU, unknown zones and no zone at all', () => {
  for (const zone of ['Europe/Bucharest', 'Europe/Berlin', 'Europe/Dublin', 'Asia/Tokyo', 'UTC', 'Nowhere/Else', '']) {
    assertEquals(emergencyNumber(zone), '112', zone);
  }
  assertEquals(emergencyNumber(null), '112');
  assertEquals(emergencyNumber(undefined), '112');
});

Deno.test('911 in the US and Canada, including the nested and legacy zones', () => {
  for (
    const zone of [
      'America/New_York',
      'America/Los_Angeles',
      'Pacific/Honolulu',
      'America/Indiana/Indianapolis',
      'America/Kentucky/Louisville',
      'US/Eastern',
      'America/Toronto',
      'America/Vancouver',
      'America/St_Johns',
      'Canada/Pacific',
    ]
  ) {
    assertEquals(emergencyNumber(zone), '911', zone);
  }
});

Deno.test('999 in the UK and the Crown Dependencies', () => {
  for (const zone of ['Europe/London', 'Europe/Jersey', 'Europe/Isle_of_Man', 'GB']) {
    assertEquals(emergencyNumber(zone), '999', zone);
  }
});

Deno.test('other American zones are not assumed to be 911', () => {
  for (const zone of ['America/Sao_Paulo', 'America/Mexico_City', 'America/Argentina/Buenos_Aires']) {
    assertEquals(emergencyNumber(zone), '112', zone);
  }
});
