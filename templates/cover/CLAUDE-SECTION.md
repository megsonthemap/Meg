## Covers: "make me a cover"

When the owner asks for a cover (or a thumbnail, or "the first frame for my grid") for a reel that is
already cut, make three options, look at them yourself, then show them.

1. **Draft the words.** Start from the reel's hook (edit.json `hook.text`), but a cover is shorter than
   a hook: 3 to 7 words, one loud word or short phrase they would screenshot (a noun or a number from
   the reel, ideally the punch word they already chose). Write it in their voice from
   `brand/voice.json`: no em dashes, Australian spelling, no words they refuse. Mark the loud part with
   [brackets] and break lines with `|`. If you are not sure, run it with no `--title` first: it uses
   the hook and makes the reel's punch word loud.

       node engine/cover.mjs <slug> --title "The three things I | [never] | post without"

   It picks up to 6 frames of them (eyes open, mouth closed or smiling, sharp, in a pause between
   words, never mid-sentence) into `out/covers/frames/`, and renders three designs on the best one:
   1 the title above the head, 2 the title across the middle, 3 a huge word behind the head with them
   cut out in front (on Windows, 3 is the same title big over the frame instead).

2. **Look before they do.** Open `projects/<slug>/out/covers/frames/frames.jpg` and
   `projects/<slug>/out/covers/covers.jpg` yourself. Throw out any frame where their mouth is open or
   their eyes are half shut, even if it ranked first (on Windows nothing measures the face, so this
   look is the only check): rebuild on a better one with `--frame <n>`. Check that no text sits on the
   face and every word reads. If fewer than 6 frames came back, that is the rule working, not a fault.

3. **Show them.** Open the contact sheet for them (`open projects/<slug>/out/covers/covers.jpg` on a
   Mac, `start projects\<slug>\out\covers\covers.jpg` on Windows). Top row is the full cover as it shows
   on the Reels tab, bottom row is how it crops on their profile grid. Ask one question:
   "Which one, 1, 2 or 3? Or tell me different words, or a moment you like better."

4. **Change what they ask for, nothing else.**
   - Different words: run again with the new `--title`. Use their words exactly.
   - A different photo of them: open `frames/frames.jpg`, let them pick a number, run with `--frame <n>`.
   - "The bit where I say X": find the second in plan.json caption words and run with `--t <seconds>`.
     If it warns that their mouth is open there, tell them and offer the nearest pause instead.

5. **Deliver the one they pick.**

       node engine/cover.mjs <slug> --pick 2

   That copies it to `~/Downloads/Reels/<slug>-cover.jpg`. Tell them in one line where it is and that
   Instagram's "Add from camera roll" on the cover screen is where it goes.

House rules the covers already keep (do not undo them by hand): nothing in the top 12% or bottom 20%,
nothing under the right-hand icon strip, the title inside the 4:5 grid crop, and never black or
charcoal text (white, paper or the punch colour, held up by a shadow or a soft dark wash).
