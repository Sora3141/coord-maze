import { makeCoordPuzzle, statesOf, MAX_STATES } from './puzzle.js?v=f4647c93';
import { randomSeedString } from './rng.js?v=f4647c93';
import { CoordBoard } from './coordboard.js?v=f4647c93';
import { confirmDialog, isDialogOpen } from './ui.js?v=f4647c93';
import { installStarfield } from './starfield.js?v=f4647c93';
import { saveGame, loadGame, clearGame } from './save.js?v=f4647c93';
import { sound, armSound } from './sound.js?v=f4647c93';

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const WIDTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

// 状態数 = マス数 ^ 次元数 で爆発する。上限を超える組み合わせは押せなくする。
const OVER_NOTE = `状態数が上限 (${MAX_STATES.toLocaleString('en-US')}) を超えます`;

const $ = (id) => document.getElementById(id);

const fmt = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

class CoordMaze {
  constructor() {
    this.rank = 4;
    this.width = 4;
    // 設定パネルで選んでいる値。「この設定で作る」を押すまで盤面には反映しない。
    // (先に反映すると、今の迷路と次元数・マス数が食い違ったまま動かすことになり、
    //  描画が例外で止まって「動かせる先が出ない」状態になる)
    this.pickRank = this.rank;
    this.pickWidth = this.width;
    this.selected = 0;
    this.#initOptions();
    this.#initEvents();
    $('btn-sound').classList.toggle('on', sound.enabled);
    $('btn-sound').innerHTML = `効果音 ${sound.enabled ? 'ON' : 'OFF'} <kbd>V</kbd>`;

    // 前に遊んでいた盤面が残っていれば、その続きから始める
    const saved = loadGame();
    const usable = saved && RANKS.includes(saved.rank) && WIDTHS.includes(saved.width)
      && statesOf(saved.rank, saved.width) <= MAX_STATES;
    if (usable) {
      this.rank = this.pickRank = saved.rank;
      this.width = this.pickWidth = saved.width;
    }
    $('seed').value = usable ? saved.seed : randomSeedString();
    this.newGame({ seed: $('seed').value, restore: usable ? saved : null });
    setInterval(() => this.#tick(), 250);
  }

  // ------------------------------------------------------------------ 初期化

  #initOptions() {
    const build = (host, values, set) => {
      host.innerHTML = '';
      for (const v of values) {
        const b = document.createElement('button');
        b.textContent = `${v}`;
        b.dataset.v = `${v}`;
        b.addEventListener('click', () => { set(v); this.#syncOptions(); });
        host.appendChild(b);
      }
    };
    build($('opt-rank'), RANKS, (v) => { this.pickRank = v; });
    build($('opt-width'), WIDTHS, (v) => { this.pickWidth = v; });
    this.#syncOptions();
  }

  /**
   * 選択状態を塗り直し、状態数が上限を超える組み合わせを押せなくする。
   * 次元数を上げたことで今のマス数が使えなくなったときは、使える最大に落とす。
   */
  #syncOptions() {
    if (statesOf(this.pickRank, this.pickWidth) > MAX_STATES) {
      const fit = WIDTHS.filter((w) => statesOf(this.pickRank, w) <= MAX_STATES);
      this.pickWidth = fit.length ? fit[fit.length - 1] : WIDTHS[0];
    }
    for (const el of $('opt-rank').children) {
      const v = Number(el.dataset.v);
      el.classList.toggle('on', v === this.pickRank);
      el.disabled = statesOf(v, WIDTHS[0]) > MAX_STATES;
      el.title = el.disabled ? OVER_NOTE : '';
    }
    for (const el of $('opt-width').children) {
      const v = Number(el.dataset.v);
      el.classList.toggle('on', v === this.pickWidth);
      el.disabled = statesOf(this.pickRank, v) > MAX_STATES;
      el.title = el.disabled ? OVER_NOTE : '';
    }
    const states = statesOf(this.pickRank, this.pickWidth);
    const pending = this.pickRank !== this.rank || this.pickWidth !== this.width;
    $('states').innerHTML = `${this.pickWidth}^${this.pickRank} = ${states.toLocaleString('en-US')} 通り`
      + `<span>${pending
        ? `いまの盤面は ${this.rank} 次元 ${this.width} マス。「この設定で作る」で切り替わります`
        : 'すべての状態に行ける迷路'}</span>`;
  }

  #initEvents() {
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-reset').addEventListener('click', () => this.requestReset());
    $('btn-hint').addEventListener('click', () => this.hint());
    $('btn-new').addEventListener('click', () => this.requestNewGame());
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-apply').addEventListener('click', async () => {
      if (!await this.#confirmDiscard('この設定で作り直しますか？', 'この設定で作る')) return;
      // ここで初めて盤面の大きさを入れ替える
      this.rank = this.pickRank;
      this.width = this.pickWidth;
      this.newGame({ seed: $('seed').value.trim() });
    });
    $('btn-again').addEventListener('click', () => {
      $('win').classList.add('hidden');
      this.newGame({ seed: randomSeedString() });
    });
    $('btn-close').addEventListener('click', () => $('win').classList.add('hidden'));

