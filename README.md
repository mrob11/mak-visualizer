# MAK Visualizer

Audio-reactive gig visuals for **Men Amongst Kings**. A laptop takes the band's mixer feed through a USB audio interface and drives fullscreen [MilkDrop](https://en.wikipedia.org/wiki/MilkDrop)-style visuals on a TV, with the band logo bouncing around on top and pulsing to the kick drum.

Built with [Tauri](https://tauri.app) (Rust shell), React + TypeScript, the Web Audio API and [Butterchurn](https://github.com/jberg/butterchurn) (a WebGL port of MilkDrop).

## Features

- **Live audio input**: pick any input device (built for a Focusrite Scarlett 4i4 fed from the mixer's aux out). The browser's voice-call processing is switched off, so the music isn't flattened.
- **MilkDrop visuals**: Butterchurn's base pack of 100 presets, shuffled, changing every 30 seconds. Choose which ones are in rotation from an in-app menu.
- **Reactive logo**: drifts and bounces off the screen edges like the old DVD screensaver, pulses and glows on kick drum hits, and wobbles in 3D with the music.
- **Built for unattended gigs**:
  - Launches into fullscreen and stays on top even if another app grabs focus.
  - Keeps the display from sleeping and the screensaver from starting.
  - Hides the mouse pointer.
  - Recovers automatically if the interface is unplugged mid-set.
  - Keeps the visuals moving with a synthetic idle groove when the input goes quiet.
  - Can be relaunched automatically after a crash.
- **Keyboard controls**: nothing ever needs to be shown on the TV to operate it.

## Install

Download the latest installer from [Releases](https://github.com/mrob11/mak-visualizer/releases/latest):

- **macOS** (Apple Silicon and Intel): the `.dmg`. Open it and drag **MAK Visualizer** to Applications.
- **Windows**: the `-setup.exe` (or the `.msi`).

The builds aren't code-signed, so the OS warns on first launch:

- **macOS** may say the app "is damaged" or "can't be opened". Clear the download quarantine flag once, then open it normally:
  ```sh
  xattr -dr com.apple.quarantine "/Applications/MAK Visualizer.app"
  ```
  macOS asks for microphone access on first launch; allow it. If you said no, re-enable it under **System Settings → Privacy & Security → Microphone**. Each new unsigned build may ask again.
- **Windows** SmartScreen may show "Windows protected your PC": click **More info → Run anyway**.

## Using it

1. Plug the interface in and connect the mixer's aux (or a direct out) to it.
2. Launch the app. On first launch it asks which audio input to use; pick the interface. The choice is remembered, even if the device ID changes after a reconnect.
3. The visuals start. Release builds open fullscreen; press `F` to toggle.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `→` / `←` | Next / previous visualization (restarts the 30 s auto-change countdown) |
| `V` | Visualization menu: checkbox = in rotation or not; click a name to play it now |
| `L` | Show / hide the logo |
| `-` / `=` | Kick pulse sensitivity down / up (−5 to +5) |
| `0` | Reset kick sensitivity |
| `B` | Level-check view: spectrum, waveform, RMS and clip indicator |
| `D` | Settings panel: audio input, logo, kick sensitivity, fullscreen, and the visualization list |
| `F` | Toggle fullscreen (kiosk) mode |
| `Esc` | Close the menu or settings panel |

Logo visibility, kick sensitivity, the visualization rotation and the chosen input all persist across restarts.

### Gig-day checklist

- **Soundcheck with the real mix:**
  - Press `B` to check the level isn't clipping.
  - Set kick sensitivity with `-` / `=` until the logo hits on the kick and not on the bass.
  - Cull any visualizations you don't like from the `V` menu.
- **Test a dropout:** unplug the interface for a few seconds and plug it back in. The visuals keep running, and a dim "reconnecting…" note appears bottom-left until it's back.
- **Run it supervised** (macOS) so it relaunches by itself if it ever crashes:
  ```sh
  scripts/gig.sh start     # launches /Applications/MAK Visualizer.app under launchd
  scripts/gig.sh stop      # quit and stop supervising
  ```
  Quitting normally with `Cmd+Q` stays quit. Logs go to `~/Library/Logs/mak-visualizer.log`.

### How it behaves when the audio stops

- **Silence** (below about −60 dBFS for 6 seconds, e.g. between songs): a soft synthetic groove fades in so the visuals and logo keep moving. It never plays out of the speakers, and it drops out the moment the band starts again.
- **Input lost** (unplugged, USB dropout): the groove takes over straight away while the app reconnects every 2 seconds and whenever a device is plugged in.

## Platform notes

- **macOS** is the primary target and the one tested at gigs. Fullscreen uses macOS "simple" fullscreen plus always-on-top rather than a separate fullscreen Space, so a notification or dialog taking focus can't swap the desktop onto the TV.
- **Windows** builds are produced by CI but haven't been gig-tested. Fullscreen there is regular fullscreen, and `scripts/gig.sh` is macOS-only.

## Development

Requires Node.js (LTS), [pnpm](https://pnpm.io), Rust stable, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install
pnpm tauri dev      # desktop app with hot reload (starts windowed; F for fullscreen)
pnpm dev            # frontend only, in a browser
pnpm build          # typecheck + production frontend build
pnpm tauri build    # production app bundle in src-tauri/target/release/bundle/
```

There's no lint or test tooling yet; `pnpm build` (TypeScript) and `cd src-tauri && cargo check` are the checks.

### Where things live

- `src/audio/audioEngine.ts`: one long-lived `AudioContext` with a fixed bus node that everything listens to, so the device can drop and reconnect underneath without rebuilding the visuals. It also handles the silence and idle-groove switching.
- `src/audio/kickDetector.ts`: band-limited (40–90 Hz) onset detection for the logo pulse. Its tuning constants are at the top of the file.
- `src/visuals/Visualizer.tsx`: Butterchurn, the preset cycle and arrow-key navigation.
- `src/visuals/LogoOverlay.tsx`: the bounce, kick pulse and 3D wobble. Its tuning constants are at the top of the file.
- `src/visuals/PresetMenu.tsx`: the `V` menu.
- `src/settings.ts`: the persisted live settings.
- `src-tauri/src/lib.rs`: kiosk mode, sleep prevention and keep-on-screen handling.

[`CLAUDE.md`](CLAUDE.md) has more detailed architecture notes.

### Releasing

[`.github/workflows/release.yml`](.github/workflows/release.yml) builds a universal macOS bundle and the Windows installers, then publishes them as a GitHub release.

1. Bump the version in `src-tauri/tauri.conf.json` (the source of truth), and keep `package.json` and `src-tauri/Cargo.toml` in step.
2. Commit, then tag and push:
   ```sh
   git tag v0.2.0
   git push origin main v0.2.0
   ```

The tag must match the version or the workflow fails early. You can also run the workflow by hand from the Actions tab, which releases as `v<version>`. Releases are built as drafts and published only once every platform succeeds.

## License

The code is [MIT licensed](LICENSE): use it however you like. The **Men Amongst Kings name and logo** (`src/assets/mak-logo.svg` and its white copy) are not covered by that license and remain all rights reserved. If you fork this, swap in your own logo.

Butterchurn and `butterchurn-presets` are installed from npm and are MIT licensed by their authors.
