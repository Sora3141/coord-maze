/**
 * このゲームをシェアする。
 *
 * 端末の共有メニュー (LINE・X・メッセージなど) が使えるときはそれを開き、
 * 使えないとき (多くのパソコンのブラウザ) は URL をコピーして知らせる。
 * 共有するのは公開しているページの URL。手元のサーバーで開いていても、
 * 相手が開けるほうの URL を渡す。
 */

export const SITE_URL = 'https://t-of.github.io/coord-maze/';

const DATA = {
  title: 'COORD MAZE — 座標迷路',
  text: 'N 次元迷路を、座標だけで表したパズル。10 次元まで、同じ画面で遊べます。',
  url: SITE_URL,
};

export async function shareGame() {
  if (navigator.share) {
    try {
      await navigator.share(DATA);
      return;
    } catch (e) {
      // 自分で閉じたときは何もしない。それ以外 (未対応の中身など) はコピーに回す
      if (e && e.name === 'AbortError') return;
    }
  }
  if (await copyText(`${DATA.text}\n${DATA.url}`)) {
    toast('リンクをコピーしました');
  } else {
    // コピーもできない環境では、選んでコピーしてもらう
    window.prompt('このリンクをコピーしてシェアしてください', DATA.url);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http で開いたときなど、clipboard が使えないときの昔ながらのやり方
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** 画面の下に一瞬だけ出す知らせ。 */
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

/** data-share の付いたボタンを、押すとシェアするようにする。 */
export function installShare() {
  for (const b of document.querySelectorAll('[data-share]')) {
    b.addEventListener('click', () => shareGame());
  }
}
