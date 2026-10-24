// `reel.mjs menu <slug>`: the material for the plan step, so the plan is an offer and not a
// presentation.
//
// Why this is a command and not a paragraph in the skill. The old plan step said "send the owner
// the hook, what you will cut, which effect sits on which line". That is a finished cut described
// out loud: the owner can say yes or no, and never gets asked what they would like. Two things made
// it worse. A starting point carried three effects, so three is what everybody got, in that order.
// And `EFFECTS.md` is a list of TypeScript signatures, so the words on offer were `orbit` and
// `backdrop` rather than anything a person says.
//
// What this prints:
//   1. what the last few reels did, so this one can open differently (empty for a first reel);
//   2. how this person asks for things, from brand/voice.json, and which questions nobody has
//      answered yet;
//   3. every spoken line of the footage with the plain signals in it (a number, a name, a list, a
//      price, an ask), because house rule 4 is that a word they said earns the effect;
//   4. the catalogue, by signal, in the names a person would say out loud.
// What it does NOT do is choose. Pairing a line with an effect is a creative judgement and a
// keyword matcher would be worse than Claude at it. This makes the judgement cheap to make and
// impossible to skip.
import fs from 'fs';

const rj = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

// Plain, checkable things in a line of speech. Each one is a reason an effect could earn its place;
// none of them is a reason it should. Deliberately dumb: a signal is a fact about the words.
const SIGNALS = [
  // "one of the most" is not a number anybody wants counted on screen, so the small words that are
  // almost always doing other work are left out
  ['NUMBER',  /\b\d[\d,.]*\b|\b(three|four|five|six|seven|eight|nine|ten|twenty|thirty|fifty|hundred|thousand|million|billion)\b/i],
  ['MONEY',   /[$£€]\s?\d|\b\d+\s?(k|dollars|bucks|grand)\b|\b(costs?|price|paid|charge[sd]?|free)\b/i],
  ['LIST',    /\b(and then|first|second|third|then|also|plus)\b|,[^,]+,/i],
  ['ASK',     /\b(comment|dm|message|send|drop|follow|link|save|share|bio|tap)\b/i],
  ['NAME',    /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/],   // first word of the line is stripped before testing
  ['APP',     /\b(instagram|tiktok|youtube|canva|capcut|claude|chatgpt|notion|descript|spotify|apple|google|slack|zoom|riverside|excel|figma)\b/i],
  ['PROCESS', /\b(step|how i|the way i|process|workflow|system|every time|routine)\b/i],
  ['COMPARE', /\b(before|after|used to|now i|instead|versus|vs|went from|better than|worse)\b/i],
  ['NEGATE',  /\b(don't|do not|never|stop|no longer|you don't need|without)\b/i],
  ['QUESTION',/\?/],
];

// Which effect families a signal makes honest. The catalogue's `earns` line is the real guidance;
// this is only how the menu is sorted so the offer is short.
const BY_SIGNAL = {
  NUMBER:  ['counter', 'counter-roll', 'bigword-serif', 'statbars', 'chart', 'dial'],
  MONEY:   ['receipts', 'counter', 'statbars'],
  LIST:    ['orbit', 'tasks', 'checklist', 'flow', 'note', 'deck-fan', 'pills'],
  ASK:     ['dm', 'comment', 'endcard', 'envelope'],
  NAME:    ['label', 'label-blue', 'sticker', 'band', 'glass', 'deck-scatter'],
  APP:     ['uiworld', 'phone', 'backdrop', 'prompt', 'chat', 'dropdown', 'timeline'],
  PROCESS: ['flow', 'tasks', 'pullback', 'calendar', 'timeline'],
  COMPARE: ['statbars', 'chart', 'strike', 'sticker-strike', 'spotlight'],
  NEGATE:  ['strike', 'sticker-strike', 'note', 'burn'],
  QUESTION:['header', 'checklist', 'colourbg'],
};

