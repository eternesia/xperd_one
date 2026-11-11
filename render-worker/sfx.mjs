// Efek suara pendek (whoosh, pop, tik, denting…) disintesis dari nol → tidak ada berkas audio berlisensi.
// Ditulis sebagai WAV 44,1 kHz mono ke folder publik bundel Remotion (dipakai `staticFile("sfx/…")`).
import fs from "node:fs";
import path from "node:path";

const SR = 44100;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Bangun suara dari fungsi (t detik, p 0..1) → amplitudo; fase dijaga agar sapuan nada mulus. */
function tone(seconds, fn) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i / n, i);
  return out;
}

/** Osilator sinus dengan frekuensi yang berubah terhadap waktu. */
function sweep(seconds, freq, env, gain = 0.5) {
  let phase = 0;
  return tone(seconds, (t, p) => {
    phase += (2 * Math.PI * freq(p)) / SR;
    return Math.sin(phase) * env(p) * gain;
  });
}

// Derau acak tetap (seed) supaya hasil selalu sama.
let seed = 1234567;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const SOUNDS = {
  // Desis angin: derau dengan filter yang menyapu naik lalu turun.
  whoosh: () => {
    let lo = 0;
    let lo2 = 0;
    return tone(0.42, (t, p) => {
      const cut = 0.02 + 0.3 * Math.sin(Math.PI * p) ** 2;
      const x = rnd();
      lo += cut * (x - lo);
      lo2 += cut * 0.35 * (x - lo2);
      return (lo - lo2) * Math.sin(Math.PI * p) ** 1.5 * 0.9;
    });
  },
  pop: () => sweep(0.14, (p) => 620 - 400 * p, (p) => Math.exp(-p * 7) * Math.min(1, p * 60), 0.55),
  tick: () => sweep(0.05, () => 1500, (p) => Math.exp(-p * 9) * Math.min(1, p * 40), 0.3),
  rise: () => sweep(0.55, (p) => 220 + 620 * p * p, (p) => Math.sin(Math.PI * p) ** 2, 0.3),
  thud: () => sweep(0.4, (p) => 95 - 50 * p, (p) => Math.exp(-p * 6) * Math.min(1, p * 80), 0.75),
  // Denting dua nada (kuint) dengan gema pendek.
  ding: () => {
    const a = sweep(0.9, () => 880, (p) => Math.exp(-p * 6) * Math.min(1, p * 200), 0.3);
    const b = sweep(0.9, () => 1318.5, (p) => Math.exp(-p * 8) * Math.min(1, p * 200), 0.2);
    return a.map((v, i) => v + b[i]);
  },
};

export const SFX_NAMES = Object.keys(SOUNDS);

export function writeSfx(publicDir) {
  const dir = path.join(publicDir, "sfx");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, make] of Object.entries(SOUNDS))
    fs.writeFileSync(path.join(dir, `${name}.wav`), wav(make()));
  return dir;
}
