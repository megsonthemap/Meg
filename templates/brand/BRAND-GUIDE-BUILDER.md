# Brand guide builder

A questionnaire, a reference-pull step, and one prompt. Out the other end comes your reel brand guide (look, type, colour, layout, captions, the cut, formats, shooting, idea bank) that Claude reads before every edit.

## Part A. Reference pull (do this before the questionnaire)

The guide is decoded from your reels, not from your answers alone. Answers alone produce a generic guide.

1. Save 6 to 10 of your own reels you are proud of into a folder called `refs`. Export from Instagram or AirDrop the originals.
2. Add 3 to 5 reels from other people you wish you'd made. Name the files by creator.
3. Add your logo, your fonts (the files you own), and a screenshot of your existing brand board if you have one.

Prompt to run first:

> Look at every video in `refs`. For each one, make a contact sheet of 12 frames and tell me: where the text sits, how big it is, what font family it looks like, the colours used, how often the shot changes, and what the first 3 seconds do. Then tell me what is consistent across my own reels and what is consistent across the ones I admire. Don't write a guide yet.

## Part B. The questionnaire

Answer in plain words. Skip anything you don't know and say "you choose".

**1. Who and why**
- Who watches your reels and what do you want them to do after?
- Which of your reels performed best? Which did you love that didn't?
- One line: how should someone feel 3 seconds in?

**2. The look**
- Where do you film? (desk, wall, car, out and about, kitchen)
- Do you mostly talk to camera, show your screen, or show your life?
- Light and grade: warm, cool, flat, high contrast? Point to a reference.
- Anything that must never appear (stock footage, hard split screens, stickers, emojis)?

**3. Type**
- Your display font (the loud one) and your reading font (the quiet one). File names if you own them.
- Fonts you refuse to use.
- Italics or a script (cursive) font: yes or never? If yes, the italic/script font files. (Never = `"reel": {"italics": false}` in brand.json.)
- How big should captions be on a phone? (Point to a reel where they felt right.)

**4. Colour**
- Your 3 to 5 brand colours with hexes, or point at a reference.
- Which one is the "punch" colour, used for one word at a time?
- Where does colour go: behind text, behind you, full-screen cards, never on the footage?

**5. Layout**
- Where does the hook text sit: above your head, behind your head, bottom third?
- Where do captions sit while you talk?
- Where do proof screenshots sit, and do they tilt, float, or stack?
- Safe zones you care about (IG UI covers the bottom 20% and right edge).

**6. Captions**
- One word at a time, phrases, or stacked lines?
- Do loud words switch to the display font?
- Should captions step aside when a big graphic appears?
- Words that always get the punch colour (your name, your product, your numbers)?

**7. The cut**
- How much shorter than the raw take should the final be? (I say 20 to 30%.)
- How often should something change on screen? (I say every 2 to 4 seconds.)
- Effects you love and effects you hate. Point at reels for each.
- Rule for b-roll: behind you, stacked, full screen, never?

**8. Formats**
- List the 4 to 6 kinds of reel you actually make (talking head, screen tutorial, storytime, receipts, life, with-a-guest).
- For each: where it's filmed, how long, what the hook usually is, what the end card asks.

**9. Shooting**
- Phone, camera, or both? Which settings do you use?
- A 10-second habit you want to build (I film a document-style clip every time something visual happens).
- Recurring times you can film without planning.

**10. Idea bank**
- Your 3 to 4 content goals (sell X, grow Y, book speaking, be the go-to for Z).
- Under each, list 5 reel ideas you already have, even half-formed.

**11. Voice**
- Words you never say on screen.
- Spelling (Australian, US).
- Punctuation rules (no em dashes, no exclamation marks, whatever is yours).

