#!/usr/bin/env node
// Reel Studio b-roll organiser. Sorts the camera roll into a few big buckets once, then hands the
// editor a handful of real clips from the right bucket whenever a line needs footage behind it.
//   node broll.mjs setup                     Mac: install the Photos helper (private Python in engine/.venv), list named faces
//   node broll.mjs init --mode photos|folders --buckets working,bts,life [options]   write brand/broll.json
//        --me "Name"  --leave-out "Name,Name"  --kids-out  --since 2023-01-01  --media videos|both
//        --source <folder>  --root <folder>  --copy   (folders mode)
//        --name working="Me at work"   --labels working=Laptop,Desk   --album working="Existing album" (use an album they already have)
//   node broll.mjs status                    what is set up, in plain words
//   node broll.mjs scan                      dry run: counts per bucket and a preview sheet each. Changes nothing.
//   node broll.mjs sheets [--all]            folders mode: numbered sheets of the footage still to sort, for Claude to look at
//   node broll.mjs sort <bucket> <n> [n-m…]  folders mode: put sheet numbers into a bucket (or --from sort.json)
//   node broll.mjs build --yes               make the albums (Photos) or fill the bucket folders. Never deletes anything.
//   node broll.mjs find <bucket> [--limit 12] [--since 2025-01-01] [--about "the line"] [--sheet] [--photos] [--json]
//   node broll.mjs export <bucket> <slug> [--limit 3] [--ids a,b] [--about "the line"]   copy clips into projects/<slug>/raw
//   node broll.mjs remember <slug>           keep the descriptions written in that reel, so the next search shows them
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import {spawnSync, execFileSync} from 'child_process';
import {fileURLToPath} from 'url';
import {isMac, osName, ffmpegPath, ffprobePath, ffEnv, chromePath, fileUrl, openFolder} from './lib/platform.mjs';
import {keywords} from './lib/assets.mjs';

const ENGINE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = process.env.REEL_STUDIO ? path.resolve(process.env.REEL_STUDIO) : path.resolve(ENGINE, '..');
const PROJECTS = path.join(STUDIO, 'projects');
const FILE = path.join(STUDIO, 'brand', 'broll.json');
const WORK = path.join(STUDIO, 'brand', 'broll');
const HELPER = path.join(ENGINE, 'tools', 'broll', 'photos.py');
// The Photos helper lives in engine/.venv, which the kit never ships and updates never replace.
const PYHOME = path.join(ENGINE, '.venv');
const PY = process.env.REEL_BROLL_PYTHON || path.join(PYHOME, 'broll', 'bin', 'python');
const PINS = ['osxphotos==0.77.2', 'photoscript==0.6.1'];

const VIDEO_EXT = /\.(mov|mp4|m4v|hevc)$/i;
const IMAGE_EXT = /\.(jpe?g|png)$/i;
const RAW = /^(IMG_\d|IMG_E\d|VID_?\d{8}|PXL_\d{8}|MVI_|MOV_\d|DSC|DSCF|DJI_|GOPR|GH\d|GX\d|C\d{4}|\d{8}_\d{6})/i;
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const log = (...a) => console.log('›', ...a);
const now = () => new Date().toISOString();
const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;

// A few big buckets. Labels are Apple Photos' own scene labels; "face" uses the person they named in Photos.
// noSelfie drops front-camera clips: those are takes talking to camera, not footage to cut away to.
//   me: they are in it   only-me: nobody else is   any: whoever   others: someone besides them
const PRESETS = {
  working: {name: 'Me working', face: 'me', noSelfie: true, labels: ['Computer', 'Laptop', 'Personal Computer', 'Computer Keyboard', 'Computer Monitor', 'Desk', 'Whiteboard', 'Office Supplies', 'Handwriting', 'Notebook']},
  bts: {name: 'Behind the scenes', face: 'any', noSelfie: true, labels: ['Microphone', 'Headphones', 'Tripod', 'Camera', 'Optical Equipment', 'Studio']},
  life: {name: 'Life', face: 'only-me', labels: ['Outdoor', 'Sky', 'Car', 'Vehicle', 'Coffee', 'Street', 'Road', 'Beach', 'Sea', 'Ocean', 'Water Body', 'Building', 'Cafe', 'Brunch', 'Meal', 'Natural Environment', 'Selfie']},
  clients: {name: 'Product and clients', face: 'any', noSelfie: true, labels: ['Retail', 'Store', 'Shop', 'Product', 'Packaging', 'Box', 'Bottle', 'Cosmetics', 'Meeting', 'Conference', 'Handshake'], weak: true},
  speaking: {name: 'Speaking', face: 'any', noSelfie: true, labels: ['Podium', 'Stage', 'Audience', 'Conference', 'Performance', 'Crowd'], weak: true},
};

