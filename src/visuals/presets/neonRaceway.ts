import type { Preset } from "butterchurn";
import { HASH_GLSL, KICK_EQS, KICK_INIT } from "./shaderLib";

// A Tron/synthwave raceway in vaporwave cyan and magenta: a neon grid racing toward
// the viewer, a striped sun sinking into the horizon, and two light cycles weaving
// down the track. Stateless; the frame equations feed it:
// - q1: distance travelled. Bass speeds the ride up.
// - q2: kick flash (grid and sun pulse).

const frameEqs = `
${KICK_EQS}
a.travel += (1.6 + 4 * Math.max(0, a.bass_att - 0.8)) * dt;
a.flash = Math.max(a.flash * Math.pow(0.01, dt), a.hit * Math.min(1, a.bass - 0.8));
a.q1 = a.travel;
a.q2 = a.flash;
`;

const comp = `
${HASH_GLSL}

const vec3 CYAN = vec3(0.0, 0.95, 1.0);
const vec3 MAGENTA = vec3(1.0, 0.1, 0.8);
const vec3 SKY_TOP = vec3(0.02, 0.0, 0.07);
const vec3 SKY_LOW = vec3(0.35, 0.02, 0.35);
const vec3 SUN_TOP = vec3(1.0, 0.7, 0.95);
#define HORIZON 0.08
// World-space half width of the track; its edges are the magenta rails.
#define TRACK 1.4

// Antialiased line of half-width w at distance d, given d's screen-space rate.
float neonLine(float d, float w, float fw) {
  return 1.0 - smoothstep(w, w + fw * 1.5, d);
}

shader_body {
  float aspectR = resolution.x / resolution.y;
  // y up, 0 at the middle of the screen.
  vec2 p = vec2((uv.x - 0.5) * aspectR, 0.5 - uv.y);
  float sky = step(HORIZON, p.y);

  // ---- Sky: gradient, twinkling stars, and the sun.
  float h = max(p.y - HORIZON, 0.0);
  vec3 skyCol = mix(SKY_LOW, SKY_TOP, smoothstep(0.0, 0.42, h));
  vec2 starCell = floor(uv * resolution / 3.0);
  float star = step(0.996, hash21(starCell))
             * (0.4 + 0.6 * sin(time * 2.5 + hash21(starCell + 1.0) * 40.0));
  skyCol += vec3(0.8, 0.9, 1.0) * max(star, 0.0) * smoothstep(0.08, 0.3, h) * (0.6 + 0.5 * treb_att);

  vec2 sp = p - vec2(0.0, HORIZON + 0.16);
  float sunR = 0.25 * (1.0 + 0.03 * q2);
  float sd = length(sp);
  float sy = sp.y / sunR; // -1 at the bottom of the sun, 1 at the top
  // Horizontal cuts across the lower half that widen toward the horizon and drift down.
  float cut = mix(0.0, 0.5, clamp((0.25 - sy) / 1.25, 0.0, 1.0));
  float stripes = step(cut, fract(sy * 7.0 + time * 0.25));
  float sun = (1.0 - smoothstep(sunR - 0.003, sunR, sd)) * stripes;
  skyCol = mix(skyCol, mix(MAGENTA, SUN_TOP, smoothstep(-0.8, 0.9, sy)), sun);
  skyCol += MAGENTA * exp(-max(sd - sunR, 0.0) * 9.0) * (0.3 + 0.3 * q2);

  // ---- Ground: perspective grid, rails, light cycles.
  float below = max(HORIZON - p.y, 0.002);
  float z = 0.4 / below;              // depth
  float x = p.x * z;                  // world x
  float zw = z + q1;                  // world z, scrolling toward the viewer
  float fade = exp(-z * 0.09);

  vec2 gw = vec2(x, zw);
  vec2 gfw = fwidth(gw);
  vec2 gd = abs(fract(gw - 0.5) - 0.5);
  float grid = max(neonLine(gd.x, 0.02, gfw.x), neonLine(gd.y, 0.02, gfw.y));
  vec3 groundCol = vec3(0.02, 0.0, 0.05);
  groundCol += CYAN * grid * fade * (0.55 + 0.9 * q2);

  float fx = fwidth(x);
  float rail = neonLine(abs(abs(x) - TRACK), 0.04, fx);
  groundCol += MAGENTA * (rail * 1.4 + exp(-abs(abs(x) - TRACK) * 6.0) * 0.25) * fade;

  // Two light cycles, one of each colour, weaving down the track ahead of us. Their
  // trails run from the viewer back to each cycle.
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float path = 0.85 * sin(zw * 0.35 + fk * 2.6) * (fk == 0.0 ? 1.0 : -1.0);
    float headZ = 7.0 + 2.5 * sin(time * 0.4 + fk * 1.9);
    float d = abs(x - path);
    float onTrail = step(z, headZ);
    vec3 c = fk == 0.0 ? CYAN : MAGENTA;
    groundCol += c * (neonLine(d, 0.035, fx) * 1.6 + exp(-d * 10.0) * 0.35) * onTrail * fade * 1.4;
    float head = exp(-length(vec2(d, (z - headZ) * 0.25)) * 18.0);
    groundCol += mix(c, vec3(1.0), 0.5) * head * 2.0;
  }

  // Magenta haze where the ground meets the sky.
  groundCol += MAGENTA * exp(-(HORIZON - p.y) * 28.0) * 0.55;

  ret = mix(groundCol, skyCol, sky);
}
`;

export const neonRaceway: Preset = {
  baseVals: { decay: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0 },
  shapes: [],
  waves: [],
  init_eqs_str: `${KICK_INIT}a.travel=0;a.flash=0;`,
  frame_eqs_str: frameEqs,
  pixel_eqs_str: "",
  warp: "shader_body {\n  ret = vec3(0.0);\n}\n",
  comp,
};
