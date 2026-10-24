// The owner's voice: how THIS person writes the words that go on screen.
//
// brand.json holds the look (colours, fonts, caption sizes). It is deliberately the same shape for
// everybody, because the look is a brand and a brand should be consistent. voice.json holds the
// opposite: the parts of a reel that must never be the same from one person to the next. How they
// ask for something at the end. Whether they even want a comment-keyword. The words they use and
// the words they refuse. Which effects they love.
//
// Setup writes it by asking (see the setup conversation in CLAUDE.md). Nothing here invents an
// answer: a field nobody has answered comes back null, and the planner asks rather than borrowing
// the example's. The guard below is the backstop: the kit's own example copy cannot reach a cut
// unless this file says it is this person's.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// REEL_VOICE points at another profile. Only reason it exists: proving the guard, by cutting the
// same footage as two different people without editing anybody's brand folder.
export function voiceFile(studio) { return process.env.REEL_VOICE || path.join(studio, 'brand', 'voice.json'); }

export function loadVoice(studio) {
  const f = voiceFile(studio);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`brand/voice.json will not parse: ${e.message}`); }
}

// An empty profile, written at setup so the file exists with the questions still visible in it.
export function blankVoice() {
  return {
    $schema: 'reel-studio/voice.json v1',
    note: 'How this person writes the words on screen. Claude fills this in by asking, one question at a time, and reads it before writing a single word into a cut. A null means nobody has answered yet: ask, do not guess.',
    ask: {kind: null, endCard: null, dmLine: null, reply: null, keywords: [], verbs: [], notes: null},
    words: {says: [], never: [], spelling: null, punctuation: null},
    openers: {habits: [], avoid: []},
    effects: {love: [], avoid: []},
    allow: [],
  };
}

// ---------- the guard ----------
const KIT = JSON.parse(fs.readFileSync(path.join(HERE, 'kit-example-copy.json'), 'utf8'));

// Keys whose string values are not words on screen: file paths, enum choices, colours.
const NOT_TEXT = new Set(['src', 'srcs', 'clip', 'kind', 'type', 'dir', 'format', 'font', 'bg', 'mode', 'side', 'colour', 'color', 'c', 'f', 'ref', 'shows', 'spoken', 'id', 'slug', 'icon', 'entry', 'style', 'w']);

// Every written word a cut puts on screen. Captions are excluded on purpose: those are the words
// the person actually said, transcribed, so they are theirs by definition. Everything else here is
// a decision somebody typed.
export function writtenText(plan) {
  const out = [];
  const walk = (node, trail) => {
    // an array of plain strings is the common case for words on screen (end.lines, dropdown
    // options, flow steps), so those are collected here rather than falling through as non-objects
    if (Array.isArray(node)) return node.forEach((v) => { if (typeof v === 'string') { if (v.trim()) out.push({text: v, where: trail.join('.'), t: 0}); } else walk(v, trail); });
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (NOT_TEXT.has(k)) continue;
      if (typeof v === 'string') { if (v.trim()) out.push({text: v, where: [...trail, k].join('.'), t: node.start ?? node.at ?? 0}); }
      else walk(v, [...trail, k]);
    }
  };
  walk({hook: plan.hook}, []);
  walk({labels: plan.labels}, []);
  walk({checklist: plan.checklist}, []);
  walk({end: plan.end}, []);
  walk({fx: plan.fx}, []);
  return out;
}

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').replace(/[.,!?:;]+$/, '').trim();

// What the owner has told us is theirs: anything they declared in voice.json. A word they really do
// use is allowed even if the kit's author used it too; the test is whether they said so, not
// whether it is unusual.
export function ownWords(voice) {
  if (!voice) return [];
  const bag = [];
  const take = (v) => { if (typeof v === 'string') bag.push(v); else if (Array.isArray(v)) v.forEach(take); };
  take(voice.ask?.endCard); take(voice.ask?.dmLine); take(voice.ask?.reply); take(voice.ask?.keywords); take(voice.ask?.verbs); take(voice.ask?.notes);
  take(voice.words?.says); take(voice.openers?.habits); take(voice.allow);
  return bag.map(norm).filter(Boolean);
}

