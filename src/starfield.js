/**
 * 背景の星空。全ページ共通で敷く。
 *
 * 遊びの邪魔にならないことを最優先にしてある:
 *  - 動きは「ほぼ気づかない」速さ (奥の層ほど遅い視差)
 *  - タブが隠れている間は止める
 *  - prefers-reduced-motion なら完全に静止させる
 */

const LAYERS = [
  { count: 120, size: [0.5, 0.9], speed: 0.8,  alpha: [0.18, 0.40], parallax: 4 },
  { count: 70,  size: [0.8, 1.4], speed: 1.8,  alpha: [0.30, 0.62], parallax: 10 },
  { count: 26,  size: [1.2, 2.1], speed: 3.2,  alpha: [0.50, 0.92], parallax: 20 },
];

// 星の色は白一色にせず、青白い星と赤みのある星を混ぜると奥行きが出る。
const TINTS = [
  [255, 255, 255], [214, 232, 255], [255, 240, 214],
  [190, 214, 255], [255, 214, 226],
];

const rand = (a, b) => a + Math.random() * (b - a);

export function startStarfield(canvas, { shootingStars = true } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1;
  let stars = [];
  let shooter = null;
  let nextShot = performance.now() + rand(9000, 20000);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function build() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    stars = [];
    // 画面が広いほど星も増やす (1280x800 を基準にする)
    const scale = Math.max(0.6, Math.min(2.2, (w * h) / (1280 * 800)));
    for (let li = 0; li < LAYERS.length; li++) {
      const L = LAYERS[li];
      for (let i = 0; i < L.count * scale; i++) {
        const tint = TINTS[(Math.random() * TINTS.length) | 0];
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: rand(L.size[0], L.size[1]),
          a: rand(L.alpha[0], L.alpha[1]),
          tint,
          layer: li,
          phase: Math.random() * Math.PI * 2,
          twinkle: rand(0.25, 0.9),
          flare: L === LAYERS[2] && Math.random() < 0.35,
        });
      }
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, w, h);
    const t = now / 1000;

    // ポインタ視差はゆっくり追従させる (急に動くと酔う)
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    for (const s of stars) {
      const L = LAYERS[s.layer];
      if (!reduced) {
        // 右下へゆっくり流す。画面外に出たら反対側から戻す。
        s.y += (L.speed * 0.0042);
        s.x += (L.speed * 0.0016);
        if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
        if (s.x > w + 2) { s.x = -2; }
      }
      const twinkle = reduced ? 1 : 0.72 + 0.28 * Math.sin(t * s.twinkle + s.phase);
      const px = s.x + pointer.x * L.parallax;
      const py = s.y + pointer.y * L.parallax;
      const [r, g, b] = s.tint;
      ctx.fillStyle = `rgba(${r},${g},${b},${s.a * twinkle})`;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();

      // 明るい星だけ十字の光条をつける
      if (s.flare) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${s.a * twinkle * 0.35})`;
        ctx.lineWidth = 0.6;
        const len = s.r * 4.5;
        ctx.beginPath();
        ctx.moveTo(px - len, py); ctx.lineTo(px + len, py);
        ctx.moveTo(px, py - len); ctx.lineTo(px, py + len);
        ctx.stroke();
      }
    }

    if (shootingStars && !reduced) drawShooter(now);
  }

  function drawShooter(now) {
    if (!shooter && now > nextShot) {
      const fromLeft = Math.random() < 0.5;
      shooter = {
        x: fromLeft ? -40 : w + 40,
        y: rand(0, h * 0.55),
        vx: (fromLeft ? 1 : -1) * rand(340, 520),
        vy: rand(120, 220),
        life: 0,
        span: rand(0.7, 1.1),
        last: now,
      };
    }
    if (!shooter) return;
    const dt = Math.min(0.05, (now - shooter.last) / 1000);
    shooter.last = now;
    shooter.life += dt;
    shooter.x += shooter.vx * dt;
    shooter.y += shooter.vy * dt;
    const k = shooter.life / shooter.span;
    if (k >= 1 || shooter.x < -120 || shooter.x > w + 120) {
      shooter = null;
      nextShot = now + rand(9000, 20000);
      return;
    }
    const fade = Math.sin(Math.PI * k) * 0.75;
    const tailX = shooter.x - shooter.vx * 0.055;
    const tailY = shooter.y - shooter.vy * 0.055;
    const grad = ctx.createLinearGradient(tailX, tailY, shooter.x, shooter.y);
    grad.addColorStop(0, 'rgba(160,220,255,0)');
    grad.addColorStop(1, `rgba(220,240,255,${fade})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(shooter.x, shooter.y);
    ctx.stroke();
  }

  let raf = 0;
  let running = false;
  const loop = (now) => { draw(now); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  build();
  draw(performance.now());
  start();

  window.addEventListener('resize', () => { build(); draw(performance.now()); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!reduced) {
    window.addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  return { start, stop, rebuild: build };
}

// ------------------------------------------------------------------ 星雲

/**
 * 星雲を一度だけ描く。星と違って動かさないので、毎フレーム描き直さない。
 *
 * 値ノイズを何層か重ねた (fBm) 雲を、画面の 1/6 ほどの粗さで描いて CSS で引き伸ばす。
 * 引き伸ばすときに補間されるので、ぼかさなくても柔らかい雲になる。
 * 乱数は固定のシードなので、開くたびに同じ空になる (見慣れた空のほうが落ち着く)。
 */
export function paintNebula(canvas) {
  const SCALE = 6;
  const w = Math.max(1, Math.ceil(canvas.clientWidth / SCALE));
  const h = Math.max(1, Math.ceil(canvas.clientHeight / SCALE));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);

  // 格子点に乱数を置き、間をなめらかにつなぐ値ノイズ
  const N = 256;
  let seed = 20260924;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grid = new Float32Array(N * N).map(rnd);
  const at = (x, y) => grid[((y & (N - 1)) * N) + (x & (N - 1))];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (x, y) => {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { v += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return v;
  };

  // 画面の大きさによらず、雲の大きさが同じに見えるよう、実寸 (CSS px) で座標を取る
  const unit = 1 / 260;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x * SCALE * unit, Y = y * SCALE * unit;
      // 雲をゆがませてから読むと、筋や渦のある星雲らしい形になる
      const q = fbm(X + 3.1, Y + 1.7);
      const density = fbm(X + q * 1.6, Y + q * 1.2);
      const hue = fbm(X * 0.6 + 9.2, Y * 0.6 + 4.4);
      const dust = fbm(X * 1.8 + 20, Y * 1.8 + 7);
      // 濃いところだけを残し、暗い塵の筋で削る
      let a = Math.max(0, density - 0.46) * 2.4;
      a *= 1 - Math.max(0, dust - 0.52) * 2.2;
      a = Math.max(0, Math.min(1, a));
      // 色は 紫 → 青緑 → 桃 を hue でまぜる
      const t = Math.max(0, Math.min(1, (hue - 0.3) * 2.5));
      const r = 96 + (40 - 96) * t + 120 * Math.max(0, t - 0.7);
      const g = 62 + (150 - 62) * t;
      const b = 196 + (210 - 196) * t;
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = a * 150;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** ページ先頭に 星雲・遠くの惑星・星空 を差し込んで動かす。 */
export function installStarfield(opts) {
  const neb = document.createElement('canvas');
  neb.id = 'nebula';
  neb.setAttribute('aria-hidden', 'true');
  // 画面の隅に大きな惑星の影。夜明け前の地平線のように、縁だけが光る
  const horizon = document.createElement('div');
  horizon.id = 'horizon';
  horizon.setAttribute('aria-hidden', 'true');
  const cv = document.createElement('canvas');
  cv.id = 'stars';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(neb, horizon, cv);

  paintNebula(neb);
  // 幅が変わったときだけ描き直す (スマホの URL バーの出入りで毎回描き直さない)
  let lastW = neb.clientWidth, timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.abs(neb.clientWidth - lastW) < 40) return;
      lastW = neb.clientWidth;
      paintNebula(neb);
    }, 200);
  });
  return startStarfield(cv, opts);
}
