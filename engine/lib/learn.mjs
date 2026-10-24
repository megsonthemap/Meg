// The learning loop: her review notes become rules she has agreed to, and the rules that can be
// measured become checks.
//
// Why this exists. On 20 Oct a cut broke five written rules at once. The rules were in the guide;
// nothing read them at the moment it mattered. The gate in check.mjs fixed the mechanical half. The
// other half is the corrections she types on her phone: today they change one cut and are then
// forgotten, so the same note comes back three reels later. This turns them into something the next
// cut starts from.
//
// Three deliberate constraints, all of them hers:
//
//   1. Nothing is written down without her yes. `propose` only ever writes to `pending` in
//      brand/rules.json. Only `approve` moves a rule into `rules`, and only she says that word.
//   2. A rule she says no to is remembered as a no. It is never proposed again, for any reel.
//   3. Every rule carries the note and the frame that produced it, so it reads as "in this
//      situation" and not as a law she never agreed to. A rule with no evidence cannot be written.
//
// And one on restraint, because this is the part that goes wrong if it is eager:
//
//      ONE NOTE ABOUT ONE CAPTION IS NOT A RULE.
//
//      "caption at 0:14 is over my face" is a note about a caption at 0:14. It gets fixed and it
//      gets filed as an observation. It becomes a candidate rule only when (a) she states it as a
//      general preference herself ("always", "never", "every time", "stop doing"), or (b) the same
//      shape of correction has happened at least twice, counting earlier reels. Everything else
//      stays an observation, so it still counts towards the second time.
//
//      Two rules she recognises are worth more than five she has to argue with, so the cap is five
//      per reel and the ranking puts the ones she stated herself first.
//
// Where the rules live: brand/rules.json, beside brand.json, because brand/ is what the editing
// procedure already reads before every cut. A new file nobody opens would be the guide problem
// again with extra steps.
import fs from 'fs';
import path from 'path';

const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wj = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
const ss = (t) => `${(+t).toFixed(1)}s`;

export const rulesFile = (studio) => path.join(studio, 'brand', 'rules.json');

const EMPTY = {
  $schema: 'reel-studio/rules.json v1',
  note: 'Learned from her review notes. Claude reads this before every cut. Only she approves a rule; a rejected rule is never proposed again.',
  rules: [],
  rejected: [],
  pending: [],
  observations: [],
};

export function readRules(studio) {
  const f = rulesFile(studio);
  const r = rj(f, null);
  if (!r) return {...EMPTY, rules: [], rejected: [], pending: [], observations: []};
  return {...EMPTY, ...r};
}
export function writeRules(studio, r) { wj(rulesFile(studio), r); }

