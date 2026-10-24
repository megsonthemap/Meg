// Everything that differs between macOS, Windows and Linux lives here, so the rest of the engine
// never asks which computer it is on. Reel Studio runs on macOS and Windows 10/11 x64 (Linux works
// for rendering but is not a supported buyer setup).
//
// What is Mac only for now: the person cutout (tools/cutout, tools/cutimg) and the face box the QA
// check uses (tools/facebox). Both are Swift programs on Apple Vision. Everywhere else the engine
// draws those effects in front of the person (see lib/no-cutout.mjs) and the check uses fixed safe
// zones instead of the face (see lib/check.mjs).
//
// Testing the fallbacks on a Mac: REEL_FORCE_NO_CUTOUT=1 and REEL_FORCE_NO_FACEBOX=1.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawn, spawnSync} from 'child_process';
import {fileURLToPath, pathToFileURL} from 'url';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const isMac = process.platform === 'darwin';
export const isWin = process.platform === 'win32';
export const isLinux = process.platform === 'linux';
export const osName = isMac ? 'macOS' : isWin ? 'Windows' : isLinux ? 'Linux' : process.platform;
export const exe = (name) => (isWin ? `${name}.exe` : name);

// ---- ffmpeg / ffprobe: the copies Remotion installs for this platform ----
// npm installs only the compositor package that matches this computer.
export const compositorId = isMac ? `darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
  : isWin ? 'win32-x64-msvc'
  : `linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}-gnu`;
export const FFDIR = path.join(ENGINE, 'node_modules', '@remotion', `compositor-${compositorId}`);
export const ffmpegPath = path.join(FFDIR, exe('ffmpeg'));
export const ffprobePath = path.join(FFDIR, exe('ffprobe'));
// the compositor's ffmpeg loads its libraries from its own folder
export const ffEnv = {
  ...process.env,
  ...(isMac ? {DYLD_LIBRARY_PATH: FFDIR} : {}),
  ...(isLinux ? {LD_LIBRARY_PATH: [FFDIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')} : {}),
  ...(isWin ? {PATH: [FFDIR, process.env.PATH].filter(Boolean).join(';')} : {}),
};

// H.264 for proxies: the Mac's hardware encoder, otherwise x264 at a quality that matches it.
export const h264Args = () => (isMac
  ? ['-c:v', 'h264_videotoolbox', '-b:v', '14M', '-profile:v', 'high']
  : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-maxrate', '20M', '-bufsize', '28M', '-profile:v', 'high']);

// ---- headless browser for contact sheets and stills ----
// Google Chrome (or Edge on Windows) if installed, otherwise the chrome-headless-shell that
// Remotion downloads into node_modules/.remotion (setup.mjs fetches it).
const headlessShell = () => {
  const plat = isMac ? `mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}` : isWin ? 'win64' : process.arch === 'arm64' ? 'linux-arm64' : 'linux64';
  return path.join(ENGINE, 'node_modules', '.remotion', 'chrome-headless-shell', plat, `chrome-headless-shell-${plat}`, exe(isLinux && process.arch === 'arm64' ? 'headless_shell' : 'chrome-headless-shell'));
};
export function chromePath() {
  const win = (base, ...p) => (base ? path.join(base, ...p) : null);
  const list = isMac ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : isWin ? [
    win(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    win(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    win(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    win(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    win(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return [...list, headlessShell()].filter(Boolean).find((p) => fs.existsSync(p)) ?? null;
}
export const headlessShellPath = headlessShell;

// file:// URL for a local path (a bare "file://" + path breaks on Windows drive letters)
export const fileUrl = (p) => pathToFileURL(p).href;

// A folder link inside the render stage. Windows only lets admins make symlinks, but anyone can
// make a junction, which is the same thing for a folder.
export const linkDir = (target, at) => fs.symlinkSync(target, at, isWin ? 'junction' : 'dir');

// Show a folder in Finder / File Explorer. Fire and forget.
export function openFolder(p) {
  const [cmd, args] = isMac ? ['open', [p]] : isWin ? ['explorer.exe', [p]] : ['xdg-open', [p]];
  try { spawn(cmd, args, {detached: true, stdio: 'ignore'}).unref(); return true; } catch { return false; }
}

// ---- whisper.cpp ----
// macOS builds from source (Metal); Windows uses the prebuilt CPU release, unpacked by
// setup-whisper.mjs into the same build/bin layout so every caller finds whisper-cli in one place.
export const WHISPER_VERSION = '1.7.6';
export const WHISPER_MODEL = 'large-v3-turbo';
export const whisperDir = path.join(ENGINE, 'whisper.cpp');
export const whisperCli = path.join(whisperDir, 'build', 'bin', exe('whisper-cli'));
export const whisperModel = path.join(whisperDir, `ggml-${WHISPER_MODEL}.bin`);

// ---- Apple Vision tools (Mac only for now) ----
export const toolPath = (name) => path.join(ENGINE, 'tools', name);
const forcedOff = (v) => /^(1|true|yes)$/i.test(process.env[v] ?? '');
// The person cutout: macOS with tools/cutout and tools/cutimg built (install does this).
export function canCutout() {
  return isMac && !forcedOff('REEL_FORCE_NO_CUTOUT') && fs.existsSync(toolPath('cutout')) && fs.existsSync(toolPath('cutimg'));
}
// The face box for the QA check: macOS with tools/facebox built (or buildable here with swiftc).
export function canFaceBox() {
  if (!isMac || forcedOff('REEL_FORCE_NO_FACEBOX')) return false;
  const tool = toolPath('facebox');
  if (fs.existsSync(tool) && fs.statSync(tool).mtimeMs >= fs.statSync(tool + '.swift').mtimeMs) return true;
  const r = spawnSync('swiftc', ['-O', tool + '.swift', '-o', tool], {stdio: 'inherit'});
  return r.status === 0 && fs.existsSync(tool);
}
// one plain line for the log, saying why
export const cutoutWhy = () => (isMac && forcedOff('REEL_FORCE_NO_CUTOUT') ? 'REEL_FORCE_NO_CUTOUT is set'
  : isMac ? 'the cutout tools are not built yet (run: node setup.mjs)'
  : `the person cutout is Mac only for now and this is ${osName}`);
export const faceWhy = () => (isMac && forcedOff('REEL_FORCE_NO_FACEBOX') ? 'REEL_FORCE_NO_FACEBOX is set'
  : isMac ? 'tools/facebox could not be built (run: node setup.mjs)'
  : `face detection is Mac only for now and this is ${osName}`);

// ---- where things go ----
export const downloadsDir = () => path.join(os.homedir(), 'Downloads');
// CapCut desktop's project folder. On Windows it lives under Local AppData; CapCut can be told to
// keep drafts elsewhere, so REEL_CAPCUT_DRAFTS overrides it.
export function capcutDraftRoot() {
  if (process.env.REEL_CAPCUT_DRAFTS) return process.env.REEL_CAPCUT_DRAFTS;
  if (isWin) return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
  return path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
}

// A relative path with forward slashes. Anything that goes into plan.json, assets.json or a URL
// (p/<slug>/proxy/clip.mp4) must use these, or Windows' backslashes break the lookups.
export const relPosix = (from, to) => path.relative(from, to).split(path.sep).join('/');
