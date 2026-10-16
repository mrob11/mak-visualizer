# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# MAK Visualizer

Audio-reactive visualizer app for live gigs. Displays MAK's band logo composited over a WinAmp/MilkDrop-style audio-reactive visual layer, fed from the band's mixer, output fullscreen to a TV at shows.

## Goal

A laptop runs this app, output over HDMI to a TV on stage/at the venue. Audio comes from the band's mixer (aux or direct out) into a Focusrite Scarlett 4i4 USB interface plugged into the laptop. The app reacts to that live audio in real time with generative visuals, with the band logo overlaid on top.

## Stack

- **Shell**: Tauri (Rust shell, not Electron) — lighter weight, better fullscreen/kiosk control, more reliable device-permission persistence for a "run all night unattended" use case.
- **Frontend**: Vite + React 19 + TypeScript (scaffolded from create-tauri-app's `react-ts` template, Tauri v2).
- **Audio capture & analysis**: Web Audio API.
  - `navigator.mediaDevices.getUserMedia` to select the Scarlett 4i4 as input device.
  - `AnalyserNode` for FFT/waveform data.
  - `meyda` for higher-level spectral features (RMS, spectral centroid, onset/beat detection) if frequency-bucket reactivity alone isn't enough.
- **Visual engine**: `butterchurn` (WebGL port of the Winamp MilkDrop/AVS preset engine) + `butterchurn-presets`. Takes an `AnalyserNode` directly as input. Ships with hundreds of presets; custom presets possible later.
- **Logo overlay**: separate transparent layer on top of the Butterchurn canvas (its own `<canvas>` or positioned SVG/PNG), driven by the same analyser data if we want it to pulse/glow with the music rather than sit static.

## Commands

- `pnpm tauri dev` — run the desktop app with HMR (starts Vite on port 1420 via `beforeDevCommand`).
- `pnpm dev` — Vite only, in a browser; handy for iterating on audio/visual code without the Rust shell.
- `pnpm build` — `tsc` typecheck + Vite production build to `dist/`.
- `pnpm tauri build` — production app bundle (runs `pnpm build` first).
- `cd src-tauri && cargo check` — check the Rust side without bundling.
- `scripts/gig.sh start [app path]` / `stop` / `status` — run the built app under launchd so it relaunches after a crash (a clean `Cmd+Q` exit stays quit). Defaults to `/Applications/MAK Visualizer.app`; logs to `~/Library/Logs/mak-visualizer.log`.

No lint or test tooling is set up yet.

## Releasing

`.github/workflows/release.yml` runs on `v*` tags (or manually): it creates a draft release, builds a universal macOS bundle (`--target universal-apple-darwin`) and Windows installers via `tauri-apps/tauri-action`, uploads them to the draft, then publishes it once both succeed. The tag must equal `v` + `src-tauri/tauri.conf.json`'s version; keep `package.json` and `Cargo.toml` versions in step. CI uses pnpm from `package.json`'s `packageManager` field and `pnpm install --frozen-lockfile`, so commit `pnpm-lock.yaml` changes. Builds are unsigned (README covers the Gatekeeper/SmartScreen steps).

## Layout

- `src/` — React frontend. `App.tsx` switches between the setup screen (`setup/DeviceSelector.tsx`, toggled with `D`, shown automatically when no input is saved) and the stage.
- `src/audio/inputDevices.ts` — input enumeration and the saved-device record (localStorage key `mak.audioInput`). The saved device is matched by `deviceId`, then by label, because IDs can change across relaunches or USB reconnects.
- `src/audio/audioEngine.ts` (+ `useAudioEngine.ts`) — the core of the audio side. One long-lived `AudioContext` per stage mount with a fixed `bus` GainNode; Butterchurn, the kick detector and the shared `analyser` all listen to `bus`, never to the device directly. The device (opened by `audioInput.ts` with echo cancellation, noise suppression and AGC off) attaches into the bus and can drop and reconnect underneath without anything downstream rebuilding: it retries every 2 s and on `devicechange`, and also checks `readyState`, since `ended` isn't always prompt. The bus is never connected to `destination`. Status is exposed for `useSyncExternalStore`.
- `src/audio/idleGenerator.ts` — a synthetic groove (pitch-drop kick plus a filtered saw pad) the engine fades into the bus when the input is lost (immediately) or below about −60 dBFS for 6 s, so presets and the logo never sit dead. Silence detection uses a separate analyser on the raw input, so the groove can't keep itself alive.
- `src/visuals/Visualizer.tsx` — Butterchurn 2.6.7 (stable; 3.x is still beta) on the engine's `bus`, shuffle-cycling the base `butterchurn-presets` pack. It creates its own canvas per mount and loses the WebGL context on cleanup, so remounts (setup toggle, StrictMode) don't leak contexts. On `webglcontextlost` it rebuilds on a fresh canvas; the listener is removed before its own deliberate `loseContext()`. Types live in `src/types/butterchurn.d.ts` since the package ships none.
- `src/visuals/LogoOverlay.tsx` — band logo (`src/assets/mak-logo.svg`) layered over the visualizer inside `Stage.tsx`'s `.layers` container; not shown over the debug view. It drifts and bounces off the screen edges DVD-screensaver style (`DRIFT_SPEED`), with the bounce bounds inset so a kick pulse at an edge stays on screen. A 3D tilt (perspective rotateX/rotateY) runs as a damped spring: it leans into the direction of travel (so bounces make it swing), kicks add random angular impulses, and a slow sway is sized by broadband loudness from `src/audio/levelMeter.ts` (reads the shared analyser's time-domain data). Pulses on kicks from `src/audio/kickDetector.ts`, which taps the engine `bus` through its own 40–90 Hz filter chain and unsmoothed analyser (separate from the shared one) and fires on low-band onsets relative to a running average. Tuning constants sit at the top of both files. The per-frame animation only touches `transform`/`opacity` (the glow is a pre-blurred copy whose opacity changes); keep it that way to avoid per-frame repaints.
- `src/visuals/presetLibrary.ts` — the preset pack and its sorted names (single source for the Visualizer and the menu), plus a tiny store of the preset on screen (`setCurrentPreset` / `useCurrentPreset`).
- `src/visuals/PresetMenu.tsx` — preset list. Clicking a row plays it via `requestPreset` (the Visualizer inserts it next in its history, so ← returns to the previous one); only the checkbox changes the cycle (deliberately not a `<label>`). Unchecking adds to `settings.disabledPresets` (stored as the disabled set so new presets default on). The last enabled preset can't be unchecked. The Visualizer subscribes to settings: it reshuffles its bag when the set changes and moves off the current preset if it was just disabled; ←/→ skip disabled entries in the history.
- `src/settings.ts` — live settings (`logoVisible`, `kickSensitivity`, `disabledPresets`) persisted to localStorage key `mak.settings`, so a crash relaunch keeps soundcheck tuning. A tiny external store: `useSettings()` for React, `getSettings()` for per-frame reads (the kick detector reads sensitivity every frame, scaling its onset ratio and peak fraction per step).
- `src/debug/DebugBars.tsx` — spectrum/waveform/RMS/clip view of the bus, plus input/connection/idle status, toggled with `B` from `Stage.tsx` for checking levels.
- Crash recovery layers: Tauri reloads the webview by default if WebKit's content process dies; `StageErrorBoundary.tsx` remounts the stage after render/effect errors; `Visualizer` rebuilds on WebGL context loss; `scripts/gig.sh` covers a full process crash. The stage shows a dim operator-only status line when the input is lost or blocked, and nothing for ordinary silence.
- Butterchurn compiles preset equations with `new Function`, so any CSP added to `tauri.conf.json` (currently `null`) must allow `'unsafe-eval'`.
- `src-tauri/` — Rust shell. `tauri.conf.json` holds window config; `capabilities/` holds Tauri v2 permission grants; `src/lib.rs` registers plugins and commands.
- Kiosk mode (`src-tauri/src/lib.rs`, toggled from `src/kiosk.ts`) is macOS *simple* fullscreen plus always-on-top, deliberately not native fullscreen: a native-fullscreen Space gets swapped out when another app takes focus, putting the desktop on the TV. Release builds start in kiosk mode, dev builds start windowed. While in kiosk mode, the window is unminimized or reshown if something hides it; focus itself is not stolen back. A `keepawake` display + idle-sleep assertion is held for the app's lifetime (check with `pmset -g assertions`). The stage hides the cursor via CSS.
- `src-tauri/app-icon.svg` — source for the app/bundle icons (brand-red logo on a black rounded square, macOS icon-grid margins). After editing it, regenerate with `pnpm tauri icon src-tauri/app-icon.svg` and delete the `icons/android` and `icons/ios` folders it also creates (desktop-only app).
- `src-tauri/Info.plist` — merged into the macOS bundle; supplies `NSMicrophoneUsageDescription`, without which `getUserMedia` fails in the webview. Don't remove it.

