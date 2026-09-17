/**
 * 遊んでいる盤面を覚えておく。
 *
 * 迷路そのものは「シード・次元数・マス数」から決まるので、保存するのは
 * **どこまで進んだか**だけでいい (今いる座標・手数・経過・手順・通った印)。
 * 読み込み直すときは、同じシードで迷路を作り直してから進みぐあいを戻す。
 *
 * うっかり画面を切り替えても、戻ってくれば続きから遊べる。
 */

const KEY = 'coordmaze.game';
const VERSION = 1;

// 「通った印」がこれより多いときは諦める (localStorage に入り切らない)。
// 印が無くても遊べる。消えるのは、行き先が新しいか既に通ったかの色分けだけ。
const MAX_VISITED = 100_000;

/** 今の進みぐあいを保存する。保存できない環境でも遊べるように、失敗は黙って捨てる。 */
export function saveGame({ seed, rank, width, par, pos, moves, elapsed, history, visited, selected }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: VERSION,
      seed, rank, width, par,
      pos: [...pos],
      moves,
      elapsed: Math.round(elapsed * 10) / 10,
      history: history.map((h) => [h.axis, h.sign]),
      visited: visited.size <= MAX_VISITED ? [...visited] : null,
      selected,
      at: Date.now(),
    }));
  } catch { /* いっぱい / プライベートモードなど。保存できなくても遊べる */ }
}

/** 保存してある進みぐあい。無ければ null。 */
export function loadGame() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || d.v !== VERSION) return null;
    if (typeof d.seed !== 'string' || !Array.isArray(d.pos)) return null;
    if (!Number.isInteger(d.rank) || !Number.isInteger(d.width)) return null;
    return d;
  } catch {
    return null;
  }
}

export function clearGame() {
  try { localStorage.removeItem(KEY); } catch { /* 消せなくても困らない */ }
}
