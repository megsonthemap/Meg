#!/usr/bin/env node
// Reel Studio covers. Three Instagram cover options for a finished reel.
//   node cover.mjs <slug>                      pick 6 cover frames, render 3 designs + a contact sheet
//   node cover.mjs <slug> --title "A | [LOUD] | b"   set the words: | breaks a line, [ ] makes a line loud
//   node cover.mjs <slug> --frame 3            build the covers on candidate 3 (out/covers/frames/03.jpg)
//   node cover.mjs <slug> --t 12.4             build them on the reel's frame at 12.4 s (output time)
//   node cover.mjs <slug> --pick 2             the one they chose -> ~/Downloads/Reels/<slug>-cover.jpg
// Writes projects/<slug>/out/covers/: frames/01..06.jpg + frames.jpg, cover-1..3.jpg, covers.jpg, covers.json.
// Frames are scored on face (centred, eyes open, mouth closed or smiling), sharpness and the pauses
// between words. Never a mid-speech freeze frame: on a Mac the face is measured (tools/faceinfo);
// elsewhere only moments between words are allowed.
import fs from 'fs';
import path from 'path';
import {execFileSync, spawnSync} from 'child_process';
import {fileURLToPath} from 'url';
import {ffmpegPath, ffEnv, chromePath, fileUrl, toolPath, canCutout, cutoutWhy, isMac, osName, downloadsDir} from './lib/platform.mjs';

const ENGINE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(ENGINE, '..');
const BRAND_DIR = path.join(STUDIO, 'brand');
const log = (...a) => console.log('›', ...a);
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wj = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const ff = (args, opts = {}) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {env: ffEnv, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'inherit'], ...opts});
const pad = (n) => String(n).padStart(2, '0');

const args = process.argv.slice(2);
const slug = args[0];
const flag = (n) => { const i = args.indexOf(n); return i > 0 && args[i + 1] !== undefined ? args[i + 1] : undefined; };
if (!slug || slug.startsWith('--')) { console.log('usage: node cover.mjs <slug> [--title "..."] [--frame <n>] [--t <seconds>] | --pick <n>'); process.exit(1); }
const P = (...p) => path.join(STUDIO, 'projects', slug, ...p);
if (!fs.existsSync(P())) { console.error(`no project at ${P()}`); process.exit(1); }
const OUT = P('out', 'covers'), FR = path.join(OUT, 'frames'), SCAN = path.join(OUT, '.scan');

// ---------------- footage ----------------
const clips = rj(P('analysis', 'clips.json'));
const edit = fs.existsSync(P('edit.json')) ? rj(P('edit.json')) : {};
const plan = fs.existsSync(P('plan.json')) ? rj(P('plan.json')) : null;
const cuts = (edit.cuts ?? []).filter((c) => clips[c.src]);
const srcs = cuts.length ? [...new Set(cuts.map((c) => c.src))] : Object.keys(clips).filter((id) => clips[id].portrait !== false);
const words = (id) => { try { return rj(P('analysis', `${id}.words.json`)); } catch { return []; } };

// how far t is from speech: 0 mid-word, up to 1 in a long pause (no transcript = 0.5)
function pauseAt(ws, t) {
  if (!ws.length) return 0.5;
  if (ws.some((w) => t >= w.s - 0.05 && t <= w.e + 0.05)) return 0;
  const prev = ws.filter((w) => w.e <= t).at(-1), next = ws.find((w) => w.s >= t);
  const gap = (next?.s ?? t + 1) - (prev?.e ?? t - 1);
  // the mouth closes after a word and opens again just before the next one: favour the early part
  const pos = prev && next ? (t - prev.e) / gap : 0.5;
  const late = pos > 0.45 ? Math.max(0, 1 - (pos - 0.45) * 1.8) : 1;
  return Math.min(1, gap / 0.9) * Math.min(1, Math.min(t - (prev?.e ?? -9), (next?.s ?? 99) - t) / 0.25) * late * (prev ? 1 : 0.5);
}

