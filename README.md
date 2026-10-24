# Reel Studio kit

Drop footage in, get a branded, captioned reel out. Remotion renders it, whisper.cpp writes the
word-timed captions, Apple Vision cuts you out so text can sit behind you. Mac only.

## Install: let Claude do it

1. **Get Claude Code.** Install the Claude desktop app from https://claude.com/download and sign in with a plan that includes Claude Code.
2. **Unzip this kit** somewhere permanent, for example a folder called `reel-studio-kit` in your home folder. Don't rename anything inside it.
3. **Open the folder in Claude Code.** In the Claude app, go to the Code tab, choose Open folder, and pick the kit folder.
4. **Type:** `build my studio`

Claude reads the instructions in this folder, installs the editing tools (5 to 25 minutes, mostly downloads), then asks you a few questions one at a time: your name, your colours, whether you have brand fonts, where your best reels live. It asks before it reads anything outside this folder. At the end it renders a test reel in your colours and opens it.

Two things Claude will tell you to do yourself if they are missing, because they need your password: Apple's free Xcode command line tools (`xcode-select --install`) and Node.js 20 or newer (https://nodejs.org). Most Macs used for any kind of design or dev work already have both.

**Prefer to run the installer yourself?** Double-click `install.sh`, or in Terminal run `bash install.sh` from inside the kit folder. It is safe to run again at any time; finished steps are skipped. The test reel lands in `projects/smoke/out/smoke.mp4`.

## Requirements

- macOS 14 or newer on Apple silicon or Intel. The person cutout uses Apple Vision, so this never runs on Windows or Linux.
- Xcode command line tools (free), Node.js 20+ (free), about 3 GB of disk after install, internet for the first run.
- Google Chrome is optional. Without it the engine uses the headless Chrome it downloaded for contact sheets.
- Remotion is free for individuals and companies of up to 3 people. Larger teams need a Remotion company licence (remotion.dev/license).
- Fonts are not included. Use your own licensed fonts; the kit renders with open standins until you do.

## What each folder is

| Folder | What it is |
|---|---|
| `install.sh` | The installer. Safe to run again at any time. |
| `engine/` | The renderer. `reel.mjs` is the command line: `new`, `prep`, `describe`, `menu`, `render`, `check`, `stills`, `sheet`, `review`, `learn`, `rules`, `voice`, `capcut`. `src/` is the Remotion composition, `tools/` the Swift Vision tools, `lib/` transcription, the QA check, the light/dark text decision, the learning loop and CapCut export. |
| `brand/` | `brand.json` (your colours and font names, and the caption defaults and limits every cut starts from), `rules.json` (the rules Claude has learned from your notes, written only after you say yes), `voice.json` (how you write the words on screen: your call to action, your words, the effects you love), `fonts/` (your font files, empty on purpose; Avenir Next and Georgia are used until you add some). |
| `examples/smoke/` | The 10 second test project the installer renders. A good first `edit.json` to copy. |
| `inbox/` | Drop zone for raw footage. `node engine/reel.mjs new <slug>` moves it into a project, and the review studio's "New reel" screen does the same from your browser. |
| `projects/` | One folder per reel: raw footage, proxies, transcripts, edit.json, output, and every version you have rendered. |
| `library/` | The effects library: a still of every effect, the catalogue Claude reads, and the builder that adds new ones. Open `library/effects-library.html`. |
| `review/` | The review studio: the page you review cuts on and start new reels from, the procedure Claude follows, and your notes. |
| `templates/` | The editing procedure, the effects reference, starter `edit.json` formats, and the brand guide builder. |

## Daily use

    node engine/reel.mjs new client-launch      # moves inbox/ into projects/client-launch/raw
    node engine/reel.mjs prep client-launch     # proxies, transcript (analysis/transcript.md), contact sheets, assets.json
    node engine/reel.mjs describe client-launch # one line per clip and photo: what it shows
    # write projects/client-launch/edit.json (start from templates/formats/)
    node engine/reel.mjs render client-launch   # -> projects/client-launch/out/client-launch.mp4, then the check; a passing cut also goes to ~/Downloads/Reels/
    node engine/reel.mjs render client-launch --draft   # half-size quick check
    node engine/reel.mjs check client-launch    # the house rules, measured against the rendered frames
    node engine/reel.mjs review client-launch   # put this cut on the review studio
    node engine/reel.mjs learn client-launch    # once you approve it: your notes -> rules you say yes or no to
    node engine/reel.mjs rules                  # the rules you have agreed to
    node engine/reel.mjs studio                 # serve the review studio; prints a phone link
    node engine/reel.mjs versions client-launch # every cut so far
    node engine/reel.mjs restore client-launch 2   # bring v2 back as the current cut
    node engine/reel.mjs capcut client-launch   # editable CapCut desktop draft of the same edit

