// Described footage, so choosing b-roll stops being a guess.
//
// The 20 Oct failure that started all of this put a screen recording of one thing over a sentence
// about something else. It was not carelessness: the project held four video files and not one word
// anywhere on disk about what any of them showed. The transcript said what she was saying; nothing
// said what the footage was. So "pick b-roll for this line" was a guess dressed up as a decision.
//
// This is the missing half. Every clip and every image in a project gets one line saying what it
// shows, written into projects/<slug>/assets.json, and the editing procedure may only put an asset
// over a line whose words it matches.
//
// The honest part, and the reason this is worth having: an asset with no description is not used.
// Not "used with a warning", not "used if it looks about right". buildPlan refuses the cut and names
// the asset. A guess that is allowed through is the bug, so the only safe default is to stop.
//
// Who writes the line: Claude, looking at the contact sheet prep already renders for every clip.
// `describe <slug>` lists what is missing and the sheet to open for each one. The clip's own speech
// is offered as a hint and nothing more: a screen recording of one app can have the owner talking
// about something else entirely across the top of it, so what it SAYS is not what it SHOWS.
import fs from 'fs';
import path from 'path';
import {relPosix} from './platform.mjs';

const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');

const VIDEO_EXT = /\.(mov|mp4|m4v|hevc)$/i;
const IMAGE_EXT = /\.(png|jpe?g|heic|webp)$/i;

