// Reel Studio renderer v2. Every visual rule mirrors the reel brand guide.
// Two fonts only: a serif for captions and a display face for hooks, punch words and labels.
// Which fonts and colours come from brand/brand.json (see brand.ts), passed in as the `brand` prop.
import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing, delayRender, continueRender,
} from 'remotion';

import {Brand, DEFAULT_BRAND, STANDIN, displayStack, serifStack, scriptStack, fontFaceCss} from './brand';

// Brand palette and type stacks. Filled from the brand prop by applyBrand() before anything renders;
// the keys keep the renderer's own names (yellow = punch colour, blue = accent, ink = dark text/boxes).
// onBright is the dark text colour used when the footage behind a hook or end card is too bright for
// white or the punch colour. It is one of the brand's own colours, named by reel.safe.onBrightText.
export const C = {yellow: '', blue: '', offwhite: '', charcoal: '', white: '', ink: '', onBright: ''};
let SERIF = '';
let DISPLAY = '';
let STRETCH = '112%'; // brand.json reel.displayStretch: the house look runs the display font wide
let SCRIPT = '';
let fontFaces = '';
let HANDLE = 'yourhandle'; // brand.json "handle": the account shown on DM / follow cards
let applied: Brand | undefined;
// the brand's own dark colour as an rgb triple, for dims, hazes and dark UI panels (never a hard-coded colour,
// so each brand's look stays its own)
let TINT = '51,51,51';
const hexRgb = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return '51,51,51'; const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
const tint = (a: number) => `rgba(${TINT},${a})`;
export function applyBrand(b: Brand) {
  if (applied === b) return;
  applied = b;
  Object.assign(C, {yellow: b.colours.punch, blue: b.colours.accent, offwhite: b.colours.paper, charcoal: b.colours.ink, white: b.colours.white, ink: b.colours.dark});
  C.onBright = b.colours[b.reel?.safe?.onBrightText ?? 'ink'] ?? b.colours.ink;
  TINT = hexRgb(b.colours.dark ?? b.colours.ink ?? '#333333');
  SERIF = serifStack(b);
  DISPLAY = displayStack(b);
  STRETCH = (b as any).reel?.displayStretch ?? '112%';
  SCRIPT = scriptStack(b);
  fontFaces = fontFaceCss(b, staticFile);
  HANDLE = b.handle ?? 'yourhandle';
}
applyBrand(DEFAULT_BRAND);

// ---------- plan types ----------
export type Style = 'punch' | 'caps' | 'yellow' | 'hide';
export type Word = {w: string; s: number; e: number; style?: Style};
export type Segment = {src: string; start: number; dur: number; srcIn: number; zoom?: number; focusY?: number; volume?: number};
export type Insert = {src: string; start: number; dur: number; kind: 'image' | 'video'; pos?: 'top' | 'full' | 'pip' | 'stack-left' | 'stack-right'; srcIn?: number; width?: number; y?: number; rotate?: number; muted?: boolean; tilt?: boolean};
export type Fx =
  | {type: 'backdrop'; src: string; kind: 'image' | 'video'; start: number; dur: number; srcIn?: number; height?: number; subjectFront?: boolean; pos?: number}
  | {type: 'band'; src: string; kind: 'image' | 'video'; start: number; dur: number; srcIn?: number; height?: number; shiftMain?: number; pos?: number}
  | {type: 'sticker'; src: string; start: number; dur: number; x?: number; y?: number; width?: number; rotate?: number; outline?: boolean; strike?: number}
  | {type: 'prompt'; text: string; start: number; dur: number; y?: number; label?: string; files?: string[]}
  | {type: 'counter'; from: number; to: number; start: number; dur: number; format?: 'time' | 'int' | 'money' | 'k'; y?: number; label?: string; size?: number; roll?: boolean}
  | {type: 'bigword'; text: string; start: number; dur: number; y?: number; size?: number; colour?: string; behind?: boolean; letters?: boolean; strike?: number; font?: 'serif' | 'display'}
  | {type: 'colourbg'; colour?: string; start: number; dur: number; lines?: {t: string; f?: 'serif' | 'display'; c?: string; at?: number}[]; y?: number}
  | {type: 'dm'; keyword: string; text?: string; start: number; dur: number; handle?: string; verb?: string; reply?: string}
  | {type: 'wall'; srcs: string[]; start: number; dur: number}
  | {type: 'chat'; start: number; dur: number; y?: number; msgs: {from: 'me' | 'ai'; text: string; at: number}[]}
  | {type: 'folder'; start: number; dur: number; name?: string; srcs: string[]; y?: number}
  | {type: 'deck'; srcs: string[]; start: number; dur: number; mode?: 'fan' | 'snap' | 'wall' | 'scatter'; subjectFront?: boolean; y?: number}
  | {type: 'pills'; text: string; count?: number; start: number; dur: number; y?: number}
  | {type: 'orbit'; srcs: string[]; start: number; dur: number; y?: number; rx?: number; ry?: number; speed?: number}
  | {type: 'uiworld'; start: number; dur: number; text: string; app?: string; colour?: string}
  | {type: 'framebreak'; start: number; dur: number; scale?: number; bg?: string}
  | {type: 'pullback'; start: number; dur: number; tasks?: {text: string; at: number}[]; title?: string}
  | {type: 'vertigo'; start: number; dur: number; amount?: number}
  | {type: 'dzoom'; start: number; dur: number; scale?: number; focusY?: number}
  | {type: 'phone'; src: string; kind: 'image' | 'video'; start: number; dur: number; srcIn?: number; side?: 'left' | 'right'; y?: number; views?: [number, number]; tag?: string}
  | {type: 'tasks'; start: number; dur: number; title?: string; items: {text: string; at: number}[]; y?: number; x?: number}
  | {type: 'chart'; start: number; dur: number; points: number[]; label?: string; y?: number}
  | {type: 'paper'; start: number; dur: number; word: string}
  | {type: 'doodle'; start: number; dur: number}
  | {type: 'cover'; start: number; dur: number; title: string; lines?: string[]}
  | {type: 'glass'; start: number; dur: number; text: string; y?: number; size?: number}
  | {type: 'rip'; start: number; dur?: number}
  | {type: 'glitch'; start: number; dur?: number}
  | {type: 'canvas'; start: number; dur: number; colour?: string}
  | {type: 'timeline'; start: number; dur: number; y?: number}
  | {type: 'burn'; text: string; start: number; dur: number; y?: number; size?: number}
  | {type: 'annotate'; text: string; start: number; dur: number; x: number; y: number; toX: number; toY: number}
  | {type: 'receipts'; start: number; dur: number; items: {label: string; price: number}[]; total?: number; strikeAt?: number; y?: number}
  | {type: 'spotlight'; start: number; dur: number; items: {label: string; icon?: string}[]; pick?: number; pickAt?: number; y?: number}
  | {type: 'statbars'; start: number; dur: number; title?: string; rows: {label: string; value: number}[]; y?: number}
  | {type: 'flow'; start: number; dur: number; steps: string[]; y?: number}
  | {type: 'calendar'; start: number; dur: number; days?: string[]; rows?: number; fill?: number[][]; y?: number; title?: string}
  | {type: 'dropdown'; start: number; dur: number; label?: string; options: string[]; pick: number; y?: number}
  | {type: 'dial'; start: number; dur: number; label?: string; from?: number; to?: number; y?: number}
  | {type: 'swatches'; start: number; dur: number; colours?: string[]; y?: number}
  | {type: 'note'; start: number; dur: number; title?: string; items: {text: string; strike?: number}[]; y?: number}
  | {type: 'envelope'; start: number; dur: number; src?: string; label?: string; y?: number}
  | {type: 'header'; text: string; start: number; dur: number}
  | {type: 'comment'; keyword: string; start: number; dur: number; handle?: string; follow?: boolean}
  | {type: 'zoomthrough'; start: number; dur?: number}
  | {type: 'zoomblur'; start: number; dur?: number}
  | {type: 'flash'; start: number; dur?: number}
  | {type: 'label'; text: string; small?: string; start: number; dur: number; y?: number; bg?: 'blue' | 'black'};
export type Plan = {
  fps: number; duration: number; segments: Segment[];
  grade?: {saturate?: number; contrast?: number; brightness?: number};
  topFade?: boolean | number;   // true = the standard 14% shade, a number = that height (0..1) for bright backgrounds
  // ink: draw the hook in the brand's dark text colour instead of white/punch, for bright footage.
  // reel.mjs measures the footage behind it and sets this; a cut may set it itself either way.
  hook?: {underline?: number; text: string; start?: number; end: number; mode?: 'top' | 'behind' | 'stack' | 'bars'; y?: number; size?: number; accentLines?: number[]; ink?: boolean};
  captions: {mode: 'word' | 'phrase' | 'stack' | 'off'; y: number; size?: number; words: Word[]; maxWords?: number; entry?: 'pop' | 'blur'; box?: boolean};
  inserts?: Insert[];
  fx?: Fx[];
  labels?: {text: string; small?: string; start: number; end: number; y?: number}[];
  checklist?: {title: string; start: number; end: number; y?: number; slots?: number; items: {text: string; at: number}[]};
  end?: {start: number; lines: string[]; y?: number; ink?: boolean};
  cutout?: {dir: string; frames: number[]};
  cutRanges?: [number, number][];
  music?: {src: string; volume?: number};
  audio?: {src: string; start: number; srcIn: number; dur: number; volume?: number}[];
  sfx?: {src: string; at: number; volume?: number}[];
};

const display = (size: number, color = C.white): React.CSSProperties => ({fontFamily: DISPLAY, fontWeight: 900, fontStretch: STRETCH, textTransform: 'uppercase', fontSize: size, lineHeight: 0.92, letterSpacing: '0.005em', color});
const serif = (size: number, color = C.white): React.CSSProperties => ({fontFamily: SERIF, fontWeight: 300, fontSize: size, lineHeight: 1.05, color, letterSpacing: '-0.005em'});
// readability: tight dark edge + wide soft glow so a thin caption font holds on white walls
const SOFT = '0 0 2px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.35), 0 0 22px rgba(0,0,0,0.45)';
// captions land a beat early: Whisper stamps words late, and text that trails the voice reads as lag
const LEAD = 0.14;

// ---------- helpers ----------
const useT = () => useCurrentFrame() / useVideoConfig().fps;
// Design v2 (edit.json "design": 2): things snap in over 4 frames with an ease-out and no bounce,
// and leave on a hard cut. v1 keeps the springy pop and the short fade.
let DESIGN = 1;
const pop = (t: number, start: number, fps: number) => DESIGN === 2
  ? interpolate((t - start) * fps, [0, 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)})
  : spring({frame: Math.max(0, (t - start) * fps), fps, config: {damping: 14, stiffness: 180, mass: 0.6}});
const within = (t: number, s: number, d: number) => t >= s && t < s + d;
const fadeOut = (t: number, end: number, len = 0.15) => DESIGN === 2 ? (t < end ? 1 : 0) : interpolate(t, [end - len, end], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
// videos outside the main track play from their own start time, so wrap them in a Sequence that begins at `at`
const Media: React.FC<{src: string; kind: 'image' | 'video'; srcIn?: number; at: number; style: React.CSSProperties; muted?: boolean}> = ({src, kind, srcIn, at, style, muted}) =>
  kind === 'video' ? (
    <Sequence from={Math.round(at * 30)} layout="none"><OffthreadVideo src={staticFile(src)} startFrom={Math.round((srcIn ?? 0) * 30)} muted={muted ?? true} style={style} /></Sequence>
  ) : <Img src={staticFile(src)} style={style} />;


// whole-video moves (frame break, pull-back, vertigo, digital zoom): one transform for the footage, one for her cutout
type VX = {s: number; tx: number; ty: number; clip: boolean; radius: number; cutS: number; bg?: string; inset?: number; bezel?: number; face?: boolean};
const tl0 = (f: any, t: number) => t - f.start;
const videoXform = (plan: Plan, t: number): VX => {
  const v: VX = {s: 1, tx: 0, ty: 0, clip: false, radius: 0, cutS: 1};
  for (const f of plan.fx ?? []) {
    if (!within(t, f.start, f.dur) || !(['framebreak', 'pullback', 'vertigo', 'dzoom', 'phoneme', 'shake'].includes(f.type as string) || ((f.type as string) === 'browser' && (f as any).mini)) || (f.dur < 0.7 && (f.type as string) !== 'shake')) continue;
    // browser.mini: she becomes a small green-screen cutout in the corner over the browser window
    if ((f.type as string) === 'browser') { const g = f as any; v.cutS *= g.mini; v.tx += g.miniX ?? 300; v.ty += g.miniY ?? 420; continue; }
    if ((f.type as string) === 'shake') { const e = tl0(f, t); const a = ((f as any).amount ?? 26) * Math.exp(-e * 9); v.tx += Math.sin(e * 83) * a; v.ty += Math.cos(e * 71) * a * 0.7; continue; }
    const io = interpolate(t, [f.start, f.start + 0.35, f.start + f.dur - 0.3, f.start + f.dur], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
    if (f.type === 'framebreak') { const k = 1 - (1 - (f.scale ?? 0.68)) * io; v.s *= k; v.cutS *= k; v.clip = true; v.radius = 46 * io; v.ty += 120 * io; v.bg = f.bg ?? C.ink; v.inset = 38 * io; }
    if ((f.type as string) === 'phoneme') { const g = f as any; const k = 1 - (1 - (g.scale ?? 0.5)) * io; v.s *= k; v.cutS *= k; v.clip = true; v.radius = 90 * io; v.ty += (g.ty ?? 0.08) * 1920 * io; v.bg = g.bg ?? C.blue; v.bezel = io; }
    if (f.type === 'pullback') { const k = 1 - 0.48 * io; v.s *= k; v.cutS *= k; v.clip = true; v.radius = 30 * io; v.tx += 190 * io; v.ty += 60 * io; v.bg = C.offwhite; }
    // vertigo: she holds still (cutout pushed in) while the room behind her pulls away; the room is never bigger than her, so no ghost of her shows
    if (f.type === 'vertigo') { const amt = f.amount ?? 0.35; const hold = interpolate(t, [f.start, f.start + 0.25, f.start + f.dur - 0.3, f.start + f.dur], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)}); const p = interpolate(t, [f.start + 0.25, f.start + f.dur - 0.3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin)}); v.s *= 1 + amt * hold * (1 - p); v.cutS *= 1 + amt * hold; v.face = true; }
    if (f.type === 'dzoom') { const a = interpolate(t, [f.start, f.start + 0.18], [1, f.scale ?? 1.3], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}); v.s *= a; v.cutS *= a; v.face = true; }
  }
  return v;
};

