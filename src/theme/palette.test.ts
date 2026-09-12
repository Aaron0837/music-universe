import { describe, expect, it } from 'vitest';
import { buildPalette, contrastRatio, dominantColors, ensureContrast, FALLBACK_ACCENT, pickBase, saturation, toHex, vivid, type RGB } from './palette';

const LIGHT_BG: RGB = { r: 0xf7, g: 0xf9, b: 0xf5 };
const DARK_BG: RGB = { r: 0x15, g: 0x1d, b: 0x19 };

function pixels(colors: RGB[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((color, index) => {
    data[index * 4] = color.r;
    data[index * 4 + 1] = color.g;
    data[index * 4 + 2] = color.b;
    data[index * 4 + 3] = 255;
  });
  return data;
}

describe('contrastRatio', () => {
  it('is 21 for black against white and 1 for a colour against itself', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1);
    expect(contrastRatio(LIGHT_BG, LIGHT_BG)).toBeCloseTo(1, 5);
  });
});

describe('toHex', () => {
  it('pads and clamps each channel', () => {
    expect(toHex({ r: 0, g: 15, b: 255 })).toBe('#000fff');
    expect(toHex({ r: -5, g: 300, b: 128 })).toBe('#00ff80');
    expect(toHex({ r: 57.6, g: 116.4, b: 94 })).toBe('#3a745e');
  });
});

describe('saturation', () => {
  it('is zero for greys and high for vivid colours', () => {
    expect(saturation({ r: 128, g: 128, b: 128 })).toBe(0);
    expect(saturation({ r: 255, g: 0, b: 0 })).toBe(1);
  });
});

describe('ensureContrast', () => {
  it('leaves a colour alone when it already passes', () => {
    const dark = { r: 20, g: 20, b: 20 };
    expect(ensureContrast(dark, LIGHT_BG, 4.5)).toEqual(dark);
  });
  it('lifts a pale accent on a light background to the target ratio', () => {
    const pale = { r: 0xd6, g: 0xe4, b: 0xd5 };
    const fixed = ensureContrast(pale, LIGHT_BG, 4.5);
    expect(contrastRatio(fixed, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
  });
  it('deepens a dark accent on a dark background to the target ratio', () => {
    const navy = { r: 10, g: 20, b: 45 };
    const fixed = ensureContrast(navy, DARK_BG, 4.5);
    expect(contrastRatio(fixed, DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps the hue recognisable while fixing contrast', () => {
    const green = { r: 0xc6, g: 0xd9, b: 0xc2 };
    const fixed = ensureContrast(green, LIGHT_BG, 4.5);
    expect(fixed.g).toBeGreaterThan(fixed.r);
    expect(fixed.g).toBeGreaterThan(fixed.b);
  });
  it('never returns something worse than its input', () => {
    for (const color of [{ r: 200, g: 210, b: 205 }, { r: 240, g: 240, b: 240 }, { r: 5, g: 5, b: 5 }]) {
      expect(contrastRatio(ensureContrast(color, DARK_BG, 4.5), DARK_BG)).toBeGreaterThanOrEqual(contrastRatio(color, DARK_BG) - 0.001);
    }
  });
});

describe('vivid', () => {
  it('leaves a vivid colour in the same hue family', () => {
    const red = vivid({ r: 255, g: 0, b: 0 });
    expect(red.r).toBeGreaterThan(red.g);
    expect(red.r).toBeGreaterThan(red.b);
  });
  it('makes a grey wash into something usable as an accent', () => {
    const washed = vivid({ r: 150, g: 155, b: 152 });
    expect(saturation(washed)).toBeGreaterThan(0.4);
  });
});

describe('dominantColors', () => {
  it('groups pixels into separate swatches with their populations', () => {
    const greys = Array.from({ length: 40 }, () => ({ r: 120, g: 122, b: 121 }));
    const result = dominantColors(pixels([...greys, { r: 220, g: 30, b: 40 }]));
    expect(result).toHaveLength(2);
    expect(result[0].population).toBe(40);
  });
  it('ignores fully transparent pixels', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0, 10, 200, 10, 255]);
    const result = dominantColors(data);
    expect(result).toHaveLength(1);
    expect(result[0].g).toBeGreaterThan(result[0].r);
  });
  it('returns an empty list for fully transparent input', () => {
    expect(dominantColors(new Uint8ClampedArray([0, 0, 0, 0]))).toEqual([]);
  });
  it('respects the maximum count', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ r: index * 6, g: (index * 13) % 255, b: (index * 29) % 255 }));
    expect(dominantColors(pixels(many), 3)).toHaveLength(3);
  });
  it('averages pixels that share a bucket', () => {
    const result = dominantColors(pixels([{ r: 10, g: 10, b: 10 }, { r: 12, g: 12, b: 12 }]));
    expect(result[0]).toMatchObject({ population: 2 });
  });
});

