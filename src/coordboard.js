// 0 と紛れる 'o' は避ける。12 次元まで 1 文字で足りる。
export const LETTERS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'n'];

// マスの下限。これより小さくすると押しづらいが、
// 盤面全体が一度に見えるほうを優先する (足りなければ左右になぞって動かせる)。
const MIN_CELL = 20;

export const axisName = (a) => LETTERS[a] || `d${a}`;

// コマは行ごとに違う惑星にする (縞のガス惑星・輪のある惑星・岩石惑星…)。
// 色は行の色のまま、模様で「どの行か」をもう一段見分けやすくする。見た目は coord.css。
const PLANETS = 8;
export const axisHue = (a, rank) => (200 + (a / Math.max(1, rank)) * 300) % 360;
export const axisColor = (a, rank, alpha = 1) =>
  `hsl(${axisHue(a, rank)}deg 78% 62% / ${alpha})`;

/**
 * 座標迷路の盤面。1 行が 1 次元、横方向がその次元の座標で、行のコマが現在位置。
 * COORD MAZE とチュートリアルで共通で使う。
 */
export class CoordBoard {
  /**
   * @param host 描画先の要素
   * @param opts.rank 次元数 / opts.width 1 次元あたりのマス数
   * @param opts.onMove(axis, sign) コマの隣のマスがクリックされた
   * @param opts.onSelect(axis) 行がクリックされた
   * @param opts.heads 列見出しの文字列 (省略時は START / 数字 / GOAL)
   */
  constructor(host, opts) {
    this.host = host;
    this.rank = opts.rank;
    this.width = opts.width;
    this.onMove = opts.onMove || (() => {});
    this.onSelect = opts.onSelect || (() => {});
    this.heads = opts.heads;
    // 盤面の下に残しておきたい高さ (操作ボタンなど)。渡されたときだけ縦にも収める。
    this.spaceBelow = opts.spaceBelow || null;
    this.pos = Array(this.rank).fill(0);
    this.swiped = false;
    this.#build();
    this.fit();
    this.#watchSize();
  }

  #build() {
    const { rank, width } = this;
    this.host.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'colhead';
    this.headCells = [];
    for (let c = 0; c < width; c++) {
      const d = document.createElement('div');
      d.textContent = this.heads ? this.heads[c]
        : c === 0 ? 'START' : c === width - 1 ? 'GOAL' : `${c}`;
      d.className = c === 0 ? 's' : c === width - 1 ? 'g' : '';
      head.appendChild(d);
      this.headCells.push(d);
    }
    this.head = head;
    this.host.appendChild(head);

    this.rows = [];
    for (let a = 0; a < rank; a++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.setProperty('--rowc', axisColor(a, rank));
      row.addEventListener('click', () => { if (!this.#tookSwipe()) this.onSelect(a); });
      this.#addSwipe(row, a);

      const label = document.createElement('div');
      label.className = 'rowlabel';
      label.textContent = axisName(a);
      row.appendChild(label);

      const track = document.createElement('div');
      track.className = 'track';
      const cells = [];
      for (let c = 0; c < width; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (c === 0 ? ' start' : c === width - 1 ? ' goal' : '');
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.#tookSwipe()) return;
          const d = c - this.pos[a];
          if (Math.abs(d) === 1) this.onMove(a, d); else this.onSelect(a);
        });
        track.appendChild(cell);
        cells.push(cell);
      }
      const token = document.createElement('div');
      token.className = 'token';
      // 動いたときに一瞬だけ出す尾 (彗星のような光跡) と、惑星そのもの
      const trail = document.createElement('b');
      trail.className = 'trail';
      const planet = document.createElement('i');
      planet.className = `planet p${a % PLANETS}`;
      token.append(trail, planet);
      track.appendChild(token);
      row.appendChild(track);
      this.host.appendChild(row);
      this.rows.push({ row, cells, token });
    }
  }

  // ------------------------------------------------------ 画面幅に合わせる

  /**
   * セルの大きさを画面幅から決める。スマホでは横スクロールさせずに
   * 盤面全体が一目で入ることを優先し、それでも入らないときだけ横に流す。
   */
  fit() {
    const { width } = this;
    const cs = getComputedStyle(this.host);
    const gap = parseFloat(cs.getPropertyValue('--gap')) || 8;
    const label = parseFloat(cs.getPropertyValue('--label')) || 34;
    const rowGap = parseFloat(cs.getPropertyValue('--rowgap')) || 12;
    // 盤面は inline-flex で内容ぶんしか広がらないので、置き場所の幅から測る。
    const box = this.host.parentElement;
    const bs = box ? getComputedStyle(box) : null;
    const outer = box
      ? box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight)
      : window.innerWidth;
    // 軸名とその釣り合いぶん (左右) を引いた残りが、マス目に使える幅。
    const inner = outer
      - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
      - (label + rowGap) * 2;

    // 縦にも収める。行が多いと画面からはみ出して、盤面を一度に見渡せなくなる。
    // spaceBelow (盤面の下に残しておきたい高さ) を渡されたときだけ効かせる。
    const roomByHeight = this.spaceBelow ? this.#fitHeight(cs, gap) : Infinity;