// ---------- main footage ----------
const Main: React.FC<{seg: Segment; plan: Plan}> = ({seg, plan}) => {
  const tl = useT() + seg.start; // absolute time
  const dr = (plan as any).drift ?? 0;
  const z = (seg.zoom ?? 1) * (1 + dr * Math.min(1, Math.max(0, (tl - seg.start) / Math.max(seg.dur, 0.1))));
  const band = (plan.fx ?? []).find((f) => f.type === 'band' && within(tl, f.start, f.dur)) as Extract<Fx, {type: 'band'}> | undefined;
  const shift = band ? (band.shiftMain ?? 0) * 1920 * interpolate(tl, [band.start, band.start + 0.25, band.start + band.dur - 0.25, band.start + band.dur], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)}) : 0;
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {(() => {
        const vx = videoXform(plan, tl);
        return (
          <div style={{position: 'absolute', inset: 0, transformOrigin: vx.face ? `50% ${(seg.focusY ?? 0.35) * 100}%` : undefined, transform: `translate(${vx.tx}px, ${vx.ty}px) scale(${vx.s})`, borderRadius: vx.radius / Math.max(vx.s, 0.01), overflow: vx.clip ? 'hidden' : 'visible', clipPath: vx.inset ? `inset(${vx.inset}% 0% 0% 0% round ${vx.radius}px)` : undefined, boxShadow: vx.bezel ? `0 0 0 ${26 / Math.max(vx.s, 0.01)}px #2a2a2a, 0 30px 80px rgba(0,0,0,0.45)` : vx.clip ? '0 30px 80px rgba(0,0,0,0.45)' : undefined}}>
            <OffthreadVideo src={staticFile(seg.src)} startFrom={Math.round(seg.srcIn * 30)} volume={seg.volume ?? 1}
              style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${((seg as any).focusX ?? 0.5) * 100}% 50%`, transform: `translateY(${shift}px) scale(${z})`, transformOrigin: `${((seg as any).focusX ?? 0.5) * 100}% ${(seg.focusY ?? 0.35) * 100}%`}} />
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};

// paper cut and doodle boil draw a thick white sticker outline around her (doodle boil wobbles it)
const outlineOn = (plan: Plan, t: number): false | 'solid' | 'boil' => {
  for (const f of plan.fx ?? []) {
    if (!within(t, f.start, f.dur)) continue;
    if (f.type === 'doodle') return 'boil';
    if (f.type === 'paper') return 'solid';
  }
  return false;
};
// the person cut out of the main footage, drawn above backdrops / behind-text
const CutoutLayer: React.FC<{plan: Plan}> = ({plan}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  const frames = React.useMemo(() => new Set(plan.cutout?.frames ?? []), [plan.cutout]);
  if (!plan.cutout || !(plan.cutRanges ?? []).some(([s, e]) => t >= s && t < e)) return null;
  const i = Math.round(t * fps);
  if (!frames.has(i)) return null;
  const seg = plan.segments.find((s) => t >= s.start && t < s.start + s.dur);
  const vx = videoXform(plan, t);
  const outline = outlineOn(plan, t);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, transformOrigin: vx.face ? `50% ${(seg?.focusY ?? 0.35) * 100}%` : undefined, transform: `translate(${vx.tx}px, ${vx.ty}px) scale(${vx.cutS})`}}>
        {outline && (
          <Img src={staticFile(`${plan.cutout.dir}/frame_${String(i).padStart(5, '0')}.png`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${((seg as any)?.focusX ?? 0.5) * 100}% 50%`, transform: `scale(${(seg?.zoom ?? 1) * (1 + ((plan as any).drift ?? 0) * Math.min(1, Math.max(0, (t - (seg?.start ?? 0)) / Math.max(seg?.dur ?? 1, 0.1))))})`, transformOrigin: `${((seg as any)?.focusX ?? 0.5) * 100}% ${(seg?.focusY ?? 0.35) * 100}%`,
            filter: `${outline === 'boil' ? `url(#boil${Math.floor(t * 8) % 3}) ` : ''}drop-shadow(0 0 0 #fff) drop-shadow(9px 0 0 #fff) drop-shadow(-9px 0 0 #fff) drop-shadow(0 9px 0 #fff) drop-shadow(0 -9px 0 #fff)`}} />
        )}
        <Img src={staticFile(`${plan.cutout.dir}/frame_${String(i).padStart(5, '0')}.png`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${((seg as any)?.focusX ?? 0.5) * 100}% 50%`, transform: `scale(${(seg?.zoom ?? 1) * (1 + ((plan as any).drift ?? 0) * Math.min(1, Math.max(0, (t - (seg?.start ?? 0)) / Math.max(seg?.dur ?? 1, 0.1))))})`, transformOrigin: `${((seg as any)?.focusX ?? 0.5) * 100}% ${(seg?.focusY ?? 0.35) * 100}%`}} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- b-roll behind her: covers the top, blur-fades into her shot at the bottom ----------
const fadeMask = (h: number) => `linear-gradient(180deg, #000 0%, #000 ${h * 100 - 16}%, transparent ${h * 100}%)`;
const bandMask = (h: number) => `linear-gradient(180deg, transparent ${h * 100 - 22}%, #000 ${h * 100 - 10}%, #000 ${h * 100 - 2}%, transparent ${h * 100 + 6}%)`;
const BrollFill: React.FC<{f: Extract<Fx, {type: 'backdrop' | 'band'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const h = f.height ?? (f.type === 'band' ? 0.5 : 0.8);
  const a = interpolate(t, [f.start, f.start + 0.12], [0, 1], {extrapolateRight: 'clamp'}) * fadeOut(t, f.start + f.dur, 0.12);
  const boxH = f.type === 'band' ? `${h * 100 + 8}%` : '100%';
  // pos picks which slice of a tall screenshot shows (0 = top, 1 = bottom) so the key line sits above her head
  const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', objectPosition: `50% ${(f.pos ?? 0.5) * 100}%`};
  return (
    <AbsoluteFill style={{opacity: a}}>
      {/* soft blurred skirt that melts the edge into her footage */}
      <div style={{position: 'absolute', inset: 0, height: boxH, WebkitMaskImage: bandMask(f.type === 'band' ? 1 : h), maskImage: bandMask(f.type === 'band' ? 1 : h), filter: 'blur(26px) saturate(1.05)'}}>
        <Media src={f.src} kind={f.kind} srcIn={f.srcIn} at={f.start} style={style} />
      </div>
      <div style={{position: 'absolute', inset: 0, height: boxH, WebkitMaskImage: fadeMask(f.type === 'band' ? 0.9 : h), maskImage: fadeMask(f.type === 'band' ? 0.9 : h)}}>
        <Media src={f.src} kind={f.kind} srcIn={f.srcIn} at={f.start} style={style} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- solid brand colour behind her, with title lines ----------
const ColourBg: React.FC<{f: Extract<Fx, {type: 'colourbg'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  return (
    <AbsoluteFill style={{background: f.colour ?? C.blue}}>
      <AbsoluteFill style={{top: `${(f.y ?? 0.08) * 100}%`, alignItems: 'center'}}>
        <div style={{textAlign: 'center', maxWidth: 960}}>
          {(f.lines ?? []).map((l, i) => {
            const at = l.at ?? f.start;
            if (t < at) return null;
            const p = pop(t, at, fps);
            const st = l.f === 'serif' ? serif(96, l.c ?? C.ink) : display(150, l.c ?? C.white);
            return <div key={i} style={{...st, transform: `translateY(${(1 - p) * 30}px)`, opacity: p}}>{l.t}</div>;
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- giant word, letter by letter (optionally behind her) ----------
const BigWord: React.FC<{f: Extract<Fx, {type: 'bigword'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  // design v2: a big word always fits the frame (the wide display font runs about 0.85em a capital)
  if (DESIGN === 2 && (f as any).fit !== false) {
    const em = f.font === 'serif' ? 0.5 : (f.font as string) === 'script' ? 0.45 : STRETCH === '125%' ? 0.86 : 0.72;
    f = {...f, size: Math.min(f.size ?? 260, Math.floor(960 / Math.max(1, f.text.length * em)))};
  }
  const letters = [...f.text];
  const n = f.letters === false ? letters.length : Math.min(letters.length, Math.floor((t - f.start) / 0.045) + 1);
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.12) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      {(f as any).kicker && <div style={{fontFamily: (f as any).kickerFont === 'serif' ? SERIF : DISPLAY, fontWeight: 900, fontStretch: STRETCH, fontSize: (f as any).kickerSize ?? 26, letterSpacing: '0.28em', textTransform: 'uppercase', color: (f as any).kickerColour ?? f.colour ?? C.white, marginBottom: 14, textShadow: `0 2px 14px ${tint(0.45)}`}}>{(f as any).kicker}</div>}
      <div style={{...((f.font as string) === 'script' ? {fontFamily: SCRIPT, fontSize: f.size ?? 260, color: f.colour ?? C.white, lineHeight: 0.95} : (f.font as string) === 'italic' ? {...serif(f.size ?? 260, f.colour ?? C.white), fontWeight: 400, fontStyle: 'italic', lineHeight: 0.9} : f.font === 'serif' ? {...serif(f.size ?? 260, f.colour ?? C.white), fontWeight: 400, fontWeight: 400, lineHeight: 0.9} : display(f.size ?? 230, f.colour ?? C.white)), whiteSpace: 'nowrap', position: 'relative', textShadow: (f as any).shadow ?? '0 4px 40px rgba(0,0,0,0.18)'}}>
        {letters.map((c, i) => <span key={i} style={{opacity: i < n ? 1 : 0}}>{c}</span>)}
        {f.strike !== undefined && t >= f.strike && (
          <div style={{position: 'absolute', left: '-4%', top: '46%', height: '0.11em', background: C.yellow, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.25)', width: `${interpolate(t, [f.strike, f.strike + 0.22], [0, 108], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)})}%`}} />
        )}
      </div>
    </AbsoluteFill>
  );
};

// ---------- hook ----------
// One line of hook or end-card lettering. The light look is unchanged: white, with the accent line
// in the punch colour. `ink` flips it to the brand's dark text colour for footage too bright to read
// white on, and the accent line keeps its punch colour as a highlight behind the dark letters, which
// is the same move the captions already make on a light board. The drop shadow goes with it: a dark
// glow under dark letters only muddies them.
const inkLine = (ink: boolean | undefined, accent: boolean, size: number, shadow?: string, colourOnly = false): React.CSSProperties => {
  const base = colourOnly ? {} : display(size);
  if (!ink) return {...base, color: accent ? C.yellow : C.white, textShadow: shadow};
  return {
    ...base, color: C.onBright, textShadow: 'none',
    ...(accent ? {background: C.yellow, padding: '0 0.07em'} : {}),
    width: 'fit-content', marginLeft: 'auto', marginRight: 'auto',
  };
};

const Hook: React.FC<{hook: NonNullable<Plan['hook']>}> = ({hook}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  const start = hook.start ?? 0;
  if (t < start || t > hook.end) return null;
  const lines = hook.text.split('\n');
  const out = fadeOut(t, hook.end, 0.2);
  const acc = hook.accentLines ?? [];
  if (hook.mode === 'behind') {
    const p = pop(t, start, fps);
    return (
      <AbsoluteFill style={{alignItems: 'center', top: `${(hook.y ?? 0.1) * 100}%`, opacity: out}}>
        <div style={{textAlign: 'center', transform: `scale(${0.92 + 0.08 * p})`}}>
          {lines.map((l, i) => <div key={i} style={inkLine(hook.ink, (acc.length ? acc : [1]).includes(i), hook.size ?? 150, '0 4px 30px rgba(0,0,0,0.18)')}>{l}</div>)}
        </div>
      </AbsoluteFill>
    );
  }
  if (hook.mode === 'bars') {
    // highlight bars: each line on its own bar, sliding in one after another
    return (
      <AbsoluteFill style={{alignItems: 'center', top: `${(hook.y ?? 0.07) * 100}%`, opacity: out, gap: 10}}>
        {lines.map((l, i) => {
          const p = (hook as any).static ? 1 : spring({frame: Math.max(0, (t - start - i * 0.12) * fps), fps, config: {damping: 15, stiffness: 200, mass: 0.6}});
          const yellow = (acc.length ? acc : [0]).includes(i);
          return (
            <div key={i} style={{background: yellow && !(hook as any).yellowText ? C.yellow : ((hook as any).bar === 'none' ? 'transparent' : ((hook as any).bar ?? C.ink)), padding: '14px 26px 10px', transform: `translateX(${(1 - p) * (i % 2 ? 260 : -260)}px) rotate(${i % 2 ? 1.5 : -1.5}deg)`, opacity: Math.min(1, p * 1.5), boxShadow: (yellow && !(hook as any).yellowText) || (hook as any).bar !== 'none' ? '0 10px 30px rgba(0,0,0,0.25)' : 'none'}}>
              <div style={{...display(hook.size ?? 66, yellow ? ((hook as any).yellowText ? C.yellow : C.ink) : ((hook as any).barText ?? (hook.ink && (hook as any).bar === 'none' ? C.onBright : C.white))), whiteSpace: 'nowrap', lineHeight: 1, textShadow: (yellow && !(hook as any).yellowText) || (hook.ink && (hook as any).bar === 'none') ? undefined : SOFT}}>{l}</div>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }
  const ul = hook.underline !== undefined ? interpolate(t, [start + 0.3, start + 0.8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  return (
    <AbsoluteFill style={{alignItems: 'center', top: `${(hook.y ?? 0.11) * 100}%`, opacity: out}}>
      {hook.underline !== undefined && (
        <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
          <path d={`M200,${(hook.size ?? 46) * (hook.underline + 1) + 6} C380,${(hook.size ?? 46) * (hook.underline + 1) - 10} 640,${(hook.size ?? 46) * (hook.underline + 1) + 18} 880,${(hook.size ?? 46) * (hook.underline + 1)}`} fill="none" stroke={hook.ink ? C.onBright : C.yellow} strokeWidth={9} strokeLinecap="round" strokeDasharray={760} strokeDashoffset={760 * (1 - ul)} />
        </svg>
      )}
      <div style={{...display(hook.size ?? 46, C.yellow), textAlign: 'center', lineHeight: 0.98, whiteSpace: 'nowrap', textShadow: hook.ink ? 'none' : '0 0 3px rgba(0,0,0,0.45), 0 2px 22px rgba(0,0,0,0.5)'}}>
        {lines.map((l, i) => <div key={i} style={inkLine(hook.ink, !(acc.length && !acc.includes(i)), hook.size ?? 46, undefined, true)}>{l}</div>)}
      </div>
    </AbsoluteFill>
  );
};

// ---------- captions ----------
// on light boards (canvas) captions flip to charcoal
const InkCtx = React.createContext(false);
const clean = (s: string) => s.replace(/[.,!?;:]+$/g, '');
// italic / script emphasis (only reaches here when the brand allows it: reel.italics)
const emStyle = (st?: string): React.CSSProperties => st === 'italic' ? {fontStyle: 'italic'} : st === 'script' ? {fontFamily: SCRIPT, fontStyle: 'normal', fontSize: '1.25em', lineHeight: 0.9} : {};
let NOPUNCT = false; // captions.noPunct: set per render from the plan
const strip = (s: string) => s.replace(/[.,!?;:"“”]+/g, '');
const soft0 = (s: string) => (/^\d+,$/.test(s) ? s : s.replace(/[,;:]+$/g, ''));
const soft = (s: string) => (NOPUNCT ? strip(s) : soft0(s));
type Group = {words: Word[]; s: number; e: number};
export const groupWords = (ws: Word[], maxWords = 5, breaks: number[] = []): Group[] => {
  const out: Group[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) out.push({words: cur, s: cur[0].s, e: cur[cur.length - 1].e}); cur = []; };
  ws.forEach((w, i) => {
    if (w.style === 'hide') { flush(); return; }
    cur.push(w);
    const next = ws[i + 1];
    const gap = next ? next.s - w.e : 1;
    const loud = (x?: Word) => x && (x.style === 'punch' || x.style === 'caps');
    if (loud(next) && cur.length <= 3 && gap < 0.5) return; // keep a short quiet lead-in above the loud words
    if (loud(w) && loud(next) && gap < 0.4 && cur.length < maxWords) return; // keep loud runs together
    const chars = cur.map((x) => x.w).join(' ').length;
    const brk = next ? breaks.some((b) => w.e <= b + 0.02 && next.s >= b - 0.02) : false;
    const hard = brk || /[.!?]$/.test(w.w) || gap > 0.35 || !next || next.style === 'hide';
    if (hard || cur.length >= maxWords || chars > 26 || (loud(w) && !loud(next))) {
      // a line never ends on "I" or a lone letter: it reads like an auto-caption. Carry it to the next line.
      const dangling = !hard && cur.length > 1 && /^([A-Za-z]|I)$/.test(clean(w.w));
      if (dangling) { cur.pop(); flush(); cur.push(w); } else flush();
    }
  });
  flush();
  return out;
};

// word: one small caption-font word at a time
const WordCaptions: React.FC<{cap: Plan['captions']; y: number}> = ({cap, y}) => {
  const t = useT();
  const size = cap.size ?? 60;
  const ws = cap.words.filter((w) => w.style !== 'hide');
  const tt = t + LEAD;
  const i = ws.findIndex((w, k) => tt >= w.s && tt < (ws[k + 1] ? Math.min(ws[k + 1].s, w.e + 0.6) : w.e + 0.4));
  if (i < 0) return null;
  const w = ws[i];
  const a = 1;
  const loud = w.style === 'punch' || w.style === 'caps';
  return (
    <AbsoluteFill style={{top: `${y * 100}%`, alignItems: 'center'}}>
      <div style={{...(loud ? display(size * 1.45, w.style === 'punch' ? C.yellow : C.white) : {...serif(size, w.style === 'yellow' ? C.yellow : C.white), fontWeight: 400}), opacity: a, textShadow: SOFT}}>{loud ? clean(w.w) : soft(w.w)}</div>
    </AbsoluteFill>
  );
};

// phrase + stack: lines build word by word. The caption font for ordinary words, the display font for loud words.
// phrase = April 2026 (lead-in above a huge yellow word). stack = 2026 overlay reels (centred blocks mixing both fonts).
const LineCaptions: React.FC<{cap: Plan['captions']; y: number; stack: boolean}> = ({cap, y, stack}) => {
  const t = useT() + LEAD;
  // captions.ink: charcoal captions for a reel whose talking shots are bright behind the caption line
  const ink = React.useContext(InkCtx) || !!(cap as any).ink;
  const {fps} = useVideoConfig();
  const size = cap.size ?? 60;
  const brks: number[] = (cap as any).breaks ?? [];
  const groups = React.useMemo(() => groupWords(cap.words, cap.maxWords ?? 5, brks), [cap.words]);
  const gi = groups.findIndex((g, k) => { const nb = brks.find((b) => b > g.e - 0.02); const end = Math.min(groups[k + 1] ? Math.min(groups[k + 1].s, g.e + 0.7) : g.e + 0.5, nb !== undefined ? nb + LEAD : 1e9); return t >= g.s && t < end; });
  if (gi < 0) return null;
  const g = groups[gi];
  // split into runs: consecutive loud words become one display line, quiet words one caption line
  const runs: {loud: boolean; words: Word[]}[] = [];
  for (const w of g.words) {
    const loud = w.style === 'punch' || w.style === 'caps';
    const last = runs[runs.length - 1];
    if (last && last.loud === loud) last.words.push(w); else runs.push({loud, words: [w]});
  }
  // v2: the punch line is about 2.4x the caption (the two-extreme type scale), shrunk only to fit the width
  const loudSize = DESIGN === 2 && stack ? Math.min(size * 2.4, ...runs.filter((r) => r.loud).map((r) => 900 / Math.max(4, r.words.map((w) => clean(w.w)).join(' ').length * 0.62))) : stack ? size * 1.55 : size * 2.5;
  // v2: each word arrives over 2 frames (one soft, then sharp), never before it is said
  const wordIn = (w: Word): React.CSSProperties => DESIGN === 2 && t >= w.s && t < w.s + 2 / fps ? {filter: 'blur(6px)', opacity: 0.6} : {};
  return (
    <AbsoluteFill style={{top: `${(y - (DESIGN === 2 && runs.some((r) => r.loud) ? (loudSize * 0.6) / 1920 : 0)) * 100}%`, alignItems: 'center'}}>
      <div style={{textAlign: 'center', maxWidth: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: stack ? 2 : 4}}>
        {runs.map((r, ri) => {
          if (r.loud) {
            const shown = r.words.filter((w) => t >= w.s);
            if (!shown.length) return null;
            const p = Math.min(1, pop(t, shown[0].s, fps) * 1.6);
            return (
              <div key={ri} style={{...display(loudSize), ...(cap.box ? {background: 'rgba(30,30,30,0.88)', padding: '10px 20px 6px', borderRadius: 8} : {}), textShadow: '0 3px 24px rgba(0,0,0,0.22)', transform: (cap as any).entry === 'drop' ? `translateY(${(1 - p) * -70}px)` : (cap as any).entry === 'rise' ? `translateY(${(1 - p) * 50}px)` : `scale(${((cap as any).entry === 'pop' ? 0.5 : 0.86) + ((cap as any).entry === 'pop' ? 0.5 : 0.14) * p})`, filter: cap.entry === 'blur' || (cap as any).entry === 'rise' ? `blur(${(1 - p) * 10}px)` : undefined}}>
                {shown.map((w, k) => <span key={k} style={{...wordIn(w), color: w.style === 'punch' ? (ink ? C.ink : C.yellow) : ink ? C.ink : C.white, ...(ink && w.style === 'punch' ? {background: C.yellow, padding: '0 10px'} : {})}}>{clean(w.w)}{k < shown.length - 1 ? ' ' : ''}</span>)}
              </div>
            );
          }
          if (cap.box && !r.words.some((w) => t >= w.s)) return null;
          return (
            <div key={ri} style={{...serif(stack ? size * 0.95 : size, ink ? C.ink : C.white), fontWeight: 400, textShadow: cap.box || ink ? 'none' : SOFT, ...(cap.box ? {background: 'rgba(30,30,30,0.88)', padding: '6px 18px 10px', borderRadius: 8} : {})}}>
              {r.words.filter((w) => !cap.box || t >= w.s).map((w, k) => (
                <span key={k} style={{...emStyle(w.style as string), ...wordIn(w), opacity: t >= w.s ? (DESIGN === 2 && t < w.s + 2 / fps ? 0.6 : 1) : stack ? 0 : 0.6, color: ['yellow', 'italic', 'script'].includes(w.style as string) ? (ink ? C.charcoal : C.yellow) : ink ? C.ink : C.white, filter: cap.entry === 'blur' && t >= w.s ? `blur(${interpolate(t, [w.s, w.s + 0.12], [8, 0], {extrapolateRight: 'clamp'})}px)` : undefined}}>{soft(w.w)}{' '}</span>
              ))}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Blue haze: the room behind her softens and takes a blue tint so white type reads, with her cut out
// in front, sharp. Her favourite, but only now and again (one or two moments a reel).
const Haze: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start, f.start + 0.25, f.start + f.dur - 0.2, f.start + f.dur], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const a = (f.strength ?? 0.38) * k;
  return <AbsoluteFill style={{backdropFilter: `blur(${(f.blur ?? 4) * k}px)`, background: `linear-gradient(180deg, ${tint(a)} 0%, ${tint(a * 0.75)} 50%, ${tint(a * 0.35)} 100%)`}} />;
};

// Headline wrap: a stack of big lines. The first `back` lines sit behind her head (drawn under the
// cutout), the rest in front of her chest, each line landing a beat after the one above.
const Wrap: React.FC<{f: any; part: 'back' | 'front' | 'all'}> = ({f, part}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const lines: string[] = f.lines ?? [];
  const back = f.back ?? 1, size = f.size ?? 150, lh = size * 0.98, top = (f.y ?? 0.14) * 1920;
  const gap = f.gap ?? 0.14, col = f.colour ?? C.white, accent = f.accent ?? C.yellow;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {lines.map((ln, i) => {
        if (part === 'back' && i >= back) return null;
        if (part === 'front' && i < back) return null;
        const at = f.start + i * gap;
        if (t < at) return null;
        const p = pop(t, at, fps);
        const isAccent = (f.accentLines ?? []).includes(i);
        // the front lines drop below her face: skip the gap her head takes up
        const y = top + i * lh + (i >= back ? (f.drop ?? 0.3) * 1920 : 0);
        return <div key={i} style={{position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', ...display(size), color: isAccent ? accent : col,
          textShadow: '0 4px 30px rgba(0,0,0,0.25)', transform: `translateY(${(1 - p) * 40}px) scale(${0.9 + 0.1 * p})`, opacity: Math.min(1, p * 1.4), whiteSpace: 'nowrap'}}>{ln}</div>;
      })}
    </AbsoluteFill>
  );
};

// Glow captions: the whole line sits on screen, and the word being said right now lights up in the
// punch colour with a soft glow; words already said stay bright, words to come are dimmer.
const GlowCaptions: React.FC<{cap: Plan['captions']; y: number}> = ({cap, y}) => {
  const t = useT() + LEAD;
  // captions.ink: charcoal captions for a reel whose talking shots are bright behind the caption line
  const ink = React.useContext(InkCtx) || !!(cap as any).ink;
  const size = cap.size ?? 60;
  const brks: number[] = (cap as any).breaks ?? [];
  const groups = React.useMemo(() => groupWords(cap.words, cap.maxWords ?? 5, brks), [cap.words]);
  const gi = groups.findIndex((g, k) => t >= g.s - 0.08 && t < (groups[k + 1] ? Math.min(groups[k + 1].s - 0.08, g.e + 0.6) : g.e + 0.5));
  if (gi < 0) return null;
  const g = groups[gi];
  const cur = g.words.reduce((a, w, k) => (t >= w.s ? k : a), -1);
  const base = ink ? C.ink : C.white;
  return (
    <AbsoluteFill style={{top: `${y * 100}%`, alignItems: 'center'}}>
      <div style={{...display(size * 1.08), textAlign: 'center', maxWidth: 900, lineHeight: 1.12, textShadow: ink ? 'none' : '0 3px 18px rgba(0,0,0,0.35)'}}>
        {g.words.map((w, k) => {
          const on = k === cur, said = k < cur;
          return <span key={k} style={{display: 'inline-block', margin: '0 0.14em', color: on ? (ink ? C.ink : C.yellow) : base, opacity: on || said ? 1 : 0.78,
            transform: on ? 'scale(1.07)' : 'none', transition: 'none', ...(on && !ink ? {textShadow: `0 0 22px ${C.yellow}88, 0 3px 18px rgba(0,0,0,0.35)`} : {}), ...(on && ink ? {background: C.yellow, padding: '0 8px', borderRadius: 6} : {})}}>{clean(w.w)}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

// Line by line: captions.switch = [{at, mode}] changes the caption style from that second on.
const capModeAt = (cap: Plan['captions'], t: number): string => {
  let m = cap.mode as string;
  for (const sw of ((cap as any).switch ?? []) as {at: number; mode: string}[]) if (t >= sw.at) m = sw.mode;
  return m;
};
const CaptionsAt: React.FC<{cap: Plan['captions']; y: number}> = ({cap, y}) => {
  const t = useT();
  const m = capModeAt(cap, t);
  if (m === 'word') return <WordCaptions cap={cap} y={y} />;
  if (m === 'glow') return <GlowCaptions cap={cap} y={y} />;
  if (m === 'phrase' || m === 'stack') return <LineCaptions cap={cap} y={y} stack={m === 'stack'} />;
  return null;
};

// ---------- cards, stickers, UI ----------
const InsertLayer: React.FC<{ins: Insert}> = ({ins}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, ins.start, ins.dur)) return null;
  const p = pop(t, ins.start, fps);
  const out = fadeOut(t, ins.start + ins.dur, 0.12);
  if (ins.pos === 'full') return <AbsoluteFill><Media src={ins.src} kind={ins.kind} srcIn={ins.srcIn} at={ins.start} style={{width: '100%', height: '100%', objectFit: 'cover', filter: (ins as any).dim ? `brightness(${(ins as any).dim})` : undefined}} /></AbsoluteFill>;
  const width = ins.width ?? 0.62;
  const left = ins.pos === 'stack-left' ? 0.08 : ins.pos === 'stack-right' ? 1 - width - 0.08 : (1 - width) / 2;
  const y = ins.y ?? (ins.pos === 'pip' ? 0.6 : 0.13);
  const tilt = ins.tilt ? `perspective(1400px) rotateX(${8 - 4 * p}deg) rotateY(${-14 + 4 * p}deg)` : '';
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: `${left * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, opacity: out, transform: `${tilt} translateY(${(1 - p) * 40}px) scale(${0.9 + 0.1 * p}) rotate(${ins.rotate ?? 0}deg)`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.18)'}}>
        <Media src={ins.src} kind={ins.kind} srcIn={ins.srcIn} at={ins.start} muted={ins.muted} style={{width: '100%', display: 'block'}} />
      </div>
    </AbsoluteFill>
  );
};

const Sticker: React.FC<{f: Extract<Fx, {type: 'sticker'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const o = f.outline === false ? '' : 'drop-shadow(0 0 0 #fff) drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff) ';
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: `${(f.x ?? 0.08) * 100}%`, top: `${(f.y ?? 0.55) * 100}%`, width: `${(f.width ?? 0.42) * 100}%`, transform: `scale(${p}) rotate(${(f.rotate ?? -4) * p}deg)`, opacity: fadeOut(t, f.start + f.dur)}}>
        <Img src={staticFile(f.src)} style={{width: '100%', display: 'block', filter: `${o}drop-shadow(0 14px 24px rgba(0,0,0,0.3))${f.strike !== undefined && t >= f.strike ? ' grayscale(0.7)' : ''}`}} />
        {f.strike !== undefined && t >= f.strike && <div style={{position: 'absolute', left: '-8%', top: '46%', height: 18, borderRadius: 9, background: '#E5484D', width: `${interpolate(t, [f.strike, f.strike + 0.2], [0, 116], {extrapolateRight: 'clamp'})}%`, transform: 'rotate(-20deg)', transformOrigin: '0 50%', boxShadow: '0 3px 10px rgba(0,0,0,0.3)'}} />}
      </div>
    </AbsoluteFill>
  );
};

const Prompt: React.FC<{f: Extract<Fx, {type: 'prompt'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const per = Math.min(0.045, (f.dur * 0.6) / Math.max(1, f.text.length)); // finish typing by 60% of the moment
  const n = Math.floor(Math.max(0, t - f.start - 0.2) / per);
  const typed = f.text.slice(0, n);
  const done = n >= f.text.length;
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.12) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{width: 860, transform: `translateY(${(1 - p) * 30}px) scale(${0.94 + 0.06 * p})`, background: 'rgba(255,255,255,0.97)', borderRadius: 28, padding: '26px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', gap: 20}}>
        <div style={{flex: 1, fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", fontSize: 38, color: C.ink, lineHeight: 1.25}}>
          {f.label && <div style={{fontSize: 24, color: '#888', marginBottom: 6}}>{f.label}</div>}
          {f.files && (
            <div style={{display: 'flex', gap: 12, marginBottom: 14}}>
              {f.files.map((fn, k) => {
                const fp = pop(t, f.start + 0.15 + k * 0.18, fps);
                return <div key={k} style={{fontSize: 24, background: '#f1f1f1', border: '1px solid #ddd', borderRadius: 14, padding: '10px 14px', transform: `scale(${fp})`, display: 'flex', gap: 8, alignItems: 'center'}}><span style={{width: 34, height: 26, borderRadius: 5, background: C.blue}} />{fn}</div>;
              })}
            </div>
          )}
          {typed}<span style={{opacity: Math.floor(t * 2) % 2 && !done ? 0 : 1, color: '#999'}}>|</span>
        </div>
        <div style={{width: 64, height: 64, borderRadius: 32, background: done ? C.ink : '#cfcfcf', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 34, fontFamily: 'sans-serif'}}>↑</div>
      </div>
    </AbsoluteFill>
  );
};


const UI_FONT = "-apple-system, 'Helvetica Neue', sans-serif";
// a short conversation, bubbles land as she says each line
const Chat: React.FC<{f: Extract<Fx, {type: 'chat'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const shown = f.msgs.filter((m) => t >= m.at).slice(-3);
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.08) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{width: 960, display: 'flex', flexDirection: 'column', gap: 16}}>
        {shown.map((m, i) => {
          const p = pop(t, m.at, fps);
          const me = m.from === 'me';
          return (
            <div key={m.at} style={{alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: 780, background: me ? C.ink : '#fff', color: me ? '#fff' : '#1E1E1E', fontFamily: UI_FONT, fontSize: 42, lineHeight: 1.28, padding: '24px 30px', borderRadius: 30, borderBottomRightRadius: me ? 8 : 30, borderBottomLeftRadius: me ? 30 : 8, boxShadow: '0 14px 40px rgba(0,0,0,0.25)', transform: `translateY(${(1 - p) * 30}px) scale(${0.92 + 0.08 * p})`, opacity: p, transformOrigin: me ? '100% 100%' : '0% 100%'}}>
              {m.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// photos dropping into a named folder (AirDrop -> folder)
const Folder: React.FC<{f: Extract<Fx, {type: 'folder'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const step = Math.max(0.12, (f.dur - 0.8) / Math.max(1, f.srcs.length));
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.07) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'relative', width: 560, height: 420, transform: `scale(${(0.85 + 0.15 * p) * 1.0})`, transformOrigin: '50% 0%', opacity: p}}>
        {f.srcs.map((s, i) => {
          const at = f.start + 0.35 + i * step;
          const k = interpolate(t, [at, at + 0.45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
          if (t < at) return null;
          const x = (i % 2 ? 1 : -1) * (120 + (i % 3) * 30) * (1 - k);
          return <Img key={i} src={staticFile(s)} style={{position: 'absolute', left: 200 + x, top: -260 * (1 - k) + 70, width: 160, height: 200, objectFit: 'cover', borderRadius: 12, border: '5px solid #fff', boxShadow: '0 10px 26px rgba(0,0,0,0.3)', transform: `rotate(${(i % 2 ? 8 : -8) * (1 - k)}deg) scale(${1 - 0.35 * k})`, opacity: k > 0.97 ? 0 : 1}} />;
        })}
        {/* folder */}
        <div style={{position: 'absolute', left: 80, top: 160, width: 400, height: 260}}>
          <div style={{position: 'absolute', left: 0, top: 0, width: 170, height: 60, background: '#7fb0e0', borderRadius: '18px 18px 0 0'}} />
          <div style={{position: 'absolute', left: 0, top: 34, width: 400, height: 226, background: 'linear-gradient(180deg,#9cc6f0,#6fa3d8)', borderRadius: 18, boxShadow: '0 18px 40px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 24}}>
            <div style={{fontFamily: UI_FONT, fontSize: 30, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.25)'}}>{f.name ?? 'Photos'}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// photos of the clothes: a fan of cards behind her, or one-by-one "snaps" with a camera flash
const Deck: React.FC<{f: Extract<Fx, {type: 'deck'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const n = f.srcs.length;
  const out = fadeOut(t, f.start + f.dur, 0.15);
  if (f.mode === 'snap') {
    const step = (f.dur - 0.3) / n;
    const i = Math.min(n - 1, Math.floor((t - f.start) / step));
    const at = f.start + i * step;
    const flash = interpolate(t, [at, at + 0.12], [0.9, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (
      <AbsoluteFill style={{opacity: out}}>
        {f.srcs.slice(0, i + 1).map((s, k) => {
          const age = i - k; // older shots shrink to the side
          const p = pop(t, f.start + k * step, fps);
          const left = age === 0 ? 270 : 40 + (k % 2) * 760;
          const top = age === 0 ? (f.y ?? 0.05) * 1920 : 120 + ((k >> 1) % 3) * 260;
          const w = age === 0 ? 540 : 250;
          return <Img key={k} src={staticFile(s)} style={{position: 'absolute', left, top, width: w, height: w * 1.33, objectFit: 'cover', borderRadius: 16, border: '6px solid #fff', boxShadow: '0 16px 40px rgba(0,0,0,0.3)', transform: `rotate(${age === 0 ? 0 : (k % 2 ? 6 : -6)}deg) scale(${age === 0 ? 0.9 + 0.1 * p : 1})`, opacity: age > 4 ? 0 : 1}} />;
        })}
        <AbsoluteFill style={{background: '#fff', opacity: flash}} />
      </AbsoluteFill>
    );
  }
  if (f.mode === 'wall' || f.mode === 'scatter') {
    return (
      <AbsoluteFill style={{opacity: out, background: f.mode === 'wall' ? tint(0.55) : undefined}}>
        {f.srcs.map((s, k) => {
          const p = pop(t, f.start + k * 0.06, fps);
          const col = k % 3, row = Math.floor(k / 3);
          const left = f.mode === 'wall' ? 20 + col * 350 : [60, 640, 120, 700, 330, 40][k % 6];
          const top = f.mode === 'wall' ? 60 + row * 430 : [140, 110, 520, 560, 40, 900][k % 6];
          const rot = f.mode === 'wall' ? 0 : [-8, 7, 5, -6, 3, -4][k % 6];
          return <Img key={k} src={staticFile(s)} style={{position: 'absolute', left, top, width: f.mode === 'wall' ? 330 : 360, height: f.mode === 'wall' ? 410 : 460, objectFit: 'cover', borderRadius: f.mode === 'wall' ? 14 : 6, border: f.mode === 'wall' ? 'none' : '8px solid #fff', boxShadow: '0 14px 34px rgba(0,0,0,0.35)', transform: `rotate(${rot}deg) scale(${p})`}} />;
        })}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{opacity: out}}>
      {f.srcs.map((s, k) => {
        const p = pop(t, f.start + k * 0.07, fps);
        const ang = (k - (n - 1) / 2) * 11;
        return <Img key={k} src={staticFile(s)} style={{position: 'absolute', left: 540 - 170, top: (f.y ?? 0.12) * 1920, width: 340, height: 460, objectFit: 'cover', borderRadius: 18, border: '6px solid #fff', boxShadow: '0 18px 44px rgba(0,0,0,0.3)', transformOrigin: '50% 160%', transform: `rotate(${ang * p}deg) translateY(${(1 - p) * 300}px)`}} />;
      })}
    </AbsoluteFill>
  );
};

// approval overload: the same "approve?" prompt piling up
const Pills: React.FC<{f: Extract<Fx, {type: 'pills'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const n = f.count ?? 7;
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.05) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      {Array.from({length: n}).map((_, k) => {
        const at = f.start + k * Math.min(0.28, (f.dur * 0.7) / n);
        if (t < at) return null;
        const p = pop(t, at, fps);
        return (
          <div key={k} style={{position: 'absolute', top: k * 78, left: 60 + ((k * 137) % 300), transform: `scale(${p}) rotate(${((k * 53) % 9) - 4}deg)`, background: '#fff', borderRadius: 999, padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 18, boxShadow: '0 10px 28px rgba(0,0,0,0.25)', fontFamily: UI_FONT, fontSize: 40, color: '#1E1E1E'}}>
            {f.text}<span style={{background: C.ink, color: '#fff', borderRadius: 999, padding: '8px 20px', fontSize: 32}}>Approve</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ===== effects library v3 (tenfoldmarc set) =====
// orbit: cards circle her; the back half draws behind her cutout, the front half in front
const Orbit: React.FC<{f: Extract<Fx, {type: 'orbit'}>; half: 'back' | 'front'}> = ({f, half}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const a0 = interpolate(t, [f.start, f.start + 0.4], [0, 1], {extrapolateRight: 'clamp'}) * fadeOut(t, f.start + f.dur, 0.25);
  const n = f.srcs.length;
  return (
    <AbsoluteFill style={{opacity: a0}}>
      {f.srcs.map((src, k) => {
        const ang = (t - f.start) * (f.speed ?? 1.1) + (k / n) * Math.PI * 2;
        const z = Math.sin(ang);
        if ((half === 'front') !== (z > 0)) return null;
        const x = 540 + Math.cos(ang) * (f.rx ?? 420) - 130, y = (f.y ?? 0.32) * 1920 + z * (f.ry ?? 110) - 170;
        const sc = 0.75 + 0.3 * (z + 1) / 2;
        return <Img key={k} src={staticFile(src)} style={{position: 'absolute', left: x, top: y, width: 260, height: 340, objectFit: 'cover', borderRadius: 16, border: '5px solid #fff', boxShadow: '0 14px 36px rgba(0,0,0,0.35)', transform: `scale(${sc}) rotate(${Math.cos(ang) * 8}deg)`, filter: z < 0 ? 'brightness(0.85)' : undefined}} />;
      })}
    </AbsoluteFill>
  );
};

// ui world: the background becomes an app, her request typing in, she stays in front
const UiWorld: React.FC<{f: Extract<Fx, {type: 'uiworld'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const per = Math.min(0.05, (f.dur * 0.6) / Math.max(1, f.text.length));
  const typed = f.text.slice(0, Math.floor(Math.max(0, t - f.start - 0.25) / per));
  return (
    <AbsoluteFill style={{background: f.colour ?? '#F4F2EE', opacity: interpolate(t, [f.start, f.start + 0.15], [0, 1], {extrapolateRight: 'clamp'}) * fadeOut(t, f.start + f.dur, 0.15)}}>
      {(f as any).browser && (
        <div style={{position: 'absolute', top: 210, left: 0, right: 0, height: 96, background: '#E9E6E0', borderBottom: '1px solid #d6d2ca', display: 'flex', alignItems: 'center', gap: 14, padding: '0 34px'}}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{width: 22, height: 22, borderRadius: 11, background: c}} />)}
          <div style={{marginLeft: 24, flex: 1, background: '#fff', borderRadius: 14, padding: '12px 22px', fontFamily: UI_FONT, fontSize: 28, color: '#666'}}>claude.ai/new</div>
        </div>
      )}
      <div style={{position: 'absolute', top: (f as any).browser ? 380 : 150, width: '100%', textAlign: 'center', ...serif(56, '#3a3a38'), fontWeight: 400}}>{f.app ?? 'How can I help you today?'}</div>
      <div style={{position: 'absolute', top: (f as any).browser ? 490 : 260, left: 70, right: 70, background: '#fff', borderRadius: 30, padding: '30px 34px', boxShadow: '0 10px 40px rgba(0,0,0,0.12)', fontFamily: UI_FONT, fontSize: 40, color: '#222', minHeight: 150}}>
        {typed}<span style={{opacity: Math.floor(t * 2) % 2 ? 0 : 1, color: '#999'}}>|</span>
      </div>
    </AbsoluteFill>
  );
};

// solid backdrop behind a shrunken / framed video (frame break, pull-back)
const FrameBg: React.FC<{plan: Plan}> = ({plan}) => {
  const t = useT();
  const vx = videoXform(plan, t);
  if (!vx.bg) return null;
  const pb = (plan.fx ?? []).find((f) => f.type === 'pullback' && within(t, f.start, f.dur)) as Extract<Fx, {type: 'pullback'}> | undefined;
  const pm = (plan.fx ?? []).find((f) => (f.type as string) === 'phoneme' && within(t, f.start, f.dur)) as any;
  return (
    <AbsoluteFill style={{background: vx.bg}}>
      {pm && (
        <AbsoluteFill style={{top: `${(pm.textY ?? 0.2) * 100}%`, alignItems: 'center', opacity: interpolate(t, [pm.start + 0.15, pm.start + 0.45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          {(pm.lines ?? []).map((l: string, i: number) => <div key={i} style={{...display(pm.size ?? 170, i % 2 ? (pm.colour2 ?? C.yellow) : (pm.colour ?? C.offwhite)), lineHeight: 0.95, whiteSpace: 'nowrap', textShadow: '0 6px 40px rgba(0,0,0,0.18)', transform: `translateY(${(1 - pop(t, pm.start + 0.15 + i * 0.12, 30)) * 80}px)`}}>{l}</div>)}
        </AbsoluteFill>
      )}
      {pb && (
        <div style={{position: 'absolute', left: 50, top: 520, width: 420, background: '#fff', borderRadius: 26, padding: '26px 28px', boxShadow: '0 16px 50px rgba(0,0,0,0.15)', fontFamily: UI_FONT, color: '#222', opacity: interpolate(t, [pb.start + 0.3, pb.start + 0.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          <div style={{fontSize: 26, color: '#888', marginBottom: 14}}>{pb.title ?? 'Working on'}</div>
          {(pb.tasks ?? []).map((it, k) => {
            const done = t >= it.at;
            return <div key={k} style={{display: 'flex', gap: 14, alignItems: 'center', fontSize: 30, margin: '10px 0', opacity: done ? 1 : 0.45}}><span style={{width: 30, height: 30, borderRadius: 15, background: done ? '#3f9e6e' : 'transparent', border: done ? 'none' : '3px solid #bbb', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20}}>{done ? '✓' : ''}</span>{it.text}</div>;
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

// phone mockup sliding in from the side with a screen recording or screenshot
// a screen recording shown whole inside a browser window, on a brand colour (landscape footage in a vertical reel)
const BrowserWin: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start, f.start + 0.3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const w = VW - 2 * (f.inset ?? 34);
  return (
    <AbsoluteFill style={{background: f.bg ?? C.blue, opacity: fadeOut(t, f.start + f.dur, 0.12)}}>
      <div style={{position: 'absolute', left: (VW - w) / 2, top: (f.y ?? 0.3) * VH, width: w, borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', transform: `translateY(${(1 - k) * 80}px) scale(${0.94 + 0.06 * k})`}}>
        <div style={{height: 62, background: '#E9E6E0', display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px'}}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{width: 18, height: 18, borderRadius: 9, background: c}} />)}
          <div style={{marginLeft: 18, flex: 1, background: '#fff', borderRadius: 12, padding: '8px 18px', fontFamily: UI_FONT, fontSize: 24, color: '#777'}}>{f.url ?? 'localhost:7847'}</div>
        </div>
        {f.code ? (
          <div style={{height: f.codeH ?? 900, background: C.blue, padding: '34px 38px', fontFamily: "'SF Mono', Menlo, monospace", fontSize: 30, lineHeight: 1.5, color: C.white, overflow: 'hidden'}}>
            {(f.code as string[]).map((l, k) => { const at = f.start + 0.15 + k * ((f.dur - 0.4) / f.code.length); const n = Math.max(0, Math.floor((t - at) / 0.012)); return t < at ? null : <div key={k} style={{whiteSpace: 'pre', color: l.startsWith('//') ? C.yellow : C.white}}>{l.slice(0, n)}</div>; })}
          </div>
        ) : <Media src={f.src} kind={f.kind} srcIn={f.srcIn} at={f.start} muted style={{width: '100%', display: 'block'}} />}
      </div>
    </AbsoluteFill>
  );
};

// an Instagram-style poll card: the question, then the options (with result bars when given a pct)
const Poll: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const w = f.width ?? 0.72;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: ((1 - w) / 2) * VW, top: (f.y ?? 0.16) * VH, width: w * VW, background: f.bg ?? C.blue, borderRadius: 34, padding: '34px 34px 30px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', transform: `translateY(${(1 - p) * 40}px) scale(${0.85 + 0.15 * p}) rotate(${f.rotate ?? -2}deg)`}}>
        <div style={{...display(f.size ?? 44, C.white), textAlign: 'center', lineHeight: 1.08, marginBottom: 26}}>{f.question}</div>
        {(f.options ?? []).map((o: any, k: number) => {
          const fill = o.pct != null ? interpolate(t, [f.start + 0.4, f.start + 1.1], [0, o.pct], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}) : 0;
          return (
            <div key={k} style={{position: 'relative', height: 84, borderRadius: 42, background: 'rgba(255,255,255,0.28)', marginTop: k ? 16 : 0, overflow: 'hidden'}}>
              <div style={{position: 'absolute', inset: 0, width: `${fill}%`, background: C.yellow}} />
              <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: o.pct != null ? 'space-between' : 'center', padding: '0 34px', ...display(38, C.white)}}>
                <span>{o.text}</span>{o.pct != null && <span>{Math.round(fill)}%</span>}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// an old-school analogue clock whose hands race forward (time going by)
const Clock: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const R = (f.size ?? 300) / 2;
  const hrs = interpolate(t, [f.start, f.start + f.dur], [0, f.hours ?? 4], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const mAng = (hrs * 360) % 360, hAng = (hrs * 30 + (f.from ?? 9) * 30) % 360;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <svg width={R * 2 + 20} height={R * 2 + 20} style={{position: 'absolute', left: (f.x ?? 0.75) * VW - R - 10, top: (f.y ?? 0.4) * VH - R - 10, transform: `scale(${0.6 + 0.4 * p}) rotate(${(1 - p) * -20}deg)`, filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.3))'}}>
        <g transform={`translate(${R + 10} ${R + 10})`}>
          <circle r={R} fill={C.blue} stroke={C.white} strokeWidth={R * 0.09} />
          {Array.from({length: 12}, (_, i) => <line key={i} x1={0} y1={-R * 0.8} x2={0} y2={-R * (i % 3 ? 0.72 : 0.64)} stroke={C.white} strokeWidth={i % 3 ? R * 0.025 : R * 0.05} strokeLinecap="round" transform={`rotate(${i * 30})`} />)}
          <line x1={0} y1={R * 0.08} x2={0} y2={-R * 0.42} stroke={C.white} strokeWidth={R * 0.07} strokeLinecap="round" transform={`rotate(${hAng})`} />
          <line x1={0} y1={R * 0.1} x2={0} y2={-R * 0.66} stroke={C.white} strokeWidth={R * 0.045} strokeLinecap="round" transform={`rotate(${mAng})`} />
          <circle r={R * 0.06} fill={C.yellow} stroke={C.white} strokeWidth={R * 0.02} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};

// a spinning ring counting down (3, 2, 1) before something starts
const Spinner: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const e = t - f.start; const n = f.from ?? 3; const num = Math.max(1, n - Math.floor(e / (f.dur / n)));
  const R = (f.size ?? 340) / 2;
  return (
    <AbsoluteFill style={{background: f.bg ?? C.blue, alignItems: 'center', justifyContent: 'center', opacity: fadeOut(t, f.start + f.dur, 0.12)}}>
      <svg width={R * 2 + 30} height={R * 2 + 30} style={{position: 'absolute', left: VW / 2 - R - 15, top: (f.y ?? 0.42) * VH - R - 15}}>
        <circle cx={R + 15} cy={R + 15} r={R} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={22} />
        <circle cx={R + 15} cy={R + 15} r={R} fill="none" stroke={C.yellow} strokeWidth={22} strokeLinecap="round" strokeDasharray={`${Math.PI * R * 0.5} ${Math.PI * R * 2}`} transform={`rotate(${e * 540} ${R + 15} ${R + 15})`} />
      </svg>
      <div style={{position: 'absolute', top: (f.y ?? 0.42) * VH - R * 0.55, width: '100%', textAlign: 'center', ...display(R * 0.95, C.white)}}>{num}</div>
      {f.label && <div style={{position: 'absolute', top: (f.y ?? 0.42) * VH + R + 50, width: '100%', textAlign: 'center', ...serif(58, C.white)}}>{f.label}</div>}
    </AbsoluteFill>
  );
};

// a progress bar filling to 100% (a render, an upload)
const Progress: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const k = interpolate(t, [f.start + 0.2, f.start + f.dur - 0.25], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const w = (f.width ?? 0.78) * VW;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: (VW - w) / 2, top: (f.y ?? 0.5) * VH, width: w, transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + 0.1 * p})`, opacity: Math.min(1, p * 1.4)}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 14, ...display(40, C.white), textShadow: SOFT}}><span>{f.label ?? 'Rendering'}</span><span>{Math.round(k * 100)}%</span></div>
        <div style={{height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.35)', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)'}}><div style={{height: '100%', width: `${k * 100}%`, background: C.yellow, borderRadius: 17}} /></div>
      </div>
    </AbsoluteFill>
  );
};

const Phone: React.FC<{f: Extract<Fx, {type: 'phone'}>}> = ({f}) => {
  const t = useT();
  const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const right = (f.side ?? 'right') === 'right'; const centre = (f as any).side === 'center'; const sc = (f as any).scale ?? 1;
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: (f.y ?? 0.1) * VH, ...(centre ? {left: (VW - 432 * sc) / 2} : {[right ? 'right' : 'left']: 50}), width: 400, height: 820, borderRadius: 64, background: '#111', padding: 16, boxShadow: '0 30px 70px rgba(0,0,0,0.45)', transformOrigin: centre ? '0 0' : (right ? '100% 0' : '0 0'), transform: centre ? `translateY(${(1 - p) * 600}px) scale(${sc})` : `translateX(${(1 - p) * (right ? 520 : -520)}px) rotate(${right ? 5 : -5}deg) scale(${sc})`, opacity: fadeOut(t, f.start + f.dur)}}>
        <div style={{width: '100%', height: '100%', borderRadius: 50, overflow: 'hidden', position: 'relative', background: '#000'}}>
          <Media src={f.src} kind={f.kind} srcIn={f.srcIn} at={f.start} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          <div style={{position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 120, height: 34, borderRadius: 20, background: '#000'}} />
          {f.views && <div style={{position: 'absolute', right: 18, bottom: 22, background: tint(0.8), color: '#fff', borderRadius: 999, padding: '8px 16px', fontFamily: UI_FONT, fontSize: 28, fontWeight: 600}}>▶ {Math.round(interpolate(t, [f.start + 0.2, f.start + Math.min(f.dur, 2)], f.views, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)})).toLocaleString('en-AU')}</div>}
          {f.tag && <div style={{position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)', background: '#fff', color: C.ink, borderRadius: 8, padding: '6px 14px', ...display(22, C.ink), whiteSpace: 'nowrap'}}>{f.tag}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
};


// cards that pop up one by one ("this, this or this"), each playing a showcase clip
const Pops: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {f.items.map((it: any, k: number) => {
        if (t < it.at) return null;
        const p = pop(t, it.at, fps);
        return (
          <div key={k} style={{position: 'absolute', left: it.x * VW, top: it.y * VH, width: (it.w ?? (f.width ?? 0.28)) * VW, height: (it.w ?? (f.width ?? 0.28)) * VW * (it.aspect ?? 16 / 9), borderRadius: 28, overflow: 'hidden', border: '8px solid #fff', boxShadow: '0 24px 60px rgba(0,0,0,0.45)', transform: `scale(${p}) rotate(${it.rotate ?? 0}deg)`, background: '#000'}}>
            <Media src={it.src} kind={it.kind} srcIn={it.srcIn ?? 0} at={it.at} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};


const People: React.FC<{f: any}> = ({f}) => {
  const t = useT();
  const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const n = f.n ?? 15, cols = 5, sz = f.size ?? 118, gap = 26;
  const W = cols * sz + (cols - 1) * gap;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', top: (f.y ?? 0.14) * VH, left: f.x !== undefined ? f.x * VW : (VW - W) / 2, width: W, display: 'flex', flexWrap: 'wrap', gap}}>
        {Array.from({length: n}).map((_, k) => {
          const at = f.start + (k / n) * (f.fill ?? 1.2);
          const p = pop(t, at, fps);
          const kept = k < (f.keep ?? 2);
          const gone = f.keepAt !== undefined && t >= f.keepAt && !kept;
          const o = gone ? interpolate(t, [f.keepAt, f.keepAt + 0.25], [1, 0.12], {extrapolateRight: 'clamp'}) : 1;
          const col = f.keepAt !== undefined && t >= f.keepAt && kept ? C.yellow : C.white;
          return (
            <svg key={k} width={sz} height={sz} viewBox="0 0 24 24" style={{transform: `scale(${p})`, opacity: o * Math.min(1, p * 1.5), filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.5))'}}>
              <circle cx="12" cy="7" r="4.2" fill={col} />
              <path d="M3.5 22c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" fill={col} />
            </svg>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};


// ===== effects v8 (viiolini "brand review" + "simple style" reels, 21 Oct 2026) =====
const PAPER = '#F6F3EC';
const paperTex = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.018) 0 2px, transparent 2px 5px), radial-gradient(circle at 30% 20%, rgba(255,255,255,0.6), rgba(0,0,0,0.04))';
// pill badges that fly in one by one and stack beside you ("SAME FEELING?", "NEW AUDIENCE")
const Badges: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const cols = [C.yellow, C.blue, C.white];
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {f.items.map((it: any, k: number) => {
        if (t < it.at) return null;
        const p = pop(t, it.at, fps); const side = (it.side ?? (k % 2 ? 'right' : 'left')) === 'right';
        const x = (it.x ?? (side ? 0.62 : 0.08)) * VW, y = (it.y ?? (f.y ?? 0.2) + k * 0.075) * VH;
        return <div key={k} style={{position: 'absolute', left: x, top: y, padding: '14px 30px 10px', borderRadius: 999, background: cols[k % 3], ...display(f.size ?? 40, C.ink), whiteSpace: 'nowrap',
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)', transform: `translateX(${(1 - p) * (side ? 420 : -420)}px) rotate(${(it.rotate ?? (k % 2 ? 6 : -5)) * p}deg) scale(${0.8 + 0.2 * p})`}}>{it.text}</div>;
      })}
    </AbsoluteFill>
  );
};
// taped polaroids dropping in around you
const Polaroids: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const spots = f.spots ?? [[0.04, 0.12, -9], [0.62, 0.1, 7], [0.06, 0.4, 5], [0.64, 0.38, -6]];
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {f.srcs.map((src: string, k: number) => {
        const at = f.start + k * (f.gap ?? 0.28); if (t < at) return null;
        const p = pop(t, at, fps); const [x, y, r] = spots[k % spots.length]; const w = (f.width ?? 0.32) * VW;
        return (
          <div key={k} style={{position: 'absolute', left: x * VW, top: y * VH, width: w, background: '#FBFAF6', padding: `${w * 0.06}px ${w * 0.06}px ${w * 0.2}px`, boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            transform: `translateY(${(1 - p) * -260}px) rotate(${r * p + (1 - p) * r * 3}deg)`, opacity: Math.min(1, p * 1.6)}}>
            <Img src={staticFile(src)} style={{width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block'}} />
            <div style={{position: 'absolute', top: -w * 0.05, left: '32%', width: '36%', height: w * 0.11, background: 'rgba(240,232,200,0.85)', transform: 'rotate(-4deg)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'}} />
            {f.labels?.[k] && <div style={{position: 'absolute', left: 0, right: 0, bottom: w * 0.045, textAlign: 'center', ...serif(w * 0.1, C.ink), fontWeight: 400}}>{f.labels[k]}</div>}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
// a marker loop drawing itself around something on screen (plus an optional note)
const Circle: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const cx = f.x * VW, cy = f.y * VH, rx = (f.w ?? 0.3) * VW / 2, ry = (f.h ?? 0.12) * VH / 2;
  const k = interpolate(t, [f.start, f.start + 0.5], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const d = `M ${cx + rx * 0.9} ${cy - ry * 0.7} C ${cx + rx * 1.15} ${cy + ry * 0.9}, ${cx - rx * 0.6} ${cy + ry * 1.25}, ${cx - rx * 1.05} ${cy + ry * 0.1} S ${cx - rx * 0.2} ${cy - ry * 1.2}, ${cx + rx * 0.95} ${cy - ry * 0.35} L ${cx + rx * 1.1} ${cy - ry * 0.05}`;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <svg width={VW} height={VH} style={{position: 'absolute', inset: 0, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))'}}>
        <path d={d} fill="none" stroke={f.colour ?? C.yellow} strokeWidth={f.stroke ?? 11} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />
      </svg>
      {f.note && <div style={{position: 'absolute', left: cx + rx * 0.7, top: cy - ry * 1.9, ...serif(f.noteSize ?? 54, f.colour ?? C.yellow), fontWeight: 400, transform: 'rotate(-6deg)', opacity: interpolate(t, [f.start + 0.4, f.start + 0.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), textShadow: '0 2px 10px rgba(0,0,0,0.5)', whiteSpace: 'nowrap'}}>{f.note}</div>}
    </AbsoluteFill>
  );
};
// a month on paper with pill stamps slamming onto days
const Stampcal: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps); const first = f.firstDay ?? 3, days = f.days ?? 31;
  const w = (f.width ?? 0.62) * VW, cell = w / 7;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: (f.x ?? 0.06) * VW, top: (f.y ?? 0.14) * VH, width: w, background: PAPER, backgroundImage: paperTex, padding: cell * 0.25, boxShadow: '0 18px 44px rgba(0,0,0,0.35)', transform: `rotate(${f.rotate ?? -4}deg) scale(${0.85 + 0.15 * p})`, transformOrigin: 'top left'}}>
        <div style={{...display(cell * 0.62, C.ink), textAlign: 'center', marginBottom: cell * 0.15, letterSpacing: '0.08em'}}>{f.title ?? 'OCTOBER'}</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: `2px solid ${C.ink}22`, borderLeft: `2px solid ${C.ink}22`}}>
          {Array.from({length: Math.ceil((first + days) / 7) * 7}).map((_, i) => {
            const day = i - first + 1; const st = (f.stamps ?? []).find((s: any) => s.day === day);
            const on = st && t >= st.at; const sp = on ? pop(t, st.at, fps) : 0;
            return (
              <div key={i} style={{height: cell * 0.82, borderRight: `2px solid ${C.ink}22`, borderBottom: `2px solid ${C.ink}22`, position: 'relative'}}>
                {day > 0 && day <= days && <div style={{position: 'absolute', left: 6, top: 4, fontFamily: UI_FONT, fontSize: cell * 0.18, color: '#888'}}>{day}</div>}
                {on && <div style={{position: 'absolute', left: '50%', top: '55%', padding: `${cell * 0.06}px ${cell * 0.12}px`, borderRadius: 999, background: st.colour ?? C.yellow, ...display(cell * 0.2, C.ink), whiteSpace: 'nowrap',
                  transform: `translate(-50%,-50%) rotate(${(day * 37) % 14 - 7}deg) scale(${1.8 - 0.8 * sp})`, opacity: Math.min(1, sp * 2), boxShadow: '0 3px 8px rgba(0,0,0,0.25)'}}>{st.text ?? 'SHOW'}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
// collage title: a huge word running up the edge + sticker tags
const Collage: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps); const right = f.side === 'right';
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', top: (f.y ?? 0.62) * VH, [right ? 'right' : 'left']: (f.inset ?? 0.03) * VW, transformOrigin: right ? 'top right' : 'top left',
        transform: `rotate(${right ? 90 : -90}deg)`, ...display(f.size ?? 150, f.colour ?? C.yellow), whiteSpace: 'nowrap', textShadow: '0 4px 24px rgba(0,0,0,0.35)', clipPath: `inset(0 ${100 - p * 100}% 0 0)`}}>{f.word}</div>
      {(f.tags ?? []).map((g: any, k: number) => {
        if (t < g.at) return null; const q = pop(t, g.at, fps);
        return <div key={k} style={{position: 'absolute', left: (g.x ?? 0.62) * VW, top: (g.y ?? 0.3 + k * 0.08) * VH, background: PAPER, backgroundImage: paperTex, padding: '10px 22px 6px', ...display(34, C.ink), transform: `rotate(${g.rotate ?? (k % 2 ? 5 : -4)}deg) scale(${q})`, boxShadow: '0 8px 20px rgba(0,0,0,0.3)', whiteSpace: 'nowrap'}}>{g.text}</div>;
      })}
    </AbsoluteFill>
  );
};
// a 3D photo-booth strip floating beside you
const Photostrip: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps); const w = (f.width ?? 0.2) * VW; const bob = Math.sin((t - f.start) * 2.2) * 8;
  return (
    <AbsoluteFill style={{perspective: 1400, opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: (f.x ?? 0.72) * VW, top: (f.y ?? 0.16) * VH + bob, width: w, background: '#FBFAF6', padding: w * 0.07, display: 'flex', flexDirection: 'column', gap: w * 0.06,
        boxShadow: '0 22px 50px rgba(0,0,0,0.4)', transform: `rotateY(${(f.turn ?? -24) * p}deg) rotateZ(${(f.rotate ?? 6) * p}deg) translateY(${(1 - p) * 300}px)`, opacity: Math.min(1, p * 1.5)}}>
        {f.srcs.slice(0, 4).map((src: string, k: number) => <Img key={k} src={staticFile(src)} style={{width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', filter: f.mono ? 'grayscale(1) contrast(1.1)' : undefined}} />)}
      </div>
    </AbsoluteFill>
  );
};
// paper transitions: curtain, paperslide, pageturn, paperturn (start = the cut, dur = whole move)
const PaperMove: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  const d = f.dur ?? 0.7; if (!within(t, f.start - d / 2, d)) return null;
  const inn = interpolate(t, [f.start - d / 2, f.start], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const out = interpolate(t, [f.start, f.start + d / 2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const sheet: React.CSSProperties = {position: 'absolute', background: f.colour ?? PAPER, backgroundImage: paperTex, boxShadow: '0 0 60px rgba(0,0,0,0.35)'};
  const label = f.text ? <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...serif(f.size ?? 110, C.ink), fontWeight: 400}}>{f.text}</div> : null;
  if (f.type === 'curtain') {
    const k = t < f.start ? inn : 1 - out;
    return <AbsoluteFill>{[0, 1].map((s) => <div key={s} style={{...sheet, top: 0, bottom: 0, width: VW / 2 + 4, [s ? 'right' : 'left']: 0, transform: `translateX(${(1 - k) * (s ? 1 : -1) * (VW / 2 + 60)}px)`}} />)}{k > 0.98 && label}</AbsoluteFill>;
  }
  if (f.type === 'paperslide') {
    const y = t < f.start ? (1 - inn) * VH : -out * VH;
    return <AbsoluteFill><div style={{...sheet, left: 0, right: 0, top: y, height: VH, transform: `rotate(${(t < f.start ? 1 - inn : out) * -4}deg)`}}>{label}</div></AbsoluteFill>;
  }
  if (f.type === 'pageturn') {
    const k = t < f.start ? inn : 1 + out; // 0..1 page sweeps in from the right, 1..2 it lifts away to the left
    const x = k <= 1 ? (1 - k) * VW : 0, lift = k > 1 ? (k - 1) : 0;
    return (
      <AbsoluteFill style={{perspective: 2200}}>
        <div style={{...sheet, top: 0, bottom: 0, left: x, width: VW, transformOrigin: 'left center', transform: `rotateY(${-lift * 100}deg) skewY(${(1 - Math.min(k, 1)) * 6}deg)`,
          backgroundImage: `${paperTex}, linear-gradient(90deg, rgba(0,0,0,0.18), transparent 12%)`}}>{label}</div>
      </AbsoluteFill>
    );
  }
  // paperturn: the frame flips over to a paper card and back
  const k = t < f.start ? inn : 1 - out;
  return <AbsoluteFill style={{perspective: 2400}}><div style={{...sheet, inset: 0, transform: `rotateY(${(1 - k) * 90}deg)`, transformOrigin: 'center'}}>{label}</div></AbsoluteFill>;
};


// ===== effects v9 (Claude's own ideas, 21 Oct 2026) =====
const prog = (t: number, a: number, b: number, e = Easing.out(Easing.cubic)) => interpolate(t, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e});
const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
// rubber stamp slamming on ("SOLD", "APPROVED", "BOOKED")
const Stamp: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const k = prog(t, f.start, f.start + 0.18, Easing.in(Easing.cubic)); const col = f.colour ?? '#D2453B';
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: (f.x ?? 0.5) * VW, top: (f.y ?? 0.2) * VH, transform: `translate(-50%,-50%) rotate(${f.rotate ?? -12}deg) scale(${2.6 - 1.6 * k})`, opacity: k,
        border: `10px solid ${col}`, borderRadius: 18, padding: '14px 40px 6px', ...display(f.size ?? 150, col), whiteSpace: 'nowrap', textShadow: 'none',
        WebkitMaskImage: 'repeating-radial-gradient(circle at 30% 40%, #000 0 3px, rgba(0,0,0,0.75) 4px 5px)', boxShadow: `inset 0 0 0 6px ${col}22`}}>{f.text}</div>
    </AbsoluteFill>
  );
};
// iPhone notifications sliding down and stacking ("You made a sale", "New follower")
const Notifs: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const shown = f.items.filter((it: any) => t >= it.at);
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {shown.map((it: any, k: number) => {
        const p = pop(t, it.at, fps); const slot = shown.length - 1 - k;
        return (
          <div key={k} style={{position: 'absolute', left: 0.05 * VW, right: 0.05 * VW, top: (f.y ?? 0.13) * VH + slot * 168 * (1 - 0.06 * slot), transform: `translateY(${(1 - p) * -220}px) scale(${1 - 0.04 * slot})`, opacity: Math.min(1, p * 1.5) * (1 - 0.18 * slot),
            background: 'rgba(245,245,247,0.88)', backdropFilter: 'blur(18px)', borderRadius: 40, padding: '24px 30px', display: 'flex', gap: 24, alignItems: 'center', boxShadow: '0 12px 34px rgba(0,0,0,0.25)', fontFamily: UI_FONT}}>
            <div style={{width: 84, height: 84, borderRadius: 20, background: it.colour ?? C.yellow, flexShrink: 0, display: 'grid', placeItems: 'center', ...display(38, C.ink)}}>{it.icon ?? (it.app ?? 'A')[0]}</div>
            <div style={{flex: 1, minWidth: 0, color: '#111'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#666', marginBottom: 4}}><span style={{textTransform: 'uppercase', letterSpacing: '0.03em'}}>{it.app}</span><span>{it.when ?? 'now'}</span></div>
              <div style={{fontSize: 36, fontWeight: 700}}>{it.title}</div>
              {it.text && <div style={{fontSize: 33, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{it.text}</div>}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
// a social post card as proof (no platform logos: initials avatar, name, handle, text, likes ticking)
const Post: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps); const likes = Math.round(interpolate(t, [f.start + 0.3, f.start + Math.min(f.dur, 1.8)], [0, f.likes ?? 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: 0.07 * VW, right: 0.07 * VW, top: (f.y ?? 0.13) * VH, background: '#fff', borderRadius: 30, padding: '34px 38px', boxShadow: '0 18px 50px rgba(0,0,0,0.3)', fontFamily: UI_FONT, color: '#111', transform: `translateY(${(1 - p) * 120}px) rotate(${(f.rotate ?? -1.5) * p}deg)`, opacity: Math.min(1, p * 1.4)}}>
        <div style={{display: 'flex', gap: 20, alignItems: 'center', marginBottom: 18}}>
          <div style={{width: 76, height: 76, borderRadius: 38, background: C.blue, display: 'grid', placeItems: 'center', ...display(32, C.ink)}}>{(f.name ?? '?').split(' ').map((x: string) => x[0]).join('').slice(0, 2)}</div>
          <div><div style={{fontSize: 34, fontWeight: 700}}>{f.name}</div><div style={{fontSize: 28, color: '#777'}}>{f.handle}</div></div>
        </div>
        <div style={{fontSize: 40, lineHeight: 1.3}}>{f.text}</div>
        <div style={{marginTop: 22, fontSize: 30, color: '#777', display: 'flex', gap: 34}}><span>♥ {likes.toLocaleString('en-AU')}</span>{f.comments !== undefined && <span>💬 {f.comments}</span>}</div>
      </div>
    </AbsoluteFill>
  );
};
// confetti burst in brand colours on a win
const Confetti: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const e = t - f.start; const cols = f.colours ?? [C.yellow, C.blue, C.white, C.paper];
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity: fadeOut(t, f.start + f.dur, 0.3)}}>
      {Array.from({length: f.n ?? 90}).map((_, i) => {
        const ang = rnd(i) * Math.PI * 2, sp = 900 + rnd(i + 7) * 1300, ox = (f.x ?? 0.5) * VW, oy = (f.y ?? 0.45) * VH;
        const x = ox + Math.cos(ang) * sp * e * 0.6, y = oy + Math.sin(ang) * sp * e * 0.6 - 900 * e + 2200 * e * e;
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: 14 + rnd(i + 3) * 14, height: 8 + rnd(i + 5) * 8, background: cols[i % cols.length], transform: `rotate(${(rnd(i + 9) * 720 + e * 900) % 360}deg)`, borderRadius: 2}} />;
      })}
    </AbsoluteFill>
  );
};
// airport split-flap board: tiles flip through letters until they land on the word
const Splitflap: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const word = String(f.text).toUpperCase(); const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const tw = Math.min(118, (0.9 * VW) / word.length - 8);
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', top: (f.y ?? 0.15) * VH, width: '100%', display: 'flex', justifyContent: 'center', gap: 8}}>
        {[...word].map((ch, i) => {
          const land = f.start + 0.25 + i * (f.stagger ?? 0.07) + 0.35; const done = t >= land || ch === ' ';
          const shown = done ? ch : AZ[Math.floor((t * 22 + i * 7) % AZ.length)];
          const flip = done ? 0 : ((t * 22) % 1);
          return (
            <div key={i} style={{width: tw, height: tw * 1.42, background: ch === ' ' ? 'transparent' : C.dark, borderRadius: 10, position: 'relative', overflow: 'hidden', boxShadow: ch === ' ' ? 'none' : '0 8px 20px rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center'}}>
              <span style={{...display(tw * 0.95, f.colour ?? C.yellow), transform: `scaleY(${1 - flip * 0.6})`}}>{shown}</span>
              {ch !== ' ' && <div style={{position: 'absolute', left: 0, right: 0, top: '50%', height: 3, background: 'rgba(0,0,0,0.55)'}} />}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
// scratch-off card: silver foil scratched away to reveal the answer
const Scratch: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps); const k = prog(t, f.start + 0.35, f.start + Math.min(f.dur - 0.3, 1.4), Easing.inOut(Easing.quad));
  const w = 0.8 * VW, h = 0.17 * VH; const strokes = 9;
  const holes = Array.from({length: strokes}).map((_, i) => { const kk = Math.min(1, Math.max(0, k * strokes - i)); const y = (i + 0.5) / strokes * 100; return `M 0 ${y} L ${kk * 100} ${y + (rnd(i) - 0.5) * 6}`; });
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: (VW - w) / 2, top: (f.y ?? 0.13) * VH, width: w, height: h, background: C.paper, borderRadius: 26, display: 'grid', placeItems: 'center', boxShadow: '0 16px 40px rgba(0,0,0,0.3)', transform: `scale(${0.85 + 0.15 * p}) rotate(-2deg)`}}>
        <div style={{...display(f.size ?? 96, C.ink)}}>{f.text}</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 26}}>
          <defs><mask id={`sc${Math.round(f.start * 100)}`}><rect width="100" height="100" fill="#fff" />{holes.map((d, i) => <path key={i} d={d} stroke="#000" strokeWidth={13} strokeLinecap="round" fill="none" />)}</mask>
            <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d9d9dc" /><stop offset="0.5" stopColor="#a9abb0" /><stop offset="1" stopColor="#e6e6e8" /></linearGradient></defs>
          <rect width="100" height="100" fill="url(#foil)" mask={`url(#sc${Math.round(f.start * 100)})`} />
        </svg>
        {k < 0.05 && <div style={{position: 'absolute', ...display(40, '#55575c'), letterSpacing: '0.1em'}}>{f.label ?? 'SCRATCH'}</div>}
      </div>
    </AbsoluteFill>
  );
};
// VHS rewind: scanlines, colour fringing, ◀◀ and a running timecode ("let me go back")
const Rewind: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const e = t - f.start; const tc = Math.max(0, (f.from ?? 30) - e * 40);
  const fmt = (x: number) => `00:${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 5px)', mixBlendMode: 'multiply'}} />
      <AbsoluteFill style={{background: `linear-gradient(90deg, rgba(255,0,80,0.12), transparent 30%, transparent 70%, rgba(0,200,255,0.12))`, transform: `translateY(${(e * 900) % 1920 - 960}px)`, height: 240, top: 0}} />
      <div style={{position: 'absolute', left: 70, top: 250, fontFamily: 'VT323, Menlo, monospace', fontSize: 72, color: '#fff', textShadow: '3px 0 rgba(255,0,80,0.7), -3px 0 rgba(0,200,255,0.7)', opacity: Math.floor(e * 4) % 2 ? 1 : 0.85}}>◀◀ {f.label ?? 'REW'}</div>
      <div style={{position: 'absolute', right: 0.16 * VW, top: 260, fontFamily: 'Menlo, monospace', fontSize: 52, color: '#fff', textShadow: '2px 0 rgba(255,0,80,0.7)'}}>{fmt(tc)}</div>
    </AbsoluteFill>
  );
};
// Instagram-style poll sticker whose results fill in
const IgPoll: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps); const k = prog(t, f.start + (f.revealAt ?? 0.6), f.start + (f.revealAt ?? 0.6) + 0.7);
  const res = f.result ?? [64, 36];
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: 0.12 * VW, right: 0.12 * VW, top: (f.y ?? 0.14) * VH, background: '#fff', borderRadius: 34, padding: '34px 34px 30px', boxShadow: '0 18px 46px rgba(0,0,0,0.3)', fontFamily: UI_FONT, transform: `scale(${0.8 + 0.2 * p}) rotate(${-2 * p}deg)`, opacity: Math.min(1, p * 1.5)}}>
        <div style={{textAlign: 'center', fontSize: 42, fontWeight: 800, color: '#111', marginBottom: 24}}>{f.question}</div>
        {(f.options ?? ['Yes', 'No']).map((o: string, i: number) => (
          <div key={i} style={{position: 'relative', height: 92, borderRadius: 18, background: '#EFEFEF', marginTop: 14, overflow: 'hidden'}}>
            <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${res[i] * k}%`, background: i === 0 ? C.yellow : C.blue}} />
            <div style={{position: 'absolute', inset: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 28px', fontSize: 38, fontWeight: 700, color: '#111'}}><span>{o}</span><span style={{opacity: k}}>{Math.round(res[i] * k)}%</span></div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
// a paper price tag swinging on its string
const Pricetag: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const e = t - f.start; const swing = 22 * Math.exp(-e * 2.2) * Math.cos(e * 9); const drop = prog(t, f.start, f.start + 0.3);
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: (f.x ?? 0.7) * VW, top: (f.y ?? 0.1) * VH - (1 - drop) * 300, transformOrigin: '50% 0', transform: `rotate(${swing}deg)`}}>
        <div style={{width: 3, height: 120, background: '#bbb', margin: '0 auto'}} />
        <div style={{position: 'relative', background: C.paper, backgroundImage: paperTex, padding: '38px 34px 26px 44px', clipPath: 'polygon(18% 0, 100% 0, 100% 100%, 18% 100%, 0 50%)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', ...display(f.size ?? 82, C.ink), whiteSpace: 'nowrap', marginLeft: -40}}>
          <div style={{position: 'absolute', left: 30, top: '50%', width: 18, height: 18, borderRadius: 9, background: '#ddd', transform: 'translateY(-50%)'}} />
          {f.text}
          {f.small && <div style={{...serif(30, C.ink), fontWeight: 400, textTransform: 'none', marginTop: 6}}>{f.small}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
};
// news ticker lower third ("BREAKING" + a scrolling line)
const Ticker: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const k = prog(t, f.start, f.start + 0.3); const scroll = (t - f.start) * (f.speed ?? 260);
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: (f.y ?? 0.72) * VH, height: 96, display: 'flex', transform: `translateX(${(1 - k) * -VW}px)`, boxShadow: '0 10px 30px rgba(0,0,0,0.3)'}}>
        <div style={{background: f.colour ?? C.yellow, padding: '0 30px', display: 'grid', placeItems: 'center', ...display(46, C.ink), zIndex: 1}}>{f.label ?? 'BREAKING'}</div>
        <div style={{flex: 1, background: tint(0.9), overflow: 'hidden', position: 'relative'}}>
          <div style={{position: 'absolute', top: '50%', transform: `translate(${VW * 0.7 - scroll}px, -50%)`, whiteSpace: 'nowrap', fontFamily: UI_FONT, fontWeight: 700, fontSize: 44, color: '#fff'}}>{f.text}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
// before / after wipe: a line sweeps across, the raw clip on one side, the edit on the other
const Wipe: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start + 0.2, f.start + f.dur * 0.75], [0.97, 0.03], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const pill = (txt: string, left: boolean): React.ReactNode => <div style={{position: 'absolute', top: 0.14 * VH, [left ? 'left' : 'right']: 40, background: left ? C.white : C.yellow, borderRadius: 999, padding: '10px 26px 6px', ...display(36, C.ink)}}>{txt}</div>;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{clipPath: `inset(0 ${(1 - k) * 100}% 0 0)`}}>
        <Media src={f.src} kind={f.kind} srcIn={f.srcIn} at={f.start} style={{width: '100%', height: '100%', objectFit: 'cover', filter: f.flat === false ? undefined : 'saturate(0.75) contrast(0.92)'}} />
        {pill(f.before ?? 'RAW', true)}
      </AbsoluteFill>
      <div style={{position: 'absolute', top: 0, bottom: 0, left: k * VW - 4, width: 8, background: C.white, boxShadow: '0 0 20px rgba(0,0,0,0.4)'}} />
      <div style={{opacity: k < 0.6 ? 1 : 0}}>{pill(f.after ?? 'EDITED', false)}</div>
    </AbsoluteFill>
  );
};
// a document page: lines type in, then one gets a highlighter sweep
const Doc: React.FC<{f: any}> = ({f}) => {
  const t = useT(); const {fps, width: VW, height: VH} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: 0.08 * VW, right: 0.08 * VW, top: (f.y ?? 0.12) * VH, background: '#fff', borderRadius: 14, boxShadow: '0 18px 46px rgba(0,0,0,0.3)', overflow: 'hidden', transform: `translateY(${(1 - p) * 140}px) rotate(${f.rotate ?? 1.5}deg)`, opacity: Math.min(1, p * 1.5), fontFamily: UI_FONT}}>
        <div style={{background: '#F1F3F4', padding: '18px 26px', display: 'flex', gap: 14, alignItems: 'center'}}><div style={{width: 34, height: 42, background: C.blue, borderRadius: 4}} /><div style={{fontSize: 30, color: '#333'}}>{f.title ?? 'Untitled document'}</div></div>
        <div style={{padding: '34px 46px 40px'}}>
          {(f.lines ?? []).map((ln: any, i: number) => {
            const n = Math.floor(Math.max(0, t - ln.at) * 38); const shown = ln.text.slice(0, n);
            const hl = ln.hl !== undefined ? prog(t, ln.hl, ln.hl + 0.4) : 0;
            return (
              <div key={i} style={{fontSize: ln.h ? 46 : 34, fontWeight: ln.h ? 800 : 400, color: '#202124', lineHeight: 1.4, marginBottom: 10, minHeight: ln.h ? 64 : 48}}>
                <span style={{backgroundImage: `linear-gradient(${C.yellow}, ${C.yellow})`, backgroundRepeat: 'no-repeat', backgroundSize: `${hl * 100}% 100%`}}>{shown}</span>
                {t >= ln.at && n < ln.text.length && <span style={{opacity: Math.floor(t * 3) % 2 ? 1 : 0}}>|</span>}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// task list that ticks off as she talks (dark UI card)
const Tasks: React.FC<{f: Extract<Fx, {type: 'tasks'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const cur = f.items.findIndex((it) => t < it.at);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: (f.y ?? 0.08) * 1920, left: (f.x ?? 0.08) * 1080, width: 560, background: 'rgba(24,24,24,0.94)', borderRadius: 28, padding: '28px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', fontFamily: UI_FONT, color: '#fff', transform: `scale(${0.9 + 0.1 * p})`, opacity: p * fadeOut(t, f.start + f.dur), transformOrigin: '0 0'}}>
        {f.title && <div style={{fontSize: 26, color: '#aaa', marginBottom: 12}}>{f.title}</div>}
        {f.items.map((it, k) => {
          const done = t >= it.at;
          const active = k === cur;
          return (
            <div key={k} style={{display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, margin: '12px 0', opacity: done || active ? 1 : 0.45}}>
              <span style={{width: 34, height: 34, borderRadius: 17, display: 'grid', placeItems: 'center', background: done ? C.yellow : 'transparent', color: C.ink, border: done ? 'none' : `3px solid ${active ? C.yellow : '#666'}`, fontSize: 22, transform: active ? `rotate(${t * 360}deg)` : undefined, borderTopColor: active ? 'transparent' : undefined}}>{done ? '✓' : ''}</span>
              {it.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// glowing line chart that draws itself
const Chart: React.FC<{f: Extract<Fx, {type: 'chart'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start + 0.1, f.start + Math.min(1.4, f.dur * 0.7)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const pts = f.points, max = Math.max(...pts), min = Math.min(...pts);
  const W = 900, H = 420, x0 = 90, y0 = (f.y ?? 0.1) * 1920;
  const xy = pts.map((v, i) => [x0 + (i / (pts.length - 1)) * W, y0 + H - ((v - min) / (max - min || 1)) * H]);
  const d = xy.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ');
  let len = 0; for (let i = 1; i < xy.length; i++) len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  const last = xy[xy.length - 1];
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <path d={d} fill="none" stroke={C.yellow} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - k)} style={{filter: `drop-shadow(0 0 14px ${C.yellow})`}} />
        {xy.map((q, i) => (i / (xy.length - 1) <= k ? <circle key={i} cx={q[0]} cy={q[1]} r={12} fill="#fff" /> : null))}
      </svg>
      {f.label && k > 0.95 && <div style={{position: 'absolute', left: last[0] - 260, top: last[1] - 120, width: 300, textAlign: 'right', ...display(64, C.yellow), textShadow: SOFT}}>{f.label}</div>}
    </AbsoluteFill>
  );
};

// paper cut: collage background, ransom-note word; her outline comes from CutoutLayer
const Paper: React.FC<{f: Extract<Fx, {type: 'paper'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const tones = [C.ink, C.yellow, '#fff', C.blue, '#fff', C.ink];
  return (
    <AbsoluteFill style={{background: '#EFEBE3', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 2px, transparent 2px), linear-gradient(90deg, rgba(0,0,0,0.06) 2px, transparent 2px)', backgroundSize: '60px 60px', opacity: interpolate(t, [f.start, f.start + 0.1], [0, 1], {extrapolateRight: 'clamp'}) * fadeOut(t, f.start + f.dur, 0.1)}}>
      <div style={{position: 'absolute', left: 120, top: 520, width: 900, height: 520, background: C.yellow, transform: 'rotate(-6deg)', clipPath: 'polygon(2% 8%, 30% 0, 62% 6%, 100% 0, 97% 45%, 100% 92%, 66% 100%, 28% 94%, 0 100%, 4% 52%)'}} />
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}><path d="M120,760 C260,600 340,900 480,700 S700,560 820,760 S960,900 1000,700" stroke={C.blue} strokeWidth={26} fill="none" strokeLinecap="round" opacity={0.85} /></svg>
      <div style={{position: 'absolute', top: 180, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18}}>
        {f.word.split(' ').map((wd, wi, all) => (<div key={wi} style={{display: 'flex', gap: 8}}>{[...wd].map((c, j) => {
          const i = all.slice(0, wi).join('').length + j;
          const p = pop(t, f.start + i * 0.06, fps);
          const bg = tones[i % tones.length];
          return c === ' ' ? <span key={i} style={{width: 30}} /> : (
            <span key={i} style={{background: bg, color: bg === C.ink ? '#fff' : C.ink, padding: '8px 14px', transform: `rotate(${((i * 37) % 13) - 6}deg) scale(${p})`, boxShadow: '0 6px 14px rgba(0,0,0,0.2)', ...(i % 2 ? display(92, bg === C.ink ? '#fff' : C.ink) : {...serif(104, bg === C.ink ? '#fff' : C.ink), fontWeight: 400})}}>{c}</span>
          );
        })}</div>))}
      </div>
    </AbsoluteFill>
  );
};

// doodle boil: hand-drawn sparkles/heart/question mark wobbling around her (outline from CutoutLayer)
const Doodle: React.FC<{f: Extract<Fx, {type: 'doodle'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const j = Math.floor(t * 8) % 3;
  const wob = (k: number) => `translate(${[0, 3, -2][(j + k) % 3]}px, ${[2, -2, 1][(j + k) % 3]}px) rotate(${[-3, 2, 0][(j + k) % 3]}deg)`;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur, 0.15)}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <g style={{transform: wob(0), transformOrigin: '820px 520px'}}><path d="M820,440 L840,500 L900,520 L840,540 L820,600 L800,540 L740,520 L800,500 Z" fill={C.yellow} stroke="#fff" strokeWidth={6} /></g>
        <g style={{transform: wob(1), transformOrigin: '230px 620px'}}><path d="M230,680 C140,610 160,540 230,580 C300,540 320,610 230,680 Z" fill="#F4B6C2" stroke="#fff" strokeWidth={6} /></g>
        <g style={{transform: wob(2), transformOrigin: '300px 420px'}}><text x={270} y={460} style={{...display(110, '#fff')}} fontFamily={DISPLAY} fontWeight={900} fill="#fff">?</text></g>
      </svg>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        {[0, 1, 2].map((k) => (
          <filter key={k} id={`boil${k}`}><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={k + 1} /><feDisplacementMap in="SourceGraphic" scale={10} /></filter>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// cover story: magazine masthead behind her, thin frame, cover lines
const Cover: React.FC<{f: Extract<Fx, {type: 'cover'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start, f.start + 0.5], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur, 0.2)}}>
      <div style={{position: 'absolute', inset: 40, border: '3px solid rgba(255,255,255,0.85)', opacity: k}} />
      <div style={{position: 'absolute', top: 70, width: '100%', textAlign: 'center', fontFamily: SERIF, fontWeight: 400, fontSize: 250, letterSpacing: `${0.02 + 0.08 * (1 - k)}em`, color: '#fff', lineHeight: 1, textShadow: '0 4px 30px rgba(0,0,0,0.25)', opacity: k}}>{f.title}</div>
      <div style={{position: 'absolute', left: 80, bottom: 420, display: 'grid', gap: 10, opacity: k}}>
        {(f.lines ?? []).map((l, i) => <div key={i} style={{...display(34, i ? '#fff' : C.yellow), textShadow: SOFT}}>{l}</div>)}
      </div>
    </AbsoluteFill>
  );
};

// glass type: translucent giant word behind her
const Glass: React.FC<{f: Extract<Fx, {type: 'glass'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start, f.start + 0.45], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.12) * 100}%`, alignItems: (f as any).align === 'right' ? 'flex-end' : 'center', paddingRight: (f as any).align === 'right' ? 40 : 0, opacity: fadeOut(t, f.start + f.dur, 0.2)}}>
      <div style={{...display(f.size ?? 260), color: 'transparent', WebkitTextStroke: '3px rgba(255,255,255,0.95)', backgroundImage: 'linear-gradient(170deg, rgba(255,255,255,0.9) 0%, rgba(175,192,218,0.75) 45%, rgba(68,68,68,0.55) 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35)) drop-shadow(0 10px 30px rgba(0,0,0,0.35))', transform: `translateY(${(1 - k) * 60}px) scale(${0.94 + 0.06 * k})`, opacity: k, whiteSpace: 'pre', textAlign: (f as any).align === 'right' ? 'right' : 'center'}}>{f.text}</div>
    </AbsoluteFill>
  );
};

// paper rip: a jagged white tear runs down the frame, the two sides darken and pull apart, then hard cut
const Rip: React.FC<{f: Extract<Fx, {type: 'rip'}>}> = ({f}) => {
  const t = useT();
  const d = f.dur ?? 0.5;
  if (!within(t, f.start - d, d + 0.08)) return null;
  const k = interpolate(t, [f.start - d, f.start - d * 0.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const open = interpolate(t, [f.start - d * 0.35, f.start], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  const pts = Array.from({length: 33}).map((_, i) => [540 + (((i * 7919) % 13) - 6) * 9, i * 60]);
  const reach = 1920 * k;
  const path = pts.filter((q) => q[1] <= reach).map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ');
  const left = pts.map((q) => `${q[0] - open * 560}px ${q[1]}px`).join(', ');
  const right = pts.slice().reverse().map((q) => `${q[0] + open * 560}px ${q[1]}px`).join(', ');
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {open > 0 && <div style={{position: 'absolute', inset: 0, background: '#111', clipPath: `polygon(${left}, ${right})`}} />}
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))'}}>
        {[-1, 1].map((side) => (
          <path key={side} d={path} transform={`translate(${side * open * 560}, 0)`} fill="none" stroke="#F6F3EC" strokeWidth={18} strokeLinejoin="miter" />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// pinned question bubble that sits at the top for the whole stretch
const Header: React.FC<{f: Extract<Fx, {type: 'header'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  return (
    <AbsoluteFill style={{top: '6%', alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{background: '#fff', borderRadius: 26, padding: '18px 26px', display: 'flex', gap: 14, alignItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', transform: `scale(${p})`, maxWidth: 820}}>
        <span style={{width: 26, height: 26, borderRadius: 13, background: C.yellow, flexShrink: 0}} />
        <span style={{fontFamily: UI_FONT, fontSize: 36, fontWeight: 600, color: C.ink, lineHeight: 1.2}}>{f.text}</span>
      </div>
    </AbsoluteFill>
  );
};

// the CTA as it happens: keyword typing into an Instagram comment box, then a follow pill
const Comment: React.FC<{f: Extract<Fx, {type: 'comment'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const typed = f.keyword.slice(0, Math.floor(Math.max(0, t - f.start - 0.3) / 0.09));
  const sent = t > f.start + 0.4 + f.keyword.length * 0.09 + 0.3;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 640, opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{width: 860, background: tint(0.94), borderRadius: 999, padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 18, transform: `scale(${p})`, fontFamily: UI_FONT, color: '#fff', fontSize: 36}}>
        <span style={{width: 50, height: 50, borderRadius: 25, background: C.blue}} />
        <span style={{flex: 1, opacity: typed ? 1 : 0.5}}>{typed || 'Add a comment…'}</span>
        <span style={{width: 50, height: 50, borderRadius: 25, background: sent ? C.yellow : '#555', display: 'grid', placeItems: 'center', color: C.ink, fontSize: 28}}>↑</span>
      </div>
      {f.follow && sent && (
        <div style={{marginTop: 18, background: '#fff', borderRadius: 999, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 16, fontFamily: UI_FONT, fontSize: 30, color: '#111', transform: `scale(${pop(t, f.start + 0.4 + f.keyword.length * 0.09 + 0.3, fps)})`}}>
          <span style={{width: 46, height: 46, borderRadius: 23, background: C.yellow}} /><b>{f.handle ?? HANDLE}</b>
          <span style={{background: '#0095F6', color: '#fff', borderRadius: 10, padding: '8px 22px', fontWeight: 600}}>Follow</span>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ===== effects library v4 (justyn.ai "new edit") =====
const card: React.CSSProperties = {background: '#fff', borderRadius: 24, boxShadow: '0 18px 50px rgba(0,0,0,0.3)', fontFamily: UI_FONT, color: '#1E1E1E'};

// week grid whose cells fill in (content calendar)
const Calendar: React.FC<{f: Extract<Fx, {type: 'calendar'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const days = f.days ?? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const rows = f.rows ?? 3;
  const cells: number[][] = f.fill ?? days.flatMap((_, d) => Array.from({length: rows}).map((__, r) => [d, r]));
  const p = pop(t, f.start, fps);
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.06) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{...card, padding: 26, width: 940, transform: `scale(${0.9 + 0.1 * p}) rotate(-2deg)`}}>
        {f.title && <div style={{...display(36, C.ink), marginBottom: 14}}>{f.title}</div>}
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 10}}>
          {days.map((d) => <div key={d} style={{fontSize: 22, fontWeight: 700, color: '#888', textAlign: 'center'}}>{d}</div>)}
          {Array.from({length: rows}).flatMap((_, r) => days.map((__, d) => {
            const idx = cells.findIndex((c) => c[0] === d && c[1] === r);
            const at = f.start + 0.3 + Math.max(0, idx) * Math.min(0.12, (f.dur * 0.6) / Math.max(1, cells.length));
            const on = idx >= 0 && t >= at;
            return <div key={`${r}-${d}`} style={{height: 64, borderRadius: 10, background: on ? (idx % 4 === 0 ? C.yellow : C.ink) : '#EEE', transform: on ? `scale(${pop(t, at, fps)})` : undefined}} />;
          }))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// model / option picker that opens and selects
const Dropdown: React.FC<{f: Extract<Fx, {type: 'dropdown'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const open = t > f.start + 0.4;
  const picked = t > f.start + 0.4 + 0.25 * (f.pick + 1) + 0.2;
  const hover = Math.min(f.pick, Math.floor(Math.max(0, t - f.start - 0.4) / 0.25));
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.08) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{...card, width: 640, padding: 22, transform: `scale(${p})`}}>
        <div style={{fontSize: 26, color: '#888', marginBottom: 10}}>{f.label ?? 'Model'}</div>
        <div style={{border: '2px solid #ddd', borderRadius: 14, padding: '14px 18px', fontSize: 34, display: 'flex', justifyContent: 'space-between'}}>{picked ? f.options[f.pick] : 'Choose…'}<span>⌄</span></div>
        {open && !picked && f.options.map((o, i) => (
          <div key={i} style={{fontSize: 34, padding: '12px 18px', borderRadius: 12, marginTop: 6, background: i === hover ? '#F1EFE8' : 'transparent', display: 'flex', justifyContent: 'space-between'}}>{o}{i === hover && i === f.pick ? <span>✓</span> : null}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// effort dial turning up
const Dial: React.FC<{f: Extract<Fx, {type: 'dial'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const v = interpolate(t, [f.start + 0.3, f.start + Math.min(1.6, f.dur * 0.7)], [f.from ?? 0.2, f.to ?? 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const ang = -135 + 270 * v;
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.07) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{width: 420, height: 420, borderRadius: 40, background: '#1d2b24', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', transform: `scale(${p})`, position: 'relative'}}>
        {['LOW', 'MED', 'HIGH', 'MAX'].map((l, i) => {
          const a = (-135 + 90 * i) * Math.PI / 180;
          return <div key={l} style={{position: 'absolute', left: 210 + Math.sin(a) * 165 - 40, top: 210 - Math.cos(a) * 165 - 14, width: 80, textAlign: 'center', fontFamily: UI_FONT, fontSize: 22, fontWeight: 700, color: v >= i / 3 - 0.01 ? C.yellow : '#7b8a82'}}>{l}</div>;
        })}
        <div style={{width: 220, height: 220, borderRadius: 110, background: 'radial-gradient(circle at 40% 35%, #3a4a42, #121a16)', boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.1), 0 10px 20px rgba(0,0,0,0.5)', transform: `rotate(${ang}deg)`, position: 'relative'}}>
          <div style={{position: 'absolute', left: 104, top: 14, width: 12, height: 60, borderRadius: 6, background: C.yellow}} />
        </div>
        <div style={{position: 'absolute', bottom: 22, fontFamily: UI_FONT, fontSize: 24, color: '#cfd8d2', letterSpacing: '0.2em'}}>{f.label ?? 'EFFORT'}</div>
      </div>
    </AbsoluteFill>
  );
};

// brand kit: colour swatch cards fanning out (with Aa type sample)
const Swatches: React.FC<{f: Extract<Fx, {type: 'swatches'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const cols = f.colours ?? [C.yellow, C.blue, C.offwhite, C.charcoal, C.ink];
  const n = cols.length;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {cols.map((c, k) => {
        const p = pop(t, f.start + k * 0.06, fps);
        const ang = (k - (n - 1) / 2) * 14 * p;
        const dark = c === C.ink || c === C.charcoal;
        return (
          <div key={k} style={{position: 'absolute', left: 540 - 110, top: (f.y ?? 0.08) * 1920, width: 220, height: 420, borderRadius: 18, background: c, boxShadow: '0 14px 34px rgba(0,0,0,0.3)', transformOrigin: '50% 140%', transform: `rotate(${ang}deg)`, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
            <div style={{...serif(64, dark ? '#fff' : C.ink), fontWeight: 400}}>Aa</div>
            <div style={{fontFamily: UI_FONT, fontSize: 20, color: dark ? '#ddd' : '#555'}}>{c.toUpperCase()}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// paper note whose items get struck through
const Note: React.FC<{f: Extract<Fx, {type: 'note'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.07) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{background: '#F6F3EC', width: 620, padding: '30px 40px', boxShadow: '0 16px 40px rgba(0,0,0,0.3)', transform: `rotate(-3deg) scale(${p})`}}>
        {f.title && <div style={{...serif(54, C.ink), fontWeight: 400, borderBottom: '2px solid #ccc', paddingBottom: 10, marginBottom: 12, textAlign: 'center'}}>{f.title}</div>}
        {f.items.map((it, k) => {
          const w = it.strike !== undefined ? interpolate(t, [it.strike, it.strike + 0.25], [0, 104], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
          return (
            <div key={k} style={{position: 'relative', ...serif(40, C.ink), fontWeight: 400, textAlign: 'center', margin: '8px 0', opacity: w >= 100 ? 0.55 : 1}}>
              {it.text}
              {w > 0 && <div style={{position: 'absolute', left: '-2%', top: '52%', height: 6, width: `${w}%`, background: '#E5484D', borderRadius: 3, transform: 'rotate(-2deg)'}} />}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// envelope opens and the guide slides up out of it
const Envelope: React.FC<{f: Extract<Fx, {type: 'envelope'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const flap = interpolate(t, [f.start + 0.35, f.start + 0.7], [0, 180], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rise = interpolate(t, [f.start + 0.7, f.start + 1.2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const top = (f.y ?? 0.62) * 1920;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', left: 240, top: top - 380 * rise, width: 600, height: 420, background: '#fff', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', overflow: 'hidden', transform: `scale(${p})`}}>
        {f.src ? <Img src={staticFile(f.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <div style={{padding: 30, ...serif(46, C.ink), fontWeight: 400}}>{f.label ?? 'The guide'}</div>}
      </div>
      <div style={{position: 'absolute', left: 200, top, width: 680, height: 420, background: C.charcoal, borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)', transform: `scale(${p})`}}>
        <div style={{position: 'absolute', bottom: 30, width: '100%', textAlign: 'center', ...display(30, C.yellow)}}>{f.label ?? ''}</div>
      </div>
      <div style={{position: 'absolute', left: 200, top, width: 680, height: 260, transformOrigin: '50% 0%', transform: `perspective(1200px) rotateX(${flap}deg) scale(${p})`, background: '#545454', clipPath: 'polygon(0 0, 100% 0, 50% 100%)', backfaceVisibility: 'hidden'}} />
    </AbsoluteFill>
  );
};

// glitch slice transition: horizontal bands shove sideways for a beat
const Glitch: React.FC<{f: Extract<Fx, {type: 'glitch'}>}> = ({f}) => {
  const t = useT();
  const d = f.dur ?? 0.3;
  if (!within(t, f.start - d / 2, d)) return null;
  const k = 1 - Math.abs((t - f.start) / (d / 2));
  const n = 9, seed = Math.floor(t * 30);
  return (
    <AbsoluteFill>
      {Array.from({length: n}).map((_, i) => {
        const off = ((((seed + i * 13) * 7919) % 200) - 100) * k * 1.6;
        return <div key={i} style={{position: 'absolute', left: 0, right: 0, top: `${(i / n) * 100}%`, height: `${100 / n}%`, transform: `translateX(${off}px)`, background: i % 3 === 0 ? `rgba(254,252,142,${0.25 * k})` : i % 3 === 1 ? `rgba(175,192,218,${0.25 * k})` : 'transparent', mixBlendMode: 'screen', backdropFilter: `blur(${k * 2}px)`}} />;
      })}
    </AbsoluteFill>
  );
};

// ===== effects library v5 (sebintel) =====
// explainer canvas: full-screen off-white board that hides her footage; UI effects + captions sit on it
const Canvas: React.FC<{f: Extract<Fx, {type: 'canvas'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const a = interpolate(t, [f.start, f.start + 0.12], [0, 1], {extrapolateRight: 'clamp'}) * fadeOut(t, f.start + f.dur, 0.12);
  return <AbsoluteFill style={{opacity: a, background: f.colour ?? '#EFEDE8', backgroundImage: 'radial-gradient(rgba(0,0,0,0.07) 2px, transparent 2px)', backgroundSize: '44px 44px'}} />;
};

// icon grid: every tool/skill in a grid, then one steps forward and the rest blur back
const Spotlight: React.FC<{f: Extract<Fx, {type: 'spotlight'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const cols = 3;
  const focus = f.pick !== undefined ? interpolate(t, [f.pickAt ?? f.start + f.dur * 0.55, (f.pickAt ?? f.start + f.dur * 0.55) + 0.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}) : 0;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      {f.items.map((it, k) => {
        const p = pop(t, f.start + k * 0.05, fps);
        const x = 100 + (k % cols) * 300, y = (f.y ?? 0.1) * 1920 + Math.floor(k / cols) * 240;
        const me = k === f.pick;
        const tx = me ? (540 - 150 - x) * focus : 0, ty = me ? (820 - y) * focus : 0;
        return (
          <div key={k} style={{position: 'absolute', left: x, top: y, width: 280, textAlign: 'center', transform: `translate(${tx}px, ${ty}px) scale(${p * (me ? 1 + 0.9 * focus : 1)})`, filter: !me && focus > 0 ? `blur(${focus * 6}px)` : undefined, opacity: !me ? 1 - 0.55 * focus : 1, zIndex: me ? 2 : 1}}>
            <div style={{width: 120, height: 120, margin: '0 auto', borderRadius: 30, background: me ? C.yellow : C.ink, display: 'grid', placeItems: 'center', boxShadow: '0 10px 26px rgba(0,0,0,0.25)', ...display(56, me ? C.ink : C.yellow)}}>{it.icon ?? it.label[0]}</div>
            <div style={{fontFamily: UI_FONT, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 12}}>{it.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// stat card with bars that fill (profile scores, before/after metrics)
const StatBars: React.FC<{f: Extract<Fx, {type: 'statbars'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.08) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{...card, width: 900, padding: '30px 34px', transform: `scale(${0.92 + 0.08 * p})`}}>
        {f.title && <div style={{...display(38, C.ink), marginBottom: 18}}>{f.title}</div>}
        {f.rows.map((r, k) => {
          const w = interpolate(t, [f.start + 0.3 + k * 0.15, f.start + 1.1 + k * 0.15], [0, r.value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          return (
            <div key={k} style={{display: 'grid', gridTemplateColumns: '220px 1fr 90px', alignItems: 'center', gap: 18, margin: '14px 0', fontSize: 30}}>
              <span style={{fontWeight: 600}}>{r.label}</span>
              <div style={{height: 22, borderRadius: 11, background: '#EEE', overflow: 'hidden'}}><div style={{height: '100%', width: `${w}%`, borderRadius: 11, background: `linear-gradient(90deg, ${C.blue}, ${C.yellow})`}} /></div>
              <span style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700}}>{Math.round(w)}%</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// process flow: cards linked by arrows that draw in, one per step
const Flow: React.FC<{f: Extract<Fx, {type: 'flow'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const step = (f.dur * 0.75) / f.steps.length;
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.06) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      {f.steps.map((st, k) => {
        const at = f.start + k * step;
        if (t < at) return null;
        const p = pop(t, at, fps);
        const arrow = interpolate(t, [at, at + 0.25], [0, 1], {extrapolateRight: 'clamp'});
        return (
          <div key={k} style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            {k > 0 && <div style={{width: 8, height: 60 * arrow, background: '#E5484D', borderRadius: 4, position: 'relative'}}>{arrow > 0.95 && <div style={{position: 'absolute', bottom: -14, left: -10, borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderTop: '18px solid #E5484D'}} />}</div>}
            <div style={{...card, marginTop: k ? 16 : 0, padding: '18px 34px', fontSize: 36, fontWeight: 600, transform: `scale(${p})`, minWidth: 420, textAlign: 'center'}}>{st}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ===== effects library v6 (tenfoldmarc DeZ6k9mTj6-) =====
// editing-software timeline with coloured clips and a moving playhead
const TimelineFx: React.FC<{f: Extract<Fx, {type: 'timeline'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p = pop(t, f.start, fps);
  const head = interpolate(t, [f.start, f.start + f.dur], [0.05, 0.95]);
  const rows = [[C.blue, 0.06, 0.2, 0.33, 0.48, 0.62, 0.8], [C.yellow, 0.1, 0.3, 0.55, 0.75], ['#7FB59A', 0.0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84], ['#5a6b62']];
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.7) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{width: 960, background: 'rgba(22,24,23,0.94)', borderRadius: 18, padding: '18px 16px', boxShadow: '0 20px 50px rgba(0,0,0,0.45)', transform: `translateY(${(1 - p) * 80}px)`, position: 'relative'}}>
        {rows.map((r, ri) => (
          <div key={ri} style={{position: 'relative', height: 44, margin: '8px 0', background: 'rgba(255,255,255,0.04)', borderRadius: 6}}>
            {ri === 3 ? (
              <svg width={928} height={44}>{Array.from({length: 120}).map((_, i) => { const h = 6 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37)) * 30; return <rect key={i} x={i * 7.7} y={22 - h / 2} width={4} height={h} rx={2} fill="#7FB59A" />; })}</svg>
            ) : (r.slice(1) as number[]).map((x, k) => <div key={k} style={{position: 'absolute', left: `${x * 100}%`, width: `${(0.11 + (k % 3) * 0.02) * 100}%`, top: 4, bottom: 4, borderRadius: 6, background: r[0] as string, opacity: 0.9}} />)}
          </div>
        ))}
        <div style={{position: 'absolute', top: 8, bottom: 8, left: `${head * 100}%`, width: 4, background: '#fff', borderRadius: 2, boxShadow: '0 0 10px #fff'}} />
      </div>
    </AbsoluteFill>
  );
};

// word that ignites: glowing yellow with drifting sparks
const Burn: React.FC<{f: Extract<Fx, {type: 'burn'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start, f.start + 0.3], [0, 1], {extrapolateRight: 'clamp'});
  const flick = 0.85 + 0.15 * Math.sin(t * 40);
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.08) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{...display(f.size ?? 200, C.yellow), whiteSpace: 'nowrap', textShadow: `0 0 ${20 * flick}px #FFB347, 0 0 ${50 * flick}px #FF7A1A, 0 0 ${90 * flick}px rgba(255,90,0,0.6)`, transform: `scale(${0.9 + 0.1 * k})`, opacity: k}}>{f.text}</div>
      {Array.from({length: 26}).map((_, i) => {
        const life = ((t - f.start) * 0.8 + i * 0.137) % 1;
        const x = 120 + ((i * 7919) % 840), y = 260 - life * 420;
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: 6, height: 6, borderRadius: 3, background: '#FFC46B', boxShadow: '0 0 8px #FF8A2A', opacity: (1 - life) * k}} />;
      })}
    </AbsoluteFill>
  );
};

// hand annotation: short note with a drawn arrow pointing at something
const Annotate: React.FC<{f: Extract<Fx, {type: 'annotate'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const k = interpolate(t, [f.start, f.start + 0.4], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const X = f.x * 1080, Y = f.y * 1920, TX = f.toX * 1080, TY = f.toY * 1920;
  const mx = (X + TX) / 2 + (TY - Y) * 0.25, my = (Y + TY) / 2 - (TX - X) * 0.25;
  const d = `M${X},${Y} Q${mx},${my} ${TX},${TY}`;
  const ang = Math.atan2(TY - my, TX - mx);
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))'}}>
        <path d={d} fill="none" stroke={C.yellow} strokeWidth={7} strokeLinecap="round" strokeDasharray={900} strokeDashoffset={900 * (1 - k)} />
        {k > 0.95 && <path d={`M${TX},${TY} l${-Math.cos(ang - 0.5) * 34},${-Math.sin(ang - 0.5) * 34} M${TX},${TY} l${-Math.cos(ang + 0.5) * 34},${-Math.sin(ang + 0.5) * 34}`} stroke={C.yellow} strokeWidth={7} strokeLinecap="round" />}
      </svg>
      <div style={{position: 'absolute', left: X - ((f as any).w ?? 320) / 2, top: Y - (f.y < f.toY ? 70 : -10), width: (f as any).w ?? 320, textAlign: 'center', ...serif((f as any).size ?? 52, C.yellow), fontWeight: 400, transform: 'rotate(-6deg)', textShadow: '0 2px 6px rgba(0,0,0,0.65), 0 0 28px rgba(0,0,0,0.5)', opacity: k}}>{f.text}</div>
    </AbsoluteFill>
  );
};

// receipts stacking up with a running total that ticks, then gets struck out
const Receipts: React.FC<{f: Extract<Fx, {type: 'receipts'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const step = Math.min(0.35, (f.dur * 0.55) / f.items.length);
  const shown = f.items.filter((_, i) => t >= f.start + i * step);
  const total = f.total ?? f.items.reduce((a, b) => a + b.price, 0);
  const run = interpolate(t, [f.start, f.start + f.items.length * step + 0.3], [0, total], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const strike = f.strikeAt !== undefined ? interpolate(t, [f.strikeAt, f.strikeAt + 0.25], [0, 110], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  return (
    <AbsoluteFill style={{opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{position: 'absolute', top: (f.y ?? 0.04) * 1920, width: '100%', display: 'flex', justifyContent: 'center'}}>
        <div style={{position: 'relative', background: C.ink, borderRadius: 14, padding: '10px 26px', ...display(80, '#E5484D'), fontVariantNumeric: 'tabular-nums', boxShadow: '0 10px 30px rgba(0,0,0,0.4)'}}>
          ${Math.round(run).toLocaleString('en-AU')}
          {strike > 0 && <div style={{position: 'absolute', left: '-5%', top: '48%', height: 10, width: `${strike}%`, background: C.yellow, borderRadius: 5}} />}
        </div>
      </div>
      {shown.map((it, i) => {
        const p = pop(t, f.start + i * step, fps);
        const left = i % 2 ? 640 : 70, top = (f.y ?? 0.04) * 1920 + 150 + Math.floor(i / 2) * 60;
        return (
          <div key={i} style={{position: 'absolute', left, top, width: 360, background: '#F6F3EC', padding: '16px 20px 22px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 26, color: '#222', transform: `rotate(${i % 2 ? 4 : -4}deg) scale(${p})`, boxShadow: '0 10px 26px rgba(0,0,0,0.35)', clipPath: 'polygon(0 0,100% 0,100% 94%,95% 100%,90% 94%,85% 100%,80% 94%,75% 100%,70% 94%,65% 100%,60% 94%,55% 100%,50% 94%,45% 100%,40% 94%,35% 100%,30% 94%,25% 100%,20% 94%,15% 100%,10% 94%,5% 100%,0 94%)'}}>
            <div style={{fontWeight: 700, marginBottom: 6}}>{it.label}</div>
            <div style={{display: 'flex', justifyContent: 'space-between'}}><span>1 x</span><span style={{color: '#E5484D'}}>${it.price}</span></div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const fmt = (v: number, f?: string) => {
  if (f === 'time') { const s = Math.max(0, Math.round(v)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  if (f === 'money') return '$' + Math.round(v).toLocaleString('en-AU');
  if (f === 'k') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K' : String(Math.round(v));
  return Math.round(v).toLocaleString('en-AU');
};
const Counter: React.FC<{f: Extract<Fx, {type: 'counter'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  const v = interpolate(t, [f.start + 0.15, f.start + Math.min(f.dur - 0.3, 1.6)], [f.from, f.to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{top: `${(f.y ?? 0.14) * 100}%`, alignItems: 'center', opacity: fadeOut(t, f.start + f.dur)}}>
      {f.label && <div style={{...serif(44), textShadow: SOFT}}>{f.label}</div>}
      {f.roll ? (
        <div style={{display: 'flex', ...display(f.size ?? 180, C.yellow), textShadow: '0 4px 30px rgba(0,0,0,0.25)'}}>
          {[...fmt(f.to, f.format)].map((ch, k, arr) => {
            if (!/[0-9]/.test(ch)) return <span key={k}>{ch}</span>;
            const target = +ch;
            const spin = interpolate(t, [f.start + 0.1 + k * 0.08, f.start + 0.9 + k * 0.12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
            const pos = (target + 20) * spin; // spins two full turns then lands
            const h = (f.size ?? 180) * 0.92;
            return (
              <span key={k} style={{display: 'inline-block', height: h, overflow: 'hidden', lineHeight: `${h}px`}}>
                <span style={{display: 'block', transform: `translateY(${-(pos % 10) * h}px)`, filter: spin < 1 ? `blur(${(1 - spin) * 6}px)` : undefined}}>
                  {Array.from({length: 11}).map((_, d) => <div key={d} style={{height: h}}>{d % 10}</div>)}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{...display(f.size ?? 180, C.yellow), fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 30px rgba(0,0,0,0.25)'}}>{fmt(v, f.format)}</div>
      )}
    </AbsoluteFill>
  );
};

const DmCard: React.FC<{f: Extract<Fx, {type: 'dm'}>}> = ({f}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, f.start, f.dur)) return null;
  const p1 = pop(t, f.start, fps), p2 = pop(t, f.start + 0.9, fps);
  const box: React.CSSProperties = {background: '#fff', borderRadius: 26, padding: '18px 24px', boxShadow: '0 16px 44px rgba(0,0,0,0.25)', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", color: '#111', fontSize: 30, display: 'flex', alignItems: 'center', gap: 16};
  return (
    <AbsoluteFill style={{top: `${((f as any).y ?? 0.1) * 100}%`, alignItems: 'center', gap: 16, opacity: fadeOut(t, f.start + f.dur)}}>
      <div style={{...display(44), textAlign: 'center', textShadow: SOFT}}>{f.verb ?? 'Comment'} <span style={{color: C.yellow}}>{f.keyword}</span></div>
      {f.text && <div style={{...serif(38), textShadow: SOFT}}>{f.text}</div>}
      <div style={{...box, transform: `scale(${p1})`, width: 700}}><div style={{width: 52, height: 52, borderRadius: 26, background: C.blue}} /><div><b>{f.handle ?? 'you'}</b><br />{f.keyword}</div></div>
      <div style={{...box, transform: `scale(${p2})`, width: 700, opacity: p2}}><div style={{width: 52, height: 52, borderRadius: 26, background: C.yellow}} /><div><b>{HANDLE}</b><br />{f.reply ?? 'Sending it now ✨'}</div></div>
    </AbsoluteFill>
  );
};

const Wall: React.FC<{f: Extract<Fx, {type: 'wall'}>}> = ({f}) => {
  const t = useT();
  if (!within(t, f.start, f.dur)) return null;
  return (
    <AbsoluteFill style={{background: (f as any).bg ?? C.ink, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, padding: 14, alignContent: (f as any).scroll ? 'start' : 'center', opacity: fadeOut(t, f.start + f.dur), filter: (f as any).grey ? 'grayscale(1) brightness(0.9) contrast(0.85)' : undefined, transform: (f as any).scroll ? `translateY(${-interpolate(t, [f.start, f.start + f.dur], [0, (f as any).scroll * 1920], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad)})}px)` : undefined}}>
      {f.srcs.map((s, i) => {
        const a = interpolate(t, [f.start + i * 0.08, f.start + i * 0.08 + 0.2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return <Img key={i} src={staticFile(s)} style={{width: '100%', aspectRatio: '9/16', objectFit: 'cover', borderRadius: 14, opacity: a, transform: `translateY(${(1 - a) * 40}px)`}} />;
      })}
    </AbsoluteFill>
  );
};

const LabelFx: React.FC<{text: string; small?: string; start: number; dur: number; y?: number; x?: number; bg?: 'blue' | 'black'}> = ({text, small, start, dur, y, x, bg}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (!within(t, start, dur)) return null;
  const p = pop(t, start, fps);
  return (
    <AbsoluteFill style={{top: `${(y ?? 0.13) * 100}%`, alignItems: x !== undefined ? 'flex-start' : 'center', paddingLeft: x !== undefined ? `${x * 100}%` : undefined}}>
      <div style={{background: bg === 'black' ? '#111' : C.blue, padding: '14px 30px 12px', transform: `scaleX(${p})`, textAlign: 'center'}}>
        {small && <div style={bg === 'black' ? serif(34, C.yellow) : display(30)}>{small}</div>}
        <div style={display(bg === 'black' ? 52 : 64)}>{text}</div>
      </div>
    </AbsoluteFill>
  );
};

const Checklist: React.FC<{c: NonNullable<Plan['checklist']>}> = ({c}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (t < c.start || t > c.end) return null;
  const slots = c.slots ?? c.items.length;
  return (
    <AbsoluteFill style={{top: `${(c.y ?? 0.05) * 100}%`, alignItems: 'center'}}>
      <div style={display(110, C.yellow)}>{c.title}</div>
      <div style={{width: 760, marginTop: 10}}>
        {Array.from({length: slots}).map((_, i) => {
          const it = c.items[i];
          const on = it && t >= it.at;
          return on ? (
            <div key={i} style={{...display(32), textAlign: 'center', height: 44, opacity: pop(t, it.at, fps), textShadow: SOFT}}>{it.text}</div>
          ) : <div key={i} style={{height: 26, margin: '9px 0', background: 'rgba(255,255,255,0.85)'}} />;
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{e: NonNullable<Plan['end']>}> = ({e}) => {
  const t = useT();
  const {fps} = useVideoConfig();
  if (t < e.start) return null;
  const p = pop(t, e.start, fps);
  return (
    <AbsoluteFill style={{top: `${(e.y ?? 0.31) * 100}%`, alignItems: 'center'}}>
      <div style={{textAlign: 'center', transform: `scale(${0.9 + 0.1 * p})`, opacity: p}}>
        {e.lines.map((l, i) => <div key={i} style={inkLine(e.ink, i === e.lines.length - 1, 58, '0 3px 20px rgba(0,0,0,0.35)')}>{l}</div>)}
      </div>
    </AbsoluteFill>
  );
};

// transitions applied to the whole frame
const useTransition = (plan: Plan, t: number): React.CSSProperties => {
  for (const f of plan.fx ?? []) {
    if (f.type === 'zoomthrough' && within(t, f.start - 0.3, 0.55)) {
      const before = t < f.start;
      const k = before ? interpolate(t, [f.start - 0.3, f.start], [0, 1], {easing: Easing.in(Easing.cubic)}) : interpolate(t, [f.start, f.start + 0.25], [1, 0], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
      return {filter: `blur(${k * 22}px)`, transform: `scale(${before ? 1 + k * 2.2 : 1 + k * 0.6})`};
    }
    if (f.type === 'zoomblur' && within(t, f.start - 0.12, (f.dur ?? 0.3))) {
      const k = 1 - Math.abs((t - f.start) / ((f.dur ?? 0.3) / 2));
      return {filter: `blur(${Math.max(0, k) * 18}px)`, transform: `scale(${1 + Math.max(0, k) * 0.12})`};
    }
  }
  return {};
};
const Flash: React.FC<{f: Extract<Fx, {type: 'flash'}>}> = ({f}) => {
  const t = useT();
  const d = f.dur ?? 0.35;
  if (!within(t, f.start - d / 2, d)) return null;
  const k = 1 - Math.abs((t - f.start) / (d / 2));
  return <AbsoluteFill style={{background: 'radial-gradient(circle at 70% 30%, rgba(255,214,170,0.95), rgba(255,140,120,0.6) 45%, transparent 75%)', opacity: k, mixBlendMode: 'screen'}} />;
};

// ---------- the reel ----------
// Chrome loads @font-face fonts lazily, and Remotion's own fonts.ready check can run before the first
// load has even started, so brand fonts sometimes rendered as standins. Block the render until every
// family in the brand (and the standins) has actually loaded.
const useBrandFonts = (b: Brand) => {
  React.useEffect(() => {
    const handle = delayRender('loading brand fonts', {timeoutInMilliseconds: 60000});
    const sample = 'LABEL label 0123 ?';
    const want = [
      `900 100px '${b.fonts.display.family}'`, `800 100px '${STANDIN.display.family}'`, `900 100px 'DisplayFallback'`,
      `300 100px '${b.fonts.serif.family}'`, `400 100px '${b.fonts.serif.family}'`, `400 100px '${STANDIN.serif.family}'`,
    ];
    Promise.all(want.map((f) => document.fonts.load(f, sample).catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle), () => continueRender(handle));
  }, [b]);
};

// QA passes, used by `reel.mjs check`. 'plate' is the footage with nothing drawn over it, so face
// detection sees her even under a b-roll band and the background behind a caption can be sampled.
// 'text' is every text element alone on transparent, so a caption's real box and colour are measured
// from what is actually drawn instead of guessed from the plan.
export type QaLayer = 'plate' | 'text';
const SNAP = 0.6; // seconds: a cover ending this close before a cut runs on to the cut
const snapToCuts = (plan: Plan): Plan => {
  const cuts = plan.segments.map((s) => s.start).concat(plan.duration);
  const snapEnd = (start: number, dur: number) => {
    const end = start + dur; const c = cuts.find((x) => x >= end - 0.02 && x - end <= SNAP);
    return c !== undefined && c > start ? c - start : dur;
  };
  const covers = ['backdrop', 'band', 'uiworld', 'colourbg', 'canvas', 'wall', 'paper', 'cover', 'phoneme'];
  return {
    ...plan,
    inserts: (plan.inserts ?? []).map((x) => (x.pos === 'full' ? {...x, dur: snapEnd(x.start, x.dur)} : x)),
    fx: (plan.fx ?? []).map((f) => (covers.includes(f.type as string) ? {...f, dur: snapEnd(f.start, f.dur)} as typeof f : f)),
  };
};

export const Reel: React.FC<{plan: Plan; brand?: Brand; overlayOnly?: boolean; qa?: QaLayer}> = ({plan: planIn, brand, overlayOnly, qa}) => {
  DESIGN = (planIn as any).design === 2 ? 2 : 1;
  const plan = React.useMemo(() => ((planIn as any).snapBroll === false ? planIn : snapToCuts(planIn)), [planIn]);
  NOPUNCT = !!(plan.captions as any).noPunct;
  applyBrand(brand ?? DEFAULT_BRAND); // before any child reads C / SERIF / DISPLAY
  useBrandFonts(brand ?? DEFAULT_BRAND);
  const {fps} = useVideoConfig();
  const t = useT();
  // colour looks: the whole reel (grade) or one stretch of it (grades), footage only
  const g: any = ((plan as any).grades ?? []).find((r: any) => t >= r.start && t < r.start + r.dur) ?? plan.grade ?? {};
  const filter = `saturate(${g.saturate ?? 0.92}) contrast(${g.contrast ?? 1.0}) brightness(${g.brightness ?? 1.03}) sepia(${g.warm ?? 0}) hue-rotate(${g.hue ?? 0}deg)`;
  const fx = plan.fx ?? [];
  const of = <T extends Fx['type']>(type: T) => fx.filter((f) => f.type === type) as Extract<Fx, {type: T}>[];
  const hook = plan.hook;
  // where captions sit right now: dodge hooks, labels and full-screen moments
  let capY = plan.captions.y;
  if (hook && t >= (hook.start ?? 0) && t <= hook.end) capY = hook.mode === 'behind' ? 0.76 : Math.max(capY, (hook.y ?? 0.11) + 0.035 * hook.text.split('\n').length + 0.045);
  for (const l of [...(plan.labels ?? []).map((l) => ({...l, dur: l.end - l.start})), ...of('label')]) if (within(t, l.start, l.dur)) capY = Math.max(capY, (l.y ?? 0.13) + 0.075);
  if (of('backdrop').some((f) => within(t, f.start, f.dur))) capY = Math.max(capY, 0.56);
  if (of('canvas').some((f) => within(t, f.start, f.dur))) capY = Math.max(capY, 0.62);
  const hideCaps = fx.some((f: any) => f.type === 'wrap' && within(t, f.start, f.dur) && !f.keepCaps) || of('comment').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('paper').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('uiworld').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('bigword').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('counter').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('colourbg').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('wall').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps) || of('dm').some((f) => within(t, f.start, f.dur) && !(f as any).keepCaps);
  const trans = useTransition(plan, t);

  if (qa === 'plate') {
    return (
      <AbsoluteFill style={{background: '#000'}}>
        <AbsoluteFill style={{filter}}>
          <FrameBg plan={plan} />
          {plan.segments.map((s, i) => (
            <Sequence key={i} from={Math.round(s.start * fps)} durationInFrames={Math.max(1, Math.round(s.dur * fps))}>
              <Main seg={s} plan={plan} />
            </Sequence>
          ))}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  if (qa === 'text') {
    return (
      <AbsoluteFill style={{background: 'transparent'}}>
        <style>{fontFaces}</style>
        {hook && <Hook hook={hook} />}
        {of('bigword').map((f, i) => <BigWord key={'qbw' + i} f={f} />)}
        {fx.filter((f: any) => f.type === 'wrap').map((f, i) => <Wrap key={'qwr' + i} f={f} part="all" />)}
        {plan.checklist && <Checklist c={plan.checklist} />}
        {(plan.labels ?? []).map((l, i) => <LabelFx key={'ql' + i} {...l} dur={l.end - l.start} />)}
        {of('label').map((l, i) => <LabelFx key={'qlf' + i} {...l} />)}
        <InkCtx.Provider value={of('canvas').some((f) => within(t, f.start, f.dur))}>
          {!hideCaps && <CaptionsAt cap={plan.captions} y={capY} />}
        </InkCtx.Provider>
        {plan.end && <EndCard e={plan.end} />}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{background: overlayOnly ? 'transparent' : '#000'}}>
      <style>{fontFaces}</style>
      <AbsoluteFill style={trans}>
        {!overlayOnly && (
          <AbsoluteFill style={{filter}}>
            <FrameBg plan={plan} />
            {plan.segments.map((s, i) => (
              <Sequence key={i} from={Math.round(s.start * fps)} durationInFrames={Math.max(1, Math.round(s.dur * fps))}>
                <Main seg={s} plan={plan} />
              </Sequence>
            ))}
            {[...of('band'), ...of('backdrop')].map((f, i) => <BrollFill key={'b' + i} f={f} />)}
            {(plan.inserts ?? []).filter((x) => x.pos === 'full').map((x, i) => <InsertLayer key={'f' + i} ins={x} />)}
          </AbsoluteFill>
        )}
        {overlayOnly && [...of('band'), ...of('backdrop')].map((f, i) => <BrollFill key={'b' + i} f={f} />)}
        {plan.topFade !== false && <AbsoluteFill style={{background: `linear-gradient(180deg, ${tint(0.4)} 0%, rgba(0,0,0,0) ${typeof plan.topFade === 'number' ? plan.topFade * 100 : 14}%)`}} />}
        {(g as any).vignette ? <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 62% at 50% 42%, rgba(0,0,0,0) 55%, rgba(0,0,0,${(g as any).vignette}) 100%)`}} /> : null}
        {of('colourbg').map((f, i) => <ColourBg key={'c' + i} f={f} />)}
        {of('canvas').map((f, i) => <Canvas key={'cv' + i} f={f} />)}
        {of('uiworld').map((f, i) => <UiWorld key={'ui' + i} f={f} />)}
        {of('browser').map((f, i) => <BrowserWin key={'bw' + i} f={f} />)}
        {of('paper').map((f, i) => <Paper key={'pa' + i} f={f} />)}
        {of('cover').map((f, i) => <Cover key={'co' + i} f={f} />)}
        {of('glass').map((f, i) => <Glass key={'gl' + i} f={f} />)}
        {of('orbit').map((f, i) => <Orbit key={'ob' + i} f={f} half="back" />)}
        {hook && hook.mode === 'behind' && <Hook hook={hook} />}
        {of('bigword').filter((f) => f.behind).map((f, i) => <BigWord key={'bw' + i} f={f} />)}
        {fx.filter((f: any) => f.type === 'haze').map((f, i) => <Haze key={'hz' + i} f={f} />)}
        {fx.filter((f: any) => f.type === 'wrap').map((f, i) => <Wrap key={'wrb' + i} f={f} part="back" />)}
        {of('deck').filter((f) => f.subjectFront !== false).map((f, i) => <Deck key={'dk' + i} f={f} />)}
        <AbsoluteFill style={{filter: overlayOnly ? undefined : filter}}><CutoutLayer plan={plan} /></AbsoluteFill>
        {of('orbit').map((f, i) => <Orbit key={'of' + i} f={f} half="front" />)}
        {of('doodle').map((f, i) => <Doodle key={'dd' + i} f={f} />)}
        {of('phone').map((f, i) => <Phone key={'ph' + i} f={f} />)}
        {of('poll').map((f, i) => <Poll key={'po' + i} f={f} />)}
        {of('clock').map((f, i) => <Clock key={'ck' + i} f={f} />)}
        {of('spinner').map((f, i) => <Spinner key={'sp' + i} f={f} />)}
        {of('progress').map((f, i) => <Progress key={'pg' + i} f={f} />)}
        {of('pops' as any).map((f: any, i: number) => <Pops key={'pp' + i} f={f} />)}
        {of('people' as any).map((f: any, i: number) => <People key={'pe' + i} f={f} />)}
        {of('tasks').map((f, i) => <Tasks key={'tk' + i} f={f} />)}
        {of('chart').map((f, i) => <Chart key={'cg' + i} f={f} />)}
        {of('calendar').map((f, i) => <Calendar key={'cal' + i} f={f} />)}
        {of('dropdown').map((f, i) => <Dropdown key={'dr' + i} f={f} />)}
        {of('dial').map((f, i) => <Dial key={'dl' + i} f={f} />)}
        {of('swatches').map((f, i) => <Swatches key={'sw' + i} f={f} />)}
        {of('note').map((f, i) => <Note key={'nt' + i} f={f} />)}
        {of('envelope').map((f, i) => <Envelope key={'ev' + i} f={f} />)}
        {of('spotlight').map((f, i) => <Spotlight key={'sp' + i} f={f} />)}
        {of('statbars').map((f, i) => <StatBars key={'sb' + i} f={f} />)}
        {of('flow').map((f, i) => <Flow key={'fw' + i} f={f} />)}
        {of('timeline').map((f, i) => <TimelineFx key={'tl' + i} f={f} />)}
        {of('burn').map((f, i) => <Burn key={'bu' + i} f={f} />)}
        {of('annotate').map((f, i) => <Annotate key={'an' + i} f={f} />)}
        {of('receipts').map((f, i) => <Receipts key={'rc' + i} f={f} />)}
        {hook && hook.mode !== 'behind' && <Hook hook={hook} />}
        {of('bigword').filter((f) => !f.behind).map((f, i) => <BigWord key={'bf' + i} f={f} />)}
        {fx.filter((f: any) => f.type === 'wrap').map((f, i) => <Wrap key={'wrf' + i} f={f} part="front" />)}
        {plan.checklist && <Checklist c={plan.checklist} />}
        {(plan.labels ?? []).map((l, i) => <LabelFx key={'l' + i} {...l} dur={l.end - l.start} />)}
        {of('label').map((l, i) => <LabelFx key={'lf' + i} {...l} />)}
        {(plan.inserts ?? []).filter((x) => x.pos !== 'full').map((x, i) => <InsertLayer key={i} ins={x} />)}
        {of('sticker').map((f, i) => <Sticker key={'s' + i} f={f} />)}
        {of('counter').map((f, i) => <Counter key={'n' + i} f={f} />)}
        {of('prompt').map((f, i) => <Prompt key={'p' + i} f={f} />)}
        {of('wall').map((f, i) => <Wall key={'w' + i} f={f} />)}
        {of('folder').map((f, i) => <Folder key={'fo' + i} f={f} />)}
        {of('deck').filter((f) => f.subjectFront === false).map((f, i) => <Deck key={'dkf' + i} f={f} />)}
        {of('pills').map((f, i) => <Pills key={'pl' + i} f={f} />)}
        {of('chat').map((f, i) => <Chat key={'ch' + i} f={f} />)}
        <InkCtx.Provider value={of('canvas').some((f) => within(t, f.start, f.dur))}>
        {!hideCaps && <CaptionsAt cap={plan.captions} y={capY} />}
        </InkCtx.Provider>
        {of('dm').map((f, i) => <DmCard key={'d' + i} f={f} />)}
        {of('header').map((f, i) => <Header key={'hd' + i} f={f} />)}
        {of('comment').map((f, i) => <Comment key={'cm' + i} f={f} />)}
        {of('rip').map((f, i) => <Rip key={'rp' + i} f={f} />)}
        {of('glitch').map((f, i) => <Glitch key={'gt' + i} f={f} />)}
        {(['badges', 'polaroids', 'circle', 'stampcal', 'collage', 'photostrip', 'stamp', 'notifs', 'post', 'confetti', 'splitflap', 'scratch', 'rewind', 'igpoll', 'pricetag', 'ticker', 'wipe', 'doc'] as const).flatMap((ty) => (fx as any[]).filter((f) => f.type === ty).map((f, i) => {
          const Cmp: any = {badges: Badges, polaroids: Polaroids, circle: Circle, stampcal: Stampcal, collage: Collage, photostrip: Photostrip, stamp: Stamp, notifs: Notifs, post: Post, confetti: Confetti, splitflap: Splitflap, scratch: Scratch, rewind: Rewind, igpoll: IgPoll, pricetag: Pricetag, ticker: Ticker, wipe: Wipe, doc: Doc}[ty];
          return <Cmp key={ty + i} f={f} />;
        }))}
        {(fx as any[]).filter((f) => ['curtain', 'paperslide', 'pageturn', 'paperturn'].includes(f.type)).map((f, i) => <PaperMove key={'pm' + i} f={f} />)}
        {plan.end && <EndCard e={plan.end} />}
        {of('flash').map((f, i) => <Flash key={'fl' + i} f={f} />)}
      </AbsoluteFill>
      {!overlayOnly && plan.music && <Audio src={staticFile(plan.music.src)} volume={plan.music.volume ?? 0.08} />}
      {!overlayOnly && (plan.audio ?? []).map((a, i) => (
        <Sequence key={'a' + i} from={Math.round(a.start * fps)} durationInFrames={Math.max(1, Math.round(a.dur * fps))}>
          <Audio src={staticFile(a.src)} startFrom={Math.round(a.srcIn * fps)} volume={a.volume ?? 1} />
        </Sequence>
      ))}
      {(plan.sfx ?? []).map((s, i) => <Sequence key={'sfx' + i} from={Math.round(s.at * fps)}><Audio src={staticFile(s.src)} volume={s.volume ?? 0.5} /></Sequence>)}
    </AbsoluteFill>
  );
};
