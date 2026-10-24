# brand/fonts

Out of the box the kit renders with two fonts every Mac already has: Avenir Next Heavy (loud words)
and Georgia (quiet caption words). Nothing to download, nothing to set up.

To use your own fonts: put the licensed files here (.otf, .ttf, .woff2), then add a `fonts` block
to `../brand.json`, for example:

    "fonts": {
      "display": {"family": "My Display Font", "files": [{"file": "MyDisplay-Bold.otf", "weight": "100 900"}]},
      "serif":   {"family": "My Serif",        "files": [{"file": "MySerif-Regular.otf", "weight": 400}]}
    }

`display` is the loud, wide font for punch words and big words. `serif` is the quiet font for
ordinary caption words. If a listed file is missing the engine falls back to the built-in Mac font and
says so in the log. Nothing breaks.

`fallbackGlyphs`: leave `false`. Set it to `true` only if your display font is a demo or trial
that replaces some glyphs with a watermark; the engine then draws only letters, digits and basic
punctuation with it and routes everything else to the standin.

No font files are included in this kit. Buy or license your own.
