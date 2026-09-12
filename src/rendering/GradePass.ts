import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Final colour grade: lens-style chromatic aberration, vignette and a light grain.
 * Runs in linear space, before OutputPass performs tone mapping and sRGB conversion.
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0.0016 },
    uVignette: { value: 1.15 },
    uGrain: { value: 0.03 },
    uTime: { value: 0 },
    uEnergy: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    uniform float uEnergy;
    varying vec2 vUv;

    void main() {
      vec2 centre = vUv - 0.5;
      float dist = length(centre);
      vec2 dir = dist > 0.0001 ? centre / dist : vec2(0.0);
      // Louder passages separate the channels further, like a lens under load.
      float offset = uAberration * (1.0 + uEnergy * 2.2) * dist;

      vec3 colour;
      colour.r = texture2D(tDiffuse, vUv + dir * offset).r;
      colour.g = texture2D(tDiffuse, vUv).g;
      colour.b = texture2D(tDiffuse, vUv - dir * offset).b;

      float vig = 1.0 - smoothstep(0.34, 0.92, dist * uVignette);
      colour *= mix(1.0, vig, 0.85);

      float grain = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      colour += grain * uGrain * (0.4 + uEnergy);

      gl_FragColor = vec4(colour, 1.0);
    }
  `,
};

export function createGradePass(): ShaderPass {
  return new ShaderPass(GradeShader);
}
