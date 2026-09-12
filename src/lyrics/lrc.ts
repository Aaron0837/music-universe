/**
 * Lyrics parsing shared by every import format.
 *
 * ID3v2 USLT, Vorbis LYRICS and MP4 ©lyr all carry either plain text or LRC,
 * and ID3v2 SYLT carries timed text that music-metadata exposes as `syncText`.
 * Every one of them is normalised to an LRC string here, so a single parser and
 * a single view cover all formats instead of one code path per container.
 */

export interface LyricLine {
  /** Seconds from the start of the track, after the file's offset tag is applied. */
  time: number;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
  /** False for plain-text lyrics, which carry no usable timings. */
  synced: boolean;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ti|ar|al|by|offset|re|ve|length|au):(.*)\]$/i;

/** `[offset:…]` is documented as moving the lyrics; a positive value makes them appear earlier. */
function readOffset(digits: string): number | undefined {
  const value = Number.parseInt(digits.trim().replace(/^\+/, ''), 10);
  return Number.isFinite(value) ? value / 1000 : undefined;
}

export function formatStamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes.toString().padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

/**
 * Parse an LRC or plain-text lyric block.
 *
 * Lines without a timestamp are only kept when the whole block is untimed. In a
 * timed file they are credits or blank filler, and showing them would interrupt
 * the scroll, so they are dropped.
 */
export function parseLrc(source: string): Lyrics {
  const timed: LyricLine[] = [];
  const plain: string[] = [];
  let offset = 0;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const meta = META_TAG.exec(line);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') offset = readOffset(meta[2]) ?? offset;
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number.parseInt(match[1], 10);
      const seconds = Number.parseInt(match[2], 10);
      // `[00:12.3]` is tenths and `[00:12.345]` milliseconds, so pad right to three.
      const fraction = match[3] ? Number.parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
      times.push(minutes * 60 + seconds + fraction);
      cursor = TIME_TAG.lastIndex;
    }

    const text = line.slice(cursor).trim();
    if (times.length) {
      for (const time of times) timed.push({ time, text });
    } else {
      plain.push(text);
    }
  }

  if (!timed.length) {
    return { lines: plain.map((text) => ({ time: 0, text })), synced: false };
  }
  timed.sort((a, b) => a.time - b.time);
  return { lines: timed.map((line) => ({ time: line.time - offset, text: line.text })), synced: true };
}

/** Index of the line that should be highlighted at `position`, or -1 before the first one. */
export function activeLineIndex(lines: readonly LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= position) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** How far through the active line playback is, for a karaoke wipe. */
export function lineProgress(lines: readonly LyricLine[], index: number, position: number, duration: number): number {
  if (index < 0) return 0;
  const start = lines[index].time;
  const next = lines[index + 1]?.time ?? duration;
  if (!(next > start)) return 1;
  return Math.min(1, Math.max(0, (position - start) / (next - start)));
}

interface SyncTextEntry {
  text?: unknown;
  timestamp?: unknown;
}

/**
 * Pull a lyric string out of music-metadata's `common` block.
 *
 * Synchronised (SYLT) entries are rewritten into LRC so the parser above can
 * consume them; unsynchronised entries are returned verbatim, because USLT very
 * often already contains LRC text.
 */
export function lyricsTextFromCommon(common: { lyrics?: unknown; syncLyrics?: unknown }): string | undefined {
  const candidates = [common.lyrics, common.syncLyrics];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const entries = Array.isArray(candidate) ? candidate : [candidate];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        if (entry.trim()) return entry;
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const text = (entry as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) return text;
      const syncText = (entry as { syncText?: unknown }).syncText;
      if (!Array.isArray(syncText)) continue;
      const converted = (syncText as SyncTextEntry[])
        .filter((item) => item !== null && typeof item === 'object' && typeof item.text === 'string')
        .map((item) => `[${formatStamp(Number(item.timestamp ?? 0) / 1000)}]${String(item.text)}`);
      if (converted.length) return converted.join('\n');
    }
  }
  return undefined;
}
