import { assertEquals } from "jsr:@std/assert@1.0.13";

import { parsePredictRequest } from "./request.ts";

function post(body: string, type = "application/json"): Request {
  return new Request("http://localhost/predict", { method: "POST", headers: { "Content-Type": type }, body });
}

Deno.test("an IANA zone is used when the runtime knows it", async () => {
  const result = await parsePredictRequest(
    post(JSON.stringify({ tz: "Europe/Bucharest", tz_offset_minutes: 120 })),
  );
  assertEquals(result, { ok: true, zone: { kind: "iana", name: "Europe/Bucharest" } });
});

Deno.test("an unknown zone falls back to the offset", async () => {
  const result = await parsePredictRequest(
    post(JSON.stringify({ tz: "Atlantis/Lost", tz_offset_minutes: 120 })),
  );
  assertEquals(result, { ok: true, zone: { kind: "offset", minutes: 120 } });
  const offsetOnly = await parsePredictRequest(post(JSON.stringify({ tz_offset_minutes: -300 })));
  assertEquals(offsetOnly, { ok: true, zone: { kind: "offset", minutes: -300 } });
});

Deno.test("no usable zone is a 400", async () => {
  assertEquals(await parsePredictRequest(post(JSON.stringify({ tz: "Atlantis/Lost" }))), {
    ok: false,
    status: 400,
    error: "invalid_time_zone",
  });
  assertEquals(await parsePredictRequest(post("{}")), { ok: false, status: 400, error: "invalid_time_zone" });
});

Deno.test("extra keys, bad types and bad JSON are rejected", async () => {
  const invalid = { ok: false, status: 400, error: "invalid_request" } as const;
  assertEquals(await parsePredictRequest(post(JSON.stringify({ tz: "UTC", baby_id: "x" }))), invalid);
  assertEquals(await parsePredictRequest(post(JSON.stringify({ tz_offset_minutes: 9999 }))), invalid);
  assertEquals(await parsePredictRequest(post(JSON.stringify({ tz: "x".repeat(65) }))), invalid);
  assertEquals(await parsePredictRequest(post("{not json")), invalid);
});

Deno.test("size and media type are capped", async () => {
  assertEquals(await parsePredictRequest(post(JSON.stringify({ tz: "UTC", pad: "x".repeat(2000) }))), {
    ok: false,
    status: 413,
    error: "too_large",
  });
  assertEquals(await parsePredictRequest(post("tz=UTC", "text/plain")), {
    ok: false,
    status: 415,
    error: "unsupported_media_type",
  });
});
