#!/usr/bin/env node
// Reel Studio CLI. Drop footage in, get a branded reel out.
//   node reel.mjs new <slug> [files...]   create projects/<slug>, move inbox (or given files) into raw/
//   node reel.mjs prep <slug>             proxies (1080x1920, SDR, -14 LUFS), transcripts, contact sheets
//   node reel.mjs render <slug>           edit.json -> plan.json -> MP4 in out/, then check; a passing cut also goes to ~/Downloads/Reels/
//   node reel.mjs check <slug>            the house rules, measured: captions off her face, safe zones, contrast, palette
//   node reel.mjs describe <slug>          what each clip and image shows: the b-roll can only be chosen from these
//   node reel.mjs learn <slug>             turn her resolved review notes into candidate rules (she approves each one)
//   node reel.mjs rules [approve|reject|promote <id>]   the rules she has agreed to, and the ones waiting on her
//   node reel.mjs sheet <slug>            QA contact sheet of the rendered reel
//   node reel.mjs capcut <slug>           write an editable CapCut desktop draft of the same edit
//   node reel.mjs review <slug>           publish this cut to the Reel Review studio
//   node reel.mjs studio                  serve the Reel Review studio (this Mac + phones on the Wi-Fi)
//   node reel.mjs wait [--minutes 120]     /edit: block until she does something on the studio page, print EVENT {json}
//   node reel.mjs words [add|remove] …    My words: names the transcript gets wrong, fixed in every reel
//   node reel.mjs look [use <id>]        starter looks (Editorial, Bold, Soft): list, or make one the default
//   node reel.mjs moments <slug>          every on-screen moment as a numbered still, for her Moments board
//   node reel.mjs preview <slug> <n>      render just moment n as a short clip
//   node reel.mjs looks <slug> <n>        3 other looks for moment n; pick <slug> <n> <a|b|c> swaps one in
//   node reel.mjs cutlist <slug>          Cut first: the cut as numbered lines + a plain preview, before any styling
//   node reel.mjs cutlock <slug> <n,n,…>  keep only these lines (the rest come out of edit.json cuts)
//   node reel.mjs laststyle [<slug>]      Same as last time: the look of the last reel, for READY-TO-CUT
//   node reel.mjs colours <slug> <t>      a still per colour look at t (the studio's Colour panel)
//   node reel.mjs hooks <slug>            a still per hookOptions entry (pick your hook)
//   node reel.mjs clip <slug> <from> <to> render just that window, fast
//   node reel.mjs status <slug> <state> "msg"   /edit: show what the editor is doing on the reel's page
//   node reel.mjs versions <slug>         every cut rendered so far
//   node reel.mjs restore <slug> <n>      put an earlier cut back as the current one
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import {execFileSync, spawnSync} from 'child_process';
import {fileURLToPath} from 'url';
import {propose, printCandidates, printRules, approve, reject, promote, applyRules, readRules} from './lib/learn.mjs';
import {scanAssets, readAssets, setDescription, printAssets, resolveUse} from './lib/assets.mjs';
import {loadVoice, blankVoice, voiceFile, readHistory, noteHistory} from './lib/voice.mjs';
import {menu} from './lib/menu.mjs';
import {ffmpegPath, ffprobePath, ffEnv, h264Args, chromePath, fileUrl, linkDir, whisperCli, whisperModel, toolPath, canCutout, canFaceBox, cutoutWhy, faceWhy, downloadsDir, relPosix} from './lib/platform.mjs';
import {withoutCutout} from './lib/no-cutout.mjs';