// sharpness (variance of the Laplacian) and motion (change since the sample before) over the
// head-and-shoulders area, 5 samples a second
function sharpness(id, from, to) {
  const w = 324, h = 384;
  const buf = ff(['-ss', String(from), '-to', String(to), '-i', P(clips[id].proxy), '-r', '5', '-vf', `crop=iw*0.6:ih*0.4:iw*0.2:ih*0.2,scale=${w}:${h},format=gray`, '-c:v', 'rawvideo', '-f', 'image2pipe', '-']);
  const n = Math.floor(buf.length / (w * h)), out = [];
  for (let k = 0; k < n; k++) {
    const o = k * w * h, po = Math.max(0, k - 1) * w * h; let s = 0, s2 = 0, c = 0, d = 0;
    for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
      const i = o + y * w + x;
      const l = 4 * buf[i] - buf[i - 1] - buf[i + 1] - buf[i - w] - buf[i + w];
      s += l; s2 += l * l; c++; d += Math.abs(buf[i] - buf[po + y * w + x]);
    }
    out.push({t: from + k / 5, sharp: s2 / c - (s / c) ** 2, motion: d / c});
  }
  return out;
}

const grab = (id, t, out) => ff(['-ss', t.toFixed(3), '-i', P(clips[id].proxy), '-frames:v', '1', '-q:v', '2', out]);

function faceInfo(files) {
  if (!isMac || /^(1|true|yes)$/i.test(process.env.REEL_FORCE_NO_FACEBOX ?? '')) return null;
  const tool = toolPath('faceinfo');
  if (!fs.existsSync(tool) || fs.statSync(tool).mtimeMs < fs.statSync(tool + '.swift').mtimeMs) spawnSync('swiftc', ['-O', tool + '.swift', '-o', tool], {stdio: 'inherit'});
  if (!fs.existsSync(tool)) return null;
  const r = spawnSync(tool, files, {encoding: 'utf8', maxBuffer: 1 << 26});
  const map = {};
  for (const line of r.stdout.split('\n').filter(Boolean)) { const j = JSON.parse(line); map[j.file] = j.faces.sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? null; }
  return map;
}

// face scoring; null = fails the hard rule (talking, blinking, no face, out of the grid)
function faceScore(f, pause) {
  if (!f) return null;
  const talking = f.mouth > 0.1 && !(f.smile > 0.09 && f.mouth < 0.3 && pause > 0.3); // a wide smile may show teeth; talking may not
  if (talking || f.eyes < 0.24 || f.q < 0.25) return null;
  if (f.y * 1920 < 300 || (f.y + f.h) * 1920 > 1460) return null;
  const centred = 1 - Math.min(1, Math.abs(f.x + f.w / 2 - 0.5) / 0.25);
  return 2 * f.q + centred + 0.8 * (1 - Math.min(1, f.mouth / 0.12)) + 0.5 * Math.min(1, (f.eyes - 0.24) / 0.12) + 0.6 * Math.max(0, Math.min(1, f.smile / 0.06)) - 0.5 * Math.abs(f.yaw);
}

