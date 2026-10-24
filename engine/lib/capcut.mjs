// Writes an editable CapCut desktop draft for a rendered reel.
// Track 1: the cut footage (proxies, so timings match the render exactly).
// Track 2: every graphic (hook, captions, labels, cards, end card) as one transparent ProRes 4444 layer.
// Built by cloning the structure of a real draft from this Mac's CapCut (8.4) so field shapes match.
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {fileURLToPath} from 'url';
import {capcutDraftRoot, isWin} from './platform.mjs';

// ~/Movies/CapCut/... on a Mac, %LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft on Windows
const ROOT = capcutDraftRoot();
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capcut-template');
const uid = () => crypto.randomUUID().toUpperCase();
const US = (s) => Math.round(s * 1e6);
const clone = (o) => JSON.parse(JSON.stringify(o));

export async function exportCapCut(slug, plan, {P, info, overlayFile}) {
  // The template was captured from one Mac, so any absolute path in it points at that user's home.
  // Rewrite every /Users/<name>/ prefix to this machine's home so the draft is valid wherever the kit lives.
  // On Windows CapCut's own folders (cache, projects) live under Local AppData instead of ~/Movies.
  if (!fs.existsSync(path.join(ROOT, 'root_meta_info.json'))) {
    throw new Error(`CapCut's project folder was not found at ${ROOT}. Open CapCut desktop (from capcut.com), make one blank project so it creates the folder, quit CapCut, then run this again. If CapCut keeps projects somewhere else, set REEL_CAPCUT_DRAFTS to that folder.`);
  }
  const winPath = (rest) => {
    const capcut = /(?:^|\/)Movies\/CapCut\/User Data\/(.*)$/.exec(rest);
    return capcut ? path.join(path.dirname(path.dirname(ROOT)), ...capcut[1].split('/')) : path.join(os.homedir(), ...rest.split('/'));
  };
  const rehomeStr = (s) => { const m = /^\/Users\/[^/]+\/(.*)$/.exec(s); return !m ? s : isWin ? winPath(m[1]) : path.join(os.homedir(), m[1]); };
  const rehome = (o) => { if (Array.isArray(o)) return o.map(rehome); if (o && typeof o === 'object') { for (const k in o) o[k] = rehome(o[k]); return o; } return typeof o === 'string' ? rehomeStr(o) : o; };
  const tpl = rehome(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'draft_info.json'), 'utf8')));
  const meta = rehome(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'draft_meta_info.json'), 'utf8')));
  const segTpl = tpl.tracks[0].segments[0];
  const vidTpl = tpl.materials.videos[0];
  const extraTpl = {};
  for (const [k, list] of Object.entries(tpl.materials)) if (Array.isArray(list)) for (const m of list) if (segTpl.extra_material_refs.includes(m.id)) extraTpl[k] = m;

  const name = `Reel ${slug}`;
  const dir = path.join(ROOT, name);
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  const draftId = uid();
  const d = clone(tpl);
  for (const k of Object.keys(d.materials)) if (Array.isArray(d.materials[k])) d.materials[k] = [];
  d.id = draftId;
  d.name = name;
  d.canvas_config = {background: null, height: 1920, ratio: '9:16', width: 1080};
  d.duration = US(plan.duration);
  d.fps = 30.0;
  d.tracks = [];

  // CapCut on a Mac is sandboxed: it can only read files it imported itself or anything inside ~/Movies.
  // So every source file is copied into the draft's own media folder (inside ~/Movies) and referenced there.
  // Windows has no such limit, but the copy keeps the draft whole if the studio folder moves.
  const mediaDir = path.join(dir, 'media');
  fs.mkdirSync(mediaDir, {recursive: true});
  const localise = (abs) => {
    const dest = path.join(mediaDir, path.basename(abs));
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(abs).size) fs.copyFileSync(abs, dest);
    return dest;
  };
  const materialFor = new Map();
  const addVideo = (srcAbs, w, h, dur, hasAudio) => {
    const abs = localise(srcAbs);
    if (materialFor.has(abs)) return materialFor.get(abs);
    const m = clone(vidTpl);
    Object.assign(m, {id: uid(), path: abs, width: w, height: h, duration: US(dur), has_audio: hasAudio, material_name: path.basename(abs), local_material_id: '', type: 'video'});
    d.materials.videos.push(m);
    materialFor.set(abs, m.id);
    return m.id;
  };
  const addSeg = (track, matId, srcIn, start, dur, zoom = 1, focusY = 0.35, volume = 1, renderIndex = 0) => {
    const s = clone(segTpl);
    const refs = [];
    for (const [k, m] of Object.entries(extraTpl)) { const c = clone(m); c.id = uid(); d.materials[k].push(c); refs.push(c.id); }
    Object.assign(s, {
      id: uid(), material_id: matId, extra_material_refs: refs, volume, last_nonzero_volume: volume || 1,
      source_timerange: {start: US(srcIn), duration: US(dur)}, target_timerange: {start: US(start), duration: US(dur)},
      render_index: renderIndex, track_render_index: renderIndex,
    });
    s.clip = {...s.clip, scale: {x: zoom, y: zoom}, transform: {x: 0, y: +(-(0.5 - focusY) * (zoom - 1) * 2).toFixed(4)}};
    track.segments.push(s);
  };
  const track = (renderIndex) => ({attribute: 0, flag: 0, id: uid(), is_default_name: true, name: '', segments: [], type: 'video', render_index: renderIndex});

  const main = track(0);
  for (const seg of plan.segments) {
    const id = seg.src.split('/').pop().replace(/\.[^.]+$/, '');
    const abs = P(slug, info[id].proxy);
    addSeg(main, addVideo(abs, 1080, 1920, info[id].duration, info[id].hasAudio), seg.srcIn, seg.start, seg.dur, seg.zoom ?? 1, seg.focusY ?? 0.35, seg.volume ?? 1, 0);
  }
  d.tracks.push(main);
  // full-screen b-roll cutaways go on their own track above the talking head
  const full = (plan.inserts ?? []).filter((x) => x.pos === 'full' && x.kind === 'video');
  if (full.length) {
    const t2 = track(1);
    for (const x of full) {
      const id = x.src.split('/').pop().replace(/\.[^.]+$/, '');
      if (!info[id]) continue;
      addSeg(t2, addVideo(P(slug, info[id].proxy), 1080, 1920, info[id].duration, info[id].hasAudio), x.srcIn ?? 0, x.start, x.dur, 1, 0.5, 0, 1);
    }
    d.tracks.push(t2);
  }
  if (overlayFile) {
    const t3 = track(2);
    addSeg(t3, addVideo(overlayFile, 1080, 1920, plan.duration, false), 0, 0, plan.duration, 1, 0.5, 0, 2);
    d.tracks.push(t3);
  }

  fs.writeFileSync(path.join(dir, 'draft_info.json'), JSON.stringify(d));
  fs.writeFileSync(path.join(dir, 'draft_info.json.bak'), JSON.stringify(d));
  // CapCut for Windows has read draft_content.json; the Mac app reads draft_info.json. Same content.
  if (isWin) fs.writeFileSync(path.join(dir, 'draft_content.json'), JSON.stringify(d));
  for (const f of ['draft_settings', 'draft.extra', 'draft_agency_config.json']) if (fs.existsSync(path.join(TEMPLATE, f))) fs.copyFileSync(path.join(TEMPLATE, f), path.join(dir, f));

  const now = Date.now();
  Object.assign(meta, {
    draft_id: draftId, draft_name: name, draft_fold_path: dir, draft_root_path: ROOT, draft_cover: '',
    tm_duration: US(plan.duration), tm_draft_create: now * 1000, tm_draft_modified: now * 1000,
    draft_timeline_materials_size_: 0,
    draft_materials: [{type: 0, value: [...materialFor.entries()].map(([abs, id]) => ({ai_group_type: '', create_time: Math.floor(now / 1000), duration: d.materials.videos.find((v) => v.id === id).duration, enter_from: 0, extra_info: path.basename(abs), file_Path: abs, height: 1920, id: crypto.randomUUID(), import_time: Math.floor(now / 1000), import_time_ms: now * 1000, item_source: 1, md5: '', metetype: 'video', roughcut_time_range: {duration: -1, start: -1}, sub_time_range: {duration: -1, start: -1}, type: 0, width: 1080}))}, {type: 1, value: []}, {type: 2, value: []}, {type: 3, value: []}, {type: 6, value: []}, {type: 7, value: []}],
  });
  fs.writeFileSync(path.join(dir, 'draft_meta_info.json'), JSON.stringify(meta));

  // register it in CapCut's project list (back up the index first)
  const rootMeta = path.join(ROOT, 'root_meta_info.json');
  const rm = JSON.parse(fs.readFileSync(rootMeta, 'utf8'));
  fs.copyFileSync(rootMeta, rootMeta + '.reelstudio-backup');
  const entry = clone(rm.all_draft_store[0]);
  Object.assign(entry, {draft_cover: '', draft_fold_path: dir, draft_id: draftId, draft_json_file: path.join(dir, 'draft_info.json'), draft_name: name, tm_draft_create: now * 1000, tm_draft_modified: now * 1000, tm_duration: US(plan.duration), draft_timeline_materials_size: 0});
  rm.all_draft_store = [entry, ...rm.all_draft_store.filter((e) => e.draft_name !== name)];
  fs.writeFileSync(rootMeta, JSON.stringify(rm));
  console.log('› CapCut draft written:', name, '(quit and reopen CapCut to see it)');
  return dir;
}
