/**
 * Artwork-derived colour, kept as pure maths so it can be unit tested without a
 * canvas. `dominantColors` turns raw RGBA pixels into ranked swatches and
 * `buildPalette` turns those into the handful of tokens the interface reads.
 *
 * Every accent is pushed through `ensureContrast` against the page background.
 * The e2e suite asserts a 4.5:1 ratio on `--accent`, so an artwork that happens
 * to be pale must still yield readable text rather than a washed-out theme.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Swatch extends RGB {
  population: number;
}

export interface Palette {
  /** Vivid brand colour, guaranteed readable on the current background. */
  accent: RGB;
  /** Secondary tone for gradients and highlights. */
  accent2: RGB;
  /** Raw dominant colour for decorative glows; not contrast-checked. */
  glow: RGB;
  /** Low-contrast wash for ambient backdrops. */
  tint: RGB;
}

/** Accent used when a track has no artwork or the artwork is monochrome. */
export const FALLBACK_ACCENT: Record<'light' | 'dark', RGB> = {
  light: { r: 0x39, g: 0x74, b: 0x5e },
  dark: { r: 0xa2, g: 0xd4, b: 0xb8 },
};

/** Below this, a colour reads as grey and has no hue worth keeping. */
const COLOUR_THRESHOLD = 0.18;
/** A colourful region must cover this share of pixels before it outranks the whole cover. */
const COLOUR_SHARE = 0.01;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function toHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function channelToLinear(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: RGB): number {
  return channelToLinear(r) * 0.2126 + channelToLinear(g) * 0.7152 + channelToLinear(b) * 0.0722;
}

/** WCAG contrast ratio, 1 for identical colours and 21 for black against white. */
export function contrastRatio(a: RGB, b: RGB): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

export function mix(a: RGB, b: RGB, amount: number): RGB {
  const t = clamp(amount, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const s = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l: lightness };
}

function hueToChannel(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

export function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): RGB {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  if (sat === 0) {
    const grey = Math.round(light * 255);
    return { r: grey, g: grey, b: grey };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return {
    r: Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, hue) * 255),
    b: Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
  };
}

/**
 * Push `foreground` lighter or darker until it clears `target` against `background`.
 * Both directions are attempted and the closer result wins, so the accent stays
 * recognisably the artwork's colour instead of collapsing to black or white.
 */
export function ensureContrast(foreground: RGB, background: RGB, target = 4.5): RGB {
  if (contrastRatio(foreground, background) >= target) return foreground;
  const { h, s, l } = rgbToHsl(foreground);
  const towardsDark = contrastRatio({ r: 255, g: 255, b: 255 }, background) > contrastRatio({ r: 0, g: 0, b: 0 }, background);
  let best = foreground;
  let bestRatio = contrastRatio(foreground, background);
  for (let step = 1; step <= 100; step++) {
    const amount = step / 100;
    const candidate = hslToRgb({
      h,
      // Very dark or very light accents lose their identity; nudge saturation up as we move away.
      s: clamp(s + amount * 0.25, 0, 1),
      l: towardsDark ? clamp(l + amount * (1 - l), 0, 1) : clamp(l * (1 - amount), 0, 1),
    });
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= target) return candidate;
  }
  return best;
}

/** Force a colour to read as a deliberate accent rather than muddy background noise. */
export function vivid(colour: RGB): RGB {
  const { h, s, l } = rgbToHsl(colour);
  return hslToRgb({ h, s: clamp(Math.max(s, 0.5), 0, 0.95), l: clamp(l, 0.4, 0.66) });
}

/**
 * Rank colours by how much they will stand out once drawn.
 *
 * Population alone picks a large grey wall over a small saturated logo, so the
 * score weights saturation in. Pixels below half alpha are skipped, which keeps
 * rounded-corner transparency from poisoning the average.
 */
export function dominantColors(pixels: Uint8ClampedArray, max = 6): Swatch[] {
  const buckets = new Map<number, { r: number; g: number; b: number; population: number }>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.population += 1;
    } else {
      buckets.set(key, { r, g, b, population: 1 });
    }
  }
  const swatches = [...buckets.values()].map((bucket) => ({
    r: Math.round(bucket.r / bucket.population),
    g: Math.round(bucket.g / bucket.population),
    b: Math.round(bucket.b / bucket.population),
    population: bucket.population,
  }));
  const total = swatches.reduce((sum, swatch) => sum + swatch.population, 0) || 1;
  return swatches
    .map((swatch) => ({ swatch, score: swatch.population / total * (0.45 + saturation(swatch)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, max))
    .map((entry) => entry.swatch);
}

/**
 * Choose which swatch to theme from, or undefined when nothing is worth using.
 *
 * Colourful regions are preferred over merely large ones, because population
 * alone picks the grey studio wall behind the artwork; but a colourful region
 * must also cover `COLOUR_SHARE` of the pixels, so one stray lilac pixel cannot
 * hijack an otherwise black-and-white cover.
 */
export function pickBase(swatches: readonly Swatch[]): Swatch | undefined {
  const usable = swatches.filter((swatch) => swatch.population > 0);
  if (!usable.length) return undefined;
  const total = usable.reduce((sum, swatch) => sum + swatch.population, 0);
  const colourful = usable.filter((swatch) => saturation(swatch) >= COLOUR_THRESHOLD && swatch.population >= total * COLOUR_SHARE);
  const pool = colourful.length ? colourful : usable;
  return pool.reduce((best, swatch) => (swatch.population > best.population ? swatch : best));
}

/**
 * Pick the palette for one artwork against one page background.
 * `swatches` comes from `dominantColors`; an empty list falls back to the
 * interface's own accent so a missing cover never leaves the theme undefined.
 */
export function buildPalette(swatches: readonly Swatch[], options: { mode: 'light' | 'dark'; background: RGB }): Palette {
  const { mode, background } = options;
  const base = pickBase(swatches);
  // A grey base has no hue to preserve, and `vivid` would otherwise invent one.
  const glow = base && saturation(base) >= COLOUR_THRESHOLD ? vivid(base) : FALLBACK_ACCENT[mode];
  // Dark artwork needs a lifted secondary tone and light artwork a deepened one.
  const accent2 = ensureContrast(mode === 'dark' ? mix(glow, { r: 255, g: 255, b: 255 }, 0.35) : mix(glow, { r: 0, g: 0, b: 0 }, 0.3), background, 4.5);
  return {
    accent: ensureContrast(glow, background, 4.5),
    accent2,
    glow,
    tint: mix(glow, background, mode === 'light' ? 0.84 : 0.72),
  };
}
