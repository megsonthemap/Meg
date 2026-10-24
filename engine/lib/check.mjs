// The QA gate: the house rules that can be measured, measured, so a cut that breaks one never
// reaches her. `reel.mjs check <slug>` runs it on demand; `render` runs it at the end of every
// real cut and refuses to call that cut done when something fails.
//
// Everything here is measured from what is actually drawn, not re-derived from the plan:
//   - the "text" QA pass renders every caption, hook, label, big word and end card alone on
//     transparent, so a text box is the pixels of the real glyphs in the real font;
//   - the "plate" QA pass renders the footage with nothing over it, so her face is still visible
//     under a b-roll band and the background behind a caption can be sampled.
// Re-deriving the layout from plan.json would drift away from Reel.tsx the first time either moved.
//
// Hard failure vs warning, and why:
//   FAIL   Text on her face. Her first rule, and the one that makes a cut unusable. There is no
//          reading of the frame where this was meant.
//   FAIL   A b-roll band or backdrop covering her face. Same rule, different cause: the blur seam
//          lands on her hairline and the shot is gone.
//   FAIL   Text above the top safe line or inside the bottom safe strip. Instagram's own chrome
//          eats it, so it is not a taste call, it is text nobody can read.
//   FAIL   Contrast under the brand minimum. White on a bright wall disappears; this is the fix
//          she already wrote down (charcoal on bright), not a new opinion.
//   FAIL   Captions under the minimum size. A written, numeric rule.
//   FAIL   A colour on a text element that is not in brand.json. Text is the brand; an off-palette
//          caption or hook colour is always a mistake.
//   FAIL   A written word that belongs to the kit rather than to this person: an unfilled blank
//          from the starting point, or the kit author's own end card, DM line, big word or
//          counter label. Two reels cut by two strangers should not share a sentence. The way
//          through is brand/voice.json, which says in this person's own words how they ask for
//          things; a phrase they really do use is theirs the moment it is written down there.
//   WARN   An opening identical to the cut before it (same hook style into the same first effect).
//          Measurable sameness. A warning rather than a block, because a series is a real thing.
//   WARN   A colour elsewhere in the plan (a swatch, a sticker chrome, a mock-up card). Those are
//          sometimes content rather than brand, so they are worth a look, not a block.
//   WARN   Text under the right-hand icon column. How far the icons reach depends on the caption
//          length and the viewer's app, so it is a judgement call with a real cost either way.
//   WARN   "phrase" captions. A look she moved on from, still available on purpose.
//   WARN   An effect sitting where no words are spoken. Close to her "effects sit on words she
//          says" rule, but silence is sometimes deliberate, so it asks rather than blocks.
//   WARN   No punch word in the whole reel. Nothing is technically wrong with the frame; it is
//          the house look missing.
// Whether the b-roll is really about the words being spoken is still a judgement. What IS measurable
// now is whether anybody ever said what the footage shows: plan.assets carries one line per asset
// the cut puts on screen (see lib/assets.mjs), so an undescribed asset fails and a described one
// whose words have nothing in common with the line underneath it asks. Whether the match is a good
// one is still hers to call, and the summary says so rather than pretending to have looked.
//
// Learned rules. brand/rules.json holds the rules she has approved from her own review notes. A new
// one is prose that Claude reads; once the same correction has happened on a second reel and she
// says yes to promoting it, it is enforced here instead, because prose can be skipped and a check
// cannot. LEARNED below is the whole promotion path: one entry per rule shape that can honestly be
// measured. A shape that is not in LEARNED cannot be promoted, and learn.mjs says so in plain words
// on the rule itself rather than letting her believe something is being watched.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {execFileSync} from 'child_process';
import {enforcedChecks} from './learn.mjs';
import {loadVoice, borrowedCopy, openingRepeat} from './voice.mjs';

const W = 1080, H = 1920;
// Where the face usually is in a 9:16 talking-head shot, as fractions of the frame (Vision's face
// box shape). Used only when there is no face detection on this computer (Windows for now).
const FACE_ZONE = {x: 0.32, y: 0.2, w: 0.36, h: 0.2};
// What counts as "this pixel is the element, not its shadow". A caption panel is drawn at 88%
// opacity, so a threshold up at 230 would miss the panel and measure the glyphs against the wall
// behind it instead of against the panel they are actually on.
const SOLID = 200;
// And what counts as "this is the background". The engine draws a dark glow behind thin caption
// text, and that glow is part of what the letters are read against, so the sample has to include
// it: measuring the bare wall underneath understates every caption by about half a stop.
const BG_MAX = 64;
const SCALE = 0.5;                 // QA stills render at half size: 540x960 is plenty for boxes and luma
const PW = Math.round(W * SCALE), PH = Math.round(H * SCALE);

