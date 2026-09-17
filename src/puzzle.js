import { MazeND } from './mazend.js?v=6490ea4e';
import { RouteMaze } from './routemaze.js?v=6490ea4e';
import { hashSeed } from './rng.js?v=6490ea4e';

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
 * 格子全体で作る (＝すべての状態に行ける迷路にする) のはここまで。
 *
 * 分かれ目は**遊び切れるかどうか**。すべての状態に行ける迷路は、迷路である以上
 * 状態数に比例した探索が要る。素朴に遊んだときの手数を測ると、
 * 1 万状態でおよそ 2,000〜4,000 手。これを超えると現実的に終わらない。
 *
 * 壁を配列で持たない作り方 (親を決める関数だけを置いて、格子全体を覆う木を
 * その場で計算する) も試したが、持てるかどうかは解決しても遊べるかは解決しない。
 * 10 次元 10 マス (100 億状態) で素朴に遊ぶと、30 万手打っても着かなかった。
 * 「どの状態にも行ける」と「100 億状態を遊び切る」は両立しない。
 *
 * だから広い盤面は、空間を埋めるのをあきらめて、その中に道と枝で迷路を作る。
 */
export const FULL_GRID_LIMIT = 10_000;

export const statesOf = (rank, width) => width ** rank;

/**
 * 広い空間のときの手加減。
 * 戻る手 1 回につき最短手数が 2 増えるので、最短手数はおよそ直線距離の 2 倍になる。
 * 節点数は最短手数の 10 倍。道 1 つに対して枝が 9 つぶら下がる密度で、
 * 10 次元 10 マスなら 2 千状態ほど。素朴に遊んだときの手数がおよそ 1,400 手
 * (格子全体の迷路を遊び切れる大きさと同じくらい) に収まる。
 */
function routeParams(rank, width) {
  const manhattan = rank * (width - 1);
  const backtracks = Math.max(2, Math.round(manhattan * 0.45));
  const expected = manhattan + backtracks * 2;
  return { backtracks, budget: Math.max(150, expected * 10) };
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