async function pickFrames() {
  fs.rmSync(SCAN, {recursive: true, force: true}); fs.mkdirSync(SCAN, {recursive: true});
  let pool = [];
  for (const id of srcs) {
    const used = cuts.filter((c) => c.src === id);
    const dur = clips[id].duration;
    const from = Math.max(0.4, used.length ? Math.min(...used.map((c) => c.in)) - 1.5 : 0.4);
    const to = Math.min(dur - 0.4, used.length ? Math.max(...used.map((c) => c.out)) + 1.5 : dur - 0.4);
    const ws = words(id);
    const samples = sharpness(id, from, to);
    const ref = samples.map((s) => s.sharp).sort((a, b) => a - b)[Math.floor(samples.length * 0.9)] || 1;
    const mref = samples.map((s) => s.motion).sort((a, b) => a - b)[Math.floor(samples.length * 0.5)] || 1;
    for (const s of samples) {
      const inCut = used.some((c) => s.t >= c.in && s.t <= c.out) ? 1 : 0;
      const pause = pauseAt(ws, s.t);
      // preroll: before the first word or after the last (camera set-up, reaching to stop)
      const still = 1 - Math.min(1, s.motion / (2 * mref)); // 0.5 = a typical moment of this clip
      pool.push({src: id, t: +s.t.toFixed(2), preroll: ws.length > 0 && (s.t < ws[0].s || s.t > ws.at(-1).e + 1), sharp: Math.min(1, s.sharp / ref), pause, still, inCut, pre: 1.2 * pause + 0.8 * Math.min(1, s.sharp / ref) + 0.5 * still + 0.3 * inCut});
    }
  }
  log(`scanned ${pool.length} moments in ${srcs.join(', ')}`);
  const spaced = (list, gap, n) => { const out = []; for (const c of list) { if (out.length >= n) break; if (!out.some((o) => o.src === c.src && Math.abs(o.t - c.t) < gap)) out.push(c); } return out; };
  let cands = spaced(pool.sort((a, b) => b.pre - a.pre), 0.2, 60);
  cands.forEach((c, i) => { c.file = path.join(SCAN, `c${pad(i)}.jpg`); grab(c.src, c.t, c.file); });
  const faces = faceInfo(cands.map((c) => c.file));
  if (faces) {
    // closed lips mid-word are still a talking face (the p, b, m pucker), so a pause is required here too
    for (const c of cands) { c.face = faces[c.file]; const fs_ = c.pause < 0.25 || c.preroll ? null : faceScore(c.face, c.pause); c.score = fs_ === null ? null : fs_ + c.sharp + 0.8 * c.pause + 0.2 * c.inCut; }
  } else {
    log(`no face measurement on ${osName}: only moments between words are used, scored on sharpness and pause length`);
    for (const c of cands) c.score = c.pause >= 0.4 && c.still > 0.45 && !c.preroll ? c.pre : null;
  }
  const ok = cands.filter((c) => c.score !== null).sort((a, b) => b.score - a.score);
  const best = spaced(ok, 1.0, 6);
  if (!best.length) throw new Error('no frame passed (face, eyes open, mouth closed). Try --t <seconds> on a moment you like.');
  if (best.length < 6) log(`only ${best.length} frame${best.length > 1 ? "s" : ""} passed the no-mid-speech rule`);
  fs.rmSync(FR, {recursive: true, force: true}); fs.mkdirSync(FR, {recursive: true});
  best.forEach((c, i) => fs.copyFileSync(c.file, path.join(FR, `${pad(i + 1)}.jpg`)));
  const list = best.map((c, i) => ({n: i + 1, file: `${pad(i + 1)}.jpg`, src: c.src, t: c.t, score: +c.score.toFixed(2), face: c.face ?? null, pause: +c.pause.toFixed(2), sharp: +c.sharp.toFixed(2)}));
  wj(path.join(FR, 'frames.json'), list);
  fs.rmSync(SCAN, {recursive: true, force: true});
  sheet(path.join(FR, 'frames.jpg'), list.map((f) => ({img: path.join(FR, f.file), label: `${f.n}`, sub: `${f.src} ${f.t}s`})), 1);
  log(`${list.length} cover frames: ${FR}`);
  return list;
}

// a moment chosen by hand: reel output seconds -> clip + source seconds via plan.json
function frameAt(t) {
  const seg = plan?.segments?.find((s) => t >= s.start && t < s.start + s.dur) ?? plan?.segments?.at(-1);
  if (!seg) throw new Error('no plan.json to map --t onto the footage (render the reel first)');
  const id = Object.keys(clips).find((k) => seg.src.endsWith(clips[k].proxy.split('/').pop()));
  const st = +(seg.srcIn + Math.max(0, Math.min(seg.dur, t - seg.start))).toFixed(3);
  fs.mkdirSync(FR, {recursive: true});
  const file = path.join(FR, 'chosen.jpg');
  grab(id, st, file);
  const face = faceInfo([file])?.[file] ?? null;
  if (face && face.mouth > 0.12) log(`heads up: her mouth is open at ${t}s (mid-word). A pause either side usually looks better.`);
  return {n: 0, file: 'chosen.jpg', src: id, t: st, face};
}

