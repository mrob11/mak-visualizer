import { useEffect, useRef } from "react";
import { AudioEngine } from "../audio/audioEngine";
import { createKickDetector } from "../audio/kickDetector";
import { createLevelMeter } from "../audio/levelMeter";
import { getSettings } from "../settings";
import logoUrl from "../assets/mak-logo.svg";

// How far the logo grows on a full-strength kick, and how much it breathes with
// the continuous low end between hits.
const KICK_SCALE = 0.1;
// Kept small so general low end barely moves the logo; the kick should carry it.
const LEVEL_SCALE = 0.01;
const LEVEL_GLOW = 0.05;
// Seconds for a pulse to fall to ~37%. Short reads as a punch rather than a swell.
const PULSE_DECAY_SECONDS = 0.13;
// DVD-screensaver drift speed, as a fraction of the screen height per second, so it
// looks the same on the laptop and the TV.
const DRIFT_SPEED = 0.12;

// 3D wobble. The tilt is a damped spring pulled toward a lean in the direction of
// travel, so each bounce flips the lean and the logo swings past and settles.
const LEAN_DEG = 7;
const WOBBLE_HZ = 1.4;
// Below 1 the spring overshoots; lower is wobblier.
const WOBBLE_DAMPING = 0.22;
// Angular kick (deg/s) a full-strength kick drum gives the tilt, in a random direction.
const KICK_SPIN = 140;
// Slow sway layered on top, sized by overall loudness of the mix.
const SWAY_DEG = 6;
const SWAY_IDLE = 0.2; // Fraction of the sway that remains when the room is quiet.
const MAX_TILT_DEG = 28;
const PERSPECTIVE_PX = 800;
// Extra bounce inset for the tilt's perspective growth, as a fraction of logo size.
const TILT_MARGIN = 0.04;

export function LogoOverlay({ engine, visible }: { engine: AudioEngine; visible: boolean }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const overlayEl = overlayRef.current;
    const moverEl = moverRef.current;
    const pulseEl = pulseRef.current;
    const glowEl = glowRef.current;
    if (!overlayEl || !moverEl || !pulseEl || !glowEl) return;

    // Layout sizes, updated on resize. Transforms don't affect these, so reading
    // them is cheap, but there's no reason to do it every frame.
    let screenW = 0;
    let screenH = 0;
    let logoW = 0;
    let logoH = 0;
    const measure = () => {
      screenW = overlayEl.clientWidth;
      screenH = overlayEl.clientHeight;
      logoW = moverEl.offsetWidth;
      logoH = moverEl.offsetHeight;
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(overlayEl);
    resizeObserver.observe(moverEl);

    // The pulse scales around the logo's centre, so bounce early enough that a kick
    // (or the tilt's perspective) at an edge doesn't push it off screen.
    const pulseMargin = (size: number) =>
      (size * (KICK_SCALE + LEVEL_SCALE)) / 2 + size * TILT_MARGIN;

    // Start somewhere random, heading diagonally in a random direction.
    let x = Math.random() * Math.max(0, screenW - logoW);
    let y = Math.random() * Math.max(0, screenH - logoH);
    let dirX = Math.random() < 0.5 ? -1 : 1;
    let dirY = Math.random() < 0.5 ? -1 : 1;

    const detector = createKickDetector(engine.context, engine.bus);
    const loudness = createLevelMeter(engine.analyser);
    let pulse = 0;
    // Spring state: tilt angles (deg) around the X and Y axes and their velocities.
    let tiltX = 0;
    let tiltY = 0;
    let spinX = 0;
    let spinY = 0;
    const omega = 2 * Math.PI * WOBBLE_HZ;
    let elapsed = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Clamp so a stalled tab doesn't produce one huge step.
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const step = (DRIFT_SPEED * screenH * dt) / Math.SQRT2;
      const minX = pulseMargin(logoW);
      const minY = pulseMargin(logoH);
      const maxX = Math.max(minX, screenW - logoW - minX);
      const maxY = Math.max(minY, screenH - logoH - minY);
      x += dirX * step;
      y += dirY * step;
      if (x <= minX) [x, dirX] = [minX, 1];
      else if (x >= maxX) [x, dirX] = [maxX, -1];
      if (y <= minY) [y, dirY] = [minY, 1];
      else if (y >= maxY) [y, dirY] = [maxY, -1];

      // Read each frame so -/= adjustments apply immediately.
      const { hit, level } = detector.read(dt, getSettings().kickSensitivity);
      pulse *= Math.exp(-dt / PULSE_DECAY_SECONDS);
      // A hit's level already cleared the detector's peak-fraction threshold.
      if (hit) pulse = Math.max(pulse, level);

      // Lean into the direction of travel: rotating around Y turns the leading side
      // away, around X tips the top or bottom.
      const leanY = dirX * LEAN_DEG;
      const leanX = -dirY * LEAN_DEG;
      if (hit) {
        const angle = Math.random() * 2 * Math.PI;
        spinX += Math.cos(angle) * KICK_SPIN * level;
        spinY += Math.sin(angle) * KICK_SPIN * level;
      }
      // Semi-implicit Euler: update velocity first, then position. Stable at these
      // stiffnesses even with the 100 ms dt clamp.
      spinX += (-omega * omega * (tiltX - leanX) - 2 * WOBBLE_DAMPING * omega * spinX) * dt;
      spinY += (-omega * omega * (tiltY - leanY) - 2 * WOBBLE_DAMPING * omega * spinY) * dt;
      tiltX += spinX * dt;
      tiltY += spinY * dt;

      elapsed += dt;
      const sway = SWAY_DEG * (SWAY_IDLE + (1 - SWAY_IDLE) * loudness.read(dt));
      const clampTilt = (deg: number) => Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, deg));
      const rotateX = clampTilt(tiltX + sway * Math.sin(elapsed * 1.3));
      const rotateY = clampTilt(tiltY + sway * Math.sin(elapsed * 0.9 + 1));

      // Only transform and opacity change per frame, so this stays on the compositor.
      moverEl.style.transform = `translate(${x}px, ${y}px)`;
      pulseEl.style.transform =
        `perspective(${PERSPECTIVE_PX}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) ` +
        `scale(${1 + pulse * KICK_SCALE + level * LEVEL_SCALE})`;
      glowEl.style.opacity = String(Math.min(1, pulse * 0.9 + level * LEVEL_GLOW));
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      detector.dispose();
    };
  }, [engine]);

  return (
    <div ref={overlayRef} className={visible ? "logo-overlay" : "logo-overlay hidden"}>
      <div ref={moverRef} className="logo-mover">
        <div ref={pulseRef} className="logo-pulse">
          <img ref={glowRef} className="logo-glow" src={logoUrl} alt="" draggable={false} />
          <img className="logo" src={logoUrl} alt="Men Amongst Kings" draggable={false} />
        </div>
      </div>
    </div>
  );
}
