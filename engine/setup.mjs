#!/usr/bin/env node
// Reel Studio setup, for macOS and Windows 10/11 (x64). Safe to run again: every step that is
// already done is skipped.
//
//   node engine/setup.mjs              install everything, then a smoke test render
//   node engine/setup.mjs --no-smoke   install only
//   node engine/setup.mjs doctor       change nothing; check every requirement and say how to fix each one
//
// What it does, in order:
//   1. checks the computer: macOS or Windows 10/11 x64, Node 20+, disk space, a sensible folder
//   2. macOS only: Xcode command line tools (for the person cutout) and cmake (for whisper.cpp)
//   3. npm ci                      Remotion and friends (~550 MB)
//   4. whisper.cpp + large-v3-turbo model (macOS builds it with Metal; Windows gets the prebuilt release)
//   5. headless Chrome for Remotion (~185 MB)
//   6. macOS only: compiles tools/cutout, cutimg, facebox (Apple Vision person cutout and face box)
//   7. Python packages for the music tools, when Python is installed (optional)
//   8. brand fonts: says which brand fonts are found and which fall back to standins
//   9. health check, then renders examples/smoke -> projects/smoke/out/smoke.mp4
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawnSync} from 'child_process';
import {ENGINE, isMac, isWin, osName, ffmpegPath, ffEnv, chromePath, whisperCli, whisperModel, toolPath, canCutout} from './lib/platform.mjs';

const STUDIO = path.resolve(ENGINE, '..');
const args = process.argv.slice(2);
const DOCTOR = args.includes('doctor') || args.includes('--doctor');
const NO_SMOKE = args.includes('--no-smoke');
const T0 = Date.now();
const MODEL_BYTES = 1624555275;

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const bold = (s) => console.log(`\n${tty ? '\x1b[1m' : ''}${s}${tty ? '\x1b[0m' : ''}`);
const ok = (s) => console.log(`  ✓ ${s}`);
const info = (s) => console.log(`  · ${s}`);
const problems = [];
// A problem: what is wrong, and the plain-English fix. `hard` stops the install.
function bad(what, fix, {hard = true} = {}) {
  problems.push({what, fix, hard});
  console.log(`  ${hard ? '✗' : '!'} ${what}`);
  for (const l of fix.split('\n')) console.log(`      ${l}`);
  if (hard && !DOCTOR) { console.log(`\n${tty ? '\x1b[31m' : ''}Setup stopped here. Fix the line above and run it again; it carries on where it stopped.${tty ? '\x1b[0m' : ''}`); process.exit(1); }
}
const elapsed = () => info(`(${Math.round((Date.now() - T0) / 1000)}s so far)`);
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, {stdio: 'inherit', shell: isWin && /^(npm|npx)$/.test(cmd), ...opts});
const quiet = (cmd, a, opts = {}) => spawnSync(cmd, a, {encoding: 'utf8', shell: isWin && /^(npm|npx)$/.test(cmd), timeout: 60000, ...opts});
const has = (cmd) => { const r = quiet(isWin ? 'where' : 'which', [cmd]); return r.status === 0; };
// Windows reports a missing DLL (usually the Visual C++ runtime) as this exit code
const DLL_MISSING = 3221225781; // 0xC0000135
const vcFix = 'Install the Microsoft Visual C++ Redistributable (x64) from https://aka.ms/vs/17/release/vc_redist.x64.exe, restart, and run this again.';

bold(DOCTOR ? 'Reel Studio doctor (checks only, changes nothing)' : 'Reel Studio setup');
info(`studio folder: ${STUDIO}`);

// ---------------- 1. the computer ----------------
bold('1. This computer');
const winArch = (process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE || '').toUpperCase();
if (isMac) {
  const v = quiet('sw_vers', ['-productVersion']).stdout?.trim();
  ok(`macOS ${v ?? ''} on ${process.arch === 'arm64' ? 'Apple silicon' : 'Intel'}`);
} else if (isWin) {
  const build = +os.release().split('.')[2];
  if (winArch === 'ARM64' || process.arch === 'arm64') bad('This is Windows on Arm.', 'Reel Studio needs an x64 (Intel or AMD) Windows 10 or 11 PC. The video renderer has no Arm build for Windows yet.');
  else if (build && build < 17763) bad(`Windows build ${build} is older than Windows 10 version 1809.`, 'Run Windows Update until you are on Windows 10 (version 1809 or later) or Windows 11, then run this again.');
  else ok(`Windows ${build >= 22000 ? '11' : '10'} (build ${build}) x64`);
} else {
  bad(`This is ${osName}.`, 'Reel Studio supports macOS and Windows 10/11 on x64. Chromebooks and Linux are not supported.', {hard: false});
}

