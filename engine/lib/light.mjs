// Dark text on bright footage, decided from the footage rather than from a buyer's guess.
//
// A hook and an end card are drawn in white with the punch colour on the accent line. On a bright
// wall neither clears the 4.5:1 contrast floor the check enforces: white on her usual wall measures
// about 1.2:1. The check was right to block it, but its only advice was to use a dark colour the
// renderer had no way to draw, so every cut on bright footage fell back to the one hook with its own
// background (bars) and the cards that carry their own (dm, comment). That is a narrow look forced by
// a measurement, not a choice.
//
// So: measure what is actually behind the words, then pick. The measurement is the "plate" QA pass,
// which is the footage with nothing drawn over it, through the real zoom, crop and grade — the same
// pass the check already trusts. The region sampled mirrors where Reel.tsx puts each element.
//
// Nothing here changes a cut that already reads. The light look stays unless it fails the floor,
// and a cut that says `"ink": true` (or false) on its hook or end card keeps what it said.

import {rgba, lum, contrast, rgbOf, hex} from './check.mjs';

const W = 1080, H = 1920;
const SAMPLES = 3;        // times across an element's life: start, middle, end
const SIDE = 0.12;        // display lettering is centred and can run wide; sample the middle 76%

// Mean colour of a 0..1 frame region of a plate still.
function regionColour(buf, w, h, x0, x1, y0, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  const yA = Math.max(0, Math.round(y0 * h)), yB = Math.min(h, Math.round(y1 * h));
  const xA = Math.max(0, Math.round(x0 * w)), xB = Math.min(w, Math.round(x1 * w));
  for (let y = yA; y < yB; y++) for (let x = xA; x < xB; x++) { const i = (y * w + x) * 4; r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
}

// Where each element's lettering sits, in 0..1 frame coords. Mirrors Reel.tsx: a hook in `behind`
// mode hangs at hook.y with lineHeight 0.92, `top` sits at 0.11, bars at 0.07, an end card at 0.31
// in 58px display. Generous downward: a line box is taller than its glyphs.
function zoneOf(el) {
  const lines = el.lines ?? el.text.split('\n').length;
  const top = el.y ?? el.defaultY;
  const h = (lines * el.size * 1.15) / H;
  return [SIDE, 1 - SIDE, top, Math.min(1, top + h)];
}

// The elements whose colour can be decided, with the times to look at and the colours in play.
function elements(plan) {
  const out = [];
  const hook = plan.hook;
  if (hook && hook.ink === undefined) {
    const mode = hook.mode ?? 'top';
    // `bars` and `stack` carry their own background, so the wall behind them is not what the letters
    // are read against — except a bars hook told to drop its bar, which is bare lettering again.
    const bare = mode === 'behind' || mode === 'top' || (mode === 'bars' && hook.bar === 'none');
    if (bare) out.push({
      kind: 'hook', el: hook,
      zone: zoneOf({text: hook.text, y: hook.y, defaultY: mode === 'behind' ? 0.1 : mode === 'bars' ? 0.07 : 0.11, size: hook.size ?? (mode === 'behind' ? 150 : mode === 'bars' ? 66 : 46)}),
      from: Math.max(0, hook.start ?? 0), to: Math.min(plan.duration, hook.end),
    });
  }
  // A big word is the same bare display lettering, in the punch colour, anywhere on the frame. It
  // already takes a colour; it just never got given one. Only a big word that says nothing is touched.
  for (const f of plan.fx ?? []) {
    if (f.type !== 'bigword' || f.colour !== undefined) continue;
    out.push({
      kind: `big word "${String(f.text).slice(0, 18)}"`, el: f, setColour: true,
      zone: zoneOf({lines: 1, y: f.y ?? 0.12, defaultY: 0.12, size: (f.size ?? (f.font === 'serif' ? 260 : 230))}),
      from: f.start, to: Math.min(plan.duration, f.start + f.dur),
    });
  }
  const end = plan.end;
  if (end && end.ink === undefined) out.push({
    kind: 'end card', el: end,
    zone: zoneOf({lines: end.lines.length, y: end.y, defaultY: 0.31, size: 58}),
    from: end.start, to: plan.duration,
  });
  return out;
}

// Decide, and say why. `still(frame, file, 'plate')` is the renderer's QA plate pass.
export async function decideLight(plan, ctx) {
  const {brand, log, dir, still, fps = 30} = ctx;
  const els = elements(plan);
  if (!els.length) return plan;
  const safe = brand.reel?.safe ?? {};
  const min = safe.minContrast ?? 4.5;
  const darkName = safe.onBrightText ?? 'ink';
  const dark = brand.colours[darkName] ?? brand.colours.ink;
  const light = [['white', brand.colours.white], ['the punch colour', brand.colours.punch]];

  fs_mkdir(dir);
  for (const e of els) {
    const span = Math.max(0, e.to - e.from);
    const times = Array.from({length: SAMPLES}, (_, i) => e.from + (span * (i + 0.5)) / SAMPLES);
    const bgs = [];
    for (const t of times) {
      const frame = Math.max(0, Math.round(t * fps));
      const f = `${dir}/light_${e.kind.replace(/\s/g, '')}_${String(frame).padStart(5, '0')}.png`;
      await still(frame, f, 'plate');
      const {buf, w, h} = rgba(f);
      bgs.push(regionColour(buf, w, h, ...e.zone));
    }
    // Worst case across the element's life, because the words have to read for all of it.
    const worst = (col) => Math.min(...bgs.map((bg) => contrast(rgbOf(col), bg)));
    const lightWorst = Math.min(...light.map(([, v]) => worst(v)));
    const darkWorst = worst(dark);
    const brightest = bgs.reduce((a, b) => (lum(b) > lum(a) ? b : a));
    if (lightWorst >= min) continue;                       // the house look still reads; leave it alone
    if (darkWorst >= min) {
      if (e.setColour) e.el.colour = dark; else e.el.ink = true;
      log(`the ${e.kind} sits on ${hex(brightest)}, where white is ${lightWorst.toFixed(1)}:1 against the ${min}:1 floor, so it is drawn in ${darkName} (${dark}) at ${darkWorst.toFixed(1)}:1`);
    } else {
      // Neither reads. Say so plainly and leave the cut alone: the check will hold it back, and the
      // real fix is a different place on the frame or a card that carries its own background.
      log(`the ${e.kind} sits on ${hex(brightest)}, where neither white (${lightWorst.toFixed(1)}:1) nor ${darkName} (${darkWorst.toFixed(1)}:1) clears the ${min}:1 floor. Move it, or use a hook or card that carries its own background.`);
    }
  }
  return plan;
}

// kept local so this file has one import
import fs from 'node:fs';
const fs_mkdir = (d) => fs.mkdirSync(d, {recursive: true});
