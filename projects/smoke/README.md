# Smoke test project

A 10 second take with the smallest edit that exercises every part of the engine:

- `raw/smoke.mp4`: the footage. `install.sh` copies this folder to `projects/smoke/`, runs `prep` (proxy, whisper transcript, contact sheet) and then `render`.
- `edit.json`: stack captions, a hook at the top for the first 3 seconds, the word "embarrassing" punched in the display font, and one big word drawn behind the speaker (which forces the person cutout to run).

Expected output: `projects/smoke/out/smoke.mp4` (1080x1920, about 10.6 s) and a copy in `~/Downloads/Reels/smoke.mp4`. With no fonts in `brand/fonts/`, the render uses the open standins (Archivo and Newsreader) and says so in the log.

To re-run by hand:

```bash
node engine/reel.mjs prep smoke
node engine/reel.mjs render smoke
```
