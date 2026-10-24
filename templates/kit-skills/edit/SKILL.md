---
name: edit
description: Switch on Reel Studio. "/edit" (or "/edit new reel", "new reel", "open my studio", "edit a reel") opens the studio page and makes this chat the editor behind it, so everything (footage, style, the plan, their yes or change, Cut first, the moments, the cut, notes, re-cuts) happens on the page and gets answered there.
---

# /edit: the studio is the workspace, this chat is the editor

The owner works on the studio page, not in this chat. Every answer goes onto the page: the plan into
`projects/<slug>/PLAN.md`, progress with `status`, cuts with `review`, note replies into the notes
file. In the chat itself, say at most one short line per event. Read `CLAUDE.md` and
`templates/skill/SKILL.md` for how to edit; this file is only how the page and the chat talk.

## Switch on
1. Is the studio running? `curl -s -m 2 localhost:7847/api/jobs`. If not, start it in the background:
   `node engine/reel.mjs studio` (Bash, run in the background), from the Reel Studio folder.
2. Open it for them: `open "http://localhost:7847/#new"` for a new reel (`start` instead of `open`
   on Windows), or without `#new` otherwise.
3. One editor at a time. If a `node engine/reel.mjs wait` is already running from another chat, say
   so and stop. Otherwise start the waiter IN THE BACKGROUND:
   `node engine/reel.mjs wait --minutes 240`
   While it runs the page shows the editor as switched on. Do not poll: it wakes you when they do
   something.
4. One line to them: "Your studio is open and the editor is on. Leave this chat open in the background."

## When the waiter prints `EVENT {"slug", "type", "text"}`
Start the next waiter straight after you finish handling it (same command, background).

Report progress on the page at every real step, so they always know what is happening and roughly
how long it takes. Never go quiet for more than a minute or two:
`node engine/reel.mjs status <slug> working --task <plan|cut|notes> --new "Reading your footage"`,
more `status <slug> working "…"` lines as you go (one short plain sentence each), and finally
`status <slug> idle "Done: …"` (or `error "what went wrong"`).

- **plan**: they picked a style and want a plan. Read `projects/<slug>/READY-TO-CUT.md` (their note,
  style picks, and whether they ticked Cut first or Same as last time; delete it after), the
  transcript and the contact sheets, and run `menu`. Write `projects/<slug>/PLAN.md`: the story in one
  line, the hook, the cut as a table (# | line | take | effect on that line), what you are cutting,
  proof you need, at most two questions. Status idle "Plan ready".
- **change**: `text` is their change to the plan. Update PLAN.md. Status idle "Plan updated".
- **approve**: they said yes to the plan (`text` may hold more instructions).
  - If they ticked **Cut first**: write only the cuts into edit.json (no fx yet), run
    `node engine/reel.mjs cutlist <slug>`, then `status <slug> idle --task cutfirst "Your cut is ready
    to check"`. Their page shows every line with keep or cut and a plain preview. Stop there.
  - Otherwise write edit.json from PLAN.md, check a few stills, fix anything off, run
    `node engine/reel.mjs moments <slug>` and `status <slug> idle --task moments "Your N moments are
    ready to check"`. Do NOT render the full reel yet.
- **cutlock**: `text` is the lines they kept, eg `1,2,4,5`. Run `node engine/reel.mjs cutlock <slug>
  <text>`, re-time anything placed by seconds against the new cut, add the effects from PLAN.md, then
  `moments` as above.
- **preview**: `text` is a moment number. `node engine/reel.mjs preview <slug> <n>` (a few seconds),
  one status line ("Preview of moment 4 is up"), keeping `--task moments`.
- **moments**: `text` is JSON `[{moment, note}]`. Fix each in edit.json, run `moments` again, status
  idle --task moments "Fixed moments 3 and 7, have a look".
- **render**: they said the moments look good. Full render + the check (fix and re-render on any ✗,
  saying what you fixed), then `node engine/reel.mjs review <slug> --summary "…"`, then status idle
  --task cut "Done: …". The page then shows the edit and a Download button.
- **cut**: they tapped "Just cut it". Read READY-TO-CUT.md, write a short PLAN.md, then do approve
  (Cut first still applies if they ticked it).
- **notes**: read `review/data/<slug>.notes.json` (done false; t = seconds into the cut). Fix each,
  re-render, check, `review` the new version, then set each fixed note `done: true` with
  `reply: "what I changed"` in that file.
- `TIMEOUT`: start the waiter again.

## Hook options and tap edits
- When you write edit.json after their yes, also write `hookOptions`: three hooks in their words from
  this footage (the one in the plan first), each a string with `\n` line breaks. Run
  `node engine/reel.mjs hooks <slug>` before `moments`, so their moments board shows "Pick your hook".
  When they pick one, the studio swaps it in and keeps the other two as `hookVariants` (trial openings).
- They can now change things on the page themselves: move, stretch or remove a moment, colour the
  footage (`grade` for the whole reel, `grades` for a stretch of it), fix a caption word (`fix`, also
  saved to My words), make a word the punch word (`emphasis`), pick the hook, or add an image from their
  shelf (`brand/shelf/`, added as a sticker). The studio writes these straight into edit.json.
  **edit.json is always the truth: never undo their tapped changes.** A `render` event may list them;
  render edit.json as it stands, run the check, fix only what fails, and say what you fixed.
- A note that says "Add <effect> here (from my effects library: <id>)" means put that effect at that
  second, on what they say there, with their words.

## Same as last time
READY-TO-CUT.md says when they ticked it and which reel to copy. Read that reel's `edit.json` and
match its look (captions, hook style, energy, the kinds of effects) on this reel's own lines. It is
for this reel only: never save it as a default.

## Energy
Put `"energy"` in edit.json from their pick. **Quiet**: hook and clean captions, two or three
moments, no sound effects, no cards or stickers. **Balanced**: a moment every 6 to 8 seconds, light
sound. **Full**: something on screen every 4 to 6 seconds, each on a line they say. The check warns
when a cut drifts from its Energy.

## My words
When they correct a name or term the transcript got wrong, save it for every reel:
`node engine/reel.mjs words add "<as heard>" "<correct>"` and say so in a status line.

## Notes
- The editor only runs while this chat is open. If they close it, the page says the editor is off
  and keeps their request; `/edit` again picks it all up.
- More footage for a reel: "+ Add more footage" on the page; prep runs on its own.
