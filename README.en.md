# Music Universe

> A little space, for music. A crisp local player, a dark two-deck DJ console, and a rhythm game driven by the music clock.

[中文](README.md) | **English**

[![CI](https://github.com/Aaron0837/music-universe/actions/workflows/ci.yml/badge.svg)](https://github.com/Aaron0837/music-universe/actions/workflows/ci.yml)
[![Deploy](https://github.com/Aaron0837/music-universe/actions/workflows/deploy.yml/badge.svg)](https://github.com/Aaron0837/music-universe/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

React + TypeScript + Web Audio API + Canvas / Three.js + Zustand + Dexie.

**Your music and its analysis never leave your machine** — no uploads, no telemetry, no accounts, no server. The whole app is a static site you can install and run offline.

[Live version](https://aaron0837.github.io/music-universe/) — built and deployed by CI on every push to `main`, or manually via `workflow_dispatch`.

## Preview

| Home | DJ console | Mobile |
|:---:|:---:|:---:|
| ![Home](docs/preview-home.png) | ![DJ console](docs/preview-dj.png) | ![Mobile](docs/preview-mobile.png) |

Screenshots come from `scripts/capture-preview.mjs`; the tracks shown are generated test audio, not a real library.

## Running locally

```bash
npm install
npm run dev
```

Click "play the original sample" to unlock audio; drag local music onto the page or import it through the file picker.

```bash
npm test          # Vitest unit tests
npm run test:e2e  # Playwright: Chromium / Firefox / WebKit
npm run build     # tsc -b && vite build
npm run preview
node scripts/verify-production.mjs
```

Set `MU_BROWSER=chrome` to run the same suite in an installed Chrome or Edge. The multi-engine suite needs `npx playwright install firefox webkit` first. Note that Playwright's WebKit build on Windows ships without Web Audio, so WebKit only runs the shell, offline and degradation specs.

## Features

**Playback and library**

- **Play modes**: sequential / repeat-all / repeat-one / shuffle (shortcut `M`). Shuffle builds a permutation of the queue and only reshuffles once it's exhausted, so every track plays and none repeats. With no queue (playing a single track straight from the library) repeat-one still works.
- **Favourites and recently played**: a heart on every library row, a "favourites only" filter, and a dedicated **My Music** page collecting both. Recently played is ordered by real play history — **replaying moves a track to the front instead of adding a new entry**, and deleting a track cleans up both lists.
- **Sleep timer**: 15 / 30 / 45 / 60 minutes, pausing both decks when it fires, with a countdown on the card.
- **Playlists**: add and remove tracks, reorder, rename and delete. Sequential playback continues automatically when a track ends naturally — pausing, seeking or looping does not trigger it.
- The bottom bar follows the active deck.

**Listening experience**

- **Immersive now-playing screen**: open it from the bottom bar artwork or with `V` (`Esc` to close). The cover blurs into a background glow and rotates slowly during playback (frozen when reduced motion is on). **Line-by-line lyrics** scroll centred with the play position, the active line has a karaoke sweep, and clicking any line seeks to that moment. With no embedded lyrics you can paste LRC or plain text, edit and clear it in the same place. Sample tracks can't be edited.
- **Artwork-derived theming**: the playing cover drives the global `--accent` / `--accent-2`, plus `--glow` / `--tint` for background glow and texture. Switching light/dark **recomputes** the palette rather than reusing a colour picked for the other background.
- Lyrics are read from the file itself (ID3v2 USLT / SYLT, Vorbis `LYRICS`, MP4 `©lyr`) — **never fetched from the network**.

**DJ console**

- Independent deck waveforms and beat lines, four hot cues, 1/2/4/8-beat quantised loops, reverse, EQ, filter and FX sends. First cue click sets a point, a second seeks to it, Shift+click clears it. Zeroing an FX send turns that effect off.
- **Key Lock**: tempo changes no longer move pitch, and Harmony becomes a pure key shift. Runs on a SoundTouch AudioWorklet (MPL-2.0); verified to hold 440 Hz at both 1.5x and 0.75x, with an octave landing exactly on 880 Hz.
- A worker analyses BPM, first beat and confidence, cached afterwards. You can correct the source BPM by hand, tap tempo, or set the first beat to the current position. Sync matches tempo and beat when confidence is sufficient.
- Large BPM / volume knobs: drag vertically, `Shift` for fine adjustment, arrow keys and numeric entry also work.
- **Beat Garden**: BPM Match (deck A on-beat), Drum Grid (eight-step drum machine) and Harmony (both decks). Driven by deck A's musical position — pausing freezes it, tempo changes follow, seeks rebuild.
- Perfect ±80 ms / Great ±150 ms; repeated keypresses don't double-score and missed hits break the combo. Perfect uses a separate limited kick output and Harmony adds synthesised chords — the original track is never modified.
- The game enlarges, `Esc` exits, focus is trapped. `F` hits only the fourth lane; fullscreen has its own button. At 390px the layout pages through Deck A / game / Mixer / Deck B.

**Visuals**

- The 3D stage runs a real HDR post-processing pipeline: `EffectComposer` + `UnrealBloomPass` + ACES tone mapping, then a colour-grade pass for chromatic aberration, vignette and grain — rather than faking glow with additive blending. Bloom intensity breathes with loudness and beats.
- Five original presets: Nebula, Gravity, Bloom, **Hyper Tunnel** (vertex-shader star stream, only uniforms updated per frame) and **Aurora Veil** (fragment-shader procedural aurora). Presets register once in `src/presets/index.ts`.
- The low quality tier skips the entire post-processing pipeline and keeps the original bare rendering path as a fallback.
- The home page has an original CSS record garden, cover collection, and import and playback entry points. Background glow and up to 64 canvas particles share one animation loop; it drops to 32 on low-end hardware, freezes when off-screen and stops when the page is hidden.

**Platform**

- **Installable PWA**: manifest, 192 / 512 icons and a maskable icon; the service worker precaches the app shell so it cold-starts offline.
- Warm white / sage green / pale blue themes across discover, library, playlists, settings and the bottom player, with dark mode and live system-following retained.
- Static soft glow on touch devices; the system reduced-motion preference wins, and the effects toggle, low-motion and latency compensation settings persist. The DJ area doesn't use background following.

## Limitations

- Key Lock depends on AudioWorklet: browsers without it disable the toggle automatically (with the reason shown on the deck) and nothing else is affected.
- BPM is an approximation based on the onset envelope and can be ambiguous by a factor of two. Weak, varying or drifting rhythms need manual correction. Analysis currently uses the first 120 seconds and the first channel; the fixed grid does not track tempo changes.
- Reversed playback disables Sync and the rhythm game. Seeks and loop wraps rebuild nearby notes; short loops are unsuitable for full practice. The game is procedural rhythm practice, not automatic transcription of the original drum part.
- The jog wheel does positional dragging, not AudioWorklet-grade scratching. Effects are independent wet sends, not true dry/wet crossfades.
- Which MP3 / WAV / FLAC / M4A / OGG variants actually decode depends on the browser; there is no extra WASM decoder.
- Offline library recovery means an already-open or cached app can read local files. The service worker cold-starts the shell offline, but audio still has to be imported on that machine first.
- Playlists support adding, removing and reordering, but not nesting, import/export or cloud sync. No Tauri or WASM for now.
- Play modes only apply to a *queue* (a playlist, or playing the whole library in order). Playing a single track straight from the library has no queue, so only repeat-one is meaningful — the other three stop after that track.
- Favourites, history and play mode live in the local database's `settings` table (Dexie v3). Writes are backgrounded so they never block playback, which means force-refreshing immediately after clicking a heart can very rarely beat the write. Normal use is unaffected.
- Lyrics come from embedded metadata and are **never fetched**. Without embedded lyrics you can paste LRC by hand; plain-text lyrics have no timeline and can't be clicked to seek.
- Artwork theming reads cover pixels. Pure grey or black-and-white covers have no usable hue, so it falls back to the interface accent rather than inventing a colour. `--accent` and `--accent-2` are always contrast-corrected (≥ 4.5:1); `--glow` / `--tint` are decorative and never used for text contrast.
- Automated output-level checks are not a substitute for listening on real speakers. Cross-browser tests run on Chromium, Firefox and WebKit (Safari's engine), but **Playwright's WebKit build on Windows has no Web Audio**, so WebKit only covers the shell, offline and degradation paths. Real Safari / iOS / Android still need manual acceptance.

## Architecture

```text
React pages / components → serializable Zustand snapshots
           ↓ commands
MixerEngine → Deck A / B → Gain / EQ / Filter / FX
           → equal-power crossfader → Master / limiter → output
           ↓ audio frames
Canvas / Three.js       RhythmSession ← TransportClock / BeatGrid
           ↑
LibraryRepository → Dexie v3 ← beat analysis Worker
```

Data flows one way: the UI only issues commands and subscribes to serialisable snapshots. Per-frame data — audio frames, pointer coordinates — never enters React state.

- `src/styles/` — layered tokens, layout, components, pages and dj styles; never appended overrides at the end of an older file.
- `src/rendering/` — the render loop and post-processing pipeline; `GradePass.ts` is the colour-grade shader.
- `src/presets/` — original presets. A new preset implements `UniversePreset` and registers once in `src/presets/index.ts`; allocate on create, reuse on update, release geometry / material on dispose.
- `src/audio/engine/` — audio nodes, the integrating transport clock, and sync maths.
- `src/audio/audioMath.ts` — per-frame signal maths (band averages, RMS, transients, BPM normalisation and rate). Pure functions, no side effects.
- `src/audio/analysis/` — worker-driven background beat and waveform analysis. A **different layer** from `audioMath.ts` above.
- `src/audio/keylock/` — key lock. `keyLockMath` is pure and decides clock rate and worklet pitch; `worklet.ts` **must import SoundTouch dynamically**, because the package extends `AudioWorkletNode` at module scope and a static import would white-screen unsupported browsers before React mounts.
- `src/components/rhythm-game/` — the testable judgement kernel and the canvas stage.
- `src/components/ui/AmbientField.tsx` — a background effect that never intercepts input; its coordinates don't enter Zustand.
- `src/components/player/NowPlaying.tsx` — the now-playing screen. The outer component subscribes only to the `nowPlaying` flag; the inner one subscribes to the per-frame snapshot. Otherwise it would re-render five times a second while hidden.
- `src/data/` — the persistence boundary. `LibraryRepository.ts` is the interface (port), `WebLibraryRepository.ts` the Dexie v3 implementation (adapter); audio assets never enter the UI store. Dexie is at v3 and every upgrade preserves existing library data.
- `src/library/collection.ts` — pure functions for favourites / history / sleep timer (dedupe, promote, cap, prune). Its split from `src/data/` is "rules" versus "persistence".
- `src/playlists/` — `playlistMath` holds the pure ordering / dedupe / play-mode and shuffle rules; `queue.ts` handles continuous playback and natural-end continuation. `handleTrackEnd` is the single entry point and covers both "there is a queue" and "replay one track".
- `src/lyrics/` — `lrc.ts` normalises every container format to LRC and parses it (`parseLrc` / `activeLineIndex` / `lineProgress` are all pure), `useLyrics.ts` reads and caches.
- `src/theme/` — `palette.ts` is pure colour maths (bucket the dominant colour, `ensureContrast` to pass, `buildPalette` to emit four tokens); `artworkTheme.ts` writes CSS variables; `useArtworkPalette.ts` only draws the cover into a canvas to read pixels.
- `src/types/` — types split by domain. `models.ts` is the **data domain** (Track / Playlist / DeckSnapshot); `visuals.ts` is the **rendering / interaction domain** (AudioFrame / InteractionFrame / UniversePreset).
- `src/state/AppState.ts` — a 13-line mutable singleton that is **deliberate, not legacy**. It carries sensitivity, hue and reduced-motion for the render loop, letting it bypass React re-renders; coordinates never go into Zustand. Long-lived UI state belongs in `src/stores/`.
- `src/audio/engine/loadTrack.ts` — the shared entry point for loading from the library, used by both the UI and the playback queue to avoid races and duplicate audio unlocking.

## Local visual review

Start the dev server (port 4173), then:

```bash
npm run dev -- --host 127.0.0.1 --port 4173
# in another terminal
node scripts/capture-preview.mjs
```

Screenshots and mouse-following clips land in `test-results/review/` (git-ignored): home, library, settings, DJ and the enlarged stage, at 390 / 768 / 1440 / 1920 widths. The screenshots use generated test audio, not a real library. The clips are visual demos with no speaker recording.

To verify the 3D presets actually render rather than mounting a blank canvas:

```bash
node scripts/canvas-proof.mjs
```

It screenshots `.visual-stage canvas` per preset, decodes it in Chromium and checks the luminance distribution; any preset with too low a standard deviation or an all-black frame makes the script exit non-zero. Don't switch it to `drawImage` on a live canvas — with `preserveDrawingBuffer: false` (the default) that reports a false all-black result.

## Tests

Vitest covers the transport clock, rate ramps, sync maths, loops, beat detection, the game window, key lock rate resolution, playlist ordering, LRC parsing and active-line location, colour extraction and contrast correction, play modes and shuffle permutations, favourites / history / sleep-timer rules, and preset resource disposal.

Playwright runs across Chromium, Firefox and WebKit covering real sample / file audio output, offline reading, migration, Perfect output, drag and drop, touch combinations, theming, layout, visualizer switching, key lock fundamental frequency, the full playlist flow, lyric saving / highlighting / seeking and artwork theming, favourites / history / play modes / sleep timer, PWA offline cold start, and the degradation paths without AudioWorklet or Web Audio. Listening quality and real-device performance still need human checking — passing automated tests is not a claim of platform acceptance.

Pushes to `main` and every pull request run the unit tests and build automatically (see `.github/workflows/`).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

- Report security issues through the [private advisory channel](https://github.com/Aaron0837/music-universe/security/advisories/new) — see [SECURITY.md](SECURITY.md).
- Change history lives in [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md).

"Orbital Signal" and the Perfect sound effect are synthesised in code with no external samples, and the CSS illustrations are original. No unauthorised audio, artwork, fonts or textures may be added.