// Everything is resolved from where this script lives, so the kit can sit in any folder:
//   <studio>/engine/reel.mjs (this file), <studio>/brand/brand.json + fonts, <studio>/projects, <studio>/inbox
const ENGINE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(ENGINE, '..');
const PROJECTS = path.join(STUDIO, 'projects');
const INBOX = path.join(STUDIO, 'inbox');
const BRAND_DIR = path.join(STUDIO, 'brand');
const BRAND_FILE = path.join(BRAND_DIR, 'brand.json');
const REVIEW_DIR = path.join(STUDIO, 'review');
// Headless browser for contact sheets and stills: Google Chrome if installed, otherwise the
// chrome-headless-shell Remotion downloads on first render (setup.mjs pre-fetches it). See lib/platform.mjs.
const CHROME = chromePath();
function screenshot(args) {
  if (!CHROME) { console.warn('  no headless browser found (install Google Chrome or run: npx remotion browser ensure); skipping contact sheet'); return; }
  spawnSync(CHROME, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', ...args], {stdio: 'ignore'});
}
const VIDEO_EXT = /\.(mov|mp4|m4v|hevc)$/i;
const IMAGE_EXT = /\.(png|jpe?g|heic|webp)$/i;
const AUDIO_EXT = /\.(m4a|mp3|wav|aac)$/i;

const env = ffEnv;
const ff = (args) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {env, stdio: ['ignore', 'pipe', 'inherit']});
const probe = (f) => JSON.parse(execFileSync(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', f], {env}).toString());
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wj = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const log = (...a) => console.log('›', ...a);
const P = (slug, ...p) => path.join(PROJECTS, slug, ...p);

// ---------------- new ----------------
function cmdNew(slug, files) {
  const dir = P(slug);
  for (const d of ['raw', 'proxy', 'analysis', 'assets', 'out']) fs.mkdirSync(path.join(dir, d), {recursive: true});
  // the inbox keeps its own README; only footage, audio and images move out of it
  const src = files.length ? files : fs.existsSync(INBOX)
    ? fs.readdirSync(INBOX).filter((f) => !f.startsWith('.') && (VIDEO_EXT.test(f) || IMAGE_EXT.test(f) || AUDIO_EXT.test(f))).map((f) => path.join(INBOX, f))
    : [];
  for (const f of src) {
    const dest = path.join(dir, IMAGE_EXT.test(f) ? 'assets' : 'raw', path.basename(f).replace(/\s+/g, '_'));
    fs.renameSync(f, dest);
    log('added', path.basename(dest));
  }
  log('project ready:', dir);
}

// ---------------- prep ----------------
function clipId(file) { return path.basename(file).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_'); }

function makeProxy(src, out) {
  const p = probe(src);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const hasAudio = p.streams.some((s) => s.codec_type === 'audio');
  const hdr = v && /arib-std-b67|smpte2084/.test(v.color_transfer || '');
  let w = v.width, h = v.height;
  const rot = Math.abs(parseInt((v.side_data_list || []).find((s) => s.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  const portrait = h >= w;
  const scale = portrait ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920' : 'scale=-2:1080';
  const tone = hdr ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,' : '';
  const args = ['-i', src, '-vf', `${tone}${scale},format=yuv420p`, '-r', '30', ...h264Args(), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  if (hasAudio) args.push('-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k');
  else args.push('-an');
  ff([...args, '-movflags', '+faststart', out]);
  return {hdr, portrait, width: w, height: h, hasAudio, duration: parseFloat(p.format.duration)};
}

// Word timings come from whisper.cpp's DTW alignment: the default token timestamps drift 1-2 s on long takes
// (captions lag, pause trimming clips words). DTW onsets match the waveform.
async function transcribe(video, out) {
  const wav = path.join(os.tmpdir(), `rs-${Date.now()}.wav`);
  ff(['-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  const base = path.join(os.tmpdir(), `rs-dtw-${Date.now()}`);
  execFileSync(whisperCli, ['-m', whisperModel,'-f', wav, '-l', 'en', '-dtw', 'large.v3.turbo', '-ojf', '-of', base, '--no-prints'], {stdio: 'ignore'});
  fs.unlinkSync(wav);
  const d = rj(base + '.json');
  fs.unlinkSync(base + '.json');
  const words = [];
  for (const seg of d.transcription) {
    const segEnd = seg.offsets.to / 1000;
    for (const tk of seg.tokens) {
      if (/^\[_/.test(tk.text) || tk.text === '') continue;
      const ts = (tk.t_dtw ?? tk.offsets.from / 10) / 100;
      const startsWord = /^\s/.test(tk.text) || !words.length;
      if (startsWord) words.push({w: tk.text.trim(), s: ts, e: segEnd});
      else words[words.length - 1].w += tk.text; // continuation token, punctuation
    }
  }
  const clean = words.filter((w) => w.w && !/^\[.*\]$/.test(w.w));
  for (let i = 0; i < clean.length; i++) {
    const next = clean[i + 1];
    clean[i].e = +Math.min(next ? next.s - 0.02 : clean[i].e, clean[i].s + 0.7).toFixed(3);
    clean[i].s = +clean[i].s.toFixed(3);
    if (clean[i].e <= clean[i].s) clean[i].e = +(clean[i].s + 0.08).toFixed(3);
  }
  wj(out, clean);
  return clean;
}

// real pauses (whisper hides them inside word timings)
function detectSilences(file, db = -40, min = 0.22) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', file, '-vn', '-af', `silencedetect=noise=${db}dB:d=${min}`, '-f', 'null', '-'], {env});
  const txt = r.stderr.toString();
  const out = []; let s = null;
  for (const m of txt.matchAll(/silence_(start|end): ([0-9.]+)/g)) {
    if (m[1] === 'start') s = +m[2]; else if (s !== null) { out.push([+s.toFixed(3), +(+m[2]).toFixed(3)]); s = null; }
  }
  return out;
}

// split a cut around internal pauses longer than `min`, keeping `pad` of air each side
function tightenCut(c, silences, min = 0.2, pad = 0.05) {
  const parts = []; let cur = c.in;
  for (const [a, b] of silences) {
    if (b - a < min || a <= c.in || b >= c.out) continue;
    if (a + pad > cur) parts.push({...c, in: +cur.toFixed(3), out: +(a + pad).toFixed(3)});
    cur = Math.max(cur, b - pad);
  }
  if (c.out - cur > 0.05) parts.push({...c, in: +cur.toFixed(3), out: c.out});
  // never leave slivers: a part under 0.35 s is joined to its neighbour (keeping that short pause)
  for (let i = parts.length - 1; i > 0; i--) {
    if (parts[i].out - parts[i].in < 0.35 || parts[i - 1].out - parts[i - 1].in < 0.35) { parts[i - 1].out = parts[i].out; parts.splice(i, 1); }
  }
  // trim leading/trailing silence of the whole cut
  for (const [a, b] of silences) {
    if (a <= parts[0].in + 0.01 && b > parts[0].in && b < parts[0].out) parts[0].in = +(b - pad).toFixed(3);
    const L = parts[parts.length - 1];
    if (b >= L.out - 0.01 && a < L.out && a > L.in) L.out = +(a + pad).toFixed(3);
  }
  return parts;
}

function contactSheet(video, out, every = 1, label = '') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-sheet-'));
  // grab exact timestamps (frame-rate resampling drifts the labels)
  const dur = parseFloat(probe(video).format.duration);
  for (let k = 0, t = 0; t < dur - 0.05; k++, t = k * every) ff(['-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=270:-2', path.join(tmp, `f_${String(k + 1).padStart(4, '0')}.png`)]);
  const frames = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
  const cols = 10;
  const html = `<html><body style="margin:0;background:#111;font:12px -apple-system,'Segoe UI',sans-serif">${label ? `<div style="color:#fff;padding:6px 8px">${label}</div>` : ''}<div style="display:grid;grid-template-columns:repeat(${cols},180px);gap:3px">${frames.map((f, i) => `<div style="position:relative"><img src="${fileUrl(path.join(tmp, f))}" style="width:180px;display:block"><span style="position:absolute;left:2px;top:2px;background:#e33;color:#fff;padding:0 3px">${(i * every).toFixed(0)}s</span></div>`).join('')}</div></body></html>`;
  const hf = path.join(tmp, 'sheet.html');
  fs.writeFileSync(hf, html);
  const rows = Math.ceil(frames.length / cols);
  const landscape = frames.length && fs.statSync(path.join(tmp, frames[0])).size && probe(path.join(tmp, frames[0])).streams[0].width > probe(path.join(tmp, frames[0])).streams[0].height;
  const rowH = landscape ? 104 : 323;
  screenshot([`--window-size=${cols * 183},${rows * rowH + 40}`, `--screenshot=${out}`, fileUrl(hf)]);
  fs.rmSync(tmp, {recursive: true, force: true});
}

// Voice clean-up on this Mac (tools/enhance.py: DeepFilterNet noise + room echo, de-plosive, de-ess),
// then -14 LUFS. The untouched proxy is kept as <id>.orig.mp4 so it can always be undone.
function enhanceAudio(slug, id, proxy, audioOnly) {
  const tool = path.join(ENGINE, 'tools', 'enhance.py');
  if (!fs.existsSync(path.join(ENGINE, 'tools', 'bin', 'deep-filter'))) { log('enhance skipped: tools/bin/deep-filter is missing'); return false; }
  // the clean-up tool is built for Apple-chip Macs and needs numpy: anywhere else, skip it rather than stop prep
  if (process.platform !== 'darwin' || process.arch !== 'arm64') { log('enhance skipped: voice clean-up runs on Apple-chip Macs only for now'); return false; }
  if (spawnSync('python3', ['-c', 'import numpy'], {stdio: 'ignore'}).status !== 0) { log('enhance skipped: python3 has no numpy (pip3 install numpy turns voice clean-up on)'); return false; }
  const orig = proxy.replace(/\.(mp4|m4a)$/, '.orig.$1');
  if (!fs.existsSync(orig)) fs.copyFileSync(proxy, orig);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'enh-'));
  try {
    const wav = path.join(tmp, `${id}.wav`), out = path.join(tmp, `${id}.enh.wav`);
    ff(['-i', orig, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', wav]);
    execFileSync('python3', [tool, wav, out], {stdio: ['ignore', 'pipe', 'inherit']});
    const norm = ['-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k'];
    ff(audioOnly ? ['-i', out, ...norm, proxy] : ['-i', orig, '-i', out, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...norm, '-movflags', '+faststart', proxy]);
    return true;
  } catch (e) { log('enhance skipped: ' + String(e.message || e).split('\n')[0]); try { fs.copyFileSync(orig, proxy); } catch {} return false; }
  finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}

async function cmdPrep(slug) {
  const raw = fs.readdirSync(P(slug, 'raw')).filter((f) => VIDEO_EXT.test(f) || AUDIO_EXT.test(f)).sort();
  const infoFile = P(slug, 'analysis', 'clips.json');
  const info = fs.existsSync(infoFile) ? rj(infoFile) : {};
  for (const f of raw) {
    const id = clipId(f);
    const src = P(slug, 'raw', f);
    const proxy = P(slug, 'proxy', `${id}.${AUDIO_EXT.test(f) ? 'm4a' : 'mp4'}`);
    if (!info[id]) {
      log('proxy', f);
      if (AUDIO_EXT.test(f)) {
        ff(['-i', src, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', proxy]);
        info[id] = {file: f, proxy: relPosix(P(slug), proxy), audioOnly: true, hasAudio: true, duration: parseFloat(probe(src).format.duration)};
      } else {
        info[id] = {file: f, proxy: relPosix(P(slug), proxy), ...makeProxy(src, proxy)};
      }
    }
    const wf = P(slug, 'analysis', `${id}.words.json`);
    if (info[id].hasAudio && !fs.existsSync(wf)) {
      log('transcribe', id);
      const words = await transcribe(proxy, wf);
      info[id].words = words.length;
      info[id].text = words.map((w) => w.w).join(' ');
    }
    // talking clips get the voice clean-up once (brand.json reel.enhance: false turns it off)
    const enhanceOn = (() => { try { return loadBrand().reel.enhance !== false; } catch { return true; } })();
    if (enhanceOn && info[id].hasAudio && !info[id].enhanced && (info[id].words ?? 0) >= 4) {
      log('clean up voice', id);
      if (enhanceAudio(slug, id, proxy, info[id].audioOnly)) { info[id].enhanced = true; wj(infoFile, info); }
    }
    const silf = P(slug, 'analysis', `${id}.silences.json`);
    if (info[id].hasAudio && !fs.existsSync(silf)) wj(silf, detectSilences(proxy));
    const sf = P(slug, 'analysis', `${id}.sheet.png`);
    if (!info[id].audioOnly && !fs.existsSync(sf)) {
      log('sheet', id);
      contactSheet(proxy, sf, info[id].duration > 40 ? 2 : 1, `${id} · ${info[id].duration.toFixed(1)}s${info[id].hdr ? ' · HDR→SDR' : ''}`);
    }
    wj(infoFile, info);
  }
  // readable transcript with timestamps (for writing edit.json)
  const lines = [];
  for (const [id, c] of Object.entries(info)) {
    lines.push(`\n## ${id}  (${c.file}, ${c.duration.toFixed(1)}s${c.portrait === false ? ', LANDSCAPE' : ''}${c.hdr ? ', HDR' : ''})`);
    const wf = P(slug, 'analysis', `${id}.words.json`);
    if (!fs.existsSync(wf)) { lines.push('(no speech)'); continue; }
    const ws = rj(wf);
    let line = [];
    ws.forEach((w, i) => {
      line.push(w);
      const gap = ws[i + 1] ? ws[i + 1].s - w.e : 9;
      if (/[.!?]$/.test(w.w) || gap > 0.6 || line.length > 14) {
        lines.push(`[${line[0].s.toFixed(2)}-${line[line.length - 1].e.toFixed(2)}]${gap > 0.6 && ws[i + 1] ? ` (gap ${gap.toFixed(1)}s)` : ''} ${line.map((x) => x.w).join(' ')}`);
        line = [];
      }
    });
  }
  // spoken editor notes: "note for Claude ...", "Claude note ...", "editor note ..." are pulled out so they are never missed (and never captioned)
  const notes = [];
  for (const [id] of Object.entries(info)) {
    const wf = P(slug, 'analysis', `${id}.words.json`);
    if (!fs.existsSync(wf)) continue;
    const ws = rj(wf);
    const txt = ws.map((w) => w.w).join(' ');
    const re = /(note (?:for|to) claude|claude,? note|editor'?s? note|note for the edit)[,:.]?\s*(.{0,220}?)(?:[.!?](?:\s|$)|$)/gi;
    let m;
    while ((m = re.exec(txt))) {
      const before = txt.slice(0, m.index).split(' ').filter(Boolean).length;
      notes.push(`- ${id} @ ${ws[Math.min(before, ws.length - 1)].s.toFixed(1)}s: ${m[2].trim()}`);
    }
  }
  if (notes.length) lines.unshift('# SPOKEN EDITOR NOTES (cut these lines out of the reel)', ...notes, '');
  fs.writeFileSync(P(slug, 'analysis', 'transcript.md'), lines.join('\n'));
  if (notes.length) log(`found ${notes.length} spoken editor note(s), listed at the top of transcript.md`);
  // Every project gets an assets.json from the start, with one empty line per clip and image. The
  // cut cannot use an asset whose line is still empty, so describing the footage is part of prep
  // rather than something to remember later.
  scanAssets(P, slug, {log});
  log('prep done. Read analysis/transcript.md + analysis/*.sheet.png, then describe the footage and write edit.json');
}

// ---------------- plan ----------------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9'*]/g, '');

// Captions start from the house default and edit.json only says what it wants different. "phrase"
// (a look she moved on from: a lead-in above one huge word, which rides high on the frame and lands
// over her face) is not reachable by a cut that simply did not think about it: it needs
// captions.phraseOK alongside it, or the cut falls back to the house mode and says so.
function houseCaptions(cap) {
  const house = (() => { try { return loadBrand().reel.captions; } catch { return HOUSE.captions; } })();
  let out = {...house, ...(cap ?? {})};
  // Rules she has approved are applied here, before edit.json gets its way, so the next cut starts
  // from what she already told us rather than from the house default she has since corrected.
  const learned = applyRules(STUDIO, out);
  out = learned.captions;
  for (const line of learned.applied) log(line);
  if (out.mode === 'phrase' && !out.phraseOK) {
    log(`captions.mode "phrase" needs "phraseOK": true beside it to be used on purpose; falling back to "${house.mode}"`);
    out.mode = house.mode;
    if (cap?.y === undefined) out.y = house.y;
    if (cap?.size === undefined) out.size = house.size;
  }
  return out;
}

function buildPlan(slug, variant = null) {
  const ed = rj(P(slug, 'edit.json'));
  // Trial Reel variants: same cut, different opening. A variant may swap the hook text/style and/or the first cut(s) (a different spoken hook take).
  if (variant !== null) {
    const v = (ed.hookVariants ?? [])[variant];
    if (!v) throw new Error(`no hookVariants[${variant}] in edit.json`);
    if (v.hook) ed.hook = {...(ed.hook ?? {}), ...v.hook};
    if (v.firstCuts) {
      const drop = v.replaceCuts ?? v.firstCuts.length;
      const shift = v.firstCuts.reduce((a, c) => a + (c.out - c.in), 0) - ed.cuts.slice(0, drop).reduce((a, c) => a + (c.out - c.in), 0);
      ed.cuts = [...v.firstCuts, ...ed.cuts.slice(drop)];
      // effects timed after the opening move with it (approximate: tightening may shift by a few frames)
      for (const f of ed.fx ?? []) if ((f.at ?? f.start) > 2) f.at = +((f.at ?? f.start) + shift).toFixed(3);
      if (ed.end) ed.end.start = +(ed.end.start + shift).toFixed(3);
    }
  }
  const info = rj(P(slug, 'analysis', 'clips.json'));
  const wordsOf = (id) => { const f = P(slug, 'analysis', `${id}.words.json`); return fs.existsSync(f) ? rj(f) : []; };
  const resolveSrc = (ref) => info[ref] ? `p/${slug}/${info[ref].proxy}` : `p/${slug}/${ref}`;
  const segments = []; let words = []; let t = 0;
  // pauses to remove: detected at ed.silenceDb (default -40). Tighter thresholds also catch breaths and hesitations,
  // so any stretch that overlaps a short word (soft words like "air", "tell") is shrunk back to keep the word.
  const silOf = (id) => {
    const db = ed.silenceDb ?? -40;
    const f = P(slug, 'analysis', db === -40 ? `${id}.silences.json` : `${id}.silences${db}.json`);
    if (!fs.existsSync(f)) { const pr = info[id]?.proxy; if (!pr) return []; wj(f, detectSilences(P(slug, pr), db, 0.18)); }
    const ws = wordsOf(id).filter((w) => w.e - w.s < 0.45);
    const out = [];
    for (let [a, b] of rj(f)) {
      for (const w of ws) {
        if (w.e <= a || w.s >= b) continue;
        if (w.s <= a + 0.03) a = Math.max(a, w.e); else b = Math.min(b, w.s);
      }
      if (b - a > 0.12) out.push([a, b]);
    }
    return out;
  };
  const cuts = ed.tighten === false ? ed.cuts : ed.cuts.flatMap((c) => (c.tighten === false ? [c] : tightenCut(c, silOf(c.src), ed.tightenMin ?? 0.2)));
  ed.cuts = cuts;
  // design v2 reframes: a jump cut in the same take becomes a camera move (1.0x, 1.12x, 1.22x on her
  // face), changing at most every 2 seconds so it reads as a new angle rather than a twitch
  const reframe = ed.design === 2 && ed.reframe !== false, LEVELS = [1, 1.12, 1.22];
  let lvl = 0, lastChange = -99, prevSrc = null;
  for (const c of cuts) {
    const dur = +(c.out - c.in).toFixed(3);
    let zoom = c.zoom ?? 1;
    if (reframe && c.zoom === undefined) {
      if (c.src === prevSrc && t - lastChange >= 2) { lvl = (lvl + 1) % LEVELS.length; lastChange = t; }
      else if (c.src !== prevSrc) { lvl = 0; lastChange = t; }
      zoom = LEVELS[lvl];
    }
    prevSrc = c.src;
    segments.push({src: resolveSrc(c.src), start: +t.toFixed(3), dur, srcIn: c.in, zoom, focusY: c.focusY ?? (zoom > 1 ? 0.3 : undefined), focusX: c.focusX, volume: c.volume});
    if (c.captions !== false && (c.volume ?? 1) > 0) {
      for (const w of wordsOf(c.src)) {
        // a word belongs to the part that holds its middle, so words straddling a trimmed pause still caption
        const mid = w.s + 0.06; // DTW gives the word's onset; its "end" can stretch across a pause
        if (mid >= c.in && mid < c.out) words.push({w: w.w, s: +(t + Math.max(0, w.s - c.in)).toFixed(3), e: +(t + Math.min(dur, w.e - c.in)).toFixed(3)});
      }
    }
    t += dur;
  }
  const audio = [];
  for (const a of ed.audioTracks ?? []) {
    const dur = a.out - a.in;
    audio.push({src: resolveSrc(a.src), start: a.at, srcIn: a.in, dur, volume: a.volume ?? 1});
    if (a.captions !== false) for (const w of wordsOf(a.src)) if (w.s >= a.in - 0.05 && w.e <= a.out + 0.12) words.push({w: w.w, s: +(a.at + w.s - a.in).toFixed(3), e: +(a.at + w.e - a.in).toFixed(3)});
  }
  words.sort((a, b) => a.s - b.s);
  // spelling fixes {"kaleb": "Caleb"}
  // My words (brand/words.json) are fixed in every reel; a reel's own fix map wins on a clash
  for (const [from, to] of Object.entries({...myWords().fix, ...(ed.fix ?? {})})) for (const w of words) if (norm(w.w) === norm(from)) w.w = w.w.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), to);
  // emphasis: {"word": "hours", "n": 1, "style": "punch"} or {"phrase": "every piece of content", "style": "italic"} or {"at": 12.4, ...}
  for (const e of ed.emphasis ?? []) {
    if (e.phrase) {
      const ph = e.phrase.split(/\s+/).map(norm);
      let seen = 0;
      for (let i = 0; i <= words.length - ph.length; i++) {
        if (ph.every((p, k) => norm(words[i + k].w) === p) && ++seen === (e.n ?? 1)) { for (let k = 0; k < ph.length; k++) words[i + k].style = e.style; break; }
      }
    } else {
      const hits = words.filter((w) => (e.word ? norm(w.w) === norm(e.word) : Math.abs(w.s - e.at) < 0.15));
      const h = hits[(e.n ?? 1) - 1];
      if (h) h.style = e.style; else console.warn('  emphasis not found:', JSON.stringify(e));
    }
  }
  // italics / script are a brand choice: brands with reel.italics false get the punch colour instead
  if (!loadBrand().reel.italics) for (const w of words) if (w.style === 'italic' || w.style === 'script') w.style = 'yellow';
  const media = (x) => {
    const src = x.clip ? resolveSrc(x.clip) : `p/${slug}/${x.src}`;
    const kind = x.clip ? (info[x.clip]?.audioOnly ? 'image' : 'video') : (VIDEO_EXT.test(x.src) ? 'video' : 'image');
    return {src, kind};
  };
  const inserts = (ed.inserts ?? []).map((x) => ({
    ...media(x), start: x.at, dur: x.dur, pos: x.pos ?? 'top', srcIn: x.in ?? 0, width: x.width, y: x.y, rotate: x.rotate, muted: x.muted, tilt: x.tilt, dim: x.dim,
  }));
  // effects: times in OUTPUT seconds via "at" (or "start"); media via "clip" (a raw clip id) or "src" (assets/...)
  // The DM card used to say "Comment" in the engine, which is how the kit author's call to action
  // reached a buyer who never asks for comments. The verb and the reply line come from their own
  // voice.json unless the cut names them; nothing is inherited.
  {
    const v = loadVoice(STUDIO);
    const verb = v?.ask?.verbs?.[0];
    for (const f of ed.fx ?? []) {
      if (f.type !== 'dm') continue;
      if (f.reply === undefined && v?.ask?.reply) f.reply = v.ask.reply;
      if (f.verb === undefined && verb) f.verb = verb.charAt(0).toUpperCase() + verb.slice(1);
      else if (f.verb === undefined) log('the DM card has no verb and brand/voice.json does not say how they ask, so it falls back to "Comment". Ask them, or set "verb" on the effect.');
    }
  }

  const fx = (ed.fx ?? []).map((f) => {
    const o = {...f, start: f.at ?? f.start};
    if (!loadBrand().reel.italics && ['italic', 'script'].includes(o.font)) o.font = 'serif'; // a no-italics brand gets its upright serif
    delete o.at;
    if (f.clip || (f.src && !['sticker', 'envelope'].includes(f.type))) Object.assign(o, media(f));
    if (f.type === 'envelope' && f.src) o.src = `p/${slug}/${f.src}`;
    if (f.type === 'pops') o.items = f.items.map((it) => ({...it, ...media(it), srcIn: it.in ?? 0}));
    if (f.in !== undefined) o.srcIn = f.in;
    if (f.type === 'sticker') {
      let src = f.src;
      if (f.cut && canCutout()) { // cut the subject out of a photo for the sticker look (Mac only; uncut elsewhere)
        const out = src.replace(/\.[^.]+$/, '.cut.png');
        if (!fs.existsSync(P(slug, out))) execFileSync(toolPath('cutimg'),[P(slug, src), P(slug, out)], {stdio: 'inherit'});
        src = out;
      }
      o.src = `p/${slug}/${src}`;
    }
    if (['wall', 'folder', 'deck', 'orbit', 'polaroids', 'photostrip'].includes(f.type)) o.srcs = f.srcs.map((x) => `p/${slug}/${x}`);
    return o;
  });
  const plan = {
    fps: 30, duration: +(ed.duration ?? t).toFixed(3), segments, audio,
    grade: ed.grade, grades: ed.grades, topFade: ed.topFade, snapBroll: ed.snapBroll, format: ed.format,
    energy: ed.energy ?? loadBrand().reel.energy ?? 'balanced',
    design: ed.design ?? loadBrand().reel.design ?? 1,
    hook: ed.hook, captions: {...houseCaptions(ed.captions), words, breaks: ed.captions?.breakOnCuts === false ? [] : segments.slice(1).filter((s, k) => s.src !== segments[k].src || Math.abs(s.srcIn - (segments[k].srcIn + segments[k].dur)) > 0.05).map((s) => s.start)},
    inserts, fx, labels: ed.labels, checklist: ed.checklist, end: ed.end,
    music: ed.music ? {...ed.music, src: `p/${slug}/${ed.music.src}`} : undefined,
    sfx: (ed.sfx ?? []).map((s) => ({...s, src: `p/${slug}/${s.src}`})),
    drift: ed.drift,
  };
  // everything that puts the subject IN FRONT of something needs them cut out of those frames;
  // where this computer cannot cut them out, those effects get a version that needs no cutout
  const cutoutHere = canCutout();
  if (!cutoutHere) withoutCutout(plan, {log, why: cutoutWhy()});
  const ranges = [];
  if (ed.hook?.mode === 'behind') ranges.push([ed.hook.start ?? 0, Math.min(ed.hook.end, t)]);
  for (const f of fx) {
    if ((f.type === 'browser' && f.subjectFront !== false) || ['orbit', 'uiworld', 'framebreak', 'pullback', 'vertigo', 'paper', 'doodle', 'cover', 'glass', 'wrap', 'haze'].includes(f.type) || (f.type === 'backdrop' && f.subjectFront !== false) || (f.type === 'deck' && f.subjectFront !== false) || (f.type === 'bigword' && f.behind) || f.type === 'colourbg') ranges.push([f.start, Math.min(f.start + f.dur, t)]);
  }
  if (ranges.length && cutoutHere) {
    const key = crypto.createHash('md5').update(JSON.stringify(cuts.map((c) => [c.src, c.in, c.out, c.zoom]))).digest('hex').slice(0, 10);
    const dir = P(slug, 'cutouts', 'tl_' + key);
    fs.mkdirSync(dir, {recursive: true});
    const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => +f.match(/\d+/)[0]));
    for (const [rs, re] of ranges) {
      segments.forEach((seg, i) => {
        const a = Math.max(rs, seg.start), b = Math.min(re, seg.start + seg.dur);
        if (b - a < 1 / 30) return;
        const f0 = Math.round(a * 30), n = Math.round((b - a) * 30);
        let missing = false;
        for (let k = 0; k < n; k++) if (!have.has(f0 + k)) { missing = true; break; }
        if (!missing) return;
        log(`cutting the subject out of ${a.toFixed(1)}–${b.toFixed(1)}s…`);
        const c = cuts[i];
        execFileSync(toolPath('cutout'), [P(slug, info[c.src].proxy), String(c.in + (a - seg.start)), String(b - a), dir, '30', String(f0)], {stdio: ['ignore', 'ignore', 'inherit']});
      });
    }
    plan.cutout = {dir: `p/${slug}/${relPosix(P(slug), dir)}`, frames: fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => +f.match(/\d+/)[0])};
    plan.cutRanges = ranges;
  }
  // ---- described footage ----
  // Every piece of footage or photography this cut puts on screen, with the line being spoken
  // underneath it, matched against what assets.json says the asset shows. resolveUse throws when
  // the cut uses something nobody has described: an asset with no description is not used.
  const MEDIA_FX = ['browser', 'band', 'backdrop', 'deck', 'sticker', 'folder', 'wall', 'orbit', 'phone', 'uiworld', 'envelope', 'cover', 'spotlight'];
  const spokenUnder = (a, b) => words.filter((w) => w.e > a && w.s < b).map((w) => w.w).join(' ');
  const uses = [];
  const useOf = (ref, type, start, dur) => { if (ref) uses.push({ref, type, start: +start, dur: +(dur ?? 0.3), spoken: spokenUnder(start, +start + (+dur || 0.3))}); };
  for (const x of ed.inserts ?? []) useOf(x.clip ?? x.src, 'insert', x.at, x.dur);
  for (const f of ed.fx ?? []) {
    if (!MEDIA_FX.includes(f.type)) continue;
    const at = f.at ?? f.start;
    if (f.srcs) for (const s2 of f.srcs) useOf(s2, f.type, at, f.dur);
    else useOf(f.clip ?? f.src, f.type, at, f.dur);
  }
  const assetRows = resolveUse(P, slug, uses, {log});
  if (assetRows) {
    plan.assets = assetRows;
    const off = assetRows.filter((r) => r.matched === false);
    for (const r of off) log(`b-roll at ${r.start.toFixed(1)}s shows "${r.shows}" while she is saying "${(r.spoken ?? '').slice(0, 60)}": no word in common. Check that it belongs there.`);
  }

  wj(P(slug, 'plan.json'), plan);
  return plan;
}

// ---------------- brand ----------------
// Standins are system fonts on every Mac (mirrors STANDIN in src/brand.ts). No font files ship with the kit.
const STANDIN = {display: {family: 'Avenir Next'}, serif: {family: 'Georgia'}, script: {family: 'Snell Roundhand'}};

// The house style, and the limits the QA check enforces. These are the defaults a cut gets when
// edit.json stays quiet, so the safe, readable look is what you fall into rather than what you
// have to remember. brand.json "reel" overrides any of them.
const HOUSE = {
  captions: {mode: 'stack', size: 60, y: 0.6, maxWords: 5},
  safe: {top: 0.12, bottom: 0.2, iconColumn: 0.86, minCaptionSize: 56, minContrast: 4.5, brightBackground: 0.55, onBrightText: 'ink'},
};

// brand/brand.json -> resolved brand for the renderer. Font files are looked up in brand/fonts/ by the
// filenames in brand.json; a role with any file missing falls back to its standin (and says so) rather than crashing.
let _brand;
// Starter looks (templates/looks/<id>/look.json): a reel can wear one with "look": "<id>" in edit.json,
// or a look can become the default with `node reel.mjs look use <id>`. A look brings its own fonts,
// colours and pace; its font files are copied into brand/fonts the first time they are needed.
const LOOKS_DIR = path.join(STUDIO, 'templates', 'looks');
let _look = null;
function readLook(id) {
  const f = path.join(LOOKS_DIR, id, 'look.json');
  if (!fs.existsSync(f)) throw new Error(`no look called "${id}" (see templates/looks)`);
  const l = rj(f);
  for (const role of Object.values(l.fonts ?? {})) for (const x of role.files ?? []) {
    const dst = path.join(BRAND_DIR, 'fonts', x.file);
    if (!fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), {recursive: true}); fs.copyFileSync(path.join(LOOKS_DIR, 'fonts', x.file), dst); }
  }
  return l;
}
function loadBrand() {
  if (_brand) return _brand;
  if (!fs.existsSync(BRAND_FILE)) throw new Error(`no brand file at ${BRAND_FILE}. Create one (see offer/1-brand-guide-builder.md Part C).`);
  let raw = rj(BRAND_FILE);
  if (_look) { const l = readLook(_look); raw = {...raw, fonts: {...raw.fonts, ...l.fonts}, colours: {...raw.colours, ...l.colours}, reel: {...raw.reel, ...l.reel}}; log(`look: ${l.name}`); }
  const col = raw.colours ?? raw.colors ?? {};
  for (const k of ['punch', 'accent', 'paper', 'ink']) if (!col[k]) throw new Error(`brand.json colours.${k} is missing`);
  const colours = {punch: col.punch, accent: col.accent, paper: col.paper, ink: col.ink, dark: col.dark ?? col.ink, white: col.white ?? '#FFFFFF'};
  const font = (role) => {
    let f = raw.fonts?.[role];
    if (!f) { log(`fonts.${role}: using built-in Mac font ${STANDIN[role].family} (add your own in brand/fonts and brand.json)`); return {family: STANDIN[role].family, faces: [], standin: true}; }
    if (typeof f === 'string') f = {family: path.parse(f).name, files: [{file: f, weight: '100 900'}]};
    const files = (f.files ?? []).map((x) => (typeof x === 'string' ? {file: x, weight: '100 900'} : x));
    const missing = files.filter((x) => !fs.existsSync(path.join(BRAND_DIR, 'fonts', x.file))).map((x) => x.file);
    if (!files.length || missing.length) {
      log(`brand font ${f.family ?? role} not found in brand/fonts (${missing.join(', ') || 'no files listed'}); using standin ${STANDIN[role].family}`);
      return {family: STANDIN[role].family, faces: [], standin: true};
    }
    const out = {family: f.family ?? path.parse(files[0].file).name, faces: files.map((x) => ({url: `fonts/brand/${x.file}`, weight: x.weight ?? '100 900', ...(x.stretch ? {stretch: x.stretch} : {}), ...(x.style ? {style: x.style} : {})}))};
    if (role === 'display' && f.fallbackGlyphs) out.fallbackGlyphs = f.fallbackGlyphs; // opt-in, off by default
    return out;
  };
  const reel = {captions: {...HOUSE.captions, ...(raw.reel?.captions ?? {})}, safe: {...HOUSE.safe, ...(raw.reel?.safe ?? {})}, italics: raw.reel?.italics !== false, energy: raw.reel?.energy ?? 'balanced', enhance: raw.reel?.enhance !== false, design: raw.reel?.design ?? 1, look: raw.reel?.look ?? null, ...(raw.reel?.displayStretch ? {displayStretch: raw.reel.displayStretch} : {})};
  _brand = {name: raw.name, handle: raw.handle, fonts: {display: font('display'), serif: font('serif'), ...(raw.fonts?.script ? {script: font('script')} : {})}, colours, reel};
  // wider fallback for watermarked demo display fonts, only when the optional file is present
  if (_brand.fonts.display.fallbackGlyphs && fs.existsSync(path.join(BRAND_DIR, 'fonts-standin', 'Archivo.woff2'))) _brand.fallbackUrl = 'fonts/Archivo.woff2';
  return _brand;
}

// ---------------- render ----------------
async function stageAndBundle(slug) {
  const {bundle} = await import('@remotion/bundler');
  // stage a lean public dir: fonts + symlink to this project (bundler copies publicDir)
  const stage = path.join(STUDIO, '.stage', slug);
  fs.rmSync(stage, {recursive: true, force: true});
  fs.mkdirSync(path.join(stage, 'p'), {recursive: true});
  fs.mkdirSync(path.join(stage, 'fonts'), {recursive: true});
  if (fs.existsSync(path.join(BRAND_DIR, 'fonts-standin'))) fs.cpSync(path.join(BRAND_DIR, 'fonts-standin'), path.join(stage, 'fonts'), {recursive: true}); // optional demo-font fallback
  if (fs.existsSync(path.join(BRAND_DIR, 'fonts'))) fs.cpSync(path.join(BRAND_DIR, 'fonts'), path.join(stage, 'fonts', 'brand'), {recursive: true});
  const pdir = path.join(stage, 'p', slug);
  fs.mkdirSync(pdir);
  for (const sub of ['proxy', 'assets', 'cutouts']) if (fs.existsSync(P(slug, sub))) linkDir(P(slug, sub), path.join(pdir, sub));
  log('bundling…');
  // every bundle copies the staged footage (~2 GB) into the temp folder; clear stale ones first and
  // delete this one when the command exits, or a day of renders fills the disk
  const tmp = os.tmpdir();
  for (const d of fs.readdirSync(tmp).filter((d) => d.startsWith('remotion-webpack-bundle-'))) {
    try { if (Date.now() - fs.statSync(path.join(tmp, d)).mtimeMs > 2 * 3600e3) fs.rmSync(path.join(tmp, d), {recursive: true, force: true}); } catch {}
  }
  const url = await bundle({entryPoint: path.join(ENGINE, 'src', 'index.ts'), publicDir: stage, onProgress: () => {}});
  process.on('exit', () => { try { fs.rmSync(url, {recursive: true, force: true}); } catch {} });
  return url;
}

// full-res stills at given seconds, side by side, for QA
async function cmdStills(slug, times) {
  let plan = buildPlan(slug);
  const serveUrl = await stageAndBundle(slug);
  plan = await applyLight(slug, plan, serveUrl);
  const {renderStill, selectComposition} = await import('@remotion/renderer');
  const inputProps = {plan, brand: loadBrand()};
  const composition = await selectComposition({serveUrl, id: plan?.format === 'wide' || inputProps?.plan?.format === 'wide' ? 'ReelWide' : 'Reel', inputProps});
  const dir = P(slug, 'out', 'stills'); fs.mkdirSync(dir, {recursive: true});
  const files = [];
  for (const t of times) {
    const f = path.join(dir, `t${t}.png`);
    await renderStill({composition, serveUrl, inputProps, frame: Math.round(+t * 30), output: f, scale: 0.5, ...(process.env.REEL_DEBUG ? {logLevel: 'verbose', onBrowserLog: (l) => console.error('[browser]', l.type, l.text)} : {})});
    files.push(f);
  }
  const html = `<body style="margin:0;background:#000;display:flex;gap:6px">${files.map((f, i) => `<div style="position:relative"><img src="${fileUrl(f)}" style="width:360px"><span style="position:absolute;top:4px;left:4px;background:#e33;color:#fff;font:13px sans-serif;padding:0 4px">${times[i]}s</span></div>`).join('')}</body>`;
  fs.writeFileSync(path.join(dir, 'stills.html'), html);
  screenshot([`--window-size=${times.length * 366},640`, `--screenshot=${path.join(dir, 'stills.png')}`, fileUrl(path.join(dir, 'stills.html'))]);
  log('stills:', path.join(dir, 'stills.png'));
}

// ---------------- My words: names and terms the transcript keeps getting wrong ----------------
//   node reel.mjs words                     list them
//   node reel.mjs words add "Hormoses" "Hormozi"
//   node reel.mjs words remove "Hormoses"
const WORDS_FILE = path.join(STUDIO, 'brand', 'words.json');
function myWords() { try { return {fix: {}, ...JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'))}; } catch { return {fix: {}}; } }
function cmdWords(rest) {
  const w = myWords();
  if (rest[0] === 'add' && rest[1] && rest[2]) { w.fix[rest[1]] = rest[2]; fs.writeFileSync(WORDS_FILE, JSON.stringify(w, null, 1)); log(`saved: "${rest[1]}" is always written "${rest[2]}"`); return; }
  if (rest[0] === 'remove' && rest[1]) { delete w.fix[rest[1]]; fs.writeFileSync(WORDS_FILE, JSON.stringify(w, null, 1)); log(`removed "${rest[1]}"`); return; }
  const e = Object.entries(w.fix);
  log(e.length ? e.map(([a, b]) => `"${a}" → "${b}"`).join('\n') : 'No saved words yet. Add one: node reel.mjs words add "Hormoses" "Hormozi"');
}

// ---------------- Looks ----------------
//   node reel.mjs look                 list the starter looks
//   node reel.mjs look use <id>        make one your default (brand.json is backed up first)
function cmdLook(rest) {
  const ids = fs.existsSync(LOOKS_DIR) ? fs.readdirSync(LOOKS_DIR).filter((d) => fs.existsSync(path.join(LOOKS_DIR, d, 'look.json'))) : [];
  if (rest[0] === 'use' && rest[1]) {
    const l = readLook(rest[1]);
    const b = rj(BRAND_FILE);
    fs.copyFileSync(BRAND_FILE, BRAND_FILE.replace(/\.json$/, `.before-${rest[1]}.json`));
    fs.writeFileSync(BRAND_FILE, JSON.stringify({...b, fonts: {...b.fonts, ...l.fonts}, colours: {...b.colours, ...l.colours}, reel: {...b.reel, ...l.reel, look: l.id}}, null, 2));
    log(`${l.name} is now your default look (your old brand.json is saved beside it)`);
    return;
  }
  log(ids.map((id) => { const l = rj(path.join(LOOKS_DIR, id, 'look.json')); return `${id}: ${l.name}. ${l.blurb}`; }).join('\n') || 'no looks found');
}

// ---------------- Moments: every on-screen moment as a numbered still ----------------
// Before the full render, she sees each moment (hook, every effect, checklist, end) as a still with
// a number, leaves a note on any of them by number, and can preview one moment as a short clip.
//   node reel.mjs moments <slug>          -> out/moments/m01.png… + out/moments/moments.json
//   node reel.mjs preview <slug> <n>      -> out/moments/m01.mp4 (that moment, half size, fast)
function momentList(plan) {
  const ms = [];
  if (plan.hook) ms.push({label: 'Hook: ' + String(plan.hook.text).replace(/\n/g, ' '), s: Math.max(0, plan.hook.start ?? 0), e: plan.hook.end});
  for (const f of plan.fx ?? []) {
    if (['shake', 'flash'].includes(f.type)) continue;
    const name = FX_NAME[f.type] ?? f.type;
    const what = f.text ?? f.keyword ?? (Array.isArray(f.lines) ? f.lines.map((l) => l.t ?? l).join(' ') : '') ?? '';
    ms.push({label: name + (what ? ': ' + String(what).slice(0, 40) : ''), s: f.start, e: f.start + (f.dur ?? 0.6)});
  }
  if (plan.checklist) ms.push({label: 'Checklist', s: plan.checklist.start, e: plan.checklist.end});
  if (plan.end) ms.push({label: 'End card', s: plan.end.start, e: plan.duration});
  ms.sort((a, b) => a.s - b.s);
  // two things landing together are one moment
  const out = [];
  for (const m of ms) { const last = out[out.length - 1]; if (last && m.s - last.s < 0.35) { last.label += ' + ' + m.label; last.e = Math.max(last.e, m.e); } else out.push({...m}); }
  return out.map((m, i) => ({n: i + 1, label: m.label, start: +m.s.toFixed(2), end: +Math.min(m.e, plan.duration).toFixed(2), t: +Math.min(m.s + Math.max(0.35, Math.min(1.2, (m.e - m.s) * 0.55)), plan.duration - 0.05).toFixed(2)}));
}
async function momentsSetup(slug) {
  let plan = buildPlan(slug);
  const serveUrl = await stageAndBundle(slug);
  plan = await applyLight(slug, plan, serveUrl);
  const R = await import('@remotion/renderer');
  const inputProps = {plan, brand: loadBrand()};
  const composition = await R.selectComposition({serveUrl, id: plan.format === 'wide' ? 'ReelWide' : 'Reel', inputProps});
  return {plan, serveUrl, R, inputProps, composition, dir: P(slug, 'out', 'moments')};
}
async function cmdMoments(slug) {
  const {plan, serveUrl, R, inputProps, composition, dir} = await momentsSetup(slug);
  fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const list = momentList(plan);
  for (const m of list) {
    m.img = `m${String(m.n).padStart(2, '0')}.png`;
    await R.renderStill({composition, serveUrl, inputProps, frame: Math.round(m.t * 30), output: path.join(dir, m.img), scale: 0.4});
  }
  fs.writeFileSync(path.join(dir, 'moments.json'), JSON.stringify({slug, duration: plan.duration, at: Date.now(), moments: list}, null, 1));
  log(`moments: ${list.length} (${path.join(dir, 'moments.json')})`);
}
async function cmdPreview(slug, n) {
  const {serveUrl, R, inputProps, composition, dir} = await momentsSetup(slug);
  const mj = JSON.parse(fs.readFileSync(path.join(dir, 'moments.json'), 'utf8'));
  const m = mj.moments.find((x) => x.n === +n);
  if (!m) throw new Error(`no moment ${n}`);
  const from = Math.max(0, Math.round((m.start - 0.6) * 30)), to = Math.min(composition.durationInFrames - 1, Math.round((m.end + 0.6) * 30));
  const out = path.join(dir, `m${String(m.n).padStart(2, '0')}.mp4`);
  await R.renderMedia({composition, serveUrl, codec: 'h264', outputLocation: out, inputProps, frameRange: [from, to], scale: 0.5, crf: 26, concurrency: 6, timeoutInMilliseconds: 120000, chromiumOptions: {gl: 'angle'}});
  m.clip = path.basename(out); fs.writeFileSync(path.join(dir, 'moments.json'), JSON.stringify(mj, null, 1));
  log('preview:', out);
}

// ---------------- Cut first: settle the cut before any styling ----------------
// Optional, per reel. Every cut in edit.json becomes a numbered line with what is said in it, plus a
// quick unstyled preview, so the owner keeps or cuts lines before a single effect goes on.
//   node reel.mjs cutlist <slug>   -> out/cut/cut.json + out/cut/rough.mp4
//   node reel.mjs cutlock <slug> 1,2,4   keep these lines; edit.json is backed up to edit.before-cut.json
function cmdCutlist(slug) {
  const ed = rj(P(slug, 'edit.json'));
  if (!(ed.cuts ?? []).length) throw new Error('edit.json has no cuts yet: write the cut first, then run cutlist');
  const words = {};
  const wordsOf = (id) => (words[id] ??= fs.existsSync(P(slug, 'analysis', `${id}.words.json`)) ? rj(P(slug, 'analysis', `${id}.words.json`)) : []);
  const lines = ed.cuts.map((c, i) => ({n: i + 1, src: c.src, in: c.in, out: c.out,
    text: wordsOf(c.src).filter((w) => w.s >= c.in - 0.05 && w.e <= c.out + 0.05).map((w) => w.w).join(' ').trim() || '(no words)', keep: true}));
  const dir = P(slug, 'out', 'cut'); fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const ins = [], parts = [];
  ed.cuts.forEach((c, i) => {
    const px = [P(slug, 'proxy', `${c.src}.mp4`), P(slug, 'raw', c.src)].find((f) => fs.existsSync(f)) ?? fs.readdirSync(P(slug, 'raw')).map((f) => P(slug, 'raw', f)).find((f) => path.parse(f).name === c.src);
    if (!px) throw new Error(`no footage for ${c.src}`);
    ins.push('-ss', String(c.in), '-to', String(c.out), '-i', px);
    parts.push(`[${i}:v]scale=540:960[v${i}];[${i}:a]aresample=48000,asetpts=PTS-STARTPTS[a${i}]`);
  });
  const cat = ed.cuts.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${ed.cuts.length}:v=1:a=1[v][a]`;
  ff([...ins, '-filter_complex', parts.join(';') + ';' + cat, '-map', '[v]', '-map', '[a]', ...h264Args(), '-b:v', '2M', '-c:a', 'aac', '-b:a', '128k', path.join(dir, 'rough.mp4')]);
  let t = 0; for (const l of lines) { l.at = +t.toFixed(2); t += l.out - l.in; }
  wj(path.join(dir, 'cut.json'), {slug, at: Date.now(), duration: +t.toFixed(2), lines});
  log(`cut first: ${lines.length} lines, ${t.toFixed(1)}s (${path.join(dir, 'cut.json')})`);
}
function cmdCutlock(slug, keepArg) {
  const keep = new Set(String(keepArg ?? '').split(/[,\s]+/).filter(Boolean).map(Number));
  if (!keep.size) throw new Error('say which lines to keep: cutlock <slug> 1,2,4');
  const ed = rj(P(slug, 'edit.json'));
  if (!fs.existsSync(P(slug, 'edit.before-cut.json'))) wj(P(slug, 'edit.before-cut.json'), ed);
  const before = ed.cuts.length;
  ed.cuts = ed.cuts.filter((_, i) => keep.has(i + 1));
  wj(P(slug, 'edit.json'), ed);
  const cf = P(slug, 'out', 'cut', 'cut.json');
  if (fs.existsSync(cf)) { const c = rj(cf); c.lines.forEach((l) => { l.keep = keep.has(l.n); }); c.locked = Date.now(); wj(cf, c); }
  log(`cut locked: kept ${ed.cuts.length} of ${before} lines. Anything timed by seconds (fx, hook, emphasis) needs re-checking against the new cut.`);
}

// ---------------- Same as last time ----------------
// The style picks of the most recent other reel (review/data/jobs), so a tick box can reuse them.
function lastStyle(except) {
  const dir = path.join(DATA_DIR, 'jobs');
  const js = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith('.json')).map((f) => { try { return rj(path.join(dir, f)); } catch { return null; } })
    .filter((j) => j && j.style && j.slug !== except).sort((a, b) => (b.briefedAt ?? b.startedAt ?? 0) - (a.briefedAt ?? a.startedAt ?? 0));
  return js[0] ? {slug: js[0].slug, style: js[0].style} : null;
}

// ---------------- Try another look: 3 alternatives for one moment ----------------
//   node reel.mjs looks <slug> <n>        render 3 other looks for moment n (stills on her Moments board)
//   node reel.mjs pick <slug> <n> <a|b|c> swap that look into edit.json
// Text moments swap between type effects, photo moments between photo layouts, the hook between
// hook styles. Never dark text (her rule): every look uses white or the punch colour.
const LOOK_TEXT = ['bigword', 'wrap', 'stamp', 'glass', 'splitflap', 'scratch', 'burn'];
const LOOK_PHOTO = ['deck:fan', 'deck:wall', 'deck:scatter', 'polaroids', 'photostrip'];
const LOOK_NAME = {bigword: 'Giant word', wrap: 'Headline wrap', haze: 'Blue haze', stamp: 'Stamp', glass: 'Glass type', splitflap: 'Split-flap', scratch: 'Scratch reveal', burn: 'Burning word',
  'deck:fan': 'Photo fan', 'deck:wall': 'Photo wall', 'deck:scatter': 'Scatter', polaroids: 'Polaroids', photostrip: 'Photo strip', bars: 'Highlight bars', top: 'Top line', behind: 'Behind your head'};
function textLook(kind, text, at, dur) {
  const n = Math.max(3, text.length), base = {at, dur};
  const words = text.split(/\s+/).filter(Boolean);
  if (kind === 'bigword') return {...base, type: 'bigword', text, behind: true, y: 0.16, size: Math.round(Math.min(300, 1500 / n * 1.6))};
  if (kind === 'wrap') { const half = Math.ceil(words.length / 2); const lines = words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [text]; return {...base, type: 'wrap', lines, back: 1, accentLines: [lines.length - 1], size: Math.round(Math.min(160, 1500 / Math.max(...lines.map((l) => l.length)) * 1.4)), y: 0.12, drop: 0.3}; }
  if (kind === 'stamp') return {...base, type: 'stamp', text, y: 0.2, size: Math.round(Math.min(150, 1100 / n * 1.4))};
  if (kind === 'glass' || kind === 'scratch') return {...base, type: kind, text, y: 0.14, size: Math.round(Math.min(260, 1250 / n * 1.4))};
  if (kind === 'glass' || kind === 'scratch') return {...base, type: kind, text, y: 0.14, size: Math.round(Math.min(260, 1250 / n * 1.4))};
  return {...base, type: kind, text, y: 0.14};
}
function photoLook(kind, srcs, at, dur) {
  if (kind.startsWith('deck:')) return {type: 'deck', mode: kind.slice(5), srcs, at, dur};
  if (kind === 'polaroids') return {type: 'polaroids', srcs: srcs.slice(0, 4), at, dur};
  return {type: 'photostrip', srcs: srcs.slice(0, 3), at, dur, x: 0.7, y: 0.12};
}
const kindOf = (f) => (f.type === 'deck' ? 'deck:' + (f.mode ?? 'fan') : f.type);
async function cmdLooks(slug, n) {
  const dir = P(slug, 'out', 'moments'), mjf = path.join(dir, 'moments.json');
  const mj = JSON.parse(fs.readFileSync(mjf, 'utf8'));
  const m = mj.moments.find((x) => x.n === +n); if (!m) throw new Error(`no moment ${n}`);
  const editF = P(slug, 'edit.json'), original = fs.readFileSync(editF, 'utf8'), ed = JSON.parse(original);
  let alts = [];
  if (/^Hook/.test(m.label) && ed.hook) {
    alts = ['bars', 'top', 'behind'].filter((k) => k !== (ed.hook.mode ?? 'top')).concat(['bars']).slice(0, 3)
      .map((k) => ({kind: k, hook: {...ed.hook, mode: k, ...(k === 'behind' ? {y: 0.16, size: 170} : k === 'top' ? {y: 0.08, size: 56} : {y: 0.15, size: 60}), ink: false}}));
  } else {
    const idx = (ed.fx ?? []).findIndex((f) => Math.abs((f.at ?? 0) - m.start) < 0.4 && (LOOK_TEXT.includes(kindOf(f)) || LOOK_PHOTO.includes(kindOf(f))));
    if (idx < 0) throw new Error(`moment ${n} (${m.label}) has nothing to swap yet: try a note instead`);
    const f = ed.fx[idx], k = kindOf(f), at = f.at, dur = f.dur ?? 1.6;
    if (LOOK_TEXT.includes(k)) { const text = f.text ?? (f.lines ?? []).join(' '); alts = LOOK_TEXT.filter((x) => x !== k).slice(0, 3).map((kind) => ({kind, idx, fx: textLook(kind, text, at, dur)})); }
    else { const srcs = f.srcs ?? []; alts = LOOK_PHOTO.filter((x) => x !== k).slice(0, 3).map((kind) => ({kind, idx, fx: photoLook(kind, srcs, at, dur)})); }
  }
  const serveUrl = await stageAndBundle(slug);
  const R = await import('@remotion/renderer');
  const looks = [];
  try {
    for (const [i, alt] of alts.entries()) {
      const id = 'abc'[i], e2 = JSON.parse(original);
      if (alt.hook) e2.hook = alt.hook; else e2.fx[alt.idx] = alt.fx;
      fs.writeFileSync(editF, JSON.stringify(e2, null, 1));
      const plan = buildPlan(slug), inputProps = {plan, brand: loadBrand()};
      const composition = await R.selectComposition({serveUrl, id: plan.format === 'wide' ? 'ReelWide' : 'Reel', inputProps});
      const img = `m${String(m.n).padStart(2, '0')}-${id}.png`;
      await R.renderStill({composition, serveUrl, inputProps, frame: Math.round(m.t * 30), output: path.join(dir, img), scale: 0.4});
      looks.push({id, label: LOOK_NAME[alt.kind] ?? alt.kind, img, ...(alt.hook ? {hook: alt.hook} : {idx: alt.idx, fx: alt.fx})});
    }
  } finally { fs.writeFileSync(editF, original); }
  m.looks = looks; mj.at = Date.now();
  fs.writeFileSync(mjf, JSON.stringify(mj, null, 1));
  log(`looks for moment ${n}: ${looks.map((l) => l.id + ' ' + l.label).join(', ')}`);
}
function cmdPick(slug, n, id) {
  const mj = JSON.parse(fs.readFileSync(P(slug, 'out', 'moments', 'moments.json'), 'utf8'));
  const m = mj.moments.find((x) => x.n === +n), l = m?.looks?.find((x) => x.id === id);
  if (!l) throw new Error(`no look ${id} for moment ${n}: run looks first`);
  const editF = P(slug, 'edit.json'), ed = rj(editF);
  if (l.hook) ed.hook = l.hook; else ed.fx[l.idx] = l.fx;
  fs.writeFileSync(editF, JSON.stringify(ed, null, 1));
  log(`moment ${n} is now ${l.label}`);
}

// ---------------- Studio previews: colour looks, hook options, a quick clip ----------------
//   node reel.mjs colours <slug> <t>       one still at t per colour look -> out/colour/<id>.jpg + colours.json
//   node reel.mjs hooks <slug>             one still per edit.json hookOptions -> out/hooks/h1.jpg… + hooks.json
//   node reel.mjs clip <slug> <from> <to>  render just that window, half size -> out/clips/clip.mp4
async function cmdColours(slug, at) {
  const {COLOURS, gradeFor} = await import('./lib/studio-edit.mjs');
  const {plan, serveUrl, R, composition} = await momentsSetup(slug);
  const dir = P(slug, 'out', 'colour'); fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const t = Math.min(Math.max(0, +at || 1), plan.duration - 0.1);
  for (const c of COLOURS) {
    const inputProps = {plan: {...plan, grade: gradeFor(c.id, 1), grades: []}, brand: loadBrand()};
    await R.renderStill({composition: {...composition, props: inputProps}, serveUrl, inputProps, frame: Math.round(t * 30), output: path.join(dir, `${c.id}.jpg`), imageFormat: 'jpeg', scale: 0.35});
  }
  wj(path.join(dir, 'colours.json'), {slug, t, at: Date.now(), looks: COLOURS.map((c) => ({id: c.id, name: c.name, img: `${c.id}.jpg`}))});
  log(`colour looks at ${t.toFixed(1)}s: ${COLOURS.length} stills`);
}
async function cmdHooks(slug) {
  const opts = rj(P(slug, 'edit.json')).hookOptions ?? [];
  if (!opts.length) throw new Error('write three hookOptions into edit.json first');
  const {plan, serveUrl, R, composition} = await momentsSetup(slug);
  if (!plan.hook) throw new Error('edit.json has no hook');
  const dir = P(slug, 'out', 'hooks'); fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const frame = Math.round(Math.min(Math.max(0.6, ((plan.hook.start ?? 0) + plan.hook.end) / 2), plan.hook.end - 0.1) * 30);
  const list = [];
  for (const [i, o] of opts.entries()) {
    const hook = {...plan.hook, ...(typeof o === 'string' ? {text: o} : o)};
    const img = `h${i + 1}.jpg`;
    const inputProps = {plan: {...plan, hook}, brand: loadBrand()};
    await R.renderStill({composition: {...composition, props: inputProps}, serveUrl, inputProps, frame, output: path.join(dir, img), imageFormat: 'jpeg', scale: 0.4});
    list.push({n: i + 1, text: hook.text, img});
  }
  wj(path.join(dir, 'hooks.json'), {slug, at: Date.now(), hooks: list});
  log(`hook options: ${list.length}`);
}
async function cmdClip(slug, from, to) {
  const {serveUrl, R, inputProps, composition} = await momentsSetup(slug);
  const a = Math.max(0, Math.round(+from * 30)), b = Math.min(composition.durationInFrames - 1, Math.round(+to * 30));
  if (!(b > a)) throw new Error('clip: say where it starts and ends');
  const dir = P(slug, 'out', 'clips'); fs.mkdirSync(dir, {recursive: true});
  const out = path.join(dir, 'clip.mp4');
  await R.renderMedia({composition, serveUrl, codec: 'h264', outputLocation: out, inputProps, frameRange: [a, b], scale: 0.5, crf: 26, concurrency: 6, timeoutInMilliseconds: 120000, chromiumOptions: {gl: 'angle'}});
  wj(path.join(dir, 'clip.json'), {slug, from: a / 30, to: b / 30, at: Date.now()});
  log('clip:', out);
}

// ---------------- dark text on bright footage ----------------
// Before the real render, look at the footage behind the hook and the end card and pick the text
// colour that reads there. See lib/light.mjs for why this is measured rather than asked.
// The decision is written back into plan.json, so the QA check judges the cut that was rendered.
async function applyLight(slug, plan, serveUrl) {
  if (plan.format === 'wide') return plan;
  const bigwords = (plan.fx ?? []).filter((f) => f.type === 'bigword' && f.colour === undefined);
  const askHook = plan.hook && plan.hook.ink === undefined;
  const askEnd = plan.end && plan.end.ink === undefined;
  if (!askHook && !askEnd && !bigwords.length) return plan;
  const brand = loadBrand();
  const {decideLight} = await import('./lib/light.mjs');
  const {renderStill, selectComposition} = await import('@remotion/renderer');
  const inputProps = {plan, brand, qa: 'plate'};
  const composition = await selectComposition({serveUrl, id: 'Reel', inputProps});
  const dir = P(slug, 'out', 'light');
  fs.rmSync(dir, {recursive: true, force: true});
  const still = (frame, out) => renderStill({composition, serveUrl, inputProps, frame, output: out, scale: 0.5, imageFormat: 'png'});
  const out = await decideLight(plan, {brand, log, dir, still, fps: plan.fps});
  wj(P(slug, 'plan.json'), out);
  return out;
}

async function cmdRender(slug, opts = {}) {
  let plan = buildPlan(slug, opts.variant ?? null);
  const {renderMedia, selectComposition} = await import('@remotion/renderer');
  const serveUrl = await stageAndBundle(slug);
  plan = await applyLight(slug, plan, serveUrl);
  const inputProps = {plan, brand: loadBrand()};
  const composition = await selectComposition({serveUrl, id: plan?.format === 'wide' || inputProps?.plan?.format === 'wide' ? 'ReelWide' : 'Reel', inputProps});
  const name = `${slug}${opts.variant !== undefined && opts.variant !== null ? `-hook${opts.variant + 1}` : ''}${opts.draft ? '-draft' : ''}`;
  const out = P(slug, 'out', `${name}.mp4`);
  log(`rendering ${plan.duration.toFixed(1)}s…`);
  let last = 0;
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: out, inputProps,
    crf: opts.draft ? 28 : 19, scale: opts.draft ? 0.5 : 1, concurrency: 6, timeoutInMilliseconds: 120000, hardwareAcceleration: 'if-possible',
    audioBitrate: '256k', chromiumOptions: {gl: 'angle'},
    onProgress: ({progress}) => { const p = Math.floor(progress * 10); if (p > last) { last = p; process.stdout.write(`${p * 10}% `); } },
  });
  console.log();
  const sheet = P(slug, 'out', `${name}.sheet.png`);
  contactSheet(out, sheet, 1, `${name} · rendered`);
  // drafts and hook variants are throwaway; a real cut is always kept, pass or fail, so nothing
  // is ever lost and a failing cut can still be looked at
  let keptV = null;
  if (!opts.draft && (opts.variant === undefined || opts.variant === null)) keptV = keepVersion(slug, out, sheet, opts.summary);
  // What this cut opened with, so the next one can open differently. See lib/voice.mjs.
  if (keptV) noteHistory(STUDIO, slug, plan, {v: keptV});
  // The gate. A draft is a look at the cut, so it only gets the checks that need no rendering;
  // a real cut gets the full check, and a failing one never reaches her camera roll.
  // the house checks measure a 1080x1920 Instagram frame (safe zones, icon column); a YouTube 16:9 cut is judged by eye
  const passed = plan.format === 'wide' ? (log('16:9 YouTube cut: the Instagram checks do not apply, look at the sheet'), true) : await cmdCheck(slug, {plan, serveUrl, fast: opts.draft});
  if (passed && !opts.draft) {
    const dl = path.join(downloadsDir(), 'Reels');
    fs.mkdirSync(dl, {recursive: true});
    fs.copyFileSync(out, path.join(dl, `${name}.mp4`));
    log('copied to ~/Downloads/Reels/' + name + '.mp4');
  }
  log('done:', out);
  if (!passed) {
    log('');
    log('This cut breaks a house rule, so it is not ready to send and it was not copied to Downloads.');
    log('Fix the lines above in edit.json and render again. The cut itself is kept either way.');
    process.exitCode = 1;
  }
}

// ---------------- check ----------------
// The QA gate. Renders two cheap QA passes per sampled second (the text alone, and the footage
// alone) and measures the house rules against them. See lib/check.mjs for what is a hard failure
// and why. Returns true when nothing failed.
async function cmdCheck(slug, opts = {}) {
  // Checking on demand checks the cut she has: the plan.json that produced the MP4 in out/, not a
  // fresh one built from a since-edited edit.json. `--rebuild` asks for the latter.
  const planFile = P(slug, 'plan.json');
  let plan = opts.plan ?? (!opts.rebuild && fs.existsSync(planFile) ? rj(planFile) : buildPlan(slug));
  const brand = loadBrand();
  const {check, report} = await import('./lib/check.mjs');
  let still = null;
  if (!opts.fast) {
    const serveUrl = opts.serveUrl ?? (await stageAndBundle(slug));
    // a rebuilt plan has not been through the light pass yet, so the check would judge a hook in a
    // colour the render would not use
    if (!opts.plan) plan = await applyLight(slug, plan, serveUrl);
    const {renderStill, selectComposition} = await import('@remotion/renderer');
    const comps = {};
    for (const qa of ['text', 'plate']) comps[qa] = {inputProps: {plan, brand, qa}, composition: await selectComposition({serveUrl, id: plan?.format === 'wide' ? 'ReelWide' : 'Reel', inputProps: {plan, brand, qa}})};
    still = async (frame, out, qa) => renderStill({...comps[qa], serveUrl, frame, output: out, scale: 0.5, imageFormat: 'png'});
  }
  // the face box is Mac only for now; without it the check measures against fixed safe zones (lib/check.mjs)
  const faceTool = still && canFaceBox() ? toolPath('facebox') : null;
  const res = await check(slug, {P, plan, brand, log, env, studio: STUDIO, ffmpeg: ffmpegPath, faceTool, faceWhy: faceTool ? null : faceWhy(), every: +(opts.every ?? 1)}, {still});
  return report(slug, res, log);
}

// ---------------- versions ----------------
// Nothing is ever overwritten. out/<slug>.mp4 is the latest cut; out/versions/v<n>/ holds that cut's
// MP4 and sheet beside the edit.json and plan.json that produced it, so any earlier cut can come back.
const VFILE = (slug) => P(slug, 'out', 'versions.json');
const readVersions = (slug) => (fs.existsSync(VFILE(slug)) ? rj(VFILE(slug)) : []);
const latestVersion = (slug) => readVersions(slug).at(-1) ?? null;

function keepVersion(slug, mp4, sheet, summary, extra = {}) {
  const list = readVersions(slug);
  const v = (list.at(-1)?.v ?? 0) + 1;
  const dir = P(slug, 'out', 'versions', `v${v}`);
  fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(mp4, path.join(dir, `${slug}.mp4`));
  if (sheet && fs.existsSync(sheet)) fs.copyFileSync(sheet, path.join(dir, `${slug}.sheet.png`));
  for (const f of ['edit.json', 'plan.json']) if (fs.existsSync(P(slug, f))) fs.copyFileSync(P(slug, f), path.join(dir, f));
  list.push({v, at: Date.now(), mp4: `versions/v${v}/${slug}.mp4`, summary: summary ?? null, ...extra});
  wj(VFILE(slug), list);
  log(`kept as version ${v} in out/versions/v${v}/ — no earlier cut was overwritten`);
  return v;
}

function cmdVersions(slug) {
  const list = readVersions(slug);
  if (!list.length) return log(`no versions yet for ${slug}. Render it first.`);
  const notes = reviewNotes(slug);
  for (const x of list) {
    const n = notes.filter((y) => (y.version ?? 1) === x.v);
    const open = n.filter((y) => !y.done).length;
    log(`v${x.v}  ${new Date(x.at).toLocaleString()}  ${x.restoredFrom ? `(v${x.restoredFrom} restored)  ` : ''}${n.length ? `${n.length} note${n.length > 1 ? 's' : ''}${open ? `, ${open} open` : ', all done'}  ` : ''}${x.summary ?? ''}`);
  }
  log(`out/${slug}.mp4 is v${list.at(-1).v}. To go back: node reel.mjs restore ${slug} <n>`);
}

// Put an earlier cut back as the current one. The old files stay where they are; the restored cut is
// recorded as a new version so the history stays in order and the review studio can show it.
function cmdRestore(slug, n) {
  const list = readVersions(slug);
  const want = list.find((x) => x.v === +n);
  if (!want) throw new Error(`${slug} has no version ${n}. Run: node reel.mjs versions ${slug}`);
  const dir = P(slug, 'out', 'versions', `v${want.v}`);
  const mp4 = path.join(dir, `${slug}.mp4`);
  if (!fs.existsSync(mp4)) throw new Error(`v${n}'s MP4 is missing from ${dir}`);
  for (const f of ['edit.json', 'plan.json']) if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), P(slug, f));
  fs.copyFileSync(mp4, P(slug, 'out', `${slug}.mp4`));
  const v = keepVersion(slug, mp4, path.join(dir, `${slug}.sheet.png`), `v${want.v} restored`, {restoredFrom: want.v});
  log(`v${want.v} is current again as v${v}: out/${slug}.mp4 and edit.json are that cut. Run review to put it on the review page.`);
}


// ---------------- review ----------------
// 720p preview (small enough for the Reel Review page) + timeline markers from plan.json
const FX_GROUP = {
  text: ['bigword', 'wrap', 'label', 'counter', 'burn', 'glass', 'cover', 'paper', 'annotate', 'header'],
  media: ['backdrop', 'band', 'deck', 'sticker', 'folder', 'phone', 'orbit', 'wall', 'envelope', 'swatches', 'receipts'],
  ui: ['prompt', 'chat', 'dm', 'comment', 'pills', 'tasks', 'uiworld', 'dropdown', 'dial', 'calendar', 'note', 'spotlight', 'statbars', 'flow', 'chart', 'timeline', 'canvas', 'colourbg'],
  move: ['zoomblur', 'zoomthrough', 'flash', 'rip', 'glitch', 'framebreak', 'pullback', 'vertigo', 'dzoom', 'doodle'],
};
const FX_NAME = {deck: 'Photo cards', sticker: 'Sticker', zoomblur: 'Zoom-blur cut', zoomthrough: 'Zoom-through cut', label: 'Label', bigword: 'Big word', folder: 'Folder', prompt: 'Prompt bar', backdrop: 'Screen behind you', band: 'Stacked shot', chat: 'Chat', pills: 'Approve pop-ups', dm: 'DM card', comment: 'Comment box', counter: 'Counter', colourbg: 'Colour title', rip: 'Paper rip', glitch: 'Glitch cut', flash: 'Light flash', framebreak: 'Frame break', pullback: 'Pull-back', orbit: 'Orbit', phone: 'Phone', tasks: 'Task list', chart: 'Chart', paper: 'Paper cut', doodle: 'Doodle', cover: 'Cover', glass: 'Glass type', header: 'Question bubble', calendar: 'Calendar', dropdown: 'Dropdown', dial: 'Dial', swatches: 'Brand swatches', note: 'Struck-out note', envelope: 'Envelope', canvas: 'Explainer board', spotlight: 'Tool spotlight', statbars: 'Stat bars', flow: 'Flow', timeline: 'Edit timeline', burn: 'Burning word', annotate: 'Annotation', receipts: 'Receipts', uiworld: 'App background', wall: 'Thumbnail wall', vertigo: 'Vertigo', dzoom: 'Snap zoom', wrap: 'Headline wrap', badges: 'Badges', stamp: 'Stamp', rewind: 'VHS rewind', notifs: 'Notifications', post: 'Post card', confetti: 'Confetti', splitflap: 'Split-flap board', scratch: 'Scratch reveal', igpoll: 'Poll', pricetag: 'Price tag', ticker: 'News ticker', wipe: 'Before and after', doc: 'Doc page', polaroids: 'Polaroids', circle: 'Circle', stampcal: 'Stamped calendar', collage: 'Collage title', photostrip: 'Photo strip', curtain: 'Paper curtain', paperslide: 'Paper slide', pageturn: 'Page turn', paperturn: 'Paper flip', phoneme: 'Phone frame', pops: 'Pop-ups', people: 'People'};
const groupOf = (type) => Object.keys(FX_GROUP).find((g) => FX_GROUP[g].includes(type)) ?? 'ui';
// Publish the current cut to the Reel Review studio: a 720p preview the phone can stream, plus the
// timeline (cuts, named effect markers, caption lines) for the version it belongs to.
// review/data/<slug>.json is the reel; review/data/<slug>.notes.json is what the owner writes back.
const DATA_DIR = path.join(REVIEW_DIR, 'data');
const MEDIA_DIR = path.join(REVIEW_DIR, 'media');
const reviewFile = (slug) => path.join(DATA_DIR, `${slug}.json`);
const notesFile = (slug) => path.join(DATA_DIR, `${slug}.notes.json`);
const reviewNotes = (slug) => (fs.existsSync(notesFile(slug)) ? rj(notesFile(slug)) : []);

// cuts, markers and caption lines for one plan: the layers the review timeline draws
function timelineOf(plan) {
  const short = (f) => {
    const t = f.text ?? f.label ?? f.title ?? f.word ?? f.keyword ?? f.name ?? (f.lines ? f.lines.map((l) => l.t ?? l).join(' ') : '') ?? '';
    return String(t).replace(/\n/g, ' ').slice(0, 40);
  };
  const markers = [];
  if (plan.hook) markers.push({t: +Math.max(0, plan.hook.start ?? 0).toFixed(2), d: +(plan.hook.end - Math.max(0, plan.hook.start ?? 0)).toFixed(2), g: 'text', label: 'Hook: ' + plan.hook.text.replace(/\n/g, ' ').slice(0, 40)});
  for (const f of plan.fx ?? []) markers.push({t: +Math.max(0, f.start).toFixed(2), d: +(f.dur ?? 0.3).toFixed(2), g: groupOf(f.type), type: f.type, label: (FX_NAME[f.type] ?? f.type) + (short(f) ? ': ' + short(f) : '')});
  for (const l of plan.labels ?? []) markers.push({t: l.start, d: +(l.end - l.start).toFixed(2), g: 'text', label: 'Label: ' + l.text});
  if (plan.end) markers.push({t: plan.end.start, d: +(plan.duration - plan.end.start).toFixed(2), g: 'text', label: 'End card'});
  markers.sort((a, b) => a.t - b.t);
  const cuts = (plan.segments ?? []).map((x) => +x.start.toFixed(2)).filter((x) => x > 0);
  const captions = [];
  let cur = null;
  for (const w of plan.captions?.words ?? []) {
    if (w.style === 'hide') continue;
    if (!cur || w.s - cur.e > 0.35 || cur.n >= 6 || /[.!?]$/.test(cur.last)) { if (cur) captions.push({t: +cur.t.toFixed(2), d: +(cur.e - cur.t).toFixed(2), label: cur.text}); cur = {t: w.s, e: w.e, text: w.w, n: 1, last: w.w}; }
    else { cur.e = w.e; cur.text += ' ' + w.w; cur.n++; cur.last = w.w; }
  }
  if (cur) captions.push({t: +cur.t.toFixed(2), d: +(cur.e - cur.t).toFixed(2), label: cur.text});
  return {cuts, markers, captions, duration: plan.duration};
}

function cmdReview(slug, opts = {}) {
  const plan = rj(P(slug, 'plan.json'));
  const src = P(slug, 'out', `${slug}.mp4`);
  if (!fs.existsSync(src)) throw new Error(`render ${slug} first: node reel.mjs render ${slug}`);
  const ver = latestVersion(slug);
  if (!ver) throw new Error(`no version recorded for ${slug}. Re-run: node reel.mjs render ${slug}`);
  const v = ver.v;

  fs.mkdirSync(MEDIA_DIR, {recursive: true});
  fs.mkdirSync(DATA_DIR, {recursive: true});
  const prev = path.join(MEDIA_DIR, `${slug}-v${v}.mp4`);
  ff(['-i', src, '-vf', 'scale=720:1280', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', prev]);
  const sizeMB = +(fs.statSync(prev).size / 1e6).toFixed(1);

  const tl = timelineOf(plan);
  const summary = opts.summary ?? ver.summary ?? null;
  const entry = {v, at: ver.at, video: `/media/${slug}-v${v}.mp4`, sizeMB, summary, ...tl};
  // out/<slug>-review.json stays for anyone wiring their own page (see review/PROCEDURE.md)
  wj(P(slug, 'out', `${slug}-review.json`), {slug, version: v, ...entry});

  const doc = fs.existsSync(reviewFile(slug)) ? rj(reviewFile(slug)) : {slug, title: slug.replace(/[-_]/g, ' '), versions: []};
  doc.versions = (doc.versions ?? []).filter((x) => x.v !== v).concat(entry).sort((a, b) => a.v - b.v);
  Object.assign(doc, {version: v, duration: tl.duration, status: 'review', summary, updatedAt: Date.now()});
  wj(reviewFile(slug), doc);
  if (summary) { const l = readVersions(slug); const me = l.find((x) => x.v === v); if (me && !me.summary) { me.summary = summary; wj(VFILE(slug), l); } }

  log(`v${v} on the review page: ${sizeMB} MB preview, ${tl.markers.length} markers, ${tl.cuts.length} cuts${doc.versions.length > 1 ? `, ${doc.versions.length} versions kept` : ''}`);
  log(`start the studio if it is not running: node reel.mjs studio`);
}

// The studio: serve the review page to this Mac and to phones on the same Wi-Fi.
async function cmdStudio(args = []) {
  const i = args.indexOf('--port');
  const port = i >= 0 ? +args[i + 1] : +(process.env.REEL_REVIEW_PORT ?? 7847);
  const {startReviewServer} = await import('./lib/review-server.mjs');
  if (!fs.existsSync(path.join(REVIEW_DIR, 'index.html'))) throw new Error(`review/index.html is missing from ${REVIEW_DIR}`);
  const {lan, port: got, key} = await startReviewServer({studio: STUDIO, port});
  const n = (fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.notes.json')).length : 0);
  log(`Reel Review is running with ${n} reel${n === 1 ? '' : 's'}.`);
  log(`on this Mac:  http://localhost:${got}`);
  if (lan) log(`on your phone (same Wi-Fi), your private link:  http://${lan}:${got}/?k=${key}`);
  else log('no Wi-Fi or network address found, so this Mac only. Join a network and restart to use your phone.');
  log('Leave this running while you review. Press Control-C to stop.');
}

// /edit: the Claude chat that runs Reel Studio waits here for the next thing she does on the page
// (style picked, plan approved or changed, notes sent), prints `EVENT {json}` and exits; the chat
// does the work, reports progress with `status`, then waits again. Keeps review/data/watching.json
// fresh so the page knows the editor is switched on.
async function cmdWait(args = []) {
  const events = path.join(DATA_DIR, 'events'), mark = path.join(DATA_DIR, 'watching.json');
  const until = Date.now() + (+(flagValue(args, '--minutes') ?? 120)) * 60000;
  fs.mkdirSync(events, {recursive: true});
  const beat = () => fs.writeFileSync(mark, JSON.stringify({pid: process.pid, at: Date.now()}));
  const done = () => { try { fs.unlinkSync(mark); } catch {} };
  process.on('SIGTERM', () => { done(); process.exit(0); }); process.on('SIGINT', () => { done(); process.exit(0); });
  while (Date.now() < until) {
    beat();
    const next = fs.readdirSync(events).filter((f) => f.endsWith('.json')).sort()[0];
    if (next) {
      // claim it first: if two editors are listening, only one gets each request
      const f = path.join(events, next), mine = f + '.' + process.pid; let e = null;
      try { fs.renameSync(f, mine); } catch { continue; }
      try { e = JSON.parse(fs.readFileSync(mine, 'utf8')); } catch {}
      try { fs.unlinkSync(mine); } catch {}
      if (e) { console.log('EVENT ' + JSON.stringify(e)); return; }   // watching.json stays: the chat is still on
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  done(); console.log('TIMEOUT');
}

// /edit: what the editor is doing, shown live on the reel's page.
//   node reel.mjs status <slug> working|idle|error "what I am doing"   (--task plan|cut|notes, --new clears the log)
function cmdStatus(slug, rest) {
  const f = path.join(DATA_DIR, 'agents', `${slug}.json`);
  const a = (() => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {log: []}; } })();
  const [state, ...words] = rest.filter((x, i, all) => !x.startsWith('--') && !(i > 0 && all[i - 1] === '--task'));
  if (rest.includes('--new')) a.log = [];
  if (state) a.state = state;
  const task = flagValue(rest, '--task'); if (task) a.task = task;
  const msg = words.join(' ').trim();
  if (msg) a.log = [...(a.log ?? []), {t: Date.now(), msg}].slice(-60);
  if (rest.includes('--new')) a.since = Date.now();
  a.updatedAt = Date.now();
  fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, JSON.stringify(a, null, 2));
}

// ---------------- main ----------------
const flagValue = (args, name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
const [cmd, slug, ...rest] = process.argv.slice(2);
// a reel can wear a starter look for itself (edit.json "look": "editorial")
if (slug && !['look', 'words', 'rules', 'wait'].includes(cmd)) { try { const e = JSON.parse(fs.readFileSync(P(slug, 'edit.json'), 'utf8')); if (e.look) _look = e.look; } catch {} }
if (!cmd) { // the usage block is the run of // lines at the top of this file
  const head = fs.readFileSync(new URL(import.meta.url)).toString().split('\n');
  const end = head.findIndex((l, i) => i > 0 && !l.startsWith('//'));
  console.log(head.slice(1, end).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}
if (cmd === 'new') cmdNew(slug, rest);
else if (cmd === 'prep') await cmdPrep(slug);
else if (cmd === 'plan') { buildPlan(slug); log('plan.json written'); }
else if (cmd === 'render') await cmdRender(slug, {draft: rest.includes('--draft'), summary: flagValue(rest, '--summary')});
else if (cmd === 'variants') { // one file per hookVariants entry, for Trial Reels
  const n = (rj(P(slug, 'edit.json')).hookVariants ?? []).length;
  if (!n) throw new Error('add hookVariants to edit.json first');
  for (let i = 0; i < n; i++) { log(`hook variant ${i + 1}/${n}`); await cmdRender(slug, {variant: i, draft: rest.includes('--draft')}); }
}
else if (cmd === 'menu') {
  const catFile = [path.join(STUDIO, 'library', 'catalog.json'), path.join(STUDIO, 'templates', 'library', 'catalog.json')].find((f) => fs.existsSync(f));
  menu(P, slug, {catalog: catFile ? rj(catFile) : null, voice: loadVoice(STUDIO), history: readHistory(STUDIO), log});
}
else if (cmd === 'voice') {
  const f = voiceFile(STUDIO);
  if (rest[0] === 'init') {
    if (fs.existsSync(f)) log(`brand/voice.json already exists; read it, do not overwrite it`);
    else { wj(f, blankVoice()); log('wrote brand/voice.json with every answer left null. Ask them, one question at a time, and fill it in.'); }
  } else if (!fs.existsSync(f)) log('no brand/voice.json yet. `node reel.mjs voice init` writes the empty one, then ask them the questions in it.');
  else console.log(fs.readFileSync(f, 'utf8'));
}
else if (cmd === 'review') cmdReview(slug, {summary: flagValue(rest, '--summary')});
else if (cmd === 'studio') await cmdStudio([slug, ...rest].filter(Boolean));
else if (cmd === 'wait') await cmdWait([slug, ...rest].filter(Boolean));
else if (cmd === 'status') cmdStatus(slug, rest);
else if (cmd === 'moments') await cmdMoments(slug);
else if (cmd === 'look') cmdLook([slug, ...rest].filter((x) => x !== undefined));
else if (cmd === 'words') cmdWords([slug, ...rest].filter((x) => x !== undefined));
else if (cmd === 'preview') await cmdPreview(slug, rest[0]);
else if (cmd === 'looks') await cmdLooks(slug, rest[0]);
else if (cmd === 'pick') cmdPick(slug, rest[0], rest[1]);
else if (cmd === 'cutlist') cmdCutlist(slug);
else if (cmd === 'colours') await cmdColours(slug, rest[0]);
else if (cmd === 'hooks') await cmdHooks(slug);
else if (cmd === 'clip') await cmdClip(slug, rest[0], rest[1]);
else if (cmd === 'cutlock') cmdCutlock(slug, rest.join(','));
else if (cmd === 'laststyle') { const l = lastStyle(slug); console.log(l ? JSON.stringify(l, null, 1) : 'no earlier reel with a style yet'); }
else if (cmd === 'versions') cmdVersions(slug);
else if (cmd === 'restore') cmdRestore(slug, rest[0]);
else if (cmd === 'stills') await cmdStills(slug, rest);
else if (cmd === 'check') { const ok = await cmdCheck(slug, {every: flagValue(rest, '--every'), fast: rest.includes('--fast'), rebuild: rest.includes('--rebuild')}); if (!ok) process.exitCode = 1; }
else if (cmd === 'describe') {
  const i = rest.indexOf('--set');
  const from = flagValue(rest, '--from');
  if (i >= 0) { const it = setDescription(P, slug, rest[i + 1], rest[i + 2]); log(`${rest[i + 1]}: ${it.shows}`); }
  else if (from) { const m = rj(path.isAbsolute(from) ? from : path.resolve(from)); for (const [id, line] of Object.entries(m)) { setDescription(P, slug, id, line); log(`${id}: ${line}`); } }
  else { scanAssets(P, slug); printAssets(P, slug, log); }
}
else if (cmd === 'learn') {
  // Run when she approves a reel. Prints candidate rules with the note and the frame that produced
  // each one. Writing one down is her call: nothing here changes brand/rules.json beyond "pending".
  printCandidates(propose(slug, {studio: STUDIO, P, log}), log);
  const cue = P(slug, 'LEARN-FROM-THIS.md');
  if (fs.existsSync(cue)) fs.rmSync(cue);
}
else if (cmd === 'rules') {
  const [sub, id, ...why] = [slug, ...rest];
  if (!sub || sub === 'list') printRules(STUDIO, log);
  else if (sub === 'approve') { const r = approve(STUDIO, id); log(`written down: ${r.label} — ${r.then}`); log(`  ${r.when}`); log(r.check ? `  It can be measured, so once this correction happens on a second reel it can become a check: node reel.mjs rules promote ${r.id}` : `  It cannot be measured: ${r.cannot}`); }
  else if (sub === 'reject') { const c = reject(STUDIO, id, why.join(' ') || null); log(`no to "${c.label}". Remembered as a no, so it is never proposed again.`); }
  else if (sub === 'promote') { const r = promote(STUDIO, id); log(`"${r.label}" is now a check, not prose. A cut that breaks it is held back.`); log(`  promoted after the same correction on: ${r.enforcedAfter.join(', ')}`); }
  else log(`unknown: rules ${sub}. Use: rules | rules approve <id> | rules reject <id> "why" | rules promote <id>`);
}
else if (cmd === 'sheet') contactSheet(P(slug, 'out', `${slug}.mp4`), P(slug, 'out', `${slug}.sheet.png`), 1, slug);
else if (cmd === 'capcut') {
  const plan = buildPlan(slug);
  const {renderMedia, selectComposition} = await import('@remotion/renderer');
  const serveUrl = await stageAndBundle(slug);
  const inputProps = {plan, brand: loadBrand(), overlayOnly: true};
  const composition = await selectComposition({serveUrl, id: plan?.format === 'wide' || inputProps?.plan?.format === 'wide' ? 'ReelWide' : 'Reel', inputProps});
  const overlayFile = P(slug, 'out', `${slug}-graphics.mov`);
  log('rendering transparent graphics layer…');
  await renderMedia({composition, serveUrl, inputProps, codec: 'prores', proResProfile: '4444', imageFormat: 'png', pixelFormat: 'yuva444p10le', muted: true, outputLocation: overlayFile, concurrency: 6});
  const {exportCapCut} = await import('./lib/capcut.mjs');
  await exportCapCut(slug, plan, {P, info: rj(P(slug, 'analysis', 'clips.json')), overlayFile});
}
else console.log('unknown command', cmd);