const nodeMajor = +process.versions.node.split('.')[0];
if (nodeMajor < 20) bad(`Node ${process.version} is too old.`, 'Install the LTS version of Node.js from https://nodejs.org (20 or newer), open a new terminal window, and run this again.');
else ok(`Node ${process.version}`);

try {
  const st = fs.statfsSync(STUDIO);
  const freeGB = (st.bavail * st.bsize) / 1e9;
  const need = fs.existsSync(path.join(ENGINE, 'node_modules', 'remotion')) && fs.existsSync(whisperModel) ? 2 : 5;
  if (freeGB < need) bad(`Only ${freeGB.toFixed(1)} GB free on this drive.`, `Setup needs about 4 GB, and each reel project uses 1 to 3 GB more. Free up at least ${need} GB and run this again.`);
  else ok(`${freeGB.toFixed(0)} GB free`);
} catch { info('could not read free disk space; you need about 4 GB'); }

// Cloud-synced folders fight the engine: thousands of small files in node_modules, frame folders
// rewritten on every render, and files that are only "online" when a render needs them.
const lower = STUDIO.toLowerCase();
const oneDrive = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(Boolean).map((p) => p.toLowerCase());
if (oneDrive.some((p) => lower.startsWith(p)) || /[\\/]onedrive[\\/ -]/i.test(STUDIO)) {
  bad('The studio folder is inside OneDrive.', `Move the whole Reel Studio folder somewhere OneDrive does not sync, for example ${isWin ? 'C:\\ReelStudio' : '~/ReelStudio'}, then run setup from there.`, {hard: !DOCTOR && !args.includes('--allow-cloud')});
} else if (/Mobile Documents|CloudStorage|Dropbox|Google Drive/i.test(STUDIO)) {
  bad('The studio folder is inside a cloud-synced folder.', 'Move the Reel Studio folder somewhere that is not synced (your home folder is fine), then run setup from there.', {hard: false});
} else ok('folder is not cloud-synced');
if (isWin && STUDIO.length > 90) bad('The studio folder path is very long.', 'Windows struggles with long paths inside node_modules. Move the folder closer to the drive root, for example C:\\ReelStudio.', {hard: false});

// ---------------- 2. macOS build tools ----------------
let cmakeOk = true;
if (isMac) {
  bold('2. Mac build tools');
  const clt = quiet('xcode-select', ['-p']).status === 0 && has('swiftc');
  if (!clt) bad('Xcode command line tools are missing.', 'Run this in Terminal:  xcode-select --install\nA window opens; click Install (about 2 GB, 5 to 15 minutes). Then run setup again.');
  else if (quiet('swiftc', ['-version']).status !== 0) bad('swiftc is installed but will not run.', 'Run:  sudo xcode-select --switch /Library/Developer/CommandLineTools\n(or, with full Xcode installed: sudo xcodebuild -license accept), then run setup again.');
  else ok('Xcode command line tools');
  for (const t of ['git', 'make', 'python3']) if (!has(t)) bad(`${t} not found.`, 'It comes with the Xcode command line tools: xcode-select --install');
  // whisper.cpp needs cmake to build; a private copy goes in engine/.cmake-venv if there is none
  if (!fs.existsSync(whisperCli)) {
    const venv = path.join(ENGINE, '.cmake-venv', 'bin');
    if (has('cmake')) ok('cmake');
    else if (fs.existsSync(path.join(venv, 'cmake'))) { process.env.PATH = `${venv}:${process.env.PATH}`; ok('cmake (private copy)'); }
    else if (DOCTOR) { cmakeOk = false; bad('cmake is missing (needed once, to build whisper.cpp).', 'Setup installs a private copy for you. Or: brew install cmake', {hard: false}); }
    else {
      info('cmake not found; installing a private copy with pip (about 50 MB)…');
      if (run('python3', ['-m', 'venv', path.join(ENGINE, '.cmake-venv')]).status !== 0 || run(path.join(venv, 'pip'), ['install', '--quiet', '--disable-pip-version-check', 'cmake']).status !== 0) {
        bad('Could not install cmake.', 'Install it another way (brew install cmake) and run setup again.');
      }
      process.env.PATH = `${venv}:${process.env.PATH}`;
      ok('cmake (private copy)');
    }
  }
} else {
  bold('2. Build tools');
  ok(`none needed on ${osName}`);
}

