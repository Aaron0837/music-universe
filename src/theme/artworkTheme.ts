/**
 * Writes an artwork-derived palette onto the document.
 *
 * Tokens: `--accent`/`--accent-2` are contrast-checked and always readable;
 * `--glow`/`--tint` are decorative only. The palette is recomputed whenever the
 * theme flips, because an accent chosen for a light page is not guaranteed to
 * pass contrast on a dark one.
 */
import { buildPalette, toHex, type Palette, type RGB, type Swatch } from './palette';

const LIGHT_BG: RGB = { r: 0xf7, g: 0xf9, b: 0xf5 };
const DARK_BG: RGB = { r: 0x15, g: 0x1d, b: 0x19 };
const TOKENS = ['--accent', '--accent-2', '--glow', '--tint'] as const;

let swatches: Swatch[] = [];
let lastSignature = '';

function parseHex(value: string): RGB | undefined {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function currentMode(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Drop the inline overrides so `tokens.css` provides the interface default. */
function clear(): void {
  const style = document.documentElement.style;
  for (const token of TOKENS) style.removeProperty(token);
  delete document.documentElement.dataset.artworkTheme;
}

/**
 * Recompute and write the palette for the stored swatches.
 * Called on artwork change and again on every theme flip.
 */
export function applyArtworkTheme(): void {
  const root = document.documentElement;
  if (!swatches.length) {
    lastSignature = '';
    clear();
    return;
  }
  const mode = currentMode();
  const background = parseHex(getComputedStyle(root).getPropertyValue('--bg')) ?? (mode === 'dark' ? DARK_BG : LIGHT_BG);
  const palette: Palette = buildPalette(swatches, { mode, background });
  const values: Record<(typeof TOKENS)[number], string> = {
    '--accent': toHex(palette.accent),
    '--accent-2': toHex(palette.accent2),
    '--glow': toHex(palette.glow),
    '--tint': toHex(palette.tint),
  };
  const signature = `${mode}:${Object.values(values).join(',')}`;
  if (signature === lastSignature) return;
  lastSignature = signature;
  for (const token of TOKENS) root.style.setProperty(token, values[token]);
  root.dataset.artworkTheme = signature;
}

/** Replace the source colours. An empty list restores the interface default. */
export function setArtworkSwatches(next: readonly Swatch[]): void {
  swatches = [...next];
  lastSignature = '';
  applyArtworkTheme();
}