// ---------- pixels ----------
// PNG in, raw RGBA out. Node's own zlib is the only thing needed: Remotion writes 8-bit RGB/RGBA
// PNGs, so this reads the header, inflates the image data and undoes the per-row filters. An image
// library would be a dependency the kit does not need, and the ffmpeg Remotion ships has no raw
// video muxer to pipe through.
export function rgba(file) {
  const png = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, colour = 6, depth = 8;
  const idat = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = png.readUInt32BE(p + 8); h = png.readUInt32BE(p + 12); depth = png[p + 16]; colour = png[p + 17]; }
    else if (type === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += len + 12;
  }
  if (depth !== 8 || (colour !== 6 && colour !== 2)) throw new Error(`check: unexpected PNG format in ${path.basename(file)} (depth ${depth}, colour type ${colour})`);
  const bpp = colour === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4, 255);
  const stride = w * bpp;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(row, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (f === 1) row[i] = (row[i] + a) & 255;
      else if (f === 2) row[i] = (row[i] + b) & 255;
      else if (f === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    row.copy(prev);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, i = x * bpp;
      out[o] = row[i]; out[o + 1] = row[i + 1]; out[o + 2] = row[i + 2]; out[o + 3] = bpp === 4 ? row[i + 3] : 255;
    }
  }
  return {buf: out, w, h};
}
const px = (buf, w, x, y) => { const i = (y * w + x) * 4; return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; };
// WCAG relative luminance and contrast ratio: the same measure used for text on the web, which is
// what a caption on a wall is.
export const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
export const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

// Text pixels grouped into lines: rows that hold ink, split wherever a run of empty rows appears.
// One box per line is the right grain: a line is what a reader's eye lands on, and it is what
// either clears her face or does not.
function textLines(buf, w, h) {
  const rowHas = new Array(h).fill(false);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3] > 128) { rowHas[y] = true; break; }
  const lines = [];
  let y0 = -1, gap = 0;
  const GAP = Math.round(h * 0.012); // rows of nothing that mean "this is a different line"
  for (let y = 0; y <= h; y++) {
    if (y < h && rowHas[y]) { if (y0 < 0) y0 = y; gap = 0; continue; }
    if (y0 < 0) continue;
    if (++gap <= GAP && y < h) continue;
    const y1 = y - gap;
    let x0 = w, x1 = 0;
    for (let yy = y0; yy <= y1; yy++) for (let x = 0; x < w; x++) if (buf[(yy * w + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (x1 >= x0) lines.push({x0, y0, x1, y1});
    y0 = -1; gap = 0;
  }
  return lines;
}

// The colour of the glyphs, and the colour of what is behind them. Background is sampled inside the
// line's own box wherever the text is NOT, which is the wall the reader actually sees it against.
// Text on its own bar (her hook bars, her step labels) is a different thing from bare text: the bar
// is what it has to be read against, and the bar is what keeps it off the wall. A box whose pixels
// are mostly solid is a panel, not glyphs.
function panelled(text, w, box) {
  // Cheap precondition only: a bar fills its box with solid colour. Heavy display letters do too,
  // so this alone cannot tell them apart; onPanel() settles it by looking at the colours.
  let solid = 0, all = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) { all++; if (text[(y * w + x) * 4 + 3] > SOLID) solid++; }
  return all ? solid / all > 0.4 : false;
}

// Glyph colour against bar colour, inside a panelled box: split the solid pixels at the midpoint of
// their luminance range, and take the smaller group as the lettering.
function onPanel(text, w, box) {
  const pix = [];
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) { const i = (y * w + x) * 4; if (text[i + 3] > SOLID) pix.push([text[i], text[i + 1], text[i + 2]]); }
  if (pix.length < 20) return {text: null, bg: null};
  const ls = pix.map(lum);
  const mid = (Math.min(...ls) + Math.max(...ls)) / 2;
  const mean = (g) => g.length ? [0, 1, 2].map((k) => g.reduce((a, v) => a + v[k], 0) / g.length) : null;
  const dark = pix.filter((_, i) => ls[i] <= mid), light = pix.filter((_, i) => ls[i] > mid);
  if (!dark.length || !light.length) return {text: null, bg: null};
  const out = dark.length < light.length ? {text: mean(dark), bg: mean(light)} : {text: mean(light), bg: mean(dark)};
  // One solid colour split in two is a heavy word and its own antialiasing, not lettering on a
  // bar: real lettering on a bar is always a long way apart in luminance. Say so, and let the
  // caller measure the word against the wall behind it instead.
  return contrast(out.text, out.bg) < 2 ? {text: null, bg: null} : out;
}

