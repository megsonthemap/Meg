## B-roll: their own footage, sorted once ("organise my b-roll", "update my b-roll")

They can sort their camera roll into a few big buckets (Me working, Behind the scenes, Life, and so
on): albums in Apple Photos on a Mac, or folders on Windows. `brand/broll.json` says which buckets
they have and where each one lives. To set it up or refresh it, follow `templates/broll/BROLL.md`:
a few questions, a scan that changes nothing, a preview you look at yourself, and a build only after
their yes. Never create an album or fill a folder without that yes, and never remove anything.

**When a line needs footage behind it,** for example "while I'm working", "on set", "on the
weekend", or an effect that wants a clip behind them (`backdrop`, `band`, an `insert` at `pos:
"full"`), look in their b-roll before reaching for anything else:

1. Read `brand/broll.json` and pick the bucket that fits the line. If none fits, say so and use a
   type-led effect. Do not stretch a bucket to cover a line it is not about.
2. See what is in it, ranked against the line:

       node engine/broll.mjs find <bucket> --about "the words of the line" --limit 8 --sheet

   Open the sheet it prints and look. "Photos guesses" is Apple's caption, a hint only; "shows" is a
   description written in an earlier reel. Neither replaces looking.
3. Bring in the few that could work, three at most for one line:

       node engine/broll.mjs export <bucket> <slug> --ids <id>,<id>,<id>

   They land in `projects/<slug>/raw/` as `broll-<bucket>-<file>`. Clips in iCloud download through
   Photos and can take a minute; if one fails, the message says what to tell them.
4. `node engine/reel.mjs prep <slug>` (only the new clips get proxies and contact sheets), then look
   at each new sheet and describe it like any other footage:
   `node engine/reel.mjs describe <slug> --set "broll-working-IMG_4447" "what it shows"` (the id is the
   file name without its extension, as `describe <slug>` lists it).
   An undescribed clip is not used.
5. **Offer, do not pick.** In the effects menu, name the line and the clips: "Over 'while I'm
   working' I could cut to you at the whiteboard (clip 1) or typing at the café (clip 2). Which, or
   neither?" Use the one they choose. If they tapped "just cut it", choose the clip whose
   description matches the line best and say which one you used.
6. Once the clips are described, keep the descriptions for next time:
   `node engine/broll.mjs remember <slug>`.

If `brand/broll.json` does not exist and a reel would clearly be better with their own b-roll, offer
once, in one line, to organise it after this reel ("Want me to sort your camera roll into a few
b-roll albums afterwards? Takes about ten minutes."). Do not stop the reel for it.
