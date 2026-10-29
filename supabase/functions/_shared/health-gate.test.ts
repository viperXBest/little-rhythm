import { assertEquals } from "jsr:@std/assert@1.0.13";

import {
  applyHealthGate,
  CLASSIFIER_PROMPT,
  type ClassifierMessage,
  type ClassifyCall,
  classifyHealth,
  REFERRAL_SENTENCE,
} from "./health-gate.ts";
import { keywordHit, normalise } from "./health-keywords.ts";

const NONE = { health: false, urgent: false };
const HEALTH = { health: true, urgent: false };
const URGENT = { health: true, urgent: true };

Deno.test("keywords: English and Romanian health questions hit, with or without diacritics", () => {
  for (
    const text of [
      "she has a fever, is that ok?",
      "Her temperature is 38.2",
      "she's 37,9 C after the bath",
      "how much Calpol can I give her",
      "what dose of paracetamol for a 3 month old",
      "she drank 90 ml at 3 and then vomited",
      "is this rash something to worry about",
      "she won't feed since this morning",
      "Are 5mg too much?",
      "Are febră de aseară",
      "Are febra de aseara",
      "a vărsat tot laptele și are diaree",
      "a varsat tot laptele",
      "ce doză de Nurofen îi dau?",
      "nu mănâncă deloc azi",
      "are sânge în scutec",
      "o doare burtica",
      "should I call the doctor",
      "trebuie să merg la pediatru?",
    ]
  ) {
    assertEquals(keywordHit(text).health, true, text);
  }
});

Deno.test("keywords: emergency signs are urgent", () => {
  for (
    const text of [
      "she's not breathing properly",
      "her lips look blue",
      "I think he's having a seizure",
      "she's floppy and won't wake",
      "he choked on the bottle",
      "nu respiră!",
      "are buzele vinete",
      "face convulsii",
      "a căzut din pat",
      "a căzut de pe canapea",
      "a înghițit o baterie",
    ]
  ) {
    assertEquals(keywordHit(text), URGENT, text);
  }
});

Deno.test("keywords: ordinary logs do not hit (known false-positive traps)", () => {
  for (
    const text of [
      "ill feed her at 3",
      "o vom culca la 8",
      "pe 3 februarie a dormit bine",
      "laptele s-a răcit, i-am dat 90 ml",
      "a căzut lată la 8",
      "she had cold milk at 3",
      "she drank 112 ml",
      "ce vârstă are pentru program?",
      "she drank 90 ml at 3, she's asleep now",
      "wet and dirty diaper just now",
      "left side 15 minutes at 2:30",
      "why is she so fussy tonight?",
      "when is her next nap?",
      "a dormit 2 ore, acum mănâncă 120 ml",
      "she spit up a bit after the feed",
      "I'll feed her at 3",
    ]
  ) {
    assertEquals(keywordHit(text), NONE, text);
  }
});

Deno.test("normalise strips Romanian diacritics and curly apostrophes", () => {
  assertEquals(normalise("ĂîâșțȘȚ  febră"), "aiastst febra");
  assertEquals(normalise("She won’t  WAKE"), "she won't wake");
});

Deno.test("gate: a keyword hit alone escalates", () => {
  assertEquals(applyHealthGate({ keyword: HEALTH, classifier: NONE, caption: "Proposed a feed." }), {
    urgent: false,
  });
  assertEquals(applyHealthGate({ keyword: URGENT, classifier: NONE, caption: null }), { urgent: true });
});

Deno.test("gate: a classifier hit alone escalates", () => {
  assertEquals(applyHealthGate({ keyword: NONE, classifier: HEALTH, caption: "Her next feed is 15:00." }), {
    urgent: false,
  });
  assertEquals(applyHealthGate({ keyword: NONE, classifier: URGENT, caption: null }), { urgent: true });
});

Deno.test("gate: urgent from either side wins", () => {
  assertEquals(applyHealthGate({ keyword: URGENT, classifier: HEALTH, caption: null }), { urgent: true });
  assertEquals(applyHealthGate({ keyword: HEALTH, classifier: URGENT, caption: null }), { urgent: true });
});

