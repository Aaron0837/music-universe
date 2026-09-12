import { useEffect } from 'react';
import { dominantColors, type Swatch } from './palette';
import { setArtworkSwatches } from './artworkTheme';

/** Artwork is sampled at this size; large enough for colour, small enough to stay cheap. */
const SAMPLE = 40;

/**
 * Draw a cover into a canvas and read its pixels.
 *
 * `willReadFrequently` keeps Chromium from moving the surface to the GPU, which
 * is what makes `getImageData` on a cover-sized bitmap slow. Any failure returns
 * undefined so a broken or exotic image simply leaves the default theme in place.
 */
async function sampleArtwork(blob: Blob): Promise<Swatch[] | undefined> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, SAMPLE, SAMPLE);
    return dominantColors(context.getImageData(0, 0, SAMPLE, SAMPLE).data, 6);
  } catch {
    return undefined;
  } finally {
    bitmap?.close?.();
  }
}

/**
 * Theme the interface from the given cover.
 * Passing no artwork (or one that cannot be read) restores the default accent.
 */
export function useArtworkPalette(artwork?: Blob): void {
  useEffect(() => {
    if (!artwork) {
      setArtworkSwatches([]);
      return;
    }
    let cancelled = false;
    void sampleArtwork(artwork).then((swatches) => {
      // A newer track may have been opened while this image decoded.
      if (cancelled) return;
      setArtworkSwatches(swatches ?? []);
    });
    return () => {
      cancelled = true;
      setArtworkSwatches([]);
    };
  }, [artwork]);
}
