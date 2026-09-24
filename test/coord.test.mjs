// 座標迷路 (COORD MAZE) の検証:  node test/coord.test.mjs

import {
  makeCoordPuzzle, statesOf, MAX_STATES, EXPLICIT_MAX, RANKS, WIDTHS, MORE_RANKS, MORE_WIDTHS, MORE_MAX_STATES,
} from '../src/puzzle.js';
import { LETTERS } from '../src/coordboard.js';
import { HierMaze } from '../src/hmaze.js';

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

check(statesOf(7, 7) <= EXPLICIT_MAX, '7次元7マスは配列で持つ迷路 (MazeND) のはず');
check(statesOf(7, 8) > EXPLICIT_MAX, '7次元8マスからは階層的な迷路 (HierMaze) のはず');
check(statesOf(10, 10) <= MAX_STATES, '10次元10マスまで選べるはず');
// (instanceof は使えない: ゲーム側は ?v= 付きの URL で読み込むので、別のモジュールになる)
const isHier = (m) => typeof m.solutionLength === 'function';
check(!isHier(makeCoordPuzzle({ rank: 7, width: 7, seedText: 'AAA' }).maze), '7次元7マスが MazeND でない (前と同じ迷路が出なくなる)');

// ------------------------------------------------ 階層的な迷路 (大きい盤面)

// 小さい盤面で、区画を細かく割って階層を深くし、全状態を総当たりで確かめる
console.log('\n階層的な迷路 (小さい盤面・区画を細かく割って総当たり)');
for (const [dims, leafMax] of [[[4, 4, 4], 4], [[3, 5, 2, 4], 6], [[6, 6], 4], [[2, 2, 2, 2, 2, 2], 2],
  [[5, 5, 5], 8], [[7, 3, 4], 5], [[10, 10], 10], [[3, 3, 3, 3, 3], 9]]) {
  for (const seed of [1, 2, 3]) {
    for (const opts of [{ bias: 0.7, align: 0 }, { bias: 0.85, align: 1 },
      { bias: 0.7, align: 0.7, corridor: true, fewSplits: true }]) {
      const m = new HierMaze({ dims, seed, leafMax, ...opts });
      const where = `階層 ${dims.join('×')} leaf${leafMax} seed${seed} ${JSON.stringify(opts)}`;
      let edges = 0;
      for (let i = 0; i < m.size; i++) {
        for (let a = 0; a < m.rank; a++) {
          if (!m.isOpen(i, a, 1)) continue;
          edges++;
          check(m.isOpen(i + m.strides[a], a, -1), `${where}: 片側からしか通れない壁がある`);
        }
      }
      const states = reachableStates(m);
      check(states.size === m.size, `${where}: 行けない状態がある`);
      check(edges === m.size - 1, `${where}: 木になっていない (辺 ${edges} / 状態 ${m.size})`);
      // ゴールからの距離と、ヒント・最短手数を突き合わせる
      const dist = new Int32Array(m.size).fill(-1);
      const queue = [m.goal];
      dist[m.goal] = 0;
      for (let h = 0; h < queue.length; h++) {
        for (let a = 0; a < m.rank; a++) {
          for (const sign of [1, -1]) {
            const j = m.neighbor(queue[h], a, sign);
            if (j >= 0 && dist[j] < 0) { dist[j] = dist[queue[h]] + 1; queue.push(j); }
          }
        }
      }
      check(m.solutionLength() === dist[m.start], `${where}: 最短手数 ${m.solutionLength()} が実際 (${dist[m.start]}) と違う`);
      for (let i = 0; i < m.size; i += 7) {
        if (i === m.goal) continue;
        const [a, sign] = m.nextStep(i);
        check(m.isOpen(i, a, sign) && dist[i + sign * m.strides[a]] === dist[i] - 1, `${where}: ヒントが最短の手でない`);
      }
    }
  }
}
console.log('  8 種 × シード 3 × 設定 3 (本道あり・なし): 全域木・両側から同じ壁・最短手数・ヒントを確認');

