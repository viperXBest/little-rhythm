// The emergency number on the escalation card. No imports: this runs under the app and
// under `deno test` (emergency-number.test.ts).
//
// Picked from the phone's time zone, not its language: a Romanian parent with an en-US
// phone is still in Romania, and the zone follows where the phone is. Only three fixed
// values, so the card text stays static: 911 in the US and Canada, 999 in the UK, and
// 112 everywhere else (the EU number, which also works on mobiles in many other places).

export type EmergencyNumber = '112' | '911' | '999';

/** US and Canadian zones (IANA canonical names and their legacy aliases). */
const NORTH_AMERICA = new Set([
  // United States
  'America/New_York',
  'America/Detroit',
  'America/Chicago',
  'America/Menominee',
  'America/Denver',
  'America/Boise',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak',
  'Pacific/Honolulu',
  'America/Fort_Wayne',
  'America/Indianapolis',
  'America/Knox_IN',
  'America/Louisville',
  'America/Shiprock',
  'Navajo',
  // Canada
  'America/St_Johns',
  'America/Halifax',
  'America/Glace_Bay',
  'America/Moncton',
  'America/Goose_Bay',
  'America/Toronto',
  'America/Montreal',
  'America/Nipigon',
  'America/Thunder_Bay',
  'America/Iqaluit',
  'America/Pangnirtung',
  'America/Winnipeg',
  'America/Rainy_River',
  'America/Resolute',
  'America/Rankin_Inlet',
  'America/Regina',
  'America/Swift_Current',
  'America/Edmonton',
  'America/Cambridge_Bay',
  'America/Yellowknife',
  'America/Inuvik',
  'America/Dawson_Creek',
  'America/Fort_Nelson',
  'America/Whitehorse',
  'America/Dawson',
  'America/Vancouver',
  'America/Atikokan',
  'America/Creston',
  'America/Blanc-Sablon',
]);

/** Zone prefixes that are wholly US or Canadian. */
const NORTH_AMERICA_PREFIXES = ['America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/', 'US/', 'Canada/'];

/** The UK and the Crown Dependencies, which also use 999. */
const UK = new Set(['Europe/London', 'Europe/Belfast', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'GB', 'GB-Eire']);

export function emergencyNumber(timeZone: string | null | undefined): EmergencyNumber {
  if (typeof timeZone !== 'string') return '112';
  if (NORTH_AMERICA.has(timeZone) || NORTH_AMERICA_PREFIXES.some((p) => timeZone.startsWith(p))) return '911';
  if (UK.has(timeZone)) return '999';
  return '112';
}
