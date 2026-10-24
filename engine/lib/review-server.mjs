// Reel Review: a tiny web server for the review studio. No dependencies.
//
// Serves <studio>/review/index.html plus a small JSON API over <studio>/review/data.
// Binds to every interface so a phone on the same Wi-Fi can open it.
//
//   reel doc   review/data/<slug>.json        written by `reel.mjs review <slug>`
//   notes      review/data/<slug>.notes.json  written by the page (and read by Claude)
//   previews   review/media/<slug>-v<N>.mp4
//   jobs       review/data/jobs/<slug>.json    a drop-zone job: footage in, new + prep run, then Claude cuts
//
// The drop zone collects footage and runs the mechanical prep. It never edits: when prep finishes the
// job sits at state "ready" and the owner goes back to Claude and says "cut <slug>".
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import {spawn} from 'child_process';
import {applyEdit, editSummary, COLOURS} from './studio-edit.mjs';

const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};

export function lanAddress() {
  // the first non-internal IPv4 address: what the phone types in
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return null;
}

const rj = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
const wj = (f, v) => { fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
const SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/i;
// what the drop zone accepts: the same families `reel.mjs new` moves out of the inbox
const MEDIA_EXT = /\.(mov|mp4|m4v|hevc|png|jpe?g|heic|webp|m4a|mp3|wav|aac)$/i;
const MAX_FILE = 4 * 1024 * 1024 * 1024;   // one file: 4 GB (a long 4K clip off a phone)
const MAX_DROP = 8 * 1024 * 1024 * 1024;   // one drop: 8 GB
const LOG_LINES = 14;

// A dropped filename is never trusted: basename only, spaces to underscores, nothing exotic left.
function safeName(raw) {
  const base = String(raw ?? '').split(/[\\/]/).pop().trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
  if (!base || base.startsWith('.') || base.includes('..') || base.length > 120) return null;
  if (!MEDIA_EXT.test(base)) return null;
  return base;
}

// Streaming multipart/form-data: one pass, bodies written straight to disk, no dependencies and
// nothing large held in memory. onFile(name) returns a destination path, or null to skip the part.
function parseMultipart(req, boundary, {onFile, onField, maxFile = MAX_FILE, maxTotal = MAX_DROP}) {
  return new Promise((resolve, reject) => {
    const dash = Buffer.from('--' + boundary);
    const files = [], skipped = [], fields = {};
    let buf = Buffer.alloc(0), mode = 'preamble', part = null, total = 0, done = false;
    const fail = (msg) => { if (done) return; done = true; if (part?.stream) part.stream.destroy(); req.destroy(); reject(new Error(msg)); };

    const startPart = (headerText) => {
      const name = /name="([^"]*)"/i.exec(headerText)?.[1] ?? '';
      const filename = /filename="([^"]*)"/i.exec(headerText)?.[1];
      if (filename === undefined) return {field: name, text: ''};
      const safe = safeName(filename);
      const dest = safe ? onFile(safe) : null;
      if (!dest) { skipped.push({name: String(filename).slice(0, 120), why: safe ? 'in the way' : 'not a video, audio or image file'}); return {skip: true}; }
      return {file: safe, dest, bytes: 0, stream: fs.createWriteStream(dest)};
    };

    const endPart = () => {
      if (!part) return;
      if (part.stream) { part.stream.end(); files.push({name: part.file, bytes: part.bytes, path: part.dest}); }
      else if (!part.skip) { fields[part.field] = part.text.trim(); onField?.(part.field, part.text.trim()); }
      part = null;
    };

    req.on('data', (chunk) => {
      if (done) return;
      total += chunk.length;
      if (total > maxTotal) return fail('that drop is too big');
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (mode === 'preamble' || mode === 'boundary') {
          const i = buf.indexOf(dash);
          if (i < 0) { if (buf.length > 4096) buf = buf.subarray(buf.length - dash.length); return; }
          const after = i + dash.length;
          if (buf.length < after + 2) return;                       // need \r\n or --
          if (buf[after] === 45 && buf[after + 1] === 45) { buf = Buffer.alloc(0); mode = 'epilogue'; break; }
          buf = buf.subarray(after + 2); mode = 'headers'; continue;
        }
        if (mode === 'headers') {
          const i = buf.indexOf('\r\n\r\n');
          if (i < 0) { if (buf.length > 8192) return fail('bad upload'); return; }
          part = startPart(buf.subarray(0, i).toString('latin1'));
          buf = buf.subarray(i + 4); mode = 'body'; continue;
        }
        if (mode === 'body') {
          const i = buf.indexOf(dash);
          if (i < 0) {
            // keep back enough bytes that a boundary split across chunks is still found
            const keep = Math.min(buf.length, dash.length + 2);
            const out = buf.subarray(0, buf.length - keep);
            if (out.length) { if (!writeBody(out)) return; }
            buf = buf.subarray(buf.length - keep);
            return;
          }
          const out = buf.subarray(0, Math.max(0, i - 2));          // drop the \r\n before the boundary
          if (out.length) { if (!writeBody(out)) return; }
          endPart();
          buf = buf.subarray(i); mode = 'boundary'; continue;
        }
        return;                                                      // epilogue: ignore the rest
      }
    });

    const writeBody = (out) => {
      if (part?.stream) {
        part.bytes += out.length;
        if (part.bytes > maxFile) { fail(`${part.file} is bigger than ${Math.round(maxFile / 1e9)} GB`); return false; }
        part.stream.write(out);
      } else if (part && !part.skip) {
        part.text += out.toString('utf8');
        if (part.text.length > 4096) { fail('bad upload'); return false; }
      }
      return true;
    };

    req.on('end', () => { if (done) return; done = true; endPart(); resolve({files, skipped, fields}); });
    req.on('error', (e) => fail(e.message));
  });
}

