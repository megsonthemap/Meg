// Instagram cover stills (cover.mjs). One frame of the reel plus the title, in three layouts:
//   top     title stacked above the head (the frame slides down to make room)
//   middle  title across the chest band, under the face
//   behind  the loud words huge behind the head, person cut out in front (no cutout: above the head)
// Everything that matters sits inside the 4:5 grid crop and clear of the top 12%, bottom 20% and the
// right-hand icon strip. Text is only ever white, paper or the punch colour, held up by shadow/scrims.
import React from 'react';
import {AbsoluteFill, Img, staticFile, delayRender, continueRender} from 'remotion';
import {Brand, DEFAULT_BRAND, STANDIN, displayStack, serifStack, fontFaceCss} from './brand';

export type CoverLine = {t: string; loud?: boolean; soft?: boolean}; // soft: display face in the paper colour
export type CoverSpec = {
  design: 'top' | 'middle' | 'behind';
  frame: string; cutout?: string;
  face?: {x: number; y: number; w: number; h: number};
  lines: CoverLine[];
};

const W = 1080, H = 1920;
const SAFE = {top: Math.max((H - 1350) / 2, H * 0.12) + 40, bottom: H * 0.8 - 24, left: 80, right: W * 0.86 - 14};
const BOXW = SAFE.right - SAFE.left;
const LH = {loud: 0.88, quiet: 1.1};
const GAP = 6;
const SOFT = '0 0 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.35), 0 0 34px rgba(0,0,0,0.45)';
const DEEP = '0 0 3px rgba(0,0,0,0.3), 0 4px 14px rgba(0,0,0,0.35), 0 0 60px rgba(0,0,0,0.4)';
const SCRIM = 'rgba(22,22,24,';

const style = (b: Brand, loud: boolean | undefined, size: number): React.CSSProperties => (loud
  ? {fontFamily: displayStack(b), fontWeight: 900, fontStretch: '112%', textTransform: 'uppercase', fontSize: size, lineHeight: LH.loud, letterSpacing: '0.005em', whiteSpace: 'nowrap', display: 'block'}
  : {fontFamily: serifStack(b), fontWeight: 300, fontSize: size, lineHeight: LH.quiet, letterSpacing: '-0.01em', whiteSpace: 'nowrap', display: 'block'});

// widths of every line at 100px, measured off-screen once the brand fonts have loaded
const useWidths = (b: Brand, lines: CoverLine[]) => {
  const [widths, setWidths] = React.useState<{l: number; q: number}[] | null>(null);
  const [handle] = React.useState(() => delayRender('cover fonts + measure', {timeoutInMilliseconds: 60000}));
  React.useEffect(() => {
    const want = [`900 100px '${b.fonts.display.family}'`, `900 100px 'DisplayFallback'`, `800 100px '${STANDIN.display.family}'`, `300 100px '${b.fonts.serif.family}'`];
    Promise.all(want.map((f) => document.fonts.load(f, 'LABEL label 0123 ?').catch(() => []))).then(() => document.fonts.ready).then(() => {
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:-9999px;top:0';
      document.body.appendChild(box);
      const w = (t: string, loud: boolean) => {
        const s = document.createElement('span');
        for (const [k, v] of Object.entries(style(b, loud, 100))) (s.style as any)[k] = k === 'fontSize' ? `${v}px` : String(v);
        s.style.display = 'inline-block';
        s.textContent = t;
        box.appendChild(s);
        return s.getBoundingClientRect().width;
      };
      setWidths(lines.map((l) => ({l: w(l.t, true), q: w(l.t, false)})));
      box.remove();
    });
  }, [b, lines]);
  React.useEffect(() => { if (widths) continueRender(handle); }, [widths, handle]);
  return widths;
};

