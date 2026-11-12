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

// ---------------------------------------------------------------------------------------------
// Suara latar bertema: ketukan + pad + arpeggio + bas, disintesis per video sepanjang durasinya.
// Bukan musik berlisensi: semua nada dibuat dari gelombang sinus/derau di sini.

const MOODS = {
  // Korporat/teknologi (Langkah demi Langkah, Motion Grafis, Sorotan Produk).
  corporate: { bpm: 116, chords: [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67]], bass: [38, 34, 41, 36], kick: [0, 2], snare: [1, 3], hat: true, pluck: 2 },
  // Promo energik (Promo Harga, Slideshow Katalog).
  energetic: { bpm: 124, chords: [[67, 71, 74], [62, 66, 69], [64, 67, 71], [60, 64, 67]], bass: [43, 38, 40, 36], kick: [0, 1, 2, 3], snare: [1, 3], hat: true, pluck: 2 },
  // Tenang/hangat (Cerita Bertahap, Pengumuman).
  calm: { bpm: 92, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], bass: [36, 33, 29, 31], kick: [0], snare: [], hat: false, pluck: 1 },
  // Ceria: mayor terang, pluck rapat.
  upbeat: { bpm: 128, chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [65, 69, 72]], bass: [36, 41, 43, 41], kick: [0, 1, 2, 3], snare: [1, 3], hat: true, pluck: 3 },
  // Elegan/sinematik: minor lambat, pad tebal.
  cinematic: { bpm: 84, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [33, 29, 24, 31], kick: [0], snare: [2], hat: false, pluck: 1 },
  // Santai (lo-fi): akor jazzy, ketukan longgar.
  chill: { bpm: 88, chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]], bass: [38, 31, 36, 33], kick: [0, 2.5], snare: [1, 3], hat: true, pluck: 1 },
};

export const MOOD_NAMES = ["corporate", "energetic", "calm", "upbeat", "cinematic", "chill"];
export const MOOD_OF = {
  steps: "corporate",
  motion: "corporate",
  showcase: "corporate",
  promo: "energetic",
  catalog: "energetic",
  story: "calm",
  announce: "calm",
};

const midi = (m) => 440 * 2 ** ((m - 69) / 12);

/** Tambah satu peristiwa suara (fungsi waktu-lokal) ke buffer mulai detik `at`. */
function add(buf, at, seconds, fn) {
  const start = Math.round(at * SR);
  const n = Math.min(Math.round(seconds * SR), buf.length - start);
  for (let i = 0; i < n; i++) buf[start + i] += fn(i / SR, i);
}

/** RNG deterministik (mulberry32) — benih sama = musik sama; benih beda = variasi. */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Variasi per video dari satu suasana: nada dasar digeser (−5…+6 semiton), tempo ±8%,
 * urutan akor diputar/dibalik, pola arpeggio & hi-hat berganti. Tetap bebas lisensi.
 */
export function varyMood(base, seed) {
  if (!seed) return base;
  const r = rng(seed);
  const shift = Math.floor(r() * 12) - 5;
  const rot = Math.floor(r() * base.chords.length);
  const reverse = r() < 0.35;
  const order = base.chords.map((_, i) => (i + rot) % base.chords.length);
  if (reverse) order.reverse();
  return {
    ...base,
    bpm: Math.round(base.bpm * (0.92 + r() * 0.16)),
    chords: order.map((i) => base.chords[i].map((n) => n + shift)),
    bass: order.map((i) => base.bass[i] + shift),
    pluck: Math.max(1, Math.min(3, base.pluck + (r() < 0.3 ? 1 : r() < 0.2 ? -1 : 0))),
    hat: base.hat ? r() > 0.15 : r() < 0.2,
    arpUp: r() < 0.5,
  };
}

export function makeBed(seconds, moodName = "corporate", variant = 0) {
  const m = varyMood(MOODS[moodName] || MOODS.corporate, variant);
  seed = (variant || 22222) >>> 0; // derau drum ikut benih → hasil bisa diulang
  const total = Math.max(1, Math.ceil(seconds * SR));
  const buf = new Float32Array(total);
  const beat = 60 / m.bpm;
  const bar = beat * 4;
  const bars = Math.ceil(seconds / bar);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const ci = b % m.chords.length;
    const chord = m.chords[ci];
    const first = b === 0;
    // Pad: tiga harmoni lembut per nada, naik turun pelan sepanjang satu bar.
    for (const note of chord) {
      const f = midi(note);
      add(buf, t0, bar + 0.4, (t) => {
        const env = Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (bar + 0.4 - t) / 0.45));
        return env * 0.035 * (Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * f * 2.003 * t) + 0.2 * Math.sin(2 * Math.PI * f * 0.997 * t));
      });
    }
    // Bas mengikuti akar akor, per ketukan.
    for (let k = 0; k < 4; k++) {
      const f = midi(m.bass[ci]);
      add(buf, t0 + k * beat, beat, (t) => Math.exp(-t * 3.2) * Math.min(1, t / 0.01) * 0.16 * Math.sin(2 * Math.PI * f * t));
    }
    // Arpeggio "pluck" (1/8 atau 1/4), satu oktaf di atas akor.
    const steps = 4 * m.pluck;
    for (let k = 0; k < steps; k++) {
      const idx = m.arpUp === false ? chord.length - 1 - (k % chord.length) : k % chord.length;
      const f = midi(chord[idx] + 12 + (k % (chord.length * 2) >= chord.length ? 12 : 0));
      add(buf, t0 + (k * beat) / m.pluck, 0.5, (t) => Math.exp(-t * 9) * Math.min(1, t / 0.004) * 0.05 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)));
    }
    if (first) continue; // bar pertama tanpa drum: pembuka yang lebih lembut
    for (const k of m.kick) {
      let ph = 0;
      add(buf, t0 + k * beat, 0.32, (t) => {
        ph += (2 * Math.PI * (48 + 90 * Math.exp(-t * 28))) / SR;
        return Math.exp(-t * 11) * 0.42 * Math.sin(ph);
      });
    }
    for (const k of m.snare) {
      let lp = 0;
      add(buf, t0 + k * beat, 0.18, (t) => {
        lp += 0.35 * (rnd() - lp);
        return Math.exp(-t * 22) * 0.1 * (rnd() - lp);
      });
    }
    if (m.hat)
      for (let k = 0; k < 8; k++) {
        let prev = 0;
        add(buf, t0 + (k * beat) / 2, 0.05, (t) => {
          const x = rnd();
          const hp = x - prev;
          prev = x;
          return Math.exp(-t * 70) * (k % 2 ? 0.05 : 0.03) * hp;
        });
      }
  }
  // Penutup: akor akhir yang menggantung, lalu normalisasi dengan pembatas lembut.
  const end = Math.max(0, seconds - 1.6);
  for (const note of m.chords[0]) {
    const f = midi(note);
    add(buf, end, 1.6, (t) => Math.exp(-t * 1.6) * 0.05 * Math.sin(2 * Math.PI * f * t));
  }
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const g = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < total; i++) buf[i] = Math.tanh(buf[i] * g * 1.2) * 0.85;
  return buf;
}

/** Tulis suara latar sebagai WAV ke `file` (dipakai lib.mjs per render). */
export function writeBed(file, seconds, moodName, variant = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wav(makeBed(seconds, moodName, variant)));
  return file;
}