// ---------------------------------------------------------------- shapes
//
// A shape is a kind of correction, not a wording. It is what makes "caption is over my face" on one
// reel and "move the hook down, I'm behind it" on another count as the same thing happening twice.
//
// `cue` has to match her words AND `sees` has to find the thing she is talking about on the frame,
// so a note that merely contains the word "small" is not read as a caption-size rule when there is
// no caption on screen.
//
// `check` names how check.mjs can measure it, or is null with a `cannot` line saying plainly why
// not. Guessing that something is measurable when it is not is how a gate starts lying.
const SHAPES = {
  'text-off-her': {
    label: 'text sitting over her',
    cue: /(over|on|across|covering|cover|hiding|hides)\s+(my|her|the)\s+(face|head|hair|forehead|chin|eyes|mouth)|in front of my face|can'?t see (my|her) face/i,
    sees: (s) => s.text.length > 0,
    check: 'text-clear-zone',
    params: (ctx) => ({element: ctx.text[0]?.kind ?? 'caption', y: ctx.captions?.y ?? null}),
  },
  'caption-size': {
    label: 'caption size',
    cue: /(caption|text|words?|subtitle)s?[^.]{0,30}\b(too small|tiny|bigger|larger|hard to read|can'?t read)|\b(too small|tiny)\b[^.]{0,20}(caption|text|word)/i,
    sees: (s) => s.captions && s.captions.mode !== 'off',
    check: 'caption-size-floor',
    params: (ctx) => ({min: Math.max(ctx.captions?.size ?? 60, 60)}),
  },
  'contrast': {
    label: 'text disappearing into the background',
    cue: /(can'?t read|hard to read|disappear|washed out|lost in|blends? in|invisible)/i,
    sees: (s) => s.text.length > 0,
    check: 'min-contrast',
    params: () => ({min: 4.5}),
  },
  'broll-relevance': {
    label: 'b-roll that is not about the words',
    cue: /(nothing to do with|not about|doesn'?t match|does not match|why is (that|this)|what is (that|this)|random|wrong clip|irrelevant|unrelated)/i,
    sees: (s) => s.media.length > 0,
    check: 'broll-described',
    params: (ctx) => ({types: [...new Set(ctx.media.map((m) => m.type))]}),
  },
  'effect-on-silence': {
    label: 'an effect where nothing is being said',
    cue: /(nothing (is )?said|no words|silent|over nothing|too early|too late|off the word|not on the word)/i,
    sees: (s) => s.fx.length > 0,
    check: 'effect-on-spoken-words',
    params: () => ({}),
  },
  'effect-type-dislike': {
    label: 'an effect she does not want',
    cue: /(don'?t|do not|never|stop|lose|drop|hate|not a fan of)\b[^.]{0,40}\b(this|that|these|those|effect|look|card|band|sticker|glitch|zoom|flash)/i,
    sees: (s) => s.fx.length > 0,
    check: 'no-effect-type',
    params: (ctx) => ({types: [...new Set(ctx.fx.map((f) => f.type))]}),
  },
  'punch-colour': {
    label: 'where the punch colour goes',
    cue: /(punch|yellow|highlight)\b|\bin (the )?(punch|yellow)\b/i,
    sees: () => true,
    check: 'punch-min-seconds',
    params: (ctx) => ({seconds: Math.max(1.5, (ctx.duration ?? 30) * 0.05)}),
  },
  'pacing': {
    label: 'pacing and what to cut',
    cue: /(slow|drags?|boring|too long|lose this|cut this|get to the point|waffle|tighten)/i,
    sees: () => true,
    check: null,
    cannot: 'whether a line drags is a judgement about the words and the delivery. Nothing in the frame measures it, so this one stays prose that Claude reads before it cuts.',
    params: () => ({}),
  },
  'wording': {
    label: 'the words on screen',
    cue: /(wording|says?|spelling|spelt|typo|rewrite|rephrase|caption reads|wrong word)/i,
    sees: (s) => s.text.length > 0,
    check: null,
    cannot: 'a line being the wrong words is not a measurement. It stays prose.',
    params: () => ({}),
  },
  'hook': {
    label: 'how the hook opens',
    cue: /\bhook\b/i,
    sees: () => true,
    check: null,
    cannot: 'whether a hook earns the next three seconds is the one thing only she can call. Prose.',
    params: () => ({}),
  },
};

// Words she uses when she is telling you about every reel, not this one. This is the single biggest
// signal in the whole file: it is the difference between a note and a rule.
const GENERAL = /\b(always|never|every time|everytime|from now on|in future|in the future|stop doing|stop putting|don'?t ever|i keep saying|as a rule|by default|generally|usually|each time|any time|anytime|every reel)\b/i;

// ---------------------------------------------------------------- what was on screen
//
// From the plan.json of the version the note was left on, so a note on v2 is read against v2 even
// after v3 exists. plan.json is kept per version for exactly this.
export function onScreenAt(plan, t) {
  const active = (x, s = x.start, d = x.dur ?? 0.3) => t >= s - 0.05 && t < s + d + 0.05;
  const words = plan.captions?.words ?? [];
  const here = words.filter((w) => w.e > t - 0.2 && w.s < t + 0.4);
  const line = here.map((w) => w.w).join(' ');
  const text = [];
  if (plan.hook && t >= (plan.hook.start ?? 0) - 0.05 && t <= plan.hook.end + 0.05) text.push({kind: 'hook', detail: String(plan.hook.text ?? '').replace(/\n/g, ' ')});
  if (line) text.push({kind: 'caption', detail: line});
  for (const l of plan.labels ?? []) if (t >= l.start && t < l.end) text.push({kind: 'label', detail: l.text});
  if (plan.end && t >= plan.end.start) text.push({kind: 'end card', detail: (plan.end.lines ?? []).join(' ')});
  const fx = (plan.fx ?? []).filter((f) => active(f)).map((f) => ({type: f.type, start: f.start, dur: f.dur, src: f.src ?? null}));
  const MEDIA = ['band', 'backdrop', 'deck', 'sticker', 'folder', 'wall', 'orbit', 'phone', 'uiworld', 'envelope'];
  const media = fx.filter((f) => MEDIA.includes(f.type));
  for (const x of plan.inserts ?? []) if (active(x)) media.push({type: 'insert', start: x.start, dur: x.dur, src: x.src ?? null});
  const seg = (plan.segments ?? []).find((s) => t >= s.start && t < s.start + s.dur);
  const punchHere = here.some((w) => w.style === 'punch' || w.style === 'caps');
  return {
    t: +(+t).toFixed(2),
    spoken: line || null,
    text, fx, media,
    captions: plan.captions ? {mode: plan.captions.mode, size: plan.captions.size, y: plan.captions.y} : null,
    punchHere,
    source: seg ? seg.src.split('/').pop() : null,
    duration: plan.duration,
    // one sentence a person can read, which is what ends up in the rule's evidence
    summary: [
      line ? `caption "${line}"` : 'no caption',
      ...text.filter((x) => x.kind !== 'caption').map((x) => `${x.kind} "${x.detail}".slice`.replace('.slice', '')),
      ...fx.map((f) => `${f.type} effect (${ss(f.start)}–${ss(f.start + (f.dur ?? 0.3))})`),
      plan.captions ? `captions ${plan.captions.mode} ${plan.captions.size ? `${plan.captions.size}px` : 'at the house size'} at y ${plan.captions.y}` : null,
    ].filter(Boolean).join('; '),
  };
}

// A stable identity for "this kind of correction, about this thing", so a rejection can be
// remembered and a recurrence can be counted. Deliberately coarse: shape plus what it is about.
const keyOf = (shape, ctx) => {
  // Deliberately coarse. "That band is not about the words" and "that folder is not about the
  // words" are the same correction twice, so the effect type is not part of the key: only the
  // "stop using this effect" shape cares which effect it was.
  const about = shape === 'effect-type-dislike'
    ? [...new Set((ctx.fx.length ? ctx.fx : ctx.media).map((f) => f.type))].sort().join('+')
    : shape === 'text-off-her' || shape === 'wording' ? (ctx.text[0]?.kind ?? 'text')
    : '';
  return about ? `${shape}:${about}` : shape;
};

function classify(note) {
  const hits = [];
  for (const [id, s] of Object.entries(SHAPES)) if (s.cue.test(note.text)) hits.push(id);
  return hits;
}

// ---------------------------------------------------------------- propose
//
// Run when she approves a reel. Reads the notes she left, works out what was actually on screen at
// each one, and writes the few that deserve to be rules into `pending`.
export function propose(slug, {studio, P, log}) {
  const notes = rj(path.join(studio, 'review', 'data', `${slug}.notes.json`), []);
  const resolved = notes.filter((n) => n.done);
  const out = {slug, notes: notes.length, resolved: resolved.length, candidates: [], observations: [], skipped: [], unreadable: []};
  if (!resolved.length) return out;

  const store = readRules(studio);
  const planCache = new Map();
  const planFor = (v) => {
    if (planCache.has(v)) return planCache.get(v);
    const f = P(slug, 'out', 'versions', `v${v}`, 'plan.json');
    const p = fs.existsSync(f) ? rj(f, null) : null;
    planCache.set(v, p);
    return p;
  };

  const fresh = [];
  for (const n of resolved) {
    const plan = planFor(n.version ?? 1);
    if (!plan) { out.unreadable.push({t: n.t, text: n.text, why: `no plan.json kept for v${n.version}`}); continue; }
    const ctx = onScreenAt(plan, n.t);
    const shapes = classify(n);
    if (!shapes.length) { out.skipped.push({t: n.t, text: n.text, why: 'no rule shape matches this note; it is a one-off change'}); continue; }
    for (const shape of shapes) {
      const S = SHAPES[shape];
      if (!S.sees(ctx)) { out.skipped.push({t: n.t, text: n.text, why: `reads like ${S.label}, but there was no such thing on screen at ${ss(n.t)}`}); continue; }
      fresh.push({shape, key: keyOf(shape, ctx), general: GENERAL.test(n.text), note: n, ctx});
    }
  }

  // Everything seen is filed, whether or not it becomes a candidate, so a single note still counts
  // towards the second time it happens.
  const obsKey = (o) => `${o.slug}|${o.v}|${o.t}|${o.key}`;
  const have = new Set(store.observations.map(obsKey));
  for (const f of fresh) {
    const o = {slug, v: f.note.version ?? 1, t: f.note.t, key: f.key, shape: f.shape, note: f.note.text, general: f.general, at: f.note.createdAt ?? Date.now()};
    if (!have.has(obsKey(o))) { store.observations.push(o); out.observations.push(o); }
  }

  const rejectedKeys = new Set(store.rejected.map((r) => r.key));
  const liveKeys = new Set([...store.rules.map((r) => r.key), ...store.pending.map((r) => r.key)]);

  // the recurrence count: every time this shape has been corrected, this reel and every earlier one
  const countFor = (key) => store.observations.filter((o) => o.key === key).length;
  const reelsFor = (key) => [...new Set(store.observations.filter((o) => o.key === key).map((o) => o.slug))];

  const byKey = new Map();
  for (const f of fresh) if (!byKey.has(f.key)) byKey.set(f.key, f); else if (f.general && !byKey.get(f.key).general) byKey.set(f.key, f);

  for (const [key, f] of byKey) {
    if (rejectedKeys.has(key)) {
      const r = store.rejected.find((x) => x.key === key);
      out.skipped.push({t: f.note.t, text: f.note.text, why: `she said no to this rule on ${new Date(r.rejectedAt).toISOString().slice(0, 10)}, so it is not proposed again`});
      continue;
    }
    if (liveKeys.has(key)) {
      out.skipped.push({t: f.note.t, text: f.note.text, why: 'there is already a rule (or a pending one) for this'});
      continue;
    }
    const seen = countFor(key), reels = reelsFor(key);
    // The restraint gate. She said it as a general preference, or it has happened twice.
    if (!f.general && seen < 2) {
      out.skipped.push({t: f.note.t, text: f.note.text, why: `one note is not a rule (${SHAPES[f.shape].label}). Filed: sighting ${seen} of 2.`});
      continue;
    }
    const S = SHAPES[f.shape];
    out.candidates.push({
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      key, shape: f.shape, label: S.label,
      because: f.general ? 'she stated it as a general preference' : `this correction has come up ${seen} times, across ${reels.length} reel${reels.length === 1 ? '' : 's'} (${reels.join(', ')})`,
      general: f.general,
      seen, reels,
      check: S.check, cannot: S.cannot ?? null,
      params: S.params(f.ctx),
      evidence: {slug, version: f.note.version ?? 1, t: f.note.t, note: f.note.text, onScreen: f.ctx.summary, changed: f.note.reply ?? null},
      proposedAt: Date.now(),
    });
  }

  // Her own words first, then whatever has happened most. Five is the cap, and the comment at the
  // top of this file is the reason: two she recognises beat five she has to argue with.
  out.candidates.sort((a, b) => (b.general - a.general) || (b.seen - a.seen));
  if (out.candidates.length > 5) { out.trimmed = out.candidates.length - 5; out.candidates = out.candidates.slice(0, 5); }

  store.pending = [...store.pending.filter((p) => !out.candidates.some((c) => c.key === p.key)), ...out.candidates];
  writeRules(studio, store);
  return out;
}

// ---------------------------------------------------------------- her yes and her no
export function approve(studio, id) {
  const store = readRules(studio);
  const i = store.pending.findIndex((p) => p.id === id || p.key === id);
  if (i < 0) throw new Error(`no pending rule ${id}. node reel.mjs rules lists them.`);
  const c = store.pending.splice(i, 1)[0];
  if (!c.evidence) throw new Error('a rule with no evidence cannot be written down');
  const rule = {
    ...c,
    // Prose first, because this is what Claude reads before a cut. "In this situation", never a law.
    when: whenLine(c),
    then: thenLine(c),
    // A new rule is prose, even when its shape could be measured. It becomes a check only after the
    // same correction has happened on a second reel and she says yes to that too (`rules promote`).
    enforced: false,
    apply: APPLY.has(c.shape),
    approvedAt: Date.now(),
    evidence: [c.evidence],
  };
  store.rules.push(rule);
  writeRules(studio, store);
  return rule;
}

export function reject(studio, id, why = null) {
  const store = readRules(studio);
  const i = store.pending.findIndex((p) => p.id === id || p.key === id);
  if (i < 0) throw new Error(`no pending rule ${id}. node reel.mjs rules lists them.`);
  const c = store.pending.splice(i, 1)[0];
  store.rejected.push({key: c.key, shape: c.shape, label: c.label, why, evidence: c.evidence, rejectedAt: Date.now()});
  writeRules(studio, store);
  return c;
}

// Which shapes buildPlan can act on by itself, rather than only being read.
const APPLY = new Set(['caption-size']);

const whenLine = (c) => {
  const e = c.evidence;
  return `on ${e.slug} v${e.version} at ${ss(e.t)}, where the frame was: ${e.onScreen}`;
};
const thenLine = (c) => {
  switch (c.shape) {
    case 'text-off-her': return 'keep text clear of her face: check the frame before you leave a line where she is standing, not only the number in edit.json';
    case 'caption-size': return `do not drop captions below ${c.params.min}px`;
    case 'contrast': return 'put text on a panel or in the darker brand colour when the wall behind it is bright';
    case 'broll-relevance': return 'only use footage whose description matches the words being spoken under it; if nothing matches, use a type-led effect instead';
    case 'effect-on-silence': return 'put every effect on the words it illustrates, not in the gap beside them';
    case 'effect-type-dislike': return `do not use ${(c.params.types ?? []).join(', ') || 'that effect'} on her reels`;
    case 'punch-colour': return `keep the punch colour on screen for at least ${(c.params.seconds ?? 1.5).toFixed(0)}s, on the line people should remember`;
    case 'pacing': return 'cut harder: lose any line that can go without losing the meaning';
    case 'wording': return 'read every on-screen line back in her voice before rendering';
    case 'hook': return 'the hook is hers to approve: send it in the plan rather than deciding it';
    default: return c.label;
  }
};

// ---------------------------------------------------------------- promotion
//
// Prose is skippable. A check is not. So the moment the same correction has happened on a second
// reel, a rule whose shape can be measured should stop being something Claude reads and become
// something that holds a cut back. That is this.
//
// It still needs her yes, because it changes what is allowed out, not just what is advised.
export function promotable(studio) {
  const store = readRules(studio);
  return store.rules.filter((r) => {
    if (r.enforced || !r.check) return false;
    const reels = new Set(store.observations.filter((o) => o.key === r.key).map((o) => o.slug));
    return reels.size >= 2;
  }).map((r) => ({...r, reels: [...new Set(store.observations.filter((o) => o.key === r.key).map((o) => o.slug))]}));
}

export function promote(studio, id) {
  const store = readRules(studio);
  const r = store.rules.find((x) => x.id === id || x.key === id);
  if (!r) throw new Error(`no approved rule ${id}`);
  if (!r.check) throw new Error(`"${r.label}" cannot be a check: ${r.cannot}`);
  const reels = [...new Set(store.observations.filter((o) => o.key === r.key).map((o) => o.slug))];
  r.enforced = true;
  r.enforcedAt = Date.now();
  r.enforcedAfter = reels;
  writeRules(studio, store);
  return r;
}

// Every approved rule that check.mjs should measure, in the form check.mjs wants.
export function enforcedChecks(studio) {
  return readRules(studio).rules.filter((r) => r.enforced && r.check)
    .map((r) => ({id: r.id, key: r.key, check: r.check, params: r.params ?? {}, label: r.label, then: r.then, evidence: r.evidence?.[0] ?? null}));
}

// The defaults an approved rule puts on a cut before edit.json has said anything. This is the half
// of "it gets smarter each time" that is not a block: the next plan simply starts from it.
export function applyRules(studio, captions) {
  const out = {...captions}, applied = [];
  for (const r of readRules(studio).rules) {
    if (!r.apply) continue;
    if (r.shape === 'caption-size' && (out.size ?? 60) < r.params.min) { out.size = r.params.min; applied.push(`captions.size raised to ${r.params.min} (learned rule: ${r.then})`); }
  }
  return {captions: out, applied};
}

// ---------------------------------------------------------------- printing
export function printCandidates(res, log) {
  if (!res.resolved) { log(`learn ${res.slug}: no resolved notes to learn from yet`); return; }
  log(`learn ${res.slug}: ${res.resolved} resolved note${res.resolved === 1 ? '' : 's'} read, ${res.candidates.length} candidate rule${res.candidates.length === 1 ? '' : 's'}`);
  for (const c of res.candidates) {
    log('');
    log(`  ${c.id}  ${c.label}`);
    log(`    she said:    "${c.evidence.note}"  (${ss(c.evidence.t)} on v${c.evidence.version})`);
    log(`    on screen:   ${c.evidence.onScreen}`);
    if (c.evidence.changed) log(`    you changed: ${c.evidence.changed}`);
    log(`    proposed because: ${c.because}`);
    log(`    the rule:    ${thenLine(c)}`);
    log(`    measurable:  ${c.check ? (c.reels.length > 1 ? `yes, as a ${c.check} check, and it has already happened on ${c.reels.length} reels, so it can be promoted to one as soon as it is approved` : `yes, as a ${c.check} check once it happens on a second reel`) : `no. ${c.cannot}`}`);
  }
  if (res.trimmed) log(`\n  (${res.trimmed} weaker candidate${res.trimmed === 1 ? '' : 's'} held back: five a reel is the cap)`);
  if (res.skipped.length) {
    log('');
    log(`  not proposed (${res.skipped.length}):`);
    for (const s of res.skipped) log(`    · ${ss(s.t)} "${s.text.slice(0, 60)}${s.text.length > 60 ? '…' : ''}" — ${s.why}`);
  }
  for (const u of res.unreadable) log(`  · ${ss(u.t)}: ${u.why}, so what was on screen cannot be reconstructed`);
  if (res.candidates.length) {
    log('');
    log('  Read these out to her one at a time. Only on her yes:');
    log(`    node reel.mjs rules approve <id>      node reel.mjs rules reject <id> "why"`);
  }
}

export function printRules(studio, log) {
  const store = readRules(studio);
  log(`rules: ${store.rules.length} approved, ${store.pending.length} waiting on her, ${store.rejected.length} she said no to`);
  for (const r of store.rules) {
    log('');
    log(`  ${r.id}  ${r.label}${r.enforced ? '  [a check: a cut that breaks it is held back]' : '  [prose: Claude reads it before cutting]'}`);
    log(`    ${r.then}`);
    log(`    from: ${r.when}`);
    if (!r.check) log(`    cannot be a check: ${r.cannot}`);
  }
  const p = promotable(studio);
  if (p.length) {
    log('');
    log(`  ready to become checks (${p.length}): this correction has now happened on more than one reel, and it can be measured.`);
    for (const r of p) log(`    ${r.id}  ${r.label} — seen on ${r.reels.join(', ')}.  On her yes: node reel.mjs rules promote ${r.id}`);
  }
  if (store.pending.length) {
    log('');
    log(`  waiting on her (${store.pending.length}): node reel.mjs learn <slug> prints these with their evidence.`);
    for (const c of store.pending) log(`    ${c.id}  ${c.label} — "${c.evidence.note.slice(0, 60)}"`);
  }
  if (store.rejected.length) {
    log('');
    log(`  she said no to these, so they are never proposed again:`);
    for (const r of store.rejected) log(`    ${r.label}${r.why ? ` — ${r.why}` : ''}`);
  }
}
