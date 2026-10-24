// Edits the owner makes by tapping in the studio, written straight into edit.json (no editor needed):
// colour looks, moving or stretching a moment, removing one, a caption word fixed, a word made the
// punch word, the hook picked from three, a photo from their shelf added. Every change is logged in
// projects/<slug>/STUDIO-EDITS.json so the editor knows what changed before it renders the next version.
import fs from 'fs';
import path from 'path';

// Colour looks: footage only, never the text or effects. Values are CSS filter amounts, read by Reel.tsx.
export const NEUTRAL = {saturate: 0.92, contrast: 1, brightness: 1.03, warm: 0, hue: 0};
export const COLOURS = [
  {id: 'natural', name: 'Natural', grade: {}},
  {id: 'golden', name: 'Golden hour', grade: {saturate: 1.05, contrast: 1.05, brightness: 1.05, warm: 0.3, hue: -5}},
  {id: 'film', name: 'Soft film', grade: {saturate: 0.7, contrast: 0.88, brightness: 1.08, warm: 0.16}},
  {id: 'crisp', name: 'Crisp', grade: {saturate: 1.1, contrast: 1.12, brightness: 1.02}},
  {id: 'airy', name: 'Bright and airy', grade: {saturate: 0.9, contrast: 0.94, brightness: 1.12}},
  {id: 'cool', name: 'Cool', grade: {saturate: 0.8, contrast: 1.04, brightness: 1.04, hue: 12}},
  {id: 'moody', name: 'Moody', grade: {saturate: 0.65, contrast: 1.2, brightness: 0.9}},
  {id: 'mono', name: 'Black and white', grade: {saturate: 0, contrast: 1.08, brightness: 1.03}},
];
// strength 0 is the untouched footage, 1 the full look
export function gradeFor(id, strength = 1) {
  const c = COLOURS.find((x) => x.id === id) ?? COLOURS[0];
  const s = Math.max(0, Math.min(1.5, +strength || 0));
  const g = {look: c.id, strength: +s.toFixed(2)};
  for (const k of Object.keys(NEUTRAL)) g[k] = +(NEUTRAL[k] + ((c.grade[k] ?? NEUTRAL[k]) - NEUTRAL[k]) * s).toFixed(3);
  return g;
}

const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));
const fmt = (t) => `${Math.floor(t / 60)}:${String((t % 60).toFixed(1)).padStart(4, '0')}`;

// the effect a timeline block or a moment points at: edit.json fx `at` is the reel's own time
// pass i (from editSummary) when known; otherwise the nearest of that type
function findFx(ed, t, {i, type} = {}, near = 0.15) {
  if (Number.isInteger(i) && ed.fx?.[i] && Math.abs((ed.fx[i].at ?? ed.fx[i].start ?? 0) - t) < 0.05) return i;
  let best = -1, gap = near;
  (ed.fx ?? []).forEach((f, k) => { if (type && f.type !== type) return; const d = Math.abs((f.at ?? f.start ?? 0) - t); if (d <= gap) { gap = d; best = k; } });
  return best;
}
const nameOf = (f) => f.type + (f.text ? ` "${String(f.text).replace(/\n/g, ' ').slice(0, 30)}"` : '');

export function editSummary(projectDir) {
  const ed = rj(path.join(projectDir, 'edit.json'), null);
  if (!ed) return null;
  return {
    grade: ed.grade ?? null, grades: ed.grades ?? [], hook: ed.hook ?? null, hookOptions: ed.hookOptions ?? [],
    fx: (ed.fx ?? []).map((f, i) => ({i, type: f.type, at: f.at ?? f.start ?? 0, dur: f.dur ?? null, label: nameOf(f)})),
    pending: rj(path.join(projectDir, 'STUDIO-EDITS.json'), {changes: []}).changes,
  };
}

