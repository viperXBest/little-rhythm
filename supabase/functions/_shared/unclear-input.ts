// Unclear input: a message that gives no time for an event, or a voice
// transcript that came back partly garbled. The agent must never quietly log
// such an event at "now"; the server flags it so the parent sees the time was
// assumed. Pure: no I/O.

/** Shown on the confirm card (app) and added to the reply (server). Fixed text, not model output. */
export const TIME_ASSUMED_NOTE = "Time not mentioned, set to now. Edit if wrong.";

/** A proposal time this close to now counts as "now". */
export const NOW_SLACK_MS = 3 * 60_000;

// Words and patterns that say when something happened, in English and Romanian.
// A digit counts too ("at 3", "90 ml at 3", "2:30"); an amount alone ("90 ml")
// is a rare false negative and only hides the note. Word edges are Unicode-aware
// (JS's \b is ASCII-only, so "urmă" or "două" would never match with it).
const EN_WORDS =
  "now|just|ago|earlier|before|after|since|until|at|around|about|o'?clock|half|quarter|noon|midnight|morning|afternoon|evening|tonight|night|yesterday|today|minutes?|mins?|hours?|hrs?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty";
const RO_WORDS =
  "acum|adineauri|tocmai|mai devreme|în urmă|in urma|urmă|urma|la ora|ora|ore|oră|minute|minut|jumătate|jumatate|sfert|dimineață|dimineata|seară|seara|noaptea|ieri|azi|astăzi|astazi|unu|una|doi|două|doua|trei|patru|cinci|șase|sase|șapte|sapte|opt|nouă|noua|zece|douăzeci|douazeci|treizeci";
const TIME_WORDS = new RegExp(
  String.raw`\d|(?<![\p{L}\p{N}])(?:${EN_WORDS}|${RO_WORDS})(?![\p{L}\p{N}])`,
  "iu",
);

/** True when the message says when (a clock time, "now", or a relative time). */
export function mentionsTime(text: string): boolean {
  return TIME_WORDS.test(text);
}

const SCRIPTS: [string, RegExp][] = [
  ["latin", /\p{Script=Latin}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["greek", /\p{Script=Greek}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["han", /\p{Script=Han}/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["thai", /\p{Script=Thai}/u],
];

/**
 * True when the text looks like a garbled transcript: letters from more than
 * one alphabet (at least two of each, so a stray symbol doesn't count), or the
 * Unicode replacement character.
 */
export function looksGarbled(text: string): boolean {
  if (text.includes("�")) return true;
  const counts = new Map<string, number>();
  for (const char of text) {
    for (const [name, pattern] of SCRIPTS) {
      if (pattern.test(char)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        break;
      }
    }
  }
  return [...counts.values()].filter((n) => n >= 2).length >= 2;
}

/**
 * Whether a proposal's time was assumed rather than stated: the model said so
 * (time_stated false or missing), or the time is "now" while the message names
 * no time or is garbled.
 */
export function timeAssumed(input: {
  timeStated: unknown;
  time: string | null;
  now: Date;
  text: string;
}): boolean {
  if (input.timeStated !== true) return true;
  if (input.time === null) return false;
  const nearNow = Math.abs(Date.parse(input.time) - input.now.getTime()) <= NOW_SLACK_MS;
  return nearNow && (!mentionsTime(input.text) || looksGarbled(input.text));
}
