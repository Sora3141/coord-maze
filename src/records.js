/**
 * クリアの記録。
 *
 * クリアするたびに「盤面の大きさ・シード・手数・最短手数・タイム・日時」を 1 件足す。
 * サイズごとのクリア回数や自己ベストは、そこから数えて出す
 * (二重に持つと必ずどこかで食い違うので、元の 1 件だけを持つ)。
 *
 * 置き場所は localStorage だが、あとからアカウントに載せ替えられるよう、
 * 1 件を「どこにでも送れる平らな形」にしてある。
 */

const KEY = 'coordmaze.records';
const VERSION = 1;
const MAX = 300;               // 覚えておくのは新しい順にこの件数まで

/** 「4x4」のような、サイズを表す文字列。 */
export const sizeKey = (rank, width) => `${rank}x${width}`;
export const sizeLabel = (rank, width) => `${rank} 次元 ${width} マス`;

/** 記録を全部読む (新しい順)。 */
export function loadRecords() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || d.v !== VERSION || !Array.isArray(d.clears)) return [];
    return d.clears.filter((c) => Number.isInteger(c.rank) && Number.isInteger(c.width));
  } catch {
    return [];
  }
}

function write(clears) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, clears: clears.slice(0, MAX) }));
  } catch { /* 保存できなくても遊べる */ }
}

/**
 * クリアを 1 件足して、その場で「何回目か」「自己ベストを更新したか」を返す。
 * 自己ベストは手数の少なさ優先、同じならタイムの短さ。
 */
export function addClear({ rank, width, seed, moves, par, time }) {
  const clears = loadRecords();
  const same = clears.filter((c) => c.rank === rank && c.width === width);
  const best = bestOf(same);
  const record = { at: Date.now(), rank, width, seed, moves, par, time: Math.round(time * 10) / 10 };
  write([record, ...clears]);
  return {
    count: same.length + 1,                               // このサイズで何回目か
    bestMoves: !best || moves < best.moves,               // 手数の自己ベスト更新
    bestTime: !best || (moves === best.moves && record.time < best.time),
    previous: best,
  };
}

export function clearRecords() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/** 手数がいちばん少ないもの (同じならタイムが短いもの)。 */
export function bestOf(list) {
  return list.reduce((a, c) => {
    if (!a) return c;
    if (c.moves !== a.moves) return c.moves < a.moves ? c : a;
    return c.time < a.time ? c : a;
  }, null);
}

/**
 * サイズごとにまとめる。次元数 → マス数の順で並べる。
 * @returns [{ rank, width, key, count, best }]
 */
export function summarize(clears = loadRecords()) {
  const bySize = new Map();
  for (const c of clears) {
    const key = sizeKey(c.rank, c.width);
    if (!bySize.has(key)) bySize.set(key, []);
    bySize.get(key).push(c);
  }
  return [...bySize.entries()]
    .map(([key, list]) => ({
      key, rank: list[0].rank, width: list[0].width,
      count: list.length, best: bestOf(list),
    }))
    .sort((a, b) => a.rank - b.rank || a.width - b.width);
}
