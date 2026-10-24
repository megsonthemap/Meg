#!/usr/bin/env node
// Effects Library builder.
//
//   node library/build.mjs --page                 rebuild the page from the stills already here (seconds)
//   node library/build.mjs --only folder,counter  re-render just those effects, then the page
//   node library/build.mjs --project my-reel      render on your own footage instead of the test reel
//   node library/build.mjs                        re-render every effect (slow: one render per chunk)
//
// catalog.json is the source of truth: one entry per effect. Add an entry, run --only <id>, and the
// new effect appears on the page with its own still. Nothing outside this kit folder is read.
import fs from 'fs';
import path from 'path';
import {spawnSync} from 'child_process';
import {fileURLToPath} from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(HERE, '..');
const ENGINE = path.join(STUDIO, 'engine');
const IMG = path.join(HERE, 'img');
const CATALOG = path.join(HERE, 'catalog.json');

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt; };
const pageOnly = process.argv.includes('--page');
const only = new Set((arg('--only', '') || '').split(',').map((x) => x.trim()).filter(Boolean));
const slug = arg('--project', 'smoke');
const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
fs.mkdirSync(IMG, {recursive: true});

// ---- the page ----
function writePage() {
  const tpl = fs.readFileSync(path.join(HERE, 'page.html'), 'utf8');
  const have = cat.effects.filter((e) => fs.existsSync(path.join(IMG, e.id + '.jpg')));
  const data = cat.effects.map((e) => ({id: e.id, name: e.name, say: e.say, earns: e.earns, group: e.group, when: e.when, img: fs.existsSync(path.join(IMG, e.id + '.jpg')) ? `img/${e.id}.jpg` : ''}));
  const html = tpl.replace('/*DATA*/[]', JSON.stringify(data)).replace('/*GROUPS*/[]', JSON.stringify(cat.groups)).replaceAll('{{COUNT}}', String(data.length));
  fs.writeFileSync(path.join(HERE, 'effects-library.html'), html);
  console.log(`› page written: ${data.length} effects, ${have.length} with a still → library/effects-library.html`);
  const missing = data.filter((d) => !d.img).map((d) => d.id);
  if (missing.length) console.log(`› no still yet for: ${missing.join(', ')}  (run: node library/build.mjs --only ${missing.join(',')})`);
}

if (pageOnly) { writePage(); process.exit(0); }

// ---- rendering stills ----
const P = (...p) => path.join(STUDIO, 'projects', slug, ...p);
if (!fs.existsSync(P('edit.json')) && !fs.existsSync(P('raw'))) {
  console.error(`✗ projects/${slug} does not exist. Run install.sh first (it creates projects/smoke), or pass --project <your slug>.`);
  process.exit(1);
}
const clips = fs.existsSync(P('analysis', 'clips.json')) ? JSON.parse(fs.readFileSync(P('analysis', 'clips.json'), 'utf8')) : null;
if (!clips) { console.error(`✗ projects/${slug} has no analysis/clips.json. Run: node engine/reel.mjs prep ${slug}`); process.exit(1); }
const ids = Object.keys(clips);
const CLIP = ids[0];
const DUR = Math.max(4, Math.floor((clips[CLIP]?.duration ?? 10) * 10) / 10 - 0.5);

// the demo images live beside the catalogue; the engine resolves asset paths inside the project
const demoDest = P('assets', 'library-demo');
fs.mkdirSync(demoDest, {recursive: true});
for (const f of fs.readdirSync(path.join(HERE, 'demo-assets'))) fs.copyFileSync(path.join(HERE, 'demo-assets', f), path.join(demoDest, f));
const asset = (p) => p.startsWith('demo-assets/') ? 'assets/library-demo/' + path.basename(p) : p;

