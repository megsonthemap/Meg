// When this computer cannot cut the person out of the footage (Windows for now, see lib/platform.mjs),
// every effect that would put them IN FRONT of something still renders, in a version that needs no
// cutout. Nothing is dropped and the reel never fails over it; one log line says what changed.
//
//   hook behind the head      -> the same hook, on top, at a size that fits the width
//   big word behind the head  -> the big word in front
//   backdrop (subject front)  -> stacked shot: b-roll on the top half, the person moved down under it
//   deck (subject front)      -> the cards in front
//   app background            -> the prompt bar over the footage, same typing
//   colour title, paper cut   -> a full-screen title card for the same seconds (the voice carries on)
//   orbit, glass, cover, doodle, frame break, pull-back, vertigo -> drawn over the footage as they are
//   sticker with "cut"        -> the photo as it is, uncut (handled in reel.mjs)
//
// Mutates and returns `plan`. Call before the cutout ranges are worked out.
export function withoutCutout(plan, {log, why}) {
  const changed = [];
  const note = (what) => { if (!changed.includes(what)) changed.push(what); };
  if (plan.hook?.mode === 'behind') {
    plan.hook = {...plan.hook, mode: 'top', size: Math.min(plan.hook.size ?? 150, 96)};
    note('hook behind the head now sits on top');
  }
  plan.fx = (plan.fx ?? []).map((f) => {
    if (f.type === 'bigword' && f.behind) { note('big word drawn in front'); return {...f, behind: false}; }
    if (f.type === 'deck' && f.subjectFront !== false) { note('photo cards drawn in front'); return {...f, subjectFront: false}; }
    if (f.type === 'backdrop' && f.subjectFront !== false) {
      note('screen behind you becomes a stacked shot');
      return {...f, type: 'band', height: Math.min(f.height ?? 0.5, 0.45), shiftMain: f.shiftMain ?? 0.2};
    }
    if (f.type === 'uiworld') {
      note('app background becomes the prompt bar');
      return {type: 'prompt', text: f.text, start: f.start, dur: f.dur, ...(f.app ? {label: f.app} : {})};
    }
    if (f.type === 'colourbg' || f.type === 'paper') { note(`${f.type === 'paper' ? 'paper cut' : 'colour title'} shown as a full-screen card`); return f; }
    if (['orbit', 'glass', 'cover', 'doodle'].includes(f.type)) { note(`${f.type} drawn over the footage`); return f; }
    if (['framebreak', 'pullback', 'vertigo'].includes(f.type)) { note(`${f.type} moves the whole frame`); return f; }
    if (f.type === 'sticker' && f.cut) { note('sticker photo used uncut'); return f; }
    return f;
  });
  if (changed.length) log(`no person cutout here (${why}), so: ${changed.join('; ')}.`);
  return plan;
}