export function startReviewServer({studio, port = 7847, host = '0.0.0.0'} = {}) {
  const ROOT = path.join(studio, 'review');
  const DATA = path.join(ROOT, 'data');
  const MEDIA = path.join(ROOT, 'media');
  const JOBS = path.join(DATA, 'jobs');
  const INBOX = path.join(studio, 'inbox');
  const reelFile = (slug) => path.join(DATA, `${slug}.json`);
  const notesFile = (slug) => path.join(DATA, `${slug}.notes.json`);
  const jobFile = (slug) => path.join(JOBS, `${slug}.json`);
  // Things she does on the page that need the editor (a plan, a yes, a change, notes) queue here.
  // The Claude chat running /edit waits on this queue (reel.mjs wait) and answers on the page.
  const EVENTS = path.join(DATA, 'events'), AGENTS = path.join(DATA, 'agents');
  const pushEvent = (slug, type, text = '') => wj(path.join(EVENTS, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`), {slug, type, text: String(text ?? '').slice(0, 4000), at: Date.now()});
  const agentOf = (slug) => {
    const a = rj(path.join(AGENTS, `${slug}.json`), {state: 'none', log: []});
    const planF = path.join(studio, 'projects', slug, 'PLAN.md');
    const queued = (fs.existsSync(EVENTS) ? fs.readdirSync(EVENTS) : []).map((f) => rj(path.join(EVENTS, f), null)).filter((e) => e && e.slug === slug).length;
    const stF = path.join(studio, 'projects', slug, 'out', 'stills', 'stills.png');
    return {...a, queued, stillAt: fs.existsSync(stF) ? fs.statSync(stF).mtimeMs : null, plan: fs.existsSync(planF) ? fs.readFileSync(planF, 'utf8') : null};
  };
  const setAgent = (slug, patch) => { const f = path.join(AGENTS, `${slug}.json`); wj(f, {...rj(f, {log: []}), ...patch, updatedAt: Date.now()}); };
  const listJobs = () => (fs.existsSync(JOBS) ? fs.readdirSync(JOBS) : [])
    .filter((f) => f.endsWith('.json')).map((f) => rj(path.join(JOBS, f), null)).filter(Boolean)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const running = () => listJobs().find((j) => j.state === 'running');

  // A job the server was running when it stopped is nobody's any more: the child process is not
  // ours to follow after a restart. Say what actually happened, judged by what prep left on disk.
  for (const j of listJobs()) {
    if (j.state !== 'running') continue;
    const prepped = fs.existsSync(path.join(studio, 'projects', j.slug, 'analysis', 'clips.json'));
    wj(jobFile(j.slug), prepped
      ? {...j, state: 'ready', step: 'ready', pid: null, finishedAt: Date.now(), note: 'Footage prepped.'}
      : {...j, state: 'failed', pid: null, finishedAt: Date.now(), error: 'The studio stopped while this was getting ready. Ask Claude to finish it: prep ' + j.slug + '.'});
  }

  // The file Claude finds: what was dropped, what the owner said about it, and whether they want
  // a plan first or just want it cut.
  function writeWaiting(job) {
    const dir = path.join(studio, 'projects', job.slug);
    fs.mkdirSync(dir, {recursive: true});
    const lines = [
      `# ${job.slug} is prepped and waiting`, '',
      `Dropped on the review studio at ${new Date(job.startedAt).toLocaleString()}. \`new\` and \`prep\` have`,
      'run, so the raw clips, proxies, transcript and contact sheets are in place. Nothing has been',
      'planned, edited or rendered.', '',
      'Files:', job.files.map((f) => '- ' + f).join('\n'), '',
    ];
    if (job.brief) lines.push('## What they said about it', '', job.brief.trim(), '');
    if (job.style) {
      const st = job.style, lib = rj(path.join(studio, 'library', 'catalog.json'), {effects: []}), tpl = rj(path.join(studio, 'library', 'templates.json'), []);
      const nm = (id) => { const e = lib.effects.find((x) => x.id === id); return e ? `${e.name} (\`${id}\`${e.types.length ? ', fx: ' + e.types.join('/') : ''})` : id; };
      lines.push('## The style they picked', '');
      if (st.mode === 'claude') lines.push('**Let Claude choose.** Pick the look and the effects yourself from the brand guide and the footage, and say what you chose.');
      else if (st.mode === 'template') { const tt = tpl.find((x) => x.id === st.template); lines.push(`**Template: ${tt ? tt.name : st.template}.** ${tt ? tt.blurb : ''} Keep their brand fonts and colours.`); }
      else lines.push('**Their brand guide**, as it stands.');
      if (st.captions) lines.push('', `Captions: ${nm(st.captions)}.`);
      if (st.look) lines.push('', `Look: **${st.look}** (put "look": "${st.look}" in edit.json: this reel wears that starter look's fonts and colours instead of the brand's).`);
      if (st.energy) lines.push('', `Energy: **${st.energy}** (set "energy": "${st.energy}" in edit.json; see the Energy rules in the edit skill).`);
      if (st.claudeEffects || !st.effects.length) lines.push('', 'Effects: **you pick them**, each on a line they actually say.');
      else lines.push('', 'Effects they want (use these, each on a line they actually say; skip any that has no line to sit on, and say so):', ...st.effects.map((e) => '- ' + nm(e)));
      if (st.sameAs) lines.push('', `**Same as last time:** they ticked this, so the picks above are copied from \`${st.sameAs}\`. Read \`projects/${st.sameAs}/edit.json\` and match its look (captions, hook style, energy, the kinds of effects), on this reel's own lines.`);
      if (st.cutFirst) lines.push('', '**Cut first:** they want to settle the cut before any styling. Write the cuts into edit.json (no fx yet), run `node engine/reel.mjs cutlist ' + job.slug + '`, then `status ' + job.slug + ' idle --task cutfirst "Your cut is ready to check"`. Their page shows every line with keep or cut and a plain preview. Style only after the `cutlock` event: run `node engine/reel.mjs cutlock ' + job.slug + ' <kept lines>`, re-time anything placed by seconds, then carry on to the moments.');
      lines.push('');
    }
    lines.push('## What they asked for', '',
      job.go === 'cut'
        ? 'They tapped **just cut it**: they do not want to be asked first. Read the brand guide, the'
          + '\ntranscript and the contact sheets, cut it, and show them the result. Say in one line what you'
          + '\nchose and why, so they can push back on the finished thing rather than on a plan.'
        : 'They want **the plan first**. Read the brand guide, the transcript and the contact sheets, then'
          + '\nsend the plan: hook, what you would cut, which effect sits on which line, what proof you need.'
          + '\nRender only after they say yes.',
      '', 'Delete this file once you have picked it up.', '');
    fs.writeFileSync(path.join(dir, 'READY-TO-CUT.md'), lines.join('\n'));
  }

  // new + prep, one after the other, as child processes of the studio. Mechanical work only:
  // no plan, no edit, no render. When it finishes the owner goes back to Claude.
  function startJob(slug, files, carry = {}) {
    const job = {slug, state: 'running', step: 'new', files, startedAt: Date.now(), finishedAt: null, pid: null, log: [], error: null, brief: carry.brief ?? null, go: carry.go ?? null, style: carry.style ?? null};
    const save = () => wj(jobFile(slug), job);
    save();
    const steps = [['new', 'Moving the footage into the project'], ['prep', 'Making proxies, the transcript and the contact sheets. This is the slow part.']];
    const run = (i) => {
      if (i >= steps.length) {
        job.state = 'ready'; job.step = 'ready'; job.pid = null; job.finishedAt = Date.now();
        job.note = job.brief ? 'Footage prepped, brief saved.' : 'Footage prepped.';
        save();
        // something on disk Claude finds without being told where to look
        try { writeWaiting(job); } catch {}
        return;
      }
      const [cmd, label] = steps[i];
      job.step = cmd; job.label = label; save();
      const child = spawn(process.execPath, [path.join(studio, 'engine', 'reel.mjs'), cmd, slug], {cwd: studio, stdio: ['ignore', 'pipe', 'pipe']});
      job.pid = child.pid; save();
      let tail = '';
      const onOut = (b) => {
        tail += b.toString();
        const lines = tail.split('\n'); tail = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) job.log.push(l.trim().slice(0, 300));
        job.log = job.log.slice(-LOG_LINES); save();
      };
      child.stdout.on('data', onOut); child.stderr.on('data', onOut);
      child.on('error', (e) => { job.state = 'failed'; job.pid = null; job.finishedAt = Date.now(); job.error = e.message; save(); });
      child.on('close', (code) => {
        if (job.state !== 'running') return;
        if (code !== 0) {
          job.state = 'failed'; job.pid = null; job.finishedAt = Date.now();
          job.error = `${cmd} stopped with code ${code}. Ask Claude to run it and say what went wrong.`;
          save(); return;
        }
        run(i + 1);
      });
    };
    run(0);
    return job;
  }

  const json = (res, code, body) => { const s = JSON.stringify(body); res.writeHead(code, {'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s), 'cache-control': 'no-store'}); res.end(s); };
  const listReels = () => (fs.existsSync(DATA) ? fs.readdirSync(DATA) : [])
    .filter((f) => f.endsWith('.json') && !f.endsWith('.notes.json') && f !== 'watching.json')
    .map((f) => { const r = rj(path.join(DATA, f), null); if (!r) return null; const notes = rj(notesFile(r.slug), []); return {...r, openNotes: notes.filter((n) => !n.done).length}; })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  function sendFile(req, res, file) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, {'content-type': 'text/plain'}); res.end('not found'); return; }
    const {size} = fs.statSync(file);
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    // Byte ranges: iOS Safari will not play or scrub a video without them.
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? +m[1] : size - +m[2];
      let end = m[1] && m[2] ? +m[2] : size - 1;
      start = Math.max(0, Math.min(start, size - 1)); end = Math.max(start, Math.min(end, size - 1));
      res.writeHead(206, {'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes'});
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, {start, end}).pipe(res);
    }
    res.writeHead(200, {'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': file.endsWith('.html') ? 'no-store' : 'no-cache'});
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const body = (req) => new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e5) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

  // Who may use the studio. This Mac (localhost) always can. A phone on the Wi-Fi needs the private
  // link printed at start (it carries a key, kept in a cookie after the first visit). Writes from any
  // other website are refused, so a web page she has open can never queue instructions to the editor.
  const lookBusy = new Set(), lookErr = new Map();
  const KEYF = path.join(DATA, 'state', 'key.txt');
  if (!fs.existsSync(KEYF)) { fs.mkdirSync(path.dirname(KEYF), {recursive: true}); fs.writeFileSync(KEYF, Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)); }
  const KEY = fs.readFileSync(KEYF, 'utf8').trim();
  const isLocal = (req) => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress ?? '');
  const cookieKey = (req) => (/(?:^|;\s*)rs_key=([a-z0-9]+)/.exec(req.headers.cookie ?? '') ?? [])[1];
  const hostOK = (req) => { const h = String(req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, ''); return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === lanAddress() || /\.local$/.test(h); };
  function gate(req, res, url) {
    if (!hostOK(req)) { res.writeHead(403, {'content-type': 'text/plain'}); res.end('not this address'); return false; }
    if (url.searchParams.get('k') === KEY) {
      res.writeHead(302, {'set-cookie': `rs_key=${KEY}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`, location: url.pathname});
      res.end(); return false;
    }
    if (!isLocal(req) && cookieKey(req) !== KEY) {
      res.writeHead(401, {'content-type': 'text/html; charset=utf-8'});
      res.end('<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;background:#151515;color:#eee;padding:28px"><h2>Use your private link</h2><p>For your privacy, Reel Studio only opens on your phone through the private link shown on your Mac when the studio starts. Open that link once on this phone and it remembers you.</p></body>');
      return false;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin, site = req.headers['sec-fetch-site'];
      if (site === 'cross-site' || (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host)) { json(res, 403, {error: 'Only the studio page can do that.'}); return false; }
    }
    return true;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = decodeURIComponent(url.pathname);
      if (!gate(req, res, url)) return;

      if (p === '/api/reels' && req.method === 'GET') return json(res, 200, listReels());
      // the finished, full-quality cut, as a file to save (on iPhone: Save to Photos)
      const dl = /^\/api\/reels\/([^/]+)\/download$/.exec(p);
      if (dl && req.method === 'GET') {
        if (!SLUG.test(dl[1])) return json(res, 400, {error: 'bad slug'});
        const f = path.join(studio, 'projects', dl[1], 'out', `${dl[1]}.mp4`);
        if (!fs.existsSync(f)) return json(res, 404, {error: 'No finished cut yet.'});
        res.writeHead(200, {'content-type': 'video/mp4', 'content-length': fs.statSync(f).size, 'content-disposition': `attachment; filename="${dl[1]}.mp4"`});
        return fs.createReadStream(f).pipe(res);
      }

      // ---- the drop zone: footage in, mechanical prep, then over to Claude ----
      if (p === '/api/jobs' && req.method === 'GET') return json(res, 200, listJobs());
      // is a Claude chat sitting on /edit, waiting for this drop? (reel.mjs wait keeps this fresh)
      if (p === '/api/watching' && req.method === 'GET') {
        const w = rj(path.join(DATA, 'watching.json'), null);
        let live = !!w && Date.now() - (w.at ?? 0) < 15000;
        if (live) { try { process.kill(w.pid, 0); } catch { live = false; } }
        // the editor is also on while it is working on something and reporting steps
        if (!live) live = (fs.existsSync(AGENTS) ? fs.readdirSync(AGENTS) : []).some((f) => { const a = rj(path.join(AGENTS, f), null); return a && a.state === 'working' && Date.now() - (a.updatedAt ?? 0) < 10 * 60000; });
        return json(res, 200, {live, slug: live ? w.slug : null});
      }

      const job1 = /^\/api\/jobs\/([^/]+)$/.exec(p);
      if (job1 && req.method === 'GET') {
        if (!SLUG.test(job1[1])) return json(res, 400, {error: 'bad slug'});
        const j = rj(jobFile(job1[1]), null);
        return j ? json(res, 200, j) : json(res, 404, {error: 'no such job'});
      }
      if (job1 && req.method === 'DELETE') {   // the page clearing a finished job off the screen
        if (!SLUG.test(job1[1])) return json(res, 400, {error: 'bad slug'});
        const j = rj(jobFile(job1[1]), null);
        if (j && j.state === 'running') return json(res, 409, {error: 'that one is still preparing'});
        try { fs.unlinkSync(jobFile(job1[1])); } catch {}
        return json(res, 200, {ok: true});
      }

      // the brief, taken on the phone so the chat does not have to ask for it
      if (job1 && req.method === 'PATCH') {
        const slug = job1[1];
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const j = rj(jobFile(slug), null);
        if (!j) return json(res, 404, {error: 'no such job'});
        if (j.state !== 'ready') return json(res, 409, {error: 'that one is not ready yet'});
        const b = await body(req);
        if ('brief' in b) j.brief = String(b.brief ?? '').slice(0, 4000);
        if ('go' in b) j.go = b.go === 'cut' ? 'cut' : 'plan';
        if ('style' in b && b.style && typeof b.style === 'object') {
          const st = b.style, ids = (x) => (Array.isArray(x) ? x.filter((i) => typeof i === 'string' && /^[a-z0-9-]{1,40}$/.test(i)).slice(0, 40) : []);
          j.style = {mode: ['brand', 'template', 'claude'].includes(st.mode) ? st.mode : 'brand', template: typeof st.template === 'string' ? st.template.slice(0, 40) : null,
            effects: ids(st.effects), claudeEffects: !!st.claudeEffects, captions: typeof st.captions === 'string' ? st.captions.slice(0, 40) : null, look: typeof st.look === 'string' && /^[a-z0-9-]{1,30}$/.test(st.look) ? st.look : null, energy: ['quiet', 'balanced', 'full'].includes(st.energy) ? st.energy : null,
            cutFirst: !!st.cutFirst, sameAs: typeof st.sameAs === 'string' && SLUG.test(st.sameAs) ? st.sameAs : null};
        }
        j.briefedAt = Date.now();
        wj(jobFile(slug), j);
        try { writeWaiting(j); } catch {}
        if ('go' in b) { pushEvent(slug, j.go); setAgent(slug, {state: 'queued', task: j.go, log: []}); }
        return json(res, 200, j);
      }

      // more footage for a reel that is already prepped: same project, prep runs again
      const addTo = /^\/api\/jobs\/([^/]+)\/add$/.exec(p);
      if (addTo && req.method === 'POST') {
        const slug = addTo[1];
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const j = rj(jobFile(slug), null);
        if (!j) return json(res, 404, {error: 'no such job'});
        if (running()) return json(res, 409, {error: 'something else is still being prepared'});
        const media = (fs.existsSync(INBOX) ? fs.readdirSync(INBOX) : []).filter((f) => !f.startsWith('.') && MEDIA_EXT.test(f));
        if (!media.length) return json(res, 400, {error: 'Nothing new to add: drop the footage in first.'});
        return json(res, 200, startJob(slug, [...(j.files ?? []), ...media], {brief: j.brief, go: j.go, style: j.style}));
      }

      // The inbox is shared, and `new` sweeps all of it into one project, so only one drop at a
      // time: a second drop while a job runs would be swallowed by the first project.
      if (p === '/api/inbox' && req.method === 'POST') {
        const r = running();
        if (r) return json(res, 409, {error: `“${r.slug}” is still being prepared. Wait for it to finish, then drop the next lot.`});
        const ct = req.headers['content-type'] ?? '';
        const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
        if (!/multipart\/form-data/i.test(ct) || !boundary) return json(res, 400, {error: 'expected a file drop'});
        fs.mkdirSync(INBOX, {recursive: true});
        let out;
        try {
          out = await parseMultipart(req, (boundary[1] ?? boundary[2]).trim(), {
            onFile: (name) => {
              const dest = path.resolve(INBOX, name);
              if (!dest.startsWith(INBOX + path.sep)) return null;
              if (fs.existsSync(dest)) {
                const stem = name.replace(/\.[^.]+$/, ''), ext = path.extname(name);
                for (let n = 2; n < 100; n++) {
                  const alt = path.resolve(INBOX, `${stem}-${n}${ext}`);
                  if (!alt.startsWith(INBOX + path.sep)) return null;
                  if (!fs.existsSync(alt)) return alt;
                }
                return null;
              }
              return dest;
            },
          });
        } catch (e) { return json(res, 413, {error: String(e.message || e)}); }
        return json(res, 200, {saved: out.files.map(({name, bytes}) => ({name, bytes})), skipped: out.skipped});
      }

      if (p === '/api/jobs' && req.method === 'POST') {
        const b = await body(req);
        const slug = String(b.slug ?? '').trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug)) return json(res, 400, {error: 'Use lower-case letters, numbers and dashes, like client-launch.'});
        const r = running();
        if (r) return json(res, 409, {error: `“${r.slug}” is still being prepared. Wait for it to finish.`});
        if (fs.existsSync(path.join(studio, 'projects', slug))) return json(res, 409, {error: `There is already a reel called “${slug}”. Pick another name.`});
        const media = (fs.existsSync(INBOX) ? fs.readdirSync(INBOX) : []).filter((f) => !f.startsWith('.') && MEDIA_EXT.test(f));
        if (!media.length) return json(res, 400, {error: 'Nothing to work with: drop the footage in first.'});
        return json(res, 200, startJob(slug, media));
      }

      // the style picker: every effect with its still, and the named templates
      // Taste test: what they picked from rounds of three, saved for the brand guide and every cut
      if (p === '/api/taste' && req.method === 'GET') return json(res, 200, rj(path.join(studio, 'brand', 'taste.json'), {}));
      if (p === '/api/taste' && req.method === 'POST') {
        const b = await body(req), ids = (x) => (Array.isArray(x) ? [...new Set(x.filter((i) => typeof i === 'string' && /^[a-z0-9-]{1,40}$/.test(i)))].slice(0, 80) : []);
        const taste = {at: Date.now(), love: ids(b.love), passed: ids(b.passed), rounds: Math.min(+b.rounds || 0, 100)};
        wj(path.join(studio, 'brand', 'taste.json'), taste);
        const vf = path.join(studio, 'brand', 'voice.json'), v = rj(vf, null);
        if (v) { v.effects = v.effects ?? {love: [], avoid: []}; v.effects.love = [...new Set([...(v.effects.love ?? []), ...taste.love])]; wj(vf, v); }
        return json(res, 200, taste);
      }
      if (p === '/api/effects' && req.method === 'GET') { const sc = path.join(studio, 'library', 'studio-catalog.json'); return json(res, 200, rj(fs.existsSync(sc) ? sc : path.join(studio, 'library', 'catalog.json'), {groups: [], effects: []})); }
      // starter looks (templates/looks/<id>/look.json) as named cards in the style picker
      if (p === '/api/looks' && req.method === 'GET') {
        const LD = path.join(studio, 'templates', 'looks');
        const ids = fs.existsSync(LD) ? fs.readdirSync(LD).filter((d) => fs.existsSync(path.join(LD, d, 'look.json'))) : [];
        return json(res, 200, ids.map((id) => { const l = rj(path.join(LD, id, 'look.json'), {}); return {id, name: l.name, blurb: l.blurb, img: `/looks/${id}/preview.jpg`}; }));
      }
      // What I know about your style: the taste the editor has learned, in plain words, with her yes on each rule
      if (p === '/api/style-memory' && req.method === 'GET') {
        const B = path.join(studio, 'brand');
        const v = rj(path.join(B, 'voice.json'), {}), r = rj(path.join(B, 'rules.json'), {}), w = rj(path.join(B, 'words.json'), {fix: {}}), b = rj(path.join(B, 'brand.json'), {});
        const cat = rj(path.join(studio, 'library', 'catalog.json'), {effects: []}).effects;
        const fxName = (id) => (cat.find((e) => e.id === id) ?? {}).name ?? id;
        const list = (x) => (Array.isArray(x) ? x.filter(Boolean) : []);
        return json(res, 200, {
          likes: [...list(v.effects?.love).map((id) => `Effect: ${fxName(id)}`), ...list(v.words?.says).map((x) => `Says "${x}"`), ...list(v.openers?.habits).map((x) => `Opens with ${x}`)],
          avoid: [...list(v.effects?.avoid).map((id) => `Effect: ${fxName(id)}`), ...list(v.words?.never).map((x) => `Never says "${x}"`), ...list(v.openers?.avoid).map((x) => `Never opens with ${x}`), ...(v.words?.punctuation ? [`Writing: ${v.words.punctuation}`] : []), ...list(b.rulesPlain)],
          rules: list(r.rules).map((x) => ({label: x.label ?? x.key, because: x.because ?? ''})),
          pending: list(r.pending).map((x) => ({id: x.id, label: x.label ?? x.key, because: x.because ?? '', example: x.evidence?.note ?? ''})),
          rejected: list(r.rejected).length,
          words: Object.entries(w.fix ?? {}).map(([a, b2]) => ({heard: a, write: b2})),
          ask: v.ask?.keywords ?? [], energy: b.reel?.energy ?? null,
        });
      }
      const sm = /^\/api\/style-memory\/rule$/.exec(p);
      if (sm && req.method === 'POST') {
        const b2 = await body(req);
        if (!/^[a-z0-9]{6,20}$/.test(b2.id ?? '') || !['approve', 'reject'].includes(b2.decision)) return json(res, 400, {error: 'bad request'});
        const args = ['rules', b2.decision, b2.id, ...(b2.decision === 'reject' ? [String(b2.why ?? 'not for me').slice(0, 200)] : [])];
        const r = await new Promise((resolve) => { const c = spawn(process.execPath, [path.join(studio, 'engine', 'reel.mjs'), ...args], {cwd: studio}); c.on('close', resolve); });
        return json(res, r === 0 ? 200 : 500, r === 0 ? {ok: true} : {error: 'That did not save. Try again.'});
      }
      if (p === '/api/templates' && req.method === 'GET') return json(res, 200, rj(path.join(studio, 'library', 'templates.json'), []));

      // the page paints its pills, ticks and titles in the owner's brand
      if (p === '/api/brand' && req.method === 'GET') {
        const b = rj(path.join(studio, 'brand', 'brand.json'), {});
        return json(res, 200, {name: b.name ?? null, energy: b.reel?.energy ?? 'balanced', colours: b.colours ?? b.colors ?? {}, fonts: Object.fromEntries(Object.entries(b.fonts ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/\.[^.]+$/, '') : (v?.family ?? null)]))});
      }

      const one = /^\/api\/reels\/([^/]+)$/.exec(p);
      if (one) {
        const slug = one[1];
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const reel = rj(reelFile(slug), null);
        if (!reel) return json(res, 404, {error: 'no such reel'});
        if (req.method === 'GET') return json(res, 200, {reel, notes: rj(notesFile(slug), [])});
        if (req.method === 'PATCH') {
          const b = await body(req);
          if (b.status && !['review', 'changes', 'approved'].includes(b.status)) return json(res, 400, {error: 'bad status'});
          if (b.status) {
            reel.status = b.status; reel.statusAt = Date.now(); wj(reelFile(slug), reel);
            // Approving a cut is the moment the notes on it are finished, so it is the moment they
            // are worth learning from. The page cannot run the engine, so it leaves the same kind of
            // cue the drop zone leaves: a file in the project that Claude picks up next session.
            if (b.status === 'approved') {
              const dir = path.join(studio, 'projects', slug);
              if (fs.existsSync(dir)) fs.writeFileSync(path.join(dir, 'LEARN-FROM-THIS.md'),
                `# ${slug} is approved\n\nThe owner is happy with this cut, so their notes on it are finished and worth learning from.\n\nRun:\n\n    node engine/reel.mjs learn ${slug}\n\nIt reads the notes they resolved, works out what was on screen at each one, and proposes a few\ncandidate rules with their evidence. Read them to them one at a time. Only on their yes:\n\n    node engine/reel.mjs rules approve <id>\n    node engine/reel.mjs rules reject <id> "why"\n\nDelete this file once you have done it.\n`);
            }
          }
          return json(res, 200, reel);
        }
      }

      const notes = /^\/api\/reels\/([^/]+)\/notes$/.exec(p);
      if (notes && req.method === 'POST') {
        const slug = notes[1];
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const reel = rj(reelFile(slug), null);
        if (!reel) return json(res, 404, {error: 'no such reel'});
        const b = await body(req);
        const text = String(b.text ?? '').trim();
        if (!text) return json(res, 400, {error: 'empty note'});
        const list = rj(notesFile(slug), []);
        const note = {id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Math.max(0, +(+b.t || 0).toFixed(2)), text: text.slice(0, 2000), done: false, version: +b.version || reel.version || 1, createdAt: Date.now()};
        list.push(note); list.sort((a, b2) => a.t - b2.t);
        wj(notesFile(slug), list);
        // a fresh note un-approves the cut: the editor has work to do again
        if (reel.status === 'approved') { reel.status = 'review'; wj(reelFile(slug), reel); }
        return json(res, 200, note);
      }

      const note = /^\/api\/reels\/([^/]+)\/notes\/([^/]+)$/.exec(p);
      if (note && req.method === 'PATCH') {
        const [, slug, id] = note;
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const list = rj(notesFile(slug), []);
        const n = list.find((x) => x.id === id);
        if (!n) return json(res, 404, {error: 'no such note'});
        const b = await body(req);
        if ('done' in b) n.done = !!b.done;
        if ('text' in b) n.text = String(b.text).slice(0, 2000);
        wj(notesFile(slug), list);
        return json(res, 200, n);
      }

      // Tap-to-edit: changes the owner makes on the page go straight into edit.json, the studio
      // renders quick previews itself, and the editor renders the next version when they ask.
      const SHELF = path.join(studio, 'brand', 'shelf');
      if (p === '/api/shelf' && req.method === 'GET') {
        const files = (fs.existsSync(SHELF) ? fs.readdirSync(SHELF) : []).filter((f) => /\.(png|jpe?g|gif|webp|heic)$/i.test(f));
        return json(res, 200, files.map((f) => ({file: f, url: '/api/shelf/' + encodeURIComponent(f)})));
      }
      const shf = /^\/api\/shelf\/([^/]+)$/.exec(p);
      if (shf && req.method === 'GET') { const f = path.resolve(SHELF, path.basename(shf[1])); return f.startsWith(SHELF + path.sep) ? sendFile(req, res, f) : json(res, 404, {error: 'no'}); }
      if (p === '/api/shelf' && req.method === 'POST') {
        const ct = req.headers['content-type'] ?? '';
        const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
        if (!/multipart\/form-data/i.test(ct) || !boundary) return json(res, 400, {error: 'expected a file drop'});
        fs.mkdirSync(SHELF, {recursive: true});
        try {
          const out = await parseMultipart(req, (boundary[1] ?? boundary[2]).trim(), {onFile: (name) => { if (!/\.(png|jpe?g|gif|webp|heic)$/i.test(name)) return null; const dest = path.resolve(SHELF, name); return dest.startsWith(SHELF + path.sep) ? dest : null; }});
          return json(res, 200, {added: out.files.map((f) => f.name), skipped: out.skipped});
        } catch (e) { return json(res, 400, {error: String(e.message || e)}); }
      }
      const sEd = /^\/api\/studio\/([^/]+)\/edit$/.exec(p);
      if (sEd) {
        const slug = sEd[1]; if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const dir = path.join(studio, 'projects', slug);
        if (req.method === 'GET') return json(res, 200, {...(editSummary(dir) ?? {}), colours: COLOURS.map(({id, name}) => ({id, name}))});
        if (req.method === 'POST') {
          const b = await body(req);
          try {
            const said = applyEdit(dir, b, {shelfDir: SHELF});
            if (b.op === 'word' && b.from && b.to) spawn(process.execPath, [path.join(studio, 'engine', 'reel.mjs'), 'words', 'add', String(b.from).slice(0, 60), String(b.to).slice(0, 60)], {cwd: studio, stdio: 'ignore'});
            return json(res, 200, {said, ...editSummary(dir)});
          } catch (e) { return json(res, 400, {error: String(e.message || e)}); }
        }
      }
      // quick previews the studio renders itself: colour looks at a moment, hook options, a short clip
      const sRun = /^\/api\/studio\/([^/]+)\/run$/.exec(p);
      if (sRun && req.method === 'POST') {
        const slug = sRun[1]; if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        if (lookBusy.has(slug)) return json(res, 409, {error: 'Still working on the last one, give it a few seconds.'});
        const b = await body(req), n = (x) => String(Math.max(0, +x || 0).toFixed(2));
        const args = b.what === 'colours' ? ['colours', slug, n(b.t)] : b.what === 'hooks' ? ['hooks', slug] : b.what === 'clip' ? ['clip', slug, n(b.from), n(b.to)] : b.what === 'moments' ? ['moments', slug] : null;
        if (!args) return json(res, 400, {error: 'unknown preview'});
        lookBusy.add(slug); lookErr.delete(slug);
        const c = spawn(process.execPath, [path.join(studio, 'engine', 'reel.mjs'), ...args], {cwd: studio}); let err = '';
        c.stderr.on('data', (d) => { err += d; });
        c.on('close', (code) => { lookBusy.delete(slug); if (code !== 0) lookErr.set(slug, (err.trim().split('\n').filter((l) => /Error/.test(l)).pop() || 'That preview did not work.').replace(/^.*Error: /, '')); });
        return json(res, 202, {ok: true});
      }
      const sOut = /^\/api\/studio\/([^/]+)\/out\/(colour|hooks|clips)\/([a-z0-9-]+\.(?:jpg|json|mp4))$/.exec(p);
      if (sOut && req.method === 'GET') {
        if (!SLUG.test(sOut[1])) return json(res, 400, {error: 'bad slug'});
        const f = path.join(studio, 'projects', sOut[1], 'out', sOut[2], sOut[3]);
        if (!fs.existsSync(f)) return json(res, 404, {error: 'not yet'});
        return sOut[3].endsWith('.json') ? json(res, 200, rj(f, {})) : sendFile(req, res, f);
      }
      // the owner's tapped changes are in edit.json: hand them to the editor for the next version
      const sRen = /^\/api\/studio\/([^/]+)\/render$/.exec(p);
      if (sRen && req.method === 'POST') {
        const slug = sRen[1]; if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const dir = path.join(studio, 'projects', slug), lf = path.join(dir, 'STUDIO-EDITS.json');
        const changes = rj(lf, {changes: []}).changes;
        if (!changes.length) return json(res, 400, {error: 'Nothing changed yet.'});
        const b = await body(req);
        pushEvent(slug, 'render', ['They changed these on the studio page (already written into edit.json; render it as it stands, check it, and put it on the review page):', ...changes.map((c) => '- ' + c.said), b.text ? 'They also said: ' + String(b.text).slice(0, 800) : ''].filter(Boolean).join('\n'));
        setAgent(slug, {state: 'queued', task: 'cut'});
        fs.renameSync(lf, path.join(dir, `STUDIO-EDITS.sent-${Date.now()}.json`));
        return json(res, 200, agentOf(slug));
      }

      // the editor's side of a reel: status, live log, the plan
      const ag = /^\/api\/agent\/([^/]+)$/.exec(p);
      if (ag && req.method === 'GET') { if (!SLUG.test(ag[1])) return json(res, 400, {error: 'bad slug'}); return json(res, 200, agentOf(ag[1])); }
      // the latest frames the editor is checking, so she can see the work
      const agStill = /^\/api\/agent\/([^/]+)\/still$/.exec(p);
      if (agStill && req.method === 'GET') {
        if (!SLUG.test(agStill[1])) return json(res, 400, {error: 'bad slug'});
        const f = path.join(studio, 'projects', agStill[1], 'out', 'stills', 'stills.png');
        return fs.existsSync(f) ? sendFile(req, res, f) : json(res, 404, {error: 'no stills yet'});
      }
      // Try another look: the studio renders the alternatives itself (no editor needed), and swaps
      // in the ones she picks, then refreshes the Moments board.
      const lk = /^\/api\/agent\/([^/]+)\/(try|choose)$/.exec(p);
      if (lk && req.method === 'POST') {
        const [, slug, what] = lk;
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        if (lookBusy.has(slug)) return json(res, 409, {error: 'Still working on the last one, give it a few seconds.'});
        const b = await body(req);
        const runs = what === 'try'
          ? [['looks', slug, String(+b.n)]]
          : [...(Array.isArray(b.picks) ? b.picks : []).filter((x) => /^[abc]$/.test(x.look)).map((x) => ['pick', slug, String(+x.moment), x.look]), ['moments', slug]];
        if (what === 'try' && !(+b.n > 0)) return json(res, 400, {error: 'which moment?'});
        lookBusy.add(slug);
        (async () => {
          for (const args of runs) {
            const r = await new Promise((resolve) => { const c = spawn(process.execPath, [path.join(studio, 'engine', 'reel.mjs'), ...args], {cwd: studio}); let err = ''; c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({code, err})); });
            if (r.code !== 0) { lookErr.set(slug, (r.err.trim().split('\n').filter((l) => /Error|no moment|nothing to swap/.test(l)).pop() || 'That did not work.').replace(/^.*Error: /, '')); break; }
          }
          lookBusy.delete(slug);
        })();
        lookErr.delete(slug);
        return json(res, 202, {ok: true});
      }
      const lks = /^\/api\/agent\/([^/]+)\/looking$/.exec(p);
      if (lks && req.method === 'GET') return json(res, 200, {busy: lookBusy.has(lks[1]), error: lookErr.get(lks[1]) ?? null});

      // her answer to a plan: yes, or a change
      // the Moments board: numbered stills (and preview clips) of every on-screen moment
      const mo = /^\/api\/agent\/([^/]+)\/moments$/.exec(p);
      if (mo && req.method === 'GET') {
        if (!SLUG.test(mo[1])) return json(res, 400, {error: 'bad slug'});
        return json(res, 200, rj(path.join(studio, 'projects', mo[1], 'out', 'moments', 'moments.json'), {moments: []}));
      }
      const mf = /^\/api\/agent\/([^/]+)\/moment\/(m\d{2}(?:-[abc])?\.(?:png|mp4))$/.exec(p);
      if (mf && req.method === 'GET') {
        if (!SLUG.test(mf[1])) return json(res, 400, {error: 'bad slug'});
        return sendFile(req, res, path.join(studio, 'projects', mf[1], 'out', 'moments', mf[2]));
      }
      const cutj = /^\/api\/agent\/([^/]+)\/cut(?:\/(rough\.mp4))?$/.exec(p);
      if (cutj && req.method === 'GET') {
        if (!SLUG.test(cutj[1])) return json(res, 400, {error: 'bad slug'});
        if (cutj[2]) return sendFile(req, res, path.join(studio, 'projects', cutj[1], 'out', 'cut', 'rough.mp4'));
        return json(res, 200, rj(path.join(studio, 'projects', cutj[1], 'out', 'cut', 'cut.json'), {lines: []}));
      }
      if (p === '/api/last-style' && req.method === 'GET') {
        const except = url.searchParams.get('except');
        const j = listJobs().filter((x) => x.style && x.slug !== except).sort((a, b) => (b.briefedAt ?? b.startedAt ?? 0) - (a.briefedAt ?? a.startedAt ?? 0))[0];
        return json(res, 200, j ? {slug: j.slug, style: j.style} : {});
      }
      const act = /^\/api\/agent\/([^/]+)\/(approve|change|notes|render|moments|preview|cutlock|looks|picks)$/.exec(p);
      if (act && req.method === 'POST') {
        const [, slug, what] = act;
        if (!SLUG.test(slug)) return json(res, 400, {error: 'bad slug'});
        const b = await body(req);
        if (what === 'change' && !String(b.text ?? '').trim()) return json(res, 400, {error: 'Say what to change first.'});
        pushEvent(slug, what, b.text);
        if (!['preview', 'looks'].includes(what)) setAgent(slug, {state: 'queued', task: {approve: 'cut', render: 'cut', moments: 'cut', cutlock: 'cut', picks: 'moments'}[what] ?? what});
        return json(res, 200, agentOf(slug));
      }

      if (p.startsWith('/api/')) return json(res, 404, {error: 'no such endpoint'});

      // static: the page, and the previews under /media/
      if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(ROOT, 'index.html'));
      if (/^\/looks\/[a-z0-9-]+\/preview\.jpg$/.test(p)) return sendFile(req, res, path.join(studio, 'templates', p));
      if (p.startsWith('/library/img/')) {
        const LIB = path.join(studio, 'library', 'img');
        const f = path.resolve(LIB, '.' + p.slice('/library/img'.length));
        if (!f.startsWith(LIB + path.sep)) { res.writeHead(403); return res.end('no'); }
        return sendFile(req, res, f);
      }
      if (p.startsWith('/media/')) {
        const f = path.resolve(MEDIA, '.' + p.slice('/media'.length));
        if (!f.startsWith(MEDIA + path.sep)) { res.writeHead(403); return res.end('no'); }
        return sendFile(req, res, f);
      }
      res.writeHead(404, {'content-type': 'text/plain'}); res.end('not found');
    } catch (e) {
      json(res, 500, {error: String(e && e.message || e)});
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve({server, port: server.address().port, lan: lanAddress(), key: KEY}));
  });
}
