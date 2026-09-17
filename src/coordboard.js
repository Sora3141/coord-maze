// 0 と紛れる 'o' は避ける。12 次元まで 1 文字で足りる。
export const LETTERS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'n'];

export const axisName = (a) => LETTERS[a] || `d${a}`;
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
    this.pos = Array(this.rank).fill(0);
    this.#build();
  }

  #build() {
    const { rank, width } = this;
    this.host.innerHTML = '';
    // マス数が多いときはセルを小さくする。横スクロールさせるより一覧できる方がよい。
    this.host.style.setProperty('--cell',
      width >= 11 ? '34px' : width >= 9 ? '42px' : width >= 7 ? '50px' : '58px');

    const head = document.createElement('div');
    head.className = 'colhead';
    for (let c = 0; c < width; c++) {
      const d = document.createElement('div');
      d.textContent = this.heads ? this.heads[c]
        : c === 0 ? 'START' : c === width - 1 ? 'GOAL' : `${c}`;
      d.className = c === 0 ? 's' : c === width - 1 ? 'g' : '';
      head.appendChild(d);
    }
    this.host.appendChild(head);

    this.rows = [];
    for (let a = 0; a < rank; a++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.setProperty('--rowc', axisColor(a, rank));
      row.addEventListener('click', () => this.onSelect(a));

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
          const d = c - this.pos[a];
          if (Math.abs(d) === 1) this.onMove(a, d); else this.onSelect(a);
        });
        track.appendChild(cell);
        cells.push(cell);
      }
      const token = document.createElement('div');
      token.className = 'token';
      track.appendChild(token);
      row.appendChild(track);
      this.host.appendChild(row);
      this.rows.push({ row, cells, token });
    }
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
      token.style.setProperty('--c', state.pos[a]);
      token.classList.toggle('done', state.pos[a] === goalCol);
      for (const c of cells) c.classList.remove('can', 'fresh', 'been');
    }
    for (const cand of state.candidates || []) {
      const cell = this.rows[cand.axis].cells[state.pos[cand.axis] + cand.sign];
      if (cell) cell.classList.add('can', cand.seen ? 'been' : 'fresh');
    }
  }

  /** 壁にぶつかったことを一瞬だけ見せる。 */
  bump(axis) {
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
