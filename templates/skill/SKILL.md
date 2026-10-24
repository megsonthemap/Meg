---
name: reel-edit
description: Edit the owner's Instagram reels from raw footage in their brand (brand/brand.json and brand/guide if present), using the Reel Studio engine in this folder. Use whenever they say "cut this", "edit my reel", drop clips in inbox/, or ask to change a cut.
---

# Reel Edit (Reel Studio)

The owner drops raw footage in `inbox/`; you deliver a finished, on-brand reel MP4 and a caption. You are the editor. The engine does transcription, proxies, rendering. You make every creative call in `edit.json`.

**Read first:** `brand/brand.json` (colours, fonts, handle), `brand/voice.json` (how THIS person writes the words on screen: how they ask for something, the words they use, the words they refuse, the effects they love), `brand/rules.json` (the rules the owner has approved from their own review notes, each with the note that produced it) and, if it exists, `brand/guide/*.html` (the owner's reel brand guide) and the reels in `brand/refs/` (their style).

Two files, two jobs, and the difference matters. `brand.json` is the **look**: colours, fonts, caption size and position. That is a brand, so it is the one thing that should be the same on every reel. `voice.json` is the **words**: it exists because the look is the only thing that should be shared. A null in it means nobody has answered yet, so ask; never fill it from the example below.

## Engine
```
cd engine
node reel.mjs new <slug> [files...]   # moves inbox/* (or given files) into projects/<slug>/raw (images -> assets/)
node reel.mjs prep <slug>             # 1080x1920 SDR proxies (HDR tonemapped, -14 LUFS), Whisper word timings, silences, contact sheets
node reel.mjs stills <slug> 2 9.5 21  # fast full-res QA frames -> out/stills/stills.png  (ALWAYS look before full render)
node reel.mjs render <slug> [--draft] # plan.json + MP4 -> out/ plus out/<slug>.sheet.png, then the check; a passing cut is copied to ~/Downloads/Reels/
node reel.mjs check <slug>            # the house rules, measured against the rendered frames; run before you hand anything over
node reel.mjs describe <slug>         # what each clip and image shows; b-roll can only be chosen from these
node reel.mjs learn <slug>            # their resolved review notes -> candidate rules (they approve each one)
node reel.mjs rules                   # the rules they have agreed to, the ones waiting on them, the ones they said no to
node reel.mjs capcut <slug>           # transparent ProRes 4444 graphics layer + CapCut draft "Reel <slug>"
node reel.mjs review <slug>           # publish this cut to the Reel Review studio (720p preview + timeline)
node reel.mjs studio                  # serve the review studio to this Mac and phones on the same Wi-Fi
node reel.mjs versions <slug>         # every cut rendered so far, with its notes
node reel.mjs restore <slug> <n>      # put an earlier cut back as the current one
```
- `new` moves files out of inbox/. If the owner points at files elsewhere, copy them in first.
- prep writes `analysis/transcript.md` (lines with timestamps), `<id>.words.json`, `<id>.silences.json`, `<id>.sheet.png`, and `assets.json` with one empty line per clip and image. Read the transcript, look at every sheet, and describe every asset before writing the edit.

## Writing edit.json (projects/<slug>/edit.json)

**About this example.** It is a real cut of the kit author's own reel, kept because it teaches the
shape of the file better than empty placeholders would: how times relate, which effect takes which
fields, how an effect lands on a word. Read it for the shape and nothing else. Every string in it is
hers — "ICON", "hours of research", "Are all the topics the same?", "Comment / QUESTIONS", "and I'll
send you all five" — and the QA gate fails a cut that reuses them. The words in your cut come out of
the transcript in front of you and out of `brand/voice.json`.

```json
{
  "slug": "my-reel",
  "captions": {"mode": "stack"},   // leave this alone unless the reel needs something different: mode, size, y and maxWords all come from brand.json "reel".captions. "noPunct": true drops punctuation from captions, only when they ask for it
      // "stack" (loud display-font lines + small caption-font lines) | "word" (one small caption-font word) | "off"
      // "phrase" (lead-in + one huge word) rides high on the frame and lands on the speaker's face, so it needs "phraseOK": true beside it or the engine ignores it
  "fix": {"Hormoses.": "Hormozis."},
  "cuts": [ {"src": "<clipId>", "in": 0.0, "out": 10.6, "zoom": 1.15, "focusY": 0.3} ],   // SOURCE seconds; tighten removes pauses > 0.3 s
  "hook": {"mode": "top", "text": "Line one\nline two", "end": 5.4},   // or "behind" (big display-font title behind your head; set "y","size","accentLines") | "bars" (each line on its own bar; "bar": "none" for bare lettering)
      // Light or dark lettering is not a decision anyone has to make: before rendering, the engine looks at the footage behind the hook, the end card and any bigword with no "colour", and draws them in the dark brand colour instead of white when white would not read there. It says so in the render log. "ink": true (or false) on the hook or the end card overrides it; a "colour" on a bigword does the same.
  "emphasis": [ {"word": "embarrassing", "style": "punch"}, {"phrase": "Guest Name,", "style": "caps"}, {"phrase": "over 25 hours.", "style": "hide"} ],
      // punch = display font in the punch colour, caps = white display font, yellow = caption font in the punch colour, hide = no caption (when an effect says it instead). `italic` and `script` (cursive) are extra styles: they only render when brand.json `reel.italics` is not false, otherwise they fall back to the punch colour. Use them only if this person's brand uses them (the guide builder asks).
  "inserts": [ {"src": "assets/dm.png", "at": 8.0, "dur": 2.5, "pos": "top", "tilt": true}, {"clip": "<brollId>", "in": 3, "at": 20, "dur": 2.2, "pos": "full"} ],
  "fx": [
    {"type": "backdrop", "clip": "<brollId>", "in": 30, "at": 21.3, "dur": 5, "height": 0.8},        // b-roll behind her, blur-fade bottom, she is cut out in front (default)
    {"type": "band", "clip": "<guestId>", "in": 8, "at": 31.4, "dur": 3.3, "height": 0.5, "shiftMain": 0.2}, // stacked shots joined by a blur seam (never a hard split)
    {"type": "sticker", "src": "assets/photo.jpg", "cut": true, "at": 45, "dur": 2.6, "x": 0.52, "y": 0.5, "width": 0.4, "rotate": 6}, // white-outline cutout
    {"type": "label", "small": "I interviewed", "text": "Guest Name", "at": 5.2, "dur": 3.2, "bg": "black"},  // or bg "blue"
    {"type": "bigword", "text": "ICON", "at": 18.95, "dur": 1.7, "behind": true, "y": 0.355, "size": 340, "colour": "#FFE14D"},
    {"type": "counter", "from": 0, "to": 25, "at": 26.8, "dur": 2.3, "label": "hours of research", "format": "int"},  // time | int | money | k
    {"type": "prompt", "text": "make it more aesthetic", "at": 10, "dur": 3},
    {"type": "colourbg", "colour": "#9FB8D6", "at": 63.9, "dur": 2.4, "lines": [{"t": "ask yourself", "f": "serif", "c": "#1E1E1E"}, {"t": "5 questions", "f": "display", "at": 64.4}]},
    {"type": "wall", "srcs": ["assets/a.png", "assets/b.png"], "at": 30, "dur": 2},
    {"type": "dm", "keyword": "QUESTIONS", "text": "and I'll send you all five", "at": 66.3, "dur": 2},  // "verb" and "reply" come from brand/voice.json unless you set them; never let it fall back to "Comment" for someone who does not ask for comments
    {"type": "chat", "at": 30.7, "dur": 5.9, "msgs": [{"from": "me", "text": "Goal: ...", "at": 30.9}, {"from": "ai", "text": "...", "at": 34.6}]},
    {"type": "folder", "name": "Product photos", "srcs": ["assets/item1.png"], "at": 14.5, "dur": 4.3, "y": -0.03},
    // bigword also takes "strike": <time> for a yellow strike-through (e.g. PROMPTS). backdrop/band take "pos" 0..1 to choose which slice of a tall screenshot shows (put the key line ABOVE the speaker’s head)
    {"type": "zoomblur", "at": 42.62}, {"type": "flash", "at": 50}
  ],
  "checklist": {"title": "Check list", "start": 6, "end": 50, "slots": 3, "items": [{"text": "Are all the topics the same?", "at": 9}]},
  "end": {"start": 52, "lines": ["Comment", "QUESTIONS"]},
  "audioTracks": [ {"src": "<voId>", "in": 0, "out": 42, "at": 0} ],
  "duration": 69
}
```
A contrast `✗` on a hook or an end card should be rare now: the engine picks the readable colour before rendering. When one still appears, the background is mid-tone, where no single colour reads, and the answer is to move the text or use a hook or card that carries its own background.

fx/hook/labels/checklist/end times are OUTPUT seconds. Run `node reel.mjs plan <slug>` and read plan.json caption words for exact times. Anything that puts the speaker in front (backdrop, colourbg, bigword behind, hook behind) auto-generates a person cutout for those frames. Captions auto-hide under bigword/counter/colourbg/wall/dm and drop to chest height (y 0.56) during a backdrop.

## Effects library
`library/effects-library.html` in this kit is the browsable list: one still per effect, grouped and
searchable. `library/catalog.json` is the source of truth (one entry per effect: id, name, `say`,
`earns`, group, when to use it, and a demo that renders its still). Read it before planning a cut.

`say` is the name to use out loud and the only one to put in front of the owner: "cards spinning
around your head", not `orbit`. `earns` is what has to be in a spoken line before that effect is
honest. The engine keeps its own `type` names in `edit.json`; the mapping lives in the catalogue, so
nothing has to be renamed to talk about it like a person. The owner can ask for an effect by either
name, and they will say the spoken one, because that is the one on the page.

To add an effect after building it in `engine/src/Reel.tsx`: add a catalogue entry, then
`node library/build.mjs --only <new-id>` (renders just that still and rebuilds the page).
`library/README.md` has the entry format and the full procedure for turning a reel they love into a
new effect.

## The house rules (apply to every cut)
1. **Offer, do not present.** Run `node reel.mjs menu <slug>` first. It prints what the last few
   reels opened with, how this person asks for things, every spoken line with the plain signals in
   it, and what those signals could earn, named the way a person says them out loud. Then send the
   owner: the hook you would use, what you would cut and why, and **a short numbered menu of
   effects, each one quoting the line it sits on**, in those spoken names ("cards spinning around
   your head", not `orbit`). Ask which they want. Offer four to six and expect them to pick three:
   a handful chosen on purpose is what makes a reel good, and rule 7's 5 to 8 a minute is a ceiling,
   not a target. The owner who has never asked for an effect has never been offered one.

   Two things this is not. It is not a finished cut described out loud, which is all a yes-or-no
   plan can be. And it is not the same menu every time: anything the last two or three reels used
   is listed as already used, and the opening gets picked deliberately against theirs.

   **"Just cut it" still works.** The review studio's New reel screen lets them tap it, and
   `review/data/jobs/*.json` carries `go: "cut"`. Then do not ask: read the menu yourself, choose
   the few, cut it, and say in two lines which effects you chose and which line each one sits on,
   so the next round is a conversation about real choices rather than a blank page.

2. **The words on screen are theirs.** Every written word in a cut — the hook, the big word, a
   label, a counter label, a checklist line, the DM line, the end card — comes from what this person
   said in this footage, or from `brand/voice.json`. Never from the worked example below, and never
   from another reel of theirs on autopilot. The example in this file is **the kit author's own
   reel**: the shape is the lesson, the strings are hers. If `voice.json` has not answered how they
   ask for something, ask them and write it down, because the gate will stop the cut otherwise (see
   rule 8). A reel that ends on somebody else's call to action is the wrong reel.
3. **Cut 20 to 30% off the raw take.** Lose any line that can go without losing meaning. `tighten` removes pauses over 0.3 s.
4. **Describe the footage before you use it.** `prep` writes `assets.json` with one empty line per
   clip and image. Look at each contact sheet and write one line saying what it SHOWS, not what they
   say over it: `node reel.mjs describe <slug> --set "<id>" "what it shows"`. An asset with no
   description is not used: `render` refuses the cut and names it. If you cannot say what a clip
   shows, use a type-led effect (`bigword`, `counter`, `label`, `colourbg`) instead of guessing.
   When what an asset shows has no word in common with the line being spoken under it, the engine
   says so: move it onto the line it is about, or cut it.
5. **Every effect earns its place.** A word they said triggers it: a name gets a `label`, a number gets a `counter`, a platform gets a screen or `phone`, a place gets `backdrop` b-roll, a list gets `tasks` or `checklist`, an ask gets `dm` or `comment`. Never use footage that is merely nearby. No asset, no claim: ask for it or use a type-led effect (`bigword`, `counter`, `label`, `colourbg`).
   **B-roll runs to the cut.** When b-roll or a full-screen graphic would end a split second before the next cut, the engine carries it on to the cut, so a sliver of the talking head never flashes up between them. Nothing to set. If they ever want the old behaviour (b-roll ending exactly where you placed it), put `"snapBroll": false` at the top level of `edit.json`.
6. **Captions big and a beat early, never on the face.** The engine shows words 0.14 s early and drops captions when a big graphic is up. Do not shrink captions below 56 px, and leave `captions.y` at the brand default unless something is in the way: it is set to clear the speaker.
   A caption line never ends on "I" or a single letter: the engine moves that word to the start of the next line, because a line ending "…and I" reads like auto-captions. If they want captions with no punctuation at all, set `captions.noPunct: true`; leave it off unless they ask.
7. **5 to 8 effects a minute is the ceiling.** Not the target. Something changes on screen every 2
   to 4 s at the top of that range, and a reel of four deliberate effects beats a reel of nine
   dutiful ones. Also: do not open the same way twice. `menu` prints what the last two or three
   reels opened with, and the check says so out loud if this one opens identically.
8. **Always look at `stills` before a full render.**
9. **Run the check and never hand over a failing cut.** `node reel.mjs check <slug>` measures the rules that can be measured: text on the speaker's face, the safe zones, contrast against the real background, the palette, caption size, any written word that belongs to the kit rather than to this person (an unfilled blank, or the kit author's own end card, DM line, big word or counter label — `brand/voice.json` is how a phrase they really do use gets cleared), and whether this cut opens exactly like the one before it. `render` runs it for you and will not copy a failing cut to Downloads. Every `✗` is fixed in `edit.json` and re-rendered before the owner sees anything. Every `!` is a judgement call: look at the frame it names and either fix it or say why you left it.

10. **Learn from their notes, and never write a rule they did not agree to.** When they approve a
   reel, run `node reel.mjs learn <slug>`: it reads the notes they resolved, reconstructs what was
   on screen at each one from that version's `plan.json`, and proposes at most five candidate rules
   with their evidence. Read each one out and wait. `rules approve <id>` on a yes, `rules reject
   <id> "their reason"` on a no, which is remembered so it is never proposed again. One note about
   one caption is not a rule; the engine only proposes a correction that has happened twice or that
   they stated generally themselves. When an approved rule's correction turns up on a second reel
   and it can be measured, `rules promote <id>` (on their yes) turns it into a check, because prose
   can be skipped and a check cannot. `review/PROCEDURE.md` is the full loop.

## The full effects list
See `EFFECTS.md` next to this file: every effect type with its fields and when to use it, with the
spoken name beside each. `templates/formats/starting-point.json` is where a new reel starts, and it
is nearly empty on purpose: the two fixed skeletons that used to live there are why five people's
reels opened the same way, used the same six of these 48 effects in the same order, and ended on the
same two words. `templates/formats/README.md` says what replaced them.

## Review loop
Deliver the MP4 and a caption, and put the cut on the review studio so they can leave notes by
timestamp on their phone:

```
node engine/reel.mjs render <slug> --summary "what this version does"   # the check runs at the end
node engine/reel.mjs review <slug>
node engine/reel.mjs studio            # leave running; prints the phone link
```

Every render is kept: `out/versions/v<n>/` holds that cut's MP4 beside the `edit.json` and
`plan.json` that made it, so nothing is ever overwritten and any earlier cut can come back
(`versions`, `restore`). Notes are stamped with the version they were left on.

`review/PROCEDURE.md` is the full procedure: where the notes file is, how to reply on each note, how
to publish the next version, and what to do when they approve a cut (run `learn`, read the candidate
rules out, write down only the ones they say yes to). Follow it. Notes given in chat instead work the same way: map each note
to the one entry in `edit.json` that causes it, change only that, re-render, and say what changed.