function colours(text, plate, w, box) {
  let tr = 0, tg = 0, tb = 0, tn = 0, br = 0, bg = 0, bb = 0, bn = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = (y * w + x) * 4;
    if (text[i + 3] > SOLID) { tr += text[i]; tg += text[i + 1]; tb += text[i + 2]; tn++; }
    else if (text[i + 3] < BG_MAX) { br += plate[i]; bg += plate[i + 1]; bb += plate[i + 2]; bn++; }
  }
  return {
    text: tn ? [tr / tn, tg / tn, tb / tn] : null,
    bg: bn ? [br / bn, bg / bn, bb / bn] : null,
  };
}

// ---------- rules ----------
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const ss = (t) => `${t.toFixed(1)}s`;

// Vision gives the face only. Hair, forehead and chin sit outside it, and a caption touching any of
// those still reads as "over her". The box is grown to the head, generously upward.
// Vision gives the face only. `face` is that, with a small margin, and it is the hard rule: eyes,
// nose and mouth covered is the failure she described. `head` adds the hair, forehead and chin,
// where text is usually a mistake but is sometimes a deliberate crop, so that one only asks.
function headBox(f) {
  const m = 0.08;
  return {
    face: {x0: (f.x - f.w * m) * W, x1: (f.x + f.w * (1 + m)) * W, y0: (f.y - f.h * m) * H, y1: (f.y + f.h * (1 + m)) * H},
    head: {x0: (f.x - f.w * 0.3) * W, x1: (f.x + f.w * 1.3) * W, y0: (f.y - f.h * 0.6) * H, y1: (f.y + f.h * 1.3) * H},
  };
}

// The promotion path. One entry per rule shape that can honestly be measured.
//   tune  — the rule tightens a threshold an existing check already measures, so the cut starts
//           failing something it used to be allowed. This is the cheapest and strongest kind.
//   own   — the rule is its own measurement, and adds its own line.
// Anything not here cannot become a check. learn.mjs carries the reason on the rule itself.
const LEARNED = {
  'caption-size-floor': {kind: 'tune', tune: (t, p) => { t.minSize = Math.max(t.minSize, p.min ?? 0); }},
  'min-contrast': {kind: 'tune', tune: (t, p) => { t.minContrast = Math.max(t.minContrast, p.min ?? 0); }},
  // She keeps asking for text to be moved off her: the grown head box stops being a question.
  'text-clear-zone': {kind: 'tune', tune: (t) => { t.headHard = true; }},
  'punch-min-seconds': {kind: 'tune', tune: (t, p) => { t.punchSeconds = Math.max(t.punchSeconds ?? 0, p.seconds ?? 0); }},
  'effect-on-spoken-words': {kind: 'tune', tune: (t) => { t.fxSilenceHard = true; }},
  // B-roll that has nothing in common with the words under it stops being a question.
  'broll-described': {kind: 'tune', tune: (t) => { t.brollMatchHard = true; }},
  'no-effect-type': {kind: 'own', run: (plan, p, add, rule) => {
    for (const f of plan.fx ?? []) if ((p.types ?? []).includes(f.type)) add(true, f.start ?? 0, `the ${f.type} effect at ${ss(f.start ?? 0)} is one she asked not to be used`, `cut it, or replace it with a type-led effect. Her words: ${rule.then}`);
  }},
};

