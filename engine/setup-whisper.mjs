// Gets whisper.cpp 1.7.6 next to this file and fetches the large-v3-turbo model.
// Run from anywhere: node engine/setup-whisper.mjs
//   macOS:   clones and builds from source with Metal (needs the Xcode command line tools + cmake)
//   Windows: downloads the prebuilt x64 release (CPU) and unpacks it into whisper.cpp/build/bin,
//            the same place the Mac build puts whisper-cli, so the engine finds it in one place
// The model (1.5 GB) is downloaded with resume, so an interrupted download picks up where it stopped.
import {installWhisperCpp} from '@remotion/install-whisper-cpp';
import fs from 'fs';
import path from 'path';
import {spawnSync} from 'child_process';
import {isWin, whisperDir as to, whisperCli, whisperModel as modelFile, WHISPER_VERSION, WHISPER_MODEL as MODEL} from './lib/platform.mjs';

const MODEL_BYTES = 1624555275; // ggml-large-v3-turbo.bin on huggingface.co/ggerganov/whisper.cpp
const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin`;

if (fs.existsSync(whisperCli)) console.log('whisper.cpp already installed');
else if (isWin) await installWindows();
else {
  // A half-built folder makes installWhisperCpp refuse, so start it over, keeping a downloaded model.
  const keep = path.join(path.dirname(to), `.ggml-${MODEL}.bin.keep`);
  if (fs.existsSync(modelFile)) fs.renameSync(modelFile, keep);
  fs.rmSync(to, {recursive: true, force: true});
  await installWhisperCpp({to, version: WHISPER_VERSION});
  if (fs.existsSync(keep)) fs.renameSync(keep, modelFile);
}

// The release zip holds Release/whisper-cli.exe and its DLLs. Unpacked with Windows' own tar
// (built in since Windows 10 1803), then moved to build/bin.
async function installWindows() {
  const zipUrl = `https://github.com/ggerganov/whisper.cpp/releases/download/v${WHISPER_VERSION}/whisper-bin-x64.zip`;
  const zip = path.join(path.dirname(to), 'whisper-bin-x64.zip');
  const bin = path.dirname(whisperCli);
  console.log(`downloading whisper.cpp ${WHISPER_VERSION} for Windows (about 4 MB)…`);
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`could not download ${zipUrl} (HTTP ${res.status})`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const tmp = path.join(to, '_unzip');
  fs.rmSync(tmp, {recursive: true, force: true});
  fs.mkdirSync(tmp, {recursive: true});
  let r = spawnSync('tar', ['-xf', zip, '-C', tmp], {stdio: 'inherit'});
  if (r.status !== 0) r = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${tmp}'`], {stdio: 'inherit'});
  if (r.status !== 0) throw new Error('could not unpack the whisper.cpp zip');
  const from = fs.existsSync(path.join(tmp, 'Release')) ? path.join(tmp, 'Release') : tmp;
  fs.mkdirSync(bin, {recursive: true});
  for (const f of fs.readdirSync(from)) fs.renameSync(path.join(from, f), path.join(bin, f));
  fs.rmSync(tmp, {recursive: true, force: true});
  fs.rmSync(zip, {force: true});
  if (!fs.existsSync(whisperCli)) throw new Error(`whisper-cli.exe is not in the zip from ${zipUrl}; the release layout may have changed`);
  console.log('whisper.cpp unpacked to', bin);
}

// ---- model ----
const size = () => (fs.existsSync(modelFile) ? fs.statSync(modelFile).size : 0);
if (size() === MODEL_BYTES) {
  console.log('model already present');
} else {
  if (size() > MODEL_BYTES) fs.unlinkSync(modelFile); // corrupt, start over
  fs.mkdirSync(to, {recursive: true});
  for (let attempt = 1; attempt <= 6 && size() !== MODEL_BYTES; attempt++) {
    console.log(`downloading ${MODEL} model (${(MODEL_BYTES / 1e9).toFixed(2)} GB)${size() ? `, resuming from ${(size() / 1e6).toFixed(0)} MB` : ''}${attempt > 1 ? ` (attempt ${attempt})` : ''}…`);
    try { await download(url, modelFile); } catch (e) { console.log(`  download interrupted (${e.message}); retrying…`); await new Promise((r) => setTimeout(r, 5000)); }
  }
  if (size() !== MODEL_BYTES) { console.error(`model download failed (${size()} of ${MODEL_BYTES} bytes). Check your connection and run setup again; it resumes.`); process.exit(1); }
}
console.log('whisper ready');

// Resuming download with Node's own fetch (no curl needed). Prints a progress line every 5%.
async function download(from, file) {
  const have = size();
  const res = await fetch(from, {headers: have ? {Range: `bytes=${have}-`} : {}, redirect: 'follow'});
  if (have && res.status === 200) fs.truncateSync(file, 0); // server ignored the range: start over
  else if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = fs.createWriteStream(file, {flags: res.status === 206 ? 'a' : 'w'});
  let got = res.status === 206 ? have : 0, shown = -1;
  for await (const chunk of res.body) {
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    got += chunk.length;
    const pct = Math.floor((got / MODEL_BYTES) * 20);
    if (pct !== shown) { shown = pct; process.stdout.write(`  ${pct * 5}%\r`); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  process.stdout.write('\n');
}