// loud lines share one size (the widest fits the box), quiet lines share another
type Sized = {lines: CoverLine[]; sizes: number[]; height: number};
// justify: every line sized on its own to fill the width (the editorial stack)
function fit(lines: CoverLine[], widths: {l: number; q: number}[], maxLoud: number, maxQuiet: number, justify = false): Sized {
  const f = (i: number) => (BOXW / (lines[i].loud ? widths[i].l : widths[i].q)) * 100;
  const idx = (loud: boolean) => lines.map((l, i) => (!!l.loud === loud ? i : -1)).filter((i) => i >= 0);
  const loud = Math.min(maxLoud, ...idx(true).map(f)), quiet = Math.min(maxQuiet, ...idx(false).map(f));
  const sizes = lines.map((l, i) => (justify ? Math.min(maxLoud, f(i)) : l.loud ? loud : quiet));
  return {lines, sizes, height: heightOf(lines, sizes)};
}
const heightOf = (lines: CoverLine[], sizes: number[]) => sizes.reduce((a, s, i) => a + s * (lines[i].loud ? LH.loud : LH.quiet), 0) + GAP * (lines.length - 1);
const scale = (s: Sized, k: number): Sized => (k >= 1 ? s : {...s, sizes: s.sizes.map((v) => v * k), height: heightOf(s.lines, s.sizes.map((v) => v * k))});