// ---------------- title ----------------
// "|" or a new line breaks a line; [brackets] mark the loud words (display font, punch colour).
// Unmarked, the reel's own punch word (edit.json emphasis) becomes the loud line; failing that the
// hook's accent lines; failing that the last line.
const wrap = (text, max) => {
  const n = Math.ceil(text.length / max), target = Math.ceil(text.length / n), out = [];
  let cur = '';
  for (const w of text.split(/\s+/)) { if (cur && (cur + ' ' + w).length > target + 3) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
  return [...out, cur].filter(Boolean);
};
function parseTitle(text, accent) {
  text = text.trim();
  if (!text.includes('[')) {
    const flat = text.replace(/\s*(\||\n)\s*/g, ' ');
    const punch = (edit.emphasis ?? []).filter((e) => e.style === 'punch').map((e) => (e.word ?? e.phrase ?? '').replace(/[^\p{L}\p{N}' ]/gu, '')).filter(Boolean);
    const hit = punch.find((p) => new RegExp(`\\b${p}\\b`, 'i').test(flat));
    if (hit) text = flat.replace(new RegExp(`\\b(${hit})\\b`, 'i'), '|[$1]|');
    else {
      const raw = text.split(/\s*(?:\||\n)\s*/).filter(Boolean);
      const lines = raw.length > 1 ? raw : wrap(raw[0], 16);
      return lines.map((t, i) => ({t, loud: accent?.length ? accent.includes(i) : i === lines.length - 1}));
    }
  }
  return text.replace(/\[([^\]]+)\]/g, '|[$1]|').split(/\s*(?:\||\n)\s*/).filter(Boolean).flatMap((seg) => {
    const loud = /^\[.*\]$/.test(seg);
    return wrap(seg.replace(/^\[|\]$/g, ''), loud ? 14 : 24).map((t) => ({t, loud}));
  });
}
function draftTitle() {
  const h = edit.hook ?? plan?.hook;
  if (h?.text) return {text: h.text, accent: h.accentLines};
  const md = fs.existsSync(P('PLAN.md')) ? fs.readFileSync(P('PLAN.md'), 'utf8').match(/hook[^:\n]*:\s*"?([^"\n]+)/i) : null;
  if (md) return {text: md[1]};
  const first = Object.values(clips)[0]?.text?.split(/(?<=[.?!])\s/)[0];
  return {text: first ?? slug.replace(/-/g, ' ')};
}

// ---------------- brand (same resolution as reel.mjs loadBrand) ----------------
function loadBrand() {
  const raw = rj(path.join(BRAND_DIR, 'brand.json'));
  const col = raw.colours ?? raw.colors ?? {};
  const colours = {punch: col.punch, accent: col.accent, paper: col.paper, ink: col.ink, dark: col.dark ?? col.ink, white: col.white ?? '#FFFFFF'};
  const STANDIN = {display: 'Avenir Next', serif: 'Georgia'};
  const font = (role) => {
    let f = raw.fonts?.[role];
    if (!f) return {family: STANDIN[role], faces: [], standin: true};
    if (typeof f === 'string') f = {family: path.parse(f).name, files: [{file: f, weight: '100 900'}]};
    const files = (f.files ?? []).map((x) => (typeof x === 'string' ? {file: x, weight: '100 900'} : x));
    if (!files.length || files.some((x) => !fs.existsSync(path.join(BRAND_DIR, 'fonts', x.file)))) { log(`brand font ${f.family ?? role} not found in brand/fonts; using ${STANDIN[role]}`); return {family: STANDIN[role], faces: [], standin: true}; }
    return {family: f.family ?? path.parse(files[0].file).name, faces: files.map((x) => ({url: `fonts/brand/${x.file}`, weight: x.weight ?? '100 900', ...(x.stretch ? {stretch: x.stretch} : {}), ...(x.style ? {style: x.style} : {})})), ...(role === 'display' && f.fallbackGlyphs ? {fallbackGlyphs: f.fallbackGlyphs} : {})};
  };
  const b = {name: raw.name, handle: raw.handle, fonts: {display: font('display'), serif: font('serif')}, colours, reel: raw.reel ?? {}};
  if (b.fonts.display.fallbackGlyphs && fs.existsSync(path.join(BRAND_DIR, 'fonts-standin', 'Archivo.woff2'))) b.fallbackUrl = 'fonts/Archivo.woff2';
  return b;
}

// ---------------- sheets ----------------
function sheet(out, items, rows, w = 300) {
  const chrome = chromePath();
  if (!chrome) { log('no headless browser found; skipping the contact sheet'); return; }
  const h = Math.round(w * 16 / 9);
  const html = `<html><body style="margin:0;background:#1E1E1E;font:600 15px -apple-system,'Segoe UI',sans-serif;color:#F6F6F6"><div style="display:flex;flex-wrap:wrap;gap:14px;padding:14px">${items.map((it) => `<div style="width:${w}px"><div style="position:relative">${it.grid ? `<div style="width:${w}px;height:${Math.round(w * 1.25)}px;overflow:hidden;position:relative"><img src="${fileUrl(it.img)}" style="position:absolute;width:${w}px;top:${-Math.round((h - w * 1.25) / 2)}px"></div>` : `<img src="${fileUrl(it.img)}" style="width:${w}px;height:${h}px;display:block">`}${it.grid ? '' : `<span style="position:absolute;left:8px;top:8px;background:#FFE14D;color:#1E1E1E;padding:2px 9px;border-radius:4px;font-size:18px">${it.label}</span>`}</div><div style="padding:6px 2px 0;opacity:.75">${it.grid ? `${it.label} ` : ''}${it.sub ?? ''}</div></div>`).join('')}</div></body></html>`;
  const hf = out.replace(/\.jpg$/, '.html');
  fs.writeFileSync(hf, html);
  const perRow = Math.ceil(items.length / rows);
  const tallest = Math.max(...items.map((it) => (it.grid ? Math.round(w * 1.25) : h)));
  const png = out.replace(/\.jpg$/, '.png');
  spawnSync(chrome, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${perRow * (w + 14) + 14},${rows * (tallest + 44) + 14}`, `--screenshot=${png}`, fileUrl(hf)], {stdio: 'ignore'});
  if (fs.existsSync(png)) { ff(['-i', png, '-q:v', '3', out]); fs.rmSync(png); }
  fs.rmSync(hf, {force: true});
}

// ---------------- render ----------------
const DESIGNS = [['top', 'Title above the head'], ['middle', 'Title across the middle'], ['behind', 'Big title behind you']];

async function render(frame, lines) {
  const brand = loadBrand();
  const stage = path.join(STUDIO, '.stage', `cover-${slug}`);
  fs.rmSync(stage, {recursive: true, force: true});
  fs.mkdirSync(path.join(stage, 'c'), {recursive: true});
  fs.mkdirSync(path.join(stage, 'fonts'), {recursive: true});
  if (fs.existsSync(path.join(BRAND_DIR, 'fonts-standin'))) fs.cpSync(path.join(BRAND_DIR, 'fonts-standin'), path.join(stage, 'fonts'), {recursive: true});
  if (fs.existsSync(path.join(BRAND_DIR, 'fonts'))) fs.cpSync(path.join(BRAND_DIR, 'fonts'), path.join(stage, 'fonts', 'brand'), {recursive: true});
  fs.copyFileSync(path.join(FR, frame.file), path.join(stage, 'c', 'frame.jpg'));
  let cutout;
  if (canCutout()) {
    const dir = path.join(stage, 'cut');
    execFileSync(toolPath('cutout'), [P(clips[frame.src].proxy), String(frame.t), String(1 / 30), dir, '30'], {stdio: ['ignore', 'ignore', 'inherit']});
    const png = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith('.png'));
    if (png) { fs.copyFileSync(path.join(dir, png), path.join(stage, 'c', 'cut.png')); cutout = 'c/cut.png'; }
  } else log(`no person cutout (${cutoutWhy()}), so cover 3 puts the big title over the frame`);
  const {bundle} = await import('@remotion/bundler');
  const {renderStill, selectComposition} = await import('@remotion/renderer');
  log('bundling…');
  const serveUrl = await bundle({entryPoint: path.join(ENGINE, 'src', 'index.ts'), publicDir: stage, onProgress: () => {}});
  const face = frame.face ? {x: frame.face.x, y: frame.face.y, w: frame.face.w, h: frame.face.h} : undefined;
  const files = [];
  for (const [i, [design]] of DESIGNS.entries()) {
    const inputProps = {cover: {design, frame: 'c/frame.jpg', ...(cutout && design === 'behind' ? {cutout} : {}), ...(face ? {face} : {}), lines}, brand};
    const composition = await selectComposition({serveUrl, id: 'Cover', inputProps});
    const out = path.join(OUT, `cover-${i + 1}.jpg`);
    await renderStill({composition, serveUrl, inputProps, frame: 0, output: out, imageFormat: 'jpeg', jpegQuality: 92});
    files.push(out);
    log(`cover ${i + 1} (${design}): ${out}`);
  }
  fs.rmSync(stage, {recursive: true, force: true});
  return {files, cutout: !!cutout};
}

// ---------------- main ----------------
if (flag('--pick') !== undefined) {
  const src = path.join(OUT, `cover-${flag('--pick')}.jpg`);
  if (!fs.existsSync(src)) { console.error(`no ${src}; make the covers first`); process.exit(1); }
  const dir = path.join(downloadsDir(), 'Reels'); fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(src, path.join(dir, `${slug}-cover.jpg`));
  log(`cover ${flag('--pick')}: ${path.join(dir, `${slug}-cover.jpg`)}`);
  process.exit(0);
}
let frames = fs.existsSync(path.join(FR, 'frames.json')) ? rj(path.join(FR, 'frames.json')) : null;
let frame;
if (flag('--t') !== undefined) frame = frameAt(+flag('--t'));
else {
  if (!frames || flag('--frame') === undefined) frames = await pickFrames();
  const n = +(flag('--frame') ?? 1);
  frame = frames.find((f) => f.n === n);
  if (!frame) { console.error(`no candidate ${n}; there are ${frames.length} in ${FR}`); process.exit(1); }
}
const drafted = draftTitle();
const titleText = flag('--title') ?? drafted.text;
const lines = parseTitle(titleText, flag('--title') ? null : drafted.accent);
log(`title: ${lines.map((l) => (l.loud ? `[${l.t}]` : l.t)).join(' | ')}`);
log(`frame: ${frame.n ? `candidate ${frame.n}` : 'chosen moment'} (${frame.src} at ${frame.t}s)`);
const {files, cutout} = await render(frame, lines);
sheet(path.join(OUT, 'covers.jpg'), [
  ...files.map((f, i) => ({img: f, label: String(i + 1), sub: DESIGNS[i][1]})),
  ...files.map((f, i) => ({img: f, label: String(i + 1), sub: 'on your grid', grid: true})),
], 2, 340);
wj(path.join(OUT, 'covers.json'), {title: titleText, lines, frame, cutout, covers: files.map((f, i) => ({n: i + 1, design: DESIGNS[i][0], file: path.basename(f)})), made: new Date().toISOString()});
log(`contact sheet: ${path.join(OUT, 'covers.jpg')}`);
