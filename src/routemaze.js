import { mulberry32 } from './rng.js';

/**
 * 広い座標空間のための迷路。
 *
 * 格子全体に壁を持つ MazeND は、状態数ぶんの配列が要る。10 次元 10 マスなら
 * 100 億状態 = 壁の配列だけで 100GB になり、作ることも持つこともできない。
 * しかも全域木の道は状態数とともに長くなり、遊べる手数に収まらない。
 *
 * そこで逆に、**通れるところだけ**を作る:
 *
 *   1. スタートからゴールまでの道を 1 本引く。途中でわざと座標を戻すので、
 *      まっすぐ押すだけでは着かない
 *   2. その道のあちこちから枝を伸ばし、行き止まりの分かれ道を生やす
 *
 * 通路はこうして作った木の辺だけで、ほかは全部壁。木なのでゴールへの道は
 * 1 本に決まり、最短手数は 1 で引いた道の長さそのものになる。
 * 座標空間がいくら広くても、持つのは木の節点だけ (数千) で済む。
 *
 * MazeND と同じ呼び出し方 (index / coords / isOpen / neighbor / nextStep) で
 * 使えるので、ゲーム側はどちらの迷路かを気にしなくていい。
 */
export class RouteMaze {
  /**
   * @param opts.dims  各次元のマス数
   * @param opts.seed  乱数の種
   * @param opts.backtracks 道の途中で座標を戻す回数 (1 回につき最短手数が 2 増える)
   * @param opts.budget 迷路全体の節点数の上限 (道 + 枝)
   */
  constructor({ dims, seed, backtracks = 4, budget = 800 }) {
    this.dims = [...dims];
    this.rank = this.dims.length;
    this.strides = [];
    let stride = 1;
    for (const n of this.dims) {
      this.strides.push(stride);
      stride *= n;
    }
    this.size = stride;                       // 座標空間の広さ (届かない場所も含む)
    this.seed = seed;
    this.rng = mulberry32(seed);

    // 通れる向きを状態ごとのビットで持つ。軸 a へ +1 が 1<<a、-1 が 1<<(rank+a)。
    // 節点として存在する = このマップに載っている、でもある。
    this.links = new Map();

    this.start = 0;                           // 全次元 0
    this.goal = this.index(this.dims.map((n) => n - 1));

    // 戻る手の数はシードごとに少し散らす。問題ごとに歯ごたえが変わるように。
    const back = Math.max(1, Math.round(backtracks * (0.75 + this.rng() * 0.5)));
    this.route = this.#carveRoute(back);
    this.par = this.route.length - 1;
    this.#growBranches(budget);
    this.reachable = this.links.size;         // 実際に行ける状態の数
    this.distToGoal = this.#distancesFrom(this.goal);
  }

  // ------------------------------------------------------------ 座標と index

  index(coords) {
    let i = 0;
    for (let a = 0; a < this.rank; a++) i += coords[a] * this.strides[a];
    return i;
  }

  coord(i, axis) {
    return Math.floor(i / this.strides[axis]) % this.dims[axis];
  }

  coords(i) {
    const out = new Array(this.rank);
    for (let a = 0; a < this.rank; a++) out[a] = this.coord(i, a);
    return out;
  }

  // -------------------------------------------------------------- 壁の問い合わせ

