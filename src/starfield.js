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

/** ページ先頭に星空用の canvas を差し込んで動かす。 */
export function installStarfield(opts) {
  const cv = document.createElement('canvas');
  cv.id = 'stars';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  return startStarfield(cv, opts);
}
