# Reel Review: the procedure

This is the review studio. It is already built: a page, a small local server, and the `review`
command in the engine. Claude follows this file every time; the owner never needs to read it.

    node engine/reel.mjs studio            # start it. Prints a localhost link and a phone link.
    node engine/reel.mjs review <slug>     # put the current cut on it.

The studio is also the front door for a new reel: its **New reel** screen takes dropped footage,
copies it into `inbox/`, and runs `new` then `prep` for the owner. It stops there on purpose. It
never plans, edits or renders: the plan-first conversation is yours, in the chat.

The studio serves from this Mac. The phone link works on **any phone on the same Wi-Fi** as the Mac,
while the studio is running. It is not on the internet: nothing is uploaded, nothing is shared, and
it stops working when the Mac sleeps or the studio is stopped. (For access from anywhere, see
`ARTIFACT-UPGRADE.md`.)

## Where everything lives

| Path | What |
|---|---|
| `review/index.html` | The page. Leave it alone unless the owner asks for a change to the review experience. |
| `review/data/<slug>.json` | The reel: title, current version, status, and one entry per version with its video, cuts, markers and caption lines. Written by `reel.mjs review`. |
| `review/data/<slug>.notes.json` | The owner's notes. Written by the page. **This is the file you read.** |
| `brand/rules.json` | The rules the owner has approved from their own notes, the ones waiting on them, and the ones they said no to. **Read it before every cut.** |
| `projects/<slug>/assets.json` | One line per clip and image saying what it shows. A cut cannot use an asset whose line is empty. |
| `projects/<slug>/LEARN-FROM-THIS.md` | Written when the owner approves a reel: their notes on it are finished and worth learning from. |
| `review/data/jobs/<slug>.json` | A reel dropped on the studio: `{slug, state, step, files, brief, go, log}`. `state` is `running`, `ready` or `failed`; `brief` is what the owner typed about the reel; `go` is `plan` or `cut`. **Check this at the start of a session.** |
| `projects/<slug>/READY-TO-CUT.md` | Written when a dropped reel finishes prep. Your cue that a project is waiting. Delete it once you have sent the plan. |
| `review/media/<slug>-v<n>.mp4` | The 720p preview for each version. |
| `projects/<slug>/out/versions/v<n>/` | The full-resolution cut, its sheet, and the `edit.json` + `plan.json` that made it. |

## A reel waiting from the drop zone

At the start of a session, and whenever the owner says something like "I dropped some footage" or
"cut the one I just put in", look for a waiting project before you do anything else:

1. Read `review/data/jobs/*.json`. A job with `state: "ready"` is footage that has been prepped and
   not yet cut. `projects/<slug>/READY-TO-CUT.md` says the same thing in plain words: the files, what
   the owner said about the reel, and which of the two things they asked for.
2. **Read `brief` before anything else.** They typed it on the page, often on their phone, so that
   you would not have to ask. Treat it as the answer to every question you would have opened with:
   what the reel is about, the line that matters, b-roll or photos they want in, a look to match.
   Never ask them to repeat it.
3. **`go` says what they want next**, and it is their call, not yours:
   - `"plan"` (or missing) — read `brand/guide/reel-brand-guide.html`, the transcript and the contact
     sheets, then send the plan: hook, what you would cut, which effect sits on which line, what
     proof you need. Render only after they say yes.
   - `"cut"` — they tapped **just cut it** and do not want to be asked. Cut it, then show them the
     result with one line on what you chose and why, so they push back on the reel rather than on a
     plan. This is the one case where you do not wait, because waiting is what they declined.
4. Delete `READY-TO-CUT.md` once you have picked it up, so it does not look waiting next session.
5. `state: "failed"` means `new` or `prep` stopped. The `error` and the last lines of `log` are in
   the job file. Run the step yourself, tell them in one line what was wrong, and carry on.
6. `state: "running"` means the studio is still prepping that reel. Leave it alone and say so: `prep`
   takes a few minutes on a long clip.

The drop zone handles one reel at a time, because `new` sweeps the whole inbox into one project. If
they drop a second lot while one is preparing, the page tells them to wait, and so should you.

## Publishing a cut

1. Render it: `node engine/reel.mjs render <slug> --summary "what this version does"`.
   Every render is kept as a new version; nothing is overwritten.
2. **Read the check at the end of the render, and do not publish a cut with a `✗` in it.** The
   studio is where the owner sees the reel, so putting a failing cut there is handing it over. Fix
   what each `✗` names in `edit.json`, render again, and publish the cut that passes. `node
   engine/reel.mjs check <slug>` runs the same check on its own. A `!` is a judgement call: look at
   the second it names, then fix it or mention it in one line when you send the cut.
3. Publish it: `node engine/reel.mjs review <slug>`. This makes the 720p preview, reads
   `plan.json` for the cuts, the named effect markers and the caption lines, and adds this version to
   the reel's page entry. Re-running it for the same version replaces that entry rather than adding one.
