// 座標迷路 (COORD MAZE) の検証:  node test/coord.test.mjs

import { MazeND, makeCoordPuzzle } from '../src/mazend.js';

let fails = 0;
const check = (cond, msg) => { if (!cond) { console.log('  FAIL:', msg); fails++; } };

for (const [rank, width] of [[2, 3], [3, 4], [4, 4], [4, 5], [5, 4], [6, 3]]) {
  const manhattan = rank * (width - 1);
  const lens = [];

  for (const seedText of ['AAA', 'BBB', 'CCC', 'DDD', 'EEE']) {
    const puzzle = makeCoordPuzzle({ rank, width, seedText });
    const m = puzzle.maze;
    const seed = seedText;
    const start = 0, goal = m.size - 1;

    // 1) 盤面の大きさ
    check(m.size === width ** rank, `${rank}次元${width}マス: 状態数が違う`);

    // 2) すべての状態に到達できる (全域木なので必ず連結)
    const { dist } = m.bfs(start);
    check([...dist].every((d) => d >= 0), `${rank}次元${width}マス seed${seed}: 孤立した状態がある`);

    // 3) スタートは全次元 0、ゴールは全次元 width-1
    check(m.coords(start).every((c) => c === 0), 'スタートが全次元 0 でない');
    check(m.coords(goal).every((c) => c === width - 1), 'ゴールが全次元 width-1 でない');

    // 4) 最短経路の各手が「1 行だけを隣へ 1 つ」動かす手になっている
    const path = m.path(start, goal);
    check(path !== null, `${rank}次元${width}マス seed${seed}: ゴールに到達できない`);
    for (let k = 0; k + 1 < path.length; k++) {
      const a = m.coords(path[k]), b = m.coords(path[k + 1]);
      const diff = a.map((v, n) => b[n] - v);
      const moved = diff.filter((d) => d !== 0);
      check(moved.length === 1 && Math.abs(moved[0]) === 1,
        `${rank}次元${width}マス seed${seed}: ${k}手目が 1 行 1 マスの移動になっていない (${diff})`);
      const axis = diff.findIndex((d) => d !== 0);
      check(m.isOpen(path[k], axis, Math.sign(diff[axis])),
        `${rank}次元${width}マス seed${seed}: ${k}手目が壁を通り抜けている`);
      check(m.nextStep(path[k], goal)[0] === axis, `nextStep が最短手と食い違う`);
    }

    // 5) 出題は必ず「まっすぐ右に押すだけ」では解けない
    //    (= 最短手数が直線距離より長いので、どこかでコマを左に戻す必要がある)
    check(puzzle.par === path.length - 1, 'par が最短手数と一致しない');
    check(puzzle.par > manhattan,
      `${rank}次元${width}マス ${seedText}: 直線距離 ${manhattan} 手で解けてしまう (${puzzle.attempts} 回試行)`);
    check(makeCoordPuzzle({ rank, width, seedText }).par === puzzle.par, '同じシードで問題が変わる');
    lens.push(path.length - 1);
  }

  console.log(`${rank}次元 × ${width}マス (状態 ${width ** rank}): 最短 ${lens.join(', ')} 手 / 直線距離 ${manhattan} 手`);
}

console.log(fails === 0 ? '\nすべて合格' : `\n${fails} 件の不具合`);
process.exit(fails === 0 ? 0 : 1);