const readCfg = () => {
  const c = rj(FILE, null);
  if (!c) throw new Error('no brand/broll.json yet. Run the b-roll conversation first (templates/broll/BROLL.md), then: node engine/broll.mjs init …');
  return c;
};
const bucketOf = (cfg, id) => {
  const b = cfg.buckets.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase());
  if (!b) throw new Error(`no bucket "${id}". The buckets are: ${cfg.buckets.map((x) => `${x.id} (${x.name})`).join(', ')}`);
  return b;
};
const photosMode = (cfg) => {
  if (cfg.mode !== 'photos') return false;
  if (!isMac) throw new Error(`brand/broll.json is set to Apple Photos, which is Mac only, and this is ${osName}. Run init again with --mode folders.`);
  return true;
};

// ---------------- the Photos helper (Mac) ----------------
const pyReady = () => fs.existsSync(PY) && spawnSync(PY, ['-I', '-c', 'import osxphotos, photoscript'], {stdio: 'ignore'}).status === 0;

function setupPython() {
  if (pyReady()) { log('the Photos helper is already installed'); return; }
  log('installing the Photos helper: a private Python 3.12 with osxphotos (reads Photos) and photoscript (makes albums).');
  log('it all goes inside engine/.venv, about 250 MB, a minute or two. Nothing else on this Mac changes.');
  const env = {...process.env, UV_PYTHON_INSTALL_DIR: path.join(PYHOME, 'python'), UV_CACHE_DIR: path.join(PYHOME, 'uv-cache')};
  const run = (cmd, args) => { const r = spawnSync(cmd, args, {stdio: ['ignore', 'inherit', 'inherit'], env}); if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(' ')} failed. Check the internet connection and run setup again.`); };
  fs.mkdirSync(PYHOME, {recursive: true});
  // uv fetches the right Python without touching the system one. Use theirs if they have it.
  let uv = spawnSync('uv', ['--version'], {stdio: 'ignore'}).status === 0 ? 'uv' : path.join(PYHOME, 'uv-boot', 'bin', 'uv');
  if (uv !== 'uv' && !fs.existsSync(uv)) {
    if (spawnSync('python3', ['--version'], {stdio: 'ignore'}).status !== 0) throw new Error('python3 is missing. It comes with the Xcode command line tools: xcode-select --install');
    log('getting uv (the tool that installs Python)…');
    run('python3', ['-m', 'venv', path.join(PYHOME, 'uv-boot')]);
    run(path.join(PYHOME, 'uv-boot', 'bin', 'pip'), ['install', '--quiet', '--disable-pip-version-check', 'uv']);
  }
  log('making the private Python 3.12…');
  run(uv, ['venv', '--quiet', '--python', '3.12', path.join(PYHOME, 'broll')]);
  log('installing osxphotos and photoscript…');
  run(uv, ['pip', 'install', '--quiet', '--python', PY, ...PINS]);
  fs.rmSync(path.join(PYHOME, 'uv-cache'), {recursive: true, force: true});
  if (!pyReady()) throw new Error('the Photos helper did not install cleanly. Run setup again; if it fails twice, send a help note.');
  log('the Photos helper is installed');
}

function py(args, {timeout} = {}) {
  if (!pyReady()) throw new Error('the Photos helper is not installed yet: node engine/broll.mjs setup');
  const r = spawnSync(PY, ['-I', HELPER, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout, maxBuffer: 1 << 28});
  if (r.error?.code === 'ETIMEDOUT') return {ok: false, error: 'timeout'};
  let o;
  try { o = JSON.parse(r.stdout); } catch { throw new Error(`the Photos helper stopped without an answer (exit ${r.status}). ${String(r.stdout).slice(-300)}`); }
  if (o.error === 'cannot-read') throw new Error('macOS will not let me read the Photos library. In System Settings › Privacy & Security › Full Disk Access, turn on the app you are talking to me in (Claude), quit and reopen it, then ask again. You flip that switch; I cannot.');
  return o;
}
const withCfgFile = (cfg, extra, fn) => {
  const f = path.join(os.tmpdir(), `rs-broll-${process.pid}.json`);
  fs.writeFileSync(f, JSON.stringify({...cfg, ...extra}));
  try { return fn(f); } finally { fs.rmSync(f, {force: true}); }
};

// ---------------- folders (Windows, or a Mac that would rather) ----------------
const posix = (p) => p.split(path.sep).join('/');
function dateOf(name, full) {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})[_-]?\d{0,6}/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  return fs.statSync(full).mtime;
}
function walk(dir, skip, out = []) {
  let list = [];
  try { list = fs.readdirSync(dir, {withFileTypes: true}); } catch { return out; }
  for (const f of list) {
    if (f.name.startsWith('.') || f.name.startsWith('$')) continue;
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { if (!skip.some((s) => path.resolve(full) === s)) walk(full, skip, out); }
    else out.push(full);
  }
  return out;
}
function folderCandidates(cfg) {
  if (!cfg.source || !fs.existsSync(cfg.source)) throw new Error(`the footage folder ${cfg.source ?? '(none set)'} is not there. Run init again with --source "<folder>".`);
  const since = new Date(cfg.since ?? '2023-01-01');
  const why = {'too old': 0, 'not from the camera': 0, 'screenshot or screen recording': 0};
  const keep = [];
  for (const full of walk(cfg.source, [path.resolve(cfg.root ?? '\0'), WORK])) {
    const name = path.basename(full);
    if (!(VIDEO_EXT.test(name) || (cfg.media === 'both' && IMAGE_EXT.test(name)))) continue;
    if (/screen ?shot|screen ?recording|^RPReplay/i.test(name)) { why['screenshot or screen recording']++; continue; }
    if (!RAW.test(name)) { why['not from the camera']++; continue; }
    const date = dateOf(name, full);
    if (date < since) { why['too old']++; continue; }
    keep.push({id: posix(path.relative(cfg.source, full)), full, name, date: date.toISOString(), video: VIDEO_EXT.test(name), mb: +(fs.statSync(full).size / 1e6).toFixed(1)});
  }
  keep.sort((a, b) => b.date.localeCompare(a.date));
  return {keep, why};
}
const SORT = path.join(WORK, 'sort.json');
const readSort = () => rj(SORT, {note: 'Which bucket each file goes in, decided by looking at the sheets. build reads this.', numbers: {}, buckets: {}});

// ---------------- thumbnails and sheets ----------------
const THUMBS = path.join(WORK, 'thumbs');
function thumbOf(it) {
  if (it.thumb) return /\.(jpe?g|png)$/i.test(it.thumb) ? it.thumb : null;
  if (!it.full) return null;
  if (IMAGE_EXT.test(it.full)) return it.full;
  const out = path.join(THUMBS, crypto.createHash('md5').update(it.full).digest('hex').slice(0, 16) + '.jpg');
  if (!fs.existsSync(out)) {
    fs.mkdirSync(THUMBS, {recursive: true});
    for (const ss of ['1', '0']) {
      spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', ss, '-i', it.full, '-frames:v', '1', '-vf', 'scale=240:-2', out], {env: ffEnv});
      if (fs.existsSync(out)) break;
    }
  }
  return fs.existsSync(out) ? out : null;
}
// One numbered grid. Numbers are what Claude and the owner talk about ("7 and 12 are the desk ones").
function sheet(items, out, title) {
  const chrome = chromePath();
  if (!chrome) { log('no headless browser found (install Google Chrome), so no preview sheet'); return null; }
  const cols = 6;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const tiles = items.map((it) => {
    const t = thumbOf(it);
    return `<div style="position:relative;width:240px;height:300px;background:#222;overflow:hidden">${t ? `<img src="${fileUrl(t)}" style="width:240px;height:300px;object-fit:cover;display:block">` : '<div style="color:#888;padding:120px 0;text-align:center">no preview</div>'}<span style="position:absolute;left:4px;top:4px;background:#FFE14D;color:#111;font-weight:700;padding:1px 6px;font-size:16px">${it.n}</span><span style="position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);color:#fff;padding:3px 5px;font-size:11px">${esc(it.name)} · ${it.date.slice(0, 10)}${it.seconds ? ` · ${it.seconds}s` : ''}</span></div>`;
  }).join('');
  const html = `<html><body style="margin:0;background:#111;font:12px -apple-system,'Segoe UI',sans-serif"><div style="color:#fff;padding:8px 10px;font-size:15px">${esc(title)}</div><div style="display:grid;grid-template-columns:repeat(${cols},240px);gap:4px;padding:0 4px 4px">${tiles}</div></body></html>`;
  const hf = path.join(os.tmpdir(), `rs-broll-sheet-${process.pid}.html`);
  fs.writeFileSync(hf, html);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const rows = Math.ceil(items.length / cols);
  spawnSync(chrome, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${cols * 244 + 8},${rows * 304 + 44}`, `--screenshot=${out}`, fileUrl(hf)], {stdio: 'ignore'});
  fs.rmSync(hf, {force: true});
  return fs.existsSync(out) ? out : null;
}

