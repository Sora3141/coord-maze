// 座標迷路 (COORD MAZE) の検証:  node test/coord.test.mjs

import { makeCoordPuzzle, statesOf, MAX_STATES } from '../src/puzzle.js';

let fails = 0;
const check = (cond, msg) => { if (!cond) { console.log('  FAIL:', msg); fails++; } };

/** 行ける状態を全部あげる。 */
function reachableStates(m) {
  const seen = new Set([m.start]);
  const queue = [m.start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (let a = 0; a < m.rank; a++) {
      for (const sign of [1, -1]) {
        const j = m.neighbor(i, a, sign);
        if (j >= 0 && !seen.has(j)) { seen.add(j); queue.push(j); }
      }
    }
  }
  return seen;
}

function checkPuzzle(puzzle, rank, width, seedText) {
  const m = puzzle.maze;
  const where = `${rank}次元${width}マス ${seedText}`;

  // 1) 座標と index が行き来できる
  check(m.size === statesOf(rank, width), `${where}: 状態数が違う`);
  check(m.coords(m.start).every((c) => c === 0), `${where}: スタートが全次元 0 でない`);
  check(m.coords(m.goal).every((c) => c === width - 1), `${where}: ゴールが全次元 ${width - 1} でない`);
  check(m.index(m.coords(m.goal)) === m.goal, `${where}: index と coords が往復しない`);

  // 2) すべての状態に行ける (これがこの迷路の肝)
  const states = reachableStates(m);
  check(states.size === m.size, `${where}: 行けない状態がある (${m.size - states.size} 個)`);
  check(m.reachable === m.size, `${where}: reachable の数が合わない`);

  // 3) ゴールへの最短経路の各手が「1 行を隣へ 1 マス」で、壁を抜けていない
  const path = m.path(m.start, m.goal);
  check(path !== null, `${where}: ゴールに到達できない`);
  if (!path) return;
  check(puzzle.par === path.length - 1, `${where}: par が最短手数と一致しない`);
  const { dist } = m.bfs(m.goal);
  for (let k = 0; k + 1 < path.length; k++) {
    const a = m.coords(path[k]), b = m.coords(path[k + 1]);
    const diff = a.map((v, n) => b[n] - v);
    const moved = diff.filter((d) => d !== 0);
    check(moved.length === 1 && Math.abs(moved[0]) === 1,
      `${where}: ${k}手目が 1 行 1 マスの移動になっていない (${diff})`);
    const axis = diff.findIndex((d) => d !== 0);
    check(m.isOpen(path[k], axis, Math.sign(diff[axis])), `${where}: ${k}手目が壁を抜けている`);
    check(m.neighbor(path[k], axis, Math.sign(diff[axis])) === path[k + 1],
      `${where}: neighbor が経路と食い違う`);
    check(dist[path[k]] === path.length - 1 - k, `${where}: ${k}手目がゴールへの最短になっていない`);
  }
  // nextStep は 1 回ごとに幅優先をやり直すので、経路の数か所だけ突き合わせる
  for (const k of [0, path.length >> 1, path.length - 2].filter((k) => k >= 0 && k + 1 < path.length)) {
    const diff = m.coords(path[k + 1]).map((v, n) => v - m.coords(path[k])[n]);
    check(m.nextStep(path[k], m.goal)[0] === diff.findIndex((d) => d !== 0),
      `${where}: nextStep が最短手と食い違う`);
  }

  // 4) 通路は必ず両側から通れる (片通行があると詰む)。大きい盤面は拾い読みで確かめる。
  const step = Math.max(1, Math.floor(m.size / 20000));
  for (let i = 0; i < m.size; i += step) {
    for (let a = 0; a < rank; a++) {
      for (const sign of [1, -1]) {
        const j = m.neighbor(i, a, sign);
        if (j >= 0) check(m.isOpen(j, a, -sign), `${where}: 片側からしか通れない壁がある`);
      }
    }
  }

  // 5) 輪がない (辺の数 = 状態数 - 1)。輪があると最短手数が直線距離まで落ちる。
  let edges = 0;
  for (let i = 0; i < m.size; i++) {
    for (let a = 0; a < rank; a++) if (m.neighbor(i, a, 1) >= 0) edges++;
  }
  check(edges === m.size - 1, `${where}: 迷路が木になっていない (辺 ${edges} / 状態 ${m.size})`);

  // 6) 同じシードなら同じ問題 (大きい盤面は生成が重いので飛ばす)
  if (m.size <= 300000) {
    check(makeCoordPuzzle({ rank, width, seedText }).par === puzzle.par, `${where}: 同じシードで問題が変わる`);
  }
}