export async function check(slug, ctx, opts = {}) {
  const {P, plan, brand, log, every = 1} = ctx;
  const safe = brand.reel?.safe ?? {};
  const topLine = (safe.top ?? 0.12) * H, bottomLine = (1 - (safe.bottom ?? 0.2)) * H;
  const iconX = (safe.iconColumn ?? 0.86) * W, minSize = safe.minCaptionSize ?? 56, minContrast = safe.minContrast ?? 4.5;
  const fails = [], warns = [], notes = [];
  const add = (hard, t, what, fix) => (hard ? fails : warns).push({t, what, fix});

  // Rules she approved and then agreed to have enforced. They either tighten a threshold below or
  // measure their own thing; either way they are hers, with the note that produced them on file.
  const learned = ctx.studio ? enforcedChecks(ctx.studio) : [];
  const tuned = {minSize, minContrast, headHard: false, fxSilenceHard: false, brollMatchHard: false, punchSeconds: 0};
  for (const r of learned) {
    const L = LEARNED[r.check];
    if (!L) { notes.push(`learned rule "${r.label}" names a check (${r.check}) this engine does not measure, so it was not applied`); continue; }
    if (L.kind === 'tune') L.tune(tuned, r.params ?? {});
  }
  if (learned.length) notes.push(`${learned.length} learned rule${learned.length === 1 ? '' : 's'} enforced here, from her own review notes (brand/rules.json)`);

  // --- rules that need no pixels ---
  const cap = plan.captions ?? {};
  if (cap.mode !== 'off' && (cap.size ?? 60) < tuned.minSize) {
    add(true, 0, `captions are ${cap.size}px, under the ${tuned.minSize}px floor`, `set captions.size to ${tuned.minSize} or more in edit.json`);
  }
  if (cap.mode === 'phrase') {
    add(false, 0, 'captions are in "phrase" mode, the look she moved on from', `use "mode": "stack" unless this reel really wants the one-huge-word look`);
  }
  // The punch colour is the thing people recognise, so "there is one somewhere" is not the test.
  // Three words of a quarter second each in a 38s reel is a reel with no punch colour in it.
  if (cap.mode !== 'off') {
    const punch = (cap.words ?? []).filter((w) => w.style === 'punch' || w.style === 'caps');
    const held = punch.reduce((a, w) => a + (w.e - w.s), 0);
    const wanted = Math.max(1.5, plan.duration * 0.05, tuned.punchSeconds);
    if (!punch.length) add(false, 0, 'no word anywhere in the reel is in the punch colour', 'add an emphasis entry in edit.json so the line people should remember lands in the punch colour');
    else if (held < wanted) add(false, 0, `punch words are spoken for ${held.toFixed(1)}s of a ${plan.duration.toFixed(0)}s reel, so the punch colour barely appears`, `punch a longer phrase, or add more emphasis entries, to get to about ${wanted.toFixed(0)}s`);
  }

  // Energy: how busy the edit is meant to be. Quiet keeps it clean (a few moments, no sound effects);
  // Full wants something happening every few seconds. A warning, never a block: she can go off-brief.
  {
    const moves = (plan.fx ?? []).filter((f) => !['shake', 'flash'].includes(f.type));
    const sfx = (plan.sfx ?? []).length;
    if (plan.energy === 'quiet' && moves.length > 3) add(false, 0, `Energy is Quiet but the cut has ${moves.length} effects`, 'keep the 2 or 3 that carry the story and let the words do the rest');
    if (plan.energy === 'quiet' && sfx) add(false, 0, `Energy is Quiet but the cut has ${sfx} sound effect${sfx === 1 ? '' : 's'}`, 'take the sound effects out for a quiet reel');
    if (plan.energy === 'full' && plan.duration > 12 && moves.length < plan.duration / 6) add(false, 0, `Energy is Full but there are only ${moves.length} effects in ${plan.duration.toFixed(0)}s`, 'aim for something on screen every 4 to 6 seconds, each on a line she says');
  }

  // Design v2 layout rules (from the 21 to 22 Oct design studies): type comes in two sizes, tiny or
  // huge, nothing medium; nothing designed in the bottom 16%; no more than 4 things on screen at once.
  if (plan.design === 2) {
    const capPct = (px) => (px * 0.72) / 1920 * 100;
    for (const f of plan.fx ?? []) {
      const size = f.size ?? (f.type === 'bigword' ? 260 : null);
      if (size && ['bigword', 'wrap', 'glass', 'splitflap', 'scratch', 'burn'].includes(f.type)) {
        const c = capPct(size);
        if (c > 3.5 && c < 7) add(false, f.start, `the ${f.type} at ${f.start.toFixed(1)}s is medium-sized type (${c.toFixed(1)}% of the frame), which reads as unfinished`, 'go big (size 190 or more) or small (size 95 or less)');
      }
      if (f.y !== undefined && f.y > 0.84 && !['comment', 'dm', 'ticker'].includes(f.type)) add(false, f.start, `the ${f.type} at ${f.start.toFixed(1)}s sits in the bottom 16% of the frame`, 'move it up: designed things live in the top 40% while her face is on screen');
    }
    const starts = [...new Set((plan.fx ?? []).flatMap((f) => [f.start, f.start + 0.5]))];
    for (const t of starts) {
      const on = (plan.fx ?? []).filter((f) => !['shake', 'flash', 'dzoom', 'vertigo'].includes(f.type) && t >= f.start && t < f.start + (f.dur ?? 0.6)).length;
      if (on > 4) { add(false, t, `${on} things are on screen at ${t.toFixed(1)}s`, 'keep it to 2 to 4 at once'); break; }
    }
  }

  // brand colours, by name, so the message can say which one was meant
  const palette = Object.entries(brand.colours).map(([k, v]) => [k, v.toUpperCase()]);
  const known = new Set(palette.map(([, v]) => v));
  const normal = (v) => { let h = v.trim().toUpperCase(); if (/^#[0-9A-F]{3}$/.test(h)) h = '#' + h.slice(1).split('').map((c) => c + c).join(''); return h.slice(0, 7); };
  // Colour fields that paint TEXT are held to the palette; everything else is flagged softly,
  // because a swatch or a mock-up card is sometimes showing a colour rather than wearing one.
  const TEXT_COLOUR_KEYS = new Set(['colour', 'color', 'bar', 'barText', 'c', 'textColour']);
  const walkColours = (node, trail = []) => {
    if (Array.isArray(node)) return node.forEach((v, i) => walkColours(v, [...trail, String(i)]));
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())) {
        const h = normal(v);
        if (known.has(h)) continue;
        const where = [...trail, k].join('.');
        const near = palette.map(([n, p]) => [n, p, Math.abs(parseInt(p.slice(1), 16) - parseInt(h.slice(1), 16))]).sort((a, b) => a[2] - b[2])[0];
        add(TEXT_COLOUR_KEYS.has(k), node.start ?? 0, `${v} at ${where} is not a brand colour`, `use ${near[1]} (${near[0]}) from brand.json, or add this colour to brand.json if it belongs there`);
      } else walkColours(v, [...trail, k]);
    }
  };
  walkColours({hook: plan.hook, captions: {...cap, words: undefined}, fx: plan.fx, labels: plan.labels, end: plan.end, grade: plan.grade});

  // --- the words are this person's own ---
  // The sameness nobody could put their finger on was mostly copy. Both starting points ended on
  // the same two lines, one carried the kit author's own DM line, and the worked example that
  // teaches the shape carries her own big word and her own counter label. The shape is worth
  // teaching; the words are not transferable. So the gate measures it: a written word that belongs
  // to the kit, or a blank nobody filled in, fails the cut. brand/voice.json is the way through —
  // once this person has said how they ask for things, their own words are theirs even when they
  // happen to overlap. A FAIL rather than a warning because a reel that ends in somebody else's
  // call to action is not a taste call, it is the wrong reel.
  if (ctx.studio) {
    const voice = loadVoice(ctx.studio);
    for (const h of borrowedCopy(plan, voice, {slug})) {
      if (h.kind === 'placeholder') add(true, h.t, `"${h.text}" at ${h.where} is ${h.whose}`, 'write what this person actually says there, or cut the effect');
      else add(true, h.t, `"${h.text}" at ${h.where} is ${h.whose}, not theirs`, voice ? 'write it from what they said in this reel, or from brand/voice.json; if they really do say it, add it to voice.json so it is on the record' : 'ask them how they end a reel and what they want people to do, write brand/voice.json, and use their words here');
    }
    // Same hook style and same first effect as the cut before: the "every reel looks the same"
    // complaint, in the only place it can be measured. A warning, because a deliberate series is a
    // real thing and only the owner knows whether this is one.
    const rep = openingRepeat(ctx.studio, slug, plan);
    if (rep) add(false, 0, `this opens exactly like ${rep.slugs.join(' and ')}: a ${rep.mode} hook into ${rep.first}`, 'open it another way, or say in one line why this reel is part of a series');
  }

  // effects must sit on words she says
  const words = cap.words ?? [];
  for (const f of plan.fx ?? []) {
    if (!f.dur) continue;
    const spoken = words.some((w) => w.e > f.start && w.s < f.start + f.dur);
    if (!spoken) add(tuned.fxSilenceHard, f.start, `the ${f.type} effect runs over ${ss(f.start)}–${ss(f.start + f.dur)} with nothing spoken under it`, 'move it onto the words it illustrates, or cut it');
  }

  // learned rules that are their own measurement
  for (const r of learned) { const L = LEARNED[r.check]; if (L?.kind === 'own') L.run(plan, r.params ?? {}, add, r); }

  // --- described footage ---
  // Not "is this the right b-roll", which is a judgement. Two things that are not:
  //   does anything on disk say what this footage shows, and
  //   does what it shows have a single word in common with the line being spoken under it.
  const media = (plan.fx ?? []).filter((f) => ['band', 'backdrop', 'deck', 'sticker', 'folder', 'wall', 'orbit', 'phone', 'uiworld', 'envelope', 'cover', 'spotlight'].includes(f.type)).length + (plan.inserts ?? []).length;
  if (!plan.assets && media) {
    notes.push(`${media} piece${media === 1 ? '' : 's'} of footage or photography on screen in this cut, and nothing on disk says what any of it shows. Describe it: node reel.mjs describe ${slug}`);
  }
  for (const a of plan.assets ?? []) {
    if (a.unknown) add(true, a.start, `the ${a.type} at ${ss(a.start)} uses ${a.ref}, which nothing describes`, `say what it shows, then render again: node reel.mjs describe ${slug} --set "${a.ref}" "what it shows"`);
    else if (a.matched === false) add(tuned.brollMatchHard, a.start, `the ${a.type} at ${ss(a.start)} shows "${a.shows}" while she is saying "${(a.spoken ?? '').slice(0, 50)}": not one word in common`, `use footage whose description matches the line, or a type-led effect (bigword, counter, label, colourbg) instead`);
  }

  // --- rules that need pixels ---
  if (opts.still) {
    const dir = P(slug, 'out', 'check');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    // Sampling every second: a caption group lives about a second, so this sees each one at least
    // once, and it keeps a 40s reel to under a hundred stills instead of eleven hundred frames.
    const times = [];
    for (let t = every / 2; t < plan.duration; t += every) times.push(+t.toFixed(2));
    log(`checking ${times.length} sampled seconds…`);

    const textFiles = [], plateFiles = [];
    for (const t of times) {
      const frame = Math.round(t * plan.fps);
      const tf = path.join(dir, `text_${String(frame).padStart(5, '0')}.png`);
      const pf = path.join(dir, `plate_${String(frame).padStart(5, '0')}.png`);
      await opts.still(frame, tf, 'text');
      await opts.still(frame, pf, 'plate');
      textFiles.push(tf); plateFiles.push(pf);
    }
    // faces, from the plate, in one pass
    // Without the face box (Mac only for now) the check cannot see where the face is, so it
    // measures against FACE_ZONE, where a talking head sits in a 9:16 selfie frame. That is a guess
    // about this footage, so anything it catches asks instead of failing.
    let faces = [];
    const guessed = !ctx.faceTool;
    if (guessed) {
      faces = times.map(() => [FACE_ZONE]);
      notes.push(`face detection is off (${ctx.faceWhy ?? 'no face tool'}), so text and b-roll were checked against a fixed face zone (the middle ${Math.round(FACE_ZONE.w * 100)}% of the width, ${Math.round(FACE_ZONE.y * 100)} to ${Math.round((FACE_ZONE.y + FACE_ZONE.h) * 100)}% down) and only warn. Look at the sheet for anything over the face.`);
    } else {
      try {
        const out = execFileSync(ctx.faceTool, plateFiles, {maxBuffer: 1 << 26}).toString().trim().split('\n');
        faces = out.map((l) => JSON.parse(l).faces);
      } catch (e) {
        notes.push(`face detection did not run (${String(e.message).split('\n')[0]}); text-on-face was not checked`);
      }
    }
    let seen = 0;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const {buf: text, w: tw} = rgba(textFiles[i]);
      const {buf: plate} = rgba(plateFiles[i]);
      // a stacked shot moves her down by shiftMain; the real face box sees that in the plate, the fixed zone has to be told
      const shifted = guessed ? (plan.fx ?? []).find((f) => f.type === 'band' && t >= f.start && t < f.start + f.dur)?.shiftMain ?? 0 : 0;
      const heads = (faces[i] ?? []).map((f) => headBox(shifted ? {...f, y: f.y + shifted} : f));
      const behindHer = (plan.cutRanges ?? []).some(([a, b2]) => t >= a && t < b2);
      if (heads.length) seen++;
      const boxes = textLines(text, tw, PH).map((b) => ({...b, X0: b.x0 / SCALE, X1: b.x1 / SCALE, Y0: b.y0 / SCALE, Y1: b.y1 / SCALE}));
      // which element a line of text belongs to, so the message names the thing to change
      const hook = plan.hook, end = plan.end;
      const nameOf = (b) => {
        if (end && t >= end.start) return {name: 'the end card', knob: 'end.y in edit.json'};
        // While a big word is up the engine hides the captions underneath it, so any text on the
        // frame then is the big word: a graphic, judged by eye, not a line anybody reads.
        const big = (plan.fx ?? []).find((f) => f.type === 'bigword' && t >= f.start && t < f.start + f.dur && !f.keepCaps);
        if (big) return {name: 'the big word', knob: `the big word's y in edit.json`, graphic: true};
        if (hook && t >= (hook.start ?? 0) && t <= hook.end && b.Y0 < (plan.captions.y ?? 0.6) * H) return {name: 'the hook', knob: 'hook.y in edit.json'};
        const lab = [...(plan.labels ?? []), ...(plan.fx ?? []).filter((f) => f.type === 'label').map((f) => ({...f, end: f.start + f.dur}))].find((l) => t >= l.start && t < l.end);
        if (lab && Math.abs(b.Y0 - (lab.y ?? 0.13) * H) < H * 0.08) return {name: 'the label', knob: 'the label\'s y in edit.json'};
        return {name: 'the caption line', knob: 'captions.y in edit.json'};
      };
      for (const b of boxes) {
        const full = {x0: b.X0, x1: b.X1, y0: b.Y0, y1: b.Y1};
        const area = (b.X1 - b.X0) * (b.Y1 - b.Y0);
        const el = nameOf(b);
        const onBar = panelled(text, tw, b);
        let c = onBar ? onPanel(text, tw, b) : null;
        const reallyOnBar = !!(c && c.text);
        if (!reallyOnBar) c = colours(text, plate, tw, b);
        // on her face
        // Inside a cutout range she is composited in FRONT of what is drawn, which is the
        // behind-the-head look working as intended, so text there is not over her.
        if (!behindHer) for (const h of heads) {
          const hard = overlap(full, h.face) > area * 0.06 || (tuned.headHard && overlap(full, h.head) > area * 0.12);
          if (hard || overlap(full, h.head) > area * 0.12) {
            add(hard && !guessed, t, `${el.name} at ${ss(t)} sits over ${guessed ? 'the fixed face zone, so it may be on her face' : `her ${hard ? 'face' : 'hair and forehead'}`}`, `move it clear of her: ${el.knob} below ${(h.head.y1 / H).toFixed(2)}, or above ${((h.head.y0 - (b.Y1 - b.Y0)) / H).toFixed(2)}`);
            break;
          }
        }
        // safe zones
        if (b.Y0 < topLine) add(!reallyOnBar, t, `${el.name} at ${ss(t)} starts at ${(b.Y0 / H * 100).toFixed(0)}% of frame height, above the ${(topLine / H * 100).toFixed(0)}% safe line`, `push it down: ${el.knob} at least ${((topLine / H) + 0.01).toFixed(2)}`);
        if (b.Y1 > bottomLine) add(true, t, `${el.name} at ${ss(t)} runs into the bottom ${((1 - bottomLine / H) * 100).toFixed(0)}% where the caption and buttons sit`, `raise it: ${el.knob} at most ${((bottomLine / H) - (b.Y1 - b.Y0) / H - 0.01).toFixed(2)}`);
        if (b.X1 > iconX) add(false, t, `${el.name} at ${ss(t)} reaches under the right-hand icon column`, el.name === 'the caption line' ? 'lower captions.maxWords so lines break earlier' : 'shorten the text so the line ends before the icons');
        // contrast
        if (c.text && c.bg) {
          const ratio = contrast(c.text, c.bg);
          // Two lines, not one. Under 3:1 the text is gone and the cut cannot go out; between 3:1
          // and the brand minimum it is thin but readable with the drop shadow, which is where her
          // own shipped reels sit, so it asks rather than blocks.
          if (ratio < tuned.minContrast) {
            // A big word is a graphic, not something anybody reads a sentence of, so it asks
            // instead of blocking. Reading text under 3:1 is gone and the cut cannot go out.
            const gone = ratio < 3 && !el.graphic;
            // the fix names the brand colour that actually holds against this wall, not the
            // first rule of thumb: on a mid-tone background neither white nor charcoal may clear it
            const best = palette.map(([n, v]) => [n, v, contrast(rgbOf(v), c.bg)]).sort((a, b2) => b2[2] - a[2])[0];
            const fix = best[2] >= tuned.minContrast
              ? `use ${best[1]} (${best[0]}) here`
              : `nothing in the palette clears ${tuned.minContrast}:1 on this background (${best[1]} is the best at ${best[2].toFixed(1)}:1), so put the text on a panel: "box": true in captions`;
            add(gone, t, `${el.name} at ${ss(t)} is ${hex(c.text)} on ${hex(c.bg)}${reallyOnBar ? ' (its own bar)' : ''}: ${ratio.toFixed(1)}:1, under the ${tuned.minContrast}:1 minimum`, fix);
          }
        }
      }
      // b-roll over her head: a band or backdrop is a rectangle, so this is geometry, not pixels
      for (const f of plan.fx ?? []) {
        if (!['band', 'backdrop'].includes(f.type) || !(t >= f.start && t < f.start + f.dur)) continue;
        // a backdrop with a live cutout puts her in FRONT of the b-roll: that is the behind-the-head look, not a cover-up
        if (f.type === 'backdrop' && (plan.cutRanges ?? []).some(([s0, e0]) => t >= s0 && t < e0)) continue;
        const height = (f.height ?? 0.5) * H, top = (f.pos ?? 0) * H;
        const rect = {x0: 0, x1: W, y0: top, y1: top + height};
        for (const {head: h} of heads) {
          if (overlap(rect, h) > (h.x1 - h.x0) * (h.y1 - h.y0) * 0.1) {
            add(!guessed, t, `the ${f.type} b-roll at ${ss(t)} covers ${guessed ? 'the fixed face zone, so it may cover her head' : 'part of her head'}`, `drop height to about ${((h.y0 / H) - 0.02).toFixed(2)}, or raise shiftMain so she moves down out of it`);
            break;
          }
        }
      }
    }
    if (times.length && !seen) notes.push('no face was found in any sampled second, so text-on-face could not be judged');
      notes.push('a word in common is not the same as the right shot: whether the b-roll earns its place is still something to watch in the cut');
  }

  // one line per rule broken, deduped: the same caption position breaks the same rule all reel
  const dedupe = (list) => {
    const byRule = new Map();
    for (const v of list) {
      const key = v.what.replace(/\d+\.\d+s/g, '').replace(/#[0-9A-F]{6}/g, '').replace(/\d+(\.\d+)?/g, '');
      if (!byRule.has(key)) byRule.set(key, {...v, times: [v.t], n: 1});
      else { const e = byRule.get(key); e.n++; if (e.times.length < 6) e.times.push(v.t); }
    }
    return [...byRule.values()].sort((a, b) => a.t - b.t);
  };
  return {fails: dedupe(fails), warns: dedupe(warns), notes};
}

export function report(slug, {fails, warns, notes}, log) {
  const line = (v, mark) => {
    const when = v.n > 1 ? ` (${v.n}×, from ${ss(v.times[0])})` : v.t ? ` (${ss(v.t)})` : '';
    log(`  ${mark} ${v.what}${when}`);
    log(`      fix: ${v.fix}`);
  };
  log(`check ${slug}: ${fails.length} failing, ${warns.length} to look at`);
  for (const v of fails) line(v, '✗');
  for (const v of warns) line(v, '!');
  for (const n of notes) log(`  · ${n}`);
  return fails.length === 0;
}