// ---------------- init / status ----------------
const many = (args, flag) => args.flatMap((a, i) => (args[i - 1] === flag ? [a] : []));
const pairs = (args, flag) => Object.fromEntries(many(args, flag).map((s) => { const i = s.indexOf('='); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; }));
const flag = (args, name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };

function cmdInit(args) {
  const mode = flag(args, '--mode') ?? (isMac ? 'photos' : 'folders');
  if (mode === 'photos' && !isMac) throw new Error(`Apple Photos albums are Mac only and this is ${osName}. Use --mode folders.`);
  if (fs.existsSync(FILE) && !args.includes('--force')) throw new Error('brand/broll.json already exists. Read it with: node engine/broll.mjs status (add --force to start it again)');
  const ids = (flag(args, '--buckets') ?? 'working,bts,life').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length > 6) log(`that is ${ids.length} buckets. Three to five is easier to live with; say so if they are sure.`);
  const names = pairs(args, '--name'), labels = pairs(args, '--labels'), albums = pairs(args, '--album');
  const prefix = flag(args, '--prefix') ?? 'B-roll: ';
  const buckets = ids.map((id) => {
    const p = PRESETS[id] ?? {name: id[0].toUpperCase() + id.slice(1), face: 'any', labels: []};
    const name = names[id] ?? p.name;
    const b = {id, name, face: p.face, labels: labels[id] ? labels[id].split(',').map((s) => s.trim()) : p.labels};
    if (p.weak) b.weak = true;
    if (p.noSelfie) b.noSelfie = true;
    if (mode === 'photos') { b.album = albums[id] ?? `${prefix}${name}`; if (albums[id]) b.adopt = true; }
    if (mode === 'photos' && !b.adopt && !b.labels.length) b.byHand = true;
    return b;
  });
  const cfg = {
    $schema: 'reel-studio/broll.json v1',
    note: 'Where their b-roll lives. Written by engine/broll.mjs; the editor reads it before choosing footage.',
    mode, since: flag(args, '--since') ?? '2023-01-01', media: flag(args, '--media') ?? 'videos',
    me: flag(args, '--me') ?? null,
    leaveOut: (flag(args, '--leave-out') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    leaveOutLabels: args.includes('--kids-out') ? ['Baby', 'Child', 'Nappy', 'Crib', 'High Chair', 'Stroller'] : [],
    buckets, lastRun: {}, clips: {},
  };
  if (mode === 'folders') {
    const src = flag(args, '--source');
    if (!src) throw new Error('folders mode needs --source "<the folder their footage is in>"');
    cfg.source = path.resolve(src);
    cfg.root = path.resolve(flag(args, '--root') ?? path.join(cfg.source, 'B-roll'));
    cfg.link = args.includes('--copy') ? 'copy' : 'link';
    for (const b of buckets) b.folder = path.join(cfg.root, b.name);
  }
  wj(FILE, cfg);
  log('wrote brand/broll.json');
  cmdStatus();
}

