/**
 * 効果音。音声ファイルは持たず、すべて WebAudio で合成する。
 *
 * 方針:
 *  - 宇宙らしい響きにしたいので、手続きで作った残響を通す
 *  - 座標を動かす音は「次元ごとに音程を変える」。どの軸を動かしたかが耳で分かる
 *  - 音程はペンタトニックに乗せるので、何次元でも、どの順に鳴らしても濁らない
 *  - ブラウザの自動再生制限があるので、最初の操作まで AudioContext を作らない
 */

const STORAGE_KEY = 'coordmaze.sound';
const PENTA = [0, 2, 4, 7, 9]; // 長音階から 4 度と 7 度を抜いた音の並び
const BASE_HZ = 262;           // C4

let ctx = null;
let master = null;
let wet = null;
let offline = false;   // OfflineAudioContext で鳴らしているか (テスト用)
let lastAt = 0;
let enabled = readPref();

function readPref() {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}
function writePref(v) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* 保存できなくても鳴らせる */ }
}

/** 減衰するノイズから残響用のインパルス応答を作る。 */
function makeImpulse(seconds = 1.6, decay = 3.2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return buf;
}

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  offline = typeof ctx.startRendering === 'function';
  master = ctx.createGain();
  master.gain.value = 0.34;
  master.connect(ctx.destination);

  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse();
  wet = ctx.createGain();
  wet.gain.value = 0.3;
  wet.connect(conv);
  conv.connect(master);
  return true;
}

/** 同じ瞬間に音が重なって潰れないよう、わずかにずらして並べる。 */
function slot() {
  const now = ctx.currentTime;
  lastAt = Math.max(now, lastAt + 0.014);
  return lastAt;
}

function connect(node, send) {
  node.connect(master);
  if (send > 0) {
    const g = ctx.createGain();
    g.gain.value = send;
    node.connect(g);
    g.connect(wet);
  }
}

function tone({ freq, dur = 0.22, type = 'sine', gain = 0.5, slideTo = null, send = 0.5, at = null }) {
  const t = at ?? slot();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  connect(g, send);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, from = 900, to = 300, q = 2, gain = 0.4, send = 0.4, at = null }) {
  const t = at ?? slot();
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g);
  connect(g, send);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** 軸番号 → 周波数。ペンタトニックを下から順に割り当てる。 */
function axisHz(index, total) {
  const i = Math.max(0, index);
  const semi = PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length);
  // 次元数が多いときは音域が上がりすぎないよう少し下げる
  const shift = total > 8 ? -12 : 0;
  return BASE_HZ * Math.pow(2, (semi + shift) / 12);
}

// state を見て弾かない。まだ resume 前でも予約しておけば、
// 再開した瞬間に鳴る (「最初の 1 音だけ鳴らない」を避ける)。
const play = (fn) => { if (enabled && ensure()) fn(); };

export const sound = {
  get enabled() { return enabled; },

  /** 最初の操作で呼ぶ。自動再生制限の解除。 */
  unlock() {
    if (!enabled) return;
    if (!ensure()) return;
    // 一部の状態では resume() が例外を投げる。鳴らせなくても進行は止めない。
    try { if (!offline && ctx.state === 'suspended') ctx.resume(); } catch { /* noop */ }
  },

  toggle() {
    enabled = !enabled;
    writePref(enabled);
    if (enabled) { this.unlock(); this.ui(); }
    return enabled;
  },

  /** 座標をひとつ動かした。音程が次元、明るさが向き。 */
  move(index, total, dir) {
    play(() => {
      const hz = axisHz(index, total);
      if (dir > 0) {
        tone({ freq: hz, dur: 0.26, type: 'triangle', gain: 0.30, send: 0.55 });
        tone({ freq: hz * 2, dur: 0.14, type: 'sine', gain: 0.10, send: 0.4, at: lastAt });
      } else {
        // 戻る手。音程は進む手と同じ高さのまま、下がる動きと丸い音色で区別する。
        // 1 オクターブ下げるとスマホのスピーカーでは鳴っていないように聞こえる。
        tone({ freq: hz, slideTo: hz * 0.84, dur: 0.24, type: 'sine', gain: 0.30, send: 0.5 });
        tone({ freq: hz / 2, dur: 0.20, type: 'sine', gain: 0.12, send: 0.4, at: lastAt });
      }
    });
  },

  /** 壁にぶつかった。 */
  blocked() {
    play(() => {
      noise({ dur: 0.13, from: 420, to: 130, q: 1.2, gain: 0.26, send: 0.2 });
      tone({ freq: 96, dur: 0.14, type: 'sine', gain: 0.24, send: 0.15, at: lastAt });
    });
  },

  /** 1 手戻した。 */
  undo() {
    play(() => tone({ freq: 300, slideTo: 190, dur: 0.16, type: 'sine', gain: 0.20, send: 0.35 }));
  },

  /** ヒント。 */
  hint() {
    play(() => {
      const t0 = slot();
      [0, 4, 7].forEach((s, k) =>
        tone({ freq: BASE_HZ * 2 * Math.pow(2, s / 12), dur: 0.5, type: 'sine',
               gain: 0.12, send: 0.8, at: t0 + k * 0.05 }));
    });
  },

  /** 建物 (w 軸) の移動。この作品の要なので、いちばん印象に残る音にする。 */
  warp(dir) {
    play(() => {
      const t = slot();
      const up = dir > 0;
      noise({ dur: 0.62, from: up ? 240 : 2600, to: up ? 3000 : 200, q: 3.5, gain: 0.30, send: 0.9, at: t });
      tone({ freq: up ? 150 : 700, slideTo: up ? 700 : 150, dur: 0.6, type: 'triangle', gain: 0.22, send: 0.9, at: t });
      tone({ freq: up ? 600 : 300, dur: 0.9, type: 'sine', gain: 0.10, send: 1.0, at: t + 0.12 });
    });
  },

  /** 部屋をひとつ移った (3D 迷路)。ごく小さく。 */
  step() {
    play(() => noise({ dur: 0.06, from: 1700, to: 850, q: 1.4, gain: 0.11, send: 0.2 }));
  },

  /** 手順やチェックの達成。 */
  chime() {
    play(() => {
      const t0 = slot();
      [0, 7].forEach((s, k) =>
        tone({ freq: BASE_HZ * 2 * Math.pow(2, s / 12), dur: 0.42, type: 'sine',
               gain: 0.16, send: 0.7, at: t0 + k * 0.07 }));
    });
  },

  /** クリア。 */
  win() {
    play(() => {
      const t0 = slot();
      [0, 4, 7, 12, 16].forEach((s, k) => {
        tone({ freq: BASE_HZ * Math.pow(2, s / 12), dur: 0.8, type: 'triangle',
               gain: 0.22, send: 0.9, at: t0 + k * 0.1 });
      });
    });
  },

  /** ボタンなどの小さな反応。 */
  ui() {
    play(() => tone({ freq: 660, dur: 0.09, type: 'sine', gain: 0.14, send: 0.3 }));
  },
};

/** 最初の操作で音を使えるようにしておく。 */
export function armSound() {
  const once = () => {
    sound.unlock();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}
