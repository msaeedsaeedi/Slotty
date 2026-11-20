"use client";

import { useEffect, useRef } from "react";

/*
 * The hero's light: slow, warm haze drifting under a light from above, like a terminal hall at
 * night. A WebGL fragment shader (no library) rendered at reduced resolution, ~30 fps, only while
 * the hero is on screen and the tab is visible. Reduced motion draws one still frame. Without
 * WebGL or JavaScript, the CSS light on .lp-hero stays.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.035;

  // Domain-warped haze.
  vec2 q = vec2(fbm(p * 1.2 + t), fbm(p * 1.2 - t + 3.1));
  float n = fbm(p * 1.5 + 1.9 * q + vec2(t * 0.6, -t * 0.4));

  // A soft light from above the headline.
  float spot = exp(-3.0 * length((uv - vec2(0.5, 1.06)) * vec2(1.2, 1.8)));

  vec3 base = vec3(0.051, 0.051, 0.047);
  vec3 warm = vec3(0.205, 0.188, 0.158);
  vec3 col = base + warm * (spot * 0.5 + n * n * 0.3 * (0.3 + spot));

  // Back to the plain board at the bottom, so the next section continues seamlessly.
  col = mix(base, col, smoothstep(0.0, 0.4, uv.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const SCALE = 0.5; // render at half resolution; the haze is soft, so it upsamples cleanly

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

export function HeroShader() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl || gl.isContextLost()) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    const draw = (seconds: number) => {
      resize();
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.ready = "true";
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now() - 20_000; // start mid-drift, not at the noise origin
    let frame = 0;
    let last = 0;
    let onScreen = true;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!onScreen || document.hidden || now - last < 33) return;
      last = now;
      draw((now - start) / 1000);
    };

    const io = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    io.observe(canvas);
    const ro = new ResizeObserver(() => still && draw(20));
    ro.observe(canvas);

    if (still) draw(20);
    else frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      // No forced context loss: a remount (React dev mode mounts twice) gets this same canvas
      // back, and a lost context can't draw. The browser frees it when the canvas goes away.
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="lp-hero-canvas pointer-events-none absolute inset-0 -z-10 size-full" />;
}