function cmdStatus() {
  const cfg = readCfg();
  log(`b-roll lives in ${cfg.mode === 'photos' ? 'Apple Photos albums' : `folders under ${cfg.root}`}, from ${cfg.since} on, ${cfg.media === 'both' ? 'videos and photos' : 'videos only'}`);
  if (cfg.mode === 'folders') log(`footage is read from ${cfg.source} and ${cfg.link === 'copy' ? 'copied' : 'linked (no extra space used)'} into the bucket folders`);
  if (cfg.me) log(`their face in Photos: "${cfg.me}"`); else if (cfg.mode === 'photos') log('no face named, so buckets go on what is in the picture only');
  if (cfg.leaveOut?.length) log(`left out: ${cfg.leaveOut.join(', ')}`);
  if (cfg.leaveOutLabels?.length) log('photos of babies and kids are left out');
  for (const b of cfg.buckets) log(`  ${b.id.padEnd(9)} ${b.name}${b.album ? `  →  album "${b.album}"${b.adopt ? ' (theirs already)' : ''}` : b.folder ? `  →  ${b.folder}` : ''}${b.count != null ? `  ${plural(b.count, 'item')}` : ''}${b.byHand ? '  (picked by hand)' : ''}`);
  const used = Object.keys(cfg.clips ?? {}).length;
  log(`last scan: ${cfg.lastRun?.scan ?? 'never'}   last build: ${cfg.lastRun?.build ?? 'never'}   clips used in reels so far: ${used}`);
}

