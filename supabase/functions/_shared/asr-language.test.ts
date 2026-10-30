import { assertEquals } from "jsr:@std/assert@1.0.13";

import { languageBias } from "./asr-language.ts";

Deno.test("languageBias: supported phone languages by name, everything else English", () => {
  assertEquals(languageBias("en-GB"), ["English"]);
  assertEquals(languageBias("fr_FR"), ["French"]);
  assertEquals(languageBias("zh-Hans-CN"), ["Mandarin Chinese"]);
  assertEquals(languageBias("iw-IL"), ["Hebrew"]);
  // Romanian isn't supported by the model; older apps send nothing.
  assertEquals(languageBias("ro-RO"), ["English"]);
  assertEquals(languageBias(undefined), ["English"]);
  assertEquals(languageBias(""), ["English"]);
});