**12. Your ask** (this becomes `brand/voice.json`, and it is the part of the guide that must not
look like anybody else's)
- When a reel ends, what do you want someone to do? Comment a word, DM you, follow, click a link,
  or nothing at all. "Nothing at all" is a real answer.
- If a word: which word, and write the ask exactly as you would say it. Not "Comment / KEYWORD".
- If something lands in a DM, what does the card say under the keyword? One short line.
- Words and phrases you say all the time that belong on screen in your voice.
- How do you usually open a reel? Anything you never want to open with?

## Part C. The build prompt

Paste once the references are analysed and the answers are in a file called `answers.md`.

> Read `answers.md` and your analysis of `refs`. Write my reel brand guide as a single HTML page I can publish and read on my phone, with these sections in this order: The look, Type, Colour, Layout, Captions, The cut, Formats, Shooting, Idea bank, and a final section called "Hand me footage" that tells you, Claude, exactly how to edit for me from now on. Every rule must be specific enough that a stranger could edit a reel from it: sizes in pixels at 1080 wide, positions as a fraction of the frame, timings in seconds. Where my answers and my reels disagree, follow the reels and flag the difference. Where I said "you choose", choose and say why. Use my fonts and colours in the page itself so I can see them. Add a section called "My words" holding my answers to part 12, and do NOT pin a default end card, a default hook style or a default set of three effects anywhere in the page: those are decisions to make per reel, and a guide that fixes them is how every reel ends up the same. Then save a copy of the look rules as `brand.json` and my answers to part 11 and 12 as `brand/voice.json`, both for the editing engine.

`brand.json` holds the look, which is shared across every reel you make on purpose. `voice.json`
holds the words, which must change from reel to reel and from person to person. Keep them separate:
the day a default end card ends up in `brand.json` is the day every reel ends the same way.

What `brand.json` holds (the engine reads it):

```json
{
  "fonts": {"display": "MyDisplay-Heavy.otf", "serif": "MySerif-Regular.otf"},
  "colours": {"punch": "#FFE14D", "accent": "#9FB8D6", "paper": "#F6F6F6", "ink": "#444444"},
  "captions": {"mode": "stack", "size": 60, "y": 0.24},
  "hook": {"default": "top"},
  "cut": {"shorten": 0.25, "changeEvery": [2, 4], "tightenGap": 0.3},
  "broll": {"split": "never", "modes": ["backdrop", "band"]},
  "never": ["italics", "hard split screen", "stock footage"]
}
```

And `brand/voice.json`:

```json
{
  "ask": {"kind": "comment-keyword", "endCard": ["Drop the word", "SYSTEM"], "dmLine": "and it's yours", "keywords": ["SYSTEM"], "verbs": ["drop"]},
  "words": {"says": ["the boring bit"], "never": ["unlock", "game-changer"], "spelling": "en-AU", "punctuation": "no em dashes"},
  "openers": {"habits": ["a flat statement"], "avoid": ["a question first"]},
  "effects": {"love": ["counter", "backdrop"], "avoid": ["glitch"]}
}
```

A null or an empty list means nobody has answered yet, which is better than a guess: Claude asks
when a reel needs it.

## Part D. The 24-hour test

Edit one reel with the new guide, watch it on a phone, then answer three questions. Did it look like me? What did Claude get wrong? Which rule would have stopped that? Add the rule to the guide.


## Part E. The interview prompt (if you'd rather be asked than fill in a form)

Paste this into Claude Code with the kit folder open:

> Interview me to build my reel brand guide. Ask one question at a time and wait for my answer. Cover, in order: who my reels are for and what I want them to do; where I film and what must never appear; my display font and my caption font (or tell me to skip if I don't own any); my brand colours and which one is the punch colour; where the hook, captions and proof screenshots sit on screen; caption style (one word, phrases, or stacked); how hard to cut and how often something should change on screen; b-roll rules; the four to six kinds of reel I make; my filming setup; my content goals and reel ideas under each; my voice rules (words I never use, spelling, punctuation); and how I want a reel to end, in the exact words I would use, including whether I want a call to action at all. Before you read any folder, file or website of mine, ask permission. When you have everything, write the guide to brand/guide/reel-brand-guide.html, save brand/brand.json for the look and brand/voice.json for my words, and show me the rules in plain words, not JSON.