// ---------------- scan ----------------
function cmdScan() {
  const cfg = readCfg();
  if (photosMode(cfg)) {
    const r = withCfgFile(cfg, {}, (f) => py(['scan', f]));
    log(`${r.candidates} camera clips${cfg.media === 'both' ? ' and photos' : ''} since ${cfg.since}. Skipped: ${Object.entries(r.skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`);
    for (const b of cfg.buckets) {
      const s = r.buckets[b.id];
      const look = s.sample.length ? sheet(s.sample.map((it, i) => ({...it, n: i + 1})), path.join(WORK, 'preview', `${b.id}.png`), `${b.name}: the newest ${s.sample.length} of ${s.count}`) : null;
      log(`  ${b.name}: ${s.count}${s.shared ? ` (${s.shared} also in another bucket)` : ''}${b.adopt ? ', their existing album' : ''}${b.weak ? '. Photos is not good at spotting this one: look at the preview before saying yes' : ''}`);
      if (look) log(`    preview: ${look}`);
    }
    log(`  not in any bucket: ${r.unsorted}. That is normal: most of a camera roll is not b-roll.`);
    cfg.lastRun.scan = now();
    for (const b of cfg.buckets) b.found = r.buckets[b.id].count;
  } else {
    const {keep, why} = folderCandidates(cfg);
    const s = readSort();
    const placed = keep.filter((it) => s.buckets[it.id]);
    const out = placed.filter((it) => s.buckets[it.id] === 'none').length;
    log(`${keep.length} camera clips in ${cfg.source} since ${cfg.since}. Skipped: ${Object.entries(why).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`);
    for (const b of cfg.buckets) log(`  ${b.name}: ${placed.filter((it) => s.buckets[it.id] === b.id).length} sorted so far`);
    if (out) log(`  not b-roll: ${out}`);
    log(`  still to look at: ${keep.length - placed.length}${keep.length - placed.length ? '  (node engine/broll.mjs sheets)' : ''}`);
    cfg.lastRun.scan = now();
  }
  wj(FILE, cfg);
  log('nothing has been moved, copied or added anywhere.');
}

// ---------------- sheets / sort (folders) ----------------
function cmdSheets(args) {
  const cfg = readCfg();
  if (cfg.mode !== 'folders') throw new Error('sheets is for folders mode. In Photos mode, scan makes a preview per bucket.');
  const {keep} = folderCandidates(cfg);
  const s = readSort();
  const todo = args.includes('--all') ? keep : keep.filter((it) => !s.buckets[it.id]);
  const per = 24;
  // numbers stay stable across runs, so "12" means the same clip tomorrow
  let next = Math.max(0, ...Object.values(s.numbers)) + 1;
  for (const it of todo) if (!s.numbers[it.id]) s.numbers[it.id] = next++;
  wj(SORT, s);
  const dir = path.join(WORK, 'sheets');
  fs.rmSync(dir, {recursive: true, force: true});
  const made = [];
  for (let i = 0; i < todo.length; i += per) {
    const page = todo.slice(i, i + per).map((it) => ({...it, n: s.numbers[it.id]}));
    const f = sheet(page, path.join(dir, `sheet-${String(made.length + 1).padStart(2, '0')}.png`), `To sort: ${page[0].n} to ${page[page.length - 1].n}  (${cfg.buckets.map((b) => b.name).join(' / ')})`);
    if (f) made.push(f);
  }
  if (!todo.length) { log('everything is sorted. Next: node engine/broll.mjs build'); return; }
  log(`${plural(todo.length, 'clip')} on ${plural(made.length, 'sheet')}:`);
  for (const f of made) log(`  ${f}`);
  if (made.length) log('look at each sheet, then: node engine/broll.mjs sort <bucket> 3 7 12-15   (anything left out stays out of b-roll)');
}

