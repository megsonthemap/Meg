# Effects library

`effects-library.html` is the browsable list of every effect this kit can render: one still per
effect, grouped by family, searchable. Open it by double-clicking it, or ask Claude to open it.

You pick effects by name. "Put a counter on that number", "big word behind my head", "stacked shot
with the blur seam" all map to an entry here, and Claude reads `catalog.json` before planning a cut.

| File | What it is |
|---|---|
| `catalog.json` | The source of truth: one entry per effect with its name, family, when to use it, and a demo that renders it. |
| `img/` | One still per effect, rendered on the kit's test reel. |
| `page.html` | The page template. Never edited by hand for content. |
| `effects-library.html` | The built page. Rebuilt from `catalog.json` + `img/`. |
| `build.mjs` | The builder. |
| `demo-assets/` | Six neutral stand-in images the demos use, cut from the test reel. |

## Re-render the whole library in your brand

The stills that ship were rendered on the kit's test reel. Once your brand and fonts are set up you
can have them all re-rendered in your colours, on your own footage:

    node library/build.mjs --project <your project slug>

One render per chunk of effects, so give it time (10 to 25 minutes). `--project` is any folder in
`projects/` that has been through `prep`. A longer clip packs more effects per render and finishes faster;
anything under about 10 seconds still works, it just takes more passes.

## Add a new effect you saw in a reel you love

Send Claude the reel, or describe the moment. The steps, which Claude does for you:

1. **Name the move.** One line: what moves, what it sits behind or in front of, how long it lasts,
   and the words on screen that would trigger it.
2. **Build it** in `engine/src/Reel.tsx` as a new `fx` type, with its fields.
3. **Add a catalogue entry** to `catalog.json` under `effects`:

       {
         "id": "my-effect",
         "name": "What you'll call it out loud",
         "group": "text",
         "when": "The moment in a script that earns it.",
         "dur": 2.0,
         "still": 1.4,
         "fx": [{"type": "my-effect", "text": "DEMO", "at": 0, "dur": 2.0}]
       }

   `group` is one of `hooks`, `text`, `media`, `ui`, `move`. `dur` is how long the demo runs, `still`
   is how far into the demo to take the picture (so catch it mid-move, not on its first frame).
   Times inside `fx` are relative to the demo's own start; the builder shifts them.
   For a demo that needs an image use `"src": "demo-assets/card1.jpg"` (or `srcs` for several);
   for one that needs a second video clip use `"clip": "__CLIP__"` and the builder fills in the
   project's own footage.
   An effect that changes the whole reel rather than one moment (a hook or caption style) uses
   `"patch": "A"` and an absolute `still` instead of `dur`/`fx`; the patches live in the same file.

4. **Render its still and rebuild the page:**

       node library/build.mjs --only my-effect

5. **Check it.** Open `effects-library.html`. If the still caught the wrong moment, change `still`
   and run step 4 again.

To rebuild the page without rendering anything (after editing names or descriptions):

    node library/build.mjs --page