// Words that match everything and therefore prove nothing.
const STOP = new Set(('a an the and or of to in on at for with from by is are was were be been it its this that these those my your her his their our as if so but not no do does did done you i we they he she them us me than then there here what which who how why when where while over under into out up down off about all any both each few more most other some such only own same very can will just should now get got go going make makes made like really actually thing things one two three'.split(' ')));
// Enough of a stem that "listing" matches "listings" and "edit" matches "editing", without pulling
// in a stemmer the kit does not need.
const stem = (w) => w.replace(/'s$/, '').replace(/(ings|ing|ers|er|ed|es|s)$/, '');
export const keywords = (line) => [...new Set(String(line ?? '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 2 && !STOP.has(w)).map(stem).filter((w) => w.length > 2))];

export const assetsFile = (P, slug) => P(slug, 'assets.json');
export const readAssets = (P, slug) => rj(assetsFile(P, slug), null);

// Every clip and every image in the project, described or not. Called by prep (so a new project
// always has the file) and by `describe` (so footage added later is picked up).
export function scanAssets(P, slug, {log} = {}) {
  const have = readAssets(P, slug) ?? {$schema: 'reel-studio/assets.json v1', note: 'One line per clip and image saying what it SHOWS. Claude writes these from the contact sheets. An asset with no description is not used in a cut.', items: {}};
  const info = rj(P(slug, 'analysis', 'clips.json'), {});
  const items = have.items ?? (have.items = {});
  // clips, by the id edit.json refers to them by
  for (const [id, c] of Object.entries(info)) {
    const sheet = relPosix(P(slug), P(slug, 'analysis', `${id}.sheet.png`));
    items[id] = {
      kind: c.audioOnly ? 'audio' : 'clip',
      file: c.file,
      seconds: +(c.duration ?? 0).toFixed(1),
      sheet: fs.existsSync(P(slug, sheet)) ? sheet : null,
      said: c.text ? String(c.text).slice(0, 160) : null,
      ...items[id],
    };
    if (!('shows' in items[id])) items[id].shows = null;
  }
  // images and extra media dropped in assets/
  const dir = P(slug, 'assets');
  if (fs.existsSync(dir)) {
    const walk = (d) => {
      for (const f of fs.readdirSync(d, {withFileTypes: true})) {
        const full = path.join(d, f.name);
        if (f.isDirectory()) { walk(full); continue; }
        if (!IMAGE_EXT.test(f.name) && !VIDEO_EXT.test(f.name)) continue;
        if (/\.cut\.png$/i.test(f.name)) continue; // a cutout of an asset already described
        const rel = relPosix(P(slug), full);
        items[rel] = {kind: IMAGE_EXT.test(f.name) ? 'image' : 'clip', file: rel, sheet: null, ...items[rel]};
        if (!('shows' in items[rel])) items[rel].shows = null;
      }
    };
    walk(dir);
  }
  for (const [, v] of Object.entries(items)) if (v.shows) v.words = keywords(v.shows);
  wj(assetsFile(P, slug), have);
  const missing = Object.entries(items).filter(([, v]) => !v.shows);
  if (log && missing.length) log(`${missing.length} of ${Object.keys(items).length} assets have no description yet: node reel.mjs describe ${slug}`);
  return have;
}

export function setDescription(P, slug, id, line) {
  const have = readAssets(P, slug) ?? scanAssets(P, slug);
  const item = have.items[id];
  if (!item) throw new Error(`no asset "${id}" in ${slug}. node reel.mjs describe ${slug} lists them.`);
  const text = String(line ?? '').trim();
  if (text.length < 4) throw new Error('a description needs to say what the asset shows, in words');
  item.shows = text;
  item.words = keywords(text);
  item.describedAt = Date.now();
  wj(assetsFile(P, slug), have);
  return item;
}

export function printAssets(P, slug, log) {
  const have = readAssets(P, slug);
  if (!have) { log(`${slug} has no assets.json yet. Run prep, or node reel.mjs describe ${slug} to build it.`); return; }
  const items = Object.entries(have.items);
  const missing = items.filter(([, v]) => !v.shows);
  log(`${slug}: ${items.length} assets, ${items.length - missing.length} described, ${missing.length} not`);
  for (const [id, v] of items) {
    log('');
    log(`  ${id}  (${v.kind}${v.seconds ? `, ${v.seconds}s` : ''})`);
    if (v.shows) log(`    shows: ${v.shows}`);
    else log(`    shows: NOT DESCRIBED — this asset cannot be used in a cut until it is`);
    if (v.sheet) log(`    look at: ${P(slug, v.sheet)}`);
    else if (v.kind === 'image') log(`    look at: ${P(slug, v.file)}`);
    if (v.said) log(`    (it says: "${v.said.slice(0, 90)}" — a hint only. What it says is not what it shows.)`);
  }
  if (missing.length) {
    log('');
    log('  Open each sheet above, then write one line for each:');
    log(`    node reel.mjs describe ${slug} --set "<id>" "what it shows"`);
    log(`    node reel.mjs describe ${slug} --from descriptions.json     # {"<id>": "what it shows", ...}`);
  }
}

// ---------------------------------------------------------------- using them in a cut
//
// Called by buildPlan with every asset reference the edit makes. Returns the rows that go into
// plan.json, and throws when the cut uses something nobody has described.
export function resolveUse(P, slug, uses, {log} = {}) {
  const have = readAssets(P, slug);
  if (!have) {
    if (uses.length && log) log(`no assets.json in ${slug}, so b-roll choices here were not checked against what the footage shows. Build it: node reel.mjs describe ${slug}`);
    return null;
  }
  const items = have.items ?? {};
  const rows = [], undescribed = [];
  for (const u of uses) {
    // uses come in as {ref, type, start, dur, spoken}: ref is a clip id or an assets/ path
    const item = items[u.ref];
    if (!item) { rows.push({...u, shows: null, words: [], unknown: true}); undescribed.push(u); continue; }
    if (!item.shows) { rows.push({...u, shows: null, words: [], unknown: true}); undescribed.push(u); continue; }
    const words = item.words ?? keywords(item.shows);
    const said = keywords(u.spoken ?? '');
    const hit = words.filter((w) => said.some((s) => s === w || s.startsWith(w) || w.startsWith(s)));
    rows.push({...u, shows: item.shows, words, matched: hit.length > 0, matchedOn: hit, spoken: u.spoken ?? null});
  }
  if (undescribed.length) {
    const list = undescribed.map((u) => `  ${u.ref} (${u.type} at ${u.start.toFixed(1)}s)`).join('\n');
    throw new Error(
      `this cut puts footage on screen that nothing on disk describes, so there is no way to know it is about the words underneath it:\n${list}\n\n` +
      `Describe it first, then render:\n  node reel.mjs describe ${slug}\n\n` +
      `An asset with no description is not used. If you cannot say what it shows, use a type-led effect instead (bigword, counter, label, colourbg).`);
  }
  return rows;
}