const rangeList = (xs) => xs.flatMap((x) => { const m = String(x).match(/^(\d+)-(\d+)$/); return m ? Array.from({length: +m[2] - +m[1] + 1}, (_, i) => +m[1] + i) : /^\d+$/.test(x) ? [+x] : []; });
function cmdSort(args) {
  const cfg = readCfg();
  if (cfg.mode !== 'folders') throw new Error('sort is for folders mode. In Photos mode the buckets come from Photos itself.');
  const s = readSort();
  const byN = Object.fromEntries(Object.entries(s.numbers).map(([id, n]) => [n, id]));
  const from = flag(args, '--from');
  const plan = from ? rj(path.resolve(from), {}) : {[args[0]]: args.slice(1)};
  for (const [bid, list] of Object.entries(plan)) {
    const b = bid === 'none' ? {id: null, name: 'not b-roll'} : bucketOf(cfg, bid);
    const ns = rangeList(list);
    const bad = ns.filter((n) => !byN[n]);
    if (bad.length) log(`no clip numbered ${bad.join(', ')}: run sheets first`);
    // "none" is a decision too: those stop turning up on the sheets
    for (const k of ns) if (byN[k]) s.buckets[byN[k]] = b.id ?? 'none';
    log(`${b.name}: ${plural(ns.length - bad.length, 'clip')}`);
  }
  wj(SORT, s);
}

// ---------------- build ----------------
function cmdBuild(args) {
  const cfg = readCfg();
  const yes = args.includes('--yes');
  if (photosMode(cfg)) {
    const make = cfg.buckets.filter((b) => !b.adopt);
    if (!make.length) {
      for (const b of cfg.buckets) b.count = b.found ?? b.count ?? null;
      log('nothing to make: every bucket is an album they already have. find and export read those albums as they are.');
      cfg.lastRun.build = now(); wj(FILE, cfg); return;
    }
    if (!yes) {
      log('this would make these albums in Apple Photos and add to them (nothing is moved, copied or deleted):');
      for (const b of make) log(`  "${b.album}"${b.found != null ? `  ${b.found} items` : ''}`);
      log('show them the counts and previews from scan, ask, and on a yes run: node engine/broll.mjs build --yes');
      process.exitCode = 1; return;
    }
    log('making the albums. The first time, macOS asks to let Claude control Photos: they click OK.');
    const r = withCfgFile(cfg, {}, (f) => py(['build', f, '--yes']));
    if (!r.ok) throw new Error(`Photos did not make the albums (${r.error}). If macOS asked about controlling Photos and they said no, it is in System Settings › Privacy & Security › Automation.`);
    for (const b of cfg.buckets) { const a = r.albums[b.id]; b.count = a.total; log(`  "${b.album}": ${a.adopted ? `${a.total}, their own album, left as it is` : `${a.added} added, ${a.total} in it now`}`); }
  } else {
    const {keep} = folderCandidates(cfg);
    const s = readSort();
    const go = keep.filter((it) => s.buckets[it.id] && s.buckets[it.id] !== 'none');
    if (!yes) {
      log(`this would ${cfg.link === 'copy' ? 'copy' : 'link'} ${go.length} clips into ${cfg.root} (the originals stay where they are):`);
      for (const b of cfg.buckets) log(`  ${b.folder}  ${go.filter((it) => s.buckets[it.id] === b.id).length}`);
      log('ask, and on a yes run: node engine/broll.mjs build --yes');
      process.exitCode = 1; return;
    }
    let linked = 0, copied = 0;
    for (const b of cfg.buckets) {
      fs.mkdirSync(b.folder, {recursive: true});
      for (const it of go.filter((x) => s.buckets[x.id] === b.id)) {
        let to = path.join(b.folder, it.name);
        if (fs.existsSync(to)) { if (fs.statSync(to).size === fs.statSync(it.full).size) continue; to = to.replace(/(\.[^.]+)$/, `-${crypto.createHash('md5').update(it.id).digest('hex').slice(0, 6)}$1`); if (fs.existsSync(to)) continue; }
        // a hard link is the same file twice over and costs no space; different drives need a copy
        if (cfg.link !== 'copy') { try { fs.linkSync(it.full, to); linked++; continue; } catch {} }
        fs.copyFileSync(it.full, to); copied++;
      }
      b.count = fs.readdirSync(b.folder).filter((f) => VIDEO_EXT.test(f) || IMAGE_EXT.test(f)).length;
      log(`  ${b.name}: ${b.count} in ${b.folder}`);
    }
    log(`${linked} linked, ${copied} copied. Nothing was moved or deleted.`);
  }
  cfg.lastRun.build = now();
  wj(FILE, cfg);
}

