# Starting a reel

There is one file here and it is nearly empty. That is deliberate.

Until October 2026 this folder held two finished skeletons, `wall-talk.json` and
`behind-the-head.json`. Each one carried a hook style, exactly three effects in a fixed order and an
end card reading "Comment / KEYWORD". Copying one and filling in the capitals was the fastest way to
a reel, so it was the way every reel got made: five people's reels opened the same way, used the
same six effects out of the forty-eight this engine renders, and ended on the same two words. The
skeletons were not a shortcut to a cut. They were a decision nobody made.

So they are gone. `starting-point.json` is the bare minimum that renders: one cut and a duration.
Everything a viewer would use to tell two reels apart is absent, because all of it has to be decided
per reel:

| What | Where it comes from |
|---|---|
| Captions, their size and position | `brand/brand.json`. The look is the brand, so it is the one thing that does not vary. |
| The hook, and whether there is one | This reel's first spoken line. |
| Which effects, and in what order | The lines in this reel that earn them, offered to the owner to choose from. |
| Every written word on screen | What this person said in this footage, plus `brand/voice.json` for how they ask. |
| The end card and the DM line | `brand/voice.json`. Never the example's. |

The command that replaces the skeletons:

    node engine/reel.mjs menu <slug>

It prints what the last few reels opened with so this one can open differently, how this person asks
for things (and which of those questions nobody has answered yet), every spoken line with the plain
signals in it, and the effects those signals could earn, named the way a person says them out loud.
It chooses nothing. Pairing a line with an effect is the editing, and that is the conversation to
have with the owner.

Times under `cuts` are SOURCE seconds (where in the raw clip). Times under `fx`, `hook` and `end`
are OUTPUT seconds (where in the finished reel). `node engine/reel.mjs plan <slug>` prints the exact
output time of every caption word, which is how an effect lands on the word it is about.
