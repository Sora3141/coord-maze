// 座標迷路 (COORD MAZE) の検証:  node test/coord.test.mjs

import { makeCoordPuzzle, statesOf, FULL_GRID_LIMIT } from '../src/puzzle.js';

let fails = 0;
const check = (cond, msg) => { if (!cond) { console.log('  FAIL:', msg); fails++; } };

/** 迷路の作り方によらず、必ず成り立っていてほしいこと。 */
function checkPuzzle(puzzle, rank, width, seedText) {
  const m = puzzle.maze;
  const where = `${rank}次元${width}マス ${seedText}`;
  const manhattan = rank * (width - 1);

  // 1) 座標と index が行き来できる
  check(m.size === statesOf(rank, width), `${where}: 座標空間の広さが違う`);
  check(m.coords(m.start).every((c) => c === 0), `${where}: スタートが全次元 0 でない`);
  check(m.coords(m.goal).every((c) => c === width - 1), `${where}: ゴールが全次元 ${width - 1} でない`);
  check(m.index(m.coords(m.goal)) === m.goal, `${where}: index と coords が往復しない`);

  // 2) ゴールへ行ける
  const path = m.path(m.start, m.goal);
  check(path !== null, `${where}: ゴールに到達できない`);
  if (!path) return;
  check(puzzle.par === path.length - 1, `${where}: par が最短手数と一致しない`);

  // 3) 最短経路の各手が「1 行だけを隣へ 1 つ」動かす手で、壁を抜けていない
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
    check(m.nextStep(path[k], m.goal)[0] === axis, `${where}: nextStep が最短手と食い違う`);
  }

  // 4) 通路は必ず両側から通れる (片通行があると詰む)
  for (const i of reachableStates(m)) {
    for (let a = 0; a < rank; a++) {
      for (const sign of [1, -1]) {
        const j = m.neighbor(i, a, sign);
        if (j < 0) continue;
        check(m.isOpen(j, a, -sign), `${where}: 片側からしか通れない壁がある`);
      }
    }
  }

  // 5) まっすぐ右に押すだけでは解けない (＝どこかで必ず左に戻る必要がある)
  check(puzzle.par > manhattan, `${where}: 直線距離 ${manhattan} 手で解けてしまう`);

  // 6) 同じシードなら同じ問題
  const again = makeCoordPuzzle({ rank, width, seedText });
  check(again.par === puzzle.par && again.maze.reachable === m.reachable,
    `${where}: 同じシードで問題が変わる`);
}

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

// ------------------------------------------------- 格子全体で作る小さい盤面

console.log('格子全体の迷路 (すべての状態がつながる)');
for (const [rank, width] of [[2, 3], [3, 4], [4, 4], [4, 5], [5, 4], [6, 3], [2, 10], [3, 2], [6, 2], [10, 2]]) {
  const lens = [];
  for (const seedText of ['AAA', 'BBB', 'CCC', 'DDD', 'EEE']) {
    const puzzle = makeCoordPuzzle({ rank, width, seedText });
    check(puzzle.kind === 'grid', `${rank}次元${width}マス: 格子で作られていない`);
    checkPuzzle(puzzle, rank, width, seedText);
    // 格子なら、どの状態にも行ける
    check(reachableStates(puzzle.maze).size === puzzle.maze.size,
      `${rank}次元${width}マス ${seedText}: 孤立した状態がある`);
    lens.push(puzzle.par);
  }
  console.log(`  ${rank}次元 × ${width}マス (状態 ${statesOf(rank, width)}): `
    + `最短 ${lens.join(', ')} 手 / 直線距離 ${rank * (width - 1)} 手`);
}

// --------------------------------------------- 道を引いて作る広い盤面

console.log('\n道を引く迷路 (広すぎて格子を持てない盤面)');
for (const [rank, width] of [[4, 10], [6, 9], [8, 8], [10, 5], [9, 10], [10, 10]]) {
  const lens = [], nodes = [];
  let worst = 0;
  for (const seedText of ['AAA', 'BBB', 'CCC']) {
    const t0 = performance.now();
    const puzzle = makeCoordPuzzle({ rank, width, seedText });
    worst = Math.max(worst, performance.now() - t0);
    const m = puzzle.maze;
    check(puzzle.kind === 'route', `${rank}次元${width}マス: 道を引く方式になっていない`);
    check(statesOf(rank, width) > FULL_GRID_LIMIT, `${rank}次元${width}マス: 上限の判定がおかしい`);
    checkPuzzle(puzzle, rank, width, seedText);

    // 木であること (辺の数 = 節点数 - 1)。輪があるとゴールへの道が 2 本になり、
    // 最短手数が設計どおりにならない。
    const states = reachableStates(m);
    let edges = 0;
    for (const i of states) {
      for (let a = 0; a < m.rank; a++) for (const sign of [1, -1]) if (m.neighbor(i, a, sign) >= 0) edges++;
    }
    check(edges / 2 === states.size - 1, `${rank}次元${width}マス ${seedText}: 迷路が木になっていない`);
    check(states.size === m.reachable, `${rank}次元${width}マス ${seedText}: reachable の数が合わない`);

    // 行ける状態はすべて盤面の内側にある
    for (const i of states) {
      check(m.coords(i).every((c) => c >= 0 && c < width),
        `${rank}次元${width}マス ${seedText}: 盤面の外に出ている`);
    }
    lens.push(puzzle.par);
    nodes.push(m.reachable);
  }
  check(worst < 1000, `${rank}次元${width}マス: 生成に ${worst.toFixed(0)}ms かかる (遅すぎる)`);
  console.log(`  ${rank}次元 × ${width}マス (状態 ${statesOf(rank, width).toLocaleString('en-US')}): `
    + `最短 ${lens.join(', ')} 手 / 直線距離 ${rank * (width - 1)} 手 / `
    + `行ける状態 ${nodes[0]} / 生成 ${worst.toFixed(1)}ms`);
}

console.log(fails === 0 ? '\nすべて合格' : `\n${fails} 件の不具合`);
process.exit(fails === 0 ? 0 : 1);