// ---------------- find / export ----------------
function listBucket(cfg, b, {since, photos} = {}) {
  if (photosMode(cfg)) {
    const r = withCfgFile(cfg, {album: b.album, bucket: b.id, since, kind: photos ? 'any' : 'video'}, (f) => py(['find', f]));
    if (!r.ok && r.error === 'no-album') throw new Error(`there is no album "${b.album}" in Photos yet. Run scan, then build.`);
    return r.items;
  }
  if (!fs.existsSync(b.folder)) throw new Error(`the folder ${b.folder} is not there yet. Run scan, sheets, sort, then build.`);
  const cut = since ? new Date(since) : null;
  return fs.readdirSync(b.folder).filter((f) => VIDEO_EXT.test(f) || (photos && IMAGE_EXT.test(f))).map((f) => {
    const full = path.join(b.folder, f);
    return {id: posix(path.relative(cfg.root, full)), full, name: f, date: dateOf(f, full).toISOString(), video: VIDEO_EXT.test(f), local: true, bucket: b.id};
  }).filter((it) => !cut || new Date(it.date) >= cut).sort((a, c) => c.date.localeCompare(a.date));
}
// Ranked for one line: what Photos or an earlier reel says the clip shows, against the words of the line.
// Unused clips come first so the same three do not turn up in every reel.
function rank(cfg, items, about) {
  const want = about ? keywords(about) : [];
  return items.map((it) => {
    const known = cfg.clips?.[it.id];
    const words = keywords([known?.shows, it.caption, ...(it.labels ?? [])].filter(Boolean).join(' '));
    const hits = want.filter((w) => words.includes(w));
    return {...it, shows: known?.shows ?? null, usedIn: known?.usedIn ?? [], hits};
  }).sort((a, b) => (b.hits.length - a.hits.length) || (a.usedIn.length - b.usedIn.length) || b.date.localeCompare(a.date));
}
const secs = (it) => {
  if (it.seconds || !it.full || !it.video) return it.seconds;
  try { return +(+JSON.parse(execFileSync(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', it.full], {env: ffEnv})).format.duration).toFixed(1); } catch { return null; }
};

function cmdFind(bid, args) {
  const cfg = readCfg();
  const b = bucketOf(cfg, bid);
  const limit = +(flag(args, '--limit') ?? 12);
  const about = flag(args, '--about');
  const all = rank(cfg, listBucket(cfg, b, {since: flag(args, '--since'), photos: args.includes('--photos')}), about);
  const list = all.slice(0, limit).map((it, i) => ({...it, n: i + 1, seconds: secs(it)}));
  if (args.includes('--json')) { console.log(JSON.stringify(list, null, 2)); return; }
  log(`${b.name}: ${plural(all.length, args.includes('--photos') ? 'item' : 'clip')}${about ? `, best match first for "${about}"` : ', newest first'}${all.length > limit ? `, showing ${limit}` : ''}`);
  for (const it of list) {
    log(`  ${String(it.n).padStart(2)}. ${it.name}  ${it.date.slice(0, 10)}${it.seconds ? `  ${it.seconds}s` : ''}${it.local === false ? '  (in iCloud)' : ''}${it.usedIn.length ? `  used in ${it.usedIn.join(', ')}` : ''}`);
    if (it.shows) log(`      shows: ${it.shows}`);
    else if (it.caption) log(`      Photos guesses: ${it.caption} (a hint only: look before you use it)`);
    log(`      id: ${it.id}`);
  }
  if (list.length && args.includes('--sheet')) log(`sheet: ${sheet(list, path.join(WORK, 'find', `${b.id}.png`), `${b.name}${about ? ` for "${about}"` : ''}`)}`);
}

function cmdExport(bid, slug, args) {
  const cfg = readCfg();
  const b = bucketOf(cfg, bid);
  if (!slug) throw new Error('which reel? node engine/broll.mjs export <bucket> <slug>');
  const raw = path.join(PROJECTS, slug, 'raw');
  if (!fs.existsSync(path.join(PROJECTS, slug))) throw new Error(`no project "${slug}". Make it first: node engine/reel.mjs new ${slug}`);
  fs.mkdirSync(raw, {recursive: true});
  const ids = flag(args, '--ids')?.split(',').map((s) => s.trim());
  const all = rank(cfg, listBucket(cfg, b, {since: flag(args, '--since')}), flag(args, '--about'));
  const pick = ids ? ids.map((id) => all.find((it) => it.id === id || it.name === id) ?? (() => { throw new Error(`no clip "${id}" in ${b.name}`); })()) : all.slice(0, +(flag(args, '--limit') ?? 3));
  if (!pick.length) { log(`${b.name} is empty, so there is nothing to bring in. Use a type-led effect for this line, or ask them for footage.`); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-broll-'));
  const got = [];
  for (const it of pick) {
    const dest = path.join(raw, `broll-${b.id}-${it.name}`.replace(/\s+/g, '_'));
    if (fs.existsSync(dest)) { log(`already in the project: ${path.basename(dest)}`); got.push({it, dest}); continue; }
    if (it.full) fs.copyFileSync(it.full, dest);
    else {
      // iCloud originals come down through Photos; a slow line can take a minute
      const r = py(['export', it.id, tmp], {timeout: 240000});
      if (!r.ok) { log(`could not get ${it.name} out of Photos (${r.error === 'timeout' ? 'it took too long, iCloud may still be downloading' : r.detail ?? r.error}). Check Photos is open and not showing a message, then try again, or they can drag it from the "${b.album}" album into the inbox.`); continue; }
      fs.renameSync(r.file, dest);
    }
    log(`brought in ${path.basename(dest)}${it.caption ? `  (Photos guesses: ${it.caption})` : ''}`);
    got.push({it, dest});
  }
  fs.rmSync(tmp, {recursive: true, force: true});
  for (const {it, dest} of got) {
    const c = (cfg.clips[it.id] ??= {bucket: b.id, name: it.name, shows: null, usedIn: []});
    c.file = path.basename(dest);
    if (!c.usedIn.includes(slug)) c.usedIn.push(slug);
  }
  wj(FILE, cfg);
  if (got.length) {
    log(`next: node engine/reel.mjs prep ${slug}   (proxies and contact sheets for the new clips; footage already prepped is skipped)`);
    log(`then look at each sheet and describe it: node engine/reel.mjs describe ${slug} --set "<id>" "what it shows". A clip nobody has described is not used.`);
    log(`once they are described: node engine/broll.mjs remember ${slug}`);
  }
}

// Descriptions written in a reel's assets.json flow back here, so the next search can read them.
function cmdRemember(slug) {
  const cfg = readCfg();
  const assets = rj(path.join(PROJECTS, slug ?? '', 'assets.json'), null);
  if (!assets) throw new Error(`no assets.json in ${slug}. Run: node engine/reel.mjs prep ${slug}`);
  let n = 0;
  for (const [, c] of Object.entries(cfg.clips ?? {})) {
    if (!c.usedIn?.includes(slug) || !c.file) continue;
    const id = c.file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_');
    const a = assets.items?.[id];
    if (a?.shows && a.shows !== c.shows) { c.shows = a.shows; n++; log(`${c.name}: ${a.shows}`); }
  }
  wj(FILE, cfg);
  log(n ? `kept ${n} description${n > 1 ? 's' : ''} in brand/broll.json` : 'nothing new to keep: describe the b-roll clips in that reel first');
}

// ---------------- setup ----------------
function cmdSetup() {
  if (!isMac) { log(`this is ${osName}, so b-roll goes in folders (Apple Photos is Mac only). Nothing to install.`); return; }
  setupPython();
  const r = py(['check']);
  log(`Photos library: ${r.items} items`);
  log(r.people.length ? `faces named in Photos: ${r.people.join(', ')}` : 'no faces are named in Photos yet');
  const ours = r.albums.filter((a) => /b-?roll/i.test(a));
  if (ours.length) log(`albums that look like b-roll already: ${ours.join(', ')}`);
}

const [cmd, a1, ...rest] = process.argv.slice(2);
try {
  if (!cmd) { const head = fs.readFileSync(new URL(import.meta.url)).toString().split('\n'); console.log(head.slice(1, head.findIndex((l, i) => i > 0 && !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); }
  else if (cmd === 'setup') cmdSetup();
  else if (cmd === 'init') cmdInit([a1, ...rest].filter((x) => x !== undefined));
  else if (cmd === 'status') cmdStatus();
  else if (cmd === 'scan') cmdScan();
  else if (cmd === 'sheets') cmdSheets([a1, ...rest].filter(Boolean));
  else if (cmd === 'sort') cmdSort([a1, ...rest].filter(Boolean));
  else if (cmd === 'build') cmdBuild([a1, ...rest].filter(Boolean));
  else if (cmd === 'find') cmdFind(a1, rest);
  else if (cmd === 'export') cmdExport(a1, rest[0], rest.slice(1));
  else if (cmd === 'remember') cmdRemember(a1);
  else if (cmd === 'open') { const cfg = readCfg(); openFolder(cfg.mode === 'folders' ? cfg.root : WORK); }
  else console.log('unknown command', cmd);
} catch (e) { console.error('✗', e.message); process.exitCode = 1; }
