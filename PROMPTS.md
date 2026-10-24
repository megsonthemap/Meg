# Reel Studio, prompt by prompt

Open the kit folder in Claude Code. Type these in order. Each one tells you what Claude does next and what you do. You never open Terminal.

If you would rather not type ten things, type **`build my studio`** and Claude runs the whole flow below, asking you one question at a time. Stopping halfway is fine either way: say "keep building my studio" later and Claude picks up where it left off.

## 1. Set it up as your editor
> I am going to set you up as my reel editor. Read this folder. Tell me what you need installed on this Mac to edit reels, then install it. Assume this Mac has nothing installed yet. Ask me before you install anything outside this folder.

Claude lists what it needs (Node, Apple's developer tools, Remotion, Whisper, the cutout tools), tells you which two it cannot install without your password, runs the installer, and renders a test reel. Open the reel when it offers. Say yes if you see captions, a yellow line and a big word behind the speaker.

## 2. Your best reels
> Here are my reels that I love and that were edited well. Ask me where they are, copy them into brand/refs, and tell me what you notice about the editing: caption style, where text sits, how often something changes, what the hooks do.

If you have none, type: "I don't have edited reels of my own yet, skip to the ones I love from other people."

## 3. Reels you love from other people
> Here are reels from other people whose style and look I love. Ask me where they are, copy them into brand/refs/inspiration, and tell me what they have in common. Don't show me examples; work from what I give you.

## 4. Your brand
> Now my brand. Ask me for my colours and my fonts. If I don't have them, ask me questions until you can suggest three options, mock each one up as a still from my test reel so I can see A, B and C, and let me pick. Then write brand/brand.json and show me the rules in plain words.

If you have fonts, Claude asks where the files are and copies them into brand/fonts. If you don't, it uses fonts every Mac has and mocks up colour options for you to choose from.

## 5. Your effects
> Open library/effects-library.html so I can see every effect. Then read library/catalog.json, look at the reels in brand/refs, and tell me which effects you'd use to recreate what I love, and when. Add that to my brand guide as my default effects.

Every effect the kit can render is in that library with a still of it and a name. Claude reads the catalogue every time it plans a reel, so "put a counter on the number" or "big word behind my head" just works. To add one you saw in someone else's reel, send Claude the reel; `library/README.md` is how it gets built and added.

## 6. Your words

> Ask me how I want my reels to end. Whether I want people to comment a word, DM me, follow, click
> something or none of it, and the exact way I'd write that ask in my own words. Then ask me the
> words I always say, the words I'd never put on screen, and how I usually open. Write it to
> brand/voice.json and read it back to me in plain words.

This is the file that stops your reels looking like everybody else's. Your colours and fonts are
your look and they stay the same on every reel, which is the point of a brand. Your end card, your
DM line, the big words, the labels: those come out of what you actually said in each reel and out of
this file, never out of an example. Claude reads it before it writes a single word on screen, and
the check stops a cut that reaches for somebody else's copy.

Say "nothing at all" if you don't want a call to action. Plenty of good reels just end.

## 7. Your brand guide
> Interview me for anything you still don't know, one question at a time, then write my reel brand guide to brand/guide/reel-brand-guide.html using templates/brand/BRAND-GUIDE-BUILDER.md as the structure, in my own fonts and colours. Open it when it's done. Read it before every edit from now on.

## 8. Your review studio
> Put my test reel on my review studio and start it. Open it here, and give me the phone link with a plain explanation of where it works. Then tell me to tap a second on the video and type a note, and read my note back to me.

The review studio ships built. `node engine/reel.mjs review <slug>` puts a cut on it; `node engine/reel.mjs studio` serves it. You get a reel beside its notes, with text, captions, b-roll, cards, moves, cuts and your own notes each on a timeline you can tap, a menu to go back to any earlier cut, and an approve button.

It runs on your Mac. The phone link works on any phone on the same Wi-Fi as the Mac, while the studio is running. Nothing is uploaded and nothing is shared. If you want it to work away from home too, `review/ARTIFACT-UPGRADE.md` says what that takes.

The same page is where your next reel starts. Tap **New reel**, drag your footage in, give it a name, and it copies the footage over and gets it ready: proxies, a transcript, contact sheets. When it has the footage ready it asks you right there what the reel is about: the point of it, the line that matters, b-roll or photos you want in. Then you choose: a plan first, or just cut it. Whatever you type is waiting for Claude next time you open the chat, so nothing gets asked twice. One reel at a time: if you drop a second lot while one is still getting ready, it asks you to wait.

## 9. Your first reel
Either drag the footage onto the review page's **New reel** screen, say what the reel is about there, and open the chat when you are back at the Mac, or put it in the `inbox` folder and type this:

> I've put raw footage in inbox. Cut this. Before you plan, run the menu command and show me the
> options: the hook you'd use, what you'd cut, and a short list of effects you think fit, each one
> with the line it would sit on. Name them the way I'd say them, not the code names. I'll pick.
> Don't render until I've picked.

Every cut is measured before you see it: captions off your face, nothing crowding the top or the
bottom of the frame or the buttons down the right, text that holds against whatever is behind it,
caption size, your own colours. Claude fixes anything that fails and renders again, so what reaches
you is a cut that already passed. Ask it to "run the check" any time you want to see what it looks at.

Claude offers rather than presents: a short numbered menu of effects, each tied to a line you
actually said, in plain words ("cards spinning around your head", not "orbit"). Pick the ones you
want and ignore the rest. Four to six offered, three picked, is a good reel; the system can do eight
a minute and that is a ceiling, not a target. If you'd rather not be asked, tap **just cut it** on
the New reel screen or say so here, and Claude chooses and tells you what it chose.

`library/effects-library.html` is every effect with a picture of it and the name to say out loud, so
you can ask for one by name any time. Claude also keeps a note of what your last few reels opened
with, so your third reel does not open like your first.

Claude describes your footage before it uses any of it: one line per clip and photo saying what it
shows. It can only put a clip over a line whose words it matches, so the b-roll is never a guess and
a clip nobody has described is never used.

Then notes by timestamp, either on the review page or straight into the chat: "0:04 hook is slow. 0:19 caption lags. 0:31 lose this line." Claude fixes each, tells you what changed, and renders the next version. Every version is kept, so "go back to the first one" always works.

## 10. It gets smarter each time
When you tap approve on a reel, say:

> Read my notes on that one back to me as rules. One at a time, with what was on screen when I said it.

Claude proposes a few, never more than five, each with the second, your words and the frame that
caused it. You say yes or no to each. Only your yeses are written down, and a no is remembered so
you are never asked again. When the same correction comes back on another reel, Claude asks whether
to turn it into a check, and from then on a cut that breaks it is stopped before it reaches you.

## If Claude ever stalls
> Stop. Tell me in one sentence what is wrong and the one thing I need to do.