Deno.test("gate: classifier error with no keyword hit gives the normal reply", () => {
  assertEquals(applyHealthGate({ keyword: NONE, classifier: null, caption: "Proposed a feed." }), null);
});

Deno.test("gate: classifier error with a keyword hit still escalates", () => {
  assertEquals(applyHealthGate({ keyword: HEALTH, classifier: null, caption: null }), { urgent: false });
  assertEquals(applyHealthGate({ keyword: URGENT, classifier: null, caption: null }), { urgent: true });
});

Deno.test("gate: the agent's own referral sentence escalates", () => {
  const caption = `${REFERRAL_SENTENCE} Please call your paediatrician, or 112 in an emergency.`;
  assertEquals(applyHealthGate({ keyword: NONE, classifier: NONE, caption }), { urgent: false });
  assertEquals(applyHealthGate({ keyword: NONE, classifier: NONE, caption: "Proposed a feed." }), null);
});

Deno.test("classifier: sends the fixed prompt and the fenced text, parses strict JSON", async () => {
  const seen: ClassifierMessage[][] = [];
  const call: ClassifyCall = (messages) => {
    seen.push(messages);
    return Promise.resolve('{"health": true, "urgent": false}');
  };
  assertEquals(await classifyHealth("she feels hot", 6, call), HEALTH);
  assertEquals(seen[0][0], { role: "system", content: CLASSIFIER_PROMPT });
  assertEquals(seen[0][1].content, "Baby age: 6 weeks.\nParent's message:\n<<<\nshe feels hot\n>>>");
});

Deno.test("classifier request: the baby's age line and the message, no name or ids", async () => {
  const seen: ClassifierMessage[][] = [];
  const call: ClassifyCall = (messages) => {
    seen.push(messages);
    return Promise.resolve('{"health": true, "urgent": true}');
  };
  await classifyHealth("she feels hot, 38.1", 9, call);
  // Only the fixed system prompt and one user message: nothing else about the family.
  assertEquals(seen[0].length, 2);
  assertEquals(seen[0][0].content, CLASSIFIER_PROMPT);
  assertEquals(seen[0][1], {
    role: "user",
    content: "Baby age: 9 weeks.\nParent's message:\n<<<\nshe feels hot, 38.1\n>>>",
  });
  // classifyHealth takes no name, id or family argument, so none can be sent.
  assertEquals(classifyHealth.length, 3);
});

Deno.test("classifier prompt lists the widened emergencies", () => {
  for (
    const phrase of [
      "doesn't fade when pressed",
      "feeling hot in a baby under 13 weeks old",
      "swelling of the lips, face or tongue, or a sudden allergic reaction",
      "a bulging soft spot (fontanelle)",
      "green or bloody vomit, or vomiting with a swollen belly",
    ]
  ) {
    assertEquals(CLASSIFIER_PROMPT.includes(phrase), true, phrase);
  }
});

Deno.test("classifier prompt: sleep slang, tired parents and 'is this normal' about sleep are not health", () => {
  for (
    const phrase of [
      `"a căzut lată/lat", "a picat lată/lat" (fell asleep) and "o vom culca"`,
      `"is this normal?" about sleep, naps, night waking or fussiness when no symptom is mentioned`,
      "a parent saying they are tired or exhausted while asking about the log",
      "whether to wake the baby to feed, or whether a feed amount or interval is enough",
      "can't cope, feel hopeless or low, or are scared of their own thoughts",
      "a thought of harming oneself or the baby",
    ]
  ) {
    assertEquals(CLASSIFIER_PROMPT.includes(phrase), true, phrase);
  }
});

Deno.test("classifier: urgent implies health", async () => {
  assertEquals(
    await classifyHealth("x", 20, () => Promise.resolve('{"health": false, "urgent": true}')),
    URGENT,
  );
});

Deno.test("classifier: any failure is null, never a throw", async () => {
  const cases: ClassifyCall[] = [
    () => Promise.reject(new Error("timeout")),
    () => Promise.resolve(null),
    () => Promise.resolve("not json"),
    () => Promise.resolve('{"health": "yes", "urgent": false}'),
    () => Promise.resolve('{"health": true, "urgent": false, "advice": "give calpol"}'),
  ];
  for (const call of cases) assertEquals(await classifyHealth("x", 20, call), null);
});
