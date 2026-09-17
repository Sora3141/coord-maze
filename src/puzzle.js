import { MazeND } from './mazend.js';
import { RouteMaze } from './routemaze.js';
import { hashSeed } from './rng.js';

/**
 * 座標迷路 (COORD MAZE) の出題を作る。
 *
 * 迷路の作り方は、状態数 (= マス数^次元数) で 2 つに分かれる。
 *
 *   小さい空間: 格子全体の最小全域木 (MazeND)
 *     すべての状態がつながった、ふつうの迷路。壁を状態数ぶんの配列で持つ。
 *
 *   広い空間:   道を引いて枝を生やす木 (RouteMaze)
 *     10 次元 10 マスは 100 億状態。壁の配列は 100GB になって持てないし、
 *     格子全体の全域木は道が数千手に伸びて遊べない。通れるところだけを
 *     作れば、空間がいくら広くても節点は数千で済み、最短手数も設計できる。
 *
 * どちらも呼び出し方は同じなので、ゲーム側は違いを気にしなくていい。
 */

/**
 * 格子全体で作るのはここまで。この上は道を引く方式にする。
 *
 * 分かれ目をメモリではなく「最短手数」で決めているのが肝心。格子全体の全域木は
 * 状態数が増えるほど道が長くなり、5 次元 10 マス (10 万状態) では 345 手、
 * 6 次元 8 マス (26 万状態) では 392 手と、大きい盤面ほど遊べない長さになる。
 * しかも道方式の 10 次元 10 マスが 166 手なので、**中くらいの盤面のほうが長い**
 * という逆転まで起きる。
 *
 * この数までなら、どちらの方式でも最短手数はほぼ同じ (5 次元 4 マスで 25 手 対
 * 29 手) なので、ここを境にすれば手数は盤面の大きさに素直について増える。
 */
export const FULL_GRID_LIMIT = 5_000;

export const statesOf = (rank, width) => width ** rank;

/**
 * 広い空間のときの手加減。
 * 戻る手 1 回につき最短手数が 2 増えるので、最短手数はおよそ直線距離の 2 倍になる。
 * 節点数は最短手数の 6 倍。道 1 つぶんに対して枝が 5 つぶら下がる密度。
 */
function routeParams(rank, width) {
  const manhattan = rank * (width - 1);
  const backtracks = Math.max(2, Math.round(manhattan * 0.45));
  const expected = manhattan + backtracks * 2;
  return { backtracks, budget: Math.max(150, expected * 6) };
}

/**
 * 全次元 0 から全次元 width-1 へ運ぶパズルなので、最短手数が直線距離
 * (= rank * (width-1)) と同じだと「全部まとめて右に押すだけ」で解けてしまう。
 * 遠回りが必要な問題が出るまでシードを送る。シード文字列から決定論的に
 * 導くので、同じ入力なら必ず同じ問題になる。
 */
export function makeCoordPuzzle({ rank, width, seedText, maxAttempts = 80 }) {
  const dims = Array(rank).fill(width);
  const manhattan = rank * (width - 1);
  const big = statesOf(rank, width) > FULL_GRID_LIMIT;
  const { backtracks, budget } = routeParams(rank, width);
  let fallback = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = hashSeed(`${seedText}/${rank}x${width}#${attempt}`);
    const maze = big
      ? new RouteMaze({ dims, seed, backtracks, budget })
      : new MazeND({ dims, seed, braid: 0 }); // ループを作ると最短手数が直線距離まで落ちる
    const par = big ? maze.par : maze.path(maze.start, maze.goal).length - 1;
    const result = {
      maze, par, manhattan,
      detour: par - manhattan,
      kind: big ? 'route' : 'grid',
      attempts: attempt + 1,
    };
    if (!fallback) fallback = result;
    if (par > manhattan) return result;
  }
  return fallback;
}