// ---------------- 3. Node packages ----------------
bold('3. Node packages (Remotion)');
const npmOk = () => fs.existsSync(path.join(ENGINE, 'node_modules', 'remotion')) && fs.existsSync(path.join(ENGINE, 'node_modules', '@remotion', 'renderer')) && fs.existsSync(ffmpegPath);
if (npmOk()) ok('installed');
else if (DOCTOR) bad('Node packages are not installed (or not for this computer).', 'Run setup:  node engine/setup.mjs');
else {
  // a node_modules copied from another computer has the wrong renderer in it
  if (fs.existsSync(path.join(ENGINE, 'node_modules')) && !fs.existsSync(ffmpegPath)) info('node_modules is from another kind of computer; reinstalling for this one');
  info('npm ci (about 550 MB, 1 to 3 minutes)…');
  if (run('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], {cwd: ENGINE}).status !== 0 || !npmOk()) bad('npm ci failed.', 'Check your internet connection and run setup again.');
  ok('installed');
  elapsed();
}

// ---------------- 4. whisper ----------------
bold('4. Speech to text (whisper.cpp + large-v3-turbo model)');
const modelOk = () => fs.existsSync(whisperModel) && fs.statSync(whisperModel).size === MODEL_BYTES;
if (fs.existsSync(whisperCli) && modelOk()) ok('installed, model present');
else if (DOCTOR) bad(fs.existsSync(whisperCli) ? 'The speech model is missing or only part downloaded.' : 'whisper.cpp is not installed.', 'Run setup:  node engine/setup.mjs  (the 1.5 GB model download resumes if it stops)');
else {
  info(isMac ? 'building whisper.cpp with Metal (2 to 5 minutes), then the model (1.5 GB)…' : 'downloading whisper.cpp for Windows, then the model (1.5 GB)…');
  if (run(process.execPath, [path.join(ENGINE, 'setup-whisper.mjs')], {cwd: ENGINE}).status !== 0) bad('whisper setup did not finish.', 'Run setup again; it resumes where it stopped.');
  ok('whisper ready');
  elapsed();
}

// ---------------- 5. headless Chrome ----------------
bold('5. Headless Chrome (renders the graphics)');
const shellDir = path.join(ENGINE, 'node_modules', '.remotion', 'chrome-headless-shell');
const shellOk = () => fs.existsSync(shellDir) && fs.readdirSync(shellDir).some((d) => fs.statSync(path.join(shellDir, d)).isDirectory());
if (shellOk()) ok('downloaded');
else if (DOCTOR) bad('Headless Chrome is not downloaded.', 'Run setup:  node engine/setup.mjs');
else {
  info('downloading (about 185 MB)…');
  if (run('npx', ['remotion', 'browser', 'ensure'], {cwd: ENGINE, stdio: 'ignore'}).status !== 0 && run('npx', ['remotion', 'browser', 'ensure'], {cwd: ENGINE}).status !== 0) bad('Could not download headless Chrome.', 'Check your internet connection and run setup again.');
  ok('downloaded');
}

// ---------------- 6. person cutout (Mac only for now) ----------------
bold('6. Person cutout and face box');
if (isMac) {
  for (const t of ['cutout', 'cutimg', 'facebox']) {
    const bin = toolPath(t);
    if (fs.existsSync(bin) && fs.statSync(bin).mtimeMs >= fs.statSync(bin + '.swift').mtimeMs) { ok(`tools/${t}`); continue; }
    if (DOCTOR) { bad(`tools/${t} is not built.`, 'Run setup:  node engine/setup.mjs', {hard: false}); continue; }
    info(`compiling tools/${t}.swift…`);
    if (run('swiftc', ['-O', bin + '.swift', '-o', bin]).status !== 0) bad(`swiftc failed on tools/${t}.swift.`, 'Check the Xcode command line tools (step 2) and run setup again.');
    ok(`tools/${t}`);
  }
} else {
  info(`Mac only for now. On ${osName} the effects that put you in front of graphics are drawn in front of you instead,`);
  info('and the quality check uses fixed safe zones instead of finding your face. See templates/WINDOWS.md.');
}

// ---------------- 7. Python for the music tools (optional) ----------------
bold('7. Music tools (optional, needs Python 3)');
const pyTools = fs.existsSync(path.join(ENGINE, 'tools')) && fs.readdirSync(path.join(ENGINE, 'tools')).some((f) => f.endsWith('.py'));
// On Windows "python" can be the Microsoft Store stub, which runs but is not Python; "py" is the real launcher.
const pyCmd = (isWin ? [['py', ['-3']], ['python', []]] : [['python3', []]]).find(([c, a]) => quiet(c, [...a, '-c', 'import sys; assert sys.version_info >= (3, 8)']).status === 0);
if (!pyTools) info('no music tools in this kit');
else if (!pyCmd) bad('Python 3 is not installed, so the music picker and audition tools will not run.', `Reels render without it. To use the music tools, install Python 3 from https://www.python.org/downloads/${isWin ? ' (tick "Add python.exe to PATH")' : ''} and run setup again.`, {hard: false});
else {
  const [py, pa] = pyCmd;
  if (quiet(py, [...pa, '-c', 'import numpy']).status === 0) ok('Python 3 with numpy');
  else if (DOCTOR) bad('numpy is missing (the music tools need it).', `Run:  ${py} ${pa.join(' ')} -m pip install --user numpy`.replace(/ +/g, ' '), {hard: false});
  else {
    info('installing numpy for the music tools…');
    if (run(py, [...pa, '-m', 'pip', 'install', '--user', '--quiet', '--disable-pip-version-check', 'numpy']).status === 0) ok('numpy installed');
    else bad('Could not install numpy.', `Reels still render. For the music tools run:  ${py} ${pa.join(' ')} -m pip install --user numpy`.replace(/ +/g, ' '), {hard: false});
  }
}

// ---------------- 8. brand fonts ----------------
bold('8. Brand fonts');
const brandFile = path.join(STUDIO, 'brand', 'brand.json');
if (!fs.existsSync(brandFile)) info('no brand/brand.json yet; reels use the built-in standin fonts until you add one');
else {
  let brand = null;
  try { brand = JSON.parse(fs.readFileSync(brandFile, 'utf8')); } catch (e) { bad('brand/brand.json is not valid JSON.', `Open it in a text editor and fix: ${e.message}`, {hard: false}); }
  for (const role of ['display', 'serif', 'script']) {
    let f = brand?.fonts?.[role];
    if (!f) { if (role !== 'script' && brand) info(`${role}: none set, the standin is used`); continue; }
    if (typeof f === 'string') f = {family: path.parse(f).name, files: [f]};
    const files = (f.files ?? []).map((x) => (typeof x === 'string' ? x : x.file));
    const missing = files.filter((x) => !fs.existsSync(path.join(STUDIO, 'brand', 'fonts', x)));
    if (files.length && !missing.length) ok(`${role}: ${f.family ?? files[0]}`);
    else bad(`${role} font ${f.family ?? ''}: ${missing.join(', ') || 'no files listed'} not in brand/fonts.`, 'Copy the font files into the brand/fonts folder with exactly these names. Until then the standin font is used.', {hard: false});
  }
}

// ---------------- 9. health check ----------------
bold('9. Health check');
const ffr = fs.existsSync(ffmpegPath) ? spawnSync(ffmpegPath, ['-hide_banner', '-version'], {env: ffEnv, encoding: 'utf8'}) : null;
if (!ffr) bad('ffmpeg is missing from the Remotion packages.', 'Run setup:  node engine/setup.mjs');
else if (ffr.status === DLL_MISSING) bad('ffmpeg will not start: a Windows system library is missing.', vcFix);
else if (ffr.status !== 0) bad(`ffmpeg will not start (${ffr.error?.message ?? `exit ${ffr.status}`}).`, 'Delete engine/node_modules and run setup again.');
else ok('ffmpeg runs');
if (fs.existsSync(whisperCli)) {
  const w = spawnSync(whisperCli, ['--help'], {encoding: 'utf8', timeout: 30000});
  if (w.status === DLL_MISSING) bad('whisper will not start: a Windows system library is missing.', vcFix);
  else if (w.error) bad(`whisper will not start (${w.error.message}).`, 'Delete the engine/whisper.cpp folder (keep the .bin model file if you want to skip the big download) and run setup again.');
  else ok('whisper runs');
}
const chrome = chromePath();
if (chrome) ok(`headless browser: ${path.basename(chrome)}`);
else bad('No browser for contact sheets and stills.', 'Run setup again, or install Google Chrome.', {hard: false});
ok(`person cutout: ${canCutout() ? 'on' : `off (${isMac ? 'tools not built' : 'Mac only for now'})`}`);
if (!fs.existsSync(path.join(STUDIO, 'projects'))) info('no projects folder yet; the first "new" command makes it');

const hardOnes = problems.filter((p) => p.hard);
if (DOCTOR) {
  bold(hardOnes.length ? `${hardOnes.length} thing${hardOnes.length > 1 ? 's' : ''} to fix before Reel Studio will run` : problems.length ? 'Ready, with a few things worth a look (marked !)' : 'Everything is ready');
  for (const p of problems) console.log(`  ${p.hard ? '✗' : '!'} ${p.what}\n      ${p.fix.split('\n').join('\n      ')}`);
  process.exit(hardOnes.length ? 1 : 0);
}

// ---------------- smoke test ----------------
if (NO_SMOKE) { bold('Setup done (smoke test skipped)'); elapsed(); process.exit(0); }
bold('Smoke test render');
const example = path.join(STUDIO, 'examples', 'smoke');
if (!fs.existsSync(example)) { info('no examples/smoke folder; skipping'); elapsed(); process.exit(0); }
fs.mkdirSync(path.join(STUDIO, 'projects'), {recursive: true});
fs.mkdirSync(path.join(STUDIO, 'inbox'), {recursive: true});
const smoke = path.join(STUDIO, 'projects', 'smoke');
if (!fs.existsSync(smoke)) {
  fs.cpSync(example, smoke, {recursive: true});
  for (const d of ['proxy', 'analysis', 'assets', 'out']) fs.mkdirSync(path.join(smoke, d), {recursive: true});
}
const reel = path.join(ENGINE, 'reel.mjs');
info('prep (proxy + transcript)…');
if (run(process.execPath, [reel, 'prep', 'smoke'], {cwd: ENGINE}).status !== 0) bad('prep failed on the smoke project.', 'Run  node engine/setup.mjs doctor  and fix what it lists, then run setup again.');
info('render…');
if (run(process.execPath, [reel, 'render', 'smoke'], {cwd: ENGINE}).status !== 0) bad('render failed on the smoke project.', 'Run  node engine/setup.mjs doctor  and fix what it lists, then run setup again.');
const out = path.join(smoke, 'out', 'smoke.mp4');
if (!fs.existsSync(out) || !fs.statSync(out).size) bad(`render finished but ${out} is missing.`, 'Run setup again; if it repeats, send the text above to support.');
bold('All good');
info(`smoke reel:    ${out}`);
info(`also copied:   ${path.join(os.homedir(), 'Downloads', 'Reels', 'smoke.mp4')}`);
info(`contact sheet: ${path.join(smoke, 'out', 'smoke.sheet.png')}`);
info(`total time:    ${Math.round((Date.now() - T0) / 1000)}s`);
console.log('\n  Next: put your fonts in brand/fonts and your values in brand/brand.json, then drop footage in inbox/ and run:');
console.log('    node engine/reel.mjs new my-first-reel');
console.log('    node engine/reel.mjs prep my-first-reel');
