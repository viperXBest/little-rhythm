import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1.0.13";

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatCode,
  generateCode,
  hashCode,
  normalizeCode,
} from "./pair-code.ts";

Deno.test("generateCode returns 8 characters from the alphabet", () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateCode();
    assertEquals(code.length, CODE_LENGTH);
    for (const ch of code) assert(CODE_ALPHABET.includes(ch), `unexpected ${ch}`);
  }
});

Deno.test("generateCode does not repeat in practice", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(generateCode());
  assertEquals(seen.size, 5000);
});

Deno.test("alphabet has no look-alike characters", () => {
  for (const ch of "01OIL") assert(!CODE_ALPHABET.includes(ch));
  assertEquals(new Set(CODE_ALPHABET).size, CODE_ALPHABET.length);
});

Deno.test("normalizeCode accepts display form, lowercase and spaces", () => {
  assertEquals(normalizeCode("abcd-efgh"), "ABCDEFGH");
  assertEquals(normalizeCode(" AB CD EF GH "), "ABCDEFGH");
  assertEquals(normalizeCode(formatCode("23456789")), "23456789");
});

Deno.test("normalizeCode rejects wrong length and look-alikes", () => {
  assertEquals(normalizeCode("ABCDEFG"), null);
  assertEquals(normalizeCode("ABCDEFGHJ"), null);
  assertEquals(normalizeCode("ABCDEFG0"), null);
  assertEquals(normalizeCode("ABCDEFGI"), null);
  assertEquals(normalizeCode("ABCD'--"), null);
  assertEquals(normalizeCode(""), null);
});

Deno.test("hashCode is deterministic and depends on the pepper", async () => {
  const a = await hashCode("ABCDEFGH", "pepper-one-xxxxxxxxxxxxxxxxxxxxxxxx");
  const b = await hashCode("ABCDEFGH", "pepper-one-xxxxxxxxxxxxxxxxxxxxxxxx");
  const c = await hashCode("ABCDEFGH", "pepper-two-xxxxxxxxxxxxxxxxxxxxxxxx");
  assertEquals(a, b);
  assertNotEquals(a, c);
  assertEquals(a.length, 64);
  assert(!a.includes("ABCDEFGH"));
});