4. Make sure the studio is running (`node engine/reel.mjs studio`, left running in the background),
   then give the owner the phone link.

## Reading notes back

1. Read `review/data/<slug>.notes.json`. Each note is `{id, t, text, done, version, createdAt}`;
   `t` is the second in the finished reel, `version` is the cut it was left on.
2. Work only on notes where `done` is false. Check `version`: a note left on v2 is about v2, so if
   you have already cut v3, look at `projects/<slug>/out/versions/v2/plan.json` for what was on
   screen at that second, and say so if the thing they are asking about has already changed.
3. Map each note to the one entry in `edit.json` that causes it, and change only that.
4. Mark each note done and say what you did, in the same file:
   set `done: true` and add `"reply": "one plain sentence about what changed"`. Keep every other field.
5. Re-render and re-publish (steps 1 to 3 above), check included. The page picks the new version up on its own; the
   owner can still switch back to any earlier cut from the version menu.
6. When `status` in `review/data/<slug>.json` becomes `approved`, the owner is happy: deliver the
   full-resolution file from `~/Downloads/Reels/<slug>.mp4` and stop touching that cut. Approving
   also writes `projects/<slug>/LEARN-FROM-THIS.md`, which is the next section.

## Learning from the notes they just closed

The owner's words on why this exists: *"It can't be a blanket rule but how can we make sure that it's
getting smarter each time?"* So every rule here carries the note and the frame that produced it, and
none of it is written down without their yes.

When a reel is approved:

    node engine/reel.mjs learn <slug>

It reads the notes they resolved, reconstructs what was actually on screen at each one from the
`plan.json` of the version that note was left on, and proposes at most five candidate rules. Each
one comes with its evidence: the second, their words, what was on the frame, and what you changed.

Then **read them to them one at a time and wait**. Nothing is written down on your own judgement.

    node engine/reel.mjs rules approve <id>
    node engine/reel.mjs rules reject <id> "their reason"

A rule they reject is remembered as a no and is never proposed again, on any reel. Approved rules go
into `brand/rules.json`, which you read before every cut, and some of them change the next plan on
their own (a caption-size floor, for example, is applied before `edit.json` gets its way).

It is deliberately hard to become a candidate. One note about one caption is a note, not a rule: it
is filed as an observation and proposed only if the same correction happens again, or if they stated
it generally themselves ("always", "never", "every time"). Two rules they recognise are worth more than
five they have to argue with, so do not try to talk the engine into proposing more.

**Rules that keep coming back stop being prose.** `node engine/reel.mjs rules` lists any approved
rule whose correction has now happened on a second reel and which can be measured. On their yes:

    node engine/reel.mjs rules promote <id>

From then on it is enforced by `check`, so a cut that breaks it is held back like any other house
rule. Prose can be skipped; a check cannot. A rule that nothing can measure says so on its own line
and stays prose, which is honest: pacing, wording and whether a hook earns its next three seconds
are theirs to call, not something to pretend is being watched.

Delete `LEARN-FROM-THIS.md` once you have done this.

## The footage has to be described before it can be used

The 20 Oct failure put a screen recording of one thing over a sentence about something else. The
project held four video files and not one word on disk about what any of them showed, so the b-roll
choice was a guess.

`prep` now writes `projects/<slug>/assets.json` with one empty line per clip and image.

    node engine/reel.mjs describe <slug>                                  # what is described, what is not, and the sheet to open for each
    node engine/reel.mjs describe <slug> --set "<id>" "what it shows"
    node engine/reel.mjs describe <slug> --from descriptions.json         # {"<id>": "what it shows", ...}

Write each line yourself from the contact sheet prep already rendered. Say what the footage **shows**,
not what they say over it: a screen recording of one app can have the owner talking about something
else entirely across the top of it.

**An asset with no description is not used.** `render` refuses the cut and names the asset. If you
cannot say what it shows, use a type-led effect instead (`bigword`, `counter`, `label`, `colourbg`).
When a described asset's words have nothing in common with the line being spoken under it, the cut
says so, and the check asks about it. A word in common is not the same as the right shot, so that
part is still yours to look at.

## Going back to an earlier cut

    node engine/reel.mjs versions <slug>       # every cut, when it was made, its notes
    node engine/reel.mjs restore <slug> 2      # v2's edit.json and MP4 become current again

`restore` puts that version's `edit.json` and MP4 back in place and records it as a new version, so
nothing is lost either way. Publish it with `review` afterwards so the page shows it as the latest.

## Rules

- Never edit `review/data/<slug>.notes.json` except to set `done` and `reply` on a note. The owner
  owns that file; the page writes to it too.
- Never delete a version folder. Disk is cheaper than a cut they liked and cannot get back.
- One sentence per reply. "Cut the pause before 'embarrassing' and moved the big word 0.3s later."
- If the studio was not running when they tried the link, start it and tell them in one line.
