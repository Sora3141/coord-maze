import { MazeND } from './mazend.js?v=110cbb75';
import { hashSeed } from './rng.js?v=110cbb75';

/**
 * 座標迷路 (COORD MAZE) の出題を作る。
 *
 * 迷路は格子グラフ全体の最小全域木 (MazeND)。**すべての状態に行ける**、
 * ふつうの迷路にしてある。
 */

/**
 * 出題できる状態数の上限。
 *
 * 上限がある理由は 2 つ。壁を状態数ぶんの配列で持つことと、迷路である以上
 * 正しい道を見つけるには状態の数だけ探し回ることになること。
 * 7 次元 7 マス (82 万状態) で、生成 130ms・最短 442 手ほど。
 *
 * これを超える組み合わせは選べなくしている (src/coord.js)。
 */
export const MAX_STATES = 1_200_000;

export const statesOf = (rank, width) => width ** rank;

/**
 * 全次元 0 から全次元 width-1 へ運ぶパズルなので、最短手数が直線距離
 * (= rank * (width-1)) と同じだと「全部まとめて右に押すだけ」で解けてしまう。
 * 盤面が小さいほどそうなりやすい (2 次元 3 マスだと約 9 割) ため、
 * 遠回りが必要な問題が出るまでシードを送る。シード文字列から決定論的に
 * 導くので、同じ入力なら必ず同じ問題になる。
 *
 * 2 次元 2 マスだけは例外で、4 つの状態が輪になっているだけなので
 * どう作っても直線距離 (2 手) で解ける。そのまま返す。
 */
export function makeCoordPuzzle({ rank, width, seedText, maxAttempts = 80 }) {
  const dims = Array(rank).fill(width);
  const manhattan = rank * (width - 1);
  let fallback = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const maze = new MazeND({
      dims,
      seed: hashSeed(`${seedText}/${rank}x${width}#${attempt}`),
      braid: 0, // ループを作ると最短手数が直線距離まで落ちてパズルにならない
    });
    const par = maze.path(maze.start, maze.goal).length - 1;
    const result = { maze, par, manhattan, detour: par - manhattan, attempts: attempt + 1 };
    if (!fallback) fallback = result;
    if (par > manhattan) return result;
  }
  return fallback;
}
