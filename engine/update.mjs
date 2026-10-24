#!/usr/bin/env node
// Reel Studio updates and help notes, for macOS and Windows. Never touches anything that is yours:
// brand/, projects/, inbox/, review/data/, review/media/ and your rules stay exactly as they are.
//
//   node engine/update.mjs <new-kit.zip | unzipped folder>   back up, install the new version, show what's new
//   node engine/update.mjs --rollback                         put the last version back
//   node engine/update.mjs --help-note "what happened"        write a privacy-safe help note to Downloads
//
// What an update replaces: engine/ (not its node_modules, whisper or Python), review/index.html and
// the review docs, library/, templates/, CLAUDE.md, PROMPTS.md, CHANGELOG.md, VERSION, .claude/skills and the PDFs.
import fs from 'fs';
import path from 'path';
import os from 'os';
import {execFileSync, spawnSync} from 'child_process';
import {fileURLToPath} from 'url';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (...a) => console.log('›', ...a);
const ver = (dir) => { try { return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(); } catch { return 'unknown'; } };
const SHIPPED = ['engine', 'review/index.html', 'review/PROCEDURE.md', 'review/ARTIFACT-UPGRADE.md', 'library', 'templates', 'CLAUDE.md', 'PROMPTS.md', 'CHANGELOG.md', 'VERSION', '.claude/skills', 'Reel-Studio-What-To-Say.pdf', 'Reel-Studio-Setup-Guide.pdf'];
const SKIP = new Set(['node_modules', 'whisper.cpp', '.venv', '.cmake-venv', '.DS_Store']);
const BACKUPS = path.join(STUDIO, 'backups');

function copy(src, dst) {
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, {recursive: true});
    for (const f of fs.readdirSync(src)) if (!SKIP.has(f)) copy(path.join(src, f), path.join(dst, f));
  } else { fs.mkdirSync(path.dirname(dst), {recursive: true}); fs.copyFileSync(src, dst); }
}
// replace a shipped folder but keep its heavy local installs (node_modules, whisper, Python)
function replace(src, dst) {
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) {
    for (const f of fs.existsSync(dst) ? fs.readdirSync(dst) : []) if (!SKIP.has(f) && !fs.existsSync(path.join(src, f))) fs.rmSync(path.join(dst, f), {recursive: true, force: true});
    copy(src, dst);
  } else copy(src, dst);
}

function backup() {
  const name = `${ver(STUDIO)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  const dir = path.join(BACKUPS, name);
  for (const p of SHIPPED) copy(path.join(STUDIO, p), path.join(dir, p));
  say(`backed up version ${ver(STUDIO)} to backups/${name}`);
  return dir;
}

function unpack(input) {
  if (fs.statSync(input).isDirectory()) return input;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-studio-update-'));
  // tar reads zips on macOS and on Windows 10/11 (bsdtar ships with both)
  execFileSync('tar', ['-xf', input, '-C', tmp], {stdio: 'ignore'});
  // the zip may hold one top folder
  const kids = fs.readdirSync(tmp).filter((f) => !f.startsWith('__MACOSX'));
  return kids.length === 1 && fs.statSync(path.join(tmp, kids[0])).isDirectory() ? path.join(tmp, kids[0]) : tmp;
}

function whatsNew(from, to, dir) {
  try {
    const log = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    const parts = log.split(/^## /m).slice(1);
    const fresh = parts.filter((p) => p.split(/\s/)[0] !== from).slice(0, Math.max(1, parts.findIndex((p) => p.split(/\s/)[0] === from)));
    if (fresh.length) { console.log(`\nWhat's new in ${to}:\n`); console.log(fresh.map((p) => '## ' + p.trim()).join('\n\n')); }
  } catch {}
}

function npmInstall() {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], {cwd: path.join(STUDIO, 'engine'), stdio: 'inherit'});
  if (r.status !== 0) say('npm install did not finish: run node engine/setup.mjs doctor');
}

function update(input) {
  const src = unpack(path.resolve(input));
  if (!fs.existsSync(path.join(src, 'engine', 'reel.mjs'))) throw new Error('That does not look like a Reel Studio kit (no engine/reel.mjs inside).');
  const from = ver(STUDIO), to = ver(src);
  say(`updating ${from} → ${to}`);
  const pkgBefore = fs.existsSync(path.join(STUDIO, 'engine', 'package.json')) ? fs.readFileSync(path.join(STUDIO, 'engine', 'package.json'), 'utf8') : '';
  backup();
  for (const p of SHIPPED) replace(path.join(src, p), path.join(STUDIO, p));
  if (fs.readFileSync(path.join(STUDIO, 'engine', 'package.json'), 'utf8') !== pkgBefore) { say('new engine packages, installing'); npmInstall(); }
  say(`done. Your brand, reels, notes and rules were not touched. To go back: node engine/update.mjs --rollback`);
  whatsNew(from, to, STUDIO);
}

function rollback() {
  const list = fs.existsSync(BACKUPS) ? fs.readdirSync(BACKUPS).sort() : [];
  if (!list.length) throw new Error('No backups yet, so there is nothing to go back to.');
  const last = path.join(BACKUPS, list[list.length - 1]);
  for (const p of SHIPPED) replace(path.join(last, p), path.join(STUDIO, p));
  say(`restored ${list[list.length - 1]}. The newer version is gone; your brand and reels were not touched.`);
}

// A help note says what is wrong with the setup, never what is in your reels: no footage, no
// transcripts, no brand details, no notes. Just versions, the health check and the last error lines.
function helpNote(what) {
  const lines = [`Reel Studio help note, ${new Date().toISOString()}`, '', `What happened: ${what || '(not described)'}`, '',
    `Version: ${ver(STUDIO)}`, `Computer: ${os.type()} ${os.release()} ${os.arch()}, ${Math.round(os.totalmem() / 1e9)} GB memory`, `Node: ${process.version}`, ''];
  const doc = spawnSync(process.execPath, [path.join(STUDIO, 'engine', 'setup.mjs'), 'doctor'], {encoding: 'utf8', timeout: 180000});
  lines.push('Health check:', (doc.stdout || '') + (doc.stderr || ''), '');
  // the editor's last few steps, with reel names replaced
  const ag = path.join(STUDIO, 'review', 'data', 'agents');
  const recent = (fs.existsSync(ag) ? fs.readdirSync(ag) : []).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(ag, f), 'utf8')); } catch { return null; } }).filter(Boolean).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  if (recent) lines.push(`Last editor job: state ${recent.state}, task ${recent.task}`, ...(recent.log ?? []).slice(-8).map((x) => '  ' + (typeof x === 'string' ? x : x.msg)), '');
  const home = os.homedir();
  const text = lines.join('\n').split(home).join('~');
  const out = path.join(home, 'Downloads', 'Reel-Studio-help-note.txt');
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, text);
  say(`help note written to ${out.split(home).join('~')}. Read it first if you like, then email it to support.`);
}

const [a, b] = process.argv.slice(2);
try {
  if (a === '--rollback') rollback();
  else if (a === '--help-note') helpNote(b);
  else if (a && !a.startsWith('--')) update(a);
  else console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n').replace(/^\/\/ ?/gm, ''));
} catch (e) { console.error('✗', e.message); process.exitCode = 1; }
