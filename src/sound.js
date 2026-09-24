/**
 * 効果音。音声ファイルは持たず、すべて WebAudio で合成する。
 *
 * 方針:
 *  - 宇宙らしい響きにしたいので、手続きで作った残響を通す
 *  - 座標を動かす音は「次元ごとに音程を変える」。どの軸を動かしたかが耳で分かる
 *  - 音程は必ずドレミファソラシド (長音階) の上に置く。音階から外れた高さや、
 *    高さの間を滑らせる音 (ポルタメント) は、それだけで濁って聞こえる
 *  - ブラウザの自動再生制限があるので、最初の操作まで AudioContext を作らない
 */

const STORAGE_KEY = 'coordmaze.sound';
// ドレミファソラシド (長音階) の半音の並び。軸ごとに 1 音ずつ上がる。
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const BASE_HZ = 261.63;        // C4 (ド)。A4 = 440Hz の音律

let ctx = null;
let master = null;
let wet = null;
let offline = false;   // OfflineAudioContext で鳴らしているか (テスト用)
let lastAt = 0;
let enabled = readPref();
setAudioSession(enabled);

function readPref() {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}
function writePref(v) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* 保存できなくても鳴らせる */ }
}

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、効果音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
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

function connect(node, send, pan = 0) {
  // pan は音の来る向き (-1 左 / +1 右)。対応していないブラウザでは中央のまま鳴らす。
  let out = node;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    out = p;
  }
  out.connect(master);
  if (send > 0) {
    const g = ctx.createGain();
    g.gain.value = send;
    out.connect(g);
    g.connect(wet);
  }
}

function tone({ freq, dur = 0.22, type = 'sine', gain = 0.5, send = 0.5, at = null, pan = 0 }) {
  const t = at ?? slot();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  connect(g, send, pan);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, from = 900, to = 300, q = 2, gain = 0.4, send = 0.4, at = null, pan = 0 }) {
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
  connect(g, send, pan);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/**
 * 軸番号 → 周波数。ドから順に 1 音ずつ上げていく。
 * 10 次元なら ド レ ミ ファ ソ ラ シ ド レ ミ。どれも音階の上なので、
 * どの順に鳴らしても、重なっても濁らない。
 */
function axisHz(index) {
  const i = Math.max(0, index);
  const semi = MAJOR[i % MAJOR.length] + 12 * Math.floor(i / MAJOR.length);
  return BASE_HZ * Math.pow(2, semi / 12);
}

// state を見て弾かない。まだ resume 前でも予約しておけば、
// 再開した瞬間に鳴る (「最初の 1 音だけ鳴らない」を避ける)。
const play = (fn) => { if (enabled && ensure()) fn(); };

export const sound = {
  get enabled() { return enabled; },

  /** 最初の操作で呼ぶ。自動再生制限の解除。 */
  unlock() {
    if (!enabled) return;
    setAudioSession(true);
    if (!ensure()) return;
    // 一部の状態では resume() が例外を投げる。鳴らせなくても進行は止めない。
    try { if (!offline && ctx.state === 'suspended') ctx.resume(); } catch { /* noop */ }
  },

  toggle() {
    enabled = !enabled;
    writePref(enabled);
    setAudioSession(enabled);
    if (enabled) { this.unlock(); this.ui(); }
    return enabled;
  },

  /**
   * 座標をひとつ動かした。音程はその軸の音 (ドレミ…) ちょうど。
   *
   * 左右は「同じ 2 音を鳴らす順番」で表す:
   *   右へ … その軸の音 → 1 オクターブ上   (上がっていく)
   *   左へ … 1 オクターブ上 → その軸の音   (下りてくる)
   * 使う高さは左右で同じなので、どちらかが低く (＝後戻りに) 聞こえることはない。
   * 音の来る向きも左右に振って、耳でも向きが分かるようにしてある。
   *
   * 以前はここで「1 音ぶん下から滑り込ませる」ことで向きを出していたが、
   * 滑っている間は音階から外れた高さが鳴るので、濁って聞こえていた。
   */
  move(index, dir) {
    play(() => {
      const hz = axisHz(index);
      const right = dir > 0;
      const pan = right ? 0.35 : -0.35;
      const t = slot();
      const first = right ? hz : hz * 2;
      const second = right ? hz * 2 : hz;
      tone({ freq: first, dur: 0.26, type: 'triangle', gain: 0.40, send: 0.55, at: t, pan });
      tone({ freq: second, dur: 0.20, type: 'sine', gain: 0.18, send: 0.45, at: t + 0.055, pan });
    });
  },

  /** 壁にぶつかった。ぶつかった感じを出すノイズと、低いド。 */
  blocked() {
    play(() => {
      noise({ dur: 0.13, from: 420, to: 130, q: 1.2, gain: 0.26, send: 0.2 });
      tone({ freq: BASE_HZ / 2, dur: 0.14, type: 'sine', gain: 0.24, send: 0.15, at: lastAt });
    });
  },

  /** 1 手戻した。ソ → ド と下りる (滑らせず、音階の上を 2 音で)。 */
  undo() {
    play(() => {
      const t = slot();
      tone({ freq: BASE_HZ * Math.pow(2, 7 / 12), dur: 0.14, type: 'sine', gain: 0.20, send: 0.35, at: t });
      tone({ freq: BASE_HZ, dur: 0.18, type: 'sine', gain: 0.18, send: 0.35, at: t + 0.06 });
    });
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

  /** ボタンなどの小さな反応。1 オクターブ上のミ。 */
  ui() {
    play(() => tone({ freq: BASE_HZ * 2 * Math.pow(2, 4 / 12), dur: 0.09, type: 'sine', gain: 0.14, send: 0.3 }));
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
