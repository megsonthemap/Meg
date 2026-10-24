// Brand values for the reel renderer. Nothing brand-specific lives in Reel.tsx: it all comes from
// brand/brand.json, resolved by reel.mjs (which checks the font files exist) and passed in as a prop.
//
// brand.json (authoring form):
//   fonts.display / fonts.serif: either a filename ("MyDisplay-Heavy.otf") or
//     {family, files: [{file, weight, stretch?}], fallbackGlyphs?}
//   fonts.display.fallbackGlyphs: opt-in, off by default. true (or a unicode-range string) limits the
//     display font to the listed glyphs and routes everything else to the standin, for demo/trial fonts
//     that replace some glyphs with a watermark.
//   colours: {punch, accent, paper, ink, dark?, white?}
//   handle: optional account name shown on DM / follow cards (defaults to "yourhandle")
//
// Resolved form (what the renderer receives): every face has a url inside the staged public dir,
// and a role that fell back to the standin is marked standin: true with the standin family name.

export type FontFace = {url: string; weight: string | number; stretch?: string; style?: 'italic' | 'normal'};
export type BrandFont = {family: string; faces: FontFace[]; fallbackGlyphs?: boolean | string; standin?: boolean};
export type BrandColours = {punch: string; accent: string; paper: string; ink: string; dark: string; white: string};
// `reel.safe.onBrightText` names which brand colour dark text uses when the footage behind it is too
// bright for white or the punch colour. It is a colour NAME, so a buyer cannot introduce a new colour.
// fonts.script (optional): a script/cursive face for 'script' emphasis. reel.italics: false = this brand never uses italics or script (the engine turns them into the punch colour).
export type Brand = {name?: string; handle?: string; fonts: {display: BrandFont; serif: BrandFont; script?: BrandFont}; colours: BrandColours; reel?: {safe?: {onBrightText?: keyof BrandColours}; italics?: boolean}; fallbackUrl?: string};

// Standins are fonts every Mac already has, so the kit ships no font files at all. Declared via
// local() so a missing brand font degrades to these instead of the browser default. On Windows
// Avenir Next is not there, so the same face falls through to Segoe UI Black (every Windows 10/11 has it).
export const STANDIN = {
  display: {family: 'Avenir Next', local: ['Avenir Next Heavy', 'AvenirNext-Heavy', 'Segoe UI Black', 'SegoeUI-Black', 'Arial Black'], weight: '800'},
  serif: {family: 'Georgia', local: ['Georgia'], weight: '400'},
};
// Optional wider fallback for watermarked demo display fonts (her Integral case): reel.mjs sets
// brand.fallbackUrl when brand/fonts-standin/Archivo.woff2 exists; otherwise the system standin is used.

// Glyphs a watermarked demo/trial display font is trusted to draw: space, letters, digits (minus 4),
// basic punctuation and the curly apostrophe. Everything else falls to DisplayFallback.
export const DEFAULT_FALLBACK_RANGE = 'U+0020,U+002C,U+002E,U+003A-003B,U+003F,U+0030-0033,U+0035-0039,U+0041-005A,U+0061-007A,U+2019';

// Neutral brand used only when no brand.json is supplied (e.g. Remotion Studio preview).
export const DEFAULT_BRAND: Brand = {
  name: 'Standin',
  fonts: {
    display: {family: STANDIN.display.family, faces: [], standin: true},
    serif: {family: STANDIN.serif.family, faces: [], standin: true},
  },
  colours: {punch: '#FFE14D', accent: '#9FB8D6', paper: '#F4F4F2', ink: '#444444', dark: '#1E1E1E', white: '#FFFFFF'},
};

export const displayStack = (b: Brand) => `'${b.fonts.display.family}', ${b.fonts.display.fallbackGlyphs ? "'DisplayFallback', " : ''}'${STANDIN.display.family}', sans-serif`;
export const serifStack = (b: Brand) => `'${b.fonts.serif.family}', '${STANDIN.serif.family}', Georgia, serif`;
export const scriptStack = (b: Brand) => (b.fonts.script && !b.fonts.script.standin ? `'${b.fonts.script.family}', ` : '') + serifStack(b);

// @font-face CSS for the brand. `url` turns a staged path into a servable URL (Remotion's staticFile).
export function fontFaceCss(b: Brand, url: (p: string) => string): string {
  const face = (family: string, src: string, weight: string | number, extra = '') => `@font-face{font-family:'${family}';src:url(${url(src)});font-weight:${weight}${extra}}`;
  const localFace = (family: string, names: string[], weight: string | number) => `@font-face{font-family:'${family}';src:${names.map((n) => `local('${n}')`).join(',')};font-weight:${weight}}`;
  const out: string[] = [];
  const d = b.fonts.display;
  const range = d.fallbackGlyphs ? (typeof d.fallbackGlyphs === 'string' ? d.fallbackGlyphs : DEFAULT_FALLBACK_RANGE) : '';
  for (const f of d.faces) out.push(face(d.family, f.url, f.weight, `${f.stretch ? `;font-stretch:${f.stretch}` : ''}${range ? `;unicode-range:${range}` : ''}`));
  if (range) out.push(b.fallbackUrl ? face('DisplayFallback', b.fallbackUrl, '100 900', ';font-stretch:112%') : localFace('DisplayFallback', STANDIN.display.local, STANDIN.display.weight));
  for (const f of b.fonts.serif.faces) out.push(face(b.fonts.serif.family, f.url, f.weight, `${f.stretch ? `;font-stretch:${f.stretch}` : ''}${f.style ? `;font-style:${f.style}` : ''}`));
  for (const f of b.fonts.script?.faces ?? []) out.push(face(b.fonts.script!.family, f.url, f.weight, f.style ? `;font-style:${f.style}` : ''));
  out.push(localFace(STANDIN.display.family, STANDIN.display.local, STANDIN.display.weight));
  out.push(localFace(STANDIN.serif.family, STANDIN.serif.local, STANDIN.serif.weight));
  return `\n${out.join('\n')}\n`;
}
