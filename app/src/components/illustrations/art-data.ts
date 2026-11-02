/**
 * Geometry for every icon, mascot pose and scene, as plain data. No imports, so the same data drives
 * the react-native-svg components (app) and the contact sheet and masters (scripts/assets, Deno).
 * Colours are theme token names, resolved through useTheme() in the app; never hex values here.
 *
 * Original artwork for Little Rhythm (direction C, Cloud Lullaby). Not traced from any other app.
 */

/** Theme tokens an illustration may paint with. Each is a key of the app palette. */
export type ArtToken =
  | "text"
  | "textSecondary"
  | "background"
  | "surface"
  | "card"
  | "border"
  | "primary"
  | "primaryPressed"
  | "onPrimary"
  | "accent"
  | "infoBackground"
  | "success"
  | "error"
  | "feed"
  | "feedSoft"
  | "sleep"
  | "sleepSoft"
  | "diaper"
  | "diaperSoft";

export type ArtShape = {
  d: string;
  fill?: ArtToken;
  stroke?: ArtToken;
  width?: number;
  dash?: string;
  /** SVG transform string, e.g. "rotate(-24 54 58)". */
  transform?: string;
};

/** A path for a circle (react-native-svg and the string renderer then only need Path). */
export function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
}

/** A rounded rectangle path. */
export function roundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  return (
    `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

/* ------------------------------------------------------------------ icons */

/**
 * Icon parts on a 24-unit grid, drawn in order:
 * - duo: closed shape, filled with the duotone fill (default `card`) and outlined in the tone
 * - line: outline only, in the tone
 * - dot: solid, in the tone
 */
export type IconPart = readonly ["duo" | "line" | "dot", string];
export type IconDef = {
  /** Default outline colour. Event icons use their event colour. */
  tone: ArtToken;
  parts: readonly IconPart[];
  /** True for plain outline icons (no duotone fill), e.g. the escalation warning. */
  outlineOnly?: boolean;
};

export const ICON_STROKE = 1.9;

export const ICONS = {
  feed: {
    tone: "feed",
    parts: [
      ["duo", "M10 2.5h4v2.5h-4z"],
      ["duo", "M8 5h8v3H8z"],
      ["duo", "M7.5 8h9v11.5a2.5 2.5 0 0 1-2.5 2.5h-4a2.5 2.5 0 0 1-2.5-2.5z"],
      ["line", "M10 12h3M10 15h3M10 18h3"],
    ],
  },
  // A milk drop held in a cradling curve. Deliberately non-anatomical.
  breastFeed: {
    tone: "feed",
    parts: [
      ["duo", "M12 3c2.9 3.4 5 6.2 5 8.9a5 5 0 0 1-10 0c0-2.7 2.1-5.5 5-8.9z"],
      ["line", "M3.5 14.5c1.4 3.9 4.6 6.5 8.5 6.5s7.1-2.6 8.5-6.5"],
    ],
  },
  sleep: {
    tone: "sleep",
    parts: [
      ["duo", "M19.5 14.8A8 8 0 1 1 9.2 4.5a6.4 6.4 0 0 0 10.3 10.3z"],
      ["line", "M15 4h3l-3 3h3"],
    ],
  },
  wake: {
    tone: "sleep",
    parts: [
      ["duo", circle(12, 12, 4.2)],
      [
        "line",
        "M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5",
      ],
    ],
  },
  diaper: {
    tone: "diaper",
    parts: [
      ["duo", "M3 7.5h18v3.2c0 5-4 8.8-9 8.8s-9-3.8-9-8.8z"],
      ["line", "M7 7.5c0 3 2 5.5 5 5.5s5-2.5 5-5.5"],
    ],
  },
  mic: {
    tone: "primary",
    parts: [
      ["duo", "M9 3.5h6v8.5a3 3 0 0 1-6 0z"],
      ["line", "M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"],
    ],
  },
  // Shown while recording: tap to stop.
  stop: {
    tone: "primary",
    parts: [["duo", roundRect(6.5, 6.5, 11, 11, 2.5)]],
  },
  chat: {
    tone: "primary",
    parts: [
      ["duo", "M4 5.5h16v10.5H10l-5 4v-4H4z"],
      ["dot", circle(8.2, 10.7, 1.15)],
      ["dot", circle(12, 10.7, 1.15)],
      ["dot", circle(15.8, 10.7, 1.15)],
    ],
  },
  bell: {
    tone: "primary",
    parts: [
      ["duo", "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"],
      ["line", "M10 20.5h4"],
    ],
  },
  // Daily check-in: two hearts, one for each parent.
  checkin: {
    tone: "primary",
    parts: [
      [
        "duo",
        "M16.5 13.2s-4.2-2.6-4.2-5.8a2.3 2.3 0 0 1 4.2-1.3a2.3 2.3 0 0 1 4.2 1.3c0 3.2-4.2 5.8-4.2 5.8z",
      ],
      [
        "duo",
        "M9 20s-6-3.7-6-8.2a3.3 3.3 0 0 1 6-1.9a3.3 3.3 0 0 1 6 1.9c0 4.5-6 8.2-6 8.2z",
      ],
    ],
  },
  // Night-feed balance: a moon over a level beam with one dot per parent.
  nightFeeds: {
    tone: "primary",
    parts: [
      ["duo", "M17.4 9A5.5 5.5 0 1 1 11 2.6a5 5 0 0 0 6.4 6.4z"],
      ["line", "M3.5 20.5h17"],
      ["dot", circle(7, 16.8, 1.9)],
      ["dot", circle(17, 16.8, 1.9)],
    ],
  },
  edit: {
    tone: "text",
    parts: [
      [
        "duo",
        "M4.5 19.5l.9-4.2L15.6 5.1a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.7 18.6z",
      ],
      ["line", "M13.6 7.1l3.3 3.3"],
    ],
  },
  delete: {
    tone: "text",
    parts: [
      ["duo", "M6 7.5h12l-.9 11.7a2 2 0 0 1-2 1.8H8.9a2 2 0 0 1-2-1.8z"],
      [
        "line",
        "M4 7.5h16M9.5 7.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5M10.3 11v6M13.7 11v6",
      ],
    ],
  },
  back: {
    tone: "text",
    outlineOnly: true,
    parts: [["line", "M15 5l-7 7 7 7"]],
  },
  close: {
    tone: "text",
    outlineOnly: true,
    parts: [["line", "M6.5 6.5l11 11M17.5 6.5l-11 11"]],
  },
  chevronRight: {
    tone: "text",
    outlineOnly: true,
    parts: [["line", "M9.5 5.5L16 12l-6.5 6.5"]],
  },
  chevronDown: {
    tone: "text",
    outlineOnly: true,
    parts: [["line", "M5.5 9.5L12 16l6.5-6.5"]],
  },
  clock: {
    tone: "text",
    parts: [
      ["duo", circle(12, 12, 8.6)],
      ["line", "M12 7.5V12l3 2"],
    ],
  },
  plus: {
    tone: "text",
    outlineOnly: true,
    parts: [["line", "M12 5v14M5 12h14"]],
  },
  home: {
    tone: "text",
    parts: [
      [
        "duo",
        "M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z",
      ],
      ["line", "M10 20.5V15h4v5.5"],
    ],
  },
  // Settings as two sliders (simpler than a gear at 20 dp).
  settings: {
    tone: "text",
    parts: [
      ["line", "M3.5 7.5h17M3.5 16.5h17"],
      ["duo", circle(9, 7.5, 2.6)],
      ["duo", circle(15, 16.5, 2.6)],
    ],
  },
  link: {
    tone: "primary",
    outlineOnly: true,
    parts: [
      ["line", "M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"],
      ["line", "M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
    ],
  },
  invite: {
    tone: "primary",
    parts: [
      ["duo", circle(9.5, 8, 3.6)],
      ["duo", "M3 20a6.5 6.5 0 0 1 13 0z"],
      ["line", "M19 8.5v6M16 11.5h6"],
    ],
  },
  // Escalation card only: plain outline in `error`, no duotone fill.
  warning: {
    tone: "error",
    outlineOnly: true,
    parts: [
      ["line", "M12 3.8L2.8 19.8h18.4z"],
      ["line", "M12 9.5v4.8"],
      ["dot", circle(12, 17, 1.15)],
    ],
  },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/* ----------------------------------------------------------------- mascot */

/** Fluff's view box: 150 x 120. */
export const MASCOT_VIEWBOX = { width: 150, height: 120 } as const;

const BODY =
  "M40 96c-16 0-24-14-16-26c-8-14 6-28 20-22c4-14 24-18 34-8c10-10 30-6 34 8c16-4 26 12 18 24" +
  "c8 14-4 28-18 24c-6 8-20 10-28 2c-10 8-30 8-44-2z";
const STAR =
  "M120 14l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z";
const ZZ = "M18 22h8l-8 8h8M30 10h6l-6 6h6";

const legs: ArtShape = {
  d: "M46 94v14M64 96v12M92 96v12M110 94v14",
  stroke: "text",
  width: 7,
};
const body: ArtShape = { d: BODY, fill: "card", stroke: "text", width: 3.5 };
const face: ArtShape = { d: ellipse(78, 68, 24, 20), fill: "sleep" };
const ears: ArtShape[] = [
  { d: ellipse(54, 58, 8, 5), fill: "sleep", transform: "rotate(-24 54 58)" },
  { d: ellipse(102, 58, 8, 5), fill: "sleep", transform: "rotate(24 102 58)" },
];
const closedEyes: ArtShape = {
  d: "M66 66q4 4 8 0M82 66q4 4 8 0",
  stroke: "onPrimary",
  width: 3,
};
const smile: ArtShape = {
  d: "M74 76q4 3 8 0",
  stroke: "onPrimary",
  width: 2.5,
};
const openEyes: ArtShape[] = [
  { d: circle(70, 65, 3.2), fill: "onPrimary" },
  { d: circle(86, 65, 3.2), fill: "onPrimary" },
];

export type MascotPose = "sleeping" | "awake" | "waiting" | "cosy";

export const MASCOT: Record<MascotPose, readonly ArtShape[]> = {
  // Home header: dozing among "z"s and a star (from the direction C mockup).
  sleeping: [
    { d: STAR, fill: "feed" },
    { d: ZZ, stroke: "sleep", width: 3 },
    legs,
    body,
    face,
    closedEyes,
    smile,
    ...ears,
  ],
  // Welcome, onboarding, sign-in: eyes open, waving one stubby leg.
  awake: [
    {
      d: "M122 16l1.6 3.4 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z",
      fill: "feed",
    },
    { d: "M128 40l4-6M136 46l7-3", stroke: "accent", width: 3 },
    legs,
    body,
    { d: "M131 68l10-13", stroke: "text", width: 7 },
    face,
    ...openEyes,
    { d: "M71 74q7 6 14 0", stroke: "onPrimary", width: 2.8 },
    ...ears,
  ],
  // Waiting for the partner: eyes up, a patient little mouth and three dots.
  waiting: [
    { d: circle(106, 22, 3.6), fill: "accent" },
    { d: circle(118, 18, 3.6), fill: "accent" },
    { d: circle(130, 14, 3.6), fill: "accent" },
    legs,
    body,
    face,
    { d: circle(72, 62, 3.2), fill: "onPrimary" },
    { d: circle(88, 62, 3.2), fill: "onPrimary" },
    { d: "M75 75h6", stroke: "onPrimary", width: 2.8 },
    ...ears,
  ],
  // Empty states: content, eyes shut, tucked under a warm blanket.
  cosy: [
    { d: STAR, fill: "feed" },
    legs,
    body,
    face,
    { d: "M66 67q4-4 8 0M82 67q4-4 8 0", stroke: "onPrimary", width: 3 },
    smile,
    ...ears,
    {
      d: "M24 70c30 13 76 14 106 2c8 14-4 28-18 24c-6 8-20 10-28 2c-10 8-30 8-44-2c-16 0-24-14-16-26z",
      fill: "feedSoft",
      stroke: "feed",
      width: 3,
    },
    {
      d: "M40 84l3 4M58 88l3 4M76 89l3 4M94 88l3 4M112 85l3 4",
      stroke: "feed",
      width: 2.5,
    },
  ],
};

/* ----------------------------------------------------------------- scenes */

export type SceneName =
  "emptyTimeline" | "emptyChat" | "checkinWaiting" | "invitePartner" | "error";

export type Scene = {
  width: number;
  height: number;
  /** Shapes behind the mascot. */
  back: readonly ArtShape[];
  mascot?: { pose: MascotPose; x: number; y: number; scale: number };
  /** Shapes in front of the mascot. */
  front: readonly ArtShape[];
};

export const SCENES: Record<SceneName, Scene> = {
  // "Nothing logged yet today": an empty log card and Fluff dozing beside it.
  emptyTimeline: {
    width: 220,
    height: 140,
    back: [
      {
        d: roundRect(14, 18, 92, 108, 14),
        fill: "card",
        stroke: "border",
        width: 3,
      },
      { d: "M30 46h44M30 70h56M30 94h36", stroke: "border", width: 5 },
    ],
    mascot: { pose: "cosy", x: 92, y: 30, scale: 0.85 },
    front: [],
  },
  // Empty chat thread: Fluff says hello with an empty speech bubble.
  emptyChat: {
    width: 220,
    height: 140,
    back: [
      {
        d: "M120 10h82a12 12 0 0 1 12 12v30a12 12 0 0 1-12 12h-50l-14 12v-12h-18a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12z",
        fill: "card",
        stroke: "primary",
        width: 3,
      },
      { d: circle(142, 37, 3.6), fill: "primary" },
      { d: circle(161, 37, 3.6), fill: "primary" },
      { d: circle(180, 37, 3.6), fill: "primary" },
    ],
    mascot: { pose: "awake", x: 0, y: 34, scale: 0.85 },
    front: [],
  },
  // Check-in waiting for the partner: one heart answered, one still dashed.
  checkinWaiting: {
    width: 220,
    height: 140,
    back: [
      {
        d: "M168 58s-16-9.8-16-21.8a8.8 8.8 0 0 1 16-5.1a8.8 8.8 0 0 1 16 5.1c0 12-16 21.8-16 21.8z",
        fill: "primary",
        stroke: "primary",
        width: 3,
      },
      {
        d: "M196 92s-12-7.4-12-16.4a6.6 6.6 0 0 1 12-3.8a6.6 6.6 0 0 1 12 3.8c0 9-12 16.4-12 16.4z",
        fill: "card",
        stroke: "primary",
        width: 3,
        dash: "5 5",
      },
    ],
    mascot: { pose: "waiting", x: 0, y: 30, scale: 0.85 },
    front: [],
  },
  // No partner yet: Fluff waves next to an empty, dashed cloud with a plus.
  invitePartner: {
    width: 220,
    height: 140,
    back: [
      {
        d:
          "M150 108c-10 0-15-9-10-16c-5-9 4-18 13-14c3-9 16-11 22-5c7-6 19-3 22 5c10-2 16 8 11 15" +
          "c5 9-3 18-11 15c-4 5-13 6-18 1c-7 5-19 5-29-1z",
        fill: "card",
        stroke: "primary",
        width: 3,
        dash: "6 5",
      },
      { d: "M176 80v18M167 89h18", stroke: "primary", width: 4 },
    ],
    mascot: { pose: "awake", x: 0, y: 30, scale: 0.85 },
    front: [],
  },
  // Generic error: calm, no mascot. A plain cloud with a "try again" loop.
  error: {
    width: 220,
    height: 140,
    back: [
      {
        d:
          "M62 116c-24 0-36-21-24-39c-12-21 9-42 30-33c6-21 36-27 51-12c15-15 45-9 51 12c24-6 39 18 27 36" +
          "c12 21-6 42-27 36c-9 12-30 15-42 3c-15 12-45 12-66-3z",
        fill: "card",
        stroke: "textSecondary",
        width: 3.5,
      },
      { d: "M122 66a14 14 0 1 1-4.1-9.9", stroke: "primary", width: 5 },
      { d: "M117.9 47.6v8.5h-8.5", stroke: "primary", width: 5 },
    ],
    front: [],
  },
};
