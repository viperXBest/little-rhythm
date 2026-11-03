// Health keywords, English and Romanian: the deterministic half of the health
// gate (health-gate.ts). A hit means the turn gets the escalation card and no
// model text. Patterns run on normalised text (no diacritics, lower case), so
// "febră" and "febra" match alike.
//
// Kept out on purpose, because they fire on ordinary logs (left to the
// classifier): "ill" ("ill feed her at 3"), "cold" (cold milk), "racit"
// ("laptele s-a racit"), bare "112" ("112 ml"), "hot", "moale" (soft poo),
// stems "vom" ("o vom culca"), "febr" ("februarie"), "vars" ("varsta" = age),
// and a bare "a cazut" ("a cazut lata" = fell asleep).

export type KeywordVerdict = { health: boolean; urgent: boolean };

/** Possible emergencies. A hit here is also a health hit. */
const URGENT: readonly string[] = [
  // English
  String.raw`not breathing`,
  String.raw`stopped breathing`,
  String.raw`(?:can'?t|cannot) breathe`,
  String.raw`struggling to breathe`,
  String.raw`blue lips`,
  String.raw`lips (?:are|look|looks|turned|going|turning) blue`,
  String.raw`turning blue`,
  String.raw`(?:grey|gray) (?:lips|skin)`,
  String.raw`seizure\w*`,
  String.raw`seizing`,
  String.raw`convuls\w*`,
  String.raw`unresponsive`,
  String.raw`(?:won'?t|can'?t|cannot) wake`,
  String.raw`floppy`,
  String.raw`limp`,
  String.raw`chok(?:e|es|ed|ing)`,
  String.raw`swallowed (?:a|an|something|battery|button|coin|magnet)`,
  String.raw`poison\w*`,
  String.raw`fell off`,
  String.raw`hit (?:her|his|the|their) head`,
  String.raw`bleeding heavily`,
  String.raw`call (?:112|911|999)`,
  String.raw`ambulance`,
  // Romanian
  String.raw`nu (?:mai )?respira`,
  String.raw`respira greu`,
  String.raw`se sufoca`,
  String.raw`sufocat\w*`,
  String.raw`buze(?:le)? (?:vinete|albastre|gri)`,
  String.raw`invinet\w*`,
  String.raw`vinet\w*`,
  String.raw`convulsi\w*`,
  String.raw`nu reactioneaza`,
  String.raw`nu se trezeste`,
  String.raw`se ineaca`,
  String.raw`s-a inecat`,
  String.raw`a cazut (?:din|de pe|jos|pe)`,
  String.raw`s-a lovit la cap`,
  String.raw`a inghitit (?:o|un|ceva|baterie|moneda|nasture|magnet)`,
  String.raw`otravit\w*`,
  String.raw`intoxica\w*`,
  String.raw`ambulant\w*`,
  String.raw`sun la 112`,
];

