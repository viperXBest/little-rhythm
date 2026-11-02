// Writes docs/design/directions/<dir>/{home,confirm-card,escalation}-{light,dark}.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../directions', import.meta.url));
const palettes = JSON.parse(fs.readFileSync(new URL('./palettes.json', import.meta.url), 'utf8'));

// ---------- icons (24×24, one geometry, three renderings) ----------
const ICON_PATHS = {
  feed: '<path d="M10 2.5h4v2.5h-4z"/><path d="M8 5h8v3H8z"/><path d="M7.5 8h9v11.5a2.5 2.5 0 0 1-2.5 2.5h-4a2.5 2.5 0 0 1-2.5-2.5z"/>',
  feedMarks: '<path d="M10 12h3M10 15h3M10 18h3"/>',
  sleep: '<path d="M19.5 14.8A8 8 0 1 1 9.2 4.5a6.4 6.4 0 0 0 10.3 10.3z"/>',
  sleepMarks: '<path d="M15 4h3l-3 3h3"/>',
  diaper: '<path d="M3 7.5h18v3.2c0 5-4 8.8-9 8.8s-9-3.8-9-8.8z"/>',
  diaperMarks: '<path d="M7 7.5c0 3 2 5.5 5 5.5s5-2.5 5-5.5"/>',
  mic: '<path d="M9 3.5h6v8.5a3 3 0 0 1-6 0z"/>',
  micMarks: '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  chat: '<path d="M4 5.5h16v10.5H10l-5 4v-4H4z"/>',
  chatMarks: '<path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/>',
  bellMarks: '<path d="M10 20.5h4"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  homeMarks: '<path d="M10 20v-5h4v5"/>',
  back: '',
  backMarks: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  sendMarks: '',
};
function icon(name, style, cls = 'ic') {
  const body = ICON_PATHS[name], marks = ICON_PATHS[name + 'Marks'] ?? '';
  if (style === 'filled')
    return `<svg class="${cls}" viewBox="0 0 24 24"><g fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">${body}</g><g fill="none" stroke="${name === 'mic' || name === 'back' || name === 'bell' ? 'currentColor' : 'var(--icon-cut)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${marks}</g></svg>`;
  if (style === 'outline')
    return `<svg class="${cls}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}${marks}</g></svg>`;
  // duotone
  return `<svg class="${cls}" viewBox="0 0 24 24"><g fill="var(--duo)" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</g><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${marks}</g></svg>`;
}