    // タブを閉じる・別のアプリへ移る瞬間は、待たずに書き込む
    window.addEventListener('pagehide', () => this.#saveNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.#saveNow();
    });

    window.addEventListener('keydown', (e) => {
      // 確認ダイアログや引き出しが開いている間は盤面を操作しない。
      if (isDialogOpen() || document.body.classList.contains('menu-open')) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const n = this.maze.rank;
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': this.select((this.selected + n - 1) % n); break;
        case 'ArrowDown': case 'KeyS': this.select((this.selected + 1) % n); break;
        case 'ArrowLeft': case 'KeyA': this.move(this.selected, -1); break;
        case 'ArrowRight': case 'KeyD': this.move(this.selected, 1); break;
        case 'KeyZ': this.undo(); break;
        case 'KeyR': this.requestReset(); break;
        case 'KeyH': this.hint(); break;
        case 'KeyN': this.requestNewGame(); break;
        case 'KeyV': this.toggleSound(); break;
        default: {
          const d = e.code.match(/^Digit([1-9])$/);
          if (d) this.select(Math.min(n - 1, Number(d[1]) - 1));
          return;
        }
      }
      e.preventDefault();
    });
  }

  // ------------------------------------------------------------------ 出題

  async newGame({ seed, restore = null }) {
    $('win').classList.add('hidden');
    // 大きい盤面は生成に数百 ms かかる。先に表示を更新して 1 フレーム描かせる。
    if (statesOf(this.rank, this.width) > 100_000) {
      $('states').textContent = '生成中…';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    this.seedText = seed || randomSeedString();
    $('seed').value = this.seedText;
    const puzzle = makeCoordPuzzle({ rank: this.rank, width: this.width, seedText: this.seedText });
    this.maze = puzzle.maze;
    this.par = puzzle.par;
    this.detour = puzzle.detour;
    this.start = this.maze.start;      // 全次元 0
    this.goal = this.maze.goal;        // 全次元 width-1
    this.visited = new Set();
    this.#buildBoard();
    this.reset(true);
    // 迷路はシードと大きさから決まるので、par が合っていれば同じ迷路。
    // (作り方を変えたあとの古い保存を、そのまま当てはめないための確認)
    if (restore && restore.par === this.par) this.#restoreProgress(restore);
    this.#syncOptions();
    this.#save();
  }

  /**
   * 保存しておいた進みぐあいを今の盤面に当てはめる。
   * 少しでもおかしければ何もしない (スタート地点のまま始まる)。
   */
  #restoreProgress(s) {
    const { rank, dims } = this.maze;
    if (!Array.isArray(s.pos) || s.pos.length !== rank) return;
    if (!s.pos.every((c, a) => Number.isInteger(c) && c >= 0 && c < dims[a])) return;

    this.pos = [...s.pos];
    this.moves = Number.isFinite(s.moves) ? s.moves : 0;
    this.elapsed = Number.isFinite(s.elapsed) ? s.elapsed : 0;
    this.history = Array.isArray(s.history)
      ? s.history.filter((h) => Array.isArray(h) && h.length === 2).map(([axis, sign]) => ({ axis, sign }))
      : [];
    this.selected = Number.isInteger(s.selected) && s.selected < rank ? s.selected : 0;
    if (Array.isArray(s.visited)) for (const i of s.visited) this.visited.add(i);
    this.visited.add(this.cell);
    // 時計は止まっていたぶんを数えない。次の 1 手から続きを刻む。
    this.startedAt = this.moves > 0 ? performance.now() - this.elapsed * 1000 : null;
    this.render();
  }

  // ------------------------------------------------------------------ 保存

  /** 少し待ってから保存する (1 手ごとに書き込まない)。 */
  #save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.#saveNow(), 300);
  }

  #saveNow() {
    clearTimeout(this.saveTimer);
    // 解き終わった盤面は覚えておかない。次に開いたら新しい問題から。
    if (this.won) { clearGame(); return; }
    saveGame({
      seed: this.seedText, rank: this.rank, width: this.width, par: this.par,
      pos: this.pos, moves: this.moves, elapsed: this.elapsed,
      history: this.history, visited: this.visited, selected: this.selected,
    });
  }

  #buildBoard() {
    if (this.board) this.board.destroy();
    this.board = new CoordBoard($('board'), {
      rank: this.rank,
      width: this.width,
      onMove: (axis, sign) => this.move(axis, sign),
      onSelect: (axis) => this.select(axis),
      // 盤面の下には操作ボタンが来る。そのぶんを空けて、画面に収まる大きさにする。
      spaceBelow: () => document.querySelector('.controls').getBoundingClientRect().height + 22,
    });
  }

  // ------------------------------------------------------------------ 操作

  get cell() { return this.maze.index(this.pos); }

  /** ボタンと R キーから呼ぶ「最初から」。進めた手があるときだけ確認する。 */
  async requestReset() {
    if (this.moves === 0) { this.reset(); return; }
    const ok = await confirmDialog({
      title: '最初からやり直しますか？',
      body: `いま ${this.moves} 手まで進んでいます。スタート地点に戻り、手数と`
          + '通ったことのある印が消えます（迷路そのものは同じままです）。',
      okLabel: '最初からにする',
    });
    if (ok) this.reset();
  }

  /** ボタンと N キーから呼ぶ「別の問題」。進めた手があるときだけ確認する。 */
  async requestNewGame() {
    if (!await this.#confirmDiscard('別の問題にしますか？', '別の問題にする')) return;
    this.newGame({ seed: randomSeedString() });
  }

  /** 進みぐあいが消える操作の前に一度だけ止める。まだ 1 手も進めていなければ素通り。 */
  #confirmDiscard(title, okLabel) {
    if (this.moves === 0 || this.won) return Promise.resolve(true);
    return confirmDialog({
      title,
      body: `いま ${this.moves} 手まで進んでいます。今の迷路と進みぐあいは消えて、`
          + '別の迷路になります（この操作は元に戻せません）。',
      okLabel,
    });
  }

  reset(fresh = false) {
    this.pos = Array(this.maze.rank).fill(0);
    this.history = [];
    this.moves = 0;
    this.elapsed = 0;
    this.startedAt = null;
    this.won = false;
    if (fresh) this.selected = 0;
    // 通った印も消す。まっさらな状態から解き直せるように。
    this.visited = new Set([this.start]);
    this.render();
  }

  select(a) {
    this.selected = a;
    this.render();
  }

  move(axis, sign) {
    if (this.won) return;
    this.selected = axis;
    if (!this.maze.isOpen(this.cell, axis, sign)) {
      // 壁。動かないことが分かるように一瞬だけ反応させる。
      sound.blocked();
      this.board.bump(axis);
      this.render();
      return;
    }
    if (this.startedAt === null) this.startedAt = performance.now();
    this.pos[axis] += sign;
    this.moves++;
    this.history.push({ axis, sign });
    this.visited.add(this.cell);
    sound.move(axis, sign);
    this.render();
    if (this.pos.every((c, a) => c === this.maze.dims[a] - 1)) this.#win();
  }

  undo() {
    if (this.won || this.history.length === 0) return;
    const last = this.history.pop();
    this.pos[last.axis] -= last.sign;
    this.moves = Math.max(0, this.moves - 1);
    this.selected = last.axis;
    sound.undo();
    this.render();
  }

  toggleSound() {
    const on = sound.toggle();
    $('btn-sound').classList.toggle('on', on);
    $('btn-sound').innerHTML = `効果音 ${on ? 'ON' : 'OFF'} <kbd>V</kbd>`;
  }

  hint() {
    const step = this.maze.nextStep(this.cell, this.goal);
    if (!step) return;
    const [axis, sign] = step;
    this.select(axis);
    sound.hint();
    this.board.flash(axis, this.pos[axis] + sign);
  }

  #win() {
    this.won = true;
    clearGame();
    sound.win();
    if (this.startedAt !== null) this.elapsed = (performance.now() - this.startedAt) / 1000;
    $('win-moves').textContent = `${this.moves}`;
    $('win-par').textContent = `${this.par}`;
    $('win-time').textContent = fmt(this.elapsed);
    $('win-seed').textContent = this.seedText;
    $('win').classList.remove('hidden');
  }

  #tick() {
    if (this.startedAt !== null && !this.won) {
      this.elapsed = (performance.now() - this.startedAt) / 1000;
      $('timer').textContent = fmt(this.elapsed);
    }
  }

  // ------------------------------------------------------------------ 描画

  render() {
    const here = this.cell;
    const candidates = [];
    // 次元の数は必ず「今ある迷路」から読む。設定パネルの選択は別物。
    for (let a = 0; a < this.maze.rank; a++) {
      for (const sign of [1, -1]) {
        const to = this.maze.neighbor(here, a, sign);
        if (to >= 0) candidates.push({ axis: a, sign, seen: this.visited.has(to) });
      }
    }
    this.board.render({ pos: this.pos, selected: this.selected, candidates });

    $('moves').textContent = `${this.moves}`;
    $('seen').textContent = `${this.visited.size} / ${this.maze.reachable.toLocaleString('en-US')}`;
    $('coord').textContent = `(${this.pos.join(', ')})`;
    this.#save();
  }
}