describe('pickBase', () => {
  const grey = { r: 120, g: 122, b: 121, population: 900 };

  it('prefers a smaller saturated patch over a large grey field', () => {
    expect(pickBase([grey, { r: 220, g: 30, b: 40, population: 20 }])?.r).toBe(220);
  });

  it('ignores a stray colourful pixel in an otherwise monochrome cover', () => {
    expect(pickBase([{ ...grey, population: 5000 }, { r: 200, g: 60, b: 200, population: 2 }])?.r).toBe(120);
  });

  it('falls back to the largest colour when none is saturated enough', () => {
    expect(pickBase([{ r: 90, g: 92, b: 91, population: 10 }, { r: 130, g: 132, b: 131, population: 60 }])?.population).toBe(60);
  });

  it('returns undefined when there is nothing usable', () => {
    expect(pickBase([])).toBeUndefined();
    expect(pickBase([{ r: 0, g: 0, b: 0, population: 0 }])).toBeUndefined();
  });
});

describe('buildPalette', () => {
  it('always produces a readable accent in light and dark mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      const background = mode === 'light' ? LIGHT_BG : DARK_BG;
      const palette = buildPalette([{ r: 0xd6, g: 0xe4, b: 0xd5, population: 10 }], { mode, background });
      expect(contrastRatio(palette.accent, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.accent2, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to the interface accent for monochrome artwork', () => {
    const palette = buildPalette([{ r: 128, g: 128, b: 128, population: 100 }], { mode: 'light', background: LIGHT_BG });
    expect(contrastRatio(palette.accent, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    // A grey cover has no hue worth keeping, so the interface accent is reused
    // rather than letting `vivid` invent a colour that is not in the image.
    expect(toHex(palette.glow)).toBe(toHex(FALLBACK_ACCENT.light));
  });

  it('falls back when there are no swatches at all', () => {
    const palette = buildPalette([], { mode: 'dark', background: DARK_BG });
    expect(contrastRatio(palette.accent, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(saturation(palette.glow)).toBeGreaterThan(0);
    expect(palette.glow.r).toBeGreaterThanOrEqual(0);
    expect(FALLBACK_ACCENT.dark).toBeDefined();
  });

  it('keeps the tint close to the page so backdrops stay subtle', () => {
    const palette = buildPalette([{ r: 220, g: 30, b: 40, population: 10 }], { mode: 'light', background: LIGHT_BG });
    expect(contrastRatio(palette.tint, LIGHT_BG)).toBeLessThan(2);
  });

  it('picks the most saturated swatch rather than the most common', () => {
    const grey = { r: 120, g: 120, b: 120, population: 900 };
    const teal = { r: 30, g: 190, b: 160, population: 10 };
    const palette = buildPalette([grey, teal], { mode: 'light', background: LIGHT_BG });
    expect(palette.glow.g).toBeGreaterThan(palette.glow.r);
  });
});