// ---------- mascots (fills reference theme tokens only) ----------
const MASCOT = {
  // A: Moonbean — a sleepy crescent moon tucked under a striped blanket.
  a: (w) => `<svg width="${w}" height="${w}" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="16" cy="24" r="3" fill="var(--sleep)"/><circle cx="104" cy="18" r="2.5" fill="var(--sleep)"/><circle cx="100" cy="46" r="2" fill="var(--feed)"/>
  <path d="M98 26l2 4 4 .6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4-.6z" fill="var(--feed)"/>
  <circle cx="58" cy="62" r="36" fill="var(--accent)"/>
  <circle cx="44" cy="44" r="5" fill="var(--onPrimary)" opacity=".18"/><circle cx="74" cy="82" r="4" fill="var(--onPrimary)" opacity=".18"/>
  <path d="M40 60q6 6 12 0M64 60q6 6 12 0" stroke="var(--onPrimary)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <circle cx="38" cy="70" r="5" fill="var(--onPrimary)" opacity=".3"/><circle cx="78" cy="70" r="5" fill="var(--onPrimary)" opacity=".3"/>
  <path d="M53 72q5 4 10 0" stroke="var(--onPrimary)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M12 86q48-14 96 0v14a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="var(--sleep)"/>
  <path d="M12 86q48-14 96 0" stroke="var(--sleepSoft)" stroke-width="5" fill="none"/>
  <path d="M28 98h10M55 98h10M82 98h10" stroke="var(--sleepSoft)" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  // B: Two birds on a branch above a nest — the two parents, one rhythm.
  b: (w) => `<svg width="${w}" height="${w * 0.75}" viewBox="0 0 160 120" aria-hidden="true">
  <path d="M6 70q70-14 148 6" stroke="var(--accent)" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M120 72q8-16 22-14q-6 14-22 14z" fill="var(--accent)"/><path d="M30 66q-4-16-18-18q2 14 18 18z" fill="var(--accent)"/>
  <g><path d="M44 66c-14 0-20-12-14-24c6-12 26-12 32 0l12 4l-10 4c0 10-8 16-20 16z" fill="var(--primary)"/>
     <path d="M36 60c4 4 14 4 18-2c-6 2-12 2-18 2z" fill="var(--card)"/>
     <circle cx="52" cy="44" r="3" fill="var(--onPrimary)"/><path d="M70 44l8 3l-8 2z" fill="var(--feed)"/></g>
  <g><path d="M116 66c14 0 20-12 14-24c-6-12-26-12-32 0l-12 4l10 4c0 10 8 16 20 16z" fill="var(--sleep)"/>
     <path d="M124 60c-4 4-14 4-18-2c6 2 12 2 18 2z" fill="var(--card)"/>
     <circle cx="108" cy="44" r="3" fill="var(--card)"/><path d="M90 44l-8 3l8 2z" fill="var(--feed)"/></g>
  <path d="M80 30c-3-6-11-4-10 2c1 5 10 9 10 9s9-4 10-9c1-6-7-8-10-2z" fill="var(--diaper)"/>
  <path d="M50 92q30 16 60 0l-4 16q-26 10-52 0z" fill="var(--feed)"/>
  <path d="M54 96q26 10 52 0M56 102q24 8 48 0" stroke="var(--feedSoft)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="80" cy="91" rx="12" ry="7" fill="var(--card)"/>
</svg>`,
  // C: Fluff — a little cloud-sheep that drifts across the screen; outlined like a sticker.
  c: (w) => `<svg width="${w}" height="${w * 0.8}" viewBox="0 0 150 120" aria-hidden="true">
  <path d="M120 14l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" fill="var(--feed)"/>
  <path d="M18 22h8l-8 8h8M30 10h6l-6 6h6" stroke="var(--sleep)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M46 94v14M64 96v12M92 96v12M110 94v14" stroke="var(--text)" stroke-width="7" stroke-linecap="round"/>
  <path d="M40 96c-16 0-24-14-16-26c-8-14 6-28 20-22c4-14 24-18 34-8c10-10 30-6 34 8c16-4 26 12 18 24c8 14-4 28-18 24c-6 8-20 10-28 2c-10 8-30 8-44-2z" fill="var(--card)" stroke="var(--text)" stroke-width="3.5" stroke-linejoin="round"/>
  <ellipse cx="78" cy="68" rx="24" ry="20" fill="var(--sleep)"/>
  <path d="M66 66q4 4 8 0M82 66q4 4 8 0" stroke="var(--onPrimary)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M74 76q4 3 8 0" stroke="var(--onPrimary)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="54" cy="58" rx="8" ry="5" fill="var(--sleep)" transform="rotate(-24 54 58)"/><ellipse cx="102" cy="58" rx="8" ry="5" fill="var(--sleep)" transform="rotate(24 102 58)"/>
</svg>`,
};

// ---------- directions ----------
const DIRS = {
  a: {
    slug: 'a-apricot-moon', name: 'Apricot Moon', icons: 'filled',
    fonts: { head: 'Fredoka', body: 'Nunito', link: 'family=Fredoka:wght@500;600&family=Nunito:wght@500;600;700;800' },
    css: `
      --r-card:28px; --r-btn:999px; --r-field:18px; --r-row:20px; --r-seg:999px;
      --shadow: 0 6px 18px var(--shadow-c); --bw:0px;`,
    shadowLight: 'rgba(160,90,50,.14)', shadowDark: 'rgba(0,0,0,.35)',
  },
  b: {
    slug: 'b-sage-nest', name: 'Sage Nest', icons: 'outline',
    fonts: { head: 'Fraunces', body: 'Lexend', link: 'family=Fraunces:opsz,wght,SOFT@9..144,500..700,100&family=Lexend:wght@400;500;600' },
    css: `
      --r-card:26px 26px 26px 8px; --r-btn:16px 16px 16px 6px; --r-field:14px; --r-row:16px; --r-seg:14px;
      --shadow: none; --bw:1.5px;`,
  },
  c: {
    slug: 'c-cloud-lullaby', name: 'Cloud Lullaby', icons: 'duotone',
    fonts: { head: 'Baloo 2', body: 'Atkinson Hyperlegible', link: 'family=Baloo+2:wght@600;700;800&family=Atkinson+Hyperlegible:wght@400;700' },
    css: `
      --r-card:22px; --r-btn:16px; --r-field:14px; --r-row:16px; --r-seg:14px;
      --shadow: 0 4px 0 var(--shadow-c); --bw:2px;`,
    shadowLight: '#D5D1EC', shadowDark: '#11122A',
  },
};

function rootVars(dir, scheme) {
  const p = palettes[dir.slug][scheme];
  const vars = Object.entries(p).map(([k, v]) => `--${k}:${v};`).join('');
  const shadowC = scheme === 'light' ? dir.shadowLight : dir.shadowDark;
  return `:root{${vars}${dir.css}--shadow-c:${shadowC ?? 'transparent'};--icon-cut:var(--card);--duo:var(--card);
    --fh:'${dir.fonts.head}',sans-serif;--fb:'${dir.fonts.body}',sans-serif;color-scheme:${scheme};}`;
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:412px;height:915px;overflow:hidden;background:var(--background);color:var(--text);font-family:var(--fb);-webkit-font-smoothing:antialiased}
.phone{position:relative;width:412px;height:915px;overflow:hidden;background:var(--background)}
.status{height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font:600 14px var(--fb);color:var(--text)}
.status .dots{display:flex;gap:6px;align-items:center}.status .dots i{display:block;width:14px;height:10px;border-radius:3px;background:var(--text);opacity:.8}
.gesture{position:absolute;bottom:8px;left:50%;width:120px;height:4px;margin-left:-60px;border-radius:2px;background:var(--text);opacity:.5}
.scroll{padding:8px 20px 140px;display:flex;flex-direction:column;gap:16px}
h1,h2,h3{font-family:var(--fh);font-weight:600}
.small{font-size:15px;line-height:22px}
.muted{color:var(--textSecondary)}
.card{background:var(--card);border-radius:var(--r-card);box-shadow:var(--shadow);border:var(--bw) solid var(--border);padding:18px;display:flex;flex-direction:column;gap:12px}
.card-title{display:flex;align-items:center;gap:10px;font:600 19px/26px var(--fh)}
.ic{width:24px;height:24px;flex:none}
.btn{min-height:52px;border-radius:var(--r-btn);display:flex;align-items:center;justify-content:center;gap:8px;font:700 16px var(--fb);border:none;padding:0 18px}
.btn.primary{background:var(--primary);color:var(--onPrimary)}
.btn.secondary{background:var(--surface);color:var(--text);border:var(--bw) solid var(--border)}
.btn.danger{background:var(--error);color:var(--onPrimary)}
.row2{display:flex;gap:10px}.row2>*{flex:1}
.seg{display:flex;background:var(--surface);border-radius:var(--r-seg);padding:4px;gap:4px}
.seg span{flex:1;min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-seg);font:700 16px var(--fb);color:var(--text)}
.seg span.on{background:var(--primary);color:var(--onPrimary)}
.field-l{font:700 14px var(--fb);margin-bottom:6px}
.field{min-height:54px;border-radius:var(--r-field);border:1.5px solid var(--border);background:var(--background);display:flex;align-items:center;padding:0 16px;gap:10px;font-size:17px}
.field .v{flex:1}.field .chg{font-weight:700;font-size:15px;color:var(--link)}
.stepper{display:flex;align-items:center;justify-content:space-between}
.stepper .sb{width:56px;height:48px;border-radius:var(--r-field);background:var(--surface);border:var(--bw) solid var(--border);display:flex;align-items:center;justify-content:center;font:600 28px var(--fb);color:var(--text)}
.stepper .val{font:700 26px var(--fh)}
.note{background:var(--infoBackground);border-radius:12px;padding:10px 12px;font-size:15px;line-height:21px;color:var(--text)}
.bubble{max-width:88%;border-radius:20px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.bubble.me{align-self:flex-end;background:var(--primary);color:var(--onPrimary);border-bottom-right-radius:6px}
.bubble.me .meta{color:var(--onPrimary);opacity:.9}
.bubble.bot{align-self:flex-start;background:var(--card);border:var(--bw) solid var(--border);box-shadow:var(--shadow);border-bottom-left-radius:6px}
.meta{font-size:13px;line-height:18px;color:var(--textSecondary);font-weight:600}
.btext{font-size:17px;line-height:25px}
.topbar{display:flex;align-items:center;gap:12px;padding:6px 16px 10px}
.iconbtn{width:48px;height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:var(--text);background:var(--surface)}
.composer{position:absolute;z-index:3;left:0;right:0;bottom:0;padding:12px 16px 22px;background:var(--background);border-top:1px solid var(--border);display:flex;align-items:center;gap:10px}
.composer .input{flex:1;min-height:52px;border-radius:999px;background:var(--surface);border:1.5px solid var(--border);display:flex;align-items:center;padding:0 18px;color:var(--textSecondary);font-size:16px}
.mic{width:64px;height:64px;border-radius:999px;background:var(--primary);color:var(--onPrimary);display:flex;align-items:center;justify-content:center;flex:none}
.mic .ic{width:30px;height:30px}
.miclabel{font:700 12px var(--fb);color:var(--textSecondary);text-align:center;margin-top:3px}
/* escalation: identical in every direction except font + radius */
.esc{background:var(--warningBackground);border:2px solid var(--error);border-radius:var(--r-field);padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:none}
.esc.urgent{border-width:3px}
.esc .t{display:flex;gap:10px;font:700 17px/24px var(--fb)}
.esc .warn{color:var(--errorText);font-size:20px;line-height:24px}
.esc .b{font-size:17px;line-height:25px}
`;

const page = (dir, scheme, title, body, extraCss = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=412">
<title>${dir.name} · ${title} · ${scheme}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${dir.fonts.link}&display=block" rel="stylesheet">
<style>${rootVars(dir, scheme)}${BASE_CSS}${extraCss}</style></head>
<body><div class="phone"><div class="status"><span>14:52</span><span class="dots"><i></i><i></i><i style="width:22px"></i></span></div>
${body}<div class="gesture"></div></div></body></html>`;

// ---------- shared content (real labels from the app) ----------
const NEXT = [
  { label: 'Next feed', time: '15:10–15:40', basis: 'based on the last 7 days and age', type: 'feed' },
  { label: 'Next nap', time: '15:07–15:37', basis: 'based on the last 7 days and age', type: 'sleep' },
  { label: 'Bedtime routine', time: '18:15–18:45', basis: 'typical for this age', type: 'routine' },
  { label: 'Bedtime', time: '18:45–19:30', basis: 'typical for this age', type: 'bedtime' },
];
const TIMELINE = [
  { time: '13:50', text: 'Diaper · wet', partner: true, type: 'diaper' },
  { time: '12:35–13:40', text: 'Sleep · 1h 5m', type: 'sleep' },
  { time: '12:20', text: 'Bottle · 120 ml', type: 'feed' },
  { time: '10:40', text: 'Diaper · wet and dirty', type: 'diaper' },
];
const typeIcon = (t) => (t === 'routine' || t === 'bedtime' ? 'sleep' : t);
const toggle = `<span class="tog" aria-hidden="true"><b></b></span>`;
const REMIND = 'Remind me before feeds, naps and the bedtime routine, and about the check-in at 21:00';

// ---------- HOME: three layouts ----------
function homeA(d) {
  return `<div class="scroll" style="gap:18px">
  <header class="hdr"><div><div class="hello muted">13 weeks old</div><h1>Mia</h1>
    <div class="small muted">You and your partner are both here.</div></div>${MASCOT.a(108)}</header>
  <section class="card nextup"><div class="card-title" role="heading">Next up</div>
    ${NEXT.map((n, i) => `<div class="nrow ${i === 1 ? 'hero' : ''}"><span class="dot t-${typeIcon(n.type)}">${icon(typeIcon(n.type), 'filled')}</span>
      <div class="nl"><div class="lbl">${n.label}</div><div class="basis">${n.basis}</div></div><div class="nt">${n.time}</div></div>`).join('')}
    <div class="rem"><span class="small muted">${REMIND}</span>${toggle}</div></section>
  <section class="quick">
    <div class="tile t-sleep">${icon('sleep', 'filled', 'ic big')}<span>Start sleep</span></div>
    <div class="tile t-feed">${icon('feed', 'filled', 'ic big')}<span>Feed</span></div>
  </section>
  <section class="card dcard"><div class="card-title"><span class="dot t-diaper">${icon('diaper', 'filled')}</span>Diaper</div>
    <div class="chips"><span>Wet</span><span>Dirty</span><span>Both</span></div></section>
  <section><div class="card-title" style="margin:0 4px 10px">Today</div>
    ${TIMELINE.map((r) => `<div class="tl"><span class="dot sm t-${r.type}">${icon(r.type, 'filled')}</span><div style="flex:1"><div class="tt">${r.text}</div>${r.partner ? '<div class="small muted">by your partner</div>' : ''}</div><div class="tm">${r.time}</div></div>`).join('')}
  </section></div>
  <div class="fab">${icon('chat', 'filled')}<span>Chat</span></div>`;
}
const homeACss = `
.hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 0 0}
.hdr h1{font-size:40px;line-height:44px}.hello{font:700 15px var(--fb)}
.dot{width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex:none}
.dot.sm{width:36px;height:36px}.dot .ic{width:22px;height:22px}
.t-feed{background:var(--feedSoft);color:var(--feed);--icon-cut:var(--feedSoft)}
.t-sleep{background:var(--sleepSoft);color:var(--sleep);--icon-cut:var(--sleepSoft)}
.t-diaper{background:var(--diaperSoft);color:var(--diaper);--icon-cut:var(--diaperSoft)}
.nextup{gap:8px}.nrow{display:flex;align-items:center;gap:12px;padding:8px 6px;border-radius:var(--r-row)}
.nrow.hero{background:var(--sleepSoft);padding:12px 10px}.nrow.hero .nt{font-size:24px}
.nl{flex:1}.lbl{font:700 16px var(--fb)}.basis{font-size:13px;line-height:18px;color:var(--textSecondary)}
.nt{font:600 20px var(--fh);white-space:nowrap}
.rem{display:flex;gap:12px;align-items:center;border-top:1px solid var(--border);padding-top:12px;margin-top:4px}
.tog{width:52px;height:32px;border-radius:999px;background:var(--primary);flex:none;position:relative}.tog b{position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:999px;background:var(--onPrimary)}
.quick{display:flex;gap:12px}.tile{flex:1;border-radius:var(--r-card);padding:14px 18px;display:flex;flex-direction:column;gap:10px;font:600 20px var(--fh);box-shadow:var(--shadow);color:var(--text)}
.tile .big{width:40px;height:40px}.tile.t-sleep .big{color:var(--sleep)}.tile.t-feed .big{color:var(--feed)}
.dcard{flex-direction:row;align-items:center;justify-content:space-between;padding:12px 12px 12px 14px}
.chips{display:flex;gap:8px}.chips span{min-height:48px;min-width:60px;padding:0 12px;border-radius:999px;background:var(--diaperSoft);display:flex;align-items:center;justify-content:center;font:700 16px var(--fb)}
.tl{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:var(--r-row);padding:10px 14px;min-height:60px;margin-bottom:8px;box-shadow:var(--shadow)}
.tt{font:600 16px var(--fb)}.tm{font:600 15px var(--fb);color:var(--textSecondary)}
.fab{position:absolute;right:20px;bottom:30px;height:60px;border-radius:999px;background:var(--primary);color:var(--onPrimary);display:flex;align-items:center;gap:10px;padding:0 24px 0 20px;font:700 18px var(--fb);box-shadow:0 8px 20px var(--shadow-c);--icon-cut:var(--primary)}
`;

function homeB(d) {
  return `<div class="scroll">
  <header class="hdr">${MASCOT.b(150)}<div class="hdr-t"><h1>Mia</h1><div class="age">13 weeks old</div></div>
  <div class="small muted together">You and your partner are both here.</div></header>
  <section class="card nextup"><div class="card-title" role="heading">Next up</div>
    <div class="path">${NEXT.map((n, i) => `<div class="step ${i === 0 ? 'first' : ''}"><span class="node t-${typeIcon(n.type)}"></span>
      <div class="sl"><div class="lbl">${n.label}</div><div class="basis">${n.basis}</div></div><div class="nt">${n.time}</div></div>`).join('')}</div>
    <div class="rem"><span class="small muted">${REMIND}</span>${toggle}</div></section>
  <section class="quick">
    <div class="q t-sleep">${icon('sleep', 'outline', 'ic big')}<span>Start sleep</span></div>
    <div class="q t-feed">${icon('feed', 'outline', 'ic big')}<span>Feed</span></div>
    <div class="q t-diaper diap">${icon('diaper', 'outline', 'ic big')}<span>Diaper</span><div class="dw"><i>Wet</i><i>Dirty</i><i>Both</i></div></div>
  </section>
  <section class="card"><div class="card-title">Today</div>
    ${TIMELINE.map((r) => `<div class="tl"><span class="tm">${r.time}</span><span class="tic t-${r.type}">${icon(r.type, 'outline')}</span><div style="flex:1"><div class="tt">${r.text}</div>${r.partner ? '<div class="small muted">by your partner</div>' : ''}</div></div>`).join('')}
  </section></div>
  <nav class="bar"><span class="on">${icon('home', 'outline')}<b>Home</b></span><span class="chat">${icon('mic', 'outline')}<b>Chat</b></span></nav>`;
}
const homeBCss = `
.hdr{display:grid;grid-template-columns:auto 1fr;align-items:end;gap:0 8px;padding-top:4px}
.hdr svg{grid-row:1/3;margin-left:-14px}
.hdr h1{font-size:44px;line-height:46px;font-variation-settings:'SOFT' 100}.age{font:500 16px var(--fb);color:var(--textSecondary)}
.together{grid-column:1/3;margin-top:2px}
.card-title{font-size:21px}
.path{position:relative;display:flex;flex-direction:column;gap:14px;padding-left:4px}
.path:before{content:'';position:absolute;left:11px;top:12px;bottom:12px;width:2px;background:var(--border)}
.step{display:flex;align-items:center;gap:14px;position:relative}
.node{width:16px;height:16px;border-radius:999px;border:3px solid currentColor;background:var(--card);flex:none;margin-left:0}
.t-feed{color:var(--feed)}.t-sleep{color:var(--sleep)}.t-diaper{color:var(--diaper)}
.step.first .node{background:currentColor}
.sl{flex:1}.lbl{font:600 16px var(--fb)}.basis{font-size:13px;line-height:18px;color:var(--textSecondary)}
.nt{font:600 21px var(--fh);color:var(--text)}
.step.first .nt{font-size:25px}
.rem{display:flex;gap:12px;align-items:center;border-top:1.5px dashed var(--border);padding-top:12px}
.tog{width:52px;height:32px;border-radius:999px;background:var(--primary);flex:none;position:relative}.tog b{position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:999px;background:var(--onPrimary)}
.quick{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.q{background:var(--card);border:1.5px solid var(--border);border-radius:var(--r-btn);min-height:76px;padding:14px 16px;display:flex;align-items:center;gap:12px;font:600 17px var(--fb);color:var(--text)}
.q .big{width:30px;height:30px}.q.t-sleep .big{color:var(--sleep)}.q.t-feed .big{color:var(--feed)}.q.t-diaper .big{color:var(--diaper)}
.diap{grid-column:1/3}.dw{margin-left:auto;display:flex;gap:6px}.dw i{font-style:normal;min-height:48px;min-width:60px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--diaperSoft);color:var(--text);font:600 15px var(--fb)}
.tl{display:flex;align-items:center;gap:12px;min-height:52px;border-top:1px solid var(--border);padding-top:8px}
.tl:first-of-type{border-top:none}
.tm{width:92px;font:500 14px var(--fb);color:var(--textSecondary)}.tic .ic{width:22px;height:22px}.tt{font:500 16px var(--fb)}
.bar{position:absolute;left:16px;right:16px;bottom:24px;height:64px;border-radius:24px 24px 24px 8px;background:var(--card);border:1.5px solid var(--border);display:flex;align-items:center;padding:6px;gap:6px}
.bar span{flex:1;height:100%;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--textSecondary)}
.bar span b{font:600 15px var(--fb)}.bar .on{background:var(--infoBackground);color:var(--text)}
.bar .chat{background:var(--primary);color:var(--onPrimary)}
`;

function homeC(d) {
  return `<div class="scroll" style="gap:14px">
  <header class="hdr"><div><h1>Mia</h1><div class="pill">13 weeks old</div></div>${MASCOT.c(128)}</header>
  <div class="small muted" style="margin-top:-6px">You and your partner are both here.</div>
  <section class="card nextup"><div class="card-title" role="heading">Next up</div>
    <div class="grid">${NEXT.map((n, i) => `<div class="tilen t-${typeIcon(n.type)} ${i < 2 ? 'soon' : ''}">
      <div class="tl1">${icon(typeIcon(n.type), 'duotone')}<span>${n.label}</span></div><div class="nt">${n.time}</div><div class="basis">${n.basis}</div></div>`).join('')}</div>
    <div class="rem"><span class="small muted">${REMIND}</span>${toggle}</div></section>
  <section class="quick">
    <div class="qb t-sleep">${icon('sleep', 'duotone', 'ic big')}<span>Start sleep</span></div>
    <div class="qb t-feed">${icon('feed', 'duotone', 'ic big')}<span>Feed</span></div>
  </section>
  <section class="drow"><span class="dl t-diaper">${icon('diaper', 'duotone')}Diaper</span><span class="db">Wet</span><span class="db">Dirty</span><span class="db">Both</span></section>
  <section><div class="card-title" style="margin:4px 2px 8px">Today</div>
    ${TIMELINE.slice(0, 2).map((r) => `<div class="tlr"><span class="tic t-${r.type}">${icon(r.type, 'duotone')}</span><div style="flex:1"><div class="tt">${r.text}</div>${r.partner ? '<div class="small muted">by your partner</div>' : ''}</div><span class="tm">${r.time}</span></div>`).join('')}
  </section></div>
  <div class="fab"><span class="m">${icon('mic', 'duotone')}</span><span>Chat</span></div>`;
}
const homeCCss = `
.hdr{display:flex;align-items:center;justify-content:space-between}
.hdr h1{font:800 46px/48px var(--fh)}
.pill{display:inline-block;margin-top:4px;padding:4px 12px;border-radius:999px;background:var(--infoBackground);font:700 15px var(--fb);border:2px solid var(--border)}
.card-title{font:700 21px var(--fh)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tilen{border-radius:16px;padding:12px;background:var(--surface);display:flex;flex-direction:column;gap:2px}
.tilen.t-feed{background:var(--feedSoft);--duo:var(--card)}.tilen.t-sleep{background:var(--sleepSoft);--duo:var(--card)}
.tl1{display:flex;align-items:center;gap:6px;font:700 15px var(--fb)}
.t-feed .ic{color:var(--feed)}.t-sleep .ic{color:var(--sleep)}.t-diaper .ic{color:var(--diaper)}
.tilen .ic{width:22px;height:22px}
.nt{font:700 23px/30px var(--fh);letter-spacing:-.2px}
.basis{font-size:13px;line-height:17px;color:var(--textSecondary)}
.rem{display:flex;gap:12px;align-items:center}
.tog{width:52px;height:32px;border-radius:999px;background:var(--primary);flex:none;position:relative}.tog b{position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:999px;background:var(--onPrimary)}
.quick{display:flex;gap:12px}
.qb{flex:1;min-height:64px;border-radius:var(--r-btn);background:var(--primary);color:var(--onPrimary);display:flex;align-items:center;justify-content:center;gap:10px;font:700 19px var(--fh);box-shadow:0 4px 0 var(--primaryPressed);--duo:var(--primaryPressed)}
.qb .big{width:30px;height:30px;color:var(--onPrimary)!important}
.drow{display:flex;gap:8px;align-items:center;background:var(--card);border:2px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow);padding:8px}
.dl{display:flex;align-items:center;gap:6px;font:700 16px var(--fb);padding:0 6px;flex:1}
.db{min-height:48px;min-width:66px;border-radius:12px;background:var(--diaperSoft);display:flex;align-items:center;justify-content:center;font:700 16px var(--fb)}
.tlr{display:flex;align-items:center;gap:12px;background:var(--card);border:2px solid var(--border);border-radius:var(--r-row);padding:8px 14px;min-height:60px;margin-bottom:8px}
.tic{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center}
.tic.t-diaper{background:var(--diaperSoft)}.tic.t-sleep{background:var(--sleepSoft)}.tic.t-feed{background:var(--feedSoft)}
.tt{font:700 16px var(--fb)}.tm{font:700 15px var(--fb);color:var(--textSecondary)}
.fab{position:absolute;right:18px;bottom:28px;height:62px;border-radius:20px;background:var(--card);color:var(--text);border:2px solid var(--text);display:flex;align-items:center;gap:10px;padding:0 20px 0 8px;font:800 19px var(--fh);box-shadow:0 4px 0 var(--text)}
.fab .m{width:46px;height:46px;border-radius:14px;background:var(--primary);color:var(--onPrimary);display:flex;align-items:center;justify-content:center;--duo:var(--primaryPressed)}
`;

// ---------- CHAT (confirm card + escalation), shared structure, direction icons ----------
function chatTop(d, st) {
  return `<div class="topbar"><span class="iconbtn" aria-label="Back">${icon('back', 'outline')}</span>
  <h2 style="font-size:26px;flex:1">Chat</h2></div>
  <div style="padding:0 20px 10px"><div class="seg"><span class="on">Shared</span><span>Private</span></div>
  <div class="small muted" style="margin-top:8px">You and your partner both see this conversation.</div></div>`;
}
function chatTopCompact(d, st) {
  return `<div class="topbar pin"><span class="iconbtn" aria-label="Back">${icon('back', 'outline')}</span>
  <h2 style="font-size:24px;flex:1">Chat</h2><div class="seg" style="width:200px;background:var(--surface)"><span class="on">Shared</span><span>Private</span></div></div>`;
}
function composer(d, st) {
  return `<div class="composer"><div class="input">Wet and dirty diaper just now</div>
  <div><div class="mic" aria-label="Hold to record a voice log">${icon('mic', st)}</div><div class="miclabel">Hold to talk</div></div></div>`;
}
function confirm(d) {
  const st = DIRS[d].icons;
  return `${chatTopCompact(d, st)}<div class="scroll cf" style="padding-top:0;gap:10px;margin-top:-30px">
  <div class="bubble me"><span class="meta">You · 14:51 · voice</span><span class="btext">she drank 90 ml twenty minutes ago, she’s asleep now</span></div>
  <div class="bubble bot"><span class="meta">Little Rhythm · 14:51</span><span class="btext">Got it. Check the times, then confirm.</span></div>
  <section class="card pc t-feed"><div class="card-title"><span class="pi">${icon('feed', st)}</span>Feed</div>
    <div class="field"><span class="fl">Time</span><span class="v">Mon 2 Nov, 14:31</span><span class="chg">Change ›</span></div>
    <div class="fr"><div class="seg"><span class="on">Bottle</span><span>Breast</span></div>
    <div><div class="field-l">Amount</div><div class="stepper"><span class="sb">−</span><span class="val">90 ml</span><span class="sb">+</span></div></div></div>
    <div class="row2"><span class="btn primary">Confirm</span><span class="btn secondary">Discard</span></div></section>
  <section class="card pc t-sleep"><div class="card-title"><span class="pi">${icon('sleep', st)}</span>Sleep</div>
    <div class="note">Time not mentioned, set to now. Edit if wrong.</div>
    <div class="field"><span class="fl">Fell asleep</span><span class="v">Mon 2 Nov, 14:51</span><span class="chg">Change ›</span></div>
    <div class="field"><span class="fl">Woke up</span><span class="v muted">Still asleep</span><span class="chg">Set ›</span></div>
    <div class="row2"><span class="btn primary">Confirm</span><span class="btn secondary">Discard</span></div></section>
  </div>${composer(d, st)}`;
}
const confirmCss = `
.pc{gap:9px;padding:14px 16px}
.cf .bubble{padding:9px 14px;gap:2px}.cf .btext{font-size:16px;line-height:23px}
.cf .field{min-height:50px}.cf .field-l{margin-bottom:4px}.cf .btn{min-height:50px}.cf .note{padding:7px 12px;font-size:14px;line-height:20px}
.cf .card-title{font-size:18px}.cf .pi{width:36px;height:36px}
.cf .seg span{min-height:44px}
.pin{position:relative;z-index:2;background:var(--background);box-shadow:0 8px 10px -6px var(--shadow-c);border-bottom:1px solid var(--border)}
.cf{position:relative;z-index:1}
.fl{font:700 14px var(--fb);color:var(--textSecondary);width:84px}
.cf .v{font-size:16px}
.fr{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}
.fr .seg span{min-height:48px;padding:0 8px}
.fr .stepper{gap:6px}.fr .sb{width:48px}.fr .val{font-size:22px;min-width:66px;text-align:center}
.pi{width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center}
.t-feed .pi{background:var(--feedSoft);color:var(--feed);--icon-cut:var(--feedSoft);--duo:var(--card)}
.t-sleep .pi{background:var(--sleepSoft);color:var(--sleep);--icon-cut:var(--sleepSoft);--duo:var(--card)}
.mic{--icon-cut:var(--primary);--duo:var(--primaryPressed)}
`;
function escalation(d) {
  const st = DIRS[d].icons;
  return `${chatTop(d, st)}<div class="scroll" style="padding-top:2px;gap:12px">
  <div class="bubble me"><span class="meta">You · 14:46</span><span class="btext">she feels warm, is that normal?</span></div>
  <div class="esc" role="alert"><div class="t"><span class="warn" aria-hidden="true">⚠</span><span style="flex:1">I can’t help with health questions</span></div>
    <div class="b">Please contact your paediatrician or doctor. In an emergency, call 112.</div></div>
  <div class="bubble me"><span class="meta">You · 14:49</span><span class="btext">she’s breathing really fast</span></div>
  <div class="esc urgent" role="alert"><div class="t"><span class="warn" aria-hidden="true">⚠</span><span style="flex:1;color:var(--errorText)">This may be an emergency</span></div>
    <div class="b">Call 112 now.</div><span class="btn danger">Call 112</span></div>
  </div>${composer(d, st)}`;
}

// ---------- write ----------
const HOME = { a: [homeA, homeACss], b: [homeB, homeBCss], c: [homeC, homeCCss] };
for (const [k, dir] of Object.entries(DIRS)) {
  const out = path.join(ROOT, dir.slug);
  fs.mkdirSync(out, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    fs.writeFileSync(path.join(out, `home-${scheme}.html`), page(dir, scheme, 'Home', HOME[k][0](k), HOME[k][1]));
    fs.writeFileSync(path.join(out, `confirm-card-${scheme}.html`), page(dir, scheme, 'Confirm card', confirm(k), confirmCss));
    fs.writeFileSync(path.join(out, `escalation-${scheme}.html`), page(dir, scheme, 'Escalation', escalation(k)));
  }
  // The mascot alone, as one token-driven SVG (for the README and a later react-native-svg port).
  fs.writeFileSync(path.join(out, 'mascot.svg'), MASCOT[k](240).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
}
console.log('written');

// ---------- icon + mascot sheet (light and dark side by side) ----------
for (const [k, dir] of Object.entries(DIRS)) {
  const half = (scheme) => {
    const st = dir.icons;
    const cells = [['feed','feed','Feed'],['sleep','sleep','Sleep'],['diaper','diaper','Diaper'],['mic','primary','Mic'],['chat','primary','Chat'],['bell','primary','Reminders']]
      .map(([n, tok, l]) => `<div class="cell"><span class="ib" style="color:var(--${tok});background:var(--${tok === 'primary' ? 'infoBackground' : tok + 'Soft'});--icon-cut:var(--${tok === 'primary' ? 'infoBackground' : tok + 'Soft'})">${icon(n, st)}</span><span>${l}</span></div>`).join('');
    return `<section class="half" style="${rootVars(dir, scheme).replace(':root{', '').replace(/}$/, '')}"><h3>${scheme}</h3><div class="m">${MASCOT[k](150)}</div><div class="cells">${cells}</div></section>`;
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?${dir.fonts.link}&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{display:flex;width:824px;height:520px}
.half{flex:1;background:var(--background);color:var(--text);font-family:var(--fb);padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px}
h3{font:600 18px var(--fh);text-transform:capitalize;align-self:flex-start}.cells{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:100%}
.cell{display:flex;flex-direction:column;align-items:center;gap:6px;font:600 14px var(--fb)}
.ib{width:64px;height:64px;border-radius:var(--r-btn);display:flex;align-items:center;justify-content:center;--duo:var(--card)}.ib .ic{width:32px;height:32px}</style></head>
<body>${half('light')}${half('dark')}</body></html>`;
  fs.writeFileSync(path.join(ROOT, dir.slug, 'icons-mascot.html'), html);
}