// `prep` writes "(gap 6.5s)" into a line when it trimmed one; that is the engine talking, not the
// speaker, so it is not a number anybody said.
const spokenOnly = (line) => String(line).replace(/\(gap [\d.]+s\)\s*/g, '').trim();

export function signalsIn(line) {
  const l = spokenOnly(line);
  // a capital at the start of a sentence is grammar, not a name
  const body = l.replace(/^\S+\s*/, '');
  return SIGNALS.filter(([n, re]) => re.test(n === 'NAME' ? body : l)).map(([n]) => n);
}

function transcriptLines(P, slug) {
  const f = P(slug, 'analysis', 'transcript.md');
  if (!fs.existsSync(f)) return [];
  const out = [];
  let clip = null;
  for (const raw of fs.readFileSync(f, 'utf8').split('\n')) {
    const h = raw.match(/^##\s+(\S+)/);
    if (h) { clip = h[1]; continue; }
    const m = raw.match(/^\[(\d+\.?\d*)-(\d+\.?\d*)\]\s*(.+)$/);
    if (m) out.push({clip, a: +m[1], b: +m[2], text: m[3].trim()});
  }
  return out;
}

const ss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function menu(P, slug, {catalog, voice, history, log}) {
  const byId = new Map((catalog?.effects ?? []).map((e) => [e.id, e]));
  const say = (id) => { const e = byId.get(id); return e ? `${e.say} (${e.id})` : id; };
  const lines = transcriptLines(P, slug);
  const assets = rj(P(slug, 'assets.json'));
  const spoken = lines.reduce((a, l) => Math.max(a, l.b), 0);

  log('');
  log(`── the offer for ${slug} ─────────────────────────────────────`);

  // 1. do not repeat yourself
  // newest cut per slug, so three versions of one reel do not fill the list
  const past = [...new Map((history ?? []).map((r) => [r.slug, r])).values()].slice(-3);
  if (!past.length) log('No earlier reels on file, so nothing to avoid. This is the opening everything after it will be compared to.');
  else {
    log(`The last ${past.length} cut${past.length === 1 ? '' : 's'}, so this one opens differently:`);
    for (const r of past) log(`  ${r.slug}: opened ${r.hook ? `${r.hook.mode} hook "${r.hook.text}"` : 'with no hook'}, ${r.captions} captions, then ${(r.opening ?? []).map(say).join(' → ') || 'nothing in the first 6s'}${r.end ? `, ended "${(r.end ?? []).join(' / ')}"` : ''}`);
    const used = new Set(past.flatMap((r) => r.fx ?? []));
    const modes = [...new Set(past.map((r) => (r.hook ? r.hook.mode : 'no')))];
    const opener = modes.length ? `opening with ${modes.map((m) => (m === 'no' ? 'no hook at all' : `a ${m} hook`)).join(' or ')}` : 'repeating the last opening';
    log(`  → avoid: ${opener}${used.size ? `, and leaning on ${[...used].slice(0, 8).map((x) => byId.get(x)?.say ?? x).join(', ')} again` : ''}.`);
    const fresh = (catalog?.effects ?? []).filter((e) => !used.has(e.id) && !(voice?.effects?.avoid ?? []).includes(e.id));
    log(`  → ${fresh.length} effects in the library they have not seen yet.`);
  }

  // 2. their words, not the example's
  log('');
  if (!voice) {
    log('No brand/voice.json. Nothing on file about how this person asks for anything, so every');
    log('written word in this cut has to come out of what they said in this footage, or out of a');
    log('question to them. Ask: how do you want to end a reel, and do you even want a');
    log('comment-a-word call to action. Then write brand/voice.json so it is asked once, not every time.');
  } else {
    const a = voice.ask ?? {};
    log(`How they ask: ${a.kind ?? 'NOT ANSWERED — ask them'}${a.endCard ? `; end card "${[].concat(a.endCard).join(' / ')}"` : '; no end card words on file'}${a.dmLine ? `; DM line "${a.dmLine}"` : ''}`);
    if (a.keywords?.length) log(`Keywords they use: ${a.keywords.join(', ')}`);
    if (voice.words?.never?.length) log(`Never on screen: ${voice.words.never.join(', ')}`);
    if (voice.words?.spelling || voice.words?.punctuation) log(`Writing: ${[voice.words.spelling, voice.words.punctuation].filter(Boolean).join('; ')}`);
    if (voice.effects?.love?.length) log(`Effects they said they love: ${voice.effects.love.map(say).join(', ')}`);
    if (voice.effects?.avoid?.length) log(`Effects they said no to: ${voice.effects.avoid.map(say).join(', ')}`);
    const gaps = [['ask.kind', a.kind], ['ask.endCard', a.endCard], ['words.never', voice.words?.never?.length]].filter(([, v]) => !v).map(([k]) => k);
    if (gaps.length) log(`Still unanswered in voice.json: ${gaps.join(', ')} — ask before you write those words.`);
  }

  // 3. the lines, and what is plainly in them
  log('');
  if (!lines.length) log('No transcript yet. Run prep first; without it there is no line for an effect to sit on.');
  else {
    log(`${lines.length} spoken lines, ${spoken.toFixed(0)}s of talking:`);
    const seen = new Map();
    let shown = null;
    for (const l of lines) {
      if (l.clip !== shown) { shown = l.clip; log(`  — ${shown} —`); }
      const sig = signalsIn(l.text);
      for (const s of sig) seen.set(s, (seen.get(s) ?? 0) + 1);
      log(`  [${ss(l.a)}] ${l.text}${sig.length ? `\n        ↳ ${sig.join(' ')}` : ''}`);
    }
    log('');
    // 4. the short menu, by what is actually in this footage
    log('What those lines could earn, in the words to offer them:');
    const avoid = new Set([...(voice?.effects?.avoid ?? []), ...past.flatMap((r) => r.fx ?? [])]);
    for (const [sig] of [...seen].sort((a, b) => b[1] - a[1])) {
      const ids = (BY_SIGNAL[sig] ?? []).filter((id) => byId.has(id));
      if (!ids.length) continue;
      const fresh = ids.filter((id) => !avoid.has(id)), stale = ids.filter((id) => avoid.has(id));
      log(`  ${sig} (${seen.get(sig)} line${seen.get(sig) === 1 ? '' : 's'}): ${fresh.map(say).join(', ')}${stale.length ? `  [already used lately: ${stale.map((id) => byId.get(id).say).join(', ')}]` : ''}`);
    }
    if (voice?.effects?.love?.length) log(`  and the ones they told you they love: ${voice.effects.love.filter((id) => byId.has(id)).map(say).join(', ')}`);
  }

  // 5. how many
  const mins = Math.max(spoken, 1) / 60;
  const ceiling = Math.round(mins * 8);
  log('');
  log(`How many: 5 to 8 a minute is the ceiling, not the target. On ${spoken.toFixed(0)}s that is at most ${ceiling}.`);
  log(`Offer ${Math.min(6, Math.max(4, Math.round(mins * 5)))} or so, each tied to the line it sits on, and let them pick. A handful chosen on purpose is what makes a reel good.`);
  if (assets) {
    const described = Object.entries(assets).filter(([, v]) => (typeof v === 'string' ? v : v?.shows));
    log('');
    log(`Footage on hand: ${described.length} of ${Object.keys(assets).length} described. Anything an effect needs that nobody has described cannot be offered: describe it, or offer a type-led effect instead.`);
  }
  log('─────────────────────────────────────────────────────────────');
  log('');
  log('Now write the offer to them in their words: the hook you would use, what you would cut, and');
  log('a short numbered menu of effects, each one quoting the line it sits on. Ask which they want.');
  log('If they said "just cut it", choose the few yourself, say which you chose and why, and cut.');
}
