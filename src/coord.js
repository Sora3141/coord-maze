import { makeCoordPuzzle } from './mazend.js';
import { randomSeedString } from './rng.js';
import { CoordBoard } from './coordboard.js';
import { confirmDialog, isDialogOpen } from './ui.js';
import { installStarfield } from './starfield.js';
import { sound, armSound } from './sound.js';

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WIDTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// 状態数 = マス数 ^ 次元数 で爆発する。この上限なら生成はブラウザで 1 秒ほど。
// 超える組み合わせはボタンを押せなくする。
const MAX_STATES = 1_200_000;
const statesOf = (rank, width) => width ** rank;

const $ = (id) => document.getElementById(id);

const fmt = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

class CoordMaze {
  constructor() {
    this.rank = 4;
    this.width = 4;
    this.selected = 0;
    this.#initOptions();
    this.#initEvents();
    $('seed').value = randomSeedString();
    $('btn-sound').classList.toggle('on', sound.enabled);
    $('btn-sound').innerHTML = `効果音 ${sound.enabled ? 'ON' : 'OFF'} <kbd>V</kbd>`;
    this.newGame({ seed: $('seed').value });
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
    build($('opt-rank'), RANKS, (v) => { this.rank = v; });
    build($('opt-width'), WIDTHS, (v) => { this.width = v; });
    this.#syncOptions();
  }

  /**
   * 選択状態を塗り直し、状態数が上限を超える組み合わせを押せなくする。
   * 次元数を上げたことで今のマス数が使えなくなったときは、使える最大に落とす。
   */
  #syncOptions() {
    if (statesOf(this.rank, this.width) > MAX_STATES) {
      const fit = WIDTHS.filter((w) => statesOf(this.rank, w) <= MAX_STATES);
      this.width = fit.length ? fit[fit.length - 1] : WIDTHS[0];
    }
    for (const el of $('opt-rank').children) {
      const v = Number(el.dataset.v);
      el.classList.toggle('on', v === this.rank);
      el.disabled = statesOf(v, WIDTHS[0]) > MAX_STATES;
    }
    for (const el of $('opt-width').children) {
      const v = Number(el.dataset.v);
      el.classList.toggle('on', v === this.width);
      el.disabled = statesOf(this.rank, v) > MAX_STATES;
    }
    $('states').textContent =
      `${this.width}^${this.rank} = ${statesOf(this.rank, this.width).toLocaleString('en-US')} 状態`;
  }

  #initEvents() {
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-reset').addEventListener('click', () => this.requestReset());
    $('btn-hint').addEventListener('click', () => this.hint());
    $('btn-new').addEventListener('click', () => this.newGame({ seed: randomSeedString() }));
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-apply').addEventListener('click', () => this.newGame({ seed: $('seed').value.trim() }));
    $('btn-again').addEventListener('click', () => {
      $('win').classList.add('hidden');
      this.newGame({ seed: randomSeedString() });
    });
    $('btn-close').addEventListener('click', () => $('win').classList.add('hidden'));

    window.addEventListener('keydown', (e) => {
      // 確認ダイアログが開いている間は盤面を操作しない。
      if (isDialogOpen()) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const n = this.rank;
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': this.select((this.selected + n - 1) % n); break;
        case 'ArrowDown': case 'KeyS': this.select((this.selected + 1) % n); break;
        case 'ArrowLeft': case 'KeyA': this.move(this.selected, -1); break;
        case 'ArrowRight': case 'KeyD': this.move(this.selected, 1); break;
        case 'KeyZ': this.undo(); break;
        case 'KeyR': this.requestReset(); break;
        case 'KeyH': this.hint(); break;
        case 'KeyN': this.newGame({ seed: randomSeedString() }); break;
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

  async newGame({ seed }) {
    $('win').classList.add('hidden');
    // 大きい盤面は生成に 1 秒近くかかる。先に表示を更新して 1 フレーム描かせる。
    const heavy = statesOf(this.rank, this.width) > 100_000;
    if (heavy) {
      $('states').textContent = '生成中…';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    this.seedText = seed || randomSeedString();
    $('seed').value = this.seedText;
    const puzzle = makeCoordPuzzle({ rank: this.rank, width: this.width, seedText: this.seedText });
    this.maze = puzzle.maze;
    this.par = puzzle.par;
    this.detour = puzzle.detour;
    this.start = 0;                    // 全次元 0
    this.goal = this.maze.size - 1;    // 全次元 width-1
    this.visited = new Set();
    this.#buildBoard();
    this.reset(true);
    this.#syncOptions();

  }

  #buildBoard() {
    if (this.board) this.board.destroy();
    this.board = new CoordBoard($('board'), {
      rank: this.rank,
      width: this.width,
      onMove: (axis, sign) => this.move(axis, sign),
      onSelect: (axis) => this.select(axis),
    });
  }

  // ------------------------------------------------------------------ 操作

  get cell() { return this.maze.index(this.pos); }

  /** ボタンと R キーから呼ぶ「最初から」。進めた手があるときだけ確認する。 */
  async requestReset() {
    if (this.moves === 0) { this.reset(); return; }
    const ok = await confirmDialog({
      title: '最初からやり直しますか？',
      body: `いま ${this.moves} 手まで進んでいます。スタート地点に戻り、手数が 0 に戻ります`
          + '（迷路と、通ったことのある印はそのまま残ります）。',
      okLabel: '最初からにする',
    });
    if (ok) this.reset();
  }

  reset(fresh = false) {
    this.pos = Array(this.rank).fill(0);
    this.history = [];
    this.moves = 0;
    this.elapsed = 0;
    this.startedAt = null;
    this.won = false;
    if (fresh) this.selected = 0;
    this.visited.add(this.start);
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
    sound.move(axis, this.rank, sign);
    this.render();
    if (this.pos.every((c) => c === this.width - 1)) this.#win();
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
    for (let a = 0; a < this.rank; a++) {
      for (const sign of [1, -1]) {
        const to = this.maze.neighbor(here, a, sign);
        if (to >= 0) candidates.push({ axis: a, sign, seen: this.visited.has(to) });
      }
    }
    this.board.render({ pos: this.pos, selected: this.selected, candidates });

    $('moves').textContent = `${this.moves}`;
    $('seen').textContent = `${this.visited.size} / ${this.maze.size}`;
    $('coord').textContent = `(${this.pos.join(', ')})`;
  }
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
foldSections();
window.coordMaze = new CoordMaze();