console.log('\n階層的な迷路 (上限まで)');
for (const [rank, width] of [[7, 8], [8, 8], [9, 9], [10, 10]]) {
  const t0 = performance.now();
  const puzzle = makeCoordPuzzle({ rank, width, seedText: 'AAA' });
  const ms = performance.now() - t0;
  const m = puzzle.maze;
  const where = `${rank}次元${width}マス`;
  check(isHier(m), `${where}: 階層的な迷路になっていない`);
  check(m.coords(m.goal).every((c) => c === width - 1), `${where}: ゴールが全次元 ${width - 1} でない`);
  check(puzzle.par > rank * (width - 1), `${where}: 直線距離で解けてしまう`);
  check(makeCoordPuzzle({ rank, width, seedText: 'AAA' }).par === puzzle.par, `${where}: 同じシードで問題が変わる`);
  check(ms < 1000, `${where}: 生成に ${ms.toFixed(0)}ms かかる (遅すぎる)`);
  // ヒントをたどると、ちょうど最短手数でゴールに着く (1 手ずつ壁も確かめる)
  let cur = m.start, n = 0;
  const t1 = performance.now();
  for (; cur !== m.goal && n <= puzzle.par; n++) {
    const [a, sign] = m.nextStep(cur);
    check(m.isOpen(cur, a, sign) && m.isOpen(cur + sign * m.strides[a], a, -sign), `${where}: ヒントが壁を抜ける`);
    cur += sign * m.strides[a];
  }
  const perStep = (performance.now() - t1) / Math.max(1, n);
  check(cur === m.goal && n === puzzle.par, `${where}: ヒントをたどっても最短手数 (${puzzle.par}) でゴールに着かない (${n} 手)`);
  // 道から外れたところでも、ヒントはゴールへ近づける (壁の読み出しとも食い違わない)
  let x = m.start;
  for (let k = 0; k < 40; k++) {
    const opts = [];
    for (let a = 0; a < m.rank; a++) for (const s of [1, -1]) if (m.neighbor(x, a, s) >= 0) opts.push(m.neighbor(x, a, s));
    x = opts[(k * 7919) % opts.length];
  }
  const s = m.nextStep(x);
  check(s && m.isOpen(x, s[0], s[1]), `${where}: 寄り道した先でヒントが出ない`);
  console.log(`  ${where} (状態 ${statesOf(rank, width).toLocaleString('en-US')}): `
    + `最短 ${puzzle.par} 手 / 直線距離 ${rank * (width - 1)} 手 / 生成 ${ms.toFixed(0)}ms / ヒント 1 手 ${perStep.toFixed(2)}ms`);
}

// ------------------------------------------------ 「もっと大きく」で選べる大きさ

console.log('\n「もっと大きく」で選べる大きさ');
{
  let choosable = 0;
  for (const r of [...RANKS, ...MORE_RANKS]) {
    for (const w of [...WIDTHS, ...MORE_WIDTHS]) {
      if (statesOf(r, w) > MORE_MAX_STATES) continue;
      choosable++;
      // 状態の番号を JavaScript の数値で正確に表せる範囲に収まっている
      check(statesOf(r, w) <= Number.MAX_SAFE_INTEGER, `${r}次元${w}マス: 状態の番号が正確に表せない`);
    }
  }
  check(Math.max(...MORE_RANKS) <= LETTERS.length, '軸の名前が足りない');
  console.log(`  選べる組み合わせ ${choosable} 通り (状態数 ${MORE_MAX_STATES.toLocaleString('en-US')} まで)`);
}
// 2 次元 1000 マスは 100 万状態なので MazeND。nextStep が 1 回ごとに幅優先をやり直すので、
// 最後までたどらずに、経路の数か所だけ確かめる
{
  const puzzle = makeCoordPuzzle({ rank: 2, width: 1000, seedText: 'AAA' });
  const m = puzzle.maze;
  const path = m.path(m.start, m.goal);
  check(!isHier(m) && path.length - 1 === puzzle.par, '2次元1000マス: 最短手数が経路と合わない');
  for (const k of [0, path.length >> 1, path.length - 2]) {
    const [a, sign] = m.nextStep(path[k], m.goal);
    check(path[k] + sign * m.strides[a] === path[k + 1], '2次元1000マス: ヒントが最短の手でない');
  }
  console.log(`  2次元1000マス (状態 1,000,000): 最短 ${puzzle.par} 手`);
}
// 階層的な迷路は、ヒントを最後までたどる
for (const [rank, width] of [[12, 10], [3, 1000]]) {
  const t0 = performance.now();
  const puzzle = makeCoordPuzzle({ rank, width, seedText: 'AAA' });
  const ms = performance.now() - t0;
  const m = puzzle.maze;
  const where = `${rank}次元${width}マス`;
  check(puzzle.par > rank * (width - 1), `${where}: 直線距離で解けてしまう`);
  let cur = m.start, n = 0;
  for (; cur !== m.goal && n <= puzzle.par; n++) {
    const [a, sign] = m.nextStep(cur, m.goal);
    check(m.isOpen(cur, a, sign), `${where}: ヒントが壁を抜ける`);
    cur += sign * m.strides[a];
  }
  check(cur === m.goal && n === puzzle.par, `${where}: ヒントをたどっても最短手数でゴールに着かない`);
  console.log(`  ${where} (状態 ${statesOf(rank, width).toLocaleString('en-US')}): 最短 ${puzzle.par} 手 / 生成 ${ms.toFixed(0)}ms`);
}

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