// Returns one entry per piece of written text that must not ship, with why.
//   kind "placeholder": a blank from the starting point that nobody filled in.
//   kind "borrowed":    real copy belonging to whoever built the kit.
// A borrowed string is cleared the moment voice.json claims it, which is the only way through:
// either this person really does say it, in which case somebody wrote it down as theirs, or the
// words have to come from this reel.
export function borrowedCopy(plan, voice, {slug} = {}) {
  if (slug === 'smoke') return [];   // the installer's own test reel: its words are the kit's on purpose
  const mine = ownWords(voice);
  const claimed = (s) => mine.some((m) => m === s || m.includes(s) || s.includes(m));
  const hits = [];
  for (const {text, where, t} of writtenText(plan)) {
    for (const line of text.split('\n')) {
      const s = norm(line);
      if (!s) continue;
      const ph = KIT.placeholders.find((p) => norm(p) === s);
      if (ph) { hits.push({kind: 'placeholder', t, where, text: line.trim(), whose: 'an unfilled blank from the starting point'}); continue; }
      const b = KIT.borrowed.find((x) => (x.match === 'contains' ? s.includes(norm(x.text)) : s === norm(x.text)));
      if (b && !claimed(s)) hits.push({kind: 'borrowed', t, where, text: line.trim(), whose: b.whose});
    }
  }
  return hits;
}

// ---------- reel history ----------
// What the last few reels did, so the next one can open differently. Appended by `render`. A
// brand-new buyer has no file and gets an empty list, which is a perfectly good answer.
export function historyFile(studio) { return path.join(studio, 'brand', 'history.json'); }

export function readHistory(studio) {
  const f = historyFile(studio);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).reels ?? []; } catch { return []; }
}

// One row per rendered cut: enough to see sameness, not enough to be a second copy of the plan.
export function noteHistory(studio, slug, plan, {v} = {}) {
  const f = historyFile(studio);
  let doc = {$schema: 'reel-studio/history.json v1', note: 'What each rendered cut opened with and which effects it used, newest last. Claude reads the last few before planning so one person\'s third reel does not open like their first. Safe to delete; it only ever costs you the anti-repeat.', reels: []};
  if (fs.existsSync(f)) { try { doc = {...doc, ...JSON.parse(fs.readFileSync(f, 'utf8'))}; } catch {} }
  const row = {
    slug, v: v ?? null, at: Date.now(),
    hook: plan.hook ? {mode: plan.hook.mode ?? 'top', text: (plan.hook.text ?? '').split('\n')[0].slice(0, 60)} : null,
    captions: plan.captions?.mode ?? null,
    opening: (plan.fx ?? []).filter((x) => (x.start ?? 0) < 6).map((x) => x.type),
    fx: (plan.fx ?? []).map((x) => x.type),
    end: plan.end?.lines ?? null,
  };
  // one row per reel, not per version: it is the finished shape of a reel that the next one should
  // differ from, and ten renders of the same cut are not ten reels
  doc.reels = [...(doc.reels ?? []).filter((r) => r.slug !== slug), row].slice(-20);
  fs.writeFileSync(f, JSON.stringify(doc, null, 2));
  return row;
}

// The opening of a reel is the thing a viewer compares. Same hook mode plus the same first effect
// as the cut before it is the sameness the product was accused of, so it gets said out loud.
export function openingRepeat(studio, slug, plan) {
  const past = readHistory(studio).filter((r) => r.slug !== slug).slice(-3);
  if (!past.length) return null;
  const mine = {mode: plan.hook?.mode ?? 'none', first: (plan.fx ?? []).filter((x) => (x.start ?? 0) < 6).map((x) => x.type)[0] ?? 'none'};
  const same = past.filter((r) => (r.hook?.mode ?? 'none') === mine.mode && (r.opening?.[0] ?? 'none') === mine.first);
  if (!same.length) return null;
  return {mode: mine.mode, first: mine.first, slugs: [...new Set(same.map((r) => r.slug))]};
}