/** Symptoms, care, medicine and doses. */
const HEALTH: readonly string[] = [
  // English: symptoms
  String.raw`fever\w*`,
  String.raw`temperatur\w*`,
  String.raw`temp`,
  String.raw`breath\w*`,
  String.raw`wheez\w*`,
  String.raw`cough\w*`,
  String.raw`runny nose`,
  String.raw`congest\w*`,
  String.raw`rash\w*`,
  String.raw`eczem\w*`,
  String.raw`hives`,
  String.raw`jaundice\w*`,
  String.raw`yellow (?:skin|eyes)`,
  String.raw`vomit\w*`,
  String.raw`thr(?:ew|ow|ows|owing) up`,
  String.raw`projectile`,
  String.raw`blood\w*`,
  String.raw`diarrh\w*`,
  String.raw`constipat\w*`,
  String.raw`dehydrat\w*`,
  String.raw`no wet (?:diapers?|napp(?:y|ies))`,
  String.raw`not (?:feeding|eating)`,
  String.raw`won'?t (?:feed|eat)`,
  String.raw`refus(?:es|ing|ed) (?:to feed|to eat|the bottle|the breast)`,
  // Waking to feed is a feeding-interval question. Waking from a nap to protect
  // the night ("wake her from her nap so she sleeps tonight") is not matched.
  String.raw`wake (?:her|him|the baby)(?: up)? (?:to|for) (?:feed|a feed|eat)`,
  String.raw`letharg\w*`,
  String.raw`sick\w*`,
  String.raw`illness`,
  String.raw`infect\w*`,
  String.raw`pain(?:ful)?`,
  String.raw`hurt\w*`,
  String.raw`colic\w*`,
  String.raw`reflux`,
  String.raw`ear ?ache`,
  String.raw`swollen`,
  String.raw`swelling`,
  String.raw`lump`,
  String.raw`allerg\w*`,
  String.raw`symptom\w*`,
  String.raw`diagnos\w*`,
  String.raw`(?:under)?weight`,
  // English: care
  String.raw`doctor\w*`,
  String.raw`paediatr\w*`,
  String.raw`pediatr\w*`,
  String.raw`hospital\w*`,
  String.raw`emergenc\w*`,
  String.raw`a&e`,
  // English: medicine and doses
  String.raw`medic\w*`,
  String.raw`meds`,
  String.raw`dos(?:e|es|age|ing)`,
  String.raw`mg`,
  String.raw`\d+ ?mg`,
  String.raw`paracetamol`,
  String.raw`acetaminophen`,
  String.raw`ibuprofen`,
  String.raw`calpol`,
  String.raw`nurofen`,
  String.raw`tylenol`,
  String.raw`motrin`,
  String.raw`panadol`,
  String.raw`antibiotic\w*`,
  String.raw`suppositor\w*`,
  String.raw`(?:eye|ear|nose|vitamin d|vitamin) drops`,
  String.raw`vitamin d`,
  String.raw`gripe water`,
  String.raw`infacol`,
  String.raw`simethicone`,
  String.raw`vaccin\w*`,
  // Romanian: symptoms
  String.raw`febra`,
  String.raw`febril\w*`,
  String.raw`respir\w*`,
  String.raw`tus\w*`,
  String.raw`muci`,
  String.raw`nas infundat`,
  String.raw`raceal\w*`,
  String.raw`eruptie`,
  String.raw`iritatie`,
  String.raw`bubite`,
  String.raw`pete rosii`,
  String.raw`icter\w*`,
  String.raw`voma`,
  String.raw`vome`,
  String.raw`varsa`,
  String.raw`varsat`,
  String.raw`varsatur[ai]`,
  String.raw`sange`,
  String.raw`sanger\w*`,
  String.raw`diaree`,
  String.raw`deshidrat\w*`,
  String.raw`nu mananca`,
  String.raw`nu vrea sa manance`,
  String.raw`nu suge`,
  String.raw`refuza (?:sanul|biberonul|sa manance)`,
  // Normalised forms of "s-o / să o / să-l trezim să mănânce / sugă" and "trezesc să mănânce".
  String.raw`(?:s-o|sa o|s-il|sa il|sa-l) trezim sa (?:manance|suga)`,
  String.raw`trezesc sa manance`,
  String.raw`letargic\w*`,
  String.raw`apatic\w*`,
  String.raw`bolnav\w*`,
  String.raw`boala`,
  String.raw`infectie`,
  String.raw`durer\w*`,
  String.raw`doare`,
  String.raw`otit\w*`,
  String.raw`umfl\w*`,
  String.raw`alergi\w*`,
  String.raw`simptom\w*`,
  String.raw`diagnost\w*`,
  // Romanian: care (doctor, medic*, urgent* covered above or here)
  String.raw`spital\w*`,
  String.raw`urgent\w*`,
  // Romanian: medicine and doses
  String.raw`doz(?:a|e|aj)`,
  String.raw`supozitor\w*`,
  String.raw`picaturi`,
  String.raw`sirop\w*`,
  String.raw`vitamina d`,
  String.raw`espumisan`,
];

// \b on both sides, on ASCII text after normalise(). "a&e" ends in a word
// character, so the trailing \b still applies.
const compile = (patterns: readonly string[]) => new RegExp(String.raw`\b(?:${patterns.join("|")})\b`);
const URGENT_RE = compile(URGENT);
const HEALTH_RE = compile(HEALTH);
// A body temperature ("38.2", "37,8 C", "39°"). Separate because "°" is not a
// word character, so the shared trailing \b would not match after it.
const TEMPERATURE_RE = /\b3[6-9](?:[.,]\d)? ?(?:°|℃|c\b|degrees\b)/;

/**
 * Lower case, no diacritics (ă→a, ș→s, ț→t, î→i), no invisible format characters
 * (zero-width spaces and joiners, soft hyphens, BOM), straight apostrophes, single spaces.
 */
export function normalise(text: string): string {
  return text
    .replace(/\p{Cf}/gu, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordHit(text: string): KeywordVerdict {
  const normalised = normalise(text);
  const urgent = URGENT_RE.test(normalised);
  return { health: urgent || HEALTH_RE.test(normalised) || TEMPERATURE_RE.test(normalised), urgent };
}