    // マス数が多いときは大きくしすぎない。
    const max = width >= 11 ? 34 : width >= 9 ? 42 : width >= 7 ? 50 : 58;
    const room = Math.floor((inner - gap * (width - 1)) / width);
    const cell = Math.max(MIN_CELL, Math.min(max, room, roomByHeight));
    this.host.style.setProperty('--cell', `${cell}px`);

    // マスが小さいときは、列見出しを詰める (START が隣の列にはみ出すため)
    const tight = cell < 38;
    if (!this.heads) {
      for (let c = 0; c < width; c++) {
        this.headCells[c].textContent = c === 0 ? (tight ? 'S' : 'START')
          : c === width - 1 ? (tight ? 'G' : 'GOAL') : `${c}`;
      }
    }

    // 収まりきらず横スクロールになる場合は、スワイプを指のスクロールに譲る。
    const overflow = cell * width + gap * (width - 1) > inner + 1;
    this.host.classList.toggle('scrolls', overflow);
    this.swipeEnabled = !overflow;
  }

  /** 縦に入るマスの大きさ。画面の下端までの残りから割り出す。 */
  #fitHeight(cs, gap) {
    const below = typeof this.spaceBelow === 'function' ? this.spaceBelow() : this.spaceBelow;
    // ページを一番上まで戻したときの、盤面の上端の位置で測る
    // (今のスクロール位置で測ると、スクロールするたびに大きさが変わってしまう)
    const top = this.host.getBoundingClientRect().top + window.scrollY;
    const headH = this.head ? this.head.getBoundingClientRect().height + 6 : 0;
    const avail = window.innerHeight - top - below - headH
      - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    return Math.floor((avail - gap * (this.rank - 1)) / this.rank);
  }

  /** 作り直すときに呼ぶ。監視を残さない。 */
  destroy() {
    if (this.ro) this.ro.disconnect();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
  }

  #watchSize() {
    const box = this.host.parentElement;
    if (box && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(box);
    }
    // 高さだけが変わるとき (画面の回転、URL バーの出入り) は ResizeObserver では拾えない
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
  }

  // -------------------------------------------------------------- スワイプ

  /**
   * 行を左右になぞってもコマを動かせるようにする。
   * マス目が小さいスマホでは、隣のマスを正確に押すより速い。
   */
  #addSwipe(row, axis) {
    let sx = 0, sy = 0, live = false;
    row.addEventListener('pointerdown', (e) => {
      // 指でなぞったときは、そのあとに click が来ない。ここで必ず落としておかないと
      // 前のスワイプの印が残り続けて、次のタップが 1 回食べられる。
      this.swiped = false;
      live = this.swipeEnabled !== false;
      sx = e.clientX; sy = e.clientY;
    });
    row.addEventListener('pointerup', (e) => {
      if (!live) return;
      live = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      // 直後に飛んでくる click は、スワイプの結果なので食べておく。
      this.swiped = true;
      this.onMove(axis, dx > 0 ? 1 : -1);
    });
    row.addEventListener('pointercancel', () => { live = false; });
  }

  #tookSwipe() {
    if (!this.swiped) return false;
    this.swiped = false;
    return true;
  }

  /**
   * @param state.pos 各次元の現在位置
   * @param state.selected 選択中の行 (なければ -1)
   * @param state.candidates [{ axis, sign, seen }] 動かせる手。seen は既に通った状態か
   */
  render(state) {
    this.pos = state.pos;
    const goalCol = this.width - 1;
    for (let a = 0; a < this.rank; a++) {
      const { row, cells, token } = this.rows[a];
      row.classList.toggle('sel', a === state.selected);
      // 前の位置から動いた行だけ、進んだ向きに光跡を引く
      const was = this.shown ? this.shown[a] : state.pos[a];
      if (was !== state.pos[a]) {
        token.style.setProperty('--dir', state.pos[a] > was ? 1 : -1);
        token.classList.remove('fly');
        void token.offsetWidth;
        token.classList.add('fly');
      }
      token.style.setProperty('--c', state.pos[a]);
      token.classList.toggle('done', state.pos[a] === goalCol);
      for (const c of cells) c.classList.remove('can', 'fresh', 'been');
    }
    for (const cand of state.candidates || []) {
      const cell = this.rows[cand.axis].cells[state.pos[cand.axis] + cand.sign];
      if (cell) cell.classList.add('can', cand.seen ? 'been' : 'fresh');
    }
    // 次に描くときの「前の位置」。渡された配列はあとで書き換わるので写しを持つ
    this.shown = [...state.pos];
  }

  /** 壁にぶつかったことを一瞬だけ見せる。 */
  bump(axis) {
    if (navigator.vibrate) navigator.vibrate(18);
    const t = this.rows[axis].token;
    t.classList.remove('bump');
    void t.offsetWidth;
    t.classList.add('bump');
  }

  /** ヒント: 指定のマスを点滅させる。 */
  flash(axis, col) {
    const cell = this.rows[axis].cells[col];
    if (!cell) return;
    cell.classList.remove('hint');
    void cell.offsetWidth;
    cell.classList.add('hint');
  }
}