## Keyboard shortcuts

Check here before binding a new key.

- `D` — open/close the audio input setup screen (`App.tsx`). `Esc` closes it.
- `F` — toggle kiosk mode (`App.tsx` → `kiosk.ts` → `toggle_kiosk` command); browser Fullscreen API under plain `pnpm dev`.
- `B` — toggle the analyser debug view (`Stage.tsx`).
- `V` — open/close the visualization menu (`Stage.tsx` → `visuals/PresetMenu.tsx`); `Esc` also closes it.
- `L` — show/hide the logo (fades; `Stage.tsx`).
- `-` / `=` (also `_` / `+`) — kick sensitivity down/up, −5…+5; `0` resets (`Stage.tsx`). Shows a dim toast bottom-right.
- `→` / `←` — next / previous preset (`visuals/Visualizer.tsx`); restarts the auto-cycle countdown. `←` walks back through presets already shown.

## Build Order

1. **Scaffold**: `pnpm create tauri-app` with the react-ts template (done).
2. **Audio input selector**: a dev-only screen that lists available input devices (`navigator.mediaDevices.enumerateDevices`) and lets us pick the Scarlett 4i4 (or whatever interface is plugged in). Persist the choice.
3. **Analyser pipeline**: wire the selected input through an `AudioContext` → `AnalyserNode`. Confirm live FFT/waveform data with a throwaway debug visualization (simple bar graph) before touching Butterchurn.
4. **Butterchurn integration**: instantiate the visualizer against the analyser, load `butterchurn-presets`, get full-screen rendering working with a couple of presets cycling.
5. **Logo overlay layer**: add the logo as a composited layer above the visualizer canvas. Start static, then add reactive treatment (scale/glow pulse keyed off RMS or beat detection) once the base layer works.
6. **Fullscreen/kiosk behavior**: launch directly into fullscreen, disable sleep/screensaver, handle window focus so it doesn't minimize if something else briefly grabs focus.
7. **Live reliability**:
   - "No signal" idle state (fallback animation) so it's never sitting on black/frozen if the audio input drops or goes quiet.
   - Detect and recover from the Scarlett disconnecting/reconnecting mid-set (USB audio dropouts are the most likely gig-night failure).
   - Auto-restart-on-crash if feasible with Tauri's process management.
8. **Preset/UI controls**: minimal on-the-fly controls (next preset, toggle logo, sensitivity adjustment) — ideally keyboard-shortcut driven so nothing needs to be visible on the TV output itself.

## Non-goals (for now)

- No need for recording/export — this is a live-only display tool.
- No multi-monitor / multi-output support needed initially — single TV output.
- Not building custom shader presets from scratch initially — lean on Butterchurn's existing preset library first.

## Notes

- Band name: Men Amongst Kings.
- Audio source will be the mixer's aux or direct out, not a house PA feed — band brings its own mixer to gigs, so this should be reliable to test and tune ahead of time with the same gear that'll be used live.