// ---------------------------------------------------------------- 小さい盤面

console.log('迷路 (すべての状態に行ける、格子全体の全域木)');
for (const [rank, width] of [[2, 3], [3, 4], [4, 4], [4, 5], [5, 4], [6, 3], [2, 10], [3, 2], [6, 2], [10, 2]]) {
  const lens = [];
  for (const seedText of ['AAA', 'BBB', 'CCC', 'DDD', 'EEE']) {
    const puzzle = makeCoordPuzzle({ rank, width, seedText });
    checkPuzzle(puzzle, rank, width, seedText);
    // まっすぐ右に押すだけでは解けない (= どこかで左に戻る必要がある)
    check(puzzle.par > rank * (width - 1), `${rank}次元${width}マス ${seedText}: 直線距離で解けてしまう`);
    lens.push(puzzle.par);
  }
  console.log(`  ${rank}次元 × ${width}マス (状態 ${statesOf(rank, width)}): `
    + `最短 ${lens.join(', ')} 手 / 直線距離 ${rank * (width - 1)} 手`);
}

// 2 次元 2 マスだけは、状態が 4 つで輪になっているだけなので、
// どう作ってもまっすぐ 2 手 (= 直線距離) で解ける。遠回りは作れない。
{
  const puzzle = makeCoordPuzzle({ rank: 2, width: 2, seedText: 'AAA' });
  check(puzzle.par === 2, '2次元2マス: 2 手で解けるはず');
  check(reachableStates(puzzle.maze).size === 4, '2次元2マス: 4 つの状態すべてに行けるはず');
  console.log('  2次元 × 2マス (状態 4): 最短 2 手 / 直線距離 2 手 (遠回りは作れない盤面)');
}

// ---------------------------------------------------------------- 大きい盤面

console.log('\n大きい盤面 (上限まわり)');
for (const [rank, width] of [[5, 10], [9, 4], [7, 7], [6, 10]]) {
  const seedText = 'AAA';
  const t0 = performance.now();
  const puzzle = makeCoordPuzzle({ rank, width, seedText });
  const ms = performance.now() - t0;
  checkPuzzle(puzzle, rank, width, seedText);
  check(puzzle.par > rank * (width - 1), `${rank}次元${width}マス: 直線距離で解けてしまう`);
  check(statesOf(rank, width) <= MAX_STATES, `${rank}次元${width}マス: 上限を超えている`);
  check(ms < 3000, `${rank}次元${width}マス: 生成に ${ms.toFixed(0)}ms かかる (遅すぎる)`);
  console.log(`  ${rank}次元 × ${width}マス (状態 ${statesOf(rank, width).toLocaleString('en-US')}): `
    + `最短 ${puzzle.par} 手 / 直線距離 ${rank * (width - 1)} 手 / 生成 ${ms.toFixed(0)}ms`);
}

check(statesOf(7, 7) <= MAX_STATES, '7次元7マスは上限に収まるはず');
check(statesOf(7, 8) > MAX_STATES, '7次元8マスは上限を超えるはず');

// ------------------------------------------------- 読み込み URL の版

// ブラウザは古い JS / CSS を握り続けるので、読み込み URL には中身のハッシュを
// 付けてある (tools/stamp.mjs)。付け直し忘れをここで捕まえる。
const { stampAll } = await import('../tools/stamp.mjs');
const stamp = stampAll({ write: false });
check(stamp.outdated.length === 0,
  `読み込み URL の版が古い: ${stamp.outdated.join(', ')} (node tools/stamp.mjs を実行してください)`);
console.log(`\n読み込み URL の版: ?v=${stamp.version}`);

console.log(fails === 0 ? '\nすべて合格' : `\n${fails} 件の不具合`);
process.exit(fails === 0 ? 0 : 1);