// the frame, slid down by `shift`; the strip it uncovers is a soft, heavily blurred blow-up of the frame
const Plate: React.FC<{src: string; shift: number; dim?: number}> = ({src, shift, dim = 1}) => (
  <AbsoluteFill style={{filter: dim < 1 ? `brightness(${dim}) saturate(0.85)` : undefined}}>
    {shift > 0 && <Img src={staticFile(src)} style={{position: 'absolute', left: -W * 0.4, top: -H * 0.1, width: W * 1.8, height: H * 1.8, objectFit: 'cover', objectPosition: '50% 0%', filter: 'blur(60px) brightness(0.92)'}} />}
    <Img src={staticFile(src)} style={{position: 'absolute', left: 0, top: shift, width: W, height: H, objectFit: 'cover',
      ...(shift > 0 ? {WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, #000 240px)', maskImage: 'linear-gradient(to bottom, transparent 0px, #000 240px)'} : {})}} />
  </AbsoluteFill>
);

const Stack: React.FC<{b: Brand; s: Sized; top: number; align: 'left' | 'center'; colour: (l: CoverLine, i: number) => string; shadow: string}> = ({b, s, top, align, colour, shadow}) => (
  <div style={{position: 'absolute', left: SAFE.left, top, width: BOXW, display: 'flex', flexDirection: 'column', gap: GAP, alignItems: align === 'left' ? 'flex-start' : 'center'}}>
    {s.lines.map((l, i) => <div key={i} style={{...style(b, l.loud, s.sizes[i]), color: colour(l, i), textShadow: shadow}}>{l.t}</div>)}
  </div>
);
// a soft dark wash from y0 to y1 that fades out over `feather` either side
const Wash: React.FC<{y0: number; y1: number; a: number; feather?: number}> = ({y0, y1, a, feather = 260}) => (
  <AbsoluteFill style={{background: `linear-gradient(to bottom, ${SCRIM}0) ${y0 - feather}px, ${SCRIM}${a}) ${y0}px, ${SCRIM}${a}) ${y1}px, ${SCRIM}0) ${y1 + feather}px)`}} />
);

export const Cover: React.FC<{cover: CoverSpec; brand?: Brand}> = ({cover, brand}) => {
  const b = brand ?? DEFAULT_BRAND;
  const C = b.colours;
  const widths = useWidths(b, cover.lines);
  const face = cover.face ?? {x: 0.3, y: 0.3, w: 0.33, h: 0.19};
  const faceTop = face.y * H, faceBot = (face.y + face.h) * H, headTop = faceTop - face.h * H * 0.38;
  let plate = <Plate src={cover.frame} shift={0} />;
  let body: React.ReactNode = null;
  const loudColour = (l: CoverLine) => (l.soft ? C.paper : l.loud ? C.punch : C.white);

  if (widths && cover.design === 'top') {
    // slide her down until the stack fits above the hair, then shrink the type if it still does not
    const maxShift = Math.max(0, Math.min(H * 0.24, 1440 - faceBot));
    let s = fit(cover.lines, widths, 230, 92);
    s = scale(s, (headTop + maxShift - 40 - SAFE.top) / s.height);
    const shift = Math.max(0, Math.min(maxShift, SAFE.top + s.height + 40 - headTop));
    plate = <Plate src={cover.frame} shift={shift} />;
    body = <>
      <AbsoluteFill style={{background: `linear-gradient(to bottom, ${SCRIM}0.6) 0px, ${SCRIM}0.45) ${SAFE.top + s.height * 0.75}px, ${SCRIM}0) ${SAFE.top + s.height + 280}px)`}} />
      <Stack b={b} s={s} top={SAFE.top} align="left" colour={loudColour} shadow={SOFT} />
    </>;
  }

  if (widths && cover.design === 'middle') {
    const zone = [Math.max(faceBot + 70, H * 0.5), SAFE.bottom];
    let s = fit(cover.lines, widths, 210, 96);
    s = scale(s, (zone[1] - zone[0]) / s.height);
    const y = zone[0] + Math.max(0, (zone[1] - zone[0] - s.height) * 0.3);
    body = <>
      <Wash y0={y + 20} y1={y + s.height - 20} a={0.55} />
      <Stack b={b} s={s} top={y} align="center" colour={loudColour} shadow={SOFT} />
    </>;
  }

  if (widths && cover.design === 'behind') {
    const cut = !!cover.cutout;
    // A = everything up to the end of the first loud run (sits on/behind the head), B = the rest (under the chin)
    const firstLoud = Math.max(0, cover.lines.findIndex((l) => l.loud));
    let end = firstLoud; while (end + 1 < cover.lines.length && cover.lines[end + 1].loud) end++;
    // no cutout: the lines above the head all go big in the display face instead
    const A = cover.lines.slice(0, end + 1).map((l) => (cut ? l : {...l, loud: true, soft: !l.loud})), B = cover.lines.slice(end + 1);
    const wA = widths.slice(0, end + 1), wB = widths.slice(end + 1);
    let a = fit(A, wA, cut ? 340 : 300, 96, !cut);
    const b2 = B.length ? fit(B, wB, 200, 96) : null;
    // bottom of A: with a cutout the loud line sinks ~40% into the hair, so the head hides only its feet
    const loudH = Math.max(...a.lines.map((l, i) => (l.loud && !l.soft ? a.sizes[i] * LH.loud : 0)));
    const anchor = cut ? headTop + loudH * 0.4 : headTop - 24;
    const room = b2 ? SAFE.bottom - b2.height - 60 - faceBot : H;
    const maxShift = Math.max(0, Math.min(H * 0.24, room));
    a = scale(a, (anchor + maxShift - SAFE.top) / a.height);
    const shift = Math.max(0, Math.min(maxShift, SAFE.top + a.height - anchor));
    const yA = Math.max(SAFE.top, anchor + shift - a.height);
    const yB = faceBot + shift + 60;
    plate = <Plate src={cover.frame} shift={shift} dim={cut ? 0.6 : 1} />;
    body = <>
      {!cut && <AbsoluteFill style={{background: `linear-gradient(to bottom, ${SCRIM}0.6) 0px, ${SCRIM}0.45) ${yA + a.height * 0.8}px, ${SCRIM}0) ${yA + a.height + 240}px)`}} />}
      <Stack b={b} s={a} top={yA} align="center" colour={loudColour} shadow={cut ? '0 6px 40px rgba(0,0,0,0.25)' : DEEP} />
      {cut && <Img src={staticFile(cover.cutout!)} style={{position: 'absolute', left: 0, top: shift, width: W, height: H, filter: 'drop-shadow(0 12px 34px rgba(0,0,0,0.35))'}} />}
      {b2 && <>
        <Wash y0={yB + 10} y1={yB + b2.height - 10} a={0.45} feather={200} />
        <Stack b={b} s={scale(b2, (SAFE.bottom - yB) / b2.height)} top={yB} align="center" colour={loudColour} shadow={SOFT} />
      </>}
    </>;
  }

  return (
    <AbsoluteFill style={{background: C.dark}}>
      <style>{fontFaceCss(b, staticFile)}</style>
      {plate}
      {body}
    </AbsoluteFill>
  );
};