// op: {op, ...}. Returns a plain sentence of what changed (it also goes in STUDIO-EDITS.json).
export function applyEdit(projectDir, op, {shelfDir} = {}) {
  const editF = path.join(projectDir, 'edit.json');
  const ed = rj(editF, null);
  if (!ed) throw new Error('This reel has no edit yet.');
  let said;
  if (op.op === 'colour') {
    const g = gradeFor(op.look, op.strength ?? 1);
    const name = (COLOURS.find((c) => c.id === g.look) ?? COLOURS[0]).name;
    if (op.start !== undefined && op.dur) {
      ed.grades = (ed.grades ?? []).filter((r) => r.start + r.dur <= +op.start || r.start >= +op.start + +op.dur);
      ed.grades.push({...g, start: +(+op.start).toFixed(2), dur: +(+op.dur).toFixed(2)});
      said = `Colour: ${name} (${Math.round(g.strength * 100)}%) from ${fmt(+op.start)} for ${(+op.dur).toFixed(1)}s`;
    } else {
      if (g.look === 'natural') delete ed.grade; else ed.grade = g;
      said = `Colour for the whole reel: ${name}${g.look === 'natural' ? '' : ` (${Math.round(g.strength * 100)}%)`}`;
    }
  } else if (op.op === 'retime' || op.op === 'stretch' || op.op === 'remove') {
    if (op.hook || /^Hook/.test(op.label ?? '')) {
      if (!ed.hook) throw new Error('No hook to change.');
      if (op.op === 'remove') throw new Error('Every reel keeps its hook. Swap it for another look instead.');
      if (op.op === 'stretch') { ed.hook.end = +Math.max((ed.hook.start ?? 0) + 0.8, ed.hook.end + +op.by).toFixed(2); said = `Hook now on screen until ${fmt(ed.hook.end)}`; }
      else throw new Error('The hook always opens the reel.');
    } else {
      const i = findFx(ed, +op.t, {i: op.i, type: op.type});
      if (i < 0) throw new Error('Could not find that moment in the edit. Leave a note instead.');
      const f = ed.fx[i], nm = op.label ? String(op.label).replace(/: /, ' "') + (/: /.test(op.label) ? '"' : '') : nameOf(f);
      if (op.op === 'remove') { ed.fx.splice(i, 1); said = `Removed ${nm} at ${fmt(+op.t)}`; }
      else if (op.op === 'retime') { const to = Math.max(0, +(+op.to).toFixed(2)); f.at = to; delete f.start; said = `Moved ${nm} from ${fmt(+op.t)} to ${fmt(to)}`; }
      else { const d0 = f.dur ?? 1.5; f.dur = +Math.max(0.4, d0 + +op.by).toFixed(2); said = `${nm} at ${fmt(+op.t)} now ${f.dur}s long`; }
    }
  } else if (op.op === 'word') {
    const from = String(op.from ?? '').trim(), to = String(op.to ?? '').trim();
    if (!from || !to) throw new Error('Which word, and what should it say?');
    ed.fix = {...(ed.fix ?? {}), [from.replace(/[.,!?]+$/, '')]: to.replace(/[.,!?]+$/, '')};
    said = `Caption word "${from}" is now "${to}"`;
  } else if (op.op === 'highlight') {
    const w = String(op.word ?? '').trim();
    if (!w) throw new Error('Which word?');
    ed.emphasis = (ed.emphasis ?? []).filter((e) => (e.word ?? e.phrase) !== w).concat({word: w, style: 'punch'});
    said = `"${w}" is now a punch word`;
  } else if (op.op === 'hook') {
    const o = (ed.hookOptions ?? [])[+op.n - 1];
    if (!o) throw new Error('No hook option ' + op.n);
    const prev = ed.hook ? {...ed.hook} : null;
    ed.hook = {...(ed.hook ?? {}), ...(typeof o === 'string' ? {text: o} : o)};
    // the ones not picked become trial-reel openings
    ed.hookVariants = (ed.hookOptions ?? []).filter((_, k) => k !== +op.n - 1).map((x) => ({hook: typeof x === 'string' ? {text: x} : x}));
    if (prev && prev.text !== ed.hook.text && !ed.hookVariants.some((v) => v.hook.text === prev.text)) ed.hookVariants.push({hook: {text: prev.text}});
    said = `Hook: "${ed.hook.text.replace(/\n/g, ' ')}" (the others are saved as trial openings)`;
  } else if (op.op === 'shelf') {
    const file = path.basename(String(op.file ?? ''));
    const src = path.join(shelfDir, file);
    if (!file || !fs.existsSync(src)) throw new Error('That file is not on your shelf any more.');
    fs.mkdirSync(path.join(projectDir, 'assets'), {recursive: true});
    fs.copyFileSync(src, path.join(projectDir, 'assets', 'shelf-' + file));
    const t = Math.max(0, +(+op.t).toFixed(2));
    ed.fx = [...(ed.fx ?? []), {type: 'sticker', src: 'assets/shelf-' + file, at: t, dur: +(+op.dur || 2.5), x: 0.5, y: 0.2, width: 0.5, rotate: -3}];
    said = `Added ${file} from your shelf at ${fmt(t)}`;
  } else throw new Error('Unknown change.');
  wj(editF, ed);
  const lf = path.join(projectDir, 'STUDIO-EDITS.json'), log = rj(lf, {changes: []});
  log.changes.push({at: Date.now(), said, op});
  wj(lf, log);
  return said;
}

// the editor read these and rendered: start a fresh list
export function clearEdits(projectDir) { try { fs.rmSync(path.join(projectDir, 'STUDIO-EDITS.json')); } catch {} }