  #bit(axis, sign) {
    return 1 << (sign > 0 ? axis : this.rank + axis);
  }

  isOpen(i, axis, sign) {
    const mask = this.links.get(i);
    if (mask === undefined) return false;
    return (mask & this.#bit(axis, sign)) !== 0;
  }

  neighbor(i, axis, sign) {
    if (!this.isOpen(i, axis, sign)) return -1;
    return i + sign * this.strides[axis];
  }

  /** i と、その axis 方向 sign 隣を、双方向につなぐ。 */
  #link(i, axis, sign) {
    const j = i + sign * this.strides[axis];
    this.links.set(i, (this.links.get(i) || 0) | this.#bit(axis, sign));
    this.links.set(j, (this.links.get(j) || 0) | this.#bit(axis, -sign));
    return j;
  }

  // ------------------------------------------------------------------ 道を引く

  /**
   * スタートからゴールへ、自分と重ならない道を 1 本引く。
   *
   * 基本は「まだ足りない軸の座標を 1 増やす」。そこへ backtracks 回だけ
   * 「座標を 1 減らす」を混ぜる。減らした手はあとで増やし直すので、
   * 1 回につき最短手数が 2 増え、まっすぐ押すだけでは解けなくなる。
   * 戻る手は、残りの距離に対する割合で撒くので、道の全体に散る。
   */
  #carveRoute(backtracks) {
    // 隣がすべて自分の通った跡だと、そこで道が途切れる。
    // 狭い空間だと起こりうるので、何度か引き直す。
    for (let attempt = 0; attempt < 8; attempt++) {
      this.links.clear();
      const route = this.#tryRoute(backtracks);
      if (route) return route;
    }
    // それでも駄目なら、まっすぐ進むだけの道。必ず引けるが遠回りは無くなる。
    this.links.clear();
    return this.#straightRoute();
  }

  /** 1 回ぶんの試行。ゴールへ着けなければ null。 */
  #tryRoute(backtracks) {
    const { rank, dims, rng } = this;
    const pos = new Array(rank).fill(0);
    let here = this.start;
    const route = [here];
    const seen = new Set([here]);
    this.links.set(here, 0);

    let back = backtracks;
    // 1 手ごとに必ずゴールへ 1 近づくか 1 遠ざかるので、
    // 道の長さは「直線距離 + 戻った回数 × 2」を超えない。
    const limit = rank * (dims[0] - 1) + backtracks * 2 + 4;

    while (here !== this.goal && route.length <= limit) {
      const deficit = pos.reduce((s, c, a) => s + (dims[a] - 1 - c), 0);
      const goBack = back > 0 && deficit > 0 && rng() < back / (deficit + back);

      // 行ける先を集める (まだ通っていない状態だけ)
      const cands = [];
      for (let a = 0; a < rank; a++) {
        const sign = goBack ? -1 : 1;
        const c = pos[a] + sign;
        if (c < 0 || c >= dims[a]) continue;
        const j = here + sign * this.strides[a];
        if (seen.has(j)) continue;
        cands.push(a);
      }
      // 戻れないときは進む手で代用する (その逆も同じ)
      const sign = cands.length ? (goBack ? -1 : 1) : (goBack ? 1 : -1);
      if (!cands.length) {
        for (let a = 0; a < rank; a++) {
          const c = pos[a] + sign;
          if (c < 0 || c >= dims[a]) continue;
          if (seen.has(here + sign * this.strides[a])) continue;
          cands.push(a);
        }
      }
      if (!cands.length) return null;         // 四方が自分の跡。引き直す

      const axis = cands[(rng() * cands.length) | 0];
      here = this.#link(here, axis, sign);
      pos[axis] += sign;
      if (sign < 0) back--;
      seen.add(here);
      route.push(here);
    }
    return here === this.goal ? route : null;
  }

  /** 各軸を順に端まで進めるだけの道。どんな空間でも必ず引ける。 */
  #straightRoute() {
    let here = this.start;
    const route = [here];
    this.links.set(here, 0);
    for (let a = 0; a < this.rank; a++) {
      for (let c = 0; c < this.dims[a] - 1; c++) {
        here = this.#link(here, a, 1);
        route.push(here);
      }
    }
    return route;
  }

  // -------------------------------------------------------------- 枝を生やす

  /**
   * 道のあちこちから、行き止まりの枝を伸ばす。
   *
   * 1 本ずつ長さを区切って生やすのが肝心で、伸ばせるだけ伸ばすと
   * 1 か所から出た 1 本の長い蛇になり、道の上に分かれ道が生まれない
   * (＝迷いようがない一本道になってしまう)。
   * 枝の出どころは道の上を多めに、残りは枝の途中から。枝からまた枝が出る。
   * 既にある状態へはつながない。つなぐと輪ができて、ゴールへの道が 2 本になる。
   */
  #growBranches(budget) {
    const rng = this.rng;
    const cap = Math.min(budget, Math.max(this.route.length, Math.floor(this.size * 0.6)));
    // 枝 1 本の長さ。道の長さに対して短く保つ。
    const maxLen = Math.max(3, Math.min(14, Math.round(this.route.length / 8)));
    const nodes = [...this.links.keys()];
    let guard = cap * 20;                     // 空きがないときに回り続けないように

    while (this.links.size < cap && guard-- > 0) {
      const from = rng() < 0.6
        ? this.route[(rng() * this.route.length) | 0]
        : nodes[(rng() * nodes.length) | 0];
      let here = from;
      const len = 1 + ((rng() * maxLen) | 0);
      for (let k = 0; k < len && this.links.size < cap; k++) {
        const next = this.#stepIntoEmpty(here);
        if (next < 0) break;                  // 周りが埋まっている。次の枝へ
        nodes.push(next);
        here = next;
      }
    }
  }

  /** i の隣で、まだ誰も使っていない場所へ 1 歩。無ければ -1。 */
  #stepIntoEmpty(i) {
    const { rank, dims, rng } = this;
    const pos = this.coords(i);
    const cands = [];
    for (let a = 0; a < rank; a++) {
      for (const sign of [1, -1]) {
        const c = pos[a] + sign;
        if (c < 0 || c >= dims[a]) continue;
        if (this.links.has(i + sign * this.strides[a])) continue;
        cands.push(a * 2 + (sign > 0 ? 0 : 1));
      }
    }
    if (!cands.length) return -1;
    const pick = cands[(rng() * cands.length) | 0];
    return this.#link(i, pick >> 1, (pick & 1) ? -1 : 1);
  }

  // ------------------------------------------------------------------ 道案内

  /** from から全状態への距離 (木なので幅優先で足りる)。 */
  #distancesFrom(from) {
    const dist = new Map([[from, 0]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const d = dist.get(i) + 1;
      for (let axis = 0; axis < this.rank; axis++) {
        for (const sign of [1, -1]) {
          const j = this.neighbor(i, axis, sign);
          if (j < 0 || dist.has(j)) continue;
          dist.set(j, d);
          queue.push(j);
        }
      }
    }
    return dist;
  }

  /** from から to への最短経路 (状態 index の配列)。到達不能なら null。 */
  path(from, to) {
    const prev = new Map([[from, -1]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (i === to) {
        const out = [];
        for (let cur = i; cur >= 0; cur = prev.get(cur)) out.push(cur);
        return out.reverse();
      }
      for (let axis = 0; axis < this.rank; axis++) {
        for (const sign of [1, -1]) {
          const j = this.neighbor(i, axis, sign);
          if (j < 0 || prev.has(j)) continue;
          prev.set(j, i);
          queue.push(j);
        }
      }
    }
    return null;
  }

  /** 次の 1 手だけ知りたいとき: to へ向かうために動かす [軸, 向き]。 */
  nextStep(from, to) {
    // ゴールへの距離は作るときに測ってあるので、その場で答えられる
    const dist = to === this.goal ? this.distToGoal : this.#distancesFrom(to);
    const d = dist.get(from);
    if (d === undefined || d === 0) return null;
    for (let axis = 0; axis < this.rank; axis++) {
      for (const sign of [1, -1]) {
        const j = this.neighbor(from, axis, sign);
        if (j >= 0 && dist.get(j) === d - 1) return [axis, sign];
      }
    }
    return null;
  }
}