/**
 * 狭い画面では、ルール・設定・説明を右から出る引き出しにしまう。
 * 盤面と操作ボタンだけの画面にして、必要なときだけ開く。
 */
function installMenu() {
  const body = document.body;
  const btn = $('btn-menu');
  const open = (on) => {
    body.classList.toggle('menu-open', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) $('side').scrollTop = 0;
  };
  btn.addEventListener('click', () => open(!body.classList.contains('menu-open')));
  $('btn-menu-close').addEventListener('click', () => open(false));
  $('scrim').addEventListener('click', () => open(false));
  // 設定を反映したら用は済んでいるので閉じる
  $('btn-apply').addEventListener('click', () => open(false));
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') open(false); });
}

/**
 * 狭い画面では右カラムの説明をたたんでおく (設定はいつでも開いたまま)。
 * 畳み直すのは画面幅が変わったときだけ。自分で開いたものを勝手に閉じない。
 */
function foldSections() {
  const narrow = window.matchMedia('(max-width: 700px)');
  const apply = () => {
    for (const d of document.querySelectorAll('details.sec')) {
      d.open = !narrow.matches || d.dataset.keep === 'open';
    }
  };
  apply();
  narrow.addEventListener('change', apply);
}

installStarfield();
armSound();
installMenu();
foldSections();
window.coordMaze = new CoordMaze();