Every render is kept. `out/versions/v<n>/` holds that cut's MP4 next to the `edit.json` and
`plan.json` that made it, so a new version never destroys the one you liked.

## The check

Every cut is measured before it reaches you. The engine renders the text on its own and the footage
on its own, then looks at both: captions, hooks and labels over your face, anything crowding the top
of the frame, the bottom strip where the caption and buttons sit, or the icons down the right, how
each line of text holds against whatever is actually behind it, caption size, and any colour that is
not one of yours in `brand/brand.json`. A cut that fails is not copied to `~/Downloads/Reels` and
Claude fixes it before you see it. `node engine/reel.mjs check <slug>` runs it on its own, and every
message names the second and the fix. The defaults the cut starts from, and the limits the check
holds it to, live together in `brand/brand.json` under `reel`, so changing the house look is one
file, not an instruction you have to remember to repeat.

## It gets smarter each time

Two things stop the same mistake coming back.

**Your footage gets described before it is used.** Every clip and photo in a project gets one line
saying what it shows, written from the contact sheets. Claude can only put a clip over a line whose
words it matches, and a clip nobody has described is never used at all: the render stops rather than
guessing. B-roll that has nothing to do with what you are saying is the commonest bad cut there is,
and this is what stops it.

**Your notes become your rules.** When you approve a reel, Claude reads the notes you left on it,
works out what was on screen at each second you tapped, and proposes a short list of rules, never
more than five, each with your own words and the frame that caused them. You say yes or no to each.
Only your yeses are written into `brand/rules.json`, which Claude reads before every cut, and a no is
remembered so you are never asked again. One note about one caption is never turned into a rule: it
takes the same correction twice, or you saying it as a general preference.

When a rule you have approved comes back on another reel, Claude asks whether to make it a check.
Say yes and it joins the measured rules above, so from then on a cut that breaks it is stopped before
it reaches you. The ones nothing can measure (pacing, wording, whether a hook earns its first three
seconds) stay as advice and say so, rather than pretending to be watched.

## Reviewing on your phone

`node engine/reel.mjs studio` serves the review studio from this Mac and prints two links: one for
this Mac and one for your phone. The phone link works on any phone on the same Wi-Fi as the Mac,
while the studio is running. Nothing is uploaded and nothing is shared with anyone. Tap a second on
the video, type a note, and Claude picks it up. `review/ARTIFACT-UPGRADE.md` covers reviewing from
anywhere, which needs a Claude Code that can publish artifacts.

## Starting a reel without typing anything

The same page has a **New reel** screen. Drag your footage onto it from your desktop or your phone,
give the reel a name, and it copies the files into `inbox/` and gets them ready: proxies, the
transcript and the contact sheets. Prep takes a few minutes on a long clip, and you can close the
page or lock your phone while it runs; the screen comes back where it was.

Then it asks you what the reel is about, in a box you can type into from the sofa: the point of it,
the line that matters, b-roll or photos you want in, a reel of someone else's to match. Add more
footage if you have it. Then you choose: **send me a plan first**, or **just cut it**.

The page runs on your Mac, so it cannot start Claude up by itself. What it does is take the whole
brief off you while you are thinking about it, so the next time a Claude chat is open on that Mac the
reel is picked up with everything you said and nothing is asked twice. One reel at a time, because
`new` moves the whole inbox into one project.

## Things you may hit

- **"xcode-select: note: install requested"**: the tools dialog is open behind other windows. Finish it, then rerun.
- **Gatekeeper**: nothing in this kit is a downloaded app, so there are no "unidentified developer" prompts. The Swift tools are compiled on your Mac; Node packages come from npm.
- **whisper build takes a while**: it compiles with Metal support. 2 to 5 minutes on Apple silicon.
- **Model download stalls**: rerun `bash install.sh`. It resumes; a partial model file is detected and re-downloaded.
- **Terminal asks to allow access to Downloads/Movies**: say yes. The renderer copies finished reels to `~/Downloads/Reels` and the CapCut export writes to `~/Movies/CapCut`.