const base = fs.existsSync(P('edit.json')) ? JSON.parse(fs.readFileSync(P('edit.json'), 'utf8')) : {slug, cuts: [{src: CLIP, in: 0, out: DUR}]};
for (const k of ['hook', 'fx', 'checklist', 'end', 'labels', 'inserts', 'emphasis']) delete base[k];
base.slug = slug;
const editFile = P('edit.json');
const saved = fs.existsSync(editFile) ? fs.readFileSync(editFile) : null;
const stillsDir = P('out', 'stills');

function render(edit, shots) {  // shots: [[id, t], ...]
  fs.rmSync(stillsDir, {recursive: true, force: true});
  fs.writeFileSync(editFile, JSON.stringify(edit, null, 1));
  const ts = shots.map(([, t]) => t.toFixed(2));
  const r = spawnSync('node', ['reel.mjs', 'stills', slug, ...ts], {cwd: ENGINE, encoding: 'utf8'});
  if (!String(r.stdout).includes('stills:')) { console.error(String(r.stdout).slice(-1200), String(r.stderr).slice(-1200)); throw new Error('the still render failed'); }
  for (const [i, [id]] of shots.entries()) {
    const src = path.join(stillsDir, `t${ts[i]}.png`);
    if (!fs.existsSync(src)) { console.log('  ! no still for', id); continue; }
    spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', '720', src, '--out', path.join(IMG, id + '.jpg')], {encoding: 'utf8'});
    console.log('  ✓', id);
  }
}

const want = (e) => !only.size || only.has(e.id);
const shift = (f, t) => {              // move one demo effect to time t in the render
  f = JSON.parse(JSON.stringify(f));
  if (f.clip === '__CLIP__') { f.clip = CLIP; f.in = 0; }
  if (f.src) f.src = asset(f.src);
  if (f.srcs) f.srcs = f.srcs.map(asset);
  f.at = +(t + (f.at ?? 0)).toFixed(3);
  for (const key of ['items', 'tasks', 'msgs']) for (const it of f[key] ?? []) {
    if ('at' in it) it.at = +(t + it.at).toFixed(3);
    if ('strike' in it) it.strike = +(t + it.strike).toFixed(3);
  }
  for (const key of ['strike', 'strikeAt', 'pickAt']) if (key in f) f[key] = +(t + f[key]).toFixed(3);
  for (const ln of f.lines ?? []) if (ln && typeof ln === 'object' && 'at' in ln) ln.at = +(t + ln.at).toFixed(3);
  return f;
};

try {
  // whole-render variants: hooks, caption styles, checklist, end card
  for (const [key, patch] of Object.entries(cat.patches)) {
    const es = cat.effects.filter((e) => e.patch === key && want(e));
    if (!es.length) continue;
    const ed = {...structuredClone(base), ...structuredClone(patch), fx: []};
    console.log(`› render variant ${key} (${es.length})`);
    render(ed, es.map((e) => [e.id, Math.min(e.still, DUR - 0.2)]));
  }
  // effect demos, packed into as few renders as the footage allows
  let es = cat.effects.filter((e) => e.fx && want(e));
  while (es.length) {
    const ed = {...structuredClone(base), captions: {mode: 'off'}, fx: []};
    const shots = []; const rest = []; let t = 0.3;
    for (const e of es) {
      if (t + e.dur > DUR) { rest.push(e); continue; }
      for (const f of e.fx) ed.fx.push(shift(f, t));
      shots.push([e.id, t + e.still]); t += e.dur + 0.4;
    }
    if (!shots.length) { console.error(`✗ ${rest[0].id} needs ${rest[0].dur}s of footage; projects/${slug} only has ${DUR}s. Use --project with a longer clip.`); break; }
    console.log(`› render chunk of ${shots.length}`);
    render(ed, shots);
    es = rest;
  }
} finally {
  if (saved) fs.writeFileSync(editFile, saved); else fs.rmSync(editFile, {force: true});
  fs.rmSync(demoDest, {recursive: true, force: true});
}
writePage();
