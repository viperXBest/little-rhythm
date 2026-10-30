// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/time-zone.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { asLanguageTag, languageTag } from './time-zone.ts';

Deno.test("the phone's language tag is sent only when it looks like BCP 47", () => {
  assertEquals(asLanguageTag('en-GB'), 'en-GB');
  assertEquals(asLanguageTag('ro-RO'), 'ro-RO');
  assertEquals(asLanguageTag('ro'), 'ro');
  assertEquals(asLanguageTag('zh-Hant-TW'), 'zh-Hant-TW');
  assertEquals(asLanguageTag('en_US'), 'en_US');
  assertEquals(asLanguageTag('en-US-u-ca-gregory-nu-latn-x-private1'), null); // 36 chars
  assertEquals(asLanguageTag(''), null);
  assertEquals(asLanguageTag('english'), null);
  assertEquals(asLanguageTag('en GB'), null);
  assertEquals(asLanguageTag(undefined), null);
  // The runtime's own locale passes the same check.
  const own = languageTag();
  assertEquals(own === null || asLanguageTag(own) === own, true);
});
